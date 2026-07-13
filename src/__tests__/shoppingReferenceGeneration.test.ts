import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  applyShoppingRepresentativeReference,
  assertShoppingAiReferenceAvailable,
  buildReferenceSafeFallbackParts,
  buildShoppingReferencePrompt,
  canUseReferenceFreeImageFallback,
  createShoppingRepresentativeThumbnail,
  isShoppingReferenceImageEngine,
  isShoppingSelectableReferenceEngine,
  resolveShoppingCollectedImagePlacement,
  resolveShoppingImageGenerationPolicy,
  resolveShoppingRepresentativeReference,
  resolveUsableShoppingReferenceSource,
} from '../image/shoppingReferenceGeneration';

describe('shopping representative image-to-image policy', () => {
  it.each([
    'nano-banana-2',
    'nano-banana-pro',
    'openai-image',
    'dropshot',
  ])('allows the supported reference engine %s', (engine) => {
    expect(isShoppingReferenceImageEngine(engine)).toBe(true);
  });

  it.each(['flow', 'prodia', 'imagefx', 'collected'])('does not present %s as reference generation', (engine) => {
    expect(isShoppingReferenceImageEngine(engine)).toBe(false);
  });

  it.each(['nano-banana-2', 'openai-image', 'dropshot'])('allows %s in shopping mode selectors', (engine) => {
    expect(isShoppingSelectableReferenceEngine(engine)).toBe(true);
  });

  it.each(['nano-banana', 'nano-banana-pro', 'flow', 'prodia'])('keeps %s out of shopping mode selectors', (engine) => {
    expect(isShoppingSelectableReferenceEngine(engine)).toBe(false);
  });

  it('selects the official representative before review images', () => {
    const review = {
      url: 'https://example.com/review.jpg',
      source: 'review',
      referenceImageUrl: 'https://example.com/review.jpg',
    };
    const representative = {
      url: 'https://example.com/product-main.jpg',
      source: 'official product gallery',
      isRepresentative: true,
    };

    const resolved = resolveShoppingRepresentativeReference([review, representative, review]);

    expect(resolved.referenceUrl).toBe(representative.url);
    expect(resolved.images).toEqual([representative, review]);
  });

  it('honors an explicitly supplied representative before untyped collected URLs', () => {
    const explicitRepresentative = 'https://example.com/product-main.jpg';
    const reviewImage = 'https://example.com/review-first.jpg';

    const resolved = resolveShoppingRepresentativeReference(
      [reviewImage],
      explicitRepresentative,
    );

    expect(resolved.referenceUrl).toBe(explicitRepresentative);
    expect(resolved.images).toEqual([explicitRepresentative, reviewImage]);
  });

  it('prefers the downloaded original file over an expiring remote URL', () => {
    const savedRepresentative = {
      url: 'C:\\images\\product-main.jpg',
      filePath: 'C:\\images\\product-main.jpg',
      localPath: 'C:\\images\\product-main.jpg',
      originalUrl: 'https://shop.example.com/product-main.jpg?expires=1',
      referenceImageUrl: 'https://shop.example.com/product-main.jpg?expires=1',
      isRepresentative: true,
    };

    const resolved = resolveShoppingRepresentativeReference([savedRepresentative]);
    const thumbnail = createShoppingRepresentativeThumbnail(savedRepresentative, '대표');

    expect(resolved.referenceUrl).toBe(savedRepresentative.localPath);
    expect(thumbnail.url).toBe(savedRepresentative.localPath);
    expect(thumbnail.filePath).toBe(savedRepresentative.localPath);
  });

  it('falls back to the remote original when the saved representative file was deleted', async () => {
    const missingLocalPath = 'C:\\missing\\product-main.jpg';
    const remoteOriginal = 'https://shop.example.com/product-main.jpg';
    const checkFileExists = async (filePath: string) => filePath !== missingLocalPath;

    const source = await resolveUsableShoppingReferenceSource({
      localPath: missingLocalPath,
      originalUrl: remoteOriginal,
      isRepresentative: true,
    }, checkFileExists);

    expect(source).toBe(remoteOriginal);
  });

  it('keeps the representative out of the first collected subheading slot', () => {
    const review = { url: 'https://example.com/review.jpg', source: 'review' };
    const representative = {
      url: 'https://example.com/product-main.jpg',
      source: 'product-main',
      isRepresentative: true,
    };
    const detail = { url: 'https://example.com/detail.jpg', source: 'product-gallery' };

    const placement = resolveShoppingCollectedImagePlacement([review, representative, detail, review]);

    expect(placement.representative).toBe(representative);
    expect(placement.subheadingImages).toEqual([review, detail]);
    expect(placement.subheadingImages).not.toContain(representative);
  });

  it('ignores malformed candidates before selecting a representative', () => {
    const representative = {
      url: 'https://example.com/product-main.jpg',
      isRepresentative: true,
    };

    const resolved = resolveShoppingRepresentativeReference([
      undefined,
      {},
      'not-an-image',
      representative,
    ]);

    expect(resolved.referenceUrl).toBe(representative.url);
    expect(resolved.images).toEqual([representative]);
  });

  it('forces the same representative onto every item without mutating the input', () => {
    const original = [{
      heading: '소음과 풍량',
      prompt: 'show airflow',
      referenceImageUrl: 'https://example.com/wrong-review.jpg',
      referenceImageList: ['https://example.com/wrong-review.jpg'],
    }];

    const [item] = applyShoppingRepresentativeReference(
      original,
      'https://example.com/product-main.jpg',
    );

    expect(item.referenceImagePath).toBe('https://example.com/product-main.jpg');
    expect(item.referenceImageUrl).toBe('https://example.com/product-main.jpg');
    expect(item.referenceImageList).toEqual(['https://example.com/product-main.jpg']);
    expect(original[0].referenceImageUrl).toBe('https://example.com/wrong-review.jpg');
  });

  it('keeps the representative product image unchanged as the shopping thumbnail', () => {
    const representative = {
      url: 'https://shop.example.com/product-main.jpg',
      source: 'product-main',
      isRepresentative: true,
    };

    expect(createShoppingRepresentativeThumbnail(representative, '상품 후기')).toEqual(expect.objectContaining({
      url: representative.url,
      filePath: representative.url,
      source: 'product-main',
      heading: '상품 후기',
      isThumbnail: true,
      isShoppingRepresentativeThumbnail: true,
      preserveOriginal: true,
      disableTextOverlay: true,
      allowText: false,
    }));
  });

  it('refuses to create shopping reference items without a representative URL', () => {
    expect(() => applyShoppingRepresentativeReference([{ heading: '확인' }], ''))
      .toThrow('SHOPPING_REFERENCE_IMAGE_REQUIRED');
  });

  it('keeps the product identity while targeting the current subheading scene', () => {
    const prompt = buildShoppingReferencePrompt(
      'A realistic summer driving scene',
      '장거리 운전에서 소음과 풍량 확인',
    );

    expect(prompt).toContain('장거리 운전에서 소음과 풍량 확인');
    expect(prompt).toContain('exact same product');
    expect(prompt).toContain('reference image');
    expect(prompt).toContain('Do not replace');
  });

  it('preserves the uploaded representative image in shopping fallback requests', () => {
    const sourceParts = [
      { inlineData: { data: 'base64-product', mimeType: 'image/png' } },
      { text: 'show the installation details' },
    ];

    const fallbackParts = buildReferenceSafeFallbackParts(
      sourceParts,
      'fallback prompt',
      true,
    );

    expect(fallbackParts).toEqual(sourceParts);
    expect(fallbackParts).not.toBe(sourceParts);
    expect(fallbackParts[0]).not.toBe(sourceParts[0]);
  });

  it('blocks a shopping fallback that has lost its representative image', () => {
    expect(() => buildReferenceSafeFallbackParts(
      [{ text: 'prompt only' }],
      'fallback prompt',
      true,
    )).toThrow('SHOPPING_REFERENCE_FALLBACK_BLOCKED');
  });

  it('keeps reference-free fallback available outside shopping connect', () => {
    expect(canUseReferenceFreeImageFallback(false)).toBe(true);
    expect(canUseReferenceFreeImageFallback(true)).toBe(false);
    expect(buildReferenceSafeFallbackParts([], 'plain fallback', false))
      .toEqual([{ text: 'plain fallback' }]);
  });

  it('blocks manual shopping AI generation before generic SEO fallback when no reference exists', () => {
    expect(() => assertShoppingAiReferenceAvailable({
      isShoppingConnect: true,
      useAiImage: true,
      subImageMode: 'ai',
      referenceCount: 0,
    })).toThrow('SHOPPING_REFERENCE_IMAGE_REQUIRED');
  });

  it('does not require an AI reference for collected or non-shopping modes', () => {
    expect(() => assertShoppingAiReferenceAvailable({
      isShoppingConnect: true,
      useAiImage: true,
      subImageMode: 'collected',
      referenceCount: 0,
    })).not.toThrow();
    expect(() => assertShoppingAiReferenceAvailable({
      isShoppingConnect: false,
      useAiImage: true,
      subImageMode: 'ai',
      referenceCount: 0,
    })).not.toThrow();
  });

  it('returns an executable shopping-reference AI policy only when a representative exists', () => {
    expect(resolveShoppingImageGenerationPolicy({
      isShoppingConnect: true,
      useAiImage: true,
      subImageMode: 'ai',
      referenceCount: 1,
    })).toEqual({
      isShoppingConnectCollected: false,
      shouldGenerateAi: true,
      shouldUseShoppingReferenceAi: true,
    });
  });

  it('keeps collected and generic AI publishing branches distinct', () => {
    expect(resolveShoppingImageGenerationPolicy({
      isShoppingConnect: true,
      useAiImage: true,
      subImageMode: 'collected',
      referenceCount: 0,
    })).toEqual({
      isShoppingConnectCollected: true,
      shouldGenerateAi: false,
      shouldUseShoppingReferenceAi: false,
    });
    expect(resolveShoppingImageGenerationPolicy({
      isShoppingConnect: false,
      useAiImage: true,
      subImageMode: 'ai',
      referenceCount: 0,
    })).toEqual({
      isShoppingConnectCollected: false,
      shouldGenerateAi: true,
      shouldUseShoppingReferenceAi: false,
    });
  });
});

describe('shopping reference engine UI wiring', () => {
  const root = process.cwd();
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const continuous = fs.readFileSync(path.join(root, 'src', 'renderer', 'modules', 'continuousPublishing.ts'), 'utf8');
  const multi = fs.readFileSync(path.join(root, 'src', 'renderer', 'modules', 'multiAccountManager.ts'), 'utf8');
  const imageManagement = fs.readFileSync(path.join(root, 'src', 'renderer', 'modules', 'imageManagementTab.ts'), 'utf8');
  const subImageMode = fs.readFileSync(path.join(root, 'src', 'renderer', 'utils', 'subImageMode.ts'), 'utf8');

  it('offers Leaders unlimited in continuous and multi-account shopping settings', () => {
    expect(html).toMatch(/name="continuous-modal-shopping-subimage-source"\s+value="nano-banana-2"\s+checked/);
    expect(html).toMatch(/name="ma-shopping-subimage-source"\s+value="nano-banana-2"\s+checked/);
    expect(html).toMatch(/name="continuous-modal-shopping-subimage-source"\s+value="dropshot"/);
    expect(html).toMatch(/name="ma-shopping-subimage-source"\s+value="dropshot"/);
  });

  it('persists dropshot as a shopping AI engine from every selector', () => {
    expect(continuous).toMatch(/normalizedValue === 'dropshot'/);
    expect(multi).toMatch(/value === 'dropshot'/);
    expect(imageManagement).toMatch(/selectedSource === 'dropshot'/);
    expect(subImageMode).toContain("'dropshot'");
  });

  it('does not expose reference-free engines as selectable shopping AI engines', () => {
    expect(html).toMatch(/name="continuous-modal-shopping-subimage-source"\s+value="flow"\s+disabled/);
    expect(html).toMatch(/name="continuous-modal-shopping-subimage-source"\s+value="prodia"\s+disabled/);
    expect(html).toMatch(/name="ma-shopping-subimage-source"\s+value="flow"\s+disabled/);
    expect(html).toMatch(/name="ma-shopping-subimage-source"\s+value="prodia"\s+disabled/);
    expect(continuous).not.toMatch(/normalizedValue === 'dropshot' \|\| normalizedValue === 'flow'/);
    expect(multi).not.toMatch(/value === 'dropshot' \|\| value === 'flow'/);
  });
});
