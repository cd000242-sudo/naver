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

const ACCOUNT_STOP_FAILURE_CODES = ['LOGIN_REQUIRED', 'LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN'] as const;
export type AccountStopCode = typeof ACCOUNT_STOP_FAILURE_CODES[number];
/** A challenge or protection notice on one account says the PC/IP itself is flagged: nothing else may run on it. */
const ALL_ACCOUNT_STOP_CODES: readonly AccountStopCode[] = ['LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED'];

/**
 * The explicit account-stop code carried by an error/result (its `code`, or "[CODE]" carried through IPC).
 * Text heuristics are deliberately not used: they would also stop on unrelated messages such as an AI agent's "로그인 필요".
 */
export function extractAccountStopCode(input: unknown): AccountStopCode | undefined {
  const code = input && typeof input === 'object' ? (input as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && (ACCOUNT_STOP_FAILURE_CODES as readonly string[]).includes(code)) return code as AccountStopCode;
  return /\[(LOGIN_REQUIRED|LOGIN_CHALLENGE|ACCOUNT_PROTECTED|NETWORK_WAIT|ACCOUNT_MISMATCH|PUBLISH_OUTCOME_UNKNOWN)\]/.exec(toMessage(input))?.[1] as AccountStopCode | undefined;
}

/**
 * The failure paused the account (login, challenge, protection, connection, wrong account, unknown publish outcome).
 * Running the next post or account would only repeat it — and spend content generation on a post that cannot publish.
 */
export function requiresAccountStop(input: unknown): boolean {
  return extractAccountStopCode(input) !== undefined;
}

/** The stop must also halt every other account/queue on this PC (challenge or protection), not just this account. */
export function stopsAllAccounts(input: unknown): boolean {
  const code = extractAccountStopCode(input);
  return code !== undefined && ALL_ACCOUNT_STOP_CODES.includes(code);
}

const ACCOUNT_STOP_REASONS: Record<AccountStopCode, string> = {
  LOGIN_REQUIRED: '네이버 로그인이 필요합니다',
  LOGIN_CHALLENGE: '네이버가 본인확인(보안 인증)을 요구합니다',
  ACCOUNT_PROTECTED: '네이버 보호조치가 감지되었습니다',
  NETWORK_WAIT: '연결 또는 글쓰기 화면 확인이 필요합니다',
  ACCOUNT_MISMATCH: '선택한 계정과 로그인된 계정이 다릅니다',
  PUBLISH_OUTCOME_UNKNOWN: '이전 글의 발행 결과 확인이 필요합니다',
};

/** One Korean line that names the account and the reason; keeps "[CODE]" so the text alone still reads as a stop. */
export function describeAccountStop(code: AccountStopCode, accountId?: string): string {
  const who = accountId && accountId.trim() ? `네이버 계정 "${accountId.trim()}"` : '네이버 계정';
  return `[${code}] ${who} 작업이 중단되었습니다 — ${ACCOUNT_STOP_REASONS[code]}. 계정 관리에서 확인한 뒤 [확인 후 재개]를 눌러 주세요.`;
}

type AccountSafetyApi = (accountId: string, action: string) => Promise<unknown>;
export interface PausedQueueAccount { accountId: string; accountName: string; code: AccountStopCode; label: string }

/**
 * Whether main has this account stopped right now (account:safety 'status'). null when it is not stopped or cannot be
 * read: main still refuses a paused account at admission, so an unreadable state must not block the queue.
 */
export async function readAccountPause(
  accountSafety: AccountSafetyApi | undefined,
  accountId: string,
): Promise<{ code: AccountStopCode; label: string } | null> {
  if (typeof accountSafety !== 'function') return null;
  try {
    const reply = await accountSafety(accountId, 'status') as { success?: boolean; state?: { paused?: boolean; code?: string; label?: string; journalUnreadable?: boolean } } | undefined;
    const state = reply?.success === true ? reply.state : undefined;
    if (!state) return null;
    // An unreadable publication record stops the next run exactly like an unconfirmed publication.
    const code = extractAccountStopCode({ code: state.paused ? state.code : (state.journalUnreadable ? 'PUBLISH_OUTCOME_UNKNOWN' : undefined) });
    return code ? { code, label: String(state.label || ACCOUNT_STOP_REASONS[code]) } : null;
  } catch {
    return null;
  }
}

/** Every distinct queued account that is stopped right now, in queue order. */
export async function findPausedQueueAccounts(
  accountSafety: AccountSafetyApi | undefined,
  items: ReadonlyArray<{ accountId: string; accountName?: string }>,
): Promise<PausedQueueAccount[]> {
  const found: PausedQueueAccount[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item?.accountId || seen.has(item.accountId)) continue;
    seen.add(item.accountId);
    const pause = await readAccountPause(accountSafety, item.accountId);
    if (pause) found.push({ accountId: item.accountId, accountName: item.accountName || item.accountId, ...pause });
  }
  return found;
}

/** What the renderer remembers about the last failed publish call (the flow error itself is swallowed upstream). */
export interface PublishFailureReport {
  code: string;
  message: string;
  /** Main refused the job at admission: no browser opened, nothing reached Naver. */
  refusedBeforeStart: boolean;
  accountId?: string;
}

/**
 * @param firstAttempt false for a rerun after an earlier attempt of the same post was dispatched: a refusal of the
 *   rerun must not turn the earlier, possibly published, attempt into "not started".
 */
export function buildPublishFailureReport(
  input: { message?: unknown; failureCode?: unknown; refusedBeforeStart?: unknown },
  accountId: string | undefined,
  firstAttempt: boolean,
): PublishFailureReport {
  const message = String(input?.message || '').trim() || '블로그 발행 실패';
  const explicit = typeof input?.failureCode === 'string' ? input.failureCode : '';
  const code = extractAccountStopCode({ code: explicit, message }) || explicit || 'UNKNOWN';
  return { code, message, refusedBeforeStart: firstAttempt && input?.refusedBeforeStart === true, ...(accountId ? { accountId } : {}) };
}

/** The error the continuous queue throws when a publish was not confirmed; carries the code the queue acts on. */
export function createQueuePublishError(failure: PublishFailureReport | null | undefined): Error {
  const stopCode = extractAccountStopCode(failure);
  const error = new Error(stopCode
    ? describeAccountStop(stopCode, failure?.accountId)
    : '발행 완료가 확인되지 않았습니다 (발행 결과 미확인). 작성중/임시저장/블로그홈 상태를 완료로 처리하지 않습니다.');
  if (failure?.code) Object.assign(error, { code: failure.code, refusedBeforeStart: failure.refusedBeforeStart === true });
  return error;
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

  // Some images may already be inserted: a nested transport error must not replay the whole post.
  if (code === 'IMAGE_INSERTION_FAILED' || includesAny(message, ['IMAGE_INSERTION_FAILED'])) {
    return { code: 'IMAGE_REJECTED', retryable: false, userActionRequired: true };
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
