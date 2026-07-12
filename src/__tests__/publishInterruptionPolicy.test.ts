import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { resolveInterruptedPublishStatus } from '../renderer/utils/publishInterruptionPolicy';

describe('publish interruption policy', () => {
  it('quarantines every interruption after the publish call starts', () => {
    expect(resolveInterruptedPublishStatus(true, 'cancelled')).toBe('uncertain');
    expect(resolveInterruptedPublishStatus(true, 'pending')).toBe('uncertain');
  });

  it('keeps pre-publish interruptions safely replayable', () => {
    expect(resolveInterruptedPublishStatus(false, 'cancelled')).toBe('cancelled');
    expect(resolveInterruptedPublishStatus(false, 'pending')).toBe('pending');
  });

  it('applies the quarantine before continuous retry and in multi-account failures', () => {
    const continuousSource = readFileSync(
      new URL('../renderer/modules/continuousPublishing.ts', import.meta.url),
      'utf8',
    );
    const multiSource = readFileSync(
      new URL('../renderer/modules/multiAccountManager.ts', import.meta.url),
      'utf8',
    );
    const quarantineIndex = continuousSource.indexOf("if ((item as any)._publishStarted)");
    const retryIndex = continuousSource.indexOf('const retryCount', quarantineIndex);

    expect(quarantineIndex).toBeGreaterThanOrEqual(0);
    expect(retryIndex).toBeGreaterThan(quarantineIndex);
    expect(multiSource).toContain('if (publishStarted)');
    expect(multiSource).toContain("resolveInterruptedPublishStatus(true, 'failed')");
  });
});
