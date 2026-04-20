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
}

export interface CohortComparison {
  feature: FeatureFlag;
  enabled: CohortMetricAverages;
  disabled: CohortMetricAverages;
  /** Difference in avgViews (enabled - disabled). Null when either cohort empty. */
  viewsDelta: number | null;
}

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
    }),
    { views: 0, likes: 0, comments: 0, homefeedViews: 0, searchViews: 0, homefeedCount: 0, searchCount: 0 },
  );
  return {
    sampleSize: rows.length,
    avgViews: sum.views / rows.length,
    avgLikes: sum.likes / rows.length,
    avgComments: sum.comments / rows.length,
    avgHomefeedViews: sum.homefeedCount > 0 ? sum.homefeedViews / sum.homefeedCount : null,
    avgSearchViews: sum.searchCount > 0 ? sum.searchViews / sum.searchCount : null,
  };
}

/**
 * Compare enabled vs disabled cohorts for a given feature.
 * Pulls fresh data from featureFlagTracker and postMetricsStore each call.
 */
export function compareCohort(feature: FeatureFlag, metaLimit = 1000): CohortComparison {
  const metaList = listRecentMeta(metaLimit);
  const metricsList = listLatestMetrics();
  const joined = joinMetaWithMetrics(metaList, metricsList);

  const enabledRows = joined.filter((j) => j.meta.featuresEnabled.includes(feature));
  const disabledRows = joined.filter((j) => !j.meta.featuresEnabled.includes(feature));

  const enabled = averages(enabledRows);
  const disabled = averages(disabledRows);

  const viewsDelta =
    enabled.avgViews !== null && disabled.avgViews !== null
      ? enabled.avgViews - disabled.avgViews
      : null;

  return { feature, enabled, disabled, viewsDelta };
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
