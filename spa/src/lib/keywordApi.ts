/**
 * /leword 키워드 기능의 유일한 백엔드 호출 지점.
 *
 * 서버는 지금 GAS 다. 나중에 Cloudflare Workers 로 옮기면 여기 `ENDPOINT` 한 줄만
 * 바꾸면 된다 — 응답 형태는 서버 쪽 KeywordApi.js 와 짝을 맞춰 뒀다.
 *
 * 화면에 나가는 값은 전부 실측이다. 여기서 점수·확률·예상치를 만들지 않는다.
 */
import { GAS_URL } from './siteOps';
import { loadUserKeys } from './userKeys';

const ENDPOINT = GAS_URL;
const VISITOR_KEY = 'leaderspro.keyword.visitorId';
const LICENSE_KEY = 'leaderspro.keyword.licenseCode';
const TIMEOUT_MS = 25000;

export type KeywordUsage = {
    /** 이 조회가 방문자 자기 키로 돌았는지. true 면 사장님 쿼터를 안 썼다. */
    ownKeys: boolean;
    visitorUsed: number;
    visitorLimit: number;
    visitorWindowHours: number;
    dailyCalls: number;
    dailyLimit: number;
    dailyPercent: number;
    urlFetchToday: number;
    urlFetchLimit: number;
    urlFetchPercent: number;
    licensed: boolean;
    resetsAt: string;
};

export type KeywordApiError =
    | 'needs-setup'
    | 'daily-limit'
    | 'visitor-limit'
    | 'keyword-required'
    | 'target-required'
    | 'network'
    | string;

export type KeywordApiResult<T> = {
    ok: boolean;
    data: T | null;
    error?: KeywordApiError;
    message?: string;
    /** needs-setup 일 때 어떤 스크립트 속성이 비었는지. 값이 아니라 이름만 온다. */
    missing?: string[];
    usage?: KeywordUsage;
};

export type KeywordMeasured = {
    searchVolume: number | null;
    searchVolumePc: number | null;
    searchVolumeMobile: number | null;
    competition: string;
    adDepth: number | null;
    documentCount: number | null;
    productCount: number | null;
    ratio: number | null;
};

export type RelatedKeyword = {
    keyword: string;
    searchVolume: number | null;
    searchVolumePc: number | null;
    searchVolumeMobile: number | null;
    competition: string;
    adDepth: number | null;
};

export type KeywordAnalysis = {
    keyword: string;
    measured: KeywordMeasured;
    related: RelatedKeyword[];
    sources: Record<string, string>;
};

export type RankResult = {
    keyword: string;
    target: string;
    scanned: number;
    found: { rank: number; title: string; link: string; blogger: string; postdate: string } | null;
};

/** 쿠팡 파트너스 상품. 키가 없으면 needsKeys 로 온다. */
export type CoupangProducts = {
    keyword: string;
    products: Array<{
        name: string; price: number | null; image: string; url: string;
        rocket: boolean; freeShipping: boolean;
    }>;
    needsKeys: boolean;
};

export type ShoppingSignal = {
    keyword: string;
    productCount: number;
    lowestPrice: number | null;
    items: Array<{ title: string; lowPrice: number | null; mall: string; brand: string; category: string; link: string }>;
};

export type TrendingVideo = {
    rank: number;
    videoId: string;
    title: string;
    channel: string;
    publishedAt: string;
    thumbnail: string;
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
};

/** 방문자 식별자. 무료 횟수를 세기 위한 것일 뿐 신원 확인이 아니다. */
function visitorId(): string {
    try {
        const existing = localStorage.getItem(VISITOR_KEY);
        if (existing) return existing;
        const bytes = new Uint8Array(10);
        crypto.getRandomValues(bytes);
        const id = 'kv_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(VISITOR_KEY, id);
        return id;
    } catch {
        return 'kv_anonymous';
    }
}

export function getStoredLicense(): string {
    try {
        return localStorage.getItem(LICENSE_KEY) || '';
    } catch {
        return '';
    }
}

export function setStoredLicense(code: string): void {
    try {
        if (code) localStorage.setItem(LICENSE_KEY, code);
        else localStorage.removeItem(LICENSE_KEY);
    } catch {
        // 저장이 안 돼도 이번 조회는 되어야 한다.
    }
}

async function call<T>(action: string, params: Record<string, string>): Promise<KeywordApiResult<T>> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        // POST 로 보낸다. 개인 API 키가 실리기 때문에 쿼리스트링에 두면
        // URL 로그·브라우저 기록·리퍼러에 키가 남는다.
        // Content-Type 을 text/plain 으로 두어야 preflight 없이 GAS 로 간다.
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action,
                visitorId: visitorId(),
                licenseCode: getStoredLicense(),
                keys: loadUserKeys(),
                ...params,
            }),
            cache: 'no-store',
            signal: controller.signal,
        });
        if (!response.ok) return { ok: false, data: null, error: 'network', message: `HTTP ${response.status}` };
        const payload = await response.json();
        if (!payload?.ok) {
            return {
                ok: false,
                data: null,
                error: payload?.error || 'network',
                message: payload?.message || '',
                missing: payload?.missing,
                usage: payload?.usage,
            };
        }
        return { ok: true, data: payload as T, usage: payload.usage };
    } catch (error) {
        const aborted = (error as Error)?.name === 'AbortError';
        return { ok: false, data: null, error: 'network', message: aborted ? '응답이 너무 오래 걸립니다.' : '연결에 실패했습니다.' };
    } finally {
        window.clearTimeout(timer);
    }
}

export const analyzeKeyword = (keyword: string) =>
    call<KeywordAnalysis>('keyword-analyze', { keyword });

export const checkRank = (keyword: string, target: string) =>
    call<RankResult>('keyword-rank', { keyword, target });

export const fetchShoppingSignal = (keyword: string) =>
    call<ShoppingSignal>('keyword-shopping', { keyword });

export const fetchTrendingVideos = (categoryId = '') =>
    call<{ items: TrendingVideo[] }>('keyword-youtube', categoryId ? { categoryId } : {});

/** 숫자를 화면용으로. 값이 없으면 지어내지 않고 '—' 를 쓴다. */
export function formatCount(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return value.toLocaleString('ko-KR');
}

/**
 * 쿠팡 상품을 가져온다.
 *
 * 키는 요청 본문에 실려 간다(브라우저 저장소 → POST). 서버는 조회가 끝나면 버린다.
 * 키가 없으면 오류가 아니라 `needsKeys: true` 로 온다 — 다른 레인까지 막지 않는다.
 */
export async function fetchCoupangProducts(keyword: string) {
    return call<CoupangProducts>('keyword-coupang', { keyword });
}
