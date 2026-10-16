import { describe, expect, it, vi } from 'vitest';
import { fetchNaverPreviousPostCandidates, parseNaverPreviousPostCandidates } from '../main/services/naverPreviousPostLookup';
import { selectPreviousPost } from '../shared/previousPostPolicy';
const scope = { blogId: 'sample_blog', categoryId: '6' };
const item = { domainIdOrBlogId: 'sample_blog', logNo: 224442529695, titleWithInspectMessage: '가장 최근 글', categoryNo: 6, addDate: Date.parse('2026-10-15T00:00:00Z'), allOpenPost: true, categoryOpenYn: true, postBlocked: false };
const body = (items: unknown[] = [item]) => ({ isSuccess: true, result: { categoryNo: 6, items } });
const now = Date.parse('2026-10-15T01:00:00Z');
describe('authoritative same-category Naver previous-post lookup', () => {
  it('finds the actual newest public post without any local app history', () => {
    const posts = parseNaverPreviousPostCandidates(body([{ ...item, logNo: 222, addDate: now - 86400000 }, item]), scope, now);
    expect(selectPreviousPost(posts, scope, { now })?.publishedUrl).toBe('https://blog.naver.com/sample_blog/224442529695');
    expect(posts[1]).toMatchObject({ publishedBlogId: 'sample_blog', publishedCategoryId: '6', publishMode: 'publish', isPublished: true });
  });
  it.each([{ categoryNo: 7 }, { domainIdOrBlogId: 'other' }, { allOpenPost: false }, { categoryOpenYn: false }, { postBlocked: true }, { notOpen: true }, { buddyOpen: true }, { bothBuddyOpen: true }, { categoryBlockYn: true }, { addDate: now + 1000 }, { addDate: 'yesterday' }, { logNo: '../evil' }])('excludes unsafe or other-category item %j', override => {
    expect(parseNaverPreviousPostCandidates(body([{ ...item, ...override }]), scope, now)).toEqual([]);
  });
  it('does not trust a response that ignored the requested category', () => {
    expect(() => parseNaverPreviousPostCandidates({ isSuccess: true, result: { categoryNo: 0, items: [item] } }, scope, now)).toThrow('PREVIOUS_POST_RESPONSE_INVALID');
    expect(() => parseNaverPreviousPostCandidates({}, scope, now)).toThrow();
  });
  it('rejects unknown scope without making network requests', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchNaverPreviousPostCandidates({ blogId: '../evil', categoryId: '6' }, { fetchImpl })).resolves.toEqual([]);
    await expect(fetchNaverPreviousPostCandidates({ blogId: 'sample_blog', categoryId: '0' }, { fetchImpl })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('requests exact blog/category fresh on every publish and uses a bounded timeout', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => body() });
    await fetchNaverPreviousPostCandidates(scope, { fetchImpl, now });
    await fetchNaverPreviousPostCandidates(scope, { fetchImpl, now });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://m.blog.naver.com/api/blogs/sample_blog/post-list?categoryNo=6&itemCount=30&page=1');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.redirect).toBe('error');
  });
  it('surfaces lookup failure for caller logging and verified-local fallback', async () => {
    await expect(fetchNaverPreviousPostCandidates(scope, { fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503 }) })).rejects.toThrow('PREVIOUS_POST_HTTP_503');
  });
  it('retains a verified just-published local candidate when Naver indexing is delayed', () => {
    const publicPosts = parseNaverPreviousPostCandidates(body(), scope, now);
    const local = { ...publicPosts[0], publishedUrl: 'https://blog.naver.com/sample_blog/224442529999', publishedAt: new Date(now - 1).toISOString() };
    expect(selectPreviousPost([...publicPosts, local], scope, { now })).toBe(local);
  });
});
import { resolveNaverPreviousPostCategoryId } from '../main/services/naverPreviousPostLookup';

describe('legacy actual category name resolution', () => {
  const categoryFetch = (categories: unknown[]) => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isSuccess: true, result: { mylogCategoryList: categories } }) });
  it('resolves a unique actual name using the destination blog category list', async () => {
    const fetchImpl = categoryFetch([{ categoryNo: 6, categoryName: '연예 이슈', openYN: true }]);
    await expect(resolveNaverPreviousPostCategoryId({ blogId: 'sample_blog' }, ' └ 연예 이슈', { fetchImpl })).resolves.toBe('6');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://m.blog.naver.com/api/blogs/sample_blog/category-list');
  });
  it('never guesses ambiguous names, partial names, or closed categories', async () => {
    const fetchImpl = categoryFetch([{ categoryNo: 6, categoryName: '이슈' }, { categoryNo: 7, categoryName: '이슈' }, { categoryNo: 8, categoryName: '비공개', openYN: false }]);
    await expect(resolveNaverPreviousPostCategoryId({ blogId: 'sample_blog' }, '이슈', { fetchImpl })).resolves.toBeUndefined();
    await expect(resolveNaverPreviousPostCategoryId({ blogId: 'sample_blog' }, '이', { fetchImpl })).resolves.toBeUndefined();
    await expect(resolveNaverPreviousPostCategoryId({ blogId: 'sample_blog' }, '비공개', { fetchImpl })).resolves.toBeUndefined();
  });
  it('retains verified numeric IDs and avoids unknown blog/name requests', async () => {
    const fetchImpl = vi.fn();
    await expect(resolveNaverPreviousPostCategoryId(scope, 'any', { fetchImpl })).resolves.toBe('6');
    await expect(resolveNaverPreviousPostCategoryId({}, '이슈', { fetchImpl })).resolves.toBeUndefined();
    await expect(resolveNaverPreviousPostCategoryId({ blogId: 'sample_blog' }, '', { fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('finds nested board categories and deduplicates the same ID', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isSuccess: true, result: { boardCategoryList: [{ categoryNo: 1, categoryName: '부모', childCategoryList: [{ categoryNo: 6, categoryName: '대상' }] }], mylogCategoryList: [{ categoryNo: 6, categoryName: '대상' }] } }) });
    await expect(resolveNaverPreviousPostCategoryId({ blogId: 'sample_blog' }, '대상', { fetchImpl })).resolves.toBe('6');
  });
  it('reports API errors rather than treating them as an empty category', async () => {
    await expect(resolveNaverPreviousPostCategoryId({ blogId: 'sample_blog' }, '대상', { fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 500 }) })).rejects.toThrow('PREVIOUS_CATEGORY_HTTP_500');
    await expect(resolveNaverPreviousPostCategoryId({ blogId: 'sample_blog' }, '대상', { fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isSuccess: false }) }) })).rejects.toThrow('PREVIOUS_CATEGORY_RESPONSE_INVALID');
  });
});

describe('parent category pagination', () => {
  it('continues past child-category posts to find the latest exact parent-category post', async () => {
    const children = Array.from({ length: 30 }, (_, i) => ({ ...item, logNo: 300 + i, categoryNo: 7 }));
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => body(children) }).mockResolvedValueOnce({ ok: true, json: async () => body() });
    const posts = await fetchNaverPreviousPostCandidates(scope, { fetchImpl, now });
    expect(posts).toHaveLength(1);
    expect(fetchImpl.mock.calls[1][0]).toContain('page=2');
    expect(fetchImpl.mock.calls[0][1].signal).toBe(fetchImpl.mock.calls[1][1].signal);
  });
});


describe('existing history lookup recovery', () => {
  it('rechecks an initially empty response before declaring a category empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => body([]) })
      .mockResolvedValueOnce({ ok: true, json: async () => body() });
    const posts = await fetchNaverPreviousPostCandidates(scope, { fetchImpl, now });
    expect(posts[0]?.publishedUrl).toBe('https://blog.naver.com/sample_blog/224442529695');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('recovers from a transient failed public index without local history', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ ok: true, json: async () => body() });
    await expect(fetchNaverPreviousPostCandidates(scope, { fetchImpl, now })).resolves.toHaveLength(1);
  });
  it('does not turn a failed empty-response confirmation into no previous posts', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => body([]) })
      .mockRejectedValue(new TypeError('offline'));
    await expect(fetchNaverPreviousPostCandidates(scope, { fetchImpl, now })).rejects.toThrow('offline');
  });
  it('confirms a genuinely new category is empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => body([]) });
    await expect(fetchNaverPreviousPostCandidates(scope, { fetchImpl, now })).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('retries category API failure when restoring a legacy category name', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ isSuccess: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ isSuccess: true, result: { mylogCategoryList: [{ categoryNo: 6, categoryName: '축구', openYN: true }] } }) });
    await expect(resolveNaverPreviousPostCategoryId({ blogId: 'sample_blog' }, '축구', { fetchImpl })).resolves.toBe('6');
  });
});


describe('bounded parent-category discovery cannot report a false empty history', () => {
  const children = Array.from({ length: 30 }, (_, i) => ({ ...item, logNo: 300 + i, categoryNo: 7 }));
  it('preserves a lookup-limit error after both ten-page searches contain only child-category posts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => body(children) });
    await expect(fetchNaverPreviousPostCandidates(scope, { fetchImpl, now })).rejects.toThrow('PREVIOUS_POST_LOOKUP_LIMIT');
    expect(fetchImpl).toHaveBeenCalledTimes(20);
  });
  it('does not treat a page-two failure after child posts as an empty parent category', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('page=2')) throw new Error('second page timeout');
      return { ok: true, json: async () => body(children) } as Response;
    });
    await expect(fetchNaverPreviousPostCandidates(scope, { fetchImpl, now })).rejects.toThrow('second page timeout');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
