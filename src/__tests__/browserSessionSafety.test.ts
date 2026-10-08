import { beforeEach, describe, expect, it, vi } from 'vitest';
const guard = vi.hoisted(() => ({ assertAllowed: vi.fn(), getStatus: vi.fn(() => ({ paused: false, version: 0 })), pause: vi.fn(), resume: vi.fn(async (_id: string, check: () => Promise<boolean>) => check()) }));
vi.mock('puppeteer-extra', () => ({ default: { use: vi.fn() } }));
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: () => ({ enabledEvasions: new Set() }) }));
vi.mock('../automation/accountExecutionGuard.js', () => ({ getAccountExecutionGuard: () => guard, AccountExecutionGuardError: class extends Error { constructor(public code: string) { super(code); } } }));
import { browserSessionManager } from '../browserSessionManager.js';
import { isolateBlogIdentity } from './mocks/isolatedBlogIdentity';
const manager = browserSessionManager as any;
function setup(evaluate = vi.fn(async () => ({ finalUrl: 'https://blog.naver.com/GoBlogWrite.naver', status: 200, hasEditor: true, accountIdentity: 'test_account' }))) {
  const page = { evaluate, isClosed: () => false, goto: vi.fn(), bringToFront: vi.fn() };
  const session = { accountId: 'test_account', browser: { connected: true, newPage: vi.fn(), close: vi.fn() }, page, isLoggedIn: false, loginVerifiedAt: 0 };
  manager.sessions.set('test_account', session); return session;
}
beforeEach(() => { manager.sessions.clear(); manager.serverSessionChecks?.clear(); isolateBlogIdentity(manager); manager.expectedBlogIds.clear(); manager.setExpectedBlogId('test_account', 'test_account'); vi.clearAllMocks(); guard.getStatus.mockReturnValue({ paused: false, version: 0 }); });
describe('server session inspection safety', () => {
  it('shares one in-flight probe and verifies the selected account', async () => {
    let finish!: (v: any) => void; const session = setup(vi.fn(() => new Promise(resolve => { finish = resolve; })) as any);
    const a = manager.ensureServerSessionState('test_account'); const b = manager.ensureServerSessionState('test_account');
    finish({ finalUrl: 'https://blog.naver.com/GoBlogWrite.naver', status: 200, hasEditor: true, accountIdentity: 'test_account' });
    expect((await a).status).toBe('ready'); expect((await b).status).toBe('ready'); expect(session.page.evaluate).toHaveBeenCalledTimes(1);
  });
  it('does not mark a replaced session ready', async () => {
    let finish!: (v: any) => void; setup(vi.fn(() => new Promise(resolve => { finish = resolve; })) as any);
    const pending = manager.ensureServerSessionState('test_account'); const replacement = setup();
    finish({ finalUrl: 'https://blog.naver.com/GoBlogWrite.naver', status: 200, hasEditor: true, accountIdentity: 'test_account' });
    expect((await pending).status).toBe('unknown'); expect(replacement.isLoggedIn).toBe(false);
  });
  it('fails closed for missing or different account identity', async () => {
    for (const identity of [undefined, 'another_account']) {
      setup(vi.fn(async () => ({ finalUrl: 'https://blog.naver.com/GoBlogWrite.naver', status: 200, hasEditor: true, accountIdentity: identity })) as any);
      expect((await manager.inspectServerSessionState('test_account')).status).toBe('unknown');
    }
  });
  it('boolean wrapper stops instead of returning false to an automatic login caller', async () => {
    setup(vi.fn(async () => ({ finalUrl: 'https://nid.naver.com/nidlogin.login', status: 200, hasLoginForm: true })) as any);
    await expect(manager.ensureServerSession('test_account')).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
    expect(guard.pause).toHaveBeenCalledWith('test_account', 'LOGIN_REQUIRED');
  });
  it('blocked account does no probe, reconnect or idle network traffic', async () => {
    const session = setup(); guard.getStatus.mockReturnValue({ paused: true, version: 1 });
    guard.assertAllowed.mockImplementationOnce(() => { throw new Error('blocked'); });
    await expect(manager.ensureServerSessionState('test_account')).rejects.toThrow('blocked');
    expect(await manager.attemptReconnect('test_account')).toBe(false);
    await manager.runKeepalivePing(); await manager.pingSingleSession(session);
    expect(session.page.evaluate).not.toHaveBeenCalled(); expect(session.page.goto).not.toHaveBeenCalled(); expect(session.browser.newPage).not.toHaveBeenCalled();
  });
  it('idle keepalive does no network even for ready accounts', async () => {
    const session = setup(); await manager.runKeepalivePing(); await manager.pingSingleSession(session);
    expect(session.page.evaluate).not.toHaveBeenCalled(); expect(session.page.goto).not.toHaveBeenCalled();
  });
});
