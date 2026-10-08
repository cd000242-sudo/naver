/**
 * Release-1 collector integration (2026-10-08): press-host demotion, the free watermark
 * check inside the funnel, the strict caption gate on the broad fallback, and the
 * renderer note. Network-free: fetcher, sources and plan are mocked.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WATERMARK_VARIANTS, applyVariant, loadCleanBases } from './helpers/watermarkVariants';

const mocks = vi.hoisted(() => ({
  fetchCandidate: vi.fn(),
  runVisionGate: vi.fn(async (items: unknown[]) => items),
  refine: vi.fn(),
  broadSearch: vi.fn(),
}));

vi.mock('../crawler/issueHarness/candidateFetcher.js', async (importActual) => ({
  ...(await importActual<typeof import('../crawler/issueHarness/candidateFetcher.js')>()),
  fetchAndValidateCandidate: mocks.fetchCandidate,
}));
vi.mock('../crawler/issueHarness/visionGate.js', async (importActual) => ({
  ...(await importActual<typeof import('../crawler/issueHarness/visionGate.js')>()),
  runVisionGate: mocks.runVisionGate,
}));

const { isPressAgencyHost } = await import('../crawler/issueHarness/pressHosts.js');
const funnel = await import('../crawler/issueHarness/funnel.js');

const subjectContext = { mainSubject: '김연아', heading: '은퇴 기자회견 그 후' };
const cand = (url: string, caption: string, extra: Record<string, unknown> = {}) => ({
  url, caption, sourceName: 'naver', query: 'q', ...extra,
});

describe('press-agency host detection', () => {
  it.each([
    'https://img.yna.co.kr/photo/a.jpg', 'https://app.yonhapnews.co.kr/a.jpg', 'https://image.news1.kr/a.jpg',
    'https://file.osen.co.kr/a.jpg', 'https://img.sbs.co.kr/a.jpg', 'https://image.kbs.co.kr/a.jpg',
    'https://image.ytn.co.kr/a.jpg', 'https://img.jtbc.co.kr/a.jpg', 'https://cdn.dispatch.co.kr/a.jpg',
    'https://img.newsis.com/a.jpg', 'https://img.tvreport.co.kr/a.jpg',
  ])('%s is press', (url) => expect(isPressAgencyHost(url)).toBe(true));

  it.each([
    'https://img.example.com/a.jpg', 'https://fakekbsx.com/a.jpg', 'https://cdn.sbsx.net/a.jpg',
    'https://postfiles.pstatic.net/a.jpg', 'not a url',
  ])('%s is not press', (url) => expect(isPressAgencyHost(url)).toBe(false));

  it('the source page host counts too', () => {
    expect(isPressAgencyHost('https://cdn.example.com/a.jpg', 'https://www.ytn.co.kr/news/1')).toBe(true);
  });
});

describe('press hosts are demoted, never dropped', () => {
  it('orderCandidatesForFetch puts press hosts after every other source', () => {
    const pool = [
      cand('https://img.yna.co.kr/big.jpg', 'x', { width: 4000, height: 3000 }),
      cand('https://img.example.com/small.jpg', 'x', { sourceName: 'youtube', width: 100, height: 100 }),
      cand('https://img.example.com/mid.jpg', 'x', { width: 800, height: 600 }),
    ];
    const ordered = funnel.orderCandidatesForFetch(pool as never);
    expect(ordered.map((c) => c.url)).toEqual([
      'https://img.example.com/mid.jpg', 'https://img.example.com/small.jpg', 'https://img.yna.co.kr/big.jpg',
    ]);
  });

  it('rankCleanCandidates ranks a clean press photo below a clean non-press photo', () => {
    const mk = (url: string, w: number, h: number) => ({
      candidate: { url, sourceName: 'naver', query: 'q' }, buffer: Buffer.alloc(0), width: w, height: h, dhash: 0n,
    });
    const ranked = funnel.rankCleanCandidates([
      mk('https://img.sbs.co.kr/huge.jpg', 3000, 2000), mk('https://img.example.com/ok.jpg', 800, 600),
    ] as never);
    expect(ranked.map((r) => r.candidate.url)).toEqual(['https://img.example.com/ok.jpg', 'https://img.sbs.co.kr/huge.jpg']);
  });
});

describe('funnel: free watermark check and caption pre-filter', () => {
  const bases = loadCleanBases();
  const options = (extra: Record<string, unknown> = {}) => ({
    visionBudget: { maxImages: 10, inspected: 0 },
    phashRegistry: funnel.createPhashRegistry(),
    subjectContext,
    cleanTarget: 3,
    ...extra,
  });
  const item = (c: ReturnType<typeof cand>, buffer: Buffer, dhash: bigint) => ({ candidate: c, buffer, width: 800, height: 600, dhash });

  beforeEach(() => { mocks.fetchCandidate.mockReset(); mocks.runVisionGate.mockClear(); });
  afterEach(() => vi.restoreAllMocks());

  it('rejects suspected watermarks, counts them, and keeps their hash out of the registry', async () => {
    const marked = await applyVariant(bases[0].buffer, WATERMARK_VARIANTS[0]);
    const a = cand('https://img.example.com/marked.jpg', '김연아 은퇴 기자회견');
    const b = cand('https://img.example.com/clean.jpg', '김연아 은퇴 기자회견 현장');
    mocks.fetchCandidate.mockImplementation(async (c: ReturnType<typeof cand>) =>
      (c.url.includes('marked') ? item(c, marked, 0n) : item(c, bases[1].buffer, 0xffffffffn)));
    const opts = options();
    const result = await funnel.refineHeadingCandidates([a, b] as never, opts as never);
    expect(result.watermarkRejected).toBe(1);
    expect(result.clean.map((x) => x.candidate.url)).toEqual(['https://img.example.com/clean.jpg']);
    expect(opts.phashRegistry.hashes).toEqual([0xffffffffn]);
  });

  it('does not download candidates that fail the strict caption gate (free mode)', async () => {
    mocks.fetchCandidate.mockImplementation(async (c: ReturnType<typeof cand>) => item(c, bases[1].buffer, 0n));
    const pool = [
      cand('https://img.example.com/generic.jpg', '김연아 근황 사진 공개'),
      cand('https://img.example.com/scene.jpg', '김연아 은퇴 기자회견'),
    ];
    const result = await funnel.refineHeadingCandidates(pool as never, options() as never);
    expect(mocks.fetchCandidate).toHaveBeenCalledTimes(1);
    expect(result.clean.map((x) => x.candidate.url)).toEqual(['https://img.example.com/scene.jpg']);
  });

  it('event/fandom scene terms from the query plan supply the evidence', async () => {
    mocks.fetchCandidate.mockImplementation(async (c: ReturnType<typeof cand>) => item(c, bases[1].buffer, 0n));
    const pool = [cand('https://img.example.com/o.jpg', '김연아 올림픽 은메달')];
    const vague = { mainSubject: '김연아', heading: '근황 공개' };
    const without = await funnel.refineHeadingCandidates(pool as never, options({ subjectContext: vague }) as never);
    expect(without.clean).toHaveLength(1); // vague heading → subject-only fallback
    const strict = await funnel.refineHeadingCandidates(
      [cand('https://img.example.com/p.jpg', '김연아 화보 사진')] as never,
      options({ subjectContext: vague, sceneTerms: ['김연아 올림픽 은메달'] }) as never,
    );
    expect(strict.clean).toHaveLength(0);
  });

  it('runs the watermark check before the Vision gate, so marked images are never sent', async () => {
    const marked = await applyVariant(bases[2].buffer, WATERMARK_VARIANTS[3]);
    mocks.fetchCandidate.mockImplementation(async (c: ReturnType<typeof cand>) => item(c, marked, 0n));
    const pool = [cand('https://img.example.com/m.jpg', '김연아 은퇴')];
    await funnel.refineHeadingCandidates(pool as never, options({ visionRoute: { label: 'test', free: true } }) as never);
    expect(mocks.runVisionGate).toHaveBeenCalledTimes(1);
    expect(mocks.runVisionGate.mock.calls[0][0]).toEqual([]);
  });
});

describe('harness: broad fallback goes through the strict gate', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.refine.mockReset();
    mocks.refine.mockResolvedValue({ clean: [], fetched: 0, duplicates: 0, visionUsed: false, watermarkRejected: 2, attemptedUrls: [] });
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => { fn(); return 0; }) as never);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('../crawler/issueHarness/funnel.js'); });

  async function runWithBroad(visionRoute: unknown) {
    const wide = [
      cand('https://img.example.com/generic1.jpg', '김연아 근황 사진 공개'),
      cand('https://img.example.com/scene.jpg', '김연아 은퇴 기자회견 현장'),
      cand('https://img.example.com/nocaption.jpg', ''),
    ];
    const empty = (name: string) => ({ name, search: async () => [] });
    vi.doMock('../crawler/issueHarness/funnel.js', async (importActual) => ({
      ...(await importActual<typeof import('../crawler/issueHarness/funnel.js')>()),
      refineHeadingCandidates: mocks.refine,
    }));
    vi.doMock('../crawler/issueHarness/sources/naverApiSource.js', () => ({
      naverApiSource: { name: 'naver', search: async (q: string) => (q === 'BROAD' ? wide : []) },
      naverApiDateSource: empty('naver-date'),
    }));
    for (const [file, key] of [
      ['googleSource', 'googleSource'], ['duckduckgoSource', 'duckduckgoSource'], ['redditSource', 'redditSource'],
      ['youtubeThumbSource', 'youtubeThumbSource'], ['newsOgImageSource', 'newsOgImageSource'],
      ['dcinsideSource', 'dcinsideSource'], ['daumImageSource', 'daumImageSource'], ['yandexImageSource', 'yandexImageSource'],
    ]) vi.doMock(`../crawler/issueHarness/sources/${file}.js`, () => ({ [key]: empty(key) }));
    vi.doMock('../crawler/issueHarness/queryFanout.js', () => ({
      buildIssueQueryPlan: async () => ({
        mainSubject: '김연아', romanizedSubject: '', contextSummary: '', programName: '', aiGenerated: false,
        querySets: [{ heading: '은퇴 기자회견 그 후', koreanQuery: '김연아 은퇴', englishQuery: '', fandomQuery: '', eventQuery: '', broaderQuery: 'BROAD' }],
      }),
    }));
    const { collectIssueImages } = await import('../crawler/issueHarness/harness.js');
    return collectIssueImages({ title: '김연아 은퇴', headings: [{ title: '은퇴 기자회견 그 후' }] }, { visionRoute: visionRoute as never });
  }

  it.each([
    ['free mode', null],
    ['vision mode', { label: 'test', free: true }],
  ])('%s: only candidates with scene evidence reach the funnel; stats count watermark rejects', async (_label, route) => {
    const result = await runWithBroad(route);
    expect(mocks.refine).toHaveBeenCalledTimes(1);
    const sent = mocks.refine.mock.calls[0][0] as Array<{ url: string }>;
    expect(sent.map((c) => c.url)).toEqual(['https://img.example.com/scene.jpg']);
    expect(result.stats.watermarkRejected).toBe(2);
  });
});

describe('renderer note and wiring (source contract)', () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('no longer claims watermarks were not checked, and still admits faint marks can be missed', () => {
    const src = read('../renderer/modules/issueCollectMode.ts');
    expect(src).not.toMatch(/워터마크\/구도는 미검사입니다/);
    expect(src).toMatch(/워터마크·로고는 무료 픽셀 검사로 걸렀지만/);
    expect(src).toMatch(/옅은 워터마크는 놓칠 수 있고/);
    expect(src).toMatch(/stats\.watermarkRejected/);
  });

  it('funnel wires the watermark check and the scene terms; harness passes the plan terms', () => {
    const funnelSrc = read('../crawler/issueHarness/funnel.ts');
    expect(funnelSrc).toMatch(/detectWatermark\(item\.buffer\)/);
    expect(funnelSrc).toMatch(/sceneTerms: options\.sceneTerms/);
    expect(read('../crawler/issueHarness/harness.ts')).toMatch(/sceneTerms: \[qs\.eventQuery, qs\.fandomQuery, plan\.programName\]/);
  });
});
