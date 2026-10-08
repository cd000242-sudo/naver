/**
 * [2026-10-09 고객 신고 v2.11.335] The owner's login ID is tnqls6550- but the blog address is leader_248. The session probe
 * compared the editor's blog with the login ID and stopped every publish with ACCOUNT_MISMATCH. A blog that no registered
 * account names is now LEARNED the first time the editor confirms it; a configured blog stays strict.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const guard = vi.hoisted(() => ({ assertAllowed: vi.fn(), getStatus: vi.fn(() => ({ paused: false, version: 0 })), pause: vi.fn() }));
vi.mock('puppeteer-extra', () => ({ default: { use: vi.fn() } }));
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: () => ({ enabledEvasions: new Set() }) }));
vi.mock('../sessionPersistence.js', () => ({ saveCookies: vi.fn(async () => {}) }));
vi.mock('../automation/accountExecutionGuard.js', () => ({
  getAccountExecutionGuard: () => guard,
  AccountExecutionGuardError: class extends Error { constructor(public code: string, message?: string) { super(message ?? code); } },
}));
import { browserSessionManager } from '../browserSessionManager.js';
import { BlogIdentityStore } from '../automation/blogIdentityStore.js';

const manager = browserSessionManager as any;
const LOGIN = 'tnqls6550-';
const editorOf = (blog: string) => `https://blog.naver.com/PostWriteForm.naver?blogId=${blog}`;
const roots: string[] = [];

function frame(url: string) {
  const f = { url: vi.fn(() => url), evaluate: vi.fn(async (script: string) => runInNewContext(script, {
    document: { querySelector: (selector: string) => selector.split(',').some(part => ['.se-main-container', '.se-documentTitle'].includes(part.trim())) ? {} : null, body: { textContent: '' } },
    location: { href: f.url() }, URL,
  })) };
  return f;
}
/** A browser window of `login` showing the editor of `blog` (blog undefined = identity unreadable). */
function openWindow(login: string, blog: string | undefined) {
  const editor = frame(blog ? editorOf(blog) : 'https://blog.naver.com/PostWriteForm.naver');
  const page = { frames: () => [editor], url: vi.fn(() => `https://blog.naver.com/${blog || 'x'}?Redirect=Write`),
    isClosed: () => false, evaluate: vi.fn(async () => ({ error: 'cors-fetch-unavailable' })), goto: vi.fn() };
  const session = { accountId: login, browser: { connected: true }, page, isLoggedIn: false, loginVerifiedAt: 0 };
  manager.sessions.set(login, session);
  return session;
}
const storeDir = () => roots[roots.length - 1];
const freshStore = (dir?: string) => { const d = dir ?? mkdtempSync(join(tmpdir(), 'blog-learning-')); if (!dir) roots.push(d); return new BlogIdentityStore({ storageDir: d }); };
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  manager.sessions.clear(); manager.serverSessionChecks.clear(); manager.expectedBlogIds.clear();
  manager.identityStore = freshStore(); manager.blogOwnerResolver = undefined;
  vi.clearAllMocks(); guard.assertAllowed.mockReset(); guard.getStatus.mockReturnValue({ paused: false, version: 0 });
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { log.mockRestore(); for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('fallback only: the first confirmed blog is learned', () => {
  it('the exact owner case: login tnqls6550- with blog leader_248 is ready, learned and logged', async () => {
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    const session = openWindow(LOGIN, 'leader_248');
    expect(await manager.inspectServerSessionState(LOGIN)).toMatchObject({ ok: true, status: 'ready', blogId: 'leader_248' });
    expect(session.isLoggedIn).toBe(true);
    expect(manager.identityStore.get(LOGIN)).toBe('leader_248');
    expect(JSON.parse(readFileSync(join(storeDir(), 'blog-identity.json'), 'utf8')).learned).toBeTruthy();
    const lines = log.mock.calls.map(call => String(call[0]));
    expect(lines.some(line => line.includes('ℹ️ 이 계정(tnq***)의 블로그 주소를 leader_248 로 확인했습니다.'))).toBe(true);
    expect(lines.join('\n')).not.toContain(LOGIN);
  });

  it('with nothing registered at all the same happens (no setExpectedBlogId call)', async () => {
    openWindow(LOGIN, 'leader_248');
    expect(await manager.inspectServerSessionState(LOGIN)).toMatchObject({ ok: true, status: 'ready' });
    expect(manager.identityStore.get(LOGIN)).toBe('leader_248');
  });

  it('a blog that equals the login ID is ready and pinned', async () => {
    manager.setExpectedBlogId('test_account', 'test_account', 'fallback');
    openWindow('test_account', 'test_account');
    expect(await manager.inspectServerSessionState('test_account')).toMatchObject({ ok: true, status: 'ready' });
    expect(manager.identityStore.get('test_account')).toBe('test_account');
  });

  it('an unreadable editor identity is never learned', async () => {
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    const session = openWindow(LOGIN, undefined);
    const verdict = await manager.inspectServerSessionState(LOGIN);
    expect(verdict).toMatchObject({ ok: false, reason: 'account-identity-unverified' });
    expect(verdict.identityMismatch).toBeUndefined();
    expect(session.isLoggedIn).toBe(false);
    expect(manager.identityStore.get(LOGIN)).toBeUndefined();
  });
});

describe('learned blog is compared on later runs', () => {
  it('a different well-formed blog later is ACCOUNT_MISMATCH evidence naming both blogs', async () => {
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    openWindow(LOGIN, 'leader_248'); await manager.inspectServerSessionState(LOGIN);
    manager.serverSessionChecks.clear();
    const session = openWindow(LOGIN, 'someone_else');
    expect(await manager.inspectServerSessionState(LOGIN)).toMatchObject({
      ok: false, reason: 'account-identity-unverified', identityMismatch: true, observedBlogId: 'someone_else', expectedBlogId: 'leader_248',
    });
    expect(session.isLoggedIn).toBe(false);
    expect(manager.identityStore.get(LOGIN)).toBe('leader_248');
  });

  it('survives a restart: a fresh store instance on the same folder still knows the learned blog', async () => {
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    openWindow(LOGIN, 'leader_248'); await manager.inspectServerSessionState(LOGIN);
    manager.sessions.clear(); manager.serverSessionChecks.clear(); manager.expectedBlogIds.clear();
    manager.identityStore = freshStore(storeDir());
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    openWindow(LOGIN, 'leader_248');
    expect(await manager.inspectServerSessionState(LOGIN)).toMatchObject({ ok: true, status: 'ready' });
    manager.serverSessionChecks.clear();
    openWindow(LOGIN, 'other_blog');
    expect(await manager.inspectServerSessionState(LOGIN)).toMatchObject({ identityMismatch: true, expectedBlogId: 'leader_248' });
  });
});

describe('a configured blog stays strict', () => {
  it('a registered blog is compared exactly and nothing is learned', async () => {
    manager.setExpectedBlogId('test_account', 'my_blog');
    openWindow('test_account', 'leader_248');
    expect(await manager.inspectServerSessionState('test_account')).toMatchObject({ ok: false, identityMismatch: true, observedBlogId: 'leader_248', expectedBlogId: 'my_blog' });
    expect(manager.identityStore.get('test_account')).toBeUndefined();
  });

  it('registering a blog later wins over an older learned value', async () => {
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    openWindow(LOGIN, 'leader_248'); await manager.inspectServerSessionState(LOGIN);
    manager.serverSessionChecks.clear();
    manager.setExpectedBlogId(LOGIN, 'my_blog');
    openWindow(LOGIN, 'leader_248');
    expect(await manager.inspectServerSessionState(LOGIN)).toMatchObject({ identityMismatch: true, expectedBlogId: 'my_blog' });
  });

  it('un-registering falls back to the learned blog instead of the login ID', async () => {
    manager.setExpectedBlogId(LOGIN, 'my_blog');
    manager.identityStore.learn(LOGIN, 'leader_248');
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    openWindow(LOGIN, 'leader_248');
    expect(await manager.inspectServerSessionState(LOGIN)).toMatchObject({ ok: true, status: 'ready' });
  });
});

describe('conflict guard: a blog owned by another Naver ID is never learned', () => {
  it('learned by another Naver ID', async () => {
    manager.identityStore.learn('other_login', 'leader_248');
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    openWindow(LOGIN, 'leader_248');
    expect(await manager.inspectServerSessionState(LOGIN)).toMatchObject({ ok: false, identityMismatch: true, observedBlogId: 'leader_248' });
    expect(manager.identityStore.get(LOGIN)).toBeUndefined();
  });

  it('configured for another Naver ID in this run', async () => {
    manager.setExpectedBlogId('other_login', 'leader_248');
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    openWindow(LOGIN, 'leader_248');
    expect(await manager.inspectServerSessionState(LOGIN)).toMatchObject({ ok: false, identityMismatch: true });
    expect(manager.identityStore.get(LOGIN)).toBeUndefined();
  });

  it('registered for another Naver ID in the app (owner resolver)', async () => {
    manager.setConfiguredBlogOwnerResolver((blogId: string) => blogId === 'leader_248' ? ['other_login'] : []);
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    openWindow(LOGIN, 'leader_248');
    expect(await manager.inspectServerSessionState(LOGIN)).toMatchObject({ ok: false, identityMismatch: true });
    expect(manager.identityStore.get(LOGIN)).toBeUndefined();
  });

  it('the same Naver ID owning the blog is not a conflict', async () => {
    manager.setConfiguredBlogOwnerResolver((blogId: string) => blogId === 'leader_248' ? [LOGIN] : []);
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    openWindow(LOGIN, 'leader_248');
    expect(await manager.inspectServerSessionState(LOGIN)).toMatchObject({ ok: true, status: 'ready' });
  });
});

describe('user-initiated verification may re-learn', () => {
  const learnThenSwitchWindow = async (blog: string) => {
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    manager.identityStore.learn(LOGIN, 'leader_248');
    return openWindow(LOGIN, blog);
  };

  it('[확인 후 재개] with allowRelearn adopts the blog the user is looking at and reports it', async () => {
    await learnThenSwitchWindow('new_blog');
    expect(await manager.verifyAccountForUser(LOGIN, { allowRelearn: true })).toMatchObject({ ok: true, status: 'ready', blogId: 'new_blog' });
    expect(manager.identityStore.get(LOGIN)).toBe('new_blog');
    expect(log.mock.calls.map(c => String(c[0])).some(line => line.includes('leader_248') && line.includes('new_blog'))).toBe(true);
  });

  it('without allowRelearn (a user-pressed publish) the learned blog still wins', async () => {
    await learnThenSwitchWindow('new_blog');
    expect(await manager.verifyAccountForUser(LOGIN)).toMatchObject({ ok: false, identityMismatch: true, expectedBlogId: 'leader_248' });
    expect(manager.identityStore.get(LOGIN)).toBe('leader_248');
  });

  it('never overrides a configured blog', async () => {
    manager.setExpectedBlogId(LOGIN, 'my_blog');
    openWindow(LOGIN, 'new_blog');
    expect(await manager.verifyAccountForUser(LOGIN, { allowRelearn: true })).toMatchObject({ ok: false, identityMismatch: true, expectedBlogId: 'my_blog' });
    expect(manager.identityStore.get(LOGIN)).toBeUndefined();
  });

  it('never violates the conflict guard', async () => {
    manager.identityStore.learn('other_login', 'new_blog');
    await learnThenSwitchWindow('new_blog');
    expect(await manager.verifyAccountForUser(LOGIN, { allowRelearn: true })).toMatchObject({ ok: false, identityMismatch: true });
    expect(manager.identityStore.get(LOGIN)).toBe('leader_248');
  });
});

describe('gates use the same learned/configured expectation', () => {
  it('entry gate: the owner case passes, no pause', async () => {
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    openWindow(LOGIN, 'leader_248');
    await expect(manager.ensureServerSession(LOGIN)).resolves.toBe(true);
    expect(guard.pause).not.toHaveBeenCalled();
  });

  it('entry gate: a different blog pauses with ACCOUNT_MISMATCH and a message naming both blogs', async () => {
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    manager.identityStore.learn(LOGIN, 'leader_248');
    openWindow(LOGIN, 'someone_else');
    const error = await manager.ensureServerSession(LOGIN).catch((e: Error) => e);
    expect(error).toMatchObject({ code: 'ACCOUNT_MISMATCH' });
    expect(error.message).toContain('이 창은 다른 블로그(someone_else)로 로그인돼 있습니다 (이 계정의 블로그: leader_248).');
    expect(error.message).toContain('[확인 후 재개]');
    expect(guard.pause).toHaveBeenCalledWith(LOGIN, 'ACCOUNT_MISMATCH');
  });

  it('pre-click gate: the owner case proceeds and a later different blog stops with both blogs named', async () => {
    manager.setExpectedBlogId(LOGIN, LOGIN, 'fallback');
    openWindow(LOGIN, 'leader_248');
    expect(await manager.ensureServerSessionForCommit(LOGIN)).toMatchObject({ ok: true });
    manager.serverSessionChecks.clear();
    openWindow(LOGIN, 'someone_else');
    const error = await manager.ensureServerSessionForCommit(LOGIN).catch((e: Error) => e);
    expect(error).toMatchObject({ code: 'ACCOUNT_MISMATCH' });
    expect(error.message).toContain('이 창은 다른 블로그(someone_else)로 로그인돼 있습니다 (이 계정의 블로그: leader_248).');
    expect(guard.pause).toHaveBeenCalledWith(LOGIN, 'ACCOUNT_MISMATCH');
  });

  it('getKnownBlogId: configured, then learned, otherwise nothing', () => {
    expect(manager.getKnownBlogId(LOGIN)).toBeUndefined();
    manager.identityStore.learn(LOGIN, 'leader_248');
    expect(manager.getKnownBlogId(LOGIN)).toBe('leader_248');
    manager.setExpectedBlogId(LOGIN, 'my_blog');
    expect(manager.getKnownBlogId(LOGIN)).toBe('my_blog');
  });
});
