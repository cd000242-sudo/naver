import { describe, expect, it, vi } from 'vitest';
import { normalizePublishImageSequence } from '../image/publishImageSequence.js';
import {
  applyShoppingRepresentativeReference,
  createShoppingAiBatchPlan,
  doShoppingAiBodySlotsMatch,
  resolveShoppingAiPublishImages,
  resolveShoppingRepresentativeReference,
} from '../image/shoppingReferenceGeneration.js';

const structuredContent = {
  headings: [
    { title: 'First section' },
    { title: 'Second section' },
    { title: 'Third section' },
    { title: 'Fourth section' },
  ],
};

const representative = {
  localPath: 'C:\\images\\product-main.jpg',
  originalUrl: 'https://shop.example.com/product-main.jpg',
  isRepresentative: true,
};

const shoppingBodyItems = structuredContent.headings.map(({ title }) => ({
  heading: title,
  isThumbnail: false,
}));

describe('image release-blocker regressions', () => {
  it('publishes the selected shopping representative as the slot-zero thumbnail', () => {
    const resolvedReference = resolveShoppingRepresentativeReference([
      { originalUrl: 'https://shop.example.com/review.jpg', isRepresentative: false },
      representative,
    ]);
    const plan = createShoppingAiBatchPlan({
      items: shoppingBodyItems,
      headingImageMode: 'all',
      representative: resolvedReference.representative,
      representativeUrl: resolvedReference.referenceUrl,
      postTitle: 'Product review',
    });

    const sequence = normalizePublishImageSequence(
      structuredContent,
      [plan.representativeThumbnail],
    );

    expect(sequence).toHaveLength(1);
    expect(sequence[0]).toMatchObject({
      filePath: representative.localPath,
      isThumbnail: true,
      isShoppingRepresentativeThumbnail: true,
      originalIndex: 0,
    });
  });

  it('maps body image one to the first structured subheading after the thumbnail', () => {
    const resolvedReference = resolveShoppingRepresentativeReference([representative]);
    const plan = createShoppingAiBatchPlan({
      items: shoppingBodyItems,
      headingImageMode: 'all',
      representative: resolvedReference.representative,
      representativeUrl: resolvedReference.referenceUrl,
      postTitle: 'Product review',
    });
    const generatedBody = applyShoppingRepresentativeReference(
      plan.bodyItems,
      resolvedReference.referenceUrl,
    ).map((item, index) => ({
      ...item,
      filePath: `C:\\generated\\body-${index + 1}.png`,
      provider: 'dropshot',
    }));
    const publishImages = resolveShoppingAiPublishImages(
      plan.representativeThumbnail,
      generatedBody,
      resolvedReference.images,
    ).images;

    const sequence = normalizePublishImageSequence(structuredContent, publishImages);

    expect(sequence[0]).toMatchObject({ isThumbnail: true, originalIndex: 0 });
    expect(sequence[1]).toMatchObject({
      filePath: 'C:\\generated\\body-1.png',
      heading: 'First section',
      headingIndex: 0,
      originalIndex: 1,
    });
  });

  it('does not pull body slots forward when thumbnail upload fails', async () => {
    const sequence = normalizePublishImageSequence(
      structuredContent,
      [
        { heading: 'Second section', filePath: 'C:\\generated\\body-2.png', originalIndex: 1 },
        { heading: 'First section', filePath: 'C:\\generated\\body-1.png', originalIndex: 0 },
      ],
      { thumbnailPath: representative.localPath },
    );
    const upload = vi.fn(async (image: typeof sequence[number]) => {
      if (image.isThumbnail === true) throw new Error('thumbnail upload failed');
    });
    const uploadOutcomes = await Promise.all(sequence.map(async image => {
      try {
        await upload(image);
        return {
          error: null,
          bodySlot: { headingIndex: image.headingIndex, originalIndex: image.originalIndex },
        };
      } catch (error) {
        return { error: error as Error, bodySlot: null };
      }
    }));
    const failures = uploadOutcomes.flatMap(outcome => outcome.error ? [outcome.error] : []);
    const uploadedBodySlots = uploadOutcomes.flatMap(
      outcome => outcome.bodySlot ? [outcome.bodySlot] : [],
    );

    expect(failures.map(error => error.message)).toEqual(['thumbnail upload failed']);
    expect(upload).toHaveBeenCalledTimes(3);
    expect(uploadedBodySlots).toEqual([
      { headingIndex: 0, originalIndex: 1 },
      { headingIndex: 1, originalIndex: 2 },
    ]);
  });

  it('reuses shopping AI output only for the same odd/even slots and representative', () => {
    const resolvedReference = resolveShoppingRepresentativeReference([representative]);
    const basePlan = {
      items: shoppingBodyItems,
      representative: resolvedReference.representative,
      representativeUrl: resolvedReference.referenceUrl,
      postTitle: 'Product review',
    };
    const oddPlan = createShoppingAiBatchPlan({ ...basePlan, headingImageMode: 'odd-only' });
    const evenPlan = createShoppingAiBatchPlan({ ...basePlan, headingImageMode: 'even-only' });
    const prepare = (items: typeof oddPlan.bodyItems, label: string) => (
      applyShoppingRepresentativeReference(items, resolvedReference.referenceUrl)
        .map((item, index) => ({
          ...item,
          filePath: `C:\\generated\\${label}-${index + 1}.png`,
        }))
    );
    const preparedOdd = prepare(oddPlan.bodyItems, 'odd');
    const preparedEven = prepare(evenPlan.bodyItems, 'even');

    expect(preparedOdd.map(item => item.referenceImageUrl))
      .toEqual([representative.localPath, representative.localPath]);
    expect(preparedEven.map(item => item.referenceImageUrl))
      .toEqual([representative.localPath, representative.localPath]);
    expect(doShoppingAiBodySlotsMatch(preparedOdd, oddPlan.bodyItems)).toBe(true);
    expect(doShoppingAiBodySlotsMatch(preparedOdd, evenPlan.bodyItems)).toBe(false);
    expect(doShoppingAiBodySlotsMatch(preparedEven, evenPlan.bodyItems)).toBe(true);
  });
});
