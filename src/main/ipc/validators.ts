// v2.7.63 SEC-V2-H5 — IPC payload 검증 (zod 의존 없이 경량 구현)
//
// Opus 토론 결론: zod 추가 의존 부담 < 자체 가드 함수
// IPC 핸들러가 받는 payload를 화이트리스트 타입으로 강제

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isStr(v: unknown, max = 4096): v is string {
  return typeof v === 'string' && v.length <= max;
}
export function isNum(v: unknown, min = -1e12, max = 1e12): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}
export function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}
export function isArrStr(v: unknown, maxLen = 200): v is string[] {
  return Array.isArray(v) && v.length <= maxLen && v.every(x => isStr(x));
}

/**
 * search-images-for-headings payload 검증
 */
export function validateSearchImagesPayload(payload: unknown): ValidationResult<{
  headings: string[];
  mainKeyword: string;
}> {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'payload는 object여야 합니다' };
  const p = payload as Record<string, unknown>;
  if (!isArrStr(p.headings, 50)) return { ok: false, error: 'headings는 string[] (최대 50)이어야 합니다' };
  if (!isStr(p.mainKeyword, 200)) return { ok: false, error: 'mainKeyword는 200자 이하 string이어야 합니다' };
  return { ok: true, value: { headings: p.headings as string[], mainKeyword: p.mainKeyword as string } };
}

/**
 * file:* payload 검증 (단일 경로 string)
 */
export function validatePathPayload(filePath: unknown): ValidationResult<string> {
  if (!isStr(filePath, 4096)) return { ok: false, error: 'filePath는 string이어야 합니다' };
  if ((filePath as string).includes('\0')) return { ok: false, error: 'null byte 차단' };
  return { ok: true, value: filePath as string };
}
