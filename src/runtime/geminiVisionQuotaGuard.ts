import {
  normalizeErrorMessage,
  readHeaderValue,
  safeStringifyError,
} from '../contentErrorDiagnostics.js';

export const GEMINI_VISION_FREE_TIER_MIN_INTERVAL_MS = 13_000;
export const GEMINI_VISION_RATE_LIMIT_FALLBACK_WAIT_MS = 75_000;
export const GEMINI_VISION_RATE_LIMIT_MAX_SINGLE_WAIT_MS = 180_000;

const queueByModel = new Map<string, Promise<void>>();
const nextAllowedAtByModel = new Map<string, number>();

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('Aborted'));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function getDiagnosticText(error: unknown): string {
  const err = error as any;
  return [
    normalizeErrorMessage(error),
    err?.status,
    err?.code,
    err?.error?.code,
    err?.error?.status,
    err?.error?.message,
    safeStringifyError(error),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function parseDelayTokenMs(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const numeric = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/i);
  if (numeric) {
    const amount = Number(numeric[1]);
    const unit = (numeric[2] || 's').toLowerCase();
    if (!Number.isFinite(amount) || amount < 0) return null;
    if (unit === 'ms') return Math.ceil(amount);
    if (unit === 'm') return Math.ceil(amount * 60_000);
    return Math.ceil(amount * 1000);
  }

  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());

  return null;
}

export function isGeminiVisionRateLimitError(error: unknown): boolean {
  const diagnostic = getDiagnosticText(error);
  return diagnostic.includes('429') ||
    diagnostic.includes('too many requests') ||
    diagnostic.includes('quota exceeded') ||
    diagnostic.includes('resource_exhausted') ||
    diagnostic.includes('generate_content_free_tier_requests') ||
    diagnostic.includes('generaterequestsperminuteperprojectpermodel');
}

export function getGeminiVisionRateLimitWaitMs(
  error: unknown,
  fallbackMs = GEMINI_VISION_RATE_LIMIT_FALLBACK_WAIT_MS,
): number {
  const headers =
    (error as any)?.headers ||
    (error as any)?.response?.headers ||
    (error as any)?.error?.headers;
  const headerDelay = parseDelayTokenMs(readHeaderValue(headers, 'retry-after'));
  const diagnostic = `${normalizeErrorMessage(error)}\n${safeStringifyError(error)}`;
  const matches = [
    diagnostic.match(/please retry in\s+([\d.]+)\s*(ms|s|m)?/i),
    diagnostic.match(/retryDelay["'\s:]+([\d.]+)\s*(ms|s|m)?/i),
    diagnostic.match(/"retryDelay"\s*:\s*"([\d.]+)\s*(ms|s|m)?"/i),
  ].filter(Boolean) as RegExpMatchArray[];

  const parsedHints = matches
    .map((match) => parseDelayTokenMs(`${match[1]}${match[2] || 's'}`))
    .filter((value): value is number => typeof value === 'number' && value > 0);

  const hintedMs = Math.max(
    fallbackMs,
    headerDelay ?? 0,
    parsedHints.length ? Math.max(...parsedHints) : 0,
  );

  return Math.min(
    Math.max(hintedMs + 1_000, GEMINI_VISION_FREE_TIER_MIN_INTERVAL_MS),
    GEMINI_VISION_RATE_LIMIT_MAX_SINGLE_WAIT_MS,
  );
}

async function reserveGeminiVisionSlot(
  modelName: string,
  signal?: AbortSignal,
  minIntervalMs = GEMINI_VISION_FREE_TIER_MIN_INTERVAL_MS,
): Promise<void> {
  const key = modelName || 'gemini-vision';
  const previous = queueByModel.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    const now = Date.now();
    const scheduledAt = Math.max(now, nextAllowedAtByModel.get(key) ?? 0);
    nextAllowedAtByModel.set(key, scheduledAt + minIntervalMs);
    const waitMs = scheduledAt - now;
    if (waitMs > 0) {
      console.log(`[GeminiVisionThrottle] ${key} free-tier 5RPM guard: wait ${Math.ceil(waitMs / 1000)}s`);
      await sleepWithAbort(waitMs, signal);
    }
  });

  queueByModel.set(key, current);
  await current;
}

export function recordGeminiVisionBackoff(modelName: string, waitMs: number): void {
  const key = modelName || 'gemini-vision';
  nextAllowedAtByModel.set(
    key,
    Math.max(nextAllowedAtByModel.get(key) ?? 0, Date.now() + Math.max(0, waitMs)),
  );
}

export async function runGeminiVisionQuotaProtected<T>(
  modelName: string,
  signal: AbortSignal | undefined,
  task: () => Promise<T>,
  maxRetries = 2,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await reserveGeminiVisionSlot(modelName, signal);

    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isGeminiVisionRateLimitError(error) || attempt >= maxRetries) {
        break;
      }

      const waitMs = getGeminiVisionRateLimitWaitMs(error);
      recordGeminiVisionBackoff(modelName, waitMs);
      console.warn(
        `[GeminiVisionThrottle] ${modelName} 429 detected: wait ${Math.ceil(waitMs / 1000)}s before retry (${attempt + 1}/${maxRetries})`,
      );
      await sleepWithAbort(waitMs, signal);
    }
  }

  throw lastError;
}
