import { describe, expect, it } from 'vitest';
import { computeHomefeedTitleQuoteIssues, titleCarriesQuote } from '../content/homefeedTitleQuoteUse';

/*
 * [2026-09-17] "…제작진 답은?" 류 마무리 규율.
 *
 * 홈판 9/1,283(0.70%) vs 미진입 14/793(1.77%) — 발생비 0.40배, Fisher p = 0.030.
 * 근거는 약한 편이고(표본 9 대 14), 그래서 영향 범위도 홈판 제목의 0.7% 로 좁다.
 * 앞에 인용이 있으면 면제된다 — 실측상 이 형태로 홈판에 든 제목은 앞에 인용이 있었다.
 */
const pass = (t: string) => expect(computeHomefeedTitleQuoteIssues({ title: t })).toEqual([]);
const fail = (t: string) => expect(computeHomefeedTitleQuoteIssues({ title: t }).length).toBeGreaterThan(0);

describe('조사·물음표 종결은 앞의 인용이 있을 때만 통과한다', () => {
  it('인용 없이 조사+물음표로 닫으면 재작성 대상', () => {
    fail('식당 오픈 전 대기 목격담… 전현무 계획4 사전 섭외 의혹, 제작진 답은?');
  });

  it('인용 없이 조사로만 끊어도 재작성 대상', () => {
    fail('신인배우와 3개월만에 결혼한 톱스타, 최신 근황은');
  });

  it('앞에 인용이 있으면 같은 마무리도 통과한다 — 실제 홈판 3위 제목', () => {
    pass('"후배들 믿는다" 8년 함께한 강호동 하차, 새 멤버 합류가 바꿀 분위기는?');
  });

  it('작은따옴표 인용도 인정한다', () => {
    pass('‘즉흥은 지켰다’ 전현무 계획4 제작진이 목격담 앞에 그은 선은?');
  });
});

describe('그 밖의 마무리는 건드리지 않는다', () => {
  it('명사로 닫으면 통과', () => {
    pass('오픈 전 대기 목격담은 퍼졌는데…제작진이 사실과 다르다고 한 세 가지');
  });

  it('말줄임으로 닫으면 통과', () => {
    pass('섭외 없이 318곳 돌았다던 예능, 제작진이 목격담 앞에 내놓은 답은 이랬다..');
  });

  it('명사+물음표는 통과 — 실측 1.08배로 불리하지 않다', () => {
    pass('전 세계 7주 1위인데 한국에선 폭망한 영화가 넷플릭스에서 역주행한 이유?');
  });

  it('빈 제목은 판정 대상이 아니다', () => {
    pass('');
    pass('   ');
  });
});

describe('titleCarriesQuote', () => {
  it('짝이 맞고 내용이 있는 따옴표만 인정한다', () => {
    expect(titleCarriesQuote('"이는 사실과 다르다" 제작진 입장')).toBe(true);
    expect(titleCarriesQuote('제작진 입장은 단호했다')).toBe(false);
    expect(titleCarriesQuote('따옴표 하나만 " 있는 경우')).toBe(false);
  });
});
