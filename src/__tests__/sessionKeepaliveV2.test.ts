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

describe('idle session persistence without background traffic', () => {
  it.each([false, true])('does no network or page recreation for locked=%s', async (locked) => {
    const session = setup(); session.locked = locked;
    manager.startKeepalive(); await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    await manager.runKeepalivePing(); await manager.pingSingleSession(session);
    expect(session.page.evaluate).not.toHaveBeenCalled(); expect(session.page.goto).not.toHaveBeenCalled();
    expect(session.browser.newPage).not.toHaveBeenCalled(); expect(session.browser.close).not.toHaveBeenCalled();
    expect(manager.sessions.get('test_account')).toBe(session); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels a legacy idle timer when keepalive is started', async () => {
    const legacy = vi.fn(); manager.keepaliveTimer = setTimeout(legacy, 100);
    manager.startKeepalive(); await vi.advanceTimersByTimeAsync(1000);
    expect(legacy).not.toHaveBeenCalled(); expect(manager.keepaliveTimer).toBeNull();
  });
  it('does not restore cookies or recreate a closed page while idle', async () => {
    const session = setup(); session.page.isClosed.mockReturnValue(true);
    await manager.pingSingleSession(session); await manager.runKeepalivePing();
    expect(session.browser.newPage).not.toHaveBeenCalled(); expect(session.page.evaluate).not.toHaveBeenCalled();
    expect(manager.sessions.get('test_account')).toBe(session);
  });
  it('cookie restoration does not establish authenticated status', () => {
    const code = readFileSync(new URL('../browserSessionManager.ts', import.meta.url), 'utf8');
    const restored = code.slice(code.indexOf('const restored = await restoreCookies'), code.indexOf('} catch (restoreErr)'));
    expect(restored.includes('sessionInfo.isLoggedIn = true')).toBe(false);
    expect(restored.includes("emitSessionEvent('login'")).toBe(false);
  });
});
