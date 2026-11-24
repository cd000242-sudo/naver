// Guest reading of the community (2026-11-24): without a login the 공지사항 / 최근 소식 boards can be read; every other
// board, writing, comments and likes lead to the login. An old server (LOGIN_REQUIRED) keeps today's login screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';
import { VIEW, feedReply, raw, withFeed } from './helpers/feed-fixtures.mjs';

const require = createRequire(import.meta.url);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

function render(file, props, entry = '/community') {
    fakeBrowser();
    try {
        const load = createLoader();
        const Component = load(file).default;
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [entry] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}

const guestModel = () => createLoader()('../../src/lib/communityGuest.mjs');

test('guest feed: ONE community-feed call without any token, and the answer is drawn', async () => {
    await withFeed({ 'community-feed': feedReply({ profile: null }) }, async ({ browser, feed }) => {
        const result = await feed.loadCommunityFeed(VIEW);
        assert.equal(result.ok, true);
        assert.deepEqual(browser.actions(), ['community-feed']);
        assert.equal('communityToken' in browser.calls[0], false, 'a guest sends no token');
    }, null);
});

test('guest feed on an old server: LOGIN_REQUIRED comes back with its code (the page then shows the login screen)', async () => {
    const old = { ok: false, code: 'LOGIN_REQUIRED', message: '로그인이 필요합니다.' };
    await withFeed({ 'community-feed': old }, async ({ feed }) => {
        const result = await feed.loadCommunityFeed({ board: 'news', sort: 'latest', page: 1 });
        assert.equal(result.ok, false);
        assert.equal(result.code, 'LOGIN_REQUIRED');
        assert.equal(guestModel().isLoginReply(result.code), true);
    }, null);
});

test('guest post read and avatars go without a token; a member still sends the token', async () => {
    await withFeed({ 'community-post': { ok: true, post: raw('p1', 'news'), comments: [] } }, async ({ browser, api }) => {
        await api.boardApi.post('p1');
        assert.equal(browser.calls[0].action, 'community-post');
        assert.equal('communityToken' in browser.calls[0], false);
    }, null);
    await withFeed({ 'community-post': { ok: true, post: raw('p1', 'news'), comments: [] } }, async ({ browser, api }) => {
        await api.boardApi.post('p1');
        assert.equal(browser.calls[0].communityToken, 'ct_member_secret');
    });
});

test('writing as a guest never reaches the server', async () => {
    await withFeed({}, async ({ browser, api }) => {
        const result = await api.boardApi.writeComment('p1', '안녕하세요');
        assert.equal(result.code, 'LOGIN_REQUIRED');
        const like = await api.boardApi.like('post', 'p1');
        assert.equal(like.code, 'LOGIN_REQUIRED');
        assert.deepEqual(browser.actions(), []);
    }, null);
});

test('which screens a guest can read: all / notice / news lists and posts; writing and the other boards need the login', () => {
    const model = guestModel();
    assert.deepEqual([...model.GUEST_BOARDS], ['notice', 'news']);
    for (const board of ['all', 'notice', 'news']) assert.equal(model.guestScreen({ board, sort: 'latest', page: 1 }), 'read', board);
    assert.equal(model.guestScreen({ board: 'news', post: 'p_1', sort: 'latest', page: 1 }), 'read');
    for (const board of ['qna', 'request', 'inquiry', 'free', 'promo']) assert.equal(model.guestScreen({ board, sort: 'latest', page: 1 }), 'login', board);
    assert.equal(model.guestScreen({ board: 'news', write: true, sort: 'latest', page: 1 }), 'login');
    assert.equal(model.guestBoardHref('news'), '/community?board=news');
    assert.equal(model.guestBoardHref('all'), '/community');
    assert.match(model.guestBoardHref('free'), /^\/login\?next=/);
    assert.match(decodeURIComponent(model.guestBoardHref('free')), /\/community\?board=free/);
});

const BOARDS = () => createLoader()('../../src/lib/communityModel.mjs').boardList(null);
const feedState = (extra = {}) => ({
    status: 'ready', refreshing: false, stale: false, pinned: [], posts: [], total: 0, totalPages: 1, message: '', code: '',
    counts: { free: 3 }, config: null, weekly: [], reload() {}, ...extra,
});
const viewProps = (view, feed = feedState()) => ({ view, feed, boards: BOARDS(), next: '/community', legacy: false });

test('guest list: login card in the side column, private boards link to the login, the write button goes to the login', () => {
    const html = render('../../src/components/community/GuestCommunityView.tsx', viewProps({ board: 'all', sort: 'latest', page: 1 }));
    const words = text(html);
    assert.match(words, /로그인/);
    assert.match(words, /회원가입/);
    assert.ok(!/내 댓글|들른 글/.test(words), 'no member activity for a guest');
    assert.match(html, /href="\/community\?board=news"/);
    assert.match(html, /href="\/login\?next=[^"]*board%3Dfree/);
    assert.ok(!/href="\/community\?board=free"/.test(html), 'a private board never opens as a list for a guest');
});

test('guest on a private board or the write form: the login screen of today', () => {
    for (const view of [{ board: 'free', sort: 'latest', page: 1 }, { board: 'news', write: true, sort: 'latest', page: 1 }]) {
        const words = text(render('../../src/components/community/GuestCommunityView.tsx', viewProps(view)));
        assert.match(words, /로그인이 필요해요/);
    }
});

test('old server (LOGIN_REQUIRED) keeps the login screen; another failure stays a list error', () => {
    const blocked = text(render('../../src/components/community/GuestCommunityView.tsx',
        viewProps({ board: 'all', sort: 'latest', page: 1 }, feedState({ status: 'error', code: 'LOGIN_REQUIRED', message: '로그인이 필요합니다.' }))));
    assert.match(blocked, /로그인이 필요해요/);
    const busy = text(render('../../src/components/community/GuestCommunityView.tsx',
        viewProps({ board: 'all', sort: 'latest', page: 1 }, feedState({ status: 'error', code: 'BUSY', message: '서버가 잠시 붐빕니다.' }))));
    assert.ok(!/로그인이 필요해요/.test(busy));
});

test('guest comments: one line and a login button; a post with comments closed shows nothing', () => {
    const open = render('../../src/components/community/GuestComments.tsx', { commentable: true, next: '/community?post=p_1' });
    assert.match(text(open), /로그인하면 댓글을 볼 수 있어요/);
    assert.match(open, /href="\/login\?next=/);
    assert.equal(render('../../src/components/community/GuestComments.tsx', { commentable: false, next: '/community' }), '');
});
