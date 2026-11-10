// 최근 소식 lead card on the real components: the first post of the news board (page 1) is drawn as one big card,
// the rest stay rows, every other board is untouched. Plus the stylesheet contract (sizes, one link, phone layout).
// Server text is hostile on purpose: it must come out as plain text. No server is touched.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const NOW = new Date('2026-11-08T12:00:00+09:00').getTime();

function render(file, props, { path = '/community' } = {}) {
    fakeBrowser();
    try {
        const Component = createLoader()(file).default;
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const load = () => createLoader();
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i')) || [])[1];
const post = (id, board = 'news', extra = {}) => load()('../../src/lib/communityData.ts').normalizePost({
    id, board, title: `제목 ${id}`, excerpt: '', nickname: '리더남', grade: { key: 'sprout', label: '새싹' }, isOperator: false, createdAt: '2026-11-08T11:25:00+09:00',
    views: 1, likes: 0, comments: 0, pinned: false, status: '', mine: false, liked: false, ...extra,
});
const boards = () => load()('../../src/lib/communityModel.mjs').boardList(null);
const listProps = (items, extra = {}) => ({
    title: '최근 소식', boardId: 'news', boards: boards(), pinned: [], posts: items, total: items.length, page: 1, totalPages: 1, sort: 'latest', now: NOW, onVisit() {}, ...extra,
});
const LIST = '../../src/components/community/PostList.tsx';
const withPicture = { thumbId: '_thumb', hasImage: true };
/** The markup of the lead card alone ('' when there is none). */
const cardOf = (html) => {
    const start = html.indexOf('<li class="cm-lead');
    return start < 0 ? '' : html.slice(start, html.indexOf('</li>', start) + 5);
};
const rowsOf = (html) => html.split('<li class="cm-row').slice(1);

test('news, page 1: the first post is one big card above the rows; the others are rows as before', () => {
    const html = render(LIST, listProps([post('n_1', 'news', withPicture), post('n_2'), post('n_3')]));
    assert.equal(html.split('<li class="cm-lead').length - 1, 1, 'exactly one card');
    const card = cardOf(html);
    assert.match(text(card), /제목 n_1/);
    assert.doesNotMatch(text(card), /제목 n_2|제목 n_3/);
    const rows = rowsOf(html);
    assert.equal(rows.length, 2);
    assert.match(text(rows[0]), /제목 n_2/);
    assert.match(text(rows[1]), /제목 n_3/);
    assert.ok(html.indexOf('<li class="cm-lead') < html.indexOf('<li class="cm-row'), 'the card comes first');
    assert.match(html, /class="lp-box cm-board[^"]*\bhas-lead\b/);
});

test('no card on other boards, on the all-posts view, after page 1, while loading, or when empty: nothing changes', () => {
    const items = [post('n_1', 'news', withPicture), post('n_2')];
    for (const props of [{ boardId: 'all' }, { boardId: 'free' }, { boardId: 'notice' }, { boardId: 'qna' }, { boardId: 'news', page: 2, totalPages: 3 }]) {
        const html = render(LIST, listProps(items, props));
        assert.ok(!/<li class="cm-lead/.test(html), JSON.stringify(props));
        assert.ok(!/has-lead/.test(html), JSON.stringify(props));
        assert.equal(rowsOf(html).length, 2, JSON.stringify(props));
    }
    const loading = render(LIST, listProps([], { loading: true }));
    assert.ok(!/cm-lead/.test(loading));
    assert.match(text(loading), /불러오는 중이에요/);
    const empty = render(LIST, listProps([], { total: 0 }));
    assert.ok(!/cm-lead/.test(empty));
    assert.match(text(empty), /아직 올라온 글이 없어요/);
    assert.match(render(LIST, listProps([post('f_1', 'free')], { boardId: 'free' })), /class="lp-box cm-board"/, 'the section class of other boards is exactly as before');
});

test('the first post of the server order is the card, whatever the sort is, and its link keeps the board and the sort', () => {
    for (const sort of ['latest', 'popular', 'comments']) {
        const html = render(LIST, listProps([post('n_9', 'news', withPicture), post('n_1')], { sort }));
        const card = cardOf(html);
        assert.match(text(card), /제목 n_9/, sort);
        const link = tags(card, 'a')[0];
        const query = sort === 'latest' ? 'board=news&amp;post=n_9' : `board=news&amp;sort=${sort}&amp;post=n_9`;
        assert.equal(attr(link, 'href'), `/community?${query}`, sort);
    }
});

test('the card has a picture box when the post has a picture; without one it is a text-only card with the whole title', () => {
    const photo = cardOf(render(LIST, listProps([post('n_1', 'news', withPicture)])));
    assert.match(photo, /cm-lead-media/);
    assert.match(photo, /cm-thumb/);
    assert.ok(!/is-plain/.test(photo));
    const plain = cardOf(render(LIST, listProps([post('n_2')])));
    assert.match(plain, /class="cm-lead is-plain/, 'the card itself stays');
    assert.ok(!/cm-lead-media/.test(plain), 'no empty picture box');
    assert.ok(!/cm-top-tile/.test(plain), 'no tile that would cut a long title');
    assert.ok(!/cm-thumb/.test(plain));
    assert.equal(text(plain).split('제목 n_2').length - 1, 1, 'the title is shown once');
    const link = plain.slice(plain.indexOf('<a'), plain.indexOf('</a>'));
    assert.match(text(link), /제목 n_2/, 'the link carries the title');
    const css = fs.readFileSync(new URL('../src/components/community/community-lead.css', import.meta.url), 'utf8');
    assert.match(css, /\.cm-lead\.is-plain\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/, 'a text-only card is one column');
    assert.ok(!/is-tile/.test(css), 'the hidden-title rule is gone');
    const promo = cardOf(render(LIST, listProps([post('n_3', 'news', { thumbUrl: 'https://img.example.com/a.jpg' })])));
    assert.match(promo, /<img[^>]*src="https:\/\/img\.example\.com\/a\.jpg"/, 'an https picture address is drawn too');
});

test('what the card shows: title, author (avatar, grade badge, nickname), date, views, likes, comments', () => {
    const html = render(LIST, listProps([post('n_1', 'news', { ...withPicture, views: 188, likes: 4, comments: 12, nickname: '리더남' })]));
    const card = cardOf(html);
    assert.match(card, /<h3 class="cm-lead-title">/);
    assert.match(text(card), /제목 n_1/);
    assert.match(card, /cm-lead-author/);
    assert.match(card, /lp-g-sprout[^>]*>새싹</);
    assert.match(text(card), /리더남/);
    assert.match(text(card), /35분 전/);
    assert.match(text(card), /조회\s*188/);
    assert.match(text(card), /좋아요\s*4/);
    assert.match(text(card), /댓글\s*12/);
    const staff = cardOf(render(LIST, listProps([post('n_2', 'news', { isOperator: true, grade: null, nickname: '운영자' })])));
    assert.match(staff, /lp-g-staff[^>]*>운영진</);
    const zero = cardOf(render(LIST, listProps([post('n_3', 'news', { comments: 0 })])));
    assert.match(text(zero), /댓글\s*0/, 'a post without comments still shows the number');
});

test('the summary is shown only when the server sent one, as plain text; none is made up', () => {
    const withText = cardOf(render(LIST, listProps([post('n_1', 'news', { ...withPicture, excerpt: '업데이트 정리 첫 줄' })])));
    assert.match(withText, /<p class="cm-lead-excerpt">업데이트 정리 첫 줄<\/p>/);
    const without = cardOf(render(LIST, listProps([post('n_2', 'news', { ...withPicture, excerpt: '' })])));
    assert.ok(!/cm-lead-excerpt/.test(without), 'no field, no line');
    const hostile = cardOf(render(LIST, listProps([post('n_3', 'news', { title: '<img src=x onerror=alert(1)>', excerpt: '<script>alert(1)</script>' })])));
    assert.ok(!/<img src=x/.test(hostile));
    assert.ok(!/<script>/.test(hostile));
    assert.match(hostile, /&lt;img src=x/);
});

test('the whole card is one link and no button sits inside a link', () => {
    const items = [post('n_1', 'news', withPicture), post('n_2')];
    const html = render(LIST, listProps(items, { onReport() {}, reportMode: () => 'report' }));
    const card = cardOf(html);
    const links = tags(card, 'a');
    assert.equal(links.length, 1, 'a single link in the card: the picture and the rest are not links of their own');
    assert.match(links[0], /class="cm-lead-link"/);
    assert.ok(/<button/.test(card), 'the row menu button is there');
    assert.ok(!/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button/.test(card), 'no button inside a link');
    assert.ok(!/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/.test(card), 'no link inside a link');
    assert.match(card, /<span class="cm-lead-media"[^>]*aria-hidden="true"/, 'the picture box is decoration for a screen reader');
});

test('the row menu (신고) works on the card as on a row: shown when allowed, absent otherwise', () => {
    const items = [post('n_1', 'news', withPicture)];
    const allowed = cardOf(render(LIST, listProps(items, { onReport() {}, reportMode: () => 'report' })));
    assert.match(allowed, /class="cm-more"[^>]*aria-label="더보기"|aria-label="더보기"[^>]*class="cm-more"/);
    const login = cardOf(render(LIST, listProps(items, { onReport() {}, reportMode: () => 'login' })));
    assert.match(login, /cm-more/, 'a visitor not logged in gets the menu too, as on a row');
    const hidden = cardOf(render(LIST, listProps(items, { onReport() {}, reportMode: () => 'hidden' })));
    assert.ok(!/cm-more/.test(hidden));
    const none = cardOf(render(LIST, listProps(items)));
    assert.ok(!/cm-more/.test(none), 'no handler, no menu');
});

test('moderators see 숨김 and 신고 N on the card; other readers see neither', () => {
    const marked = post('n_1', 'news', { ...withPicture, hidden: true, openReports: 2 });
    const staff = cardOf(render(LIST, listProps([marked], { moderator: true })));
    assert.match(staff, /lp-state lp-state-wait">숨김</);
    assert.match(staff, /lp-state lp-state-report">신고 2</);
    const reader = cardOf(render(LIST, listProps([marked], { moderator: false })));
    assert.ok(!/숨김|신고/.test(text(reader)));
    const clean = cardOf(render(LIST, listProps([post('n_2')], { moderator: true })));
    assert.ok(!/숨김|신고/.test(text(clean)), 'nothing to mark, nothing marked');
});

test('a notice keeps its badges and has no view count, as in a row', () => {
    const notice = post('nt_1', 'news', { badge: 'important', views: 0 });
    const card = cardOf(render(LIST, listProps([notice])));
    assert.match(card, /lp-state lp-state-notice">공지</);
    assert.match(card, /lp-state-notice-kind/);
    assert.ok(!/조회/.test(text(card)));
});

test('a pinned post and the reader\'s own sending post stay rows above the card; the card is the first ordinary post', () => {
    const pin = post('n_pin', 'news', { pinned: true });
    const mine = { ...post('n_mine'), delivery: 'sending' };
    const html = render(LIST, listProps([post('n_1', 'news', withPicture), post('n_2')], { pinned: [pin], local: [mine] }));
    const rows = rowsOf(html);
    assert.equal(rows.length, 3, 'local, pinned and the second post');
    assert.match(rows[0], /is-sending/);
    assert.match(rows[1], /is-pin/);
    assert.match(text(rows[1]), /제목 n_pin/);
    assert.match(text(cardOf(html)), /제목 n_1/);
    assert.ok(!/is-pin|is-sending/.test(cardOf(html)));
    assert.ok(html.indexOf('is-sending') < html.indexOf('<li class="cm-lead'), 'own sending post first, as before');
    assert.ok(html.indexOf('is-pin') < html.indexOf('<li class="cm-lead'), 'pinned next, as before');
    assert.ok(html.indexOf('<li class="cm-lead') < html.indexOf('제목 n_2'), 'the card replaces the first ordinary row in place');
});

test('only the rows decide whether the list gets its picture column: the card\'s own picture does not', () => {
    const cardOnly = render(LIST, listProps([post('n_1', 'news', withPicture), post('n_2')]));
    assert.ok(!/has-thumbs/.test(cardOnly), 'rows without pictures keep the plain table layout');
    const rowPicture = render(LIST, listProps([post('n_1'), post('n_2', 'news', withPicture)]));
    assert.match(rowPicture, /class="lp-box cm-board has-thumbs/);
    assert.equal((rowPicture.match(/cm-row-thumb/g) || []).length, 1);
    const pinnedPicture = render(LIST, listProps([post('n_1'), post('n_2')], { pinned: [post('n_pin', 'news', { ...withPicture, pinned: true })] }));
    assert.match(pinnedPicture, /has-thumbs/);
});

test('rows after the card are the same rows as before (title link, comment count, author, numbers)', () => {
    const html = render(LIST, listProps([post('n_1', 'news', withPicture), post('n_2', 'news', { comments: 5, views: 70, likes: 2 })], { sort: 'popular' }));
    const [row] = rowsOf(html);
    assert.equal(attr(tags(row, 'a')[0], 'href'), '/community?board=news&amp;sort=popular&amp;post=n_2');
    assert.match(row, /<em class="cm-cmt">\[5\]<\/em>/);
    assert.match(text(row), /리더남/);
    assert.match(text(row), /조회 70/);
    assert.match(text(row), /좋아요 2/);
});

// ---- stylesheet contract -------------------------------------------------------------------------------------------

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
// Read inside each test so a missing file fails that test only.
const leadCss = () => read('../src/components/community/community-lead.css');
const thumbCss = () => read('../src/components/community/community-thumb.css');
const flat = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].replace(/@media[^{]*$/, '').trim(), body: match[2] }));
const rule = (css, selector) => flat(css).filter((entry) => entry.selector.split(',').map((part) => part.trim()).includes(selector)).map((entry) => entry.body).join(';');
/** The text inside the `@media (max-width: 720px) { ... }` block. */
function phoneBlock(css) {
    const start = css.indexOf('@media (max-width: 720px)');
    assert.ok(start >= 0, 'a phone block exists');
    let depth = 0;
    for (let index = css.indexOf('{', start); index < css.length; index += 1) {
        if (css[index] === '{') depth += 1;
        if (css[index] === '}' && (depth -= 1) === 0) return css.slice(css.indexOf('{', start) + 1, index);
    }
    return '';
}

test('stylesheet: the picture column is 300-360px (the stored picture is 360px), landscape, cover-fitted; the title takes three lines at most', () => {
    const lead = leadCss();
    assert.match(rule(lead, '.cm-lead'), /grid-template-columns:\s*clamp\(300px,[^,]+,\s*360px\)\s+minmax\(0,\s*1fr\)/);
    const media = rule(lead, '.cm-lead-media');
    assert.match(media, /aspect-ratio:\s*\d+\s*\/\s*\d+/);
    assert.match(media, /max-width:\s*360px/);
    assert.match(media, /overflow:\s*hidden/);
    assert.match(rule(lead, '.cm-lead-media .cm-thumb'), /position:\s*absolute/);
    assert.match(rule(thumbCss(), '.cm-thumb img'), /object-fit:\s*cover/, 'the picture fills its box without stretching');
    assert.doesNotMatch(lead, /object-fit:\s*(fill|contain)/);
    assert.match(rule(lead, '.cm-lead-title'), /-webkit-line-clamp:\s*3/);
    assert.match(rule(lead, '.cm-lead-excerpt'), /-webkit-line-clamp:\s*2/);
    const size = (selector) => Number((rule(lead, selector).match(/font-size:\s*(\d+)px/) || [])[1]);
    assert.ok(size('.cm-lead-title') > 17, 'bigger than a row title (17px)');
});

test('stylesheet: the title link is stretched over the whole card; the menu stays clickable above it; focus is shown on the card', () => {
    const lead = leadCss();
    assert.match(rule(lead, '.cm-lead'), /position:\s*relative/);
    const stretch = rule(lead, '.cm-lead-link::after');
    assert.match(stretch, /position:\s*absolute/);
    assert.match(stretch, /inset:\s*0/);
    assert.match(stretch, /content:\s*''/);
    const more = rule(lead, '.cm-lead-more');
    assert.match(more, /position:\s*relative/);
    assert.match(more, /z-index:\s*[1-9]/);
    assert.match(rule(lead, '.cm-lead-link:focus-visible'), /outline:\s*none/);
    assert.match(rule(lead, '.cm-lead-link:focus-visible::after'), /outline:\s*3px solid/);
});

test('stylesheet: on a phone the picture is above and the text below, nothing is wider than the screen', () => {
    const lead = leadCss();
    const phone = phoneBlock(lead);
    assert.match(rule(phone, '.cm-lead'), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.match(rule(lead, '.cm-lead-body'), /min-width:\s*0/);
    assert.match(rule(lead, '.cm-lead-title'), /overflow-wrap:\s*anywhere/);
    assert.match(rule(lead, '.cm-lead-media'), /width:\s*100%/, 'the box shrinks with a narrow screen');
    assert.match(rule(lead, '.cm-lead-meta'), /flex-wrap:\s*wrap/);
});

test('stylesheet: while the card is drawn the table header goes away (it would sit above a card)', () => {
    const lead = leadCss();
    assert.match(rule(lead, '.has-lead .cm-thead'), /display:\s*none/);
});

test('the new files stay within the 300-line limit', () => {
    for (const file of ['../src/components/community/LeadCard.tsx', '../src/components/community/community-lead.css', '../src/lib/communityLead.mjs', '../src/components/community/PostList.tsx']) {
        assert.ok(read(file).split('\n').length <= 300, file);
    }
    assert.doesNotMatch(read('../src/components/community/LeadCard.tsx'), /console\./);
});
