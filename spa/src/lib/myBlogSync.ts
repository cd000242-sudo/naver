/**
 * 내 블로그 앱 실측 동기화 — 앱 브리지(/v1/bridge/my-blog/advisor-daily · today-plan)가 준 판을
 * 비밀번호 유도 키로 잠가 워커(advisor:<slot>)에 올리고, 어느 브라우저에서든 같은 비밀번호로 연다(플랜 B, 2026-09-30).
 *
 * 앱이 넘기는 판(sync-view)에는 계정 id·글 id·창구 이름이 없다. 여기서는 그것을 그대로 잠그기만 한다.
 * 404 는 '앱이 구버전'(bridgeCall 규칙). 동기화(비밀번호 키)가 꺼져 있으면 올리지도 내리지도 않는다.
 */
import { bridgeCall, type BridgeFailure } from './bridge';
import { callWorkerRaw } from './keywordApi';
import { keySyncSlot, openWithKeySync, sealWithKeySync } from './keySync';
import { packBundle, unpackBundle } from './syncPack.mjs';

// bridgeCall 이 앞에 BRIDGE_BASE 를 붙인다 — 여기서 또 붙이면 주소가 두 번 겹쳐 앱에 못 닿는다(2026-10-01 수리).
const ROUTE = '/v1/bridge/my-blog/';
const BLOB_LIMIT = 65536;

export type SeatVerdict = '열림' | '반열림' | '잠김' | '카드답' | '자료없음';
export type TodayEvidence = 'popularWeek' | 'trendDay' | 'risingDay' | 'myTopic' | 'myPost' | 'homefeedTitle';

export interface TodayKeywordRow {
    keyword: string;
    topic: string;
    evidence: TodayEvidence[];
    rankChange: number | null;
    myPosts: { count: number; homefeedHits: number; unmeasured: number };
    homefeedTitleMatches: number;
    searchVolume: number | null;
    seat: { verdict: SeatVerdict; facing: number; vacancy: number | null; sampled: number } | null;
}

export interface TodayHourValue { hour: number; value: number }

export interface TodayTimeFacts {
    myHoursYesterday: TodayHourValue[];
    myHoursMonth: TodayHourValue[];
    topicHours: { topic: string; hours: TodayHourValue[] } | null;
    homefeedPublish: { daysWithHomefeed: number; daysMeasured: number; hours: { hour: number; posts: number }[]; postsPerDay: number[]; gapsMinutes: number[] } | null;
}

export type TodayTitles =
    | { status: 'ok'; provider: string | null; items: { keyword: string; titles: string[]; rejected: { title: string; reasons: string[] }[] }[] }
    | { status: 'no-engine'; reason: string };

export interface TodayPlanView {
    day: string;
    builtAt: string;
    candidatesTotal: number;
    keywords: TodayKeywordRow[];
    measured: { searchVolume: number; seat: number };
    time: TodayTimeFacts;
    titles: TodayTitles;
    notes: string[];
}

export interface AdvisorDailyView {
    day: string;
    collectedAt: string;
    posts: { title: string; views: number | null; publishedAt: string | null; homefeed: { count: number; ratio: number } | null; searchCount: number | null }[];
    topicsDay: { topic: string; value: number }[];
    topicsWeek: { topic: string; value: number }[];
    myHours: { hour: number; yesterday: number; dayBefore: number; monthAverage: number }[];
    homefeedTitles: { title: string; url: string }[];
    /** 최근 7일 홈판 유입 상위(앱 v2.49.145+). 옛 앱은 없다. */
    homefeedWeek?: { day: string; rank: number; title: string; url: string }[];
    /** 여러 날에서 모은 '홈판 유입을 받은 내 글'(앱 v2.49.145+). 옛 앱은 없다. */
    myHomefeedHits?: { title: string; day: string; count: number }[];
    missingCount: number;
}

/** 워커에 잠가 두는 묶음 — 앱이 준 두 판과 올린 시각. */
export interface MyBlogSyncBundle {
    syncedAt: string;
    plan: TodayPlanView | null;
    daily: AdvisorDailyView | null;
}

export type MyBlogSyncPush =
    | { status: 'pushed'; bundle: MyBlogSyncBundle }
    | { status: 'no-sync' }
    | { status: 'empty' }
    | { status: 'too-large' }
    | { status: 'worker-failed' }
    | BridgeFailure;

/** 앱에서 두 판을 읽어 잠가 올린다. 비밀번호 동기화가 꺼져 있으면 아무것도 읽지 않는다. */
export async function pushMyBlogSync(): Promise<MyBlogSyncPush> {
    if (!keySyncSlot()) return { status: 'no-sync' };
    const [planRes, dailyRes] = await Promise.all([
        bridgeCall<{ plan: TodayPlanView | null }>(ROUTE + 'today-plan', undefined, 8000),
        bridgeCall<{ record: AdvisorDailyView | null }>(ROUTE + 'advisor-daily', undefined, 8000),
    ]);
    if (planRes.status !== 'ok') return planRes;
    if (dailyRes.status !== 'ok') return dailyRes;
    const bundle: MyBlogSyncBundle = { syncedAt: new Date().toISOString(), plan: planRes.result.plan, daily: dailyRes.result.record };
    if (!bundle.plan && !bundle.daily) return { status: 'empty' };
    // 잠그기 전에 gzip 으로 줄인다 — 7일 홈판 제목을 싣자 워커 상한 64KB 를 넘었다(2026-10-01 실측, syncPack).
    const sealed = await sealWithKeySync(await packBundle(bundle));
    if (!sealed) return { status: 'no-sync' };
    if (sealed.blob.length > BLOB_LIMIT) return { status: 'too-large' };
    try {
        const res = await callWorkerRaw('advisor-put', { slot: sealed.slot, blob: sealed.blob });
        return res && res.ok ? { status: 'pushed', bundle } : { status: 'worker-failed' };
    } catch { return { status: 'worker-failed' }; }
}

export type MyBlogSyncPull =
    | { status: 'ok'; bundle: MyBlogSyncBundle; savedAt: number | null }
    | { status: 'none' }
    | { status: 'no-sync' }
    | { status: 'unreadable' }
    | { status: 'worker-failed' };

/** 워커에서 잠긴 판을 내려 연다. 비밀번호 키가 다르면 unreadable. */
export async function pullMyBlogSync(): Promise<MyBlogSyncPull> {
    const slot = keySyncSlot();
    if (!slot) return { status: 'no-sync' };
    let res: Record<string, unknown> | null;
    try { res = await callWorkerRaw('advisor-get', { slot }); } catch { return { status: 'worker-failed' }; }
    if (!res || !res.ok) return { status: 'worker-failed' };
    const blob = typeof res.blob === 'string' ? res.blob : '';
    if (!blob) return { status: 'none' };
    const bundle = await unpackBundle<MyBlogSyncBundle>(await openWithKeySync(blob));
    if (!bundle || typeof bundle !== 'object') return { status: 'unreadable' };
    return { status: 'ok', bundle, savedAt: typeof res.savedAt === 'number' ? res.savedAt : null };
}
