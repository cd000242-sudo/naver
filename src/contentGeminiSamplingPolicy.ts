import { GEMINI_TEXT_MODELS } from './runtime/modelRegistry.js';

export interface GeminiGenerationConfigOptions {
  readonly activeTemperature: number;
  readonly modelName: string;
  readonly isPro: boolean;
  readonly schema?: Record<string, unknown>;
  readonly useModelDefaultSampling?: boolean;
}

export function buildGeminiGenerationConfig(
  options: GeminiGenerationConfigOptions,
): Record<string, unknown> {
  return {
    ...(options.useModelDefaultSampling ? {} : {
      temperature: options.activeTemperature,
      topP: 0.95,
      topK: 40,
    }),
    maxOutputTokens: options.isPro
      ? 16384
      : options.modelName === GEMINI_TEXT_MODELS.FLASH
        ? 12288
        : 8192,
    ...(/2\.5-flash/i.test(options.modelName) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    ...(options.schema ? {
      responseMimeType: 'application/json',
      responseSchema: options.schema,
    } : {}),
  };
}

export function resolveGeminiEmptyResponseRetryTemperature(
  activeTemperature: number,
  useModelDefaultSampling: boolean,
): number {
  return useModelDefaultSampling
    ? activeTemperature
    : Math.min(1, activeTemperature + 0.1);
}
