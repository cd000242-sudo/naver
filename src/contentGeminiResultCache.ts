interface GeminiResultCacheEntry {
  text: string;
  createdAt: number;
}

const geminiResultCache = new Map<string, GeminiResultCacheEntry>();
const GEMINI_RESULT_CACHE_TTL_MS = 10 * 60 * 1000;
const GEMINI_RESULT_CACHE_MAX = 50;

export function getCachedGeminiResult(cacheKey: string, nowMs = Date.now()): string | undefined {
  const entry = geminiResultCache.get(cacheKey);
  if (!entry) return undefined;
  if (nowMs - entry.createdAt > GEMINI_RESULT_CACHE_TTL_MS) {
    geminiResultCache.delete(cacheKey);
    return undefined;
  }
  return entry.text;
}

export function setCachedGeminiResult(cacheKey: string, text: string, nowMs = Date.now()): void {
  if (!text.trim()) return;
  if (geminiResultCache.size >= GEMINI_RESULT_CACHE_MAX) {
    const oldest = geminiResultCache.keys().next().value;
    if (oldest) geminiResultCache.delete(oldest);
  }
  geminiResultCache.set(cacheKey, { text, createdAt: nowMs });
}

export function clearGeminiResultCache(): void {
  geminiResultCache.clear();
}

export function getGeminiResultCacheSize(): number {
  return geminiResultCache.size;
}
