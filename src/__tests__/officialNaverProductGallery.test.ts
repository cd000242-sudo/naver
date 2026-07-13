import { describe, expect, it } from 'vitest';
import { mergeOfficialNaverProductGallery } from '../crawler/shopping/utils/officialNaverProductGallery.js';

describe('mergeOfficialNaverProductGallery', () => {
  it('keeps the representative and official 추가이미지 while rejecting reviews and recommendations', () => {
    const result = mergeOfficialNaverProductGallery(
      ['https://shop-phinf.pstatic.net/main.jpg?type=o1000'],
      [
        'https://shop-phinf.pstatic.net/add-1.jpg?type=f40',
        'https://shop-phinf.pstatic.net/add-1.jpg?type=f80',
        'https://shop-phinf.pstatic.net/add-2.png?type=f40',
      ],
      [
        'https://phinf.pstatic.net/checkout.phinf/review.jpg',
        'https://shop-phinf.pstatic.net/main.jpg?type=f40',
        'https://s.pstatic.net/g-selected/recommended.jpg',
        'https://shop-phinf.pstatic.net/not-an-image',
      ],
    );

    expect(result).toEqual([
      'https://shop-phinf.pstatic.net/main.jpg?type=m1000_pd',
      'https://shop-phinf.pstatic.net/add-1.jpg?type=m1000_pd',
      'https://shop-phinf.pstatic.net/add-2.png?type=m1000_pd',
    ]);
  });

  it('accepts direct shopping-phinf product files but not lookalike hosts', () => {
    expect(mergeOfficialNaverProductGallery([
      'https://shopping-phinf.pstatic.net/a.webp?type=f300',
      'https://shop-phinf.pstatic.net.evil.example/b.jpg',
    ])).toEqual([
      'https://shopping-phinf.pstatic.net/a.webp?type=m1000_pd',
    ]);
  });
});
