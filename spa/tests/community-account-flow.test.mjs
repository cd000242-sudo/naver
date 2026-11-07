// Profile page flows (2026-11-08): profile detail, my posts, password change, password reset by phone, phone
// verification for an existing member. The server is a script; nothing is live.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const FUTURE = '2099-01-01T00:00:00.000Z';
const grade = { key: 'leaf', label: '잎새', min: 100, nextAt: 500, nextLabel: '열매' };
const detail = (extra = {}) => ({
    ok: true, userId: 'leader01', role: 'community', nickname: '새싹이', needsNickname: false, canWriteNews: false,
    score: 140, activity: { posts: 3, comments: 5, visits: 7 }, grade, linked: false,
    phoneVerified: true, phoneMasked: '010-****-5678', createdAt: '2026-10-01T03:00:00Z', isOperator: false, ...extra,
});
const stored = (extra = {}) => ({ ...detail(), communityToken: 'ct_abc', sessionExpiresAt: FUTURE, ...extra });
const fail = (code, extra = {}) => ({ ok: false, code, message: `server:${code}`, ...extra });

async function withBrowser(replies, body) {
    const browser = fakeBrowser(replies);
    try {
        const load = createLoader();
        const modules = {
            account: load('../../src/lib/communityAccount.ts'),
            session: load('../../src/lib/communitySession.ts'),
            data: load('../../src/lib/communityData.ts'),
        };
        modules.session.saveCommunitySession(modules.session.toCommunitySession(stored()));
        browser.calls.length = 0;
        return await body(browser, modules);
    } finally { restoreBrowser(); }
}
const lastCall = (browser, action) => [...browser.calls].reverse().find((call) => call.action === action);

test('profile detail: phone state, join date and role come back; the stored login follows the new score', async () => {
    const replies = { 'community-profile': detail({ score: 520, grade: { key: 'fruit', label: '열매', min: 500, nextAt: 1500, nextLabel: '나무' }, role: 'owner', isOperator: true }) };
    await withBrowser(replies, async (browser, { account, session }) => {
        const result = await account.fetchProfileDetail();
        assert.equal(result.ok, true);
        assert.deepEqual([result.detail.phoneVerified, result.detail.phoneMasked, result.detail.createdAt], [true, '010-****-5678', '2026-10-01T03:00:00Z']);
        assert.deepEqual([result.detail.role, result.detail.isOperator], ['owner', true]);
        assert.equal(lastCall(browser, 'community-profile').communityToken, 'ct_abc');
        const kept = session.loadCommunitySession();
        assert.deepEqual([kept.score, kept.grade.label, kept.communityToken, kept.isOperator], [520, '열매', 'ct_abc', true]);
        assert.ok(!browser.storedText().includes('010-****-5678'), 'the phone is not kept in the browser');
    });
});

test('profile detail with a dead token logs the browser out', async () => {
    await withBrowser({ 'community-profile': fail('SESSION_INVALID') }, async (_browser, { account, session }) => {
        const result = await account.fetchProfileDetail();
        assert.deepEqual([result.ok, result.code], [false, 'SESSION_INVALID']);
        assert.equal(session.loadCommunitySession(), null);
    });
});

test('profile detail coerces odd values: no phone state means "not verified"', async () => {
    await withBrowser({ 'community-profile': { ok: true, userId: 'leader01', phoneVerified: 'yes', phoneMasked: 12345, createdAt: { x: 1 } } }, async (_browser, { account }) => {
        const result = await account.fetchProfileDetail();
        assert.deepEqual([result.detail.phoneVerified, result.detail.phoneMasked, result.detail.createdAt], [false, '', '']);
    });
});

test('my posts: asks for a page, returns normalized posts and paging', async () => {
    const reply = { ok: true, page: 2, totalPages: 3, total: 25, posts: [{ id: 'p_9', board: 'free', title: '내 글', status: '', createdAt: '2026-11-01T00:00:00Z', comments: 2 }, { nope: true }] };
    await withBrowser({ 'community-my-posts': reply }, async (browser, { account }) => {
        const result = await account.listMyPosts(2, 10);
        const call = lastCall(browser, 'community-my-posts');
        assert.deepEqual([call.page, call.pageSize, call.communityToken], [2, 10, 'ct_abc']);
        assert.deepEqual([result.ok, result.page, result.totalPages, result.total], [true, 2, 3, 25]);
        assert.deepEqual(result.posts.map((post) => [post.id, post.title, post.comments]), [['p_9', '내 글', 2]]);
    });
});

test('my posts: a refusal keeps the sentence; an empty list is fine', async () => {
    await withBrowser({ 'community-my-posts': fail('BUSY') }, async (_browser, { account }) => {
        const bad = await account.listMyPosts(1);
        assert.deepEqual([bad.ok, bad.message], [false, 'server:BUSY']);
    });
    await withBrowser({ 'community-my-posts': { ok: true } }, async (_browser, { account }) => {
        const empty = await account.listMyPosts(1);
        assert.deepEqual([empty.ok, empty.posts, empty.totalPages, empty.total], [true, [], 1, 0]);
    });
});

test('password change: sends both passwords with the token and keeps neither', async () => {
    await withBrowser({ 'community-change-password': { ok: true } }, async (browser, { account }) => {
        const result = await account.changeMyPassword({ currentPassword: 'old-secret-1', newPassword: 'new-secret-2' });
        assert.deepEqual(result, { ok: true });
        const call = lastCall(browser, 'community-change-password');
        assert.deepEqual([call.currentPassword, call.newPassword, call.communityToken], ['old-secret-1', 'new-secret-2', 'ct_abc']);
        assert.ok(!browser.storedText().includes('old-secret-1') && !browser.storedText().includes('new-secret-2'));
    });
});

test('password change refusals: wrong current, weak new, and a license account is pointed to the login screen', async () => {
    for (const [code, message, license] of [
        ['INVALID_CREDENTIALS', '지금 비밀번호가 맞지 않아요.', false],
        ['INVALID_CURRENT_PASSWORD', '지금 비밀번호가 맞지 않아요.', false],
        ['TOO_MANY_ATTEMPTS', '여러 번 틀렸어요. 잠시 뒤에 다시 해 주세요.', false],
        ['INVALID_PASSWORD', '새 비밀번호는 6자 이상 입력해 주세요.', false],
        ['USE_LICENSE_RESET', '이용권 계정은 로그인 화면의 [비밀번호 변경]에서 바꿔요.', true],
    ]) {
        await withBrowser({ 'community-change-password': fail(code) }, async (_browser, { account }) => {
            const result = await account.changeMyPassword({ currentPassword: 'a', newPassword: 'b' });
            assert.deepEqual([result.ok, result.code, result.message, result.license], [false, code, message, license], code);
        });
    }
});

test('password reset by phone: the same answer whether the id exists or not, then the confirm call', async () => {
    const replies = {
        'community-reset-send-code': { ok: true, resendAfterSec: 60 },
        'community-reset-confirm': (body) => (body.code === '123456' ? { ok: true } : fail('PHONE_CODE_INVALID')),
    };
    await withBrowser(replies, async (browser, { account }) => {
        const sent = await account.sendResetCode({ userId: ' leader01 ', phone: '010-1234-5678' });
        assert.deepEqual(sent, { ok: true, resendAfterSec: 60 });
        const send = lastCall(browser, 'community-reset-send-code');
        assert.deepEqual([send.userId, send.phone, send.communityToken], ['leader01', '01012345678', undefined]);
        const wrong = await account.confirmReset({ userId: 'leader01', phone: '010-1234-5678', code: '000000', newPassword: 'new-secret-2' });
        assert.deepEqual([wrong.ok, wrong.kind], [false, 'code']);
        const right = await account.confirmReset({ userId: 'leader01', phone: '010-1234-5678', code: '123456', newPassword: 'new-secret-2' });
        assert.deepEqual(right, { ok: true });
        const confirm = lastCall(browser, 'community-reset-confirm');
        assert.deepEqual([confirm.userId, confirm.phone, confirm.code, confirm.newPassword], ['leader01', '01012345678', '123456', 'new-secret-2']);
        assert.ok(!browser.storedText().includes('new-secret-2'));
    });
});

test('password reset refusals: expired code, weak password, and the license-account redirect', async () => {
    for (const [code, kind] of [['PHONE_CODE_EXPIRED', 'expired'], ['INVALID_PASSWORD', 'password'], ['USE_LICENSE_RESET', 'license']]) {
        await withBrowser({ 'community-reset-confirm': fail(code) }, async (_browser, { account }) => {
            const result = await account.confirmReset({ userId: 'leader01', phone: '01012345678', code: '123456', newPassword: 'x' });
            assert.deepEqual([result.ok, result.kind], [false, kind], code);
        });
    }
});

test('reset needs a valid number and an id before it calls anything', async () => {
    await withBrowser({}, async (browser, { account }) => {
        assert.equal((await account.sendResetCode({ userId: '', phone: '01012345678' })).ok, false);
        assert.equal((await account.sendResetCode({ userId: 'leader01', phone: '12' })).code, 'PHONE_INVALID');
        assert.deepEqual(browser.calls, []);
    });
});

test('phone verification for an existing member: code with the token, then the confirmed profile', async () => {
    const replies = {
        'community-verify-phone-send': { ok: true, expiresInSec: 180, resendAfterSec: 60 },
        'community-verify-phone-confirm': detail({ phoneVerified: true, phoneMasked: '010-****-9999' }),
    };
    await withBrowser(replies, async (browser, { account }) => {
        const sent = await account.sendVerifyCode('010-9999-9999');
        assert.deepEqual([sent.ok, sent.resendAfterSec], [true, 60]);
        assert.deepEqual([lastCall(browser, 'community-verify-phone-send').phone, lastCall(browser, 'community-verify-phone-send').communityToken], ['01099999999', 'ct_abc']);
        const done = await account.confirmVerifyPhone('010-9999-9999', '123456');
        assert.deepEqual([done.ok, done.detail.phoneVerified, done.detail.phoneMasked], [true, true, '010-****-9999']);
        const confirm = lastCall(browser, 'community-verify-phone-confirm');
        assert.deepEqual([confirm.phone, confirm.code], ['01099999999', '123456']);
        assert.ok(!browser.storedText().includes('9999'), 'no part of the number is kept');
    });
});

test('phone verification: already verified, and license / owner accounts are sent to the login screen panel', async () => {
    const replies = { 'community-verify-phone-send': fail('PHONE_ALREADY_VERIFIED'), 'community-verify-phone-confirm': fail('USE_LICENSE_PHONE') };
    await withBrowser(replies, async (_browser, { account }) => {
        const sent = await account.sendVerifyCode('01099999999');
        assert.deepEqual([sent.ok, sent.kind], [false, 'already']);
        const confirmed = await account.confirmVerifyPhone('01099999999', '123456');
        assert.deepEqual([confirmed.ok, confirmed.kind], [false, 'license']);
    });
});

test('a wrong code says how many tries are left, and the fifth miss is a ten-minute wait', async () => {
    const replies = { 'community-verify-phone-confirm': (body) => (body.code === '555555' ? fail('TOO_MANY', { retryAfterSec: 600 }) : fail('PHONE_CODE_INVALID', { triesLeft: 3 })) };
    await withBrowser(replies, async (_browser, { account }) => {
        const wrong = await account.confirmVerifyPhone('01099999999', '000000');
        assert.match(wrong.message, /남은 횟수 3번/);
        const locked = await account.confirmVerifyPhone('01099999999', '555555');
        assert.deepEqual([locked.kind, locked.retryAfterSec], ['wait', 600]);
        assert.match(locked.message, /10분 뒤에 다시/);
    });
});

test('phone verification: a number used by another account and a wrong code both say so', async () => {
    await withBrowser({ 'community-verify-phone-send': fail('PHONE_TAKEN'), 'community-verify-phone-confirm': fail('PHONE_CODE_INVALID') }, async (_browser, { account }) => {
        assert.equal((await account.sendVerifyCode('01099999999')).kind, 'taken');
        const wrong = await account.confirmVerifyPhone('01099999999', '000000');
        assert.deepEqual([wrong.ok, wrong.kind], [false, 'code']);
    });
});

test('without a login none of the member calls reach the server', async () => {
    const browser = fakeBrowser({});
    try {
        const load = createLoader();
        const account = load('../../src/lib/communityAccount.ts');
        for (const run of [() => account.fetchProfileDetail(), () => account.listMyPosts(1), () => account.sendVerifyCode('01099999999'),
            () => account.changeMyPassword({ currentPassword: 'a', newPassword: 'b' })]) {
            const result = await run();
            assert.deepEqual([result.ok, result.code], [false, 'LOGIN_REQUIRED']);
        }
        assert.deepEqual(browser.calls, []);
    } finally { restoreBrowser(); }
});
