/**
 * Regression test: thumbnail-only mode body-duplication bug
 *
 * Bug: hydrateImageManagerFromImages() remapped any thumbnail image onto
 * headingTitles[0] (the first body subheading). On reload/republish the
 * thumbnail then lived under a body subheading key in ImageManager, so it
 * leaked into the post body as a subheading image — in thumbnail-only mode
 * the single thumbnail appeared repeatedly across body subheadings.
 *
 * Fix: a thumbnail image is registered under the dedicated '🖼️ 썸네일' key
 * only — never a body subheading key. It still survives reload (it has a
 * valid key) but stays a thumbnail.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hydrateImageManagerFromImages } from '../renderer/modules/imageSyncService';

const THUMB_KEY = '🖼️ 썸네일';

// Minimal ImageManager stand-in — only the members hydrate touches.
function makeMockImageManager() {
  const imageMap = new Map<string, any[]>();
  const unsetHeadings = new Set<string>();
  return {
    imageMap,
    unsetHeadings,
    setHeadings: () => { /* no-op */ },
    resolveHeadingKey: (h: string) => String(h),
    syncGeneratedImagesArray: () => { /* no-op */ },
    getAllImages: () => {
      const all: any[] = [];
      imageMap.forEach((list) => all.push(...list));
      return all;
    },
    updateHeadingAnalysisPreview: () => { /* no-op */ },
  };
}

let mockIM: ReturnType<typeof makeMockImageManager>;

beforeEach(() => {
  mockIM = makeMockImageManager();
  const g = globalThis as any;
  g.ImageManager = mockIM;
  g.displayGeneratedImages = () => { /* no-op */ };
  g.updatePromptItemsWithImages = () => { /* no-op */ };
  g.toFileUrlMaybe = (p: string) => p;
  if (typeof g.window === 'undefined') g.window = {};
});

afterEach(() => {
  const g = globalThis as any;
  delete g.ImageManager;
  delete g.displayGeneratedImages;
  delete g.updatePromptItemsWithImages;
  delete g.toFileUrlMaybe;
});

const structuredContent = {
  headings: [{ title: '소제목 1' }, { title: '소제목 2' }, { title: '소제목 3' }],
};

describe('hydrateImageManagerFromImages — thumbnail must not bind to a body subheading', () => {
  it('registers a thumbnail under the dedicated thumbnail key, not headingTitles[0]', () => {
    hydrateImageManagerFromImages(structuredContent, [
      { isThumbnail: true, heading: '테스트 블로그 제목', filePath: '/tmp/thumb.jpg', url: '/tmp/thumb.jpg' },
    ]);

    // Thumbnail lives under the thumbnail key.
    expect(mockIM.imageMap.has(THUMB_KEY)).toBe(true);
    // Thumbnail must NOT be bound to the first body subheading (the bug).
    expect(mockIM.imageMap.has('소제목 1')).toBe(false);
  });

  it('keeps a thumbnail whose heading is already "🖼️ 썸네일" on the thumbnail key', () => {
    hydrateImageManagerFromImages(structuredContent, [
      { heading: THUMB_KEY, filePath: '/tmp/thumb.jpg', url: '/tmp/thumb.jpg' },
    ]);

    expect(mockIM.imageMap.has(THUMB_KEY)).toBe(true);
    expect(mockIM.imageMap.has('소제목 1')).toBe(false);
  });

  it('thumbnail-only set (thumbnail + body images): thumbnail isolated, body images keep their headings', () => {
    hydrateImageManagerFromImages(structuredContent, [
      { isThumbnail: true, heading: '블로그 제목', filePath: '/tmp/thumb.jpg', url: '/tmp/thumb.jpg' },
      { isThumbnail: false, heading: '소제목 2', filePath: '/tmp/body2.jpg', url: '/tmp/body2.jpg' },
    ]);

    expect(mockIM.imageMap.has(THUMB_KEY)).toBe(true);
    expect(mockIM.imageMap.get('소제목 2')?.[0]?.filePath).toBe('/tmp/body2.jpg');
    // The thumbnail never lands on a body subheading.
    expect(mockIM.imageMap.has('소제목 1')).toBe(false);
    expect(mockIM.imageMap.get(THUMB_KEY)?.[0]?.filePath).toBe('/tmp/thumb.jpg');
  });

  it('the registered thumbnail keeps its isThumbnail flag', () => {
    hydrateImageManagerFromImages(structuredContent, [
      { isThumbnail: true, heading: '블로그 제목', filePath: '/tmp/thumb.jpg', url: '/tmp/thumb.jpg' },
    ]);

    expect(mockIM.imageMap.get(THUMB_KEY)?.[0]?.isThumbnail).toBe(true);
  });
});
