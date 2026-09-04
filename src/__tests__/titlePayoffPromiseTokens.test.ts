/**
 * [2026-09-04 실측 56편] 제목 상환 지표가 동사 활용형·조각을 "약속"으로 세어 평균 66% 로 낮게 보고했다.
 * 약속은 제목이 묻는 대상(명사)이다. 아래는 실측에서 나온 오탐 전부와, 같은 끝소리를 가진 정상 명사.
 */
import { describe, expect, it } from 'vitest';
import { checkTitlePayoff } from '../content/titlePayoffCheck';

const promises = (title: string): string[] =>
  checkTitlePayoff({ title, primaryKeyword: '', payoffZone: '아무 내용도 겹치지 않는 도입부입니다. '.repeat(4) }).promised;

describe('제목 약속 토큰 — 동사 활용형과 조각은 약속이 아니다', () => {
  it('실측 오탐을 약속으로 세지 않는다', () => {
    expect(promises('9월 꽃구경 국내여행지, 초순과 중순엔 어디로 가야 할까요?')).not.toContain('가야');
    expect(promises('9월 꽃구경 국내여행지, 초순과 중순엔 어디로 가야 할까요?')).not.toContain('할까요');
    expect(promises('난방비 얼마나 줄여야 체감될까')).not.toContain('줄여야');
    expect(promises('중고차 지금 잡으려 한다면 볼 것')).not.toContain('잡으려');
    expect(promises('에어컨 껐던 사람이 다시 켜는 기준')).not.toContain('껐던');
    expect(promises('연말정산 세금 공제받 순서')).not.toContain('공제받');
    expect(promises('전입신고 직전까 확인할 항목')).not.toContain('직전까');
    expect(promises('청약통장 해지하면 보면 달라지는 것')).not.toContain('보면');
    expect(promises('전세 계약 전 반드시 확인하세요')).not.toContain('확인하세요');
    expect(promises('외출할 때 보일러 설정')).not.toContain('외출할');
  });

  it('같은 끝소리를 가진 명사는 약속으로 남는다', () => {
    expect(promises('건축 분야 시야 확보 기준')).toEqual(expect.arrayContaining(['분야', '시야']));
    expect(promises('화면 측면 배려 대기 시간')).toEqual(expect.arrayContaining(['화면', '측면', '배려', '대기']));
    expect(promises('국민연금 수령 나이 변경, 순서와 이유')).toEqual(expect.arrayContaining(['수령', '순서', '이유']));
  });
});
