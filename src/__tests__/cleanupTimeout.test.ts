import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CleanupTimeoutError,
  DEFAULT_CLEANUP_TIMEOUT_MS,
  withCleanupTimeout,
} from '../runtime/cleanupTimeout';

describe('withCleanupTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the cleanup result and clears its hard-timeout timer', async () => {
    vi.useFakeTimers();

    await expect(withCleanupTimeout(
      () => Promise.resolve('closed'),
      1_000,
      'browser.close:test',
    )).resolves.toBe('closed');

    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a cleanup task that never settles after its own deadline', async () => {
    vi.useFakeTimers();

    const pending = withCleanupTimeout(
      () => new Promise<void>(() => undefined),
      250,
      'browser.close:stuck',
    );
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'CleanupTimeoutError',
      cleanupLabel: 'browser.close:stuck',
      timeoutMs: 250,
    });

    await vi.advanceTimersByTimeAsync(250);

    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the default deadline when a task does not provide one', async () => {
    vi.useFakeTimers();

    const pending = withCleanupTimeout(() => new Promise<void>(() => undefined));
    const rejection = expect(pending).rejects.toMatchObject({
      cleanupLabel: 'cleanup task',
      timeoutMs: DEFAULT_CLEANUP_TIMEOUT_MS,
    });

    await vi.advanceTimersByTimeAsync(DEFAULT_CLEANUP_TIMEOUT_MS);

    await rejection;
  });

  it('rejects an invalid deadline before starting cleanup', async () => {
    const cleanup = vi.fn();

    await expect(withCleanupTimeout(cleanup, 0, 'invalid'))
      .rejects.toBeInstanceOf(RangeError);

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('preserves a synchronous cleanup failure', async () => {
    const failure = new Error('close failed');

    await expect(withCleanupTimeout(
      () => {
        throw failure;
      },
      1_000,
      'browser.close:failed',
    )).rejects.toBe(failure);

    expect(failure).not.toBeInstanceOf(CleanupTimeoutError);
  });
});
