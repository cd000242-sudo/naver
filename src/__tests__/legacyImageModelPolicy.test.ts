import { describe, expect, it } from 'vitest';
import {
  assertCurrentGeminiImageModelConfiguration,
  assertCurrentGeminiImageModelSelection,
  isImageModelSelectionRequiredError,
  LEGACY_FREE_GEMINI_IMAGE_MODEL_KEY,
} from '../image/legacyImageModelPolicy.js';

describe('legacy Gemini image model policy', () => {
  it('blocks the retired free model instead of silently switching to a paid model', () => {
    expect(() => assertCurrentGeminiImageModelSelection(LEGACY_FREE_GEMINI_IMAGE_MODEL_KEY))
      .toThrowError(/\[IMAGE_MODEL_SELECTION_REQUIRED\]/);
  });

  it('returns a trimmed current model key unchanged', () => {
    expect(assertCurrentGeminiImageModelSelection('  gemini-3-1-flash  '))
      .toBe('gemini-3-1-flash');
  });

  it('recognizes only the explicit reselection error as a terminal policy error', () => {
    expect(isImageModelSelectionRequiredError(
      new Error('[IMAGE_MODEL_SELECTION_REQUIRED] choose again'),
    )).toBe(true);
    expect(isImageModelSelectionRequiredError(new Error('HTTP 503'))).toBe(false);
  });

  it('preflights both main and sub model settings before a batch starts', () => {
    expect(() => assertCurrentGeminiImageModelConfiguration(
      'gemini-3-1-flash',
      LEGACY_FREE_GEMINI_IMAGE_MODEL_KEY,
    )).toThrowError(/\[IMAGE_MODEL_SELECTION_REQUIRED\]/);
    expect(() => assertCurrentGeminiImageModelConfiguration(
      LEGACY_FREE_GEMINI_IMAGE_MODEL_KEY,
      'gemini-3-1-flash',
    )).toThrowError(/\[IMAGE_MODEL_SELECTION_REQUIRED\]/);
  });
});
