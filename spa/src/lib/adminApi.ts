import { GAS_URL, type HomeNotice, type SiteContent } from './siteOps';

const ADMIN_SESSION_KEY = 'leaderspro.admin.session.v1';

type AdminSession = {
    token: string;
    expiresAt: number;
};

type AdminResponse = {
    ok?: boolean;
    success?: boolean;
    error?: string;
    message?: string;
    valid?: boolean;
    session?: { token?: string; expiresIn?: number };
};

function responseOk(payload: AdminResponse): boolean {
    return payload.ok === true || payload.success === true;
}

function readSession(): AdminSession | null {
    try {
        const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as AdminSession;
        if (!session.token || Number(session.expiresAt) <= Date.now()) {
            sessionStorage.removeItem(ADMIN_SESSION_KEY);
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

function writeSession(token: string, expiresIn: number): void {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
        token,
        expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
    }));
}

async function post<T extends AdminResponse>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
    });
    return await response.json() as T;
}

export async function requestAdminOtp(email: string): Promise<void> {
    const payload = await post<AdminResponse>({ action: 'admin-otp-request', email: email.trim() });
    if (!responseOk(payload)) throw new Error(payload.error || payload.message || '로그인 코드를 보낼 수 없습니다.');
}

export async function loginWithAdminPassword(loginId: string, password: string): Promise<void> {
    const payload = await post<AdminResponse>({ action: 'admin-password-login', loginId: loginId.trim(), password });
    const token = payload.session?.token || '';
    if (!responseOk(payload) || !token) throw new Error(payload.error || payload.message || '아이디 또는 비밀번호가 올바르지 않습니다.');
    writeSession(token, Number(payload.session?.expiresIn || 0));
}

export async function verifyAdminOtp(email: string, code: string): Promise<void> {
    const payload = await post<AdminResponse>({ action: 'admin-otp-verify', email: email.trim(), code: code.trim() });
    const token = payload.session?.token || '';
    if (!responseOk(payload) || !token) throw new Error(payload.error || payload.message || '로그인 코드가 올바르지 않습니다.');
    writeSession(token, Number(payload.session?.expiresIn || 0));
}

export async function verifyAdminSession(): Promise<boolean> {
    const session = readSession();
    if (!session) return false;
    try {
        const payload = await post<AdminResponse>({ action: 'admin-session-status', adminSessionToken: session.token });
        if (payload.valid !== true) clearAdminSession();
        return payload.valid === true;
    } catch {
        return false;
    }
}

export async function adminPost<T extends AdminResponse>(action: string, values: Record<string, unknown> = {}): Promise<T> {
    const session = readSession();
    if (!session) throw new Error('관리자 로그인 세션이 만료되었습니다.');
    const payload = await post<T>({ action, adminSessionToken: session.token, ...values });
    if (!responseOk(payload)) throw new Error(payload.error || payload.message || '요청을 처리하지 못했습니다.');
    return payload;
}

export function clearAdminSession(): void {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

export async function logoutAdmin(): Promise<void> {
    const session = readSession();
    try {
        if (session) await post<AdminResponse>({ action: 'admin-logout', adminSessionToken: session.token });
    } finally {
        clearAdminSession();
    }
}

export async function saveSiteContent(content: SiteContent): Promise<void> {
    await adminPost('site-content-save', { content });
}

export async function saveNotice(notice: Partial<HomeNotice>): Promise<void> {
    const action = notice.id ? 'update-notice' : 'submit-notice';
    // GAS 저장 컬럼명은 preview다. 화면의 summary를 명시적으로 변환해
    // 새 공지와 수정 공지 모두 요약이 사라지지 않도록 한다.
    await adminPost(action, { ...notice, preview: notice.summary || '' });
}

export async function removeNotice(id: string): Promise<void> {
    await adminPost('delete-notice', { id });
}

export async function setAdminPasswordCredentials(loginId: string, password: string): Promise<void> {
    await adminPost('admin-password-set', { loginId: loginId.trim(), password });
}
