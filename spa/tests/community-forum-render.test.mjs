// Forum stage screens (contract 1114) rendered from the real components: 준회원 card and write gate, promo sub-tabs and
// platform choice, the row menu with [신고], the picture mark, the rich body inside the post view.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const NOW = new Date('2026-11-08T12:00:00+09:00').getTime();

function render(file, props, path = '/community') {
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

const profile = (extra = {}) => ({
    userId: 'u1', role: 'community', nickname: '이웃', avatarKey: '', needsNickname: false, canWriteNews: false, isOperator: false, score: 42,
    activity: { posts: 0, comments: 0, visits: 0, likes: null }, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 300, nextLabel: '잎새' },
    linked: false, rewards: [], level: 'member', levelUp: { post: false, comment: false }, ...extra,
});
const associate = (levelUp) => profile({ level: 'associate', levelUp, grade: { key: 'associate', label: '준회원', min: 0, nextAt: null, nextLabel: null } });
const post = (id, board, extra = {}) => load()('../../src/lib/communityData.ts').normalizePost({
    id, board, title: `제목 ${id}`, excerpt: '', nickname: '글쓴이', grade: { key: 'sprout', label: '새싹' }, isOperator: false, createdAt: '2026-11-08T11:25:00+09:00',
    views: 1, likes: 0, comments: 0, pinned: false, status: '', mine: false, liked: false, ...extra,
});
const boards = () => load()('../../src/lib/communityModel.mjs').boardList(null);
const viewProps = (item, extra = {}) => ({ post: item, boards: boards(), onLike() {}, onReport() {}, onEdit() {}, onDelete() {}, onVisit() {}, now: NOW, ...extra });

test('준회원 card: the two conditions with marks, the button; nothing for a member', () => {
    const html = render('../../src/components/community/LevelUpCard.tsx', { profile: associate({ post: true, comment: false }) });
    assert.match(text(html), /준회원이에요/);
    assert.match(text(html), /자유게시판에 가입 인사 1개/);
    assert.match(text(html), /댓글 1개/);
    assert.equal((html.match(/class="is-done"/g) || []).length, 1, 'one condition done');
    assert.match(html, /<button[^>]*>등업 신청<\/button>/);
    assert.equal(render('../../src/components/community/LevelUpCard.tsx', { profile: profile() }), '');
    assert.match(text(render('../../src/components/community/LevelUpCard.tsx', { profile: associate({ post: false, comment: false }), hint: '등업 후 쓸 수 있어요.' })), /등업 후 쓸 수 있어요\./);
});

test('write form: an associate who already wrote the greeting sees the card instead of a form', () => {
    const base = { boards: boards(), defaultBoard: 'free', onDone() {}, onCancel() {} };
    const closed = render('../../src/components/community/PostWriteForm.tsx', { ...base, profile: associate({ post: true, comment: false }) });
    assert.match(text(closed), /가입 인사는 1개만/);
    assert.equal(tags(closed, 'input').filter((tag) => attr(tag, 'type') === 'text').length, 0);
    assert.ok(!/role="textbox"/.test(closed));
    const open = render('../../src/components/community/PostWriteForm.tsx', { ...base, profile: associate({ post: false, comment: false }) });
    assert.match(open, /role="textbox"/);
    assert.match(text(open), /준회원은 자유게시판에 가입 인사 1개/);
    const choices = [...open.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((match) => match[1]);
    assert.deepEqual(choices, ['자유게시판'], 'an associate writes on 자유게시판 only');
    const editing = render('../../src/components/community/PostWriteForm.tsx', { ...base, profile: associate({ post: true, comment: false }), editing: post('p_1', 'free', { body: '내 인사' }) });
    assert.match(text(editing), /글 고치기/, 'the one greeting can still be edited');
});

test('promo sub-tabs: naver | google, the current one marked, each a link that keeps the platform', () => {
    const html = render('../../src/components/community/PromoTabs.tsx', { platform: 'google', sort: 'popular' });
    const links = tags(html, 'a');
    assert.equal(links.length, 2);
    assert.deepEqual(links.map((tag) => attr(tag, 'href')), ['/community?board=promo&amp;sort=popular', '/community?board=promo&amp;platform=google&amp;sort=popular']);
    assert.deepEqual(links.map((tag) => attr(tag, 'aria-current')), [undefined, 'page']);
    assert.match(text(html), /네이버 블로그/);
    assert.match(text(html), /구글 블로그/);
});

test('promo write form: two platform choices, the one from the sub-tab checked', () => {
    const base = { boards: boards(), defaultBoard: 'promo', profile: profile(), onDone() {}, onCancel() {} };
    const google = render('../../src/components/community/PostWriteForm.tsx', { ...base, defaultPlatform: 'google' });
    const radios = tags(google, 'input').filter((tag) => attr(tag, 'type') === 'radio');
    assert.deepEqual(radios.map((tag) => [attr(tag, 'value'), /checked/.test(tag)]), [['naver', false], ['google', true]]);
    assert.match(google, /placeholder="https:\/\/내블로그\.blogspot\.com\/글"/);
    const naver = render('../../src/components/community/PostWriteForm.tsx', base);
    assert.match(naver, /placeholder="https:\/\/blog\.naver\.com\//);
});

const listProps = (items, extra = {}) => ({
    title: '자유게시판', boardId: 'free', boards: boards(), pinned: [], posts: items, total: items.length, page: 1, totalPages: 1, sort: 'latest', now: NOW, onVisit() {}, ...extra,
});

test('list rows: the ⋯ menu only where [신고] is allowed, and a mark on posts with a picture', () => {
    const mine = post('p_1', 'free', { mine: true });
    const other = post('p_2', 'free', { hasImage: true, format: 'rich' });
    const notice = post('nt_1', 'notice');
    const { reportAction } = load()('../../src/lib/communityReport.mjs');
    const html = render('../../src/components/community/PostList.tsx', listProps([mine, other, notice], { onReport() {}, reportMode: (item) => reportAction(item, {}) }));
    assert.equal(tags(html, 'button').filter((tag) => /cm-more"/.test(tag)).length, 1, 'only the post of another member');
    assert.match(html, /aria-label="더보기"/);
    assert.match(html, /aria-haspopup="menu"/);
    assert.equal((html.match(/cm-pic-mark/g) || []).length, 1);
    assert.match(html, /aria-label="사진 있음"/);
    const bare = render('../../src/components/community/PostList.tsx', listProps([other]));
    assert.ok(!/cm-more"/.test(bare), 'without a handler the rows have no menu');
});

test('post view: [신고] follows the report mode; a rich body is drawn from its blocks', () => {
    const rich = post('p_1', 'free', { format: 'rich', body: JSON.stringify({ v: 1, blocks: [{ t: 'p', c: [{ x: '본문', b: 1 }] }] }) });
    const shown = render('../../src/components/community/PostView.tsx', viewProps(rich, { reportMode: 'report' }));
    assert.match(shown, />신고<\/button>/);
    assert.match(shown, /<strong>본문<\/strong>/);
    assert.match(shown, /cm-rich-body/);
    assert.ok(!/>신고<\/button>/.test(render('../../src/components/community/PostView.tsx', viewProps(rich, { reportMode: 'hidden' }))));
    assert.match(render('../../src/components/community/PostView.tsx', viewProps(rich, { reportMode: 'login' })), />신고<\/button>/);
    assert.ok(!/cm-rich-body/.test(render('../../src/components/community/PostView.tsx', viewProps(post('p_2', 'free', { body: '평문' })))), 'an old post is plain text');
});

test('promo post view names the platform in words', () => {
    const google = render('../../src/components/community/PostView.tsx', viewProps(post('pr_1', 'promo', { url: 'https://abc.blogspot.com/1', platform: 'google' })));
    assert.match(google, /cm-promo-plat">구글 블로그</);
    const old = render('../../src/components/community/PostView.tsx', viewProps(post('pr_2', 'promo', { url: 'https://blog.naver.com/a/1', platform: '' })));
    assert.match(old, /cm-promo-plat">네이버 블로그</);
});

test('my page card: an associate gets the checklist and no score bar; a member keeps the bar', () => {
    const props = (user) => ({ profile: user, detail: null, onChanged() {}, onDetail() {} });
    const assoc = render('../../src/components/account/ProfileCard.tsx', props(associate({ post: false, comment: true })), '/me');
    assert.match(text(assoc), /준회원이에요/);
    assert.match(text(assoc), /등업하면 새싹이 돼요/);
    assert.ok(!/role="progressbar"/.test(assoc));
    const member = render('../../src/components/account/ProfileCard.tsx', props(profile()), '/me');
    assert.match(member, /role="progressbar"/);
    assert.ok(!/준회원이에요/.test(member));
});
