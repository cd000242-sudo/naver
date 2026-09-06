import { describe, expect, it } from 'vitest';

import { applyKeywordPrefixToTitle } from '../contentKeywordPrefix';

/**
 * [2026-09-06 사장님: "seo모드나 홈판모드 제목도 봐주고"] 9/6 배치 실측.
 *
 * 제목이 검색어의 변형구(토큰 2개 이상이 이어진 구절)를 이미 품고 있는데 검색어를 앞에 붙이면
 * 같은 구절이 두 번 나온다. 그 뒤 중복 제거기가 안쪽 구절을 걷어내면 문장이 토막 난다.
 *
 *   업체:  "가을 이불 세탁 방법" + "여름 이불 세탁 방법, 소재별로 …"
 *          → "가을 이불 세탁 방법 여름 이불 세탁 방법, 소재별로 …"(30점)
 *          → 중복 제거 → "가을 이불 세탁 방법 여름, 소재별로 …"(100점으로 발행)
 *   쇼핑:  "다리 공기압 마사지기" + "닥터웰 공기압 마사지기 DR-5180, 운동 후 …"
 *          → "다리 공기압 마사지기 닥터웰 공기압 마사지기 DR-5180, …"(0점 → 게이트가 후보로 갈아탐)
 *
 * 변형구가 있으면 붙이지 않는다. 앞 3자 요건은 못 채우지만(경고), 토막 난 제목보다 낫다.
 * 정확 구절이 통째로 있는 경우(split 재배치)와 토큰이 흩어진 경우(ENDGAME 구멍)는 그대로 붙인다.
 */
describe('검색어 변형구가 이미 제목에 있으면 접두를 생략한다', () => {
  it('[업체 실측] "가을 이불 세탁 방법" vs "여름 이불 세탁 방법, …" — 붙이지 않는다', () => {
    const title = '여름 이불 세탁 방법, 소재별로 손상 없이 보관하는 기준';
    expect(applyKeywordPrefixToTitle(title, '가을 이불 세탁 방법', { ensureFront3: true, maxWidth: 40 })).toBe(title);
  });

  it('[쇼핑 실측] "다리 공기압 마사지기" vs "닥터웰 공기압 마사지기 DR-5180, …" — 붙이지 않는다', () => {
    const title = '닥터웰 공기압 마사지기 DR-5180, 운동 후 다리 부종 관리로 써보니';
    expect(applyKeywordPrefixToTitle(title, '다리 공기압 마사지기', { ensureFront3: true, maxWidth: 60 })).toBe(title);
  });

  it('[홈판 후보 실측] 앞 3자 강제가 아닌 경로도 같다 — "냉장고 정리 냉장고 정리가" 를 만들지 않는다', () => {
    const title = '냉장고 정리가 고민인 주부들이 추석 전에 꼭 확인하는 이마트 할인';
    expect(applyKeywordPrefixToTitle(title, '추석 명절 냉장고 정리')).toBe(title);
  });

  it('토큰 하나만 겹치는 건 변형구가 아니다 — 예전대로 붙인다', () => {
    const forced = applyKeywordPrefixToTitle('명절 지출 줄이는 장보기 순서', '추석 명절 냉장고 정리', { ensureFront3: true, maxWidth: 40 });
    expect(forced.startsWith('추석 명절 냉장고 정리')).toBe(true);
  });

  it('긴 검색어의 절반에 못 미치는 짧은 겹침은 변형구가 아니다 — 예전대로 붙인다', () => {
    const keyword = '가을 이불 세탁 방법 소재별 보관';
    const out = applyKeywordPrefixToTitle('이불 세탁 전에 라벨부터 확인하는 이유', keyword, { ensureFront3: true, maxWidth: 60 });
    expect(out.startsWith(keyword)).toBe(true);
  });

  it('[회귀 잠금] 토큰이 흩어진 ENDGAME 케이스와 정확 구절 재배치는 그대로 앞에 온다', () => {
    expect(applyKeywordPrefixToTitle('바꿨더니 효과 본 다이어트 식단', '다이어트 식단', { ensureFront3: true }).startsWith('다이어트 식단')).toBe(true);
    const moved = applyKeywordPrefixToTitle('올여름 전기세 절약 꿀팁 총정리', '전기세 절약', { ensureFront3: true });
    expect(moved.startsWith('전기세 절약')).toBe(true);
    expect(moved.split('전기세 절약').length - 1).toBe(1);
  });
});
