import { beforeEach, describe, expect, it } from 'vitest';

import {
  getActivePipelineRun,
  releasePipelineRun,
  resetPipelineRunCoordinator,
  tryAcquirePipelineRun,
} from '../renderer/utils/pipelineRunCoordinator';

describe('pipeline run coordinator', () => {
  beforeEach(() => resetPipelineRunCoordinator());

  it('allows only one top-level pipeline at a time', () => {
    const first = tryAcquirePipelineRun('unified');
    const duplicate = tryAcquirePipelineRun('multi-account');

    expect(first).not.toBeNull();
    expect(duplicate).toBeNull();
    expect(getActivePipelineRun()).toEqual(first);
  });

  it('does not allow a stale or foreign lease to release the active run', () => {
    const first = tryAcquirePipelineRun('unified');
    expect(first).not.toBeNull();

    releasePipelineRun({
      id: 'foreign-lease',
      owner: 'multi-account',
      startedAt: Date.now(),
    });

    expect(getActivePipelineRun()).toEqual(first);
  });

  it('releases the matching lease and permits the next pipeline', () => {
    const first = tryAcquirePipelineRun('unified');
    expect(first).not.toBeNull();

    expect(releasePipelineRun(first!)).toBe(true);
    expect(getActivePipelineRun()).toBeNull();
    expect(tryAcquirePipelineRun('multi-account')).not.toBeNull();
  });

  it('returns immutable snapshots that cannot mutate coordinator state', () => {
    const lease = tryAcquirePipelineRun('unified');
    expect(lease).not.toBeNull();

    const snapshot = getActivePipelineRun()!;
    expect(snapshot).not.toBe(lease);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
