/**
 * [2026-10-08 사장님] "직접 누르면 자동 확인" — a semi-auto publish the user pressed counts as pressing
 * "확인 후 재개" first.
 *
 * Before: a stale stop (a transient NETWORK_WAIT from an older build, or an expired login) blocked every
 * later press with "계정 관리에서 상태 확인 후 직접 재개해 주세요", and nothing said which button to use.
 * Now, for a user-pressed run only:
 *   - LOGIN_REQUIRED / NETWORK_WAIT stops are re-checked with the same read-only server check the
 *     resume button uses; a live login clears the stop and the publish continues.
 *   - an expired login brings the account's own Naver window to the front and says exactly what to do.
 *     Credentials are never typed by the app.
 *   - stops that are the user's own decision (challenge, protection, wrong account, unknown publication
 *     outcome) stay stopped, but the message names the exact button instead of the bare stop text.
 * Automatic work (continuous, multi-account, schedulers) never comes here and keeps stopping.
 */
import { AccountExecutionGuardError, type AccountPauseCode } from './accountExecutionGuard.js';

/** Stops a user-pressed run may re-check by itself. */
export const USER_RUN_RESUMABLE_CODES: ReadonlySet<string> = new Set(['LOGIN_REQUIRED', 'NETWORK_WAIT']);

const KEEP = ' 원고는 그대로 있습니다.';
export const LOGIN_WINDOW_MESSAGE = `네이버 로그인 창을 앞으로 띄웠습니다. 그 창에서 직접 로그인(필요하면 본인확인)한 뒤 발행 버튼을 다시 눌러주세요.${KEEP}`;
export const CHALLENGE_WINDOW_MESSAGE = `네이버 창에 본인확인·보호조치 화면이 있습니다. 그 창에서 직접 마친 뒤 계정 관리의 [확인 후 재개]를 눌러주세요.${KEEP}`;
export const MISMATCH_MESSAGE = `선택한 계정과 다른 네이버 계정이 로그인돼 있습니다. 열린 창에서 이 계정으로 다시 로그인한 뒤 계정 관리의 [확인 후 재개]를 눌러주세요.${KEEP}`;
export const OUTCOME_UNKNOWN_MESSAGE = `직전 글이 발행됐는지 확인되지 않았습니다(중복 발행 방지). 네이버 글 목록을 확인한 뒤 계정 관리에서 [발행됨 확인] 또는 [발행 안 됨 확인]을 눌러주세요.${KEEP}`;
export const STATE_CHANGED_MESSAGE = `계정 상태가 방금 바뀌었습니다. 잠시 뒤 발행 버튼을 다시 눌러주세요.${KEEP}`;
export const EDITOR_UNAVAILABLE_MESSAGE = `네이버 글쓰기 화면을 확인하지 못했습니다. 인터넷 연결을 확인하고 잠시 뒤 발행 버튼을 다시 눌러주세요.${KEEP}`;

export interface UserRunVerdict {
  readonly status: string;
  readonly reason?: string;
}

export interface UserRunResumeDeps {
  status(): { readonly paused: boolean; readonly code?: string; readonly busy: boolean };
  hasUnconfirmedPublication(): boolean;
  /** Open (or reuse) this account's browser as a user action — a stopped account may be opened. */
  openSession(): Promise<void>;
  /** guard.resume: clears the stop only when verify() is true and nothing changed meanwhile. */
  resume(verify: () => Promise<boolean>): Promise<boolean>;
  /** The resume button's read-only check (browserSessionManager.verifyAccountForUser). */
  verify(): Promise<UserRunVerdict>;
  /** Bring the account's window forward; on a non-blog page it opens the Naver login page. */
  showLogin(): Promise<void>;
  pause(code: AccountPauseCode): void;
  log(message: string): void;
}

function stopError(code: AccountPauseCode, message: string): AccountExecutionGuardError {
  return new AccountExecutionGuardError(code, message);
}

/** A stop the user decides: never cleared here, but the message names the exact button. */
async function guidanceForManualStop(code: string, deps: UserRunResumeDeps): Promise<AccountExecutionGuardError> {
  if (code === 'LOGIN_CHALLENGE' || code === 'ACCOUNT_PROTECTED') {
    await deps.showLogin().catch(() => undefined);
    return stopError(code, CHALLENGE_WINDOW_MESSAGE);
  }
  if (code === 'ACCOUNT_MISMATCH') {
    await deps.showLogin().catch(() => undefined);
    return stopError('ACCOUNT_MISMATCH', MISMATCH_MESSAGE);
  }
  return stopError('PUBLISH_OUTCOME_UNKNOWN', OUTCOME_UNKNOWN_MESSAGE);
}

async function stopAfterFailedCheck(verdict: UserRunVerdict, fallback: AccountPauseCode, deps: UserRunResumeDeps): Promise<AccountExecutionGuardError> {
  const record = (code: AccountPauseCode) => { try { deps.pause(code); } catch { /* the original stop stays */ } };
  if (verdict.status === 'login-required') {
    await deps.showLogin().catch(() => undefined);
    return stopError('LOGIN_REQUIRED', LOGIN_WINDOW_MESSAGE);
  }
  if (verdict.status === 'challenge' || verdict.status === 'protected') {
    // A challenge or protection screen is the user's decision: record it so the next press does not retry.
    const code: AccountPauseCode = verdict.status === 'challenge' ? 'LOGIN_CHALLENGE' : 'ACCOUNT_PROTECTED';
    record(code);
    return guidanceForManualStop(code, deps);
  }
  if (verdict.reason === 'account-identity-unverified') {
    record('ACCOUNT_MISMATCH');
    return guidanceForManualStop('ACCOUNT_MISMATCH', deps);
  }
  // The check passed but the stop changed meanwhile (another action, a version bump): just retry.
  if (verdict.status === 'ready') return stopError(fallback, STATE_CHANGED_MESSAGE);
  return stopError(fallback, EDITOR_UNAVAILABLE_MESSAGE);
}

/** Before a user-pressed run: clear a resumable stop when the login is live, or explain exactly what to do. */
export async function resumePausedAccountForUserRun(deps: UserRunResumeDeps): Promise<void> {
  const state = deps.status();
  if (!state.paused || state.busy) return;
  const code = String(state.code);
  // An unconfirmed publication must be confirmed by the user (re-publishing could duplicate the post).
  if (deps.hasUnconfirmedPublication()) throw await guidanceForManualStop('PUBLISH_OUTCOME_UNKNOWN', deps);
  if (!USER_RUN_RESUMABLE_CODES.has(code)) throw await guidanceForManualStop(code, deps);
  deps.log(`🔐 이 계정은 이전 실패로 멈춰 있었습니다(${code}). 직접 누른 발행이라 로그인 상태부터 확인합니다 — 비밀번호는 입력하지 않습니다.`);
  await deps.openSession();
  let verdict: UserRunVerdict = { status: 'unknown' };
  const resumed = await deps.resume(async () => {
    verdict = await deps.verify();
    return verdict.status === 'ready';
  });
  if (resumed) {
    deps.log('✅ 로그인 확인 완료 — 멈춤을 풀고 발행을 이어갑니다.');
    return;
  }
  throw await stopAfterFailedCheck(verdict, code as AccountPauseCode, deps);
}

/** A user-pressed run that found the login expired mid-way: show the login window instead of a bare stop. */
export async function explainUserRunStop(error: unknown, deps: Pick<UserRunResumeDeps, 'showLogin'>): Promise<unknown> {
  if (!(error instanceof AccountExecutionGuardError) || error.code !== 'LOGIN_REQUIRED') return error;
  await deps.showLogin().catch(() => undefined);
  const explained = stopError('LOGIN_REQUIRED', LOGIN_WINDOW_MESSAGE);
  (explained as Error & { cause?: unknown }).cause = error;
  return explained;
}
