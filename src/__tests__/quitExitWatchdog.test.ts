/**
 * quitExitWatchdog.test.ts
 *
 * [2026-09-30 owner] "작업하다가 다하고 종료하면 종료버튼눌러도 종료가안되서 작업관리자에서
 * 작업끝내기를 해야되는데". main-2026-09-29.log ends every quit with
 * "isQuitting=true, 즉시 종료 허용" and then nothing: the JS choreography finished, but
 * the process stayed alive. After Electron's Shutdown() quits the main message loop no
 * JS timer fires again, so the setTimeout(process.exit) backstops in main.ts cannot
 * rescue a hang in native teardown. The fix is an OS-level watchdog armed on 'quit'
 * plus two cleanup gaps seen in the same log (reconnect loop started by our own
 * browser.close(), base64 worker threads never terminated).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXIT_WATCHDOG_TIMEOUT_MS,
  armExitWatchdog,
  buildExitWatchdogScript,
  resetExitWatchdogForTests,
} from '../runtime/exitWatchdog';

const mainSource = readFileSync(resolve(__dirname, '../main.ts'), 'utf-8');
const sessionSource = readFileSync(resolve(__dirname, '../browserSessionManager.ts'), 'utf-8');

function makeSpawn() {
  const unref = vi.fn();
  const spawnFn = vi.fn(() => ({ unref }));
  return { spawnFn: spawnFn as unknown as typeof import('node:child_process').spawn, spawnMock: spawnFn, unref };
}

describe('exit watchdog script', () => {
  it('waits on the live process object and kills only after the wait times out', () => {
    const script = buildExitWatchdogScript(4321, 8000);
    expect(script).toContain('Get-Process -Id 4321');
    expect(script).toContain('WaitForExit(8000)');
    expect(script).toMatch(/-not \$p\.WaitForExit\(8000\)[^;]*\$p\.Kill\(\)/);
    // No PID-based taskkill: a recycled PID must never be hit.
    expect(script).not.toMatch(/taskkill/i);
  });

  it('rejects a pid or timeout that is not a positive integer', () => {
    expect(() => buildExitWatchdogScript(0, 8000)).toThrow(RangeError);
    expect(() => buildExitWatchdogScript(12, -1)).toThrow(RangeError);
    expect(() => buildExitWatchdogScript(12.5, 8000)).toThrow(RangeError);
  });
});

describe('armExitWatchdog', () => {
  beforeEach(() => resetExitWatchdogForTests());

  it('spawns one detached, hidden, unref-ed PowerShell child through cmd.exe on win32', () => {
    const { spawnFn, spawnMock, unref } = makeSpawn();
    const armed = armExitWatchdog({ pid: 777, timeoutMs: 5000, platform: 'win32', spawnFn });
    expect(armed).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnMock.mock.calls[0] as unknown as [string, string[], Record<string, unknown>];
    expect(command).toBe('powershell.exe');
    expect(args).toContain('-NoProfile');
    expect(args).toContain('-NonInteractive');
    // The script travels through cmd.exe, so it is one double-quoted argument.
    expect(args[args.length - 1]).toMatch(/^"[\s\S]*WaitForExit\(5000\)[\s\S]*"$/);
    // Measured: direct detached powershell never runs; non-detached dies with the parent.
    expect(options).toMatchObject({ detached: true, stdio: 'ignore', windowsHide: true, shell: true });
    expect(unref).toHaveBeenCalledTimes(1);
  });

  it('arms only once per process', () => {
    const { spawnFn, spawnMock } = makeSpawn();
    expect(armExitWatchdog({ pid: 1, platform: 'win32', spawnFn })).toBe(true);
    expect(armExitWatchdog({ pid: 1, platform: 'win32', spawnFn })).toBe(false);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing off win32 and never throws when spawn fails', () => {
    const { spawnFn, spawnMock } = makeSpawn();
    expect(armExitWatchdog({ pid: 1, platform: 'darwin', spawnFn })).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();

    resetExitWatchdogForTests();
    const failing = vi.fn(() => { throw new Error('spawn EPERM'); }) as unknown as typeof import('node:child_process').spawn;
    expect(armExitWatchdog({ pid: 1, platform: 'win32', spawnFn: failing })).toBe(false);
  });

  it('defaults to a single-digit-second grace so the process never lingers unnoticed', () => {
    expect(EXIT_WATCHDOG_TIMEOUT_MS).toBeGreaterThanOrEqual(3_000);
    expect(EXIT_WATCHDOG_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});

describe('main.ts wiring', () => {
  it("arms the watchdog from app.on('quit'), the last JS hook before the message loop dies", () => {
    expect(mainSource).toContain("from './runtime/exitWatchdog.js'");
    const quitHooks = mainSource.match(/app\.on\('quit'/g) ?? [];
    expect(quitHooks).toHaveLength(1);
    const start = mainSource.indexOf("app.on('quit'");
    const block = mainSource.slice(start, start + 600);
    expect(block).toContain('armExitWatchdog(');
  });

  it('terminates the base64 worker pool inside the common cleanup', () => {
    const cleanup = mainSource.slice(
      mainSource.indexOf('async function _runFullCleanup'),
      mainSource.indexOf("app.on('window-all-closed'"),
    );
    expect(cleanup).toContain("runCleanupStep('base64 worker pool'");
    expect(cleanup).toMatch(/base64 worker pool[\s\S]{0,300}globalBase64Pool\.terminate\(\)/);
  });
});

describe('browserSessionManager: our own browser.close() must not start the reconnect loop', () => {
  it('marks the account as closing before browser.close()', () => {
    const start = sessionSource.indexOf('async closeSession(');
    const body = sessionSource.slice(start, sessionSource.indexOf('\n    }\n', start + 1));
    expect(body).toMatch(/closingAccounts\.add\(accountId\)[\s\S]*session\.browser\.close\(\)/);
  });

  it('skips attemptReconnect in the disconnected handler for a closing account', () => {
    const start = sessionSource.indexOf("browser.on('disconnected'");
    const handler = sessionSource.slice(start, sessionSource.indexOf('attemptReconnect(accountId)', start));
    expect(handler).toMatch(/if \(this\.closingAccounts\.has\(accountId\)\)[\s\S]{0,400}return;/);
  });

  it('clears the closing mark when a fresh session is created for the same account', () => {
    const create = sessionSource.slice(
      sessionSource.indexOf('this.startKeepalive();'),
      sessionSource.indexOf("browser.on('disconnected'"),
    );
    expect(create).toContain('this.closingAccounts.delete(accountId)');
  });
});
