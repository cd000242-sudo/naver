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
    expect(buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-flash' }).primaryModel)
      .toBe('gemini-3.5-flash');
    expect(buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-pro' }).primaryModel)
      .toBe('gemini-3.1-flash-lite');
  });
});
