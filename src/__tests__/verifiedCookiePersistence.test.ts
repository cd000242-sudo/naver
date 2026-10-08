/**
 * Login continuity after an app restart: cookies.json is written only when the server has just confirmed the
 * expected account (automatic check or the user's "재개"). Nothing else writes it any more, so without this the
 * file froze and a restart restored stale cookies, then stopped the account at LOGIN_REQUIRED.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const guard = vi.hoisted(() => ({ assertAllowed: vi.fn(), getStatus: vi.fn(() => ({ paused: false, version: 0 })), pause: vi.fn(), resume: vi.fn(async (_id: string, check: () => Promise<boolean>) => check()) }));
const persistence = vi.hoisted(() => ({ saveCookies: vi.fn(async () => undefined), restoreCookies: vi.fn(async () => false) }));
vi.mock('puppeteer-extra', () => ({ default: { use: vi.fn() } }));
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: () => ({ enabledEvasions: new Set() }) }));
vi.mock('../automation/accountExecutionGuard.js', () => ({ getAccountExecutionGuard: () => guard, AccountExecutionGuardError: class extends Error { constructor(public code: string) { super(code); } } }));
vi.mock('../sessionPersistence.js', () => persistence);
import { browserSessionManager } from '../browserSessionManager.js';
import { isolateBlogIdentity } from './mocks/isolatedBlogIdentity';

const manager = browserSessionManager as any;

function setup(probe: Record<string, unknown>) {
  const page = { evaluate: vi.fn(async () => probe), isClosed: () => false, goto: vi.fn(), bringToFront: vi.fn() };
  const session = { accountId: 'test_account', browser: { connected: true, newPage: vi.fn(), close: vi.fn() }, page, isLoggedIn: false, loginVerifiedAt: 0 };
  manager.sessions.set('test_account', session);
  return session;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  manager.sessions.clear(); manager.serverSessionChecks?.clear(); vi.clearAllMocks();
  // A registered blog stays strict: a different or unreadable blog must never be treated as this account.
  isolateBlogIdentity(manager); manager.expectedBlogIds.clear(); manager.setExpectedBlogId('test_account', 'test_account');
  guard.getStatus.mockReturnValue({ paused: false, version: 0 });
});

describe('verified login cookies are saved for the next app start', () => {
  it('saves the cookies once the server confirms the expected account', async () => {
    const session = setup({ finalUrl: 'https://blog.naver.com/GoBlogWrite.naver', status: 200, hasEditor: true, accountIdentity: 'test_account' });
    expect((await manager.inspectServerSessionState('test_account')).status).toBe('ready');
    await flush();
    expect(persistence.saveCookies).toHaveBeenCalledTimes(1);
    expect(persistence.saveCookies).toHaveBeenCalledWith(session.page, 'test_account');
  });

  it.each([
    ['login form', { finalUrl: 'https://nid.naver.com/nidlogin.login', status: 200, hasLoginForm: true }],
    ['another account', { finalUrl: 'https://blog.naver.com/GoBlogWrite.naver', status: 200, hasEditor: true, accountIdentity: 'another_account' }],
    ['unknown account', { finalUrl: 'https://blog.naver.com/GoBlogWrite.naver', status: 200, hasEditor: true }],
    ['protection page', { finalUrl: 'https://nid.naver.com/user2/help', status: 200, hasProtection: true }],
  ])('never saves cookies for a %s', async (_name, probe) => {
    setup(probe);
    await manager.inspectServerSessionState('test_account');
    await flush();
    expect(persistence.saveCookies).not.toHaveBeenCalled();
  });

  it('a failed write does not change the verdict', async () => {
    persistence.saveCookies.mockRejectedValueOnce(new Error('disk full'));
    setup({ finalUrl: 'https://blog.naver.com/GoBlogWrite.naver', status: 200, hasEditor: true, accountIdentity: 'test_account' });
    expect((await manager.inspectServerSessionState('test_account')).status).toBe('ready');
    await flush();
    expect(persistence.saveCookies).toHaveBeenCalledTimes(1);
  });
});
