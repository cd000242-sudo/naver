/**
 * Agent CLI installer/login — unit tests.
 *
 * Live execution (npm i -g / OAuth login) has side effects, so the spawn layer is mocked and
 * we assert the EXACT command + args. This guards the verified package names and login commands
 * (npm i -g @openai/codex · @anthropic-ai/claude-code · codex login · claude auth login).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const spawnMock = vi.fn();
const startSessionMock = vi.fn();
const sessionWriteLineMock = vi.fn();
const sessionCancelMock = vi.fn();
const detectAgentMock = vi.fn();
const clearAgentDetectionCacheMock = vi.fn();
vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
  startSpawnSession: (...args: unknown[]) => startSessionMock(...args),
}));
vi.mock('../agentCli/detect', () => ({
  clearAgentDetectionCache: (...args: unknown[]) => clearAgentDetectionCacheMock(...args),
  detectAgent: (...args: unknown[]) => detectAgentMock(...args),
}));

import {
  installAgent,
  loginAgent,
  logoutAgent,
  AGENT_NPM_PACKAGES,
  AGENT_NPM_PACKAGE_VERSIONS,
} from '../agentCli/installer';

beforeEach(() => {
  spawnMock.mockReset();
  startSessionMock.mockReset();
  sessionWriteLineMock.mockReset();
  sessionCancelMock.mockReset();
  detectAgentMock.mockReset();
  clearAgentDetectionCacheMock.mockReset();
  // Default: success with a version-like stdout (used by post-install detect()).
  spawnMock.mockResolvedValue({ code: 0, stdout: 'codex-cli 0.141.0', stderr: '' });
  startSessionMock.mockImplementation((options) => ({
    result: Promise.resolve(spawnMock(options)),
    writeLine: sessionWriteLineMock.mockResolvedValue('accepted'),
    closeInput: vi.fn(),
    cancel: sessionCancelMock,
  }));
  detectAgentMock.mockResolvedValue({
    provider: 'codex',
    installed: true,
    version: '0.141.0',
    loggedIn: true,
    available: true,
    detail: 'Logged in using ChatGPT',
  });
  process.env.NAVER_PASSWORD = 'must-not-reach-agent-cli';
  process.env.GEMINI_API_KEY = 'must-not-reach-agent-cli';
  process.env.NPM_CONFIG_PREFIX = 'C:\\Users\\tester\\npm-global';
});

afterEach(() => {
  delete process.env.NAVER_PASSWORD;
  delete process.env.GEMINI_API_KEY;
  delete process.env.NPM_CONFIG_PREFIX;
});

describe('AGENT_NPM_PACKAGES', () => {
  it('maps providers to verified npm package names', () => {
    expect(AGENT_NPM_PACKAGES.codex).toBe('@openai/codex');
    expect(AGENT_NPM_PACKAGES.claude).toBe('@anthropic-ai/claude-code');
    expect(AGENT_NPM_PACKAGES.gemini).toBe('@google/gemini-cli');
    expect(AGENT_NPM_PACKAGE_VERSIONS).toEqual({
      codex: '0.144.1',
      claude: '2.1.197',
      gemini: '0.16.1',
    });
  });
});

describe('installAgent', () => {
  it('runs `npm install -g <pkg>` and verifies the binary afterwards', async () => {
    const r = await installAgent('codex');
    const first = spawnMock.mock.calls[0][0];
    expect(first.command).toBe('npm');
    expect(first.args).toEqual([
      'install',
      '-g',
      '@openai/codex@0.144.1',
      '--registry=https://registry.npmjs.org/',
      '--@openai:registry=https://registry.npmjs.org/',
      `--userconfig=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
      '--audit=false',
      '--fund=false',
    ]);
    expect(r.version).toBeTruthy(); // detect() ran via the mocked spawn
  });

  it('uses the claude package for claude', async () => {
    await installAgent('claude');
    expect(spawnMock.mock.calls[0][0].args).toEqual([
      'install',
      '-g',
      '@anthropic-ai/claude-code@2.1.197',
      '--registry=https://registry.npmjs.org/',
      '--@anthropic-ai:registry=https://registry.npmjs.org/',
      `--userconfig=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
      '--audit=false',
      '--fund=false',
    ]);
  });

  it('uses the gemini package for gemini', async () => {
    await installAgent('gemini');
    expect(spawnMock.mock.calls[0][0].args).toEqual([
      'install',
      '-g',
      '@google/gemini-cli@0.16.1',
      '--registry=https://registry.npmjs.org/',
      '--@google:registry=https://registry.npmjs.org/',
      `--userconfig=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
      '--audit=false',
      '--fund=false',
    ]);
  });

  it('throws AgentCliError on npm failure', async () => {
    spawnMock.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'EACCES: permission denied' });
    await expect(installAgent('claude')).rejects.toMatchObject({ name: 'AgentCliError' });
  });

  it('rejects when npm succeeds but the installed CLI is still unavailable', async () => {
    detectAgentMock.mockResolvedValueOnce({
      provider: 'codex',
      installed: false,
      loggedIn: false,
      available: false,
      errorCode: 'not_installed',
    });

    await expect(installAgent('codex')).rejects.toMatchObject({
      name: 'AgentCliError',
      code: 'not_installed',
    });
  });
});

describe('loginAgent', () => {
  beforeEach(() => {
    detectAgentMock.mockReset();
    detectAgentMock
      .mockResolvedValueOnce({
        provider: 'codex',
        installed: true,
        loggedIn: false,
        available: false,
        errorCode: 'not_logged_in',
      })
      .mockResolvedValue({
        provider: 'codex',
        installed: true,
        version: '0.141.0',
        loggedIn: true,
        available: true,
        detail: 'Logged in using ChatGPT',
      });
  });

  it('returns an explicit already-authenticated result without starting OAuth', async () => {
    detectAgentMock.mockReset();
    detectAgentMock.mockResolvedValue({
      provider: 'codex',
      installed: true,
      version: '0.142.2',
      loggedIn: true,
      available: true,
      availabilityCheck: 'authentication',
      detail: 'Logged in using ChatGPT',
    });

    await expect(loginAgent('codex')).resolves.toMatchObject({
      loggedIn: true,
      available: true,
      loginAction: 'already_authenticated',
    });
    expect(startSessionMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('continues with OAuth when the preflight status check fails temporarily', async () => {
    detectAgentMock.mockReset();
    detectAgentMock
      .mockRejectedValueOnce(new Error('temporary status failure'))
      .mockResolvedValueOnce({
        provider: 'codex',
        installed: true,
        version: '0.142.2',
        loggedIn: true,
        available: true,
        detail: 'Logged in using ChatGPT',
      });

    await expect(loginAgent('codex')).resolves.toMatchObject({
      loggedIn: true,
      available: true,
      loginAction: 'authenticated',
    });
    expect(startSessionMock).toHaveBeenCalledOnce();
    expect(detectAgentMock).toHaveBeenCalledTimes(2);
  });

  it('codex → `codex login`', async () => {
    const status = await loginAgent('codex');
    const c = spawnMock.mock.calls[0][0];
    expect(c.command).toBe('codex');
    expect(c.args).toEqual(['login']);
    expect(status).toMatchObject({ loggedIn: true, available: true });
    expect(detectAgentMock).toHaveBeenCalledWith('codex', { forceRefresh: true });
  });

  it('claude → `claude auth login`', async () => {
    await loginAgent('claude');
    const c = spawnMock.mock.calls[0][0];
    expect(c.command).toBe('claude');
    expect(c.args).toEqual(['auth', 'login']);
  });

  it('gemini → bare `gemini` (no dedicated login subcommand)', async () => {
    await loginAgent('gemini');
    const c = spawnMock.mock.calls[0][0];
    expect(c.command).toBe('gemini');
    expect(c.args).toEqual([]);
  });

  it('keeps login stdin interactive and reports one validated browser URL without opening it', async () => {
    const onLoginUrl = vi.fn();
    spawnMock.mockImplementationOnce(async (options) => {
      options.onStderrChunk?.(
        'If your browser did not open: https://auth.openai.com/oauth/authorize?state=opaque',
      );
      return { code: 0, stdout: '', stderr: '' };
    });

    await loginAgent('codex', { onLoginUrl });

    expect(onLoginUrl).toHaveBeenCalledOnce();
    expect(onLoginUrl).toHaveBeenCalledWith(
      'https://auth.openai.com/oauth/authorize?state=opaque',
    );
  });

  it('never forwards a lookalike OAuth URL to the browser hook', async () => {
    const onLoginUrl = vi.fn();
    spawnMock.mockImplementationOnce(async (options) => {
      options.onStdoutChunk?.(
        'https://auth.openai.com.evil.example/oauth/authorize?state=stolen',
      );
      return { code: 0, stdout: '', stderr: '' };
    });

    await loginAgent('codex', { onLoginUrl });

    expect(onLoginUrl).not.toHaveBeenCalled();
  });

  it('exposes bounded interactive controls and signals an OAuth code prompt', async () => {
    const onSessionReady = vi.fn();
    const onCodeRequired = vi.fn();
    const onSessionClosed = vi.fn();
    spawnMock.mockImplementationOnce(async (options) => {
      options.onStdoutChunk?.('\u001b[33mPaste code here if prompted\u001b[0m');
      return { code: 0, stdout: '', stderr: '' };
    });

    await loginAgent('claude', {
      onSessionReady,
      onCodeRequired,
      onSessionClosed,
    });

    expect(onSessionReady).toHaveBeenCalledOnce();
    const controls = onSessionReady.mock.calls[0][0];
    await expect(controls.writeLine('one-time-code')).resolves.toBe('accepted');
    expect(sessionWriteLineMock).toHaveBeenCalledWith('one-time-code');
    controls.cancel();
    expect(sessionCancelMock).toHaveBeenCalledOnce();
    expect(onCodeRequired).toHaveBeenCalledWith(1);
    expect(onSessionClosed).toHaveBeenCalledOnce();
  });

  it('throws AgentCliError when login exits non-zero', async () => {
    spawnMock.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'login cancelled' });
    await expect(loginAgent('codex')).rejects.toMatchObject({ name: 'AgentCliError' });
  });

  it.each([
    { stdout: 'stdout-only failure', stderr: '', expected: 'stdout-only failure' },
    { stdout: '', stderr: '', expected: undefined },
  ])('sanitizes nonzero fallback output without assuming stderr exists', async ({
    stdout,
    stderr,
    expected,
  }) => {
    spawnMock.mockResolvedValueOnce({ code: 1, stdout, stderr });

    const error = await loginAgent('codex').catch((value) => value);

    if (expected) expect(error.detail).toContain(expected);
    else expect(error.detail).toBeTruthy();
  });

  it('redacts URL userinfo, query, and fragment from a nonzero login detail', async () => {
    spawnMock.mockResolvedValueOnce({
      code: 1,
      stdout: '',
      stderr: 'failed https://alice:secret@auth.openai.com/oauth/authorize?code=oauth-secret#state-secret',
    });

    const error = await loginAgent('codex').catch((value) => value);

    expect(error.detail).toContain('https://[redacted]@auth.openai.com/oauth/authorize');
    expect(error.detail).not.toContain('alice');
    expect(error.detail).not.toContain('secret');
    expect(error.detail).not.toContain('code=');
    expect(error.detail).not.toContain('#');
  });

  it('sanitizes the bounded CLI output before truncation can split a credential URL', async () => {
    const ansiPadding = '\u001b[31m'.repeat(150);
    spawnMock.mockResolvedValueOnce({
      code: 1,
      stdout: '',
      stderr: `${ansiPadding}https://alice:boundary-secret-that-must-never-leak@auth.openai.com/oauth/authorize?code=hidden`,
    });

    const error = await loginAgent('codex').catch((value) => value);

    expect(error.detail).toContain('https://[redacted]@auth.openai.com/oauth/authorize');
    expect(error.detail).not.toContain('alice');
    expect(error.detail).not.toContain('boundary-secret');
    expect(error.detail).not.toContain('code=');
  });

  it('keeps authentication success separate from temporary subscription availability', async () => {
    detectAgentMock.mockResolvedValueOnce({
      provider: 'claude',
      installed: true,
      loggedIn: true,
      available: false,
      errorCode: 'rate_limited',
      detail: '5-hour usage limit reached',
    });

    await expect(loginAgent('claude')).resolves.toMatchObject({
      loggedIn: true,
      available: false,
      errorCode: 'rate_limited',
    });
  });
});

describe('logoutAgent', () => {
  it('codex → `codex logout` and clears cached status', async () => {
    detectAgentMock.mockResolvedValueOnce({
      provider: 'codex',
      installed: true,
      loggedIn: false,
      available: false,
      errorCode: 'not_logged_in',
    });
    const status = await logoutAgent('codex');
    const c = spawnMock.mock.calls[0][0];
    expect(c.command).toBe('codex');
    expect(c.args).toEqual(['logout']);
    expect(clearAgentDetectionCacheMock).toHaveBeenCalledWith('codex');
    expect(detectAgentMock).toHaveBeenCalledWith('codex', { forceRefresh: true });
    expect(status).toMatchObject({ loggedIn: false });
  });

  it('claude → `claude auth logout`', async () => {
    detectAgentMock.mockResolvedValueOnce({
      provider: 'claude',
      installed: true,
      loggedIn: false,
      available: false,
      errorCode: 'not_logged_in',
    });
    await logoutAgent('claude');
    const c = spawnMock.mock.calls[0][0];
    expect(c.command).toBe('claude');
    expect(c.args).toEqual(['auth', 'logout']);
  });

  it('gemini → deletes the OAuth credential file (no dedicated CLI subcommand)', async () => {
    detectAgentMock.mockResolvedValueOnce({
      provider: 'gemini',
      installed: true,
      loggedIn: false,
      available: false,
      errorCode: 'not_logged_in',
    });
    const status = await logoutAgent('gemini');
    expect(spawnMock).not.toHaveBeenCalled();
    expect(clearAgentDetectionCacheMock).toHaveBeenCalledWith('gemini');
    expect(detectAgentMock).toHaveBeenCalledWith('gemini', { forceRefresh: true });
    expect(status).toMatchObject({ loggedIn: false });
  });

  it('throws AgentCliError when logout exits non-zero', async () => {
    spawnMock.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'logout failed' });
    await expect(logoutAgent('codex')).rejects.toMatchObject({ name: 'AgentCliError' });
  });

  it('rejects a false-success logout when the verified account is still logged in', async () => {
    await expect(logoutAgent('codex')).rejects.toMatchObject({
      name: 'AgentCliError',
      provider: 'codex',
    });
    expect(detectAgentMock).toHaveBeenCalledWith('codex', { forceRefresh: true });
  });
});

describe('agent CLI subprocess environment isolation', () => {
  it('does not forward application secrets to install, login, or logout commands', async () => {
    await installAgent('codex');
    const installCall = spawnMock.mock.calls[0][0];
    expect(installCall.env.NAVER_PASSWORD).toBeUndefined();
    expect(installCall.env.GEMINI_API_KEY).toBeUndefined();
    expect(installCall.env.NPM_CONFIG_PREFIX).toBe('C:\\Users\\tester\\npm-global');

    spawnMock.mockClear();
    detectAgentMock
      .mockResolvedValueOnce({
        provider: 'codex',
        installed: true,
        loggedIn: false,
        available: false,
        errorCode: 'not_logged_in',
      })
      .mockResolvedValueOnce({
        provider: 'codex',
        installed: true,
        loggedIn: true,
        available: true,
      });
    await loginAgent('codex');
    const loginCall = spawnMock.mock.calls[0][0];
    expect(loginCall.env.NAVER_PASSWORD).toBeUndefined();
    expect(loginCall.env.GEMINI_API_KEY).toBeUndefined();
    expect(loginCall.env.NPM_CONFIG_PREFIX).toBeUndefined();

    spawnMock.mockClear();
    detectAgentMock.mockResolvedValueOnce({
      provider: 'codex',
      installed: true,
      loggedIn: false,
      available: false,
      errorCode: 'not_logged_in',
    });
    await logoutAgent('codex');
    const logoutCall = spawnMock.mock.calls[0][0];
    expect(logoutCall.env.NAVER_PASSWORD).toBeUndefined();
    expect(logoutCall.env.GEMINI_API_KEY).toBeUndefined();
    expect(logoutCall.env.NPM_CONFIG_PREFIX).toBeUndefined();
  });
});
