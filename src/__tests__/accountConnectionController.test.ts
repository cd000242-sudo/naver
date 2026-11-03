// The safety controller's connection actions: 'check' (never changes a stop), 'status' carrying connection/savedLogin,
// and 'open' starting the quiet login watch only when the auto-resume watcher does not own the account.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountExecutionGuard } from '../automation/accountExecutionGuard';
import { PublicationCommitJournal } from '../automation/publicationCommitJournal';
import { createAccountSafetyController } from '../main/accountSafetyController';
import { CONNECT_WATCH_INTERVAL_MS, clearConnectionsForTest, isWatchingLoginForConnect, stopLoginConnectWatch } from '../main/accountConnection';
import { stopLoginAutoResumeWatch } from '../main/loginAutoResume';

const roots: string[] = [];
const NAVER = 'zz-connect-test-id';
function setup(verdict: Record<string, unknown> = { status: 'ready', blogId: 'my_blog' }) {
  const dir = mkdtempSync(join(tmpdir(), 'account-connect-')); roots.push(dir);
  const guard = new AccountExecutionGuard({ storageDir: join(dir, 'guard') });
  const journal = new PublicationCommitJournal({ storageDir: join(dir, 'journal') });
  const sessions = {
    setExpectedBlogId: vi.fn(), openForUser: vi.fn(async () => {}), inspectServerSessionState: vi.fn(async () => ({ status: 'ready' })),
    verifyAccountForUser: vi.fn(async () => verdict), ensureSessionForUser: vi.fn(async () => {}), openPostListForUser: vi.fn(async () => {}),
    isWindowOpenForUser: vi.fn(() => true),
    peekLoginWindowForUser: vi.fn(async () => ({ open: true, onLoginPage: false, fingerprint: 'https://www.naver.com/|aaa' })),
  };
  const controller = createAccountSafetyController(() => [{ id: 'app-id', naverId: NAVER, blogId: 'custom-blog' }], sessions, guard, journal);
  return { controller, guard, journal, sessions };
}
beforeEach(() => { clearConnectionsForTest(); });
afterEach(() => {
  stopLoginConnectWatch(); stopLoginAutoResumeWatch(); vi.useRealTimers(); vi.restoreAllMocks();
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("controller 'status'", () => {
  it('carries connection (undefined before any check) and savedLogin, and opens nothing', async () => {
    const { controller, sessions } = setup();
    const reply = await controller.act('app-id', 'status');
    expect(reply.success).toBe(true);
    expect(reply.state).toMatchObject({ paused: false, busy: false, windowOpen: true });
    expect(reply.state).toHaveProperty('savedLogin');
    expect((reply.state as { connection?: unknown }).connection).toBeUndefined();
    expect(sessions.openForUser).not.toHaveBeenCalled();
    expect(sessions.verifyAccountForUser).not.toHaveBeenCalled();
    expect(sessions.ensureSessionForUser).not.toHaveBeenCalled();
  });
});

describe("controller 'check'", () => {
  it('checks once with relearn allowed, records the result, and shows it in the next status', async () => {
    const { controller, sessions } = setup();
    const reply = await controller.act('app-id', 'check');
    expect(reply.success).toBe(true);
    expect(sessions.ensureSessionForUser).toHaveBeenCalledWith(NAVER);
    expect(sessions.verifyAccountForUser).toHaveBeenCalledWith(NAVER, { allowRelearn: true });
    expect(reply.state.connection).toMatchObject({ state: 'connected', blogId: 'my_blog' });
    const status = await controller.act('app-id', 'status');
    expect((status.state as { connection?: { state: string } }).connection?.state).toBe('connected');
  });

  it('needs no state version (it is read-only for the stop state)', async () => {
    const { controller } = setup();
    expect((await controller.act('app-id', 'check', undefined)).success).toBe(true);
  });

  it('refuses while the account is busy and checks nothing', async () => {
    const { controller, guard, sessions } = setup();
    let release = () => {};
    void guard.runUserActionExclusive(NAVER, () => new Promise<void>(resolve => { release = resolve; }));
    expect(guard.getStatus(NAVER).busy).toBe(true);
    const reply = await controller.act('app-id', 'check');
    release();
    expect(reply.success).toBe(false);
    expect(sessions.verifyAccountForUser).not.toHaveBeenCalled();
  });

  it.each([
    ['login-required', { status: 'login-required' }],
    ['challenge', { status: 'challenge' }],
    ['protected', { status: 'protected' }],
  ])('a %s result leaves a running account unpaused and a stopped account stopped', async (_name, verdict) => {
    const free = setup(verdict);
    const before = free.guard.getStatus(NAVER);
    await free.controller.act('app-id', 'check');
    expect(free.guard.getStatus(NAVER)).toEqual(before);
    expect(free.guard.getStatus(NAVER).paused).toBe(false);

    const stopped = setup({ status: 'ready', blogId: 'my_blog' });
    stopped.guard.pause(NAVER, 'LOGIN_REQUIRED');
    const stoppedBefore = stopped.guard.getStatus(NAVER);
    const reply = await stopped.controller.act('app-id', 'check');
    expect(reply.success).toBe(true);
    expect(reply.message).toContain('멈춤');
    expect(stopped.guard.getStatus(NAVER)).toEqual(stoppedBefore);
    expect(stopped.guard.getStatus(NAVER).paused).toBe(true);
  });

  it('a successful connected check does not release a stop (resume stays a separate, explicit action)', async () => {
    const { controller, guard } = setup();
    guard.pause(NAVER, 'ACCOUNT_PROTECTED');
    await controller.act('app-id', 'check');
    expect(guard.getStatus(NAVER).paused).toBe(true);
    expect(guard.getStatus(NAVER).code).toBe('ACCOUNT_PROTECTED');
  });

  it('does not write a pending-publication record or clear one', async () => {
    const { controller, journal } = setup();
    journal.markSubmitting(NAVER, 'job-1');
    await controller.act('app-id', 'check');
    expect(journal.hasUnconfirmed(NAVER)).toBe(true);
  });
});

describe("controller 'open' login watch", () => {
  it('starts the quiet watch for a running account, and it checks after the login page is left', async () => {
    vi.useFakeTimers();
    const { controller, sessions } = setup();
    await controller.act('app-id', 'open');
    expect(sessions.openForUser).toHaveBeenCalledWith(NAVER);
    expect(isWatchingLoginForConnect(NAVER)).toBe(true);
    await vi.advanceTimersByTimeAsync(CONNECT_WATCH_INTERVAL_MS);
    expect(sessions.verifyAccountForUser).toHaveBeenCalledWith(NAVER, { allowRelearn: false });
    expect(isWatchingLoginForConnect(NAVER)).toBe(false);
  });

  it('leaves a LOGIN_REQUIRED stop to the auto-resume watcher (no second watch)', async () => {
    vi.useFakeTimers();
    const { controller, guard } = setup();
    guard.pause(NAVER, 'LOGIN_REQUIRED');
    await controller.act('app-id', 'open');
    expect(isWatchingLoginForConnect(NAVER)).toBe(false);
  });
});
