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
// The real resolver bootstraps npm over the network; unit tests assert the wiring only.
const resolveNpmInvocationMock = vi.fn();
vi.mock('../agentCli/npmInvocation', () => ({
  resolveNpmInvocation: (...args: unknown[]) => resolveNpmInvocationMock(...args),
}));

const APP_NODE = 'C:\\Program Files\\LeaderNaver\\LeaderNaver.exe';
const BUNDLED_NPM_CLI = 'C:\\userData\\agent-runtime\\npm\\bin\\npm-cli.js';
const MANAGED_PREFIX = 'C:\\userData\\agent-runtime\\global';
const MANAGED_CACHE = 'C:\\userData\\agent-runtime\\npm-cache';
const BUNDLED_INVOCATION = {
  command: APP_NODE,
  prefixArgs: [BUNDLED_NPM_CLI],
  env: { Path: MANAGED_PREFIX, ELECTRON_RUN_AS_NODE: '1' },
  source: 'bundled' as const,
  prefix: MANAGED_PREFIX,
  cache: MANAGED_CACHE,
};

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
  resolveNpmInvocationMock.mockReset();
  resolveNpmInvocationMock.mockResolvedValue(BUNDLED_INVOCATION);
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
      gemini: '0.51.0',
    });
  });
});

const emptyUserConfig = process.platform === 'win32' ? 'NUL' : '/dev/null';

/** npm arguments for a package, as the bundled runtime must pass them. */
function expectedNpmArgs(spec: string, scope: string): string[] {
  return [
    'install',
    '-g',
    spec,
    '--registry=https://registry.npmjs.org/',
    `--@${scope}:registry=https://registry.npmjs.org/`,
    `--userconfig=${emptyUserConfig}`,
    '--audit=false',
    '--fund=false',
    `--prefix=${MANAGED_PREFIX}`,
    `--cache=${MANAGED_CACHE}`,
  ];
}

describe('installAgent', () => {
  it('runs npm on the app runtime, never a PATH-resolved npm', async () => {
    const r = await installAgent('codex');
    const first = spawnMock.mock.calls[0][0];
    // The whole point: a PC with no Node.js on PATH must still install.
    expect(first.command).toBe(APP_NODE);
    expect(first.args).toEqual([
      BUNDLED_NPM_CLI,
      ...expectedNpmArgs('@openai/codex@0.144.1', 'openai'),
    ]);
    expect(first.env).toBe(BUNDLED_INVOCATION.env);
    expect(r.version).toBeTruthy(); // detect() ran via the mocked spawn
  });

  it('installs into the app-owned prefix so no elevation is needed', async () => {
    await installAgent('codex');
    expect(spawnMock.mock.calls[0][0].args).toContain(`--prefix=${MANAGED_PREFIX}`);
  });

  it('uses the claude package for claude', async () => {
    await installAgent('claude');
    expect(spawnMock.mock.calls[0][0].args).toEqual([
      BUNDLED_NPM_CLI,
      ...expectedNpmArgs('@anthropic-ai/claude-code@2.1.197', 'anthropic-ai'),
    ]);
  });

  it('uses the gemini package for gemini', async () => {
    await installAgent('gemini');
    expect(spawnMock.mock.calls[0][0].args).toEqual([
      BUNDLED_NPM_CLI,
      ...expectedNpmArgs('@google/gemini-cli@0.51.0', 'google'),
    ]);
  });

  it('falls back to the system npm when the runtime bootstrap fails', async () => {
    resolveNpmInvocationMock.mockResolvedValue({
      command: 'npm',
      prefixArgs: [],
      env: {},
      source: 'system',
      prefix: MANAGED_PREFIX,
      cache: MANAGED_CACHE,
      bootstrapError: 'HTTP 503',
    });
    await installAgent('codex');
    expect(spawnMock.mock.calls[0][0].command).toBe('npm');
  });

  // A blocked registry made the fallback throw the SAME text the fix removed, so users
  // reported "그대로예요" and support could not tell a stale app from a blocked download.
  it('names the blocked download instead of repeating the old PATH message', async () => {
    resolveNpmInvocationMock.mockResolvedValue({
      command: 'npm',
      prefixArgs: [],
      env: {},
      source: 'system',
      bootstrapError: 'fetch failed: ENOTFOUND registry.npmjs.org',
    });
    const { AgentCliError } = await import('../agentCli/types');
    spawnMock.mockRejectedValue(
      new AgentCliError('not_installed', 'codex', 'npm CLI를 허용된 PATH에서 찾을 수 없습니다. 설치 여부를 확인해주세요.'),
    );

    const err = await installAgent('codex').catch((e) => e);
    expect(err.code).toBe('not_installed');
    expect(err.message).not.toContain('허용된 PATH');
    expect(err.message).toContain('registry.npmjs.org');
    expect(err.detail).toContain('ENOTFOUND');
  });

  it('leaves an unrelated launch failure untouched on the bundled path', async () => {
    const { AgentCliError } = await import('../agentCli/types');
    spawnMock.mockRejectedValue(new AgentCliError('spawn_failed', 'codex', '프로세스 실행 실패: EACCES'));
    const err = await installAgent('codex').catch((e) => e);
    expect(err.code).toBe('spawn_failed');
    expect(err.message).toContain('프로세스 실행 실패');
  });

  it('never blames a missing Node.js when the app runtime ran the install', async () => {
    spawnMock.mockResolvedValue({ code: 1, stdout: '', stderr: "'npm' is not recognized" });
    const err = await installAgent('codex').catch((e) => e);
    expect(String(err.message)).not.toContain('Node.js LTS');
  });

  it('throws AgentCliError on npm failure', async () => {
    spawnMock.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'EACCES: permission denied' });
    await expect(installAgent('claude')).rejects.toMatchObject({ name: 'AgentCliError' });
  });

  // [v2.11.138] 핀 버전이 npm에서 내려가면(ETARGET) @latest로 폴백 후 성공.
  it('falls back to @latest when the pinned version is unpublished (ETARGET)', async () => {
    spawnMock
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'npm error code ETARGET\nNo matching version found for @google/gemini-cli@0.51.0' })
      .mockResolvedValueOnce({ code: 0, stdout: 'gemini 0.52.0', stderr: '' });
    detectAgentMock.mockResolvedValueOnce({ provider: 'gemini', installed: true, version: '0.52.0', loggedIn: false, available: false });

    await expect(installAgent('gemini')).resolves.toMatchObject({ version: '0.52.0' });
    // 2번째 호출은 @latest 스펙이어야 한다.
    expect(spawnMock.mock.calls[1][0].args).toContain('@google/gemini-cli@latest');
  });

  it('version-not-found 실패 메시지는 권한 오류로 오도하지 않는다', async () => {
    // 폴백까지 실패(계속 ETARGET) → 최종 에러 메시지가 "권한"을 단정하지 않아야
    spawnMock.mockResolvedValue({ code: 1, stdout: '', stderr: 'npm error code ETARGET No matching version' });
    await expect(installAgent('gemini')).rejects.toMatchObject({ name: 'AgentCliError' });
    const err = await installAgent('gemini').catch((e) => e);
    expect(String(err.message)).not.toContain('관리자 권한이 필요');
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
    // The install env is built by resolveNpmInvocation (allowlist + app-owned prefix);
    // its contents are asserted against the real implementation in agentNpmInvocation.test.ts.

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
