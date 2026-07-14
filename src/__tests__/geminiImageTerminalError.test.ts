import { describe, expect, it } from 'vitest';
import {
  createGeminiImageHttpError,
  isTerminalGeminiImageError,
} from '../image/nanoBananaProGenerator.js';

describe('Gemini image terminal errors', () => {
  it('classifies billing and model reselection errors as terminal', () => {
    expect(isTerminalGeminiImageError(
      new Error('GEMINI_IMAGE_BILLING_REQUIRED: credits depleted'),
    )).toBe(true);
    expect(isTerminalGeminiImageError(
      new Error('[IMAGE_MODEL_SELECTION_REQUIRED] choose again'),
    )).toBe(true);
    expect(isTerminalGeminiImageError(new Error('HTTP 503'))).toBe(false);
  });

  it('reads a failed fetch body and converts prepaid billing failures to terminal errors', async () => {
    const error = await createGeminiImageHttpError({
      ok: false,
      status: 402,
      text: async () => JSON.stringify({
        error: { message: 'Prepayment credits are depleted. Manage your project and billing.' },
      }),
    });

    expect(error.message).toContain('GEMINI_IMAGE_BILLING_REQUIRED');
    expect(isTerminalGeminiImageError(error)).toBe(true);
  });

  it('keeps ordinary HTTP failures non-terminal so model recovery can continue', async () => {
    const error = await createGeminiImageHttpError({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    });

    expect(error.message).toContain('HTTP 503');
    expect(isTerminalGeminiImageError(error)).toBe(false);
  });
});
