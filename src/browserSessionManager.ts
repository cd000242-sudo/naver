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

// Stealth Plugin 적용
puppeteer.use(StealthPlugin());

export interface SessionInfo {
    accountId: string;
    browser: Browser;
    page: Page;
    isLoggedIn: boolean;
    lastActivity: number;
    createdAt: number; // ✅ [Stability] 세션 생성 시간 추가
    profileDir: string;
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

    // ✅ [Stability] 세션 최대 수명 (1시간) - 장시간 실행 시 자동 재시작
    private readonly SESSION_MAX_AGE = 60 * 60 * 1000; // 1시간

    private constructor() {
        console.log('[BrowserSessionManager] 싱글톤 인스턴스 생성됨');
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
        userAgent: string;
        screen: { width: number; height: number };
        webGL: { vendor: string; renderer: string };
    } {
        const seed = accountId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

        const chromeVersions = ['128.0.0.0', '129.0.0.0', '130.0.0.0', '131.0.0.0'];
        const version = chromeVersions[seed % chromeVersions.length];
        const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

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
    async getOrCreateSession(accountId: string, headless: boolean = false): Promise<SessionInfo> {
        // 이미 존재하는 세션 반환
        const existingSession = this.sessions.get(accountId);
        if (existingSession) {
            // 브라우저 연결 상태 확인
            try {
                if (existingSession.browser.isConnected()) {
                    // ✅ [Stability] 세션 수명 확인 - 1시간 초과 시 재시작
                    const sessionAge = Date.now() - existingSession.createdAt;
                    if (sessionAge > this.SESSION_MAX_AGE) {
                        console.log(`[BrowserSessionManager] ⏰ 세션 수명 초과 (${Math.floor(sessionAge / 60000)}분), 재생성...`);
                        await this.closeSession(accountId);
                    } else {
                        console.log(`[BrowserSessionManager] ✅ 기존 세션 재사용: ${accountId.substring(0, 3)}*** (수명: ${Math.floor(sessionAge / 60000)}분)`);
                        existingSession.lastActivity = Date.now();
                        this.activeAccountId = accountId;
                        return existingSession;
                    }
                }
            } catch {
                console.log(`[BrowserSessionManager] ⚠️ 기존 세션 연결 끊김, 재생성...`);
            }
            // 연결 끊긴 세션 제거
            this.sessions.delete(accountId);
        }

        // 새 세션 생성
        console.log(`[BrowserSessionManager] 🚀 새 세션 생성: ${accountId.substring(0, 3)}***`);

        const profileDir = this.getProfileDir(accountId);
        await fs.mkdir(profileDir, { recursive: true });

        const profile = this.getAccountConsistentProfile(accountId);
        const chromeExecutablePath = this.findChromeExecutable();

        const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
            headless,
            userDataDir: profileDir,
            protocolTimeout: 300000,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                `--window-size=${profile.screen.width},${profile.screen.height}`,
                '--disable-features=IsolateOrigins,site-per-process,PasswordManager',
                '--disable-web-security',
                '--disable-features=ThirdPartyCookieBlocking,SameSiteByDefaultCookies',
                '--disable-site-isolation-trials',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--no-first-run',
                '--no-default-browser-check',
                // ✅ [2026-02-08] 비밀번호 저장 팝업 비활성화 (기기등록 자동 바이패스 방해 방지)
                '--disable-save-password-bubble',
                '--disable-component-update',
            ],
            ignoreDefaultArgs: ['--enable-automation'],
        };

        if (chromeExecutablePath) {
            launchOptions.executablePath = chromeExecutablePath;
        }

        const browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        // 기본 탭 정리
        const pages = await browser.pages();
        for (const p of pages) {
            if (p !== page) {
                await p.close().catch(() => { });
            }
        }

        // User-Agent 및 언어 설정
        await page.setUserAgent(profile.userAgent);
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        });

        await page.setViewport({
            width: profile.screen.width,
            height: profile.screen.height - 100,
            deviceScaleFactor: 1,
        });

        // Stealth 스크립트 주입
        await page.evaluateOnNewDocument((hw: any) => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
            (window as any).chrome = {
                runtime: { id: undefined, onConnect: { addListener: () => { } }, onMessage: { addListener: () => { } } },
                loadTimes: () => ({}),
                csi: () => ({}),
                app: { isInstalled: false }
            };
            Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

            // WebGL 정보
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
            lastActivity: Date.now(),
            createdAt: Date.now(), // ✅ [Stability] 세션 생성 시간
            profileDir,
        };

        this.sessions.set(accountId, sessionInfo);
        this.activeAccountId = accountId;

        console.log(`[BrowserSessionManager] ✅ 새 세션 생성 완료: ${accountId.substring(0, 3)}***`);
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
            session.lastActivity = Date.now();
            console.log(`[BrowserSessionManager] 로그인 상태 업데이트: ${accountId.substring(0, 3)}*** → ${isLoggedIn ? '✅ 로그인됨' : '❌ 로그아웃'}`);
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
}

// 싱글톤 인스턴스 export
export const browserSessionManager = BrowserSessionManager.getInstance();

export default browserSessionManager;
