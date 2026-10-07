/**
 * AutomationError — 구조화된 에러 클래스
 *
 * 문자열 기반 에러 판별을 대체하는 타입 안전한 에러.
 * ErrorCode를 기반으로 retryable/fatal 여부를 자동 판단.
 */

import { ErrorCode, ErrorCategory, getErrorProperties } from './errorCodes';

export class AutomationError extends Error {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly fatal: boolean;
  readonly userActionRequired: boolean;
  readonly userMessage: string;
  readonly context: Record<string, unknown>;
  readonly timestamp: string;

  constructor(
    code: ErrorCode,
    message?: string,
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    const props = getErrorProperties(code);
    const finalMessage = message ?? props.userMessage;

    super(finalMessage);

    this.name = 'AutomationError';
    this.code = code;
    this.category = props.category;
    this.retryable = props.retryable;
    this.fatal = props.fatal;
    this.userActionRequired = ['LOGIN_REQUIRED', 'LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN'].includes(code);
    this.userMessage = props.userMessage;
    this.context = { ...context };
    this.timestamp = new Date().toISOString();

    if (cause) {
      (this as any).cause = cause;
    }

    // V8 스택 트레이스 유지
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AutomationError);
    }
  }

  /**
   * 기존 Error를 AutomationError로 변환 (하위 호환 브리지)
   */
  static fromError(error: Error, fallbackCode: ErrorCode = ErrorCode.SYSTEM_UNKNOWN): AutomationError {
    // 이미 AutomationError면 그대로 반환
    if (error instanceof AutomationError) {
      return error;
    }

    const typedCode = (error as Error & { code?: unknown }).code;
    const code = typeof typedCode === 'string' && Object.values(ErrorCode).includes(typedCode as ErrorCode)
      ? typedCode as ErrorCode : classifyErrorMessage(error.message);
    return new AutomationError(
      code ?? fallbackCode,
      error.message,
      { originalName: error.name },
      error,
    );
  }

  /**
   * JSON 직렬화 (로깅용)
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      userMessage: this.userMessage,
      retryable: this.retryable,
      fatal: this.fatal,
      userActionRequired: this.userActionRequired,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

// ── 메시지 기반 에러 분류 (레거시 호환) ──

const MESSAGE_PATTERNS: ReadonlyArray<readonly [RegExp, ErrorCode]> = [
  [/보호\s*조치|계정.*보호|비정상적인\s*활동|account.*protect/i, ErrorCode.ACCOUNT_PROTECTED],
  // NETWORK
  [/timeout|timed?\s*out/i, ErrorCode.NETWORK_TIMEOUT],
  [/navigation/i, ErrorCode.NETWORK_NAVIGATION_FAILED],
  [/net::/i, ErrorCode.NETWORK_CONNECTION_RESET],
  [/ERR_NAME_NOT_RESOLVED/i, ErrorCode.NETWORK_DNS_FAILED],
  [/ERR_CERT|SSL/i, ErrorCode.NETWORK_SSL_ERROR],
  [/429|too many requests/i, ErrorCode.NETWORK_TOO_MANY_REQUESTS],

  // BROWSER
  [/browser.*(is|has been)\s*closed/i, ErrorCode.BROWSER_CLOSED],
  [/browser.*crash/i, ErrorCode.BROWSER_CRASHED],
  [/target\s*closed/i, ErrorCode.BROWSER_TARGET_CLOSED],
  [/context\s*was\s*destroyed|execution\s*context/i, ErrorCode.BROWSER_CONTEXT_DESTROYED],
  [/frame\s*detached|detached\s*frame/i, ErrorCode.BROWSER_FRAME_DETACHED],
  [/session\s*closed/i, ErrorCode.BROWSER_SESSION_CLOSED],
  [/protocol\s*error/i, ErrorCode.BROWSER_PROTOCOL_ERROR],

  // AUTH
  [/로그인\s*실패/i, ErrorCode.AUTH_LOGIN_FAILED],
  [/잘못된\s*비밀번호|wrong.*password/i, ErrorCode.AUTH_WRONG_PASSWORD],
  [/캡차|captcha/i, ErrorCode.AUTH_CAPTCHA_REQUIRED],
  [/계정.*잠|account.*lock/i, ErrorCode.AUTH_ACCOUNT_LOCKED],
  [/세션\s*만료|session.*expir/i, ErrorCode.AUTH_SESSION_EXPIRED],

  // LICENSE
  [/라이선스.*유효하지|invalid.*license/i, ErrorCode.LICENSE_INVALID],
  [/라이선스.*만료|license.*expir/i, ErrorCode.LICENSE_EXPIRED],
  [/무료.*티어|free.*tier.*quota/i, ErrorCode.LICENSE_QUOTA_EXCEEDED],

  // SYSTEM
  [/ENOMEM|out\s*of\s*memory|heap/i, ErrorCode.SYSTEM_MEMORY],
  [/ENOENT|EACCES|EPERM/i, ErrorCode.SYSTEM_FILE_IO],
];

/**
 * 에러 메시지를 분석하여 ErrorCode를 추론한다.
 * 매칭되는 패턴이 없으면 null 반환.
 */
export function classifyErrorMessage(message: string): ErrorCode | null {
  for (const [pattern, code] of MESSAGE_PATTERNS) {
    if (pattern.test(message)) {
      return code;
    }
  }
  return null;
}
