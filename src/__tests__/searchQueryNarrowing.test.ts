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

  /*
   * [2026-09-01 정정] 처음에는 "콜론 뒤가 본체" 를 정답으로 박았는데 그 전제가 틀렸다.
   * 에어컨 키워드는 주제어가 콜론 앞에 있어("여름 에어컨 … 필수: 필터 청소 …")
   * 콜론 뒤만 취하면 주제어를 잃는다. 이 테스트가 그 틀린 전제를 지키고 있었다.
   * 이제 위치가 아니라 낱말의 무게로 고른다.
   */
  it('주제어가 후보에 남는다', () => {
    const queries = narrowSearchQueries(CASE);
    expect(queries[1]).toContain('냉장고');
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

describe('주제어를 잃지 않는다 — 콜론 뒤가 항상 본체는 아니다', () => {
  /*
   * [2026-09-01 실측 회귀] 내가 넣은 좁힘이 이번에는 역효과를 냈다.
   *
   *   "여름 에어컨 가을 보관 전 필수: 필터 청소 및 내부 건조 무작정 따라하기"
   *   → "필터 청소 및 내부"        ← "에어컨" 이 사라졌다
   *
   * 냉장고 때는 주제어가 콜론 뒤였다("추석 연휴 대비: 냉장고 파먹기").
   * 이번에는 콜론 앞이다. "콜론 뒤가 본체" 라는 전제가 틀렸다.
   *
   * 그 결과 "필터 청소 및 내부" 라는 일반어로 검색했고, 에어건 제품 리뷰 ·
   * 환기설비 · 담배 신제품 뉴스가 자료로 딸려와 본문에 실렸다.
   *
   * 콜론 위치가 아니라 낱말의 무게로 고른다. 계절 · 시점 · 상투구는 버리고
   * 실질 명사를 남긴다.
   */
  const CASE = '여름 에어컨 가을 보관 전 필수: 필터 청소 및 내부 건조 무작정 따라하기';

  it('주제어가 모든 후보에 남는다', () => {
    for (const q of narrowSearchQueries(CASE).slice(1)) {
      expect(q).toContain('에어컨');
    }
  });

  it('계절 · 상투구는 버린다', () => {
    const second = narrowSearchQueries(CASE)[1];
    expect(second).not.toMatch(/무작정|따라하기|필수/);
  });

  it('냉장고 사례도 그대로 동작한다 — 회귀 방지', () => {
    const queries = narrowSearchQueries('추석 연휴 대비: 냉장고 파먹기 식재료 정리 및 성에 제거');
    expect(queries[1]).toContain('냉장고');
    expect(queries[1]).not.toMatch(/추석|연휴|대비/);
  });

  it('후보가 검색 가능한 길이로 줄어든다', () => {
    const second = narrowSearchQueries(CASE)[1];
    expect(second.split(' ').length).toBeLessThanOrEqual(4);
    expect(second.length).toBeLessThan(CASE.length);
  });
});
