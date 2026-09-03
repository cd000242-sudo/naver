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
    // [2026-09-03 실측] gemini-3.5-flash 가 8,192 에서 2,161자, 12,288 에서 3,017자로 잘려 "본문을 찾지 못했습니다" 로 죽었고
    //   16,384 에서만 완주(5,334자). 3.x flash 는 생각(thinking) 토큰이 maxOutputTokens 에 같이 잡힌다. 매번 잘리는 상한은
    //   비용 절감이 아니라 고장이라, lite 가 아닌 3.x flash 는 pro 와 같은 16,384. lite 는 8,192 유지.
    maxOutputTokens: options.isPro || /3\.\d+-flash(?!-lite)/i.test(options.modelName)
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
