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

  it('defaults to one regeneration retry while cost saver is on', () => {
    expect(resolveContentGenerationCostPolicy({}).maxAttempts).toBe(1);
    expect(resolveContentGenerationCostPolicy({ costSaverMode: true }).maxAttempts).toBe(1);
    expect(resolveContentGenerationCostPolicy({ costSaverMode: false }).maxAttempts).toBe(2);
  });

  it('disables hidden extra LLM patch calls unless explicitly opted in', () => {
    const defaultPolicy = resolveContentGenerationCostPolicy({});
    expect(defaultPolicy.allowLlmTitlePatch).toBe(false);
    expect(defaultPolicy.allowLlmIntroPatch).toBe(false);
    expect(defaultPolicy.allowQualityGateSelfCritique).toBe(false);

    const premiumPolicy = resolveContentGenerationCostPolicy({ costSaverMode: false });
    expect(premiumPolicy.allowLlmTitlePatch).toBe(false);
    expect(premiumPolicy.allowLlmIntroPatch).toBe(false);
    expect(premiumPolicy.allowQualityGateSelfCritique).toBe(false);

    const explicitExtraWorkPolicy = resolveContentGenerationCostPolicy(
      { costSaverMode: false },
      { CONTENT_ALLOW_EXTRA_LLM_PATCHES: '1' },
    );
    expect(explicitExtraWorkPolicy.allowLlmTitlePatch).toBe(true);
    expect(explicitExtraWorkPolicy.allowLlmIntroPatch).toBe(true);
    expect(explicitExtraWorkPolicy.allowQualityGateSelfCritique).toBe(true);
  });

  it('keeps expensive patch opt-in off when cost saver is on even if env is set', () => {
    const costSaverPolicy = resolveContentGenerationCostPolicy(
      { costSaverMode: true },
      { CONTENT_ALLOW_EXTRA_LLM_PATCHES: '1' },
    );
    expect(costSaverPolicy.allowLlmTitlePatch).toBe(false);
    expect(costSaverPolicy.allowLlmIntroPatch).toBe(false);
    expect(costSaverPolicy.allowQualityGateSelfCritique).toBe(false);
  });

  it('lets an environment override raise the attempt budget deliberately', () => {
    expect(resolveContentGenerationCostPolicy({}, { CONTENT_MAX_ATTEMPTS: '3' }).maxAttempts).toBe(3);
    expect(resolveContentGenerationCostPolicy({}, { CONTENT_MAX_ATTEMPTS: 'not-a-number' }).maxAttempts).toBe(1);
  });
});
