// 공지사항 open card (2026-11-24): on page 1 of the notice board, newest first, the top post is drawn open with its
// whole body; the list first shows the excerpt and swaps in the body when the post read comes back (once per id).
// A failed or members-only read keeps the excerpt without any message. Every other list is as before. No server.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';
import { splitNoticeLead, createNoticeBodyStore, NOTICE_LEAD_BOARD } from '../src/lib/communityNoticeLead.mjs';

const require = createRequire(import.meta.url);
const NOW = new Date('2026-11-24T12:00:00+09:00').getTime();
const LIST = '../../src/components/community/PostList.tsx';
const CARD = '../../src/components/community/NoticeLeadCard.tsx';
const BODY = ['■ 이번 업데이트', '• 첫째 항목입니다', '• 둘째 항목입니다', '', '■ 알려 드릴 것', '• 마지막 줄까지 다 보입니다'].join('\n');

function render(file, props, pick = (mod) => mod.default) {
    fakeBrowser();
    try {
        const Component = pick(createLoader()(file));
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/community'] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const post = (id, board = 'notice', extra = {}) => createLoader()('../../src/lib/communityData.ts').normalizePost({
    id, board, title: `제목 ${id}`, excerpt: `요약 ${id}`, nickname: '운영자', grade: null, isOperator: true, createdAt: '2026-11-24T11:00:00+09:00',
    views: 0, likes: 2, comments: 1, pinned: false, status: '', mine: false, liked: false, notice: board === 'notice', badge: 'update', ...extra,
});
const boards = () => createLoader()('../../src/lib/communityModel.mjs').boardList(null);
const listProps = (items, extra = {}) => ({
    title: '공지사항', boardId: 'notice', boards: boards(), pinned: [], posts: items, total: items.length, page: 1, totalPages: 1, sort: 'latest', now: NOW, onVisit() {}, ...extra,
});
const cardOf = (html) => {
    const start = html.indexOf('<li class="cm-nlead');
    return start < 0 ? '' : html.slice(start, html.lastIndexOf('</li>', html.indexOf('<li class="cm-row', start) < 0 ? html.length : html.indexOf('<li class="cm-row', start)) + 5);
};
const rowsOf = (html) => html.split('<li class="cm-row').slice(1);

test('which post opens: page 1 of 공지사항, newest first, the first ordinary post; nothing else', () => {
    assert.equal(NOTICE_LEAD_BOARD, 'notice');
    const items = [post('nt_2'), post('nt_1')];
    const frozen = Object.freeze([...items]);
    const split = splitNoticeLead({ boardId: 'notice', page: 1, sort: 'latest', posts: frozen });
    assert.equal(split.lead.id, 'nt_2');
    assert.deepEqual(split.rest.map((entry) => entry.id), ['nt_1']);
    for (const other of [{ boardId: 'all' }, { boardId: 'news' }, { boardId: 'free' }, { page: 2 }, { sort: 'popular' }, { sort: 'comments' }]) {
        const result = splitNoticeLead({ boardId: 'notice', page: 1, sort: 'latest', posts: items, ...other });
        assert.equal(result.lead, null, JSON.stringify(other));
        assert.deepEqual(result.rest.map((entry) => entry.id), ['nt_2', 'nt_1'], JSON.stringify(other));
    }
    // Same rule as the 최근 소식 card: a pinned post or one still being sent is never the card.
    assert.equal(splitNoticeLead({ boardId: 'notice', page: 1, sort: 'latest', posts: [{ ...items[0], pinned: true }] }).lead, null);
    assert.equal(splitNoticeLead({ boardId: 'notice', page: 1, sort: 'latest', posts: [{ ...items[0], delivery: 'sending' }] }).lead, null);
    assert.deepEqual(splitNoticeLead({ boardId: 'notice', page: 1, sort: 'latest', posts: undefined }), { lead: null, rest: [] });
});

test('body store: one read per id, the body on success, null on any failure (kept, not read again)', async () => {
    const calls = [];
    const replies = {
        nt_ok: { ok: true, post: { id: 'nt_ok', body: BODY, format: '' } },
        nt_rich: { ok: true, post: { id: 'nt_rich', body: '{"v":1}', format: 'rich' } },
        nt_guest: { ok: false, code: 'LOGIN_REQUIRED', message: '로그인이 필요합니다.' },
        nt_empty: { ok: true, post: { id: 'nt_empty', body: '   ' } },
    };
    const store = createNoticeBodyStore(async (id) => {
        calls.push(id);
        if (id === 'nt_throw') throw new Error('boom');
        return replies[id];
    });
    assert.equal(store.peek('nt_ok'), null, 'nothing before the read');
    const [first, second] = await Promise.all([store.load('nt_ok'), store.load('nt_ok')]);
    assert.deepEqual(first, { body: BODY, format: '' });
    assert.equal(second, first);
    assert.deepEqual(await store.load('nt_ok'), { body: BODY, format: '' });
    assert.deepEqual(store.peek('nt_ok'), { body: BODY, format: '' });
    assert.deepEqual(await store.load('nt_rich'), { body: '{"v":1}', format: 'rich' });
    for (const id of ['nt_guest', 'nt_empty', 'nt_throw', 'nt_missing']) {
        assert.equal(await store.load(id), null, id);
        assert.equal(await store.load(id), null, `${id} again`);
        assert.equal(store.peek(id), null, id);
    }
    assert.deepEqual(calls, ['nt_ok', 'nt_rich', 'nt_guest', 'nt_empty', 'nt_throw', 'nt_missing'], 'each id is read once');
    assert.equal(await store.load(''), null);
    assert.equal(calls.length, 6, 'an empty id is never sent');
});

test('the real store reads community-post once per id (as a guest: no token)', async () => {
    const browser = fakeBrowser({ 'community-post': (body) => ({ ok: true, post: { id: body.id, body: BODY, format: '' }, comments: [] }) });
    try {
        const { noticeBodyStore } = createLoader()('../../src/lib/useNoticeLeadBody.ts');
        assert.deepEqual(await noticeBodyStore.load('nt_7'), { body: BODY, format: '' });
        await noticeBodyStore.load('nt_7');
        assert.deepEqual(browser.actions(), ['community-post']);
        assert.equal(browser.calls[0].id, 'nt_7');
        assert.equal('communityToken' in browser.calls[0], false);
    } finally { restoreBrowser(); }
});

test('notice list, page 1, newest first: the top post is the open card (excerpt until the body comes), the rest stay rows', () => {
    const html = render(LIST, listProps([post('nt_9', 'notice', { title: '아주 긴 공지 제목이 끝까지 다 보여야 합니다 '.repeat(3).trim() }), post('nt_8'), post('nt_7')]));
    assert.equal(html.split('<li class="cm-nlead').length - 1, 1, 'exactly one open card');
    assert.ok(!/<li class="cm-lead/.test(html), 'not the 최근 소식 card');
    const card = cardOf(html);
    assert.match(text(card), /아주 긴 공지 제목이 끝까지 다 보여야 합니다 아주 긴 공지 제목이 끝까지 다 보여야 합니다 아주 긴 공지 제목이 끝까지 다 보여야 합니다/);
    assert.match(card, /lp-state-notice/, 'the notice badge');
    assert.match(text(card), /운영자/);
    assert.match(text(card), /1시간 전/);
    assert.match(text(card), /요약 nt_9/, 'the excerpt before the body arrives');
    const links = [...card.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
    assert.equal(links.length, 1, 'one link');
    assert.match(links[0], /href="\/community\?board=notice&amp;post=nt_9"/);
    assert.match(text(card), /글 보기/);
    const rows = rowsOf(html);
    assert.equal(rows.length, 2);
    assert.match(text(rows[0]), /제목 nt_8/);
    assert.ok(html.indexOf('<li class="cm-nlead') < html.indexOf('<li class="cm-row'), 'the card comes first');
    assert.match(html, /class="lp-box cm-board[^"]*\bhas-nlead\b/);
});

test('no open card on other boards, page 2, other sorts, while loading or when empty; 최근 소식 keeps its big card', () => {
    const items = [post('nt_2'), post('nt_1')];
    for (const extra of [{ boardId: 'all', title: '전체글' }, { boardId: 'free' }, { page: 2, totalPages: 2 }, { sort: 'popular' }, { sort: 'comments' }]) {
        const html = render(LIST, listProps(items, extra));
        assert.ok(!/cm-nlead/.test(html), JSON.stringify(extra));
        assert.equal(rowsOf(html).length, 2, JSON.stringify(extra));
    }
    assert.ok(!/cm-nlead/.test(render(LIST, listProps([], { loading: true }))));
    assert.ok(!/cm-nlead/.test(render(LIST, listProps([], { total: 0 }))));
    const news = render(LIST, listProps([post('n_2', 'news'), post('n_1', 'news')], { boardId: 'news', title: '최근 소식' }));
    assert.equal(news.split('<li class="cm-lead').length - 1, 1, 'the 최근 소식 card is still there');
    assert.ok(!/cm-nlead/.test(news));
});

test('the card with the body: the whole text replaces the excerpt; plain posts keep line breaks, rich posts use RichBody', () => {
    const props = { post: post('nt_9'), boardId: 'notice', sort: 'latest', now: NOW, avatars: {} };
    const pick = (mod) => mod.NoticeLeadView;
    const plain = render(CARD, { ...props, detail: { body: BODY, format: '' } }, pick);
    assert.match(plain, /<div class="cm-body">■ 이번 업데이트\n• 첫째 항목입니다/);
    assert.match(text(plain), /• 마지막 줄까지 다 보입니다/);
    assert.ok(!/요약 nt_9/.test(text(plain)), 'the excerpt is gone');
    const richBody = JSON.stringify({ v: 1, blocks: [{ t: 'p', c: [{ x: '굵은 첫 줄', b: 1 }] }] });
    const rich = render(CARD, { ...props, detail: { body: richBody, format: 'rich' } }, pick);
    assert.match(rich, /cm-rich-body/);
    assert.match(rich, /<strong>굵은 첫 줄<\/strong>/);
    const waiting = render(CARD, { ...props, detail: null }, pick);
    assert.match(text(waiting), /요약 nt_9/);
    assert.ok(!/cm-body/.test(waiting));
    assert.ok(!/불러오|실패|오류/.test(text(waiting)), 'no message while waiting or after a failure');
    const hostile = render(CARD, { ...props, detail: { body: '<img src=x onerror=alert(1)>', format: '' } }, pick);
    assert.ok(!/<img src=x/.test(hostile), 'server text is plain text');
    const picture = render(CARD, { ...props, post: post('nt_5', 'notice', { thumbId: '_thumb', hasImage: true }), detail: null }, pick);
    assert.match(picture, /cm-nlead-media/);
    assert.match(picture, /cm-thumb/);
});

test('stylesheet: nothing in the card is cut, letters are 14px or more, the phone layout is the same card', () => {
    const css = fs.readFileSync(new URL('../src/components/community/community-notice-lead.css', import.meta.url), 'utf8');
    assert.ok(!/line-clamp|text-overflow|max-height/.test(css), 'no clamp anywhere in the card');
    for (const match of css.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(match[1]) >= 14, match[0]);
    assert.match(css, /@media \(max-width: 720px\)\s*\{[^}]*\.cm-nlead\s*\{/);
    assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(/i.test(css), 'colours come from the --lp tokens only');
});

test('login screen of the community: says this board is for members (공지·최근 소식 are open now); other areas unchanged', () => {
    const page = (props) => text(render('../../src/components/auth/LoginRequired.tsx', props));
    const community = page({ area: 'community', next: '/community?board=free' });
    assert.match(community, /이 게시판은 로그인한 분만 볼 수 있어요/);
    assert.ok(!/커뮤니티는 로그인한 분만/.test(community));
    assert.match(page({ area: 'leword', next: '/leword' }), /LEWORD 는 로그인한 분만 쓸 수 있어요/);
    assert.match(page({ area: 'account', next: '/account' }), /내 정보는 로그인한 분만 볼 수 있어요/);
});
