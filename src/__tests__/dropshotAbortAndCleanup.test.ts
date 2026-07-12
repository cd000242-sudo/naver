import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  abortDropshotGenerations,
  closeAllDropshotContexts,
  getDropshotGenerationEpoch,
  isDropshotGenerationAborted,
  trackDropshotContext,
  untrackDropshotContext,
} from '../image/dropshotSession';

describe('Dropshot abort generation epoch', () => {
  it('invalidates in-flight and queued generations without invalidating a later request', () => {
    const beforeAbort = getDropshotGenerationEpoch();

    abortDropshotGenerations();
    const afterAbort = getDropshotGenerationEpoch();

    expect(isDropshotGenerationAborted(beforeAbort)).toBe(true);
    expect(isDropshotGenerationAborted(afterAbort)).toBe(false);
  });
});

describe('Dropshot context cleanup ownership', () => {
  beforeEach(async () => {
    await closeAllDropshotContexts(5);
  });

  it('returns by the deadline and retains a stuck context for a later cleanup attempt', async () => {
    const close = vi.fn(() => new Promise<void>(() => undefined));
    const context = { close };
    trackDropshotContext(context);

    const startedAt = Date.now();
    await expect(closeAllDropshotContexts(15)).rejects.toMatchObject({
      code: 'DROPSHOT_CLEANUP_INCOMPLETE',
    });
    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(close).toHaveBeenCalledTimes(1);

    await expect(closeAllDropshotContexts(15)).rejects.toMatchObject({
      code: 'DROPSHOT_CLEANUP_INCOMPLETE',
    });
    expect(close).toHaveBeenCalledTimes(2);
    untrackDropshotContext(context);
  });
});
