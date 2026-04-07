/**
 * 에러 코드 통합 열거형
 *
 * 문자열 기반 에러 판별을 대체하여 타입 안전한 에러 분류 체계 제공.
 * 각 코드는 "카테고리.구체적사유" 형식.
 */

// ── 에러 카테고리 ──

export enum ErrorCategory {
  /** 네트워크/타임아웃 관련 */
  NETWORK = 'NETWORK',
  /** 브라우저/페이지 관련 */
  BROWSER = 'BROWSER',
  /** 인증/로그인 관련 */
  AUTH = 'AUTH',
  /** 네이버 에디터 관련 */
  EDITOR = 'EDITOR',
  /** 발행 관련 */
  PUBLISH = 'PUBLISH',
  /** 이미지 관련 */
  IMAGE = 'IMAGE',
  /** 콘텐츠 생성 관련 */
  CONTENT = 'CONTENT',
  /** 라이선스 관련 */
  LICENSE = 'LICENSE',
  /** 시스템/기타 */
  SYSTEM = 'SYSTEM',
}

// ── 에러 코드 ──

export enum ErrorCode {
  // --- NETWORK ---
  NETWORK_TIMEOUT = 'NETWORK.TIMEOUT',
  NETWORK_NAVIGATION_FAILED = 'NETWORK.NAVIGATION_FAILED',
  NETWORK_CONNECTION_RESET = 'NETWORK.CONNECTION_RESET',
  NETWORK_DNS_FAILED = 'NETWORK.DNS_FAILED',
  NETWORK_SSL_ERROR = 'NETWORK.SSL_ERROR',
  NETWORK_TOO_MANY_REQUESTS = 'NETWORK.TOO_MANY_REQUESTS',

  // --- BROWSER ---
  BROWSER_CLOSED = 'BROWSER.CLOSED',
  BROWSER_CRASHED = 'BROWSER.CRASHED',
  BROWSER_TARGET_CLOSED = 'BROWSER.TARGET_CLOSED',
  BROWSER_CONTEXT_DESTROYED = 'BROWSER.CONTEXT_DESTROYED',
  BROWSER_FRAME_DETACHED = 'BROWSER.FRAME_DETACHED',
  BROWSER_SESSION_CLOSED = 'BROWSER.SESSION_CLOSED',
  BROWSER_PROTOCOL_ERROR = 'BROWSER.PROTOCOL_ERROR',

  // --- AUTH ---
  AUTH_LOGIN_FAILED = 'AUTH.LOGIN_FAILED',
  AUTH_WRONG_PASSWORD = 'AUTH.WRONG_PASSWORD',
  AUTH_CAPTCHA_REQUIRED = 'AUTH.CAPTCHA_REQUIRED',
  AUTH_ACCOUNT_LOCKED = 'AUTH.ACCOUNT_LOCKED',
  AUTH_SESSION_EXPIRED = 'AUTH.SESSION_EXPIRED',
  AUTH_COOKIE_INVALID = 'AUTH.COOKIE_INVALID',

  // --- EDITOR ---
  EDITOR_NOT_LOADED = 'EDITOR.NOT_LOADED',
  EDITOR_FRAME_NOT_FOUND = 'EDITOR.FRAME_NOT_FOUND',
  EDITOR_SELECTOR_FAILED = 'EDITOR.SELECTOR_FAILED',
  EDITOR_CONTENT_INPUT_FAILED = 'EDITOR.CONTENT_INPUT_FAILED',
  EDITOR_TITLE_INPUT_FAILED = 'EDITOR.TITLE_INPUT_FAILED',

  // --- PUBLISH ---
  PUBLISH_MODAL_NOT_FOUND = 'PUBLISH.MODAL_NOT_FOUND',
  PUBLISH_CATEGORY_FAILED = 'PUBLISH.CATEGORY_FAILED',
  PUBLISH_BUTTON_NOT_FOUND = 'PUBLISH.BUTTON_NOT_FOUND',
  PUBLISH_CONFIRM_FAILED = 'PUBLISH.CONFIRM_FAILED',
  PUBLISH_SCHEDULE_FAILED = 'PUBLISH.SCHEDULE_FAILED',
  PUBLISH_DAILY_LIMIT = 'PUBLISH.DAILY_LIMIT',
  PUBLISH_HOURLY_LIMIT = 'PUBLISH.HOURLY_LIMIT',
  PUBLISH_INTERVAL_TOO_SHORT = 'PUBLISH.INTERVAL_TOO_SHORT',

  // --- IMAGE ---
  IMAGE_UPLOAD_FAILED = 'IMAGE.UPLOAD_FAILED',
  IMAGE_TOO_LARGE = 'IMAGE.TOO_LARGE',
  IMAGE_FORMAT_INVALID = 'IMAGE.FORMAT_INVALID',
  IMAGE_DOWNLOAD_FAILED = 'IMAGE.DOWNLOAD_FAILED',
  IMAGE_GENERATION_FAILED = 'IMAGE.GENERATION_FAILED',
  IMAGE_CONSISTENCY_LOW = 'IMAGE.CONSISTENCY_LOW',

  // --- CONTENT ---
  CONTENT_GENERATION_FAILED = 'CONTENT.GENERATION_FAILED',
  CONTENT_API_ERROR = 'CONTENT.API_ERROR',
  CONTENT_QUALITY_LOW = 'CONTENT.QUALITY_LOW',
  CONTENT_PARSE_ERROR = 'CONTENT.PARSE_ERROR',

  // --- LICENSE ---
  LICENSE_INVALID = 'LICENSE.INVALID',
  LICENSE_EXPIRED = 'LICENSE.EXPIRED',
  LICENSE_QUOTA_EXCEEDED = 'LICENSE.QUOTA_EXCEEDED',
  LICENSE_SERVER_ERROR = 'LICENSE.SERVER_ERROR',

  // --- SYSTEM ---
  SYSTEM_UNKNOWN = 'SYSTEM.UNKNOWN',
  SYSTEM_FILE_IO = 'SYSTEM.FILE_IO',
  SYSTEM_MEMORY = 'SYSTEM.MEMORY',
}

// ── 에러 속성 매트릭스 ──

interface ErrorProperties {
  readonly retryable: boolean;
  readonly fatal: boolean;
  readonly category: ErrorCategory;
  readonly userMessage: string;
}

const ERROR_PROPERTIES: Readonly<Record<ErrorCode, ErrorProperties>> = {
  // NETWORK — 대부분 재시도 가능
  [ErrorCode.NETWORK_TIMEOUT]: { retryable: true, fatal: false, category: ErrorCategory.NETWORK, userMessage: '네트워크 응답 시간 초과' },
  [ErrorCode.NETWORK_NAVIGATION_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.NETWORK, userMessage: '페이지 이동 실패' },
  [ErrorCode.NETWORK_CONNECTION_RESET]: { retryable: true, fatal: false, category: ErrorCategory.NETWORK, userMessage: '네트워크 연결 끊김' },
  [ErrorCode.NETWORK_DNS_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.NETWORK, userMessage: 'DNS 조회 실패' },
  [ErrorCode.NETWORK_SSL_ERROR]: { retryable: false, fatal: false, category: ErrorCategory.NETWORK, userMessage: 'SSL 인증서 오류' },
  [ErrorCode.NETWORK_TOO_MANY_REQUESTS]: { retryable: true, fatal: false, category: ErrorCategory.NETWORK, userMessage: '요청 한도 초과 (429)' },

  // BROWSER — 일부 재시도 가능
  [ErrorCode.BROWSER_CLOSED]: { retryable: false, fatal: true, category: ErrorCategory.BROWSER, userMessage: '브라우저가 종료됨' },
  [ErrorCode.BROWSER_CRASHED]: { retryable: false, fatal: true, category: ErrorCategory.BROWSER, userMessage: '브라우저 비정상 종료' },
  [ErrorCode.BROWSER_TARGET_CLOSED]: { retryable: true, fatal: false, category: ErrorCategory.BROWSER, userMessage: '브라우저 탭이 닫힘' },
  [ErrorCode.BROWSER_CONTEXT_DESTROYED]: { retryable: true, fatal: false, category: ErrorCategory.BROWSER, userMessage: '페이지 컨텍스트 소실' },
  [ErrorCode.BROWSER_FRAME_DETACHED]: { retryable: true, fatal: false, category: ErrorCategory.BROWSER, userMessage: '프레임 분리됨' },
  [ErrorCode.BROWSER_SESSION_CLOSED]: { retryable: false, fatal: true, category: ErrorCategory.BROWSER, userMessage: '브라우저 세션 종료' },
  [ErrorCode.BROWSER_PROTOCOL_ERROR]: { retryable: true, fatal: false, category: ErrorCategory.BROWSER, userMessage: '브라우저 프로토콜 오류' },

  // AUTH — 재시도 불가 (치명적)
  [ErrorCode.AUTH_LOGIN_FAILED]: { retryable: false, fatal: true, category: ErrorCategory.AUTH, userMessage: '로그인 실패' },
  [ErrorCode.AUTH_WRONG_PASSWORD]: { retryable: false, fatal: true, category: ErrorCategory.AUTH, userMessage: '비밀번호 오류' },
  [ErrorCode.AUTH_CAPTCHA_REQUIRED]: { retryable: false, fatal: true, category: ErrorCategory.AUTH, userMessage: '캡차 입력 필요' },
  [ErrorCode.AUTH_ACCOUNT_LOCKED]: { retryable: false, fatal: true, category: ErrorCategory.AUTH, userMessage: '계정 잠김' },
  [ErrorCode.AUTH_SESSION_EXPIRED]: { retryable: true, fatal: false, category: ErrorCategory.AUTH, userMessage: '세션 만료 (재로그인 필요)' },
  [ErrorCode.AUTH_COOKIE_INVALID]: { retryable: true, fatal: false, category: ErrorCategory.AUTH, userMessage: '쿠키 무효 (재로그인 필요)' },

  // EDITOR
  [ErrorCode.EDITOR_NOT_LOADED]: { retryable: true, fatal: false, category: ErrorCategory.EDITOR, userMessage: '에디터 로드 실패' },
  [ErrorCode.EDITOR_FRAME_NOT_FOUND]: { retryable: true, fatal: false, category: ErrorCategory.EDITOR, userMessage: '에디터 프레임 없음' },
  [ErrorCode.EDITOR_SELECTOR_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.EDITOR, userMessage: '에디터 요소 찾기 실패' },
  [ErrorCode.EDITOR_CONTENT_INPUT_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.EDITOR, userMessage: '본문 입력 실패' },
  [ErrorCode.EDITOR_TITLE_INPUT_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.EDITOR, userMessage: '제목 입력 실패' },

  // PUBLISH
  [ErrorCode.PUBLISH_MODAL_NOT_FOUND]: { retryable: true, fatal: false, category: ErrorCategory.PUBLISH, userMessage: '발행 모달 없음' },
  [ErrorCode.PUBLISH_CATEGORY_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.PUBLISH, userMessage: '카테고리 선택 실패' },
  [ErrorCode.PUBLISH_BUTTON_NOT_FOUND]: { retryable: true, fatal: false, category: ErrorCategory.PUBLISH, userMessage: '발행 버튼 없음' },
  [ErrorCode.PUBLISH_CONFIRM_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.PUBLISH, userMessage: '발행 확인 실패' },
  [ErrorCode.PUBLISH_SCHEDULE_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.PUBLISH, userMessage: '예약 발행 설정 실패' },
  [ErrorCode.PUBLISH_DAILY_LIMIT]: { retryable: false, fatal: false, category: ErrorCategory.PUBLISH, userMessage: '일일 발행 한도 초과' },
  [ErrorCode.PUBLISH_HOURLY_LIMIT]: { retryable: false, fatal: false, category: ErrorCategory.PUBLISH, userMessage: '시간당 발행 한도 초과' },
  [ErrorCode.PUBLISH_INTERVAL_TOO_SHORT]: { retryable: false, fatal: false, category: ErrorCategory.PUBLISH, userMessage: '발행 간격이 너무 짧음' },

  // IMAGE
  [ErrorCode.IMAGE_UPLOAD_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.IMAGE, userMessage: '이미지 업로드 실패' },
  [ErrorCode.IMAGE_TOO_LARGE]: { retryable: false, fatal: false, category: ErrorCategory.IMAGE, userMessage: '이미지 용량 초과' },
  [ErrorCode.IMAGE_FORMAT_INVALID]: { retryable: false, fatal: false, category: ErrorCategory.IMAGE, userMessage: '지원하지 않는 이미지 형식' },
  [ErrorCode.IMAGE_DOWNLOAD_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.IMAGE, userMessage: '이미지 다운로드 실패' },
  [ErrorCode.IMAGE_GENERATION_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.IMAGE, userMessage: '이미지 생성 실패' },
  [ErrorCode.IMAGE_CONSISTENCY_LOW]: { retryable: false, fatal: false, category: ErrorCategory.IMAGE, userMessage: '이미지-텍스트 일관성 부족' },

  // CONTENT
  [ErrorCode.CONTENT_GENERATION_FAILED]: { retryable: true, fatal: false, category: ErrorCategory.CONTENT, userMessage: 'AI 콘텐츠 생성 실패' },
  [ErrorCode.CONTENT_API_ERROR]: { retryable: true, fatal: false, category: ErrorCategory.CONTENT, userMessage: 'AI API 호출 오류' },
  [ErrorCode.CONTENT_QUALITY_LOW]: { retryable: false, fatal: false, category: ErrorCategory.CONTENT, userMessage: '콘텐츠 품질 미달' },
  [ErrorCode.CONTENT_PARSE_ERROR]: { retryable: true, fatal: false, category: ErrorCategory.CONTENT, userMessage: 'AI 응답 파싱 실패' },

  // LICENSE
  [ErrorCode.LICENSE_INVALID]: { retryable: false, fatal: true, category: ErrorCategory.LICENSE, userMessage: '유효하지 않은 라이선스' },
  [ErrorCode.LICENSE_EXPIRED]: { retryable: false, fatal: true, category: ErrorCategory.LICENSE, userMessage: '라이선스 만료' },
  [ErrorCode.LICENSE_QUOTA_EXCEEDED]: { retryable: false, fatal: false, category: ErrorCategory.LICENSE, userMessage: '무료 티어 사용량 초과' },
  [ErrorCode.LICENSE_SERVER_ERROR]: { retryable: true, fatal: false, category: ErrorCategory.LICENSE, userMessage: '라이선스 서버 오류' },

  // SYSTEM
  [ErrorCode.SYSTEM_UNKNOWN]: { retryable: false, fatal: false, category: ErrorCategory.SYSTEM, userMessage: '알 수 없는 오류' },
  [ErrorCode.SYSTEM_FILE_IO]: { retryable: true, fatal: false, category: ErrorCategory.SYSTEM, userMessage: '파일 입출력 오류' },
  [ErrorCode.SYSTEM_MEMORY]: { retryable: false, fatal: true, category: ErrorCategory.SYSTEM, userMessage: '메모리 부족' },
};

// ── 조회 함수 ──

export function getErrorProperties(code: ErrorCode): ErrorProperties {
  return ERROR_PROPERTIES[code];
}

export function isRetryableCode(code: ErrorCode): boolean {
  return ERROR_PROPERTIES[code].retryable;
}

export function isFatalCode(code: ErrorCode): boolean {
  return ERROR_PROPERTIES[code].fatal;
}

export function getUserMessage(code: ErrorCode): string {
  return ERROR_PROPERTIES[code].userMessage;
}

export function getCategory(code: ErrorCode): ErrorCategory {
  return ERROR_PROPERTIES[code].category;
}
