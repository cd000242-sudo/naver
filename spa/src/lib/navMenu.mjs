import { LOGIN_PATH, SIGNUP_PATH, loginPath } from './siteAuthModel.mjs';

/**
 * Top menu model: destinations, "which item is current" rules, the dropdown / phone-menu state machine
 * and the login-button routing. Pure data and functions so node:test can pin them without a browser.
 *
 * Design 1 (light bar), agreed 2026-11-07: Home · Product ▾ · Free chatbot · Price/Buy ▾ · Reviews · Community.
 */

/** Below this width the bar turns into the [menu] button and the full-height list. */
export const NAV_BREAKPOINT = 1180;

/** Yellow call-to-action on the right of the bar. */
export const NAV_CTA = Object.freeze({ label: '무료체험 시작', shortLabel: '무료체험', to: '/pricing' });

/** The one login window of the whole site (community and LEWORD share it). */
export const NAV_LOGIN_PATH = LOGIN_PATH;

/** Name of the window event the LEWORD page still listens to for opening its old login dialog. */
export const LOGIN_EVENT = 'leword:login';

const link = (key, label, to, extra = {}) => Object.freeze({ type: 'link', key, label, to, ...extra });
const entry = (key, label, to, icon, desc, short) => Object.freeze({ key, label, to, icon, desc, short });

/** Desktop bar. Groups open a dropdown; the notice badge rides on Community. */
export const NAV_ITEMS = Object.freeze([
    link('home', '홈', '/'),
    // [2026-11-07] LEWORD is the most important site — its own highlighted item, not hidden in a dropdown.
    link('leword', 'LEWORD', '/leword', { featured: true }),
    Object.freeze({
        type: 'group', key: 'product', label: '제품', items: Object.freeze([
            entry('products', '제품 소개', '/products', '3', '세 제품 비교와 요금 한눈에', '비교·요금'),
            entry('download', '다운로드', '/download', '↓', 'PC 프로그램 받기', 'PC 프로그램'),
        ]),
    }),
    link('chatbots', '무료 챗봇', '/chatbots'),
    Object.freeze({
        type: 'group', key: 'buy', label: '가격·구매', items: Object.freeze([
            entry('pricing', '무료체험·구매', '/pricing', '₩', '요금 보고 바로 시작'),
            entry('lookup', '주문 조회', '/lookup', '?', '결제 내역·코드 다시 보기'),
        ]),
    }),
    link('reviews', '수익 후기', '/reviews'),
    link('community', '커뮤니티', '/community', { badge: true }),
]);

const row = (key, label, to, small, extra = {}) => Object.freeze({ key, label, to, small, ...extra });

/** Phone list: every row visible at once, grouped under short headings (title null = no heading). */
export const NAV_MOBILE_SECTIONS = Object.freeze([
    Object.freeze({ title: null, items: Object.freeze([
        row('home', '홈', '/'),
        row('leword', 'LEWORD', '/leword', '키워드 찾기', { featured: true }),
    ]) }),
    Object.freeze({
        title: '제품', items: Object.freeze([
            row('products', '제품 소개', '/products', '비교·요금'),
            row('download', '다운로드', '/download', 'PC 프로그램'),
        ]),
    }),
    Object.freeze({
        title: '무료로 쓰기 · 구매', items: Object.freeze([
            row('chatbots', '무료 챗봇', '/chatbots'),
            row('pricing', '무료체험·구매', '/pricing'),
            row('lookup', '주문 조회', '/lookup'),
        ]),
    }),
    Object.freeze({
        title: '함께하기', items: Object.freeze([
            row('reviews', '수익 후기', '/reviews'),
            row('community', '커뮤니티', '/community', undefined, { badge: true }),
        ]),
    }),
]);

/** Every page the desktop bar can reach, in menu order. */
export function navDestinations() {
    return NAV_ITEMS.flatMap((item) => (item.type === 'group' ? item.items.map((child) => child.to) : [item.to]));
}

/** `/pricing.html`, `/pricing/` and `/index.html` are the same pages as `/pricing` and `/`. */
export function normalizeNavPath(pathname) {
    const path = String(pathname || '');
    if (path === '/index.html') return '/';
    return path.replace(/\.html$/, '').replace(/\/$/, '') || '/';
}

/** Exact page match only — `/leword-detail` is not LEWORD, and Home never lights up on other pages. */
export function isNavPathActive(to, pathname) {
    return normalizeNavPath(pathname) === normalizeNavPath(to);
}

/** A dropdown group is "current" when one of the pages inside it is. */
export function isNavGroupActive(item, pathname) {
    return item.type === 'group' && item.items.some((child) => isNavPathActive(child.to, pathname));
}

export const INITIAL_MENU_STATE = Object.freeze({ dropdown: null, pinned: false, mobileOpen: false });

/**
 * One state machine for every popup in the bar so only one thing is open at a time.
 *   dropdown  key of the open dropdown (group key, or 'account'), or null
 *   pinned    opened by click/keyboard (stays until closed); false = only held open by a mouse hover
 *   mobileOpen the phone list
 */
export function menuReducer(state, action) {
    switch (action.type) {
        case 'toggle-dropdown':
            if (state.dropdown === action.key && state.pinned) return { ...state, dropdown: null, pinned: false };
            return { ...state, dropdown: action.key, pinned: true };
        case 'hover-open':
            if (state.dropdown === action.key) return state;
            return { ...state, dropdown: action.key, pinned: false };
        case 'hover-leave':
            if (state.dropdown !== action.key || state.pinned) return state;
            return { ...state, dropdown: null };
        case 'focus-out':
            if (state.dropdown !== action.key) return state;
            return { ...state, dropdown: null, pinned: false };
        case 'outside-click':
            if (!state.dropdown) return state;
            return { ...state, dropdown: null, pinned: false };
        case 'toggle-mobile':
            return { dropdown: null, pinned: false, mobileOpen: !state.mobileOpen };
        case 'close-mobile':
        case 'resize-wide':
            if (!state.mobileOpen) return state;
            return { ...state, mobileOpen: false };
        case 'escape':
        case 'route-change':
        case 'close-all':
            if (!state.dropdown && !state.mobileOpen) return state;
            return INITIAL_MENU_STATE;
        default:
            return state;
    }
}

/**
 * What the [login] button does: go to the one login window, carrying the page the person is on (path + query)
 * so a finished login comes back to it. On the login or signup screen it keeps the return path already there.
 */
export function resolveLoginAction(pathname, search = '') {
    const path = normalizeNavPath(pathname);
    if (path === LOGIN_PATH || path === SIGNUP_PATH) {
        const kept = new URLSearchParams(search).get('next');
        return { kind: 'navigate', to: loginPath(kept) };
    }
    return { kind: 'navigate', to: loginPath(`${pathname}${search}`) };
}
