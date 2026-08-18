// src/crawler/shared/naverApiCredentials.ts
// Thin adapter over the single Naver gateway (src/naver).
// Kept as its own module because three crawler call sites already import it;
// all credential/URL/header knowledge now lives in src/naver so the 2026-06-25
// API HUB migration is a one-file change, not a codebase-wide sweep.

import { callNaverSearch, resolveAllNaverCredentials } from '../../naver/index.js';
import type { NaverSearchParams, NaverSearchType } from '../../naver/index.js';

export type { NaverCredential } from '../../naver/index.js';

/** True when at least one usable key (HUB or legacy) is configured. */
export function hasNaverCredentials(): boolean {
  return resolveAllNaverCredentials().length > 0;
}

/**
 * Call a Naver search endpoint through the gateway.
 * HUB→legacy failover and same-mode quota rotation are handled inside;
 * returns null when nothing worked (caller degrades gracefully).
 */
export async function fetchNaverSearch<T>(
  type: NaverSearchType,
  params: NaverSearchParams,
): Promise<T | null> {
  const creds = resolveAllNaverCredentials();
  const result = await callNaverSearch<T>(type, params, {
    credentials: creds,
    maxAttempts: Math.max(2, creds.length),
    rotateOnQuota: true,
  });
  if (!result.ok) {
    console.warn(`[NaverApi] ${type} 실패 (${result.status}): ${result.error ?? '알 수 없는 오류'}`);
    return null;
  }
  return result.data;
}
