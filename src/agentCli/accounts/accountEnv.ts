// The single place that turns "which saved account" into the environment variable a CLI reads.
//
//   Codex        -> CODEX_HOME        (verified: `codex doctor` reports the folder it was given)
//   Claude Code  -> CLAUDE_CONFIG_DIR (verified: `claude auth status` reports the folder it was given)
//   Antigravity  -> nothing: agy keeps one login in a fixed OS-keyring entry, so it has no folder to point at.
//
// The default account is left alone on purpose: the environment is returned untouched, so a
// CODEX_HOME / CLAUDE_CONFIG_DIR the user set themselves keeps working exactly as before.
import {
  DEFAULT_ACCOUNT_ID,
  getActiveAgentAccountId,
  getAgentAccountDir,
  hasAgentAccount,
  type AccountScopedProvider,
} from './accountRegistry.js';

const ACCOUNT_ENV_KEY: Readonly<Record<AccountScopedProvider, string>> = Object.freeze({
  codex: 'CODEX_HOME',
  claude: 'CLAUDE_CONFIG_DIR',
});

/**
 * Return a copy of env that runs the CLI as the requested account.
 * Without an explicit account the currently active one is used.
 * @throws when an explicit account is not saved: never quietly run as a different account.
 */
export function applyAgentAccountEnv(
  provider: AccountScopedProvider,
  env: NodeJS.ProcessEnv,
  accountId?: string,
): NodeJS.ProcessEnv {
  const target = accountId ?? getActiveAgentAccountId(provider);
  if (!hasAgentAccount(provider, target)) {
    throw new Error('저장되지 않은 계정으로는 실행할 수 없습니다.');
  }
  if (target === DEFAULT_ACCOUNT_ID) return env;
  const key = ACCOUNT_ENV_KEY[provider];
  // Windows treats variable names case-insensitively: drop any differently-cased twin first.
  const rest = Object.fromEntries(Object.entries(env).filter(([name]) => name.toUpperCase() !== key));
  return { ...rest, [key]: getAgentAccountDir(provider, target) };
}
