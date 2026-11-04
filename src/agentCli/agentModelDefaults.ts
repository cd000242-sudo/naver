// src/agentCli/agentModelDefaults.ts
// [2026-11-03 사장님] "클로드 코드면 기본 소넷 5.5, 코덱스는 테라면 충분." + "Codex Plus 사용자도 무리 없이 쓰게."
//
// The one place that names the model (and Codex reasoning effort) the app asks an agent CLI for when the
// caller names none. Without it the CLI picks its own default — for Codex that was the most expensive
// model, which drains a Plus subscription window. Pure on purpose (no imports): the renderer shows the
// same labels, so this file is also inlined into the renderer bundle.
//
// Precedence: a model the caller names (settings field, explicit option) always wins; this default only
// fills the gap. Codex ignores the user's ~/.codex/config.toml (runCodex passes --ignore-user-config),
// so the effort below is what actually runs. Gemini (agy) is intentionally absent.
//
// Tier: 'main' = long article generation, 'light' = short helper calls (connection check, search-plan
// analysis, JSON judgments, title/prompt inference). Callers say which; the default is 'main'.

export type AgentDefaultModelProvider = 'claude' | 'codex';
export type AgentTier = 'main' | 'light';

export interface AgentTierProfile {
  readonly model: string;
  /** Codex: `-c model_reasoning_effort=<value>`. Claude: `--effort <value>` (claudeRunner). */
  readonly effort?: 'low' | 'medium';
}

/**
 * gpt-6.1-terra needs Codex CLI >= 0.159.0 (see agentMinVersion). Light is the same model at lower effort:
 * 6.1 Terra is cheaper than or equal to the older small model and newer, so one model keeps the card simple.
 * Claude: Sonnet for both tiers — lowering light calls to Haiku is the owner's decision, not made here.
 */
export const AGENT_TIER_PROFILES: Readonly<Record<AgentDefaultModelProvider, Readonly<Record<AgentTier, AgentTierProfile>>>> = Object.freeze({
  // [2026-11-04] Claude effort = `--effort` (thinking depth). Owner target "글쓰기 2분대". Same harmony body prompt, measured:
  //   CLI default 487.7 s / 71,900 output tokens (answer overflowed, only its tail came back); medium 140~163 s;
  //   low 102.7~175.8 s, complete JSON both times, same structure (6 headings, ~2,000-char body, 4 title candidates).
  claude: Object.freeze({
    main: Object.freeze({ model: 'claude-sonnet-5-5', effort: 'low' as const }),
    light: Object.freeze({ model: 'claude-sonnet-5-5', effort: 'low' as const }),
  }),
  codex: Object.freeze({
    main: Object.freeze({ model: 'gpt-6.1-terra', effort: 'medium' as const }),
    light: Object.freeze({ model: 'gpt-6.1-terra', effort: 'low' as const }),
  }),
});

/**
 * [2026-11-03] The 'image' purpose: the Codex subscription image engine ('codex-image'). The model only hands the
 * prompt to the image_gen tool — the picture itself is the tool's — so the small fast model at low effort is enough
 * (measured on Codex CLI 0.166.0: gpt-6-luna 35s per image against 51-52s for terra/astra, same output quality).
 * A model the caller names still wins.
 */
export const AGENT_IMAGE_PROFILES: Readonly<Record<'codex', AgentTierProfile>> = Object.freeze({
  codex: Object.freeze({ model: 'gpt-6-luna', effort: 'low' as const }),
});

export function resolveAgentImageProfile(provider: 'codex', named?: string | null): AgentTierProfile {
  const profile = AGENT_IMAGE_PROFILES[provider];
  const model = typeof named === 'string' ? named.trim() : '';
  return model ? { ...profile, model } : profile;
}

/** Main-tier model ids (what the settings card calls "기본 모델"). */
export const AGENT_DEFAULT_MODELS: Readonly<Record<AgentDefaultModelProvider, string>> = Object.freeze({
  claude: AGENT_TIER_PROFILES.claude.main.model,
  codex: AGENT_TIER_PROFILES.codex.main.model,
});

/** Short names for the settings card status line. */
export const AGENT_DEFAULT_MODEL_LABELS: Readonly<Record<AgentDefaultModelProvider, string>> = Object.freeze({
  claude: 'Sonnet 5.5',
  codex: 'GPT-6.1 Terra',
});

function hasDefault(provider: string): provider is AgentDefaultModelProvider {
  return provider === 'claude' || provider === 'codex';
}

export function normalizeAgentTier(value: unknown): AgentTier {
  return value === 'light' ? 'light' : 'main';
}

export interface AgentRunProfile {
  readonly model?: string;
  readonly effort?: string;
  readonly tier: AgentTier;
}

/**
 * What a runner passes to its CLI. A named model wins; otherwise the tier's default. Codex effort always
 * comes from the tier (the user's config.toml is ignored). Gemini has no default: model/effort stay unset.
 */
export function resolveAgentRunProfile(
  provider: string,
  options: { model?: string | null; tier?: unknown } = {},
): AgentRunProfile {
  const tier = normalizeAgentTier(options.tier);
  const named = typeof options.model === 'string' ? options.model.trim() : '';
  if (!hasDefault(provider)) return { ...(named ? { model: named } : {}), tier };
  const profile = AGENT_TIER_PROFILES[provider][tier];
  return { model: named || profile.model, ...(profile.effort ? { effort: profile.effort } : {}), tier };
}

/** Model id only (main tier unless told otherwise); undefined for providers without a default. */
export function resolveAgentRunModel(provider: string, explicit?: string | null, tier?: AgentTier): string | undefined {
  return resolveAgentRunProfile(provider, { model: explicit, tier }).model;
}

/** One status-line fragment for the agent card; '' when there is nothing true to say (gemini). */
export function describeAgentModelLine(provider: string, savedModel?: string | null): string {
  const named = typeof savedModel === 'string' ? savedModel.trim() : '';
  if (named) return `모델: ${named}`;
  return hasDefault(provider) ? `기본 모델: ${AGENT_DEFAULT_MODEL_LABELS[provider]}` : '';
}
