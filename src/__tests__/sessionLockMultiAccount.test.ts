import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const guard = vi.hoisted(() => ({ getStatus: vi.fn(() => ({ paused: false, busy: false, version: 0 })), assertAllowed: vi.fn(), pause: vi.fn() }));
vi.mock('puppeteer-extra', () => ({ default: { use: vi.fn() } }));
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: () => ({ enabledEvasions: new Set() }) }));
vi.mock('../session/sessionEventLogger.js', () => ({ emitSessionEvent: vi.fn() }));
vi.mock('../automation/accountExecutionGuard.js', () => ({ getAccountExecutionGuard: () => guard, AccountExecutionGuardError: class extends Error { constructor(public code: string) { super(code); } } }));
import { browserSessionManager } from '../browserSessionManager.js';
const manager = browserSessionManager as any;
function setup(id = 'test_account') {
  const page = { evaluate: vi.fn(async () => 'complete'), isClosed: vi.fn(() => false), goto: vi.fn(), bringToFront: vi.fn(), url: vi.fn(() => 'https://blog.naver.com/test_account?Redirect=Write'), waitForFunction: vi.fn() };
  const session = { accountId: id, browser: { connected: true, newPage: vi.fn(), close: vi.fn(async () => {}), process: vi.fn() }, page, isLoggedIn: true, loginVerifiedAt: Date.now(), locked: true, lockedAt: Date.now(), lastActivity: 0, createdAt: Date.now(), publishInProgress: false };
  manager.sessions.set(id, session); return session;
}
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); manager.sessions.clear(); manager.serverSessionChecks.clear(); manager.expectedBlogIds.clear(); manager.stopKeepalive(); guard.getStatus.mockReturnValue({ paused: false, busy: false, version: 0 }); });
afterEach(() => { vi.restoreAllMocks(); manager.stopKeepalive(); vi.useRealTimers(); });

describe('account session ownership and current authentication', () => {
  it('preserves locked browsers unless explicitly forced to close', async () => {
    const session = setup(); expect(await manager.closeSession('test_account')).toBe(false);
    expect(session.browser.close).not.toHaveBeenCalled(); expect(manager.sessions.get('test_account')).toBe(session);
    expect(await manager.closeSession('test_account', true)).toBe(true); expect(session.browser.close).toHaveBeenCalledTimes(1);
    expect(manager.sessions.has('test_account')).toBe(false);
  });
  it('protects a paused authentication page even when it is not locked', async () => {
    const session = setup(); session.locked = false; guard.getStatus.mockReturnValue({ paused: true, busy: false, version: 1 });
    expect(await manager.closeSession('test_account')).toBe(false); expect(session.browser.close).not.toHaveBeenCalled();
  });
  it('only changes lock ownership for the selected account', () => {
    const a = setup('account_a'); const b = setup('account_b'); a.locked = false; b.locked = false;
    manager.lockSession('account_a'); expect(a.locked).toBe(true); expect(b.locked).toBe(false);
    manager.unlockSession('account_a'); expect(a.locked).toBe(false); expect(a.lockedAt).toBe(0);
  });
  it('expired authentication cache is not trusted merely because the profile is locked', () => {
    const session = setup(); session.loginVerifiedAt = Date.now() - 3 * 60 * 60 * 1000;
    expect(manager.isAccountLoggedIn('test_account')).toBe(false); expect(session.locked).toBe(true);
  });
  it('a persisted stop overrides an otherwise recent login cache', () => {
    setup(); guard.getStatus.mockReturnValue({ paused: true, busy: false, version: 1 });
    expect(manager.isAccountLoggedIn('test_account')).toBe(false);
  });
  it('finds an existing mixed-case account without creating a second session', () => {
    const session = setup('Test_Account'); manager.markPublishing('test_account', true);
    expect(session.publishInProgress).toBe(true); expect(manager.sessions.size).toBe(1);
  });
});
