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
      // [2026-09-03] 3.x flash 는 생각 토큰까지 출력 한도에 잡힌다 — 실측 8192·12288 모두 절단, 16384 완주
      maxOutputTokens: /3\.\d+-flash(?!-lite)/i.test(GEMINI_TEXT_MODELS.FLASH) ? 16384 : 12288,
    });
  });

  // [2026-09-03 실측] 등록 상수가 아닌 3.x flash(gemini-3.5-flash)가 8,192 구간에 떨어져 2,161자에서 잘렸다.
  it('3.x flash 는 16384, lite 는 8192', () => {
    expect(buildGeminiGenerationConfig({ activeTemperature: 0.5, modelName: 'gemini-3.5-flash', isPro: false }).maxOutputTokens).toBe(16384);
    expect(buildGeminiGenerationConfig({ activeTemperature: 0.5, modelName: 'gemini-3.1-flash-lite', isPro: false }).maxOutputTokens).toBe(8192);
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
