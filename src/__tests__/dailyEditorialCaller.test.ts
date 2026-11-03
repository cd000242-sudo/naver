import { afterEach, describe, it, expect, vi } from 'vitest';
import { createDailyEditorialCaller } from '../main/services/dailyEditorialCaller.js';
afterEach(() => { vi.useRealTimers(); });

describe('daily editorial selected engine', () => {
  it('uses only the requested engine quality route without switching to another configured vendor', async () => {
    const callModel = vi.fn(async () => '{"ok":true}');
    const resolve = vi.fn(() => ({ engine: 'selected', subscription: true, callModel }));
    const config = { defaultAiProvider: 'gemini', openaiApiKey: 'unused-fixture' };
    const caller = await createDailyEditorialCaller('agent-claude', config, undefined, { resolve });
    expect(resolve).toHaveBeenCalledWith('agent-claude', config, { tier: 'quality' });
    expect(caller.timeoutMs).toBe(190_000);
    expect(await caller.complete('자료 심사', { maxOutputTokens: 6000 })).toBe('{"ok":true}');
    expect(callModel).toHaveBeenCalledWith('자료 심사', { maxTokens: 6000, timeoutMs: 180_000, signal: expect.any(AbortSignal) });
  });
  it('does not invoke any model when the selected route is missing, cancelled, or input exceeds bounds', async () => {
    await expect(createDailyEditorialCaller('claude', {}, undefined, { resolve: () => null })).rejects.toThrow('DAILY_EDITORIAL_ENGINE_REQUIRED');
    const callModel = vi.fn(async () => '[]'), abort = new AbortController();
    const caller = await createDailyEditorialCaller('claude', {}, abort.signal, { resolve: () => ({ engine: 'x', callModel }) });
    await expect(caller.complete('x'.repeat(100001))).rejects.toThrow('DAILY_EDITORIAL_INPUT_LIMIT');
    abort.abort(); await expect(caller.complete('작업')).rejects.toThrow('DAILY_CANCELLED');
    expect(callModel).not.toHaveBeenCalled();
  });
  it('cancels waiting without another provider request and observes a late rejection', async () => {
    const abort = new AbortController(); let rejectLate: (e: Error) => void = () => {};
    const callModel = vi.fn(() => new Promise<string>((_resolve, reject) => { rejectLate = reject; }));
    const caller = await createDailyEditorialCaller('claude', {}, undefined, { resolve: () => ({ engine: 'x', callModel }) });
    const pending = caller.complete('작업', { signal: abort.signal });
    await Promise.resolve(); abort.abort(); await expect(pending).rejects.toThrow('DAILY_CANCELLED');
    rejectLate(Error('late')); await Promise.resolve(); expect(callModel).toHaveBeenCalledTimes(1);
  });
  it('aborts the underlying request on either caller signal and removes listeners', async () => {
    for (const cancelLifetime of [false, true]) {
      const lifetime = new AbortController(), individual = new AbortController();
      const removals = [vi.spyOn(lifetime.signal, 'removeEventListener'), vi.spyOn(individual.signal, 'removeEventListener')];
      let signal: AbortSignal | undefined;
      const callModel = vi.fn((_prompt, options) => { signal = options.signal; return new Promise<string>(() => {}); });
      const caller = await createDailyEditorialCaller('openai', {}, lifetime.signal, { resolve: () => ({ engine: 'selected', callModel }) });
      const pending = caller.complete('review', { signal: individual.signal });
      await Promise.resolve(); (cancelLifetime ? lifetime : individual).abort();
      await expect(pending).rejects.toThrow('DAILY_CANCELLED');
      expect(signal?.aborted).toBe(true); expect(callModel).toHaveBeenCalledTimes(1);
      for (const remove of removals) expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    }
  });
  it('aborts on its timeout without another submission and cleans up its timer', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    const callModel = vi.fn((_prompt, options) => { signal = options.signal; return new Promise<string>(() => {}); });
    const caller = await createDailyEditorialCaller('openai', {}, undefined, { resolve: () => ({ engine: 'selected', callModel }) });
    const pending = caller.complete('review'); const rejected = expect(pending).rejects.toThrow('DAILY_EDITORIAL_TIMEOUT');
    await vi.advanceTimersByTimeAsync(100_001); await rejected;
    expect(signal?.aborted).toBe(true); expect(callModel).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not submit when cancellation arrives before the queued model call starts', async () => {
    const controller = new AbortController(), callModel = vi.fn(async () => 'late content');
    const caller = await createDailyEditorialCaller('openai', {}, controller.signal, { resolve: () => ({ engine: 'selected', callModel }) });
    const pending = caller.complete('review'); controller.abort();
    await expect(pending).rejects.toThrow('DAILY_CANCELLED'); expect(callModel).not.toHaveBeenCalled();
  });
  it('refuses an already-cancelled lifetime before resolving credentials', async () => {
    const abort = new AbortController(); abort.abort(); const resolve = vi.fn();
    await expect(createDailyEditorialCaller('openai', {}, abort.signal, { resolve })).rejects.toThrow('DAILY_CANCELLED');
    expect(resolve).not.toHaveBeenCalled();
  });
  it('bounds output budgets and rejects empty or oversized responses without retry', async () => {
    const callModel = vi.fn(async () => '{}');
    const caller = await createDailyEditorialCaller('openai', {}, undefined, { resolve: () => ({ engine: 'x', callModel }) });
    for (const [requested, expected] of [[0, 2000], [999999, 12000], [NaN, 10000]]) {
      await caller.complete('검수', { maxOutputTokens: requested });
      expect(callModel).toHaveBeenLastCalledWith('검수', expect.objectContaining({ maxTokens: expected }));
    }
    for (const invalid of ['', ' ', 'x'.repeat(128001), 42]) {
      callModel.mockResolvedValueOnce(invalid as string);
      await expect(caller.complete('검수')).rejects.toThrow('DAILY_EDITORIAL_RESPONSE_INVALID');
    }
    await expect(caller.complete(' ')).rejects.toThrow('DAILY_EDITORIAL_INPUT_LIMIT');
    expect(callModel).toHaveBeenCalledTimes(7);
  });
});
