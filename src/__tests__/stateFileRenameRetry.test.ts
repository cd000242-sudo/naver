/**
 * Antivirus/indexer scans can make a Windows rename briefly fail with EPERM/EBUSY/EACCES. The commit journal and the
 * account guard stay fail-closed, but only after a short bounded retry — otherwise markSubmitting blocks a good publish
 * and markConfirmed reports a confirmed publish as unknown.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});
import { renameSync } from 'node:fs';
import { AccountExecutionGuard } from '../automation/accountExecutionGuard';
import { PublicationCommitJournal } from '../automation/publicationCommitJournal';
import { renameWithRetry } from '../automation/safeStateRename';

const { renameSync: realRename } = await vi.importActual<typeof import('node:fs')>('node:fs');
const rename = vi.mocked(renameSync);
const errno = (code: string) => Object.assign(new Error(code), { code });
const roots: string[] = [];
const waits: number[] = [];
const makeDir = () => { const dir = mkdtempSync(join(tmpdir(), 'state-rename-')); roots.push(dir); return dir; };
const failTimes = (n: number, code: string) => {
  let left = n;
  rename.mockImplementation(((from: string, to: string) => { if (left-- > 0) throw errno(code); return realRename(from, to); }) as typeof renameSync);
};
beforeEach(() => {
  rename.mockReset(); rename.mockImplementation(realRename); waits.length = 0;
  vi.spyOn(Atomics, 'wait').mockImplementation(((_a: unknown, _i: unknown, _v: unknown, ms?: number) => { waits.push(ms ?? 0); return 'timed-out'; }) as typeof Atomics.wait);
});
afterEach(() => { vi.restoreAllMocks(); for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const total = () => waits.reduce((a, b) => a + b, 0);

describe('renameWithRetry', () => {
  it.each(['EPERM', 'EBUSY', 'EACCES'])('retries a transient %s and then succeeds', code => {
    let failures = 2; const calls: string[] = []; const slept: number[] = [];
    renameWithRetry('a', 'b', { rename: () => { calls.push('try'); if (failures-- > 0) throw errno(code); }, sleep: ms => slept.push(ms) });
    expect(calls).toHaveLength(3); expect(slept).toHaveLength(2);
  });
  it('gives up after 5 attempts within one second and rethrows the original error', () => {
    const slept: number[] = []; const failure = errno('EPERM'); let calls = 0;
    expect(() => renameWithRetry('a', 'b', { rename: () => { calls++; throw failure; }, sleep: ms => slept.push(ms) })).toThrow(failure);
    expect(calls).toBe(5); expect(slept.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1000);
  });
  it.each(['ENOENT', 'EINVAL', 'EXDEV'])('does not retry %s', code => {
    let calls = 0;
    expect(() => renameWithRetry('a', 'b', { rename: () => { calls++; throw errno(code); }, sleep: () => { throw new Error('must not sleep'); } })).toThrow();
    expect(calls).toBe(1);
  });
  it('does not retry an error without a code', () => {
    let calls = 0;
    expect(() => renameWithRetry('a', 'b', { rename: () => { calls++; throw new Error('plain'); }, sleep: () => {} })).toThrow('plain');
    expect(calls).toBe(1);
  });
  it('waits synchronously through Atomics.wait by default', () => {
    failTimes(1, 'EBUSY'); const dir = makeDir();
    const from = join(dir, 'from.tmp'); const to = join(dir, 'to.json');
    writeFileSync(from, '{}'); renameWithRetry(from, to);
    expect(waits).toHaveLength(1); expect(readdirSync(dir)).toEqual(['to.json']);
  });
});

describe('PublicationCommitJournal under transient rename failures', () => {
  it.each(['EPERM', 'EBUSY', 'EACCES'])('markSubmitting survives two %s failures and persists the pending job', code => {
    const storageDir = makeDir(); failTimes(2, code);
    new PublicationCommitJournal({ storageDir }).markSubmitting('one', 'job');
    expect(new PublicationCommitJournal({ storageDir }).hasUnconfirmed('one')).toBe(true);
    expect(rename).toHaveBeenCalledTimes(3);
  });
  it('markConfirmed survives a transient failure instead of reporting a confirmed publish as unknown', () => {
    const storageDir = makeDir(); const journal = new PublicationCommitJournal({ storageDir });
    journal.markSubmitting('one', 'job'); failTimes(1, 'EPERM');
    journal.markConfirmed('one', 'job', 'https://blog.naver.com/abc/1');
    expect(new PublicationCommitJournal({ storageDir }).getConfirmed('one', 'job')).toEqual({ confirmed: true, url: 'https://blog.naver.com/abc/1' });
  });
  it('stays fail-closed when the rename keeps failing, within one second, leaving no temporary file', () => {
    const storageDir = makeDir(); failTimes(99, 'EPERM'); const journal = new PublicationCommitJournal({ storageDir });
    expect(() => journal.markSubmitting('one', 'job')).toThrow(/PUBLISH_OUTCOME_UNKNOWN/);
    expect(rename).toHaveBeenCalledTimes(5); expect(total()).toBeLessThanOrEqual(1000);
    expect(journal.hasUnconfirmed('one')).toBe(true); expect(readdirSync(storageDir)).toEqual([]);
  });
  it('does not retry a non-transient failure', () => {
    const storageDir = makeDir(); failTimes(99, 'EINVAL');
    expect(() => new PublicationCommitJournal({ storageDir }).markSubmitting('one', 'job')).toThrow(/PUBLISH_OUTCOME_UNKNOWN/);
    expect(rename).toHaveBeenCalledTimes(1); expect(waits).toEqual([]);
  });
});

describe('AccountExecutionGuard under transient rename failures', () => {
  it.each(['EPERM', 'EBUSY', 'EACCES'])('pause survives two %s failures and persists the stop', code => {
    const storageDir = makeDir(); failTimes(2, code);
    new AccountExecutionGuard({ storageDir }).pause('one', 'LOGIN_REQUIRED');
    expect(new AccountExecutionGuard({ storageDir }).getStatus('one')).toMatchObject({ paused: true, code: 'LOGIN_REQUIRED' });
    expect(rename).toHaveBeenCalledTimes(3);
  });
  it('stays fail-closed when the rename keeps failing, within one second', () => {
    const storageDir = makeDir(); failTimes(99, 'EBUSY'); const guard = new AccountExecutionGuard({ storageDir });
    expect(() => guard.pause('one', 'ACCOUNT_PROTECTED')).toThrow(/ACCOUNT_PROTECTED/);
    expect(rename).toHaveBeenCalledTimes(5); expect(total()).toBeLessThanOrEqual(1000);
    expect(guard.getStatus('one')).toMatchObject({ paused: true, storageError: true }); expect(readdirSync(storageDir)).toEqual([]);
  });
  it('resume persists through a transient failure too', async () => {
    const storageDir = makeDir(); const guard = new AccountExecutionGuard({ storageDir }); guard.pause('one', 'LOGIN_REQUIRED');
    failTimes(1, 'EPERM');
    expect(await guard.resume('one', async () => true)).toBe(true);
    expect(new AccountExecutionGuard({ storageDir }).getStatus('one').paused).toBe(false);
  });
});
