import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<any>>());
const handleMock = vi.hoisted(() => vi.fn((channel: string, handler: (...args: any[]) => Promise<any>) => {
  handlers.set(channel, handler);
}));
const installAgentMock = vi.hoisted(() => vi.fn());
const loginAgentMock = vi.hoisted(() => vi.fn());
const logoutAgentMock = vi.hoisted(() => vi.fn());
const clearAgentDetectionCacheMock = vi.hoisted(() => vi.fn());
const openExternalMock = vi.hoisted(() => vi.fn());
const detectAgentMock = vi.hoisted(() => vi.fn());
const generateWithAgentMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  shell: { openExternal: openExternalMock },
}));
vi.mock('./mocks/electron', () => ({
  ipcMain: { handle: handleMock },
  shell: { openExternal: openExternalMock },
}));
vi.mock('../agentCli/installer', () => ({
  installAgent: installAgentMock,
  loginAgent: loginAgentMock,
  logoutAgent: logoutAgentMock,
}));
vi.mock('../agentCli/detect', () => ({
  clearAgentDetectionCache: clearAgentDetectionCacheMock,
}));
vi.mock('../agentCli/index', () => ({
  detectAgent: detectAgentMock,
  generateWithAgent: generateWithAgentMock,
}));

import { registerAgentHandlers } from '../main/ipc/agentHandlers';

const trustedRendererPath = resolve('test-renderer', 'index.html');

function ipcEvent(url = pathToFileURL(trustedRendererPath).toString()): any {
  const mainFrame = { url };
  return {
    senderFrame: mainFrame,
    sender: {
      id: 101,
      mainFrame,
      getURL: () => url,
      send: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      isDestroyed: () => false,
    },
  };
}

beforeEach(() => {
  handlers.clear();
  handleMock.mockClear();
  installAgentMock.mockReset();
  loginAgentMock.mockReset();
  logoutAgentMock.mockReset();
  clearAgentDetectionCacheMock.mockReset();
  openExternalMock.mockReset();
  detectAgentMock.mockReset();
  generateWithAgentMock.mockReset();
  openExternalMock.mockResolvedValue(undefined);
  registerAgentHandlers({ trustedRendererPath, allowClaudeSubscription: true });
});

describe('agent authentication IPC state handoff', () => {
  it('fails closed on every Claude subscription IPC boundary by default', async () => {
    registerAgentHandlers({ trustedRendererPath });
    const event = ipcEvent();

    await expect(handlers.get('agent:status')!(event, 'claude')).resolves.toEqual({
      success: true,
      status: {
        provider: 'claude',
        installed: false,
        loggedIn: false,
        available: false,
        errorCode: 'provider_disabled',
        detail: expect.stringContaining('Claude API 키'),
      },
    });

    const blockedMutations: ReadonlyArray<readonly [string, readonly unknown[]]> = [
      ['agent:install', [event, 'claude']],
      ['agent:login', [event, 'claude']],
      ['agent:login-open-browser', [event, 'claude', 'missing-session']],
      ['agent:login-submit-code', [event, 'claude', 'missing-session', 1, 'secret-code']],
      ['agent:login-cancel', [event, 'claude', 'missing-session']],
      ['agent:logout', [event, 'claude']],
      ['agent:generate', [event, { provider: 'claude', prompt: 'must never run' }]],
    ];
    for (const [channel, args] of blockedMutations) {
      const result = await handlers.get(channel)!(...args);
      expect(result).toMatchObject({
        success: false,
        code: 'provider_disabled',
        message: expect.stringContaining('Claude API 키'),
      });
    }

    expect(detectAgentMock).not.toHaveBeenCalled();
    expect(installAgentMock).not.toHaveBeenCalled();
    expect(loginAgentMock).not.toHaveBeenCalled();
    expect(logoutAgentMock).not.toHaveBeenCalled();
    expect(generateWithAgentMock).not.toHaveBeenCalled();
    expect(openExternalMock).not.toHaveBeenCalled();
    expect(event.sender.once).not.toHaveBeenCalled();
  });

  it('returns the exact verified login status without deleting its cache', async () => {
    const status = Object.freeze({
      provider: 'codex',
      installed: true,
      version: '0.141.0',
      loggedIn: true,
      available: true,
      detail: 'Logged in using ChatGPT',
    });
    loginAgentMock.mockResolvedValue(status);

    const result = await handlers.get('agent:login')!(ipcEvent(), 'codex');

    expect(result).toEqual({ success: true, status });
    expect(clearAgentDetectionCacheMock).not.toHaveBeenCalled();
  });

  it('recognizes an existing Codex login before starting another OAuth session', async () => {
    const status = Object.freeze({
      provider: 'codex',
      installed: true,
      version: 'Codex CLI 0.142.2',
      loggedIn: true,
      available: true,
      availabilityCheck: 'authentication',
      detail: 'Logged in using ChatGPT',
      loginAction: 'already_authenticated',
    });
    loginAgentMock.mockResolvedValue(status);
    const event = ipcEvent();

    const result = await handlers.get('agent:login')!(event, 'codex');

    expect(result).toEqual({
      success: true,
      status,
      authState: 'already_authenticated',
    });
    expect(loginAgentMock).toHaveBeenCalledOnce();
    expect(event.sender.once).toHaveBeenCalledWith('destroyed', expect.any(Function));
    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it('stores a streamed OAuth URL in main and opens it only after the owner explicitly clicks', async () => {
    const event = ipcEvent();
    const status = Object.freeze({
      provider: 'codex',
      installed: true,
      loggedIn: true,
      available: true,
    });
    let releaseLogin!: () => void;
    const loginGate = new Promise<void>((resolve) => { releaseLogin = resolve; });
    loginAgentMock.mockImplementation(async (_provider, hooks) => {
      hooks.onSessionReady({
        writeLine: vi.fn().mockResolvedValue('accepted'),
        cancel: vi.fn(),
      });
      hooks.onLoginUrl('https://auth.openai.com/oauth/authorize?state=opaque');
      await loginGate;
      hooks.onSessionClosed();
      return status;
    });

    const loginResult = handlers.get('agent:login')!(event, 'codex');
    await vi.waitFor(() => expect(event.sender.send).toHaveBeenCalledOnce());
    const progress = event.sender.send.mock.calls[0][1];
    expect(progress).toMatchObject({ provider: 'codex', phase: 'manual-url-ready' });
    expect(JSON.stringify(progress)).not.toContain('oauth/authorize');
    expect(JSON.stringify(progress)).not.toContain('opaque');
    expect(openExternalMock).not.toHaveBeenCalled();

    const wrongOwner = ipcEvent();
    wrongOwner.sender.id = 202;
    await expect(handlers.get('agent:login-open-browser')!(
      wrongOwner,
      'codex',
      progress.sessionId,
    )).resolves.toMatchObject({ success: false, code: 'invalid_session' });

    let releaseBrowser!: () => void;
    openExternalMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseBrowser = resolve;
    }));
    const firstOpenPromise = handlers.get('agent:login-open-browser')!(
      event,
      'codex',
      progress.sessionId,
    );
    await vi.waitFor(() => expect(openExternalMock).toHaveBeenCalledOnce());
    const whileOpening = await handlers.get('agent:login-open-browser')!(
      event,
      'codex',
      progress.sessionId,
    );
    releaseBrowser();
    const firstOpen = await firstOpenPromise;
    const secondOpen = await handlers.get('agent:login-open-browser')!(
      event,
      'codex',
      progress.sessionId,
    );

    expect(openExternalMock).toHaveBeenCalledTimes(2);
    expect(openExternalMock).toHaveBeenCalledWith(
      'https://auth.openai.com/oauth/authorize?state=opaque',
    );
    expect(firstOpen).toEqual({ success: true, state: 'opened' });
    expect(whileOpening).toEqual({ success: false, code: 'busy', state: 'opening' });
    expect(secondOpen).toEqual({ success: true, state: 'opened' });
    expect(JSON.stringify(firstOpen)).not.toContain('oauth/authorize');
    releaseLogin();
    await expect(loginResult).resolves.toEqual({ success: true, status });
  });

  it('defends the browser boundary against a lookalike URL even if an internal hook regresses', async () => {
    const status = Object.freeze({
      provider: 'codex',
      installed: true,
      loggedIn: true,
      available: true,
    });
    loginAgentMock.mockImplementation(async (_provider, hooks) => {
      hooks.onSessionReady({ writeLine: vi.fn(), cancel: vi.fn() });
      hooks.onLoginUrl('https://auth.openai.com.evil.example/oauth/authorize?state=stolen');
      return status;
    });

    const result = await handlers.get('agent:login')!(ipcEvent(), 'codex');

    expect(result).toEqual({ success: true, status });
    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it('returns a URL-free retry state when shell opening fails, then allows one retry', async () => {
    const event = ipcEvent();
    let releaseLogin!: () => void;
    const loginGate = new Promise<void>((resolve) => { releaseLogin = resolve; });
    loginAgentMock.mockImplementation(async (_provider, hooks) => {
      hooks.onSessionReady({ writeLine: vi.fn(), cancel: vi.fn() });
      hooks.onLoginUrl('https://auth.openai.com/oauth/authorize?state=never-cross-ipc');
      await loginGate;
      return { provider: 'codex', installed: true, loggedIn: true, available: true };
    });
    openExternalMock
      .mockRejectedValueOnce(new Error('failed URL https://auth.openai.com/oauth/authorize?state=leak'))
      .mockResolvedValueOnce(undefined);

    const loginResult = handlers.get('agent:login')!(event, 'codex');
    await vi.waitFor(() => expect(event.sender.send).toHaveBeenCalledOnce());
    const sessionId = event.sender.send.mock.calls[0][1].sessionId;

    const failed = await handlers.get('agent:login-open-browser')!(event, 'codex', sessionId);
    const retried = await handlers.get('agent:login-open-browser')!(event, 'codex', sessionId);

    expect(failed).toMatchObject({ success: false, code: 'open_failed', state: 'retryable' });
    expect(JSON.stringify(failed)).not.toContain('auth.openai.com');
    expect(JSON.stringify(failed)).not.toContain('leak');
    expect(retried).toEqual({ success: true, state: 'opened' });
    expect(openExternalMock).toHaveBeenCalledTimes(2);

    releaseLogin();
    await loginResult;
  });

  it('does not discard the post-install or post-logout state cache', async () => {
    installAgentMock.mockResolvedValue({ version: '0.141.0' });
    logoutAgentMock.mockResolvedValue(undefined);

    await handlers.get('agent:install')!(ipcEvent(), 'codex');
    await handlers.get('agent:logout')!(ipcEvent(), 'codex');

    expect(clearAgentDetectionCacheMock).not.toHaveBeenCalled();
  });

  it('rejects a subframe and a different local file before invoking auth code', async () => {
    const trusted = ipcEvent();
    const subframeEvent = {
      ...trusted,
      senderFrame: { url: trusted.senderFrame.url },
    };
    const otherFileEvent = ipcEvent(pathToFileURL(resolve('other-renderer', 'index.html')).toString());

    const subframeResult = await handlers.get('agent:login')!(subframeEvent, 'codex');
    const otherFileResult = await handlers.get('agent:login')!(otherFileEvent, 'codex');

    expect(subframeResult).toMatchObject({ success: false, code: 'untrusted_sender' });
    expect(otherFileResult).toMatchObject({ success: false, code: 'untrusted_sender' });
    expect(loginAgentMock).not.toHaveBeenCalled();
  });

  it('rejects a concurrent auth action for the same provider', async () => {
    const status = Object.freeze({
      provider: 'codex',
      installed: true,
      loggedIn: true,
      available: true,
    });
    let releaseLogin!: (value: typeof status) => void;
    const loginGate = new Promise((resolve) => {
      releaseLogin = resolve;
    });
    loginAgentMock.mockReturnValue(loginGate);

    const first = handlers.get('agent:login')!(ipcEvent(), 'codex');
    await vi.waitFor(() => expect(loginAgentMock).toHaveBeenCalledTimes(1));
    const second = handlers.get('agent:login')!(ipcEvent(), 'codex');
    await Promise.resolve();
    releaseLogin(status);

    await expect(second).resolves.toMatchObject({ success: false, code: 'busy' });
    await expect(first).resolves.toEqual({ success: true, status });
    expect(loginAgentMock).toHaveBeenCalledTimes(1);
  });

  it('redacts credentials from an auth failure before returning it over IPC', async () => {
    loginAgentMock.mockRejectedValue(new Error(
      'Proxy https://alice:s3cr3t@proxy.example failed; token=secret-token',
    ));

    const result = await handlers.get('agent:login')!(ipcEvent(), 'codex');

    expect(result).toMatchObject({ success: false });
    expect(result.message).not.toContain('s3cr3t');
    expect(result.message).not.toContain('secret-token');
    expect(result.message).toContain('[redacted]');
  });

  it('accepts an OAuth code only for the exact active renderer session', async () => {
    const event = ipcEvent();
    const writeLine = vi.fn().mockResolvedValue('accepted');
    const cancel = vi.fn();
    const status = Object.freeze({
      provider: 'claude',
      installed: true,
      loggedIn: true,
      available: true,
    });
    let releaseLogin!: () => void;
    const loginGate = new Promise<void>((resolve) => { releaseLogin = resolve; });
    loginAgentMock.mockImplementation(async (_provider, hooks) => {
      hooks.onSessionReady({ writeLine, cancel });
      hooks.onCodeRequired(1);
      await loginGate;
      hooks.onSessionClosed();
      return status;
    });

    const loginResult = handlers.get('agent:login')!(event, 'claude');
    await vi.waitFor(() => expect(event.sender.send).toHaveBeenCalledOnce());
    const [channel, progress] = event.sender.send.mock.calls[0];
    expect(channel).toBe('agent:login-progress');
    expect(progress).toMatchObject({ provider: 'claude', phase: 'code-required', attempt: 1 });
    expect(JSON.stringify(progress)).not.toContain('oauth/authorize');

    const submitResult = await handlers.get('agent:login-submit-code')!(
      event,
      'claude',
      progress.sessionId,
      1,
      '  one-time-code  ',
    );
    expect(submitResult).toEqual({ success: true });
    expect(writeLine).toHaveBeenCalledWith('one-time-code');

    const duplicateResult = await handlers.get('agent:login-submit-code')!(
      event,
      'claude',
      progress.sessionId,
      1,
      'duplicate-code',
    );
    expect(duplicateResult).toMatchObject({ success: false, code: 'attempt_already_submitted' });
    expect(writeLine).toHaveBeenCalledOnce();

    loginAgentMock.mock.calls[0][1].onCodeRequired(2);
    const retryProgress = event.sender.send.mock.calls[1][1];
    expect(retryProgress).toMatchObject({ attempt: 2 });
    const retryResult = await handlers.get('agent:login-submit-code')!(
      event,
      'claude',
      progress.sessionId,
      2,
      'second-code',
    );
    expect(retryResult).toEqual({ success: true });
    expect(writeLine).toHaveBeenCalledTimes(2);

    const invalidResult = await handlers.get('agent:login-submit-code')!(
      event,
      'claude',
      progress.sessionId,
      2,
      'code\nsecond-line',
    );
    expect(invalidResult).toMatchObject({ success: false, code: 'invalid_input' });
    expect(writeLine).toHaveBeenCalledTimes(2);

    const wrongRenderer = ipcEvent();
    wrongRenderer.sender.id = 202;
    const wrongSession = await handlers.get('agent:login-submit-code')!(
      wrongRenderer,
      'claude',
      progress.sessionId,
      2,
      'stolen-code',
    );
    expect(wrongSession).toMatchObject({ success: false });
    expect(writeLine).toHaveBeenCalledTimes(2);

    releaseLogin();
    await expect(loginResult).resolves.toEqual({ success: true, status });
  });

  it('does not consume a prompt attempt when bounded stdin is busy', async () => {
    const event = ipcEvent();
    const writeLine = vi.fn()
      .mockResolvedValueOnce('busy')
      .mockResolvedValueOnce('accepted');
    let releaseLogin!: () => void;
    const loginGate = new Promise<void>((resolve) => { releaseLogin = resolve; });
    loginAgentMock.mockImplementation(async (_provider, hooks) => {
      hooks.onSessionReady({ writeLine, cancel: vi.fn() });
      hooks.onCodeRequired(1);
      await loginGate;
      return { provider: 'claude', installed: true, loggedIn: true, available: true };
    });

    const loginResult = handlers.get('agent:login')!(event, 'claude');
    await vi.waitFor(() => expect(event.sender.send).toHaveBeenCalledOnce());
    const { sessionId } = event.sender.send.mock.calls[0][1];

    const busy = await handlers.get('agent:login-submit-code')!(
      event,
      'claude',
      sessionId,
      1,
      'first-code',
    );
    const retried = await handlers.get('agent:login-submit-code')!(
      event,
      'claude',
      sessionId,
      1,
      'second-code',
    );

    expect(busy).toMatchObject({ success: false, code: 'stdin_busy' });
    expect(retried).toEqual({ success: true });
    expect(writeLine).toHaveBeenCalledTimes(2);

    releaseLogin();
    await loginResult;
  });

  it('cancels only the exact active login session', async () => {
    const event = ipcEvent();
    const cancel = vi.fn();
    let releaseLogin!: () => void;
    const loginGate = new Promise<void>((resolve) => { releaseLogin = resolve; });
    loginAgentMock.mockImplementation(async (_provider, hooks) => {
      hooks.onSessionReady({ writeLine: vi.fn().mockResolvedValue('accepted'), cancel });
      hooks.onCodeRequired(1);
      await loginGate;
      return { provider: 'codex', installed: true, loggedIn: false, available: false };
    });

    const loginResult = handlers.get('agent:login')!(event, 'codex');
    await vi.waitFor(() => expect(event.sender.send).toHaveBeenCalledOnce());
    const sessionId = event.sender.send.mock.calls[0][1].sessionId;

    await expect(handlers.get('agent:login-cancel')!(event, 'codex', sessionId))
      .resolves.toEqual({ success: true });
    expect(cancel).toHaveBeenCalledOnce();

    releaseLogin();
    await loginResult;
  });

  it('registers renderer destruction before import and cancels controls that arrive after the race', async () => {
    const event = ipcEvent();
    let onDestroyed: (() => void) | undefined;
    event.sender.once.mockImplementation((name: string, listener: () => void) => {
      if (name === 'destroyed') onDestroyed = listener;
      return event.sender;
    });
    const cancel = vi.fn();
    loginAgentMock.mockImplementation(async (_provider, hooks) => {
      hooks.onSessionReady({ writeLine: vi.fn(), cancel });
      return { provider: 'codex', installed: true, loggedIn: false, available: false };
    });

    const result = handlers.get('agent:login')!(event, 'codex');
    expect(event.sender.once).toHaveBeenCalledWith('destroyed', expect.any(Function));
    onDestroyed?.();

    await result;
    expect(cancel).toHaveBeenCalledOnce();
    expect(event.sender.send).not.toHaveBeenCalled();
    expect(event.sender.removeListener).toHaveBeenCalledWith('destroyed', expect.any(Function));
  });
});
