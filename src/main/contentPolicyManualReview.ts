export interface ContentPolicyManualReviewPayload {
  title?: string;
  publishMode?: string;
  _publishFlow?: string;
  _contentPolicyManualReviewApproved?: boolean;
  _contentPolicyManualReviewPromptAllowed?: boolean;
}

export interface ContentPolicyManualReviewResult {
  success: boolean;
  message?: string;
  cancelled?: boolean;
  manualReviewRequired?: boolean;
  manualReviewReasons?: string[];
}

export interface ContentPolicyManualReviewRequest {
  title: string;
  reasons: string[];
}

export interface ContentPolicyManualReviewDependencies<
  TPayload extends ContentPolicyManualReviewPayload,
  TResult extends ContentPolicyManualReviewResult,
> {
  execute: (payload: TPayload) => Promise<TResult>;
  confirm: (request: ContentPolicyManualReviewRequest) => Promise<boolean>;
}

const INTERACTIVE_FLOWS = new Set([
  'direct',
  'legacy_form',
  'semi_auto',
  'full_auto',
  'continuous',
  'multi_account',
]);

export function canRequestContentPolicyManualReview(payload: ContentPolicyManualReviewPayload): boolean {
  if (payload._contentPolicyManualReviewPromptAllowed === true) return true;
  const flow = String(payload._publishFlow || 'direct').trim() || 'direct';
  if (INTERACTIVE_FLOWS.has(flow)) return true;
  return flow === 'app_scheduler' && payload.publishMode === 'schedule';
}

export async function executeWithContentPolicyManualReview<
  TPayload extends ContentPolicyManualReviewPayload,
  TResult extends ContentPolicyManualReviewResult,
>(
  payload: TPayload,
  dependencies: ContentPolicyManualReviewDependencies<TPayload, TResult>,
): Promise<TResult> {
  const firstResult = await dependencies.execute(payload);
  if (!firstResult.manualReviewRequired
    || payload._contentPolicyManualReviewApproved === true
    || !canRequestContentPolicyManualReview(payload)) {
    return firstResult;
  }

  const approved = await dependencies.confirm({
    title: String(payload.title || '').trim(),
    reasons: [...new Set(firstResult.manualReviewReasons || [])],
  });
  if (!approved) {
    return {
      ...firstResult,
      success: false,
      cancelled: true,
      manualReviewRequired: false,
      message: '최근 글 비교 검수를 완료하지 않아 발행을 취소했습니다. 원고와 이미지는 그대로 유지됩니다.',
    } as TResult;
  }

  const approvedPayload = {
    ...payload,
    _contentPolicyManualReviewApproved: true,
  } as TPayload;
  return dependencies.execute(approvedPayload);
}
