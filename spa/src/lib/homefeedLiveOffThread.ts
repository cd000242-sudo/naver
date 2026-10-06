import { mergeLiveBoard } from './homefeedLive.mjs';

/**
 * 실시간 판 계산을 작업 스레드에서 돌린다(2026-10-06). 소재 묶기가 19초라 화면 스레드에서 돌면 그동안 화면이 멈췄다.
 * 작업 스레드를 못 쓰는 환경(옛 브라우저 · 테스트)에서는 예전처럼 화면에서 계산한다 — 결과는 같은 함수라 같다.
 */
export function mergeLiveBoardOffThread(raw: unknown, feeds: unknown, fetchedAt: string): Promise<Record<string, unknown>> {
    if (typeof Worker === 'undefined') return Promise.resolve(mergeLiveBoard(raw, feeds, fetchedAt));
    return new Promise((resolve, reject) => {
        let worker: Worker;
        try {
            worker = new Worker(new URL('./homefeedLiveWorker.mjs', import.meta.url), { type: 'module' });
        } catch {
            resolve(mergeLiveBoard(raw, feeds, fetchedAt));
            return;
        }
        worker.onmessage = (event: MessageEvent<{ ok: boolean; board?: Record<string, unknown>; error?: string }>) => {
            worker.terminate();
            if (event.data?.ok && event.data.board) resolve(event.data.board);
            else reject(new Error(event.data?.error || '실시간 판 계산 실패'));
        };
        worker.onerror = (event) => {
            worker.terminate();
            reject(new Error(event.message || '실시간 판 계산 실패'));
        };
        worker.postMessage({ raw, feeds, fetchedAt });
    });
}
