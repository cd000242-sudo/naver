import { describe, expect, it } from 'vitest';
import {
  GEMINI_VISION_RATE_LIMIT_FALLBACK_WAIT_MS,
  GEMINI_VISION_RATE_LIMIT_MAX_SINGLE_WAIT_MS,
  getGeminiVisionRateLimitWaitMs,
  isGeminiVisionRateLimitError,
} from '../runtime/geminiVisionQuotaGuard.js';

describe('geminiVisionQuotaGuard', () => {
  it('classifies Google free-tier 5RPM errors as Gemini Vision rate limits', () => {
    const error = new Error(
      '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [429 Too Many Requests] You exceeded your current quota. ' +
      'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-2.5-flash ' +
      'Please retry in 32.645348739s. quotaId="GenerateRequestsPerMinutePerProjectPerModel-FreeTier"',
    );

    expect(isGeminiVisionRateLimitError(error)).toBe(true);
  });

  it('honors RetryInfo while keeping the default wait above one full quota window', () => {
    const error = new Error('429 Too Many Requests. Please retry in 32.645348739s.');

    expect(getGeminiVisionRateLimitWaitMs(error)).toBe(
      GEMINI_VISION_RATE_LIMIT_FALLBACK_WAIT_MS + 1_000,
    );
    expect(getGeminiVisionRateLimitWaitMs(error, 15_000)).toBe(33_646);
  });

  it('caps a single RetryInfo wait so one failed call cannot hang indefinitely', () => {
    const error = {
      status: 429,
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '250s' }],
    };

    expect(getGeminiVisionRateLimitWaitMs(error)).toBe(
      GEMINI_VISION_RATE_LIMIT_MAX_SINGLE_WAIT_MS,
    );
  });
});
