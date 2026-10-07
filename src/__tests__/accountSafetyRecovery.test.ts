/**
 * Recovery paths for a stopped account (independent review MEDIUM-1/-2 and the run-result guard):
 * - an account stopped at PUBLISH_OUTCOME_UNKNOWN with nothing left to confirm can be resumed by the user;
 * - an unreadable publication record can be reset by an explicit user action, keeping the old file aside;
 * - a run that reports failure after the publish click is never recorded as confirmed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { AccountExecutionGuard } from '../automation/accountExecutionGuard';
import { PublicationCommitJournal } from '../automation/publicationCommitJournal';
import { createAccountSafetyController } from '../main/accountSafetyController';

const roots: string[] = [];
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'account-recovery-')); roots.push(dir);
  const journalDir = join(dir, 'journal');
  const guard = new AccountExecutionGuard({ storageDir: join(dir, 'guard') });
  const journal = new PublicationCommitJournal({ storageDir: journalDir });
  const sessions = { setExpectedBlogId: vi.fn(), openForUser: vi.fn(async () => {}), inspectServerSessionState: vi.fn(async () => ({ status: 'ready' })), verifyAccountForUser: vi.fn(async () => ({ status: 'ready' })), resumeAccount: vi.fn(async (id: string) => guard.resume(id, async () => true)) };
  const controller = createAccountSafetyController(() => [{ id: 'app-id', naverId: 'login-id', blogId: 'login-id' }], sessions, guard, journal);
  return { controller, guard, journal, journalDir, sessions };
}

describe('PUBLISH_OUTCOME_UNKNOWN with nothing left to confirm', () => {
  it('resumes after the user verifies the session (the record was already settled)', async () => {
    const { controller, guard, sessions } = setup();
    guard.pause('login-id', 'PUBLISH_OUTCOME_UNKNOWN');
    const state = controller.status('app-id');
    expect(state.pendingToken).toBeUndefined();
    expect((await controller.act('app-id', 'resume', state.version)).success).toBe(true);
    expect(guard.getStatus('login-id').paused).toBe(false);
    expect(sessions.verifyAccountForUser).toHaveBeenCalledWith('login-id');
  });

  it('still refuses while a publication outcome is pending', async () => {
    const { controller, guard, journal } = setup();
    journal.markSubmitting('login-id', 'job-1');
    const state = controller.status('app-id');
    expect((await controller.act('app-id', 'resume', state.version)).success).toBe(false);
    expect(guard.getStatus('login-id').paused).toBe(true);
  });

  it('still refuses when the session is not ready', async () => {
    const { controller, guard, sessions } = setup();
    guard.pause('login-id', 'PUBLISH_OUTCOME_UNKNOWN');
    sessions.verifyAccountForUser.mockResolvedValueOnce({ status: 'login-required' });
    const state = controller.status('app-id');
    expect((await controller.act('app-id', 'resume', state.version)).success).toBe(false);
    expect(guard.getStatus('login-id').paused).toBe(true);
  });
});

describe('unreadable publication record', () => {
  function corrupt(journalDir: string, journal: PublicationCommitJournal) {
    journal.markSubmitting('login-id', 'job-1');
    const file = readdirSync(journalDir).find(name => name.endsWith('.json'))!;
    writeFileSync(join(journalDir, file), '{broken');
    return file;
  }

  it('shows the reset action, refuses plain resume, and resets only on the explicit action', async () => {
    const { guard, journal, journalDir } = setup();
    const file = corrupt(journalDir, journal);
    const fresh = new PublicationCommitJournal({ storageDir: journalDir });
    const recovery = createAccountSafetyController(() => [{ id: 'app-id', naverId: 'login-id', blogId: 'login-id' }],
      { setExpectedBlogId: vi.fn(), openForUser: vi.fn(async () => {}), inspectServerSessionState: vi.fn(async () => ({ status: 'ready' })), verifyAccountForUser: vi.fn(async () => ({ status: 'ready' })), resumeAccount: vi.fn(async (id: string) => guard.resume(id, async () => true)) },
      guard, fresh);
    const state = recovery.status('app-id');
    expect(state.journalUnreadable).toBe(true);
    expect(state.paused).toBe(true);
    expect(state.label).toContain('발행 기록');
    expect((await recovery.act('app-id', 'resume', state.version)).success).toBe(false);

    const reset = await recovery.act('app-id', 'reset-journal', recovery.status('app-id').version);
    expect(reset.success).toBe(true);
    const names = readdirSync(journalDir);
    expect(names.some(name => name.startsWith(file.replace('.json', '.corrupt-')))).toBe(true);
    expect(names).not.toContain(file);
    expect(fresh.isUnreadable('login-id')).toBe(false);

    const after = recovery.status('app-id');
    expect((await recovery.act('app-id', 'resume', after.version)).success).toBe(true);
    expect(guard.getStatus('login-id').paused).toBe(false);
  });

  it('refuses the reset when the record is readable', async () => {
    const { controller } = setup();
    const state = controller.status('app-id');
    expect(state.journalUnreadable).toBe(false);
    expect((await controller.act('app-id', 'reset-journal', state.version)).success).toBe(false);
  });

  it('an I/O error (lock/permission) is not corruption: nothing is moved and the user is told to retry', async () => {
    const { guard, journal, journalDir } = setup();
    journal.markSubmitting('login-id', 'job-1');
    const file = readdirSync(journalDir).find(name => name.endsWith('.json'))!;
    rmSync(join(journalDir, file));
    fs.mkdirSync(join(journalDir, file)); // reading a directory fails with an I/O error (EISDIR), like a lock
    const locked = new PublicationCommitJournal({ storageDir: journalDir });
    const recovery = createAccountSafetyController(() => [{ id: 'app-id', naverId: 'login-id', blogId: 'login-id' }],
      { setExpectedBlogId: vi.fn(), openForUser: vi.fn(async () => {}), inspectServerSessionState: vi.fn(async () => ({ status: 'ready' })), verifyAccountForUser: vi.fn(async () => ({ status: 'ready' })), resumeAccount: vi.fn(async (id: string) => guard.resume(id, async () => true)) },
      guard, locked);
    const state = recovery.status('app-id');
    expect(state.journalUnreadable).toBe(true);
    const reply = await recovery.act('app-id', 'reset-journal', state.version);
    expect(reply.success).toBe(false);
    expect(reply.message).toContain('잠시 뒤 다시');
    expect(readdirSync(journalDir).some(name => name.includes('.corrupt-'))).toBe(false);
    expect(locked.resetUnreadable('login-id')).toBe('unavailable');
    expect(guard.getStatus('login-id').paused).toBe(true);
  });

  it('a failed write with a valid file keeps the file and only clears the stop', () => {
    const { journal, journalDir } = setup();
    journal.markSubmitting('login-id', 'job-1');
    (journal as unknown as { failed: Set<string> }).failed.add(readdirSync(journalDir)[0].replace('.json', ''));
    expect(journal.isUnreadable('login-id')).toBe(true);
    journal.resetUnreadable('login-id');
    expect(journal.isUnreadable('login-id')).toBe(false);
    expect(journal.hasUnconfirmed('login-id')).toBe(true);
    expect(readdirSync(journalDir).some(name => name.includes('.corrupt-'))).toBe(false);
  });
});

describe('run result after the publish click', () => {
  it('a reported failure with a pending record is an unknown outcome, never confirmed', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'naverBlogAutomation.ts'), 'utf-8');
    expect(source).toMatch(/const result = await work\(\);\s*\/\/[^\n]*\n\s*if \(journal\.hasUnconfirmed\(this\.options\.naverId\) && \(result as \{ success\?: unknown \} \| undefined\)\?\.success === false\) \{\s*throw new AccountExecutionGuardError\('PUBLISH_OUTCOME_UNKNOWN'\);/);
  });

  it('the account card offers the reset only for an unreadable record and asks first', () => {
    const ui = fs.readFileSync(path.resolve(__dirname, '..', 'renderer', 'modules', 'accountSafetyControls.ts'), 'utf-8');
    expect(ui).toContain("add('발행 기록 초기화', 'reset-journal')");
    expect(ui).toContain("b.dataset.action === 'reset-journal' ? Boolean(state?.journalUnreadable)");
    expect(ui).toMatch(/action === 'reset-journal' && !window\.confirm\(/);
    const ipc = fs.readFileSync(path.resolve(__dirname, '..', 'main', 'ipc', 'accountHandlers.ts'), 'utf-8');
    expect(ipc).toContain("['status', 'open', 'resume', 'confirm', 'reset-journal'].includes(action)");
  });
});
