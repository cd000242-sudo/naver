import { describe, expect, it } from 'vitest';
import {
  getGeminiCacheMinChars,
  resolveGeminiPromptCacheEligibility,
} from '../contentGeminiCacheEligibility';

describe('contentGeminiCacheEligibility', () => {
  it('uses stricter Flash cache minimum and lower Pro cache minimum', () => {
    expect(getGeminiCacheMinChars('gemini-2.5-flash')).toBe(16_384);
    expect(getGeminiCacheMinChars('gemini-2.5-pro')).toBe(8_192);
  });

  it('keeps Gemini prompt caching off unless explicitly opted in', () => {
    const result = resolveGeminiPromptCacheEligibility({
      modelName: 'gemini-2.5-flash',
      systemTextLength: 20_000,
      isKeySupported: true,
      cacheEnabledEnv: undefined,
      cacheDisabledEnv: undefined,
    });

    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('env-opt-in-missing');
  });

  it('lets explicit disable win even when cache opt-in is set', () => {
    const result = resolveGeminiPromptCacheEligibility({
      modelName: 'gemini-2.5-pro',
      systemTextLength: 20_000,
      isKeySupported: true,
      cacheEnabledEnv: '1',
      cacheDisabledEnv: '1',
    });

    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('env-disabled');
  });

  it('blocks unsupported keys and short system prompts', () => {
    expect(resolveGeminiPromptCacheEligibility({
      modelName: 'gemini-2.5-pro',
      systemTextLength: 20_000,
      isKeySupported: false,
      cacheEnabledEnv: '1',
    }).reason).toBe('unsupported-key');

    expect(resolveGeminiPromptCacheEligibility({
      modelName: 'gemini-2.5-flash',
      systemTextLength: 16_383,
      isKeySupported: true,
      cacheEnabledEnv: '1',
    }).reason).toBe('system-too-short');
  });

  it('enables cache only when opt-in, key support, and minimum prompt length all pass', () => {
    const result = resolveGeminiPromptCacheEligibility({
      modelName: 'gemini-2.5-flash',
      systemTextLength: 16_384,
      isKeySupported: true,
      cacheEnabledEnv: '1',
    });

    expect(result).toEqual({
      enabled: true,
      minCacheChars: 16_384,
      reason: 'eligible',
    });
  });
});
