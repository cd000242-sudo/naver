import { describe, expect, it, vi } from 'vitest';
import {
  buildImageCollectConsent, COLLECT_CONSENT_REQUIRED_MESSAGE, IMAGE_COLLECT_CONSENT_VERSION, isImageCollectConsentValid,
} from '../runtime/collectPhotosPolicy.js';
import {
  COLLECT_PHOTOS_SCOPE, generateCollectedPhotos, isNewsOrOfficialPhoto, type CollectPhotosRuntime,
} from '../main/services/collectPhotosEngine.js';
import { collectDailyImages, type DailyCollectDeps } from '../main/services/dailyImageCollect.js';
import { createSiteNameResolver, extractOgSiteName } from '../main/services/collectPhotosSiteName.js';
import { ALLOWED_PROVIDER, assertProvider, type GenerateImagesOptions } from '../image/types.js';
import { getImageEngineSpec, IMAGE_ENGINE_CATALOG } from '../runtime/imageEngineCatalog.js';
import { retiredImageEngineChoices } from '../runtime/retiredImageEngines.js';
import { isAiGeneratedImage } from '../automation/imageProvenance.js';

const items = [
  { heading: '썸네일 제목', prompt: 'p', isThumbnail: true },
  { heading: '첫째 소제목', prompt: 'p1' },
  { heading: '둘째 소제목', prompt: 'p2' },
];
const baseOptions = { provider: 'collect-photos', items, postTitle: '글 제목' } as unknown as GenerateImagesOptions;
const good = buildImageCollectConsent(new Date('2026-11-03T00:00:00Z'));

function runtime(consent: unknown, photos: Array<{ heading: string; isThumbnail: boolean }>) {
  const collect = vi.fn(async () => photos.map(photo => ({ ...photo, filePath: `C:/img/${photo.heading}.jpg`, provider: 'collected' as const,
    sourceUrl: 'https://www.yna.co.kr/view/1', caption: '출처: 연합뉴스' })));
  const log = vi.fn();
  const impl: CollectPhotosRuntime = {
    loadConsent: async () => consent, buildDeps: () => ({} as DailyCollectDeps), collect, readPreview: async () => 'data:image/jpeg;base64,AA', log,
  };
  return { impl, collect, log };
}

describe('관련 사진 찾기 - 엔진 등록과 동의 계약', () => {
  it('엔진 값이 화이트리스트에 있고 AI 생성엔진 목록과 옛 엔진 재선택 목록에는 없다', () => {
    expect(ALLOWED_PROVIDER).toContain('collect-photos');
    expect(() => assertProvider('collect-photos')).not.toThrow();
    expect(IMAGE_ENGINE_CATALOG.map(e => e.value)).not.toContain('collect-photos');
    expect(retiredImageEngineChoices()).not.toContain('collect-photos');
    expect(getImageEngineSpec('collect-photos')?.costKrw).toBe(0);
  });

  it('동의 기록: 없음, 옛 버전, 날짜 없음은 무효이고 현재 버전은 유효하다', () => {
    expect(isImageCollectConsentValid(undefined)).toBe(false);
    expect(isImageCollectConsentValid({ version: IMAGE_COLLECT_CONSENT_VERSION - 1, agreedAt: '2026-11-03' })).toBe(false);
    expect(isImageCollectConsentValid({ version: IMAGE_COLLECT_CONSENT_VERSION })).toBe(false);
    expect(isImageCollectConsentValid(good)).toBe(true);
  });

  it('실사진은 AI 생성으로 판정되지 않는다 (엔진 값도 AI 허용 목록에 없다)', () => {
    expect(isAiGeneratedImage({ provider: 'collected', isCollected: true })).toBe(false);
    expect(isAiGeneratedImage({ provider: 'collect-photos' })).toBe(false);
    expect(isAiGeneratedImage({ provider: 'collected' })).toBe(false);
  });
});

describe('generateCollectedPhotos', () => {
  it('동의 기록이 없으면 한국어 오류로 멈추고 수집기를 부르지 않는다', async () => {
    const { impl, collect } = runtime(undefined, []);
    await expect(generateCollectedPhotos(baseOptions, undefined, impl)).rejects.toThrow(COLLECT_CONSENT_REQUIRED_MESSAGE);
    expect(collect).not.toHaveBeenCalled();
  });

  it('동의 문구 버전이 낮으면 다시 동의를 요구한다', async () => {
    const { impl, collect } = runtime({ version: 0, agreedAt: '2026-01-01T00:00:00Z' }, []);
    await expect(generateCollectedPhotos(baseOptions, undefined, impl)).rejects.toThrow('저작권 안내에 먼저 동의');
    expect(collect).not.toHaveBeenCalled();
  });

  it('동의가 있으면 자기 소제목 사진만 쓰는 범위로 수집기를 부르고 출처 캡션을 싣는다', async () => {
    const { impl, collect } = runtime(good, [{ heading: '첫째 소제목', isThumbnail: false }]);
    const seen: string[] = [];
    const images = await generateCollectedPhotos(baseOptions, image => seen.push(image.heading), impl);
    const input = (collect.mock.calls[0] as unknown[])[0] as { scope: unknown; headings: string[]; title: string };
    expect(input.scope).toEqual({ ownHeadingOnly: true });
    expect(input.headings).toEqual(['첫째 소제목', '둘째 소제목']);
    expect(input.title).toBe('글 제목');
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ provider: 'collected', isCollected: true, caption: '출처: 연합뉴스', disableTextOverlay: true, actualProvider: 'collected' });
    expect(images[0].previewDataUrl).toContain('data:image/jpeg');
    expect(seen).toEqual(['첫째 소제목']);
  });

  it('맞는 사진이 없는 칸은 비워 두고 개수를 알리며 다른 엔진을 부르지 않는다', async () => {
    const { impl, log } = runtime(good, [{ heading: '첫째 소제목', isThumbnail: false }]);
    const images = await generateCollectedPhotos(baseOptions, undefined, impl);
    expect(images.map(image => image.heading)).toEqual(['첫째 소제목']);
    expect(log.mock.calls.map(call => String(call[0])).join('\n')).toMatch(/2칸은 맞는 사진을 못 찾아 비워 둠/);
  });

  it('쇼핑커넥트 상품 이미지에는 쓰지 않는다', async () => {
    const { impl, collect } = runtime(good, []);
    await expect(generateCollectedPhotos({ ...baseOptions, isShoppingConnect: true }, undefined, impl)).rejects.toThrow('쇼핑커넥트');
    expect(collect).not.toHaveBeenCalled();
  });

  it('generateImages 는 이 엔진을 공통 입구에서 수집기로 보낸다', async () => {
    vi.resetModules();
    const spy = vi.fn(async () => []);
    vi.doMock('../main/services/collectPhotosEngine.js', () => ({ generateCollectedPhotos: spy }));
    const { generateImages } = await import('../imageGenerator.js');
    await generateImages(baseOptions);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.doUnmock('../main/services/collectPhotosEngine.js');
  });
});

describe('수집 범위', () => {
  it('뉴스, 공식, 통신사 출처만 통과하고 블로그, 커뮤니티, 모르는 호스트는 거른다', () => {
    const pass = (url: string, pageUrl?: string) => isNewsOrOfficialPhoto({ url, pageUrl, sourceName: 'x', query: 'q' });
    expect(pass('https://img.hankyung.com/a.jpg', 'https://www.hankyung.com/article/1')).toBe(true);
    expect(pass('https://imgnews.pstatic.net/image/001/a.jpg')).toBe(true);
    expect(pass('https://photo.xportsnews.com/a.jpg')).toBe(true);
    expect(pass('https://blogfiles.pstatic.net/a.jpg')).toBe(false);
    expect(pass('https://img.dcinside.com/a.jpg', 'https://gall.dcinside.com/1')).toBe(false);
    expect(pass('https://example.org/a.jpg')).toBe(false);
    const allowed = COLLECT_PHOTOS_SCOPE.allowedSources || [];
    for (const excluded of ['reddit', 'dcinside', 'yandex', 'duckduckgo', 'google', 'youtube']) expect(allowed).not.toContain(excluded);
  });

  it('범위가 없으면 예전처럼 다른 소제목 사진을 빌려 채우고, 자기 소제목만 쓰면 빈 칸으로 둔다', async () => {
    const slots = [1, 2].map(n => ({ heading: `H${n}`, prompt: 'p', englishPrompt: 'p', isThumbnail: false, imageRatio: '1:1' }));
    const make = (): DailyCollectDeps => ({
      collect: async () => ({ images: {}, candidates: { H1: [{ url: 'https://a/1.jpg', sourceName: 's', query: 'q' }, { url: 'https://a/2.jpg', sourceName: 's', query: 'q' }], H2: [] } }),
      fetch: async c => ({ buffer: Buffer.from('x'), dhash: c.url.endsWith('1.jpg') ? 0n : (1n << 40n) - 1n }),
      save: async (_b, slot) => `C:/img/${slot.heading}.jpg`,
    });
    const input = { title: 'T', headings: ['H1', 'H2'], slots };
    expect((await collectDailyImages(input, make())).map(i => i.heading)).toEqual(['H1', 'H2']);
    expect((await collectDailyImages({ ...input, scope: { ownHeadingOnly: true } }, make())).map(i => i.heading)).toEqual(['H1']);
  });

  it('언론사 이름은 og:site_name 에서 읽고 없으면 비워 호스트로 내려가며 호스트당 한 번만 읽는다', async () => {
    expect(extractOgSiteName('<meta property="og:site_name" content="한국경제">')).toBe('한국경제');
    expect(extractOgSiteName('<meta content="연합뉴스" property="og:site_name"/>')).toBe('연합뉴스');
    expect(extractOgSiteName('<html></html>')).toBeUndefined();
    const fetchPage = vi.fn(async () => '<meta property="og:site_name" content="한국경제">');
    const resolve = createSiteNameResolver(fetchPage);
    expect(await resolve('https://www.hankyung.com/a')).toBe('한국경제');
    expect(await resolve('https://www.hankyung.com/b')).toBe('한국경제');
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(await createSiteNameResolver(async () => { throw new Error('x'); })('https://a.com/x')).toBeUndefined();
  });
});
