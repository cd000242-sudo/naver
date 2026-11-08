/**
 * The last community list the browser drew, kept in sessionStorage so the next visit can draw it BEFORE the
 * server answers (stale-while-revalidate). Public list information only: post rows as the screen draws them,
 * the board settings, the weekly top and the board counts. Never a token, a password, a phone number, or the
 * user id itself (keys carry a short one-way tag of it). Emptied on logout and when another person logs in.
 */
import { normalizePosts, type PostItem } from './communityData';
import { feedViewKey, userTag, type FeedConfig } from './communityFeedModel.mjs';

const PREFIX = 'leaderspro.community.feed.v1';
const INDEX_KEY = `${PREFIX}:index`;
const MAX_LISTS = 16;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

type View = { board: string; sort: string; page: number };

/** What one screen is drawn from. `config` and `weekly` are null until some answer carried them. */
export type CachedFeed = {
    pinned: PostItem[];
    posts: PostItem[];
    total: number;
    totalPages: number;
    counts: Record<string, number>;
    config: FeedConfig | null;
    weekly: PostItem[] | null;
};

type Stamped = { v: 1; savedAt: number };
type ListEntry = Stamped & { pinned: unknown[]; posts: unknown[]; total: number; totalPages: number; counts: Record<string, number> };
type MetaEntry = Stamped & { config: FeedConfig | null; weekly: unknown[] | null; counts: Record<string, number> };

function store(): Storage | null {
    try {
        return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
        return null;
    }
}

function parse<T extends Stamped>(raw: string | null): T | null {
    if (!raw) return null;
    try {
        const value = JSON.parse(raw) as T;
        const fresh = value && value.v === 1 && Number.isFinite(value.savedAt) && Date.now() - value.savedAt < MAX_AGE_MS;
        return fresh ? value : null;
    } catch {
        return null;
    }
}

const readIndex = (area: Storage): string[] => {
    try {
        const list = JSON.parse(area.getItem(INDEX_KEY) || '[]') as unknown;
        return Array.isArray(list) ? list.filter((key): key is string => typeof key === 'string') : [];
    } catch {
        return [];
    }
};

/** Rows are re-normalized both ways, so only the fields the screen knows can ever be stored or drawn. */
const rows = (raw: unknown): PostItem[] => normalizePosts(raw).map((post) => ({ ...post, body: '' }));

const listKey = (userId: string, view: View) => `${PREFIX}:${userTag(userId)}:${feedViewKey(view)}`;
const metaKey = (userId: string) => `${PREFIX}:${userTag(userId)}:meta`;

function remember(area: Storage, keys: string[]): void {
    const kept = readIndex(area).filter((key) => !keys.includes(key));
    const next = [...kept, ...keys];
    const lists = next.filter((key) => !key.endsWith(':meta'));
    for (const old of lists.slice(0, Math.max(0, lists.length - MAX_LISTS))) {
        area.removeItem(old);
        next.splice(next.indexOf(old), 1);
    }
    area.setItem(INDEX_KEY, JSON.stringify(next));
}

export function writeFeedCache(userId: string, view: View, feed: CachedFeed): void {
    const area = store();
    if (!area || !userId) return;
    try {
        const savedAt = Date.now();
        const previous = parse<MetaEntry>(area.getItem(metaKey(userId)));
        const list: ListEntry = {
            v: 1, savedAt, pinned: rows(feed.pinned), posts: rows(feed.posts),
            total: feed.total, totalPages: feed.totalPages, counts: feed.counts,
        };
        const meta: MetaEntry = {
            v: 1, savedAt,
            config: feed.config ?? previous?.config ?? null,
            weekly: feed.weekly ? rows(feed.weekly) : previous?.weekly ?? null,
            counts: { ...previous?.counts, ...feed.counts },
        };
        area.setItem(listKey(userId, view), JSON.stringify(list));
        area.setItem(metaKey(userId), JSON.stringify(meta));
        remember(area, [listKey(userId, view), metaKey(userId)]);
    } catch {
        // Storage may be full or blocked; the screen simply has nothing saved to draw first.
    }
}

export function readFeedCache(userId: string, view: View): CachedFeed | null {
    const area = store();
    if (!area || !userId) return null;
    try {
        const list = parse<ListEntry>(area.getItem(listKey(userId, view)));
        if (!list) return null;
        const meta = parse<MetaEntry>(area.getItem(metaKey(userId)));
        return {
            pinned: rows(list.pinned), posts: rows(list.posts),
            total: Number(list.total) || 0, totalPages: Number(list.totalPages) || 0,
            counts: { ...meta?.counts, ...list.counts },
            config: meta?.config ?? null,
            weekly: meta?.weekly ? rows(meta.weekly) : null,
        };
    } catch {
        return null;
    }
}

/** A post this person has already seen in some saved list (or the weekly top): the detail page draws it first. */
export function findCachedPost(userId: string, id: string): PostItem | null {
    const area = store();
    if (!area || !userId || !id) return null;
    try {
        const tag = `${PREFIX}:${userTag(userId)}:`;
        for (const key of readIndex(area).filter((entry) => entry.startsWith(tag))) {
            const entry = JSON.parse(area.getItem(key) || 'null') as { pinned?: unknown[]; posts?: unknown[]; weekly?: unknown[] } | null;
            const found = rows([...(entry?.pinned || []), ...(entry?.posts || []), ...(entry?.weekly || [])]).find((post) => post.id === id);
            if (found) return found;
        }
    } catch {
        // A damaged entry just means "not known".
    }
    return null;
}

/** Forget every saved list (logout, another person logging in, a dead session). */
export function clearFeedCache(): void {
    const area = store();
    if (!area) return;
    try {
        for (const key of readIndex(area)) area.removeItem(key);
        area.removeItem(INDEX_KEY);
    } catch {
        // Nothing more to do.
    }
}
