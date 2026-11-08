// Top menu markup (2026-11-07, light bar "design 1"): links, active marks, dropdown/sheet ARIA state, badge, login/account.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const NINE_PAGES = ['/', '/leword', '/products', '/download', '/chatbots', '/pricing', '/lookup', '/reviews', '/community'];
const SESSION_KEY = 'leaderspro.leword.session.v2';

function load(path, hooks, env) {
    const sourceUrl = new URL(path, import.meta.url);
    const text = fs.readFileSync(sourceUrl, 'utf8');
    const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
    const output = { exports: {} };
    new Function('require', 'module', 'exports', code)((id) => {
        if (id === 'react' && hooks) return hooks;
        if (id.endsWith('.css')) return {};
        if (id.endsWith('.svg')) return { default: id };
        if (id.endsWith('lib/siteOps')) return { GAS_URL: 'https://gas.invalid/exec' };
        if (id.endsWith('lib/useNoticeAlerts')) return { useUnseenNoticeCount: () => env.unseen };
        if (id.startsWith('.')) {
            for (const extension of ['', '.tsx', '.ts', '.mjs', '.js']) {
                const resolved = new URL(`${id}${extension}`, sourceUrl);
                if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return load(resolved, hooks, env);
            }
        }
        return require(id);
    }, output, output.exports);
    return output.exports;
}

/** Render the real Navbar at `path`; `forced` pre-sets the reducer state, `session` fakes the stored login. */
function render(path, { forced = {}, unseen = 0, session = null, community = null } = {}) {
    const hooks = { ...React, useReducer: (reducer, init, initFn) => React.useReducer(reducer, { ...(initFn ? initFn(init) : init), ...forced }) };
    globalThis.localStorage = {
        getItem: (key) => {
            if (key === SESSION_KEY && session) return JSON.stringify(session);
            if (key === 'leaderspro.community.session.v1' && community) return JSON.stringify(community);
            return null;
        },
        setItem() {}, removeItem() {},
    };
    try {
        const { default: Navbar } = load('../src/components/Navbar.tsx', hooks, { unseen });
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Navbar)));
    } finally {
        delete globalThis.localStorage;
    }
}

const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
const tagsOf = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);
const hasHidden = (tag) => /\shidden=""/.test(tag);
const hrefs = (html) => tagsOf(html, 'a').map((tag) => attr(tag, 'href'));
const withAttr = (html, name, value) => tagsOf(html, '[a-z]+').filter((tag) => attr(tag, name) === value);

/** Split the markup into the always-visible bar and the phone sheet. */
function regions(html) {
    const at = html.indexOf('id="site-nav-sheet"');
    assert.ok(at > 0, 'phone sheet is rendered with id="site-nav-sheet"');
    const sheetStart = html.lastIndexOf('<', at);
    return { bar: html.slice(0, sheetStart), sheet: html.slice(sheetStart), sheetTag: html.slice(sheetStart, html.indexOf('>', sheetStart) + 1) };
}

// The promo board is two sub-tabs (naver, google) in the menu: eight links for the seven boards.
const BOARD_LINKS = [...['notice', 'news', 'qna', 'request', 'inquiry', 'free', 'promo'].map((id) => '/community?board=' + id), '/community?board=promo&amp;platform=google'];
const QNA = '/community?board=qna';

test('both the bar and the phone sheet link to every one of the nine pages (community: through its seven boards)', () => {
    const { bar, sheet } = regions(render('/'));
    for (const region of [bar, sheet]) {
        const boards = hrefs(region).filter((href) => href.startsWith('/community'));
        assert.equal(boards[0], QNA, '질문하기 has its own place before the community boards');
        assert.deepEqual(boards.slice(1, 9), BOARD_LINKS, 'seven boards in board order, the promo board as naver then google');
    }
    for (const page of NINE_PAGES.filter((entry) => entry !== '/community')) {
        assert.ok(hrefs(bar).includes(page), `bar links ${page}`);
        assert.ok(hrefs(sheet).includes(page), `sheet links ${page}`);
    }
    assert.ok(hrefs(bar).filter((href) => href === '/pricing').length >= 2, 'dropdown item and yellow CTA both reach pricing');
});

test('bar has the brand link, the yellow free-trial button and a login button', () => {
    const { bar } = regions(render('/community'));
    const brand = tagsOf(bar, 'a').find((tag) => attr(tag, 'aria-label') === 'Leaders Pro 홈으로');
    assert.ok(brand, 'brand link');
    assert.equal(attr(brand, 'href'), '/');
    assert.equal(attr(brand, 'aria-current'), undefined, 'brand is not a menu item and is never marked current');
    const cta = tagsOf(bar, 'a').find((tag) => attr(tag, 'href') === '/pricing' && /site-nav-btn-cta/.test(tag));
    assert.ok(cta, 'yellow free-trial link goes to /pricing');
    assert.match(bar.slice(bar.indexOf(cta)), /^[\s\S]*?무료체험 시작/);
    assert.match(bar, /<button[^>]*class="[^"]*site-nav-login[^"]*"[^>]*>로그인<\/button>/);
});

test('current page: one aria-current in the bar, its dropdown group is marked, other groups are not', () => {
    const { bar, sheet } = regions(render('/products'));
    const current = withAttr(bar, 'aria-current', 'page');
    assert.equal(current.length, 1);
    assert.equal(attr(current[0], 'href'), '/products');
    assert.equal(withAttr(sheet, 'aria-current', 'page').length, 1, 'sheet marks the same page once');
    const triggers = tagsOf(bar, 'button').filter((tag) => /site-nav-trigger/.test(tag));
    assert.equal(triggers.length, 3);
    const [product, buy, community] = triggers;
    assert.match(product, /is-active/);
    assert.doesNotMatch(buy, /is-active/);
    assert.doesNotMatch(community, /is-active/);
});

test('질문하기: the top-level link is current on the qna board (and on one of its posts), on no other community screen', () => {
    const lit = (path) => withAttr(regions(render(path)).bar, 'aria-current', 'page').map((tag) => attr(tag, 'href'));
    assert.ok(lit('/community?board=qna').includes(QNA));
    assert.ok(lit('/community?board=qna&post=q_1').includes(QNA));
    assert.ok(!lit('/community?board=free').includes(QNA));
    assert.ok(!lit('/community').includes(QNA));
    const link = tagsOf(regions(render('/')).bar, 'a').find((tag) => attr(tag, 'href') === QNA && /site-nav-link/.test(tag));
    assert.ok(link, 'a plain bar link, not inside a dropdown');
    assert.doesNotMatch(link, /site-nav-link-featured/, 'only LEWORD is highlighted');
});

test('current page: Home, .html variants, group-less pages and pages outside the menu', () => {
    const home = regions(render('/index.html')).bar;
    assert.deepEqual(withAttr(home, 'aria-current', 'page').map((tag) => attr(tag, 'href')), ['/']);
    const pricing = regions(render('/pricing.html')).bar;
    assert.deepEqual(withAttr(pricing, 'aria-current', 'page').map((tag) => attr(tag, 'href')), ['/pricing']);
    assert.match(tagsOf(pricing, 'button').find((tag) => /site-nav-trigger/.test(tag) && /aria-controls="site-nav-drop-buy"/.test(tag)), /is-active/);
    const chat = regions(render('/chatbots')).bar;
    assert.equal(tagsOf(chat, 'button').filter((tag) => /is-active/.test(tag)).length, 0, 'plain link pages mark no group');
    const outside = render('/refund');
    assert.equal(withAttr(outside, 'aria-current', 'page').length, 0);
    assert.doesNotMatch(outside, /is-active/);
});

test('dropdowns start closed: aria-expanded=false, panels hidden, every aria-controls points at a real panel', () => {
    const html = render('/');
    const triggers = tagsOf(html, 'button').filter((tag) => /site-nav-trigger/.test(tag));
    assert.equal(triggers.length, 3);
    for (const trigger of triggers) {
        assert.equal(attr(trigger, 'aria-expanded'), 'false');
        const panel = withAttr(html, 'id', attr(trigger, 'aria-controls'));
        assert.equal(panel.length, 1, `${attr(trigger, 'aria-controls')} exists`);
        assert.ok(hasHidden(panel[0]), 'closed panel is hidden');
    }
});

test('an open dropdown shows only its own panel and flips aria-expanded', () => {
    const html = render('/', { forced: { dropdown: 'product', pinned: true } });
    const product = tagsOf(html, 'button').find((tag) => attr(tag, 'aria-controls') === 'site-nav-drop-product');
    const buy = tagsOf(html, 'button').find((tag) => attr(tag, 'aria-controls') === 'site-nav-drop-buy');
    assert.equal(attr(product, 'aria-expanded'), 'true');
    assert.equal(attr(buy, 'aria-expanded'), 'false');
    assert.equal(hasHidden(withAttr(html, 'id', 'site-nav-drop-product')[0]), false);
    assert.equal(hasHidden(withAttr(html, 'id', 'site-nav-drop-buy')[0]), true);
    assert.match(html, /<div[^>]*class="[^"]*\bopen\b[^"]*"[^>]*data-group="product"/);
});

test('phone menu starts closed with a labelled button; open flips label, text and aria-expanded', () => {
    const closed = render('/');
    const burger = tagsOf(closed, 'button').find((tag) => /site-nav-burger/.test(tag));
    assert.equal(attr(burger, 'aria-expanded'), 'false');
    assert.equal(attr(burger, 'aria-label'), '메뉴 열기');
    assert.equal(attr(burger, 'aria-controls'), 'site-nav-sheet');
    assert.ok(hasHidden(regions(closed).sheetTag), 'closed sheet is hidden');
    assert.doesNotMatch(closed, /is-menu-open/);

    const open = render('/', { forced: { mobileOpen: true } });
    const openBurger = tagsOf(open, 'button').find((tag) => /site-nav-burger/.test(tag));
    assert.equal(attr(openBurger, 'aria-expanded'), 'true');
    assert.equal(attr(openBurger, 'aria-label'), '메뉴 닫기');
    assert.match(open, /site-nav-burger[\s\S]*?<b>닫기<\/b>/);
    assert.equal(hasHidden(regions(open).sheetTag), false);
    assert.match(open, /<header[^>]*class="[^"]*is-menu-open/);
});

test('phone sheet order: login + free trial first, then headed groups, every row a plain link (nothing collapsed)', () => {
    const { sheet } = regions(render('/', { forced: { mobileOpen: true } }));
    const login = sheet.indexOf('>로그인<');
    const cta = sheet.indexOf('무료체험 시작');
    const firstItem = sheet.indexOf('site-nav-sheet-item');
    assert.ok(login > 0 && cta > login && firstItem > cta, 'login, free trial, then the list');
    const titles = [...sheet.matchAll(/<p class="site-nav-sheet-group">([^<]*)<\/p>/g)].map((match) => match[1]);
    assert.deepEqual(titles, ['제품', '무료로 쓰기 · 구매', '함께하기', '커뮤니티']);
    const rows = tagsOf(sheet, 'a').filter((tag) => /site-nav-sheet-item/.test(tag)).map((tag) => attr(tag, 'href'));
    assert.deepEqual(rows, ['/', '/leword', '/products', '/download', '/chatbots', '/pricing', '/lookup', '/reviews', QNA, ...BOARD_LINKS]);
    assert.equal(tagsOf(sheet, 'details').length, 0, 'no accordions');
});

test('new-notice badge sits on the Community group (bar button, sheet heading), not on Home', () => {
    const html = render('/', { unseen: 2 });
    const { bar, sheet } = regions(html);
    const onBar = bar.slice(bar.indexOf('aria-controls="site-nav-drop-community"'));
    assert.match(onBar.slice(0, 900), /role="status"[^>]*aria-label="새 소식 2건"/);
    const onSheet = sheet.slice(sheet.indexOf('site-nav-sheet-group">커뮤니티'));
    assert.match(onSheet.slice(0, 700), /role="status"[^>]*aria-label="새 소식 2건"/);
    for (const region of [bar, sheet]) {
        const home = region.slice(region.indexOf('href="/"'), region.indexOf('href="/leword"'));
        assert.doesNotMatch(home, /role="status"/);
    }
    assert.doesNotMatch(render('/', { unseen: 0 }), /role="status"/);
});

test('logged out: login button in bar and sheet, no logout anywhere', () => {
    const html = render('/', { forced: { mobileOpen: true } });
    assert.equal((html.match(/site-nav-login/g) || []).length >= 1, true);
    assert.equal(tagsOf(html, 'button').filter((tag) => /site-nav-sheet-login/.test(tag)).length, 1);
    assert.doesNotMatch(html, /로그아웃/);
    assert.doesNotMatch(html, /site-nav-account/);
});

test('logged in: id replaces the login button, account menu offers LEWORD + logout, sheet shows id + logout', () => {
    const session = { userId: 'leader01', expiresAt: null, licenseType: 'pro', savedAt: '2026-11-07T00:00:00Z' };
    const html = render('/community', { session, forced: { mobileOpen: true } });
    const { bar, sheet } = regions(html);
    assert.doesNotMatch(bar, /site-nav-login/);
    assert.match(bar, /site-nav-account-btn[^>]*>[\s\S]*?leader01/);
    const trigger = tagsOf(bar, 'button').find((tag) => /site-nav-account-btn/.test(tag));
    assert.equal(attr(trigger, 'aria-expanded'), 'false');
    assert.ok(hasHidden(withAttr(bar, 'id', attr(trigger, 'aria-controls'))[0]), 'account menu starts closed');
    assert.match(bar, /로그아웃/);
    assert.ok(hrefs(bar).includes('/leword'));
    assert.match(sheet, /leader01/);
    assert.match(sheet, /<button[^>]*site-nav-sheet-logout[^>]*>로그아웃<\/button>/);
    assert.doesNotMatch(sheet, /site-nav-sheet-login/);
});

test('logged in with only the site (community) login: menu offers community, LEWORD and logout', () => {
    const community = {
        userId: 'member07', role: 'community', nickname: '새싹이', needsNickname: false, canWriteNews: false, score: 3,
        activity: { posts: 0, comments: 0, visits: 0 }, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 100, nextLabel: '잎새' },
        linked: false, communityToken: 'ct_abc', sessionExpiresAt: '2099-01-01T00:00:00.000Z', savedAt: '2026-11-08T00:00:00Z',
    };
    const html = render('/', { community, forced: { mobileOpen: true } });
    const { bar, sheet } = regions(html);
    assert.doesNotMatch(bar, /site-nav-login/);
    assert.match(bar, /site-nav-account-btn[^>]*>[\s\S]*?member07/);
    assert.match(bar, /로그아웃/);
    assert.match(bar, /커뮤니티 회원/, 'a community-only login is named as such, not as a LEWORD plan');
    assert.ok(hrefs(bar).includes('/community'));
    assert.match(sheet, /member07/);
    assert.match(sheet, /<button[^>]*site-nav-sheet-logout[^>]*>로그아웃<\/button>/);
});

test('an expired stored login is treated as logged out', () => {
    const session = { userId: 'leader01', expiresAt: '2020-01-01T00:00:00Z', licenseType: 'pro', savedAt: '2019-01-01T00:00:00Z' };
    const html = render('/', { session });
    assert.doesNotMatch(html, /leader01/);
    assert.match(html, /site-nav-login/);
});

test('no inline blur or other containing-block style is rendered anywhere in the menu', () => {
    const html = render('/', { forced: { mobileOpen: true } });
    assert.doesNotMatch(html, /backdrop-?filter|filter:|transform:|will-change/i);
    assert.doesNotMatch(tagsOf(html, 'header')[0], /\sstyle=/, 'the fixed bar root carries no inline style');
});

// [2026-11-08 사장님] 메뉴 아이콘 8종 — 글자 아이콘('3', '↓', '₩', '?', 'C', '나', 'L', '↩')을 대체. 글자가 옆에 있으니 alt="" + aria-hidden.
test('menu icons: dropdown rows draw the golden square with the icon image, hidden from screen readers, no letter icons left', () => {
    const { bar, sheet } = regions(render('/'));
    const imgs = (html) => tagsOf(html, 'img').filter((tag) => /menu-icons\//.test(attr(tag, 'src') || ''));
    const names = (html) => imgs(html).map((tag) => attr(tag, 'src').split('/').pop());
    assert.deepEqual(names(bar), ['products.svg', 'download.svg', 'trial-purchase.svg', 'order-search.svg']);
    for (const tag of imgs(bar)) assert.equal(attr(tag, 'alt'), '', 'alt is empty: the words sit next to it');
    assert.equal((bar.match(/site-nav-icon" aria-hidden="true"/g) || []).length, 4, 'the square is aria-hidden too');
    assert.doesNotMatch(bar, /site-nav-drop-icon/);
    assert.deepEqual(names(sheet), ['leword.svg', 'products.svg', 'download.svg', 'trial-purchase.svg', 'order-search.svg']);
    assert.equal((sheet.match(/site-nav-icon site-nav-icon-sm/g) || []).length, 5, 'small squares on the phone rows');
    // The six community boards carry no icon: the community panel has no image.
    const panel = bar.slice(bar.indexOf('id="site-nav-drop-community"'));
    assert.doesNotMatch(panel.slice(0, panel.indexOf('</div>')), /<img/);
    for (const kept of ['제품 소개', '세 제품 비교와 요금 한눈에', '무료체험·구매', '요금 보고 바로 시작', '주문 조회', '결제 내역·코드 다시 보기']) assert.match(bar, new RegExp(kept));
});

test('menu icons: the account menu uses community, profile, leword and logout icons; the phone list adds the profile row icon', () => {
    const community = {
        userId: 'member07', role: 'community', nickname: '새싹이', needsNickname: false, canWriteNews: false, score: 3,
        activity: { posts: 0, comments: 0, visits: 0 }, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 100, nextLabel: '잎새' },
        linked: false, communityToken: 'ct_abc', sessionExpiresAt: '2099-01-01T00:00:00.000Z', savedAt: '2026-11-08T00:00:00Z',
    };
    const { bar, sheet } = regions(render('/', { community, forced: { mobileOpen: true } }));
    const account = bar.slice(bar.indexOf('site-nav-drop-account'));
    const used = [...account.matchAll(/menu-icons\/([a-z-]+)\.svg/g)].map((match) => match[1]);
    assert.deepEqual(used, ['community', 'profile', 'leword', 'logout']);
    const inSheet = [...sheet.matchAll(/menu-icons\/([a-z-]+)\.svg/g)].map((match) => match[1]);
    assert.ok(inSheet.includes('profile'), 'the 내 정보 row of the phone list');
    for (const tag of tagsOf(account, 'img')) assert.equal(attr(tag, 'alt'), '');
    assert.match(account, /커뮤니티 가기/);
    assert.match(account, /내 정보/);
    assert.match(account, /LEWORD 열기/);
});
