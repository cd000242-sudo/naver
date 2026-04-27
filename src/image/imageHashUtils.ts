// Shared image-hash utilities used by every image generator (nano-banana,
// Flow, ImageFX, etc.) for cross-engine duplicate detection.
//
// Lifted out of nanoBananaProGenerator.ts in v2.6.7 so Flow and other engines
// can run the same SHA256 + perceptual-hash (aHash) checks instead of letting
// the model emit 3~4 visually identical images per post.
//
// The diversity-hint helpers also live here so every engine reuses the same
// rotation set and the same "replace-not-append" semantics — accumulating
// hints across attempts produces contradictory instructions and degrades
// output quality (see v2.6.6 retrospective M4).

import sharp from 'sharp';
import { createHash } from 'crypto';

const DIVERSITY_HINT_TAG = 'IMPORTANT — DIVERSITY ENFORCEMENT';
const DIVERSITY_HINT_REGEX = new RegExp(`\\n\\n${DIVERSITY_HINT_TAG}[\\s\\S]*$`);

const DIVERSITY_HINTS: readonly string[] = [
  'Use a completely DIFFERENT angle, alternative composition, varied lighting, distinct color palette from any previous output. The visual must be visibly DIFFERENT.',
  'Switch the framing, change subject placement, vary background scene entirely. NO REPETITION of prior outputs.',
  'Apply a fresh creative interpretation: new perspective, alternative time of day, different mood and atmosphere. MUST look unique.',
  'Generate a visually DISTINCT scene: different focal point, alternative environment, varied details. AVOID similarity to past renders.',
];

export function popcountBigInt(x: bigint): number {
  let v = x;
  let count = 0;
  while (v) {
    count += Number(v & 1n);
    v >>= 1n;
  }
  return count;
}

export function hammingDistance64(a: bigint, b: bigint): number {
  return popcountBigInt(a ^ b);
}

export async function computeAHash64(buffer: Buffer): Promise<bigint | null> {
  try {
    const pixels = await sharp(buffer)
      .resize(8, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    if (!pixels || pixels.length < 64) return null;

    let sum = 0;
    for (let i = 0; i < 64; i++) sum += pixels[i];
    const avg = sum / 64;

    let bits = 0n;
    for (let i = 0; i < 64; i++) {
      if (pixels[i] > avg) {
        bits |= 1n << BigInt(63 - i);
      }
    }
    return bits;
  } catch {
    return null;
  }
}

export function computeSha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export interface DuplicateProbeResult {
  isDuplicate: boolean;
  isSimilar: boolean;
  sha256: string | null;
  aHash: bigint | null;
}

// Pure detection — does NOT mutate the passed-in sets. Caller decides whether
// to commit (after final acceptance) or discard (when retrying for diversity).
export async function probeDuplicate(
  buffer: Buffer,
  usedSha256: Set<string> | undefined,
  usedAHashes: bigint[] | undefined,
  similarityThreshold = 6,
): Promise<DuplicateProbeResult> {
  const sha256 = usedSha256 ? computeSha256Hex(buffer) : null;
  let isDuplicate = false;
  if (sha256 && usedSha256?.has(sha256)) isDuplicate = true;

  let aHash: bigint | null = null;
  let isSimilar = false;
  if (!isDuplicate && usedAHashes) {
    aHash = await computeAHash64(buffer);
    if (aHash !== null) {
      isSimilar = usedAHashes.some((prev) => hammingDistance64(prev, aHash!) <= similarityThreshold);
    }
  }
  return { isDuplicate, isSimilar, sha256, aHash };
}

export function commitHashes(
  probe: DuplicateProbeResult,
  usedSha256: Set<string> | undefined,
  usedAHashes: bigint[] | undefined,
): void {
  if (usedSha256 && probe.sha256 && !probe.isDuplicate) {
    usedSha256.add(probe.sha256);
  }
  if (usedAHashes && probe.aHash !== null && !probe.isSimilar) {
    usedAHashes.push(probe.aHash);
  }
}

// Replace-not-append: prevents the v2.6.6 bug where 4 hints accumulated and
// produced contradictory instructions to the model.
export function applyDiversityHint(prompt: string, attempt: number): string {
  const hint = DIVERSITY_HINTS[(attempt - 1) % DIVERSITY_HINTS.length];
  const stripped = prompt.replace(DIVERSITY_HINT_REGEX, '');
  return `${stripped}\n\n${DIVERSITY_HINT_TAG} (attempt ${attempt + 1}): ${hint}`;
}
