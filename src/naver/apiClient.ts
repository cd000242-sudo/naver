// src/naver/apiClient.ts
// The single door every Naver search / datalab call goes through.
//
// Failover contract (deliberately narrow — a wide one wastes quota and misdiagnoses):
//   401 / 403 / 404 → auth is blocked for THIS key set → retry once with the other mode
//   429             → the other key hits the same wall → no retry
//   network/timeout → not a key problem → no retry
//   one mode only   → nowhere to toss to → return the prescription instead
// A success memoises the winning mode for the rest of the PROCESS only; persisting it
// would outlive the key change that made it wrong.

import {
  buildNaverDatalabUrl, buildNaverSearchUrl, describeNaverFailure, describeRetiredSearchType,
  isRetiredNaverSearchType, naverAuthHeaders,
  type NaverApiMode, type NaverCredential, type NaverSearchParams, type NaverSearchType,
} from './apiEndpoints.js';
import { resolveAllNaverCredentials, type NaverCredentialPayload } from './apiCredentials.js';

export type NaverFetch = (url: string, init?: any) => Promise<any>;

export interface NaverCallOptions {
  payload?: NaverCredentialPayload;
  credentials?: NaverCredential[];
  fetchImpl?: NaverFetch;
  timeoutMs?: number;
  /** Upper bound on total attempts. 2 = one failover retry (default). */
  maxAttempts?: number;
  /**
   * On 429, move to the next key of the SAME mode (a separately registered app
   * has its own quota). Never crosses modes — the other mode shares the wall.
   * Only for call sites that already rotated across registered apps.
   */
  rotateOnQuota?: boolean;
}

export interface NaverApiResult<T> {
  ok: boolean;
  /** HTTP status; 0 = network error, 410 = retired API (no call made), 412 = no key. */
  status: number;
  data: T | null;
  error?: string;
  mode?: NaverApiMode;
  label?: string;
  attempts: number;
}

const AUTH_BLOCKED = new Set([401, 403, 404]);

let preferredMode: NaverApiMode | null = null;

/** Process-lifetime memo of the mode that last worked. */
export function getPreferredNaverMode(): NaverApiMode | null {
  return preferredMode;
}

export function resetNaverModeMemo(): void {
  preferredMode = null;
}

const NO_KEY_MESSAGE =
  '네이버 API 키가 설정되어 있지 않습니다. 설정 → API 키에서 API HUB Client ID/Secret '
  + '(네이버클라우드 콘솔 발급) 또는 기존 네이버 개발자센터 Client ID/Secret 을 입력하세요.';

/** Memo first, then HUB before legacy. */
function orderCredentials(creds: NaverCredential[]): NaverCredential[] {
  if (!preferredMode) return creds;
  return [...creds.filter((c) => c.mode === preferredMode), ...creds.filter((c) => c.mode !== preferredMode)];
}

/** Next candidate after `used`, preferring a different mode (that is what failover means). */
function nextCandidate(ordered: NaverCredential[], used: NaverCredential[]): NaverCredential | undefined {
  const untried = ordered.filter((c) => !used.includes(c));
  const lastMode = used[used.length - 1]?.mode;
  return untried.find((c) => c.mode !== lastMode) ?? untried[0];
}

/** Next key of the same mode — a different registered app, so a different quota. */
function nextSameModeCandidate(
  ordered: NaverCredential[],
  used: NaverCredential[],
  mode: NaverApiMode,
): NaverCredential | undefined {
  return ordered.find((c) => c.mode === mode && !used.includes(c));
}

async function runRequest<T>(
  cred: NaverCredential,
  url: string,
  init: any,
  fetchImpl: NaverFetch,
  timeoutMs: number,
): Promise<{ status: number; data: T | null; error?: string }> {
  try {
    const signal = typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function'
      ? (AbortSignal as any).timeout(timeoutMs)
      : undefined;
    const res = await fetchImpl(url, { ...init, headers: { ...init.headers, ...naverAuthHeaders(cred) }, signal });
    if (!res.ok) return { status: res.status, data: null, error: describeNaverFailure(res.status, cred.mode) };
    return { status: res.status, data: (await res.json()) as T };
  } catch (error) {
    return { status: 0, data: null, error: `네트워크 오류: ${(error as Error).message}` };
  }
}

async function callWithFailover<T>(
  buildUrl: (cred: NaverCredential) => string,
  init: any,
  options: NaverCallOptions,
): Promise<NaverApiResult<T>> {
  const creds = options.credentials ?? resolveAllNaverCredentials(options.payload);
  if (creds.length === 0) return { ok: false, status: 412, data: null, error: NO_KEY_MESSAGE, attempts: 0 };

  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as NaverFetch);
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const ordered = orderCredentials(creds);

  const used: NaverCredential[] = [];
  let last: { status: number; error?: string; cred: NaverCredential } | null = null;

  let next: NaverCredential | undefined = ordered[0];
  for (let attempt = 0; attempt < maxAttempts && next; attempt++) {
    const cred = next;
    used.push(cred);

    const res = await runRequest<T>(cred, buildUrl(cred), init, fetchImpl, timeoutMs);
    if (res.status >= 200 && res.status < 300) {
      preferredMode = cred.mode;
      return { ok: true, status: res.status, data: res.data, mode: cred.mode, label: cred.label, attempts: used.length };
    }
    last = { status: res.status, error: res.error, cred };

    if (AUTH_BLOCKED.has(res.status)) {
      next = nextCandidate(ordered, used);          // auth wall → try the other mode
    } else if (res.status === 429 && options.rotateOnQuota) {
      next = nextSameModeCandidate(ordered, used, cred.mode); // quota → another app, same mode
    } else {
      break;                                        // network/5xx → another key changes nothing
    }
  }

  return {
    ok: false,
    status: last?.status ?? 0,
    data: null,
    error: last?.error,
    mode: last?.cred.mode,
    label: last?.cred.label,
    attempts: used.length,
  };
}

/** Search API. Retired types (shop/book/doc) return without touching the network. */
export async function callNaverSearch<T>(
  type: NaverSearchType,
  params: NaverSearchParams,
  options: NaverCallOptions = {},
): Promise<NaverApiResult<T>> {
  if (isRetiredNaverSearchType(type)) {
    return { ok: false, status: 410, data: null, error: describeRetiredSearchType(type), attempts: 0 };
  }
  return callWithFailover<T>((cred) => buildNaverSearchUrl(type, params, cred), { method: 'GET' }, options);
}

/** Search Trend (datalab) API. */
export async function callNaverDatalab<T>(
  body: unknown,
  options: NaverCallOptions = {},
): Promise<NaverApiResult<T>> {
  return callWithFailover<T>(
    (cred) => buildNaverDatalabUrl(cred),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    options,
  );
}
