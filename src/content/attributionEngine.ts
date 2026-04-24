/**
 * [v2.0.0 LDF Phase 6 — L7 Revenue Attribution + Feedback Learning]
 *
 * 실측 수익 귀속 + 자동 학습 루프. LDF 로드맵의 마지막 레이어.
 *
 * 철학: 앞선 모든 레이어(L0~L5)는 "예측·추정" 기반. 본 모듈은 "실측" 기반.
 *        실제 포스팅에 UTM 심고 → 수익 추적 → 상위 10% 패턴 추출 →
 *        L2(CTR 훅)·L4(언어 DNA)·L3(스케줄)에 자동 피드백.
 *
 * 3단 구조:
 *  1. UTM 주입 및 포스팅 메타 저장 (발행 시점)
 *  2. 외부 수익 데이터 수집 (쿠팡·제휴사 CPS 대시보드 → CSV/API 수집)
 *  3. 상관 분석 → 패턴 추출 → 엔진 파라미터 자동 튜닝
 *
 * 주의: 본 모듈은 **데이터 구조 + 분석 알고리즘**만 제공. 실제 UTM 삽입과
 *       외부 API 연동은 publisher·crawler 레이어에서 수행.
 */

import type { CTRCategory } from './ctrCombat.js';

// ═══════════════════════════════════════════════════════════════════
// 1. Post Attribution — 포스팅 메타 + 실측 수익 매핑
// ═══════════════════════════════════════════════════════════════════

export interface PostAttribution {
  postId: string;
  accountId: string;
  publishedAt: number;           // 타임스탬프 ms
  category: CTRCategory;
  primaryKeyword: string;
  title: string;
  contentMode: 'seo' | 'homefeed' | 'traffic-hunter' | 'affiliate' | 'business' | 'custom';
  toneStyle: string;
  imageEngine: string;
  thumbnailScore?: number;       // CTR Combat 채점
  titleScore?: number;           // 제목 CTR 예측 점수
  utmTag: string;                // utm_source=blog&utm_post={postId}

  // 실측 지표 (발행 후 데이터 수집)
  metrics?: {
    impressions?: number;        // 홈판 노출
    clicks?: number;             // 포스팅 진입
    readTimeSec?: number;        // 평균 체류시간
    scraps?: number;             // 스크랩 수
    comments?: number;
    outboundClicks?: number;     // 제휴 링크 클릭
    conversions?: number;        // 실제 구매 건수
    revenue?: number;            // 수익 (원)
    measuredAt?: number;         // 측정 시점
  };
}

/**
 * [v2.0.0] UTM 태그 생성
 * 포스팅ID를 링크에 심어 수익 역추적 가능하게
 */
export function generateUTMTag(postId: string, accountId: string, linkType: 'affiliate' | 'cta' | 'outro' = 'affiliate'): string {
  const timestamp = Date.now().toString(36);
  return `utm_source=bln&utm_medium=blog&utm_campaign=${accountId}&utm_content=${linkType}&utm_term=${postId}&utm_id=${timestamp}`;
}

/**
 * [v2.0.0] 기존 링크에 UTM 추가 (쿼리 파라미터 병합)
 */
export function appendUTMToLink(url: string, utmTag: string): string {
  if (!url || !url.startsWith('http')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${utmTag}`;
}

// ═══════════════════════════════════════════════════════════════════
// 2. 성과 지표 집계 및 상위 10% 추출
// ═══════════════════════════════════════════════════════════════════

export interface PerformanceTier {
  tier: 'top10' | 'top25' | 'middle' | 'bottom';
  revenue: number;
  ctr: number;
  cvr: number;
}

/**
 * [v2.0.0] 포스팅의 성과 티어 판정
 * 수익 기준 + CTR 기준 복합
 */
export function classifyPostPerformance(
  post: PostAttribution,
  allPosts: PostAttribution[],
): PerformanceTier {
  const revenue = post.metrics?.revenue || 0;
  const impressions = post.metrics?.impressions || 1;
  const clicks = post.metrics?.clicks || 0;
  const conversions = post.metrics?.conversions || 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;

  // 전체 포스팅 수익 분포
  const sortedRevenues = allPosts
    .map(p => p.metrics?.revenue || 0)
    .sort((a, b) => b - a);

  const top10Threshold = sortedRevenues[Math.floor(sortedRevenues.length * 0.1)] || 0;
  const top25Threshold = sortedRevenues[Math.floor(sortedRevenues.length * 0.25)] || 0;
  const medianThreshold = sortedRevenues[Math.floor(sortedRevenues.length * 0.5)] || 0;

  let tier: PerformanceTier['tier'];
  if (revenue >= top10Threshold && top10Threshold > 0) tier = 'top10';
  else if (revenue >= top25Threshold && top25Threshold > 0) tier = 'top25';
  else if (revenue >= medianThreshold) tier = 'middle';
  else tier = 'bottom';

  return { tier, revenue, ctr, cvr };
}

// ═══════════════════════════════════════════════════════════════════
// 3. 패턴 추출 — 상위 10% 공통점
// ═══════════════════════════════════════════════════════════════════

export interface WinnerPattern {
  sampleSize: number;
  commonCategories: { category: CTRCategory; share: number }[];
  commonTones: { tone: string; share: number }[];
  commonModes: { mode: string; share: number }[];
  commonImageEngines: { engine: string; share: number }[];
  commonHours: { hour: number; share: number }[];     // 발행 시간대
  commonDayOfWeek: { day: number; share: number }[];  // 요일
  avgTitleLength: number;
  avgTitleScore: number;
  avgThumbnailScore: number;
  topKeywords: { keyword: string; count: number }[];
}

/**
 * [v2.0.0] 상위 10% 포스팅의 공통 패턴 추출
 * 이 패턴을 다른 레이어에 자동 피드백해 엔진 파라미터 조정
 */
export function extractWinnerPatterns(allPosts: PostAttribution[]): WinnerPattern {
  // 1. 성과 티어 판정
  const scored = allPosts.map(p => ({
    post: p,
    perf: classifyPostPerformance(p, allPosts),
  }));
  const winners = scored.filter(s => s.perf.tier === 'top10').map(s => s.post);

  if (winners.length === 0) {
    return {
      sampleSize: 0,
      commonCategories: [],
      commonTones: [],
      commonModes: [],
      commonImageEngines: [],
      commonHours: [],
      commonDayOfWeek: [],
      avgTitleLength: 0,
      avgTitleScore: 0,
      avgThumbnailScore: 0,
      topKeywords: [],
    };
  }

  // 2. 분포 집계 헬퍼
  const countShare = <T extends string | number>(values: T[]): { value: T; share: number }[] => {
    const counts = new Map<T, number>();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    const total = values.length;
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, share: Math.round((count / total) * 1000) / 10 }))
      .sort((a, b) => b.share - a.share);
  };

  const byCategory = countShare(winners.map(w => w.category));
  const byTone = countShare(winners.map(w => w.toneStyle));
  const byMode = countShare(winners.map(w => w.contentMode));
  const byEngine = countShare(winners.map(w => w.imageEngine));
  const byHour = countShare(winners.map(w => new Date(w.publishedAt).getHours()));
  const byDow = countShare(winners.map(w => new Date(w.publishedAt).getDay()));

  // 3. 평균값
  const titleLens = winners.map(w => w.title.length);
  const avgTitleLength = Math.round(titleLens.reduce((a, b) => a + b, 0) / titleLens.length);
  const titleScores = winners.filter(w => typeof w.titleScore === 'number').map(w => w.titleScore!);
  const avgTitleScore = titleScores.length > 0
    ? Math.round(titleScores.reduce((a, b) => a + b, 0) / titleScores.length)
    : 0;
  const thumbScores = winners.filter(w => typeof w.thumbnailScore === 'number').map(w => w.thumbnailScore!);
  const avgThumbnailScore = thumbScores.length > 0
    ? Math.round(thumbScores.reduce((a, b) => a + b, 0) / thumbScores.length)
    : 0;

  // 4. 상위 키워드
  const kwCount = new Map<string, number>();
  for (const w of winners) {
    if (w.primaryKeyword) kwCount.set(w.primaryKeyword, (kwCount.get(w.primaryKeyword) || 0) + 1);
  }
  const topKeywords = Array.from(kwCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([keyword, count]) => ({ keyword, count }));

  return {
    sampleSize: winners.length,
    commonCategories: byCategory.map(x => ({ category: x.value as CTRCategory, share: x.share })),
    commonTones: byTone.map(x => ({ tone: x.value as string, share: x.share })),
    commonModes: byMode.map(x => ({ mode: x.value as string, share: x.share })),
    commonImageEngines: byEngine.map(x => ({ engine: x.value as string, share: x.share })),
    commonHours: byHour.map(x => ({ hour: x.value as number, share: x.share })),
    commonDayOfWeek: byDow.map(x => ({ day: x.value as number, share: x.share })),
    avgTitleLength,
    avgTitleScore,
    avgThumbnailScore,
    topKeywords,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 4. 자동 피드백 — 엔진 파라미터 튜닝 제안
// ═══════════════════════════════════════════════════════════════════

export interface TuningRecommendation {
  targetLayer: 'L2' | 'L3' | 'L4' | 'L5';
  parameter: string;
  currentValue?: string;
  recommendedValue: string;
  reasoning: string;
  confidence: 'low' | 'medium' | 'high';
  sampleBasis: number;
}

/**
 * [v2.0.0] 패턴 → 각 엔진 레이어로 튜닝 제안 자동 생성
 */
export function generateTuningRecommendations(pattern: WinnerPattern): TuningRecommendation[] {
  const recommendations: TuningRecommendation[] = [];

  if (pattern.sampleSize < 10) {
    return [{
      targetLayer: 'L4',
      parameter: 'sampleSize',
      recommendedValue: '더 많은 실측 데이터 필요',
      reasoning: `현재 상위 10% 샘플 ${pattern.sampleSize}건 < 10건 — 튜닝 권고 신뢰도 낮음`,
      confidence: 'low',
      sampleBasis: pattern.sampleSize,
    }];
  }

  // L2 (CTR) 튜닝
  if (pattern.avgTitleLength > 0) {
    const zoneLow = Math.max(25, pattern.avgTitleLength - 3);
    const zoneHigh = Math.min(42, pattern.avgTitleLength + 3);
    recommendations.push({
      targetLayer: 'L2',
      parameter: 'titleGoldenZone',
      currentValue: '28~35',
      recommendedValue: `${zoneLow}~${zoneHigh}`,
      reasoning: `상위 10% 평균 제목 길이 ${pattern.avgTitleLength}자 — 골든존 ±3자로 재조정 권장`,
      confidence: 'high',
      sampleBasis: pattern.sampleSize,
    });
  }

  // L3 (스케줄) 튜닝
  if (pattern.commonHours.length > 0 && pattern.commonHours[0].share >= 25) {
    const peakHours = pattern.commonHours.filter(h => h.share >= 10).map(h => h.hour);
    recommendations.push({
      targetLayer: 'L3',
      parameter: 'peakHours',
      recommendedValue: peakHours.join(','),
      reasoning: `상위 10% 중 ${pattern.commonHours[0].share}%가 ${pattern.commonHours[0].hour}시 발행 — PEAK_HOURS 재튜닝 대상`,
      confidence: 'high',
      sampleBasis: pattern.sampleSize,
    });
  }

  // L4 (정체성) 튜닝
  if (pattern.commonTones.length > 0 && pattern.commonTones[0].share >= 40) {
    recommendations.push({
      targetLayer: 'L4',
      parameter: 'preferredTone',
      recommendedValue: pattern.commonTones[0].tone,
      reasoning: `상위 10%의 ${pattern.commonTones[0].share}%가 ${pattern.commonTones[0].tone} 톤 — 기본값 변경 고려`,
      confidence: 'medium',
      sampleBasis: pattern.sampleSize,
    });
  }

  // 이미지 엔진 튜닝
  if (pattern.commonImageEngines.length > 0 && pattern.commonImageEngines[0].share >= 50) {
    recommendations.push({
      targetLayer: 'L2',
      parameter: 'imageEngine',
      recommendedValue: pattern.commonImageEngines[0].engine,
      reasoning: `상위 10%의 ${pattern.commonImageEngines[0].share}%가 ${pattern.commonImageEngines[0].engine} 엔진 사용 — 우선 엔진으로 고정`,
      confidence: 'high',
      sampleBasis: pattern.sampleSize,
    });
  }

  // 카테고리 튜닝 (L5 관련)
  if (pattern.commonCategories.length > 0 && pattern.commonCategories[0].share >= 40) {
    recommendations.push({
      targetLayer: 'L5',
      parameter: 'primaryCategory',
      recommendedValue: pattern.commonCategories[0].category,
      reasoning: `상위 10%의 ${pattern.commonCategories[0].share}%가 ${pattern.commonCategories[0].category} — 주 카테고리 집중 강화`,
      confidence: 'high',
      sampleBasis: pattern.sampleSize,
    });
  }

  return recommendations;
}

// ═══════════════════════════════════════════════════════════════════
// 5. 실측 리포트 빌더 — 대시보드 위젯용
// ═══════════════════════════════════════════════════════════════════

export interface RevenueAttributionReport {
  period: { from: number; to: number };
  totalPosts: number;
  postsWithRevenue: number;
  totalRevenue: number;
  topPostsByRevenue: PostAttribution[];  // 상위 10개
  categoryRevenue: { category: CTRCategory; revenue: number; postCount: number }[];
  dailyRevenueTrend: { date: string; revenue: number }[];
  winnerPattern: WinnerPattern;
  tuningRecommendations: TuningRecommendation[];
}

/**
 * [v2.0.0] 기간별 수익 귀속 리포트
 */
export function buildAttributionReport(
  posts: PostAttribution[],
  fromMs: number,
  toMs: number,
): RevenueAttributionReport {
  const filtered = posts.filter(p => p.publishedAt >= fromMs && p.publishedAt <= toMs);
  const withRevenue = filtered.filter(p => (p.metrics?.revenue || 0) > 0);
  const totalRevenue = withRevenue.reduce((s, p) => s + (p.metrics?.revenue || 0), 0);

  // 상위 10개
  const topPostsByRevenue = [...withRevenue]
    .sort((a, b) => (b.metrics?.revenue || 0) - (a.metrics?.revenue || 0))
    .slice(0, 10);

  // 카테고리별
  const catMap = new Map<CTRCategory, { revenue: number; count: number }>();
  for (const p of filtered) {
    const existing = catMap.get(p.category) || { revenue: 0, count: 0 };
    existing.revenue += p.metrics?.revenue || 0;
    existing.count += 1;
    catMap.set(p.category, existing);
  }
  const categoryRevenue = Array.from(catMap.entries())
    .map(([category, { revenue, count }]) => ({ category, revenue, postCount: count }))
    .sort((a, b) => b.revenue - a.revenue);

  // 일별 트렌드
  const dayMap = new Map<string, number>();
  for (const p of withRevenue) {
    const date = new Date(p.publishedAt).toISOString().substring(0, 10);
    dayMap.set(date, (dayMap.get(date) || 0) + (p.metrics?.revenue || 0));
  }
  const dailyRevenueTrend = Array.from(dayMap.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 패턴 + 튜닝
  const winnerPattern = extractWinnerPatterns(filtered);
  const tuningRecommendations = generateTuningRecommendations(winnerPattern);

  return {
    period: { from: fromMs, to: toMs },
    totalPosts: filtered.length,
    postsWithRevenue: withRevenue.length,
    totalRevenue,
    topPostsByRevenue,
    categoryRevenue,
    dailyRevenueTrend,
    winnerPattern,
    tuningRecommendations,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 6. 실측 데이터 저장소 인터페이스 (영구 저장용 계약)
// ═══════════════════════════════════════════════════════════════════

export interface AttributionStore {
  savePost(post: PostAttribution): Promise<void>;
  updateMetrics(postId: string, metrics: PostAttribution['metrics']): Promise<void>;
  getPosts(fromMs: number, toMs: number): Promise<PostAttribution[]>;
  getPost(postId: string): Promise<PostAttribution | null>;
}

/**
 * [v2.0.0] LocalStorage 기반 간이 저장소 (MVP용)
 * 향후 SQLite 또는 외부 DB로 교체 가능하도록 인터페이스 분리
 */
export class LocalStorageAttributionStore implements AttributionStore {
  private readonly key: string;

  constructor(namespace: string = 'attribution') {
    this.key = `ldf_${namespace}_posts`;
  }

  private load(): PostAttribution[] {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(this.key) : null;
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private save(posts: PostAttribution[]): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.key, JSON.stringify(posts));
      }
    } catch {
      /* 저장 실패 무시 */
    }
  }

  async savePost(post: PostAttribution): Promise<void> {
    const all = this.load();
    const idx = all.findIndex(p => p.postId === post.postId);
    if (idx >= 0) all[idx] = post;
    else all.push(post);
    this.save(all);
  }

  async updateMetrics(postId: string, metrics: PostAttribution['metrics']): Promise<void> {
    const all = this.load();
    const idx = all.findIndex(p => p.postId === postId);
    if (idx >= 0) {
      all[idx] = {
        ...all[idx],
        metrics: { ...all[idx].metrics, ...metrics, measuredAt: Date.now() },
      };
      this.save(all);
    }
  }

  async getPosts(fromMs: number, toMs: number): Promise<PostAttribution[]> {
    return this.load().filter(p => p.publishedAt >= fromMs && p.publishedAt <= toMs);
  }

  async getPost(postId: string): Promise<PostAttribution | null> {
    return this.load().find(p => p.postId === postId) || null;
  }
}
