import { describe, expect, it } from 'vitest';

import { snapshotContentGenerationInput } from '../contentPipeline/contentGenerationSnapshot';

describe('snapshotContentGenerationInput', () => {
  it('isolates mutable input while preserving the real AbortSignal identity', () => {
    const controller = new AbortController();
    const source = { nested: { value: 'original' } };
    const options = {
      signal: controller.signal,
      minChars: 2_500,
      v3Allowlist: ['seo'],
    };

    const snapshot = snapshotContentGenerationInput(source, options);

    expect(snapshot.source).not.toBe(source);
    expect(snapshot.source).toEqual(source);
    expect(snapshot.options).not.toBe(options);
    expect(snapshot.options.signal).toBe(controller.signal);
    expect(snapshot.options.v3Allowlist).not.toBe(options.v3Allowlist);
    expect(snapshot.options.v3Allowlist).toEqual(['seo']);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.options)).toBe(true);
    expect(Object.isFrozen(snapshot.options.v3Allowlist)).toBe(true);

    source.nested.value = 'legacy mutation';
    options.v3Allowlist.push('business');
    controller.abort();

    expect(snapshot.source.nested.value).toBe('original');
    expect(snapshot.options.v3Allowlist).toEqual(['seo']);
    expect(snapshot.options.signal?.aborted).toBe(true);
  });

  it('does not invent a signal when the request has none', () => {
    const snapshot = snapshotContentGenerationInput(
      { rawText: '자료' },
      { minChars: 1_000 },
    );

    expect(snapshot.options).toEqual({ minChars: 1_000 });
    expect('signal' in snapshot.options).toBe(false);
  });
});
