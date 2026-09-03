import { describe, expect, it } from 'vitest';

import { computeHomefeedIntroCriticalIssues } from '../contentTitleValidators';

/**
 * [2026-09-04 사장님 결정] 홈판 게이트가 "첫 화면에서 독자 상황과 읽을 이유가 함께 드러나지 않음" 을 세 엔진에서 똑같이 찍었는데
 * 도입부 패치는 길이만 봐서 한 번도 발화하지 않았다. 평가기와 같은 단서로 패치를 부른다.
 */
describe('홈판 도입부 — 독자 상황 결여를 패치 사유로', () => {
  it('분석형 예고문 도입부는 상황 결여로 잡힌다', () => {
    const issues = computeHomefeedIntroCriticalIssues(
      '인사청문회를 앞둔 이번 공방의 핵심은 후보자의 직접 활동이 확정됐느냐가 아니라 조직문화 문제를 알았거나 묵인했는지입니다. 사안마다 제기된 근거와 해명이 다릅니다.',
    );
    expect(issues.some((issue) => issue.includes('독자가 겪는 구체 상황'))).toBe(true);
  });

  it('독자 상황과 얻을 것이 첫 화면에 있으면 통과', () => {
    const issues = computeHomefeedIntroCriticalIssues(
      '청문회 기사만 보면 언더조직·보조금·겸직이 한 덩어리로 보여서 헷갈리기 쉬워요. 이 글은 세 쟁점을 따로 떼어 어디서 갈리는지 기준을 잡아 드립니다.',
    );
    expect(issues).toEqual([]);
  });

  it('길이 초과는 여전히 잡는다', () => {
    const long = '처음 보면 헷갈려요. 기준을 드릴게요. 하나. 둘. 셋. 넷. 다섯. 여섯.';
    expect(computeHomefeedIntroCriticalIssues(long)).toContain('도입부가 너무 김');
    expect(computeHomefeedIntroCriticalIssues('')).toEqual([]);
  });
});
