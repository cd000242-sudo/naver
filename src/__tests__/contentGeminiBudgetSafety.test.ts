import { describe, expect, it, vi } from 'vitest';
import {
  BudgetExceededError,
  enforceGeminiBudgetSafety,
} from '../contentGeminiBudgetSafety';

function createDeps(estimatedCostUSD: number) {
  return {
    flushUsage: vi.fn(async () => undefined),
    getUsageSnapshot: vi.fn(async () => ({ estimatedCostUSD })),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('contentGeminiBudgetSafety', () => {
  it('skips safety-lock usage reads for non-paid Gemini plans', async () => {
    const deps = createDeps(500);

    await enforceGeminiBudgetSafety({ geminiPlanType: 'free', geminiCreditBudget: 300 }, deps);
    await enforceGeminiBudgetSafety({ geminiPlanType: 'auto', geminiCreditBudget: 300 }, deps);

    expect(deps.flushUsage).not.toHaveBeenCalled();
    expect(deps.getUsageSnapshot).not.toHaveBeenCalled();
  });

  it('warns but does not block when paid usage reaches 90 percent of budget', async () => {
    const deps = createDeps(270);

    await enforceGeminiBudgetSafety({ geminiPlanType: 'paid', geminiCreditBudget: 300 }, deps);

    expect(deps.flushUsage).toHaveBeenCalledTimes(1);
    expect(deps.getUsageSnapshot).toHaveBeenCalledTimes(1);
    expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('예산 90% 경고'));
    expect(deps.error).not.toHaveBeenCalled();
  });

  it('throws BudgetExceededError when paid usage reaches the configured budget', async () => {
    const deps = createDeps(301);

    await expect(enforceGeminiBudgetSafety({ geminiPlanType: 'paid', geminiCreditBudget: 300 }, deps))
      .rejects.toMatchObject({
        name: 'BudgetExceededError',
        currentUsageUSD: 301,
        budgetUSD: 300,
      });

    expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('Safety Lock 발동'));
  });

  it('falls back to the default budget when the configured budget is missing or invalid', async () => {
    const deps = createDeps(300);

    await expect(enforceGeminiBudgetSafety({ geminiPlanType: 'paid', geminiCreditBudget: 'not-a-number' }, deps))
      .rejects.toBeInstanceOf(BudgetExceededError);

    await expect(enforceGeminiBudgetSafety({ geminiPlanType: 'paid' }, createDeps(300)))
      .rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('does not block generation when usage loading fails', async () => {
    const deps = {
      flushUsage: vi.fn(async () => {
        throw new Error('usage store unavailable');
      }),
      getUsageSnapshot: vi.fn(async () => ({ estimatedCostUSD: 999 })),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await enforceGeminiBudgetSafety({ geminiPlanType: 'paid', geminiCreditBudget: 300 }, deps);

    expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('Safety Lock 체크 실패'));
    expect(deps.error).not.toHaveBeenCalled();
  });
});
