/**
 * 2026-11-13 live run: the funnel put every downloaded photo into the post-wide duplicate list BEFORE the vision check,
 * so a photo heading A downloaded but did not use was thrown out as a "perceptual duplicate" for heading B
 * (2 of 2, then 8 of 9 candidates). Only photos that were really placed into a heading may block later headings;
 * duplicates inside one heading are still caught inside that heading.
 * Network-free: the fetcher, the watermark check, the vision gate and the sources are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchCandidate: vi.fn(), refine: vi.fn() }));

vi.mock('../crawler/issueHarness/candidateFetcher.js', async (importActual) => ({
  ...(await importActual<typeof import('../crawler/issueHarness/candidateFetcher.js')>()),
  fetchAndValidateCandidate: mocks.fetchCandidate,
}));
vi.mock('../crawler/issueHarness/watermarkCheck.js', () => ({
  detectWatermark: async () => ({ suspected: false, region: null, score: 0 }),
}));
vi.mock('../crawler/issueHarness/visionGate.js', async (importActual) => ({
  ...(await importActual<typeof import('../crawler/issueHarness/visionGate.js')>()),
  runVisionGate: async (found: unknown[]) => found,
}));

const funnel = await import('../crawler/issueHarness/funnel.js');

const SHOT_X = 0n;
const SHOT_Y = 0xffffffffffffffffn; // 64 bits away from X — a different photo
const route = { label: 'test', free: true, vendor: 'agent-claude' } as never;
const subjectContext = { mainSubject: '김연아', heading: '소제목' };
const cand = (url: string) => ({ url, caption: '김연아 은퇴 기자회견', sourceName: 'naver', query: 'q' });
const fetched = (url: string, dhash: bigint) => ({ candidate: cand(url), buffer: Buffer.alloc(0), width: 800, height: 600, dhash });
const hashOfUrl = new Map<string, bigint>();
const options = (extra: Record<string, unknown> = {}) => ({
  visionRoute: route,
  visionBudget: { maxImages: 100, inspected: 0 },
  phashRegistry: funnel.createPhashRegistry(),
  subjectContext,
  cleanTarget: 3,
  ...extra,
});

beforeEach(() => {
  hashOfUrl.clear();
  mocks.fetchCandidate.mockReset();
  mocks.fetchCandidate.mockImplementation(async (c: { url: string }) => fetched(c.url, hashOfUrl.get(c.url) ?? 0n));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('funnel: 내려받기만 한 사진은 글 전체 중복 목록에 들어가지 않는다', () => {
  it('(a) 소제목 A 가 내려받았지만 배치하지 않은 사진을 소제목 B 가 쓸 수 있다', async () => {
    hashOfUrl.set('https://img.example.com/a1.jpg', SHOT_X);
    hashOfUrl.set('https://img.example.com/a2.jpg', SHOT_Y);
    hashOfUrl.set('https://img.example.com/b-copy-of-a2.jpg', SHOT_Y);
    const postWide = funnel.createPhashRegistry();

    const a = await funnel.refineHeadingCandidates(
      [cand('https://img.example.com/a1.jpg'), cand('https://img.example.com/a2.jpg')] as never,
      options({ phashRegistry: postWide }) as never,
    );
    expect(a.clean).toHaveLength(2);
    // Heading A placed only a1. Nothing was registered by the download itself.
    expect(postWide.hashes).toEqual([]);
    funnel.registerPlacedPhotos(postWide, [a.clean.find((x) => x.candidate.url.endsWith('a1.jpg'))!]);
    expect(postWide.hashes).toEqual([SHOT_X]);

    const b = await funnel.refineHeadingCandidates(
      [cand('https://img.example.com/b-copy-of-a2.jpg')] as never,
      options({ phashRegistry: postWide }) as never,
    );
    expect(b.duplicates).toBe(0);
    expect(b.clean.map((x) => x.candidate.url)).toEqual(['https://img.example.com/b-copy-of-a2.jpg']);
  });

  it('(b) 소제목 A 에 배치된 사진은 소제목 B 에서 중복으로 걸린다', async () => {
    hashOfUrl.set('https://img.example.com/a1.jpg', SHOT_X);
    hashOfUrl.set('https://img.example.com/b-repost-of-a1.jpg', SHOT_X ^ 0b111n); // re-encoded copy: 3 bits off
    const postWide = funnel.createPhashRegistry();
    const a = await funnel.refineHeadingCandidates([cand('https://img.example.com/a1.jpg')] as never, options({ phashRegistry: postWide }) as never);
    funnel.registerPlacedPhotos(postWide, a.clean);

    const b = await funnel.refineHeadingCandidates([cand('https://img.example.com/b-repost-of-a1.jpg')] as never, options({ phashRegistry: postWide }) as never);
    expect(b.duplicates).toBe(1);
    expect(b.clean).toEqual([]);
  });

  it('(c) 한 소제목 안에서 같은 사진이 두 번 들어오면 걸린다 — 한 번의 깔때기 안에서도, 티어를 넘어서도', async () => {
    hashOfUrl.set('https://img.example.com/one.jpg', SHOT_X);
    hashOfUrl.set('https://img.example.com/one-again.jpg', SHOT_X);
    hashOfUrl.set('https://img.example.com/one-later-tier.jpg', SHOT_X ^ 0b1n);
    const postWide = funnel.createPhashRegistry();
    const thisHeading = funnel.createPhashRegistry();

    const round1 = await funnel.refineHeadingCandidates(
      [cand('https://img.example.com/one.jpg'), cand('https://img.example.com/one-again.jpg')] as never,
      options({ phashRegistry: postWide, headingPhashRegistry: thisHeading }) as never,
    );
    expect(round1.duplicates).toBe(1);
    expect(round1.clean).toHaveLength(1);

    const round2 = await funnel.refineHeadingCandidates(
      [cand('https://img.example.com/one-later-tier.jpg')] as never,
      options({ phashRegistry: postWide, headingPhashRegistry: thisHeading }) as never,
    );
    expect(round2.duplicates).toBe(1);
    expect(round2.clean).toEqual([]);
    expect(postWide.hashes).toEqual([]);
  });

  it('레지스트리를 안 넘겨도 한 번의 호출 안 중복은 걸린다 (호출 사이에는 아무것도 남지 않는다)', async () => {
    hashOfUrl.set('https://img.example.com/p.jpg', SHOT_X);
    hashOfUrl.set('https://img.example.com/q.jpg', SHOT_X);
    const first = await funnel.refineHeadingCandidates([cand('https://img.example.com/p.jpg'), cand('https://img.example.com/q.jpg')] as never, options() as never);
    expect(first.duplicates).toBe(1);
    const second = await funnel.refineHeadingCandidates([cand('https://img.example.com/q.jpg')] as never, options() as never);
    expect(second.duplicates).toBe(0);
  });
});

describe('harness: 글 전체 목록에는 실제로 칸에 놓은 사진만 올라간다', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.refine.mockReset();
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => { fn(); return 0; }) as never);
  });
  afterEach(() => { vi.doUnmock('../crawler/issueHarness/funnel.js'); });

  async function run(headings: string[]) {
    const empty = (name: string) => ({ name, search: async () => [] });
    vi.doMock('../crawler/issueHarness/funnel.js', async (importActual) => ({
      ...(await importActual<typeof import('../crawler/issueHarness/funnel.js')>()),
      refineHeadingCandidates: mocks.refine,
    }));
    vi.doMock('../crawler/issueHarness/sources/naverApiSource.js', () => ({
      naverApiSource: { name: 'naver', search: async (q: string) => (q.startsWith('K:') ? [cand(`https://img.example.com/${q.slice(2)}-seed.jpg`)] : []) },
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
        querySets: headings.map((heading) => ({ heading, koreanQuery: `K:${heading}`, englishQuery: '', fandomQuery: '', eventQuery: '', broaderQuery: '' })),
      }),
    }));
    const { collectIssueImages } = await import('../crawler/issueHarness/harness.js');
    return collectIssueImages({ title: '김연아 은퇴', headings: headings.map((title) => ({ title })) }, { visionRoute: route });
  }

  it('소제목마다 깔때기가 받는 글 전체 목록에는 앞 소제목이 실제로 놓은 사진의 해시만 있다', async () => {
    const seen: Array<{ heading: string; postWide: bigint[] }> = [];
    mocks.refine.mockImplementation(async (pool: Array<{ url: string }>, opts: { subjectContext: { heading: string }; phashRegistry: { hashes: bigint[] } }) => {
      const h = opts.subjectContext.heading;
      seen.push({ heading: h, postWide: [...opts.phashRegistry.hashes] });
      // Every heading's funnel keeps two clean photos; the harness places only one (target 1).
      return {
        clean: [fetched(`https://img.example.com/${h}-placed.jpg`, h === 'H1' ? SHOT_X : 5n), fetched(`https://img.example.com/${h}-spare.jpg`, h === 'H1' ? SHOT_Y : 6n)],
        fetched: 2, duplicates: 0, visionUsed: true, watermarkRejected: 0, attemptedUrls: pool.map((c) => c.url),
      };
    });
    const result = await run(['H1', 'H2', 'H3']);
    expect(seen.map((s) => s.heading)).toEqual(['H1', 'H2', 'H3']);
    expect(seen[0].postWide).toEqual([]);
    expect(seen[1].postWide).toEqual([SHOT_X]);          // the spare photo (SHOT_Y) of H1 is NOT in the list
    expect(seen[2].postWide).toEqual([SHOT_X, 5n]);
    expect(result.images.H1).toEqual(['https://img.example.com/H1-placed.jpg']);
  });

  it('한 소제목의 여러 라운드는 같은 소제목 레지스트리를 공유하고, 다른 소제목은 새것을 받는다', async () => {
    const perHeading = new Map<string, unknown[]>();
    mocks.refine.mockImplementation(async (pool: Array<{ url: string }>, opts: { subjectContext: { heading: string }; headingPhashRegistry?: unknown }) => {
      const list = perHeading.get(opts.subjectContext.heading) ?? [];
      list.push(opts.headingPhashRegistry);
      perHeading.set(opts.subjectContext.heading, list);
      return { clean: [], fetched: 0, duplicates: 0, visionUsed: true, watermarkRejected: 0, attemptedUrls: pool.map((c) => c.url) };
    });
    await run(['H1', 'H2']);
    const h1 = perHeading.get('H1')!;
    const h2 = perHeading.get('H2')!;
    expect(h1.length).toBeGreaterThanOrEqual(1);
    expect(h1[0]).toBeTruthy();
    expect(new Set(h1).size).toBe(1);
    expect(h2[0]).toBeTruthy();
    expect(h2[0]).not.toBe(h1[0]);
  });
});
