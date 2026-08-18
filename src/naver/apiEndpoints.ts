// src/naver/apiEndpoints.ts
// NAVER API HUB migration — URL / header / diagnosis primitives.
//
// Measured 2026-08-18 with this project's key (see SPEC notes):
//   legacy  GET  https://openapi.naver.com/v1/search/{type}.json   X-Naver-Client-Id/Secret
//   hub     GET  https://naverapihub.apigw.ntruss.com/search/v1/{type}
//                                                     X-NCP-APIGW-API-KEY-ID/KEY
//   legacy  POST https://openapi.naver.com/v1/datalab/search
//   hub     POST https://naverapihub.apigw.ntruss.com/search-trend/v1/search
// Path AND header both differ — swapping only the domain fails.
// `naveropenapi.apigw.ntruss.com` is a DIFFERENT gateway and 404s.

export type NaverApiMode = 'hub' | 'legacy';

export interface NaverCredential {
  readonly id: string;
  readonly secret: string;
  readonly mode: NaverApiMode;
  readonly label: string;
}

export const LEGACY_SEARCH_BASE = 'https://openapi.naver.com/v1/search';
export const LEGACY_DATALAB_URL = 'https://openapi.naver.com/v1/datalab/search';
export const HUB_SEARCH_BASE = 'https://naverapihub.apigw.ntruss.com/search/v1';
export const HUB_DATALAB_URL = 'https://naverapihub.apigw.ntruss.com/search-trend/v1/search';

/** Shut down 2026-07-31 with no replacement (measured: HTTP 404 `SE05`). */
export const RETIRED_SEARCH_TYPES = ['shop', 'book', 'doc'] as const;
export type RetiredSearchType = (typeof RETIRED_SEARCH_TYPES)[number];

export type NaverSearchType =
  | 'blog' | 'news' | 'webkr' | 'kin' | 'cafearticle' | 'image' | 'local' | 'encyc'
  | RetiredSearchType;

export function isRetiredNaverSearchType(type: string): type is RetiredSearchType {
  return (RETIRED_SEARCH_TYPES as readonly string[]).includes(type);
}

export type NaverSearchParams = Record<string, string | number | undefined>;

function toQuery(params: NaverSearchParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.append(k, String(v));
  }
  return sp.toString();
}

/** Mode-aware search URL. Legacy keeps the `.json` suffix; HUB does not use it. */
export function buildNaverSearchUrl(
  type: NaverSearchType,
  params: NaverSearchParams,
  cred: Pick<NaverCredential, 'mode'>,
): string {
  const query = toQuery(params);
  const suffix = query ? `?${query}` : '';
  return cred.mode === 'hub'
    ? `${HUB_SEARCH_BASE}/${type}${suffix}`
    : `${LEGACY_SEARCH_BASE}/${type}.json${suffix}`;
}

/** Mode-aware Search Trend (datalab) URL. */
export function buildNaverDatalabUrl(cred: Pick<NaverCredential, 'mode'>): string {
  return cred.mode === 'hub' ? HUB_DATALAB_URL : LEGACY_DATALAB_URL;
}

/** Mode-aware auth headers. The two gateways share no header name. */
export function naverAuthHeaders(cred: NaverCredential): Record<string, string> {
  return cred.mode === 'hub'
    ? { 'X-NCP-APIGW-API-KEY-ID': cred.id, 'X-NCP-APIGW-API-KEY': cred.secret }
    : { 'X-Naver-Client-Id': cred.id, 'X-Naver-Client-Secret': cred.secret };
}

const HUB_ISSUE_URL = 'https://www.ncloud.com/product/applicationService/naverApiHub';

/** Translate an HTTP status into an actionable prescription, not a bare code. */
export function describeNaverFailure(status: number, mode: NaverApiMode): string {
  if (status === 401 || status === 403) {
    return mode === 'hub'
      ? `API HUB 인증 실패 (${status}) — 네이버클라우드 콘솔에서 발급한 Client ID/Secret 인지, `
        + `해당 Application 에 검색 API 서비스가 선택돼 있는지 확인하세요. ${HUB_ISSUE_URL}`
      : `기존 네이버 개발자센터 키 인증 실패 (${status}) — 2026-06-25 API HUB 개편으로 검색 API 가 `
        + `네이버클라우드로 이관됐습니다. 2026-07-30 까지 이관 신청한 계정만 2027-06-30 까지 기존 방식을 `
        + `쓸 수 있습니다. 설정에서 API HUB 키를 발급받아 입력하세요. ${HUB_ISSUE_URL}`;
  }
  if (status === 404) {
    return `요청한 API 가 존재하지 않습니다 (404) — 쇼핑·책·전문자료 검색은 2026-07-31 종료됐고 `
      + `공식 대체 API 가 없습니다. 그 외 타입이라면 게이트웨이 경로를 확인하세요.`;
  }
  if (status === 429) {
    return mode === 'hub'
      ? `호출 한도 초과 (429) — API HUB 는 Application 에서 해당 서비스를 선택하지 않아도 429 가 납니다. `
        + `콘솔에서 서비스 선택 여부와 호출 한도를 함께 확인하세요.`
      : `호출 한도 초과 (429) — 일일 쿼터를 넘겼습니다. 다른 키로 바꿔도 결과는 같습니다.`;
  }
  if (status >= 500) return `네이버 서버 오류 (${status}) — 잠시 후 다시 시도하세요.`;
  return `네이버 API 오류 (${status})`;
}

/** Prescription for a search type that no longer exists. */
export function describeRetiredSearchType(type: string): string {
  return `'${type}' 검색 API 는 2026-07-31 종료됐습니다 (공식 대체 없음). 호출을 건너뜁니다.`;
}
