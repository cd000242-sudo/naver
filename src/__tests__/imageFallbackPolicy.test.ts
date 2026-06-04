import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('image fallback policy contract', () => {
  it('GenerateImagesOptions exposes the three explicit fallback policies', () => {
    const src = read('image/types.ts');
    expect(src).toMatch(/export type ImageFallbackPolicy\s*=\s*'engine-only'\s*\|\s*'ask'\s*\|\s*'guarantee'/);
    expect(src).toMatch(/imageFallbackPolicy\?:\s*ImageFallbackPolicy/);
    expect(src).toMatch(/requestedProvider\?:\s*string/);
    expect(src).toMatch(/actualProvider\?:\s*string/);
    expect(src).toMatch(/fallbackUsed\?:\s*boolean/);
  });

  it('imageGenerator blocks implicit fallbacks unless guarantee mode is selected', () => {
    const src = read('imageGenerator.ts');
    expect(src).toMatch(/normalizeImageFallbackPolicy\(options\.imageFallbackPolicy\)/);
    expect(src).toMatch(/FALLBACK_REQUIRES_CONFIRMATION/);
    expect(src).toMatch(/createFallbackPolicyError/);
    expect(src).toMatch(/if \(!shouldUseAutomaticFallback\(fallbackPolicy\)\)\s*\{\s*throw createFallbackPolicyError\(requestedProvider,\s*'collected-image'/);
    expect(src).toMatch(/if \(!shouldUseAutomaticFallback\(fallbackPolicy\)\)\s*\{\s*throw createFallbackPolicyError\(requestedProvider,\s*'openai-image'/);
    expect(src).toMatch(/actualProvider:\s*'collected-image'/);
    expect(src).toMatch(/requestedProvider/);
    expect(src).toMatch(/fallbackReason/);
  });

  it('renderer injects the saved policy and ask mode requires user confirmation before guarantee retry', () => {
    const src = read('renderer/modules/costAndAutoGen.ts');
    expect(src).toMatch(/localStorage\.getItem\('imageFallbackPolicy'\)/);
    expect(src).toMatch(/options\.imageFallbackPolicy\s*=\s*savedFallbackPolicy/);
    expect(src).toMatch(/invokeGenerateImagesWithPolicy/);
    expect(src).toMatch(/policy !== 'ask'/);
    expect(src).toMatch(/window\.confirm/);
    expect(src).toMatch(/imageFallbackPolicy:\s*'guarantee'/);
  });

  it('main image settings UI lets users choose fixed, ask, or guarantee behavior', () => {
    const src = read('renderer/components/HeadingImageSettings.ts');
    expect(src).toMatch(/export type ImageFallbackPolicy\s*=\s*'engine-only'\s*\|\s*'ask'\s*\|\s*'guarantee'/);
    expect(src).toMatch(/FALLBACK_POLICY_NAMES/);
    expect(src).toMatch(/open-image-fallback-policy-btn/);
    expect(src).toMatch(/image-fallback-policy-submodal/);
    expect(src).toMatch(/getImageFallbackPolicy/);
    expect(src).toMatch(/setImageFallbackPolicy/);
    expect(src).toMatch(/safeLocalStorageGet\('imageFallbackPolicy'\)/);
    expect(src).toMatch(/safeLocalStorageSet\('imageFallbackPolicy'/);
  });

  it('global image settings carry the fallback policy to full-auto flows', () => {
    const sync = read('renderer/modules/imageSyncService.ts');
    const fullAuto = read('renderer/modules/fullAutoFlow.ts');
    const studio = read('renderer/modules/imageGenStudio.ts');
    const main = read('main.ts');
    const imageDisplayGrid = read('renderer/modules/imageDisplayGrid.ts');

    expect(sync).toMatch(/imageFallbackPolicy:/);
    expect(fullAuto).toMatch(/const imageFallbackPolicy =/);
    expect(fullAuto).toMatch(/imageFallbackPolicy,/);
    expect(studio).toMatch(/imageFallbackPolicy/);
    expect(main).toMatch(/imageFallbackPolicy:\s*options\.imageFallbackPolicy \|\| 'engine-only'/);
    expect(main).toMatch(/imageFallbackPolicy:\s*options\?\.imageFallbackPolicy \|\| 'engine-only'/);
    expect(imageDisplayGrid).toMatch(/imageFallbackPolicy:\s*opts\?\.imageFallbackPolicy \|\| localStorage\.getItem\('imageFallbackPolicy'\) \|\| 'engine-only'/);
  });
});
