import { describe, it, expect, afterEach } from 'vitest';
import {
  GEMINI_RATE_LIMIT_MIN_WAIT_MS,
  classifyGeminiBillingBlock,
  getGeminiRateLimitPatienceMs,
  getGeminiRateLimitWaitMs,
  isGeminiPrepaidCreditsDepletedError,
} from '../contentGenerator.js';

describe('Gemini rate-limit wait policy', () => {
  const originalPatience = process.env.GEMINI_RATE_LIMIT_PATIENCE_MS;

  afterEach(() => {
    if (originalPatience === undefined) delete process.env.GEMINI_RATE_LIMIT_PATIENCE_MS;
    else process.env.GEMINI_RATE_LIMIT_PATIENCE_MS = originalPatience;
  });

  it('waits at least one full minute window when Gemini gives no retry hint', () => {
    const error = new Error('429 RESOURCE_EXHAUSTED: quota exceeded');

    expect(getGeminiRateLimitWaitMs(error, 15_000)).toBe(GEMINI_RATE_LIMIT_MIN_WAIT_MS);
  });

  it('does not retry too early even when Gemini retry hint is below one minute', () => {
    const error = new Error('429 RESOURCE_EXHAUSTED. Please retry in 45.06576809s.');

    expect(getGeminiRateLimitWaitMs(error, 15_000)).toBe(GEMINI_RATE_LIMIT_MIN_WAIT_MS);
  });

  it('honors longer RetryInfo hints and caps one wait to three minutes', () => {
    const error = {
      status: 429,
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '125s' }],
    };

    expect(getGeminiRateLimitWaitMs(error, 75_000)).toBe(126_000);
  });

  it('keeps paid Gemini jobs patient enough for several RPM/TPM windows', () => {
    delete process.env.GEMINI_RATE_LIMIT_PATIENCE_MS;

    expect(getGeminiRateLimitPatienceMs({ geminiPlanType: 'paid' })).toBe(12 * 60_000);
    expect(getGeminiRateLimitPatienceMs({ geminiPlanType: 'free' })).toBe(5 * 60_000);
  });

  it('treats a blank env override as unset instead of zero minutes', () => {
    process.env.GEMINI_RATE_LIMIT_PATIENCE_MS = '';

    expect(getGeminiRateLimitPatienceMs({ geminiPlanType: 'paid' })).toBe(12 * 60_000);
  });

  it('classifies depleted prepaid credits as billing, not RPM/TPM wait', () => {
    const error = {
      status: 429,
      message: 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.',
    };

    expect(isGeminiPrepaidCreditsDepletedError(error)).toBe(true);
    expect(classifyGeminiBillingBlock(error)).toBe('prepay_depleted');
  });

  it('classifies postpay spend caps separately from prepay depletion and RPM waits', () => {
    const error = {
      status: 429,
      message: 'Gemini API service paused because the billing account tier spend cap or monthly spend cap was reached.',
    };

    expect(classifyGeminiBillingBlock(error)).toBe('postpay_spend_cap');
    expect(isGeminiPrepaidCreditsDepletedError(error)).toBe(false);
  });
});
