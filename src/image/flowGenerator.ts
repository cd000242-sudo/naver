/**
 * [v1.6.1] Google Labs Flow 이미지 생성기 — 속도 재설계 (파이프라이닝 + 네트워크 리스너)
 *
 * Phase A — 안전 최적화 (리스크 0)
 *   - waitForNewImage를 page.waitForFunction 기반으로 전환 (IPC 폴링 오버헤드 제거)
 *   - Flow 서버 응답(Content-Type image/*)을 page.on('response')로 즉시 감지
 *   - Clear-prompt 체크, 입력값 검증, cookie 재호출 제거 (세션 캐시 신뢰)
 *   - 포커스/입력/이미지간 대기 시간 단축
 *   - prewarmFlow() 공개 — 앱 시작 시 백그라운드로 브라우저 기동
 *
 * Phase B — 파이프라이닝 (queueDepth=2)
 *   - submitPromptOnly: 제출만 하고 즉시 반환
 *   - waitForInputReady: 입력창이 재활성화될 때까지 대기
 *   - generateBatchPipelined: N개 프롬프트를 병렬 제출 후 순차 감지
 *   - Flow 서버가 동시 생성 처리 시 실질 2x 속도, 실패 시 sequential fallback
 *
 * 모델: Nano Banana 2 (Flow 기본, 내부명 NARWHAL)
 * 비용: $0 (AI Pro 쿼터 내)
 */

import type { ImageRequestItem, GeneratedImage } from './types.js';
import { writeImageFile } from './imageUtils.js';
import { PromptBuilder } from './promptBuilder.js';
import { trackApiUsage } from '../apiUsageTracker.js';
import { probeDuplicate, commitHashes, applyDiversityHint } from './imageHashUtils.js';
import type { BrowserContext, Page, Locator } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// ─── 파일 로거 ─────────────────────────────────────────────
function getFlowLogDir(): string {
    try {
        return path.join(app.getPath('userData'), 'flow-debug');
    } catch {
        return path.join(require('os').homedir(), 'Desktop', 'flow-debug');
    }
}
const FLOW_LOG_DIR = getFlowLogDir();
let flowLogFilePath: string | null = null;

function initFlowLogFile(): string {
    if (flowLogFilePath) return flowLogFilePath;
    try {
        if (!fs.existsSync(FLOW_LOG_DIR)) {
            fs.mkdirSync(FLOW_LOG_DIR, { recursive: true });
        }
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        flowLogFilePath = path.join(FLOW_LOG_DIR, `flow-debug-${stamp}.log`);
        const header = `════════════════════════════════════════════════════════════\n` +
            `Flow 디버그 로그 — ${now.toISOString()}\n` +
            `앱 버전: ${app.getVersion?.() || 'unknown'}\n` +
            `User Data: ${(() => { try { return app.getPath('userData'); } catch { return 'n/a'; } })()}\n` +
            `Node: ${process.version} | Platform: ${process.platform} ${process.arch}\n` +
            `════════════════════════════════════════════════════════════\n\n`;
        fs.writeFileSync(flowLogFilePath, header, 'utf-8');
        return flowLogFilePath;
    } catch (err) {
        try {
            flowLogFilePath = path.join(require('os').homedir(), 'Desktop', `flow-debug-${Date.now()}.log`);
            fs.writeFileSync(flowLogFilePath, `[초기화 에러] ${(err as Error).message}\n`, 'utf-8');
        } catch { flowLogFilePath = ''; }
        return flowLogFilePath || '';
    }
}

function writeToFile(level: string, message: string, extra?: any): void {
    try {
        if (!flowLogFilePath) initFlowLogFile();
        if (!flowLogFilePath) return;
        const ts = new Date().toISOString().replace('T', ' ').substring(0, 23);
        const extraStr = extra !== undefined
            ? `\n    ${typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2).split('\n').join('\n    ')}`
            : '';
        fs.appendFileSync(flowLogFilePath, `[${ts}] [${level}] ${message}${extraStr}\n`, 'utf-8');
    } catch { /* 파일 쓰기 실패 무시 */ }
}

// ─── 로깅 (콘솔 + IPC + 파일) ─────────────────────────────────
function sendImageLog(message: string): void {
    try {
        const { BrowserWindow } = require('electron');
        const wins = BrowserWindow.getAllWindows();
        if (wins[0]) wins[0].webContents.send('image-generation:log', message);
    } catch { /* 렌더러 초기화 전 */ }
    console.log(message);
    writeToFile('UI', message);
}

function flowLog(message: string, extra?: any): void {
    console.log(message);
    writeToFile('LOG', message, extra);
}

function flowWarn(message: string, extra?: any): void {
    console.warn(message);
    writeToFile('WARN', message, extra);
}

function flowError(message: string, extra?: any): void {
    console.error(message);
    writeToFile('ERROR', message, extra);
}

export function getFlowLogPath(): string | null {
    return flowLogFilePath;
}

// ─── 캐시 (세션 재사용) ────────────────────────────────────
let cachedContext: BrowserContext | null = null;
let cachedPage: Page | null = null;
let cachedProjectUrl: string | null = null;
let _enabled: boolean = false;
let cookieBannerDismissed: boolean = false;
let _ensurePromise: Promise<Page> | null = null;

// [v1.6.1] 네트워크 응답 리스너 관리
// Flow가 생성한 이미지 URL을 page.on('response')로 즉시 감지
// waitForNewImage는 DOM 폴링과 이 큐를 Promise.race로 결합
interface PendingImageWaiter {
    prevCount: number;
    resolve: (url: string) => void;
    reject: (err: Error) => void;
    registeredAt: number;
}
let _networkImageQueue: string[] = []; // 감지된 이미지 URL FIFO 큐
let _networkListenerInstalled = false;

// ─── Flow 전용 세션 디렉터리 ────
function getFlowProfileDir(): string {
    try {
        return path.join(app.getPath('userData'), 'flow-chromium-profile');
    } catch {
        return path.join(require('os').homedir(), '.naver-blog-automation', 'flow-chromium-profile');
    }
}

// ─── 공개 플래그 ─────────────────────────────────────────
export function setFlowEnabled(enabled: boolean): void {
    _enabled = enabled;
    flowLog(`[Flow] 🌐 ${enabled ? '✅ 활성' : '❌ 비활성'}`);
}

export function isFlowEnabled(): boolean {
    return _enabled;
}

// ─── 시스템 브라우저 폴백 + stealth args ─────────────────────
const STEALTH_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
];
const STEALTH_IGNORE_DEFAULT_ARGS = ['--enable-automation'];

async function launchWithStealthFallback(profileDir: string, offScreen: boolean): Promise<BrowserContext> {
    const { chromium } = await import('playwright');
    // ✅ [v2.7.38] 로그인 후 Chrome 창 숨김 강화
    //   사용자 보고: "로그인 완료 후에도 크롬창이 보임"
    //   원인: -10000,-10000 음수 좌표가 일부 환경(멀티 모니터·System Chrome·고DPI)에서 무효화
    //   해결: ① 더 멀리 음수 좌표(-32000,-32000) ② 창 크기 1×1로 축소
    //         ③ --start-minimized 추가 ④ launch 후 page.evaluate로 강제 이동·축소
    const offScreenArgs = offScreen ? [
        '--window-position=-32000,-32000',
        '--window-size=1,1',
        '--start-minimized',
    ] : [];
    const commonOptions: any = {
        headless: false,
        viewport: { width: 1280, height: 800 },
        args: [...STEALTH_ARGS, ...offScreenArgs],
        ignoreDefaultArgs: STEALTH_IGNORE_DEFAULT_ARGS,
        timeout: 60000,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };

    const attempts = [
        { label: 'System Chrome', channel: 'chrome' as const },
        { label: 'System Edge', channel: 'msedge' as const },
        { label: 'Playwright Chromium', channel: undefined },
    ];

    let lastErr: Error | null = null;
    for (const attempt of attempts) {
        try {
            flowLog(`[Flow] 🚀 브라우저 시도: ${attempt.label}`);
            const opts: any = { ...commonOptions };
            if (attempt.channel) opts.channel = attempt.channel;
            const ctx = await chromium.launchPersistentContext(profileDir, opts);

            await ctx.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            flowLog(`[Flow] ✅ ${attempt.label} 실행 성공`);
            return ctx;
        } catch (err) {
            flowWarn(`[Flow] ${attempt.label} 실패: ${(err as Error).message.substring(0, 120)}`);
            lastErr = err as Error;
        }
    }
    throw new Error(`FLOW_BROWSER_LAUNCH_FAILED:모든 브라우저 실행 실패. 마지막 에러: ${lastErr?.message || 'unknown'}`);
}

// [v1.6.1] 네트워크 응답 리스너 설치 — 페이지당 1회
// Flow 서버가 이미지를 반환하는 즉시 큐에 추가, waitForNewImage가 DOM 폴링과 race
function installNetworkImageListener(page: Page): void {
    if (_networkListenerInstalled) return;
    page.on('response', (response) => {
        try {
            const url = response.url();
            const ct = response.headers()['content-type'] || '';
            // Flow 이미지 패턴: content-type image/* + URL에 flowMedia/media.getMediaUrlRedirect
            if (!ct.startsWith('image/')) return;
            if (!/flowMedia|media\.getMediaUrlRedirect|flow-media/i.test(url)) return;
            // 작은 preview/썸네일 제외 — Content-Length 기준 5KB 이상만
            const len = parseInt(response.headers()['content-length'] || '0', 10);
            if (len > 0 && len < 5 * 1024) return;
            if (!_networkImageQueue.includes(url)) {
                _networkImageQueue.push(url);
                flowLog(`[Flow][Net] 📡 이미지 응답 감지: ${url.substring(0, 100)}... (queue=${_networkImageQueue.length})`);
            }
        } catch { /* listener 예외 무시 */ }
    });
    _networkListenerInstalled = true;
    flowLog('[Flow][Net] ✅ 네트워크 응답 리스너 설치됨');
}

// v2.7.12 (사용자 요구 + planner 진단 반영): v2.7.10 동작 복귀.
//   사용자 실측: v2.7.10에서 글 1=4/8, 글 2~3=8/8 → 콜드 스타트만 문제.
//   v2.7.11의 매 글 storage purge는 정상 동작 글에 회귀 위험.
//
// 정책: 매 글마다는 BrowserContext 재생성 + 새 프로젝트만 (v2.7.10 동작).
//   storage purge는 별도 export `purgeFlowSessionStorage()`로 분리하여
//   마라톤 시작 직전 1회만 호출 → 콜드 스타트(이전 누적 잔재) 정리.
export async function recreateFlowContext(): Promise<Page> {
    flowLog('[Flow] 🔄 BrowserContext 강제 재생성 — 누적 0으로 리셋');
    sendImageLog('🔄 [Flow] 새 세션 + 새 프로젝트 강제');
    if (cachedContext) {
        try { await cachedContext.close(); } catch { /* ignore */ }
    }
    cachedContext = null;
    cachedPage = null;
    cachedProjectUrl = null;
    cookieBannerDismissed = false;
    _networkListenerInstalled = false;
    _networkImageQueue = [];
    await new Promise((r) => setTimeout(r, 800));
    const page = await ensureFlowBrowserPage();

    let attempt = 0;
    while (attempt < 3) {
        attempt++;
        try {
            await ensureFlowProject(page, true);
            const cnt = await countExistingImages(page);
            if (cnt === 0) {
                flowLog(`[Flow] ✅ 새 프로젝트 확정 (0장): ${page.url()}`);
                return page;
            }
            flowWarn(`[Flow] ⚠️ "새 프로젝트" 클릭 후 ${cnt}장 누적 — 재시도 ${attempt}/3`);
            cachedProjectUrl = null;
            await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
            flowWarn(`[Flow] ensureFlowProject(force) 실패 ${attempt}/3: ${(err as Error).message?.substring(0, 100)}`);
            if (attempt >= 3) throw err;
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
    return page;
}

// v2.7.12: 콜드 스타트 전용 storage purge — 마라톤 시작 직전 1회만 호출.
//   첫 글이 4/8 패턴으로 막히는 원인(이전 누적 프로젝트 잔재)을 외과적으로 제거.
//   매 글마다 호출하지 않음 (v2.7.11 회귀 방지). 쿠키는 유지해 Google 로그인 보존.
export async function purgeFlowSessionStorage(): Promise<void> {
    flowLog('[Flow] 🧹 마라톤 시작 직전 storage purge — 콜드 스타트 정리');
    sendImageLog('🧹 [Flow] 이전 세션 잔재 정리 중...');
    if (cachedContext) {
        try { await cachedContext.close(); } catch { /* ignore */ }
    }
    cachedContext = null;
    cachedPage = null;
    cachedProjectUrl = null;
    cookieBannerDismissed = false;
    _networkListenerInstalled = false;
    _networkImageQueue = [];
    await new Promise((r) => setTimeout(r, 1500));

    const page = await ensureFlowBrowserPage();
    try {
        if (!page.url().includes('labs.google')) {
            await page.goto('https://labs.google/fx/tools/flow', {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });
        }
        await page.evaluate(async () => {
            try { localStorage.clear(); } catch {}
            try { sessionStorage.clear(); } catch {}
            try {
                const dbs = await ((indexedDB as any).databases?.() || Promise.resolve([]));
                await Promise.all((dbs as any[]).map((db: any) =>
                    db?.name ? new Promise<void>((res) => {
                        const req = indexedDB.deleteDatabase(db.name);
                        req.onsuccess = req.onerror = req.onblocked = () => res();
                    }) : Promise.resolve()
                ));
            } catch {}
            try {
                const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
                await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
            } catch {}
            try {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
            } catch {}
        });
        flowLog('[Flow] ✅ storage purge 완료 (cookies 유지)');
        // SW unregister 적용 + redirect 로직 재시작
        await page.goto('https://labs.google/fx/tools/flow', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await page.waitForTimeout(1500);
    } catch (err) {
        flowWarn(`[Flow] storage purge 실패 (계속 진행): ${(err as Error).message?.substring(0, 100)}`);
    }
}

// ─── Flow 전용 Playwright 브라우저 ───────────────────────────
async function ensureFlowBrowserPage(): Promise<Page> {
    if (_ensurePromise) {
        flowLog('[Flow] 🔁 ensureFlowBrowserPage 동시 호출 감지 — 기존 Promise 재사용');
        return _ensurePromise;
    }
    _ensurePromise = _ensureFlowBrowserPageInner().finally(() => {
        _ensurePromise = null;
    });
    return _ensurePromise;
}

async function _ensureFlowBrowserPageInner(): Promise<Page> {
    if (cachedPage && cachedContext) {
        try {
            const closed = cachedPage.isClosed();
            if (!closed) {
                await cachedPage.title();
                return cachedPage;
            }
        } catch (err) {
            flowWarn(`[Flow] 캐시 페이지 stale — 재생성: ${(err as Error).message.substring(0, 80)}`);
            try { await cachedContext?.close().catch(() => {}); } catch { /* ignore */ }
            cachedContext = null;
            cachedPage = null;
            cachedProjectUrl = null;
            _networkListenerInstalled = false;
            _networkImageQueue = [];
        }
    }

    const profileDir = getFlowProfileDir();
    flowLog(`[Flow] 📁 프로필 디렉터리: ${profileDir}`);

    sendImageLog('🌐 [Flow] 세션 확인 중...');
    const ctx = await launchWithStealthFallback(profileDir, true);
    const page = ctx.pages()[0] || await ctx.newPage();
    installNetworkImageListener(page); // [v1.6.1]
    await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await dismissCookieBanner(page);

    const loggedIn = await isLoggedInToFlow(page);
    if (loggedIn) {
        flowLog('[Flow] ✅ 기존 로그인 세션 확인됨 (off-screen 창 유지)');
        sendImageLog('✅ [Flow] 로그인 세션 확인 — 이미지 생성 준비됨');
        cachedContext = ctx;
        cachedPage = page;
        return page;
    }

    flowLog('[Flow] ⚠️ 로그인 필요 — off-screen 닫고 on-screen 재시작');
    sendImageLog('⚠️ [Flow] Google 로그인 필요 — 브라우저 창이 표시됩니다.');
    await ctx.close().catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    _networkListenerInstalled = false;
    _networkImageQueue = [];

    const loginCtx = await launchWithStealthFallback(profileDir, false);
    const loginPage = loginCtx.pages()[0] || await loginCtx.newPage();
    await loginPage.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await loginPage.waitForTimeout(2000);
    await dismissCookieBanner(loginPage);
    try { await loginPage.bringToFront(); } catch { /* ignore */ }

    const loginTimeoutMs = 5 * 60 * 1000;
    const start = Date.now();
    let loginSuccess = false;
    sendImageLog('🔐 [Flow] 브라우저에서 Google 로그인을 완료해주세요. (최대 5분 대기)');
    while (Date.now() - start < loginTimeoutMs) {
        await new Promise(r => setTimeout(r, 5000));
        if (loginPage.isClosed()) {
            flowWarn('[Flow] ⚠️ 로그인 대기 중 사용자가 창을 닫음 — 즉시 중단');
            break;
        }
        const ok = await isLoggedInToFlow(loginPage).catch(() => false);
        if (ok) {
            loginSuccess = true;
            break;
        }
        const elapsedSec = Math.round((Date.now() - start) / 1000);
        if (elapsedSec > 0 && elapsedSec % 30 === 0) {
            sendImageLog(`⏳ [Flow] 로그인 대기 중... (${elapsedSec}초 경과)`);
        }
    }

    if (!loginSuccess) {
        await loginCtx.close().catch(() => {});
        throw new Error('FLOW_LOGIN_TIMEOUT:Google 로그인이 완료되지 않음 (창 닫힘 또는 5분 초과). 다시 시도해주세요.');
    }

    flowLog('[Flow] ✅ 로그인 완료 — on-screen 닫고 off-screen 재시작');
    sendImageLog('✅ [Flow] 로그인 완료! 숨김 모드로 전환 중...');
    await loginCtx.close().catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    const finalCtx = await launchWithStealthFallback(profileDir, true);
    const finalPage = finalCtx.pages()[0] || await finalCtx.newPage();
    installNetworkImageListener(finalPage); // [v1.6.1]

    // ✅ [v2.7.38] launch 직후 창 위치/크기 강제 — args가 무시되는 환경 대비 이중 가드
    try {
        await finalPage.evaluate(() => {
            try {
                window.moveTo(-32000, -32000);
                window.resizeTo(1, 1);
            } catch { /* 일부 보안 컨텍스트에서 거부 가능 — 무시 */ }
        });
    } catch { /* evaluate 실패 무시 — args가 이미 적용됨 */ }

    await finalPage.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await finalPage.waitForTimeout(2000);
    await dismissCookieBanner(finalPage);

    // ✅ [v2.7.38] goto 후에도 다시 한 번 강제 (페이지 로드 완료 시점에 재이동)
    try {
        await finalPage.evaluate(() => {
            try {
                window.moveTo(-32000, -32000);
                window.resizeTo(1, 1);
            } catch { /* ignore */ }
        });
    } catch { /* ignore */ }

    const finalCheck = await isLoggedInToFlow(finalPage).catch(() => false);
    if (!finalCheck) {
        await finalCtx.close().catch(() => {});
        throw new Error('FLOW_SESSION_LOST:로그인 후 off-screen 전환 시 세션 유실. 다시 시도해주세요.');
    }

    sendImageLog('✅ [Flow] 숨김 모드 전환 완료 — 이미지 생성 준비됨');
    cachedContext = finalCtx;
    cachedPage = finalPage;
    return finalPage;
}

// [v1.6.1] 백그라운드 prewarm — 첫 장 5~10초 절약
// 렌더러에서 Flow 선택 시 IPC로 호출 가능. 실패해도 무시
export async function prewarmFlow(): Promise<void> {
    if (cachedPage && cachedContext) return;
    flowLog('[Flow][Prewarm] 🔥 백그라운드 브라우저 기동 시작');
    try {
        await ensureFlowBrowserPage();
        flowLog('[Flow][Prewarm] ✅ 백그라운드 기동 완료');
    } catch (err) {
        flowWarn(`[Flow][Prewarm] 실패 (무시): ${(err as Error).message.substring(0, 100)}`);
    }
}

// ─── 쿠키 동의 배너 자동 닫기 ────────────────────────────────
async function dismissCookieBanner(page: Page, force: boolean = false): Promise<void> {
    if (cookieBannerDismissed && !force) return;
    try {
        const patterns = [
            /^(동의함|동의|Agree|Accept all|Accept|同意する|同意)$/,
            /^(나중에|No thanks|Reject all|Decline|拒否)$/,
        ];
        for (const pat of patterns) {
            const btn = page.locator('button').filter({ hasText: pat }).first();
            if (await btn.count() > 0) {
                const visible = await btn.isVisible().catch(() => false);
                if (visible) {
                    await btn.click({ timeout: 3000 });
                    flowLog(`[Flow] 🍪 쿠키 배너 닫음 (${pat})`);
                    cookieBannerDismissed = true;
                    await page.waitForTimeout(600);
                    return;
                }
            }
        }
        const bannerBtn = page.locator('[aria-labelledby*="cookie-notification-bar"] button').first();
        if (await bannerBtn.count() > 0 && await bannerBtn.isVisible().catch(() => false)) {
            await bannerBtn.click({ timeout: 3000 });
            flowLog('[Flow] 🍪 쿠키 배너 닫음 (CSS 폴백)');
            cookieBannerDismissed = true;
            await page.waitForTimeout(600);
            return;
        }
        cookieBannerDismissed = true;
    } catch (err) {
        flowWarn(`[Flow] 쿠키 배너 닫기 실패 (무시): ${(err as Error).message.substring(0, 80)}`);
    }
}

// ─── Flow 로그인 상태 체크 ────────────
async function isLoggedInToFlow(page: Page): Promise<boolean> {
    try {
        const session = await page.evaluate(async () => {
            try {
                const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
                if (!res.ok) return null;
                return await res.json();
            } catch { return null; }
        });
        return !!(session && (session as any).user);
    } catch {
        return false;
    }
}

// ─── 디버그 스크린샷 ───────────────────────────────────
async function saveDebugScreenshot(page: Page, label: string): Promise<string> {
    try {
        const ts = Date.now();
        let dir = FLOW_LOG_DIR;
        try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        } catch {
            dir = (() => {
                try { return path.join(app.getPath('userData'), 'flow-debug'); }
                catch { return path.join(require('os').homedir(), 'Desktop'); }
            })();
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }
        const filePath = path.join(dir, `flow-screenshot-${label}-${ts}.png`);
        await page.screenshot({ path: filePath, fullPage: false }).catch(() => {});
        flowLog(`[Flow] 📸 디버그 스크린샷: ${filePath}`);
        sendImageLog(`📸 [Flow] 스크린샷 저장: ${filePath}`);
        return filePath;
    } catch (err) {
        flowWarn(`[Flow] 스크린샷 저장 실패: ${(err as Error).message}`);
        return '';
    }
}

const FLOW_PROJECT_IMAGE_LIMIT = 9;

// ─── Flow 프로젝트 확보 ───────────────────────────────────
async function ensureFlowProject(page: Page, forceNew: boolean = false): Promise<void> {
    const currentUrl = page.url();
    flowLog(`[Flow][1/3] 프로젝트 확보 시작 — 현재 URL: ${currentUrl}`);

    if (forceNew) {
        flowLog('[Flow][1/3] 🆕 강제 새 프로젝트 생성 (이미지 상한 도달 방지)');
        cachedProjectUrl = null;
        // v2.7.10: forceNew면 무조건 메인 페이지로 navigate해서 "새 프로젝트" 버튼
        // 클릭으로 빈 프로젝트 보장. 현재 URL이 project여도 절대 재사용 안 함.
        // (이전 버그: forceNew=true여도 currentUrl이 project URL이면 아래 "이미
        // 프로젝트 페이지" 분기를 안 타지만, cachedProjectUrl 분기로 빠지는 등
        // 의도치 않게 누적 프로젝트로 흘러갈 위험 차단)
    } else if (currentUrl.includes('/tools/flow/project/')) {
        cachedProjectUrl = currentUrl;
        flowLog('[Flow][1/3] ✅ 이미 프로젝트 페이지 — 재사용');
        return;
    } else if (cachedProjectUrl) {
        flowLog(`[Flow][1/3] 🔗 캐시된 프로젝트 이동 시도: ${cachedProjectUrl}`);
        await page.goto(cachedProjectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(1500);
        if (page.url().includes('/tools/flow/project/')) {
            flowLog('[Flow][1/3] ✅ 캐시 프로젝트 도착');
            return;
        }
        flowLog('[Flow][1/3] ⚠️ 캐시 프로젝트 도착 실패 — 새 프로젝트 생성으로 전환');
    }

    flowLog('[Flow][1/3] 🆕 /tools/flow 접속 중...');
    sendImageLog('🆕 [Flow] 프로젝트 목록 페이지 접속 중...');
    await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    // [v1.6.1] 세션당 1회 원칙 — 이미 dismissed이면 skip
    if (!cookieBannerDismissed) await dismissCookieBanner(page);

    flowLog('[Flow][1/3] "새 프로젝트" 버튼 탐색 중...');
    const newProjectBtn = page.locator('button').filter({ hasText: /새 프로젝트|New project|New Project|新しいプロジェクト|add_2/ }).first();

    try {
        await newProjectBtn.waitFor({ state: 'visible', timeout: 30000 });
    } catch (err) {
        await saveDebugScreenshot(page, 'no-new-project-btn');
        const allButtons = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button')).slice(0, 20).map(b => (b.textContent || '').trim().substring(0, 50));
        }).catch(() => []);
        flowError(`[Flow][1/3] ❌ "새 프로젝트" 버튼 못 찾음. DOM 버튼 상위 20개 ↓`, allButtons);
        throw new Error(`FLOW_NEW_PROJECT_BUTTON_NOT_FOUND:labs.google/fx/tools/flow에서 "새 프로젝트" 버튼을 30초 내 찾지 못함. 페이지 구조 변경 또는 계정 권한 문제. 스크린샷 저장됨.`);
    }

    await newProjectBtn.click();
    flowLog('[Flow][1/3] "새 프로젝트" 클릭됨 — URL 리다이렉트 대기');

    try {
        await page.waitForURL(/\/tools\/flow\/project\//, { timeout: 30000 });
    } catch (err) {
        await saveDebugScreenshot(page, 'no-project-redirect');
        throw new Error(`FLOW_PROJECT_REDIRECT_TIMEOUT:"새 프로젝트" 클릭 후 프로젝트 URL 리다이렉트 30초 초과. 현재 URL: ${page.url()}`);
    }
    await page.waitForTimeout(1500);
    cachedProjectUrl = page.url();
    flowLog(`[Flow][1/3] ✅ 프로젝트 생성 완료: ${cachedProjectUrl}`);
    sendImageLog(`✅ [Flow] 프로젝트 준비됨`);
}

// ─── 프롬프트 입력창 / 전송 버튼 로케이터 헬퍼 ────
function promptInputLocator(page: Page): Locator {
    return page.locator('[role="textbox"][contenteditable="true"], div[contenteditable="true"]').first();
}

function submitButtonLocator(page: Page): Locator {
    return page.locator('button').filter({ hasText: /arrow_forward/ }).first();
}

// ─── [v1.6.1] 프롬프트 입력 + 제출 (즉시 반환) ────
//   기존 typePromptAndSubmit에서 검증/대기 최소화
async function submitPromptOnly(page: Page, prompt: string): Promise<void> {
    flowLog(`[Flow][2/3] 프롬프트 입력 시작 (길이: ${prompt.length})`);

    const promptInput = promptInputLocator(page);
    try {
        await promptInput.waitFor({ state: 'visible', timeout: 15000 });
    } catch (err) {
        await saveDebugScreenshot(page, 'no-prompt-input');
        throw new Error('FLOW_PROMPT_INPUT_NOT_FOUND:프롬프트 입력창(contenteditable)을 15초 내 찾지 못함.');
    }
    await promptInput.click();
    // [v1.6.1] 포커스 안정화 150→50ms
    await page.waitForTimeout(50);

    // fill() 1순위, 실패 시 폴백 체인
    let inputSuccess = false;
    try {
        await promptInput.fill(prompt, { timeout: 10000 });
        inputSuccess = true;
    } catch (err1) {
        flowWarn(`[Flow][2/3] fill() 실패 → pressSequentially 폴백: ${(err1 as Error).message.substring(0, 100)}`);
        try {
            await promptInput.pressSequentially(prompt, { delay: 3, timeout: 15000 });
            inputSuccess = true;
        } catch (err2) {
            flowWarn(`[Flow][2/3] pressSequentially 실패 → focus+keyboard.type 폴백`);
            try {
                await promptInput.focus({ timeout: 5000 });
                await page.keyboard.type(prompt, { delay: 3 });
                inputSuccess = true;
            } catch (err3) {
                flowWarn(`[Flow][2/3] keyboard.type 폴백도 실패: ${(err3 as Error).message.substring(0, 100)}`);
            }
        }
    }
    if (!inputSuccess) {
        await saveDebugScreenshot(page, 'input-all-methods-failed');
        throw new Error('FLOW_PROMPT_INPUT_ALL_FAILED:3가지 입력 방식(fill/pressSequentially/keyboard) 모두 실패');
    }
    // [v1.6.1] 입력값 검증 제거 — fill()이 성공 반환했으면 신뢰
    //         (textContent 호출 100ms * 7장 = 0.7초 절약)

    // 전송 버튼
    const submitBtn = submitButtonLocator(page);
    try {
        await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
    } catch (err) {
        await saveDebugScreenshot(page, 'no-submit-btn');
        throw new Error('FLOW_SUBMIT_BUTTON_NOT_FOUND:전송 버튼(arrow_forward)을 10초 내 찾지 못함.');
    }

    try {
        await submitBtn.click({ timeout: 10000 });
    } catch (err) {
        flowWarn(`[Flow][2/3] 일반 클릭 실패 → force:true 재시도`);
        try {
            await submitBtn.click({ force: true, timeout: 5000 });
        } catch (err2) {
            flowWarn(`[Flow][2/3] force 클릭도 실패 → JS dispatchEvent 폴백`);
            await submitBtn.evaluate((el: HTMLElement) => {
                el.click();
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            });
        }
    }
    flowLog('[Flow][2/3] ✅ 전송 버튼 클릭됨');
}

// [v1.6.1] 입력창이 재활성화될 때까지 대기 (파이프라인용)
//   Flow UI는 제출 직후 submit 버튼이 일시 disabled → 재활성화 시 다음 제출 가능
//   timeout=8초 (재활성화 실패 시 sequential fallback)
async function waitForInputReady(page: Page, timeoutMs: number = 8000): Promise<boolean> {
    try {
        await page.waitForFunction(() => {
            const inputs = document.querySelectorAll('[role="textbox"][contenteditable="true"], div[contenteditable="true"]');
            if (inputs.length === 0) return false;
            const input = inputs[0] as HTMLElement;
            // 입력창이 비어있고, 포커스 가능하면 준비 완료
            const text = (input.textContent || '').trim();
            if (text.length > 0) return false;
            // 전송 버튼이 disabled 아닌지
            const submitBtn = Array.from(document.querySelectorAll('button')).find(b => /arrow_forward/.test(b.textContent || ''));
            if (!submitBtn) return false;
            return !(submitBtn as HTMLButtonElement).disabled;
        }, { timeout: timeoutMs, polling: 150 });
        return true;
    } catch {
        return false;
    }
}

// ─── [v1.6.1] 이미지 감지 (in-browser waitForFunction + 네트워크 race) ────
//   기존 evaluate 500ms 폴링 → waitForFunction 200ms in-browser 폴링
//   + 네트워크 리스너가 먼저 감지하면 즉시 반환
async function waitForNewImage(page: Page, prevCount: number, timeoutMs: number = 120000): Promise<string> {
    const queueStartSize = _networkImageQueue.length;
    flowLog(`[Flow][3/3] 이미지 생성 대기 시작 (기존 DOM ${prevCount}장, queue baseline=${queueStartSize}, 타임아웃 ${timeoutMs / 1000}초)`);

    // DOM waitForFunction 기반 감지 (Promise A)
    const domPromise = page.waitForFunction(
        (prev: number) => {
            const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
            const matches = imgs.filter(img => {
                const alt = img.alt || '';
                const src = img.src || '';
                const aria = img.getAttribute('aria-label') || '';
                const fullyLoaded = img.complete && img.naturalWidth >= 200 && img.naturalHeight >= 200;
                if (!fullyLoaded) return false;
                if (/생성된 이미지|Generated image|Generated|생성|已生成|生成された|Image générée|Imagen generada|Generiertes Bild/i.test(alt + aria)) return true;
                if (/media\.getMediaUrlRedirect|flowMedia|flow-media/i.test(src)) return true;
                if (img.naturalWidth >= 512 && !/=s\d+-c$/.test(src) && src.startsWith('http')) return true;
                return false;
            });
            if (matches.length > prev) {
                return matches[matches.length - 1].src;
            }
            return null;
        },
        prevCount,
        { timeout: timeoutMs, polling: 200 }
    ).then(handle => handle.jsonValue() as Promise<string>);

    // 네트워크 큐 폴링 기반 감지 (Promise B) — 100ms 간격으로 큐 확인
    const netPromise = new Promise<string>((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
            if (_networkImageQueue.length > queueStartSize) {
                const url = _networkImageQueue[queueStartSize];
                flowLog(`[Flow][Net] ⚡ 네트워크 리스너가 먼저 감지: ${url.substring(0, 80)}...`);
                resolve(url);
                return;
            }
            if (Date.now() - start > timeoutMs) {
                reject(new Error('FLOW_IMAGE_TIMEOUT_NET:네트워크 리스너 타임아웃'));
                return;
            }
            setTimeout(tick, 100);
        };
        tick();
    });

    // 주기적 진행 로그 (15초 간격)
    const logStart = Date.now();
    const logInterval = setInterval(() => {
        const sec = Math.round((Date.now() - logStart) / 1000);
        sendImageLog(`⏳ [Flow] 이미지 생성 중... ${sec}초 경과`);
        flowLog(`[Flow][3/3] ⏳ 대기 중 ${sec}초 경과 (net queue=${_networkImageQueue.length - queueStartSize})`);
    }, 15000);

    try {
        const imageUrl = await Promise.race([domPromise, netPromise]);
        flowLog(`[Flow][3/3] ✅ 새 이미지 감지! URL: ${imageUrl.substring(0, 120)}`);
        return imageUrl;
    } catch (err) {
        // 타임아웃 → 디버그 덤프
        await saveDebugScreenshot(page, 'image-timeout');
        const allImgsDump = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img')).slice(0, 30).map(img => ({
                alt: img.alt.substring(0, 50),
                aria: (img.getAttribute('aria-label') || '').substring(0, 50),
                src: (img.src || '').substring(0, 150),
                w: (img as HTMLImageElement).naturalWidth,
                h: (img as HTMLImageElement).naturalHeight,
            }));
        }).catch(() => []);
        flowError('[Flow][3/3] ❌ 타임아웃 — 현재 DOM img 목록 ↓', allImgsDump);
        sendImageLog(`❌ [Flow] 이미지 감지 타임아웃 — DOM img ${allImgsDump.length}개 덤프`);
        throw new Error(`FLOW_IMAGE_TIMEOUT:이미지 ${timeoutMs / 1000}초 초과. 스크린샷+img 목록 저장됨.`);
    } finally {
        clearInterval(logInterval);
    }
}

async function countExistingImages(page: Page, debug: boolean = false): Promise<number> {
    const result = await page.evaluate((dbg) => {
        const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
        const matched = imgs.filter((img) => {
            const alt = img.alt || '';
            const src = img.src || '';
            const aria = img.getAttribute('aria-label') || '';
            const fullyLoaded = img.complete && img.naturalWidth >= 200 && img.naturalHeight >= 200;
            if (!fullyLoaded) return false;
            if (/생성된 이미지|Generated image|Generated|생성|已生成|生成された|Image générée|Imagen generada|Generiertes Bild/i.test(alt + aria)) return true;
            if (/media\.getMediaUrlRedirect|flowMedia|flow-media/i.test(src)) return true;
            if (img.naturalWidth >= 512 && !/=s\d+-c$/.test(src) && src.startsWith('http')) return true;
            return false;
        });
        return {
            count: matched.length,
            sample: dbg ? matched.slice(0, 12).map((img) => ({
                alt: (img.alt || '').substring(0, 30),
                src: (img.src || '').substring(0, 80),
                w: img.naturalWidth,
            })) : [],
        };
    }, debug);
    if (debug) flowLog(`[Flow][Count] ${result.count}장 — 샘플`, result.sample);
    return result.count;
}

// ─── 이미지 다운로드 ──
async function downloadImageAsBuffer(page: Page, imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const ctx = page.context();
    const MAX_ATTEMPTS = 3;
    let lastErr: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await ctx.request.get(imageUrl, {
                timeout: 30000,
                maxRedirects: 5,
            });
            if (!response.ok()) {
                throw new Error(`HTTP_${response.status()}`);
            }
            const buffer = await response.body();
            if (buffer.length < 1024) {
                throw new Error(`FLOW_IMAGE_DOWNLOAD_TINY:다운로드된 이미지가 비정상적으로 작음 (${buffer.length} bytes)`);
            }
            const mimeType = response.headers()['content-type']?.split(';')[0]?.trim() || 'image/png';
            flowLog(`[Flow] 📦 다운로드 완료 (${Math.round(buffer.length / 1024)}KB, ${mimeType})`);
            return { buffer, mimeType };
        } catch (err) {
            lastErr = err as Error;
            flowWarn(`[Flow] 다운로드 시도 ${attempt}/${MAX_ATTEMPTS} 실패: ${(err as Error).message.substring(0, 100)}`);
            if (attempt < MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }
    throw lastErr || new Error('FLOW_IMAGE_DOWNLOAD_FAILED:이미지 다운로드 3회 모두 실패');
}

// ─── 단일 이미지 생성 ─────────────────
// v2.7.11 (debugger #1 권장): 마라톤 sequential 폴백에서 호출 시 forceNewProjectOnLimit
// 옵션을 true로 주면 한도 임계치를 LIMIT-2(7장)로 보수화해 매 호출마다 한도 사전 체크 +
// 누적 위험 차단. 단발 호출(기본값 false)은 기존 동작 유지.
export async function generateSingleImageWithFlow(
    prompt: string,
    _aspectRatio: string = '1:1',
    signal?: AbortSignal,
    opts?: { forceNewProjectOnLimit?: boolean },
): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (signal?.aborted) {
            flowLog('[Flow] ⏹️ 중지 요청됨');
            return null;
        }

        try {
            const page = await ensureFlowBrowserPage();
            await ensureFlowProject(page);

            let prevCount = await countExistingImages(page);
            // v2.7.12: v2.7.10 동작 복귀 — 임계치 LIMIT(9) 그대로. 사용자 실측에서
            // 글 2~3은 8/8 정상, 첫 글만 4/8 → 보수화는 정상 글에 회귀 위험.
            if (prevCount >= FLOW_PROJECT_IMAGE_LIMIT) {
                flowLog(`[Flow] ⚠️ 프로젝트 이미지 ${prevCount}장 ≥ ${FLOW_PROJECT_IMAGE_LIMIT}장 상한 — 새 프로젝트로 교체`);
                sendImageLog(`🆕 [Flow] 프로젝트 상한(${FLOW_PROJECT_IMAGE_LIMIT}장) 도달 — 새 프로젝트 생성`);
                await ensureFlowProject(page, true);
                prevCount = await countExistingImages(page);
                flowLog(`[Flow] 🔄 새 프로젝트 시작 (기존 ${prevCount}장)`);
            }
            flowLog(`[Flow] 🖼️ 이미지 생성 시도 ${attempt}/${MAX_RETRIES} (기존 ${prevCount}장)`);
            sendImageLog(`🖼️ [Flow] 프롬프트 전송 중... (시도 ${attempt}/${MAX_RETRIES})`);

            await submitPromptOnly(page, prompt);

            sendImageLog('⏳ [Flow] 이미지 생성 대기 중...');
            const newImageUrl = await waitForNewImage(page, prevCount, 120000);
            flowLog(`[Flow] ✅ 이미지 URL 획득: ${newImageUrl.substring(0, 120)}`);

            sendImageLog('📥 [Flow] 이미지 다운로드 중...');
            const downloaded = await downloadImageAsBuffer(page, newImageUrl);

            trackApiUsage('gemini', { images: 1, model: 'flow-nano-banana-2', costOverride: 0 });
            sendImageLog(`✅ [Flow] 생성 완료 (${Math.round(downloaded.buffer.length / 1024)}KB)`);
            return downloaded;
        } catch (err) {
            const msg = (err as Error).message || '';
            flowWarn(`[Flow] 시도 ${attempt}/${MAX_RETRIES} 실패: ${msg}`);
            sendImageLog(`⚠️ [Flow] 시도 ${attempt} 실패: ${msg.substring(0, 150)}`);
            lastError = err as Error;

            if (attempt < MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, 3000 * attempt));
            }
        }
    }

    throw lastError || new Error('FLOW_UNKNOWN_ERROR:이미지 생성 실패');
}

// v2.6.7 — 중복 가드 상수: Flow에서 SHA256/aHash 일치 시 diversity hint를
// 주입한 새 프롬프트로 단발 재생성. 무한 루프 방지를 위해 항당 최대 N회.
const FLOW_DUPLICATE_MAX_RETRIES = 3;

// ─── [v1.6.1] 파이프라인 배치 생성 ────
//   queueDepth=2: 제출 #1 → 입력 재활성화 대기 → 제출 #2 → #1 감지 → 제출 #3...
//   Flow 서버가 동시 생성 처리 시 실질 2x 속도 (서버 bound)
//   서버가 serialize하면 sequential과 동일 (성능 저하는 없음)
async function generateBatchPipelined(
    items: ImageRequestItem[],
    postTitle: string | undefined,
    postId: string | undefined,
    onImageGenerated: ((image: GeneratedImage, index: number, total: number) => void) | undefined,
    queueDepth: number = 2,
    usedImageHashes?: Set<string>,
    usedImageAHashes?: bigint[],
): Promise<{ results: GeneratedImage[]; criticalError: Error | null }> {
    const results: GeneratedImage[] = [];
    let criticalError: Error | null = null;

    const page = await ensureFlowBrowserPage();
    // v2.7.7: 매 generateWithFlow 호출(=글 1편) 시작 시 새 프로젝트 강제.
    // 이전 누적 이미지가 9장 한도를 미리 깎아먹어 8장 중 4장만 처리되던 버그
    // (사용자 마라톤 테스트에서 매 글 4/8 패턴 확정) 해결.
    flowLog(`[Flow][Batch] 🆕 글 시작 — 새 프로젝트 강제 (이전 누적 한도 회피)`);
    await ensureFlowProject(page, true);

    // 제출된 프롬프트 FIFO 큐 (순서 기반 매칭)
    // Flow UI는 제출 순서대로 이미지를 쌓으므로, 제출 순서 = 감지 순서 가정
    const pending: { index: number; prompt: string; item: ImageRequestItem }[] = [];
    const totalItems = items.length;

    let initialCount = await countExistingImages(page);
    flowLog(`[Flow][Batch] 새 프로젝트 시작 카운트: ${initialCount}장 (8장 처리 가능 여부 확보)`);
    sendImageLog(`🚀 [Flow][Pipeline] 파이프라인 모드 활성 (동시 큐 ${queueDepth}개)`);

    let submittedCount = 0;
    let detectedCount = 0;

    while (detectedCount < totalItems) {
        // 새 슬롯 채우기 — submittedCount < totalItems이고 pending.length < queueDepth이면 제출
        while (
            submittedCount < totalItems &&
            pending.length < queueDepth
        ) {
            // 프로젝트 상한 사전 체크
            const currentCount = await countExistingImages(page);
            if (currentCount >= FLOW_PROJECT_IMAGE_LIMIT - 1) {
                flowLog(`[Flow][Batch] 프로젝트 ${currentCount}장 (한도 ${FLOW_PROJECT_IMAGE_LIMIT}) — pending 비우고 새 프로젝트로`);
                // v2.7.7: pending 비우고 즉시 새 프로젝트 전환 (이전엔 break 후
                // 외부 루프에서 새 프로젝트 안 만들어 미완료분 분실)
                break;
            }

            const item = items[submittedCount];
            const prompt = item.englishPrompt || PromptBuilder.build(item, {
                imageStyle: (item as any).imageStyle || 'realistic',
                category: (item as any).category || '',
            } as any);

            try {
                // 이전 제출이 있으면 입력 재활성화 대기
                if (pending.length > 0) {
                    const ready = await waitForInputReady(page, 8000);
                    if (!ready) {
                        flowWarn(`[Flow][Pipeline] 입력 재활성화 타임아웃 — sequential fallback으로 전환`);
                        // 나머지는 sequential로 처리하라는 신호
                        throw new Error('FLOW_PIPELINE_FALLBACK');
                    }
                }
                sendImageLog(`🖼️ [Flow][${submittedCount + 1}/${totalItems}] "${item.heading}" 제출 중...`);
                await submitPromptOnly(page, prompt);
                pending.push({ index: submittedCount, prompt, item });
                submittedCount++;
                flowLog(`[Flow][Pipeline] 📤 제출 #${submittedCount}/${totalItems} 완료 (pending=${pending.length})`);
            } catch (err) {
                const msg = (err as Error).message || '';
                if (msg === 'FLOW_PIPELINE_FALLBACK') {
                    // sequential로 전환
                    flowLog(`[Flow][Pipeline] ⏮️ Sequential fallback — 남은 ${totalItems - submittedCount}장`);
                    return { results, criticalError: null }; // 상위에서 sequential 재개
                }
                flowError(`[Flow][Pipeline] 제출 실패: ${msg}`);
                if (msg.startsWith('FLOW_')) criticalError = err as Error;
                return { results, criticalError };
            }
        }

        // 1장 감지 대기
        if (pending.length === 0) break;

        const slot = pending.shift()!;
        const prevCount = initialCount + detectedCount; // 이미 감지된 수만큼 증가
        try {
            const imageUrl = await waitForNewImage(page, prevCount, 150000);
            let downloaded = await downloadImageAsBuffer(page, imageUrl);
            let acceptedPrompt = slot.prompt;

            // v2.6.7: 중복/유사 감지 시 diversity hint 단발 재생성 (최대 N회)
            if (usedImageHashes || usedImageAHashes) {
                let probe = await probeDuplicate(downloaded.buffer, usedImageHashes, usedImageAHashes);
                let dupRetries = 0;
                while ((probe.isDuplicate || probe.isSimilar) && dupRetries < FLOW_DUPLICATE_MAX_RETRIES) {
                    dupRetries++;
                    const reason = probe.isDuplicate ? '중복(SHA256)' : '유사(aHash)';
                    flowWarn(`[Flow][Pipeline] 🔁 ${reason} 감지 → diversity hint 재생성 ${dupRetries}/${FLOW_DUPLICATE_MAX_RETRIES} - "${slot.item.heading}"`);
                    sendImageLog(`🔁 [Flow] 중복 이미지 감지 — 다른 각도로 재생성 ${dupRetries}/${FLOW_DUPLICATE_MAX_RETRIES}`);
                    acceptedPrompt = applyDiversityHint(acceptedPrompt, dupRetries);
                    try {
                        const retried = await generateSingleImageWithFlow(acceptedPrompt, (slot.item as any).aspectRatio || '1:1');
                        if (!retried) break;
                        downloaded = retried;
                        probe = await probeDuplicate(downloaded.buffer, usedImageHashes, usedImageAHashes);
                    } catch (retryErr) {
                        flowWarn(`[Flow][Pipeline] diversity 재생성 실패 — 원본 유지: ${(retryErr as Error).message.substring(0, 100)}`);
                        break;
                    }
                }
                if (probe.isDuplicate || probe.isSimilar) {
                    flowLog(`[Flow][Pipeline] ℹ️ ${FLOW_DUPLICATE_MAX_RETRIES}회 시도 후에도 중복/유사 — 폴백 허용`);
                }
                commitHashes(probe, usedImageHashes, usedImageAHashes);
            }

            const ext = downloaded.mimeType === 'image/jpeg' ? 'jpg'
                : downloaded.mimeType === 'image/webp' ? 'webp'
                : 'png';
            const { filePath } = await writeImageFile(downloaded.buffer, ext, slot.item.heading, postTitle, postId);
            const image: GeneratedImage = {
                filePath,
                heading: slot.item.heading,
                prompt: acceptedPrompt,
                mimeType: downloaded.mimeType,
                provider: 'flow-nano-banana-2',
                cost: 0,
            } as any;
            results.push(image);
            detectedCount++;
            trackApiUsage('gemini', { images: 1, model: 'flow-nano-banana-2', costOverride: 0 });
            sendImageLog(`✅ [Flow][${detectedCount}/${totalItems}] "${slot.item.heading}" 완료 (${Math.round(downloaded.buffer.length / 1024)}KB)`);

            // ✅ [v2.6.3] 중복 이벤트 발사 차단
            //   이전 버그: onImageGenerated 콜백(→main.ts가 IPC send)와 IPC 직송이 동시 발사 →
            //              renderer가 같은 automation:imageGenerated를 2번 수신 → 이미지 2번 표시
            //   수정: 콜백이 있으면 콜백만, 없으면 IPC 직송(fallback)만. 둘 중 하나만 발사.
            if (onImageGenerated) {
                onImageGenerated(image, slot.index, totalItems);
            } else {
                try {
                    const { BrowserWindow } = require('electron');
                    const wins = BrowserWindow.getAllWindows();
                    if (wins[0] && !wins[0].isDestroyed()) {
                        wins[0].webContents.send('automation:imageGenerated', {
                            image, index: slot.index, total: totalItems,
                        });
                        flowLog(`[Flow][Pipeline] 📨 IPC 직송 (콜백 미주입 fallback): ${slot.index}/${totalItems}`);
                    }
                } catch { /* ignore */ }
            }
        } catch (err) {
            const msg = (err as Error).message || '';
            flowError(`[Flow][Pipeline] [${slot.index + 1}] 감지 실패: ${msg}`);
            sendImageLog(`❌ [Flow][Pipeline] ${slot.index + 1}번째 실패: ${msg.substring(0, 150)}`);
            if (msg.startsWith('FLOW_')) criticalError = err as Error;
            // 이 slot은 실패지만 다른 pending은 계속 진행
        }

        // v2.7.7: 프로젝트 한도 도달 + 미완료 잔여분 있으면 새 프로젝트로 전환 후 계속
        // 이전엔 break 후 외부 루프에서 새 프로젝트 안 만들어 미완료분이 분실됐음
        if (
            !criticalError &&
            submittedCount < totalItems &&
            pending.length === 0
        ) {
            const cur = await countExistingImages(page);
            if (cur >= FLOW_PROJECT_IMAGE_LIMIT - 1) {
                flowLog(`[Flow][Batch] 🆕 한도 도달(${cur}/${FLOW_PROJECT_IMAGE_LIMIT}) — 새 프로젝트 전환 후 ${totalItems - submittedCount}장 잔여 처리`);
                await ensureFlowProject(page, true);
                initialCount = await countExistingImages(page);
                detectedCount = 0; // 새 프로젝트는 카운트 리셋, prevCount 계산 위해
            }
        }
    }

    return { results, criticalError };
}

// ─── 일괄 생성 ──
export async function generateWithFlow(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,
    externalUsedImageHashes?: Set<string>,
    externalUsedImageAHashes?: bigint[],
    options?: { forceFreshContext?: boolean },
): Promise<GeneratedImage[]> {
    // v2.6.7: 호출자가 dedup 집합을 주지 않으면 배치 내부에서 자체 추적해
    // 같은 발행 안에서 같은 이미지가 반복 생성되는 것을 차단한다.
    const usedImageHashes = externalUsedImageHashes ?? new Set<string>();
    const usedImageAHashes = externalUsedImageAHashes ?? [];

    // v2.7.8: 마라톤 모드 — BrowserContext 자체를 close+재생성해 누적 0 보장.
    // 평소 단발 호출엔 false (캐시 효율 유지). 마라톤만 true.
    if (options?.forceFreshContext) {
        await recreateFlowContext();
    }
    initFlowLogFile();
    flowLog(`════════════════════════════════════════════`);
    flowLog(`[Flow] 🎨 총 ${items.length}개 이미지 생성 시작 (v1.6.1 파이프라인)`);
    flowLog(`[Flow] 📄 디버그 로그 파일: ${flowLogFilePath || '(초기화 실패)'}`);
    flowLog(`[Flow] 📋 요청 목록`, items.map((it, idx) => ({
        idx: idx + 1,
        heading: (it.heading || '').substring(0, 60),
        hasEnglishPrompt: !!it.englishPrompt,
        promptPreview: ((it.englishPrompt || '') as string).substring(0, 100),
        aspectRatio: (it as any).aspectRatio || '1:1',
    })));
    sendImageLog(`🎨 [Flow] Nano Banana 2로 ${items.length}개 이미지 생성 시작 (파이프라인)`);
    sendImageLog(`📄 [Flow] 디버그 로그: ${flowLogFilePath || '초기화 실패'}`);

    // [v1.6.1] 파이프라인 시도 (queueDepth=2)
    // v2.7.9: 마라톤 모드(forceFreshContext)에서는 파이프라인 비활성 — 한도 도달
    // 시 sequential 폴백이 같은 페이지에서 누적 막힘으로 무한 타임아웃 발생.
    const PIPELINE_ENABLED = process.env.FLOW_SEQUENTIAL !== '1' && !options?.forceFreshContext;
    let results: GeneratedImage[] = [];
    let firstCriticalError: Error | null = null;
    let pipelineDoneCount = 0;

    if (PIPELINE_ENABLED && items.length >= 2) {
        try {
            const pipelineResult = await generateBatchPipelined(items, postTitle, postId, onImageGenerated, 2, usedImageHashes, usedImageAHashes);
            results = pipelineResult.results;
            firstCriticalError = pipelineResult.criticalError;
            pipelineDoneCount = results.length;
            if (pipelineDoneCount < items.length && !firstCriticalError) {
                flowLog(`[Flow] ⏮️ 파이프라인 ${pipelineDoneCount}/${items.length} 완료 → 나머지 sequential 재개`);
            }
        } catch (err) {
            flowWarn(`[Flow] 파이프라인 전체 실패 — 처음부터 sequential: ${(err as Error).message.substring(0, 120)}`);
            results = [];
            pipelineDoneCount = 0;
        }
    } else if (options?.forceFreshContext) {
        flowLog(`[Flow] 🏁 마라톤 모드 — 파이프라인 비활성, sequential 단일 경로`);
    }

    // Sequential fallback (파이프라인 미완료분 또는 전체)
    for (let i = pipelineDoneCount; i < items.length; i++) {
        if (firstCriticalError) break;
        const item = items[i];

        try {
            sendImageLog(`🖼️ [Flow] [${i + 1}/${items.length}] "${item.heading}" 생성 중...`);
            let prompt = item.englishPrompt || PromptBuilder.build(item, {
                imageStyle: (item as any).imageStyle || 'realistic',
                category: (item as any).category || '',
            } as any);
            const aspectRatio = (item as any).aspectRatio || '1:1';

            // v2.7.11: 마라톤 모드 시 한도 임계치 보수화 옵션 전달 (debugger #1)
            let generated = await generateSingleImageWithFlow(
                prompt,
                aspectRatio,
                undefined,
                { forceNewProjectOnLimit: !!options?.forceFreshContext },
            );
            if (!generated) {
                flowWarn(`[Flow] [${i + 1}] null 반환 (중지 감지) — 나머지 건너뜀`);
                break;
            }

            // v2.6.7: 중복/유사 감지 시 diversity hint 단발 재생성 (최대 N회)
            if (usedImageHashes || usedImageAHashes) {
                let probe = await probeDuplicate(generated.buffer, usedImageHashes, usedImageAHashes);
                let dupRetries = 0;
                while ((probe.isDuplicate || probe.isSimilar) && dupRetries < FLOW_DUPLICATE_MAX_RETRIES) {
                    dupRetries++;
                    const reason = probe.isDuplicate ? '중복(SHA256)' : '유사(aHash)';
                    flowWarn(`[Flow][Seq] 🔁 ${reason} 감지 → diversity hint 재생성 ${dupRetries}/${FLOW_DUPLICATE_MAX_RETRIES} - "${item.heading}"`);
                    sendImageLog(`🔁 [Flow] 중복 이미지 감지 — 다른 각도로 재생성 ${dupRetries}/${FLOW_DUPLICATE_MAX_RETRIES}`);
                    prompt = applyDiversityHint(prompt, dupRetries);
                    try {
                        const retried = await generateSingleImageWithFlow(
                            prompt,
                            aspectRatio,
                            undefined,
                            { forceNewProjectOnLimit: !!options?.forceFreshContext },
                        );
                        if (!retried) break;
                        generated = retried;
                        probe = await probeDuplicate(generated.buffer, usedImageHashes, usedImageAHashes);
                    } catch (retryErr) {
                        flowWarn(`[Flow][Seq] diversity 재생성 실패 — 원본 유지: ${(retryErr as Error).message.substring(0, 100)}`);
                        break;
                    }
                }
                if (probe.isDuplicate || probe.isSimilar) {
                    flowLog(`[Flow][Seq] ℹ️ ${FLOW_DUPLICATE_MAX_RETRIES}회 시도 후에도 중복/유사 — 폴백 허용`);
                }
                commitHashes(probe, usedImageHashes, usedImageAHashes);
            }

            const ext = generated.mimeType === 'image/jpeg' ? 'jpg'
                : generated.mimeType === 'image/webp' ? 'webp'
                : 'png';
            const { filePath } = await writeImageFile(generated.buffer, ext, item.heading, postTitle, postId);

            const image: GeneratedImage = {
                filePath,
                heading: item.heading,
                prompt,
                mimeType: generated.mimeType,
                provider: 'flow-nano-banana-2',
                cost: 0,
            } as any;
            results.push(image);
            // ✅ [v2.6.3] 중복 이벤트 발사 차단 — 콜백 있으면 콜백만, 없으면 IPC 직송(fallback)
            if (onImageGenerated) {
                onImageGenerated(image, i, items.length);
            } else {
                try {
                    const { BrowserWindow } = require('electron');
                    const wins = BrowserWindow.getAllWindows();
                    if (wins[0] && !wins[0].isDestroyed()) {
                        wins[0].webContents.send('automation:imageGenerated', {
                            image, index: i, total: items.length,
                        });
                        flowLog(`[Flow] 📨 IPC 직송 (콜백 미주입 fallback): ${i}/${items.length}`);
                    }
                } catch (ipcErr) {
                    flowWarn(`[Flow] IPC 직송 실패 (무시): ${(ipcErr as Error).message.substring(0, 80)}`);
                }
            }

            // [v1.6.1] 이미지간 대기 500→200ms
            if (i < items.length - 1) {
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (err) {
            const msg = (err as Error).message || '';
            flowError(`[Flow] [${i + 1}/${items.length}] 실패: ${msg}`);
            sendImageLog(`❌ [Flow] [${i + 1}] 실패: ${msg.substring(0, 150)}`);
            if (msg.startsWith('FLOW_')) firstCriticalError = err as Error;
        }
    }

    flowLog(`[Flow] ${results.length > 0 ? '✅' : '❌'} 완료: ${results.length}/${items.length} 성공`);
    sendImageLog(`${results.length > 0 ? '✅' : '❌'} [Flow] 완료: ${results.length}/${items.length} 성공`);

    if (results.length === 0) {
        if (firstCriticalError) throw firstCriticalError;
        throw new Error('FLOW_ALL_FAILED:모든 이미지 생성 실패. 이전 로그 확인 필요.');
    }
    return results;
}

// ─── 연결 테스트 ────
export async function testFlowConnection(): Promise<{ ok: boolean; message: string; userInfo?: any }> {
    try {
        const page = await ensureFlowBrowserPage();
        const session = await page.evaluate(async () => {
            try {
                const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
                return res.ok ? await res.json() : null;
            } catch { return null; }
        });
        if (!session || !(session as any).user) {
            return { ok: false, message: '❌ Google 세션 확보 실패 — 로그인 창에서 로그인 완료 후 다시 테스트해주세요' };
        }
        const userInfo = (session as any).user;
        return {
            ok: true,
            message: `✅ Flow 연결 성공 — ${userInfo?.email || userInfo?.name || 'user'}`,
            userInfo,
        };
    } catch (err) {
        const msg = (err as Error).message || '';
        if (msg.startsWith('FLOW_LOGIN_TIMEOUT')) {
            return { ok: false, message: '❌ Google 로그인 시간 초과 — 다시 테스트해주세요' };
        }
        return { ok: false, message: `❌ ${msg}` };
    }
}

// ─── 중지/정리 ────
export async function resetFlowState(): Promise<void> {
    cachedProjectUrl = null;
    cookieBannerDismissed = false;
    _networkListenerInstalled = false;
    _networkImageQueue = [];
    try { if (cachedContext) await cachedContext.close(); } catch { /* ignore */ }
    cachedContext = null;
    cachedPage = null;
}
