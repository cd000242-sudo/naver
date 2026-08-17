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
        points: Array<{ text: string; basis: string }>;
        angle: string;
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
