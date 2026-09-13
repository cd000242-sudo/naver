import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

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
    tryEnterFlowWorkspace: vi.fn(async () => false), readFlowSessionUser: readUser,
    setTimeout: (fn: () => void) => { queueMicrotask(fn); return 0; }, console,
  };
  const api = new Function(...Object.keys(deps), `${code}\nreturn { ensureFlowBrowserPage, checkFlowLogin, resetFlowState, launchWithStealthFallback, enableAds: () => { _flowAdsPowerEnabled = true; } };`)(...Object.values(deps));
  return { ...api, contexts, launch, loggedIn, adsConnect, readUser };
}

describe('Flow persistent profile ownership', () => {
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
