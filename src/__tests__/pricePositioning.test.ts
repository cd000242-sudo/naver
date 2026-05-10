/**
 * SPEC-CONVERSION-001 L2-2.4 — pricePositioning 단위 테스트.
 * tier 분류·문장 생성·데이터 부족 케이스 검증.
 */

import { describe, it, expect } from 'vitest';
import { buildPricePositioning } from '../content/pricePositioning';

describe('buildPricePositioning — 정상 분류', () => {
  it('타겟이 최저가면 lowest tier', () => {
    const r = buildPricePositioning({
      targetPriceWon: 5_000,
      competitorPricesWon: [10_000, 15_000, 20_000, 25_000],
    });
    expect(r.tier).toBe('lowest');
    expect(r.sentence).toMatch(/가장 저렴/);
    expect(r.stats?.target).toBe(5_000);
  });

  it('타겟이 최고가면 highest tier', () => {
    const r = buildPricePositioning({
      targetPriceWon: 30_000,
      competitorPricesWon: [10_000, 15_000, 20_000, 25_000],
    });
    expect(r.tier).toBe('highest');
    expect(r.sentence).toMatch(/가장 비싼/);
  });

  it('타겟이 중앙값(±5%) 근처면 median tier', () => {
    const r = buildPricePositioning({
      targetPriceWon: 17_500,
      competitorPricesWon: [10_000, 15_000, 20_000, 25_000],
    });
    expect(r.tier).toBe('median');
    expect(r.sentence).toMatch(/평균선/);
  });

  it('타겟이 중앙값보다 낮으면 below_median', () => {
    const r = buildPricePositioning({
      targetPriceWon: 12_000,
      competitorPricesWon: [10_000, 15_000, 20_000, 25_000, 30_000],
    });
    expect(r.tier).toBe('below_median');
    expect(r.sentence).toMatch(/저렴한 편|가성비/);
  });

  it('타겟이 중앙값보다 높으면 above_median', () => {
    const r = buildPricePositioning({
      targetPriceWon: 23_000,
      competitorPricesWon: [10_000, 15_000, 20_000, 25_000, 30_000],
    });
    expect(r.tier).toBe('above_median');
    expect(r.sentence).toMatch(/높은 편|품질|기능/);
  });
});

describe('buildPricePositioning — 데이터 부족·이상 입력', () => {
  it('경쟁 데이터 3건 미만이면 unknown + 빈 문자열', () => {
    const r = buildPricePositioning({
      targetPriceWon: 10_000,
      competitorPricesWon: [9_000, 11_000],
    });
    expect(r.tier).toBe('unknown');
    expect(r.sentence).toBe('');
    expect(r.reason).toMatch(/2건/);
  });

  it('targetPriceWon이 0 이하면 unknown', () => {
    const r = buildPricePositioning({
      targetPriceWon: 0,
      competitorPricesWon: [10_000, 15_000, 20_000],
    });
    expect(r.tier).toBe('unknown');
    expect(r.reason).toMatch(/유효하지 않음/);
  });

  it('NaN/Infinity 가격은 필터링 후 sample size 검사', () => {
    const r = buildPricePositioning({
      targetPriceWon: 10_000,
      competitorPricesWon: [NaN, Infinity, -1, 0, 12_000],
    });
    expect(r.tier).toBe('unknown');
    expect(r.reason).toMatch(/1건/);
  });

  it('minSampleSize 커스텀 적용', () => {
    const r = buildPricePositioning({
      targetPriceWon: 10_000,
      competitorPricesWon: [9_000, 11_000, 13_000],
      minSampleSize: 5,
    });
    expect(r.tier).toBe('unknown');
    expect(r.reason).toMatch(/3건.*최소 5건/);
  });
});

describe('buildPricePositioning — 가격 포맷', () => {
  it('1만원 이상은 만원 단위로 표기', () => {
    const r = buildPricePositioning({
      targetPriceWon: 100_000,
      competitorPricesWon: [50_000, 60_000, 70_000, 80_000],
    });
    expect(r.sentence).toMatch(/만원/);
  });

  it('1만원 미만은 원 단위로 표기', () => {
    const r = buildPricePositioning({
      targetPriceWon: 5_000,
      competitorPricesWon: [3_000, 4_000, 5_500],
    });
    expect(r.sentence).toMatch(/원/);
  });
});

describe('SPEC 메모리 원칙', () => {
  it('데이터 부족 시 환각 문장 만들지 않음 (silent 위조 X)', () => {
    const r = buildPricePositioning({
      targetPriceWon: 10_000,
      competitorPricesWon: [],
    });
    expect(r.sentence).toBe('');
    expect(r.stats).toBeNull();
    expect(r.reason).toBeDefined();
  });

  it('전환률 등 추정 효과 약속 미포함', () => {
    const r = buildPricePositioning({
      targetPriceWon: 17_500,
      competitorPricesWon: [10_000, 15_000, 20_000, 25_000],
    });
    expect(r.sentence).not.toMatch(/전환|클릭률|매출 [+\-]?\d+%/);
  });
});
