// src/agentCli/codexNativeTarget.ts
// [2026-11-03] Windows: the npm `codex` launcher (bin/codex.js) starts the native codex.exe with stdio "inherit" and
// no windowsHide. Run from the app (a GUI process without a console) that child gets a brand-new console, which
// Windows Terminal shows as a window — one per text call, image and status probe (measured: OpenConsole -Embedding +
// a WindowsTerminal window titled codex.exe for each run). Spawning the native binary directly with windowsHide keeps
// it on a hidden console, and what it starts (code-mode host, shells) inherits that hidden console.
// Mirrors codex.js 0.166.0: same binary lookup, same environment values. Returns undefined when the script is not the
// Codex launcher or no binary is found, so the caller keeps the launcher path.

import { existsSync, realpathSync } from 'fs';
import { basename, dirname, join } from 'path';

const CODEX_WINDOWS_BINARIES: Readonly<Record<string, { readonly pkg: string; readonly triple: string }>> = Object.freeze({
  x64: { pkg: 'codex-win32-x64', triple: 'x86_64-pc-windows-msvc' },
  arm64: { pkg: 'codex-win32-arm64', triple: 'aarch64-pc-windows-msvc' },
});

export interface CodexNativeTarget {
  readonly command: string;
  readonly prefixArgs: string[];
  readonly envOverrides: NodeJS.ProcessEnv;
}

/** `<root>/bin/codex.js` inside an `@openai/codex` package → the package root; anything else → undefined. */
function codexPackageRootOf(script: string): string | undefined {
  const bin = dirname(script);
  const root = dirname(bin);
  const scope = dirname(root);
  const names = [basename(script), basename(bin), basename(root), basename(scope)].map((name) => name.toLowerCase());
  return names.join('/') === 'codex.js/bin/codex/@openai' ? root : undefined;
}

export function resolveCodexNativeTarget(script: string, arch: string = process.arch): CodexNativeTarget | undefined {
  const root = codexPackageRootOf(script);
  const binary = CODEX_WINDOWS_BINARIES[arch];
  if (!root || !binary) return undefined;
  const vendorRoots = [
    join(root, 'node_modules', '@openai', binary.pkg, 'vendor'), // nested optional dependency (npm -g)
    join(dirname(root), binary.pkg, 'vendor'), // hoisted next to @openai/codex
    join(root, 'vendor'), // codex.js fallback
  ];
  const command = vendorRoots
    .map((vendor) => join(vendor, binary.triple, 'bin', 'codex.exe'))
    .find((candidate) => existsSync(candidate));
  if (!command) return undefined;
  let packageRoot = root;
  try { packageRoot = realpathSync(root); } catch { /* keep the path as found */ }
  return {
    command,
    prefixArgs: [],
    // codex.js sets the package root and exactly one CODEX_MANAGED_BY_* marker (npm here); undefined drops the others.
    envOverrides: {
      CODEX_MANAGED_PACKAGE_ROOT: packageRoot,
      CODEX_MANAGED_BY_NPM: '1',
      CODEX_MANAGED_BY_BUN: undefined,
      CODEX_MANAGED_BY_PNPM: undefined,
      CODEX_MANAGED_BY_VITE_PLUS: undefined,
    },
  };
}
