import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { buildRecentWinnersBlock } from '../contentRecentWinnersBlock';
import {
  appendMetric,
  __clearForTest,
  __setStorageForTest,
} from '../analytics/postMetricsStore';

const tmpFile = path.join(os.tmpdir(), `content_recent_winners_${Date.now()}.json`);

beforeEach(() => {
  __setStorageForTest(tmpFile);
  __clearForTest();
});

afterEach(() => {
  __clearForTest();
});

describe('contentRecentWinnersBlock', () => {
  it('returns an empty block when there are not enough metric samples', () => {
    appendMetric({
      postId: 'p-1',
      checkedAt: '2026-06-13T00:00:00Z',
      views: 100,
      likes: 1,
      comments: 0,
      source: 'manual',
    });

    expect(buildRecentWinnersBlock({ __previousTitleMap: { 'p-1': 'Title 1' } })).toBe('');
  });

  it('stays non-throwing when metric samples have no intro text resolver data', () => {
    for (let i = 0; i < 10; i += 1) {
      appendMetric({
        postId: `p-${i}`,
        checkedAt: '2026-06-13T00:00:00Z',
        views: 100 + i,
        likes: i,
        comments: 0,
        source: 'manual',
      });
    }

    const titles = Object.fromEntries(new Array(10).fill(0).map((_, index) => [`p-${index}`, `Title ${index}`]));

    expect(() => buildRecentWinnersBlock({ __previousTitleMap: titles })).not.toThrow();
    expect(buildRecentWinnersBlock({ __previousTitleMap: titles })).toBe('');
  });
});
