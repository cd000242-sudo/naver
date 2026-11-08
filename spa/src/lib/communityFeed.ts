/**
 * Loads one community screen. The server answers `community-feed` with everything the screen needs in ONE call
 * (list, board settings, weekly top, counts, profile). A server that does not know the action yet (the site can be
 * deployed before the server) is read the old way — one call per piece — so deploy order never breaks the page.
 */
import { boardApi, callWithToken, type ApiFailure } from './communityApi';
import { keepToken } from './communityAuth';
import { COMMUNITY_ACTIONS } from './communityContract.mjs';
import { normalizePosts, type PostItem } from './communityData';
import { findCachedPost, readFeedCache, writeFeedCache, type CachedFeed } from './communityFeedCache';
import { FEED_PAGE_SIZE, judgeFeedReply, pickConfig, pickCounts } from './communityFeedModel.mjs';
import { ALL_BOARD, BOARD_ORDER, mergeBoardPages, type SortKey } from './communityModel.mjs';
import { loadCommunitySession, normalizeProfile } from './communitySession';

export type FeedView = { board: string; sort: SortKey; page: number };

/** One screen's worth of data. `config` / `weekly` are null when the answer did not carry them (keep what is known). */
export type FeedBundle = CachedFeed;

export type FeedLoad =
    | { ok: true; bundle: FeedBundle; source: 'feed' | 'legacy' }
    | { ok: false; code: string; message: string };

/** Which extras the old way must fetch (the one-call way always brings them). */
export type LegacyWants = { config: boolean; weekly: boolean };

const UNSUPPORTED_MEMORY_MS = 5 * 60 * 1000;
let unsupportedUntil = 0;

/** Forget that the server is old (a test, or a deploy noticed mid-session). */
export function resetFeedSupport(): void {
    unsupportedUntil = 0;
}

type Reply = { posts: PostItem[]; pinned: PostItem[]; total: number };

function toReply(result: Record<string, unknown>): Reply {
    return { posts: normalizePosts(result.posts), pinned: normalizePosts(result.pinned), total: Number(result.total) || 0 };
}

function fromFeedAnswer(result: Record<string, unknown>): FeedBundle {
    const reply = toReply(result);
    return {
        pinned: reply.pinned,
        posts: reply.posts,
        total: reply.total,
        totalPages: Number(result.totalPages) || 0,
        counts: pickCounts(result.counts),
        config: pickConfig(result),
        weekly: Array.isArray(result.weeklyTop) ? normalizePosts(result.weeklyTop) : null,
    };
}

/** The old way: the settings, the weekly top and one list per board (all boards = five lists merged here). */
async function loadLegacy(view: FeedView, wants: LegacyWants): Promise<FeedLoad> {
    const boards = view.board === ALL_BOARD ? [...BOARD_ORDER] : [view.board];
    const [settings, weekly, ...lists] = await Promise.all([
        wants.config ? boardApi.boards() : Promise.resolve(null),
        wants.weekly ? boardApi.weeklyTop(6) : Promise.resolve(null),
        ...boards.map((board) => boardApi.posts({ board, sort: view.sort, page: view.board === ALL_BOARD ? 1 : view.page })),
    ]);
    const failed = lists.find((result) => !result.ok);
    if (failed && !failed.ok && lists.every((result) => !result.ok)) return { ok: false, code: failed.code, message: failed.message };
    const replies = lists.map((result) => (result.ok ? toReply(result) : null));
    const counts: Record<string, number> = {};
    boards.forEach((board, index) => { const reply = replies[index]; if (reply) counts[board] = reply.total; });
    const base = view.board === ALL_BOARD
        ? mergeBoardPages(replies, { sort: view.sort, page: view.page })
        : { pinned: replies[0]?.pinned ?? [], posts: replies[0]?.posts ?? [], total: replies[0]?.total ?? 0, totalPages: Number((lists[0] as { totalPages?: unknown }).totalPages) || 0 };
    const bundle: FeedBundle = {
        ...base,
        counts,
        config: settings && settings.ok ? pickConfig(settings) : null,
        weekly: weekly && weekly.ok ? normalizePosts(weekly.posts) : null,
    };
    return { ok: true, bundle, source: 'legacy' };
}

/** A fresh profile in the answer updates the stored login (token kept); nothing is written when nothing changed. */
function adoptProfile(profile: unknown): void {
    const current = loadCommunitySession();
    if (!current || !profile || typeof profile !== 'object') return;
    const incoming = profile as Record<string, unknown>;
    const next = { ...current, ...normalizeProfile({ ...incoming, userId: incoming.userId || current.userId }) };
    if (JSON.stringify(next) !== JSON.stringify(current)) keepToken(current, incoming);
}

function remember(view: FeedView, bundle: FeedBundle): void {
    const session = loadCommunitySession();
    if (session) writeFeedCache(session.userId, view, bundle);
}

/**
 * One screen from the server. Never throws. On success the answer is also saved for the next visit.
 * `wants` only matters for an old server (which needs separate calls for the settings and the weekly top).
 */
export async function loadCommunityFeed(view: FeedView, wants: LegacyWants = { config: true, weekly: true }): Promise<FeedLoad> {
    const loaded = await loadFresh(view, wants);
    if (loaded.ok) remember(view, loaded.bundle);
    return loaded;
}

async function loadFresh(view: FeedView, wants: LegacyWants): Promise<FeedLoad> {
    if (Date.now() < unsupportedUntil) return loadLegacy(view, wants);
    const result = await callWithToken(COMMUNITY_ACTIONS.feed, { board: view.board, sort: view.sort, page: view.page, pageSize: FEED_PAGE_SIZE });
    const verdict = judgeFeedReply(result);
    if (verdict === 'use' && result.ok) {
        adoptProfile((result as { profile?: unknown }).profile);
        return { ok: true, bundle: fromFeedAnswer(result), source: 'feed' };
    }
    if (verdict === 'fatal') {
        const failure = result as ApiFailure;
        return { ok: false, code: failure.code, message: failure.message };
    }
    if (verdict === 'unsupported') unsupportedUntil = Date.now() + UNSUPPORTED_MEMORY_MS;
    return loadLegacy(view, wants);
}

/** What the browser saved last time for this screen and this person, to draw before the server answers. */
export function peekCommunityFeed(view: FeedView): { bundle: FeedBundle } | null {
    const session = loadCommunitySession();
    const saved = session ? readFeedCache(session.userId, view) : null;
    return saved ? { bundle: saved } : null;
}

/** A post already seen in a saved list, for the detail page to draw while the full text is on its way. */
export function findKnownPost(id: string): PostItem | null {
    const session = loadCommunitySession();
    return session ? findCachedPost(session.userId, id) : null;
}
