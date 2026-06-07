/**
 * Inference Image Mapper — converts a NarrativePlan into an ImageManager-compatible
 * imageMap by distributing image references across headings.
 *
 * SPEC-IMAGE-NARRATIVE-2026 Phase 4 (FR-7)
 *
 * Strategy: evenly distribute the available images across sections.
 * Each section receives at least one image when possible.
 */

import type { NarrativePlan } from '../types.js';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/**
 * Metadata shape expected by ImageManager.imageMap.
 * Mirrors the AutomationImage interface used in the rest of the pipeline.
 */
export interface ImageMetadata {
  /** Absolute path on disk, if the image was saved locally. */
  readonly filePath?: string;
  /** In-memory blob ID (for images held as base64 in the renderer). */
  readonly blobId?: string;
  /** Remote URL, if the image originated from a URL upload. */
  readonly url?: string;
  /** Base64/data URL preview kept for renderer-side uploaded images. */
  readonly previewDataUrl?: string;
  /** Heading title this image is associated with. */
  readonly heading?: string;
}

/**
 * Maps each heading title to the list of images assigned to that heading.
 * Shape: Map<headingTitle, ImageMetadata[]>
 */
export type HeadingImageMap = Map<string, ImageMetadata[]>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a NarrativePlan + raw image references into an ImageManager-compatible
 * HeadingImageMap.
 *
 * Distribution strategy (even):
 *   - Total images `N`, total sections `S`.
 *   - Base images per section = floor(N / S).
 *   - Remaining images (N mod S) go to the first `rem` sections (one extra each).
 *   - Sections with no imageRefs in the plan receive images from the overflow pool.
 *
 * @param narrativePlan  - The aggregated plan containing sections with imageRefs.
 * @param imageIds       - Ordered list of image IDs corresponding to the plan's
 *                         orderedResults (used as display filePath references).
 * @returns HeadingImageMap keyed by heading title.
 */
export function mapInferencesToImageMap(
  narrativePlan: NarrativePlan,
  imageIds: readonly string[],
): HeadingImageMap {
  const sections = narrativePlan.sections;
  const resultMap = new Map<string, ImageMetadata[]>();

  if (sections.length === 0 || imageIds.length === 0) {
    return resultMap;
  }

  // Build an ordered array of all imageIds from plan (falling back to provided list)
  const allImageIds = buildOrderedImageIds(narrativePlan, imageIds);
  const totalImages = allImageIds.length;
  const totalSections = sections.length;

  // Even-distribution: each section gets a base amount, plus one extra for remainder
  const base = Math.floor(totalImages / totalSections);
  const remainder = totalImages % totalSections;

  let imageIndex = 0;

  for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
    const section = sections[sectionIdx]!;
    const count = base + (sectionIdx < remainder ? 1 : 0);

    const assignedImages: ImageMetadata[] = [];

    for (let i = 0; i < count && imageIndex < allImageIds.length; i++) {
      const imageId = allImageIds[imageIndex++]!;
      assignedImages.push(buildImageMetadata(imageId, section.heading));
    }

    // Always assign at least one image if available and base is 0
    if (assignedImages.length === 0 && imageIndex < allImageIds.length) {
      const imageId = allImageIds[imageIndex++]!;
      assignedImages.push(buildImageMetadata(imageId, section.heading));
    }

    resultMap.set(section.heading, assignedImages);
  }

  return resultMap;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the ordered image ID list from the plan's orderedResults,
 * then fills in any IDs from the provided imageIds array that are not yet present.
 * This preserves EXIF-based ordering from the aggregator.
 */
function buildOrderedImageIds(
  plan: NarrativePlan,
  imageIds: readonly string[],
): string[] {
  const fromPlan = plan.orderedResults.map((r) => r.imageId);

  // Include any imageIds not already captured in orderedResults
  const seen = new Set(fromPlan);
  const extra = imageIds.filter((id) => !seen.has(id));

  return [...fromPlan, ...extra];
}

/**
 * Constructs an ImageMetadata object for a given imageId and heading.
 * The raw imageId is a renderer-side upload identifier, not a disk path.
 * Keep it in blobId/source fields so the renderer can hydrate it with the
 * original base64 data URL before publishing.
 */
function buildImageMetadata(imageId: string, heading: string): ImageMetadata {
  return {
    blobId: imageId,
    heading,
  };
}
