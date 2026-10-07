export type PublishFailureCode =
  | 'LOGIN_REQUIRED'
  | 'ACCOUNT_PROTECTED'
  | 'NETWORK_WAIT'
  | 'ACCOUNT_MISMATCH'
  | 'ACCOUNT_BUSY'
  | 'USER_CANCELLED'
  | 'PUBLISH_OUTCOME_UNKNOWN'
  | 'BROWSER_CLOSED'
  | 'LOGIN_CHALLENGE'
  | 'EDITOR_NOT_READY'
  | 'PUBLISH_CONDITION'
  | 'NAVIGATION_TIMEOUT'
  | 'IMAGE_REJECTED'
  | 'UNKNOWN_UI_CHANGE'
  | 'UNKNOWN';

export interface PublishFailureClassification {
  code: PublishFailureCode;
  retryable: boolean;
  userActionRequired: boolean;
}

function toMessage(input: unknown): string {
  if (input instanceof Error) return input.message;
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && 'message' in input) {
    return String((input as { message?: unknown }).message || '');
  }
  return String(input || '');
}

function includesAny(value: string, patterns: readonly string[]): boolean {
  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

const ACCOUNT_STOP_FAILURE_CODES: readonly PublishFailureCode[] = ['LOGIN_REQUIRED', 'LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN'];

/**
 * The failure paused the account (login, challenge, protection, connection, wrong account, unknown publish outcome).
 * Running the next post or account would only repeat it — and spend content generation on a post that cannot publish.
 * Only an explicit code counts (the error's `code`, or "[CODE]" carried through IPC). The text heuristics below
 * would also stop on unrelated messages such as an AI agent's "로그인 필요".
 */
export function requiresAccountStop(input: unknown): boolean {
  const code = input && typeof input === 'object' ? (input as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && ACCOUNT_STOP_FAILURE_CODES.includes(code as PublishFailureCode)) return true;
  const serialized = /\[(LOGIN_REQUIRED|LOGIN_CHALLENGE|ACCOUNT_PROTECTED|NETWORK_WAIT|ACCOUNT_MISMATCH|PUBLISH_OUTCOME_UNKNOWN)\]/.exec(toMessage(input))?.[1];
  return Boolean(serialized);
}

export function classifyPublishFailure(input: unknown): PublishFailureClassification {
  const code = input && typeof input === 'object' ? (input as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && ['LOGIN_REQUIRED', 'LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN', 'ACCOUNT_BUSY'].includes(code)) {
    return { code: code as PublishFailureCode, retryable: false, userActionRequired: code !== 'ACCOUNT_BUSY' };
  }
  const message = toMessage(input);
  const serializedCode = /\[(LOGIN_REQUIRED|LOGIN_CHALLENGE|ACCOUNT_PROTECTED|NETWORK_WAIT|ACCOUNT_MISMATCH|PUBLISH_OUTCOME_UNKNOWN|ACCOUNT_BUSY)\]/.exec(message)?.[1];
  if (serializedCode) return { code: serializedCode as PublishFailureCode, retryable: false, userActionRequired: serializedCode !== 'ACCOUNT_BUSY' };

  if (/보호\s*조치|계정.*보호|비정상적인\s*활동|account.*protect/i.test(message)) return { code: 'ACCOUNT_PROTECTED', retryable: false, userActionRequired: true };

  if (includesAny(message, [
    '[content-quality-v3-publish-handoff]',
    '[content-quality-v3-publication]',
  ])) {
    return { code: 'PUBLISH_CONDITION', retryable: false, userActionRequired: true };
  }

  if (includesAny(message, ['PUBLISH_UNCONFIRMED', 'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN'])) {
    return { code: 'PUBLISH_OUTCOME_UNKNOWN', retryable: false, userActionRequired: true };
  }

  if (includesAny(message, ['취소', 'cancelled', 'canceled', 'user cancelled', 'user canceled'])) {
    return { code: 'USER_CANCELLED', retryable: false, userActionRequired: false };
  }

  if (includesAny(message, ['POST_CONTENT_APPLIED', 'POST_TAIL_INCOMPLETE'])) {
    return { code: 'PUBLISH_CONDITION', retryable: false, userActionRequired: true };
  }

  if (includesAny(message, [
    'target closed',
    'detached frame',
    'protocol error',
    'session closed',
    'browser is closed',
    '브라우저 세션이 종료',
    '세션이 종료',
  ])) {
    return { code: 'BROWSER_CLOSED', retryable: true, userActionRequired: false };
  }

  if (includesAny(message, ['이미지 처리 실패', '이미지 업로드', '이미지 파일', '이미지 용량', '이미지 확장자', 'image_processing_failed', 'image_insertion_failed', 'image_rejected', 'image upload', 'file too large', 'unsupported image', 'image file', 'image size'])) {
    return { code: 'IMAGE_REJECTED', retryable: false, userActionRequired: true };
  }

  if (includesAny(message, ['캡차', '보안인증', '보안 인증', '로그인', '인증이 필요', 'captcha', 'login', 'security verification', 'authentication required', 'auth required'])) {
    return { code: 'LOGIN_CHALLENGE', retryable: false, userActionRequired: true };
  }

  if (includesAny(message, [
    '제목 입력 필드를 찾을 수 없습니다',
    'documenttitle',
    '.se-section-documenttitle',
  ])) {
    return { code: 'EDITOR_NOT_READY', retryable: true, userActionRequired: false };
  }

  if (includesAny(message, ['에디터', '로딩', 'editor', 'mainframe', 'postwriteform', 'goblogwrite', 'smarteditor', 'naverwriteeditor'])) {
    return { code: 'EDITOR_NOT_READY', retryable: true, userActionRequired: false };
  }

  if (includesAny(message, ['본문 조건', '발행 조건', '글자수', '제목', '카테고리', '비활성화', 'publish condition', 'body requirement', 'title requirement', 'category requirement', 'disabled', 'insufficient', 'requirement'])) {
    return { code: 'PUBLISH_CONDITION', retryable: false, userActionRequired: true };
  }

  if (includesAny(message, ['네비게이션', 'URL이 변경', 'URL 변경', '완료되지', '끝나지', 'navigation', 'timeout', 'timed out', 'url did not change', 'no post url', 'no success message'])) {
    return { code: 'NAVIGATION_TIMEOUT', retryable: true, userActionRequired: false };
  }

  if (includesAny(message, ['셀렉터', '버튼을 찾', '찾을 수 없습니다', 'selector', 'ui', 'seonepublishbtn', 'save button', 'confirm button', 'publish button not found'])) {
    return { code: 'UNKNOWN_UI_CHANGE', retryable: true, userActionRequired: false };
  }

  return { code: 'UNKNOWN', retryable: true, userActionRequired: false };
}
