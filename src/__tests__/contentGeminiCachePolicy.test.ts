import { describe, expect, it } from 'vitest';
import {
  apiKeyFingerprint,
  getGeminiPromptCacheKey,
  getGeminiResultCacheKey,
  isGeminiCacheExpired,
  isStructuralGeminiCacheError,
} from '../contentGeminiCachePolicy';

describe('contentGeminiCachePolicy', () => {
  it('creates stable short fingerprints without leaking raw API key text', () => {
    const key = 'AIzaSy-REAL-SECRET-KEY-DO-NOT-LEAK';
    const fingerprint = apiKeyFingerprint(key);

    expect(fingerprint).toHaveLength(12);
    expect(fingerprint).toMatch(/^[a-f0-9]{12}$/);
    expect(fingerprint).toBe(apiKeyFingerprint(key));
    expect(fingerprint).not.toContain('REAL');
    expect(fingerprint).not.toContain('SECRET');
  });

  it('separates prompt cache keys by model and system prompt', () => {
    const keyA = getGeminiPromptCacheKey('system prompt', 'gemini-2.5-flash');
    const keyB = getGeminiPromptCacheKey('system prompt', 'gemini-2.5-pro');
    const keyC = getGeminiPromptCacheKey('other system prompt', 'gemini-2.5-flash');

    expect(keyA).toHaveLength(32);
    expect(keyA).toMatch(/^[a-f0-9]{32}$/);
    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });

  it('rounds temperature in result cache keys exactly like the generation path', () => {
    const base = {
      modelName: 'gemini-2.5-flash',
      systemText: 'system',
      userText: 'user',
      useGrounding: false,
    };

    expect(getGeminiResultCacheKey({ ...base, temperature: 0.704 }))
      .toBe(getGeminiResultCacheKey({ ...base, temperature: 0.7 }));
    expect(getGeminiResultCacheKey({ ...base, temperature: 0.706 }))
      .not.toBe(getGeminiResultCacheKey({ ...base, temperature: 0.7 }));
  });

  it('expires prompt caches with the 60 second safety margin', () => {
    const now = 1_000_000;
    const fresh = { cacheName: 'fresh', modelName: 'gemini-2.5-flash', createdAt: now - 30_000, ttlSeconds: 120 };
    const nearExpiry = { cacheName: 'near', modelName: 'gemini-2.5-flash', createdAt: now - 60_000, ttlSeconds: 120 };

    expect(isGeminiCacheExpired(fresh, now)).toBe(false);
    expect(isGeminiCacheExpired(nearExpiry, now)).toBe(true);
  });

  it('classifies structural cache failures without treating transient server errors as permanent', () => {
    expect(isStructuralGeminiCacheError('403 Forbidden: caching requires paid plan')).toBe(true);
    expect(isStructuralGeminiCacheError('400 Bad Request: cached content invalid')).toBe(true);
    expect(isStructuralGeminiCacheError('This model does not support caching')).toBe(true);
    expect(isStructuralGeminiCacheError('Gemini cache create timeout (10s)')).toBe(true);

    expect(isStructuralGeminiCacheError('503 Service Unavailable')).toBe(false);
    expect(isStructuralGeminiCacheError('ECONNRESET')).toBe(false);
  });
});
