/**
 * proxyMapping.ts — 계정ID ↔ proxy 회선 1:1 영속 매핑 (sticky proxy)
 *
 * SPEC-NAVER-PROTECTION-2026 P1 Fix 1.4
 *
 * 정책:
 * - env `PROXY_POOL_URLS` (콤마 구분) 설정 시에만 활성 (미설정 → dead code = 회귀 0)
 * - accountId hash 기반으로 풀에서 deterministic 선택 (같은 계정 = 같은 회선)
 * - lifetime 영속 — 앱 재시작해도 같은 매핑 (hash 결정적)
 *
 * 사용법:
 *   .env:
 *     PROXY_POOL_URLS=http://user:pass@proxy1:port,http://user:pass@proxy2:port,http://user:pass@proxy3:port
 *
 *   코드:
 *     const sticky = getStickyProxyForAccount('cd00242');
 *     // sticky === 풀에서 hash 기반 선택된 1개 (항상 같은 결과)
 */

let cachedPool: string[] | null = null;

/**
 * env PROXY_POOL_URLS를 파싱하여 풀 반환 (캐시됨).
 * 풀 비어있으면 빈 배열.
 */
export function getProxyPool(): string[] {
  if (cachedPool !== null) return cachedPool;
  const raw = (typeof process !== 'undefined' ? process.env.PROXY_POOL_URLS : '') || '';
  cachedPool = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return cachedPool;
}

/**
 * accountId의 hash (charCodeAt sum) 기반 deterministic index.
 * 동일 accountId → 항상 동일 index (안정성, captcha 회피).
 * 다른 accountId → 풀에서 분산 (격리).
 */
function accountHash(accountId: string): number {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = (hash * 31 + accountId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * accountId에 대한 sticky proxy URL 반환.
 * - 풀 없으면 null (기본 동작 — 기존 getProxyUrl로 fallback)
 * - 풀 있으면 hash 기반 선택 (같은 계정 = 항상 같은 회선)
 */
export function getStickyProxyForAccount(accountId: string): string | null {
  if (!accountId) return null;
  const pool = getProxyPool();
  if (pool.length === 0) return null;
  const idx = accountHash(accountId) % pool.length;
  return pool[idx] || null;
}

/**
 * 테스트 용도 — 캐시 무효화.
 */
export function _resetProxyPoolCache(): void {
  cachedPool = null;
}
