import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({ spawn: spawnMock }));

import {
  getTrackedChildren,
  killAllTrackedChildren,
  trackChild,
  untrackChild,
} from '../runtime/childProcessRegistry';

class FakeTaskkill extends EventEmitter {}

const originalPlatform = process.platform;

describe('child process registry ownership', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    spawnMock.mockReset();
    for (const child of getTrackedChildren()) untrackChild(child.pid);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const child of getTrackedChildren()) untrackChild(child.pid);
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('retains a PID when taskkill fails and the process is still alive', async () => {
    const taskkill = new FakeTaskkill();
    spawnMock.mockReturnValue(taskkill);
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    trackChild(51_001, 'stuck-child');

    const cleanup = killAllTrackedChildren();
    taskkill.emit('error', new Error('taskkill failed'));
    await cleanup;

    expect(getTrackedChildren()).toEqual([
      expect.objectContaining({ pid: 51_001, label: 'stuck-child' }),
    ]);
  });

  it('untracks a PID only after taskkill completes and the process is gone', async () => {
    const taskkill = new FakeTaskkill();
    spawnMock.mockReturnValue(taskkill);
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('not found'), { code: 'ESRCH' });
    });
    trackChild(51_002, 'closed-child');

    const cleanup = killAllTrackedChildren();
    taskkill.emit('exit', 0);
    await cleanup;

    expect(getTrackedChildren()).toEqual([]);
  });
});
