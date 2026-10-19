// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { getVerifiedRealBlogCategoryId, markRealBlogCategoryOption } from '../renderer/utils/realBlogCategoryPolicy';
import { captureRendererPublicationScope, resolveRendererPublicationScope, resolveRendererPreviousPostPayload } from '../renderer/utils/previousPostScope';

describe('renderer actual publication scope', () => {
  beforeEach(() => { document.body.innerHTML = ''; (window as any).currentMainAccountPublicationScope = null; });
  function category(id: string, verified = true) {
    const select = document.createElement('select'); select.id = 'real-blog-category-select';
    const option = document.createElement('option'); option.value = id; option.text = '같은 이름';
    if (verified) markRealBlogCategoryOption(option, id);
    select.append(option); document.body.append(select); return select;
  }
  it('uses a numeric ID only from a verified real blog option', () => {
    expect(getVerifiedRealBlogCategoryId(category('12'))).toBe('12');
    expect(getVerifiedRealBlogCategoryId(category('12', false))).toBeUndefined();
    expect(getVerifiedRealBlogCategoryId(category('food_recipe'))).toBeUndefined();
  });
  it('keeps an explicit queue destination instead of replacing it with current UI', () => {
    category('99');
    expect(resolveRendererPublicationScope({ blogId: 'queueblog', categoryId: '12' })).toEqual({ blogId: 'queueblog', categoryId: '12' });
  });
  it('does not fill an explicit queue destination from an unrelated UI category', () => {
    category('99');
    expect(resolveRendererPublicationScope({ blogId: 'queueblog' })).toEqual({ blogId: 'queueblog', categoryId: undefined });
    expect(resolveRendererPublicationScope({ blogId: undefined, categoryId: undefined })).toEqual({ blogId: undefined, categoryId: undefined });
  });
  it('does not treat content category or category name as actual ID', () => {
    expect(resolveRendererPublicationScope({ naverId: 'login', category: '12', categoryName: '요리' })).toEqual({ blogId: 'login', categoryId: undefined });
  });
  it('binds the known blog identity to the matching login account', () => {
    (window as any).currentMainAccountPublicationScope = { blogId: 'actualblog', naverId: 'login' };
    expect(resolveRendererPublicationScope({ naverId: 'login' }).blogId).toBe('actualblog');
    expect(resolveRendererPublicationScope({ naverId: 'other' }).blogId).toBe('other');
  });
  it('captures destination immutably before the UI changes', () => {
    const select = category('12'); const input = { naverId: 'login', category: 'food_recipe' };
    const captured = captureRendererPublicationScope(input);
    select.options[0].dataset.realBlogCategoryId = '99';
    expect(captured).toMatchObject({ categoryId: '12', category: 'food_recipe', blogId: 'login' });
    expect(input).not.toHaveProperty('categoryId');
  });
});

describe('renderer previous-post handoff', () => {
  const saved = { id: 'p1', title: '같은 카테고리', publishedUrl: 'https://blog.naver.com/myblog/123', publishedBlogId: 'myblog', publishedCategoryId: '12', publishedAt: '2026-01-01T00:00:00Z', publishMode: 'publish', isPublished: true };
  it('validates requested links and carries the evidence to the backend', () => {
    const result = resolveRendererPreviousPostPayload({ blogId: 'myblog', categoryId: '12', ctaType: 'previous-post', previousPostUrl: saved.publishedUrl }, () => [saved]);
    expect(result.previousPostCandidate).toEqual(saved);
    expect(result.previousPostUrl).toBe(saved.publishedUrl);
  });
  it('removes a previously selected cross-category link before IPC', () => {
    const result = resolveRendererPreviousPostPayload({ blogId: 'myblog', categoryId: '99', ctaType: 'previous-post', ctaLink: saved.publishedUrl, previousPostUrl: saved.publishedUrl }, () => [saved]);
    expect(result.previousPostUrl).toBeUndefined();
    expect(result.ctaLink).toBeUndefined();
  });
  it('clears stale links if history cannot be loaded, preserving custom CTA', () => {
    const result = resolveRendererPreviousPostPayload({ blogId: 'myblog', categoryId: '12', ctaType: 'custom', ctaLink: 'https://example.com', previousPostUrl: saved.publishedUrl }, () => { throw new Error('corrupt history'); });
    expect(result.previousPostUrl).toBeUndefined();
    expect(result.ctaLink).toBe('https://example.com');
  });
});
