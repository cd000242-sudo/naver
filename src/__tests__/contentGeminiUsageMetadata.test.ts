import { describe, expect, it, vi } from 'vitest';
import {
  GEMINI_USAGE_METADATA_TIMEOUT_MS,
  waitForGeminiUsageMetadata,
} from '../contentGeminiUsageMetadata';

describe('contentGeminiUsageMetadata', () => {
  it('returns aggregated Gemini response metadata when it arrives in time', async () => {
    const response = { usageMetadata: { totalTokenCount: 123 } };
    const withTimeout = vi.fn(async (promise: Promise<unknown>) => promise);

    await expect(waitForGeminiUsageMetadata({ response }, { withTimeout }))
      .resolves.toBe(response);

    expect(withTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      GEMINI_USAGE_METADATA_TIMEOUT_MS,
      'Gemini usage metadata timeout (5s)',
    );
  });

  it('returns null and logs a warning when metadata aggregation times out', async () => {
    const warn = vi.fn();
    const withTimeout = vi.fn(async () => {
      throw new Error('timeout');
    });

    await expect(waitForGeminiUsageMetadata({ response: Promise.resolve({}) }, { withTimeout, warn }))
      .resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      '[Gemini] usage metadata 대기 시간 초과 — 생성 결과는 그대로 사용:',
      'timeout',
    );
  });

  it('returns null instead of failing when the SDK response handle is absent', async () => {
    const warn = vi.fn();

    await expect(waitForGeminiUsageMetadata({}, { warn }))
      .resolves.toBeNull();

    expect(warn).not.toHaveBeenCalled();
  });
});
