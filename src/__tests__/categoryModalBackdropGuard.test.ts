import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

function readProjectFile(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...segments), 'utf-8');
}

describe('category modal backdrop guard', () => {
  const indexHtml = readProjectFile('public', 'index.html');
  const rendererSource = readProjectFile('src', 'renderer', 'renderer.ts');
  const modalBlock = indexHtml.match(/<div id="category-selection-modal"[\s\S]*?<div id="progress-modal"/);

  it('registers category modal content as non-backdrop content', () => {
    expect(rendererSource).toContain("'.category-modal-content'");
    expect(rendererSource).toContain("'[data-modal-content=\"true\"]'");
    expect(modalBlock).toBeTruthy();
    expect(modalBlock![0]).toMatch(
      /<div\s+[^>]*(class="[^"]*\bcategory-modal-content\b[^"]*"|data-modal-content="true")[^>]*>[\s\S]*id="cancel-category-modal"[\s\S]*id="confirm-category-modal"/,
    );
  });
});
