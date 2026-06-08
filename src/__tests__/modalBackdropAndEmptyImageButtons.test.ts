import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

describe('modal backdrop guard and empty heading image actions', () => {
  const renderer = read('renderer/renderer.ts');
  const headingImageGen = read('renderer/modules/headingImageGen.ts');

  it('installs a capture-phase modal backdrop guard while preserving explicit close buttons', () => {
    expect(renderer).toMatch(/function\s+initModalBackdropClickGuard/);
    expect(renderer).toMatch(/document\.addEventListener\(\s*'click'[\s\S]+?true\s*\)/);
    expect(renderer).toMatch(/stopImmediatePropagation\(\)/);
    expect(renderer).toMatch(/isModalBackdropClick/);
    expect(renderer).toMatch(/MODAL_INTERACTIVE_SELECTOR/);
    expect(renderer).toMatch(/target\.closest\(MODAL_INTERACTIVE_SELECTOR\)/);
    expect(renderer).toMatch(/target\.classList\.contains\('modal-backdrop'\)/);
    expect(renderer).not.toMatch(/className\.includes\('modal'\)/);
  });

  it('marks both manual image generation buttons as explicit image generation requests', () => {
    const starts = headingImageGen.match(/__manualImageGenerationInProgress\s*=\s*true/g) || [];
    const deletes = headingImageGen.match(/delete\s+\(window\s+as\s+any\)\.__manualImageGenerationInProgress/g) || [];
    expect(starts.length).toBeGreaterThanOrEqual(2);
    expect(deletes.length).toBeGreaterThanOrEqual(2);
  });

  it('collect remaining empty heading images normalizes search result URLs before registering images', () => {
    const block = headingImageGen.match(/collectRemainingImagesBtn[\s\S]+?shoppingCollectBtn/);
    expect(block).toBeTruthy();
    expect(block![0]).toMatch(/window\.api\.searchNaverImages/);
    expect(block![0]).toMatch(/resolvedUrl/);
    expect(block![0]).toMatch(/previewUrl/);
    expect(block![0]).toMatch(/ImageManager\.setImage/);
    expect(block![0]).toMatch(/syncGlobalImagesFromImageManager/);
  });
});
