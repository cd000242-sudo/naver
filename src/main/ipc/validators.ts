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
  sourceUrl?: string;
}> {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'payload는 object여야 합니다' };
  const p = payload as Record<string, unknown>;
  if (!isArrStr(p.headings, 50)) return { ok: false, error: 'headings는 string[] (최대 50)이어야 합니다' };
  if (!isStr(p.mainKeyword, 200)) return { ok: false, error: 'mainKeyword는 200자 이하 string이어야 합니다' };
  // ✅ [v2.7.66] sourceUrl 선택적 — URL 모드 글 생성 시 원본 URL 우선 크롤링
  const sourceUrl = p.sourceUrl;
  if (sourceUrl !== undefined && sourceUrl !== null && !isStr(sourceUrl, 2048)) {
    return { ok: false, error: 'sourceUrl은 2048자 이하 string이어야 합니다' };
  }
  return {
    ok: true,
    value: {
      headings: p.headings as string[],
      mainKeyword: p.mainKeyword as string,
      sourceUrl: sourceUrl as string | undefined,
    },
  };
}

/**
 * issue:collectImages payload 검증 (이슈 끝판왕 수집)
 */
export function validateIssueCollectPayload(payload: unknown): ValidationResult<{
  title: string;
  headings: Array<{ title: string; body?: string }>;
  mainKeyword?: string;
  intro?: string;
}> {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'payload는 object여야 합니다' };
  const p = payload as Record<string, unknown>;
  if (!isStr(p.title, 300)) return { ok: false, error: 'title은 300자 이하 string이어야 합니다' };
  if (!Array.isArray(p.headings) || p.headings.length === 0 || p.headings.length > 30) {
    return { ok: false, error: 'headings는 1~30개 배열이어야 합니다' };
  }
  const headings: Array<{ title: string; body?: string }> = [];
  for (const h of p.headings) {
    if (!h || typeof h !== 'object') return { ok: false, error: 'heading 항목은 object여야 합니다' };
    const hh = h as Record<string, unknown>;
    if (!isStr(hh.title, 300)) return { ok: false, error: 'heading.title은 300자 이하 string이어야 합니다' };
    if (hh.body !== undefined && hh.body !== null && !isStr(hh.body, 20000)) {
      return { ok: false, error: 'heading.body는 20000자 이하 string이어야 합니다' };
    }
    headings.push({ title: hh.title as string, body: (hh.body as string | undefined) ?? undefined });
  }
  if (p.mainKeyword !== undefined && p.mainKeyword !== null && !isStr(p.mainKeyword, 200)) {
    return { ok: false, error: 'mainKeyword는 200자 이하 string이어야 합니다' };
  }
  // [2026-08-17] intro — 사건 맥락 파악용 서론 (없어도 동작, 있으면 정확도 상승)
  if (p.intro !== undefined && p.intro !== null && !isStr(p.intro, 20000)) {
    return { ok: false, error: 'intro는 20000자 이하 string이어야 합니다' };
  }
  return {
    ok: true,
    value: {
      title: p.title as string,
      headings,
      mainKeyword: (p.mainKeyword as string | undefined) ?? undefined,
      intro: (p.intro as string | undefined) ?? undefined,
    },
  };
}

/**
 * file:* payload 검증 (단일 경로 string)
 */
export function validatePathPayload(filePath: unknown): ValidationResult<string> {
  if (!isStr(filePath, 4096)) return { ok: false, error: 'filePath는 string이어야 합니다' };
  if ((filePath as string).includes('\0')) return { ok: false, error: 'null byte 차단' };
  return { ok: true, value: filePath as string };
}
