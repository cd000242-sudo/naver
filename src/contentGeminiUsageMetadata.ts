import { withProviderTimeout } from './contentAbortTimeoutPolicy.js';

export const GEMINI_USAGE_METADATA_TIMEOUT_MS = 5_000;

export type GeminiUsageMetadataTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
) => Promise<T>;

export interface GeminiUsageMetadataOptions {
  timeoutMs?: number;
  withTimeout?: GeminiUsageMetadataTimeout;
  warn?: (...args: unknown[]) => void;
}

export async function waitForGeminiUsageMetadata(
  streamResult: any,
  options: GeminiUsageMetadataOptions = {},
): Promise<any | null> {
  if (!streamResult?.response) return null;

  const timeoutMs = options.timeoutMs ?? GEMINI_USAGE_METADATA_TIMEOUT_MS;
  const runWithTimeout = options.withTimeout ?? withProviderTimeout;
  const warn = options.warn ?? console.warn;

  try {
    return await runWithTimeout(
      Promise.resolve(streamResult.response),
      timeoutMs,
      `Gemini usage metadata timeout (${timeoutMs / 1000}s)`,
    );
  } catch (error) {
    warn('[Gemini] usage metadata 대기 시간 초과 — 생성 결과는 그대로 사용:', (error as Error).message);
    return null;
  }
}
