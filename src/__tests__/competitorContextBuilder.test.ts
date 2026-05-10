/**
 * SPEC-CONVERSION-001 L2-2.5/2.6 — competitorContextBuilder 단위 테스트.
 * 블록 생성·fallback·가격 포지셔닝 통합 검증.
 */

import { describe, it, expect } from 'vitest';
import { buildCompetitorContextBlock } from '../content/competitorContextBuilder';
import type { CompetitorCollectorResult, CompetitorProduct } from '../crawler/competitorDataCollector';
import { buildPricePositioning } from '../content/pricePositioning';

const sampleProducts: CompetitorProduct[] = [
  { rank: 1, name: 'LG 무선청소기 A1', priceWon: 450_000, rating: 4.7, reviewCount: 1234, seller: 'LG', thumbnailUrl: null, productUrl: null },
  { rank: 2, name: '삼성 무선청소기 B2', priceWon: 380_000, rating: 4.5, reviewCount: 890, seller: '삼성', thumbnailUrl: null, productUrl: null },
  { rank: 3, name: '다이슨 V11', priceWon: 520_000, rating: 4.8, reviewCount: 2100, seller: '다이슨', thumbnailUrl: null, productUrl: null },
];

const okResult: CompetitorCollectorResult = {
  enabled: true,
  query: '무선청소기',
  products: sampleProducts,
  successRate: 1.0,
  elapsedMs: 1234,
};

describe('buildCompetitorContextBlock — 정상 흐름', () => {
  it('수집 결과 + 헤더 + 표 + 활용 규칙 포함', () => {
    const block = buildCompetitorContextBlock(okResult);
    expect(block).toContain('경쟁 제품 데이터');
    expect(block).toContain('무선청소기');
    expect(block).toContain('LG 무선청소기 A1');
    expect(block).toContain('450,000원');
    expect(block).toContain('4.7점');
    expect(block).toContain('1,234건');
    expect(block).toContain('환각 금지');
  });

  it('maxProducts 옵션으로 표 행 제한', () => {
    const block = buildCompetitorContextBlock(okResult, { maxProducts: 2 });
    expect(block).toContain('LG 무선청소기 A1');
    expect(block).toContain('삼성 무선청소기 B2');
    expect(block).not.toContain('다이슨 V11');
  });

  it('가격 포지셔닝 sentence 포함', () => {
    const pp = buildPricePositioning({
      targetPriceWon: 400_000,
      competitorPricesWon: sampleProducts.map((p) => p.priceWon),
    });
    const block = buildCompetitorContextBlock(okResult, { pricePositioning: pp });
    expect(block).toContain('가격 포지셔닝');
    expect(block).toContain(pp.sentence);
  });

  it('가격 포지셔닝 sentence 빈 문자열이면 가격 포지셔닝 섹션 생략', () => {
    const pp = buildPricePositioning({
      targetPriceWon: 0, // invalid → sentence 빈
      competitorPricesWon: sampleProducts.map((p) => p.priceWon),
    });
    const block = buildCompetitorContextBlock(okResult, { pricePositioning: pp });
    expect(block).not.toContain('가격 포지셔닝');
  });

  it('제품명이 30자 초과면 ellipsis 처리', () => {
    const longName: CompetitorProduct = {
      ...sampleProducts[0],
      name: 'A'.repeat(50),
    };
    const block = buildCompetitorContextBlock({ ...okResult, products: [longName] });
    expect(block).toMatch(/A{30}…/);
  });

  it('가격 0(미수집) · rating null · reviewCount null도 안전 표기', () => {
    const partial: CompetitorProduct = {
      rank: 1, name: '미수집 제품', priceWon: 0, rating: null, reviewCount: null,
      seller: null, thumbnailUrl: null, productUrl: null,
    };
    const block = buildCompetitorContextBlock({ ...okResult, products: [partial] });
    expect(block).toContain('미수집');
    expect(block).toContain('| - |'); // rating·review 자리에 dash
  });
});

describe('buildCompetitorContextBlock — fallback (L2-2.6)', () => {
  it('enabled=false면 빈 문자열', () => {
    const r: CompetitorCollectorResult = {
      enabled: false, query: 'x', products: [], successRate: 0, elapsedMs: 0,
      fallbackReason: 'flag OFF',
    };
    expect(buildCompetitorContextBlock(r)).toBe('');
  });

  it('products 0건이면 빈 문자열 (silent 위조 X)', () => {
    const r: CompetitorCollectorResult = {
      enabled: true, query: 'x', products: [], successRate: 0, elapsedMs: 100,
    };
    expect(buildCompetitorContextBlock(r)).toBe('');
  });
});

describe('SPEC 메모리 원칙', () => {
  it('환각 금지·일반화 권장 문구 포함', () => {
    const block = buildCompetitorContextBlock(okResult);
    expect(block).toMatch(/환각 차단|환각 금지/);
    expect(block).toMatch(/브랜드 비하 금지/);
  });

  it('전환률·매출 추정 효과 약속 미포함', () => {
    const block = buildCompetitorContextBlock(okResult, {
      pricePositioning: buildPricePositioning({
        targetPriceWon: 400_000,
        competitorPricesWon: sampleProducts.map((p) => p.priceWon),
      }),
    });
    expect(block).not.toMatch(/전환률 [+\-]?\d+%/);
    expect(block).not.toMatch(/매출 [+\-]?\d+%/);
  });
});
