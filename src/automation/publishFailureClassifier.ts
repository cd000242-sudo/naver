export type PublishFailureCode =
  | 'USER_CANCELLED'
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

export function classifyPublishFailure(input: unknown): PublishFailureClassification {
  const message = toMessage(input);

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
