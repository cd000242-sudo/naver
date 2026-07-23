// Agent CLI installer/login — full-auto setup driven from the app (user opted in).
//
// install: `npm i -g <pkg>` for the missing CLI.
// login:   `codex login` / `claude auth login` starts OAuth and reports its validated
//          manual URL to main; the renderer bridge opens it after the user's login action.
//
// No silent fallback: any failure throws a typed AgentCliError the UI surfaces verbatim.

import {
  spawnCollect,
  startSpawnSession,
  type SpawnWriteStatus,
} from './spawnHelper.js';
import { classifyExit } from './parse.js';
import {
  createAgentLoginCodePromptObserver,
  createAgentLoginUrlObserver,
} from './loginUrl.js';
import {
  buildClaudeSubscriptionEnv,
  buildCodexSubscriptionEnv,
  buildGeminiSubscriptionEnv,
} from './subscriptionEnv.js';
import { resolveNpmInvocation } from './npmInvocation.js';
import { AgentCliError, type AgentCliStatus, type AgentProvider } from './types.js';
import { requireAgentProvider } from './validation.js';
import { sanitizeUserVisibleError } from '../runtime/userVisibleError.js';

/** Verified global npm package names (npm ls -g, 2026-06). */
export const AGENT_NPM_PACKAGES: Readonly<Record<AgentProvider, string>> = Object.freeze({
  codex: '@openai/codex',
  claude: '@anthropic-ai/claude-code',
  gemini: '@google/gemini-cli',
});

/**
 * Release-reviewed versions; update deliberately after the agent regression suite passes.
 * [v2.11.138] gemini 0.16.1 was unpublished from npm → install always failed with
 * ETARGET(404), surfaced misleadingly as "권한 오류". Bumped to 0.51.0 (current
 * latest). gemini-cli publishes very frequently, so installAgent also falls back
 * to @latest when the pinned version 404s (see installAgent).
 */
export const AGENT_NPM_PACKAGE_VERSIONS: Readonly<Record<AgentProvider, string>> = Object.freeze({
  codex: '0.144.1',
  claude: '2.1.197',
  gemini: '0.51.0',
});

const OFFICIAL_NPM_REGISTRY = 'https://registry.npmjs.org/';

function packageScopeFor(provider: AgentProvider): string {
  if (provider === 'codex') return 'openai';
  if (provider === 'gemini') return 'google';
  return 'anthropic-ai';
}

interface NpmInstallArgOptions {
  readonly versionOverride?: string;
  /** App-owned global prefix; omitted only when userData is unavailable. */
  readonly prefix?: string;
  readonly cache?: string;
}

function buildNpmInstallArgs(
  provider: AgentProvider,
  options: NpmInstallArgOptions = {},
): string[] {
  const version = options.versionOverride || AGENT_NPM_PACKAGE_VERSIONS[provider];
  const packageSpec = `${AGENT_NPM_PACKAGES[provider]}@${version}`;
  const packageScope = packageScopeFor(provider);
  const emptyUserConfig = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return [
    'install',
    '-g',
    packageSpec,
    `--registry=${OFFICIAL_NPM_REGISTRY}`,
    `--@${packageScope}:registry=${OFFICIAL_NPM_REGISTRY}`,
    `--userconfig=${emptyUserConfig}`,
    '--audit=false',
    '--fund=false',
    // Install into a user-writable app folder: no elevation, and detection knows the path
    // without depending on the system PATH ever being updated.
    ...(options.prefix ? [`--prefix=${options.prefix}`] : []),
    ...(options.cache ? [`--cache=${options.cache}`] : []),
  ];
}

// npm install can take a minute or two; the OAuth browser flow can take several.
const INSTALL_TIMEOUT_MS = 300_000;
const LOGIN_TIMEOUT_MS = 300_000;

export interface AgentLoginHooks {
  /** Main-process-only URL handoff. Never log it or send it to the renderer. */
  readonly onLoginUrl?: (url: string) => void;
  readonly onSessionReady?: (controls: AgentLoginSessionControls) => void;
  readonly onCodeRequired?: (attempt: number) => void;
  readonly onSessionClosed?: () => void;
}

export interface AgentLoginSessionControls {
  readonly writeLine: (value: string) => Promise<SpawnWriteStatus>;
  readonly cancel: () => void;
}

function buildAgentCommandEnv(provider: AgentProvider): NodeJS.ProcessEnv {
  if (provider === 'codex') return buildCodexSubscriptionEnv();
  if (provider === 'gemini') return buildGeminiSubscriptionEnv();
  return buildClaudeSubscriptionEnv();
}

/**
 * Install the CLI globally via npm and confirm it became reachable.
 * @throws AgentCliError on npm failure or if the binary is still missing afterwards.
 */
export async function installAgent(provider: AgentProvider): Promise<{ version?: string }> {
  provider = requireAgentProvider(provider);
  const pkg = AGENT_NPM_PACKAGES[provider];
  const packageSpec = `${pkg}@${AGENT_NPM_PACKAGE_VERSIONS[provider]}`;

  // [v2.11.144] The user's Node.js is no longer required: the app drives a bootstrapped npm
  // on Electron's own Node runtime. Previously a PC without npm on PATH — stale logon env,
  // nvm/fnm shell-only PATH, portable Node — failed before npm ever ran.
  const npm = await resolveNpmInvocation();
  const installArgs = { prefix: npm.prefix, cache: npm.cache };
  let res = await spawnCollect({
    command: npm.command,
    args: [...npm.prefixArgs, ...buildNpmInstallArgs(provider, installArgs)],
    provider,
    timeoutMs: INSTALL_TIMEOUT_MS,
    env: npm.env,
  });

  // [v2.11.138] 핀한 버전이 npm에서 내려가면(ETARGET/404) @latest로 1회 폴백.
  // gemini-cli처럼 릴리스가 잦은 CLI에서 stale 핀이 설치를 영구 차단하던 문제 방지.
  const combinedOut = `${res.stderr || ''}\n${res.stdout || ''}`;
  const isVersionNotFound = /ETARGET|No matching version|E404|notarget/i.test(combinedOut);
  if (res.code !== 0 && isVersionNotFound) {
    console.warn(`[AgentInstaller] ${packageSpec} 버전 없음(ETARGET) → @latest로 폴백 설치 시도`);
    res = await spawnCollect({
      command: npm.command,
      args: [...npm.prefixArgs, ...buildNpmInstallArgs(provider, { ...installArgs, versionOverride: 'latest' })],
      provider,
      timeoutMs: INSTALL_TIMEOUT_MS,
      env: npm.env,
    });
  }

  if (res.code !== 0) {
    const out = `${res.stderr || ''}\n${res.stdout || ''}`;
    // 실제 실패 원인별로 안내를 분기 — 예전엔 무조건 "권한 오류"라 오도했다.
    const isPermission = /EACCES|EPERM|permission denied|access is denied|관리자/i.test(out);
    const isNetwork = /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|network|getaddrinfo/i.test(out);
    const isMissingNpm = /ENOENT|npm.*not found|is not recognized/i.test(out);
    // A bundled-runtime install cannot fail for lack of Node.js, so only the fallback path
    // may point at npm/Node — otherwise the advice would send users on a pointless install.
    const npmHint = npm.source === 'system'
      ? `설치 도구를 준비하지 못해 시스템 npm으로 시도했습니다 (${npm.bootstrapError ?? '원인 미상'}). 인터넷 연결을 확인한 뒤 다시 시도해주세요.`
      : '자세한 원인은 아래 상세 메시지를 확인하세요.';
    const hint = isPermission
      ? '권한 오류로 보입니다 — 백신/보안 프로그램이 설치 폴더 쓰기를 막고 있는지 확인해주세요.'
      : isNetwork
        ? '네트워크 오류로 보입니다 — 인터넷 연결/프록시를 확인하세요.'
        : isMissingNpm
          ? npmHint
          : '자세한 원인은 아래 상세 메시지를 확인하세요.';
    throw new AgentCliError(
      classifyExit(provider, res.stderr, res.stdout),
      provider,
      `${provider} CLI 설치에 실패했습니다 (npm i -g ${packageSpec}). ${hint}`,
      sanitizeUserVisibleError(res.stderr || res.stdout || ''),
    );
  }

  const { clearAgentDetectionCache, detectAgent } = await import('./detect.js');
  clearAgentDetectionCache(provider);
  const status = await detectAgent(provider);
  if (!status.installed) {
    throw new AgentCliError(
      'not_installed',
      provider,
      '설치는 끝났지만 CLI를 아직 찾지 못했습니다. 앱(또는 터미널)을 재시작한 뒤 다시 시도해주세요.',
    );
  }
  return { version: status.version };
}

/**
 * Login command per provider (subscription OAuth, opens the browser).
 * gemini-cli has no dedicated `login` subcommand: a bare invocation prompts for an auth
 * method and opens the Google OAuth browser flow on first run (same interactive-session
 * shape as codex/claude login, which this service already drives via startSpawnSession).
 */
function loginCommand(provider: AgentProvider): { command: string; args: string[] } {
  if (provider === 'codex') return { command: 'codex', args: ['login'] };
  if (provider === 'gemini') return { command: 'gemini', args: [] };
  return { command: 'claude', args: ['auth', 'login'] };
}

/**
 * Trigger the subscription login flow and wait for completion.
 * @throws AgentCliError if login fails or times out.
 */
export async function loginAgent(
  provider: AgentProvider,
  hooks: AgentLoginHooks = {},
): Promise<AgentCliStatus> {
  provider = requireAgentProvider(provider);
  const detection = await import('./detect.js');
  const existingStatus = await detection.detectAgent(provider, { forceRefresh: true }).catch(() => undefined);
  if (existingStatus?.loggedIn && existingStatus.available) {
    return Object.freeze({
      ...existingStatus,
      loginAction: 'already_authenticated' as const,
    });
  }
  // [v2.11.140] Gemini: select oauth-personal (Login with Google) via settings.json before
  // the login spawn. Without it the CLI errors "Please set an Auth method"; forcing GCA env
  // instead selected the Code Assist tier that returns IneligibleTierError for individuals.
  if (provider === 'gemini') {
    const { ensureGeminiOAuthPersonalConfig } = await import('./geminiAuthConfig.js');
    await ensureGeminiOAuthPersonalConfig();
  }
  const { command, args } = loginCommand(provider);
  const observeLoginUrl = createAgentLoginUrlObserver(provider, (url) => {
    try { hooks.onLoginUrl?.(url); } catch { /* progress handoff is best-effort */ }
  });
  const observeCodePrompt = createAgentLoginCodePromptObserver((attempt) => {
    try { hooks.onCodeRequired?.(attempt); } catch { /* renderer progress is best-effort */ }
  });
  // [v2.11.140] Gemini(GCA)는 브라우저 열기 전 "Do you want to continue? [Y/n]"으로 확인을
  // 받는데, 파이프 spawn(비-TTY)에는 사용자가 답할 터미널이 없다. 확인 프롬프트를 감지하면
  // 자동으로 "Y"를 stdin에 써서 gemini가 OAuth 브라우저를 열도록 한다. (gemini 전용)
  let geminiConfirmSent = false;
  let sessionWriteLine: ((value: string) => Promise<unknown>) | undefined;
  const observeGeminiBrowserConfirm = (chunk: string): void => {
    if (provider !== 'gemini' || geminiConfirmSent) return;
    if (!/do you want to continue|\[y\/n\]|authentication page in your browser/i.test(chunk)) return;
    geminiConfirmSent = true;
    try { void sessionWriteLine?.('Y'); } catch { /* stdin write is best-effort */ }
  };
  const observeLoginOutput = (chunk: string): void => {
    observeLoginUrl(chunk);
    observeCodePrompt(chunk);
    observeGeminiBrowserConfirm(chunk);
  };
  const session = startSpawnSession({
    command,
    args,
    provider,
    timeoutMs: LOGIN_TIMEOUT_MS,
    env: buildAgentCommandEnv(provider),
    onStdoutChunk: observeLoginOutput,
    onStderrChunk: observeLoginOutput,
  });
  sessionWriteLine = session.writeLine;
  try {
    hooks.onSessionReady?.(Object.freeze({
      writeLine: session.writeLine,
      cancel: session.cancel,
    }));
  } catch {
    // A UI listener must never break the underlying login session.
  }

  let res: Awaited<typeof session.result>;
  try {
    res = await session.result;
  } finally {
    try { hooks.onSessionClosed?.(); } catch { /* cleanup notification is best-effort */ }
  }

  if (res.code !== 0) {
    throw new AgentCliError(
      classifyExit(provider, res.stderr, res.stdout),
      provider,
      `${provider} 로그인에 실패했거나 취소되었습니다. 브라우저에서 로그인을 완료했는지 확인해주세요.`,
      sanitizeUserVisibleError(res.stderr || res.stdout || ''),
    );
  }
  detection.clearAgentDetectionCache(provider);
  const status = await detection.detectAgent(provider, { forceRefresh: true });
  if (!status.loggedIn) {
    throw new AgentCliError(
      status.errorCode ?? 'not_logged_in',
      provider,
      status.detail || `${provider} 구독 로그인 상태를 확인하지 못했습니다. 다시 로그인해주세요.`,
    );
  }
  return Object.freeze({ ...status, loginAction: 'authenticated' as const });
}

/** Logout command per provider (clears stored subscription auth). gemini has no CLI subcommand. */
function logoutCommand(provider: AgentProvider): { command: string; args: string[] } | undefined {
  if (provider === 'codex') return { command: 'codex', args: ['logout'] };
  if (provider === 'gemini') return undefined;
  return { command: 'claude', args: ['auth', 'logout'] };
}

/**
 * gemini-cli has no `logout` subcommand; the OAuth credential file it writes is the same
 * artifact probeGeminiLogin() reads, so removing it is the symmetric logout action.
 */
async function logoutGeminiCredentialFile(): Promise<void> {
  const { unlink } = await import('fs/promises');
  const { homedir } = await import('os');
  const { join } = await import('path');
  await unlink(join(homedir(), '.gemini', 'oauth_creds.json')).catch((err: NodeJS.ErrnoException) => {
    if (err?.code !== 'ENOENT') throw err;
  });
}

/**
 * Clear the stored subscription credentials so a different account can sign in.
 * @throws AgentCliError if logout fails.
 */
export async function logoutAgent(provider: AgentProvider): Promise<AgentCliStatus> {
  provider = requireAgentProvider(provider);
  const command = logoutCommand(provider);
  if (command) {
    const res = await spawnCollect({
      command: command.command,
      args: command.args,
      provider,
      timeoutMs: 60_000,
      env: buildAgentCommandEnv(provider),
    });

    if (res.code !== 0) {
      throw new AgentCliError(
        classifyExit(provider, res.stderr, res.stdout),
        provider,
        `${provider} 로그아웃에 실패했습니다. 터미널에서 직접 실행이 필요할 수 있습니다 (codex logout / claude auth logout).`,
        sanitizeUserVisibleError(res.stderr || res.stdout || ''),
      );
    }
  } else {
    try {
      await logoutGeminiCredentialFile();
    } catch (err) {
      throw new AgentCliError(
        'nonzero_exit',
        provider,
        `${provider} 로그아웃에 실패했습니다. 홈 폴더의 .gemini/oauth_creds.json 파일을 직접 삭제해주세요.`,
        sanitizeUserVisibleError((err as Error)?.message || ''),
      );
    }
  }
  const { clearAgentDetectionCache, detectAgent } = await import('./detect.js');
  clearAgentDetectionCache(provider);
  const status = await detectAgent(provider, { forceRefresh: true });
  if (!status.installed) {
    throw new AgentCliError(
      'not_installed',
      provider,
      `${provider} CLI logout postcondition could not be verified because the CLI is unavailable.`,
    );
  }
  if (status.loggedIn) {
    throw new AgentCliError(
      'nonzero_exit',
      provider,
      `${provider} logout command completed, but the previous account is still connected.`,
      status.detail,
    );
  }
  return status;
}
