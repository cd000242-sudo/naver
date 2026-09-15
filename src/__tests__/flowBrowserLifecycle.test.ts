import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { isFlowWorkspaceUrl } from '../image/flowWorkspaceEntryPolicy';

const source = readFileSync('src/image/flowGenerator.ts', 'utf8');
const section = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const code = ts.transpileModule([
  section('let cachedContext:', '// ─── AdsPower 토글'),
  'let _flowAdsPowerEnabled = false; let _flowAdsPowerSessionDisabled = false;',
  'let _networkListenerInstalled = false; let _networkImageQueue = [];',
  section('function installNetworkImageListener', '// v2.7.12'),
  section('const STEALTH_ARGS', '// ✅ [v2.11.140]'),
  section('async function ensureFlowBrowserPage', '// [v1.6.1] 백그라운드 prewarm'),
  section('export async function checkFlowLogin', 'async function readFlowSessionUser'),
  source.slice(source.indexOf('export async function resetFlowState')),
].join('\n').replace(/^export /gm, '')
  .replace(/import\('patchright'\)/g, 'Promise.resolve({ chromium: injectedChromium })')
  .replace(/import\('\.\/flowAdsPowerConnect\.js'\)/g, 'Promise.resolve({ connectFlowViaAdsPower: adsConnect })'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const contexts: any[] = [];
  const loggedIn = vi.fn(async () => true);
  const adsConnect = vi.fn();
  const readUser = vi.fn(async () => null);
  const launch = vi.fn(async () => {
    const page = {
      isClosed: vi.fn(() => false), title: vi.fn(async () => 'Flow'),
      goto: vi.fn(async () => undefined), waitForLoadState: vi.fn(async () => undefined),
      waitForTimeout: vi.fn(async () => undefined), bringToFront: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => undefined), url: () => 'https://flow.google.com',
      on: vi.fn(),
    };
    const context = {
      pages: () => [page], newPage: async () => page, page,
      addInitScript: vi.fn(async () => undefined), on: vi.fn(),
      browser: () => null, close: vi.fn(async () => undefined),
    };
    contexts.push(context);
    return context;
  });
  const deps = {
    injectedChromium: { launchPersistentContext: launch }, adsConnect,
    getFlowProfileDir: () => '/test/flow-profile',
    flowLog: vi.fn(), flowWarn: vi.fn(), sendImageLog: vi.fn(),
    injectAntiModalObserver: vi.fn(async () => undefined),
    minimizeFlowWindow: vi.fn(async () => undefined),
    dismissCookieBanner: vi.fn(async () => undefined), isLoggedInToFlow: loggedIn,
    // classifyFlowPageLogin 이 쓰는 주소 판정 — 실제 구현을 그대로 넣는다(가짜로 바꾸면 의미가 없다).
    isFlowWorkspaceUrl,
    tryEnterFlowWorkspace: vi.fn(async () => false), readFlowSessionUser: readUser,
    setTimeout: (fn: () => void) => { queueMicrotask(fn); return 0; }, console,
  };
  const api = new Function(...Object.keys(deps), `${code}\nreturn { ensureFlowBrowserPage, checkFlowLogin, resetFlowState, launchWithStealthFallback, enableAds: () => { _flowAdsPowerEnabled = true; } };`)(...Object.values(deps));
  return { ...api, contexts, launch, loggedIn, adsConnect, readUser, minimize: deps.minimizeFlowWindow, enterWorkspace: deps.tryEnterFlowWorkspace };
}

describe('Flow persistent profile ownership', () => {
  it('finishes the login connection when authentication completes in a new tab and the original closes', async () => {
    const f = fixture();
    const initial = await fixtureContext(f);
    const login = await fixtureContext(f);
    const final = await fixtureContext(f);
    const authenticated = (await fixtureContext(f)).page;
    login.pages = () => [login.page, authenticated];
    login.page.isClosed.mockReturnValue(true);
    f.launch.mockResolvedValueOnce(initial).mockResolvedValueOnce(login).mockResolvedValueOnce(final);
    f.loggedIn.mockImplementation(async (page) => page === authenticated || page === final.page);
    expect(await f.ensureFlowBrowserPage()).toBe(final.page);
    expect(f.launch).toHaveBeenCalledTimes(3);
    expect(initial.close).toHaveBeenCalledTimes(1);
    expect(login.close).toHaveBeenCalledTimes(1);
    expect(final.close).not.toHaveBeenCalled();
  });

  it.each([false, true])('does not report login for an unauthenticated or closed active tab (closed=%s)', async (closed) => {
    const f = fixture();
    const gate = deferred();
    const context = await fixtureContext(f);
    context.page.goto.mockImplementationOnce(() => gate.promise);
    f.launch.mockResolvedValueOnce(context);
    f.loggedIn.mockResolvedValue(false);
    const pending = f.ensureFlowBrowserPage().catch(() => undefined);
    await vi.waitFor(() => expect(context.page.goto).toHaveBeenCalled());
    context.page.isClosed.mockReturnValue(closed);
    expect((await f.checkFlowLogin()).loggedIn).toBe(false);
    expect(f.readUser).not.toHaveBeenCalled();
    expect(context.close).not.toHaveBeenCalled();
    expect(f.launch).toHaveBeenCalledTimes(1);
    await f.resetFlowState();
    f.loggedIn.mockResolvedValue(true);
    gate.resolve();
    await pending;
  });

  it('checks an authenticated active page while connection finalization is pending', async () => {
    const f = fixture();
    const gate = deferred();
    f.minimize.mockImplementationOnce(() => gate.promise);
    const pending = f.ensureFlowBrowserPage();
    await vi.waitFor(() => expect(f.minimize).toHaveBeenCalled());
    const checks = await Promise.all([f.checkFlowLogin(), f.checkFlowLogin()]);
    expect(checks.every((result) => result.loggedIn)).toBe(true);
    expect(f.readUser).toHaveBeenCalledTimes(1);
    expect(f.launch).toHaveBeenCalledTimes(1);
    expect(f.contexts[0].close).not.toHaveBeenCalled();
    expect(f.contexts[0].page.goto).toHaveBeenCalledTimes(1);
    gate.resolve();
    await pending;
  });

  it('finds login in a new tab without navigating or closing the active browser', async () => {
    const f = fixture();
    const gate = deferred();
    const context = await fixtureContext(f);
    const signedInPage = (await fixtureContext(f)).page;
    context.pages = () => [context.page, signedInPage];
    context.page.goto.mockImplementationOnce(() => gate.promise);
    f.launch.mockResolvedValueOnce(context);
    f.loggedIn.mockImplementation(async (page) => page === signedInPage);
    const pending = f.ensureFlowBrowserPage().catch(() => undefined);
    await vi.waitFor(() => expect(context.page.goto).toHaveBeenCalled());
    expect((await f.checkFlowLogin()).loggedIn).toBe(true);
    expect(f.readUser).toHaveBeenCalledWith(signedInPage);
    expect(signedInPage.goto).not.toHaveBeenCalled();
    expect(context.close).not.toHaveBeenCalled();
    await f.resetFlowState();
    f.loggedIn.mockResolvedValue(true);
    gate.resolve();
    await pending;
  });

  it('invalidates a pending active-page success when the session is reset', async () => {
    const f = fixture();
    const connectionGate = deferred();
    const readGate = deferred();
    f.minimize.mockImplementationOnce(() => connectionGate.promise);
    const pending = f.ensureFlowBrowserPage().catch(() => undefined);
    await vi.waitFor(() => expect(f.minimize).toHaveBeenCalled());
    f.readUser.mockImplementationOnce(async () => { await readGate.promise; return null; });
    const check = f.checkFlowLogin();
    await vi.waitFor(() => expect(f.readUser).toHaveBeenCalled());
    await f.resetFlowState();
    readGate.resolve();
    expect((await check).loggedIn).toBe(false);
    connectionGate.resolve();
    await pending;
  });

  it('closes an AdsPower context if reset happens before the connection completes', async () => {
    const f = fixture();
    const gate = deferred();
    f.enableAds();
    f.adsConnect.mockImplementationOnce(async () => { await gate.promise; return fixtureContext(f); });
    const check = f.checkFlowLogin();
    await new Promise((done) => setTimeout(done, 0));
    await f.resetFlowState();
    gate.resolve();
    expect((await check).loggedIn).toBe(false);
    expect(f.contexts[0].close).toHaveBeenCalledTimes(1);
    expect(f.launch).not.toHaveBeenCalled();
  });

  it('does not return stale cached login success after reset', async () => {
    const f = fixture();
    await f.ensureFlowBrowserPage();
    const gate = deferred();
    f.readUser.mockImplementationOnce(async () => { await gate.promise; return null; });
    const check = f.checkFlowLogin();
    await new Promise((done) => setTimeout(done, 0));
    await f.resetFlowState();
    gate.resolve();
    expect((await check).loggedIn).toBe(false);
  });

  it('keeps local browser logs out of the user-facing launch error', async () => {
    const f = fixture();
    f.launch.mockRejectedValue(new Error('Target closed --user-data-dir=C:/private/profile browser logs'));
    const check = await f.checkFlowLogin();
    expect(check.loggedIn).toBe(false);
    expect(check.message).toContain('FLOW_BROWSER_LAUNCH_FAILED');
    expect(check.message).not.toMatch(/C:\/private|browser logs|user-data-dir/);
  });
  it('coalesces simultaneous login checks into one browser', async () => {
    const f = fixture();
    const results = await Promise.all([f.checkFlowLogin(), f.checkFlowLogin()]);
    expect(results.every((result) => result.loggedIn)).toBe(true);
    expect(f.launch).toHaveBeenCalledTimes(1);
    expect(f.contexts[0].close).toHaveBeenCalledTimes(1);
  });

  it('reports an in-progress login without opening a competing browser', async () => {
    const f = fixture();
    const gate = deferred();
    f.launch.mockImplementationOnce(async () => { await gate.promise; return (await fixtureContext(f)); });
    const pending = f.ensureFlowBrowserPage();
    const check = await f.checkFlowLogin();
    expect(check.loggedIn).toBe(false);
    expect(check.message).toMatch(/진행 중/);
    await new Promise((done) => setTimeout(done, 0));
    expect(f.launch).toHaveBeenCalledTimes(1);
    gate.resolve();
    await pending;
  });

  it('waits for a temporary login check to close before starting a cached session', async () => {
    const f = fixture();
    const gate = deferred();
    f.launch.mockImplementationOnce(async () => { const ctx = await fixtureContext(f); ctx.page.goto.mockImplementationOnce(() => gate.promise); return ctx; });
    const check = f.checkFlowLogin();
    const ensure = f.ensureFlowBrowserPage();
    await new Promise((done) => setTimeout(done, 0));
    expect(f.launch).toHaveBeenCalledTimes(1);
    gate.resolve();
    await Promise.all([check, ensure]);
    expect(f.contexts[0].close).toHaveBeenCalledTimes(1);
    expect(f.launch).toHaveBeenCalledTimes(2);
  });

  it('closes an uncached context after navigation fails and allows a retry', async () => {
    const f = fixture();
    f.launch.mockImplementationOnce(async () => { const ctx = await fixtureContext(f); ctx.page.goto.mockRejectedValueOnce(new Error('navigation failed')); return ctx; });
    await expect(f.ensureFlowBrowserPage()).rejects.toThrow('navigation failed');
    expect(f.contexts[0].close).toHaveBeenCalledTimes(1);
    await f.ensureFlowBrowserPage();
    expect(f.launch).toHaveBeenCalledTimes(2);
    expect(f.contexts[1].page.on).toHaveBeenCalledWith('response', expect.any(Function));
  });

  it('closes a context whose cached tab was closed before relaunching', async () => {
    const f = fixture();
    await f.ensureFlowBrowserPage();
    f.contexts[0].page.isClosed.mockReturnValue(true);
    await f.ensureFlowBrowserPage();
    expect(f.contexts[0].close).toHaveBeenCalledTimes(1);
  });

  it('does not close the active cached session when a status probe fails', async () => {
    const f = fixture();
    await f.ensureFlowBrowserPage();
    f.loggedIn.mockResolvedValueOnce(false);
    expect((await f.checkFlowLogin()).loggedIn).toBe(false);
    expect(f.launch).toHaveBeenCalledTimes(1);
    expect(f.contexts[0].close).not.toHaveBeenCalled();
  });

  it('cleans up and rejects when reset arrives during navigation', async () => {
    const f = fixture();
    const gate = deferred();
    f.launch.mockImplementationOnce(async () => { const ctx = await fixtureContext(f); ctx.page.goto.mockImplementationOnce(() => gate.promise); return ctx; });
    const pending = f.ensureFlowBrowserPage();
    await new Promise((done) => setTimeout(done, 0));
    await f.resetFlowState();
    gate.resolve();
    await expect(pending).rejects.toThrow(/FLOW_SESSION_CANCELLED/);
    expect(f.contexts[0].close).toHaveBeenCalledTimes(1);
    await f.ensureFlowBrowserPage();
    expect(f.launch).toHaveBeenCalledTimes(2);
  });

  it('closes a failed initialization before trying another browser channel', async () => {
    const f = fixture();
    f.launch.mockImplementationOnce(async () => { const ctx = await fixtureContext(f); ctx.addInitScript.mockRejectedValueOnce(new Error('init failed')); return ctx; });
    await f.ensureFlowBrowserPage();
    expect(f.contexts[0].close).toHaveBeenCalledTimes(1);
    expect(f.launch).toHaveBeenCalledTimes(2);
  });

  it('does not resurrect a browser when reset happens during launch', async () => {
    const f = fixture();
    const gate = deferred();
    f.launch.mockImplementationOnce(async () => { await gate.promise; return fixtureContext(f); });
    const pending = f.ensureFlowBrowserPage();
    await new Promise((done) => setTimeout(done, 0));
    await f.resetFlowState();
    gate.resolve();
    await expect(pending).rejects.toThrow(/FLOW_SESSION_CANCELLED/);
    expect(f.contexts[0].close).toHaveBeenCalledTimes(1);
  });
});

async function fixtureContext(f: ReturnType<typeof fixture>) {
  const other = fixture();
  const ctx = await other.launch();
  f.contexts.push(ctx);
  return ctx;
}
