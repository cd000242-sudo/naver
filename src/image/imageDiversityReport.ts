// Pure pairwise statistics over a post's image aHashes. This is the number behind the
// `[ImageDiversity]` log line — a measurement, never a gate. It deliberately avoids
// sharp/imageHashUtils so it stays importable from tests without native modules.

export const IMAGE_DIVERSITY_NEAR_DUPLICATE_THRESHOLD = 6;
const MAX_NEAR_DUPLICATE_PAIRS = 6;

export interface ImageDiversityPair {
  a: number;
  b: number;
  distance: number;
}

export interface ImageDiversityReport {
  count: number;
  validCount: number;
  pairs: number;
  minHamming: number | null;
  meanHamming: number | null;
  threshold: number;
  nearDuplicatePairs: ImageDiversityPair[];
}

function popcount64(value: bigint): number {
  let v = value;
  let count = 0;
  while (v) {
    count += Number(v & 1n);
    v >>= 1n;
  }
  return count;
}

function hamming64(a: bigint, b: bigint): number {
  return popcount64(a ^ b);
}

/**
 * Compares every valid hash pair (null hashes are skipped but keep their index)
 * and reports min/mean Hamming distance plus the closest near-duplicate pairs.
 */
export function buildImageDiversityReport(
  hashes: ReadonlyArray<bigint | null | undefined>,
): ImageDiversityReport {
  const valid = hashes
    .map((hash, index) => ({ hash, index }))
    .filter((entry): entry is { hash: bigint; index: number } => typeof entry.hash === 'bigint');

  const distances: ImageDiversityPair[] = [];
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      distances.push({
        a: valid[i].index,
        b: valid[j].index,
        distance: hamming64(valid[i].hash, valid[j].hash),
      });
    }
  }

  const pairs = distances.length;
  const minHamming = pairs > 0 ? Math.min(...distances.map((pair) => pair.distance)) : null;
  const meanHamming = pairs > 0
    ? distances.reduce((sum, pair) => sum + pair.distance, 0) / pairs
    : null;
  const nearDuplicatePairs = distances
    .filter((pair) => pair.distance <= IMAGE_DIVERSITY_NEAR_DUPLICATE_THRESHOLD)
    .sort((left, right) => left.distance - right.distance || left.a - right.a || left.b - right.b)
    .slice(0, MAX_NEAR_DUPLICATE_PAIRS);

  return {
    count: hashes.length,
    validCount: valid.length,
    pairs,
    minHamming,
    meanHamming,
    threshold: IMAGE_DIVERSITY_NEAR_DUPLICATE_THRESHOLD,
    nearDuplicatePairs,
  };
}

/** One-line Korean summary shared by the renderer log and the JSONL record. */
export function formatImageDiversitySummary(report: ImageDiversityReport): string {
  const min = report.minHamming === null ? '-' : String(report.minHamming);
  const mean = report.meanHamming === null ? '-' : report.meanHamming.toFixed(1);
  return `n=${report.validCount}/${report.count} 최소해밍=${min} 평균=${mean} 근접쌍=${report.nearDuplicatePairs.length}`;
}
