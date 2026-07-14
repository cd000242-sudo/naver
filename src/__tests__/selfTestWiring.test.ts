import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * SPEC-STABILITY-2026 Phase 6.3 — self-test wiring guard.
 * The in-app smoke (SELF_TEST=1) invokes IPC through the real preload bridge;
 * if a bridge method or the main.ts attach point is renamed, this catches it
 * at unit-test time instead of as a silent self-test handshake failure.
 */
const read = (...segments: string[]): string =>
  fs.readFileSync(path.join(process.cwd(), ...segments), 'utf-8');

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
    expect(orchestrator).toContain('fs.rmSync(isolatedRoot, { recursive: true, force: true })');
  });
});
