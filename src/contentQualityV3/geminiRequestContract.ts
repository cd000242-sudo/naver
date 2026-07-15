import { buildGeminiGenerationConfig } from '../contentGeminiSamplingPolicy.js';
import { splitPromptByMarker } from '../promptSplitter.js';
import { CONTENT_QUALITY_V3_GEMINI_MODEL } from './providerPolicy.js';
import { CONTENT_QUALITY_V3_OUTPUT_SCHEMA } from './schema.js';

export const CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY_BRAND =
  'content-quality-v3/strict-single-call/v1' as const;

export const CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY = Object.freeze({
  brand: CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY_BRAND,
  maxTopLevelRetries: 0,
  maxNetworkRetries: 0,
  maxProviderCalls: 1,
  allowPromptCache: false,
  allowResultCache: false,
  allowKeyRotation: false,
  allowPromptAugmentation: false,
  allowRateLimitRetry: false,
  allowServerRetry: false,
  allowGenericRetry: false,
} as const);

export type ContentQualityV3StrictSingleCallPolicy =
  typeof CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY;

export interface ContentQualityV3GeminiRequestConfig {
  readonly contents: readonly [{
    readonly role: 'user';
    readonly parts: readonly [{ readonly text: string }];
  }];
  readonly systemInstruction?: {
    readonly role: 'system';
    readonly parts: readonly [{ readonly text: string }];
  };
  readonly generationConfig: Readonly<Record<string, unknown>>;
  readonly safetySettings: readonly Readonly<{
    category: string;
    threshold: 'BLOCK_NONE';
  }>[];
}

export interface ContentQualityV3GeminiRequestEnvelope {
  readonly model: typeof CONTENT_QUALITY_V3_GEMINI_MODEL;
  readonly useGrounding: false;
  readonly systemText: string;
  readonly userText: string;
  readonly requestConfig: ContentQualityV3GeminiRequestConfig;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

/** Build the exact provider-visible request used by both runtime and evidence checks. */
export function createContentQualityV3GeminiRequestEnvelope(
  prompt: string,
): Readonly<ContentQualityV3GeminiRequestEnvelope> {
  const { system: systemText, user: userText } = splitPromptByMarker(prompt);
  const requestConfig: ContentQualityV3GeminiRequestConfig = {
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    ...(systemText ? {
      systemInstruction: { role: 'system' as const, parts: [{ text: systemText }] },
    } : {}),
    generationConfig: buildGeminiGenerationConfig({
      activeTemperature: 0.9,
      modelName: CONTENT_QUALITY_V3_GEMINI_MODEL,
      isPro: false,
      schema: CONTENT_QUALITY_V3_OUTPUT_SCHEMA,
      useModelDefaultSampling: true,
    }),
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  return deepFreeze({
    model: CONTENT_QUALITY_V3_GEMINI_MODEL,
    useGrounding: false,
    systemText,
    userText,
    requestConfig,
  });
}

/**
 * The installed Google SDK normalizes `systemInstruction` by mutating its
 * input. Keep the canonical evidence envelope immutable and detach a mutable
 * transport copy only at the SDK boundary.
 */
export function createContentQualityV3GeminiSdkRequest(
  envelope: Readonly<ContentQualityV3GeminiRequestEnvelope>,
): ContentQualityV3GeminiRequestConfig {
  return structuredClone(envelope.requestConfig);
}
