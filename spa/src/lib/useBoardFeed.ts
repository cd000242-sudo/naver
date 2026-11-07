import { useCallback, useEffect, useState } from 'react';
import { boardApi } from './communityApi';
import { normalizePosts, type PostItem } from './communityData';
import { ALL_BOARD, BOARD_ORDER, mergeBoardPages, type SortKey } from './communityModel.mjs';

export type Feed = {
    status: 'loading' | 'ready' | 'error';
    pinned: PostItem[];
    posts: PostItem[];
    total: number;
    totalPages: number;
    message: string;
    /** Post counts per board, as far as they are known (all-boards view knows every board). */
    counts: Record<string, number>;
};

const EMPTY: Feed = { status: 'loading', pinned: [], posts: [], total: 0, totalPages: 0, message: '', counts: {} };

type Reply = { posts: PostItem[]; pinned: PostItem[]; total: number };

function toReply(result: Record<string, unknown>): Reply {
    return {
        posts: normalizePosts(result.posts),
        pinned: normalizePosts(result.pinned),
        total: Number(result.total) || 0,
    };
}

/**
 * The list for the current view. One board = one server call. "All boards" asks every board for its first page
 * (20 rows, in the chosen sort) in parallel and merges them here, because the server lists a single board at a time.
 * `reloadKey` forces a fresh read (after writing, deleting, reloading).
 */
export function useBoardFeed(view: { board: string; sort: SortKey; page: number }, reloadKey: number): Feed & { reload: () => void } {
    const [feed, setFeed] = useState<Feed>(EMPTY);
    const [again, setAgain] = useState(0);
    const reload = useCallback(() => setAgain((value) => value + 1), []);

    useEffect(() => {
        let alive = true;
        setFeed((previous) => ({ ...previous, status: 'loading', message: '' }));
        const run = async () => {
            if (view.board !== ALL_BOARD) {
                const result = await boardApi.posts({ board: view.board, sort: view.sort, page: view.page });
                if (!alive) return;
                if (!result.ok) { setFeed((previous) => ({ ...previous, status: 'error', message: result.message })); return; }
                const reply = toReply(result);
                setFeed((previous) => ({
                    status: 'ready', pinned: reply.pinned, posts: reply.posts, total: reply.total,
                    totalPages: Number(result.totalPages) || 0, message: '', counts: { ...previous.counts, [view.board]: reply.total },
                }));
                return;
            }
            const results = await Promise.all(BOARD_ORDER.map((board) => boardApi.posts({ board, sort: view.sort, page: 1 })));
            if (!alive) return;
            const failed = results.find((result) => !result.ok);
            if (failed && results.every((result) => !result.ok)) {
                setFeed((previous) => ({ ...previous, status: 'error', message: failed.ok ? '' : failed.message }));
                return;
            }
            const replies = results.map((result) => (result.ok ? toReply(result) : null));
            const merged = mergeBoardPages(replies, { sort: view.sort, page: view.page });
            const counts: Record<string, number> = {};
            BOARD_ORDER.forEach((board, index) => { const reply = replies[index]; if (reply) counts[board] = reply.total; });
            setFeed({ status: 'ready', ...merged, message: '', counts });
        };
        void run();
        return () => { alive = false; };
    }, [view.board, view.sort, view.page, reloadKey, again]);

    return { ...feed, reload };
}
