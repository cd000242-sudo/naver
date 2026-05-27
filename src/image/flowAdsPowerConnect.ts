/**
 * Flow + AdsPower 연동 — connectOverCDP 기반 BrowserContext 반환
 *
 * 검증된 ImageFX 패턴(v2.10.300)을 Flow에 복제:
 *  - fingerprint inject SKIP (AdsPower 자체 관리와 충돌 가능성)
 *  - preWarmGoogleSession만 적용 (google.com 1.5~3.5초 경유)
 *  - 차단 감지 시 즉시 throw → 호출자에서 patchright 폴백
 *
 * 차이점 vs ImageFX connectViaAdsPower:
 *  - OAuth 토큰 캐시 없음 — Flow는 page session 기반
 *  - URL: https://labs.google/fx/tools/flow
 *  - 로그인 폴링은 호출자(_ensureFlowBrowserPageInner)가 이미 처리하므로
 *    이 모듈은 BrowserContext 1회 반환만 담당
 */
import type { Browser, BrowserContext, Page } from 'playwright';

const ADSPOWER_BASE_URL = 'http://local.adspower.com:50325';
const FLOW_URL = 'https://labs.google/fx/tools/flow';
const API_TIMEOUT_MS = 8000;
const STOP_SETTLE_MS = 800;

function flowAdsLog(message: string): void {
  console.log(message);
  try {
    const { BrowserWindow } = require('electron');
    const wins = BrowserWindow.getAllWindows();
    if (wins[0]) wins[0].webContents.send('image-generation:log', message);
  } catch { /* renderer not ready */ }
}

/**
 * AdsPower Local API HTTP GET 헬퍼 (fetch 기반)
 *
 * @throws FLOW_ADSPOWER_TIMEOUT / FLOW_ADSPOWER_HTTP_{status}
 */
export async function adsPowerGet(urlPath: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(`${ADSPOWER_BASE_URL}${urlPath}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`FLOW_ADSPOWER_HTTP_${res.status}`);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`FLOW_ADSPOWER_TIMEOUT:AdsPower API ${API_TIMEOUT_MS / 1000}초 타임아웃`);
    }
    throw err;
  }
}

/**
 * google.com 경유 pre-warm — 자동화로 labs.google 직진 패턴 회피
 *
 * ImageFX v2.10.294 검증 패턴 동일.
 */
async function preWarmGoogle(page: Page): Promise<void> {
  try {
    await page.goto('https://www.google.com/', {
      waitUntil: 'load',
      timeout: 15000,
    });
    await new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 2000)));
    await page.mouse.wheel(0, 200 + Math.floor(Math.random() * 300));
    await new Promise((r) => setTimeout(r, 500 + Math.floor(Math.random() * 1000)));
  } catch {
    /* pre-warm 실패는 흐름 차단 안 함 */
  }
}

/**
 * Google 자동화 감지 차단 시그널 검출 (R2 완화)
 *
 * 알려진 패턴만 감지 — silent block(이미지 0개 응답)은 기존 Flow fallback이 처리.
 */
async function detectFlowBlocking(page: Page): Promise<{ blocked: boolean; reason?: string }> {
  try {
    const url = page.url();
    if (/recaptcha|automated|blocked|suspicious|sorry\.google/i.test(url)) {
      return { blocked: true, reason: `URL 차단 패턴: ${url.substring(0, 100)}` };
    }
    const blockedText = await page
      .evaluate(() => {
        const text = (document.body?.innerText || '').substring(0, 2000);
        return /비정상적인 트래픽|automated|unusual activity|reCAPTCHA|Try again later/i.test(text);
      })
      .catch(() => false);
    if (blockedText) {
      return { blocked: true, reason: 'Google 차단 페이지 감지 (body text)' };
    }
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}

/**
 * AdsPower /status 응답에서 첫 번째 프로필 user_id 추출
 *
 * @throws FLOW_ADSPOWER_NO_PROFILE
 */
async function pickFirstProfileId(): Promise<{ userId: string; name: string }> {
  const listResult = await adsPowerGet('/api/v1/user/list?page=1&page_size=10');
  if (!listResult.data?.list?.length) {
    throw new Error('FLOW_ADSPOWER_NO_PROFILE:AdsPower 프로필 없음');
  }
  const profile = listResult.data.list[0];
  return {
    userId: profile.user_id,
    name: profile.name || profile.serial_number || profile.user_id,
  };
}

/**
 * AdsPower 프로필 시작 + ws URL 반환
 *
 * @throws FLOW_ADSPOWER_OPEN_FAIL / FLOW_ADSPOWER_NO_WS
 */
async function startAdsPowerBrowser(userId: string, headless: boolean): Promise<string> {
  const headlessParam = headless ? '&headless=1' : '';
  const result = await adsPowerGet(`/api/v1/browser/start?user_id=${userId}${headlessParam}`);
  if (result.code !== 0) {
    throw new Error(`FLOW_ADSPOWER_OPEN_FAIL:${result.msg || 'unknown'}`);
  }
  const wsUrl = result.data?.ws?.puppeteer;
  if (!wsUrl) {
    throw new Error('FLOW_ADSPOWER_NO_WS:WebSocket URL 없음');
  }
  return wsUrl;
}

/**
 * Flow + AdsPower 연결 진입점.
 *
 * 호출자(`flowGenerator.ts::launchWithStealthFallback`)에서:
 *   - offScreen=true 첫 호출: 헤드리스로 시작 → 세션 확인 결과 호출자가 판단
 *   - offScreen=false 재호출: visible로 시작 → 사용자 로그인 후 호출자가 폴링
 *
 * @returns BrowserContext — 기존 patchright 경로와 동일한 반환 타입
 * @throws FLOW_ADSPOWER_* — 호출자에서 catch하여 patchright 폴백
 */
export async function connectFlowViaAdsPower(
  _profileDir: string,
  offScreen: boolean,
): Promise<BrowserContext> {
  await adsPowerGet('/status');

  const { userId, name } = await pickFirstProfileId();
  flowAdsLog(`📋 [Flow] AdsPower 프로필: ${name}`);

  // 이전 세션 잔여 정리 (idempotent — 이미 stopped면 그냥 OK 응답)
  await adsPowerGet(`/api/v1/browser/stop?user_id=${userId}`).catch(() => {});
  await new Promise((r) => setTimeout(r, STOP_SETTLE_MS));

  flowAdsLog(`🌐 [Flow] AdsPower 브라우저 시작 (${offScreen ? '숨김' : '표시'} 모드)`);
  const wsUrl = await startAdsPowerBrowser(userId, offScreen);

  const { chromium } = await import('playwright');
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(wsUrl);
  } catch (err) {
    await adsPowerGet(`/api/v1/browser/stop?user_id=${userId}`).catch(() => {});
    throw new Error(`FLOW_ADSPOWER_CDP_FAIL:${(err as Error).message.substring(0, 100)}`);
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    await browser.close().catch(() => {});
    await adsPowerGet(`/api/v1/browser/stop?user_id=${userId}`).catch(() => {});
    throw new Error('FLOW_ADSPOWER_NO_CONTEXT:컨텍스트 없음');
  }
  const context = contexts[0];

  // ctx.close() 시 AdsPower 프로필도 자동 stop 보장 (fire-and-forget)
  // 호출자가 ctx.close().catch(() => {}) 패턴을 쓰므로 close 자체는 빠르게 끝남.
  // stop은 백그라운드에서 진행되고, 다음 connectFlowViaAdsPower 진입부의
  // prophylactic stop + STOP_SETTLE_MS 대기가 race를 흡수.
  context.on('close', () => {
    void adsPowerGet(`/api/v1/browser/stop?user_id=${userId}`).catch(() => {});
  });

  const page = context.pages()[0] || (await context.newPage());

  // R3 fingerprint 충돌 회피: preWarm만 적용, fingerprint inject SKIP
  // (ImageFX v2.10.300 검증 패턴 — flowGenerator.ts STEALTH_ARGS도 미적용)
  await preWarmGoogle(page);

  try {
    await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    await context.close().catch(() => {});
    throw new Error(`FLOW_ADSPOWER_GOTO_FAIL:${(err as Error).message.substring(0, 100)}`);
  }
  await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});

  // R2 차단 감지 — 즉시 throw → 호출자 catch에서 markFlowAdsPowerSessionDisabled
  const blocked = await detectFlowBlocking(page);
  if (blocked.blocked) {
    await context.close().catch(() => {});
    throw new Error(`FLOW_ADSPOWER_BLOCKED:${blocked.reason}`);
  }

  flowAdsLog(`✅ [Flow] AdsPower 연결 성공 (${offScreen ? '숨김' : '표시'} 모드)`);
  return context;
}
