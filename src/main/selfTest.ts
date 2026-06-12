// SPEC-STABILITY-2026 Phase 6.3 — SELF_TEST=1 in-app smoke.
//
// One real app boot answers "does the app turn on and can the processes talk
// to each other": bundle health = renderer console errors during init, and
// five read-only IPC handshakes through the actual preload bridge (so the
// preload → ipcMain wiring is exercised, not simulated). Runs only when
// SELF_TEST=1; the orchestrator (scripts/self-test.mjs) also sets E2E_TEST=1
// so license/server gates are skipped. Never active in normal launches.
import { app, BrowserWindow } from 'electron';

// Read-only channels via their preload bridge methods (window.api.*).
// All five must be side-effect free — this list is mirror-checked against
// src/preload.ts by selfTestWiring.test.ts.
const HANDSHAKES: ReadonlyArray<{ channel: string; script: string }> = [
  { channel: 'app:getVersion', script: 'window.api.getAppVersion()' },
  { channel: 'config:get', script: 'window.api.getConfig()' },
  { channel: 'license:getDeviceId', script: 'window.api.getDeviceId()' },
  { channel: 'account:getAll', script: 'window.api.getAllBlogAccounts()' },
  { channel: 'api:getAllUsageSnapshots', script: 'window.api.getAllApiUsageSnapshots()' },
];

// Renderer modules attach over ~3s after did-finish-load; probe after settle.
const RENDERER_SETTLE_MS = 4000;
const CONSOLE_ERROR_LEVEL = 3;

export function isSelfTestMode(): boolean {
  return process.env.SELF_TEST === '1';
}

/** Call right after BrowserWindow creation so init-time errors are counted. */
export function attachSelfTest(mainWindow: BrowserWindow): void {
  if (!isSelfTestMode()) return;

  const rendererErrors: string[] = [];
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    if (level === CONSOLE_ERROR_LEVEL) {
      rendererErrors.push(String(message));
      console.error(`[SelfTest] renderer-error: ${message}`);
    }
  });

  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      void runHandshakes(mainWindow, rendererErrors);
    }, RENDERER_SETTLE_MS);
  });
}

async function runHandshakes(mainWindow: BrowserWindow, rendererErrors: readonly string[]): Promise<void> {
  let failures = 0;
  for (const handshake of HANDSHAKES) {
    try {
      // Resolve to true so structured results never trip executeJavaScript
      // serialization; we only assert the invoke round-trip completes.
      await mainWindow.webContents.executeJavaScript(
        `Promise.resolve(${handshake.script}).then(() => true)`,
        true,
      );
      console.log(`[SelfTest] handshake OK: ${handshake.channel}`);
    } catch (error) {
      failures += 1;
      console.error(`[SelfTest] handshake FAIL: ${handshake.channel} — ${(error as Error)?.message || error}`);
    }
  }

  const pass = failures === 0 && rendererErrors.length === 0;
  console.log(
    `[SelfTest] ${pass ? 'PASS' : 'FAIL'} — handshakes ${HANDSHAKES.length - failures}/${HANDSHAKES.length}, ` +
    `renderer errors ${rendererErrors.length}`,
  );

  // app.exit skips before-quit logout waits — deterministic teardown for CI.
  setTimeout(() => app.exit(pass ? 0 : 1), 300);
}
