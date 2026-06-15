import { describe, expect, it } from 'vitest';
import { getContentProviderTimeoutMs } from '../contentProviderTimeoutPolicy';

describe('contentProviderTimeoutPolicy', () => {
  it('uses bounded generation timeouts by requested article length', () => {
    expect(getContentProviderTimeoutMs(500)).toBe(60_000);
    expect(getContentProviderTimeoutMs(1800)).toBe(90_000);
    expect(getContentProviderTimeoutMs(3500)).toBe(120_000);
    expect(getContentProviderTimeoutMs(7000)).toBe(150_000);
    expect(getContentProviderTimeoutMs(12_000)).toBe(180_000);
  });

  it('adds only a small retry multiplier so retries do not create long hangs', () => {
    expect(getContentProviderTimeoutMs(1800, 1)).toBe(94_500);
    expect(getContentProviderTimeoutMs(1800, 2)).toBe(99_000);
    expect(getContentProviderTimeoutMs(1800, 99)).toBe(99_000);
  });

  it('normalizes invalid input to the short-content timeout', () => {
    expect(getContentProviderTimeoutMs(Number.NaN)).toBe(60_000);
    expect(getContentProviderTimeoutMs(-100)).toBe(60_000);
  });
});
