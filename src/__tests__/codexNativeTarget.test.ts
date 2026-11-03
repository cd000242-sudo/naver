/**
 * [2026-11-03] 사장님: "코덱스로 이미지 생성하니까 cmd 창이 계속 뜬다".
 * The npm codex launcher (bin/codex.js) spawns codex.exe without windowsHide; from the app (no console) every call
 * opened a Windows Terminal window. A Codex npm shim must resolve straight to the native codex.exe.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveCodexNativeTarget } from '../agentCli/codexNativeTarget.js';
import { resolveWindowsSpawnTarget } from '../agentCli/spawnHelper.js';

const windowsIt = process.platform === 'win32' ? it : it.skip;
const base = mkdtempSync(join(tmpdir(), 'codex-native-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));

/** npm -g layout: <prefix>/codex.cmd + node_modules/@openai/codex/{bin/codex.js, node_modules/@openai/codex-win32-x64/...}. */
function npmLayout(name: string, { nested = true, hoisted = false } = {}) {
  const prefix = join(base, name);
  const root = join(prefix, 'node_modules', '@openai', 'codex');
  mkdirSync(join(root, 'bin'), { recursive: true });
  writeFileSync(join(root, 'bin', 'codex.js'), '// launcher', 'utf8');
  writeFileSync(join(prefix, 'codex.cmd'), '@ECHO off\r\n"%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js"   %*\r\n', 'utf8');
  const vendors = [
    ...(nested ? [join(root, 'node_modules', '@openai', 'codex-win32-x64', 'vendor')] : []),
    ...(hoisted ? [join(prefix, 'node_modules', '@openai', 'codex-win32-x64', 'vendor')] : []),
  ];
  for (const vendor of vendors) {
    const bin = join(vendor, 'x86_64-pc-windows-msvc', 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'codex.exe'), '', 'utf8');
  }
  return { prefix, root, script: join(root, 'bin', 'codex.js') };
}

describe('Codex launcher → native codex.exe (no console window)', () => {
  it('finds the nested platform binary and sets the launcher environment', () => {
    const { root, script } = npmLayout('nested');
    const target = resolveCodexNativeTarget(script, 'x64');
    expect(target?.command).toBe(join(root, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'));
    expect(target?.prefixArgs).toEqual([]);
    expect(target?.envOverrides).toMatchObject({ CODEX_MANAGED_BY_NPM: '1' });
    expect(String(target?.envOverrides.CODEX_MANAGED_PACKAGE_ROOT).toLowerCase()).toContain(join('@openai', 'codex').toLowerCase());
    expect(target?.envOverrides.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it('finds a hoisted platform binary', () => {
    const { prefix, script } = npmLayout('hoisted', { nested: false, hoisted: true });
    expect(resolveCodexNativeTarget(script, 'x64')?.command)
      .toBe(join(prefix, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'));
  });

  it('leaves other scripts and a missing binary to the launcher path', () => {
    const { script } = npmLayout('missing', { nested: false });
    expect(resolveCodexNativeTarget(script, 'x64')).toBeUndefined();
    expect(resolveCodexNativeTarget(join(base, 'nested', 'node_modules', 'other', 'bin', 'codex.js'), 'x64')).toBeUndefined();
    expect(resolveCodexNativeTarget(npmLayout('arch').script, 'ia32')).toBeUndefined();
  });

  windowsIt('a codex npm shim on PATH resolves to codex.exe, not electron/node + codex.js', () => {
    const { prefix } = npmLayout('onpath');
    const target = resolveWindowsSpawnTarget('codex', { PATH: prefix, PATHEXT: '.EXE;.CMD', SYSTEMROOT: process.env.SYSTEMROOT });
    expect(target?.command.toLowerCase().endsWith('codex.exe')).toBe(true);
    expect(target?.prefixArgs).toEqual([]);
    expect(target?.envOverrides?.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });
});
