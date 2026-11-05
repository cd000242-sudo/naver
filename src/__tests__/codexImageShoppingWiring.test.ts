// generateImages -> Codex branch for shopping-connect: the representative product photo is cleaned and handed to the
// generator as the reference; the thumbnail is never generated; nothing falls back to another engine or to no reference.
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { GenerateImagesOptions } from '../image/types.js';

const generatedFor = (items: Array<{ heading: string }>) => items.map((item) => ({
  heading: item.heading, filePath: `C:/img/${item.heading}.png`, previewDataUrl: 'data:image/png;base64,AA', provider: 'codex-image',
}));

async function productPhotoDataUrl(): Promise<string> {
  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 30, g: 120, b: 200 } } }).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

function shoppingOptions(extra: Record<string, unknown>): GenerateImagesOptions {
  return {
    provider: 'codex-image', postTitle: '쇼핑 글 제목', stopCheck: () => false, isShoppingConnect: true,
    items: [
      { heading: '대표 썸네일', prompt: '썸네일 프롬프트', englishPrompt: 'thumbnail prompt', isThumbnail: true },
      { heading: '첫째 소제목', prompt: '첫째 프롬프트', englishPrompt: 'first prompt' },
      { heading: '둘째 소제목', prompt: '둘째 프롬프트', englishPrompt: 'second prompt' },
    ],
    ...extra,
  } as unknown as GenerateImagesOptions;
}

afterEach(() => {
  vi.doUnmock('../image/codex/codexImageGenerator.js');
  vi.doUnmock('../image/referenceImageLoader.js');
});

describe('generateImages — Codex 구독 이미지 + 쇼핑커넥트', () => {
  it('대표 사진을 정리해 참고 사진으로 넘기고, 썸네일은 생성 대상에서 뺀다', async () => {
    vi.resetModules();
    const spy = vi.fn(async (items: Array<{ heading: string }>) => generatedFor(items));
    vi.doMock('../image/codex/codexImageGenerator.js', () => ({ generateWithCodexImage: spy }));
    const { generateImages } = await import('../imageGenerator.js');

    const images = await generateImages(shoppingOptions({ collectedImages: [await productPhotoDataUrl()] }));

    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0] as unknown as [Array<{ heading: string }>, unknown, unknown, unknown, unknown, Record<string, unknown>];
    expect(call[0].map((item) => item.heading)).toEqual(['첫째 소제목', '둘째 소제목']);
    const reference = call[5].referenceImage as { buffer: Buffer; fileName: string; sha256: string; width: number };
    expect(reference.fileName).toBe('reference-01.png');
    expect(reference.buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG signature
    expect(reference.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(reference.width).toBe(640);
    expect(call[5].allowPartial).toBe(false);
    // Thumbnail = the collected original, not an AI image; the two section images are the engine's.
    expect(images).toHaveLength(3);
    expect(images.filter((image) => image.provider === 'codex-image')).toHaveLength(2);
  });

  it('쇼핑이 아니면 참고 사진을 만들지도 넘기지도 않는다', async () => {
    vi.resetModules();
    const spy = vi.fn(async (items: Array<{ heading: string }>) => generatedFor(items));
    vi.doMock('../image/codex/codexImageGenerator.js', () => ({ generateWithCodexImage: spy }));
    const { generateImages } = await import('../imageGenerator.js');

    await generateImages(shoppingOptions({ isShoppingConnect: false, collectedImages: [await productPhotoDataUrl()] }));

    const options = (spy.mock.calls[0] as unknown[])[5] as Record<string, unknown>;
    expect('referenceImage' in options).toBe(false);
  });

  it('불러온 대표 사진을 정리하지 못하면 정해진 문구로 멈추고 생성기를 부르지 않는다 (참고 없는 생성 · 다른 엔진 없음)', async () => {
    vi.resetModules();
    const spy = vi.fn(async (items: Array<{ heading: string }>) => generatedFor(items));
    vi.doMock('../image/codex/codexImageGenerator.js', () => ({ generateWithCodexImage: spy }));
    // The loader hands back bytes that sharp cannot read (the loader's own check is bypassed on purpose).
    vi.doMock('../image/referenceImageLoader.js', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../image/referenceImageLoader.js')>()),
      loadReferenceImageData: vi.fn(async () => ({ buffer: Buffer.from('not an image'), mimeType: 'image/png', source: 'C:/managed/product.png' })),
    }));
    const { generateImages } = await import('../imageGenerator.js');

    await expect(generateImages(shoppingOptions({ collectedImages: [await productPhotoDataUrl()] }))).rejects.toThrow(
      /\[Codex 구독 이미지\][\s\S]*SHOPPING_REFERENCE_LOAD_FAILED: Codex 구독 이미지가 대표 상품 사진을 불러오지 못해 멈췄습니다/,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('수집된 대표 사진이 아예 없으면 기존 가드가 먼저 멈춘다 (생성기를 부르지 않는다)', async () => {
    vi.resetModules();
    const spy = vi.fn(async (items: Array<{ heading: string }>) => generatedFor(items));
    vi.doMock('../image/codex/codexImageGenerator.js', () => ({ generateWithCodexImage: spy }));
    const { generateImages } = await import('../imageGenerator.js');

    await expect(generateImages(shoppingOptions({ collectedImages: [] }))).rejects.toThrow(/대표 이미지가 없어 원본 대체 없이 중단/);
    expect(spy).not.toHaveBeenCalled();
  });
});
