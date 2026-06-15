import { createHash } from 'crypto';

export interface GeminiPromptCacheEntry {
  cacheName: string;
  modelName: string;
  createdAt: number;
  ttlSeconds: number;
}

export function apiKeyFingerprint(key: string): string {
  return createHash('sha256').update(key).digest('hex').substring(0, 12);
}

export function getGeminiPromptCacheKey(systemText: string, modelName: string): string {
  const hash = createHash('sha256');
  hash.update(`${modelName}::${systemText}`);
  return hash.digest('hex').substring(0, 32);
}

export function getGeminiResultCacheKey(input: {
  modelName: string;
  systemText: string;
  userText: string;
  temperature: number;
  useGrounding: boolean;
}): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({
    modelName: input.modelName,
    temperature: Number(input.temperature.toFixed(2)),
    useGrounding: input.useGrounding,
    systemText: input.systemText,
    userText: input.userText,
  }));
  return hash.digest('hex').substring(0, 32);
}

export function isGeminiCacheExpired(entry: GeminiPromptCacheEntry, nowMs = Date.now()): boolean {
  const elapsed = (nowMs - entry.createdAt) / 1000;
  return elapsed >= entry.ttlSeconds - 60;
}

export function isStructuralGeminiCacheError(message: string): boolean {
  return /403|forbidden|400|not\s+support|not\s+available|cached.*content|cache create timeout/i.test(message);
}
