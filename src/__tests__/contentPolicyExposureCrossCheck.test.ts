import { describe, expect, it, vi } from 'vitest';
import { runExposureCrossChecks } from '../contentPolicy/exposureCrossChecker';

const target = {
  articleId: 'article-1',
  title: 'Exact published title',
  keyword: 'primary keyword',
  blogId: 'my-blog',
  logNo: '12345',
  url: 'https://blog.naver.com/my-blog/12345',
};

describe('exposure cross checker', () => {
  it('runs URL, exact-title, and integrated-search checks as distinct methods', async () => {
    const fetchFn = vi.fn(async () => new Response(
      '<html><title>Exact published title</title><body>my-blog 12345</body></html>',
      { status: 200 },
    ));
    const searchFn = vi.fn(async (query: string) => ({
      checkedAt: '2026-07-12T00:00:00.000Z',
      searchedKeyword: query,
      position: query === target.title ? 2 : null,
      hasSmartblock: false,
      fetchSuccess: true,
    }));

    const checks = await runExposureCrossChecks(target, {
      fetchFn,
      searchFn,
      now: () => new Date('2026-07-12T00:00:00.000Z'),
    });

    expect(checks.map((check) => check.method)).toEqual([
      'url_access',
      'exact_title_search',
      'blog_search_tab',
      'integrated_search',
    ]);
    expect(checks.map((check) => check.outcome)).toEqual(['FOUND', 'FOUND', 'FOUND', 'NOT_FOUND']);
    expect(searchFn).toHaveBeenNthCalledWith(1, target.title, target.blogId, target.logNo);
    expect(searchFn).toHaveBeenNthCalledWith(2, target.keyword, target.blogId, target.logNo);
  });

  it('records infrastructure failures as ERROR instead of false missing evidence', async () => {
    const checks = await runExposureCrossChecks(target, {
      fetchFn: vi.fn(async () => { throw new Error('network down'); }),
      searchFn: vi.fn(async (query: string) => ({
        checkedAt: '2026-07-12T00:00:00.000Z',
        searchedKeyword: query,
        position: null,
        hasSmartblock: false,
        fetchSuccess: false,
        notes: 'timeout',
      })),
      now: () => new Date('2026-07-12T00:00:00.000Z'),
    });

    expect(checks.every((check) => check.outcome === 'ERROR')).toBe(true);
  });

  it('does not fetch an arbitrary URL from stored exposure metadata', async () => {
    const requestedUrls: string[] = [];
    const checks = await runExposureCrossChecks({
      ...target,
      url: 'https://attacker.example/internal',
    }, {
      fetchFn: vi.fn(async (url: string | URL | Request) => {
        requestedUrls.push(String(url));
        return new Response('', { status: 200 });
      }) as typeof fetch,
      searchFn: vi.fn(async (query: string) => ({
        checkedAt: '2026-07-12T00:00:00.000Z', searchedKeyword: query,
        position: null, hasSmartblock: false, fetchSuccess: true,
      })),
    });

    expect(checks[0]).toMatchObject({ method: 'url_access', outcome: 'ERROR' });
    expect(requestedUrls.every((url) => !url.includes('attacker.example'))).toBe(true);
  });
});
