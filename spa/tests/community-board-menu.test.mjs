// [2026-11-25 사장님] 게시판 목록에서 '전체글' 칸을 뺀다(첫 화면과 그 제목은 그대로). 시크릿 클래스 칸은 은빛.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

function render(file, props, exportName = 'default', path = '/community') {
    fakeBrowser();
    try {
        const Component = createLoader()(file)[exportName];
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const boards = () => createLoader()('../../src/lib/communityModel.mjs').boardList(null);
const tagsOf = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const SIDEBAR = '../../src/components/community/CommunitySidebar.tsx';
const member = { userId: 'u1', role: 'community', nickname: '이웃', avatarKey: '', score: 42, activity: { posts: 0, comments: 0, visits: 0 }, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 300, nextLabel: '잎새' }, level: 'member' };
const side = (boardId, extra = {}) => render(SIDEBAR, { profile: member, boards: boards(), boardId, counts: {}, ...extra });
const tabs = (boardId) => render(SIDEBAR, { boards: boards(), boardId }, 'BoardTabs');
const linkTags = (html) => tagsOf(html, 'a').filter((tag) => /cm-(tab|htab)\b/.test(tag));

test('no 전체글 in the board menu: not in the side list, not in the phone tabs, and the first entry is 공지사항', () => {
    for (const html of [side('all'), tabs('all')]) {
        assert.doesNotMatch(text(html), /전체글/);
        const links = linkTags(html);
        assert.equal(links.length, 10, 'the ten boards only');
        assert.equal(attr(links[0], 'href'), '/community?board=notice');
        assert.ok(!links.some((tag) => attr(tag, 'href') === '/community'), 'nothing points at the bare /community');
        assert.ok(!links.some((tag) => /\bon\b/.test(attr(tag, 'class')) || attr(tag, 'aria-current')), 'on the first screen no entry is marked (fine)');
    }
});

test('guest screen: the board list loses 전체글 too, while the first screen keeps its title', () => {
    const feed = { status: 'ready', refreshing: false, stale: false, pinned: [], posts: [], total: 0, totalPages: 1, message: '', code: '', counts: {}, config: null, weekly: [], reload() {} };
    const html = render('../../src/components/community/GuestCommunityView.tsx', { view: { board: 'all', sort: 'latest', page: 1 }, feed, boards: boards(), next: '/community', legacy: false });
    const nav = (label) => html.slice(html.indexOf(`aria-label="${label}"`), html.indexOf('</nav>', html.indexOf(`aria-label="${label}"`)));
    for (const label of ['게시판', '게시판 바로가기']) {
        assert.ok(nav(label).length > 20, `${label} exists`);
        assert.doesNotMatch(text(nav(label)), /전체글/);
    }
    assert.match(text(html.replace(nav('게시판'), '').replace(nav('게시판 바로가기'), '')), /전체글/, 'the title of the first screen stays');
});

test('the first screen of /community still reads 전체글 (page source untouched)', () => {
    for (const file of ['../src/pages/CommunityPage.tsx', '../src/components/community/GuestCommunityView.tsx']) assert.match(read(file), /view\.board === ALL_BOARD \? '전체글'/);
});

test('silver: only the locked board gets the silver class, in the side list and in the phone tabs, selected or not', () => {
    for (const html of [side('free'), tabs('free'), side('secret'), tabs('secret')]) {
        const silver = linkTags(html).filter((tag) => /\bcm-silver\b/.test(tag));
        assert.deepEqual(silver.map((tag) => attr(tag, 'href')), ['/community?board=secret']);
        assert.match(html, /cm-lock/, 'with the lock mark');
    }
    const selected = linkTags(side('secret')).find((tag) => /cm-silver/.test(tag));
    assert.match(attr(selected, 'class'), /\bon\b/);
    assert.equal(attr(selected, 'aria-current'), 'page');
    assert.doesNotMatch(attr(linkTags(side('free')).find((tag) => /cm-silver/.test(tag)), 'class'), /\bon\b/);
});

// WCAG contrast of two #rrggbb colours.
const lum = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('silver look: cool grey stops, thin line, dark ink >= 4.5:1 on every stop, steel lock >= 3:1, no gold left, no looping motion', () => {
    const css = read('../src/components/community/community-secret.css');
    const color = (name) => (css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
    const stops = ['--cm-silver-light', '--cm-silver-mid', '--cm-silver-deep'].map(color);
    assert.ok(stops.every(Boolean), 'the silver stops are variables');
    for (const hex of stops) {
        const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
        assert.ok(b >= r && b - r <= 16 && Math.abs(g - r) <= 12, `${hex} is a cool grey`);
        assert.ok(contrast(color('--cm-silver-ink'), hex) >= 4.5, `ink on ${hex}`);
        assert.ok(contrast(color('--cm-silver-ink-soft'), hex) >= 4.5, `soft ink on ${hex}`);
        assert.ok(contrast(color('--cm-silver-icon'), hex) >= 3, `lock on ${hex}`);
    }
    assert.doesNotMatch(css, /#8a6d1f/i, 'the gold of the lock and the tag line is gone');
    assert.doesNotMatch(css, /animation|@keyframes/, 'no looping motion: hover only');
    assert.match(css, /\.cm-tab\.cm-silver:hover/);
    assert.match(css, /prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.cm-silver[^}]*transition:\s*none/);
    assert.match(css, /\.lp-box\.cm-secret-lock/, 'the lock card is silver too');
});

// Regression (seen in the first capture): the old `.cm-tab.on { background: ... }` shorthand resets size / position / repeat, which left the
// glint band parked in the middle of the selected silver tab. The selected rule must restate them (and keep the hover glint).
test('silver selected state restates the glint geometry so the shorthand of .on cannot park the band', () => {
    const body = (selector) => {
        const css = read('../src/components/community/community-secret.css');
        const start = css.indexOf(`${selector} {`);
        assert.ok(start >= 0, selector);
        return css.slice(start, css.indexOf('}', start));
    };
    for (const selector of ['.cm-tab.cm-silver.on, .cm-htab.cm-silver.on']) {
        for (const property of ['background-size', 'background-position', 'background-repeat', 'background-color']) assert.match(body(selector), new RegExp(`${property}:`), `${selector} sets ${property}`);
        assert.match(body(selector), /background-position:\s*100% 0/, 'at rest the band waits off to the left');
    }
    assert.match(read('../src/components/community/community-secret.css'), /\.cm-tab\.cm-silver\.on:hover,\s*\.cm-htab\.cm-silver\.on:hover\s*\{\s*background-position:\s*0% 0/, 'the selected tab glints on hover too');
});
