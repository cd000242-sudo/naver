import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveShoppingRepresentativeReference } from '../image/shoppingReferenceGeneration.js';
import {
  SHOPPING_COLLECT_HOST_MARKERS,
  SHOPPING_COLLECT_SHORT_URL_PATTERN,
  applyShoppingCollectedToContent,
  buildShoppingCollectedImages,
  collectImageTabUrlImages,
  isShoppingCollectUrl,
  mergeShoppingCollectedIntoContent,
  pickShoppingLocalSavedImages,
} from '../renderer/utils/shoppingCollectToPool.js';

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

/** The cleanup logic exactly as it was written inline in publishingHandlers (before extraction). */
function legacyCleanup(urls: string[], content: any, aiMode: boolean) {
  const collectedImages = urls.map((imgUrl: string, idx: number) => ({
    url: imgUrl,
    filePath: imgUrl,
    heading: `제품 이미지 ${idx + 1}`,
    provider: 'collected',
    source: idx === 0 ? 'product-main' : 'product-gallery',
    isRepresentative: idx === 0,
  }));
  const images = aiMode ? [] : [...collectedImages, ...(content.images || [])];
  const pool = resolveShoppingRepresentativeReference([
    ...collectedImages,
    ...(content.collectedImages || []),
  ]).images;
  return { collectedImages, images, pool };
}

const URLS = ['https://img.test/a.jpg', 'https://img.test/b.jpg', 'https://img.test/c.jpg'];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildShoppingCollectedImages (pure)', () => {
  it('marks only the first image as the representative product-main', () => {
    const built = buildShoppingCollectedImages(URLS);
    expect(built).toHaveLength(3);
    expect(built[0]).toMatchObject({ isRepresentative: true, source: 'product-main', heading: '제품 이미지 1', provider: 'collected' });
    expect(built[1]).toMatchObject({ isRepresentative: false, source: 'product-gallery', heading: '제품 이미지 2' });
    expect(built.every((img) => img.url === img.filePath)).toBe(true);
  });

  it('does not mutate its input and returns fresh objects each call', () => {
    const input = [...URLS];
    const first = buildShoppingCollectedImages(input);
    const second = buildShoppingCollectedImages(input);
    expect(input).toEqual(URLS);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });
});

describe('pickShoppingLocalSavedImages (pure)', () => {
  it('uses the saved list when it has entries, otherwise keeps the original', () => {
    const original = buildShoppingCollectedImages(URLS);
    const saved = original.map((img) => ({ ...img, localPath: `C:\\x\\${img.heading}.jpg` }));
    expect(pickShoppingLocalSavedImages(original, saved)).toEqual(saved);
    const kept = pickShoppingLocalSavedImages(original, []);
    expect(kept).toEqual(original);
    expect(kept).not.toBe(original);
  });
});

describe('mergeShoppingCollectedIntoContent / applyShoppingCollectedToContent', () => {
  it('matches the legacy inline logic for prepend and clear policies, without touching the input', () => {
    const collected = buildShoppingCollectedImages(URLS);
    const content = {
      images: [{ url: 'https://img.test/old.jpg' }],
      collectedImages: [{ url: URLS[1], filePath: URLS[1] }, { url: 'https://img.test/z.jpg', filePath: 'https://img.test/z.jpg' }],
    };
    const snapshot = JSON.parse(JSON.stringify(content));

    const prepend = mergeShoppingCollectedIntoContent(content, collected, 'prepend');
    const legacyPrepend = legacyCleanup(URLS, content, false);
    expect(prepend.images).toEqual(legacyPrepend.images);
    expect(prepend.collectedImages).toEqual(legacyPrepend.pool);

    const clear = mergeShoppingCollectedIntoContent(content, collected, 'clear');
    expect(clear.images).toEqual([]);
    expect(clear.collectedImages).toEqual(legacyCleanup(URLS, content, true).pool);

    expect(content).toEqual(snapshot);
  });

  it('dedupes against the existing pool and keeps the representative first', () => {
    const collected = buildShoppingCollectedImages(URLS);
    const content = { collectedImages: [{ url: URLS[1], filePath: URLS[1] }, { url: 'https://img.test/z.jpg', filePath: 'https://img.test/z.jpg' }] };
    const merged = mergeShoppingCollectedIntoContent(content, collected, 'keep');
    const urls = merged.collectedImages.map((img: any) => img.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain('https://img.test/z.jpg');
    expect(urls[0]).toBe(URLS[0]);
  });

  it('keep policy leaves content.images alone; apply keeps the same object identity', () => {
    const content: any = { images: [{ url: 'https://img.test/old.jpg' }], collectedImages: [] };
    const before = content.images;
    const result = applyShoppingCollectedToContent(content, buildShoppingCollectedImages(URLS), 'keep');
    expect(result).toBe(content);
    expect(content.images).toBe(before);
    expect(content.collectedImages.length).toBe(3);
  });

  it('apply with prepend/clear sets images the same way the full-auto path did', () => {
    const a: any = { images: [{ url: 'https://img.test/old.jpg' }] };
    applyShoppingCollectedToContent(a, buildShoppingCollectedImages(URLS), 'prepend');
    expect(a.images).toHaveLength(4);
    const b: any = { images: [{ url: 'https://img.test/old.jpg' }] };
    applyShoppingCollectedToContent(b, buildShoppingCollectedImages(URLS), 'clear');
    expect(b.images).toEqual([]);
  });
});

describe('isShoppingCollectUrl — same criterion as the main collector', () => {
  it('accepts shopping malls and short links, rejects ordinary pages', () => {
    for (const url of [
      'https://brand.naver.com/x/products/1',
      'https://smartstore.naver.com/x/products/1',
      'https://brandconnect.naver.com/abc',
      'https://www.coupang.com/vp/products/1',
      'https://link.coupang.com/a/abc',
      'https://coupa.ng/abc',
      'https://naver.me/abc',
      'https://bit.ly/abc',
      'https://goo.gl/abc',
      'https://t.ly/abc',
      'https://tinyurl.com/abc',
    ]) {
      expect(isShoppingCollectUrl(url), url).toBe(true);
    }
    for (const url of ['https://blog.naver.com/a/1', 'https://news.naver.com/x', 'https://www.youtube.com/watch?v=1', '', undefined, null]) {
      expect(isShoppingCollectUrl(url as any), String(url)).toBe(false);
    }
  });

  it('pins the exact short-link regex and host markers written in imageCollectShoppingHandlers.ts', () => {
    const main = read('src', 'main', 'ipc', 'imageCollectShoppingHandlers.ts');
    const short = main.match(/const SHORT_URL_PATTERNS = \/(.+)\/;/);
    expect(short).not.toBeNull();
    expect(SHOPPING_COLLECT_SHORT_URL_PATTERN.source).toBe(short![1]);
    const detect = main.slice(main.indexOf('const isBrandStore'), main.indexOf('let images: string[]'));
    const hosts = [...detect.matchAll(/url\.includes\('([^']+)'\)/g)].map((m) => m[1]);
    expect(hosts).toEqual([...SHOPPING_COLLECT_HOST_MARKERS]);
  });
});

function stubLocalSave() {
  const save = vi.fn(async (items: Array<{ url: string }>) => ({
    savedImages: items.map((_, i) => ({ filePath: `C:\\pool\\img-${i}.jpg` })),
    folderPath: 'C:\\pool',
  }));
  vi.stubGlobal('window', { api: { downloadAndSaveMultipleImages: save } });
  return save;
}

describe('collectImageTabUrlImages — routing and failure handling', () => {
  const shoppingOk = { success: true, images: URLS, title: '상품', productInfo: { name: '상품명' } };

  it('shopping address -> collectImagesFromShopping only, pool filled like full-auto', async () => {
    const save = stubLocalSave();
    const api = {
      collectImagesFromShopping: vi.fn(async () => shoppingOk),
      crawlImagesFromUrl: vi.fn(),
    };
    const content: any = { images: [], collectedImages: [] };
    const result = await collectImageTabUrlImages(api as any, 'https://brand.naver.com/x/products/1', { title: '내 제목', content });
    expect(api.collectImagesFromShopping).toHaveBeenCalledWith('https://brand.naver.com/x/products/1');
    expect(api.crawlImagesFromUrl).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('shopping');
    expect(result.imageUrls).toEqual(URLS);
    expect(result.pooledImages).toHaveLength(3);
    expect(result.pooledImages[0]).toMatchObject({ isRepresentative: true, localPath: 'C:\\pool\\img-0.jpg' });
    expect(result.folderPath).toBe('C:\\pool');
    expect(result.poolSynced).toBe(true);
    expect(content.collectedImages).toHaveLength(3);
    expect(content.images).toEqual([]);
  });

  it('shopping address without a current post still collects, and says the pool was not synced', async () => {
    stubLocalSave();
    const api = { collectImagesFromShopping: vi.fn(async () => shoppingOk), crawlImagesFromUrl: vi.fn() };
    const result = await collectImageTabUrlImages(api as any, 'https://naver.me/abc', { title: '', content: null });
    expect(result.ok && result.poolSynced).toBe(false);
    expect(api.crawlImagesFromUrl).not.toHaveBeenCalled();
  });

  it('shopping failure shows the main collector message verbatim and never falls back to the crawler', async () => {
    const message = '쿠팡은 현재 공개 상품 페이지가 Access Denied로 차단되어 이미지 자동수집이 안정적으로 동작하지 않습니다.';
    const api = {
      collectImagesFromShopping: vi.fn(async () => ({ success: false, message, requiresCoupangApi: true })),
      crawlImagesFromUrl: vi.fn(async () => ({ success: true, images: URLS })),
    };
    const result = await collectImageTabUrlImages(api as any, 'https://link.coupang.com/a/abc', { title: '', content: null });
    expect(result).toEqual({ ok: false, kind: 'shopping', message });
    expect(api.crawlImagesFromUrl).not.toHaveBeenCalled();
  });

  it('shopping zero images and thrown errors both stop with a reason, no crawler', async () => {
    const empty = { collectImagesFromShopping: vi.fn(async () => ({ success: true, images: [] })), crawlImagesFromUrl: vi.fn() };
    const r1 = await collectImageTabUrlImages(empty as any, 'https://smartstore.naver.com/x/products/1', { title: '', content: null });
    expect(r1.ok).toBe(false);
    expect(!r1.ok && r1.message.length).toBeGreaterThan(0);
    const boom = { collectImagesFromShopping: vi.fn(async () => { throw new Error('연결 끊김'); }), crawlImagesFromUrl: vi.fn() };
    const r2 = await collectImageTabUrlImages(boom as any, 'https://smartstore.naver.com/x/products/1', { title: '', content: null });
    expect(!r2.ok && r2.message).toContain('연결 끊김');
    expect(empty.crawlImagesFromUrl).not.toHaveBeenCalled();
    expect(boom.crawlImagesFromUrl).not.toHaveBeenCalled();
  });

  it('ordinary address -> crawlImagesFromUrl only, as before', async () => {
    const api = {
      collectImagesFromShopping: vi.fn(),
      crawlImagesFromUrl: vi.fn(async () => ({ success: true, images: URLS, title: '페이지' })),
    };
    const result = await collectImageTabUrlImages(api as any, 'https://blog.naver.com/a/1', { title: '', content: null });
    expect(api.collectImagesFromShopping).not.toHaveBeenCalled();
    expect(api.crawlImagesFromUrl).toHaveBeenCalledWith('https://blog.naver.com/a/1');
    expect(result).toEqual({ ok: true, kind: 'crawl', imageUrls: URLS, title: '페이지', pooledImages: [], poolSynced: false });
    const failing = { collectImagesFromShopping: vi.fn(), crawlImagesFromUrl: vi.fn(async () => ({ success: false })) };
    const bad = await collectImageTabUrlImages(failing as any, 'https://blog.naver.com/a/1', { title: '', content: null });
    expect(bad).toEqual({ ok: false, kind: 'crawl', message: '페이지에서 이미지를 찾지 못했습니다' });
  });
});

describe('wiring — publishingHandlers, headingImageGen, copy-static', () => {
  const publishing = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
  const heading = read('src', 'renderer', 'modules', 'headingImageGen.ts');
  const copyStatic = read('scripts', 'copy-static.mjs');
  const util = read('src', 'renderer', 'utils', 'shoppingCollectToPool.ts');

  it('publishingHandlers calls the extracted helpers and keeps its log lines and order', () => {
    expect(publishing).toContain("from '../utils/shoppingCollectToPool.js'");
    expect(publishing).toContain('prepareShoppingCollectedImages(');
    expect(publishing).toContain('applyShoppingCollectedToContent(');
    expect(publishing).not.toContain("'product-main'");
    const a = publishing.indexOf('제품 이미지 ${collectResult.images.length}개 수집 완료!');
    const b = publishing.indexOf('수집 이미지 저장 위치');
    const c = publishing.indexOf('structuredContent.images/collectedImages에 수집 이미지 동기화');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(publishing).toContain('(window as any).api.collectImagesFromShopping(formData.affiliateLink)');
  });

  it('the image-tab URL handler goes through the shared collector, not a direct crawler call', () => {
    const start = heading.indexOf("getElementById('url-only-collect-btn')");
    const end = heading.indexOf("getElementById('ai-auto-collect-save-btn')");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const region = heading.slice(start, end);
    expect(region).toContain('collectImageTabUrlImages(');
    expect(region).not.toMatch(/api\.crawlImagesFromUrl\(/);
    expect(heading).toContain("from '../utils/shoppingCollectToPool.js'");
    // The hidden shopping button path stays untouched.
    expect(heading).toContain('window.api.collectImagesFromShopping(shoppingUrl)');
  });

  it('keeps the shopping address list in one place only', () => {
    expect(heading).not.toMatch(/naver\\\.me/);
    expect(publishing).not.toMatch(/naver\\\.me/);
  });

  it('registers the util in the inline bundle after its dependency, with no window lookup of bundle functions', () => {
    const dep = copyStatic.indexOf("'shoppingImageLocalSave.js'");
    const self = copyStatic.indexOf("'shoppingCollectToPool.js'");
    expect(dep).toBeGreaterThan(-1);
    expect(self).toBeGreaterThan(dep);
    expect(util).toContain("from './shoppingImageLocalSave.js'");
    expect(util).not.toMatch(/window as any\)\??\.(saveCollectedShoppingImagesToLocal|resolveShoppingRepresentativeReference)/);
    expect(util.split('\n').length).toBeLessThanOrEqual(300);
  });
});
