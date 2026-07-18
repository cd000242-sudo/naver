/**
 * Dependency-free text-model constants shared by the main process and the
 * concatenated browser renderer. Keep this module free of imports so the
 * renderer build can inline it without leaving CommonJS aliases behind.
 */

/** Anthropic Claude models verified for the current product tiers. */
export const CLAUDE_MODELS = {
  FABLE: 'claude-fable-5',
  OPUS: 'claude-fable-5',
  SONNET: 'claude-sonnet-5',
  HAIKU: 'claude-haiku-4-5-20251001',
} as const;

/** OpenAI text models used by API-based prompt generation. */
export const OPENAI_TEXT_MODELS = {
  LUNA: 'gpt-5.6-luna',
  TERRA: 'gpt-5.6-terra',
  SOL: 'gpt-5.6-sol',
  GPT_41: 'gpt-5.6-terra',
  GPT_41_MINI: 'gpt-5.6-luna',
} as const;
