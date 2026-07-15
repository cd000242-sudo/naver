export const DEFAULT_SHADOW_BACKLOG = 2;
export const MAX_SHADOW_BACKLOG = 32;

export type ShadowQueueIssueCode = 'backlog_full' | 'invalid_job' | 'job_failed';
export type ShadowQueueJob = () => unknown | PromiseLike<unknown>;

export type ShadowQueueOutcome = Readonly<
  | { status: 'completed' }
  | { status: 'dropped'; issueCode: 'backlog_full' | 'invalid_job' }
  | { status: 'failed'; issueCode: 'job_failed' }
>;

export type ShadowQueueEnqueueResult = Readonly<
  | {
      accepted: true;
      status: 'accepted';
      queueDepth: number;
    }
  | {
      accepted: false;
      status: 'dropped';
      issueCode: 'backlog_full' | 'invalid_job';
      queueDepth: number;
    }
>;

export interface ShadowQueueOptions {
  readonly maxBacklog?: unknown;
  readonly onOutcome?: (outcome: ShadowQueueOutcome) => void | PromiseLike<void>;
}

export interface ShadowQueue {
  readonly maxBacklog: number;
  readonly enqueue: (job: ShadowQueueJob) => ShadowQueueEnqueueResult;
  /** Test-only passive waiter. It never cancels or alters queued work. */
  readonly drain: () => Promise<void>;
  /** Test-only reset guard. It is a no-op unless the queue is completely idle. */
  readonly reset: () => boolean;
}

function normalizeMaxBacklog(value: unknown): number {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 0
    || value > MAX_SHADOW_BACKLOG
  ) {
    return DEFAULT_SHADOW_BACKLOG;
  }

  return value;
}

function freezeAccepted(queueDepth: number): ShadowQueueEnqueueResult {
  return Object.freeze({
    accepted: true,
    status: 'accepted',
    queueDepth,
  });
}

function freezeDropped(
  issueCode: 'backlog_full' | 'invalid_job',
  queueDepth: number,
): ShadowQueueEnqueueResult {
  return Object.freeze({
    accepted: false,
    status: 'dropped',
    issueCode,
    queueDepth,
  });
}

function completedOutcome(): ShadowQueueOutcome {
  return Object.freeze({ status: 'completed' });
}

function droppedOutcome(
  issueCode: 'backlog_full' | 'invalid_job',
): ShadowQueueOutcome {
  return Object.freeze({ status: 'dropped', issueCode });
}

function failedOutcome(): ShadowQueueOutcome {
  return Object.freeze({ status: 'failed', issueCode: 'job_failed' });
}

export function createShadowQueue(
  options: Readonly<ShadowQueueOptions> = {},
): ShadowQueue {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const maxBacklog = normalizeMaxBacklog(safeOptions.maxBacklog);
  const onOutcome = typeof safeOptions.onOutcome === 'function'
    ? safeOptions.onOutcome
    : undefined;

  let active = false;
  let startScheduled = false;
  let pendingJobs: readonly ShadowQueueJob[] = Object.freeze([]);
  let pendingOutcomeCallbacks = 0;
  let drainWaiters: readonly (() => void)[] = Object.freeze([]);

  const currentBacklogDepth = (): number => {
    if (active) {
      return pendingJobs.length;
    }

    return startScheduled ? Math.max(0, pendingJobs.length - 1) : 0;
  };

  const isIdle = (): boolean => (
    !active
    && !startScheduled
    && pendingJobs.length === 0
    && pendingOutcomeCallbacks === 0
  );

  const resolveDrainWaitersIfIdle = (): void => {
    if (!isIdle() || drainWaiters.length === 0) {
      return;
    }

    const waiters = drainWaiters;
    drainWaiters = Object.freeze([]);
    waiters.forEach(resolve => resolve());
  };

  const emitOutcome = (outcome: ShadowQueueOutcome): void => {
    if (!onOutcome) {
      resolveDrainWaitersIfIdle();
      return;
    }

    pendingOutcomeCallbacks += 1;
    queueMicrotask(() => {
      const consumeCallback = async (): Promise<void> => {
        try {
          await onOutcome(outcome);
        } catch {
          // Shadow telemetry must never affect the production generation path.
        } finally {
          pendingOutcomeCallbacks -= 1;
          resolveDrainWaitersIfIdle();
        }
      };

      void consumeCallback();
    });
  };

  const scheduleNext = (): void => {
    if (active || startScheduled || pendingJobs.length === 0) {
      resolveDrainWaitersIfIdle();
      return;
    }

    startScheduled = true;
    queueMicrotask(() => {
      const [job, ...remainingJobs] = pendingJobs;
      pendingJobs = Object.freeze(remainingJobs);
      startScheduled = false;

      active = true;
      const execute = async (): Promise<void> => {
        let outcome: ShadowQueueOutcome;
        try {
          await job();
          outcome = completedOutcome();
        } catch {
          outcome = failedOutcome();
        }

        active = false;
        emitOutcome(outcome);
        scheduleNext();
        resolveDrainWaitersIfIdle();
      };

      void execute();
    });
  };

  const enqueue = (job: ShadowQueueJob): ShadowQueueEnqueueResult => {
    const queueDepth = currentBacklogDepth();
    if (typeof job !== 'function') {
      const result = freezeDropped('invalid_job', queueDepth);
      emitOutcome(droppedOutcome('invalid_job'));
      return result;
    }

    const hasReservedOrActiveJob = active || startScheduled;
    if (hasReservedOrActiveJob && queueDepth >= maxBacklog) {
      const result = freezeDropped('backlog_full', queueDepth);
      emitOutcome(droppedOutcome('backlog_full'));
      return result;
    }

    pendingJobs = Object.freeze([...pendingJobs, job]);
    scheduleNext();
    return freezeAccepted(hasReservedOrActiveJob ? queueDepth + 1 : 0);
  };

  const drain = (): Promise<void> => {
    if (isIdle()) {
      return Promise.resolve();
    }

    return new Promise<void>(resolve => {
      drainWaiters = Object.freeze([...drainWaiters, resolve]);
    });
  };

  const reset = (): boolean => {
    if (!isIdle()) {
      return false;
    }

    pendingJobs = Object.freeze([]);
    drainWaiters = Object.freeze([]);
    return true;
  };

  return Object.freeze({
    maxBacklog,
    enqueue,
    drain,
    reset,
  });
}
