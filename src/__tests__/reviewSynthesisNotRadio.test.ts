import { describe, expect, it } from 'vitest';

import { buildAffiliateAuthenticityContract } from '../content/affiliateAuthenticity';

/**
 * [2026-09-03 사장님 화면] "글이 그냥 다른 사람 후기를 읽어주는 라디오마냥 작성했는데..??"
 * 후기 12건 REVIEW_SYNTHESIS 글이 "구매자 후기에는… 또 다른 구매자는… 의견도 이어집니다" 로 이어졌다.
 * 계약이 "필요한 곳에서만 출처를 밝힌다" 로 열어 둔 자리를 모델이 문장마다 썼다. 형태로 막는다.
 */
describe('후기 종합은 라디오가 아니다', () => {
  const c = buildAffiliateAuthenticityContract({ productReviews: ['소음이 거의 없어서 밤에 써도 괜찮았어요', '허벅지 쪽이 종아리보다 더 조여지는 느낌이에요', '지퍼가 처음엔 뻑뻑한데 며칠 쓰니 부드러워졌어요'] } as never);

  it('한 건씩 읽어 주지 말고 사실로 압축해 장면·판단으로 바꾸라고 한다', () => {
    expect(c).toContain('후기를 한 건씩 읽어 주지 않는다');
    expect(c).toContain('사용 장면과 구매 판단으로 바꿔 쓰되 작성자 본인의 체험처럼 바꾸지 않는다');
  });

  it('출처 표기는 갈리는 자리에서 한 번, 글 전체 세 개 이하', () => {
    expect(c).toContain('의견이 갈리는 자리에서 한 번만');
    expect(c).toContain('세 개를 넘기지 않는다');
  });

  it('작성자 체험 위장 금지는 그대로다', () => {
    expect(c).toContain('"제가 써보니/받아보니/우리 집에서는/가족도 좋아했다"를 쓰지 않는다');
  });
});
