import { describe, expect, it } from 'vitest';
import { applyPreviousPostPolicy, normalizePreviousPostCategoryId, parsePreviousPostUrl, selectPreviousPost } from '../shared/previousPostPolicy';

const scope = { blogId: 'my_blog', categoryId: '12' };
const oldPost = { id: 'old', title: 'Earlier', publishedUrl: 'https://blog.naver.com/my_blog/222', publishedBlogId: 'my_blog', publishedCategoryId: '12', publishedAt: '2025-01-01T00:00:00Z', publishMode: 'publish', isPublished: true };
const latest = { ...oldPost, id: 'latest', title: 'Latest', publishedUrl: 'https://m.blog.naver.com/my_blog/333', publishedAt: '2025-02-01T00:00:00Z' };

describe('strict previous post selection', () => {
  it('normalizes only positive integer real category IDs', () => {
    expect(normalizePreviousPostCategoryId('0012')).toBe('12');
    expect(normalizePreviousPostCategoryId(12)).toBe('12');
    for (const value of ['', '게시판', '0', '-1', '1.1', '1e2', null, {}, true]) expect(normalizePreviousPostCategoryId(value)).toBeUndefined();
  });
  it('recognizes only exact Naver post URLs and rejects ambiguous destinations', () => {
    expect(parsePreviousPostUrl('https://blog.naver.com/My_Blog/222')).toEqual({ blogId: 'my_blog', postId: '222' });
    expect(parsePreviousPostUrl('https://m.blog.naver.com/PostView.naver?blogId=my_blog&logNo=222')).toEqual({ blogId: 'my_blog', postId: '222' });
    for (const url of ['javascript:alert(1)', 'https://blog.naver.com.evil.test/my_blog/222', 'https://evil@blog.naver.com/my_blog/222', 'https://blog.naver.com/my_blog', 'https://blog.naver.com/PostList.naver?blogId=my_blog&categoryNo=12', 'https://blog.naver.com/PostView.naver?blogId=my_blog&blogId=other&logNo=222', 'https://blog.naver.com/my_blog/222?blogId=other', 'https://blog.naver.com:444/my_blog/222']) expect(parsePreviousPostUrl(url)).toBeNull();
  });
  it('selects by publication time without mutating input and excludes the current post', () => {
    const posts = Object.freeze([latest, { ...oldPost, createdAt: '2030-01-01' }]);
    expect(selectPreviousPost(posts, scope)).toBe(latest);
    expect(selectPreviousPost(posts, scope, { excludePostId: 'latest' })?.id).toBe('old');
    expect(posts[0]).toBe(latest);
  });
  it.each([
    { publishedBlogId: 'other' }, { publishedUrl: 'https://blog.naver.com/other/222' },
    { publishedCategoryId: '13' }, { publishedCategoryId: undefined, category: '12' },
    { publishedBlogId: undefined, naverId: 'my_blog' }, { publishedAt: undefined },
    { publishedAt: 'bad' }, { publishedAt: '2099-01-01' }, { publishMode: 'draft' },
    { publishMode: 'schedule' }, { isPublished: false },
  ])('skips unsafe or unconfirmed history %j', (override) => {
    expect(selectPreviousPost([{ ...oldPost, ...override }], scope)).toBeNull();
  });
  it('skips unknown targets and never falls back across a category', () => {
    expect(selectPreviousPost([latest], {})).toBeNull();
    expect(selectPreviousPost([latest], { ...scope, categoryId: '13' })).toBeNull();
    expect(selectPreviousPost([latest], { ...scope, categoryId: '게시판' })).toBeNull();
  });
  it('validates explicit selection by canonical Naver post identity', () => {
    expect(selectPreviousPost([oldPost, latest], scope, { requestedUrl: 'https://m.blog.naver.com/PostView.naver?blogId=my_blog&logNo=222' })).toBe(oldPost);
    expect(selectPreviousPost([latest], scope, { requestedUrl: oldPost.publishedUrl })).toBeNull();
    expect(selectPreviousPost([latest], scope, { requestedUrl: 'https://evil.test/' })).toBeNull();
  });
  it('honors an explicit clock', () => {
    expect(selectPreviousPost([latest], scope, { now: new Date('2025-01-15') })).toBeNull();
    expect(selectPreviousPost([latest], scope, { now: NaN })).toBeNull();
  });
});

describe('previous post payload policy', () => {
  it('fills automatic previous links and records metadata without changing caller objects', () => {
    const payload = Object.freeze({ ctaType: 'previous-post' });
    expect(applyPreviousPostPolicy(payload, [latest], scope)).toMatchObject({ previousPostUrl: latest.publishedUrl, previousPostCandidate: latest, ctaUrl: latest.publishedUrl, ctaLink: latest.publishedUrl });
    expect(payload).toEqual({ ctaType: 'previous-post' });
  });
  it('clears unsafe explicitly selected previous-post CTA and stale candidate', () => {
    const payload = { ctaType: 'previous-post', previousPostUrl: oldPost.publishedUrl, previousPostTitle: 'Stale', previousPostCandidate: oldPost, ctaLink: oldPost.publishedUrl, ctaUrl: oldPost.publishedUrl, ctaText: 'Stale', ctas: [{ text: 'Stale', link: oldPost.publishedUrl }] };
    const result = applyPreviousPostPolicy(payload, [latest], scope);
    expect(result.previousPostUrl).toBeUndefined();
    expect(result.previousPostCandidate).toBeUndefined();
    expect(result.ctaLink).toBeUndefined();
    expect(result.ctaText).toBeUndefined();
    expect(result.ctas).toEqual([]);
    expect(payload.ctaLink).toBe(oldPost.publishedUrl);
  });
  it('preserves explicit custom CTA while removing unsafe previous links', () => {
    const payload = { ctaType: 'custom', previousPostUrl: oldPost.publishedUrl, ctaLink: 'https://shop.example/product', ctaText: 'Buy', ctas: [{ text: 'Buy', link: 'https://shop.example/product' }] };
    const result = applyPreviousPostPolicy(payload, [latest], scope);
    expect(result.previousPostUrl).toBeUndefined();
    expect(result.ctaLink).toBe(payload.ctaLink);
    expect(result.ctas).toBe(payload.ctas);
  });
});

describe('automatic and manual previous selection intent', () => {
  it('refreshes automatically selected candidate from newer live history', () => {
    const initial = applyPreviousPostPolicy({ ctaType: 'previous-post' }, [oldPost], scope);
    expect(initial.previousPostSelection).toBe('auto');
    expect(applyPreviousPostPolicy(initial, [oldPost, latest], scope).previousPostUrl).toBe(latest.publishedUrl);
  });
  it('never substitutes an invalid manual selection on subsequent policy passes', () => {
    const initial = applyPreviousPostPolicy({ ctaType: 'previous-post', previousPostUrl: 'https://invalid.example/x', ctaLink: 'https://invalid.example/x', ctas: [{ text: 'Old', link: 'https://invalid.example/x' }] }, [latest], scope);
    expect(initial.previousPostSelection).toBe('manual');
    expect(initial.previousPostRequestedUrl).toBe('https://invalid.example/x');
    expect(initial.ctas).toEqual([]);
    expect(applyPreviousPostPolicy(initial, [latest], scope).previousPostUrl).toBeUndefined();
  });
  it('keeps a valid manually requested older post even when newer history arrives', () => {
    const initial = applyPreviousPostPolicy({ previousPostUrl: oldPost.publishedUrl }, [oldPost], scope);
    expect(applyPreviousPostPolicy(initial, [oldPost, latest], scope).previousPostUrl).toBe(oldPost.publishedUrl);
  });
});
