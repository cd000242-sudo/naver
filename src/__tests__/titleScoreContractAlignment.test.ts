import { describe, it, expect } from 'vitest';
import { scoreTitleForHomefeed } from '../content/ctrCombat';

/**
 * [2026-08-26] 제목 CTR 점수가 situationTitleContract가 금지한 형태를 보상하고 있었다.
 * 제목 후보 재선택(selectBestTitleCandidate)이 이 점수를 쓰기 때문에, 금지된 공식
 * 제목이 계약을 지킨 제목을 이기고 발행되는 구조였다.
 */
describe('제목 점수 ↔ 제목 계약', () => {
  it('숫자 리스트형이 상황형을 이기지 못한다', () => {
    const formula = scoreTitleForHomefeed('청약통장 해지 전 확인할 3가지', 'finance');
    const situation = scoreTitleForHomefeed('청약통장 해지, 2년 안 채웠을 때 갈리는 지점', 'finance');
    expect(situation.score).toBeGreaterThan(formula.score);
  });

  it('리스트형 숫자는 가산점이 아니라 감점이다', () => {
    // 한글 접미("3가지", "5개")도 반드시 잡혀야 한다.
    // JS 정규식의  는 한글을 단어문자로 보지 않아 문자열 끝에서 그냥 지나간다 —
    // 실제로 그 형태로 넣었다가 "3가지"가 감점되지 않는 것을 실측으로 잡았다.
    for (const listy of ['주말에 가볼 만한 서울 카페 TOP 10', '청약통장 해지 전 확인할 3가지', '제습기 5개 비교']) {
      const r = scoreTitleForHomefeed(listy, 'food');
      expect(r.breakdown['리스트형 숫자 감점']).toBeLessThan(0);
      expect(r.breakdown['구체 수치']).toBeUndefined();
    }
  });

  it('숫자가 리스트가 아닌 사실 서술이면 감점하지 않는다', () => {
    for (const factual of ['5분이면 끝나는 전입신고', '3위까지 오른 이유']) {
      const r = scoreTitleForHomefeed(factual, 'finance');
      expect(r.breakdown['리스트형 숫자 감점']).toBeUndefined();
      expect(r.breakdown['구체 수치']).toBe(15);
    }
  });

  it('날짜·금액 같은 구체 수치는 그대로 보상한다', () => {
    const r = scoreTitleForHomefeed('2026년 청약통장 금리, 기존 가입자는 어떻게 되나', 'finance');
    expect(r.breakdown['구체 수치']).toBe(15);
    expect(r.breakdown['리스트형 숫자 감점']).toBeUndefined();
  });

  it('계약 금지어(방법·정리·가이드)에 가산점을 주지 않는다', () => {
    for (const banned of ['여권 재발급 방법', '연말정산 총정리', '전세 계약 완벽 가이드']) {
      const r = scoreTitleForHomefeed(banned, 'finance');
      expect(r.breakdown['카테고리 앵커']).toBeUndefined();
    }
  });
});
