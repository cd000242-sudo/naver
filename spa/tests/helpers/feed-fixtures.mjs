// Shared fixtures for the community feed tests: a member login, a scripted server, a separate sessionStorage.
import { createLoader, fakeBrowser, restoreBrowser } from './load-ts.mjs';

const FUTURE = '2099-01-01T00:00:00.000Z';
export const member = (userId = 'member1', token = 'ct_member_secret') => ({
    userId, role: 'community', nickname: '이웃', needsNickname: false, canWriteNews: false, isOperator: false, score: 12,
    activity: { posts: 1, comments: 2, visits: 3 }, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 100, nextLabel: '잎새' },
    linked: false, communityToken: token, sessionExpiresAt: FUTURE,
});
export const VIEW = { board: 'all', sort: 'latest', page: 1 };
export const raw = (id, board, extra = {}) => ({
    id, board, title: `제목 ${id}`, excerpt: '요약', nickname: '글쓴이', grade: { key: 'sprout', label: '새싹' }, isOperator: false,
    createdAt: '2026-11-08T11:25:00+09:00', views: 4, likes: 2, comments: 1, pinned: false, status: '', mine: false, liked: false, ...extra,
});
export const BOARDS = {
    boards: [
        { id: 'request', label: '요청사항', writeRole: 'member', dailyLimit: 5, statuses: ['검토 중', '반영됨'], defaultStatus: '검토 중' },
        { id: 'news', label: '최근 소식', writeRole: 'operator', dailyLimit: 0, statuses: [], defaultStatus: '' },
    ],
    reportReasons: [{ key: 'spam', label: '스팸·도배' }],
};
export const feedReply = (extra = {}) => ({
    ok: true,
    profile: { userId: 'member1', role: 'community', nickname: '이웃', score: 40, activity: { posts: 1, comments: 2, visits: 3 }, grade: { key: 'sprout', label: '새싹' } },
    boards: BOARDS,
    weeklyTop: [raw('w1', 'free', { likes: 9 })],
    board: 'all', sort: 'latest', page: 1, pageSize: 20, total: 3, totalPages: 1,
    pinned: [raw('nt_1', 'news', { pinned: true })],
    posts: [raw('p1', 'free'), raw('p2', 'request')],
    counts: { request: 1, inquiry: 0, free: 1, news: 1, promo: 0 },
    ...extra,
});

/** The helper shares one Map between local and session storage; a real browser does not, so give sessionStorage its own. */
export function separateSessionStorage() {
    const store = new Map();
    globalThis.sessionStorage = {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
    };
    return store;
}

export async function withFeed(replies, body, user = member()) {
    const browser = fakeBrowser(replies);
    const sessionStore = separateSessionStorage();
    try {
        const load = createLoader();
        const modules = {
            feed: load('../../src/lib/communityFeed.ts'),
            session: load('../../src/lib/communitySession.ts'),
            api: load('../../src/lib/communityApi.ts'),
        };
        if (user) modules.session.saveCommunitySession(modules.session.toCommunitySession(user));
        return await body({ browser, sessionStore, load, ...modules });
    } finally { restoreBrowser(); }
}

export const legacyReplies = (feedAnswer) => ({
    'community-feed': feedAnswer,
    'community-boards': { ok: true, ...BOARDS },
    'community-weekly-top': { ok: true, posts: [raw('w1', 'free', { likes: 9 })] },
    'community-posts': (body) => ({
        ok: true, posts: [raw(`p_${body.board}`, body.board)], pinned: body.board === 'news' ? [raw('nt_1', 'news', { pinned: true })] : [],
        total: 1, totalPages: 1,
    }),
    'community-session': { ok: true, userId: 'member1', nickname: '이웃', score: 40 },
});
export const countOf = (browser, action) => browser.actions().filter((name) => name === action).length;
