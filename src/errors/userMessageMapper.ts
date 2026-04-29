// v2.7.42 — 사용자 노출 에러 메시지 친화화 통합 매퍼
//
// Phase 1 진단(docs/diagnosis-2026-04-29/error-msg-detail.md): 사용자 노출 메시지 1,644건 중
// FLOW_*/HTTP_/AdsPower 등 영문 prefix·jargon이 직접 노출되는 건이 다수.
// 본 모듈은 throw된 에러를 사용자 표시 직전 한국어 친화 메시지로 변환한다.

const PREFIX_STRIP = /^(FLOW_[A-Z_]+|NAVER_[A-Z_]+|HTTP_\d+|AdsPower\s+API\s+HTTP\s+\d+):?\s*/;

const ERROR_KEYWORDS: Array<{ pattern: RegExp; replacement: string }> = [
  // 영문 → 한국어 매핑
  { pattern: /Access Denied/gi, replacement: '네이버가 봇 차단했습니다 (5~10분 후 재시도 또는 IP 변경)' },
  { pattern: /\bENOENT\b/gi, replacement: '파일을 찾을 수 없습니다' },
  { pattern: /\bEACCES\b/gi, replacement: '파일 접근 권한이 없습니다' },
  { pattern: /Invalid JSONP response format/gi, replacement: '네이버 응답 형식이 변경되었습니다. 패치를 기다려주세요' },
  { pattern: /Invalid state\b/gi, replacement: '내부 상태 오류 (앱 재시작 권장)' },
  { pattern: /Required element #(\S+) not found/gi, replacement: '필수 요소(#$1)를 찾을 수 없습니다' },
  // 알 수 없는 오류 폴백
  { pattern: /원인 불명|알 수 없는 오류|unknown error|Unknown error|unknown/gi, replacement: '잠시 후 다시 시도하거나 다른 옵션을 선택해주세요' },
];

const FINISH_REASON_MAP: Record<string, string> = {
  SAFETY: '안전필터에 걸림',
  MAX_TOKENS: '응답 길이 한도 초과',
  RECITATION: '저작권 검사에 걸림',
  PROHIBITED_CONTENT: '금지된 콘텐츠',
  OTHER: '기타 사유',
};

/**
 * 에러 메시지를 사용자 노출용 한국어 친화 메시지로 변환.
 *  - 디버그 prefix(FLOW_*, NAVER_*, HTTP_*) 제거
 *  - 영문 jargon 한국어 대체
 *  - finishReason 영문 → 한국어 매핑
 */
export function toUserMessage(err: unknown): string {
  let msg = (err instanceof Error ? err.message : String(err || '')).trim();
  if (!msg) return '잠시 후 다시 시도해주세요.';

  // 1. 디버그 prefix 제거 (FLOW_LOGIN_TIMEOUT:..., HTTP_401:..., NAVER_ALL_KEYS_FAILED:...)
  msg = msg.replace(PREFIX_STRIP, '');

  // 2. 영문 키워드 → 한국어
  for (const { pattern, replacement } of ERROR_KEYWORDS) {
    msg = msg.replace(pattern, replacement);
  }

  // 3. finishReason 영문 → 한국어
  msg = msg.replace(/finishReason:\s*([A-Z_]+)/g, (_match, reason) => {
    const ko = FINISH_REASON_MAP[reason as string] || reason;
    return `사유: ${ko}`;
  });

  // 4. 함수명 노출 차단 (setupBrowser(), switchToMainFrame() 등)
  msg = msg.replace(/\s*[a-zA-Z][a-zA-Z0-9]*\(\)을?를?\s*먼저\s*호출하세요\.?/g, '');

  return msg;
}

/**
 * Wrap throw — catch 블록에서 사용자 표시 전에 호출하면 친화 메시지 반환.
 * @example
 *   } catch (e) {
 *     toastManager.error(toUserMessage(e));
 *   }
 */
export function userFriendly(err: unknown): { title: string; message: string } {
  const message = toUserMessage(err);
  return {
    title: '오류',
    message,
  };
}
