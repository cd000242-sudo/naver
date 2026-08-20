/**
 * LEWORD 앱 브리지 클라이언트 — 웹이 **사용자 PC 의 클로드코드(구독)** 를 쓴다.
 *
 *   이 페이지 → http://127.0.0.1:47615 (LEWORD 앱) → 클로드코드 실행 → 응답
 *
 * 실행·비용 모두 사용자 본인 기기·본인 구독이다. 사이트는 화면일 뿐 서버도
 * 키도 없다. 앱이 꺼져 있으면 연결 실패가 정상이고, 화면은 "앱을 켜세요"로
 * 안내한다 — 지어내는 상태 표시는 없다.
 */

const BRIDGE_BASE = 'http://127.0.0.1:47615';

export interface BridgeAgentStatus {
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
 * 뒤로는 그 전제가 사라졌다. 앱이 꺼져 있으면 null 이고, 화면은 앱을 켜라고
 * 안내한다 — 지어낸 확장어를 보여주지 않는다.
 */
export async function bridgeMindmap(keyword: string, light = false): Promise<BridgeMindmap | null> {
    const body = await bridgeFetch('/v1/bridge/mindmap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyword, light }),
    }, 90_000) as { result?: BridgeMindmap } | null;
    return body?.result || null;
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
 * 보내고 상태만 돌려받는다. 앱이 꺼져 있으면 null.
 */
export async function bridgeAgentLogin(provider: 'claude' | 'codex' | 'gemini' | 'grok'): Promise<
    { state: 'already' | 'done' | 'browser-opened' | 'starting' | 'failed'; loggedIn?: boolean; message?: string } | null
> {
    const body = await bridgeFetch('/v1/bridge/agent-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
    }, 20_000) as { result?: { state: 'already' | 'done' | 'browser-opened' | 'starting' | 'failed'; loggedIn?: boolean; message?: string } } | null;
    return body?.result || null;
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
