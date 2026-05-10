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
  // 1: 시점 전환 + 한국어 강조 (영어 hint 무시 회귀 대응)
  'CRITICAL: Generate a completely different image. Use a different angle (low-angle / bird-eye / over-shoulder), different framing (close-up / wide / medium), different lighting (soft / harsh / golden hour / blue hour). 이전 이미지와 시각적으로 명백히 달라야 한다. 동일/유사 결과 절대 금지.',
  // 2: 배경/구도 강제 전환
  'CRITICAL: Change the background entirely (indoor → outdoor, day → night, urban → nature). Reposition main subjects (left → right, center → off-center, foreground → mid-ground). 배경과 구도를 완전히 바꾼다.',
  // 3: 새로운 창작 해석
  'CRITICAL: Reinterpret the scene with a fresh creative perspective. New viewpoint, alternative season, different time of day, contrasting mood. 분위기와 시간대를 완전히 다르게 한다.',
  // 4: 디테일 강제 차별화
  'CRITICAL: Generate a visually distinct scene. Different focal subject, alternative props, varied color palette (warm → cool, monochrome → vibrant). 주요 피사체와 색상 팔레트를 완전히 바꾼다.',
  // 5: 마지막 보루 — 무작위 시점/시간 강제
  'CRITICAL: Pick a totally different season, weather condition, and camera viewpoint than any previous output. The result MUST be unrecognizably different. 계절·날씨·카메라 시점 모두 바꿔서 누가 봐도 다른 이미지를 생성한다.',
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
