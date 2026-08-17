// src/crawler/issueHarness/harness.ts
// Issue endgame collection orchestrator.
// R2: 9-source tiered cascade per heading —
//   Tier 1 (cheap fetch): naver API, duckduckgo, news og:image, youtube, reddit
//   Tier 2 (browser scrape): google, daum — only when the pool is thin
//   Tier 3 (fragile): yandex, dcinside — last resort
// R3 adds pHash/resolution/Vision funnel stages, R4 adds ranking.

import { buildIssueQueryPlan } from './queryFanout.js';
import { filterIssueCandidates } from './urlPolicy.js';
import { createPhashRegistry, refineHeadingCandidates, type FunnelOptions } from './funnel.js';
import type { FetchedCandidate } from './candidateFetcher.js';
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

/**
 * [2026-08-17] 티어 승격 기준을 "후보 수"에서 "게이트 통과 수"로 바꾼 이유:
 * 실측(한다감 글)에서 네이버 한 소스가 후보 60장을 채워 티어2·3(구글·다음·커뮤니티)이
 * 아예 실행되지 않았고, 그 60장은 대부분 언론사 워터마크 사진이라 게이트에서 전멸했다.
 * 사용자는 커뮤니티에서 깨끗한 사진을 쉽게 찾는데 앱은 못 찾은 원인이 이것.
 * 이제 라운드마다 [소스 수집 → 정제 깔때기]를 돌려 클린이 목표에 못 미치면 다음 티어로
 * 승격한다. 이미 다운로드 시도한 URL은 재시도하지 않는다.
 */
async function collectCleanForHeading(
  qs: HeadingQuerySet,
  cap: number,
  target: number,
  funnelOptions: Omit<FunnelOptions, 'cleanTarget'>,
): Promise<{ clean: FetchedCandidate[]; poolSize: number; duplicates: number; visionUsed: boolean }> {
  const seenQueries = new Set<string>();
  const attempted = new Set<string>();
  const pool: IssueCandidateImage[] = [];
  const clean: FetchedCandidate[] = [];
  let duplicates = 0;
  let visionUsed = false;

  const tiers: Array<{ label: string; steps: SourceStep[] }> = [
    { label: '티어1(네이버·뉴스·DDG·유튜브·레딧)', steps: TIER1 },
    { label: '티어2(구글·다음)', steps: TIER2 },
    { label: '티어3(얀덱스·DC)', steps: TIER3 },
  ];

  for (const tier of tiers) {
    pool.push(...(await runTier(tier.steps, qs, seenQueries)));
    const fresh = filterIssueCandidates(pool, cap).filter((c) => !attempted.has(c.url));
    console.log(`${LOG} "${qs.heading}" ${tier.label}: 신규 후보 ${fresh.length}장 → 깔때기 투입`);
    if (fresh.length > 0) {
      const refined = await refineHeadingCandidates(fresh, {
        ...funnelOptions,
        cleanTarget: Math.max(1, target - clean.length),
      });
      refined.attemptedUrls.forEach((u) => attempted.add(u));
      duplicates += refined.duplicates;
      visionUsed = visionUsed || refined.visionUsed;
      clean.push(...refined.clean);
      console.log(`${LOG} "${qs.heading}" ${tier.label} 결과: 클린 누적 ${clean.length}/${target}`);
    }
    if (clean.length >= target) break;
  }

  // 전 티어를 돌고도 비면 광역 폴백(주체만으로 검색) 한 번 더.
  if (clean.length === 0 && qs.broaderQuery) {
    const wide = filterIssueCandidates(await naverApiSource.search(qs.broaderQuery, 30), cap)
      .filter((c) => !attempted.has(c.url));
    if (wide.length > 0) {
      const refined = await refineHeadingCandidates(wide, { ...funnelOptions, cleanTarget: target });
      clean.push(...refined.clean);
      duplicates += refined.duplicates;
      visionUsed = visionUsed || refined.visionUsed;
      console.log(`${LOG} "${qs.heading}" 광역 폴백 결과: 클린 ${refined.clean.length}`);
    }
  }

  return { clean, poolSize: pool.length, duplicates, visionUsed };
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

  emit(3, '🧠 AI가 제목·서론·본문 전체를 읽고 사건 맥락을 파악하는 중...');
  const plan = await buildIssueQueryPlan(
    payload.title,
    payload.headings,
    options.geminiApiKey,
    payload.intro,
  );
  emit(
    8,
    plan.aiGenerated
      ? `🧠 사건 파악: ${plan.mainSubject}${plan.programName ? ` · ${plan.programName}` : ''}${plan.contextSummary ? ` — ${plan.contextSummary.slice(0, 60)}` : ''}`
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
    emit(base, `🔍 [${hi + 1}/${totalHeadings}] "${qs.heading}" — 티어별 추적 수집 + 검증 중 (네이버→구글·다음→해외·커뮤니티)...`);

    // 티어 승격형 라운드: [수집 → 다운로드·중복제거·워터마크·관련성 검증]을 돌려
    // 클린이 목표에 못 미치면 다음 티어 소스로 확장한다.
    const targetForHeading = Math.min(Math.max(qs.recommendedImages ?? 1, 1), perHeadingTarget);
    const refined = await collectCleanForHeading(qs, cap, targetForHeading, {
      geminiApiKey: options.geminiApiKey,
      visionBudget,
      phashRegistry,
      // 관련성 판정 기준 — 사건 맥락까지 넘겨 "소제목 문구"가 아니라 "무슨 사건인지"로
      // 판정한다. 주체가 비면 게이트가 전량 미배치(빈 슬롯)로 막는다.
      subjectContext: {
        mainSubject: plan.mainSubject,
        heading: qs.heading,
        contextSummary: plan.contextSummary,
        programName: plan.programName,
        headingBody: payload.headings[hi]?.body,
      },
    });
    emit(
      base + slice * 0.6,
      `📥 [${hi + 1}/${totalHeadings}] 후보 ${refined.poolSize}장 검토 → 검증 통과 ${refined.clean.length}장`,
    );
    totalCandidates += refined.poolSize;
    afterFilter += refined.poolSize;
    for (const item of refined.clean) {
      const src = item.candidate.sourceName;
      perSource[src] = (perSource[src] || 0) + 1;
    }
    cleanTotal += refined.clean.length;
    perceptualDuplicates += refined.duplicates;
    visionUsedAny = visionUsedAny || refined.visionUsed;

    const cleanCandidates = refined.clean
      .filter((item) => !globallyUsed.has(item.candidate.url))
      .map((item) => ({
        ...item.candidate,
        width: item.width,
        height: item.height,
      }));
    // AI 권장 수(기본 1)만큼 배치 — 상한은 perHeadingTarget (위에서 계산된 targetForHeading).
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
      `${LOG} 📸 "${qs.heading}": 후보 ${refined.poolSize} → 클린 ${cleanCandidates.length} → 배치 ${placed.length}`,
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
