export const IMMEDIATE_PUBLISH_OUTCOME_UNKNOWN = 'PUBLISH_UNCONFIRMED';

export function createImmediatePublishOutcomeUnknownError(cause?: unknown): Error {
  if (isImmediatePublishOutcomeUnknown(cause)) return cause as Error;

  const error = new Error(
    `${IMMEDIATE_PUBLISH_OUTCOME_UNKNOWN}: 발행 확인 버튼을 누른 뒤 결과를 확정하지 못했습니다. `
    + '이중 발행을 막기 위해 자동 재시도하지 않습니다. 네이버 블로그에서 발행 여부를 확인해주세요.',
  );
  error.name = 'ImmediatePublishOutcomeUnknownError';
  (error as Error & { code?: string; cause?: unknown }).code = IMMEDIATE_PUBLISH_OUTCOME_UNKNOWN;
  (error as Error & { code?: string; cause?: unknown }).cause = cause;
  return error;
}

export function isImmediatePublishOutcomeUnknown(error: unknown): boolean {
  if (!error) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === IMMEDIATE_PUBLISH_OUTCOME_UNKNOWN
    || String(candidate.message || error).includes(IMMEDIATE_PUBLISH_OUTCOME_UNKNOWN);
}
