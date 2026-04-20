import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  recordPublish,
  getMetadata,
  listRecent,
  getCohortStats,
  __setStorageForTest,
  __clearForTest,
  type PostFeatureMetadata,
} from '../analytics/featureFlagTracker';

const tmpFile = path.join(os.tmpdir(), `feature_flag_log_test_${Date.now()}.json`);

beforeEach(() => {
  __setStorageForTest(tmpFile);
  __clearForTest();
});

afterEach(() => {
  __clearForTest();
});

function sample(overrides: Partial<PostFeatureMetadata> = {}): PostFeatureMetadata {
  return {
    postId: overrides.postId ?? 'post-1',
    publishedAt: overrides.publishedAt ?? '2026-04-20T10:00:00Z',
    featuresEnabled: overrides.featuresEnabled ?? ['validator'],
    promptVersion: overrides.promptVersion ?? 'homefeed-v2026.04.20',
    validationPassed: overrides.validationPassed ?? true,
    validationIssueCount: overrides.validationIssueCount ?? 0,
    notes: overrides.notes,
  };
}

describe('featureFlagTracker — record & retrieve', () => {
  it('records a new publish and retrieves it by postId', () => {
    recordPublish(sample({ postId: 'p-100' }));
    const got = getMetadata('p-100');
    expect(got).not.toBeNull();
    expect(got!.postId).toBe('p-100');
    expect(got!.featuresEnabled).toEqual(['validator']);
  });

  it('returns null for unknown postId', () => {
    expect(getMetadata('does-not-exist')).toBeNull();
  });

  it('is idempotent — repeated recordPublish overwrites the prior entry', () => {
    recordPublish(sample({ postId: 'p-200', validationIssueCount: 5 }));
    recordPublish(sample({ postId: 'p-200', validationIssueCount: 1 }));
    expect(getMetadata('p-200')!.validationIssueCount).toBe(1);
    expect(listRecent().filter((r) => r.postId === 'p-200').length).toBe(1);
  });

  it('rejects empty postId', () => {
    expect(() => recordPublish(sample({ postId: '' }))).toThrow(/postId/);
  });
});

describe('featureFlagTracker — listRecent ordering', () => {
  it('returns records sorted by publishedAt desc', () => {
    recordPublish(sample({ postId: 'older', publishedAt: '2026-04-18T00:00:00Z' }));
    recordPublish(sample({ postId: 'newer', publishedAt: '2026-04-20T00:00:00Z' }));
    const list = listRecent();
    expect(list[0].postId).toBe('newer');
    expect(list[1].postId).toBe('older');
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      recordPublish(sample({ postId: `p-${i}`, publishedAt: `2026-04-${10 + i}T00:00:00Z` }));
    }
    expect(listRecent(3).length).toBe(3);
  });
});

describe('featureFlagTracker — cohort stats', () => {
  it('returns null averages when one cohort is empty', () => {
    recordPublish(sample({ postId: 'a', featuresEnabled: ['validator'], validationIssueCount: 2 }));
    recordPublish(sample({ postId: 'b', featuresEnabled: ['validator'], validationIssueCount: 4 }));
    const stats = getCohortStats('validator');
    expect(stats.enabledCount).toBe(2);
    expect(stats.disabledCount).toBe(0);
    expect(stats.enabledAvgIssues).toBe(3);
    expect(stats.disabledAvgIssues).toBeNull();
  });

  it('computes averages for both cohorts when both have data', () => {
    recordPublish(sample({ postId: 'a', featuresEnabled: ['validator'], validationIssueCount: 2 }));
    recordPublish(sample({ postId: 'b', featuresEnabled: ['validator'], validationIssueCount: 4 }));
    recordPublish(sample({ postId: 'c', featuresEnabled: [], validationIssueCount: 8 }));
    recordPublish(sample({ postId: 'd', featuresEnabled: [], validationIssueCount: 10 }));
    const stats = getCohortStats('validator');
    expect(stats.enabledAvgIssues).toBe(3);
    expect(stats.disabledAvgIssues).toBe(9);
  });
});

describe('featureFlagTracker — storage robustness', () => {
  it('handles a missing file gracefully', () => {
    __clearForTest();
    expect(listRecent()).toEqual([]);
    expect(getCohortStats('validator').enabledCount).toBe(0);
  });

  it('handles a corrupt file by treating it as empty', () => {
    fs.writeFileSync(tmpFile, '{not valid json', 'utf-8');
    expect(listRecent()).toEqual([]);
  });
});
