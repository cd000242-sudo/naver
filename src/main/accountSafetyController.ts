import { resolveExpectedBlogId } from '../automation/expectedBlogIdentity.js';
import { getAccountExecutionGuard } from '../automation/accountExecutionGuard.js';
import { getPublicationCommitJournal } from '../automation/publicationCommitJournal.js';

export const ACCOUNT_SAFETY_LABELS: Record<string, string> = {
  LOGIN_REQUIRED: '네이버 로그인 필요', LOGIN_CHALLENGE: '네이버에서 본인확인 필요',
  ACCOUNT_PROTECTED: '보호조치: 계정 작업 중단', NETWORK_WAIT: '연결 또는 화면 확인 필요',
  ACCOUNT_MISMATCH: '선택 계정과 로그인 계정 확인 필요', PUBLISH_OUTCOME_UNKNOWN: '이전 글의 발행 결과 확인 필요',
};
/** 'account' = a registered account id (account panels); 'naver-id' = the Naver ID typed/saved on the main publish screen. */
export type SafetyLookup = 'account' | 'naver-id';
export type SafetyAction = 'status' | 'open' | 'open-posts' | 'resume' | 'confirm' | 'reset-journal';
type Account = { id: string; naverId?: string; blogId: string };
type Verdict = { status: string; reason?: string };
type Sessions = {
  setExpectedBlogId(id: string, blogId: string): void;
  openForUser(id: string): Promise<void>;
  /** Make sure this account's browser exists (no navigation, no login) so a check has a window to look at. */
  ensureSessionForUser(id: string): Promise<void>;
  /** Open the blog's post list in a tab of this account's own browser. */
  openPostListForUser(id: string, blogId: string): Promise<void>;
  inspectServerSessionState(id: string): Promise<{ status: string }>;
  verifyAccountForUser(id: string): Promise<Verdict>;
};
const OPEN_FAILED = '네이버 창을 열지 못했습니다. 크롬이 설치돼 있는지, 같은 계정의 다른 작업이 끝났는지 확인한 뒤 다시 눌러주세요.';
const PENDING_FIRST = '직전 글의 발행 결과를 먼저 확인해주세요. 네이버 글 목록을 본 뒤 [발행됨 확인] 또는 [발행 안 됨 확인]을 눌러야 합니다.';
const JOURNAL_FIRST = '발행 기록 파일을 읽을 수 없습니다. 네이버 글 목록에서 마지막 글의 발행 여부를 확인한 뒤 [발행 기록 초기화]를 눌러주세요.';
const STATE_CHANGED = '계정 상태가 방금 바뀌었습니다. 상태를 다시 확인한 뒤 눌러주세요.';
/** Windows the user must act in: bring them forward after a failed check. */
const needsWindow = (v?: Verdict) => ['login-required', 'challenge', 'protected'].includes(String(v?.status)) || v?.reason === 'account-identity-unverified';
function explainVerdict(verdict?: Verdict): string {
  if (verdict?.status === 'login-required') return '네이버 로그인이 아직 되어 있지 않습니다. 열린 네이버 창에서 직접 로그인한 뒤 다시 눌러주세요(비밀번호는 앱이 입력하지 않습니다).';
  if (verdict?.status === 'challenge') return '네이버 창에 본인확인 화면이 있습니다. 그 창에서 직접 마친 뒤 다시 눌러주세요.';
  if (verdict?.status === 'protected') return '네이버에서 보호조치 안내가 나왔습니다. 열린 네이버 창의 안내에 따라 해제한 뒤 다시 눌러주세요.';
  if (verdict?.reason === 'account-identity-unverified') return '선택한 계정과 다른 네이버 계정이 로그인돼 있을 수 있습니다. 열린 네이버 창에서 이 계정으로 로그인했는지 확인한 뒤 다시 눌러주세요.';
  if (verdict?.reason === 'session-unavailable') return OPEN_FAILED;
  if (verdict?.status === 'ready') return STATE_CHANGED;
  return '인증 또는 계정 확인이 끝나지 않았습니다. 네이버 글쓰기 화면과 선택 계정을 확인해주세요.';
}
export function createAccountSafetyController(accounts: () => Account[], sessions: Sessions,
  guard = getAccountExecutionGuard(), journal = getPublicationCommitJournal()) {
  const resolve = (key: string, lookup: SafetyLookup = 'account'): { id: string; blogId: string } => {
    let id: string; let blogId: string;
    if (lookup === 'naver-id') {
      id = typeof key === 'string' ? key.trim().toLowerCase() : '';
      if (!id || id.length > 100) throw new Error('네이버 아이디를 확인해주세요.');
      // Same rule the publish engine uses (main.ts getExpectedBlogId): a registered account with this Naver ID names the blog.
      blogId = resolveExpectedBlogId(id, accounts());
    } else {
      const account = accounts().find(a => a.id === key);
      if (!account || !account.naverId?.trim()) throw new Error('계정 관리에서 네이버 아이디를 확인해주세요.');
      id = account.naverId.trim().toLowerCase();
      blogId = resolveExpectedBlogId(id, [account]);
    }
    sessions.setExpectedBlogId(id, blogId);
    return { id, blogId };
  };
  function status(key: string, lookup: SafetyLookup = 'account') {
    const { id } = resolve(key, lookup);
    if (!guard.getStatus(id).busy && journal.hasUnconfirmed(id) && guard.getStatus(id).code !== 'PUBLISH_OUTCOME_UNKNOWN') guard.pause(id, 'PUBLISH_OUTCOME_UNKNOWN');
    const state = guard.getStatus(id);
    let pendingToken: string | undefined;
    try { if (!state.busy) pendingToken = journal.getPendingToken(id); } catch { /* Storage error remains stopped. */ }
    const journalUnreadable = !state.busy && journal.isUnreadable(id);
    const label = journalUnreadable ? '발행 기록 파일 확인 필요: 네이버 글 목록을 확인한 뒤 발행 기록 초기화'
      : state.storageError ? '상태 저장소 확인 필요' : state.paused ? ACCOUNT_SAFETY_LABELS[state.code!] : '중단 없음 · 로그인은 실행 시 확인';
    return { ...state, label, pendingToken, journalUnreadable };
  }
  /** PUBLISH_OUTCOME_UNKNOWN with nothing left to confirm (already confirmed, or the record was reset). */
  const outcomeSettled = (id: string, code?: string) => code === 'PUBLISH_OUTCOME_UNKNOWN' && !journal.isUnreadable(id) && !journal.hasUnconfirmed(id);
  /** The check needs a browser to look at; open it first. It must happen before guard.resume*, which holds the account busy. */
  const ensureSession = async (id: string): Promise<boolean> => { try { await sessions.ensureSessionForUser(id); return true; } catch { return false; } };
  async function act(key: string, action: SafetyAction, expectedVersion?: number,
    outcome?: 'published' | 'not-published', pendingToken?: string, lookup: SafetyLookup = 'account') {
    const { id, blogId } = resolve(key, lookup);
    if (action === 'status') return { success: true, state: status(key, lookup) };
    const before = status(key, lookup);
    if (before.busy) return { success: false, state: before, message: '이 계정의 작업이 끝난 뒤 다시 확인해주세요.' };
    const readOnly = action === 'open' || action === 'open-posts';
    if (!readOnly && expectedVersion !== before.version) return { success: false, state: before, message: '계정 상태가 변경되었습니다. 확인 후 다시 눌러주세요.' };
    if (action === 'open') { await sessions.openForUser(id); return { success: true, state: status(key, lookup), message: '열린 네이버 창에서 직접 로그인·본인확인을 완료해주세요.' }; }
    if (action === 'open-posts') {
      try { await sessions.openPostListForUser(id, blogId); } catch { return { success: false, state: status(key, lookup), message: OPEN_FAILED }; }
      return { success: true, state: status(key, lookup), message: '네이버 글 목록을 열었습니다. 방금 글이 올라갔는지(예약 발행이면 예약 목록도) 확인한 뒤 알려주세요.' };
    }
    if (action === 'reset-journal') {
      if (!before.journalUnreadable) return { success: false, state: before, message: '초기화할 발행 기록 문제가 없습니다.' };
      const reset = journal.resetUnreadable(id);
      if (reset === 'unavailable') return { success: false, state: status(key, lookup), message: '발행 기록 파일을 지금 읽거나 옮길 수 없습니다(백신·권한 잠금 가능). 잠시 뒤 다시 눌러주세요. 파일은 그대로 두었습니다.' };
      return { success: true, state: status(key, lookup), message: reset === 'reset'
        ? '손상된 발행 기록을 옆에 보관하고 새로 시작했습니다. 확인 후 재개를 눌러주세요.'
        : '발행 기록 파일은 정상이라 그대로 두었습니다. 상태를 다시 확인해주세요.' };
    }
    let verdict: Verdict | undefined;
    const finish = async (success: boolean, ok: string) => {
      if (!success && needsWindow(verdict)) await sessions.openForUser(id).catch(() => undefined);
      return { success, state: status(key, lookup), message: success ? ok : explainVerdict(verdict) };
    };
    if (action === 'resume') {
      // A pending record can only be cleared by confirming its outcome: do not open a window for a certain refusal.
      if (before.journalUnreadable) return { success: false, state: before, message: JOURNAL_FIRST };
      if (before.pendingToken) return { success: false, state: before, message: PENDING_FIRST };
      if (!(await ensureSession(id))) return { success: false, state: status(key, lookup), message: OPEN_FAILED };
      // Re-checked after the session probe: a pending record written meanwhile keeps the account stopped.
      const verifyReady = async () => { verdict = await sessions.verifyAccountForUser(id); return verdict.status === 'ready' && !journal.hasUnconfirmed(id); };
      const success = outcomeSettled(id, before.code) ? await guard.resumeAfterOutcomeConfirmation(id, verifyReady) : await guard.resume(id, verifyReady);
      return finish(success, '확인 완료. 원고를 확인하고 원하는 작업을 다시 실행해주세요.');
    }
    if (action !== 'confirm' || !pendingToken || !['published', 'not-published'].includes(outcome || '')) throw new Error('발행 결과 확인 값이 올바르지 않습니다.');
    if (before.code !== 'PUBLISH_OUTCOME_UNKNOWN' || before.pendingToken !== pendingToken) throw new Error('확인할 발행 기록이 변경되었습니다.');
    if (!(await ensureSession(id))) return { success: false, state: status(key, lookup), message: OPEN_FAILED };
    const success = await guard.resumeAfterOutcomeConfirmation(id, async () => {
      verdict = await sessions.verifyAccountForUser(id);
      if (verdict.status !== 'ready') return false;
      journal.confirmPendingOutcome(id, pendingToken, outcome!);
      return true;
    });
    return finish(success, '발행 결과를 기록했습니다. 자동으로 다시 발행하지 않습니다.');
  }
  return { status, act };
}
