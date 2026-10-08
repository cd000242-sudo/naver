/**
 * [2026-10-09] The account-safety controller tells the session manager whether a blog is registered (strict) or only the login
 * ID (learned from the editor), treats [확인 후 재개] / outcome confirmation as user verification that may re-learn, and opens
 * the post list of the blog the editor confirmed instead of the login ID.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountExecutionGuard } from '../automation/accountExecutionGuard';
import { PublicationCommitJournal } from '../automation/publicationCommitJournal';
import { createAccountSafetyController } from '../main/accountSafetyController';

describe('account safety controller', () => {
  const roots: string[] = [];
  afterEach(() => { for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true }); });
  function setup(accounts: Array<{ id: string; naverId?: string; blogId: string }> = [], known?: string) {
    const dir = mkdtempSync(join(tmpdir(), 'blog-identity-controller-')); roots.push(dir);
    const guard = new AccountExecutionGuard({ storageDir: join(dir, 'guard') });
    const journal = new PublicationCommitJournal({ storageDir: join(dir, 'journal') });
    const sessions = {
      setExpectedBlogId: vi.fn(), getKnownBlogId: vi.fn(() => known), openForUser: vi.fn(async () => undefined), ensureSessionForUser: vi.fn(async () => undefined),
      openPostListForUser: vi.fn(async () => undefined), inspectServerSessionState: vi.fn(async () => ({ status: 'ready' })),
      verifyAccountForUser: vi.fn(async (): Promise<Record<string, unknown>> => ({ status: 'ready', blogId: 'leader_248' })),
    };
    return { controller: createAccountSafetyController(() => accounts, sessions, guard, journal), guard, journal, sessions };
  }

  it('tells the session manager whether the blog is configured or only the login ID fallback', () => {
    const fallback = setup(); fallback.controller.status('Main-Id', 'naver-id');
    expect(fallback.sessions.setExpectedBlogId).toHaveBeenCalledWith('main-id', 'main-id', 'fallback');
    const configured = setup([{ id: 'app', naverId: 'login-id', blogId: 'custom-blog' }]); configured.controller.status('login-id', 'naver-id');
    expect(configured.sessions.setExpectedBlogId).toHaveBeenCalledWith('login-id', 'custom-blog');
    const registered = setup([{ id: 'app', naverId: 'login-id', blogId: 'custom-blog' }]); registered.controller.status('app');
    expect(registered.sessions.setExpectedBlogId).toHaveBeenCalledWith('login-id', 'custom-blog');
  });

  it('[확인 후 재개] is a user verification: it may re-learn, and the success text shows the blog', async () => {
    const { controller, guard, sessions } = setup();
    guard.pause('main-id', 'ACCOUNT_MISMATCH');
    const state = controller.status('main-id', 'naver-id');
    const reply = await controller.act('main-id', 'resume', state.version, undefined, undefined, 'naver-id');
    expect(sessions.verifyAccountForUser).toHaveBeenCalledWith('main-id', { allowRelearn: true });
    expect(reply.success).toBe(true);
    expect(reply.message).toContain('leader_248');
  });

  it('the outcome confirmation check is a user verification too', async () => {
    const { controller, journal, sessions } = setup();
    journal.markSubmitting('main-id', 'job-1');
    const state = controller.status('main-id', 'naver-id');
    await controller.act('main-id', 'confirm', state.version, 'published', state.pendingToken, 'naver-id');
    expect(sessions.verifyAccountForUser).toHaveBeenCalledWith('main-id', { allowRelearn: true });
  });

  it('open-posts uses the learned blog when no registered account names one', async () => {
    const { controller, sessions } = setup([], 'leader_248');
    await controller.act('tnqls6550-', 'open-posts', undefined, undefined, undefined, 'naver-id');
    expect(sessions.openPostListForUser).toHaveBeenCalledWith('tnqls6550-', 'leader_248');
  });

  it('open-posts keeps the configured blog over a learned one', async () => {
    const { controller, sessions } = setup([{ id: 'app', naverId: 'login-id', blogId: 'custom-blog' }], 'leader_248');
    await controller.act('login-id', 'open-posts', undefined, undefined, undefined, 'naver-id');
    expect(sessions.openPostListForUser).toHaveBeenCalledWith('login-id', 'custom-blog');
  });
});
