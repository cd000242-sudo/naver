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
    expect(source).toContain('isShoppingReferenceImageEngine');
  });

  it('uses one selected representative image for every shopping AI item', () => {
    const source = read('imageGenerator.ts');

    expect(source).toContain('const shoppingItemReferenceCandidates = options.isShoppingConnect');
    expect(source).toContain('let representativeReferenceUrl = shoppingReference.referenceUrl || crawledImages[0] ||');
    expect(source).toContain('await loadReferenceImageData(representativeCandidate, {');
    expect(source).toContain('applyShoppingRepresentativeReference(mappedItems, representativeReferenceUrl)');
    expect(source).toContain('buildShoppingReferencePrompt(basePrompt, item.heading, allowText)');
  });

  it('uses the original representative as thumbnail and starts img2img at the first subheading', () => {
    const source = read('renderer/modules/fullAutoFlow.ts');

    expect(source).toContain("const useCollectedImagesDirectly = isShoppingConnect && formData.scSubImageMode === 'collected';");
    expect(source).toContain('const representativeImageUrl = isShoppingConnect');
    expect(source).toContain('await resolveUsableShoppingReferenceSource(');
    expect(source).toContain('referenceImagePath: representativeImageUrl');
    expect(source).toContain('if (isShoppingConnect && representativeImageUrl)');
    expect(source).toContain('createShoppingRepresentativeThumbnail(');
    expect(source).toContain('const collectedBodyImages = shoppingReference.subheadingImages;');
    expect(source).toContain('collectedBodyImages[i % collectedBodyImages.length]');
    expect(source).toContain('const imgUrl = await resolveUsableShoppingReferenceSource(');
    expect(source).toContain('else if (!isShoppingConnect)');
    expect(source).toContain('if (isShoppingConnect && useCollectedImagesDirectly && collectedImages.length > 0)');
  });

  it('does not let pre-collected references switch continuous shopping AI back to direct placement', () => {
    const source = read('renderer/modules/continuousPublishing.ts');

    expect(source).not.toContain("scSubImageMode === 'collected' || hasPreCollectedImages");
    expect(source).toContain('itemPipelineCfg.shopping.aiImageEngine');
    expect(source).toContain("isShoppingConnect: item.contentMode === 'affiliate'");
    expect(source).toContain('resolveShoppingRepresentativeReference(shoppingCollectedImgs)');
  });

  it('passes shopping identity through multi-account and publish-handler image generation', () => {
    const multi = read('renderer/modules/multiAccountManager.ts');
    const publishing = read('renderer/modules/publishingHandlers.ts');

    expect(multi).toContain("isShoppingConnect: queueItem.contentMode === 'affiliate'");
    expect(multi).toContain('createShoppingRepresentativeThumbnail(');
    expect(multi).toContain('resolveShoppingRepresentativeReference(shoppingCollectedImages)');
    expect(publishing).toContain('createShoppingRepresentativeThumbnail(');
    expect(publishing).toContain('resolveShoppingRepresentativeReference(collectedImgs)');
    expect(publishing).toContain('resolveShoppingImageGenerationPolicy({');
    expect(publishing).toContain('isShoppingConnect: true');
    expect(publishing).toContain('referenceImagePath: representativeImagePath');
  });

  it('generates shopping subheading images as one batch so content dedupe spans every heading', () => {
    const sharedGenerator = read('renderer/modules/multiAccountManager.ts');
    const fullAuto = read('renderer/modules/fullAutoFlow.ts');

    expect(sharedGenerator).toContain('createShoppingAiBatchPlan({');
    expect(sharedGenerator).toContain('items: shoppingBatchPlan.bodyItems');
    expect(sharedGenerator).toContain('resolveShoppingAiPublishImages(');
    expect(fullAuto).toContain('const shoppingBatchItems =');
    expect(fullAuto).toContain('items: shoppingBatchItems');
    expect(fullAuto).toContain('resolveShoppingAiPublishImages(');
  });

  it('stops multi-account shopping publish when reference image generation fails', () => {
    const multi = read('renderer/modules/multiAccountManager.ts');

    expect(multi).toContain("queueItem.contentMode === 'affiliate' && itemPipelineCfg.shopping.subImageMode === 'ai'");
    expect(multi).toContain('throw imgErr;');
  });

  it('keeps collected gallery images out of every shopping AI output boundary', () => {
    const continuous = read('renderer/modules/continuousPublishing.ts');
    const multi = read('renderer/modules/multiAccountManager.ts');
    const publishing = read('renderer/modules/publishingHandlers.ts');
    const fullAuto = read('renderer/modules/fullAutoFlow.ts');

    expect(continuous).toContain('scSubImageMode: itemPipelineCfg.shopping.subImageMode');
    expect(continuous).toContain('scAIImageEngine: itemPipelineCfg.shopping.aiImageEngine');
    expect(multi).toContain('structuredContent.images = isShoppingAiMode ? []');
    expect(publishing).toContain('const headingsForAI = selectShoppingBodyHeadingsForMode(');
    expect(publishing).toContain("headingImageMode: 'all'");
    expect(fullAuto).toContain('const shoppingHeadingSlotsForBatch = selectShoppingBodyHeadingSlotsForMode(');
    expect(fullAuto).toContain('const preparedShoppingImages = resolveShoppingAiPublishImages(');
    expect(fullAuto).toContain('doShoppingAiBodySlotsMatch(');
    expect(fullAuto).not.toMatch(/if \(isShoppingAiMode && finalImages\.length > 0\) \{\s*\/\/ Product crawl output[\s\S]{0,250}finalImages = \[\];/);
    expect(fullAuto).toContain('const fullAutoBodySlots =');
    expect(fullAuto).toContain('const fullAutoBodyItems = fullAutoBodySlots.map');
  });

  it('bypasses provider generation and text overlay for shopping thumbnail items', () => {
    const source = read('imageGenerator.ts');

    expect(source).toContain('const shoppingOriginalThumbnails');
    expect(source).toContain('item.isThumbnail !== true');
    expect(source).toContain('createShoppingRepresentativeThumbnail(');
    expect(source).toContain('const finalizeImages');
  });
});
