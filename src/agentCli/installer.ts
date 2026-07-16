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
  buildNpmInstallEnv,
} from './subscriptionEnv.js';
import { AgentCliError, type AgentCliStatus, type AgentProvider } from './types.js';
import { requireAgentProvider } from './validation.js';
import { sanitizeUserVisibleError } from '../runtime/userVisibleError.js';

/** Verified global npm package names (npm ls -g, 2026-06). */
export const AGENT_NPM_PACKAGES: Readonly<Record<AgentProvider, string>> = Object.freeze({
  codex: '@openai/codex',
  claude: '@anthropic-ai/claude-code',
});

/** Release-reviewed versions; update deliberately after the agent regression suite passes. */
export const AGENT_NPM_PACKAGE_VERSIONS: Readonly<Record<AgentProvider, string>> = Object.freeze({
  codex: '0.144.1',
  claude: '2.1.197',
});

const OFFICIAL_NPM_REGISTRY = 'https://registry.npmjs.org/';

function buildNpmInstallArgs(provider: AgentProvider): string[] {
  const packageSpec = `${AGENT_NPM_PACKAGES[provider]}@${AGENT_NPM_PACKAGE_VERSIONS[provider]}`;
  const packageScope = provider === 'codex' ? 'openai' : 'anthropic-ai';
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
  return provider === 'codex'
    ? buildCodexSubscriptionEnv()
    : buildClaudeSubscriptionEnv();
}

/**
 * Install the CLI globally via npm and confirm it became reachable.
 * @throws AgentCliError on npm failure or if the binary is still missing afterwards.
 */
export async function installAgent(provider: AgentProvider): Promise<{ version?: string }> {
  provider = requireAgentProvider(provider);
  const pkg = AGENT_NPM_PACKAGES[provider];
  const packageSpec = `${pkg}@${AGENT_NPM_PACKAGE_VERSIONS[provider]}`;
  const res = await spawnCollect({
    command: 'npm',
    args: buildNpmInstallArgs(provider),
    provider,
    timeoutMs: INSTALL_TIMEOUT_MS,
    env: buildNpmInstallEnv(),
  });

  if (res.code !== 0) {
    throw new AgentCliError(
      classifyExit(provider, res.stderr, res.stdout),
      provider,
      `${provider} CLI 설치에 실패했습니다 (npm i -g ${packageSpec}). 권한 오류면 관리자 권한이 필요할 수 있습니다.`,
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

/** Login command per provider (subscription OAuth, opens the browser). */
function loginCommand(provider: AgentProvider): { command: string; args: string[] } {
  return provider === 'codex'
    ? { command: 'codex', args: ['login'] }
    : { command: 'claude', args: ['auth', 'login'] };
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
  const { command, args } = loginCommand(provider);
  const observeLoginUrl = createAgentLoginUrlObserver(provider, (url) => {
    try { hooks.onLoginUrl?.(url); } catch { /* progress handoff is best-effort */ }
  });
  const observeCodePrompt = createAgentLoginCodePromptObserver((attempt) => {
    try { hooks.onCodeRequired?.(attempt); } catch { /* renderer progress is best-effort */ }
  });
  const observeLoginOutput = (chunk: string): void => {
    observeLoginUrl(chunk);
    observeCodePrompt(chunk);
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

/** Logout command per provider (clears stored subscription auth). */
function logoutCommand(provider: AgentProvider): { command: string; args: string[] } {
  return provider === 'codex'
    ? { command: 'codex', args: ['logout'] }
    : { command: 'claude', args: ['auth', 'logout'] };
}

/**
 * Clear the stored subscription credentials so a different account can sign in.
 * @throws AgentCliError if logout fails.
 */
export async function logoutAgent(provider: AgentProvider): Promise<AgentCliStatus> {
  provider = requireAgentProvider(provider);
  const { command, args } = logoutCommand(provider);
  const res = await spawnCollect({
    command,
    args,
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
