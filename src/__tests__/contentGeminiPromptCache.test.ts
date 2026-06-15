import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGeminiPromptCache,
  deleteCachedGeminiPrompt,
  getCachedGeminiPrompt,
  getGeminiPromptCacheSize,
  pruneExpiredGeminiPromptCaches,
  setCachedGeminiPrompt,
} from '../contentGeminiPromptCache';

describe('contentGeminiPromptCache', () => {
  beforeEach(() => {
    clearGeminiPromptCache();
  });

  it('stores and returns fresh prompt cache entries', () => {
    setCachedGeminiPrompt('cache-key', {
      cacheName: 'cachedContents/abc',
      modelName: 'gemini-2.5-flash',
      createdAt: 1_000,
      ttlSeconds: 120,
    });

    expect(getCachedGeminiPrompt('cache-key', 30_000)?.cacheName).toBe('cachedContents/abc');
    expect(getGeminiPromptCacheSize()).toBe(1);
  });

  it('removes expired entries on lookup using the policy safety margin', () => {
    setCachedGeminiPrompt('near-expiry', {
      cacheName: 'cachedContents/expired',
      modelName: 'gemini-2.5-flash',
      createdAt: 0,
      ttlSeconds: 120,
    });

    expect(getCachedGeminiPrompt('near-expiry', 60_000)).toBeUndefined();
    expect(getGeminiPromptCacheSize()).toBe(0);
  });

  it('prunes all expired entries and returns the removed cache entries for logging', () => {
    setCachedGeminiPrompt('fresh', {
      cacheName: 'cachedContents/fresh',
      modelName: 'gemini-2.5-pro',
      createdAt: 55_000,
      ttlSeconds: 120,
    });
    setCachedGeminiPrompt('expired', {
      cacheName: 'cachedContents/old',
      modelName: 'gemini-2.5-flash',
      createdAt: 0,
      ttlSeconds: 120,
    });

    const removed = pruneExpiredGeminiPromptCaches(60_000);

    expect(removed.map((entry) => entry.cacheName)).toEqual(['cachedContents/old']);
    expect(getCachedGeminiPrompt('fresh', 60_000)?.cacheName).toBe('cachedContents/fresh');
    expect(getGeminiPromptCacheSize()).toBe(1);
  });

  it('deletes stale cache entries after cached-content stream failures', () => {
    setCachedGeminiPrompt('cache-key', {
      cacheName: 'cachedContents/bad',
      modelName: 'gemini-2.5-flash',
      createdAt: 1_000,
      ttlSeconds: 120,
    });

    expect(deleteCachedGeminiPrompt('cache-key')).toBe(true);
    expect(deleteCachedGeminiPrompt('cache-key')).toBe(false);
    expect(getGeminiPromptCacheSize()).toBe(0);
  });
});
