export function getContentProviderTimeoutMs(minChars: number, retryAttempt = 0): number {
  const normalizedMinChars = Math.max(0, Math.round(Number(minChars) || 0));
  const normalizedRetryAttempt = Math.max(0, Math.round(Number(retryAttempt) || 0));

  let baseTimeout: number;
  if (normalizedMinChars < 1000) baseTimeout = 60_000;
  else if (normalizedMinChars < 3000) baseTimeout = 90_000;
  else if (normalizedMinChars < 5000) baseTimeout = 120_000;
  else if (normalizedMinChars < 10000) baseTimeout = 150_000;
  else baseTimeout = 180_000;

  const multiplier = 1 + (Math.min(normalizedRetryAttempt, 2) * 0.05);
  return Math.floor(baseTimeout * multiplier);
}

/**
 * GPT-5.6 long-form calls need a wider single-request window than fast
 * providers. This prevents a completed/billable Sol request from being cut off
 * at the former shared 90-second limit while staying below the renderer's
 * 360-second top-level budget.
 */
export function getOpenAiContentTimeoutMs(
  minChars: number,
  modelName: string,
  retryAttempt = 0,
): number {
  const baseTimeout = getContentProviderTimeoutMs(minChars, retryAttempt);
  const normalizedMinChars = Math.max(0, Math.round(Number(minChars) || 0));
  const model = String(modelName || '').trim().toLowerCase();

  if (model === 'gpt-5.6-sol') {
    return Math.max(baseTimeout, normalizedMinChars < 1000 ? 120_000 : 240_000);
  }
  if (model === 'gpt-5.6-terra') {
    return Math.max(baseTimeout, normalizedMinChars < 1000 ? 120_000 : 180_000);
  }
  return baseTimeout;
}
