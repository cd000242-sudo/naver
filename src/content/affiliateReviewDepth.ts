import { selectDecisionUsefulReviewTexts } from '../crawler/shopping/utils/reviewTextSelection.js';

export type AffiliateReviewDepthEvidenceMode = 'review_synthesis' | 'spec_only';

export type AffiliateReviewDepthIssueCode =
  | 'REVIEW_PAIN_POINT_UNUSED'
  | 'REVIEW_USE_OUTCOME_UNUSED'
  | 'FEATURE_NAME_PARAPHRASE'
  | 'MISSING_REVIEW_ATTRIBUTION';

export interface AffiliateReviewDepthIssue {
  readonly code: AffiliateReviewDepthIssueCode;
  readonly message: string;
}

export interface AffiliateReviewDepthInput {
  readonly title?: unknown;
  readonly body?: unknown;
  readonly productReviews?: unknown;
}

export interface AffiliateReviewDepthReport {
  readonly evidenceMode: AffiliateReviewDepthEvidenceMode;
  readonly reviewEvidenceCount: number;
  readonly usedReviewEvidenceCount: number;
  readonly issues: readonly AffiliateReviewDepthIssue[];
  readonly advisoryAccepted: boolean;
  readonly retryDirective: string;
}

const REVIEW_ATTRIBUTION_PATTERN = /구매자\s*후기|사용자\s*후기|실구매\s*후기|후기(?:를|에서|에는|들을|에)|리뷰(?:를|에서|에는|들을|에)|구매자(?:들은|가|들이)/i;
const REVIEW_OUTCOME_PATTERN = /줄었|덜했|덜했고|빨리|말랐|해결|나아|편해|불편|번거|힘들|거슬|소음|시끄|적응|감수|아쉽|문제|고장|교환|반품/i;
const FEATURE_PARAPHRASE_PATTERN = /표기|기능명|기능\s*이름|필요한\s*기능|상품명|제품명|후보|판단\s*기준/g;
const DECISION_ANCHORS: readonly string[] = Object.freeze([
  '설치', '타공', '구멍', '천장', '전원', '배선', '교체', '조립', '연결', '규격',
  '소음', '소리', '시끄', '조용', '진동', '저단', '고단', '최고 단계', '야간',
  '제습', '습기', '물기', '건조', '온풍', '한기', '바람', '풍량', '속도',
  '청소', '세척', '필터', '물통', '관리', '곰팡',
  '크기', '사이즈', '무게', '공간', '자리', '이동', '보관',
  '버튼', '리모컨', '조작', '설정', '모드', '불편', '번거', '어렵',
  '고장', '내구', '수리', 'AS', '교환', '반품', '불량', '파손',
  '배송', '포장', '도착', '전기', '요금', '소비전력', '유지비',
]);

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function countUsedReviewEvidence(body: string, reviews: readonly string[]): number {
  if (!REVIEW_ATTRIBUTION_PATTERN.test(body)) return 0;
  const compactBody = body.toLowerCase().replace(/\s+/g, ' ');

  return reviews.reduce((count, review) => {
    const compactReview = review.toLowerCase().replace(/\s+/g, ' ');
    const anchors = DECISION_ANCHORS.filter(anchor => compactReview.includes(anchor.toLowerCase()));
    const sharedAnchors = anchors.filter(anchor => compactBody.includes(anchor.toLowerCase()));
    const reviewNumbers = compactReview.match(/\d+\s*(?:분|시간|일|주|개월|단계|mm|cm|db)/gi) || [];
    const hasSharedNumber = reviewNumbers.some(value => compactBody.includes(value.toLowerCase()));
    return count + (sharedAnchors.length >= 2 || (hasSharedNumber && sharedAnchors.length >= 1) ? 1 : 0);
  }, 0);
}

function makeRetryDirective(issues: readonly AffiliateReviewDepthIssue[]): string {
  if (issues.length === 0) return '';
  return `[후기 근거 중심 재작성 보강]
${issues.map(issue => `- ${issue.message}`).join('\n')}
- 구매자 후기의 구체 상황을 작성자 경험으로 바꾸지 말고 출처를 분명히 한다.
- 상품명과 기능을 다시 설명하지 말고, 후기에서 확인된 문제 → 사용 결과·해결 또는 남은 한계 → 맞는 사람과 맞지 않는 사람으로 다시 구성한다.`;
}

/**
 * Advisory-only review-depth audit. It never blocks generation or publishing
 * and never requests an extra provider call on its own.
 */
export function auditAffiliateReviewDepth(
  input: AffiliateReviewDepthInput,
): AffiliateReviewDepthReport {
  const reviews = selectDecisionUsefulReviewTexts(input.productReviews, 8);
  if (reviews.length === 0) {
    return Object.freeze({
      evidenceMode: 'spec_only',
      reviewEvidenceCount: 0,
      usedReviewEvidenceCount: 0,
      issues: Object.freeze([]),
      advisoryAccepted: false,
      retryDirective: '',
    });
  }

  const body = normalizeText(input.body);
  const fullText = `${normalizeText(input.title)} ${body}`.trim();
  const usedReviewEvidenceCount = countUsedReviewEvidence(body, reviews);
  const issues: AffiliateReviewDepthIssue[] = [];

  if (usedReviewEvidenceCount === 0) {
    issues.push(Object.freeze({
      code: 'REVIEW_PAIN_POINT_UNUSED',
      message: '수집된 구매자 후기의 구체적인 불편·설치·사용 조건이 본문 중심에 사용되지 않았습니다.',
    }));
  }
  if (!REVIEW_ATTRIBUTION_PATTERN.test(body)) {
    issues.push(Object.freeze({
      code: 'MISSING_REVIEW_ATTRIBUTION',
      message: '구매자 후기 근거가 있지만 본문에서 구매자 의견이라는 출처가 드러나지 않습니다.',
    }));
  }
  if (usedReviewEvidenceCount === 0 || !REVIEW_OUTCOME_PATTERN.test(body)) {
    issues.push(Object.freeze({
      code: 'REVIEW_USE_OUTCOME_UNUSED',
      message: '후기에서 확인된 사용 결과·해결·적응 또는 남은 한계가 구매 판단으로 연결되지 않았습니다.',
    }));
  }
  if ((fullText.match(FEATURE_PARAPHRASE_PATTERN) || []).length >= 3) {
    issues.push(Object.freeze({
      code: 'FEATURE_NAME_PARAPHRASE',
      message: '실제 후기 근거 대신 상품명과 기능 이름을 상식적으로 풀어쓴 문장이 글을 차지하고 있습니다.',
    }));
  }

  const frozenIssues = Object.freeze(issues);
  return Object.freeze({
    evidenceMode: 'review_synthesis',
    reviewEvidenceCount: reviews.length,
    usedReviewEvidenceCount,
    issues: frozenIssues,
    advisoryAccepted: issues.length > 0,
    retryDirective: makeRetryDirective(frozenIssues),
  });
}
