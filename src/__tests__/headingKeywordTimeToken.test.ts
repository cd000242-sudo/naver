import { describe, expect, it } from 'vitest';

import { resolveHeadingKeywordCore } from '../contentHeadingKeywordPatch';

/**
 * [2026-09-02 실측] 소제목 넷이 전부 "9월" 로 시작했다.
 *
 *   메인키워드 "9월 가을 환절기 침구 교체: 구스 이불 vs 차렵이불 세탁"
 *   → core = "9월"
 *   → 소제목 "9월 교체의 구스 선택" · "9월 차렵이불 대신 양모를 볼 조건"
 * 앞의 것은 한국어로 읽히지 않는다. 감지기도 잡았다 —
 *   [HeadingVariety] ⚠️ 소제목 4개가 전부 숫자를 앞세웁니다
 * 잡고도 그대로 나갔다.
 *
 * 숫자 시점 표기는 문법적으로 수식어다. "9월 침구" 의 머리는 침구다.
 * 그 판정을 여기에 새로 만들지 않고 searchQueryNarrowing 의 것을 가져다 쓴다 —
 * 목록이 두 벌이 되면 한쪽만 고치는 실패가 또 난다(이 저장소가 반복해서 겪었다).
 */

describe('시점 표기는 소제목 핵심어가 되지 않는다', () => {
  it.each([
    ['9월 가을 환절기 침구 교체: 구스 이불 vs 차렵이불 세탁', '침구'],
    ['2026년 가을 이사철: 신축 아파트 셀프 입주청소 체크리스트 및 하자', '신축'],
    ['다가오는 추석 명절 대비: 냉장고 찌든 냄새 제거 및 식재료', '냉장고'],
  ])('%s → "%s"', (keyword, expected) => {
    expect(resolveHeadingKeywordCore(keyword).core).toBe(expected);
  });

  /*
   * 형태 규칙이라 코드에 적힌 적 없는 달·연도도 걸러진다.
   * 여기가 빨개지면 누군가 형태 규칙을 낱말 나열로 되돌린 것이다.
   */
  it.each([['3월'], ['11월'], ['2029년'], ['17일']])(
    '%s 처럼 코드에 없는 시점 표기도 수식어로 본다',
    (token) => {
      expect(resolveHeadingKeywordCore(`${token} 제습기 청소 방법`).core).toBe('제습기');
    },
  );

  it('시점이 주제의 일부여도 머리 명사를 고른다', () => {
    expect(resolveHeadingKeywordCore('9월 모의고사').core).toBe('모의고사');
  });
});

describe('고를 것이 없으면 예전처럼 고른다 (fail-open)', () => {
  /*
   * 핵심어를 못 고르는 것보다 예전처럼 고르는 편이 낫다.
   * 새 조건이 모든 후보를 떨어뜨려도 접두 기능 자체가 죽으면 안 된다.
   */
  it('토큰이 전부 시점어·상투구면 기존 동작으로 떨어진다', () => {
    const r = resolveHeadingKeywordCore('가을 대비 총정리');
    expect(r.core).toBeTruthy();
    expect(r.shouldPatch).toBe(true);
  });

  it('빈 키워드는 그대로 빈 결과다', () => {
    expect(resolveHeadingKeywordCore('').shouldPatch).toBe(false);
    expect(resolveHeadingKeywordCore('   ').shouldPatch).toBe(false);
  });
});

describe('기존 실측 회귀는 그대로 지킨다', () => {
  /*
   * 이 둘은 과거 발행 사고에서 들어온 규칙이다(파일 주석 2026-07-04 · 2026-08-05).
   * 새 조건이 그것들을 덮어쓰면 안 된다.
   */
  it('동사 관형형은 여전히 핵심어가 아니다 — "오는" 접두 사고', () => {
    expect(resolveHeadingKeywordCore('비 오는 날 수건 쉰내').core).toBe('수건');
  });

  it('지시관형사는 여전히 핵심어가 아니다 — "이런" 접두 사고', () => {
    const r = resolveHeadingKeywordCore('이런 엿같은 사랑 하영 누구');
    expect(r.core).not.toBe('이런');
  });

  it('인물 이슈 키워드는 접두를 붙이지 않는다', () => {
    expect(resolveHeadingKeywordCore('이런 엿같은 사랑 하영 누구').shouldPatch).toBe(false);
  });
});
