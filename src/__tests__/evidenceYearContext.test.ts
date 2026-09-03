import { describe, expect, it } from 'vitest';

import { collectUnsupportedConcreteClaims } from '../content/evidenceIntegrity';

/** [2026-09-04 4차 검증] "2026년 9월 2일" 의 2026 이 자료에 없다고 안전 점수를 깎아 재생성을 불렀다 — 올해 연도는 앱이 준 문맥이다 */
describe('근거 없는 수치 — 연도 문맥', () => {
  const year = new Date().getFullYear();
  const material = '3일 서울시와 서울주택도시개발공사가 제공한 퇴거자 내역에는 1만929건이 담겼다. 평균 거주기간은 6년 9개월이었다.';

  it('올해 연도만 단독으로 쓴 것은 잡지 않는다', () => {
    expect(collectUnsupportedConcreteClaims(`${year}년 기준으로 퇴거는 1만929건이었습니다.`, material)).toEqual([]);
  });

  it('자료에도 없고 올해도 아닌 연도는 여전히 잡는다', () => {
    expect(collectUnsupportedConcreteClaims('2019년 기준으로 퇴거는 1만929건이었습니다.', material)).toContain('2019년');
  });
});
