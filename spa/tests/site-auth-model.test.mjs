// Site-wide login model (2026-11-08): return-path safety, form checks, license-code notice, LEWORD verdicts.
// Pure functions only — the server is never called here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LOGIN_PATH, SIGNUP_PATH, REGISTER_NOTICE_PARTS, REGISTER_NOTICE_TEXT,
    safeNextPath, loginPath, signupPath, afterAuthPath,
    validateLogin, validateSignup, validateNickname,
    describeRegisterFailure, isSessionFailure, mapLewordVerify,
} from '../src/lib/siteAuthModel.mjs';

test('login and signup live at /login and /signup', () => {
    assert.equal(LOGIN_PATH, '/login');
    assert.equal(SIGNUP_PATH, '/signup');
});

test('safeNextPath keeps same-site paths and drops everything that could leave the site', () => {
    assert.equal(safeNextPath('/community'), '/community');
    assert.equal(safeNextPath('/community?board=free&page=2'), '/community?board=free&page=2');
    assert.equal(safeNextPath('/leword?tab=picks#top'), '/leword?tab=picks#top');
    for (const bad of ['https://evil.example/x', '//evil.example', '/\\evil.example', '\\\\evil', 'javascript:alert(1)', 'community', '', null, undefined, 42, '/a\nb', '/a\u0000b']) {
        assert.equal(safeNextPath(bad), '', `rejects ${JSON.stringify(bad)}`);
    }
    assert.equal(safeNextPath(`/${'a'.repeat(400)}`), '', 'absurdly long values are dropped');
});

test('safeNextPath never sends a logged-in person back to the login or signup screen', () => {
    for (const loop of ['/login', '/login?next=%2Fcommunity', '/signup', '/signup.html', '/login/']) {
        assert.equal(safeNextPath(loop), '', loop);
    }
});

test('loginPath / signupPath carry the return path, encoded, and only when it is safe', () => {
    assert.equal(loginPath(), '/login');
    assert.equal(loginPath('/community?board=free'), '/login?next=%2Fcommunity%3Fboard%3Dfree');
    assert.equal(loginPath('https://evil.example'), '/login');
    assert.equal(loginPath('/'), '/login', 'home is the default, so it is not written down');
    assert.equal(signupPath('/leword'), '/signup?next=%2Fleword');
    assert.equal(signupPath(), '/signup');
});

test('afterAuthPath goes back where the person was heading, else home', () => {
    assert.equal(afterAuthPath('/community?post=p_1'), '/community?post=p_1');
    assert.equal(afterAuthPath('//evil.example'), '/');
    assert.equal(afterAuthPath(''), '/');
});

test('validateLogin asks for both fields in plain words', () => {
    assert.match(validateLogin({ userId: '', password: 'x' }), /아이디/);
    assert.match(validateLogin({ userId: 'a', password: '' }), /비밀번호/);
    assert.equal(validateLogin({ userId: 'leader01', password: 'x' }), '');
});

test('validateSignup follows the server rules (id 2-50, password 6-100, nickname 2-12) and checks the repeat', () => {
    const ok = { userId: 'leader01', password: 'secret1', passwordConfirm: 'secret1', nickname: '새싹이' };
    assert.equal(validateSignup(ok), '');
    assert.match(validateSignup({ ...ok, userId: 'a' }), /아이디/);
    assert.match(validateSignup({ ...ok, userId: 'bad id!' }), /아이디/);
    assert.match(validateSignup({ ...ok, password: '12345', passwordConfirm: '12345' }), /6자/);
    assert.match(validateSignup({ ...ok, passwordConfirm: 'different' }), /같지 않/);
    assert.match(validateSignup({ ...ok, nickname: '가' }), /닉네임/);
    assert.match(validateSignup({ ...ok, nickname: '가'.repeat(13) }), /닉네임/);
    assert.match(validateSignup({ ...ok, nickname: 'a b' }), /닉네임/);
    assert.equal(validateSignup({ ...ok, userId: 'user@mail.com', nickname: 'Leader_1.x-' }), '');
});

test('the license-code notice is exactly the agreed sentence, with the two phrases emphasised', () => {
    assert.equal(
        REGISTER_NOTICE_TEXT,
        '사이트에서는 올인원·LEWORD 코드만 등록할 수 있어요. 네이버 자동화·Orbit 등 다른 제품 코드는 그 앱에서 등록해 주세요.',
    );
    assert.equal(REGISTER_NOTICE_PARTS.map((part) => part.text).join(''), REGISTER_NOTICE_TEXT);
    assert.deepEqual(REGISTER_NOTICE_PARTS.filter((part) => part.bold).map((part) => part.text), ['올인원·LEWORD 코드만', '그 앱에서']);
});

test('a code of another product says which app to use', () => {
    assert.equal(
        describeRegisterFailure({ ok: false, code: 'CODE_REGISTER_IN_APP', productName: '네이버 자동화', message: 'server text' }),
        '이 코드는 네이버 자동화 앱에서 등록해 주세요',
    );
    assert.equal(describeRegisterFailure({ ok: false, code: 'CODE_REGISTER_IN_APP' }), '이 코드는 해당 제품 앱에서 등록해 주세요');
    assert.equal(describeRegisterFailure({ ok: false, code: 'INVALID_CODE', message: '코드를 찾을 수 없습니다.' }), '코드를 찾을 수 없습니다.');
    assert.match(describeRegisterFailure({ ok: false, code: 'X' }), /등록하지 못/);
});

test('session failures are recognised so a dead token is dropped', () => {
    for (const code of ['LOGIN_REQUIRED', 'SESSION_INVALID', 'NO_SESSION']) assert.equal(isSessionFailure(code), true, code);
    for (const code of ['INVALID_CREDENTIALS', 'LICENSE_NOT_ACTIVATED', 'DAILY_LIMIT', '', undefined]) assert.equal(isSessionFailure(code), false, String(code));
});

test('mapLewordVerify turns the server answer into one of six verdicts', () => {
    assert.deepEqual(mapLewordVerify({ ok: true, valid: true, userId: 'a' }), { kind: 'ok' });
    assert.equal(mapLewordVerify({ ok: false, code: 'LICENSE_NOT_ACTIVATED', role: 'community' }).kind, 'not-activated');
    assert.equal(mapLewordVerify({ ok: false, code: 'PLATFORM_MISMATCH', message: '이 계정의 라이선스는 네이버 자동화 전용입니다.' }).kind, 'not-activated');
    assert.equal(mapLewordVerify({ ok: false, code: 'NO_SESSION' }).kind, 'login');
    assert.equal(mapLewordVerify({ ok: false, code: 'SESSION_INVALID' }).kind, 'login');
    const expired = mapLewordVerify({ ok: false, code: 'LICENSE_EXPIRED', message: '이용 기간이 끝났습니다.' });
    assert.equal(expired.kind, 'expired');
    assert.equal(expired.message, '이용 기간이 끝났습니다.');
    assert.equal(mapLewordVerify({ ok: false, code: 'USER_BLOCKED', message: '차단' }).kind, 'blocked');
    const broken = mapLewordVerify({ ok: false, code: 'NETWORK', message: '연결에 실패했습니다.' });
    assert.deepEqual([broken.kind, broken.message], ['error', '연결에 실패했습니다.']);
    assert.equal(mapLewordVerify(null).kind, 'error');
    assert.equal(mapLewordVerify({ ok: true, valid: false }).kind, 'error', 'ok without valid is not an open door');
});

test('validateNickname: 2-12 letters, digits and _ . - only', () => {
    assert.equal(validateNickname('새싹이'), '');
    assert.equal(validateNickname('Leader_1.x-'), '');
    assert.match(validateNickname(''), /닉네임/);
    assert.match(validateNickname('가'), /닉네임/);
    assert.match(validateNickname('가'.repeat(13)), /닉네임/);
    assert.match(validateNickname('a b'), /닉네임/);
    assert.match(validateNickname('<b>'), /닉네임/);
});
