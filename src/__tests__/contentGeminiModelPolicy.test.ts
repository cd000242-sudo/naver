import { describe, expect, it } from 'vitest';
import { buildGeminiModelChain } from '../contentGeminiModelPolicy';

describe('contentGeminiModelPolicy', () => {
  it('defaults to the free/prepaid value model regardless of legacy plan label', () => {
    expect(buildGeminiModelChain().primaryModel).toBe('gemini-3.1-flash-lite');
    expect(buildGeminiModelChain({ geminiPlanType: 'paid' }).primaryModel).toBe('gemini-3.1-flash-lite');
    expect(buildGeminiModelChain({ geminiPlanType: 'free' }).primaryModel).toBe('gemini-3.1-flash-lite');
  });

  it('respects an explicitly selected Gemini text model', () => {
    const result = buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-3.1-flash-lite' });

    expect(result.primaryModel).toBe('gemini-3.1-flash-lite');
    expect(result.uniqueModels).toEqual(['gemini-3.1-flash-lite']);
    expect(result.isPro).toBe(false);
  });

  it('rejects a cross-provider selection instead of silently switching to Gemini', () => {
    expect(() => buildGeminiModelChain({ primaryGeminiTextModel: 'openai-gpt41' }))
      .toThrow('TEXT_MODEL_PROVIDER_MISMATCH');
  });

  it('coerces Pro/preview selections to the single safe prepaid Flash-Lite model', () => {
    const result = buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-3.1-pro-preview' });

    expect(result.isPro).toBe(false);
    expect(result.uniqueModels).toEqual(['gemini-3.1-flash-lite']);
  });

  it('preserves stable prepaid Flash choices while migrating stale or Pro choices safely', () => {
    expect(buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-flash-lite' }).primaryModel)
      .toBe('gemini-3.1-flash-lite');
    expect(buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-3.5-flash' }).primaryModel)
      .toBe('gemini-3.5-flash');
    // [2026-08-11] 레거시 2.5-flash 는 최신 Stable(3.6)로 올린다.
    //   명시적으로 3.5 를 고른 위 케이스는 그대로 유지된다 — 사용자 선택을 덮지 않는다.
    expect(buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-flash' }).primaryModel)
      .toBe('gemini-3.6-flash');
    expect(buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-pro' }).primaryModel)
      .toBe('gemini-3.1-flash-lite');
  });
});
