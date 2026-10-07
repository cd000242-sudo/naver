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
  const sessions = { setExpectedBlogId: vi.fn(), openForUser: vi.fn(async () => {}), inspectServerSessionState: vi.fn(async () => ({ status: 'ready' })), verifyAccountForUser: vi.fn(async () => ({ status: 'ready' })), resumeAccount: vi.fn(async (id: string) => guard.resume(id, async () => true)) };
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
    expect(sessions.resumeAccount).not.toHaveBeenCalled(); expect(guard.getStatus('login-id').paused).toBe(true);
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
