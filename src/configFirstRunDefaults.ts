// Engine defaults for a person who has never saved settings (no settings file at all).
//
// [2026-11-24] Approved by the owner: text = Claude Code subscription, images = Codex subscription.
// These are applied ONLY when the settings file does not exist yet. Anyone who already has a
// settings file keeps exactly what is stored there, including an empty engine choice: a saved
// file means a person already chose (or accepted) their setup, and it is never rewritten here.
export const FIRST_RUN_ENGINE_DEFAULTS = Object.freeze({
  primaryGeminiTextModel: 'agent-claude',
  defaultAiProvider: 'agent-claude',
  globalImageSource: 'codex-image',
} as const);

/** Copy of config with the first-run engine defaults filled in where a key is missing. */
export function withFirstRunEngineDefaults<T extends object>(config: T): T & typeof FIRST_RUN_ENGINE_DEFAULTS {
  const filled = { ...config } as Record<string, unknown>;
  for (const [key, value] of Object.entries(FIRST_RUN_ENGINE_DEFAULTS)) {
    if (filled[key] === undefined) filled[key] = value;
  }
  return filled as T & typeof FIRST_RUN_ENGINE_DEFAULTS;
}
