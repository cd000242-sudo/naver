import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountExecutionGuard } from '../automation/accountExecutionGuard';
import { PublicationCommitJournal } from '../automation/publicationCommitJournal';
import { createAccountSafetyController } from '../main/accountSafetyController';
const roots: string[] = [];
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'account-controller-')); roots.push(dir);
  const guard = new AccountExecutionGuard({ storageDir: join(dir, 'guard') });
  const journal = new PublicationCommitJournal({ storageDir: join(dir, 'journal') });
  const sessions = { setExpectedBlogId: vi.fn(), openForUser: vi.fn(async () => {}), inspectServerSessionState: vi.fn(async () => ({ status: 'ready' })), verifyAccountForUser: vi.fn(async () => ({ status: 'ready' })), ensureSessionForUser: vi.fn(async () => {}), openPostListForUser: vi.fn(async () => {}) };
  const controller = createAccountSafetyController(() => [{ id: 'app-id', naverId: 'login-id', blogId: 'custom-blog' }], sessions, guard, journal);
  return { controller, guard, journal, sessions };
}
describe('account safety user actions', () => {
  it('local status never opens a page or returns credentials', () => {
    const { controller, sessions } = setup(); const state = controller.status('app-id');
    expect(state.paused).toBe(false); expect(sessions.openForUser).not.toHaveBeenCalled(); expect(sessions.inspectServerSessionState).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).not.toContain('login-id'); expect(sessions.setExpectedBlogId).toHaveBeenCalledWith('login-id', 'custom-blog');
    expect(() => controller.status('another')).toThrow();
  });
  it('rejects stale resume without inspecting or clearing protection', async () => {
    const { controller, guard, sessions } = setup(); guard.pause('login-id', 'ACCOUNT_PROTECTED');
    expect((await controller.act('app-id', 'resume', 0)).success).toBe(false);
    expect(sessions.verifyAccountForUser).not.toHaveBeenCalled(); expect(sessions.ensureSessionForUser).not.toHaveBeenCalled(); expect(guard.getStatus('login-id').paused).toBe(true);
  });
  it('opening the browser does not release the account stop', async () => {
    const { controller, guard, sessions } = setup(); guard.pause('login-id', 'LOGIN_REQUIRED');
    await controller.act('app-id', 'open'); expect(sessions.openForUser).toHaveBeenCalledWith('login-id'); expect(guard.getStatus('login-id').paused).toBe(true);
  });
  it('pending publication survives ordinary resume and requires explicit result review', async () => {
    const { controller, guard, journal } = setup(); journal.markSubmitting('login-id', 'job-1');
    const state = controller.status('app-id'); expect(state.code).toBe('PUBLISH_OUTCOME_UNKNOWN');
    expect((await controller.act('app-id', 'resume', state.version)).success).toBe(false);
    expect(journal.hasUnconfirmed('login-id')).toBe(true);
    await expect(controller.act('app-id', 'confirm', state.version, 'published', 'stale')).rejects.toThrow();
    expect((await controller.act('app-id', 'confirm', state.version, 'published', state.pendingToken)).success).toBe(true);
    expect(journal.getConfirmed('login-id', 'job-1')).toEqual({ confirmed: true }); expect(guard.getStatus('login-id').paused).toBe(false);
  });
  it('failed account verification preserves the pending publication', async () => {
    const { controller, journal, sessions } = setup(); journal.markSubmitting('login-id', 'job-1');
    sessions.verifyAccountForUser.mockResolvedValue({ status: 'unknown' }); const state = controller.status('app-id');
    expect((await controller.act('app-id', 'confirm', state.version, 'not-published', state.pendingToken)).success).toBe(false);
    expect(journal.hasUnconfirmed('login-id')).toBe(true);
  });
});

it('status polling during an active commit does not stop or expose the pending attempt', async () => {
  const { controller, guard, journal } = setup();
  await guard.runExclusive('login-id', async () => {
    journal.markSubmitting('login-id', 'in-flight');
    const state = controller.status('app-id');
    expect(state.busy).toBe(true); expect(state.paused).toBe(false);
    expect(state.pendingToken).toBeUndefined();
    expect((await controller.act('app-id', 'open')).success).toBe(false);
    journal.markConfirmed('login-id', 'in-flight');
  });
  expect(controller.status('app-id').paused).toBe(false);
});

// [2026-10-11 사장님 승인] 로그인 필요·다른 계정 멈춤은 열린 창에서 로그인이 끝나면 [확인 후 재개] 없이 자동으로 풀린다.
describe('login auto-resume', () => {
  afterEach(async () => { (await import('../main/loginAutoResume')).stopLoginAutoResumeWatch(); vi.useRealTimers(); });

  it('상태에 네이버 창이 열려 있는지 싣는다', () => {
    const { controller, sessions } = setup();
    expect(controller.status('app-id').windowOpen).toBe(false);
    (sessions as any).isWindowOpenForUser = () => true;
    expect(controller.status('app-id').windowOpen).toBe(true);
  });

  it('창이 열린 로그인 필요 멈춤: 상태 확인 때 지켜보기 시작 → 로그인 화면을 벗어나면 자동으로 확인해 푼다(창은 옮기지 않음)', async () => {
    vi.useFakeTimers();
    const { controller, guard, sessions } = setup(); guard.pause('login-id', 'LOGIN_REQUIRED');
    let page = { open: true, onLoginPage: true, fingerprint: 'login|none' };
    Object.assign(sessions as any, { isWindowOpenForUser: () => true, peekLoginWindowForUser: vi.fn(async () => page) });
    const state = (await controller.act('app-id', 'status')).state as any;
    expect(state.autoResumeWatching).toBe(true);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(sessions.verifyAccountForUser).not.toHaveBeenCalled(); // 로그인 화면에서는 아무것도 안 한다
    page = { open: true, onLoginPage: false, fingerprint: 'https://www.naver.com/|new' };
    await vi.advanceTimersByTimeAsync(4_000);
    expect(sessions.verifyAccountForUser).toHaveBeenCalledWith('login-id', { allowRelearn: true });
    expect(guard.getStatus('login-id').paused).toBe(false);
    expect(sessions.openForUser).not.toHaveBeenCalled();
  });

  it('본인확인 멈춤은 창이 열려 있어도 자동으로 풀지 않는다', async () => {
    vi.useFakeTimers();
    const { controller, guard, sessions } = setup(); guard.pause('login-id', 'LOGIN_CHALLENGE');
    Object.assign(sessions as any, { isWindowOpenForUser: () => true, peekLoginWindowForUser: vi.fn(async () => ({ open: true, onLoginPage: false, fingerprint: 'x' })) });
    const state = (await controller.act('app-id', 'status')).state as any;
    expect(state.autoResumeWatching).toBe(false);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(sessions.verifyAccountForUser).not.toHaveBeenCalled();
    expect(guard.getStatus('login-id').paused).toBe(true);
  });
});
