import { callWorkerRaw } from './keywordApi';

/**
 * 홈판 벤치마크 원천 원문을 워커에서 받는다(2026-10-01 실시간 판).
 * 액션 하나(homefeed-benchmark-feeds)만 부르고 개인 키 · 라이선스는 싣지 않는다(callWorkerRaw). AI 를 부르지 않는다.
 * 출처가 188곳이라 워커는 한 요청에 40곳씩(batch) 준다 — 첫 묶음이 전체 묶음 수를 알려 주면 나머지를 동시에 부른다.
 * 워커는 묶음마다 1분 캐시한다. 한 묶음이 실패해도 받은 것으로 그린다(빠진 출처는 화면이 '확인 못함'으로 적는다).
 */
export type LiveFeed = { id: string; platform: string; name: string; status: string; text?: string; reason?: string };
type Batch = { fetchedAt: string; batches: number; feeds: LiveFeed[] };

async function batchOf(batch: number): Promise<Batch | null> {
    const result = await callWorkerRaw('homefeed-benchmark-feeds', { batch: String(batch) });
    if (!result || result.ok !== true || !Array.isArray(result.feeds) || typeof result.fetchedAt !== 'string') return null;
    return { fetchedAt: result.fetchedAt, batches: Math.max(1, Math.min(20, Number(result.batches) || 1)), feeds: result.feeds as LiveFeed[] };
}

export async function fetchLiveFeeds(): Promise<{ fetchedAt: string; feeds: LiveFeed[] } | null> {
    const first = await batchOf(0);
    if (!first) return null;
    const rest = await Promise.all(Array.from({ length: first.batches - 1 }, (_, i) => batchOf(i + 1)));
    return { fetchedAt: first.fetchedAt, feeds: [first, ...rest].flatMap((b) => (b ? b.feeds : [])) };
}
