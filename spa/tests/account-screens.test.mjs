// Phone signup, /me and password recovery screens (2026-11-08), rendered from the real components. Effects do not run
// in a static render, so these pin what a visitor sees first; the click-through lives in the browser checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const COMMUNITY_KEY = 'leaderspro.community.session.v1';
const session = (extra = {}) => ({
    userId: 'leader01', role: 'community', nickname: '새싹이', needsNickname: false, canWriteNews: false, isOperator: false, score: 140,
    activity: { posts: 3, comments: 5, visits: 7 }, grade: { key: 'leaf', label: '잎새', min: 100, nextAt: 500, nextLabel: '열매' },
    linked: false, communityToken: 'ct_abc', sessionExpiresAt: '2099-01-01T00:00:00.000Z', savedAt: '2026-11-08T00:00:00Z', ...extra,
});
const detail = (extra = {}) => ({ ...session(), phoneVerified: true, phoneMasked: '010-****-5678', createdAt: '2026-10-01T03:00:00Z', ...extra });

function show(file, path, { community, exportName = 'default', props = {} } = {}) {
    const browser = fakeBrowser();
    if (community) browser.store.set(COMMUNITY_KEY, JSON.stringify(community));
    try {
        const Component = createLoader()(file)[exportName];
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i')) || [])[1];
const words = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const hrefs = (html) => tags(html, 'a').map((tag) => attr(tag, 'href'));

test('signup: account fields first, then the phone block with the agreed promise, the code box and the same submit', () => {
    const html = show('../../src/pages/SignupPage.tsx', '/signup?next=%2Fleword');
    assert.deepEqual(tags(html, 'input').map((tag) => attr(tag, 'autocomplete')),
        ['username', 'new-password', 'new-password', 'nickname', 'tel', 'one-time-code']);
    assert.match(words(html), /휴대폰 번호 하나로 계정 하나만 만들 수 있어요\./);
    assert.match(html, /<button[^>]*>인증번호 받기<\/button>/);
    const code = tags(html, 'input').find((tag) => attr(tag, 'autocomplete') === 'one-time-code');
    assert.deepEqual([attr(code, 'inputmode'), attr(code, 'maxlength')], ['numeric', '6']);
    assert.equal(attr(tags(html, 'input').find((tag) => attr(tag, 'autocomplete') === 'tel'), 'type'), 'tel');
    assert.match(html, /<button[^>]*type="submit"[^>]*>가입하고 시작하기<\/button>/);
    assert.ok(hrefs(html).includes('/login?next=%2Fleword'));
});

test('login: password change opens a two-tab recovery (community / license); ?view=reset starts there', () => {
    const html = show('../../src/pages/LoginPage.tsx', '/login?view=reset');
    assert.match(html, /<h1[^>]*>비밀번호 변경<\/h1>/);
    const tabs = tags(html, 'button').filter((tag) => attr(tag, 'role') === 'tab');
    assert.equal(tabs.length, 2);
    assert.deepEqual(tabs.map((tag) => attr(tag, 'aria-selected')), ['true', 'false']);
    assert.match(words(html), /커뮤니티 회원/);
    assert.match(words(html), /이용권 계정/);
    assert.deepEqual(tags(html, 'input').map((tag) => attr(tag, 'autocomplete')), ['username', 'tel', 'one-time-code', 'new-password', 'new-password']);
    assert.match(html, /<button[^>]*type="submit"[^>]*>비밀번호 바꾸기<\/button>/);
});

test('login: ?view=reset&tab=license starts on the license tab with the LEWORD panel', () => {
    const html = show('../../src/pages/LoginPage.tsx', '/login?view=reset&tab=license');
    const tabs = tags(html, 'button').filter((tag) => attr(tag, 'role') === 'tab');
    assert.deepEqual(tabs.map((tag) => attr(tag, 'aria-selected')), ['false', 'true']);
    assert.match(words(html), /본인인증한 전화번호/);
});

test('login: ?view=phone opens the existing 본인인증 panel (where license and owner accounts are sent)', () => {
    const html = show('../../src/pages/LoginPage.tsx', '/login?view=phone');
    assert.match(html, /<h1[^>]*>본인인증<\/h1>/);
});

test('phone block: when the number is taken the person is offered the login page; license accounts get the 본인인증 panel', () => {
    const loader = createLoader();
    const source = loader('../../src/components/auth/PhoneCodeFields.tsx').default;
    const sender = (kind) => ({ busy: false, sent: false, waitSec: 0, message: { tone: 'error', text: '문장', kind }, request: async () => ({}), reset() {}, hold() {} });
    const render = (kind) => {
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/'] }, createElement(source, {
            phone: '', code: '', onPhone() {}, onCode() {}, sender: sender(kind),
            links: [{ kind: 'taken', to: '/login', label: '로그인하러 가기' }, { kind: 'license', to: '/login?view=phone', label: '본인인증 화면으로' }],
        })));
    };
    assert.ok(hrefs(render('taken')).includes('/login'));
    assert.ok(hrefs(render('license')).includes('/login?view=phone'));
    assert.deepEqual(hrefs(render('code')), []);
});

test('login: the plain login view still shows the id and password and a 비밀번호 변경 button', () => {
    const html = show('../../src/pages/LoginPage.tsx', '/login');
    assert.deepEqual(tags(html, 'input').map((tag) => attr(tag, 'autocomplete')), ['username', 'current-password']);
    assert.match(words(html), /🔑 비밀번호 변경/);
});

test('/me without a login: the "log in first" screen in plain words, coming back to /me', () => {
    const html = show('../../src/components/auth/RequireLogin.tsx', '/me', { props: { area: 'account', children: createElement('p', { id: 'protected' }, '비공개') } });
    assert.doesNotMatch(html, /id="protected"/);
    assert.match(words(html), /내 정보는 로그인한 분만 볼 수 있어요/);
    assert.ok(hrefs(html).includes('/login?next=%2Fme'));
});

test('/me page: title, profile card, my posts, settings and logout, all drawn from the stored login', () => {
    const html = show('../../src/pages/MyPage.tsx', '/me', { community: session() });
    assert.match(html, /<h1[^>]*>내 정보<\/h1>/);
    const text = words(html);
    for (const part of ['새싹이', '잎새', '커뮤니티 회원', '140점', '열매까지 360점', '내 글', '내 댓글', '들른 글', '내가 쓴 글', '비밀번호 바꾸기', '로그아웃']) {
        assert.ok(text.includes(part), `shows ${part}`);
    }
    assert.match(html, /role="progressbar"[^>]*aria-valuenow="10"/);
});

test('profile card: join date, role words for every kind of account, and the phone state', () => {
    const card = (profile, info) => show('../../src/components/account/ProfileCard.tsx', '/me', { props: { profile, detail: info, onChanged() {}, onDetail() {} } });
    const verified = words(card(session(), detail()));
    assert.ok(verified.includes('2026년 10월 1일 가입'));
    assert.ok(verified.includes('인증됨 · 010-****-5678'));
    assert.ok(!verified.includes('지금 인증하기'));
    const open = words(card(session(), detail({ phoneVerified: false, phoneMasked: '' })));
    assert.ok(open.includes('미인증'));
    assert.ok(open.includes('지금 인증하기'));
    assert.ok(words(card(session({ role: 'licensed' }), detail({ role: 'licensed' }))).includes('이용권 회원'));
    assert.ok(words(card(session({ role: 'owner', isOperator: true }), detail())).includes('관리자'));
    assert.ok(words(card(session(), null)).includes('확인하는 중'), 'before the detail arrives');
});

test('profile card: the nickname change is one button away; buttons are 44px+ by class, text 17px+ by the page', () => {
    const html = show('../../src/components/account/ProfileCard.tsx', '/me', { props: { profile: session(), detail: detail(), onChanged() {}, onDetail() {} } });
    assert.match(html, /<button[^>]*>닉네임 바꾸기<\/button>/);
});

test('my posts list: each row opens the post inside the community, with board, date and the answer state', () => {
    const loader = createLoader();
    const posts = ['p_9', 'p_8'].map((id, index) => loader('../../src/lib/communityData.ts').normalizePost({
        id, board: index ? 'inquiry' : 'free', title: `제목 ${id}`, createdAt: '2026-11-07T00:00:00Z', comments: index ? 0 : 4, status: index ? '답변 완료' : '',
    }));
    const html = show('../../src/components/account/MyPostsList.tsx', '/me', {
        exportName: 'MyPostsList', props: { posts, page: 1, totalPages: 3, total: 25, loading: false, error: '', onPage() {}, onRetry() {} },
    });
    assert.ok(hrefs(html).includes('/community?board=free&amp;post=p_9'));
    assert.ok(hrefs(html).includes('/community?board=inquiry&amp;post=p_8'));
    const text = words(html);
    assert.ok(text.includes('자유게시판') && text.includes('버그 및 오류 신고') && text.includes('답변 완료') && text.includes('[4]'));
    assert.match(html, /aria-label="2쪽"/);
});

test('my posts list: empty, loading and error each say one short thing', () => {
    const base = { posts: [], page: 1, totalPages: 1, total: 0, onPage() {}, onRetry() {} };
    const run = (extra) => words(show('../../src/components/account/MyPostsList.tsx', '/me', { exportName: 'MyPostsList', props: { ...base, loading: false, error: '', ...extra } }));
    assert.match(run({}), /아직 쓴 글이 없어요/);
    assert.match(run({ loading: true }), /불러오는 중/);
    assert.match(run({ error: '서버가 붐벼요' }), /서버가 붐벼요/);
});

test('password settings: current + new + confirm, and the notice for a license account points at the login screen tab', () => {
    const form = show('../../src/components/account/PasswordSettings.tsx', '/me');
    assert.deepEqual(tags(form, 'input').map((tag) => attr(tag, 'autocomplete')), ['current-password', 'new-password', 'new-password']);
    assert.match(form, /<button[^>]*type="submit"[^>]*>비밀번호 바꾸기<\/button>/);
    const notice = show('../../src/components/account/PasswordSettings.tsx', '/me', { exportName: 'LicensePasswordNotice' });
    assert.match(words(notice), /이용권 계정은 로그인 화면의 \[비밀번호 변경\]에서 바꿔요/);
    assert.ok(hrefs(notice).includes('/login?view=reset&amp;tab=license'));
});

test('phone verify form for an existing member: number, send button, code box, confirm button', () => {
    const html = show('../../src/components/account/PhoneVerifyForm.tsx', '/me', { props: { onVerified() {}, onCancel() {} } });
    assert.deepEqual(tags(html, 'input').map((tag) => attr(tag, 'autocomplete')), ['tel', 'one-time-code']);
    assert.match(html, /<button[^>]*>인증번호 받기<\/button>/);
    assert.match(html, /<button[^>]*type="submit"[^>]*>인증하기<\/button>/);
});

test('the menu: 내 정보 sits in the account menu and the phone list for a logged-in person, nowhere else', () => {
    const { MemoryRouter } = require('react-router-dom');
    const render = (community) => {
        const browser = fakeBrowser();
        if (community) browser.store.set(COMMUNITY_KEY, JSON.stringify(community));
        try {
            const loader = createLoader();
            const { useNavAccount, NavAccountBar } = loader('../../src/components/NavAccount.tsx');
            const Menu = loader('../../src/components/NavMobileMenu.tsx').default;
            const Probe = () => {
                const account = useNavAccount('/');
                return createElement('div', null,
                    createElement(NavAccountBar, { account, open: false, dispatch() {} }),
                    createElement(Menu, { open: true, pathname: '/', unseenNotices: 0, account, onClose() {} }));
            };
            return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/'] }, createElement(Probe)));
        } finally { restoreBrowser(); }
    };
    const loggedIn = hrefs(render(session()));
    assert.equal(loggedIn.filter((href) => href === '/me').length, 2, 'account menu + phone list');
    assert.ok(!hrefs(render(null)).includes('/me'));
});
