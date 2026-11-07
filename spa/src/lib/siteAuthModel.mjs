/**
 * Site-wide login model: where /login and /signup send people back to, form checks that mirror the server,
 * the license-code notice and the verdict mapping for LEWORD. Pure functions so node:test can pin them
 * without a browser or a server.
 */

export const LOGIN_PATH = '/login';
export const SIGNUP_PATH = '/signup';
const DEFAULT_AFTER_AUTH = '/';
const NEXT_MAX_LENGTH = 300;

/** The two screens a finished login must never send the person back to. */
function isAuthScreen(pathname) {
    const bare = String(pathname).replace(/\.html$/, '').replace(/\/$/, '');
    return bare === LOGIN_PATH || bare === SIGNUP_PATH;
}

/**
 * A return path is accepted only when it stays on this site: starts with a single "/", no backslash,
 * no control characters, short, and not the login/signup screen itself. Anything else becomes ''.
 */
export function safeNextPath(raw) {
    if (typeof raw !== 'string' || raw === '' || raw.length > NEXT_MAX_LENGTH) return '';
    if (!raw.startsWith('/') || raw.startsWith('//')) return '';
    if (raw.includes('\\') || /[\u0000-\u001F\u007F]/.test(raw)) return '';
    try {
        const parsed = new URL(raw, 'https://site.invalid');
        if (parsed.origin !== 'https://site.invalid') return '';
        if (isAuthScreen(parsed.pathname)) return '';
    } catch {
        return '';
    }
    return raw;
}

/** Home is where a finished login goes anyway, so it is not written into the address. */
function withNext(base, next) {
    const safe = safeNextPath(next);
    return safe && safe !== DEFAULT_AFTER_AUTH ? `${base}?next=${encodeURIComponent(safe)}` : base;
}

export const loginPath = (next) => withNext(LOGIN_PATH, next);
export const signupPath = (next) => withNext(SIGNUP_PATH, next);

/** Where to go once logged in. */
export const afterAuthPath = (next) => safeNextPath(next) || DEFAULT_AFTER_AUTH;

const ID_PATTERN = /^[\p{L}\p{N}_.@+\-]{2,50}$/u;
const NICK_PATTERN = /^[\p{L}\p{N}_.\-]{2,12}$/u;

export function validateLogin({ userId, password }) {
    if (!String(userId || '').trim()) return '아이디를 입력해 주세요.';
    if (!String(password || '')) return '비밀번호를 입력해 주세요.';
    return '';
}

export function validateNickname(nickname) {
    return NICK_PATTERN.test(String(nickname || '').trim()) ? '' : '닉네임은 2~12자의 글자·숫자와 _ . - 만 쓸 수 있어요.';
}

export function validateSignup({ userId, password, passwordConfirm, nickname }) {
    if (!ID_PATTERN.test(String(userId || '').trim())) return '아이디는 글자·숫자와 _ . @ + - 만 쓸 수 있고 2~50자여야 해요.';
    const pw = String(password || '');
    if (pw.length < 6 || pw.length > 100) return '비밀번호는 6자 이상 입력해 주세요.';
    if (pw !== String(passwordConfirm || '')) return '비밀번호가 같지 않아요. 다시 확인해 주세요.';
    return validateNickname(nickname);
}

/** Shown above the license-code field (agreed wording). `bold` parts are rendered as <strong>. */
export const REGISTER_NOTICE_PARTS = Object.freeze([
    Object.freeze({ text: '사이트에서는 ' }),
    Object.freeze({ text: '올인원·LEWORD 코드만', bold: true }),
    Object.freeze({ text: ' 등록할 수 있어요. 네이버 자동화·Orbit 등 다른 제품 코드는 ' }),
    Object.freeze({ text: '그 앱에서', bold: true }),
    Object.freeze({ text: ' 등록해 주세요.' }),
]);
export const REGISTER_NOTICE_TEXT = REGISTER_NOTICE_PARTS.map((part) => part.text).join('');

/** Words for a failed code registration. A code of another product names the app to use. */
export function describeRegisterFailure(result) {
    const code = String(result?.code || '');
    if (code === 'CODE_REGISTER_IN_APP') {
        const name = String(result?.productName || '').trim() || '해당 제품';
        return `이 코드는 ${name} 앱에서 등록해 주세요`;
    }
    const message = String(result?.message || result?.error || '').trim();
    return message || '코드를 등록하지 못했어요. 잠시 뒤 다시 해 주세요.';
}

const SESSION_FAILURES = new Set(['LOGIN_REQUIRED', 'SESSION_INVALID', 'NO_SESSION']);

/** The community token is gone or expired on the server: the browser must forget it. */
export const isSessionFailure = (code) => SESSION_FAILURES.has(String(code || ''));

/**
 * LEWORD entry verdict from the server's `verify-web-login {communityToken, appId}` answer.
 *   ok            the account holds a LEWORD / all-in-one license right now
 *   not-activated community-only account (or a license of another product): needs a license
 *   expired       license period is over: a new code renews the same account
 *   login         the community session itself is dead: log in again
 *   blocked       the account is blocked
 *   error         anything else (network, busy server) — nothing is decided
 */
export function mapLewordVerify(payload) {
    if (!payload || typeof payload !== 'object') return { kind: 'error', message: '확인하지 못했어요. 잠시 뒤 다시 해 주세요.' };
    if (payload.ok === true && payload.valid === true) return { kind: 'ok' };
    const code = String(payload.code || '');
    const message = String(payload.message || payload.error || '').trim();
    if (code === 'LICENSE_NOT_ACTIVATED' || code === 'PLATFORM_MISMATCH' || code === 'INVALID_CREDENTIALS') {
        return { kind: 'not-activated', message };
    }
    if (isSessionFailure(code)) return { kind: 'login', message };
    if (code === 'LICENSE_EXPIRED') return { kind: 'expired', message };
    if (code === 'USER_BLOCKED') return { kind: 'blocked', message };
    return { kind: 'error', message: message || '확인하지 못했어요. 잠시 뒤 다시 해 주세요.' };
}
