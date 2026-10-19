import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executePublishing } from '../main/services/BlogExecutor.js';
import { AutomationService } from '../main/services/AutomationService.js';
import { sendStatus } from '../main/utils/ipcHelpers.js';
vi.mock('../main/utils/ipcHelpers.js', () => ({ sendLog: vi.fn(), sendStatus: vi.fn(), sendProgress: vi.fn() }));

describe('BlogExecutor publication scope handoff', () => {
  beforeEach(() => { AutomationService.resetCancelFlag(); vi.clearAllMocks(); });
  it('passes actual category and previous candidate to runtime, then returns and broadcasts confirmed destination', async () => {
    const candidate = { id: 'old', publishedUrl: 'https://blog.naver.com/blog/123', publishedBlogId: 'blog', publishedCategoryId: '7', publishMode: 'publish', publishedAt: '2020-01-01T00:00:00Z' };
    const run = vi.fn(async () => ({ success: true, url: 'https://blog.naver.com/blog/124', publicationDestination: { blogId: 'blog', categoryId: '7' } }));
    const result = await executePublishing({ run } as any, {
      postId: 'post-a', title: 'title', content: 'content', publishMode: 'publish', blogId: 'blog', categoryId: '7', categoryName: 'travel', ctaType: 'previous-post', previousPostSelection: 'auto', previousPostCandidate: candidate,
    }, []);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ blogId: 'blog', categoryId: '7', categoryName: 'travel', previousPostCandidate: candidate, previousPostSelection: 'auto' }));
    expect(result).toMatchObject({ postId: 'post-a', publishMode: 'publish', publicationDestination: { blogId: 'blog', categoryId: '7' } });
    expect(sendStatus).toHaveBeenCalledWith(expect.objectContaining({ success: true, postId: 'post-a', publicationDestination: { blogId: 'blog', categoryId: '7' } }));
  });
  it('does not invent confirmed category when runtime returns only a URL', async () => {
    const run = vi.fn(async () => ({ success: true, url: 'https://blog.naver.com/blog/124' }));
    const result = await executePublishing({ run } as any, { postId: 'post-a', title: 'title', content: 'body', categoryId: '7' }, []);
    expect(result.publicationDestination).toEqual({ blogId: 'blog' });
  });
});
