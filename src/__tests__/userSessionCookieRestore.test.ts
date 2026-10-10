/**
 * [2026-10-10] 전수조사 2번 — a browser the user opens (resume check, account window, NETWORK_WAIT auto-recheck) restores the
 * saved login cookies like an automatic run does. Before, a session-cookie account lost NID_AUT when Chrome closed and the
 * user path skipped the file, so [확인 후 재개] after a restart always answered "로그인 필요".
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const guard = vi.hoisted(() => ({
  getStatus: vi.fn(() => ({ paused: true, busy: false, version: 1, code: 'LOGIN_REQUIRED' })),
  assertAllowed: vi.fn(), pause: vi.fn(),
  runUserActionExclusive: vi.fn(async (_id: string, run: () => Promise<void>) => run()),
}));
const persistence = vi.hoisted(() => ({ restoreCookies: vi.fn(async () => true), saveCookies: vi.fn(), keepLoginCookies: vi.fn(async () => 0) }));
const fake = vi.hoisted(() => {
  const page = {
    isClosed: () => false, url: () => 'about:blank',
    setUserAgent: async () => {}, setExtraHTTPHeaders: async () => {}, emulateTimezone: async () => {},
    setViewport: async () => {}, evaluateOnNewDocument: async () => {}, authenticate: async () => {},
    target: () => ({ createCDPSession: async () => { throw new Error('no CDP in tests'); } }),
  };
  const browser = { connected: true, newPage: async () => page, pages: async () => [page], process: () => null, on: () => {} };
  return { page, browser, launch: vi.fn(async () => browser) };
});
vi.mock('puppeteer-extra', () => ({ default: { use: vi.fn(), launch: fake.launch } }));
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: () => ({ enabledEvasions: new Set() }) }));
vi.mock('../session/sessionEventLogger.js', () => ({ emitSessionEvent: vi.fn() }));
vi.mock('../crawler/utils/proxyManager.js', () => ({ getProxyUrl: async () => undefined }));
vi.mock('../automation/chromeExecutablePolicy.js', () => ({ findChromeExecutable: () => null }));
vi.mock('../debug/diagnosticsBuffer.js', () => ({ attachDiagnostics: () => {} }));
vi.mock('../automation/accountExecutionGuard.js', () => ({ getAccountExecutionGuard: () => guard, AccountExecutionGuardError: class extends Error { constructor(public code: string) { super(code); } } }));
vi.mock('../sessionPersistence.js', () => persistence);
import { browserSessionManager } from '../browserSessionManager.js';

const manager = browserSessionManager as any;
const profileRoot = mkdtempSync(join(tmpdir(), 'user-session-restore-'));
afterAll(() => rmSync(profileRoot, { recursive: true, force: true }));

beforeEach(() => {
  vi.clearAllMocks(); manager.sessions.clear();
  vi.spyOn(manager, 'getProfileDir').mockImplementation((...args: unknown[]) => join(profileRoot, String(args[0])));
  vi.spyOn(manager, 'ensurePasswordManagerDisabled').mockResolvedValue(undefined);
  vi.spyOn(manager, 'startKeepalive').mockImplementation(() => {});
});
afterEach(() => { manager.sessions.clear(); vi.restoreAllMocks(); });

describe('a user-opened browser restores the saved login cookies', () => {
  it('ensureSessionForUser (resume / auto-recheck) restores into the new page of a paused account', async () => {
    await manager.ensureSessionForUser('test_account');
    expect(fake.launch).toHaveBeenCalledOnce();
    expect(persistence.restoreCookies).toHaveBeenCalledWith(fake.page, 'test_account');
    // A paused account may still open its window; the pause itself is untouched.
    expect(guard.assertAllowed).not.toHaveBeenCalled();
    expect(guard.pause).not.toHaveBeenCalled();
  });

  it('restored cookies are credentials only: the session is not marked logged in', async () => {
    const session = await manager.getOrCreateSession('test_account', false, undefined, { userInitiated: true });
    expect(persistence.restoreCookies).toHaveBeenCalledOnce();
    expect(session.isLoggedIn).toBe(false);
    expect(session.loginVerifiedAt).toBe(0);
  });

  it('a failed restore still opens the window', async () => {
    persistence.restoreCookies.mockRejectedValueOnce(new Error('file locked'));
    const session = await manager.getOrCreateSession('test_account', false, undefined, { userInitiated: true });
    expect(session.page).toBe(fake.page);
    expect(manager.sessions.get('test_account')).toBe(session);
  });

  it('automatic runs keep restoring as before', async () => {
    await manager.getOrCreateSession('test_account');
    expect(guard.assertAllowed).toHaveBeenCalledWith('test_account');
    expect(persistence.restoreCookies).toHaveBeenCalledWith(fake.page, 'test_account');
  });
});
