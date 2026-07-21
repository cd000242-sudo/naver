// Subscription agents run outside the Electron process. Pass only operating-system
// values needed to locate the executable, user profile, cached login, and TLS roots.
// Every application secret is denied by default, including future variables that this
// module does not know about yet.
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

export function buildClaudeSubscriptionEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return pickSubscriptionEnv(source, CLAUDE_SUBSCRIPTION_ENV_KEYS);
}

export function buildCodexSubscriptionEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return pickSubscriptionEnv(source, CODEX_SUBSCRIPTION_ENV_KEYS);
}

export function buildGeminiSubscriptionEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return pickSubscriptionEnv(source, GEMINI_SUBSCRIPTION_ENV_KEYS);
}

export function buildNpmInstallEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return pickSubscriptionEnv(source, NPM_INSTALL_ENV_KEYS);
}
