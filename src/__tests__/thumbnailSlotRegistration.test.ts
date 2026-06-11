import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * SPEC-STABILITY-2026 R5 (S5): full-auto thumbnail missing from the
 * image-management grid.
 *
 * Causes (research.md §C + code reading):
 *  1. fullAutoFlow's collected-image path explicitly skipped the thumbnail
 *     when registering into ImageManager — first grid slot stayed empty.
 *  2. syncGeneratedImagesArray only looked up the '🖼️ 썸네일' key; paths
 *     registering under '썸네일' or only an isThumbnail flag were dropped.
 *  3. Web-URL thumbnails 403/CORS in the grid; no local persistence and the
 *     grid gave up after one failed src.
 */
describe('full-auto thumbnail slot registration (R5)', () => {
  it('fullAutoFlow registers the collected thumbnail under the 🖼️ 썸네일 key', () => {
    const code = read('renderer/modules/fullAutoFlow.ts');
    expect(code).toMatch(/setImage\('🖼️ 썸네일'/);
  });

  it('fullAutoFlow persists web-URL thumbnails locally before registration', () => {
    const code = read('renderer/modules/fullAutoFlow.ts');
    expect(code).toMatch(/downloadAndSaveImage/);
  });

  it('syncGeneratedImagesArray falls back across thumbnail keys and the isThumbnail flag', () => {
    const code = read('renderer/modules/imageManagerCore.ts');
    expect(code).toMatch(/getImage\('🖼️ 썸네일'\) \|\| this\.getImage\('썸네일'\)/);
    expect(code).toMatch(/isThumbnail === true/);
  });

  it('grid retries an alternate source once before showing the failure placeholder', () => {
    const code = read('renderer/modules/imageManagerCore.ts');
    expect(code).toMatch(/data-alt-src/);
    expect(code).toMatch(/altTried/);
  });
});
