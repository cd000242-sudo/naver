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

describe('publishing status and no idle requests', () => {
  it.each([false, true])('never pings when publishing=%s', async (publishing) => {
    const session = setup(); manager.markPublishing('test_account', publishing);
    expect(session.publishInProgress).toBe(publishing);
    await manager.runKeepalivePing(); await manager.pingSingleSession(session);
    expect(session.page.evaluate).not.toHaveBeenCalled(); expect(session.page.goto).not.toHaveBeenCalled();
  });
  it('marking publishing finished keeps the existing page and clears its flag', () => {
    const session = setup(); manager.markPublishing('test_account', true); manager.markPublishing('test_account', false);
    expect(session.publishInProgress).toBe(false); expect(manager.sessions.get('test_account')).toBe(session);
  });
  it('both automation finally paths clear publishing state', () => {
    const code = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');
    expect(code.includes('markPublishing(this.options.naverId, true)')).toBe(true);
    expect((code.match(/markPublishing\(this\.options\.naverId, false\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
