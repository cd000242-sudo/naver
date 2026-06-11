import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  stripKoreanResidue,
  isPromptContentEmpty,
  hasUsableEnglishPrompt,
} from '../image/promptSafety.js';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Regression guards for the DeepInfra empty-prompt bug (2026-06-11 live run).
 *
 * Symptom: keyword "거울 물때 청소법" produced unrelated images of random people.
 * Root cause chain observed in live logs:
 *   1. AI scene prompts arrived in Korean (sometimes inside the englishPrompt field),
 *   2. the "Korean residue removal" safety net stripped ALL Korean,
 *   3. the final prompt became "visual scene depicting: ," — effectively empty,
 *   4. FLUX free-generated arbitrary images (random Korean faces).
 */
describe('prompt safety helpers', () => {
  it('strips Korean characters and collapses whitespace', () => {
    expect(stripKoreanResidue('visual scene depicting: 거울 물때 청소법, 순서와 주의사항')).toBe('visual scene depicting: ,');
    expect(stripKoreanResidue('욕실 거울에 구연산수를 뿌리는 모습')).toBe('');
    expect(stripKoreanResidue('clean mirror 거울 surface')).toBe('clean mirror surface');
  });

  it('detects content-empty prompts produced by Korean-only stripping (live failure cases)', () => {
    // Actual post-strip prompts from the 2026-06-11 live run:
    expect(isPromptContentEmpty('visual scene depicting: ,')).toBe(true);
    expect(isPromptContentEmpty(',')).toBe(true);
    expect(isPromptContentEmpty(', , ,')).toBe(true);
    expect(isPromptContentEmpty('')).toBe(true);
  });

  it('keeps prompts that still carry a real visual subject', () => {
    expect(isPromptContentEmpty('professional photography of a bathroom mirror with limescale stains')).toBe(false);
    expect(isPromptContentEmpty('close-up shot of citric acid powder and baking soda')).toBe(false);
  });

  it('rejects englishPrompt values that actually contain Korean (live failure case)', () => {
    expect(hasUsableEnglishPrompt('욕실 거울에 하얗게 낀 물때 얼룩이 선명하게 보이는 모습')).toBe(false);
    expect(hasUsableEnglishPrompt('A Korean person cleaning a mirror 거울')).toBe(false);
    expect(hasUsableEnglishPrompt(undefined)).toBe(false);
    expect(hasUsableEnglishPrompt('')).toBe(false);
    expect(hasUsableEnglishPrompt('A spotless bathroom mirror, cinematic')).toBe(true);
  });
});

describe('deepinfraGenerator wiring', () => {
  it('routes Korean-only prompts to AI-translation recovery instead of calling the API with an empty prompt', () => {
    const code = read('image/deepinfraGenerator.ts');
    expect(code).toContain('isPromptContentEmpty(');
    expect(code).toContain('AI 번역 복구');
  });

  it('does not let a Korean-laden englishPrompt bypass the translation fallback', () => {
    const code = read('image/deepinfraGenerator.ts');
    expect(code).toContain('hasUsableEnglishPrompt(');
    // The old exemption that caused the bug:
    expect(code).not.toMatch(/shouldUseKoreanFallback = isCharacterOrArtStyle\s*\?\s*\(hasKoreanHeading && !item\.englishPrompt\)/);
  });
});
