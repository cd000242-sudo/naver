/**
 * Dependency-free text-model constants shared by the main process and the
 * concatenated browser renderer. Keep this module free of imports so the
 * renderer build can inline it without leaving CommonJS aliases behind.
 */

/**
 * Anthropic Claude models verified for the current product tiers.
 * [2026-11-07] OPUS is the real Opus 5.5 again (the app's 'premium' tier); FABLE is its own top model
 * (UI selector 'claude-fable'). The two used to share one ID, which hid Opus from the screen entirely.
 */
export const CLAUDE_MODELS = {
  FABLE: 'claude-fable-5-1',
  OPUS: 'claude-opus-5-5',
  SONNET: 'claude-sonnet-5-5',
  HAIKU: 'claude-haiku-5-5',
} as const;

/** OpenAI text models used by API-based prompt generation. */
export const OPENAI_TEXT_MODELS = {
  /** [2026-11-07] Top tier (0 / 0 per 1M); selector 'openai-gpt6-astra'. */
  ASTRA: 'gpt-6-astra',
  LUNA: 'gpt-6-luna',
  TERRA: 'gpt-6.1-terra',
  SOL: 'gpt-6.1-sol',
  GPT_41: 'gpt-6.1-terra',
  GPT_41_MINI: 'gpt-6-luna',
} as const;

/**
 * [2026-11-03] Retired API text-model IDs -> the current ID of the same tier.
 * A saved explicit model (config, localStorage, scheduled job) keeps working and
 * lands on the user's tier (value / balanced / premium) instead of a dead ID.
 * Plain object literal on purpose: the renderer inline bundle (copy-static) turns `exports.X = {` into `const X = {`
 * but drops `exports.X = Object.freeze(...)` that refers to other exports — the table vanished from the bundle.
 */
export const RETIRED_API_TEXT_MODEL_IDS: Readonly<Record<string, string>> = {
  'gpt-5.6-luna': OPENAI_TEXT_MODELS.LUNA,
  'gpt-5.6-terra': OPENAI_TEXT_MODELS.TERRA,
  'gpt-5.6-sol': OPENAI_TEXT_MODELS.SOL,
  'gpt-4.1': OPENAI_TEXT_MODELS.TERRA,
  'gpt-4.1-mini': OPENAI_TEXT_MODELS.LUNA,
  'gpt-4.1-nano': OPENAI_TEXT_MODELS.LUNA,
  'claude-sonnet-5': CLAUDE_MODELS.SONNET,
  'claude-opus-5': CLAUDE_MODELS.OPUS,
  'claude-fable-5': CLAUDE_MODELS.FABLE,
  'claude-haiku-4-5-20251001': CLAUDE_MODELS.HAIKU,
  'claude-haiku-4-5': CLAUDE_MODELS.HAIKU,
};

/** Returns the current ID for a retired OpenAI/Claude text model; anything else is returned unchanged. */
export function migrateRetiredApiTextModelId(value: unknown): string {
  const id = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(RETIRED_API_TEXT_MODEL_IDS, id)
    ? RETIRED_API_TEXT_MODEL_IDS[id]
    : id;
}
