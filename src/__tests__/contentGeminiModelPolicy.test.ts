import { describe, expect, it } from 'vitest';
import { buildGeminiModelChain } from '../contentGeminiModelPolicy';

describe('contentGeminiModelPolicy', () => {
  it('defaults to the current balanced Gemini model regardless of plan label', () => {
    expect(buildGeminiModelChain().primaryModel).toBe('gemini-3.5-flash');
    expect(buildGeminiModelChain({ geminiPlanType: 'paid' }).primaryModel).toBe('gemini-3.5-flash');
    expect(buildGeminiModelChain({ geminiPlanType: 'free' }).primaryModel).toBe('gemini-3.5-flash');
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

  it('detects Pro models without adding hidden fallback models', () => {
    const result = buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-3.1-pro-preview' });

    expect(result.isPro).toBe(true);
    expect(result.uniqueModels).toEqual(['gemini-3.1-pro-preview']);
  });

  it('upgrades saved 2.5 selections without changing their tier', () => {
    expect(buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-flash-lite' }).primaryModel)
      .toBe('gemini-3.1-flash-lite');
    expect(buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-flash' }).primaryModel)
      .toBe('gemini-3.5-flash');
    expect(buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-pro' }).primaryModel)
      .toBe('gemini-3.1-pro-preview');
  });
});
