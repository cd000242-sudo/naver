import {
  isGeminiCacheExpired,
  type GeminiPromptCacheEntry,
} from './contentGeminiCachePolicy.js';

const geminiPromptCache = new Map<string, GeminiPromptCacheEntry>();

export function getCachedGeminiPrompt(cacheKey: string, nowMs = Date.now()): GeminiPromptCacheEntry | undefined {
  const entry = geminiPromptCache.get(cacheKey);
  if (!entry) return undefined;

  if (isGeminiCacheExpired(entry, nowMs)) {
    geminiPromptCache.delete(cacheKey);
    return undefined;
  }

  return entry;
}

export function setCachedGeminiPrompt(cacheKey: string, entry: GeminiPromptCacheEntry): void {
  geminiPromptCache.set(cacheKey, entry);
}

export function deleteCachedGeminiPrompt(cacheKey: string): boolean {
  return geminiPromptCache.delete(cacheKey);
}

export function pruneExpiredGeminiPromptCaches(nowMs = Date.now()): GeminiPromptCacheEntry[] {
  const removed: GeminiPromptCacheEntry[] = [];
  for (const [key, entry] of geminiPromptCache.entries()) {
    if (isGeminiCacheExpired(entry, nowMs)) {
      geminiPromptCache.delete(key);
      removed.push(entry);
    }
  }
  return removed;
}

export function clearGeminiPromptCache(): void {
  geminiPromptCache.clear();
}

export function getGeminiPromptCacheSize(): number {
  return geminiPromptCache.size;
}
