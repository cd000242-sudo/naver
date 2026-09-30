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
 */
import { spawn as nodeSpawn } from 'child_process';

export const EXIT_WATCHDOG_TIMEOUT_MS = 8_000;

export interface ExitWatchdogOptions {
  pid?: number;
  timeoutMs?: number;
  platform?: NodeJS.Platform;
  spawnFn?: typeof nodeSpawn;
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
  } = options;

  if (armed || platform !== 'win32') return false;

  try {
    // Measured 2026-09-30: powershell.exe spawned directly with `detached: true` never
    // runs the script (no console to attach to), while `detached: false` puts it in
    // libuv's kill-on-close job and it dies with us. Going through cmd.exe
    // (`shell: true`) gives PowerShell a hidden console and keeps it alive after we
    // exit; the hidden console has no window (MainWindowHandle 0).
    const child = spawnFn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command', `"${buildExitWatchdogScript(pid, timeoutMs)}"`,
      ],
      { detached: true, stdio: 'ignore', windowsHide: true, shell: true },
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
