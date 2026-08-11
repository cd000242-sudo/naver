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
    /*
     * GAS 가 실제로 돌려주는 모양이다 — expiresAt 은 ISO 시각이고 expiresIn(초)은
     * **없다**. 예전에는 expiresIn 만 읽어서 늘 0 이 됐고, 아래 writeSession 의
     * 하한 때문에 세션이 60초 만에 끊겼다. 로그인하고 1분 뒤부터 모든 저장이
     * "세션이 만료되었습니다" 로 죽었다(2026-08-12 실사고).
     */
    session?: { token?: string; expiresIn?: number; expiresAt?: string };
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

/**
 * 만료 시각을 정한다.
 *
 * GAS 는 expiresAt(ISO)만 준다. 그걸 그대로 쓰고, 못 읽었을 때만 기본값을 쓴다.
 * 예전에는 없는 expiresIn 을 읽어 0 을 얻었고 세션이 60초짜리가 됐다.
 * 기본값도 60초가 아니라 12시간이다 — GAS 가 발급하는 수명과 같게 맞춘다.
 */
const DEFAULT_SESSION_MS = 12 * 60 * 60 * 1000;

function writeSession(token: string, session?: { expiresIn?: number; expiresAt?: string }): void {
    const fromIso = session?.expiresAt ? Date.parse(session.expiresAt) : NaN;
    const fromSeconds = Number(session?.expiresIn) > 0
        ? Date.now() + Number(session?.expiresIn) * 1000
        : NaN;
    const expiresAt = Number.isFinite(fromIso) ? fromIso
        : Number.isFinite(fromSeconds) ? fromSeconds
            : Date.now() + DEFAULT_SESSION_MS;
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token, expiresAt }));
}

async function post<T extends AdminResponse>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
    });
    return await response.json() as T;
}

/*
 * ── GAS 에 핸들러가 없는 경로 (2026-08-12 확인) ────────────────────────────
 * admin-otp-request · admin-otp-verify · admin-password-set · admin-session-status
 *
 * GAS 의 액션 89개 어디에도 없다. 부르면 Unknown action 이고, 공개 액션 목록에도
 * 없으니 그 전에 Unauthorized 로 먼저 막힌다. 지금 어떤 화면도 이 넷을 부르지
 * 않는다 — 그래서 아무도 몰랐다.
 *
 * 지우지 않고 남기되 **왜 안 되는지**를 여기 적는다. GAS 배포는 clasp 사고 이력이
 * 있어(로그인이 깨진 적이 있다) 화면 쪽 수정과 같은 회차에 건드리지 않는다.
 * 이 기능이 필요해지면 GAS 에 핸들러를 먼저 넣고 여기를 살린다.
 *
 * 비밀번호 변경은 지금도 되는 길이 있다 — GAS 스크립트 속성의
 * ADMIN_LOGIN_ID_HASH / ADMIN_LOGIN_PASSWORD_HASH 를 직접 바꾸면 된다.
 */
export async function requestAdminOtp(email: string): Promise<void> {
    const payload = await post<AdminResponse>({ action: 'admin-otp-request', email: email.trim() });
    if (!responseOk(payload)) throw new Error(payload.error || payload.message || '로그인 코드를 보낼 수 없습니다.');
}

export async function loginWithAdminPassword(loginId: string, password: string): Promise<void> {
    const payload = await post<AdminResponse>({ action: 'admin-password-login', loginId: loginId.trim(), password });
    const token = payload.session?.token || '';
    if (!responseOk(payload) || !token) throw new Error(payload.error || payload.message || '아이디 또는 비밀번호가 올바르지 않습니다.');
    writeSession(token, payload.session);
}

export async function verifyAdminOtp(email: string, code: string): Promise<void> {
    const payload = await post<AdminResponse>({ action: 'admin-otp-verify', email: email.trim(), code: code.trim() });
    const token = payload.session?.token || '';
    if (!responseOk(payload) || !token) throw new Error(payload.error || payload.message || '로그인 코드가 올바르지 않습니다.');
    writeSession(token, payload.session);
}

/**
 * 세션이 아직 쓸 수 있는가.
 *
 * **서버에 묻지 않는다.** GAS 에는 admin-session-status 핸들러가 없다(액션 89개
 * 어디에도 없어 Unknown action 으로 떨어진다). 예전 구현은 그 응답의 valid 가
 * true 가 아니면 clearAdminSession() 을 불렀으므로, **부르는 순간 관리자가 로그아웃**
 * 됐다. 지금은 아무 화면도 안 부르고 있어 드러나지 않았을 뿐이다.
 *
 * GAS 가 주는 세션은 만료 시각뿐이라 브라우저에서 확인할 수 있는 것도 그것뿐이다.
 * 서버 쪽 무효화가 필요해지면 GAS 에 핸들러를 먼저 만들고 여기를 되돌린다.
 */
export function verifyAdminSession(): boolean {
    return readSession() !== null;
}

export async function adminPost<T extends AdminResponse>(action: string, values: Record<string, unknown> = {}): Promise<T> {
    const session = readSession();
    if (!session) throw new Error('관리자 로그인 세션이 만료되었습니다.');
    /*
     * 필드 이름은 **adminToken** 이다. adminSessionToken 이 아니다.
     *
     * 2026-08-12 실사고: 어드민의 모든 저장이 조용히 죽어 있었다. 공지를 등록해도
     * 사이트에 안 뜨고, 어드민의 공지 목록도 비어 있었다(사이트는 정적 아카이브를
     * 폴백으로 보여 줘서 멀쩡해 보였다).
     *
     * 원인: GAS 는 비공개 액션 앞에서 `data.adminToken` 하나만 읽는다.
     *   const adminToken = data.adminToken || e.parameter?.adminToken || …
     *   if (normalizeAdminToken_(adminToken) !== getAdminToken()) → Unauthorized
     * 그런데 여기서는 adminSessionToken 이라는 다른 이름으로 보내고 있었다.
     * GAS 소스 전체에 adminSessionToken 은 **한 번도 안 나온다**(등장 0회).
     * 그래서 핸들러까지 가지도 못하고 전부 Unauthorized 로 반려됐다.
     *
     * 값은 처음부터 맞았다 — admin-password-login 이 돌려주는 session.token 이
     * 곧 getAdminToken() 이다. 이름만 틀렸다.
     */
    const payload = await post<T>({ action, adminToken: session.token, ...values });
    if (!responseOk(payload)) throw new Error(payload.error || payload.message || '요청을 처리하지 못했습니다.');
    return payload;
}

export function clearAdminSession(): void {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

export async function logoutAdmin(): Promise<void> {
    const session = readSession();
    try {
        if (session) await post<AdminResponse>({ action: 'admin-logout', adminToken: session.token });
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
