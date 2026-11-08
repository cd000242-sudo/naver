// Top menu model (2026-11-07, light bar "design 1"): destinations, active rules, dropdown state machine, login routing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    INITIAL_MENU_STATE, NAV_BREAKPOINT, NAV_CTA, NAV_ITEMS, NAV_LOGIN_PATH, NAV_MOBILE_SECTIONS,
    isNavGroupActive, isNavPathActive, menuReducer, navDestinations, normalizeNavPath, resolveLoginAction,
} from '../src/lib/navMenu.mjs';
import { parseCommunityQuery } from '../src/lib/communityModel.mjs';

// The nine pages the previous flat menu linked to. None may be lost in the regrouping.
const NINE_PAGES = ['/', '/leword', '/products', '/download', '/chatbots', '/pricing', '/lookup', '/reviews', '/community'];

const run = (actions, from = INITIAL_MENU_STATE) => actions.reduce(menuReducer, from);

// [2026-11-08 포럼 단계] 내 글 홍보는 두 서브탭(네이버 블로그 · 구글 블로그)으로 드롭다운에서 바로 간다.
const COMMUNITY_BOARDS = ['/community?board=notice', '/community?board=news', '/community?board=request', '/community?board=inquiry', '/community?board=free', '/community?board=promo', '/community?board=promo&platform=google'];
const pagesOf = (list) => [...new Set(list.map((to) => to.split('?')[0]))];

test('menu keeps all nine pages exactly once, in the agreed grouping and order', () => {
    assert.deepEqual(pagesOf(navDestinations()).sort(), [...NINE_PAGES].sort());
    assert.equal(new Set(navDestinations()).size, 8 + COMMUNITY_BOARDS.length, 'no duplicate destinations: eight pages plus the six boards');
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

// [2026-11-08 사장님] 상단 '커뮤니티' 는 드롭다운 — 공지사항 · 최근 소식 · 요청사항 · 문의 · 자유게시판 · 내 글 홍보로 바로 간다.
test('Community is a dropdown of the six boards in board order (the promo board twice: naver, google), each opening ?board=<id>', () => {
    const community = NAV_ITEMS.find((item) => item.key === 'community');
    assert.equal(community.type, 'group');
    assert.deepEqual(community.items.map((item) => [item.label, item.to]), [
        ['공지사항', '/community?board=notice'], ['최근 소식', '/community?board=news'], ['요청사항', '/community?board=request'],
        ['버그 및 오류 신고', '/community?board=inquiry'], ['자유게시판', '/community?board=free'],
        ['내 글 홍보 · 네이버', '/community?board=promo'], ['내 글 홍보 · 구글', '/community?board=promo&platform=google'],
    ]);
    assert.ok(community.items.every((item) => item.desc), 'every row has its one line');
    // The address format is the one the community page itself reads.
    for (const item of community.items) {
        const query = item.to.slice(item.to.indexOf('?'));
        assert.equal(parseCommunityQuery(query).board, new URLSearchParams(query).get('board'));
    }
    assert.equal(parseCommunityQuery('?board=promo&platform=google').platform, 'google');
});

// [2026-11-08 사장님] 메뉴 아이콘 8종(menu-icons-v1): 글자 아이콘 대신. 커뮤니티 게시판 6개는 아이콘 없음.
test('menu icons: the dropdown rows and phone rows name the eight icons; community boards have none; words stay as they were', () => {
    const iconOf = (group, key) => NAV_ITEMS.find((item) => item.key === group).items.find((item) => item.key === key);
    assert.deepEqual(
        [['product', 'products', 'products', '제품 소개'], ['product', 'download', 'download', '다운로드'], ['buy', 'pricing', 'trial-purchase', '무료체험·구매'], ['buy', 'lookup', 'order-search', '주문 조회']]
            .map(([group, key]) => [iconOf(group, key).icon, iconOf(group, key).label]),
        [['products', '제품 소개'], ['download', '다운로드'], ['trial-purchase', '무료체험·구매'], ['order-search', '주문 조회']],
    );
    assert.equal(iconOf('buy', 'pricing').desc, '요금 보고 바로 시작', 'README: names and lines stay as on screen');
    assert.equal(iconOf('buy', 'lookup').desc, '결제 내역·코드 다시 보기');
    assert.equal(iconOf('product', 'products').desc, '세 제품 비교와 요금 한눈에');
    assert.equal(iconOf('product', 'download').desc, 'PC 프로그램 받기');
    for (const child of NAV_ITEMS.find((item) => item.key === 'community').items) assert.equal(child.icon, undefined, child.label);
    const rows = NAV_MOBILE_SECTIONS.flatMap((section) => section.items);
    assert.deepEqual(rows.filter((row) => row.icon).map((row) => [row.key, row.icon]), [
        ['leword', 'leword'], ['products', 'products'], ['download', 'download'], ['pricing', 'trial-purchase'], ['lookup', 'order-search'],
    ]);
});

test('new-notice badge moved from Home to the Community group', () => {
    const flagged = NAV_ITEMS.filter((item) => item.badge).map((item) => item.key);
    assert.deepEqual(flagged, ['community']);
});

test('mobile sheet lists every destination once, under headed groups, nothing collapsed', () => {
    const mobile = NAV_MOBILE_SECTIONS.flatMap((section) => section.items.map((item) => item.to));
    assert.deepEqual(pagesOf(mobile).sort(), [...NINE_PAGES].sort());
    assert.equal(new Set(mobile).size, mobile.length, 'no row twice');
    assert.deepEqual(NAV_MOBILE_SECTIONS.map((section) => section.title), [null, '제품', '무료로 쓰기 · 구매', '함께하기', '커뮤니티']);
    const community = NAV_MOBILE_SECTIONS.find((section) => section.title === '커뮤니티');
    assert.deepEqual(community.items.map((row) => row.to), COMMUNITY_BOARDS, 'seven rows under the community heading: six boards, the promo board as two sub-tabs');
    assert.deepEqual(NAV_MOBILE_SECTIONS.filter((section) => section.badge).map((section) => section.title), ['커뮤니티'], 'the badge rides on the community heading');
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

test('active rule with a query: a board entry is current only on its own board', () => {
    assert.equal(isNavPathActive('/community?board=free', '/community', '?board=free'), true);
    assert.equal(isNavPathActive('/community?board=free', '/community', '?board=free&sort=popular&page=2'), true, 'sort and page do not matter');
    assert.equal(isNavPathActive('/community?board=free', '/community', '?board=news'), false);
    assert.equal(isNavPathActive('/community?board=free', '/community', ''), false, 'all-boards view lights no board');
    assert.equal(isNavPathActive('/community?board=free', '/me', '?board=free'), false);
    // The promo sub-tabs: naver is the page without a platform, google needs it; each lights only itself.
    assert.equal(isNavPathActive('/community?board=promo', '/community', '?board=promo'), true);
    assert.equal(isNavPathActive('/community?board=promo', '/community', '?board=promo&platform=naver'), true);
    assert.equal(isNavPathActive('/community?board=promo', '/community', '?board=promo&platform=google'), false);
    assert.equal(isNavPathActive('/community?board=promo&platform=google', '/community', '?board=promo&platform=google&sort=popular'), true);
    assert.equal(isNavPathActive('/community?board=promo&platform=google', '/community', '?board=promo'), false);
    const community = NAV_ITEMS.find((item) => item.key === 'community');
    assert.equal(isNavGroupActive(community, '/community'), true, 'any community screen lights the group');
    assert.equal(isNavGroupActive(community, '/community/'), true);
    assert.equal(isNavGroupActive(community, '/reviews'), false);
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
