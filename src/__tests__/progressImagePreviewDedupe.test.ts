import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

describe('progress image preview duplicate guards', () => {
  const progressModal = read('renderer/components/ProgressModal.ts');
  const costAndAutoGen = read('renderer/modules/costAndAutoGen.ts');
  const fullAutoFlow = read('renderer/modules/fullAutoFlow.ts');

  it('dedupes final progress preview images by stable source key', () => {
    expect(progressModal).toMatch(/function\s+getProgressImageKey/);
    expect(progressModal).toMatch(/function\s+dedupeProgressImages/);
    expect(progressModal).toMatch(/function\s+isProgressThumbnailImage/);
    expect(progressModal).toMatch(/function\s+getProgressBodyImages/);
    expect(progressModal).toMatch(/const\s+previewImages\s*=\s*getProgressBodyImages/);
    expect(progressModal).toMatch(/this\.currentImages\s*=\s*previewImages/);
    expect(progressModal).toMatch(/previewDataUrl/);
  });

  it('does not render the same live image into multiple progress slots', () => {
    expect(progressModal).toMatch(/thumbnail image kept out of body preview grid/);
    expect(progressModal).toMatch(/const\s+previewIndex\s*=\s*this\.thumbnailSkippedInPreview\s*\?\s*Math\.max\(0,\s*index\s*-\s*1\)\s*:\s*index/);
    expect(progressModal).toMatch(/duplicateIndex\s*=\s*this\.currentImages\.findIndex/);
    expect(progressModal).toMatch(/duplicate live image ignored/);
    expect(progressModal).toMatch(/중복 이미지 제외/);
  });

  it('keeps generated bitmaps out of the small progress grid', () => {
    expect(progressModal).toContain('The generated bitmap is shown only in the large preview');
    expect(progressModal).toMatch(/private\s+renderProgressStatusTile/);
    expect(progressModal).not.toMatch(/appendChild\(imgEl\)/);
  });

  it('keeps cost-risk image listener from double-rendering progress grid images', () => {
    expect(costAndAutoGen).toMatch(/preview bridge/);
    expect(costAndAutoGen).not.toMatch(/progressModal\.updateSingleImage/);
  });

  it('maps body preview headings against non-thumbnail images first', () => {
    expect(fullAutoFlow).toMatch(/const\s+bodyImages\s*=\s*Array\.isArray\(generatedImages\)/);
    expect(fullAutoFlow).toMatch(/img\?\.\s*isThumbnail\s*!==\s*true/);
    expect(fullAutoFlow).toMatch(/const\s+generatedImage\s*=\s*bodyImages\[index\]/);
    expect(fullAutoFlow).not.toMatch(/bodyImages\[index\]\s*\|\|\s*generatedImages\?\.\[index\]/);
  });
});
