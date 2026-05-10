/**
 * SPEC-CONVERSION-001 L2-2.3 — competitorDataCollector 단위 테스트.
 * Mock PageLike로 결정론 검증. 실제 네이버쇼핑 미접속.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  collectCompetitorProducts,
  isCompetitorCollectorEnabled,
  parseKoreanPrice,
  parseRating,
  parseReviewCount,
  type PageLike,
} from '../crawler/competitorDataCollector';

interface RawCompetitor {
  rank: number;
  name: string;
  priceText: string;
  ratingText: string;
  reviewText: string;
  seller: string;
  thumbnailUrl: string | null;
  productUrl: string | null;
}

function mockPage(rawProducts: RawCompetitor[]): PageLike {
  let evalCount = 0;
  return {
    goto: vi.fn(async () => {}),
    waitForSelector: vi.fn(async () => null),
    evaluate: vi.fn(async <T>(_fn: (s: unknown) => T, _arg?: unknown): Promise<T> => {
      evalCount++;
      // 첫 evaluate는 셀렉터 주입 (return undefined), 두 번째는 추출
      if (evalCount === 1) return undefined as unknown as T;
      return rawProducts as unknown as T;
    }),
  };
}

function failingPage(errMsg: string): PageLike {
  return {
    goto: vi.fn(async () => {
      throw new Error(errMsg);
    }),
    waitForSelector: vi.fn(async () => null),
    evaluate: vi.fn(async () => null as any),
  };
}

describe('parseKoreanPrice', () => {
  it('"12,500원" → 12500', () => expect(parseKoreanPrice('12,500원')).toBe(12_500));
  it('"1만원" → 10000', () => expect(parseKoreanPrice('1만원')).toBe(10_000));
  it('"3만5천원" → 35000', () => expect(parseKoreanPrice('3만5천원')).toBe(35_000));
  it('빈 문자열 → 0', () => expect(parseKoreanPrice('')).toBe(0));
  it('null → 0', () => expect(parseKoreanPrice(null)).toBe(0));
  it('100원 미만 (비현실적) → 0', () => expect(parseKoreanPrice('50')).toBe(0));
  it('1억 초과 → 0', () => expect(parseKoreanPrice('200000000')).toBe(0));
});

describe('parseRating', () => {
  it('"4.5" → 4.5', () => expect(parseRating('4.5')).toBe(4.5));
  it('"별점 5점" → 5', () => expect(parseRating('별점 5점')).toBe(5));
  it('"6.0" (5 초과) → null', () => expect(parseRating('6.0')).toBeNull());
  it('null → null', () => expect(parseRating(null)).toBeNull());
});

describe('parseReviewCount', () => {
  it('"(123)" → 123', () => expect(parseReviewCount('(123)')).toBe(123));
  it('"리뷰 1,234" → 1234', () => expect(parseReviewCount('리뷰 1,234')).toBe(1_234));
  it('빈 문자열 → null', () => expect(parseReviewCount('')).toBeNull());
});

describe('isCompetitorCollectorEnabled', () => {
  it('forceFlag=true 면 env 무시하고 ON', () => {
    expect(isCompetitorCollectorEnabled(true)).toBe(true);
  });
  it('forceFlag=false 면 env 무시하고 OFF', () => {
    expect(isCompetitorCollectorEnabled(false)).toBe(false);
  });
  it('env 미설정·forceFlag undefined 면 OFF (기본값)', () => {
    delete process.env.COMPETITOR_DATA_V1;
    expect(isCompetitorCollectorEnabled(undefined)).toBe(false);
  });
  it('env=1 면 ON', () => {
    process.env.COMPETITOR_DATA_V1 = '1';
    expect(isCompetitorCollectorEnabled(undefined)).toBe(true);
    delete process.env.COMPETITOR_DATA_V1;
  });
});

describe('collectCompetitorProducts — 정상 흐름', () => {
  const sampleRaw: RawCompetitor[] = [
    {
      rank: 1, name: 'LG 무선청소기 A1', priceText: '450,000원', ratingText: '4.7',
      reviewText: '(1,234)', seller: 'LG샵', thumbnailUrl: 'https://x/1.jpg', productUrl: 'https://x/p/1',
    },
    {
      rank: 2, name: '삼성 무선청소기 B2', priceText: '380,000원', ratingText: '4.5',
      reviewText: '(890)', seller: '삼성몰', thumbnailUrl: 'https://x/2.jpg', productUrl: 'https://x/p/2',
    },
    {
      rank: 3, name: '다이슨 V11', priceText: '520,000원', ratingText: '4.8',
      reviewText: '(2,100)', seller: '다이슨공식', thumbnailUrl: 'https://x/3.jpg', productUrl: 'https://x/p/3',
    },
  ];

  it('mock page에서 3건 정상 수집 + 가격 정규화', async () => {
    const r = await collectCompetitorProducts({
      query: '무선청소기',
      forceFlag: true,
      fetcher: mockPage(sampleRaw),
    });
    expect(r.enabled).toBe(true);
    expect(r.products).toHaveLength(3);
    expect(r.products[0].priceWon).toBe(450_000);
    expect(r.products[1].priceWon).toBe(380_000);
    expect(r.products[0].rating).toBe(4.7);
    expect(r.products[0].reviewCount).toBe(1_234);
    expect(r.successRate).toBe(1.0);
  });

  it('topN으로 결과 제한', async () => {
    const r = await collectCompetitorProducts({
      query: '무선청소기',
      topN: 2,
      forceFlag: true,
      fetcher: mockPage(sampleRaw),
    });
    expect(r.products).toHaveLength(2);
  });

  it('일부 가격 파싱 실패 시 successRate 반영', async () => {
    const broken: RawCompetitor[] = [
      ...sampleRaw,
      {
        rank: 4, name: '깨진 데이터', priceText: '가격문의', ratingText: '',
        reviewText: '', seller: '', thumbnailUrl: null, productUrl: null,
      },
    ];
    const r = await collectCompetitorProducts({
      query: '무선청소기',
      forceFlag: true,
      fetcher: mockPage(broken),
    });
    expect(r.products).toHaveLength(4);
    expect(r.successRate).toBeCloseTo(3 / 4, 5);
  });
});

describe('collectCompetitorProducts — 명시 fallback (silent 폴백 X)', () => {
  it('forceFlag=false 면 enabled=false + reason 명시', async () => {
    const r = await collectCompetitorProducts({
      query: '무선청소기',
      forceFlag: false,
      fetcher: mockPage([]),
    });
    expect(r.enabled).toBe(false);
    expect(r.products).toHaveLength(0);
    expect(r.fallbackReason).toMatch(/COMPETITOR_DATA_V1 미활성화/);
  });

  it('빈 query는 명시 fallback', async () => {
    const r = await collectCompetitorProducts({
      query: '   ',
      forceFlag: true,
      fetcher: mockPage([]),
    });
    expect(r.fallbackReason).toMatch(/COMPETITOR_QUERY_EMPTY/);
    expect(r.products).toHaveLength(0);
  });

  it('네트워크 실패 시 명시 reason — silent 0건 반환 X', async () => {
    const r = await collectCompetitorProducts({
      query: '무선청소기',
      forceFlag: true,
      fetcher: failingPage('Navigation timeout 30000ms exceeded'),
    });
    expect(r.fallbackReason).toMatch(/COMPETITOR_FETCH_FAILED.*timeout/);
    expect(r.products).toHaveLength(0);
    expect(r.successRate).toBe(0);
  });
});
