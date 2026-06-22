import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Regression guard for insertBase64ImageAtCursor success detection (2026-06-23).
 *
 * Symptom: after a FileChooser upload the function checked `imgCount > 0`. Once any
 * earlier section had inserted an image, that condition was always true, so a failed
 * upload (FileChooser not opening / upload timing out on a slow client) was treated as
 * success — the Base64 fallback was skipped and the image was silently missing.
 *
 * Fix: snapshot the image count before the upload and require the count to GROW
 * (`imgCount > imgBeforeCount`), so a failed upload falls through to the Base64 fallback.
 */
describe('image insert delta guard', () => {
  const img = read('automation/imageHelpers.ts');

  it('snapshots image count before the upload in insertBase64ImageAtCursor', () => {
    expect(img).toMatch(/const imgBeforeCount = await frame\.\$\$eval\(IMG_SELECTOR/);
  });

  it('judges insertion by growth, not absolute count (no bare imgCount > 0)', () => {
    expect(img).toMatch(/if \(imgCount > imgBeforeCount\)/);
    expect(img).not.toContain('if (imgCount > 0) {');
  });
});
