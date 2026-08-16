// src/crawler/issueHarness/funnel.ts
// Refinement funnel for one heading's candidate pool:
//   download+resolution check → perceptual dHash dedupe → Vision gate → rank.
// Cheap stages run first so the expensive Vision stage sees as few images
// as possible; per-heading fetch caps and the shared vision budget bound cost.

import {
  fetchAndValidateCandidate,
  hammingDistance,
  type FetchedCandidate,
} from './candidateFetcher.js';
import { runVisionGate, type VisionGateBudget } from './visionGate.js';
import type { IssueCandidateImage } from './types.js';

const LOG = '[IssueFunnel]';
const MAX_FETCHES_PER_HEADING = 30;
const PHASH_DUP_DISTANCE = 8;

/** Same photo reposted across sources collapses via dHash distance. */
export interface PhashRegistry {
  hashes: bigint[];
}

export function createPhashRegistry(): PhashRegistry {
  return { hashes: [] };
}

export function isPerceptualDuplicate(registry: PhashRegistry, dhash: bigint): boolean {
  return registry.hashes.some((seen) => hammingDistance(seen, dhash) <= PHASH_DUP_DISTANCE);
}

/** Higher = more likely to be a clean original photo for issue content. */
const SOURCE_WEIGHT: Record<string, number> = {
  'news-og': 3,
  naver: 3,
  'naver-date': 3,
  dcinside: 2.5,
  daum: 2.5,
  google: 2.5,
  duckduckgo: 2,
  yandex: 2,
  reddit: 2,
  youtube: 1, // thumbnails are usually text-heavy; Vision rejects most anyway
};

function sourceWeight(name: string): number {
  return SOURCE_WEIGHT[name] ?? 1.5;
}

/** Pre-fetch ordering: source priority first, then claimed resolution. */
export function orderCandidatesForFetch(pool: IssueCandidateImage[]): IssueCandidateImage[] {
  return [...pool].sort((a, b) => {
    const byWeight = sourceWeight(b.sourceName) - sourceWeight(a.sourceName);
    if (byWeight !== 0) return byWeight;
    return (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0);
  });
}

/** Final ranking of clean survivors: real resolution × source priority. */
export function rankCleanCandidates(items: FetchedCandidate[]): FetchedCandidate[] {
  const score = (item: FetchedCandidate): number => {
    const pixels = item.width * item.height;
    const resolutionScore = Math.min(pixels / (1280 * 720), 3);
    return resolutionScore * sourceWeight(item.candidate.sourceName);
  };
  return [...items].sort((a, b) => score(b) - score(a));
}

export interface FunnelOptions {
  geminiApiKey?: string;
  visionBudget: VisionGateBudget;
  phashRegistry: PhashRegistry;
  /** Stop once this many clean images survive (default 6). */
  cleanTarget?: number;
}

export interface FunnelResult {
  clean: FetchedCandidate[];
  fetched: number;
  duplicates: number;
  visionUsed: boolean;
}

/**
 * Refine one heading's URL-filtered pool into ranked, verified-clean images.
 * Without a Gemini key the Vision stage is skipped and resolution+dedupe
 * survivors pass through (caller reports visionUsed=false to the UI).
 */
export async function refineHeadingCandidates(
  pool: IssueCandidateImage[],
  options: FunnelOptions,
): Promise<FunnelResult> {
  const cleanTarget = options.cleanTarget ?? 6;
  const ordered = orderCandidatesForFetch(pool);

  const validated: FetchedCandidate[] = [];
  let fetched = 0;
  let duplicates = 0;

  for (const candidate of ordered) {
    if (fetched >= MAX_FETCHES_PER_HEADING) break;
    // Fetch roughly 3x the clean target — Vision typically rejects 50~70%
    // of issue photos (news watermarks, captions), so headroom is needed.
    if (validated.length >= cleanTarget * 3) break;
    fetched++;
    const item = await fetchAndValidateCandidate(candidate);
    if (!item) continue;
    if (isPerceptualDuplicate(options.phashRegistry, item.dhash)) {
      duplicates++;
      console.log(`${LOG} ♻️ 지각 중복 제외: ${item.candidate.url.slice(0, 70)}`);
      continue;
    }
    options.phashRegistry.hashes.push(item.dhash);
    validated.push(item);
  }

  console.log(
    `${LOG} 다운로드 ${fetched} → 해상도/디코딩 통과 ${validated.length} (지각중복 ${duplicates})`,
  );

  let clean: FetchedCandidate[];
  let visionUsed = false;
  if (options.geminiApiKey) {
    visionUsed = true;
    clean = await runVisionGate(validated, options.geminiApiKey, options.visionBudget, cleanTarget);
  } else {
    console.log(`${LOG} ⚠️ Gemini 키 없음 — Vision 게이트 생략 (워터마크/텍스트 미검증)`);
    clean = validated;
  }

  return { clean: rankCleanCandidates(clean), fetched, duplicates, visionUsed };
}
