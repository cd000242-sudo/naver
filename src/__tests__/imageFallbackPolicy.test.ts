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
    // [Phase 7.1-d] The saved policy now arrives via the single pipeline
    // accessor instead of a direct localStorage read — injection must stay.
    expect(src).toMatch(/normalizeImageFallbackPolicy\(rawPipeline\.imageFallbackPolicy\)/);
    expect(src).toMatch(/options\.imageFallbackPolicy\s*=\s*savedFallbackPolicy/);
    expect(src).toMatch(/invokeGenerateImagesWithPolicy/);
    expect(src).toMatch(/policy !== 'ask'/);
    expect(src).toMatch(/window\.confirm/);
    expect(src).toMatch(/imageFallbackPolicy:\s*'guarantee'/);
  });

  // [2026-06-12 사용자 결정] "엔진 실패 시 동작" UI는 제거 — 정책 저장소와
  // 기본값(engine-only, 자동 폴백 금지)은 유지된다. UI가 부활하거나 저장소가
  // 사라지면 여기서 잡는다.
  it('main image settings has NO fallback policy UI, but the policy store stays (engine-only default)', () => {
    const src = read('renderer/components/HeadingImageSettings.ts');
    expect(src).toMatch(/export type ImageFallbackPolicy\s*=\s*'engine-only'\s*\|\s*'ask'\s*\|\s*'guarantee'/);
    expect(src).toMatch(/FALLBACK_POLICY_NAMES/);
    expect(src).not.toMatch(/open-image-fallback-policy-btn/);
    expect(src).not.toMatch(/image-fallback-policy-submodal/);
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

  it('empty successful image responses are converted into failures before publishing', () => {
    const costAndAutoGen = read('renderer/modules/costAndAutoGen.ts');
    const main = read('main.ts');
    const multiAccount = read('renderer/modules/multiAccountManager.ts');
    const publishingHandlers = read('renderer/modules/publishingHandlers.ts');
    const blogExecutor = read('main/services/BlogExecutor.ts');

    expect(costAndAutoGen).toMatch(/function\s+normalizeEmptyImageSuccess/);
    expect(costAndAutoGen).toMatch(/imageCount === 0/);
    expect(costAndAutoGen).toMatch(/success:\s*false/);
    expect(main).toMatch(/const shouldRequireImages/);
    expect(main).toMatch(/generatedImageCount === 0/);
    expect(main).toMatch(/success:\s*false,\s*images:\s*\[\]/);
    expect(multiAccount).toMatch(/imageFallbackPolicy:\s*'engine-only'/);
    expect(multiAccount).toMatch(/image generation returned no images/);
    expect(publishingHandlers).toMatch(/발행을 중단하고 다음 실행 때 이미지 단계부터 다시 시도/);
    expect(publishingHandlers).not.toMatch(/이미지 없이 발행 계속/);
    expect(blogExecutor).toMatch(/IMAGE_PROCESSING_FAILED/);
    expect(blogExecutor).not.toMatch(/이미지 없이 발행을 계속합니다/);
    expect(blogExecutor).not.toMatch(/processedImages = \[\];\s*\n\s*\}/);
  });
});
