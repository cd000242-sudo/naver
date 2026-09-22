import { describe, expect, it } from 'vitest';

import {
  aggregateSearchStatus,
  classifyHttpStatus,
  isSearchUsable,
  type SourceSearchResult,
} from '../content/searchStatus';

describe('classifyHttpStatus', () => {
  it('classifies 429 as SEARCH_RATE_LIMITED regardless of item count', () => {
    expect(classifyHttpStatus(429, 0)).toBe('SEARCH_RATE_LIMITED');
    expect(classifyHttpStatus(429, 10)).toBe('SEARCH_RATE_LIMITED');
  });

  it('classifies 401/403 as SEARCH_BLOCKED', () => {
    expect(classifyHttpStatus(401, 0)).toBe('SEARCH_BLOCKED');
    expect(classifyHttpStatus(403, 0)).toBe('SEARCH_BLOCKED');
  });

  it('classifies 5xx and network failures as SEARCH_ERROR', () => {
    expect(classifyHttpStatus(500, 0)).toBe('SEARCH_ERROR');
    expect(classifyHttpStatus(503, 0)).toBe('SEARCH_ERROR');
    expect(classifyHttpStatus(0, 0, new Error('network down'))).toBe('SEARCH_ERROR');
    expect(classifyHttpStatus(undefined, 0)).toBe('SEARCH_ERROR');
  });

  it('classifies 200 with 0 items as SEARCH_EMPTY', () => {
    expect(classifyHttpStatus(200, 0)).toBe('SEARCH_EMPTY');
  });

  it('classifies 200 with items as SEARCH_OK', () => {
    expect(classifyHttpStatus(200, 5)).toBe('SEARCH_OK');
  });

  it('classifies a parse error as SEARCH_PARSE_FAILED', () => {
    expect(classifyHttpStatus(200, 0, new SyntaxError('Unexpected token'))).toBe('SEARCH_PARSE_FAILED');
  });

  it('distinguishes rate-limit from empty results (the core bug this fixes)', () => {
    const rateLimited = classifyHttpStatus(429, 0);
    const empty = classifyHttpStatus(200, 0);
    expect(rateLimited).not.toBe(empty);
  });
});

describe('aggregateSearchStatus', () => {
  const ok = (source: string, count = 1): SourceSearchResult => ({ source, status: 'SEARCH_OK', count });
  const empty = (source: string): SourceSearchResult => ({ source, status: 'SEARCH_EMPTY', count: 0 });
  const rateLimited = (source: string): SourceSearchResult => ({ source, status: 'SEARCH_RATE_LIMITED', count: 0 });
  const blocked = (source: string): SourceSearchResult => ({ source, status: 'SEARCH_BLOCKED', count: 0 });
  const error = (source: string): SourceSearchResult => ({ source, status: 'SEARCH_ERROR', count: 0 });

  it('returns OK when all sources succeed', () => {
    const { overall } = aggregateSearchStatus([ok('NAVER_BLOG'), ok('NAVER_NEWS')]);
    expect(overall).toBe('SEARCH_OK');
  });

  it('returns PARTIAL when some sources succeed and others do not', () => {
    const { overall } = aggregateSearchStatus([ok('NAVER_BLOG'), empty('NAVER_NEWS')]);
    expect(overall).toBe('SEARCH_PARTIAL');
  });

  it('prefers RATE_LIMITED over EMPTY when none succeed', () => {
    const { overall } = aggregateSearchStatus([empty('NAVER_NEWS'), rateLimited('NAVER_WEB')]);
    expect(overall).toBe('SEARCH_RATE_LIMITED');
  });

  it('falls back to BLOCKED when none succeed and none are rate-limited', () => {
    const { overall } = aggregateSearchStatus([empty('NAVER_NEWS'), blocked('NAVER_WEB')]);
    expect(overall).toBe('SEARCH_BLOCKED');
  });

  it('falls back to ERROR when none succeed, none rate-limited/blocked', () => {
    const { overall } = aggregateSearchStatus([empty('NAVER_NEWS'), error('NAVER_WEB')]);
    expect(overall).toBe('SEARCH_ERROR');
  });

  it('falls back to EMPTY when nothing else applies', () => {
    const { overall } = aggregateSearchStatus([empty('NAVER_NEWS'), empty('NAVER_BLOG')]);
    expect(overall).toBe('SEARCH_EMPTY');
  });

  it('builds a readable per-source summary', () => {
    const { summary } = aggregateSearchStatus([empty('NAVER_NEWS'), ok('NAVER_BLOG', 5), rateLimited('NAVER_WEB')]);
    expect(summary).toBe('NAVER_NEWS: EMPTY · NAVER_BLOG: OK 5 · NAVER_WEB: RATE_LIMITED');
  });
});

describe('isSearchUsable', () => {
  it('is usable for OK and PARTIAL', () => {
    expect(isSearchUsable('SEARCH_OK')).toBe(true);
    expect(isSearchUsable('SEARCH_PARTIAL')).toBe(true);
  });

  it('is not usable for EMPTY, RATE_LIMITED, BLOCKED, PARSE_FAILED, ERROR', () => {
    expect(isSearchUsable('SEARCH_EMPTY')).toBe(false);
    expect(isSearchUsable('SEARCH_RATE_LIMITED')).toBe(false);
    expect(isSearchUsable('SEARCH_BLOCKED')).toBe(false);
    expect(isSearchUsable('SEARCH_PARSE_FAILED')).toBe(false);
    expect(isSearchUsable('SEARCH_ERROR')).toBe(false);
  });
});
