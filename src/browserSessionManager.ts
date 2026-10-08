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
import { findChromeExecutable } from './automation/chromeExecutablePolicy.js';
import { resolveCommitTimeBlock, resolveServerSessionProbeVerdict, SERVER_SESSION_PROBE_URL } from './automation/serverSessionProbePolicy.js';
import { isLoginChallengeUrl, isNaverSessionLoginUrl, parseNaverSessionUrl } from './automation/loginPageNavigationPolicy.js';
import { getAccountExecutionGuard, AccountExecutionGuardError, type AccountPauseCode } from './automation/accountExecutionGuard.js';
import type { ServerSessionProbeVerdict } from './automation/serverSessionProbePolicy.js';
import { withCleanupTimeout } from './runtime/cleanupTimeout.js';
import { EDITOR_BODY_SELECTOR, waitForInitialEditorReadiness } from './automation/initialEditorReadiness.js';
import { inspectCurrentSessionFrames } from './automation/serverSessionFrameProbe.js';

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
    // true preserves browser ownership until explicit unlock or forced shutdown.
    // Authentication still requires current server evidence.
    locked: boolean;
    lockedAt: number; // 잠금 마킹 시각
    // Legacy serialized field; idle keepalive is disabled.
    consecutiveKeepaliveFails?: number;
    // Tracks active publishing for UI and lifecycle ownership.
    publishInProgress?: boolean;
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
    private readonly serverSessionChecks = new Map<string, Promise<ServerSessionProbeVerdict>>();
    private readonly expectedBlogIds = new Map<string, string>();

    // 프로필 베이스 경로
    private readonly PROFILE_BASE = path.join(os.homedir(), '.naver-blog-automation', 'profiles');

    // Persist profile ownership without an artificial age-based restart.
    // 이전: 4시간 하드 상한 → 수명 초과 시 재생성 → 사용자 로그인 반복
    // 현재: Number.MAX_SAFE_INTEGER (사실상 앱 종료까지 유지)
    private readonly SESSION_MAX_AGE = Number.MAX_SAFE_INTEGER;

    // Cancel any legacy idle timer; no periodic network keepalive is scheduled.
    private keepaliveTimer: NodeJS.Timeout | null = null;
    private isPinging = false; // ✅ [v1.4.79] Bug 8, 13 — 종료 race 방지

    // ✅ [2026-03-26] isLoggedIn 캐시 TTL
    private readonly LOGIN_CACHE_TTL = 2 * 60 * 60 * 1000; // 2시간

    // 발행 직전 서버 세션 실측은 외부 네트워크 경로라 무한 대기하면 전체 발행이 멈춘다.
    private readonly SERVER_SESSION_CHECK_TIMEOUT_MS = 8 * 1000;

    // Browser shutdown is best-effort, but it must never block app cleanup indefinitely.
    private readonly BROWSER_CLOSE_TIMEOUT_MS = 5 * 1000;

    // Reconnect defense constants
    private readonly RECONNECT_MAX_RETRIES = 3;
    private readonly RECONNECT_RETRY_DELAY_MS = 5000;

    // Accounts whose browser we are closing on purpose (quit, re-login). Their
    // 'disconnected' event must not start the reconnect loop: the quit log showed
    // reconnect attempts firing against browsers closeAllSessions() had just closed.
    private readonly closingAccounts = new Set<string>();

    private constructor() {
        console.log('[BrowserSessionManager] 싱글톤 인스턴스 생성됨');
    }

    /**
     * ✅ [2026-03-26] 프록시 URL 정규화 — "", null, undefined를 모두 undefined로 통일
     * 비교 시 falsy 값 차이로 인한 오탐 방지
     */
    /** Keep existing profile keys stable while matching account IDs case-insensitively. */
    private resolveSessionAccountId(accountId: string): string {
        const normalized = accountId.trim().toLowerCase();
        return [...this.sessions.keys()].find(key => key.trim().toLowerCase() === normalized) || accountId.trim();
    }

    private normalizeProxyUrl(url: string | null | undefined): string | undefined {
        if (!url || url.trim() === '') return undefined;
        return url.trim();
    }

    /**
     * Stage 2: Attempt to reconnect a disconnected session.
     * Retries up to RECONNECT_MAX_RETRIES times with RECONNECT_RETRY_DELAY_MS gap.
     * A bounded read of document.readyState verifies renderer health without navigation.
     * Returns true when the session is confirmed usable, false after all retries fail.
     */
    private async attemptReconnect(accountId: string): Promise<boolean> {
        accountId = this.resolveSessionAccountId(accountId);
        const session = this.sessions.get(accountId);
        if (!session || getAccountExecutionGuard().getStatus(accountId).paused) return false;

        for (let attempt = 1; attempt <= this.RECONNECT_MAX_RETRIES; attempt++) {
            console.log(`[BrowserSessionManager] reconnect attempt ${attempt}/${this.RECONNECT_MAX_RETRIES} for ${accountId.substring(0, 3)}***`);

            // Wait before retrying (skip delay on first attempt)
            if (attempt > 1) {
                await new Promise<void>(resolve => setTimeout(resolve, this.RECONNECT_RETRY_DELAY_MS));
            }

            // Stage 1 re-check: WebSocket gate
            if (!session.browser.connected) {
                console.log(`[BrowserSessionManager] WebSocket still disconnected on attempt ${attempt}`);
                continue;
            }

            // Stage 3: Page-level functional ping — confirms renderer is alive
            try {
                if (getAccountExecutionGuard().getStatus(accountId).paused || this.sessions.get(accountId) !== session) return false;
                if (session.page.isClosed()) return false;
                await withCleanupTimeout(() => session.page.evaluate(() => document.readyState), 3000, 'renderer-health');
                if (getAccountExecutionGuard().getStatus(accountId).paused || this.sessions.get(accountId) !== session || session.page.isClosed()) return false;
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
        hardwareConcurrency: number;
        deviceMemory: number;
        timezoneId: string;
        locale: string;
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

        // ✅ [2026-05-26 v2.10.363 SPEC-NAVER-PROTECTION-2026 P3 Fingerprint 다양화]
        //   기존: 전 계정 동일 hardwareConcurrency/deviceMemory (브라우저 default) → 다계정 동시 발행 시 즉시 탐지
        //   수정: 계정별 hash 기반 일관 값 (안정성 유지) + 풀에서 분산 (격리)
        //   2번째 hash로 webGL/screen과 독립적으로 선택 (상관관계 차단)
        const hash2 = Math.imul(seed, 0x9e3779b9) >>> 0; // golden ratio hash (다른 차원 격리)
        const hwcOptions = [4, 8, 12, 16]; // 일반적인 CPU 코어 수 (2는 너무 적음, 32+ 드뭄)
        const dmOptions = [4, 8, 16];      // 일반적인 RAM GB (1/2는 봇 시그니처, 32는 게이밍 PC)
        const hardwareConcurrency = hwcOptions[hash2 % hwcOptions.length];
        const deviceMemory = dmOptions[(hash2 >>> 4) % dmOptions.length];
        const timezoneId = 'Asia/Seoul';
        const locale = 'ko-KR';

        return { userAgent, screen, webGL, hardwareConcurrency, deviceMemory, timezoneId, locale };
    }

    /**
     * 세션 가져오기 또는 생성
     */
    async getOrCreateSession(accountId: string, headless: boolean = false, accountProxyUrl?: string, options: { userInitiated?: boolean } = {}): Promise<SessionInfo> {
        accountId = this.resolveSessionAccountId(accountId);
        if (!options.userInitiated) getAccountExecutionGuard().assertAllowed(accountId);
        // ✅ [2026-05-26 v2.10.377 SPEC-NAVER-PROTECTION-2026 P1 Fix 1.4]
        //   sticky proxy 매핑 — env PROXY_POOL_URLS 설정 시 accountId hash 기반 deterministic 선택.
        //   같은 계정 = 항상 같은 proxy 회선 (다계정 격리 + lifetime 안정성).
        //   풀 미설정 시 null → 기존 accountProxyUrl/getProxyUrl로 fallback (회귀 0).
        let stickyProxy: string | null = null;
        try {
            const { getStickyProxyForAccount } = require('./account/proxyMapping.js');
            stickyProxy = getStickyProxyForAccount(accountId);
        } catch {
            // 모듈 로드 실패 시 무시 (graceful)
        }
        // ✅ [2026-03-26] 현재 프록시 설정 확인 + 정규화 ("", null, undefined → undefined로 통일)
        //   우선순위: sticky > accountProxyUrl > getProxyUrl()
        const currentProxyUrl = this.normalizeProxyUrl(stickyProxy || accountProxyUrl || await getProxyUrl());

        // ✅ [2026-05-26 v2.10.376 SPEC-NAVER-PROTECTION-2026 P1 Fix 1.2]
        //   다계정 동일 IP fall-through 차단 — 이미 다른 세션 활성 + 현재 proxy null이면 위험 신호.
        //   다계정 발행 시 모든 계정이 동일 IP 사용 → 네이버 즉시 다계정 탐지.
        //   기본: console.warn (UX 영향 없음, 사용자 인지 보장)
        //   STRICT_PROXY_FOR_MULTI_ACCOUNT=1 env 설정 시: throw (hard-block)
        try {
            if (!currentProxyUrl && this.sessions.size > 0) {
                const strictMode = (process.env.STRICT_PROXY_FOR_MULTI_ACCOUNT || '').trim() === '1';
                const otherIds = Array.from(this.sessions.keys()).filter(id => id !== accountId);
                if (otherIds.length > 0) {
                    const msg = `⚠️ proxy null + 다계정 활성 (${otherIds.length}개) — ${accountId}가 다른 계정과 동일 IP 사용 위험 (네이버 다계정 탐지 트리거 가능)`;
                    if (strictMode) {
                        console.error(`[BrowserSessionManager] ${msg} — STRICT 모드 hard-block`);
                        throw new Error(`STRICT_PROXY_FOR_MULTI_ACCOUNT=1: ${msg}. proxy 설정 후 재시도하세요.`);
                    } else {
                        console.warn(`[BrowserSessionManager] ${msg}. 계정별 proxy 설정 권장. STRICT_PROXY_FOR_MULTI_ACCOUNT=1로 hard-block 가능.`);
                    }
                }
            }
        } catch (proxyGuardErr) {
            if ((proxyGuardErr as Error).message?.includes('STRICT_PROXY_FOR_MULTI_ACCOUNT')) throw proxyGuardErr;
            console.warn('[BrowserSessionManager] proxy null 가드 예외:', (proxyGuardErr as Error).message);
        }

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
                const proxySessionClosed = await this.closeSession(accountId, true);
                if (!proxySessionClosed) {
                    throw new Error('BROWSER_SESSION_CLEANUP_INCOMPLETE: 프록시 변경 전 기존 브라우저를 종료하지 못했습니다. 잠시 후 다시 시도해주세요.');
                }
                // fall through → 아래 새 세션 생성으로 진행
            } else {
                // Stage 1: WebSocket gate — fast check
                const wsConnected = (() => {
                    try { return existingSession.browser.connected; }
                    catch { return false; }
                })();

                if (wsConnected) {
                    const sessionAge = Date.now() - existingSession.createdAt;
                    // ✅ [v1.4.78] 잠긴 세션은 수명 체크를 절대 건너뛰고 항상 재사용
                    if (!existingSession.locked && sessionAge > this.SESSION_MAX_AGE) {
                        console.log(`[BrowserSessionManager] ⏰ 세션 수명 초과 (${Math.floor(sessionAge / 60000)}분), 재생성...`);
                        const expiredSessionClosed = await this.closeSession(accountId, true);
                        if (!expiredSessionClosed) {
                            throw new Error('BROWSER_SESSION_CLEANUP_INCOMPLETE: 만료된 브라우저 세션을 종료하지 못했습니다. 잠시 후 다시 시도해주세요.');
                        }
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
                    // All retries exhausted — close must succeed before ownership
                    // can be dropped or a second browser may contend for profile.
                    const disconnectedSessionClosed = await this.closeSession(accountId, true);
                    if (!disconnectedSessionClosed) {
                        throw new Error('BROWSER_SESSION_CLEANUP_INCOMPLETE: 연결이 끊긴 브라우저 세션을 정리하지 못했습니다. 잠시 후 다시 시도해주세요.');
                    }
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
        const chromeExecutablePath = findChromeExecutable() || null;
        // ✅ [2026-05-25 v2.10.357 P1] Chrome 폴백 명시 로그 — Phase A2 진단 발견
        //   findChromeExecutable() === null이면 Puppeteer 번들 Chromium 폴백 → stealth UA 버전이
        //   실제 시스템 Chrome과 달라져 fingerprint 불일치 재발. 그동안 silent fallback이어서 추적 불가.
        if (!chromeExecutablePath) {
          console.warn('[BrowserSession] ⚠️ 시스템 Chrome 미발견 → Puppeteer 번들 Chromium 폴백 (봇 감지 위험 ↑)');
        } else {
          console.log(`[BrowserSession] ✅ 시스템 Chrome 사용: ${chromeExecutablePath}`);
        }

        // ✅ [2026-03-26] currentProxyUrl은 함수 상단에서 이미 resolve됨 (중복 호출 방지)
        const proxyUrl = currentProxyUrl;
        let proxyAuth: { username: string; password: string } | null = null;
        const launchArgs = [
                '--disable-blink-features=AutomationControlled',
                // ✅ [2026-05-26 v2.10.362 SPEC-NAVER-PROTECTION-2026 P1 Fix 1.3] WebRTC IP leak 차단
                //   STUN/UDP로 실제 IP가 자바스크립트로 노출되는 것을 차단 (proxy 사용해도 누출되는 봇 시그니처).
                //   browserleaks.com/webrtc 등 fingerprint 사이트가 봇 점수 결정에 활용.
                //   --force-webrtc-ip-handling-policy: proxy되지 않은 UDP 차단
                //   --enforce-webrtc-ip-permission-check: WebRTC 권한 강제 (사용자 명시 없이 IP 노출 안 됨)
                '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
                '--enforce-webrtc-ip-permission-check',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                `--window-size=${profile.screen.width},${profile.screen.height}`,
                '--start-maximized',
                '--window-position=0,0',
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
                '--lang=ko-KR',
                // ✅ [v1.4.79 P0-WebRTC] 프록시 사용 시 실제 IP 노출 방지 (WebRTC leak 차단)
                //   네이버가 JS로 STUN 요청하면 프록시 우회해서 실제 IP가 노출됨 → 반드시 차단
                //   disable_non_proxied_udp: STUN/ICE가 프록시 거치지 않으면 차단
                //   WebRTC는 VoIP 아닌 이상 블로그 자동화에 불필요하므로 완전 비활성화가 안전
                '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
                '--webrtc-ip-handling-policy=disable_non_proxied_udp',
                // ✅ [v2.11.144 FIX] --disable-features는 하나로 합쳐야 한다.
                //   Chrome은 같은 스위치가 중복되면 마지막 것만 채택하므로, 예전에 위쪽에 있던
                //   '--disable-features=IsolateOrigins,site-per-process,PasswordManager,
                //    ThirdPartyCookieBlocking,SameSiteByDefaultCookies'가 이 줄에 통째로 덮여
                //   2026-02-08 "비밀번호 저장 팝업 비활성화" 조치가 계속 무효 상태였다.
                //   PasswordManager만 복구한다. IsolateOrigins/site-per-process는 사이트 격리를
                //   실제로 끄게 되어 2026-03-27 안티핑거프린팅 결정(일반 Chrome과 동일하게 유지)과
                //   충돌하고, 쿠키 관련 2종도 세션 동작을 바꾸므로 별도 검토 후 반영한다.
                '--disable-features=WebRtcHideLocalIpsWithMdns,PasswordManager',
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

        // [v2.10.156] zombieRecovery 추적 등록 — 비정상 종료 시 다음 시작 때 정리됨
        try {
            const zombieRecovery = require('./runtime/zombieRecovery.js');
            const browserPid = browser.process()?.pid;
            if (browserPid) {
                zombieRecovery.trackBrowserPid({
                    pid: browserPid,
                    kind: 'puppeteer-chrome',
                    cmdlineFingerprint: profileDir,  // 우리 앱 PROFILE_BASE 하위 — 고유 식별
                    label: `naver-blog-${accountId.substring(0, 4)}`,
                });
            }
        } catch (e: any) {
            console.warn('[BrowserSessionManager] zombieRecovery 추적 등록 실패 (무시):', e?.message);
        }

        const page = await browser.newPage();

        // User-managed authentication keeps native passkeys and second-factor choices available.

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

        await page.emulateTimezone(profile.timezoneId).catch((tzErr) => {
            console.warn('[BrowserSessionManager] ⚠️ timezone 설정 실패 (무시):', (tzErr as Error).message);
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
            Object.defineProperty(navigator, 'language', { get: () => hw.locale || 'ko-KR', configurable: true });
            Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
            // ✅ [2026-05-26 v2.10.363 SPEC-NAVER-PROTECTION-2026 P3] 계정별 hash 기반 다양화
            //   기존: 전 계정 8/8 하드코딩 → 다계정 동시 발행 시 동일 신호로 즉시 봇 탐지
            //   수정: profile.hardwareConcurrency / deviceMemory (계정별 안정·계정간 분산)
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => hw.hardwareConcurrency || 8 });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => hw.deviceMemory || 8 });
            // ✅ [2026-05-26 v2.10.382 SPEC-NAVER-PROTECTION-2026 P3 fingerprint completeness]
            //   screen.colorDepth/pixelDepth: 모던 디스플레이 = 24 (Headless Chromium default는 24지만
            //   일부 환경에서 30/32로 노출되어 fingerprint hash 변화 → 강제 통일로 안정화).
            //   navigator.maxTouchPoints: 데스크탑 = 0 (puppeteer default가 환경 따라 다름 → 0 고정).
            Object.defineProperty(screen, 'colorDepth', { get: () => 24, configurable: true });
            Object.defineProperty(screen, 'pixelDepth', { get: () => 24, configurable: true });
            Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0, configurable: true });
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
            publishInProgress: false,
        };

        this.sessions.set(accountId, sessionInfo);
        this.activeAccountId = accountId;

        // ✅ [v1.4.79] Bug D4 / S9 — 신규 Chrome 세션이라도 저장된 쿠키가 있으면 자동 주입
        //   userDataDir만으로는 session cookie(expires=-1)가 브라우저 재시작 시 소실되므로
        //   sessionPersistence의 JSON 백업에서 복원 시도 (실패해도 무시, 다음 loginToNaver에서 처리)
        try {
            if (options.userInitiated) throw new Error('manual-profile-only');
            const { restoreCookies } = await import('./sessionPersistence.js');
            const restored = await restoreCookies(page, accountId);
            if (restored) {
                console.log(`[BrowserSessionManager] 🔄 ${accountId.substring(0, 3)}*** 저장된 쿠키 복원 (앱 재시작 연속성)`);
                // Restored cookies are credentials, not proof of a currently authenticated editor.
                sessionInfo.isLoggedIn = false;
                sessionInfo.loginVerifiedAt = 0;
            }
        } catch (restoreErr) {
            // 저장된 쿠키 없음 or 복원 실패 — 무시 (loginToNaver에서 수동 로그인 유도)
        }

        // ✅ [v1.4.78] 첫 세션 생성 시 keep-alive 자동 시작 (싱글톤 타이머)
        this.startKeepalive();

        // A fresh browser for this account is ours to heal again.
        this.closingAccounts.delete(accountId);

        // Stage 5: Register disconnect event listener for auto-heal
        browser.on('disconnected', () => {
            // Read-only diagnostics (2026-09-29 login loop): tell "Chrome process died /
            // window closed" apart from "CDP pipe dropped while Chrome kept running".
            const describeProcess = (label: string) => {
                try {
                    const proc = browser.process();
                    console.log(`[BrowserSessionManager] 🔌 disconnect ${label}: exitCode=${proc?.exitCode ?? 'n/a'} signal=${proc?.signalCode ?? 'n/a'} killed=${proc?.killed ?? 'n/a'} pid=${proc?.pid ?? 'n/a'}`);
                } catch { /* diagnostics must never throw */ }
            };
            describeProcess('t+0');
            if (this.closingAccounts.has(accountId)) {
                console.log(`[BrowserSessionManager] 🔌 disconnected event for ${accountId.substring(0, 3)}*** — closing on purpose, reconnect skipped`);
                return;
            }
            console.log(`[BrowserSessionManager] 🔌 disconnected event for ${accountId.substring(0, 3)}*** — scheduling reconnect`);
            // Second sample: the process exit event usually lands a beat after the CDP drop.
            setTimeout(() => describeProcess('t+1500ms'), 1500).unref?.();
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
        accountId = this.resolveSessionAccountId(accountId);
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
     *   - Ordinary cleanup preserves this browser.
     *   - SESSION_MAX_AGE does not cause a locked browser restart.
     *   - This lock is not authentication evidence.
     */
    lockSession(accountId: string): void {
        accountId = this.resolveSessionAccountId(accountId);
        const session = this.sessions.get(accountId);
        if (session && !session.locked) {
            session.locked = true;
            session.lockedAt = Date.now();
            console.log(`[BrowserSessionManager] 🔒 ${accountId.substring(0, 3)}*** 세션 잠금`);
        }
    }

    /**
     * [R7] 발행 진행 상태 마킹 — 발행 시작 시 true, 종료(성공/실패/취소) 시 false.
     * Clear the flag in finally so account controls reflect the actual running task.
     * No idle network requests are started by this flag.
     */
    markPublishing(accountId: string, inProgress: boolean): void {
        accountId = this.resolveSessionAccountId(accountId);
        const session = this.sessions.get(accountId);
        if (session) {
            session.publishInProgress = inProgress;
            if (inProgress) session.lastActivity = Date.now();
        }
    }

    /**
     * 잠금 해제 (재로그인 필요 시)
     */
    unlockSession(accountId: string): void {
        accountId = this.resolveSessionAccountId(accountId);
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
        accountId = this.resolveSessionAccountId(accountId);
        return this.sessions.get(accountId)?.locked === true;
    }

    /**
     * ✅ [v1.4.79] Chrome 세션의 실제 공인 IP 확인
     * puppeteer page가 api.ipify.org에 직접 접속해 IP 반환 →
     * 프록시가 실제로 Chrome에 적용되었는지 100% 확인 (검증 API와 Chrome 설정의 불일치 방지)
     */
    async detectSessionPublicIp(accountId: string): Promise<string | null> {
        accountId = this.resolveSessionAccountId(accountId);
        const session = this.sessions.get(accountId);
        if (!session || !session.browser.connected) return null;
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

    /** 명시적인 사용자 동작에서만 호출한다. 보호 화면은 이동시키지 않는다. */
    async openForUser(accountId: string): Promise<void> {
        accountId = this.resolveSessionAccountId(accountId);
        return getAccountExecutionGuard().runUserActionExclusive(accountId, async () => {
        let session = this.sessions.get(accountId);
        if (!session?.browser.connected || session.page.isClosed()) session = await this.getOrCreateSession(accountId, false, undefined, { userInitiated: true });
        await session.page.bringToFront();
        const current = session.page.url();
        if (isLoginChallengeUrl(current) || isNaverSessionLoginUrl(current)) return;
        // Opening account controls must not discard an existing blog draft.
        try { const url = new URL(current); if (url.protocol === 'https:' && ['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname) && !url.username && !url.password && !url.port) return; } catch { /* A new blank page can navigate to login. */ }
        // An explicit user action may open login; automatic jobs never do so.
        await session.page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded', timeout: 30000 });
        });
    }

    async verifyAccountForUser(accountId: string): Promise<ServerSessionProbeVerdict> {
        accountId = this.resolveSessionAccountId(accountId);
        const session = this.sessions.get(accountId);
        if (!session?.browser.connected || session.page.isClosed()) return { ok: false, status: 'unknown', reason: 'session-unavailable' };
        const page = session.page;
        const current = page.url();
        if (isLoginChallengeUrl(current) || isNaverSessionLoginUrl(current)) return this.inspectServerSessionState(accountId);
        try {
            // First inspect the current page: a ready editor may contain an unsaved draft.
            const existing = await this.inspectServerSessionState(accountId);
            const currentSurface = parseNaverSessionUrl(current);
            const canOpenEditor = current === 'about:blank' || Boolean(currentSurface && ['www.naver.com', 'naver.com'].includes(currentSurface.hostname));
            if (!canOpenEditor || !['unknown', 'unavailable'].includes(existing.status) || existing.reason === 'account-identity-unverified' || existing.reason === 'session-changed') return existing;
            if (this.sessions.get(accountId) !== session || session.page !== page || page.isClosed()) return { ok: false, status: 'unknown', reason: 'session-changed' };
            // Only explicit resume may advance an unverified non-editor to the editor.
            await page.goto(SERVER_SESSION_PROBE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
            if (this.sessions.get(accountId) !== session || session.page !== page || page.isClosed()) return { ok: false, status: 'unknown', reason: 'session-changed' };
            if (isLoginChallengeUrl(page.url()) || isNaverSessionLoginUrl(page.url())) return this.inspectServerSessionState(accountId);
            await waitForInitialEditorReadiness(page, { timeoutMs: 15000 });
            if (this.sessions.get(accountId) !== session || session.page !== page || page.isClosed()) return { ok: false, status: 'unknown', reason: 'session-changed' };
            return this.inspectServerSessionState(accountId);
        } catch { return { ok: false, status: 'unavailable', reason: 'editor-unavailable' }; }
    }

    setExpectedBlogId(accountId: string, blogId: string): void {
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(blogId)) throw new AccountExecutionGuardError('ACCOUNT_MISMATCH');
        this.expectedBlogIds.set(accountId.trim().toLowerCase(), blogId.toLowerCase());
    }

    async resumeAccount(accountId: string): Promise<boolean> {
        accountId = this.resolveSessionAccountId(accountId);
        return getAccountExecutionGuard().resume(accountId, async () => (await this.verifyAccountForUser(accountId)).status === 'ready');
    }

    async ensureServerSessionState(accountId: string): Promise<ServerSessionProbeVerdict> {
        accountId = this.resolveSessionAccountId(accountId);
        getAccountExecutionGuard().assertAllowed(accountId);
        return this.inspectServerSessionState(accountId);
    }

    /** 재개 버튼의 검증에도 사용한다. 페이지 이동이나 자동 로그인은 하지 않는다. */
    inspectServerSessionState(accountId: string): Promise<ServerSessionProbeVerdict> {
        accountId = this.resolveSessionAccountId(accountId);
        const pending = this.serverSessionChecks.get(accountId);
        if (pending) return pending;
        const next = this.probeServerSessionState(accountId).finally(() => {
            if (this.serverSessionChecks.get(accountId) === next) this.serverSessionChecks.delete(accountId);
        });
        this.serverSessionChecks.set(accountId, next);
        return next;
    }

    private async probeServerSessionState(accountId: string): Promise<ServerSessionProbeVerdict> {
        accountId = this.resolveSessionAccountId(accountId);
        const session = this.sessions.get(accountId);
        if (!session || !session.browser.connected || !session.page || session.page.isClosed()) return { ok: false, status: 'unavailable', reason: 'session-unavailable' };
        const page = session.page;
        const initialUrl = typeof page.url === 'function' ? page.url() : undefined;
        const expectedIdentity = this.expectedBlogIds.get(accountId.trim().toLowerCase()) || accountId.trim().toLowerCase();
        try {
            const pendingCheck = (async () => {
                if (typeof page.frames === 'function') {
                    const currentFrames = await inspectCurrentSessionFrames(page);
                    if (currentFrames) return currentFrames;
                }
                return page.evaluate(async (probeUrl: string, timeoutMs: number, editorBodySelector: string) => {
                    const read = (doc: Document, finalUrl: string) => {
                        const hasEditor = !!doc.querySelector(editorBodySelector) && !!doc.querySelector('.se-documentTitle, .se-text-paragraph[contenteditable], .se-component-content[contenteditable]');
                        const hasLoginForm = !!doc.querySelector('input[type="password"]') && !!doc.querySelector('input[name="id"], input#id');
                        const bodyText = hasEditor ? '' : (doc.body?.textContent || '').slice(0, 12000);
                        const hasChallenge = !!doc.querySelector('input[name="captcha"], input#captcha') || /자동입력 방지|보안문자를 입력|본인 확인이 필요/.test(bodyText);
                        const hasProtection = /보호조치가 적용|보호조치 해제|이용이 제한/.test(bodyText);
                        // 에디터 응답의 공식 URL blogId 매개변수만 계정 증거로 사용한다.
                        let accountIdentity: string | undefined;
                        try { const url = new URL(finalUrl); if (['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname)) { accountIdentity = url.searchParams.get('blogId') || undefined; if (!accountIdentity && hasEditor && url.searchParams.get('Redirect') === 'Write') accountIdentity = /^\/([A-Za-z0-9_-]+)$/.exec(url.pathname)?.[1]; } } catch { /* unknown */ }
                        return { finalUrl, status: 200, hasEditor, hasLoginForm, hasChallenge, hasProtection, bodyText, accountIdentity };
                    };
                    const current = read(document, location.href);
                    if (current.hasChallenge || current.hasProtection || current.hasLoginForm) return current;
                    for (const frame of Array.from(document.querySelectorAll('iframe'))) {
                        try {
                            if (!frame.contentDocument || !frame.contentWindow) continue;
                            const nested = read(frame.contentDocument, frame.contentWindow.location.href);
                            if (nested.hasProtection || nested.hasChallenge || nested.hasLoginForm || nested.hasEditor) return nested;
                        } catch { /* Different origin cannot establish account identity. */ }
                    }
                    if (current.hasEditor) return current;
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), timeoutMs);
                    try {
                        const res = await fetch(probeUrl, { method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'follow', signal: controller.signal });
                        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                        return { ...read(doc, res.url), status: res.status };
                    } catch { return { error: 'probe-unavailable' }; }
                    finally { clearTimeout(timer); }
                }, SERVER_SESSION_PROBE_URL, this.SERVER_SESSION_CHECK_TIMEOUT_MS, EDITOR_BODY_SELECTOR);
            })();
            // The page's AbortController cannot bound a stalled renderer/CDP connection.
            const serverCheck = await withCleanupTimeout(() => pendingCheck, this.SERVER_SESSION_CHECK_TIMEOUT_MS + 1000, 'server-session-probe');
            if (this.sessions.get(accountId) !== session || session.page !== page || page.isClosed() || (initialUrl !== undefined && page.url() !== initialUrl)) return { ok: false, status: 'unknown', reason: 'session-changed' };
            const verdict = resolveServerSessionProbeVerdict(serverCheck);
            if (verdict.ok) {
                if (!('accountIdentity' in serverCheck) || !serverCheck.accountIdentity || serverCheck.accountIdentity.toLowerCase() !== expectedIdentity) {
                    session.isLoggedIn = false; session.loginVerifiedAt = 0;
                    // A well-formed identity that differs from the configured blog is positive evidence of another account;
                    // a missing or malformed one only means the identity could not be read.
                    const seen = 'accountIdentity' in serverCheck ? serverCheck.accountIdentity : undefined;
                    const confirmedOther = typeof seen === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(seen);
                    return { ok: false, status: 'unknown', reason: 'account-identity-unverified', ...(confirmedOther ? { identityMismatch: true as const } : {}) };
                }
                session.isLoggedIn = true; session.loginVerifiedAt = Date.now();
                // Persist only cookies the server just confirmed for the expected account: the next app start
                // restores them at session creation instead of stopping at LOGIN_REQUIRED, and a stale file is replaced.
                void this.persistVerifiedCookies(accountId, page);
            } else { session.isLoggedIn = false; session.loginVerifiedAt = 0; }
            return verdict;
        } catch { return { ok: false, status: 'unavailable', reason: 'probe-unavailable' }; }
    }

    /** Best effort: a failed write keeps the previous file and never blocks publishing. */
    private async persistVerifiedCookies(accountId: string, page: Page): Promise<void> {
        try {
            const { saveCookies } = await import('./sessionPersistence.js');
            await saveCookies(page, accountId);
        } catch (error) {
            console.warn(`[BrowserSessionManager] ⚠️ 확인된 로그인 쿠키 저장 실패 (무시): ${(error as Error).message}`);
        }
    }

    /** 이전 boolean 호출부도 false→자동 로그인으로 진행하지 못하도록 중단 오류를 던진다. */
    async ensureServerSession(accountId: string): Promise<boolean> {
        accountId = this.resolveSessionAccountId(accountId);
        const state = await this.ensureServerSessionState(accountId);
        if (state.status === 'ready') { getAccountExecutionGuard().assertAllowed(accountId); return true; }
        const codes: Record<string, AccountPauseCode> = { 'login-required': 'LOGIN_REQUIRED', challenge: 'LOGIN_CHALLENGE', protected: 'ACCOUNT_PROTECTED', unavailable: 'NETWORK_WAIT', unknown: 'NETWORK_WAIT' };
        const code = state.reason === 'account-identity-unverified' ? 'ACCOUNT_MISMATCH' : codes[state.status] || 'NETWORK_WAIT';
        getAccountExecutionGuard().pause(accountId, code);
        throw new AccountExecutionGuardError(code);
    }

    /**
     * Pre-click gate (just before the irreversible publish click). Same probe as ensureServerSession, but only
     * POSITIVE evidence stops the run: protection, a verification challenge, a login screen, or an editor that
     * confirms a different blog. Unclear evidence (frame detached/changed, page changed, probe timeout, identity
     * unreadable) is returned to the caller for logging and the run continues on the session verified at entry.
     */
    async ensureServerSessionForCommit(accountId: string): Promise<ServerSessionProbeVerdict> {
        accountId = this.resolveSessionAccountId(accountId);
        const state = await this.ensureServerSessionState(accountId);
        if (state.status === 'ready') { getAccountExecutionGuard().assertAllowed(accountId); return state; }
        const code = resolveCommitTimeBlock(state);
        if (!code) return state;
        getAccountExecutionGuard().pause(accountId, code);
        throw new AccountExecutionGuardError(code);
    }

    /**
     * ✅ [2026-03-26] 계정 로그인 상태 조회 (TTL 방어 포함)
     * 로그인 성공 후 LOGIN_CACHE_TTL(30분) 이내면 true, 초과하면 false 반환하여 재검증 트리거
     */
    isAccountLoggedIn(accountId: string): boolean {
        accountId = this.resolveSessionAccountId(accountId);
        const session = this.sessions.get(accountId);
        if (!session?.isLoggedIn) return false;

        // Ownership locks preserve the browser; they never prove authentication.
        if (getAccountExecutionGuard().getStatus(accountId).paused) return false;

        // Cached authentication always expires, including locked sessions.
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
        accountId = this.resolveSessionAccountId(accountId);
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
            execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { stdio: 'ignore', timeout: 8000, windowsHide: true });

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
    async closeSession(accountId: string, force: boolean = false): Promise<boolean> {
        accountId = this.resolveSessionAccountId(accountId);
        if (!force && getAccountExecutionGuard().getStatus(accountId).paused) return false;
        const session = this.sessions.get(accountId);
        if (!session) return true;
        if (session.locked && !force) {
            console.log(`[BrowserSessionManager] 🔒 ${accountId.substring(0, 3)}*** 잠긴 세션 — closeSession 보호 (force=true 필요)`);
            return false;
        }

        try {
            // Mark before close(): the 'disconnected' event lands while close() is still pending.
            this.closingAccounts.add(accountId);
            await withCleanupTimeout(
                () => session.browser.close(),
                this.BROWSER_CLOSE_TIMEOUT_MS,
                `browser.close:${accountId.substring(0, 3)}***`,
            );
            // Ownership is released only after close definitively succeeds.
            try {
                const zombieRecovery = require('./runtime/zombieRecovery.js');
                const browserPid = session.browser.process()?.pid;
                if (browserPid) zombieRecovery.untrackBrowserPid(browserPid);
            } catch { /* ignore */ }
            this.sessions.delete(accountId);
            if (this.activeAccountId === accountId) {
                this.activeAccountId = null;
            }
            console.log(`[BrowserSessionManager] 🔚 세션 종료: ${accountId.substring(0, 3)}***`);
            emitSessionEvent('close', accountId, session.createdAt);
            return true;
        } catch (e) {
            console.log(`[BrowserSessionManager] ⚠️ 세션 종료 중 오류: ${(e as Error).message}`);
            return false;
        }
    }

    /** 유휴 세션을 유지하려는 네트워크 요청은 수행하지 않는다. 업무 시에만 검사한다. */
    startKeepalive(): void { this.stopKeepalive(); }
    stopKeepalive(): void {
        if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
        this.keepaliveTimer = null;
    }
    private async runKeepalivePing(): Promise<void> { /* 비업무 요청 없음 */ }
    private async pingSingleSession(_session: SessionInfo): Promise<void> { /* 쿠키 복원·페이지 재생성 없음 */ }

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

        const accountIds = [...this.sessions.keys()];
        const results = await Promise.all(
            accountIds.map((accountId) => this.closeSession(accountId, true)),
        );
        const failedCount = results.filter((closed) => !closed).length;

        if (failedCount === 0) {
            this.activeAccountId = null;
            console.log('[BrowserSessionManager] ✅ 모든 세션 종료 완료');
            emitSessionEvent('close_all', 'all', 0);
        } else {
            console.warn(`[BrowserSessionManager] ⚠️ ${failedCount}개 세션 정리 미완료 — 소유권을 유지하고 다음 종료 단계에서 재시도합니다.`);
            throw new Error(`Browser session cleanup incomplete: ${failedCount} session(s) remain owned`);
        }
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
