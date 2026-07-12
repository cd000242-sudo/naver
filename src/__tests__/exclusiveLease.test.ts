import { describe, expect, it } from 'vitest';

import { ExclusiveLeaseCoordinator } from '../runtime/exclusiveLease';

describe('ExclusiveLeaseCoordinator', () => {
  it('allows one owner at a time and rejects foreign release attempts', () => {
    const coordinator = new ExclusiveLeaseCoordinator();
    const first = coordinator.tryAcquire('manual');

    expect(first).not.toBeNull();
    expect(coordinator.tryAcquire('scheduler')).toBeNull();
    expect(coordinator.release({ ...first!, token: 'foreign-token' })).toBe(false);
    expect(coordinator.snapshot()?.owner).toBe('manual');
    expect(coordinator.release(first!)).toBe(true);
    expect(coordinator.snapshot()).toBeNull();
  });

  it('returns immutable leases and does not let stale leases release a newer run', () => {
    const coordinator = new ExclusiveLeaseCoordinator();
    const first = coordinator.tryAcquire('first')!;
    expect(Object.isFrozen(first)).toBe(true);
    expect(coordinator.release(first)).toBe(true);

    const second = coordinator.tryAcquire('second')!;
    expect(coordinator.release(first)).toBe(false);
    expect(coordinator.snapshot()).toEqual(second);
  });
});

