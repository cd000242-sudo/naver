/**
 * Ordering strategies for aggregated inference results.
 *
 * Three strategies are provided:
 *   1. orderByTime   — sort by EXIF timestamp ascending (travel / daily)
 *   2. orderByLocation — group items with the same location_hint together
 *   3. fallbackOrder — preserve original upload order (default when EXIF absent)
 *
 * All functions are pure and return new arrays without mutating inputs.
 */

import type { EnrichedInferenceResponse } from '../types.js';

// ---------------------------------------------------------------------------
// Time-based ordering
// ---------------------------------------------------------------------------

/**
 * Sorts enriched inference responses by EXIF timestamp (ascending).
 * Items without a timestamp are placed at the end in their original order.
 */
export function orderByTime(
  items: readonly EnrichedInferenceResponse[],
): EnrichedInferenceResponse[] {
  const withTime: EnrichedInferenceResponse[] = [];
  const withoutTime: EnrichedInferenceResponse[] = [];

  for (const item of items) {
    if (item.exif.takenAt) {
      withTime.push(item);
    } else {
      withoutTime.push(item);
    }
  }

  withTime.sort((a, b) => {
    const ta = new Date(a.exif.takenAt!).getTime();
    const tb = new Date(b.exif.takenAt!).getTime();
    return ta - tb;
  });

  return [...withTime, ...withoutTime];
}

// ---------------------------------------------------------------------------
// Location-based grouping
// ---------------------------------------------------------------------------

/**
 * Groups items by their location_hint, preserving the order of first
 * appearance per group. Items within each group keep their relative order.
 *
 * Items with an empty location_hint form their own group at the end.
 */
export function orderByLocation(
  items: readonly EnrichedInferenceResponse[],
): EnrichedInferenceResponse[] {
  // Map: location_hint → items in order of appearance
  const groups = new Map<string, EnrichedInferenceResponse[]>();

  for (const item of items) {
    const key = item.result.location_hint.trim() || '__unknown__';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }

  const ordered: EnrichedInferenceResponse[] = [];
  for (const group of groups.values()) {
    ordered.push(...group);
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Fallback (upload-order preservation)
// ---------------------------------------------------------------------------

/**
 * Returns a shallow copy of the items in their original order.
 * Used when no reliable temporal or spatial signal is available.
 */
export function fallbackOrder(
  items: readonly EnrichedInferenceResponse[],
): EnrichedInferenceResponse[] {
  return [...items];
}

// ---------------------------------------------------------------------------
// Strategy selector
// ---------------------------------------------------------------------------

export type OrderingStrategy = 'time' | 'location' | 'fallback';

/**
 * Selects and applies the appropriate ordering strategy.
 *
 * Selection logic:
 *   - If any item has EXIF takenAt → 'time'
 *   - If any item has a non-empty location_hint → 'location'
 *   - Otherwise → 'fallback'
 *
 * An explicit strategy overrides the auto-selection.
 */
export function applyOrdering(
  items: readonly EnrichedInferenceResponse[],
  strategy?: OrderingStrategy,
): EnrichedInferenceResponse[] {
  const resolved = strategy ?? detectStrategy(items);

  switch (resolved) {
    case 'time':
      return orderByTime(items);
    case 'location':
      return orderByLocation(items);
    case 'fallback':
    default:
      return fallbackOrder(items);
  }
}

function detectStrategy(
  items: readonly EnrichedInferenceResponse[],
): OrderingStrategy {
  const hasTimestamp = items.some((it) => Boolean(it.exif.takenAt));
  if (hasTimestamp) return 'time';

  const hasLocation = items.some(
    (it) => it.result.location_hint.trim().length > 0,
  );
  if (hasLocation) return 'location';

  return 'fallback';
}
