// Agent CLI installer/login — full-auto setup driven from the app (user opted in).
//
// install: `npm i -g <pkg>` for the missing CLI.
// login:   `codex login` / `claude auth login --claudeai` — opens the browser OAuth flow and
//          exits once the user finishes signing in (subscription, not API key).
//
// No silent fallback: any failure throws a typed AgentCliError the UI surfaces verbatim.

import { spawnCollect } from './spawnHelper.js';
import { classifyExit } from './parse.js';
import { AgentCliError, type AgentProvider } from './types.js';
import { requireAgentProvider } from './validation.js';

/** Verified global npm package names (npm ls -g, 2026-06). */
export const AGENT_NPM_PACKAGES: Record<AgentProvider, string> = {
  codex: '@openai/codex',
  claude: '@anthropic-ai/claude-code',
};

// npm install can take a minute or two; the OAuth browser flow can take several.
const INSTALL_TIMEOUT_MS = 300_000;
const LOGIN_TIMEOUT_MS = 300_000;

/**
 * Install the CLI globally via npm and confirm it became reachable.
 * @throws AgentCliError on npm failure or if the binary is still missing afterwards.
 */
export async function installAgent(provider: AgentProvider): Promise<{ version?: string }> {
  provider = requireAgentProvider(provider);
  const pkg = AGENT_NPM_PACKAGES[provider];
  const res = await spawnCollect({
    command: 'npm',
    args: ['install', '-g', pkg],
    provider,
    timeoutMs: INSTALL_TIMEOUT_MS,
  });

  if (res.code !== 0) {
    throw new AgentCliError(
      classifyExit(provider, res.stderr, res.stdout),
      provider,
      `${provider} CLI 설치에 실패했습니다 (npm i -g ${pkg}). 권한 오류면 관리자 권한이 필요할 수 있습니다.`,
      (res.stderr || res.stdout || '').slice(0, 800),
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
    : { command: 'claude', args: ['auth', 'login', '--claudeai'] };
}

/**
 * Trigger the subscription login flow (opens the browser) and wait for completion.
 * @throws AgentCliError if login fails or times out.
 */
export async function loginAgent(provider: AgentProvider): Promise<void> {
  provider = requireAgentProvider(provider);
  const { command, args } = loginCommand(provider);
  const res = await spawnCollect({
    command,
    args,
    provider,
    timeoutMs: LOGIN_TIMEOUT_MS,
  });

  if (res.code !== 0) {
    throw new AgentCliError(
      classifyExit(provider, res.stderr, res.stdout),
      provider,
      `${provider} 로그인에 실패했거나 취소되었습니다. 브라우저에서 로그인을 완료했는지 확인해주세요.`,
      (res.stderr || res.stdout || '').slice(0, 800),
    );
  }
  const { clearAgentDetectionCache } = await import('./detect.js');
  clearAgentDetectionCache(provider);
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
export async function logoutAgent(provider: AgentProvider): Promise<void> {
  provider = requireAgentProvider(provider);
  const { command, args } = logoutCommand(provider);
  const res = await spawnCollect({ command, args, provider, timeoutMs: 60_000 });

  if (res.code !== 0) {
    throw new AgentCliError(
      classifyExit(provider, res.stderr, res.stdout),
      provider,
      `${provider} 로그아웃에 실패했습니다. 터미널에서 직접 실행이 필요할 수 있습니다 (codex logout / claude auth logout).`,
      (res.stderr || res.stdout || '').slice(0, 800),
    );
  }
  const { clearAgentDetectionCache } = await import('./detect.js');
  clearAgentDetectionCache(provider);
}
