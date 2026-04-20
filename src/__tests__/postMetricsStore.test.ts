import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import {
  appendMetric,
  listForPost,
  getLatest,
  listAll,
  listLatestPerPost,
  __setStorageForTest,
  __clearForTest,
  type PostMetricSnapshot,
} from '../analytics/postMetricsStore';

const tmpFile = path.join(os.tmpdir(), `post_metrics_test_${Date.now()}.json`);

beforeEach(() => {
  __setStorageForTest(tmpFile);
  __clearForTest();
});

afterEach(() => {
  __clearForTest();
});

function snap(overrides: Partial<PostMetricSnapshot> = {}): PostMetricSnapshot {
  return {
    postId: overrides.postId ?? 'post-1',
    checkedAt: overrides.checkedAt ?? '2026-04-20T12:00:00Z',
    views: overrides.views ?? 100,
    likes: overrides.likes ?? 5,
    comments: overrides.comments ?? 1,
    source: overrides.source ?? 'manual',
    homefeedViews: overrides.homefeedViews,
    searchViews: overrides.searchViews,
    notes: overrides.notes,
  };
}

describe('appendMetric — validation', () => {
  it('rejects missing postId', () => {
    expect(() => appendMetric(snap({ postId: '' }))).toThrow(/postId/);
  });

  it('rejects missing checkedAt', () => {
    expect(() => appendMetric(snap({ checkedAt: '' }))).toThrow(/checkedAt/);
  });

  it('rejects missing source', () => {
    expect(() => appendMetric(snap({ source: '' as any }))).toThrow(/source/);
  });

  it('rejects negative views', () => {
    expect(() => appendMetric(snap({ views: -1 }))).toThrow(/views/);
  });

  it('rejects NaN likes', () => {
    expect(() => appendMetric(snap({ likes: NaN }))).toThrow(/likes/);
  });
});

describe('appendMetric — append-only behavior', () => {
  it('keeps every snapshot of the same post (append-only)', () => {
    appendMetric(snap({ postId: 'p-1', checkedAt: '2026-04-20T00:00:00Z', views: 10 }));
    appendMetric(snap({ postId: 'p-1', checkedAt: '2026-04-21T00:00:00Z', views: 50 }));
    appendMetric(snap({ postId: 'p-1', checkedAt: '2026-04-22T00:00:00Z', views: 120 }));
    expect(listForPost('p-1')).toHaveLength(3);
  });

  it('listForPost returns snapshots sorted by checkedAt ascending', () => {
    appendMetric(snap({ postId: 'p-1', checkedAt: '2026-04-22T00:00:00Z', views: 120 }));
    appendMetric(snap({ postId: 'p-1', checkedAt: '2026-04-20T00:00:00Z', views: 10 }));
    appendMetric(snap({ postId: 'p-1', checkedAt: '2026-04-21T00:00:00Z', views: 50 }));
    const list = listForPost('p-1');
    expect(list[0].views).toBe(10);
    expect(list[1].views).toBe(50);
    expect(list[2].views).toBe(120);
  });

  it('getLatest returns the most recent snapshot', () => {
    appendMetric(snap({ postId: 'p-2', checkedAt: '2026-04-20T00:00:00Z', views: 10 }));
    appendMetric(snap({ postId: 'p-2', checkedAt: '2026-04-22T00:00:00Z', views: 200 }));
    expect(getLatest('p-2')!.views).toBe(200);
  });

  it('getLatest returns null when post has no snapshots', () => {
    expect(getLatest('never-recorded')).toBeNull();
  });
});

describe('listLatestPerPost — deduplication for cohort math', () => {
  it('returns one row per postId (the most recent)', () => {
    appendMetric(snap({ postId: 'a', checkedAt: '2026-04-20T00:00:00Z', views: 10 }));
    appendMetric(snap({ postId: 'a', checkedAt: '2026-04-22T00:00:00Z', views: 50 }));
    appendMetric(snap({ postId: 'b', checkedAt: '2026-04-21T00:00:00Z', views: 30 }));
    const latest = listLatestPerPost();
    expect(latest).toHaveLength(2);
    const a = latest.find((r) => r.postId === 'a')!;
    const b = latest.find((r) => r.postId === 'b')!;
    expect(a.views).toBe(50);
    expect(b.views).toBe(30);
  });

  it('returns empty array when no metrics recorded', () => {
    expect(listLatestPerPost()).toEqual([]);
    expect(listAll()).toEqual([]);
  });
});

describe('postMetricsStore — source tagging (security audit requirement)', () => {
  it('accepts manual source', () => {
    appendMetric(snap({ postId: 'p-1', source: 'manual' }));
    expect(getLatest('p-1')!.source).toBe('manual');
  });

  it('accepts search_advisor source', () => {
    appendMetric(snap({ postId: 'p-2', source: 'search_advisor' }));
    expect(getLatest('p-2')!.source).toBe('search_advisor');
  });
});
