import { bridgeCall } from './bridge';
import { loadUserKeys } from './userKeys';
import { createBoardPreferenceSync, type PreferenceSyncState } from './boardPreferenceSync';

const PATH = '/v1/bridge/boards/preferences';
const EVENT = 'leword:board-preference-sync';
let state: PreferenceSyncState = { status: 'idle', provider: null };
export const boardPreferenceState = () => state;
export const syncBoardPreference = createBoardPreferenceSync({
    readProvider: () => loadUserKeys().aiProvider,
    transport: {
        get: () => bridgeCall<{ provider: string | null }>(PATH, undefined, 3500),
        set: (provider) => bridgeCall<{ provider: string | null }>(PATH, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider }),
        }, 3500),
    },
    publish: (next) => { state = next; window.dispatchEvent(new Event(EVENT)); },
});
export function subscribeBoardPreference(listener: (state: PreferenceSyncState) => void): () => void {
    const update = () => listener(state);
    window.addEventListener(EVENT, update);
    update();
    return () => window.removeEventListener(EVENT, update);
}
let started = false;
export function startBoardPreferenceSync(): void {
    if (started) return;
    started = true;
    const sync = () => { void syncBoardPreference(); };
    for (const event of ['leword:keys-saved', 'leword:bridge-connected', 'focus']) window.addEventListener(event, sync);
    window.addEventListener('storage', (event) => {
        if (event.key === 'leaderspro.keyword.userKeys.v1' || event.key === null) sync();
    });
    sync();
}
export function boardPreferenceNote(value: PreferenceSyncState): string {
    const label = ({ claude: '클로드', codex: '코덱스', gemini: '제미나이', grok: '그록' } as const)[value.provider || 'claude'];
    if (value.status === 'idle') return '엔진을 선택하면 이 PC 앱의 오늘의 글감에도 우선 적용합니다.';
    if (value.status === 'syncing') return `${label} 우선 설정을 앱에 저장하는 중…`;
    if (value.status === 'synced') return `앱 저장 완료 · 다음 오늘의 글감 생성은 ${label} 우선, 실패 시 사용 가능한 다른 엔진을 시도합니다.`;
    if (value.status === 'outdated') return '브라우저 선택 저장됨 · 앱 적용 대기: LEWORD 앱을 업데이트한 뒤 연결을 다시 확인하세요.';
    if (value.status === 'offline') return '브라우저 선택 저장됨 · 앱 적용 대기: 이 PC에서 LEWORD 앱을 켠 뒤 연결을 다시 확인하세요.';
    return '브라우저 선택 저장됨 · 앱 적용 실패: 연결을 다시 확인하면 재시도합니다.';
}
