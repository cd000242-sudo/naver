import { describe, expect, it } from 'vitest';

import { findFutureDatedPastClaims, describeFutureDatedPastClaims } from '../content/futureDatedPastClaim';

/**
 * [2026-09-01 사장님 실측] 침구 글이 아직 오지 않은 날의 실적을 과거형으로 단정했다.
 *
 *   오늘: 2026년 9월 1일
 *   본문: "2026년 9월 마지막 주부터 추석 연휴가 포함된 10월 9일까지
 *          롯데백화점 침구류 매출은 전주 대비 25% 증가했습니다."
 *
 * 행사도 마찬가지다. 이름은 "2025 구스&울 페어" 인데 기간은 "2026년 10월 17일~11월 9일" 이다.
 * 2025년 보도자료를 읽고 연도만 2026으로 갱신한 것이다.
 *
 * 왜 그랬는지 찾았다. 우리가 시켰다.
 *   contentGenerator.ts:891
 *     "지금은 2026년입니다. 시즌성/연도 기반 콘텐츠에서 년도를 표기할 때는
 *      반드시 '2026년' 형태로 정확히 쓰세요"
 *
 * 지시의 의도는 "2026년 정부 지원금" 처럼 올해 것을 쓸 때 연도를 밝히라는 것이었는데,
 * 자료에 적힌 날짜는 건드리지 말라는 단서가 없었다. 그래서 과거 자료의 날짜까지 갱신했다.
 *
 * 독자가 이걸 읽고 백화점에 가면 행사가 없다. 신뢰가 한 번에 무너지는 종류다.
 */
const NOW = new Date('2026-09-01T00:00:00+09:00');

describe('오지 않은 날을 과거형으로 쓰면 잡는다', () => {
  it('실측 문장을 잡는다', () => {
    const found = findFutureDatedPastClaims(
      '2026년 9월 마지막 주부터 10월 9일까지 침구류 매출은 전주 대비 25% 증가했습니다.',
      NOW,
    );
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].date).toContain('10월 9일');
  });

  it('연도가 없어도 올해로 보고 판정한다', () => {
    expect(findFutureDatedPastClaims('11월 9일까지 행사가 진행됐습니다.', NOW).length).toBeGreaterThan(0);
  });

  it('무엇이 문제인지 말해준다', () => {
    const msg = describeFutureDatedPastClaims(
      findFutureDatedPastClaims('10월 9일까지 매출이 25% 증가했습니다.', NOW),
    ).join(' ');
    expect(msg).toMatch(/아직|앞으로|오지 않은/);
  });
});

describe('정상 문장은 건드리지 않는다', () => {
  it('지난 날짜의 과거형은 정상이다', () => {
    expect(findFutureDatedPastClaims('8월 15일까지 매출이 25% 증가했습니다.', NOW)).toHaveLength(0);
  });

  it('미래 날짜를 미래형으로 쓰면 정상이다', () => {
    for (const s of [
      '10월 17일부터 11월 9일까지 행사가 진행됩니다.',
      '10월 17일부터 할인이 시작됩니다.',
      '11월 9일까지 구매하시면 됩니다.',
    ]) {
      expect(findFutureDatedPastClaims(s, NOW)).toHaveLength(0);
    }
  });

  it('지난 연도의 과거형은 정상이다', () => {
    expect(findFutureDatedPastClaims('2025년 10월 17일부터 행사가 진행됐습니다.', NOW)).toHaveLength(0);
  });

  it('날짜가 없으면 판정하지 않는다', () => {
    expect(findFutureDatedPastClaims('매출이 크게 늘었습니다.', NOW)).toHaveLength(0);
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(findFutureDatedPastClaims('', NOW)).toHaveLength(0);
    expect(() => findFutureDatedPastClaims(undefined as never, NOW)).not.toThrow();
  });
});
