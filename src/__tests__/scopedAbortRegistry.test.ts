import { describe, expect, it } from 'vitest';
import { ScopedAbortRegistry } from '../runtime/scopedAbortRegistry';

describe('ScopedAbortRegistry', () => {
  it('aborts only the requested operation and never a newer sibling', () => {
    const registry = new ScopedAbortRegistry('content-generation');
    const first = registry.begin('request-first');
    const second = registry.begin('request-second');

    expect(registry.abort('request-first', 'timeout')).toBe(true);
    expect(first.controller.signal.aborted).toBe(true);
    expect(second.controller.signal.aborted).toBe(false);
    expect(registry.activeIds()).toEqual(['request-first', 'request-second']);

    registry.release(first.id, first.controller);
    registry.release(second.id, second.controller);
    expect(registry.activeIds()).toEqual([]);
  });

  it('does not let a stale release remove a replacement operation', () => {
    const registry = new ScopedAbortRegistry('content-generation');
    const first = registry.begin('same-request');
    registry.release(first.id, first.controller);
    const replacement = registry.begin('same-request');

    registry.release(first.id, first.controller);
    expect(registry.has(replacement.id)).toBe(true);
    expect(replacement.controller.signal.aborted).toBe(false);
  });

  it('ignores a delayed cancel for an operation that already finished', () => {
    const registry = new ScopedAbortRegistry('content-generation');
    const finished = registry.begin('finished-request');
    registry.release(finished.id, finished.controller);
    const current = registry.begin('current-request');

    expect(registry.abort(finished.id, 'late cleanup')).toBe(false);
    expect(current.controller.signal.aborted).toBe(false);
  });

  it('rejects duplicate active request ids', () => {
    const registry = new ScopedAbortRegistry('content-generation');
    registry.begin('duplicate-request');
    expect(() => registry.begin('duplicate-request')).toThrow(/OPERATION_ALREADY_ACTIVE/);
  });
});
