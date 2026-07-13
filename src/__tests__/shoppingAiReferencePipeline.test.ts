import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string): string => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('shopping AI reference pipeline', () => {
  it('never converts collected originals into successful AI-generation output', () => {
    const source = read('imageGenerator.ts');

    expect(source).not.toContain('convertCollectedImagesToResults');
    expect(source).not.toContain("actualProvider: 'collected-image'");
    expect(source).toContain("'dropshot'");
    expect(source).toContain('SHOPPING_REFERENCE_ENGINES');
  });

  it('uses one selected representative image for every shopping AI item', () => {
    const source = read('imageGenerator.ts');

    expect(source).toContain('const representativeReferenceUrl = normalizeReferenceImageUrl(representativeCandidate) || crawledImages[0] ||');
    expect(source).toContain('options.isShoppingConnect ? representativeReferenceUrl');
    expect(source).not.toContain('options.isShoppingConnect ? crawledImages[idx]');
  });

  it('generates the shopping thumbnail in AI mode and only uses originals in explicit collected mode', () => {
    const source = read('renderer/modules/fullAutoFlow.ts');

    expect(source).toContain("const useCollectedImagesDirectly = isShoppingConnect && formData.scSubImageMode === 'collected';");
    expect(source).toContain('const representativeImageUrl = extractReferenceImageUrl(representativeImage);');
    expect(source).toContain('referenceImagePath: representativeImageUrl');
    expect(source).toContain('if (useCollectedImagesDirectly && representativeImageUrl)');
  });
});
