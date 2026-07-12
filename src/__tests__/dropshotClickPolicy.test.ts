import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('Dropshot generate button policy', () => {
  const code = read('image/dropshotCapture.ts');

  it('prioritizes the real Korean generate button near the prompt', () => {
    expect(code).toMatch(/promptRectForGenerate/);
    expect(code).toMatch(/rankedGenerateButton/);
    expect(code).toMatch(/\\uC774\\uBBF8\\uC9C0 \\uC0DD\\uC131\\uD558\\uAE30/);
    expect(code).toMatch(/\\uC0DD\\uC131\\uD558\\uAE30/);
    expect(code).toMatch(/horizontallyAligned/);
    expect(code).toMatch(/belowPrompt/);
  });

  it('verifies that the controlled prompt contains the requested text before clicking', () => {
    expect(code).toMatch(/readVisiblePromptValue/);
    expect(code).toMatch(/Dropshot prompt value did not match the requested prompt/);
  });

  it('accepts only large rendered result images and ignores lazy sidebar thumbnails', () => {
    expect(code).toMatch(/const renderedWidth = rect\.width/);
    expect(code).toMatch(/const renderedHeight = rect\.height/);
    expect(code).not.toMatch(/el\.naturalWidth \|\| rect\.width/);
    expect(code).not.toMatch(/i\.naturalWidth > 200/);
  });

  it('rejects the Dropshot generation-error fallback and retries instead of reporting success', () => {
    expect(code).toMatch(/generation-error-fallback/);
    expect(code).toMatch(/readDropshotGenerationError/);
    expect(code).toMatch(/Dropshot generation failed:/);
  });
});
