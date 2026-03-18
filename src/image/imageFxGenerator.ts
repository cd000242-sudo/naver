/**
 * ✅ [2026-03-15] ImageFX 이미지 생성기 v2.0
 * 
 * AdsPower Playwright 브라우저 내부에서 직접 Google ImageFX API를 호출합니다.
 * - 기존 @rohitaryal/imagefx-api 패키지는 Node.js fetch 방식이라 Google 401 거부
 * - 해결: AdsPower 브라우저 → page.evaluate() → API 직접 호출
 * - 첫 사용 시 Google 로그인 1회 필요 (이후 AdsPower 프로필에 세션 영구 저장)
 * - 브라우저/페이지/토큰 캐싱으로 성능 최적화
 *
 * 흐름: AdsPower 브라우저 열기 → labs.google/fx 접속 → 세션 토큰 획득
 *       → aisandbox-pa.googleapis.com API로 이미지 생성 → base64 → Buffer
 */

import type { ImageRequestItem, GeneratedImage } from './types.js';
import { writeImageFile } from './imageUtils.js';
import { PromptBuilder } from './promptBuilder.js';
// ✅ [2026-03-17] ImageFX는 Google 서비스라 프록시 불필요 → import 제거
import type { Browser, Page, BrowserContext } from 'playwright';

// ✅ 실시간 로그 → 렌더러 UI 전송
function sendImageLog(message: string): void {
  try {
    const { BrowserWindow } = require('electron');
    const wins = BrowserWindow.getAllWindows();
    if (wins[0]) {
      wins[0].webContents.send('image-generation:log', message);
    }
  } catch { /* 렌더러 초기화 전이면 무시 */ }
  console.log(message);
}

// ===== 캐시 (세션 동안 재사용) =====
let cachedBrowser: Browser | null = null;
let cachedPage: Page | null = null;
let cachedToken: string | null = null;
let cachedTokenExpiry: Date | null = null;
let cachedUserId: string | null = null; // AdsPower 프로필 userId
let browserMode: 'adspower' | 'playwright' | null = null; // 어떤 모드로 연결했는지
let _adsPowerUserEnabled: boolean = false; // ✅ [2026-03-16] 사용자 AdsPower 활성화 설정

/** ✅ [2026-03-16] AdsPower 사용 여부 설정 (렌더러에서 IPC로 호출) */
export function setImageFxAdsPowerEnabled(enabled: boolean): void {
  _adsPowerUserEnabled = enabled;
  console.log(`[ImageFX] 🌐 AdsPower ${enabled ? '✅ 활성' : '❌ 비활성'} (사용자 설정)`);
}

/** ✅ [2026-03-16] AdsPower 활성화 상태 조회 */
export function isImageFxAdsPowerEnabled(): boolean {
  return _adsPowerUserEnabled;
}

// ✅ 비율 매핑 (기존 시스템 → ImageFX)
const ASPECT_RATIO_MAP: Record<string, string> = {
  '1:1': 'IMAGE_ASPECT_RATIO_SQUARE',
  'square': 'IMAGE_ASPECT_RATIO_SQUARE',
  '9:16': 'IMAGE_ASPECT_RATIO_PORTRAIT',
  'portrait': 'IMAGE_ASPECT_RATIO_PORTRAIT',
  '16:9': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
  'landscape': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
  '4:3': 'IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE',
};

/**
 * ✅ [2026-03-18] 100점 프롬프트 위생 처리 — AI 응답 오염 완전 차단
 * 
 * 문제: AI 모델(특히 Perplexity Sonar)이 자기 소개, 시스템 프롬프트, 마크다운 서식을
 * 응답에 포함하면 Imagen 3.5가 이를 이미지 내 텍스트로 렌더링함.
 * 
 * 해결: ImageFX API 호출 직전에 프롬프트를 정제하여:
 * 1. AI 자기 소개 제거 ("I'm Perplexity", "As an AI" 등)
 * 2. 시스템 프롬프트 누출 제거 ("You are an expert", "CRITICAL RULES" 등)
 * 3. 마크다운/서식 제거 (```, **, #, - 등)
 * 4. 따옴표 래핑 제거
 * 5. "NO TEXT" 류 negative instruction 제거 (Imagen 3.5가 오히려 텍스트를 그림)
 * 6. 200자 초과 시 트렁케이션 (이미지 프롬프트는 간결해야 효과적)
 */
function sanitizeImagePrompt(prompt: string): string {
  let cleaned = prompt;

  // ── 1. AI 자기 소개 / 역할 선언 제거 ──
  cleaned = cleaned
    .replace(/(?:^|\n)(?:I'm|I am|As an? )\s*(?:Perplexity|AI|assistant|language model|chatbot)[^.\n]*[.!]?/gi, '')
    .replace(/(?:^|\n)(?:Sure|Certainly|Of course|Here(?:'s| is))[^.\n]*[.:!]?\s*/gi, '')
    .replace(/(?:^|\n)(?:Here is|Below is|The following is)[^.\n]*[.:!]?\s*/gi, '');

  // ── 2. 시스템 프롬프트 누출 제거 ──
  cleaned = cleaned
    .replace(/(?:^|\n)(?:You are an expert|TASK:|HEADING:|STYLE:|CRITICAL RULES:|STYLE-SPECIFIC|CONTEXT \(use this)[^\n]*/gi, '')
    .replace(/(?:^|\n)(?:IMPORTANT:|Output ONLY|Keep under \d+ words|End with:)[^\n]*/gi, '')
    .replace(/(?:^|\n)\d+\.\s*(?:TRANSLATE|Korean compound|DECIDE whether|DO NOT include|Focus on|If CONTEXT)[^\n]*/gi, '');

  // ── 3. 마크다운 서식 제거 ──
  cleaned = cleaned
    .replace(/```[\s\S]*?```/g, '')    // 코드 블록
    .replace(/`([^`]+)`/g, '$1')       // 인라인 코드
    .replace(/\*\*([^*]+)\*\*/g, '$1') // 볼드
    .replace(/\*([^*]+)\*/g, '$1')     // 이탤릭
    .replace(/^#+\s*/gm, '')           // 헤딩
    .replace(/^[-*]\s+/gm, '')         // 리스트
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // 링크

  // ── 4. 따옴표 래핑 제거 ──
  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '');

  // ── 5. "NO TEXT" 류 negative instruction 제거 ──
  // ⚠️ 핵심: Imagen 3.5는 "NO TEXT"를 보면 오히려 "NO TEXT"라는 글자를 그림!
  cleaned = cleaned
    .replace(/,?\s*NO\s+TEXT[^,.]*/gi, '')
    .replace(/,?\s*NO\s+WRITING[^,.]*/gi, '')
    .replace(/,?\s*NO\s+LETTERS[^,.]*/gi, '')
    .replace(/,?\s*NO\s+WATERMARK[^,.]*/gi, '')
    .replace(/,?\s*NO\s+TYPOGRAPHY[^,.]*/gi, '')
    .replace(/,?\s*NO\s+WORDS[^,.]*/gi, '')
    .replace(/,?\s*NO\s+CAPTIONS?[^,.]*/gi, '')
    .replace(/,?\s*NO\s+LABELS?[^,.]*/gi, '')
    .replace(/IMPORTANT:\s*Do NOT include any text[^.]*/gi, '')
    .replace(/The image must be purely visual[^.]*/gi, '')
    .replace(/absolutely zero written content[^.]*/gi, '');

  // ── 6. 정리: 다중 공백/줄바꿈/콤마 정리 ──
  cleaned = cleaned
    .replace(/,\s*,/g, ',')           // 연속 콤마
    .replace(/\n{2,}/g, '\n')         // 다중 줄바꿈
    .replace(/\s{2,}/g, ' ')          // 다중 공백
    .replace(/^[,\s]+|[,\s]+$/g, '')  // 앞뒤 콤마/공백
    .trim();

  // ── 7. 200자 초과 시 트렁케이션 (마지막 완전한 구절에서 자름) ──
  if (cleaned.length > 200) {
    const truncated = cleaned.substring(0, 200);
    const lastComma = truncated.lastIndexOf(',');
    const lastSpace = truncated.lastIndexOf(' ');
    const cutAt = lastComma > 150 ? lastComma : (lastSpace > 150 ? lastSpace : 200);
    cleaned = truncated.substring(0, cutAt).trim();
  }

  // ── 8. 빈 프롬프트 방지 ──
  if (!cleaned || cleaned.length < 10) {
    console.warn(`[ImageFX] ⚠️ 정제 후 프롬프트 너무 짧음, 원본 사용: "${prompt.substring(0, 60)}"`);
    // 원본에서 최소한의 정제만 적용
    cleaned = prompt
      .replace(/,?\s*NO\s+TEXT[^,.]*/gi, '')
      .replace(/,?\s*NO\s+WRITING[^,.]*/gi, '')
      .replace(/IMPORTANT:\s*Do NOT include any text[^.]*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .substring(0, 200);
  }

  console.log(`[ImageFX] 🧹 프롬프트 정제: "${prompt.substring(0, 50)}..." → "${cleaned.substring(0, 50)}..." (${prompt.length}→${cleaned.length}자)`);
  return cleaned;
}

/**
 * ✅ 프롬프트 안전 필터 순화 — 차단된 프롬프트에서 민감 단어 제거
 */
function sanitizePromptForSafety(prompt: string): string {
  let cleaned = prompt
    .replace(/\b(blood|wound|injury|kill|dead|death|weapon|gun|knife|sword|fight|violence|violent|attack|war|battle|explosion|fire|burn)\b/gi, '')
    .replace(/\b(sexy|nude|naked|bikini|lingerie|erotic|seductive)\b/gi, '')
    .replace(/\b(drug|alcohol|beer|wine|cigarette|smoke|smoking|drunk)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  cleaned += '\n\nThis image should be safe for all audiences, family-friendly, and suitable for general public viewing.';
  return cleaned;
}

/**
 * ✅ Playwright 영구 프로필 경로 가져오기
 */
function getPlaywrightProfileDir(): string {
  try {
    const { app } = require('electron');
    const path = require('path');
    return path.join(app.getPath('userData'), 'imagefx-chrome-profile');
  } catch {
    const path = require('path');
    const os = require('os');
    return path.join(os.homedir(), 'naver-blog-automation', 'imagefx-chrome-profile');
  }
}

/**
 * ✅ [2026-03-16] Playwright Chromium 자동 설치
 * executablePath가 없거나 실행 불가능하면 자동으로 npx playwright install chromium 실행
 * ⚠️ headless_shell만 설치된 경우도 감지하여 전체 chromium을 설치
 */
async function ensurePlaywrightBrowserInstalled(): Promise<void> {
  try {
    const { chromium } = await import('playwright');
    const execPath = chromium.executablePath();
    const fs = require('fs');
    if (execPath && fs.existsSync(execPath)) {
      // ✅ 파일 존재 + 최소 크기(1MB) 확인 → 정상 설치로 판단
      const stat = fs.statSync(execPath);
      if (stat.size > 1_000_000) {
        return; // 이미 정상 설치됨
      }
      console.warn(`[ImageFX] ⚠️ Chromium 실행 파일 크기 이상 (${stat.size}B) → 재설치 필요`);
    }
  } catch { /* executablePath 호출 실패 = 설치 안 됨 */ }

  console.log('[ImageFX] 📦 Playwright Chromium 브라우저 자동 설치 시작...');
  sendImageLog('📦 [ImageFX] Chromium 브라우저를 자동 설치합니다. 잠시만 기다려주세요 (1~2분)...');

  // ✅ [2026-03-16] 패키징된 Electron 앱에서도 동작하는 설치 방법
  // npx는 패키징 후 사용 불가 → playwright 내부 cli.js를 직접 호출
  try {
    const { execSync } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    // 방법 1: playwright-core/cli.js 직접 경로 구성
    // require.resolve('playwright-core/cli')는 ERR_PACKAGE_PATH_NOT_EXPORTED 발생
    // → package.json 경로로 디렉토리를 찾아 cli.js 경로를 직접 구성
    let installed = false;
    try {
      const pkgPath = require.resolve('playwright-core/package.json');
      const cliPath = path.join(path.dirname(pkgPath), 'cli.js');
      if (fs.existsSync(cliPath)) {
        execSync(`node "${cliPath}" install chromium`, {
          stdio: 'pipe',
          timeout: 300000,
          env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
        });
        console.log('[ImageFX] ✅ Playwright Chromium 설치 완료! (playwright-core/cli.js)');
        sendImageLog('✅ [ImageFX] Chromium 브라우저 설치 완료!');
        installed = true;
      }
    } catch (cliErr: any) {
      console.warn(`[ImageFX] playwright-core/cli.js 실패: ${(cliErr.message || '').substring(0, 80)}, 대안 시도...`);
    }

    // 방법 2: playwright/cli.js 직접 경로 구성
    if (!installed) {
      try {
        const pkgPath = require.resolve('playwright/package.json');
        const cliPath = path.join(path.dirname(pkgPath), 'cli.js');
        if (fs.existsSync(cliPath)) {
          execSync(`node "${cliPath}" install chromium`, {
            stdio: 'pipe',
            timeout: 300000,
            env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
          });
          console.log('[ImageFX] ✅ Playwright Chromium 설치 완료! (playwright/cli.js)');
          sendImageLog('✅ [ImageFX] Chromium 브라우저 설치 완료!');
          installed = true;
        }
      } catch (altErr: any) {
        console.warn(`[ImageFX] playwright/cli.js 실패: ${(altErr.message || '').substring(0, 80)}`);
      }
    }

    // 방법 3: npx 시도 (개발 환경 폴백)
    if (!installed) {
      execSync('npx playwright install chromium', {
        stdio: 'pipe',
        timeout: 300000,
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
      });
      console.log('[ImageFX] ✅ Playwright Chromium 설치 완료! (npx)');
      sendImageLog('✅ [ImageFX] Chromium 브라우저 설치 완료!');
    }
  } catch (installErr: any) {
    console.error(`[ImageFX] ❌ Chromium 설치 실패: ${installErr.message}`);
    sendImageLog(`❌ [ImageFX] Chromium 자동 설치 실패. 프로그램 폴더에서 터미널을 열고 'npx playwright install chromium'을 실행해주세요.`);
    throw new Error(`Playwright Chromium 자동 설치 실패: ${installErr.message}. 터미널에서 'npx playwright install chromium' 명령어를 직접 실행해주세요.`);
  }
}

/**
 * ✅ AdsPower API HTTP GET 헬퍼
 * adsPowerManager.ts와 동일하게 fetch 기반 사용 (http.get는 DNS/연결 문제 발생 가능)
 */
async function adsPowerGet(urlPath: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

  try {
    const res = await fetch(`http://local.adspower.com:50325${urlPath}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`AdsPower API HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('AdsPower API 타임아웃 (5초)');
    }
    throw err; // ECONNREFUSED 등 원본 에러 전파
  }
}

/**
 * ✅ [모드 1] AdsPower 브라우저로 연결
 * 
 * Playwright 모드와 동일한 패턴:
 * ● 기본: headless (숨김) — 화면에 브라우저 안 뜸
 * ● 첫 사용: Google 로그인 필요 시만 visible로 자동 전환
 * ● 로그인 후: 세션이 AdsPower 프로필에 영구 저장 → 다음부터 headless 유지
 */
async function connectViaAdsPower(): Promise<Page> {
  // AdsPower 실행 확인
  await adsPowerGet('/status');

  // 프로필 목록에서 첫 번째 프로필 사용
  const listResult = await adsPowerGet('/api/v1/user/list?page=1&page_size=10');
  if (!listResult.data?.list?.length) {
    throw new Error('AdsPower 프로필 없음');
  }
  const profile = listResult.data.list[0];
  const userId = profile.user_id;
  cachedUserId = userId;
  console.log(`[ImageFX] 📋 AdsPower 프로필: ${profile.name || profile.serial_number} (${userId})`);

  // ── 1단계: headless로 브라우저 열기 ──
  console.log('[ImageFX] 🌐 AdsPower 브라우저 실행 (숨김 모드)...');
  sendImageLog('🌐 [ImageFX] AdsPower 브라우저 준비 중...');

  let openResult = await adsPowerGet(`/api/v1/browser/start?user_id=${userId}&headless=1`);
  if (openResult.code !== 0) {
    throw new Error(`AdsPower 브라우저 열기 실패: ${openResult.msg}`);
  }

  let wsUrl = openResult.data.ws?.puppeteer;
  if (!wsUrl) {
    throw new Error('AdsPower WebSocket URL 없음');
  }

  // Playwright 연결
  const { chromium } = await import('playwright');
  cachedBrowser = await chromium.connectOverCDP(wsUrl);
  let context: BrowserContext = cachedBrowser.contexts()[0];
  if (!context) throw new Error('AdsPower 컨텍스트 없음');

  cachedPage = context.pages()[0] || await context.newPage();
  browserMode = 'adspower';

  // labs.google/fx 접속 + 세션 확인
  await cachedPage.goto('https://labs.google/fx/tools/image-fx', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await cachedPage.waitForTimeout(1500);

  const session = await cachedPage.evaluate(async () => {
    try {
      const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.access_token ? data : null;
    } catch { return null; }
  });

  if (session && session.access_token) {
    // ✅ 이미 로그인됨 → headless 유지
    console.log(`[ImageFX] ✅ AdsPower Google 로그인 확인 (${session.user?.name || session.user?.email || 'user'}) — 숨김 모드 유지`);
    sendImageLog('✅ [ImageFX] Google 세션 확인 완료 (AdsPower 숨김 모드)');

    cachedToken = session.access_token;
    cachedTokenExpiry = new Date(session.expires || Date.now() + 50 * 60 * 1000);

    return cachedPage;
  }

  // ── 2단계: 로그인 필요 → visible로 재시작 ──
  console.log('[ImageFX] 🔐 Google 로그인 필요 → AdsPower 브라우저 표시');
  sendImageLog('🔐 [ImageFX] Google 로그인이 필요합니다. AdsPower 브라우저가 열립니다...');

  // headless 브라우저 닫기
  try {
    if (cachedBrowser) await cachedBrowser.close();
  } catch { /* 무시 */ }
  cachedBrowser = null;
  cachedPage = null;
  await adsPowerGet(`/api/v1/browser/stop?user_id=${userId}`).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 1000));

  // visible로 재시작
  openResult = await adsPowerGet(`/api/v1/browser/start?user_id=${userId}`);
  if (openResult.code !== 0) {
    throw new Error(`AdsPower 브라우저 표시 모드 열기 실패: ${openResult.msg}`);
  }

  wsUrl = openResult.data.ws?.puppeteer;
  if (!wsUrl) {
    throw new Error('AdsPower WebSocket URL 없음');
  }

  cachedBrowser = await chromium.connectOverCDP(wsUrl);
  context = cachedBrowser.contexts()[0];
  if (!context) throw new Error('AdsPower 컨텍스트 없음');

  cachedPage = context.pages()[0] || await context.newPage();
  browserMode = 'adspower';

  await cachedPage.goto('https://labs.google/fx/tools/image-fx', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  sendImageLog('🔐 [ImageFX] AdsPower 브라우저에서 Google 계정으로 로그인해주세요. (최대 5분 대기)');

  // 로그인 대기 (5초 간격으로 60회 = 최대 5분)
  let loggedIn = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // ✅ context 파괴 안전

    // ⚠️ 로그인 중 context 파괴 방어
    let checkSession: any = null;
    try {
      checkSession = await cachedPage!.evaluate(async () => {
        try {
          const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
          if (!res.ok) return null;
          const data = await res.json();
          return data.access_token ? data : null;
        } catch { return null; }
      });
    } catch (evalErr: any) {
      console.log(`[ImageFX] ↻ AdsPower 세션 체크 스킵 (context 파괴): ${evalErr.message?.substring(0, 60)}`);
      // context 파괴 시 기존 페이지 중 labs.google 찾기
      try {
        const ctx = cachedBrowser?.contexts()[0];
        if (ctx) {
          const fxPage = ctx.pages().find((p: any) => {
            try { return p.url().includes('labs.google'); } catch { return false; }
          });
          if (fxPage) cachedPage = fxPage;
        }
      } catch { /* 무시 */ }
      continue;
    }

    if (checkSession && checkSession.access_token) {
      loggedIn = true;
      console.log(`[ImageFX] ✅ AdsPower Google 로그인 성공! (${checkSession.user?.name || checkSession.user?.email || 'user'})`);
      sendImageLog(`✅ [ImageFX] Google 로그인 완료! 다음부터는 자동 로그인됩니다.`);

      cachedToken = checkSession.access_token;
      cachedTokenExpiry = new Date(checkSession.expires || Date.now() + 50 * 60 * 1000);
      break;
    }

    if (i % 6 === 5) {
      sendImageLog(`⏳ [ImageFX] Google 로그인 대기 중... (${Math.round((i + 1) * 5 / 60)}분 경과)`);
    }
  }

  if (!loggedIn) {
    // 로그인 실패 → 브라우저 닫기
    try { if (cachedBrowser) await cachedBrowser.close(); } catch { /* 무시 */ }
    cachedBrowser = null;
    cachedPage = null;
    await adsPowerGet(`/api/v1/browser/stop?user_id=${userId}`).catch(() => {});
    throw new Error('Google 로그인 시간 초과 (5분). AdsPower 브라우저에서 Google 로그인 후 다시 시도해주세요.');
  }

  // ✅ [2026-03-16] 로그인 성공 → visible 닫고 headless로 재시작 (화면에서 숨김)
  console.log('[ImageFX] 🔄 AdsPower 로그인 완료 → headless 모드로 전환...');
  sendImageLog('🔄 [ImageFX] 로그인 완료! 숨김 모드로 전환 중...');
  try { if (cachedBrowser) await cachedBrowser.close(); } catch { /* 무시 */ }
  cachedBrowser = null;
  cachedPage = null;
  await adsPowerGet(`/api/v1/browser/stop?user_id=${userId}`).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 1000));

  // headless로 재시작
  const headlessResult = await adsPowerGet(`/api/v1/browser/start?user_id=${userId}&headless=1`);
  if (headlessResult.code !== 0) {
    throw new Error(`AdsPower headless 재시작 실패: ${headlessResult.msg}`);
  }
  const headlessWsUrl = headlessResult.data.ws?.puppeteer;
  if (!headlessWsUrl) throw new Error('AdsPower headless WebSocket URL 없음');

  const { chromium: chromiumForHeadless } = await import('playwright');
  cachedBrowser = await chromiumForHeadless.connectOverCDP(headlessWsUrl);
  const headlessCtx = cachedBrowser.contexts()[0];
  if (!headlessCtx) throw new Error('AdsPower headless 컨텍스트 없음');
  cachedPage = headlessCtx.pages()[0] || await headlessCtx.newPage();
  browserMode = 'adspower';

  await cachedPage.goto('https://labs.google/fx/tools/image-fx', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await new Promise(resolve => setTimeout(resolve, 1500));

  console.log('[ImageFX] ✅ AdsPower headless 전환 완료 — 브라우저 숨김');
  sendImageLog('✅ [ImageFX] 로그인 완료! 이미지 생성 준비됨 (숨김 모드)');

  return cachedPage;
}

/**
 * ✅ [2026-03-16] 시스템 브라우저 폴백 전략
 * 
 * Playwright Chromium이 설치되지 않은 패키징 환경에서도 동작하도록:
 * 1. 시스템 Chrome (대부분의 사용자)
 * 2. 시스템 Edge (Windows 기본 설치)  
 * 3. Playwright 기본 Chromium (ensurePlaywrightBrowserInstalled 시도)
 * 4. 최후 수단: Playwright Chromium (설치 없이 직접 시도)
 */
async function launchWithSystemBrowserFallback(
  chromium: any,
  profileDir: string,
  options: {
    headless: boolean;
    args: string[];
    viewport: { width: number; height: number };
    ignoreDefaultArgs: string[];
  }
): Promise<BrowserContext> {
  // ── 방법 1: 시스템 Chrome ──
  try {
    console.log('[ImageFX] 🔍 시스템 Chrome 탐색...');
    const ctx = await chromium.launchPersistentContext(profileDir, {
      ...options,
      channel: 'chrome',
    });
    console.log('[ImageFX] ✅ 시스템 Chrome 사용');
    return ctx;
  } catch (chromeErr: any) {
    console.log(`[ImageFX] ⚠️ 시스템 Chrome 없음: ${chromeErr.message?.substring(0, 60)}`);
  }

  // ── 방법 2: 시스템 Edge (Windows 기본) ──
  try {
    console.log('[ImageFX] 🔍 시스템 Edge 탐색...');
    const ctx = await chromium.launchPersistentContext(profileDir, {
      ...options,
      channel: 'msedge',
    });
    console.log('[ImageFX] ✅ 시스템 Edge 사용');
    return ctx;
  } catch (edgeErr: any) {
    console.log(`[ImageFX] ⚠️ 시스템 Edge 없음: ${edgeErr.message?.substring(0, 60)}`);
  }

  // ── 방법 3: Playwright 자체 Chromium (설치 필요할 수 있음) ──
  try {
    await ensurePlaywrightBrowserInstalled();
    const ctx = await chromium.launchPersistentContext(profileDir, options);
    console.log('[ImageFX] ✅ Playwright 내장 Chromium 사용');
    return ctx;
  } catch (pwErr: any) {
    console.log(`[ImageFX] ⚠️ Playwright Chromium 실패: ${pwErr.message?.substring(0, 80)}`);
  }

  // ── 방법 4: 최후 수단 — 설치 없이 직접 시도 ──
  try {
    const ctx = await chromium.launchPersistentContext(profileDir, options);
    console.log('[ImageFX] ✅ Playwright Chromium 직접 실행 성공');
    return ctx;
  } catch (lastErr: any) {
    const msg = [
      'Chrome, Edge, Playwright Chromium 모두 사용할 수 없습니다.',
      'Chrome 또는 Edge 브라우저를 설치해주세요.',
      `상세: ${lastErr.message?.substring(0, 100)}`
    ].join(' ');
    throw new Error(msg);
  }
}

/**
 * ✅ [모드 2] Playwright 자체 영구 프로필 브라우저 (AdsPower 불필요!)
 * 
 * ● 기본: headless (숨김) — 화면에 브라우저 안 뜸
 * ● 첫 사용: Google 로그인 필요 시만 visible로 자동 전환
 * ● 로그인 후: 쿠키가 영구 저장 → 다음부터 headless로 자동 동작
 * 
 * ✅ [2026-03-16] 시스템 Chrome → Edge → Playwright Chromium 순서로 시도
 * 패키징된 Electron 앱에서 npx/cli.js 설치가 불가능한 문제 해결
 */
async function connectViaPlaywright(): Promise<Page> {
  const profileDir = getPlaywrightProfileDir();
  const fs = require('fs');

  // 프로필 디렉토리 생성
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
    console.log(`[ImageFX] 📁 Playwright 프로필 디렉토리 생성: ${profileDir}`);
  }

  const { chromium } = await import('playwright');

  // ── 1단계: headless로 실행 ──
  // ✅ [2026-03-16] 시스템 Chrome → Edge → Playwright Chromium 순서 시도
  console.log('[ImageFX] 🌐 자체 브라우저 실행 (숨김 모드)...');
  sendImageLog('🌐 [ImageFX] 자체 브라우저 준비 중...');

  // ✅ [2026-03-17] ImageFX는 Google 서비스(labs.google)라 프록시 불필요 → 직접 연결

  const launchOptions = {
    headless: true as boolean,
    args: [
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
    ],
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--enable-automation'],
  };

  let context = await launchWithSystemBrowserFallback(chromium, profileDir, launchOptions);

  let page = context.pages()[0] || await context.newPage();

  // labs.google/fx 접속 + 세션 확인
  await page.goto('https://labs.google/fx/tools/image-fx', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(1500);

  const session = await page.evaluate(async () => {
    try {
      const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.access_token ? data : null;
    } catch { return null; }
  });

  if (session && session.access_token) {
    // ✅ 이미 로그인됨 → headless 유지
    console.log(`[ImageFX] ✅ Google 로그인 확인 (${session.user?.name || session.user?.email || 'user'}) — 숨김 모드 유지`);
    sendImageLog('✅ [ImageFX] Google 세션 확인 완료 (숨김 모드)');

    cachedBrowser = context.browser() as any;
    cachedPage = page;
    browserMode = 'playwright';
    (cachedPage as any).__persistentContext = context;

    // 토큰도 캐싱
    cachedToken = session.access_token;
    cachedTokenExpiry = new Date(session.expires || Date.now() + 50 * 60 * 1000);

    return cachedPage;
  }

  // ── 2단계: 로그인 필요 → visible로 재실행 ──
  console.log('[ImageFX] 🔐 Google 로그인 필요 → 브라우저 표시');
  sendImageLog('🔐 [ImageFX] Google 로그인이 필요합니다. 브라우저가 열립니다...');

  // headless 브라우저 닫기
  await context.close();

  // visible로 재실행 (시스템 Chrome/Edge 폴백 적용)
  const visibleOptions = {
    headless: false as boolean,
    args: [
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
    ],
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--enable-automation'],
  };
  context = await launchWithSystemBrowserFallback(chromium, profileDir, visibleOptions);

  page = context.pages()[0] || await context.newPage();
  await page.goto('https://labs.google/fx/tools/image-fx', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  sendImageLog('🔐 [ImageFX] 브라우저에서 Google 계정으로 로그인해주세요. (최대 5분 대기)');

  // 로그인 대기 (5초 간격으로 60회 = 최대 5분)
  let loggedIn = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // ✅ page.waitForTimeout → setTimeout (context 파괴 안전)

    // ⚠️ 로그인 중 네비게이션으로 context 파괴 가능 → try-catch 보호
    let checkSession: any = null;
    try {
      // ✅ labs.google 도메인 페이지 우선 선택
      const currentPages = context.pages();
      if (currentPages.length > 0) {
        const fxPage = currentPages.find((p: any) => {
          try { return p.url().includes('labs.google'); } catch { return false; }
        });
        page = fxPage || currentPages[currentPages.length - 1];
      }

      checkSession = await page.evaluate(async () => {
        try {
          const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
          if (!res.ok) return null;
          const data = await res.json();
          return data.access_token ? data : null;
        } catch { return null; }
      });
    } catch (evalErr: any) {
      // Execution context destroyed → 다음 루프에서 재시도
      console.log(`[ImageFX] ↻ 세션 체크 스킵 (context 파괴): ${evalErr.message?.substring(0, 60)}`);
      continue;
    }

    if (checkSession && checkSession.access_token) {
      loggedIn = true;
      console.log(`[ImageFX] ✅ Google 로그인 성공! (${checkSession.user?.name || checkSession.user?.email || 'user'})`);
      sendImageLog(`✅ [ImageFX] Google 로그인 완료! 다음부터는 자동 로그인됩니다.`);

      // 토큰 캐싱
      cachedToken = checkSession.access_token;
      cachedTokenExpiry = new Date(checkSession.expires || Date.now() + 50 * 60 * 1000);
      break;
    }

    if (i % 6 === 5) {
      sendImageLog(`⏳ [ImageFX] Google 로그인 대기 중... (${Math.round((i + 1) * 5 / 60)}분 경과)`);
    }
  }

  if (!loggedIn) {
    await context.close();
    throw new Error('Google 로그인 시간 초과 (5분). ImageFX 사용 전 Google 계정으로 로그인해주세요.');
  }

  // ✅ [2026-03-16] 로그인 성공 → visible 브라우저 닫고 headless로 재시작 (화면에서 숨김)
  console.log('[ImageFX] 🔄 로그인 완료 → headless 모드로 전환 중...');
  sendImageLog('🔄 [ImageFX] 로그인 완료! 숨김 모드로 전환 중...');
  await context.close();

  // headless로 재실행
  const headlessContext = await launchWithSystemBrowserFallback(chromium, profileDir, launchOptions);
  const headlessPage = headlessContext.pages()[0] || await headlessContext.newPage();
  await headlessPage.goto('https://labs.google/fx/tools/image-fx', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await new Promise(resolve => setTimeout(resolve, 1500));

  cachedBrowser = headlessContext.browser() as any;
  cachedPage = headlessPage;
  browserMode = 'playwright';
  (cachedPage as any).__persistentContext = headlessContext;
  console.log('[ImageFX] ✅ headless 모드 전환 완료 — 브라우저 숨김');
  sendImageLog('✅ [ImageFX] 로그인 완료! 이미지 생성 준비됨 (숨김 모드)');

  return cachedPage;
}

/**
 * ✅ AdsPower Playwright 브라우저 + labs.google/fx 페이지 확보
 * 이중 모드: AdsPower 우선 → Playwright 자체 브라우저 폴백
 */
async function ensureBrowserPage(): Promise<Page> {
  // 1. 기존 페이지가 살아있으면 재사용
  if (cachedPage) {
    try {
      await cachedPage.evaluate(() => document.readyState);
      return cachedPage;
    } catch {
      console.log('[ImageFX] ⚠️ 기존 페이지 연결 끊김 → 재연결');
      cachedPage = null;
      cachedBrowser = null;
      cachedToken = null;
      browserMode = null;
    }
  }

  // 2. AdsPower 사용 여부 확인 (사용자 설정 기반)
  if (_adsPowerUserEnabled) {
    // ✅ AdsPower 활성화 → AdsPower 사용, 모든 실패 시 Playwright 자동 폴백
    try {
      await connectViaAdsPower();
      console.log('[ImageFX] 🔗 모드: AdsPower (사용자 설정 ON)');
    } catch (adsPowerErr: any) {
      const adsPowerErrMsg = adsPowerErr.message || '';
      // ✅ [2026-03-16] 모든 AdsPower 에러 → Playwright로 자동 폴백
      // ECONNREFUSED(미실행/포트불일치), Exceeding(일일 한도), 프로필 없음 등 전부 포함
      console.log(`[ImageFX] ⚠️ AdsPower 사용 불가 (${adsPowerErrMsg.substring(0, 80)}) → Playwright 자체 브라우저로 폴백`);
      sendImageLog('⚠️ [ImageFX] AdsPower 연결 실패. 자체 브라우저로 자동 전환합니다...');
      try {
        await connectViaPlaywright();
        console.log('[ImageFX] 🔗 모드: Playwright 자체 브라우저 (AdsPower 폴백)');
      } catch (pwErr: any) {
        throw new Error(`AdsPower 연결 실패 + Playwright 연결도 실패: ${pwErr.message}`);
      }
    }
  } else {
    // ✅ AdsPower 비활성화 → Playwright 자체 브라우저만 사용
    try {
      await connectViaPlaywright();
      console.log('[ImageFX] 🔗 모드: Playwright 자체 브라우저 (AdsPower OFF)');
    } catch (pwErr: any) {
      console.error(`[ImageFX] ❌ Playwright 연결 실패: ${pwErr.message}`);
      sendImageLog(`❌ [ImageFX] 브라우저 연결 실패: ${pwErr.message}`);
      throw new Error(`Playwright 브라우저 연결 실패: ${pwErr.message}`);
    }
  }

  if (!cachedPage) {
    throw new Error('브라우저 페이지를 열 수 없습니다.');
  }

  const page = cachedPage as Page;

  // 4. labs.google/fx 접속 (이미 해당 페이지면 스킵)
  const currentUrl = page.url();
  if (!currentUrl.includes('labs.google/fx')) {
    console.log('[ImageFX] 🌐 labs.google/fx 접속...');
    await page.goto('https://labs.google/fx/tools/image-fx', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
  }

  return page;
}

/**
 * ✅ 세션 토큰 획득 (캐시 → page.evaluate()로 세션 API 호출)
 */
async function getSessionToken(page: Page): Promise<string> {
  // 캐시된 토큰이 유효하면 재사용
  if (cachedToken && cachedTokenExpiry && cachedTokenExpiry > new Date()) {
    return cachedToken;
  }

  console.log('[ImageFX] 🔑 세션 토큰 획득...');
  sendImageLog('🔑 [ImageFX] Google 세션 토큰 확인 중...');

  const session = await page.evaluate(async () => {
    try {
      const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      return await res.json();
    } catch (err: any) {
      return { error: err.message };
    }
  });

  if (!session.access_token || !session.user) {
    throw new Error(
      'Google 로그인이 필요합니다. AdsPower 브라우저에서 Google 계정으로 로그인한 후 다시 시도해주세요.'
    );
  }

  cachedToken = session.access_token;
  cachedTokenExpiry = new Date(session.expires || Date.now() + 50 * 60 * 1000); // 기본 50분
  console.log(`[ImageFX] ✅ 토큰 획득 (${session.user?.name || session.user?.email || 'user'}, 만료: ${cachedTokenExpiry.toLocaleTimeString()})`);

  return cachedToken!;
}

/**
 * ✅ ImageFX로 이미지 1장 생성 (재시도 포함)
 * 
 * @param prompt 이미지 프롬프트 (영어 권장)
 * @param aspectRatio 이미지 비율 ('1:1', '16:9', '9:16', '4:3')
 * @param signal AbortSignal (중지 요청)
 */
export async function generateSingleImageWithImageFx(
  prompt: string,
  aspectRatio: string = '1:1',
  signal?: AbortSignal
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;
  // ✅ [2026-03-18] ZERO_TEXT_SUFFIX 제거! Imagen 3.5는 negative instruction을 텍스트로 렌더링함
  // 대신 sanitizeImagePrompt()로 AI 응답 오염(Perplexity 자기 소개 등)을 정제
  let currentPrompt = sanitizeImagePrompt(prompt);
  const fxAspectRatio = ASPECT_RATIO_MAP[aspectRatio] || ASPECT_RATIO_MAP['1:1'];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      console.log('[ImageFX] ⏹️ 중지 요청됨');
      return null;
    }

    try {
      // 1. 브라우저 + 페이지 확보
      const page = await ensureBrowserPage();

      // 2. 세션 토큰 획득
      const token = await getSessionToken(page);

      // 3. 이미지 생성 API 호출 (page.evaluate 내에서 직접 fetch)
      console.log(`[ImageFX] 🖼️ 이미지 생성 시도 ${attempt}/${MAX_RETRIES} (프롬프트: ${currentPrompt.substring(0, 80)}...)`);
      sendImageLog(`🖼️ [ImageFX] 이미지 생성 중... (시도 ${attempt}/${MAX_RETRIES})`);

      const genResult = await page.evaluate(async (params: { token: string; prompt: string; ratio: string; seed: number }) => {
        try {
          const body = JSON.stringify({
            userInput: {
              candidatesCount: 1,
              prompts: [params.prompt],
              seed: params.seed,
            },
            clientContext: {
              sessionId: `;${Date.now()}`,
              tool: 'IMAGE_FX',
            },
            modelInput: {
              modelNameType: 'IMAGEN_3_5',
            },
            aspectRatio: params.ratio,
          });

          const res = await fetch('https://aisandbox-pa.googleapis.com/v1:runImageFx', {
            method: 'POST',
            body,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${params.token}`,
            },
          });

          if (!res.ok) {
            const text = await res.text();
            return { error: `HTTP_${res.status}`, detail: text.substring(0, 500) };
          }

          const data = await res.json();
          const images = data?.imagePanels?.[0]?.generatedImages;
          if (images && images.length > 0 && images[0].encodedImage) {
            return {
              success: true,
              encodedImage: images[0].encodedImage,
              width: images[0].width,
              height: images[0].height,
            };
          }
          return { error: 'NO_IMAGES', detail: JSON.stringify(data).substring(0, 500) };
        } catch (err: any) {
          return { error: 'EXCEPTION', detail: err.message };
        }
      }, {
        token,
        prompt: currentPrompt,
        ratio: fxAspectRatio,
        seed: Math.floor(Math.random() * 999999),
      });

      // 4. 결과 처리
      if (genResult.success && genResult.encodedImage) {
        const buffer = Buffer.from(genResult.encodedImage, 'base64');
        console.log(`[ImageFX] ✅ 이미지 생성 성공! (${Math.round(buffer.length / 1024)}KB, 시도 ${attempt})`);
        sendImageLog(`✅ [ImageFX] 이미지 생성 완료 (${Math.round(buffer.length / 1024)}KB)`);
        // ✅ [2026-03-16 FIX] 실제 이미지 포맷을 버퍼에서 감지 (하드코딩 제거)
        const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
        const isWebP = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
        const detectedMimeType = isJPEG ? 'image/jpeg' : isWebP ? 'image/webp' : 'image/png';
        return { buffer, mimeType: detectedMimeType };
      }

      // 에러 처리
      const errorCode = genResult.error || 'UNKNOWN';
      const errorDetail = genResult.detail || '';

      // 토큰 만료 (401)
      if (errorCode === 'HTTP_401') {
        console.warn('[ImageFX] 🔑 토큰 만료 → 갱신 시도');
        sendImageLog('🔑 [ImageFX] 토큰 갱신 중...');
        cachedToken = null;
        cachedTokenExpiry = null;
        continue;
      }

      // 안전 필터 차단
      if (errorDetail.includes('safety') || errorDetail.includes('blocked') || errorDetail.includes('harmful') || errorDetail.includes('policy')) {
        console.warn(`[ImageFX] 🛡️ 안전 필터 차단 (시도 ${attempt}) → 프롬프트 순화`);
        sendImageLog('🛡️ [ImageFX] 안전 필터 — 프롬프트 순화 중...');
        currentPrompt = sanitizePromptForSafety(currentPrompt);
        continue;
      }

      // 서버 과부하 (503)
      if (errorCode === 'HTTP_503') {
        const waitSec = 5 * attempt;
        console.warn(`[ImageFX] ⏳ 서버 과부하 (시도 ${attempt}) → ${waitSec}초 대기`);
        sendImageLog(`⏳ [ImageFX] 서버 과부하 — ${waitSec}초 대기 중...`);
        await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
        continue;
      }

      // 기타 에러
      console.error(`[ImageFX] ❌ 생성 실패 (시도 ${attempt}/${MAX_RETRIES}): ${errorCode} ${errorDetail.substring(0, 100)}`);
      lastError = new Error(`${errorCode}: ${errorDetail.substring(0, 200)}`);

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

    } catch (error: any) {
      lastError = error;
      console.error(`[ImageFX] ❌ 예외 (시도 ${attempt}/${MAX_RETRIES}): ${error.message}`);

      // AdsPower 연결 문제 → 캐시 초기화
      if (error.message.includes('AdsPower') || error.message.includes('연결') || error.message.includes('WebSocket')) {
        cachedBrowser = null;
        cachedPage = null;
        cachedToken = null;
      }

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

  console.error(`[ImageFX] ❌ 모든 재시도 실패:`, lastError?.message);
  return null;
}

/**
 * ✅ [2026-03-16] Google 로그인 사전 확인 (이미지 생성 시작 전 호출)
 * 
 * 🔒 headless 전용 — 브라우저 창을 사용자에게 보여주지 않음
 * 1. 캐시된 페이지 있으면 세션 API만 호출
 * 2. 없으면 headless로 브라우저 열고 세션 확인
 * 3. 로그인 확인되면 세션 캐시 유지 → 이미지 생성 시 재활용
 * 4. 미로그인이면 즉시 결과 반환 (창 띄우기 없음)
 * 
 * @returns { loggedIn, userName, message }
 */
export async function checkGoogleLoginForImageFx(): Promise<{
  loggedIn: boolean;
  userName?: string;
  message: string;
}> {
  try {
    console.log('[ImageFX] 🔍 Google 로그인 사전 확인 시작 (숨김 모드)...');
    sendImageLog('🔍 [ImageFX] Google 로그인 상태 확인 중...');

    // ── 1. 캐시된 토큰이 유효하면 즉시 통과 ──
    if (cachedToken && cachedTokenExpiry && cachedTokenExpiry > new Date()) {
      console.log('[ImageFX] ✅ 캐시된 토큰 유효 → 로그인 확인 스킵');
      return { loggedIn: true, message: 'Google 로그인 확인 (캐시됨)' };
    }

    // ── 2. 캐시된 페이지가 살아있으면 세션만 확인 ──
    if (cachedPage) {
      try {
        await cachedPage.evaluate(() => document.readyState);
        
        const currentUrl = cachedPage.url();
        if (!currentUrl.includes('labs.google/fx')) {
          await cachedPage.goto('https://labs.google/fx/tools/image-fx', {
            waitUntil: 'networkidle',
            timeout: 30000,
          });
          await cachedPage.waitForTimeout(1500);
        }

        const session = await cachedPage.evaluate(async () => {
          try {
            const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
            if (!res.ok) return null;
            return await res.json();
          } catch { return null; }
        });

        if (session?.access_token && session?.user) {
          const userName = session.user?.name || session.user?.email || 'Google 사용자';
          cachedToken = session.access_token;
          cachedTokenExpiry = new Date(session.expires || Date.now() + 50 * 60 * 1000);
          console.log(`[ImageFX] ✅ Google 로그인 확인: ${userName} (기존 세션)`);
          sendImageLog(`✅ [ImageFX] Google 로그인 확인: ${userName}`);
          return { loggedIn: true, userName, message: `Google 로그인 완료: ${userName}` };
        }

        // 세션 없음 → 미로그인
        console.log('[ImageFX] ⚠️ 기존 페이지에서 Google 세션 없음');
        sendImageLog('⚠️ [ImageFX] Google 로그인이 필요합니다.');
        return { loggedIn: false, message: 'Google 로그인이 필요합니다. 이미지 생성 시 자동으로 브라우저가 열립니다.' };
      } catch {
        // 페이지 연결 끊김 → 새로 확인
        cachedPage = null;
        cachedBrowser = null;
        cachedToken = null;
        browserMode = null;
      }
    }

    // ── 3. AdsPower 모드면 AdsPower 브라우저로 확인 ──
    if (_adsPowerUserEnabled) {
      let adsBrowser: any = null;
      let adsUserId: string = '';
      try {
        const { chromium } = await import('playwright');

        // AdsPower 실행 확인 + 프로필 목록에서 첫 번째 프로필의 userId 가져오기
        await adsPowerGet('/status');
        const listResult = await adsPowerGet('/api/v1/user/list?page=1&page_size=10');
        if (!listResult.data?.list?.length) throw new Error('AdsPower 프로필 없음');
        adsUserId = listResult.data.list[0].user_id;

        // headless로 세션 확인
        let openResult = await adsPowerGet(`/api/v1/browser/start?user_id=${adsUserId}&headless=1`);
        if (openResult.code !== 0) throw new Error(`AdsPower 시작 실패: ${openResult.msg}`);

        let wsUrl = openResult.data.ws?.puppeteer;
        if (!wsUrl) throw new Error('AdsPower WebSocket URL 없음');

        adsBrowser = await chromium.connectOverCDP(wsUrl);
        let context = adsBrowser.contexts()[0];
        if (!context) throw new Error('AdsPower 컨텍스트 없음');

        let page = context.pages()[0] || await context.newPage();

        await page.goto('https://labs.google/fx/tools/image-fx', {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        await page.waitForTimeout(1500);
        
        const session = await page.evaluate(async () => {
          try {
            const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
            if (!res.ok) return null;
            return await res.json();
          } catch { return null; }
        });

        if (session?.access_token && session?.user) {
          const userName = session.user?.name || session.user?.email || 'Google 사용자';
          cachedBrowser = adsBrowser;
          cachedPage = page;
          browserMode = 'adspower';
          cachedUserId = adsUserId; // ✅ [2026-03-16 FIX] cleanup 시 AdsPower stop 호출에 필요
          cachedToken = session.access_token;
          cachedTokenExpiry = new Date(session.expires || Date.now() + 50 * 60 * 1000);
          console.log(`[ImageFX] ✅ Google 로그인 확인: ${userName} (AdsPower)`);
          sendImageLog(`✅ [ImageFX] Google 로그인 확인: ${userName}`);
          return { loggedIn: true, userName, message: `Google 로그인 완료: ${userName}` };
        }

        // ✅ [2026-03-16 FIX] 미로그인 → visible로 재시작하여 즉시 로그인 유도
        console.log('[ImageFX] 🔐 AdsPower Google 미로그인 → visible 브라우저로 로그인 유도');
        sendImageLog('🔐 [ImageFX] Google 로그인이 필요합니다. AdsPower 브라우저가 열립니다...');

        // headless 닫기
        try { if (adsBrowser) await adsBrowser.close(); } catch { /* 무시 */ }
        adsBrowser = null;
        await adsPowerGet(`/api/v1/browser/stop?user_id=${adsUserId}`).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 1000));

        // visible로 재시작
        openResult = await adsPowerGet(`/api/v1/browser/start?user_id=${adsUserId}`);
        if (openResult.code !== 0) throw new Error(`AdsPower visible 모드 실패: ${openResult.msg}`);

        wsUrl = openResult.data.ws?.puppeteer;
        if (!wsUrl) throw new Error('AdsPower WebSocket URL 없음');

        adsBrowser = await chromium.connectOverCDP(wsUrl);
        context = adsBrowser.contexts()[0];
        if (!context) throw new Error('AdsPower 컨텍스트 없음');

        page = context.pages()[0] || await context.newPage();
        await page.goto('https://labs.google/fx/tools/image-fx', {
          waitUntil: 'networkidle',
          timeout: 30000,
        });

        sendImageLog('🔐 [ImageFX] AdsPower 브라우저에서 Google 계정으로 로그인해주세요. (최대 5분 대기)');

        // 로그인 대기 (5초 간격, 최대 5분)
        for (let i = 0; i < 60; i++) {
          await page.waitForTimeout(5000);

          const checkSession = await page.evaluate(async () => {
            try {
              const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
              if (!res.ok) return null;
              const data = await res.json();
              return data.access_token ? data : null;
            } catch { return null; }
          });

          if (checkSession?.access_token && checkSession?.user) {
            const userName = checkSession.user?.name || checkSession.user?.email || 'Google 사용자';
            console.log(`[ImageFX] ✅ AdsPower Google 로그인 성공: ${userName}`);
            sendImageLog(`✅ [ImageFX] Google 로그인 완료: ${userName}`);

            // ✅ [2026-03-16 최적화] 로그인 성공 → visible 브라우저를 그대로 캐시 (headless 재시작 제거)
            cachedBrowser = adsBrowser;
            cachedPage = page;
            browserMode = 'adspower';
            cachedUserId = adsUserId; // ✅ [2026-03-16 FIX] cleanup 시 AdsPower stop 호출에 필요
            cachedToken = checkSession.access_token;
            cachedTokenExpiry = new Date(checkSession.expires || Date.now() + 50 * 60 * 1000);

            sendImageLog('✅ [ImageFX] 로그인 완료! 이미지 생성 준비됨');
            return { loggedIn: true, userName, message: `Google 로그인 완료: ${userName}` };
          }

          if (i % 6 === 5) {
            sendImageLog(`⏳ [ImageFX] Google 로그인 대기 중... (${Math.round((i + 1) * 5 / 60)}분 경과)`);
          }
        }

        // 5분 타임아웃
        try { if (adsBrowser) await adsBrowser.close(); } catch { /* 무시 */ }
        adsBrowser = null;
        await adsPowerGet(`/api/v1/browser/stop?user_id=${adsUserId}`).catch(() => {});
        console.log('[ImageFX] ⚠️ AdsPower Google 로그인 시간 초과');
        sendImageLog('⚠️ [ImageFX] Google 로그인 시간 초과 (5분). 다시 시도해주세요.');
        return { 
          loggedIn: false, 
          message: 'Google 로그인 시간 초과 (5분). "🔄 Google 계정 변경" 버튼을 눌러 다시 시도해주세요.' 
        };
      } catch (err: any) {
        // ✅ [2026-03-16 FIX] 에러 시 열린 브라우저 리소스 정리 (좀비/start 카운트 소비 방지)
        try { if (adsBrowser) await adsBrowser.close(); } catch { /* 무시 */ }
        if (adsUserId) await adsPowerGet(`/api/v1/browser/stop?user_id=${adsUserId}`).catch(() => {});

        // ✅ [2026-03-16] 모든 AdsPower 에러 → Playwright 자체 브라우저로 자동 폴백
        // ECONNREFUSED(미실행), Exceeding(일일 한도), 프로필 없음 등 모두 포함
        const errMsg = err.message || '';
        console.log(`[ImageFX] ⚠️ AdsPower 에러 (${errMsg.substring(0, 60)}) → Playwright 자체 브라우저로 전환`);
        sendImageLog('⚠️ [ImageFX] AdsPower 연결 실패. 자체 브라우저로 자동 전환합니다...');
        // 아래 Playwright 경로(── 4. ──)로 계속 진행
      }
    }

    // ── 4. Playwright headless로 세션만 빠르게 확인 ──
    // ✅ [2026-03-16] Playwright Chromium 자동 설치 (미설치 시)
    await ensurePlaywrightBrowserInstalled();

    const profileDir = getPlaywrightProfileDir();
    const fs = require('fs');
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    const { chromium } = await import('playwright');
    console.log('[ImageFX] 🔍 headless 브라우저로 세션 확인...');

    let context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      args: [
        '--no-first-run',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
      ],
      viewport: { width: 1280, height: 800 },
      ignoreDefaultArgs: ['--enable-automation'],
    });

    let page = context.pages()[0] || await context.newPage();

    await page.goto('https://labs.google/fx/tools/image-fx', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(1500);

    const session = await page.evaluate(async () => {
      try {
        const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
        if (!res.ok) return null;
        const data = await res.json();
        return data.access_token ? data : null;
      } catch { return null; }
    });

    if (session?.access_token && session?.user) {
      const userName = session.user?.name || session.user?.email || 'Google 사용자';
      
      // ✅ 세션 확인됨 → headless 페이지를 캐시로 보관 (이미지 생성 시 재활용)
      cachedBrowser = context.browser() as any;
      cachedPage = page;
      browserMode = 'playwright';
      (cachedPage as any).__persistentContext = context;
      cachedToken = session.access_token;
      cachedTokenExpiry = new Date(session.expires || Date.now() + 50 * 60 * 1000);

      console.log(`[ImageFX] ✅ Google 로그인 확인: ${userName} (headless)`);
      sendImageLog(`✅ [ImageFX] Google 로그인 확인: ${userName}`);
      return { loggedIn: true, userName, message: `Google 로그인 완료: ${userName}` };
    }

    // ✅ [2026-03-16 FIX] 미로그인 → 즉시 visible 브라우저 열어 로그인 유도
    // 기존: context 닫고 false만 반환 (사용자가 이미지 생성 시점까지 기다려야 했음)
    // 변경: headless 닫고 → visible로 재실행 → 로그인 대기 (최대 5분)
    await context.close();
    console.log('[ImageFX] 🔐 Google 미로그인 → visible 브라우저로 로그인 유도');
    sendImageLog('🔐 [ImageFX] Google 로그인이 필요합니다. 브라우저가 열립니다...');

    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: [
        '--no-first-run',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
      ],
      viewport: { width: 1280, height: 800 },
      ignoreDefaultArgs: ['--enable-automation'],
    });

    page = context.pages()[0] || await context.newPage();
    await page.goto('https://labs.google/fx/tools/image-fx', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    sendImageLog('🔐 [ImageFX] 브라우저에서 Google 계정으로 로그인해주세요. (최대 5분 대기)');

    // 로그인 대기 (5초 간격, 최대 5분)
    let loggedIn = false;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5000);

      const checkSession = await page.evaluate(async () => {
        try {
          const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
          if (!res.ok) return null;
          const data = await res.json();
          return data.access_token ? data : null;
        } catch { return null; }
      });

      if (checkSession?.access_token && checkSession?.user) {
        loggedIn = true;
        const userName = checkSession.user?.name || checkSession.user?.email || 'Google 사용자';
        console.log(`[ImageFX] ✅ Google 로그인 성공: ${userName}`);
        sendImageLog(`✅ [ImageFX] Google 로그인 완료: ${userName}`);

        // ✅ [2026-03-16 최적화] 로그인 성공 → visible 브라우저를 그대로 캐시 (headless 재시작 제거)
        cachedBrowser = context.browser() as any;
        cachedPage = page;
        browserMode = 'playwright';
        (cachedPage as any).__persistentContext = context;
        cachedToken = checkSession.access_token;
        cachedTokenExpiry = new Date(checkSession.expires || Date.now() + 50 * 60 * 1000);

        sendImageLog('✅ [ImageFX] 로그인 완료! 이미지 생성 준비됨');
        return { loggedIn: true, userName, message: `Google 로그인 완료: ${userName}` };
      }

      if (i % 6 === 5) {
        sendImageLog(`⏳ [ImageFX] Google 로그인 대기 중... (${Math.round((i + 1) * 5 / 60)}분 경과)`);
      }
    }

    // 5분 타임아웃
    await context.close();
    console.log('[ImageFX] ⚠️ Google 로그인 시간 초과');
    sendImageLog('⚠️ [ImageFX] Google 로그인 시간 초과 (5분). 다시 시도해주세요.');
    return { 
      loggedIn: false, 
      message: 'Google 로그인 시간 초과 (5분). "🔄 Google 계정 변경" 버튼을 눌러 다시 시도해주세요.' 
    };

  } catch (error: any) {
    console.error(`[ImageFX] ❌ Google 로그인 확인 실패: ${error.message}`);
    sendImageLog(`❌ [ImageFX] 로그인 확인 실패: ${error.message}`);
    return { loggedIn: false, message: `로그인 확인 실패: ${error.message}` };
  }
}

/**
 * ✅ ImageFX가 사용 가능한지 확인
 * AdsPower 또는 Playwright 자체 브라우저로 동작
 */
export async function isImageFxAvailable(): Promise<boolean> {
  // ✅ [2026-03-16 FIX] AdsPower가 꺼져있어도 Playwright 자체 브라우저로 사용 가능
  if (!_adsPowerUserEnabled) {
    return true; // Playwright 모드는 항상 사용 가능 (로그인은 실제 호출 시 체크)
  }

  try {
    // AdsPower 실행 확인
    await adsPowerGet('/status');
    
    // 프로필 확인
    const listResult = await adsPowerGet('/api/v1/user/list?page=1&page_size=10');
    if (!listResult.data?.list?.length) return false;

    return true; // AdsPower 실행 + 프로필 존재 → 사용 가능 (로그인은 실제 호출 시 체크)
  } catch {
    return false;
  }
}

/**
 * ✅ 브라우저 연결 정리 (앱 종료 시 호출)
 */
export async function cleanupImageFxBrowser(): Promise<void> {
  try {
    // Playwright persistent context 종료
    if (cachedPage && (cachedPage as any).__persistentContext) {
      await (cachedPage as any).__persistentContext.close();
      console.log('[ImageFX] 🧹 Playwright 자체 브라우저 종료 완료');
    } else if (cachedBrowser) {
      await cachedBrowser.close();
      console.log('[ImageFX] 🧹 브라우저 연결 정리 완료');
    }
  } catch { /* 무시 */ }

  // ✅ [2026-03-16] AdsPower 모드였으면 stop API 호출
  if (browserMode === 'adspower' && cachedUserId) {
    try {
      await adsPowerGet(`/api/v1/browser/stop?user_id=${cachedUserId}`);
      console.log('[ImageFX] 🧹 AdsPower 브라우저 종료 완료');
    } catch { /* AdsPower 미실행 시 무시 */ }
  }

  cachedBrowser = null;
  cachedPage = null;
  cachedToken = null;
  cachedTokenExpiry = null;
  cachedUserId = null;
  browserMode = null;
}

/**
 * ✅ [2026-03-16] Google 계정 변경 (세션 초기화 + 재로그인)
 * 
 * 흐름:
 * 1. 기존 브라우저/캐시 완전 정리 (cleanupImageFxBrowser)
 * 2. Playwright 프로필 디렉토리 삭제 (저장된 쿠키 제거)
 * 3. ensureBrowserPage() 호출 → 미로그인 상태이므로 visible 브라우저가 열림
 * 4. 사용자가 새 Google 계정으로 로그인
 * 5. 로그인 성공 시 새 계정 이름 반환
 */
export async function switchGoogleAccountForImageFx(): Promise<{
  success: boolean;
  userName?: string;
  message: string;
}> {
  try {
    console.log('[ImageFX] 🔄 Google 계정 변경 시작...');
    sendImageLog('🔄 [ImageFX] Google 계정 변경 중... 기존 세션을 정리합니다.');

    // ── 0. cleanup 전에 현재 토큰 저장 (이전 계정명 비교용) ──
    // cleanupImageFxBrowser()가 cachedToken을 null로 초기화하므로 미리 저장
    const savedTokenBeforeCleanup = cachedToken;

    // ── 1. 기존 브라우저/캐시 완전 정리 ──
    await cleanupImageFxBrowser();

    // ── 2. Playwright 프로필 디렉토리 삭제 (세션 쿠키 제거) ──
    if (!_adsPowerUserEnabled) {
      const profileDir = getPlaywrightProfileDir();
      const fs = require('fs');
      if (fs.existsSync(profileDir)) {
        try {
          fs.rmSync(profileDir, { recursive: true, force: true });
          console.log(`[ImageFX] 🗑️ Playwright 프로필 삭제 완료: ${profileDir}`);
          sendImageLog('🗑️ [ImageFX] 기존 Google 세션 삭제 완료');
        } catch (rmErr: any) {
          console.warn(`[ImageFX] ⚠️ 프로필 삭제 실패 (계속 진행): ${rmErr.message}`);
        }
      }
    }

    // ── 3. 브라우저 재실행 → 미로그인이므로 visible 로그인 창이 자동으로 열림 ──
    sendImageLog('🌐 [ImageFX] 새 Google 계정으로 로그인해주세요. 브라우저가 열립니다...');

    // ✅ [2026-03-16] AdsPower + Playwright 통합 폴백 전략
    // AdsPower 에러(미실행/ECONNREFUSED, 일일 한도 초과 등) 발생 시
    // 자동으로 Playwright 자체 브라우저 경로로 폴백
    let useAdsPowerPath = _adsPowerUserEnabled;
    let adsPowerProfile: any = null; // ✅ 첫 번째 체크에서 프로필 저장

    if (useAdsPowerPath) {
      try {
        // AdsPower 실행 확인 (ECONNREFUSED 발생 가능)
        await adsPowerGet('/status');
        const listResult = await adsPowerGet('/api/v1/user/list?page=1&page_size=10');
        if (!listResult.data?.list?.length) throw new Error('AdsPower 프로필 없음');
        adsPowerProfile = listResult.data.list[0]; // ✅ 프로필 저장 — 재조회 불필요
      } catch (adsCheckErr: any) {
        // ✅ AdsPower 연결 불가 → Playwright로 자동 폴백
        const adsMsg = adsCheckErr.message || '';
        console.log(`[ImageFX] ⚠️ AdsPower 사용 불가 (${adsMsg.substring(0, 60)}) → Playwright 자체 브라우저로 폴백`);
        sendImageLog(`⚠️ [ImageFX] AdsPower 사용 불가. 자체 브라우저로 계정을 변경합니다...`);
        useAdsPowerPath = false;
      }
    }

    if (useAdsPowerPath && adsPowerProfile) {
      // ── AdsPower 모드: visible 브라우저로 Google 로그아웃 + 새 계정 로그인 ──
      const { chromium } = await import('playwright');

      // ✅ 첫 번째 체크에서 이미 저장한 프로필 사용 — 중복 API 호출 제거
      const profile = adsPowerProfile;
      const userId = profile.user_id;
      // ✅ [FIX-4] cachedUserId를 여기서 설정하는 이유:
      // cleanupImageFxBrowser()가 cachedUserId를 초기화하므로,
      // headless 전환 후 다음 이미지 생성에서 프로필을 찾을 수 있도록 재설정 필수
      cachedUserId = userId;

      // ✅ [FIX-3] 기존 계정명: cleanup 전 저장한 토큰에서 경량 추출 (25초 headless 오버헤드 제거)
      // 이전 로직: headless 브라우저 열기→ImageFX 접속→세션 체크→종료 (10~25초)
      // 개선: savedTokenBeforeCleanup으로 JWT payload에서 이름 추출, 없으면 스킵
      let previousUserName = '';
      if (savedTokenBeforeCleanup) {
        try {
          // JWT access_token에서 payload 추출 (base64url → JSON)
          const parts = savedTokenBeforeCleanup.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
            previousUserName = payload.name || payload.email || '';
          }
        } catch { /* JWT 파싱 실패 — 무시 (경고 메시지만을 위한 것이므로) */ }
      }
      console.log(`[ImageFX] 📋 기존 Google 계정: ${previousUserName || '(없음)'}`);

      // ✅ visible 모드로 열기 (사용자가 볼 수 있도록)
      console.log('[ImageFX] 🌐 AdsPower 브라우저 열기 (표시 모드)...');
      sendImageLog('🌐 [ImageFX] AdsPower 브라우저를 표시 모드로 여는 중...');

      let openResult = await adsPowerGet(`/api/v1/browser/start?user_id=${userId}`);
      // ✅ [2026-03-16] AdsPower 일일 한도 초과 시 → Playwright 자체 브라우저로 폴백
      if (openResult.code !== 0) {
        const openMsg = openResult.msg || '';
        if (openMsg.includes('Exceeding') || openMsg.includes('daily limit') || openMsg.includes('open daily')) {
          console.log('[ImageFX] ⚠️ AdsPower 일일 한도 초과 → Playwright 자체 브라우저로 계정 변경');
          sendImageLog('⚠️ [ImageFX] AdsPower 일일 한도 초과. 자체 브라우저로 계정을 변경합니다...');
          // AdsPower 경로 건너뛰고 아래 Playwright 경로(else 블록)로 이동
          // 임시로 _adsPowerUserEnabled를 false처럼 처리하기 위해 여기서 return 대신 폴백
          const profileDir = getPlaywrightProfileDir();
          const fs = require('fs');
          if (fs.existsSync(profileDir)) {
            try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* 무시 */ }
          }
          // ✅ [2026-03-16] connectViaPlaywright 내부에서 시스템 Chrome/Edge 폴백 처리됨
          await connectViaPlaywright();
          if (!cachedPage || !cachedToken) {
            return { success: false, message: 'Google 로그인에 실패했습니다. 다시 시도해주세요.' };
          }
          let fallbackUserName = 'Google 사용자';
          try {
            const parts = cachedToken.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
              fallbackUserName = payload.name || payload.email || 'Google 사용자';
            }
          } catch { /* 무시 */ }
          return { success: true, userName: fallbackUserName, message: `Google 계정 변경 완료: ${fallbackUserName} (Playwright 자체 브라우저)` };
        }
        throw new Error(`AdsPower 브라우저 열기 실패: ${openMsg}`);
      }

      let wsUrl = openResult.data.ws?.puppeteer;
      if (!wsUrl) throw new Error('AdsPower WebSocket URL 없음');

      let browser = await chromium.connectOverCDP(wsUrl);
      let context = browser.contexts()[0];
      if (!context) throw new Error('AdsPower 컨텍스트 없음');

      let page = context.pages()[0] || await context.newPage();

      // ✅ Google 계정 로그아웃 (visible에서 수행 — 사용자가 볼 수 있음)
      // ⚠️ Logout 페이지는 여러 리다이렉트를 유발하여 execution context가 파괴될 수 있음
      console.log('[ImageFX] 🔓 Google 로그아웃 수행...');
      sendImageLog('🔓 [ImageFX] 기존 Google 계정 로그아웃 중...');
      try {
        await page.goto('https://accounts.google.com/Logout', {
          waitUntil: 'domcontentloaded',  // networkidle 대신 — 리다이렉트 체인에서 안전
          timeout: 15000,
        });
      } catch (navErr: any) {
        console.warn(`[ImageFX] ⚠️ 로그아웃 네비게이션 경고 (계속 진행): ${navErr.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 3000)); // 리다이렉트 완료 대기 (page.waitForTimeout은 context 파괴 시 실패)

      // ✅ 쿠키 직접 삭제 (로그아웃 리다이렉트 실패에도 세션 정리 보장)
      try {
        await context.clearCookies();
        console.log('[ImageFX] 🗑️ Google 쿠키 전체 삭제 완료');
      } catch (cookieErr: any) {
        console.warn(`[ImageFX] ⚠️ 쿠키 삭제 실패: ${cookieErr.message}`);
      }

      // ✅ ImageFX 페이지로 이동 → 로그인 화면 표시
      // 기존 page의 context가 파괴되었을 수 있으므로 새 페이지를 사용
      try {
        // 기존 페이지 사용 가능한지 확인
        await page.evaluate(() => document.readyState);
      } catch {
        // context 파괴됨 → 새 페이지 열기
        console.log('[ImageFX] ↻ 페이지 context 파괴됨 → 새 페이지 생성');
        page = context.pages()[0] || await context.newPage();
      }

      try {
        await page.goto('https://labs.google/fx/tools/image-fx', {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
      } catch (navErr: any) {
        console.warn(`[ImageFX] ⚠️ ImageFX 네비게이션 경고: ${navErr.message}`);
        // ✅ [FIX-5] 새 페이지로 재시도 — 이것도 실패 가능하므로 try-catch
        try {
          page = await context.newPage();
          await page.goto('https://labs.google/fx/tools/image-fx', {
            waitUntil: 'domcontentloaded', // networkidle 대신 더 빠른 전략
            timeout: 30000,
          });
        } catch (retryErr: any) {
          console.warn(`[ImageFX] ⚠️ ImageFX 2차 네비게이션도 실패: ${retryErr.message}`);
          // 그래도 계속 진행 — 사용자가 직접 URL 입력 가능
        }
      }
      await new Promise(resolve => setTimeout(resolve, 2000));

      sendImageLog('🔐 [ImageFX] AdsPower 브라우저에서 새 Google 계정으로 로그인해주세요. (최대 5분 대기)');

      // ✅ 로그인 대기 (5초 간격, 최대 5분)
      let loggedIn = false;
      let userName = '';
      for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // page.waitForTimeout 대신 안전한 setTimeout
        
        // ⚠️ 사용자가 로그인 중 페이지 네비게이션이 발생할 수 있으므로 evaluate를 try-catch 보호
        try {
          // ✅ [FIX-6] ImageFX 도메인 페이지 우선 선택 (팝업이 열려도 안전)
          const currentPages = context.pages();
          if (currentPages.length > 0) {
            const fxPage = currentPages.find((p: any) => {
              try { return p.url().includes('labs.google'); } catch { return false; }
            });
            page = fxPage || currentPages[currentPages.length - 1];
          }

          const session = await page.evaluate(async () => {
            try {
              const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
              if (!res.ok) return null;
              const data = await res.json();
              return data.access_token ? data : null;
            } catch { return null; }
          });

          if (session?.access_token && session?.user) {
            loggedIn = true;
            userName = session.user?.name || session.user?.email || 'Google 사용자';
            cachedToken = session.access_token;
            cachedTokenExpiry = new Date(session.expires || Date.now() + 50 * 60 * 1000);
            break;
          }
        } catch (evalErr: any) {
          // 네비게이션 중이라 evaluate 실패 → 다음 루프에서 재시도
          console.log(`[ImageFX] ↻ 세션 체크 스킵 (네비게이션 중): ${evalErr.message?.substring(0, 60)}`);
        }

        if (i % 6 === 5) {
          sendImageLog(`⏳ [ImageFX] 로그인 대기 중... (${Math.round((i + 1) * 5 / 60)}분 경과)`);
        }
      }

      if (!loggedIn) {
        // 타임아웃 — visible 브라우저 닫기
        try { await browser.close(); } catch { /* 무시 */ }
        await adsPowerGet(`/api/v1/browser/stop?user_id=${userId}`).catch(() => {});
        return { success: false, message: 'Google 로그인 시간 초과 (5분). 다시 시도해주세요.' };
      }

      // ✅ 같은 계정인지 경고 (하지만 성공 처리)
      if (previousUserName && previousUserName === userName) {
        console.log(`[ImageFX] ⚠️ 이전과 같은 계정으로 다시 로그인: ${userName}`);
        sendImageLog(`⚠️ [ImageFX] 같은 계정(${userName})으로 다시 로그인했습니다.`);
      }

      // ✅ [2026-03-16 최적화] visible 브라우저를 그대로 캐시 (headless 재시작 제거)
      // AdsPower browser/start 호출 횟수를 최소화 — stop→start 사이클 제거
      cachedBrowser = browser;
      cachedPage = page;
      browserMode = 'adspower';

      console.log(`[ImageFX] ✅ Google 계정 변경 성공: ${userName} (AdsPower, visible 유지)`);
      sendImageLog(`✅ [ImageFX] Google 계정 변경 완료: ${userName}`);
      return { success: true, userName, message: `Google 계정 변경 완료: ${userName}` };

    } else {
      // Playwright 모드: 프로필 삭제했으므로 connectViaPlaywright가 자동으로 visible 로그인 유도
      await connectViaPlaywright();

      if (!cachedPage || !cachedToken) {
        return { success: false, message: 'Google 로그인에 실패했습니다. 다시 시도해주세요.' };
      }

      // ✅ [FIX-2] cachedToken(JWT)에서 유저 이름 추출 (evaluate 도메인 불일치 제거)
      // connectViaPlaywright() 완료 후 cachedPage가 ImageFX 도메인인 보장이 없으므로
      // page.evaluate로 /fx/api/auth/session 호출하면 도메인 불일치로 실패 가능
      // → 대신 이미 획득한 cachedToken(JWT)에서 직접 추출
      let userName = 'Google 사용자';
      try {
        const parts = cachedToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
          userName = payload.name || payload.email || 'Google 사용자';
        }
      } catch { /* JWT 파싱 실패 — 기본값 사용 */ }

      console.log(`[ImageFX] ✅ Google 계정 변경 성공: ${userName} (Playwright)`);
      sendImageLog(`✅ [ImageFX] Google 계정 변경 완료: ${userName}`);
      return { success: true, userName, message: `Google 계정 변경 완료: ${userName}` };
    }

  } catch (error: any) {
    console.error(`[ImageFX] ❌ Google 계정 변경 실패: ${error.message}`);
    sendImageLog(`❌ [ImageFX] 계정 변경 실패: ${error.message}`);
    return { success: false, message: `계정 변경 실패: ${error.message}` };
  }
}

/**
 * ✅ ImageFX 쿠키를 수동으로 설정 (하위 호환성 — 현재는 사용 안 함)
 */
export function setImageFxCookie(cookie: string): void {
  console.log(`[ImageFX] ℹ️ 쿠키 수동 설정은 v2.0에서 불필요합니다. 자동 브라우저 로그인을 사용합니다.`);
}

/**
 * ✅ [2026-03-15] ImageFX 배치 이미지 생성 (Gemini API 키 불필요!)
 * 
 * generateWithNanoBananaPro/generateWithDeepInfra와 동일한 인터페이스.
 * Gemini가 안 되는 사용자를 위한 완전 독립 파이프라인.
 * AdsPower + Google 로그인만으로 무료 이미지 생성.
 */
export async function generateWithImageFx(
  items: ImageRequestItem[],
  postTitle?: string,
  postId?: string,
  isFullAuto: boolean = false,
  isShoppingConnect?: boolean,
  stopCheck?: () => boolean,
  onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void
): Promise<GeneratedImage[]> {
  const mode = isFullAuto ? '풀오토' : '일반';
  console.log(`[ImageFX] ✨ 배치 이미지 생성 시작: ${items.length}개 (${mode} 모드)`);
  sendImageLog(`✨ [ImageFX] ${items.length}개 이미지 생성 시작 (Gemini 불필요, 완전 무료)`);

  const results: GeneratedImage[] = [];
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3; // 3연속 실패 시 중단

  for (let i = 0; i < items.length; i++) {
    // 중지 체크
    if (stopCheck && stopCheck()) {
      console.log(`[ImageFX] ⏹️ 중지 요청됨 — ${i + 1}번째부터 건너뜀`);
      sendImageLog(`⏹️ [ImageFX] 중지 요청됨`);
      break;
    }

    const item = items[i];
    const heading = item.heading || `이미지 ${i + 1}`;
    
    console.log(`[ImageFX] 🖼️ [${i + 1}/${items.length}] "${heading}" 생성 시작...`);
    sendImageLog(`🖼️ [ImageFX] "${heading}" 생성 중... (${i + 1}/${items.length})`);

    try {
      // 프롬프트 결정: 영어 프롬프트 우선 (ImageFX는 영어 최적화)
      const prompt = item.englishPrompt || item.prompt || heading;

      // config에서 비율 가져오기
      let imageRatio = (item as any).imageRatio || '1:1';
      try {
        const configModule = await import('../configManager.js');
        const config = await configModule.loadConfig();
        imageRatio = (item as any).imageRatio || (config as any).imageRatio || '1:1';
      } catch { /* config 로드 실패 시 기본값 사용 */ }

      // ImageFX로 이미지 1장 생성
      const fxResult = await generateSingleImageWithImageFx(prompt, imageRatio);

      if (fxResult && fxResult.buffer) {
        // 파일 저장
        // ✅ [2026-03-16 FIX] mimeType → 확장자 변환 (image/png → png, image/jpeg → jpg)
        const ext = fxResult.mimeType.includes('/') 
          ? fxResult.mimeType.split('/')[1].replace('jpeg', 'jpg')
          : fxResult.mimeType;
        const savedInfo = await writeImageFile(fxResult.buffer, ext, heading, postTitle, postId);
        
        const genImage: GeneratedImage = {
          heading,
          filePath: savedInfo.savedToLocal || savedInfo.filePath,
          // ✅ [2026-03-16 FIX] 잘린 base64 제거 → 전체 base64 폴백
          previewDataUrl: savedInfo.previewDataUrl || `data:${fxResult.mimeType};base64,${fxResult.buffer.toString('base64')}`,
          provider: 'imagefx' as any,
          ...(savedInfo.savedToLocal ? { savedToLocal: savedInfo.savedToLocal } : {}),
        };

        results.push(genImage);
        consecutiveFailures = 0; // 성공 시 연속 실패 카운터 초기화

        console.log(`[ImageFX] ✅ [${i + 1}/${items.length}] "${heading}" 생성 완료! (${Math.round(fxResult.buffer.length / 1024)}KB)`);
        sendImageLog(`✅ [ImageFX] "${heading}" 완료! (${i + 1}/${items.length})`);

        // 실시간 콜백
        if (onImageGenerated) {
          try { onImageGenerated(genImage, i, items.length); } catch { /* 콜백 오류 무시 */ }
        }
      } else {
        consecutiveFailures++;
        console.warn(`[ImageFX] ⚠️ [${i + 1}/${items.length}] "${heading}" 생성 실패 (null 반환)`);
        sendImageLog(`⚠️ [ImageFX] "${heading}" 생성 실패 — 건너뜀`);
      }
    } catch (error: any) {
      consecutiveFailures++;
      console.error(`[ImageFX] ❌ [${i + 1}/${items.length}] "${heading}" 예외: ${error.message}`);
      sendImageLog(`❌ [ImageFX] "${heading}" 오류: ${error.message}`);
    }

    // 연속 실패 시 중단
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`[ImageFX] ⛔ ${MAX_CONSECUTIVE_FAILURES}연속 실패 → 배치 중단 (Google 로그인 확인 필요)`);
      sendImageLog(`⛔ [ImageFX] 연속 실패 — Google 로그인 상태를 확인해주세요.`);
      break;
    }

    // 다음 이미지 전 짧은 대기 (429 방지)
    if (i < items.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  const successRate = items.length > 0 ? Math.round((results.length / items.length) * 100) : 0;
  console.log(`[ImageFX] 🎯 최종 결과: ${results.length}/${items.length}개 성공 (${successRate}%)`);
  sendImageLog(`🎯 [ImageFX] 완료: ${results.length}/${items.length}개 생성 (${successRate}%)`);

  return results;
}
