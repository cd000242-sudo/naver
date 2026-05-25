/**
 * stickyProxyMapping.test.ts — Phase B (P1 §1.4) 회귀 가드
 *
 * SPEC P1 Fix 1.4 — 계정ID ↔ proxy 회선 1:1 영속 매핑.
 *
 * 검증:
 * - 동일 accountId → 항상 동일 proxy (안정성)
 * - 다른 accountId → 풀에서 분산 (격리)
 * - 풀 미설정 → null (회귀 0, 기존 동작)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getStickyProxyForAccount, getProxyPool, _resetProxyPoolCache } from '../account/proxyMapping';

describe('P1 §1.4 sticky proxy mapping', () => {
  beforeEach(() => {
    _resetProxyPoolCache();
    delete process.env.PROXY_POOL_URLS;
  });

  it('풀 미설정 시 getProxyPool() 빈 배열 + getStickyProxyForAccount null', () => {
    expect(getProxyPool()).toEqual([]);
    expect(getStickyProxyForAccount('user_a')).toBeNull();
  });

  it('풀 1개 설정 시 모든 계정이 그 1개 반환', () => {
    process.env.PROXY_POOL_URLS = 'http://proxy1:8080';
    _resetProxyPoolCache();
    expect(getStickyProxyForAccount('user_a')).toBe('http://proxy1:8080');
    expect(getStickyProxyForAccount('user_b')).toBe('http://proxy1:8080');
  });

  it('풀 3개 설정 + 동일 accountId → 항상 동일 proxy (sticky)', () => {
    process.env.PROXY_POOL_URLS = 'http://p1:80,http://p2:80,http://p3:80';
    _resetProxyPoolCache();
    const a1 = getStickyProxyForAccount('cd00242');
    const a2 = getStickyProxyForAccount('cd00242');
    expect(a1).toBe(a2);
    expect(a1).not.toBeNull();
  });

  it('풀 3개 + 다른 accountId → 풀에서 분산 (격리)', () => {
    process.env.PROXY_POOL_URLS = 'http://p1:80,http://p2:80,http://p3:80';
    _resetProxyPoolCache();
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const proxy = getStickyProxyForAccount(`user_${i}_${Math.random().toString(36).slice(2, 6)}`);
      if (proxy) seen.add(proxy);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2); // 풀 3개 중 최소 2개 사용 (분산)
  });

  it('빈 accountId → null (fallback)', () => {
    process.env.PROXY_POOL_URLS = 'http://p1:80';
    _resetProxyPoolCache();
    expect(getStickyProxyForAccount('')).toBeNull();
  });

  it('풀에 빈 항목/공백 포함 시 자동 필터링', () => {
    process.env.PROXY_POOL_URLS = '  ,http://p1:80,  ,http://p2:80,';
    _resetProxyPoolCache();
    expect(getProxyPool()).toEqual(['http://p1:80', 'http://p2:80']);
  });
});
