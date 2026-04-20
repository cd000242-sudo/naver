import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { compareCohort, rankFeaturesByImpact } from '../analytics/cohortAnalyzer';
import {
  recordPublish,
  __setStorageForTest as setMetaStorage,
  __clearForTest as clearMeta,
} from '../analytics/featureFlagTracker';
import {
  appendMetric,
  __setStorageForTest as setMetricsStorage,
  __clearForTest as clearMetrics,
} from '../analytics/postMetricsStore';

const now = Date.now();
const metaFile = path.join(os.tmpdir(), `cohort_meta_${now}.json`);
const metricsFile = path.join(os.tmpdir(), `cohort_metrics_${now}.json`);

beforeEach(() => {
  setMetaStorage(metaFile);
  setMetricsStorage(metricsFile);
  clearMeta();
  clearMetrics();
});

afterEach(() => {
  clearMeta();
  clearMetrics();
});

function seed(postId: string, validatorOn: boolean, views: number) {
  recordPublish({
    postId,
    publishedAt: '2026-04-20T00:00:00Z',
    featuresEnabled: validatorOn ? ['validator'] : [],
    promptVersion: 'test-v1',
    validationPassed: true,
    validationIssueCount: 0,
  });
  appendMetric({
    postId,
    checkedAt: '2026-04-22T00:00:00Z',
    views,
    likes: Math.floor(views / 20),
    comments: Math.floor(views / 50),
    source: 'manual',
  });
}

describe('compareCohort — basic join', () => {
  it('returns null averages when either cohort has no data', () => {
    seed('p-1', true, 100);
    seed('p-2', true, 200);
    const cmp = compareCohort('validator');
    expect(cmp.enabled.sampleSize).toBe(2);
    expect(cmp.disabled.sampleSize).toBe(0);
    expect(cmp.enabled.avgViews).toBe(150);
    expect(cmp.disabled.avgViews).toBeNull();
    expect(cmp.viewsDelta).toBeNull();
  });

  it('computes delta when both cohorts have data', () => {
    seed('enabled-a', true, 200);
    seed('enabled-b', true, 300);
    seed('disabled-a', false, 50);
    seed('disabled-b', false, 100);
    const cmp = compareCohort('validator');
    expect(cmp.enabled.avgViews).toBe(250);
    expect(cmp.disabled.avgViews).toBe(75);
    expect(cmp.viewsDelta).toBe(175);
  });

  it('excludes posts without a metric snapshot', () => {
    recordPublish({
      postId: 'no-metrics',
      publishedAt: '2026-04-20T00:00:00Z',
      featuresEnabled: ['validator'],
      promptVersion: 'test-v1',
      validationPassed: true,
      validationIssueCount: 0,
    });
    seed('with-metrics', true, 100);
    const cmp = compareCohort('validator');
    expect(cmp.enabled.sampleSize).toBe(1);
    expect(cmp.enabled.avgViews).toBe(100);
  });
});

describe('compareCohort — latest-per-post deduplication', () => {
  it('uses the latest snapshot when multiple exist for one post', () => {
    recordPublish({
      postId: 'dedup',
      publishedAt: '2026-04-20T00:00:00Z',
      featuresEnabled: ['validator'],
      promptVersion: 'test-v1',
      validationPassed: true,
      validationIssueCount: 0,
    });
    appendMetric({ postId: 'dedup', checkedAt: '2026-04-21T00:00:00Z', views: 50, likes: 1, comments: 0, source: 'manual' });
    appendMetric({ postId: 'dedup', checkedAt: '2026-04-23T00:00:00Z', views: 400, likes: 8, comments: 3, source: 'manual' });
    seed('baseline', false, 100);
    const cmp = compareCohort('validator');
    expect(cmp.enabled.sampleSize).toBe(1);
    expect(cmp.enabled.avgViews).toBe(400);
  });
});

describe('compareCohort — timeWindow (SEO W3)', () => {
  function seedWithPublishDate(postId: string, validatorOn: boolean, views: number, publishedAt: string, checkedAt: string, aiBriefingCited?: boolean) {
    recordPublish({
      postId,
      publishedAt,
      featuresEnabled: validatorOn ? ['validator'] : [],
      promptVersion: 'test-v1',
      validationPassed: true,
      validationIssueCount: 0,
    });
    appendMetric({
      postId,
      checkedAt,
      views,
      likes: 0,
      comments: 0,
      source: 'manual',
      aiBriefingCited,
    });
  }

  it('filters snapshots to "early" window (D+0~D+3)', () => {
    seedWithPublishDate('early-1', true, 100, '2026-04-01T00:00:00Z', '2026-04-02T00:00:00Z');
    seedWithPublishDate('late-1', true, 500, '2026-04-01T00:00:00Z', '2026-04-15T00:00:00Z');
    const cmp = compareCohort('validator', 1000, 'early');
    expect(cmp.enabled.sampleSize).toBe(1);
    expect(cmp.enabled.avgViews).toBe(100);
  });

  it('filters snapshots to "validation" window (D+7~D+14)', () => {
    seedWithPublishDate('early-2', true, 100, '2026-04-01T00:00:00Z', '2026-04-02T00:00:00Z');
    seedWithPublishDate('val-2', true, 500, '2026-04-01T00:00:00Z', '2026-04-10T00:00:00Z');
    const cmp = compareCohort('validator', 1000, 'validation');
    expect(cmp.enabled.sampleSize).toBe(1);
    expect(cmp.enabled.avgViews).toBe(500);
  });

  it('"all" window (default) includes everything', () => {
    seedWithPublishDate('any-1', true, 100, '2026-04-01T00:00:00Z', '2026-04-02T00:00:00Z');
    seedWithPublishDate('any-2', true, 500, '2026-04-01T00:00:00Z', '2026-04-30T00:00:00Z');
    const cmp = compareCohort('validator');
    expect(cmp.enabled.sampleSize).toBe(2);
  });

  it('respects explicit daysSincePublish when provided', () => {
    recordPublish({
      postId: 'explicit',
      publishedAt: '2026-04-01T00:00:00Z',
      featuresEnabled: ['validator'],
      promptVersion: 't',
      validationPassed: true,
      validationIssueCount: 0,
    });
    appendMetric({
      postId: 'explicit',
      checkedAt: '2999-01-01T00:00:00Z', // far future to prove override works
      views: 999,
      likes: 0,
      comments: 0,
      source: 'manual',
      daysSincePublish: 10, // explicit override falls in validation window
    });
    const cmp = compareCohort('validator', 1000, 'validation');
    expect(cmp.enabled.sampleSize).toBe(1);
    expect(cmp.enabled.avgViews).toBe(999);
  });
});

describe('compareCohort — AI briefing citation rate (SEO W3)', () => {
  function seedWithCitation(postId: string, validatorOn: boolean, cited: boolean) {
    recordPublish({
      postId,
      publishedAt: '2026-04-01T00:00:00Z',
      featuresEnabled: validatorOn ? ['validator'] : [],
      promptVersion: 'test-v1',
      validationPassed: true,
      validationIssueCount: 0,
    });
    appendMetric({
      postId,
      checkedAt: '2026-04-10T00:00:00Z',
      views: 100,
      likes: 0,
      comments: 0,
      source: 'manual',
      aiBriefingCited: cited,
    });
  }

  it('computes citation rate when data is present', () => {
    seedWithCitation('a', true, true);
    seedWithCitation('b', true, false);
    seedWithCitation('c', true, true);
    const cmp = compareCohort('validator');
    expect(cmp.enabled.aiBriefingCitationRate).toBeCloseTo(2 / 3, 2);
  });

  it('returns null citation rate when no metric has the flag set', () => {
    seed('plain-a', true, 100); // no aiBriefingCited
    seed('plain-b', true, 200);
    const cmp = compareCohort('validator');
    expect(cmp.enabled.aiBriefingCitationRate).toBeNull();
  });

  it('citationRateDelta is null when one side lacks data', () => {
    seedWithCitation('e-a', true, true);
    seed('d-a', false, 100);
    const cmp = compareCohort('validator');
    expect(cmp.citationRateDelta).toBeNull();
  });
});

describe('rankFeaturesByImpact', () => {
  it('sorts features with data first, by delta desc, nulls last', () => {
    seed('v-a', true, 200);
    seed('v-b', false, 100);
    const ranking = rankFeaturesByImpact(['validator', 'thumbnail_auto']);
    expect(ranking[0].feature).toBe('validator');
    expect(ranking[0].viewsDelta).toBe(100);
    expect(ranking[1].feature).toBe('thumbnail_auto');
    expect(ranking[1].viewsDelta).toBeNull();
  });

  it('returns empty-safe result when no data exists', () => {
    const ranking = rankFeaturesByImpact(['validator']);
    expect(ranking[0].enabled.sampleSize).toBe(0);
    expect(ranking[0].viewsDelta).toBeNull();
  });
});
