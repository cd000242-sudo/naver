import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = ts.createSourceFile('automation.ts', readFileSync(resolve('src/naverBlogAutomation.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const stopBeforeInput = new Error('STOP_BEFORE_INPUT');
class GuardError extends Error { constructor(public code: string) { super(code); } }
function loadMethod(name: string, dependencies: Record<string, unknown>) {
  let method: ts.MethodDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) method = node; ts.forEachChild(node, visit); };
  visit(source);
  if (!method) throw new Error(`Missing production method ${name}`);
  const compiled = ts.transpileModule(`class Harness { ${method.getText(source)} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}; return Harness.prototype.${name};`)(...Object.values(dependencies));
}
function harness(name: string, initial: string, existingBrowser = true) {
  const events: string[] = []; let current = initial;
  const page = { url: () => current, isClosed: () => false };
  const state: any = {
    browser: existingBrowser ? {} : null, page, options: { naverId: 'test_account' },
    log: vi.fn(), resolveRunOptions: (value: any) => ({ ...value, keepBrowserOpen: true }),
    setupBrowser: vi.fn(async () => { events.push('setup'); state.browser = {}; }),
    ensurePage: () => state.page,
    ensureNotCancelled: () => { if (state.cancelRequested) throw new Error('사용자가 자동화를 취소했습니다.'); },
    ensureDialogHandler: vi.fn(() => events.push('dialogs')),
    navigateToBlogWrite: vi.fn(async () => { events.push('navigate'); current = 'https://blog.naver.com/test_account?Redirect=Write'; }),
    loginToNaver: vi.fn(async () => { events.push('login'); return verify(); }),
    switchToMainFrame: vi.fn(async () => { events.push('frame'); throw stopBeforeInput; }),
    // 이 장치는 진입 계약만 본다 — 재시작 1회 감싸개는 editorEntryRestart.test.ts 에서 따로 본다.
    enterEditorWithOneRestart: async (entry: (deferPause: boolean) => Promise<void>) => entry(false),
  };
  const verify = vi.fn(async () => {
    events.push('verify');
    if (current === 'about:blank') throw new GuardError('NETWORK_WAIT');
    return true;
  });
  const run = loadMethod(name, {
    browserSessionManager: { ensureServerSession: verify, markPublishing: vi.fn() },
    beginMainProcessEditorCommitCandidate: vi.fn(), resetImageProvenanceLedger: vi.fn(),
    getAccountExecutionGuard: () => ({ getStatus: () => ({ paused: false }) }),
    AccountExecutionGuardError: GuardError,
    PUBLISH_PIPELINE_LOG_MESSAGES: {}, formatPipelineUrlLog: () => '',
    resolvePostRunBrowserPolicy: () => ({}),
    require: () => ({ globalLimiter: { acquire: async () => vi.fn() } }),
  });
  return { state, events, verify, execute: () => run.call(state, {}) };
}

describe.each(['runAccountInternal', 'runPostOnlyInternal'])('%s initial editor entry', name => {
  it.each([true, false])('opens an exact blank page before verification, only once (existing browser %s)', async existing => {
    const h = harness(name, 'about:blank', existing);
    await expect(h.execute()).rejects.toBe(stopBeforeInput);
    expect(h.state.navigateToBlogWrite).toHaveBeenCalledOnce();
    expect(h.events.indexOf('dialogs')).toBeLessThan(h.events.indexOf('navigate'));
    expect(h.events.indexOf('navigate')).toBeLessThan(h.events.indexOf('verify'));
    expect(h.events.indexOf('verify')).toBeLessThan(h.events.indexOf('frame'));
  });
  it.each(['https://blog.naver.com/test_account?Redirect=Write', 'https://www.naver.com/', 'about:blank#draft'])('verifies existing %s before normal fresh entry', async url => {
    const h = harness(name, url); await expect(h.execute()).rejects.toBe(stopBeforeInput);
    expect(h.events.indexOf('verify')).toBeLessThan(h.events.indexOf('navigate'));
    expect(h.state.navigateToBlogWrite).toHaveBeenCalledOnce();
  });
  it.each(['LOGIN_REQUIRED', 'LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED'])('preserves a blocking redirect: %s', async code => {
    const h = harness(name, 'about:blank'); const failure = new GuardError(code);
    h.state.navigateToBlogWrite.mockRejectedValue(failure);
    await expect(h.execute()).rejects.toBe(failure);
    expect(h.verify).not.toHaveBeenCalled(); expect(h.state.switchToMainFrame).not.toHaveBeenCalled();
  });
  it('stops before typing on account identity mismatch', async () => {
    const h = harness(name, 'about:blank'); const failure = new GuardError('ACCOUNT_MISMATCH');
    h.verify.mockRejectedValue(failure); await expect(h.execute()).rejects.toBe(failure);
    expect(h.state.navigateToBlogWrite).toHaveBeenCalledOnce(); expect(h.state.switchToMainFrame).not.toHaveBeenCalled();
  });
  it('honors cancellation during initial entry', async () => {
    const h = harness(name, 'about:blank'); h.state.navigateToBlogWrite.mockImplementation(async () => { h.state.cancelRequested = true; });
    await expect(h.execute()).rejects.toThrow('사용자가 자동화를 취소했습니다.');
    expect(h.verify).not.toHaveBeenCalled(); expect(h.state.switchToMainFrame).not.toHaveBeenCalled();
  });
  it('honors cancellation during account verification', async () => {
    const h = harness(name, 'about:blank'); h.verify.mockImplementation(async () => { h.state.cancelRequested = true; return true; });
    await expect(h.execute()).rejects.toThrow('사용자가 자동화를 취소했습니다.');
    expect(h.state.switchToMainFrame).not.toHaveBeenCalled();
  });
  it.each(['LOGIN_REQUIRED', 'LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED'])('never navigates an existing blocked page (%s)', async code => {
    const h = harness(name, 'https://nid.naver.com/nidlogin.login'); const failure = new GuardError(code);
    h.verify.mockRejectedValue(failure); await expect(h.execute()).rejects.toBe(failure);
    expect(h.state.navigateToBlogWrite).not.toHaveBeenCalled(); expect(h.state.switchToMainFrame).not.toHaveBeenCalled();
  });
  it.each(['entry', 'verification'])('stops if page closes during %s', async step => {
    const h = harness(name, 'about:blank');
    const close = () => { h.state.page.isClosed = () => true; };
    if (step === 'entry') h.state.navigateToBlogWrite.mockImplementation(async () => close());
    else h.verify.mockImplementation(async () => { close(); return true; });
    await expect(h.execute()).rejects.toMatchObject({ code: 'NETWORK_WAIT' });
    expect(h.state.switchToMainFrame).not.toHaveBeenCalled();
  });
  it.each(['entry', 'verification'])('stops if page changes during %s', async step => {
    const h = harness(name, 'about:blank');
    const replace = () => { h.state.page = { url: () => 'https://blog.naver.com/other', isClosed: () => false }; };
    if (step === 'entry') h.state.navigateToBlogWrite.mockImplementation(async () => replace());
    else h.verify.mockImplementation(async () => { replace(); return true; });
    await expect(h.execute()).rejects.toMatchObject({ code: 'NETWORK_WAIT' });
    expect(h.state.switchToMainFrame).not.toHaveBeenCalled();
  });
});
