/**
 * 앱에서 만든 '글 한 편 유입 설계' 가져오기(2026-10-06 사이트판 설계실 4차).
 * 사이트는 혼자서 ①~④ 를 재고, 앱 설계(홈판 제목 · 내 크기 · 링크 자리 · 3/7일 결과)는 여기서 받아 같은 화면에 덧붙인다.
 *   1) 같은 PC 에서 앱이 켜져 있으면 브리지로 바로 읽고(from 'app'), 비밀번호 동기화가 켜져 있으면 잠가 계정에 올린다.
 *   2) 앱이 꺼져 있으면(폰 등) 계정에 잠가 둔 사본을 연다(from 'sync'). 서버는 암호문만 본다 — myBlogSync 와 같은 방식.
 */
import { bridgeCall } from './bridge';
import { callWorkerRaw } from './keywordApi';
import { keySyncSlot, openWithKeySync, sealWithKeySync } from './keySync';
import { packBundle, unpackBundle } from './syncPack.mjs';

const BLOB_LIMIT = 65536;

export interface AppPlanSpot { title: string; link: string; where: string; postdate: string; action: string; reason: string }
export interface AppPlan {
    id: string;
    keyword: string;
    createdAt: string;
    updatedAt: string;
    judge: { searchVolume: number | null; documentCount: number | null; seat: string | null; facing: number | null; vacancy: number | null; range: string | null; rangeReason: string } | null;
    titles: { search: string[]; homefeed: string[] } | null;
    inflow: { postUrl: string; postTitle: string; found: number; relevant: number; skipped: number; spots: AppPlanSpot[]; answered: number } | null;
    result: {
        registeredAt: string;
        pick: { seat: string | null; facing: number | null; searchVolume: number | null; range: string | null } | null;
        checks: Array<{ day: number; rank: number | null; sampled: number; status: string; at: string }>;
        latest: { rank: number | null; sampled: number; status: string; at: string } | null;
        homefeed: { day: string; count: number; views: number | null } | null;
    } | null;
}

interface PlanBundle { syncedAt: string; plans: AppPlan[] }

export type AppPlansLoad =
    | { status: 'ok'; from: 'app' | 'sync'; plans: AppPlan[]; syncedAt: string | null }
    | { status: 'none' };

/** 앱 설계를 가져온다 — 브리지가 먼저, 안 되면 계정 사본. 둘 다 없으면 none(화면은 그 구획을 안 그린다). */
export async function loadAppPlans(): Promise<AppPlansLoad> {
    const live = await bridgeCall<{ plans: AppPlan[] }>('/v1/bridge/my-blog/post-plans', undefined, 8000);
    if (live.status === 'ok' && Array.isArray(live.result.plans)) {
        const plans = live.result.plans;
        void pushPlans(plans);
        return { status: 'ok', from: 'app', plans, syncedAt: new Date().toISOString() };
    }
    const slot = keySyncSlot();
    if (!slot) return { status: 'none' };
    const res = await callWorkerRaw('post-plan-get', { slot });
    const blob = res && res.ok && typeof res.blob === 'string' ? res.blob : '';
    if (!blob) return { status: 'none' };
    const bundle = await unpackBundle<PlanBundle>(await openWithKeySync(blob));
    if (!bundle || !Array.isArray(bundle.plans)) return { status: 'none' };
    return { status: 'ok', from: 'sync', plans: bundle.plans, syncedAt: bundle.syncedAt || null };
}

/** 브리지로 읽은 설계를 잠가 계정에 올린다 — 폰에서도 보이게. 동기화가 꺼져 있거나 너무 크면 조용히 건너뛴다. */
async function pushPlans(plans: AppPlan[]): Promise<void> {
    if (!keySyncSlot() || !plans.length) return;
    const sealed = await sealWithKeySync(await packBundle({ syncedAt: new Date().toISOString(), plans } satisfies PlanBundle));
    if (!sealed || sealed.blob.length > BLOB_LIMIT) return;
    await callWorkerRaw('post-plan-put', { slot: sealed.slot, blob: sealed.blob });
}
