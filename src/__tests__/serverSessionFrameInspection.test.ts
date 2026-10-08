import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
vi.mock('puppeteer-extra', () => ({ default: { use: vi.fn() } }));
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: () => ({ enabledEvasions: new Set() }) }));
vi.mock('../sessionPersistence.js', () => ({ saveCookies: vi.fn(async () => {}) }));
import { browserSessionManager } from '../browserSessionManager.js';
import { isolateBlogIdentity } from './mocks/isolatedBlogIdentity';
const manager = browserSessionManager as any;
const editorUrl = 'https://blog.naver.com/PostWriteForm.naver?blogId=test_account';
function frame(url = editorUrl, selectors = ['.se-main-container', '.se-documentTitle'], bodyText = '') {
  const f = { url: vi.fn(() => url), evaluate: vi.fn(async (script: string) => runInNewContext(script, {
    document: { querySelector: (selector: string) => selector.split(',').some(part => selectors.includes(part.trim())) ? {} : null, body: { textContent: bodyText } },
    location: { href: f.url() }, URL,
  })) }; return f;
}
function setup(frames = [frame()]) {
  const page = { frames: () => frames, url: vi.fn(() => 'https://blog.naver.com/test_account?Redirect=Write'), isClosed: () => false,
    evaluate: vi.fn(async () => ({ error: 'cors-fetch-unavailable' })), goto: vi.fn() };
  const session = { accountId: 'test_account', browser: { connected: true }, page, isLoggedIn: false, loginVerifiedAt: 0 };
  manager.sessions.set('test_account', session); return session;
}
beforeEach(() => { manager.sessions.clear(); manager.serverSessionChecks.clear(); manager.expectedBlogIds.clear(); isolateBlogIdentity(manager); vi.clearAllMocks(); });
describe('current editor frame session evidence', () => {
  it('recognizes an independently evaluated cross-origin nested editor without a network request', async () => {
    const shell = frame('https://blog.naver.com/test_account?Redirect=Write', []);
    const nested = frame(); const session = setup([shell, nested]);
    expect(await manager.inspectServerSessionState('test_account')).toMatchObject({ ok: true, status: 'ready' });
    expect(nested.evaluate).toHaveBeenCalledOnce(); expect(session.page.evaluate).not.toHaveBeenCalled();
    expect(session.page.goto).not.toHaveBeenCalled(); expect(session.isLoggedIn).toBe(true);
  });
  it('recognizes the section document title selector', async () => {
    setup([frame(editorUrl, ['.se-main-container', '.se-section-documentTitle'])]);
    expect((await manager.inspectServerSessionState('test_account')).status).toBe('ready');
  });
  it('accepts only matching official URL identity of a registered blog', async () => {
    manager.setExpectedBlogId('test_account', 'test_account');
    for (const url of ['https://blog.naver.com/PostWriteForm.naver', editorUrl.replace('test_account', 'other_account')]) {
      const session = setup([frame(url)]);
      expect(await manager.inspectServerSessionState('test_account')).toMatchObject({ ok: false, reason: 'account-identity-unverified' });
      expect(session.isLoggedIn).toBe(false);
    }
  });
  it('recognizes the configured blog identity and Redirect=Write identity', async () => {
    manager.setExpectedBlogId('test_account', 'my_blog'); setup([frame('https://blog.naver.com/my_blog?Redirect=Write')]);
    expect((await manager.inspectServerSessionState('test_account')).status).toBe('ready');
  });
  it.each([
    ['protected', 'https://nid.naver.com/user2/protect', []],
    ['challenge', 'https://nid.naver.com/login/ext/verification', []],
    ['login-required', 'https://nid.naver.com/nidlogin.login', []],
    ['challenge', editorUrl, ['input#captcha']],
  ])('prioritizes %s in another frame over an editor', async (status, url, selectors) => {
    setup([frame(), frame(url, selectors)]);
    expect((await manager.inspectServerSessionState('test_account')).status).toBe(status);
  });
  it('ignores article text containing challenge/protection phrases', async () => {
    setup([frame(editorUrl, ['.se-main-container', '.se-documentTitle'], '보호조치가 적용. 보안문자를 입력.')]);
    expect((await manager.inspectServerSessionState('test_account')).status).toBe('ready');
  });
  it('does not trust an editor in an unrelated or spoofed frame', async () => {
    for (const url of ['https://blog.naver.com.evil.example/?blogId=test_account', 'http://blog.naver.com/?blogId=test_account']) {
      const other = frame(url); setup([other]);
      expect((await manager.inspectServerSessionState('test_account')).ok).toBe(false);
      expect(other.evaluate).not.toHaveBeenCalled();
    }
  });
  it('does not accept frame evidence when the top-level page changed', async () => {
    const f = frame(); const session = setup([f]); const original = f.evaluate.getMockImplementation()!;
    f.evaluate.mockImplementation(async (...args) => { const result = await original(...args); session.page.url.mockReturnValue('https://blog.naver.com/another?Redirect=Write'); return result; });
    expect(await manager.inspectServerSessionState('test_account')).toMatchObject({ ok: false, reason: 'session-changed' });
    expect(session.isLoggedIn).toBe(false);
  });
  it('does not accept a frame that navigated while being inspected', async () => {
    const f = frame(); setup([f]); const original = f.evaluate.getMockImplementation()!;
    f.evaluate.mockImplementation(async (...args) => { const result = await original(...args); f.url.mockReturnValue('https://blog.naver.com/another?Redirect=Write'); return result; });
    expect((await manager.inspectServerSessionState('test_account')).ok).toBe(false);
  });
  it('does not accept evidence for a replaced session', async () => {
    const f = frame(); setup([f]); const original = f.evaluate.getMockImplementation()!;
    f.evaluate.mockImplementation(async (...args) => { const result = await original(...args); setup(); return result; });
    expect(await manager.inspectServerSessionState('test_account')).toMatchObject({ ok: false, reason: 'session-changed' });
  });
  it('rejects an untrusted top-level page even when it embeds a Naver editor', async () => {
    const nested = frame(); const session = setup([nested]); session.page.url.mockReturnValue('https://example.com');
    expect((await manager.inspectServerSessionState('test_account')).ok).toBe(false);
    expect(nested.evaluate).not.toHaveBeenCalled(); expect(session.page.evaluate).not.toHaveBeenCalled();
  });
  it('fails closed when a trusted frame cannot be inspected', async () => {
    const failed = frame(); failed.evaluate.mockRejectedValue(new Error('detached'));
    const session = setup([frame(), failed]);
    expect((await manager.inspectServerSessionState('test_account')).status).toBe('unavailable');
    expect(session.page.evaluate).not.toHaveBeenCalled();
  });
  it('still reports protection when another trusted frame inspection fails', async () => {
    const failed = frame(); failed.evaluate.mockRejectedValue(new Error('detached'));
    setup([failed, frame('https://nid.naver.com/user2/protect', [])]);
    expect((await manager.inspectServerSessionState('test_account')).status).toBe('protected');
  });
  it('rejects conflicting editor identities instead of choosing the first frame', async () => {
    manager.setExpectedBlogId('test_account', 'test_account');
    setup([frame(), frame(editorUrl.replace('test_account', 'other_account'))]);
    expect(await manager.inspectServerSessionState('test_account')).toMatchObject({ ok: false, reason: 'account-identity-unverified' });
  });
  it('accepts consistent identities across multiple editor frames', async () => {
    setup([frame(), frame('https://m.blog.naver.com/PostWriteForm.naver?blogId=TEST_ACCOUNT')]);
    expect((await manager.inspectServerSessionState('test_account')).status).toBe('ready');
  });
  it('rejects malformed identity values', async () => {
    setup([frame('https://blog.naver.com/PostWriteForm.naver?blogId=bad%2Faccount')]);
    expect(await manager.inspectServerSessionState('test_account')).toMatchObject({ ok: false, reason: 'account-identity-unverified' });
  });
  it('falls back to the existing server probe only when no current editor or blocking evidence exists', async () => {
    const session = setup([frame('https://blog.naver.com/GoBlogWrite.naver', [])]);
    expect((await manager.inspectServerSessionState('test_account')).ok).toBe(false);
    expect(session.page.evaluate).toHaveBeenCalledOnce();
  });
  it('rejects a frame removed during evaluation', async () => {
    const f = frame(); const session = setup([f]); const original = f.evaluate.getMockImplementation()!;
    f.evaluate.mockImplementation(async (...args) => { const result = await original(...args); session.page.frames = () => []; return result; });
    expect((await manager.inspectServerSessionState('test_account')).status).toBe('unavailable');
  });

  it('rejects session replacement during an explicit verification navigation', async () => {
    const session = setup(); session.page.url.mockReturnValue('https://www.naver.com/');
    session.page.goto.mockImplementation(async () => { setup(); session.page.url.mockReturnValue('https://nid.naver.com/nidlogin.login'); });
    const probe = vi.spyOn(manager, 'inspectServerSessionState').mockResolvedValueOnce({ ok: false, status: 'unknown', reason: 'missing-editor-evidence' });
    try {
      expect(await manager.verifyAccountForUser('test_account')).toMatchObject({ ok: false, reason: 'session-changed' });
    } finally { probe.mockRestore(); }
  });

});
