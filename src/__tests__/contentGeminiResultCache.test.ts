import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGeminiResultCache,
  getCachedGeminiResult,
  getGeminiResultCacheSize,
  setCachedGeminiResult,
} from '../contentGeminiResultCache';

describe('contentGeminiResultCache', () => {
  beforeEach(() => {
    clearGeminiResultCache();
  });

  it('stores and returns non-empty cached Gemini results', () => {
    setCachedGeminiResult('k1', 'cached text', 1_000);

    expect(getCachedGeminiResult('k1', 1_500)).toBe('cached text');
    expect(getGeminiResultCacheSize()).toBe(1);
  });

  it('ignores blank result text', () => {
    setCachedGeminiResult('blank', '   ', 1_000);

    expect(getCachedGeminiResult('blank', 1_500)).toBeUndefined();
    expect(getGeminiResultCacheSize()).toBe(0);
  });

  it('drops expired result entries after ten minutes', () => {
    setCachedGeminiResult('old', 'cached text', 1_000);

    expect(getCachedGeminiResult('old', 1_000 + 10 * 60 * 1000)).toBe('cached text');
    expect(getCachedGeminiResult('old', 1_001 + 10 * 60 * 1000)).toBeUndefined();
    expect(getGeminiResultCacheSize()).toBe(0);
  });

  it('evicts the oldest entry when the cache exceeds the max size', () => {
    for (let i = 0; i < 50; i++) {
      setCachedGeminiResult(`k${i}`, `text-${i}`, i);
    }

    setCachedGeminiResult('k50', 'text-50', 50);

    expect(getGeminiResultCacheSize()).toBe(50);
    expect(getCachedGeminiResult('k0', 51)).toBeUndefined();
    expect(getCachedGeminiResult('k50', 51)).toBe('text-50');
  });
});
