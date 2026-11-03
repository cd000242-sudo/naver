import { describe, expect, it, vi } from 'vitest';

const generateMock = vi.hoisted(() => vi.fn());
vi.mock('../agentCli/index', () => ({ generateWithAgent: (...args: unknown[]) => generateMock(...args) }));

import { ANALYSIS_BUDGET, buildAnalysisBlocks } from '../crawler/issueHarness/analysisInput';
import { buildFanoutPrompt, buildIssueQueryPlan } from '../crawler/issueHarness/queryFanout';
import { runPlanStage } from '../crawler/issueHarness/planStage';
import { resolveIssueCollectRoutes } from '../main/ipc/issueCollectHandlers';
import { collectDailyImages, type DailyCollectDeps } from '../main/services/dailyImageCollect';
import { generateCollectedPhotos, type CollectPhotosRuntime } from '../main/services/collectPhotosEngine';
import { buildImageCollectConsent } from '../runtime/collectPhotosPolicy';
import type { GenerateImagesOptions } from '../image/types';

const longBody = (marker: string) => `${'가'.repeat(590)}${marker}${'나'.repeat(2000)}`;
const PLAN_JSON = JSON.stringify({
  mainSubject: '한다감', romanizedSubject: 'Han', programName: '', contextSummary: '요약', subjectType: 'celebrity',
  sets: [{ index: 1, koreanQuery: '한다감 임신', englishQuery: '', fandomQuery: '', eventQuery: '', imageCount: 1 }],
});

describe('analysis input: title + intro + every heading paragraph (+ whole body)', () => {
  it('keeps far more than the old 280 chars per heading, within the per-heading cap', () => {
    const { sectionsBlock } = buildAnalysisBlocks({ headings: [{ title: 'A', body: longBody('MARK600') }] });
    expect(sectionsBlock).toContain('MARK600');
    expect(sectionsBlock.length).toBeLessThanOrEqual(ANALYSIS_BUDGET.maxPerHeading + 60);
  });

  it('many headings stay inside the total budget', () => {
    const headings = Array.from({ length: 30 }, (_, i) => ({ title: `소제목 ${i + 1}`, body: '가'.repeat(1000) }));
    const { sectionsBlock } = buildAnalysisBlocks({ headings });
    expect(sectionsBlock.length).toBeLessThan(ANALYSIS_BUDGET.sectionsTotalChars + 30 * 60);
    expect(sectionsBlock).toContain('30. 소제목: 소제목 30');
  });

  it('whole-body block only when the headings carry no paragraphs; long bodies keep head and tail', () => {
    const bare = [{ title: 'A' }, { title: 'B' }];
    const body = `HEAD${'가'.repeat(6000)}TAIL`;
    const withBody = buildAnalysisBlocks({ headings: bare, articleBody: body });
    expect(withBody.articleBlock).toContain('HEAD');
    expect(withBody.articleBlock).toContain('TAIL');
    expect(withBody.articleBlock).toContain('(중략)');
    const covered = buildAnalysisBlocks({ headings: [{ title: 'A', body: '내용' }, { title: 'B', body: '내용2' }], articleBody: body });
    expect(covered.articleBlock).toBe('');
  });

  it('prompt carries title, intro, heading list, paragraph text and whole body', () => {
    const prompt = buildFanoutPrompt('제목X', [{ title: '소제목1', body: longBody('PARA600') }, { title: '소제목2' }], '서론Y', undefined);
    expect(prompt).toContain('제목X');
    expect(prompt).toContain('서론Y');
    expect(prompt).toContain('1. 소제목: 소제목1');
    expect(prompt).toContain('2. 소제목: 소제목2');
    expect(prompt).toContain('PARA600');
    expect(buildFanoutPrompt('T', [{ title: 'a' }], '', 'WHOLE_BODY_TEXT')).toContain('# 본문 전체(발췌)');
  });
});

describe('plan call goes through the chosen engine; failure is shown, never silent', () => {
  it('plan model receives the body text and its answer becomes the plan', async () => {
    const caller = vi.fn(async () => PLAN_JSON);
    const plan = await buildIssueQueryPlan('제목', [{ title: '소제목', body: longBody('IN_PROMPT') }], caller, '서론');
    expect(plan.aiGenerated).toBe(true);
    expect(String(caller.mock.calls[0][0])).toContain('IN_PROMPT');
    expect(plan.fallbackReason).toBeUndefined();
  });

  it('a failing call falls back to heading text and records why', async () => {
    const plan = await buildIssueQueryPlan('한다감 임신', [{ title: '임신 소식' }], async () => { throw new Error('boom'); });
    expect(plan.aiGenerated).toBe(false);
    expect(plan.fallbackReason).toBe('boom');
    expect(plan.querySets[0].koreanQuery).toContain('임신');
    expect((await buildIssueQueryPlan('t', [{ title: 'h' }])).fallbackReason).toBeTruthy();
  });

  it('runPlanStage prints the fallback notice to progress and the caller log; silent on success', async () => {
    const emit = vi.fn();
    const log = vi.fn();
    await runPlanStage({ title: '제목', headings: [{ title: '소제목' }] }, { planCaller: async () => { throw new Error('boom'); }, log }, emit);
    const notice = '본문 분석 실패 — 소제목 글자로 검색';
    expect(emit.mock.calls.some(([, message]) => String(message).includes(notice))).toBe(true);
    expect(String(log.mock.calls[0][0])).toContain(notice);
    const okEmit = vi.fn();
    const okLog = vi.fn();
    await runPlanStage({ title: '제목', headings: [{ title: '소제목' }] }, { planCaller: async () => PLAN_JSON, log: okLog }, okEmit);
    expect(okLog).not.toHaveBeenCalled();
    expect(okEmit.mock.calls.some(([, message]) => String(message).includes('본문 분석 실패'))).toBe(false);
  });

  it('agent engines call generateWithAgent with their own provider; an unusable API engine yields no caller', async () => {
    generateMock.mockReset().mockResolvedValue({ text: 'ok' });
    const claude = resolveIssueCollectRoutes({ primaryGeminiTextModel: 'agent-claude' } as never, false);
    expect(await claude.planCaller?.('p')).toBe('ok');
    expect(generateMock.mock.calls[0][0]).toMatchObject({ provider: 'claude' });
    const codex = resolveIssueCollectRoutes({ primaryGeminiTextModel: 'agent-codex' } as never, false);
    await codex.planCaller?.('p');
    expect(generateMock.mock.calls[1][0]).toMatchObject({ provider: 'codex' });
    generateMock.mockClear();
    const noKey = resolveIssueCollectRoutes({ primaryGeminiTextModel: 'openai-gpt41' } as never, false);
    expect(noKey.planCaller).toBeUndefined();
    expect(generateMock).not.toHaveBeenCalled();
  });
});

describe('both collect paths hand the paragraphs to the collector', () => {
  it('collectDailyImages sends each heading with its paragraph', async () => {
    const collect = vi.fn(async () => ({ images: {}, candidates: {} }));
    const deps = { collect, fetch: async () => null, save: async () => '' } as unknown as DailyCollectDeps;
    const slot = { heading: 'A', prompt: 'p', englishPrompt: 'p', isThumbnail: false, imageRatio: '1:1' };
    await collectDailyImages({ title: 'T', headings: ['A'], slots: [slot], headingBodies: { A: '본문A' } }, deps);
    expect(collect.mock.calls[0][0].headings).toEqual([{ title: 'A', body: '본문A' }]);
    await collectDailyImages({ title: 'T', headings: ['A'], slots: [slot] }, deps);
    expect(collect.mock.calls[1][0].headings).toEqual([{ title: 'A' }]);
  });

  it('관련 사진 찾기 passes section paragraphs (not the thumbnail) and the intro', async () => {
    const collect = vi.fn(async () => []);
    const impl: CollectPhotosRuntime = {
      loadConsent: async () => buildImageCollectConsent(new Date('2026-11-03T00:00:00Z')),
      buildDeps: () => ({} as DailyCollectDeps), collect, readPreview: async () => '', log: vi.fn(),
    };
    const options = {
      provider: 'collect-photos', postTitle: '글 제목', articleContext: '서론 문맥',
      items: [
        { heading: '썸네일 제목', prompt: 'p', isThumbnail: true, sectionContent: '썸네일본문' },
        { heading: '첫째', prompt: 'p1', sectionContent: '첫째 본문' },
        { heading: '둘째', prompt: 'p2' },
      ],
    } as unknown as GenerateImagesOptions;
    await generateCollectedPhotos(options, undefined, impl);
    const input = collect.mock.calls[0][0] as { headingBodies?: Record<string, string>; intro?: string };
    expect(input.headingBodies).toEqual({ 첫째: '첫째 본문' });
    expect(input.intro).toBe('서론 문맥');
  });
});
