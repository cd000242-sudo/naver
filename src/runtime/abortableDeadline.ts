import { withCleanupTimeout } from './cleanupTimeout.js';

export const OPERATION_DEADLINE_EXCEEDED = 'OPERATION_DEADLINE_EXCEEDED';

export class OperationDeadlineExceededError extends Error {
  readonly code = OPERATION_DEADLINE_EXCEEDED;
  readonly operationLabel: string;
  readonly timeoutMs: number;

  constructor(operationLabel: string, timeoutMs: number) {
    super(`${OPERATION_DEADLINE_EXCEEDED}: ${operationLabel} exceeded ${timeoutMs}ms`);
    this.name = 'OperationDeadlineExceededError';
    this.operationLabel = operationLabel;
    this.timeoutMs = timeoutMs;
  }
}

export interface AbortableDeadlineOptions {
  readonly timeoutMs: number;
  readonly operationLabel?: string;
  readonly cleanupTimeoutMs?: number;
  readonly onTimeout?: () => void | PromiseLike<void>;
}

/**
 * Bounds a long-running operation and gives its owner one bounded chance to
 * cancel/close resources. Late operation rejection is observed so it cannot
 * become an unhandled rejection after the deadline has already won the race.
 */
export async function withAbortableDeadline<T>(
  operation: () => T | PromiseLike<T>,
  options: AbortableDeadlineOptions,
): Promise<T> {
  const timeoutMs = options.timeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('operation timeoutMs must be a positive finite number');
  }

  const operationLabel = options.operationLabel?.trim() || 'operation';
  const deadlineError = new OperationDeadlineExceededError(operationLabel, timeoutMs);
  const operationPromise = Promise.resolve().then(operation);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(deadlineError), timeoutMs);
  });

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } catch (error) {
    if (error !== deadlineError) throw error;

    // The operation can settle after the timeout. Keep that late settlement
    // observed while the owner closes the underlying browser/request.
    void operationPromise.catch(() => undefined);
    if (options.onTimeout) {
      const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 5_000;
      await withCleanupTimeout(
        options.onTimeout,
        cleanupTimeoutMs,
        `${operationLabel} timeout cleanup`,
      ).catch(() => undefined);
    }
    throw deadlineError;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
