import { EventEmitter } from 'events';
import { isAbsolute } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { spawnCollect, startSpawnSession } from '../agentCli/spawnHelper';

function fakeStream(): EventEmitter & {
  setEncoding: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  return Object.assign(new EventEmitter(), {
    setEncoding: vi.fn(),
    write: vi.fn((_chunk: unknown, callback?: (error?: Error | null) => void) => {
      callback?.();
      return true;
    }),
    end: vi.fn(),
  });
}

function fakeChild(pid: number) {
  return Object.assign(new EventEmitter(), {
    pid,
    exitCode: null,
    signalCode: null,
    stdout: fakeStream(),
    stderr: fakeStream(),
    stdin: fakeStream(),
    kill: vi.fn().mockReturnValue(true),
  });
}

describe('Windows agent process-tree termination', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const windowsIt = process.platform === 'win32' ? it : it.skip;

  windowsIt('uses absolute taskkill /T /F before rejecting a timeout', async () => {
    const primary = fakeChild(41_001);
    const treeKiller = fakeChild(41_002);
    spawnMock.mockReturnValueOnce(primary).mockReturnValueOnce(treeKiller);

    const result = spawnCollect({
      command: process.execPath,
      args: [],
      provider: 'codex',
      timeoutMs: 100,
    });
    const rejection = expect(result).rejects.toMatchObject({ code: 'timeout' });

    await vi.advanceTimersByTimeAsync(100);

    expect(spawnMock).toHaveBeenCalledTimes(2);
    const [taskkillCommand, taskkillArgs, taskkillOptions] = spawnMock.mock.calls[1];
    expect(isAbsolute(String(taskkillCommand))).toBe(true);
    expect(String(taskkillCommand)).toMatch(/[\\/]System32[\\/]taskkill\.exe$/i);
    expect(taskkillArgs).toEqual(['/PID', '41001', '/T', '/F']);
    expect(taskkillOptions).toMatchObject({
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    });
    expect(primary.kill).not.toHaveBeenCalled();

    treeKiller.emit('close', 0);
    await rejection;
  });

  windowsIt('uses the same process-tree termination path for aborts', async () => {
    const primary = fakeChild(41_101);
    const treeKiller = fakeChild(41_102);
    spawnMock.mockReturnValueOnce(primary).mockReturnValueOnce(treeKiller);
    const controller = new AbortController();

    const result = spawnCollect({
      command: process.execPath,
      args: [],
      provider: 'claude',
      timeoutMs: 10_000,
      signal: controller.signal,
    });
    const rejection = expect(result).rejects.toMatchObject({ code: 'aborted' });

    controller.abort();
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[1][1]).toEqual(['/PID', '41101', '/T', '/F']);
    expect(primary.kill).not.toHaveBeenCalled();

    treeKiller.emit('close', 0);
    await rejection;
  });

  windowsIt('falls back to killing the direct child when taskkill fails', async () => {
    const primary = fakeChild(41_201);
    const treeKiller = fakeChild(41_202);
    spawnMock.mockReturnValueOnce(primary).mockReturnValueOnce(treeKiller);

    const result = spawnCollect({
      command: process.execPath,
      args: [],
      provider: 'codex',
      timeoutMs: 100,
    });
    const rejection = expect(result).rejects.toMatchObject({ code: 'timeout' });

    await vi.advanceTimersByTimeAsync(100);
    treeKiller.emit('close', 1);
    await rejection;

    expect(primary.kill).toHaveBeenCalledWith('SIGKILL');
  });

  windowsIt('bounds a hung taskkill attempt and preserves the original error', async () => {
    const primary = fakeChild(41_301);
    const treeKiller = fakeChild(41_302);
    spawnMock.mockReturnValueOnce(primary).mockReturnValueOnce(treeKiller);

    const result = spawnCollect({
      command: process.execPath,
      args: [],
      provider: 'codex',
      timeoutMs: 100,
    });
    const rejection = expect(result).rejects.toMatchObject({ code: 'timeout' });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(3_000);
    await rejection;

    expect(treeKiller.kill).toHaveBeenCalledWith('SIGKILL');
    expect(primary.kill).toHaveBeenCalledWith('SIGKILL');
  });

  windowsIt('does not invoke taskkill after a normal child exit', async () => {
    const primary = fakeChild(41_401);
    spawnMock.mockReturnValueOnce(primary);

    const result = spawnCollect({
      command: process.execPath,
      args: [],
      provider: 'claude',
      timeoutMs: 100,
    });
    primary.emit('close', 0);

    await expect(result).resolves.toMatchObject({ code: 0 });
    await vi.advanceTimersByTimeAsync(100);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('keeps interactive stdin open, streams chunks, and writes one line on demand', async () => {
    const primary = fakeChild(41_501);
    spawnMock.mockReturnValueOnce(primary);
    const onStdoutChunk = vi.fn();
    const onStderrChunk = vi.fn();

    const session = startSpawnSession({
      command: process.execPath,
      args: [],
      provider: 'claude',
      timeoutMs: 10_000,
      onStdoutChunk,
      onStderrChunk,
    });

    expect(primary.stdin.end).not.toHaveBeenCalled();
    primary.stdout.emit('data', 'first');
    primary.stderr.emit('data', 'second');
    expect(onStdoutChunk).toHaveBeenCalledWith('first');
    expect(onStderrChunk).toHaveBeenCalledWith('second');

    await expect(session.writeLine('oauth-code')).resolves.toBe('accepted');
    expect(primary.stdin.write).toHaveBeenCalledOnce();
    expect(Buffer.from(primary.stdin.write.mock.calls[0][0]).toString('utf8')).toBe('oauth-code\n');

    primary.emit('close', 0);
    await expect(session.result).resolves.toMatchObject({
      code: 0,
      stdout: 'first',
      stderr: 'second',
    });
  });

  it('bounds interactive writes, honors backpressure, and reports a closed stdin safely', async () => {
    const primary = fakeChild(41_503);
    spawnMock.mockReturnValueOnce(primary);
    let firstWriteCallback: ((error?: Error | null) => void) | undefined;
    primary.stdin.write.mockImplementation((_chunk: unknown, callback?: (error?: Error | null) => void) => {
      firstWriteCallback = callback;
      return false;
    });

    const session = startSpawnSession({
      command: process.execPath,
      args: [],
      provider: 'claude',
      timeoutMs: 10_000,
    });

    const first = session.writeLine('first-code');
    await expect(session.writeLine('must-not-queue')).resolves.toBe('busy');
    expect(primary.stdin.write).toHaveBeenCalledOnce();

    firstWriteCallback?.();
    primary.stdin.emit('drain');
    await expect(first).resolves.toBe('accepted');

    let failedWriteCallback: ((error?: Error | null) => void) | undefined;
    primary.stdin.write.mockImplementationOnce((_chunk: unknown, callback?: (error?: Error | null) => void) => {
      failedWriteCallback = callback;
      return true;
    });
    const failed = session.writeLine('epipe-code');
    primary.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    failedWriteCallback?.(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    await expect(failed).resolves.toBe('closed');
    await expect(session.writeLine('after-error')).resolves.toBe('closed');

    primary.emit('close', 1);
    await session.result;
  });

  it('preserves spawnCollect legacy behavior by closing stdin immediately', async () => {
    const primary = fakeChild(41_502);
    spawnMock.mockReturnValueOnce(primary);

    const result = spawnCollect({
      command: process.execPath,
      args: [],
      provider: 'codex',
      stdin: 'legacy-input',
      timeoutMs: 10_000,
    });

    expect(primary.stdin.write).toHaveBeenCalledOnce();
    expect(primary.stdin.end).toHaveBeenCalledOnce();
    primary.emit('close', 0);
    await expect(result).resolves.toMatchObject({ code: 0 });
  });
});
