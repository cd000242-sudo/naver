/**
 * agentRuntime.ts — app-owned execution environment for the agent CLIs.
 *
 * Why this exists: install used to run `npm` resolved from the user's PATH, so a PC
 * without Node.js on PATH failed with "npm CLI를 허용된 PATH에서 찾을 수 없습니다"
 * even when npm was installed (stale logon env, nvm/fnm shell-only PATH, portable Node).
 * The app already ships a Node 20 runtime — Electron's own binary in ELECTRON_RUN_AS_NODE
 * mode — so the user's Node is never actually required.
 *
 * Everything the agent feature needs therefore lives under userData:
 *   agent-runtime/npm/     bootstrapped npm (see npmBootstrap.ts)
 *   agent-runtime/bin/     node shim for npm lifecycle scripts
 *   agent-runtime/global/  `npm i -g --prefix` target (no admin rights needed)
 *   agent-runtime/npm-cache/
 */
import { app } from 'electron';
import { chmodSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs';
import { delimiter, isAbsolute, join } from 'path';

/** Carries the runtime executable path through the environment block, never through a file. */
export const AGENT_RUNTIME_NODE_ENV_KEY = 'AGENT_RUNTIME_NODE';

/**
 * cmd.exe reads .cmd files in the OEM code page (949 on Korean Windows), which destroys a
 * non-ASCII path baked into the file — observed live as claude-code's `node install.cjs`
 * postinstall failing with "지정된 경로를 찾을 수 없습니다" under C:\Users\박성현\...
 * The shim therefore stays pure ASCII and reads the path from the environment (UTF-16).
 */
export const AGENT_NODE_SHIM_CMD = [
  '@ECHO OFF',
  `IF NOT DEFINED ${AGENT_RUNTIME_NODE_ENV_KEY} EXIT /B 9009`,
  'SET "ELECTRON_RUN_AS_NODE=1"',
  `"%${AGENT_RUNTIME_NODE_ENV_KEY}%" %*`,
  '',
].join('\r\n');

export const AGENT_NODE_SHIM_POSIX = '#!/bin/sh\n: "${AGENT_RUNTIME_NODE:?App runtime is missing}"\nexport ELECTRON_RUN_AS_NODE=1\nexec "$AGENT_RUNTIME_NODE" "$@"\n';

export function getAgentRuntimeDir(): string {
  return join(app.getPath('userData'), 'agent-runtime');
}

/** Global install prefix owned by the app — user-writable, so no elevation is required. */
export function getAgentGlobalPrefix(): string {
  return join(getAgentRuntimeDir(), 'global');
}

export function getAgentShimDir(): string {
  return join(getAgentRuntimeDir(), 'bin');
}

export function getAgentNpmCacheDir(): string {
  return join(getAgentRuntimeDir(), 'npm-cache');
}

/** Electron's own binary, which runs as plain Node under ELECTRON_RUN_AS_NODE=1. */
export function getAgentNodeExecutable(): string {
  return process.execPath;
}

/**
 * Write the ASCII-only `node` shim so npm lifecycle scripts (`cmd.exe /c node install.cjs`)
 * resolve to the bundled runtime. Rewritten every call because the app path changes on
 * update or relocation.
 */
export function ensureNodeShim(): string {
  const shimDir = getAgentShimDir();
  mkdirSync(shimDir, { recursive: true });
  const file = join(shimDir, process.platform === 'win32' ? 'node.cmd' : 'node');
  writeFileSync(file, process.platform === 'win32' ? AGENT_NODE_SHIM_CMD : AGENT_NODE_SHIM_POSIX, 'utf8');
  if (process.platform !== 'win32') chmodSync(file, 0o700);
  return shimDir;
}

/**
 * Antigravity CLI (agy) install directory.
 *
 * [v2.11.145] The official Windows installer drops %LOCALAPPDATA%\agy\bin\agy.exe and registers
 * that directory in the *User PATH registry value*, which never reaches already-running
 * processes — its own output says "not present in your active Environment PATH ... restart your
 * active terminal session". Measured live right after install: detection still reported "not
 * installed". Naming the known directory here lets the app find agy the moment it is installed,
 * with no logout or app restart.
 *
 * Official installer documentation also specifies ~/.local/bin/agy on macOS/Linux:
 * https://antigravity.google/docs/cli/install/ (checked 2026-10-21).
 */
export function getAgyInstallDirs(): readonly string[] {
  if (process.platform !== 'win32') return getClaudeInstallDirs();
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData ? [join(localAppData, 'agy', 'bin')] : [];
}

/**
 * Claude Code CLI install directory.
 *
 * [2026-08-18] Same stale-PATH trap as agy, measured live: the official installer drops
 * %USERPROFILE%\.local\bin\claude.exe and registers that directory in the *User PATH registry
 * value*. Explorer (and therefore every app it launched before the install) keeps its old
 * environment block, so the app reported "claude CLI가 설치되어 있지 않습니다" while the same
 * command resolved fine in a freshly opened terminal. Naming the known directory removes the
 * logout/restart requirement.
 *
 * POSIX uses the same ~/.local/bin convention, so it is included there too.
 */
export function getClaudeInstallDirs(): readonly string[] {
  const home = process.env.USERPROFILE || process.env.HOME;
  return home ? [join(home, '.local', 'bin')] : [];
}

/**
 * Codex CLI install directories — npm's global prefix and the official standalone layout.
 * Measured on this machine: %APPDATA%\npm\codex.cmd. Same stale-PATH exposure as above when
 * npm's prefix was added to the User PATH after the app (or Explorer) started.
 * Standalone Windows layout: https://learn.chatgpt.com/docs/enterprise/windows-deployment
 * The official installer's own layout (hash folders under OpenAI\Codex\bin) is listed last so a
 * working npm install keeps its current priority.
 */
export function getCodexInstallDirs(): readonly string[] {
  if (process.platform !== 'win32') return getClaudeInstallDirs();
  const appData = process.env.APPDATA;
  const local = process.env.LOCALAPPDATA;
  return [
    ...(appData ? [join(appData, 'npm')] : []),
    ...(local ? [join(local, 'Programs', 'OpenAI', 'Codex', 'bin')] : []),
    ...(local ? listCodexOfficialBinDirs(join(local, 'OpenAI', 'Codex', 'bin')) : []),
  ];
}

/**
 * Official Windows layout (measured on this PC, 2026-11-03):
 * %LOCALAPPDATA%\OpenAI\Codex\bin\<hash folder>\codex.exe — two hash folders existed and only one
 * held codex.exe. Only folders that really contain codex.exe qualify, newest codex.exe first, so a
 * leftover empty hash folder can never shadow the live one. Read errors are ignored.
 */
function listCodexOfficialBinDirs(binRoot: string): string[] {
  try {
    return readdirSync(binRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(binRoot, entry.name))
      .map((dir) => ({ dir, modifiedMs: codexExecutableModifiedMs(dir) }))
      .filter((candidate): candidate is { dir: string; modifiedMs: number } => candidate.modifiedMs !== undefined)
      .sort((a, b) => b.modifiedMs - a.modifiedMs)
      .map((candidate) => candidate.dir);
  } catch {
    return [];
  }
}

function codexExecutableModifiedMs(dir: string): number | undefined {
  try {
    const stats = statSync(join(dir, 'codex.exe'));
    return stats.isFile() ? stats.mtimeMs : undefined;
  } catch {
    return undefined;
  }
}

function pathKeyOf(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
}

/**
 * Return a copy of env with `dirs` at the front of PATH, deduplicated.
 * Writes back to the env's existing PATH key: adding a second casing (`PATH` next to an
 * inherited `Path`) would leave resolveWindowsSpawnTarget reading the stale one.
 */
export function withPathEntries(
  env: NodeJS.ProcessEnv,
  dirs: readonly string[],
): NodeJS.ProcessEnv {
  const prepend = dirs.filter((dir) => typeof dir === 'string' && dir.length > 0 && isAbsolute(dir));
  if (prepend.length === 0) return env;

  const key = pathKeyOf(env);
  const existing = String(env[key] ?? '').split(delimiter);
  const seen = new Set<string>();
  const merged = [...prepend, ...existing].filter((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return false;
    const dedupeKey = process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });

  return { ...env, [key]: merged.join(delimiter) };
}

/**
 * Make the app-installed CLIs visible to detect/login/run without touching the system PATH.
 * The managed prefix goes first so every user resolves the same binary; the inherited PATH
 * still follows, so a CLI the user installed globally themselves keeps working.
 */
export function withAgentRuntimePath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  try {
    const prefix = getAgentGlobalPrefix();
    // Windows npm launchers are resolved directly to their .js/.exe by spawnHelper.
    if (process.platform === 'win32') return withPathEntries(env, [prefix]);
    const shim = ensureNodeShim();
    return withPathEntries({ ...env, ELECTRON_RUN_AS_NODE: '1', [AGENT_RUNTIME_NODE_ENV_KEY]: getAgentNodeExecutable() },
      [join(prefix, 'bin'), prefix, shim]);
  } catch {
    // userData is unavailable (no Electron app object) — inherited PATH is still valid.
    return env;
  }
}
