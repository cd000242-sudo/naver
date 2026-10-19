import { describe, expect, it } from 'vitest';
import { publicationCompletion, snapshotScheduledPublication, enforcePreviousPostScope, resolveDuePreviousPost } from '../main/services/previousPostBoundary.js';
import { createAppScheduledPost } from '../scheduler/appScheduleQueue.js';

describe('publication completion destination', () => {
  const payload = { postId: 'post-a', publishMode: 'publish' as const, blogId: 'old', categoryId: '7' };
  it('uses the actual URL blog and only a confirmed category', () => {
    expect(publicationCompletion({ url: 'https://blog.naver.com/actual/223123456789', publicationDestination: { blogId: 'actual', categoryId: '7' } }, payload))
      .toEqual({ postId: 'post-a', publishMode: 'publish', publicationDestination: { blogId: 'actual', categoryId: '7' } });
  });
  it('does not claim a requested category after unconfirmed category selection', () => {
    expect(publicationCompletion({ url: 'https://blog.naver.com/actual/223123456789' }, payload).publicationDestination).toEqual({ blogId: 'actual' });
  });
  it('rejects mismatched runtime destination and non-post URLs', () => {
    expect(publicationCompletion({ url: 'https://blog.naver.com/actual/223123456789', publicationDestination: { blogId: 'other', categoryId: '7' } }, payload).publicationDestination).toEqual({ blogId: 'actual' });
    expect(publicationCompletion({ url: 'https://blog.naver.com/actual' }, payload).publicationDestination).toBeUndefined();
  });
});

describe('app schedule publication scope', () => {
  it('snapshots and replays the real category and previous post without content-category substitution', () => {
    const fields = { blogId: 'actual', categoryId: '7', categoryName: '여행', ctaType: 'previous-post', previousPostUrl: 'https://blog.naver.com/actual/223123456789', previousPostTitle: 'older', previousPostCandidate: { id: 'old', publishedBlogId: 'actual', publishedCategoryId: '7' }, ctaLink: 'https://blog.naver.com/actual/223123456789', ctaText: 'older', skipCta: false };
    const post = createAppScheduledPost({ postId: 'post-a', title: 'new', scheduleDate: '2099-01-01', scheduleTime: '10:00', ...snapshotScheduledPublication(fields) });
    expect(snapshotScheduledPublication(post)).toEqual(fields);
    expect(post.status).toBe('scheduled');
  });
});


describe('main previous-post boundary', () => {
  const candidate = { id: 'older', title: 'travel', publishedUrl: 'https://blog.naver.com/actual/223123456789', publishedBlogId: 'actual', publishedCategoryId: '7', publishMode: 'publish', publishedAt: '2020-01-01T00:00:00Z' };
  it('drops a candidate when actual account/category differs, preserving a separate custom CTA', () => {
    const result = enforcePreviousPostScope({ ctaType: 'previous-post', previousPostUrl: candidate.publishedUrl, previousPostCandidate: candidate, ctaLink: candidate.publishedUrl, ctas: [{ text: 'shop', link: 'https://shop.example/product' }] }, { blogId: 'other', categoryId: '7' });
    expect(result.previousPostUrl).toBeUndefined();
    expect(result.ctaLink).toBeUndefined();
    expect(result.ctas).toEqual([{ text: 'shop', link: 'https://shop.example/product' }]);
  });
  it('accepts only matching scope and leaves no-link content alone', () => {
    expect(enforcePreviousPostScope({ ctaType: 'previous-post', previousPostCandidate: candidate }, { blogId: 'actual', categoryId: '7' }).previousPostUrl).toBe(candidate.publishedUrl);
    expect(resolveDuePreviousPost({ ctaType: 'custom', ctaLink: 'https://shop.example' }, [candidate], { blogId: 'actual', categoryId: '7' })).toEqual({ ctaType: 'custom', ctaLink: 'https://shop.example' });
  });
  it('never activates previous-post mode on an ordinary/custom CTA payload', () => {
    expect(enforcePreviousPostScope({ ctaType: 'custom', ctaLink: 'https://shop.example' }, { blogId: 'actual', categoryId: '7' })).toEqual({ ctaType: 'custom', ctaLink: 'https://shop.example' });
  });
  it('selects by automatic marker even when no local URL was available at queue time', () => {
    expect(resolveDuePreviousPost({ previousPostSelection: 'auto' }, [candidate], { blogId: 'actual', categoryId: '7' }).previousPostUrl).toBe(candidate.publishedUrl);
  });
  it('at due time picks latest matching published schedule instead of the old queued snapshot', () => {
    const newer = { ...candidate, id: 'newer', publishedUrl: 'https://blog.naver.com/actual/223123456790', publishedAt: '2021-01-01T00:00:00Z' };
    const future = { ...newer, id: 'future', publishMode: 'schedule', publishedAt: '2099-01-01T00:00:00Z' };
    const wrongCategory = { ...newer, id: 'wrong', publishedCategoryId: '8', publishedAt: '2022-01-01T00:00:00Z' };
    const result = resolveDuePreviousPost({ ctaType: 'previous-post', previousPostSelection: 'auto', previousPostUrl: candidate.publishedUrl, previousPostCandidate: candidate }, [candidate, newer, future, wrongCategory], { blogId: 'actual', categoryId: '7' });
    expect(result.previousPostUrl).toBe(newer.publishedUrl);
  });
});
