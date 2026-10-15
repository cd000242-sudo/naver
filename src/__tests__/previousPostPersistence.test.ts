/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from 'vitest';
import { _invalidatePostsCache, loadGeneratedPosts, copyGeneratedPost, saveGeneratedPost, updatePostAfterPublish } from '../renderer/modules/postManager';
import { GENERATED_POSTS_KEY } from '../renderer/utils/postStorageUtils';

const initial = { id: 'p1', title: 'Original', content: 'Text', hashtags: [], headings: [], createdAt: '2025-01-01', naverId: 'login_owner' };
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('naver_blog_posts_migration_global_done', 'true');
  localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify([initial, { ...initial, id: 'p2' }]));
  document.body.innerHTML = '';
  Object.assign(globalThis, { currentPostId: null, generatedImages: [], ImageManager: { getAllImages: () => [] }, UnifiedDOMCache: { getRealCategory: () => '' }, appendLog: () => undefined, readUnifiedCtasFromUi: () => [] });
  _invalidatePostsCache();
});

describe('publication destination persistence', () => {
  it('stores actual URL blog and captured category without mutating loaded records', () => {
    const before = loadGeneratedPosts();
    updatePostAfterPublish('p1', 'https://blog.naver.com/actual_blog/123', 'publish', { blogId: 'actual_blog', categoryId: '007', publishedAt: '2025-02-01T00:00:00Z' });
    const after = loadGeneratedPosts();
    expect(after[0]).toMatchObject({ publishedBlogId: 'actual_blog', publishedCategoryId: '7', publishedAt: '2025-02-01T00:00:00.000Z', isPublished: true, publishMode: 'publish', naverId: 'login_owner' });
    expect(before[0].publishedUrl).toBeUndefined();
    expect(after[1]).toEqual(before[1]);
  });
  it.each(['draft', 'schedule'] as const)('never marks %s as a public candidate', (mode) => {
    updatePostAfterPublish('p1', 'https://blog.naver.com/actual_blog/123', mode, { blogId: 'actual_blog', categoryId: '7' });
    expect(loadGeneratedPosts()[0]).toMatchObject({ isPublished: false, publishMode: mode });
    expect(loadGeneratedPosts()[0].publishedCategoryId).toBeUndefined();
    expect(loadGeneratedPosts()[0].publishedAt).toBeUndefined();
  });
  it('does not stamp a category from mismatching account or legacy name', () => {
    updatePostAfterPublish('p1', 'https://blog.naver.com/actual_blog/123', 'publish', { blogId: 'other_blog', categoryId: '7' });
    expect(loadGeneratedPosts()[0].publishedCategoryId).toBeUndefined();
    updatePostAfterPublish('p1', 'https://blog.naver.com/actual_blog/123', 'publish', { blogId: 'actual_blog', categoryId: '게시판' });
    expect(loadGeneratedPosts()[0].publishedCategoryId).toBeUndefined();
  });
  it('preserves verified publication metadata when editing the saved article', () => {
    updatePostAfterPublish('p1', 'https://blog.naver.com/actual_blog/123', 'publish', { blogId: 'actual_blog', categoryId: '7' });
    saveGeneratedPost({ _postId: 'p1', selectedTitle: 'Edited', bodyPlain: 'Edited content', headings: [], hashtags: [] }, true);
    expect(loadGeneratedPosts().find(post => post.id === 'p1')).toMatchObject({ publishedBlogId: 'actual_blog', publishedCategoryId: '7', isPublished: true, publishMode: 'publish' });
  });
});

describe('duplicate publication completion', () => {
  it('retains verified metadata and original time for a repeated completion without destination', () => {
    updatePostAfterPublish('p1', 'https://blog.naver.com/actual_blog/123', 'publish', { blogId: 'actual_blog', categoryId: '7', publishedAt: '2025-02-01' });
    updatePostAfterPublish('p1', 'https://m.blog.naver.com/PostView.naver?blogId=actual_blog&logNo=123', 'publish');
    expect(loadGeneratedPosts()[0]).toMatchObject({ publishedBlogId: 'actual_blog', publishedCategoryId: '7', publishedAt: '2025-02-01T00:00:00.000Z' });
  });
  it('clears old category for a different URL or explicit invalid destination', () => {
    updatePostAfterPublish('p1', 'https://blog.naver.com/actual_blog/123', 'publish', { blogId: 'actual_blog', categoryId: '7' });
    updatePostAfterPublish('p1', 'https://blog.naver.com/actual_blog/456', 'publish');
    expect(loadGeneratedPosts()[0].publishedCategoryId).toBeUndefined();
    updatePostAfterPublish('p1', 'https://blog.naver.com/actual_blog/456', 'publish', { blogId: 'actual_blog', categoryId: '7' });
    updatePostAfterPublish('p1', 'https://blog.naver.com/actual_blog/456', 'publish', { blogId: 'wrong_blog', categoryId: '7' });
    expect(loadGeneratedPosts()[0].publishedCategoryId).toBeUndefined();
  });
});

it('does not make an unpublished copy a previous-post candidate', () => {
  Object.assign(globalThis, { alert: () => undefined });
  updatePostAfterPublish('p1', 'https://blog.naver.com/actual_blog/123', 'publish', { blogId: 'actual_blog', categoryId: '7' });
  copyGeneratedPost('p1');
  const copied = loadGeneratedPosts().find(post => post.title === 'Original (복사본)');
  expect(copied).toBeDefined();
  expect(copied?.publishedUrl).toBeUndefined();
  expect(copied?.publishedBlogId).toBeUndefined();
  expect(copied?.publishedCategoryId).toBeUndefined();
  expect(copied?.isPublished).toBe(false);
});