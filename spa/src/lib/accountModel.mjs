/**
 * Account page and moderation model: role words, join date, password form checks, the recovery tabs, who sees the
 * moderator buttons and the notice-post rules. Pure functions. What the screen shows is decided here; what a
 * person may actually DO is decided by the server, whose refusal sentence is shown as it comes.
 */
import { COMMUNITY_CODES, NOTICE_ID_PREFIX } from './communityContract.mjs';
import { describePhoneFailure, formatWait, validateAuthCode, validatePhone } from './phoneAuthModel.mjs';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 100;
const GENERIC_FAILURE = '처리하지 못했어요. 잠시 뒤 다시 해 주세요.';

/** The screen's guess at "operator"; the server re-checks every moderator call. */
export const canModerate = (profile) => Boolean(profile) && (profile.role === 'owner' || profile.isOperator === true);

export function roleLabel(profile) {
    if (canModerate(profile)) return '관리자';
    return profile?.role === 'licensed' ? '이용권 회원' : '커뮤니티 회원';
}

/** "2026년 11월 8일 가입" in Korea time; '' when the server gave no usable date. */
export function formatJoined(iso) {
    const at = new Date(iso).getTime();
    if (!iso || !Number.isFinite(at)) return '';
    const day = new Date(at + KST_OFFSET_MS);
    return `${day.getUTCFullYear()}년 ${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일 가입`;
}

export function phoneStatus(detail) {
    if (detail?.phoneVerified !== true) return { verified: false, text: '미인증' };
    const masked = String(detail.phoneMasked || '').trim();
    return { verified: true, text: masked ? `인증됨 · ${masked}` : '인증됨' };
}

export const isNoticeId = (id) => typeof id === 'string' && id.startsWith(NOTICE_ID_PREFIX);

const NOTICE_BADGES = Object.freeze({ important: '중요', update: '업데이트', event: '이벤트', tip: '팁' });

/** The category word of a notice (server keys important / update / event / tip); '' for anything else. */
export const noticeBadgeLabel = (kind) => (typeof kind === 'string' && Object.hasOwn(NOTICE_BADGES, kind) ? NOTICE_BADGES[kind] : '');

/** Login-screen panel where license and owner accounts verify their phone (the old 본인인증). */
export const PHONE_PANEL_PATH = '/login?view=phone';

/** Boards that track an answer state (inquiry, request) have two or more; the rest have none. */
export const statusChoices = (board) => (Array.isArray(board?.statuses) && board.statuses.length >= 2 ? [...board.statuses] : []);

export const NOTICE_HINT = '공지는 어드민 홈 운영에서 고쳐요';

/**
 * Which moderator buttons a post gets. null = none (not a moderator).
 * A notice (from the home-operations list) cannot be hidden or deleted here — only the pin stays, because the
 * server follows the notice setting for it. My own post keeps the author's delete instead of a second one.
 */
export function postModeration(post, profile, boards) {
    if (!canModerate(profile) || !post) return null;
    const notice = post.notice === true || isNoticeId(post.id);
    const board = Array.isArray(boards) ? boards.find((entry) => entry.id === post.board) : undefined;
    return {
        hide: !notice,
        hideLabel: post.hidden ? '보이기' : '숨기기',
        pin: !notice,
        pinLabel: post.pinned ? '고정 해제' : '고정',
        remove: !notice && !post.mine,
        noticeHint: notice ? NOTICE_HINT : '',
        statusChoices: notice ? [] : statusChoices(board),
    };
}

/** Comment buttons: hide / show and delete. A deleted comment has nothing left to do; my own keeps the author's delete. */
export function commentModeration(comment, profile) {
    if (!canModerate(profile) || !comment) return null;
    if (comment.gone && !comment.hidden) return null;
    return { hideLabel: comment.hidden ? '보이기' : '숨기기', remove: !comment.mine };
}

/** Comment / like permission from the server's own fields; a missing field means allowed, as before. */
export const interactionAllowed = (post) => ({ comment: post?.commentable !== false, like: post?.likable !== false });

const passwordProblem = (next, confirm) => {
    const value = String(next || '');
    if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) return `새 비밀번호는 ${PASSWORD_MIN}자 이상 입력해 주세요.`;
    return value === String(confirm || '') ? '' : '새 비밀번호가 서로 같지 않아요. 다시 확인해 주세요.';
};

export function validatePasswordChange({ current, next, confirm }) {
    if (!String(current || '')) return '지금 비밀번호를 입력해 주세요.';
    const problem = passwordProblem(next, confirm);
    if (problem) return problem;
    return String(next) === String(current) ? '지금 비밀번호와 다른 비밀번호로 정해 주세요.' : '';
}

export function validateResetRequest({ userId, phone }) {
    if (!String(userId || '').trim()) return '아이디를 입력해 주세요.';
    return validatePhone(phone);
}

export function validateResetConfirm({ code, next, confirm }) {
    return validateAuthCode(code) || passwordProblem(next, confirm);
}

/** Words for a refused password change; `license` = this is a license account, send the person to the login screen. */
export function describePasswordFailure(result) {
    const code = String(result?.code || '');
    if (code === COMMUNITY_CODES.INVALID_CREDENTIALS || code === COMMUNITY_CODES.INVALID_CURRENT_PASSWORD) {
        return { message: '지금 비밀번호가 맞지 않아요.', license: false };
    }
    if (code === COMMUNITY_CODES.TOO_MANY_ATTEMPTS) {
        const wait = Math.floor(Number(result?.retryAfterSec));
        return { message: wait > 0 ? `여러 번 틀렸어요. ${formatWait(wait)} 뒤에 다시 해 주세요.` : '여러 번 틀렸어요. 잠시 뒤에 다시 해 주세요.', license: false };
    }
    if (code === COMMUNITY_CODES.INVALID_PASSWORD) return { message: `새 비밀번호는 ${PASSWORD_MIN}자 이상 입력해 주세요.`, license: false };
    if (code === COMMUNITY_CODES.USE_LICENSE_RESET) return { message: '이용권 계정은 로그인 화면의 [비밀번호 변경]에서 바꿔요.', license: true };
    return { message: String(result?.message || '').trim() || '비밀번호를 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.', license: false };
}

/** A refused reset: the code/phone words first, the password rule for a weak new password. */
export function describeResetFailure(result) {
    if (String(result?.code || '') === COMMUNITY_CODES.INVALID_PASSWORD) return { ...describePasswordFailure(result), kind: 'password' };
    if (String(result?.code || '') === COMMUNITY_CODES.USE_LICENSE_RESET) return { ...describePasswordFailure(result), kind: 'license' };
    return { ...describePhoneFailure(result), license: false };
}

export const RESET_TABS = Object.freeze({
    community: Object.freeze({ id: 'community', label: '커뮤니티 회원' }),
    license: Object.freeze({ id: 'license', label: '이용권 계정' }),
});
export const resetTabFrom = (value) => (value === 'license' ? 'license' : 'community');
export const resetPasswordPath = (tab) => `/login?view=reset${tab === 'license' ? '&tab=license' : ''}`;

/** The server's own sentence; its bare { ok:false, error:'Unauthorized' } and the notice codes get a Korean line. */
export function describeModerationFailure(result) {
    const code = String(result?.code || '');
    const message = String(result?.message || '').trim();
    if (code === COMMUNITY_CODES.NOTICE_MANAGED_IN_ADMIN) return NOTICE_HINT;
    if (code === COMMUNITY_CODES.NOTICE_NOT_REPORTABLE) return '공지 글은 신고할 수 없어요.';
    if (message === COMMUNITY_CODES.UNAUTHORIZED || (code === COMMUNITY_CODES.UNAUTHORIZED && !message)) return '운영자 권한이 확인되지 않아요.';
    return message || GENERIC_FAILURE;
}

export const REPORTS_PATH = '/community?reports=1';
export const isReportsView = (search) => new URLSearchParams(String(search || '')).get('reports') === '1';
