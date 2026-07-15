import { GEMINI_TEXT_MODELS } from '../runtime/modelRegistry.js';

export const CONTENT_QUALITY_V3_GEMINI_MODEL = GEMINI_TEXT_MODELS.FLASH_LITE;

export const CONTENT_QUALITY_V3_NATIVE_SCHEMA_PROVIDERS = Object.freeze([
  'gemini',
] as const);

export type ContentQualityV3NativeSchemaProvider =
  typeof CONTENT_QUALITY_V3_NATIVE_SCHEMA_PROVIDERS[number];

export function supportsContentQualityV3NativeSchema(
  provider: unknown,
): provider is ContentQualityV3NativeSchemaProvider {
  return CONTENT_QUALITY_V3_NATIVE_SCHEMA_PROVIDERS.some(item => item === provider);
}

/** Pin only the explicit V3 driver; legacy keeps the user's existing model selection. */
export function resolveContentQualityV3GeminiModelOverride(
  promptVariant: unknown,
): typeof CONTENT_QUALITY_V3_GEMINI_MODEL | undefined {
  return promptVariant === 'v3' ? CONTENT_QUALITY_V3_GEMINI_MODEL : undefined;
}

/**
 * Exact V3 drafts consume only the fixed upstream evidence bundle. Keeping
 * search off here makes quality runs reproducible and prevents an unbounded
 * search-cost/currentness variable from entering the schema-generation step.
 * Returning undefined outside exact V3 preserves the legacy grounding choice.
 */
export function resolveContentQualityV3GeminiGroundingOverride(
  promptVariant: unknown,
): false | undefined {
  return promptVariant === 'v3' ? false : undefined;
}
