/**
 * Old-server support for the 공지사항 board. A server that predates the board files the admin-home notices (nt_)
 * under `news` and rejects `board=notice`. For such a server the screen reads the whole news board, cuts it into the
 * notices and the real news, and sorts and pages the two lists here. A new server never gets here.
 */
import { boardApi } from './communityApi';
import { NOTICE_BOARD } from './communityContract.mjs';
import { normalizePosts, type PostItem } from './communityData';
import type { FeedLoad, FeedView, LegacyWants } from './communityFeed';
import { FEED_PAGE_SIZE, pickConfig, splitNewsReplies } from './communityFeedModel.mjs';
import { mergeBoardPages } from './communityModel.mjs';

/** The server answers 50 rows at most; a news board past this many pages is cut (the newest rows win). */
const READ_SIZE = 50;
const READ_PAGES = 8;
const NOTE_MS = 5 * 60 * 1000;
const NOTE_KEY = 'leaderspro.community.feed.v1:notice-old';
let oldUntil = 0;

/** True while the server is known to file the notices under `news`. Also kept for this tab across reloads. */
export function noticeBoardIsOld(): boolean {
    if (Date.now() < oldUntil) return true;
    try {
        const saved = Number(sessionStorage.getItem(NOTE_KEY));
        if (Number.isFinite(saved) && saved > Date.now()) { oldUntil = saved; return true; }
    } catch {
        // No storage: the in-memory note is all there is.
    }
    return false;
}

export function markNoticeBoardOld(): void {
    oldUntil = Date.now() + NOTE_MS;
    try { sessionStorage.setItem(NOTE_KEY, String(oldUntil)); } catch { /* in-memory note only */ }
}

export function markNoticeBoardNew(): void {
    oldUntil = 0;
    try { sessionStorage.removeItem(NOTE_KEY); } catch { /* nothing to forget */ }
}

type Page = { posts: PostItem[]; pinned: PostItem[] };

/** Reads page 1 and then the rest of the news board (as far as READ_PAGES), so the split is complete. */
async function readNewsBoard(): Promise<{ pages: Page[] } | { code: string; message: string }> {
    const ask = (page: number) => boardApi.posts({ board: 'news', sort: 'latest', page, pageSize: READ_SIZE });
    const first = await ask(1);
    if (!first.ok) return { code: first.code, message: first.message };
    const count = Math.min(READ_PAGES, Number(first.totalPages) || 1);
    const rest = await Promise.all(Array.from({ length: Math.max(0, count - 1) }, (_, index) => ask(index + 2)));
    const pages = [first, ...rest.filter((reply) => reply.ok)].map((reply) => ({ posts: normalizePosts(reply.posts), pinned: normalizePosts(reply.pinned) }));
    return { pages };
}

/** One screen of 공지사항 or 최근 소식 from an old server: the news board, split here. Never throws. */
export async function loadNewsSplit(view: FeedView, wants: LegacyWants): Promise<FeedLoad> {
    const [settings, weekly, read] = await Promise.all([
        wants.config ? boardApi.boards() : Promise.resolve(null),
        wants.weekly ? boardApi.weeklyTop(6) : Promise.resolve(null),
        readNewsBoard(),
    ]);
    if (!('pages' in read)) return { ok: false, code: read.code, message: read.message };
    const sides = splitNewsReplies(read.pages);
    const shown = view.board === NOTICE_BOARD ? sides.notice : sides.news;
    const merged = mergeBoardPages([shown], { sort: view.sort, page: view.page, pageSize: FEED_PAGE_SIZE });
    return {
        ok: true,
        source: 'legacy',
        bundle: {
            ...merged,
            counts: { notice: sides.notice.total + sides.notice.pinned.length, news: sides.news.total + sides.news.pinned.length },
            config: settings && settings.ok ? pickConfig(settings) : null,
            weekly: weekly && weekly.ok ? normalizePosts(weekly.posts) : null,
        },
    };
}
