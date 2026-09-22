import { describe, expect, it } from 'vitest';
import { buildArticleModel, applySectionEdits, renderVisibleArticle } from '../quality/critique/sectionModel';
import { validateIssues, issueFingerprint } from '../quality/critique/issueValidator';
import { addIssues, applyVerification, blockingIssues, createLedger, markPending } from '../quality/critique/issueLedger';
import { parseJudgeOutput } from '../quality/critique/finalJudge';
import { isQualityLoopEnabled } from '../quality/critique/flag';
import { classifyHashtags } from '../quality/critique/hashtagProvenance';
import { planBatches, parseEditorOutput, MAX_SECTIONS_PER_CALL } from '../quality/critique/batchEditor';
import { parseVerificationOutput } from '../quality/critique/verification';
import { runPrecheck } from '../quality/critique/precheck';
import { buildEvidencePack } from '../quality/critique/evidence';
import { maybeRunQualityLoop } from '../quality/critique/generatorHook';
import { policyArticle, policyDocuments, S1_TEXT, S2_TEXT } from './critiqueLoopFixtures';
import type { QualityIssue } from '../quality/critique/types';

const evidence = () => buildEvidencePack(policyDocuments(), '2026 청년도약계좌 조건');

describe('sectionModel — mirrors what the publish path types', () => {
  it('slices sections from bodyPlain when it carries heading titles, and from headings[].content otherwise', () => {
    const withMarkers = buildArticleModel(policyArticle());
    expect(withMarkers.bodyHasHeadingMarkers).toBe(true);
    expect(withMarkers.sections.find((s) => s.id === 's1')?.text).toBe(S1_TEXT);
    expect(withMarkers.sections.find((s) => s.id === 'intro')?.text).toBe(policyArticle().introduction);
    expect(withMarkers.sections.find((s) => s.id === 'conclusion')?.text).toBe(policyArticle().conclusion);

    const noMarkers = buildArticleModel(policyArticle({ bodyPlain: [S1_TEXT, S2_TEXT].join('\n\n') }));
    expect(noMarkers.bodyHasHeadingMarkers).toBe(false);
    expect(noMarkers.sections.find((s) => s.id === 's2')?.text).toBe(S2_TEXT);
  });

  it('infers the visible introduction from bodyPlain when introduction is empty (editorHelpers rule)', () => {
    const article = policyArticle({ introduction: '' });
    const model = buildArticleModel(article);
    expect(model.sections[0].id).toBe('intro');
    expect(model.sections[0].text).toBe(policyArticle().introduction);
  });

  it('applySectionEdits updates headings[].content AND bodyPlain, leaves everything else byte-identical', () => {
    const article = policyArticle();
    const model = buildArticleModel(article);
    const next = applySectionEdits(article, model, { s2: `${S2_TEXT} 만기 비과세.` });
    expect(next).not.toBe(article);
    expect(next.headings[1].content).toBe(`${S2_TEXT} 만기 비과세.`);
    expect(next.bodyPlain).toContain(`${S2_TEXT} 만기 비과세.`);
    expect(next.bodyPlain.replace(' 만기 비과세.', '')).toBe(article.bodyPlain);
    expect(next.headings[0]).toEqual(article.headings[0]);
    expect(article.headings[1].content).toBe(S2_TEXT);
    expect(renderVisibleArticle(buildArticleModel(next))).toContain('[CTA]');
  });
});

describe('issueValidator', () => {
  const model = buildArticleModel(policyArticle());
  const v = (issue: Record<string, unknown>) => validateIssues([issue], model, evidence(), { origin: 'critic', round: 1 });

  it('style is never Critical; CRITICAL is reserved for fact conflicts', () => {
    expect(v({ severity: 'CRITICAL', type: 'STYLE', sectionId: 's1', exactSpan: '병역을 이행했다면', problem: 'p', requiredChange: 'r' }).demoted[0].severity).toBe('MINOR');
    const r = v({ severity: 'CRITICAL', type: 'TITLE_PROMISE', sectionId: 's1', exactSpan: '병역을 이행했다면', problem: 'p', requiredChange: 'r' });
    expect(r.accepted[0].severity).toBe('MAJOR');
  });

  it('fact issues need evidenceIds that exist in the pack', () => {
    const bad = v({ severity: 'CRITICAL', type: 'FACT_ERROR', sectionId: 's1', exactSpan: '병역을 이행했다면', evidenceIds: ['S99'], problem: 'p', requiredChange: 'r' });
    expect(bad.demoted[0].note).toMatch(/evidenceIds/);
    const ok = v({ severity: 'CRITICAL', type: 'FACT_ERROR', sectionId: 's1', exactSpan: '병역을 이행했다면', evidenceIds: ['S01'], problem: 'p', requiredChange: 'r' });
    expect(ok.accepted[0].severity).toBe('CRITICAL');
  });

  it('live 20260922-193310 regression: a located, evidenced fact-typed issue labelled MINOR is promoted to MAJOR', () => {
    const r = v({ severity: 'MINOR', type: 'UNSUPPORTED_VALUE', sectionId: 's1', exactSpan: '병역을 이행했다면', evidenceIds: ['S01'], problem: '자료에 없는 인용', requiredChange: '뺀다' });
    expect(r.accepted[0]?.severity).toBe('MAJOR');
    expect(r.accepted[0]?.note).toMatch(/promoted/);
    const noEvidence = v({ severity: 'MINOR', type: 'UNSUPPORTED_VALUE', sectionId: 's1', exactSpan: '병역을 이행했다면', problem: 'p', requiredChange: 'r' });
    expect(noEvidence.demoted[0]?.severity).toBe('MINOR');
  });

  it('vague preference requests are advisory; fingerprints are stable per section+type+span', () => {
    const r = v({ severity: 'MAJOR', type: 'SEARCH_INTENT', sectionId: 's1', exactSpan: '병역을 이행했다면', problem: '더 자연스럽게', requiredChange: '문체를 다듬어라' });
    expect(r.demoted[0].note).toMatch(/vague/);
    expect(issueFingerprint('s1', 'FACT_ERROR', ' 병역을  이행했다면 ')).toBe(issueFingerprint('s1', 'FACT_ERROR', '병역을 이행했다면'));
  });

  it('MISSING_INFORMATION is blocking only when the source has concrete values', () => {
    const noValues = buildEvidencePack([{ ...policyDocuments()[1], body: '갈아타기는 신규 계좌를 먼저 만드는 게 안전하다는 의견이 많습니다.' }], 'x');
    const r = validateIssues([{ severity: 'MAJOR', type: 'MISSING_INFORMATION', sectionId: 's4', exactSpan: '갈아타기 순서', operation: 'ADD', problem: '구체 값 없음', requiredChange: '더 구체적으로' }], model, noValues, { origin: 'critic', round: 1 });
    expect(r.demoted[0].note).toMatch(/no concrete values/);
  });
});

describe('issueLedger lifecycle', () => {
  const issue = (key: string, state: QualityIssue['state'] = 'OPEN'): QualityIssue => ({
    issueKey: key, severity: 'MAJOR', type: 'FACT_ERROR', sectionId: 's1', exactSpan: 'x', operation: 'REPLACE', evidenceIds: ['S01'], problem: '', requiredChange: '', state, origin: 'critic', round: 1,
  });
  it('OPEN -> PENDING -> RESOLVED, reappearing resolved issue becomes REGRESSED, unmentioned pending stays OPEN', () => {
    let l = addIssues(createLedger(), [issue('a'), issue('b')]);
    l = markPending(l, ['a', 'b']);
    l = applyVerification(l, ['a'], []);
    expect(l.entries.get('a')?.state).toBe('RESOLVED');
    expect(l.entries.get('b')?.state).toBe('OPEN');
    l = addIssues(l, [issue('a')]);
    expect(l.entries.get('a')?.state).toBe('REGRESSED');
    expect(blockingIssues(l).map((i) => i.issueKey).sort()).toEqual(['a', 'b']);
    l = markPending(l, ['a']);
    l = applyVerification(l, ['a'], ['a']);
    expect(l.entries.get('a')?.state).toBe('OPEN');
  });
});

describe('finalJudge parsing', () => {
  const model = buildArticleModel(policyArticle());
  it('unlocated or taste blocks become advisory; unparseable output blocks', () => {
    const r = parseJudgeOutput(JSON.stringify({ decision: 'BLOCK', blockingIssues: [
      { type: 'FACT_ERROR', sectionId: 's9', exactSpan: '없는 구절', reason: '자료와 다름' },
      { type: 'STYLE', sectionId: 's1', exactSpan: '병역을 이행했다면', reason: 'SEO 개선 필요' },
    ], advisory: ['a'] }), model);
    expect(r.decision).toBe('PASS');
    expect(r.demoted).toHaveLength(2);
    expect(parseJudgeOutput('not json at all', model).decision).toBe('BLOCK');
  });
});

describe('flag, hashtags, batches, verification, precheck', () => {
  it('flag default OFF; env kill switch wins over config', () => {
    expect(isQualityLoopEnabled({}, {} as NodeJS.ProcessEnv)).toBe(false);
    expect(isQualityLoopEnabled({ naverQualityLoop: true }, {} as NodeJS.ProcessEnv)).toBe(true);
    expect(isQualityLoopEnabled({ naverQualityLoop: true }, { NAVER_QUALITY_LOOP: '0' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isQualityLoopEnabled(null, { NAVER_QUALITY_LOOP: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isQualityLoopEnabled({ naverQualityLoop: 'true' }, {} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('hashtag provenance separates real related searches from LLM tags', () => {
    const list = classifyHashtags({ hashtags: ['청년도약계좌조건', '재테크', '청년도약계좌', '없는말'], primaryKeyword: '청년도약계좌 조건', relatedKeywords: ['청년도약계좌조건'], relatedKeywordsAreLlmExpanded: false, articleText: '재테크 이야기' });
    expect(list.map((h) => h.origin)).toEqual(['actualSearch', 'article', 'semantic', 'hashtag']);
    const llm = classifyHashtags({ hashtags: ['청년도약계좌조건'], primaryKeyword: 'x', relatedKeywords: ['청년도약계좌조건'], relatedKeywordsAreLlmExpanded: true, articleText: '' });
    expect(llm[0].origin).toBe('hashtag');
  });

  it('editor batches are capped at 4 sections and only requested sections are accepted', () => {
    expect(planBatches(['a', 'b', 'c', 'd', 'e'])).toEqual([['a', 'b', 'c', 'd'], ['e']]);
    expect(MAX_SECTIONS_PER_CALL).toBe(4);
    const model = buildArticleModel(policyArticle());
    const issues = new Map([['s1', [{ operation: 'REPLACE', issueKey: 'k1', sectionId: 's1', exactSpan: '병역을 이행했다면' } as QualityIssue]]]);
    const r = parseEditorOutput(JSON.stringify({ sections: [{ sectionId: 's1', text: `${S1_TEXT}!` }, { sectionId: 's2', text: 'x' }], patchedIssueKeys: ['k1', 'k2'] }), model, ['s1'], issues);
    expect(Object.keys(r.sections)).toEqual(['s1']);
    expect(r.rejectedSectionIds).toEqual(['s2']);
    expect(r.patchedIssueKeys).toEqual(['k1']);
  });

  it('verification: new MAJOR accepted only in round 2 with causedByRevision', () => {
    const model = buildArticleModel(policyArticle());
    const pending = [{ issueKey: 'p1', sectionId: 's2' } as QualityIssue];
    const newMajor = { severity: 'MAJOR', type: 'CONTRADICTION', sectionId: 's2', exactSpan: '우대형 12%가 붙습니다', evidenceIds: ['S01'], operation: 'REPLACE', problem: 'p', requiredChange: 'r', causedByRevision: true };
    const r1 = parseVerificationOutput(JSON.stringify({ resolved: ['p1'], stillOpen: [], newIssues: [newMajor] }), model, evidence(), pending, 1);
    expect(r1.newIssues).toHaveLength(0);
    const r2 = parseVerificationOutput(JSON.stringify({ resolved: ['p1'], stillOpen: [], newIssues: [newMajor] }), model, evidence(), pending, 2);
    expect(r2.newIssues).toHaveLength(1);
    const r3 = parseVerificationOutput('garbage', model, evidence(), pending, 1);
    expect(r3.stillOpen).toEqual(['p1']);
  });

  it('precheck: empty section, broken numbers and unsupported named attribution are MAJOR; hard stops listed', () => {
    const article = policyArticle({ headings: [
      ...policyArticle().headings.slice(0, 3),
      { title: '갈아타기 순서', content: '국토교통부에 따르면 1,00만원이 한도입니다. 신규 계좌를 먼저 만들고 기존 계좌를 정리하는 순서가 안전합니다.', summary: '', keywords: [], imagePrompt: '' },
      { title: '빈 섹션', content: '', summary: '', keywords: [], imagePrompt: '' },
    ], bodyPlain: '' });
    const r = runPrecheck({ model: buildArticleModel(article), evidence: evidence(), sourceBased: true, jsonComplete: false, outputTruncated: false, rawCorpus: '' });
    expect(r.hardStops[0]).toMatch(/JSON_INCOMPLETE/);
    expect(r.issues.map((i) => i.problem)).toEqual(expect.arrayContaining([
      expect.stringContaining('빈 섹션'), expect.stringContaining('1,00'), expect.stringContaining('국토교통부에 따르면'),
    ]));
    expect(r.issues.every((i) => i.severity === 'MAJOR' && i.origin === 'precheck')).toBe(true);
  });

  it('generatorHook with the flag OFF returns the same object, no route call, summary null', async () => {
    const result = policyArticle();
    let routeCalls = 0;
    const out = await maybeRunQualityLoop({
      result, keyword: 'k', contentMode: 'seo', topicType: 'POLICY', sourceBased: true, sourceDocuments: [], rawCorpus: '',
      relatedKeywords: [], relatedKeywordsAreLlmExpanded: false, config: { naverQualityLoop: false },
      run: { meta: { jsonComplete: true, outputTruncated: false, actualModelsUsed: [], extra: {} }, updateMeta: () => undefined, writeQualityArtifact: () => undefined } as never,
      resolveRoute: async () => { routeCalls += 1; return null; },
    });
    expect(out.content).toBe(result);
    expect(out.summary).toBeNull();
    expect(routeCalls).toBe(0);
  });
});
