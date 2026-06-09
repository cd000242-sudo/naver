/**
 * Regression test: odd-only mode image duplication bug
 *
 * Bug: In fullAutoFlow.ts, after odd-only (or even-only) filtering in main.ts,
 * imageResult.images has fewer items than the full headings[] array.
 * The original code used `headings[idx]` where idx was the sequential position
 * within imageResult.images (0, 1, 2...), not the original heading position.
 *
 * Example with 4 headings + odd-only:
 *   headings = [H0, H1, H2, H3]
 *   items sent → main.ts filters → generates images only for origIdx 1, 3
 *   imageResult.images = [imgA(origIdx=1, heading=H1), imgB(origIdx=3, heading=H3)]
 *
 * BEFORE fix (bug):
 *   idx=0 → headings[0]=H0 → ImageManager.addImage(H0, imgA)   ← wrong!
 *   idx=1 → headings[1]=H1 → ImageManager.addImage(H1, imgB)   ← wrong!
 *
 *   filterImagesForPublish then:
 *     H0 → ImageManager → imgA (push)
 *     H1 → ImageManager → imgB (push)       ← wrong heading
 *     H2 → not in ImageManager → fallback from finalImages → imgB has heading=H3? no
 *     H3 → not in ImageManager → fallback → imgB (heading=H3) → push  ← DUPLICATE
 *
 * AFTER fix:
 *   img.heading is used → ImageManager.addImage(H1, imgA), addImage(H3, imgB)
 *   filterImagesForPublish:
 *     H1 → ImageManager → imgA (push) ✓
 *     H3 → ImageManager → imgB (push) ✓
 *     H0, H2 → not registered (correct, no image for them)
 */

import { describe, it, expect } from 'vitest';
import { resolveImageManagerKeys } from '../renderer/modules/fullAutoFlow';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHeadings(titles: string[]) {
  return titles.map((title) => ({ title }));
}

function makeImage(opts: { heading: string; originalIndex: number; filePath?: string }) {
  return {
    heading: opts.heading,
    originalIndex: opts.originalIndex,
    filePath: opts.filePath ?? `/tmp/${opts.heading}.jpg`,
    provider: 'nano-banana-pro' as const,
  };
}

// ---------------------------------------------------------------------------
// Core: resolveImageManagerKeys
// ---------------------------------------------------------------------------

describe('resolveImageManagerKeys — odd-only duplicate bug regression', () => {
  const headings = makeHeadings(['H0', 'H1', 'H2', 'H3']);

  it('RED baseline: sequential idx mapping produces wrong keys (demonstrates the original bug)', () => {
    // Simulate the ORIGINAL buggy behavior for documentation purposes.
    // After odd-only filtering, only origIdx=1 and origIdx=3 images exist.
    const imageResults = [
      makeImage({ heading: 'H1', originalIndex: 1 }),
      makeImage({ heading: 'H3', originalIndex: 3 }),
    ];

    // Buggy original logic: headings[idx], not headings[img.originalIndex]
    const buggyKeys = imageResults.map((img, idx) => {
      const h = headings[idx];
      return typeof h === 'string' ? h : (h?.title ?? `이미지 ${idx + 1}`);
    });

    // The bug: idx=0 → 'H0', idx=1 → 'H1' (wrong — should be H1 and H3)
    expect(buggyKeys).toEqual(['H0', 'H1']);
    // Specifically: imgA(heading=H1) is stored under H0, imgB(heading=H3) under H1.
    // This mismatch allows imgB to appear in both ImageManager(H1) and
    // fallbackFromInput(H3) → duplicate insertion.
    expect(buggyKeys[0]).not.toBe(imageResults[0].heading); // misaligned
    expect(buggyKeys[1]).not.toBe(imageResults[1].heading); // misaligned
  });

  it('GREEN: resolveImageManagerKeys returns correct heading keys for odd-only scenario', () => {
    const imageResults = [
      makeImage({ heading: 'H1', originalIndex: 1 }),
      makeImage({ heading: 'H3', originalIndex: 3 }),
    ];

    const resolved = resolveImageManagerKeys(imageResults, headings);

    expect(resolved).toHaveLength(2);
    // imgA must map to H1, not H0
    expect(resolved[0].headingKey).toBe('H1');
    // imgB must map to H3, not H1
    expect(resolved[1].headingKey).toBe('H3');
  });

  it('GREEN: resolveImageManagerKeys returns correct keys for even-only scenario', () => {
    // even-only: origIdx 0, 2 → keep (0=thumbnail, 2=H2)
    const headings5 = makeHeadings(['썸네일', 'H1', 'H2', 'H3', 'H4']);
    const imageResults = [
      makeImage({ heading: '썸네일', originalIndex: 0 }),
      makeImage({ heading: 'H2', originalIndex: 2 }),
      makeImage({ heading: 'H4', originalIndex: 4 }),
    ];

    const resolved = resolveImageManagerKeys(imageResults, headings5);

    expect(resolved[0].headingKey).toBe('썸네일');
    expect(resolved[1].headingKey).toBe('H2');
    expect(resolved[2].headingKey).toBe('H4');
  });

  it('GREEN: falls back to originalIndex lookup when img.heading is empty', () => {
    const imageResults = [
      { originalIndex: 1, filePath: '/tmp/a.jpg', heading: '', provider: 'nano-banana-pro' },
      { originalIndex: 3, filePath: '/tmp/b.jpg', heading: '   ', provider: 'nano-banana-pro' },
    ];

    const resolved = resolveImageManagerKeys(imageResults, headings);

    expect(resolved[0].headingKey).toBe('H1');
    expect(resolved[1].headingKey).toBe('H3');
  });

  it('GREEN: falls back to 이미지 N label when both heading and originalIndex are missing', () => {
    const imageResults = [
      { filePath: '/tmp/a.jpg', provider: 'nano-banana-pro' },
    ];

    const resolved = resolveImageManagerKeys(imageResults, headings);

    expect(resolved[0].headingKey).toBe('이미지 1');
  });

  it('GREEN: manual heading lock uses headingIndex before stale heading text', () => {
    const imageResults = [
      {
        heading: 'stale heading from old render',
        headingIndex: 3,
        targetHeadingIndex: 3,
        manualHeadingLocked: true,
        filePath: '/tmp/manual-H3.jpg',
        provider: 'local',
      },
    ];

    const resolved = resolveImageManagerKeys(imageResults, headings);

    expect(resolved[0].headingKey).toBe('H3');
  });

  it('GREEN: all-mode (no filtering) — sequential images map correctly', () => {
    // When headingImageMode=all, all 4 headings get images
    const imageResults = [
      makeImage({ heading: 'H0', originalIndex: 0 }),
      makeImage({ heading: 'H1', originalIndex: 1 }),
      makeImage({ heading: 'H2', originalIndex: 2 }),
      makeImage({ heading: 'H3', originalIndex: 3 }),
    ];

    const resolved = resolveImageManagerKeys(imageResults, headings);

    resolved.forEach((r, i) => {
      expect(r.headingKey).toBe(`H${i}`);
    });
  });
});

// ---------------------------------------------------------------------------
// Duplicate-detection simulation
// ---------------------------------------------------------------------------

describe('duplicate image simulation — filterImagesForPublish analog', () => {
  /**
   * Simulates the ImageManager registration + filterImagesForPublish lookup
   * to confirm that resolveImageManagerKeys eliminates the duplicate.
   *
   * We use a simple Map instead of the real ImageManager to stay dependency-free.
   */

  function simulatePublishImages(opts: {
    headings: Array<{ title: string }>;
    imageResults: Array<{ heading: string; originalIndex: number; filePath: string }>;
    useFixedKeys: boolean; // true = use resolveImageManagerKeys (fixed), false = buggy
  }): string[] {
    const { headings, imageResults, useFixedKeys } = opts;

    // Step 1: register images in ImageManager (simulated as Map)
    const imageManagerMap = new Map<string, { filePath: string }>();
    if (useFixedKeys) {
      resolveImageManagerKeys(imageResults, headings).forEach(({ img, headingKey }) => {
        imageManagerMap.set(headingKey, { filePath: img.filePath });
      });
    } else {
      // Buggy: sequential idx
      imageResults.forEach((img, idx) => {
        const h = headings[idx];
        const key = h?.title ?? `이미지 ${idx + 1}`;
        imageManagerMap.set(key, { filePath: img.filePath });
      });
    }

    // Step 2: build fallbackFromInput (keyed by img.heading from finalImages)
    const fallbackMap = new Map<string, { filePath: string }>();
    imageResults.forEach((img) => {
      if (img.heading) fallbackMap.set(img.heading, { filePath: img.filePath });
    });

    // Step 3: filterImagesForPublish analog — for each heading, try ImageManager first, then fallback
    const result: string[] = [];
    headings.forEach(({ title }) => {
      const fromManager = imageManagerMap.get(title);
      if (fromManager) {
        result.push(fromManager.filePath);
        return;
      }
      const fromFallback = fallbackMap.get(title);
      if (fromFallback) {
        result.push(fromFallback.filePath);
      }
    });

    return result;
  }

  it('BEFORE fix: odd-only scenario produces duplicate filePaths', () => {
    const headings = makeHeadings(['H0', 'H1', 'H2', 'H3']);
    const imageResults = [
      { heading: 'H1', originalIndex: 1, filePath: '/tmp/imgA.jpg' },
      { heading: 'H3', originalIndex: 3, filePath: '/tmp/imgB.jpg' },
    ];

    const filePaths = simulatePublishImages({ headings, imageResults, useFixedKeys: false });

    // With the bug:
    // ImageManager: H0→imgA, H1→imgB
    // fallback: H1→imgA (skipped, manager wins), H3→imgB
    // Result for H0→imgA, H1→imgB, H2→(none), H3→imgB (DUPLICATE of imgB)
    const duplicateCount = filePaths.filter((p) => p === '/tmp/imgB.jpg').length;
    expect(duplicateCount).toBeGreaterThanOrEqual(2); // imgB appears at H1 AND H3
  });

  it('AFTER fix: odd-only scenario produces no duplicates', () => {
    const headings = makeHeadings(['H0', 'H1', 'H2', 'H3']);
    const imageResults = [
      { heading: 'H1', originalIndex: 1, filePath: '/tmp/imgA.jpg' },
      { heading: 'H3', originalIndex: 3, filePath: '/tmp/imgB.jpg' },
    ];

    const filePaths = simulatePublishImages({ headings, imageResults, useFixedKeys: true });

    // With the fix:
    // ImageManager: H1→imgA, H3→imgB
    // fallback: H1→imgA (manager wins, same img), H3→imgB (manager wins)
    // Result: H1→imgA, H3→imgB — no duplicate
    const allPaths = filePaths;
    const uniquePaths = [...new Set(allPaths)];
    expect(allPaths.length).toBe(uniquePaths.length); // no duplicates

    expect(filePaths).toContain('/tmp/imgA.jpg');
    expect(filePaths).toContain('/tmp/imgB.jpg');
    // H0 and H2 have no images (correct)
    expect(filePaths.filter((p) => p === '/tmp/imgA.jpg').length).toBe(1);
    expect(filePaths.filter((p) => p === '/tmp/imgB.jpg').length).toBe(1);
  });
});
