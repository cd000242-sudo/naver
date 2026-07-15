import {
  resolveTextModelProfile,
  type TextModelTier,
} from './runtime/modelRegistry.js';

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
  primaryGeminiTextModel?: string;
}

export interface ContentGenerationCostPolicy {
  costSaverOn: boolean;
  maxAttempts: number;
  allowLlmTitlePatch: boolean;
  allowLlmIntroPatch: boolean;
  allowQualityGateSelfCritique: boolean;
  useFreeQuotaBeforePaid: boolean;
  modelTier: TextModelTier;
  qualityDirective: string;
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
  const modelProfile = resolveTextModelProfile(config?.primaryGeminiTextModel);
  const tierAttemptBudget: Record<TextModelTier, number> = {
    value: 1,
    balanced: 2,
    premium: 3,
  };
  const defaultAttemptBudget = Math.max(tierAttemptBudget[modelProfile.tier], costSaverOn ? 1 : 2);
  const maxAttempts = parseAttemptOverride(env.CONTENT_MAX_ATTEMPTS) ?? defaultAttemptBudget;

  // Post-generation LLM patches spend another paid request. Keep them strictly
  // opt-in so a usable first draft is never discarded by a score-only gate.
  const patchOverride = env.CONTENT_ALLOW_EXTRA_LLM_PATCHES;
  const allowLocalizedRepair = patchOverride === '1';

  return {
    costSaverOn,
    maxAttempts,
    allowLlmTitlePatch: allowLocalizedRepair,
    allowLlmIntroPatch: allowLocalizedRepair,
    allowQualityGateSelfCritique: allowLocalizedRepair,
    useFreeQuotaBeforePaid: config?.geminiUseFreeQuotaBeforePaid !== false,
    modelTier: modelProfile.tier,
    qualityDirective: buildModelTierQualityDirective(modelProfile.tier),
  };
}

export function buildModelTierQualityDirective(tier: TextModelTier): string {
  const auditDepth = tier === 'premium'
    ? 'Run two silent review-and-rewrite passes before the final answer.'
    : tier === 'balanced'
      ? 'Run one silent review-and-rewrite pass before the final answer.'
      : 'Run one concise silent quality audit before the final answer.';

  return `[MODEL TIER QUALITY CONTRACT: ${tier}]
Perform a silent quality audit of the complete article.
${auditDepth}
Target a quality score of 90 or higher on the first complete draft.
- Return valid JSON in exactly the schema requested by the main prompt.
- Keep the title, introduction, section order, conclusion, and keyword intent coherent.
- Make every section concrete, useful, non-repetitive, and natural to a Korean reader.
- Do not invent facts, prices, experiences, sources, benefits, or specifications.
- Resolve weaknesses silently; never output this audit, hidden reasoning, or a score.`;
}
