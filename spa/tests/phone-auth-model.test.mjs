// Phone verification model (2026-11-08): number cleanup and checks, the 6-digit code, the resend countdown and the
// plain-language wording for every phone-related server code. Pure functions; no browser, no server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './helpers/load-ts.mjs';

const load = createLoader();
const model = load('../../src/lib/phoneAuthModel.mjs');
const contract = load('../../src/lib/communityContract.mjs');

test('normalizePhone keeps digits only and turns +82 into the leading 0', () => {
    assert.equal(model.normalizePhone('010-1234-5678'), '01012345678');
    assert.equal(model.normalizePhone(' 010 1234 5678 '), '01012345678');
    assert.equal(model.normalizePhone('+82 10-1234-5678'), '01012345678');
    assert.equal(model.normalizePhone('82101234567'), '82101234567', 'no plus sign: not guessed');
    assert.equal(model.normalizePhone(null), '');
    assert.equal(model.normalizePhone('abc'), '');
});

test('formatPhoneInput adds hyphens while typing and never grows past 11 digits', () => {
    assert.equal(model.formatPhoneInput('010'), '010');
    assert.equal(model.formatPhoneInput('0101'), '010-1');
    assert.equal(model.formatPhoneInput('0101234'), '010-1234');
    assert.equal(model.formatPhoneInput('01012345'), '010-1234-5');
    assert.equal(model.formatPhoneInput('01012345678'), '010-1234-5678');
    assert.equal(model.formatPhoneInput('0101234567899999'), '010-1234-5678');
    assert.equal(model.formatPhoneInput('0111234567'), '011-123-4567', 'old 10-digit numbers split 3-3-4');
    assert.equal(model.formatPhoneInput(''), '');
});

test('validatePhone accepts mobile numbers only and explains the rest in one short line', () => {
    assert.equal(model.validatePhone('010-1234-5678'), '');
    assert.equal(model.validatePhone('01112345678'), '');
    assert.equal(model.validatePhone('0111234567'), '');
    assert.equal(model.validatePhone(''), '휴대폰 번호를 입력해 주세요.');
    for (const bad of ['02-123-4567', '010-123', '01212345678', '010123456789', 'hello']) {
        assert.match(model.validatePhone(bad), /다시 확인/, bad);
    }
});

test('the code is exactly six digits, and typing keeps only digits', () => {
    assert.equal(model.normalizeCode(' 12 34-56 789 '), '123456');
    assert.equal(model.validateAuthCode('123456'), '');
    assert.equal(model.validateAuthCode(''), '문자로 받은 인증번호 6자리를 입력해 주세요.');
    assert.equal(model.validateAuthCode('12345'), '문자로 받은 인증번호 6자리를 입력해 주세요.');
});

test('remainingSeconds counts down to zero and rounds up so the button never frees itself early', () => {
    assert.equal(model.remainingSeconds(10_000, 4_000), 6);
    assert.equal(model.remainingSeconds(10_000, 9_001), 1);
    assert.equal(model.remainingSeconds(10_000, 10_000), 0);
    assert.equal(model.remainingSeconds(10_000, 12_000), 0);
    assert.equal(model.remainingSeconds(0, 5), 0);
    assert.equal(model.remainingSeconds(Number.NaN, 5), 0);
});

test('the send button says what it will do and shows the seconds left', () => {
    assert.equal(model.sendButtonLabel({ sent: false, waitSec: 0, busy: false }), '인증번호 받기');
    assert.equal(model.sendButtonLabel({ sent: true, waitSec: 0, busy: false }), '다시 받기');
    assert.equal(model.sendButtonLabel({ sent: true, waitSec: 42, busy: false }), '다시 받기 (42초)');
    assert.equal(model.sendButtonLabel({ sent: false, waitSec: 30, busy: false }), '인증번호 받기 (30초)');
    assert.equal(model.sendButtonLabel({ sent: false, waitSec: 0, busy: true }), '보내는 중…');
    assert.equal(model.sendButtonLabel({ sent: true, waitSec: 598, busy: false }), '다시 받기 (9:58)', 'a long wait reads as minutes:seconds');
    assert.equal(model.sendButtonLabel({ sent: true, waitSec: 60, busy: false }), '다시 받기 (1:00)');
});

test('waits are said the way people count them: seconds under two minutes, minutes after', () => {
    assert.equal(model.formatWait(45), '45초');
    assert.equal(model.formatWait(119), '119초');
    assert.equal(model.formatWait(120), '2분');
    assert.equal(model.formatWait(600), '10분');
    assert.equal(model.formatWait(601), '11분', 'rounded up: never promise less than the server asks');
});

test('the "text sent" line names the time to type the code, when the server told us', () => {
    assert.equal(model.sentMessage(300), '문자를 보냈어요. 5분 안에 인증번호 6자리를 넣어 주세요.');
    assert.equal(model.sentMessage(90), '문자를 보냈어요. 90초 안에 인증번호 6자리를 넣어 주세요.');
    assert.equal(model.sentMessage(undefined), '문자를 보냈어요. 받은 인증번호 6자리를 넣어 주세요.');
});

test('server wait seconds are clamped to something sane', () => {
    assert.equal(model.waitSeconds(60), 60);
    assert.equal(model.waitSeconds('45'), 45);
    assert.equal(model.waitSeconds(undefined, 60), 60, 'missing answer: the default wait');
    assert.equal(model.waitSeconds(-5, 60), 60);
    assert.equal(model.waitSeconds(99999, 60), 3600, 'never longer than an hour');
});

test('every phone code has a short sentence; the taken-number line sends people to log in', () => {
    const word = (code, extra = {}) => model.describePhoneFailure({ ok: false, code, message: '', ...extra });
    assert.equal(word(contract.COMMUNITY_CODES.PHONE_TAKEN).message, '이미 이 번호로 만든 계정이 있어요. 그 아이디로 로그인해 주세요.');
    assert.equal(word(contract.COMMUNITY_CODES.PHONE_TAKEN).kind, 'taken');
    assert.match(word('PHONE_INVALID').message, /번호를 다시 확인/);
    assert.match(word('PHONE_REQUIRED').message, /휴대폰 인증/);
    assert.match(word('PHONE_CODE_INVALID').message, /인증번호가 달라요/);
    assert.equal(word('PHONE_CODE_INVALID').kind, 'code');
    assert.match(word('PHONE_CODE_EXPIRED').message, /시간이 지났어요/);
    assert.equal(word('PHONE_CODE_EXPIRED').kind, 'expired');
    assert.match(word('SMS_UNAVAILABLE').message, /문자를 보낼 수 없어요/);
    const busy = word('TOO_MANY', { retryAfterSec: 90 });
    assert.match(busy.message, /90초/);
    assert.equal(busy.retryAfterSec, 90);
    assert.equal(busy.kind, 'wait');
    const locked = word('TOO_MANY', { retryAfterSec: 600 });
    assert.match(locked.message, /10분 뒤에 다시/, 'the 5th wrong code: ten minutes, said in minutes');
    assert.equal(locked.retryAfterSec, 600);
});

test('a wrong code tells how many tries are left (only while the server says there are some)', () => {
    const wrong = (extra) => model.describePhoneFailure({ ok: false, code: 'PHONE_CODE_INVALID', message: '', ...extra });
    assert.match(wrong({ triesLeft: 3 }).message, /남은 횟수 3번/);
    assert.match(wrong({ triesLeft: '2' }).message, /남은 횟수 2번/);
    assert.doesNotMatch(wrong({}).message, /남은 횟수/);
    assert.doesNotMatch(wrong({ triesLeft: 0 }).message, /남은 횟수/);
    assert.equal(wrong({ triesLeft: 3 }).kind, 'code');
});

test('later verification: already done, and license / owner accounts go to the login screen panel', () => {
    const word = (code) => model.describePhoneFailure({ ok: false, code, message: '' });
    assert.deepEqual([word('PHONE_ALREADY_VERIFIED').kind, word('PHONE_ALREADY_VERIFIED').message], ['already', '이미 휴대폰 인증이 끝났어요.']);
    assert.deepEqual([word('USE_LICENSE_PHONE').kind, word('USE_LICENSE_PHONE').message], ['license', '이용권·관리자 계정은 로그인 화면의 [본인인증]에서 해 주세요.']);
});

test('a server sentence is kept when we have no better one, and a plain fallback covers the rest', () => {
    const odd = model.describePhoneFailure({ ok: false, code: 'SOMETHING_NEW', message: '서버가 준 문장입니다.' });
    assert.equal(odd.message, '서버가 준 문장입니다.');
    assert.equal(odd.kind, 'other');
    assert.equal(model.describePhoneFailure({ ok: false, code: 'SOMETHING_NEW', message: '' }).message, '처리하지 못했어요. 잠시 뒤 다시 해 주세요.');
    assert.equal(model.describePhoneFailure({ ok: false, code: 'NETWORK', message: '연결에 실패했어요. 인터넷을 확인해 주세요.' }).message, '연결에 실패했어요. 인터넷을 확인해 주세요.');
});

test('the signup promise sentence is the agreed wording', () => {
    assert.equal(model.PHONE_PROMISE, '휴대폰 번호 하나로 계정 하나만 만들 수 있어요.');
});
