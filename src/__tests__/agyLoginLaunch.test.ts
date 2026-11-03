import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const spawn = vi.hoisted(() => vi.fn());
const resolveTarget = vi.hoisted(() => vi.fn());
vi.mock('../agentCli/spawnHelper', () => ({ spawnCollect: spawn, resolveWindowsSpawnTarget: resolveTarget }));
import { openAgyLoginTerminal } from '../agentCli/agyLogin.js';
let root: string; const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'agy-launch-test-')); spawn.mockReset().mockResolvedValue({ code: 0, stdout: '', stderr: '' }); resolveTarget.mockReset(); });
afterEach(() => { Object.defineProperty(process, 'platform', platformDescriptor); rmSync(root, { recursive: true, force: true }); });
describe('interactive agy launcher command boundary', () => {
  it('passes Windows metacharacter paths only as environment data to a fixed local script', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const executable = 'C:\\Users\\A&B%PATH%!\\managed\\agy.exe'; resolveTarget.mockReturnValue({ command: executable, prefixArgs: [] });
    await openAgyLoginTerminal({ Path: 'C:\\Windows' }); const call = spawn.mock.calls[0][0];
    expect(call.command).toMatch(/WindowsPowerShell.*powershell\.exe$/i);
    expect(call.args.join(' ')).toContain('Start-Process'); expect(call.args.join(' ')).not.toContain(executable);
    expect(call.env.LDB_AGY_LOGIN_EXECUTABLE).toBe(executable); expect(call.args).toContain('-NoProfile');
  });
  it('resolves the POSIX binary from the provided PATH before opening macOS Terminal', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const executable = path.join(root, 'agy'); writeFileSync(executable, 'fixture-not-executed'); chmodSync(executable, 0o700);
    await openAgyLoginTerminal({ PATH: root });
    expect(spawn.mock.calls[0][0]).toMatchObject({ command: '/usr/bin/open', args: ['-a', 'Terminal', executable] });
  });
  it('fails before any launcher when no actual CLI exists and gives Linux a manual path', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    await expect(openAgyLoginTerminal({ PATH: root })).rejects.toMatchObject({ code: 'not_installed' }); expect(spawn).not.toHaveBeenCalled();
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const executable = path.join(root, 'agy'); writeFileSync(executable, 'fixture-not-executed'); chmodSync(executable, 0o700);
    await expect(openAgyLoginTerminal({ PATH: root })).rejects.toThrow(executable); expect(spawn).not.toHaveBeenCalled();
  });
  it('reports a failed terminal launch without claiming authentication', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' }); resolveTarget.mockReturnValue({ command: 'C:\\managed\\agy.exe', prefixArgs: [] });
    spawn.mockResolvedValue({ code: 1, stdout: '', stderr: '' });
    await expect(openAgyLoginTerminal({})).rejects.toMatchObject({ code: 'spawn_failed' });
  });
});
