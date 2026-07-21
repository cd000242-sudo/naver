/**
 * Inference Aggregator — orchestrates the full per-image pipeline and
 * produces a NarrativePlan ready for the Builder.
 *
 * Pipeline:
 *   1. Extract EXIF from each image buffer  (exifEnricher)
 *   2. Call Vision API in parallel           (visionRouter, concurrency=3)
 *   3. Apply ordering strategy               (ordering)
 *   4. Apply hallucination guards            (hallucinationGuard)
 *   5. Build NarrativePlan sections
 */

import { extractExifFromBuffer } from './exifEnricher.js';
import { applyOrdering } from './ordering.js';
import { guardInferenceResults } from './hallucinationGuard.js';
import { buildNarrativeSections } from './sectionBuilder.js';
import { inferImage } from '../visionInference/visionRouter.js';
import type {
  EnrichedInferenceResponse,
  ImageExif,
  InferenceMode,
  InferenceOptions,
  ImageNarrativeContext,
  NarrativePlan,
  NarrativeSection,
  VisionProvider,
} from '../types.js';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ImageInput {
  /** Stable identifier for this image (e.g. filename or hash). */
  readonly imageId: string;
  /** Raw image bytes (JPEG, PNG, HEIC already converted). */
  readonly buffer: Buffer;
  /** MIME type of the image (e.g. "image/jpeg"). */
  readonly mimeType: string;
}

export interface AggregatorOptions {
  /** Vision provider to use. Defaults to 'gemini'. */
  readonly provider?: VisionProvider;
  /** Content mode to apply. Defaults to 'auto'. */
  readonly mode?: InferenceMode;
  /** User-entered hints that help each Vision call interpret the photo set. */
  readonly context?: ImageNarrativeContext;
  /**
   * Maximum number of concurrent Vision API calls.
   * Defaults to 3 (SPEC FR-4 guideline).
   */
  readonly concurrency?: number;
  /** Explicit opt-in for switching to another paid Vision provider. */
  readonly allowProviderFallback?: InferenceOptions['allowProviderFallback'];
  /** Forwarded to visionRouter for modal display on fallback. */
  readonly onFallback?: InferenceOptions['onFallback'];
}

// ---------------------------------------------------------------------------
// Concurrency limiter (token-bucket style)
// ---------------------------------------------------------------------------

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const current = index++;
      results[current] = await tasks[current]!();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Section builder
// ---------------------------------------------------------------------------

/**
 * Groups ordered and guarded results into NarrativeSection objects.
 *
 * Strategy:
 *   - Group consecutive images with the same location_hint into one section.
 *   - Each section gets a heading derived from the location/scene.
 *   - Beats are the description_ko values from each image in the section.
 */
function buildSections(
  results: readonly EnrichedInferenceResponse[],
): NarrativeSection[] {
  if (results.length === 0) return [];

  const sections: NarrativeSection[] = [];
  let currentKey = getGroupKey(results[0]!);
  let currentItems: EnrichedInferenceResponse[] = [results[0]!];

  for (let i = 1; i < results.length; i++) {
    const key = getGroupKey(results[i]!);
    if (key === currentKey) {
      currentItems.push(results[i]!);
    } else {
      sections.push(makeSection(currentKey, currentItems));
      currentKey = key;
      currentItems = [results[i]!];
    }
  }
  sections.push(makeSection(currentKey, currentItems));

  return sections;
}

function getGroupKey(item: EnrichedInferenceResponse): string {
  const loc = item.result.location_hint.trim();
  return loc || item.result.scene_type;
}

function makeSection(
  key: string,
  items: EnrichedInferenceResponse[],
): NarrativeSection {
  const heading = buildHeading(key, items);
  return {
    heading,
    imageRefs: items.map((it) => it.imageId),
    beats: items.map((it) => it.result.description_ko).filter(Boolean),
  };
}

function buildHeading(key: string, items: EnrichedInferenceResponse[]): string {
  // If key is a scene_type keyword, convert to Korean heading
  const sceneHeadings: Record<string, string> = {
    travel: '여행 장면',
    food: '맛있는 음식',
    lodging: '숙소 풍경',
    daily: '일상의 순간',
    review: '리뷰',
    cafe: '카페 방문',
    auto: '사진 기록',
  };

  if (sceneHeadings[key]) {
    // Enrich with food items if available
    const foods = items.flatMap((it) => [...it.result.food_items]).slice(0, 2);
    if (foods.length > 0) return `${foods.join(', ')} 먹방`;
    return sceneHeadings[key]!;
  }

  return key; // location_hint — already Korean
}

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------

/**
 * Infers the dominant content mode from a set of results.
 * Uses a frequency vote over scene_type values.
 */
function detectDominantMode(
  results: readonly EnrichedInferenceResponse[],
): InferenceMode {
  const counts: Partial<Record<InferenceMode, number>> = {};
  for (const r of results) {
    const st = r.result.scene_type;
    counts[st] = (counts[st] ?? 0) + 1;
  }
  let best: InferenceMode = 'auto';
  let bestCount = 0;
  for (const [mode, count] of Object.entries(counts) as [InferenceMode, number][]) {
    if (count > bestCount) {
      bestCount = count;
      best = mode;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Aggregates multiple images into a NarrativePlan.
 *
 * @param images  - Array of image inputs (buffer + mimeType + imageId).
 * @param options - Provider, mode, concurrency, and fallback callback.
 * @returns NarrativePlan ready for the Builder.
 * @throws Error if Vision API calls all fail for a given image.
 */
export async function aggregateInferences(
  images: readonly ImageInput[],
  options: AggregatorOptions = {},
): Promise<NarrativePlan> {
  const provider = options.provider ?? 'gemini';
  const requestedConcurrency = options.concurrency ?? 3;
  const concurrency = provider === 'gemini' ? 1 : requestedConcurrency;
  const mode = options.mode ?? 'auto';

  // Step 1: Extract EXIF in parallel
  const exifResults: ImageExif[] = await Promise.all(
    images.map((img) => extractExifFromBuffer(img.buffer)),
  );

  // Step 2: Build base64 strings and run Vision API with concurrency limit.
  // [v2.11.135] A single image failure used to abort the WHOLE post (no
  // per-task catch): with 10+ photos even a small per-image failure rate
  // killed a large share of runs. Failures are now skipped and the post
  // continues as long as enough images survived; only a majority failure
  // aborts (that is a provider/config outage, not a flaky image).
  const inferTasks = images.map((img, i) => async (): Promise<EnrichedInferenceResponse | null> => {
    const imageBase64 = img.buffer.toString('base64');
    try {
      const response = await inferImage(
        {
          imageId: img.imageId,
          imageBase64,
          mimeType: img.mimeType,
          exif: exifResults[i],
        },
        {
          provider,
          mode,
          context: options.context,
          allowProviderFallback: options.allowProviderFallback,
          onFallback: options.onFallback,
        },
      );
      return { ...response, exif: exifResults[i] ?? {} };
    } catch (error) {
      console.warn(
        `[Aggregator] ⚠️ 사진 추론 실패 — 이 사진은 건너뛰고 계속: "${img.imageId}" (${(error as Error).message?.substring(0, 160)})`,
      );
      return null;
    }
  });

  const settled = await runWithConcurrency(inferTasks, concurrency);
  const enriched = settled.filter((r): r is EnrichedInferenceResponse => r !== null);
  const failedCount = settled.length - enriched.length;
  const requiredSuccesses = Math.max(2, Math.ceil(images.length * 0.5));
  // Empty input keeps the legacy contract (returns an empty plan; the
  // upstream input validator owns that error message).
  if (images.length > 0 && enriched.length < requiredSuccesses) {
    throw new Error(
      `사진 추론이 ${settled.length}장 중 ${failedCount}장 실패해 글을 구성할 수 없습니다 `
      + `(최소 ${requiredSuccesses}장 필요). 비전 엔진/키 상태를 확인해주세요.`,
    );
  }
  if (failedCount > 0) {
    console.warn(`[Aggregator] ℹ️ ${failedCount}장 실패를 제외하고 ${enriched.length}장으로 계속 진행합니다.`);
  }

  // Step 3: Apply ordering
  const ordered = applyOrdering(enriched);

  // Step 4: Apply hallucination guards
  const guardResult = guardInferenceResults(ordered, mode);

  // Step 5: Detect dominant mode (may override 'auto')
  const resolvedMode =
    mode === 'auto' ? detectDominantMode(guardResult.results) : mode;

  // Step 6: Build sections
  const sections = buildNarrativeSections(guardResult.results);

  return {
    mode: resolvedMode,
    sections,
    needsUserReview: guardResult.needsUserReview,
    warnings: guardResult.warnings,
    orderedResults: guardResult.results,
  };
}
