// [2026-09-22 Critique Loop] Five real P1 generation-run fixtures (policy/finance/car/
// entertainment/travel) exercised through the critique loop with scripted (offline, $0)
// routes. See scripts/critique-fixture-build.cjs for how src/__tests__/fixtures/critique/*.json
// was produced from userData/generation-runs snapshots.

import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import type { StructuredContent } from '../contentGenerator';
import type { SourceDocument } from '../content/sourceDocument';
import { runQualityLoop } from '../quality/critique/orchestrator';
import { buildArticleModel } from '../quality/critique/sectionModel';
import { runPrecheck } from '../quality/critique/precheck';
import { buildEvidencePack } from '../quality/critique/evidence';
import { computeQualityMetrics } from '../quality/critique/metrics';
import { scriptedRoutes, stagesOf, PASS_JSON } from './critiqueLoopFixtures';

interface Fixture {
  readonly runId: string;
  readonly keyword: string;
  readonly mode: string;
  readonly topicType: string;
  readonly content: StructuredContent;
  readonly documents: SourceDocument[];
}

function loadFixture(slug: string): Fixture {
  const url = new URL(`./fixtures/critique/${slug}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Fixture;
}

const SLUGS = ['policy', 'finance', 'car', 'entertainment', 'travel'] as const;
const CASES = SLUGS.map((slug) => ({ slug, fixture: loadFixture(slug) }));

const baseInput = (
  fixture: Fixture,
  routes: ReturnType<typeof scriptedRoutes>,
  extra: Partial<Parameters<typeof runQualityLoop>[0]> = {},
) => ({
  content: fixture.content, keyword: fixture.keyword, contentMode: fixture.mode, topicType: fixture.topicType,
  sourceDocuments: fixture.documents, rawCorpus: '', sourceBased: true, jsonComplete: true, outputTruncated: false,
  relatedKeywords: [], relatedKeywordsAreLlmExpanded: false, baseCalls: 1,
  resolveRoute: routes.resolveRoute, log: () => undefined, now: new Date('2026-09-22T10:00:00+09:00'),
  ...extra,
});

const issueJson = (issues: unknown[], status = 'REVISION_REQUIRED') => JSON.stringify({ status, issues, researchQueries: [] });

describe.each(CASES)('critique loop — $slug fixture (real P1 run)', ({ slug, fixture }) => {
  const { content, documents, keyword } = fixture;

  it('a: buildArticleModel — intro..s1..sN..conclusion, markers present, section text matches headings', () => {
    const model = buildArticleModel(content);
    expect(model.bodyHasHeadingMarkers).toBe(true);
    expect(model.sections[0]?.id).toBe('intro');
    expect(model.sections[model.sections.length - 1]?.id).toBe('conclusion');
    content.headings.forEach((h, i) => {
      const section = model.sections.find((s) => s.id === `s${i + 1}`);
      expect(section).toBeDefined();
      expect(section?.text).toBe(h.content.trim());
    });
  });

  it('b: precheck — no hard stops (MAJOR count recorded, not asserted)', () => {
    const model = buildArticleModel(content);
    const evidence = buildEvidencePack(documents, keyword);
    const precheck = runPrecheck({ model, evidence, sourceBased: true, jsonComplete: true, outputTruncated: false, rawCorpus: '' });
    expect(precheck.hardStops).toEqual([]);
    const majorCount = precheck.issues.filter((i) => i.severity === 'MAJOR').length;
    expect(typeof majorCount).toBe('number');
    console.log(`[critiqueLoopFiveTypes] ${slug}: precheck MAJOR=${majorCount} MINOR=${precheck.issues.length - majorCount}`);
  });

  it('c: all-PASS scripted routes converge via the fast path, article untouched', async () => {
    const routes = scriptedRoutes({});
    const out = await runQualityLoop(baseInput(fixture, routes));
    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
    expect(out.summary.fastPath).toBe(true);
    expect(stagesOf(routes)).toEqual(['critic', 'editorial', 'judge']);
    expect(out.content.bodyPlain).toBe(content.bodyPlain);
    expect(out.summary.preservation.revisedSections).toBe(0);
  });

  it('d: MISSING_INFORMATION+ADD anchored at an H2 title is revised and verified — only s2 changes', async () => {
    const target = content.headings[1];
    const extraSentence = '이 문장은 검증용으로 추가됐습니다.';
    const revisedText = `${target.content} ${extraSentence}`;
    const routes = scriptedRoutes({
      critic: (_prompt, callIndex) => (callIndex === 0
        ? issueJson([{
          severity: 'MAJOR', type: 'MISSING_INFORMATION', sectionId: 's2', exactSpan: target.title, operation: 'ADD',
          evidenceIds: [documents[0].id], problem: '자료에 있는 정보가 본문에 없음', requiredChange: '자료 기반 문장을 추가한다',
        }])
        : PASS_JSON),
      revision: () => JSON.stringify({ sections: [{ sectionId: 's2', text: revisedText }], patchedIssueKeys: [] }),
      verification: (prompt) => JSON.stringify({ resolved: [/issueKey=([0-9a-f]{12})/.exec(prompt)?.[1]], stillOpen: [], newIssues: [] }),
    });
    const out = await runQualityLoop(baseInput(fixture, routes));

    expect(out.summary.decision).toBe('QUALITY_CONVERGED');
    expect(out.summary.revisionCycles).toBe(1);
    expect(stagesOf(routes)).toEqual(['critic', 'revision', 'verification', 'editorial', 'judge']);

    content.headings.forEach((h, i) => {
      if (i === 1) return;
      expect(out.content.headings[i]?.content).toBe(h.content);
    });
    expect(out.content.introduction).toBe(content.introduction);
    expect(out.content.conclusion).toBe(content.conclusion);
    expect(out.content.headings[1]?.content).toBe(revisedText);
    expect(out.content.bodyPlain).toContain(extraSentence);
    expect(out.summary.preservation.untouchedPreserved).toBe(true);
    expect(out.summary.preservation.revisedSections).toBe(1);
  });

  it('e: quality metrics stay within their documented ranges', () => {
    const model = buildArticleModel(content);
    const evidence = buildEvidencePack(documents, keyword);
    const metrics = computeQualityMetrics(model, evidence);
    expect(metrics.vagueSentenceRatio).toBeGreaterThanOrEqual(0);
    expect(metrics.vagueSentenceRatio).toBeLessThanOrEqual(1);
    expect(metrics.redundantCoreFacts).toBeGreaterThanOrEqual(0);
    expect(metrics.actionability).toBeGreaterThanOrEqual(0);
    expect(metrics.actionability).toBeLessThanOrEqual(1);
    if (metrics.coreFactCoverage !== null) {
      expect(metrics.coreFactCoverage).toBeGreaterThanOrEqual(0);
      expect(metrics.coreFactCoverage).toBeLessThanOrEqual(1);
    }
  });

  it('f: critic prompt carries the title, section markers and evidence ids within the short-input budget', async () => {
    const routes = scriptedRoutes({});
    await runQualityLoop(baseInput(fixture, routes));
    const prompt = routes.calls[0]?.prompt ?? '';
    expect(prompt).toContain(content.selectedTitle);
    expect(prompt).toContain('[s1]');
    expect(prompt).toMatch(/\[S0\d/);
    expect(prompt.length).toBeLessThan(40000);
  });
});
