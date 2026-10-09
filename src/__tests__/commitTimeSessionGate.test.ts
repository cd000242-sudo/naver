/**
 * Pre-click session gate: at the last moment before the irreversible publish click only POSITIVE evidence of a
 * problem may stop the run. Missing/unclear evidence (frame detached, page changed, probe timeout, identity not
 * readable) must not pause an account whose session was verified at entry. Entry callers keep their strict gate.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const guard = vi.hoisted(() => ({ assertAllowed: vi.fn(), getStatus: vi.fn(() => ({ paused: false, version: 0 })), pause: vi.fn() }));
vi.mock('puppeteer-extra', () => ({ default: { use: vi.fn() } }));
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: () => ({ enabledEvasions: new Set() }) }));
vi.mock('../sessionPersistence.js', () => ({ saveCookies: vi.fn(async () => {}) }));
vi.mock('../automation/accountExecutionGuard.js', () => ({
  getAccountExecutionGuard: () => guard,
  AccountExecutionGuardError: class extends Error { constructor(public code: string) { super(code); } },
}));
import { browserSessionManager } from '../browserSessionManager.js';
import { isolateBlogIdentity } from './mocks/isolatedBlogIdentity';
import { resolveCommitTimeBlock } from '../automation/serverSessionProbePolicy.js';

const manager = browserSessionManager as any;
const editorUrl = 'https://blog.naver.com/PostWriteForm.naver?blogId=test_account';
const topUrl = 'https://blog.naver.com/test_account?Redirect=Write';

function frame(url = editorUrl, selectors = ['.se-main-container', '.se-documentTitle'], bodyText = '') {
  const f = { url: vi.fn(() => url), evaluate: vi.fn(async (script: string) => runInNewContext(script, {
    document: { querySelector: (selector: string) => selector.split(',').some(part => selectors.includes(part.trim())) ? {} : null, body: { textContent: bodyText } },
    location: { href: f.url() }, URL,
  })) };
  return f;
}
function setup(frames: any[] = [frame()]) {
  const page = { frames: () => frames, url: vi.fn(() => topUrl), isClosed: () => false, evaluate: vi.fn(async () => ({ error: 'cors-fetch-unavailable' })), goto: vi.fn() };
  const session = { accountId: 'test_account', browser: { connected: true }, page, isLoggedIn: true, loginVerifiedAt: Date.now() };
  manager.sessions.set('test_account', session);
  return session;
}
beforeEach(() => {
  manager.sessions.clear(); manager.serverSessionChecks.clear(); manager.expectedBlogIds.clear(); isolateBlogIdentity(manager);
  vi.clearAllMocks(); guard.assertAllowed.mockReset(); guard.getStatus.mockReturnValue({ paused: false, version: 0 });
});
afterEach(() => { vi.useRealTimers(); });

describe('resolveCommitTimeBlock (policy)', () => {
  it.each([
    ['protected', 'ACCOUNT_PROTECTED'], ['challenge', 'LOGIN_CHALLENGE'], ['login-required', 'LOGIN_REQUIRED'],
  ])('%s is positive evidence', (status, code) => {
    expect(resolveCommitTimeBlock({ status: status as any, ok: false, reason: 'x' })).toBe(code);
  });
  it('a confirmed different account is positive evidence, a missing identity is not', () => {
    expect(resolveCommitTimeBlock({ status: 'unknown', ok: false, reason: 'account-identity-unverified', identityMismatch: true })).toBe('ACCOUNT_MISMATCH');
    expect(resolveCommitTimeBlock({ status: 'unknown', ok: false, reason: 'account-identity-unverified' })).toBeUndefined();
  });
  it.each(['unavailable', 'unknown', 'ready'])('%s alone never blocks', status => {
    expect(resolveCommitTimeBlock({ status: status as any, ok: status === 'ready', reason: 'x' })).toBeUndefined();
  });
});

describe('ensureServerSessionForCommit: unclear evidence proceeds', () => {
  const proceeds = async () => {
    const verdict = await manager.ensureServerSessionForCommit('test_account');
    expect(guard.pause).not.toHaveBeenCalled();
    return verdict;
  };
  it('proceeds on a ready session', async () => {
    setup(); expect(await proceeds()).toMatchObject({ ok: true, status: 'ready' });
  });
  it('proceeds when a frame cannot be inspected (frame-unavailable)', async () => {
    const f = frame(); f.evaluate.mockRejectedValue(new Error('detached')); setup([f]);
    expect(await proceeds()).toMatchObject({ ok: false, status: 'unavailable' });
  });
  it('proceeds when the frame navigated while being inspected (frame-changed)', async () => {
    const f = frame(); setup([f]); const original = f.evaluate.getMockImplementation()!;
    f.evaluate.mockImplementation(async (...args: [string]) => { const r = await original(...args); f.url.mockReturnValue('https://blog.naver.com/another?Redirect=Write'); return r; });
    expect((await proceeds()).ok).toBe(false);
  });
  it('proceeds when the top-level page changed (page-changed)', async () => {
    const f = frame(); const session = setup([f]); const original = f.evaluate.getMockImplementation()!;
    f.evaluate.mockImplementation(async (...args: [string]) => { const r = await original(...args); session.page.url.mockReturnValue('https://blog.naver.com/another?Redirect=Write'); return r; });
    expect((await proceeds()).ok).toBe(false);
  });
  it('proceeds when the session object was replaced during the probe (session-changed)', async () => {
    const f = frame(); setup([f]); const original = f.evaluate.getMockImplementation()!;
    f.evaluate.mockImplementation(async (...args: [string]) => { const r = await original(...args); setup(); return r; });
    expect(await proceeds()).toMatchObject({ ok: false, reason: 'session-changed' });
  });
  it('proceeds when the probe itself fails or reports a network error', async () => {
    const session = setup([]); session.page.evaluate.mockResolvedValue({ error: 'probe-unavailable' });
    expect(await proceeds()).toMatchObject({ status: 'unavailable' });
    session.page.evaluate.mockRejectedValue(new Error('cdp closed'));
    manager.serverSessionChecks.clear();
    expect(await proceeds()).toMatchObject({ status: 'unavailable' });
  });
  it('proceeds when the probe times out', async () => {
    vi.useFakeTimers(); const session = setup([]); session.page.evaluate.mockReturnValue(new Promise(() => {}));
    const pending = manager.ensureServerSessionForCommit('test_account');
    await vi.advanceTimersByTimeAsync(9_500);
    expect(await pending).toMatchObject({ status: 'unavailable', reason: 'probe-unavailable' });
    expect(guard.pause).not.toHaveBeenCalled();
  });
  it('proceeds when the editor URL carries no readable account identity', async () => {
    setup([frame('https://blog.naver.com/PostWriteForm.naver')]);
    expect(await proceeds()).toMatchObject({ ok: false, reason: 'account-identity-unverified' });
  });
  it('proceeds when two editor frames disagree (nothing is confirmed)', async () => {
    setup([frame(), frame(editorUrl.replace('test_account', 'other_account'))]);
    expect((await proceeds()).ok).toBe(false);
  });
  it('still honours an existing persistent stop', async () => {
    setup(); guard.assertAllowed.mockImplementationOnce(() => { throw Object.assign(new Error('stopped'), { code: 'ACCOUNT_PROTECTED' }); });
    await expect(manager.ensureServerSessionForCommit('test_account')).rejects.toMatchObject({ code: 'ACCOUNT_PROTECTED' });
  });
});

describe('ensureServerSessionForCommit: positive evidence stops', () => {
  it.each([
    ['protected', 'https://nid.naver.com/user2/protect', 'ACCOUNT_PROTECTED'],
    ['challenge', 'https://nid.naver.com/login/ext/verification', 'LOGIN_CHALLENGE'],
    ['login-required', 'https://nid.naver.com/nidlogin.login', 'LOGIN_REQUIRED'],
  ])('%s in a trusted frame pauses with %s', async (_name, url, code) => {
    setup([frame(), frame(url, [])]);
    await expect(manager.ensureServerSessionForCommit('test_account')).rejects.toMatchObject({ code });
    expect(guard.pause).toHaveBeenCalledWith('test_account', code);
  });
  it('a confirmed different account pauses with ACCOUNT_MISMATCH', async () => {
    manager.setExpectedBlogId('test_account', 'test_account');
    setup([frame(editorUrl.replace('test_account', 'other_account'))]);
    await expect(manager.ensureServerSessionForCommit('test_account')).rejects.toMatchObject({ code: 'ACCOUNT_MISMATCH' });
    expect(guard.pause).toHaveBeenCalledWith('test_account', 'ACCOUNT_MISMATCH');
  });
  it('a configured blog id is compared case-insensitively against the confirmed identity', async () => {
    manager.setExpectedBlogId('test_account', 'My_Blog'); setup([frame('https://blog.naver.com/PostWriteForm.naver?blogId=MY_BLOG')]);
    expect(await manager.ensureServerSessionForCommit('test_account')).toMatchObject({ ok: true });
    expect(guard.pause).not.toHaveBeenCalled();
  });
});

describe('entry gate keeps its strict semantics', () => {
  it('ensureServerSession still pauses on unclear evidence', async () => {
    const f = frame(); f.evaluate.mockRejectedValue(new Error('detached')); setup([f]);
    await expect(manager.ensureServerSession('test_account')).rejects.toMatchObject({ code: 'NETWORK_WAIT' });
    expect(guard.pause).toHaveBeenCalledWith('test_account', 'NETWORK_WAIT');
  });
  it('ensureServerSession still maps both identity reasons to ACCOUNT_MISMATCH', async () => {
    manager.setExpectedBlogId('test_account', 'test_account');
    for (const url of ['https://blog.naver.com/PostWriteForm.naver', editorUrl.replace('test_account', 'other_account')]) {
      manager.serverSessionChecks.clear(); guard.pause.mockClear(); setup([frame(url)]);
      await expect(manager.ensureServerSession('test_account')).rejects.toMatchObject({ code: 'ACCOUNT_MISMATCH' });
      expect(guard.pause).toHaveBeenCalledWith('test_account', 'ACCOUNT_MISMATCH');
    }
  });
});

describe('commit wiring', () => {
  const source = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');
  const commit = source.slice(source.indexOf('const beforeIrreversibleCommit = async'), source.indexOf('// ✅ [2026-02-07 FIX]'));
  it('the pre-click gate uses the commit-time check, never the strict entry gate', () => {
    expect(commit).toContain('await browserSessionManager.ensureServerSessionForCommit(this.options.naverId)');
    expect(commit).not.toMatch(/browserSessionManager\.ensureServerSession\(/);
    expect(commit.indexOf('ensureServerSessionForCommit')).toBeLessThan(commit.indexOf('markSubmitting'));
  });
  it('the three entry callers still use the strict gate', () => {
    expect((source.match(/browserSessionManager\s*\.ensureServerSession\(this\.options\.naverId(?:, (?:\{ deferPause \}|options))?\)/g) || []).length).toBe(3);
  });
});
