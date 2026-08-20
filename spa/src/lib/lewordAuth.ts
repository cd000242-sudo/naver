/**
 * LEWORD 로그인 — 라이선스 코드에 묶인 계정.
 *
 * 백엔드는 이미 있던 것을 그대로 쓴다(앱과 같은 시트·같은 계정):
 *   register          라이선스 코드 + 아이디 + 비밀번호 → 계정 생성
 *   verify-web-login  아이디 + 비밀번호 → 만료일 확인 (세션을 만들지 않는다)
 *
 * `verify-credentials` 를 쓰지 않는 이유: 그건 성공할 때마다 세션 토큰을
 * 덮어써서, 사이트에서 로그인하면 데스크톱 앱이 튕겨 나간다. 사이트는 확인만
 * 하고 아무것도 쓰지 않는 경로를 쓴다.
 *
 * 브라우저에 남기는 것은 아이디와 만료일뿐이다. **비밀번호는 저장하지 않는다.**
 */
import { GAS_URL } from './siteOps';

/** 라이선스 시트가 플랫폼을 가리는 데 쓰는 값. 앱과 같은 것을 보내야 같은 계정이다. */
const APP_ID = 'com.leword.keyword.master';
const SESSION_KEY = 'leaderspro.leword.session.v1';
const TIMEOUT_MS = 20000;

export type LewordSession = {
    userId: string;
    /** ISO. null 이면 만료가 없는 라이선스(영구제). */
    expiresAt: string | null;
    licenseType: string;
    savedAt: string;
};

export type AuthResult =
    | { ok: true; session: LewordSession }
    | { ok: false; code: string; message: string; expiresAt?: string | null };

/** 만료됐나. 만료일이 없으면(영구제) 언제까지나 유효하다. */
export function isExpired(session: Pick<LewordSession, 'expiresAt'>): boolean {
    if (!session.expiresAt) return false;
    const at = new Date(session.expiresAt).getTime();
    return Number.isFinite(at) && at <= Date.now();
}

/** 남은 일수. 만료일이 없으면 null. */
export function daysLeft(session: Pick<LewordSession, 'expiresAt'>): number | null {
    if (!session.expiresAt) return null;
    const at = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(at)) return null;
    return Math.ceil((at - Date.now()) / 86400000);
}

/**
 * 저장된 세션. 만료가 지났으면 스스로 지운다 —
 * "기간 다 되면 알아서 로그인 안 되게"(사장님 2026-08-20).
 */
export function loadSession(): LewordSession | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as LewordSession;
        if (!session?.userId) return null;
        if (isExpired(session)) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

function saveSession(session: LewordSession): void {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
        // 저장이 안 돼도 이번 화면은 열려 있어야 한다.
    }
}

export function clearSession(): void {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch {
        // 계속
    }
}

/**
 * GAS 는 한도·점검 때 200 + HTML 을 준다. 그대로 .json() 하면
 * "Unexpected token '<'" 가 로그인 화면까지 올라온다 — 사람 말로 바꾼다.
 */
async function callGas(body: Record<string, string>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ ...body, appId: APP_ID }),
            cache: 'no-store',
            signal: controller.signal,
        });
        const raw = await response.text();
        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch {
            throw new Error('서버가 잠시 붐빕니다. 몇 초 뒤 다시 시도해 주세요.');
        }
    } finally {
        window.clearTimeout(timer);
    }
}

function toSession(payload: Record<string, unknown>, userId: string): LewordSession {
    return {
        userId,
        expiresAt: (payload.expiresAt as string) || null,
        licenseType: String(payload.licenseType || ''),
        savedAt: new Date().toISOString(),
    };
}

function toFailure(payload: Record<string, unknown>): AuthResult {
    return {
        ok: false,
        code: String(payload.code || payload.error || 'UNKNOWN'),
        message: String(payload.message || payload.error || '처리하지 못했습니다.'),
        expiresAt: (payload.expiresAt as string) || null,
    };
}

/**
 * 로그인. 만료됐으면 LICENSE_EXPIRED 로 돌아온다 — 화면이 재인증으로 넘긴다.
 *
 * verify-web-login 이 아직 배포되지 않은 서버에서는 'Unauthorized' 가 온다
 * (그 액션이 공개 목록에 없으면 토큰을 요구한다). 그때만 예전 경로로 내려간다 —
 * 배포가 늦었다고 아무도 로그인 못 하게 두는 것보다 낫다.
 *
 * 다만 예전 경로(verify-credentials)는 세션 토큰을 덮어써서 **그 PC 의 데스크톱
 * 앱이 로그아웃된다.** 그래서 폴백일 뿐이고, 서버가 갱신되면 스스로 안 쓰인다.
 */
export async function login(userId: string, userPassword: string): Promise<AuthResult> {
    try {
        let payload = await callGas({ action: 'verify-web-login', userId, userPassword });
        if (String(payload.error || '') === 'Unauthorized') {
            payload = await callGas({ action: 'verify-credentials', userId, userPassword });
        }
        if (!payload.ok || !payload.valid) return toFailure(payload);
        const session = toSession(payload, userId);
        saveSession(session);
        return { ok: true, session };
    } catch (error) {
        return { ok: false, code: 'NETWORK', message: error instanceof Error ? error.message : '연결에 실패했습니다.' };
    }
}

/**
 * 계정 만들기 · 라이선스 재인증 — 같은 경로다.
 *
 * 기간이 끝난 사람이 새 코드를 넣는 것도 이것으로 처리된다. 아이디·비밀번호를
 * 그대로 넣으면 같은 계정에 새 코드가 붙고, 저장해 둔 작업 기록이 살아남는다.
 */
export async function registerWithLicense(
    userId: string,
    userPassword: string,
    licenseCode: string,
    email: string,
): Promise<AuthResult> {
    try {
        const payload = await callGas({
            action: 'register',
            userId,
            userPassword,
            licenseCode: licenseCode.trim(),
            // 인증하지 않는다 — 비밀번호를 잊었을 때 되찾을 통로로만 받아 둔다.
            email: email.trim(),
        });
        if (!payload.ok || !payload.valid) return toFailure(payload);
        const session = toSession(payload, userId);
        saveSession(session);
        return { ok: true, session };
    } catch (error) {
        return { ok: false, code: 'NETWORK', message: error instanceof Error ? error.message : '연결에 실패했습니다.' };
    }
}
