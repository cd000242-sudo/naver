import type { fetchHotKeywords, fetchRealtimeIssues } from './keywordApi';
export type RealtimeSourceId = 'signal' | 'popular' | 'daum' | 'google';
export type RealtimeSourceItem = {
    rank: number;
    keyword: string;
    state?: string | null;
    stateDelta?: number | null;
    approxTraffic?: string | null;
    firstSeenAt?: number | null;
    prevRank?: number | null;
    rankDelta?: number | null;
};
export type RealtimeSource = {
    id: RealtimeSourceId;
    label: string;
    detail: string;
    items: RealtimeSourceItem[];
    sourceAt: number | null;
    checkedAt: number | null;
};
export function realtimeSources(
    realtime: Awaited<ReturnType<typeof fetchRealtimeIssues>>['data'] | null,
    hot: Awaited<ReturnType<typeof fetchHotKeywords>>['data'] | null,
): RealtimeSource[];
