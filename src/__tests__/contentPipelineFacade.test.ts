import { describe, expect, it, vi } from 'vitest';

import {
  ContentPipelineError,
  runContentPipeline,
  type ContentPipelineSnapshot,
  type ContentPipelineValidatorResult,
} from '../contentPipeline/facade';
import { createShadowQueue, type ShadowQueueJob } from '../contentPipeline/shadowQueue';

interface SourceFixture {
  readonly contentMode: string;
  readonly nested: { readonly value: string };
}

interface OptionsFixture {
  readonly minChars: number;
}

interface ResultFixture {
  readonly title: string;
}

function validResult(value: unknown): ContentPipelineValidatorResult<ResultFixture> {
  if (
    value
    && typeof value === 'object'
    && typeof (value as { title?: unknown }).title === 'string'
    && (value as { title: string }).title.trim()
  ) {
    return Object.freeze({ ok: true, content: value as ResultFixture });
  }

  return Object.freeze({ ok: false, issueCode: 'invalid_fixture' });
}

function makeInput() {
  return {
    source: { contentMode: 'seo', nested: { value: 'original' } } as SourceFixture,
    options: { minChars: 2_500 } as OptionsFixture,
  };
}

function expectPipelineError(
  error: unknown,
  issueCode: ContentPipelineError['issueCode'],
): void {
  expect(error).toBeInstanceOf(ContentPipelineError);
  expect(error).toMatchObject({
    name: 'ContentPipelineError',
    issueCode,
    message: `[content-pipeline] ${issueCode}`,
  });
  expect(Object.isFrozen(error)).toBe(true);
}

describe('runContentPipeline', () => {
  it.each([undefined, null, '', 'V3', ' v3', 'unknown']) (
    'routes an absent or invalid mode (%s) through the exact legacy call',
    async requestedMode => {
      const { source, options } = makeInput();
      const legacyResult = Object.freeze({ title: 'legacy' });
      const legacy = vi.fn(async () => legacyResult);
      const v3 = vi.fn(async () => Object.freeze({ title: 'v3' }));

      const result = await runContentPipeline({
        requestedMode,
        contentMode: source.contentMode,
        source,
        options,
        legacy,
        v3,
        validate: validResult,
      });

      expect(result).toBe(legacyResult);
      expect(legacy).toHaveBeenCalledTimes(1);
      expect(legacy).toHaveBeenCalledWith(source, options);
      expect(v3).not.toHaveBeenCalled();
    },
  );

  it('keeps v3 on legacy when the exact content mode is not allowlisted', async () => {
    const { source, options } = makeInput();
    const legacyResult = Object.freeze({ title: 'legacy' });
    const legacy = vi.fn(async () => legacyResult);
    const v3 = vi.fn(async () => Object.freeze({ title: 'v3' }));

    const result = await runContentPipeline({
      requestedMode: 'v3',
      contentMode: source.contentMode,
      v3Allowlist: Object.freeze(['business']),
      source,
      options,
      legacy,
      v3,
      validate: validResult,
    });

    expect(result).toBe(legacyResult);
    expect(v3).not.toHaveBeenCalled();
  });

  it.each(['image-narrative', 'traffic-hunter']) (
    'forces %s to legacy even when requested and allowlisted for v3',
    async contentMode => {
      const source = { contentMode, nested: { value: 'original' } };
      const options = { minChars: 2_500 };
      const legacyResult = Object.freeze({ title: 'legacy' });
      const legacy = vi.fn(async () => legacyResult);
      const v3 = vi.fn(async () => Object.freeze({ title: 'v3' }));

      const result = await runContentPipeline({
        requestedMode: 'v3',
        contentMode,
        v3Allowlist: Object.freeze([contentMode]),
        source,
        options,
        legacy,
        v3,
        validate: validResult,
      });

      expect(result).toBe(legacyResult);
      expect(v3).not.toHaveBeenCalled();
    },
  );

  it('runs only the allowlisted v3 driver and returns its validated identity', async () => {
    const { source, options } = makeInput();
    const v3Result = Object.freeze({ title: 'v3' });
    const legacy = vi.fn(async () => Object.freeze({ title: 'legacy' }));
    const v3 = vi.fn(async () => v3Result);
    const validate = vi.fn(validResult);

    const result = await runContentPipeline({
      requestedMode: 'v3',
      contentMode: source.contentMode,
      v3Allowlist: Object.freeze(['seo']),
      source,
      options,
      legacy,
      v3,
      validate,
    });

    expect(result).toBe(v3Result);
    expect(v3).toHaveBeenCalledTimes(1);
    expect(v3).toHaveBeenCalledWith(source, options);
    expect(validate).toHaveBeenCalledWith(v3Result);
    expect(legacy).not.toHaveBeenCalled();
  });

  it('fails closed with a stable error when an enabled v3 driver is missing', async () => {
    const { source, options } = makeInput();
    const legacy = vi.fn(async () => Object.freeze({ title: 'legacy' }));

    const promise = runContentPipeline({
      requestedMode: 'v3',
      contentMode: source.contentMode,
      v3Allowlist: Object.freeze(['seo']),
      source,
      options,
      legacy,
      validate: validResult,
    });

    await expect(promise).rejects.toSatisfy((error: unknown) => {
      expectPipelineError(error, 'v3_driver_missing');
      return true;
    });
    expect(legacy).not.toHaveBeenCalled();
  });

  it('sanitizes a v3 driver rejection and never falls back to legacy', async () => {
    const { source, options } = makeInput();
    const secret = 'RAW_PROVIDER_SECRET';
    const legacy = vi.fn(async () => Object.freeze({ title: 'legacy' }));
    const v3 = vi.fn(async () => {
      throw new Error(secret);
    });

    const promise = runContentPipeline({
      requestedMode: 'v3',
      contentMode: source.contentMode,
      v3Allowlist: Object.freeze(['seo']),
      source,
      options,
      legacy,
      v3,
      validate: validResult,
    });

    await expect(promise).rejects.toSatisfy((error: unknown) => {
      expectPipelineError(error, 'v3_execution_failed');
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(String(error)).not.toContain(secret);
      return true;
    });
    expect(legacy).not.toHaveBeenCalled();
  });

  it('fails closed on an invalid v3 result without returning raw diagnostics', async () => {
    const { source, options } = makeInput();
    const rawResult = Object.freeze({ title: '', secret: 'RAW_RESULT_SECRET' });
    const legacy = vi.fn(async () => Object.freeze({ title: 'legacy' }));

    const promise = runContentPipeline({
      requestedMode: 'v3',
      contentMode: source.contentMode,
      v3Allowlist: Object.freeze(['seo']),
      source,
      options,
      legacy,
      v3: async () => rawResult,
      validate: validResult,
    });

    await expect(promise).rejects.toSatisfy((error: unknown) => {
      expectPipelineError(error, 'v3_result_invalid');
      expect(JSON.stringify(error)).not.toContain(rawResult.secret);
      return true;
    });
    expect(legacy).not.toHaveBeenCalled();
  });

  it('fails closed when the validator throws and does not expose its message', async () => {
    const { source, options } = makeInput();
    const secret = 'RAW_VALIDATOR_SECRET';

    const promise = runContentPipeline({
      requestedMode: 'v3',
      contentMode: source.contentMode,
      v3Allowlist: Object.freeze(['seo']),
      source,
      options,
      legacy: async () => Object.freeze({ title: 'legacy' }),
      v3: async () => Object.freeze({ title: 'v3' }),
      validate: () => {
        throw new Error(secret);
      },
    });

    await expect(promise).rejects.toSatisfy((error: unknown) => {
      expectPipelineError(error, 'v3_result_invalid');
      expect(String(error)).not.toContain(secret);
      return true;
    });
  });

  it('snapshots shadow input before legacy mutation and queues v3 only after success', async () => {
    const mutableSource = { contentMode: 'seo', nested: { value: 'original' } };
    const options = { minChars: 2_500 };
    const legacyResult = Object.freeze({ title: 'legacy' });
    let queuedJob: ShadowQueueJob | undefined;
    const enqueue = vi.fn((job: ShadowQueueJob) => {
      queuedJob = job;
      return Object.freeze({ accepted: true, status: 'accepted' as const, queueDepth: 0 });
    });
    const v3 = vi.fn(async (source: typeof mutableSource) => {
      expect(source).not.toBe(mutableSource);
      expect(source.nested.value).toBe('original');
      return Object.freeze({ title: 'v3' });
    });

    const result = await runContentPipeline({
      requestedMode: 'shadow',
      contentMode: mutableSource.contentMode,
      source: mutableSource,
      options,
      legacy: async source => {
        source.nested.value = 'legacy-mutated';
        expect(enqueue).not.toHaveBeenCalled();
        return legacyResult;
      },
      v3,
      validate: validResult,
      shadowQueue: Object.freeze({ enqueue }),
    });

    expect(result).toBe(legacyResult);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(queuedJob).toBeTypeOf('function');
    await expect(queuedJob?.()).resolves.toBeUndefined();
    expect(v3).toHaveBeenCalledWith(
      { contentMode: 'seo', nested: { value: 'original' } },
      options,
    );
  });

  it('returns legacy without waiting for the queued shadow driver', async () => {
    const { source, options } = makeInput();
    let releaseShadow!: () => void;
    const shadowGate = new Promise<void>(resolve => {
      releaseShadow = resolve;
    });
    const queue = createShadowQueue();
    const legacyResult = Object.freeze({ title: 'legacy' });

    const result = await runContentPipeline({
      requestedMode: 'shadow',
      contentMode: source.contentMode,
      source,
      options,
      legacy: async () => legacyResult,
      v3: async () => {
        await shadowGate;
        return Object.freeze({ title: 'v3' });
      },
      validate: validResult,
      shadowQueue: queue,
    });

    expect(result).toBe(legacyResult);
    releaseShadow();
    await queue.drain();
  });

  it('keeps shadow dormant when production does not inject an isolated queue', async () => {
    const { source, options } = makeInput();
    const legacyResult = Object.freeze({ title: 'legacy' });
    const v3 = vi.fn(async () => Object.freeze({ title: 'v3' }));

    const result = await runContentPipeline({
      requestedMode: 'shadow',
      contentMode: source.contentMode,
      source,
      options,
      legacy: async () => legacyResult,
      v3,
      validate: validResult,
    });

    expect(result).toBe(legacyResult);
    expect(v3).not.toHaveBeenCalled();
  });

  it('does not enqueue shadow work when legacy fails', async () => {
    const { source, options } = makeInput();
    const legacyError = new Error('legacy identity');
    const enqueue = vi.fn();
    const v3 = vi.fn(async () => Object.freeze({ title: 'v3' }));

    const promise = runContentPipeline({
      requestedMode: 'shadow',
      contentMode: source.contentMode,
      source,
      options,
      legacy: async () => {
        throw legacyError;
      },
      v3,
      validate: validResult,
      shadowQueue: Object.freeze({ enqueue }),
    });

    await expect(promise).rejects.toBe(legacyError);
    expect(enqueue).not.toHaveBeenCalled();
    expect(v3).not.toHaveBeenCalled();
  });

  it('skips shadow safely when snapshotting fails', async () => {
    const { source, options } = makeInput();
    const legacyResult = Object.freeze({ title: 'legacy' });
    const enqueue = vi.fn();
    const snapshot = vi.fn((): ContentPipelineSnapshot<SourceFixture, OptionsFixture> => {
      throw new Error('snapshot failed with raw input');
    });

    const result = await runContentPipeline({
      requestedMode: 'shadow',
      contentMode: source.contentMode,
      source,
      options,
      legacy: async () => legacyResult,
      v3: async () => Object.freeze({ title: 'v3' }),
      validate: validResult,
      shadowQueue: Object.freeze({ enqueue }),
      snapshot,
    });

    expect(result).toBe(legacyResult);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('consumes a queue exception and preserves the exact legacy result', async () => {
    const { source, options } = makeInput();
    const legacyResult = Object.freeze({ title: 'legacy' });

    const result = await runContentPipeline({
      requestedMode: 'shadow',
      contentMode: source.contentMode,
      source,
      options,
      legacy: async () => legacyResult,
      v3: async () => Object.freeze({ title: 'v3' }),
      validate: validResult,
      shadowQueue: Object.freeze({
        enqueue: () => {
          throw new Error('queue telemetry failure');
        },
      }),
    });

    expect(result).toBe(legacyResult);
  });

  it('lets the shadow queue consume v3 rejection and validation failure', async () => {
    const { source, options } = makeInput();
    const outcomes: string[] = [];
    const queue = createShadowQueue({
      onOutcome: outcome => {
        outcomes.push(outcome.status);
      },
    });

    await runContentPipeline({
      requestedMode: 'shadow',
      contentMode: source.contentMode,
      source,
      options,
      legacy: async () => Object.freeze({ title: 'legacy-one' }),
      v3: async () => {
        throw new Error('RAW_SHADOW_PROVIDER_SECRET');
      },
      validate: validResult,
      shadowQueue: queue,
    });
    await runContentPipeline({
      requestedMode: 'shadow',
      contentMode: source.contentMode,
      source,
      options,
      legacy: async () => Object.freeze({ title: 'legacy-two' }),
      v3: async () => Object.freeze({ title: '' }),
      validate: validResult,
      shadowQueue: queue,
    });

    await expect(queue.drain()).resolves.toBeUndefined();
    expect(outcomes).toEqual(['failed', 'failed']);
  });

  it('does not snapshot when shadow dependencies are absent', async () => {
    const { source, options } = makeInput();
    const legacyResult = Object.freeze({ title: 'legacy' });
    const snapshot = vi.fn((sourceValue, optionsValue) => ({
      source: sourceValue,
      options: optionsValue,
    }));

    const result = await runContentPipeline({
      requestedMode: 'shadow',
      contentMode: source.contentMode,
      source,
      options,
      legacy: async () => legacyResult,
      validate: validResult,
      snapshot,
    });

    expect(result).toBe(legacyResult);
    expect(snapshot).not.toHaveBeenCalled();
  });
});
