// Account and moderation model (2026-11-08): role words, join date, password form checks, which reset path to
// use, who sees the moderator buttons, and the notice-post rules. Pure functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './helpers/load-ts.mjs';

const load = createLoader();
const model = load('../../src/lib/accountModel.mjs');
const community = load('../../src/lib/communityModel.mjs');
const contract = load('../../src/lib/communityContract.mjs');

const boards = community.boardList(null);
const boardOf = (id) => boards.find((entry) => entry.id === id);

test('contract: every action name is one string in one place', () => {
    const names = Object.values(contract.COMMUNITY_ACTIONS);
    assert.equal(new Set(names).size, names.length, 'no two actions share a name');
    assert.equal(contract.COMMUNITY_ACTIONS.signupSendCode, 'community-signup-send-code');
    assert.equal(contract.COMMUNITY_ACTIONS.profile, 'community-profile');
    assert.equal(contract.COMMUNITY_ACTIONS.myPosts, 'community-my-posts');
    assert.equal(contract.COMMUNITY_ACTIONS.changePassword, 'community-change-password');
    assert.equal(contract.COMMUNITY_ACTIONS.resetSendCode, 'community-reset-send-code');
    assert.equal(contract.COMMUNITY_ACTIONS.resetConfirm, 'community-reset-confirm');
    assert.equal(contract.COMMUNITY_ACTIONS.verifyPhoneSend, 'community-verify-phone-send');
    assert.equal(contract.COMMUNITY_ACTIONS.verifyPhoneConfirm, 'community-verify-phone-confirm');
    for (const key of ['Hide', 'Pin', 'Delete', 'Status', 'Reports', 'ReportResolve', 'Posts', 'Boards']) {
        assert.match(contract.COMMUNITY_ACTIONS[`admin${key}`], /^community-admin-/);
    }
    assert.equal(contract.NOTICE_ID_PREFIX, 'nt_');
});

test('roleLabel: owner = 관리자, licensed = 이용권 회원, everyone else = 커뮤니티 회원', () => {
    assert.equal(model.roleLabel({ role: 'owner' }), '관리자');
    assert.equal(model.roleLabel({ role: 'community', isOperator: true }), '관리자');
    assert.equal(model.roleLabel({ role: 'licensed' }), '이용권 회원');
    assert.equal(model.roleLabel({ role: 'community' }), '커뮤니티 회원');
    assert.equal(model.roleLabel(null), '커뮤니티 회원');
});

test('formatJoined writes the Korea-time date, or nothing for a bad value', () => {
    assert.equal(model.formatJoined('2026-11-07T16:30:00Z'), '2026년 11월 8일 가입');
    assert.equal(model.formatJoined('2026-01-02T00:00:00+09:00'), '2026년 1월 2일 가입');
    assert.equal(model.formatJoined(''), '');
    assert.equal(model.formatJoined('not a date'), '');
});

test('phone status: masked number when verified, a plain "not verified" otherwise', () => {
    assert.deepEqual(model.phoneStatus({ phoneVerified: true, phoneMasked: '010-****-5678' }), { verified: true, text: '인증됨 · 010-****-5678' });
    assert.deepEqual(model.phoneStatus({ phoneVerified: true, phoneMasked: '' }), { verified: true, text: '인증됨' });
    assert.deepEqual(model.phoneStatus({ phoneVerified: false, phoneMasked: '010-****-5678' }), { verified: false, text: '미인증' });
    assert.deepEqual(model.phoneStatus(null), { verified: false, text: '미인증' });
});

test('canModerate: only the owner role or an operator flag; the server still decides', () => {
    assert.equal(model.canModerate({ role: 'owner' }), true);
    assert.equal(model.canModerate({ role: 'community', isOperator: true }), true);
    assert.equal(model.canModerate({ role: 'licensed' }), false);
    assert.equal(model.canModerate({ role: 'community', canWriteNews: true }), false, 'writing news is not moderating');
    assert.equal(model.canModerate({ role: 'community' }), false);
    assert.equal(model.canModerate(null), false);
    assert.equal(model.canModerate(undefined), false);
});

test('notice posts come from the notice list and are recognised by the nt_ prefix', () => {
    assert.equal(model.isNoticeId('nt_20261107_1'), true);
    assert.equal(model.isNoticeId('p_12'), false);
    assert.equal(model.isNoticeId(''), false);
    assert.equal(model.isNoticeId(undefined), false);
});

test('postModeration: members get nothing; a notice loses every moderator button and shows only the hint', () => {
    const owner = { role: 'owner' };
    const member = { role: 'community' };
    const post = { id: 'p_1', board: 'free', hidden: false, pinned: false, mine: false, status: '' };
    assert.equal(model.postModeration(post, member, boards), null);
    assert.deepEqual(model.postModeration(post, owner, boards), {
        hide: true, hideLabel: '숨기기', pin: true, pinLabel: '고정', remove: true, noticeHint: '', statusChoices: [],
    });
    const hidden = model.postModeration({ ...post, hidden: true, pinned: true }, owner, boards);
    assert.equal(hidden.hideLabel, '보이기');
    assert.equal(hidden.pinLabel, '고정 해제');
    const notice = model.postModeration({ ...post, id: 'nt_1', board: 'news' }, owner, boards);
    assert.equal(notice.hide, false);
    assert.equal(notice.remove, false);
    assert.equal(notice.pin, false, 'the pin follows the notice setting on the server');
    assert.equal(notice.noticeHint, '공지는 어드민 홈 운영에서 고쳐요');
});

test('postModeration: my own post keeps the author delete only (no second delete button)', () => {
    const own = model.postModeration({ id: 'p_2', board: 'free', hidden: false, pinned: false, mine: true, status: '' }, { role: 'owner' }, boards);
    assert.equal(own.remove, false);
    assert.equal(own.hide, true);
});

test('status choices follow the board: inquiry and request have two, the others none', () => {
    assert.deepEqual(model.statusChoices(boardOf('inquiry'), '대기'), ['대기', '답변 완료']);
    assert.deepEqual(model.statusChoices(boardOf('request'), '검토 중'), ['검토 중', '반영됨']);
    assert.deepEqual(model.statusChoices(boardOf('free'), ''), []);
    assert.deepEqual(model.statusChoices(undefined, ''), []);
    const owner = { role: 'owner' };
    const inquiry = model.postModeration({ id: 'p_3', board: 'inquiry', hidden: false, pinned: false, mine: false, status: '대기' }, owner, boards);
    assert.deepEqual(inquiry.statusChoices, ['대기', '답변 완료']);
    const asNotice = model.postModeration({ id: 'nt_9', board: 'inquiry', hidden: false, pinned: false, mine: false, status: '' }, owner, boards);
    assert.deepEqual(asNotice.statusChoices, [], 'a notice has no answer status');
});

test('commentModeration: owner can hide and delete someone else\'s comment, never a deleted one', () => {
    const owner = { role: 'owner' };
    assert.equal(model.commentModeration({ id: 'c_1', hidden: false, gone: false, mine: false }, { role: 'community' }), null);
    assert.deepEqual(model.commentModeration({ id: 'c_1', hidden: false, gone: false, mine: false }, owner), { hideLabel: '숨기기', remove: true });
    assert.deepEqual(model.commentModeration({ id: 'c_1', hidden: true, gone: true, mine: false }, owner), { hideLabel: '보이기', remove: true });
    assert.equal(model.commentModeration({ id: 'c_1', hidden: false, gone: true, mine: false }, owner), null, 'deleted: nothing left to do');
    assert.deepEqual(model.commentModeration({ id: 'c_1', hidden: false, gone: false, mine: true }, owner), { hideLabel: '숨기기', remove: false });
});

test('interaction limits follow the server fields, and default to allowed', () => {
    assert.deepEqual(model.interactionAllowed({}), { comment: true, like: true });
    assert.deepEqual(model.interactionAllowed({ commentable: false }), { comment: false, like: true });
    assert.deepEqual(model.interactionAllowed({ likable: false, commentable: true }), { comment: true, like: false });
    assert.deepEqual(model.interactionAllowed(null), { comment: true, like: true });
});

test('validatePasswordChange: current, new (6+), confirm, and different from the current', () => {
    const ok = { current: 'old-pass', next: 'new-pass-1', confirm: 'new-pass-1' };
    assert.equal(model.validatePasswordChange(ok), '');
    assert.equal(model.validatePasswordChange({ ...ok, current: '' }), '지금 비밀번호를 입력해 주세요.');
    assert.equal(model.validatePasswordChange({ ...ok, next: '12345', confirm: '12345' }), '새 비밀번호는 6자 이상 입력해 주세요.');
    assert.equal(model.validatePasswordChange({ ...ok, confirm: 'other' }), '새 비밀번호가 서로 같지 않아요. 다시 확인해 주세요.');
    assert.equal(model.validatePasswordChange({ current: 'same-pass', next: 'same-pass', confirm: 'same-pass' }), '지금 비밀번호와 다른 비밀번호로 정해 주세요.');
});

test('validateReset: id, phone, code and the new password, in the order a person fills them', () => {
    const ok = { userId: 'leader01', phone: '010-1234-5678', code: '123456', next: 'new-pass-1', confirm: 'new-pass-1' };
    assert.equal(model.validateResetRequest(ok), '');
    assert.equal(model.validateResetRequest({ ...ok, userId: ' ' }), '아이디를 입력해 주세요.');
    assert.match(model.validateResetRequest({ ...ok, phone: '12' }), /번호를 다시 확인/);
    assert.equal(model.validateResetConfirm(ok), '');
    assert.equal(model.validateResetConfirm({ ...ok, code: '12' }), '문자로 받은 인증번호 6자리를 입력해 주세요.');
    assert.equal(model.validateResetConfirm({ ...ok, next: 'abc', confirm: 'abc' }), '새 비밀번호는 6자 이상 입력해 주세요.');
    assert.equal(model.validateResetConfirm({ ...ok, confirm: 'nope' }), '새 비밀번호가 서로 같지 않아요. 다시 확인해 주세요.');
});

test('describePasswordFailure: wrong current password, weak new password, and the license-account redirect', () => {
    const word = (code, message = '') => model.describePasswordFailure({ ok: false, code, message });
    assert.deepEqual(word('INVALID_CREDENTIALS'), { message: '지금 비밀번호가 맞지 않아요.', license: false });
    assert.deepEqual(word('INVALID_CURRENT_PASSWORD'), { message: '지금 비밀번호가 맞지 않아요.', license: false });
    assert.equal(word('TOO_MANY_ATTEMPTS').message, '여러 번 틀렸어요. 잠시 뒤에 다시 해 주세요.');
    assert.equal(model.describePasswordFailure({ code: 'TOO_MANY_ATTEMPTS', retryAfterSec: 600 }).message, '여러 번 틀렸어요. 10분 뒤에 다시 해 주세요.');
    assert.deepEqual(word('INVALID_PASSWORD'), { message: '새 비밀번호는 6자 이상 입력해 주세요.', license: false });
    assert.deepEqual(word('USE_LICENSE_RESET'), { message: '이용권 계정은 로그인 화면의 [비밀번호 변경]에서 바꿔요.', license: true });
    assert.deepEqual(word('LOGIN_REQUIRED', '로그인이 필요해요.'), { message: '로그인이 필요해요.', license: false });
    assert.equal(word('WHATEVER').message, '비밀번호를 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.');
});

test('the reset paths: /login opens the recovery screen on the right tab', () => {
    assert.equal(model.RESET_TABS.community.id, 'community');
    assert.equal(model.resetTabFrom('license'), 'license');
    assert.equal(model.resetTabFrom('community'), 'community');
    assert.equal(model.resetTabFrom('x'), 'community');
    assert.equal(model.resetPasswordPath(), '/login?view=reset');
    assert.equal(model.resetPasswordPath('license'), '/login?view=reset&tab=license');
});

test('notice badges: the four server kinds in Korean, anything else is ignored', () => {
    assert.deepEqual(['important', 'update', 'event', 'tip'].map(model.noticeBadgeLabel), ['중요', '업데이트', '이벤트', '팁']);
    assert.equal(model.noticeBadgeLabel('weird'), '');
    assert.equal(model.noticeBadgeLabel(undefined), '');
});

test('moderation failure wording: the server sentence is shown; a bare "Unauthorized" gets a Korean line', () => {
    assert.equal(model.describeModerationFailure({ ok: false, code: 'Unauthorized', message: 'Unauthorized' }), '운영자 권한이 확인되지 않아요.');
    assert.equal(model.describeModerationFailure({ ok: false, code: 'Unauthorized', message: '' }), '운영자 권한이 확인되지 않아요.');
    assert.equal(model.describeModerationFailure({ ok: false, code: 'NOTICE_MANAGED_IN_ADMIN', message: 'x' }), '공지는 어드민 홈 운영에서 고쳐요');
    assert.equal(model.describeModerationFailure({ ok: false, code: 'NOTICE_NOT_REPORTABLE', message: '' }), '공지 글은 신고할 수 없어요.');
    assert.equal(model.describeModerationFailure({ ok: false, code: 'FORBIDDEN', message: '운영자만 할 수 있습니다.' }), '운영자만 할 수 있습니다.');
    assert.equal(model.describeModerationFailure({ ok: false, code: 'UNKNOWN', message: 'Unauthorized' }), '운영자 권한이 확인되지 않아요.');
    assert.equal(model.describeModerationFailure({ ok: false, code: 'X', message: '' }), '처리하지 못했어요. 잠시 뒤 다시 해 주세요.');
});

test('reports view lives at /community?reports=1', () => {
    assert.equal(model.REPORTS_PATH, '/community?reports=1');
    assert.equal(model.isReportsView('?reports=1&board=free'), true);
    assert.equal(model.isReportsView('?board=free'), false);
    assert.equal(model.isReportsView(''), false);
});
