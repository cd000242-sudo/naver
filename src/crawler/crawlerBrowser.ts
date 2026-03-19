/**
 * 싱글톤 크롤러 브라우저 매니저
 * @module crawler/crawlerBrowser
 * 
 * ✅ [2026-03-13] AdsPower 우선 연동
 * - AdsPower 실행 중 → CDP 연결 (지문 마스킹 + 프록시)
 * - AdsPower 미실행 → 기존 Stealth Playwright 사용
 * 
 * ✅ 연속발행 시 안정적 크롤링을 위한 브라우저 재사용
 * - 하나의 BrowserContext를 공유하여 프로필 충돌 방지
 * - 페이지만 열고 닫으므로 브라우저 누수 없음
 * - 호출 간 쿨다운으로 봇 감지 회피
 * - 5분 미사용 시 자동 정리
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import { chromium } from 'playwright';
import { AdvancedAutomator } from './advancedAutomator.js';
import {
  checkAdsPowerStatus,
  openAdsPowerBrowser,
  closeAdsPowerBrowser,
  listAdsPowerProfiles
} from '../main/utils/adsPowerManager.js';
import { getProxyUrl, reportProxyFailed, reportProxySuccess } from './utils/proxyManager.js';

// ═══════════════════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════════════════

/** BrowserContext (playwright-extra) */
type BrowserContext = any;
type Page = any;

// ═══════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const COOLDOWN_MS = 3000;       // 호출 간 최소 대기 (3초)
const AUTO_CLOSE_MS = 5 * 60 * 1000; // 5분 미사용 시 자동 닫기

// ═══════════════════════════════════════════════════
// 싱글톤 상태
// ═══════════════════════════════════════════════════

let _context: BrowserContext | null = null;
let _lastUsed: number = 0;
let _autoCloseTimer: ReturnType<typeof setTimeout> | null = null;
let _launching: Promise<BrowserContext> | null = null; // 동시 launch 방지
let _activePages: Set<Page> = new Set();
let _isAdsPower: boolean = false; // AdsPower 연결 여부
let _adsPowerProfileId: string = ''; // AdsPower 프로필 ID
let _adsPowerBrowser: any = null; // AdsPower CDP 브라우저 인스턴스
let _adsPowerUserEnabled: boolean = false; // ✅ 사용자 설정 (토글 ON/OFF)
let _currentProxyUrl: string | null = null; // ✅ [2026-03-16] 현재 적용 중인 프록시

/** ✅ AdsPower 사용 여부 설정 (렌더러에서 IPC로 호출) */
export function setAdsPowerEnabled(enabled: boolean): void {
    _adsPowerUserEnabled = enabled;
    console.log(`[CrawlerBrowser] 🌐 AdsPower ${enabled ? '✅ 활성' : '❌ 비활성'} (사용자 설정)`);
}

// ═══════════════════════════════════════════════════
// 내부 유틸
// ═══════════════════════════════════════════════════

function getProfileDir(): string {
    const appDataDir = process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir();
    return path.join(appDataDir, 'LewordCrawler', 'ChromeProfile');
}

/** Stealth 초기화 스크립트 */
const STEALTH_INIT_SCRIPT = () => {
    // 1. navigator.webdriver 제거
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // 2. window.chrome 모킹
    (window as any).chrome = {
        runtime: {
            onConnect: { addListener: () => {} },
            onMessage: { addListener: () => {} },
        },
        loadTimes: () => ({}),
        csi: () => ({}),
    };

    // 3. navigator.plugins 모킹
    Object.defineProperty(navigator, 'plugins', {
        get: () => [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
            { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ],
    });

    // 4. navigator.languages 모킹
    Object.defineProperty(navigator, 'languages', {
        get: () => ['ko-KR', 'ko', 'en-US', 'en'],
    });

    // 5. navigator.permissions.query 모킹
    const originalQuery = navigator.permissions?.query;
    if (originalQuery) {
        (navigator as any).permissions.query = (params: any) => {
            if (params.name === 'notifications') {
                return Promise.resolve({ state: 'denied', onchange: null } as any);
            }
            return originalQuery.call(navigator.permissions, params);
        };
    }
};

/** 자동 정리 타이머 리셋 */
function resetAutoCloseTimer(): void {
    if (_autoCloseTimer) clearTimeout(_autoCloseTimer);
    _autoCloseTimer = setTimeout(async () => {
        if (_activePages.size === 0) {
            console.log('[CrawlerBrowser] ⏰ 5분 미사용 → 자동 정리');
            await closeAll();
        }
    }, AUTO_CLOSE_MS);
}

// ═══════════════════════════════════════════════════
// 공개 API
// ═══════════════════════════════════════════════════

/**
 * 공유 브라우저 컨텍스트 가져오기 (없으면 새로 열기)
 * - 이미 열려있으면 재사용 → 프로필 충돌 없음
 * - 동시에 여러 곳에서 호출해도 하나만 생성
 */
export async function getSharedContext(): Promise<BrowserContext> {
    // 이미 살아있는 컨텍스트 확인
    if (_context) {
        try {
            // 컨텍스트가 아직 유효한지 확인 (pages 호출로 체크)
            await _context.pages();
            resetAutoCloseTimer();
            return _context;
        } catch {
            console.log('[CrawlerBrowser] ⚠️ 기존 컨텍스트 무효 → 재생성');
            _context = null;
            _isAdsPower = false;
            _adsPowerBrowser = null;
        }
    }

    // 동시 launch 방지: 이미 launching 중이면 기다리기
    if (_launching) {
        console.log('[CrawlerBrowser] ⏳ 이미 브라우저 시작 중... 대기');
        return _launching;
    }

    // 새 컨텍스트 생성
    _launching = (async () => {
        try {
            // ═══════════════════════════════════════════════════
            // ✅ [2026-03-13] 1차 시도: AdsPower CDP 연결 (사용자가 ✅ 활성했을 때만)
            // ═══════════════════════════════════════════════════
            if (_adsPowerUserEnabled) {
              try {
                const adStatus = await checkAdsPowerStatus();
                if (adStatus.running) {
                    console.log('[CrawlerBrowser] 🌐 AdsPower 실행 감지 → CDP 연결 시도...');
                    
                    // ✅ [2026-03-15] 첫 번째 프로필 자동 선택
                    const { listAdsPowerProfiles } = await import('../main/utils/adsPowerManager.js');
                    const profileList = await listAdsPowerProfiles();
                    const profileId = profileList.success && profileList.profiles.length > 0
                        ? profileList.profiles[0].serial_number
                        : '1'; // fallback
                    console.log('[CrawlerBrowser] 🎯 AdsPower 프로필 선택:', profileId);
                    const adResult = await openAdsPowerBrowser(profileId);
                    
                    if (adResult.success && adResult.ws) {
                        console.log(`[CrawlerBrowser] 🔗 AdsPower WebSocket: ${adResult.ws}`);
                        
                        _adsPowerBrowser = await chromium.connectOverCDP(adResult.ws);
                        const contexts = _adsPowerBrowser.contexts();
                        _context = contexts[0] || await _adsPowerBrowser.newContext();
                        _isAdsPower = true;
                        _adsPowerProfileId = profileId;
                        
                        console.log('[CrawlerBrowser] ✅ AdsPower 브라우저 연결 완료! (지문 마스킹 활성)');
                        resetAutoCloseTimer();
                        return _context;
                    } else {
                        console.warn('[CrawlerBrowser] ⚠️ AdsPower 브라우저 열기 실패:', adResult.message);
                    }
                } else {
                    console.log('[CrawlerBrowser] ℹ️ AdsPower 토글 ON이지만 미실행 → Stealth 모드 사용');
                }
              } catch (adError) {
                console.warn('[CrawlerBrowser] ⚠️ AdsPower 연결 오류 → Stealth fallback:', (adError as Error).message);
              }
            } else {
                console.log('[CrawlerBrowser] ℹ️ AdsPower 토글 OFF → 일반 Stealth 모드 사용');
            }

            // ═══════════════════════════════════════════════════
            // ✅ 2차 시도: 기존 Stealth Playwright (AdsPower 없을 때)
            // ═══════════════════════════════════════════════════
            console.log('[CrawlerBrowser] 🚀 기존 Stealth 브라우저 시작...');

            const stealthChromium = (await import('playwright-extra')).chromium;
            const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
            stealthChromium.use(stealth());

            const { getChromiumExecutablePath } = await import('../browserUtils.js');
            const executablePath = await getChromiumExecutablePath();

            const profileDir = getProfileDir();
            if (!fs.existsSync(profileDir)) {
                fs.mkdirSync(profileDir, { recursive: true });
            }

            console.log(`[CrawlerBrowser] 🍪 프로필: ${profileDir}`);

            // ✅ [2026-03-19] 프록시 자동 적용 (Playwright proxy 옵션으로 인증 지원)
            _currentProxyUrl = await getProxyUrl();
            const launchArgs = [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-infobars',
                    '--disable-extensions',
                    '--disable-gpu',
                    '--window-size=1920,1080',
            ];

            // ✅ [2026-03-19] 프록시 인증을 Playwright proxy 옵션으로 올바르게 적용
            // --proxy-server 인자는 인증(username:password)을 지원하지 않으므로
            // Playwright의 context proxy 옵션을 사용해야 함
            let proxyOption: { server: string; username?: string; password?: string } | undefined;
            if (_currentProxyUrl) {
                try {
                    const proxyUrl = new URL(_currentProxyUrl);
                    proxyOption = {
                        server: `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`,
                        username: decodeURIComponent(proxyUrl.username) || undefined,
                        password: decodeURIComponent(proxyUrl.password) || undefined,
                    };
                    const maskedUser = proxyOption.username ? proxyOption.username.substring(0, 6) + '***' : 'N/A';
                    console.log(`[CrawlerBrowser] 🌐 프록시 적용: ${proxyOption.server} (user: ${maskedUser})`);
                } catch (e) {
                    console.warn(`[CrawlerBrowser] ⚠️ 프록시 URL 파싱 실패: ${(e as Error).message}`);
                    // fallback: 인증 없는 --proxy-server
                    launchArgs.push(`--proxy-server=${_currentProxyUrl}`);
                }
            }

            _context = await stealthChromium.launchPersistentContext(profileDir, {
                headless: false,
                ...(executablePath ? { executablePath } : {}),
                args: launchArgs,
                viewport: { width: 1920, height: 1080 },
                userAgent: DESKTOP_UA,
                locale: 'ko-KR',
                timezoneId: 'Asia/Seoul',
                ignoreDefaultArgs: ['--enable-automation'],
                ...(proxyOption ? { proxy: proxyOption } : {}),
            });

            _isAdsPower = false;
            console.log('[CrawlerBrowser] ✅ Stealth 브라우저 컨텍스트 준비 완료');
            resetAutoCloseTimer();
            return _context;

        } catch (err) {
            console.error('[CrawlerBrowser] ❌ 브라우저 시작 실패:', (err as Error).message);
            _context = null;
            _isAdsPower = false;
            _adsPowerBrowser = null;
            throw err;
        } finally {
            _launching = null;
        }
    })();

    return _launching;
}

/**
 * 새 페이지 생성 (stealth 스크립트 자동 주입)
 * - 호출 간 쿨다운 자동 적용 (봇 감지 회피)
 */
export async function createPage(): Promise<Page> {
    // 쿨다운 체크
    const elapsed = Date.now() - _lastUsed;
    if (_lastUsed > 0 && elapsed < COOLDOWN_MS) {
        const wait = COOLDOWN_MS - elapsed;
        console.log(`[CrawlerBrowser] ⏳ 쿨다운 ${wait}ms 대기 (봇 감지 회피)...`);
        await new Promise(r => setTimeout(r, wait));
    }

    const context = await getSharedContext();
    const page = await context.newPage();

    // Stealth 초기화 스크립트 주입
    await page.addInitScript(STEALTH_INIT_SCRIPT);

    _activePages.add(page);
    _lastUsed = Date.now();
    resetAutoCloseTimer();

    console.log(`[CrawlerBrowser] 📄 새 페이지 생성 (활성: ${_activePages.size}개)`);
    return page;
}

/**
 * 페이지 해제 (닫기) - 컨텍스트는 유지
 */
export async function releasePage(page: Page): Promise<void> {
    _activePages.delete(page);
    try {
        if (page && !page.isClosed()) {
            await page.close();
        }
    } catch {
        // 이미 닫힌 경우 무시
    }
    _lastUsed = Date.now();
    console.log(`[CrawlerBrowser] 🗑️ 페이지 해제 (활성: ${_activePages.size}개)`);
}

/**
 * 워밍업: 네이버 메인 → 쇼핑 방문 (봇 감지 회피)
 * 최근 워밍업 후 5분 이내면 스킵
 */
let _lastWarmup = 0;
export async function warmup(page: Page): Promise<void> {
    const since = Date.now() - _lastWarmup;
    if (since < 5 * 60 * 1000) {
        console.log('[CrawlerBrowser] ℹ️ 최근 워밍업 있어서 스킵');
        return;
    }

    console.log('[CrawlerBrowser] 🏠 워밍업 (네이버 → 쇼핑)...');
    const warmups = [
        'https://www.naver.com',
        'https://shopping.naver.com/home',
    ];

    for (const url of warmups) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            // AdvancedAutomator가 컨텍스트와 페이지를 모두 필요로 하나,
            // 워밍업 단계에서는 page.context()를 통해 전달 가능
            const automator = new AdvancedAutomator();
            await automator.attach(page.context(), page);
            
            // 자연스러운 마우스 배회 및 스크롤
            await automator.organicWander();
            
        } catch {
            // 워밍업 실패는 치명적이지 않음
        }
    }

    _lastWarmup = Date.now();
    console.log('[CrawlerBrowser] ✅ 워밍업 완료');
}

/**
 * 에러 페이지 감지 (빈 title + CAPTCHA + 시스템오류)
 */
export async function checkForError(page: Page): Promise<boolean> {
    try {
        return await page.evaluate(() => {
            const title = document.title || '';
            const body = document.body?.innerText || '';
            const html = document.documentElement?.innerHTML || '';

            // 빈 title + body < 50자 = SPA 미렌더링
            if (title.length === 0 && body.trim().length < 50) return true;

            const combined = (title + ' ' + body).toLowerCase();
            const errorKeywords = [
                '에러', '시스템오류', '서비스 접속이 불가', '캡차', 'captcha',
                '차단', '비정상적인 접근', '잠시 후 다시',
                '보안 확인', '정답을 입력', '실제 사용자임을 확인',  // ✅ 네이버 CAPTCHA
                '에러페이지', '시스템 오류',
            ];
            if (errorKeywords.some(k => combined.includes(k))) return true;

            // ✅ HTML에 CAPTCHA 스크립트가 있는지 확인
            if (html.includes('wtm_captcha') || html.includes('ncpt.naver.com')) return true;

            return false;
        });
    } catch {
        return true;
    }
}

/**
 * ✅ [2026-03-19] 캡차 전용 감지 (에러와 분리)
 * checkForError와 달리 캡차만 감지 — 캡차가 뜨면 사용자가 풀 시간을 줘야 함
 */
export async function checkForCaptcha(page: Page): Promise<boolean> {
    try {
        return await page.evaluate(() => {
            const body = document.body?.innerText || '';
            const html = document.documentElement?.innerHTML || '';
            const combined = body.toLowerCase();

            // 네이버 캡차 키워드 ("N번째 자리 숫자를 입력하세요" 패턴)
            const captchaKeywords = [
                '캡차', 'captcha', '보안 확인', '정답을 입력',
                '실제 사용자임을 확인', '번째 자리', '숫자를 입력',
                '자동 입력 방지',
            ];
            if (captchaKeywords.some(k => combined.includes(k))) return true;

            // HTML 내 캡차 스크립트/요소
            if (html.includes('wtm_captcha') || html.includes('ncpt.naver.com')) return true;

            return false;
        });
    } catch {
        return false; // 감지 실패 시 캡차 아님으로 처리 (안전)
    }
}

/**
 * ✅ [2026-03-19] 캡차 대기 헬퍼
 * 캡차가 감지되면 page를 앞으로 가져오고 최대 maxWaitMs 동안 대기
 * 3초마다 캡차가 사라졌는지 폴링
 * @returns true = 캡차 해결됨, false = 타임아웃
 */
async function waitForCaptchaSolved(page: Page, maxWaitMs = 120000): Promise<boolean> {
    console.log('[CrawlerBrowser] 🔐 캡차 감지! 사용자가 풀어줄 때까지 최대 120초 대기...');
    console.log('[CrawlerBrowser] 🔐 브라우저 창에서 캡차 숫자를 클릭하세요!');

    // 브라우저 창을 앞으로 가져오기 (사용자가 캡차를 볼 수 있도록)
    try { await page.bringToFront(); } catch {}

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        await page.waitForTimeout(3000); // 3초마다 체크

        const stillCaptcha = await checkForCaptcha(page);
        if (!stillCaptcha) {
            const elapsed = Math.round((Date.now() - start) / 1000);
            console.log(`[CrawlerBrowser] ✅ 캡차 해결됨! (${elapsed}초 소요)`);
            // 캡차 해결 후 페이지가 리다이렉트될 수 있으므로 잠시 대기
            await page.waitForTimeout(3000);
            return true;
        }

        const remaining = Math.round((maxWaitMs - (Date.now() - start)) / 1000);
        if (remaining > 0) {
            console.log(`[CrawlerBrowser] ⏳ 캡차 대기 중... (남은: ${remaining}초)`);
        }
    }

    console.log('[CrawlerBrowser] ⏰ 캡차 120초 타임아웃 → 리트라이로 전환');
    return false;
}

/**
 * ✅ [2026-03-19] 자동 리트라이 + 캡차 대기
 * 캡차 감지 시 사용자가 풀 수 있도록 최대 120초 대기 후 리트라이
 */
export async function navigateWithRetry(page: Page, url: string, maxRetries = 3): Promise<boolean> {
    // ═══ ① 첫 시도 ═══
    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch {
        try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {}
    }
    await page.waitForTimeout(5000); // SPA 렌더링 대기

    // ═══ ② 캡차 먼저 체크 → 대기 ═══
    const hasCaptcha = await checkForCaptcha(page);
    if (hasCaptcha) {
        const solved = await waitForCaptchaSolved(page);
        if (solved) {
            // 캡차 해결 후 에러 재체크
            const stillError = await checkForError(page);
            if (!stillError) {
                console.log('[CrawlerBrowser] ✅ 캡차 해결 → 페이지 정상!');
                if (_currentProxyUrl) reportProxySuccess(_currentProxyUrl);
                return true;
            }
            // 캡차는 풀었지만 여전히 에러 (예: 접속 불가 페이지로 리다이렉트)
            console.log('[CrawlerBrowser] ⚠️ 캡차 해결됐지만 에러 페이지 → 리트라이');
        }
    } else {
        // 캡차가 아닌 경우 일반 에러 체크
        const isError = await checkForError(page);
        if (!isError) return true; // 정상!
    }

    // ═══ ③ 리트라이 루프 ═══
    const retryUrls = [
        'https://shopping.naver.com/home',
        'https://www.naver.com',
        'https://search.naver.com/search.naver?query=%EC%9D%B8%EA%B8%B0%EC%83%81%ED%92%88',
    ];

    for (let r = 0; r < maxRetries; r++) {
        console.log(`[CrawlerBrowser] ⚠️ 자동 리트라이 ${r + 1}/${maxRetries}...`);

        // 워밍업 페이지 방문
        try {
            await page.goto(retryUrls[r % retryUrls.length], {
                waitUntil: 'domcontentloaded', timeout: 15000,
            });
            await page.mouse.move(300 + Math.random() * 400, 200 + Math.random() * 300);
            await page.waitForTimeout(3000 + Math.random() * 2000);
            await page.mouse.wheel(0, 300 + Math.random() * 200);
            await page.waitForTimeout(2000 + Math.random() * 1000);
        } catch {}

        // 점점 길어지는 대기
        await page.waitForTimeout((r + 1) * 5000);

        // 재시도
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        } catch {
            try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {}
        }
        await page.waitForTimeout(5000);

        // ✅ 리트라이에서도 캡차 먼저 체크
        const retryCaptcha = await checkForCaptcha(page);
        if (retryCaptcha) {
            const solved = await waitForCaptchaSolved(page);
            if (solved) {
                const stillError = await checkForError(page);
                if (!stillError) {
                    console.log(`[CrawlerBrowser] ✅ 리트라이 ${r + 1} 캡차 해결 → 성공!`);
                    if (_currentProxyUrl) reportProxySuccess(_currentProxyUrl);
                    return true;
                }
            }
            continue; // 캡차 타임아웃이면 다음 리트라이
        }

        const isError = await checkForError(page);
        if (!isError) {
            console.log(`[CrawlerBrowser] ✅ 리트라이 ${r + 1} 성공!`);
            if (_currentProxyUrl) reportProxySuccess(_currentProxyUrl);
            return true;
        } else if (_currentProxyUrl) {
            reportProxyFailed(_currentProxyUrl);
            console.log(`[CrawlerBrowser] 🔄 프록시 실패 보고: ${_currentProxyUrl}`);
        }
    }

    // ═══ ④ 최후 수단: 자동 새로고침 (60초) ═══
    console.log('[CrawlerBrowser] 🚨 자동 새로고침 시도 (최대 60초)...');
    for (let i = 0; i < 12; i++) {
        try {
            await page.reload({ waitUntil: 'networkidle', timeout: 10000 });
        } catch {}
        await page.waitForTimeout(5000);

        // ✅ 새로고침에서도 캡차 먼저 체크
        const refreshCaptcha = await checkForCaptcha(page);
        if (refreshCaptcha) {
            const solved = await waitForCaptchaSolved(page);
            if (solved) {
                const stillError = await checkForError(page);
                if (!stillError) {
                    console.log(`[CrawlerBrowser] ✅ 새로고침 ${i + 1} 캡차 해결 → 성공!`);
                    return true;
                }
            }
            continue;
        }

        const isError = await checkForError(page);
        if (!isError) {
            console.log(`[CrawlerBrowser] ✅ ${(i + 1) * 5}초에 복구됨!`);
            return true;
        }
    }

    console.log('[CrawlerBrowser] ❌ 모든 리트라이 실패');
    return false;
}

/**
 * 모든 리소스 정리 (앱 종료 또는 강제 초기화)
 */
export async function closeAll(): Promise<void> {
    if (_autoCloseTimer) {
        clearTimeout(_autoCloseTimer);
        _autoCloseTimer = null;
    }

    for (const page of _activePages) {
        try { if (!page.isClosed()) await page.close(); } catch {}
    }
    _activePages.clear();

    if (_context) {
        try { await _context.close(); } catch {}
        _context = null;
    }

    // ✅ [2026-03-13] AdsPower 브라우저 정리
    if (_adsPowerBrowser) {
        try { await _adsPowerBrowser.close(); } catch {}
        _adsPowerBrowser = null;
    }
    if (_isAdsPower && _adsPowerProfileId) {
        try { await closeAdsPowerBrowser(_adsPowerProfileId); } catch {}
    }
    _isAdsPower = false;
    _adsPowerProfileId = '';

    _lastUsed = 0;
    _lastWarmup = 0;
    console.log('[CrawlerBrowser] 🧹 모든 리소스 정리 완료');
}

/** ✅ AdsPower 연결 여부 조회 (외부에서 확인용) */
export function isUsingAdsPower(): boolean {
    return _isAdsPower;
}
