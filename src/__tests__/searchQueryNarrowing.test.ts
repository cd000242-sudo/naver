import { describe, expect, it } from 'vitest';

import { narrowSearchQueries } from '../content/searchQueryNarrowing';

/**
 * [2026-09-01] 사장님 지적: "자료가 0건이면 글을 어떻게 쓰라고 하는 거니?"
 *
 * 맞다. 답은 생성을 멈추는 것이 아니라 자료를 제대로 찾는 것이다.
 * 그리고 왜 0건이었는지가 로그에 그대로 있었다.
 *
 *   검색어: "추석 연휴 대비: 냉장고 파먹기 식재료 정리 및 성에 제거"
 *
 * 이건 검색어가 아니라 문장이다. 어느 검색엔진에 넣어도 0건이 나온다.
 * 구글 뉴스가 "표시할 항목이 없습니다" 를 뱉은 것이 당연하다. 그 화면을 긁어와
 * 헤드라인이 자료가 됐고, 그 숫자가 냉장고 사실로 둔갑했다.
 *
 * 뿌리는 크롤러가 아니라 질의였다. 문장을 검색 가능한 조각으로 쪼갠다.
 *   "냉장고 파먹기", "냉동실 성에 제거" 로 넣으면 자료가 쏟아진다.
 */
describe('문장형 키워드를 검색 가능한 질의로 쪼갠다', () => {
  const CASE = '추석 연휴 대비: 냉장고 파먹기 식재료 정리 및 성에 제거';

  it('원문을 첫 후보로 유지한다 — 짧은 키워드는 그대로가 최선이다', () => {
    expect(narrowSearchQueries(CASE)[0]).toBe(CASE);
  });

  it('콜론 뒤 본체를 후보로 낸다', () => {
    expect(narrowSearchQueries(CASE)).toContain('냉장고 파먹기 식재료 정리 및 성에 제거');
  });

  it('접속어로 갈라 각 조각을 후보로 낸다', () => {
    const queries = narrowSearchQueries(CASE);
    expect(queries.some((q) => q.includes('냉장고 파먹기'))).toBe(true);
    expect(queries.some((q) => q.includes('성에 제거'))).toBe(true);
  });

  it('후보가 점점 짧아진다 — 넓게 가다 좁힌다', () => {
    const queries = narrowSearchQueries(CASE);
    expect(queries.length).toBeGreaterThan(2);
    expect(queries[queries.length - 1].length).toBeLessThan(CASE.length);
  });

  it('중복 후보를 내지 않는다', () => {
    const queries = narrowSearchQueries(CASE);
    expect(new Set(queries).size).toBe(queries.length);
  });
});

describe('짧은 키워드는 건드리지 않는다', () => {
  it('이미 검색어면 후보가 하나뿐이다', () => {
    expect(narrowSearchQueries('냉장고 파먹기')).toEqual(['냉장고 파먹기']);
  });

  it('두 어절도 그대로 둔다', () => {
    expect(narrowSearchQueries('가을 환절기 비염')).toEqual(['가을 환절기 비염']);
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(narrowSearchQueries('')).toEqual([]);
    expect(() => narrowSearchQueries(undefined as never)).not.toThrow();
  });
});
