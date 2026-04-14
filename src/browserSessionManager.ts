/**
 * 🛡️ BrowserSessionManager - 브라우저 세션 싱글톤 관리자
 * 
 * 목적:
 * - 앱 전체에서 단일 브라우저 인스턴스 유지
 * - 계정별 세션 분리 및 재사용
 * - CAPTCHA 최소화를 위한 세션 지속성
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page, Frame } from 'puppeteer';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import { getProxyUrl } from './crawler/utils/proxyManager.js';

// ✅ [2026-03-27 FIX] Stealth Plugin — 모든 evasion 모듈 명시적 활성화
// 기본 설정에서 일부 모듈(chrome.csi 등)이 비활성화되어 있을 수 있으므로 명시적으로 설정
const stealthPlugin = StealthPlugin();
// 사용 가능한 모든 evasion 활성화 확인
stealthPlugin.enabledEvasions.add('chrome.app');
stealthPlugin.enabledEvasions.add('chrome.csi');
stealthPlugin.enabledEvasions.add('chrome.loadTimes');
stealthPlugin.enabledEvasions.add('chrome.runtime');
stealthPlugin.enabledEvasions.add('defaultArgs');
stealthPlugin.enabledEvasions.add('iframe.contentWindow');
stealthPlugin.enabledEvasions.add('media.codecs');
stealthPlugin.enabledEvasions.add('navigator.hardwareConcurrency');
stealthPlugin.enabledEvasions.add('navigator.languages');
stealthPlugin.enabledEvasions.add('navigator.permissions');
stealthPlugin.enabledEvasions.add('navigator.plugins');
stealthPlugin.enabledEvasions.add('navigator.webdriver');
stealthPlugin.enabledEvasions.add('sourceurl');
stealthPlugin.enabledEvasions.add('user-agent-override');
stealthPlugin.enabledEvasions.add('webgl.vendor');
stealthPlugin.enabledEvasions.add('window.outerdimensions');
puppeteer.use(stealthPlugin);

export interface SessionInfo {
    accountId: string;
    browser: Browser;
    page: Page;
    isLoggedIn: boolean;
    loginVerifiedAt: number; // ✅ [2026-03-26] 로그인 상태가 마지막으로 확인된 시각 (TTL 방어용)
    lastActivity: number;
    createdAt: number;
    profileDir: string;
    proxyUrl: string | undefined; // ✅ [2026-03-26] 세션 생성 시 사용된 프록시 URL 추적
}

/**
 * 브라우저 세션 싱글톤 관리자
 */
class BrowserSessionManager {
    private static instance: BrowserSessionManager;

    // 계정별 세션 저장
    private sessions: Map<string, SessionInfo> = new Map();

    // 현재 활성 세션
    private activeAccountId: string | null = null;

    // 프로필 베이스 경로
    private readonly PROFILE_BASE = path.join(os.homedir(), '.naver-blog-automation', 'profiles');

    // ✅ [2026-03-23] 세션 최대 수명 4시간
    private readonly SESSION_MAX_AGE = 4 * 60 * 60 * 1000;

    // ✅ [2026-03-26] isLoggedIn 캐시 TTL — 30분 경과 시 재검증 필수
    // 네이버 서버 측 세션 만료(약 30분~1시간)에 대응
    private readonly LOGIN_CACHE_TTL = 2 * 60 * 60 * 1000; // ✅ [2026-03-27] 2시간 (30분→2시간, 연속발행 캡차 방지)

    private constructor() {
        console.log('[BrowserSessionManager] 싱글톤 인스턴스 생성됨');
    }

    /**
     * ✅ [2026-03-26] 프록시 URL 정규화 — "", null, undefined를 모두 undefined로 통일
     * 비교 시 falsy 값 차이로 인한 오탐 방지
     */
    private normalizeProxyUrl(url: string | null | undefined): string | undefined {
        if (!url || url.trim() === '') return undefined;
        return url.trim();
    }

    /**
     * 싱글톤 인스턴스 가져오기
     */
    static getInstance(): BrowserSessionManager {
        if (!BrowserSessionManager.instance) {
            BrowserSessionManager.instance = new BrowserSessionManager();
        }
        return BrowserSessionManager.instance;
    }

    /**
     * 계정 ID 해시 (프로필 폴더명 생성)
     */
    private hashAccountId(accountId: string): string {
        let hash = 0;
        for (let i = 0; i < accountId.length; i++) {
            const char = accountId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * 계정별 프로필 경로 반환
     */
    private getProfileDir(accountId: string): string {
        const hash = this.hashAccountId(accountId);
        return path.join(this.PROFILE_BASE, hash);
    }

    /**
     * 계정별 고정 프로필 정보 (CAPTCHA 방지용 일관성 유지)
     */
    private getAccountConsistentProfile(accountId: string): {
        userAgent: string | null;
        screen: { width: number; height: number };
        webGL: { vendor: string; renderer: string };
    } {
        const seed = accountId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

        // ✅ [2026-03-27 FIX] UA 하드코딩 제거 — Stealth Plugin이 실제 Chrome 버전을 자동 감지
        // 이전: 하드코딩된 Chrome 133~135 → 실제 설치된 Chrome과 불일치하여 봇 감지 유발
        // 현재: null → Stealth Plugin의 기본 UA 사용 (실제 바이너리 버전과 자동 동기화)
        const userAgent: string | null = null; // Stealth Plugin에 위임

        const screenConfigs = [
            { width: 1920, height: 1080 },
            { width: 1536, height: 864 },
            { width: 1440, height: 900 },
            { width: 1366, height: 768 }
        ];
        const screen = screenConfigs[seed % screenConfigs.length];

        const webGLConfigs = [
            { vendor: 'Intel Inc.', renderer: 'Intel Iris OpenGL Engine' },
            { vendor: 'Intel Inc.', renderer: 'Intel(R) UHD Graphics 630' },
            { vendor: 'NVIDIA Corporation', renderer: 'GeForce GTX 1060/PCIe/SSE2' },
            { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630)' },
        ];
        const webGL = webGLConfigs[seed % webGLConfigs.length];

        return { userAgent, screen, webGL };
    }

    /**
     * Chrome 실행 파일 찾기
     */
    private findChromeExecutable(): string | null {
        const possiblePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
        ];

        for (const chromePath of possiblePaths) {
            try {
                if (require('fs').existsSync(chromePath)) {
                    return chromePath;
                }
            } catch { }
        }
        return null;
    }

    /**
     * 세션 가져오기 또는 생성
     */
    async getOrCreateSession(accountId: string, headless: boolean = false, accountProxyUrl?: string): Promise<SessionInfo> {
        // ✅ [2026-03-26] 현재 프록시 설정 확인 + 정규화 ("", null, undefined → undefined로 통일)
        const currentProxyUrl = this.normalizeProxyUrl(accountProxyUrl || await getProxyUrl());

        // 이미 존재하는 세션 반환
        const existingSession = this.sessions.get(accountId);
        if (existingSession) {
            // ✅ [2026-03-26 FIX] 프록시 변경 감지 — Chrome은 launch 시 --proxy-server가 고정되므로,
            // 프록시가 변경되면 (켜기→끄기, 끄기→켜기, 서버 변경) 세션을 폐기하고 새 Chrome을 시작해야 함.
            if (existingSession.proxyUrl !== currentProxyUrl) {
                const oldProxy = existingSession.proxyUrl ? existingSession.proxyUrl.replace(/:[^:]+@/, ':***@') : '(없음)';
                const newProxy = currentProxyUrl ? currentProxyUrl.replace(/:[^:]+@/, ':***@') : '(없음)';
                console.log(`[BrowserSessionManager] 🔄 프록시 변경 감지! ${oldProxy} → ${newProxy}`);
                console.log(`[BrowserSessionManager] 🔄 기존 세션 폐기 후 새 Chrome으로 재시작합니다...`);
                await this.closeSession(accountId);
                // fall through → 아래 새 세션 생성으로 진행
            } else {
                // 브라우저 연결 상태 확인
                try {
                    if (existingSession.browser.isConnected()) {
                        const sessionAge = Date.now() - existingSession.createdAt;
                        if (sessionAge > this.SESSION_MAX_AGE) {
                            console.log(`[BrowserSessionManager] ⏰ 세션 수명 초과 (${Math.floor(sessionAge / 60000)}분), 재생성...`);
                            await this.closeSession(accountId);
                        } else {
                            console.log(`[BrowserSessionManager] ✅ 기존 세션 재사용: ${accountId.substring(0, 3)}*** (수명: ${Math.floor(sessionAge / 60000)}분)`);
                            existingSession.lastActivity = Date.now();
                            this.activeAccountId = accountId;

                            // ✅ [2026-03-26] 발행 후 최소화된 창 자동 복원
                            await this.restoreWindow(accountId);

                            return existingSession;
                        }
                    }
                } catch {
                    console.log(`[BrowserSessionManager] ⚠️ 기존 세션 연결 끊김, 재생성...`);
                }
                // 연결 끊긴/수명 초과 세션 제거
                this.sessions.delete(accountId);
            }
        }

        // 새 세션 생성
        console.log(`[BrowserSessionManager] 🚀 새 세션 생성: ${accountId.substring(0, 3)}***`);

        const profileDir = this.getProfileDir(accountId);
        await fs.mkdir(profileDir, { recursive: true });

        // ✅ [2026-02-17 FIX] Chrome Preferences 파일에서 비밀번호 매니저 비활성화
        // --disable-save-password-bubble 플래그가 최신 Chrome에서 작동하지 않으므로
        // 프로필 Preferences 파일을 직접 수정하여 비밀번호 저장을 완전히 차단
        await this.ensurePasswordManagerDisabled(profileDir);

        const profile = this.getAccountConsistentProfile(accountId);
        const chromeExecutablePath = this.findChromeExecutable();

        // ✅ [2026-03-26] currentProxyUrl은 함수 상단에서 이미 resolve됨 (중복 호출 방지)
        const proxyUrl = currentProxyUrl;
        let proxyAuth: { username: string; password: string } | null = null;
        const launchArgs = [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                `--window-size=${profile.screen.width},${profile.screen.height}`,
                '--start-maximized',
                '--window-position=0,0',
                '--disable-features=IsolateOrigins,site-per-process,PasswordManager,ThirdPartyCookieBlocking,SameSiteByDefaultCookies',
                // ✅ [2026-03-27 FIX] --disable-web-security 제거 — JS로 감지 가능한 봇 footprint
                // ✅ [2026-03-27 FIX] --disable-site-isolation-trials 제거 — 일반 Chrome과 다른 보안 설정
                // ✅ [2026-03-27 FIX] --disable-gpu 제거 — WebGL 스푸핑(GTX 1060 등)과 논리적 모순
                // ✅ [2026-03-27 FIX] --disable-extensions 제거 — 일반 사용자도 확장 프로그램을 사용함
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-default-browser-check',
                // ✅ [2026-02-08] 비밀번호 저장 팝업 비활성화
                '--disable-save-password-bubble',
                '--disable-component-update',
                // ✅ [2026-02-17 FIX] OS 키체인 대신 기본 저장소 사용
                '--password-store=basic',
        ];

        // ✅ [2026-03-22] 프록시 서버 인자 추가 (SmartProxy 인증 분리 처리)
        if (proxyUrl) {
            try {
                const parsedProxy = new URL(proxyUrl);
                const proxyServer = `${parsedProxy.protocol}//${parsedProxy.hostname}:${parsedProxy.port}`;
                launchArgs.push(`--proxy-server=${proxyServer}`);
                if (parsedProxy.username) {
                    proxyAuth = {
                        username: decodeURIComponent(parsedProxy.username),
                        password: decodeURIComponent(parsedProxy.password),
                    };
                }
                console.log(`[BrowserSessionManager] 🌐 프록시 적용: ${proxyServer}`);
            } catch {
                // URL 파싱 실패 시 raw --proxy-server
                launchArgs.push(`--proxy-server=${proxyUrl}`);
                console.log(`[BrowserSessionManager] 🌐 프록시 적용 (raw): ${proxyUrl.replace(/:[^:]+@/, ':***@')}`);
            }
        }

        const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
            headless,
            userDataDir: profileDir,
            protocolTimeout: 300000,
            args: launchArgs,
            ignoreDefaultArgs: ['--enable-automation'],
        };

        if (chromeExecutablePath) {
            launchOptions.executablePath = chromeExecutablePath;
        }

        const browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        // ✅ [v1.4.54] 진단 버퍼 연결 — 실패 시 자동 덤프용 console/network 수집
        try {
            const { attachDiagnostics } = await import('./debug/diagnosticsBuffer.js');
            attachDiagnostics(page);
        } catch (e) {
            console.warn('[BrowserSessionManager] 진단 버퍼 연결 실패:', (e as Error).message);
        }

        // 기본 탭 정리
        const pages = await browser.pages();
        for (const p of pages) {
            if (p !== page) {
                await p.close().catch(() => { });
            }
        }

        // ✅ [2026-03-22 FIX] 프록시 인증 적용 (page.authenticate)
        if (proxyAuth) {
            await page.authenticate(proxyAuth);
            console.log(`[BrowserSessionManager] 🔐 프록시 인증 설정 완료 (user: ${proxyAuth.username.substring(0, 5)}...)`);
        }

        // ✅ [2026-03-27 FIX] UA: Stealth Plugin 기본값 사용 시 setUserAgent 스킵
        if (profile.userAgent) {
          await page.setUserAgent(profile.userAgent);
        }
        // 언어 설정은 유지 (한국어 사이트 접근)
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        });

        await page.setViewport({
            width: profile.screen.width,
            height: profile.screen.height - 100,
            deviceScaleFactor: 1,
        });

        // ✅ [2026-03-27 FIX] 최소 Stealth 보조 — window.chrome 오버라이드 제거됨
        // 이전: window.chrome을 불완전하게 직접 정의 → Stealth Plugin과 충돌하여 독특한 fingerprint 생성
        // 현재: webdriver 제거 + 언어/플랫폼/하드웨어 정보만 설정, 나머지는 Stealth Plugin에 위임
        await page.evaluateOnNewDocument((hw: any) => {
            // navigator.webdriver 제거 (Stealth Plugin과 함께 이중 방어)
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
            // 기본 환경 정보 (한국어 환경 일관성)
            Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
            // ✅ WebGL 스푸핑 유지 (GPU 활성화 상태이므로 모순 없음)
            const webGL = hw.webGL;
            const getParameterOriginal = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
                if (parameter === 37445) return webGL.vendor;
                if (parameter === 37446) return webGL.renderer;
                return getParameterOriginal.call(this, parameter);
            };
        }, profile);

        const sessionInfo: SessionInfo = {
            accountId,
            browser,
            page,
            isLoggedIn: false,
            loginVerifiedAt: 0,
            lastActivity: Date.now(),
            createdAt: Date.now(),
            profileDir,
            proxyUrl: currentProxyUrl,
        };

        this.sessions.set(accountId, sessionInfo);
        this.activeAccountId = accountId;

        console.log(`[BrowserSessionManager] ✅ 새 세션 생성 완료: ${accountId.substring(0, 3)}***`);

        // ✅ [2026-04-01 FIX] 새 세션 생성 직후 CDP로 창 최대화 강제
        // --start-maximized가 모든 환경에서 작동하지 않을 수 있으므로 CDP로 이중 보장
        try {
            const client = await page.target().createCDPSession();
            const { windowId } = await client.send('Browser.getWindowForTarget') as { windowId: number };
            await client.send('Browser.setWindowBounds', {
                windowId,
                bounds: { windowState: 'maximized' }
            });
            await client.detach();
            console.log(`[BrowserSessionManager] 🗖️ 창 최대화 적용 완료`);
        } catch (maxErr) {
            console.warn(`[BrowserSessionManager] ⚠️ 창 최대화 실패 (무시):`, (maxErr as Error).message);
        }

        return sessionInfo;
    }

    /**
     * 현재 활성 세션 가져오기
     */
    getActiveSession(): SessionInfo | null {
        if (!this.activeAccountId) return null;
        return this.sessions.get(this.activeAccountId) || null;
    }

    /**
     * 로그인 상태 업데이트
     */
    setLoggedIn(accountId: string, isLoggedIn: boolean): void {
        const session = this.sessions.get(accountId);
        if (session) {
            session.isLoggedIn = isLoggedIn;
            session.loginVerifiedAt = isLoggedIn ? Date.now() : 0; // ✅ TTL 기준점 기록
            session.lastActivity = Date.now();
            console.log(`[BrowserSessionManager] 로그인 상태 업데이트: ${accountId.substring(0, 3)}*** → ${isLoggedIn ? '✅ 로그인됨' : '❌ 로그아웃'}`);
        }
    }

    /**
     * ✅ [2026-03-26] 계정 로그인 상태 조회 (TTL 방어 포함)
     * 로그인 성공 후 LOGIN_CACHE_TTL(30분) 이내면 true, 초과하면 false 반환하여 재검증 트리거
     */
    isAccountLoggedIn(accountId: string): boolean {
        const session = this.sessions.get(accountId);
        if (!session?.isLoggedIn) return false;

        // ✅ TTL 방어: loginVerifiedAt으로부터 30분 초과 시 재검증 필요
        const elapsed = Date.now() - session.loginVerifiedAt;
        if (elapsed > this.LOGIN_CACHE_TTL) {
            console.log(`[BrowserSessionManager] ⏰ 로그인 캐시 TTL 초과 (${Math.floor(elapsed / 60000)}분 경과), 재검증 필요`);
            return false; // checkLoginStatus()로 실제 네이버 세션 확인 필요
        }
        return true;
    }

    /**
     * ✅ [2026-04-02 FIX] Win32 ShowWindow(SW_SHOW)로 숨겨진 창 복원
     * SW_HIDE 상태에서 복원 + CDP 최대화
     */
    async restoreWindow(accountId: string): Promise<void> {
        const session = this.sessions.get(accountId);
        if (!session?.browser) return;
        try {
            const pid = session.browser.process()?.pid;
            if (!pid) return;

            // Win32 ShowWindow(SW_SHOW = 5)
            // ✅ [2026-04-02] -EncodedCommand Base64 방식 (escaping 문제 완전 회피)
            const { execSync } = require('child_process');
            const psScript = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);' -Name WinApi -Namespace ShowBrowser -EA SilentlyContinue; Get-Process -Id ${pid} -EA SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | ForEach-Object { [ShowBrowser.WinApi]::ShowWindow($_.MainWindowHandle, 5) }`;
            const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
            execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { stdio: 'ignore', timeout: 8000 });

            // CDP 최대화
            if (session.page) {
                const client = await session.page.target().createCDPSession();
                const { windowId } = await client.send('Browser.getWindowForTarget') as { windowId: number };
                await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
                await new Promise(r => setTimeout(r, 100));
                await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } });
                await client.detach();
            }

            console.log(`[BrowserSessionManager] 👁️ 창 복원 + 최대화: ${accountId.substring(0, 3)}***`);
        } catch {
            // 복원 실패 시 무시 — 새 브라우저 실행으로 자동 해결됨
        }
    }

    /**
     * 특정 계정 세션 종료
     */
    async closeSession(accountId: string): Promise<void> {
        const session = this.sessions.get(accountId);
        if (session) {
            try {
                await session.browser.close();
                console.log(`[BrowserSessionManager] 🔚 세션 종료: ${accountId.substring(0, 3)}***`);
            } catch (e) {
                console.log(`[BrowserSessionManager] ⚠️ 세션 종료 중 오류: ${(e as Error).message}`);
            }
            this.sessions.delete(accountId);
            if (this.activeAccountId === accountId) {
                this.activeAccountId = null;
            }
        }
    }

    /**
     * 모든 세션 종료 (앱 종료 시)
     */
    async closeAllSessions(): Promise<void> {
        console.log(`[BrowserSessionManager] 🔚 모든 세션 종료 시작 (${this.sessions.size}개)...`);

        const closePromises: Promise<void>[] = [];
        for (const [accountId, session] of this.sessions) {
            closePromises.push(
                session.browser.close()
                    .then(() => console.log(`[BrowserSessionManager] ✅ ${accountId.substring(0, 3)}*** 세션 종료됨`))
                    .catch((e) => console.log(`[BrowserSessionManager] ⚠️ ${accountId.substring(0, 3)}*** 세션 종료 실패: ${(e as Error).message}`))
            );
        }

        await Promise.all(closePromises);
        this.sessions.clear();
        this.activeAccountId = null;

        console.log(`[BrowserSessionManager] ✅ 모든 세션 종료 완료`);
    }

    /**
     * 계정 전환
     */
    async switchAccount(newAccountId: string, headless: boolean = false): Promise<SessionInfo> {
        console.log(`[BrowserSessionManager] 🔄 계정 전환: ${this.activeAccountId?.substring(0, 3) || 'none'}*** → ${newAccountId.substring(0, 3)}***`);

        // 새 계정 세션 가져오기 (기존 세션은 유지)
        return this.getOrCreateSession(newAccountId, headless);
    }

    /**
     * 세션 통계
     */
    getStats(): { totalSessions: number; activeAccount: string | null } {
        return {
            totalSessions: this.sessions.size,
            activeAccount: this.activeAccountId,
        };
    }

    /**
     * ✅ [2026-02-17 FIX] Chrome Preferences 파일을 수정하여 비밀번호 매니저 완전 비활성화
     * --disable-save-password-bubble 플래그가 최신 Chrome에서 작동하지 않으므로
     * 프로필 디렉토리의 Preferences 파일을 직접 수정하여 비밀번호 저장 프롬프트를 차단
     */
    private async ensurePasswordManagerDisabled(profileDir: string): Promise<void> {
        try {
            const defaultDir = path.join(profileDir, 'Default');
            await fs.mkdir(defaultDir, { recursive: true });

            const prefsPath = path.join(defaultDir, 'Preferences');
            let prefs: any = {};

            // 기존 Preferences 파일이 있으면 읽기
            try {
                const existingPrefs = await fs.readFile(prefsPath, 'utf-8');
                prefs = JSON.parse(existingPrefs);
            } catch {
                // 파일이 없거나 파싱 실패 시 빈 객체로 시작
            }

            // 비밀번호 매니저 관련 설정 비활성화
            const needsUpdate =
                prefs.credentials_enable_service !== false ||
                prefs.profile?.password_manager_enabled !== false;

            if (needsUpdate) {

                prefs.credentials_enable_service = false;
                prefs.credentials_enable_autosignin = false;

                if (!prefs.profile) prefs.profile = {};
                prefs.profile.password_manager_enabled = false;

                if (!prefs.password_manager) prefs.password_manager = {};
                prefs.password_manager.leak_detection = false;

                await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');
                console.log('[BrowserSessionManager] 🔒 비밀번호 매니저 비활성화 완료 (Preferences 파일 수정)');
            }
        } catch (err) {
            console.warn('[BrowserSessionManager] ⚠️ Preferences 파일 수정 실패 (무시):', (err as Error).message);
        }
    }
}

// 싱글톤 인스턴스 export
export const browserSessionManager = BrowserSessionManager.getInstance();

export default browserSessionManager;
