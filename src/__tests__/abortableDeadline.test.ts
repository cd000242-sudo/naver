import { describe, expect, it, vi } from 'vitest';

import {
  OperationDeadlineExceededError,
  withAbortableDeadline,
} from '../runtime/abortableDeadline';
import { ExclusiveLeaseCoordinator } from '../runtime/exclusiveLease';

describe('withAbortableDeadline', () => {
  it('returns a completed operation without invoking timeout cleanup', async () => {
    const onTimeout = vi.fn();

    await expect(withAbortableDeadline(
      async () => 'done',
      { timeoutMs: 100, operationLabel: 'scheduled publish', onTimeout },
    )).resolves.toBe('done');
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('aborts a hung operation, bounds cleanup, and rejects with a stable code', async () => {
    const onTimeout = vi.fn(() => new Promise<void>(() => undefined));
    const startedAt = Date.now();

    await expect(withAbortableDeadline(
      () => new Promise<string>(() => undefined),
      {
        timeoutMs: 15,
        cleanupTimeoutMs: 15,
        operationLabel: 'scheduled publish',
        onTimeout,
      },
    )).rejects.toMatchObject({
      name: 'OperationDeadlineExceededError',
      code: 'OPERATION_DEADLINE_EXCEEDED',
    } satisfies Partial<OperationDeadlineExceededError>);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(Date.now() - startedAt).toBeLessThan(250);
  });

  it('allows a following run after a timed-out owner releases its lease in finally', async () => {
    const coordinator = new ExclusiveLeaseCoordinator();
    const firstLease = coordinator.tryAcquire('scheduled-1')!;

    try {
      await withAbortableDeadline(
        () => new Promise<void>(() => undefined),
        { timeoutMs: 10, operationLabel: 'scheduled-1' },
      );
    } catch {
      // The scheduler's finally owns release, regardless of success/timeout.
    } finally {
      coordinator.release(firstLease);
    }

    expect(coordinator.tryAcquire('scheduled-2')).not.toBeNull();
  });
});
