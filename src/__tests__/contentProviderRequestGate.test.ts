import { describe, expect, it, vi } from 'vitest';
import { ProviderRequestGate } from '../contentProviderRequestGate';

describe('contentProviderRequestGate', () => {
  it('reserves sequential slots before sleeping so concurrent provider calls cannot share one window', async () => {
    let now = 1_000;
    const sleeps: number[] = [];
    const gate = new ProviderRequestGate({
      now: () => now,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        now += ms;
      },
    });

    await gate.throttle('Gemini:paid:gemini-2.5-flash', 8_000);
    now = 1_000;
    await gate.throttle('Gemini:paid:gemini-2.5-flash', 8_000);

    expect(sleeps).toEqual([8_000]);
    expect(gate.getNextAllowedAt('Gemini:paid:gemini-2.5-flash')).toBe(17_000);
  });

  it('keeps independent gates per provider and model key', async () => {
    const sleeps: number[] = [];
    const gate = new ProviderRequestGate({
      now: () => 10_000,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    });

    await gate.throttle('Claude:sonnet', 8_000);
    await gate.throttle('Perplexity:sonar', 2_000);

    expect(sleeps).toEqual([]);
    expect(gate.getNextAllowedAt('Claude:sonnet')).toBe(18_000);
    expect(gate.getNextAllowedAt('Perplexity:sonar')).toBe(12_000);
  });

  it('extends rate-limit backoff but never shortens an existing later reservation', () => {
    let now = 1_000;
    const gate = new ProviderRequestGate({ now: () => now });

    gate.recordBackoff('OpenAI:gpt-4.1', 30_000);
    expect(gate.getNextAllowedAt('OpenAI:gpt-4.1')).toBe(31_000);

    now = 2_000;
    gate.recordBackoff('OpenAI:gpt-4.1', 1_000);
    expect(gate.getNextAllowedAt('OpenAI:gpt-4.1')).toBe(31_000);

    gate.recordBackoff('OpenAI:gpt-4.1', 40_000);
    expect(gate.getNextAllowedAt('OpenAI:gpt-4.1')).toBe(42_000);
  });

  it('logs only when a request actually needs to wait', async () => {
    let now = 5_000;
    const log = vi.fn();
    const gate = new ProviderRequestGate({
      now: () => now,
      sleep: async (ms: number) => {
        now += ms;
      },
      log,
    });

    await gate.throttle('Gemini:auto:gemini-2.5-flash', 10_000, undefined, 'wait please');
    now = 5_000;
    await gate.throttle('Gemini:auto:gemini-2.5-flash', 10_000, undefined, 'wait please');

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('wait please');
  });
});
