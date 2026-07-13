import { describe, expect, it } from 'vitest';
import { mapBrandStoreCollectionToAffiliateProduct } from '../crawler/shopping/brandStoreAffiliateCrawler.js';

describe('mapBrandStoreCollectionToAffiliateProduct', () => {
  it('returns the exact product price and official representative/gallery images only', () => {
    const result = mapBrandStoreCollectionToAffiliateProduct({
      success: true,
      images: [
        { url: 'https://shop-phinf.pstatic.net/main.jpg?type=o1000', type: 'main' },
        { url: 'https://shop-phinf.pstatic.net/add-1.jpg?type=o1000', type: 'gallery' },
        { url: 'https://shop-phinf.pstatic.net/add-2.jpg?type=o1000', type: 'gallery-thumb-fallback' },
        { url: 'https://checkout.phinf.pstatic.net/review.jpg', type: 'review' },
        { url: 'https://shop-phinf.pstatic.net/detail.jpg', type: 'detail' },
      ],
      productInfo: {
        name: '[국내생산] 지엠지모터스 윈드포스 통풍시트',
        price: '45,800원',
        description: '차량용 통풍 시트커버',
        availability: 'http://schema.org/InStock',
      },
      usedStrategy: 'puppeteer-direct',
      timing: 1200,
    }, 'https://naver.me/5Z1I7QIh');

    expect(result).toEqual({
      name: '[국내생산] 지엠지모터스 윈드포스 통풍시트',
      price: 45800,
      stock: 1,
      options: [],
      detailUrl: 'https://naver.me/5Z1I7QIh',
      mainImage: 'https://shop-phinf.pstatic.net/main.jpg?type=o1000',
      galleryImages: [
        'https://shop-phinf.pstatic.net/main.jpg?type=o1000',
        'https://shop-phinf.pstatic.net/add-1.jpg?type=o1000',
        'https://shop-phinf.pstatic.net/add-2.jpg?type=o1000',
      ],
      detailImages: [],
      description: '차량용 통풍 시트커버',
    });
  });

  it('rejects a collection without an authoritative product name or price', () => {
    expect(mapBrandStoreCollectionToAffiliateProduct({
      success: true,
      images: [{ url: 'https://shop-phinf.pstatic.net/main.jpg', type: 'main' }],
      productInfo: { name: '', price: '배송비 3,000원' },
      usedStrategy: 'puppeteer-direct',
      timing: 1,
    }, 'https://naver.me/example')).toBeNull();
  });
});
