import { describe, expect, it, vi } from 'vitest';
import { collectDailyImages, type DailyCollectDeps } from '../main/services/dailyImageCollect.js';
import { dailyImageSourceTier } from '../main/services/dailyImageSourcePolicy.js';
import { completeDailyImages, missingDailyImageItems } from '../main/services/dailyImageRefill.js';
import { validateDailyPlans } from '../scheduler/dailyPublishingModel.js';

const candidate = (url: string, pageUrl?: string) => ({ url, pageUrl, sourceName: 'naver-api', query: 'q' });
const slotsFor = (headings: string[]) => missingDailyImageItems({ title: '제목', headings, images: [] });
function deps(collected: Awaited<ReturnType<DailyCollectDeps['collect']>>, broken: string[] = [], sameAs: Record<string, string> = {}): DailyCollectDeps & { saved: string[] } {
  const saved: string[] = [];
  // Each distinct photo gets its own 12-bit block of ones, so two different photos differ by 24 bits; a copy hashes identically.
  const ids = new Map<string, number>();
  const hash = (url: string) => {
    const key = sameAs[url] || url;
    if (!ids.has(key)) ids.set(key, ids.size);
    return 0xFFFn << BigInt(ids.get(key)! * 12);
  };
  return {
    saved,
    collect: vi.fn(async () => collected),
    fetch: vi.fn(async (c) => (broken.includes(c.url) ? null : { buffer: Buffer.from(c.url), dhash: hash(c.url) })),
    save: vi.fn(async (buffer: Buffer) => { saved.push(buffer.toString()); return `C:/collected/${saved.length}.jpg`; }),
  };
}

describe('daily image source tiers (official first, then news, then search, then personal pages)', () => {
  it.each([
    ['https://program.kbs.co.kr/2tv/drama/abc/pc/index.html', 0], ['https://www.tving.com/contents/P001', 0], ['https://www.korea.kr/briefing', 0],
    ['https://news.samsung.com/kr/newsroom', 0], ['https://www.yna.co.kr/view/AKR2026', 1], ['https://n.news.naver.com/article/001/1', 1],
    ['https://www.example-daily.com/news/articleView.html?idxno=1', 1], ['https://search.naver.com/search.naver?query=a', 2], [undefined, 2],
    ['https://blog.naver.com/someone/1', 3], ['https://www.instagram.com/p/x', 3], ['https://www.coupang.com/vp/products/1', 3],
    // 2026-10-29 실측: photos usually carry only the image server address.
    ['https://imgnews.naver.net/image/001/2026/x.jpg', 1], ['https://cdn.autotribune.co.kr/news/photo/x.jpg', 1],
    ['https://pup-post-phinf.pstatic.net/x.jpg', 3], ['https://shop1.phinf.naver.net/x.jpg', 3], ['https://blog.kakaocdn.net/dn/x.jpg', 3],
    ['https://t1.daumcdn.net/news/x.jpg', 2], ['https://www.some-unknown-site.com/a', 2],
  ] as const)('%s → tier %i', (url, tier) => {
    expect(dailyImageSourceTier(url)).toBe(tier);
  });
});

describe('collectDailyImages', () => {
  it('fills each heading with an official photo before a news photo, thumbnail first', async () => {
    const d = deps({
      images: { 하나: ['https://img/news1.jpg'] },
      candidates: {
        하나: [candidate('https://img/news1.jpg', 'https://www.yna.co.kr/view/1'), candidate('https://img/official1.jpg', 'https://program.kbs.co.kr/x')],
        둘: [candidate('https://img/official2.jpg', 'https://www.tving.com/contents/1')],
      },
    });
    const result = await collectDailyImages({ title: '제목', headings: ['하나', '둘'], slots: slotsFor(['하나', '둘']) }, d);
    expect(result.map(image => [image.heading, image.isThumbnail])).toEqual([['제목', true], ['하나', false], ['둘', false]]);
    expect(d.saved).toEqual(['https://img/official1.jpg', 'https://img/news1.jpg', 'https://img/official2.jpg']);
    expect(result[0].caption).toBe('출처: program.kbs.co.kr');
    // The thumbnail gets its own search: the title goes to the collector first.
    expect((d.collect as any).mock.calls[0][0].headings.map((h: { title: string }) => h.title)).toEqual(['제목', '하나', '둘']);
  });
  it('borrows an unused photo of the post when a heading found nothing, and skips dead links and near-duplicates', async () => {
    const d = deps({
      images: {},
      candidates: { 하나: [candidate('https://img/a.jpg'), candidate('https://img/dead.jpg'), candidate('https://img/a-copy.jpg'), candidate('https://img/b.jpg')], 둘: [] },
    }, ['https://img/dead.jpg'], { 'https://img/a-copy.jpg': 'https://img/a.jpg' });
    const result = await collectDailyImages({ title: '제목', headings: ['하나', '둘'], slots: slotsFor(['하나', '둘']).slice(1) }, d);
    expect(result.map(image => image.heading)).toEqual(['하나', '둘']);
    expect(d.saved).toEqual(['https://img/a.jpg', 'https://img/b.jpg']);
  });
  it('stops on cancel', async () => {
    const controller = new AbortController(); controller.abort();
    const d = { ...deps({ images: {}, candidates: { 하나: [candidate('https://img/a.jpg')] } }), signal: controller.signal };
    await expect(collectDailyImages({ title: '제목', headings: ['하나'], slots: slotsFor(['하나']) }, d)).rejects.toThrow('PUBLISH_CANCELLED');
  });
});

describe('completeDailyImages follows the plan order', () => {
  const headings = ['하나', '둘'];
  const make = (tag: string) => async (items: Array<{ heading: string }>) => items.map(item => ({ heading: item.heading, filePath: `C:/${tag}/${item.heading}.jpg` }));
  it('collect-first: photos, then the chosen AI engine, then free engines', async () => {
    const calls: string[] = [];
    const collect = vi.fn(async (items: Array<{ heading: string }>) => { calls.push('collect'); return make('photo')(items.slice(0, 1)); });
    const generate = vi.fn(async (provider: string, items: Array<{ heading: string }>) => { calls.push(provider); return provider === 'nano-banana-2' ? [] : make(provider)(items); });
    const result = await completeDailyImages({ mode: 'collect-first', title: '제목', headings, images: [], primaryProvider: 'nano-banana-2', collect, generate });
    expect(calls).toEqual(['collect', 'nano-banana-2', 'flow']);
    expect(result).toHaveLength(3);
  });
  it('ai-first: the AI images stay, photos fill the gaps, and free engines are not needed', async () => {
    const generate = vi.fn();
    const result = await completeDailyImages({ mode: 'ai-first', title: '제목', headings, primaryProvider: 'flow',
      images: [{ heading: '하나', filePath: 'C:/ai/1.png' }], collect: make('photo'), generate });
    expect(generate).not.toHaveBeenCalled();
    expect(result.map(image => image.filePath)).toEqual(['C:/photo/제목.jpg', 'C:/ai/1.png', 'C:/photo/둘.jpg']);
  });
  it('ai-generated never collects photos', async () => {
    const collect = vi.fn();
    await completeDailyImages({ mode: 'ai-generated', title: '제목', headings, images: [], collect, generate: async (p, items) => make(p)(items) });
    expect(collect).not.toHaveBeenCalled();
  });
  it('composes the cover from the title photo and a heading photo with one director call, not an AI engine', async () => {
    const makeThumbnail = vi.fn(async (_provider: string, photos: Array<{ filePath?: string }>) => ({ heading: 'x', filePath: `C:/cover/${photos.length}.png` }));
    const result = await completeDailyImages({ mode: 'collect-first', title: '제목', headings, images: [], primaryProvider: 'nano-banana-2',
      collect: make('photo'), makeThumbnail, generate: vi.fn() });
    expect(makeThumbnail).toHaveBeenCalledTimes(1);
    expect(makeThumbnail.mock.calls[0][1].map((photo: { filePath?: string }) => photo.filePath)).toEqual(['C:/photo/제목.jpg', 'C:/photo/하나.jpg']);
    expect(result[0]).toMatchObject({ filePath: 'C:/cover/2.png', isThumbnail: true, heading: '제목' });
    expect(result.map(image => image.filePath)).not.toContain('C:/photo/제목.jpg');
  });
  it('draws an AI cover when no photos, trying the chosen engine then the free ones', async () => {
    const tried: string[] = [];
    const makeThumbnail = vi.fn(async (provider: string) => {
      tried.push(provider);
      if (provider !== 'genspark') throw new Error('FLOW_BOT_BLOCKED');
      return { heading: 'x', filePath: 'C:/cover/ai.png' };
    });
    const result = await completeDailyImages({ mode: 'ai-generated', title: '제목', headings, primaryProvider: 'imagefx',
      images: [{ heading: '하나', filePath: 'C:/ai/1.png' }, { heading: '둘', filePath: 'C:/ai/2.png' }], makeThumbnail, generate: vi.fn() });
    expect(tried).toEqual(['flow', 'genspark']);
    expect(result[0]).toMatchObject({ filePath: 'C:/cover/ai.png', isThumbnail: true });
  });
  it('keeps the plain title photo as the cover when composing it fails', async () => {
    const result = await completeDailyImages({ mode: 'ai-first', title: '제목', headings, primaryProvider: 'flow',
      images: [{ heading: '하나', filePath: 'C:/ai/1.png' }, { heading: '둘', filePath: 'C:/ai/2.png' }],
      collect: make('photo'), makeThumbnail: async () => { throw new Error('compose failed'); }, generate: vi.fn() });
    expect(result[0]).toMatchObject({ filePath: 'C:/photo/제목.jpg', isThumbnail: true });
    // ai-first keeps the AI heading images; the heading photos were only for empty slots.
    expect(result.map(image => image.filePath)).toEqual(['C:/photo/제목.jpg', 'C:/ai/1.png', 'C:/ai/2.png']);
  });
  it('moves on when collection fails', async () => {
    const result = await completeDailyImages({ mode: 'collect-first', title: '제목', headings, images: [], primaryProvider: 'flow',
      collect: async () => { throw new Error('network'); }, generate: async (p, items) => make(p)(items) });
    expect(result).toHaveLength(3);
  });
});

describe('collect modes need the owner\'s copyright self-responsibility consent', () => {
  const plan = { accountId: 'a', categoryId: '1', enabled: true, mode: 'draft', slots: [{ time: '20:00', count: 1 }], generator: 'app-settings', topic: 't' };
  it.each(['ai-first', 'collect-first'])('%s refuses to start without consent but saves stopped', (imageMode) => {
    expect(() => validateDailyPlans([{ ...plan, imageMode }])).toThrow('DAILY_COLLECT_CONSENT_REQUIRED');
    expect(validateDailyPlans([{ ...plan, imageMode, imageCollectConsent: true }])[0]).toMatchObject({ imageMode, imageCollectConsent: true });
    expect(validateDailyPlans([{ ...plan, imageMode, enabled: false }])[0]).not.toHaveProperty('imageCollectConsent');
  });
  it('accepts only an explicit true', () => {
    expect(() => validateDailyPlans([{ ...plan, imageMode: 'ai-first', imageCollectConsent: 'yes' }])).toThrow('DAILY_PLAN_INVALID');
  });
});
