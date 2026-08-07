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

/** 공지를 한 번만 받아온다. 이미 받았거나 요청 중이면 그대로 둔다. */
export function loadNoticeAlerts(limit = 5): Promise<void> {
    if (state.loaded || inflight) return inflight || Promise.resolve();
    inflight = fetchHomeNotices(limit)
        .then((notices) => {
            const list = Array.isArray(notices) ? notices : [];
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
