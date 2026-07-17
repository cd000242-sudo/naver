import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

function readSource(...segments: string[]): string {
  return readFileSync(resolve(process.cwd(), ...segments), 'utf8');
}

describe('legacy text generators keep quality advisory and submissions explicit', () => {
  it('does not let the Gemini legacy generator turn a received draft into a paid retry', () => {
    const source = readSource('src', 'gemini.ts');

    expect(source).toContain("from './generation/submissionPolicy.js'");
    expect(source).toContain('shouldAllowAutomaticProviderRetry');
    expect(source).toContain('const qualityWarnings = getContentQualityWarnings(text);');
    expect(source).not.toContain("throw new Error('품질 기준 미달')");
  });

  it('does not let the Perplexity legacy generator turn a received draft into a paid retry', () => {
    const source = readSource('src', 'perplexity.ts');

    expect(source).toContain("from './generation/submissionPolicy.js'");
    expect(source).toContain('shouldAllowAutomaticProviderRetry');
    expect(source).toContain('const qualityWarnings = getContentQualityWarnings(content);');
    expect(source).not.toContain("throw new Error('품질 기준 미달')");
  });

  it('does not run hidden title-patch model calls in single-submission mode', () => {
    const source = readSource('src', 'contentGenerator.ts');

    expect(source).toMatch(
      /allowPaidPostGenerationRepair\s*&&\s*allowLegacyPostDraftLlm\s*&&\s*!_useKwTitle\s*&&\s*\(mode === 'seo'/,
    );
    expect(source).toMatch(
      /allowPaidPostGenerationRepair\s*&&\s*allowLegacyPostDraftLlm\s*&&\s*!_useKwTitle\s*&&\s*mode === 'homefeed'/,
    );
    expect(source).toMatch(
      /allowPaidPostGenerationRepair\s*&&\s*allowLegacyPostDraftLlm\s*&&\s*!_useKwTitle\s*&&\s*\(isShoppingConnectMode/,
    );
  });
});
