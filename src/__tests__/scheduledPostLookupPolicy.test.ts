import { describe, expect, it } from 'vitest';

import {
  parseScheduledDate,
  selectScheduledPostCandidate,
} from '../scheduler/scheduledPostLookupPolicy';

const posts = [
  { id: 'post-1', title: '2026 꼼수장학금 신청 방법', content: 'correct' },
  { id: 'post-2', title: '2026 꼼수장학금 신청 방법 완벽 가이드', content: 'wrong' },
  { id: 'post-3', title: '전혀 다른 최신 글', content: 'newest', updatedAt: '2099-01-01' },
];

describe('scheduled post lookup policy', () => {
  it('requires an exact ID match when a usable post ID exists', () => {
    const result = selectScheduledPostCandidate(posts, 'missing-id', posts[0].title);

    expect(result.post).toBeNull();
    expect(result.reason).toBe('post-id-not-found');
  });

  it('uses only exact or normalized-equal titles when no ID exists', () => {
    expect(selectScheduledPostCandidate(posts, undefined, '2026 꼼수장학금 신청 방법').post)
      .toMatchObject({ id: 'post-1' });
    expect(selectScheduledPostCandidate(posts, '', '2026-꼼수장학금 신청방법').post)
      .toMatchObject({ id: 'post-1' });
  });

  it('never falls back to a partial or most-recent title match', () => {
    expect(selectScheduledPostCandidate(posts, undefined, '꼼수장학금').post).toBeNull();
    expect(selectScheduledPostCandidate(posts, undefined, '없는 글').post).toBeNull();
  });

  it('rejects malformed schedule dates without throwing during logging', () => {
    expect(parseScheduledDate('2026-07-11 10:05')?.toISOString())
      .toBe('2026-07-11T01:05:00.000Z');
    expect(parseScheduledDate('not-a-date')).toBeNull();
    expect(parseScheduledDate('')).toBeNull();
  });
});
