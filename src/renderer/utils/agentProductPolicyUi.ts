export type SelectableTextProvider =
  | 'gemini'
  | 'openai'
  | 'claude'
  | 'perplexity'
  | 'agent-codex'
  | 'agent-claude';

export interface SafeTextModelSelection {
  readonly model: string;
  readonly provider: SelectableTextProvider;
}

export interface PersistedTextModelMigration {
  readonly changed: boolean;
  readonly selection: SafeTextModelSelection;
  readonly config: Readonly<Record<string, unknown>>;
}

type AgentStatusProvider = 'codex' | 'claude';

const SAFE_SEMVER = '(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?)';
const SAFE_CODEX_VERSION = new RegExp(`^Codex CLI ${SAFE_SEMVER}$`, 'i');
const SAFE_CLAUDE_VERSION = new RegExp(`^Claude Code ${SAFE_SEMVER}$`, 'i');
const SAFE_BARE_VERSION = new RegExp(`^v?${SAFE_SEMVER}$`, 'i');

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_CLAUDE_API_MODEL = 'claude-haiku';

function modelToProvider(model: string): SelectableTextProvider {
  if (model === 'agent-codex' || model === 'agent-claude') return model;
  if (model === 'perplexity-sonar') return 'perplexity';
  if (
    model === 'openai-gpt4o'
    || model === 'openai-gpt4o-mini'
    || model === 'openai-gpt41'
    || model === 'openai-gpt4o-search'
  ) return 'openai';
  if (model === 'claude-haiku' || model === 'claude-sonnet' || model === 'claude-opus') {
    return 'claude';
  }
  return 'gemini';
}

/** Normalize a disabled subscription selection without affecting Codex or API-key routes. */
export function resolveTextModelSelection(
  selectedModel: string | undefined,
  claudeApiKey: string | undefined,
  claudeSubscriptionDisabled: boolean,
): SafeTextModelSelection {
  let model = selectedModel || DEFAULT_GEMINI_MODEL;
  if (claudeSubscriptionDisabled && model === 'agent-claude') {
    model = claudeApiKey?.trim() ? DEFAULT_CLAUDE_API_MODEL : DEFAULT_GEMINI_MODEL;
  }
  return Object.freeze({ model, provider: modelToProvider(model) });
}

/**
 * Permanently migrates the one persisted route that packaged builds cannot offer.
 * Safe/development selections retain the original object so callers never rewrite
 * unrelated configuration merely by opening a modal.
 */
export function resolvePersistedTextModelConfig(
  config: Readonly<Record<string, unknown>>,
  claudeSubscriptionDisabled: boolean,
): PersistedTextModelMigration {
  const selectedModel = typeof config.primaryGeminiTextModel === 'string'
    ? config.primaryGeminiTextModel
    : undefined;
  const claudeApiKey = typeof config.claudeApiKey === 'string'
    ? config.claudeApiKey
    : undefined;
  const persistedProvider = typeof config.defaultAiProvider === 'string'
    ? config.defaultAiProvider
    : undefined;
  const selection = resolveTextModelSelection(
    selectedModel,
    claudeApiKey,
    claudeSubscriptionDisabled,
  );
  const changed = claudeSubscriptionDisabled && (
    selectedModel === 'agent-claude'
    || persistedProvider === 'agent-claude'
    || (
      selectedModel !== undefined
      && persistedProvider !== undefined
      && persistedProvider !== selection.provider
    )
  );

  if (!changed) {
    return Object.freeze({ changed: false, selection, config });
  }

  const migratedConfig = Object.freeze({
    ...config,
    primaryGeminiTextModel: selection.model,
    defaultAiProvider: selection.provider,
  });
  return Object.freeze({ changed: true, selection, config: migratedConfig });
}

/** Renderer-side defense for legacy or compromised status payloads. */
export function formatAgentVersionLabel(
  provider: AgentStatusProvider,
  version: unknown,
): string {
  const fallback = provider === 'codex' ? 'Codex CLI' : 'Claude Code';
  if (typeof version !== 'string' || version.length > 80 || /[\r\n]/.test(version)) return fallback;
  const trimmed = version.trim();
  const canonicalPattern = provider === 'codex' ? SAFE_CODEX_VERSION : SAFE_CLAUDE_VERSION;
  const canonical = trimmed.match(canonicalPattern);
  if (canonical?.[1]) return `${fallback} ${canonical[1]}`;
  const bare = trimmed.match(SAFE_BARE_VERSION);
  return bare?.[1] ? `${fallback} ${bare[1]}` : fallback;
}
