export interface GeminiBudgetSafetyConfig {
  geminiPlanType?: string;
  geminiCreditBudget?: unknown;
}

export interface GeminiUsageSnapshotLike {
  estimatedCostUSD?: unknown;
}

export interface GeminiBudgetSafetyDeps {
  flushUsage: () => Promise<void>;
  getUsageSnapshot: () => Promise<GeminiUsageSnapshotLike>;
  warn?: (message: string) => void;
  error?: (message: string) => void;
}

export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly currentUsageUSD: number,
    public readonly budgetUSD: number,
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

function getGeminiBudgetUSD(config: GeminiBudgetSafetyConfig): number {
  const value = Number(config.geminiCreditBudget);
  return Number.isFinite(value) && value > 0 ? value : 300;
}

function getSpentUSD(usage: GeminiUsageSnapshotLike): number {
  const value = Number(usage.estimatedCostUSD);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export async function enforceGeminiBudgetSafety(
  config: GeminiBudgetSafetyConfig | null | undefined,
  deps: GeminiBudgetSafetyDeps,
): Promise<void> {
  if (config?.geminiPlanType !== 'paid') return;

  const warn = deps.warn ?? console.warn;
  const error = deps.error ?? console.error;

  try {
    await deps.flushUsage();
    const usage = await deps.getUsageSnapshot();
    const budget = getGeminiBudgetUSD(config);
    const spent = getSpentUSD(usage);
    const ratio = spent / budget;

    if (spent >= budget) {
      const msg = `🛡️ Safety Lock 발동: 예산 한도 도달 ($${spent.toFixed(2)} / $${budget}). 설정 → Gemini → 예산을 상향하거나 사용량을 초기화하세요.`;
      error(`[Gemini] ${msg}`);
      throw new BudgetExceededError(msg, spent, budget);
    }

    if (ratio >= 0.9) {
      warn(`[Gemini] ⚠️ 예산 90% 경고: $${spent.toFixed(2)} / $${budget} (${(ratio * 100).toFixed(1)}%)`);
    }
  } catch (e) {
    if (e instanceof BudgetExceededError) throw e;
    warn(`[Gemini] Safety Lock 체크 실패(무시하고 진행): ${(e as Error).message}`);
  }
}
