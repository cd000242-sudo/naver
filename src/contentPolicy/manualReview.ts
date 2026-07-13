import type { ContentPolicyResult } from './types.js';

export const RECENT_POST_MANUAL_REVIEW_REASONS = new Set([
  'BLOCK_RECENT_POSTS_UNAVAILABLE',
  'BLOCK_RECENT_POSTS_CORRUPT',
  'BLOCK_INSUFFICIENT_RECENT_POSTS',
  'BLOCK_MISSING_RECENT_POSTS',
]);

export function isRecentPostManualReviewReason(reason: string): boolean {
  return RECENT_POST_MANUAL_REVIEW_REASONS.has(String(reason || '').trim());
}

export function recentPostManualReviewReasons(reasons: readonly string[]): string[] {
  return [...new Set(reasons.filter(isRecentPostManualReviewReason))];
}

export function isOnlyRecentPostManualReviewReasons(reasons: readonly string[]): boolean {
  const unique = [...new Set(reasons.filter(Boolean))];
  return unique.length > 0 && unique.every(isRecentPostManualReviewReason);
}

export function approveRecentPostManualReview(
  result: ContentPolicyResult,
  approvedAt = new Date().toISOString(),
): ContentPolicyResult {
  const reviewReasons = recentPostManualReviewReasons(result.block_reasons);
  if (!isOnlyRecentPostManualReviewReasons(result.block_reasons)) return result;

  return {
    ...result,
    decision: 'PASS',
    block_reasons: [],
    manual_review: {
      required: false,
      reasons: reviewReasons,
      approved: true,
      approved_at: approvedAt,
    },
    publication: {
      ...result.publication,
      allowed: true,
      manual_review_required: false,
    },
    stage_trace: result.stage_trace.map((entry) => {
      if (entry.stage === 'PublishGuard') {
        return { ...entry, status: 'PASS', reasons: ['MANUAL_REVIEW_APPROVED'] };
      }
      if (entry.stage === 'ExposureMonitor') {
        return { ...entry, status: 'SKIP', reasons: ['PENDING_PUBLICATION'] };
      }
      return { ...entry, reasons: [...entry.reasons] };
    }),
  };
}
