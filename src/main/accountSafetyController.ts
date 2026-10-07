import { resolveExpectedBlogId } from '../automation/expectedBlogIdentity.js';
import { getAccountExecutionGuard } from '../automation/accountExecutionGuard.js';
import { getPublicationCommitJournal } from '../automation/publicationCommitJournal.js';

export const ACCOUNT_SAFETY_LABELS: Record<string, string> = {
  LOGIN_REQUIRED: '네이버 로그인 필요', LOGIN_CHALLENGE: '네이버에서 본인확인 필요',
  ACCOUNT_PROTECTED: '보호조치: 계정 작업 중단', NETWORK_WAIT: '연결 또는 화면 확인 필요',
  ACCOUNT_MISMATCH: '선택 계정과 로그인 계정 확인 필요', PUBLISH_OUTCOME_UNKNOWN: '이전 글의 발행 결과 확인 필요',
};
type Account = { id: string; naverId?: string; blogId: string };
type Sessions = {
  setExpectedBlogId(id: string, blogId: string): void;
  openForUser(id: string): Promise<void>;
  resumeAccount(id: string): Promise<boolean>;
  inspectServerSessionState(id: string): Promise<{ status: string }>;
  verifyAccountForUser(id: string): Promise<{ status: string }>;
};
export function createAccountSafetyController(accounts: () => Account[], sessions: Sessions,
  guard = getAccountExecutionGuard(), journal = getPublicationCommitJournal()) {
  const resolve = (accountId: string) => {
    const account = accounts().find(a => a.id === accountId);
    if (!account || !account.naverId?.trim()) throw new Error('계정 관리에서 네이버 아이디를 확인해주세요.');
    const id = account.naverId.trim().toLowerCase();
    sessions.setExpectedBlogId(id, resolveExpectedBlogId(id, [account]));
    return id;
  };
  function status(accountId: string) {
    const id = resolve(accountId);
    if (!guard.getStatus(id).busy && journal.hasUnconfirmed(id) && guard.getStatus(id).code !== 'PUBLISH_OUTCOME_UNKNOWN') guard.pause(id, 'PUBLISH_OUTCOME_UNKNOWN');
    const state = guard.getStatus(id);
    let pendingToken: string | undefined;
    try { if (!state.busy) pendingToken = journal.getPendingToken(id); } catch { /* Storage error remains stopped. */ }
    return { ...state, label: state.storageError ? '상태 저장소 확인 필요' : state.paused ? ACCOUNT_SAFETY_LABELS[state.code!] : '중단 없음 · 로그인은 실행 시 확인', pendingToken };
  }
  async function act(accountId: string, action: 'status' | 'open' | 'resume' | 'confirm', expectedVersion?: number,
    outcome?: 'published' | 'not-published', pendingToken?: string) {
    const id = resolve(accountId);
    if (action === 'status') return { success: true, state: status(accountId) };
    const before = status(accountId);
    if (before.busy) return { success: false, state: before, message: '이 계정의 작업이 끝난 뒤 다시 확인해주세요.' };
    if (action !== 'open' && expectedVersion !== before.version) return { success: false, state: before, message: '계정 상태가 변경되었습니다. 확인 후 다시 눌러주세요.' };
    if (action === 'open') { await sessions.openForUser(id); return { success: true, state: status(accountId), message: '열린 네이버 창에서 직접 로그인·본인확인을 완료해주세요.' }; }
    if (action === 'resume') {
      const success = await sessions.resumeAccount(id);
      return { success, state: status(accountId), message: success ? '확인 완료. 원고를 확인하고 원하는 작업을 다시 실행해주세요.' : '인증 또는 계정 확인이 끝나지 않았습니다. 네이버 글쓰기 화면과 선택 계정을 확인해주세요.' };
    }
    if (action !== 'confirm' || !pendingToken || !['published', 'not-published'].includes(outcome || '')) throw new Error('발행 결과 확인 값이 올바르지 않습니다.');
    if (before.code !== 'PUBLISH_OUTCOME_UNKNOWN' || before.pendingToken !== pendingToken) throw new Error('확인할 발행 기록이 변경되었습니다.');
    const success = await guard.resumeAfterOutcomeConfirmation(id, async () => {
      if ((await sessions.verifyAccountForUser(id)).status !== 'ready') return false;
      journal.confirmPendingOutcome(id, pendingToken, outcome!);
      return true;
    });
    return { success, state: status(accountId), message: success ? '발행 결과를 기록했습니다. 자동으로 다시 발행하지 않습니다.' : '로그인·계정 확인 후 다시 진행해주세요.' };
  }
  return { status, act };
}
