import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { classifyBlogWriteNavigationUrl, isBlogWriteLoginRedirect, resolveBlogWriteFrameSwitchSurface } from '../automation/editorNavigationUrlPolicy.js';
import { isLoginChallengeUrl } from '../automation/loginPageNavigationPolicy.js';
import { waitForLoginRedirectToSettle, describeUrlForLog } from '../automation/editorEntryRecovery.js';
import { findReadyEditorFrame, EditorFrameProtectionError, InitialEditorReadinessError, waitForInitialEditorReadiness, INITIAL_EDITOR_READINESS_SCRIPT, isTrustedNaverEditorFrameUrl } from '../automation/initialEditorReadiness.js';
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
  const frame = { url: () => 'https://blog.naver.com/PostWriteForm.naver', evaluate: vi.fn(async (): Promise<string> => 'ready') };
  const page = { url: () => current, isClosed: () => false, frames: () => [frame],
    goto: vi.fn(async () => { current = 'https://blog.naver.com/test?Redirect=Write'; return { status: () => 200 }; }),
    waitForSelector: vi.fn(async () => undefined), waitForFunction: vi.fn(async () => { throw Error('Legacy cross-origin DOM access fails'); }) };
  const state: any = { page, browser: {}, options: { naverId: 'test' }, ensurePage: () => page,
    ensureNotCancelled: () => { if (state.cancelRequested) throw Error('cancelled'); },
    ensureDialogHandler: vi.fn(), revealTypingWindow: vi.fn(async () => undefined), resolveRunOptions: () => ({}), log: vi.fn(),
    switchToMainFrame: vi.fn(async () => { throw stop; }),
    // 진입 계약만 본다 — 재시작 1회 감싸개는 editorEntryRestart.test.ts 에서 따로 본다.
    enterEditorWithOneRestart: async (entry: (deferPause: boolean) => Promise<void>) => entry(false),
    delay: async () => undefined };
  const dependencies = { classifyBlogWriteNavigationUrl, isLoginChallengeUrl, AccountExecutionGuardError: GuardError,
    InitialEditorReadinessError, waitForInitialEditorReadiness: (page: any, options: any) => waitForInitialEditorReadiness(page, { ...options, timeoutMs: 40, pollIntervalMs: 1 }),
    getAccountExecutionGuard: () => ({ pause, getStatus: () => ({ paused: false }) }), NAVER_TIMEOUTS: { PAGE_LOAD: 30000 },
    browserSessionManager: { ensureServerSession: verify, markPublishing: vi.fn(), keepLoginAfterRun: vi.fn(async () => undefined) }, beginMainProcessEditorCommitCandidate: vi.fn(),
    waitForLoginRedirectToSettle: (target: any, options: any) => waitForLoginRedirectToSettle(target, { ...options, timeoutMs: 0 }), describeUrlForLog };
  state.pauseEntry = method('pauseEntry', dependencies);
  state.navigateToBlogWrite = method('navigateToBlogWrite', dependencies);
  const run = method('runPostOnlyInternal', dependencies);
  return { state, frame, page, pause, verify, stop, setUrl: (url: string) => { current = url; }, execute: () => run.call(state, {}), navigate: () => state.navigateToBlogWrite() };
}

describe('initial editor document readiness', () => {
  it('recognizes a nested cross-origin editor without reading iframe.contentDocument', async () => {
    const h = harness();
    await expect(h.navigate()).resolves.toBeUndefined();
    expect(h.frame.evaluate).toHaveBeenCalledWith(INITIAL_EDITOR_READINESS_SCRIPT);
    expect(h.page.waitForFunction).not.toHaveBeenCalled();
  });
  it('does not inspect identity until the frame editor content has rendered', async () => {
    const h = harness(); let ready!: (value: string) => void;
    h.frame.evaluate.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
    const pending = h.execute(); const outcome = expect(pending).rejects.toBe(h.stop);
    await vi.waitFor(() => expect(h.frame.evaluate).toHaveBeenCalledOnce(), { interval: 1 });
    expect(h.verify).not.toHaveBeenCalled();
    ready('ready'); await outcome; expect(h.verify).toHaveBeenCalledOnce(); expect(h.page.goto).toHaveBeenCalledOnce();
  });
  it('pauses on readiness timeout before the identity probe and records safe diagnostics', async () => {
    const h = harness(); h.frame.evaluate.mockRejectedValue(Error('secret URL with query token'));
    await expect(h.execute()).rejects.toMatchObject({ code: 'NETWORK_WAIT' });
    expect(h.pause).toHaveBeenCalledWith('test', 'NETWORK_WAIT'); expect(h.verify).not.toHaveBeenCalled();
    const logs = h.state.log.mock.calls.flat().join(' ');
    expect(logs).toContain('evaluationFailures=1'); expect(logs).not.toContain('secret');
  });
  it.each([['https://nid.naver.com/nidlogin.login', 'LOGIN_REQUIRED'], ['https://nid.naver.com/security', 'LOGIN_CHALLENGE'], ['https://nid.naver.com/user2/help/protect', 'LOGIN_CHALLENGE']])('stops a redirect while waiting: %s', async (url, code) => {
    const h = harness(); h.frame.evaluate.mockImplementation(async () => { h.setUrl(url); return 'ready'; });
    await expect(h.execute()).rejects.toMatchObject({ code }); expect(h.verify).not.toHaveBeenCalled();
    expect(h.pause).toHaveBeenCalledWith('test', code);
  });
  it('stops if cancelled during editor readiness', async () => {
    const h = harness(); h.frame.evaluate.mockImplementation(async () => { h.state.cancelRequested = true; return 'ready'; });
    await expect(h.execute()).rejects.toMatchObject({ code: 'NETWORK_WAIT' }); expect(h.verify).not.toHaveBeenCalled();
  });
});

describe('frame readiness probe', () => {
  const frame = (url: string, result = 'pending') => ({ url: () => url, evaluate: vi.fn(async () => result) });
  const page = (frames: any[]) => ({ url: () => 'https://blog.naver.com/test?Redirect=Write', isClosed: () => false, frames: () => frames }) as any;
  it('scans every nested frame independently, including different official origins', async () => {
    const frames = [frame('https://blog.naver.com/a'), frame('https://m.blog.naver.com/b'), frame('https://blog.naver.com/c', 'ready')];
    await expect(waitForInitialEditorReadiness(page(frames))).resolves.toBeUndefined();
    for (const entry of frames) expect(entry.evaluate).toHaveBeenCalledOnce();
  });
  it('does not accept editor evidence from an external frame', async () => {
    const external = frame('https://attacker.example/?url=https://blog.naver.com', 'ready');
    await expect(waitForInitialEditorReadiness(page([external]), { timeoutMs: 3, pollIntervalMs: 1 })).rejects.toBeInstanceOf(InitialEditorReadinessError);
    expect(external.evaluate).not.toHaveBeenCalled();
  });
  it('retries a navigation-detached frame and succeeds when the new document renders', async () => {
    const entry = frame('https://blog.naver.com/a');
    entry.evaluate.mockRejectedValueOnce(Error('Execution context destroyed')).mockResolvedValueOnce('ready');
    await expect(waitForInitialEditorReadiness(page([entry]), { timeoutMs: 100, pollIntervalMs: 1 })).resolves.toBeUndefined();
    expect(entry.evaluate).toHaveBeenCalledTimes(2);
  });
  it('releases a protection screen for the session guard to classify', async () => {
    await expect(waitForInitialEditorReadiness(page([frame('https://nid.naver.com/a', 'blocked')]))).resolves.toBeUndefined();
  });
  it('releases a top-level login redirect even before its document is loaded', async () => {
    const p = page([]); p.url = () => 'https://nid.naver.com/nidlogin.login';
    await expect(waitForInitialEditorReadiness(p)).resolves.toBeUndefined();
  });
  it('bounds a stuck frame evaluation by the same readiness deadline', async () => {
    const entry = frame('https://blog.naver.com/a');
    entry.evaluate.mockImplementation(() => new Promise(() => {}));
    await expect(waitForInitialEditorReadiness(page([entry]), { timeoutMs: 3 })).rejects.toBeInstanceOf(InitialEditorReadinessError);
  });
  it('stops if the page closes before a probe', async () => {
    const p = page([]); p.isClosed = () => true;
    await expect(waitForInitialEditorReadiness(p)).rejects.toThrow('Editor page closed');
  });
  it.each(['https://blog.naver.com:8443/a', 'https://user:pass@blog.naver.com/a', 'http://blog.naver.com/a', 'https://blog.naver.com.evil.example/a', 'https://evil.example/?url=blog.naver.com', 'about:blank', 'invalid'])('rejects untrusted frame URL %s', value => {
    expect(isTrustedNaverEditorFrameUrl(value)).toBe(false);
  });
  const probe = (selectors: string[], text = '') => new Function('document', `return ${INITIAL_EDITOR_READINESS_SCRIPT}`)({
    querySelector: (query: string) => query.split(',').some(selector => selectors.includes(selector.trim())) ? {} : null,
    body: { textContent: text },
  });
  it('requires an editor body and title or editable region, never just the iframe shell', () => {
    expect(probe([])).toBe('pending');
    expect(probe(['.se-main-container'])).toBe('pending');
    expect(probe(['.se-main-container', '.se-documentTitle'])).toBe('ready');
    expect(probe(['.se-main-container', '.se-section-documentTitle'])).toBe('ready');
  });
  it('gives protection evidence priority over editor markup', () => {
    expect(probe(['.se-main-container', '.se-documentTitle', 'input#captcha'])).toBe('blocked');
    expect(probe(['input[type="password"]', 'input#id'])).toBe('blocked');
    expect(probe([], '보호조치가 적용되었습니다')).toBe('blocked');
  });
});

describe('nested editor input frame selection', () => {
  it.each(['https://blog.naver.com/test?Redirect=Write', 'https://blog.naver.com/test'])('targets the nested editor instead of the mainFrame wrapper at %s', async (url) => {
    const makeFrame = (name: string, result: string) => ({
      url: () => 'https://blog.naver.com/' + name,
      evaluate: vi.fn(async () => result), waitForFunction: vi.fn(async () => undefined),
    });
    const wrapper = makeFrame('wrapper', 'pending');
    const editor = makeFrame('PostWriteForm.naver', 'ready');
    const page = { url: () => url, isClosed: () => false, frames: () => [wrapper, editor],
      waitForSelector: vi.fn(async () => ({ contentFrame: async () => wrapper })), goto: vi.fn() };
    const state: any = { ensurePage: () => page, ensureNotCancelled: vi.fn(), log: vi.fn(), delay: vi.fn(), options: { naverId: 'test' } };
    await method('switchToMainFrame', { isBlogWriteLoginRedirect, resolveBlogWriteFrameSwitchSurface, isLoginChallengeUrl, findReadyEditorFrame, EditorFrameProtectionError }).call(state);
    expect(state.mainFrame).toBe(editor);
    expect(page.goto).not.toHaveBeenCalled();
  });
});

describe('safe input frame selection', () => {
  const makeFrame = (url: string, state: string) => ({ url: () => url, evaluate: vi.fn(async () => state) });
  it('does not choose any input frame when protection and a ready editor coexist', async () => {
    const page = { url: () => 'https://blog.naver.com/test?Redirect=Write', isClosed: () => false, frames: () => [makeFrame('https://blog.naver.com/write', 'ready'), makeFrame('https://blog.naver.com/guard', 'blocked')] } as any;
    const stableFrames = page.frames(); page.frames = () => stableFrames;
    await expect(findReadyEditorFrame(page)).rejects.toBeInstanceOf(EditorFrameProtectionError);
  });
  it('does not choose login frame markup as an editor', async () => {
    const page = { url: () => 'https://blog.naver.com/test?Redirect=Write', isClosed: () => false, frames: () => [makeFrame('https://nid.naver.com/nidlogin.login', 'ready')] } as any;
    const stableFrames = page.frames(); page.frames = () => stableFrames;
    await expect(findReadyEditorFrame(page)).rejects.toBeInstanceOf(EditorFrameProtectionError);
  });
  it('returns no candidate for an empty wrapper or external ready frame', async () => {
    const page = { url: () => 'https://blog.naver.com/test?Redirect=Write', isClosed: () => false, frames: () => [makeFrame('https://blog.naver.com/wrapper', 'pending'), makeFrame('https://example.org/write', 'ready')] } as any;
    const stableFrames = page.frames(); page.frames = () => stableFrames;
    await expect(findReadyEditorFrame(page)).resolves.toBeNull();
  });
  it('does not accept a frame that navigates outside Naver during the probe', async () => {
    let url = 'https://blog.naver.com/write';
    const page = { url: () => 'https://blog.naver.com/test?Redirect=Write', isClosed: () => false, frames: () => [{ url: () => url, evaluate: async () => { url = 'https://example.org/write'; return 'ready'; } }] } as any;
    const stableFrames = page.frames(); page.frames = () => stableFrames;
    await expect(findReadyEditorFrame(page)).rejects.toThrow();
  });
  it('bounds selection when a frame evaluation never finishes', async () => {
    const page = { url: () => 'https://blog.naver.com/test?Redirect=Write', isClosed: () => false, frames: () => [{ url: () => 'https://blog.naver.com/write', evaluate: () => new Promise(() => {}) }] } as any;
    const stableFrames = page.frames(); page.frames = () => stableFrames;
    await expect(findReadyEditorFrame(page, 3)).rejects.toBeInstanceOf(InitialEditorReadinessError);
  });
  it('pauses frame switching if a protected document appears after readiness', async () => {
    const pause = vi.fn();
    const page = { url: () => 'https://blog.naver.com/test?Redirect=Write', isClosed: () => false,
      frames: () => [makeFrame('https://blog.naver.com/write', 'blocked')], goto: vi.fn() };
    const state: any = { ensurePage: () => page, ensureNotCancelled: vi.fn(), log: vi.fn(), delay: vi.fn(), options: { naverId: 'test' } };
    const stableFrames = page.frames(); page.frames = () => stableFrames;
    const switchFrame = method('switchToMainFrame', { isBlogWriteLoginRedirect, resolveBlogWriteFrameSwitchSurface,
      isLoginChallengeUrl, findReadyEditorFrame, EditorFrameProtectionError, AccountExecutionGuardError: GuardError,
      getAccountExecutionGuard: () => ({ pause }) });
    state.pauseEntry = method('pauseEntry', { getAccountExecutionGuard: () => ({ pause }) });
    await expect(switchFrame.call(state)).rejects.toMatchObject({ code: 'LOGIN_CHALLENGE' });
    expect(pause).toHaveBeenCalledWith('test', 'LOGIN_CHALLENGE');
    expect(state.mainFrame).toBeUndefined(); expect(page.goto).not.toHaveBeenCalled();
  });
});

describe('editor selection evidence stability', () => {
  const official = 'https://blog.naver.com/test?Redirect=Write';
  const pageFor = (frames: any[], url = official) => ({ frames: () => frames, url: () => url, isClosed: () => false }) as any;
  it('rejects ready evidence after a same-host account URL changes', async () => {
    let url = 'https://blog.naver.com/PostWriteForm.naver?blogId=first';
    const frame = { url: () => url, evaluate: async () => { url = 'https://blog.naver.com/PostWriteForm.naver?blogId=second'; return 'ready'; } };
    await expect(findReadyEditorFrame(pageFor([frame]))).rejects.toThrow();
  });
  it('rejects a detached ready frame', async () => {
    let frames: any[];
    const frame = { url: () => official, evaluate: async () => { frames = []; return 'ready'; } };
    frames = [frame];
    await expect(findReadyEditorFrame({ frames: () => frames, url: () => official, isClosed: () => false } as any)).rejects.toThrow();
  });
  it('rejects external top documents even with an official ready iframe', async () => {
    const frame = { url: () => official, evaluate: async () => 'ready' };
    await expect(findReadyEditorFrame(pageFor([frame], 'https://example.org'))).rejects.toThrow();
  });
  it('rejects incomplete protection evidence when one official frame cannot be evaluated', async () => {
    const frames = [{ url: () => official, evaluate: async () => 'ready' },
      { url: () => 'https://blog.naver.com/protected', evaluate: async () => { throw Error('unreadable'); } }];
    await expect(findReadyEditorFrame(pageFor(frames))).rejects.toThrow();
  });
  it('does not treat authored article text as a protection page', () => {
    const probe = new Function('document', `return ${INITIAL_EDITOR_READINESS_SCRIPT}`);
    const document = { querySelector: (query: string) => ['.se-main-container', '.se-documentTitle'].some(selector => query.split(',').map(x => x.trim()).includes(selector)) ? {} : null,
      body: { textContent: '앱 이용이 제한되는 경우 본인 확인이 필요합니다. 이 내용을 설명합니다.' } };
    expect(probe(document)).toBe('ready');
  });
});
