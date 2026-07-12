export const SCHEDULE_PUBLISH_OUTCOME_UNKNOWN = 'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN';

export function createSchedulePublishOutcomeUnknownError(cause?: unknown): Error {
  const error = new Error(
    `${SCHEDULE_PUBLISH_OUTCOME_UNKNOWN}: 예약 확인 버튼을 누른 뒤 결과를 확정하지 못했습니다. ` +
    '중복 예약을 막기 위해 자동 재시도하지 않습니다. 네이버 예약 글 목록을 확인해주세요.',
  );
  error.name = 'SchedulePublishOutcomeUnknownError';
  (error as Error & { code?: string; cause?: unknown }).code = SCHEDULE_PUBLISH_OUTCOME_UNKNOWN;
  (error as Error & { code?: string; cause?: unknown }).cause = cause;
  return error;
}

export function isSchedulePublishOutcomeUnknown(error: unknown): boolean {
  if (!error) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === SCHEDULE_PUBLISH_OUTCOME_UNKNOWN
    || String(candidate.message || error).includes(SCHEDULE_PUBLISH_OUTCOME_UNKNOWN);
}

