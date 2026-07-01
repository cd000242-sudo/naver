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
const SCHEMA_TEXT_PRESERVED_SECRET_FIELDS = new Set([
  'naverClientSecret',
  'naverDatalabClientSecret',
  'naver-client-secret',
  'naver-datalab-client-secret',
]);

interface StripSecretOptions {
  preserveSchemaText?: boolean;
}

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

export function shouldPreserveSecretSchemaText(fieldName: string | undefined): boolean {
  return !!fieldName && SCHEMA_TEXT_PRESERVED_SECRET_FIELDS.has(fieldName);
}

export function stripSecretSchemaArtifacts(
  value: string | undefined,
  options: StripSecretOptions = {},
): string {
  if (!value) return '';
  const extracted = tryExtractJsonSecret(value).replace(ZERO_WIDTH_RE, '');
  if (options.preserveSchemaText) {
    return extracted.trim();
  }
  return extracted
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

function normalizeStringSecret(
  value: unknown,
  fallback?: unknown,
  fieldName?: string,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const preserveSchemaText = shouldPreserveSecretSchemaText(fieldName);
  const cleaned = stripSecretSchemaArtifacts(value, { preserveSchemaText });
  if (!cleaned) return undefined;

  if (!isMaskedSecretValue(cleaned)) {
    return cleaned;
  }

  if (typeof fallback === 'string') {
    const cleanedFallback = stripSecretSchemaArtifacts(fallback, { preserveSchemaText });
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
    const normalized = normalizeStringSecret(value, fallback[field], field);
    if (normalized !== undefined && normalized !== value) {
      next[field] = normalized;
      changed = true;
    }
    // [ByteString crash guard] A secret still masked after normalization (no clean value was
    // recoverable) must never reach an HTTP header — a masking char like `•` (U+2022) crashes
    // fetch with "Cannot convert argument to a ByteString". Drop it to empty so every consumer
    // throws a clean "키 미설정 → 재입력" error instead. The stored config also self-heals.
    const finalValue = next[field];
    if (typeof finalValue === 'string' && finalValue.trim() !== '' && isMaskedSecretValue(finalValue)) {
      next[field] = '';
      changed = true;
    }
  }

  const geminiApiKeys = next.geminiApiKeys;
  if (Array.isArray(geminiApiKeys)) {
    const fallbackKeys = Array.isArray(fallback.geminiApiKeys) ? fallback.geminiApiKeys : [];
    const normalizedKeys = geminiApiKeys.map((value, index) => {
      if (typeof value !== 'string') return value;
      const normalized = normalizeStringSecret(value, fallbackKeys[index]) ?? value;
      // Same ByteString guard: drop a masked rotation key to empty rather than passing `•` on.
      return isMaskedSecretValue(normalized) ? '' : normalized;
    });
    if (normalizedKeys.some((value, index) => value !== geminiApiKeys[index])) {
      next.geminiApiKeys = normalizedKeys;
      changed = true;
    }
  }

  return { config: next as T, changed };
}
