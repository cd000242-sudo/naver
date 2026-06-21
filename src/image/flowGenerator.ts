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
import { injectUniqueSalt, injectHeadingVariation, simplifyFlowPrompt } from './flowPromptInjection.js';
// ✅ [v2.10.298] Flow 일별 카운터 — 한도 에러 발생 시 봇감지 vs 진짜 한도 구분
import { incrementDailySuccess, classifyQuotaError, getDailySuccess } from '../utils/imageEngineDailyCounter.js';
const incrementFlowDailySuccess = (): number => incrementDailySuccess('flow');
import type { BrowserContext, Page, Locator } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
// ✅ [SPEC-IMAGE-RECOVERY-001] 자동 복구 코디네이터
import { getRecoveryCoordinator } from './recovery/index.js';

function extractFlowErrorCode(error: unknown): string | undefined {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const m = msg.match(/^(FLOW_[A-Z_]+)(?::|$)/);
  if (m) return m[1];
  return undefined;
}

function extractFlowHttpStatus(error: unknown): number | undefined {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const m = msg.match(/HTTP_(\d{3})/);
  if (m) return Number(m[1]);
  return undefined;
}

// C6 (SPEC-IMAGE-RECOVERY-001 Phase 6): block 결정 중 배치 즉시 중단할 항목 분류.
// B1(IP 차단), B3(시간당 한도), B4(브라우저 미설치), B7(회복 불가능)은 다음 헤딩 시도해도 같은 결과.
function isFlowBlockFatal(decision: { modalCode?: string }): boolean {
  return decision.modalCode === 'B1'
      || decision.modalCode === 'B3'
      || decision.modalCode === 'B4'
      || decision.modalCode === 'B7';
}

async function sendFlowBlockingModalRequest(
  decision: { modalCode: string; reason: string; errorCode?: string },
): Promise<void> {
  try {
    const { broadcastModalRequest } = require('../main/ipc/recoveryHandlers');
    broadcastModalRequest({
      code: decision.modalCode,
      reason: decision.reason,
      errorCode: decision.errorCode,
    });
  } catch (primaryErr) {
    console.warn('[Flow Recovery] broadcastModalRequest 실패 — direct send 폴백:', (primaryErr as Error)?.message);
    try {
      const { BrowserWindow } = require('electron');
      const wins = BrowserWindow.getAllWindows();
      if (wins[0] && !wins[0].isDestroyed()) {
        wins[0].webContents.send('recovery:show-modal', {
          code: decision.modalCode,
          reason: decision.reason,
          errorCode: decision.errorCode,
        });
      } else {
        console.warn('[Flow Recovery] BrowserWindow 없음 — 모달 표시 불가');
      }
    } catch (fallbackErr) {
      console.warn('[Flow Recovery] direct send 폴백도 실패:', (fallbackErr as Error)?.message);
    }
  }
}

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

// ─── AdsPower 토글 (사용자 설정) ───
// _flowAdsPowerEnabled: 사용자가 AdsPower 토글을 ON 했는지 (systemHandlers.ts에서 setter 호출)
// _flowAdsPowerSessionDisabled: 본 세션 내 AdsPower 1회 실패 후 재시도 차단 플래그
//   (SPEC-IMAGE-RECOVERY-001 R3 정책 — ImageFX 동일)
let _flowAdsPowerEnabled: boolean = false;
let _flowAdsPowerSessionDisabled: boolean = false;

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

// ─── AdsPower 토글 setter/getter ───
export function setFlowAdsPowerEnabled(enabled: boolean): void {
    _flowAdsPowerEnabled = enabled;
    if (!enabled) _flowAdsPowerSessionDisabled = false;
    flowLog(`[Flow] AdsPower ${enabled ? '✅ 활성' : '❌ 비활성'}`);
}

export function isFlowAdsPowerEnabled(): boolean {
    return _flowAdsPowerEnabled;
}

export function isFlowAdsPowerSessionDisabled(): boolean {
    return _flowAdsPowerSessionDisabled;
}

export function markFlowAdsPowerSessionDisabled(): void {
    _flowAdsPowerSessionDisabled = true;
    flowLog('[Flow] ⚠️ AdsPower 본 세션 비활성화 (다음 앱 재시작 시 재시도)');
}

// ─── 시스템 브라우저 폴백 + stealth args ─────────────────────
const STEALTH_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
];
const STEALTH_IGNORE_DEFAULT_ARGS = ['--enable-automation'];

async function launchWithStealthFallback(profileDir: string, offScreen: boolean): Promise<BrowserContext> {
    // ─── Phase 2: AdsPower 우선 시도 (토글 ON + 본 세션 차단 안 됨) ───
    // 실패 시 _flowAdsPowerSessionDisabled=true 후 fall-through로 기존 patchright 흐름.
    // 토글 OFF면 이 블록 진입 안 함 → 기존 코드 경로 동일 (회귀 0).
    if (_flowAdsPowerEnabled && !_flowAdsPowerSessionDisabled) {
        try {
            const { connectFlowViaAdsPower } = await import('./flowAdsPowerConnect.js');
            return await connectFlowViaAdsPower(profileDir, offScreen);
        } catch (adsErr) {
            const msg = (adsErr as Error).message || String(adsErr);
            flowWarn(`[Flow] ⚠️ AdsPower 사용 불가 (${msg.substring(0, 100)}) → patchright 폴백`);
            sendImageLog('⚠️ [Flow] AdsPower 연결 실패 — 자체 브라우저로 자동 전환');
            _flowAdsPowerSessionDisabled = true;
            // fall through
        }
    }

    // ✅ [SPEC-IMAGE-RECOVERY-001 Phase 7] patchright drop-in swap (Phase B — flowGenerator만 격리 적용)
    // - Playwright의 runtime.enable CDP 누수 + 기타 7개 fingerprint 패치
    // - imageFxGenerator는 OAuth 기반이라 4주 메트릭 보고 결정 (격리 유지)
    // - 호환성 안전망: patchright 실패 시 Playwright로 fallback
    let chromium: typeof import('playwright').chromium;
    try {
        const patchright = await import('patchright');
        chromium = (patchright as any).chromium ?? (patchright as any).default?.chromium;
        if (!chromium) throw new Error('patchright.chromium undefined');
    } catch (err) {
        console.warn('[Flow] patchright 로드 실패 — Playwright 폴백:', (err as Error)?.message);
        const playwright = await import('playwright');
        chromium = playwright.chromium;
    }
    // ✅ [v2.10.11] Flow 크롬창 완전 숨김 — 사용자 보고 '신경쓰인다'
    //   offScreen=true일 때는 headless: true 사용 (창 자체 안 뜸)
    //   offScreen=false (로그인 단계)는 visible 유지 — 사용자가 직접 로그인해야 함
    //   기존 음수 좌표/크기 args는 headless=false 폴백 시에만 사용 (호환성 유지)
    const offScreenArgs = offScreen ? [
        '--window-position=-32000,-32000',
        '--window-size=1,1',
        '--start-minimized',
    ] : [];
    const commonOptions: any = {
        headless: offScreen, // ✅ [v2.10.11] offScreen=true → 진짜 headless로 창 숨김
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

            // 영구 anti-modal 옵저버 주입 — Google Flow가 띄우는 changelog/whats_new/banner iframe 자동 hide
            await injectAntiModalObserver(ctx);

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
            // Flow 이미지 패턴: content-type image/* + URL에 Google CDN/Flow 패턴
            if (!ct.startsWith('image/')) return;
            // [2026-05-27 작업 25] 모든 image 응답 진단 로그 — 실제 Google Flow CDN 패턴 발견용
            const len = parseInt(response.headers()['content-length'] || '0', 10);
            flowLog(`[Flow][Net][DIAG] 📊 image 응답: ${url.substring(0, 150)} (${len} bytes, ${ct})`);
            // [2026-05-27 작업 25 — 1순위 fix] CDN 패턴 광범위화 — 2026-05 Google Flow CDN 변경 대응
            //   기존: flowMedia|aitestkitchen|labs.google 등 특정 도메인
            //   문제: net queue=0 (사용자 로그) → 실제 응답이 위 패턴에 매칭 안 됨
            //   수정: Google 계열 도메인 + image 응답 + 일정 크기 이상이면 후보로 추가 (false positive는 5KB 가드 + changelog 가드로 차단)
            const FLOW_CDN_RE = /flow-content\.google\/image|flowMedia|flow-media|media\.getMediaUrlRedirect|googleusercontent|aitestkitchen|gstatic\.com|google(?:apis|usercontent|cdn)|cdn\.google|images\.google|google\.com\/.+\/(?:flow|media|image|imagen)/i;
            if (!FLOW_CDN_RE.test(url)) {
                flowLog(`[Flow][Net][DIAG] ⏭️ 패턴 미매칭 — skip: ${url.substring(0, 100)}`);
                return;
            }
            // changelog/banner iframe이 작은 이미지를 응답해도 무시 (overlay URL 패턴)
            if (/changelogs?|whats[_-]?new|banner|survey|consent|onboarding|promo|favicon|perlin\.png|flower-placeholder|\/icons\/|logo/i.test(url)) {
                flowLog(`[Flow][Net][DIAG] ⏭️ UI 자산 — skip: ${url.substring(0, 100)}`);
                return;
            }
            // 작은 preview/썸네일 제외 — Content-Length 기준 5KB 이상만
            if (len > 0 && len < 5 * 1024) {
                flowLog(`[Flow][Net][DIAG] ⏭️ 5KB 미만 — skip (${len}b): ${url.substring(0, 100)}`);
                return;
            }
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
    // [Phase 0/v2.10.126] 2500ms 고정 대기 → networkidle 이벤트 기반 (평균 단축, 안전 timeout 2500ms)
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => { /* timeout 시도 진행 */ });
    await dismissCookieBanner(page);

    const loggedIn = await isLoggedInToFlow(page);
    if (loggedIn) {
        flowLog('[Flow] ✅ 기존 로그인 세션 확인됨 (off-screen 창 유지)');
        sendImageLog('✅ [Flow] 로그인 세션 확인 — 이미지 생성 준비됨');
        cachedContext = ctx;
        cachedPage = page;
        // [v2.10.158] zombieRecovery hook — Flow chromium 추적
        try {
            const browser = ctx.browser();
            const pid = (browser as any)?.process?.()?.pid;
            if (pid) {
                const zr = require('../runtime/zombieRecovery.js');
                const { app } = require('electron');
                zr.trackBrowserPid({
                    pid,
                    kind: 'playwright-chromium',
                    cmdlineFingerprint: app.getPath('userData'),
                    label: 'flow-cached',
                });
            }
        } catch { /* ignore */ }
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

    // ✅ [v2.7.68] 2FA(폰 승인) + Google 다단계 redirect 대응
    //   사용자 보고: "2단계 인증까지 했는데도 5분 타임아웃 발생"
    //   원인: 5초 폴링 + /fx/api/auth/session 단일 시그널만 검사 → redirect 체인 미감지
    //   조치:
    //     1) 폴링 간격 5s → 2s (redirect 윈도우 캐치)
    //     2) 타임아웃 5분 → 10분 (2FA + 이메일 확인 + 푸시 승인 시간 여유)
    //     3) accounts.google.com에 30초 이상 머물면 자동으로 flow 재방문 (OAuth 완료 후 stuck 회복)
    //     4) 다중 신호 감지: session API + URL 패턴 + 쿠키
    // ✅ [SPEC-IMAGE-RECOVERY-001 R5] 로그인 활성도 폴링 — 사용자가 진행 중이면 timeout 자동 연장
    // base 5분 + URL/DOM 변화 감지 시 재시작, 누적 30분(MAX_TOTAL_MS) 절대 한도
    // R5 (Phase 6 정합): acceptance.md 명시 30분 절대 상한 (5분 base + 5×5분 연장)
    const baseTimeoutMs = 5 * 60 * 1000;
    const MAX_TOTAL_MS = 30 * 60 * 1000; // 페르소나별 옵션은 후속 SPEC에서 (마라톤 90분 등)
    const overallStart = Date.now();
    let windowStart = Date.now();
    let loginSuccess = false;
    let lastUrlChange = Date.now();
    let lastUrl = loginPage.url();
    let stuckRedirectAttempts = 0;
    let inactivityNotified = false;
    sendImageLog('🔐 [Flow] 브라우저에서 Google 로그인을 완료해주세요 (2단계 인증 포함, 최대 30분 대기).');
    while (Date.now() - overallStart < MAX_TOTAL_MS && Date.now() - windowStart < baseTimeoutMs) {
        await new Promise(r => setTimeout(r, 2000));
        if (loginPage.isClosed()) {
            flowWarn('[Flow] ⚠️ 로그인 대기 중 사용자가 창을 닫음 — 즉시 중단');
            break;
        }
        const ok = await isLoggedInToFlow(loginPage).catch(() => false);
        if (ok) {
            loginSuccess = true;
            break;
        }
        const currentUrl = loginPage.url();
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            lastUrlChange = Date.now();
            // ✅ [R5] URL 변화 감지 → window 재시작 (사용자 진행 중)
            windowStart = Date.now();
            inactivityNotified = false;
            flowLog(`[Flow] 🔄 R5 URL 변경 감지 — timeout 5분 추가 연장: ${currentUrl.slice(0, 100)}`);
        }
        // ✅ [R5] 60초 무변화 시 1회 토스트
        if (!inactivityNotified && Date.now() - lastUrlChange > 60_000) {
            inactivityNotified = true;
            // debugger 권고: 2FA URL 감지 시 메시지 구체화
            const is2FA = /\/challenge\/|\/signin\/v2\/challenge\/|\/v3\/signin\/challenge\//.test(currentUrl);
            if (is2FA) {
                sendImageLog('⏳ [Flow] R5 — 2단계 인증 화면입니다. 휴대폰에서 Google 알림을 확인하거나 SMS 코드를 입력해주세요.');
            } else {
                sendImageLog('⏳ [Flow] R5 — 로그인이 진행 중인지 확인해주세요 (60초간 변화 없음).');
            }
        }
        // ✅ Google OAuth 완료 후 accounts.google.com에 stuck — 자동 redirect 트리거
        const isOnGoogleAccounts = /accounts\.google\.com|myaccount\.google\.com/.test(currentUrl);
        const stuckMs = Date.now() - lastUrlChange;
        if (isOnGoogleAccounts && stuckMs > 30_000 && stuckRedirectAttempts < 3) {
            stuckRedirectAttempts++;
            flowLog(`[Flow] ⚡ accounts.google.com에 ${Math.round(stuckMs/1000)}s stuck — 자동으로 Flow 재방문 (시도 ${stuckRedirectAttempts}/3)`);
            sendImageLog(`⚡ [Flow] OAuth 완료 감지 → Flow 페이지로 자동 이동 중... (${stuckRedirectAttempts}/3)`);
            try {
                await loginPage.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 15000 });
                lastUrlChange = Date.now();
            } catch (e) {
                flowWarn(`[Flow] 자동 재방문 실패: ${(e as Error).message}`);
            }
        }
        const elapsedSec = Math.round((Date.now() - overallStart) / 1000);
        if (elapsedSec > 0 && elapsedSec % 30 === 0) {
            sendImageLog(`⏳ [Flow] 로그인 대기 중... (${elapsedSec}s 경과 / 현재 URL: ${currentUrl.slice(0, 60)}...)`);
        }
    }

    if (!loginSuccess) {
        await loginCtx.close().catch(() => {});
        throw new Error('FLOW_LOGIN_TIMEOUT:Google 로그인 시간이 30분을 넘었습니다. 2단계 인증이 완료된 후에도 자동 감지되지 않으면 [Flow 로그인] 버튼을 다시 눌러주세요. 폰에서 푸시 승인 후 노트북 화면이 labs.google/fx/tools/flow 페이지로 자동 이동하지 않으면 주소창에 직접 입력해주세요.');
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
        throw new Error('FLOW_SESSION_LOST:Google 세션이 끊겼습니다. 다시 [Flow 로그인]을 진행해주세요.');
    }

    sendImageLog('✅ [Flow] 숨김 모드 전환 완료 — 이미지 생성 준비됨');
    cachedContext = finalCtx;
    cachedPage = finalPage;
    // [v2.10.158] zombieRecovery hook — Flow chromium 추적 (신규 세션)
    try {
        const browser = finalCtx.browser();
        const pid = (browser as any)?.process?.()?.pid;
        if (pid) {
            const zr = require('../runtime/zombieRecovery.js');
            const { app } = require('electron');
            zr.trackBrowserPid({
                pid,
                kind: 'playwright-chromium',
                cmdlineFingerprint: app.getPath('userData'),
                label: 'flow-new',
            });
        }
    } catch { /* ignore */ }
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
/**
 * 페이지 로드 시점에 MutationObserver를 주입해 *모든 신규 overlay iframe*을 자동 hide.
 *
 * 영구 차단 — Google이 changelog/whats_new/banner/survey 어떤 형태로 띄워도 즉시 무력화.
 * dismissChangelogModal()의 한계 (호출 타이밍 의존)를 보완.
 *
 * 적용:
 *   - context.addInitScript() — 모든 페이지 navigation에 자동 주입
 *   - 페이지 로드 → DOM 준비 → 초기 스캔 → MutationObserver 부착
 *   - 신규 iframe 추가 감지 시 즉시 부모 overlay 컨테이너 hide
 *
 * 매칭 패턴 (URL 기반, 클래스명에 의존 안 함):
 *   changelogs | whats_new | whatsnew | banner | survey | consent | onboarding | promo
 */
async function injectAntiModalObserver(context: BrowserContext): Promise<void> {
    try {
        await context.addInitScript(() => {
            if ((window as unknown as { __flowAntiModalInstalled?: boolean }).__flowAntiModalInstalled) return;
            (window as unknown as { __flowAntiModalInstalled?: boolean }).__flowAntiModalInstalled = true;

            // URL 패턴 — iframe.src/srcdoc 검사
            const OVERLAY_URL_RE = /changelogs?|whats[_-]?new|banner|survey|consent|onboarding|promo/i;
            // 텍스트 콘텐츠 패턴 — div modal 검사 (영/한 동시)
            const OVERLAY_TEXT_RE = /What['']?s\s*new|새로운\s*기능|변경\s*사항|tour|guide\s*me|onboarding|시작하기|소개/i;
            // 화이트리스트 — 정상 dialog는 hide X (입력/login 등)
            const SAFE_TEXT_RE = /sign\s*in|로그인|email|password|비밀번호|prompt|프롬프트/i;

            const hideElement = (el: HTMLElement): void => {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('pointer-events', 'none', 'important');
                el.setAttribute('data-flow-hidden', '1');
            };

            const climbAndHide = (start: HTMLElement): void => {
                let p: HTMLElement | null = start;
                let levels = 0;
                while (p && levels < 8) {
                    try {
                        const style = window.getComputedStyle(p);
                        const z = parseInt(style.zIndex || '0', 10) || 0;
                        const positioned = style.position === 'fixed' || style.position === 'absolute';
                        const overlay = /overlay|modal|popup|backdrop|dialog|sheet/i.test(p.className || '');
                        if (positioned && (z >= 100 || overlay)) {
                            hideElement(p);
                            return;
                        }
                    } catch { /* ignore */ }
                    p = p.parentElement;
                    levels++;
                }
                hideElement(start);
            };

            const isOverlayIframe = (iframe: HTMLIFrameElement): boolean => {
                const src = iframe.src || iframe.getAttribute('src') || '';
                if (OVERLAY_URL_RE.test(src)) return true;
                const srcdoc = iframe.getAttribute('srcdoc') || '';
                if (srcdoc && OVERLAY_TEXT_RE.test(srcdoc)) return true;
                return false;
            };

            // div role=dialog / <dialog> / popover — 텍스트 기반 매칭
            const isOverlayDialog = (el: Element): boolean => {
                if (el.getAttribute('data-flow-hidden') === '1') return false;
                const role = el.getAttribute('role') || '';
                const isDialog = role === 'dialog' || role === 'alertdialog' || el.tagName === 'DIALOG';
                const hasPopover = (el as HTMLElement).getAttribute?.('popover') !== null;
                if (!isDialog && !hasPopover) return false;
                const text = (el.textContent || '').slice(0, 500);
                if (SAFE_TEXT_RE.test(text)) return false; // 로그인/입력 dialog는 hide X
                if (OVERLAY_TEXT_RE.test(text)) return true;
                // 텍스트 매칭 안 돼도 changelog/whats_new 클래스면 hide
                if (/changelog|whats[_-]?new|onboarding|tour/i.test(el.className || '')) return true;
                return false;
            };

            // Shadow DOM 재귀 탐색
            const deepQueryAll = (root: ParentNode | ShadowRoot, sel: string, out: Element[]): void => {
                try {
                    (root.querySelectorAll(sel) as NodeListOf<Element>).forEach((e) => out.push(e));
                    (root.querySelectorAll('*') as NodeListOf<Element>).forEach((e) => {
                        const sr = (e as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
                        if (sr) deepQueryAll(sr, sel, out);
                    });
                } catch { /* ignore */ }
            };

            const scanAndHide = (root: ParentNode): void => {
                const iframes: Element[] = [];
                const dialogs: Element[] = [];
                deepQueryAll(root, 'iframe', iframes);
                deepQueryAll(root, '[role="dialog"], [role="alertdialog"], dialog, [popover]', dialogs);
                iframes.forEach((i) => {
                    if (isOverlayIframe(i as HTMLIFrameElement)) climbAndHide(i as HTMLElement);
                });
                dialogs.forEach((d) => {
                    if (isOverlayDialog(d)) climbAndHide(d as HTMLElement);
                });
            };

            const start = (): void => {
                scanAndHide(document);
                // childList: 신규 노드 / attributes: src 동적 설정 케이스
                const observer = new MutationObserver((muts) => {
                    for (const m of muts) {
                        if (m.type === 'attributes') {
                            const t = m.target as Element;
                            if (t.tagName === 'IFRAME' && isOverlayIframe(t as HTMLIFrameElement)) {
                                climbAndHide(t as HTMLElement);
                            } else if (
                                t.matches?.('[role="dialog"], [role="alertdialog"], dialog, [popover]') &&
                                isOverlayDialog(t)
                            ) {
                                climbAndHide(t as HTMLElement);
                            }
                            continue;
                        }
                        m.addedNodes.forEach((n) => {
                            if (n.nodeType !== 1) return;
                            const el = n as Element;
                            if (el.tagName === 'IFRAME') {
                                if (isOverlayIframe(el as HTMLIFrameElement)) climbAndHide(el as HTMLElement);
                            } else if (
                                el.matches?.('[role="dialog"], [role="alertdialog"], dialog, [popover]')
                            ) {
                                if (isOverlayDialog(el)) climbAndHide(el as HTMLElement);
                            } else {
                                scanAndHide(el);
                            }
                        });
                    }
                });
                observer.observe(document.documentElement, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['src', 'srcdoc', 'role', 'class', 'open', 'style'],
                });
                // style 재설정 우회 — Google이 display:'' 또는 pointer-events:auto로 다시 설정 시
                // 1초 간격으로 marker 가진 element를 재hide (낮은 빈도, 비용 무시 가능)
                setInterval(() => {
                    try {
                        document.querySelectorAll<HTMLElement>('[data-flow-hidden="1"]').forEach((el) => {
                            const cs = window.getComputedStyle(el);
                            if (cs.display !== 'none') {
                                el.style.setProperty('display', 'none', 'important');
                            }
                            if (cs.pointerEvents !== 'none') {
                                el.style.setProperty('pointer-events', 'none', 'important');
                            }
                        });
                    } catch { /* ignore */ }
                }, 1000);
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', start, { once: true });
            } else {
                start();
            }
        });
    } catch (err) {
        flowWarn(`[Flow] anti-modal observer 주입 실패 (무시): ${(err as Error).message.substring(0, 80)}`);
    }
}

/**
 * click 직전 가드 — target element의 중앙 좌표에서 elementFromPoint()로 *실제로 위에 있는*
 * element를 검사. 다른 element가 가리고 있으면 그것을 hide한 후 retry.
 *
 * iframe/div modal observer가 race condition으로 놓친 케이스를 click 시점에 최후 방어.
 */
async function safeClickWithOverlayGuard(page: Page, locator: Locator, label: string): Promise<void> {
    // 1차: 일반 click 시도 (5초)
    try {
        await locator.click({ timeout: 5000 });
        return;
    } catch (firstErr) {
        flowLog(`[Flow][Click Guard] ${label} 1차 click 실패 — 가린 element 검사: ${(firstErr as Error).message.substring(0, 80)}`);
    }
    // 2차: 가린 element를 elementFromPoint로 찾아 hide
    try {
        const hidden = await locator.evaluate((el: HTMLElement) => {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const top = document.elementFromPoint(cx, cy);
            if (!top || top === el || el.contains(top)) return null;
            // top이 target을 포함하면 정상. 그 외에는 가리는 element.
            // top이 iframe·dialog·overlay 후보면 hide
            let cur: Element | null = top;
            let levels = 0;
            const hidden: string[] = [];
            while (cur && levels < 8) {
                try {
                    const style = window.getComputedStyle(cur);
                    const z = parseInt(style.zIndex || '0', 10) || 0;
                    const positioned = style.position === 'fixed' || style.position === 'absolute';
                    if (positioned && z >= 100) {
                        (cur as HTMLElement).style.setProperty('display', 'none', 'important');
                        (cur as HTMLElement).style.setProperty('pointer-events', 'none', 'important');
                        hidden.push(`${cur.tagName}.${cur.className || '(no-class)'}`.substring(0, 80));
                        break;
                    }
                } catch { /* ignore */ }
                cur = cur.parentElement;
                levels++;
            }
            return hidden;
        });
        if (hidden && hidden.length > 0) {
            flowLog(`[Flow][Click Guard] ${label} 가린 element ${hidden.length}개 hide: ${hidden.join(', ')}`);
            await page.waitForTimeout(150);
        }
    } catch (probeErr) {
        flowWarn(`[Flow][Click Guard] elementFromPoint 검사 실패 (무시): ${(probeErr as Error).message.substring(0, 80)}`);
    }
    // 3차: force click
    try {
        await locator.click({ force: true, timeout: 5000 });
        return;
    } catch (forceErr) {
        flowLog(`[Flow][Click Guard] ${label} force click도 실패: ${(forceErr as Error).message.substring(0, 80)}`);
    }
    // 4차: JS dispatch
    await locator.evaluate((el: HTMLElement) => {
        try { el.focus(); } catch { /* ignore */ }
        try { el.click(); } catch { /* ignore */ }
        try {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        } catch { /* ignore */ }
    });
}

/**
 * Google Flow 2026-04-28 changelog iframe 차단 회피.
 *
 * 증상: changelog iframe(`gstatic.com/aitestkitchen/website/flow/changelogs/...html`)이
 * 자동으로 떠서 프롬프트 textbox 위를 덮음 → click이 iframe에 가로채여 30초 timeout × 3회.
 *
 * 진단 근거: flow-debug 로그
 *   "subtree intercepts pointer events" + iframe.eRXgu (parent: div.hHCoWD)
 *
 * 처리 순서:
 *   1) iframe parent div의 close 버튼(aria-label) 클릭 시도
 *   2) 못 찾으면 JS로 iframe 부모 div 강제 제거 (DOM hide)
 *
 * dismissCookieBanner와 동일 패턴 — silent fail 허용 (없을 때 무한 루프 방지)
 */
async function dismissChangelogModal(page: Page): Promise<void> {
    try {
        // 1) close 버튼 시도 (다국어 + aria-label + 일반 X 버튼)
        const closeSelectors = [
            'button[aria-label*="닫기" i]',
            'button[aria-label*="close" i]',
            'button[aria-label*="dismiss" i]',
            'div.hHCoWD button',
            'div[class*="hHCoWD"] button',
        ];
        for (const sel of closeSelectors) {
            const btn = page.locator(sel).first();
            if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
                await btn.click({ timeout: 1500, force: true }).catch(() => {});
                await page.waitForTimeout(300);
                flowLog(`[Flow] 📋 changelog 모달 닫음 (${sel})`);
                return;
            }
        }
        // 2) 강제 제거 — close 버튼 못 찾으면 JS로 DOM에서 iframe 부모 hide
        const removed = await page.evaluate(() => {
            let count = 0;
            document.querySelectorAll('iframe[src*="changelogs"]').forEach((iframe) => {
                // iframe 부모 div를 통째로 hide (display:none) — DOM 제거 시 재생성될 수 있어 hide만
                let parent: HTMLElement | null = iframe.parentElement as HTMLElement | null;
                let levels = 0;
                while (parent && levels < 5) {
                    // hHCoWD 같은 컨테이너 도달 시 hide
                    if (parent.className && /hHCoWD|sc-c7ee1759/.test(parent.className)) {
                        parent.style.setProperty('display', 'none', 'important');
                        parent.style.setProperty('pointer-events', 'none', 'important');
                        count++;
                        return;
                    }
                    parent = parent.parentElement;
                    levels++;
                }
                // 폴백: iframe 자체 hide
                (iframe as HTMLIFrameElement).style.display = 'none';
                count++;
            });
            return count;
        }).catch(() => 0);
        if (removed > 0) {
            flowLog(`[Flow] 📋 changelog iframe ${removed}개 강제 hide`);
            await page.waitForTimeout(200);
        }
    } catch (err) {
        flowWarn(`[Flow] changelog 모달 닫기 실패 (무시): ${(err as Error).message.substring(0, 80)}`);
    }
}

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
// ✅ [v2.7.68] 다중 신호 감지 — 2FA redirect 도중에도 빠르게 감지
async function isLoggedInToFlow(page: Page): Promise<boolean> {
    try {
        // 1) URL이 labs.google/fx 도메인이 아니면 일단 false (accounts.google.com 등)
        const url = page.url();
        if (!/labs\.google\/fx/.test(url)) return false;

        // 2) /fx/api/auth/session 체크 (정식 신호)
        const sessionUser = await page.evaluate(async () => {
            try {
                const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
                if (!res.ok) return null;
                const json = await res.json();
                return json?.user?.email || json?.user?.name || null;
            } catch { return null; }
        }).catch(() => null);
        if (sessionUser) return true;

        // 3) DOM 신호: 사용자 아바타 또는 "프로젝트" 버튼이 보이면 로그인 완료
        const domSignal = await page.evaluate(() => {
            const selectors = [
                'button[aria-label*="account" i]',
                'img[alt*="profile" i]',
                'button[aria-label*="프로필" i]',
                '[data-testid*="user-menu"]',
                'button:has-text("새 프로젝트")',
            ];
            for (const sel of selectors) {
                try {
                    const el = document.querySelector(sel);
                    if (el && (el as HTMLElement).offsetParent !== null) return true;
                } catch { /* invalid selector ignore */ }
            }
            return false;
        }).catch(() => false);
        return !!domSignal;
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
const FLOW_SINGLE_IMAGE_WAIT_TIMEOUT_MS = 180000;
const FLOW_SINGLE_IMAGE_MAX_RETRIES = 2;
// 생성 오류(서버 거부) 회복: 같은 프롬프트 재시도는 무의미 → 프롬프트를 단계적으로 단순화(레벨 1~2)
// 하고 새 프로젝트로 격리한 뒤 재시도. 일반 retry 예산과 별개로 최대 2회.
// WARNING: 이 값을 올리면 generateSingleImageWithFlow의 attempt-- 재시도 상한도 그만큼 늘어난다(총 submit 증가).
const FLOW_GEN_ERROR_MAX_SIMPLIFY = 2;
const FLOW_GEN_ERROR_BACKOFF_MS = 20000;
// in-page "다시 시도" 자동 클릭: 일시 서버 오류/throttle는 즉시 재클릭보다 시간을 줘야 회복된다.
// 클릭 후 점증 대기(10s→18s→28s)로 transient 회복률을 높이고, 그래도 실패면 단순화 단계로 넘긴다.
const FLOW_INPAGE_RETRY_MAX = 3;
const FLOW_INPAGE_RETRY_WAIT_MS = [10000, 18000, 28000];
const FLOW_SEQUENTIAL_IMAGE_STABILIZE_MS = 30_000;

function getFlowSequentialImageStabilizeMs(): number {
    const raw = Number(process.env.FLOW_SEQUENTIAL_IMAGE_STABILIZE_MS);
    if (!Number.isFinite(raw) || raw < 0) return FLOW_SEQUENTIAL_IMAGE_STABILIZE_MS;
    return Math.min(120_000, Math.floor(raw));
}

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
    // [Phase 0/v2.10.126] 2500ms 고정 대기 → networkidle (평균 단축)
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => { /* timeout 시도 진행 */ });
    // [v1.6.1] 세션당 1회 원칙 — 이미 dismissed이면 skip
    if (!cookieBannerDismissed) await dismissCookieBanner(page);
    // 2026-04-28 changelog iframe 자동 dismiss — pointer event 차단 회피
    await dismissChangelogModal(page);

    flowLog('[Flow][1/3] "새 프로젝트" 버튼 탐색 중...');
    // ✅ [SPEC-IMAGE-RECOVERY-001 R4] 다중 셀렉터 폴백 — 우선순위 순회
    const { iterateFlowSelectors } = await import('../automation/selectors/index.js');
    const { getRecoveryCoordinator } = await import('./recovery/index.js');
    const r4Coordinator = getRecoveryCoordinator();
    const r4Excluded = r4Coordinator.getAttempts().r4SelectorFailed;

    let newProjectClicked = false;
    let r4LastError: Error | null = null;
    for (const { id, selector } of iterateFlowSelectors('newProjectButton', r4Excluded)) {
        try {
            const btn = page.locator(selector).first();
            await btn.waitFor({ state: 'visible', timeout: 8000 });
            await btn.click();
            flowLog(`[Flow][1/3] R4 ✅ 셀렉터 ${id} 매칭 + 클릭 성공`);
            newProjectClicked = true;
            break;
        } catch (selErr) {
            r4LastError = selErr as Error;
            r4Coordinator.recordSelectorFailure(id);
            flowLog(`[Flow][1/3] R4 ⚠️ 셀렉터 ${id} 실패 → 다음 시도`);
        }
    }

    if (!newProjectClicked) {
        await saveDebugScreenshot(page, 'no-new-project-btn');
        const allButtons = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button')).slice(0, 20).map(b => (b.textContent || '').trim().substring(0, 50));
        }).catch(() => []);
        flowError(`[Flow][1/3] ❌ R4 모든 셀렉터 폴백 실패. DOM 버튼 상위 20개 ↓`, allButtons);
        throw new Error(`FLOW_NEW_PROJECT_BUTTON_NOT_FOUND:Google Flow 페이지가 변경되었거나 계정 권한 문제로 보입니다. 1) 인터넷 연결 확인  2) 1시간 후 재시도  3) 계속 실패하면 다른 이미지 엔진을 선택해주세요. (마지막 오류: ${r4LastError?.message?.substring(0, 80) ?? 'unknown'})`);
    }
    flowLog('[Flow][1/3] "새 프로젝트" 클릭됨 — URL 리다이렉트 대기');

    try {
        await page.waitForURL(/\/tools\/flow\/project\//, { timeout: 30000 });
    } catch (err) {
        await saveDebugScreenshot(page, 'no-project-redirect');
        throw new Error(`FLOW_PROJECT_REDIRECT_TIMEOUT:"새 프로젝트" 클릭 후 프로젝트 URL 리다이렉트 30초 초과. 현재 URL: ${page.url()}`);
    }
    await page.waitForTimeout(1500);
    // 새 프로젝트 페이지에서도 changelog/onboarding 팝업 가능 — 즉시 dismiss
    await dismissChangelogModal(page);
    cachedProjectUrl = page.url();
    flowLog(`[Flow][1/3] ✅ 프로젝트 생성 완료: ${cachedProjectUrl}`);
    sendImageLog(`✅ [Flow] 프로젝트 준비됨`);
}

// ─── 프롬프트 입력창 / 전송 버튼 로케이터 헬퍼 ────
// R4 Phase 6 확장: FLOW_SELECTORS 다중 폴백을 사용하지만, 호환성 위해 단일 로케이터 헬퍼는 첫 매칭 셀렉터로 유지.
// 실제 다중 폴백은 submitPromptOnly의 진입 직후에서 수행.
function promptInputLocator(page: Page): Locator {
    return page.locator('[role="textbox"][contenteditable="true"], div[contenteditable="true"]').first();
}

function submitButtonLocator(page: Page): Locator {
    return page.locator('button').filter({ hasText: /arrow_forward/ }).first();
}

// R4 Phase 6: promptInput/submitButton 다중 셀렉터 우선순위 탐색
async function findFirstMatchingFlowSelector(page: Page, key: 'promptInput' | 'submitButton'): Promise<Locator | null> {
    const { iterateFlowSelectors } = await import('../automation/selectors/index.js');
    const { getRecoveryCoordinator } = await import('./recovery/index.js');
    const coord = getRecoveryCoordinator();
    const excluded = coord.getAttempts().r4SelectorFailed;
    for (const { id, selector } of iterateFlowSelectors(key, excluded)) {
        try {
            const loc = page.locator(selector).first();
            await loc.waitFor({ state: 'visible', timeout: 5000 });
            flowLog(`[Flow] R4 ✅ ${key} 셀렉터 ${id} 매칭`);
            return loc;
        } catch {
            coord.recordSelectorFailure(id);
        }
    }
    return null;
}

// ─── [v1.6.1] 프롬프트 입력 + 제출 (즉시 반환) ────
//   기존 typePromptAndSubmit에서 검증/대기 최소화
async function submitPromptOnly(page: Page, prompt: string): Promise<void> {
    flowLog(`[Flow][2/3] 프롬프트 입력 시작 (길이: ${prompt.length})`);

    // 2026-04-28 changelog iframe이 매 시도마다 다시 뜰 수 있어 입력 직전 재dismiss
    await dismissChangelogModal(page);

    // R4 Phase 6: 단일 셀렉터 → 다중 폴백
    let promptInput = await findFirstMatchingFlowSelector(page, 'promptInput');
    if (!promptInput) {
        promptInput = promptInputLocator(page);
        try {
            await promptInput.waitFor({ state: 'visible', timeout: 5000 });
        } catch (err) {
            await saveDebugScreenshot(page, 'no-prompt-input');
            throw new Error('FLOW_PROMPT_INPUT_NOT_FOUND:Flow 프롬프트 입력창을 찾지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
        }
    }
    // changelog/overlay가 가리는 케이스 4단계 폴백 (일반 → elementFromPoint hide → force → JS dispatch)
    await safeClickWithOverlayGuard(page, promptInput, 'promptInput');
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

    // [2026-05-27 작업 25 — 2순위 fix] 입력값 검증 복구 (v1.6.1에서 성능상 제거됐던 부분)
    //   사용자 보고: prompt 전송 후 165초 무응답, [Flow][Net][DIAG] image 응답 0건.
    //   원인: contenteditable race condition — fill() 성공 반환됐어도 실제 DOM에 텍스트 미반영.
    //   처방: fill() 직후 textContent로 실제 반영 확인. 미반영 시 pressSequentially로 강제 재입력.
    //   성능: 100ms 검증 < 165초 무응답. 정합성 우선.
    try {
        const expected = prompt.trim();
        const actualText = await promptInput.evaluate((el: any) =>
            (el.textContent || el.value || el.innerText || '').trim()
        );
        const ratio = expected.length > 0 ? actualText.length / expected.length : 0;
        if (ratio < 0.5) {
            flowWarn(`[Flow][2/3] ⚠️ 입력값 미반영 감지 (실제 ${actualText.length}자 / 기대 ${expected.length}자, ratio=${ratio.toFixed(2)}) — pressSequentially 강제 재입력`);
            await promptInput.fill('').catch(() => undefined);
            await page.waitForTimeout(100);
            await promptInput.pressSequentially(prompt, { delay: 5, timeout: 25000 });
            const reText = await promptInput.evaluate((el: any) =>
                (el.textContent || el.value || el.innerText || '').trim()
            );
            const reRatio = expected.length > 0 ? reText.length / expected.length : 0;
            if (reRatio < 0.5) {
                await saveDebugScreenshot(page, 'input-verify-fail');
                throw new Error(`FLOW_INPUT_VERIFY_FAIL:입력 검증 실패 — fill+pressSequentially 모두 미반영 (실제 ${reText.length}자 / 기대 ${expected.length}자). Flow contenteditable 셀렉터 변경 의심.`);
            }
            flowLog(`[Flow][2/3] ✅ pressSequentially 재입력 검증 통과 (${reText.length}자)`);
        } else {
            flowLog(`[Flow][2/3] ✅ 입력값 검증 통과 (${actualText.length}/${expected.length}자, ratio=${ratio.toFixed(2)})`);
        }
    } catch (verifyErr) {
        const msg = (verifyErr as Error).message || '';
        if (msg.startsWith('FLOW_')) throw verifyErr;
        flowWarn(`[Flow][2/3] 입력 검증 중 예외 (계속 진행): ${msg.substring(0, 100)}`);
    }

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

// Extracts the media UUID from either the DOM redirect src
// (…getMediaUrlRedirect?name=<uuid>) or the CDN URL
// (flow-content.google/image/<uuid>) — the only stable identity across the
// 2026-06 Flow UI redesign. Counting <img> nodes misfires: previous
// generations leave duplicate nodes and late CDN responses.
function extractFlowImageId(url: string): string | null {
    const m = String(url || '').match(/(?:getMediaUrlRedirect\?name=|flow-content\.google\/image\/)([0-9a-fA-F-]{16,})/);
    return m ? m[1] : null;
}

// ─── [v1.6.1] 이미지 감지 (in-browser waitForFunction + 네트워크 race) ────
//   기존 evaluate 500ms 폴링 → waitForFunction 200ms in-browser 폴링
//   + 네트워크 리스너가 먼저 감지하면 즉시 반환
async function waitForNewImage(page: Page, prevCount: number, timeoutMs: number = 120000): Promise<string> {
    const queueStartSize = _networkImageQueue.length;

    // [2026-06-11] Identity baseline: snapshot every media UUID already
    // visible (DOM + full network queue). Live incident: a straggler CDN
    // response from the PREVIOUS generation resolved the race in 2s and the
    // previous heading's image was returned for the next heading.
    const knownIds: string[] = await page.evaluate(() => {
        const ids: string[] = [];
        for (const img of Array.from(document.querySelectorAll('img'))) {
            const m = ((img as HTMLImageElement).src || '').match(/(?:getMediaUrlRedirect\?name=|flow-content\.google\/image\/)([0-9a-fA-F-]{16,})/);
            if (m && !ids.includes(m[1])) ids.push(m[1]);
        }
        return ids;
    }).catch(() => [] as string[]);
    for (const queuedUrl of _networkImageQueue) {
        const id = extractFlowImageId(queuedUrl);
        if (id && !knownIds.includes(id)) knownIds.push(id);
    }
    flowLog(`[Flow][3/3] 이미지 생성 대기 시작 (기존 DOM ${prevCount}장, 기존 ID ${knownIds.length}개, queue baseline=${queueStartSize}, 타임아웃 ${timeoutMs / 1000}초)`);

    // DOM waitForFunction 기반 감지 (Promise A)
    const domPromise = page.waitForFunction(
        (args: { prev: number; known: string[] }) => {
            const knownSet = new Set(args.known);
            const extractId = (src: string): string | null => {
                const m = src.match(/(?:getMediaUrlRedirect\?name=|flow-content\.google\/image\/)([0-9a-fA-F-]{16,})/);
                return m ? m[1] : null;
            };
            const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
            const matches = imgs.filter(img => {
                const alt = img.alt || '';
                const src = img.src || '';
                const aria = img.getAttribute('aria-label') || '';
                const fullyLoaded = img.complete && img.naturalWidth >= 200 && img.naturalHeight >= 200;
                if (!fullyLoaded) return false;
                // overlay iframe(changelog 등) 내부 이미지 무시
                if (/changelogs?|whats[_-]?new|banner|survey|consent|onboarding|promo/i.test(src)) return false;
                // alt/aria-label 다국어 매칭 확장 — 14개 언어 (KR/EN/CN/JP/FR/ES/DE + 추가)
                if (/생성된 이미지|이미지 결과|Generated image|Generated|생성|已生成|生成された|生成图像|Image générée|Imagen generada|Generiertes Bild|Immagine generata|Сгенерированное|Gerada|รูปภาพที่สร้าง/i.test(alt + aria)) return true;
                // URL 매칭 확장 — Google CDN
                if (/media\.getMediaUrlRedirect|flowMedia|flow-media|googleusercontent|aitestkitchen/i.test(src)) return true;
                // 큰 이미지 + 외부 HTTP — 마지막 폴백
                if (img.naturalWidth >= 512 && !/=s\d+-c$/.test(src) && src.startsWith('http')) return true;
                return false;
            });
            // 1순위: 식별자 기반 — 대기 시작 시점에 없던 UUID만 신규로 인정
            const fresh = matches.filter(img => {
                const id = extractId(img.src || '');
                return id !== null && !knownSet.has(id);
            });
            if (fresh.length > 0) {
                // Flow가 한 prompt → 4 variants 동시 생성 — 매번 같은 variant
                // 선택을 피하려고 랜덤 픽 유지
                return fresh[Math.floor(Math.random() * fresh.length)].src;
            }
            // 2순위(식별자 없는 레이아웃 폴백): 기존 개수 비교 — UUID가 전혀
            // 안 잡히는 미래 개편 대비로만 유지
            const anon = matches.filter(img => extractId(img.src || '') === null);
            if (anon.length > args.prev) {
                const newCount = anon.length - args.prev;
                const idx = newCount === 1
                    ? args.prev
                    : args.prev + Math.floor(Math.random() * newCount);
                return anon[idx].src;
            }
            return null;
        },
        { prev: prevCount, known: knownIds },
        { timeout: timeoutMs, polling: 200 }
    ).then(handle => handle.jsonValue() as Promise<string>);

    // 네트워크 큐 폴링 기반 감지 (Promise B) — 100ms 간격으로 큐 확인
    // 신규 UUID만 인정 — 이전 생성분의 늦은 CDN 응답(가짜 성공) 차단
    const netPromise = new Promise<string>((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
            const candidates = _networkImageQueue.slice(queueStartSize).filter((u) => {
                const id = extractFlowImageId(u);
                return id === null || !knownIds.includes(id);
            });
            if (candidates.length > 0) {
                const url = candidates[candidates.length - 1];
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

    // [2026-06-11] 생성 오류 감시 (Promise C) — Flow가 서버측 실패 시
    // "문제가 발생했습니다. 다시 시도해 주세요." 카드 + [다시 시도] 버튼을
    // 띄운다 (라이브 스크린샷 실측). 자동으로 재시도를 눌러주고(최대 2회),
    // 그래도 실패하면 180초 blind 타임아웃 대신 즉시 명확한 에러로 종료.
    let watchdogStopped = false;
    let retryClicks = 0;
    const errorPromise = new Promise<string>((_resolve, reject) => {
        const check = async () => {
            if (watchdogStopped) return;
            try {
                const state = await page.evaluate(() => {
                    const bodyText = document.body?.innerText || '';
                    const hasError = /문제가 발생했습니다|다시 시도해 주세요|Something went wrong|An error occurred/i.test(bodyText);
                    if (!hasError) return { hasError: false, clicked: false };
                    let clicked = false;
                    for (const btn of Array.from(document.querySelectorAll('button'))) {
                        const label = (btn.textContent || '').trim();
                        if (/^다시 시도$|^Retry$|^Try again$/i.test(label)) {
                            (btn as HTMLButtonElement).click();
                            clicked = true;
                            break;
                        }
                    }
                    return { hasError: true, clicked };
                });
                if (state.hasError && !watchdogStopped) {
                    if (state.clicked && retryClicks < FLOW_INPAGE_RETRY_MAX) {
                        retryClicks += 1;
                        flowLog(`[Flow][3/3] ⚠️ 생성 오류 카드 감지 → "다시 시도" 자동 클릭 (${retryClicks}/${FLOW_INPAGE_RETRY_MAX})`);
                        sendImageLog(`🔁 [Flow] 생성 오류 감지 — 다시 시도 자동 클릭 (${retryClicks}/${FLOW_INPAGE_RETRY_MAX})`);
                        // 재클릭 후엔 점증 대기 — 일시 서버 오류/throttle 회복 시간 부여 (즉시 재확인 금지).
                        const waitMs = FLOW_INPAGE_RETRY_WAIT_MS[Math.min(retryClicks - 1, FLOW_INPAGE_RETRY_WAIT_MS.length - 1)];
                        if (!watchdogStopped) setTimeout(check, waitMs);
                        return;
                    } else {
                        reject(new Error('FLOW_GENERATION_ERROR:Flow가 생성 오류를 반환했습니다 (다시 시도 자동 클릭 후에도 실패). 잠시 후 재시도하거나 프롬프트를 단순화하세요.'));
                        return;
                    }
                }
            } catch { /* 페이지 전환 중 — 계속 감시 */ }
            if (!watchdogStopped) setTimeout(check, 3000);
        };
        setTimeout(check, 8000);
    });

    // 주기적 진행 로그 (15초 간격)
    const logStart = Date.now();
    const logInterval = setInterval(() => {
        const sec = Math.round((Date.now() - logStart) / 1000);
        sendImageLog(`⏳ [Flow] 이미지 생성 중... ${sec}초 경과`);
        flowLog(`[Flow][3/3] ⏳ 대기 중 ${sec}초 경과 (net queue=${_networkImageQueue.length - queueStartSize})`);
    }, 15000);

    try {
        const delayedDomPromise = new Promise<string>((resolve, reject) => {
            setTimeout(() => {
                domPromise.then(resolve, reject);
            }, 2500);
        });
        const racedUrl = await Promise.race([netPromise, delayedDomPromise, errorPromise]);
        // 네트워크 최신값 우선 적용도 신규 UUID만 — 이전 생성분 오염 차단
        const queuedFresh = _networkImageQueue.slice(queueStartSize).filter((u) => {
            const id = extractFlowImageId(u);
            return id === null || !knownIds.includes(id);
        });
        const imageUrl = queuedFresh.length > 0 ? queuedFresh[queuedFresh.length - 1] : racedUrl;
        if (imageUrl !== racedUrl) {
            flowLog(`[Flow][3/3] 네트워크 최신 URL 우선 적용: ${imageUrl.substring(0, 120)}`);
        }
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
        // FLOW_GENERATION_ERROR(오류 카드)는 원인 코드 보존 — blind 타임아웃으로 덮지 않는다
        if (err instanceof Error && err.message.startsWith('FLOW_GENERATION_ERROR')) throw err;
        throw new Error(`FLOW_IMAGE_TIMEOUT:Flow 이미지 생성이 ${timeoutMs / 1000}초 안에 끝나지 않았습니다. 프롬프트를 단순화하거나 5분 후 다시 시도해주세요.`);
    } finally {
        watchdogStopped = true;
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
            let buffer = await response.body();
            if (buffer.length < 1024) {
                // ✅ [SPEC-IMAGE-RECOVERY-001 R6] Flow 썸네일 → 풀해상도 교체 패턴 대응:
                // 5초 대기 후 같은 URL 1회 재요청. 두 번째도 작으면 reject 유지.
                flowWarn(`[Flow] R6 — 다운로드 ${buffer.length}bytes < 1KB, 5초 대기 후 1회 재요청`);
                await new Promise((r) => setTimeout(r, 5000));
                const retry = await ctx.request.get(imageUrl, { timeout: 30000, maxRedirects: 5 });
                if (retry.ok()) {
                    const retryBuffer = await retry.body();
                    if (retryBuffer.length >= 1024) {
                        const mt = retry.headers()['content-type']?.split(';')[0]?.trim() || 'image/png';
                        flowLog(`[Flow] 📦 R6 재요청 성공 (${Math.round(retryBuffer.length / 1024)}KB)`);
                        return { buffer: retryBuffer, mimeType: mt };
                    }
                    buffer = retryBuffer;
                }
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
// Prompt injection helpers (injectUniqueSalt, injectHeadingVariation,
// sanitizeHeadingForPrompt) live in ./flowPromptInjection.ts so they can be
// unit-tested without loading electron.

/**
 * 헤딩간 prompt 유사도 진단 — *상류 회귀* 자동 감지.
 *
 * 4 헤딩의 base prompt가 서로 거의 같으면 (같은 prompt template 결과) Flow 결과도 같아질 위험.
 * Jaccard similarity (단어 set 교집합/합집합)로 측정해 경고 로그 발생.
 *
 * 임계 0.8 이상: 거의 동일 → 콘텐츠 생성 단계 회귀 의심
 * 임계 0.6~0.8: 비슷 — 헤딩 variation hint로 차별화 필요
 * 임계 0.6 미만: 정상
 *
 * 호출 시점: generateWithFlow 진입 시 1회.
 */
function diagnoseHeadingPromptSimilarity(items: ImageRequestItem[]): void {
    if (items.length < 2) return;
    const tokenize = (s: string): Set<string> => {
        const tokens = (s.toLowerCase().match(/[a-z가-힣0-9]+/g) ?? []).filter((t) => t.length >= 3);
        return new Set(tokens);
    };
    const tokenSets = items.map((it) => tokenize(String(it.englishPrompt || it.prompt || '')));
    let highCount = 0;
    let totalPairs = 0;
    let maxSim = 0;
    let maxPair: [number, number] = [-1, -1];
    for (let i = 0; i < tokenSets.length; i++) {
        for (let j = i + 1; j < tokenSets.length; j++) {
            const a = tokenSets[i];
            const b = tokenSets[j];
            if (a.size === 0 || b.size === 0) continue;
            let inter = 0;
            for (const t of a) if (b.has(t)) inter++;
            const union = a.size + b.size - inter;
            const sim = union > 0 ? inter / union : 0;
            totalPairs++;
            if (sim >= 0.6) highCount++;
            if (sim > maxSim) {
                maxSim = sim;
                maxPair = [i, j];
            }
        }
    }
    if (totalPairs === 0) return;
    const ratio = highCount / totalPairs;
    if (maxSim >= 0.8) {
        flowWarn(`[Flow][Diagnose] ⚠️ 헤딩 #${maxPair[0] + 1}↔#${maxPair[1] + 1} prompt 유사도 ${(maxSim * 100).toFixed(0)}% — 같은 이미지 위험. 헤딩 variation hint 적용 중이지만 base prompt 차별화 권장.`);
        sendImageLog(`⚠️ [Flow] 헤딩간 prompt가 매우 유사 (${(maxSim * 100).toFixed(0)}%) — 같은 이미지 나올 가능성. 콘텐츠 생성 단계 점검 필요.`);
    } else if (ratio >= 0.5) {
        flowWarn(`[Flow][Diagnose] 헤딩간 prompt 유사 페어 ${highCount}/${totalPairs} (max ${(maxSim * 100).toFixed(0)}%) — 8가지 시점 hint로 차별화 시도`);
    } else {
        flowLog(`[Flow][Diagnose] ✅ 헤딩간 prompt 다양성 OK (max similarity ${(maxSim * 100).toFixed(0)}%)`);
    }
}

export async function generateSingleImageWithFlow(
    rawPrompt: string,
    _aspectRatio: string = '1:1',
    signal?: AbortSignal,
    opts?: { forceNewProjectOnLimit?: boolean },
): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const MAX_RETRIES = FLOW_SINGLE_IMAGE_MAX_RETRIES;
    let lastError: Error | null = null;
    // 생성 오류(FLOW_GENERATION_ERROR) 누적 시 프롬프트 단순화 레벨 — 일반 retry 예산과 별개.
    let genErrorSimplifyLevel = 0;

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

            // Flow가 같은 prompt에 같은 이미지 반환하는 회귀 차단 — 매 시도 unique salt.
            // 생성 오류가 누적됐으면(genErrorSimplifyLevel>0) 프롬프트를 단순화해 서버 거부 회피.
            let prompt = injectUniqueSalt(rawPrompt);
            if (genErrorSimplifyLevel > 0) {
                prompt = simplifyFlowPrompt(prompt, genErrorSimplifyLevel);
                sendImageLog(`🔧 [Flow] 프롬프트 단순화 적용 (레벨 ${genErrorSimplifyLevel}) — 생성 오류 회피`);
            }
            await submitPromptOnly(page, prompt);

            sendImageLog('⏳ [Flow] 이미지 생성 대기 중...');
            const newImageUrl = await waitForNewImage(page, prevCount, FLOW_SINGLE_IMAGE_WAIT_TIMEOUT_MS);
            flowLog(`[Flow] ✅ 이미지 URL 획득: ${newImageUrl.substring(0, 120)}`);

            sendImageLog('📥 [Flow] 이미지 다운로드 중...');
            const downloaded = await downloadImageAsBuffer(page, newImageUrl);

            trackApiUsage('gemini', { images: 1, model: 'flow-nano-banana-2', costOverride: 0 });
            // ✅ [v2.10.298] 일별 성공 카운트 — HTTP 429/한도성 에러 발생 시 봇감지 vs 진짜 한도 구분
            incrementFlowDailySuccess();
            sendImageLog(`✅ [Flow] 생성 완료 (${Math.round(downloaded.buffer.length / 1024)}KB)`);
            return downloaded;
        } catch (err) {
            const msg = (err as Error).message || '';
            flowWarn(`[Flow] 시도 ${attempt}/${MAX_RETRIES} 실패: ${msg}`);
            sendImageLog(`⚠️ [Flow] 시도 ${attempt} 실패: ${msg.substring(0, 150)}`);
            lastError = err as Error;

            // ✅ 생성 오류(서버 거부) — 같은 프롬프트 재시도는 무의미. 프롬프트 단순화 + 새 프로젝트 + 대기 후
            //   재시도(일반 retry 예산 미소진). 정책·숫자·민감어를 단계적으로 제거해 결정적 실패를 회복한다.
            if (/FLOW_GENERATION_ERROR/.test(msg) && genErrorSimplifyLevel < FLOW_GEN_ERROR_MAX_SIMPLIFY) {
                genErrorSimplifyLevel += 1;
                flowWarn(`[Flow] 🔧 생성 오류 → 프롬프트 단순화(레벨 ${genErrorSimplifyLevel}/${FLOW_GEN_ERROR_MAX_SIMPLIFY}) + 새 프로젝트 후 재시도`);
                sendImageLog(`🔧 [Flow] 생성 오류 감지 — 프롬프트 단순화 후 재시도 (${genErrorSimplifyLevel}/${FLOW_GEN_ERROR_MAX_SIMPLIFY})`);
                try {
                    const p = await ensureFlowBrowserPage();
                    await ensureFlowProject(p, true);
                } catch (isoErr) {
                    flowWarn(`[Flow] 단순화 재시도 전 새 프로젝트 격리 실패(계속 진행): ${(isoErr as Error).message.substring(0, 80)}`);
                }
                await new Promise((r) => setTimeout(r, FLOW_GEN_ERROR_BACKOFF_MS));
                attempt -= 1; // 단순화 재시도는 일반 retry 예산을 소비하지 않음 (genError 카운터로 별도 제한)
                continue;
            }

            // Flow timeout은 같은 프로젝트에 pending 작업이 남는 경우가 많으므로 다음 시도 전 새 프로젝트로 격리한다.
            // FLOW_BROWSER_LAUNCH_FAILED · FLOW_LOGIN_TIMEOUT 같은 구조적 오류는 reload/new project로 회복 불가 → skip.
            const isClickOrInputTimeout = /Timeout.*exceeded|FLOW_PROMPT_INPUT|FLOW_SUBMIT_BUTTON|FLOW_IMAGE_TIMEOUT|intercepts pointer/i.test(msg);
            if (attempt < MAX_RETRIES && isClickOrInputTimeout) {
                try {
                    flowLog('[Flow] 🔄 timeout/stuck 감지 — 새 프로젝트로 격리 후 재시도');
                    sendImageLog('🔄 [Flow] 응답 지연 감지 — 새 프로젝트로 정리 후 재시도합니다.');
                    const page = await ensureFlowBrowserPage();
                    await ensureFlowProject(page, true);
                } catch (reloadErr) {
                    flowWarn(`[Flow] 새 프로젝트 격리 실패 (다음 시도로 진행): ${(reloadErr as Error).message.substring(0, 80)}`);
                }
            }

            if (attempt < MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, 3000 * attempt));
            }
        }
    }

    throw lastError || new Error('FLOW_UNKNOWN_ERROR:이미지 생성 실패');
}

// v2.6.7 — 중복 가드 상수: Flow에서 SHA256/aHash 일치 시 diversity hint를
// 주입한 새 프롬프트로 단발 재생성. 무한 루프 방지를 위해 항당 최대 N회.
// Google Flow is web-automation based. Keep duplicate regeneration bounded so a single
// heading cannot stretch into several extra minutes unless strict diversity is explicitly enabled.
const FLOW_DUPLICATE_MAX_RETRIES = 2;
const FLOW_FORCE_FRESH_PROJECT_ON_DUPLICATE = process.env.FLOW_STRICT_DIVERSITY === '1';
// 사용자 실측: 임계 8은 시각적으로 동일한 이미지도 통과하는 케이스 발생 → 6으로 환원.
// 64비트 중 6비트 차이까지 유사로 간주 (8 → 6 환원, 사용자 보고 후 강화).
const FLOW_AHASH_THRESHOLD = 6;

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
    // FIFO 매칭 회귀 감지 — 이번 배치에서 이미 매칭된 URL 추적
    const pipelineSeenUrls: Set<string> = new Set();
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
            const basePrompt = item.englishPrompt || PromptBuilder.build(item, {
                imageStyle: (item as any).imageStyle || 'realistic',
                category: (item as any).category || '',
            } as any);
            // 헤딩 인덱스 기반 강제 시점/구도 회전 + 헤딩 제목 명시 subject prepend
            // (LLM이 비슷한 헤딩에 비슷한 base prompt 만드는 상류 회귀 방어)
            const prompt = injectHeadingVariation(basePrompt, submittedCount, item.heading);

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
            // Pipeline FIFO 매칭 회귀 진단 — Flow가 *제출 순서와 다른 순서*로 응답하면
            // submittedCount 기반 매칭이 어긋나 같은 URL이 다른 slot에 분배될 위험.
            // pipelineSeenUrls로 이번 배치 안에서 *URL 중복*을 즉시 감지.
            if (pipelineSeenUrls.has(imageUrl)) {
                flowWarn(`[Flow][Pipeline] ⚠️ FIFO 매칭 회귀 감지 — slot ${slot.index + 1}이 이미 매칭된 URL 재할당. 다음 새 이미지 대기.`);
                sendImageLog(`⚠️ [Flow] 매칭 회귀 — "${slot.item.heading}" 재대기`);
                // 재대기 — 진짜 새 이미지가 올 때까지
                const altUrl = await waitForNewImage(page, prevCount + 1, 60000).catch(() => imageUrl);
                if (altUrl !== imageUrl) {
                    flowLog(`[Flow][Pipeline] ✅ 재대기로 다른 URL 확보: ${altUrl.substring(0, 80)}...`);
                }
            }
            pipelineSeenUrls.add(imageUrl);
            let downloaded = await downloadImageAsBuffer(page, imageUrl);
            let acceptedPrompt = slot.prompt;

            // v2.6.7: 중복/유사 감지 시 diversity hint 단발 재생성 (최대 N회)
            if (usedImageHashes || usedImageAHashes) {
                let probe = await probeDuplicate(downloaded.buffer, usedImageHashes, usedImageAHashes, FLOW_AHASH_THRESHOLD);
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
                        probe = await probeDuplicate(downloaded.buffer, usedImageHashes, usedImageAHashes, FLOW_AHASH_THRESHOLD);
                    } catch (retryErr) {
                        flowWarn(`[Flow][Pipeline] diversity 재생성 실패 — 원본 유지: ${(retryErr as Error).message.substring(0, 100)}`);
                        break;
                    }
                }
                // Strict diversity only: force a fresh project as the last resort.
                // Flow가 같은 컨텍스트(프로젝트)에 deterministic한 것이지, 새 프로젝트면 다른 결과 가능.
                if ((probe.isDuplicate || probe.isSimilar) && FLOW_FORCE_FRESH_PROJECT_ON_DUPLICATE) {
                    try {
                        flowWarn(`[Flow][Pipeline] 🆕 ${FLOW_DUPLICATE_MAX_RETRIES}회 후 중복 — 새 프로젝트 강제 후 마지막 1회 시도`);
                        sendImageLog(`🆕 [Flow] "${slot.item.heading}" 새 프로젝트로 컨텍스트 리셋 후 재시도`);
                        const freshPage = await ensureFlowBrowserPage();
                        await ensureFlowProject(freshPage, true);  // force new project
                        const lastShot = await generateSingleImageWithFlow(applyDiversityHint(acceptedPrompt, FLOW_DUPLICATE_MAX_RETRIES + 1), (slot.item as any).aspectRatio || '1:1');
                        if (lastShot) {
                            const lastProbe = await probeDuplicate(lastShot.buffer, usedImageHashes, usedImageAHashes, FLOW_AHASH_THRESHOLD);
                            if (!lastProbe.isDuplicate && !lastProbe.isSimilar) {
                                downloaded = lastShot;
                                probe = lastProbe;
                                flowLog(`[Flow][Pipeline] ✅ 새 프로젝트 보루로 다양성 확보`);
                            } else {
                                flowWarn(`[Flow][Pipeline] ⚠️ 새 프로젝트 보루도 중복 — 그대로 사용`);
                            }
                        }
                    } catch (lastErr) {
                        flowWarn(`[Flow][Pipeline] 새 프로젝트 보루 실패: ${(lastErr as Error).message.substring(0, 100)}`);
                    }
                }
                if (probe.isDuplicate || probe.isSimilar) {
                    flowWarn(`[Flow][Pipeline] ⚠️ 모든 재시도 후에도 중복/유사 — 사용자에게 알림 + 폴백 허용`);
                    sendImageLog(`⚠️ [Flow] "${slot.item.heading}" 중복 이미지 모든 재시도 후 검출 — 그대로 사용 (필요 시 수동 교체)`);
                }
                commitHashes(probe, usedImageHashes, usedImageAHashes);
            }

            const ext = downloaded.mimeType === 'image/jpeg' ? 'jpg'
                : downloaded.mimeType === 'image/webp' ? 'webp'
                : 'png';
            // Spread result so blob fields (blobId, sha256, etc.) are forwarded to GeneratedImage.
            const writeResult = await writeImageFile(downloaded.buffer, ext, slot.item.heading, postTitle, postId);
            const image: GeneratedImage = {
                filePath: writeResult.filePath,
                heading: slot.item.heading,
                prompt: acceptedPrompt,
                mimeType: downloaded.mimeType,
                provider: 'flow-nano-banana-2',
                cost: 0,
                // ✅ [v2.10.289 FIX] originalIndex 보존 — headingImageMode 필터링(odd/even/thumbnail-only) 시 정확한 소제목 매칭. 누락 시 editorHelpers의 fallback이 발동해 이미지가 안 들어가야 할 소제목에 중복 배치되는 버그 차단.
                originalIndex: (slot.item as any).originalIndex,
                ...(writeResult.blobId ? {
                    blobId: writeResult.blobId,
                    width: writeResult.width,
                    height: writeResult.height,
                    byteSize: writeResult.byteSize,
                    sha256: writeResult.sha256,
                    createdAt: writeResult.createdAt,
                } : {}),
            } as any;
            results.push(image);
            detectedCount++;
            trackApiUsage('gemini', { images: 1, model: 'flow-nano-banana-2', costOverride: 0 });
            // ✅ [v2.10.298] 일별 성공 카운트 — HTTP 429/한도성 에러 발생 시 봇감지 vs 진짜 한도 구분
            incrementFlowDailySuccess();
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
    options?: { forceFreshContext?: boolean; sequential?: boolean },
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
    // 헤딩간 prompt 유사도 진단 — 상류 회귀(같은 prompt → 같은 이미지) 자동 감지
    diagnoseHeadingPromptSimilarity(items);
    flowLog(`[Flow] 📄 디버그 로그 파일: ${flowLogFilePath || '(초기화 실패)'}`);
    flowLog(`[Flow] 📋 요청 목록`, items.map((it, idx) => ({
        idx: idx + 1,
        heading: (it.heading || '').substring(0, 60),
        hasEnglishPrompt: !!it.englishPrompt,
        promptPreview: ((it.englishPrompt || '') as string).substring(0, 100),
        promptFull: ((it.englishPrompt || '') as string).substring(0, 500), // 헤딩간 유사도 진단용
        aspectRatio: (it as any).aspectRatio || '1:1',
    })));
    sendImageLog(`🎨 [Flow] Nano Banana 2로 ${items.length}개 이미지 생성 시작 (파이프라인)`);
    sendImageLog(`⏱️ [Flow] Google 웹앱 자동화라 1장당 60~180초 걸릴 수 있습니다. 중복 재생성은 기본 최대 ${FLOW_DUPLICATE_MAX_RETRIES}회입니다.`);
    sendImageLog(`📄 [Flow] 디버그 로그: ${flowLogFilePath || '초기화 실패'}`);

    // [v1.6.1] 파이프라인 시도 (queueDepth=2)
    // v2.7.9: 마라톤 모드(forceFreshContext)에서는 파이프라인 비활성 — 한도 도달
    // 시 sequential 폴백이 같은 페이지에서 누적 막힘으로 무한 타임아웃 발생.
    const PIPELINE_ENABLED = process.env.FLOW_SEQUENTIAL !== '1' && !options?.forceFreshContext && !options?.sequential;
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
    } else if (options?.sequential) {
        flowLog(`[Flow] 순차 생성 옵션 — 파이프라인 비활성, 1장씩 단일 경로`);
    } else if (options?.forceFreshContext) {
        flowLog(`[Flow] 🏁 마라톤 모드 — 파이프라인 비활성, sequential 단일 경로`);
    }

    // ✅ [SPEC-IMAGE-RECOVERY-001] 자동 복구 코디네이터
    const coordinator = getRecoveryCoordinator({
        toastNotifier: { notify: (m) => sendImageLog(m) },
    });

    // Sequential fallback (파이프라인 미완료분 또는 전체)
    for (let i = pipelineDoneCount; i < items.length; i++) {
        if (firstCriticalError) break;
        const item = items[i];

        // 헤딩 단위 자동 복구 카운터 — 재시도 진입 시 startHeading 호출 안 함
        if (!coordinator.isRetryingSameHeading(i)) {
            coordinator.startHeading({
                headingIndex: i,
                totalHeadings: items.length,
                heading: item.heading,
                postTitle: postTitle ?? '',
                engine: 'flow',
            });
        }

        try {
            sendImageLog(`🖼️ [Flow] [${i + 1}/${items.length}] "${item.heading}" 생성 중...`);
            const basePrompt = item.englishPrompt || PromptBuilder.build(item, {
                imageStyle: (item as any).imageStyle || 'realistic',
                category: (item as any).category || '',
            } as any);
            // 헤딩 인덱스 기반 강제 시점/구도 회전 + 헤딩 제목 명시 subject prepend
            // (LLM이 비슷한 헤딩에 비슷한 base prompt 만드는 상류 회귀 방어)
            let prompt = injectHeadingVariation(basePrompt, i, item.heading);
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
                let probe = await probeDuplicate(generated.buffer, usedImageHashes, usedImageAHashes, FLOW_AHASH_THRESHOLD);
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
                        probe = await probeDuplicate(generated.buffer, usedImageHashes, usedImageAHashes, FLOW_AHASH_THRESHOLD);
                    } catch (retryErr) {
                        flowWarn(`[Flow][Seq] diversity 재생성 실패 — 원본 유지: ${(retryErr as Error).message.substring(0, 100)}`);
                        break;
                    }
                }
                // Strict diversity only: force a fresh project as the last resort.
                if ((probe.isDuplicate || probe.isSimilar) && FLOW_FORCE_FRESH_PROJECT_ON_DUPLICATE) {
                    try {
                        flowWarn(`[Flow][Seq] 🆕 ${FLOW_DUPLICATE_MAX_RETRIES}회 후 중복 — 새 프로젝트 강제 후 마지막 1회 시도`);
                        sendImageLog(`🆕 [Flow] "${item.heading}" 새 프로젝트로 컨텍스트 리셋 후 재시도`);
                        const freshPage = await ensureFlowBrowserPage();
                        await ensureFlowProject(freshPage, true);
                        const lastShot = await generateSingleImageWithFlow(
                            applyDiversityHint(prompt, FLOW_DUPLICATE_MAX_RETRIES + 1),
                            aspectRatio,
                            undefined,
                            { forceNewProjectOnLimit: !!options?.forceFreshContext },
                        );
                        if (lastShot) {
                            const lastProbe = await probeDuplicate(lastShot.buffer, usedImageHashes, usedImageAHashes, FLOW_AHASH_THRESHOLD);
                            if (!lastProbe.isDuplicate && !lastProbe.isSimilar) {
                                generated = lastShot;
                                probe = lastProbe;
                                flowLog(`[Flow][Seq] ✅ 새 프로젝트 보루로 다양성 확보`);
                            } else {
                                flowWarn(`[Flow][Seq] ⚠️ 새 프로젝트 보루도 중복 — 그대로 사용`);
                            }
                        }
                    } catch (lastErr) {
                        flowWarn(`[Flow][Seq] 새 프로젝트 보루 실패: ${(lastErr as Error).message.substring(0, 100)}`);
                    }
                }
                if (probe.isDuplicate || probe.isSimilar) {
                    flowWarn(`[Flow][Seq] ⚠️ 모든 재시도 후에도 중복/유사 — 사용자에게 알림 + 폴백 허용`);
                    sendImageLog(`⚠️ [Flow] "${item.heading}" 중복 이미지 모든 재시도 후 검출 — 그대로 사용 (필요 시 수동 교체)`);
                }
                commitHashes(probe, usedImageHashes, usedImageAHashes);
            }

            const ext = generated.mimeType === 'image/jpeg' ? 'jpg'
                : generated.mimeType === 'image/webp' ? 'webp'
                : 'png';
            // Spread result so blob fields (blobId, sha256, etc.) are forwarded to GeneratedImage.
            const writeResult = await writeImageFile(generated.buffer, ext, item.heading, postTitle, postId);

            const image: GeneratedImage = {
                filePath: writeResult.filePath,
                heading: item.heading,
                prompt,
                mimeType: generated.mimeType,
                provider: 'flow-nano-banana-2',
                cost: 0,
                // ✅ [v2.10.289 FIX] originalIndex 보존 (sequential 경로)
                originalIndex: (item as any).originalIndex,
                ...(writeResult.blobId ? {
                    blobId: writeResult.blobId,
                    width: writeResult.width,
                    height: writeResult.height,
                    byteSize: writeResult.byteSize,
                    sha256: writeResult.sha256,
                    createdAt: writeResult.createdAt,
                } : {}),
            } as any;
            results.push(image);
            coordinator.markHeadingSucceeded(); // C8
            // ✅ [v2.10.299 FIX] sequential 경로 카운트 누락 — v2.10.298은 병렬/단일 경로에만 추가했음.
            //   누락 시 sequential 모드 사용자가 100장 생성해도 카운트 0 → 모든 429를 bot_detected로 오분류.
            trackApiUsage('gemini', { images: 1, model: 'flow-nano-banana-2', costOverride: 0 });
            incrementFlowDailySuccess();
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

            // Flow is a web UI engine. Give the project enough breathing room after
            // each successful image so long batches do not trip stale pending jobs.
            if (i < items.length - 1) {
                const stabilizeMs = getFlowSequentialImageStabilizeMs();
                if (stabilizeMs > 0) {
                    sendImageLog(`⏳ [Flow] 다음 이미지 전 안정화 대기 ${Math.ceil(stabilizeMs / 1000)}초`);
                    await new Promise(r => setTimeout(r, stabilizeMs));
                }
            }
        } catch (err) {
            const msg = (err as Error).message || '';
            // ✅ [SPEC-IMAGE-RECOVERY-001] 자동 복구 결정
            const errorCode = extractFlowErrorCode(err);
            const httpStatus = extractFlowHttpStatus(err);
            if (httpStatus === 503) coordinator.recordServer503(); // C4
            const decision = coordinator.decide({ errorMessage: msg, errorCode, httpStatus });

            if (decision.action === 'retry') {
                const backoffMs = coordinator.applyRetry(decision);
                if (backoffMs > 0) {
                    flowLog(`[Flow] 🔄 ${decision.tag} 백오프 ${backoffMs}ms — "${item.heading}"`);
                    await new Promise((r) => setTimeout(r, backoffMs));
                }
                coordinator.markRetryingHeading(i);
                i--;
                continue;
            }

            flowError(`[Flow] [${i + 1}/${items.length}] 실패: ${msg}`);
            sendImageLog(`❌ [Flow] [${i + 1}] 실패: ${msg.substring(0, 150)}`);

            if (decision.action === 'block') {
                await sendFlowBlockingModalRequest(decision);
                // C6: B1/B3/B4/B7 등 회복 불가능 모달은 즉시 배치 중단
                if (isFlowBlockFatal(decision)) {
                    flowError(`[Flow] ⛔ 회복 불가능 모달(${decision.modalCode}) — 배치 즉시 중단`);
                    coordinator.markBatchAborted();
                    firstCriticalError = err as Error;
                    break;
                }
            }

            if (decision.action === 'skip-heading') {
                coordinator.markHeadingSkipped(); // C8
            }

            if (msg.startsWith('FLOW_')) firstCriticalError = err as Error;
        }
    }

    flowLog(`[Flow] ${results.length > 0 ? '✅' : '❌'} 완료: ${results.length}/${items.length} 성공`);
    sendImageLog(`${results.length > 0 ? '✅' : '❌'} [Flow] 완료: ${results.length}/${items.length} 성공`);

    if (results.length === 0) {
        if (firstCriticalError) throw firstCriticalError;
        // ✅ [v2.10.298] 봇감지 의심 분류 — 오늘 Flow 성공 카운트로 진짜 한도와 구분
        //   기존 문제: 첫 시도 0건 성공인데도 "한도 확인하세요"만 표시 → 사용자가 1시간 기다림
        //   휴리스틱: 오늘 < 10장 = 한도 도달 불가능 → 봇감지 99%
        const todayCount = getDailySuccess('flow');
        const classification = classifyQuotaError('flow');
        if (classification === 'bot_detected' || classification === 'likely_bot') {
            const reason = classification === 'bot_detected'
                ? `오늘 ${todayCount}장만 생성 — 진짜 한도 불가능`
                : `오늘 ${todayCount}장 — 봇감지 가능성 큼`;
            sendImageLog(`⚠️ [Flow] 봇감지 의심! (${reason}) — 한도 아님. 다른 엔진(나노바나나 ₩54/장 / DeepInfra) 즉시 사용 권장`);
            throw new Error(
                `FLOW_BOT_DETECTED:⚠️ Google 봇감지 의심 (오늘 Flow 성공 ${todayCount}장). ` +
                `진짜 한도가 아닐 가능성 큼.\n\n` +
                `즉시 해결:\n` +
                `1. 다른 이미지 엔진으로 전환 (나노바나나 ₩54/장, DeepInfra $0.01/장)\n` +
                `2. 잠시 후(10~30분) 재시도 (1시간 기다리지 마세요)\n` +
                `3. 환경설정 → "Google 계정 변경"으로 다른 계정 사용`
            );
        }
        // ✅ [v2.10.303] "덕트테이프" 내부 코드명 → 공개 명칭 "gpt-image-2" 로 교체
        throw new Error(`FLOW_ALL_FAILED:Flow 이미지 생성이 모두 실패했습니다 (오늘 ${todayCount}장 성공 후 한도 도달 추정). 1) Google 로그인 상태 확인  2) Flow 쿼터 확인 (Pro 구독자는 더 많음)  3) 다른 이미지 엔진(나노바나나/gpt-image-2/DeepInfra) 선택`);
    }
    return results;
}

// ─── 연결 테스트 ────
export async function checkFlowLogin(): Promise<{ loggedIn: boolean; message: string; userInfo?: any }> {
    let ctx: BrowserContext | null = null;
    try {
        if (cachedPage && !cachedPage.isClosed()) {
            const cachedLoggedIn = await isLoggedInToFlow(cachedPage).catch(() => false);
            if (cachedLoggedIn) {
                const userInfo = await readFlowSessionUser(cachedPage);
                return {
                    loggedIn: true,
                    message: `Flow 로그인 세션 확인됨${userInfo?.email ? ` (${userInfo.email})` : ''}`,
                    userInfo,
                };
            }
        }

        if (cachedContext) {
            try { await cachedContext.close(); } catch { /* ignore */ }
            cachedContext = null;
            cachedPage = null;
            cachedProjectUrl = null;
            _networkListenerInstalled = false;
            _networkImageQueue = [];
        }

        const profileDir = getFlowProfileDir();
        ctx = await launchWithStealthFallback(profileDir, true);
        const page = ctx.pages()[0] || await ctx.newPage();
        await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
        await dismissCookieBanner(page);

        const loggedIn = await isLoggedInToFlow(page).catch(() => false);
        if (!loggedIn) {
            return {
                loggedIn: false,
                message: 'Flow 로그인이 필요합니다. [Flow 로그인] 버튼으로 Google 계정 로그인 후 다시 확인해주세요.',
            };
        }

        const userInfo = await readFlowSessionUser(page);
        return {
            loggedIn: true,
            message: `Flow 로그인 세션 확인됨${userInfo?.email ? ` (${userInfo.email})` : ''}`,
            userInfo,
        };
    } catch (err) {
        return { loggedIn: false, message: `Flow 로그인 확인 실패: ${(err as Error)?.message ?? err}` };
    } finally {
        try {
            if (ctx) await ctx.close();
        } catch { /* ignore */ }
    }
}

export async function flowLogin(): Promise<{ loggedIn: boolean; message: string; userInfo?: any }> {
    try {
        const page = await ensureFlowBrowserPage();
        const loggedIn = await isLoggedInToFlow(page).catch(() => false);
        if (!loggedIn) {
            return {
                loggedIn: false,
                message: 'Flow 로그인 창에서 Google 로그인을 완료한 뒤 다시 확인해주세요.',
            };
        }
        const userInfo = await readFlowSessionUser(page);
        return {
            loggedIn: true,
            message: `Flow 로그인 완료${userInfo?.email ? ` (${userInfo.email})` : ''}`,
            userInfo,
        };
    } catch (err) {
        const msg = (err as Error)?.message || String(err);
        if (msg.startsWith('FLOW_LOGIN_TIMEOUT')) {
            return { loggedIn: false, message: 'Flow 로그인 시간이 초과되었습니다. Google 2단계 인증까지 완료한 뒤 다시 시도해주세요.' };
        }
        return { loggedIn: false, message: `Flow 로그인 실패: ${msg}` };
    }
}

async function readFlowSessionUser(page: Page): Promise<any | null> {
    try {
        const session = await page.evaluate(async () => {
            try {
                const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
                return res.ok ? await res.json() : null;
            } catch { return null; }
        });
        return (session as any)?.user || null;
    } catch {
        return null;
    }
}

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
    // [v2.10.158] zombieRecovery untrack — 정상 close 시 lock 해제
    if (cachedContext) {
        try {
            const browser = cachedContext.browser();
            const pid = (browser as any)?.process?.()?.pid;
            if (pid) {
                const zr = require('../runtime/zombieRecovery.js');
                zr.untrackBrowserPid(pid);
            }
        } catch { /* ignore */ }
        try { await cachedContext.close(); } catch { /* ignore */ }
    }
    cachedContext = null;
    cachedPage = null;
}
