import { describe, expect, it } from 'vitest';
import {
  allowsPaidEmptyResponseRetry,
  buildGeminiKeyExecutionPlan,
  resolveContentGenerationCostPolicy,
} from '../geminiCostOptimizer';

describe('Gemini cost optimizer policy', () => {
  it('uses supplemental free-quota keys before the paid primary key by default', () => {
    const plan = buildGeminiKeyExecutionPlan({
      primaryApiKey: 'paid-main',
      extraApiKeys: ['free-a', 'free-b', 'paid-main', 'free-a'],
      planType: 'paid',
    });

    expect(plan.keys).toEqual(['free-a', 'free-b', 'paid-main']);
    expect(plan.freeQuotaFirst).toBe(true);
  });

  it('uses supplemental free-quota keys before the primary key in automatic mode', () => {
    const plan = buildGeminiKeyExecutionPlan({
      primaryApiKey: 'main-key',
      extraApiKeys: ['free-project-a', 'free-project-b'],
      planType: 'auto',
    });

    expect(plan.keys).toEqual(['free-project-a', 'free-project-b', 'main-key']);
    expect(plan.freeQuotaFirst).toBe(true);
  });

  it('keeps automatic mode stable when no supplemental keys exist', () => {
    const plan = buildGeminiKeyExecutionPlan({
      primaryApiKey: 'main-key',
      planType: 'auto',
    });

    expect(plan.keys).toEqual(['main-key']);
    expect(plan.freeQuotaFirst).toBe(false);
  });

  it('keeps the primary key first when free-quota-first is disabled', () => {
    const plan = buildGeminiKeyExecutionPlan({
      primaryApiKey: 'paid-main',
      extraApiKeys: ['free-a', 'free-b'],
      planType: 'paid',
      useFreeQuotaBeforePaid: false,
    });

    expect(plan.keys).toEqual(['paid-main', 'free-a', 'free-b']);
    expect(plan.freeQuotaFirst).toBe(false);
  });

  it('keeps the primary key first for free-plan users', () => {
    const plan = buildGeminiKeyExecutionPlan({
      primaryApiKey: 'free-main',
      extraApiKeys: ['free-b'],
      planType: 'free',
    });

    expect(plan.keys).toEqual(['free-main', 'free-b']);
    expect(plan.freeQuotaFirst).toBe(false);
  });

  it('uses exactly one paid top-level request by default for every model tier', () => {
    expect(resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'gemini-3.1-flash-lite' }).maxAttempts).toBe(0);
    expect(resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'gemini-3.5-flash' }).maxAttempts).toBe(0);
    expect(resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'gemini-3.1-pro-preview' }).maxAttempts).toBe(0);
    expect(resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'openai-gpt41' }).maxAttempts).toBe(0);
    expect(resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'claude-opus' }).maxAttempts).toBe(0);
  });

  it('keeps localized paid repair disabled by default for every model tier', () => {
    const valuePolicy = resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'openai-gpt4o-mini' });
    expect(valuePolicy.modelTier).toBe('value');
    expect(valuePolicy.allowLlmTitlePatch).toBe(false);
    expect(valuePolicy.allowLlmIntroPatch).toBe(false);
    expect(valuePolicy.allowQualityGateSelfCritique).toBe(false);

    const balancedPolicy = resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'claude-sonnet' });
    expect(balancedPolicy.modelTier).toBe('balanced');
    expect(balancedPolicy.allowLlmTitlePatch).toBe(false);
    expect(balancedPolicy.allowLlmIntroPatch).toBe(false);
    expect(balancedPolicy.allowQualityGateSelfCritique).toBe(false);

    const premiumPolicy = resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'openai-gpt4o' });
    expect(premiumPolicy.modelTier).toBe('premium');
    expect(premiumPolicy.allowLlmTitlePatch).toBe(false);
    expect(premiumPolicy.allowLlmIntroPatch).toBe(false);
    expect(premiumPolicy.allowQualityGateSelfCritique).toBe(false);
  });

  it('allows operators to explicitly opt in to extra localized repair', () => {
    const enabledPolicy = resolveContentGenerationCostPolicy(
      { primaryGeminiTextModel: 'gemini-3.1-pro-preview' },
      { CONTENT_ALLOW_EXTRA_LLM_PATCHES: '1' },
    );
    expect(enabledPolicy.allowLlmTitlePatch).toBe(true);
    expect(enabledPolicy.allowLlmIntroPatch).toBe(true);
    expect(enabledPolicy.allowQualityGateSelfCritique).toBe(true);
  });

  it('lets an environment override raise the attempt budget deliberately', () => {
    expect(resolveContentGenerationCostPolicy({}, { CONTENT_MAX_ATTEMPTS: '3' }).maxAttempts).toBe(3);
    expect(resolveContentGenerationCostPolicy(
      { primaryGeminiTextModel: 'gemini-3.1-flash-lite' },
      { CONTENT_MAX_ATTEMPTS: 'not-a-number' },
    ).maxAttempts).toBe(0);
  });

  it('requires explicit consent before retrying a potentially billed empty response', () => {
    expect(allowsPaidEmptyResponseRetry({})).toBe(false);
    expect(allowsPaidEmptyResponseRetry({ CONTENT_ALLOW_PAID_EMPTY_RESPONSE_RETRY: '0' })).toBe(false);
    expect(allowsPaidEmptyResponseRetry({ CONTENT_ALLOW_PAID_EMPTY_RESPONSE_RETRY: '1' })).toBe(true);
  });

  it('injects a silent quality audit that never permits invented facts', () => {
    const policy = resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'gemini-3.5-flash' });
    expect(policy.qualityDirective).toContain('silent quality audit');
    expect(policy.qualityDirective).toContain('Do not invent');
    expect(policy.qualityDirective).toContain('valid JSON');
    expect(policy.qualityDirective).toContain('90');
  });
});
