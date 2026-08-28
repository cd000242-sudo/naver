import { describe, expect, it } from 'vitest';
import {
  GENERAL_BULK_MIX,
  GENERAL_SOURCE_MIX,
  PUBLIC_INFO_BULK_MIX,
  PUBLIC_INFO_SOURCE_MIX,
  resolveBulkSourceMix,
  resolveFactSourceMix,
} from '../content/factSourceTierPolicy';

describe('factSourceTierPolicy', () => {
  it('drops blog and 지식iN for public-information topics', () => {
    const mix = resolveFactSourceMix({ keyword: '민생회복 소비쿠폰 신청' });
    expect(mix).toBe(PUBLIC_INFO_SOURCE_MIX);
    expect(mix.blogCount).toBe(0);
    expect(mix.kinCount).toBe(0);
    expect(mix.newsCount).toBe(10);
  });

  it('leaves general topics on the existing mix so collection quality does not regress', () => {
    const mix = resolveFactSourceMix({ keyword: '가을 캠핑 준비물' });
    expect(mix).toBe(GENERAL_SOURCE_MIX);
    expect(mix.blogCount).toBe(5);
    expect(mix.newsCount).toBe(3);
    expect(mix.kinCount).toBe(3);
  });

  it('reads the signal from title and topic too', () => {
    expect(resolveFactSourceMix({ title: '청년 월세 지원금 총정리' }).newsCount).toBe(10);
    expect(resolveFactSourceMix({ topic: '2026 재난지원금 공고' }).blogCount).toBe(0);
  });

  it('falls back to the general mix when nothing is provided', () => {
    expect(resolveFactSourceMix({})).toBe(GENERAL_SOURCE_MIX);
  });
});

describe('resolveBulkSourceMix — 주 재료 수집기', () => {
  it('drops blogs for a public-information query and moves the budget to news', () => {
    const mix = resolveBulkSourceMix('4차 민생지원금');
    expect(mix).toBe(PUBLIC_INFO_BULK_MIX);
    expect(mix.blogCount).toBe(0);
    expect(mix.newsCount).toBe(50);
  });

  it('leaves a general query on the existing 30/20/10 mix', () => {
    const mix = resolveBulkSourceMix('가을 캠핑 준비물');
    expect(mix).toBe(GENERAL_BULK_MIX);
    expect(mix.blogCount).toBe(30);
    expect(mix.newsCount).toBe(20);
    expect(mix.webDocCount).toBe(10);
  });

  it('falls back to the general mix on empty input', () => {
    expect(resolveBulkSourceMix('')).toBe(GENERAL_BULK_MIX);
  });
});
