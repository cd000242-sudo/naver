// SPEC-IMAGE-MODEL-001 Phase 5 — adapt blob-id images to filePath for automation god files.
// Renderer & main share the same automation entry. Legacy fs code in src/automation/* expects
// image.filePath to be a real fs path. This adapter materializes blob bytes to a temp file just
// before the publishing cycle starts, then automation can use image.filePath as before.

import type { BlobStore } from '../blobStore/index.js';

interface PublishingImage {
  filePath?: string;
  blobId?: string;
  // Other fields are passed through unchanged.
  [key: string]: any;
}

/**
 * For each image in the input array:
 *   - If filePath is non-empty → pass through unchanged.
 *   - If filePath is empty/missing AND blobId is present → materialize a temp file and set filePath.
 *   - Otherwise → pass through (downstream will treat as missing image).
 *
 * Returns a new array. Original objects are not mutated.
 *
 * Note: Temp files are not explicitly unlinked here. The OS temp directory is the cleanup boundary
 * (typical Windows behavior cleans %TEMP% periodically). Explicit unlink can be added in a future
 * phase if leaks become measurable.
 */
export async function materializePublishingImages(
  images: PublishingImage[] | undefined,
  blobStore: Pick<BlobStore, 'materializeTempFile'>,
): Promise<PublishingImage[]> {
  if (!Array.isArray(images) || images.length === 0) return [];

  const result: PublishingImage[] = [];
  for (const img of images) {
    if (img && typeof img.filePath === 'string' && img.filePath) {
      // Legacy path or already materialized — pass through.
      result.push(img);
      continue;
    }

    if (img && typeof img.blobId === 'string' && img.blobId) {
      try {
        const tempPath = await blobStore.materializeTempFile(img.blobId);
        if (tempPath) {
          // Shallow copy to avoid mutating the original object.
          result.push({ ...img, filePath: tempPath });
          continue;
        }
      } catch (e) {
        console.warn(`[materializePublishingImages] failed for blobId=${img.blobId}:`, (e as Error).message);
      }
    }

    // No filePath, no usable blobId — pass through; downstream will detect and skip.
    result.push(img);
  }

  return result;
}
