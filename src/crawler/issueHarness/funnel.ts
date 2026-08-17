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
import { runVisionGate, type VisionGateBudget, type VisionSubjectContext } from './visionGate.js';
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

/**
 * Final ranking of clean survivors: 단독 인물 > (해상도 × 소스 신뢰도).
 * [2026-08-18] 인물 3명이 붙은 기사 콜라주가 단독 프로필보다 앞서던 문제 —
 * soloSubject를 1순위 정렬 키로 둔다 (Vision 판정, 없으면 false 취급).
 */
export function rankCleanCandidates(items: FetchedCandidate[]): FetchedCandidate[] {
  const score = (item: FetchedCandidate): number => {
    const pixels = item.width * item.height;
    const resolutionScore = Math.min(pixels / (1280 * 720), 3);
    return resolutionScore * sourceWeight(item.candidate.sourceName);
  };
  return [...items].sort((a, b) => {
    const soloDiff = Number(b.soloSubject === true) - Number(a.soloSubject === true);
    if (soloDiff !== 0) return soloDiff;
    return score(b) - score(a);
  });
}

export interface FunnelOptions {
  geminiApiKey?: string;
  visionBudget: VisionGateBudget;
  phashRegistry: PhashRegistry;
  /** Stop once this many clean images survive (default 6). */
  cleanTarget?: number;
  /** 관련성 판정 기준 (주체·소제목). 없으면 Vision 게이트가 전량 탈락시킨다. */
  subjectContext: VisionSubjectContext;
}

export interface FunnelResult {
  clean: FetchedCandidate[];
  fetched: number;
  duplicates: number;
  visionUsed: boolean;
  /** 이번 라운드에서 실제로 다운로드까지 시도한 URL — 다음 라운드에서 재시도 방지 */
  attemptedUrls: string[];
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
  const attemptedUrls: string[] = [];
  let fetched = 0;
  let duplicates = 0;

  for (const candidate of ordered) {
    if (fetched >= MAX_FETCHES_PER_HEADING) break;
    attemptedUrls.push(candidate.url);
    // Vision은 이슈 사진의 70~90%를 탈락시킨다(언론사 워터마크·자막·무관). 그래서
    // 목표의 몇 배를 미리 확보한다. [2026-08-17] 목표가 1일 때 3장만 받아 라운드가
    // 헛돌던 문제 → 최소 12장 바닥을 보장한다.
    if (validated.length >= Math.max(cleanTarget * 4, 12)) break;
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
    clean = await runVisionGate(
      validated,
      options.geminiApiKey,
      options.visionBudget,
      options.subjectContext,
      cleanTarget,
    );
  } else {
    // [2026-08-17] 키 없으면 통과시키던 정책 폐기 — 관련성·워터마크 미검증 상태로
    // 배치하면 라이브에서 고양이·화보가 연예 글에 꽂힌다(실측). 빈 슬롯이 낫다.
    console.warn(`${LOG} ⛔ Gemini 키 없음 — 관련성/워터마크 검증 불가로 미배치 (빈 슬롯 유지)`);
    clean = [];
  }

  return { clean: rankCleanCandidates(clean), fetched, duplicates, visionUsed, attemptedUrls };
}
