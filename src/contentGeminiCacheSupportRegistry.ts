import { apiKeyFingerprint } from './contentGeminiCachePolicy';

const geminiCacheUnsupportedKeys = new Set<string>();

export function markGeminiCacheUnsupported(apiKey: string, reason: string): void {
  const fp = apiKeyFingerprint(apiKey);
  if (!geminiCacheUnsupportedKeys.has(fp)) {
    geminiCacheUnsupportedKeys.add(fp);
    console.warn(`[GeminiCache] 🔒 API 키 ${fp}는 캐시 미지원으로 기록됨 (이유: ${reason}) — 이후 일반 호출만 사용`);
  }
}

export function isGeminiCacheSupportedForKey(apiKey: string): boolean {
  return !geminiCacheUnsupportedKeys.has(apiKeyFingerprint(apiKey));
}

export function clearGeminiCacheUnsupportedKeys(): void {
  geminiCacheUnsupportedKeys.clear();
}

export function getGeminiCacheUnsupportedKeyCount(): number {
  return geminiCacheUnsupportedKeys.size;
}
