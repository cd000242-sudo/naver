import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { mergeLatest, newBoardMap, newestMillis, type BoardNewMap } from './boardNew.mjs';
import { getBoardNewSnapshot, markBoardOpened, recordBoardLatest, recordBoardPosts, subscribeBoardNew } from './boardNewStore';
import type { PostItem } from './communityData';
import { loadCommunitySession } from './communitySession';
import { SECRET_BOARD, secretAccess } from './communitySecret.mjs';
import { useNoticeAlerts } from './useNoticeAlerts';

/**
 * Which boards hold a post this device has not seen yet (the yellow NEW! marks), 2026-11-25.
 * Sources, all already on the page — no request is made for it:
 *  - 공지사항: the notice list the top bar already loads on every page (its dates),
 *  - every other board: the rows of the community lists the screen received (see `useBoardNewTracking`),
 *    kept on this device so the top menu can read them on pages outside the community.
 */
export function useNewBoards(): BoardNewMap {
    const snapshot = useSyncExternalStore(subscribeBoardNew, getBoardNewSnapshot, getBoardNewSnapshot);
    const { notices } = useNoticeAlerts();
    const noticeAt = useMemo(() => newestMillis(notices.map((notice) => notice.date)), [notices]);
    useEffect(() => { if (noticeAt) recordBoardLatest({ notice: noticeAt }); }, [noticeAt]);
    // 시크릿 클래스 sends its posts to the allowed only: for anybody else (or a guest) a time left on this device marks nothing.
    const secretOpen = secretAccess(loadCommunitySession()).allowed;
    return useMemo(() => newBoardMap({
        latest: mergeLatest(snapshot.latest, noticeAt ? { notice: noticeAt } : null),
        opened: snapshot.opened,
        now: Date.now(),
        exclude: secretOpen ? [] : [SECRET_BOARD],
    }), [snapshot, noticeAt, secretOpen]);
}

type TrackedFeed = { status: string; refreshing: boolean; pinned: readonly PostItem[]; posts: readonly PostItem[]; weekly: readonly PostItem[] };

/**
 * The community screen tells the memory what it received: every row (any board, sort or page) moves that board's newest
 * post time forward, and a list of ONE board that is on screen with the server's fresh rows marks that board as opened.
 * `listing` is false on a post, the write form, the lock screen and other non-list screens.
 */
export function useBoardNewTracking({ board, listing, feed }: { board: string; listing: boolean; feed: TrackedFeed }): void {
    const { pinned, posts, weekly, status, refreshing } = feed;
    useEffect(() => { recordBoardPosts([...pinned, ...posts, ...weekly]); }, [pinned, posts, weekly]);
    useEffect(() => {
        if (listing && status === 'ready' && !refreshing) markBoardOpened(board);
    }, [board, listing, status, refreshing, pinned, posts]);
}
