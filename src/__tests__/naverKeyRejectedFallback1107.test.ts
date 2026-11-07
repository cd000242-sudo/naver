/**
 * [2026-11-07 사장님 실측] "네이버 자동화" 키워드 글생성 → "크롤링 실패 (SEARCH_BLOCKED): URL 2개 중 본문 확보 0건".
 * SEARCH_BLOCKED = Naver Search API answered 401/403 (keys rejected). With keys present the collector
 * skipped the keyless paths (mobile search, keyless URL search) and kept using the rejected keys → 0 chars.
 * Without keys the same keyword collected material. Rejected keys must be treated as absent for the run.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hasRejectedNaverKeys } from '../sourceAssembler';

const src = fs.readFileSync(path.join(__dirname, '..', 'sourceAssembler.ts'), 'utf8');
const body = src.slice(src.indexOf('export async function collectContentFromPlatforms('));

describe('hasRejectedNaverKeys', () => {
  it('is true when a Naver search source was blocked (401/403)', () => {
    expect(hasRejectedNaverKeys([
      { source: 'NAVER_BLOG(date)', status: 'SEARCH_BLOCKED', count: 0, httpStatus: 401 },
    ] as any)).toBe(true);
  });

  it('ignores non-Naver sources and other failure kinds', () => {
    expect(hasRejectedNaverKeys([
      { source: 'GOOGLE_NEWS', status: 'SEARCH_BLOCKED', count: 0, httpStatus: 403 },
      { source: 'NAVER_NEWS(date)', status: 'SEARCH_RATE_LIMITED', count: 0, httpStatus: 429 },
      { source: 'NAVER_BLOG(sim)', status: 'SEARCH_OK', count: 3, httpStatus: 200 },
    ] as any)).toBe(false);
    expect(hasRejectedNaverKeys([])).toBe(false);
  });
});

describe('collectContentFromPlatforms wiring after rejected keys', () => {
  it('runs the keyless mobile-search path when keys were rejected', () => {
    expect(body).toMatch(/const naverKeysRejected = hasRejectedNaverKeys\(readSearchStatusLedger\(\)\)/);
    expect(body).toMatch(/if \(!naverSearchAvailable\(clientId, clientSecret\) \|\| naverKeysRejected\)/);
  });

  it('does not hand the rejected keys to the URL search', () => {
    const call = body.slice(body.indexOf('await searchAllRssSources('), body.indexOf('await searchAllRssSources(') + 400);
    expect(call).toMatch(/clientId: naverKeysRejected \? undefined : clientId/);
    expect(call).toMatch(/clientSecret: naverKeysRejected \? undefined : clientSecret/);
  });

  it('skips the pointless Naver API retry after crawl failure when keys were rejected', () => {
    expect(body).toMatch(/if \(!naverKeysRejected && naverSearchAvailable\(clientId, clientSecret\)\)/);
  });

  it('tells the user the keys were rejected in the final failure message', () => {
    expect(body).toMatch(/네이버 검색 키가 거부됐습니다/);
  });
});
