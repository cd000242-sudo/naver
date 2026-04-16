// ✅ puppeteer-extra + stealth plugin 적용 (봇 감지 완벽 우회)
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Frame, Page, ElementHandle, KeyInput } from 'puppeteer';
import type { StructuredContent, ImagePlan } from './contentGenerator.js';
import { removeOrdinalHeadingLabelsFromBody, stripAllFormatting } from './contentGenerator.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { thumbnailService } from './thumbnailService.js';
import {
  generateProductSpecTableImage,
  generateProsConsTableImage,
  extractSpecsFromContent,
  generateCtaBannerImage,
  generateTableFromUrl // ✅ [추가] 제휴 링크에서 직접 스펙 크롤링
} from './image/tableImageGenerator.js';
import { extractProsConsWithGemini } from './image/geminiTableExtractor.js';
import { browserSessionManager, type SessionInfo } from './browserSessionManager.js';
import { withRetry, findWithFallback, clickWithRetry, navigateWithRetry, isRetryableError } from './errorRecovery.js';
import { createGhostCursor, safeClick, safeType, safeClickInFrame, waitRandom, randomMouseMovement, type GhostCursor } from './ghostCursorHelper.js';
import * as imageHelpers from './automation/imageHelpers';
import * as publishHelpers from './automation/publishHelpers';
import * as editorHelpers from './automation/editorHelpers';
import { getProxyUrl } from './crawler/utils/proxyManager.js';
import {
  SELECTORS,
  findElement,
  findAllElements,
  waitForElement,
  getAllSelectors,
  getSelectorStrings,
} from './automation/selectors';
// ✅ [Phase 4A] 공유 유틸리티 import (중복 제거)
import { extractCoreKeywords } from './automation/typingUtils.js';

// ✅ [2026-02-24] 네이버 에디터 자동완성 팝업(파파고/내돈내산 스티커) 방지 래퍼
// ✅ [2026-03-27 FIX] 매번 Escape 전송 → 팝업 존재 시에만 조건부 Escape
// 이전: 타이핑마다 Escape → 포스트 1개당 20~50회 Escape = 봇 패턴
async function safeKeyboardType(
  page: Page,
  text: string,
  options?: { delay?: number }
): Promise<void> {
  await page.keyboard.type(text, options);
  // 자동완성 팝업이 실제로 보이는 경우에만 Escape
  const hasPopup = await page.evaluate(() => {
    const popup = document.querySelector('.se-popup, .se-autocomplete-layer, .se-sticker-layer, [class*="autocomplete"], [class*="suggest"]'); /* allPopups + autocompleteLayer */
    return popup !== null && (popup as HTMLElement).offsetParent !== null;
  }).catch(() => false);
  if (hasPopup) {
    await page.keyboard.press('Escape').catch(() => { });
  }
}

// ✅ [Smart Typing] 스마트 타이핑 함수 (핵심 키워드 자동 굵게+밑줄)
async function smartTypeWithAutoHighlight(
  page: Page,
  text: string,
  options: {
    baseDelay?: number;
    enableHighlight?: boolean;
  } = {}
): Promise<void> {
  const { baseDelay = 80, enableHighlight = true } = options;

  try {
    // ✅ 빈 텍스트 처리
    if (!text || text.trim().length === 0) {
      return;
    }

    if (!enableHighlight) {
      // 하이라이트 비활성화 시 일반 타이핑
      await safeKeyboardType(page, text, { delay: baseDelay });
      return;
    }

    const keywords = extractCoreKeywords(text);
    console.log("🤖 [SmartType] 감지된 핵심 키워드:", keywords);

    // ✅ 키워드가 없으면 일반 타이핑으로 폴백
    if (!keywords || keywords.length === 0) {
      console.log("⚠️ [SmartType] 키워드 없음, 일반 타이핑으로 진행");
      await safeKeyboardType(page, text, { delay: baseDelay });
      return;
    }

    // 키워드를 정규식으로 분리하여 파트별로 처리
    const escapedKeywords = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'g');
    const parts = text.split(regex);

    let highlightCount = 0;
    for (const part of parts) {
      if (!part) continue;

      // 랜덤 딜레이 (baseDelay ~ baseDelay+50ms)
      const delay = Math.floor(Math.random() * 50) + baseDelay;
      await safeKeyboardType(page, part, { delay });

      // ✅ [2026-01-16] IME 입력 완료 대기 (한글 씹힘/잘림 방지)
      // 한글은 조합형 문자라 타이핑 직후 바로 커서를 움직이면 마지막 글자가 사라지거나 꼬일 수 있음
      await new Promise(r => setTimeout(r, 250));

      if (keywords.includes(part)) {
        // (1) 블록 지정 (Shift+ArrowLeft)
        await page.keyboard.down('Shift');
        for (let i = 0; i < part.length; i++) {
          await page.keyboard.press('ArrowLeft');
        }
        await page.keyboard.up('Shift');
        await new Promise(r => setTimeout(r, 80));

        // (2) 굵게 (Ctrl + B)
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyB');
        await page.keyboard.up('Control');
        await new Promise(r => setTimeout(r, 50));

        // (3) 밑줄 (Ctrl + U)
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyU');
        await page.keyboard.up('Control');
        await new Promise(r => setTimeout(r, 50));

        // (4) 선택 해제 (ArrowRight)
        await page.keyboard.press('ArrowRight');
        await new Promise(r => setTimeout(r, 80));

        highlightCount++;
        console.log(`✨ [SmartType] 키워드 강조 완료: "${part}"`);
      }
    }

    console.log(`✅ [SmartType] 완료: ${highlightCount}개 키워드 강조됨`);
  } catch (e) {
    console.error("[SmartType] 타이핑 중 오류:", e);
    // 폴백: 일반 타이핑
    try {
      await safeKeyboardType(page, text, { delay: baseDelay });
    } catch (fallbackErr) {
      console.error("[SmartType] 폴백 타이핑도 실패:", fallbackErr);
    }
  }
}

// ✅ Stealth Plugin 적용 (가장 중요! - 봇 감지 우회 핵심)
puppeteer.use(StealthPlugin());

export interface AutomationOptions {
  naverId: string;
  naverPassword: string;
  loginUrl?: string;
  blogWriteUrl?: string;
  headless?: boolean;
  slowMo?: number;
  viewport?: {
    width: number;
    height: number;
  };
  navigationTimeoutMs?: number;
  defaultTitle?: string;
  defaultContent?: string;
  defaultLines?: number;
  categoryName?: string; // ✅ 추가: 발행할 카테고리(폴더)명
  accountProxyUrl?: string; // ✅ 계정별 프록시 URL (미설정 시 프록시 없이 직접 연결)
}

export type PublishMode = 'draft' | 'publish' | 'schedule';

export interface RunOptions {
  title?: string;
  content?: string;
  lines?: number;
  selectedHeadings?: string[];
  structuredContent?: StructuredContent;
  hashtags?: string[];
  images?: AutomationImage[];
  publishMode?: PublishMode;
  categoryName?: string; // ✅ 추가: 발행할 카테고리(폴더)명
  scheduleDate?: string; // 예약발행 날짜 (YYYY-MM-DD HH:mm 형식)
  scheduleTime?: string; // ✅ [2026-03-19 FIX] 예약 시간 (HH:mm) — scheduleDate와 별도 전달 시 사용
  scheduleType?: 'app-schedule' | 'naver-server'; // 예약 발행 타입: 앱 스케줄 관리 vs 네이버 서버 예약
  scheduleMethod?: 'datetime-local' | 'individual-inputs'; // 예약발행 방식
  ctaLink?: string;
  ctaText?: string;
  ctas?: Array<{ text: string; link?: string }>;
  ctaPosition?: 'bottom' | string; // 'bottom' | 'heading-1' ~ 'heading-10'
  skipCta?: boolean; // ✅ CTA 없이 발행하기
  skipImages?: boolean; // 이미지 삽입 건너뛰기 (글만 발행하기용)
  thumbnailPath?: string; // 대표 이미지 경로
  imageMode?: 'full-auto' | 'semi-auto' | 'manual' | 'skip'; // 이미지 모드
  collectedImages?: Array<{ id: string; url: string; thumbnailUrl: string; title: string; source: string; tags?: string[] }>; // 수집된 이미지 (풀오토 모드용)
  toneStyle?: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe' | 'storyteller' | 'expert_review' | 'calm_info'; // 글 톤 설정 (10개 전체)
  keepBrowserOpen?: boolean; // ✅ 추가
  useIntelligentImagePlacement?: boolean; // ✅ 추가: 지능형 이미지 배치 사용 여부
  onlyImagePlacement?: boolean; // ✅ 추가: 이미지 배치만 수행하고 종료 (이미지 관리 탭 용)
  affiliateLink?: string; // ✅ 추가: 쇼핑커넥트 제휴 링크
  useAffiliateVideo?: boolean; // ✅ 추가: 쇼핑 비디오 변환 옵션
  contentMode?: string; // ✅ 추가: 콘텐츠 모드 (seo, homefeed, affiliate, custom 등)
  useAiImage?: boolean; // ✅ 추가: AI 이미지 생성 사용 여부
  createProductThumbnail?: boolean; // ✅ 추가: 제품 이미지 기반 썸네일 합성 여부
  includeThumbnailText?: boolean; // ✅ 추가: 썸네일 텍스트 합성 여부
  isFullAuto?: boolean; // ✅ 추가: 풀오토 모드 여부 (이미지 인덱스 폴백용)
  previousPostTitle?: string; // ✅ 추가: 같은 카테고리 이전글 제목
  previousPostUrl?: string; // ✅ 추가: 같은 카테고리 이전글 URL
}

export interface AutomationImage {
  heading: string;
  filePath: string;
  provider: string;
  alt?: string;
  caption?: string;
  savedToLocal?: string | boolean; // 로컬에 저장된 이미지 경로 (string) 또는 저장 여부 (boolean)
}

interface ResolvedRunOptions {
  title: string;
  content: string;
  lines: number;
  selectedHeadings: string[];
  structuredContent?: StructuredContent;
  hashtags: string[];
  images: AutomationImage[];
  publishMode: PublishMode;
  categoryName?: string; // ✅ 추가
  scheduleDate?: string;
  scheduleType?: 'app-schedule' | 'naver-server'; // 예약 발행 타입: 앱 스케줄 관리 vs 네이버 서버 예약
  scheduleMethod?: 'datetime-local' | 'individual-inputs'; // 예약발행 방식
  ctaLink?: string;
  ctaText?: string;
  ctas: Array<{ text: string; link?: string }>;
  ctaPosition?: 'bottom' | string; // 'bottom' | 'heading-1' ~ 'heading-10'
  skipCta?: boolean; // ✅ CTA 없이 발행하기
  skipImages?: boolean; // 이미지 삽입 건너뛰기 (글만 발행하기용)
  imageMode?: 'full-auto' | 'semi-auto' | 'manual' | 'skip'; // 이미지 모드
  collectedImages?: Array<{ id: string; url: string; thumbnailUrl: string; title: string; source: string; tags?: string[] }>; // 수집된 이미지 (풀오토 모드용)
  toneStyle?: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe' | 'storyteller' | 'expert_review' | 'calm_info'; // 글 톤 설정 (10개 전체)
  keepBrowserOpen: boolean; // ✅ 추가
  useIntelligentImagePlacement?: boolean; // ✅ 추가: 지능형 이미지 배치 사용 여부
  onlyImagePlacement?: boolean; // ✅ 추가: 이미지 배치만 수행하고 종료
  affiliateLink?: string; // ✅ 추가: 쇼핑커넥트 제휴 링크
  useAffiliateVideo?: boolean; // ✅ 추가: 쇼핑 비디오 변환 옵션
  contentMode?: string; // ✅ 추가: 콘텐츠 모드
  useAiImage?: boolean; // ✅ 추가
  createProductThumbnail?: boolean; // ✅ 추가
  includeThumbnailText: boolean; // ✅ 추가
  isFullAuto?: boolean; // ✅ 추가: 풀오토 모드 여부
  previousPostTitle?: string; // ✅ 추가: 같은 카테고리 이전글 제목
  previousPostUrl?: string; // ✅ 추가: 같은 카테고리 이전글 URL
  thumbnailPath?: string; // ✅ [2026-03-03 FIX] 추가: 대표사진 경로
  customBannerPath?: string; // ✅ [2026-01-18] 추가: 커스텀 CTA 배너 이미지 경로
  useAiTableImage?: boolean; // ✅ [2026-01-18] 추가: 장단점 표 AI 이미지 생성 여부
  useAiBanner?: boolean; // ✅ [2026-01-18] 추가: CTA 배너 AI 이미지 생성 여부
  autoBannerGenerate?: boolean; // ✅ [2026-01-21] 추가: 배너 자동 랜덤 생성 (연속발행용)
}

/**
 * 🛡️ Naver Blog automation - Stealth 버전
 * puppeteer-extra + stealth plugin 적용으로 봇 감지 완벽 우회
 */
export class NaverBlogAutomation {
  private page: Page | null = null;
  private browser: Browser | null = null;
  private mainFrame: Frame | null = null;
  private cancelRequested = false;
  private _prosConsAlreadyInserted = false; // ✅ [2026-02-19] 장단점 표 중복 삽입 방지 플래그

  // ✅ Ghost Cursor 인스턴스 (사람 같은 마우스 이동)
  private cursor: GhostCursor | null = null;

  // ✅ 발행된 URL 저장
  private publishedUrl: string | null = null;

  // ✅ 외부에서 Naver ID 확인용
  get naverId(): string {
    return this.options.naverId;
  }

  // ✅ 계정별 독립 브라우저 프로필 경로 (핵심!)
  private readonly ACCOUNT_PROFILE_BASE = path.join(
    os.homedir(),
    '.naver-blog-automation',
    'profiles'
  );

  // ✅ [Phase 1-1] 셀렉터 레지스트리에서 가져온 상수 (하위 호환)
  private readonly PUBLISH_BUTTON_SELECTORS = getAllSelectors(SELECTORS.publish.publishButton);
  private readonly CONFIRM_PUBLISH_SELECTORS = getAllSelectors(SELECTORS.publish.confirmPublishButton);
  private readonly LOGIN_BUTTON_SELECTORS = getAllSelectors(SELECTORS.login.loginButton);

  // Delay 상수
  private readonly DELAYS = {
    SHORT: 50,
    MEDIUM: 150,
    LONG: 250,
    IMAGE_UPLOAD: 500,
    NAVIGATION: 1000,
  };

  // 쿠키 및 브라우저 프로필 경로 (레거시 호환)
  private readonly COOKIES_PATH = path.join(
    os.homedir(),
    '.naver-blog-automation',
    'cookies.json'
  );

  private readonly USER_DATA_DIR = path.join(
    os.homedir(),
    '.naver-blog-automation',
    'browser-profile'
  );

  constructor(
    private readonly options: AutomationOptions,
    private readonly logger: (message: string) => void = console.log,
    private readonly progressCallback?: (step: number, total: number, message: string) => void,
  ) { }

  private stripRepeatedHookBlocks(text: string): string {
    if (!text) return text;
    let out = String(text);
    out = out.replace(
      /댓글창이[^\n]*\n같은 걸 보고도 어떤 사람은 "별거 없다"고 하고, 어떤 사람은 "왜 나만 다르지\?"라고 하더라고요\.\n근데 가만 보면 갈리는 지점이 딱 세 가지예요\.\n내 상황이[^\n]*\n기대하는 결과가 "바로"인지, 아니면 "천천히"인지\.\n지금 당장 해도 되는 타입인지, 잠깐 멈추는 게 나은 타입인지\.\n아래에서 3분 안에 체크하고 바로 결론 내릴 수 있게 정리해둘게요\.\n*/g,
      '',
    );
    out = out.replace(/\n{3,}/g, '\n\n');
    return out.trim();
  }

  private enforceOrdinalLineBreaks(text: string): string {
    if (!text) return text;
    const ord = '(?:첫째|첫쨰|둘째|셋째|넷째|다섯째)';
    let out = String(text);
    out = out.replace(new RegExp(`([^\n])\s*(${ord})\s*,`, 'g'), '$1\n$2,');
    out = out.replace(new RegExp(`(^|\n)\s*(${ord})\s*,`, 'g'), '$1$2,');
    return out;
  }

  // ✅ 계정 ID 해시 함수 (프로필 폴더명 생성용)
  private hashAccountId(accountId: string): string {
    let hash = 0;
    for (let i = 0; i < accountId.length; i++) {
      const char = accountId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  // ✅ 현재 계정의 프로필 경로 (계정별 독립 세션)
  private get accountProfileDir(): string {
    const accountHash = this.hashAccountId(this.options.naverId);
    return path.join(this.ACCOUNT_PROFILE_BASE, accountHash);
  }

  // 계정별 고정 프로필 (UA + 해상도)
  private getAccountConsistentProfile(): {
    userAgent: string;
    screen: { width: number; height: number };
  } {
    // ✅ [2026-03-27 FIX] FNV-1a 해시 — 문자 순서 구분 + 균등 분포
    let hash = 0x811c9dc5;
    for (let i = 0; i < this.options.naverId.length; i++) {
      hash ^= this.options.naverId.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash = hash >>> 0; // unsigned 32-bit

    // ✅ Chrome 버전 풀 확대 (10개 — 마이너 버전 다양화)
    const chromeVersions = [
      '131.0.6778.205', '132.0.6834.160', '133.0.6917.141',
      '133.0.6943.98', '134.0.6998.89', '134.0.6998.117',
      '134.0.7025.40', '135.0.7049.42', '135.0.7049.84',
      '135.0.7049.96',
    ];
    const version = chromeVersions[hash % chromeVersions.length];
    const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

    // ✅ 해상도 풀 확대 (8개)
    const screenConfigs = [
      { width: 1920, height: 1080 },
      { width: 1536, height: 864 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 1600, height: 900 },
      { width: 1680, height: 1050 },
      { width: 1280, height: 720 },
      { width: 1360, height: 768 },
    ];
    // 두 번째 해시로 해상도 선택 (버전과 독립적으로)
    const hash2 = Math.imul(hash, 0x9e3779b9) >>> 0;
    const screen = screenConfigs[hash2 % screenConfigs.length];

    return { userAgent, screen };
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  // ✅ 인간적인 타이핑 딜레이 (가우시안 분포 + 가끔 긴 휴식)
  private getTypingDelay(): number {
    // 더 넓은 범위로 변경하여 CAPTCHA 방지
    const mean = 120;    // 80ms → 120ms (더 느리게)
    const stdDev = 50;   // 30 → 50 (더 큰 변동성)

    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

    let delay = mean + stdDev * normal;

    // 가끔 더 긴 휴식 추가 (생각하는 것처럼 - 8% 확률)
    if (Math.random() < 0.08) {
      delay += this.randomInt(200, 500);
    }

    return Math.max(50, Math.min(350, delay));  // 50-350ms 범위
  }

  /**
   * ✅ [2026-03-27] 로그인 전용 타이핑 함수 (bvsd keyStrokeLogs 대응)
   * Puppeteer의 keyboard.type()는 keydown→keyup 간격이 1~6ms로 기계적.
   * 실제 사용자는 keydown→keyup가 30~100ms.
   * 이 함수는 keyboard.down()/up()을 직접 사용하여 두 간격 모두 자연스랽게 제어.
   */
  private async loginKeyType(page: Page, char: string): Promise<void> {
    // keydown → 인간적 hold 시간 → keyup
    const holdTime = this.randomInt(30, 100); // 실제 사용자의 keydown-keyup 간격
    await page.keyboard.down(char as KeyInput);
    await this.delay(holdTime);
    await page.keyboard.up(char as KeyInput);
    
    // 다음 키까지의 inter-key 딜레이 (정규분포)
    const interKeyDelay = this.getTypingDelay();
    await this.delay(interKeyDelay);
  }

  // ✅ 인간적인 딜레이
  private async humanDelay(min: number, max: number): Promise<void> {
    const delay = this.randomInt(min, max);
    await this.delay(delay);
  }

  /**
   * ✅ [2026-03-27] Stealth 보완 스크립트 (세션 재사용 시에도 재적용 가능한 독립 메서드)
   * - Canvas/Audio fingerprint 노이즈
   * - Screen 정보 오버라이드
   * - WebGL renderer/vendor 스푸핑 (C-1)
   * - navigator.hardwareConcurrency/deviceMemory 오버라이드
   * - CDP Network.setUserAgentOverride + brands 알고리즘
   * - Viewport 설정
   */
  private async setupStealthSupplements(): Promise<void> {
    if (!this.page) return;

    const profile = this.getAccountConsistentProfile();

    // evaluateOnNewDocument — 새 네비게이션 시 자동 주입
    await this.page.evaluateOnNewDocument((hw: any) => {
      try {
        const spoofNative = (fn: Function, name: string) => {
          const nativeStr = `function ${name}() { [native code] }`;
          fn.toString = () => nativeStr;
          fn.toLocaleString = () => nativeStr;
          const toStrNative = 'function toString() { [native code] }';
          fn.toString.toString = () => toStrNative;
          fn.toLocaleString.toString = () => toStrNative;
        };

        // navigator.connection
        const connRtt = 30 + Math.floor((Date.now() % 50));
        const connDownlink = 5 + ((Date.now() % 100) / 10);
        Object.defineProperty(navigator, 'connection', {
          get: () => ({ effectiveType: '4g', rtt: connRtt, downlink: connDownlink, saveData: false }),
        });

        // ✅ [C-1] navigator.hardwareConcurrency / deviceMemory (서버 코어수 노출 방지)
        const cores = [4, 8, 12, 16];
        const memory = [4, 8, 16];
        const coreSeed = (hw.screen.width * 7 + hw.screen.height * 13) % cores.length;
        const memSeed = (hw.screen.width * 11 + hw.screen.height * 3) % memory.length;
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores[coreSeed] });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => memory[memSeed] });

        // Canvas fingerprint (비파괴 방식)
        const canvasSeed = Date.now() % 65536;
        const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function (type?: string) {
          if (type === 'image/png' || !type) {
            try {
              const tmp = document.createElement('canvas');
              tmp.width = this.width; tmp.height = this.height;
              const ctx = tmp.getContext('2d');
              if (ctx) {
                ctx.drawImage(this, 0, 0);
                const img = ctx.getImageData(0, 0, tmp.width, tmp.height);
                for (let i = 0; i < img.data.length; i += 4) {
                  if (((canvasSeed * (i + 1) * 31) % 1000) < 1) img.data[i] ^= 1;
                }
                ctx.putImageData(img, 0, 0);
                return origToDataURL.call(tmp, type);
              }
            } catch (e) { console.debug('[Stealth] Canvas fingerprint spoof 실패:', e); }
          }
          return origToDataURL.apply(this, arguments as any);
        };
        spoofNative(HTMLCanvasElement.prototype.toDataURL, 'toDataURL');

        // Audio fingerprint
        const audioSeed = canvasSeed ^ 0xA5A5;
        const origGetChannelData = AudioBuffer.prototype.getChannelData;
        AudioBuffer.prototype.getChannelData = function (channel: number) {
          const data = origGetChannelData.call(this, channel);
          for (let i = 0; i < data.length; i += 100) {
            data[i] += (((audioSeed * (i + 1) * 17) % 10000) - 5000) / 50000000;
          }
          return data;
        };
        spoofNative(AudioBuffer.prototype.getChannelData, 'getChannelData');

        // Screen
        const screen = hw.screen;
        Object.defineProperty(window.screen, 'width', { get: () => screen.width });
        Object.defineProperty(window.screen, 'height', { get: () => screen.height });
        Object.defineProperty(window.screen, 'availWidth', { get: () => screen.width });
        Object.defineProperty(window.screen, 'availHeight', { get: () => screen.height - 40 });
        Object.defineProperty(window.screen, 'colorDepth', { get: () => 24 });
        Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24 });

        // ✅ [C-1] WebGL renderer/vendor 스푸핑
        const getParameterOrig = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (param: number) {
          const UNMASKED_VENDOR = 0x9245;
          const UNMASKED_RENDERER = 0x9246;
          if (param === UNMASKED_VENDOR) return 'Google Inc. (NVIDIA)';
          if (param === UNMASKED_RENDERER) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)';
          return getParameterOrig.call(this, param);
        };
        spoofNative(WebGLRenderingContext.prototype.getParameter, 'getParameter');

        // WebGL2도 동일 적용
        if (typeof WebGL2RenderingContext !== 'undefined') {
          const getParam2Orig = WebGL2RenderingContext.prototype.getParameter;
          WebGL2RenderingContext.prototype.getParameter = function (param: number) {
            if (param === 0x9245) return 'Google Inc. (NVIDIA)';
            if (param === 0x9246) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)';
            return getParam2Orig.call(this, param);
          };
          spoofNative(WebGL2RenderingContext.prototype.getParameter, 'getParameter');
        }
      } catch (e) { console.debug('[Stealth] Fingerprint 전체 spoof 실패:', e); }
    }, profile);

    // CDP UA override + brands
    const userAgent = profile.userAgent;
    const chromeVersion = userAgent.match(/Chrome\/(\d+)/)?.[1] || '134';
    const fullChromeVersion = userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/)?.[1] || `${chromeVersion}.0.0.0`;

    const seed = parseInt(chromeVersion);
    const brandOrders = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
    const order = brandOrders[seed % 6];
    const escapedChars = [' ', ' ', ';'];
    const greaseyBrand = `${escapedChars[order[0]]}Not${escapedChars[order[1]]}A${escapedChars[order[2]]}Brand`;
    const brands: { brand: string; version: string }[] = [];
    brands[order[0]] = { brand: greaseyBrand, version: '99' };
    brands[order[1]] = { brand: 'Chromium', version: chromeVersion };
    brands[order[2]] = { brand: 'Google Chrome', version: chromeVersion };

    const fullBrands: { brand: string; version: string }[] = [];
    fullBrands[order[0]] = { brand: greaseyBrand, version: '99.0.0.0' };
    fullBrands[order[1]] = { brand: 'Chromium', version: fullChromeVersion };
    fullBrands[order[2]] = { brand: 'Google Chrome', version: fullChromeVersion };

    let cdpClient: any = null;
    try {
      cdpClient = await this.page.createCDPSession();
      await cdpClient.send('Network.setUserAgentOverride', {
        userAgent,
        platform: 'Win32',
        acceptLanguage: 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        userAgentMetadata: {
          brands, fullVersionList: fullBrands, fullVersion: fullChromeVersion,
          platform: 'Windows', platformVersion: '15.0.0',
          architecture: 'x86', model: '', mobile: false, bitness: '64', wow64: false,
        },
      });
      this.log(`🔧 Stealth 보완: Chrome/${chromeVersion} + WebGL + Screen ${profile.screen.width}x${profile.screen.height}`);
    } catch (cdpError) {
      this.log(`⚠️ CDP UA 설정 실패: ${(cdpError as Error).message}`);
    } finally {
      // ✅ [M-4] CDP 세션 detach (리소스 누수 방지)
      if (cdpClient) {
        try { await cdpClient.detach(); } catch (e) { console.debug('[CDP] 세션 detach 실패 (이미 닫힘):', (e as Error).message); }
      }
    }

    // Client Hints 헤더
    try {
      const brandsHeader = brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-CH-UA': brandsHeader,
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
      });
    } catch (e) { console.debug('[Browser] Client Hints 헤더 설정 실패:', (e as Error).message); }

    // Viewport
    await this.page.setViewport({
      width: profile.screen.width,
      height: profile.screen.height - 100,
      deviceScaleFactor: 1, hasTouch: false, isLandscape: true, isMobile: false,
    });

    this.page.setDefaultNavigationTimeout(this.options.navigationTimeoutMs ?? 60000);
    this.page.setDefaultTimeout(60000);
  }

  // ✅ [2026-03-27] detectCaptcha() 데드코드 제거됨
  // 캡차 감지는 loginToNaver() 내부 루프에서 인라인으로 처리

  private async setBold(enabled: boolean): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    try {
      // ✅ setBold는 포커스 복구(End/클릭/재시도) 루프가 들어가면 툴바 상태가 계속 변하면서 깜빡임이 발생함.
      // 따라서 여기서는 무거운 ensureBodyFocus를 호출하지 않고, iframe 내부에서 가볍게 focus만 맞춘다.
      await frame
        .evaluate(() => {
          try {
            const el =
              (document.querySelector('.se-section-text, .se-main-container .se-editing-area, .se-editing-area, .se-component-content') as HTMLElement) /* bodyFocusable */ ||
              (document.querySelector('[contenteditable="true"]') as HTMLElement) /* contentEditable fallback */ ||
              (document.activeElement as HTMLElement | null);
            if (el && typeof el.focus === 'function') {
              el.focus();
            }
          } catch (e) {
            console.warn('[naverBlogAutomation] catch ignored:', e);
          }
        })
        .catch(() => undefined);

      // ✅ [Phase 1-1] 셀렉터 레지스트리 사용
      const selectors = [...getAllSelectors(SELECTORS.editor.boldButton)];

      const readState = async (): Promise<boolean> => this.getBoldState(frame, page, selectors);

      const current = await readState().catch(() => false);
      if (Boolean(current) === Boolean(enabled)) return;

      // 1) 가장 안정적인 방법: iframe 내부에서 queryCommandState/execCommand
      const appliedByCommand = await frame
        .evaluate((want: boolean) => {
          try {
            const q = typeof document.queryCommandState === 'function' ? Boolean(document.queryCommandState('bold')) : null;
            if (q !== null && q !== want && typeof document.execCommand === 'function') {
              document.execCommand('bold');
            }
            const after = typeof document.queryCommandState === 'function' ? Boolean(document.queryCommandState('bold')) : null;
            if (after === null) return false;
            return after === want;
          } catch {
            return false;
          }
        }, Boolean(enabled))
        .catch(() => false);

      if (appliedByCommand) return;

      // 2) 툴바 클릭(한 번만): 툴바가 iframe 밖에 있을 수 있으므로 page + frame 둘 다
      const clicked = await this.clickBoldButton(frame, page, selectors).catch(() => false);
      if (clicked) {
        await this.delay(120);
        const after = await readState().catch(() => false);
        if (Boolean(after) === Boolean(enabled)) return;
      }

      // 3) 최후 수단: Ctrl+B (한 번만)
      try {
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyB');
        await page.keyboard.up('Control');
      } catch (e) {
        console.warn('[naverBlogAutomation] catch ignored:', e);
      }
    } catch (error) {
      this.log(`⚠️ 굵게(Bold) 설정 실패 (무시하고 계속): ${(error as Error).message}`);
    }
  }

  private async clickBoldButton(frame: Frame, page: Page, selectors: string[]): Promise<boolean> {
    const clickInContext = async (evaluateTarget: Page | Frame): Promise<boolean> => {
      return await evaluateTarget
        .evaluate((sels: string[]) => {
          for (const sel of sels) {
            const btn = document.querySelector(sel);
            if (btn instanceof HTMLElement) {
              btn.click();
              return true;
            }
          }
          return false;
        }, selectors)
        .catch(() => false);
    };

    // page(툴바) -> frame(툴바) 순서로 클릭
    const clickedOnPage = await clickInContext(page);
    if (clickedOnPage) return true;
    return await clickInContext(frame);
  }

  private async getBoldState(frame: Frame, page: Page, selectors?: string[]): Promise<boolean> {
    const sels = Array.isArray(selectors) && selectors.length > 0
      ? selectors
      : [
        'button[data-name="bold"]',
        'button.se-toolbar-button[data-command="bold"]',
        'button[aria-label*="굵게"]',
        'button[title*="굵게"]',
      ];

    const readToolbar = async (target: Page | Frame): Promise<boolean | null> => {
      return await target
        .evaluate((s: string[]) => {
          for (const sel of s) {
            const el = document.querySelector(sel);
            if (!(el instanceof HTMLElement)) continue;
            const active =
              el.classList.contains('active') ||
              el.classList.contains('selected') ||
              el.getAttribute('aria-pressed') === 'true';
            return Boolean(active);
          }
          return null;
        }, sels)
        .catch(() => null);
    };

    const pageToolbar = await readToolbar(page);
    if (typeof pageToolbar === 'boolean') return pageToolbar;

    const frameToolbar = await readToolbar(frame);
    if (typeof frameToolbar === 'boolean') return frameToolbar;

    const commandState = await frame
      .evaluate(() => {
        try {
          if (typeof document.queryCommandState !== 'function') return false;
          return Boolean(document.queryCommandState('bold'));
        } catch {
          return false;
        }
      })
      .catch(() => false);

    return Boolean(commandState);
  }

  // ✅ [2026-02-19] 카테고리 자동 선택 — 스톨 방지 최적화 버전
  // 통합 CSS 쿼리, 전체 15초 타임아웃, ESC 정리 일관성
  private async selectCategoryInPublishModal(frame: Frame, page: Page): Promise<void> {
    return await publishHelpers.selectCategoryInPublishModal(this, frame, page);
  }

  // ✅ [2026-02-09] 카테고리 디버그 - 발행 모달의 DOM 구조 로그
  private async debugCategoryElements(frame: Frame, page: Page): Promise<void> {
    return await publishHelpers.debugCategoryElements(this, frame, page);
  }

  // ✅ [2026-02-14] 기기 등록 URL 패턴 감지 헬퍼
  private isDeviceConfirmUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return ['deviceconfirm', 'device_confirm', 'new_device', 'register_device', 'devicereg']
      .some(p => lower.includes(p));
  }

  // ✅ [2026-02-14] 기기 등록 페이지 감지 (URL + 페이지 텍스트 이중 검사)
  private async isDeviceConfirmPage(page: Page): Promise<boolean> {
    // 1차: URL 패턴
    if (this.isDeviceConfirmUrl(page.url())) return true;
    // 2차: 페이지 텍스트 기반 (URL 변경 시에도 동작)
    const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    return (text.includes('새로운 기기') && text.includes('등록')) ||
      (text.includes('기기를 등록하면') && text.includes('알림'));
  }

  // ✅ [2026-03-07] 기기 등록 화면 자동 처리 — "등록" 클릭
  // 검증된 실제 DOM 구조 (Playwright 스냅샷 2026-03-07):
  //   URL: nid.naver.com/login/ext/deviceConfirm
  //   <fieldset> (group "새로운 기기 등록")
  //     <a href="#">등록</a>      ← 첫 번째 링크
  //     <a href="#">등록안함</a>   ← 두 번째 링크
  //   </fieldset>
  //   ※ ID 셀렉터 없음 (#new.save, #new.dontsave 존재하지 않음)
  // 계정별 독립 프로필(userDataDir) 사용 → 기기 등록이 안전
  // "등록안함" 시 미등록 기기로 남아 보호조치 발동 위험 ↑
  private async handleDeviceConfirmPage(page: Page): Promise<boolean> {
    this.log('📱 기기 등록 페이지 감지 → 자동으로 "등록" 클릭 (신뢰 기기 등록)...');
    try {
      // 페이지 로드 대기 (링크가 렌더링될 때까지)
      await page.waitForSelector('fieldset a, a', { timeout: 5000 }).catch(() => null);
      await this.delay(500);

      // ═══════════════════════════════════════════════════
      // 1단계: 텍스트 정확 매칭 (가장 신뢰도 높음)
      // 실제 DOM: <a href="#">등록</a> (텍스트가 정확히 "등록")
      // ═══════════════════════════════════════════════════
      const clicked = await page.evaluate(() => {
        const allLinks = document.querySelectorAll('a, button');
        // 1차: 정확한 '등록' 매칭 (텍스트가 오직 "등록"인 경우)
        for (const el of allLinks) {
          const text = (el.textContent || '').trim();
          if (text === '등록') {
            (el as HTMLElement).click();
            return 'exact';
          }
        }
        // 2차: '등록하기', '기기 등록' 등 변형 (안함/안 함 제외)
        for (const el of allLinks) {
          const text = (el.textContent || '').trim();
          if ((text === '기기 등록' || text === '기기등록' || text === '등록하기') &&
            !text.includes('안함') && !text.includes('안 함')) {
            (el as HTMLElement).click();
            return 'variant';
          }
        }
        return null;
      }).catch(() => null);

      if (clicked) {
        this.log(`✅ "등록" 클릭 성공! (텍스트 매칭: ${clicked})`);
        await this.delay(2000);
        return true;
      }

      // ═══════════════════════════════════════════════════
      // 2단계: fieldset 내 첫 번째 <a> 클릭
      // 검증된 구조: 등록=첫 번째, 등록안함=두 번째
      // ═══════════════════════════════════════════════════
      const fieldsetClick = await page.evaluate(() => {
        const fieldset = document.querySelector('fieldset');
        if (fieldset) {
          const links = fieldset.querySelectorAll('a');
          if (links.length >= 2) {
            const firstText = (links[0].textContent || '').trim();
            if (!firstText.includes('안함') && !firstText.includes('안 함')) {
              (links[0] as HTMLElement).click();
              return `fieldset-first: "${firstText}"`;
            }
          }
          // 단일 링크인 경우
          if (links.length === 1) {
            (links[0] as HTMLElement).click();
            return `fieldset-only: "${(links[0].textContent || '').trim()}"`;
          }
        }
        return null;
      }).catch(() => null);

      if (fieldsetClick) {
        this.log(`✅ "등록" 클릭 성공! (${fieldsetClick})`);
        await this.delay(2000);
        return true;
      }

      // ═══════════════════════════════════════════════════
      // 3단계: 최후 폴백 — "등록" 포함 + "안함" 미포함 링크
      // ═══════════════════════════════════════════════════
      const lastResort = await page.evaluate(() => {
        const allLinks = document.querySelectorAll('a');
        for (const el of allLinks) {
          const text = (el.textContent || '').trim();
          if (text.includes('등록') && !text.includes('안함') && !text.includes('안 함') &&
            !text.includes('하지') && text.length < 15) {
            (el as HTMLElement).click();
            return `partial: "${text}"`;
          }
        }
        return null;
      }).catch(() => null);

      if (lastResort) {
        this.log(`✅ "등록" 클릭 성공! (폴백: ${lastResort})`);
        await this.delay(2000);
        return true;
      }

      this.log('⚠️ "등록" 버튼을 찾지 못했습니다. 수동으로 클릭해주세요.');
      const debugInfo = await page.evaluate(() => {
        const els = document.querySelectorAll('a, button');
        return Array.from(els).map(el => `[${el.tagName}] "${(el.textContent || '').trim()}" id=${el.id}`).join(' | ');
      }).catch(() => '');
      this.log(`   🔍 페이지 요소: ${debugInfo}`);
      return false;
    } catch (err) {
      this.log(`⚠️ 기기 등록 화면 처리 실패: ${(err as Error).message}`);
      return false;
    }
  }

  // ✅ [2026-02-09] 2단계 인증 페이지 감지 및 자동 처리
  // - "이 브라우저는 2단계 인증 없이 로그인합니다" 체크박스 자동 체크
  // - 사용자가 네이버 앱에서 승인할 때까지 대기
  private async handleTwoFactorAuthPage(page: Page, alreadyNotified: boolean = false): Promise<boolean> {
    try {
      // 2단계 인증 페이지 여부 확인 (페이지 텍스트 기반)
      const is2FA = await page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        return (bodyText.includes('2단계 인증') &&
          (bodyText.includes('알림 발송') || bodyText.includes('인증요청') ||
            bodyText.includes('인증 알림') || bodyText.includes('승인하시겠습니까')));
      }).catch(() => false);

      if (!is2FA) return false;

      if (!alreadyNotified) {
        this.log('');
        this.log('🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐');
        this.log('📱  2단계 인증 페이지 감지!');
        this.log('📲  네이버 앱에서 인증을 승인해주세요!');
        this.log('⏳  승인 후 자동으로 진행됩니다.');
        this.log('🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐');
        this.log('');

        // ✅ "이 브라우저는 2단계 인증 없이 로그인합니다" 체크박스 자동 체크
        const checkedSkip = await page.evaluate(() => {
          // 방법 1: 표준 checkbox
          const checkboxes = document.querySelectorAll('input[type="checkbox"]');
          for (const cb of checkboxes) {
            const parent = cb.closest('label') || cb.parentElement;
            const nearbyText = parent?.textContent || '';
            if (nearbyText.includes('2단계') && nearbyText.includes('없이')) {
              if (!(cb as HTMLInputElement).checked) {
                (cb as HTMLInputElement).click();
              }
              return 'checkbox';
            }
          }
          // 방법 2: 텍스트 기반 클릭 (커스텀 체크박스)
          const allEls = document.querySelectorAll('label, span, div, a, button, p');
          for (const el of allEls) {
            const text = (el.textContent || '').trim();
            if (text.includes('2단계') && text.includes('없이') && text.includes('로그인')) {
              const innerCb = el.querySelector('input[type="checkbox"]');
              if (innerCb) {
                if (!(innerCb as HTMLInputElement).checked) {
                  (innerCb as HTMLInputElement).click();
                }
                return 'inner-checkbox';
              }
              (el as HTMLElement).click();
              return 'element-click';
            }
          }
          return null;
        }).catch(() => null);

        if (checkedSkip) {
          this.log(`✅ "이 브라우저는 2단계 인증 없이 로그인" 자동 체크! (${checkedSkip})`);
        } else {
          this.log('ℹ️ 체크박스를 찾지 못했습니다 (이미 체크됐거나 없는 페이지)');
        }

        // Windows 소리 알림 (3번)
        try {
          const { exec } = await import('child_process');
          exec('powershell -c "1..3 | ForEach-Object { (New-Object Media.SoundPlayer \\\"C:\\Windows\\Media\\notify.wav\\\").PlaySync(); Start-Sleep -Milliseconds 500 }"');
        } catch { /* ignore */ }

        // progressCallback으로 UI 알림
        if (this.progressCallback) {
          this.progressCallback(0, 100, '📱 2단계 인증! 네이버 앱에서 승인해주세요!');
        }
      }

      return true;
    } catch (err) {
      this.log(`⚠️ 2단계 인증 처리 중 오류: ${(err as Error).message}`);
      return false;
    }
  }

  // ✅ 수동 로그인 대기 함수 (페이지 이동 없이 현재 URL만 확인)
  private async waitForManualLogin(page: Page, maxWaitMs: number = 600000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 2000; // 2초마다 확인

    this.log('');
    this.log('👀 브라우저 창에서 로그인을 완료해주세요...');
    this.log('   로그인이 완료되면 자동으로 감지됩니다.');
    this.log('');

    while (Date.now() - startTime < maxWaitMs) {
      this.ensureNotCancelled();

      // 현재 페이지 URL만 확인 (페이지 이동 없이!)
      const currentUrl = page.url();

      // ✅ [2026-02-14] 기기 등록 화면 자동 처리 (URL + 페이지 텍스트 이중 감지)
      if (await this.isDeviceConfirmPage(page)) {
        await this.handleDeviceConfirmPage(page);
        continue;
      }

      // ✅ [2026-02-09] 2단계 인증 페이지 자동 처리
      const is2FAManual = await this.handleTwoFactorAuthPage(page);
      if (is2FAManual) {
        continue;
      }

      // 로그인 페이지가 아니고, 블로그 페이지에 도착했으면 성공
      if (currentUrl.includes('blog.naver.com') && !currentUrl.includes('login')) {
        this.log('');
        this.log('✅✅✅ 블로그 페이지 도착! 로그인 성공! ✅✅✅');
        this.log('🎉 이제 자동화를 계속 진행합니다.');
        this.log('');
        return;
      }

      // 네이버 메인이나 다른 페이지로 이동했으면 (로그인 페이지가 아닌 경우)
      if (!currentUrl.includes('nidlogin') &&
        !currentUrl.includes('login') &&
        currentUrl.includes('naver.com')) {
        // 블로그 페이지로 직접 이동 시도
        this.log('✅ 로그인 감지! 블로그 페이지로 이동합니다...');
        try {
          await page.goto('https://blog.naver.com/GoBlogWrite.naver', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
          });
          await this.delay(2000);

          const newUrl = page.url();
          if (newUrl.includes('blog.naver.com') && !newUrl.includes('login')) {
            this.log('');
            this.log('✅✅✅ 블로그 페이지 접속 성공! ✅✅✅');
            this.log('');
            return;
          }
        } catch (e) {
          // 이동 실패하면 계속 대기
        }
      }

      // 남은 시간 표시 (30초마다)
      const elapsed = Date.now() - startTime;
      const remaining = maxWaitMs - elapsed;
      const remainingMin = Math.floor(remaining / 60000);
      const remainingSec = Math.floor((remaining % 60000) / 1000);

      if (Math.floor(elapsed / 1000) % 30 === 0 && elapsed > 0) {
        this.log(`⏳ 로그인 대기 중... (남은 시간: ${remainingMin}분 ${remainingSec}초)`);
        this.log(`   현재 URL: ${currentUrl.substring(0, 60)}...`);
      }

      await this.delay(checkInterval);
    }

    throw new Error('수동 로그인 시간이 초과되었습니다. (10분)');
  }

  private log(message: string): void {
    this.logger?.(message);
  }

  /**
   * ✅ [v1.4.54] 실패 순간 자동 DOM 덤프
   * 실패 catch 지점에서 한 줄로 호출 가능. 실패해도 자동화 흐름 방해하지 않음.
   *
   * 저장 경로: %APPDATA%/BetterLifeNaver/debug-dumps/
   * 저장 내용: 스크린샷 + HTML + 콘솔/네트워크 로그 + 메타데이터 (민감정보 자동 스크럽)
   */
  private async dumpFailure(
    action: string,
    error: Error | unknown,
    extra?: { errorCode?: string; fallbackStage?: number; context?: Record<string, unknown> }
  ): Promise<void> {
    try {
      if (!this.page) return;
      const err = error instanceof Error ? error : new Error(String(error));
      const { dumpFailure: dump } = await import('./debug/domDumpManager.js');
      const result = await dump(this.page, {
        action,
        error: err,
        errorCode: extra?.errorCode,
        fallbackStage: extra?.fallbackStage,
        accountId: (this.options as any)?.naverId || (this.options as any)?.accountId,
        context: extra?.context,
      });
      if (result.success && result.dumpPath) {
        this.log(`📦 실패 덤프 저장: ${result.dumpPath}`);
      } else if (!result.success) {
        this.log(`⚠️ 덤프 저장 실패: ${result.error}`);
      }
    } catch (e) {
      // 덤프 자체가 실패해도 원본 자동화 흐름은 방해하지 않음
      try {
        this.log(`⚠️ 덤프 함수 예외: ${(e as Error).message}`);
      } catch {}
    }
  }

  // ✅ [2026-04-11 FIX] 대기 중 cancel 체크 — 긴 delay에서도 취소 즉시 반응
  private async delay(ms: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (this.cancelRequested) {
        throw new Error('사용자가 자동화를 취소했습니다.');
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(500, ms - (Date.now() - start))));
    }
  }

  /**
   * ✅ [2026-02-03] 링크 카드(OG Preview)가 로딩될 때까지 polling 대기
   * URL 입력 후 네이버 에디터가 자동으로 생성하는 링크 카드를 감지합니다.
   * @param timeoutMs - 최대 대기 시간 (기본 15초)
   * @param pollIntervalMs - polling 간격 (기본 500ms)
   * @returns 링크 카드가 발견되면 true, 타임아웃되면 false
   */
  private async waitForLinkCard(timeoutMs: number = 15000, pollIntervalMs: number = 500): Promise<boolean> {
    const startTime = Date.now();
    const frame = await this.getAttachedFrame();

    // 링크 카드가 생성되기 전의 링크 카드 개수를 먼저 확인
    const initialCount = await frame.evaluate(() => {
      const selectors = [
        '.se-oglink',
        '.se-module-oglink',
        '.se-oembed',
        '.se-module-oembed',
        '.se-link-preview',
        '[data-module="oglink"]',
        '[class*="oglink"]',
        '[class*="oembed"]',
        '.se-section-oglink',
      ];
      let count = 0;
      for (const sel of selectors) {
        count += document.querySelectorAll(sel).length;
      }
      return count;
    }).catch(() => 0);

    this.log(`   🔍 링크 카드 polling 시작 (현재 ${initialCount}개, 최대 ${timeoutMs / 1000}초 대기)`);

    while (Date.now() - startTime < timeoutMs) {
      this.ensureNotCancelled();

      const currentCount = await frame.evaluate(() => {
        const selectors = [
          '.se-oglink',
          '.se-module-oglink',
          '.se-oembed',
          '.se-module-oembed',
          '.se-link-preview',
          '[data-module="oglink"]',
          '[class*="oglink"]',
          '[class*="oembed"]',
          '.se-section-oglink',
        ];
        let count = 0;
        for (const sel of selectors) {
          count += document.querySelectorAll(sel).length;
        }
        return count;
      }).catch(() => 0);

      if (currentCount > initialCount) {
        const elapsed = Math.round((Date.now() - startTime) / 100) / 10;
        this.log(`   ✅ 링크 카드 감지 완료! (${elapsed}초 소요, ${initialCount} → ${currentCount}개)`);
        // 렌더링 완료를 위한 추가 대기
        await this.delay(500);
        return true;
      }

      await this.delay(pollIntervalMs);
    }

    // 타임아웃 - 링크 카드가 생성되지 않음 (네트워크 느림 또는 유효하지 않은 URL)
    this.log(`   ⚠️ 링크 카드 로딩 타임아웃 (${timeoutMs / 1000}초) - 계속 진행합니다`);
    return false;
  }

  private ensureNotCancelled(): void {
    if (this.cancelRequested) {
      throw new Error('사용자가 자동화를 취소했습니다.');
    }
  }


  private async normalizeSpacingAfterLastImage(frame: Frame, allowedEmptyBlocks: number = 1): Promise<void> {
    try {
      await frame.evaluate((allowed: number) => {
        const body = document.querySelector('.se-section-text, .se-main-container') as HTMLElement | null;
        if (!body) return;

        const images = body.querySelectorAll(
          'img.se-image-resource, img[data-se-image-resource="true"], .se-module-image img, img[src*="blob:"], img[src*="blogfiles"], img[src*="postfiles"]'
        );
        const lastImg = images.length > 0 ? (images[images.length - 1] as HTMLImageElement) : null;
        if (!lastImg) return;

        const imageNode = (lastImg.closest('.se-module-image, .se-image-wrap, figure, .se-module-image-link') as HTMLElement | null) || lastImg;
        if (!imageNode) return;

        // Find the nearest child module under body to start sibling traversal
        let moduleEl: HTMLElement | null = imageNode as HTMLElement;
        while (moduleEl && moduleEl.parentElement && moduleEl.parentElement !== body) {
          moduleEl = moduleEl.parentElement as HTMLElement;
        }
        if (!moduleEl || moduleEl.parentElement !== body) return;

        const isEmptyBlock = (el: Element): boolean => {
          if (!(el instanceof HTMLElement)) return false;
          if (el.querySelector('img, video, iframe, table')) return false;
          const text = (el.textContent || '').replace(/\u00A0/g, ' ').trim();
          return text.length === 0;
        };

        const collapseEmptyParagraphs = (el: Element) => {
          // Collapse multiple empty paragraphs inside a kept empty text block
          const paras = Array.from(el.querySelectorAll('.se-text-paragraph, p'));
          const emptyParas = paras.filter((p) => {
            const hasMedia = !!p.querySelector('img, video, iframe, table');
            const t = (p.textContent || '').replace(/\u00A0/g, ' ').trim();
            return !hasMedia && t.length === 0;
          });
          if (emptyParas.length <= 1) return;
          for (let i = 1; i < emptyParas.length; i++) {
            emptyParas[i].remove();
          }
        };

        let kept = 0;
        let cursor: Element | null = moduleEl.nextElementSibling;
        while (cursor && isEmptyBlock(cursor)) {
          const next = cursor.nextElementSibling;
          if (kept < allowed) {
            kept++;
            collapseEmptyParagraphs(cursor);
          } else {
            cursor.remove();
          }
          cursor = next;
        }
      }, Math.max(0, Number(allowedEmptyBlocks) || 0));
    } catch (error) {
      this.log(`⚠️ 이미지/본문 간격 정리 실패 (무시하고 계속): ${(error as Error).message}`);
    }
  }

  /**
   * 시스템에 설치된 Chrome 경로를 찾습니다.
   * Windows에서 일반적인 Chrome 설치 경로를 확인합니다.
   */
  private findChromeExecutable(): string | undefined {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows에서 일반적인 Chrome 설치 경로들
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
      ];

      for (const chromePath of possiblePaths) {
        try {
          // 파일이 존재하는지 확인
          if (existsSync(chromePath)) {
            this.log(`✅ 시스템 Chrome 발견: ${chromePath}`);
            return chromePath;
          }
        } catch (error) {
          // 무시하고 다음 경로 확인
        }
      }

      // 레지스트리에서 Chrome 경로 찾기 시도
      try {
        const regQuery = execSync(
          'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve',
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
        );
        const match = regQuery.match(/REG_SZ\s+(.+)/);
        if (match && match[1]) {
          const chromePath = match[1].trim();
          if (existsSync(chromePath)) {
            this.log(`✅ 레지스트리에서 Chrome 발견: ${chromePath}`);
            return chromePath;
          }
        }
      } catch (error) {
        // 레지스트리 조회 실패 시 무시
      }
    } else if (platform === 'darwin') {
      // macOS
      const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      if (existsSync(chromePath)) {
        this.log(`✅ 시스템 Chrome 발견: ${chromePath}`);
        return chromePath;
      }
    } else if (platform === 'linux') {
      // Linux
      const possiblePaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ];
      for (const chromePath of possiblePaths) {
        if (existsSync(chromePath)) {
          this.log(`✅ 시스템 Chrome 발견: ${chromePath}`);
          return chromePath;
        }
      }
    }

    this.log('⚠️ 시스템 Chrome을 찾을 수 없습니다. Puppeteer가 자동으로 다운로드한 Chrome을 사용합니다.');
    return undefined;
  }

  private ensurePage(): Page {
    if (!this.page) {
      throw new Error('브라우저 페이지가 초기화되지 않았습니다. setupBrowser()를 먼저 호출하세요.');
    }
    return this.page;
  }

  private async getAttachedFrame(): Promise<Frame> {
    if (!this.mainFrame) {
      await this.switchToMainFrame();
    } else {
      try {
        // 프레임이 여전히 유효한지 확인
        await this.mainFrame.evaluate(() => true);
      } catch (error) {
        // ✅ 모든 프레임 오류에 대해 재연결 시도 (안정성 개선)
        const errorMsg = (error as Error).message;
        this.log(`   ⚠️ 프레임 오류 발생: ${errorMsg.substring(0, 50)}...`);
        this.log('   🔄 프레임 재연결 시도 중...');
        this.mainFrame = null; // 강제 리셋
        await this.switchToMainFrame();
      }
    }

    if (!this.mainFrame) {
      throw new Error('메인 프레임에 접근할 수 없습니다. switchToMainFrame()을 먼저 호출하세요.');
    }
    return this.mainFrame;
  }

  async cancel(): Promise<void> {
    this.cancelRequested = true;
    this.log('⚠️ 자동화 취소 요청을 받았습니다.');

    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
      this.page = null;
      this.mainFrame = null;
      this.log('🔚 브라우저 세션이 취소 요청으로 종료되었습니다.');
    }
  }

  /**
   * ✅ [NEW] 자동화 즉시 중지 (AutomationService에서 호출)
   * cancel()과 동일한 기능이지만 명시적인 메서드명으로 제공
   */
  async stopAutomation(): Promise<void> {
    this.cancelRequested = true;
    this.log('⚠️ 즉시 중지 요청 (stopAutomation 호출됨)');

    // ✅ [2026-03-27 FIX] M-3: browser.close() 완료 대기 후 null 할당
    if (this.browser) {
      try { await this.browser.close(); } catch (e) { console.debug('[Browser] stopAutomation 브라우저 종료 실패 (이미 닫힘):', (e as Error).message); }
      this.browser = null;
      this.page = null;
      this.mainFrame = null;
    }
  }

  private resolveRunOptions(runOptions: RunOptions): ResolvedRunOptions {
    const structured = runOptions.structuredContent;

    // ✅ [2026-03-11 FIX] 입력 검증 - publishMode 연동 + 날짜/시간 분리 전달 자동 결합
    if (runOptions.scheduleDate) {
      // publishMode가 schedule이 아닌데 scheduleDate가 있으면 무시 (즉시발행 시 잔존값 방지)
      if (runOptions.publishMode !== 'schedule' && runOptions.publishMode !== 'draft') {
        runOptions.scheduleDate = undefined;
      } else {
        // T구분자를 공백으로 정규화 (예: "2026-02-19T10:30" → "2026-02-19 10:30")
        runOptions.scheduleDate = runOptions.scheduleDate.replace('T', ' ');
        // 날짜만 있고 시간이 없으면 scheduleTime에서 결합 (분리 전달 호환)
        if (/^\d{4}-\d{2}-\d{2}$/.test(runOptions.scheduleDate) && (runOptions as any).scheduleTime) {
          runOptions.scheduleDate = `${runOptions.scheduleDate} ${(runOptions as any).scheduleTime}`;
        }
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(runOptions.scheduleDate)) {
          throw new Error('예약발행 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD HH:mm 형식)');
        }
      }
    }

    const ctasFromInput = Array.isArray(runOptions.ctas) ? runOptions.ctas : [];
    const ctas = (() => {
      const list = ctasFromInput
        .map((c) => ({
          text: String((c as any)?.text || '').trim(),
          link: String((c as any)?.link || '').trim(),
        }))
        .filter((c) => c.text);
      if (list.length > 0) return list;
      const t = String(runOptions.ctaText || '').trim();
      const l = String(runOptions.ctaLink || '').trim();
      return t ? [{ text: t, link: l }] : [];
    })();

    for (const cta of ctas) {
      if (cta.link && !/^https?:\/\//.test(cta.link)) {
        throw new Error('CTA 링크는 유효한 URL 형식이어야 합니다. (http:// 또는 https://로 시작)');
      }
    }

    const hashtags = Array.from(
      new Set(
        (runOptions.hashtags ??
          structured?.hashtags ??
          []).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean),
      ),
    );

    if (hashtags.length > 5) {
      this.log(`⚠️ 해시태그가 5개를 초과합니다. (${hashtags.length}개) 처음 5개만 사용됩니다.`);
      hashtags.splice(5);
    }

    // 이미지 파일 경로 검증 및 정규화
    if (runOptions.images) {
      for (const image of runOptions.images) {
        // ✅ savedToLocal이 있으면 filePath로 복사 (저장된 이미지 우선)
        // savedToLocal은 문자열(경로) 또는 불린(true/false)일 수 있음
        if (image.savedToLocal) {
          // 타입 체크: 문자열이면 경로로 사용, 불린이면 무시
          if (typeof image.savedToLocal === 'string' && image.savedToLocal.trim() !== '') {
            image.filePath = image.savedToLocal;
            this.log(`   📁 저장된 이미지 경로 사용: ${image.savedToLocal.replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~')}`);
          } else if (typeof image.savedToLocal === 'boolean' && image.savedToLocal === true) {
            // 불린 true면 이미 filePath가 설정되어 있다고 가정
            this.log(`   📁 저장된 이미지 사용 (경로: ${image.filePath})`);
          }
        }

        // ✅ filePath가 존재하는 경우에만 체크
        if (image.filePath && !image.filePath.startsWith('http://') && !image.filePath.startsWith('https://') && !image.filePath.startsWith('data:')) {
          // 로컬 파일 경로는 나중에 확인 (비동기 작업)
        }
      }
    }

    // ✅ [100점 수정] 제목에서도 마크다운/HTML 포맷팅 완전 제거
    // ✅ [2026-01-20] 폴백 값 제거 - 콘텐츠 없으면 에러 던지기 (플레이스홀더 발행 방지)
    const rawTitle =
      structured?.selectedTitle?.trim() ||
      runOptions.title?.trim() ||
      this.options.defaultTitle?.trim();

    if (!rawTitle) {
      throw new Error('❌ 발행 실패: 제목이 없습니다. 콘텐츠 생성이 필요합니다.');
    }
    const title = stripAllFormatting(rawTitle);

    // ✅ [2026-01-16] 발행 직전 **bold**, <u>underline</u> 등 마크다운/HTML 완전 제거
    // ✅ [2026-01-20] 폴백 값 제거 - 콘텐츠 없으면 에러 던지기
    const rawContent =
      structured?.bodyPlain?.trim() ||
      runOptions.content?.trim() ||
      this.options.defaultContent?.trim();

    if (!rawContent) {
      throw new Error('❌ 발행 실패: 본문 내용이 없습니다. 콘텐츠 생성이 필요합니다.');
    }
    const content = removeOrdinalHeadingLabelsFromBody(rawContent);

    const rawLines = runOptions.lines ?? this.options.defaultLines ?? 5;
    const lines = Number.isFinite(rawLines) && rawLines > 0 ? Math.floor(rawLines) : 5;

    return {
      title,
      content,
      lines,
      selectedHeadings: runOptions.selectedHeadings ?? [],
      structuredContent: structured,
      hashtags,
      ctaLink: runOptions.ctaLink?.trim(),
      ctaText: runOptions.ctaText?.trim(),
      ctas,
      ctaPosition: runOptions.ctaPosition || 'bottom', // 기본값: 하단
      skipCta: runOptions.skipCta || false, // ✅ CTA 없이 발행하기
      images: runOptions.images ?? [],
      publishMode: runOptions.publishMode ?? 'publish', // ✅ [2026-03-10 FIX] 기본값을 즉시발행으로 변경
      scheduleDate: runOptions.scheduleDate,
      scheduleType: runOptions.scheduleType || 'naver-server', // ✅ [2026-02-07 FIX] 기본값: 네이버 서버 예약 (app-schedule은 미구현)
      scheduleMethod: runOptions.scheduleMethod || 'datetime-local', // 기본값: datetime-local
      skipImages: runOptions.skipImages || runOptions.imageMode === 'skip' || false, // ✅ [v1.4.66] imageMode:'skip'도 skipImages로 처리
      imageMode: runOptions.imageMode,
      collectedImages: runOptions.collectedImages,
      toneStyle: runOptions.toneStyle ?? 'professional',
      categoryName: runOptions.categoryName,
      useIntelligentImagePlacement: runOptions.useIntelligentImagePlacement,
      onlyImagePlacement: runOptions.onlyImagePlacement,
      keepBrowserOpen: runOptions.keepBrowserOpen ?? true, // ✅ 기본값 true로 변경 (세션 유지)
      affiliateLink: runOptions.affiliateLink?.trim(),
      useAffiliateVideo: runOptions.useAffiliateVideo ?? false,
      contentMode: runOptions.contentMode,
      useAiImage: runOptions.useAiImage,
      // ✅ 쇼핑커넥트 모드에서는 자동으로 제품 이미지 썸네일 활성화
      createProductThumbnail: runOptions.createProductThumbnail ||
        (runOptions.contentMode === 'affiliate' || !!runOptions.affiliateLink),
      includeThumbnailText: runOptions.includeThumbnailText || false,
      isFullAuto: runOptions.isFullAuto ?? false, // ✅ 풀오토 모드 전달
      previousPostTitle: runOptions.previousPostTitle, // ✅ 같은 카테고리 이전글 제목
      previousPostUrl: runOptions.previousPostUrl, // ✅ 같은 카테고리 이전글 URL
      thumbnailPath: runOptions.thumbnailPath, // ✅ [2026-03-03 FIX] 대표사진 경로 전달
    };
  }

  async setupBrowser(): Promise<void> {
    this.ensureNotCancelled();

    // ✅ [Phase 1] BrowserSessionManager로 세션 재사용 시도 (CAPTCHA 방지 핵심!)
    try {
      this.log('🔄 BrowserSessionManager에서 세션 확인 중...');
      const session = await browserSessionManager.getOrCreateSession(
        this.options.naverId,
        this.options.headless ?? false,
        this.options.accountProxyUrl // ✅ 계정별 프록시 전달
      );

      // 세션에서 브라우저와 페이지 가져오기
      this.browser = session.browser;
      this.page = session.page;

      // 연결 상태 확인
      if (this.browser.isConnected()) {
        // 페이지가 유효한지 확인
        try {
          await this.page.url();
          this.log(`✅ BrowserSessionManager 세션 재사용 성공! (로그인: ${session.isLoggedIn ? '✅' : '❌'})`);

          // 탭 정리
          const pages = await this.browser.pages();
          let closedCount = 0;
          for (const p of pages) {
            if (p !== this.page) {
              await p.close().catch(() => { });
              closedCount++;
            }
          }
          if (closedCount > 0) {
            this.log(`   🧹 ${closedCount}개 불필요한 탭 정리됨`);
          }

          // ✅ Ghost Cursor 초기화
          this.cursor = createGhostCursor(this.page);
          this.log('   🎯 Ghost Cursor 초기화 완료');

          // ✅ [2026-03-26] 최소화된 브라우저 창 복원 (이전 발행 후 최소화 상태일 수 있음)
          await this.restoreBrowserWindow();

          // ✅ [2026-03-27 FIX] C-3: 세션 재사용 시에도 stealth 보완 스크립트 재적용
          await this.setupStealthSupplements();

          return; // 세션 재사용 성공!
        } catch {
          // ✅ [2026-03-22 FIX] 닫힌 페이지 감지 시 세션 완전 재생성
          // 기존 bug: bare newPage()는 stealth/UA/proxy/viewport 없이 생성됨 → CAPTCHA 발생
          // 수정: browserSessionManager에서 세션 삭제 후 재생성 → 모든 보호 조치 적용
          this.log('⚠️ 세션 페이지가 유효하지 않음, 세션 재생성...');
          await browserSessionManager.closeSession(this.options.naverId);
          const freshSession = await browserSessionManager.getOrCreateSession(
            this.options.naverId,
            this.options.headless ?? false,
            this.options.accountProxyUrl // ✅ 계정별 프록시 전달
          );
          this.browser = freshSession.browser;
          this.page = freshSession.page;
          this.cursor = createGhostCursor(this.page);
          // ✅ [2026-03-27 FIX] C-3: 세션 재생성 시에도 stealth 보완 스크립트 적용
          await this.setupStealthSupplements();
          this.log('✅ 세션 재생성 완료 (stealth + proxy 적용됨)');
          return;
        }
      }
    } catch (sessionError) {
      this.log(`⚠️ BrowserSessionManager 사용 실패: ${(sessionError as Error).message}`);
      this.log('   🔄 기존 방식으로 브라우저 시작...');
    }

    // ✅ [폴백] 기존 로직
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    // ✅ 1. 기존 브라우저 인스턴스 재사용 및 탭 정리 (탭 누적 방지)
    if (this.browser) {
      try {
        // 브라우저 연결 상태 확인 (Property check first to avoid exception if method undefined)
        if (this.browser.isConnected && !this.browser.isConnected()) {
          throw new Error('브라우저 연결 끊김');
        }

        // 열려있는 모든 페이지 확인
        const pages = await this.browser.pages();

        // 유효한 페이지 선택 (우선순위: 현재 페이지 -> 마지막 페이지 -> 새 페이지)
        let targetPage: Page | null = null;

        if (this.page && pages.includes(this.page)) {
          targetPage = this.page;
        } else if (pages.length > 0) {
          targetPage = pages[pages.length - 1]; // 가장 최근 탭 사용
        } else {
          targetPage = await this.browser.newPage();
        }

        // 선택된 페이지 활성화
        this.page = targetPage;
        try { await this.page.bringToFront().catch(() => { }); } catch (e) { console.debug('[Browser] 페이지 활성화 실패:', (e as Error).message); }

        // 🧹 탭 정리: 선택된 페이지 이외의 모든 탭 닫기 (메모리 누수/탭 폭탄 방지)
        const cleanupPages = await this.browser.pages();
        let closedCount = 0;
        for (const p of cleanupPages) {
          if (p !== this.page) {
            await p.close().catch(() => { });
            closedCount++;
          }
        }

        // 연결 상태 최종 확인 (dummy call)
        await this.page.url();

        this.log(`✅ 기존 브라우저 세션을 재사용합니다. (총 ${cleanupPages.length}개 탭 중 ${closedCount}개 정리됨)`);
        return;

      } catch (e) {
        this.log(`⚠️ 기존 브라우저 세션 재사용 실패: ${(e as Error).message}`);
        this.log('   🔄 브라우저를 완전히 종료하고 새로 시작합니다.');

        // 브라우저 완전 종료 시도 (좀비 프로세스 방지)
        if (this.browser) {
          try { await this.browser.close(); } catch (e) { console.debug('[Browser] 재사용 실패 후 종료 에러:', (e as Error).message); }
        }
        this.browser = null;
        this.page = null;
      }
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        this.log(`🔍 🛡️ Stealth 브라우저 실행 시도 중... (${attempt}/${MAX_RETRIES})`);

        // ✅ 계정별 독립 프로필 디렉토리 생성 (핵심!)
        await fs.mkdir(this.accountProfileDir, { recursive: true });
        this.log(`📁 계정 프로필: ${this.accountProfileDir.replace(os.homedir(), '~')}`);

        // ✅ 세션 데이터 존재 여부 확인 (CAPTCHA 디버깅용)
        const cookiesPath = path.join(this.accountProfileDir, 'Default', 'Cookies');
        try {
          await fs.access(cookiesPath);
          this.log('   ✅ 기존 세션 데이터 발견 (세션 재사용 기대)');
        } catch {
          this.log('   ⚠️ 세션 데이터 없음 (첫 로그인 또는 세션 만료)');
        }

        const chromeExecutablePath = this.findChromeExecutable();
        const profile = this.getAccountConsistentProfile();
        const screenRes = profile.screen;

        const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
          headless: this.options.headless ?? false,
          slowMo: this.options.slowMo ?? 0,
          userDataDir: this.accountProfileDir,  // ✅ 계정별 독립 프로필 (핵심!)
          protocolTimeout: 300000,
          args: [
            // ✅ 자동화 감지 우회 (핵심!)
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            `--window-size=${screenRes.width},${screenRes.height}`,
            '--start-maximized',
            '--window-position=0,0',

            // ✅ [2026-03-27 FIX] 리스크22: --disable-features 하나로 통합 (Chrome은 마지막 값만 사용)
            '--disable-features=IsolateOrigins,site-per-process,AutomationControlled,ThirdPartyCookieBlocking,SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,TranslateUI',

            // ✅ [2026-03-27 FIX] 리스크36: WebRTC IP 누출 방지 (프록시 사용 시 로컬 IP 노출 차단)
            '--enforce-webrtc-ip-permission-check',
            '--webrtc-ip-handling-policy=disable_non_proxied_udp',
            '--disable-site-isolation-trials',

            // ✅ 성능 최적화 (봇 감지와 무관한 것만 유지)
            '--disable-dev-shm-usage',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-ipc-flooding-protection',
            '--disable-sync',
            '--disable-default-apps',
            '--no-first-run',
            '--no-default-browser-check',
          ],
          ignoreDefaultArgs: ['--enable-automation'],  // ✅ 자동화 플래그 제거 (핵심!)
        };

        if (chromeExecutablePath) {
          launchOptions.executablePath = chromeExecutablePath;
          this.log(`✅ 시스템 Chrome 사용: ${chromeExecutablePath}`);
        } else {
          this.log('ℹ️ Puppeteer Chrome 사용');
        }

        // 블로그 자동화는 본인 계정 로그인이므로 프록시 불필요 (직접 연결)
        // SmartProxy는 크롤링(sourceAssembler/crawlerBrowser)에만 사용
        // 계정별 프록시가 명시적으로 설정된 경우에만 적용
        const proxyUrl = this.options.accountProxyUrl || null;
        let proxyAuth: { username: string; password: string } | null = null;

        if (proxyUrl) {
            try {
                const parsedProxy = new URL(proxyUrl);
                const proxyServer = `${parsedProxy.protocol}//${parsedProxy.hostname}:${parsedProxy.port}`;
                (launchOptions.args as string[]).push(`--proxy-server=${proxyServer}`);
                if (parsedProxy.username) {
                    proxyAuth = {
                        username: decodeURIComponent(parsedProxy.username),
                        password: decodeURIComponent(parsedProxy.password),
                    };
                }
                this.log(`🌐 프록시 적용: ${proxyServer}`);
            } catch {
                (launchOptions.args as string[]).push(`--proxy-server=${proxyUrl}`);
                this.log(`🌐 프록시 적용 (raw): ${proxyUrl.replace(/:[^:]+@/, ':***@')}`);
            }
        } else {
            // 프록시 미사용 시 시스템 프록시/캐시된 프록시 설정 완전 차단
            // 이것이 없으면 Windows 시스템 프록시 또는 userDataDir 캐시에서
            // 이전 프록시 설정이 적용되어 HTTP 407 에러 발생 가능
            (launchOptions.args as string[]).push('--no-proxy-server');
            this.log('🌐 프록시 없음 (직접 연결)');
        }

        this.browser = await puppeteer.launch(launchOptions);

        // ✅ 팝업 차단 (리스너 누적 방지: 등록 전 기존 리스너 제거)
        this.browser.removeAllListeners('targetcreated');
        this.browser.on('targetcreated', async (target) => {
          if (target.type() === 'page') {
            try {
              const newPage = await target.page();
              if (newPage) {
                await new Promise(resolve => setTimeout(resolve, 100));
                const url = newPage.url();
                if (url.includes('mybox.naver.com') || url.includes('photobox')) {
                  this.log('🚫 MyBox 팝업 차단');
                  await newPage.close().catch(() => { });
                }
              }
            } catch (error) {
              // 팝업 감지/차단 중 오류 (페이지 이미 닫힘 등) — 무시해도 안전
              if (error instanceof Error && !error.message.includes('Target closed')) {
                this.log(`⚠️ 팝업 처리 오류: ${error.message.substring(0, 80)}`);
              }
            }
          }
        });

        this.page = await this.browser.newPage();

        // ✅ [2026-03-22 FIX] 프록시 인증 적용
        if (proxyAuth) {
            await this.page.authenticate(proxyAuth);
            this.log(`   🔐 프록시 인증 설정 완료 (user: ${proxyAuth.username.substring(0, 5)}...)`);
        }
        const initialPages = await this.browser.pages();
        for (const p of initialPages) {
          if (p !== this.page) {
            await p.close().catch(() => { });
          }
        }

        this.ensureNotCancelled();

        // ✅ 팝업 핸들러 (리스너 누적 방지: 등록 전 기존 리스너 제거)
        this.page.removeAllListeners('popup');
        this.page.on('popup', async (popup) => {
          if (popup) {
            this.log(`🚫 팝업 차단: ${popup.url()}`);
            await popup.close().catch(() => { });
          }
        });

        this.log(`✅ 브라우저 실행 성공 (${attempt}번째 시도)`);

        // ✅ [2026-04-01 FIX] launch 직후 CDP로 창 최대화 강제
        // --start-maximized가 모든 환경에서 작동하지 않을 수 있으므로 CDP로 이중 보장
        try {
          const cdpClient = await this.page!.target().createCDPSession();
          const { windowId } = await cdpClient.send('Browser.getWindowForTarget') as { windowId: number };
          await cdpClient.send('Browser.setWindowBounds', {
            windowId,
            bounds: { windowState: 'maximized' }
          });
          await cdpClient.detach();
          this.log('   🗖️ 브라우저 창 최대화 적용');
        } catch (maxErr) {
          this.log(`   ⚠️ 창 최대화 실패 (무시): ${(maxErr as Error).message}`);
        }

        // ✅ Ghost Cursor 초기화 (사람 같은 마우스 이동)
        this.cursor = createGhostCursor(this.page);
        this.log('   🎯 Ghost Cursor 초기화 완료');

        break;

      } catch (browserError) {
        lastError = browserError as Error;
        this.log(`⚠️ 브라우저 실행 실패 (${attempt}/${MAX_RETRIES}): ${lastError.message}`);

        if (this.browser) {
          try { await this.browser.close(); } catch (e) { console.debug('[Browser] 실행 실패 후 종료 에러:', (e as Error).message); }
          this.browser = null;
        }
        this.page = null;

        if (attempt < MAX_RETRIES) {
          const waitTime = attempt * 3000;
          this.log(`⏳ ${waitTime / 1000}초 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        throw new Error(
          `브라우저 실행 실패 (${MAX_RETRIES}회 시도)\n` +
          `마지막 오류: ${lastError.message}\n\n` +
          `💡 해결 방법: Chrome을 모두 종료하고 다시 시도하세요`
        );
      }
    }

    try {
      if (!this.page) {
        throw new Error('브라우저 페이지가 초기화되지 않았습니다.');
      }

      // ✅ 계정별 고정 프로필 가져오기
      const profile = this.getAccountConsistentProfile();

      // Stealth Plugin이 이미 처리하는 17개 evasion 외 보완 항목만 유지
      await this.page.evaluateOnNewDocument((hw: any) => {
        try {
          // native code toString 위장 유틸리티
          const spoofNative = (fn: Function, name: string) => {
            const nativeStr = `function ${name}() { [native code] }`;
            fn.toString = () => nativeStr;
            fn.toLocaleString = () => nativeStr;
            const toStrNative = 'function toString() { [native code] }';
            fn.toString.toString = () => toStrNative;
            fn.toLocaleString.toString = () => toStrNative;
          };

          // 1. navigator.connection (세션 고정값)
          const connRtt = 30 + Math.floor((Date.now() % 50));
          const connDownlink = 5 + ((Date.now() % 100) / 10);
          Object.defineProperty(navigator, 'connection', {
            get: () => ({
              effectiveType: '4g',
              rtt: connRtt,
              downlink: connDownlink,
              saveData: false,
            }),
          });

          // 2. Canvas fingerprint (세션 시드 기반 결정적 노이즈, 비파괴 방식)
          const canvasSeed = Date.now() % 65536;
          const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
          HTMLCanvasElement.prototype.toDataURL = function (type?: string) {
            if (type === 'image/png' || !type) {
              try {
                // ✅ 비파괴: 임시 Canvas에 복사 후 노이즈 적용 (원본 보존)
                const tmpCanvas = document.createElement('canvas');
                tmpCanvas.width = this.width;
                tmpCanvas.height = this.height;
                const tmpCtx = tmpCanvas.getContext('2d');
                if (tmpCtx) {
                  tmpCtx.drawImage(this, 0, 0);
                  const imageData = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
                  for (let i = 0; i < imageData.data.length; i += 4) {
                    const noise = ((canvasSeed * (i + 1) * 31) % 1000) < 1 ? 1 : 0;
                    imageData.data[i] = imageData.data[i] ^ noise;
                  }
                  tmpCtx.putImageData(imageData, 0, 0);
                  return originalToDataURL.call(tmpCanvas, type);
                }
              } catch (e) { console.debug('[Stealth] Canvas toDataURL spoof 실패:', e); }
            }
            return originalToDataURL.apply(this, arguments as any);
          };
          spoofNative(HTMLCanvasElement.prototype.toDataURL, 'toDataURL');

          // 3. AudioContext fingerprint (세션 시드 기반 결정적 노이즈)
          const audioSeed = canvasSeed ^ 0xA5A5;
          const originalGetChannelData = AudioBuffer.prototype.getChannelData;
          AudioBuffer.prototype.getChannelData = function (channel: number) {
            const data = originalGetChannelData.call(this, channel);
            for (let i = 0; i < data.length; i += 100) {
              const noise = (((audioSeed * (i + 1) * 17) % 10000) - 5000) / 50000000;
              data[i] = data[i] + noise;
            }
            return data;
          };
          spoofNative(AudioBuffer.prototype.getChannelData, 'getChannelData');

          // 4. Screen 정보 (계정별 고정)
          const screen = hw.screen;
          Object.defineProperty(window.screen, 'width', { get: () => screen.width });
          Object.defineProperty(window.screen, 'height', { get: () => screen.height });
          Object.defineProperty(window.screen, 'availWidth', { get: () => screen.width });
          Object.defineProperty(window.screen, 'availHeight', { get: () => screen.height - 40 });
          Object.defineProperty(window.screen, 'colorDepth', { get: () => 24 });
          Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24 });
        } catch (e) {
          // 보완 스크립트 실패해도 페이지 로딩은 계속 진행
        }
      }, profile);

      // CDP Network.setUserAgentOverride로 UA + metadata 통합 설정 (Stealth와 동일 메커니즘)
      const userAgent = profile.userAgent;
      const chromeVersion = userAgent.match(/Chrome\/(\d+)/)?.[1] || '134';
      const fullChromeVersion = userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/)?.[1] || `${chromeVersion}.0.0.0`;

      // Chrome 공식 brands 순서 알고리즘 (Chromium 소스코드 기반)
      const seed = parseInt(chromeVersion);
      const brandOrders = [
        [0, 1, 2], [0, 2, 1], [1, 0, 2],
        [1, 2, 0], [2, 0, 1], [2, 1, 0]
      ];
      const order = brandOrders[seed % 6];
      const escapedChars = [' ', ' ', ';'];
      const greaseyBrand = `${escapedChars[order[0]]}Not${escapedChars[order[1]]}A${escapedChars[order[2]]}Brand`;
      const brands: { brand: string; version: string }[] = [];
      brands[order[0]] = { brand: greaseyBrand, version: '99' };
      brands[order[1]] = { brand: 'Chromium', version: chromeVersion };
      brands[order[2]] = { brand: 'Google Chrome', version: chromeVersion };

      const fullBrands: { brand: string; version: string }[] = [];
      fullBrands[order[0]] = { brand: greaseyBrand, version: '99.0.0.0' };
      fullBrands[order[1]] = { brand: 'Chromium', version: fullChromeVersion };
      fullBrands[order[2]] = { brand: 'Google Chrome', version: fullChromeVersion };

      try {
        const cdpClient = await this.page.createCDPSession();
        await cdpClient.send('Network.setUserAgentOverride', {
          userAgent: userAgent,
          platform: 'Win32',
          acceptLanguage: 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          userAgentMetadata: {
            brands: brands,
            fullVersionList: fullBrands,
            fullVersion: fullChromeVersion,
            platform: 'Windows',
            platformVersion: '15.0.0',
            architecture: 'x86',
            model: '',
            mobile: false,
            bitness: '64',
            wow64: false,
          },
        });
        this.log(`🔧 User-Agent: Chrome/${chromeVersion} (CDP + Chrome brands algorithm)`);
      } catch (cdpError) {
        // CDP 실패 시 fallback: Stealth이 기본 UA를 설정하므로 로그만 남김
        this.log(`⚠️ CDP UA 설정 실패 (Stealth 기본값 사용): ${(cdpError as Error).message}`);
      }

      // Client Hints 헤더 (CDP brands와 일치)
      try {
        const brandsHeader = brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
        await this.page.setExtraHTTPHeaders({
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Sec-CH-UA': brandsHeader,
          'Sec-CH-UA-Mobile': '?0',
          'Sec-CH-UA-Platform': '"Windows"',
        });
      } catch (headerError) {
        this.log(`⚠️ HTTP 헤더 설정 실패: ${(headerError as Error).message}`);
      }

      const screenRes = profile.screen;
      await this.page.setViewport({
        width: screenRes.width,
        height: screenRes.height - 100,
        deviceScaleFactor: 1,
        hasTouch: false,
        isLandscape: true,
        isMobile: false,
      });

      this.page.setDefaultNavigationTimeout(this.options.navigationTimeoutMs ?? 60000);
      this.page.setDefaultTimeout(60000);

      // ✅ [2026-03-24 FIX] dialog 핸들러는 run()에서 ensureDialogHandler()로 매 사이클 등록
      // setupBrowser는 세션 재사용 시 early-return하므로 여기서 등록하면 누락됨

      // ✅ 콘솔 에러 캡처 (리스너 누적 방지: 등록 전 기존 리스너 제거)
      this.page.removeAllListeners('console');
      this.page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (!text.includes('puppeteer') && !text.includes('webdriver') && !text.includes('automation')) {
            this.log(`[브라우저 에러] ${text}`);
          }
        }
      });

      this.log('✅ 🛡️ Stealth 브라우저 초기화 완료');
    } catch (error) {
      throw new Error(`드라이버 설정 중 오류 발생: ${(error as Error).message}`);
    }
  }

  /**
   * ✅ [2026-03-24 FIX] Dialog 핸들러 확정 등록
   * 
   * 핵심 문제: setupBrowser()는 세션 재사용 시 early-return하여 dialog 핸들러를 건너뜀.
   * 또한 run() finally에서 page.close() 후 다음 사이클에서 새 page에 핸들러가 없음.
   * 
   * 해결: run()에서 setupBrowser() 직후 이 메서드를 호출하여,
   * 어떤 코드 경로를 타든 dialog 자동 수락이 항상 보장됨.
   */
  private ensureDialogHandler(): void {
    if (!this.page) return;

    // 기존 dialog 핸들러 중복 방지 — 제거 후 재등록
    this.page.removeAllListeners('dialog');

    this.page.on('dialog', async (dialog) => {
      const type = dialog.type();
      const message = dialog.message();
      // 네이버 에디터 내부 상태 충돌 alert 감지 (발행 후 에디터 재진입 시 발생)
      const isEditorStateAlert = message.includes('삭제되었거나') ||
        message.includes('다른 페이지로 변경') ||
        message.includes('게시물이 삭제') ||
        message.includes('이미 발행') ||
        message.includes('작성 중인 글');
      if (isEditorStateAlert) {
        this.log(`🔔 [에디터 상태 충돌] 자동 수락: ${message.substring(0, 80)}`);
      } else {
        this.log(`🔔 다이얼로그 자동 수락: [${type}] ${message.substring(0, 50)}`);
      }
      try {
        await dialog.accept();
      } catch (e) {
        // 이미 닫힌 다이얼로그 무시
      }
    });

    this.log('🛡️ Dialog 자동 수락 핸들러 등록 완료');
  }

  /**
   * 쿠키 저장 (userDataDir 사용 시 브라우저가 자동 관리하므로 간소화)
   */
  private async saveCookies(): Promise<void> {
    // userDataDir를 사용하면 브라우저가 자동으로 쿠키를 저장하므로
    // 별도 파일 저장 불필요 (로그만 남김)
    this.log('🍪 로그인 쿠키가 브라우저 프로필에 자동 저장되었습니다.');
  }

  /**
   * 쿠키 로드 (userDataDir 사용 시 브라우저가 자동 로드하므로 간소화)
   */
  private async loadCookies(): Promise<boolean> {
    // userDataDir를 사용하면 브라우저가 자동으로 쿠키를 로드하므로
    // 별도 파일 로드 불필요 (항상 true 반환)
    return true;
  }

  /**
   * ✅ [2026-03-27 FIX] 경량 세션 확인 — GoBlogWrite 이동 없이 쿠키 + 현재 페이지 기반
   * 이전: GoBlogWrite.naver로 이동하여 세션 확인 → navigateToBlogWrite()에서 또 이동 = 이중 히팅 (캡차 유발)
   * 현재: 페이지 이동 없이 쿠키(NID_AUT, NID_SES) + URL/DOM 기반으로 판단
   */
  private async checkLoginStatus(): Promise<boolean> {
    const page = this.ensurePage();

    try {
      this.log('   🔍 세션 상태 경량 확인 중 (페이지 이동 없음)...');

      // ✅ 1단계: 쿠키 기반 세션 확인 (가장 가벼움 — 네트워크 요청 없음)
      const cookies = await page.cookies('https://nid.naver.com', 'https://www.naver.com', 'https://blog.naver.com');
      const hasNidAut = cookies.some(c => c.name === 'NID_AUT' && c.value.length > 0);
      const hasNidSes = cookies.some(c => c.name === 'NID_SES' && c.value.length > 0);

      if (hasNidAut && hasNidSes) {
        this.log(`   ✅ 세션 쿠키 유효 (NID_AUT: ✓, NID_SES: ✓)`);
        return true;
      }

      // ✅ 2단계: 현재 URL 기반 판단 (이미 블로그/에디터에 있으면 유효)
      const currentUrl = page.url();
      if (currentUrl.includes('blog.naver.com') && !currentUrl.includes('login') && !currentUrl.includes('nidlogin')) {
        // 블로그 도메인에 있고 로그인 페이지가 아니면 유효
        this.log('   ✅ 세션 유효 (현재 블로그 도메인에 위치)');
        return true;
      }

      // ✅ 3단계: 현재 페이지가 네이버 도메인이면 DOM으로 정밀 확인
      if (currentUrl.includes('naver.com') && !currentUrl.includes('nidlogin') && !currentUrl.includes('login')) {
        try {
          const loginIndicators = await page.evaluate(() => {
            const logoutBtn = document.querySelector('a[href*="logout"], .gnb_btn_login, #gnb_login_button');
            const loginName = document.querySelector('.gnb_name, .gnb_my_name, .user_name');
            const editArea = document.querySelector('.se-container, .se-main-container, #write_area');
            return {
              hasLogoutBtn: !!logoutBtn,
              hasLoginName: !!loginName,
              hasEditArea: !!editArea
            };
          });

          if (loginIndicators.hasEditArea || loginIndicators.hasLogoutBtn || loginIndicators.hasLoginName) {
            this.log('   ✅ 세션 유효 확인 (DOM 요소 감지)');
            return true;
          }
        } catch {
          // DOM 확인 실패 — 쿠키 결과 기반으로 판단
        }
      }

      // 쿠키가 없고 블로그 도메인도 아닌 경우 → 재로그인 필요
      this.log(`   ❌ 세션 확인 실패 (NID_AUT: ${hasNidAut ? '✓' : '✗'}, NID_SES: ${hasNidSes ? '✓' : '✗'}, URL: ${currentUrl.substring(0, 60)})`);
      return false;
    } catch (error) {
      this.log(`   ⚠️ 상태 확인 중 오류: ${(error as Error).message}`);
      return false;
    }
  }

  async loginToNaver(): Promise<void> {
    const page = this.ensurePage();

    this.ensureNotCancelled();

    // ✅ [v1.4.62] 캐시/쿠키 기반 fast-path 제거 — 거짓 양성 근본 차단
    //
    // 기존: isAccountLoggedIn() 캐시 + checkLoginStatus()의 NID_AUT/NID_SES 존재 검사로
    //       "로그인됨" 판정 → 그러나 쿠키는 브라우저 프로필(userDataDir)에 계속 남아있어
    //       서버 세션이 만료돼도 true를 반환 → loginToNaver() 조용히 return →
    //       워밍업 브라우징만 수행한 채 에디터 이동 시 로그인 페이지로 리다이렉트 →
    //       재시도 루프 → 사용자 체감 "ID/PW 입력도 안 하고 로그인 버튼도 안 누름".
    //
    // 수정: 항상 네이버 로그인 페이지로 이동한다. 서버 세션이 유효하면 네이버가
    //       자동으로 메인/블로그로 리다이렉트 → line 2337 처리기가 이를 감지해 스킵.
    //       세션이 만료됐으면 nidlogin 페이지가 그대로 뜸 → 정상적으로 ID/PW 입력 진행.
    //       네비게이션 기반이라 거짓 양성이 구조적으로 불가능하다.
    //       비용: 정상 로그인 유지 케이스에 1회 HTTP round-trip 추가 (~500ms) — 허용.

    this.log('🔐 네이버 로그인을 시작합니다...');
    this.log('💡 캡차가 나오면 브라우저에서 직접 해결해주세요!');

    const loginUrl = this.options.loginUrl ?? 'https://nid.naver.com/nidlogin.login';

    this.log('🔄 네이버 로그인 페이지로 이동 중...');

    // 로그인 페이지로 이동 전 현재 URL 확인
    const currentUrl = page.url();
    this.log(`   현재 페이지: ${currentUrl}`);

    // 이미 로그인 페이지에 있으면 이동하지 않음
    if (!currentUrl.includes('nidlogin')) {
      const LOGIN_MAX_RETRIES = 3;
      let loginPageLoaded = false;

      for (let loginAttempt = 1; loginAttempt <= LOGIN_MAX_RETRIES; loginAttempt++) {
        try {
          this.log(`🔄 로그인 페이지 접속 시도 ${loginAttempt}/${LOGIN_MAX_RETRIES}...`);
          const response = await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

          // 응답 상태 코드 검사 (407/502/503)
          const statusCode = response?.status() ?? 0;
          if (statusCode === 407 || statusCode === 502 || statusCode === 503) {
            this.log(`🔴 서버 에러 감지 (HTTP ${statusCode})`);
            if (loginAttempt < LOGIN_MAX_RETRIES) {
              const waitSec = loginAttempt * 5;
              this.log(`⏳ ${waitSec}초 후 재시도합니다...`);
              await this.delay(waitSec * 1000);
              continue;
            }
          }

          // 페이지 본문에서 에러 감지 ("페이지가 작동하지 않습니다", "HTTP ERROR")
          if (statusCode >= 400 || statusCode === 0) {
            const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '').catch(() => '');
            if (bodyText.includes('작동하지 않습니다') || bodyText.includes('HTTP ERROR') ||
                bodyText.includes('ERR_') || bodyText.includes('프록시') || bodyText.includes('proxy')) {
              this.log(`🔴 에러 페이지 감지: ${bodyText.substring(0, 100)}`);
              if (loginAttempt < LOGIN_MAX_RETRIES) {
                await this.delay(loginAttempt * 5 * 1000);
                continue;
              }
            }
          }

          // 로드 검증
          const loadedUrl = page.url();
          if (loadedUrl.includes('nid.naver.com') || loadedUrl.includes('nidlogin')) {
            loginPageLoaded = true;
            break; // 성공
          }

          // ✅ [v1.4.62] nidlogin.login으로 이동했지만 다른 URL로 리다이렉트됨
          // → 네이버가 "이미 로그인됨" 판정하여 referrer/메인으로 튕겨낸 것.
          // 이는 실패가 아니라 "세션 유효" 신호이므로 즉시 성공 처리.
          if (loadedUrl.includes('naver.com') && !loadedUrl.includes('nidlogin')) {
            this.log(`✅ 로그인 페이지 요청이 ${loadedUrl.substring(0, 60)}으로 리다이렉트됨 → 이미 로그인된 상태`);
            browserSessionManager.setLoggedIn(this.options.naverId, true);
            return;
          }

          this.log(`⚠️ 로그인 페이지 로드 실패 (URL: ${loadedUrl})`);
        } catch (gotoError: any) {
          const errorMsg = gotoError.message || '';
          const isNetworkError = errorMsg.includes('ERR_CONNECTION_RESET') ||
            errorMsg.includes('ERR_CONNECTION_REFUSED') ||
            errorMsg.includes('ERR_CONNECTION_TIMED_OUT') ||
            errorMsg.includes('ERR_NAME_NOT_RESOLVED') ||
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('ERR_TUNNEL_CONNECTION_FAILED') ||
            errorMsg.includes('ERR_PROXY_CONNECTION_FAILED') ||
            errorMsg.includes('ERR_PROXY_AUTH_REQUESTED') ||
            errorMsg.includes('ERR_NO_SUPPORTED_PROXIES') ||
            errorMsg.includes('ERR_SOCKS_CONNECTION_FAILED') ||
            errorMsg.includes('ERR_PROXY') ||
            errorMsg.includes('net::');

          // 프록시 관련 에러 감지 (accountProxyUrl 사용 시에만 의미 있음)
          const isProxyError = errorMsg.includes('PROXY') || errorMsg.includes('TUNNEL') || errorMsg.includes('407');
          if (isProxyError) {
            this.log(`🔴 프록시/터널 연결 실패: ${errorMsg.substring(0, 80)}`);
            // ⚠️ 크롤링 모듈의 전역 프록시 상태를 건드리지 않음 (블로그 자동화와 크롤링은 독립)
          }

          if (isNetworkError && loginAttempt < LOGIN_MAX_RETRIES) {
            const waitSec = loginAttempt * 5;
            this.log(`⚠️ 네트워크 오류 (${errorMsg.substring(0, 60)})`);
            this.log(`⏳ ${waitSec}초 후 재시도합니다... (${loginAttempt}/${LOGIN_MAX_RETRIES})`);
            await this.delay(waitSec * 1000);
            continue;
          }

          throw gotoError;
        }
      }

      if (!loginPageLoaded) {
        this.log(`⚠️ ${LOGIN_MAX_RETRIES}회 시도 후에도 실패, 최종 시도...`);
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      // ✅ [중요] 인간적인 관찰 타임 (화면 로드 후 잠깐 멈추거나 마우스 흔들기)
      this.log('   👀 페이지 훑어보는 중 (봇 감지 우회)...');
      await this.humanDelay(1500, 3000);

      // 자연스럽게 살짝 스크롤
      await page.evaluate(() => window.scrollBy(0, 50 + Math.random() * 50));
      await this.humanDelay(500, 1000);
      await page.evaluate(() => window.scrollBy(0, -50 - Math.random() * 20));

      // 랜덤 마우스 이동
      const viewSize = page.viewport();
      if (viewSize) {
        for (let i = 0; i < 3; i++) {
          await page.mouse.move(this.randomInt(0, viewSize.width), this.randomInt(0, viewSize.height), { steps: 5 });
          await this.humanDelay(100, 300);
        }
      }
    }

    this.ensureNotCancelled();

    // ✅ 캡차 사전 체크 제거 - 먼저 자동 로그인 시도하고, 캡차 나오면 그때 대기

    // ✅ [2026-03-26 FIX] 다중 셀렉터 폴백 + 진단 로깅 강화
    const ID_INPUT_SELECTORS = ['#id', 'input.input_id', 'input[name="id"]', 'input[aria-label*="아이디"]'];

    // 로그인 필드 확인 — 다중 셀렉터 순회
    let idInput: import('puppeteer-core').ElementHandle<Element> | null = null;
    for (const sel of ID_INPUT_SELECTORS) {
      idInput = await page.waitForSelector(sel, { visible: true, timeout: 3000 }).catch(() => null);
      if (idInput) {
        this.log(`✅ 아이디 입력 필드 발견 (셀렉터: ${sel})`);
        break;
      }
    }

    if (!idInput) {
      // ✅ 현재 페이지 상태 진단 로그 (디버깅용)
      const diagUrl = page.url();
      const diagTitle = await page.title().catch(() => '(제목 가져오기 실패)');
      this.log(`⚠️ 아이디 입력 필드 1차 탐색 실패`);
      this.log(`   📍 현재 URL: ${diagUrl}`);
      this.log(`   📍 페이지 제목: ${diagTitle}`);

      // 이미 로그인되어 있을 수 있음
      if (!diagUrl.includes('nidlogin') && !diagUrl.includes('nid.naver.com')) {
        const finalCheck = await this.checkLoginStatus();
        if (finalCheck) {
          this.log('✅ 이미 로그인되어 있습니다.');
          browserSessionManager.setLoggedIn(this.options.naverId, true); // ✅ 캐시 반영
          return;
        }
      }

      // ✅ [2026-03-27 FIX] 쿠키 삭제 제거 — 유효한 세션까지 파괴하여 캡차를 강제 유발하는 치명적 버그였음
      // 로그인 필드가 안 보이는 이유는 쿠키 문제가 아니라 페이지 로딩 지연/리다이렉트일 가능성이 높음
      // 쿠키를 보존한 채 로그인 페이지만 다시 이동하여 ID/PW 필드 탐색 재시도
      this.log('🔄 로그인 페이지 재이동 (쿠키 보존)...');

      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.humanDelay(2000, 3000);

      // 2차 시도 — 다중 셀렉터 순회 (3초 × 4 = 최대 12초)
      for (const sel of ID_INPUT_SELECTORS) {
        idInput = await page.waitForSelector(sel, { visible: true, timeout: 3000 }).catch(() => null);
        if (idInput) {
          this.log(`✅ 아이디 입력 필드 발견 (2차, 셀렉터: ${sel})`);
          break;
        }
      }

      if (!idInput) {
        const failUrl = page.url();
        const failTitle = await page.title().catch(() => '');
        const failBodySnippet = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || '').catch(() => '');
        this.log(`❌ 최종 실패 — URL: ${failUrl}`);
        this.log(`❌ 최종 실패 — 제목: ${failTitle}`);
        this.log(`❌ 최종 실패 — 본문: ${failBodySnippet.substring(0, 150)}`);

        // 에러 원인 세분화
        const isProxyPage = failBodySnippet.includes('407') || failBodySnippet.includes('작동하지 않습니다') ||
          failBodySnippet.includes('proxy') || failBodySnippet.includes('프록시');
        if (isProxyPage) {
          throw new Error(`프록시 연결 실패로 로그인 페이지를 열 수 없습니다. (HTTP 407) 프록시 설정을 확인하거나 비활성화하세요.`);
        }
        throw new Error(`아이디 입력 필드를 찾을 수 없습니다. (URL: ${failUrl}, 제목: ${failTitle})`);
      }
    }

    // ✅ Ghost Cursor 사용 (사람 같은 마우스 이동)
    if (this.cursor) {
      this.log('🎯 Ghost Cursor로 아이디 입력 중...');

      // 랜덤 마우스 이동 (의심 회피)
      await randomMouseMovement(page, this.cursor, { count: 2 });

      // 아이디 입력 필드 클릭
      await safeClick(page, this.cursor, '#id', {
        delayBefore: [300, 600],
        delayAfter: [200, 400],
        log: this.log.bind(this),
      });

      // ✅ [2026-03-27 FIX] bvsd._data._tseq 대응: focus → 첫 키 입력까지 인간적 관찰 대기
      // 실제 사용자는 필드 클릭 후 1~3초 정도 커서 위치/내용을 확인한 후 타이핑 시작
      await this.humanDelay(1000, 3000);

      // ✅ [2026-03-27 FIX] 리스크12: 필드가 비어있으면 Ctrl+A→Backspace 스킵 (bvsd에 기계적 초기화 패턴 기록 방지)
      const idCurrentValue = await page.evaluate(() => {
        const el = document.querySelector('#id') as HTMLInputElement;
        return el?.value || '';
      });
      if (idCurrentValue.length > 0) {
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await waitRandom(100, 200);
        await page.keyboard.press('Backspace');
        await waitRandom(100, 200);
      }

      // ✅ [2026-03-27 FIX] 리스크13: loginKeyType 사용 (keydown-keyup 간격 30~100ms)
      for (const char of this.options.naverId) {
        await this.loginKeyType(page, char);
        if (Math.random() < 0.05) {
          await this.humanDelay(200, 400);
        }
      }
      await this.humanDelay(400, 800);
    } else {
      // ✅ 폴백: 기존 마우스 이동 방식
      this.log('⚠️ Ghost Cursor 없음, 기존 방식 사용');
      const box = await idInput.boundingBox();
      if (box) {
        await page.mouse.move(
          box.x + box.width / 2 + this.randomInt(-50, 50),
          box.y + box.height / 2 + this.randomInt(-50, 50)
        );
        await this.humanDelay(200, 500);
      }
      // ✅ [2026-03-27 FIX] 리스크14: triple-click → 단일 클릭 + Ctrl+A (보다 자연스러움)
      await idInput.click();
      await this.humanDelay(300, 600);
      // 필드 내용 있으면 선택 → 덮어쓰기
      const idFallbackValue = await idInput.evaluate((el) => (el as HTMLInputElement).value);
      if (idFallbackValue.length > 0) {
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await waitRandom(100, 200);
      }
      for (const char of this.options.naverId) {
        await this.loginKeyType(page, char);
        if (Math.random() < 0.05) {
          await this.humanDelay(200, 400);
        }
      }
      await this.humanDelay(400, 800);
    }

    // 입력 확인
    const typedId = await idInput.evaluate((el) => {
      const input = el as HTMLInputElement;
      return input.value;
    });
    if (typedId !== this.options.naverId) {
      this.log('⚠️ 아이디 입력이 제대로 되지 않았습니다. 다시 시도합니다...');
      // ✅ [2026-03-27 FIX] triple-click → 단일클릭 + Ctrl+A
      await idInput.click();
      await this.humanDelay(200, 400);
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await this.humanDelay(100, 200);
      for (const char of this.options.naverId) {
        await this.loginKeyType(page, char);
      }
      await this.humanDelay(400, 700);

      // ✅ [v1.4.66] 2차 확인 — 여전히 실패하면 evaluate로 직접 값 설정
      const retypedId = await idInput.evaluate((el) => (el as HTMLInputElement).value);
      if (retypedId !== this.options.naverId) {
        this.log('⚠️ 키보드 입력 2차 실패 → JavaScript 직접 값 설정');
        await page.evaluate((naverId: string) => {
          const el = document.querySelector('#id') as HTMLInputElement;
          if (el) {
            el.value = naverId;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, this.options.naverId);
      }
    }
    this.log(`✅ 아이디 입력 완료: ${this.options.naverId.substring(0, 3)}***`);

    // ✅ [2026-03-27 FIX] bvsd 대응: ID→PW 이동을 Tab vs 마우스 클릭 랜덤화 (70:30)
    // bvsd._data._tseq가 Tab 이벤트와 Mouse 이벤트 모두 수집 → 실제 사용자처럼 랜덤
    const useTabForPw = Math.random() < 0.7;

    const pwInput = await page.waitForSelector('#pw', { visible: true, timeout: 8000 });
    if (!pwInput) {
      throw new Error('비밀번호 입력 필드를 찾을 수 없습니다.');
    }

    if (this.cursor) {
      this.log('🎯 Ghost Cursor로 비밀번호 입력 중...');

      if (useTabForPw) {
        // Tab 키로 이동 (70% 확률) — 가장 자연스러운 행동
        await page.keyboard.press('Tab');
        await this.humanDelay(500, 1500);
      } else {
        // 마우스로 PW 필드 직접 클릭 (30% 확률)
        await safeClick(page, this.cursor, '#pw', {
          delayBefore: [300, 600],
          delayAfter: [200, 400],
          log: this.log.bind(this),
        });
      }

      // ✅ bvsd._data._tseq: PW 필드 focus 후 인간적 관찰 대기
      await this.humanDelay(800, 2000);

      // ✅ [2026-03-27 FIX] 리스크12: PW필드도 비어있으면 Ctrl+A 스킵
      const pwCurrentValue = await page.evaluate(() => {
        const el = document.querySelector('#pw') as HTMLInputElement;
        return el?.value || '';
      });
      if (pwCurrentValue.length > 0) {
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await waitRandom(100, 200);
        await page.keyboard.press('Backspace');
        await waitRandom(100, 200);
      }

      // ✅ [2026-03-27 FIX] 리스크13: loginKeyType 사용
      for (const char of this.options.naverPassword) {
        await this.loginKeyType(page, char);
        if (Math.random() < 0.05) {
          await this.humanDelay(200, 400);
        }
      }
      await this.humanDelay(400, 800);
    } else {
      // ✅ 폴백: 기존 마우스 이동 방식
      // ✅ [2026-03-27 FIX] 리스크14: triple-click → 단일 클릭 + Ctrl+A
      if (useTabForPw) {
        await page.keyboard.press('Tab');
        await this.humanDelay(500, 1500);
      } else {
        const pwBox = await pwInput.boundingBox();
        if (pwBox) {
          await page.mouse.move(
            pwBox.x + pwBox.width / 2 + this.randomInt(-30, 30),
            pwBox.y + pwBox.height / 2 + this.randomInt(-10, 10)
          );
          await this.humanDelay(200, 500);
        }
        await pwInput.click();
      }
      await this.humanDelay(300, 600);
      // PW 필드 내용 있으면 선택
      const pwFallbackValue = await pwInput.evaluate((el) => (el as HTMLInputElement).value);
      if (pwFallbackValue.length > 0) {
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await waitRandom(100, 200);
      }
      for (const char of this.options.naverPassword) {
        await this.loginKeyType(page, char);
        if (Math.random() < 0.05) {
          await this.humanDelay(200, 400);
        }
      }
      await this.humanDelay(400, 800);
    }

    // 입력 확인
    const typedPw = await pwInput.evaluate((el) => {
      const input = el as HTMLInputElement;
      return input.value;
    }) as string;
    if (typedPw.length === 0) {
      this.log('⚠️ 비밀번호 입력이 제대로 되지 않았습니다. 다시 시도합니다...');
      // ✅ [2026-03-27 FIX] triple-click → 단일클릭 + Ctrl+A
      await pwInput.click();
      await this.humanDelay(200, 400);
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await this.humanDelay(100, 200);
      for (const char of this.options.naverPassword) {
        await this.loginKeyType(page, char);
      }
      await this.humanDelay(400, 700);

      // ✅ [v1.4.66] 2차 확인 — 여전히 비어있으면 evaluate로 직접 값 설정
      const retypedPw = await pwInput.evaluate((el) => (el as HTMLInputElement).value);
      if (retypedPw.length === 0) {
        this.log('⚠️ 비밀번호 키보드 입력 2차 실패 → JavaScript 직접 값 설정');
        await page.evaluate((pw: string) => {
          const el = document.querySelector('#pw') as HTMLInputElement;
          if (el) {
            el.value = pw;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, this.options.naverPassword);
      }
    }
    this.log('✅ 비밀번호 입력 완료');

    // ✅ [2026-03-30 FIX] 로그인 상태 유지 체크 (세션 만료 방지)
    // [Playwright 검증] 실제 셀렉터: #nvlong (class: input_keep, name: nvlong)
    // ⚠️ 이전 #keep은 존재하지 않아 항상 null → 세션 미유지 → 매번 재로그인 → 캡차 유발 근본 원인!
    try {
      // 다중 셀렉터 폴백: #nvlong (현재) → #keep (레거시) → input.input_keep (클래스)
      const KEEP_LOGIN_SELECTORS = ['#nvlong', '#keep', 'input.input_keep', 'input[name="nvlong"]'];
      let keepLoggedIn: import('puppeteer-core').ElementHandle<Element> | null = null;
      let usedSelector = '';
      for (const sel of KEEP_LOGIN_SELECTORS) {
        keepLoggedIn = await page.$(sel);
        if (keepLoggedIn) {
          usedSelector = sel;
          break;
        }
      }

      if (keepLoggedIn) {
        // 이미 체크되어 있는지 확인
        const isChecked = await page.evaluate((el) => {
          const input = el as HTMLInputElement;
          return input.checked;
        }, keepLoggedIn);

        if (!isChecked) {
          this.log(`✅ 로그인 상태 유지 활성화... (셀렉터: ${usedSelector})`);
          // ✅ Ghost Cursor로 클릭 (봇 감지 우회)
          if (this.cursor) {
            await this.cursor.click(usedSelector).catch(async () => {
              await keepLoggedIn!.click(); // fallback
            });
          } else {
            await keepLoggedIn.click();
          }
          // 체크 확인
          const nowChecked = await page.evaluate((el) => (el as HTMLInputElement).checked, keepLoggedIn).catch(() => false);
          if (!nowChecked) {
            // 클릭이 안 먹은 경우 JavaScript로 강제 체크
            await page.evaluate((el) => { (el as HTMLInputElement).checked = true; }, keepLoggedIn);
            this.log('   ⚠️ 클릭 실패 → JavaScript로 강제 체크');
          }
        } else {
          this.log('ℹ️ 로그인 상태 유지가 이미 활성화되어 있습니다.');
        }
        await this.humanDelay(300, 600);
      } else {
        this.log('⚠️ 로그인 상태 유지 체크박스를 찾을 수 없습니다 (시도된 셀렉터: ' + KEEP_LOGIN_SELECTORS.join(', ') + ')');
      }
    } catch (e) {
      this.log(`⚠️ 로그인 상태 유지 체크 실패: ${(e as Error).message}`);
    }

    // ✅ 로그인 버튼 클릭 전 인간적인 행동 추가 (CAPTCHA 방지)
    // 1. 입력 내용 확인하듯 잠시 대기
    await this.humanDelay(800, 1500);

    // 2. 가끔 약관/정책 링크 근처로 마우스 이동 (읽는 것처럼)
    if (Math.random() < 0.3) {  // 30% 확률
      const viewSize = page.viewport();
      if (viewSize) {
        await page.mouse.move(
          this.randomInt(100, 300),
          this.randomInt(viewSize.height - 150, viewSize.height - 50),
          { steps: 10 }
        );
        await this.humanDelay(500, 1000);
      }
    }

    // 3. 입력 필드로 다시 시선 이동 (확인하듯)
    if (Math.random() < 0.2) {  // 20% 확률
      const idBox = await page.$('#id');
      if (idBox) {
        const box = await idBox.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
          await this.humanDelay(200, 400);
        }
      }
    }

    this.ensureNotCancelled();

    // ✅ [v1.4.66] 로그인 버튼 off 클래스 강제 해제
    // 네이버 bvsd가 CDP 기반 키 입력을 유효하지 않은 것으로 판정하면
    // ID/PW가 입력돼도 off 클래스가 유지되어 버튼 클릭이 무시됨.
    // input 이벤트를 재발생시키고 off 클래스를 강제 제거하여 클릭 가능 상태로 전환.
    try {
      const offRemoved = await page.evaluate(() => {
        const idEl = document.querySelector('#id') as HTMLInputElement;
        const pwEl = document.querySelector('#pw') as HTMLInputElement;
        const btn = document.querySelector('#log\\.login') as HTMLButtonElement;
        if (!btn) return { removed: false, reason: 'no-button' };

        // ID/PW 필드에 input 이벤트 재발생 (off 클래스 토글 트리거)
        if (idEl?.value) idEl.dispatchEvent(new Event('input', { bubbles: true }));
        if (pwEl?.value) pwEl.dispatchEvent(new Event('input', { bubbles: true }));

        // off 클래스가 여전히 남아있으면 강제 제거
        const hadOff = btn.classList.contains('off');
        if (hadOff) {
          btn.classList.remove('off');
        }
        return { removed: hadOff, idLen: idEl?.value?.length || 0, pwLen: pwEl?.value?.length || 0 };
      });
      if (offRemoved.removed) {
        this.log(`⚠️ 로그인 버튼 off 클래스 강제 제거 (ID: ${offRemoved.idLen}자, PW: ${offRemoved.pwLen}자 입력됨)`);
      }
    } catch (e) {
      // non-critical
    }

    this.log('🔄 로그인 버튼 클릭 중...');

    const loginButtonSelectors = [
      ...this.LOGIN_BUTTON_SELECTORS,
      'button[type="submit"].next_step',
    ];

    let loginButton: ElementHandle<Element> | null = null;
    for (const selector of loginButtonSelectors) {
      loginButton = await page.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null);
      if (loginButton) break;
    }

    if (!loginButton) {
      loginButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(btn => {
          const text = btn.textContent || '';
          return text.includes('로그인') && (btn as HTMLElement).offsetParent !== null;
        }) || null;
      }) as ElementHandle<Element> | null;
    }

    if (!loginButton) {
      // ✅ [v1.4.54] 로그인 버튼 자체를 못 찾음 → 즉시 덤프 (네이버 UI 변경 가능성)
      await this.dumpFailure('LOGIN_BUTTON_NOT_FOUND', new Error('로그인 버튼을 찾을 수 없습니다.'), {
        errorCode: 'LOGIN_E002',
        context: { triedSelectors: loginButtonSelectors },
      });
      throw new Error('로그인 버튼을 찾을 수 없습니다.');
    }

    const isClickable = await loginButton.evaluate((el: Element) => {
      const htmlEl = el as HTMLElement;
      const buttonEl = el as HTMLButtonElement;
      return !buttonEl.disabled && htmlEl.offsetParent !== null;
    }).catch(() => false);

    if (!isClickable) {
      await this.delay(1000);
    }

    // ✅ [v1.4.53] 로그인 버튼 클릭 3단계 폴백 — 계정 리스크 점수 높은 계정 대응
    // 배경: 네이버가 의심 계정에 오버레이/pointer-events/버튼 지연 enable을 끼워넣어
    //       Ghost Cursor 클릭이 버튼에 도달하지 못하는 케이스 발생 (5계정 중 2개 실패)
    // 해결: 1차 Ghost Cursor → 2차 Enter 키 → 3차 form.submit() 순차 시도 + 각 단계 성공 검증

    await loginButton.evaluate((el: Element) => {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await this.humanDelay(300, 600);

    // 버튼 상태 사전 검증 — disabled/pointer-events/overlay 감지
    const buttonState = await loginButton.evaluate((el: Element) => {
      const htmlEl = el as HTMLElement;
      const rect = htmlEl.getBoundingClientRect();
      const style = window.getComputedStyle(htmlEl);
      const atPoint = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        disabled: (el as HTMLButtonElement).disabled,
        pointerEvents: style.pointerEvents,
        opacity: parseFloat(style.opacity || '1'),
        // 버튼 중앙 지점에 버튼 자신 또는 자식이 있어야 정상. 아니면 오버레이 의심
        blocked: atPoint !== null && atPoint !== el && !htmlEl.contains(atPoint),
        blockerTag: atPoint && atPoint !== el ? (atPoint as HTMLElement).tagName : null,
      };
    }).catch(() => null);

    if (buttonState) {
      if (buttonState.disabled || buttonState.pointerEvents === 'none' || buttonState.opacity < 0.5) {
        this.log(`⚠️ 로그인 버튼 비활성 감지 (disabled=${buttonState.disabled}, pointer-events=${buttonState.pointerEvents}, opacity=${buttonState.opacity}) → 2초 대기`);
        await this.delay(2000);
      }
      if (buttonState.blocked) {
        this.log(`⚠️ 로그인 버튼 위 오버레이 감지 (차단 요소: ${buttonState.blockerTag}) → 제거 시도`);
        await page.evaluate(() => {
          // 버튼 위를 덮는 fixed/absolute 오버레이 강제 숨김
          document.querySelectorAll('div, section, aside').forEach((el) => {
            const s = window.getComputedStyle(el);
            const z = parseInt(s.zIndex || '0', 10);
            if ((s.position === 'fixed' || s.position === 'absolute') && z > 100) {
              (el as HTMLElement).style.pointerEvents = 'none';
            }
          });
        }).catch(() => {});
      }
    }

    // 클릭 성공 판정 헬퍼 — URL 이동 or 에러 메시지 or 챌린지 페이지 감지
    const checkLoginProgress = async (): Promise<'success' | 'error' | 'challenge' | 'pending'> => {
      try {
        const url = page.url();
        // 로그인 페이지를 벗어나면 성공 (또는 최소한 "다음 단계"로 넘어감)
        if (!url.includes('nid.naver.com/nidlogin') && !url.includes('nid.naver.com/login')) {
          return 'success';
        }
        // 에러/챌린지 페이지 감지
        const pageInfo = await page.evaluate(() => {
          const errEl = document.querySelector('.error_message, .alert_msg, #err_common, .error_on');
          const errText = errEl ? ((errEl as HTMLElement).innerText || '').trim() : '';
          const bodyText = (document.body?.innerText || '').substring(0, 500);
          const hasCaptcha = /보안문자|자동입력|captcha/i.test(bodyText);
          const hasDeny = /새로운 기기|인증 필요|본인 확인/.test(bodyText);
          return { errText, hasCaptcha, hasDeny };
        });
        if (pageInfo.hasCaptcha || pageInfo.hasDeny) return 'challenge';
        if (pageInfo.errText) return 'error';
        return 'pending';
      } catch {
        return 'pending';
      }
    };

    // 각 시도 후 3초간 반응 감지
    const waitForClickResponse = async (timeoutMs: number = 3000): Promise<'success' | 'error' | 'challenge' | 'pending'> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const state = await checkLoginProgress();
        if (state !== 'pending') return state;
        await this.delay(200);
      }
      return 'pending';
    };

    // ━━━ 1차 시도: Ghost Cursor 클릭 (뷰포트 보정) ━━━
    // ✅ [v1.4.66] Ghost Cursor 유지 (isTrusted: true → 캡차 방지)
    // 버그 수정: scrollIntoView 완료 대기 + boundingBox 뷰포트 내 검증 추가
    this.log('🔄 로그인 1차 시도: Ghost Cursor 클릭');
    let clickResult: 'success' | 'error' | 'challenge' | 'pending' = 'pending';
    try {
      if (this.cursor) {
        // scrollIntoView를 instant로 변경하고 충분히 대기
        await loginButton.evaluate((el: Element) => {
          (el as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' });
        });
        await this.delay(500);

        // ✅ [v1.4.66] cursor.click()으로 통합 — moveTo + page.mouse.down/up 분리 버그 수정
        // 이전: cursor.moveTo() → page.mouse.down/up → 두 시스템 위치 불일치로 클릭 미스
        // 수정: cursor.click()은 내부적으로 moveTo + 같은 위치에서 click을 보장
        try {
          await this.cursor.click('#log\\.login', { paddingPercentage: 10 });
        } catch (cursorErr) {
          this.log(`⚠️ Ghost Cursor click 실패: ${(cursorErr as Error).message} → loginButton.click() 폴백`);
          await loginButton.click();
        }
      } else {
        await loginButton.click();
      }
      clickResult = await waitForClickResponse(3000);
    } catch (e) {
      this.log(`⚠️ 1차 클릭 예외: ${(e as Error).message}`);
    }

    // 비밀번호 입력 셀렉터 (하드코딩 방지 — 폴백 전부 활용)
    const pwSelectors = ['#pw', 'input.input_pw', 'input[name="pw"]', 'input[type="password"]'];
    const focusPwInput = async (): Promise<boolean> => {
      for (const sel of pwSelectors) {
        const ok = await page.focus(sel).then(() => true).catch(() => false);
        if (ok) return true;
      }
      return false;
    };

    // 로그인 버튼 재조회 (스테일 핸들 방지)
    const relocateButton = async (): Promise<ElementHandle<Element> | null> => {
      for (const selector of loginButtonSelectors) {
        const btn = await page.waitForSelector(selector, { visible: true, timeout: 2000 }).catch(() => null);
        if (btn) return btn as ElementHandle<Element>;
      }
      // 텍스트 기반 폴백
      return await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(btn => {
          const text = btn.textContent || '';
          return text.includes('로그인') && (btn as HTMLElement).offsetParent !== null;
        }) || null;
      }).then(h => h as ElementHandle<Element> | null).catch(() => null);
    };

    // ━━━ 1.5차 시도: JS element.click() — Playwright 실증 완료 ━━━
    if (clickResult === 'pending') {
      this.log('🔁 로그인 1.5차 시도: JS element.click() (Playwright 실증)');
      try {
        await page.evaluate(() => {
          const btn = document.querySelector('#log\\.login') as HTMLElement;
          if (btn) btn.click();
        });
        clickResult = await waitForClickResponse(3000);
      } catch (e) {
        this.log(`⚠️ 1.5차 클릭 예외: ${(e as Error).message}`);
      }
    }

    // ━━━ 2차 시도: 버튼 재조회 + click + Enter + submit 이벤트 dispatch ━━━
    if (clickResult === 'pending') {
      this.log('🔁 로그인 2차 시도: 버튼 재조회 + click + Enter + submit 이벤트 dispatch');
      try {
        const freshButton = await relocateButton();
        if (freshButton) {
          await freshButton.click().catch(() => {});
        }
        await this.humanDelay(100, 200);

        // Enter 키 전송 (셀렉터 폴백 적용)
        const focused = await focusPwInput();
        if (focused) {
          await page.keyboard.press('Enter').catch(() => {});
        }
        await this.humanDelay(100, 200);

        // 폼에 직접 submit 이벤트 dispatch — keydown.preventDefault 우회
        await page.evaluate(() => {
          const form = (document.querySelector('#frmNIDLogin') as HTMLFormElement)
                    || (document.querySelector('form[name="frmNIDLogin"]') as HTMLFormElement)
                    || (document.querySelector('form') as HTMLFormElement);
          if (form) {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        }).catch(() => {});

        clickResult = await waitForClickResponse(3000);
      } catch (e) {
        this.log(`⚠️ 2차 시도 예외: ${(e as Error).message}`);
      }
    }

    // ━━━ 3차 시도: 네이티브 프로토타입 form.submit() — 오버라이드 우회 ━━━
    if (clickResult === 'pending') {
      this.log('🔁 로그인 3차 시도: 네이티브 HTMLFormElement.prototype.submit 직접 호출');
      try {
        const submitted = await page.evaluate(() => {
          const form = (document.querySelector('#frmNIDLogin') as HTMLFormElement)
                    || (document.querySelector('form[name="frmNIDLogin"]') as HTMLFormElement)
                    || (document.querySelector('form[action*="nidlogin"]') as HTMLFormElement)
                    || (document.querySelector('form') as HTMLFormElement);
          if (!form) return { ok: false, reason: 'no-form' };

          // HTMLFormElement.prototype.submit을 네이티브에서 직접 가져와 호출
          // → 네이버가 form.submit을 오버라이드했어도 우회
          try {
            const nativeSubmit = HTMLFormElement.prototype.submit;
            nativeSubmit.call(form);
            return { ok: true, reason: 'native-submit' };
          } catch (e) {
            // 그래도 실패하면 requestSubmit 시도 (더 현대 API)
            try {
              if (typeof (form as any).requestSubmit === 'function') {
                (form as any).requestSubmit();
                return { ok: true, reason: 'requestSubmit' };
              }
            } catch {}
            return { ok: false, reason: `error: ${(e as Error).message}` };
          }
        });

        if (!submitted.ok) {
          this.log(`⚠️ 3차 시도 실패: ${submitted.reason}`);
        } else {
          this.log(`✅ 3차 시도 실행: ${submitted.reason}`);
          clickResult = await waitForClickResponse(5000);
        }
      } catch (e) {
        this.log(`⚠️ 3차 시도 예외: ${(e as Error).message}`);
      }
    }

    // ━━━ 4차 시도 (최후): XMLHttpRequest로 로그인 POST 직접 전송 ━━━
    // 모든 DOM 기반 submit이 막혔을 때의 마지막 수단
    if (clickResult === 'pending') {
      this.log('🔁 로그인 4차 시도: XHR 직접 전송 (DOM 우회 최후 수단)');
      try {
        const xhrResult = await page.evaluate(() => {
          const form = (document.querySelector('#frmNIDLogin') as HTMLFormElement)
                    || (document.querySelector('form[name="frmNIDLogin"]') as HTMLFormElement)
                    || (document.querySelector('form') as HTMLFormElement);
          if (!form) return { ok: false, reason: 'no-form' };

          const formData = new FormData(form);
          const body = new URLSearchParams();
          formData.forEach((value, key) => body.append(key, value.toString()));

          return fetch(form.action || location.href, {
            method: (form.method || 'POST').toUpperCase(),
            body: body.toString(),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            credentials: 'include',
            redirect: 'follow',
          }).then(async (res) => {
            // 로그인 성공 시 서버가 redirect 응답을 주므로 최종 URL로 이동
            if (res.url && res.url !== location.href) {
              location.href = res.url;
            } else {
              // redirect가 자동 처리된 경우 naver.com 홈으로 이동해서 세션 확인
              location.href = 'https://www.naver.com/';
            }
            return { ok: true, reason: `xhr-${res.status}` };
          }).catch((e) => ({ ok: false, reason: `xhr-error: ${e.message}` }));
        });

        if (xhrResult && xhrResult.ok) {
          this.log(`✅ 4차 시도 실행: ${xhrResult.reason}`);
          clickResult = await waitForClickResponse(8000);
        } else {
          this.log(`⚠️ 4차 시도 실패: ${xhrResult?.reason || 'unknown'}`);
        }
      } catch (e) {
        this.log(`⚠️ 4차 시도 예외: ${(e as Error).message}`);
      }
    }

    // 결과 로깅 — 사용자에게 정확한 원인 표시
    if (clickResult === 'pending') {
      this.log('❌ 로그인 4단계 시도 모두 응답 없음 — 네이버가 해당 계정에 강한 차단을 걸었을 가능성. 수동 로그인 + 며칠간 정상 사용으로 리스크 점수 회복 권장');
      // ✅ [v1.4.54] 로그인 4단계 모두 실패 → 자동 덤프
      await this.dumpFailure('LOGIN_ALL_FALLBACKS_FAILED', new Error('All 4 login click strategies failed'), {
        errorCode: 'LOGIN_E001',
        fallbackStage: 4,
        context: { buttonState },
      });
    } else if (clickResult === 'challenge') {
      this.log('🔐 로그인 챌린지(캡차/본인확인) 감지 — 사용자 개입 필요');
    } else if (clickResult === 'error') {
      this.log('⚠️ 로그인 에러 메시지 감지 (비번 오류 등)');
    } else {
      this.log('✅ 로그인 클릭 성공 — 다음 단계로 진행');
    }

    // 기존 네비게이션 대기 유지 (도메인 이동 안정화 목적)
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (navError) {
      // 네비게이션 타임아웃은 캡차/2FA로 인한 것일 수 있으므로 루프 진입
      await this.delay(1000);
    }

    // ✅ [2026-03-30 OVERHAUL] 캡차/보안 감지 + 사용자 알림 통합 개선
    // 핵심 변경:
    // 1. 텍스트 기반 캡차 감지 (DOM innerText로 '자동입력 방지', '보안문자' 등 탐지)
    // 2. 로그인 에러 메시지 감지 (비밀번호 틀림, 계정 잠금 등)
    // 3. 시간 기반 루프 (10분 통합 타임아웃, 캡차 미감지 시에도 충분한 대기)
    // 4. 30초마다 반복 알림 소리 (사용자가 자리 비운 경우 대비)
    // 5. 브라우저 창 포그라운드로 올리기 (BrowserWindow.focus)
    let challengeDetected = false;  // 캡차/보안문자/인증 등 사용자 개입 필요 상태
    let loginSuccess = false;
    let twoFactorDetected = false;
    let loginErrorDetected: string | null = null;
    const LOGIN_TOTAL_TIMEOUT = 600000; // 10분 통합 타임아웃
    const loginStartTime = Date.now();
    let lastSoundTime = 0;
    const SOUND_INTERVAL = 30000; // 30초마다 알림 소리
    let stuckOnLoginPageSince: number | null = null; // 로그인 페이지에 머무른 시점
    const STUCK_THRESHOLD = 15000; // 15초 이상 로그인 페이지에 머물면 사용자 개입 필요로 판단

    // 🔊 [2026-03-30 FIX] 알림 소리 재생 헬퍼 — execFile + timeout/unref로 좀비 프로세스 방지
    const playAlertSound = async (count: number = 3) => {
      try {
        const { execFile } = await import('child_process');
        const child = execFile('powershell', [
          '-NoProfile', '-NonInteractive', '-Command',
          `Add-Type -AssemblyName System.Media; 1..${count} | ForEach-Object { (New-Object Media.SoundPlayer 'C:\\Windows\\Media\\notify.wav').PlaySync(); Start-Sleep -Milliseconds 300 }`
        ], { timeout: 10000 });
        child.unref();
      } catch (e) { console.debug('[Sound] 알림 사운드 재생 실패:', (e as Error).message); }
    };

    // 🪟 [2026-03-30 FIX] 브라우저 창 포커스 헬퍼
    // 이전: page.bringToFront()는 탭만 전환하지 실제 윈도우를 올리지 않음
    // 현재: Electron BrowserWindow.focus() + setAlwaysOnTop으로 실제 윈도우 활성화
    const bringBrowserToFront = async () => {
      try {
        // Puppeteer 탭 포커스 (기본)
        if (this.page) {
          await this.page.bringToFront();
        }
        // Electron BrowserWindow 활성화 (실제 윈도우를 최상위로)
        try {
          const { BrowserWindow } = await import('electron');
          const allWindows = BrowserWindow.getAllWindows();
          for (const win of allWindows) {
            if (!win.isDestroyed()) {
              if (win.isMinimized()) win.restore();
              win.focus();
              // 일시적으로 최상위에 표시 후 해제 (사용자 경험 보호)
              win.setAlwaysOnTop(true);
              setTimeout(() => {
                try { win.setAlwaysOnTop(false); } catch (e) { console.debug('[Window] setAlwaysOnTop(false) 실패:', (e as Error).message); }
              }, 3000);
              break;
            }
          }
        } catch { /* Electron import 실패 시 무시 (테스트 환경) */ }
      } catch (e) { console.debug('[Window] bringBrowserToFront 실패:', (e as Error).message); }
    };

    while (true) {
      this.ensureNotCancelled();

      // ⏰ 전체 타임아웃 확인
      const elapsed = Date.now() - loginStartTime;
      if (elapsed >= LOGIN_TOTAL_TIMEOUT) {
        const finalUrl = page.url();
        if (challengeDetected) {
          throw new Error(`보안 인증 해결 시간이 초과되었습니다. (10분) 최종 URL: ${finalUrl}`);
        } else if (loginErrorDetected) {
          throw new Error(loginErrorDetected);
        } else {
          throw new Error(`로그인 시간이 초과되었습니다. (10분) 최종 URL: ${finalUrl}`);
        }
      }

      // 대기 시간 (챌린지 감지 시 2초, 일반 1초)
      await this.delay(challengeDetected ? 2000 : 1000);

      const currentUrl = page.url();

      // ═══════════════════════════════════════════════════════════════
      // 1️⃣ 로그인 성공 여부 우선 확인
      // ═══════════════════════════════════════════════════════════════
      if (!currentUrl.includes('nidlogin') && !currentUrl.includes('nid.naver.com/login')) {
        if (currentUrl.includes('naver.com')) {
          loginSuccess = true;
          this.log('✅ 네이버 로그인이 성공적으로 완료되었습니다.');
          break;
        }
        if (currentUrl !== loginUrl && currentUrl !== 'about:blank') {
          await this.delay(1000);
          this.ensureNotCancelled();
          const finalCheckUrl = page.url();
          if (!finalCheckUrl.includes('nidlogin') && !finalCheckUrl.includes('login')) {
            loginSuccess = true;
            this.log('✅ 네이버 로그인이 성공적으로 완료되었습니다.');
            break;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 2️⃣ 보호조치/본인인증 페이지 감지 (URL 기반)
      // ═══════════════════════════════════════════════════════════════
      if (currentUrl.includes('protect') || currentUrl.includes('security') || currentUrl.includes('verification')) {
        if (!challengeDetected) {
          challengeDetected = true;
          this.log('');
          this.log('🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒');
          this.log('⚠️  보호조치/본인인증 페이지 감지!');
          this.log('🖱️  브라우저에서 본인인증을 완료해주세요!');
          this.log('⏳  최대 10분간 기다립니다...');
          this.log('🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒');
          this.log('');
          await bringBrowserToFront();
          await playAlertSound(5);
          if (this.progressCallback) {
            this.progressCallback(0, 100, '🔒 보호조치 감지! 브라우저에서 본인인증을 완료해주세요!');
          }
        }
        // 주기적 알림
        if (Date.now() - lastSoundTime > SOUND_INTERVAL) {
          lastSoundTime = Date.now();
          const remainSec = Math.floor((LOGIN_TOTAL_TIMEOUT - elapsed) / 1000);
          this.log(`⏳ 보호조치 대기 중... (남은 시간: ${Math.floor(remainSec / 60)}분 ${remainSec % 60}초)`);
          await playAlertSound(2);
          if (this.progressCallback) {
            this.progressCallback(0, 100, `🔒 보호조치 대기 중 (${Math.floor(remainSec / 60)}분 ${remainSec % 60}초 남음)`);
          }
        }
        continue;
      }

      // ═══════════════════════════════════════════════════════════════
      // 3️⃣ 기기 등록 페이지 자동 처리
      // ═══════════════════════════════════════════════════════════════
      if (await this.isDeviceConfirmPage(page)) {
        await this.handleDeviceConfirmPage(page);
        continue;
      }

      // ═══════════════════════════════════════════════════════════════
      // 4️⃣ 2단계 인증 처리
      // ═══════════════════════════════════════════════════════════════
      const is2FALogin = await this.handleTwoFactorAuthPage(page, twoFactorDetected);
      if (is2FALogin) {
        if (!twoFactorDetected) {
          twoFactorDetected = true;
          challengeDetected = true;
          await bringBrowserToFront();
          await playAlertSound(5);
        }
        // 주기적 알림
        if (Date.now() - lastSoundTime > SOUND_INTERVAL) {
          lastSoundTime = Date.now();
          const remainSec = Math.floor((LOGIN_TOTAL_TIMEOUT - elapsed) / 1000);
          this.log(`⏳ 2단계 인증 승인 대기 중... 네이버 앱에서 승인해주세요! (${Math.floor(remainSec / 60)}분 ${remainSec % 60}초 남음)`);
          await playAlertSound(2);
          if (this.progressCallback) {
            this.progressCallback(0, 100, `📱 2단계 인증 대기 중 (${Math.floor(remainSec / 60)}분 ${remainSec % 60}초 남음)`);
          }
        }
        continue;
      } else if (twoFactorDetected) {
        twoFactorDetected = false;
        challengeDetected = false;
        this.log('✅ 2단계 인증이 완료되었습니다! 로그인을 계속 진행합니다.');
        await this.delay(1500);
        continue;
      }

      // ═══════════════════════════════════════════════════════════════
      // 5️⃣ 로그인 페이지에 머물러 있는 경우 — 종합 진단
      // ═══════════════════════════════════════════════════════════════
      if (currentUrl.includes('nidlogin') || currentUrl.includes('nid.naver.com')) {
        try {
          // 🔍 [Playwright 검증 완료] 페이지 DOM 종합 분석 (2026-03-30 실제 nid.naver.com 확인)
          // 검증된 셀렉터:
          //   ID: #id (class: input_id), PW: #pw (class: input_pw)
          //   로그인 버튼: #log.login (class: btn_login off next_step nlog-click)
          //   캡차 hidden input: #ncaptchaSplit (value="none" → 캡차 활성 시 값 변경)
          //   에러 div: #err_common, #err_empty_id, #err_empty_pw, #err_capslock (모두 class: login_error_wrap)
          //   에러 텍스트: .error_message 내부
          const pageAnalysis = await page.evaluate(() => {
            const bodyText = document.body?.innerText || '';

            // ═══ 1. 캡차/보안문자 감지 ═══

            // [Playwright 검증] #ncaptchaSplit: 기본값 "none", 캡차 활성 시 값 변경
            const ncaptchaSplit = document.querySelector('#ncaptchaSplit') as HTMLInputElement | null;
            const ncaptchaSplitActive = ncaptchaSplit && ncaptchaSplit.value !== 'none' && ncaptchaSplit.value !== '';

            // 텍스트 기반 캡차 감지
            const captchaKeywords = [
              '자동입력 방지', '자동 입력 방지', '보안문자', '자동등록방지',
              '아래 문자를 입력', '이미지에 보이는', '보이는 문자',
              '글자를 입력', '인증 문자', 'captcha', 'CAPTCHA',
              '자동입력방지문자', '방지 문자',
            ];
            const hasCaptchaText = captchaKeywords.some(function(kw) { return bodyText.includes(kw); });

            // CSS 셀렉터 기반 캡차 요소 감지 (visible 요소만)
            const captchaSelectors = [
              '#captcha', '.captcha', '#captchaimg', '.captcha_img',
              'iframe[src*="captcha"]', 'iframe[src*="challenge"]',
              'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]',
              '#chptchaArea', '#captcha_area', '.login_captcha',
              '[class*="captcha_wrap"]', '[class*="chptcha"]',
              'img[src*="captcha"]', 'img[alt*="자동입력"]', 'img[alt*="보안"]',
            ];
            let hasCaptchaElement = false;
            for (let i = 0; i < captchaSelectors.length; i++) {
              try {
                const el = document.querySelector(captchaSelectors[i]);
                if (el) {
                  const htmlEl = el as HTMLElement;
                  const style = getComputedStyle(htmlEl);
                  if (style.display !== 'none' && style.visibility !== 'hidden' && htmlEl.offsetParent !== null) {
                    hasCaptchaElement = true;
                    break;
                  }
                }
              } catch (e) { /* 무시 */ }
            }

            // 캡차 이미지 감지 (src에 captcha 포함)
            let hasCaptchaImage = false;
            const imgs = document.querySelectorAll('img');
            for (let j = 0; j < imgs.length; j++) {
              const src = imgs[j].src || '';
              if (src.includes('captcha') || src.includes('Captcha') || src.includes('CAPTCHA')) {
                hasCaptchaImage = true;
                break;
              }
            }

            // iframe 내 CAPTCHA 감지
            let suspiciousIframeCount = 0;
            const iframes = document.querySelectorAll('iframe');
            for (let k = 0; k < iframes.length; k++) {
              const iframeSrc = iframes[k].src || '';
              if (iframeSrc.includes('captcha') || iframeSrc.includes('challenge') ||
                  iframeSrc.includes('recaptcha') || iframeSrc.includes('hcaptcha') ||
                  iframeSrc.includes('turnstile') || iframeSrc.includes('arkose')) {
                suspiciousIframeCount++;
              }
            }

            const hasCaptcha = !!(ncaptchaSplitActive || hasCaptchaText || hasCaptchaElement || hasCaptchaImage || suspiciousIframeCount > 0);

            // ═══ 2. 로그인 에러 메시지 감지 ═══
            // [Playwright 검증] 네이버 에러 div들 (기본 display:none, 에러 시 visible)
            const errorMessages: { type: string; text: string }[] = [];
            const naverErrorDivs = ['#err_common', '#err_empty_id', '#err_empty_pw', '#err_capslock',
                                  '#err_passkey_common', '#err_passkey_common2', '#err_passkey_common3', '#err_passkey_common4'];
            for (let m = 0; m < naverErrorDivs.length; m++) {
              try {
                const errDiv = document.querySelector(naverErrorDivs[m]) as HTMLElement | null;
                if (errDiv) {
                  const errStyle = getComputedStyle(errDiv);
                  // [Playwright 검증] 기본은 display:none, 에러 시 display가 변경됨
                  if (errStyle.display !== 'none') {
                    const errText = errDiv.innerText.trim();
                    if (errText) {
                      errorMessages.push({ type: naverErrorDivs[m], text: errText });
                    }
                  }
                }
              } catch (e) { /* 무시 */ }
            }

            // [Playwright 검증] .error_message 클래스 (에러 div 내부 텍스트 컨테이너)
            const errMsgEls = document.querySelectorAll('.error_message');
            for (let n = 0; n < errMsgEls.length; n++) {
              try {
                const errMsgEl = errMsgEls[n] as HTMLElement;
                const errMsgStyle = getComputedStyle(errMsgEl);
                if (errMsgStyle.display !== 'none' && errMsgEl.offsetParent !== null) {
                  const msgText = errMsgEl.innerText.trim();
                  if (msgText) {
                    errorMessages.push({ type: '.error_message', text: msgText });
                  }
                }
              } catch (e) { /* 무시 */ }
            }

            // ✅ [2026-03-30 FIX] 에러 키워드를 visible 에러 div 텍스트에서만 검색
            // 이전: bodyText 전체에서 검색 → footer/약관의 '잠시 후 다시' 같은 일반 텍스트에 오탐
            // 현재: 에러 div에서 추출된 errorMessages 텍스트 + #err_common 내용에서만 검색
            const visibleErrorText = errorMessages.map(function(e) { return e.text; }).join(' ');

            const errorKeywords = [
              { keyword: '비밀번호가 일치하지', type: 'wrong_password' },
              { keyword: '비밀번호를 잘못', type: 'wrong_password' },
              { keyword: '비밀번호가 틀', type: 'wrong_password' },
              { keyword: '아이디 또는 비밀번호가', type: 'wrong_credentials' },
              { keyword: '아이디 또는 비밀번호를 다시', type: 'wrong_credentials' },
              { keyword: '존재하지 않는 아이디', type: 'wrong_id' },
              { keyword: '등록되지 않은', type: 'wrong_id' },
              { keyword: '제한된 아이디', type: 'account_locked' },
              { keyword: '이용이 제한', type: 'account_locked' },
              { keyword: '계정이 잠', type: 'account_locked' },
              { keyword: '로그인 제한', type: 'login_restricted' },
              { keyword: '해외 로그인 차단', type: 'overseas_blocked' },
              { keyword: '비정상적인 로그인', type: 'suspicious_login' },
              { keyword: '횟수가 초과', type: 'too_many_attempts' },
              { keyword: '잠시 후 다시', type: 'too_many_attempts' },
              { keyword: '새로운 환경', type: 'new_environment' },
            ];
            const detectedErrors: { keyword: string; type: string }[] = [];
            // visible 에러 div 텍스트에서만 키워드 검색 (false positive 방지)
            if (visibleErrorText.length > 0) {
              for (let p = 0; p < errorKeywords.length; p++) {
                if (visibleErrorText.includes(errorKeywords[p].keyword)) {
                  detectedErrors.push(errorKeywords[p]);
                }
              }
            }

            // ═══ 3. 페이지 요소 존재 확인 ═══
            const hasIdField = !!document.querySelector('#id');
            const hasPwField = !!document.querySelector('#pw');
            const hasLoginButton = !!(
              document.querySelector('#log\\.login') ||
              document.querySelector('button.btn_login') ||
              document.querySelector('button[type="submit"]')
            );

            // 캡차 감지 방식 (디버깅용)
            const captchaMethod = ncaptchaSplitActive ? 'ncaptchaSplit' :
              hasCaptchaText ? '텍스트' :
              hasCaptchaElement ? 'DOM요소' :
              hasCaptchaImage ? '이미지' :
              suspiciousIframeCount > 0 ? 'iframe' : 'none';

            return {
              hasCaptchaText: hasCaptchaText,
              hasCaptchaElement: hasCaptchaElement,
              hasCaptchaImage: hasCaptchaImage,
              ncaptchaSplitActive: !!ncaptchaSplitActive,
              hasCaptcha: hasCaptcha,
              captchaMethod: captchaMethod,
              errorMessages: errorMessages,
              detectedErrors: detectedErrors,
              hasIdField: hasIdField,
              hasPwField: hasPwField,
              hasLoginButton: hasLoginButton,
              suspiciousIframeCount: suspiciousIframeCount,
              bodyTextSnippet: bodyText.substring(0, 500),
            };
          }).catch(() => null);

          if (!pageAnalysis) {
            // evaluate 실패 — 페이지 전환 중일 수 있음
            continue;
          }

          // ─── 5-A: 로그인 에러 메시지 감지 → 즉시 실패 (재시도 무의미) ───
          if (pageAnalysis.detectedErrors.length > 0) {
            const firstError = pageAnalysis.detectedErrors[0];
            const errorTexts = pageAnalysis.errorMessages.map(e => e.text).join(', ');

            switch (firstError.type) {
              case 'wrong_password':
                loginErrorDetected = `❌ 비밀번호가 틀렸습니다. 네이버 로그인 비밀번호를 확인해주세요.${errorTexts ? ` (${errorTexts})` : ''}`;
                break;
              case 'wrong_credentials':
                loginErrorDetected = `❌ 아이디 또는 비밀번호가 일치하지 않습니다. 다시 확인해주세요.${errorTexts ? ` (${errorTexts})` : ''}`;
                break;
              case 'wrong_id':
                loginErrorDetected = `❌ 존재하지 않는 아이디입니다. 아이디를 확인해주세요.${errorTexts ? ` (${errorTexts})` : ''}`;
                break;
              case 'account_locked':
                loginErrorDetected = `🔒 계정이 잠겼거나 이용이 제한되었습니다. 네이버 고객센터에서 확인해주세요.${errorTexts ? ` (${errorTexts})` : ''}`;
                break;
              case 'too_many_attempts':
                loginErrorDetected = `⏳ 로그인 시도 횟수가 초과되었습니다. 잠시 후 다시 시도해주세요.${errorTexts ? ` (${errorTexts})` : ''}`;
                break;
              default:
                loginErrorDetected = `❌ 로그인 에러: ${firstError.keyword}${errorTexts ? ` (${errorTexts})` : ''}`;
            }

            this.log(`❌ 로그인 에러 감지: ${loginErrorDetected}`);

            // 사용자에게 알림
            if (this.progressCallback) {
              this.progressCallback(0, 100, loginErrorDetected);
            }
            await playAlertSound(3);

            // ⚠️ 단, 'too_many_attempts'와 'new_environment'는 사용자 개입으로 해결 가능
            if (firstError.type === 'too_many_attempts' || firstError.type === 'new_environment' || firstError.type === 'suspicious_login') {
              challengeDetected = true;
              stuckOnLoginPageSince = stuckOnLoginPageSince || Date.now();
              continue; // 사용자가 해결할 수 있으므로 대기 계속
            }

            // 비밀번호 틀림 등은 즉시 실패
            throw new Error(loginErrorDetected);
          }

          // ─── 5-B: 캡차/보안문자 감지 ───
          if (pageAnalysis.hasCaptcha) {
            if (!challengeDetected) {
              challengeDetected = true;
              lastSoundTime = Date.now();
              stuckOnLoginPageSince = null; // 캡차 감지되었으므로 stuck 카운터 리셋

              const detectionMethod = pageAnalysis.captchaMethod || 'unknown';

              this.log('');
              this.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
              this.log(`⚠️  캡차/보안문자가 감지되었습니다! (감지 방식: ${detectionMethod})`);
              this.log('🖱️  브라우저 창에서 캡차를 직접 해결해주세요!');
              this.log('📝  캡차 해결 후 비밀번호가 지워졌다면 다시 입력해주세요!');
              this.log('⏳  해결될 때까지 최대 10분간 기다립니다...');
              this.log('🔔  30초마다 알림 소리가 울립니다.');
              this.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
              this.log('');

              await bringBrowserToFront();
              await playAlertSound(5); // 첫 감지 시 5번 울림

              if (this.progressCallback) {
                this.progressCallback(0, 100, '🚨 캡차 감지! 브라우저에서 캡차를 해결해주세요!');
              }
            } else {
              // 주기적 알림 (30초 간격)
              if (Date.now() - lastSoundTime > SOUND_INTERVAL) {
                lastSoundTime = Date.now();
                const remainSec = Math.floor((LOGIN_TOTAL_TIMEOUT - elapsed) / 1000);
                this.log(`⏳ 캡차 해결 대기 중... (남은 시간: ${Math.floor(remainSec / 60)}분 ${remainSec % 60}초)`);
                this.log(`   💡 브라우저 창에서 캡차를 직접 해결해주세요!`);
                await playAlertSound(2);
                if (this.progressCallback) {
                  this.progressCallback(0, 100, `🚨 캡차 대기 중 (${Math.floor(remainSec / 60)}분 ${remainSec % 60}초 남음)`);
                }
              }
            }
            continue;
          } else if (challengeDetected && !twoFactorDetected) {
            // 캡차가 사라졌으면 해결된 것으로 간주
            challengeDetected = false;
            stuckOnLoginPageSince = null;
            this.log('✅ 캡차/보안 인증이 해결되었습니다! 로그인을 계속 진행합니다...');

            // ✅ [2026-03-30 FIX] 캡차 해결 후 비밀번호 필드 확인 — 캡차 과정에서 초기화되었을 수 있음
            try {
              const pwAfterCaptcha = await page.evaluate(() => {
                const pw = document.querySelector('#pw') as HTMLInputElement;
                return pw?.value?.length || 0;
              });
              if (pwAfterCaptcha === 0) {
                this.log('⚠️ 비밀번호가 초기화되었습니다. 자동 재입력 시도...');
                const pwInput = await page.$('#pw');
                if (pwInput) {
                  await pwInput.click();
                  await this.humanDelay(300, 600);
                  for (const char of this.options.naverPassword) {
                    await this.loginKeyType(page, char);
                    if (Math.random() < 0.05) await this.humanDelay(200, 400);
                  }
                  await this.humanDelay(400, 800);
                  this.log('✅ 비밀번호 재입력 완료');
                }
              }
            } catch (pwCheckErr) {
              this.log(`⚠️ 비밀번호 확인 중 오류 (무시): ${(pwCheckErr as Error).message?.substring(0, 60)}`);
            }

            // 캡차 해결 후 로그인 버튼 재클릭 시도
            await this.delay(1000);
            try {
              const retryBtnSelectors = [
                ...this.LOGIN_BUTTON_SELECTORS,
                'button[type="submit"].next_step',
              ];

              for (const selector of retryBtnSelectors) {
                const retryBtn = await page.$(selector).catch(() => null);
                if (retryBtn) {
                  const isClickable = await retryBtn.evaluate((el: Element) => {
                    const htmlEl = el as HTMLElement;
                    const buttonEl = el as HTMLButtonElement;
                    return !buttonEl.disabled && htmlEl.offsetParent !== null;
                  }).catch(() => false);

                  if (isClickable) {
                    if (this.cursor) {
                      const box = await retryBtn.boundingBox();
                      if (box) {
                        await this.cursor.moveTo({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
                        await this.humanDelay(100, 300);
                        await page.mouse.down();
                        await this.humanDelay(50, 150);
                        await page.mouse.up();
                      } else {
                        await retryBtn.click();
                      }
                    } else {
                      await retryBtn.click();
                    }
                    this.log('🔄 로그인 버튼을 다시 클릭했습니다.');
                    await this.delay(2000);
                    break;
                  }
                }
              }
            } catch (error) {
              this.log(`ℹ️ 로그인 버튼 재클릭 시도 중 오류 (무시): ${(error as Error).message}`);
            }
            continue;
          }

          // ─── 5-C: 로그인 페이지에 너무 오래 머물러 있음 (미감지 챌린지) ───
          // 캡차도, 에러도 감지 안 됐는데 여전히 로그인 페이지면 → 무언가 사용자 개입이 필요
          if (pageAnalysis.hasIdField || pageAnalysis.hasPwField) {
            if (!stuckOnLoginPageSince) {
              stuckOnLoginPageSince = Date.now();
            }

            const stuckDuration = Date.now() - stuckOnLoginPageSince;
            if (stuckDuration > STUCK_THRESHOLD && !challengeDetected) {
              challengeDetected = true;
              lastSoundTime = Date.now();

              this.log('');
              this.log('🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔');
              this.log('⚠️  로그인이 진행되지 않고 있습니다!');
              this.log('🖱️  브라우저를 확인해주세요!');
              this.log('   가능한 원인:');
              this.log('   • 캡차/보안문자가 떴을 수 있습니다');
              this.log('   • 비밀번호가 틀렸을 수 있습니다');
              this.log('   • 새로운 보안 인증이 필요할 수 있습니다');
              this.log('⏳  최대 10분간 기다립니다. 브라우저에서 직접 로그인을 완료해주세요!');
              this.log('🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔');
              this.log('');
              this.log(`   📍 현재 페이지 내용 (일부): ${pageAnalysis.bodyTextSnippet.substring(0, 200)}`);

              await bringBrowserToFront();
              await playAlertSound(5);

              if (this.progressCallback) {
                this.progressCallback(0, 100, '🔔 로그인 진행 안 됨! 브라우저를 확인해주세요!');
              }
            } else if (challengeDetected && Date.now() - lastSoundTime > SOUND_INTERVAL) {
              // 주기적 알림 (30초 간격)
              lastSoundTime = Date.now();
              const remainSec = Math.floor((LOGIN_TOTAL_TIMEOUT - elapsed) / 1000);
              this.log(`⏳ 브라우저 확인 대기 중... (남은 시간: ${Math.floor(remainSec / 60)}분 ${remainSec % 60}초)`);
              await playAlertSound(2);
              if (this.progressCallback) {
                this.progressCallback(0, 100, `🔔 브라우저 확인 필요 (${Math.floor(remainSec / 60)}분 ${remainSec % 60}초 남음)`);
              }
            }
          }
        } catch (evalError) {
          // evaluate 실패 — 페이지 전환 중일 수 있으므로 무시
          this.log(`   ⚠️ 페이지 분석 중 오류 (무시): ${(evalError as Error).message?.substring(0, 80)}`);
        }
      }
    }

    // 최종 확인
    const finalUrl = page.url();
    if (!loginSuccess && (finalUrl.includes('nidlogin') || finalUrl.includes('login'))) {
      if (loginErrorDetected) {
        throw new Error(loginErrorDetected);
      } else if (challengeDetected) {
        throw new Error(`보안 인증 해결 시간이 초과되었습니다. 최종 URL: ${finalUrl}`);
      } else {
        throw new Error(`로그인에 실패했습니다. 아이디/비밀번호를 확인해주세요. 최종 URL: ${finalUrl}`);
      }
    }

    if (!loginSuccess) {
      throw new Error('로그인에 실패했습니다. URL이 변경되지 않았습니다.');
    }

    // 로그인 성공 후 쿠키 저장
    await this.saveCookies();

    // ✅ BrowserSessionManager에 로그인 상태 알림
    browserSessionManager.setLoggedIn(this.options.naverId, true);
  }

  async navigateToBlogWrite(): Promise<void> {
    const page = this.ensurePage();
    const blogWriteUrl = this.options.blogWriteUrl ?? 'https://blog.naver.com/GoBlogWrite.naver';

    this.ensureNotCancelled();
    this.log('🔄 블로그 글쓰기 페이지로 이동 중...');

    // 현재 URL 확인
    const currentUrl = page.url();
    this.log(`   현재 URL: ${currentUrl}`);

    // ✅ [2026-03-27 FIX] about:blank 경유 제거 — 네이버 세션 의심 유발 + 캡차 트리거
    // 이전 에디터의 alert는 ensureDialogHandler()가 자동으로 수락하므로 about:blank 불필요
    // about:blank → blog.naver.com 패턴은 봇 행동으로 감지될 수 있음
    if (currentUrl.includes('blog.naver.com') || currentUrl.includes('GoBlogWrite') ||
        currentUrl.includes('blogPostWrite') || currentUrl.includes('NaverWriteEditor')) {
      this.log('   ℹ️ 이전 에디터 페이지에서 GoBlogWrite로 직접 이동합니다 (about:blank 미경유)');
    }

    // 로그인 페이지에 있으면 로그인이 필요함
    if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
      this.log('   ⚠️ 로그인 페이지에 있습니다. 로그인을 다시 시도합니다...');
      // ✅ [2026-03-26 FIX] isLoggedIn 캐시 무효화 — 서버 측 세션 만료 감지
      // 이 호출이 없으면 다음 run()에서 loginToNaver()가 스킵되어 무한 실패
      browserSessionManager.setLoggedIn(this.options.naverId, false);
      throw new Error(
        '로그인이 필요합니다.\n\n' +
        '현재 로그인 페이지에 있습니다.\n' +
        '이는 다음과 같은 이유로 발생할 수 있습니다:\n\n' +
        '1. 로그인이 완료되지 않았습니다.\n' +
        '2. 로그인 세션이 만료되었습니다.\n' +
        '3. 캡차 인증이 필요합니다.\n\n' +
        '해결 방법:\n' +
        '1. 브라우저 창에서 로그인을 완료해주세요.\n' +
        '2. 캡차가 나타나면 수동으로 해결해주세요.\n' +
        '3. 로그인 완료 후 다시 시도해주세요.'
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🛡️ [2026-03-23] 끝판왕 워밍업 브라우징 — 네이버 메인 → (랜덤 서비스) → 블로그 홈 → 글쓰기
    // ✅ [2026-03-27 FIX] 이미 블로그/에디터에 있으면 워밍업 스킵 — 매 발행마다 반복하면 봇 패턴
    // ═══════════════════════════════════════════════════════════════════
    const shouldSkipWarmup = currentUrl.includes('blog.naver.com') ||
                              currentUrl.includes('GoBlogWrite') ||
                              currentUrl.includes('blogPostWrite') ||
                              currentUrl.includes('NaverWriteEditor');

    if (shouldSkipWarmup) {
      this.log('   ⚡ 워밍업 스킵 (이미 블로그 도메인에 위치 — 연속 발행 최적화)');
    } else {
    this.log('   🛡️ 끝판왕 워밍업 브라우징 시작...');
    try {
      // Step 1: 네이버 메인 방문 (5~8초 체류)
      this.log('   🌐 네이버 메인 방문 중...');
      await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      const naverStay = this.randomInt(5000, 8000);
      
      // 네이버 메인에서 자연스러운 행동
      await page.evaluate(() => window.scrollBy(0, 150 + Math.random() * 250)).catch(() => {});
      await this.humanDelay(1500, 2500);
      
      // 마우스 이동 시뮬레이션 (검색창 근처)
      const vs1 = page.viewport();
      if (vs1) {
        await page.mouse.move(
          this.randomInt(300, vs1.width - 300),
          this.randomInt(80, 200),
          { steps: this.randomInt(10, 20) }
        ).catch(() => {});
      }
      await this.humanDelay(1000, 2000);
      await page.evaluate(() => window.scrollBy(0, 100 + Math.random() * 300)).catch(() => {});
      await this.delay(naverStay - 3000);
      this.log(`   ✅ 네이버 메인 ${Math.round(naverStay/1000)}초 체류 완료`);
      
      // Step 1.5: (끝판왕) 20% 확률로 랜덤 네이버 서비스 경유 — 실제 사용자는 뉴스/카페도 봄
      if (Math.random() < 0.20) {
        const naverServices = [
          { name: '네이버 뉴스', url: 'https://news.naver.com' },
          { name: '네이버 카페', url: 'https://cafe.naver.com' },
          { name: '네이버 쇼핑', url: 'https://shopping.naver.com' },
          { name: '네이버 블로그 탐색', url: 'https://section.blog.naver.com' },
        ];
        const service = naverServices[Math.floor(Math.random() * naverServices.length)];
        this.log(`   🎲 랜덤 서비스 경유: ${service.name} (끝판왕 행동)`);
        await page.goto(service.url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        
        const serviceStay = this.randomInt(3000, 7000);
        // 서비스 페이지에서 자연스러운 행동
        for (let s = 0; s < this.randomInt(1, 3); s++) {
          await page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 400)).catch(() => {});
          await this.humanDelay(800, 1800);
        }
        await this.delay(Math.max(0, serviceStay - 2000));
        this.log(`   ✅ ${service.name} ${Math.round(serviceStay/1000)}초 체류 완료`);
      }
      
      // Step 2: 블로그 홈 방문 (5~10초 체류)
      const blogHomeUrl = `https://blog.naver.com/${this.options.naverId}`;
      this.log('   🏠 블로그 홈 방문 중...');
      await page.goto(blogHomeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      
      const blogStay = this.randomInt(5000, 10000);
      this.log(`   👀 블로그 홈 둘러보는 중... (${Math.round(blogStay/1000)}초)`);
      
      // 자연스러운 스크롤 (여러 번)
      for (let scroll = 0; scroll < this.randomInt(2, 4); scroll++) {
        await page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 300)).catch(() => {});
        await this.humanDelay(800, 2000);
      }
      
      // 마우스 이동 시뮬레이션 (여러 번)
      const vs2 = page.viewport();
      if (vs2) {
        for (let mm = 0; mm < this.randomInt(2, 3); mm++) {
          await page.mouse.move(
            this.randomInt(150, vs2.width - 150),
            this.randomInt(150, vs2.height - 150),
            { steps: this.randomInt(8, 15) }
          ).catch(() => {});
          await this.humanDelay(500, 1200);
        }
      }
      
      await this.delay(Math.max(0, blogStay - 4000));
      
      // 스크롤 복귀
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
      await this.humanDelay(800, 1500);
      this.log('   🛡️ 끝판왕 워밍업 브라우징 완료!');
    } catch (warmupErr) {
      this.log(`   ⚠️ 워밍업 브라우징 스킵 (${(warmupErr as Error).message})`);
    }
    } // ✅ [2026-03-27] shouldSkipWarmup else 블록 종료

    // 블로그 글쓰기 페이지로 이동
    this.log('   📝 블로그 글쓰기 페이지로 이동합니다...');

    let navigationSuccess = false;
    let lastError: Error | null = null;

    // 최대 3번 시도
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.log(`   🔄 시도 ${attempt}/3...`);

        await page.goto(blogWriteUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        // 페이지 로드 대기
        await this.delay(3000);

        // URL 확인
        const finalUrl = page.url();
        this.log(`   최종 URL: ${finalUrl}`);

        // Chromium 에러 페이지 감지 (일시적 네트워크 오류/차단/리다이렉트 실패 등)
        if (
          finalUrl.startsWith('chrome-error://') ||
          finalUrl.includes('chromewebdata') ||
          finalUrl === 'about:blank'
        ) {
          const pageTitle = await page.title().catch(() => '');
          throw new Error(
            `페이지 로딩 오류 감지 (크롬 에러 페이지)\n` +
            `URL: ${finalUrl}\n` +
            (pageTitle ? `TITLE: ${pageTitle}` : '')
          );
        }

        // ✅ [2026-02-14] 기기 등록 페이지 자동 처리 (URL + 페이지 텍스트 이중 감지)
        if (await this.isDeviceConfirmPage(page)) {
          this.log('   📱 기기 등록 페이지 감지 - 자동 바이패스 중...');
          await this.handleDeviceConfirmPage(page);
          continue; // 바이패스 후 다시 블로그 이동 시도
        }

        // ✅ [2026-03-24 FIX] 로그인/세션 문제 감지 — 로그인 페이지 + 메인 페이지 리다이렉트 통합 처리
        const isLoginRedirect = finalUrl.includes('nidlogin') || finalUrl.includes('login.naver') ||
                                (finalUrl.includes('/login') && !finalUrl.includes('blog.naver.com'));
        const isEditorUrl = finalUrl.includes('blogPostWrite') ||
                            finalUrl.includes('GoBlogWrite') ||
                            finalUrl.includes('NaverWriteEditor');
        const isBlogDomain = finalUrl.includes('blog.naver.com');

        // 에디터 URL 패턴이 확인되면 즉시 성공 (가장 빠른 경로)
        if (isEditorUrl) {
          this.log(`   ✅ 에디터 페이지 확인됨`);
          // 아래 성공 처리로 진행
        }
        // 로그인 페이지로 리다이렉트된 경우
        else if (isLoginRedirect) {
          this.log(`   ⚠️ 로그인 페이지로 리다이렉트됨. 로그인 세션이 만료되었습니다.`);
          // ✅ [2026-03-26 FIX] isLoggedIn 캐시 무효화 — 이게 없으면 loginToNaver()가 캐시 때문에 스킵됨
          browserSessionManager.setLoggedIn(this.options.naverId, false);

          // 마지막 시도가 아니면 재로그인 시도
          if (attempt < 3) {
            this.log(`   🔄 로그인을 다시 시도합니다...`);
            await this.loginToNaver();
            continue;
          } else {
            // ✅ 바로 에러 던지지 말고 수동 로그인 대기!
            this.log('');
            this.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
            this.log('⚠️  세션이 계속 만료됩니다!');
            this.log('');
            this.log('🖱️  브라우저에서 직접 로그인해주세요:');
            this.log('   1. 아이디/비밀번호 입력');
            this.log('   2. 캡차 해결 (있으면)');
            this.log('   3. 로그인 버튼 클릭');
            this.log('');
            this.log('⏳  로그인 완료될 때까지 10분간 기다립니다...');
            this.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
            this.log('');

            // Windows 알림음
            try {
              const { exec } = await import('child_process');
              exec('powershell -c "1..5 | ForEach-Object { [console]::beep(1000,200); Start-Sleep -Milliseconds 100 }"');
            } catch (e) { console.debug('[Sound] 세션만료 알림음 실패:', (e as Error).message); }

            if (this.progressCallback) {
              this.progressCallback(0, 100, '🚨 세션 만료! 브라우저에서 직접 로그인해주세요!');
            }

            // 수동 로그인 대기 (최대 10분)
            await this.waitForManualLogin(page, 600000);

            // 수동 로그인 성공 후 블로그 페이지로 다시 이동
            this.log('🔄 블로그 글쓰기 페이지로 다시 이동합니다...');
            // ✅ [2026-03-26 FIX] 수동 로그인 성공 캐시 반영
            browserSessionManager.setLoggedIn(this.options.naverId, true);
            await page.goto(this.options.blogWriteUrl ?? 'https://blog.naver.com/GoBlogWrite.naver', {
              waitUntil: 'domcontentloaded',
              timeout: 30000
            });
            await this.delay(3000);

            const retryUrl = page.url();
            const retryIsEditor = retryUrl.includes('blogPostWrite') ||
                                  retryUrl.includes('GoBlogWrite') ||
                                  retryUrl.includes('NaverWriteEditor');
            const retryHasEditorFrame = !retryIsEditor ? await page.evaluate(() => {
              return !!document.querySelector('#mainFrame, iframe[name="mainFrame"]');
            }).catch(() => false) : true;

            if (retryUrl.includes('blog.naver.com') && (retryIsEditor || retryHasEditorFrame)) {
              navigationSuccess = true;
              break;
            } else if (retryUrl.includes('blog.naver.com')) {
              // 블로그 도메인이지만 에디터가 아님 → 재시도 (에러 대신)
              this.log(`   ⚠️ 수동 로그인 후 블로그 메인으로 이동됨 (에디터 아님): ${retryUrl}`);
              throw new Error('수동 로그인 후 블로그 에디터가 아닌 메인 페이지로 이동되었습니다.');
            } else {
              throw new Error('수동 로그인 후에도 블로그 페이지 접근 실패');
            }
          }
        }
        // ✅ [2026-03-24 FIX] 메인 페이지 또는 비-에디터 페이지로 리다이렉트 감지
        // 네이버 메인(www.naver.com) 또는 블로그 홈(blog.naver.com/{id})으로 리다이렉트된 경우
        // → 세션이 유효하지만 GoBlogWrite 리다이렉트가 에디터 대신 메인으로 이동한 경우
        else if (!isBlogDomain) {
          // 네이버 메인이나 완전히 다른 페이지로 이동됨
          this.log(`   ⚠️ 메인 페이지로 리다이렉트됨: ${finalUrl}`);
          // ✅ [2026-03-26 FIX] isLoggedIn 캐시 무효화 — 이게 없으면 loginToNaver()가 캐시 때문에 스킵됨
          browserSessionManager.setLoggedIn(this.options.naverId, false);
          if (attempt < 3) {
            this.log(`   🔄 세션 문제로 판단, 재로그인 후 재시도합니다...`);
            await this.loginToNaver();
            continue;
          }
          throw new Error(
            `블로그 글쓰기 페이지로 이동하지 못했습니다.\n\n` +
            `현재 URL: ${finalUrl}\n` +
            `예상 URL: https://blog.naver.com/GoBlogWrite.naver\n\n` +
            `네이버 메인 페이지로 리다이렉트되었습니다. 세션이 만료되었을 수 있습니다.`
          );
        }
        // blog.naver.com 도메인이지만 에디터가 아닌 경우 (블로그 홈 등)
        else if (isBlogDomain && !isEditorUrl) {
          // DOM에서 에디터 프레임 존재 여부로 최종 판단
          const hasEditorFrame = await page.evaluate(() => {
            return !!document.querySelector('#mainFrame, iframe[name="mainFrame"]');
          }).catch(() => false);

          if (hasEditorFrame) {
            this.log(`   ✅ URL에 에디터 패턴은 없지만 에디터 프레임 확인됨`);
            // 아래 성공 처리로 진행
          } else {
            this.log(`   ⚠️ 블로그 메인 페이지로 리다이렉트됨 (에디터 프레임 없음): ${finalUrl}`);
            if (attempt < 3) {
              this.log(`   🔄 에디터가 아닌 블로그 페이지입니다. 재시도합니다...`);
              continue;
            }
            throw new Error(
              `블로그 에디터가 아닌 블로그 메인 페이지로 이동되었습니다.\n\n` +
              `현재 URL: ${finalUrl}\n` +
              `에디터 페이지로 직접 이동해주세요.`
            );
          }
        }

        // 성공!
        navigationSuccess = true;
        break;

      } catch (error) {
        lastError = error as Error;
        this.log(`   ❌ 시도 ${attempt} 실패: ${lastError.message}`);

        if (attempt < 3) {
          this.log(`   ⏳ 2초 후 재시도합니다...`);
          await this.delay(2000);
        }
      }
    }

    if (!navigationSuccess) {
      throw lastError || new Error('블로그 글쓰기 페이지로 이동할 수 없습니다.');
    }

    this.log('✅ 블로그 글쓰기 페이지로 성공적으로 이동했습니다.');
  }

  async switchToMainFrame(): Promise<void> {
    const page = this.ensurePage();

    this.ensureNotCancelled();
    this.log('🔄 메인 프레임으로 전환 중...');

    // 현재 페이지 URL 확인
    let currentUrl = page.url();
    this.log(`   현재 페이지 URL: ${currentUrl}`);

    // ✅ 로그인 페이지에 있으면 수동 로그인 대기 (바로 에러 던지지 않음!)
    if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
      this.log('');
      this.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
      this.log('⚠️  로그인 페이지에 있습니다!');
      this.log('');
      this.log('🖱️  브라우저에서 직접 로그인해주세요:');
      this.log('   1. 아이디/비밀번호 입력');
      this.log('   2. 캡차 해결 (있으면)');
      this.log('   3. 로그인 버튼 클릭');
      this.log('');
      this.log('⏳  로그인 완료될 때까지 10분간 기다립니다...');
      this.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
      this.log('');

      // Windows 알림음
      try {
        const { exec } = await import('child_process');
        exec('powershell -c "1..5 | ForEach-Object { [console]::beep(1000,200); Start-Sleep -Milliseconds 100 }"');
      } catch (e) { console.debug('[Sound] 로그인 알림음 실패:', (e as Error).message); }

      if (this.progressCallback) {
        this.progressCallback(0, 100, '🚨 로그인 필요! 브라우저에서 직접 로그인해주세요!');
      }

      // 수동 로그인 대기 (최대 10분)
      await this.waitForManualLogin(page, 600000);

      // 로그인 성공 후 블로그 페이지로 이동
      this.log('🔄 블로그 글쓰기 페이지로 이동합니다...');
      // ✅ [2026-03-26 FIX] 수동 로그인 성공 캐시 반영
      browserSessionManager.setLoggedIn(this.options.naverId, true);
      await page.goto(this.options.blogWriteUrl ?? 'https://blog.naver.com/GoBlogWrite.naver', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await this.delay(3000);

      // URL 다시 확인
      currentUrl = page.url();
      this.log(`   로그인 후 URL: ${currentUrl}`);

      if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
        throw new Error('로그인 후에도 블로그 페이지 접근 실패. 네이버 계정 보안 설정을 확인해주세요.');
      }
    }

    // ✅ [2026-03-24 FIX] 블로그 글쓰기 페이지 검증 강화 — URL 패턴 + DOM 기반
    const isOnEditorByUrl = currentUrl.includes('GoBlogWrite') ||
                            currentUrl.includes('blogPostWrite') ||
                            currentUrl.includes('NaverWriteEditor');
    const isOnBlogDomain = currentUrl.includes('blog.naver.com');

    if (!isOnEditorByUrl && !isOnBlogDomain) {
      // 완전히 다른 도메인(www.naver.com 등)에 있는 경우 → 자동 재이동
      this.log(`   ⚠️ 에디터가 아닌 페이지에 있습니다: ${currentUrl}`);
      this.log(`   🔄 블로그 글쓰기 페이지로 재이동 시도...`);
      try {
        await page.goto(this.options.blogWriteUrl ?? 'https://blog.naver.com/GoBlogWrite.naver', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await this.delay(3000);
        currentUrl = page.url();
        this.log(`   재이동 후 URL: ${currentUrl}`);
      } catch (retryErr) {
        // 재이동도 실패하면 에러
      }

      // 재이동 후에도 에디터가 아니면 에러
      const stillNotEditor = !currentUrl.includes('blog.naver.com') &&
                             !currentUrl.includes('GoBlogWrite') &&
                             !currentUrl.includes('blogPostWrite');
      if (stillNotEditor) {
        throw new Error(
          `메인 프레임을 찾을 수 없습니다.\n` +
          `페이지 URL: ${currentUrl}\n` +
          `가능한 원인:\n` +
          `1. 블로그 글쓰기 페이지로 이동하지 못했습니다.\n` +
          `2. 네이버 메인 페이지로 리다이렉트되었습니다.\n` +
          `해결 방법: 블로그 글쓰기 페이지로 이동한 후 다시 시도해주세요.`
        );
      }
    } else if (isOnBlogDomain && !isOnEditorByUrl) {
      // blog.naver.com 도메인이지만 에디터 URL 패턴이 없는 경우 → DOM으로 확인
      const hasEditorFrame = await page.evaluate(() => {
        return !!document.querySelector('#mainFrame, iframe[name="mainFrame"]');
      }).catch(() => false);

      if (!hasEditorFrame) {
        this.log(`   ⚠️ 블로그 도메인이지만 에디터 프레임이 없습니다: ${currentUrl}`);
        this.log(`   🔄 블로그 글쓰기 페이지로 재이동 시도...`);
        try {
          await page.goto(this.options.blogWriteUrl ?? 'https://blog.naver.com/GoBlogWrite.naver', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          await this.delay(3000);
          currentUrl = page.url();
          this.log(`   재이동 후 URL: ${currentUrl}`);
        } catch (retryErr) {
          this.log(`   ⚠️ 재이동 실패: ${(retryErr as Error).message}`);
        }
      }
    }

    // ✅ 최적화: 짧은 대기 후 즉시 프레임 찾기 시작
    await this.delay(500); // 3000ms → 500ms

    // 여러 방법으로 mainFrame 찾기 시도 (병렬 처리)
    let frameHandle: ElementHandle<Element> | null = null;
    const maxRetries = 4; // 2 → 4 (네이버 에디터 iframe 리로드 시 충분한 재시도)

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        this.log(`   🔄 메인 프레임 재시도 ${attempt + 1}/${maxRetries}...`);
        await this.delay(1000); // 2000ms → 1000ms
      }

      try {
        // ✅ 최적화: 가장 빠른 방법 우선 시도
        // 방법 1: #mainFrame 직접 찾기 (가장 빠름)
        frameHandle = await page.waitForSelector('#mainFrame', {
          visible: true,
          timeout: attempt === 0 ? 5000 : 3000 // 30000 → 5000, 15000 → 3000
        }).catch(() => null);

        if (frameHandle) {
          break;
        }

        // 방법 2: 모든 iframe 중에서 찾기 (waitForSelector보다 빠름)
        const iframes = await page.$$('iframe');
        for (const iframe of iframes) {
          const id = await iframe.evaluate(el => el.id).catch(() => '');
          if (id === 'mainFrame') {
            frameHandle = iframe;
            break;
          }
        }

        if (frameHandle) {
          break;
        }

        // 방법 3: iframe 태그로 찾기 (폴백)
        frameHandle = await page.waitForSelector('iframe[id="mainFrame"]', {
          visible: true,
          timeout: 3000 // 10000 → 3000
        }).catch(() => null);

        if (frameHandle) {
          break;
        }

        // 방법 4: se-main-frame 클래스로 찾기 (최후의 수단)
        frameHandle = await page.waitForSelector('iframe.se-main-frame', {
          visible: true,
          timeout: 3000 // 10000 → 3000
        }).catch(() => null);

        if (frameHandle) {
          this.log('   ℹ️ se-main-frame 클래스로 메인 프레임을 찾았습니다.');
          break;
        }
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        continue;
      }
    }

    if (!frameHandle) {
      // 현재 페이지 상태 확인
      const pageUrl = page.url();
      const pageTitle = await page.title().catch(() => '알 수 없음');
      throw new Error(
        `메인 프레임을 찾을 수 없습니다.\n` +
        `페이지 URL: ${pageUrl}\n` +
        `페이지 제목: ${pageTitle}\n` +
        `가능한 원인:\n` +
        `1. 네이버 블로그 에디터 페이지가 완전히 로드되지 않았습니다.\n` +
        `2. 네이버 블로그 UI가 변경되었을 수 있습니다.\n` +
        `3. 네트워크 연결 문제가 있을 수 있습니다.\n` +
        `해결 방법: 페이지를 새로고침하고 다시 시도해주세요.`
      );
    }

    const frame = await frameHandle.contentFrame();
    if (!frame) {
      throw new Error('메인 프레임으로 전환할 수 없습니다. iframe이 아직 로드되지 않았을 수 있습니다.');
    }

    // ✅ 프레임이 실제 콘텐츠를 로드할 때까지 잠시 대기
    try {
      await frame.waitForFunction(() => window.location.href !== 'about:blank', { timeout: 3000 }).catch(() => null);
    } catch (e) { console.debug('[Editor] 프레임 로드 대기 타임아웃 (정상 진행):', (e as Error).message); }

    this.mainFrame = frame;

    // ✅ [2026-03-24 FIX] 에디터 iframe 내 beforeunload 이벤트 제거
    // 네이버 에디터가 등록한 beforeunload 핸들러가 페이지 이동 시
    // "게시물이 삭제되었거나 다른 페이지로 변경되었습니다" alert를 발생시키는 것을 방지
    try {
      await frame.evaluate(() => {
        // beforeunload 이벤트 핸들러 제거
        window.onbeforeunload = null;
        // ✅ [2026-03-24 FIX] 무효한 noop removeEventListener 제거
        // removeEventListener는 동일 참조 함수만 제거 가능 — noop은 새 참조이므로 무의미
        // 대신 addEventListener override로 새 등록만 차단 (기존 핸들러는 dialog 자동수락으로 방어)
        // 강제 override: 새로운 beforeunload 핸들러가 등록되어도 무시
        const originalAddEventListener = window.addEventListener;
        window.addEventListener = function(type: string, ...args: any[]) {
          if (type === 'beforeunload') {
            return; // beforeunload 이벤트 등록 차단
          }
          return originalAddEventListener.apply(this, [type, ...args] as any);
        };
      });
      this.log('   🛡️ beforeunload 이벤트 차단 완료 (alert 방지)');
    } catch (beforeUnloadErr) {
      this.log(`   ⚠️ beforeunload 제거 실패 (무시): ${(beforeUnloadErr as Error).message}`);
    }

    this.log('✅ 메인 프레임으로 성공적으로 전환했습니다.');
  }

  private async closeDraftPopup(): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();
    this.ensureNotCancelled();
    this.log('🔄 [1/2] 작성중인 글 팝업 닫기 중...');

    await this.delay(500);

    const draftPopupSelectors = [
      'button.se-popup-button.se-popup-button-cancel',
      '.se-popup-button-cancel',
      'button.se-popup-button-cancel',
      'button[type="button"].se-popup-button-cancel',
    ];

    for (const selector of draftPopupSelectors) {
      try {
        const popupButton = await frame.waitForSelector(selector, {
          visible: true,
          timeout: 5000
        }).catch((error) => {
          this.log(`⚠️ [팝업 닫기] 실패: ${(error as Error).message}`);
          return null;
        });

        if (popupButton) {
          const isClickable = await popupButton.evaluate((el: Element) => {
            const button = el as HTMLButtonElement;
            const rect = button.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && !button.disabled && rect.top >= 0;
          }).catch(() => false);

          if (!isClickable) continue;

          await popupButton.evaluate((el: Element) => {
            (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          await this.delay(this.DELAYS.MEDIUM);

          try {
            await popupButton.click({ delay: 50 });
            await this.delay(this.DELAYS.LONG);
            this.log('✅ 작성중인 글 팝업 닫기 완료');
            return;
          } catch {
            const jsClicked = await popupButton.evaluate((el: Element) => {
              try {
                (el as HTMLElement).click();
                return true;
              } catch {
                return false;
              }
            }).catch(() => false);

            if (jsClicked) {
              await this.delay(this.DELAYS.LONG);
              this.log('✅ 작성중인 글 팝업 닫기 완료');
              return;
            }
          }
        }
      } catch (error) {
        continue;
      }
    }

    await page.keyboard.press('Escape');
    await this.delay(500);
    this.log('ℹ️ 작성중인 글 팝업이 없거나 ESC로 처리됨');
  }

  async closePopups(): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();
    this.ensureNotCancelled();
    this.log('🔄 [2/2] 도움말 패널 및 기타 팝업 닫기 중...');

    const popupSelectors = [
      '.se-popup-button-cancel',
      '.se-hlpr-panel-close-button',
      '.se-hlpe-panel-close-button',
      "[class*='popup'][class*='close']",
      "[class*='panel'][class*='close']",
      '.close-button',
      '.popup-close',
      "button[aria-label*='닫기']",
      "button[title*='닫기']",
    ];

    for (const selector of popupSelectors) {
      this.ensureNotCancelled();
      const popupButton = await frame.$(selector);
      if (popupButton) {
        try {
          await popupButton.click();
          this.log(`✅ 팝업을 닫았습니다. (셀렉터: ${selector})`);
          await this.delay(this.DELAYS.SHORT); // 250ms → 150ms
          this.ensureNotCancelled();
          return;
        } catch {
          // fallthrough - try next strategy
        }
      }

      const closedViaScript = await frame.evaluate((cssSelector) => {
        const element = document.querySelector(cssSelector) as HTMLElement | null;
        if (element && element.offsetParent !== null) {
          element.click();
          return true;
        }
        return false;
      }, selector);

      if (closedViaScript) {
        this.log(`✅ JavaScript로 팝업을 닫았습니다. (셀렉터: ${selector})`);
        await this.delay(250);
        this.ensureNotCancelled();
        return;
      }
    }

    await page.keyboard.press('Escape').catch((error) => {
      this.log(`⚠️ [Escape 키] 실패: ${(error as Error).message}`);
    });
    this.log('ℹ️ 닫을 팝업이 없거나 이미 닫혀있습니다.');
  }

  async inputTitle(title: string): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();
    this.ensureNotCancelled();
    this.log('🔄 제목 입력 중...');

    // 제목이 문자열인지 확인 + 개행 제거 (개행 시 본문으로 밀림 방지)
    const titleText = (typeof title === 'string' ? title : String(title || ''))
      .replace(/[\r\n]+/g, ' ').trim();
    if (!titleText) {
      throw new Error('제목이 비어있습니다.');
    }

    // ✅ 타임아웃 설정 (60초)
    const titleElement = await frame.waitForSelector('.se-section-documentTitle', {
      visible: true,
      timeout: 60000
    });
    if (!titleElement) {
      throw new Error('제목 입력 필드를 찾을 수 없습니다.');
    }

    // ✅ 제목 입력 필드 클릭 및 타이핑 (재시도 로직)
    let titleInputSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.log(`   [시도 ${attempt}/3] 제목 입력 중...`);

        await titleElement.click();
        await this.delay(100);

        // 기존 텍스트 선택 및 삭제
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await this.delay(50);

        // 제목 타이핑
        await safeKeyboardType(page, titleText, { delay: 20 });
        await this.delay(100);

        // 입력 확인
        const currentTitle = await frame.$eval('.se-section-documentTitle', el => (el as HTMLElement).innerText).catch(() => '');
        if (currentTitle.includes(titleText.substring(0, 10))) {
          this.log(`   ✅ 제목 입력 확인됨`);
          titleInputSuccess = true;
          break;
        }

        this.log(`   ⚠️ 제목 입력 확인 실패, 재시도...`);
        await this.delay(500);
      } catch (error) {
        this.log(`   ⚠️ 제목 입력 시도 ${attempt} 실패: ${(error as Error).message}`);
        if (attempt === 3) throw error;
        await this.delay(1000);
      }
    }

    if (!titleInputSuccess) {
      throw new Error('제목 입력에 실패했습니다 (3회 시도)');
    }

    // Enter 키 2번으로 본문 영역으로 자동 이동 (제목과 소제목 사이 간격)
    await page.keyboard.press('Enter');
    await this.delay(50);
    await page.keyboard.press('Enter');
    await this.delay(100); // Enter 후 안정화 대기

    this.log(`✅ 제목 '${title}' 입력 완료 → 본문 영역으로 이동 완료`);
  }

  async typePlainContent(content: string, lines: number): Promise<void> {
    const page = this.ensurePage();
    this.ensureNotCancelled();
    this.log('🔄 본문 입력 중...');

    // 클릭 완전 제거 - 현재 커서 위치에서 바로 시작
    for (let line = 0; line < lines; line += 1) {
      this.ensureNotCancelled();
      await safeKeyboardType(page, content, { delay: 20 });
      if (line < lines - 1) {
        await page.keyboard.press('Enter');
        await this.delay(this.DELAYS.SHORT);
      }
    }

    this.log(`✅ 본문을 ${lines}줄 성공적으로 입력했습니다.`);
  }

  /**
   * 여러 셀렉터 중 첫 번째로 찾은 요소 반환 (헬퍼 함수) - Frame용
   */
  private async waitForAnySelector(
    frame: Frame,
    selectors: string[],
    timeout: number
  ): Promise<ElementHandle<Element> | null> {
    for (const selector of selectors) {
      const element = await frame.waitForSelector(selector, {
        visible: true,
        timeout: timeout / selectors.length
      }).catch(() => null);

      if (element) {
        this.log(`✅ 요소 발견: ${selector}`);
        return element;
      }
    }
    return null;
  }

  /**
   * 여러 셀렉터 중 첫 번째로 찾은 요소 반환 (헬퍼 함수) - Page용
   */
  private async waitForAnySelectorPage(
    page: Page,
    selectors: string[],
    timeout: number
  ): Promise<ElementHandle<Element> | null> {
    for (const selector of selectors) {
      const element = await page.waitForSelector(selector, {
        visible: true,
        timeout: timeout / selectors.length
      }).catch(() => null);

      if (element) {
        this.log(`✅ 요소 발견 (Page): ${selector}`);
        return element;
      }
    }
    return null;
  }

  /**
   * 날짜 유효성 검증
   */
  private validateScheduleDate(scheduleDate: string): void {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(scheduleDate)) {
      throw new Error('날짜 형식이 올바르지 않습니다. (예: 2025-02-01 14:30)');
    }

    const scheduleTime = new Date(scheduleDate.replace(' ', 'T'));
    const now = new Date();

    if (scheduleTime <= now) {
      throw new Error('예약 날짜는 현재 시각보다 미래여야 합니다.');
    }

    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    if (scheduleTime > oneYearLater) {
      throw new Error('예약 날짜는 1년 이내로 설정해야 합니다.');
    }
  }

  /**
   * 날짜/시간 설정 (네이버 UI에 맞춤)
   */
  /**
   * 날짜/시간 설정 (수정됨 - 자동으로 3가지 방식 시도)
   */
  private async setScheduleDateTime(frame: Frame, scheduleDate: string): Promise<void> {
    return await publishHelpers.setScheduleDateTime(this, frame, scheduleDate);
  }

  /**
   * 발행 모달 디버깅 (네이버 UI 구조 파악)
   */
  private async debugPublishModal(): Promise<void> {
    return await publishHelpers.debugPublishModal(this);
  }

  /**
   * 네이버 블로그 예약발행 (완벽 수정 버전 - 자동으로 최적 방식 선택)
   */
  private async publishScheduled(scheduleDate: string): Promise<void> {
    return await publishHelpers.publishScheduled(this, scheduleDate);
  }

  async publishBlogPost(mode: PublishMode, scheduleDate?: string, scheduleMethod: 'datetime-local' | 'individual-inputs' = 'datetime-local'): Promise<void> {
    // ✅ [2026-02-07 FIX] 발행 모드 명시적 로깅 (디버깅용)
    this.log(`📋 publishBlogPost 호출됨 → mode: "${mode}", scheduleDate: "${scheduleDate || 'undefined'}", scheduleMethod: "${scheduleMethod}"`);
    // ✅ [2026-02-16 DEBUG] 카테고리 이름 확인
    console.log(`[publishBlogPost] 📂 this.options.categoryName: "${this.options.categoryName || '(없음)'}"`);
    this.log(`📂 현재 카테고리: "${this.options.categoryName || '(미설정)'}"`);
    await this.retry(async () => {
      const frame = (await this.getAttachedFrame());
      this.ensureNotCancelled();

      // ✅ [2026-01-22 FIX] 발행 직전 모든 이미지에 '문서 너비' 적용 (버튼 클릭 방식)
      try {
        this.log('🖼️ 발행 전 모든 이미지에 문서 너비 적용 중...');

        // 모든 이미지 요소 찾기
        const imageElements = await frame.$$('img.se-image-resource, .se-module-image img, .se-component-image img');

        if (imageElements.length > 0) {
          this.log(`   📷 ${imageElements.length}개 이미지 발견, 문서 너비 적용 시작...`);

          let appliedCount = 0;
          const imageWidthStartTime = Date.now();
          const IMAGE_WIDTH_TIMEOUT = 10000; // 10초 제한
          for (let i = 0; i < imageElements.length; i++) {
            // ✅ [2026-02-17] 타임아웃 가드: 이미지 너비 적용이 너무 오래 걸리면 중단
            if (Date.now() - imageWidthStartTime > IMAGE_WIDTH_TIMEOUT) {
              this.log(`   ⏱️ 이미지 너비 적용 시간 초과 (${i}/${imageElements.length}개 완료, 10초 제한). 나머지 건너뜁니다.`);
              break;
            }
            try {
              // 1. 이미지 클릭하여 선택
              await imageElements[i].click();
              await this.delay(300);

              // 2. 문서 너비 버튼 찾기 및 클릭
              // 버튼이 이미 '문서 너비' 상태인지 확인 (se-object-arrangement-fit-toolbar-button 클래스 존재 여부)
              const fitButton = await frame.$('button[data-value="fit"][data-name="content-mode-without-pagefull"], button.se-object-arrangement-fit-toolbar-button[data-value="fit"]');

              if (fitButton) {
                // 버튼이 이미 활성화 상태인지 확인
                const isAlreadyActive = await frame.evaluate((btn: Element) => {
                  return btn.classList.contains('se-toolbar-button-active') ||
                    btn.getAttribute('aria-pressed') === 'true';
                }, fitButton);

                if (!isAlreadyActive) {
                  await fitButton.click();
                  await this.delay(200);
                  this.log(`   ✅ ${i + 1}/${imageElements.length} 이미지 문서 너비 적용`);
                } else {
                  this.log(`   ⏭️ ${i + 1}/${imageElements.length} 이미지 이미 문서 너비 상태`);
                }
                appliedCount++;
              } else {
                // 폴백: CSS 스타일로 직접 적용
                await frame.evaluate((imgEl: Element) => {
                  const img = imgEl as HTMLImageElement;
                  let el: HTMLElement | null = img;
                  while (el && el !== document.body) {
                    if (el.classList.contains('se-section') || el.classList.contains('se-module') || el.classList.contains('se-component')) {
                      el.classList.remove('se-l-left', 'se-l-right', 'se-l-original');
                      el.classList.add('se-l-default');
                      el.style.width = '100%';
                      el.style.maxWidth = '100%';
                      el.setAttribute('data-size', 'document-width');
                    }
                    el = el.parentElement;
                  }
                  img.style.width = '100%';
                  img.style.maxWidth = '100%';
                  img.style.height = 'auto';
                }, imageElements[i]);
                this.log(`   ⚠️ ${i + 1}/${imageElements.length} 이미지 CSS 폴백 적용`);
                appliedCount++;
              }

              // 이미지 선택 해제 (다른 곳 클릭)
              await frame.click('body').catch(() => { });
              await this.delay(100);
            } catch (imgErr) {
              this.log(`   ⚠️ ${i + 1}/${imageElements.length} 이미지 처리 중 오류 (무시): ${(imgErr as Error).message}`);
            }
          }

          if (appliedCount > 0) {
            this.log(`   ✅ ${appliedCount}개 이미지에 문서 너비 적용 완료`);
          }
        } else {
          this.log('   ℹ️ 적용할 이미지가 없습니다.');
        }

        await this.delay(300);
      } catch (imgError) {
        this.log(`   ⚠️ 이미지 문서 너비 적용 중 오류 (계속 진행): ${(imgError as Error).message}`);
      }

      if (mode === 'draft') {
        this.log('🔄 블로그 글 임시저장 중...');
        // 임시저장 버튼 찾기 (제공된 셀렉터 사용)
        const saveButtonSelectors = [
          'button.save_btn__bzc5B[data-click-area="tpb.save"]',
          'button.save_btn__bzc5B',
          'button[data-click-area="tpb.save"]',
        ];

        let saveButton: ElementHandle<Element> | null = null;
        for (const selector of saveButtonSelectors) {
          saveButton = await frame.waitForSelector(selector, { visible: true, timeout: 3000 }).catch((error) => {
            this.log(`⚠️ [저장 버튼 찾기] 실패 (${selector}): ${(error as Error).message}`);
            return null;
          });
          if (saveButton) break;
        }

        if (!saveButton) {
          throw new Error('저장 버튼을 찾을 수 없습니다.');
        }

        // 순차 실행: 클릭 먼저, 그 다음 네비게이션 대기
        await saveButton.click();
        await this.delay(this.DELAYS.MEDIUM); // 클릭 후 안정화 대기
        await frame.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);

        this.log('✅ 블로그 글이 임시저장되었습니다.');
      } else if (mode === 'publish') {
        this.log('🔄 블로그 글 즉시발행 중...');

        // ✅ 발행 버튼 찾기 (안정적인 data-* 속성 우선, CSS 클래스명은 네이버 업데이트 시 변경 가능)
        this.log('📌 발행 버튼 탐색 시작...');
        const publishButtonSelectors = [
          // 1순위: data-* 속성 (네이버 업데이트에도 안정적)
          'button[data-click-area="tpb.publish"]',
          '[data-click-area="tpb.publish"]',
          // 2순위: 기존 CSS 클래스 셀렉터
          'button.publish_btn__m9KHH[data-click-area="tpb.publish"]',
          ...this.PUBLISH_BUTTON_SELECTORS,
          'button.publish_btn__m9KHH',
          '.publish_btn__bzc5B',
          '[data-testid="publish-button"]',
        ];

        let publishButton: ElementHandle<Element> | null = null;
        for (const selector of publishButtonSelectors) {
          publishButton = await frame.waitForSelector(selector, { visible: true, timeout: 3000 }).catch(() => null);
          if (publishButton) {
            this.log(`   ✅ 발행 버튼 발견: ${selector.substring(0, 60)}`);
            break;
          }
        }

        // ✅ [2026-02-17] 모든 셀렉터 실패 시 텍스트 기반 폴백
        if (!publishButton) {
          this.log('   ⚠️ 셀렉터 기반 탐색 실패 → 텍스트 기반 폴백 시도...');
          try {
            publishButton = await frame.evaluateHandle(() => {
              const buttons = document.querySelectorAll('button');
              for (const btn of buttons) {
                const text = (btn.textContent || '').trim();
                if (text === '발행' || text.includes('발행')) {
                  const rect = btn.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    return btn;
                  }
                }
              }
              return null;
            }) as ElementHandle<Element> | null;

            // evaluateHandle가 null JSHandle을 반환할 수 있으므로 실제 Element인지 확인
            if (publishButton) {
              const isElement = await publishButton.evaluate(el => el instanceof HTMLElement).catch(() => false);
              if (!isElement) publishButton = null;
            }

            if (publishButton) {
              this.log('   ✅ 텍스트 기반 폴백으로 발행 버튼 발견!');
            }
          } catch (fallbackErr) {
            this.log(`   ❌ 텍스트 기반 폴백 오류: ${(fallbackErr as Error).message}`);
          }
        }

        if (!publishButton) {
          // ✅ [2026-02-17] 디버깅: 툴바 영역 HTML 덤프
          this.log('   ❌ 모든 발행 버튼 탐색 실패 — 폴백 경로로 진행');
          try {
            const toolbarHTML = await frame.evaluate(() => {
              // 상단 툴바 영역의 버튼들 확인
              const allButtons = document.querySelectorAll('button');
              const buttonInfo: string[] = [];
              allButtons.forEach(btn => {
                const text = (btn.textContent || '').trim().substring(0, 20);
                const cls = btn.className.substring(0, 40);
                const area = btn.getAttribute('data-click-area') || '';
                const testId = btn.getAttribute('data-testid') || '';
                if (text || area || testId) {
                  buttonInfo.push(`[${text}] cls=${cls} area=${area} testid=${testId}`);
                }
              });
              return buttonInfo.slice(0, 15).join('\n');
            });
            this.log(`   🔍 현재 페이지 버튼 목록:\n${toolbarHTML}`);
          } catch (e) { console.debug('[Editor] 발행 버튼 목록 조회 실패:', (e as Error).message); }
        }

        if (publishButton) {
          // ✅ [2026-03-26 v11] 발행 모달 열기 전 대표이미지 설정 + AI 마크 일괄 활성화
          // button.se-set-rep-image-button 직접 클릭 + button.se-set-ai-mark-button-toggle 일괄 활성화
          try {
            this.log('🖼️ [대표사진 v11] 에디터 내 대표이미지 직접 설정 + AI 마크 활성화 중...');
            const page = this.ensurePage();

            // Step 1: 에디터 내 모든 이미지 컴포넌트 수집
            const imageComponents = await frame.$$('.se-component.se-image, .se-component.se-imageStrip');
            this.log(`   📊 에디터 내 이미지 컴포넌트: ${imageComponents.length}개`);

            if (imageComponents.length > 0) {
              // Step 2: 첫 번째 이미지 컴포넌트 클릭하여 활성화 (대표사진 후보)
              const targetComponent = imageComponents[0];
              const imgElement = await targetComponent.$('img');
              if (imgElement) {
                const imgCoords = await imgElement.evaluate((el: HTMLImageElement) => {
                  el.scrollIntoView({ block: 'center', behavior: 'instant' as any });
                  void el.offsetHeight;
                  const rect = el.getBoundingClientRect();
                  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, found: true };
                }).catch(() => ({ x: 0, y: 0, found: false }));

                if (imgCoords.found) {
                  await this.delay(300);
                  const iframeOffset = await page.evaluate(() => {
                    const iframe = document.querySelector('iframe#mainFrame') as HTMLIFrameElement;
                    if (iframe) { const r = iframe.getBoundingClientRect(); return { x: r.x, y: r.y }; }
                    return { x: 0, y: 0 };
                  }).catch(() => ({ x: 0, y: 0 }));

                  const clickX = iframeOffset.x + imgCoords.x;
                  const clickY = iframeOffset.y + imgCoords.y;
                  await page.mouse.click(clickX, clickY);
                  await this.delay(500);
                  await page.mouse.click(clickX, clickY);
                  await this.delay(800);

                  // Step 3: 대표사진 버튼 클릭 (se-set-rep-image-button)
                  const repBtn = await frame.$('button.se-set-rep-image-button').catch(() => null);
                  if (repBtn) {
                    const isAlreadySelected = await repBtn.evaluate((btn: HTMLButtonElement) =>
                      btn.classList.contains('se-is-selected')
                    ).catch(() => false);

                    if (isAlreadySelected) {
                      this.log('   ✅ [대표사진 v11] 첫 번째 이미지가 이미 대표로 설정됨');
                    } else {
                      const repBtnCoords = await repBtn.evaluate((btn: HTMLButtonElement) => {
                        const rect = btn.getBoundingClientRect();
                        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                      }).catch(() => ({ x: 0, y: 0 }));
                      await page.mouse.click(iframeOffset.x + repBtnCoords.x, iframeOffset.y + repBtnCoords.y);
                      await this.delay(500);

                      const verified = await frame.$eval('button.se-set-rep-image-button',
                        (btn: Element) => btn.classList.contains('se-is-selected')
                      ).catch(() => false);
                      this.log(verified
                        ? '   ✅ [대표사진 v11] 첫 번째 이미지 대표 설정 성공 (se-is-selected 확인)'
                        : '   ⚠️ [대표사진 v11] 대표 버튼 클릭했으나 se-is-selected 미확인');
                    }
                  } else {
                    this.log('   ⚠️ [대표사진 v11] 대표사진 버튼 미발견 — 기본 선택 유지');
                  }
                }
              }

              // Step 4: AI 활용 마크 일괄 활성화
              try {
                this.log('🤖 [AI 마크] AI 생성 이미지 마크 일괄 활성화 중...');
                let aiMarkCount = 0;
                for (let i = 0; i < imageComponents.length; i++) {
                  const compImg = await imageComponents[i].$('img');
                  if (!compImg) continue;

                  const compCoords = await compImg.evaluate((el: HTMLImageElement) => {
                    el.scrollIntoView({ block: 'center', behavior: 'instant' as any });
                    void el.offsetHeight;
                    const rect = el.getBoundingClientRect();
                    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, found: true };
                  }).catch(() => ({ x: 0, y: 0, found: false }));

                  if (!compCoords.found) continue;

                  const iframeOff = await page.evaluate(() => {
                    const iframe = document.querySelector('iframe#mainFrame') as HTMLIFrameElement;
                    if (iframe) { const r = iframe.getBoundingClientRect(); return { x: r.x, y: r.y }; }
                    return { x: 0, y: 0 };
                  }).catch(() => ({ x: 0, y: 0 }));

                  await page.mouse.click(iframeOff.x + compCoords.x, iframeOff.y + compCoords.y);
                  await this.delay(400);

                  const aiBtn = await frame.$('button.se-set-ai-mark-button-toggle').catch(() => null);
                  if (aiBtn) {
                    const isAiActive = await aiBtn.evaluate((btn: HTMLButtonElement) =>
                      btn.classList.contains('se-is-selected') ||
                      btn.getAttribute('aria-pressed') === 'true'
                    ).catch(() => false);

                    if (!isAiActive) {
                      const aiBtnCoords = await aiBtn.evaluate((btn: HTMLButtonElement) => {
                        const rect = btn.getBoundingClientRect();
                        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                      }).catch(() => ({ x: 0, y: 0 }));
                      await page.mouse.click(iframeOff.x + aiBtnCoords.x, iframeOff.y + aiBtnCoords.y);
                      await this.delay(300);
                      aiMarkCount++;
                    }
                  }
                }
                this.log(`   ✅ [AI 마크] ${aiMarkCount}개 이미지에 AI 활용 마크 활성화 완료`);
              } catch (aiMarkError) {
                this.log(`   ⚠️ [AI 마크] AI 마크 활성화 오류 (무시): ${(aiMarkError as Error).message}`);
              }
            } else {
              this.log('   ℹ️ 에디터 내 이미지 컴포넌트 없음 → 대표이미지/AI 마크 설정 건너뜀');
            }
          } catch (v11Error) {
            this.log(`   ⚠️ [대표사진 v11] 오류 (발행은 계속): ${(v11Error as Error).message}`);
          }

          // ✅ [2026-03-04 FIX v6] 이미지 사전 클릭으로 에디터 스크롤이 변경되었으므로
          // 상단 툴바가 보이도록 스크롤을 복귀시키고 발행 버튼 핸들을 재탐색
          try {
            await frame.evaluate(() => window.scrollTo(0, 0));
            await this.delay(300);
            // 발행 버튼 핸들 재탐색 (stale 방지)
            const refreshSelectors = [
              'button[data-click-area="tpb.publish"]',
              'button.publish_btn__m9KHH',
              ...this.PUBLISH_BUTTON_SELECTORS,
            ];
            for (const sel of refreshSelectors) {
              const freshBtn = await frame.waitForSelector(sel, { visible: true, timeout: 2000 }).catch(() => null);
              if (freshBtn) {
                publishButton = freshBtn;
                this.log('   🔄 발행 버튼 핸들 재탐색 완료');
                break;
              }
            }
          } catch (e) { console.debug('[Editor] 발행 버튼 핸들 재탐색 실패:', (e as Error).message); }

          // ✅ [2026-02-27 FIX v2] 발행 모달 열기 — Playwright waitForSelector 기반
          // delay 폴링 대신 Playwright 네이티브 대기로 모달 트랜지션 완료까지 정확히 대기
          const modalIndicatorSelectors = [
            '[data-testid="seOnePublishBtn"]',           // 모달 내 최종 발행 버튼
            'button[data-click-area="tpb*i.publish"]',   // 모달 내 발행 확인
            'button.confirm_btn__WEaBq',                 // 모달 확인 버튼 클래스
            '[data-click-area="tpb*i.category"]',        // 카테고리 선택 영역
            'input#radio_time1',                          // 즉시발행 라디오
          ];
          const MAX_MODAL_CLICKS = 3;
          let modalOpened = false;

          for (let attempt = 1; attempt <= MAX_MODAL_CLICKS; attempt++) {
            this.log(`📌 발행 모달 열기 시도 ${attempt}/${MAX_MODAL_CLICKS}...`);
            await publishButton.click();

            // ✅ Playwright waitForSelector로 모달 요소가 DOM에 나타날 때까지 대기
            // 각 시도마다 타임아웃을 점진 증가 (3초 → 5초 → 7초)
            const waitTimeout = 3000 + (attempt - 1) * 2000;

            for (const sel of modalIndicatorSelectors) {
              try {
                const el = await frame.waitForSelector(sel, { visible: true, timeout: waitTimeout });
                if (el) {
                  modalOpened = true;
                  this.log(`   ✅ 발행 모달 열림 확인 — waitForSelector 성공 (${sel}, ${waitTimeout}ms)`);
                  break;
                }
              } catch {
                // 이 셀렉터로는 못 찾음 → 다음 셀렉터 시도
              }

              // frame에서 못 찾으면 page에서도 시도
              if (!modalOpened) {
                try {
                  const el = await this.ensurePage().waitForSelector(sel, { visible: true, timeout: 1000 });
                  if (el) {
                    modalOpened = true;
                    this.log(`   ✅ 발행 모달 열림 확인 — page waitForSelector 성공 (${sel})`);
                    break;
                  }
                } catch {
                  // page에서도 못 찾음
                }
              }
            }

            if (modalOpened) break;

            // 안 열렸으면 로그 + 재클릭 전 안정화 대기
            if (attempt < MAX_MODAL_CLICKS) {
              this.log(`   ⚠️ 발행 모달 미열림 (${waitTimeout}ms 대기 후) → ${attempt + 1}번째 클릭 시도`);
              await this.delay(1500);
            }
          }

          if (!modalOpened) {
            this.log('   ❌ 발행 모달 열기 3회 시도 모두 실패 — 카테고리 선택 건너뜀 가능');
          }

          // ✅ [2026-02-17] 발행 모달 DOM 덤프 (디버깅용)
          try {
            const modalDump = await frame.evaluate(() => {
              const info: string[] = [];
              // 모든 버튼 탐색
              const buttons = document.querySelectorAll('button');
              buttons.forEach(btn => {
                const text = (btn.textContent || '').trim().substring(0, 30);
                const cls = btn.className.substring(0, 50);
                const area = btn.getAttribute('data-click-area') || '';
                const testId = btn.getAttribute('data-testid') || '';
                const ariaLabel = btn.getAttribute('aria-label') || '';
                const rect = btn.getBoundingClientRect();
                const visible = rect.width > 0 && rect.height > 0;
                if ((text || area || testId) && visible) {
                  info.push(`BTN [${text}] cls=${cls} area=${area} testid=${testId} aria=${ariaLabel}`);
                }
              });
              // 카테고리 관련 요소 탐색  
              const catElements = document.querySelectorAll('[class*="category"], [class*="Category"], [class*="selectbox"], [role="listbox"], [aria-label*="카테고리"]');
              catElements.forEach(el => {
                const tag = el.tagName;
                const cls = el.className?.toString()?.substring(0, 50) || '';
                const text = (el as HTMLElement).innerText?.substring(0, 30) || '';
                const area = el.getAttribute('data-click-area') || '';
                info.push(`CAT <${tag}> cls=${cls} area=${area} text=${text}`);
              });
              return info.slice(0, 25).join('\n');
            });
            this.log(`📋 [발행 모달 DOM 덤프]\n${modalDump}`);
          } catch (dumpErr) {
            this.log(`   ⚠️ DOM 덤프 실패: ${(dumpErr as Error).message}`);
          }

          // ✅ [2026-02-09] 카테고리 자동 선택 (공통 메서드 사용)
          await this.selectCategoryInPublishModal(frame, this.ensurePage());

          // ✅ [2026-03-26] v10 발행 모달 대표사진 검증 코드 제거됨
          // 발행 모달에는 대표사진 선택 UI가 없음. v11에서 에디터 내 직접 설정됨.


          // ✅ [2026-03-05 FIX] 모달 재확인 — 카테고리 선택 시 ESC 키가 발행 모달을 닫을 수 있음
          // selectCategoryInPublishModal 내부에서 카테고리 드롭다운 닫기용 ESC가 발행 모달까지 닫는 버그 대응
          {
            const modalStillOpen = await frame.$('button[data-testid="seOnePublishBtn"]').catch(() => null)
              || await frame.$('button[data-click-area="tpb*i.publish"]').catch(() => null)
              || await frame.$('button[class*="confirm_btn"]').catch(() => null);

            if (!modalStillOpen) {
              this.log('⚠️ [모달 재열기] 카테고리/대표사진 처리 후 발행 모달이 닫힘 → 재열기 시도...');

              // 발행 버튼 재탐색 + 클릭
              const reopenSelectors = [
                'button[data-click-area="tpb.publish"]',
                'button.publish_btn__m9KHH',
                'button[class*="publish_btn"]',
              ];

              let reopenBtn: ElementHandle<Element> | null = null;
              for (const sel of reopenSelectors) {
                reopenBtn = await frame.waitForSelector(sel, { visible: true, timeout: 3000 }).catch(() => null);
                if (reopenBtn) break;
              }

              if (reopenBtn) {
                await reopenBtn.click();
                // 모달 열릴 때까지 대기 (최대 5초)
                let reopened = false;
                for (let i = 0; i < 10; i++) {
                  await this.delay(500);
                  const check = await frame.$('button[data-testid="seOnePublishBtn"]').catch(() => null)
                    || await frame.$('button[class*="confirm_btn"]').catch(() => null);
                  if (check) {
                    reopened = true;
                    break;
                  }
                }
                if (reopened) {
                  this.log('✅ [모달 재열기] 발행 모달 재열기 성공!');
                } else {
                  this.log('❌ [모달 재열기] 발행 모달 재열기 실패 — 확인 버튼 탐색 계속 시도');
                }
              } else {
                this.log('❌ [모달 재열기] 발행 버튼을 찾을 수 없음');
              }
            } else {
              this.log('✅ 발행 모달 열림 상태 확인 — 확인 버튼 탐색 진행');
            }
          }

          this.log('📌 발행 확인 버튼 탐색 시작...');
          const confirmPublishSelectors = [
            // 1순위: data-* 속성 (안정적)
            'button[data-testid="seOnePublishBtn"]',
            // ✅ [2026-02-23 FIX] *= (contains) → = (exact) 변경
            'button[data-click-area="tpb*i.publish"]',
            '[data-testid="seOnePublishBtn"]',
            // 2순위: CSS 클래스 (정확)
            'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"]',
            'button.confirm_btn__WEaBq[data-click-area="tpb*i.publish"]',
            'button.confirm_btn__WEaBq',
            // ✅ [2026-03-05] 3순위: 와일드카드 패턴 (네이버 CSS 모듈 해시 변경 대응)
            'button[class*="confirm_btn"][data-testid="seOnePublishBtn"]',
            'button[class*="confirm_btn"][data-click-area="tpb*i.publish"]',
            'button[class*="confirm_btn"]',
          ];

          let confirmPublishButton: ElementHandle<Element> | null = null;
          for (const selector of confirmPublishSelectors) {
            // ✅ [2026-02-26 FIX] 확인 버튼 탐색 타임아웃 5000ms→10000ms (연속발행 시 에디터 느려지는 문제 대응)
            confirmPublishButton = await frame.waitForSelector(selector, { visible: true, timeout: 10000 }).catch(() => null);
            if (confirmPublishButton) {
              this.log(`   ✅ 확인 버튼 발견: ${selector.substring(0, 60)}`);
              break;
            }
          }

          // ✅ [2026-02-17] 모든 셀렉터 실패 시 텍스트 기반 폴백 (모달 내 '발행' 버튼)
          if (!confirmPublishButton) {
            this.log('   ⚠️ 확인 버튼 셀렉터 실패 → 텍스트 기반 폴백 시도...');
            try {
              confirmPublishButton = await frame.evaluateHandle(() => {
                // 발행 모달 내 '발행' 확인 버튼 찾기 (모달이 열린 상태)
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                  const text = (btn.textContent || '').trim();
                  // '발행' 텍스트를 가진 활성화된 버튼 찾기 (모달 내)
                  if ((text === '발행' || text === '확인') && !btn.hasAttribute('disabled')) {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                      // ✅ [2026-03-05 FIX] toolbar 발행 버튼(publish_btn) 제외 — 모달 확인 버튼만 매칭
                      // DOM 순서상 toolbar 버튼이 먼저 나와서 잘못 매칭되면 모달이 닫히는 부작용
                      const cls = btn.className || '';
                      const clickArea = btn.getAttribute('data-click-area') || '';
                      // toolbar 버튼: class*="publish_btn", data-click-area="tpb.publish"
                      // 모달 확인 버튼: class*="confirm_btn", data-click-area="tpb*i.publish"
                      if (cls.includes('publish_btn') && !cls.includes('confirm_btn')) {
                        continue; // toolbar 버튼 스킵
                      }
                      if (clickArea === 'tpb.publish') {
                        continue; // toolbar 발행 토글 버튼 스킵
                      }
                      return btn;
                    }
                  }
                }
                return null;
              }) as ElementHandle<Element> | null;

              if (confirmPublishButton) {
                const isElement = await confirmPublishButton.evaluate(el => el instanceof HTMLElement).catch(() => false);
                if (!isElement) confirmPublishButton = null;
              }

              if (confirmPublishButton) {
                this.log('   ✅ 텍스트 기반 폴백으로 확인 버튼 발견!');
              }
            } catch (fallbackErr) {
              this.log(`   ❌ 텍스트 기반 폴백 오류: ${(fallbackErr as Error).message}`);
            }
          }

          // ✅ [2026-03-05] page 레벨에서도 텍스트 기반 폴백 시도
          if (!confirmPublishButton) {
            this.log('   ⚠️ frame에서 확인 버튼 못 찾음 → page 레벨 재탐색...');
            const page = this.ensurePage();

            // page 레벨 셀렉터 기반
            for (const selector of confirmPublishSelectors) {
              confirmPublishButton = await page.waitForSelector(selector, { visible: true, timeout: 3000 }).catch(() => null);
              if (confirmPublishButton) {
                this.log(`   ✅ page 레벨에서 확인 버튼 발견: ${selector.substring(0, 60)}`);
                break;
              }
            }

            // ✅ [2026-03-05] page 레벨 텍스트 기반 폴백
            if (!confirmPublishButton) {
              this.log('   ⚠️ page 셀렉터도 실패 → page 텍스트 기반 폴백...');
              try {
                confirmPublishButton = await page.evaluateHandle(() => {
                  const buttons = document.querySelectorAll('button');
                  for (const btn of buttons) {
                    const text = (btn.textContent || '').trim();
                    if ((text === '발행' || text === '확인') && !btn.hasAttribute('disabled')) {
                      const rect = btn.getBoundingClientRect();
                      // 모달 내 확인 버튼은 보통 화면 중앙 하단에 위치
                      if (rect.width > 0 && rect.height > 0 && rect.top > 100) {
                        return btn;
                      }
                    }
                  }
                  return null;
                }) as ElementHandle<Element> | null;

                if (confirmPublishButton) {
                  const isElement = await confirmPublishButton.evaluate(el => el instanceof HTMLElement).catch(() => false);
                  if (!isElement) confirmPublishButton = null;
                }

                if (confirmPublishButton) {
                  this.log('   ✅ page 텍스트 기반 폴백으로 확인 버튼 발견!');
                }
              } catch (pgFallbackErr) {
                this.log(`   ❌ page 텍스트 기반 폴백 오류: ${(pgFallbackErr as Error).message}`);
              }
            }
          }

          if (!confirmPublishButton) {
            this.log('   ❌ 모든 확인 버튼 셀렉터 실패 — 임시저장 폴백 시도');
          }

          if (confirmPublishButton) {
            // ✅ 버튼이 클릭 가능한지 확인
            const isClickable = await frame.evaluate((btn: Element) => {
              const button = btn as HTMLElement;
              return button && !button.hasAttribute('disabled') && button.offsetParent !== null;
            }, confirmPublishButton).catch(() => false);

            if (isClickable) {
              // ✅ 발행 전 URL 저장
              const beforeUrl = this.ensurePage().url();
              this.log(`📌 발행 전 URL: ${beforeUrl}`);

              await confirmPublishButton.click();
              await this.delay(1000); // ✅ 클릭 후 대기 시간 증가

              // ✅ 네비게이션 대기 (더 긴 타임아웃)
              let navigationSuccess = false;
              try {
                await Promise.race([
                  frame.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
                  new Promise(resolve => setTimeout(resolve, 30000)) // 최대 30초 대기
                ]);
                navigationSuccess = true;
              } catch (navError) {
                this.log(`⚠️ 네비게이션 대기 중 오류: ${(navError as Error).message}`);
              }

              // ✅ 발행 완료 확인 (URL 변경 및 실제 발행 여부 확인)
              await this.delay(2000); // 페이지 로드 대기
              const afterUrl = this.ensurePage().url();
              this.log(`📌 발행 후 URL: ${afterUrl}`);

              // ✅ URL이 변경되었는지 확인
              const urlChanged = beforeUrl !== afterUrl;
              const isBlogPostUrl = /blog\.naver\.com\/[^\/]+\/\d+/.test(afterUrl);

              if (urlChanged && isBlogPostUrl) {
                this.log(`✅ 블로그 글이 즉시발행되었습니다.`);
                this.log(`POST_URL: ${afterUrl}`);
                this.publishedUrl = afterUrl; // ✅ URL 저장
              } else if (urlChanged) {
                // URL은 변경되었지만 블로그 포스트 URL이 아닌 경우
                this.log(`⚠️ URL이 변경되었지만 블로그 포스트 URL이 아닙니다: ${afterUrl}`);
                // 추가 확인: 에디터 페이지가 아닌지 확인
                if (!afterUrl.includes('GoBlogWrite') && !afterUrl.includes('blogPostWrite')) {
                  this.log(`✅ 블로그 글이 발행되었습니다. (URL: ${afterUrl})`);
                  this.log(`POST_URL: ${afterUrl}`);
                  this.publishedUrl = afterUrl; // ✅ URL 저장
                } else {
                  throw new Error('발행이 완료되지 않았습니다. 에디터 페이지에 머물러 있습니다.');
                }
              } else {
                // URL이 변경되지 않은 경우 - 발행 실패 가능성
                this.log(`⚠️ URL이 변경되지 않았습니다. 발행 상태를 확인합니다...`);

                // ✅ 발행 성공 메시지 또는 에러 메시지 확인
                const publishStatus = await frame.evaluate(() => {
                  // 성공 메시지 찾기
                  const successMessages = Array.from(document.querySelectorAll('*')).filter(el => {
                    const text = el.textContent || '';
                    return text.includes('발행되었습니다') || text.includes('발행 완료') || text.includes('게시되었습니다');
                  });

                  // 에러 메시지 찾기
                  const errorMessages = Array.from(document.querySelectorAll('*')).filter(el => {
                    const text = el.textContent || '';
                    return text.includes('오류') || text.includes('실패') || text.includes('에러');
                  });

                  return {
                    success: successMessages.length > 0,
                    error: errorMessages.length > 0,
                    successText: successMessages[0]?.textContent?.substring(0, 100) || '',
                    errorText: errorMessages[0]?.textContent?.substring(0, 100) || ''
                  };
                }).catch(() => ({ success: false, error: false, successText: '', errorText: '' }));

                if (publishStatus.success) {
                  this.log(`✅ 발행 성공 메시지 확인: ${publishStatus.successText}`);
                  // 추가 대기 후 URL 재확인
                  await this.delay(3000);
                  const finalUrl = this.ensurePage().url();
                  if (finalUrl !== beforeUrl) {
                    this.log(`✅ 최종 URL: ${finalUrl}`);
                    this.log(`POST_URL: ${finalUrl}`);
                    this.publishedUrl = finalUrl; // ✅ URL 저장
                  } else {
                    this.log(`⚠️ URL이 여전히 변경되지 않았습니다. 발행이 완료되었는지 수동으로 확인해주세요.`);
                  }
                } else if (publishStatus.error) {
                  throw new Error(`발행 실패: ${publishStatus.errorText}`);
                } else {
                  // 메시지가 없는 경우 - 추가 대기 후 재확인
                  this.log(`⚠️ 발행 상태 메시지를 찾을 수 없습니다. 추가 대기 후 재확인합니다...`);
                  await this.delay(5000);
                  const retryUrl = this.ensurePage().url();
                  if (retryUrl !== beforeUrl && /blog\.naver\.com/i.test(retryUrl)) {
                    this.log(`✅ 재확인 후 URL 변경 확인: ${retryUrl}`);
                    this.log(`POST_URL: ${retryUrl}`);
                  } else {
                    throw new Error('발행이 완료되지 않았습니다. 발행 버튼을 다시 클릭하거나 수동으로 확인해주세요.');
                  }
                }
              }
            } else {
              this.log('⚠️ 발행 확인 버튼이 비활성화 상태입니다. 잠시 후 다시 시도합니다...');
              await this.delay(2000);

              // ✅ 재시도 전 버튼 상태 재확인
              const retryClickable = await frame.evaluate((btn: Element) => {
                const button = btn as HTMLElement;
                return button && !button.hasAttribute('disabled') && button.offsetParent !== null;
              }, confirmPublishButton).catch(() => false);

              if (retryClickable) {
                const beforeUrl = this.ensurePage().url();
                await confirmPublishButton.click();
                await this.delay(1000);

                let navigationSuccess = false;
                try {
                  await Promise.race([
                    frame.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
                    new Promise(resolve => setTimeout(resolve, 30000))
                  ]);
                  navigationSuccess = true;
                } catch (navError) {
                  this.log(`⚠️ 네비게이션 대기 중 오류: ${(navError as Error).message}`);
                }

                await this.delay(2000);
                const afterUrl = this.ensurePage().url();

                if (beforeUrl !== afterUrl && /blog\.naver\.com/i.test(afterUrl)) {
                  this.log('✅ 블로그 글이 즉시발행되었습니다.');
                  this.log(`POST_URL: ${afterUrl}`);
                } else {
                  throw new Error('발행이 완료되지 않았습니다. 발행 버튼이 비활성화되어 있거나 네비게이션이 발생하지 않았습니다.');
                }
              } else {
                throw new Error('발행 확인 버튼이 계속 비활성화되어 있습니다. 발행 조건을 확인해주세요.');
              }
            }
          } else {
            // ✅ 즉시 발행 실패 시 임시저장으로 폴백
            this.log('⚠️ 즉시 발행 확인 버튼을 찾지 못했습니다. 임시저장으로 폴백합니다...');

            // 모달 닫기
            const page = this.ensurePage();
            await page.keyboard.press('Escape').catch(() => { });
            await this.delay(500);

            // 임시저장 시도
            try {
              const saveButtonSelectors = [
                'button.save_btn__bzc5B[data-click-area="tpb.save"]',
                'button.save_btn__bzc5B',
                'button[data-click-area="tpb.save"]',
              ];

              let saveButton: ElementHandle<Element> | null = null;
              for (const selector of saveButtonSelectors) {
                saveButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null); // ✅ 타임아웃 3초 → 5초 증가
                if (saveButton) break;
              }

              if (saveButton) {
                await saveButton.click();
                await this.delay(this.DELAYS.MEDIUM);
                await frame.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);
                this.log('✅ 즉시 발행 실패 → 임시저장 성공! 글을 나중에 수동으로 발행할 수 있습니다.');
              } else {
                throw new Error('임시저장 버튼도 찾을 수 없습니다.');
              }
            } catch (fallbackError) {
              this.log(`❌ 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
              throw new Error(`즉시 발행 실패: 발행 확인 버튼을 찾을 수 없습니다. 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
            }
          }
        } else {
          // ✅ 발행 버튼을 찾지 못하면 저장 버튼 클릭 후 발행 모달 처리 (사용자가 제공한 정확한 셀렉터 사용)
          const saveButton = await frame.waitForSelector(
            'button.save_btn__bzc5B[data-click-area="tpb.save"]', // ✅ 최우선: 사용자가 제공한 정확한 셀렉터
            { visible: true, timeout: 5000 } // ✅ 타임아웃 3초 → 5초 증가
          ).catch(() => null);

          if (!saveButton) {
            // 폴백: 다른 저장 버튼 선택자 시도
            await frame.waitForSelector('button.save_btn__bzc5B', { visible: true, timeout: 5000 }).catch(() => null);
          }
          if (!saveButton) {
            throw new Error('저장 버튼을 찾을 수 없습니다.');
          }
          await saveButton.click();
          await this.delay(this.DELAYS.LONG);

          // ✅ 발행 옵션 선택 (모달이 열릴 때까지 충분히 대기)
          await this.delay(500); // 모달이 열릴 때까지 추가 대기
          // ✅ [2026-03-05 FIX] button:has-text()는 Playwright 전용 → Puppeteer 호환 셀렉터로 교체
          const publishOption = await frame.waitForSelector(
            '[data-value="publish"], button[data-testid="seOnePublishBtn"], button[class*="confirm_btn"]',
            { visible: true, timeout: 5000 }
          ).catch(() => null);

          if (publishOption) {
            await publishOption.click();
            await this.delay(1000); // ✅ 대기 시간 증가

            // 최종 발행 확인 버튼 찾기
            const confirmPublishSelectors = [
              'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"][data-click-area="tpb*i.publish"]',
              'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"]',
              'button[data-testid="seOnePublishBtn"]',
              // ✅ [2026-02-23 FIX] *= → = 정확 매칭 (토글 버튼 혼동 방지)
              'button.confirm_btn__WEaBq[data-click-area="tpb*i.publish"]',
              'button.confirm_btn__WEaBq',
              // ✅ [2026-03-05] 와일드카드 패턴 (네이버 CSS 모듈 해시 변경 대응)
              'button[class*="confirm_btn"][data-testid="seOnePublishBtn"]',
              'button[class*="confirm_btn"][data-click-area="tpb*i.publish"]',
              'button[class*="confirm_btn"]',
            ];

            let confirmPublishButton: ElementHandle<Element> | null = null;
            for (const selector of confirmPublishSelectors) {
              confirmPublishButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null); // ✅ 타임아웃 3초 → 5초 증가
              if (confirmPublishButton) break;
            }

            // ✅ [2026-03-05] 텍스트 기반 폴백 (모든 셀렉터 실패 시)
            if (!confirmPublishButton) {
              this.log('   ⚠️ 확인 버튼 셀렉터 실패 → 텍스트 기반 폴백...');
              try {
                confirmPublishButton = await frame.evaluateHandle(() => {
                  const buttons = document.querySelectorAll('button');
                  for (const btn of buttons) {
                    const text = (btn.textContent || '').trim();
                    if ((text === '발행' || text === '확인') && !btn.hasAttribute('disabled')) {
                      const rect = btn.getBoundingClientRect();
                      if (rect.width > 0 && rect.height > 0 && rect.top > 100) {
                        // ✅ [2026-03-05 FIX] toolbar 발행 버튼 제외
                        const cls = btn.className || '';
                        const clickArea = btn.getAttribute('data-click-area') || '';
                        if (cls.includes('publish_btn') && !cls.includes('confirm_btn')) continue;
                        if (clickArea === 'tpb.publish') continue;
                        return btn;
                      }
                    }
                  }
                  return null;
                }) as ElementHandle<Element> | null;

                if (confirmPublishButton) {
                  const isElement = await confirmPublishButton.evaluate(el => el instanceof HTMLElement).catch(() => false);
                  if (!isElement) confirmPublishButton = null;
                }
                if (confirmPublishButton) {
                  this.log('   ✅ 텍스트 기반 폴백으로 확인 버튼 발견!');
                }
              } catch (fallbackErr) {
                this.log(`   ❌ 텍스트 기반 폴백 오류: ${(fallbackErr as Error).message}`);
              }
            }

            if (confirmPublishButton) {
              // ✅ 발행 전 URL 저장
              const beforeUrl = this.ensurePage().url();
              this.log(`📌 발행 전 URL: ${beforeUrl}`);

              await confirmPublishButton.click();
              await this.delay(1000);

              // ✅ 네비게이션 대기
              let navigationSuccess = false;
              try {
                await Promise.race([
                  frame.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
                  new Promise(resolve => setTimeout(resolve, 30000))
                ]);
                navigationSuccess = true;
              } catch (navError) {
                this.log(`⚠️ 네비게이션 대기 중 오류: ${(navError as Error).message}`);
              }

              // ✅ 발행 완료 확인
              await this.delay(2000);
              const afterUrl = this.ensurePage().url();
              this.log(`📌 발행 후 URL: ${afterUrl}`);

              if (beforeUrl !== afterUrl && /blog\.naver\.com/i.test(afterUrl)) {
                this.log('✅ 블로그 글이 즉시발행되었습니다.');
                this.log(`POST_URL: ${afterUrl}`);
              } else if (!afterUrl.includes('GoBlogWrite') && !afterUrl.includes('blogPostWrite')) {
                this.log('✅ 블로그 글이 발행되었습니다.');
                this.log(`POST_URL: ${afterUrl}`);
              } else {
                // 추가 확인
                await this.delay(3000);
                const finalUrl = this.ensurePage().url();
                if (finalUrl !== beforeUrl) {
                  this.log('✅ 블로그 글이 즉시발행되었습니다.');
                  this.log(`POST_URL: ${finalUrl}`);
                } else {
                  throw new Error('발행이 완료되지 않았습니다. 에디터 페이지에 머물러 있습니다.');
                }
              }
            } else {
              // ✅ 즉시 발행 실패 시 임시저장으로 폴백
              this.log('⚠️ 즉시 발행 확인 버튼을 찾지 못했습니다. 임시저장으로 폴백합니다...');

              // 모달 닫기
              const page = this.ensurePage();
              await page.keyboard.press('Escape').catch(() => { });
              await this.delay(500);

              // 임시저장 시도
              try {
                const saveButtonSelectors = [
                  'button.save_btn__bzc5B[data-click-area="tpb.save"]',
                  'button.save_btn__bzc5B',
                  'button[data-click-area="tpb.save"]',
                ];

                let saveButton: ElementHandle<Element> | null = null;
                for (const selector of saveButtonSelectors) {
                  saveButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null); // ✅ 타임아웃 3초 → 5초 증가
                  if (saveButton) break;
                }

                if (saveButton) {
                  await saveButton.click();
                  await this.delay(this.DELAYS.MEDIUM);
                  await frame.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);
                  this.log('✅ 즉시 발행 실패 → 임시저장 성공! 글을 나중에 수동으로 발행할 수 있습니다.');
                } else {
                  throw new Error('임시저장 버튼도 찾을 수 없습니다.');
                }
              } catch (fallbackError) {
                this.log(`❌ 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
                throw new Error(`즉시 발행 실패: 발행 확인 버튼을 찾을 수 없습니다. 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
              }
            }
          } else {
            // ✅ 발행 옵션을 찾지 못한 경우 임시저장으로 폴백
            this.log('⚠️ 발행 옵션을 찾지 못했습니다. 임시저장으로 폴백합니다...');

            try {
              const saveButtonSelectors = [
                'button.save_btn__bzc5B[data-click-area="tpb.save"]',
                'button.save_btn__bzc5B',
                'button[data-click-area="tpb.save"]',
              ];

              let saveButton: ElementHandle<Element> | null = null;
              for (const selector of saveButtonSelectors) {
                saveButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null); // ✅ 타임아웃 3초 → 5초 증가
                if (saveButton) break;
              }

              if (saveButton) {
                await saveButton.click();
                await this.delay(this.DELAYS.MEDIUM);
                await frame.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);
                this.log('✅ 즉시 발행 실패 → 임시저장 성공! 글을 나중에 수동으로 발행할 수 있습니다.');
              } else {
                throw new Error('임시저장 버튼도 찾을 수 없습니다.');
              }
            } catch (fallbackError) {
              this.log(`❌ 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
              throw new Error(`즉시 발행 실패: 발행 옵션을 찾을 수 없습니다. 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
            }
          }
        }
      } else if (mode === 'schedule') {
        if (!scheduleDate) {
          throw new Error('예약발행 날짜가 지정되지 않았습니다.');
        }

        // ✅ [2026-04-01 PIPELINE-GUARD] 예약 날짜 이상 감지 — 7일 이상 미래면 경고
        // BUG-7/BUG-8 재발 시 조기 감지용 (발행은 차단하지 않음)
        {
          const [sd] = scheduleDate.split(' ');
          if (sd) {
            const scheduledDay = new Date(`${sd}T00:00:00`);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((scheduledDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 7) {
              this.log(`⚠️ [PIPELINE-GUARD] 예약 날짜가 ${diffDays}일 후입니다 (${scheduleDate}). 날짜 밀림이 의심됩니다. scheduleDistributor를 점검하세요.`);
            } else {
              this.log(`📅 [PIPELINE-GUARD] 예약 날짜 정상: ${scheduleDate} (${diffDays}일 후)`);
            }
          }
        }

        // ✅ [2026-03-21 FIX] 예약발행 재시도 (최대 3회, 임시저장 폴백 제거)
        const MAX_SCHEDULE_RETRIES = 3;
        let scheduleSuccess = false;
        let lastScheduleError: Error | null = null;

        for (let scheduleAttempt = 1; scheduleAttempt <= MAX_SCHEDULE_RETRIES; scheduleAttempt++) {
          try {
            if (scheduleAttempt > 1) {
              this.log(`🔁 예약발행 재시도 (${scheduleAttempt}/${MAX_SCHEDULE_RETRIES})...`);
              // ✅ [2026-03-22 BUG-6 FIX] 재시도 시 과거 시간이면 현재+20분으로 보정
              // 이전: 같은 과거 scheduleDate로 재시도 → validateScheduleDate 에러 반복
              if (scheduleDate) {
                const [sd, st] = scheduleDate.split(' ');
                if (sd && st) {
                  const scheduledTime = new Date(`${sd}T${st}`);
                  const now = new Date();
                  if (scheduledTime.getTime() <= now.getTime()) {
                    const corrected = new Date(now.getTime() + 20 * 60 * 1000);
                    const cm = Math.ceil(corrected.getMinutes() / 10) * 10;
                    corrected.setMinutes(cm % 60, 0, 0);
                    if (cm >= 60) corrected.setHours(corrected.getHours() + 1);
                    const cy = corrected.getFullYear();
                    const cmo = String(corrected.getMonth() + 1).padStart(2, '0');
                    const cd = String(corrected.getDate()).padStart(2, '0');
                    const ch = String(corrected.getHours()).padStart(2, '0');
                    const cmi = String(corrected.getMinutes()).padStart(2, '0');
                    scheduleDate = `${cy}-${cmo}-${cd} ${ch}:${cmi}`;
                    this.log(`⚠️ [BUG-6 FIX] 재시도 #${scheduleAttempt}: 과거 시간 보정 → ${scheduleDate}`);
                  }
                }
              }
            }
            await this.publishScheduled(scheduleDate);
            scheduleSuccess = true;
            break; // 성공 시 루프 탈출
          } catch (scheduleError) {
            lastScheduleError = scheduleError as Error;
            this.log(`❌ 예약발행 실패 (시도 ${scheduleAttempt}/${MAX_SCHEDULE_RETRIES}, 목표: ${scheduleDate}): ${lastScheduleError.message}`);

            if (scheduleAttempt < MAX_SCHEDULE_RETRIES) {
              // 모달이 열려있으면 닫고 재시도 준비
              const page = this.ensurePage();
              await page.keyboard.press('Escape').catch(() => { });
              await this.delay(500);
              await page.keyboard.press('Escape').catch(() => { }); // 중첩 모달 대비 2회
              await this.delay(2000 * scheduleAttempt); // 재시도마다 대기 증가 (2초, 4초)
              this.log(`⏳ ${2 * scheduleAttempt}초 대기 후 재시도합니다...`);
            }
          }
        }

        if (!scheduleSuccess) {
          throw new Error(`예약발행 ${MAX_SCHEDULE_RETRIES}회 시도 모두 실패: ${lastScheduleError?.message || '알 수 없는 오류'}`);
        }
      }
    }, 3, '블로그 발행');
  }

  private async applyPlainContent(resolved: ResolvedRunOptions): Promise<void> {
    this.log('📝 단순 본문을 입력합니다...');
    this.ensureNotCancelled();
    await this.inputTitle(resolved.title);
    await this.typePlainContent(resolved.content, resolved.lines);
  }

  /**
   * 본문 영역 포커스 확인 및 설정 (최적화된 버전)
   */
  /**
   * 가장 마지막 빈 요소의 끝으로 포커스 이동 (다음 소제목 시작 전용)
   */
  private async focusToLastEmptyElement(): Promise<boolean> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    // 가장 마지막 요소 찾기 (텍스트가 있든 없든)
    const lastElementHandle = await frame.evaluateHandle(() => {
      // 모든 본문 요소 찾기
      const textElements = Array.from(document.querySelectorAll('.se-section-text, .se-module-text, .se-text-paragraph, .se-component'));

      if (textElements.length === 0) return null;

      // 가장 마지막 요소 반환
      const lastElement = textElements[textElements.length - 1] as HTMLElement;

      // 인용구 내부가 아닌지 확인
      let current = lastElement.parentElement;
      let isInBlockquote = false;
      while (current) {
        if (current.classList.contains('se-blockquote') ||
          current.classList.contains('se-component-blockquote')) {
          isInBlockquote = true;
          break;
        }
        current = current.parentElement;
      }

      if (isInBlockquote && textElements.length > 1) {
        // 인용구 내부면 그 이전 요소 반환
        return textElements[textElements.length - 2] as HTMLElement;
      }

      return lastElement;
    }).catch(() => null);

    if (lastElementHandle) {
      const lastElement = lastElementHandle.asElement() as ElementHandle<Element> | null;
      if (lastElement) {
        try {
          // 요소가 보이는지 확인
          const isVisible = await lastElement.isIntersectingViewport().catch(() => false);
          if (!isVisible) {
            await lastElement.evaluate((el: Element) => {
              (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            await this.delay(this.DELAYS.MEDIUM);
          }

          // 요소의 끝으로 포커스 이동 (JavaScript로)
          await lastElement.evaluate((el: Element) => {
            const htmlEl = el as HTMLElement;
            if (htmlEl.contentEditable === 'true' || htmlEl.tagName === 'P' || htmlEl.tagName === 'DIV') {
              // contentEditable이면 끝으로 포커스
              htmlEl.focus();
              const range = document.createRange();
              const selection = window.getSelection();
              if (selection) {
                range.selectNodeContents(htmlEl);
                range.collapse(false); // 끝으로
                selection.removeAllRanges();
                selection.addRange(range);
              }
            } else {
              // 클릭으로 포커스
              htmlEl.click();
            }
          });

          await this.delay(this.DELAYS.MEDIUM);

          // 포커스 확인
          const focused = await frame.evaluate(() => {
            const activeElement = document.activeElement as HTMLElement;
            return activeElement && (
              activeElement.closest('.se-section-text, .se-module-text, .se-text-paragraph, .se-component') !== null ||
              activeElement.contentEditable === 'true'
            );
          }).catch(() => false);

          if (focused) {
            // 포커스가 있으면 끝으로 커서 이동 (키보드로)
            await page.keyboard.press('End');
            await this.delay(100);
            return true;
          }
        } catch (error) {
          this.log(`   ⚠️ 포커스 이동 실패: ${(error as Error).message}`);
        }
      }
    }

    return false;
  }

  private async ensureBodyFocus(frame?: Frame, page?: Page): Promise<boolean> {
    const targetFrame = frame || (await this.getAttachedFrame());
    const targetPage = page || this.ensurePage();

    // 여러 방법으로 포커스 복구 시도 (최대 3회)
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        this.log(`   🔄 [포커스복구] 재시도 ${attempt + 1}/3...`);
        await this.delay(300 * attempt); // 재시도마다 대기 시간 증가
      }

      // 현재 포커스가 본문 영역인지 확인 (강화된 확인)
      const isInBody = await targetFrame.evaluate(() => {
        const activeElement = document.activeElement;
        if (!activeElement) return false;

        // 본문 영역인지 확인 (더 넓은 범위)
        const isInTextArea = activeElement.closest('.se-section-text, .se-module-text, .se-text-paragraph, .se-component-text') !== null;

        // contenteditable 요소인지 확인
        const isContentEditable = (activeElement as HTMLElement).contentEditable === 'true';

        return isInTextArea || isContentEditable;
      }).catch(() => false);

      if (isInBody) {
        // 포커스가 있지만 실제로 입력 가능한지 확인
        const canType = await targetFrame.evaluate(() => {
          const activeElement = document.activeElement as HTMLElement;
          if (!activeElement) return false;

          // 입력 가능한 요소인지 확인
          const tagName = activeElement.tagName.toLowerCase();
          const isInputElement = tagName === 'input' || tagName === 'textarea' || activeElement.contentEditable === 'true';

          return isInputElement && !activeElement.hasAttribute('disabled') && !activeElement.hasAttribute('readonly');
        }).catch(() => false);

        if (canType) {
          // 커서를 끝으로 이동하여 확실히 포커스 확인
          try {
            await targetPage.keyboard.press('End');
            await this.delay(100);

            // 최종 확인
            const finalCheck = await targetFrame.evaluate(() => {
              const activeElement = document.activeElement as HTMLElement;
              return activeElement && (
                activeElement.closest('.se-section-text, .se-module-text, .se-text-paragraph') !== null ||
                activeElement.contentEditable === 'true'
              );
            }).catch(() => false);

            if (finalCheck) {
              return true;
            }
          } catch {
            // End 키 실패해도 계속
          }
        }
      }

      // 본문 영역으로 포커스 이동 (강화된 로직)
      // 방법 1: 마지막 paragraph 찾기
      const focusSuccess = await targetFrame.evaluate(() => {
        // 마지막 paragraph 찾기
        const paragraphs = Array.from(document.querySelectorAll('.se-text-paragraph'));
        let targetParagraph: HTMLElement | null = null;

        // 텍스트가 있는 마지막 paragraph 찾기
        for (let i = paragraphs.length - 1; i >= 0; i--) {
          const para = paragraphs[i] as HTMLElement;
          if (para.textContent && para.textContent.trim().length > 0) {
            targetParagraph = para;
            break;
          }
        }

        // paragraph가 없으면 본문 영역 찾기
        if (!targetParagraph) {
          targetParagraph = document.querySelector('.se-section-text, .se-module-text') as HTMLElement;
        }

        if (!targetParagraph) {
          return false;
        }

        // 포커스 설정
        targetParagraph.focus();

        // 커서를 끝으로 이동
        const selection = window.getSelection();
        if (selection && targetParagraph) {
          const range = document.createRange();

          // 마지막 텍스트 노드 찾기
          let lastTextNode: Node | null = null;
          const walker = document.createTreeWalker(
            targetParagraph,
            NodeFilter.SHOW_TEXT,
            null
          );

          let node: Node | null;
          while (node = walker.nextNode()) {
            lastTextNode = node;
          }

          if (lastTextNode && lastTextNode.nodeType === Node.TEXT_NODE) {
            range.setStart(lastTextNode, (lastTextNode as Text).length);
          } else {
            range.selectNodeContents(targetParagraph);
            range.collapse(false);
          }

          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }

        return true;
      }).catch(() => false);

      if (focusSuccess) {
        await this.delay(200);

        // 포커스 확인
        const verified = await targetFrame.evaluate(() => {
          const activeElement = document.activeElement as HTMLElement;
          return activeElement && (
            activeElement.closest('.se-section-text, .se-module-text, .se-text-paragraph') !== null ||
            activeElement.contentEditable === 'true'
          );
        }).catch(() => false);

        if (verified) {
          // 키보드로도 커서를 끝으로 이동
          try {
            await targetPage.keyboard.press('End');
            await this.delay(100);
          } catch {
            // 실패해도 계속
          }
          return true;
        }
      }

      // 방법 2: 직접 클릭 시도
      try {
        const lastParagraph = await targetFrame.$('.se-text-paragraph:last-of-type').catch(() => null);
        if (lastParagraph) {
          await lastParagraph.click();
          await this.delay(300);

          const clicked = await targetFrame.evaluate(() => {
            const activeElement = document.activeElement as HTMLElement;
            return activeElement && (
              activeElement.closest('.se-section-text, .se-module-text, .se-text-paragraph') !== null ||
              activeElement.contentEditable === 'true'
            );
          }).catch(() => false);

          if (clicked) {
            await targetPage.keyboard.press('End');
            await this.delay(100);
            return true;
          }
        }
      } catch {
        // 클릭 실패
      }

      // 방법 3: 본문 영역 전체 클릭
      try {
        const bodyElement = await targetFrame.$('.se-section-text').catch(() => null);
        if (bodyElement) {
          await bodyElement.click();
          await this.delay(300);

          const clicked = await targetFrame.evaluate(() => {
            const activeElement = document.activeElement as HTMLElement;
            return activeElement && (
              activeElement.closest('.se-section-text, .se-module-text, .se-text-paragraph') !== null ||
              activeElement.contentEditable === 'true'
            );
          }).catch(() => false);

          if (clicked) {
            await targetPage.keyboard.press('End');
            await this.delay(100);
            return true;
          }
        }
      } catch {
        // 클릭 실패
      }
    }

    // 모든 방법 실패
    return false;
  }

  /**
   * ✅ 자동화 완료 후 에디터를 편집 가능한 상태로 활성화
   * 사용자가 생성된 글을 직접 수정할 수 있도록 함
   */
  private async activateEditorForEditing(): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    try {
      this.log('✏️ 에디터를 편집 가능한 상태로 활성화 중...');

      // 1. 에디터 영역 클릭하여 포커스 설정
      const editorActivated = await frame.evaluate(() => {
        // 본문 영역 찾기
        const sectionText = document.querySelector('.se-section-text');
        if (!sectionText) return false;

        // 첫 번째 편집 가능한 요소 찾기
        const editableElements = sectionText.querySelectorAll('.se-text-paragraph, [contenteditable="true"]');
        if (editableElements.length === 0) return false;

        // 첫 번째 편집 가능한 요소 클릭
        const firstEditable = editableElements[0] as HTMLElement;

        // readonly나 disabled 속성 제거
        firstEditable.removeAttribute('readonly');
        firstEditable.removeAttribute('disabled');

        // contentEditable이 false인 경우 true로 설정
        if (firstEditable.contentEditable === 'false') {
          firstEditable.contentEditable = 'true';
        }

        // 클릭하여 포커스 설정
        firstEditable.click();

        // 포커스 강제 설정
        firstEditable.focus();

        return true;
      }).catch(() => false);

      if (editorActivated) {
        await this.delay(500);

        // 2. 포커스 확인 및 추가 활성화
        const focusConfirmed = await frame.evaluate(() => {
          const activeElement = document.activeElement as HTMLElement;
          if (!activeElement) return false;

          // 본문 영역인지 확인
          const isInBody = activeElement.closest('.se-section-text, .se-module-text, .se-text-paragraph') !== null;
          if (!isInBody) return false;

          // contentEditable 확인 및 활성화
          if (activeElement.contentEditable === 'false') {
            activeElement.contentEditable = 'true';
          }

          // readonly/disabled 제거
          activeElement.removeAttribute('readonly');
          activeElement.removeAttribute('disabled');

          // 포커스 재설정
          activeElement.focus();

          return true;
        }).catch(() => false);

        if (focusConfirmed) {
          this.log('✅ 에디터가 편집 가능한 상태로 활성화되었습니다.');
        } else {
          this.log('⚠️ 에디터 활성화에 일부 문제가 있을 수 있습니다. 수동으로 클릭해주세요.');
        }
      } else {
        // 폴백: 본문 영역 직접 클릭
        const bodyElement = await frame.$('.se-section-text').catch(() => null);
        if (bodyElement) {
          try {
            await bodyElement.click();
            await this.delay(500);

            // JavaScript로 포커스 설정
            await frame.evaluate(() => {
              const sectionText = document.querySelector('.se-section-text');
              if (sectionText) {
                const editableElements = sectionText.querySelectorAll('[contenteditable="true"], .se-text-paragraph');
                if (editableElements.length > 0) {
                  const firstEditable = editableElements[0] as HTMLElement;
                  firstEditable.removeAttribute('readonly');
                  firstEditable.removeAttribute('disabled');
                  if (firstEditable.contentEditable === 'false') {
                    firstEditable.contentEditable = 'true';
                  }
                  firstEditable.focus();
                }
              }
            });

            this.log('✅ 에디터가 편집 가능한 상태로 활성화되었습니다.');
          } catch (error) {
            this.log('⚠️ 에디터 활성화 중 오류 발생. 수동으로 클릭해주세요.');
          }
        }
      }
    } catch (error) {
      this.log('⚠️ 에디터 활성화 중 오류 발생. 수동으로 클릭해주세요.');
    }
  }

  // 셀렉터 상수 정의
  private readonly SELECTORS = {
    MAIN_FRAME: '#mainFrame',
    CONTENT_AREA: '.se-section-text, .se-module-text, .se-text-paragraph, .se-component',
    TITLE: '.se-section-documentTitle',
    FILE_INPUT: 'input[type="file"]',
    IMAGE: 'img',
    HELP_CLOSE: '.se-help-panel-close-button, .se-hlpr-panel-close-button, .se-hlpe-panel-close-button, button[aria-label*="도움말"][aria-label*="닫기"], button[title*="도움말"][title*="닫기"], button[class*="help"][class*="close"]',
    POPUP_CANCEL: '.se-popup-button-cancel',
    SAVE_BUTTON: 'button.save_btn__bzc5B[data-click-area="tpb.save"]',
    PUBLISH_BUTTON: 'button.publish_btn__bzc5B[data-click-area="tpb.publish"]',
  };

  // 재시도 유틸리티 함수
  private async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    operationName: string = '작업'
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // ✅ 취소 확인 - 사용자가 중지 버튼을 누른 경우 즉시 종료
        this.ensureNotCancelled();

        this.log(`   [재시도 ${attempt}/${maxRetries}] ${operationName} 시도 중...`);
        const result = await fn();
        if (attempt > 1) {
          this.log(`   ✅ ${operationName} 성공 (${attempt}번째 시도)`);
        }
        return result;
      } catch (error) {
        lastError = error as Error;
        const errorMsg = lastError.message || '';

        // ✅ 치명적 에러 감지 - 재시도 불가능한 에러는 즉시 종료
        // ⚠️ [2026-01-21] 'detached Frame'은 복구 가능하므로 치명적 에러 목록에서 제외
        const fatalErrors = [
          'Target closed',
          'Protocol error',
          'Session closed',
          'Connection closed',
          'Execution context was destroyed',
          'Cannot find context',
          'Page is closed',
          'Browser is closed',
          // 'detached Frame' 제외 - 프레임 재연결로 복구 가능
        ];

        const isFatalError = fatalErrors.some(fe => errorMsg.includes(fe));

        // ✅ [2026-01-21] detached Frame 에러 발생 시 프레임 재연결 시도
        const isDetachedFrameError = errorMsg.includes('detached Frame');
        if (isDetachedFrameError && attempt < maxRetries) {
          this.log(`   ⚠️ 프레임 분리 오류 발생: ${errorMsg.substring(0, 60)}...`);
          this.log(`   🔄 프레임 재연결 시도 중...`);
          try {
            // ✅ [2026-03-05 FIX] mainFrame을 null로 리셋하여 강제 재연결
            this.mainFrame = null;
            await this.switchToMainFrame();
            this.log(`   ✅ 프레임 재연결 성공`);
            await this.delay(3000); // 2000ms → 3000ms (프레임 완전 로드 대기)
            // ✅ 프레임이 실제로 유효한지 간단 검증
            if (this.mainFrame) {
              this.log(`   ✅ 프레임 동작 검증 완료, 재시도합니다...`);
            } else {
              this.log(`   ⚠️ 프레임 검증 실패 — 다음 retry에서 다시 시도`);
            }
            continue; // 재시도
          } catch (frameError) {
            this.log(`   ❌ 프레임 재연결 실패: ${(frameError as Error).message}`);
            // 프레임 재연결 실패 시 치명적 에러로 처리
            throw new Error(`${operationName} 실패 - 브라우저 프레임이 유효하지 않습니다. 다시 시작해주세요.`);
          }
        }

        if (isFatalError) {
          this.log(`   ❌ ${operationName} 치명적 에러 (재시도 불가): ${errorMsg}`);
          throw new Error(`${operationName} 실패 - 브라우저 세션이 종료되었습니다. 다시 시작해주세요.`);
        }

        this.log(`   ⚠️ ${operationName} 실패 (${attempt}/${maxRetries}): ${errorMsg}`);

        if (attempt < maxRetries) {
          await this.delay(2000); // 재시도 사이 2초 대기
        }
      }
    }

    throw new Error(`${operationName} 실패 (${maxRetries}회 시도 후): ${lastError?.message}`);
  }

  // 타이핑 위치 모니터링 함수
  private async monitorTypingPosition(
    frame: Frame,
    expectedLocation: 'title' | 'subtitle' | 'body' | 'image-after'
  ): Promise<{ isValid: boolean; details: string }> {
    const result = await frame.evaluate((location) => {
      // 더 정확한 포커스 확인: Selection API 사용
      const selection = window.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      let activeElement = document.activeElement as HTMLElement;

      // activeElement가 IFRAME이면 iframe 내부의 activeElement 확인
      if (activeElement && activeElement.tagName === 'IFRAME') {
        try {
          const iframeDoc = (activeElement as HTMLIFrameElement).contentDocument;
          if (iframeDoc) {
            activeElement = iframeDoc.activeElement as HTMLElement;
          }
        } catch (e) {
          // cross-origin iframe이면 접근 불가
        }
      }

      // activeElement가 없으면 body나 document를 확인
      let focusElement: HTMLElement | null = activeElement;
      if (!focusElement || focusElement.tagName === 'IFRAME' || focusElement.tagName === 'BODY' || focusElement.tagName === 'HTML') {
        // Selection API로 포커스 위치 확인
        if (range && range.commonAncestorContainer) {
          const container = range.commonAncestorContainer;
          if (container.nodeType === Node.TEXT_NODE) {
            focusElement = container.parentElement;
          } else if (container.nodeType === Node.ELEMENT_NODE) {
            focusElement = container as HTMLElement;
          }
        }
        // 여전히 없으면 body의 첫 번째 contentEditable 요소 찾기
        if (!focusElement || focusElement.tagName === 'BODY' || focusElement.tagName === 'HTML') {
          const editableElements = document.querySelectorAll('[contenteditable="true"]');
          if (editableElements.length > 0) {
            // 가장 마지막 요소 선택 (최근 입력 위치)
            focusElement = editableElements[editableElements.length - 1] as HTMLElement;
          }
        }
        // 여전히 없으면 본문 영역 요소 찾기
        if (!focusElement || focusElement.tagName === 'BODY' || focusElement.tagName === 'HTML') {
          const bodyElements = document.querySelectorAll('.se-section-text, .se-module-text, .se-text-paragraph');
          if (bodyElements.length > 0) {
            focusElement = bodyElements[bodyElements.length - 1] as HTMLElement;
          }
        }
      }

      if (!focusElement || focusElement.tagName === 'BODY' || focusElement.tagName === 'HTML' || focusElement.tagName === 'IFRAME') {
        return {
          isValid: false,
          details: `활성 요소가 없거나 유효하지 않습니다. (tag: ${focusElement?.tagName || 'none'})`,
          currentLocation: 'none',
          isInTitle: false,
          isInBody: false,
          activeElementTag: focusElement?.tagName || 'none',
        };
      }

      // 제목 영역인지 확인 (focusElement 사용)
      const isInTitle = focusElement.closest('.se-section-documentTitle') !== null ||
        focusElement.closest('[class*="title"]') !== null ||
        focusElement.getAttribute('placeholder')?.includes('제목') ||
        focusElement.classList.contains('se-section-documentTitle') ||
        false;

      // 본문 영역인지 확인 (더 넓은 범위로 확인)
      const isInBody = focusElement.closest('.se-section-text, .se-module-text, .se-text-paragraph, .se-component, .se-section') !== null ||
        focusElement.contentEditable === 'true' ||
        focusElement.classList.contains('se-section-text') ||
        focusElement.classList.contains('se-module-text') ||
        focusElement.classList.contains('se-text-paragraph') ||
        focusElement.classList.contains('se-component') ||
        false;

      // 현재 위치 판단 (focusElement 사용)
      let currentLocation: string;
      if (isInTitle) {
        currentLocation = 'title';
      } else if (isInBody) {
        // 본문 내에서도 더 세밀하게 확인
        const parent = focusElement.closest('.se-section-text, .se-module-text, .se-text-paragraph');
        if (parent) {
          const computedStyle = window.getComputedStyle(parent);
          const fontSize = computedStyle.fontSize;
          if (fontSize === '28px' || fontSize === '2.8rem' || fontSize === '27.6px' || fontSize === '30px' || fontSize === '24px') {
            currentLocation = 'subtitle';
          } else {
            currentLocation = 'body';
          }
        } else {
          // parent가 없어도 본문 영역이면 body로 간주
          currentLocation = 'body';
        }
      } else {
        // unknown인 경우 더 자세한 정보 수집
        const tagName = focusElement.tagName;
        const className = focusElement.className || '';
        const id = focusElement.id || '';
        currentLocation = `unknown (tag: ${tagName}, class: ${className}, id: ${id})`;
      }

      // 이미지 다음인지 확인 (focusElement 사용)
      const isAfterImage = (() => {
        const images = Array.from(document.querySelectorAll('img'));
        if (images.length === 0) return false;
        const lastImage = images[images.length - 1] as HTMLElement;
        let current: HTMLElement | null = focusElement;
        while (current) {
          if (current === lastImage) return false;
          if (current.compareDocumentPosition(lastImage) & Node.DOCUMENT_POSITION_PRECEDING) {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      })();

      // 위치 검증
      // 네이버 블로그는 제목을 제외한 모든 것이 본문 영역입니다.
      let isValid = false;
      if (location === 'title') {
        isValid = isInTitle;
      } else if (location === 'subtitle') {
        // subtitle 위치: 제목 영역이 아니고 본문 영역이면 모두 허용 (소제목 필드가 따로 없음)
        isValid = !isInTitle && isInBody;
      } else if (location === 'body') {
        // body 위치: 제목 영역이 아니고 본문 영역이면 모두 허용
        isValid = !isInTitle && isInBody;
      } else if (location === 'image-after') {
        // 이미지 다음: 본문 영역이고 이미지 다음이면 OK
        isValid = !isInTitle && isInBody && isAfterImage;
      }

      return {
        isValid,
        details: `현재 위치: ${currentLocation}, 제목 영역: ${isInTitle}, 본문 영역: ${isInBody}, 이미지 다음: ${isAfterImage}, 태그: ${focusElement.tagName}, 클래스: ${focusElement.className || 'none'}`,
        currentLocation,
        isInTitle,
        isInBody,
        activeElementTag: focusElement.tagName,
        fontSize: window.getComputedStyle(focusElement).fontSize,
      };
    }, expectedLocation);

    return {
      isValid: result.isValid,
      details: result.details,
    };
  }

  // DOM 검증 함수
  private async verifyContentInDOM(
    frame: Frame,
    expectedText: string,
    contentType: 'subtitle' | 'body'
  ): Promise<boolean> {
    return await frame.evaluate((text, type) => {
      // 정규화 함수
      const normalize = (str: string) => str.replace(/\s+/g, ' ').trim().toLowerCase();
      const normalizedText = normalize(text);

      // 여러 선택자로 본문 영역 찾기
      const possibleSelectors = [
        '.se-section-text',
        '.se-main-container',
        '.se-component-content',
        '[contenteditable="true"]',
        '.se-text-paragraph',
        '.se-component'
      ];

      let allBodyText = '';
      let foundElements = 0;

      // 모든 가능한 선택자로 텍스트 수집
      for (const selector of possibleSelectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const elementText = (el as HTMLElement).innerText || el.textContent || '';
          if (elementText.trim()) {
            allBodyText += ' ' + elementText;
            foundElements++;
          }
        });
      }

      // 소제목 검증 시 제목 필드 제외
      if (type === 'subtitle') {
        const titleElement = document.querySelector('.se-section-documentTitle');
        if (titleElement) {
          const titleText = (titleElement as HTMLElement).innerText || titleElement.textContent || '';
          // 제목 텍스트를 본문에서 제거
          allBodyText = allBodyText.replace(titleText, '');
        }
      }

      const normalizedBody = normalize(allBodyText);
      let found = normalizedBody.includes(normalizedText);

      // 추가 검증: 부분 일치 (첫 20자만)
      if (!found && normalizedText.length > 20) {
        const partialText = normalizedText.substring(0, 20);
        found = normalizedBody.includes(partialText);
      }

      // 디버깅 정보 (검증 실패 시에만)
      if (!found) {
        console.warn(`[검증 정보] 타입: ${type}, 찾은 요소 수: ${foundElements}`);
        console.warn(`[검증 정보] 검색 텍스트 (처음 50자): "${text.substring(0, 50)}..."`);
        console.warn(`[검증 정보] 본문 텍스트 (처음 200자): "${allBodyText.substring(0, 200)}..."`);
        console.warn(`[검증 정보] 본문 전체 길이: ${allBodyText.length}자`);
      }

      return found;
    }, expectedText, contentType);
  }

  // 이미지 DOM 검증
  private async verifyImageInDOM(frame: Frame, imagePath: string): Promise<boolean> {
    return await frame.evaluate((path) => {
      const images = Array.from(document.querySelectorAll('img'));
      const fileName = path.split(/[/\\]/).pop() || '';

      for (const img of images) {
        const src = img.getAttribute('src') || '';
        if (src.includes(fileName) || img.alt === fileName) {
          return true;
        }
      }

      // 검증 실패 (에러는 상위에서 처리)
      return false;
    }, imagePath);
  }

  // 소제목 입력 (재시도 + 검증 포함)
  // quotationStyle: 'line' = 인용구 2 (버티컬 라인, 사용자 요청), 'underline' = 인용구 4 (쇼핑커넥트용), 'bracket' = 인용구 1 (따옴표)
  private async typeSubtitleWithRetry(
    frame: Frame,
    page: Page,
    text: string,
    fontSize: number,
    quotationStyle: 'line' | 'bracket' | 'underline' = 'line'
  ): Promise<void> {
    await this.retry(async () => {
      const normalizedText = this.normalizeSubtitleText(text);
      this.log(`   → 소제목(인용구) 입력 시작: "${normalizedText}"`);

      // ✅ 1. 기본 준비 (패널 닫기 등)
      await page.keyboard.press('Escape');
      await frame.evaluate(() => {
        const panels = document.querySelectorAll('.se-popup, .se-panel, .se-layer, .se-modal');
        panels.forEach(p => (p as HTMLElement).style.display = 'none');
      }).catch(() => { });

      // ✅ 2. 본문 포커스 및 커서 위치 설정
      await frame.evaluate(() => {
        const body = document.querySelector('.se-section-text, .se-main-container, .se-component-content') as HTMLElement;
        if (body) {
          body.focus();
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            let lastNode: Node = body;
            while (lastNode.lastChild) lastNode = lastNode.lastChild;
            range.setStartAfter(lastNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });
      await this.delay(this.DELAYS.SHORT);

      // ✅ 3. 인용구 삽입 (스타일에 따라 선택)
      await this.insertQuotation(frame, page, quotationStyle);
      await this.delay(this.DELAYS.MEDIUM);

      // ✅ 4. 텍스트 입력 전 스타일 설정 (28px + 볼드체)
      // 사용자의 요청대로 입력 전에 모든 스타일을 맞춥니다.
      await this.setFontSize(fontSize, true);
      await this.delay(this.DELAYS.SHORT);

      await this.setBoldStyle(true);
      await this.delay(this.DELAYS.SHORT);

      await this.setFontColor('#000000');
      await this.delay(this.DELAYS.SHORT);

      // ✅ 5. 텍스트 입력 (스타일이 적용된 상태에서 입력)
      await safeKeyboardType(page, normalizedText, { delay: 30 });
      await this.delay(this.DELAYS.MEDIUM);

      // 선택 해제 (오른쪽 화살표)
      await page.keyboard.press('ArrowRight');
      await this.delay(this.DELAYS.SHORT);

      // ✅ 6. 검증
      const verified = await this.verifyContentInDOM(frame, normalizedText, 'subtitle');
      if (!verified) {
        this.log('   ⚠️ 소제목(인용구) DOM 검증 실패 (계속 진행)');
      } else {
        this.log('   ✅ 소제목(인용구) 입력 완료');
      }

      // ✅ 7. 인용구 탈출 (중요: Enter만 누르면 인용구 확장이 될 수 있음)
      // 아래 화살표 2번으로 확실하게 인용구 블록 밖으로 이동 후 엔터
      await page.keyboard.press('ArrowDown');
      await this.delay(100);
      await page.keyboard.press('ArrowDown');
      await this.delay(this.DELAYS.SHORT);

      await page.keyboard.press('Enter');
      await this.delay(this.DELAYS.MEDIUM);
    }, 3, '소제목(인용구) 입력');
  }

  // 인용구 삽입 헬퍼
  // style: 'line' = 인용구 1 (기본), 'underline' = 인용구 4 (쇼핑커넥트용)
  private async insertQuotation(frame: Frame, page: Page, style: string = 'line'): Promise<void> {
    return await editorHelpers.insertQuotation(this, frame, page, style);
  }

  private async clickToolbarButton(frame: Frame, page: Page, selectors: string[]): Promise<boolean> {
    const contexts = [page, frame];
    for (const context of contexts) {
      const clicked = await context.evaluate((sels) => {
        for (const sel of sels) {
          const btn = document.querySelector(sel);
          if (btn instanceof HTMLElement) {
            btn.click();
            return true;
          }
        }
        return false;
      }, selectors).catch(() => false);
      if (clicked) return true;
    }
    return false;
  }

  private normalizeSubtitleText(raw: string): string {
    let t = String(raw || '').trim();
    if (!t) return '';

    t = t.replace(/\*\*/g, '');
    t = t.replace(/^#+\s*/, ''); // ✅ 최우선: Markdown 해시 (#) 제거
    t = t.replace(/^\s*(?:제\s*)?\d+\s*번째\s*소제목\s*[:：]\s*/i, '');
    t = t.replace(/^\s*(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번째\s*소제목\s*[:：]\s*/i, '');
    t = t.replace(/^\s*소제목\s*[:：]\s*/i, '');
    t = t.replace(/^(?:[•\-–—*]\s*)?(?:제\s*\d+\s*장\s*|STEP\s*\d+\s*|Step\s*\d+\s*|[①-⑳]\s*|\d{1,2}[).]\s*)/i, '');
    t = t.replace(/[\s\-–—:|·•,]+$/g, '').trim();
    t = t.replace(/\s+/g, ' ').trim();
    if (!t) return String(raw || '').trim();
    // ✅ 소제목 글자 수 제한 완화 (네이버 블로그는 긴 소제목도 허용)
    // 기존: 45자 초과 시 42자로 잘라서 ... 추가 → 제거!
    return t;
  }


  // 본문 입력 (재시도 + 검증 포함)
  private async typeBodyWithRetry(
    frame: Frame,
    page: Page,
    text: string,
    fontSize: number = 19
  ): Promise<void> {
    return await editorHelpers.typeBodyWithRetry(this, frame, page, text, fontSize);
  }

  private async typeTextWithMarkdownBold(frame: Frame, page: Page, text: string, delay: number): Promise<void> {
    const raw = String(text || '');
    if (!raw) return;

    const re = /\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(raw)) !== null) {
      const before = raw.slice(lastIndex, match.index);
      if (before) {
        await safeKeyboardType(page, before, { delay });
      }

      const boldText = String(match[1] || '');
      if (boldText) {
        await this.setBold(true);
        await this.delay(30);
        await safeKeyboardType(page, boldText, { delay });
        await this.delay(30);
        await this.setBold(false);
        await this.delay(30);
      }

      lastIndex = match.index + match[0].length;
    }

    const tail = raw.slice(lastIndex);
    if (tail) {
      await safeKeyboardType(page, tail, { delay });
    }
  }


  /**
   * 폰트 색상 설정 (소제목 막대 색상 변경용)
   */
  private async setFontColor(color: string): Promise<void> {
    const frame = (await this.getAttachedFrame());
    await frame.evaluate((c) => {
      document.execCommand('foreColor', false, c);
    }, color);
  }

  /**
   * ✅ 에디터의 현재 내용을 읽어서 사용자가 수정한 내용이 있는지 확인
   * 제목, 본문, 해시태그 모두 확인
   */
  private async getCurrentEditorContent(): Promise<{ title: string; content: string; hashtags: string[] } | null> {
    const frame = (await this.getAttachedFrame());

    try {
      const editorContent = await frame.evaluate(() => {
        // 제목 읽기
        const titleElement = document.querySelector('.se-section-documentTitle .se-title-text') as HTMLElement;
        const title = titleElement?.textContent?.trim() || '';

        // 해시태그 읽기
        const hashtagElements = document.querySelectorAll('.se-tag-list .se-tag, .se-hashtag, [data-tag]');
        const hashtags: string[] = [];
        hashtagElements.forEach((el) => {
          const tagText = (el as HTMLElement).textContent?.trim() || '';
          if (tagText && tagText.startsWith('#')) {
            hashtags.push(tagText.substring(1)); // # 제거
          } else if (tagText) {
            hashtags.push(tagText);
          }
        });

        // 본문 읽기
        const sectionText = document.querySelector('.se-section-text');
        if (!sectionText) return null;

        // 모든 텍스트 요소에서 내용 추출
        const textElements = sectionText.querySelectorAll('.se-text-paragraph, [contenteditable="true"]');
        const contentParts: string[] = [];

        textElements.forEach((el) => {
          const text = (el as HTMLElement).textContent?.trim() || '';
          if (text.length > 0) {
            contentParts.push(text);
          }
        });

        const content = contentParts.join('\n\n');

        // 내용이 있으면 반환
        if (title.length > 0 || content.length > 0) {
          return { title, content, hashtags };
        }

        return null;
      }).catch(() => null);

      return editorContent;
    } catch (error) {
      this.log(`⚠️ 에디터 내용 읽기 실패: ${(error as Error).message}`);
      return null;
    }
  }

  private async applyStructuredContent(resolved: ResolvedRunOptions): Promise<void> {
    return await editorHelpers.applyStructuredContent(this, resolved);
  }


  private async setFontSize(size: number, force: boolean = false): Promise<void> {
    return await editorHelpers.setFontSize(this, size, force);
  }

  // 볼드(굵게) 스타일 설정
  private async setBoldStyle(enable: boolean = true): Promise<void> {
    const frame = (await this.getAttachedFrame());

    this.log(`   → 볼드체(굵게) ${enable ? '설정' : '해제'} 중...`);

    try {
      // 1. 툴바 버튼으로 설정 시도
      const boldButton = await frame.waitForSelector(
        'button.se-bold-toolbar-button[data-name="bold"]',
        { visible: true, timeout: 1500 }
      ).catch(() => null);

      if (boldButton) {
        const isSelected = await boldButton.evaluate((el: Element) => el.classList.contains('se-is-selected'));

        // 상태가 요청과 다를 때만 클릭
        if (isSelected !== enable) {
          await boldButton.click();
          await this.delay(this.DELAYS.SHORT);
          this.log(`   ✅ 볼드체 ${enable ? '설정' : '해제'} 완료 (툴바)`);
          return;
        } else {
          this.log(`   ℹ️ 볼드체가 이미 ${enable ? '설정' : '해제'}된 상태입니다.`);
          return;
        }
      }

      // 2. JavaScript (execCommand) 폴백
      await frame.evaluate((enableBold) => {
        const isBold = document.queryCommandState('bold');
        if (isBold !== enableBold) {
          document.execCommand('bold', false, undefined);
        }
      }, enable);

      this.log(`   ✅ 볼드체 ${enable ? '설정' : '해제'} 완료 (명령어)`);
    } catch (error) {
      this.log(`   ⚠️ 볼드체 설정 실패: ${(error as Error).message}`);
    }
  }

  /**
   * 네이버 블로그 에디터에서 글 톤 설정
   */
  private async setToneStyle(toneStyle: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe' | 'storyteller' | 'expert_review' | 'calm_info'): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    this.log(`🎨 글 톤 설정 중: ${toneStyle}`);

    try {
      // 네이버 블로그 톤앤매너 버튼 선택자들
      const toneButtonSelectors = [
        'button[data-name="tone"]',
        'button[aria-label*="톤"]',
        'button[aria-label*="톤앤매너"]',
        'button[data-tooltip*="톤"]',
        'button[data-tooltip*="톤앤매너"]',
        'button[title*="톤"]',
        'button[title*="톤앤매너"]',
        '.se-toolbar-item[data-name="tone"]',
        '.se-toolbar-item[aria-label*="톤"]',
        'button.se-tone-button',
        '[data-command="tone"]',
      ];

      let toneButton: ElementHandle<Element> | null = null;

      // 톤 버튼 찾기
      for (const selector of toneButtonSelectors) {
        try {
          const buttons = await frame.$$(selector).catch(() => []);
          for (const button of buttons) {
            const isVisible = await button.isIntersectingViewport().catch(() => false);
            if (isVisible) {
              toneButton = button;
              this.log(`   ✅ 톤 버튼 발견: ${selector}`);
              break;
            }
          }
          if (toneButton) break;
        } catch {
          continue;
        }
      }

      if (!toneButton) {
        this.log('   ⚠️ 톤 버튼을 찾을 수 없습니다. 톤 설정을 건너뜁니다.');
        return;
      }

      // 톤 버튼 클릭
      await toneButton.click();
      await this.delay(this.DELAYS.MEDIUM);

      // 톤 옵션 선택 (드롭다운 메뉴에서)
      const toneOptionMap: Record<string, string[]> = {
        'professional': ['전문적', '전문가', 'professional', 'expert'],
        'friendly': ['친근함', '친근', 'friendly', 'warm'],
        'casual': ['일상적', '일상', 'casual', 'informal'],
        'formal': ['격식적', '격식', 'formal', 'official'],
        'humorous': ['유머러스', '유머', 'humorous', 'funny'],
        'community_fan': ['커뮤니티', '팬', 'community', 'fan'],
        'mom_cafe': ['맘카페', '살림', 'mom', 'cafe'],
        'storyteller': ['스토리텔러', '서사', 'storyteller', 'narrative'],
        'expert_review': ['전문리뷰', '리뷰어', 'expert_review', 'review'],
        'calm_info': ['차분한', '정보전달', 'calm', 'info'],
      };

      const toneKeywords = toneOptionMap[toneStyle] || [];
      let toneOption: ElementHandle<Element> | null = null;

      // 톤 옵션 찾기 (여러 선택자 시도)
      const toneOptionSelectors = [
        ...toneKeywords.map(keyword => `button[aria-label*="${keyword}"]`),
        ...toneKeywords.map(keyword => `button[data-value*="${keyword}"]`),
        ...toneKeywords.map(keyword => `li[aria-label*="${keyword}"]`),
        ...toneKeywords.map(keyword => `.se-tone-option[data-value*="${keyword}"]`),
        'button[data-tone="professional"]',
        'button[data-tone="friendly"]',
        'button[data-tone="casual"]',
        'button[data-tone="formal"]',
        'button[data-tone="humorous"]',
        'button[data-tone="community_fan"]',
        'button[data-tone="mom_cafe"]',
        'button[data-tone="storyteller"]',
        'button[data-tone="expert_review"]',
        'button[data-tone="calm_info"]',
      ];

      for (const selector of toneOptionSelectors) {
        try {
          const options = await frame.$$(selector).catch(() => []);
          for (const option of options) {
            const isVisible = await option.isIntersectingViewport().catch(() => false);
            const text = await option.evaluate(el => el.textContent || '').catch(() => '');
            const ariaLabel = await option.evaluate(el => el.getAttribute('aria-label') || '').catch(() => '');

            // 키워드 매칭 확인
            const matches = toneKeywords.some(keyword =>
              text.toLowerCase().includes(keyword.toLowerCase()) ||
              ariaLabel.toLowerCase().includes(keyword.toLowerCase())
            );

            if (isVisible && matches) {
              toneOption = option;
              this.log(`   ✅ 톤 옵션 발견: ${text || ariaLabel}`);
              break;
            }
          }
          if (toneOption) break;
        } catch {
          continue;
        }
      }

      if (toneOption) {
        await toneOption.click();
        await this.delay(this.DELAYS.MEDIUM);
        this.log(`   ✅ 글 톤 "${toneStyle}" 설정 완료`);
      } else {
        this.log(`   ⚠️ "${toneStyle}" 톤 옵션을 찾을 수 없습니다. 기본 톤을 사용합니다.`);
        // ESC로 메뉴 닫기
        await page.keyboard.press('Escape');
        await this.delay(this.DELAYS.SHORT);
      }
    } catch (error) {
      this.log(`   ⚠️ 톤 설정 중 오류: ${(error as Error).message}`);
      // 오류가 발생해도 계속 진행
    }
  }

  private async clearAllFormatting(): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    try {
      // 취소선 버튼 찾아서 비활성화
      const strikethroughSelectors = [
        'button[data-name="strikethrough"]',
        'button.se-toolbar-button[data-command="strikethrough"]',
        'button[aria-label*="취소선"]',
        'button[title*="취소선"]',
        '.se-strikethrough-button',
      ];

      for (const selector of strikethroughSelectors) {
        const button = await frame.$(selector).catch(() => null);
        if (button) {
          // 버튼이 활성화되어 있는지 확인
          const isActive = await button.evaluate((el: Element) => {
            const htmlEl = el as HTMLElement;
            return htmlEl.classList.contains('active') ||
              htmlEl.classList.contains('selected') ||
              htmlEl.getAttribute('aria-pressed') === 'true';
          }).catch(() => false);

          if (isActive) {
            await button.click();
            await this.delay(this.DELAYS.MEDIUM);
            this.log('✅ 취소선 비활성화 완료');
          }
          break;
        }
      }

      // 기타 서식 초기화 (굵게, 기울임 등)
      const formatButtons = [
        'button[data-name="bold"]',
        'button[data-name="italic"]',
        'button[data-name="underline"]',
      ];

      for (const selector of formatButtons) {
        const button = await frame.$(selector).catch(() => null);
        if (button) {
          const isActive = await button.evaluate((el: Element) => {
            const htmlEl = el as HTMLElement;
            return htmlEl.classList.contains('active') ||
              htmlEl.classList.contains('selected') ||
              htmlEl.getAttribute('aria-pressed') === 'true';
          }).catch(() => false);

          if (isActive) {
            await button.click();
            await this.delay(100);
          }
        }
      }

      this.log('✅ 서식 초기화 완료');
    } catch (error) {
      this.log(`⚠️ 서식 초기화 실패: ${(error as Error).message}`);
    }
  }


  private extractBodyForHeading(fullBody: string, headingTitle: string, headingIndex: number, totalHeadings: number, allHeadings?: any[]): string {
    if (!fullBody || !fullBody.trim()) {
      return '';
    }

    // ✅ 0. 최우선: structuredContent에서 직접 본문 추출 (가장 확실한 방법)
    // heading.content가 있으면 바로 사용
    if (allHeadings && allHeadings[headingIndex] && allHeadings[headingIndex].content) {
      const directContent = allHeadings[headingIndex].content.trim();
      if (directContent.length > 30) {
        this.log(`   🎯 [본문추출] heading.content에서 직접 추출 성공: "${headingTitle}" (${directContent.length}자)`);
        return directContent;
      }
    }

    // ✅ 1. 간단한 방식: 전체 본문을 소제목 기준으로 분할
    // 모든 소제목 제목을 찾아서 본문을 구분
    if (allHeadings && allHeadings.length > 0) {
      const headingTitles = allHeadings.map(h => h.title);

      // 현재 소제목과 다음 소제목 사이의 내용 추출
      const currentTitle = headingTitle;
      const nextTitle = headingIndex < allHeadings.length - 1 ? allHeadings[headingIndex + 1].title : null;

      // "소제목: 내용" 형식으로 찾기
      const currentTitleEscaped = currentTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const currentPattern = new RegExp(`${currentTitleEscaped}\\s*:?\\s*`, 'i');
      const currentMatch = fullBody.match(currentPattern);

      if (currentMatch && currentMatch.index !== undefined) {
        const startIdx = currentMatch.index + currentMatch[0].length;
        let endIdx = fullBody.length;

        // 다음 소제목까지 찾기
        if (nextTitle) {
          const nextTitleEscaped = nextTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const nextPattern = new RegExp(`${nextTitleEscaped}\\s*:?\\s*`, 'i');
          const nextMatch = fullBody.substring(startIdx).match(nextPattern);
          if (nextMatch && nextMatch.index !== undefined) {
            endIdx = startIdx + nextMatch.index;
          }
        }

        // 마지막 소제목이면 끝까지 추출
        const extractedContent = fullBody.substring(startIdx, endIdx).trim();

        if (extractedContent.length > 30) {
          // 소제목 제목이 본문에 포함되어 있으면 제거
          const cleanContent = extractedContent
            .replace(new RegExp(`^\\s*${currentTitleEscaped}\\s*:?\\s*`, 'gi'), '')
            .trim();

          this.log(`   🎯 [본문추출] 소제목 기준 분할 성공: "${headingTitle}" (${cleanContent.length}자)`);
          return cleanContent;
        }
      }
    }

    // ✅ 개선된 로직: 정확한 소제목 매칭 및 본문 추출
    // 2. 정확한 소제목 패턴 찾기: "소제목: 내용..." 형식
    const escapedHeadingTitle = headingTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 정확한 매칭: 소제목이 줄의 시작 부분에 있고 콜론(:)이 바로 뒤에 오는 경우
    // 또는 소제목이 포함된 줄에서 콜론(:)이 바로 뒤에 오는 경우
    const exactPattern = new RegExp(`(^|\\n)\\s*${escapedHeadingTitle}\\s*:\\s*`, 'i');
    const match = fullBody.match(exactPattern);

    if (match && match.index !== undefined) {
      // 소제목을 찾았을 경우
      const startIndex = match.index + match[0].length;
      let content = fullBody.substring(startIndex);

      // 다음 소제목을 찾아서 중지
      const remainingHeadings: any[] = allHeadings?.filter((_, idx) => idx > headingIndex) || [];
      let endIndex = content.length;

      // ✅ 마무리 소제목이 마지막 소제목인 경우: 전체 본문의 마지막 부분을 가져옴
      const isLastHeading = headingIndex === totalHeadings - 1;
      const isClosingHeading = headingTitle.includes('마무리') || headingTitle.includes('결론');

      if (isLastHeading || isClosingHeading) {
        // 마지막 소제목이면 전체 본문의 마지막 부분을 가져옴
        // 다음 소제목을 찾지 않고 전체 내용 사용
        this.log(`   🔍 [마지막/마무리 소제목] 전체 본문의 마지막 부분 추출`);
      } else {
        // 다음 소제목들을 찾아서 가장 가까운 것을 찾음
        for (const nextHeading of remainingHeadings) {
          const nextEscaped = nextHeading.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const nextPattern = new RegExp(`(^|\\n)\\s*${nextEscaped}\\s*:\\s*`, 'i');
          const nextMatch = content.match(nextPattern);
          if (nextMatch && nextMatch.index !== undefined) {
            const nextIndex = nextMatch.index;
            if (nextIndex < endIndex) {
              endIndex = nextIndex;
            }
          }
        }
        content = content.substring(0, endIndex).trim();
      }

      // 소제목이 본문에 포함되어 있으면 제거 (중복 방지)
      let cleanContent = content
        .replace(new RegExp(`^\\s*${escapedHeadingTitle}\\s*:\\s*`, 'i'), '')
        .replace(new RegExp(`\\n\\s*${escapedHeadingTitle}\\s*:\\s*`, 'gi'), '\n')
        .trim();

      // ✅ 글 마지막에 중복된 CTA 텍스트 제거 (🔗 자세히 보기, 🔗 더 알아보기 등)
      cleanContent = cleanContent
        .replace(/\n+🔗\s*자세히\s*보기[^\n]*$/i, '') // 마지막 줄의 "🔗 자세히 보기" 제거
        .replace(/\n+🔗\s*더\s*알아보기[^\n]*$/i, '') // 마지막 줄의 "🔗 더 알아보기" 제거
        .replace(/\n+자세히\s*보기[^\n]*$/i, '') // 마지막 줄의 "자세히 보기" 제거
        .replace(/\n+더\s*알아보기[^\n]*$/i, '') // 마지막 줄의 "더 알아보기" 제거
        .trim();

      // ✅ 마무리 문구 패턴 제거 (부자연스러운 마무리 문구 정리)
      const closingPatterns = [
        /도움이\s*되었으면\s*좋겠습니다/gi,
        /참고하시길\s*바랍니다/gi,
        /함께\s*응원해요/gi,
        /화이팅/gi,
        /응원합니다/gi,
        /다음에\s*또\s*만나요/gi,
        /다음에\s*또\s*봬요/gi,
        /글을\s*마무리하겠습니다/gi,
        /글을\s*마칩니다/gi,
        /마무리하겠습니다/gi,
        /마무리합니다/gi,
        /기대하며\s*글을/gi,
        /기대하며\s*마무리/gi,
        /기대하며\s*마칩니다/gi,
        /승리를\s*기대하며/gi,
        /활약을\s*기대하며/gi,
        /정리하면/gi,
        /마지막으로/gi,
        /끝으로/gi,
        /요약하면/gi,
      ];

      // 마지막 500자 내에서 마무리 문구가 중복되면 제거
      const last500Chars = cleanContent.slice(-500);
      let closingCount = 0;
      for (const pattern of closingPatterns) {
        const matches = last500Chars.match(pattern);
        if (matches) {
          closingCount += matches.length;
        }
      }

      // 마무리 문구가 2개 이상이면 마지막 것만 남기고 제거
      if (closingCount > 1) {
        const lines = cleanContent.split('\n');
        const cleanedLines: string[] = [];
        let foundClosing = false;

        // 뒤에서부터 검사하여 마지막 마무리 문구만 유지
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          const hasClosing = closingPatterns.some(pattern => pattern.test(line));

          if (hasClosing) {
            if (!foundClosing) {
              // 첫 번째로 발견한 마무리 문구만 유지
              cleanedLines.unshift(line);
              foundClosing = true;
            }
            // 나머지 마무리 문구는 제거
          } else {
            cleanedLines.unshift(line);
          }
        }

        cleanContent = cleanedLines.join('\n').trim();
      }

      // ✅ 불필요한 문구 전체 제거 (본문 중간에도 있는 경우 제거)
      const unwantedPhrases = [
        /비즈니스\s*성장에\s*도움이\s*되길\s*바랍니다[^\n]*/gi,
        /비즈니스\s*성장에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /마케팅\s*활동에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /마케팅\s*활동에\s*도움이\s*되길\s*바랍니다[^\n]*/gi,
        /이\s*정보가\s*도움이\s*되셨기를\s*바랍니다[^\n]*/gi,
        /도움이\s*되셨기를\s*바랍니다[^\n]*/gi,
        // ✅ "도움이 되었으면" 모든 변형 제거 (오타 포함)
        /도움이\s*되(었|셧|셨)으면\s*좋겠(습니다|어요|다)[^\n]*/gi,
        /도움이\s*되(었|셧|셨)으면\s*(합니다|해요|한다)[^\n]*/gi,
        /도움이\s*되(었|셧|셨)으면[^\n]*/gi,
        /도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /도움이\s*되었으면\s*합니다[^\n]*/gi,
        /도움이\s*되셧으면\s*좋겠습니다[^\n]*/gi,
        /도움이\s*되셨으면\s*좋겠습니다[^\n]*/gi,
        /정보가\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /정보가\s*도움이\s*되셧으면\s*좋겠습니다[^\n]*/gi,
        /정보가\s*도움이\s*되셨으면\s*좋겠습니다[^\n]*/gi,
        /참고하시길\s*바랍니다[^\n]*/gi,
        /재태크에\s*도움되셧으면\s*좋겠습니다[^\n]*/gi,
        /재태크에\s*도움되셨으면\s*좋겠습니다[^\n]*/gi,
        /재태크에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /재태크에\s*도움이\s*되었으면\s*합니다[^\n]*/gi,
        /재테크에\s*도움되셧으면\s*좋겠습니다[^\n]*/gi,
        /재테크에\s*도움되셨으면\s*좋겠습니다[^\n]*/gi,
        /재테크에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /재테크에\s*도움이\s*되었으면\s*합니다[^\n]*/gi,
      ];

      // 본문 전체에서 불필요한 문구 제거 (줄 단위로)
      const lines = cleanContent.split('\n');
      const filteredLines: string[] = [];
      for (const line of lines) {
        let shouldRemove = false;
        for (const pattern of unwantedPhrases) {
          if (pattern.test(line)) {
            shouldRemove = true;
            break;
          }
        }
        if (!shouldRemove) {
          filteredLines.push(line);
        }
      }
      cleanContent = filteredLines.join('\n').trim();

      // ✅ 마지막 문단이 너무 짧거나 의미 없는 경우 제거 (5자 이하)
      const contentLines = cleanContent.split('\n');
      if (contentLines.length > 0) {
        const lastLine = contentLines[contentLines.length - 1].trim();
        if (lastLine.length <= 5 && closingPatterns.some(pattern => pattern.test(lastLine))) {
          contentLines.pop();
          cleanContent = contentLines.join('\n').trim();
        }
      }

      // ✅ 다른 소제목의 제목과 내용 제거 (중복 방지)
      // 예: "3개월 사용 후 솔직 후기: ..." 같은 다른 소제목 내용이 포함된 경우 제거
      if (allHeadings && allHeadings.length > 0) {
        for (const otherHeading of allHeadings) {
          if (otherHeading.title !== headingTitle) {
            const escapedOtherTitle = otherHeading.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // 다른 소제목 제목으로 시작하는 줄 전체 제거 (소제목: 내용 형식)
            cleanContent = cleanContent
              .replace(new RegExp(`^\\s*${escapedOtherTitle}\\s*:.*$`, 'gmi'), '') // 줄 시작에서
              .replace(new RegExp(`\\n\\s*${escapedOtherTitle}\\s*:.*$`, 'gmi'), '\n') // 줄 중간에서
              .replace(new RegExp(`${escapedOtherTitle}\\s*:.*?(\\n|$)`, 'gi'), '') // 일반 패턴
              .trim();

            // ✅ 마무리 소제목의 본문 내용이 앞 소제목에 포함된 경우 제거
            // "마무리: 내용..." 패턴이 본문 중간에 포함되어 있으면 제거
            if (otherHeading.title.includes('마무리') || otherHeading.title.includes('결론')) {
              // 마무리 소제목의 제목 패턴으로 시작하는 모든 줄 제거
              const closingPattern = /마무리\s*:|결론\s*:|끝으로\s*:|마지막으로\s*:/gi;
              const lines = cleanContent.split('\n');
              const filteredLines: string[] = [];
              let skipNextLines = false;
              let foundClosingTitle = false;

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // 마무리 소제목 제목이 발견되면 그 줄부터 끝까지 모두 제거
                if (closingPattern.test(line)) {
                  // 마무리 소제목 제목이 포함된 줄인지 확인
                  const titlePart = otherHeading.title.split(':')[0].trim();
                  if (line.includes(titlePart) || line.match(/마무리\s*:.*코스트코|결론\s*:/i)) {
                    foundClosingTitle = true;
                    skipNextLines = true;
                    continue; // 마무리 소제목 라인 자체는 제거
                  }
                }

                // 마무리 소제목 제목이 발견된 이후 모든 줄 제거
                if (foundClosingTitle || skipNextLines) {
                  // 마무리 소제목의 본문 내용인지 확인 (특정 키워드 포함 여부)
                  const hasClosingContent = /마무리|결론|끝으로|마지막으로|오늘\s*소개해\s*드린|어떠셨나요|꼭\s*한번|눈여겨보시고|현명한\s*쇼핑/i.test(line);
                  if (hasClosingContent) {
                    continue; // 마무리 내용 줄 제거
                  }
                  // 마무리 소제목 이후 모든 줄 제거
                  if (foundClosingTitle) {
                    continue;
                  }
                }

                filteredLines.push(line);
              }

              cleanContent = filteredLines.join('\n').trim();

              // ✅ 추가 필터링: 마무리 소제목 본문의 일반적인 패턴 제거
              cleanContent = cleanContent
                .replace(new RegExp(`오늘\\s*소개해\\s*드린[^\\n]*`, 'gi'), '')
                .replace(new RegExp(`어떠셨나요[^\\n]*`, 'gi'), '')
                .replace(new RegExp(`꼭\\s*한번[^\\n]*`, 'gi'), '')
                .replace(new RegExp(`눈여겨보시고[^\\n]*`, 'gi'), '')
                .replace(new RegExp(`현명한\\s*쇼핑[^\\n]*`, 'gi'), '')
                .trim();
            }
          }
        }
      }

      if (cleanContent.length > 0) {
        this.log(`   🔍 [본문추출] 정확한 패턴 매칭 성공: "${headingTitle}" (${cleanContent.length}자)`);
        return cleanContent;
      }
    }

    // 2. 패턴을 찾지 못한 경우: 줄 단위로 검색 (더 유연한 매칭)
    const lines = fullBody.split('\n');
    const extractedContent: string[] = [];
    let isCollecting = false;
    let foundHeading = false;

    // 남은 headings 정의
    const remainingHeadings: any[] = allHeadings?.filter((_, idx) => idx > headingIndex) || [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 정확한 heading 시작 감지 (이미 찾지 않은 경우에만)
      if (!foundHeading && line.includes(headingTitle)) {
        // 콜론(:)이 있는지 확인
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          // heading 제목이 콜론 앞에 있는지 확인
          const beforeColon = line.substring(0, colonIndex).trim();
          if (beforeColon.includes(headingTitle)) {
            isCollecting = true;
            foundHeading = true;
            // heading 라인은 제외하고 내용부터 수집
            const contentPart = line.substring(colonIndex + 1).trim();
            if (contentPart) {
              extractedContent.push(contentPart);
            }
            continue;
          }
        }
      }

      // 다른 heading을 만나면 중지 (마지막/마무리 소제목이면 중지하지 않음)
      const isLastHeading = headingIndex === totalHeadings - 1;
      const isClosingHeading = headingTitle.includes('마무리') || headingTitle.includes('결론');

      if (isCollecting && !isLastHeading && !isClosingHeading) {
        let isNextHeading = false;
        for (const nextHeading of remainingHeadings) {
          if (line.includes(nextHeading.title)) {
            const colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
              const beforeColon = line.substring(0, colonIndex).trim();
              if (beforeColon.includes(nextHeading.title)) {
                isNextHeading = true;
                break;
              }
            }
          }
        }

        if (isNextHeading) {
          break;
        }
      }

      // 본문 수집
      if (isCollecting && line.trim()) {
        // 소제목이 포함된 줄은 제외
        if (!line.includes(headingTitle) || line.indexOf(':') === -1) {
          extractedContent.push(line);
        }
      }
    }

    if (extractedContent.length > 0) {
      let result = extractedContent.join('\n').trim();
      // 소제목 제거 (중복 방지)
      result = result
        .replace(new RegExp(`^\\s*${escapedHeadingTitle}\\s*:\\s*`, 'i'), '')
        .replace(new RegExp(`\\n\\s*${escapedHeadingTitle}\\s*:\\s*`, 'gi'), '\n')
        .trim();

      // ✅ 다른 소제목의 제목과 내용 제거 (중복 방지)
      // 예: "3개월 사용 후 솔직 후기: ..." 같은 다른 소제목 내용이 포함된 경우 제거
      if (allHeadings && allHeadings.length > 0) {
        for (const otherHeading of allHeadings) {
          if (otherHeading.title !== headingTitle) {
            const escapedOtherTitle = otherHeading.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // 다른 소제목 제목으로 시작하는 줄 전체 제거 (소제목: 내용 형식)
            result = result
              .replace(new RegExp(`^\\s*${escapedOtherTitle}\\s*:.*$`, 'gmi'), '') // 줄 시작에서
              .replace(new RegExp(`\\n\\s*${escapedOtherTitle}\\s*:.*$`, 'gmi'), '\n') // 줄 중간에서
              .replace(new RegExp(`${escapedOtherTitle}\\s*:.*?(\\n|$)`, 'gi'), '') // 일반 패턴
              .trim();

            // ✅ 마무리 소제목의 본문 내용이 앞 소제목에 포함된 경우 제거
            if (otherHeading.title.includes('마무리') || otherHeading.title.includes('결론')) {
              const closingPattern = /마무리\s*:|결론\s*:|끝으로\s*:|마지막으로\s*:/gi;
              const resultLines = result.split('\n');
              const filteredLines: string[] = [];
              let skipNextLines = false;
              let foundClosingTitle = false;

              for (let i = 0; i < resultLines.length; i++) {
                const line = resultLines[i];

                // 마무리 소제목 제목이 발견되면 그 줄부터 끝까지 모두 제거
                if (closingPattern.test(line)) {
                  const titlePart = otherHeading.title.split(':')[0].trim();
                  if (line.includes(titlePart) || line.match(/마무리\s*:.*코스트코|결론\s*:/i)) {
                    foundClosingTitle = true;
                    skipNextLines = true;
                    continue;
                  }
                }

                // 마무리 소제목 제목이 발견된 이후 모든 줄 제거
                if (foundClosingTitle || skipNextLines) {
                  const hasClosingContent = /마무리|결론|끝으로|마지막으로|오늘\s*소개해\s*드린|어떠셨나요|꼭\s*한번|눈여겨보시고|현명한\s*쇼핑/i.test(line);
                  if (hasClosingContent || foundClosingTitle) {
                    continue;
                  }
                }

                filteredLines.push(line);
              }

              result = filteredLines.join('\n').trim();

              // ✅ 추가 필터링: 마무리 소제목 본문의 일반적인 패턴 제거
              result = result
                .replace(new RegExp(`오늘\\s*소개해\\s*드린[^\\n]*`, 'gi'), '')
                .replace(new RegExp(`어떠셨나요[^\\n]*`, 'gi'), '')
                .replace(new RegExp(`꼭\\s*한번[^\\n]*`, 'gi'), '')
                .replace(new RegExp(`눈여겨보시고[^\\n]*`, 'gi'), '')
                .replace(new RegExp(`현명한\\s*쇼핑[^\\n]*`, 'gi'), '')
                .trim();
            }
          }
        }
      }

      // ✅ 글 마지막에 중복된 CTA 텍스트 제거 (🔗 자세히 보기, 🔗 더 알아보기 등)
      result = result
        .replace(/\n+🔗\s*자세히\s*보기[^\n]*$/i, '') // 마지막 줄의 "🔗 자세히 보기" 제거
        .replace(/\n+🔗\s*더\s*알아보기[^\n]*$/i, '') // 마지막 줄의 "🔗 더 알아보기" 제거
        .replace(/\n+자세히\s*보기[^\n]*$/i, '') // 마지막 줄의 "자세히 보기" 제거
        .replace(/\n+더\s*알아보기[^\n]*$/i, '') // 마지막 줄의 "더 알아보기" 제거
        .trim();

      // ✅ 마무리 문구 패턴 제거 (부자연스러운 마무리 문구 정리)
      const closingPatterns = [
        /도움이\s*되었으면\s*좋겠습니다/gi,
        /참고하시길\s*바랍니다/gi,
        /함께\s*응원해요/gi,
        /화이팅/gi,
        /응원합니다/gi,
        /다음에\s*또\s*만나요/gi,
        /다음에\s*또\s*봬요/gi,
        /글을\s*마무리하겠습니다/gi,
        /글을\s*마칩니다/gi,
        /마무리하겠습니다/gi,
        /마무리합니다/gi,
        /기대하며\s*글을/gi,
        /기대하며\s*마무리/gi,
        /기대하며\s*마칩니다/gi,
        /승리를\s*기대하며/gi,
        /활약을\s*기대하며/gi,
        /정리하면/gi,
        /마지막으로/gi,
        /끝으로/gi,
        /요약하면/gi,
      ];

      // 마지막 500자 내에서 마무리 문구가 중복되면 제거
      const last500Chars = result.slice(-500);
      let closingCount = 0;
      for (const pattern of closingPatterns) {
        const matches = last500Chars.match(pattern);
        if (matches) {
          closingCount += matches.length;
        }
      }

      // 마무리 문구가 2개 이상이면 마지막 것만 남기고 제거
      if (closingCount > 1) {
        const resultLines = result.split('\n');
        const cleanedLines: string[] = [];
        let foundClosing = false;

        // 뒤에서부터 검사하여 마지막 마무리 문구만 유지
        for (let i = resultLines.length - 1; i >= 0; i--) {
          const line = resultLines[i];
          const hasClosing = closingPatterns.some(pattern => pattern.test(line));

          if (hasClosing) {
            if (!foundClosing) {
              // 첫 번째로 발견한 마무리 문구만 유지
              cleanedLines.unshift(line);
              foundClosing = true;
            }
            // 나머지 마무리 문구는 제거
          } else {
            cleanedLines.unshift(line);
          }
        }

        result = cleanedLines.join('\n').trim();
      }

      // ✅ 불필요한 문구 전체 제거 (본문 중간에도 있는 경우 제거)
      const unwantedPhrases = [
        /비즈니스\s*성장에\s*도움이\s*되길\s*바랍니다[^\n]*/gi,
        /비즈니스\s*성장에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /마케팅\s*활동에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /마케팅\s*활동에\s*도움이\s*되길\s*바랍니다[^\n]*/gi,
        /이\s*정보가\s*도움이\s*되셨기를\s*바랍니다[^\n]*/gi,
        /도움이\s*되셨기를\s*바랍니다[^\n]*/gi,
        // ✅ "도움이 되었으면" 모든 변형 제거 (오타 포함)
        /도움이\s*되(었|셧|셨)으면\s*좋겠(습니다|어요|다)[^\n]*/gi,
        /도움이\s*되(었|셧|셨)으면\s*(합니다|해요|한다)[^\n]*/gi,
        /도움이\s*되(었|셧|셨)으면[^\n]*/gi,
        /도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /도움이\s*되었으면\s*합니다[^\n]*/gi,
        /도움이\s*되셧으면\s*좋겠습니다[^\n]*/gi,
        /도움이\s*되셨으면\s*좋겠습니다[^\n]*/gi,
        /정보가\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /정보가\s*도움이\s*되셧으면\s*좋겠습니다[^\n]*/gi,
        /정보가\s*도움이\s*되셨으면\s*좋겠습니다[^\n]*/gi,
        /참고하시길\s*바랍니다[^\n]*/gi,
        /재태크에\s*도움되셧으면\s*좋겠습니다[^\n]*/gi,
        /재태크에\s*도움되셨으면\s*좋겠습니다[^\n]*/gi,
        /재태크에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /재태크에\s*도움이\s*되었으면\s*합니다[^\n]*/gi,
        /재테크에\s*도움되셧으면\s*좋겠습니다[^\n]*/gi,
        /재테크에\s*도움되셨으면\s*좋겠습니다[^\n]*/gi,
        /재테크에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
        /재테크에\s*도움이\s*되었으면\s*합니다[^\n]*/gi,
      ];

      // 본문 전체에서 불필요한 문구 제거 (줄 단위로)
      const resultLines2 = result.split('\n');
      const filteredLines2: string[] = [];
      for (const line of resultLines2) {
        let shouldRemove = false;
        for (const pattern of unwantedPhrases) {
          if (pattern.test(line)) {
            shouldRemove = true;
            break;
          }
        }
        if (!shouldRemove) {
          filteredLines2.push(line);
        }
      }
      result = filteredLines2.join('\n').trim();

      // ✅ 마지막 문단이 너무 짧거나 의미 없는 경우 제거 (5자 이하)
      const resultLines = result.split('\n');
      if (resultLines.length > 0) {
        const lastLine = resultLines[resultLines.length - 1].trim();
        if (lastLine.length <= 5 && closingPatterns.some(pattern => pattern.test(lastLine))) {
          resultLines.pop();
          result = resultLines.join('\n').trim();
        }
      }

      if (result.length > 0) {
        this.log(`   🔍 [본문추출] 줄 단위 검색 성공: "${headingTitle}" (${result.length}자)`);
        return result;
      }
    }

    // 3. 최후의 폴백: 기존 방식으로 균등 분배 (단순화)
    this.log(`   ⚠️ [본문추출] heading을 찾을 수 없어 균등 분배로 대체: "${headingTitle}"`);

    // 문단 분리: 빈 줄 또는 마침표+공백+대문자/한글로 시작
    const paragraphs = fullBody.split(/\n{2,}/).filter(p => p.trim());
    if (paragraphs.length === 0) {
      // 문단이 없으면 문장 단위로 분배
      const sentences = fullBody.split(/(?<=[.!?])\s+/).filter(s => s.trim());
      const sentencesPerHeading = Math.max(3, Math.ceil(sentences.length / totalHeadings));
      const startIdx = headingIndex * sentencesPerHeading;
      const endIdx = Math.min(startIdx + sentencesPerHeading, sentences.length);
      const result = sentences.slice(startIdx, endIdx).join(' ').trim();

      if (result.length > 0) {
        this.log(`   🔧 [본문추출] 문장 단위 균등 분배: "${headingTitle}" (${result.length}자)`);
        return result;
      }
      return '';
    }

    const paragraphsPerHeading = Math.max(1, Math.ceil(paragraphs.length / totalHeadings));
    const startIndex = headingIndex * paragraphsPerHeading;
    const endIndex = Math.min(startIndex + paragraphsPerHeading, paragraphs.length);
    const assignedParagraphs = paragraphs.slice(startIndex, endIndex);

    let result = assignedParagraphs.join('\n\n').trim();

    // ✅ 소제목 제거 (중복 방지) - 최소한의 정리만
    result = result
      .replace(new RegExp(`^\\s*${escapedHeadingTitle}\\s*:\\s*`, 'i'), '')
      .trim();

    // ✅ 결과가 비어있으면 원본 분배 결과 반환 (과도한 필터링 방지)
    if (result.length < 30 && assignedParagraphs.length > 0) {
      result = assignedParagraphs.join('\n\n').trim();
      this.log(`   🔧 [본문추출] 필터링 후 너무 짧아서 원본 사용: "${headingTitle}" (${result.length}자)`);
    } else {
      this.log(`   🔧 [본문추출] 균등 분배 완료: "${headingTitle}" (${result.length}자)`);
    }

    // ✅ 결과가 여전히 비어있으면 로깅만 하고 반환 (과도한 필터링 방지)
    if (result.length === 0) {
      this.log(`   ⚠️ [본문추출] 결과가 비어있습니다. 원본 텍스트의 일부를 사용합니다.`);
      // 균등 분배된 문단이 있으면 그대로 반환
      if (assignedParagraphs.length > 0) {
        return assignedParagraphs.join('\n\n').trim();
      }
    }

    // ✅ 최소한의 정리만 수행 (CTA 텍스트만 제거)
    result = result
      .replace(/\n*🔗[^\n]*$/i, '') // 마지막 CTA 제거
      .replace(/도움이\s*되(었|셧|셨)으면[^\n]*/gi, '') // "도움이 되었으면" 패턴만 제거
      .trim();

    // ✅ 필터링 후에도 본문이 비어있으면 원본 사용
    if (result.length < 20 && assignedParagraphs.length > 0) {
      this.log(`   ⚠️ [본문추출] 필터링 후 너무 짧음, 원본 사용`);
      return assignedParagraphs.join('\n\n').trim();
    }

    // ✅ 최종 결과 반환
    return result;
  }

  /**
   * 현재 커서 위치에 Base64 이미지를 직접 삽입
   * (텍스트 검색 없이 - 소제목 타이핑 직후 호출)
   */
  /**
   * 네이버 이미지 업로드 버튼을 통해 이미지 업로드 (가장 확실한 방법)
   */
  private async insertImageViaUploadButton(filePath: string): Promise<void> {
    return await imageHelpers.insertImageViaUploadButton(this, filePath);
  }

  /**
   * 네이버 이미지 버튼을 통해 이미지 업로드 (메인 방식)
   */
  private async insertBase64ImageAtCursor(filePath: string): Promise<void> {
    return await imageHelpers.insertBase64ImageAtCursor(this, filePath);
  }

  /**
   * ✅ [2026-02-26 NEW] 이미지 삽입 후 에디터에 실제 렌더링되었는지 검증
   * - 네이버 에디터는 비동기적으로 이미지를 업로드/렌더링하므로
   *   insertBase64ImageAtCursor 호출 후에도 이미지가 아직 표시되지 않을 수 있음
   * - 최대 5초간 500ms 간격으로 폴링하여 이미지 존재 확인
   */
  async verifyImageInserted(frame: any, label: string = '이미지'): Promise<boolean> {
    const MAX_POLLS = 10; // 최대 10회 (5초)
    const POLL_INTERVAL = 500; // 500ms 간격

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      try {
        const imageCount = await frame.evaluate(() => {
          const images = document.querySelectorAll('img.se-image-resource');
          return images.length;
        });

        if (imageCount > 0) {
          this.log(`   ✅ ${label} 삽입 검증 완료 (${imageCount}개 이미지 확인, ${attempt * POLL_INTERVAL}ms)`);
          return true;
        }
      } catch (e) {
        // frame 접근 실패 시 무시하고 재시도
      }

      if (attempt < MAX_POLLS - 1) {
        await this.delay(POLL_INTERVAL);
      }
    }

    this.log(`   ⚠️ ${label} 삽입 검증 실패 (5초 내 이미지 미발견) — 발행은 계속 진행`);
    return false;
  }

  /**
   * Base64 변환 방식으로 이미지 삽입 (클립보드 붙여넣기)
   */
  private async insertImageViaBase64(filePath: string, frame: Frame, page: Page): Promise<void> {
    return await imageHelpers.insertImageViaBase64(this, filePath, frame, page);
  }

  /**
   * 이미지 크기를 '문서 너비'로 설정 (안전 모드: DOM 스타일만 적용, 툴바 클릭 없음)
   */
  private async setImageSizeToDocumentWidth(): Promise<void> {
    return await imageHelpers.setImageSizeToDocumentWidth(this);
  }

  private async insertSingleImage(image: AutomationImage): Promise<void> {
    return await imageHelpers.insertSingleImage(this, image);
  }

  /**
   * 반자동 모드: 사용자가 선택한 이미지를 특정 소제목에 삽입
   */
  async insertImagesAtHeadings(placements: Array<{
    headingIndex: number;
    imageBase64: string;
    position: 'above' | 'below';
  }>): Promise<{ success: number; failed: number }> {
    const frame = (await this.getAttachedFrame());
    let success = 0;
    let failed = 0;

    // 역순으로 삽입 (마지막 소제목부터) - 인덱스가 밀리지 않도록
    const sorted = [...placements].sort((a, b) => b.headingIndex - a.headingIndex);

    for (const placement of sorted) {
      try {
        const result = await frame.evaluate((headingIndex: number, imgData: string, position: 'above' | 'below') => {
          // 소제목 요소 찾기
          const textComponents = document.querySelectorAll('.se-component.se-text');
          let targetComponent: Element | null = null;
          let foundIndex = 0;

          for (const comp of textComponents) {
            const text = comp.textContent?.trim() || '';
            // 24px 폰트 크기 확인 (소제목 특징)
            const fontSize = window.getComputedStyle(comp as HTMLElement).fontSize;
            if ((fontSize === '24px' || fontSize === '24.8px' || fontSize === '2.4rem') && text.length > 0) {
              if (foundIndex === headingIndex) {
                targetComponent = comp;
                break;
              }
              foundIndex++;
            }
          }

          if (!targetComponent) {
            console.error(`[이미지 삽입] 소제목을 찾을 수 없습니다: index ${headingIndex}`);
            return false;
          }

          // 이미지 컴포넌트 생성
          const seComponent = document.createElement('div');
          seComponent.className = 'se-component se-image se-l-default';
          seComponent.style.margin = '15px 0';

          const seComponentContent = document.createElement('div');
          seComponentContent.className = 'se-component-content';

          const seSection = document.createElement('div');
          seSection.className = 'se-section se-section-image se-l-default se-align-center';

          const seModule = document.createElement('div');
          seModule.className = 'se-module se-module-image';

          const seLink = document.createElement('a');
          seLink.className = 'se-module-image-link';
          seLink.setAttribute('data-linktype', 'img');

          const img = document.createElement('img');
          img.className = 'se-image-resource';
          img.src = imgData;
          img.setAttribute('data-width', 'original');
          img.setAttribute('data-height', 'original');
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.objectFit = 'contain';

          seLink.appendChild(img);
          seModule.appendChild(seLink);
          seSection.appendChild(seModule);
          seComponentContent.appendChild(seSection);
          seComponent.appendChild(seComponentContent);

          // 소제목 위 또는 아래에 삽입
          if (position === 'above') {
            if (targetComponent.previousSibling) {
              targetComponent.parentElement?.insertBefore(seComponent, targetComponent);
            } else {
              targetComponent.parentElement?.insertBefore(seComponent, targetComponent);
            }
          } else {
            // below (기본값)
            if (targetComponent.nextSibling) {
              targetComponent.parentElement?.insertBefore(seComponent, targetComponent.nextSibling);
            } else {
              targetComponent.parentElement?.appendChild(seComponent);
            }
          }

          console.log(`[이미지 삽입] ✅ 소제목 ${headingIndex} ${position === 'above' ? '위' : '아래'}에 이미지 삽입 완료`);
          return true;
        }, placement.headingIndex, placement.imageBase64, placement.position);

        if (result) {
          success++;
          this.log(`✅ 소제목 ${placement.headingIndex + 1}에 이미지 삽입 완료`);
          await this.delay(this.DELAYS.MEDIUM);
        } else {
          failed++;
          this.log(`⚠️ 소제목 ${placement.headingIndex + 1}에 이미지 삽입 실패`);
        }
      } catch (error) {
        failed++;
        this.log(`❌ 소제목 ${placement.headingIndex + 1} 이미지 삽입 오류: ${(error as Error).message}`);
      }
    }

    return { success, failed };
  }

  /**
   * 이미지 배치 검증 - 타이핑 완료 후 이미지가 제대로 들어갔는지 확인
   */
  private async verifyImagePlacement(images: AutomationImage[]): Promise<void> {
    await imageHelpers.verifyImagePlacement(this, images.length);
  }

  private async replaceEditorHtml(html: string): Promise<boolean> {
    const frame = (await this.getAttachedFrame());
    this.ensureNotCancelled();
    this.log('🔄 본문 HTML을 주입합니다...');

    try {
      const success = await frame.evaluate((markup) => {
        // 본문 영역 찾기: .se-section-text 내부의 .se-module-text 또는 .se-text-paragraph 요소
        const sectionText = document.querySelector('.se-section-text');
        if (!sectionText) {
          return false;
        }

        // 기존 placeholder 제거 및 본문 영역 정리
        const placeholder = sectionText.querySelector('.se-placeholder');
        if (placeholder) {
          const placeholderParent = placeholder.closest('.se-text-paragraph');
          if (placeholderParent) {
            placeholderParent.remove();
          }
        }

        // 본문 컨테이너 찾기: .se-module-text 또는 .se-text-paragraph의 부모
        // HTML 구조: .se-section-text > .se-module-text > .se-text-paragraph
        let contentContainer = sectionText.querySelector('.se-module-text') ||
          sectionText.querySelector('.se-module.se-module-text');

        // .se-module-text를 찾지 못한 경우, .se-text-paragraph를 직접 찾아서 그 부모 사용
        if (!contentContainer) {
          const firstParagraph = sectionText.querySelector('.se-text-paragraph');
          if (firstParagraph && firstParagraph.parentElement) {
            contentContainer = firstParagraph.parentElement;
          } else {
            // 최후의 수단: sectionText 자체 사용
            contentContainer = sectionText;
          }
        }

        // 기존 본문 내용 제거 (placeholder 제외, 빈 paragraph만 제거)
        const existingParagraphs = contentContainer.querySelectorAll('.se-text-paragraph');
        existingParagraphs.forEach((p) => {
          const hasPlaceholder = p.querySelector('.se-placeholder');
          const isEmpty = !p.textContent || p.textContent.trim() === '';
          // placeholder가 있거나 완전히 비어있는 paragraph만 제거
          if (hasPlaceholder || isEmpty) {
            p.remove();
          }
        });

        // 새 본문 HTML 삽입
        const temp = document.createElement('div');
        temp.innerHTML = markup;
        const fragment = document.createDocumentFragment();
        while (temp.firstChild) {
          fragment.appendChild(temp.firstChild);
        }
        contentContainer.appendChild(fragment);

        // 포커스 설정: 새로 삽입된 첫 번째 paragraph에 포커스
        const firstParagraph = contentContainer.querySelector('.se-text-paragraph');
        if (firstParagraph) {
          (firstParagraph as HTMLElement).focus();
          // 커서를 끝으로 이동
          const range = document.createRange();
          const selection = window.getSelection();
          if (selection) {
            range.selectNodeContents(firstParagraph);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }

        return true;
      }, html);
      return Boolean(success);
    } catch (error) {
      this.log(`⚠️ 본문 HTML 주입 중 오류: ${(error as Error).message}`);
      return false;
    }
  }

  private async applyHashtagsInBody(hashtags: string[]): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();
    this.ensureNotCancelled();
    if (!hashtags.length) {
      return;
    }

    // ✅ 안전 검사: 열린 패널/모달 닫기 (ABOUT, 지도, 함수 등 방지)
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Escape');
      await this.delay(50);
    }

    // 열린 패널 강제 닫기
    await frame.evaluate(() => {
      const panels = document.querySelectorAll('.se-popup, .se-panel, .se-layer, .se-modal, [class*="popup"], [class*="layer"]');
      panels.forEach(panel => {
        if (panel instanceof HTMLElement && panel.style.display !== 'none') {
          const closeBtn = panel.querySelector('button[class*="close"], .close, [aria-label*="닫기"]');
          if (closeBtn instanceof HTMLElement) {
            closeBtn.click();
          }
        }
      });
    }).catch(() => { });

    this.log('🔄 해시태그를 본문에 입력합니다...');

    try {
      // 해시태그 목록 준비
      const hashtagList = hashtags
        .map(tag => {
          const sanitized = tag.replace(/^#/, '').trim();
          return sanitized ? `#${sanitized}` : '';
        })
        .filter(Boolean);

      if (hashtagList.length > 0) {
        // ✅ 속도 최적화: 해시태그 2-3개씩 묶어서 입력
        const batchSize = 3;
        for (let i = 0; i < hashtagList.length; i += batchSize) {
          const batch = hashtagList.slice(i, i + batchSize).join(' ');

          // 배치 입력 (delay 40ms - 한글 조합에 충분하면서 빠름)
          await safeKeyboardType(page, batch, { delay: 40 });

          // 한글 조합 완료 대기 (최소화)
          await this.delay(80);

          // 다음 배치가 있으면 공백 추가
          if (i + batchSize < hashtagList.length) {
            await safeKeyboardType(page, ' ', { delay: 20 });
          }
        }

        this.log(`✅ 해시태그 입력 완료: ${hashtagList.join(' ')}`);
      }
    } catch (error) {
      this.log(`⚠️ 해시태그 입력 실패: ${(error as Error).message}`);
    }
  }

  // CTA 삽입 확인 함수
  private async verifyCtaInsertion(frame: any, ctaText: string): Promise<boolean> {
    try {
      const verified = await frame.evaluate((buttonText: string) => {
        // 여러 방법으로 CTA 버튼 확인
        const paragraphs = document.querySelectorAll('.se-text-paragraph');
        const allElements = document.querySelectorAll('.se-section-text *, .se-main-container *');

        // 1. paragraph 내에서 확인
        for (let i = paragraphs.length - 1; i >= 0; i--) {
          const p = paragraphs[i] as HTMLElement;
          const html = p.innerHTML || '';
          const text = p.innerText || p.textContent || '';

          // 다양한 패턴으로 확인
          if (html.includes(buttonText) ||
            text.includes(buttonText) ||
            html.includes('background:') ||
            html.includes('linear-gradient') ||
            html.includes('border-radius:') ||
            (html.includes('href=') && html.includes('display: inline-block')) ||
            (html.includes('href=') && html.includes('padding:'))) {
            console.log('[CTA 확인] ✅ CTA 버튼 발견:', buttonText);
            return true;
          }
        }

        // 2. 모든 요소에서 확인 (더 넓은 범위)
        for (const el of Array.from(allElements)) {
          const html = (el as HTMLElement).innerHTML || '';
          const text = (el as HTMLElement).innerText || (el as HTMLElement).textContent || '';

          if (html.includes(buttonText) ||
            text.includes(buttonText) ||
            (html.includes('href=') && (html.includes('background:') || html.includes('linear-gradient')))) {
            console.log('[CTA 확인] ✅ CTA 버튼 발견 (전체 검색):', buttonText);
            return true;
          }
        }

        console.log('[CTA 확인] ❌ CTA 버튼을 찾을 수 없습니다:', buttonText);
        return false;
      }, ctaText).catch(() => false);

      return verified || false;
    } catch (error) {
      this.log(`⚠️ CTA 확인 중 오류: ${(error as Error).message}`);
      return false;
    }
  }


  /**
   * ✅ 쇼핑커넥트 모드 전용 강력한 후킹 CTA 삽입 (구매 전환 최적화)
   * ✅ [개선] 텍스트 대신 시각적인 배너 이미지로 변경 - 클릭률 향상
   * @param url - 제휴 링크 URL
   * @param text - CTA 텍스트 (제품명)
   * @param previousPostTitle - 같은 카테고리 이전글 제목 (선택)
   * @param previousPostUrl - 같은 카테고리 이전글 URL (선택)
   * @param hashtags - 해시태그 배열 (선택)
   */
  private async insertEnhancedCta(
    url: string,
    hookText: string,
    productName: string, // ✅ [FIX] 현재 글 제목 (제품명)
    previousPostTitle?: string,
    previousPostUrl?: string,
    hashtags?: string[], // ✅ [추가] 해시태그 배열
    useAiBanner?: boolean, // ✅ [2026-01-18] AI 배너 생성 옵션
    customBannerPath?: string, // ✅ [2026-01-19] 커스텀 배너 경로 (쇼핑커넥트 배너 생성기)
    autoBannerGenerate?: boolean // ✅ [2026-01-21] 배너 자동 랜덤 생성 (연속발행용)
  ): Promise<void> {
    const page = this.ensurePage();
    this.ensureNotCancelled();

    if (!url || !hookText) {
      return;
    }

    // ✅ 안전 검사: 열린 패널/모달 닫기
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Escape');
      await this.delay(50);
    }

    // ✅ [FIX] 배너용 후킹 문구 (랜덤)
    const bannerHooks = [
      '✓ 할인가 확인하기 →',
      '[공식] 최저가 보러가기 →',
      '지금 바로 구매하기 →',
      '▶ 상품 자세히 보기',
      '할인 혜택 확인 →',
    ];
    const bannerHook = bannerHooks[Math.floor(Math.random() * bannerHooks.length)];

    // ✅ [신규] CTA용 후킹 문구 (배너와 다르게, 더 구체적이고 강력한 구매 결심 유도)
    const ctaHooks = [
      '🔥 지금 안사면 내일은 품절! 장바구니 담기',
      '💸 이 가격에 이 퀄리티? 리뷰 4.8점 인증 제품',
      '⚡ 오늘만 이 가격! 무료배송에 추가 할인까지',
      '🛒 수만 명이 선택한 인기템, 고민 말고 바로 구매',
      '💥 이번 달 가장 잘 팔린 베스트셀러, 놓치면 후회',
      '✨ 가성비 최고! 다른 제품과 비교 불가',
      '🎁 지금 구매하면 사은품 증정 이벤트 중',
      '🏃 남은 재고 얼마 없어요! 서두르세요',
    ];
    const ctaHook = ctaHooks[Math.floor(Math.random() * ctaHooks.length)];

    const displayProductName = productName || '상품 상세보기';

    this.log(`🔗 [Enhanced CTA] 배너+CTA 삽입 중: 배너="${bannerHook}", CTA="${ctaHook}" → ${url}`);

    try {
      // ✅ [2026-01-19] 커스텀 배너가 있으면 우선 사용 (쇼핑커넥트 배너 생성기로 만든 배너)
      let bannerImagePath: string;
      if (autoBannerGenerate) {
        // ✅ [2026-01-21] 연속발행: 매번 새로운 랜덤 배너 생성
        this.log(`   🎲 [연속발행] 랜덤 배너 자동 생성 중...`);
        bannerImagePath = await generateCtaBannerImage(bannerHook, displayProductName);
        this.log(`   ✅ [연속발행] 새 랜덤 배너 생성 완료: ${bannerImagePath.split(/[/\\\\]/).pop()}`);
      } else if (customBannerPath) {
        bannerImagePath = customBannerPath;
        this.log(`   🎨 커스텀 배너 사용: ${customBannerPath.split(/[/\\]/).pop()}`);
      } else if (useAiBanner) {
        // ✅ [2026-01-18] useAiBanner 옵션에 따라 AI 배너 생성
        const { generateCtaBannerWithAI } = await import('./image/nanoBananaProGenerator.js');
        const aiBannerPath = await generateCtaBannerWithAI(displayProductName, bannerHook);
        if (aiBannerPath) {
          bannerImagePath = aiBannerPath;
          this.log(`   🤖 AI CTA 배너 생성 완료: ${bannerImagePath}`);
        } else {
          bannerImagePath = await generateCtaBannerImage(bannerHook, displayProductName);
          this.log(`   📸 AI 실패 → HTML 배너로 폴백: ${bannerImagePath}`);
        }
      } else {
        bannerImagePath = await generateCtaBannerImage(bannerHook, displayProductName);
        this.log(`   📸 CTA 배너 이미지 생성 완료: ${bannerImagePath}`);
      }

      await page.keyboard.press('Enter'); // ✅ [2026-01-19] 엔터 1회로 축소
      await this.insertBase64ImageAtCursor(bannerImagePath);

      // ✅ 이미지 렌더링 완료 대기 (2초)
      this.log(`   ⏳ 배너 이미지 렌더링 대기 중...`);
      await this.delay(2000);

      // ✅ 배너 이미지에 제휴 링크 삽입
      await this.attachLinkToLastImage(url);
      this.log(`   ✅ 배너 이미지 + 제휴 링크 삽입 완료`);

      // ✅ [핵심] 이미지 선택 해제 - Escape 눌러서 커서를 텍스트 모드로 전환
      await page.keyboard.press('Escape');
      await this.delay(300);
      await page.keyboard.press('Escape');
      await this.delay(200);

      // ✅ 2. 구분선 삽입
      const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
      await page.keyboard.press('Enter'); // ✅ [2026-01-19] 엔터 1회로 축소
      await safeKeyboardType(page, divider, { delay: 5 });
      await page.keyboard.press('Enter');
      this.log(`   ✅ 구분선 1 삽입 완료`);

      // ✅ 3. [신규] CTA 텍스트 삽입 (📎 후킹문구 + 제휴링크)
      // 배너와 다른 강력한 구매 결심 유도 문구!
      this.log(`   🛒 CTA 텍스트 삽입 중: "${ctaHook}"`);
      await page.keyboard.press('Enter');
      await safeKeyboardType(page, `📎 ${ctaHook}`, { delay: 10 });
      await page.keyboard.press('Enter');
      await safeKeyboardType(page, `👉 ${url}`, { delay: 10 });
      await page.keyboard.press('Enter');
      this.log(`   ✅ CTA 텍스트 + 제휴링크 삽입 완료`);

      // ✅ 4. [신규] 링크 카드 로딩 대기 (polling 방식)
      this.log(`   ⏳ 링크 카드 로딩 대기 중...`);
      await this.waitForLinkCard(15000, 500);

      // ✅ [2026-01-19] 마지막 구분선 제거 - 추가 CTA/이전글에서 각자 구분선 삽입
      // 중복 구분선 방지

      // ✅ 6. 이전글 제목 + 링크 삽입 (구분선 포함)
      if (previousPostTitle && previousPostUrl) {
        this.log(`🔗 [이전글] 같은 카테고리 이전글 삽입 중: "${previousPostTitle}"`);

        // ✅ 이전글 전 구분선 삽입
        const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, divider, { delay: 5 });
        await page.keyboard.press('Enter');

        // ✅ [2026-01-23 FIX] 후킹 문구 + 이전글 제목
        const prevPostHooks = [
          '✨ 이런 글도 많이 봤어요!',
          '📚 다음 글도 궁금하다면?',
          '🔥 이 글도 인기 있어요!',
          '💡 맛있게 읽었다면 이것도!',
          '👀 놓치면 아까운 추천 글!',
        ];
        const randomPrevHook = prevPostHooks[Math.floor(Math.random() * prevPostHooks.length)];
        await safeKeyboardType(page, randomPrevHook, { delay: 10 });
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `📖 ${previousPostTitle}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `👉 ${previousPostUrl}`, { delay: 10 });
        await page.keyboard.press('Enter');
        this.log(`   ✅ 이전글 연결 완료 (후킹: ${randomPrevHook})`);


        // ✅ 7. [신규] 이전글 링크 카드 로딩 대기 (polling 방식)
        this.log(`   ⏳ 이전글 카드 로딩 대기 중...`);
        await this.waitForLinkCard(15000, 500);
      } else {
        this.log(`   ℹ️ 이전글 정보 없음 - 건너뜀`);
      }

      // ✅ [2026-01-18 수정] 해시태그는 본문 작성 후 별도로 삽입됨 (6291행)
      // 여기서는 엔터 5번만 추가하여 공간 확보
      this.log(`   📏 CTA 하단 여백 추가 (Enter 5회)...`);
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Enter');
        await this.delay(50);
      }
    } catch (error) {
      this.log(`⚠️ CTA 배너 생성/삽입 실패: ${(error as Error).message}`);
      // 폴백: 기존 텍스트 방식으로 삽입
      this.log(`   🔄 폴백: 텍스트 CTA로 대체합니다.`);
      try {
        const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, divider, { delay: 5 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, ctaHook, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `🔗 ${displayProductName}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `👉 ${url}`, { delay: 10 });
        await page.keyboard.press('Enter');
        this.log(`   ✅ 텍스트 CTA 폴백 완료`);
      } catch (fallbackError) {
        this.log(`⚠️ 텍스트 CTA 폴백도 실패: ${(fallbackError as Error).message}`);
      }
    }
  }

  private async insertCtaLink(url: string, text: string, position: 'heading' | 'bottom' = 'bottom'): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();
    this.ensureNotCancelled();

    if (!text) {
      return;
    }

    // ✅ 안전 검사: 열린 패널/모달 닫기 (ABOUT, 지도, 함수 등 방지)
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Escape');
      await this.delay(50);
    }

    // 열린 패널 강제 닫기
    await frame.evaluate(() => {
      const panels = document.querySelectorAll('.se-popup, .se-panel, .se-layer, .se-modal, [class*="popup"], [class*="layer"]');
      panels.forEach(panel => {
        if (panel instanceof HTMLElement && panel.style.display !== 'none') {
          const closeBtn = panel.querySelector('button[class*="close"], .close, [aria-label*="닫기"]');
          if (closeBtn instanceof HTMLElement) {
            closeBtn.click();
          }
        }
      });
    }).catch(() => { });

    // URL이 없으면 텍스트만 표시
    const finalUrl = url || '#';

    // ✅ [수정] CTA 텍스트에서 줄바꿈 문자 제거 (형식 깨짐 방지)
    const cleanText = text.replace(/[\r\n]+/g, ' ').trim();

    this.log(`🔗 CTA 텍스트 삽입 중: ${cleanText} → ${finalUrl} (위치: ${position})`);

    try {
      // ✅ 네이버 블로그용 텍스트 형식 CTA (세로 정렬)
      const divider = '━━━━━━━━━━━━━━━━━━━';

      if (position === 'heading') {
        this.log(`   → 소제목 아래 CTA 텍스트 삽입 중...`);
        await safeKeyboardType(page, divider, { delay: 5 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `🔗 ${cleanText}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `👉 ${finalUrl}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
      } else {
        this.log(`   → 하단 위치에 CTA 텍스트 삽입 중...`);
        await safeKeyboardType(page, divider, { delay: 5 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `🔗 ${cleanText}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `👉 ${finalUrl}`, { delay: 10 });
        await page.keyboard.press('Enter');
      }

      await this.delay(300);
      this.log(`   ✅ CTA 텍스트 삽입 완료 (세로 정렬)`)

    } catch (error) {
      this.log(`⚠️ CTA 버튼 삽입 실패: ${(error as Error).message}`);
      // 실패해도 계속 진행
    }
  }

  // 상단에 CTA 삽입
  private async insertCtaHtmlAtTop(frame: any, html: string): Promise<void> {
    // 줄바꿈 2회 (제목과 CTA 사이 간격)
    const page = this.ensurePage();
    await page.keyboard.press('Enter');
    await this.delay(15);
    await page.keyboard.press('Enter');
    await this.delay(15);

    const success = await frame.evaluate((markup: string) => {
      const sectionText = document.querySelector('.se-section-text');
      if (!sectionText) {
        console.error('[CTA] .se-section-text를 찾을 수 없습니다');
        return false;
      }

      let contentContainer = sectionText.querySelector('.se-module-text') ||
        sectionText.querySelector('.se-module.se-module-text');

      if (!contentContainer) {
        const firstParagraph = sectionText.querySelector('.se-text-paragraph');
        if (firstParagraph && firstParagraph.parentElement) {
          contentContainer = firstParagraph.parentElement;
        } else {
          contentContainer = sectionText;
        }
      }

      const temp = document.createElement('div');
      temp.innerHTML = markup;
      const fragment = document.createDocumentFragment();
      while (temp.firstChild) {
        fragment.appendChild(temp.firstChild);
      }

      // 새로운 paragraph 생성
      const newParagraph = document.createElement('div');
      newParagraph.className = 'se-text-paragraph';
      newParagraph.setAttribute('data-module', 'se2_text_paragraph');
      newParagraph.appendChild(fragment);

      // 첫 번째 paragraph 앞에 삽입
      const firstParagraph = contentContainer.querySelector('.se-text-paragraph');
      if (firstParagraph && firstParagraph.parentElement) {
        firstParagraph.parentElement.insertBefore(newParagraph, firstParagraph);
      } else {
        contentContainer.insertBefore(newParagraph, contentContainer.firstChild);
      }

      // 에디터에 변경사항 알리기
      const event = new Event('input', { bubbles: true });
      newParagraph.dispatchEvent(event);

      return true;
    }, html);

    if (!success) {
      throw new Error('상단에 CTA 삽입 실패');
    }

    await this.delay(100);
  }

  // 중간에 CTA 삽입
  private async insertCtaHtmlInMiddle(frame: any, html: string): Promise<void> {
    // 줄바꿈 2회 (본문과 CTA 사이 간격)
    const page = this.ensurePage();
    await page.keyboard.press('Enter');
    await this.delay(15);
    await page.keyboard.press('Enter');
    await this.delay(15);

    const success = await frame.evaluate((markup: string) => {
      const sectionText = document.querySelector('.se-section-text');
      if (!sectionText) {
        console.error('[CTA] .se-section-text를 찾을 수 없습니다');
        return false;
      }

      let contentContainer = sectionText.querySelector('.se-module-text') ||
        sectionText.querySelector('.se-module.se-module-text');

      if (!contentContainer) {
        const firstParagraph = sectionText.querySelector('.se-text-paragraph');
        if (firstParagraph && firstParagraph.parentElement) {
          contentContainer = firstParagraph.parentElement;
        } else {
          contentContainer = sectionText;
        }
      }

      const paragraphs = Array.from(contentContainer.querySelectorAll('.se-text-paragraph'));
      if (paragraphs.length === 0) {
        console.error('[CTA] paragraph를 찾을 수 없습니다');
        return false;
      }

      // 중간 지점 계산
      const middleIndex = Math.floor(paragraphs.length / 2);
      const targetParagraph = paragraphs[middleIndex] as HTMLElement;

      const temp = document.createElement('div');
      temp.innerHTML = markup;
      const fragment = document.createDocumentFragment();
      while (temp.firstChild) {
        fragment.appendChild(temp.firstChild);
      }

      // 새로운 paragraph 생성
      const newParagraph = document.createElement('div');
      newParagraph.className = 'se-text-paragraph';
      newParagraph.setAttribute('data-module', 'se2_text_paragraph');
      newParagraph.appendChild(fragment);

      // 중간 paragraph 다음에 삽입
      if (targetParagraph.parentElement) {
        targetParagraph.parentElement.insertBefore(newParagraph, targetParagraph.nextSibling);
      } else {
        contentContainer.appendChild(newParagraph);
      }

      // 에디터에 변경사항 알리기
      const event = new Event('input', { bubbles: true });
      newParagraph.dispatchEvent(event);

      return true;
    }, html);

    if (!success) {
      throw new Error('중간에 CTA 삽입 실패');
    }

    await this.delay(100);
  }

  // 하단에 CTA 삽입
  private async insertCtaHtmlAtBottom(frame: any, page: any, html: string): Promise<void> {
    this.log(`🔗 CTA 버튼 HTML 삽입 시작...`);

    // 줄바꿈 2회 (해시태그와 CTA 사이 간격)
    await page.keyboard.press('Enter');
    await this.delay(100);
    await page.keyboard.press('Enter');
    await this.delay(100);

    // HTML에서 텍스트와 링크 추출
    const textMatch = html.match(/<a[^>]*>([^<]+)<\/a>/);
    const linkMatch = html.match(/href=["']([^"']+)["']/);
    const ctaText = textMatch ? textMatch[1] : '더 알아보기';
    const ctaLink = linkMatch ? linkMatch[1] : '#';

    this.log(`   → CTA 텍스트: "${ctaText}", 링크: "${ctaLink}"`);

    // 여러 방법으로 시도 (최대 3회)
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      this.log(`   → 삽입 시도 ${attempt}/3...`);

      // 방법 1: 네이버 에디터 구조에 맞게 직접 DOM 삽입
      const result = await frame.evaluate((markup: string, buttonText: string) => {
        try {
          // 네이버 블로그 에디터 구조에 맞게 삽입
          const sectionText = document.querySelector('.se-section-text') ||
            document.querySelector('.se-main-container') ||
            document.querySelector('[contenteditable="true"]');

          if (!sectionText) {
            console.error('[CTA] 에디터 영역을 찾을 수 없습니다');
            return { success: false, method: 'no-editor' };
          }

          // 본문 컨테이너 찾기
          let contentContainer: Element | null = sectionText.querySelector('.se-module-text') ||
            sectionText.querySelector('.se-module.se-module-text') ||
            sectionText.querySelector('.se-component-content') ||
            sectionText;

          if (!contentContainer) {
            const firstParagraph = sectionText.querySelector('.se-text-paragraph');
            if (firstParagraph && firstParagraph.parentElement) {
              contentContainer = firstParagraph.parentElement;
            } else {
              contentContainer = sectionText;
            }
          }

          // 마지막 paragraph 찾기
          const paragraphs = contentContainer.querySelectorAll('.se-text-paragraph');
          let insertAfter: Element | null = null;

          if (paragraphs.length > 0) {
            insertAfter = paragraphs[paragraphs.length - 1];
          }

          // HTML 파싱하여 버튼 생성
          const temp = document.createElement('div');
          temp.innerHTML = markup.trim();
          const buttonElement = temp.querySelector('a') || temp.firstElementChild;

          if (!buttonElement) {
            console.error('[CTA] 버튼 요소를 생성할 수 없습니다');
            return { success: false, method: 'no-button' };
          }

          // 네이버 에디터 구조에 맞는 paragraph 생성
          const newParagraph = document.createElement('div');
          newParagraph.className = 'se-text-paragraph';
          newParagraph.setAttribute('data-module', 'se2_text_paragraph');
          newParagraph.style.textAlign = 'center';
          newParagraph.style.margin = '40px 0';

          // 버튼을 paragraph 안에 삽입
          newParagraph.appendChild(buttonElement.cloneNode(true) as Node);

          // 마지막 paragraph 다음에 삽입
          if (insertAfter && insertAfter.parentElement) {
            insertAfter.parentElement.insertBefore(newParagraph, insertAfter.nextSibling);
          } else {
            contentContainer.appendChild(newParagraph);
          }

          // 에디터에 변경사항 알리기
          const events = ['input', 'change', 'keyup', 'blur'];
          events.forEach(eventType => {
            const event = new Event(eventType, { bubbles: true, cancelable: true });
            newParagraph.dispatchEvent(event);
            contentContainer?.dispatchEvent(event);
          });

          // 네이버 에디터 내부 업데이트 시도
          try {
            const editor = (window as any).editor ||
              (window as any).se2Editor ||
              (window as any).__se2Editor__;
            if (editor) {
              if (typeof editor.update === 'function') editor.update();
              if (typeof editor.sync === 'function') editor.sync();
              if (typeof editor.triggerChange === 'function') editor.triggerChange();
            }
          } catch (e) {
            console.log('[CTA] 에디터 업데이트 함수 호출 실패 (무시)');
          }

          // 삽입 확인 - 실제로 DOM에 있는지 체크 (바로 확인)
          const insertedElements = contentContainer.querySelectorAll('.se-text-paragraph');
          for (let i = insertedElements.length - 1; i >= 0; i--) {
            const p = insertedElements[i] as HTMLElement;
            const innerHTML = p.innerHTML || '';
            if (innerHTML.includes(buttonText) ||
              innerHTML.includes('background:') ||
              innerHTML.includes('linear-gradient') ||
              innerHTML.includes('href=')) {
              return { success: true, method: 'direct-insert' };
            }
          }

          return { success: false, method: 'not-found' };
        } catch (error) {
          console.error('[CTA] 삽입 중 오류:', error);
          return { success: false, method: 'error', error: String(error) };
        }
      }, html, ctaText).catch(() => ({ success: false, method: 'exception' }));

      if (result && result.success) {
        this.log(`   ✅ CTA 버튼 삽입 성공 (방법: ${result.method})`);
        success = true;
        break;
      } else {
        this.log(`   ⚠️ 삽입 시도 ${attempt} 실패 (방법: ${result?.method || 'unknown'})`);
        await this.delay(500);
      }
    }

    if (!success) {
      this.log(`⚠️ 직접 삽입 실패, 타이핑 방식으로 재시도...`);
      await this.insertCtaViaTyping(page, html);
    } else {
      // 삽입 확인 (더 강력한 확인)
      await this.delay(500);
      const verified = await frame.evaluate((buttonText: string) => {
        const paragraphs = document.querySelectorAll('.se-text-paragraph');
        for (let i = paragraphs.length - 1; i >= 0; i--) {
          const p = paragraphs[i] as HTMLElement;
          const html = p.innerHTML || '';
          // 다양한 패턴으로 확인
          if (html.includes(buttonText) ||
            html.includes('background:') ||
            html.includes('linear-gradient') ||
            html.includes('border-radius:') ||
            (html.includes('href=') && html.includes('display: inline-block'))) {
            return true;
          }
        }
        return false;
      }, ctaText).catch(() => false);

      if (!verified) {
        this.log(`⚠️ CTA 삽입 확인 실패, 최종 재시도...`);
        await this.delay(300);
        await this.insertCtaViaTyping(page, html);
      } else {
        this.log(`   ✅ CTA 버튼 삽입 및 확인 완료`);
      }
    }

    // 삽입 후 충분한 대기 (에디터 렌더링 대기)
    await this.delay(500);
  }

  // 타이핑 방식으로 CTA 삽입 (폴백)
  private async insertCtaViaTyping(page: any, html: string): Promise<void> {
    try {
      // HTML에서 텍스트와 링크 추출
      const match = html.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/);
      if (!match) {
        throw new Error('CTA HTML 파싱 실패');
      }

      const link = match[1];
      const text = match[2];

      // 텍스트 입력
      await safeKeyboardType(page, text, { delay: 30 });
      await this.delay(100);

      // 텍스트 선택
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await this.delay(100);

      // 링크 버튼 찾기 및 클릭
      const frame = (await this.getAttachedFrame());
      const linkButtonSelectors = [
        'button.se-toolbar-button[data-name="link"]',
        'button[data-name="link"]',
        'button[aria-label*="링크"]',
        'button[aria-label*="Link"]',
      ];

      for (const selector of linkButtonSelectors) {
        try {
          const linkButton = await frame.$(selector).catch(() => null);
          if (linkButton) {
            await linkButton.click();
            await this.delay(200);

            // 링크 입력 필드 찾기
            const linkInput = await frame.$('input[type="url"], input[placeholder*="링크"], input[placeholder*="URL"]').catch(() => null);
            if (linkInput) {
              await linkInput.click();
              await this.delay(50);
              await linkInput.type(link, { delay: 30 });
              await this.delay(100);

              // 확인 버튼 클릭
              const confirmButton = await frame.$('button:has-text("확인"), button:has-text("OK"), button[type="submit"]').catch(() => null);
              if (confirmButton) {
                await confirmButton.click();
                await this.delay(200);
              }
            }
            break;
          }
        } catch {
          continue;
        }
      }

      // 중앙 정렬
      await page.keyboard.down('Control');
      await page.keyboard.press('e');
      await page.keyboard.up('Control');
      await this.delay(100);

    } catch (error) {
      this.log(`⚠️ 타이핑 방식 CTA 삽입도 실패: ${(error as Error).message}`);
    }
  }

  /**
   * 현재 커서 위치에 이미지 여러 개를 순차적으로 삽입
   * ✅ [2026-01-20 개선] 재시도 로직 + 안정성 강화
   */
  private async insertImagesAtCurrentCursor(images: any[], page: Page, frame: Frame, affiliateLink?: string): Promise<void> {
    return await imageHelpers.insertImagesAtCurrentCursor(this, images, affiliateLink);
  }

  /**
   * ✅ [신규] 문서너비 맞추기 + 바로 링크 삽입 (물리 마우스 클릭 적용!)
   */
  private async setImageSizeAndAttachLink(link: string): Promise<void> {
    return await imageHelpers.setImageSizeAndAttachLink(this, link);
  }

  // ✅ 이미지에 링크 삽입 (쇼핑커넥트용) - 강화된 버전
  private async attachLinkToLastImage(link: string): Promise<void> {
    return await imageHelpers.attachLinkToLastImage(this, link);
  }

  private async insertImages(images: AutomationImage[], plans: ImagePlan[]): Promise<void> {
    return await imageHelpers.insertImages(this, images, plans);
  }

  /**
   * ✅ 이미지 alt 태그에 출처 정보 자동 추가
   * 형식: "소제목 | 출처: Provider명 (URL)"
   */
  private generateAltWithSource(image: any): string {
    return imageHelpers.generateAltWithSource(this, image);
  }

  private async applyCaption(caption: string): Promise<void> {
    return await imageHelpers.applyCaption(this, caption);
  }

  private async findElement(frame: Frame, selectors: string[]): Promise<ElementHandle<Element> | null> {
    for (const selector of selectors) {
      const handle = await frame.$(selector);
      if (handle) {
        return handle;
      }
    }
    return null;
  }

  /**
   * 현재 activeElement 기준으로 소제목 바로 다음 본문 영역 찾기 (인용구 없음)
   */
  private async findNextBodyElement(frame: Frame): Promise<ElementHandle<Node> | null> {
    const handle = await frame.evaluateHandle(() => {
      const activeElement = document.activeElement;
      if (!activeElement) return null;

      // 현재 activeElement가 있는 컴포넌트 찾기
      let currentComponent = activeElement.closest('.se-component') as HTMLElement | null;
      if (!currentComponent) {
        let current = activeElement.parentElement;
        while (current) {
          if (current.classList.contains('se-component')) {
            currentComponent = current as HTMLElement;
            break;
          }
          current = current.parentElement;
        }
      }

      // 현재 컴포넌트의 다음 형제 컴포넌트 찾기 (소제목 바로 아래 본문)
      if (currentComponent) {
        let nextSibling = currentComponent.nextElementSibling;
        while (nextSibling) {
          // 텍스트 컴포넌트인지 확인
          if (nextSibling.classList.contains('se-component') &&
            nextSibling.classList.contains('se-text')) {
            // 인용구가 아닌 본문 컴포넌트인지 확인
            const hasBlockquote = nextSibling.querySelector('.se-blockquote, .se-component-blockquote');
            if (!hasBlockquote) {
              // 본문 영역 요소 찾기
              const section = nextSibling.querySelector('.se-section.se-section-text.se-l-default, .se-section.se-section-text');
              if (section) return section;
              const module = nextSibling.querySelector('.se-module.se-module-text');
              if (module) return module;
              const paragraph = nextSibling.querySelector('p.se-text-paragraph');
              if (paragraph) return paragraph;
              return nextSibling;
            }
          }
          nextSibling = nextSibling.nextElementSibling;
        }
      }

      // 폴백: 가장 아래쪽 본문 영역 (소제목 근처, placeholder 우선)
      const allBodySections = document.querySelectorAll('.se-section.se-section-text.se-l-default, .se-section.se-section-text');
      let candidate: HTMLElement | null = null;
      // 배열의 마지막 요소부터 확인 (최근에 생성된 본문 영역, 소제목 근처)
      for (let i = allBodySections.length - 1; i >= 0; i--) {
        const section = allBodySections[i] as HTMLElement;
        const isInBlockquote = section.closest('.se-blockquote, .se-component-blockquote');
        if (!isInBlockquote) {
          // placeholder가 있으면 우선 선택 (새로운 본문 영역)
          const hasPlaceholder = section.querySelector('.se-placeholder') !== null;
          if (hasPlaceholder) {
            return section;
          }
          // placeholder가 없으면 후보로 저장
          if (!candidate) {
            candidate = section;
          }
        }
      }

      // 후보가 있으면 반환
      return candidate;
    }).catch(() => null);
    if (handle && handle.asElement()) {
      return handle.asElement()!;
    }
    return null;
  }

  /**
   * 구분선 추가
   */
  private async insertHorizontalLine(): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    try {
      // ✅ 안전 검사: 열린 패널/모달 닫기 (ABOUT, 지도, 함수 등 방지)
      await page.keyboard.press('Escape');
      await this.delay(50);

      // 열린 패널 강제 닫기
      await frame.evaluate(() => {
        const panels = document.querySelectorAll('.se-popup, .se-panel, .se-layer, .se-modal, [class*="popup"], [class*="layer"]');
        panels.forEach(panel => {
          if (panel instanceof HTMLElement && panel.style.display !== 'none') {
            const closeBtn = panel.querySelector('button[class*="close"], .close, [aria-label*="닫기"]');
            if (closeBtn instanceof HTMLElement) {
              closeBtn.click();
            }
          }
        });
      }).catch(() => { });

      // 구분선 버튼 찾기
      const horizontalLineButton = await frame.$(
        'button.se-insert-horizontal-line-default-toolbar-button[data-name="horizontal-line"]'
      ).catch(() => null);

      if (horizontalLineButton) {
        // 버튼이 보이는지 확인
        const isVisible = await horizontalLineButton.isIntersectingViewport().catch(() => false);
        if (!isVisible) {
          await horizontalLineButton.evaluate((el: Element) => {
            (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          await this.delay(this.DELAYS.MEDIUM);
        }

        // 버튼 클릭
        try {
          await horizontalLineButton.click({ delay: 50 });
          await this.delay(this.DELAYS.MEDIUM);
          this.log(`   ✅ 구분선 추가 완료`);
        } catch {
          // JavaScript 클릭 시도
          await horizontalLineButton.evaluate((el: Element) => {
            (el as HTMLElement).click();
          });
          await this.delay(this.DELAYS.MEDIUM);
          this.log(`   ✅ 구분선 추가 완료 (폴백)`);
        }
      } else {
        this.log(`   ⚠️ 구분선 버튼을 찾지 못했습니다. 계속 진행합니다.`);
      }
    } catch (error) {
      this.log(`   ⚠️ 구분선 추가 실패: ${(error as Error).message}`);
    }
  }

  /**
   * 본문 영역 요소를 클릭하고 포커스 설정
   */
  private async clickBodyElement(
    frame: Frame,
    bodyElement: ElementHandle<Node>,
    retryCount?: number
  ): Promise<boolean> {
    try {
      const element = bodyElement.asElement();
      if (!element) return false;

      // JavaScript로 직접 스크롤하고 클릭
      await element.evaluate((el: Node) => {
        if (el instanceof HTMLElement) {
          const clickable = el.querySelector('p.se-text-paragraph, span.se-placeholder, span.__se-node') || el;
          if (clickable instanceof HTMLElement) {
            clickable.scrollIntoView({ behavior: 'smooth', block: 'center' });
            clickable.click();
          }
        }
      });
      await this.delay(this.DELAYS.MEDIUM);

      // 포커스 확인
      const isInBody = await frame.evaluate(() => {
        const activeElement = document.activeElement;
        if (!activeElement) return false;

        // 제목 영역 확인
        const titleInput = document.querySelector('.se-title-input, input[placeholder*="제목"], .se-title');
        if (titleInput && (activeElement === titleInput || titleInput.contains(activeElement))) {
          return false;
        }

        // 인용구 내부인지 확인
        let current = activeElement as HTMLElement | null;
        while (current) {
          if (current.classList.contains('se-blockquote') ||
            current.classList.contains('se-component-blockquote')) {
            return false;
          }
          current = current.parentElement;
        }

        // 본문 영역인지 확인
        return activeElement.closest('.se-text-paragraph, .se-module-text, .se-section-text') !== null;
      }).catch(() => false);

      if (isInBody) {
        if (retryCount !== undefined) {
          this.log(`   ✅ 본문 영역 클릭 완료 (시도 ${retryCount + 1})`);
        }
        return true;
      }

      // 포커스가 없으면 MouseEvent로 재시도
      await element.evaluate((el: Node) => {
        if (el instanceof HTMLElement) {
          const clickable = el.querySelector('p.se-text-paragraph, span.se-placeholder, span.__se-node') || el;
          if (clickable instanceof HTMLElement) {
            const event = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true,
            });
            clickable.dispatchEvent(event);
            clickable.focus();
          }
        }
      });
      await this.delay(this.DELAYS.MEDIUM);
      return true;
    } catch (error) {
      this.log(`   ⚠️ 본문 영역 클릭 실패: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 브라우저를 닫지 않고 포스팅만 수행 (엑셀 포스팅용)
   */
  async runPostOnly(runOptions: RunOptions = {}, keepBrowserOpen: boolean = true): Promise<void> {
    this.cancelRequested = false;
    const resolvedOptions = this.resolveRunOptions(runOptions);

    // ✅ [2026-02-15 FIX] RunOptions에서 전달된 categoryName을 this.options에 동기화
    if (resolvedOptions.categoryName) {
      this.options.categoryName = resolvedOptions.categoryName;
    }

    try {
      // 브라우저가 없으면 새로 설정
      if (!this.browser) {
        this.log('🚀 브라우저 초기화 중...');
        await this.setupBrowser();
        await this.loginToNaver();
      }

      // 글쓰기 페이지로 이동
      await this.navigateToBlogWrite();
      await this.switchToMainFrame();

      // 팝업이 완전히 렌더링될 때까지 대기 (최적화)
      await this.delay(1000); // 2000ms → 1000ms

      // 1단계: 작성중인 글 팝업 먼저 닫기
      await this.closeDraftPopup();
      await this.delay(this.DELAYS.MEDIUM); // 500ms → 300ms

      // 2단계: 도움말 패널 닫기
      await this.closePopups();

      if (resolvedOptions.structuredContent) {
        await this.applyStructuredContent(resolvedOptions);
      } else {
        await this.applyPlainContent(resolvedOptions);
      }

      await this.publishBlogPost(resolvedOptions.publishMode, resolvedOptions.scheduleDate, resolvedOptions.scheduleMethod);
      this.log('🎉 포스팅이 성공적으로 완료되었습니다!');
      const modeText = resolvedOptions.publishMode === 'draft' ? '임시저장' :
        resolvedOptions.publishMode === 'publish' ? '즉시발행' :
          `예약발행 (${resolvedOptions.scheduleDate})`;
      this.log(`💡 블로그 글이 자동으로 작성되고 ${modeText}되었습니다.`);
    } catch (error) {
      if ((error as Error).message === '사용자가 자동화를 취소했습니다.') {
        this.log('⏹️ 사용자가 자동화를 취소했습니다.');
      }
      throw error;
    } finally {
      // keepBrowserOpen이 false이거나 오류 발생 시에만 브라우저 종료
      if (!keepBrowserOpen && this.browser) {
        this.log('⏳ 브라우저 종료 중...');
        await this.browser.close().catch(() => undefined);
        this.browser = null;
        this.page = null;
        this.mainFrame = null;
        this.log('🔚 브라우저가 종료되었습니다.');
      }
    }
  }

  /**
   * 브라우저를 닫는 메서드 (엑셀 포스팅 완료 후 호출)
   */
  /**
   * 문단 정리 함수
   * 본문 내용을 문단별로 정리하여 가독성 향상
   */
  private async formatParagraphs(frame: Frame): Promise<void> {
    try {
      await frame.evaluate(() => {
        // 본문 영역 찾기
        const bodyElement = document.querySelector('.se-section-text, .se-main-container, .se-component');
        if (!bodyElement) {
          console.log('[문단 정리] 본문 영역을 찾을 수 없습니다.');
          return;
        }

        // 모든 텍스트 노드 찾기
        const walker = document.createTreeWalker(
          bodyElement,
          NodeFilter.SHOW_TEXT,
          null
        );

        const textNodes: Text[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (node.textContent && node.textContent.trim().length > 0) {
            textNodes.push(node as Text);
          }
        }

        // 각 텍스트 노드의 내용을 문단별로 정리
        textNodes.forEach((textNode) => {
          const text = textNode.textContent || '';

          // 문장 단위로 분리 (마침표, 느낌표, 물음표 기준)
          const sentences = text.split(/([.!?]\s+)/);

          // 5문장마다 줄바꿈 추가
          let formattedText = '';
          let sentenceCount = 0;

          for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            formattedText += sentence;

            // 문장 종결 부호가 있으면 카운트 증가
            if (/[.!?]/.test(sentence)) {
              sentenceCount++;

              // 5문장마다 줄바꿈 추가 (마지막 문장이 아닌 경우)
              if (sentenceCount % 5 === 0 && i < sentences.length - 1) {
                formattedText += '\n\n';
              }
            }
          }

          // 텍스트 노드 업데이트
          if (formattedText !== text) {
            textNode.textContent = formattedText;
          }
        });

        console.log('[문단 정리] 문단 정리 완료');
      });

      await this.delay(this.DELAYS.MEDIUM);
    } catch (error) {
      this.log(`   ⚠️ 문단 정리 실패: ${(error as Error).message}`);
    }
  }

  /**
   * ✅ [2026-03-27 FIX] 발행 완료 후 브라우저 창 숨기기 (세션 유지)
   * 1단계: CDP Browser.setWindowBounds로 창을 화면 밖(-32000, -32000)으로 이동
   * 2단계: 최소화 적용 (이중 보험)
   * ✅ [2026-04-02 FIX] Win32 ShowWindow(SW_HIDE)로 완전 숨김
   * 최소화는 작업표시줄에 여전히 보이므로, SW_HIDE로 작업표시줄에서도 제거
   * 세션은 유지되므로 다음 발행 시 showBrowserWindow()로 복원 가능
   */
  async minimizeBrowserWindow(): Promise<void> {
    if (!this.browser) return;
    try {
      const pid = this.browser.process()?.pid;
      if (!pid) {
        this.log('⚠️ 브라우저 PID를 찾을 수 없어 숨기기 스킵');
        return;
      }

      // Win32 ShowWindow(SW_HIDE = 0) — 작업표시줄에서도 완전히 제거
      // ✅ [2026-04-02] -EncodedCommand Base64 방식 (escaping 문제 완전 회피)
      const psScript = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);' -Name WinApi -Namespace HideBrowser -EA SilentlyContinue; Get-Process -Id ${pid} -EA SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | ForEach-Object { [HideBrowser.WinApi]::ShowWindow($_.MainWindowHandle, 0) }`;
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { stdio: 'ignore', timeout: 8000 });
      this.log('🙈 브라우저 창 완전 숨김 (작업표시줄 포함)');
    } catch (e) {
      // Win32 실패 시 CDP 폴백 (화면 밖 이동)
      this.log(`⚠️ Win32 숨기기 실패, CDP 폴백 시도: ${(e as Error).message}`);
      try {
        if (this.page) {
          const client = await this.page.target().createCDPSession();
          const { windowId } = await client.send('Browser.getWindowForTarget') as { windowId: number };
          await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }).catch(() => {});
          await client.send('Browser.setWindowBounds', { windowId, bounds: { left: -32000, top: -32000, width: 800, height: 600 } });
          await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
          await client.detach();
          this.log('🔽 CDP 폴백: 화면 밖 이동 + 최소화');
        }
      } catch { /* 무시 */ }
    }
  }

  /**
   * ✅ [2026-04-02 FIX] Win32 ShowWindow(SW_SHOW) + CDP 최대화
   * SW_HIDE로 숨겨진 창을 다시 보이게 하고 최대화합니다.
   */
  async restoreBrowserWindow(): Promise<void> {
    if (!this.browser) return;
    try {
      const pid = this.browser.process()?.pid;
      if (!pid) return;

      // 1단계: Win32 ShowWindow(SW_SHOW = 5) — 작업표시줄 + 화면에 복원
      // ✅ [2026-04-02] -EncodedCommand Base64 방식 (escaping 문제 완전 회피)
      const psScript = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);' -Name WinApi -Namespace ShowBrowser -EA SilentlyContinue; Get-Process -Id ${pid} -EA SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | ForEach-Object { [ShowBrowser.WinApi]::ShowWindow($_.MainWindowHandle, 5) }`;
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { stdio: 'ignore', timeout: 8000 });

      // 2단계: CDP로 최대화 (보이는 상태에서만 작동)
      if (this.page) {
        const client = await this.page.target().createCDPSession();
        const { windowId } = await client.send('Browser.getWindowForTarget') as { windowId: number };
        await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
        await new Promise(r => setTimeout(r, 100));
        await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } });
        await client.detach();
      }

      this.log('👁️ 브라우저 창 복원 + 최대화 완료');
    } catch (e) {
      this.log(`⚠️ 브라우저 창 복원 실패 (무시): ${(e as Error).message}`);
    }
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      this.log('⏳ 브라우저 종료 중...');

      // ✅ 메모리 최적화: 이벤트 리스너 및 페이지 정리
      if (this.page) {
        this.page.removeAllListeners('request');
        this.page.removeAllListeners('response');
        this.page.removeAllListeners('console');
        this.page.removeAllListeners('error');

        // ✅ [2026-03-25 FIX] 브라우저 종료 시 sessionStorage는 자동 소멸하므로 명시적 정리 불필요
        // DOM 파괴(innerHTML='')/ sessionStorage.clear() 모두 제거 — 쿠키 flush 방해 방지
      }

      // ✅ [2026-03-25 FIX] 쿠키 flush 보장을 위해 1초 대기 후 종료
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.browser.close().catch(() => null);
      this.browser = null;
      this.page = null;
      this.mainFrame = null;

      // ✅ Node.js 가비지 컬렉션 힌트
      if (global.gc) {
        try {
          global.gc();
        } catch (e) {
          // ignore
        }
        this.log('🧹 가비지 컬렉션 실행');
      }

      this.log('🔚 브라우저가 종료되었습니다.');
    }
  }

  async run(runOptions: RunOptions = {}): Promise<{ success: boolean; url?: string }> {
    this.cancelRequested = false;
    this.publishedUrl = null; // ✅ 초기화
    this.log('🚀 네이버 블로그 자동화를 시작합니다...');

    const resolvedOptions = this.resolveRunOptions(runOptions);

    // ✅ [2026-02-15 FIX] RunOptions에서 전달된 categoryName을 this.options에 동기화
    // selectCategoryInPublishModal()은 this.options.categoryName을 참조하므로,
    // run()에서 전달된 categoryName이 반드시 반영되어야 함
    if (resolvedOptions.categoryName) {
      this.options.categoryName = resolvedOptions.categoryName;
      console.log(`[NaverBlogAutomation.run] 📂 categoryName 동기화: "${resolvedOptions.categoryName}"`);
      this.log(`📂 카테고리 설정됨: "${resolvedOptions.categoryName}"`);
    } else {
      console.log('[NaverBlogAutomation.run] ⚠️ categoryName 없음 (undefined)');
    }

    // ✅ [100점 수정] 자동 텍스트 오버레이 기능 비활성화
    // 사용자 요청: 나노바나나 텍스트 포함 체크만 남기고 자동 텍스트 오버레이 제거
    // createProductThumbnail 옵션은 이제 사용되지 않음 (항상 스킵)
    if (false && resolvedOptions.createProductThumbnail && resolvedOptions.images && resolvedOptions.images.length > 0) {
      try {
        this.log('🎨 제품 이미지 기반 썸네일 합성을 시작합니다...');
        const firstImage = resolvedOptions.images[0];
        if (firstImage.filePath) {
          const postTitle = resolvedOptions.title || 'Thumbnail';
          const safeTitle = postTitle.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50).trim();

          // 저장 경로 설정
          const outputDir = path.join(os.homedir(), '.naver-blog-automation', 'thumbnails');
          if (!existsSync(outputDir)) {
            await fs.mkdir(outputDir, { recursive: true });
          }
          const outputPath = path.join(outputDir, `thumb-${Date.now()}-${safeTitle}.jpg`);

          await thumbnailService.createProductThumbnail(firstImage.filePath, postTitle, outputPath, {
            width: 1000,
            height: 1000,
            fontSize: 80,
            position: 'center'
          });

          // 대표 이미지 경로 업데이트
          // resolvedOptions.images의 첫 번째 이미지도 썸네일로 교체할지 여부는 정책에 따라 결정
          // 여기서는 resolvedOptions.thumbnailPath만 업데이트
          this.log(`   ✅ 썸네일 합성 완료: ${path.basename(outputPath)}`);
          (resolvedOptions as any).thumbnailPath = outputPath;

          // ✅ 첫 번째 이미지(소스)를 썸네일(결과물)로 교체
          const firstHeadingTitle = resolvedOptions.structuredContent?.headings?.[0]?.title;
          const thumbnailImage: AutomationImage = {
            heading: firstHeadingTitle || 'Intro', // 첫 번째 헤딩 또는 Intro
            filePath: outputPath,
            provider: 'synthetic',
            alt: postTitle,
            savedToLocal: outputPath
          };

          // 첫 번째 이미지를 썸네일로 교체 (중복 방지를 위함)
          if (resolvedOptions.images && resolvedOptions.images.length > 0) {
            this.log(`   🔄 첫 번째 제품 이미지를 합성된 썸네일로 교체합니다.`);
            resolvedOptions.images[0] = thumbnailImage;
          } else if (resolvedOptions.images) {
            resolvedOptions.images.unshift(thumbnailImage);
          } else {
            resolvedOptions.images = [thumbnailImage];
          }
        }
      } catch (err) {
        this.log(`   ⚠️ 썸네일 합성 실패: ${(err as Error).message}`);
      }
    }

    await this.setupBrowser();

    // ✅ [2026-03-24 FIX] 매 run() 사이클마다 dialog 핸들러 보장
    // setupBrowser()는 세션 재사용 시 early-return하여 핸들러 등록을 건너뛸 수 있음
    // → run()에서 확정적으로 등록하여 어떤 경로든 dialog 자동 수락 보장
    this.ensureDialogHandler();

    try {
      await this.loginToNaver();
      await this.navigateToBlogWrite();
      await this.switchToMainFrame();

      // 팝업이 완전히 렌더링될 때까지 대기 (최적화)
      await this.delay(1000); // 2000ms → 1000ms

      // 1단계: 작성중인 글 팝업 먼저 닫기
      await this.closeDraftPopup();
      await this.delay(this.DELAYS.MEDIUM); // 500ms → 300ms

      // 2단계: 도움말 패널 닫기
      await this.closePopups();

      if (resolvedOptions.structuredContent) {
        await this.applyStructuredContent(resolvedOptions);
      } else {
        await this.applyPlainContent(resolvedOptions);
      }

      // ✅ [2026-02-17] 전환점 로깅: 콘텐츠 작성 → 발행 프로세스
      this.log('\n🔄 콘텐츠 작성 완료 → 발행 프로세스 시작...');
      await this.publishBlogPost(resolvedOptions.publishMode, resolvedOptions.scheduleDate, resolvedOptions.scheduleMethod);

      // ✅ 자동화 완료 후 에디터를 편집 가능한 상태로 활성화
      await this.activateEditorForEditing();

      this.log('🎉 모든 자동화 과정이 성공적으로 완료되었습니다!');
      const modeText = resolvedOptions.publishMode === 'draft' ? '임시저장' :
        resolvedOptions.publishMode === 'publish' ? '즉시발행' :
          `예약발행 (${resolvedOptions.scheduleDate})`;
      this.log(`💡 블로그 글이 자동으로 작성되고 ${modeText}되었습니다.`);
      this.log('✏️ 에디터가 편집 가능한 상태로 활성화되었습니다. 직접 수정하실 수 있습니다.');

      // ✅ 발행된 URL 반환
      if (this.publishedUrl) {
        this.log(`📎 발행된 글 URL: ${this.publishedUrl}`);
      }

      return { success: true, url: this.publishedUrl || undefined };
    } catch (error) {
      if ((error as Error).message === '사용자가 자동화를 취소했습니다.') {
        this.log('⏹️ 사용자가 자동화를 취소했습니다.');
      }
      throw error;
    } finally {
      const keepOpen = resolvedOptions.keepBrowserOpen ?? true; // ✅ 기본값 true로 변경
      if (!keepOpen && this.browser) {
        this.log('⏳ 브라우저 종료 중...');
        await this.browser.close().catch(() => undefined);
        this.browser = null;
        this.page = null;
        this.mainFrame = null;
        this.log('🔚 브라우저가 종료되었습니다.');
      } else if (keepOpen) {
        this.log('ℹ️ 세션 유지를 위해 브라우저를 열어둡니다.');

        // ✅ [2026-03-23] 발행 후 "여운 행동" 극한 강화 — 발행글 확인 + 스크롤 + 블로그 홈 방문 (봇 감지 회피)
        // 인간은 발행 후 자신의 글을 확인하고, 블로그 홈을 둘러보는 패턴
        if (this.page && this.publishedUrl) {
          try {
            this.log('👀 발행된 글 확인 중... (여운 행동)');
            await this.page.goto(this.publishedUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
            
            // 발행된 글에서 5~10초 체류 (인간적 확인 행동)
            const reviewDuration = this.randomInt(5000, 10000);
            this.log(`   📖 발행글 읽는 중... (${Math.round(reviewDuration/1000)}초)`);
            
            // 여러 번 스크롤 (글을 읽는 것처럼)
            for (let s = 0; s < this.randomInt(3, 5); s++) {
              await this.page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 400)).catch(() => {});
              await this.humanDelay(800, 2000);
            }
            
            // 마우스 이동
            const vs = this.page.viewport();
            if (vs) {
              await this.page.mouse.move(
                this.randomInt(100, vs.width - 100),
                this.randomInt(200, vs.height - 100),
                { steps: this.randomInt(8, 15) }
              ).catch(() => {});
            }
            await this.delay(Math.max(0, reviewDuration - 4000));
            
            // 스크롤 복귀
            await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
            await this.humanDelay(500, 1000);
            
            // 블로그 홈으로 자연스럽게 이동 (2~5초 체류)
            this.log('🏠 블로그 홈으로 이동...');
            const blogHomeUrl = `https://blog.naver.com/${this.options.naverId}`;
            await this.page.goto(blogHomeUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
            const homeStay = this.randomInt(2000, 5000);
            
            // 블로그 홈에서 스크롤
            await this.page.evaluate(() => window.scrollBy(0, 150 + Math.random() * 300)).catch(() => {});
            await this.humanDelay(800, 1500);
            await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
            await this.delay(Math.max(0, homeStay - 1500));
            
            this.log('✅ 여운 행동 완료 (발행글 확인 → 블로그 홈)');
          } catch (afterErr) {
            this.log(`⚠️ 여운 행동 스킵: ${(afterErr as Error).message}`);
          }
        }

        // ✅ [2026-03-26] 발행 완료 후 브라우저 창 최소화 — 사용자가 실수로 닫는 것 방지
        await this.minimizeBrowserWindow();
        // ✅ [2026-03-25 FIX] keepBrowserOpen=true일 때 page를 닫지 않음 — 세션 재사용 보장
        // page.close() 호출 시 this.page=null → 다음 발행에서 setupBrowser() → 재로그인 → 캡차 유발

        // ✅ [2026-03-25 FIX] 에러 등으로 page가 오염된 상태일 수 있으므로 건강성 체크
        if (this.page) {
          try {
            await this.page.url(); // 생존 체크 (disconnect된 page라면 예외 발생)
            this.log('ℹ️ 페이지와 브라우저 세션이 유지됩니다. (다음 발행에서 재사용)');
          } catch {
            // page가 disconnect/crash 상태 → 참조 제거하여 다음 setupBrowser()에서 새 페이지 생성
            this.log('⚠️ 페이지가 오염된 상태입니다. 다음 발행 시 새 페이지를 생성합니다.');
            this.page = null;
            this.mainFrame = null;
          }
        }

        // ✅ [Phase 2B] 스테일 페이지 정리 — this.page 이외의 여분 페이지 닫기 (메모리 누수 방지)
        if (this.browser) {
          try {
            const allPages = await this.browser.pages();
            let staleCount = 0;
            for (const p of allPages) {
              if (p !== this.page) {
                await p.close().catch(() => {});
                staleCount++;
              }
            }
            if (staleCount > 0) {
              this.log(`🧹 스테일 페이지 ${staleCount}개 정리 완료`);
            }
          } catch (e) { console.debug('[Browser] 스테일 페이지 정리 실패:', (e as Error).message); }
        }
      }
    }
  }

  // ✅ 발행된 URL getter
  getPublishedUrl(): string | null {
    return this.publishedUrl;
  }
}

