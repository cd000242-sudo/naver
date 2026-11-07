/**
 * Phone verification model: number cleanup and checks, the 6-digit code, the resend countdown and plain-language
 * wording for the server's phone codes. Pure functions so node:test can pin them without a browser or a server.
 * The server checks everything again; these only decide what the screen says first.
 */
import { COMMUNITY_CODES } from './communityContract.mjs';

export const PHONE_PROMISE = '휴대폰 번호 하나로 계정 하나만 만들 수 있어요.';
const DEFAULT_WAIT_SEC = 60;
const MAX_WAIT_SEC = 3600;
const CODE_LENGTH = 6;
const MOBILE_PATTERN = /^01[016789]\d{7,8}$/;

/** Digits only; "+82 10-…" becomes "010…". Everything else is left to the pattern check. */
export function normalizePhone(value) {
    const raw = String(value ?? '').trim();
    const digits = raw.replace(/\D/g, '');
    if (raw.startsWith('+82')) return `0${digits.slice(2).replace(/^0/, '')}`;
    return digits;
}

/** The hyphenated form shown in the box while typing: 010-1234-5678 (old 10-digit numbers: 011-123-4567). */
export function formatPhoneInput(value) {
    const digits = normalizePhone(value).slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function validatePhone(value) {
    if (String(value ?? '').trim() === '') return '휴대폰 번호를 입력해 주세요.';
    return MOBILE_PATTERN.test(normalizePhone(value)) ? '' : '휴대폰 번호를 다시 확인해 주세요. (예: 010-1234-5678)';
}

export const normalizeCode = (value) => String(value ?? '').replace(/\D/g, '').slice(0, CODE_LENGTH);

export function validateAuthCode(value) {
    return normalizeCode(value).length === CODE_LENGTH ? '' : '문자로 받은 인증번호 6자리를 입력해 주세요.';
}

/** Whole seconds left until `until` (ms timestamp). Rounded up so a button never frees itself early. */
export function remainingSeconds(until, now) {
    if (!Number.isFinite(until) || !Number.isFinite(now)) return 0;
    return Math.max(0, Math.ceil((until - now) / 1000));
}

const two = (value) => String(value).padStart(2, '0');

/** "45초" under two minutes, "10분" after (rounded up, so a promise is never shorter than the server's wait). */
export function formatWait(seconds) {
    const total = Math.max(0, Math.ceil(Number(seconds) || 0));
    return total < 120 ? `${total}초` : `${Math.ceil(total / 60)}분`;
}

/** The clock on the button: "42초" for a short wait, "9:58" for a long one. */
function clock(seconds) {
    return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}:${two(seconds % 60)}`;
}

export function sendButtonLabel({ sent, waitSec, busy }) {
    if (busy) return '보내는 중…';
    const base = sent ? '다시 받기' : '인증번호 받기';
    return waitSec > 0 ? `${base} (${clock(waitSec)})` : base;
}

/** The line after a code was texted. The time to type it is named when the server told us. */
export function sentMessage(expiresInSec) {
    const seconds = Number(expiresInSec);
    if (!Number.isFinite(seconds) || seconds <= 0) return '문자를 보냈어요. 받은 인증번호 6자리를 넣어 주세요.';
    return `문자를 보냈어요. ${formatWait(seconds)} 안에 인증번호 6자리를 넣어 주세요.`;
}

/** A wait the server named, clamped to something a person can sit through; anything odd falls back. */
export function waitSeconds(value, fallback = DEFAULT_WAIT_SEC) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
    return Math.min(Math.floor(seconds), MAX_WAIT_SEC);
}

const LINES = Object.freeze({
    [COMMUNITY_CODES.PHONE_TAKEN]: { kind: 'taken', message: '이미 이 번호로 만든 계정이 있어요. 그 아이디로 로그인해 주세요.' },
    [COMMUNITY_CODES.PHONE_INVALID]: { kind: 'phone', message: '휴대폰 번호를 다시 확인해 주세요. (예: 010-1234-5678)' },
    [COMMUNITY_CODES.PHONE_REQUIRED]: { kind: 'required', message: '휴대폰 인증이 필요해요. 번호를 넣고 인증번호를 받아 주세요.' },
    [COMMUNITY_CODES.PHONE_ALREADY_VERIFIED]: { kind: 'already', message: '이미 휴대폰 인증이 끝났어요.' },
    [COMMUNITY_CODES.USE_LICENSE_PHONE]: { kind: 'license', message: '이용권·관리자 계정은 로그인 화면의 [본인인증]에서 해 주세요.' },
    [COMMUNITY_CODES.PHONE_CODE_EXPIRED]: { kind: 'expired', message: '인증번호 시간이 지났어요. 다시 받아 주세요.' },
    [COMMUNITY_CODES.SMS_UNAVAILABLE]: { kind: 'sms', message: '지금은 문자를 보낼 수 없어요. 잠시 뒤 다시 해 주세요.' },
});

const FALLBACK_LINE = '처리하지 못했어요. 잠시 뒤 다시 해 주세요.';

/**
 * One short sentence for a failed phone step, and a `kind` the screen can act on:
 * taken (offer login), code (keep the box), expired (ask for a new code), wait (count down), phone, required, sms, other.
 */
export function describePhoneFailure(result) {
    const code = String(result?.code || '');
    if (code === COMMUNITY_CODES.TOO_MANY) {
        const retryAfterSec = waitSeconds(result?.retryAfterSec);
        return { kind: 'wait', message: `시도가 너무 많아요. ${formatWait(retryAfterSec)} 뒤에 다시 해 주세요.`, retryAfterSec };
    }
    if (code === COMMUNITY_CODES.PHONE_CODE_INVALID) {
        const left = Math.floor(Number(result?.triesLeft));
        const tail = Number.isFinite(left) && left >= 1 ? ` (남은 횟수 ${left}번)` : '';
        return { kind: 'code', message: `인증번호가 달라요. 문자를 다시 확인해 주세요.${tail}` };
    }
    const known = LINES[code];
    if (known) return { ...known };
    const message = String(result?.message || '').trim();
    return { kind: 'other', message: message || FALLBACK_LINE };
}
