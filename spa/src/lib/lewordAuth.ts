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
/*
 * v2(2026-10-07 동시 로그인 막기): 웹 세션 토큰을 함께 저장한다. 판을 올려 토큰 없는 예전 로그인은 한 번 다시 로그인하게 한다
 * — 그대로 두면 같은 계정을 돌려쓰던 브라우저들이 예전 로그인으로 계속 열려 있다.
 */
const SESSION_KEY = 'leaderspro.leword.session.v2';
/** 이 브라우저의 임의 ID — 서버가 "같은 브라우저 재로그인"과 "다른 곳"을 가른다. 개인정보가 아니다. */
const DEVICE_KEY = 'leaderspro.leword.device.v1';
const TIMEOUT_MS = 20000;

export type LewordSession = {
    userId: string;
    /** ISO. null 이면 만료가 없는 라이선스(영구제). */
    expiresAt: string | null;
    licenseType: string;
    savedAt: string;
    /** 서버(webSessions 칸)가 준 웹 세션 토큰. 없으면 세션을 만들지 않는 옛 서버 — 확인(ping)을 건너뛴다. */
    webSessionToken?: string | null;
};

function getDeviceId(): string {
    try {
        const saved = localStorage.getItem(DEVICE_KEY);
        if (saved) return saved;
        const made = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
        localStorage.setItem(DEVICE_KEY, made);
        return made;
    } catch {
        // 저장이 막힌 브라우저(사생활 모드 등) — 매번 새 ID 라 다른 곳으로 보인다. 로그인 자체는 된다.
        return `b_${Date.now().toString(36)}`;
    }
}

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
        localStorage.removeItem('leaderspro.leword.session.v1');
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
        // 계정 키 동기화의 유도 키도 지운다(비밀번호 파생값) — 키 자체(localStorage)는 남는다.
        localStorage.removeItem('leaderspro.keysync.v1');
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
        webSessionToken: typeof payload.webSessionToken === 'string' && payload.webSessionToken ? payload.webSessionToken : null,
    };
}

export type WebSessionCheck = 'ok' | 'replaced' | 'expired' | 'offline';

/**
 * 웹 세션 확인(2026-10-07 동시 로그인 막기) — 화면이 몇 분마다 · 탭으로 돌아올 때 부른다.
 *   replaced : 다른 곳이 이 계정을 이어받았거나 차단 · 세션 없음 → 화면이 로그아웃시킨다
 *   expired  : 이용 기간 끝
 *   offline  : 연결 실패 · 서버 붐빔 — 로그아웃하지 않는다(잠깐 끊긴 사람을 내쫓지 않는다)
 * 토큰이 없는 세션(옛 서버가 만든 것)은 확인할 게 없어 'ok'.
 */
export async function pingWebSession(session: LewordSession): Promise<WebSessionCheck> {
    // 가장 최근에 저장된 토큰으로 묻는다 — 키 동기화가 같은 브라우저에서 다시 로그인하면 토큰이 새로 바뀐다(화면 상태는 옛 값).
    const latest = loadSession();
    const current = latest && latest.userId === session.userId ? latest : session;
    if (!current.webSessionToken) return 'ok';
    try {
        const payload = await callGas({ action: 'web-session-ping', userId: current.userId, webSessionToken: current.webSessionToken });
        if (payload.ok) return 'ok';
        const code = String(payload.code || '');
        if (code === 'LICENSE_EXPIRED') return 'expired';
        if (['SESSION_REPLACED', 'MISSING_SESSION', 'USER_BLOCKED'].includes(code)) return 'replaced';
        return 'offline';
    } catch {
        return 'offline';
    }
}

/** 로그아웃 — 서버의 웹 세션을 비워 다른 곳에서 바로 들어올 수 있게 하고, 이 브라우저 기억을 지운다. 서버가 안 받아도 지운다. */
export async function logoutWeb(session: LewordSession | null): Promise<void> {
    const current = loadSession() || session;
    clearSession();
    if (current?.webSessionToken) {
        try { await callGas({ action: 'web-logout', userId: current.userId, webSessionToken: current.webSessionToken }); } catch { /* 이미 지웠다 */ }
    }
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
        // deviceId — 서버가 다른 브라우저가 10분 안에 쓰고 있으면 ALREADY_LOGGED_IN 으로 막는다(먼저 쓰는 쪽이 이김, 2026-10-07).
        let payload = await callGas({ action: 'verify-web-login', userId, userPassword, deviceId: getDeviceId() });
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
export type PhoneActionResult = { ok: boolean; message?: string };

/**
 * 휴대폰 본인인증 — 번호 받기 / 확인.
 *
 * 데스크톱 앱은 로그인 세션으로 본인을 증명하지만(license-phone-*), 웹 로그인은
 * 세션을 만들지 않는다(그러면 그 PC 의 데스크톱 앱이 튕긴다). 그래서 웹은
 * **아이디+비밀번호**로 본인을 다시 증명하는 별도 경로(license-phone-web-*)를 쓴다.
 * 로직은 데스크톱과 같다 — 같은 시트에 번호를 등록하고, 등록되면 다음부터 인식된다.
 */
export async function requestPhoneVerifyCode(userId: string, userPassword: string, phone: string): Promise<PhoneActionResult> {
    try {
        const payload = await callGas({ action: 'license-phone-web-request', userId, userPassword, phone });
        if (!payload.ok) return { ok: false, message: String(payload.error || payload.message || '인증번호 발송에 실패했습니다.') };
        return { ok: true };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : '연결에 실패했습니다.' };
    }
}

export async function confirmPhoneVerify(userId: string, userPassword: string, phone: string, authCode: string): Promise<PhoneActionResult> {
    try {
        const payload = await callGas({ action: 'license-phone-web-confirm', userId, userPassword, phone, authCode });
        if (!payload.ok) return { ok: false, message: String(payload.error || payload.message || '본인인증에 실패했습니다.') };
        return { ok: true };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : '연결에 실패했습니다.' };
    }
}

/**
 * 비밀번호 변경 — 로그인 전에도 연다(비번을 잊은 사람은 로그인 자체를 못 한다).
 * 본인 증명은 본인인증 때 등록해 둔 번호로 오는 문자다. 세션이 필요 없어
 * 데스크톱과 같은 서버 경로(license-password-reset-*)를 웹에서 그대로 쓴다.
 */
export async function requestPasswordResetCode(userId: string, phone: string): Promise<PhoneActionResult> {
    try {
        const payload = await callGas({ action: 'license-password-reset-request', userId, phone });
        if (!payload.ok) return { ok: false, message: String(payload.error || payload.message || '인증번호 발송에 실패했습니다.') };
        return { ok: true };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : '연결에 실패했습니다.' };
    }
}

export async function confirmPasswordReset(userId: string, phone: string, authCode: string, newPassword: string): Promise<PhoneActionResult> {
    try {
        const payload = await callGas({ action: 'license-password-reset-confirm', userId, phone, authCode, newPassword });
        if (!payload.ok) return { ok: false, message: String(payload.error || payload.message || '비밀번호 변경에 실패했습니다.') };
        return { ok: true };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : '연결에 실패했습니다.' };
    }
}

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
        // 가입 · 재인증은 계정만 만든다 — 웹 세션은 로그인 경로가 만든다(토큰 없는 세션이 남지 않게, 2026-10-07).
        return login(userId, userPassword);
    } catch (error) {
        return { ok: false, code: 'NETWORK', message: error instanceof Error ? error.message : '연결에 실패했습니다.' };
    }
}
