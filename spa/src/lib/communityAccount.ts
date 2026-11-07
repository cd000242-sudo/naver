/**
 * Member-account calls for the sign-up phone step and the /me page: send / confirm a phone code, the full profile,
 * my posts, password change and password recovery. Every function answers with a plain object (never throws), and
 * keeps nothing but the community token in the browser — no password, no code, no phone number.
 */
import { callCommunity, callWithToken } from './communityApi';
import { keepToken } from './communityAuth';
import { describeResetFailure, describePasswordFailure, validateResetRequest } from './accountModel.mjs';
import { COMMUNITY_ACTIONS, COMMUNITY_CODES } from './communityContract.mjs';
import { normalizePosts, type PostItem } from './communityData';
import { loadCommunitySession, normalizeProfile, type CommunityProfile } from './communitySession';
import {
    describePhoneFailure, normalizeCode, normalizePhone, validatePhone, waitSeconds, type PhoneFailureKind,
} from './phoneAuthModel.mjs';

const DEFAULT_RESEND_SEC = 60;
const DEFAULT_EXPIRES_SEC = 180;

type Raw = { code: string; message: string; [extra: string]: unknown };
export type Failure = { ok: false; code: string; message: string };
export type PhoneFailure = Failure & { kind: PhoneFailureKind; retryAfterSec: number };

export type SendCodeOutcome =
    | { ok: true; resendAfterSec: number; expiresInSec?: number }
    | PhoneFailure;

function phoneFailure(result: Raw): PhoneFailure {
    const described = describePhoneFailure(result);
    return { ok: false, code: result.code, message: described.message, kind: described.kind, retryAfterSec: described.retryAfterSec ?? 0 };
}

function badNumber(message: string): PhoneFailure {
    return { ok: false, code: COMMUNITY_CODES.PHONE_INVALID, message, kind: 'phone', retryAfterSec: 0 };
}

function sendOutcome(result: ({ ok: true } & Record<string, unknown>) | (Raw & { ok: false })): SendCodeOutcome {
    if (!result.ok) return phoneFailure(result);
    return {
        ok: true,
        expiresInSec: waitSeconds(result.expiresInSec, DEFAULT_EXPIRES_SEC),
        resendAfterSec: waitSeconds(result.resendAfterSec, DEFAULT_RESEND_SEC),
    };
}

/** Sign-up step 1: text a code to the number. No login exists yet, so no token is sent. */
export async function sendSignupCode(phone: string): Promise<SendCodeOutcome> {
    const problem = validatePhone(phone);
    if (problem) return badNumber(problem);
    return sendOutcome(await callCommunity(COMMUNITY_ACTIONS.signupSendCode, { phone: normalizePhone(phone) }) as never);
}

/** A logged-in member without a verified number asks for a code. */
export async function sendVerifyCode(phone: string): Promise<SendCodeOutcome> {
    const problem = validatePhone(phone);
    if (problem) return badNumber(problem);
    return sendOutcome(await callWithToken(COMMUNITY_ACTIONS.verifyPhoneSend, { phone: normalizePhone(phone) }) as never);
}

export type ProfileDetail = CommunityProfile & {
    phoneVerified: boolean;
    /** The server's masked form (010-****-5678); the full number is never sent back. */
    phoneMasked: string;
    createdAt: string;
};
export type DetailOutcome = { ok: true; detail: ProfileDetail } | Failure;

const plain = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');

export function normalizeDetail(payload: Record<string, unknown>): ProfileDetail {
    return {
        ...normalizeProfile(payload),
        phoneVerified: payload.phoneVerified === true,
        phoneMasked: plain(payload.phoneMasked, 24),
        createdAt: plain(payload.createdAt, 40),
    };
}

/** Take a profile answer into the stored login (score, grade, role) and hand back the full detail for the page. */
function takeProfile(payload: Record<string, unknown>): DetailOutcome {
    const current = loadCommunitySession();
    if (!current) return { ok: false, code: COMMUNITY_CODES.LOGIN_REQUIRED, message: '로그인이 필요해요.' };
    keepToken(current, payload);
    return { ok: true, detail: normalizeDetail({ ...payload, userId: payload.userId || current.userId }) };
}

export async function fetchProfileDetail(): Promise<DetailOutcome> {
    const result = await callWithToken(COMMUNITY_ACTIONS.profile);
    return result.ok ? takeProfile(result) : { ok: false, code: result.code, message: result.message };
}

/** Verify the number of an existing member. A wrong code or a number used elsewhere comes back with a `kind`. */
export async function confirmVerifyPhone(phone: string, code: string): Promise<{ ok: true; detail: ProfileDetail } | PhoneFailure> {
    const result = await callWithToken(COMMUNITY_ACTIONS.verifyPhoneConfirm, { phone: normalizePhone(phone), code: normalizeCode(code) });
    if (!result.ok) return phoneFailure(result);
    const taken = takeProfile(result);
    return taken.ok ? taken : { ...taken, kind: 'other', retryAfterSec: 0 };
}

export type MyPostsOutcome =
    | { ok: true; posts: PostItem[]; page: number; totalPages: number; total: number }
    | Failure;

const whole = (value: unknown, fallback: number, min: number): number => {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= min ? number : fallback;
};

export async function listMyPosts(page: number, pageSize = 10): Promise<MyPostsOutcome> {
    const result = await callWithToken(COMMUNITY_ACTIONS.myPosts, { page, pageSize });
    if (!result.ok) return { ok: false, code: result.code, message: result.message };
    return {
        ok: true,
        posts: normalizePosts(result.posts),
        page: whole(result.page, page, 1),
        totalPages: whole(result.totalPages, 1, 1),
        total: whole(result.total, 0, 0),
    };
}

export type PasswordOutcome = { ok: true } | (Failure & { license: boolean });

/** Community members change the password here. A license account is told to use the login screen instead (`license`). */
export async function changeMyPassword(input: { currentPassword: string; newPassword: string }): Promise<PasswordOutcome> {
    const result = await callWithToken(COMMUNITY_ACTIONS.changePassword, { currentPassword: input.currentPassword, newPassword: input.newPassword });
    if (result.ok) return { ok: true };
    const described = describePasswordFailure(result);
    return { ok: false, code: result.code, message: described.message, license: described.license };
}

export type ResetSendOutcome = SendCodeOutcome;
export type ResetConfirmOutcome = { ok: true } | (Failure & { kind: string; license: boolean; retryAfterSec: number });

/** Recovery step 1. The server answers the same for an unknown id, so success never proves the id exists. */
export async function sendResetCode(input: { userId: string; phone: string }): Promise<ResetSendOutcome> {
    const problem = validateResetRequest(input);
    if (problem) {
        return input.userId.trim()
            ? badNumber(problem)
            : { ok: false, code: 'USER_ID_REQUIRED', message: problem, kind: 'other', retryAfterSec: 0 };
    }
    const result = await callCommunity(COMMUNITY_ACTIONS.resetSendCode, { userId: input.userId.trim(), phone: normalizePhone(input.phone) });
    return result.ok ? { ok: true, resendAfterSec: waitSeconds(result.resendAfterSec, DEFAULT_RESEND_SEC) } : phoneFailure(result);
}

/** Recovery step 2: the code from the text plus the new password. */
export async function confirmReset(input: { userId: string; phone: string; code: string; newPassword: string }): Promise<ResetConfirmOutcome> {
    const result = await callCommunity(COMMUNITY_ACTIONS.resetConfirm, {
        userId: input.userId.trim(), phone: normalizePhone(input.phone), code: normalizeCode(input.code), newPassword: input.newPassword,
    });
    if (result.ok) return { ok: true };
    const described = describeResetFailure(result);
    const retryAfterSec = 'retryAfterSec' in described && typeof described.retryAfterSec === 'number' ? described.retryAfterSec : 0;
    return { ok: false, code: result.code, message: described.message, kind: described.kind, license: described.license, retryAfterSec };
}
