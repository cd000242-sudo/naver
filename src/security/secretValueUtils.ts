export const SECRET_CONFIG_FIELDS = [
  'geminiApiKey',
  'openaiApiKey',
  'openaiImageApiKey',
  'claudeApiKey',
  'perplexityApiKey',
  'leonardoaiApiKey',
  'deepinfraApiKey',
  'pexelsApiKey',
  'unsplashApiKey',
  'pixabayApiKey',
  'naverClientSecret',
  'naverDatalabClientSecret',
  'naverAdApiKey',
  'naverAdSecretKey',
  'naverAdCustomerId',
] as const;

const MASKED_VALUE_RE = /[•●*]|…|masked|마스킹|숨김/i;
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const BRACKETED_SCHEMA_RE = /\s*[\[({<]\s*(?:schema|스키마|masked|masking|마스킹)[^)\]}>]*[\])}>]\s*/gi;
const INLINE_SCHEMA_RE = /\s*(?:schema|스키마)\s*[:=]\s*/gi;

function tryExtractJsonSecret(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return raw;

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const candidates = [
        record.value,
        record.realValue,
        record.apiKey,
        record.key,
        record.secret,
        record.clientSecret,
      ];
      const found = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
      if (typeof found === 'string') return found;
    }
  } catch {
    // Not JSON. Treat it as a raw secret value.
  }

  return raw;
}

export function stripSecretSchemaArtifacts(value: string | undefined): string {
  if (!value) return '';
  return tryExtractJsonSecret(value)
    .replace(ZERO_WIDTH_RE, '')
    .replace(BRACKETED_SCHEMA_RE, '')
    .replace(INLINE_SCHEMA_RE, '')
    .replace(/\s+/g, '')
    .replace(/-{2,}/g, '-')
    .trim();
}

export function isMaskedSecretValue(value: string | undefined): boolean {
  if (!value) return false;
  return MASKED_VALUE_RE.test(value);
}

function normalizeStringSecret(value: unknown, fallback?: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = stripSecretSchemaArtifacts(value);
  if (!cleaned) return undefined;

  if (!isMaskedSecretValue(cleaned)) {
    return cleaned;
  }

  if (typeof fallback === 'string') {
    const cleanedFallback = stripSecretSchemaArtifacts(fallback);
    if (cleanedFallback && !isMaskedSecretValue(cleanedFallback)) {
      return cleanedFallback;
    }
  }

  return cleaned;
}

export function normalizeSecretConfig<T extends Record<string, unknown>>(
  config: T,
  fallback: Record<string, unknown> = {},
): { config: T; changed: boolean } {
  const next: Record<string, unknown> = { ...config };
  let changed = false;

  for (const field of SECRET_CONFIG_FIELDS) {
    const value = next[field];
    const normalized = normalizeStringSecret(value, fallback[field]);
    if (normalized !== undefined && normalized !== value) {
      next[field] = normalized;
      changed = true;
    }
  }

  const geminiApiKeys = next.geminiApiKeys;
  if (Array.isArray(geminiApiKeys)) {
    const fallbackKeys = Array.isArray(fallback.geminiApiKeys) ? fallback.geminiApiKeys : [];
    const normalizedKeys = geminiApiKeys.map((value, index) => {
      if (typeof value !== 'string') return value;
      return normalizeStringSecret(value, fallbackKeys[index]) ?? value;
    });
    if (normalizedKeys.some((value, index) => value !== geminiApiKeys[index])) {
      next.geminiApiKeys = normalizedKeys;
      changed = true;
    }
  }

  return { config: next as T, changed };
}
