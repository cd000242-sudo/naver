export function readOptionalNonNegativeMsEnv(name: string, minMs = 0): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (Number.isFinite(value) && value >= minMs) return Math.floor(value);
  return undefined;
}

export function readNonNegativeMsEnv(name: string, fallbackMs: number, minMs = 0): number {
  const value = readOptionalNonNegativeMsEnv(name, minMs);
  if (value !== undefined) return value;
  return fallbackMs;
}

export function readNonNegativeIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? '');
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}
