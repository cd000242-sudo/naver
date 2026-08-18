// src/naver/apiCredentials.ts
// Collects HUB and legacy Naver credentials together — never one or the other.
// Holding both is what makes automatic failover possible when either key dies.
//
// Masked/corrupted values (a saved `••••` display value) are rejected here so a
// broken key can never reach a fetch header and crash with "Cannot convert
// argument to a ByteString".

import type { NaverCredential } from './apiEndpoints.js';

const HEADER_SAFE = /^[\x21-\x7E]+$/;

export interface NaverCredentialPayload {
  naverHubClientId?: string;
  naverHubClientSecret?: string;
  naverClientId?: string;
  naverClientSecret?: string;
  naverDatalabClientId?: string;
  naverDatalabClientSecret?: string;
  [key: string]: unknown;
}

function clean(value: unknown): string {
  const s = String(value ?? '').trim().replace(/^['"]|['"]$/g, '').trim();
  return s && HEADER_SAFE.test(s) ? s : '';
}

function readPayload(payload: NaverCredentialPayload | undefined, camel: string, kebab: string): string {
  if (!payload) return '';
  return clean(payload[camel] ?? payload[kebab]);
}

function push(out: NaverCredential[], cred: NaverCredential | null): void {
  if (!cred) return;
  if (out.some((c) => c.mode === cred.mode && c.id === cred.id && c.secret === cred.secret)) return;
  out.push(cred);
}

function make(id: string, secret: string, mode: NaverCredential['mode'], label: string): NaverCredential | null {
  return id && secret ? { id, secret, mode, label } : null;
}

/** Env pairs including the `_2`.._10` rotation slots this project already uses. */
function collectEnvPairs(
  idKey: string,
  secretKey: string,
  mode: NaverCredential['mode'],
  label: string,
): NaverCredential[] {
  const out: NaverCredential[] = [];
  push(out, make(clean(process.env[idKey]), clean(process.env[secretKey]), mode, `${label}#1`));
  for (let i = 2; i <= 10; i++) {
    push(out, make(clean(process.env[`${idKey}_${i}`]), clean(process.env[`${secretKey}_${i}`]), mode, `${label}#${i}`));
  }
  return out;
}

/**
 * Every usable credential, HUB first then legacy.
 * Order is the default try-order; the failover client may reorder from its memo.
 */
export function resolveAllNaverCredentials(payload?: NaverCredentialPayload): NaverCredential[] {
  const out: NaverCredential[] = [];

  push(out, make(
    readPayload(payload, 'naverHubClientId', 'naver-hub-client-id'),
    readPayload(payload, 'naverHubClientSecret', 'naver-hub-client-secret'),
    'hub', 'HUB(config)',
  ));
  for (const cred of collectEnvPairs('NAVER_HUB_CLIENT_ID', 'NAVER_HUB_CLIENT_SECRET', 'hub', 'HUB')) {
    push(out, cred);
  }

  push(out, make(
    readPayload(payload, 'naverClientId', 'naver-client-id'),
    readPayload(payload, 'naverClientSecret', 'naver-client-secret'),
    'legacy', 'LEGACY(config)',
  ));
  push(out, make(
    readPayload(payload, 'naverDatalabClientId', 'naver-datalab-client-id'),
    readPayload(payload, 'naverDatalabClientSecret', 'naver-datalab-client-secret'),
    'legacy', 'DATALAB(config)',
  ));
  for (const cred of collectEnvPairs('NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'legacy', 'LEGACY')) {
    push(out, cred);
  }
  for (const cred of collectEnvPairs('NAVER_DATALAB_CLIENT_ID', 'NAVER_DATALAB_CLIENT_SECRET', 'legacy', 'DATALAB')) {
    push(out, cred);
  }

  return out;
}

/** True when at least one credential of each mode exists — i.e. failover is possible. */
export function hasBothNaverModes(creds: NaverCredential[]): boolean {
  return creds.some((c) => c.mode === 'hub') && creds.some((c) => c.mode === 'legacy');
}

/**
 * 이 호출부가 네이버 검색을 시도해도 되는가.
 *
 * 왜 필요한가: 코드 곳곳의 진입 조건이 `clientId && clientSecret`(기존 키)만 봤다.
 * 기존 키가 유예 종료로 죽어 사용자가 지우면, HUB 키가 멀쩡히 있어도 호출 자체가
 * 일어나지 않고 기능이 조용히 꺼진다. 키가 "있는가"의 판단은 모드를 가리지 않아야 한다.
 */
export function naverSearchAvailable(clientId?: string, clientSecret?: string): boolean {
  return resolveAllNaverCredentials(
    clientId && clientSecret ? { naverClientId: clientId, naverClientSecret: clientSecret } : undefined,
  ).length > 0;
}

/** 키 구성 상태 진단 — 유예 만료 전에 사용자가 알아차리게 하기 위한 것. */
export function describeNaverKeyPosture(payload?: NaverCredentialPayload): {
  hasHub: boolean;
  hasLegacy: boolean;
  warning: string | null;
} {
  const creds = resolveAllNaverCredentials(payload);
  const hasHub = creds.some((c) => c.mode === 'hub');
  const hasLegacy = creds.some((c) => c.mode === 'legacy');
  if (!hasHub && !hasLegacy) {
    return { hasHub, hasLegacy, warning: '네이버 API 키가 없습니다. 설정 → API 키에서 입력하세요.' };
  }
  if (!hasHub) {
    return {
      hasHub,
      hasLegacy,
      warning:
        '네이버 기존(개발자센터) 키만 설정돼 있습니다. 2026-06-25 개편으로 검색 API 가 네이버클라우드로 '
        + '이관됐고, 기존 방식은 이관 신청한 계정만 2027-06-30 까지 쓸 수 있습니다. 지금 API HUB 키를 '
        + '발급받아 함께 넣어두면 기존 키가 멈추는 날 자동으로 넘어갑니다.',
    };
  }
  return { hasHub, hasLegacy, warning: null };
}
