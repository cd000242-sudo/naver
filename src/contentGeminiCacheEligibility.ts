export type GeminiPromptCacheEligibilityReason =
  | 'eligible'
  | 'env-opt-in-missing'
  | 'env-disabled'
  | 'unsupported-key'
  | 'system-too-short';

export interface GeminiPromptCacheEligibilityInput {
  modelName: string;
  systemTextLength: number;
  isKeySupported: boolean;
  cacheEnabledEnv?: string;
  cacheDisabledEnv?: string;
}

export interface GeminiPromptCacheEligibility {
  enabled: boolean;
  minCacheChars: number;
  reason: GeminiPromptCacheEligibilityReason;
}

export function getGeminiCacheMinChars(modelName: string): number {
  return modelName.includes('-pro') ? 8192 : 16384;
}

export function resolveGeminiPromptCacheEligibility(
  input: GeminiPromptCacheEligibilityInput,
): GeminiPromptCacheEligibility {
  const minCacheChars = getGeminiCacheMinChars(input.modelName);

  if (input.cacheDisabledEnv === '1') {
    return { enabled: false, minCacheChars, reason: 'env-disabled' };
  }

  if (input.cacheEnabledEnv !== '1') {
    return { enabled: false, minCacheChars, reason: 'env-opt-in-missing' };
  }

  if (!input.isKeySupported) {
    return { enabled: false, minCacheChars, reason: 'unsupported-key' };
  }

  if (input.systemTextLength < minCacheChars) {
    return { enabled: false, minCacheChars, reason: 'system-too-short' };
  }

  return { enabled: true, minCacheChars, reason: 'eligible' };
}
