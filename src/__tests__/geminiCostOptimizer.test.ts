import { describe, expect, it } from 'vitest';
import {
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

  it('uses tier-aware retry budgets while preserving a bounded pipeline', () => {
    expect(resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'gemini-3.1-flash-lite' }).maxAttempts).toBe(1);
    expect(resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'gemini-3.5-flash' }).maxAttempts).toBe(2);
    expect(resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'gemini-3.1-pro-preview' }).maxAttempts).toBe(3);
    expect(resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'openai-gpt41' }).maxAttempts).toBe(2);
    expect(resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'claude-opus' }).maxAttempts).toBe(3);
  });

  it('keeps value economical and enables localized repair for balanced and premium tiers', () => {
    const valuePolicy = resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'openai-gpt4o-mini' });
    expect(valuePolicy.modelTier).toBe('value');
    expect(valuePolicy.allowLlmTitlePatch).toBe(false);
    expect(valuePolicy.allowLlmIntroPatch).toBe(false);
    expect(valuePolicy.allowQualityGateSelfCritique).toBe(false);

    const balancedPolicy = resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'claude-sonnet' });
    expect(balancedPolicy.modelTier).toBe('balanced');
    expect(balancedPolicy.allowLlmTitlePatch).toBe(true);
    expect(balancedPolicy.allowLlmIntroPatch).toBe(true);
    expect(balancedPolicy.allowQualityGateSelfCritique).toBe(true);

    const premiumPolicy = resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'openai-gpt4o' });
    expect(premiumPolicy.modelTier).toBe('premium');
    expect(premiumPolicy.allowLlmTitlePatch).toBe(true);
    expect(premiumPolicy.allowLlmIntroPatch).toBe(true);
    expect(premiumPolicy.allowQualityGateSelfCritique).toBe(true);
  });

  it('allows operators to disable extra localized repair without weakening hard gates', () => {
    const disabledPolicy = resolveContentGenerationCostPolicy(
      { primaryGeminiTextModel: 'gemini-3.1-pro-preview' },
      { CONTENT_ALLOW_EXTRA_LLM_PATCHES: '0' },
    );
    expect(disabledPolicy.allowLlmTitlePatch).toBe(false);
    expect(disabledPolicy.allowLlmIntroPatch).toBe(false);
    expect(disabledPolicy.allowQualityGateSelfCritique).toBe(false);
  });

  it('lets an environment override raise the attempt budget deliberately', () => {
    expect(resolveContentGenerationCostPolicy({}, { CONTENT_MAX_ATTEMPTS: '3' }).maxAttempts).toBe(3);
    expect(resolveContentGenerationCostPolicy(
      { primaryGeminiTextModel: 'gemini-3.1-flash-lite' },
      { CONTENT_MAX_ATTEMPTS: 'not-a-number' },
    ).maxAttempts).toBe(1);
  });

  it('injects a silent quality audit that never permits invented facts', () => {
    const policy = resolveContentGenerationCostPolicy({ primaryGeminiTextModel: 'gemini-3.5-flash' });
    expect(policy.qualityDirective).toContain('silent quality audit');
    expect(policy.qualityDirective).toContain('Do not invent');
    expect(policy.qualityDirective).toContain('valid JSON');
    expect(policy.qualityDirective).toContain('90');
  });
});
