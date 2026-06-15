import { describe, expect, it } from 'vitest';
import { buildGeminiModelChain } from '../contentGeminiModelPolicy';

describe('contentGeminiModelPolicy', () => {
  it('defaults to gemini-2.5-flash regardless of plan label', () => {
    expect(buildGeminiModelChain().primaryModel).toBe('gemini-2.5-flash');
    expect(buildGeminiModelChain({ geminiPlanType: 'paid' }).primaryModel).toBe('gemini-2.5-flash');
    expect(buildGeminiModelChain({ geminiPlanType: 'free' }).primaryModel).toBe('gemini-2.5-flash');
  });

  it('respects an explicitly selected Gemini text model', () => {
    const result = buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-flash-lite' });

    expect(result.primaryModel).toBe('gemini-2.5-flash-lite');
    expect(result.uniqueModels).toEqual(['gemini-2.5-flash-lite']);
    expect(result.isPro).toBe(false);
  });

  it('falls back to flash when the saved model is not a Gemini model', () => {
    expect(buildGeminiModelChain({ primaryGeminiTextModel: 'openai-gpt41' }).primaryModel)
      .toBe('gemini-2.5-flash');
  });

  it('detects Pro models without adding hidden fallback models', () => {
    const result = buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-pro' });

    expect(result.isPro).toBe(true);
    expect(result.uniqueModels).toEqual(['gemini-2.5-pro']);
  });
});
