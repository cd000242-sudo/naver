import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildAffiliateAuthenticityContract } from '../content/affiliateAuthenticity';
import { buildReviewGuardBlock } from '../content/reviewGuard';

/**
 * [2026-09-02 사장님 결정 (a)] 쇼핑 모드 AI 경험 생성 — 사용 장면 서술만, 구매·기간 주장은 계속 금지.
 * 옵트인이 켜졌는데도 쇼핑 계약이 "FIRST_PARTY 아니면 1인칭 금지" 를 못 박아 "구매자 의견이 있어요" 로만 나왔다.
 * [2026-09-03 사장님] "1인칭시점에서 글이나와야지 … 후기가이렇다 이런식으로 넣지말라" — (a)의 현재형·조건형 제한을 작성자 1인칭
 *   체험 서술로 올렸다. 숫자 기간·구매 시점·내돈내산·가족 반응 금지는 그대로다. 상세: affiliateFirstPersonOptIn.test.ts
 */
const REVIEWS = ['소음이 거의 없어요', '허벅지 쪽이 더 조여요', '지퍼가 뻑뻑해요'];

describe('쇼핑 계약: AI 경험 옵트인', () => {
  it('켜지면 작성자 1인칭 체험 블록을 열고, 숫자 기간·구매·내돈내산 금지는 그대로 적는다', () => {
    const c = buildAffiliateAuthenticityContract({ productReviews: REVIEWS, aiExperienceGeneration: true } as never);
    expect(c).toContain('[AI 경험 옵트인 — 작성자 1인칭 체험');
    expect(c).toMatch(/"후기에서는", "구매자들은"/u);
    expect(c).toContain('구매 시점, 내돈내산, 가족 반응');
    expect(c).toContain('자료는 늘어나지 않는다');
    expect(c).toContain('REVIEW_SYNTHESIS');
  });

  it('꺼져 있으면 옵트인 블록이 없다 — 켠 사람이 책임지는 기능', () => {
    const c = buildAffiliateAuthenticityContract({ productReviews: REVIEWS } as never);
    expect(c).not.toContain('AI 경험 옵트인');
  });

  it('사용자 경험 메모(FIRST_PARTY)가 있으면 옵트인 블록을 얹지 않는다 — 메모가 근거다', () => {
    const c = buildAffiliateAuthenticityContract({
      productReviews: REVIEWS,
      aiExperienceGeneration: true,
      personalExperience: '두 달째 매일 밤 15분씩 씁니다. 허벅지 쪽 압박이 더 세게 느껴져서 첫 주엔 1단으로 썼어요.',
    } as never);
    expect(c).toContain('FIRST_PARTY');
    expect(c).not.toContain('AI 경험 옵트인');
  });
});

describe('리뷰 부재 가드(SPEC_ONLY)도 같은 예외를 안다', () => {
  it('옵트인이면 1인칭 체험 예외를 적고, 아니면 없다', () => {
    const on = buildReviewGuardBlock({ reviewCount: 0, hasSpec: true, hasPrice: false, aiExperienceOptIn: true });
    expect(on).toContain('[AI 경험 옵트인 — 이 가드의 예외');
    expect(on).toContain('작성자 1인칭 체험으로 쓴다');
    const off = buildReviewGuardBlock({ reviewCount: 0, hasSpec: true, hasPrice: false });
    expect(off).not.toContain('AI 경험 옵트인');
  });

  it('배선: contentGenerator 가 가드에 옵트인을 넘긴다', () => {
    const src = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8');
    expect(src).toMatch(/aiExperienceOptIn: source\.aiExperienceGeneration === true,/u);
  });
});
