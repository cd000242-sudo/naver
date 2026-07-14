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

  teardownSelfTest(pass ? 0 : 1);
}

function teardownSelfTest(exitCode: number): void {
  const childProcessIds = new Set(
    app.getAppMetrics()
      .map((metric) => metric.pid)
      .filter((pid) => Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid),
  );
  let hasExited = false;
  const exitApp = (): void => {
    if (hasExited) return;
    hasExited = true;
    for (const childProcessId of childProcessIds) {
      try {
        process.kill(childProcessId, 'SIGKILL');
      } catch {
        // The child already exited after BrowserWindow.destroy().
      }
    }
    app.exit(exitCode);
  };

  const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
  if (windows.length === 0) {
    setTimeout(exitApp, 150);
    return;
  }

  let remainingWindows = windows.length;
  const onWindowDestroyed = (): void => {
    remainingWindows -= 1;
    if (remainingWindows === 0) setTimeout(exitApp, 150);
  };

  for (const window of windows) {
    window.webContents.once('destroyed', onWindowDestroyed);
    if (!window.isDestroyed()) window.destroy();
  }

  // A renderer crash must not leave the smoke process hanging forever.
  setTimeout(exitApp, 2_000);
}
