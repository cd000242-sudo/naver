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
// [SPEC-FREEZE-GUARD-001-P2 R4 / v2.10.263] Base64 디코딩 워커 분리 — ImageFX encodedImage 1MB+
import { decodeBase64Async } from '../main/utils/base64Async.js';
import { probeDuplicate, commitHashes, applyDiversityHint } from './imageHashUtils.js';
import { PromptBuilder } from './promptBuilder.js';
import { trackApiUsage } from '../apiUsageTracker.js';
// ✅ [v2.7.53] modelRegistry SSOT
import { IMAGEN_MODELS } from '../runtime/modelRegistry.js';
// ✅ [2026-03-17] ImageFX는 Google 서비스라 프록시 불필요 → import 제거
import type { Browser, Page, BrowserContext } from 'playwright';
// ✅ [SPEC-IMAGE-RECOVERY-001] 자동 복구 코디네이터
import { getRecoveryCoordinator } from './recovery/index.js';
import type { RecoveryDecision } from './recovery/index.js';

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

/**
 * [v2.10.153] cachedBrowser setter — 재할당 시 이전 인스턴스 close 보장.
 *
 * 배경: debugger agent 발견 — 17곳 cachedBrowser 재할당 중 *재시도 루프*에서
 * 이전 인스턴스가 살아있는 채로 덮어쓰면 chromium 좀비 발생.
 *
 * 해결: 모든 재할당을 setCachedBrowser(next)로 통일 → 이전 인스턴스 자동 close.
 * - next === cachedBrowser (같은 인스턴스): no-op (자기 자신 close 방지)
 * - next === null: cleanup 의도 — 이전 close 후 null 할당
 * - next !== cachedBrowser: 이전 close 후 새 할당
 *
 * 사용: `await setCachedBrowser(newBrowser);` (직접 할당 대신)
 */
async function setCachedBrowser(next: Browser | null): Promise<void> {
  // [v2.10.157] 이전 인스턴스 untrack
  if (cachedBrowser && cachedBrowser !== next) {
    try {
      const prevPid = (cachedBrowser as any)?.process?.()?.pid;
      if (prevPid) {
        const zr = require('../runtime/zombieRecovery.js');
        zr.untrackBrowserPid(prevPid);
      }
    } catch { /* ignore */ }
    try {
      await cachedBrowser.close();
    } catch { /* 이미 닫힘 또는 disconnect — 무시 */ }
  }
  cachedBrowser = next;

  // [v2.10.157] 새 browser zombieRecovery track
  if (next) {
    try {
      const newPid = (next as any)?.process?.()?.pid;
      if (newPid) {
        const zr = require('../runtime/zombieRecovery.js');
        const { app } = require('electron');
        zr.trackBrowserPid({
          pid: newPid,
          kind: 'playwright-chromium',
          cmdlineFingerprint: app.getPath('userData'),  // better-life-naver fingerprint
          label: 'imagefx',
        });
      }
    } catch { /* ignore */ }
  }
}
let _adsPowerUserEnabled: boolean = false; // ✅ [2026-03-16] 사용자 AdsPower 활성화 설정
// ✅ [SPEC-IMAGE-RECOVERY-001 R3] 세션 내 AdsPower 자동 OFF (실패 후 재시도 금지)
// 사용자 설정값(`_adsPowerUserEnabled`)은 변경하지 않으며, 다음 앱 재시작 시 재시도.
let _adsPowerSessionDisabled: boolean = false;

// ═══════════════════════════════════════════════════════════
// ▣ Human behavior simulation (v2.10.293) — 자동화 감지 회피
// ═══════════════════════════════════════════════════════════

/**
 * 사람 행동 시뮬레이션 — 마우스 움직임 + 스크롤 + 자연 대기.
 * Google labs의 봇 감지 신호 ↓ (즉시 액션은 봇 패턴).
 * 호출 비용: 약 1-3초.
 */
async function simulateHumanBehavior(page: Page): Promise<void> {
  try {
    // 1. viewport 크기 가져오기
    const vp = page.viewportSize?.() || { width: 1280, height: 800 };

    // 2. 마우스 1-3회 무작위 움직임 (베이지어 곡선처럼)
    const mouseSteps = 1 + Math.floor(Math.random() * 3);
    for (let s = 0; s < mouseSteps; s++) {
      const x = Math.floor(Math.random() * (vp.width - 100)) + 50;
      const y = Math.floor(Math.random() * (vp.height - 100)) + 50;
      await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 15) });
      await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 600)));
    }

    // 3. 스크롤 1-2회 (사람이 페이지 살피는 패턴)
    if (Math.random() > 0.3) {
      await page.mouse.wheel(0, 100 + Math.floor(Math.random() * 200));
      await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 800)));
      if (Math.random() > 0.5) {
        await page.mouse.wheel(0, -(50 + Math.floor(Math.random() * 100)));
        await new Promise((r) => setTimeout(r, 300 + Math.floor(Math.random() * 500)));
      }
    }
  } catch {
    // 실패해도 흐름 차단 X
  }
}

/**
 * 이미지 생성 요청 간 랜덤 대기 (5-15초).
 * 같은 분 내 빠른 연속 요청 = 봇 감지 트리거.
 * 첫 요청은 대기 X.
 */
async function humanLikeIntervalDelay(index: number): Promise<void> {
  if (index === 0) return; // 첫 이미지는 즉시
  const baseMs = 5000;
  const jitterMs = Math.floor(Math.random() * 10000); // 0~10s 랜덤
  const totalMs = baseMs + jitterMs;
  console.log(`[ImageFX] ⏳ 봇 감지 회피 대기 ${Math.round(totalMs / 1000)}초 (이미지 ${index + 1})`);
  await new Promise((r) => setTimeout(r, totalMs));
}

/**
 * (v2.10.294) WebGL/Canvas/Audio 핑거프린트 랜덤화.
 * Google이 가상 PC / 자동화 환경을 fingerprint로 감지하는 것을 우회.
 * stealth plugin이 잡지 못하는 영역을 보강.
 */
async function injectFingerprintRandomization(context: any): Promise<void> {
  try {
    await context.addInitScript(() => {
      // Canvas fingerprint 미세 노이즈
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement, ...args: any[]) {
        const ctx = this.getContext('2d');
        if (ctx) {
          // 1px 미세 노이즈 추가 (사람 눈엔 안 보임)
          const noise = Math.random() * 0.0001;
          ctx.fillStyle = `rgba(0,0,0,${noise})`;
          ctx.fillRect(0, 0, 1, 1);
        }
        return origToDataURL.apply(this, args as any);
      };

      // WebGL vendor/renderer 약간 변형 (실제 Chrome 값들 중 랜덤)
      const realVendors = ['Google Inc. (Intel)', 'Google Inc. (NVIDIA)', 'Google Inc. (AMD)'];
      const realRenderers = [
        'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      ];
      const vendor = realVendors[Math.floor(Math.random() * realVendors.length)];
      const renderer = realRenderers[Math.floor(Math.random() * realRenderers.length)];
      const origGetParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (this: WebGLRenderingContext, param: number) {
        // UNMASKED_VENDOR_WEBGL = 37445, UNMASKED_RENDERER_WEBGL = 37446
        if (param === 37445) return vendor;
        if (param === 37446) return renderer;
        return origGetParam.call(this, param);
      };
    });
  } catch { /* silent */ }
}

/**
 * (v2.10.294) Pre-warm 세션 — google.com 잠시 방문 후 labs.google.
 * "방금 막 자동화로 켜서 labs.google 직진" 패턴을 피함.
 * 실제 사용자는 다른 Google 서비스 쓰다가 labs로 이동하는 패턴.
 */
async function preWarmGoogleSession(page: Page): Promise<void> {
  try {
    console.log('[ImageFX] 🔥 Pre-warm: google.com 잠시 방문');
    await page.goto('https://www.google.com/', { waitUntil: 'load', timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 2000))); // 1.5-3.5s
    // 살짝 스크롤로 사람 패턴
    await page.mouse.wheel(0, 200 + Math.floor(Math.random() * 300));
    await new Promise((r) => setTimeout(r, 500 + Math.floor(Math.random() * 1000)));
  } catch {
    // 실패해도 흐름 차단 X
  }
}

// ═══════════════════════════════════════════════════════════
// ▣ Preflight self-diagnostic + telemetry (D + E + F)
// ═══════════════════════════════════════════════════════════

let _preflightRanThisSession = false;

/**
 * (E) Preflight: detect Chrome/Edge before launching so the user gets a
 * friendly "we found <browser>" message up front. Idempotent per session.
 */
function imageFxPreflight(): void {
  if (_preflightRanThisSession) return;
  _preflightRanThisSession = true;
  try {
    const browser = findSystemBrowserExecutable();
    if (browser) {
      const lower = browser.toLowerCase();
      const name =
        lower.includes('edge') ? 'Edge' :
        lower.includes('chrome') ? 'Chrome' :
        lower.includes('brave') ? 'Brave' : '브라우저';
      sendImageLog(`✅ [ImageFX] ${name} 감지됨. 안정적 모드로 시작합니다.`);
    } else {
      sendImageLog('⚠️ [ImageFX] Chrome/Edge가 감지되지 않아 Playwright Chromium 자동 설치를 시도합니다. (1~2분 소요 가능)');
    }
    if (_adsPowerUserEnabled) {
      sendImageLog('ℹ️ [ImageFX] AdsPower 사용 ON 설정. 실패 시 자동으로 자체 브라우저로 폴백됩니다.');
    }
  } catch { /* silent */ }
}

/**
 * (F) Telemetry: fire-and-forget POST to the GAS backend on failure.
 * Never blocks or throws — pure observability.
 */
const IMAGEFX_TELEMETRY_URL =
  'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

function sendImageFxTelemetry(opts: {
  errorMessage: string;
  errorCode?: string;
  mode?: string;
  stage?: string;
}): void {
  try {
    const body = JSON.stringify({
      action: 'imagefx-telemetry',
      timestamp: new Date().toISOString(),
      errorMessage: opts.errorMessage.slice(0, 500),
      errorCode: opts.errorCode || '',
      mode: opts.mode || '',
      stage: opts.stage || '',
      platform: process.platform || '',
      adsPowerEnabled: _adsPowerUserEnabled,
    });
    fetch(IMAGEFX_TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
    }).catch(() => { /* silent */ });
  } catch { /* silent */ }
}

/** ✅ [2026-03-16] AdsPower 사용 여부 설정 (렌더러에서 IPC로 호출) */
export function setImageFxAdsPowerEnabled(enabled: boolean): void {
  _adsPowerUserEnabled = enabled;
  console.log(`[ImageFX] 🌐 AdsPower ${enabled ? '✅ 활성' : '❌ 비활성'} (사용자 설정)`);
}

/** ✅ [2026-03-16] AdsPower 활성화 상태 조회 */
export function isImageFxAdsPowerEnabled(): boolean {
  return _adsPowerUserEnabled;
}

// ✅ [SPEC-IMAGE-RECOVERY-001] 에러 메시지에서 코드/상태 추출
function extractImageFxErrorCode(error: unknown): string | undefined {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  // IMAGEFX_AUTH_EXPIRED:..., IMAGEFX_FORBIDDEN:..., 등
  const m = msg.match(/^(IMAGEFX_[A-Z_]+)(?::|$)/);
  if (m) return m[1];
  if (/HTTP_401/i.test(msg)) return 'IMAGEFX_AUTH_EXPIRED';
  if (/HTTP_403/i.test(msg)) return 'IMAGEFX_FORBIDDEN';
  if (/HTTP_429/i.test(msg)) return 'IMAGEFX_QUOTA_EXCEEDED';
  return undefined;
}

function extractHttpStatus(error: unknown): number | undefined {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const m = msg.match(/HTTP_(\d{3})/);
  if (m) return Number(m[1]);
  return undefined;
}

function isBlockFatal(decision: { modalCode?: string }): boolean {
  // C6 (Phase 6): B1(IP 차단), B3(시간당 한도), B4(브라우저 미설치), B7(회복 불가능) 즉시 중단
  return decision.modalCode === 'B1'
      || decision.modalCode === 'B3'
      || decision.modalCode === 'B4'
      || decision.modalCode === 'B7';
}

async function sendBlockingModalRequest(
  decision: { action: 'block'; modalCode: string; reason: string; errorCode?: string },
  _error: unknown,
): Promise<void> {
  // C2: silent-catch 묵살 차단 — 모든 catch에 명시 로그 (review 권고)
  try {
    const { broadcastModalRequest } = require('../main/ipc/recoveryHandlers');
    broadcastModalRequest({
      code: decision.modalCode,
      reason: decision.reason,
      errorCode: decision.errorCode,
    });
  } catch (primaryErr) {
    console.warn('[Recovery] broadcastModalRequest 실패 — direct send 폴백 시도:', (primaryErr as Error)?.message);
    try {
      const { BrowserWindow } = require('electron');
      const wins = BrowserWindow.getAllWindows();
      if (wins[0]) {
        wins[0].webContents.send('recovery:show-modal', {
          code: decision.modalCode,
          reason: decision.reason,
          errorCode: decision.errorCode,
        });
      } else {
        console.warn('[Recovery] BrowserWindow 없음 — 모달 표시 불가, 사용자에게 안 보임');
      }
    } catch (fallbackErr) {
      console.warn('[Recovery] direct send 폴백도 실패:', (fallbackErr as Error)?.message);
    }
  }
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

  // ── 1.5. ✅ [2026-03-20] AI 브랜드명 완전 제거 — 어떤 위치든 Perplexity/GPT/Claude 등 제거 ──
  // ⚠️ 핵심: Perplexity Sonar가 자기 이름을 문장 중간에 삽입 → Imagen이 로고를 렌더링
  cleaned = cleaned
    .replace(/\bPerplexity\b/gi, '')
    .replace(/\bChatGPT\b/gi, '')
    .replace(/\bOpenAI\b/gi, '')
    .replace(/\bAnthropic\b/gi, '')
    .replace(/\bClaude\b/gi, '')
    .replace(/\bGemini\b/gi, '')
    .replace(/\bSonar\b/gi, '')
    .replace(/\bGPT-?\d[\w.-]*/gi, '')
    .replace(/\bpowered by [\w.]+/gi, '');

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
 * ✅ [2026-03-18] Playwright 브라우저 설치 경로 (쓰기 가능한 디렉토리)
 * 
 * 기존: PLAYWRIGHT_BROWSERS_PATH: '0' → 패키지 옆(ASAR) → 읽기전용 가능
 * 수정: app.getPath('userData')/pw-browsers → 항상 쓰기 가능
 */
function getPlaywrightBrowsersDir(): string {
  try {
    const { app } = require('electron');
    const path = require('path');
    return path.join(app.getPath('userData'), 'pw-browsers');
  } catch {
    const path = require('path');
    const os = require('os');
    return path.join(os.homedir(), 'naver-blog-automation', 'pw-browsers');
  }
}

/**
 * ✅ [2026-03-18] Windows 시스템 브라우저 자동 탐색 (100% 커버리지)
 * 
 * 4단계로 시스템에 설치된 Chromium 기반 브라우저를 찾습니다:
 * 1. 직접 경로 탐색 — 가장 빠름 (8개 경로)
 * 2. Windows 레지스트리 조회 — 비표준 설치 경로 대응
 * 3. PATH 검색 — `where` 명령어
 * 4. 추가 브라우저 — Edge Beta/Dev/Canary, Chrome Beta/Canary, Brave
 * 
 * @returns 발견된 브라우저 실행 파일의 절대 경로, 없으면 null
 */
function findSystemBrowserExecutable(): string | null {
  const fs = require('fs');
  const { execSync } = require('child_process');

  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const userProfile = process.env.USERPROFILE || '';

  // ── 1단계: 직접 경로 탐색 (가장 빠름) ──
  const directPaths = [
    // Edge (Windows 10/11 기본)
    `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${localAppData}\\Microsoft\\Edge\\Application\\msedge.exe`,
    // Chrome
    `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
    // Chrome per-user install
    `${userProfile}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(p => p && !p.startsWith('\\') && p.length > 10);

  for (const p of directPaths) {
    if (fs.existsSync(p)) {
      console.log(`[ImageFX] 🔍 브라우저 발견 (직접 경로): ${p}`);
      return p;
    }
  }

  // ── 2단계: Windows 레지스트리 조회 ──
  for (const exeName of ['msedge.exe', 'chrome.exe']) {
    for (const hive of ['HKLM', 'HKCU']) {
      try {
        const regOutput = execSync(
          `reg query "${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}" /ve`,
          { encoding: 'utf-8', timeout: 5000, stdio: 'pipe', windowsHide: true }
        );
        const match = regOutput.match(/REG_SZ\s+(.+)/i);
        if (match?.[1]) {
          const regPath = match[1].trim().replace(/^"|"$/g, '');
          if (regPath && fs.existsSync(regPath)) {
            console.log(`[ImageFX] 🔍 브라우저 발견 (레지스트리 ${hive}): ${regPath}`);
            return regPath;
          }
        }
      } catch { /* 레지스트리 키 없음 */ }
    }
  }

  // ── 3단계: PATH 검색 (where 명령어) ──
  for (const exeName of ['msedge', 'chrome']) {
    try {
      const whereOutput = execSync(`where ${exeName}`, {
        encoding: 'utf-8', timeout: 5000, stdio: 'pipe', windowsHide: true,
      });
      const firstLine = whereOutput.trim().split('\n')[0]?.trim();
      if (firstLine && fs.existsSync(firstLine)) {
        console.log(`[ImageFX] 🔍 브라우저 발견 (where): ${firstLine}`);
        return firstLine;
      }
    } catch { /* where 실패 */ }
  }

  // ── 4단계: 추가 브라우저 (Beta, Canary, Brave, Vivaldi) ──
  const additionalPaths = [
    `${programFilesX86}\\Microsoft\\Edge Beta\\Application\\msedge.exe`,
    `${programFilesX86}\\Microsoft\\Edge Dev\\Application\\msedge.exe`,
    `${localAppData}\\Microsoft\\Edge SxS\\Application\\msedge.exe`,
    `${programFiles}\\Google\\Chrome Beta\\Application\\chrome.exe`,
    `${localAppData}\\Google\\Chrome SxS\\Application\\chrome.exe`,
    `${programFiles}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    `${programFilesX86}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    `${localAppData}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    `${localAppData}\\Vivaldi\\Application\\vivaldi.exe`,
  ].filter(p => p && !p.startsWith('\\') && p.length > 10);

  for (const p of additionalPaths) {
    if (fs.existsSync(p)) {
      console.log(`[ImageFX] 🔍 브라우저 발견 (추가 경로): ${p}`);
      return p;
    }
  }

  console.log('[ImageFX] ❌ 시스템 Chromium 기반 브라우저를 찾을 수 없습니다.');
  return null;
}

/**
 * ✅ [2026-03-18] Playwright Chromium 자동 설치 (패키징된 Electron 앱 호환)
 * 
 * 근본 문제 해결:
 * - 기존: `node "cli.js"` → 패키징된 앱에서 `node` 없어 100% 실패
 * - 기존: `PLAYWRIGHT_BROWSERS_PATH: '0'` → ASAR 옆 읽기전용 → 실패
 * - 수정: `process.execPath` (Electron 내장 Node) + 쓰기 가능 디렉토리
 */
async function ensurePlaywrightBrowserInstalled(): Promise<void> {
  const browsersDir = getPlaywrightBrowsersDir();

  // ── 0. 이미 설치되어 있는지 확인 ──
  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH = browsersDir;
    const { chromium } = await import('playwright');
    const execPath = chromium.executablePath();
    const fs = require('fs');
    if (execPath && fs.existsSync(execPath)) {
      const stat = fs.statSync(execPath);
      if (stat.size > 1_000_000) {
        return; // 이미 정상 설치됨
      }
      console.warn(`[ImageFX] ⚠️ Chromium 크기 이상 (${stat.size}B) → 재설치`);
    }
  } catch { /* 설치 안 됨 */ }

  console.log('[ImageFX] 📦 Playwright Chromium 자동 설치 시작...');
  sendImageLog('📦 [ImageFX] Chromium 브라우저를 자동 설치합니다. 잠시만 기다려주세요 (1~2분)...');

  const { execSync } = require('child_process');
  const path = require('path');
  const fs = require('fs');

  if (!fs.existsSync(browsersDir)) {
    fs.mkdirSync(browsersDir, { recursive: true });
  }

  const installEnv = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir };
  // ✅ [2026-03-18] ELECTRON_RUN_AS_NODE=1: 패키징된 Electron 바이너리를 Node.js로 동작시킴
  // 이 ENV 없이 process.execPath로 cli.js 실행하면 전체 앱이 재시작되는 치명적 버그 발생
  const electronNodeEnv = { ...installEnv, ELECTRON_RUN_AS_NODE: '1' };
  let installed = false;

  // ── 방법 1: process.execPath + playwright-core/cli.js (패키징된 앱에서도 동작) ──
  if (!installed) {
    try {
      const pkgPath = require.resolve('playwright-core/package.json');
      const cliPath = path.join(path.dirname(pkgPath), 'cli.js');
      if (fs.existsSync(cliPath)) {
        execSync(`"${process.execPath}" "${cliPath}" install chromium`, {
          stdio: 'pipe', timeout: 300000, env: electronNodeEnv,
        });
        console.log('[ImageFX] ✅ Chromium 설치 완료! (process.execPath + playwright-core/cli.js)');
        sendImageLog('✅ [ImageFX] Chromium 브라우저 설치 완료!');
        installed = true;
      }
    } catch (e: any) {
      console.warn(`[ImageFX] ⚠️ 방법1 실패: ${(e.message || '').substring(0, 100)}`);
    }
  }

  // ── 방법 2: process.execPath + playwright/cli.js ──
  if (!installed) {
    try {
      const pkgPath = require.resolve('playwright/package.json');
      const cliPath = path.join(path.dirname(pkgPath), 'cli.js');
      if (fs.existsSync(cliPath)) {
        execSync(`"${process.execPath}" "${cliPath}" install chromium`, {
          stdio: 'pipe', timeout: 300000, env: electronNodeEnv,
        });
        console.log('[ImageFX] ✅ Chromium 설치 완료! (process.execPath + playwright/cli.js)');
        sendImageLog('✅ [ImageFX] Chromium 브라우저 설치 완료!');
        installed = true;
      }
    } catch (e: any) {
      console.warn(`[ImageFX] ⚠️ 방법2 실패: ${(e.message || '').substring(0, 100)}`);
    }
  }

  // ── 방법 3: 시스템 node + cli.js (개발 환경) ──
  if (!installed) {
    try {
      const pkgPath = require.resolve('playwright-core/package.json');
      const cliPath = path.join(path.dirname(pkgPath), 'cli.js');
      if (fs.existsSync(cliPath)) {
        execSync(`node "${cliPath}" install chromium`, {
          stdio: 'pipe', timeout: 300000, env: installEnv,
        });
        console.log('[ImageFX] ✅ Chromium 설치 완료! (node + cli.js)');
        sendImageLog('✅ [ImageFX] Chromium 브라우저 설치 완료!');
        installed = true;
      }
    } catch (e: any) {
      console.warn(`[ImageFX] ⚠️ 방법3 실패: ${(e.message || '').substring(0, 100)}`);
    }
  }

  // ── 방법 4: npx (개발 환경 최후 폴백) ──
  if (!installed) {
    try {
      execSync('npx playwright install chromium', {
        stdio: 'pipe', timeout: 300000, env: installEnv,
      });
      console.log('[ImageFX] ✅ Chromium 설치 완료! (npx)');
      sendImageLog('✅ [ImageFX] Chromium 브라우저 설치 완료!');
      installed = true;
    } catch (e: any) {
      console.warn(`[ImageFX] ⚠️ 방법4 실패: ${(e.message || '').substring(0, 100)}`);
    }
  }

  if (!installed) {
    console.error('[ImageFX] ❌ Chromium 자동 설치 모든 방법 실패');
    sendImageLog('❌ [ImageFX] Chromium 자동 설치 실패. Chrome 또는 Edge가 필요합니다.');
    throw new Error('Playwright Chromium 자동 설치 실패. Chrome 또는 Edge를 설치해주세요.');
  }
}

/**
 * ✅ AdsPower API HTTP GET 헬퍼
 * adsPowerManager.ts와 동일하게 fetch 기반 사용 (http.get는 DNS/연결 문제 발생 가능)
 */
async function adsPowerGet(urlPath: string): Promise<any> {
  const controller = new AbortController();
  // ✅ 5s → 8s — 느린 PC에서 AdsPower API 응답 지연 시 false-fail 방지
  const timer = setTimeout(() => controller.abort(), 8000);

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
      throw new Error('AdsPower API 타임아웃 (8초). AdsPower 앱이 실행 중이지 않거나 응답이 느린 것 같습니다.');
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
  await setCachedBrowser(await chromium.connectOverCDP(wsUrl));
  let context: BrowserContext = cachedBrowser!.contexts()[0];
  if (!context) throw new Error('AdsPower 컨텍스트 없음');

  cachedPage = context.pages()[0] || await context.newPage();
  browserMode = 'adspower';

  // labs.google/fx 접속 + 세션 확인
  await cachedPage.goto('https://labs.google/fx/tools/image-fx', {
    waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
    timeout: 90000,
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
    cachedTokenExpiry = new Date(session.expires || Date.now() + 240 * 60 * 1000);

    return cachedPage;
  }

  // ── 2단계: 로그인 필요 → visible로 재시작 ──
  console.log('[ImageFX] 🔐 Google 로그인 필요 → AdsPower 브라우저 표시');
  sendImageLog('🔐 [ImageFX] Google 로그인이 필요합니다. AdsPower 브라우저가 열립니다...');

  // headless 브라우저 닫기
  try {
    if (cachedBrowser) await cachedBrowser.close();
  } catch { /* 무시 */ }
  await setCachedBrowser(null);
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

  await setCachedBrowser(await chromium.connectOverCDP(wsUrl));
  context = cachedBrowser!.contexts()[0];
  if (!context) throw new Error('AdsPower 컨텍스트 없음');

  cachedPage = context.pages()[0] || await context.newPage();
  browserMode = 'adspower';

  await cachedPage.goto('https://labs.google/fx/tools/image-fx', {
    waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
    timeout: 90000,
  });

  sendImageLog('🔐 [ImageFX] AdsPower 브라우저에서 Google 계정으로 로그인해주세요. (최대 15분 대기) — 2단계 인증·동의 화면도 천천히 진행 가능합니다.');

  // 로그인 대기 (5초 간격으로 180회 = 최대 15분)
  let loggedIn = false;
  for (let i = 0; i < 180; i++) {
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
      cachedTokenExpiry = new Date(checkSession.expires || Date.now() + 240 * 60 * 1000);
      break;
    }

    if (i % 6 === 5) {
      sendImageLog(`⏳ [ImageFX] Google 로그인 대기 중... (${Math.round((i + 1) * 5 / 60)}분 경과)`);
    }
  }

  if (!loggedIn) {
    // 로그인 실패 → 브라우저 닫기
    try { if (cachedBrowser) await cachedBrowser.close(); } catch { /* 무시 */ }
    await setCachedBrowser(null);
    cachedPage = null;
    await adsPowerGet(`/api/v1/browser/stop?user_id=${userId}`).catch(() => {});
    throw new Error('Google 로그인 시간 초과 (15분). AdsPower 브라우저에서 Google 계정 로그인을 완료한 후 다시 시도해주세요.');
  }

  // ✅ [2026-03-16] 로그인 성공 → visible 닫고 headless로 재시작 (화면에서 숨김)
  console.log('[ImageFX] 🔄 AdsPower 로그인 완료 → headless 모드로 전환...');
  sendImageLog('🔄 [ImageFX] 로그인 완료! 숨김 모드로 전환 중...');
  try { if (cachedBrowser) await cachedBrowser.close(); } catch { /* 무시 */ }
  await setCachedBrowser(null);
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
  await setCachedBrowser(await chromiumForHeadless.connectOverCDP(headlessWsUrl));
  const headlessCtx = cachedBrowser!.contexts()[0];
  if (!headlessCtx) throw new Error('AdsPower headless 컨텍스트 없음');
  cachedPage = headlessCtx.pages()[0] || await headlessCtx.newPage();
  browserMode = 'adspower';

  await cachedPage.goto('https://labs.google/fx/tools/image-fx', {
    waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
    timeout: 90000,
  });
  await new Promise(resolve => setTimeout(resolve, 1500));

  console.log('[ImageFX] ✅ AdsPower headless 전환 완료 — 브라우저 숨김');
  sendImageLog('✅ [ImageFX] 로그인 완료! 이미지 생성 준비됨 (숨김 모드)');

  return cachedPage;
}

/**
 * ✅ [2026-03-18] 시스템 브라우저 폴백 전략 v3 — 100% 커버리지
 * 
 * 4단계 폴백으로 어떤 환경에서든 브라우저를 실행합니다:
 * 1. channel: 'chrome' — Playwright 내장 Chrome 탐색
 * 2. channel: 'msedge' — Playwright 내장 Edge 탐색
 * 3. findSystemBrowserExecutable() → executablePath — 직접경로+레지스트리+where+추가브라우저
 * 4. ensurePlaywrightBrowserInstalled() → Playwright Chromium 자동 설치
 * 
 * 모든 단계의 에러를 수집하여 최종 에러 메시지에 포함합니다.
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
  const errorLog: string[] = [];

  // ── 방법 1: 시스템 Chrome (channel) ──
  try {
    console.log('[ImageFX] 🔍 [1/4] 시스템 Chrome 탐색 (channel)...');
    const ctx = await chromium.launchPersistentContext(profileDir, {
      ...options,
      channel: 'chrome',
    });
    console.log('[ImageFX] ✅ 시스템 Chrome 사용 (channel)');
    sendImageLog('✅ [ImageFX] Chrome 브라우저 연결 성공');
    return ctx;
  } catch (err: any) {
    const msg = err.message?.substring(0, 120) || 'unknown';
    errorLog.push(`Chrome channel: ${msg}`);
    console.log(`[ImageFX] ⚠️ Chrome channel 실패: ${msg}`);
  }

  // ── 방법 2: 시스템 Edge (channel) ──
  try {
    console.log('[ImageFX] 🔍 [2/4] 시스템 Edge 탐색 (channel)...');
    const ctx = await chromium.launchPersistentContext(profileDir, {
      ...options,
      channel: 'msedge',
    });
    console.log('[ImageFX] ✅ 시스템 Edge 사용 (channel)');
    sendImageLog('✅ [ImageFX] Edge 브라우저 연결 성공');
    return ctx;
  } catch (err: any) {
    const msg = err.message?.substring(0, 120) || 'unknown';
    errorLog.push(`Edge channel: ${msg}`);
    console.log(`[ImageFX] ⚠️ Edge channel 실패: ${msg}`);
  }

  // ── 방법 3: 시스템 브라우저 자동 탐색 (직접 경로 + 레지스트리 + where + 추가 브라우저) ──
  console.log('[ImageFX] 🔍 [3/4] 시스템 브라우저 자동 탐색 (직접 경로 + 레지스트리 + where)...');
  const systemBrowserPath = findSystemBrowserExecutable();
  if (systemBrowserPath) {
    try {
      const ctx = await chromium.launchPersistentContext(profileDir, {
        ...options,
        executablePath: systemBrowserPath,
      });
      const browserName = systemBrowserPath.toLowerCase().includes('edge') ? 'Edge' :
                          systemBrowserPath.toLowerCase().includes('chrome') ? 'Chrome' :
                          systemBrowserPath.toLowerCase().includes('brave') ? 'Brave' : '브라우저';
      console.log(`[ImageFX] ✅ ${browserName} 사용 (executablePath: ${systemBrowserPath})`);
      sendImageLog(`✅ [ImageFX] ${browserName} 브라우저 연결 성공`);
      return ctx;
    } catch (err: any) {
      const msg = err.message?.substring(0, 120) || 'unknown';
      errorLog.push(`직접 경로 (${systemBrowserPath}): ${msg}`);
      console.log(`[ImageFX] ⚠️ 직접 경로 실패: ${msg}`);
    }
  } else {
    errorLog.push('시스템 브라우저 자동 탐색: Chrome, Edge, Brave 등을 찾을 수 없음');
  }

  // ── 방법 4: Playwright Chromium 자동 설치 ──
  try {
    console.log('[ImageFX] 🔍 [4/4] Playwright Chromium 자동 설치 시도...');
    process.env.PLAYWRIGHT_BROWSERS_PATH = getPlaywrightBrowsersDir();
    await ensurePlaywrightBrowserInstalled();
    const ctx = await chromium.launchPersistentContext(profileDir, options);
    console.log('[ImageFX] ✅ Playwright 내장 Chromium 사용');
    sendImageLog('✅ [ImageFX] Playwright Chromium 설치 및 연결 성공');
    return ctx;
  } catch (err: any) {
    const msg = err.message?.substring(0, 120) || 'unknown';
    errorLog.push(`Playwright Chromium: ${msg}`);
    console.log(`[ImageFX] ⚠️ Playwright Chromium 실패: ${msg}`);
  }

  // ── 모든 방법 실패 — 상세 에러 + 다운로드 링크 ──
  const errorDetail = errorLog.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
  console.error(`[ImageFX] ❌ 모든 브라우저 실행 방법 실패:\n${errorDetail}`);

  throw new Error(
    '브라우저를 찾을 수 없습니다.\n\n' +
    'Chrome 또는 Edge 브라우저를 설치해주세요:\n' +
    '• Chrome: https://www.google.com/chrome/\n' +
    '• Edge: https://www.microsoft.com/edge/\n\n' +
    '설치 후 프로그램을 재시작하면 자동으로 연결됩니다.\n\n' +
    `실패 상세 (${errorLog.length}건):\n${errorDetail}`
  );
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
/**
 * labs.google overlay iframe(changelog/whats_new/banner/survey) 영구 차단.
 * Flow와 동일 패턴 — context.addInitScript로 MutationObserver 주입.
 */
async function injectImageFxAntiModalObserver(context: any): Promise<void> {
  try {
    await context.addInitScript(() => {
      if ((window as any).__imagefxAntiModalInstalled) return;
      (window as any).__imagefxAntiModalInstalled = true;
      const URL_RE = /changelogs?|whats[_-]?new|banner|survey|consent|onboarding|promo/i;
      const TEXT_RE = /What['']?s\s*new|새로운\s*기능|변경\s*사항|tour|guide\s*me|onboarding|시작하기|소개/i;
      const SAFE_RE = /sign\s*in|로그인|email|password|비밀번호|prompt|프롬프트/i;
      const markHide = (el: HTMLElement) => {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        el.setAttribute('data-imagefx-hidden', '1');
      };
      const climbHide = (s: HTMLElement) => {
        let p: HTMLElement | null = s;
        let lvl = 0;
        while (p && lvl < 8) {
          try {
            const cs = window.getComputedStyle(p);
            const z = parseInt(cs.zIndex || '0', 10) || 0;
            const pos = cs.position === 'fixed' || cs.position === 'absolute';
            const ov = /overlay|modal|popup|backdrop|dialog|sheet/i.test(p.className || '');
            if (pos && (z >= 100 || ov)) { markHide(p); return; }
          } catch { /* ignore */ }
          p = p.parentElement; lvl++;
        }
        markHide(s);
      };
      const isOverlayIframe = (i: HTMLIFrameElement) => {
        const src = i.src || i.getAttribute('src') || '';
        if (URL_RE.test(src)) return true;
        const sd = i.getAttribute('srcdoc') || '';
        return !!(sd && TEXT_RE.test(sd));
      };
      const isOverlayDialog = (el: Element) => {
        if (el.getAttribute('data-imagefx-hidden') === '1') return false;
        const role = el.getAttribute('role') || '';
        const isDlg = role === 'dialog' || role === 'alertdialog' || el.tagName === 'DIALOG';
        const hasPop = (el as HTMLElement).getAttribute?.('popover') !== null;
        if (!isDlg && !hasPop) return false;
        const txt = (el.textContent || '').slice(0, 500);
        if (SAFE_RE.test(txt)) return false;
        if (TEXT_RE.test(txt)) return true;
        return /changelog|whats[_-]?new|onboarding|tour/i.test(el.className || '');
      };
      const deepQ = (root: ParentNode | ShadowRoot, sel: string, out: Element[]) => {
        try {
          (root.querySelectorAll(sel) as NodeListOf<Element>).forEach((e) => out.push(e));
          (root.querySelectorAll('*') as NodeListOf<Element>).forEach((e) => {
            const sr = (e as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
            if (sr) deepQ(sr, sel, out);
          });
        } catch { /* ignore */ }
      };
      const scan = (root: ParentNode) => {
        const ifr: Element[] = []; const dlg: Element[] = [];
        deepQ(root, 'iframe', ifr);
        deepQ(root, '[role="dialog"], [role="alertdialog"], dialog, [popover]', dlg);
        ifr.forEach((i) => { if (isOverlayIframe(i as HTMLIFrameElement)) climbHide(i as HTMLElement); });
        dlg.forEach((d) => { if (isOverlayDialog(d)) climbHide(d as HTMLElement); });
      };
      const start = () => {
        scan(document);
        new MutationObserver((muts) => {
          for (const m of muts) {
            if (m.type === 'attributes') {
              const t = m.target as Element;
              if (t.tagName === 'IFRAME' && isOverlayIframe(t as HTMLIFrameElement)) climbHide(t as HTMLElement);
              else if (t.matches?.('[role="dialog"], [role="alertdialog"], dialog, [popover]') && isOverlayDialog(t)) climbHide(t as HTMLElement);
              continue;
            }
            m.addedNodes.forEach((n) => {
              if (n.nodeType !== 1) return;
              const el = n as Element;
              if (el.tagName === 'IFRAME') { if (isOverlayIframe(el as HTMLIFrameElement)) climbHide(el as HTMLElement); }
              else if (el.matches?.('[role="dialog"], [role="alertdialog"], dialog, [popover]')) { if (isOverlayDialog(el)) climbHide(el as HTMLElement); }
              else { scan(el); }
            });
          }
        }).observe(document.documentElement, {
          childList: true, subtree: true, attributes: true,
          attributeFilter: ['src', 'srcdoc', 'role', 'class', 'open', 'style'],
        });
        // style 재설정 우회 — 1초마다 hidden marker 검사
        setInterval(() => {
          try {
            document.querySelectorAll<HTMLElement>('[data-imagefx-hidden="1"]').forEach((el) => {
              const cs = window.getComputedStyle(el);
              if (cs.display !== 'none') el.style.setProperty('display', 'none', 'important');
              if (cs.pointerEvents !== 'none') el.style.setProperty('pointer-events', 'none', 'important');
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
    console.warn('[ImageFX] anti-modal observer 주입 실패 (무시):', (err as Error)?.message?.substring(0, 80));
  }
}

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
  // ✅ [v2.10.290] headless: true → false — 사용자 보고: 숨김 모드일 때 Google 자동화 감지 ↑.
  //   수동으로 사이트 띄워놓고 돌리면 정상 작동 → visible 모드가 자동화 감지 신호 ↓.
  console.log('[ImageFX] 🌐 자체 브라우저 실행 (visible 모드 — 자동화 감지 회피)...');
  sendImageLog('🌐 [ImageFX] 자체 브라우저 준비 중... (창이 열립니다)');

  // ✅ [2026-03-17] ImageFX는 Google 서비스(labs.google)라 프록시 불필요 → 직접 연결

  const launchOptions = {
    headless: false as boolean, // ✅ [v2.10.290] visible 강제 — 자동화 감지 회피
    args: [
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
    ],
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--enable-automation'],
  };

  let context = await launchWithSystemBrowserFallback(chromium, profileDir, launchOptions);

  // labs.google overlay iframe 영구 차단 (changelog/whats_new/banner) — Flow와 동일 패턴
  await injectImageFxAntiModalObserver(context);

  // ✅ [v2.10.294] WebGL/Canvas 핑거프린트 랜덤화 — Google 가상 PC 의심 회피
  await injectFingerprintRandomization(context);

  let page = context.pages()[0] || await context.newPage();

  // ✅ [v2.10.294] Pre-warm: google.com 잠시 방문 후 labs.google 진입
  //   "방금 자동화로 켜서 labs 직진" 패턴 회피 — 실제 사용자는 다른 Google 서비스 거쳐서 이동
  await preWarmGoogleSession(page);

  // labs.google/fx 접속 + 세션 확인
  await page.goto('https://labs.google/fx/tools/image-fx', {
    waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
    timeout: 90000,
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

    await setCachedBrowser(context.browser() as any);
    cachedPage = page;
    browserMode = 'playwright';
    (cachedPage as any).__persistentContext = context;

    // 토큰도 캐싱
    cachedToken = session.access_token;
    cachedTokenExpiry = new Date(session.expires || Date.now() + 240 * 60 * 1000);

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
  await injectImageFxAntiModalObserver(context);

  page = context.pages()[0] || await context.newPage();
  await page.goto('https://labs.google/fx/tools/image-fx', {
    waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
    timeout: 90000,
  });

  sendImageLog('🔐 [ImageFX] 브라우저에서 Google 계정으로 로그인해주세요. (최대 15분 대기) — 2단계 인증·동의 화면도 천천히 진행 가능합니다.');

  // 로그인 대기 (5초 간격으로 180회 = 최대 15분)
  // ✅ 사용자 체감 성공률 ↑ — 2FA / OAuth 동의 / 비밀번호 입력 여유
  let loggedIn = false;
  for (let i = 0; i < 180; i++) {
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
      cachedTokenExpiry = new Date(checkSession.expires || Date.now() + 240 * 60 * 1000);
      break;
    }

    if (i % 6 === 5) {
      sendImageLog(`⏳ [ImageFX] Google 로그인 대기 중... (${Math.round((i + 1) * 5 / 60)}분 경과)`);
    }
  }

  if (!loggedIn) {
    await context.close();
    throw new Error('Google 로그인 시간 초과 (15분). 브라우저에서 Google 계정 로그인을 완료한 후 다시 시도해주세요. (계정 선택 → 비밀번호 → 2단계 인증 → 동의 모두 끝나야 합니다.)');
  }

  // ✅ [v2.10.290] 로그인 후 visible 유지 — headless 재전환 제거.
  //   사용자 보고: headless 전환 시 Google이 자동화 감지로 차단. 수동으로 사이트 띄워놓고
  //   돌리면 정상 작동. visible 브라우저는 사람이 보는 패턴 → 자동화 감지 신호 ↓.
  //   기존: 로그인 → 브라우저 닫고 headless로 재시작 → 자동화 감지 트리거
  //   변경: 로그인 후 그대로 visible 컨텍스트 유지 → 사용자가 브라우저 창 보임
  console.log('[ImageFX] ✅ 로그인 완료 → visible 모드 유지 (자동화 감지 회피)');
  sendImageLog('✅ [ImageFX] 로그인 완료! 이미지 생성 준비됨 (브라우저 창 유지 — Google 자동화 감지 회피)');

  // ✅ [v2.10.293] 로그인 직후 사람 행동 시뮬레이션 — 마우스 + 스크롤
  //   로그인 → 즉시 이미지 생성 = 봇 패턴. 잠시 사람처럼 행동 후 진행.
  await simulateHumanBehavior(page);

  await setCachedBrowser(context.browser() as any);
  cachedPage = page;
  browserMode = 'playwright';
  (cachedPage as any).__persistentContext = context;

  return cachedPage;
}

/**
 * ✅ AdsPower Playwright 브라우저 + labs.google/fx 페이지 확보
 * 이중 모드: AdsPower 우선 → Playwright 자체 브라우저 폴백
 */
// ✅ [v1.4.80] Flow 엔진이 같은 labs.google 세션을 공유할 수 있도록 export
export async function ensureImageFxBrowserPage(): Promise<Page> {
    return ensureBrowserPageWithRetry();
}

/**
 * ✅ (G) 자동 재시도 wrapper — 1차 실패 시 5s, 2차 실패 시 10s 대기 후 재시도 (총 3회).
 * Fatal 에러 (자가 해결 가이드가 붙은 메시지 / 로그인 시간 초과 등)는 즉시 throw.
 * 일시적 네트워크 hiccup, Google labs 트래커 지연, AdsPower 일시 끊김 등이 대상.
 */
async function ensureBrowserPageWithRetry(): Promise<Page> {
  const delays = [0, 5000, 10000];
  let lastError: any = null;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (attempt > 0) {
      sendImageLog(`🔄 [ImageFX] 일시적 오류 발생. ${delays[attempt] / 1000}초 후 재시도 (${attempt + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      // 캐시 완전 정리 후 재시도
      cachedPage = null;
      await setCachedBrowser(null);
      cachedToken = null;
      browserMode = null;
    }
    try {
      return await ensureBrowserPage();
    } catch (err: any) {
      lastError = err;
      const msg = (err && err.message) || '';
      // ⚠️ Fatal — 재시도 의미 없는 에러는 즉시 throw
      if (
        msg.includes('Chrome 또는 Edge를 설치') ||
        msg.includes('해결 방법:') ||
        msg.includes('Google 로그인 시간 초과')
      ) {
        throw err;
      }
      console.log(`[ImageFX] ↻ Attempt ${attempt + 1}/3 실패: ${msg.substring(0, 100)}`);
    }
  }
  throw lastError;
}

async function ensureBrowserPage(): Promise<Page> {
  // 1. 기존 페이지가 살아있으면 재사용
  if (cachedPage) {
    try {
      await cachedPage.evaluate(() => document.readyState);
      return cachedPage;
    } catch {
      console.log('[ImageFX] ⚠️ 기존 페이지 연결 끊김 → 재연결');
      cachedPage = null;
      await setCachedBrowser(null);
      cachedToken = null;
      browserMode = null;
    }
  }

  // 1.5 (E) Preflight self-diagnostic — first call per session only
  imageFxPreflight();

  // 2. AdsPower 사용 여부 확인 (사용자 설정 기반)
  // ✅ [SPEC-IMAGE-RECOVERY-001 R3] 본 세션 내 AdsPower 자동 OFF 후 재시도 절대 안 함
  if (_adsPowerUserEnabled && !_adsPowerSessionDisabled) {
    // ✅ AdsPower 활성화 → AdsPower 사용, 모든 실패 시 Playwright 자동 폴백
    try {
      await connectViaAdsPower();
      console.log('[ImageFX] 🔗 모드: AdsPower (사용자 설정 ON)');
    } catch (adsPowerErr: any) {
      const adsPowerErrMsg = adsPowerErr.message || '';
      // (F) Telemetry — AdsPower 실패 기록
      sendImageFxTelemetry({
        errorMessage: adsPowerErrMsg,
        errorCode: extractImageFxErrorCode(adsPowerErr) || 'adspower-fail',
        mode: 'adspower',
        stage: 'connect',
      });
      // ✅ [2026-03-16] 모든 AdsPower 에러 → Playwright로 자동 폴백
      // ECONNREFUSED(미실행/포트불일치), Exceeding(일일 한도), 프로필 없음 등 전부 포함
      console.log(`[ImageFX] ⚠️ AdsPower 사용 불가 (${adsPowerErrMsg.substring(0, 80)}) → Playwright 자체 브라우저로 폴백`);
      sendImageLog('⚠️ [ImageFX] AdsPower 연결 실패. 자체 브라우저로 자동 전환합니다...');
      // ✅ [SPEC-IMAGE-RECOVERY-001 R3] 본 세션에서는 AdsPower 재시도 안 함 (다음 앱 재시작 시 다시 시도)
      _adsPowerSessionDisabled = true;
      try {
        await connectViaPlaywright();
        console.log('[ImageFX] 🔗 모드: Playwright 자체 브라우저 (AdsPower 폴백)');
      } catch (pwErr: any) {
        // (F) Telemetry — final failure
        sendImageFxTelemetry({
          errorMessage: pwErr.message || String(pwErr),
          errorCode: extractImageFxErrorCode(pwErr) || 'playwright-fail',
          mode: 'playwright-fallback',
          stage: 'connect',
        });
        // (D) Self-help wrapped error
        throw new Error(
          `AdsPower와 자체 브라우저 모두 실패했습니다.\n\n` +
          `${pwErr.message}\n\n` +
          `해결 방법:\n` +
          `  1. Chrome 또는 Edge를 설치해주세요:\n` +
          `     • Chrome: https://www.google.com/chrome/\n` +
          `     • Edge: https://www.microsoft.com/edge/\n` +
          `  2. 앱을 재시작한 후 다시 시도해주세요.\n` +
          `  3. 회사·학교 PC라면 보안 정책으로 브라우저 실행이 막혀있을 수 있습니다.`,
        );
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
      // (F) Telemetry
      sendImageFxTelemetry({
        errorMessage: pwErr.message || String(pwErr),
        errorCode: extractImageFxErrorCode(pwErr) || 'playwright-fail',
        mode: 'playwright',
        stage: 'connect',
      });
      // (D) Self-help wrapped error
      throw new Error(
        `브라우저 연결 실패: ${pwErr.message}\n\n` +
        `해결 방법:\n` +
        `  1. Chrome 또는 Edge를 설치해주세요:\n` +
        `     • Chrome: https://www.google.com/chrome/\n` +
        `     • Edge: https://www.microsoft.com/edge/\n` +
        `  2. 앱을 재시작한 후 다시 시도해주세요.\n` +
        `  3. 안티 바이러스가 차단했을 수 있습니다. 일시 해제 후 재시도.`,
      );
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
      waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
      timeout: 90000,
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
  cachedTokenExpiry = new Date(session.expires || Date.now() + 240 * 60 * 1000); // 기본 50분
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
        // [SPEC-FREEZE-GUARD-001-P2 R4] 워커 디코딩 (ImageFX encodedImage 1MB+)
        const buffer = await decodeBase64Async(genResult.encodedImage);
        console.log(`[ImageFX] ✅ 이미지 생성 성공! (${Math.round(buffer.length / 1024)}KB, 시도 ${attempt})`);
        sendImageLog(`✅ [ImageFX] 이미지 생성 완료 (${Math.round(buffer.length / 1024)}KB)`);
        trackApiUsage('gemini', { images: 1, model: IMAGEN_MODELS.V35_FX, costOverride: 0 });
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
        // ✅ [v1.4.40] 401이 3회 연속 실패면 명확히 분류
        if (attempt === MAX_RETRIES) {
          lastError = new Error('IMAGEFX_AUTH_EXPIRED:Google 세션이 만료되었습니다. 환경설정 → ImageFX → "Google 계정 변경"으로 다시 로그인해주세요.');
        }
        continue;
      }

      // ✅ [v1.4.40] 쿼터 초과 (429) — Google ImageFX는 명시적 한도 없이 동적 차단
      if (errorCode === 'HTTP_429') {
        console.warn(`[ImageFX] 🚫 쿼터 초과 (HTTP 429) — 시도 ${attempt}/${MAX_RETRIES}`);
        sendImageLog('🚫 [ImageFX] 시간당 한도 초과 — 1시간 후 다시 시도해주세요.');
        lastError = new Error('IMAGEFX_QUOTA_EXCEEDED:Google ImageFX 시간당 한도를 초과했습니다. 약 1시간 후 다시 시도하거나, 다른 이미지 엔진(Pollinations/DeepInfra)으로 전환해주세요.');
        // 429는 재시도해도 의미 없음 — 즉시 종료
        return null;
      }

      // 안전 필터 차단
      if (errorDetail.includes('safety') || errorDetail.includes('blocked') || errorDetail.includes('harmful') || errorDetail.includes('policy')) {
        console.warn(`[ImageFX] 🛡️ 안전 필터 차단 (시도 ${attempt}) → 프롬프트 순화`);
        sendImageLog('🛡️ [ImageFX] 안전 필터 — 프롬프트 순화 중...');
        currentPrompt = sanitizePromptForSafety(currentPrompt);
        // ✅ [v1.4.40] 마지막 시도에서도 차단되면 명확히 분류
        if (attempt === MAX_RETRIES) {
          lastError = new Error('IMAGEFX_SAFETY_BLOCK:Google 안전 필터가 이 프롬프트를 차단했습니다. 정부지원/금융/의료/정치 키워드는 자주 차단됩니다. 다른 키워드로 시도하거나 다른 이미지 엔진을 사용해주세요.');
        }
        continue;
      }

      // 서버 과부하 (503)
      if (errorCode === 'HTTP_503') {
        const waitSec = 5 * attempt;
        console.warn(`[ImageFX] ⏳ 서버 과부하 (시도 ${attempt}) → ${waitSec}초 대기`);
        sendImageLog(`⏳ [ImageFX] 서버 과부하 — ${waitSec}초 대기 중...`);
        await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
        // ✅ [v1.4.40] 마지막 503이면 명확히 분류
        if (attempt === MAX_RETRIES) {
          lastError = new Error('IMAGEFX_SERVER_BUSY:Google ImageFX 서버가 일시적으로 과부하 상태입니다. 잠시 후(5~30분) 다시 시도하거나 다른 시간대에 시도해주세요.');
        }
        continue;
      }

      // ✅ [v1.4.40] HTTP 4xx 일반 (403 등) — 차단/접근 거부
      if (errorCode.startsWith('HTTP_4')) {
        console.error(`[ImageFX] ❌ 접근 거부 (${errorCode}): ${errorDetail.substring(0, 100)}`);
        lastError = new Error(`IMAGEFX_FORBIDDEN:Google ImageFX 접근이 거부되었습니다 (${errorCode}). 한국 IP 차단 또는 계정 제한일 수 있습니다. 테더링 IP 변경 또는 다른 Google 계정을 시도해주세요.`);
        return null;
      }

      // ✅ [v1.4.40] HTTP 5xx (500/502/504 등)
      if (errorCode.startsWith('HTTP_5')) {
        console.error(`[ImageFX] ❌ Google 서버 오류 (${errorCode})`);
        lastError = new Error(`IMAGEFX_SERVER_ERROR:Google ImageFX 서버 오류 (${errorCode}). 잠시 후 다시 시도해주세요.`);
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        return null;
      }

      // ✅ [v2.10.47] 기타 에러 — 진짜 원인 진단 강화
      //   기존: errorCode/errorDetail이 NO_IMAGES/EXCEPTION 등이면 모호 메시지 + 3연속 실패로 잡힘
      //   사용자가 IMAGEFX_OTHER:NO_IMAGES 같은 명확한 분류 받도록 변경
      console.error(`[ImageFX] ❌ 생성 실패 (시도 ${attempt}/${MAX_RETRIES}): ${errorCode} ${errorDetail.substring(0, 200)}`);
      sendImageLog(`❌ [ImageFX] ${errorCode}: ${errorDetail.substring(0, 100)}`);
      // 마지막 시도에서 명확히 분류
      if (attempt === MAX_RETRIES) {
        if (errorCode === 'NO_IMAGES') {
          lastError = new Error(
            'IMAGEFX_OTHER:Google이 빈 응답 반환 (NO_IMAGES).\n' +
            '안전 필터 차단 또는 응답 형식 변경일 수 있습니다.\n' +
            '환경설정 → ImageFX → "Google 계정 변경" 또는 다른 엔진 시도.'
          );
        } else if (errorCode === 'EXCEPTION') {
          lastError = new Error(
            `IMAGEFX_OTHER:fetch/JSON 예외 — ${errorDetail.substring(0, 150)}\n` +
            '네트워크 또는 ImageFX API 응답 형식 변경일 수 있습니다.'
          );
        } else {
          lastError = new Error(`IMAGEFX_OTHER:${errorCode} - ${errorDetail.substring(0, 200)}`);
        }
      } else {
        lastError = new Error(`${errorCode}: ${errorDetail.substring(0, 200)}`);
      }

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

    } catch (error: any) {
      lastError = error;
      console.error(`[ImageFX] ❌ 예외 (시도 ${attempt}/${MAX_RETRIES}): ${error.message}`);

      // AdsPower 연결 문제 → 캐시 초기화
      if (error.message.includes('AdsPower') || error.message.includes('연결') || error.message.includes('WebSocket')) {
        await setCachedBrowser(null);
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
            waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
            timeout: 90000,
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
          cachedTokenExpiry = new Date(session.expires || Date.now() + 240 * 60 * 1000);
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
        await setCachedBrowser(null);
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
          waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
          timeout: 90000,
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
          await setCachedBrowser(adsBrowser);
          cachedPage = page;
          browserMode = 'adspower';
          cachedUserId = adsUserId; // ✅ [2026-03-16 FIX] cleanup 시 AdsPower stop 호출에 필요
          cachedToken = session.access_token;
          cachedTokenExpiry = new Date(session.expires || Date.now() + 240 * 60 * 1000);
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
          waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
          timeout: 90000,
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
            await setCachedBrowser(adsBrowser);
            cachedPage = page;
            browserMode = 'adspower';
            cachedUserId = adsUserId; // ✅ [2026-03-16 FIX] cleanup 시 AdsPower stop 호출에 필요
            cachedToken = checkSession.access_token;
            cachedTokenExpiry = new Date(checkSession.expires || Date.now() + 240 * 60 * 1000);

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
      waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
      timeout: 90000,
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
      await setCachedBrowser(context.browser() as any);
      cachedPage = page;
      browserMode = 'playwright';
      (cachedPage as any).__persistentContext = context;
      cachedToken = session.access_token;
      cachedTokenExpiry = new Date(session.expires || Date.now() + 240 * 60 * 1000);

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
      waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
      timeout: 90000,
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
        await setCachedBrowser(context.browser() as any);
        cachedPage = page;
        browserMode = 'playwright';
        (cachedPage as any).__persistentContext = context;
        cachedToken = checkSession.access_token;
        cachedTokenExpiry = new Date(checkSession.expires || Date.now() + 240 * 60 * 1000);

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

  await setCachedBrowser(null);
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
// ✅ [v1.4.38] 동시 호출 방지 락 — "로그인 버튼 두 번 클릭 → 응답없음" 방지
let _switchAccountInProgress: Promise<{ success: boolean; userName?: string; message: string }> | null = null;

export async function switchGoogleAccountForImageFx(): Promise<{
  success: boolean;
  userName?: string;
  message: string;
}> {
  // ✅ [v1.4.38] 이미 진행 중이면 기존 Promise 재사용 (중복 실행 방지)
  if (_switchAccountInProgress) {
    console.log('[ImageFX] ⚠️ Google 계정 변경이 이미 진행 중입니다. 기존 작업을 기다립니다...');
    sendImageLog('⏳ [ImageFX] 이미 로그인 시도 중입니다. 잠시만 기다려주세요...');
    return _switchAccountInProgress;
  }

  _switchAccountInProgress = (async () => {
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

      const openResult = await adsPowerGet(`/api/v1/browser/start?user_id=${userId}`);
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

      const wsUrl = openResult.data.ws?.puppeteer;
      if (!wsUrl) throw new Error('AdsPower WebSocket URL 없음');

      const browser = await chromium.connectOverCDP(wsUrl);
      const context = browser.contexts()[0];
      if (!context) throw new Error('AdsPower 컨텍스트 없음');

      let page = context.pages()[0] || await context.newPage();

      // ✅ Google 계정 로그아웃 (visible에서 수행 — 사용자가 볼 수 있음)
      // ⚠️ Logout 페이지는 여러 리다이렉트를 유발하여 execution context가 파괴될 수 있음
      console.log('[ImageFX] 🔓 Google 로그아웃 수행...');
      sendImageLog('🔓 [ImageFX] 기존 Google 계정 로그아웃 중...');
      try {
        await page.goto('https://accounts.google.com/Logout', {
          waitUntil: 'domcontentloaded',  // networkidle 대신 — 리다이렉트 체인에서 안전
          timeout: 30000,
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
          waitUntil: 'load', // ✅ [v2.10.70] networkidle → load (Google labs 광고 트래커 회피, 영원히 idle 안 끝나는 위험 차단)
          timeout: 90000,
        });
      } catch (navErr: any) {
        console.warn(`[ImageFX] ⚠️ ImageFX 네비게이션 경고: ${navErr.message}`);
        // ✅ [FIX-5] 새 페이지로 재시도 — 이것도 실패 가능하므로 try-catch
        try {
          page = await context.newPage();
          await page.goto('https://labs.google/fx/tools/image-fx', {
            waitUntil: 'domcontentloaded', // networkidle 대신 더 빠른 전략
            timeout: 90000,
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
            cachedTokenExpiry = new Date(session.expires || Date.now() + 240 * 60 * 1000);
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
      await setCachedBrowser(browser);
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
  })(); // ✅ [v1.4.38] IIFE 종료

  try {
    return await _switchAccountInProgress;
  } finally {
    // ✅ [v1.4.38] 작업 완료/실패 모두 락 해제 — 다음 시도 가능
    _switchAccountInProgress = null;
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
  // ✅ [v1.4.40] 마지막 분류된 에러 보존 — 0개 결과일 때 명확한 사유로 throw
  let lastClassifiedError: Error | null = null;

  // ✅ [v2.10.65] 중복 이미지 검출 — FLOW/나노/Leonardo/DeepInfra와 동기화 (임계값 8)
  const usedImageHashes = new Set<string>();
  const usedImageAHashes: bigint[] = [];
  const IMAGEFX_AHASH_THRESHOLD = 8;
  const IMAGEFX_DUP_MAX_RETRIES = 3;

  // ✅ [SPEC-IMAGE-RECOVERY-001] 자동 복구 코디네이터
  const coordinator = getRecoveryCoordinator({
    toastNotifier: { notify: (m) => sendImageLog(m) },
  });

  for (let i = 0; i < items.length; i++) {
    // 중지 체크
    if (stopCheck && stopCheck()) {
      console.log(`[ImageFX] ⏹️ 중지 요청됨 — ${i + 1}번째부터 건너뜀`);
      sendImageLog(`⏹️ [ImageFX] 중지 요청됨`);
      break;
    }

    // ✅ [v2.10.293] 요청 간 랜덤 대기 (5-15초) — 봇 감지 회피
    //   같은 분 내 빠른 연속 요청은 Google 봇 감지 신호. 사람처럼 간격을 둠.
    await humanLikeIntervalDelay(i);

    // ✅ [v2.10.293] 사람 행동 시뮬레이션 — 마우스 움직임 + 스크롤
    //   매 이미지 생성 전 잠깐 사람처럼 행동. 봇 점수 ↓
    if (cachedPage) {
      await simulateHumanBehavior(cachedPage);
    }

    const item = items[i];
    const heading = item.heading || `이미지 ${i + 1}`;

    console.log(`[ImageFX] 🖼️ [${i + 1}/${items.length}] "${heading}" 생성 시작...`);
    sendImageLog(`🖼️ [ImageFX] "${heading}" 생성 중... (${i + 1}/${items.length})`);

    // ✅ [SPEC-IMAGE-RECOVERY-001] 헤딩 단위 자동 복구 카운터 리셋
    // (재시도 진입 시에는 startHeading을 호출하지 않아 카운터 유지)
    if (!coordinator.isRetryingSameHeading(i)) {
      coordinator.startHeading({
        headingIndex: i,
        totalHeadings: items.length,
        heading,
        postTitle: postTitle ?? '',
        engine: 'imageFx',
      });
    }

    try {
      // 프롬프트 결정: 영어 프롬프트 우선 (ImageFX는 영어 최적화)
      let prompt = item.englishPrompt || item.prompt || heading;

      // config에서 비율 가져오기
      let imageRatio = (item as any).imageRatio || '1:1';
      try {
        const configModule = await import('../configManager.js');
        const config = await configModule.loadConfig();
        imageRatio = (item as any).imageRatio || (config as any).imageRatio || '1:1';
      } catch { /* config 로드 실패 시 기본값 사용 */ }

      // ✅ [v2.10.65] 중복 검출 + 다양성 재생성 루프
      let fxResult: { buffer: Buffer; mimeType: string } | null = null;
      let acceptedProbe: { isDuplicate: boolean; isSimilar: boolean; sha256: string | null; aHash: bigint | null } | null = null;
      for (let dupAttempt = 1; dupAttempt <= IMAGEFX_DUP_MAX_RETRIES; dupAttempt++) {
        const candidate = await generateSingleImageWithImageFx(prompt, imageRatio);
        if (!candidate || !candidate.buffer) {
          fxResult = candidate;
          break; // 생성 실패 — 외부 분기에서 처리
        }
        const probe = await probeDuplicate(candidate.buffer, usedImageHashes, usedImageAHashes, IMAGEFX_AHASH_THRESHOLD);
        if (probe.isDuplicate || probe.isSimilar) {
          if (dupAttempt < IMAGEFX_DUP_MAX_RETRIES) {
            const reason = probe.isDuplicate ? '중복(SHA256)' : '유사(aHash)';
            console.warn(`[ImageFX] 🔁 ${reason} 감지 → diversity hint 적용 후 재시도 (${dupAttempt}/${IMAGEFX_DUP_MAX_RETRIES}) - ${heading}`);
            sendImageLog(`🔁 [ImageFX] [${heading}] 중복 이미지 감지 — 다른 각도로 재생성 (${dupAttempt + 1}/${IMAGEFX_DUP_MAX_RETRIES})`);
            prompt = applyDiversityHint(prompt, dupAttempt);
            continue;
          }
          console.warn(`[ImageFX] ⚠️ 최종 ${IMAGEFX_DUP_MAX_RETRIES}회 재시도에도 중복/유사 — 허용하고 진행: ${heading}`);
          sendImageLog(`⚠️ [ImageFX] [${heading}] 중복 ${IMAGEFX_DUP_MAX_RETRIES}회 재시도 후에도 검출 — 그대로 진행`);
        }
        fxResult = candidate;
        acceptedProbe = probe;
        break;
      }

      if (fxResult && fxResult.buffer) {
        // 중복 통과 후 commit
        if (acceptedProbe) commitHashes(acceptedProbe, usedImageHashes, usedImageAHashes);

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
          // ✅ [v2.10.289 FIX] originalIndex 보존 — headingImageMode 필터링(odd/even/thumbnail-only) 시 정확한 소제목 매칭. 누락 시 editorHelpers의 fallback이 발동해 이미지가 안 들어가야 할 소제목에 중복 배치됨.
          originalIndex: (item as any).originalIndex,
          ...(savedInfo.savedToLocal ? { savedToLocal: savedInfo.savedToLocal } : {}),
        };

        results.push(genImage);
        consecutiveFailures = 0; // 성공 시 연속 실패 카운터 초기화
        coordinator.markHeadingSucceeded(); // C8

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
      // ✅ [SPEC-IMAGE-RECOVERY-001] 자동 복구 결정
      const errorCode = extractImageFxErrorCode(error);
      const httpStatus = extractHttpStatus(error);
      // C4: 503 카운터 — classifier의 storm 가드 입력
      if (httpStatus === 503) coordinator.recordServer503();
      const decision = coordinator.decide({
        errorMessage: String(error?.message ?? error ?? ''),
        errorCode,
        httpStatus,
      });

      if (decision.action === 'retry') {
        const backoffMs = coordinator.applyRetry(decision);
        if (decision.tag === 'R1') {
          // R1: 토큰 캐시 폐기 후 1회 재시도
          cachedToken = null;
          cachedTokenExpiry = null;
        }
        if (backoffMs > 0) {
          console.log(`[ImageFX] 🔄 ${decision.tag} 백오프 ${backoffMs}ms — "${heading}"`);
          await new Promise((r) => setTimeout(r, backoffMs));
        }
        // 같은 헤딩 다시 시도 — i를 감소시켜 다음 iteration에서 같은 헤딩 처리
        coordinator.markRetryingHeading(i);
        i--;
        continue;
      }

      consecutiveFailures++;
      console.error(`[ImageFX] ❌ [${i + 1}/${items.length}] "${heading}" 예외: ${error.message}`);
      sendImageLog(`❌ [ImageFX] "${heading}" 오류: ${error.message}`);
      // ✅ [v1.4.40] 분류된 에러는 보존 — break는 coordinator decision에 일임 (legacy 충돌 제거, reviewer #3)
      if (error.message && error.message.startsWith('IMAGEFX_')) {
        lastClassifiedError = error;
      }

      // ✅ [SPEC-IMAGE-RECOVERY-001] block 결정 시 차단형 모달 IPC 송출
      if (decision.action === 'block') {
        await sendBlockingModalRequest(decision, error);
        if (isBlockFatal(decision)) {
          coordinator.markBatchAborted(); // C8
          break;
        }
      }

      // C8: skip-heading 카운터
      if (decision.action === 'skip-heading') {
        coordinator.markHeadingSkipped();
      }
    }

    // 연속 실패 시 중단
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`[ImageFX] ⛔ ${MAX_CONSECUTIVE_FAILURES}연속 실패 → 배치 중단`);
      // ✅ [v2.10.47] 진짜 원인 진단 강화 — '시간당 한도' 모호 메시지 제거
      //   사용자 보고: '오늘 처음 사용했는데 시간당 한도라고 뜬다'
      //   원인: 3연속 NO_IMAGES/EXCEPTION 시 fallback 메시지가 모호 → 사용자가 진짜 한도라 오해
      //   수정: 진짜 errorCode/detail 명시 + 재인증 안내 강화
      if (!lastClassifiedError) {
        lastClassifiedError = new Error(
          'IMAGEFX_UNKNOWN_FAILURE:Google ImageFX 3연속 실패.\n\n' +
          '시간당 한도가 아닐 수 있습니다 (오늘 처음 사용한 경우 특히):\n' +
          '1. 환경설정 → ImageFX → "Google 계정 변경" 으로 재로그인\n' +
          '2. 다른 이미지 엔진(Pollinations/DeepInfra)으로 전환\n' +
          '3. F12 → Console 탭의 [ImageFX] 로그 확인 (HTTP_401/HTTP_429/NO_IMAGES 등)'
        );
      }
      sendImageLog(`⛔ [ImageFX] 연속 실패 — ${lastClassifiedError.message.replace(/^IMAGEFX_[A-Z_]+:/, '').split('\n')[0]}`);
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

  // ✅ [v1.4.40] 결과 0개 + 분류된 에러 있음 → 사용자에게 명확한 사유 전달
  if (results.length === 0 && lastClassifiedError) {
    throw lastClassifiedError;
  }

  return results;
}

/**
 * ImageFX 연결 테스트 — Flow 패턴과 동일.
 *
 * UI에서 "ImageFX 연결 테스트" 버튼을 눌러 호출. 세션 없으면 visible 브라우저를
 * 강제로 띄워 사용자가 Google 로그인할 수 있게 한다 (자동 발행 중에는 visible 전환이
 * 백그라운드로 묻힐 수 있어 사용자가 못 알아채는 회귀 차단).
 *
 * 정상 흐름:
 *   1. ensurePage() 호출 → headless 시도 → 세션 없으면 자동 visible 전환 (5분 대기)
 *   2. 사용자가 visible 브라우저에서 jdy3531@gmail.com 로그인
 *   3. 쿠키 영구 저장 → headless 자동 전환
 *   4. ok: true + userInfo 반환
 */
export async function testImageFxConnection(): Promise<{
  ok: boolean;
  message: string;
  userInfo?: { email?: string; name?: string };
}> {
  try {
    const page = await ensureBrowserPage();
    const session = await page.evaluate(async () => {
      try {
        const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
        return res.ok ? await res.json() : null;
      } catch { return null; }
    });
    if (!session || !(session as any).access_token) {
      return { ok: false, message: '❌ Google 세션 확보 실패 — 로그인 창에서 로그인 완료 후 다시 테스트해주세요' };
    }
    const userInfo = (session as any).user;
    return {
      ok: true,
      message: `✅ ImageFX 연결 성공 — ${userInfo?.email || userInfo?.name || 'user'}`,
      userInfo,
    };
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('Google 로그인 시간 초과')) {
      return { ok: false, message: '❌ Google 로그인 시간 초과 — 다시 테스트해주세요' };
    }
    return { ok: false, message: `❌ ${msg}` };
  }
}
