import { describe, expect, it } from 'vitest';
import { parseProductJsonLd } from '../crawler/shopping/utils/jsonLdProduct';

/**
 * SPEC-STABILITY-2026 쇼핑커넥트 크롤 보강 — JSON-LD Product parser.
 * 라이브 실측(2026-06-12): 난독화 클래스 부패로 상품명이 스토어 인사말로
 * 오염되고 리뷰/스펙 0 수집 → P0 가드 발동 → 2섹션 글. JSON-LD는 가격
 * 폴백에서 생존이 검증된 소스 — 상품명/리뷰/평점으로 확장한다.
 */
describe('parseProductJsonLd', () => {
  const productScript = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: '삼성전자 무풍 갤러리 에어컨 AF19DX838WZT',
    description: '무풍 냉방과 AI 절약 모드를 갖춘 스탠드형 에어컨',
    aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 312 },
    review: [
      { '@type': 'Review', reviewBody: '설치 기사님이 친절했고 냉방 속도가 기대 이상으로 빨라요.' },
      { '@type': 'Review', reviewBody: '무풍 모드 소음이 거의 없어서 밤에도 켜두고 잡니다.' },
      { '@type': 'Review', reviewBody: '짧음' },
    ],
  });

  it('extracts product name, rating, review count and review texts', () => {
    const info = parseProductJsonLd([productScript]);
    expect(info.name).toBe('삼성전자 무풍 갤러리 에어컨 AF19DX838WZT');
    expect(info.reviewCount).toBe(312);
    expect(info.rating).toBe('4.8');
    expect(info.reviewTexts).toHaveLength(2);
    expect(info.reviewTexts[0]).toContain('냉방 속도');
  });

  it('finds Product inside @graph and skips malformed scripts', () => {
    const graphScript = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'BreadcrumbList' },
        { '@type': ['Thing', 'Product'], name: '그래프 속 상품', aggregateRating: { reviewCount: '57' } },
      ],
    });
    const info = parseProductJsonLd(['{not valid json', graphScript, null, undefined]);
    expect(info.name).toBe('그래프 속 상품');
    expect(info.reviewCount).toBe(57);
  });

  it('returns empty info when no Product node exists', () => {
    const info = parseProductJsonLd([JSON.stringify({ '@type': 'WebSite', name: '스토어 홈' })]);
    expect(info.name).toBeUndefined();
    expect(info.reviewTexts).toEqual([]);
    expect(info.reviewCount).toBeUndefined();
  });

  it('caps review texts at 5 and dedupes', () => {
    const many = JSON.stringify({
      '@type': 'Product',
      name: 'N',
      review: Array.from({ length: 8 }, (_, i) => ({
        reviewBody: `리뷰 본문 내용이 충분히 길어야 통과합니다 — 번호 ${i % 6}`,
      })),
    });
    const info = parseProductJsonLd([many]);
    expect(info.reviewTexts.length).toBeLessThanOrEqual(8);
    expect(new Set(info.reviewTexts).size).toBe(info.reviewTexts.length);
  });

  it('uses the authoritative Offer price from the live Naver product schema', () => {
    const liveProductScript = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: '[국내생산] 통풍시트 자동차 시트커버 차량용 윈드포스',
      description: '[지엠지모터스] 자동차용품 전문점 꾸미자닷컴',
      image: 'https://shop-phinf.pstatic.net/main.jpg?type=o1000',
      offers: {
        '@type': 'Offer',
        price: 45800,
        priceCurrency: 'KRW',
        availability: 'http://schema.org/InStock',
        url: 'https://smartstore.naver.com/main/products/2884318642',
      },
    });

    const info = parseProductJsonLd([liveProductScript]);

    expect(info.price).toBe('45,800원');
    expect(info.priceCurrency).toBe('KRW');
    expect(info.availability).toBe('http://schema.org/InStock');
    expect(info.canonicalUrl).toBe('https://smartstore.naver.com/main/products/2884318642');
  });
});

// Dead-wiring 재발 방지: productReviews/productSpec/productPrice는 2026-01-30
// 설계 후 생산자 0곳 상태로 5개월 방치 — P0 가드가 모든 쇼핑커넥트 글을
// 2섹션으로 축소시킨 원인. 배선이 끊기면 여기서 잡는다.
describe('쇼핑커넥트 풀스펙 배선 가드 (dead-wiring 방지)', () => {
  it('crawlFromAffiliateLink가 JSON-LD 파서를 쓰고 리뷰를 반환한다', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'crawler', 'productSpecCrawler.ts'), 'utf-8');
    expect(src).toContain('parseProductJsonLd');
    expect(src).toContain('reviewTexts: collectedReviewTexts');
  });

  it('assembleContentSource 쇼핑 분기가 productReviews/Spec/Price를 source에 배선한다', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'sourceAssembler.ts'), 'utf-8');
    expect(src).toContain('productReviews: crawledReviews.length > 0 ? crawledReviews : undefined');
    expect(src).toMatch(/productPrice: priceNum !== null/);
    expect(src).toContain('=== 실제 구매자 리뷰');
  });

  it('preserves a collected price through the merged short-url source path', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'sourceAssembler.ts'), 'utf-8');
    expect(src).toContain('extractLabeledPrice(baseBody)');
    expect(src).toContain('productPrice: assembledProductPrice');
  });

  it('keeps review photos out of the official gallery result', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'crawler', 'productSpecCrawler.ts'), 'utf-8');
    expect(src).toContain('mergeOfficialNaverProductGallery');
    expect(src).toContain('reviewImages,');
    expect(src).not.toContain('const allImages = [...galleryImages, ...reviewImages]');
  });
});

// 라이브 실측 2: 갤러리 썸네일 클릭 셀렉터도 부패 — 갤러리 11장 중 1장만
// 수집되고 나머지가 리뷰 사진으로 채워짐. JSON-LD image[]가 갤러리 전체를
// 담고 있으므로 파서가 이미지도 추출해야 한다.
describe('parseProductJsonLd images', () => {
  it('extracts gallery images from string array', () => {
    const script = JSON.stringify({
      '@type': 'Product',
      name: 'N',
      image: [
        'https://shop-phinf.pstatic.net/a.jpg',
        'https://shop-phinf.pstatic.net/b.jpg',
        'https://shop-phinf.pstatic.net/a.jpg',
      ],
    });
    const info = parseProductJsonLd([script]);
    expect(info.images).toEqual([
      'https://shop-phinf.pstatic.net/a.jpg',
      'https://shop-phinf.pstatic.net/b.jpg',
    ]);
  });

  it('extracts images from single string and ImageObject forms', () => {
    const single = JSON.stringify({ '@type': 'Product', name: 'N', image: 'https://shop-phinf.pstatic.net/one.jpg' });
    const objForm = JSON.stringify({
      '@type': 'Product', name: 'M',
      image: [{ '@type': 'ImageObject', url: 'https://shop-phinf.pstatic.net/obj.jpg' }],
    });
    expect(parseProductJsonLd([single]).images).toEqual(['https://shop-phinf.pstatic.net/one.jpg']);
    expect(parseProductJsonLd([objForm]).images).toEqual(['https://shop-phinf.pstatic.net/obj.jpg']);
  });
});
