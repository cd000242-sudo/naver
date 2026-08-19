// Regression lock for the NAVER API HUB migration.
// Endpoint/header values were measured against the live gateways on 2026-08-18;
// these tests fail if anyone "just changes the domain".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildNaverSearchUrl, buildNaverDatalabUrl, naverAuthHeaders, describeNaverFailure,
  isRetiredNaverSearchType, RETIRED_SEARCH_TYPES, type NaverCredential,
} from '../naver/apiEndpoints';
import { resolveAllNaverCredentials, hasBothNaverModes, naverSearchAvailable, describeNaverKeyPosture } from '../naver/apiCredentials';
import { callNaverSearch, callNaverDatalab, resetNaverModeMemo, getPreferredNaverMode } from '../naver/apiClient';

const HUB: NaverCredential = { id: 'hubId', secret: 'hubSecret', mode: 'hub', label: 'HUB' };
const LEGACY: NaverCredential = { id: 'legId', secret: 'legSecret', mode: 'legacy', label: 'LEGACY' };

/** Fake fetch: statuses are consumed in order; records every request. */
function fakeFetch(plan: Array<number | Error>) {
  const calls: Array<{ url: string; headers: Record<string, string>; method?: string }> = [];
  let i = 0;
  const impl = async (url: string, init: any = {}) => {
    calls.push({ url, headers: init.headers || {}, method: init.method });
    const step = plan[Math.min(i++, plan.length - 1)];
    if (step instanceof Error) throw step;
    return { ok: step >= 200 && step < 300, status: step, json: async () => ({ items: [{ title: 'ok' }] }) };
  };
  return { impl, calls };
}

const ENV_KEYS = [
  'NAVER_HUB_CLIENT_ID', 'NAVER_HUB_CLIENT_SECRET',
  'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET',
  'NAVER_DATALAB_CLIENT_ID', 'NAVER_DATALAB_CLIENT_SECRET',
];
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  resetNaverModeMemo();
  savedEnv = {};
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('URL 조립 — 실측 규격', () => {
  it('legacy 검색은 openapi.naver.com + .json 접미사', () => {
    const url = buildNaverSearchUrl('blog', { query: '테스트', display: 1 }, LEGACY);
    expect(url).toBe('https://openapi.naver.com/v1/search/blog.json?query=%ED%85%8C%EC%8A%A4%ED%8A%B8&display=1');
  });

  it('HUB 검색은 naverapihub.apigw.ntruss.com/search/v1 + 접미사 없음', () => {
    const url = buildNaverSearchUrl('blog', { query: '테스트', display: 1 }, HUB);
    expect(url).toBe('https://naverapihub.apigw.ntruss.com/search/v1/blog?query=%ED%85%8C%EC%8A%A4%ED%8A%B8&display=1');
  });

  it('데이터랩은 모드별 경로가 다르다 (search-trend/v1/search)', () => {
    expect(buildNaverDatalabUrl(LEGACY)).toBe('https://openapi.naver.com/v1/datalab/search');
    expect(buildNaverDatalabUrl(HUB)).toBe('https://naverapihub.apigw.ntruss.com/search-trend/v1/search');
  });

  it('naveropenapi.apigw.ntruss.com 으로 새지 않는다 (다른 게이트웨이, 404)', () => {
    const urls = [
      buildNaverSearchUrl('news', { query: 'a' }, HUB),
      buildNaverSearchUrl('news', { query: 'a' }, LEGACY),
      buildNaverDatalabUrl(HUB), buildNaverDatalabUrl(LEGACY),
    ];
    for (const u of urls) expect(u).not.toMatch(/naveropenapi\.apigw\.ntruss\.com/);
  });

  it('빈 파라미터는 쿼리에서 제외된다', () => {
    expect(buildNaverSearchUrl('kin', { query: 'a', sort: undefined, start: '' }, LEGACY))
      .toBe('https://openapi.naver.com/v1/search/kin.json?query=a');
  });
});

describe('인증 헤더 — 모드별로 이름이 완전히 다르다', () => {
  it('legacy 는 X-Naver-Client-*', () => {
    expect(naverAuthHeaders(LEGACY)).toEqual({ 'X-Naver-Client-Id': 'legId', 'X-Naver-Client-Secret': 'legSecret' });
  });
  it('HUB 는 X-NCP-APIGW-API-KEY*', () => {
    expect(naverAuthHeaders(HUB)).toEqual({ 'X-NCP-APIGW-API-KEY-ID': 'hubId', 'X-NCP-APIGW-API-KEY': 'hubSecret' });
  });
  it('모드가 섞이지 않는다', () => {
    expect(naverAuthHeaders(HUB)['X-Naver-Client-Id']).toBeUndefined();
    expect(naverAuthHeaders(LEGACY)['X-NCP-APIGW-API-KEY-ID']).toBeUndefined();
  });
});

describe('키 선택 우선순위', () => {
  it('HUB 우선, 없으면 기존, 둘 다면 HUB 가 먼저', () => {
    const both = resolveAllNaverCredentials({
      naverHubClientId: 'h', naverHubClientSecret: 'hs',
      naverClientId: 'l', naverClientSecret: 'ls',
    });
    expect(both[0].mode).toBe('hub');
    expect(both.some((c) => c.mode === 'legacy')).toBe(true);
    expect(hasBothNaverModes(both)).toBe(true);

    const legacyOnly = resolveAllNaverCredentials({ naverClientId: 'l', naverClientSecret: 'ls' });
    expect(legacyOnly.map((c) => c.mode)).toEqual(['legacy']);
    expect(hasBothNaverModes(legacyOnly)).toBe(false);

    const hubOnly = resolveAllNaverCredentials({ naverHubClientId: 'h', naverHubClientSecret: 'hs' });
    expect(hubOnly.map((c) => c.mode)).toEqual(['hub']);
  });

  it('케밥케이스 별칭과 환경변수도 수집한다', () => {
    process.env.NAVER_HUB_CLIENT_ID = 'envHub';
    process.env.NAVER_HUB_CLIENT_SECRET = 'envHubSec';
    const creds = resolveAllNaverCredentials({ 'naver-client-id': 'kid', 'naver-client-secret': 'ksec' } as any);
    expect(creds.find((c) => c.mode === 'hub')?.id).toBe('envHub');
    expect(creds.find((c) => c.mode === 'legacy')?.id).toBe('kid');
  });

  it('마스킹·비ASCII 값은 헤더에 닿기 전에 버려진다', () => {
    expect(resolveAllNaverCredentials({ naverClientId: '••••••', naverClientSecret: 'ls' })).toEqual([]);
    expect(resolveAllNaverCredentials({ naverHubClientId: '한글', naverHubClientSecret: 'x' })).toEqual([]);
  });

  it('반쪽 키(ID 만 / Secret 만)는 후보가 아니다', () => {
    expect(resolveAllNaverCredentials({ naverClientId: 'only' })).toEqual([]);
    expect(resolveAllNaverCredentials({ naverHubClientSecret: 'only' })).toEqual([]);
  });
});

describe('상태코드 → 처방', () => {
  it('401/403 은 모드별로 다른 처방을 준다', () => {
    expect(describeNaverFailure(401, 'legacy')).toMatch(/API HUB 개편|이관/);
    expect(describeNaverFailure(403, 'hub')).toMatch(/네이버클라우드 콘솔/);
  });
  it('404 는 종료된 API 를 지목한다', () => {
    expect(describeNaverFailure(404, 'legacy')).toMatch(/2026-07-31 종료/);
  });
  it('429 는 HUB 의 서비스 미선택 가능성까지 알려준다', () => {
    expect(describeNaverFailure(429, 'hub')).toMatch(/서비스를 선택하지 않아도/);
    expect(describeNaverFailure(429, 'legacy')).toMatch(/일일 쿼터/);
  });
  it('5xx 는 재시도 안내', () => {
    expect(describeNaverFailure(503, 'hub')).toMatch(/서버 오류/);
  });
});

describe('종료된 API', () => {
  it('shop/book/doc 은 종료 목록이다', () => {
    expect([...RETIRED_SEARCH_TYPES]).toEqual(['shop', 'book', 'doc']);
    for (const t of RETIRED_SEARCH_TYPES) expect(isRetiredNaverSearchType(t)).toBe(true);
    expect(isRetiredNaverSearchType('blog')).toBe(false);
  });

  it('종료된 타입은 네트워크를 아예 건드리지 않는다', async () => {
    const { impl, calls } = fakeFetch([200]);
    const r = await callNaverSearch('shop', { query: 'a' }, { credentials: [LEGACY], fetchImpl: impl });
    expect(calls).toHaveLength(0);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(410);
    expect(r.error).toMatch(/2026-07-31 종료/);
  });
});

describe('자동 토스(failover)', () => {
  it('HUB 401 → 기존 키로 그 자리에서 재시도하고 성공한다', async () => {
    const { impl, calls } = fakeFetch([401, 200]);
    const r = await callNaverSearch('blog', { query: 'a' }, { credentials: [HUB, LEGACY], fetchImpl: impl });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('legacy');
    expect(r.attempts).toBe(2);
    expect(calls[0].url).toMatch(/naverapihub\.apigw\.ntruss\.com/);
    expect(calls[1].url).toMatch(/openapi\.naver\.com/);
    expect(calls[1].headers['X-Naver-Client-Id']).toBe('legId');
  });

  it('기존 키 401 → HUB 로 넘어간다 (반대 방향도 성립)', async () => {
    const { impl, calls } = fakeFetch([401, 200]);
    const r = await callNaverSearch('news', { query: 'a' }, { credentials: [LEGACY, HUB], fetchImpl: impl });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('hub');
    expect(calls[1].headers['X-NCP-APIGW-API-KEY-ID']).toBe('hubId');
  });

  it('데이터랩도 같은 규칙으로 토스된다', async () => {
    const { impl, calls } = fakeFetch([403, 200]);
    const r = await callNaverDatalab({ startDate: '2026-07-01' }, { credentials: [HUB, LEGACY], fetchImpl: impl });
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe('https://naverapihub.apigw.ntruss.com/search-trend/v1/search');
    expect(calls[1].url).toBe('https://openapi.naver.com/v1/datalab/search');
    expect(calls[1].method).toBe('POST');
  });

  it('재호출은 1회뿐 — 둘 다 막히면 두 번만 시도한다', async () => {
    const { impl, calls } = fakeFetch([401, 401, 200]);
    const r = await callNaverSearch('blog', { query: 'a' }, { credentials: [HUB, LEGACY], fetchImpl: impl });
    expect(calls).toHaveLength(2);
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(2);
  });

  it('429 는 토스하지 않는다 — 다른 키도 같은 벽이다', async () => {
    const { impl, calls } = fakeFetch([429, 200]);
    const r = await callNaverSearch('blog', { query: 'a' }, { credentials: [HUB, LEGACY], fetchImpl: impl });
    expect(calls).toHaveLength(1);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(429);
  });

  it('네트워크 오류에는 키를 바꾸지 않는다 — 키 문제가 아니다', async () => {
    const { impl, calls } = fakeFetch([new Error('ETIMEDOUT'), 200]);
    const r = await callNaverSearch('blog', { query: 'a' }, { credentials: [HUB, LEGACY], fetchImpl: impl });
    expect(calls).toHaveLength(1);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(r.error).toMatch(/네트워크 오류/);
  });

  it('키가 한 벌뿐이면 토스하지 않고 처방을 준다', async () => {
    const { impl, calls } = fakeFetch([401, 200]);
    const r = await callNaverSearch('blog', { query: 'a' }, { credentials: [LEGACY], fetchImpl: impl });
    expect(calls).toHaveLength(1);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/이관|API HUB/);
  });

  it('키가 아예 없으면 호출 없이 입력 처방을 준다', async () => {
    const { impl, calls } = fakeFetch([200]);
    const r = await callNaverSearch('blog', { query: 'a' }, { credentials: [], fetchImpl: impl });
    expect(calls).toHaveLength(0);
    expect(r.status).toBe(412);
    expect(r.error).toMatch(/API HUB Client ID/);
  });
});

describe('성공한 모드 기억(memo)', () => {
  it('토스 성공 후에는 다음 호출이 곧바로 그쪽으로 간다', async () => {
    const first = fakeFetch([401, 200]);
    await callNaverSearch('blog', { query: 'a' }, { credentials: [HUB, LEGACY], fetchImpl: first.impl });
    expect(getPreferredNaverMode()).toBe('legacy');

    const second = fakeFetch([200]);
    const r = await callNaverSearch('blog', { query: 'b' }, { credentials: [HUB, LEGACY], fetchImpl: second.impl });
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0].url).toMatch(/openapi\.naver\.com/);
    expect(r.attempts).toBe(1);
  });

  it('memo 는 리셋 가능하다 — 영구 저장이 아니다', async () => {
    const f = fakeFetch([200]);
    await callNaverSearch('blog', { query: 'a' }, { credentials: [HUB], fetchImpl: f.impl });
    expect(getPreferredNaverMode()).toBe('hub');
    resetNaverModeMemo();
    expect(getPreferredNaverMode()).toBeNull();
  });
});

describe('기존 키가 만료돼 사라진 세상 — HUB 단독으로도 살아 있어야 한다', () => {
  it('HUB 키만 있으면 호출 가능 판정이 참이다', () => {
    process.env.NAVER_HUB_CLIENT_ID = 'onlyHub';
    process.env.NAVER_HUB_CLIENT_SECRET = 'onlyHubSecret';
    expect(naverSearchAvailable()).toBe(true);
    // 기존 키 인자가 비어 있어도(=사용자가 만료된 키를 지운 상태) 막지 않는다
    expect(naverSearchAvailable('', '')).toBe(true);
    expect(naverSearchAvailable(undefined, undefined)).toBe(true);
  });

  it('키가 하나도 없을 때만 거짓이다', () => {
    expect(naverSearchAvailable()).toBe(false);
    expect(naverSearchAvailable('', '')).toBe(false);
  });

  it('기존 키 인자만 넘어와도 참이다 (기존 동작 유지)', () => {
    expect(naverSearchAvailable('legacyId', 'legacySecret')).toBe(true);
  });

  it('HUB 단독 구성에서 실제 호출이 HUB 로 나간다', async () => {
    process.env.NAVER_HUB_CLIENT_ID = 'onlyHub';
    process.env.NAVER_HUB_CLIENT_SECRET = 'onlyHubSecret';
    const { impl, calls } = fakeFetch([200]);
    const r = await callNaverSearch('blog', { query: 'a' }, { fetchImpl: impl });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('hub');
    expect(calls[0].url).toMatch(/naverapihub\.apigw\.ntruss\.com/);
    expect(calls[0].headers['X-NCP-APIGW-API-KEY-ID']).toBe('onlyHub');
  });
});

describe('키 구성 진단 — 벽에 부딪히기 전에 알려준다', () => {
  it('기존 키만 있으면 이관 경고를 준다', () => {
    const posture = describeNaverKeyPosture({ naverClientId: 'l', naverClientSecret: 'ls' });
    expect(posture).toMatchObject({ hasHub: false, hasLegacy: true });
    expect(posture.warning).toMatch(/2027-06-30|API HUB 키를 발급/);
  });

  it('둘 다 있으면 경고가 없다 — 이미 안전하다', () => {
    const posture = describeNaverKeyPosture({
      naverHubClientId: 'h', naverHubClientSecret: 'hs',
      naverClientId: 'l', naverClientSecret: 'ls',
    });
    expect(posture).toMatchObject({ hasHub: true, hasLegacy: true, warning: null });
  });

  it('키가 없으면 입력 안내를 준다', () => {
    const posture = describeNaverKeyPosture();
    expect(posture.warning).toMatch(/네이버 API 키가 없습니다/);
  });
});

describe('memo 는 엔드포인트별이다 — HUB 가 일부 서비스만 열려 있어도 손해 보지 않는다', () => {
  // 실측(2026-08-19): 같은 HUB 키로 blog 200 / webkr 401(Application 미선택).
  it('webkr 이 기존 키로 토스돼도 blog 는 계속 HUB 로 간다', async () => {
    const okBlog = fakeFetch([200]);
    await callNaverSearch('blog', { query: 'a' }, { credentials: [HUB, LEGACY], fetchImpl: okBlog.impl });
    expect(getPreferredNaverMode('blog')).toBe('hub');

    // webkr 은 HUB 에서 401 → 기존 키로 토스되어 성공
    const webkr = fakeFetch([401, 200]);
    const w = await callNaverSearch('webkr', { query: 'a' }, { credentials: [HUB, LEGACY], fetchImpl: webkr.impl });
    expect(w.mode).toBe('legacy');
    expect(getPreferredNaverMode('webkr')).toBe('legacy');

    // 핵심: blog 기억이 오염되지 않았다
    expect(getPreferredNaverMode('blog')).toBe('hub');
    const blog2 = fakeFetch([200]);
    const b = await callNaverSearch('blog', { query: 'b' }, { credentials: [HUB, LEGACY], fetchImpl: blog2.impl });
    expect(blog2.calls).toHaveLength(1);
    expect(blog2.calls[0].url).toMatch(/naverapihub\.apigw\.ntruss\.com/);
    expect(b.attempts).toBe(1);
  });

  it('데이터랩 기억은 검색 기억과 섞이지 않는다', async () => {
    const search = fakeFetch([200]);
    await callNaverSearch('blog', { query: 'a' }, { credentials: [HUB, LEGACY], fetchImpl: search.impl });
    const dl = fakeFetch([401, 200]);
    await callNaverDatalab({ startDate: '2026-07-01' }, { credentials: [HUB, LEGACY], fetchImpl: dl.impl });
    expect(getPreferredNaverMode('datalab')).toBe('legacy');
    expect(getPreferredNaverMode('blog')).toBe('hub');
  });
});
