import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

/**
 * SPEC-STABILITY-2026 Phase 6.3 — self-test wiring guard.
 * The in-app smoke (SELF_TEST=1) invokes IPC through the real preload bridge;
 * if a bridge method or the main.ts attach point is renamed, this catches it
 * at unit-test time instead of as a silent self-test handshake failure.
 */
const read = (...segments: string[]): string =>
  fs.readFileSync(path.join(process.cwd(), ...segments), 'utf-8');

function runOrchestrator(platform: string) {
  const source = ts.createSourceFile('self-test.mjs', read('scripts', 'self-test.mjs'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const executable = source.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(source)).join('\n');
  const spawnSync = vi.fn(() => ({ status: 0 }));
  const rmSync = vi.fn();
  const isolatedRoot = '/isolated/self-test-profile';
  runInNewContext(executable, {
    spawnSync,
    fs: { mkdtempSync: () => isolatedRoot, mkdirSync: vi.fn(), rmSync },
    os: { tmpdir: () => '/tmp' },
    path: path.posix,
    process: { platform, env: { HOME: '/real-user-home', ELECTRON_RUN_AS_NODE: '1', CI: 'true' } },
    console: { log: vi.fn(), warn: vi.fn() },
  });
  return { calls: spawnSync.mock.calls as unknown as [string, string[], { env: Record<string, string>; timeout: number }][], rmSync, isolatedRoot };
}

describe('self-test Electron launch behavior', () => {
  it.each(['darwin', 'win32', 'linux'])('uses a mock keychain only for the macOS test app (%s)', platform => {
    const { calls } = runOrchestrator(platform);
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('node');
    expect(calls[0][1]).toEqual(['dist/tests/automationSmoke.js']);
    expect(calls[1][0]).toBe('npx');
    expect(calls[1][1]).toEqual(platform === 'darwin'
      ? ['electron', '--use-mock-keychain', '.']
      : ['electron', '.']);
  });

  it.each(['darwin', 'win32'])('preserves isolated profiles and both stage environments (%s)', platform => {
    const { calls, rmSync, isolatedRoot } = runOrchestrator(platform);
    for (const [, , options] of calls) {
      expect(options.env).toMatchObject({
        SELF_TEST: '1', E2E_TEST: '1', CI: 'true',
        E2E_PROFILE_ROOT: isolatedRoot,
        E2E_USER_DATA_DIR: `${isolatedRoot}/userdata`,
        APPDATA: `${isolatedRoot}/appdata`,
        LOCALAPPDATA: `${isolatedRoot}/localappdata`,
        HOME: `${isolatedRoot}/home`, USERPROFILE: `${isolatedRoot}/home`,
      });
      expect(options.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
    }
    expect(calls[0][2].timeout).toBe(120_000);
    expect(calls[1][2].timeout).toBe(300_000);
    expect(rmSync).toHaveBeenCalledWith(isolatedRoot, expect.objectContaining({ recursive: true, force: true }));
  });
});

describe('self-test wiring (6.3)', () => {
  const selfTestSource = read('src', 'main', 'selfTest.ts');
  const preloadSource = read('src', 'preload.ts');
  const mainSource = read('src', 'main.ts');

  it('declares exactly 5 read-only handshakes', () => {
    const channels = selfTestSource.match(/channel: '[^']+'/g) ?? [];
    expect(channels).toHaveLength(5);
  });

  it('every handshake bridge method exists in preload', () => {
    const methods = [...selfTestSource.matchAll(/window\.api\.(\w+)\(\)/g)].map((m) => m[1]);
    expect(methods).toHaveLength(5);
    for (const method of methods) {
      expect(preloadSource, `preload bridge missing: ${method}`).toMatch(
        new RegExp(`${method}:\\s*(async\\s*)?\\(`),
      );
    }
  });

  it('every handshake channel string matches the preload invoke target', () => {
    const pairs = [...selfTestSource.matchAll(/channel: '([^']+)', script: 'window\.api\.(\w+)\(\)'/g)];
    expect(pairs).toHaveLength(5);
    for (const [, channel] of pairs) {
      expect(preloadSource, `preload does not invoke: ${channel}`).toContain(`invoke('${channel}')`);
    }
  });

  it('main.ts attaches self-test at window creation and gates on SELF_TEST=1', () => {
    expect(mainSource).toContain('attachSelfTest(mainWindow)');
    expect(selfTestSource).toContain("process.env.SELF_TEST === '1'");
  });

  it('destroys every self-test window before exiting the packaged process', () => {
    expect(selfTestSource).toContain('BrowserWindow.getAllWindows()');
    expect(selfTestSource).toContain('app.getAppMetrics()');
    expect(selfTestSource).toContain("process.kill(childProcessId, 'SIGKILL')");
    expect(selfTestSource).toMatch(/if \(!window\.isDestroyed\(\)\) window\.destroy\(\)/);
    expect(selfTestSource).toContain("window.webContents.once('destroyed', onWindowDestroyed)");
    expect(selfTestSource).toContain('app.exit(exitCode)');
  });

  it('orchestrator runs both stages and strips ELECTRON_RUN_AS_NODE', () => {
    const orchestrator = read('scripts', 'self-test.mjs');
    expect(orchestrator).toContain('dist/tests/automationSmoke.js');
    expect(orchestrator).toContain("SELF_TEST: '1'");
    expect(orchestrator).toContain("E2E_TEST: '1'");
    expect(orchestrator).toContain('E2E_USER_DATA_DIR');
    expect(orchestrator).toContain("fs.mkdtempSync(path.join(os.tmpdir(), 'bln-self-test-'))");
    expect(orchestrator).toContain('delete process.env.ELECTRON_RUN_AS_NODE');
    expect(orchestrator).not.toContain('process.exit(');
    expect(orchestrator).toContain('finally {');
    // [2026-08-27] 정리 호출의 인자 형태를 통째로 박제하지 않는다 — maxRetries 를 더하며
    //   의도와 무관하게 깨졌다. 확인할 것은 "finally 에서 격리 폴더를 지운다" 하나다.
    //   (정리 실패는 릴리즈를 막지 않는다 — 그 완화는 self-test.mjs 주석에 근거를 남겼다.)
    expect(orchestrator).toMatch(/fs\.rmSync\(isolatedRoot,\s*\{[^}]*recursive:\s*true/);
  });
});

it('isolates smoke guard storage and explicitly mocks the session probe', () => {
 const orchestrator=read('scripts','self-test.mjs');
 expect(orchestrator).toContain("HOME: path.join(isolatedRoot, 'home')");
 expect(orchestrator).toContain("USERPROFILE: path.join(isolatedRoot, 'home')");
 expect(orchestrator).toContain("['dist/tests/automationSmoke.js'], appEnv");
 const smoke=read('src','tests','automationSmoke.ts');
 expect(smoke).toContain('browserSessionManager.ensureServerSession = async');
 expect(smoke).toContain('verifiedSessions !== 1');
});
