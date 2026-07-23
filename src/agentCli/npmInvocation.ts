/**
 * npmInvocation.ts — decide HOW to run npm for an agent install.
 *
 * Preferred: the app's own runtime (Electron as Node) driving a bootstrapped npm, installing
 * into an app-owned prefix. This works on a PC with no Node.js on PATH at all, needs no
 * elevation, and puts every user on the same install layout.
 *
 * Fallback: `npm` from the user's PATH — kept only for the case where the bootstrap itself
 * cannot run (no network on first use, blocked registry, unwritable userData).
 */
import { mkdirSync } from 'fs';
import {
  AGENT_RUNTIME_NODE_ENV_KEY,
  ensureNodeShim,
  getAgentGlobalPrefix,
  getAgentNodeExecutable,
  getAgentNpmCacheDir,
  withPathEntries,
} from './agentRuntime.js';
import { ensureBootstrappedNpm } from './npmBootstrap.js';
import { buildNpmInstallEnv } from './subscriptionEnv.js';

export interface NpmInvocation {
  /** Executable passed to spawnCollect. */
  readonly command: string;
  /** Arguments that must precede the npm arguments (the npm CLI script for the bundled path). */
  readonly prefixArgs: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly source: 'bundled' | 'system';
  /** App-owned global install prefix, when it could be determined. */
  readonly prefix?: string;
  readonly cache?: string;
  /** Why the bundled runtime was skipped — surfaced in the failure message, not swallowed. */
  readonly bootstrapError?: string;
}

/** userData paths depend on the Electron app object; treat absence as "no managed prefix". */
function resolveManagedPaths(): { prefix?: string; cache?: string } {
  try {
    const prefix = getAgentGlobalPrefix();
    const cache = getAgentNpmCacheDir();
    mkdirSync(prefix, { recursive: true });
    mkdirSync(cache, { recursive: true });
    return { prefix, cache };
  } catch {
    return {};
  }
}

/**
 * Strip the user's global-prefix override: this install targets the app-owned prefix, and a
 * leftover NPM_CONFIG_PREFIX would only create ambiguity about where the CLI landed.
 */
function withoutUserPrefixConfig(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => key.toUpperCase() !== 'NPM_CONFIG_PREFIX'),
  );
}

export async function resolveNpmInvocation(): Promise<NpmInvocation> {
  const { prefix, cache } = resolveManagedPaths();

  try {
    const npmCli = await ensureBootstrappedNpm();
    const shimDir = ensureNodeShim();
    const nodeExe = getAgentNodeExecutable();
    const env = withPathEntries(
      {
        ...withoutUserPrefixConfig(buildNpmInstallEnv()),
        // npm lifecycle scripts run through cmd.exe and call a bare `node`; the shim on PATH
        // forwards to this executable, which it reads from the environment (see agentRuntime).
        ELECTRON_RUN_AS_NODE: '1',
        [AGENT_RUNTIME_NODE_ENV_KEY]: nodeExe,
      },
      [shimDir],
    );
    return Object.freeze({
      command: nodeExe,
      prefixArgs: Object.freeze([npmCli]),
      env,
      source: 'bundled' as const,
      prefix,
      cache,
    });
  } catch (err) {
    const bootstrapError = (err as Error)?.message ?? String(err);
    console.warn(`[NpmInvocation] 내장 런타임 준비 실패 → 시스템 npm으로 폴백: ${bootstrapError}`);
    return Object.freeze({
      command: 'npm',
      prefixArgs: Object.freeze([]),
      env: buildNpmInstallEnv(),
      source: 'system' as const,
      prefix,
      cache,
      bootstrapError,
    });
  }
}
