import { describe, expect, it } from 'vitest';
import {
  deduplicateReferenceImages,
  extractReferenceImageUrl,
  selectRepresentativeReferenceImage,
} from '../image/referenceImagePolicy';

describe('referenceImagePolicy', () => {
  it('collapses query and thumbnail-size variants without collapsing distinct gallery images', () => {
    const images = [
      { url: 'https://shop.example.com/product/main.jpg?type=w860' },
      { thumbnailUrl: 'https://shop.example.com/product/main.jpg?type=f300_300' },
      { url: 'https://shop.example.com/product/detail_thumb.jpg' },
      { url: 'https://shop.example.com/product/detail_original.jpg' },
      { url: 'https://shop.example.com/product/gallery_01.jpg' },
      { url: 'https://shop.example.com/product/gallery_02.jpg' },
    ];

    const unique = deduplicateReferenceImages(images);

    expect(unique).toHaveLength(4);
    expect(unique.map(extractReferenceImageUrl)).toEqual([
      'https://shop.example.com/product/main.jpg?type=w860',
      'https://shop.example.com/product/detail_thumb.jpg',
      'https://shop.example.com/product/gallery_01.jpg',
      'https://shop.example.com/product/gallery_02.jpg',
    ]);
  });

  it('selects an explicit representative image before review or detail images', () => {
    const representative = selectRepresentativeReferenceImage([
      { url: 'https://shop.example.com/review/user-photo.jpg', source: 'review' },
      { url: 'https://shop.example.com/detail/spec.jpg', source: 'detail' },
      { url: 'https://shop.example.com/gallery/main.jpg', source: 'gallery', isRepresentative: true },
    ]);

    expect(extractReferenceImageUrl(representative)).toBe('https://shop.example.com/gallery/main.jpg');
  });

  it('falls back to the first product/gallery image when no explicit representative flag exists', () => {
    const representative = selectRepresentativeReferenceImage([
      { url: 'https://shop.example.com/review/user-photo.jpg', source: 'review' },
      { url: 'https://shop.example.com/gallery/second.jpg', source: 'gallery' },
      { url: 'https://shop.example.com/detail/third.jpg', source: 'detail' },
    ]);

    expect(extractReferenceImageUrl(representative)).toBe('https://shop.example.com/gallery/second.jpg');
  });

  it('keeps local-only reference images and deduplicates path variants', () => {
    const images = [
      { filePath: 'C:\\images\\product-main.png', source: 'gallery' },
      { savedToLocal: 'C:/images/product-main.png', source: 'gallery' },
      { referenceImagePath: 'C:/images/product-detail.png', source: 'detail' },
    ];

    const unique = deduplicateReferenceImages(images);
    expect(unique).toHaveLength(2);
    expect(extractReferenceImageUrl(selectRepresentativeReferenceImage(unique))).toBe(
      'C:\\images\\product-main.png',
    );
  });

  it('does not discard an image merely because no stable identity is available', () => {
    const anonymous = { imageBase64: 'ZmFrZQ==', source: 'gallery' };
    expect(deduplicateReferenceImages([anonymous])).toEqual([anonymous]);
  });
});
