/**
 * Auto thumbnail generator — bridges the LLM's THUMBNAIL_HINT block to
 * the existing image generators (nano-banana-pro by default).
 *
 * Flow:
 *   1. LLM output arrives with a ===THUMBNAIL_HINT=== block at the end.
 *   2. extractThumbnailHint() parses it.
 *   3. We call the configured image generator with a single-item batch
 *      (isThumbnail=true, allowText=true).
 *   4. Generator failure is NOT fatal. The post publishes regardless; the
 *      caller falls back to the first body image or a crawled fallback.
 *
 * Why a separate adapter:
 * The generators (nano-banana-pro / openai-image / leonardo / imagefx) all
 * share the ImageRequestItem interface, but their batch semantics differ.
 * Dedicated thumbnail generation needs its own entry point so callers can
 * request "just the thumbnail" without triggering the full body-image batch.
 *
 * This module is intentionally a thin adapter. All the hard parts (API key
 * rotation, abort control, prompt engineering) live inside the generator.
 */

import {
  extractThumbnailHint,
  buildThumbnailRequest,
  stripThumbnailHint,
  CATEGORY_TONE_PRESETS,
  type ThumbnailHint,
} from '../image/thumbnailHintParser.js';
import type { GeneratedImage } from '../image/types.js';

export interface GenerateThumbnailOptions {
  postTitle: string;
  postId?: string;
  category?: string;
  /** Pass through to the underlying generator (gemini / nano-banana-pro API key). */
  apiKey?: string;
  /** Set true in full-auto pipelines so the generator uses aggressive fallbacks. */
  isFullAuto?: boolean;
}

export interface ThumbnailResult {
  /** True when generation succeeded and `image` is populated. */
  ok: boolean;
  hint: ThumbnailHint | null;
  image?: GeneratedImage;
  /** Reason for fallback; present only when ok=false. */
  reason?: 'no_hint' | 'generator_error' | 'no_generator';
  /** Body text with the hint block removed. Callers publish this. */
  cleanedBody: string;
}

/**
 * Generate a thumbnail from the LLM's body output.
 *
 * Returns ok=false when the hint is absent OR the generator throws. Callers
 * MUST handle both cases and fall back to the first body image.
 */
export async function generateThumbnailFromBody(
  llmBody: string,
  options: GenerateThumbnailOptions,
): Promise<ThumbnailResult> {
  const cleanedBody = stripThumbnailHint(llmBody);
  const hint = extractThumbnailHint(llmBody);

  if (!hint) {
    return { ok: false, hint: null, reason: 'no_hint', cleanedBody };
  }

  // Merge category tone preset when the LLM gave a thin tone field.
  const mergedHint: ThumbnailHint =
    hint.tone.length < 10 && options.category && CATEGORY_TONE_PRESETS[options.category]
      ? { ...hint, tone: `${hint.tone}; ${CATEGORY_TONE_PRESETS[options.category]}` }
      : hint;

  const request = buildThumbnailRequest(mergedHint, options.postTitle, options.category);

  try {
    // Lazy import to avoid pulling the generator (and its transitive electron
    // dependencies) into environments that only need parsing — e.g. unit tests.
    const { generateWithNanoBananaPro } = await import('../image/nanoBananaProGenerator.js');
    const images = await generateWithNanoBananaPro(
      [request],
      options.postTitle,
      options.postId,
      options.isFullAuto ?? false,
      options.apiKey,
    );
    if (!images || images.length === 0) {
      return { ok: false, hint: mergedHint, reason: 'generator_error', cleanedBody };
    }
    return { ok: true, hint: mergedHint, image: images[0], cleanedBody };
  } catch (err) {
    console.error('[thumbnailAutoGenerator] generation failed:', err);
    return { ok: false, hint: mergedHint, reason: 'generator_error', cleanedBody };
  }
}

/**
 * Synchronous helper: parse hint and build request without calling the
 * generator. Useful for unit tests and for callers that want to customize
 * the generator invocation themselves.
 */
export function previewThumbnailRequest(
  llmBody: string,
  postTitle: string,
  category?: string,
) {
  const hint = extractThumbnailHint(llmBody);
  if (!hint) return null;
  return {
    hint,
    request: buildThumbnailRequest(hint, postTitle, category),
    cleanedBody: stripThumbnailHint(llmBody),
  };
}
