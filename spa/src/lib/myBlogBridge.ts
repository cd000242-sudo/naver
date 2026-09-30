/**
 * '내 블로그' 탭 ↔ LEWORD 앱 브리지(2026-09-30).
 *
 * 네이버 로그인 창·크리에이터 어드바이저 실측·내 블로그 체급 기록은 전부 사용자 PC 의 앱에 있다.
 * 사이트는 그 상태를 읽고 [로그인 창 열기]를 부탁할 뿐이다 — 비밀번호는 앱도 사이트도 보지 않는다
 * (네이버 로그인 페이지에 직접 친다). 여기 값은 앱이 실제로 잰 것만 온다.
 */
import { bridgeCall, type BridgeCallResult } from './bridge';

export interface MyBlogSession {
    loggedIn: boolean;
    windowOpen: boolean;
    /** 오늘 앱이 잡은 어드바이저 요청 줄 수. */
    capturedToday: number;
    /** 오늘 잡힌 창구 종류 수. */
    endpointCount: number;
}

export interface PlainLine { text: string; evidence: string }

/** 앱 blog-class 기록의 화면용 판 — 그리는 칸만 적는다. */
export interface MyBlogRecord {
    blogId: string;
    measuredAt: string;
    card: { headline: string | null; lines: PlainLine[]; notices: PlainLine[] };
    postsAvailable?: number;
    topicProfile?: {
        analyzed: number;
        totalPosts: number | null;
        words: Array<{ word: string; posts: number }>;
        recentWords: Array<{ word: string; posts: number }>;
        declaredTopic: string | null;
    } | null;
    wonRows?: Array<{
        keyword: string;
        blogRank: number | null;
        searchVolume: number | null;
        documentCount: number | null;
        postUrl?: string;
        topic?: string | null;
    }>;
    band?: {
        measuredCount: number;
        wonCount: number;
        nearCount: number;
        volumeMin: number;
        volumeMax: number;
        topics: Array<{ topic: string; count: number }>;
    } | null;
    rankSummary?: { candidates: number; withVolume: number; ranked: number; won: number; blocked: number; seconds: number };
}

export function myBlogSession(): Promise<BridgeCallResult<MyBlogSession>> {
    return bridgeCall<MyBlogSession>('/v1/bridge/my-blog/session', undefined, 8_000);
}

export function myBlogOpenLogin(): Promise<BridgeCallResult<{ opened: boolean }>> {
    return bridgeCall<{ opened: boolean }>('/v1/bridge/my-blog/session/open', { method: 'POST' }, 8_000);
}

/** 앱이 마지막으로 잰 내 블로그. 안 쟀으면 record 가 null — 그것도 정상 응답이다. */
export function myBlogClass(): Promise<BridgeCallResult<{ record: MyBlogRecord | null }>> {
    return bridgeCall<{ record: MyBlogRecord | null }>('/v1/bridge/my-blog/class', undefined, 8_000);
}
