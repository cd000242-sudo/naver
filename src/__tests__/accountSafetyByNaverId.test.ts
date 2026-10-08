/**
 * The main publish screen uses the typed/saved Naver ID, not a registered account. Its stops (login, challenge,
 * unknown publication outcome, ...) must be clearable from the app, and a resume/confirm must open the account's
 * browser session first (right after an app restart no session exists, so the check used to fail silently).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountExecutionGuard } from '../automation/accountExecutionGuard';
import { PublicationCommitJournal } from '../automation/publicationCommitJournal';
import { createAccountSafetyController } from '../main/accountSafetyController';

const roots: string[] = [];
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

type Verdict = { status: string; reason?: string };
function setup(accounts: Array<{ id: string; naverId?: string; blogId: string }> = []) {
  const dir = mkdtempSync(join(tmpdir(), 'account-by-naver-id-')); roots.push(dir);
  const guard = new AccountExecutionGuard({ storageDir: join(dir, 'guard') });
  const journal = new PublicationCommitJournal({ storageDir: join(dir, 'journal') });
  const calls: string[] = [];
  const sessions = {
    setExpectedBlogId: vi.fn(),
    openForUser: vi.fn(async (_id: string) => { calls.push('open'); }),
    ensureSessionForUser: vi.fn(async (_id: string) => { calls.push('ensure'); }),
    openPostListForUser: vi.fn(async (_id: string, _blogId: string) => { calls.push('open-posts'); }),
    inspectServerSessionState: vi.fn(async () => ({ status: 'ready' })),
    verifyAccountForUser: vi.fn(async (_id: string): Promise<Verdict> => { calls.push('verify'); return { status: 'ready' }; }),
  };
  const controller = createAccountSafetyController(() => accounts, sessions, guard, journal);
  return { controller, guard, journal, sessions, calls };
}

describe('account safety by Naver ID (main publish screen)', () => {
  it('reports status for an unregistered ID and expects its own blog', () => {
    const { controller, sessions } = setup();
    const state = controller.status('Main-Screen-ID ', 'naver-id');
    expect(state.paused).toBe(false);
    expect(sessions.setExpectedBlogId).toHaveBeenCalledWith('main-screen-id', 'main-screen-id');
    expect(JSON.stringify(state)).not.toContain('main-screen-id');
  });

  it('uses the registered account blog id when the typed ID matches a registered Naver ID', () => {
    const { controller, sessions } = setup([{ id: 'app-id', naverId: 'login-id', blogId: 'custom-blog' }]);
    controller.status('login-id', 'naver-id');
    expect(sessions.setExpectedBlogId).toHaveBeenCalledWith('login-id', 'custom-blog');
  });

  it('keeps registered-account lookup as the default and rejects an unknown account id', () => {
    const { controller } = setup();
    expect(() => controller.status('not-registered')).toThrow();
  });

  it.each(['', '   ', 'has space', '한글아이디', 'a'.repeat(101)])('rejects an unusable Naver ID %j', (value) => {
    const { controller } = setup();
    expect(() => controller.status(value, 'naver-id')).toThrow();
  });

  it('clears a LOGIN_REQUIRED stop for an unregistered ID with a versioned resume', async () => {
    const { controller, guard } = setup();
    guard.pause('main-id', 'LOGIN_REQUIRED');
    const state = controller.status('main-id', 'naver-id');
    expect((await controller.act('main-id', 'resume', state.version - 1, undefined, undefined, 'naver-id')).success).toBe(false);
    expect(guard.getStatus('main-id').paused).toBe(true);
    expect((await controller.act('main-id', 'resume', state.version, undefined, undefined, 'naver-id')).success).toBe(true);
    expect(guard.getStatus('main-id').paused).toBe(false);
  });

  it('confirms an unknown publication outcome for an unregistered ID with the pending token', async () => {
    const { controller, guard, journal } = setup();
    journal.markSubmitting('main-id', 'job-1');
    const state = controller.status('main-id', 'naver-id');
    expect(state.code).toBe('PUBLISH_OUTCOME_UNKNOWN');
    expect(state.pendingToken).toBeTruthy();
    await expect(controller.act('main-id', 'confirm', state.version, 'not-published', 'stale', 'naver-id')).rejects.toThrow();
    const reply = await controller.act('main-id', 'confirm', state.version, 'not-published', state.pendingToken, 'naver-id');
    expect(reply.success).toBe(true);
    expect(journal.hasUnconfirmed('main-id')).toBe(false);
    expect(guard.getStatus('main-id').paused).toBe(false);
  });
});

describe('open the account session before verifying', () => {
  it('opens a session before a resume check, never inside the busy check', async () => {
    const { controller, guard, sessions, calls } = setup();
    guard.pause('main-id', 'NETWORK_WAIT');
    const state = controller.status('main-id', 'naver-id');
    const reply = await controller.act('main-id', 'resume', state.version, undefined, undefined, 'naver-id');
    expect(reply.success).toBe(true);
    expect(sessions.ensureSessionForUser).toHaveBeenCalledWith('main-id');
    expect(calls.indexOf('ensure')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('ensure')).toBeLessThan(calls.indexOf('verify'));
  });

  it('opens a session before an outcome confirmation check', async () => {
    const { controller, journal, calls } = setup([{ id: 'app-id', naverId: 'login-id', blogId: 'login-id' }]);
    journal.markSubmitting('login-id', 'job-1');
    const state = controller.status('app-id');
    const reply = await controller.act('app-id', 'confirm', state.version, 'published', state.pendingToken);
    expect(reply.success).toBe(true);
    expect(calls.indexOf('ensure')).toBeLessThan(calls.indexOf('verify'));
  });

  it('opens a session before resuming a settled PUBLISH_OUTCOME_UNKNOWN stop', async () => {
    const { controller, guard, calls } = setup();
    guard.pause('main-id', 'PUBLISH_OUTCOME_UNKNOWN');
    const state = controller.status('main-id', 'naver-id');
    expect((await controller.act('main-id', 'resume', state.version, undefined, undefined, 'naver-id')).success).toBe(true);
    expect(calls.indexOf('ensure')).toBeLessThan(calls.indexOf('verify'));
  });

  it('explains a failed window open and leaves the stop and pending record untouched', async () => {
    const { controller, guard, journal, sessions } = setup();
    journal.markSubmitting('main-id', 'job-1');
    sessions.ensureSessionForUser.mockRejectedValueOnce(new Error('chrome missing'));
    const state = controller.status('main-id', 'naver-id');
    const reply = await controller.act('main-id', 'confirm', state.version, 'published', state.pendingToken, 'naver-id');
    expect(reply.success).toBe(false);
    expect(reply.message).toContain('네이버 창을 열지 못했습니다');
    expect(reply.message).not.toContain('chrome missing');
    expect(sessions.verifyAccountForUser).not.toHaveBeenCalled();
    expect(journal.hasUnconfirmed('main-id')).toBe(true);
    expect(guard.getStatus('main-id').paused).toBe(true);
  });

  it.each([
    [{ status: 'login-required' }, '직접 로그인'],
    [{ status: 'challenge' }, '본인확인'],
    [{ status: 'protected' }, '보호조치'],
    [{ status: 'unknown', reason: 'account-identity-unverified' }, '다른 네이버 계정'],
    [{ status: 'unknown', reason: 'session-unavailable' }, '네이버 창을 열지 못했습니다'],
    [{ status: 'unavailable', reason: 'editor-unavailable' }, '글쓰기 화면'],
  ] as Array<[Verdict, string]>)('names the next step when the check returns %j', async (verdict, text) => {
    const { controller, guard, sessions } = setup();
    guard.pause('main-id', 'LOGIN_REQUIRED');
    sessions.verifyAccountForUser.mockResolvedValue(verdict);
    const state = controller.status('main-id', 'naver-id');
    const reply = await controller.act('main-id', 'resume', state.version, undefined, undefined, 'naver-id');
    expect(reply.success).toBe(false);
    expect(reply.message).toContain(text);
    expect(guard.getStatus('main-id').paused).toBe(true);
  });

  it('brings the Naver window forward when the user must log in or finish verification', async () => {
    const { controller, guard, sessions } = setup();
    guard.pause('main-id', 'LOGIN_REQUIRED');
    sessions.verifyAccountForUser.mockResolvedValue({ status: 'login-required' });
    const state = controller.status('main-id', 'naver-id');
    await controller.act('main-id', 'resume', state.version, undefined, undefined, 'naver-id');
    expect(sessions.openForUser).toHaveBeenCalledWith('main-id');
  });
});

describe('open the Naver post list in the account session', () => {
  it('opens the blog post list for the resolved blog id without clearing the stop', async () => {
    const { controller, guard, sessions } = setup([{ id: 'app-id', naverId: 'login-id', blogId: 'custom-blog' }]);
    guard.pause('login-id', 'PUBLISH_OUTCOME_UNKNOWN');
    const reply = await controller.act('login-id', 'open-posts', undefined, undefined, undefined, 'naver-id');
    expect(reply.success).toBe(true);
    expect(sessions.openPostListForUser).toHaveBeenCalledWith('login-id', 'custom-blog');
    expect(guard.getStatus('login-id').paused).toBe(true);
  });

  it('explains a failure to open the list', async () => {
    const { controller, sessions } = setup();
    sessions.openPostListForUser.mockRejectedValueOnce(new Error('boom'));
    const reply = await controller.act('main-id', 'open-posts', undefined, undefined, undefined, 'naver-id');
    expect(reply.success).toBe(false);
    expect(reply.message).toContain('네이버 창을 열지 못했습니다');
  });

  it('refuses while the account is busy', async () => {
    const { controller, guard, sessions } = setup();
    await guard.runExclusive('main-id', async () => {
      expect((await controller.act('main-id', 'open-posts', undefined, undefined, undefined, 'naver-id')).success).toBe(false);
    });
    expect(sessions.openPostListForUser).not.toHaveBeenCalled();
  });
});
