/**
 * User-pressed recovery actions on the browser session manager:
 * - ensureSessionForUser: a resume/confirm check needs a window to look at (none exists right after an app restart);
 * - openPostListForUser: show the blog's post list in the account's own browser without touching an open editor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const guard = vi.hoisted(() => ({
  getStatus: vi.fn(() => ({ paused: true, busy: false, version: 3, code: 'PUBLISH_OUTCOME_UNKNOWN' })),
  assertAllowed: vi.fn(), pause: vi.fn(),
  runUserActionExclusive: vi.fn(async (_id: string, run: () => Promise<void>) => run()),
}));
vi.mock('puppeteer-extra', () => ({ default: { use: vi.fn() } }));
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: () => ({ enabledEvasions: new Set() }) }));
vi.mock('../session/sessionEventLogger.js', () => ({ emitSessionEvent: vi.fn() }));
vi.mock('../automation/accountExecutionGuard.js', () => ({ getAccountExecutionGuard: () => guard, AccountExecutionGuardError: class extends Error { constructor(public code: string) { super(code); } } }));
import { browserSessionManager } from '../browserSessionManager.js';
const manager = browserSessionManager as any;

function makePage(url: string) {
  return { isClosed: vi.fn(() => false), goto: vi.fn(async () => {}), bringToFront: vi.fn(async () => {}), url: vi.fn(() => url) };
}
function setup(url = 'about:blank', id = 'test_account') {
  const page = makePage(url);
  const extraTab = makePage('about:blank');
  const session = { accountId: id, browser: { connected: true, newPage: vi.fn(async () => extraTab), close: vi.fn(async () => {}), process: vi.fn() }, page, createdAt: Date.now() };
  manager.sessions.set(id, session);
  return { session, page, extraTab };
}
beforeEach(() => { vi.clearAllMocks(); manager.sessions.clear(); manager.stopKeepalive(); });
afterEach(() => { vi.restoreAllMocks(); manager.stopKeepalive(); });

describe('ensureSessionForUser', () => {
  it('creates the account browser as a user action when none is open, without navigating', async () => {
    const created = makePage('about:blank');
    const spy = vi.spyOn(manager, 'getOrCreateSession').mockResolvedValue({ page: created, browser: { connected: true } });
    await manager.ensureSessionForUser('test_account');
    expect(spy).toHaveBeenCalledWith('test_account', false, undefined, { userInitiated: true });
    expect(guard.runUserActionExclusive).toHaveBeenCalledOnce();
    expect(created.goto).not.toHaveBeenCalled();
    expect(created.bringToFront).not.toHaveBeenCalled();
  });

  it('keeps a live session as it is', async () => {
    const { page } = setup('https://blog.naver.com/test_account?Redirect=Write');
    const spy = vi.spyOn(manager, 'getOrCreateSession');
    await manager.ensureSessionForUser('test_account');
    expect(spy).not.toHaveBeenCalled();
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('recreates a session whose page was closed', async () => {
    const { page } = setup();
    page.isClosed.mockReturnValue(true);
    const spy = vi.spyOn(manager, 'getOrCreateSession').mockResolvedValue({ page: makePage('about:blank'), browser: { connected: true } });
    await manager.ensureSessionForUser('test_account');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('lets a failure to start the browser reach the caller', async () => {
    vi.spyOn(manager, 'getOrCreateSession').mockRejectedValue(new Error('no chrome'));
    await expect(manager.ensureSessionForUser('test_account')).rejects.toThrow('no chrome');
  });
});

describe('openPostListForUser', () => {
  const listUrl = 'https://blog.naver.com/PostList.naver?blogId=my-blog&categoryNo=0&from=postList';

  it('reuses a blank page of a fresh session', async () => {
    const { page, session } = setup('about:blank');
    await manager.openPostListForUser('test_account', 'my-blog');
    expect(page.goto).toHaveBeenCalledWith(listUrl, expect.objectContaining({ waitUntil: 'domcontentloaded' }));
    expect(page.bringToFront).toHaveBeenCalled();
    expect(session.browser.newPage).not.toHaveBeenCalled();
  });

  it('opens a new tab and leaves a page the user may be editing alone', async () => {
    const { page, extraTab, session } = setup('https://blog.naver.com/my-blog?Redirect=Write');
    await manager.openPostListForUser('test_account', 'my-blog');
    expect(page.goto).not.toHaveBeenCalled();
    expect(session.browser.newPage).toHaveBeenCalledOnce();
    expect(extraTab.goto).toHaveBeenCalledWith(listUrl, expect.objectContaining({ waitUntil: 'domcontentloaded' }));
    expect(extraTab.bringToFront).toHaveBeenCalled();
  });

  it('starts the account browser first when none is open', async () => {
    const created = makePage('about:blank');
    const spy = vi.spyOn(manager, 'getOrCreateSession').mockResolvedValue({ page: created, browser: { connected: true, newPage: vi.fn() } });
    await manager.openPostListForUser('test_account', 'my-blog');
    expect(spy).toHaveBeenCalledWith('test_account', false, undefined, { userInitiated: true });
    expect(created.goto).toHaveBeenCalledWith(listUrl, expect.any(Object));
  });

  it.each(['', 'a b', 'x/../y', 'blog?x=1', 'a'.repeat(101)])('refuses an unsafe blog id %j before opening anything', async (blogId) => {
    const { page, session } = setup();
    await expect(manager.openPostListForUser('test_account', blogId)).rejects.toThrow();
    expect(page.goto).not.toHaveBeenCalled();
    expect(session.browser.newPage).not.toHaveBeenCalled();
  });

  it('never clears the stop', async () => {
    setup();
    await manager.openPostListForUser('test_account', 'my-blog');
    expect(guard.pause).not.toHaveBeenCalled();
  });
});
