import {
  checkPostExposure,
  type ExposureCheckResult as SearchExposureResult,
} from '../analytics/exposureChecker.js';
import type { ExposureCheck, ExposureOutcome } from './types.js';

export interface ExposureCrossCheckTarget {
  articleId: string;
  title: string;
  keyword: string;
  blogId: string;
  logNo: string;
  url: string;
}

export interface ExposureCrossCheckDependencies {
  fetchFn?: typeof fetch;
  searchFn?: (
    query: string,
    blogId: string,
    logNo: string,
  ) => Promise<SearchExposureResult>;
  now?: () => Date;
  timeoutMs?: number;
  integratedResult?: SearchExposureResult;
}

function checkedAt(now: () => Date): string {
  const value = now();
  return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString();
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function searchOutcome(result: SearchExposureResult): ExposureOutcome {
  if (!result.fetchSuccess) return 'ERROR';
  return result.position === null ? 'NOT_FOUND' : 'FOUND';
}

async function checkUrlAccess(
  target: ExposureCrossCheckTarget,
  fetchFn: typeof fetch,
  now: () => Date,
  timeoutMs: number,
): Promise<ExposureCheck> {
  const base: Omit<ExposureCheck, 'outcome'> = {
    method: 'url_access',
    checked_at: checkedAt(now),
  };
  let targetUrl: URL;
  try {
    targetUrl = new URL(target.url);
  } catch {
    return { ...base, outcome: 'ERROR', details: 'Post URL is unavailable or invalid.' };
  }
  const pathParts = targetUrl.pathname.split('/').filter(Boolean);
  if (targetUrl.protocol !== 'https:'
    || targetUrl.hostname.toLocaleLowerCase() !== 'blog.naver.com'
    || normalized(pathParts[0] || '') !== normalized(target.blogId)
    || pathParts[1] !== target.logNo) {
    return { ...base, outcome: 'ERROR', details: 'Post URL is outside the allowed Naver blog target.' };
  }

  try {
    const signal = typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
    const response = await fetchFn(targetUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      },
    });
    if (response.status === 404 || response.status === 410) {
      return { ...base, outcome: 'NOT_FOUND', details: `HTTP ${response.status}` };
    }
    if (!response.ok) {
      return { ...base, outcome: 'ERROR', details: `HTTP ${response.status}` };
    }

    const body = await response.text();
    const normalizedBody = normalized(body);
    const normalizedTitle = normalized(target.title);
    const identityMatched = Boolean(
      (target.logNo && normalizedBody.includes(normalized(target.logNo)))
      || (normalizedTitle && normalizedBody.includes(normalizedTitle)),
    );
    return identityMatched
      ? { ...base, outcome: 'FOUND', details: `HTTP ${response.status}; target identity matched` }
      : { ...base, outcome: 'ERROR', details: `HTTP ${response.status}; target identity could not be verified` };
  } catch (error) {
    return { ...base, outcome: 'ERROR', details: (error as Error).message };
  }
}

async function checkSearch(
  method: 'exact_title_search' | 'integrated_search',
  query: string,
  target: ExposureCrossCheckTarget,
  searchFn: ExposureCrossCheckDependencies['searchFn'] & Function,
  now: () => Date,
): Promise<ExposureCheck> {
  if (!query.trim() || !target.blogId || !target.logNo) {
    return {
      method,
      outcome: 'ERROR',
      checked_at: checkedAt(now),
      details: 'Search query, blog ID, or post number is missing.',
    };
  }
  try {
    const result = await searchFn(query, target.blogId, target.logNo);
    return {
      method,
      outcome: searchOutcome(result),
      checked_at: result.checkedAt || checkedAt(now),
      details: result.notes || (result.position === null ? 'Post not found in scanned cards.' : `Position ${result.position}`),
    };
  } catch (error) {
    return {
      method,
      outcome: 'ERROR',
      checked_at: checkedAt(now),
      details: (error as Error).message,
    };
  }
}

async function checkBlogSearchTab(
  target: ExposureCrossCheckTarget,
  fetchFn: typeof fetch,
  now: () => Date,
  timeoutMs: number,
): Promise<ExposureCheck> {
  const base: Omit<ExposureCheck, 'outcome'> = {
    method: 'blog_search_tab',
    checked_at: checkedAt(now),
  };
  if (!target.title.trim() || !target.blogId || !target.logNo) {
    return { ...base, outcome: 'ERROR', details: 'Title, blog ID, or post number is missing.' };
  }
  try {
    const signal = typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
    const query = encodeURIComponent(`"${target.title.trim()}"`);
    const response = await fetchFn(`https://search.naver.com/search.naver?where=blog&query=${query}`, {
      method: 'GET',
      redirect: 'follow',
      signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      },
    });
    if (!response.ok) return { ...base, outcome: 'ERROR', details: `HTTP ${response.status}` };
    const body = normalized(await response.text());
    const blogId = normalized(target.blogId);
    const logNo = normalized(target.logNo);
    const matched = body.includes(logNo) && body.includes(blogId);
    return {
      ...base,
      outcome: matched ? 'FOUND' : 'NOT_FOUND',
      details: matched ? 'Post matched in the Naver blog-search tab.' : 'Post not found in the Naver blog-search tab.',
    };
  } catch (error) {
    return { ...base, outcome: 'ERROR', details: (error as Error).message };
  }
}

export async function runExposureCrossChecks(
  target: ExposureCrossCheckTarget,
  dependencies: ExposureCrossCheckDependencies = {},
): Promise<ExposureCheck[]> {
  const fetchFn = dependencies.fetchFn || globalThis.fetch;
  const searchFn = dependencies.searchFn || checkPostExposure;
  const now = dependencies.now || (() => new Date());
  const timeoutMs = Math.max(1000, dependencies.timeoutMs || 12_000);

  const urlCheck = typeof fetchFn === 'function'
    ? await checkUrlAccess(target, fetchFn, now, timeoutMs)
    : {
      method: 'url_access' as const,
      outcome: 'ERROR' as const,
      checked_at: checkedAt(now),
      details: 'Fetch implementation is unavailable.',
    };
  const exactTitleCheck = await checkSearch('exact_title_search', target.title, target, searchFn, now);
  const blogTabCheck = typeof fetchFn === 'function'
    ? await checkBlogSearchTab(target, fetchFn, now, timeoutMs)
    : {
      method: 'blog_search_tab' as const,
      outcome: 'ERROR' as const,
      checked_at: checkedAt(now),
      details: 'Fetch implementation is unavailable.',
    };
  const integratedCheck = dependencies.integratedResult
    ? {
      method: 'integrated_search' as const,
      outcome: searchOutcome(dependencies.integratedResult),
      checked_at: dependencies.integratedResult.checkedAt || checkedAt(now),
      details: dependencies.integratedResult.notes
        || (dependencies.integratedResult.position === null
          ? 'Post not found in scanned cards.'
          : `Position ${dependencies.integratedResult.position}`),
    }
    : await checkSearch('integrated_search', target.keyword, target, searchFn, now);
  return [urlCheck, exactTitleCheck, blogTabCheck, integratedCheck];
}
