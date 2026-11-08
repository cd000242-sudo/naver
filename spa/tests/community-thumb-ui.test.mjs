// Forum contract 1115 §A and §B on the real components and modules: the post fields, what is sent with a post, how a
// thumbnail is fetched (cache, one request per picture, four at a time), the list rows and the "인기글" grid.
// A scripted server stands in for the real one; no live server is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';
import { VIEW, feedReply, raw, withFeed } from './helpers/feed-fixtures.mjs';

const require = createRequire(import.meta.url);
const NOW = new Date('2026-11-08T12:00:00+09:00').getTime();
const JPEG = `/9j/${'A'.repeat(36)}`;

function render(file, props, { path = '/community', exportName = 'default' } = {}) {
    fakeBrowser();
    try {
        const Component = createLoader()(file)[exportName];
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const load = () => createLoader();
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);
const post = (id, board = 'free', extra = {}) => load()('../../src/lib/communityData.ts').normalizePost({
    id, board, title: `제목 ${id}`, excerpt: '', nickname: '글쓴이', grade: { key: 'sprout', label: '새싹' }, isOperator: false, createdAt: '2026-11-08T11:25:00+09:00',
    views: 1, likes: 0, comments: 0, pinned: false, status: '', mine: false, liked: false, ...extra,
});
const boards = () => load()('../../src/lib/communityModel.mjs').boardList(null);
const listProps = (items, extra = {}) => ({
    title: '전체글', boardId: 'all', boards: boards(), pinned: [], posts: items, total: items.length, page: 1, totalPages: 1, sort: 'latest', now: NOW, onVisit() {}, ...extra,
});

test('post fields: a thumbnail id and an https address survive, anything else is dropped; the rank is a whole number', () => {
    const own = post('p1', 'free', { thumbId: '_thumb', hasImage: true, rank: 3 });
    assert.deepEqual([own.thumbId, own.thumbUrl, own.rank], ['_thumb', '', 3]);
    const promo = post('p2', 'promo', { thumbUrl: 'https://img.example.com/a.jpg' });
    assert.deepEqual([promo.thumbId, promo.thumbUrl], ['', 'https://img.example.com/a.jpg']);
    const bad = post('p3', 'free', { thumbId: '../etc', thumbUrl: 'javascript:alert(1)', rank: 'x' });
    assert.deepEqual([bad.thumbId, bad.thumbUrl, bad.rank], ['', '', 0]);
    assert.equal(post('p4', 'promo', { thumbUrl: 'http://img.example.com/a.jpg' }).thumbUrl, '', 'only https');
    assert.equal(post('p5', 'free', { thumbId: 'a'.repeat(41) }).thumbId, '');
    assert.deepEqual([post('p6').thumbId, post('p6').thumbUrl, post('p6').rank], ['', '', 0]);
});

test('sending a post: the thumbnail rides along with a rich post and only then', async () => {
    await withFeed({ 'community-post-write': { ok: true, post: raw('p9', 'free') }, 'community-post-update': { ok: true, post: raw('p9', 'free') } }, async ({ browser, api }) => {
        const images = [{ id: 'iA', mime: 'image/jpeg', data: JPEG }];
        await api.boardApi.writePost({ board: 'free', title: '제목', body: '{"v":1,"blocks":[]}', format: 'rich', images, thumb: JPEG }, 'w1');
        assert.equal(browser.calls.at(-1).thumb, JPEG);
        await api.boardApi.writePost({ board: 'free', title: '제목', body: '{"v":1,"blocks":[]}', format: 'rich', images }, 'w2');
        assert.equal('thumb' in browser.calls.at(-1), false, 'no thumbnail made: the field is left out');
        await api.boardApi.writePost({ board: 'free', title: '제목', body: '평문', thumb: JPEG }, 'w3');
        assert.equal('thumb' in browser.calls.at(-1), false, 'a plain post has no thumbnail');
        await api.boardApi.updatePost('p9', { title: '제목', body: '{"v":1,"blocks":[]}', promo: false, images, thumb: JPEG });
        assert.equal(browser.calls.at(-1).thumb, JPEG);
        await api.boardApi.updatePost('p9', { title: '제목', body: '{"v":1,"blocks":[]}', promo: false, images });
        assert.equal('thumb' in browser.calls.at(-1), false, 'edit without a new thumbnail keeps the stored one');
        await api.boardApi.updatePost('p9', { title: '제목', body: '소개', promo: true, thumb: JPEG });
        assert.equal('thumb' in browser.calls.at(-1), false, 'a promo post has none');
    });
});

test('the feed asks for the top ten (the grid needs ten); an old server is asked for ten too', async () => {
    await withFeed({ 'community-feed': feedReply() }, async ({ browser, feed }) => {
        await feed.loadCommunityFeed(VIEW);
        assert.equal(browser.calls[0].weeklyLimit, 10);
    });
    await withFeed({ 'community-feed': { ok: false, code: 'Unauthorized', message: 'x' }, 'community-boards': { ok: true, boards: [] }, 'community-weekly-top': { ok: true, posts: [] }, 'community-posts': { ok: true, posts: [], pinned: [], total: 0 } }, async ({ browser, feed }) => {
        await feed.loadCommunityFeed(VIEW);
        assert.equal(browser.calls.find((call) => call.action === 'community-weekly-top').limit, 10);
    });
});

function scriptedImages(answer = () => ({ ok: true, mime: 'image/jpeg', data: JPEG })) {
    const seen = [];
    const gates = [];
    let running = 0;
    let peak = 0;
    globalThis.fetch = async (url) => {
        seen.push(String(url));
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => gates.push(resolve));
        running -= 1;
        return { text: async () => JSON.stringify(answer(String(url))) };
    };
    return { seen, release: () => { while (gates.length) gates.shift()(); }, peak: () => peak, pending: () => gates.length };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('fetching a thumbnail: one GET per picture, a data address from a real JPEG only, remembered for the visit', async () => {
    fakeBrowser();
    try {
        const { fetchThumb, forgetThumbs } = load()('../../src/lib/communityThumbFetch.ts');
        const server = scriptedImages((url) => (url.includes('imageId=bad') ? { ok: true, mime: 'image/png', data: JPEG } : url.includes('imageId=gone') ? { ok: false, code: 'NOT_FOUND' } : { ok: true, mime: 'image/jpeg', data: JPEG }));
        const first = fetchThumb('p1', '_thumb');
        const twin = fetchThumb('p1', '_thumb');
        await settle();
        assert.equal(server.seen.length, 1, 'two rows asking for the same picture share one request');
        server.release();
        assert.deepEqual(await first, { ok: true, src: `data:image/jpeg;base64,${JPEG}` });
        assert.deepEqual(await twin, { ok: true, src: `data:image/jpeg;base64,${JPEG}` });
        assert.match(server.seen[0], /\?action=community-post-image&postId=p1&imageId=_thumb$/);
        assert.equal((await fetchThumb('p1', '_thumb')).ok, true);
        assert.equal(server.seen.length, 1, 'the second look is from memory');
        const wrong = fetchThumb('p2', 'bad'); const missing = fetchThumb('p3', 'gone');
        await settle(); server.release();
        assert.equal((await wrong).ok, false, 'a PNG is never drawn');
        assert.equal((await missing).ok, false);
        assert.equal((await fetchThumb('../x', '_thumb')).ok, false, 'a bad id never reaches the server');
        assert.equal(server.seen.length, 3);
        forgetThumbs('p1');
        const again = fetchThumb('p1', '_thumb'); await settle(); server.release();
        assert.equal((await again).ok, true);
        assert.equal(server.seen.length, 4, 'after an edit the thumbnail is read again');
    } finally { restoreBrowser(); }
});

test('fetching thumbnails: at most four requests are in flight, the rest wait', async () => {
    fakeBrowser();
    try {
        const { fetchThumb } = load()('../../src/lib/communityThumbFetch.ts');
        const server = scriptedImages();
        const all = Array.from({ length: 9 }, (_, index) => fetchThumb(`q${index}`, '_thumb'));
        await settle();
        assert.equal(server.seen.length, 4);
        for (let round = 0; round < 6; round += 1) { server.release(); await settle(); }
        const results = await Promise.all(all);
        assert.ok(results.every((result) => result.ok));
        assert.equal(server.seen.length, 9);
        assert.equal(server.peak(), 4);
    } finally { restoreBrowser(); }
});

test('a failed thumbnail is not remembered: the next look asks again', async () => {
    fakeBrowser();
    try {
        const { fetchThumb } = load()('../../src/lib/communityThumbFetch.ts');
        let healthy = false;
        globalThis.fetch = async () => { if (!healthy) throw new Error('offline'); return { text: async () => JSON.stringify({ ok: true, mime: 'image/jpeg', data: JPEG }) }; };
        assert.equal((await fetchThumb('r1', '_thumb')).ok, false);
        healthy = true;
        assert.equal((await fetchThumb('r1', '_thumb')).ok, true);
    } finally { restoreBrowser(); }
});

test('list rows: a thumbnail on the right only for a post that has one; rows without keep their layout', () => {
    const withThumb = post('p_1', 'free', { thumbId: '_thumb', hasImage: true });
    const firstPicture = post('p_2', 'free', { thumbId: 'iab12cd', hasImage: true });
    const promo = post('p_3', 'promo', { thumbUrl: 'https://img.example.com/a.jpg' });
    const plain = post('p_4', 'free');
    const html = render('../../src/components/community/PostList.tsx', listProps([withThumb, firstPicture, promo, plain]));
    const rows = html.split('<li class="cm-row').slice(1);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((row) => /cm-row-thumb/.test(row)), [true, true, true, false]);
    assert.deepEqual(rows.map((row) => /has-thumb/.test(row.slice(0, 40))), [true, true, true, false]);
    assert.match(html, /class="lp-box cm-board has-thumbs"/);
    assert.match(rows[2], /<img[^>]*src="https:\/\/img\.example\.com\/a\.jpg"/);
    assert.match(rows[2], /loading="lazy"/);
    assert.match(rows[2], /referrerPolicy="no-referrer"|referrerpolicy="no-referrer"/i);
    assert.ok(!/<img/.test(rows[0]), 'our own pictures are fetched when they come near the screen, not drawn by the server render');
    assert.ok(!/cm-thumb-empty|placeholder/.test(rows[3]), 'no grey box in a row without a picture');
    const none = render('../../src/components/community/PostList.tsx', listProps([plain]));
    assert.ok(!/has-thumbs/.test(none), 'a list with no picture at all looks as before');
});

test('my posts: the thumbnail sits at the right end of a row that has one', () => {
    const html = render('../../src/components/account/MyPostsList.tsx', {
        posts: [post('m1', 'free', { thumbId: '_thumb', hasImage: true }), post('m2', 'free')],
        page: 1, totalPages: 1, total: 2, loading: false, error: '', onPage() {}, onRetry() {},
    }, { path: '/me', exportName: 'MyPostsList' });
    const rows = html.split('<li class="me-post').slice(1);
    assert.deepEqual(rows.map((row) => /cm-row-thumb|me-post-thumb/.test(row)), [true, false]);
});

const top = (count, extra = (index) => ({})) => Array.from({ length: count }, (_, index) => post(`t${index + 1}`, ['free', 'request', 'promo', 'inquiry', 'news'][index % 5], {
    title: `인기 ${index + 1}위 글`, likes: 50 - index, comments: index + 1, rank: index + 1, ...extra(index),
}));

test('인기글 grid: rank 1 big, ranks 2-5 cards, ranks 6-10 a numbered list; every card is a link to its post', () => {
    const html = render('../../src/components/community/TopGrid.tsx', { posts: top(10, (index) => (index === 0 ? { thumbId: '_thumb', hasImage: true } : {})), boardId: 'all', layout: 'wide' });
    assert.match(text(html), /인기글/);
    const cards = html.split('class="cm-top-card').slice(1);
    assert.equal(cards.length, 5);
    assert.match(cards[0], /is-hero/);
    assert.deepEqual(cards.map((card) => (card.match(/data-rank="(\d+)"/) || [])[1]), ['1', '2', '3', '4', '5']);
    assert.deepEqual(cards.map((card) => (card.match(/grid-column:\s*([^;"]+)/) || [])[1]), ['1 / span 2', '3 / span 1', '4 / span 1', '3 / span 1', '4 / span 1']);
    assert.match(cards[0], /grid-row:\s*1 \/ span 2/);
    assert.match(cards[0], /cm-top-rank is-gold/);
    assert.match(cards[1], /cm-top-rank is-silver/);
    assert.match(cards[2], /cm-top-rank is-bronze/);
    assert.match(cards[3], /cm-top-rank is-plain/);
    assert.match(cards[0], /cm-thumb/, 'the first has a picture');
    assert.match(cards[1], /cm-top-tile is-tone-request/, 'without a picture: a tile in the board colour with the title');
    assert.match(text(cards[1]), /인기 2위 글/);
    assert.match(text(cards[1]), /요청사항/);
    assert.match(cards[1], /♥ 49/);
    assert.match(cards[1], /💬 2/);
    const list = html.slice(html.indexOf('cm-top-list'));
    assert.deepEqual([...list.matchAll(/data-rank="(\d+)"/g)].map((match) => match[1]), ['6', '7', '8', '9', '10']);
    assert.equal(tags(html, 'a').filter((tag) => /href="\/community\?post=t\d+/.test(tag)).length, 10, 'clicking goes to the post');
});

test('인기글 grid on a phone: full-width first card, two by two, then the list', () => {
    const html = render('../../src/components/community/TopGrid.tsx', { posts: top(10), boardId: 'all', layout: 'narrow' });
    const cards = html.split('class="cm-top-card').slice(1);
    assert.deepEqual(cards.map((card) => (card.match(/grid-column:\s*([^;"]+)/) || [])[1]), ['1 / span 2', '1 / span 1', '2 / span 1', '1 / span 1', '2 / span 1']);
    assert.deepEqual(cards.map((card) => (card.match(/grid-row:\s*([^;"]+)/) || [])[1]), ['1 / span 1', '2 / span 1', '2 / span 1', '3 / span 1', '3 / span 1']);
    assert.match(html, /is-narrow/);
});

test('인기글 grid: a fresh week with few posts, and no posts at all', () => {
    const three = render('../../src/components/community/TopGrid.tsx', { posts: top(3), boardId: 'all', layout: 'wide' });
    assert.equal(three.split('class="cm-top-card').length - 1, 3);
    assert.ok(!/cm-top-list/.test(three), 'no numbered list below rank 5');
    const empty = render('../../src/components/community/TopGrid.tsx', { posts: [], boardId: 'all', layout: 'wide' });
    assert.match(text(empty), /아직 이번 주 인기글이 없어요/);
    assert.ok(!/cm-top-card/.test(empty));
});

test('인기글 grid: server text is text; a hostile title or board never becomes markup or a class', () => {
    const evil = post('t1', 'free', { title: '<img src=x onerror=alert(1)>', rank: 1 });
    const html = render('../../src/components/community/TopGrid.tsx', { posts: [evil], boardId: 'all', layout: 'wide' });
    assert.ok(!/<img src=x/.test(html));
    assert.match(html, /&lt;img src=x/);
});
