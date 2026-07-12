export const DEFAULT_CLEANUP_TIMEOUT_MS = 5_000;

export class CleanupTimeoutError extends Error {
  readonly cleanupLabel: string;
  readonly timeoutMs: number;

  constructor(cleanupLabel: string, timeoutMs: number) {
    super(`Cleanup timed out after ${timeoutMs}ms: ${cleanupLabel}`);
    this.name = 'CleanupTimeoutError';
    this.cleanupLabel = cleanupLabel;
    this.timeoutMs = timeoutMs;
  }
}

/** Runs one cleanup task without letting it block shutdown past its deadline. */
export async function withCleanupTimeout<T>(
  cleanup: () => T | PromiseLike<T>,
  timeoutMs: number = DEFAULT_CLEANUP_TIMEOUT_MS,
  cleanupLabel: string = 'cleanup task',
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('cleanup timeoutMs must be a positive finite number');
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const cleanupPromise = Promise.resolve().then(cleanup);
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new CleanupTimeoutError(cleanupLabel, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([cleanupPromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
