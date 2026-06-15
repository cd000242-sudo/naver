import { describe, expect, it, vi } from 'vitest';
import {
  getProviderRateLimitWaitMs,
  parseProviderDelayMs,
  readProviderHeader,
} from '../providerRateLimitWaitPolicy';

describe('providerRateLimitWaitPolicy', () => {
  it('reads rate-limit headers from plain objects and Headers-like objects', () => {
    expect(readProviderHeader({ headers: { 'Retry-After': '2' } }, 'retry-after')).toBe('2');
    expect(readProviderHeader({
      response: {
        headers: {
          get: (name: string) => (name === 'retry-after' ? '3' : undefined),
        },
      },
    }, 'retry-after')).toBe('3');
  });

  it('parses seconds, duration units, and dates into milliseconds', () => {
    expect(parseProviderDelayMs('2')).toBe(2000);
    expect(parseProviderDelayMs('1500ms')).toBe(1500);
    expect(parseProviderDelayMs('1m30s')).toBe(90_000);

    vi.setSystemTime(new Date('2026-06-15T00:00:00Z'));
    expect(parseProviderDelayMs('Mon, 15 Jun 2026 00:00:05 GMT')).toBe(5000);
    vi.useRealTimers();
  });

  it('uses the largest provider hint, adds a small buffer, and caps single waits', () => {
    const error = {
      headers: { 'retry-after': '2' },
      error: { message: 'rate limited retry-after: 4s' },
    };

    expect(getProviderRateLimitWaitMs(error, 1000, ['retry-after'])).toBe(4500);
    expect(getProviderRateLimitWaitMs({ message: 'retry-after: 10m' }, 1000, [])).toBe(180_000);
  });
});
