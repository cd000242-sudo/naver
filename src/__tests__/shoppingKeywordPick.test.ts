import { describe, expect, it } from 'vitest';

import { buildShoppingKeywordInferencePrompt, pickShoppingSearchKeyword, shoppingHeadNoun } from '../content/urlModeKeywordPicker';

/**
 * [2026-09-02 사장님 승인 ②] 쇼핑 경로도 검색량으로 키워드를 고른다.
 * 닥터웰: 상위호환 분석이 "닥터웰 종아리 마사지기"(검색량 80)를 메인으로 정했다. 사람들이 치는 말은 따로 있다.
 */
const EXISTING = '닥터웰 종아리 마사지기';
const CANDS = ['종아리 마사지기 추천', '다리 공기압 마사지기', '닥터웰 종아리 마사지기', '후기', '소음', 'DR-5180'];

describe('쇼핑 검색 키워드 선정', () => {
  it('머리 명사(마사지기)를 품지 않는 곁말(후기·소음·모델코드)은 버린다', () => {
    const r = pickShoppingSearchKeyword(EXISTING, CANDS, []);
    expect(r.candidates).toEqual(['종아리 마사지기 추천', '다리 공기압 마사지기']);
    expect(shoppingHeadNoun(EXISTING)).toBe('마사지기');
  });

  it('검색량을 못 구했으면 바꾸지 않는다 — 모델 판단만으로 바꾸지 않는다', () => {
    const r = pickShoppingSearchKeyword(EXISTING, CANDS, []);
    expect(r.replaced).toBe(false);
    expect(r.keyword).toBe(EXISTING);
  });

  it('검색량이 확실히 더 큰 상품 검색어가 있으면 그것으로 교체한다', () => {
    const r = pickShoppingSearchKeyword(EXISTING, CANDS, [
      { keyword: EXISTING, monthlySearches: 80 },
      { keyword: '종아리 마사지기 추천', monthlySearches: 9900 },
      { keyword: '다리 공기압 마사지기', monthlySearches: 2400 },
    ]);
    expect(r.replaced).toBe(true);
    expect(r.keyword).toBe('종아리 마사지기 추천');
    expect(r.reason).toContain('9,900');
  });

  it('기존이 더 크면 유지한다', () => {
    const r = pickShoppingSearchKeyword(EXISTING, CANDS, [
      { keyword: EXISTING, monthlySearches: 12000 },
      { keyword: '종아리 마사지기 추천', monthlySearches: 9900 },
    ]);
    expect(r.replaced).toBe(false);
    expect(r.keyword).toBe(EXISTING);
  });

  it('프롬프트는 품목형·브랜드+품목형을 섞고 옵션·모델코드·스토어명을 뺀다', () => {
    const p = buildShoppingKeywordInferencePrompt('본문', '닥터웰 종아리 공기압 마사지기 DR-5180 그레이 본체+다리', EXISTING);
    expect(p).toContain('품목형');
    expect(p).toContain('브랜드+품목형');
    expect(p).toContain('옵션·색상·모델코드·스토어명');
    expect(p).toContain('현재 키워드: 닥터웰 종아리 마사지기');
  });
});
