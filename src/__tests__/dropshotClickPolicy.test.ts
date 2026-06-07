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
});
