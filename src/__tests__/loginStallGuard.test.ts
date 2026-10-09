import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountExecutionGuard } from '../automation/accountExecutionGuard';

describe('manual authentication stop replaces background login waiting', () => {
  const dirs: string[] = [];
  const guard = () => { const storageDir = mkdtempSync(join(tmpdir(), 'login-stall-')); dirs.push(storageDir); return new AccountExecutionGuard({ storageDir }); };
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  it.each(['LOGIN_REQUIRED', 'LOGIN_CHALLENGE'] as const)('%s immediately rejects work without running its callback', async (code) => {
    const state = guard(); const work = vi.fn(); state.pause('account', code);
    await expect(state.runExclusive('account', work)).rejects.toMatchObject({ code, retryable: false });
    expect(work).not.toHaveBeenCalled();
  });
  it('failed manual verification keeps the account stopped and does not start jobs', async () => {
    const state = guard(); state.pause('account', 'LOGIN_CHALLENGE');
    expect(await state.resume('account', async () => false)).toBe(false);
    expect(state.getStatus('account')).toMatchObject({ paused: true, code: 'LOGIN_CHALLENGE', busy: false });
  });
  it('automatic login path only verifies a session and has no credential typing or navigation', () => {
    const source = readFileSync('src/naverBlogAutomation.ts', 'utf8');
    const login = source.slice(source.indexOf('async loginToNaver('), source.indexOf('async navigateToBlogWrite('));
    expect(login.length).toBeGreaterThan(100);
    expect(login.includes('ensureServerSession(this.options.naverId')).toBe(true);
    expect(login.includes("new AccountExecutionGuardError('LOGIN_REQUIRED'")).toBe(true);
    expect(/\.type\(|\.click\(|\.goto\(|waitForNavigation|naverPassword|LOGIN_TOTAL_TIMEOUT/.test(login)).toBe(false);
  });
});
