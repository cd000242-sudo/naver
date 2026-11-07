// Phone-verified signup (2026-11-08): get a code -> resend wait -> wrong code -> success, the "number already used"
// answer, and proof that no password, code or full phone number is left in the browser. The server is a script.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, fakeBrowser, restoreBrowser, FAKE_GAS_URL } from './helpers/load-ts.mjs';

const FUTURE = '2099-01-01T00:00:00.000Z';
const grade = { key: 'sprout', label: '새싹', min: 0, nextAt: 100, nextLabel: '잎새' };
const profile = (extra = {}) => ({
    ok: true, userId: 'leader01', role: 'community', nickname: '새싹이', needsNickname: false, canWriteNews: false,
    score: 0, activity: { posts: 0, comments: 0, visits: 0 }, grade, linked: false,
    communityToken: 'ct_abc', sessionExpiresAt: FUTURE, ...extra,
});
const fail = (code, extra = {}) => ({ ok: false, code, message: `server:${code}`, ...extra });
const input = (extra = {}) => ({ userId: 'leader01', password: 'secret-pw-1', nickname: '새싹이', phone: '010-1234-5678', code: '123456', ...extra });

function modules() {
    const load = createLoader();
    return {
        account: load('../../src/lib/communityAccount.ts'),
        auth: load('../../src/lib/communityAuth.ts'),
        session: load('../../src/lib/communitySession.ts'),
        phone: load('../../src/lib/phoneAuthModel.mjs'),
        site: load('../../src/lib/siteAuthModel.mjs'),
    };
}

async function withBrowser(replies, body) {
    const browser = fakeBrowser(replies);
    try { return await body(browser, modules()); } finally { restoreBrowser(); }
}
const lastCall = (browser, action) => [...browser.calls].reverse().find((call) => call.action === action);

test('asking for a signup code sends only the digits, with no login token', async () => {
    await withBrowser({ 'community-signup-send-code': { ok: true, expiresInSec: 180, resendAfterSec: 60 } }, async (browser, { account }) => {
        const result = await account.sendSignupCode('010-1234-5678');
        assert.deepEqual(result, { ok: true, expiresInSec: 180, resendAfterSec: 60 });
        const call = lastCall(browser, 'community-signup-send-code');
        assert.equal(call.phone, '01012345678');
        assert.equal(call.communityToken, undefined);
        assert.deepEqual([...new Set(browser.urls)], [FAKE_GAS_URL]);
    });
});

test('a bad number never reaches the server', async () => {
    await withBrowser({}, async (browser, { account }) => {
        const result = await account.sendSignupCode('12345');
        assert.equal(result.ok, false);
        assert.equal(result.code, 'PHONE_INVALID');
        assert.match(result.message, /번호를 다시 확인/);
        assert.deepEqual(browser.calls, []);
    });
});

test('a server that forgets the wait gets the default 60 seconds', async () => {
    await withBrowser({ 'community-signup-send-code': { ok: true } }, async (_browser, { account }) => {
        const result = await account.sendSignupCode('01012345678');
        assert.equal(result.resendAfterSec, 60);
        assert.equal(result.expiresInSec, 180);
    });
});

test('number already used: the sentence, the "taken" kind, and nothing stored', async () => {
    await withBrowser({ 'community-signup-send-code': fail('PHONE_TAKEN') }, async (browser, { account }) => {
        const result = await account.sendSignupCode('01012345678');
        assert.deepEqual([result.ok, result.code, result.kind], [false, 'PHONE_TAKEN', 'taken']);
        assert.equal(result.message, '이미 이 번호로 만든 계정이 있어요. 그 아이디로 로그인해 주세요.');
        assert.equal(browser.store.size, 0);
    });
});

test('too many requests: the wait comes back in seconds so the button can count down', async () => {
    await withBrowser({ 'community-signup-send-code': fail('TOO_MANY', { retryAfterSec: 90 }) }, async (_browser, { account }) => {
        const result = await account.sendSignupCode('01012345678');
        assert.deepEqual([result.kind, result.retryAfterSec], ['wait', 90]);
        assert.match(result.message, /90초/);
    });
});

test('sms down: a plain sentence, no code leaks', async () => {
    await withBrowser({ 'community-signup-send-code': fail('SMS_UNAVAILABLE') }, async (_browser, { account }) => {
        const result = await account.sendSignupCode('01012345678');
        assert.equal(result.kind, 'sms');
        assert.match(result.message, /문자를 보낼 수 없어요/);
    });
});

test('signup carries the phone and the code, logs the member in, and stores none of the secrets', async () => {
    await withBrowser({ 'community-signup': profile() }, async (browser, { auth, session }) => {
        const result = await auth.signupCommunity(input());
        assert.equal(result.ok, true);
        const call = lastCall(browser, 'community-signup');
        assert.deepEqual([call.userId, call.nickname, call.phone, call.code], ['leader01', '새싹이', '01012345678', '123456']);
        assert.equal(session.loadCommunitySession().communityToken, 'ct_abc');
        const stored = browser.storedText();
        for (const secret of ['secret-pw-1', '123456', '01012345678', '010-1234-5678']) assert.ok(!stored.includes(secret), `${secret} is not stored`);
    });
});

test('a wrong code keeps the person on the form with a plain sentence', async () => {
    await withBrowser({ 'community-signup': fail('PHONE_CODE_INVALID') }, async (browser, { auth }) => {
        const result = await auth.signupCommunity(input({ code: '000000' }));
        assert.deepEqual([result.ok, result.code, result.kind], [false, 'PHONE_CODE_INVALID', 'code']);
        assert.match(result.message, /인증번호가 달라요/);
        assert.equal(browser.store.size, 0);
    });
});

test('an expired code asks for a new one; a taken number and a missing phone each say so', async () => {
    for (const [code, kind, pattern] of [
        ['PHONE_CODE_EXPIRED', 'expired', /시간이 지났어요/],
        ['PHONE_TAKEN', 'taken', /이미 이 번호로 만든 계정/],
        ['PHONE_REQUIRED', 'required', /휴대폰 인증이 필요/],
    ]) {
        await withBrowser({ 'community-signup': fail(code) }, async (_browser, { auth }) => {
            const result = await auth.signupCommunity(input());
            assert.deepEqual([result.ok, result.kind], [false, kind], code);
            assert.match(result.message, pattern, code);
        });
    }
});

test('other signup refusals keep the server wording (nickname taken)', async () => {
    await withBrowser({ 'community-signup': { ok: false, code: 'NICKNAME_TAKEN', message: '이미 사용 중인 닉네임입니다.' } }, async (_browser, { auth }) => {
        const result = await auth.signupCommunity(input());
        assert.deepEqual([result.code, result.message], ['NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.']);
        assert.equal(result.kind, undefined);
    });
});

test('whole story: get code, wait, wrong code, new code after the wait, right code, logged in', async () => {
    let sends = 0;
    const replies = {
        'community-signup-send-code': () => { sends += 1; return { ok: true, expiresInSec: 180, resendAfterSec: 60 }; },
        'community-signup': (body) => (body.code === '654321' ? profile() : fail('PHONE_CODE_INVALID')),
    };
    await withBrowser(replies, async (_browser, { account, auth, phone, session }) => {
        const clock = 1_000_000;
        const first = await account.sendSignupCode('010-1234-5678');
        const until = clock + first.resendAfterSec * 1000;
        assert.equal(phone.sendButtonLabel({ sent: true, waitSec: phone.remainingSeconds(until, clock + 18_000), busy: false }), '다시 받기 (42초)');
        assert.equal((await auth.signupCommunity(input({ code: '111111' }))).ok, false);
        assert.equal(session.loadCommunitySession(), null);
        assert.equal(phone.remainingSeconds(until, clock + 61_000), 0, 'after the wait the button is free again');
        await account.sendSignupCode('010-1234-5678');
        assert.equal(sends, 2);
        const done = await auth.signupCommunity(input({ code: '654321' }));
        assert.equal(done.ok, true);
        assert.equal(session.loadCommunitySession().userId, 'leader01');
    });
});

test('signup form check: account fields first, then the phone, then the code', async () => {
    await withBrowser({}, async (_browser, { site }) => {
        const form = { userId: 'leader01', password: 'secret-pw-1', passwordConfirm: 'secret-pw-1', nickname: '새싹이', phone: '010-1234-5678', code: '123456' };
        assert.equal(site.validateSignupWithPhone(form), '');
        assert.match(site.validateSignupWithPhone({ ...form, userId: '' }), /아이디/);
        assert.match(site.validateSignupWithPhone({ ...form, phone: '' }), /휴대폰 번호를 입력/);
        assert.match(site.validateSignupWithPhone({ ...form, code: '12' }), /인증번호 6자리/);
    });
});
