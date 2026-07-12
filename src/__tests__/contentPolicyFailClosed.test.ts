import { describe, expect, it } from 'vitest';
import { loadContentPolicy } from '../contentPolicy/policyLoader';
import { runContentPolicyPipeline } from '../contentPolicy/orchestrator';
import { makeGoodDraft, makePolicyInput, makeRecentPosts } from './contentPolicyFixtures';

describe('recent posts fail-closed policy', () => {
  it('never passes when the recent-post repository cannot be read', async () => {
    const result = await runContentPolicyPipeline({
      input: makePolicyInput({ recent_posts: undefined }),
      draft: makeGoodDraft(),
      config: await loadContentPolicy(),
      recentPostsResult: { ok: false, code: 'RECENT_POSTS_UNAVAILABLE', message: 'storage unavailable' },
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.block_reasons).toContain('BLOCK_RECENT_POSTS_UNAVAILABLE');
    expect(result.publication.manual_review_required).toBe(true);
  });

  it('does not treat fewer than 20 comparable posts as a similarity pass', async () => {
    const result = await runContentPolicyPipeline({
      input: makePolicyInput({ recent_posts: makeRecentPosts(10) }),
      draft: makeGoodDraft(),
      config: await loadContentPolicy(),
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.block_reasons).toContain('BLOCK_INSUFFICIENT_RECENT_POSTS');
  });
});
