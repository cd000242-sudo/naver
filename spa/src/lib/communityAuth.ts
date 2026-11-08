/**
 * The one site login: signup, login, logout, nickname, license-code registration and the LEWORD hand-over.
 *
 * Two logins can exist in the browser, with a clear relation:
 *   community login  (communitySession.ts)  who you are on the site — the new, single login.
 *   LEWORD login     (lewordAuth.ts)        the paid product login; the LEWORD screens read only this.
 * A community login opens LEWORD only when the SERVER says so (`verify-web-login` with the community token);
 * then the LEWORD login is written in its old shape. The password is used for one request and never stored.
 */
import { callCommunity, callWithToken } from './communityApi';
import {
    clearCommunitySession, loadCommunitySession, normalizeProfile, saveCommunitySession, toCommunitySession,
    type CommunitySession,
} from './communitySession';
import { clearSession, loadSession, loginWithCommunityToken, logoutWeb, type LewordSession } from './lewordAuth';
import { describeRegisterFailure, mapLewordVerify } from './siteAuthModel.mjs';
import { describePhoneFailure, normalizeCode, normalizePhone, type PhoneFailureKind } from './phoneAuthModel.mjs';
import { COMMUNITY_ACTIONS } from './communityContract.mjs';
import { describeNicknameFailure } from './accountModel.mjs';

export type AuthOutcome =
    | { ok: true; session: CommunitySession }
    | { ok: false; code: string; message: string; kind?: PhoneFailureKind; retryAfterSec?: number };

function adopt(payload: Record<string, unknown>): AuthOutcome {
    const session = toCommunitySession(payload);
    if (!session) return { ok: false, code: 'BAD_REPLY', message: '서버 응답을 읽지 못했어요. 잠시 뒤 다시 해 주세요.' };
    // A paid LEWORD login that belongs to someone else must not outlive this login.
    const stale = loadSession();
    if (stale && stale.userId !== session.userId) clearSession();
    saveCommunitySession(session);
    return { ok: true, session };
}

/** A refusal keeps the server's words, except a taken nickname, which gets the one sentence of the site. */
const failed = (result: { code: string; message: string }): AuthOutcome => ({ ok: false, code: result.code, message: result.code === 'NICKNAME_TAKEN' ? describeNicknameFailure(result) : result.message });

/** Phone failures get one plain sentence and a `kind` the form can act on; every other refusal keeps the server's words. */
function failedSignup(result: { code: string; message: string; retryAfterSec?: unknown }): AuthOutcome {
    const phone = describePhoneFailure(result);
    return phone.kind === 'other' ? failed(result) : { ok: false, code: result.code, message: phone.message, kind: phone.kind, retryAfterSec: phone.retryAfterSec ?? 0 };
}

/** Signup needs the phone and the 6-digit code the server texted to it (one number, one account). */
export async function signupCommunity(input: { userId: string; password: string; nickname: string; phone: string; code: string }): Promise<AuthOutcome> {
    const result = await callCommunity(COMMUNITY_ACTIONS.signup, {
        userId: input.userId.trim(), password: input.password, nickname: input.nickname.trim(),
        phone: normalizePhone(input.phone), code: normalizeCode(input.code),
    });
    return result.ok ? adopt(result) : failedSignup(result);
}

/** Log in; a license account also gets its LEWORD login right away (best effort — the community login stands either way). */
export async function loginCommunity(userId: string, password: string): Promise<AuthOutcome> {
    const result = await callCommunity('community-login', { userId: userId.trim(), password });
    if (!result.ok) return failed(result);
    const outcome = adopt(result);
    if (outcome.ok && outcome.session.role !== 'community') {
        forgetLewordVerification();
        await resolveLewordAccess();
    }
    return outcome;
}

/** Forget both logins here, then tell the servers. A server that does not answer cannot keep anyone logged in. */
export async function signOutAll(): Promise<void> {
    const community = loadCommunitySession();
    const leword = loadSession();
    clearCommunitySession();
    forgetLewordVerification();
    await Promise.allSettled([
        community ? callCommunity('community-logout', { communityToken: community.communityToken }) : Promise.resolve(),
        logoutWeb(leword),
    ]);
}

/** Pull the profile again (score, grade, role). A token the server no longer knows logs the browser out. */
export async function refreshCommunityProfile(): Promise<AuthOutcome> {
    const current = loadCommunitySession();
    if (!current) return { ok: false, code: 'LOGIN_REQUIRED', message: '로그인이 필요해요.' };
    const result = await callWithToken('community-session');
    if (!result.ok) return failed(result);
    return keepToken(current, result);
}

/** Merge a fresh profile answer into the stored login (the token and its expiry stay unless the server sent new ones). */
export function keepToken(current: CommunitySession, payload: Record<string, unknown>): AuthOutcome {
    const next: CommunitySession = {
        ...current,
        ...normalizeProfile({ ...payload, userId: payload.userId || current.userId }),
        sessionExpiresAt: typeof payload.sessionExpiresAt === 'string' && payload.sessionExpiresAt ? payload.sessionExpiresAt : current.sessionExpiresAt,
    };
    saveCommunitySession(next);
    return { ok: true, session: next };
}

export async function setCommunityNickname(nickname: string): Promise<AuthOutcome> {
    const current = loadCommunitySession();
    if (!current) return { ok: false, code: 'LOGIN_REQUIRED', message: '로그인이 필요해요.' };
    const result = await callWithToken('community-set-nickname', { nickname: nickname.trim() });
    return result.ok ? keepToken(current, result) : failed(result);
}

export type LewordAccess =
    | { kind: 'ok'; session: LewordSession }
    | { kind: 'login' | 'not-activated' | 'expired' | 'blocked' | 'error'; message: string };

/** The server's "yes" is remembered for this long (per page load) so moving around the site does not re-ask every time. */
const VERIFY_TTL_MS = 5 * 60 * 1000;
let verified: { token: string; at: number } | null = null;

export function forgetLewordVerification(): void {
    verified = null;
}

/**
 * May this browser open LEWORD? Decided by the server, never by the role shown on screen:
 *   - community login → `verify-web-login` with its token (cached 5 minutes after a yes);
 *   - no community login but a LEWORD login made before the unified login existed → still honoured;
 *   - nothing → "login".
 * A "no" removes a LEWORD login that belongs to the same person; a connection failure decides nothing.
 */
export async function resolveLewordAccess(): Promise<LewordAccess> {
    const community = loadCommunitySession();
    if (!community) {
        const legacy = loadSession();
        return legacy ? { kind: 'ok', session: legacy } : { kind: 'login', message: '' };
    }
    const stored = loadSession();
    if (stored && stored.userId === community.userId && verified && verified.token === community.communityToken && Date.now() - verified.at < VERIFY_TTL_MS) {
        return { kind: 'ok', session: stored };
    }
    const { payload, session } = await loginWithCommunityToken(community.communityToken);
    const verdict = mapLewordVerify(payload);
    if (verdict.kind === 'ok' && session) {
        verified = { token: community.communityToken, at: Date.now() };
        return { kind: 'ok', session };
    }
    verified = null;
    if (verdict.kind === 'ok' || verdict.kind === 'error') {
        return { kind: 'error', message: verdict.kind === 'error' ? verdict.message : '확인하지 못했어요. 잠시 뒤 다시 해 주세요.' };
    }
    if (verdict.kind === 'login') clearCommunitySession();
    const left = loadSession();
    if (left && left.userId === community.userId) clearSession();
    return { kind: verdict.kind, message: verdict.message };
}

export type RegisterOutcome =
    | { ok: true; lewordOpen: boolean }
    | { ok: false; code: string; message: string; productName?: string };

/**
 * Register an all-in-one or LEWORD code on the logged-in account. The password is asked again (the server needs it
 * to bind the code to this account). A code of another product is refused with the app's name. On success the
 * profile is refreshed (role becomes licensed) and LEWORD is opened with the same login.
 */
export async function registerLicenseCode(code: string, password: string): Promise<RegisterOutcome> {
    const result = await callWithToken('community-register-code', { licenseCode: code.trim(), password });
    if (!result.ok) {
        const productName = typeof result.productName === 'string' ? result.productName : undefined;
        return { ok: false, code: String(result.code || ''), message: describeRegisterFailure(result), ...(productName ? { productName } : {}) };
    }
    await refreshCommunityProfile();
    forgetLewordVerification();
    const access = await resolveLewordAccess();
    return { ok: true, lewordOpen: access.kind === 'ok' };
}
