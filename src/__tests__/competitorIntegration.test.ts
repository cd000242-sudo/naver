/**
 * SPEC-CONVERSION-001 L2-2.7 — competitorIntegration 단위 테스트.
 * 통합 오케스트레이터의 활성·비활성·가격 포지셔닝 분기 검증.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCompetitorIntegration } from '../content/competitorIntegration';
import type { PageLike } from '../crawler/competitorDataCollector';

const sampleRaw = [
  { rank: 1, name: 'A 무선청소기', priceText: '450,000원', ratingText: '4.7', reviewText: '(1234)', seller: 'A', thumbnailUrl: null, productUrl: null },
  { rank: 2, name: 'B 무선청소기', priceText: '380,000원', ratingText: '4.5', reviewText: '(890)', seller: 'B', thumbnailUrl: null, productUrl: null },
  { rank: 3, name: 'C 무선청소기', priceText: '520,000원', ratingText: '4.8', reviewText: '(2100)', seller: 'C', thumbnailUrl: null, productUrl: null },
];

function mockPage(raw: unknown[]): PageLike {
  let evalCount = 0;
  return {
    goto: vi.fn(async () => {}),
    waitForSelector: vi.fn(async () => null),
    evaluate: vi.fn(async <T,>(_fn: (s: unknown) => T): Promise<T> => {
      evalCount++;
      if (evalCount === 1) return undefined as unknown as T;
      return raw as unknown as T;
    }),
  };
}

describe('runCompetitorIntegration — flag OFF (silent 폴백 X)', () => {
  beforeEach(() => {
    delete process.env.COMPETITOR_DATA_V1;
  });

  it('forceFlag=false면 enabled=false + 빈 contextBlock + 명시 reason', async () => {
    const r = await runCompetitorIntegration({
      query: '무선청소기',
      forceFlag: false,
      fetcher: mockPage([]),
    });
    expect(r.enabled).toBe(false);
    expect(r.contextBlock).toBe('');
    expect(r.fallbackReason).toMatch(/미활성화/);
    expect(r.pricePositioning).toBeNull();
  });
});

describe('runCompetitorIntegration — flag ON 정상 흐름', () => {
  it('수집 성공 → contextBlock 비어있지 않음', async () => {
    const r = await runCompetitorIntegration({
      query: '무선청소기',
      forceFlag: true,
      fetcher: mockPage(sampleRaw),
    });
    expect(r.enabled).toBe(true);
    expect(r.contextBlock).toContain('경쟁 제품 데이터');
    expect(r.collectorResult.products).toHaveLength(3);
  });

  it('targetPriceWon 주어지면 pricePositioning 활성', async () => {
    const r = await runCompetitorIntegration({
      query: '무선청소기',
      targetPriceWon: 400_000,
      forceFlag: true,
      fetcher: mockPage(sampleRaw),
    });
    expect(r.pricePositioning).not.toBeNull();
    expect(r.pricePositioning?.tier).toBe('below_median');
    expect(r.contextBlock).toContain('가격 포지셔닝');
  });

  it('targetPriceWon 미주어지면 pricePositioning 생략', async () => {
    const r = await runCompetitorIntegration({
      query: '무선청소기',
      forceFlag: true,
      fetcher: mockPage(sampleRaw),
    });
    expect(r.pricePositioning).toBeNull();
    expect(r.contextBlock).not.toContain('가격 포지셔닝');
  });
});

describe('runCompetitorIntegration — fallback (L2-2.6)', () => {
  it('수집 0건이면 contextBlock 빈 문자열', async () => {
    const r = await runCompetitorIntegration({
      query: '무선청소기',
      forceFlag: true,
      fetcher: mockPage([]),
    });
    expect(r.collectorResult.products).toHaveLength(0);
    expect(r.contextBlock).toBe('');
  });

  it('네트워크 실패는 collectorResult.fallbackReason으로 노출', async () => {
    const failing: PageLike = {
      goto: vi.fn(async () => {
        throw new Error('Navigation timeout');
      }),
      waitForSelector: vi.fn(async () => null),
      evaluate: vi.fn(async () => null as any),
    };
    const r = await runCompetitorIntegration({
      query: '무선청소기',
      forceFlag: true,
      fetcher: failing,
    });
    expect(r.collectorResult.fallbackReason).toMatch(/COMPETITOR_FETCH_FAILED/);
    expect(r.contextBlock).toBe('');
  });
});
