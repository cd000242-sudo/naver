import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGeminiCacheUnsupportedKeys,
  getGeminiCacheUnsupportedKeyCount,
  isGeminiCacheSupportedForKey,
  markGeminiCacheUnsupported,
} from '../contentGeminiCacheSupportRegistry';

describe('contentGeminiCacheSupportRegistry', () => {
  beforeEach(() => {
    clearGeminiCacheUnsupportedKeys();
  });

  it('treats new keys as cache-supported until a structural failure is recorded', () => {
    expect(isGeminiCacheSupportedForKey('new-key')).toBe(true);

    markGeminiCacheUnsupported('new-key', '403 Forbidden');

    expect(isGeminiCacheSupportedForKey('new-key')).toBe(false);
  });

  it('isolates unsupported learning per API key fingerprint', () => {
    markGeminiCacheUnsupported('failed-key', 'cache not supported');

    expect(isGeminiCacheSupportedForKey('failed-key')).toBe(false);
    expect(isGeminiCacheSupportedForKey('healthy-key')).toBe(true);
  });

  it('does not duplicate the same unsupported key entry or log repeatedly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    markGeminiCacheUnsupported('same-key', 'first');
    markGeminiCacheUnsupported('same-key', 'second');

    expect(getGeminiCacheUnsupportedKeyCount()).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
