// SPEC-REVIEW-001 P0 smoke tests.
//
// These tests cover acceptance criteria P0-AC1~AC3 at the prompt-assembly
// layer. They do NOT invoke the LLM; live output scanning belongs to the
// manual smoke run documented in acceptance.md. What we verify here:
//
//   AC1 infra — findForbiddenPhrases correctly detects the banned phrases
//               that the post-generation scrub will later rely on.
//   AC2     — when reviews=[] the productBlock drops the "⭐ 실제 구매자 리뷰"
//               line and inserts the absence notice, AND the guard block is
//               appended to the prompt string built by contentGenerator's
//               affiliate branch.
//   AC3     — with REVIEW_GUARD_V1=false the guard block is suppressed.

import { describe, it, expect, afterEach } from 'vitest';
import { buildFullPrompt } from '../../promptLoader';
import {
  isReviewAvailable,
  isReviewGuardEnabled,
  buildReviewGuardBlock,
} from '../../content/reviewGuard';
import {
  FORBIDDEN_EXPERIENTIAL_PHRASES,
  findForbiddenPhrases,
  scanForbiddenPhrases,
} from '../../content/forbiddenPhrases';

// Reproduce the affiliate branch assembly from contentGenerator.ts so the
// test remains decoupled from the giant generateContent function but still
// asserts the exact sequence: buildFullPrompt → shopping prompt → guard.
function assembleAffiliatePrompt(productInfo: {
  name?: string;
  spec?: string;
  price?: string;
  reviews?: string[];
}): string {
  const base = buildFullPrompt('seo', 'tech', false, 'friendly', productInfo);
  const reviewAvailable = isReviewAvailable(productInfo.reviews);
  const guardOn = isReviewGuardEnabled();
  let out = base;
  if (!reviewAvailable && guardOn) {
    out += `\n\n${buildReviewGuardBlock({
      reviewCount: 0,
      hasSpec: Boolean(productInfo.spec),
      hasPrice: Boolean(productInfo.price),
    })}`;
  }
  return out;
}

describe('SPEC-REVIEW-001 P0 — forbiddenPhrases (AC1 infra)', () => {
  it('detects experiential phrases that would signal hallucination', () => {
    expect(findForbiddenPhrases('2주 써봤는데 정말 좋아요')).toContain('써봤');
    expect(findForbiddenPhrases('직접 사용해보니 차이가 있어요')).toContain('사용해보니');
    expect(findForbiddenPhrases('배송받자마자 바로 써봤습니다')).toContain('배송받자마자');
    expect(findForbiddenPhrases('테스트해보니 괜찮네요')).toContain('테스트해보니');
  });

  it('passes clean spec-based analytical text', () => {
    const clean = '공식 스펙상 무게는 150g으로 표기되어 있습니다. 판매가는 29,900원입니다.';
    const result = scanForbiddenPhrases(clean);
    expect(result.clean).toBe(true);
    expect(result.matches).toEqual([]);
  });

  it('exports a non-empty list of banned phrases', () => {
    expect(FORBIDDEN_EXPERIENTIAL_PHRASES.length).toBeGreaterThan(20);
    expect(FORBIDDEN_EXPERIENTIAL_PHRASES).toContain('써봤');
    expect(FORBIDDEN_EXPERIENTIAL_PHRASES).toContain('2주간');
  });
});

describe('SPEC-REVIEW-001 P0 — reviewGuard helpers', () => {
  const originalFlag = process.env.REVIEW_GUARD_V1;
  afterEach(() => {
    if (originalFlag == null) delete process.env.REVIEW_GUARD_V1;
    else process.env.REVIEW_GUARD_V1 = originalFlag;
  });

  it('isReviewAvailable reflects reviews array length', () => {
    expect(isReviewAvailable([])).toBe(false);
    expect(isReviewAvailable(undefined)).toBe(false);
    expect(isReviewAvailable(null)).toBe(false);
    expect(isReviewAvailable(['리뷰1'])).toBe(true);
  });

  it('isReviewGuardEnabled defaults to true and flips on "false"', () => {
    delete process.env.REVIEW_GUARD_V1;
    expect(isReviewGuardEnabled()).toBe(true);

    process.env.REVIEW_GUARD_V1 = 'false';
    expect(isReviewGuardEnabled()).toBe(false);

    process.env.REVIEW_GUARD_V1 = '0';
    expect(isReviewGuardEnabled()).toBe(false);

    process.env.REVIEW_GUARD_V1 = 'true';
    expect(isReviewGuardEnabled()).toBe(true);
  });

  it('buildReviewGuardBlock injects the SPEC marker and conversion steering', () => {
    const block = buildReviewGuardBlock({ reviewCount: 0, hasSpec: true, hasPrice: true });
    expect(block).toContain('[P0 리뷰 데이터 부재 가드');
    // Conversion-aware guard (no hard-coded length cap; natural sizing)
    expect(block).toContain('카테고리 자판단');
    expect(block).toContain('Type A');
    expect(block).toContain('입력 데이터 인벤토리');
    expect(block).toContain('독자 페르소나 후킹');
    expect(block).toContain('외부 신뢰 이관');
    // Data inventory must list the supplied fields
    expect(block).toContain('스펙');
    expect(block).toContain('가격');
  });

  it('buildReviewGuardBlock omits missing data from the inventory line', () => {
    const block = buildReviewGuardBlock({ reviewCount: 0, hasSpec: true, hasPrice: false });
    // Inventory line must reflect actual availability, never hard-code price
    expect(block).toContain('제품명 / 스펙');
    expect(block).not.toContain('제품명 / 스펙 / 가격');
  });
});

describe('SPEC-REVIEW-001 P0 — affiliate prompt assembly', () => {
  const originalFlag = process.env.REVIEW_GUARD_V1;
  afterEach(() => {
    if (originalFlag == null) delete process.env.REVIEW_GUARD_V1;
    else process.env.REVIEW_GUARD_V1 = originalFlag;
  });

  // AC2 — empty reviews: no review list, explicit absence notice, guard appended.
  it('empty reviews triggers review-absence notice and appends guard block', () => {
    delete process.env.REVIEW_GUARD_V1;
    const prompt = assembleAffiliatePrompt({
      name: '테스트 제품',
      spec: '무게 150g, 배터리 24시간',
      price: '29,900원',
      reviews: [],
    });

    expect(prompt).toContain('⚠️ 실제 구매자 리뷰 데이터가 수집되지 않았습니다');
    expect(prompt).not.toContain('⭐ 실제 구매자 리뷰');
    expect(prompt).toContain('[P0 리뷰 데이터 부재 가드');
    // Conversion-aware guard surfaces the category self-selection step
    expect(prompt).toContain('카테고리 자판단');
    expect(prompt).toContain('Type A');
  });

  // AC2 — populated reviews: normal path, no guard block.
  it('populated reviews keeps the review list and omits the guard block', () => {
    delete process.env.REVIEW_GUARD_V1;
    const prompt = assembleAffiliatePrompt({
      name: '테스트 제품',
      spec: '무게 150g',
      price: '29,900원',
      reviews: ['가볍고 좋아요', '디자인이 예쁩니다'],
    });

    expect(prompt).toContain('⭐ 실제 구매자 리뷰');
    expect(prompt).toContain('가볍고 좋아요');
    expect(prompt).not.toContain('⚠️ 실제 구매자 리뷰 데이터가 수집되지 않았습니다');
    expect(prompt).not.toContain('[P0 리뷰 데이터 부재 가드');
  });

  // AC3 — feature-flag OFF: guard suppressed, legacy path intact.
  it('REVIEW_GUARD_V1=false suppresses the guard block (legacy path)', () => {
    process.env.REVIEW_GUARD_V1 = 'false';
    const prompt = assembleAffiliatePrompt({
      name: '테스트 제품',
      spec: '무게 150g',
      price: '29,900원',
      reviews: [],
    });

    expect(prompt).not.toContain('[P0 리뷰 데이터 부재 가드');
    // The productBlock notice still fires — it's a structural change in
    // promptLoader, not gated by the flag. Flag only suppresses the strong
    // append-time guard so ops can A/B test.
    expect(prompt).toContain('⚠️ 실제 구매자 리뷰 데이터가 수집되지 않았습니다');
  });
});
