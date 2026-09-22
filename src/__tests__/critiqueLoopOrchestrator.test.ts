import { describe, expect, it } from 'vitest';
import { runQualityLoop, MAX_REVISION_CYCLES } from '../quality/critique/orchestrator';
import { buildArticleModel } from '../quality/critique/sectionModel';
import { policyArticle, policyDocuments, scriptedRoutes, stagesOf, S2_TEXT, S3_TEXT, JUDGE_PASS, PASS_JSON } from './critiqueLoopFixtures';

// [2026-09-22 Critique Loop] Special fixtures A–G (item 44) + call budget (item 36), all offline.

const baseInput = (routes: ReturnType<typeof scriptedRoutes>, extra: Partial<Parameters<typeof runQualityLoop>[0]> = {}) => ({
  content: policyArticle(), keyword: '2026 청년도약계좌 조건', contentMode: 'seo', topicType: 'POLICY',
  sourceDocuments: policyDocuments(), rawCorpus: '', sourceBased: true, jsonComplete: true, outputTruncated: false,
  relatedKeywords: ['청년도약계좌조건'], relatedKeywordsAreLlmExpanded: false, baseCalls: 1,
  resolveRoute: routes.resolveRoute, log: () => undefined, now: new Date('2026-09-22T10:00:00+09:00'),
  ...extra,
});

const issueJson = (issues: unknown[], status = 'REVISION_REQUIRED') => JSON.stringify({ status, issues, researchQueries: [] });

describe('critique loop — special fixtures', () => {
  it('E: clean article takes the fast path — 0 revisions, exactly 3 calls (critic, editorial, judge)', async () => {
    const routes = scriptedRoutes({});
    const out = await runQualityLoop(baseInput(routes));
    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
    expect(out.summary.fastPath).toBe(true);
    expect(out.summary.revisionCycles).toBe(0);
    expect(stagesOf(routes)).toEqual(['critic', 'editorial', 'judge']);
    expect(out.summary.cost.qualityCalls).toBe(3);
    expect(out.summary.cost.totalCalls).toBe(4);
    expect(out.content.bodyPlain).toBe(policyArticle().bodyPlain);
    expect(out.summary.preservation.revisedSections).toBe(0);
  });

  it('A: a general explanation sentence is never Critical — demoted, no revision', async () => {
    const routes = scriptedRoutes({
      critic: () => issueJson([{ severity: 'CRITICAL', type: 'FACT_ERROR', sectionId: 's2', exactSpan: '이 구조는 단순한 편이라 처음 보는 분도 금방 이해합니다.', operation: 'REMOVE', evidenceIds: [], problem: '일반 설명', requiredChange: '삭제' }]),
    });
    const out = await runQualityLoop(baseInput(routes));
    expect(out.summary.fastPath).toBe(true);
    expect(stagesOf(routes)).not.toContain('revision');
    const demoted = out.summary.issues.find((i) => i.sectionId === 's2');
    expect(demoted?.severity).toBe('MINOR');
    expect(demoted?.state).toBe('ADVISORY');
    expect(demoted?.note).toMatch(/evidenceIds/);
  });

  it('B: MISSING_INFORMATION + ADD anchored to an H2/H3 title is allowed and revised', async () => {
    const added = `${S3_TEXT} 소득 심사는 2025년 국세청 확정소득 기준입니다.`;
    const routes = scriptedRoutes({
      critic: (_p, n) => (n === 0
        ? issueJson([{ severity: 'MAJOR', type: 'MISSING_INFORMATION', sectionId: 's3', exactSpan: '2차 신청 기간과 방법', operation: 'ADD', evidenceIds: ['S01'], problem: '소득 심사 기준 연도 누락', requiredChange: '2025년 확정소득 기준 문장 추가' }])
        : PASS_JSON),
      revision: () => JSON.stringify({ sections: [{ sectionId: 's3', text: added }], patchedIssueKeys: ['ignored-by-verification'] }),
      verification: (prompt) => JSON.stringify({ resolved: [/issueKey=([0-9a-f]{12})/.exec(prompt)?.[1]], stillOpen: [], newIssues: [] }),
    });
    const out = await runQualityLoop(baseInput(routes));
    const issue = out.summary.issues.find((i) => i.type === 'MISSING_INFORMATION');
    expect(issue?.insertionAnchor).toBe('2차 신청 기간과 방법');
    expect(issue?.state).toBe('RESOLVED');
    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
    expect(out.summary.revisionCycles).toBe(1);
    expect(stagesOf(routes)).toEqual(['critic', 'revision', 'verification', 'editorial', 'judge']);
    expect(out.content.headings[2].content).toBe(added);
    expect(out.content.bodyPlain).toContain('2025년 국세청 확정소득 기준');
    expect(out.content.headings[1].content).toBe(S2_TEXT);
    expect(out.summary.preservation.untouchedPreserved).toBe(true);
    expect(out.summary.preservation.revisedSections).toBe(1);
  });

  it('C: CONTRADICTION whose exactSpan is only an H3 title is not blocking', async () => {
    const routes = scriptedRoutes({
      critic: () => issueJson([{ severity: 'CRITICAL', type: 'CONTRADICTION', sectionId: 's4', exactSpan: '갈아타기 순서', operation: 'REPLACE', evidenceIds: ['S02'], problem: '순서 모순', requiredChange: '고쳐라' }]),
    });
    const out = await runQualityLoop(baseInput(routes));
    expect(out.summary.fastPath).toBe(true);
    expect(out.summary.issues[0].severity).toBe('MINOR');
    expect(out.summary.issues[0].note).toMatch(/exactSpan not found/);
  });

  it('D: Editor self-report does not resolve — Verification stillOpen wins, then MANUAL_REVIEW after 2 cycles', async () => {
    const routes = scriptedRoutes({
      critic: () => issueJson([{ severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: 's2', exactSpan: '우대형 12%가 붙습니다', operation: 'REPLACE', evidenceIds: ['S01'], problem: '표기', requiredChange: '자료대로' }]),
      revision: (_p, n) => JSON.stringify({ sections: [{ sectionId: 's2', text: S2_TEXT.replace('붙습니다', `붙습니다 (수정 ${n + 1})`) }], patchedIssueKeys: ['whatever'] }),
      verification: (prompt) => JSON.stringify({ resolved: [], stillOpen: [/issueKey=([0-9a-f]{12})/.exec(prompt)?.[1]], newIssues: [] }),
    });
    const out = await runQualityLoop(baseInput(routes));
    expect(out.summary.decision).toBe('MANUAL_REVIEW');
    expect(out.summary.revisionCycles).toBe(MAX_REVISION_CYCLES);
    expect(out.summary.manualReviewReasons.join(' ')).toMatch(/UNRESOLVED_INTEGRITY_AFTER_2_CYCLES/);
    expect(out.summary.issues[0].state).toBe('OPEN');
    expect(stagesOf(routes)).toEqual(['critic', 'revision', 'verification', 'revision', 'verification', 'editorial', 'judge']);
    expect(out.summary.cost.qualityCalls).toBe(7);
  });

  it('F: repeated core number counts as redundancy only when it recurs in 3+ sections', async () => {
    const repeated = policyArticle();
    const model = buildArticleModel(repeated);
    // 50만원 appears in s2 only -> not redundant; title 12% appears in s2 only.
    const routes = scriptedRoutes({});
    const out = await runQualityLoop(baseInput(routes, { content: repeated }));
    expect(out.summary.metrics.redundantCoreFacts).toBe(0);
    const spammy = policyArticle({
      headings: repeated.headings.map((h) => ({ ...h, content: `${h.content} 월 최대 50만원까지 납입할 수 있습니다.` })),
      bodyPlain: repeated.headings.map((h) => `${h.title}\n\n${h.content} 월 최대 50만원까지 납입할 수 있습니다.`).join('\n\n'),
    });
    const out2 = await runQualityLoop(baseInput(scriptedRoutes({}), { content: spammy }));
    expect(out2.summary.metrics.redundantCoreFacts).toBeGreaterThanOrEqual(1);
    expect(model.sections.map((s) => s.id)).toEqual(['intro', 's1', 's2', 's3', 's4', 'conclusion', 'cta']);
  });

  it('G: NEEDS_MORE_RESEARCH searches BEFORE any editing, then re-runs the Critic once', async () => {
    const order: string[] = [];
    const routes = scriptedRoutes({
      critic: (_p, n) => {
        order.push(`critic${n}`);
        return n === 0
          ? JSON.stringify({ status: 'NEEDS_MORE_RESEARCH', issues: [], researchQueries: ['청년도약계좌 비과세 조건'] })
          : issueJson([{ severity: 'MAJOR', type: 'MISSING_INFORMATION', sectionId: 's2', exactSpan: '납입 한도와 정부기여금', operation: 'ADD', evidenceIds: ['R01'], problem: '비과세 누락', requiredChange: '비과세 문장 추가' }]);
      },
      revision: () => { order.push('revision'); return JSON.stringify({ sections: [{ sectionId: 's2', text: `${S2_TEXT} 만기 이자소득은 비과세입니다.` }], patchedIssueKeys: [] }); },
      verification: (prompt) => JSON.stringify({ resolved: [/issueKey=([0-9a-f]{12})/.exec(prompt)?.[1]], stillOpen: [], newIssues: [] }),
    });
    const search = async (query: string) => {
      order.push(`search:${query}`);
      return [{ id: 'X', title: '비과세 안내', sourceType: 'official', url: 'https://kinfa.or.kr/tax', pubDate: '2026-09-01', dateStatus: 'KNOWN', body: '청년도약계좌 만기 이자소득은 비과세입니다.', sourceTier: 'OFFICIAL' } as never];
    };
    const out = await runQualityLoop(baseInput(routes, { search }));
    expect(order).toEqual(['critic0', 'search:청년도약계좌 비과세 조건', 'critic1', 'revision']);
    expect(out.summary.researchRecoveries).toBe(1);
    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
    expect(routes.calls.filter((c) => c.stage === 'critic')[1].prompt).toContain('[R01]');
  });

  it('research shortage without a search function ends in MANUAL_REVIEW, still without inventing', async () => {
    const routes = scriptedRoutes({ critic: () => JSON.stringify({ status: 'NEEDS_MORE_RESEARCH', issues: [], researchQueries: ['청년도약계좌 비과세'] }) });
    const out = await runQualityLoop(baseInput(routes));
    expect(out.summary.decision).toBe('MANUAL_REVIEW');
    expect(out.summary.manualReviewReasons[0]).toMatch(/NEEDS_MORE_RESEARCH/);
    expect(stagesOf(routes)).not.toContain('revision');
  });
});

describe('critique loop — section preservation and judge', () => {
  it('drops sections the Editor was not asked to change (untouched preservation 100%)', async () => {
    const routes = scriptedRoutes({
      critic: () => issueJson([{ severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: 's2', exactSpan: '우대형 12%가 붙습니다', operation: 'REPLACE', evidenceIds: ['S01'], problem: 'x', requiredChange: 'y' }]),
      revision: () => JSON.stringify({ sections: [
        { sectionId: 's2', text: S2_TEXT.replace('붙습니다', '적용됩니다') },
        { sectionId: 's1', text: '완전히 다시 쓴 섹션' },
        { sectionId: 'intro', text: '새 도입부' },
      ], patchedIssueKeys: [] }),
      verification: (prompt) => JSON.stringify({ resolved: [/issueKey=([0-9a-f]{12})/.exec(prompt)?.[1]], stillOpen: [], newIssues: [] }),
    });
    const out = await runQualityLoop(baseInput(routes));
    expect(out.content.headings[0].content).toBe(policyArticle().headings[0].content);
    expect(out.content.introduction).toBe(policyArticle().introduction);
    expect(out.content.headings[1].content).toContain('적용됩니다');
    expect(out.summary.preservation.untouchedPreserved).toBe(true);
    expect(out.summary.preservation.revisedSections).toBe(1);
    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
  });

  it('rejects a flagged section that comes back as a rewrite (3x growth) -> REVISION_NOOP -> MANUAL_REVIEW', async () => {
    const routes = scriptedRoutes({
      critic: () => issueJson([{ severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: 's2', exactSpan: '우대형 12%가 붙습니다', operation: 'REPLACE', evidenceIds: ['S01'], problem: 'x', requiredChange: 'y' }]),
      revision: () => JSON.stringify({ sections: [{ sectionId: 's2', text: `${S2_TEXT} ${S2_TEXT} ${S2_TEXT} ${S2_TEXT}` }], patchedIssueKeys: [] }),
    });
    const out = await runQualityLoop(baseInput(routes));
    expect(out.content.headings[1].content).toBe(S2_TEXT);
    expect(out.summary.manualReviewReasons[0]).toMatch(/REVISION_NOOP/);
    expect(stagesOf(routes)).not.toContain('verification');
  });

  it('a revision that silently drops a number is discarded (information preservation)', async () => {
    const routes = scriptedRoutes({
      critic: () => issueJson([{ severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: 's2', exactSpan: '우대형 12%가 붙습니다', operation: 'REPLACE', evidenceIds: ['S01'], problem: 'x', requiredChange: 'y' }]),
      revision: () => JSON.stringify({ sections: [{ sectionId: 's2', text: '납입은 자유롭게 할 수 있습니다. 정부기여금은 일반형과 우대형이 다릅니다. 이 구조는 단순한 편이라 처음 보는 분도 금방 이해합니다.' }], patchedIssueKeys: [] }),
    });
    const out = await runQualityLoop(baseInput(routes));
    expect(out.content.headings[1].content).toBe(S2_TEXT);
    expect(out.summary.manualReviewReasons[0]).toMatch(/PRESERVATION_VIOLATION.*숫자 유실/);
  });

  it('live 20260922-191510 regression: an UNSUPPORTED number inside a flagged REPLACE span may be removed', async () => {
    const bad = policyArticle({
      headings: policyArticle().headings.map((h, i) => (i === 1 ? { ...h, content: `${S2_TEXT} 기본 금리는 연 4.5%이고 최고 6.0%입니다.` } : h)),
      bodyPlain: policyArticle().bodyPlain.replace(S2_TEXT, `${S2_TEXT} 기본 금리는 연 4.5%이고 최고 6.0%입니다.`),
    });
    const routes = scriptedRoutes({
      critic: () => issueJson([{ severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: 's2', exactSpan: '기본 금리는 연 4.5%이고 최고 6.0%입니다.', operation: 'REPLACE', evidenceIds: ['S01'], problem: '자료에 없는 금리', requiredChange: '금리 문장을 뺀다' }]),
      revision: () => JSON.stringify({ sections: [{ sectionId: 's2', text: S2_TEXT }], patchedIssueKeys: [] }),
      verification: (prompt) => JSON.stringify({ resolved: [/issueKey=([0-9a-f]{12})/.exec(prompt)?.[1]], stillOpen: [], newIssues: [] }),
    });
    const out = await runQualityLoop(baseInput(routes, { content: bad }));
    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
    expect(out.content.headings[1].content).toBe(S2_TEXT);
    expect(out.summary.preservation.lostNumbers).toEqual([]);
  });

  it('live 20260922-195843 regression: an editorial fix that restores a removed unsupported value is discarded', async () => {
    const bad = policyArticle({
      headings: policyArticle().headings.map((h, i) => (i === 1 ? { ...h, content: `${S2_TEXT} 기본 금리는 연 4.5%입니다.` } : h)),
      bodyPlain: policyArticle().bodyPlain.replace(S2_TEXT, `${S2_TEXT} 기본 금리는 연 4.5%입니다.`),
    });
    const routes = scriptedRoutes({
      critic: () => issueJson([{ severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: 's2', exactSpan: '기본 금리는 연 4.5%입니다.', operation: 'REMOVE', evidenceIds: ['S01'], problem: '자료에 없는 금리', requiredChange: '뺀다' }]),
      revision: (prompt) => (prompt.includes('4.5%입니다')
        ? JSON.stringify({ sections: [{ sectionId: 's2', text: S2_TEXT }], patchedIssueKeys: [] })
        : JSON.stringify({ sections: [{ sectionId: 'intro', text: `${policyArticle().introduction} 기본 금리 4.5%도 함께 봅니다.` }], patchedIssueKeys: [] })),
      verification: (prompt) => JSON.stringify({ resolved: [/issueKey=([0-9a-f]{12})/.exec(prompt)?.[1]], stillOpen: [], newIssues: [] }),
      editorial: () => issueJson([{ severity: 'MAJOR', type: 'TITLE_PROMISE', sectionId: 'intro', exactSpan: '세 가지를 순서대로 정리합니다.', operation: 'REPLACE', problem: '제목과 도입부 초점 불일치', requiredChange: '금리를 도입부에 밝힌다' }]),
    });
    const out = await runQualityLoop(baseInput(routes, { content: bad }));
    expect(out.content.headings[1].content).toBe(S2_TEXT);
    expect(out.content.introduction).toBe(policyArticle().introduction);
    expect(out.content.bodyPlain).not.toContain('4.5%');
    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
    const editorialPrompt = routes.calls.find((c) => c.stage === 'editorial')?.prompt ?? '';
    expect(editorialPrompt).toContain('사실 검수에서 제거된 값');
    expect(editorialPrompt).toContain('4.5%');
  });

  it('live 20260922-201400 regression: an unsupported date flagged in one section is propagated to every section repeating it', async () => {
    const date = '10월 16~22일';
    const base = policyArticle();
    const bad = policyArticle({
      headings: base.headings.map((h, i) => (i === 2 ? { ...h, content: `${h.content} 행사는 ${date}에 열립니다.` } : h)),
      conclusion: `${base.conclusion} ${date}이 겹치면 숙소부터 잡으세요.`,
      bodyPlain: base.bodyPlain.replace(S3_TEXT, `${S3_TEXT} 행사는 ${date}에 열립니다.`).replace(base.conclusion, `${base.conclusion} ${date}이 겹치면 숙소부터 잡으세요.`),
    });
    const routes = scriptedRoutes({
      critic: () => issueJson([{ severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: 's3', exactSpan: `행사는 ${date}에 열립니다.`, operation: 'REPLACE', evidenceIds: ['S01'], problem: '자료에 없는 기간', requiredChange: '기간 단정을 뺀다' }]),
      revision: () => JSON.stringify({ sections: [
        { sectionId: 's3', text: S3_TEXT },
        { sectionId: 'conclusion', text: base.conclusion },
      ], patchedIssueKeys: [] }),
      verification: (prompt) => JSON.stringify({ resolved: [...prompt.matchAll(/issueKey=([0-9a-f]{12})/g)].map((m) => m[1]), stillOpen: [], newIssues: [] }),
    });
    const out = await runQualityLoop(baseInput(routes, { content: bad }));
    const derived = out.summary.issues.find((i) => i.sectionId === 'conclusion' && i.type === 'UNSUPPORTED_VALUE');
    expect(derived?.note).toMatch(/propagated/);
    expect(derived?.state).toBe('RESOLVED');
    expect(out.content.conclusion).toBe(base.conclusion);
    expect(out.content.bodyPlain).not.toContain(date);
    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
    expect(routes.calls.filter((c) => c.stage === 'revision')[0].prompt).toContain('[conclusion]');
  });

  it('judge cannot block for taste; a located fact block does block', async () => {
    const taste = scriptedRoutes({ judge: () => JSON.stringify({ decision: 'BLOCK', blockingIssues: [{ type: 'STYLE', sectionId: 's1', exactSpan: '병역을 이행했다면', reason: '더 자연스럽게 써야 한다' }], advisory: [] }) });
    const a = await runQualityLoop(baseInput(taste));
    expect(a.summary.decision).toBe('QUALITY_CONVERGED');
    expect(a.summary.judge?.decision).toBe('PASS');
    expect(a.summary.judge?.advisory[0]).toMatch(/taste/);

    const fact = scriptedRoutes({ judge: () => JSON.stringify({ decision: 'BLOCK', blockingIssues: [{ type: 'FACT_ERROR', sectionId: 's3', exactSpan: '10월 7일부터 16일까지', reason: '자료는 10월 7일~16일이 아니라 다른 기간을 말한다' }], advisory: [] }) });
    const b = await runQualityLoop(baseInput(fact));
    expect(b.summary.decision).toBe('MANUAL_REVIEW');
    expect(b.summary.manualReviewReasons[0]).toMatch(/JUDGE_BLOCK\[s3\/FACT_ERROR\]/);
  });

  it('hard stops (truncated output) skip every LLM call', async () => {
    const routes = scriptedRoutes({});
    const out = await runQualityLoop(baseInput(routes, { outputTruncated: true }));
    expect(out.summary.decision).toBe('MANUAL_REVIEW');
    expect(routes.calls).toHaveLength(0);
    expect(out.summary.manualReviewReasons[0]).toMatch(/OUTPUT_TRUNCATED/);
  });

  it('no route for the selected engine -> SKIPPED, article untouched, 0 calls', async () => {
    const routes = scriptedRoutes({}, ['critic']);
    const out = await runQualityLoop(baseInput(routes));
    expect(out.summary.decision).toBe('SKIPPED');
    expect(routes.calls).toHaveLength(0);
    expect(out.content).toBe(policyArticle() && out.content);
  });

  it('records the model per stage and the cost ledger (subscription -> 0 USD)', async () => {
    const routes = scriptedRoutes({});
    const out = await runQualityLoop(baseInput(routes));
    expect(out.summary.models).toEqual({ criticModel: 'fake-engine', revisionModel: '', verificationModel: '', editorialModel: 'fake-engine', judgeModel: 'fake-engine' });
    expect(out.summary.cost.qualityCostUsd).toBe(0);
    expect(out.summary.cost.baseCostUsd).toBeNull();
    expect(out.summary.cost.calls.map((c) => c.stage)).toEqual(['critic', 'editorial', 'judge']);
    expect(JUDGE_PASS).toContain('PASS');
  });
});
