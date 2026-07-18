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

  it('preserves the exact collected buyer-review evidence for the content pipeline', () => {
    const result = mapBrandStoreCollectionToAffiliateProduct({
      success: true,
      images: [{ url: 'https://shop-phinf.pstatic.net/main.jpg', type: 'main' }],
      productInfo: {
        name: '하츠 티오람미니 HMF-J300',
        price: '159,000원',
        reviewTexts: [
          '기존 환풍기 자리가 작아서 천장 타공을 넓히는 과정이 조금 힘들었어요.',
          '씻기 10분 전에 켜두니 욕실 한기가 덜했어요.',
        ],
        reviewCount: 17,
        rating: '4.8',
      },
      usedStrategy: 'puppeteer-direct',
      timing: 1,
    }, 'https://brand.naver.com/example/products/1');

    expect(result).toMatchObject({
      reviewTexts: [
        '기존 환풍기 자리가 작아서 천장 타공을 넓히는 과정이 조금 힘들었어요.',
        '씻기 10분 전에 켜두니 욕실 한기가 덜했어요.',
      ],
      reviewCount: 17,
      rating: '4.8',
    });
  });
});
