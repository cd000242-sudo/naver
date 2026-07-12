/* @vitest-environment happy-dom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldGenerateImageForHeading } from '../renderer/components/HeadingImageSettings.js';
import {
  loadLocalFolderWithFallback,
  parseLocalFolderImages,
  type LoadLocalFolderOptions,
} from '../renderer/modules/localFolderImageLoader.js';

const imageFiles = [
  { name: 'thumbnail.png', isFile: true, isDirectory: false, size: 100 },
  { name: '1-first.png', isFile: true, isDirectory: false, size: 100 },
  { name: '2-second.png', isFile: true, isDirectory: false, size: 100 },
  { name: '3-third.png', isFile: true, isDirectory: false, size: 100 },
];

const headings = [
  { title: 'Thumbnail', isThumbnail: true, isIntro: true },
  { title: 'Heading 1' },
  { title: 'Heading 2' },
  { title: 'Heading 3' },
];

const snapshotCases: Array<{
  label: string;
  snapshots: Partial<LoadLocalFolderOptions>;
}> = [
  {
    label: 'top-level options',
    snapshots: { headingImageMode: 'even-only', fallbackProvider: 'flow' },
  },
  {
    label: 'aiOptions',
    snapshots: {
      aiOptions: { headingImageMode: 'even-only', fallbackProvider: 'flow' },
    },
  },
];

describe('image pipeline caller snapshots', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    (window as any).api = {
      checkFileExists: vi.fn().mockResolvedValue(true),
      readDirWithStats: vi.fn().mockResolvedValue(imageFiles),
      resizeImage: vi.fn(),
    };
  });

  it('decides heading inclusion from the supplied mode without reading storage', () => {
    localStorage.setItem('headingImageMode', 'none');
    const storageRead = vi.spyOn(Storage.prototype, 'getItem');

    expect(shouldGenerateImageForHeading('all', 2, false)).toBe(true);
    expect(shouldGenerateImageForHeading('thumbnail-only', 2, false)).toBe(false);
    expect(shouldGenerateImageForHeading('thumbnail-only', 0, true)).toBe(true);
    expect(shouldGenerateImageForHeading('odd-only', 1, false)).toBe(true);
    expect(shouldGenerateImageForHeading('odd-only', 2, false)).toBe(false);
    expect(shouldGenerateImageForHeading('even-only', 1, false)).toBe(false);
    expect(shouldGenerateImageForHeading('even-only', 2, false)).toBe(true);
    expect(shouldGenerateImageForHeading('none', 0, true)).toBe(false);
    expect(storageRead).not.toHaveBeenCalled();
  });

  it('passes the caller headingImageMode snapshot into local-folder parsing', async () => {
    localStorage.setItem('headingImageMode', 'none');

    const images = await parseLocalFolderImages('C:\\images\\', headings, 'odd-only');

    expect(images.map((image) => image.heading)).toEqual([
      'Thumbnail',
      'Heading 1',
      'Heading 3',
    ]);
  });

  it.each(snapshotCases)('uses explicit snapshots from $label without rereading global provider storage', async ({ snapshots }) => {
    localStorage.setItem('localFolderFallback', 'ai-generate');
    const storageRead = vi.spyOn(Storage.prototype, 'getItem');
    const readRawPipelineSettings = vi.fn(() => {
      throw new Error('global provider storage must not be read');
    });
    (globalThis as any).readRawPipelineSettings = readRawPipelineSettings;
    (window as any).readRawPipelineSettings = readRawPipelineSettings;
    const aiFallbackFn = vi.fn().mockResolvedValue([{ heading: 'Heading 1' }]);

    const result = await loadLocalFolderWithFallback({
      headings,
      postTitle: 'Post title',
      aiFallbackFn,
      ...snapshots,
    });

    expect(result.source).toBe('ai');
    expect(aiFallbackFn).toHaveBeenCalledWith(
      'flow',
      [headings[0], headings[2]],
      'Post title',
      expect.objectContaining({
        fallbackProvider: 'flow',
        headingImageMode: 'even-only',
      }),
    );
    expect(readRawPipelineSettings).not.toHaveBeenCalled();
    expect(storageRead).not.toHaveBeenCalledWith('localFolderFallbackEngine');
  });
});
