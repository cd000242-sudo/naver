import {
  normalizeErrorMessage,
  safeStringifyError,
} from './contentErrorDiagnostics.js';

export function readProviderHeader(error: unknown, name: string): string | undefined {
  const headers =
    (error as any)?.headers ||
    (error as any)?.response?.headers ||
    (error as any)?.error?.headers;
  if (!headers) return undefined;

  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(name.toLowerCase()) || undefined;
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return String(value);
  }
  return undefined;
}

export function parseProviderDelayMs(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  if (!value) return null;

  if (/^\d+(\.\d+)?$/.test(value)) {
    return Math.ceil(Number(value) * 1000);
  }

  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  let totalMs = 0;
  const unitPattern = /(\d+(?:\.\d+)?)(ms|s|m|h)/gi;
  let match: RegExpExecArray | null;
  while ((match = unitPattern.exec(value)) !== null) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'ms') totalMs += amount;
    if (unit === 's') totalMs += amount * 1000;
    if (unit === 'm') totalMs += amount * 60_000;
    if (unit === 'h') totalMs += amount * 3_600_000;
  }
  return totalMs > 0 ? Math.ceil(totalMs) : null;
}

export function getProviderRateLimitWaitMs(error: unknown, fallbackMs: number, headerNames: string[]): number {
  const headerWaits = headerNames
    .map((name) => readProviderHeader(error, name))
    .map(parseProviderDelayMs)
    .filter((value): value is number => typeof value === 'number' && value > 0);

  const raw = [
    normalizeErrorMessage(error),
    (error as any)?.message,
    (error as any)?.error?.message,
    (error as any)?.response?.data?.error?.message,
    safeStringifyError(error),
  ].filter(Boolean).join('\n');
  const retryHint = [
    /retry(?:\s|-)?after["'\s:]+([\d.]+)\s*(ms|s|m|h)?/i,
    /retryDelay["'\s:]+([\d.]+)\s*(ms|s|m|h)?/i,
    /retry\s*delay["'\s:]+([\d.]+)\s*(ms|s|m|h)?/i,
    /retry\s+in\s+([\d.]+)\s*(ms|s|m|h)?/i,
    /retry(?:\s|-)?(?:after|delay|in)?[^0-9]{0,40}([\d.]+)\s*(ms|s|m|h)?/i,
  ]
    .map((pattern) => raw.match(pattern))
    .find(Boolean);
  if (retryHint) {
    const amount = Number(retryHint[1]);
    const unit = (retryHint[2] || 's').toLowerCase();
    if (Number.isFinite(amount) && amount >= 0) {
      const hintedMs = unit === 'h'
        ? amount * 3_600_000
        : unit === 'm'
          ? amount * 60_000
          : unit === 'ms'
            ? amount
            : amount * 1000;
      headerWaits.push(Math.ceil(hintedMs));
    }
  }

  const waitMs = Math.max(fallbackMs, headerWaits.length ? Math.max(...headerWaits) : 0, 1000);
  return Math.min(waitMs + 500, 180_000);
}
