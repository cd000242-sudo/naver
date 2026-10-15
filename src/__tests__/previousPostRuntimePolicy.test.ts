import { describe, expect, it } from 'vitest';
import { refreshRuntimePreviousPost, guardRuntimePreviousPost, matchPublicationCategory, readEditorBlogId, verifyCategorySelection } from '../automation/previousPostRuntimePolicy.js';

const candidate = { title: '이전 글', publishedBlogId: 'my_blog', publishedCategoryId: '7', publishedUrl: 'https://blog.naver.com/my_blog/123', publishedAt: '2026-01-01T00:00:00Z', publishMode: 'publish', isPublished: true };
const payload = { categoryId: '7', categoryName: '여행', ctaType: 'previous-post', previousPostUrl: candidate.publishedUrl, ctaLink: candidate.publishedUrl, previousPostCandidate: candidate };
describe('runtime previous-post boundary', () => {
  it('accepts only the verified editor blog and exact category', () => {
    expect(guardRuntimePreviousPost(payload, ['https://blog.naver.com/PostWriteForm.naver?blogId=my_blog']).previousPostUrl).toBe(candidate.publishedUrl);
    expect(guardRuntimePreviousPost(payload, ['https://blog.naver.com/PostWriteForm.naver?blogId=other']).previousPostUrl).toBeUndefined();
    expect(guardRuntimePreviousPost({ ...payload, categoryId: '8' }, ['https://blog.naver.com/my_blog?Redirect=Write']).ctaLink).toBeUndefined();
  });
  it('rejects missing or conflicting editor identities and preserves custom CTA', () => {
    expect(readEditorBlogId(['about:blank'])).toBeUndefined();
    expect(readEditorBlogId(['https://blog.naver.com/PostWriteForm.naver?blogId=my_blog', 'https://blog.naver.com/PostWriteForm.naver?blogId=other'])).toBeUndefined();
    expect(readEditorBlogId(['https://evil.com/?blogId=my_blog'])).toBeUndefined();
    expect(guardRuntimePreviousPost({ ...payload, ctaType: 'custom', ctaLink: 'https://example.com' }, ['about:blank']).ctaLink).toBe('https://example.com');
  });
  it('does not infer categories from labels or accept partial names', () => {
    expect(matchPublicationCategory('7', '여행', { id: '8', name: '여행' })).toBe(false);
    expect(matchPublicationCategory('7', '여행', { name: '여행' })).toBe(false);
    expect(matchPublicationCategory('7', '여행', { id: '7', name: '여행' })).toBe(true);
    expect(matchPublicationCategory(undefined, '여행', { id: '7', name: '해외여행' })).toBe(false);
    expect(matchPublicationCategory(undefined, '여행', { id: '7', name: '└ 여행' })).toBe(true);
  });
  it('stamps only a selected numeric DOM identity with matching label', () => {
    expect(verifyCategorySelection('7', '여행', '여행')).toBe('7');
    expect(verifyCategorySelection('7', '여행', '해외여행')).toBeUndefined();
    expect(verifyCategorySelection(undefined, '여행', '여행')).toBeUndefined();
  });
});

describe('first-run live previous-post lookup', () => {
  it('looks up the editor-confirmed blog before typing when backend identity was unknown', async () => {
    const actual = await refreshRuntimePreviousPost({ ...payload, previousPostSelection: 'auto', previousPostCandidate: undefined }, ['https://blog.naver.com/my_blog?Redirect=Write'], async scope => {
      expect(scope).toEqual({ blogId: 'my_blog', categoryId: '7' });
      return [candidate];
    });
    expect(actual.previousPostUrl).toBe(candidate.publishedUrl);
  });
  it('does not fetch again for the already-resolved blog and preserves manual choice', async () => {
    const actual = await refreshRuntimePreviousPost({ ...payload, blogId: 'my_blog', previousPostSelection: 'manual', previousPostRequestedUrl: candidate.publishedUrl }, ['https://blog.naver.com/my_blog?Redirect=Write'], async () => { throw new Error('must not fetch'); });
    expect(actual.previousPostUrl).toBe(candidate.publishedUrl);
  });
  it('keeps only verified fallback on lookup failure and does not look up unknown category', async () => {
    const actual = await refreshRuntimePreviousPost(payload, ['https://blog.naver.com/my_blog?Redirect=Write'], async () => { throw new Error('offline'); });
    expect(actual.previousPostUrl).toBe(candidate.publishedUrl);
    expect(actual.ctaLink).toBe(candidate.publishedUrl);
    const unknown = await refreshRuntimePreviousPost({ ...payload, categoryId: undefined }, ['https://blog.naver.com/my_blog?Redirect=Write'], async () => { throw new Error('must not fetch'); });
    expect(unknown.previousPostUrl).toBeUndefined();
  });
});

describe('runtime identity malformed inputs', () => {
  it('rejects repeated blog IDs, credential URLs and nonnumeric category IDs', () => {
    expect(readEditorBlogId(['https://blog.naver.com/PostWriteForm.naver?blogId=my_blog&blogId=other'])).toBeUndefined();
    expect(readEditorBlogId(['https://user@blog.naver.com/PostWriteForm.naver?blogId=my_blog'])).toBeUndefined();
    expect(readEditorBlogId(['https://blog.naver.com/PostWriteForm.naver?blogId=bad%20blog'])).toBeUndefined();
    expect(readEditorBlogId(['https://blog.naver.com/'])).toBeUndefined();
    expect(matchPublicationCategory('travel', '여행', { id: '7', name: '여행' })).toBe(false);
  });
  it('skips live history lookup when no previous-post linking was requested', async () => {
    const result = await refreshRuntimePreviousPost({ categoryName: '여행', categoryId: '7' }, ['https://blog.naver.com/my_blog?Redirect=Write'], async () => { throw new Error('must not fetch'); });
    expect(result).not.toHaveProperty('previousPostUrl');
  });
});

describe('pre-typing freshness', () => {
  it('refreshes automatic selection even for the known same blog', async () => {
    const latest = { ...candidate, publishedUrl: 'https://blog.naver.com/my_blog/124', publishedAt: '2026-02-01T00:00:00Z' };
    const actual = await refreshRuntimePreviousPost({ ...payload, blogId: 'my_blog', previousPostSelection: 'auto' }, ['https://blog.naver.com/my_blog?Redirect=Write'], async () => [candidate, latest]);
    expect(actual.previousPostUrl).toBe(latest.publishedUrl);
    expect(actual.ctaLink).toBe(latest.publishedUrl);
  });
  it('drops fallback metadata from another blog on network failure without stopping publication', async () => {
    const actual = await refreshRuntimePreviousPost({ ...payload, blogId: 'my_blog', previousPostSelection: 'auto' }, ['https://blog.naver.com/other?Redirect=Write'], async () => { throw new Error('offline'); });
    expect(actual.previousPostUrl).toBeUndefined();
    expect(actual.ctaLink).toBeUndefined();
  });
});

describe('legacy actual category name resolution', () => {
  it('resolves a missing ID on the verified editor blog before fetching candidates', async () => {
    const actual = await refreshRuntimePreviousPost({ ...payload, categoryId: undefined, previousPostSelection: 'auto' }, ['https://blog.naver.com/my_blog?Redirect=Write'], async scope => {
      expect(scope).toEqual({ blogId: 'my_blog', categoryId: '7' });
      return [candidate];
    }, () => undefined, async (scope, name) => {
      expect(scope.blogId).toBe('my_blog');
      expect(name).toBe('여행');
      return '7';
    });
    expect(actual.categoryId).toBe('7');
    expect(actual.previousPostUrl).toBe(candidate.publishedUrl);
  });
  it('keeps publication possible but omits links if category lookup fails', async () => {
    const actual = await refreshRuntimePreviousPost({ ...payload, categoryId: undefined, previousPostSelection: 'auto' }, ['https://blog.naver.com/my_blog?Redirect=Write'], async () => { throw new Error('must not fetch'); }, () => undefined, async () => { throw new Error('offline'); });
    expect(actual.previousPostUrl).toBeUndefined();
    expect(actual.categoryName).toBe('여행');
  });
});

describe('public index delay', () => {
  it('keeps the newer verified just-published candidate while the API still returns the old post', async () => {
    const justPublished = { ...candidate, publishedUrl: 'https://blog.naver.com/my_blog/124', publishedAt: '2026-02-01T00:00:00Z' };
    const actual = await refreshRuntimePreviousPost({ ...payload, previousPostCandidate: justPublished, previousPostSelection: 'auto' }, ['https://blog.naver.com/my_blog?Redirect=Write'], async () => [candidate]);
    expect(actual.previousPostUrl).toBe(justPublished.publishedUrl);
  });
  it('does not let a newer cached candidate from another category override a fresh eligible post', async () => {
    const wrongCategory = { ...candidate, publishedCategoryId: '8', publishedUrl: 'https://blog.naver.com/my_blog/124', publishedAt: '2026-02-01T00:00:00Z' };
    const actual = await refreshRuntimePreviousPost({ ...payload, previousPostCandidate: wrongCategory, previousPostSelection: 'auto' }, ['https://blog.naver.com/my_blog?Redirect=Write'], async () => [candidate]);
    expect(actual.previousPostUrl).toBe(candidate.publishedUrl);
  });
});
