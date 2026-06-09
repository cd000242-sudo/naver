import { beforeEach, describe, expect, it } from 'vitest';
import { filterImagesForPublish } from '../renderer/modules/imageSyncService';

function normalizeKey(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

describe('semi-auto manual heading image mapping', () => {
  beforeEach(() => {
    (globalThis as any).normalizeHeadingKeyForVideoCache = normalizeKey;
    (globalThis as any).getStableImageKey = (img: any) => String(img?.filePath || img?.url || img?.previewDataUrl || '');
    (globalThis as any).ImageManager = {
      isHeadingUnset: () => false,
      getImages: () => [],
      getImage: () => null,
    };
  });

  it('keeps manually locked images on their headingIndex even when added in reverse order', () => {
    const headings = [
      { title: 'H1 event background' },
      { title: 'H2 event benefits' },
      { title: 'H3 application notes' },
      { title: 'H4 honest reviews' },
      { title: 'H5 side menu combo' },
      { title: 'H6 hidden downsides' },
    ];

    const reverseClickedImages = [5, 4, 3, 2, 1, 0].map((headingIndex) => ({
      heading: 'stale heading from previous render',
      headingIndex,
      targetHeadingIndex: headingIndex,
      manualHeadingLocked: true,
      filePath: `C:/manual/heading-${headingIndex + 1}.png`,
      provider: 'local',
    }));

    const result = filterImagesForPublish({ headings }, reverseClickedImages)
      .filter((img: any) => img.isThumbnail !== true);

    expect(result.map((img: any) => img.heading)).toEqual(headings.map((h) => h.title));
    expect(result.map((img: any) => img.headingIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.map((img: any) => img.filePath)).toEqual([
      'C:/manual/heading-1.png',
      'C:/manual/heading-2.png',
      'C:/manual/heading-3.png',
      'C:/manual/heading-4.png',
      'C:/manual/heading-5.png',
      'C:/manual/heading-6.png',
    ]);
  });
});
