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
import { emitSessionEvent } from './session/sessionEventLogger.js';

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
    // ✅ [v1.4.78] 다중계정 첫 캡차 해제 후 세션 잠금 플래그
    // true면 keep-alive가 이 세션을 절대 폐기하지 않고, 실패 시 강제 복원 시도
    // 앱 종료 전까지 이 계정은 재로그인·재캡차 없이 유지됨
    locked: boolean;
    lockedAt: number; // 잠금 마킹 시각
    // [v1.6.0] keep-alive 연속 실패 카운터 (locked 세션 단일 실패 로그아웃 차단용)
    // 3회 연속 리다이렉트/실패 시에만 isLoggedIn=false로 전이
    consecutiveKeepaliveFails?: number;
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

    // ✅ [v1.4.78] 세션 최대 수명 제거 — keep-alive 루프로 무기한 유지
    // 이전: 4시간 하드 상한 → 수명 초과 시 재생성 → 사용자 로그인 반복
    // 현재: Number.MAX_SAFE_INTEGER (사실상 앱 종료까지 유지)
    private readonly SESSION_MAX_AGE = Number.MAX_SAFE_INTEGER;

    // ✅ [v1.4.79] Keep-alive 설정 — 18건 결함 교정 후 재설계
    // 네이버 서버측 쿠키 TTL이 ~30~60분이므로 15분마다 ping하여 서버측에서 TTL을 리셋
    // 봇 탐지 회피: 지터 ±5분 확대 + URL 풀 랜덤 선택 + 15% skip (자리비움 시뮬레이션)
    private readonly KEEPALIVE_INTERVAL_MS = 15 * 60 * 1000; // 15분
    private readonly KEEPALIVE_JITTER_MS = 5 * 60 * 1000;    // ±5분 (2분→5분 확대)
    private readonly KEEPALIVE_SKIP_PROB = 0.15;             // 15% 확률 skip
    private keepaliveTimer: NodeJS.Timeout | null = null;
    private isPinging = false; // ✅ [v1.4.79] Bug 8, 13 — 종료 race 방지

    // ✅ [v1.4.79] ping URL 풀 (R-01 — 단일 URL 고정 반복 → AuthGR 탐지 리스크)
    //   로그인 필수 API를 포함하여 서버가 NID_SES TTL을 실제로 갱신하도록 강제
    private readonly KEEPALIVE_URL_POOL = [
        'https://www.naver.com/',
        'https://blog.naver.com/',
        'https://nid.naver.com/user2/api/bascls/token', // 인증 필수 — TTL 리셋 확실
        'https://mail.naver.com/v2/',
    ];

    // ✅ [2026-03-26] isLoggedIn 캐시 TTL
    private readonly LOGIN_CACHE_TTL = 2 * 60 * 60 * 1000; // 2시간

    // Reconnect defense constants
    private readonly RECONNECT_MAX_RETRIES = 3;
    private readonly RECONNECT_RETRY_DELAY_MS = 5000;

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
     * Stage 2: Attempt to reconnect a disconnected session.
     * Retries up to RECONNECT_MAX_RETRIES times with RECONNECT_RETRY_DELAY_MS gap.
     * Stage 3 functional ping (page.goto about:blank) verifies renderer health after reconnect.
     * Returns true when the session is confirmed usable, false after all retries fail.
     */
    private async attemptReconnect(accountId: string): Promise<boolean> {
        const session = this.sessions.get(accountId);
        if (!session) return false;

        for (let attempt = 1; attempt <= this.RECONNECT_MAX_RETRIES; attempt++) {
            console.log(`[BrowserSessionManager] reconnect attempt ${attempt}/${this.RECONNECT_MAX_RETRIES} for ${accountId.substring(0, 3)}***`);

            // Wait before retrying (skip delay on first attempt)
            if (attempt > 1) {
                await new Promise<void>(resolve => setTimeout(resolve, this.RECONNECT_RETRY_DELAY_MS));
            }

            // Stage 1 re-check: WebSocket gate
            if (!session.browser.isConnected()) {
                console.log(`[BrowserSessionManager] WebSocket still disconnected on attempt ${attempt}`);
                continue;
            }

            // Stage 3: Page-level functional ping — confirms renderer is alive
            try {
                await session.page.goto('about:blank', { timeout: 3000, waitUntil: 'domcontentloaded' });
                console.log(`[BrowserSessionManager] page ping passed on attempt ${attempt} for ${accountId.substring(0, 3)}***`);
                return true;
            } catch {
                console.log(`[BrowserSessionManager] page ping failed on attempt ${attempt}`);
            }
        }

        return false;
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
                emitSessionEvent('proxy_change', accountId, existingSession.createdAt, { oldProxy, newProxy });
                console.log(`[BrowserSessionManager] 🔄 기존 세션 폐기 후 새 Chrome으로 재시작합니다...`);
                // ✅ [v1.4.79] Bug 9 — 프록시 변경은 Chrome 재기동 필수이므로 locked라도 force=true
                await this.closeSession(accountId, true);
                // fall through → 아래 새 세션 생성으로 진행
            } else {
                // Stage 1: WebSocket gate — fast check
                const wsConnected = (() => {
                    try { return existingSession.browser.isConnected(); }
                    catch { return false; }
                })();

                if (wsConnected) {
                    const sessionAge = Date.now() - existingSession.createdAt;
                    // ✅ [v1.4.78] 잠긴 세션은 수명 체크를 절대 건너뛰고 항상 재사용
                    if (!existingSession.locked && sessionAge > this.SESSION_MAX_AGE) {
                        console.log(`[BrowserSessionManager] ⏰ 세션 수명 초과 (${Math.floor(sessionAge / 60000)}분), 재생성...`);
                        await this.closeSession(accountId, true);
                        this.sessions.delete(accountId);
                    } else {
                        console.log(`[BrowserSessionManager] ✅ 기존 세션 재사용: ${accountId.substring(0, 3)}*** (수명: ${Math.floor(sessionAge / 60000)}분)`);
                        existingSession.lastActivity = Date.now();
                        this.activeAccountId = accountId;

                        // ✅ [2026-03-26] 발행 후 최소화된 창 자동 복원
                        await this.restoreWindow(accountId);

                        return existingSession;
                    }
                } else {
                    // Stage 2+3: WebSocket disconnected — attempt reconnect before destroying
                    // Stage 4: locked sessions MUST NOT be deleted without exhausting reconnect
                    console.log(`[BrowserSessionManager] ⚠️ 세션 연결 끊김, 재연결 시도 중... (locked=${existingSession.locked})`);
                    const reconnected = await this.attemptReconnect(accountId);

                    if (reconnected) {
                        console.log(`[BrowserSessionManager] ✅ 재연결 성공: ${accountId.substring(0, 3)}***`);
                        existingSession.lastActivity = Date.now();
                        this.activeAccountId = accountId;
                        await this.restoreWindow(accountId);
                        return existingSession;
                    }

                    if (existingSession.locked) {
                        // Stage 4 guard: locked 재연결 실패 — 강제 삭제 전 경고
                        console.warn(`[BrowserSessionManager] ⚠️ locked 세션 재연결 실패 — 부득이 재생성 (캡차 재인증 필요)`);
                    } else {
                        console.log(`[BrowserSessionManager] ⚠️ 재연결 실패, 세션 재생성...`);
                    }
                    // All retries exhausted — drop and recreate
                    this.sessions.delete(accountId);
                }
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
                // ✅ [v1.4.79] Bug 5 — Chrome idle throttle 억제 (keep-alive ping 타이머 지연 방지)
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                // ✅ [v1.4.79 P0-WebRTC] 프록시 사용 시 실제 IP 노출 방지 (WebRTC leak 차단)
                //   네이버가 JS로 STUN 요청하면 프록시 우회해서 실제 IP가 노출됨 → 반드시 차단
                //   disable_non_proxied_udp: STUN/ICE가 프록시 거치지 않으면 차단
                //   WebRTC는 VoIP 아닌 이상 블로그 자동화에 불필요하므로 완전 비활성화가 안전
                '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
                '--webrtc-ip-handling-policy=disable_non_proxied_udp',
                '--disable-features=WebRtcHideLocalIpsWithMdns',
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
            // ✅ [v1.4.79 P0-WebRTC] JS 레벨 WebRTC IP 누출 완전 차단
            //   Chrome launch arg로 ICE non-proxied UDP 차단했지만, 일부 페이지가 STUN 서버 강제 요청 시
            //   여전히 candidate에 실제 IP가 노출될 수 있어 API 자체를 가짜로 덮어씀
            try {
                const FakePC = function () {
                    return {
                        createDataChannel: () => ({ close: () => {} }),
                        createOffer: () => Promise.reject(new Error('WebRTC disabled')),
                        createAnswer: () => Promise.reject(new Error('WebRTC disabled')),
                        setLocalDescription: () => Promise.reject(new Error('WebRTC disabled')),
                        setRemoteDescription: () => Promise.reject(new Error('WebRTC disabled')),
                        addIceCandidate: () => Promise.reject(new Error('WebRTC disabled')),
                        close: () => {},
                        addEventListener: () => {},
                        removeEventListener: () => {},
                        getStats: () => Promise.resolve(new Map()),
                    };
                } as any;
                FakePC.generateCertificate = () => Promise.reject(new Error('WebRTC disabled'));
                (window as any).RTCPeerConnection = FakePC;
                (window as any).webkitRTCPeerConnection = FakePC;
                (window as any).mozRTCPeerConnection = FakePC;
                // WebRTC data channel 스텁
                (window as any).RTCDataChannel = function () { return {}; };
                // MediaDevices.enumerateDevices()도 빈 배열 반환 (장치 fingerprint 차단)
                if (navigator.mediaDevices) {
                    navigator.mediaDevices.enumerateDevices = () => Promise.resolve([]);
                }
            } catch { /* 구형 브라우저 무시 */ }
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
            locked: false,       // ✅ [v1.4.78] 초기엔 unlocked, 로그인 성공 시 auto-lock
            lockedAt: 0,
        };

        this.sessions.set(accountId, sessionInfo);
        this.activeAccountId = accountId;

        // ✅ [v1.4.79] Bug D4 / S9 — 신규 Chrome 세션이라도 저장된 쿠키가 있으면 자동 주입
        //   userDataDir만으로는 session cookie(expires=-1)가 브라우저 재시작 시 소실되므로
        //   sessionPersistence의 JSON 백업에서 복원 시도 (실패해도 무시, 다음 loginToNaver에서 처리)
        try {
            const { restoreCookies } = await import('./sessionPersistence.js');
            const restored = await restoreCookies(page, accountId);
            if (restored) {
                console.log(`[BrowserSessionManager] 🔄 ${accountId.substring(0, 3)}*** 저장된 쿠키 복원 (앱 재시작 연속성)`);
                // [v1.6.0] 쿠키 복원 성공 시 isLoggedIn=true 동기화 + auto-lock
                //   이전: restoreCookies만 호출하고 isLoggedIn=false 유지 → 다음 발행 시 재로그인 강제 유도
                //   수정: 복원된 쿠키 기준으로 logged-in 상태 가정, ensureServerSession이 실측 검증
                sessionInfo.isLoggedIn = true;
                sessionInfo.loginVerifiedAt = Date.now();
                if (!sessionInfo.locked) {
                    sessionInfo.locked = true;
                    sessionInfo.lockedAt = Date.now();
                    console.log(`[BrowserSessionManager] 🔒 ${accountId.substring(0, 3)}*** 쿠키 복원 기반 auto-lock (앱 종료까지 유지)`);
                }
                emitSessionEvent('login', accountId, sessionInfo.createdAt);
            }
        } catch (restoreErr) {
            // 저장된 쿠키 없음 or 복원 실패 — 무시 (loginToNaver에서 수동 로그인 유도)
        }

        // ✅ [v1.4.78] 첫 세션 생성 시 keep-alive 자동 시작 (싱글톤 타이머)
        this.startKeepalive();

        // Stage 5: Register disconnect event listener for auto-heal
        browser.on('disconnected', () => {
            console.log(`[BrowserSessionManager] 🔌 disconnected event for ${accountId.substring(0, 3)}*** — scheduling reconnect`);
            this.attemptReconnect(accountId).then(ok => {
                if (!ok) {
                    console.warn(`[BrowserSessionManager] auto-heal failed for ${accountId.substring(0, 3)}***`);
                }
            }).catch(() => {});
        });

        console.log(`[BrowserSessionManager] ✅ 새 세션 생성 완료: ${accountId.substring(0, 3)}***`);
        emitSessionEvent('create', accountId, sessionInfo.createdAt);

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
            // ✅ [v1.4.78] 로그인 성공 시 자동 잠금
            if (isLoggedIn && !session.locked) {
                session.locked = true;
                session.lockedAt = Date.now();
                console.log(`[BrowserSessionManager] 🔒 ${accountId.substring(0, 3)}*** 세션 잠금 (앱 종료까지 유지)`);
            }
            // [v1.6.0] locked 자동 해제 제거 — isLoggedIn=false는 일시적 신호일 수 있음
            // (keep-alive 네트워크 일시 장애, ensureServerSession 실패 등)
            // 잠금은 오직 unlockSession() 명시 호출 또는 앱 종료로만 해제
            if (!isLoggedIn && session.locked) {
                console.log(`[BrowserSessionManager] ⏳ ${accountId.substring(0, 3)}*** isLoggedIn=false 감지 — locked 유지 (재로그인 대기)`);
            }
            console.log(`[BrowserSessionManager] 로그인 상태 업데이트: ${accountId.substring(0, 3)}*** → ${isLoggedIn ? '✅ 로그인됨' : '❌ 로그아웃'}`);
            emitSessionEvent(isLoggedIn ? 'login' : 'logout', accountId, session.createdAt);
        }
    }

    /**
     * ✅ [v1.4.78] 세션 잠금 — 명시적 호출용 (다중계정 첫 로그인 완료 후)
     * 잠금된 세션은:
     *   - keep-alive가 절대 폐기하지 않음
     *   - SESSION_MAX_AGE 무시
     *   - ping 실패해도 삭제 대신 복원 시도
     */
    lockSession(accountId: string): void {
        const session = this.sessions.get(accountId);
        if (session && !session.locked) {
            session.locked = true;
            session.lockedAt = Date.now();
            console.log(`[BrowserSessionManager] 🔒 ${accountId.substring(0, 3)}*** 세션 잠금`);
        }
    }

    /**
     * 잠금 해제 (재로그인 필요 시)
     */
    unlockSession(accountId: string): void {
        const session = this.sessions.get(accountId);
        if (session?.locked) {
            session.locked = false;
            session.lockedAt = 0;
            console.log(`[BrowserSessionManager] 🔓 ${accountId.substring(0, 3)}*** 세션 잠금 해제`);
        }
    }

    /**
     * 세션 잠금 상태 조회 (다중계정 로직에서 재로그인 필요 여부 판정용)
     */
    isSessionLocked(accountId: string): boolean {
        return this.sessions.get(accountId)?.locked === true;
    }

    /**
     * ✅ [v1.4.79] Chrome 세션의 실제 공인 IP 확인
     * puppeteer page가 api.ipify.org에 직접 접속해 IP 반환 →
     * 프록시가 실제로 Chrome에 적용되었는지 100% 확인 (검증 API와 Chrome 설정의 불일치 방지)
     */
    async detectSessionPublicIp(accountId: string): Promise<string | null> {
        const session = this.sessions.get(accountId);
        if (!session || !session.browser.isConnected()) return null;
        const page = session.page;
        if (!page || page.isClosed()) return null;
        try {
            const ip = await page.evaluate(async () => {
                try {
                    const res = await fetch('https://api.ipify.org', { cache: 'no-store' });
                    return (await res.text()).trim();
                } catch { return null; }
            });
            return ip || null;
        } catch { return null; }
    }

    /**
     * ✅ [v1.4.79 P0-Gate] 발행 전 프록시 적용 강제 게이트
     * Chrome 내부에서 실제 공인 IP를 조회해 저장된 프록시 설정과 일치하는지 확인.
     * 일치하지 않으면 발행 차단 (throw).
     *
     * 사용: BlogExecutor의 발행 루프 진입 직전에 호출
     * @param accountId 계정 ID
     * @param expectedHost 기대하는 프록시 호스트 (수동 프록시 host 값)
     * @returns { ok, actualIp, message }
     */
    async enforceProxyAppliedOrThrow(accountId: string, expectedHost?: string): Promise<{
        ok: boolean;
        actualIp?: string;
        expectedHost?: string;
        message: string;
    }> {
        const { getManualProxy, isProxyEnabled } = await import('./crawler/utils/proxyManager.js');

        // 프록시 OFF면 게이트 패스
        if (!isProxyEnabled()) {
            return { ok: true, message: '프록시 비활성 — 게이트 스킵' };
        }

        const manual = getManualProxy();
        const targetHost = expectedHost || manual?.host;
        if (!targetHost) {
            // 수동 프록시 미설정 + SmartProxy rotating은 IP가 바뀌므로 IP 일치 검증 불가 → 패스
            return { ok: true, message: '수동 프록시 없음 (SmartProxy 동적 풀) — IP 매칭 스킵' };
        }

        const actualIp = await this.detectSessionPublicIp(accountId);
        if (!actualIp) {
            const msg = `❌ Chrome IP 조회 실패 — 발행 차단 (네트워크/세션 확인)`;
            console.error(`[BrowserSessionManager] ${msg}`);
            throw new Error(msg);
        }

        // 네이버가 보게 될 실제 IP가 프록시 호스트와 일치하는지
        if (actualIp === targetHost) {
            console.log(`[BrowserSessionManager] 🛡️ ${accountId.substring(0, 3)}*** 프록시 게이트 통과: ${actualIp} === ${targetHost}`);
            return { ok: true, actualIp, expectedHost: targetHost, message: `✅ 프록시 적용 확인: ${actualIp}` };
        }

        // IP 불일치 — 발행 중단
        const msg = `❌ 프록시 미적용 감지 — Chrome 실제 IP(${actualIp})가 프록시 호스트(${targetHost})와 다름.\n발행 시 IP 노출 위험으로 차단합니다. 프록시 설정 재확인 필요.`;
        console.error(`[BrowserSessionManager] ${msg}`);
        throw new Error(msg);
    }

    /**
     * ✅ [v1.4.79] Bug 3, 11 — 발행 직전 서버 세션 실측 검증 gate
     * locked=true라도 이 함수는 무조건 실제 HTTP 호출로 서버 세션 유효성 확인
     * 반환값: true = 발행 진행 가능, false = 재로그인 필요
     *
     * 사용: 발행 직전 `if (!await browserSessionManager.ensureServerSession(id)) await this.loginToNaver()`
     */
    async ensureServerSession(accountId: string): Promise<boolean> {
        const session = this.sessions.get(accountId);
        if (!session || !session.browser.isConnected()) return false;

        const page = session.page;
        if (!page || page.isClosed()) return false;

        try {
            // 실제 네이버 에디터 접근으로 서버 세션 유효성 확인
            const stillLoggedIn = await page.evaluate(async () => {
                try {
                    const res = await fetch('https://blog.naver.com/PostWriteForm.naver', {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store',
                        redirect: 'follow',
                    });
                    // 로그인 페이지로 리다이렉트되지 않았다면 유효
                    return !/nidlogin\.login|nid\.naver\.com\/nidlogin/.test(res.url);
                } catch {
                    return false;
                }
            });

            if (stillLoggedIn) {
                session.loginVerifiedAt = Date.now();
                session.isLoggedIn = true;
                return true;
            } else {
                console.warn(`[BrowserSessionManager] 🚨 ${accountId.substring(0, 3)}*** 발행 직전 서버 검증 실패 — 재로그인 필요`);
                session.loginVerifiedAt = 0;
                session.isLoggedIn = false;
                // [v1.6.0] locked=false 제거 — 잠긴 세션은 앱 종료까지 파괴 금지 계약 유지
                // 재로그인은 호출부에서 기존 브라우저 그대로 수행해야 함 (새 창/탭 금지)
                return false;
            }
        } catch (err) {
            console.warn(`[BrowserSessionManager] ⚠️ ensureServerSession 예외: ${(err as Error).message}`);
            return false;
        }
    }

    /**
     * ✅ [2026-03-26] 계정 로그인 상태 조회 (TTL 방어 포함)
     * 로그인 성공 후 LOGIN_CACHE_TTL(30분) 이내면 true, 초과하면 false 반환하여 재검증 트리거
     */
    isAccountLoggedIn(accountId: string): boolean {
        const session = this.sessions.get(accountId);
        if (!session?.isLoggedIn) return false;

        // ✅ [v1.4.78] 잠긴 세션은 TTL 체크 생략 — 다중계정 첫 로그인 후 재검증 불필요
        //    keep-alive가 15분마다 서버 TTL 리셋 + 쿠키 자동 갱신 중이므로 안전
        if (session.locked) {
            return true;
        }

        // 잠기지 않은 세션: TTL 방어 (기존 로직)
        const elapsed = Date.now() - session.loginVerifiedAt;
        if (elapsed > this.LOGIN_CACHE_TTL) {
            console.log(`[BrowserSessionManager] ⏰ 로그인 캐시 TTL 초과 (${Math.floor(elapsed / 60000)}분 경과), 재검증 필요`);
            return false;
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
     * ✅ [v1.4.79] Bug D1 — force=false(기본)면 잠긴 세션 보호. 앱 종료/재로그인은 force=true 사용
     */
    async closeSession(accountId: string, force: boolean = false): Promise<void> {
        const session = this.sessions.get(accountId);
        if (!session) return;
        if (session.locked && !force) {
            console.log(`[BrowserSessionManager] 🔒 ${accountId.substring(0, 3)}*** 잠긴 세션 — closeSession 보호 (force=true 필요)`);
            return;
        }
        try {
            await session.browser.close();
            console.log(`[BrowserSessionManager] 🔚 세션 종료: ${accountId.substring(0, 3)}***`);
            emitSessionEvent('close', accountId, session.createdAt);
        } catch (e) {
            console.log(`[BrowserSessionManager] ⚠️ 세션 종료 중 오류: ${(e as Error).message}`);
        }
        this.sessions.delete(accountId);
        if (this.activeAccountId === accountId) {
            this.activeAccountId = null;
        }
    }

    /**
     * ✅ [v1.4.78] Keep-alive 시작 — 15분 간격으로 모든 활성 세션에 네이버 ping
     * 네이버 서버측 쿠키 TTL 리셋 → 앱이 실행 중인 동안 세션 무기한 유지
     * 이미 시작된 경우 중복 실행 방지 (싱글톤 타이머)
     */
    startKeepalive(): void {
        if (this.keepaliveTimer) {
            console.log('[BrowserSessionManager] ⏰ Keep-alive 이미 실행 중');
            return;
        }
        // ✅ [v1.4.79] Bug 2 — try/finally로 루프 영구 사망 방지
        const scheduleNext = () => {
            const jitter = (Math.random() * 2 - 1) * this.KEEPALIVE_JITTER_MS;
            const interval = this.KEEPALIVE_INTERVAL_MS + jitter;
            this.keepaliveTimer = setTimeout(async () => {
                try {
                    await this.runKeepalivePing();
                } catch (err) {
                    console.error('[BrowserSessionManager] ⚠️ runKeepalivePing 예외 (루프 유지):', (err as Error).message);
                } finally {
                    // 항상 재스케줄 — 타이머 루프가 절대 끊기지 않도록
                    scheduleNext();
                }
            }, interval);
        };
        console.log(`[BrowserSessionManager] ⏰ Keep-alive 시작 (${this.KEEPALIVE_INTERVAL_MS / 60000}분 ± ${this.KEEPALIVE_JITTER_MS / 60000}분, skip ${this.KEEPALIVE_SKIP_PROB * 100}%)`);
        scheduleNext();
    }

    /**
     * Keep-alive 중지 (앱 종료 시 호출)
     */
    stopKeepalive(): void {
        if (this.keepaliveTimer) {
            clearTimeout(this.keepaliveTimer);
            this.keepaliveTimer = null;
            console.log('[BrowserSessionManager] ⏰ Keep-alive 중지');
        }
    }

    /**
     * ✅ [v1.4.79] Keep-alive ping — 18건 결함 교정 후 재설계
     * - URL 풀에서 랜덤 선택 (Bug R-01 — 단일 URL 패턴 탐지 회피)
     * - 15% 확률로 skip (자리비움 시뮬레이션)
     * - 리다이렉트 감지: 응답 URL이 nidlogin.login이면 세션 만료로 판정 (Bug D2)
     * - ping 실패 시 page.isClosed() 이면 newPage()로 교체 (Bug S4-renderer-dead)
     * - activeAccountId와 동일한 계정은 ping skip (Bug 10 — 발행 중 경쟁)
     * - restoreCookies 반환값 확인 (Bug 4)
     * - 복원 성공 시 isLoggedIn=true 동기화 (Bug 6)
     * - isPinging flag로 종료 race 방지 (Bug 8, 13)
     */
    private async runKeepalivePing(): Promise<void> {
        this.isPinging = true;
        try {
            // 15% 확률 skip (자리비움 시뮬레이션 — 봇 탐지 회피)
            if (Math.random() < this.KEEPALIVE_SKIP_PROB) {
                console.log('[BrowserSessionManager] 💤 Keep-alive skip (자리비움 시뮬레이션)');
                return;
            }

            const accountIds = Array.from(this.sessions.keys());
            if (accountIds.length === 0) {
                console.log('[BrowserSessionManager] 🔍 활성 세션 없음, keep-alive skip');
                return;
            }
            console.log(`[BrowserSessionManager] 🔄 Keep-alive ping 시작 (${accountIds.length}개 세션)`);

            // ✅ [v1.4.79] 계정 수에 비례 세션 간 간격 (IP당 집중 요청 방지)
            const minGapMs = Math.max(5000, accountIds.length * 3000);
            const maxGapMs = minGapMs + 10000;

            for (const accountId of accountIds) {
                // ✅ [v1.4.79] Bug 10 — 현재 발행 중인 계정은 ping skip (page 동시 사용 방지)
                if (accountId === this.activeAccountId) {
                    console.log(`[BrowserSessionManager] ⏭️ ${accountId.substring(0, 3)}*** 발행 중 — ping skip`);
                    continue;
                }

                const session = this.sessions.get(accountId);
                if (!session || !session.browser.isConnected()) continue;

                await this.pingSingleSession(session);

                // 세션 간 랜덤 간격
                await new Promise(r => setTimeout(r, minGapMs + Math.random() * (maxGapMs - minGapMs)));
            }
        } finally {
            this.isPinging = false;
        }
    }

    /**
     * ✅ [v1.4.79] 단일 세션 ping — URL 풀 + 리다이렉트 감지 + page 재생성 + 쿠키 검증
     */
    private async pingSingleSession(session: SessionInfo): Promise<void> {
        const accountId = session.accountId;
        const pingUrl = this.KEEPALIVE_URL_POOL[Math.floor(Math.random() * this.KEEPALIVE_URL_POOL.length)];
        const pingStartedAt = Date.now();

        try {
            let page = session.page;
            // ✅ [v1.4.79] Bug S4 — page 죽어있으면 새 page 생성
            if (!page || page.isClosed()) {
                console.log(`[BrowserSessionManager] 🔄 ${accountId.substring(0, 3)}*** page 재생성`);
                page = await session.browser.newPage();
                session.page = page;
            }

            // ✅ [v1.4.79] Bug D2 — 리다이렉트 감지로 세션 만료 판정
            const redirected = await page.evaluate(async (url: string) => {
                try {
                    const res = await fetch(url, {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store',
                        redirect: 'follow',
                    });
                    // 응답 최종 URL이 로그인 페이지면 세션 만료
                    return /nidlogin\.login|nid\.naver\.com\/nidlogin/.test(res.url);
                } catch {
                    return false;
                }
            }, pingUrl);

            session.lastActivity = Date.now();
            const elapsed = Date.now() - pingStartedAt;
            const ageMin = Math.floor((Date.now() - session.createdAt) / 60000);

            if (redirected) {
                // [v1.6.0] locked 세션은 일시적 네트워크/AuthGR 일시 차단으로 리다이렉트 나올 수 있음
                //   → 단일 리다이렉트로 isLoggedIn=false 전이 금지, 3회 연속 시에만 전이
                //   → 쿠키 복원 1회 시도로 서버 TTL 회복을 노려봄
                const fails = (session.consecutiveKeepaliveFails ?? 0) + 1;
                session.consecutiveKeepaliveFails = fails;
                console.warn(`[BrowserSessionManager] 🚨 ${accountId.substring(0, 3)}*** 서버 세션 만료 감지 (로그인 페이지 리다이렉트, ${fails}/3)`);
                emitSessionEvent('expire', accountId, session.createdAt);
                session.loginVerifiedAt = 0;

                if (session.locked) {
                    // locked 세션: 즉시 쿠키 복원 시도로 TTL 회복
                    try {
                        const { restoreCookies } = await import('./sessionPersistence.js');
                        const restored = await restoreCookies(session.page, accountId);
                        if (restored) {
                            console.log(`[BrowserSessionManager] ✅ ${accountId.substring(0, 3)}*** 리다이렉트 감지 → 쿠키 복원 성공 (locked 유지)`);
                            session.loginVerifiedAt = Date.now();
                            session.isLoggedIn = true;
                            session.consecutiveKeepaliveFails = 0;
                            emitSessionEvent('reconnect_ok', accountId, session.createdAt);
                            return;
                        }
                    } catch (restoreErr) {
                        console.warn(`[BrowserSessionManager] ⚠️ 쿠키 복원 예외 (무시): ${(restoreErr as Error).message}`);
                    }
                    if (fails < 3) {
                        console.log(`[BrowserSessionManager] ⏳ ${accountId.substring(0, 3)}*** locked 세션 — isLoggedIn 유지 (연속 실패 ${fails}/3)`);
                        return;
                    }
                }

                session.isLoggedIn = false; // 3회 연속 실패 또는 unlocked 세션만 로그아웃 전이
                return;
            }

            // 성공 시 연속 실패 카운터 리셋
            session.consecutiveKeepaliveFails = 0;
            console.log(`[BrowserSessionManager] 💓 ${accountId.substring(0, 3)}*** keep-alive OK (${elapsed}ms, 수명 ${ageMin}분, ping=${new URL(pingUrl).hostname})`);
            emitSessionEvent('keepalive_ok', accountId, session.createdAt, { elapsedMs: elapsed, ageMin, pingHost: new URL(pingUrl).hostname });

            // ✅ 쿠키 저장 (앱 재시작 복원용)
            try {
                const { saveCookies } = await import('./sessionPersistence.js');
                await saveCookies(session.page, accountId);
            } catch (saveErr) {
                console.warn(`[BrowserSessionManager] ⚠️ 쿠키 저장 실패 (무시): ${(saveErr as Error).message}`);
            }
        } catch (err) {
            console.warn(`[BrowserSessionManager] ⚠️ ${accountId.substring(0, 3)}*** keep-alive 실패: ${(err as Error).message}`);
            emitSessionEvent('keepalive_fail', accountId, session.createdAt, { error: (err as Error).message });
            // ✅ [v1.4.79] Bug D1 — 잠긴 세션은 절대 closeSession 호출 금지
            //    복원 시도 + 반환값 확인 (Bug 4) + isLoggedIn 동기화 (Bug 6)
            if (session.locked && session.isLoggedIn) {
                console.log(`[BrowserSessionManager] 🔒 ${accountId.substring(0, 3)}*** 잠긴 세션 — 쿠키 복원 시도`);
                try {
                    const { restoreCookies } = await import('./sessionPersistence.js');
                    const restored = await restoreCookies(session.page, accountId);
                    if (restored) {
                        session.loginVerifiedAt = Date.now();
                        session.isLoggedIn = true; // ✅ Bug 6 — 동기화
                        console.log(`[BrowserSessionManager] ✅ ${accountId.substring(0, 3)}*** 쿠키 복원 성공`);
                        emitSessionEvent('reconnect_ok', accountId, session.createdAt);
                    } else {
                        // ✅ Bug 4 — 반환값이 false면 실제로 복원 안 됨 → 재검증 필요
                        session.loginVerifiedAt = 0;
                        console.warn(`[BrowserSessionManager] ⚠️ ${accountId.substring(0, 3)}*** 쿠키 복원 빈 결과 — 재발행 시 재로그인 필요`);
                        emitSessionEvent('reconnect_fail', accountId, session.createdAt, { reason: 'empty_restore' });
                    }
                } catch (restoreErr) {
                    console.warn(`[BrowserSessionManager] ⚠️ 쿠키 복원 실패: ${(restoreErr as Error).message}`);
                    session.loginVerifiedAt = 0;
                }
            } else {
                session.loginVerifiedAt = 0;
            }
        }
    }

    /**
     * 모든 세션 종료 (앱 종료 시)
     */
    async closeAllSessions(): Promise<void> {
        console.log(`[BrowserSessionManager] 🔚 모든 세션 종료 시작 (${this.sessions.size}개)...`);
        this.stopKeepalive(); // ✅ [v1.4.78] keep-alive 먼저 중지
        // ✅ [v1.4.79] Bug 8 — 진행 중인 ping coroutine 완료 대기 (최대 10초)
        for (let waited = 0; this.isPinging && waited < 10000; waited += 100) {
            await new Promise(r => setTimeout(r, 100));
        }
        if (this.isPinging) {
            console.warn('[BrowserSessionManager] ⚠️ ping 완료 대기 타임아웃(10초) — 강제 진행');
        }

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
        emitSessionEvent('close_all', 'all', 0);
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
