// One-call community feed (2026-11-08): the first screen, a board switch, a sort and a page turn are ONE server call
// (`community-feed`); an old server falls back to the many-call way and is remembered. No live server is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './helpers/load-ts.mjs';
import { VIEW, BOARDS, feedReply, legacyReplies, countOf, raw, withFeed } from './helpers/feed-fixtures.mjs';

test('first screen: ONE call (community-feed) carries the list, settings, weekly top, counts and profile', async () => {
    await withFeed({ 'community-feed': feedReply() }, async ({ browser, feed }) => {
        const result = await feed.loadCommunityFeed(VIEW);
        assert.equal(result.ok, true);
        assert.equal(result.source, 'feed');
        assert.deepEqual(browser.actions(), ['community-feed'], 'exactly one server call');
        assert.deepEqual(
            { board: browser.calls[0].board, sort: browser.calls[0].sort, page: browser.calls[0].page, pageSize: browser.calls[0].pageSize, weeklyLimit: browser.calls[0].weeklyLimit, token: browser.calls[0].communityToken },
            { board: 'all', sort: 'latest', page: 1, pageSize: 20, weeklyLimit: 6, token: 'ct_member_secret' },
        );
        const { bundle } = result;
        assert.deepEqual(bundle.posts.map((post) => post.id), ['p1', 'p2']);
        assert.deepEqual(bundle.pinned.map((post) => post.id), ['nt_1']);
        assert.equal(bundle.pinned[0].notice, true, 'a notice keeps its notice flag');
        assert.deepEqual(bundle.weekly.map((post) => post.id), ['w1']);
        assert.deepEqual([bundle.total, bundle.totalPages], [3, 1]);
        assert.equal(bundle.counts.free, 1);
        assert.deepEqual(bundle.config.boards.map((entry) => entry.id), ['request', 'news']);
        assert.deepEqual(bundle.config.reportReasons, [{ key: 'spam', label: '스팸·도배' }]);
    });
});

test('board switch, sort and page turn are each ONE call with the right fields', async () => {
    await withFeed({ 'community-feed': (body) => feedReply({ board: body.board, page: body.page, sort: body.sort }) }, async ({ browser, feed }) => {
        await feed.loadCommunityFeed({ board: 'free', sort: 'popular', page: 3 });
        await feed.loadCommunityFeed({ board: 'news', sort: 'latest', page: 1 });
        assert.deepEqual(browser.actions(), ['community-feed', 'community-feed']);
        assert.deepEqual([browser.calls[0].board, browser.calls[0].sort, browser.calls[0].page], ['free', 'popular', 3]);
        assert.deepEqual([browser.calls[1].board, browser.calls[1].sort, browser.calls[1].page], ['news', 'latest', 1]);
    });
});

test('the settings arrive at the top level (board array + reportReasons); the whole community-boards answer nested in `boards` is tolerated too', async () => {
    await withFeed({ 'community-feed': feedReply({ boards: BOARDS, reportReasons: undefined }) }, async ({ feed }) => {
        const { bundle } = await feed.loadCommunityFeed(VIEW);
        assert.deepEqual(bundle.config.boards.map((entry) => entry.id), ['request', 'news']);
        assert.equal(bundle.config.reportReasons.length, 1);
    });
});

test('the profile in the answer refreshes the stored login without a second call and keeps the token', async () => {
    await withFeed({ 'community-feed': feedReply() }, async ({ browser, feed, session }) => {
        await feed.loadCommunityFeed(VIEW);
        assert.equal(browser.calls.length, 1);
        const stored = session.loadCommunitySession();
        assert.equal(stored.score, 40);
        assert.equal(stored.communityToken, 'ct_member_secret');
    });
});

test('OLD SERVER "Unauthorized": falls back to the many-call way, nothing breaks, the login stays', async () => {
    await withFeed(legacyReplies({ ok: false, error: 'Unauthorized' }), async ({ browser, feed, session }) => {
        const result = await feed.loadCommunityFeed(VIEW);
        assert.equal(result.ok, true);
        assert.equal(result.source, 'legacy');
        assert.equal(countOf(browser, 'community-feed'), 1, 'tried the new action once');
        assert.equal(countOf(browser, 'community-posts'), 5, 'one per board');
        assert.equal(countOf(browser, 'community-boards'), 1);
        assert.equal(countOf(browser, 'community-weekly-top'), 1);
        assert.equal(result.bundle.posts.length, 5);
        assert.deepEqual(result.bundle.weekly.map((post) => post.id), ['w1']);
        assert.equal(result.bundle.config.boards.length, 2);
        assert.equal(result.bundle.counts.news, 1);
        assert.notEqual(session.loadCommunitySession(), null, 'an Unauthorized for the new action is not a logout');
    });
});

test('OLD SERVER, other shapes: "Unknown action", or ok without posts, also fall back', async () => {
    for (const answer of [{ ok: false, error: 'Unknown action: community-feed' }, { ok: true }, { ok: true, message: 'hi' }, { ok: false, code: 'UNKNOWN_ACTION', message: '알 수 없는 요청' }]) {
        await withFeed(legacyReplies(answer), async ({ browser, feed }) => {
            const result = await feed.loadCommunityFeed({ board: 'free', sort: 'latest', page: 1 });
            assert.equal(result.source, 'legacy', JSON.stringify(answer));
            assert.deepEqual(result.bundle.posts.map((post) => post.id), ['p_free']);
            assert.equal(countOf(browser, 'community-posts'), 1, 'a single board needs one list call');
            assert.deepEqual(result.bundle.counts, { free: 1 });
        });
    }
});

test('an old server is remembered: the next screens do not pay for a failed community-feed call again', async () => {
    await withFeed(legacyReplies({ ok: false, error: 'Unauthorized' }), async ({ browser, feed }) => {
        await feed.loadCommunityFeed(VIEW);
        await feed.loadCommunityFeed({ board: 'free', sort: 'latest', page: 1 }, { config: false, weekly: false });
        assert.equal(countOf(browser, 'community-feed'), 1, 'asked only once');
        assert.equal(countOf(browser, 'community-boards'), 1, 'settings are not read again when not wanted');
        assert.equal(countOf(browser, 'community-posts'), 6);
        feed.resetFeedSupport();
        await feed.loadCommunityFeed({ board: 'free', sort: 'latest', page: 1 });
        assert.equal(countOf(browser, 'community-feed'), 2, 'asks again once the memory is cleared');
    });
});

test('an old server stays remembered after a reload of the tab (a fresh page load does not pay for the failed call again)', async () => {
    await withFeed(legacyReplies({ ok: false, error: 'Unauthorized' }), async ({ browser, feed }) => {
        await feed.loadCommunityFeed(VIEW);
        const reloaded = createLoader()('../../src/lib/communityFeed.ts');
        await reloaded.loadCommunityFeed(VIEW);
        assert.equal(countOf(browser, 'community-feed'), 1, 'the second page load went straight to the old way');
        assert.equal(countOf(browser, 'community-posts'), 10);
    });
});

test('a server error of the new action falls back once but is not remembered as "old server"', async () => {
    await withFeed(legacyReplies({ ok: false, code: 'SERVER_ERROR', message: '처리 중 오류가 발생했습니다.' }), async ({ browser, feed }) => {
        const first = await feed.loadCommunityFeed({ board: 'free', sort: 'latest', page: 1 });
        assert.equal(first.source, 'legacy');
        await feed.loadCommunityFeed({ board: 'free', sort: 'latest', page: 1 });
        assert.equal(countOf(browser, 'community-feed'), 2, 'the new action is tried again next time');
    });
});

test('a dead login and a lost connection are shown as they are: no fallback storm', async () => {
    await withFeed({ 'community-feed': { ok: false, code: 'SESSION_INVALID', message: '로그인이 만료되었습니다.' } }, async ({ browser, feed, session }) => {
        const result = await feed.loadCommunityFeed(VIEW);
        assert.deepEqual([result.ok, result.code], [false, 'SESSION_INVALID']);
        assert.deepEqual(browser.actions(), ['community-feed']);
        assert.equal(session.loadCommunitySession(), null, 'the dead token is forgotten');
    });
    await withFeed({ 'community-feed': () => { throw new Error('offline'); } }, async ({ browser, feed }) => {
        const result = await feed.loadCommunityFeed(VIEW);
        assert.deepEqual([result.ok, result.code], [false, 'NETWORK']);
        assert.deepEqual(browser.actions(), ['community-feed']);
    });
    await withFeed({}, async ({ browser, feed }) => {
        const result = await feed.loadCommunityFeed(VIEW);
        assert.equal(result.code, 'LOGIN_REQUIRED');
        assert.deepEqual(browser.calls, [], 'no login, no request');
    }, null);
});

test('legacy: every board failing is an error; one failing board only drops its rows', async () => {
    const replies = legacyReplies({ ok: false, error: 'Unauthorized' });
    replies['community-posts'] = (body) => (body.board === 'inquiry'
        ? { ok: false, code: 'SERVER_ERROR', message: '일시 오류' }
        : { ok: true, posts: [raw(`p_${body.board}`, body.board)], pinned: [], total: 1, totalPages: 1 });
    await withFeed(replies, async ({ feed }) => {
        const result = await feed.loadCommunityFeed(VIEW);
        assert.equal(result.ok, true);
        assert.equal(result.bundle.posts.length, 4);
        assert.equal(result.bundle.counts.inquiry, undefined);
    });
    replies['community-posts'] = { ok: false, code: 'SERVER_ERROR', message: '일시 오류' };
    await withFeed(replies, async ({ feed }) => {
        const result = await feed.loadCommunityFeed(VIEW);
        assert.deepEqual([result.ok, result.message], [false, '일시 오류']);
    });
});
