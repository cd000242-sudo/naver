import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * SPEC-STABILITY-2026 R4 (S4): every post generated its images TWICE.
 *
 * Trigger (live 6/10 dropshot+openai, 6/11 deepinfra — confirmed in code):
 * the continuous flow generates images and fills window.generatedImages +
 * ImageManager, then delegates to executeFullAutoFlow WITHOUT the
 * formData.imageManagementImages field — and fullAutoFlow's entry wipes
 * ImageManager/globals whenever that field is absent, then regenerates all
 * headings ([1/N] batch). Cost evidence: 237 OpenAI images in one day.
 */
describe('image double-generation guard (R4)', () => {
  it('continuous hands its generated images to fullAutoFlow via formData.imageManagementImages', () => {
    const code = read('renderer/modules/continuousPublishing.ts');
    const start = code.indexOf("mode: 'full-auto'");
    expect(start).toBeGreaterThan(-1);
    const formDataBlock = code.slice(start, start + 1500);
    expect(formDataBlock).toMatch(/imageManagementImages/);
  });

  it('fullAutoFlow keeps its reuse path for pre-generated images (wipe only when absent)', () => {
    const code = read('renderer/modules/fullAutoFlow.ts');
    expect(code).toMatch(/hasPreGeneratedImages/);
    expect(code).toMatch(/초기화 스킵 \(중복 생성 방지\)/);
  });

  it('generateImagesForAutomation rejects a second in-flight run for the same post (single-flight)', () => {
    const code = read('renderer/modules/multiAccountManager.ts');
    expect(code).toMatch(/IMAGE_DUPLICATE_RUN/);
    // The in-flight key must always be released, success or failure.
    expect(code).toMatch(/finally[\s\S]{0,120}?_giaInFlight\.delete/);
  });
});
