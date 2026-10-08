import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyBlogWriteNavigationUrl } from '../automation/editorNavigationUrlPolicy.js';
import { isLoginChallengeUrl } from '../automation/loginPageNavigationPolicy.js';
const source = ts.createSourceFile('automation.ts', readFileSync(resolve('src/naverBlogAutomation.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
class GuardError extends Error { constructor(public code: string) { super(code); } }
function method(name: string, dependencies: Record<string, unknown>) {
  let selected: ts.MethodDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) selected = node; ts.forEachChild(node, visit); }; visit(source);
  if (!selected) throw Error(name);
  const compiled = ts.transpileModule(`class Harness { ${selected.getText(source)} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}; return Harness.prototype.${name};`)(...Object.values(dependencies));
}
function harness() {
  let current = 'about:blank'; const pause = vi.fn(); const verify = vi.fn(async () => true); const stop = new Error('before-input');
  const page = { url: () => current, isClosed: () => false,
    goto: vi.fn(async () => { current = 'https://blog.naver.com/test?Redirect=Write'; return { status: () => 200 }; }),
    waitForSelector: vi.fn(async () => undefined), waitForFunction: vi.fn(async (_fn: () => boolean, _options: unknown) => undefined) };
  const state: any = { page, browser: {}, options: { naverId: 'test' }, ensurePage: () => page,
    ensureNotCancelled: () => { if (state.cancelRequested) throw Error('cancelled'); },
    ensureDialogHandler: vi.fn(), resolveRunOptions: () => ({}), log: vi.fn(),
    switchToMainFrame: vi.fn(async () => { throw stop; }) };
  const dependencies = { classifyBlogWriteNavigationUrl, isLoginChallengeUrl, AccountExecutionGuardError: GuardError,
    getAccountExecutionGuard: () => ({ pause, getStatus: () => ({ paused: false }) }), NAVER_TIMEOUTS: { PAGE_LOAD: 30000 },
    browserSessionManager: { ensureServerSession: verify, markPublishing: vi.fn() }, beginMainProcessEditorCommitCandidate: vi.fn() };
  state.navigateToBlogWrite = method('navigateToBlogWrite', dependencies);
  const run = method('runPostOnlyInternal', dependencies);
  return { state, page, pause, verify, stop, setUrl: (url: string) => { current = url; }, execute: () => run.call(state, {}), navigate: () => state.navigateToBlogWrite() };
}
afterEach(() => vi.unstubAllGlobals());
describe('initial editor document readiness', () => {
  it('does not inspect identity until the iframe editor content has rendered', async () => {
    const h = harness(); let ready!: () => void;
    h.page.waitForFunction.mockImplementation(() => new Promise<void>(resolve => { ready = resolve; }));
    const pending = h.execute(); const outcome = expect(pending).rejects.toBe(h.stop);
    await vi.waitFor(() => expect(h.page.waitForSelector).toHaveBeenCalledOnce());
    expect(h.page.waitForFunction).toHaveBeenCalledOnce(); expect(h.verify).not.toHaveBeenCalled();
    ready(); await outcome; expect(h.verify).toHaveBeenCalledOnce(); expect(h.page.goto).toHaveBeenCalledOnce();
  });
  it('requires a real top-level or nested editor, not just an iframe element', async () => {
    const h = harness(); await h.navigate();
    expect(h.page.waitForFunction).toHaveBeenCalledOnce();
    const [predicate, options] = h.page.waitForFunction.mock.calls[0]; expect(options).toMatchObject({ timeout: 20000 });
    const doc = (editor = false) => ({ querySelector: (selector: string) => editor && (selector === '.se-main-container' || selector.includes('.se-documentTitle')) ? {} : null, querySelectorAll: () => [], body: { textContent: '' } });
    vi.stubGlobal('location', { hostname: 'blog.naver.com' }); vi.stubGlobal('document', doc()); expect(predicate()).toBe(false);
    vi.stubGlobal('document', doc(true)); expect(predicate()).toBe(true);
    vi.stubGlobal('document', { ...doc(), querySelectorAll: () => [{ contentDocument: doc(true) }] }); expect(predicate()).toBe(true);
    vi.stubGlobal('document', { ...doc(), querySelectorAll: () => [{ get contentDocument() { throw Error('cross-origin'); } }] }); expect(predicate()).toBe(false);
  });
  it('pauses on readiness timeout before the identity probe', async () => {
    const h = harness(); h.page.waitForFunction.mockRejectedValue(Error('timeout'));
    await expect(h.execute()).rejects.toMatchObject({ code: 'NETWORK_WAIT' });
    expect(h.pause).toHaveBeenCalledWith('test', 'NETWORK_WAIT'); expect(h.verify).not.toHaveBeenCalled();
  });
  it.each([['https://nid.naver.com/nidlogin.login', 'LOGIN_REQUIRED'], ['https://nid.naver.com/security', 'LOGIN_CHALLENGE'], ['https://nid.naver.com/user2/help/protect', 'LOGIN_CHALLENGE']])('stops a redirect while waiting: %s', async (url, code) => {
    const h = harness(); h.page.waitForFunction.mockImplementation(async () => { h.setUrl(url); });
    await expect(h.execute()).rejects.toMatchObject({ code }); expect(h.verify).not.toHaveBeenCalled();
    expect(h.pause).toHaveBeenCalledWith('test', code);
  });
  it('stops if cancelled during editor readiness', async () => {
    const h = harness(); h.page.waitForFunction.mockImplementation(async () => { h.state.cancelRequested = true; });
    await expect(h.execute()).rejects.toMatchObject({ code: 'NETWORK_WAIT' }); expect(h.verify).not.toHaveBeenCalled();
  });
});
