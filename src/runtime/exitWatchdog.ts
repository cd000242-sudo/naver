/**
 * exitWatchdog.ts
 *
 * [2026-09-30] After an automation run, quitting finished every JS cleanup step (the
 * main log ends at "isQuitting=true, 즉시 종료 허용") but the process stayed alive until
 * the owner ended it from Task Manager. Once Electron's Shutdown() quits the main
 * message loop no JS timer fires again, so the `setTimeout(() => process.exit())`
 * backstops in main.ts are dead in the normal quit path; whatever hangs sits in the
 * native teardown that follows `app.on('quit')`.
 *
 * This arms a watchdog that does not depend on our event loop: a detached PowerShell
 * child holds a handle to our process (so the PID cannot be recycled underneath it),
 * waits up to `timeoutMs`, and terminates us only if we are still alive by then.
 * A process that exits normally makes the child a no-op.
 *
 * [2026-11-03] The PowerShell used to go through cmd.exe started with `detached` (no console),
 * so PowerShell got a brand-new console — with Windows Terminal as the default terminal that is a
 * visible window on every quit (owner: "파워쉘이 갑자기 뜨길래", 55 times during the release E2E).
 * Now a detached Electron-as-node launcher (GUI subsystem: no console at all) starts the same
 * PowerShell with windowsHide (CREATE_NO_WINDOW → hidden console, no terminal hand-off) and
 * waits for it. Measured: quit → no-op, hang → killed after the timeout, zero console windows.
 */
import { spawn as nodeSpawn } from 'child_process';

export const EXIT_WATCHDOG_TIMEOUT_MS = 8_000;

export interface ExitWatchdogOptions {
  pid?: number;
  timeoutMs?: number;
  platform?: NodeJS.Platform;
  spawnFn?: typeof nodeSpawn;
  /** The Electron binary that runs the launcher as plain Node (ELECTRON_RUN_AS_NODE). */
  execPath?: string;
  env?: NodeJS.ProcessEnv;
}

let armed = false;

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer, got ${value}`);
  }
}

/** PowerShell one-liner: wait on the live process object, kill only after the wait times out. */
export function buildExitWatchdogScript(pid: number, timeoutMs: number): string {
  assertPositiveInteger(pid, 'pid');
  assertPositiveInteger(timeoutMs, 'timeoutMs');
  return [
    `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue`,
    `if ($p -and -not $p.WaitForExit(${timeoutMs})) { $p.Kill() }`,
  ].join('; ');
}

/**
 * Node one-liner run by the detached Electron-as-node launcher: starts the PowerShell watchdog hidden
 * and stays alive until it ends (a non-detached child lives in our job, so the launcher must outlive it).
 * The extra 15 s cap only ends the launcher itself if PowerShell never reports back.
 */
export function buildExitWatchdogLauncher(pid: number, timeoutMs: number): string {
  const script = buildExitWatchdogScript(pid, timeoutMs);
  return [
    "const c=require('child_process').spawn('powershell.exe',",
    `['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',${JSON.stringify(script)}],`,
    "{stdio:'ignore',windowsHide:true});",
    "c.on('exit',()=>process.exit(0));c.on('error',()=>process.exit(0));",
    `setTimeout(()=>process.exit(0),${timeoutMs + 15_000}).unref();`,
  ].join('');
}

/**
 * Spawns the watchdog once per process. Returns false when it was already armed,
 * when the platform is not Windows, or when spawning failed — never throws, because
 * this runs inside the quit path.
 */
export function armExitWatchdog(options: ExitWatchdogOptions = {}): boolean {
  const {
    pid = process.pid,
    timeoutMs = EXIT_WATCHDOG_TIMEOUT_MS,
    platform = process.platform,
    spawnFn = nodeSpawn,
    execPath = process.execPath,
    env = process.env,
  } = options;

  if (armed || platform !== 'win32') return false;

  try {
    // Measured 2026-09-30: a detached PowerShell never runs (no console) and a non-detached one dies with us.
    // Measured 2026-11-03: cmd.exe → PowerShell opened a Windows Terminal window. A GUI-subsystem launcher
    // (Electron as node) is detached from our job and has no console; its hidden PowerShell child has no window.
    const child = spawnFn(
      execPath,
      ['-e', buildExitWatchdogLauncher(pid, timeoutMs)],
      { detached: true, stdio: 'ignore', windowsHide: true, env: { ...env, ELECTRON_RUN_AS_NODE: '1' } },
    );
    child.unref();
    armed = true;
    return true;
  } catch (error) {
    console.warn('[ExitWatchdog] arm failed:', (error as Error)?.message || error);
    return false;
  }
}

export function resetExitWatchdogForTests(): void {
  armed = false;
}
