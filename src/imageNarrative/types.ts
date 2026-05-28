/**
 * Core types for the image-narrative inference pipeline.
 *
 * These types are the single source of truth for the vision inference layer
 * (Phase 1). No runtime logic lives here — only data shapes.
 */

// ---------------------------------------------------------------------------
// Inference Mode
// ---------------------------------------------------------------------------

/**
 * Describes the subject matter of the photo set.
 * Used to select the appropriate system prompt.
 */
export type InferenceMode =
  | 'travel'
  | 'food'
  | 'lodging'
  | 'daily'
  | 'review'
  | 'cafe'
  | 'auto';

// ---------------------------------------------------------------------------
// Vision Provider
// ---------------------------------------------------------------------------

/**
 * Which Vision API backend to call.
 */
export type VisionProvider = 'gemini' | 'openai' | 'claude' | 'deepinfra';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * A single image to be analyzed.
 */
export interface InferenceContext {
  /** Stable ID for this image (e.g., filename or hash). */
  readonly imageId: string;
  /** Raw image bytes encoded as base64. */
  readonly imageBase64: string;
  /** MIME type of the image (e.g., "image/jpeg"). */
  readonly mimeType: string;
  /** Optional EXIF metadata extracted before this call. */
  readonly exif?: ImageExif;
}

/**
 * Subset of EXIF data relevant for narrative generation.
 */
export interface ImageExif {
  /** ISO 8601 timestamp from DateTimeOriginal. */
  readonly takenAt?: string;
  /** Decimal latitude, e.g., 37.5665. */
  readonly gpsLat?: number;
  /** Decimal longitude, e.g., 126.9780. */
  readonly gpsLng?: number;
  /** Camera make/model string (optional). */
  readonly camera?: string;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for a single inference call (or a batch).
 */
export interface InferenceOptions {
  /**
   * Which provider to use.
   * Defaults to 'gemini' if omitted.
   */
  readonly provider?: VisionProvider;
  /**
   * Subject-matter mode — controls which system prompt is injected.
   * Defaults to 'auto' if omitted.
   */
  readonly mode?: InferenceMode;
  /**
   * AbortSignal to cancel a long-running inference.
   * If not provided, a 30-second internal timeout applies.
   */
  readonly signal?: AbortSignal;
  /**
   * Maximum number of images to process per batch call.
   * Defaults to 5.
   */
  readonly maxImages?: number;
  /**
   * Called when the primary provider fails and fallback kicks in.
   * Receives the provider that failed and the one that will be tried next.
   * The caller MUST surface this to the user (feedback_no_fallback rule).
   */
  readonly onFallback?: (failed: VisionProvider, next: VisionProvider) => void;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/**
 * Structured result returned by Vision inference for a single image.
 *
 * All text fields are in Korean (한국어).
 */
export interface ImageInferenceResult {
  /** Auto-detected or requested scene type. */
  readonly scene_type: InferenceMode;
  /**
   * Human-readable location hint in Korean.
   * e.g., "서울 홍대 근처 카페" or "제주도 성산일출봉"
   * Empty string if unknown.
   */
  readonly location_hint: string;
  /**
   * List of food/dish names visible in the image (Korean).
   * Empty array for non-food images.
   */
  readonly food_items: readonly string[];
  /**
   * Mood or atmosphere keywords (Korean), e.g., ["따뜻한", "아늑한"].
   */
  readonly mood_keywords: readonly string[];
  /**
   * One or two sentence Korean caption suitable for blog text.
   */
  readonly description_ko: string;
  /**
   * Model's confidence in its own output, 0.0 to 1.0.
   * Values below 0.6 trigger the hallucination guard in the UI.
   */
  readonly confidence: number;
}

/**
 * Wraps InferenceResult with provenance metadata.
 */
export interface InferenceResponse {
  readonly imageId: string;
  readonly result: ImageInferenceResult;
  /** Which provider produced this result. */
  readonly provider: VisionProvider;
  /** Round-trip wall-clock time in milliseconds. */
  readonly latencyMs: number;
}

// ---------------------------------------------------------------------------
// Aggregator output types (Phase 2)
// ---------------------------------------------------------------------------

/**
 * A single section in the narrative plan.
 * Maps to one blog heading with associated images and story beats.
 */
export interface NarrativeSection {
  /** Korean heading text for this section. */
  readonly heading: string;
  /** IDs of images that belong to this section (from InferenceResponse.imageId). */
  readonly imageRefs: readonly string[];
  /** One-line story beats to expand into prose (Korean). */
  readonly beats: readonly string[];
}

/**
 * The aggregated plan produced by the Aggregator and consumed by the Builder.
 */
export interface NarrativePlan {
  /** Overall content mode inferred from images (or user override). */
  readonly mode: InferenceMode;
  /** Ordered sections from which the Builder generates the full post. */
  readonly sections: readonly NarrativeSection[];
  /** True when at least one image needs user review before publishing. */
  readonly needsUserReview: boolean;
  /** Human-readable warnings from the hallucination guard. */
  readonly warnings: readonly string[];
  /** Full inference responses in resolved order (for downstream use). */
  readonly orderedResults: readonly InferenceResponse[];
}

/**
 * Enriched inference response used internally by the Aggregator.
 * Adds EXIF metadata alongside the vision result.
 */
export interface EnrichedInferenceResponse extends InferenceResponse {
  /** EXIF data extracted from the source image (may be partial or absent). */
  readonly exif: ImageExif;
}
