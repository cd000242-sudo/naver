import { bridgeCall } from './bridge';
import { pullMyBlogSync, type AdvisorDailyView } from './myBlogSync';

/**
 * 벤치마크 판에 맞댈 실측 홈판 기록(어드바이저)을 가져온다(2026-10-01).
 * 이 PC 에서 LEWORD 앱이 켜져 있으면 앱에서 바로(가장 최신), 아니면 비밀번호로 잠근 동기화본에서.
 * 둘 다 없으면 null — 판은 그대로 그리고 '로그인 · 동기화하면 표시된다'고 적는다. AI 를 부르지 않는다.
 */
export async function loadAdvisorDaily(): Promise<{ from: 'app' | 'sync'; daily: AdvisorDailyView } | null> {
    try {
        const direct = await bridgeCall<{ record: AdvisorDailyView | null }>('/v1/bridge/my-blog/advisor-daily', undefined, 4000);
        if (direct.status === 'ok' && direct.result.record) return { from: 'app', daily: direct.result.record };
    } catch { /* 앱이 없다 — 동기화본으로 */ }
    try {
        const pulled = await pullMyBlogSync();
        if (pulled.status === 'ok' && pulled.bundle.daily) return { from: 'sync', daily: pulled.bundle.daily };
    } catch { /* 동기화 없음 */ }
    return null;
}
