import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { fetchHomeNotices, type HomeNotice } from './siteOps';
import { markNoticesSeen, unseenNotices } from './noticeAlerts';

/**
 * 공지 알림 공용 스토어.
 *
 * 네비바·플로팅 버튼·홈 운영보드가 트리의 서로 다른 위치에 있어서 Context 로 묶으면
 * Layout 까지 프롭을 끌고 다녀야 한다. 모듈 스코프 스토어 + useSyncExternalStore 로
 * 한 번만 받아오고 모두가 같은 값을 구독한다.
 */

type NoticeAlertState = {
    notices: HomeNotice[];
    unseen: HomeNotice[];
    loaded: boolean;
};

const EMPTY: NoticeAlertState = { notices: [], unseen: [], loaded: false };

let state: NoticeAlertState = EMPTY;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
    for (const listener of listeners) listener();
}

function setState(next: NoticeAlertState): void {
    state = next;
    emit();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot(): NoticeAlertState {
    return state;
}

/*
 * 세션당 한 번만 받으면 **열려 있던 탭은 새 공지를 영영 모른다** (2026-08-12 실사고:
 * 어드민에서 공지를 발행했는데 이미 열려 있던 사이트 탭에 알림이 안 떴다 —
 * 탭을 새로 여는 사람한테만 뜨는 알림이었다). 받은 지 5분이 지난 채로 탭에
 * 돌아오면 다시 받아온다. 읽음 서명은 localStorage 라 다시 받아도 유지된다.
 */
const RELOAD_AFTER_MS = 5 * 60 * 1000;
let loadedAtMs = 0;

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (!state.loaded || inflight) return;
        if (Date.now() - loadedAtMs < RELOAD_AFTER_MS) return;
        state = { ...state, loaded: false };
        void loadNoticeAlerts();
    });
}

/** 공지를 받아온다. 이미 받았거나 요청 중이면 그대로 둔다(위 visibilitychange 가 갱신). */
export function loadNoticeAlerts(limit = 5): Promise<void> {
    if (state.loaded || inflight) return inflight || Promise.resolve();
    inflight = fetchHomeNotices(limit)
        .then((notices) => {
            const list = Array.isArray(notices) ? notices : [];
            loadedAtMs = Date.now();
            setState({ notices: list, unseen: unseenNotices(list), loaded: true });
        })
        .catch(() => {
            // 공지 로딩 실패는 배지를 안 띄우는 것으로 끝낸다. 화면을 막지 않는다.
            setState({ notices: [], unseen: [], loaded: true });
        })
        .finally(() => {
            inflight = null;
        });
    return inflight;
}

/** 안 읽은 공지를 모두 읽음 처리하고 배지를 즉시 내린다. */
export function markAllNoticesSeen(): void {
    if (state.notices.length === 0) return;
    markNoticesSeen(state.notices);
    setState({ ...state, unseen: [] });
}

export function useNoticeAlerts(limit = 5): NoticeAlertState & { markAllSeen: () => void } {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        void loadNoticeAlerts(limit);
    }, [limit]);

    const markAllSeen = useCallback(() => {
        markAllNoticesSeen();
    }, []);

    return { ...snapshot, markAllSeen };
}

/** 배지 숫자만 필요할 때 쓰는 축약형. */
export function useUnseenNoticeCount(limit = 5): number {
    return useNoticeAlerts(limit).unseen.length;
}
