import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const guard = vi.hoisted(() => ({ getStatus: vi.fn(() => ({ paused: false, busy: false, version: 0 })), assertAllowed: vi.fn(), pause: vi.fn(), runUserActionExclusive: vi.fn(async (_id: string, run: () => Promise<void>) => run()) }));
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

describe('bounded renderer recovery without destroying the page', () => {
  it('checks the current renderer without navigating or recreating it', async () => {
    const session = setup(); expect(await manager.attemptReconnect('test_account')).toBe(true);
    expect(session.page.evaluate).toHaveBeenCalledTimes(1); expect(session.page.goto).not.toHaveBeenCalled(); expect(session.browser.newPage).not.toHaveBeenCalled();
  });
  it('times out a hung renderer rather than hanging forever', async () => {
    const session = setup(); session.page.evaluate.mockImplementation(() => new Promise(() => {}));
    let completed = false; const pending = manager.attemptReconnect('test_account').then((value: boolean) => { completed = true; return value; });
    await vi.advanceTimersByTimeAsync(20000); expect(completed).toBe(true); expect(await pending).toBe(false);
    expect(session.page.goto).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not trust a response after a newer pause', async () => {
    const session = setup(); session.page.evaluate.mockImplementation(async () => { guard.getStatus.mockReturnValue({ paused: true, busy: false, version: 1 }); return 'complete'; });
    expect(await manager.attemptReconnect('test_account')).toBe(false);
  });
  it('does not trust the renderer of a replaced session', async () => {
    const session = setup(); session.page.evaluate.mockImplementation(async () => { setup(); return 'complete'; });
    expect(await manager.attemptReconnect('test_account')).toBe(false);
  });
  it('performs no renderer request on a paused or closed session', async () => {
    const session = setup(); guard.getStatus.mockReturnValue({ paused: true, busy: false, version: 1 });
    expect(await manager.attemptReconnect('test_account')).toBe(false); expect(session.page.evaluate).not.toHaveBeenCalled();
    guard.getStatus.mockReturnValue({ paused: false, busy: false, version: 2 }); session.page.isClosed.mockReturnValue(true);
    expect(await manager.attemptReconnect('test_account')).toBe(false); expect(session.page.evaluate).not.toHaveBeenCalled();
  });
  it('preserves a ready editor during explicit account verification', async () => {
    const session = setup(); vi.spyOn(manager, 'inspectServerSessionState').mockResolvedValue({ ok: true, status: 'ready', reason: 'editor-ready' });
    expect((await manager.verifyAccountForUser('test_account')).status).toBe('ready');
    expect(session.page.goto).not.toHaveBeenCalled();
  });
  it('opens an existing blog editor by bringing it forward, without losing its draft', async () => {
    const session = setup(); await manager.openForUser('test_account');
    expect(session.page.bringToFront).toHaveBeenCalledOnce(); expect(session.page.goto).not.toHaveBeenCalled();
  });
  it('does not navigate away from a login challenge during verification', async () => {
    const session = setup(); session.page.url.mockReturnValue('https://nid.naver.com/nidlogin.login');
    vi.spyOn(manager, 'inspectServerSessionState').mockResolvedValue({ ok: false, status: 'challenge', reason: 'challenge' });
    expect((await manager.verifyAccountForUser('test_account')).status).toBe('challenge'); expect(session.page.goto).not.toHaveBeenCalled();
  });
});

describe('server inspection deadline', () => {
  it('ends a hung renderer probe and releases the single-flight entry', async () => {
    const session = setup(); session.page.evaluate.mockImplementation(() => new Promise(() => {}));
    const pending = manager.inspectServerSessionState('test_account');
    await vi.advanceTimersByTimeAsync(9000);
    expect(await pending).toMatchObject({ ok: false, status: 'unavailable' });
    expect(manager.serverSessionChecks.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('late positive evidence after timeout never updates the login cache', async () => {
    const session = setup(); session.isLoggedIn = false;
    let finish!: (value: any) => void;
    session.page.evaluate.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = manager.inspectServerSessionState('test_account'); await vi.advanceTimersByTimeAsync(9000);
    expect((await pending).status).toBe('unavailable');
    finish({ finalUrl: 'https://blog.naver.com/GoBlogWrite.naver', status: 200, hasEditor: true, accountIdentity: 'test_account' });
    await Promise.resolve(); expect(session.isLoggedIn).toBe(false);
  });
});

it('explicit resume can open the editor from the home page when cross-origin inspection fails', async () => {
 const session=setup(); session.page.url.mockReturnValue('https://www.naver.com/');
 session.page.goto.mockImplementation(async () => { session.page.url.mockReturnValue('https://blog.naver.com/test_account?Redirect=Write'); });
 const editorFrame = { url: () => session.page.url(), evaluate: vi.fn(async () => 'ready') };
 Object.assign(session.page, { frames: () => [editorFrame] });
 vi.spyOn(manager,'inspectServerSessionState').mockResolvedValueOnce({ok:false,status:'unavailable',reason:'probe-unavailable'}).mockResolvedValueOnce({ok:true,status:'ready',reason:'editor-ready'});
 expect((await manager.verifyAccountForUser('test_account')).status).toBe('ready');
 expect(session.page.goto).toHaveBeenCalledTimes(1);
 expect(editorFrame.evaluate).toHaveBeenCalledOnce();
 expect(vi.getTimerCount()).toBe(0);
});
it('an unavailable editor is preserved for manual review rather than navigated away', async () => {
 const session=setup();vi.spyOn(manager,'inspectServerSessionState').mockResolvedValue({ok:false,status:'unavailable',reason:'probe-unavailable'});
 expect((await manager.verifyAccountForUser('test_account')).status).toBe('unavailable');
 expect(session.page.goto).not.toHaveBeenCalled();
});
