// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastWarning = vi.hoisted(() => vi.fn());

vi.mock('../renderer/utils/uiManagers', () => ({
  toastManager: {
    success: toastSuccess,
    error: toastError,
    warning: toastWarning,
  },
}));

vi.mock('../renderer/utils/geminiPlanMemo', () => ({ rememberPlan: vi.fn() }));
vi.mock('../runtime/modelRegistry', () => ({
  normalizeGeminiTextModelId: (value: string) => value,
}));

import { refreshAgentStatusBadges } from '../renderer/modules/priceInfoModal';
import { runAgentLoginWithCodeFallback } from '../renderer/utils/agentLoginCodePrompt';

type Provider = 'codex' | 'claude';
type Progress = {
  readonly provider: Provider;
  readonly sessionId: string;
  readonly phase: 'manual-url-ready';
} | {
  readonly provider: Provider;
  readonly sessionId: string;
  readonly phase: 'code-required';
  readonly attempt: number;
};

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return Object.freeze({ promise, resolve });
}

function addProviderDom(provider: Provider): void {
  const status = document.createElement('div');
  status.id = `agent-${provider}-status`;
  document.body.appendChild(status);

  const actions = document.createElement('div');
  actions.id = `agent-${provider}-actions`;
  for (const action of ['install', 'login', 'switch'] as const) {
    const button = document.createElement('button');
    button.id = `agent-${provider}-${action}-btn`;
    button.textContent = action;
    actions.appendChild(button);
  }
  document.body.appendChild(actions);
}

function setApi(api: Record<string, unknown>): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: api,
  });
}

function clickBoundHandler(button: HTMLButtonElement): Promise<void> {
  const result = button.onclick?.(new MouseEvent('click'));
  return Promise.resolve(result as unknown as void);
}

afterEach(() => {
  document.body.textContent = '';
  Reflect.deleteProperty(window, 'api');
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('interactive Agent login code fallback', () => {
  it('opens automatically, retries safely, and re-enables code input for a new attempt', async () => {
    addProviderDom('codex');
    const loginResult = deferred<any>();
    let progressListener: ((progress: Progress) => void) | undefined;
    const unsubscribe = vi.fn();
    const agentLoginSubmitCode = vi.fn()
      .mockRejectedValueOnce(new Error('sensitive submit rejection'))
      .mockResolvedValueOnce({ success: false, code: 'stdin_busy', message: 'sensitive submit failure' })
      .mockResolvedValue({ success: true });
    const agentLoginOpenBrowser = vi.fn()
      .mockResolvedValueOnce({ success: false, code: 'open_failed', message: 'sensitive URL failure' })
      .mockResolvedValueOnce({ success: true, state: 'opened' });
    const agentStatus = vi.fn().mockResolvedValue({
      success: true,
      status: { installed: true, loggedIn: false, available: false },
    });
    setApi({
      agentStatus,
      agentLogin: vi.fn().mockReturnValue(loginResult.promise),
      agentLoginSubmitCode,
      agentLoginOpenBrowser,
      agentLoginCancel: vi.fn(),
      onAgentLoginProgress: vi.fn((listener: (progress: Progress) => void) => {
        progressListener = listener;
        return unsubscribe;
      }),
    });

    await refreshAgentStatusBadges({ providers: ['codex'] });
    const run = clickBoundHandler(document.querySelector('#agent-codex-login-btn')!);
    await vi.waitFor(() => expect(progressListener).toBeTypeOf('function'));

    progressListener?.(null as unknown as Progress);
    progressListener?.({ provider: 'codex', sessionId: 'wrong-phase', phase: 'url-required' } as unknown as Progress);
    progressListener?.({ provider: 'claude', sessionId: 'other-session', phase: 'code-required', attempt: 1 });
    expect(document.querySelector('[data-agent-login-code-prompt]')).toBeNull();
    progressListener?.({ provider: 'codex', sessionId: 'x'.repeat(129), phase: 'code-required', attempt: 1 });
    expect(document.querySelector('[data-agent-login-code-prompt]')).toBeNull();

    const rawOAuthUrl = 'https://example.invalid/oauth?secret=must-not-render';
    progressListener?.({
      provider: 'codex',
      sessionId: 'codex-session-1',
      phase: 'manual-url-ready',
      url: rawOAuthUrl,
    } as Progress & { url: string });

    const browserButton = document.querySelector('[data-agent-login-open-browser]') as HTMLButtonElement;
    expect(browserButton).not.toBeNull();
    await vi.waitFor(() => expect(agentLoginOpenBrowser).toHaveBeenCalledTimes(1));
    expect(agentLoginOpenBrowser).toHaveBeenLastCalledWith('codex', 'codex-session-1');
    expect(document.body.textContent).not.toContain(rawOAuthUrl);
    expect(browserButton.disabled).toBe(false);
    expect(browserButton.textContent).toContain('\uB2E4\uC2DC \uC5F4\uAE30');
    progressListener?.({ provider: 'codex', sessionId: 'codex-session-1', phase: 'manual-url-ready' });
    expect(agentLoginOpenBrowser).toHaveBeenCalledTimes(1);
    browserButton.click();
    await vi.waitFor(() => expect(agentLoginOpenBrowser).toHaveBeenCalledTimes(2));
    expect(agentLoginOpenBrowser).toHaveBeenLastCalledWith('codex', 'codex-session-1');
    expect(browserButton.disabled).toBe(false);
    expect(browserButton.textContent).toContain('\uB2E4\uC2DC \uC5F4\uAE30');
    expect(document.body.textContent).not.toContain('sensitive URL failure');
    browserButton.click();
    await vi.waitFor(() => expect(agentLoginOpenBrowser).toHaveBeenCalledTimes(3));

    progressListener?.({
      provider: 'codex',
      sessionId: 'codex-session-1',
      phase: 'code-required',
      attempt: 1,
    });

    const prompt = document.querySelector('[data-agent-login-code-prompt]');
    const input = prompt?.querySelector('input') as HTMLInputElement;
    const submit = prompt?.querySelector('[data-agent-login-code-submit]') as HTMLButtonElement;
    expect(prompt).not.toBeNull();
    expect(document.body.textContent).not.toContain(rawOAuthUrl);
    expect(prompt?.querySelector('a')).toBeNull();
    progressListener?.({ provider: 'codex', sessionId: 'codex-session-1', phase: 'code-required', attempt: 1 });
    progressListener?.({ provider: 'codex', sessionId: 'codex-session-other', phase: 'code-required', attempt: 2 });
    expect(document.querySelectorAll('[data-agent-login-code-prompt]')).toHaveLength(1);

    input.value = rawOAuthUrl;
    submit.click();
    expect(agentLoginSubmitCode).not.toHaveBeenCalled();
    expect(prompt?.textContent).toContain('\uB9C1\uD06C\uAC00 \uC544\uB2CC \uC778\uC99D \uCF54\uB4DC');

    input.value = 'REJECTED-CODE';
    submit.click();
    await vi.waitFor(() => expect(agentLoginSubmitCode).toHaveBeenCalledTimes(1));
    expect(submit.disabled).toBe(false);
    expect(document.body.textContent).not.toContain('sensitive submit rejection');

    input.value = 'BUSY-CODE';
    submit.click();
    await vi.waitFor(() => expect(agentLoginSubmitCode).toHaveBeenCalledTimes(2));
    expect(submit.disabled).toBe(false);
    expect(document.body.textContent).not.toContain('sensitive submit failure');

    input.value = 'FIRST-CODE';
    submit.click();
    await vi.waitFor(() => expect(agentLoginSubmitCode).toHaveBeenCalledTimes(3));
    expect(agentLoginSubmitCode).toHaveBeenLastCalledWith(
      'codex',
      'codex-session-1',
      1,
      'FIRST-CODE',
    );
    expect(document.querySelector('[data-agent-login-code-prompt]')).not.toBeNull();
    expect(submit.disabled).toBe(true);
    expect(input.disabled).toBe(true);
    expect(document.body.textContent).toContain('\uCF54\uB4DC \uD655\uC778 \uC911');

    progressListener?.({
      provider: 'codex',
      sessionId: 'codex-session-1',
      phase: 'code-required',
      attempt: 2,
    });
    expect(submit.disabled).toBe(false);
    expect(input.disabled).toBe(false);

    input.value = 'ABCD-EFGH';
    submit.click();
    await vi.waitFor(() => {
      expect(agentLoginSubmitCode).toHaveBeenCalledTimes(4);
      expect(agentLoginSubmitCode).toHaveBeenLastCalledWith('codex', 'codex-session-1', 2, 'ABCD-EFGH');
    });
    expect(input.value).toBe('');
    expect(document.querySelector('[data-agent-login-code-prompt]')).not.toBeNull();

    loginResult.resolve({
      success: true,
      status: { installed: true, loggedIn: true, available: true },
    });
    await run;

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-agent-login-code-prompt]')).toBeNull();
  });

  it('deduplicates repeated ready progress and concurrent retry clicks around automatic open', async () => {
    const mountElement = document.createElement('div');
    const statusElement = document.createElement('div');
    document.body.append(mountElement, statusElement);
    const loginResult = deferred<any>();
    const automaticOpen = deferred<any>();
    const retryOpen = deferred<any>();
    let progressListener: ((progress: Progress) => void) | undefined;
    const agentLoginOpenBrowser = vi.fn()
      .mockReturnValueOnce(automaticOpen.promise)
      .mockReturnValueOnce(retryOpen.promise);

    const run = runAgentLoginWithCodeFallback({
      provider: 'codex',
      mountElement,
      statusElement,
      api: {
        onAgentLoginProgress: (listener) => {
          progressListener = listener;
          return vi.fn();
        },
        agentLoginOpenBrowser,
      },
      startLogin: () => loginResult.promise,
    });
    await vi.waitFor(() => expect(progressListener).toBeTypeOf('function'));

    const ready = {
      provider: 'codex',
      sessionId: 'codex-auto-open-session',
      phase: 'manual-url-ready',
    } as const;
    progressListener?.(ready);
    progressListener?.(ready);

    await vi.waitFor(() => expect(agentLoginOpenBrowser).toHaveBeenCalledTimes(1));
    expect(agentLoginOpenBrowser).toHaveBeenCalledWith('codex', 'codex-auto-open-session');
    const browserButton = mountElement.querySelector(
      '[data-agent-login-open-browser]',
    ) as HTMLButtonElement;
    expect(browserButton.disabled).toBe(true);
    browserButton.click();
    expect(agentLoginOpenBrowser).toHaveBeenCalledTimes(1);

    automaticOpen.resolve({ success: true, state: 'opened' });
    await vi.waitFor(() => expect(browserButton.disabled).toBe(false));
    browserButton.click();
    browserButton.click();
    expect(agentLoginOpenBrowser).toHaveBeenCalledTimes(2);
    expect(browserButton.disabled).toBe(true);

    retryOpen.resolve({ success: true, state: 'opened' });
    await vi.waitFor(() => expect(browserButton.disabled).toBe(false));
    loginResult.resolve({ success: true });
    await run;
    expect(mountElement.querySelector('[data-agent-login-browser-prompt]')).toBeNull();
  });

  it('keeps cancellation controls usable when the cancel IPC rejects', async () => {
    addProviderDom('codex');
    const loginResult = deferred<any>();
    let progressListener: ((progress: Progress) => void) | undefined;
    const unsubscribe = vi.fn();
    const agentLoginCancel = vi.fn().mockRejectedValue(new Error('sensitive cancel failure'));
    const agentStatus = vi.fn().mockResolvedValue({
      success: true,
      status: { installed: true, loggedIn: false, available: false },
    });
    setApi({
      agentStatus,
      agentLogin: vi.fn().mockReturnValue(loginResult.promise),
      agentLoginSubmitCode: vi.fn(),
      agentLoginOpenBrowser: vi.fn(),
      agentLoginCancel,
      onAgentLoginProgress: vi.fn((listener: (progress: Progress) => void) => {
        progressListener = listener;
        return unsubscribe;
      }),
    });

    await refreshAgentStatusBadges({ providers: ['codex'] });
    const run = clickBoundHandler(document.querySelector('#agent-codex-login-btn')!);
    await vi.waitFor(() => expect(progressListener).toBeTypeOf('function'));
    progressListener?.({ provider: 'codex', sessionId: 'codex-session-2', phase: 'code-required', attempt: 1 });

    const cancel = document.querySelector('[data-agent-login-code-cancel]') as HTMLButtonElement;
    cancel.click();
    await vi.waitFor(() => expect(agentLoginCancel).toHaveBeenCalledOnce());
    await vi.waitFor(() => {
      expect(document.querySelector('[data-agent-login-code-prompt]')).not.toBeNull();
      expect(cancel.disabled).toBe(false);
    });
    expect(document.body.textContent).toContain('\uB85C\uADF8\uC778 \uCDE8\uC18C \uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4');
    expect(document.body.textContent).not.toContain('sensitive cancel failure');

    loginResult.resolve({ success: false, code: 'cancelled', message: 'Login cancelled.' });
    await run;
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-agent-login-code-prompt]')).toBeNull();
  });

  it('keeps the login result/error unchanged when the optional progress bridge is unavailable or cleanup throws', async () => {
    const mountElement = document.createElement('div');
    const statusElement = document.createElement('div');
    const value = await runAgentLoginWithCodeFallback({
      provider: 'codex',
      mountElement,
      statusElement,
      api: {},
      startLogin: async () => 42,
    });
    expect(value).toBe(42);

    const loginError = new Error('original login error');
    await expect(runAgentLoginWithCodeFallback({
      provider: 'claude',
      mountElement,
      statusElement,
      api: {
        onAgentLoginProgress: () => () => { throw new Error('cleanup error'); },
        agentLoginSubmitCode: vi.fn(),
        agentLoginOpenBrowser: vi.fn(),
        agentLoginCancel: vi.fn(),
      },
      startLogin: async () => { throw loginError; },
    })).rejects.toBe(loginError);
  });

  it('ignores manual and code progress when their optional action bridges are unavailable', async () => {
    const mountElement = document.createElement('div');
    const statusElement = document.createElement('div');
    let progressListener: ((progress: Progress) => void) | undefined;

    const withoutActions = await runAgentLoginWithCodeFallback({
      provider: 'codex',
      mountElement,
      statusElement,
      api: {
        onAgentLoginProgress: (listener) => {
          progressListener = listener;
          return vi.fn();
        },
      },
      startLogin: async () => {
        progressListener?.({ provider: 'codex', sessionId: 'no-actions', phase: 'manual-url-ready' });
        progressListener?.({ provider: 'codex', sessionId: 'no-actions', phase: 'code-required', attempt: 1 });
        return 1;
      },
    });
    expect(withoutActions).toBe(1);
    expect(mountElement.childElementCount).toBe(0);

    const withoutCancel = await runAgentLoginWithCodeFallback({
      provider: 'claude',
      mountElement,
      statusElement,
      api: {
        onAgentLoginProgress: (listener) => {
          progressListener = listener;
          return vi.fn();
        },
        agentLoginSubmitCode: vi.fn(),
      },
      startLogin: async () => {
        progressListener?.({ provider: 'claude', sessionId: 'no-cancel', phase: 'code-required', attempt: 1 });
        return 2;
      },
    });
    expect(withoutCancel).toBe(2);
    expect(mountElement.childElementCount).toBe(0);
  });

  it('supports cancellation during account-switch login and cleans up the code UI', async () => {
    addProviderDom('claude');
    vi.stubGlobal('confirm', vi.fn(() => true));
    const loginResult = deferred<any>();
    let progressListener: ((progress: Progress) => void) | undefined;
    const unsubscribe = vi.fn();
    const agentLoginCancel = vi.fn().mockResolvedValue({ success: true });
    const agentStatus = vi.fn().mockResolvedValue({
      success: true,
      status: { installed: true, loggedIn: true, available: true },
    });
    setApi({
      agentStatus,
      agentLogout: vi.fn().mockResolvedValue({ success: true }),
      agentLogin: vi.fn().mockReturnValue(loginResult.promise),
      agentLoginSubmitCode: vi.fn(),
      agentLoginOpenBrowser: vi.fn(),
      agentLoginCancel,
      onAgentLoginProgress: vi.fn((listener: (progress: Progress) => void) => {
        progressListener = listener;
        return unsubscribe;
      }),
    });

    await refreshAgentStatusBadges({ providers: ['claude'] });
    const run = clickBoundHandler(document.querySelector('#agent-claude-switch-btn')!);
    await vi.waitFor(() => expect(progressListener).toBeTypeOf('function'));

    progressListener?.({ provider: 'claude', sessionId: 'claude-session-1', phase: 'code-required', attempt: 1 });
    const cancel = document.querySelector('[data-agent-login-code-cancel]') as HTMLButtonElement;
    expect(cancel).not.toBeNull();
    cancel.click();
    await vi.waitFor(() => {
      expect(agentLoginCancel).toHaveBeenCalledWith('claude', 'claude-session-1');
    });

    loginResult.resolve({ success: false, code: 'cancelled', message: 'Login cancelled.' });
    await run;

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-agent-login-code-prompt]')).toBeNull();
  });

  it('exposes the progress, manual-open, submit, and cancel IPC bridge contract through preload', () => {
    const preload = readFileSync(resolve(process.cwd(), 'src', 'preload.ts'), 'utf8');

    expect(preload).toContain("ipcRenderer.on('agent:login-progress'");
    expect(preload).toContain("ipcRenderer.removeListener('agent:login-progress'");
    expect(preload).toContain("ipcRenderer.invoke('agent:login-open-browser', provider, sessionId)");
    expect(preload).toContain("ipcRenderer.invoke('agent:login-submit-code', provider, sessionId, attempt, code)");
    expect(preload).toContain("ipcRenderer.invoke('agent:login-cancel', provider, sessionId)");
  });
});
