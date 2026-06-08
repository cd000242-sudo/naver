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
    expect(progressModal).toMatch(/const\s+previewImages\s*=\s*dedupeProgressImages/);
    expect(progressModal).toMatch(/this\.currentImages\s*=\s*previewImages/);
    expect(progressModal).toMatch(/previewDataUrl/);
  });

  it('does not render the same live image into multiple progress slots', () => {
    expect(progressModal).toMatch(/duplicateIndex\s*=\s*this\.currentImages\.findIndex/);
    expect(progressModal).toMatch(/duplicate live image ignored/);
    expect(progressModal).toMatch(/중복 이미지 제외/);
  });

  it('keeps cost-risk image listener from double-rendering progress grid images', () => {
    expect(costAndAutoGen).toMatch(/preview bridge/);
    expect(costAndAutoGen).not.toMatch(/progressModal\.updateSingleImage/);
  });

  it('maps body preview headings against non-thumbnail images first', () => {
    expect(fullAutoFlow).toMatch(/const\s+bodyImages\s*=\s*Array\.isArray\(generatedImages\)/);
    expect(fullAutoFlow).toMatch(/img\?\.\s*isThumbnail\s*!==\s*true/);
    expect(fullAutoFlow).toMatch(/const\s+generatedImage\s*=\s*bodyImages\[index\]\s*\|\|\s*generatedImages\?\.\[index\]/);
  });
});
