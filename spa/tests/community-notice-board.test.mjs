// Notice board (2026-11-08): the community lists 공지사항 · 최근 소식 · 요청사항 · 문의 · 자유게시판 · 내 글 홍보.
// 공지사항 holds only the admin-home notices (nt_); 최근 소식 is the owner's AI news. An OLD server files the notices
// under `news`: the screen moves them to 공지사항 by itself. No live server is touched (fetch is a scripted fake).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BOARD_ORDER, boardList, showWriteButton, boardLabel, canWriteBoard, writableBoards, validatePostDraft, communityPath, parseCommunityQuery,
    isNoticePost, splitNoticePosts, writeBlockedHint, NOTICE_WRITE_HINT,
} from '../src/lib/communityModel.mjs';
import { NOTICE_BOARD } from '../src/lib/communityContract.mjs';
import { createLoader } from './helpers/load-ts.mjs';
import { VIEW, feedReply, raw, countOf, withFeed } from './helpers/feed-fixtures.mjs';

const owner = { role: 'owner', canWriteNews: true };
const member = { role: 'community', canWriteNews: false };
const ORDER = ['notice', 'news', 'qna', 'request', 'inquiry', 'free', 'promo'];

test('seven boards in the agreed order: 공지사항, 최근 소식, 질문하기, 요청사항, 문의, 자유게시판, 내 글 홍보', () => {
    assert.equal(NOTICE_BOARD, 'notice');
    assert.deepEqual(BOARD_ORDER, ORDER);
    assert.deepEqual(boardList(null).map((board) => board.label), ['공지사항', '최근 소식', '질문하기', '요청사항', '버그 및 오류 신고', '자유게시판', '내 글 홍보']);
    assert.equal(boardLabel('notice'), '공지사항');
    assert.equal(boardList(null).find((board) => board.id === 'news').note, '리더남이 전하는 AI 소식');
});

test('the screen order wins: an old server without notice, or a server in another order, changes nothing', () => {
    const oldServer = [{ id: 'request' }, { id: 'inquiry' }, { id: 'free' }, { id: 'news' }, { id: 'promo' }];
    assert.deepEqual(boardList({ boards: oldServer }).map((board) => board.id), ORDER);
    const shuffled = [{ id: 'promo' }, { id: 'free' }, { id: 'news' }, { id: 'notice', label: '공지사항' }];
    assert.deepEqual(boardList({ boards: shuffled }).map((board) => board.id), ORDER);
});

test('addresses accept ?board=notice', () => {
    assert.equal(communityPath({ board: 'notice' }), '/community?board=notice');
    assert.equal(parseCommunityQuery('?board=notice').board, 'notice');
});

test('nobody writes on 공지사항, not even the owner; 최근 소식 stays owner-only', () => {
    const boards = boardList(null);
    const byId = Object.fromEntries(boards.map((board) => [board.id, board]));
    assert.equal(canWriteBoard(byId.notice, owner), false);
    assert.equal(canWriteBoard(byId.notice, member), false);
    assert.equal(canWriteBoard({ ...byId.notice, writeRole: 'member' }, member), false, 'a server that says "member" cannot open it');
    assert.equal(canWriteBoard(byId.news, owner), true);
    assert.equal(canWriteBoard(byId.news, member), false);
    assert.deepEqual(writableBoards(boards, owner).map((board) => board.id), ['news', 'qna', 'request', 'inquiry', 'free', 'promo']);
    assert.deepEqual(writableBoards(boards, member).map((board) => board.id), ['qna', 'request', 'inquiry', 'free', 'promo']);
});

test('the server says notice is writeRole "admin": the board keeps it, nobody can write, and the 글쓰기 button is hidden there', () => {
    const fromServer = boardList({ boards: [{ id: 'notice', label: '공지사항', writeRole: 'admin', dailyLimit: 0 }, { id: 'news', writeRole: 'operator' }] });
    const byId = Object.fromEntries(fromServer.map((board) => [board.id, board]));
    assert.equal(byId.notice.writeRole, 'admin');
    assert.equal(boardList(null).find((board) => board.id === 'notice').writeRole, 'admin', 'the built-in board says the same');
    assert.equal(canWriteBoard(byId.notice, owner), false);
    assert.equal(canWriteBoard(byId.notice, { role: 'owner', canWriteNews: true, isOperator: true }), false);
    assert.equal(showWriteButton('notice', fromServer), false);
    assert.equal(showWriteButton('notice', boardList(null)), false);
    for (const id of ['all', 'news', 'qna', 'request', 'inquiry', 'free', 'promo']) assert.equal(showWriteButton(id, fromServer), true, id);
    assert.equal(showWriteButton('news', boardList({ boards: [{ id: 'news', writeRole: 'admin' }] })), false, 'any board a server closes to admins loses the button');
});

test('writing to 공지사항 is refused with one clear sentence', () => {
    assert.equal(NOTICE_WRITE_HINT, '공지는 어드민 홈 운영에서 써요.');
    assert.equal(validatePostDraft({ board: 'notice', title: 't', body: 'b' }), NOTICE_WRITE_HINT);
    assert.equal(writeBlockedHint('notice', owner), NOTICE_WRITE_HINT);
    assert.match(writeBlockedHint('notice', member), /공지사항/);
    assert.equal(writeBlockedHint('free', owner), '');
    assert.equal(writeBlockedHint('news', member), '');
});

test('the API never sends a post to the notice board', async () => {
    await withFeed({ 'community-post-write': { ok: true, post: raw('p_x', 'notice') } }, async ({ browser, api }) => {
        const result = await api.boardApi.writePost({ board: 'notice', title: 't', body: 'b' });
        assert.equal(result.ok, false);
        assert.equal(result.code, 'NOTICE_MANAGED_IN_ADMIN');
        assert.equal(result.message, NOTICE_WRITE_HINT);
        assert.equal(browser.calls.length, 0, 'no request left the browser');
    });
});

test('a notice row (nt_ id or notice flag) belongs to 공지사항 whatever board the server named', () => {
    const data = createLoader()('../../src/lib/communityData.ts');
    assert.equal(data.normalizePost({ id: 'nt_9', board: 'news', title: 'a' }).board, 'notice');
    assert.equal(data.normalizePost({ id: 'x_9', board: 'free', notice: true, title: 'a' }).board, 'notice');
    assert.equal(data.normalizePost({ id: 'nt_9', board: 'notice', title: 'a' }).board, 'notice');
    assert.equal(data.normalizePost({ id: 'n_1', board: 'news', title: 'a' }).board, 'news', 'a real news post stays in 최근 소식');
    assert.equal(isNoticePost({ id: 'nt_1', board: 'news' }), true);
    assert.equal(isNoticePost({ id: 'p_1', board: 'news' }), false);
    const { notice, rest } = splitNoticePosts([{ id: 'nt_1' }, { id: 'p_1' }, { id: 'x', notice: true }]);
    assert.deepEqual([notice.map((post) => post.id), rest.map((post) => post.id)], [['nt_1', 'x'], ['p_1']]);
});

// ---- scripted servers ----

const notice = (id, createdAt, extra = {}) => raw(id, 'news', { notice: true, badge: 'update', noticeDate: '2026-11-07', views: 0, createdAt, ...extra });
const NEWS_BOARD_ROWS = [
    notice('nt_3', '2026-11-08T03:00:00+09:00'), raw('n_2', 'news', { createdAt: '2026-11-08T02:00:00+09:00' }),
    notice('nt_2', '2026-11-07T03:00:00+09:00'), raw('n_1', 'news', { createdAt: '2026-11-06T02:00:00+09:00' }), notice('nt_1', '2026-11-01T03:00:00+09:00'),
];
const OLD_CONFIG = {
    boards: ['request', 'inquiry', 'free', 'news', 'promo'].map((id) => ({ id, label: id, writeRole: id === 'news' ? 'operator' : 'member', dailyLimit: 5, statuses: [], defaultStatus: '' })),
    reportReasons: [{ key: 'spam', label: '스팸·도배' }],
};
const INVALID = { ok: false, code: 'INVALID_BOARD', message: '없는 게시판입니다.' };

/** What the live server answers today: no notice board, notices ride inside `news`. */
const oldBoardReply = (body) => {
    if (body.board === 'notice') return INVALID;
    const size = body.pageSize || 20;
    const rows = body.board === 'news' ? NEWS_BOARD_ROWS : body.board === 'all' ? [...NEWS_BOARD_ROWS, raw('p1', 'free')] : [raw(`p_${body.board}`, body.board)];
    const start = ((body.page || 1) - 1) * size;
    return { ok: true, board: body.board, sort: body.sort, page: body.page, pageSize: size, total: rows.length, totalPages: Math.ceil(rows.length / size), pinned: [], posts: rows.slice(start, start + size) };
};
const oldServer = (extra = {}) => ({
    'community-feed': (body) => (body.board === 'notice' ? INVALID : feedReply({
        ...oldBoardReply(body), boards: OLD_CONFIG.boards, reportReasons: OLD_CONFIG.reportReasons,
        counts: { request: 1, inquiry: 0, free: 1, news: 5, promo: 0 }, weeklyTop: [],
    })),
    'community-posts': oldBoardReply,
    'community-boards': { ok: true, ...OLD_CONFIG },
    'community-weekly-top': { ok: true, posts: [] },
    'community-session': { ok: true, userId: 'member1', nickname: '이웃', score: 40 },
    ...extra,
});
const ids = (list) => list.map((post) => post.id);

test('NEW server: 공지사항 is one native call, news is one native call, counts carry notice', async () => {
    const replies = {
        'community-feed': (body) => feedReply({
            board: body.board, pinned: [],
            posts: body.board === 'notice' ? [raw('nt_1', 'notice', { notice: true })] : [raw('n_1', 'news')],
            counts: { notice: 1, news: 1, request: 0, inquiry: 0, free: 0, promo: 0 },
        }),
    };
    await withFeed(replies, async ({ browser, feed }) => {
        const notices = await feed.loadCommunityFeed({ ...VIEW, board: 'notice' });
        const news = await feed.loadCommunityFeed({ ...VIEW, board: 'news' });
        assert.deepEqual(browser.actions(), ['community-feed', 'community-feed']);
        assert.deepEqual(ids(notices.bundle.posts), ['nt_1']);
        assert.equal(notices.bundle.posts[0].board, 'notice');
        assert.deepEqual(ids(news.bundle.posts), ['n_1']);
        assert.equal(notices.bundle.counts.notice, 1);
        assert.equal(news.source, 'feed');
    });
});

test('OLD server, 공지사항: the news board is read and only the notices are kept, counts are exact', async () => {
    await withFeed(oldServer(), async ({ browser, feed }) => {
        const result = await feed.loadCommunityFeed({ ...VIEW, board: 'notice' });
        assert.equal(result.ok, true);
        assert.deepEqual(ids(result.bundle.posts), ['nt_3', 'nt_2', 'nt_1']);
        assert.ok(result.bundle.posts.every((post) => post.board === 'notice' && post.notice));
        assert.deepEqual([result.bundle.total, result.bundle.totalPages], [3, 1]);
        assert.deepEqual([result.bundle.counts.notice, result.bundle.counts.news], [3, 2]);
        assert.deepEqual(browser.calls.filter((call) => call.action === 'community-posts').map((call) => call.board), ['news']);
    });
});

test('OLD server, 최근 소식: the notices leave the list, the real news stays', async () => {
    await withFeed(oldServer(), async ({ feed }) => {
        const result = await feed.loadCommunityFeed({ ...VIEW, board: 'news' });
        assert.deepEqual(ids(result.bundle.posts), ['n_2', 'n_1']);
        assert.ok(result.bundle.posts.every((post) => post.board === 'news' && !post.notice));
        assert.deepEqual([result.bundle.counts.notice, result.bundle.counts.news], [3, 2]);
        assert.equal(result.bundle.total, 2);
    });
});

test('OLD server remembers it: the second 공지사항 visit does not ask the feed for the missing board again', async () => {
    await withFeed(oldServer(), async ({ browser, feed }) => {
        await feed.loadCommunityFeed({ ...VIEW, board: 'notice' });
        const before = countOf(browser, 'community-feed');
        await feed.loadCommunityFeed({ ...VIEW, board: 'news' });
        await feed.loadCommunityFeed({ ...VIEW, board: 'notice', sort: 'popular' });
        assert.equal(countOf(browser, 'community-feed'), before, 'no more probing of the new action');
    });
});

test('OLD server, sorts and pages are applied here to the split lists', async () => {
    const rows = Array.from({ length: 25 }, (_, index) => notice(`nt_${index + 1}`, `2026-10-${String(index + 1).padStart(2, '0')}T03:00:00+09:00`, { likes: index === 0 ? 99 : 1 }));
    const server = oldServer({ 'community-posts': (body) => ({ ok: true, board: 'news', total: 25, totalPages: 1, pinned: [], posts: body.page === 1 ? rows : [] }) });
    await withFeed(server, async ({ feed }) => {
        const second = await feed.loadCommunityFeed({ ...VIEW, board: 'notice', page: 2 });
        assert.equal(second.bundle.posts.length, 5);
        assert.equal(second.bundle.totalPages, 2);
        const popular = await feed.loadCommunityFeed({ ...VIEW, board: 'notice', sort: 'popular' });
        assert.equal(popular.bundle.posts[0].id, 'nt_1');
    });
});

test('OLD server, 전체글: notices already carry the 공지사항 board; the two counts that are mixed up are left out', async () => {
    await withFeed(oldServer(), async ({ feed }) => {
        const result = await feed.loadCommunityFeed(VIEW);
        assert.equal(result.source, 'feed');
        const rows = result.bundle.posts;
        assert.deepEqual(rows.filter((post) => post.notice).map((post) => post.board), ['notice', 'notice', 'notice']);
        assert.equal(result.bundle.counts.news, undefined, 'news would include the notices, so no number is better than a wrong one');
        assert.equal(result.bundle.counts.notice, undefined);
        assert.equal(result.bundle.counts.free, 1);
    });
});

test('VERY OLD server (no community-feed): 공지사항 and 최근 소식 are split from community-posts; 전체글 never asks for the notice board', async () => {
    const server = { ...oldServer(), 'community-feed': { ok: false, error: 'Unauthorized' } };
    await withFeed(server, async ({ browser, feed }) => {
        const all = await feed.loadCommunityFeed(VIEW);
        assert.equal(all.source, 'legacy');
        assert.deepEqual([...new Set(browser.calls.filter((call) => call.action === 'community-posts').map((call) => call.board))].sort(), ['free', 'inquiry', 'news', 'promo', 'qna', 'request']);
        assert.equal(all.bundle.counts.news, undefined);
        const notices = await feed.loadCommunityFeed({ ...VIEW, board: 'notice' });
        assert.deepEqual(ids(notices.bundle.posts), ['nt_3', 'nt_2', 'nt_1']);
        const news = await feed.loadCommunityFeed({ ...VIEW, board: 'news' });
        assert.deepEqual(ids(news.bundle.posts), ['n_2', 'n_1']);
    });
});

test('the server turns NEW while the old note is still remembered: an empty 공지사항 asks the feed once more and wins', async () => {
    let upgraded = false;
    const server = oldServer({
        'community-feed': (body) => {
            if (!upgraded) return body.board === 'notice' ? INVALID : feedReply({ ...oldBoardReply(body), boards: OLD_CONFIG.boards, counts: { request: 1, news: 5 } });
            const posts = body.board === 'notice' ? [raw('nt_9', 'notice', { notice: true })] : [raw('n_1', 'news')];
            return feedReply({ board: body.board, pinned: [], posts, counts: { notice: 1, news: 1 } });
        },
        'community-posts': (body) => ({ ...oldBoardReply(body), posts: [], total: 0, totalPages: 0 }),
    });
    await withFeed(server, async ({ feed }) => {
        await feed.loadCommunityFeed({ ...VIEW, board: 'notice' }); // learns "old"
        upgraded = true;
        const again = await feed.loadCommunityFeed({ ...VIEW, board: 'notice' });
        assert.deepEqual(ids(again.bundle.posts), ['nt_9']);
        const news = await feed.loadCommunityFeed({ ...VIEW, board: 'news' });
        assert.equal(news.source, 'feed', 'the note was cleared, news is a native call again');
    });
});

test('a failed read of the news board is reported, not swallowed', async () => {
    const server = oldServer({ 'community-posts': { ok: false, code: 'BUSY', message: '서버가 잠시 붐빕니다.' } });
    await withFeed(server, async ({ feed }) => {
        const result = await feed.loadCommunityFeed({ ...VIEW, board: 'notice' });
        assert.equal(result.ok, false);
    });
});
