/**
 * Inference Image Mapper — converts a NarrativePlan into an ImageManager-compatible
 * imageMap by placing each image under the section that actually discusses it.
 *
 * SPEC-IMAGE-NARRATIVE-2026 Phase 4 (FR-7)
 *
 * Strategy: CONTEXTUAL placement. The aggregator already groups images into
 * sections by location_hint/scene_type (sectionBuilder.buildNarrativeSections),
 * and each section's body is written from those exact images' descriptions. So we
 * place every image under its own section.imageRefs — the photo lands exactly
 * where the body talks about it (사용자 요청: "문맥에 맞게 완벽하게 배치").
 *
 * Any image not referenced by a section (edge case — e.g. review edits dropped a
 * ref) is round-robin appended so no uploaded photo is ever silently dropped.
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
 * HeadingImageMap, placing each image under the section that discusses it.
 *
 * Placement strategy (contextual):
 *   1. Each section receives exactly its own `section.imageRefs`, in plan order.
 *      Because the body of that section is generated from those images'
 *      descriptions, the photo lands precisely where the text talks about it.
 *   2. Any image present in the plan/imageIds but not referenced by any section
 *      is round-robin appended across sections so no upload is ever dropped.
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

  if (sections.length === 0) {
    return resultMap;
  }

  // Ordered universe of every image id (plan EXIF order first, then extras).
  const allImageIds = buildOrderedImageIds(narrativePlan, imageIds);
  if (allImageIds.length === 0) {
    return resultMap;
  }

  const available = new Set(allImageIds);
  const placed = new Set<string>();

  // 1) Contextual placement — each section gets its own imageRefs.
  for (const section of sections) {
    const assigned: ImageMetadata[] = [];
    for (const imageId of section.imageRefs) {
      if (available.has(imageId) && !placed.has(imageId)) {
        placed.add(imageId);
        assigned.push(buildImageMetadata(imageId, section.heading));
      }
    }
    resultMap.set(section.heading, assigned);
  }

  // 2) Leftover safety — round-robin any image no section referenced.
  const leftovers = allImageIds.filter((id) => !placed.has(id));
  let rr = 0;
  for (const imageId of leftovers) {
    const section = sections[rr % sections.length]!;
    const arr = resultMap.get(section.heading) ?? [];
    arr.push(buildImageMetadata(imageId, section.heading));
    resultMap.set(section.heading, arr);
    placed.add(imageId);
    rr++;
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
