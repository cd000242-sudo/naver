/**
 * 네이버 실측 도구 — 검색량·문서수·자동완성.
 *
 * 여기 있는 값은 전부 네이버가 준 것이다. 못 재면 null 을 돌려준다.
 * 추정으로 채우지 않는다 — 화면에서 빈 칸이 되는 편이 거짓 숫자보다 낫다.
 *
 * (refresh-golden-briefing.mjs 에 같은 일을 하는 사본이 있다. 15분 크론의
 *  심장이라 이번 회차에 건드리지 않았다 — 나중에 그쪽도 이 파일로 모은다.)
 */
import { createHmac } from 'node:crypto';

const env = (name) => String(process.env[name] || '').trim();

const SEARCHAD_LICENSE = env('NAVER_SEARCHAD_ACCESS_LICENSE');
const SEARCHAD_SECRET = env('NAVER_SEARCHAD_SECRET_KEY');
const SEARCHAD_CUSTOMER = env('NAVER_SEARCHAD_CUSTOMER_ID');
const SEARCH_CLIENT_ID = env('NAVER_CLIENT_ID');
const SEARCH_CLIENT_SECRET = env('NAVER_CLIENT_SECRET');
const HUB_CLIENT_ID = env('NAVER_APIHUB_KEY_ID');
const HUB_CLIENT_SECRET = env('NAVER_APIHUB_KEY');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 검색량에 필요한 자격증명이 빠졌으면 이름만 알려 준다(값은 절대 찍지 않는다). */
export function missingNaverCredentials() {
    const missing = [];
    if (!SEARCHAD_LICENSE) missing.push('NAVER_SEARCHAD_ACCESS_LICENSE');
    if (!SEARCHAD_SECRET) missing.push('NAVER_SEARCHAD_SECRET_KEY');
    if (!SEARCHAD_CUSTOMER) missing.push('NAVER_SEARCHAD_CUSTOMER_ID');
    if (!SEARCH_CLIENT_ID && !HUB_CLIENT_ID) missing.push('NAVER_CLIENT_ID 또는 NAVER_APIHUB_KEY_ID');
    return missing;
}

/** 검색 API 자격증명 — API HUB 를 먼저, 막히면 legacy 로 넘어간다. */
function searchCredentials() {
    const creds = [];
    if (HUB_CLIENT_ID && HUB_CLIENT_SECRET) {
        creds.push({
            url: (type, qs) => `https://naverapihub.apigw.ntruss.com/search/v1/${type}?${qs}`,
            headers: { 'X-NCP-APIGW-API-KEY-ID': HUB_CLIENT_ID, 'X-NCP-APIGW-API-KEY': HUB_CLIENT_SECRET },
        });
    }
    if (SEARCH_CLIENT_ID && SEARCH_CLIENT_SECRET) {
        creds.push({
            url: (type, qs) => `https://openapi.naver.com/v1/search/${type}.json?${qs}`,
            headers: { 'X-Naver-Client-Id': SEARCH_CLIENT_ID, 'X-Naver-Client-Secret': SEARCH_CLIENT_SECRET },
        });
    }
    return creds;
}

/** 검색광고 API 는 HMAC 서명을 요구한다. */
function searchAdHeaders(method, path) {
    const timestamp = Date.now().toString();
    return {
        'X-Timestamp': timestamp,
        'X-API-KEY': SEARCHAD_LICENSE,
        'X-Customer': SEARCHAD_CUSTOMER,
        'X-Signature': createHmac('sha256', SEARCHAD_SECRET).update(`${timestamp}.${method}.${path}`).digest('base64'),
    };
}

/**
 * 월간 검색량(PC+모바일). 한 번에 5개까지.
 * 키는 공백을 뺀 형태다 — 네이버가 그렇게 돌려준다.
 */
export async function fetchVolumes(keywords) {
    const path = '/keywordstool';
    const hint = keywords.map((keyword) => keyword.replace(/\s+/g, '')).join(',');
    const url = `https://api.searchad.naver.com${path}?hintKeywords=${encodeURIComponent(hint)}&showDetail=1`;
    try {
        const response = await fetch(url, { headers: searchAdHeaders('GET', path) });
        if (!response.ok) return new Map();
        const data = await response.json();
        const out = new Map();
        for (const row of data.keywordList || []) {
            const name = String(row.relKeyword || '').trim();
            // "< 10" 처럼 문자로 오는 값이 있다. 숫자가 아니면 버린다.
            const pc = Number(row.monthlyPcQcCnt);
            const mobile = Number(row.monthlyMobileQcCnt);
            if (!name || !Number.isFinite(pc) || !Number.isFinite(mobile)) continue;
            out.set(name.replace(/\s+/g, ''), pc + mobile);
        }
        return out;
    } catch {
        return new Map();
    }
}

/** 블로그 문서 총건수 — 이게 곧 경쟁이다. */
export async function fetchDocumentCount(keyword) {
    const qs = `query=${encodeURIComponent(keyword)}&display=1`;
    const creds = searchCredentials();
    for (let index = 0; index < creds.length; index += 1) {
        try {
            const response = await fetch(creds[index].url('blog', qs), { headers: creds[index].headers });
            if (!response.ok) {
                // 인증 실패만 다음 키로 넘긴다. 한도(429)는 키를 바꿔도 같다.
                if ([401, 403, 404].includes(response.status) && index < creds.length - 1) continue;
                return null;
            }
            const data = await response.json();
            const total = Number(data.total);
            return Number.isFinite(total) ? total : null;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * 네이버 자동완성 — 사람들이 실제로 치는 말만 돌아온다.
 *
 * 이 프로젝트에서 자동완성은 '검증'이 아니라 '공급원'이다. 영상 제목은
 * 문장이라 검색어가 아니지만, 제목에서 뽑은 덩어리를 자동완성에 물으면
 * 그 덩어리로 시작하는 **실제 검색어**가 나온다.
 */
export async function fetchAutocomplete(query) {
    const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(query)}`
        + '&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100';
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://search.naver.com/' } });
        if (!response.ok) return [];
        const data = await response.json();
        return ((data.items && data.items[0]) || []).map((row) => String(row[0] || '').trim()).filter(Boolean);
    } catch {
        return [];
    }
}
