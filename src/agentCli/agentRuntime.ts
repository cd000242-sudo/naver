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
import { mkdirSync, writeFileSync } from 'fs';
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
  writeFileSync(join(shimDir, 'node.cmd'), AGENT_NODE_SHIM_CMD, 'utf8');
  return shimDir;
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
    return withPathEntries(env, [getAgentGlobalPrefix()]);
  } catch {
    // userData is unavailable (no Electron app object) — inherited PATH is still valid.
    return env;
  }
}
