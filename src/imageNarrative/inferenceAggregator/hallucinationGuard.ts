/**
 * Five-layer hallucination guard for Vision inference results.
 *
 * Guards applied in order:
 *   G1 — Low confidence (< 0.6) → mark needsReview
 *   G2 — EXIF GPS vs location_hint mismatch → EXIF wins
 *   G3 — Category / mode mismatch → flag with warning
 *   G4 — Korean location/menu correction dictionary (~20 entries)
 *   G5 — Heuristic speculative content detection
 *
 * All guards are non-destructive: they annotate results and accumulate
 * warnings but never silently replace or discard vision output.
 */

import type {
  EnrichedInferenceResponse,
  InferenceMode,
  ImageInferenceResult,
} from '../types.js';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface GuardedInferenceResponse extends EnrichedInferenceResponse {
  /** True if this specific image needs user review before publishing. */
  readonly needsReview: boolean;
  /** Zero or more human-readable guard warnings for this image. */
  readonly guardWarnings: readonly string[];
}

export interface GuardResult {
  /** All results, each annotated with guard state. */
  readonly results: readonly GuardedInferenceResponse[];
  /** True if any result requires user review. */
  readonly needsUserReview: boolean;
  /** Aggregated human-readable warnings across all images. */
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// G4: Korean correction dictionary
// ---------------------------------------------------------------------------

/** Maps common Vision model mis-transcriptions to correct Korean text. */
const KOREAN_CORRECTION_MAP: Record<string, string> = {
  // Location corrections
  '홍데': '홍대',
  '홍의': '홍대',
  '한강공권': '한강공원',
  '남대문시정': '남대문시장',
  '동대문시정': '동대문시장',
  '북촌한옥': '북촌한옥마을',
  '경복궁': '경복궁',
  '명동': '명동',
  '이테원': '이태원',
  '신천': '신촌',
  '강남구': '강남',
  // Food name corrections
  '떡볶': '떡볶이',
  '삼겹': '삼겹살',
  '된장찌게': '된장찌개',
  '순두부찌게': '순두부찌개',
  '비빔밥': '비빔밥',
  '갈비탕': '갈비탕',
  '냉면': '냉면',
  '치킨': '치킨',
  '김밥': '김밥',
  '라면': '라면',
};

/**
 * Applies the Korean correction dictionary to a string.
 * Replaces all known mis-transcriptions with correct forms.
 */
function applyKoreanCorrections(text: string): string {
  let result = text;
  for (const [wrong, correct] of Object.entries(KOREAN_CORRECTION_MAP)) {
    result = result.split(wrong).join(correct);
  }
  return result;
}

// ---------------------------------------------------------------------------
// G2: GPS distance check
// ---------------------------------------------------------------------------

/** Distance in km between two GPS coordinates (Haversine formula). */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Rough city-centre coordinates for common Korean cities.
 * Used to validate location_hint text against EXIF GPS.
 */
const CITY_COORDS: Record<string, [number, number]> = {
  서울: [37.5665, 126.9780],
  부산: [35.1796, 129.0756],
  제주: [33.4996, 126.5312],
  인천: [37.4563, 126.7052],
  대구: [35.8714, 128.6014],
  대전: [36.3504, 127.3845],
  광주: [35.1595, 126.8526],
  울산: [35.5384, 129.3114],
  수원: [37.2636, 127.0286],
};

/**
 * Returns the closest city name for given GPS coordinates, or null if
 * none are within 50 km.
 */
function nearestCity(lat: number, lng: number): string | null {
  let minDist = Infinity;
  let nearest: string | null = null;
  for (const [city, [cLat, cLng]] of Object.entries(CITY_COORDS)) {
    const dist = haversineKm(lat, lng, cLat, cLng);
    if (dist < minDist) {
      minDist = dist;
      nearest = city;
    }
  }
  return minDist < 50 ? nearest : null;
}

// ---------------------------------------------------------------------------
// G3: Mode vs scene_type compatibility
// ---------------------------------------------------------------------------

const MODE_SCENE_COMPAT: Record<InferenceMode, readonly InferenceMode[]> = {
  travel: ['travel', 'daily', 'auto'],
  food: ['food', 'cafe', 'auto'],
  lodging: ['lodging', 'daily', 'auto'],
  daily: ['daily', 'travel', 'food', 'cafe', 'auto'],
  review: ['review', 'food', 'lodging', 'auto'],
  cafe: ['cafe', 'food', 'auto'],
  auto: ['travel', 'food', 'lodging', 'daily', 'review', 'cafe', 'auto'],
};

function isModeCompatible(
  expectedMode: InferenceMode,
  actualSceneType: InferenceMode,
): boolean {
  const compat = MODE_SCENE_COMPAT[expectedMode];
  return compat ? compat.includes(actualSceneType) : true;
}

// ---------------------------------------------------------------------------
// G5: Speculative content heuristic
// ---------------------------------------------------------------------------

/**
 * Checks whether a description appears too long relative to its confidence.
 * Very long descriptions with low confidence tend to contain hallucinated detail.
 *
 * Thresholds (empirically tuned):
 *   - confidence < 0.7 AND description_ko > 120 chars → speculative
 *   - confidence < 0.5 AND description_ko > 60 chars  → speculative
 */
function isSpeculative(result: ImageInferenceResult): boolean {
  const len = result.description_ko.length;
  if (result.confidence < 0.5 && len > 60) return true;
  if (result.confidence < 0.7 && len > 120) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Main guard function
// ---------------------------------------------------------------------------

/**
 * Applies all five hallucination guards to a list of enriched responses.
 *
 * @param items    - Enriched inference responses from the aggregator pipeline.
 * @param mode     - The user-selected or auto-detected content mode.
 * @returns GuardResult with annotated responses, review flag, and warnings.
 */
export function guardInferenceResults(
  items: readonly EnrichedInferenceResponse[],
  mode: InferenceMode = 'auto',
): GuardResult {
  const guardedResults: GuardedInferenceResponse[] = [];
  const allWarnings: string[] = [];

  for (const item of items) {
    const warnings: string[] = [];
    let needsReview = false;
    let result = item.result;

    // ------------------------------------------------------------------
    // G1: Low confidence
    // ------------------------------------------------------------------
    if (result.confidence < 0.6) {
      needsReview = true;
      warnings.push(
        `[G1] 이미지 "${item.imageId}" 신뢰도 ${result.confidence.toFixed(2)} < 0.6 — 사용자 검토 필요`,
      );
    }

    // ------------------------------------------------------------------
    // G2: EXIF GPS vs location_hint
    // ------------------------------------------------------------------
    const { gpsLat, gpsLng } = item.exif;
    if (gpsLat != null && gpsLng != null && result.location_hint) {
      const exifCity = nearestCity(gpsLat, gpsLng);
      if (exifCity && !result.location_hint.includes(exifCity)) {
        warnings.push(
          `[G2] 이미지 "${item.imageId}" EXIF GPS → "${exifCity}" 인근, ` +
          `Vision 추론 장소 "${result.location_hint}" 와 불일치. EXIF 우선 적용.`,
        );
        // Override location_hint with EXIF-derived city
        result = { ...result, location_hint: exifCity };
        needsReview = true;
      }
    }

    // ------------------------------------------------------------------
    // G3: Mode vs scene_type mismatch
    // ------------------------------------------------------------------
    if (mode !== 'auto' && !isModeCompatible(mode, result.scene_type)) {
      warnings.push(
        `[G3] 이미지 "${item.imageId}" 감지 장면 "${result.scene_type}" 이 ` +
        `선택 모드 "${mode}" 와 불일치.`,
      );
      needsReview = true;
    }

    // ------------------------------------------------------------------
    // G4: Korean correction dictionary
    // ------------------------------------------------------------------
    const correctedLocation = applyKoreanCorrections(result.location_hint);
    const correctedDescription = applyKoreanCorrections(result.description_ko);
    const correctedFoodItems = result.food_items.map(applyKoreanCorrections);

    const locationChanged = correctedLocation !== result.location_hint;
    const descriptionChanged = correctedDescription !== result.description_ko;
    const foodChanged = correctedFoodItems.some(
      (item, i) => item !== result.food_items[i],
    );

    if (locationChanged || descriptionChanged || foodChanged) {
      result = {
        ...result,
        location_hint: correctedLocation,
        description_ko: correctedDescription,
        food_items: correctedFoodItems,
      };
      warnings.push(
        `[G4] 이미지 "${item.imageId}" 한국어 표기 자동 보정 적용.`,
      );
    }

    // ------------------------------------------------------------------
    // G5: Speculative content detection
    // ------------------------------------------------------------------
    if (isSpeculative(result)) {
      warnings.push(
        `[G5] 이미지 "${item.imageId}" 추측성 내용 가능성 ` +
        `(confidence=${result.confidence.toFixed(2)}, desc_len=${result.description_ko.length}).`,
      );
      needsReview = true;
    }

    allWarnings.push(...warnings);
    guardedResults.push({
      ...item,
      result,
      needsReview,
      guardWarnings: warnings,
    });
  }

  return {
    results: guardedResults,
    needsUserReview: guardedResults.some((r) => r.needsReview),
    warnings: allWarnings,
  };
}
