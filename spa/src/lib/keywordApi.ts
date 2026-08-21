/**
 * /leword 키워드 기능의 유일한 백엔드 호출 지점.
 *
 * 서버는 지금 GAS 다. 나중에 Cloudflare Workers 로 옮기면 여기 `ENDPOINT` 한 줄만
 * 바꾸면 된다 — 응답 형태는 서버 쪽 KeywordApi.js 와 짝을 맞춰 뒀다.
 *
 * 화면에 나가는 값은 전부 실측이다. 여기서 점수·확률·예상치를 만들지 않는다.
 */
import { GAS_URL } from './siteOps';
import { loadUserKeys, saveUserKeys } from './userKeys';

const ENDPOINT = GAS_URL;

/**
 * 쿠팡 보드는 Cloudflare Worker 가 맡는다.
 *
 * GAS 는 왕복만 1~3초가 바닥이다(콜드스타트+리다이렉트). 실측: 같은 요청이
 * GAS 2,996ms · Worker 172~190ms. 라이선스·쿼터 장부가 필요 없는 액션이라
 * (쿠팡 키는 방문자 것만 받는다) 상태 없이 옮길 수 있는 것부터 옮겼다.
 * 나머지 액션은 GAS 그대로다 — 한 번에 다 옮기면 장부까지 끌려온다.
 */
const WORKER_ENDPOINT = 'https://leword-keyword-api.leword.workers.dev/';
const WORKER_ACTIONS = new Set(['keyword-coupang-board', 'keyword-coupang-deeplink', 'blog-audit-posts', 'blog-audit-check', 'kin-question', 'kin-answer', 'mindmap-ai', 'claude-oauth-exchange', 'claude-token-check', 'post-audit-analyze', 'kin-post-ideas', 'kin-search', 'claude-usage', 'keyword-post-ideas', 'radar-analyze', 'radar-search', 'radar-evaluate', 'gap-topics']);
const endpointFor = (action: string) => (WORKER_ACTIONS.has(action) ? WORKER_ENDPOINT : ENDPOINT);
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
    /** 지식인 질문 수 실측 — 질문이 많으면 사람들이 답을 못 찾고 있다는 신호. */
    kinCount?: number | null;
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

export type KeywordTrend = { series: number[]; dates: string[] };

export type KeywordAnalysis = {
    keyword: string;
    measured: KeywordMeasured;
    related: RelatedKeyword[];
    /** 데이터랩 최근 30일 상대 추이 실측. 못 재면 null — 선을 지어내지 않는다. */
    trend?: KeywordTrend | null;
    /** 지식인 상위 질문(추천·채택 순) — 제목·링크 실측. */
    kinTop?: Array<{ title: string; link: string }>;
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
        const response = await fetch(endpointFor(action), {
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
        /*
         * 구글은 동시 실행 한도에 걸리면 200 + HTML 을 준다. 그대로 .json() 하면
         * "Unexpected token '<'" 가 방문자 화면까지 올라온다(어드민에서 실사고).
         * JSON 이 아니면 지어내지 않고 "붐빔" 으로 알린다 — 몇 초 뒤 재시도가 답이다.
         */
        const raw = await response.text();
        // 원래 response.json() 이 돌려주던 것과 같은 any 다 — 아래 소비부가 필드를 넓게 읽는다.
        let payload: Awaited<ReturnType<Response['json']>>;
        try {
            payload = JSON.parse(raw);
        } catch {
            return { ok: false, data: null, error: 'server-busy', message: '서버가 잠시 붐빕니다. 몇 초 뒤 다시 시도해 주세요.' };
        }
        /*
         * 회전된 토큰은 **여기서, 성공이든 실패든** 저장한다.
         *
         * 실사고(2026-08-20): 서버가 refresh 회전에 성공한 뒤 파싱 실패로
         * ok:false 를 돌려줬는데, 아래 실패 분기가 data:null 을 반환해 실려온
         * 새 토큰이 버려졌다. 재시도가 이미 소모된 옛 refresh 를 다시 쓰자
         * Anthropic 이 재사용 감지로 토큰 가족 전체를 취소했다
         * ("OAuth access token has been revoked"). 저장을 각 호출부 .then 에
         * 매달면 실패 경로가 구멍이 된다 — 응답을 읽는 단 하나의 길목인
         * 여기서 무조건 저장한다.
         */
        const renewed = (payload as { renewed?: Record<string, string> } | null)?.renewed;
        if (renewed?.claudeToken) {
            try { saveUserKeys({ ...loadUserKeys(), ...renewed }); } catch { /* 저장 실패해도 응답은 돌려준다 */ }
        }
        /*
         * 토큰 사망(갱신까지 실패) — 죽은 토큰을 비우고 재연동 창을 그 자리에서
         * 띄운다(사장님 요구: "만료되면 알아서 로그인창"). 죽은 토큰을 두면
         * 누를 때마다 같은 오류만 반복된다.
         */
        if ((payload as { claudeTokenDead?: boolean } | null)?.claudeTokenDead) {
            try {
                saveUserKeys({ ...loadUserKeys(), claudeToken: '', claudeRefresh: '', claudeExpiresAt: '' });
            } catch { /* 계속 */ }
            window.dispatchEvent(new CustomEvent('leword:claude-dead', { detail: { message: String(payload?.message || '') } }));
        }
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

/** 무료 황금보드 모달용 경량 조회 — 데이터랩 30일 추이 하나만 잰다. */
export const fetchKeywordTrend = (keyword: string) =>
    call<{ keyword: string; trend: KeywordTrend }>('keyword-trend', { keyword });

export const checkRank = (keyword: string, target: string) =>
    call<RankResult>('keyword-rank', { keyword, target });

/*
 * 블로그 노출 감사(2026-08-20) — 주소 하나로 발행 글 전체의 노출·누락·순위.
 * 글 목록은 플랫폼 피드(네이버·티스토리·워드프레스·블로그스팟 공개 RSS),
 * 노출·순위는 네이버 블로그검색 상위 100 실측, 공감은 네이버 공개 리액션 API.
 * 조회수는 어느 플랫폼도 공개 API 가 없어 싣지 않는다.
 */
export type BlogAuditPost = { title: string; link: string; publishedAt: string | null; comments: number | null };
export const auditBlogPosts = (url: string) =>
    call<{ platform: string; blogId: string | null; posts: BlogAuditPost[]; note?: string }>('blog-audit-posts', { url });

export const auditBlogCheck = (title: string, link: string) =>
    call<{ rank: number | null; sampled: number; sympathy: number | null }>('blog-audit-check', { title, link });

/**
 * 마인드맵 추론 — 클로드코드 토큰으로 앱 없이(사장님 지시 2026-08-20 "추론은
 * 따로 연동해야 되냐"). 검색광고 실측 연관을 AI 가 선별+왜검색 한 문장.
 * result 는 브리지 마인드맵과 같은 모양이라 화면 소비부가 갈라지지 않는다.
 */
/*
 * refresh 토큰은 회전식이다 — 서버가 갱신하면(renewed) 즉시 저장해야
 * 다음 호출이 산다. 안 저장하면 옛 refresh 가 무효라 연동이 조용히 죽는다.
 */
function persistRenewed(data: unknown) {
    const renewed = (data as { renewed?: Record<string, string> } | null)?.renewed;
    if (renewed && renewed.claudeToken) {
        saveUserKeys({ ...loadUserKeys(), ...renewed });
    }
}

export const fetchMindmapAI = (keyword: string) =>
    call<{ result: unknown }>('mindmap-ai', { keyword }).then((res) => { persistRenewed(res.data); return res; });

/**
 * 발행 글 진단(사장님 확정 2026-08-20 "글을 분석해야") — 실측 순위 3종 + 글
 * 전문을 구독 AI 가 읽고 원인·수정안을 사실 기반으로만 짚는다.
 */
export type EngineExposure = Record<'google' | 'daum' | 'zum', 'found' | 'not-found' | 'blocked'>;
export type PostAnalysis = {
    verdict: string;
    /** AI 평가 점수(0~100) — 실측이 아니라 평가임을 화면이 라벨로 밝힌다. */
    titleScore: number | null;
    titleNote: string;
    contentScore: number | null;
    contentNote: string;
    targetKeyword: string;
    /** 누락(제목검색 미노출)일 때만 — 원인 후보와 확인 방법. */
    missReasons: string[];
    diagnosis: string[];
    fixes: string[];
    contentRead: boolean;
};
export const fetchPostAnalysis = (input: {
    title: string; link: string; platform?: string;
    kwQuery?: string; kwRank?: number | null;
    extQuery?: string; extRank?: number | null;
    titleRank?: number | null;
    engines?: EngineExposure | null;
}) => call<{ analysis: PostAnalysis }>('post-audit-analyze', {
    title: input.title,
    link: input.link,
    platform: input.platform || '',
    kwQuery: input.kwQuery || '',
    kwRank: input.kwRank == null ? '' : String(input.kwRank),
    extQuery: input.extQuery || '',
    extRank: input.extRank == null ? '' : String(input.extRank),
    titleRank: input.titleRank == null ? '' : String(input.titleRank),
    engines: input.engines ? JSON.stringify(input.engines) : '',
}).then((res) => { persistRenewed(res.data); return res; });

/** 승인 코드+검증값 → 구독 토큰 교환. 코드는 승인 화면의 "code#state" 그대로. */
export const exchangeClaudeOauth = (code: string, verifier: string) =>
    call<{ accessToken: string; refreshToken: string; expiresAt: number }>('claude-oauth-exchange', { code, verifier });

/** 저장 전에 그 토큰으로 실제 생성이 되는지 확인 — 죽은 값 저장 방지. */
export const checkClaudeToken = (token: string) =>
    call<Record<string, never>>('claude-token-check', { token });

/**
 * 이 질문으로 쓸 수 있는 글감 — 키워드마다 SEO 제목과 홈판(디스커버) 제목.
 * 홈판 제목은 제목 교리(구어체·답 숨김·AI 티 0)를 서버 프롬프트가 강제한다.
 */
export type KinPostIdea = {
    keyword: string; why: string; clickWhy?: string; seo: string; home: string;
    /** 홈판 제목 안에 실제로 들어 있는 서브 키워드(조건·상황·대상). */
    sub?: string;
    /** 메인 + 서브 + 후킹 공식을 다 갖췄는지 — 제목 문자열을 직접 뒤져 판정한 값. */
    formula?: { main: boolean; sub: boolean; hook: boolean };
    /** 공식을 다 갖춘 것 중 하나에만 붙는다. 없으면 아무것도 안 붙는다. */
    recommended?: boolean;
};
export const fetchKinPostIdeas = (input: { title: string; body: string }) =>
    call<{ ideas: KinPostIdea[] }>('kin-post-ideas', { title: input.title, body: input.body })
        .then((res) => { persistRenewed(res.data); return res; });

/**
 * 화제 검색어에서 글감 — 키워드마다 SEO·홈판 제목.
 *
 * 지식인 글감(fetchKinPostIdeas)과 같은 제목 교리를 쓴다. 씨앗만 다르다.
 * context 는 화제가 된 영상 제목 — 없는 사실을 지어내지 않게 붙잡아 준다.
 */
export const fetchKeywordPostIdeas = (keyword: string, context: string) =>
    call<{ ideas: KinPostIdea[] }>('keyword-post-ideas', { keyword, context })
        .then((res) => { persistRenewed(res.data); return res; });

/**
 * 클로드 구독 플랜과 남은 사용량.
 *
 * 전부 앤트로픽이 준 값이다 — 플랜은 프로필, 사용률·리셋시각은 응답 헤더.
 * 우리가 추정하는 값은 하나도 없다. 못 읽으면 null 로 와서 화면에서 빠진다.
 */
export type ClaudeUsageWindow = { percent: number | null; resetAt: string | null; status: string };
export type ClaudeUsage = {
    plan: string; email: string;
    fiveHour: ClaudeUsageWindow; sevenDay: ClaudeUsageWindow;
};
export const fetchClaudeUsage = (token: string) => call<ClaudeUsage>('claude-usage', { token });

/**
 * 지식인 질문 검색 — 키워드로 실제 질문을 찾고 조회수·답변수를 실측해 돌려준다.
 * recentOnly 면 최근 기간의 최신순, 아니면 정확도순(기본값).
 */
export type KinSearchQuestion = {
    title: string; link: string; summary?: string;
    askedAt: string | null; views: number | null; answers: number | null;
    expertAnswered?: boolean;
};
export const searchKinQuestions = (query: string, recentOnly: boolean) =>
    call<{ questions: KinSearchQuestion[]; note?: string }>('kin-search', {
        query,
        recentOnly: recentOnly ? '1' : '',
    });

/** 지식인 질문 전문 — 답변 작업대는 질문이 안 잘리고 끝까지 보여야 한다. */
export const fetchKinQuestion = (link: string) =>
    call<{ body: string }>('kin-question', { link });

/**
 * 지식인 답변 초안 — '내 API 키' 탭의 Gemini/OpenAI 키로 앱 없이 생성한다
 * (키는 call() 이 자동으로 싣는다). 키가 없으면 needs-keys 가 온다.
 */
export const fetchKinAnswer = (input: { title: string; body: string; withLink: boolean; blogUrl: string }) =>
    call<{ answer: string; provider: string }>('kin-answer', {
        title: input.title,
        body: input.body,
        withLink: input.withLink ? '1' : '',
        blogUrl: input.blogUrl,
    }).then((res) => { persistRenewed(res.data); return res; });

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

/** 제휴 상품 보드 한 줄. 전부 실측이고 확률은 없다. */
export type AffiliateProduct = {
    name: string;
    keyword: string;
    /** 니즈 검색어 — 사람들이 실제로 치는 검색어(검색광고 실측 최고 수요). */
    needKeyword?: string | null;
    needVolume?: number | null;
    price: number | null;
    wasPrice: number | null;
    discountPercent: number | null;
    image: string;
    url: string;
    rocket: boolean;
    goldboxRank: number;
    /** 실시간 공급 출처 — '가전디지털' 같은 베스트셀러 카테고리 또는 '골드박스 특가'. */
    source?: string;
    /** 그 출처 안에서의 판매 순위. */
    bestRank?: number;
    /** 규칙 기반 구매·사용 욕구 문구 — 글 첫 줄 재료. 서버가 만든다. */
    angles?: { text: string; kind: string }[];
    /** 딥링크 변환용 원본 상품 주소 — API 의 productUrl 은 이미 추적 링크라 재변환이 실패한다. */
    rawUrl?: string;
    /** 블로그 검색 상위 10개 제목의 정면/부분 대응 실측. 문서수(broad)가 과장하는 경쟁의 실제 크기. */
    serpTop?: { sampled: number; exact: number; partial: number } | null;
    /** 이 행을 잰 시각. */
    measuredAt?: string;
    searchVolume: number | null;
    documentCount: number | null;
};

/**
 * 상품에서 출발하는 제휴 보드.
 *
 * 쿠팡이 지금 미는 상품을 받아, 상품마다 그 검색어의 수요·문서수를 잰다.
 * 우리 키워드 풀에서 고르면 키워드 보드를 다시 자른 것밖에 안 된다.
 */
/** 상품 주소 → 방문자 본인의 파트너스 단축링크. 키는 call() 이 함께 싣는다. */
export const createCoupangDeeplink = (url: string) =>
    call<{ shortenUrl: string; landingUrl: string }>('keyword-coupang-deeplink', { url });

export async function fetchAffiliateBoard() {
    return call<{ products: AffiliateProduct[]; needsKeys: boolean }>('keyword-coupang-board', {});
}

/*
 * 외부유입 레이더(§29 PHASE 1) — 내 글 주소 하나로
 *   ① 글 분석(핵심키워드·검색량 실측·의도·돈각도·질의 확장)
 *   ② 네이버 4판(지식인·카페·블로그·웹) 검색 + 중복 제거
 *   ③ AI 평가 → NOW/WATCH/SKIP
 * 세 걸음을 각각 부른다 — 한 번에 묶으면 25초 타임아웃을 넘는다.
 * 자동 게시는 없다. 기회를 보여주고, 게시는 사람이 한다.
 */
export type RadarAnalysis = {
    url: string;
    title: string;
    metaDescription: string;
    /** 검색량은 검색광고 실측 — 못 재면 null 로 온다(지어내지 않는다). */
    coreKeywords: Array<{ keyword: string; searchVolume: number | null }>;
    intents: string[];
    moneyAngle: string;
    queries: string[];
};
export type RadarCandidate = {
    source: 'kin' | 'cafearticle' | 'blog' | 'webkr' | 'community';
    /** 커뮤니티일 때만 — 어느 판인가(아하·클리앙·더쿠…). */
    siteName?: string;
    siteKind?: string;
    /** 그 판의 링크 정책 실측/확인 상태. unknown 이면 사람이 판단한다. */
    linkPolicy?: 'ok' | 'careful' | 'banned' | 'unknown';
    title: string;
    link: string;
    excerpt: string;
    postdate: string;
    matchedQueries: string[];
    cheapScore: number;
};
export type RadarEvaluated = RadarCandidate & {
    evaluated: boolean;
    score?: number;
    recommendedAction?: 'NOW' | 'WATCH' | 'SKIP';
    reason?: string;
    answerAngle?: string;
    relevance?: number; urgency?: number; commercialValue?: number;
    trafficPotential?: number; contentMatch?: number; spamRisk?: number;
};
export const fetchRadarAnalyze = (url: string) =>
    call<{ analysis: RadarAnalysis }>('radar-analyze', { url });
export const fetchRadarSearch = (queries: string[], coreKeywords: string[]) =>
    call<{
        items: RadarCandidate[];
        providerStatus: Record<string, string>;
        totalFound: number;
        afterDedupe: number;
    }>('radar-search', { queries: JSON.stringify(queries), coreKeywords: JSON.stringify(coreKeywords) });
export const fetchRadarEvaluate = (items: RadarCandidate[], articleTitle: string, moneyAngle: string) =>
    call<{ items: RadarEvaluated[] }>('radar-evaluate', {
        items: JSON.stringify(items),
        articleTitle,
        moneyAngle,
    });

/**
 * 글감 주제 판정 — 연동된 AI 에이전트가 한다(사장님 지시 2026-08-21).
 * 쇼핑 검색 API 종료(2026-07-31) 뒤 "살 수 있는 물건인가"를 아는 건
 * 사전이 아니라 모델이다. 셋 다 예/아니오 분류 — 점수를 만들지 않는다.
 */
export type GapTopicVerdict = { keyword: string; shopping: boolean; policy: boolean; ai: boolean };
export const fetchGapTopics = (keywords: string[]) =>
    call<{ topics: GapTopicVerdict[] }>('gap-topics', { keywords: JSON.stringify(keywords) });
