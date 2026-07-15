import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SHADOW_BACKLOG,
  MAX_SHADOW_BACKLOG,
  createShadowQueue,
  type ShadowQueueOutcome,
} from '../contentPipeline/shadowQueue';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(innerResolve => {
    resolve = innerResolve;
  });

  return Object.freeze({ promise, resolve });
}

describe('content pipeline shadow queue', () => {
  it('runs jobs FIFO with concurrency exactly one', async () => {
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const starts = [deferred<void>(), deferred<void>(), deferred<void>()];
    const order: number[] = [];
    let activeCount = 0;
    let maximumActiveCount = 0;
    const queue = createShadowQueue({ maxBacklog: 2 });

    for (const index of [0, 1, 2]) {
      queue.enqueue(async () => {
        activeCount += 1;
        maximumActiveCount = Math.max(maximumActiveCount, activeCount);
        order.push(index);
        starts[index].resolve();
        await gates[index].promise;
        activeCount -= 1;
      });
    }

    await starts[0].promise;
    expect(order).toEqual([0]);
    gates[0].resolve();
    await starts[1].promise;
    expect(order).toEqual([0, 1]);
    gates[1].resolve();
    await starts[2].promise;
    expect(order).toEqual([0, 1, 2]);
    gates[2].resolve();
    await queue.drain();

    expect(maximumActiveCount).toBe(1);
    expect(activeCount).toBe(0);
  });

  it('uses a default backlog of two and deterministically drops the newest job', async () => {
    const firstGate = deferred<void>();
    const started: string[] = [];
    const queue = createShadowQueue();

    const first = queue.enqueue(async () => {
      started.push('first');
      await firstGate.promise;
    });
    const second = queue.enqueue(() => {
      started.push('second');
    });
    const third = queue.enqueue(() => {
      started.push('third');
    });
    const dropped = queue.enqueue(() => {
      started.push('newest');
    });

    expect(queue.maxBacklog).toBe(DEFAULT_SHADOW_BACKLOG);
    expect(first).toEqual({ accepted: true, status: 'accepted', queueDepth: 0 });
    expect(second).toEqual({ accepted: true, status: 'accepted', queueDepth: 1 });
    expect(third).toEqual({ accepted: true, status: 'accepted', queueDepth: 2 });
    expect(dropped).toEqual({
      accepted: false,
      status: 'dropped',
      issueCode: 'backlog_full',
      queueDepth: 2,
    });

    firstGate.resolve();
    await queue.drain();
    expect(started).toEqual(['first', 'second', 'third']);
  });

  it('accepts one active job with a zero backlog and drops later work', async () => {
    const gate = deferred<void>();
    const queue = createShadowQueue({ maxBacklog: 0 });
    const first = queue.enqueue(() => gate.promise);
    const second = queue.enqueue(() => undefined);

    expect(queue.maxBacklog).toBe(0);
    expect(first.accepted).toBe(true);
    expect(second).toEqual({
      accepted: false,
      status: 'dropped',
      issueCode: 'backlog_full',
      queueDepth: 0,
    });

    gate.resolve();
    await queue.drain();
    expect(queue.enqueue(() => undefined).accepted).toBe(true);
    await queue.drain();
  });

  it('measures backlog behind an already active job', async () => {
    const gate = deferred<void>();
    const firstStarted = deferred<void>();
    const queue = createShadowQueue({ maxBacklog: 1 });

    queue.enqueue(async () => {
      firstStarted.resolve();
      await gate.promise;
    });
    await firstStarted.promise;

    expect(queue.enqueue(() => undefined)).toEqual({
      accepted: true,
      status: 'accepted',
      queueDepth: 1,
    });
    expect(queue.enqueue(() => undefined)).toEqual({
      accepted: false,
      status: 'dropped',
      issueCode: 'backlog_full',
      queueDepth: 1,
    });

    gate.resolve();
    await queue.drain();
  });

  it.each([
    -1,
    MAX_SHADOW_BACKLOG + 1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '2',
    null,
  ])('normalizes an unsafe backlog value (%s) to the fail-safe default', value => {
    const queue = createShadowQueue({ maxBacklog: value as never });

    expect(queue.maxBacklog).toBe(DEFAULT_SHADOW_BACKLOG);
  });

  it.each([0, 1, MAX_SHADOW_BACKLOG])('preserves a safe integer backlog of %i', value => {
    expect(createShadowQueue({ maxBacklog: value }).maxBacklog).toBe(value);
  });

  it('normalizes a non-object options value and ignores a non-function callback', async () => {
    expect(createShadowQueue(null as never).maxBacklog).toBe(DEFAULT_SHADOW_BACKLOG);

    const queue = createShadowQueue({ onOutcome: 'not-a-function' as never });
    queue.enqueue(() => undefined);
    await expect(queue.drain()).resolves.toBeUndefined();
  });

  it('returns before invoking the job and freezes its public API and metadata', async () => {
    let started = false;
    const queue = createShadowQueue();
    const metadata = queue.enqueue(() => {
      started = true;
    });

    expect(started).toBe(false);
    expect(Object.isFrozen(queue)).toBe(true);
    expect(Object.isFrozen(metadata)).toBe(true);

    await queue.drain();
    expect(started).toBe(true);
  });

  it('consumes job rejection and reports only a sanitized outcome', async () => {
    const rawInput = 'never-leak-this-input';
    const outcomes: ShadowQueueOutcome[] = [];
    const queue = createShadowQueue({
      onOutcome: outcome => {
        outcomes.push(outcome);
      },
    });

    queue.enqueue(async () => {
      void rawInput;
      throw new Error(`provider failure: ${rawInput}`);
    });

    await expect(queue.drain()).resolves.toBeUndefined();
    expect(outcomes).toEqual([{ status: 'failed', issueCode: 'job_failed' }]);
    expect(Object.isFrozen(outcomes[0])).toBe(true);
    expect(Object.keys(outcomes[0])).toEqual(['status', 'issueCode']);
    expect(JSON.stringify(outcomes)).not.toContain(rawInput);
  });

  it('drops an invalid runtime job without invoking or exposing it', async () => {
    const outcomes: ShadowQueueOutcome[] = [];
    const queue = createShadowQueue({
      onOutcome: outcome => {
        outcomes.push(outcome);
      },
    });

    const result = queue.enqueue('raw-job-input' as never);

    expect(result).toEqual({
      accepted: false,
      status: 'dropped',
      issueCode: 'invalid_job',
      queueDepth: 0,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(outcomes).toEqual([]);

    await queue.drain();
    expect(outcomes).toEqual([{ status: 'dropped', issueCode: 'invalid_job' }]);
    expect(JSON.stringify(outcomes)).not.toContain('raw-job-input');
  });

  it('reports completed and dropped outcomes without job data', async () => {
    const gate = deferred<void>();
    const outcomes: ShadowQueueOutcome[] = [];
    const queue = createShadowQueue({
      maxBacklog: 0,
      onOutcome: outcome => {
        outcomes.push(outcome);
      },
    });

    queue.enqueue(() => gate.promise);
    queue.enqueue(() => 'must-not-run');
    gate.resolve();
    await queue.drain();

    expect(outcomes).toContainEqual({ status: 'completed' });
    expect(outcomes).toContainEqual({ status: 'dropped', issueCode: 'backlog_full' });
    expect(outcomes.every(outcome => Object.isFrozen(outcome))).toBe(true);
    expect(outcomes.every(outcome =>
      Object.keys(outcome).every(key => key === 'status' || key === 'issueCode'),
    )).toBe(true);
  });

  it('consumes synchronous and asynchronous outcome callback failures', async () => {
    const syncQueue = createShadowQueue({
      onOutcome: () => {
        throw new Error('sync callback failure');
      },
    });
    const asyncQueue = createShadowQueue({
      onOutcome: async () => {
        throw new Error('async callback failure');
      },
    });

    syncQueue.enqueue(() => undefined);
    asyncQueue.enqueue(() => undefined);

    await expect(syncQueue.drain()).resolves.toBeUndefined();
    await expect(asyncQueue.drain()).resolves.toBeUndefined();
  });

  it('does not let reset cancel active or queued jobs', async () => {
    const gate = deferred<void>();
    const firstStarted = deferred<void>();
    const completed: string[] = [];
    const queue = createShadowQueue({ maxBacklog: 1 });

    queue.enqueue(async () => {
      firstStarted.resolve();
      await gate.promise;
      completed.push('first');
    });
    queue.enqueue(() => {
      completed.push('second');
    });

    await firstStarted.promise;
    expect(queue.reset()).toBe(false);
    gate.resolve();
    await queue.drain();

    expect(completed).toEqual(['first', 'second']);
    expect(queue.reset()).toBe(true);
  });

  it('supports multiple passive drain waiters without changing queue execution', async () => {
    const gate = deferred<void>();
    const queue = createShadowQueue();
    queue.enqueue(() => gate.promise);

    const firstDrain = queue.drain();
    const secondDrain = queue.drain();
    const firstResolved = vi.fn();
    void firstDrain.then(firstResolved);

    await Promise.resolve();
    expect(firstResolved).not.toHaveBeenCalled();

    gate.resolve();
    await expect(Promise.all([firstDrain, secondDrain])).resolves.toEqual([undefined, undefined]);
  });
});
