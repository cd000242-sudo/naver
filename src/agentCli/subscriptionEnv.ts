// Subscription agents run outside the Electron process. Pass only operating-system
// values needed to locate the executable, user profile, cached login, and TLS roots.
// Every application secret is denied by default, including future variables that this
// module does not know about yet.
//
// [v2.11.144] CLIs installed by the app live in an app-owned prefix under userData that is
// deliberately never written into the system PATH. withAgentRuntimePath() prepends it, which
// is what lets detect/login/generate find them; the inherited PATH still follows, so a CLI the
// user installed globally themselves keeps resolving exactly as before.
import { getAgyInstallDirs, withAgentRuntimePath, withPathEntries } from './agentRuntime.js';

const SHARED_SUBSCRIPTION_ENV_KEYS = new Set([
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'SYSTEMDRIVE',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMW6432',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'SHELL',
  'ELECTRON_RUN_AS_NODE',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  // Keep standard OS network routing. Provider credentials and custom API/base URL
  // variables remain denied because this module is allowlist-only.
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
]);

const CLAUDE_SUBSCRIPTION_ENV_KEYS = new Set([
  ...SHARED_SUBSCRIPTION_ENV_KEYS,
  'CLAUDE_CONFIG_DIR',
]);

const CODEX_SUBSCRIPTION_ENV_KEYS = new Set([
  ...SHARED_SUBSCRIPTION_ENV_KEYS,
  'CODEX_HOME',
]);

// Allowlist-only: GEMINI_API_KEY / GOOGLE_API_KEY / GOOGLE_GENAI_API_KEY are deliberately
// absent so the subprocess cannot silently fall back to API-key billing instead of the
// user's OAuth-backed subscription (Antigravity/Gemini CLI login).
const GEMINI_SUBSCRIPTION_ENV_KEYS = new Set([
  ...SHARED_SUBSCRIPTION_ENV_KEYS,
]);

const NPM_INSTALL_ENV_KEYS = new Set([
  ...SHARED_SUBSCRIPTION_ENV_KEYS,
  // Preserve the user's chosen global install location without forwarding npm
  // registry credentials or arbitrary npm configuration to the subprocess.
  'NPM_CONFIG_PREFIX',
]);

function pickSubscriptionEnv(
  source: NodeJS.ProcessEnv,
  allowedKeys: ReadonlySet<string>,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(source).filter(([key, value]) => (
      value !== undefined && allowedKeys.has(key.toUpperCase())
    )),
  );
}


/**
 * Keep subscription calls independent from user/project helpers, tools, and MCP servers.
 * OAuth credentials still load normally; only customization sources are isolated.
 */
export const CLAUDE_SUBSCRIPTION_ISOLATION_ARGS = [
  '--safe-mode',
  '--setting-sources', 'local',
  '--disallowedTools', '*',
  '--strict-mcp-config',
  '--no-session-persistence',
] as const;

// [2026-08-16] Photo-mode variant: the model must READ staged image files, so the
// wildcard tool ban is replaced with an explicit deny-list + a Read allowlist.
// Measured on claude 2.1.233: `--disallowedTools '*' --allowedTools Read` does NOT
// enable Read (wildcard wins) — the model then fakes a textual tool call and the
// image is never seen. The explicit list below is the verified working form.
// Read is the ONLY enabled tool: no shell, no writes, no network.
export const CLAUDE_SUBSCRIPTION_IMAGE_READ_ARGS = [
  '--safe-mode',
  '--setting-sources', 'local',
  '--disallowedTools',
  'Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task,Agent,TodoWrite,Glob,Grep,KillShell,BashOutput,EnterWorktree,SlashCommand,Skill',
  '--allowedTools', 'Read',
  '--strict-mcp-config',
  '--no-session-persistence',
] as const;

export function buildClaudeSubscriptionEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return withAgentRuntimePath(pickSubscriptionEnv(source, CLAUDE_SUBSCRIPTION_ENV_KEYS));
}

export function buildCodexSubscriptionEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return withAgentRuntimePath(pickSubscriptionEnv(source, CODEX_SUBSCRIPTION_ENV_KEYS));
}

export function buildGeminiSubscriptionEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  // [v2.11.145] The provider now runs agy (Antigravity CLI); auth lives in the OS keyring, so
  // there is no auth-method env var or settings file to prepare. API-key vars stay stripped by
  // the allowlist so the subprocess uses the subscription only, never silent API-key billing.
  //
  // agy's install dir is added explicitly: its installer only writes the User PATH *registry*
  // value, which a running app never sees (see getAgyInstallDirs). Scoped to gemini so the
  // codex/claude environments are byte-identical to before.
  // agy's dir is inserted BEFORE withAgentRuntimePath runs, so the app-managed prefix stays at
  // the very front of PATH exactly as it is for codex/claude; agy sits behind it, ahead of the
  // inherited PATH.
  return withAgentRuntimePath(
    withPathEntries(pickSubscriptionEnv(source, GEMINI_SUBSCRIPTION_ENV_KEYS), getAgyInstallDirs()),
  );
}

/**
 * Install env stays on the inherited PATH: the managed prefix is passed to npm explicitly as
 * --prefix, and the runtime shim directory is prepended by resolveNpmInvocation().
 */
export function buildNpmInstallEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return pickSubscriptionEnv(source, NPM_INSTALL_ENV_KEYS);
}
