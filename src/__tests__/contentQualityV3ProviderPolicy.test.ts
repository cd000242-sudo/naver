import { describe, expect, it } from 'vitest';

import {
  CONTENT_QUALITY_V3_GEMINI_MODEL,
  CONTENT_QUALITY_V3_NATIVE_SCHEMA_PROVIDERS,
  resolveContentQualityV3GeminiGroundingOverride,
  resolveContentQualityV3GeminiModelOverride,
  supportsContentQualityV3NativeSchema,
} from '../contentQualityV3/providerPolicy';
import { GEMINI_TEXT_MODELS } from '../runtime/modelRegistry';

describe('Content Quality V3 provider policy', () => {
  it('allows only providers with a production-wired native output schema', () => {
    expect(CONTENT_QUALITY_V3_NATIVE_SCHEMA_PROVIDERS).toEqual(['gemini']);
    expect(supportsContentQualityV3NativeSchema('gemini')).toBe(true);
    expect(supportsContentQualityV3NativeSchema('agent-codex')).toBe(false);
  });

  it.each([
    'openai',
    'claude',
    'perplexity',
    'agent-codex',
    'agent-claude',
    'Gemini',
    ' gemini ',
    '',
    null,
    undefined,
    {},
  ])('fails closed for a provider without fully wired native schema (%s)', provider => {
    expect(supportsContentQualityV3NativeSchema(provider)).toBe(false);
  });

  it('exposes an immutable allowlist', () => {
    expect(Object.isFrozen(CONTENT_QUALITY_V3_NATIVE_SCHEMA_PROVIDERS)).toBe(true);
  });

  it('pins explicit v3 generation to Gemini 3.1 Flash-Lite and fails closed otherwise', () => {
    expect(CONTENT_QUALITY_V3_GEMINI_MODEL).toBe(GEMINI_TEXT_MODELS.FLASH_LITE);
    expect(CONTENT_QUALITY_V3_GEMINI_MODEL).toBe('gemini-3.1-flash-lite');
    expect(resolveContentQualityV3GeminiModelOverride('v3')).toBe(GEMINI_TEXT_MODELS.FLASH_LITE);
    expect(resolveContentQualityV3GeminiModelOverride('legacy')).toBeUndefined();
    expect(resolveContentQualityV3GeminiModelOverride('V3')).toBeUndefined();
    expect(resolveContentQualityV3GeminiModelOverride(undefined)).toBeUndefined();
  });

  it('disables Gemini grounding only for exact v3 schema calls and preserves legacy settings', () => {
    expect(resolveContentQualityV3GeminiGroundingOverride('v3')).toBe(false);
    expect(resolveContentQualityV3GeminiGroundingOverride('legacy')).toBeUndefined();
    expect(resolveContentQualityV3GeminiGroundingOverride('V3')).toBeUndefined();
    expect(resolveContentQualityV3GeminiGroundingOverride(undefined)).toBeUndefined();
  });
});
