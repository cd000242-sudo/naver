import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({ spawn: spawnMock }));

import {
  getTrackedChildren,
  killAllTrackedChildren,
  trackChild,
  untrackChild,
} from '../runtime/childProcessRegistry';

class FakeTaskkill extends EventEmitter {}

describe('child process registry ownership', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    for (const child of getTrackedChildren()) untrackChild(child.pid);
  });

  it('retains a PID when taskkill fails and the process is still alive', async () => {
    const taskkill = new FakeTaskkill();
    spawnMock.mockReturnValue(taskkill);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    trackChild(51_001, 'stuck-child');

    const cleanup = killAllTrackedChildren();
    taskkill.emit('error', new Error('taskkill failed'));
    await cleanup;

    expect(getTrackedChildren()).toEqual([
      expect.objectContaining({ pid: 51_001, label: 'stuck-child' }),
    ]);
    killSpy.mockRestore();
    untrackChild(51_001);
  });

  it('untracks a PID only after taskkill completes and the process is gone', async () => {
    const taskkill = new FakeTaskkill();
    spawnMock.mockReturnValue(taskkill);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('not found'), { code: 'ESRCH' });
    });
    trackChild(51_002, 'closed-child');

    const cleanup = killAllTrackedChildren();
    taskkill.emit('exit', 0);
    await cleanup;

    expect(getTrackedChildren()).toEqual([]);
    killSpy.mockRestore();
  });
});
