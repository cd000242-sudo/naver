import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeReferenceImageUrl } from '../imageGenerator.js';
import { normalizeDropshotReferenceUrl } from '../image/dropshotGenerator.js';

const root = process.cwd();

function readSource(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('dropshot reference image routing', () => {
  it('normalizes official product image objects into URL references', () => {
    expect(normalizeReferenceImageUrl('https://shop-phinf.pstatic.net/main.jpg')).toBe('https://shop-phinf.pstatic.net/main.jpg');
    expect(normalizeReferenceImageUrl({ url: 'https://shop-phinf.pstatic.net/official.jpg' })).toBe('https://shop-phinf.pstatic.net/official.jpg');
    expect(normalizeReferenceImageUrl({ thumbnailUrl: 'https://shop-phinf.pstatic.net/thumb.jpg' })).toBe('https://shop-phinf.pstatic.net/thumb.jpg');
    expect(normalizeReferenceImageUrl({ referenceImagePath: 'https://shop-phinf.pstatic.net/ref.jpg' })).toBe('https://shop-phinf.pstatic.net/ref.jpg');
    expect(normalizeReferenceImageUrl('C:/local/product.png')).toBe('C:/local/product.png');
  });

  it('preserves local references at the final Dropshot adapter boundary', () => {
    expect(normalizeDropshotReferenceUrl('C:\\images\\representative.png'))
      .toBe('C:\\images\\representative.png');
    expect(normalizeDropshotReferenceUrl({ filePath: 'C:/images/representative.png' }))
      .toBe('C:/images/representative.png');
    expect(normalizeDropshotReferenceUrl('https://shop-phinf.pstatic.net/main.jpg'))
      .toBe('https://shop-phinf.pstatic.net/main.jpg');
  });

  it('routes shopping collected images into item referenceImageUrl/referenceImageList', () => {
    const imageGenerator = readSource('src/imageGenerator.ts');

    expect(imageGenerator).toContain('collectReferenceImageUrls(');
    expect(imageGenerator).toContain('options.collectedImages || []');
    expect(imageGenerator).toContain('normalizeReferenceImageUrl(item.referenceImagePath)');
    expect(imageGenerator).toContain('referenceImageList: collectReferenceImageUrls(');
  });

  it('lets dropshot upload URL-shaped referenceImagePath values', () => {
    const dropshot = readSource('src/image/dropshotGenerator.ts');

    expect(dropshot).toContain('item.referenceImageList');
    expect(dropshot).toContain('item.referenceImageUrl');
    expect(dropshot).toContain('item.referenceImagePath');
    expect(dropshot).toContain('referenceImageList: refUrls');
  });

  it('keeps main IPC references URL-first and representative-only for shopping connect', () => {
    const main = readSource('src/main.ts');

    expect(main).toContain('const representativeUrl = extractReferenceImageUrl(representativeImage);');
    expect(main).toContain('referenceImageUrl: representativeUrl');
    expect(main).toContain('referenceImagePath: representativeUrl');
    expect(main).toContain('referenceImageList: [representativeUrl]');
    expect(main).toContain(".filter((url: string) => /^https?:\\/\\//i.test(String(url || '')))");
  });
});
