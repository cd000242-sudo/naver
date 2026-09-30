import { callWorkerRaw } from './keywordApi';

/**
 * 홈판 벤치마크 원천 원문을 워커에서 받는다(2026-10-01 실시간 판).
 * 액션 하나(homefeed-benchmark-feeds)만 부르고 개인 키 · 라이선스는 싣지 않는다(callWorkerRaw). AI 를 부르지 않는다.
 * 워커는 원천을 1분 캐시한다 — 연타해도 원천을 두드리지 않는다. 실패하면 null(화면은 CI 판으로 그린다).
 */
export type LiveFeed = { id: string; platform: string; name: string; status: string; text?: string; reason?: string };

export async function fetchLiveFeeds(): Promise<{ fetchedAt: string; feeds: LiveFeed[] } | null> {
    const result = await callWorkerRaw('homefeed-benchmark-feeds', {});
    if (!result || result.ok !== true || !Array.isArray(result.feeds) || typeof result.fetchedAt !== 'string') return null;
    return { fetchedAt: result.fetchedAt, feeds: result.feeds as LiveFeed[] };
}
