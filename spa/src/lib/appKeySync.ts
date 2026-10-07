/**
 * 앱 ↔ 사이트 API 키 맞추기(2026-10-07 사장님 "앱에서 등록됐다면 로그인했을 때 읽고 내 api 키에 자동 연동되어야 정상").
 * 같은 PC 에 LEWORD 앱이 켜져 있으면 브리지로 앱 키를 읽어 칸마다 판정(appKeySyncPlan)하고,
 * 사이트 쪽이 나중이면 앱 설정에 넣고, 앱 쪽이 나중이면 사이트 키를 바꾼다. 앱이 꺼져 있으면 아무것도 안 한다(다음 기회에).
 * 사이트 키가 바뀌면 저장 이벤트로 계정 동기화(keySync)가 암호문을 올려 다른 기기까지 간다.
 */
import { bridgeApiKeys, bridgeSaveApiKeys } from './bridge';
import { loadUserKeys, loadUserKeysMeta, markKeysSyncedToApp, saveUserKeys, type UserKeys } from './userKeys';
import { planKeySync } from './appKeySyncPlan.mjs';

export type AppKeySyncResult = { status: 'synced' | 'offline' | 'outdated'; toApp: number; toSite: number };

let running: Promise<AppKeySyncResult> | null = null;

export function syncKeysWithApp(): Promise<AppKeySyncResult> {
    if (running) return running;
    running = (async (): Promise<AppKeySyncResult> => {
        const app = await bridgeApiKeys();
        if (app.status !== 'ok') return { status: app.status, toApp: 0, toSite: 0 };
        const meta = loadUserKeysMeta();
        const site = loadUserKeys();
        const plan = planKeySync({ siteKeys: site as Record<string, string>, siteSavedAt: meta.savedAt, sitePending: meta.pendingToApp, appKeys: app.keys, appSavedAt: app.savedAt });
        let toApp = 0;
        if (plan.appChanged) {
            // 사이트가 나중이면 사이트의 저장 시각을, 앱이 비어 있던 칸만 채우는 경우엔 지금 시각을 남긴다.
            const stamp = plan.siteNewer && meta.savedAt ? meta.savedAt : new Date().toISOString();
            const saved = await bridgeSaveApiKeys(plan.toApp, stamp);
            if (saved !== 'ok') return { status: saved, toApp: 0, toSite: 0 };
            toApp = Object.keys(plan.toApp).length;
        }
        const toSite = Object.keys(plan.nextSite).filter((k) => plan.nextSite[k] !== (site as Record<string, string | undefined>)[k]).length;
        if (plan.siteChanged) saveUserKeys(plan.nextSite as UserKeys, { source: 'app', savedAt: app.savedAt || new Date().toISOString() });
        else if (meta.pendingToApp) markKeysSyncedToApp();
        return { status: 'synced', toApp, toSite };
    })().finally(() => { running = null; });
    return running;
}
