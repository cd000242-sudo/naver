import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const guard = vi.hoisted(() => ({ assertAllowed: vi.fn(), getStatus: vi.fn(() => ({ paused: false, busy: false, version: 0 })) }));
vi.mock('puppeteer-extra', () => ({ default: { use: vi.fn() } }));
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: () => ({ enabledEvasions: new Set() }) }));
vi.mock('../automation/accountExecutionGuard.js', () => ({ getAccountExecutionGuard: () => guard, AccountExecutionGuardError: class extends Error { constructor(public code: string) { super(code); } } }));
import { browserSessionManager } from '../browserSessionManager';
const manager = browserSessionManager as any;
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); manager.sessions.clear(); guard.getStatus.mockReturnValue({ paused: false, busy: false, version: 0 }); });
afterEach(() => { manager.stopKeepalive(); vi.useRealTimers(); });
describe('idle session retention without synthetic network requests', () => {
  it('repeated starts do not schedule idle requests', async () => {
    manager.startKeepalive(); manager.startKeepalive(); await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(manager.keepaliveTimer).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([false, true])('never touches a retained page while idle (protected=%s)', async paused => {
    const page = { goto: vi.fn(), evaluate: vi.fn(), isClosed: () => false };
    const session = { page, browser: { connected: true, newPage: vi.fn() }, locked: true };
    manager.sessions.set('account', session); guard.getStatus.mockReturnValue({ paused, busy: false, version: 1 });
    await manager.runKeepalivePing(); await manager.pingSingleSession(session);
    expect(page.goto).not.toHaveBeenCalled(); expect(page.evaluate).not.toHaveBeenCalled(); expect(session.browser.newPage).not.toHaveBeenCalled(); expect(manager.sessions.get('account')).toBe(session);
  });
  it('a protected disconnected account is not reconnected or navigated', async () => {
    const page = { goto: vi.fn(), evaluate: vi.fn() }; manager.sessions.set('account', { page, browser: { connected: false } });
    guard.getStatus.mockReturnValue({ paused: true, busy: false, version: 1 });
    expect(await manager.attemptReconnect('account')).toBe(false); expect(page.goto).not.toHaveBeenCalled(); expect(page.evaluate).not.toHaveBeenCalled();
  });
});
