/**
 * Config keys that no longer exist in the product (2026-11-03 API key cleanup).
 *
 * Owner decision: only NAVER API HUB, NAVER Search Ads, OpenAI, Gemini, Claude, Perplexity,
 * Genspark and Dropshot stay. Leonardo AI, DeepInfra, Prodia and the leftover image-library /
 * Stability / Fal.ai / Datalab keys are gone. The NAVER developer-center search key
 * (naverClientId / naverClientSecret) stays until the HUB migration is finished.
 *
 * This list is the single source of truth for:
 *   - the one-time removal from settings.json when the app reads its settings,
 *   - the keys the main process must not carry across version upgrades / userData migration,
 *   - the packaging scrub parity test (scripts/reset-config-for-pack.js must still clear them,
 *     because a build machine can hold old values).
 *
 * Values are never logged. Only key names are reported.
 */

/** camelCase config fields that were removed. */
const REMOVED_CAMEL_KEYS = [
  'leonardoaiApiKey',
  'leonardoApiKey',
  'leonardoaiModel',
  'deepinfraApiKey',
  'deepinfraModel',
  'prodiaApiKey',
  'prodiaToken',
  'prodiaModel',
  'pexelsApiKey',
  'unsplashApiKey',
  'pixabayApiKey',
  'naverDatalabApiKey',
  'naverSearchClientId',
  'naverSearchClientSecret',
  'stabilityApiKey',
  'falaiApiKey',
] as const;

/** kebab-case aliases written by the configManager compatibility layer. */
const REMOVED_KEBAB_KEYS = [
  'leonardoai-api-key',
  'leonardo-api-key',
  'leonardoai-model',
  'deepinfra-api-key',
  'deepinfra-model',
  'prodia-api-key',
  'prodia-token',
  'prodia-model',
  'pexels-api-key',
  'unsplash-api-key',
  'pixabay-api-key',
  'naver-datalab-api-key',
  'naver-search-client-id',
  'naver-search-client-secret',
  'stability-api-key',
  'falai-api-key',
] as const;

/** Every removed config key (camelCase + kebab-case aliases). */
export const REMOVED_CONFIG_KEYS: readonly string[] = Object.freeze([
  ...REMOVED_CAMEL_KEYS,
  ...REMOVED_KEBAB_KEYS,
]);

/** Subset that holds a secret — the packaging scrub must keep clearing these on build machines. */
export const REMOVED_SECRET_CONFIG_KEYS: readonly string[] = Object.freeze([
  'leonardoaiApiKey',
  'leonardoApiKey',
  'deepinfraApiKey',
  'prodiaApiKey',
  'prodiaToken',
  'pexelsApiKey',
  'unsplashApiKey',
  'pixabayApiKey',
  'naverDatalabApiKey',
  'naverSearchClientId',
  'naverSearchClientSecret',
  'stabilityApiKey',
  'falaiApiKey',
  'leonardoai-api-key',
  'leonardo-api-key',
  'deepinfra-api-key',
  'prodia-api-key',
  'prodia-token',
  'pexels-api-key',
  'unsplash-api-key',
  'pixabay-api-key',
  'naver-datalab-api-key',
  'naver-search-client-id',
  'naver-search-client-secret',
  'stability-api-key',
  'falai-api-key',
]);

const REMOVED_SET: ReadonlySet<string> = new Set(REMOVED_CONFIG_KEYS);

/** True when the key was removed from the product. */
export function isRemovedConfigKey(key: string): boolean {
  return REMOVED_SET.has(key);
}

export interface StripRemovedConfigResult<T> {
  /** A copy of the input without removed keys (the input is never mutated). */
  readonly config: T;
  /** Names of the keys that were present and dropped. Never contains values. */
  readonly removed: readonly string[];
}

/**
 * Returns a copy of a raw settings object without any removed key.
 * Non-object input is returned unchanged with an empty report.
 */
export function stripRemovedConfigKeys<T>(input: T): StripRemovedConfigResult<T> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { config: input, removed: [] };
  }
  const removed: string[] = [];
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (REMOVED_SET.has(key)) {
      removed.push(key);
    } else {
      kept[key] = value;
    }
  }
  if (removed.length === 0) return { config: input, removed };
  return { config: kept as T, removed };
}

export interface DropRemovedKeysDeps {
  /** Writes the cleaned settings file. Defaults to an atomic temp-file + rename. */
  readonly write?: (filePath: string, text: string) => Promise<void>;
}

async function writeAtomically(filePath: string, text: string): Promise<void> {
  const fs = await import('fs/promises');
  const tmpPath = `${filePath}.removed-keys.tmp`;
  await fs.writeFile(tmpPath, text, 'utf-8');
  await fs.rename(tmpPath, filePath);
}

/**
 * Drops removed keys from a freshly parsed settings object and, when any were present, writes the
 * cleaned file back so the removal happens exactly once. The parsed object is still returned
 * cleaned when the write fails (the next successful save then persists it). Logs key names only.
 */
export async function dropRemovedConfigKeysOnce<T>(
  filePath: string,
  parsed: T,
  deps: DropRemovedKeysDeps = {},
): Promise<T> {
  const { config, removed } = stripRemovedConfigKeys(parsed);
  if (removed.length === 0) return parsed;
  try {
    await (deps.write ?? writeAtomically)(filePath, JSON.stringify(config, null, 2));
    console.log(`[Config] 지원이 끝난 설정 ${removed.length}개를 설정 파일에서 지웠습니다: ${removed.join(', ')}`);
  } catch (error) {
    console.warn(`[Config] 지원이 끝난 설정 ${removed.length}개를 파일에서 지우지 못했습니다(메모리에서는 제외):`, (error as Error).message);
  }
  return config;
}
