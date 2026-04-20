/**
 * Cohort analyzer — join featureFlagTracker (publish metadata) with
 * postMetricsStore (performance snapshots) to answer the question:
 *
 *   "Did enabling feature X actually improve reach?"
 *
 * The join key is postId. Posts without a metric snapshot are excluded —
 * you cannot compare cohorts on data that does not exist yet.
 *
 * Small-sample note:
 * With N < 5 per cohort, the averages are noise. Callers MUST show
 * `sampleSize` alongside the deltas so users see when they are over-fitting
 * to a handful of posts. This module does not apply statistical tests
 * itself — that belongs in a UI layer where it can be explained.
 */

import {
  listRecent as listRecentMeta,
  type PostFeatureMetadata,
  type FeatureFlag,
} from './featureFlagTracker.js';
import {
  listLatestPerPost as listLatestMetrics,
  type PostMetricSnapshot,
} from './postMetricsStore.js';

export interface CohortMetricAverages {
  sampleSize: number;
  avgViews: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  avgHomefeedViews: number | null;
  avgSearchViews: number | null;
  /**
   * ✅ [2026-04-20 SPEC-SEO-100 W3] AI 브리핑 인용율 (0~1).
   * null = 수집 데이터 부재. 0 = 아무도 인용되지 않음.
   */
  aiBriefingCitationRate: number | null;
}

export interface CohortComparison {
  feature: FeatureFlag;
  enabled: CohortMetricAverages;
  disabled: CohortMetricAverages;
  /** Difference in avgViews (enabled - disabled). Null when either cohort empty. */
  viewsDelta: number | null;
  /** ✅ [2026-04-20 SPEC-SEO-100 W3] AI 브리핑 인용율 차이 (enabled - disabled). */
  citationRateDelta: number | null;
}

/**
 * ✅ [2026-04-20 SPEC-SEO-100 W3] 시간 윈도우 필터 옵션.
 * - 'early': D+0 ~ D+3 (발행 직후 초기 반응)
 * - 'validation': D+7 ~ D+14 (SEO 검증 루프 완료 직후)
 * - 'all': 제한 없음 (기본값)
 */
export type TimeWindow = 'early' | 'validation' | 'all';

function joinMetaWithMetrics(
  metaList: PostFeatureMetadata[],
  metricsList: PostMetricSnapshot[],
): Array<{ meta: PostFeatureMetadata; metrics: PostMetricSnapshot }> {
  const metricsByPostId = new Map<string, PostMetricSnapshot>();
  for (const m of metricsList) metricsByPostId.set(m.postId, m);

  const result: Array<{ meta: PostFeatureMetadata; metrics: PostMetricSnapshot }> = [];
  for (const meta of metaList) {
    const metrics = metricsByPostId.get(meta.postId);
    if (metrics) result.push({ meta, metrics });
  }
  return result;
}

function averages(
  rows: Array<{ meta: PostFeatureMetadata; metrics: PostMetricSnapshot }>,
): CohortMetricAverages {
  if (rows.length === 0) {
    return {
      sampleSize: 0,
      avgViews: null,
      avgLikes: null,
      avgComments: null,
      avgHomefeedViews: null,
      avgSearchViews: null,
      aiBriefingCitationRate: null,
    };
  }
  const sum = rows.reduce(
    (acc, r) => ({
      views: acc.views + r.metrics.views,
      likes: acc.likes + r.metrics.likes,
      comments: acc.comments + r.metrics.comments,
      homefeedViews: acc.homefeedViews + (r.metrics.homefeedViews ?? 0),
      searchViews: acc.searchViews + (r.metrics.searchViews ?? 0),
      homefeedCount: acc.homefeedCount + (r.metrics.homefeedViews !== undefined ? 1 : 0),
      searchCount: acc.searchCount + (r.metrics.searchViews !== undefined ? 1 : 0),
      citations: acc.citations + (r.metrics.aiBriefingCited === true ? 1 : 0),
      citationEligible: acc.citationEligible + (r.metrics.aiBriefingCited !== undefined ? 1 : 0),
    }),
    { views: 0, likes: 0, comments: 0, homefeedViews: 0, searchViews: 0, homefeedCount: 0, searchCount: 0, citations: 0, citationEligible: 0 },
  );
  return {
    sampleSize: rows.length,
    avgViews: sum.views / rows.length,
    avgLikes: sum.likes / rows.length,
    avgComments: sum.comments / rows.length,
    avgHomefeedViews: sum.homefeedCount > 0 ? sum.homefeedViews / sum.homefeedCount : null,
    avgSearchViews: sum.searchCount > 0 ? sum.searchViews / sum.searchCount : null,
    aiBriefingCitationRate: sum.citationEligible > 0 ? sum.citations / sum.citationEligible : null,
  };
}

function daysBetween(earlierIso: string, laterIso: string): number {
  const MS_PER_DAY = 86400000;
  const diff = new Date(laterIso).getTime() - new Date(earlierIso).getTime();
  return Math.floor(diff / MS_PER_DAY);
}

function passesTimeWindow(
  meta: PostFeatureMetadata,
  metrics: PostMetricSnapshot,
  window: TimeWindow,
): boolean {
  if (window === 'all') return true;
  const days = metrics.daysSincePublish ?? daysBetween(meta.publishedAt, metrics.checkedAt);
  if (window === 'early') return days >= 0 && days <= 3;
  if (window === 'validation') return days >= 7 && days <= 14;
  return true;
}

/**
 * Compare enabled vs disabled cohorts for a given feature.
 * Pulls fresh data from featureFlagTracker and postMetricsStore each call.
 *
 * ✅ [2026-04-20 SPEC-SEO-100 W3] timeWindow 옵션으로 발행 이후 특정 기간의
 * 스냅샷만 집계 가능. SEO 2주 검증 루프는 window='validation' (D+7~D+14).
 */
export function compareCohort(
  feature: FeatureFlag,
  metaLimit = 1000,
  window: TimeWindow = 'all',
): CohortComparison {
  const metaList = listRecentMeta(metaLimit);
  const metricsList = listLatestMetrics();
  const joined = joinMetaWithMetrics(metaList, metricsList).filter((j) =>
    passesTimeWindow(j.meta, j.metrics, window),
  );

  const enabledRows = joined.filter((j) => j.meta.featuresEnabled.includes(feature));
  const disabledRows = joined.filter((j) => !j.meta.featuresEnabled.includes(feature));

  const enabled = averages(enabledRows);
  const disabled = averages(disabledRows);

  const viewsDelta =
    enabled.avgViews !== null && disabled.avgViews !== null
      ? enabled.avgViews - disabled.avgViews
      : null;

  const citationRateDelta =
    enabled.aiBriefingCitationRate !== null && disabled.aiBriefingCitationRate !== null
      ? enabled.aiBriefingCitationRate - disabled.aiBriefingCitationRate
      : null;

  return { feature, enabled, disabled, viewsDelta, citationRateDelta };
}

/**
 * Rank features by viewsDelta. Features with insufficient data (either
 * cohort empty) are pushed to the end and receive a null delta.
 */
export function rankFeaturesByImpact(features: FeatureFlag[]): CohortComparison[] {
  return features
    .map((f) => compareCohort(f))
    .sort((a, b) => {
      if (a.viewsDelta === null && b.viewsDelta === null) return 0;
      if (a.viewsDelta === null) return 1;
      if (b.viewsDelta === null) return -1;
      return b.viewsDelta - a.viewsDelta;
    });
}
