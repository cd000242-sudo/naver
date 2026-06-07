import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('continuous and multi-account image generation safety', () => {
  it('serializes renderer image jobs and gives long-running engines a larger timeout', () => {
    const code = read('renderer/modules/costAndAutoGen.ts');

    expect(code).toMatch(/LONG_RUN_IMAGE_MAX_TIMEOUT_MS\s*=\s*45\s*\*\s*60\s*\*\s*1000/);
    expect(code).toMatch(/let imageGenerationQueue: Promise<void> = Promise\.resolve\(\)/);
    expect(code).toMatch(/runQueuedImageGeneration/);
    expect(code).toMatch(/UI_AUTOMATION_IMAGE_STABILIZE_MS\s*=\s*15_000/);
    expect(code).toMatch(/estimateImageGenerationTimeoutMs/);
    expect(code).toMatch(/generateImagesWithCostSafetyInternal/);
  });

  it('marks full-auto image calls as long-running and raises the image budget', () => {
    const code = read('renderer/modules/fullAutoFlow.ts');

    expect(code).toMatch(/FULL_AUTO_IMAGE_TOTAL_BUDGET_MS\s*=\s*35\s*\*\s*60\s*\*\s*1000/);
    expect(code).toMatch(/FULL_AUTO_THUMBNAIL_IMAGE_TIMEOUT_MS\s*=\s*4\s*\*\s*60\s*\*\s*1000/);
    expect(code).toMatch(/FULL_AUTO_BODY_IMAGE_TIMEOUT_MS\s*=\s*25\s*\*\s*60\s*\*\s*1000/);
    expect((code.match(/longRunImageGeneration:\s*true/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('uses image-provider-aware minimum intervals in continuous publishing', () => {
    const code = read('renderer/modules/continuousPublishing.ts');

    expect(code).toMatch(/UI_AUTOMATION_SAFE_PUBLISH_MIN_INTERVAL_SEC\s*=\s*480/);
    expect(code).toMatch(/IMAGE_HEAVY_SAFE_PUBLISH_MIN_INTERVAL_SEC\s*=\s*420/);
    expect(code).toMatch(/getImageAwareSafePublishFloorSec/);
    expect(code).toMatch(/UI_AUTOMATION_IMAGE_SOURCES\.has\(imageSource\)/);
  });

  it('passes image source into both multi-account interval policies', () => {
    const publishingHandlers = read('renderer/modules/publishingHandlers.ts');
    const multiAccountManager = read('renderer/modules/multiAccountManager.ts');

    expect(publishingHandlers).toMatch(/getSafeSequentialMultiAccountInterval\([^)]*commonImageSource\)/);
    expect(publishingHandlers).toMatch(/SEQUENTIAL_MULTI_ACCOUNT_UI_IMAGE_MIN_INTERVAL_SEC\s*=\s*480/);
    expect(multiAccountManager).toMatch(/getSafeMultiAccountInterval\([^)]*primaryImageSource\)/);
    expect(multiAccountManager).toMatch(/MULTI_ACCOUNT_UI_IMAGE_MIN_INTERVAL_SEC\s*=\s*480/);
  });

  it('keeps multi-account image batches sequential with enough retry and stabilization time', () => {
    const rendererCode = read('renderer/modules/multiAccountManager.ts');
    const mainCode = read('main.ts');

    expect(rendererCode).toMatch(/BATCH_TIMEOUT_MS\s*=\s*Math\.min\(\s*45\s*\*\s*60\s*\*\s*1000/);
    expect(rendererCode).toMatch(/isMultiAccount:\s*true/);
    expect(rendererCode).toMatch(/longRunImageGeneration:\s*true/);
    expect(rendererCode).toMatch(/15_000/);
    expect(mainCode).toMatch(/waitForImageEngineStabilization/);
    expect(mainCode).toMatch(/await waitForImageEngineStabilization\('thumbnail'\)/);
    expect(mainCode).toMatch(/await waitForImageEngineStabilization\('body-images'\)/);
  });

  it('forces web and Gemini image engines to generate one image at a time in all automatic publishing paths', () => {
    const imageGeneratorCode = read('imageGenerator.ts');
    const flowCode = read('image/flowGenerator.ts');
    const nanoCode = read('image/nanoBananaProGenerator.ts');
    const imageFxCode = read('image/imageFxGenerator.ts');
    const openAiImageCode = read('image/openaiImageGenerator.ts');
    const deepInfraCode = read('image/deepinfraGenerator.ts');
    const leonardoCode = read('image/leonardoAIGenerator.ts');

    expect(imageGeneratorCode).toMatch(/const shouldForceSequentialImages/);
    expect(imageGeneratorCode).toMatch(/options\.isFullAuto === true/);
    expect(imageGeneratorCode).toMatch(/options\.isContinuousMode === true/);
    expect(imageGeneratorCode).toMatch(/options\.isMultiAccount === true/);
    expect(imageGeneratorCode).toMatch(/options\.forceSequential === true/);
    expect(imageGeneratorCode).toMatch(/sequential:\s*shouldForceSequentialImages/);
    expect(imageGeneratorCode).toMatch(/forceModelKey[\s\S]{0,160}?shouldForceSequentialImages/);
    expect(flowCode).toMatch(/options\?: \{ forceFreshContext\?: boolean; sequential\?: boolean \}/);
    expect(flowCode).toMatch(/&& !options\?\.sequential/);
    expect(flowCode).toMatch(/const newUrls = _networkImageQueue\.slice\(queueStartSize\)/);
    expect(flowCode).toMatch(/flow-content\\\.google\\\/image/);
    expect(flowCode).toMatch(/perlin\\\.png/);
    expect(flowCode).toMatch(/const delayedDomPromise = new Promise<string>/);
    expect(flowCode).toMatch(/Promise\.race\(\[netPromise, delayedDomPromise\]\)/);
    expect(flowCode).toMatch(/queuedUrls\.length > 0 \? queuedUrls\[queuedUrls\.length - 1\] : racedUrl/);
    expect(nanoCode).toMatch(/forceSequential\?: boolean/);
    expect(nanoCode).toMatch(/if \(forceSequential \|\| isFullAuto\)[\s\S]{0,60}?return 1/);
    expect(imageFxCode).toMatch(/for \(let i = 0; i < items\.length; i\+\+\)/);
    expect(openAiImageCode).toMatch(/for \(let i = 0; i < items\.length; i\+\+\)/);
    expect(openAiImageCode).toMatch(/n:\s*1/);
    expect(deepInfraCode).toMatch(/for \(let i = 0; i < items\.length; i\+\+\)/);
    expect(deepInfraCode).toMatch(/n:\s*1/);
    expect(leonardoCode).toMatch(/for \(let i = 0; i < items\.length; i\+\+\)/);
  });

  it('streams generated images into the progress preview as each image finishes', () => {
    const code = read('renderer/modules/costAndAutoGen.ts');

    expect(code).toMatch(/function updateGeneratedImagePreview/);
    expect(code).toMatch(/function registerImageGeneratedPreviewBridge/);
    expect(code).toMatch(/cleanupPreviewListener\s*=\s*registerImageGeneratedPreviewBridge\(\)/);
    expect(code).toMatch(/modal\.updateSingleImage\(index/);
    expect(code).toMatch(/if \(index === 0[\s\S]{0,120}?modal\.clearImages\(\)/);
  });

  it('allows the large progress preview image to open a full-size preview', () => {
    const code = read('renderer/components/ProgressModal.ts');

    expect(code).toMatch(/private openFullImagePreview/);
    expect(code).toMatch(/progress-full-image-preview-overlay/);
    expect(code).toMatch(/z-index:\s*2147483647/);
    expect(code).toMatch(/Close preview/);
    expect(code).toMatch(/removeEventListener\('keydown'/);
    expect(code).toMatch(/document\.createElement\('img'\)/);
    expect(code).toMatch(/mainPreview\.style\.cursor\s*=\s*'zoom-in'/);
    expect(code).toMatch(/mainPreview\.onclick\s*=\s*\(\)\s*=>\s*\{[\s\S]{0,120}?this\.openFullImagePreview/);
    expect(code).toMatch(/targetItem\.onclick\s*=\s*\(\)\s*=>\s*\{[\s\S]{0,160}?this\.updateMainPreviewDirect/);
  });

  it('restores the progress preview grid after the modal is minimized', () => {
    const code = read('renderer/components/ProgressModal.ts');

    expect(code).toMatch(/private ensureImagePreviewContainer/);
    expect(code).toMatch(/private restoreImagePreviewState/);
    expect(code).toMatch(/this\.showImages\(\[\.\.\.this\.currentImages\]/);
    expect(code).toMatch(/this\.restoreImagePreviewState\(\)/);
    expect(code).toMatch(/this\.currentImages = \[\]/);
    expect(code).toMatch(/this\.currentImageIndex = 0/);
  });

  it('keeps thumbnail text enabled across full-auto and multi-account image paths', () => {
    const costCode = read('renderer/modules/costAndAutoGen.ts');
    const publishingCode = read('renderer/modules/publishingHandlers.ts');
    const multiAccountCode = read('renderer/modules/multiAccountManager.ts');
    const imageGeneratorCode = read('imageGenerator.ts');

    expect(costCode).toMatch(/options\.allowThumbnailText/);
    expect(costCode).toMatch(/options\.thumbnailTextInclude = !!options\.allowThumbnailText/);
    expect(publishingCode).toMatch(/thumbnailTextInclude:\s*formData\.includeThumbnailText/);
    expect(multiAccountCode).toMatch(/thumbnailTextInclude\?: boolean/);
    expect(multiAccountCode).toMatch(/const includeThumbnailText = options\.thumbnailTextInclude \?\? options\.allowThumbnailText \?\? false/);
    expect(multiAccountCode).toMatch(/allowText:\s*isThumb \? includeThumbnailText : false/);
    expect(multiAccountCode).toMatch(/thumbnailTextInclude:\s*includeThumbnailText/);
    expect(imageGeneratorCode).toMatch(/function shouldAllowTextForImageItem/);
    expect(imageGeneratorCode).toMatch(/thumbnailOnlyContext[\s\S]{0,260}?options\.thumbnailTextInclude === true/);
    expect(imageGeneratorCode).toMatch(/return item\?\.isThumbnail === true/);
    expect(imageGeneratorCode).toMatch(/allowText:\s*shouldAllowTextForImageItem\(item, options\)/);
  });

  it('auto-links previous posts for mate mode and preserves publish hashtags', () => {
    const fullAutoCode = read('renderer/modules/fullAutoFlow.ts');
    const multiAccountCode = read('renderer/modules/multiAccountManager.ts');

    expect(fullAutoCode).toMatch(/const isMateMode = formData\.contentMode === 'mate'/);
    expect(fullAutoCode).toMatch(/formData\.ctaType !== 'none' \|\| isMateMode/);
    expect(fullAutoCode).toMatch(/function resolveFallbackHashtags/);
    expect(fullAutoCode).toMatch(/return resolveFallbackHashtags\(structuredContent, formData\)/);
    expect(multiAccountCode).toMatch(/const isMateMode = queueItem\.contentMode === 'mate'/);
    expect(multiAccountCode).toMatch(/isShoppingConnectMode \|\| isMateMode \|\| queueItem\.ctaType === 'previous-post'/);
    expect(multiAccountCode).toMatch(/if \(isShoppingConnectMode \|\| isMateMode\)/);
  });

  it('explains ImageFX access denial as a Google Labs account/IP restriction', () => {
    const imageGeneratorCode = read('imageGenerator.ts');
    const imageFxCode = read('image/imageFxGenerator.ts');
    const modalCode = read('renderer/components/RecoveryBlockingModal.ts');
    const imageManagementCode = read('renderer/modules/imageManagementTab.ts');
    const openaiGuardCode = read('renderer/modules/openaiImageGuard.ts');
    const imageErrorCode = read('image/imageErrorMessages.ts');
    const headingSettingsCode = read('renderer/components/HeadingImageSettings.ts');
    const publishingHandlersCode = read('renderer/modules/publishingHandlers.ts');
    const continuousPublishingCode = read('renderer/modules/continuousPublishing.ts');

    expect(imageGeneratorCode).toMatch(/ImageFX \(Google Labs, 계정\/IP 제한 가능\)/);
    expect(imageGeneratorCode).toMatch(/IMAGEFX_FORBIDDEN/);
    expect(imageGeneratorCode).toMatch(/Google Labs 접근 정책 문제/);
    expect(imageFxCode).toMatch(/Google Labs가 현재 계정\/IP\/지역/);
    expect(imageFxCode).toMatch(/실제 생성 테스트/);
    expect(imageFxCode).toMatch(/testImageFxConnection[\s\S]{0,1800}?generateSingleImageWithImageFx\(/);
    expect(modalCode).toMatch(/Google Labs가 현재 계정, IP, 지역 조합/);
    expect(imageManagementCode).toMatch(/계정\/IP\/지역에 따라 403 접근 거부/);
    expect(openaiGuardCode).not.toMatch(/1000장\/일/);
    expect(openaiGuardCode).toMatch(/checkImageFxGenerationReady/);
    expect(openaiGuardCode).toMatch(/testImageFxConnection/);
    expect(openaiGuardCode).toMatch(/imagefx_generation_probe_ok_v1/);
    expect(headingSettingsCode).not.toMatch(/1000장\/일/);
    expect(headingSettingsCode).toMatch(/ImageFX 실제 1장 생성 테스트/);
    expect(publishingHandlersCode).toMatch(/imagefx: 로그인만 확인하지 않고 실제 1장 생성 프리플라이트/);
    expect(publishingHandlersCode).toMatch(/skipImagesForGuard/);
    expect(continuousPublishingCode).toMatch(/guardSources/);
    expect(imageErrorCode).toMatch(/IMAGEFX_FORBIDDEN/);
  });
});
