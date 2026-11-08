import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { refreshCommunityProfile } from './communityAuth';
import type { PostItem } from './communityData';
import { loadCommunityFeed, peekCommunityFeed, type FeedBundle, type FeedView } from './communityFeed';
import type { FeedConfig } from './communityFeedModel.mjs';

export type Feed = {
    /** loading = nothing to draw yet (skeleton); ready = rows are drawn (saved or fresh); error = the last read failed. */
    status: 'loading' | 'ready' | 'error';
    /** A read is in flight while rows are already drawn: show a small sign, never blank the list. */
    refreshing: boolean;
    /** The rows drawn are the saved ones from the last visit, not yet replaced by the server's answer. */
    stale: boolean;
    pinned: PostItem[];
    posts: PostItem[];
    total: number;
    totalPages: number;
    message: string;
    /** Post counts per board, as far as they are known. */
    counts: Record<string, number>;
    /** Board settings and this week's top: from the same answer as the list, or saved from the last visit. */
    config: FeedConfig | null;
    weekly: PostItem[];
};

type Extras = { config: FeedConfig | null; weekly: PostItem[] | null; counts: Record<string, number> };
type Fresh = { key: string; bundle: FeedBundle };

/**
 * The list for the current view, in ONE server call (`community-feed`; an old server is read the old way, see
 * communityFeed.ts). What the browser saved last time is drawn first, at once, and replaced when the answer
 * arrives. `reloadKey` forces a fresh read (after writing, deleting, reloading).
 */
export function useBoardFeed(view: FeedView, reloadKey: number): Feed & { reload: () => void } {
    const key = `${view.board}|${view.sort}|${view.page}|${view.board === 'promo' ? view.platform ?? 'naver' : ''}`;
    const saved = useMemo(() => peekCommunityFeed(view)?.bundle ?? null, [key]); // eslint-disable-line react-hooks/exhaustive-deps
    const [fresh, setFresh] = useState<Fresh | null>(null);
    const [extras, setExtras] = useState<Extras>({ config: null, weekly: null, counts: {} });
    const [read, setRead] = useState({ refreshing: true, error: '' });
    const [again, setAgain] = useState(0);
    const reload = useCallback(() => setAgain((value) => value + 1), []);
    // Only an old server needs the settings and the weekly top as calls of their own.
    const settingsRead = useRef(false);
    const weeklyFor = useRef<number | null>(null);
    const profileFor = useRef<number | null>(null);

    useEffect(() => {
        let alive = true;
        setRead({ refreshing: true, error: '' });
        const wants = { config: !settingsRead.current, weekly: weeklyFor.current !== reloadKey };
        void loadCommunityFeed(view, wants).then((result) => {
            if (!alive) return;
            if (!result.ok) { setRead({ refreshing: false, error: result.message }); return; }
            const { bundle } = result;
            if (bundle.config) settingsRead.current = true;
            if (bundle.weekly) weeklyFor.current = reloadKey;
            if (result.source === 'legacy' && profileFor.current !== reloadKey) {
                profileFor.current = reloadKey;
                void refreshCommunityProfile();
            }
            setFresh({ key, bundle });
            setExtras((previous) => ({
                config: bundle.config ?? previous.config,
                weekly: bundle.weekly ?? previous.weekly,
                counts: { ...previous.counts, ...bundle.counts },
            }));
            setRead({ refreshing: false, error: '' });
        });
        return () => { alive = false; };
    }, [view.board, view.sort, view.page, view.platform, reloadKey, again]); // eslint-disable-line react-hooks/exhaustive-deps

    const shown = fresh && fresh.key === key ? fresh.bundle : saved;
    const status = read.error ? 'error' : shown ? 'ready' : 'loading';
    return {
        status,
        refreshing: read.refreshing && shown !== null,
        stale: read.refreshing && shown !== null && shown === saved,
        pinned: shown?.pinned ?? [],
        posts: shown?.posts ?? [],
        total: shown?.total ?? 0,
        totalPages: shown?.totalPages ?? 0,
        message: read.error,
        counts: { ...shown?.counts, ...extras.counts },
        config: extras.config ?? shown?.config ?? null,
        weekly: extras.weekly ?? shown?.weekly ?? [],
        reload,
    };
}
