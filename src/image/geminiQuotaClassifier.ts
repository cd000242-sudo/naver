// src/image/geminiQuotaClassifier.ts
// [2026-09-08] Gemini 이미지 429 를 "분당 속도 초과" 와 "일일 할당량 소진" 으로 가른다.
//
// 왜 필요한가: 기존에는 둘을 같은 429 로 뭉개서, 키가 하나뿐이고 일일 할당량이 이미
// 소진된 사용자도 15~25초 × 5회를 그대로 기다렸다. 오늘 안에는 절대 풀리지 않는 한도를
// 3분 동안 기다린 뒤 실패하는 셈이라, 사용자에게는 앱이 멈춘 것으로 보인다.
// 분당 초과는 기다리면 풀리므로 재시도가 맞고, 일일 소진은 즉시 알리는 편이 맞다.
//
// 판별 근거는 Gemini 가 429 본문에 싣는 google.rpc.QuotaFailure 의 quotaId 와
// google.rpc.RetryInfo 의 retryDelay 다. 둘 다 없으면 'unknown' 으로 두고 기존 동작을 지킨다.

export type GeminiQuotaScope = 'per-day' | 'per-minute' | 'unknown';

export interface GeminiQuotaClassification {
  readonly scope: GeminiQuotaScope;
  /** 서버가 알려준 재시도 대기(ms). 없으면 undefined. */
  readonly retryDelayMs?: number;
}

/** retryDelay 는 "31s" / "1.5s" 같은 protobuf Duration 문자열로 온다. */
function parseRetryDelayMs(raw: string): number | undefined {
  const match = raw.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.round(seconds * 1000);
}

function parseRetryAfterHeaderMs(retryAfter: unknown): number | undefined {
  const seconds = Number(String(retryAfter ?? '').trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.round(seconds * 1000);
}

/**
 * 429 응답 본문 + 헤더로 한도의 성격을 가른다.
 *
 * @param haystack 에러 메시지와 응답 본문을 이어 붙인 문자열
 * @param retryAfterHeader HTTP retry-after 헤더 값(있으면)
 */
export function classifyGeminiQuotaError(
  haystack: string,
  retryAfterHeader?: unknown,
): GeminiQuotaClassification {
  const text = String(haystack || '');
  const retryDelayMs = parseRetryDelayMs(text) ?? parseRetryAfterHeaderMs(retryAfterHeader);

  // quotaId 예: "GenerateRequestsPerDayPerProjectPerModel" / "...PerMinutePerProjectPerModel"
  const perDay = /PerDay/i.test(text) || /\bdaily\b/i.test(text) || /requests per day/i.test(text);
  const perMinute = /PerMinute/i.test(text) || /requests per minute/i.test(text);

  // 둘 다 잡히면 더 좁은 쪽(분당)을 택한다 — 기다리면 풀리는 쪽으로 보수적으로 판단한다.
  if (perMinute) return { scope: 'per-minute', retryDelayMs };
  if (perDay) return { scope: 'per-day', retryDelayMs };
  return { scope: 'unknown', retryDelayMs };
}

/**
 * 이 429 에 대해 재시도를 계속할 이유가 있는가.
 *
 * 일일 할당량이 소진됐고 넘어갈 다른 키도 없다면 재시도는 시간 낭비다.
 * 그 외(분당 초과 · 판별 불가 · 여분 키 있음)에는 기존대로 재시도한다.
 */
export function shouldStopRetryingQuota(
  classification: GeminiQuotaClassification,
  availableKeyCount: number,
): boolean {
  return classification.scope === 'per-day' && availableKeyCount <= 1;
}

/**
 * 다음 재시도까지 쉴 시간(ms).
 *
 * 서버가 retryDelay 를 줬으면 그 값을 쓴다(하한 3초, 상한 30초) — 임의의 15~25초보다
 * 정확하고, 짧게 풀리는 경우 그만큼 빨리 재개된다. 없으면 기존 값을 그대로 쓴다.
 */
export function resolveQuotaWaitMs(
  classification: GeminiQuotaClassification,
  fallbackMs: number,
): number {
  const suggested = classification.retryDelayMs;
  if (suggested === undefined) return fallbackMs;
  return Math.min(Math.max(suggested, 3_000), 30_000);
}
