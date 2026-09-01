import { describe, expect, it } from 'vitest';

import { isOnTopicForKeyword } from '../content/supplementTopicGuard';
import { narrowSearchQueries } from '../content/searchQueryNarrowing';

/**
 * [2026-09-01 실측] 명절 냉장고 정리 글에 김치냉장고 제품 스펙이 통째로 실렸다.
 *
 *   소제목 3: "용량별 김치냉장고 라인업 및 키친핏 세트 스펙 비교"
 *             RR40C7905AP · 349만 원 · RK70F49M1ZG · 199만 원 · 1392L
 *
 * 출구 게이트를 달았는데도 통과했다. 30개 블로그 중 1건만 버렸다.
 * isOnTopicForKeyword 가 "주제어 하나라도 포함" 이면 통과시키기 때문이다.
 * 김치냉장고 구매 글도 "냉장고" 를 포함하니 통과한다 —
 * 정리 · 냄새 제거와 구매는 완전히 다른 의도인데 낱말 하나로 묶였다.
 *
 * 그리고 질의 좁힘이 "다가오는" 을 주제어로 잡았다.
 *   후보1: "다가오는 냉장고 식재료 소분"
 *   후보3: "다가오는 냉장고"
 * 뜻 없는 관형어인데 불용어 목록에 없어서 첫 실질 명사로 취급됐다.
 */
describe('주제어 하나로 통과시키지 않는다', () => {
  const KEYWORD = '냉장고 식재료 소분 냄새 제거';

  it('제품 구매 글은 "냉장고" 하나로 통과하지 못한다', () => {
    const productPost = '삼성 비스포크 AI 김치냉장고 4도어 490L 에센셜 RK70F49M1ZG 최저가 199만 원. '
      + '키친핏 1도어 라인업 RR40C7905AP 약 349만 원. 용량별 가격 비교와 구매 가이드.';
    expect(isOnTopicForKeyword(productPost, KEYWORD)).toBe(false);
  });

  it('실제 주제 글은 통과한다', () => {
    const onTopic = '냉장고 냄새를 잡으려면 먼저 식재료를 소분해 밀폐 용기에 담고, '
      + '베이킹소다로 내부를 닦아 오염원을 제거합니다.';
    expect(isOnTopicForKeyword(onTopic, KEYWORD)).toBe(true);
  });

  it('주제어가 하나뿐이면 그 하나로 판정한다 — 짧은 키워드를 막지 않는다', () => {
    expect(isOnTopicForKeyword('냉장고 청소법을 정리했습니다.', '냉장고')).toBe(true);
    expect(isOnTopicForKeyword('자동차 정비 요령입니다.', '냉장고')).toBe(false);
  });

  it('빈 입력은 통과시킨다 — 판정할 재료가 없다', () => {
    expect(isOnTopicForKeyword('', '냉장고 소분')).toBe(true);
    expect(isOnTopicForKeyword('아무 글', '')).toBe(true);
  });
});

describe('뜻 없는 관형어를 주제어로 잡지 않는다', () => {
  it('"다가오는" 은 검색어에서 빠진다', () => {
    const queries = narrowSearchQueries('다가오는 추석 명절 대비 냉장고 식재료 소분 및 냄새 잡는 핵심 기준');
    for (const q of queries.slice(1)) {
      expect(q).not.toMatch(/다가오는/u);
    }
  });

  it('주제어는 남는다', () => {
    const queries = narrowSearchQueries('다가오는 추석 명절 대비 냉장고 식재료 소분 및 냄새 잡는 핵심 기준');
    expect(queries[1]).toContain('냉장고');
  });
});
