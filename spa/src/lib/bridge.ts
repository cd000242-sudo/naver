/**
 * LEWORD 앱 브리지 클라이언트 — 웹이 **사용자 PC 의 클로드코드(구독)** 를 쓴다.
 *
 *   이 페이지 → http://127.0.0.1:47615 (LEWORD 앱) → 클로드코드 실행 → 응답
 *
 * 실행·비용 모두 사용자 본인 기기·본인 구독이다. 사이트는 화면일 뿐 서버도
 * 키도 없다. 앱이 꺼져 있으면 연결 실패가 정상이고, 화면은 "앱을 켜세요"로
 * 안내한다 — 지어내는 상태 표시는 없다.
 *
 * 사이트의 AI 추론은 **전부 이 통로로만** 돈다(사장님 결정 2026-09-16 "브리지 전용으로 정리").
 * 사이트는 구독 토큰을 받지도 · 발급받지도 · 워커로 보내지도 않는다. 앱이 꺼져 있으면
 * AI 부분만 멈추고 안내하고, 실측(검색량·문서수 같은 워커의 비AI 액션)은 그대로 돈다.
 */

import type { KinPostIdea, RadarAnalysis } from './keywordApi';

export const BRIDGE_BASE = 'http://127.0.0.1:47615';

export interface BridgeAgentStatus {
    /** 구독 플랜(사실이 있는 엔진만 — 지금은 코덱스 id_token 뿐). 없으면 빈 값. */
    plan?: string;
    provider: 'claude' | 'codex' | 'gemini';
    installed: boolean;
    loggedIn: boolean;
    available: boolean;
    detail: string;
}

export interface BridgeStatus {
    connected: boolean;
    version?: string;
    agents?: BridgeAgentStatus[];
}

async function bridgeFetch(path: string, options?: RequestInit, timeoutMs = 3500): Promise<unknown | null> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(BRIDGE_BASE + path, { ...options, signal: controller.signal });
        if (!response.ok) return null;
        const body = await response.json();
        return body && body.ok ? body : null;
    } catch {
        return null;
    } finally {
        window.clearTimeout(timer);
    }
}

/**
 * 앱 꺼짐과 구버전을 **가려서** 돌려주는 호출 — bridgeFetch 는 둘 다 null 이라 안내를 못 가른다.
 *
 * 404 = 앱은 떠 있는데 이 경로가 실리기 전 버전이다. 꺼짐과 섞어 말하면 사용자가 헛되이 앱을
 * 껐다 켰다 한다(사장님 실사고 2026-08-20). 기다리다 끊긴 것도 꺼짐이 아니라서 따로 알린다.
 */
export type BridgeFailure = { status: 'offline' } | { status: 'outdated' } | { status: 'error'; message: string };
export type BridgeCallResult<T> = { status: 'ok'; result: T } | BridgeFailure;

export async function bridgeCall<T>(path: string, options: RequestInit | undefined, timeoutMs: number): Promise<BridgeCallResult<T>> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(BRIDGE_BASE + path, { ...options, signal: controller.signal });
        if (response.status === 404) return { status: 'outdated' };
        const body = await response.json().catch(() => null) as { ok?: boolean; error?: string; result?: T } | null;
        if (response.ok && body?.ok && body.result !== undefined && body.result !== null) return { status: 'ok', result: body.result };
        return { status: 'error', message: String(body?.error || `앱 응답 ${response.status}`) };
    } catch (error) {
        if ((error as Error)?.name === 'AbortError') return { status: 'error', message: '앱 응답이 너무 오래 걸립니다 — 잠시 뒤 다시 눌러 주세요.' };
        return { status: 'offline' };
    } finally {
        window.clearTimeout(timer);
    }
}

/** 앱 꺼짐 안내 — 화면마다 말이 갈리지 않게 문구를 한 곳에 둔다(2026-09-16). */
export const BRIDGE_OFFLINE_NOTE = 'PC 에서 LEWORD 앱을 켜 두면 내 구독으로 돕니다 — 앱을 켠 뒤 다시 눌러 주세요.';
/** 구버전 안내 — 앱은 켜져 있는데 이 기능이 실리기 전 버전이다. */
export const BRIDGE_OUTDATED_NOTE = 'LEWORD 앱이 구버전이라 이 기능이 없습니다 — 앱을 최신 버전으로 업데이트한 뒤 다시 눌러 주세요.';

/** 실패를 화면 문장으로 — 꺼짐·구버전은 공통 안내, 나머지는 앞말 + 앱이 준 사유. */
export function bridgeFailureNote(failure: BridgeFailure, failedLabel = '실패'): string {
    if (failure.status === 'offline') return BRIDGE_OFFLINE_NOTE;
    if (failure.status === 'outdated') return BRIDGE_OUTDATED_NOTE;
    return `${failedLabel}: ${failure.message}`;
}

/**
 * 앱이 떠 있고 어떤 엔진이 준비됐는지. 실패 = 앱 꺼짐/미설치(정상 상태).
 * 상태 응답은 앱이 클로드·코덱스·제미나이 CLI 세 개를 실제로 찔러본 결과라
 * 첫 호출은 몇 초씩 걸린다 — 기본 3.5초로 끊으면 켜져 있는 앱도 "꺼짐"으로
 * 오판한다(실측). 넉넉히 기다린다.
 */
export async function probeBridge(): Promise<BridgeStatus> {
    const body = await bridgeFetch('/v1/bridge/status', undefined, 20_000) as { version?: string; agents?: BridgeAgentStatus[] } | null;
    if (!body) return { connected: false };
    return { connected: true, version: body.version, agents: body.agents || [] };
}

/**
 * 서브키워드·제목 추론 — 앱의 레인 인사이트(추론 체인 전체: 자동완성 실측 →
 * 규칙 선별 → 부족하면 클로드코드 제안 → 실존 결재)를 그대로 쓴다.
 * 결과의 subs 는 이미 검증된 것만 온다(추론 60초까지 걸릴 수 있다).
 */
export interface BridgeMindmap {
    keyword: string;
    reasons: Array<{ text: string; basis: string }>;
    expansions: Array<{ keyword: string; searchVolume: number | null; source: string }>;
    signals: string[];
    /** 광고 수익 관점 결론 — 클릭할까·무슨 광고가 뜰까·머물까를 따진 질적 판단. */
    monetize?: {
        verdict: 'good' | 'bad' | 'mixed';
        // basis 는 브리지 라이브 결과에만 있다 — 회차에 구운 판정은 text 만 싣는다.
        points: Array<{ text: string; basis?: string }>;
        angle?: string;
    } | null;
    agent: { available: boolean; provider: string; proposed: number; verified: number; error?: string };
}

/**
 * 마인드맵 — 사이트가 사용자 PC 의 앱을 통해 본인 구독으로 돌린다.
 *
 * 예전에는 "마인드맵은 앱 기능"이라 웹에서 링크만 걸었는데, 브리지가 생긴
 * 뒤로는 그 전제가 사라졌다. 앱이 꺼져 있으면 offline, 구버전이면 outdated 이고,
 * 화면은 그대로 안내한다 — 지어낸 확장어를 보여주지 않는다.
 */
export async function bridgeMindmap(keyword: string, light = false): Promise<BridgeCallResult<BridgeMindmap>> {
    return bridgeCall<BridgeMindmap>('/v1/bridge/mindmap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyword, light }),
    }, 90_000);
}

export interface BridgeTrend {
    success: boolean;
    series?: number[];
    dates?: string[];
    analysis?: { type?: string; label?: string; monthAvg?: number; recent3Avg?: number; recommendation?: string };
    error?: string;
}

/** 30일 트렌드 — 앱과 같은 데이터랩 실측을 웹에서도 그린다. 앱이 꺼져 있으면 null. */
export async function bridgeTrend(keyword: string): Promise<BridgeTrend | null> {
    const body = await bridgeFetch('/v1/bridge/trend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyword }),
    }, 30_000) as { result?: BridgeTrend } | null;
    return body?.result || null;
}

/**
 * 지식인 답변 초안 — 답변 교리(AI 티 0 · 깔끔·담백·정확)가 앱 쪽 고정
 * 템플릿에 박혀 있고, 본인 구독으로 생성된다. 게시는 사용자가 직접 한다.
 * 앱이 꺼져 있으면 null — 화면은 "앱을 켜세요"로 안내한다.
 */
export type BridgeKinAnswerResult =
    | { status: 'ok'; answer: string; provider: string }
    /** 연결 자체가 안 됨 — 앱이 꺼져 있거나 설치 전. */
    | { status: 'offline' }
    /** 앱은 떠 있는데 이 경로가 없음(404) — 구버전, 업데이트가 답이다. */
    | { status: 'outdated' }
    | { status: 'error'; message: string };

export async function bridgeKinAnswer(input: {
    title: string;
    body: string;
    withLink: boolean;
    blogUrl: string;
    /** 사용자가 고른 엔진. 비면 앱이 순서대로 시도한다. */
    provider?: string;
}): Promise<BridgeKinAnswerResult> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 120_000);
    try {
        const response = await fetch(`${BRIDGE_BASE}/v1/bridge/kin-answer`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
            signal: controller.signal,
        });
        // 404 = 앱은 살아 있는데 이 기능이 실리기 전 버전이다 — "꺼짐"과 구분해야
        // 사용자가 헛되이 앱을 껐다 켰다 하지 않는다(사장님 실사고 2026-08-20).
        if (response.status === 404) return { status: 'outdated' };
        const body = await response.json().catch(() => null) as
            { ok?: boolean; error?: string; result?: { answer?: string; provider?: string } } | null;
        if (response.ok && body?.ok && body.result?.answer) {
            return { status: 'ok', answer: body.result.answer, provider: body.result.provider || 'unknown' };
        }
        return { status: 'error', message: body?.error || `앱 응답 ${response.status}` };
    } catch {
        return { status: 'offline' };
    } finally {
        window.clearTimeout(timer);
    }
}

/**
 * CLI 로그인 시작(코덱스·제미나이·그록·클로드) — 앱이 그 PC 에서 로그인을
 * 띄우고 브라우저를 연다. 사이트는 자격증명을 만지지 않는다: 시작 신호를
 * 보내고 상태만 돌려받는다. 앱이 꺼져 있으면 offline, 구버전이면 outdated.
 */
/**
 * CLI 구독 로그인.
 *
 * `switchAccount` 를 주면 기존 자격증명을 먼저 지운다. 안 지우면 CLI 가
 * "이미 로그인돼 있습니다" 로 끝나 버려 다른 계정으로 갈아탈 수가 없다
 * (사장님 실측 2026-08-20 — 플랜이 다른 계정으로 바꾸려는데 안 바뀜).
 */
export async function bridgeAgentLogin(
    provider: 'claude' | 'codex' | 'gemini' | 'grok',
    switchAccount = false,
): Promise<
    BridgeCallResult<{ state: 'already' | 'done' | 'browser-opened' | 'starting' | 'installing' | 'failed'; loggedIn?: boolean; message?: string }>
> {
    return bridgeCall<{ state: 'already' | 'done' | 'browser-opened' | 'starting' | 'installing' | 'failed'; loggedIn?: boolean; message?: string }>('/v1/bridge/agent-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, switchAccount }),
    }, 30_000);
}

/**
 * 앱 설정에 저장된 API 키 묶음(네이버 오픈·API HUB·검색광고·유튜브)을 같은 기기 앱에서 받는다.
 * 사장님 2026-09-09 "앱에서든 사이트에서든 하나처럼". 구버전 앱(경로 없음)은 outdated.
 */
export type BridgeApiKeys =
    | { status: 'ok'; keys: Record<string, string>; count: number }
    | { status: 'offline' }
    | { status: 'outdated' };

export async function bridgeApiKeys(): Promise<BridgeApiKeys> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    try {
        const response = await fetch(`${BRIDGE_BASE}/v1/bridge/api-keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal });
        if (response.status === 404) return { status: 'outdated' };
        const body = await response.json().catch(() => null) as { ok?: boolean; result?: { ok?: boolean; keys?: Record<string, string>; count?: number } } | null;
        const result = body?.result;
        if (response.ok && body?.ok && result?.ok && result.keys) return { status: 'ok', keys: result.keys, count: Number(result.count) || Object.keys(result.keys).length };
        return { status: 'offline' };
    } catch {
        return { status: 'offline' };
    } finally {
        window.clearTimeout(timer);
    }
}

/**
 * 글감 추론 — 앱(본인 구독)으로 돌린다.
 *
 * 왜 필요한가(사장님 지적 2026-08-22 "연동이 문제 있으면 절대 안 된다"):
 * 유튜브 글감·레이더 카드는 클라우드 워커만 불렀다. 워커는 사이트에 저장된
 * 토큰이 있어야 돌고 사용자 PC 의 CLI 로그인에는 닿을 수 없어서, 앱에서
 * 네 엔진이 전부 "연동됨"인데도 화면은 "연동하세요"를 띄웠다.
 * 지금은 사이트 글감(유튜브·키워드 분석·지식인)의 유일한 경로다(사장님 결정 2026-09-16 "브리지 전용").
 */
export type BridgePostIdea = {
    keyword: string;
    sub?: string;
    why?: string;
    clickWhy?: string;
    seo?: string;
    home?: string;
};

export type BridgePostIdeasResult =
    | { status: 'ok'; ideas: BridgePostIdea[]; provider: string }
    /** 연결 자체가 안 됨 — 앱이 꺼져 있거나 설치 전. */
    | { status: 'offline' }
    /** 앱은 떠 있는데 이 경로가 없음(404) — 구버전, 업데이트가 답이다. */
    | { status: 'outdated' }
    | { status: 'error'; message: string };

export type BridgeRadarResult =
    | { ok: true; evaluations: Array<Record<string, number | string>>; provider?: string }
    | { ok: false; reason: 'offline' | 'outdated' | 'failed'; message?: string };

/**
 * 레이더 평가를 **앱(본인 구독)** 으로 돌린다
 * (사장님 지시 2026-08-23: "레이더도 앱으로 넘어가게 붙여 줘").
 * 지금은 레이더 평가의 유일한 길이다(사장님 결정 2026-09-16 "브리지 전용"). 재료만 보낸다 — 후보 목록과
 * 내 글 요지뿐이고 문장은 앱이 만든다.
 */
export async function bridgeRadarEvaluate(input: {
    items: Array<{ title: string; source: string; link: string }>;
    myTitle: string;
    mySummary: string;
    provider?: string;
}): Promise<BridgeRadarResult> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 180_000);
    try {
        const response = await fetch(`${BRIDGE_BASE}/v1/bridge/radar-evaluate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                items: input.items.slice(0, 40),
                myTitle: input.myTitle || '',
                mySummary: input.mySummary || '',
                provider: input.provider || '',
            }),
            signal: controller.signal,
        });
        // 404 = 앱은 떠 있는데 이 경로가 실리기 전 버전이다 — 꺼짐과 가려서 알린다.
        if (response.status === 404) return { ok: false, reason: 'outdated' };
        if (!response.ok) {
            const failed = await response.json().catch(() => null) as { error?: string } | null;
            return { ok: false, reason: 'failed', message: String(failed?.error || `앱 응답 ${response.status}`) };
        }
        const parsed = await response.json();
        const rows = parsed?.result?.evaluations;
        if (!Array.isArray(rows) || rows.length === 0) {
            return { ok: false, reason: 'failed', message: '앱이 평가를 돌려주지 못했습니다.' };
        }
        return { ok: true, evaluations: rows, provider: parsed?.result?.provider };
    } catch {
        // 앱이 꺼져 있거나 브리지가 안 열렸다 — 지어내지 않고 그대로 알린다.
        return { ok: false, reason: 'offline' };
    } finally {
        window.clearTimeout(timer);
    }
}

/* ── 애드센스 실측 RPM (사장님 지시 2026-08-28) ─────────────────────────
 *
 * 애드센스 토큰은 **앱에만** 있다. 사이트는 계산된 숫자만 받는다 — 수익 자료라
 * 브라우저에 자격증명을 둘 이유가 없다(AI 구독 자격도 사이트에 두지 않는다 — 같은 원칙이다).
 *
 * 남의 글 RPM 은 존재하지 않는다: 수익도 페이지뷰도 계정 주인만 볼 수 있다.
 * 그래서 이 경로가 내는 것은 전부 사장님 계정 실적이다.
 */
export type AdsenseStatus = {
    hasCredentials: boolean;
    connected: boolean;
    /** 지금 붙어 있는 계정 — "박성현 (pub-5114…)". 어느 계정인지 안 보이면 엉뚱한 계정이 붙어도 모른다. */
    account?: string;
    /** READY / NEEDS_ATTENTION 등 구글이 준 상태 그대로. */
    accountState?: string;
    need: '' | 'login' | 'credentials';
};

export async function bridgeAdsenseStatus(): Promise<AdsenseStatus | null> {
    const body = await bridgeFetch('/v1/bridge/adsense-status', undefined, 8_000) as
        { result?: AdsenseStatus } | null;
    return body?.result || null;
}

/** 구글 로그인 창을 이 PC 에서 띄운다. 자격증명은 127.0.0.1 로만 간다. */
export async function bridgeAdsenseLogin(clientId: string, clientSecret: string, switchAccount = false): Promise<
    { ok: true } | { ok: false; reason: string }
> {
    try {
        const response = await fetch(`${BRIDGE_BASE}/v1/bridge/adsense-login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ clientId, clientSecret, switchAccount }),
        });
        if (response.status === 404) return { ok: false, reason: 'LEWORD 앱이 구버전입니다 — 앱을 최신으로 올려 주세요.' };
        const body = await response.json().catch(() => null) as
            { ok?: boolean; result?: { ok?: boolean; reason?: string } } | null;
        if (body?.result?.ok) return { ok: true };
        return { ok: false, reason: String(body?.result?.reason || '로그인을 끝내지 못했습니다.') };
    } catch {
        return { ok: false, reason: 'LEWORD 앱이 꺼져 있습니다 — 앱을 켠 뒤 다시 눌러 주세요.' };
    }
}

export type RpmRow = { pageUrl: string; earnings: number; pageViews: number; rpm: number | null };
export type RpmReport = {
    rows: RpmRow[]; startDate: string; endDate: string; currency: string; account: string;
};

/**
 * @param includeToday 오늘까지 포함할지. 방금 쓴 글을 보려면 참이어야 한다 —
 *   끝을 어제로 두면 오늘 올린 글은 아예 안 나온다(사장님 지적 2026-08-28).
 */
export async function bridgeAdsenseRpm(days: number, currencyCode = 'USD', includeToday = false): Promise<
    { status: 'ok'; report: RpmReport } | { status: 'offline' | 'outdated' } | { status: 'error'; message: string }
> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 90_000);
    try {
        const response = await fetch(`${BRIDGE_BASE}/v1/bridge/adsense-rpm`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ days, currencyCode, includeToday }),
            signal: controller.signal,
        });
        if (response.status === 404) return { status: 'outdated' };
        const body = await response.json().catch(() => null) as
            { ok?: boolean; error?: string; result?: (RpmReport & { error?: string }) } | null;
        const result = body?.result;
        if (response.ok && body?.ok && result && Array.isArray(result.rows)) {
            return { status: 'ok', report: result };
        }
        return { status: 'error', message: String(result?.error || body?.error || `앱 응답 ${response.status}`) };
    } catch {
        return { status: 'offline' };
    } finally {
        window.clearTimeout(timer);
    }
}

export type DailyRpm = { date: string; earnings: number; pageViews: number; rpm: number | null };

/**
 * 글 하나의 **날짜별** RPM. RPM 은 고정이 아니다 — 시작점이 낮으면 접고, 높게
 * 시작하면 트래픽을 붓는다. 나중에 오른 글은 언제부터 올랐는지가 보여야
 * 이유를 찾을 수 있다(사장님 지시 2026-08-28).
 */
export async function bridgeAdsensePageRpm(pageUrl: string, days = 30, currencyCode = 'USD'): Promise<
    { status: 'ok'; rows: DailyRpm[]; currency: string } | { status: 'error'; message: string }
> {
    try {
        const response = await fetch(`${BRIDGE_BASE}/v1/bridge/adsense-page-rpm`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ pageUrl, days, currencyCode }),
        });
        if (response.status === 404) return { status: 'error', message: 'LEWORD 앱이 구버전입니다 — 앱을 최신으로 올려 주세요.' };
        const body = await response.json().catch(() => null) as
            { ok?: boolean; error?: string; result?: { rows?: DailyRpm[]; currency?: string; error?: string } } | null;
        const rows = body?.result?.rows;
        if (response.ok && body?.ok && Array.isArray(rows)) {
            return { status: 'ok', rows, currency: String(body.result?.currency || currencyCode) };
        }
        return { status: 'error', message: String(body?.result?.error || body?.error || `앱 응답 ${response.status}`) };
    } catch {
        return { status: 'error', message: 'LEWORD 앱이 꺼져 있습니다 — 앱을 켠 뒤 다시 눌러 주세요.' };
    }
}

export type BridgePostAnalyzeResult =
    | { status: 'ok'; analysis: unknown; checklist: unknown; measured: unknown; provider: string }
    | { status: 'outdated' | 'offline' }
    /** 앱 진단이 실패해도 앱이 잰 체크리스트가 있으면 함께 온다 — 실측이라 화면에 그대로 쓴다. */
    | { status: 'error'; message: string; checklist?: unknown };

/**
 * 글 진단을 **앱(본인 구독)** 으로 돌린다(사장님 지시 2026-08-28
 * "제미나이를 사용할 수 있게 해 줘").
 *
 * 제미나이·코덱스·그록은 그 PC 의 구독 로그인이라 사이트 서버가 못 쓴다.
 * 지금은 모든 엔진의 글 진단이 이 길로만 간다(사장님 결정 2026-09-16 "브리지 전용"). 재료만 보낸다 — 실측도 프롬프트도
 * 앱이 우리 서버에서 직접 받아 온다.
 */
export async function bridgePostAnalyze(input: {
    title: string; link: string; platform?: string;
    kwQuery?: string; kwRank?: number | null;
    extQuery?: string; extRank?: number | null;
    titleRank?: number | null; titleRankMeasured?: boolean;
    keys: Record<string, string>;
    provider?: string;
}): Promise<BridgePostAnalyzeResult> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 240_000);
    try {
        const response = await fetch(`${BRIDGE_BASE}/v1/bridge/post-analyze`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                title: input.title,
                link: input.link,
                platform: input.platform || '',
                kwQuery: input.kwQuery || '',
                kwRank: input.kwRank ?? null,
                extQuery: input.extQuery || '',
                extRank: input.extRank ?? null,
                titleRank: input.titleRank ?? null,
                titleRankMeasured: input.titleRankMeasured !== false,
                keys: input.keys,
                provider: input.provider || '',
            }),
            signal: controller.signal,
        });
        // 404 = 앱은 살아 있는데 이 기능이 실리기 전 버전이다 — "꺼짐"과 구분해야
        // 사용자가 헛되이 앱을 껐다 켰다 하지 않는다(post-ideas 와 같은 규칙).
        if (response.status === 404) return { status: 'outdated' };
        const body = await response.json().catch(() => null) as
            { ok?: boolean; error?: string; result?: Record<string, unknown> } | null;
        const result = body?.result;
        if (response.ok && body?.ok && result && result.analysis) {
            return {
                status: 'ok',
                analysis: result.analysis,
                checklist: result.checklist ?? null,
                measured: result.measured ?? null,
                provider: String(result.provider || 'unknown'),
            };
        }
        return {
            status: 'error',
            message: String(result?.error || body?.error || `앱 응답 ${response.status}`),
            checklist: result?.checklist ?? undefined,
        };
    } catch {
        return { status: 'offline' };
    } finally {
        window.clearTimeout(timer);
    }
}

export async function bridgePostIdeas(input: {
    kind: 'keyword' | 'kin';
    keyword?: string;
    context?: string;
    title?: string;
    body?: string;
    /** 사용자가 고른 엔진. 비면 앱이 순서대로 시도한다. */
    provider?: string;
}): Promise<BridgePostIdeasResult> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 150_000);
    try {
        const response = await fetch(`${BRIDGE_BASE}/v1/bridge/post-ideas`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                kind: input.kind,
                keyword: input.keyword || '',
                context: input.context || '',
                title: input.title || '',
                body: input.body || '',
                provider: input.provider || '',
            }),
            signal: controller.signal,
        });
        // 404 = 앱은 살아 있는데 이 기능이 실리기 전 버전이다 — "꺼짐"과 구분해야
        // 사용자가 헛되이 앱을 껐다 켰다 하지 않는다(kin-answer 와 같은 규칙).
        if (response.status === 404) return { status: 'outdated' };
        const body = await response.json().catch(() => null) as
            { ok?: boolean; error?: string; result?: { ideas?: BridgePostIdea[]; provider?: string } } | null;
        const ideas = body?.result?.ideas;
        if (response.ok && body?.ok && Array.isArray(ideas) && ideas.length > 0) {
            return { status: 'ok', ideas, provider: body.result?.provider || 'unknown' };
        }
        return { status: 'error', message: body?.error || `앱 응답 ${response.status}` };
    } catch {
        return { status: 'offline' };
    } finally {
        window.clearTimeout(timer);
    }
}

export async function bridgeAiSubs(keyword: string): Promise<{
    subs: Array<{ keyword: string; searchVolume: number | null; source?: string }>;
    ai?: { used: boolean; provider: string; proposed: number; verified: number };
} | null> {
    const body = await bridgeFetch('/v1/bridge/ai-subs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyword }),
    }, 90_000) as { result?: { subs?: [], ai?: never } } | null;
    if (!body || !body.result) return null;
    return body.result as never;
}

/**
 * 앱 글감을 화면 모양(KinPostIdea)으로 — 제목이 빠진 글감은 화면이 쓸 수 없어 버린다.
 * 빈칸을 채워 넣지 않는다. 전부 빠지면 빈 배열이고, 화면은 그걸 실패로 알린다(빈 목록을 성공으로 보여주지 않는다).
 */
export function usablePostIdeas(ideas: BridgePostIdea[]): KinPostIdea[] {
    return ideas
        .filter((idea) => idea.seo && idea.home)
        .map((idea) => ({
            keyword: idea.keyword,
            why: idea.why || '',
            clickWhy: idea.clickWhy,
            seo: idea.seo as string,
            home: idea.home as string,
            sub: idea.sub,
        }));
}

/*
 * ── 글감 주제 판정(쇼핑·정책·AI) — 유튜브 빈자리 표의 보조 판정 (사장님 결정 2026-09-16) ──
 *
 * 워커에만 있던 판정을 앱으로 옮겼다. 결과 모양이 워커 gap-topics 의 topics 와 같아서
 * 화면의 수집분별 캐시(collectedAt 열쇠)를 그대로 쓴다. 셋 다 예/아니오 분류 — 점수를 만들지 않는다.
 * 앱이 검색어를 문자열만 · 60자 · 최대 60개로 자른다.
 */
export type GapTopicVerdict = { keyword: string; shopping: boolean; policy: boolean; ai: boolean };

export async function bridgeGapTopics(keywords: string[], provider = ''): Promise<BridgeCallResult<{ topics: GapTopicVerdict[]; provider: string }>> {
    const called = await bridgeCall<{ topics?: GapTopicVerdict[]; provider?: string }>('/v1/bridge/gap-topics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // 엔진을 안 골랐으면 provider 칸을 싣지 않는다 — 앱이 연동된 순서대로 고른다.
        body: JSON.stringify(provider ? { keywords, provider } : { keywords }),
    }, 400_000);
    if (called.status !== 'ok') return called;
    if (!Array.isArray(called.result.topics)) return { status: 'error', message: '앱이 주제 판정을 돌려주지 못했습니다.' };
    return { status: 'ok', result: { topics: called.result.topics, provider: String(called.result.provider || '') } };
}

/*
 * ── 엔진 사용량 — 이 PC 의 LEWORD 앱이 센 호출 수 (사장님 결정 2026-09-16 "앱이 센 사용량으로 교체") ──
 *
 * 서비스 공식 한도(%)가 아니다. 사이트는 구독 토큰을 들고 있지 않아 한도를 물을 수 없고,
 * 사실로 있는 것은 이 PC 의 앱이 엔진을 부른 횟수뿐이다. 다른 기기나 앱 밖에서 쓴 양은 들어 있지 않다.
 */
export type BridgeAgentUsage = {
    provider: 'claude' | 'codex' | 'gemini' | 'grok';
    /** 최근 5시간 호출 수. */
    window5h: number;
    /** 최근 24시간 호출 수. */
    day: number;
    /** 최근 5시간 안에서 실패한 호출 수. */
    failed5h: number;
    /** 5시간 창이 새로 시작하는 시각(ISO). 없으면 null. */
    resetAt: string | null;
    /** 마지막 호출 시각(ISO). 없으면 null. */
    lastAt: string | null;
};

const USAGE_PROVIDERS: ReadonlyArray<BridgeAgentUsage['provider']> = ['claude', 'codex', 'gemini', 'grok'];
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

export async function bridgeAgentUsage(): Promise<BridgeCallResult<{ usage: BridgeAgentUsage[]; countedBy: 'app' }>> {
    const called = await bridgeCall<{ usage?: unknown; countedBy?: string }>('/v1/bridge/agent-usage', undefined, 8_000);
    if (called.status !== 'ok') return called;
    if (!Array.isArray(called.result.usage)) return { status: 'error', message: '앱이 사용량을 돌려주지 못했습니다.' };
    /*
     * 앱 응답은 바깥 입력이라 모양을 확인한다. 숫자가 아닌 줄은 0 으로 채우지 않고 뺀다 —
     * 세지 않은 것을 "0회"로 보여 주면 지어낸 사실이 된다.
     */
    const usage = called.result.usage.flatMap((raw): BridgeAgentUsage[] => {
        const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const provider = USAGE_PROVIDERS.find((name) => name === row.provider);
        const window5h = row.window5h;
        const day = row.day;
        const failed5h = row.failed5h;
        if (!provider || !isCount(window5h) || !isCount(day) || !isCount(failed5h)) return [];
        return [{
            provider,
            window5h,
            day,
            failed5h,
            resetAt: typeof row.resetAt === 'string' ? row.resetAt : null,
            lastAt: typeof row.lastAt === 'string' ? row.lastAt : null,
        }];
    });
    return { status: 'ok', result: { usage, countedBy: 'app' } };
}

/*
 * ── 레이더 ① 글 분석 — 앱이 워커에서 근거·프롬프트를 받아 내 구독으로 분석한다 (사장님 결정 2026-09-16) ──
 *
 * 사이트는 글 주소와 실측용 키만 보낸다 — 앱이 검색광고·오픈API·API HUB 칸만 골라 워커 실측에 쓴다.
 * 분석 결과 모양은 워커 radar-analyze 의 analysis 와 같다.
 */
export async function bridgeRadarAnalyze(input: {
    url: string;
    keys: Record<string, string>;
    provider?: string;
}): Promise<BridgeCallResult<{ analysis: RadarAnalysis; provider: string }>> {
    const called = await bridgeCall<{ analysis?: RadarAnalysis; error?: string; provider?: string }>('/v1/bridge/radar-analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: input.url, keys: input.keys, provider: input.provider || '' }),
    }, 300_000);
    if (called.status !== 'ok') return called;
    const analysis = called.result.analysis;
    // 화면이 바로 쓰는 칸(질의·핵심 키워드)이 없으면 성공으로 넘기지 않는다 — 다음 걸음이 빈 검색이 된다.
    if (!analysis || !Array.isArray(analysis.queries) || !Array.isArray(analysis.coreKeywords)) {
        return { status: 'error', message: String(called.result.error || '앱이 글 분석을 돌려주지 못했습니다.') };
    }
    return { status: 'ok', result: { analysis, provider: String(called.result.provider || '') } };
}
