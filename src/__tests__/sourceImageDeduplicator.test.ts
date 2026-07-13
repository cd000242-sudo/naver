import { describe, expect, it } from 'vitest';
import { deduplicateSourceImagesByContent } from '../image/sourceImageDeduplicator';
import { extractReferenceImageUrl } from '../image/referenceImagePolicy';

describe('deduplicateSourceImagesByContent', () => {
  it('removes images with identical bytes even when their URLs are unrelated', async () => {
    const first = { url: 'https://cdn-a.example.com/products/a.jpg' };
    const duplicate = { url: 'https://cdn-b.example.com/cache/copied.jpg' };
    const distinct = { url: 'https://cdn.example.com/products/b.jpg' };
    const buffers = new Map([
      [first.url, Buffer.from('same-image-bytes')],
      [duplicate.url, Buffer.from('same-image-bytes')],
      [distinct.url, Buffer.from('different-image-bytes')],
    ]);

    const result = await deduplicateSourceImagesByContent(
      [first, duplicate, distinct],
      { load: async (url) => buffers.get(url) ?? null },
    );

    expect(result.images.map(extractReferenceImageUrl)).toEqual([first.url, distinct.url]);
    expect(result.removedCount).toBe(1);
  });

  it('keeps a candidate when its bytes cannot be loaded so transient network errors do not erase it', async () => {
    const images = [
      { url: 'https://cdn.example.com/a.jpg' },
      { url: 'https://cdn.example.com/b.jpg' },
    ];

    const result = await deduplicateSourceImagesByContent(images, { load: async () => null });

    expect(result.images).toEqual(images);
    expect(result.removedCount).toBe(0);
  });
});
