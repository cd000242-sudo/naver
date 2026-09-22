import { describe, expect, it } from 'vitest';
import { normalizeNumbers, normalizeDates, buildAllowedValues, quoteSupported, isAdjacentDay } from '../quality/critique/claimNormalize';
import { scanHighRiskClaims, mergeSeedsWithCritic, introducedUnsupportedValues } from '../quality/critique/claimScanner';
import { isIntegrityIssue, splitByLayer } from '../quality/critique/issueTaxonomy';
import { buildArticleModel } from '../quality/critique/sectionModel';
import { buildEvidencePack, evidenceCorpus, EVIDENCE_PER_DOC_CHARS } from '../quality/critique/evidence';
import { runQualityLoop } from '../quality/critique/orchestrator';
import { buildJudgePrompt } from '../quality/critique/finalJudge';
import { buildEditorPrompt } from '../quality/critique/editorPrompts';
import { policyArticle, policyDocuments, scriptedRoutes, stagesOf, S2_TEXT, S3_TEXT, PASS_JSON } from './critiqueLoopFixtures';
import type { QualityIssue } from '../quality/critique/types';

// [2026-09-23 Quality Fix 1] Writer grounding support: canonical claim values, the deterministic
// high-risk claim scanner (seeds only, no deletion), seed/Critic merge, Editor specificity
// preservation (items 23/24) and terminal reconciliation (items 32–35). All offline, 0 model calls.

const baseInput = (routes: ReturnType<typeof scriptedRoutes>, extra: Partial<Parameters<typeof runQualityLoop>[0]> = {}) => ({
  content: policyArticle(), keyword: '2026 청년도약계좌 조건', contentMode: 'seo', topicType: 'POLICY',
  sourceDocuments: policyDocuments(), rawCorpus: '', sourceBased: true, jsonComplete: true, outputTruncated: false,
  relatedKeywords: [], relatedKeywordsAreLlmExpanded: false, baseCalls: 1,
  resolveRoute: routes.resolveRoute, log: () => undefined, now: new Date('2026-09-23T10:00:00+09:00'),
  ...extra,
});
const issueJson = (issues: unknown[], status = 'REVISION_REQUIRED') => JSON.stringify({ status, issues, researchQueries: [] });
const resolveAll = (prompt: string) => JSON.stringify({ resolved: [...prompt.matchAll(/issueKey=([0-9a-f]{12})/g)].map((m) => m[1]), stillOpen: [], newIssues: [] });
const issueOf = (p: Partial<QualityIssue>): QualityIssue => ({
  issueKey: 'k', severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: 's1', exactSpan: '', operation: 'REPLACE', evidenceIds: [], problem: '', requiredChange: '', state: 'OPEN', origin: 'critic', round: 1, ...p,
});

describe('claim normalization (item 14/15)', () => {
  it('numbers: comma, 만/천 mixed forms, ranges and particles all map to one canonical token', () => {
    expect(normalizeNumbers('15,000원 1만5000원 15000원 1.5만원까지')).toEqual(['15000원']);
    expect(normalizeNumbers('3천 명 3000명이')).toEqual(['3000명']);
    expect(new Set(normalizeNumbers('금리 2.3~3.1% 사이'))).toEqual(new Set(['2.3%', '3.1%']));
    expect(normalizeNumbers('최고 연 6.0% 안팎')).toEqual(['6%']);
  });
  it('dates: ranges (~ ∼ 부터…까지), ISO and year-month forms', () => {
    expect(new Set(normalizeDates('10월 16~22일'))).toEqual(new Set(['10월16일', '10월22일']));
    expect(new Set(normalizeDates('10월 16∼22일 제107회'))).toEqual(new Set(['10월16일', '10월22일']));
    expect(new Set(normalizeDates('10월 16일부터 22일까지'))).toEqual(new Set(['10월16일', '10월22일']));
    expect(normalizeDates('2026-09-22')).toEqual(['9월22일']);
    expect(isAdjacentDay('10월23일', new Set(['10월22일']))).toBe(true);
  });
  it('quotes: attributed quote is supported when the material carries it (endings may differ)', () => {
    const allowed = buildAllowedValues('취업준비생 정모(26)씨는 "예·적금만으로 돈을 불리기 쉽지 않은 세상"이라고 표현했다.');
    expect(quoteSupported('예·적금만으로 돈을 불리기 쉽지 않은 세상', allowed)).toBe(true);
    expect(quoteSupported('전혀 다른 문장이 들어간 인용문입니다', allowed)).toBe(false);
  });
});

describe('high-risk claim scanner (items 11–18) — seeds only', () => {
  const corpus = `${policyDocuments().map((d) => d.body).join(' ')} ${'추가 자료 문장. '.repeat(40)}`;
  const article = (s2: string) => buildArticleModel(policyArticle({
    headings: policyArticle().headings.map((h, i) => (i === 1 ? { ...h, content: s2 } : h)),
    bodyPlain: policyArticle().bodyPlain.replace(S2_TEXT, s2),
  }));

  it('flags an unsupported date, survey figure, attributed quote and org list as MAJOR seeds; never edits the text', () => {
    const model = article(`${S2_TEXT} 2차 모집은 11월 3일까지입니다. 금융위 설문에서 응답자의 77%가 갈아탔습니다. 국토교통부 관계자는 "내년에 확대한다"고 말했다.`);
    const seeds = scanHighRiskClaims(model, corpus);
    expect(seeds.map((s) => [s.type, s.severity])).toEqual(expect.arrayContaining([
      ['UNSUPPORTED_VALUE', 'MAJOR'], ['UNSUPPORTED_QUOTE', 'MAJOR'], ['UNSUPPORTED_ENTITY', 'MAJOR'],
    ]));
    expect(seeds.find((s) => s.problem.includes('11월3일'))).toBeDefined();
    expect(seeds.find((s) => s.problem.includes('설문/통계') && s.problem.includes('77%'))).toBeDefined();
    expect(seeds.every((s) => s.origin === 'precheck' && s.evidenceIds.length === 0)).toBe(true);
    expect(model.sections[2].text).toContain('77%'); // scanner does not delete
  });
  it('does not flag supported values, derived arithmetic (MINOR hint only), adjacent-day dates or unattributed short quotes', () => {
    const model = article(`${S2_TEXT} 5년이면 60번 납입합니다. 10월 17일 이후에 신청해도 됩니다. '갈아타기' 라는 말이 유행입니다. 2026년 10월에 시작합니다.`);
    const seeds = scanHighRiskClaims(model, `${corpus} 접수는 10월 16일까지.`);
    expect(seeds.filter((s) => s.severity === 'MAJOR')).toEqual([]);
    expect(seeds.filter((s) => s.severity === 'MINOR').map((s) => s.problem).join(' ')).toContain('60번');
  });
  it('returns nothing when the corpus is too thin to judge', () => {
    expect(scanHighRiskClaims(article(`${S2_TEXT} 11월 3일까지입니다.`), '짧은 자료')).toEqual([]);
  });

  it('live 20260922-195843: a range built on a real end-date is a derived bucket, not a fabricated date', () => {
    // Corpus without the policy dates: only 10월 18일 / 10월 31일 are real.
    const travelCorpus = `특별기획전은 10월 18일까지 이어진다. 열린 관광 페스타는 9월 1일부터 10월 31일까지 열린다. ${'제주 여행 안내 문장입니다. '.repeat(40)}`;
    const withTable = article(`${S2_TEXT}\n| 10월 12~18일 | 김창열미술관 특별기획전 |\n| 10월 19~31일 | 열린 관광 페스타 |`);
    // s2 only: the fixture's other sections carry policy dates this travel corpus does not have.
    expect(scanHighRiskClaims(withTable, travelCorpus).filter((s) => s.severity === 'MAJOR' && s.sectionId === 's2')).toEqual([]);
    // A range anchored to nothing stays a seed.
    const invented = article(`${S2_TEXT}\n| 10월 16~22일 | 제107회 전국체육대회 |`);
    const seeds = scanHighRiskClaims(invented, travelCorpus).filter((s) => s.severity === 'MAJOR');
    expect(seeds.find((s) => s.problem.includes('10월16일') && s.problem.includes('10월22일'))).toBeDefined();
  });

  it('live 20260922-201400/194812: an article-publish date reused as an event date is caught', () => {
    const leaked = article(`${S2_TEXT} 서귀포시는 9월 7일 무료 개방을 알렸습니다.`);
    const corpusWithIsoMeta = `${corpus} 게시일: 2026-09-07 | KNOWN. 무료 개방은 9월 1일부터 진행된다.`;
    const seeds = scanHighRiskClaims(leaked, corpusWithIsoMeta).filter((s) => s.severity === 'MAJOR');
    expect(seeds).toHaveLength(1);
    expect(seeds[0].problem).toContain('9월7일');
  });

  it('item 21: a revision that introduces a new unsupported value is detected', () => {
    const before = article(S2_TEXT);
    const after = article(`${S2_TEXT} 신청은 11월 3일까지입니다. 국토교통부 관계자는 "확대한다"고 말했다.`);
    const introduced = introducedUnsupportedValues(before, after, corpus, ['s2']);
    expect(introduced).toEqual(expect.arrayContaining(['11월3일']));
    expect(introducedUnsupportedValues(before, before, corpus, ['s2'])).toEqual([]);
  });
  it('merge: the Critic issue wins for the same claim, seeds for missed claims are kept (item 19)', () => {
    const model = article(`${S2_TEXT} 2차 모집은 11월 3일까지입니다. 이자는 연 9.9%입니다.`);
    const seeds = scanHighRiskClaims(model, corpus);
    const critic = [issueOf({ sectionId: 's2', exactSpan: '2차 모집은 11월 3일까지입니다.', evidenceIds: ['S01'] })];
    const merged = mergeSeedsWithCritic(seeds, critic, corpus);
    expect(merged.coveredSeeds.map((s) => s.problem)).toEqual([expect.stringContaining('11월3일')]);
    expect(merged.keptSeeds.map((s) => s.severity)).toEqual(['MINOR']);
  });
});

describe('evidence scope (root cause of the live false positives)', () => {
  it('carries the full cleaned body up to the writer cap, not a 700-char excerpt, and the extra material in the corpus', () => {
    const long = { ...policyDocuments()[0], body: `${'앞부분 문장. '.repeat(120)}특별기획전은 10월 18일까지 이어져 추석 이후에도 감상할 수 있다.` };
    const pack = buildEvidencePack([long], '제주', '', { extraMaterial: '블루프린트 인용: "예·적금만으로 돈을 불리기 쉽지 않은 세상"' });
    expect(pack.items[0].excerpt.length).toBeGreaterThan(700);
    expect(pack.items[0].excerpt.length).toBeLessThanOrEqual(EVIDENCE_PER_DOC_CHARS);
    expect(pack.items[0].excerpt).toContain('10월 18일까지');
    expect(evidenceCorpus(pack)).toContain('블루프린트 인용');
  });
});

describe('input bounds (freeze check) — EVIDENCE_COMPLETE + INPUT_BOUNDED', () => {
  const manyDocs = () => Array.from({ length: 8 }, (_, i) => ({
    ...policyDocuments()[0],
    id: `S0${i + 1}`,
    title: `자료 ${i + 1}`,
    body: `${i + 1}번 자료입니다. ${'긴 본문 문장이 이어집니다. '.repeat(260)}끝 문장 ${i + 1}번.`,
  }));

  it('every accepted document keeps a readable share — a sequential budget dropped the last ones', () => {
    const pack = buildEvidencePack(manyDocs(), '키워드');
    expect(pack.items).toHaveLength(8);
    for (const item of pack.items) {
      expect(item.excerpt.length).toBeGreaterThanOrEqual(1200);
      expect(item.excerpt.length).toBeLessThanOrEqual(EVIDENCE_PER_DOC_CHARS);
    }
    const total = pack.items.reduce((n, it) => n + it.excerpt.length, 0);
    expect(total).toBeLessThanOrEqual(24000);
    // The last document must not be starved of budget.
    expect(pack.items[7].excerpt.length).toBe(pack.items[0].excerpt.length);
  });

  it('the Judge prompt prints every accepted document — no blunt 6,000-char cut', () => {
    const pack = buildEvidencePack(manyDocs(), '키워드');
    const model = buildArticleModel(policyArticle());
    const prompt = buildJudgePrompt(
      { today: '2026-09-23', keyword: '키워드', contentMode: 'seo', topicType: 'POLICY', searchIntent: '의도', hashtags: [], precheckHardStops: [] },
      model,
      pack,
    );
    for (const item of pack.items) expect(prompt, `${item.id} 가 Judge 입력에서 빠졌다`).toContain(`[${item.id}] `);
    expect(prompt).toContain('8번 자료입니다.'); // the last document's body, not just its header
    // Bounded: evidence + article + contract, not the Writer's 45K-token prompt.
    expect(prompt.length).toBeLessThan(40000);
  });

  it('Editor and Verification stay on the cited documents only', () => {
    const pack = buildEvidencePack(manyDocs(), '키워드');
    const model = buildArticleModel(policyArticle());
    const issue = issueOf({ sectionId: 's2', exactSpan: '우대형 12%가 붙습니다', evidenceIds: ['S01'] });
    const ctx = { today: '2026-09-23', keyword: '키워드', title: model.title, searchIntent: '의도' };
    const editor = buildEditorPrompt(ctx, model, ['s2'], [issue], pack);
    expect(editor).toContain('[S01] ');
    expect(editor).not.toContain('[S08] ');
    expect(editor.length).toBeLessThan(12000);
  });
});

describe('editor specificity (items 22–24)', () => {
  const dated = () => policyArticle({
    headings: policyArticle().headings.map((h, i) => (i === 2 ? { ...h, content: `${S3_TEXT} 체전은 10월 16~22일에 열립니다.` } : h)),
    bodyPlain: policyArticle().bodyPlain.replace(S3_TEXT, `${S3_TEXT} 체전은 10월 16~22일에 열립니다.`),
  });
  const docsWithRange = () => [{ ...policyDocuments()[0], body: `${policyDocuments()[0].body} 전국체육대회는 10월 16일부터 22일까지 열린다.` }, policyDocuments()[1]];

  it('23: a SUPPORTED exact value weakened to "10월 중" by an unrelated edit is rejected', async () => {
    const routes = scriptedRoutes({
      critic: () => issueJson([{ severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: 's3', exactSpan: '은행 앱에서 신청하고', operation: 'REPLACE', evidenceIds: ['S01'], problem: 'x', requiredChange: 'y' }]),
      revision: () => JSON.stringify({ sections: [{ sectionId: 's3', text: `${S3_TEXT.replace('은행 앱에서 신청하고', '은행 앱으로 신청하고')} 체전은 10월 중에 열립니다.` }], patchedIssueKeys: [] }),
      verification: resolveAll,
    });
    const out = await runQualityLoop(baseInput(routes, { content: dated(), sourceDocuments: docsWithRange() }));
    expect(out.content.headings[2].content).toContain('10월 16~22일');
    expect(out.summary.manualReviewReasons.join(' ')).toMatch(/PRESERVATION_VIOLATION.*날짜 유실/);
  });
  it('24: an UNSUPPORTED exact value may be removed', async () => {
    const routes = scriptedRoutes({
      critic: () => issueJson([{ severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: 's3', exactSpan: '체전은 10월 16~22일에 열립니다.', operation: 'REMOVE', evidenceIds: ['S01'], problem: '자료에 없음', requiredChange: '뺀다' }]),
      revision: () => JSON.stringify({ sections: [{ sectionId: 's3', text: S3_TEXT }], patchedIssueKeys: [] }),
      verification: resolveAll,
    });
    const out = await runQualityLoop(baseInput(routes, { content: dated() }));
    expect(out.content.headings[2].content).toBe(S3_TEXT);
    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
  });
});

describe('terminal reconciliation (items 25–35)', () => {
  it('taxonomy helper splits integrity blockers from editorial issues', () => {
    expect(isIntegrityIssue(issueOf({ type: 'UNSUPPORTED_QUOTE' }))).toBe(true);
    expect(isIntegrityIssue(issueOf({ type: 'STRUCTURE', origin: 'precheck', problem: '소제목 아래 본문이 비어 있거나 30자 미만' }))).toBe(true);
    expect(isIntegrityIssue(issueOf({ type: 'TITLE_PROMISE' }))).toBe(false);
    expect(splitByLayer([issueOf({ type: 'REDUNDANCY' }), issueOf({ type: 'MIXED_ENTITY' })]).integrity).toHaveLength(1);
  });

  const stuck = (type: string) => scriptedRoutes({
    critic: () => issueJson([{ severity: 'MAJOR', type, sectionId: 's2', exactSpan: '우대형 12%가 붙습니다', operation: 'REPLACE', evidenceIds: ['S01'], problem: '남는 문제', requiredChange: 'z' }]),
    revision: (_p, n) => JSON.stringify({ sections: [{ sectionId: 's2', text: S2_TEXT.replace('붙습니다', `붙습니다 (수정 ${n})`) }], patchedIssueKeys: [] }),
    verification: (prompt) => JSON.stringify({ resolved: [], stillOpen: [/issueKey=([0-9a-f]{12})/.exec(prompt)?.[1]], newIssues: [] }),
  });

  it('34: factual OPEN after 2 cycles -> MANUAL_REVIEW even though the Judge says PASS', async () => {
    const out = await runQualityLoop(baseInput(stuck('UNSUPPORTED_VALUE')));
    expect(out.summary.judge?.decision).toBe('PASS');
    expect(out.summary.decision).toBe('MANUAL_REVIEW');
    expect(out.summary.manualReviewReasons[0]).toMatch(/UNRESOLVED_INTEGRITY_AFTER_2_CYCLES: s2\/UNSUPPORTED_VALUE/);
    expect(out.summary.terminalAdvisory).toEqual([]);
  });
  it('35 / 32 (정책 3차 shape): non-factual OPEN + Judge PASS -> terminal advisory + QUALITY_CONVERGED', async () => {
    const routes = stuck('TITLE_PROMISE');
    const out = await runQualityLoop(baseInput(routes));
    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
    expect(out.summary.terminalAdvisory).toEqual([expect.stringMatching(/TERMINAL_ADVISORY\[s2\/TITLE_PROMISE\]/)]);
    expect(out.summary.issues.find((i) => i.type === 'TITLE_PROMISE')?.state).toBe('ADVISORY');
    const judgePrompt = routes.calls.find((c) => c.stage === 'judge')?.prompt ?? '';
    expect(judgePrompt).toContain('남은 OPEN issue');
    expect(judgePrompt).toContain('TITLE_PROMISE');
  });
  it('33 (여행 3차 shape): non-factual OPEN but Judge BLOCK -> MANUAL_REVIEW stays', async () => {
    const routes = scriptedRoutes({
      ...({} as Record<string, never>),
      critic: () => issueJson([{ severity: 'MAJOR', type: 'TITLE_PROMISE', sectionId: 's2', exactSpan: '우대형 12%가 붙습니다', operation: 'REPLACE', evidenceIds: [], problem: 'p', requiredChange: 'z' }]),
      revision: () => JSON.stringify({ sections: [], patchedIssueKeys: [] }),
      judge: () => JSON.stringify({ decision: 'BLOCK', blockingIssues: [{ type: 'FACT_ERROR', sectionId: 's3', exactSpan: '10월 7일부터 16일까지', reason: '자료는 다른 기간을 말한다' }], advisory: [] }),
    });
    const out = await runQualityLoop(baseInput(routes));
    expect(out.summary.decision).toBe('MANUAL_REVIEW');
    expect(out.summary.manualReviewReasons.join(' ')).toMatch(/JUDGE_BLOCK\[s3\/FACT_ERROR\]/);
    expect(out.summary.terminalAdvisory).toEqual([]);
  });
  it('a clean article still takes the fast path with the scanner in place', async () => {
    const routes = scriptedRoutes({});
    const out = await runQualityLoop(baseInput(routes));
    expect(stagesOf(routes)).toEqual(['critic', 'editorial', 'judge']);
    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
    expect(PASS_JSON).toContain('PASS');
  });
});
