/**
 * ✅ [v1.4.88] Google Labs Flow 이미지 생성기 — UI 자동화 방식
 *
 * 아키텍처 (ImageFX와 동일 패턴 — DOM 자동화로 완전 재작성):
 *   1. AdsPower/Playwright 브라우저로 labs.google/fx/tools/flow 접속
 *   2. ImageFX와 동일한 Google OAuth 세션 재사용 (쿠키 공유)
 *   3. UI 자동화: 프롬프트 입력 → "만들기" 클릭 → 이미지 URL 획득 → 다운로드
 *
 * 왜 UI 자동화인가:
 *   - API 직접 호출은 recaptchaContext.token이 페이지 내부에서 동적 생성되어 외부 복제 불가
 *   - 실제 엔드포인트: POST /v1/projects/{projectId}/flowMedia:batchGenerateImages (tool=PINHOLE, imageModelName=NARWHAL)
 *   - UI 자동화는 Google이 구조를 바꿔도 셀렉터만 갱신하면 되어 훨씬 견고
 *
 * 모델: Nano Banana 2 (Flow 기본, 내부명 NARWHAL)
 * 비용: $0 (AI Pro 쿼터 내)
 */

import type { ImageRequestItem, GeneratedImage } from './types.js';
import { writeImageFile } from './imageUtils.js';
import { PromptBuilder } from './promptBuilder.js';
import { trackApiUsage } from '../apiUsageTracker.js';
import type { Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// ─── 파일 로거 ─────────────────────────────────────────────
//   ✅ [v1.4.94] 모든 Flow 디버그 로그를 C:\Users\박성현\Desktop\새 폴더\ 에 자동 저장
//     앱 실행마다 새 파일 생성 (flow-debug-YYYYMMDD-HHMMSS.log)
//     사용자가 빠르게 공유 가능하도록 한 곳에 집중
const FLOW_LOG_DIR = 'C:\\Users\\박성현\\Desktop\\새 폴더';
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
        // 권한 실패 시 Desktop 루트로 폴백
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

// ─── 내부 디버그 로그 (콘솔 + 파일만, IPC 제외) ──────────────────
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
let cachedBrowser: Browser | null = null;
let cachedContext: BrowserContext | null = null;
let cachedPage: Page | null = null;
let cachedProjectUrl: string | null = null;
let _enabled: boolean = false;

// ─── Flow 전용 세션 디렉터리 (독립 Playwright persistent context) ────
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
//   ✅ [v1.4.93] ImageFX의 launchWithSystemBrowserFallback 패턴 이식
//     Google bot 감지 회피: 시스템 Chrome > Edge > Playwright 번들 순
const STEALTH_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
];
const STEALTH_IGNORE_DEFAULT_ARGS = ['--enable-automation'];

async function launchWithStealthFallback(profileDir: string, visible: boolean): Promise<BrowserContext> {
    const { chromium } = await import('playwright');
    const commonOptions: any = {
        headless: !visible,
        viewport: { width: 1280, height: 800 },
        args: [...STEALTH_ARGS, ...(visible ? [] : ['--window-position=-10000,-10000'])],
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

            // navigator.webdriver 제거 스크립트 주입
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

// ─── Flow 전용 Playwright 브라우저 ───────────────────────────
//   ✅ [v1.4.93] visible→headless 재시작 제거 (SingletonLock 경합 원인)
//     visible 유지 + off-screen 이동으로 화면 보이지 않게 처리
async function ensureFlowBrowserPage(): Promise<Page> {
    // 캐시된 페이지 재사용 (닫혀있지 않으면)
    if (cachedPage && cachedContext) {
        try {
            if (!cachedPage.isClosed()) return cachedPage;
        } catch { /* stale reference, 재생성 */ }
    }

    const profileDir = getFlowProfileDir();
    flowLog(`[Flow] 📁 프로필 디렉터리: ${profileDir}`);

    // 1단계: off-screen visible로 접속 → 세션 존재 여부 확인
    //   headless가 아닌 이유: Google은 headless Chromium을 감지해 Flow UI를 제한/차단
    //   off-screen 이동(-10000,-10000)으로 UI상 안 보이게 처리
    sendImageLog('🌐 [Flow] 세션 확인 중...');
    const ctx = await launchWithStealthFallback(profileDir, false);
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    const loggedIn = await isLoggedInToFlow(page);
    if (loggedIn) {
        flowLog('[Flow] ✅ 기존 로그인 세션 확인됨 (off-screen 창 유지)');
        sendImageLog('✅ [Flow] 로그인 세션 확인 — 이미지 생성 준비됨');
        cachedContext = ctx;
        cachedPage = page;
        return page;
    }

    // 2단계: 로그인 필요 → visible로 창 이동 (사용자가 로그인할 수 있게)
    flowLog('[Flow] ⚠️ 로그인 필요 — 창을 화면 중앙으로 이동');
    sendImageLog('⚠️ [Flow] Google 로그인 필요 — 브라우저 창이 화면에 표시됩니다.');
    // off-screen이었던 창을 화면 중앙(100,100)으로 이동 — persistent context는 새로 만들지 않음
    await page.evaluate(() => {
        try { (window as any).moveTo?.(100, 100); } catch { /* ignore */ }
    }).catch(() => {});
    await (ctx as any).newPage?.().catch(() => {}); // 새 탭으로 로그인 창 표시 강제
    try {
        // Playwright에서 창 위치 이동은 chromium에서 제한적. 페이지 bring-to-front로 대체
        await page.bringToFront();
    } catch { /* ignore */ }

    const loginTimeoutMs = 5 * 60 * 1000;
    const start = Date.now();
    let loginSuccess = false;
    sendImageLog('🔐 [Flow] 브라우저에서 Google 로그인을 완료해주세요. (최대 5분 대기)');
    while (Date.now() - start < loginTimeoutMs) {
        await new Promise(r => setTimeout(r, 5000));
        const ok = await isLoggedInToFlow(page).catch(() => false);
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
        await ctx.close().catch(() => {});
        throw new Error('FLOW_LOGIN_TIMEOUT:Google 로그인 시간 초과 (5분). 브라우저에서 로그인 후 다시 시도해주세요.');
    }

    flowLog('[Flow] ✅ 로그인 완료 — 같은 컨텍스트 재사용 (재시작 없음)');
    sendImageLog('✅ [Flow] 로그인 완료! 이미지 생성 준비됨');
    cachedContext = ctx;
    cachedPage = page;
    return page;
}

// ─── Flow 로그인 상태 체크 (labs.google 세션 API 활용) ────────────
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

// ─── 디버그 스크린샷 저장 ───────────────────────────────────
//   ✅ [v1.4.94] 스크린샷도 로그 파일과 같은 폴더(FLOW_LOG_DIR)에 저장 → 사용자 공유 편의
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

// ─── Flow 프로젝트 확보 ───────────────────────────────────
async function ensureFlowProject(page: Page): Promise<void> {
    const currentUrl = page.url();
    flowLog(`[Flow][1/3] 프로젝트 확보 시작 — 현재 URL: ${currentUrl}`);
    sendImageLog(`🔍 [Flow] 현재 URL: ${currentUrl.substring(0, 80)}`);

    // 이미 프로젝트 페이지이면 그대로 사용
    if (currentUrl.includes('/tools/flow/project/')) {
        cachedProjectUrl = currentUrl;
        flowLog('[Flow][1/3] ✅ 이미 프로젝트 페이지 — 재사용');
        return;
    }

    // 캐시된 프로젝트 URL이 있으면 그쪽으로 이동
    if (cachedProjectUrl) {
        flowLog(`[Flow][1/3] 🔗 캐시된 프로젝트 이동 시도: ${cachedProjectUrl}`);
        sendImageLog(`🔗 [Flow] 캐시 프로젝트 재사용 시도`);
        await page.goto(cachedProjectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(1500);
        if (page.url().includes('/tools/flow/project/')) {
            flowLog('[Flow][1/3] ✅ 캐시 프로젝트 도착');
            return;
        }
        flowLog('[Flow][1/3] ⚠️ 캐시 프로젝트 도착 실패 — 새 프로젝트 생성으로 전환');
    }

    // 새 프로젝트 생성
    flowLog('[Flow][1/3] 🆕 /tools/flow 접속 중...');
    sendImageLog('🆕 [Flow] 프로젝트 목록 페이지 접속 중...');
    await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    flowLog(`[Flow][1/3] 접속 완료 — URL: ${page.url()}`);

    // "새 프로젝트" 버튼 찾기 — 여러 셀렉터 시도
    flowLog('[Flow][1/3] "새 프로젝트" 버튼 탐색 중...');
    sendImageLog('🔍 [Flow] "새 프로젝트" 버튼 탐색');
    const newProjectBtn = page.locator('button').filter({ hasText: /새 프로젝트|New project|New Project|新しいプロジェクト|add_2/ }).first();

    try {
        await newProjectBtn.waitFor({ state: 'visible', timeout: 30000 });
        flowLog('[Flow][1/3] ✅ "새 프로젝트" 버튼 발견');
    } catch (err) {
        await saveDebugScreenshot(page, 'no-new-project-btn');
        const allButtons = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button')).slice(0, 20).map(b => (b.textContent || '').trim().substring(0, 50));
        }).catch(() => []);
        flowError(`[Flow][1/3] ❌ "새 프로젝트" 버튼 못 찾음. DOM 버튼 상위 20개 ↓`, allButtons);
        sendImageLog(`❌ [Flow] "새 프로젝트" 버튼 미발견. 버튼 목록: ${allButtons.slice(0, 5).join(' | ')}`);
        throw new Error(`FLOW_NEW_PROJECT_BUTTON_NOT_FOUND:labs.google/fx/tools/flow에서 "새 프로젝트" 버튼을 30초 내 찾지 못함. 페이지 구조 변경 또는 계정 권한 문제. 스크린샷 저장됨.`);
    }

    await newProjectBtn.click();
    flowLog('[Flow][1/3] "새 프로젝트" 클릭됨 — URL 리다이렉트 대기');

    // 프로젝트 URL로 리다이렉트 대기
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

// ─── 프롬프트 입력 + 생성 클릭 + 이미지 URL 추출 ────────────────
async function typePromptAndSubmit(page: Page, prompt: string): Promise<void> {
    flowLog(`[Flow][2/3] 프롬프트 입력 시작 (길이: ${prompt.length})`);
    sendImageLog(`✏️ [Flow] 프롬프트 입력 시작`);

    // 기존 프롬프트 지우기 (close 버튼 존재 시)
    try {
        const clearBtn = page.locator('button').filter({ hasText: /프롬프트 지우기|Clear prompt/ }).first();
        if (await clearBtn.count() > 0 && await clearBtn.isVisible().catch(() => false)) {
            await clearBtn.click();
            await page.waitForTimeout(300);
            flowLog('[Flow][2/3] 기존 프롬프트 지움');
        }
    } catch { /* 지울 게 없음 */ }

    // 프롬프트 입력창 (role=textbox, contenteditable) 찾기
    flowLog('[Flow][2/3] 프롬프트 입력창 탐색 중...');
    const promptInput = page.locator('[role="textbox"][contenteditable="true"], div[contenteditable="true"]').first();
    try {
        await promptInput.waitFor({ state: 'visible', timeout: 15000 });
    } catch (err) {
        await saveDebugScreenshot(page, 'no-prompt-input');
        throw new Error('FLOW_PROMPT_INPUT_NOT_FOUND:프롬프트 입력창(contenteditable)을 15초 내 찾지 못함. 스크린샷 저장됨.');
    }
    flowLog('[Flow][2/3] ✅ 입력창 발견 — 프롬프트 입력');
    await promptInput.click();
    // ✅ [v1.4.93] fill() → pressSequentially() — React/Angular contenteditable 이벤트 확실히 발화
    await promptInput.pressSequentially(prompt, { delay: 10 });
    await page.waitForTimeout(500);

    // 입력 검증 — 실제 값이 반영됐는지 확인
    const inputActual = await promptInput.textContent().catch(() => '');
    if (!inputActual || inputActual.trim().length < 5) {
        await saveDebugScreenshot(page, 'prompt-empty');
        throw new Error(`FLOW_PROMPT_NOT_ENTERED:프롬프트 입력 실패 (실제 값: "${(inputActual || '').substring(0, 30)}"). React 이벤트 미발화 추정.`);
    }
    flowLog(`[Flow][2/3] ✅ 입력 확인 (실제 값 ${inputActual.length}자)`);

    // 만들기(arrow_forward) 버튼
    flowLog('[Flow][2/3] 전송 버튼(arrow_forward) 탐색 중...');
    const submitBtn = page.locator('button').filter({ hasText: /arrow_forward/ }).first();
    try {
        await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
    } catch (err) {
        await saveDebugScreenshot(page, 'no-submit-btn');
        throw new Error('FLOW_SUBMIT_BUTTON_NOT_FOUND:전송 버튼(arrow_forward)을 10초 내 찾지 못함. 스크린샷 저장됨.');
    }
    await submitBtn.click();
    flowLog('[Flow][2/3] ✅ 전송 버튼 클릭됨');
    sendImageLog('🚀 [Flow] 전송 완료 — 이미지 생성 대기');
}

// ─── 새 이미지 대기 ────────────────────────────────────────
//   ✅ [v1.4.93] 견고한 이미지 감지 — alt/aria-label/URL 패턴 모두 지원
async function waitForNewImage(page: Page, prevCount: number, timeoutMs: number = 180000): Promise<string> {
    const start = Date.now();
    let lastLoggedSec = 0;
    flowLog(`[Flow][3/3] 이미지 생성 대기 시작 (기존 ${prevCount}장, 타임아웃 ${timeoutMs / 1000}초)`);

    while (Date.now() - start < timeoutMs) {
        const detected = await page.evaluate(() => {
            // Flow가 생성한 이미지 후보 — 3가지 판별 조건 OR
            const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
            const matches = imgs.filter(img => {
                const alt = img.alt || '';
                const src = img.src || '';
                const aria = img.getAttribute('aria-label') || '';
                // 조건 1: alt가 명시적으로 생성 이미지 표기
                if (/생성된 이미지|Generated image|Generated|생성/i.test(alt + aria)) return true;
                // 조건 2: Flow 미디어 URL 패턴 (media.getMediaUrlRedirect / lh3.googleusercontent 제외는 프로필)
                if (/media\.getMediaUrlRedirect|flowMedia|flow-media/i.test(src)) return true;
                // 조건 3: 큰 이미지(naturalWidth>=512) + 프로필(=s96-c) 아님
                if (img.naturalWidth >= 512 && !/=s\d+-c$/.test(src) && src.startsWith('http')) return true;
                return false;
            });
            return matches.map(img => ({
                src: img.src,
                alt: img.alt,
                aria: img.getAttribute('aria-label') || '',
                w: img.naturalWidth,
                h: img.naturalHeight,
            }));
        });

        if (detected.length > prevCount) {
            flowLog(`[Flow][3/3] ✅ 새 이미지 감지! 총 ${detected.length}장 (이전 ${prevCount}장) — alt="${detected[0].alt}" (${detected[0].w}x${detected[0].h})`);
            return detected[0].src;
        }

        const elapsedSec = Math.round((Date.now() - start) / 1000);
        if (elapsedSec - lastLoggedSec >= 15) {
            flowLog(`[Flow][3/3] ⏳ 대기 중 ${elapsedSec}초 경과 (현재 매칭 ${detected.length}장)`);
            sendImageLog(`⏳ [Flow] 이미지 생성 중... ${elapsedSec}초 경과 (매칭 ${detected.length}/${prevCount + 1})`);
            lastLoggedSec = elapsedSec;
        }
        await page.waitForTimeout(2000);
    }

    // 타임아웃 — 디버깅 정보 덤프
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
    sendImageLog(`❌ [Flow] 이미지 감지 타임아웃 — DOM img ${allImgsDump.length}개 덤프 (콘솔 확인)`);
    throw new Error(`FLOW_IMAGE_TIMEOUT:이미지 ${timeoutMs / 1000}초 초과. 스크린샷+img 목록 저장됨. 셀렉터 불일치 가능성 높음.`);
}

async function countExistingImages(page: Page): Promise<number> {
    return await page.evaluate(() => {
        return document.querySelectorAll('img[alt="생성된 이미지"], img[alt="Generated image"]').length;
    });
}

// ─── 이미지 URL → Buffer 다운로드 ────────────────────────────
async function downloadImageAsBuffer(page: Page, imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const base64 = await page.evaluate(async (url: string) => {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP_${res.status}`);
        const blob = await res.blob();
        return await new Promise<{ b64: string; type: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                const comma = result.indexOf(',');
                resolve({ b64: comma >= 0 ? result.substring(comma + 1) : '', type: blob.type || 'image/png' });
            };
            reader.onerror = () => reject(new Error('blob read error'));
            reader.readAsDataURL(blob);
        });
    }, imageUrl);

    const buffer = Buffer.from(base64.b64, 'base64');
    if (buffer.length < 1024) {
        throw new Error(`FLOW_IMAGE_DOWNLOAD_TINY:다운로드된 이미지가 비정상적으로 작음 (${buffer.length} bytes)`);
    }
    return { buffer, mimeType: base64.type || 'image/png' };
}

// ─── 단일 이미지 생성 (UI 자동화) ─────────────────────────────
export async function generateSingleImageWithFlow(
    prompt: string,
    _aspectRatio: string = '1:1',
    signal?: AbortSignal,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const MAX_RETRIES = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (signal?.aborted) {
            flowLog('[Flow] ⏹️ 중지 요청됨');
            return null;
        }

        try {
            const page = await ensureFlowBrowserPage();
            await ensureFlowProject(page);

            const prevCount = await countExistingImages(page);
            flowLog(`[Flow] 🖼️ 이미지 생성 시도 ${attempt}/${MAX_RETRIES} (기존 ${prevCount}장)`);
            sendImageLog(`🖼️ [Flow] 프롬프트 전송 중... (시도 ${attempt}/${MAX_RETRIES})`);

            await typePromptAndSubmit(page, prompt);

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

// ─── 일괄 생성 (기존 시그니처 유지) ──────────────────────────
export async function generateWithFlow(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,
): Promise<GeneratedImage[]> {
    // 파일 로그 초기화 + 경로 알림 (디버깅 시 공유 편의)
    initFlowLogFile();
    flowLog(`════════════════════════════════════════════`);
    flowLog(`[Flow] 🎨 총 ${items.length}개 이미지 생성 시작 (UI 자동화)`);
    flowLog(`[Flow] 📄 디버그 로그 파일: ${flowLogFilePath || '(초기화 실패)'}`);
    flowLog(`[Flow] 📋 요청 목록`, items.map((it, idx) => ({
        idx: idx + 1,
        heading: (it.heading || '').substring(0, 60),
        hasEnglishPrompt: !!it.englishPrompt,
        promptPreview: ((it.englishPrompt || '') as string).substring(0, 100),
        aspectRatio: (it as any).aspectRatio || '1:1',
    })));
    sendImageLog(`🎨 [Flow] Nano Banana 2로 ${items.length}개 이미지 생성 시작`);
    sendImageLog(`📄 [Flow] 디버그 로그: ${flowLogFilePath || '초기화 실패'}`);

    const results: GeneratedImage[] = [];
    let firstCriticalError: Error | null = null;

    for (let i = 0; i < items.length; i++) {
        if (firstCriticalError) break;
        const item = items[i];

        try {
            sendImageLog(`🖼️ [Flow] [${i + 1}/${items.length}] "${item.heading}" 생성 중...`);
            const prompt = item.englishPrompt || PromptBuilder.build(item, {
                imageStyle: (item as any).imageStyle || 'realistic',
                category: (item as any).category || '',
            } as any);
            const aspectRatio = (item as any).aspectRatio || '1:1';

            const generated = await generateSingleImageWithFlow(prompt, aspectRatio);
            if (!generated) {
                flowWarn(`[Flow] [${i + 1}] null 반환 (중지 감지) — 나머지 건너뜀`);
                break;
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
            if (onImageGenerated) onImageGenerated(image, i + 1, items.length);
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

// ─── 연결 테스트 (UI "테스트" 버튼용) ──────────────────────────
//   ✅ [v1.4.91] 로그인 안 돼있으면 visible 브라우저 창 띄워 로그인 유도
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

// ─── 중지/정리 ──────────────────────────────────────────
export async function resetFlowState(): Promise<void> {
    cachedProjectUrl = null;
    try { if (cachedContext) await cachedContext.close(); } catch { /* ignore */ }
    cachedContext = null;
    cachedPage = null;
    cachedBrowser = null;
}
