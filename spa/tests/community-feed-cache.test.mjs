// Saved lists (2026-11-08): the last list is kept in sessionStorage and drawn before the network answers; logout and
// another login empty it; nothing private is stored. No live server is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './helpers/load-ts.mjs';
import { BOARDS, VIEW, feedReply, member, raw, withFeed } from './helpers/feed-fixtures.mjs';

test('REVISIT: the saved list is there at once, before the network answers (stale-while-revalidate)', async () => {
    await withFeed({ 'community-feed': feedReply() }, async ({ browser, feed, load, sessionStore }) => {
        assert.equal(feed.peekCommunityFeed(VIEW), null, 'first visit: nothing saved yet');
        await feed.loadCommunityFeed(VIEW);
        assert.ok([...sessionStore.keys()].some((key) => key.startsWith('leaderspro.community.feed')), 'saved in sessionStorage');

        // A new page load: fresh modules, same storage, and a server that is still thinking.
        const again = createLoader()('../../src/lib/communityFeed.ts');
        let release;
        const before = browser.calls.length;
        globalThis.fetch = (url, init) => {
            browser.calls.push(JSON.parse(init.body));
            return new Promise((resolve) => { release = () => resolve({ text: async () => JSON.stringify(feedReply({ posts: [raw('p9', 'free')] })) }); });
        };
        const pending = again.loadCommunityFeed(VIEW);
        const shown = again.peekCommunityFeed(VIEW);
        assert.equal(browser.calls.length, before + 1, 'the refresh request is out');
        assert.deepEqual(shown.bundle.posts.map((post) => post.id), ['p1', 'p2'], 'the old list is already on screen');
        assert.deepEqual(shown.bundle.weekly.map((post) => post.id), ['w1'], 'weekly top is saved too');
        assert.deepEqual(shown.bundle.config.boards.map((entry) => entry.id), ['request', 'news'], 'board settings are saved too');
        assert.equal(shown.bundle.pinned[0].notice, true);
        release();
        const fresh = await pending;
        assert.deepEqual(fresh.bundle.posts.map((post) => post.id), ['p9']);
        assert.deepEqual(again.peekCommunityFeed(VIEW).bundle.posts.map((post) => post.id), ['p9'], 'the newer answer replaces the saved one');
        void load;
    });
});

test('saved lists are kept per board, sort and page', async () => {
    await withFeed({ 'community-feed': (body) => feedReply({ posts: [raw(`${body.board}-${body.sort}-${body.page}`, 'free')] }) }, async ({ feed }) => {
        await feed.loadCommunityFeed({ board: 'free', sort: 'latest', page: 1 });
        await feed.loadCommunityFeed({ board: 'free', sort: 'popular', page: 1 });
        await feed.loadCommunityFeed({ board: 'free', sort: 'latest', page: 2 });
        assert.equal(feed.peekCommunityFeed({ board: 'free', sort: 'latest', page: 1 }).bundle.posts[0].id, 'free-latest-1');
        assert.equal(feed.peekCommunityFeed({ board: 'free', sort: 'popular', page: 1 }).bundle.posts[0].id, 'free-popular-1');
        assert.equal(feed.peekCommunityFeed({ board: 'free', sort: 'latest', page: 2 }).bundle.posts[0].id, 'free-latest-2');
        assert.equal(feed.peekCommunityFeed({ board: 'news', sort: 'latest', page: 1 }), null);
    });
});

test('a failed refresh leaves the saved list alone', async () => {
    await withFeed({ 'community-feed': feedReply() }, async ({ browser, feed }) => {
        await feed.loadCommunityFeed(VIEW);
        globalThis.fetch = async () => { throw new Error('offline'); };
        const result = await feed.loadCommunityFeed(VIEW);
        assert.equal(result.ok, false);
        assert.deepEqual(feed.peekCommunityFeed(VIEW).bundle.posts.map((post) => post.id), ['p1', 'p2']);
        void browser;
    });
});

test('LOGOUT empties the saved lists; so does a different person logging in', async () => {
    await withFeed({ 'community-feed': feedReply() }, async ({ feed, session, sessionStore }) => {
        await feed.loadCommunityFeed(VIEW);
        assert.notEqual(feed.peekCommunityFeed(VIEW), null);
        session.clearCommunitySession();
        assert.equal(feed.peekCommunityFeed(VIEW), null);
        assert.deepEqual([...sessionStore.keys()].filter((key) => key.includes('community.feed')), [], 'nothing left behind');
    });
    await withFeed({ 'community-feed': feedReply() }, async ({ feed, session, sessionStore }) => {
        await feed.loadCommunityFeed(VIEW);
        session.saveCommunitySession(session.toCommunitySession(member('someone-else', 'ct_other')));
        assert.equal(feed.peekCommunityFeed(VIEW), null, 'the other person never sees the first person\'s list');
        assert.deepEqual([...sessionStore.keys()].filter((key) => key.includes('community.feed')), []);
    });
    await withFeed({ 'community-feed': feedReply() }, async ({ feed, session }) => {
        await feed.loadCommunityFeed(VIEW);
        session.saveCommunitySession({ ...session.loadCommunitySession(), score: 99 });
        assert.notEqual(feed.peekCommunityFeed(VIEW), null, 'a profile refresh of the same person keeps the list');
    });
});

test('a session that the server killed (SESSION_INVALID) also empties the saved lists', async () => {
    await withFeed({ 'community-feed': (body) => (body.page === 2 ? { ok: false, code: 'SESSION_INVALID', message: 'x' } : feedReply()) }, async ({ feed }) => {
        await feed.loadCommunityFeed(VIEW);
        await feed.loadCommunityFeed({ ...VIEW, page: 2 });
        assert.equal(feed.peekCommunityFeed(VIEW), null);
    });
});

test('nothing private is saved: no token, password, phone number or user id, even when the server sends them', async () => {
    const dirty = (id) => raw(id, 'free', { communityToken: 'ct_member_secret', password: 'pw-secret', phone: '01012345678', userId: 'member1', adminToken: 'adm-secret' });
    const reply = feedReply({
        posts: [dirty('p1')], pinned: [dirty('nt_1')], weeklyTop: [dirty('w1')], communityToken: 'ct_member_secret', phone: '01012345678',
        boards: { ...BOARDS, adminToken: 'adm-secret', phone: '01012345678' },
        profile: { ...feedReply().profile, phone: '01012345678', communityToken: 'ct_member_secret' },
    });
    await withFeed({ 'community-feed': reply }, async ({ feed, sessionStore }) => {
        await feed.loadCommunityFeed(VIEW);
        const dump = [...sessionStore.entries()].map(([key, value]) => `${key}\n${value}`).join('\n');
        assert.ok(dump.length > 0, 'something was saved');
        for (const secret of ['ct_member_secret', 'pw-secret', '01012345678', 'adm-secret', 'member1']) {
            assert.equal(dump.includes(secret), false, `${secret} must not be saved`);
        }
    });
});

test('a saved list older than six hours, or a damaged one, is not drawn', async () => {
    await withFeed({ 'community-feed': feedReply() }, async ({ feed, sessionStore }) => {
        await feed.loadCommunityFeed(VIEW);
        const listKey = [...sessionStore.keys()].find((key) => key.endsWith(':all:latest:1'));
        const entry = JSON.parse(sessionStore.get(listKey));
        sessionStore.set(listKey, JSON.stringify({ ...entry, savedAt: Date.now() - 7 * 60 * 60 * 1000 }));
        assert.equal(feed.peekCommunityFeed(VIEW), null, 'too old');
        sessionStore.set(listKey, '{not json');
        assert.equal(feed.peekCommunityFeed(VIEW), null, 'damaged');
    });
});

test('a post already known from a saved list can be found by id (the detail page shows it first)', async () => {
    await withFeed({ 'community-feed': feedReply() }, async ({ feed }) => {
        await feed.loadCommunityFeed(VIEW);
        assert.equal(feed.findKnownPost('p2').title, '제목 p2');
        assert.equal(feed.findKnownPost('nt_1').notice, true);
        assert.equal(feed.findKnownPost('nope'), null);
    });
});

test('storage that refuses to write never breaks loading', async () => {
    await withFeed({ 'community-feed': feedReply() }, async ({ feed }) => {
        globalThis.sessionStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
        const result = await feed.loadCommunityFeed(VIEW);
        assert.equal(result.ok, true);
        assert.equal(feed.peekCommunityFeed(VIEW), null);
    });
});
