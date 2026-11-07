// Login, signup and the protected-route screens (2026-11-08), rendered from the real components.
// Effects do not run in a static render, so these pin what a visitor sees first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const COMMUNITY_KEY = 'leaderspro.community.session.v1';
const LEWORD_KEY = 'leaderspro.leword.session.v2';

const communitySession = (extra = {}) => ({
    userId: 'leader01', role: 'community', nickname: '새싹이', needsNickname: false, canWriteNews: false, score: 0,
    activity: { posts: 0, comments: 0, visits: 0 }, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 100, nextLabel: '잎새' },
    linked: false, communityToken: 'ct_abc', sessionExpiresAt: '2099-01-01T00:00:00.000Z', savedAt: '2026-11-08T00:00:00Z', ...extra,
});
const lewordSession = { userId: 'leader01', expiresAt: null, licenseType: 'pro', savedAt: '2026-11-01T00:00:00Z' };

/** Render `file`'s default export (or `exportName`) at `path`, with the given stored logins. */
function show(file, path, { community, leword, exportName = 'default', props = {}, children } = {}) {
    const browser = fakeBrowser();
    if (community) browser.store.set(COMMUNITY_KEY, JSON.stringify(community));
    if (leword) browser.store.set(LEWORD_KEY, JSON.stringify(leword));
    try {
        const Component = createLoader()(file)[exportName];
        const { MemoryRouter } = require('react-router-dom');
        const child = children ? createElement('p', { id: 'protected' }, children) : undefined;
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props, child)));
    } finally {
        restoreBrowser();
    }
}

const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);
// React writes camelCase names (autoComplete), so names are matched case-insensitively.
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i')) || [])[1];
const hrefs = (html) => tags(html, 'a').map((tag) => attr(tag, 'href'));

test('login screen: id and password fields, a return path kept on the signup link, no stored values', () => {
    const html = show('../../src/pages/LoginPage.tsx', '/login?next=%2Fcommunity%3Fboard%3Dfree');
    const inputs = tags(html, 'input');
    assert.deepEqual(inputs.map((tag) => attr(tag, 'autocomplete')), ['username', 'current-password']);
    assert.equal(attr(inputs[1], 'type'), 'password');
    assert.ok(inputs.every((tag) => !/\svalue="[^"]+"/.test(tag)), 'nothing is pre-filled');
    assert.match(html, /<button[^>]*type="submit"[^>]*>로그인<\/button>/);
    assert.ok(hrefs(html).includes('/signup?next=%2Fcommunity%3Fboard%3Dfree'), 'signup keeps the return path');
    assert.match(html, /<h1[^>]*>로그인<\/h1>/);
});

test('login screen ignores an outside return path', () => {
    const html = show('../../src/pages/LoginPage.tsx', '/login?next=https%3A%2F%2Fevil.example');
    assert.ok(hrefs(html).includes('/signup'));
    assert.ok(!html.includes('evil.example'));
});

test('signup screen: four fields, the short promise about LEWORD, and a way back to login', () => {
    const html = show('../../src/pages/SignupPage.tsx', '/signup?next=%2Fleword');
    assert.deepEqual(tags(html, 'input').map((tag) => attr(tag, 'autocomplete')), ['username', 'new-password', 'new-password', 'nickname']);
    assert.match(html.replace(/<[^>]+>/g, ''), /가입하면 커뮤니티를 쓸 수 있어요\. LEWORD 등 제품은 이용권이 있어야 해요/);
    assert.ok(hrefs(html).includes('/login?next=%2Fleword'));
    assert.match(html, /<button[^>]*type="submit"[^>]*>가입하고 시작하기<\/button>/);
});

test('community without a login: guidance with login and signup buttons that return to the same page; the page itself is not rendered', () => {
    const html = show('../../src/components/auth/RequireLogin.tsx', '/community?board=free', { props: { area: 'community' }, children: 'SECRET-BOARD' });
    assert.match(html, /로그인이 필요해요/);
    assert.match(html, /커뮤니티/);
    assert.ok(!html.includes('SECRET-BOARD'));
    assert.ok(hrefs(html).includes('/login?next=%2Fcommunity%3Fboard%3Dfree'));
    assert.ok(hrefs(html).includes('/signup?next=%2Fcommunity%3Fboard%3Dfree'));
});

test('community with a login shows the page', () => {
    const html = show('../../src/components/auth/RequireLogin.tsx', '/community', { community: communitySession(), props: { area: 'community' }, children: 'THE-BOARD' });
    assert.match(html, /THE-BOARD/);
    assert.doesNotMatch(html, /로그인이 필요해요/);
});

test('an old LEWORD-only login is not enough for the community: it asks for one more login and says why', () => {
    const html = show('../../src/components/auth/RequireLogin.tsx', '/community', { leword: lewordSession, props: { area: 'community' }, children: 'SECRET-BOARD' });
    assert.ok(!html.includes('SECRET-BOARD'));
    assert.match(html, /한 번 더 로그인/);
});

test('LEWORD without any login: the login guidance, never the LEWORD page', () => {
    const html = show('../../src/components/auth/LewordGate.tsx', '/leword?tab=picks', { children: 'LEWORD-CONSOLE' });
    assert.match(html, /로그인이 필요해요/);
    assert.match(html, /LEWORD/);
    assert.ok(!html.includes('LEWORD-CONSOLE'));
    assert.ok(hrefs(html).includes('/login?next=%2Fleword%3Ftab%3Dpicks'));
});

test('LEWORD with a community login waits for the server before showing anything paid', () => {
    const html = show('../../src/components/auth/LewordGate.tsx', '/leword', { community: communitySession({ role: 'licensed' }), children: 'LEWORD-CONSOLE' });
    assert.ok(!html.includes('LEWORD-CONSOLE'), 'role on screen is not trusted');
    assert.match(html, /확인하고 있어요/);
});

test('LEWORD view for a community-only member: needs a license, buy button to /pricing, the agreed notice, code and password fields', () => {
    const html = show('../../src/components/auth/LewordGate.tsx', '/leword', {
        exportName: 'LewordGateView',
        props: { access: { kind: 'not-activated', message: '' }, onRetry() {}, onOpened() {}, next: '/leword' },
    });
    const text = html.replace(/<[^>]+>/g, '');
    assert.match(text, /LEWORD 는 이용권이 필요합니다/);
    const buy = tags(html, 'a').find((tag) => attr(tag, 'href') === '/pricing');
    assert.ok(buy, 'buy button links to /pricing');
    assert.match(html, /구매하기/);
    assert.match(text, /사이트에서는 올인원·LEWORD 코드만 등록할 수 있어요\. 네이버 자동화·Orbit 등 다른 제품 코드는 그 앱에서 등록해 주세요\./);
    assert.equal((html.match(/<strong>/g) || []).length, 2, 'the two phrases are emphasised');
    assert.deepEqual(tags(html, 'input').map((tag) => attr(tag, 'type')), ['text', 'password']);
    assert.match(html, /<button[^>]*type="submit"[^>]*>코드 등록하기<\/button>/);
});

test('LEWORD view for an expired license talks about renewing, with the same registration form', () => {
    const html = show('../../src/components/auth/LewordGate.tsx', '/leword', {
        exportName: 'LewordGateView',
        props: { access: { kind: 'expired', message: '이용 기간이 끝났습니다.' }, onRetry() {}, onOpened() {}, next: '/leword' },
    });
    const text = html.replace(/<[^>]+>/g, '');
    assert.match(text, /이용 기간이 끝났어요/);
    assert.match(text, /이용 기간이 끝났습니다\./);
    assert.equal(tags(html, 'input').length, 2);
});

test('LEWORD view when the server could not be reached offers a retry and opens nothing', () => {
    const html = show('../../src/components/auth/LewordGate.tsx', '/leword', {
        exportName: 'LewordGateView',
        props: { access: { kind: 'error', message: '연결에 실패했습니다.' }, onRetry() {}, onOpened() {}, next: '/leword' },
    });
    assert.match(html, /연결에 실패했습니다\./);
    assert.match(html, />다시 확인하기</);
    assert.equal(tags(html, 'input').length, 0);
});

test('server text in the gate is drawn as text, not markup', () => {
    const html = show('../../src/components/auth/LewordGate.tsx', '/leword', {
        exportName: 'LewordGateView',
        props: { access: { kind: 'error', message: '<img src=x onerror=alert(1)>' }, onRetry() {}, onOpened() {}, next: '/leword' },
    });
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img'));
});
