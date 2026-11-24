import { describe, expect, it, vi } from 'vitest';
import { refreshRuntimePreviousPost } from '../automation/previousPostRuntimePolicy.js';

const editor = ['https://blog.naver.com/my_blog?Redirect=Write'];
const at = (days: number) => new Date(Date.parse('2026-11-20T00:00:00Z') - days * 86400000).toISOString();
const post = (no: number, title: string, extra: Record<string, unknown> = {}) => ({
  id: `naver:my_blog:${no}`, title, publishedUrl: `https://blog.naver.com/my_blog/${no}`,
  publishedBlogId: 'my_blog', publishedCategoryId: '7', publishedAt: at(no),
  publishMode: 'publish', isPublished: true, ...extra,
});
const sameCategory = [post(1, '점심 메뉴'), post(2, '아이폰 배터리 교체'), post(3, '아이폰 케이스'), post(4, '등산 코스', { sympathyCount: 30 })];
const base = { categoryId: '7', categoryName: '일상', title: '아이폰 배터리 성능', previousPostSelection: 'auto' };

describe('runtime previous-post cards', () => {
  it('keeps a single card when no extra card sources are given', async () => {
    const result = await refreshRuntimePreviousPost({ ...base, ctaType: 'previous-post' }, editor, async () => sameCategory);
    expect(result.previousPostCards).toEqual([{ url: result.previousPostUrl, title: result.previousPostTitle }]);
    expect(result.previousPostUrl).toBe('https://blog.naver.com/my_blog/1');
  });

  it('attaches three cards and keeps the legacy fields on the first card', async () => {
    const result: any = await refreshRuntimePreviousPost({ ...base, ctaType: 'previous-post' }, editor, async () => sameCategory, undefined, undefined, {
      lookupBlogWide: async () => [post(9, '아이폰 충전기', { publishedCategoryId: '8' })],
      readRecentCardUrls: () => [],
    });
    expect(result.previousPostCards.map((c: any) => c.url)).toEqual([
      'https://blog.naver.com/my_blog/2', 'https://blog.naver.com/my_blog/3', 'https://blog.naver.com/my_blog/4',
    ]);
    expect(result.previousPostUrl).toBe('https://blog.naver.com/my_blog/2');
    expect(result.previousPostTitle).toBe('아이폰 배터리 교체');
    expect(result.previousPostCandidate.publishedUrl).toBe('https://blog.naver.com/my_blog/2');
    // CTA keeps following the first previous-post card.
    expect(result.ctaLink).toBe('https://blog.naver.com/my_blog/2');
    expect(result.ctas).toEqual([{ text: '📖 추천 글: 아이폰 배터리 교체', link: 'https://blog.naver.com/my_blog/2' }]);
  });

  it('avoids cards attached to recent posts', async () => {
    // Two fresh same-category posts plus one fresh post elsewhere are enough to skip both recent cards.
    const result: any = await refreshRuntimePreviousPost(base, editor, async () => sameCategory, undefined, undefined, {
      lookupBlogWide: async () => [post(9, '여행', { publishedCategoryId: '8' })],
      readRecentCardUrls: () => ['https://blog.naver.com/my_blog/2', 'https://blog.naver.com/my_blog/4'],
    });
    const urls = result.previousPostCards.map((c: any) => c.url);
    expect(urls).not.toContain('https://blog.naver.com/my_blog/2');
    expect(urls).not.toContain('https://blog.naver.com/my_blog/4');
    expect(urls[0]).toBe(result.previousPostUrl);
    expect(urls).toContain('https://blog.naver.com/my_blog/9');
  });

  it('reuses the least recently attached card when fresh candidates run out', async () => {
    const result: any = await refreshRuntimePreviousPost(base, editor, async () => sameCategory, undefined, undefined, {
      lookupBlogWide: async () => [],
      readRecentCardUrls: () => ['https://blog.naver.com/my_blog/2', 'https://blog.naver.com/my_blog/4'],
    });
    expect(result.previousPostCards.map((c: any) => c.url)).toEqual([
      'https://blog.naver.com/my_blog/3', 'https://blog.naver.com/my_blog/1', 'https://blog.naver.com/my_blog/4',
    ]);
  });

  it('continues with same-category cards when the blog-wide lookup fails', async () => {
    const log = vi.fn();
    const result: any = await refreshRuntimePreviousPost(base, editor, async () => sameCategory, log, undefined, {
      lookupBlogWide: async () => { throw new Error('offline'); },
      readRecentCardUrls: () => { throw new Error('broken'); },
    });
    expect(result.previousPostCards).toHaveLength(3);
  });

  it('keeps the manual choice first and fills the rest from fresh lookups', async () => {
    const manual = post(1, '점심 메뉴');
    const lookup = vi.fn(async () => sameCategory);
    const result: any = await refreshRuntimePreviousPost({
      ...base, blogId: 'my_blog', previousPostSelection: 'manual',
      previousPostRequestedUrl: manual.publishedUrl, previousPostUrl: manual.publishedUrl, previousPostCandidate: manual,
    }, editor, lookup, undefined, undefined, { lookupBlogWide: async () => [], readRecentCardUrls: () => [] });
    expect(result.previousPostUrl).toBe(manual.publishedUrl);
    expect(result.previousPostCards[0].url).toBe(manual.publishedUrl);
    expect(result.previousPostCards).toHaveLength(3);
  });

  it('never carries cards from another blog or an upstream payload', async () => {
    const result: any = await refreshRuntimePreviousPost({
      ...base, previousPostCards: [{ url: 'https://blog.naver.com/other/1', title: 'x' }],
    }, editor, async () => sameCategory, undefined, undefined, {
      lookupBlogWide: async () => [post(9, '아이폰', { publishedUrl: 'https://blog.naver.com/other/9', publishedBlogId: 'other' })],
      readRecentCardUrls: () => [],
    });
    expect(result.previousPostCards.every((c: any) => c.url.startsWith('https://blog.naver.com/my_blog/'))).toBe(true);
  });

  it('drops cards when no previous post is linked', async () => {
    const result: any = await refreshRuntimePreviousPost({ ...base, previousPostCards: [{ url: 'https://blog.naver.com/my_blog/1' }] }, editor, async () => [], undefined, undefined, {
      lookupBlogWide: async () => sameCategory, readRecentCardUrls: () => [],
    });
    expect(result.previousPostUrl).toBeUndefined();
    expect(result).not.toHaveProperty('previousPostCards');
  });

  it('keeps the verified single card when the same-category lookup fails', async () => {
    const candidate = post(1, '점심 메뉴');
    const result: any = await refreshRuntimePreviousPost({ ...base, previousPostCandidate: candidate, previousPostUrl: candidate.publishedUrl }, editor, async () => { throw new Error('offline'); }, undefined, undefined, {
      lookupBlogWide: async () => sameCategory, readRecentCardUrls: () => [],
    });
    expect(result.previousPostCards).toEqual([{ url: candidate.publishedUrl, title: '점심 메뉴' }]);
  });
});
