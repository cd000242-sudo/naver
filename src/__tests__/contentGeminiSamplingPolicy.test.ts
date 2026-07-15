import { describe, expect, it } from 'vitest';
import {
  buildGeminiGenerationConfig,
  resolveGeminiEmptyResponseRetryTemperature,
} from '../contentGeminiSamplingPolicy';
import { GEMINI_TEXT_MODELS } from '../runtime/modelRegistry';

describe('Gemini sampling policy', () => {
  it('omits every sampling override for exact V3 while retaining schema JSON mode', () => {
    const schema = Object.freeze({ type: 'object' });

    const config = buildGeminiGenerationConfig({
      activeTemperature: 0.5,
      modelName: 'gemini-3.1-flash-lite',
      isPro: false,
      schema,
      useModelDefaultSampling: true,
    });

    expect(config).not.toHaveProperty('temperature');
    expect(config).not.toHaveProperty('topP');
    expect(config).not.toHaveProperty('topK');
    expect(config).toMatchObject({
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: schema,
    });
  });

  it('preserves the exact legacy request sampling values and model token policy', () => {
    expect(buildGeminiGenerationConfig({
      activeTemperature: 0.45,
      modelName: GEMINI_TEXT_MODELS.FLASH,
      isPro: false,
    })).toEqual({
      temperature: 0.45,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 12288,
    });
  });

  it('never changes V3 sampling during empty-response recovery but keeps legacy bumping', () => {
    expect(resolveGeminiEmptyResponseRetryTemperature(0.5, true)).toBe(0.5);
    expect(resolveGeminiEmptyResponseRetryTemperature(0.5, false)).toBe(0.6);
    expect(resolveGeminiEmptyResponseRetryTemperature(0.95, false)).toBe(1);
  });

  it('retains the existing Pro and legacy 2.5 token/thinking branches', () => {
    expect(buildGeminiGenerationConfig({
      activeTemperature: 0.6,
      modelName: GEMINI_TEXT_MODELS.PRO,
      isPro: true,
    }).maxOutputTokens).toBe(16384);

    expect(buildGeminiGenerationConfig({
      activeTemperature: 0.5,
      modelName: 'gemini-2.5-flash',
      isPro: false,
    })).toMatchObject({
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
    });
  });
});
