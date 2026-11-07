// Top menu model (2026-11-07, light bar "design 1"): destinations, active rules, dropdown state machine, login routing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    INITIAL_MENU_STATE, NAV_BREAKPOINT, NAV_CTA, NAV_ITEMS, NAV_LOGIN_PATH, NAV_MOBILE_SECTIONS,
    isNavGroupActive, isNavPathActive, menuReducer, navDestinations, normalizeNavPath, resolveLoginAction,
} from '../src/lib/navMenu.mjs';

// The nine pages the previous flat menu linked to. None may be lost in the regrouping.
const NINE_PAGES = ['/', '/leword', '/products', '/download', '/chatbots', '/pricing', '/lookup', '/reviews', '/community'];

const run = (actions, from = INITIAL_MENU_STATE) => actions.reduce(menuReducer, from);

test('menu keeps all nine pages exactly once, in the agreed grouping and order', () => {
    assert.deepEqual([...navDestinations()].sort(), [...NINE_PAGES].sort());
    assert.equal(new Set(navDestinations()).size, 9, 'no duplicate destinations');
    assert.deepEqual(NAV_ITEMS.map((item) => item.label), ['홈', 'LEWORD', '제품', '무료 챗봇', '가격·구매', '수익 후기', '커뮤니티']);
    const product = NAV_ITEMS.find((item) => item.key === 'product');
    assert.deepEqual(product.items.map((item) => [item.label, item.to]), [['제품 소개', '/products'], ['다운로드', '/download']]);
    const buy = NAV_ITEMS.find((item) => item.key === 'buy');
    assert.deepEqual(buy.items.map((item) => [item.label, item.to]), [['무료체험·구매', '/pricing'], ['주문 조회', '/lookup']]);
    assert.deepEqual(NAV_CTA, { label: '무료체험 시작', shortLabel: '무료체험', to: '/pricing' });
});

// [2026-11-07 사장님] "LEWORD 는 따로 빼 두세요 — 제일 중요한 사이트라서 잘 보여야 합니다."
test('LEWORD is its own top-level, highlighted menu item (not inside 제품)', () => {
    const leword = NAV_ITEMS.find((item) => item.key === 'leword');
    assert.equal(leword.type, 'link');
    assert.equal(leword.to, '/leword');
    assert.equal(leword.featured, true);
    assert.equal(NAV_ITEMS.indexOf(leword), 1, 'right after 홈');
    const firstMobile = NAV_MOBILE_SECTIONS[0].items;
    assert.deepEqual(firstMobile.map((row) => row.to), ['/', '/leword']);
    assert.equal(firstMobile[1].featured, true);
});

test('new-notice badge moved from Home to Community', () => {
    const flagged = NAV_ITEMS.filter((item) => item.badge).map((item) => item.to);
    assert.deepEqual(flagged, ['/community']);
});

test('mobile sheet lists every destination once, under headed groups, nothing collapsed', () => {
    const mobile = NAV_MOBILE_SECTIONS.flatMap((section) => section.items.map((item) => item.to));
    assert.deepEqual([...mobile].sort(), [...NINE_PAGES].sort());
    assert.deepEqual(NAV_MOBILE_SECTIONS.map((section) => section.title), [null, '제품', '무료로 쓰기 · 구매', '함께하기']);
    assert.equal(NAV_MOBILE_SECTIONS.flatMap((section) => section.items).filter((item) => item.badge).length, 1);
});

test('breakpoint where the bar turns into the menu button is 1180px', () => {
    assert.equal(NAV_BREAKPOINT, 1180);
});

test('path normalisation ignores .html, trailing slash and index.html', () => {
    assert.equal(normalizeNavPath('/index.html'), '/');
    assert.equal(normalizeNavPath('/'), '/');
    assert.equal(normalizeNavPath('/pricing.html'), '/pricing');
    assert.equal(normalizeNavPath('/products/'), '/products');
    assert.equal(normalizeNavPath(''), '/');
});

test('active rule: exact page only, Home never matches other pages', () => {
    assert.equal(isNavPathActive('/', '/'), true);
    assert.equal(isNavPathActive('/', '/index.html'), true);
    assert.equal(isNavPathActive('/', '/products'), false);
    assert.equal(isNavPathActive('/products', '/products.html'), true);
    assert.equal(isNavPathActive('/leword', '/leword-detail'), false, 'prefix lookalikes are different pages');
    assert.equal(isNavPathActive('/community', '/community/'), true);
});

test('group is active when a page inside its dropdown is current', () => {
    // LEWORD left the 제품 group (2026-11-07) — look groups up by key, and /leword no longer lights 제품.
    const product = NAV_ITEMS.find((item) => item.key === 'product');
    const buy = NAV_ITEMS.find((item) => item.key === 'buy');
    assert.equal(isNavGroupActive(product, '/products'), true);
    assert.equal(isNavGroupActive(product, '/leword'), false);
    assert.equal(isNavGroupActive(product, '/download.html'), true);
    assert.equal(isNavGroupActive(product, '/pricing'), false);
    assert.equal(isNavGroupActive(buy, '/lookup'), true);
    assert.equal(isNavGroupActive(buy, '/'), false);
    assert.equal(isNavGroupActive(NAV_ITEMS[0], '/'), false, 'plain links are not groups');
});

test('dropdown: click opens, second click closes, another group takes over', () => {
    const opened = run([{ type: 'toggle-dropdown', key: 'product' }]);
    assert.equal(opened.dropdown, 'product');
    assert.equal(run([{ type: 'toggle-dropdown', key: 'product' }], opened).dropdown, null);
    assert.equal(run([{ type: 'toggle-dropdown', key: 'buy' }], opened).dropdown, 'buy');
});

test('dropdown: mouse hover opens and leaving closes, but a click pins it open', () => {
    const hovered = run([{ type: 'hover-open', key: 'product' }]);
    assert.equal(hovered.dropdown, 'product');
    assert.equal(run([{ type: 'hover-leave', key: 'product' }], hovered).dropdown, null);
    // click while hover-opened must keep it open (not toggle it shut under the pointer)
    const pinned = run([{ type: 'toggle-dropdown', key: 'product' }], hovered);
    assert.equal(pinned.dropdown, 'product');
    assert.equal(run([{ type: 'hover-leave', key: 'product' }], pinned).dropdown, 'product', 'pinned stays open when the pointer leaves');
    assert.equal(run([{ type: 'toggle-dropdown', key: 'product' }], pinned).dropdown, null, 'click on a pinned dropdown closes it');
    // hover-leave of a different group must not close this one
    assert.equal(run([{ type: 'hover-leave', key: 'buy' }], hovered).dropdown, 'product');
});

test('dropdown: Esc, outside click, focus leaving and page change all close it', () => {
    const open = run([{ type: 'toggle-dropdown', key: 'buy' }]);
    for (const type of ['escape', 'outside-click', 'route-change', 'close-all']) {
        assert.deepEqual(run([{ type }], open), INITIAL_MENU_STATE, `${type} closes`);
    }
    assert.equal(run([{ type: 'focus-out', key: 'buy' }], open).dropdown, null);
    assert.equal(run([{ type: 'focus-out', key: 'product' }], open).dropdown, 'buy', 'focus leaving another group is ignored');
});

test('dropdown: opening from the keyboard works the same as a click (Enter/Space dispatch click)', () => {
    const state = run([{ type: 'toggle-dropdown', key: 'product' }, { type: 'escape' }, { type: 'toggle-dropdown', key: 'product' }]);
    assert.equal(state.dropdown, 'product');
});

test('mobile menu: button toggles, Esc / page change / widening close, and it never coexists with a dropdown', () => {
    const open = run([{ type: 'toggle-mobile' }]);
    assert.equal(open.mobileOpen, true);
    assert.equal(run([{ type: 'toggle-mobile' }], open).mobileOpen, false);
    for (const type of ['escape', 'route-change', 'resize-wide', 'close-mobile']) {
        assert.equal(run([{ type }], open).mobileOpen, false, `${type} closes the sheet`);
    }
    const withDrop = run([{ type: 'toggle-dropdown', key: 'product' }, { type: 'toggle-mobile' }]);
    assert.equal(withDrop.dropdown, null, 'opening the sheet closes any dropdown');
    assert.equal(withDrop.mobileOpen, true);
});

test('reducer is pure: returns the same object when nothing changes and never mutates input', () => {
    assert.equal(menuReducer(INITIAL_MENU_STATE, { type: 'escape' }), INITIAL_MENU_STATE);
    assert.equal(menuReducer(INITIAL_MENU_STATE, { type: 'outside-click' }), INITIAL_MENU_STATE);
    assert.equal(menuReducer(INITIAL_MENU_STATE, { type: 'unknown' }), INITIAL_MENU_STATE);
    const frozen = Object.freeze({ dropdown: 'product', pinned: true, mobileOpen: false });
    assert.doesNotThrow(() => menuReducer(frozen, { type: 'escape' }));
    assert.equal(frozen.dropdown, 'product');
    assert.ok(Object.isFrozen(INITIAL_MENU_STATE));
});

test('login button: always the one site login window, carrying where the person was so it can come back (2026-11-08)', () => {
    assert.equal(NAV_LOGIN_PATH, '/login');
    assert.deepEqual(resolveLoginAction('/leword', '?tab=picks'), { kind: 'navigate', to: '/login?next=%2Fleword%3Ftab%3Dpicks' });
    assert.deepEqual(resolveLoginAction('/leword.html'), { kind: 'navigate', to: '/login?next=%2Fleword.html' });
    assert.deepEqual(resolveLoginAction('/community', '?board=free'), { kind: 'navigate', to: '/login?next=%2Fcommunity%3Fboard%3Dfree' });
    assert.deepEqual(resolveLoginAction('/'), { kind: 'navigate', to: '/login' }, 'home needs no return path');
});

test('login button on the login or signup screen stays put and keeps the return path it already has', () => {
    assert.deepEqual(resolveLoginAction('/login', '?next=%2Fcommunity'), { kind: 'navigate', to: '/login?next=%2Fcommunity' });
    assert.deepEqual(resolveLoginAction('/signup', '?next=%2Fleword'), { kind: 'navigate', to: '/login?next=%2Fleword' });
    assert.deepEqual(resolveLoginAction('/login'), { kind: 'navigate', to: '/login' });
});
