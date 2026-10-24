import * as fs from 'fs';

const MAX_STATE_BYTES = 1024 * 1024;
const KNOWN_REASONS = new Set([
  'EXPOSURE_TARGET_METADATA_UNAVAILABLE', 'EXPOSURE_TARGET_METADATA_INCOMPLETE',
  'EXPOSURE_MONITOR_FAILURE', 'EXPOSURE_RECENT_POSTS_UNAVAILABLE', 'EXPOSURE_RECENT_POSTS_CORRUPT',
  'EXPOSURE_ARTICLE_METADATA_UNAVAILABLE', 'EXPOSURE_PUBLICATION_HISTORY_UNAVAILABLE',
  'EXPOSURE_AUDIT_LOG_CORRUPT', 'EXPOSURE_AUDIT_UNAVAILABLE', 'EXPOSURE_MONITOR_PERSISTENCE_FAILURE',
  'TWO_CONSECUTIVE_CONFIRMED_MISSING', 'STATE_REBUILT_FROM_CORRUPT', 'AUTOMATIC_POLICY_DIAGNOSTIC',
  'POLICY_POST_PUBLISH_RECORD_FAILED', 'POLICY_RECENT_POSTS_WRITE_FAILED',
  'POLICY_EXPOSURE_QUEUE_WRITE_FAILED', 'POLICY_EXPOSURE_TARGET_INVALID',
  'POLICY_POST_PUBLISH_RECORD_FAILED:RECENT_POST_RECORD_INCOMPLETE',
  'RECOVERED_NONCRITICAL_RECORD_PAUSE:POLICY_POST_PUBLISH_RECORD_FAILED:RECENT_POST_RECORD_INCOMPLETE',
]);
const absent = '(없음)';
function reason(value: unknown): string {
  if (value === undefined || value === null || value === '') return absent;
  if (typeof value !== 'string') return '(잘못된 형식)';
  // Only known codes leave the device; operator text and exception details may contain credentials or drafts.
  const codes = value.slice(0, 500).split(',').map(item => KNOWN_REASONS.has(item.trim()) ? item.trim() : item.split(':', 1)[0].trim());
  return codes.length && codes.every(code => KNOWN_REASONS.has(code)) ? codes.join(',') : '(비공개 사유)';
}
const timestamp = (value: unknown): string => value === undefined || value === null ? absent
  : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value : '(잘못된 형식)';
const enumValue = (value: unknown, allowed: readonly string[]): string => value === undefined || value === null ? absent
  : typeof value === 'string' && allowed.includes(value) ? value : '(잘못된 형식)';

/** Raw, bounded, read-only evidence: never invoke the store's migration or self-healing load. */
export function describePublicationState(file: string): string[] {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    if (fs.fstatSync(fd).size > MAX_STATE_BYTES) return ['발행 정책 상태: 크기 제한 초과'];
    const buffer = Buffer.alloc(MAX_STATE_BYTES + 1);
    const size = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (size > MAX_STATE_BYTES) return ['발행 정책 상태: 크기 제한 초과'];
    const state: unknown = JSON.parse(buffer.subarray(0, size).toString('utf8'));
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('invalid-state');
    const data = state as Record<string, unknown>;
    return ['----- 발행 정책 상태 (원본 파일, 읽기 전용) -----',
      `status: ${enumValue(data.status, ['ACTIVE', 'PAUSED'])}`, `pause_origin: ${enumValue(data.pause_origin, ['operator', 'integrity'])}`,
      `pause_reason: ${reason(data.pause_reason)}`, `paused_at: ${timestamp(data.paused_at)}`,
      `last_advisory_reason: ${reason(data.last_advisory_reason)}`, `last_advisory_at: ${timestamp(data.last_advisory_at)}`,
      `historyCount: ${Array.isArray(data.history) ? data.history.length : data.history === undefined ? 0 : '(잘못된 형식)'}`];
  } catch (error) {
    return [(error as NodeJS.ErrnoException).code === 'ENOENT' ? '발행 정책 상태: 파일 없음' : '발행 정책 상태: 읽기 실패 또는 잘못된 형식'];
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* Report generation must survive a close error. */ } }
  }
}
