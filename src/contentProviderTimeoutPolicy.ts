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
