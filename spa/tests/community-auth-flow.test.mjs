// Unified login (2026-11-08): signup / login / logout, the LEWORD hand-over through the community token,
// the community-only wall, license-code registration and the API transport. The server is a script; nothing is live.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, fakeBrowser, restoreBrowser, FAKE_GAS_URL } from './helpers/load-ts.mjs';

const COMMUNITY_KEY = 'leaderspro.community.session.v1';
const LEWORD_KEY = 'leaderspro.leword.session.v2';
const FUTURE = '2099-01-01T00:00:00.000Z';

const grade = { key: 'sprout', label: '새싹', min: 0, nextAt: 100, nextLabel: '잎새' };
const profile = (extra = {}) => ({
    ok: true, userId: 'leader01', role: 'community', nickname: '새싹이', needsNickname: false, canWriteNews: false,
    score: 0, activity: { posts: 0, comments: 0, visits: 0 }, grade, linked: false,
    communityToken: 'ct_abc', sessionExpiresAt: FUTURE, ...extra,
});
const lewordOk = (extra = {}) => ({ ok: true, valid: true, userId: 'leader01', expiresAt: null, licenseType: 'pro', sessionless: true, ...extra });
const notActivated = { ok: false, valid: false, code: 'LICENSE_NOT_ACTIVATED', message: '커뮤니티 회원은 이용권 코드를 등록하면 사용할 수 있습니다.', role: 'community' };

function modules() {
    const load = createLoader();
    return {
        session: load('../../src/lib/communitySession.ts'),
        api: load('../../src/lib/communityApi.ts'),
        auth: load('../../src/lib/communityAuth.ts'),
        leword: load('../../src/lib/lewordAuth.ts'),
    };
}

async function withBrowser(replies, body, raw) {
    const browser = fakeBrowser(replies, raw);
    try { return await body(browser, modules()); } finally { restoreBrowser(); }
}

const lastCall = (browser, action) => [...browser.calls].reverse().find((call) => call.action === action);

test('signup logs the new member in, keeps the token, and never stores the password', async () => {
    await withBrowser({ 'community-signup': profile() }, async (browser, { auth, session }) => {
        browser.listen('community:session-changed');
        const result = await auth.signupCommunity({ userId: 'leader01', password: 'secret-pw-1', nickname: '새싹이' });
        assert.equal(result.ok, true);
        assert.equal(session.loadCommunitySession().communityToken, 'ct_abc');
        assert.equal(session.loadCommunitySession().role, 'community');
        assert.deepEqual(lastCall(browser, 'community-signup').nickname, '새싹이');
        assert.ok(!browser.storedText().includes('secret-pw-1'), 'password is nowhere in the browser');
        assert.deepEqual(browser.events, ['community:session-changed']);
        assert.deepEqual([...new Set(browser.urls)], [FAKE_GAS_URL]);
        assert.deepEqual(browser.actions(), ['community-signup'], 'a community-only member never asks for LEWORD');
    });
});

test('a refused signup says why and stores nothing', async () => {
    const reply = { ok: false, code: 'NICKNAME_TAKEN', error: '이미 사용 중인 닉네임입니다.', message: '이미 사용 중인 닉네임입니다.' };
    await withBrowser({ 'community-signup': reply }, async (browser, { auth }) => {
        const result = await auth.signupCommunity({ userId: 'leader01', password: 'secret-pw-1', nickname: '새싹이' });
        assert.deepEqual([result.ok, result.code, result.message], [false, 'NICKNAME_TAKEN', '이미 쓰는 닉네임이에요.']);
        assert.equal(browser.store.has(COMMUNITY_KEY), false);
    });
});

test('login as a community-only member opens the community but not LEWORD', async () => {
    await withBrowser({ 'community-login': profile() }, async (browser, { auth, session }) => {
        const result = await auth.loginCommunity('leader01', 'pw-123456');
        assert.equal(result.ok, true);
        assert.equal(session.loadCommunitySession().userId, 'leader01');
        assert.equal(browser.store.has(LEWORD_KEY), false);
        assert.deepEqual(browser.actions(), ['community-login']);
        assert.ok(!browser.storedText().includes('pw-123456'));
    });
});

test('login with a license account then asks the server about LEWORD with the token (no password) and keeps the LEWORD session', async () => {
    const replies = {
        'community-login': profile({ role: 'licensed', linked: true }),
        'verify-web-login': lewordOk({ expiresAt: '2099-12-31T00:00:00.000Z' }),
    };
    await withBrowser(replies, async (browser, { auth, leword }) => {
        const result = await auth.loginCommunity('leader01', 'pw-123456');
        assert.equal(result.ok, true);
        const verify = lastCall(browser, 'verify-web-login');
        assert.equal(verify.communityToken, 'ct_abc');
        assert.equal(verify.userPassword, undefined, 'the second call carries no password');
        assert.ok(verify.appId, 'the product (LEWORD) is named');
        const stored = leword.loadSession();
        assert.deepEqual([stored.userId, stored.licenseType, stored.expiresAt], ['leader01', 'pro', '2099-12-31T00:00:00.000Z']);
        assert.ok(!browser.storedText().includes('pw-123456'));
    });
});

test('a license that cannot open LEWORD right now does not stop the community login', async () => {
    const replies = {
        'community-login': profile({ role: 'licensed' }),
        'verify-web-login': { ok: false, valid: false, code: 'LICENSE_EXPIRED', message: '이용 기간이 끝났습니다.' },
    };
    await withBrowser(replies, async (browser, { auth, session }) => {
        const result = await auth.loginCommunity('leader01', 'pw-123456');
        assert.equal(result.ok, true);
        assert.ok(session.loadCommunitySession());
        assert.equal(browser.store.has(LEWORD_KEY), false);
    });
});

test('logging in as another person drops the previous LEWORD login (nobody inherits a paid screen)', async () => {
    const replies = { 'community-login': profile({ userId: 'newbie02' }) };
    await withBrowser(replies, async (browser, { auth, leword }) => {
        browser.store.set(LEWORD_KEY, JSON.stringify({ userId: 'leader01', expiresAt: null, licenseType: 'pro', savedAt: '2026-11-01T00:00:00Z' }));
        assert.equal(leword.loadSession().userId, 'leader01');
        await auth.loginCommunity('newbie02', 'pw-123456');
        assert.equal(leword.loadSession(), null);
    });
});

test('a failed login keeps the previous state and reports the server wording', async () => {
    const reply = { ok: false, code: 'INVALID_CREDENTIALS', message: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    await withBrowser({ 'community-login': reply }, async (browser, { auth }) => {
        const result = await auth.loginCommunity('leader01', 'wrong-pw');
        assert.deepEqual([result.ok, result.code], [false, 'INVALID_CREDENTIALS']);
        assert.equal(browser.store.has(COMMUNITY_KEY), false);
    });
});

test('signOutAll forgets both logins at once, tells the server, and still works if the server does not answer', async () => {
    const replies = { 'community-logout': () => { throw new Error('server down'); }, 'web-logout': { ok: true } };
    await withBrowser(replies, async (browser, { auth, session, leword }) => {
        session.saveCommunitySession(session.toCommunitySession(profile({ role: 'licensed' })));
        browser.store.set(LEWORD_KEY, JSON.stringify({ userId: 'leader01', expiresAt: null, licenseType: 'pro', savedAt: '2026-11-01T00:00:00Z', webSessionToken: 'wt' }));
        await auth.signOutAll();
        assert.equal(session.loadCommunitySession(), null);
        assert.equal(leword.loadSession(), null);
        assert.equal(lastCall(browser, 'community-logout').communityToken, 'ct_abc');
        assert.ok(browser.actions().includes('web-logout'));
    });
});

test('LEWORD entry with no login at all means "log in"', async () => {
    await withBrowser({}, async (browser, { auth }) => {
        assert.deepEqual(await auth.resolveLewordAccess(), { kind: 'login', message: '' });
        assert.deepEqual(browser.calls, []);
    });
});

test('LEWORD entry for a community-only member: the server says not activated, so nothing opens (role on screen is never trusted)', async () => {
    await withBrowser({ 'verify-web-login': notActivated }, async (browser, { auth, session, leword }) => {
        // The screen claims "licensed" (e.g. edited storage); a stale LEWORD login is lying around too.
        session.saveCommunitySession(session.toCommunitySession(profile({ role: 'licensed' })));
        browser.store.set(LEWORD_KEY, JSON.stringify({ userId: 'leader01', expiresAt: null, licenseType: 'pro', savedAt: '2026-11-01T00:00:00Z' }));
        const access = await auth.resolveLewordAccess();
        assert.equal(access.kind, 'not-activated');
        assert.equal(lastCall(browser, 'verify-web-login').communityToken, 'ct_abc');
        assert.equal(leword.loadSession(), null, 'the stale paid login is removed');
        assert.ok(session.loadCommunitySession(), 'but the community login stays');
    });
});

test('LEWORD entry with a dead community token clears it and asks to log in again', async () => {
    const reply = { ok: false, valid: false, code: 'NO_SESSION', message: '로그인이 필요합니다. 다시 로그인해 주세요.' };
    await withBrowser({ 'verify-web-login': reply }, async (browser, { auth, session }) => {
        session.saveCommunitySession(session.toCommunitySession(profile()));
        const access = await auth.resolveLewordAccess();
        assert.equal(access.kind, 'login');
        assert.equal(session.loadCommunitySession(), null);
    });
});

test('LEWORD entry for a licensed member opens, stores the LEWORD login, and is not re-asked for five minutes', async () => {
    await withBrowser({ 'verify-web-login': lewordOk() }, async (browser, { auth, session, leword }) => {
        session.saveCommunitySession(session.toCommunitySession(profile({ role: 'licensed' })));
        const first = await auth.resolveLewordAccess();
        assert.equal(first.kind, 'ok');
        assert.equal(leword.loadSession().userId, 'leader01');
        const second = await auth.resolveLewordAccess();
        assert.equal(second.kind, 'ok');
        assert.equal(browser.actions().filter((action) => action === 'verify-web-login').length, 1, 'cached for the page lifetime');
        auth.forgetLewordVerification();
        await auth.resolveLewordAccess();
        assert.equal(browser.actions().filter((action) => action === 'verify-web-login').length, 2);
    });
});

test('LEWORD entry: expired license is its own answer, and a network failure decides nothing', async () => {
    const expired = { ok: false, valid: false, code: 'LICENSE_EXPIRED', message: '이용 기간이 끝났습니다.' };
    await withBrowser({ 'verify-web-login': expired }, async (browser, { auth, session }) => {
        session.saveCommunitySession(session.toCommunitySession(profile({ role: 'licensed' })));
        const access = await auth.resolveLewordAccess();
        assert.deepEqual([access.kind, access.message], ['expired', '이용 기간이 끝났습니다.']);
    });
    await withBrowser({ 'verify-web-login': () => { throw new Error('offline'); } }, async (browser, { auth, session }) => {
        session.saveCommunitySession(session.toCommunitySession(profile({ role: 'licensed' })));
        browser.store.set(LEWORD_KEY, JSON.stringify({ userId: 'leader01', expiresAt: null, licenseType: 'pro', savedAt: '2026-11-01T00:00:00Z' }));
        const access = await auth.resolveLewordAccess();
        assert.equal(access.kind, 'error');
        assert.ok(session.loadCommunitySession(), 'a flaky connection does not log anyone out');
        assert.ok(browser.store.has(LEWORD_KEY));
    });
});

test('a LEWORD login made before this change (no community token) still opens LEWORD without a server call', async () => {
    await withBrowser({}, async (browser, { auth }) => {
        browser.store.set(LEWORD_KEY, JSON.stringify({ userId: 'old01', expiresAt: null, licenseType: 'pro', savedAt: '2026-11-01T00:00:00Z' }));
        const access = await auth.resolveLewordAccess();
        assert.equal(access.kind, 'ok');
        assert.deepEqual(browser.calls, []);
    });
});

test('registering a code of another product is refused with the app name, and nothing changes', async () => {
    const reply = { ok: false, valid: false, code: 'CODE_REGISTER_IN_APP', message: '이 코드는 네이버 자동화 앱에서 등록해 주세요.', product: 'NAVER', productName: '네이버 자동화' };
    await withBrowser({ 'community-register-code': reply }, async (browser, { auth, session }) => {
        session.saveCommunitySession(session.toCommunitySession(profile()));
        const result = await auth.registerLicenseCode('AAAA-BBBB', 'pw-123456');
        assert.deepEqual([result.ok, result.code, result.productName], [false, 'CODE_REGISTER_IN_APP', '네이버 자동화']);
        assert.equal(result.message, '이 코드는 네이버 자동화 앱에서 등록해 주세요');
        assert.equal(session.loadCommunitySession().role, 'community');
        assert.ok(!browser.storedText().includes('pw-123456'));
    });
});

test('registering a LEWORD code upgrades the same account and opens LEWORD right away', async () => {
    const replies = {
        'community-register-code': { ok: true, valid: true, role: 'licensed' },
        'community-session': profile({ role: 'licensed', linked: true }),
        'verify-web-login': lewordOk(),
    };
    await withBrowser(replies, async (browser, { auth, session, leword }) => {
        session.saveCommunitySession(session.toCommunitySession(profile()));
        const result = await auth.registerLicenseCode('  LEWORD-1234  ', 'pw-123456');
        assert.deepEqual([result.ok, result.lewordOpen], [true, true]);
        const sent = lastCall(browser, 'community-register-code');
        assert.deepEqual([sent.communityToken, sent.licenseCode, sent.password], ['ct_abc', 'LEWORD-1234', 'pw-123456']);
        assert.equal(session.loadCommunitySession().role, 'licensed');
        assert.equal(leword.loadSession().userId, 'leader01');
        assert.ok(!browser.storedText().includes('pw-123456'));
    });
});

test('a wrong password while registering a code is reported, not swallowed', async () => {
    const reply = { ok: false, valid: false, code: 'INVALID_CREDENTIALS', message: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    await withBrowser({ 'community-register-code': reply }, async (browser, { auth, session }) => {
        session.saveCommunitySession(session.toCommunitySession(profile()));
        const result = await auth.registerLicenseCode('LEWORD-1234', 'nope');
        assert.deepEqual([result.ok, result.message], [false, '아이디 또는 비밀번호가 올바르지 않습니다.']);
    });
});

test('setting a nickname refreshes the stored profile', async () => {
    const replies = { 'community-set-nickname': profile({ nickname: '바뀐이름', needsNickname: false }) };
    await withBrowser(replies, async (browser, { auth, session }) => {
        session.saveCommunitySession(session.toCommunitySession(profile({ nickname: '', needsNickname: true })));
        const result = await auth.setCommunityNickname('바뀐이름');
        assert.equal(result.ok, true);
        assert.equal(session.loadCommunitySession().nickname, '바뀐이름');
        assert.equal(session.loadCommunitySession().communityToken, 'ct_abc', 'the token survives the profile refresh');
        assert.equal(lastCall(browser, 'community-set-nickname').communityToken, 'ct_abc');
    });
});

test('hostile server values are turned into plain text and a known role', async () => {
    await withBrowser({}, async (browser, { session }) => {
        const made = session.toCommunitySession({
            ok: true, userId: '<b>x</b>', role: 'superadmin', nickname: { evil: true }, needsNickname: 'yes', canWriteNews: 'true',
            score: '12', activity: null, grade: { key: 5, label: '<i>새싹</i>', min: 'a' }, communityToken: 'ct', sessionExpiresAt: FUTURE,
        });
        assert.equal(made.role, 'community');
        assert.equal(made.canWriteNews, false, 'only a real boolean true grants the operator button');
        assert.equal(typeof made.nickname, 'string');
        assert.equal(made.score, 12);
        assert.deepEqual(made.activity, { posts: 0, comments: 0, visits: 0, likes: null }, 'likes stays null until the server sends it');
        assert.equal(typeof made.grade.label, 'string');
        assert.equal(session.toCommunitySession({ ok: true, userId: 'a' }), null, 'no token, no session');
    });
});

test('an expired community login is dropped on read', async () => {
    await withBrowser({}, async (browser, { session }) => {
        browser.store.set(COMMUNITY_KEY, JSON.stringify({ ...profile(), sessionExpiresAt: '2020-01-01T00:00:00.000Z', savedAt: '2019-01-01T00:00:00Z' }));
        assert.equal(session.loadCommunitySession(), null);
        assert.equal(browser.store.has(COMMUNITY_KEY), false);
    });
});

test('API: no login means no request; a page with HTML or a dropped connection gets plain words', async () => {
    await withBrowser({}, async (browser, { api }) => {
        const none = await api.boardApi.posts({ board: 'free', sort: 'latest', page: 1 });
        assert.deepEqual([none.ok, none.code], [false, 'LOGIN_REQUIRED']);
        assert.deepEqual(browser.calls, []);
    });
    await withBrowser({}, async (browser, { api }) => {
        const result = await api.callCommunity('community-boards');
        assert.deepEqual([result.ok, result.code], [false, 'BUSY']);
        assert.match(result.message, /붐빕니다/);
    }, { 'community-boards': '<html>quota</html>' });
    await withBrowser({ 'community-boards': () => { throw new Error('offline'); } }, async (browser, { api }) => {
        const result = await api.callCommunity('community-boards');
        assert.deepEqual([result.ok, result.code], [false, 'NETWORK']);
    });
});

test('API: a reply that says the session is gone makes the browser forget the token', async () => {
    const reply = { ok: false, code: 'SESSION_INVALID', message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' };
    await withBrowser({ 'community-posts': reply }, async (browser, { api, session }) => {
        session.saveCommunitySession(session.toCommunitySession(profile()));
        const result = await api.boardApi.posts({ board: 'free', sort: 'latest', page: 1 });
        assert.equal(result.code, 'SESSION_INVALID');
        assert.equal(session.loadCommunitySession(), null);
        assert.equal(lastCall(browser, 'community-posts').communityToken, 'ct_abc');
    });
});

test('API: writes carry the token and a request id, the promo visit counts toward the score', async () => {
    const replies = { 'community-post-write': { ok: true, post: { id: 'p_1' } }, 'post-visit': { success: true } };
    await withBrowser(replies, async (browser, { api, session }) => {
        session.saveCommunitySession(session.toCommunitySession(profile()));
        await api.boardApi.writePost({ board: 'free', title: '제목', body: '본문' });
        const write = lastCall(browser, 'community-post-write');
        assert.deepEqual([write.communityToken, write.board, write.title], ['ct_abc', 'free', '제목']);
        assert.match(write.requestId, /^[A-Za-z0-9_-]{8,64}$/, 'matches what the server accepts');
        await api.boardApi.visitPromo('https://blog.naver.com/a/1');
        const visit = lastCall(browser, 'post-visit');
        assert.deepEqual([visit.url, visit.communityToken], ['https://blog.naver.com/a/1', 'ct_abc']);
    });
});

test('API: a promo visit that the server scores keeps the login; a SESSION_INVALID score reason drops it', async () => {
    const scored = { success: true, counted: true, scored: true, memberVisits: 4 };
    await withBrowser({ 'post-visit': scored }, async (browser, { api, session }) => {
        session.saveCommunitySession(session.toCommunitySession(profile()));
        const result = await api.boardApi.visitPromo('https://blog.naver.com/a/1');
        assert.deepEqual([result.ok, result.scored, result.memberVisits], [true, true, 4]);
        assert.ok(session.loadCommunitySession());
    });
    const dead = { success: true, counted: true, scored: false, scoreReason: 'SESSION_INVALID' };
    await withBrowser({ 'post-visit': dead }, async (browser, { api, session }) => {
        session.saveCommunitySession(session.toCommunitySession(profile()));
        const result = await api.boardApi.visitPromo('https://blog.naver.com/a/1');
        assert.equal(result.scoreReason, 'SESSION_INVALID');
        assert.equal(session.loadCommunitySession(), null, 'a token the server does not know is forgotten');
    });
    const own = { success: true, counted: false, scored: false, scoreReason: 'ALREADY_VISITED_TODAY' };
    await withBrowser({ 'post-visit': own }, async (browser, { api, session }) => {
        session.saveCommunitySession(session.toCommunitySession(profile()));
        const result = await api.boardApi.visitPromo('https://blog.naver.com/a/1');
        assert.equal(result.scoreReason, 'ALREADY_VISITED_TODAY');
        assert.ok(session.loadCommunitySession(), 'other reasons are not a logout');
    });
});
