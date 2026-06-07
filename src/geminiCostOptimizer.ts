export type GeminiPlanType = 'auto' | 'free' | 'paid';

export interface GeminiKeyExecutionPlanInput {
  primaryApiKey?: string;
  extraApiKeys?: string[];
  planType?: GeminiPlanType;
  useFreeQuotaBeforePaid?: boolean;
}

export interface GeminiKeyExecutionPlan {
  keys: string[];
  freeQuotaFirst: boolean;
}

export interface ContentGenerationCostPolicyInput {
  costSaverMode?: boolean;
  geminiUseFreeQuotaBeforePaid?: boolean;
}

export interface ContentGenerationCostPolicy {
  costSaverOn: boolean;
  maxAttempts: number;
  allowLlmTitlePatch: boolean;
  allowLlmIntroPatch: boolean;
  allowQualityGateSelfCritique: boolean;
  useFreeQuotaBeforePaid: boolean;
}

function normalizeKeyList(keys: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of keys) {
    const key = String(raw || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

function parseAttemptOverride(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.floor(parsed);
}

export function buildGeminiKeyExecutionPlan(input: GeminiKeyExecutionPlanInput): GeminiKeyExecutionPlan {
  const primary = String(input.primaryApiKey || '').trim();
  const extras = normalizeKeyList(input.extraApiKeys || []).filter((key) => key !== primary);
  const shouldUseFreeFirst =
    input.planType !== 'free'
    && input.useFreeQuotaBeforePaid !== false
    && extras.length > 0;

  return {
    keys: shouldUseFreeFirst
      ? normalizeKeyList([...extras, primary])
      : normalizeKeyList([primary, ...extras]),
    freeQuotaFirst: shouldUseFreeFirst,
  };
}

export function resolveContentGenerationCostPolicy(
  config: ContentGenerationCostPolicyInput | null | undefined,
  env: Record<string, string | undefined> = process.env,
): ContentGenerationCostPolicy {
  const costSaverOn = config?.costSaverMode !== false;
  const maxAttempts = parseAttemptOverride(env.CONTENT_MAX_ATTEMPTS) ?? (costSaverOn ? 1 : 2);
  // Extra LLM patches run after the main article call. They can improve a
  // title/intro edge case, but they also turn one user action into multiple
  // provider requests and can burn low-tier RPM. Keep them explicit opt-in.
  const allowExpensiveLlmPatch = !costSaverOn && env.CONTENT_ALLOW_EXTRA_LLM_PATCHES === '1';

  return {
    costSaverOn,
    maxAttempts,
    allowLlmTitlePatch: allowExpensiveLlmPatch,
    allowLlmIntroPatch: allowExpensiveLlmPatch,
    allowQualityGateSelfCritique: allowExpensiveLlmPatch,
    useFreeQuotaBeforePaid: config?.geminiUseFreeQuotaBeforePaid !== false,
  };
}
