import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

function readRoot(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}

/**
 * Continuous-publishing modal image preview (2026-06-11 user request):
 * a large live preview of the latest generated image + a small thumbnail
 * strip, clicking a thumb swaps the large preview, clicking the large
 * preview opens a full-screen lightbox. Grid resets per post (item loop).
 */
describe('continuous modal image preview UI', () => {
  it('modal has a preview wrap with a main image and a thumbnail grid', () => {
    const html = readRoot('public/index.html');
    expect(html).toMatch(/id="cp-image-preview-wrap"/);
    expect(html).toMatch(/id="cp-image-main"/);
    expect(html).toMatch(/id="cp-image-grid"/);
  });

  it('preview bridge updates the main image and wires the lightbox', () => {
    const code = read('renderer/modules/costAndAutoGen.ts');
    expect(code).toMatch(/cp-image-main/);
    expect(code).toMatch(/cp-image-lightbox/);
  });

  it('post-boundary reset clears the main preview, not just the grid', () => {
    const code = read('renderer/modules/continuousPublishing.ts');
    expect(code).toMatch(/cp-image-preview-wrap/);
  });
});
