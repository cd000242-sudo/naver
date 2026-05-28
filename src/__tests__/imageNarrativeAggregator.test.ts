/**
 * SPEC-IMAGE-NARRATIVE-2026 Phase 2 — Aggregator module tests.
 *
 * Covers:
 * - exifEnricher: normal EXIF, empty EXIF, damaged EXIF
 * - ordering: time-based, location-based grouping, fallback
 * - hallucinationGuard: all five guards
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractExifFromBuffer,
  extractExif,
} from '../imageNarrative/inferenceAggregator/exifEnricher';
import {
  orderByTime,
  orderByLocation,
  fallbackOrder,
  applyOrdering,
} from '../imageNarrative/inferenceAggregator/ordering';
import {
  guardInferenceResults,
} from '../imageNarrative/inferenceAggregator/hallucinationGuard';
import type {
  EnrichedInferenceResponse,
  ImageInferenceResult,
  InferenceMode,
} from '../imageNarrative/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<ImageInferenceResult> = {}): ImageInferenceResult {
  return {
    scene_type: 'travel' as InferenceMode,
    location_hint: '서울 홍대',
    food_items: [],
    mood_keywords: ['활기찬'],
    description_ko: '홍대 거리의 활기찬 풍경입니다.',
    confidence: 0.85,
    ...overrides,
  };
}

function makeEnriched(
  imageId: string,
  resultOverrides: Partial<ImageInferenceResult> = {},
  exifOverrides: object = {},
): EnrichedInferenceResponse {
  return {
    imageId,
    result: makeResult(resultOverrides),
    provider: 'gemini',
    latencyMs: 100,
    exif: exifOverrides,
  };
}

// ---------------------------------------------------------------------------
// exifEnricher tests
// ---------------------------------------------------------------------------

describe('exifEnricher — extractExifFromBuffer', () => {
  it('returns empty object for empty buffer', async () => {
    const result = await extractExifFromBuffer(Buffer.alloc(0));
    expect(result).toEqual({});
  });

  it('returns empty object for non-image buffer', async () => {
    const result = await extractExifFromBuffer(Buffer.from('not-an-image'));
    expect(result).toEqual({});
  });

  it('returns empty object for damaged EXIF buffer', async () => {
    // A JPEG magic bytes + garbage data (no valid EXIF)
    const damaged = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00]);
    const result = await extractExifFromBuffer(damaged);
    expect(result).toEqual({});
  });

  it('never throws — always returns object', async () => {
    const randomBuf = Buffer.from(Array.from({ length: 100 }, () => Math.floor(Math.random() * 256)));
    const result = await extractExifFromBuffer(randomBuf);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('returns empty object for valid JPEG without EXIF', async () => {
    // Minimal valid JPEG: SOI + EOI
    const minimalJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const result = await extractExifFromBuffer(minimalJpeg);
    expect(result).toEqual({});
  });
});

describe('exifEnricher — extractExif (unified entry point)', () => {
  it('accepts a buffer and returns empty object for invalid data', async () => {
    const result = await extractExif(Buffer.from('invalid'));
    expect(typeof result).toBe('object');
  });

  it('accepts a non-existent file path and returns empty object', async () => {
    const result = await extractExif('/path/that/does/not/exist/img.jpg');
    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// ordering tests
// ---------------------------------------------------------------------------

describe('orderByTime', () => {
  it('sorts items by EXIF timestamp ascending', () => {
    const items: EnrichedInferenceResponse[] = [
      makeEnriched('img-c', {}, { takenAt: '2024-07-15T15:00:00.000Z' }),
      makeEnriched('img-a', {}, { takenAt: '2024-07-15T09:00:00.000Z' }),
      makeEnriched('img-b', {}, { takenAt: '2024-07-15T12:00:00.000Z' }),
    ];
    const ordered = orderByTime(items);
    expect(ordered.map((i) => i.imageId)).toEqual(['img-a', 'img-b', 'img-c']);
  });

  it('places items without timestamp at end in original order', () => {
    const items: EnrichedInferenceResponse[] = [
      makeEnriched('img-no-exif-1', {}, {}),
      makeEnriched('img-has-exif', {}, { takenAt: '2024-07-15T10:00:00.000Z' }),
      makeEnriched('img-no-exif-2', {}, {}),
    ];
    const ordered = orderByTime(items);
    expect(ordered[0]!.imageId).toBe('img-has-exif');
    expect(ordered[1]!.imageId).toBe('img-no-exif-1');
    expect(ordered[2]!.imageId).toBe('img-no-exif-2');
  });

  it('returns shallow copy, does not mutate input', () => {
    const items = [makeEnriched('a', {}, { takenAt: '2024-01-01T00:00:00Z' })];
    const ordered = orderByTime(items);
    expect(ordered).not.toBe(items);
  });
});

describe('orderByLocation', () => {
  it('groups items with same location_hint together', () => {
    const items: EnrichedInferenceResponse[] = [
      makeEnriched('a', { location_hint: '서울 홍대' }),
      makeEnriched('b', { location_hint: '부산 해운대' }),
      makeEnriched('c', { location_hint: '서울 홍대' }),
      makeEnriched('d', { location_hint: '부산 해운대' }),
    ];
    const ordered = orderByLocation(items);
    // First group: 홍대 (a, c), Second group: 해운대 (b, d)
    expect(ordered[0]!.imageId).toBe('a');
    expect(ordered[1]!.imageId).toBe('c');
    expect(ordered[2]!.imageId).toBe('b');
    expect(ordered[3]!.imageId).toBe('d');
  });

  it('preserves order within each group', () => {
    const items = [
      makeEnriched('x', { location_hint: '제주도' }),
      makeEnriched('y', { location_hint: '제주도' }),
      makeEnriched('z', { location_hint: '제주도' }),
    ];
    const ordered = orderByLocation(items);
    expect(ordered.map((i) => i.imageId)).toEqual(['x', 'y', 'z']);
  });

  it('places unknown location items in their own group at end', () => {
    const items = [
      makeEnriched('known', { location_hint: '서울' }),
      makeEnriched('unknown1', { location_hint: '' }),
      makeEnriched('unknown2', { location_hint: '' }),
    ];
    const ordered = orderByLocation(items);
    expect(ordered[0]!.imageId).toBe('known');
    expect(ordered[1]!.imageId).toBe('unknown1');
    expect(ordered[2]!.imageId).toBe('unknown2');
  });
});

describe('fallbackOrder', () => {
  it('preserves original order', () => {
    const items = [
      makeEnriched('a'),
      makeEnriched('b'),
      makeEnriched('c'),
    ];
    const ordered = fallbackOrder(items);
    expect(ordered.map((i) => i.imageId)).toEqual(['a', 'b', 'c']);
  });

  it('returns a new array (immutable)', () => {
    const items = [makeEnriched('a')];
    const ordered = fallbackOrder(items);
    expect(ordered).not.toBe(items);
  });
});

describe('applyOrdering — strategy auto-detection', () => {
  it('selects time strategy when takenAt is present', () => {
    const items: EnrichedInferenceResponse[] = [
      makeEnriched('b', {}, { takenAt: '2024-07-15T15:00:00Z' }),
      makeEnriched('a', {}, { takenAt: '2024-07-15T09:00:00Z' }),
    ];
    const ordered = applyOrdering(items);
    expect(ordered[0]!.imageId).toBe('a');
  });

  it('selects location strategy when location_hint is present and no takenAt', () => {
    const items: EnrichedInferenceResponse[] = [
      makeEnriched('a', { location_hint: '서울' }, {}),
      makeEnriched('b', { location_hint: '부산' }, {}),
      makeEnriched('c', { location_hint: '서울' }, {}),
    ];
    const ordered = applyOrdering(items);
    // 서울 group comes first (a, c), then 부산 (b)
    expect(ordered[0]!.imageId).toBe('a');
    expect(ordered[1]!.imageId).toBe('c');
    expect(ordered[2]!.imageId).toBe('b');
  });

  it('uses fallback when no temporal or spatial signals', () => {
    const items = [
      makeEnriched('x', { location_hint: '' }),
      makeEnriched('y', { location_hint: '' }),
    ];
    const ordered = applyOrdering(items);
    expect(ordered.map((i) => i.imageId)).toEqual(['x', 'y']);
  });

  it('respects explicit strategy override', () => {
    const items: EnrichedInferenceResponse[] = [
      makeEnriched('b', {}, { takenAt: '2024-07-15T15:00:00Z' }),
      makeEnriched('a', {}, { takenAt: '2024-07-15T09:00:00Z' }),
    ];
    const ordered = applyOrdering(items, 'fallback');
    // fallback preserves input order
    expect(ordered[0]!.imageId).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// hallucinationGuard tests
// ---------------------------------------------------------------------------

describe('hallucinationGuard — G1: low confidence', () => {
  it('marks needsReview when confidence < 0.6', () => {
    const items = [makeEnriched('low', { confidence: 0.4 })];
    const result = guardInferenceResults(items, 'travel');
    expect(result.needsUserReview).toBe(true);
    expect(result.results[0]!.needsReview).toBe(true);
    expect(result.warnings.some((w) => w.includes('G1'))).toBe(true);
  });

  it('does NOT flag when confidence >= 0.6', () => {
    const items = [makeEnriched('ok', { confidence: 0.75 })];
    const result = guardInferenceResults(items, 'travel');
    const g1 = result.warnings.filter((w) => w.includes('G1'));
    expect(g1).toHaveLength(0);
  });

  it('boundary: confidence exactly 0.6 is NOT flagged', () => {
    const items = [makeEnriched('boundary', { confidence: 0.6 })];
    const result = guardInferenceResults(items, 'travel');
    const g1 = result.warnings.filter((w) => w.includes('G1'));
    expect(g1).toHaveLength(0);
  });
});

describe('hallucinationGuard — G2: GPS vs location_hint mismatch', () => {
  it('flags mismatch when EXIF GPS is near Seoul but location says Busan', () => {
    const items = [
      makeEnriched(
        'gps-mismatch',
        { location_hint: '부산 해운대', confidence: 0.8 },
        { gpsLat: 37.5665, gpsLng: 126.9780 }, // Seoul
      ),
    ];
    const result = guardInferenceResults(items, 'auto');
    expect(result.warnings.some((w) => w.includes('G2'))).toBe(true);
    // Location should be overridden to Seoul
    expect(result.results[0]!.result.location_hint).toBe('서울');
    expect(result.results[0]!.needsReview).toBe(true);
  });

  it('does NOT flag when GPS is absent', () => {
    const items = [makeEnriched('no-gps', { confidence: 0.8 }, {})];
    const result = guardInferenceResults(items, 'auto');
    expect(result.warnings.some((w) => w.includes('G2'))).toBe(false);
  });

  it('does NOT flag when location already matches GPS city', () => {
    const items = [
      makeEnriched(
        'gps-match',
        { location_hint: '서울 강남', confidence: 0.9 },
        { gpsLat: 37.5665, gpsLng: 126.9780 }, // Seoul
      ),
    ];
    const result = guardInferenceResults(items, 'auto');
    expect(result.warnings.some((w) => w.includes('G2'))).toBe(false);
  });
});

describe('hallucinationGuard — G3: mode vs scene_type mismatch', () => {
  it('flags when food mode is used but scene is travel', () => {
    const items = [makeEnriched('wrong-mode', { scene_type: 'travel', confidence: 0.8 })];
    const result = guardInferenceResults(items, 'food');
    expect(result.warnings.some((w) => w.includes('G3'))).toBe(true);
  });

  it('does NOT flag when mode is auto', () => {
    const items = [makeEnriched('auto-mode', { scene_type: 'travel', confidence: 0.8 })];
    const result = guardInferenceResults(items, 'auto');
    expect(result.warnings.some((w) => w.includes('G3'))).toBe(false);
  });

  it('does NOT flag when scene is compatible with mode', () => {
    const items = [makeEnriched('compat', { scene_type: 'food', confidence: 0.8 })];
    const result = guardInferenceResults(items, 'food');
    expect(result.warnings.some((w) => w.includes('G3'))).toBe(false);
  });
});

describe('hallucinationGuard — G4: Korean correction dictionary', () => {
  it('corrects misspelled location names', () => {
    const items = [makeEnriched('typo', { location_hint: '홍데 카페', confidence: 0.8 })];
    const result = guardInferenceResults(items, 'auto');
    // '홍데' → '홍대' correction
    expect(result.results[0]!.result.location_hint).toContain('홍대');
    expect(result.warnings.some((w) => w.includes('G4'))).toBe(true);
  });

  it('corrects misspelled food items', () => {
    const items = [makeEnriched('food-typo', { food_items: ['된장찌게'], confidence: 0.8 })];
    const result = guardInferenceResults(items, 'food');
    expect(result.results[0]!.result.food_items).toContain('된장찌개');
  });

  it('does not modify already correct text', () => {
    const items = [makeEnriched('correct', { location_hint: '강남', confidence: 0.8 })];
    const result = guardInferenceResults(items, 'auto');
    expect(result.warnings.some((w) => w.includes('G4'))).toBe(false);
  });
});

describe('hallucinationGuard — G5: speculative content detection', () => {
  it('flags when confidence < 0.7 and description is very long (>120 chars)', () => {
    const longDesc = 'A'.repeat(130); // 130 chars, Korean chars count as 1
    const items = [makeEnriched('spec', { description_ko: longDesc, confidence: 0.65 })];
    const result = guardInferenceResults(items, 'auto');
    expect(result.warnings.some((w) => w.includes('G5'))).toBe(true);
  });

  it('flags when confidence < 0.5 and description > 60 chars', () => {
    const desc = 'B'.repeat(70);
    const items = [makeEnriched('low-conf', { description_ko: desc, confidence: 0.45 })];
    const result = guardInferenceResults(items, 'auto');
    expect(result.warnings.some((w) => w.includes('G5'))).toBe(true);
  });

  it('does NOT flag high confidence long description', () => {
    const longDesc = 'C'.repeat(200);
    const items = [makeEnriched('high', { description_ko: longDesc, confidence: 0.9 })];
    const result = guardInferenceResults(items, 'auto');
    expect(result.warnings.some((w) => w.includes('G5'))).toBe(false);
  });
});

describe('hallucinationGuard — combined', () => {
  it('aggregates warnings from multiple images', () => {
    const items = [
      makeEnriched('low', { confidence: 0.3 }),
      makeEnriched('ok', { confidence: 0.9 }),
      makeEnriched('mismatch', { scene_type: 'travel', confidence: 0.8 }),
    ];
    const result = guardInferenceResults(items, 'food');
    // low → G1, mismatch → G3
    expect(result.warnings.some((w) => w.includes('G1'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('G3'))).toBe(true);
    expect(result.needsUserReview).toBe(true);
  });

  it('returns needsUserReview false when all items are clean', () => {
    const items = [
      makeEnriched('a', { confidence: 0.9, scene_type: 'food' }),
      makeEnriched('b', { confidence: 0.85, scene_type: 'food' }),
    ];
    const result = guardInferenceResults(items, 'food');
    expect(result.needsUserReview).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });
});
