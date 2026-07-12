import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const processMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  trackChild: vi.fn(),
  untrackChild: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: processMocks.spawn,
}));

vi.mock('ffmpeg-static', () => ({
  default: 'C:\\tools\\ffmpeg.exe',
}));

vi.mock('../runtime/childProcessRegistry.js', () => ({
  trackChild: processMocks.trackChild,
  untrackChild: processMocks.untrackChild,
}));

import { convertMp4ToGif } from '../image/gifConverter';
import { browserSessionManager } from '../browserSessionManager';

class FakeChildProcess extends EventEmitter {
  readonly kill = vi.fn(() => true);

  constructor(readonly pid: number) {
    super();
  }
}

const browserSessionSource = fs.readFileSync(
  path.resolve(__dirname, '../browserSessionManager.ts'),
  'utf8',
);
const imageHandlersSource = fs.readFileSync(
  path.resolve(__dirname, '../main/ipc/imageHandlers.ts'),
  'utf8',
);

describe('cleanup resource ownership', () => {
  beforeEach(() => {
    processMocks.spawn.mockReset();
    processMocks.trackChild.mockReset();
    processMocks.untrackChild.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('puts every BrowserSessionManager browser.close behind a hard timeout', () => {
    const closeCalls = browserSessionSource.match(/session\.browser\.close\(\)/g) ?? [];
    const timedCloseCalls = browserSessionSource.match(
      /withCleanupTimeout\(\s*\(\)\s*=>\s*session\.browser\.close\(\)/g,
    ) ?? [];

    expect(browserSessionSource).toContain("from './runtime/cleanupTimeout.js'");
    expect(closeCalls.length).toBeGreaterThan(0);
    expect(timedCloseCalls).toHaveLength(closeCalls.length);
  });

  it('tracks and untracks both ffmpeg children spawned by image IPC handlers', () => {
    const spawnCalls = imageHandlersSource.match(/const ffmpeg = spawn/g) ?? [];
    const trackCalls = imageHandlersSource.match(/trackChild\(ffmpegPid,/g) ?? [];
    const untrackCalls = imageHandlersSource.match(/untrackChild\(ffmpegPid\)/g) ?? [];

    expect(imageHandlersSource).toContain("from '../../runtime/childProcessRegistry.js'");
    expect(spawnCalls.length).toBeGreaterThan(0);
    expect(trackCalls).toHaveLength(spawnCalls.length);
    expect(untrackCalls).toHaveLength(spawnCalls.length * 2);
  });

  it('tracks gifConverter ffmpeg until the child closes', async () => {
    const child = new FakeChildProcess(41_001);
    processMocks.spawn.mockReturnValue(child);

    const conversion = convertMp4ToGif('sample.mp4');

    expect(processMocks.trackChild).toHaveBeenCalledWith(41_001, expect.any(String));
    expect(processMocks.untrackChild).not.toHaveBeenCalled();

    child.emit('close', 0);

    await expect(conversion).resolves.toBe('sample.gif');
    expect(processMocks.untrackChild).toHaveBeenCalledOnce();
    expect(processMocks.untrackChild).toHaveBeenCalledWith(41_001);
  });

  it('untracks gifConverter ffmpeg when the child emits an error', async () => {
    const child = new FakeChildProcess(41_002);
    const failure = new Error('spawn failed');
    processMocks.spawn.mockReturnValue(child);

    const conversion = convertMp4ToGif('broken.mp4');
    child.emit('error', failure);

    await expect(conversion).rejects.toBe(failure);
    expect(processMocks.untrackChild).toHaveBeenCalledOnce();
    expect(processMocks.untrackChild).toHaveBeenCalledWith(41_002);
  });

  const aspectRatioCases: Array<[string, number, string, number]> = [
    ['1:1', 320, 'crop=320:320', 41_011],
    ['9:16', 360, 'crop=360:640', 41_012],
  ];

  it.each(aspectRatioCases)('builds the %s conversion filter while preserving child ownership', async (
    aspectRatio,
    width,
    expectedCrop,
    pid,
  ) => {
    const child = new FakeChildProcess(pid);
    processMocks.spawn.mockReturnValue(child);

    const conversion = convertMp4ToGif('ratio.mp4', {
      aspectRatio,
      fps: 15,
      width,
    });
    const args = processMocks.spawn.mock.calls[0][1] as string[];

    expect(args).toContain('-vf');
    expect(args.join(' ')).toContain(expectedCrop);
    expect(processMocks.trackChild).toHaveBeenCalledWith(pid, expect.any(String));

    child.emit('close', 0);
    await expect(conversion).resolves.toBe('ratio.gif');
    expect(processMocks.untrackChild).toHaveBeenCalledWith(pid);
  });

  it('keeps timed-out ffmpeg registered until close confirms process exit', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(41_003);
    processMocks.spawn.mockReturnValue(child);

    const conversion = convertMp4ToGif('stuck.mp4');
    const rejection = expect(conversion).rejects.toThrow('timeout');

    await vi.advanceTimersByTimeAsync(60_000);

    await rejection;
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(processMocks.untrackChild).not.toHaveBeenCalled();

    child.emit('close', null);
    expect(processMocks.untrackChild).toHaveBeenCalledWith(41_003);
  });

  it('retains a timed-out browser session until a later close succeeds', async () => {
    const manager = browserSessionManager as any;
    const accountId = 'cleanup-owner-test';
    const close = vi.fn(() => new Promise<void>(() => undefined));
    const browser = { close, process: () => undefined };
    const session = {
      accountId,
      browser,
      page: {},
      isLoggedIn: true,
      loginVerifiedAt: Date.now(),
      lastActivity: Date.now(),
      createdAt: Date.now(),
      profileDir: '',
      proxyUrl: undefined,
      locked: false,
      lockedAt: 0,
    };
    const originalTimeout = manager.BROWSER_CLOSE_TIMEOUT_MS;
    manager.BROWSER_CLOSE_TIMEOUT_MS = 15;
    manager.sessions.set(accountId, session);

    try {
      await expect(manager.closeSession(accountId, true)).resolves.toBe(false);
      expect(manager.sessions.get(accountId)).toBe(session);

      close.mockResolvedValueOnce(undefined);
      await expect(manager.closeSession(accountId, true)).resolves.toBe(true);
      expect(manager.sessions.has(accountId)).toBe(false);
    } finally {
      manager.sessions.delete(accountId);
      manager.BROWSER_CLOSE_TIMEOUT_MS = originalTimeout;
    }
  });

  it('does not bypass close ownership in expiry, proxy-change, or reconnect paths', () => {
    expect(browserSessionSource).not.toMatch(
      /await this\.closeSession\(accountId, true\);\s*this\.sessions\.delete\(accountId\)/,
    );
    expect(browserSessionSource).toContain('proxySessionClosed');
    expect(browserSessionSource).toContain('expiredSessionClosed');
    expect(browserSessionSource).toContain('disconnectedSessionClosed');
    expect(browserSessionSource).toContain('BROWSER_SESSION_CLEANUP_INCOMPLETE');
  });

  it('surfaces incomplete close-all cleanup while retaining failed sessions', async () => {
    const manager = browserSessionManager as any;
    const accountId = 'cleanup-all-owner-test';
    const session = {
      accountId,
      browser: {
        close: vi.fn(() => new Promise<void>(() => undefined)),
        process: () => undefined,
      },
      page: {},
      isLoggedIn: true,
      loginVerifiedAt: Date.now(),
      lastActivity: Date.now(),
      createdAt: Date.now(),
      profileDir: '',
      proxyUrl: undefined,
      locked: false,
      lockedAt: 0,
    };
    const originalTimeout = manager.BROWSER_CLOSE_TIMEOUT_MS;
    manager.BROWSER_CLOSE_TIMEOUT_MS = 15;
    manager.sessions.set(accountId, session);

    try {
      await expect(manager.closeAllSessions()).rejects.toThrow('cleanup incomplete');
      expect(manager.sessions.get(accountId)).toBe(session);
    } finally {
      manager.sessions.delete(accountId);
      manager.BROWSER_CLOSE_TIMEOUT_MS = originalTimeout;
    }
  });
});
