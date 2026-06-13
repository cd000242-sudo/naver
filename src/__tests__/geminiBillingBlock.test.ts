import { describe, expect, it } from 'vitest';
import {
  buildGeminiBillingBlockMessage,
  classifyGeminiBillingBlock,
  isGeminiPrepaidCreditsDepletedError,
} from '../geminiBillingBlock.js';

describe('Gemini billing block classification', () => {
  it('classifies depleted prepaid credits separately from transient RPM waits', () => {
    const error = {
      status: 429,
      message: 'Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.',
    };

    expect(isGeminiPrepaidCreditsDepletedError(error)).toBe(true);
    expect(classifyGeminiBillingBlock(error)).toBe('prepay_depleted');
  });

  it('classifies postpay spend caps as non-waitable billing blocks', () => {
    const error = {
      status: 429,
      message: 'Service paused because the billing account tier spend cap or monthly spend cap was reached.',
    };

    expect(isGeminiPrepaidCreditsDepletedError(error)).toBe(false);
    expect(classifyGeminiBillingBlock(error)).toBe('postpay_spend_cap');
  });

  it('classifies missing billing setup without confusing it with prepay depletion', () => {
    const error = new Error('Set up billing account details before using the paid plan.');

    expect(isGeminiPrepaidCreditsDepletedError(error)).toBe(false);
    expect(classifyGeminiBillingBlock(error)).toBe('billing_required');
  });

  it('keeps billing messages explicit about the user action', () => {
    const prepayMessage = buildGeminiBillingBlockMessage('prepay_depleted', 'gemini-2.5-flash');
    const postpayMessage = buildGeminiBillingBlockMessage('postpay_spend_cap', 'gemini-2.5-flash');

    expect(prepayMessage).toContain('선불 크레딧 소진');
    expect(prepayMessage).toContain('후불 결제 프로젝트');
    expect(postpayMessage).toContain('후불 결제 한도');
    expect(postpayMessage).toContain('1분을 기다려도 자동으로 풀리지 않습니다');
  });
});
