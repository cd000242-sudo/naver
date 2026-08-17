// src/crawler/issueHarness/harness.ts
// Issue endgame collection orchestrator.
// R2: 9-source tiered cascade per heading —
//   Tier 1 (cheap fetch): naver API, duckduckgo, news og:image, youtube, reddit
//   Tier 2 (browser scrape): google, daum — only when the pool is thin
//   Tier 3 (fragile): yandex, dcinside — last resort
// R3 adds pHash/resolution/Vision funnel stages, R4 adds ranking.

import { buildIssueQueryPlan } from './queryFanout.js';
import { filterIssueCandidates } from './urlPolicy.js';
import { createPhashRegistry, refineHeadingCandidates } from './funnel.js';
import { createVisionBudget } from './visionGate.js';
import { naverApiSource, naverApiDateSource } from './sources/naverApiSource.js';
import { googleSource } from './sources/googleSource.js';
import { duckduckgoSource } from './sources/duckduckgoSource.js';
import { redditSource } from './sources/redditSource.js';
import { youtubeThumbSource } from './sources/youtubeThumbSource.js';
import { newsOgImageSource } from './sources/newsOgImageSource.js';
import { dcinsideSource } from './sources/dcinsideSource.js';
import { daumImageSource } from './sources/daumImageSource.js';
import { yandexImageSource } from './sources/yandexImageSource.js';
import type {
  HeadingQuerySet,
  IssueCandidateImage,
  IssueCollectPayload,
  IssueHarnessOptions,
  IssueHarnessResult,
  IssueSourceAdapter,
} from './types.js';

const LOG = '[IssueHarness]';

/** Pool sizes that decide whether the next (more expensive) tier runs. */
const POOL_SKIP_TIER2 = 40;
const POOL_SKIP_TIER3 = 15;

interface SourceStep {
  adapter: IssueSourceAdapter;
  /** Picks the query variant this step should use (empty string → skip). */
  pickQuery: (qs: HeadingQuerySet) => string;
  maxImages: number;
}

/** English variant preferred for overseas sources; Korean as fallback. */
const preferEnglish = (qs: HeadingQuerySet): string => qs.englishQuery || qs.koreanQuery;

const TIER1: SourceStep[] = [
  { adapter: naverApiSource, pickQuery: (q) => q.koreanQuery, maxImages: 30 },
  // Fandom/event queries use date sort — issue photos age out fast.
  { adapter: naverApiDateSource, pickQuery: (q) => q.fandomQuery, maxImages: 20 },
  { adapter: naverApiDateSource, pickQuery: (q) => q.eventQuery, maxImages: 15 },
  { adapter: newsOgImageSource, pickQuery: (q) => q.koreanQuery, maxImages: 8 },
  { adapter: duckduckgoSource, pickQuery: preferEnglish, maxImages: 25 },
  { adapter: youtubeThumbSource, pickQuery: (q) => q.koreanQuery, maxImages: 8 },
  { adapter: redditSource, pickQuery: preferEnglish, maxImages: 15 },
];

const TIER2: SourceStep[] = [
  { adapter: googleSource, pickQuery: (q) => q.koreanQuery, maxImages: 15 },
  { adapter: daumImageSource, pickQuery: (q) => q.koreanQuery, maxImages: 15 },
  { adapter: googleSource, pickQuery: (q) => q.englishQuery, maxImages: 15 },
];

const TIER3: SourceStep[] = [
  { adapter: yandexImageSource, pickQuery: preferEnglish, maxImages: 15 },
  { adapter: dcinsideSource, pickQuery: (q) => q.fandomQuery || q.koreanQuery, maxImages: 10 },
];

function pause(minMs: number, maxMs: number): Promise<void> {
  return new Promise((r) => setTimeout(r, minMs + Math.random() * (maxMs - minMs)));
}

async function runTier(
  tier: SourceStep[],
  qs: HeadingQuerySet,
  seenQueries: Set<string>,
): Promise<IssueCandidateImage[]> {
  const pool: IssueCandidateImage[] = [];
  for (const step of tier) {
    const query = (step.pickQuery(qs) || '').trim();
    if (!query) continue;
    // The same adapter+query pair never runs twice per heading.
    const key = `${step.adapter.name}::${query}`;
    if (seenQueries.has(key)) continue;
    seenQueries.add(key);
    try {
      pool.push(...(await step.adapter.search(query, step.maxImages)));
    } catch (error) {
      // Adapters guarantee [] on failure, but a belt-and-braces catch keeps
      // one misbehaving source from killing the whole heading.
      console.warn(`${LOG} ${step.adapter.name} 예외: ${(error as Error).message}`);
    }
    await pause(250, 700);
  }
  return pool;
}

/** Collect raw candidates for one heading across the tiered cascade. */
async function collectForHeading(qs: HeadingQuerySet, cap: number): Promise<IssueCandidateImage[]> {
  const seenQueries = new Set<string>();

  const pool = await runTier(TIER1, qs, seenQueries);
  let filtered = filterIssueCandidates(pool, cap);
  console.log(`${LOG} "${qs.heading}" 티어1: 원시 ${pool.length} → 정제 ${filtered.length}`);

  if (filtered.length < POOL_SKIP_TIER2) {
    pool.push(...(await runTier(TIER2, qs, seenQueries)));
    filtered = filterIssueCandidates(pool, cap);
    console.log(`${LOG} "${qs.heading}" 티어2 완료: 정제 ${filtered.length}`);
  }

  if (filtered.length < POOL_SKIP_TIER3) {
    pool.push(...(await runTier(TIER3, qs, seenQueries)));
    filtered = filterIssueCandidates(pool, cap);
    console.log(`${LOG} "${qs.heading}" 티어3 완료: 정제 ${filtered.length}`);
  }

  // Wide fallback query when the entire cascade came back empty.
  if (filtered.length === 0 && qs.broaderQuery) {
    const wide = await naverApiSource.search(qs.broaderQuery, 30);
    filtered = filterIssueCandidates(wide, cap);
    console.log(`${LOG} "${qs.heading}" 광역 폴백: 정제 ${filtered.length}`);
  }

  return filtered;
}

/**
 * Run the issue endgame collection for a whole post.
 * Returns per-heading placed URLs + the surviving candidate pool.
 */
export async function collectIssueImages(
  payload: IssueCollectPayload,
  options: IssueHarnessOptions = {},
): Promise<IssueHarnessResult> {
  // [2026-08-17] 기본 1장, AI가 본문을 보고 2장 이상 필요하다고 판단한 소제목만
  // 그 수만큼 배치 (recommendedImages 1~3). perHeadingTarget은 상한 캡.
  const perHeadingTarget = options.perHeadingTarget ?? 3;
  const cap = options.maxCandidatesPerHeading ?? 60;
  const emit = (percent: number, message: string): void => {
    try { options.onProgress?.({ percent: Math.min(100, Math.round(percent)), message }); } catch { /* UI only */ }
  };

  emit(3, '🧠 AI가 제목·소제목·본문을 분석해 검색어를 설계하는 중...');
  const plan = await buildIssueQueryPlan(payload.title, payload.headings, options.geminiApiKey);
  emit(
    8,
    plan.aiGenerated
      ? `🧠 AI 분석 완료 — 주체 "${plan.mainSubject}", 소제목당 검색어 4종 생성`
      : '🧠 휴리스틱 검색어 생성 완료 (Gemini 키 없음)',
  );
  console.log(
    `${LOG} 🚀 수집 시작: ${plan.querySets.length}개 소제목, AI플랜=${plan.aiGenerated}, 주체="${plan.mainSubject}"`,
  );

  const images: Record<string, string[]> = {};
  const candidates: Record<string, IssueCandidateImage[]> = {};
  const perSource: Record<string, number> = {};
  let totalCandidates = 0;
  let afterFilter = 0;
  let cleanTotal = 0;
  let perceptualDuplicates = 0;
  let visionUsedAny = false;
  const globallyUsed = new Set<string>();
  const visionBudget = createVisionBudget(120);
  const phashRegistry = createPhashRegistry();

  // Headings run sequentially — human-paced against public endpoints, and
  // browser tiers launch real Chromium instances (parallel would stack them).
  const totalHeadings = plan.querySets.length || 1;
  for (let hi = 0; hi < plan.querySets.length; hi++) {
    const qs = plan.querySets[hi];
    // Each heading owns an equal slice of the 10~92% band: first half for
    // source collection, second half for the download/vision funnel.
    const base = 10 + (hi / totalHeadings) * 82;
    const slice = 82 / totalHeadings;
    emit(base, `🔍 [${hi + 1}/${totalHeadings}] "${qs.heading}" — 다소스 추적 수집 중 (네이버·구글·해외·커뮤니티)...`);
    const filtered = (await collectForHeading(qs, cap)).filter((c) => !globallyUsed.has(c.url));
    emit(base + slice * 0.5, `📥 [${hi + 1}/${totalHeadings}] 후보 ${filtered.length}장 확보 → 다운로드·중복제거·워터마크 검사 중...`);
    totalCandidates += filtered.length; // raw counts are logged per tier
    afterFilter += filtered.length;
    for (const c of filtered) {
      perSource[c.sourceName] = (perSource[c.sourceName] || 0) + 1;
    }

    // R3 funnel: download → resolution → perceptual dedupe → Vision gate → rank
    const refined = await refineHeadingCandidates(filtered, {
      geminiApiKey: options.geminiApiKey,
      visionBudget,
      phashRegistry,
    });
    cleanTotal += refined.clean.length;
    perceptualDuplicates += refined.duplicates;
    visionUsedAny = visionUsedAny || refined.visionUsed;

    const cleanCandidates = refined.clean.map((item) => ({
      ...item.candidate,
      width: item.width,
      height: item.height,
    }));
    // AI 권장 수(기본 1)만큼 배치 — 상한은 perHeadingTarget.
    const targetForHeading = Math.min(Math.max(qs.recommendedImages ?? 1, 1), perHeadingTarget);
    const placed = cleanCandidates.slice(0, targetForHeading);
    placed.forEach((c) => globallyUsed.add(c.url));

    images[qs.heading] = placed.map((c) => c.url);
    candidates[qs.heading] = cleanCandidates;
    emit(
      base + slice,
      placed.length > 0
        ? `✅ [${hi + 1}/${totalHeadings}] "${qs.heading}" — 클린 ${cleanCandidates.length}장 중 ${placed.length}장 배치`
        : `⚠️ [${hi + 1}/${totalHeadings}] "${qs.heading}" — 깨끗한 이미지 없음, 빈 슬롯 유지`,
    );
    console.log(
      `${LOG} 📸 "${qs.heading}": 정제 ${filtered.length} → 클린 ${cleanCandidates.length} → 배치 ${placed.length}`,
    );
  }

  emit(95, '🧹 결과 정리 및 저장 준비 중...');
  return {
    images,
    candidates,
    stats: {
      totalCandidates,
      afterFilter,
      perSource,
      aiPlanUsed: plan.aiGenerated,
      visionUsed: visionUsedAny,
      visionInspected: visionBudget.inspected,
      cleanTotal,
      perceptualDuplicates,
    },
  };
}
