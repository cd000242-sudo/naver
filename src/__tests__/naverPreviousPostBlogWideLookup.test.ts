import { describe, expect, it, vi } from 'vitest';
import {
  fetchNaverBlogWidePreviousPostCandidates,
  parseNaverBlogWidePreviousPostCandidates,
  parseNaverPreviousPostCandidates,
} from '../main/services/naverPreviousPostLookup';

const now = Date.parse('2026-11-24T01:00:00Z');
const item = { domainIdOrBlogId: 'sample_blog', logNo: 224442529695, titleWithInspectMessage: '최근 글', categoryNo: 6, addDate: Date.parse('2026-11-20T00:00:00Z'), allOpenPost: true, categoryOpenYn: true, postBlocked: false, sympathyCnt: 12, commentCnt: 3, shareCnt: 1, readCount: null };

describe('engagement counts on previous-post candidates', () => {
  it('reads likes and comments from the same-category list', () => {
    const [candidate] = parseNaverPreviousPostCandidates({ isSuccess: true, result: { categoryNo: 6, items: [item] } }, { blogId: 'sample_blog', categoryId: '6' }, now);
    expect(candidate).toMatchObject({ sympathyCount: 12, commentCount: 3 });
  });
  it('uses zero when counts are missing or not numbers', () => {
    const [candidate] = parseNaverPreviousPostCandidates({ isSuccess: true, result: { categoryNo: 6, items: [{ ...item, sympathyCnt: '12', commentCnt: null }] } }, { blogId: 'sample_blog', categoryId: '6' }, now);
    expect(candidate).toMatchObject({ sympathyCount: 0, commentCount: 0 });
  });
});

describe('blog-wide previous-post lookup', () => {
  const body = (items: unknown[]) => ({ isSuccess: true, result: { categoryNo: 0, items } });

  it('keeps each item with its actual category id', () => {
    const posts = parseNaverBlogWidePreviousPostCandidates(body([item, { ...item, logNo: 2, categoryNo: 9 }]), 'sample_blog', now);
    expect(posts.map(p => p.publishedCategoryId)).toEqual(['6', '9']);
    expect(posts[1]).toMatchObject({
      publishedUrl: 'https://blog.naver.com/sample_blog/2', publishedBlogId: 'sample_blog',
      publishMode: 'publish', isPublished: true, sympathyCount: 12, commentCount: 3,
    });
  });

  it.each([{ domainIdOrBlogId: 'other' }, { allOpenPost: false }, { categoryOpenYn: false }, { postBlocked: true }, { notOpen: true }, { buddyOpen: true }, { bothBuddyOpen: true }, { categoryBlockYn: true }, { addDate: now + 1000 }, { categoryNo: null }, { logNo: '../evil' }])('excludes unsafe item %j', override => {
    expect(parseNaverBlogWidePreviousPostCandidates(body([{ ...item, ...override }]), 'sample_blog', now)).toEqual([]);
  });

  it('does not require the response category to match', () => {
    expect(parseNaverBlogWidePreviousPostCandidates({ isSuccess: true, result: { items: [item] } }, 'sample_blog', now)).toHaveLength(1);
    expect(() => parseNaverBlogWidePreviousPostCandidates({ isSuccess: false }, 'sample_blog', now)).toThrow('PREVIOUS_POST_RESPONSE_INVALID');
  });

  it('requests category 0 for at most two pages', async () => {
    const full = Array.from({ length: 30 }, (_, i) => ({ ...item, logNo: 1000 + i }));
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => body(full) });
    const posts = await fetchNaverBlogWidePreviousPostCandidates('sample_blog', { fetchImpl, now });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://m.blog.naver.com/api/blogs/sample_blog/post-list?categoryNo=0&itemCount=30&page=1');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('page=2');
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('error');
    expect(posts).toHaveLength(60);
  });

  it('stops after a short page and rejects unknown blog ids without network', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => body([item]) });
    await expect(fetchNaverBlogWidePreviousPostCandidates('sample_blog', { fetchImpl, now })).resolves.toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const none = vi.fn();
    await expect(fetchNaverBlogWidePreviousPostCandidates('../evil', { fetchImpl: none })).resolves.toEqual([]);
    expect(none).not.toHaveBeenCalled();
  });

  it('surfaces HTTP failures to the caller', async () => {
    await expect(fetchNaverBlogWidePreviousPostCandidates('sample_blog', { fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503 }) })).rejects.toThrow('PREVIOUS_POST_HTTP_503');
  });
});
