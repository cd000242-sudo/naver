// ✅ puppeteer-extra + stealth plugin 적용 (봇 감지 완벽 우회)
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Frame, Page, ElementHandle } from 'puppeteer';
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
  extractProsConsFromContent,
  generateCtaBannerImage,
  generateTableFromUrl // ✅ [추가] 제휴 링크에서 직접 스펙 크롤링
} from './image/tableImageGenerator.js';
import { browserSessionManager, type SessionInfo } from './browserSessionManager.js';
import { withRetry, findWithFallback, clickWithRetry, navigateWithRetry, isRetryableError } from './errorRecovery.js';
import { createGhostCursor, safeClick, safeType, safeClickInFrame, waitRandom, randomMouseMovement, type GhostCursor } from './ghostCursorHelper.js';

// ✅ 쇼핑커넥트 모드 전용 강력한 후킹 메시지 (구매 전환 극대화)
const SHOPPING_HOOKS = [
  '⚡️ 품절 임박! 지금 아니면 구매하기 어려워요.',
  '🔥 역대급 최저가 할인 중! 놓치면 후회합니다.',
  '🎁 오늘만 이 가격! 한정 수량으로 진행됩니다.',
  '🏠 삶의 질을 바꿔줄 완벽한 아이템, 지금 확인해보세요.',
  '✨ 수많은 실사용 후기가 증명하는 바로 그 제품!',
  '🚀 누적 판매 1위! 가장 핫한 아이템을 만나보세요.',
];

// ✅ [Smart Typing] 핵심 키워드 자동 추출 함수
// ✅ 가독성 개선: 섹션당 1개의 가장 중요한 핵심 키워드만 추출 (너무 많은 밑줄 방지)
function extractCoreKeywords(text: string): string[] {
  const words = text.replace(/[.,?!""''()]/g, "").split(/\s+/);
  const wordMap: Record<string, number> = {};

  words.forEach(word => {
    if (word.length >= 2) {
      wordMap[word] = (wordMap[word] || 0) + 1;
    }
  });

  const sortedWords = Object.keys(wordMap).sort((a, b) => {
    const scoreA = wordMap[a] * 2 + a.length;
    const scoreB = wordMap[b] * 2 + b.length;
    return scoreB - scoreA;
  });

  // ✅ 가독성 개선: 상위 1개 키워드만 반환 (너무 많은 하이라이트는 오히려 가독성 저하)
  return sortedWords.slice(0, 1);
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
      await page.keyboard.type(text, { delay: baseDelay });
      return;
    }

    const keywords = extractCoreKeywords(text);
    console.log("🤖 [SmartType] 감지된 핵심 키워드:", keywords);

    // ✅ 키워드가 없으면 일반 타이핑으로 폴백
    if (!keywords || keywords.length === 0) {
      console.log("⚠️ [SmartType] 키워드 없음, 일반 타이핑으로 진행");
      await page.keyboard.type(text, { delay: baseDelay });
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
      await page.keyboard.type(part, { delay });

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
      await page.keyboard.type(text, { delay: baseDelay });
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
  scheduleType?: 'app-schedule' | 'naver-server'; // 예약 발행 타입: 앱 스케줄 관리 vs 네이버 서버 예약
  scheduleMethod?: 'datetime-local' | 'individual-inputs'; // 예약발행 방식
  ctaLink?: string;
  ctaText?: string;
  ctas?: Array<{ text: string; link?: string }>;
  ctaPosition?: 'top' | 'middle' | 'bottom'; // CTA 위치
  skipCta?: boolean; // ✅ CTA 없이 발행하기
  skipImages?: boolean; // 이미지 삽입 건너뛰기 (글만 발행하기용)
  thumbnailPath?: string; // 대표 이미지 경로
  imageMode?: 'full-auto' | 'semi-auto' | 'manual' | 'skip'; // 이미지 모드
  collectedImages?: Array<{ id: string; url: string; thumbnailUrl: string; title: string; source: string; tags?: string[] }>; // 수집된 이미지 (풀오토 모드용)
  toneStyle?: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe'; // 글 톤 설정
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
  ctaPosition?: 'top' | 'middle' | 'bottom'; // CTA 위치
  skipCta?: boolean; // ✅ CTA 없이 발행하기
  skipImages?: boolean; // 이미지 삽입 건너뛰기 (글만 발행하기용)
  imageMode?: 'full-auto' | 'semi-auto' | 'manual' | 'skip'; // 이미지 모드
  collectedImages?: Array<{ id: string; url: string; thumbnailUrl: string; title: string; source: string; tags?: string[] }>; // 수집된 이미지 (풀오토 모드용)
  toneStyle?: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe'; // 글 톤 설정
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

  // 셀렉터 상수
  private readonly PUBLISH_BUTTON_SELECTORS = [
    'button.publish_btn__m9KHH[data-click-area="tpb.publish"]',
    'button.publish_btn__m9KHH',
    'button[data-click-area="tpb.publish"]',
  ];

  private readonly CONFIRM_PUBLISH_SELECTORS = [
    'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"]',
    'button[data-testid="seOnePublishBtn"]',
    'button.confirm_btn__WEaBq',
  ];

  private readonly LOGIN_BUTTON_SELECTORS = [
    '#log\\.login',
    'button[type="submit"].btn_login',
    'button.btn_login',
    'button[type="submit"]',
  ];

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

  // ✅ 계정별 고정된 프로필 정보 (일관성 유지하여 캡차 방지)
  private getAccountConsistentProfile(): {
    userAgent: string;
    screen: { width: number; height: number };
    webGL: { vendor: string; renderer: string };
  } {
    // 계정 ID 기반 시드 생성
    const seed = this.options.naverId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

    // 1. 고정된 User-Agent (최신 크롬 버전 계열)
    const chromeVersions = ['128.0.0.0', '129.0.0.0', '130.0.0.0', '131.0.0.0'];
    const version = chromeVersions[seed % chromeVersions.length];
    const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

    // 2. 고정된 해상도
    const screenConfigs = [
      { width: 1920, height: 1080 },
      { width: 1536, height: 864 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 }
    ];
    const screen = screenConfigs[seed % screenConfigs.length];

    // 3. 고정된 WebGL
    const webGLConfigs = [
      { vendor: 'Intel Inc.', renderer: 'Intel Iris OpenGL Engine' },
      { vendor: 'Intel Inc.', renderer: 'Intel(R) UHD Graphics 630' },
      { vendor: 'NVIDIA Corporation', renderer: 'GeForce GTX 1060/PCIe/SSE2' },
      { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630)' },
    ];
    const webGL = webGLConfigs[seed % webGLConfigs.length];

    return { userAgent, screen, webGL };
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

  // ✅ 인간적인 딜레이
  private async humanDelay(min: number, max: number): Promise<void> {
    const delay = this.randomInt(min, max);
    await this.delay(delay);
  }

  // ✅ 캡차 감지 함수
  private async detectCaptcha(page: Page): Promise<boolean> {
    try {
      const captchaSelectors = [
        '#captcha',
        '.captcha',
        '[class*="captcha"]',
        '[id*="captcha"]',
        '[class*="Captcha"]',
        'iframe[src*="captcha"]',
        'iframe[src*="challenge"]',
        '.challenge-container',
        '[class*="challenge"]',
        // 네이버 특유의 캡차 셀렉터
        '.captcha_wrap',
        '#captchaimg',
        'input[name="captcha"]',
        '[data-ui-component="CaptchaComponent"]',
      ];

      for (const selector of captchaSelectors) {
        const element = await page.$(selector).catch(() => null);
        if (element) {
          const isVisible = await element.evaluate((el: Element) => {
            const htmlEl = el as HTMLElement;
            return htmlEl.offsetParent !== null &&
              htmlEl.style.display !== 'none' &&
              htmlEl.style.visibility !== 'hidden';
          }).catch(() => false);

          if (isVisible) {
            return true;
          }
        }
      }

      // 페이지 텍스트로도 캡차 감지
      const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
      if (pageText.includes('자동입력 방지') ||
        pageText.includes('auto-input prevention') ||
        pageText.includes('captcha') ||
        pageText.includes('보안문자')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

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
              (document.querySelector('.se-section-text, .se-main-container .se-editing-area, .se-editing-area, .se-component-content') as HTMLElement) ||
              (document.querySelector('[contenteditable="true"]') as HTMLElement) ||
              (document.activeElement as HTMLElement | null);
            if (el && typeof el.focus === 'function') {
              el.focus();
            }
          } catch {
            // ignore
          }
        })
        .catch(() => undefined);

      const selectors = [
        'button[data-name="bold"]',
        'button.se-toolbar-button[data-command="bold"]',
        'button[aria-label*="굵게"]',
        'button[title*="굵게"]',
      ];

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
      } catch {
        // ignore
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

      // ✅ [2026-01-23 FIX] 기기 등록 화면 자동 처리 (다중계정 발행 중단 방지)
      if (currentUrl.includes('deviceConfirm') || currentUrl.includes('device_confirm')) {
        this.log('🔐 기기 등록 화면 감지! "등록안함" 버튼 자동 클릭 시도...');
        try {
          // "등록안함" 버튼 클릭 시도 (네이버 기기 등록 화면 전용)
          const skipButtonSelectors = [
            // ✅ 네이버 기기 등록 화면 전용 셀렉터
            'button.btn_refuse',                    // 등록안함 버튼 (기본)
            'a.btn_refuse',
            'button.btn_secondary',                 // 보조 버튼
            'a.btn_secondary',
            '.btn_area button:last-child',          // 버튼 영역의 마지막 버튼
            '.btn_area a:last-child',
            'button[class*="refuse"]',
            'a[class*="refuse"]',
            // 기존 셀렉터
            'button.btn_cancel',
            'a.btn_cancel',
            '[class*="cancel"]',
            'button[type="button"]:not([class*="primary"]):not([class*="confirm"])',
            '.btn_type2:not(.btn_type1)',
            // 네이버 보안 화면 스타일
            '.security_btn button:not(.btn_primary)',
            '.security_btn a:not(.btn_primary)',
            'form button + button',                  // 폼 내 두 번째 버튼
            'form a + a',
          ];

          let clicked = false;
          for (const selector of skipButtonSelectors) {
            try {
              const btn = await page.$(selector);
              if (btn) {
                await btn.click();
                this.log('✅ "등록안함" 버튼 클릭 성공!');
                clicked = true;
                await this.delay(2000);
                break;
              }
            } catch {
              // 다음 셀렉터 시도
            }
          }

          // 버튼을 찾지 못한 경우 텍스트 기반 검색
          if (!clicked) {
            const skipClicked = await page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll('button, a'));
              for (const btn of buttons) {
                const text = (btn as HTMLElement).innerText || '';
                if (text.includes('등록안함') || text.includes('취소') || text.includes('나중에')) {
                  (btn as HTMLElement).click();
                  return true;
                }
              }
              return false;
            });

            if (skipClicked) {
              this.log('✅ 텍스트 기반 "등록안함" 버튼 클릭 성공!');
              await this.delay(2000);
            } else {
              this.log('⚠️ "등록안함" 버튼을 찾지 못했습니다. 사용자가 직접 처리해주세요.');
            }
          }
        } catch (err) {
          this.log(`⚠️ 기기 등록 화면 처리 실패: ${(err as Error).message}`);
        }
        continue; // 다음 반복에서 URL 다시 체크
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

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
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
  stopAutomation(): void {
    this.cancelRequested = true;
    this.log('⚠️ 즉시 중지 요청 (stopAutomation 호출됨)');

    // 브라우저 즉시 종료 (비동기 처리)
    if (this.browser) {
      this.browser.close().catch(() => undefined);
      this.browser = null;
      this.page = null;
      this.mainFrame = null;
    }
  }

  private resolveRunOptions(runOptions: RunOptions): ResolvedRunOptions {
    const structured = runOptions.structuredContent;

    // 입력 검증
    if (runOptions.scheduleDate && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(runOptions.scheduleDate)) {
      throw new Error('예약발행 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD HH:mm 형식)');
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
      publishMode: runOptions.publishMode ?? 'draft',
      scheduleDate: runOptions.scheduleDate,
      scheduleType: runOptions.scheduleType || 'app-schedule', // 기본값: 앱 스케줄 관리
      scheduleMethod: runOptions.scheduleMethod || 'datetime-local', // 기본값: datetime-local
      skipImages: runOptions.skipImages ?? false,
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
    };
  }

  async setupBrowser(): Promise<void> {
    this.ensureNotCancelled();

    // ✅ [Phase 1] BrowserSessionManager로 세션 재사용 시도 (CAPTCHA 방지 핵심!)
    try {
      this.log('🔄 BrowserSessionManager에서 세션 확인 중...');
      const session = await browserSessionManager.getOrCreateSession(
        this.options.naverId,
        this.options.headless ?? false
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

          return; // 세션 재사용 성공!
        } catch {
          this.log('⚠️ 세션 페이지가 유효하지 않음, 새 페이지 생성...');
          this.page = await this.browser.newPage();
          this.cursor = createGhostCursor(this.page);
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
        try { await this.page.bringToFront().catch(() => { }); } catch { }

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
          try { await this.browser.close(); } catch { }
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

            // ✅ 추가 우회 설정
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-web-security',
            '--allow-running-insecure-content',
            '--disable-features=AutomationControlled',

            // ✅ 쿠키/세션 관련
            '--disable-features=ThirdPartyCookieBlocking,SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure',
            '--disable-site-isolation-trials',

            // ✅ 성능 최적화
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-ipc-flooding-protection',
            '--disable-software-rasterizer',
            '--disable-accelerated-2d-canvas',
            '--disable-features=TranslateUI',
            '--disable-sync',
            '--disable-default-apps',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-client-side-phishing-detection',
            '--disable-component-update',
            '--disable-domain-reliability',
          ],
          ignoreDefaultArgs: ['--enable-automation'],  // ✅ 자동화 플래그 제거 (핵심!)
        };

        if (chromeExecutablePath) {
          launchOptions.executablePath = chromeExecutablePath;
          this.log(`✅ 시스템 Chrome 사용: ${chromeExecutablePath}`);
        } else {
          this.log('ℹ️ Puppeteer Chrome 사용');
        }

        this.browser = await puppeteer.launch(launchOptions);

        // ✅ 팝업 차단
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
            } catch (error) { }
          }
        });

        this.page = await this.browser.newPage();

        // 🧹 처음 실행 시 기본 빈 탭 정리 (Puppeteer가 launch 시 생성하는 기본 탭 제거)
        const initialPages = await this.browser.pages();
        for (const p of initialPages) {
          if (p !== this.page) {
            await p.close().catch(() => { });
          }
        }

        this.ensureNotCancelled();

        this.page.on('popup', async (popup) => {
          if (popup) {
            this.log(`🚫 팝업 차단: ${popup.url()}`);
            await popup.close().catch(() => { });
          }
        });

        this.log(`✅ 브라우저 실행 성공 (${attempt}번째 시도)`);

        // ✅ Ghost Cursor 초기화 (사람 같은 마우스 이동)
        this.cursor = createGhostCursor(this.page);
        this.log('   🎯 Ghost Cursor 초기화 완료');

        break;

      } catch (browserError) {
        lastError = browserError as Error;
        this.log(`⚠️ 브라우저 실행 실패 (${attempt}/${MAX_RETRIES}): ${lastError.message}`);

        if (this.browser) {
          try { await this.browser.close(); } catch { }
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

      // ✅ 고급 자동화 감지 우회 스크립트 (Stealth Plugin 보완)
      await this.page.evaluateOnNewDocument((hw: any) => {
        // 1. webdriver 속성 완전 제거
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true
        });

        // 2. Chrome 객체 완벽 구현
        (window as any).chrome = {
          runtime: {
            id: undefined,
            onConnect: { addListener: () => { } },
            onMessage: { addListener: () => { } },
            connect: () => ({ onMessage: { addListener: () => { } }, postMessage: () => { } }),
            sendMessage: () => { },
            getPlatformInfo: (cb: (info: any) => void) => cb({ os: 'win', arch: 'x86-64', nacl_arch: 'x86-64' }),
            getManifest: () => ({}),
          },
          loadTimes: () => ({
            commitLoadTime: Date.now() / 1000 - Math.random() * 5,
            connectionInfo: 'h2',
            finishDocumentLoadTime: Date.now() / 1000,
            finishLoadTime: Date.now() / 1000,
            firstPaintAfterLoadTime: 0,
            firstPaintTime: Date.now() / 1000 - Math.random(),
            navigationType: 'Other',
            npnNegotiatedProtocol: 'h2',
            requestTime: Date.now() / 1000 - Math.random() * 10,
            startLoadTime: Date.now() / 1000 - Math.random() * 5,
            wasAlternateProtocolAvailable: false,
            wasFetchedViaSpdy: true,
            wasNpnNegotiated: true,
          }),
          csi: () => ({
            onloadT: Date.now(),
            pageT: Date.now() - performance.timing.navigationStart,
            startE: performance.timing.navigationStart,
            tran: 15,
          }),
          app: {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
            getDetails: () => null,
            getIsInstalled: () => false,
            runningState: () => 'cannot_run',
          },
        };

        // 3. Plugins 배열
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const plugins: any = [
              { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
              { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
              { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 2 },
            ];
            plugins.item = (i: number) => plugins[i] || null;
            plugins.namedItem = (name: string) => plugins.find((p: any) => p.name === name) || null;
            plugins.refresh = () => { };
            return plugins;
          }
        });

        // 4. Languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['ko-KR', 'ko', 'en-US', 'en'],
        });

        // 5. Platform
        Object.defineProperty(navigator, 'platform', {
          get: () => 'Win32',
        });

        // 6. 하드웨어 정보 (계정별 고정)
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

        // 7. Connection
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: '4g',
            rtt: 30 + Math.floor(Math.random() * 50),
            downlink: 5 + Math.random() * 10,
            saveData: false,
          }),
        });

        // 8. WebGL 정보 (계정별 고정)
        const webGL = hw.webGL;

        const getParameterOriginal = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
          if (parameter === 37445) return webGL.vendor;
          if (parameter === 37446) return webGL.renderer;
          return getParameterOriginal.call(this, parameter);
        };

        const getParameter2Original = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function (parameter: number) {
          if (parameter === 37445) return webGL.vendor;
          if (parameter === 37446) return webGL.renderer;
          return getParameter2Original.call(this, parameter);
        };

        // 9. Canvas fingerprint 노이즈
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function (type?: string) {
          if (type === 'image/png' || !type) {
            const context = this.getContext('2d');
            if (context) {
              try {
                const imageData = context.getImageData(0, 0, this.width, this.height);
                for (let i = 0; i < imageData.data.length; i += 4) {
                  imageData.data[i] = imageData.data[i] ^ (Math.random() < 0.001 ? 1 : 0);
                }
                context.putImageData(imageData, 0, 0);
              } catch (e) { }
            }
          }
          return originalToDataURL.apply(this, arguments as any);
        };

        // 10. AudioContext fingerprint 노이즈
        const originalGetChannelData = AudioBuffer.prototype.getChannelData;
        AudioBuffer.prototype.getChannelData = function (channel: number) {
          const data = originalGetChannelData.call(this, channel);
          for (let i = 0; i < data.length; i += 100) {
            data[i] = data[i] + (Math.random() - 0.5) * 0.0001;
          }
          return data;
        };

        // 11. Permissions API
        const originalQuery = navigator.permissions.query;
        navigator.permissions.query = function (parameters: any) {
          if (parameters.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission, onchange: null } as PermissionStatus);
          }
          return originalQuery.call(this, parameters);
        };

        // 12. 자동화 관련 속성 제거
        Object.defineProperty(navigator, 'automationController', { get: () => undefined });
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

        // 13. Screen 정보 (계정별 고정)
        const screen = hw.screen;
        Object.defineProperty(window.screen, 'width', { get: () => screen.width });
        Object.defineProperty(window.screen, 'height', { get: () => screen.height });
        Object.defineProperty(window.screen, 'availWidth', { get: () => screen.width });
        Object.defineProperty(window.screen, 'availHeight', { get: () => screen.height - 40 });
        Object.defineProperty(window.screen, 'colorDepth', { get: () => 24 });
        Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24 });

        console.log('🛡️ Stealth mode activated with consistent profile');
      }, profile);

      // ✅ 고정 User-Agent + 한국어 설정
      const userAgent = profile.userAgent;
      await this.page.setUserAgent(userAgent);
      this.log(`🔧 User-Agent: Chrome/${userAgent.match(/Chrome\/(\d+)/)?.[1]} (Fixed Profile)`);

      // ✅ 브라우저 언어를 한국어로 설정 (영어 페이지 방지)
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      });

      // ... (리소스 차단 생략) ...
      // ✅ 브라우저 언어 및 캐시 설정 등 유지
      await this.page.setBypassCSP(true);
      await this.page.setCacheEnabled(true);

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
   * 저장된 세션으로 로그인 상태 확인 (블로그 페이지 직접 접속 시도)
   */
  private async checkLoginStatus(): Promise<boolean> {
    const page = this.ensurePage();

    try {
      // ✅ 1단계: 블로그 글쓰기 페이지로 이동 (가장 확실한 진입점)
      this.log('   🔍 세션 상태 확인 중 (영역 진입)...');
      await page.goto('https://blog.naver.com/GoBlogWrite.naver', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await this.delay(1500);

      const currentUrl = page.url();

      // 로그인 페이지로 리다이렉트되면 확실히 로그인 안 됨
      if (currentUrl.includes('nidlogin') || currentUrl.includes('login.naver')) {
        this.log('   ❌ 세션 만료됨 (로그인 페이지 리다이렉트)');
        return false;
      }

      // ✅ 2단계: DOM 요소로 로그인 상태 정밀 확인
      // 블로그 프레임이나 GNB에 로그인 정보가 있는지 확인
      const loginIndicators = await page.evaluate(() => {
        // 로그아웃 버튼이나 내 정보 버튼 등이 있는지 확인 (네이버 공통 GNB)
        const logoutBtn = document.querySelector('a[href*="logout"], .gnb_btn_login, #gnb_login_button');
        const loginName = document.querySelector('.gnb_name, .gnb_my_name, .user_name');

        // 블로그 에디터 요소
        const editArea = document.querySelector('.se-container, .se-main-container, #write_area');

        return {
          hasLogoutBtn: !!logoutBtn,
          hasLoginName: !!loginName,
          hasEditArea: !!editArea,
          text: document.body.innerText.substring(0, 500)
        };
      });

      if (loginIndicators.hasEditArea || loginIndicators.hasLogoutBtn || loginIndicators.hasLoginName) {
        this.log('   ✅ 세션 유효 확인 (DOM 요소 감지)');
        return true;
      }

      // ✅ 3단계: URL 기반 최종 판단 (블로그 서비스 도메인 유지 여부)
      if (currentUrl.includes('blog.naver.com')) {
        this.log('   ✅ 세션 유효 (URL 도메인 기반)');
        return true;
      }

      this.log('   ❓ 로그인 상태 불분명 (기본값: 재로그인)');
      return false;
    } catch (error) {
      this.log(`   ⚠️ 상태 확인 중 오류: ${(error as Error).message}`);
      // 오류 발생 시 안전하게 로그인이 필요한 것으로 판단
      return false;
    }
  }

  async loginToNaver(): Promise<void> {
    const page = this.ensurePage();

    this.ensureNotCancelled();

    // ✅ 1. 먼저 기존 세션으로 로그인 상태 확인 (캡차 방지)
    this.log('🔄 기존 세션 확인 중...');
    const alreadyLoggedIn = await this.checkLoginStatus();
    if (alreadyLoggedIn) {
      this.log('✅ 이미 로그인되어 있습니다! (세션 유지됨)');
      return; // 로그인 스킵
    }

    this.log('🔐 네이버 로그인을 시작합니다...');
    this.log('💡 캡차가 나오면 브라우저에서 직접 해결해주세요!');

    const loginUrl = this.options.loginUrl ?? 'https://nid.naver.com/nidlogin.login';

    this.log('🔄 네이버 로그인 페이지로 이동 중...');

    // 로그인 페이지로 이동 전 현재 URL 확인
    const currentUrl = page.url();
    this.log(`   현재 페이지: ${currentUrl}`);

    // 이미 로그인 페이지에 있으면 이동하지 않음
    if (!currentUrl.includes('nidlogin')) {
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

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

    // 로그인 필드 확인
    const idInput = await page.waitForSelector('#id', { visible: true, timeout: 10000 }).catch(() => null);
    if (!idInput) {
      // 이미 로그인되어 있을 수 있음
      const finalCheck = await this.checkLoginStatus();
      if (finalCheck) {
        this.log('✅ 이미 로그인되어 있습니다.');
        return;
      }
      throw new Error('아이디 입력 필드를 찾을 수 없습니다.');
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

      // 기존 내용 삭제
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await waitRandom(100, 200);
      await page.keyboard.press('Backspace');
      await waitRandom(100, 200);

      // 아이디 타이핑 (인간적인 속도)
      for (const char of this.options.naverId) {
        await page.keyboard.type(char, { delay: this.getTypingDelay() });
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
      await idInput.click({ clickCount: 3 });
      await this.humanDelay(300, 600);
      for (const char of this.options.naverId) {
        await page.keyboard.type(char, { delay: this.getTypingDelay() });
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
      await idInput.click({ clickCount: 3 });
      await this.humanDelay(300, 500);
      for (const char of this.options.naverId) {
        await page.keyboard.type(char, { delay: this.getTypingDelay() });
      }
      await this.humanDelay(400, 700);
    }
    this.log(`✅ 아이디 입력 완료: ${this.options.naverId.substring(0, 3)}***`);

    // ✅ Tab 키로 다음 필드로 이동 (더 자연스러운 행동)
    await page.keyboard.press('Tab');
    await this.humanDelay(200, 500);

    const pwInput = await page.waitForSelector('#pw', { visible: true, timeout: 8000 });
    if (!pwInput) {
      throw new Error('비밀번호 입력 필드를 찾을 수 없습니다.');
    }

    // ✅ Ghost Cursor 사용 (사람 같은 마우스 이동)
    if (this.cursor) {
      this.log('🎯 Ghost Cursor로 비밀번호 입력 중...');

      // 비밀번호 입력 필드 클릭
      await safeClick(page, this.cursor, '#pw', {
        delayBefore: [300, 600],
        delayAfter: [200, 400],
        log: this.log.bind(this),
      });

      // 기존 내용 삭제
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await waitRandom(100, 200);
      await page.keyboard.press('Backspace');
      await waitRandom(100, 200);

      // 비밀번호 타이핑 (인간적인 속도)
      for (const char of this.options.naverPassword) {
        await page.keyboard.type(char, { delay: this.getTypingDelay() });
        if (Math.random() < 0.05) {
          await this.humanDelay(200, 400);
        }
      }
      await this.humanDelay(400, 800);
    } else {
      // ✅ 폴백: 기존 마우스 이동 방식
      const pwBox = await pwInput.boundingBox();
      if (pwBox) {
        await page.mouse.move(
          pwBox.x + pwBox.width / 2 + this.randomInt(-30, 30),
          pwBox.y + pwBox.height / 2 + this.randomInt(-10, 10)
        );
        await this.humanDelay(200, 500);
      }
      await pwInput.click({ clickCount: 3 });
      await this.humanDelay(300, 600);
      for (const char of this.options.naverPassword) {
        await page.keyboard.type(char, { delay: this.getTypingDelay() });
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
      await pwInput.click({ clickCount: 3 });
      await this.humanDelay(300, 500);
      for (const char of this.options.naverPassword) {
        await page.keyboard.type(char, { delay: this.getTypingDelay() });
      }
      await this.humanDelay(400, 700);
    }
    this.log('✅ 비밀번호 입력 완료');

    // ✅ 로그인 상태 유지 체크 (세션 만료 방지)
    try {
      // #keep 뿐만 아니라 관련 라벨이나 체크박스 상태 확인
      const keepLoggedIn = await page.$('#keep');
      if (keepLoggedIn) {
        // 이미 체크되어 있는지 확인
        const isChecked = await page.evaluate((el) => {
          const input = el as HTMLInputElement;
          return input.checked;
        }, keepLoggedIn);

        if (!isChecked) {
          this.log('✅ 로그인 상태 유지 활성화...');
          await keepLoggedIn.click();
        } else {
          this.log('ℹ️ 로그인 상태 유지가 이미 활성화되어 있습니다.');
        }
        await this.humanDelay(300, 600);
      }
    } catch (e) { /* 무시 */ }

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

    await loginButton.evaluate((el: Element) => {
      const htmlEl = el as HTMLElement;
      htmlEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      htmlEl.click();
    });
    await this.delay(300);

    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
    } catch (navError) {
      await this.delay(1000);
    }

    // URL 확인 및 캡차 처리
    let captchaDetected = false;
    let loginSuccess = false;
    const maxChecks = 120; // ✅ 120회로 증가 (캡차 해결 시간 확보: 최대 10분)
    let captchaWaitStartTime: number | null = null;
    const CAPTCHA_MAX_WAIT_TIME = 600000; // ✅ 10분 최대 대기

    for (let checkAttempt = 0; checkAttempt < maxChecks; checkAttempt++) {
      this.ensureNotCancelled();

      // 대기 시간 (캡차 감지 시 더 길게)
      const waitTime = captchaDetected ? 2000 : 500; // 캡차 감지 시 2초, 일반 0.5초
      await this.delay(waitTime);

      const currentUrl = page.url();

      // 캡차 감지
      try {
        const captchaSelectors = [
          '#captcha',
          '.captcha',
          '[class*="captcha"]',
          '[id*="captcha"]',
          '[class*="Captcha"]',
          'iframe[src*="captcha"]',
          'iframe[src*="challenge"]',
          '.challenge-container',
          '[class*="challenge"]',
        ];

        let hasCaptcha = false;
        for (const selector of captchaSelectors) {
          const element = await page.$(selector).catch(() => null);
          if (element) {
            const isVisible = await element.evaluate((el: Element) => {
              const htmlEl = el as HTMLElement;
              return htmlEl.offsetParent !== null &&
                htmlEl.style.display !== 'none' &&
                htmlEl.style.visibility !== 'hidden';
            }).catch(() => false);

            if (isVisible) {
              hasCaptcha = true;
              break;
            }
          }
        }

        if (hasCaptcha) {
          if (!captchaDetected) {
            captchaDetected = true;
            captchaWaitStartTime = Date.now();
            this.log('');
            this.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
            this.log('⚠️  캡차가 감지되었습니다!');
            this.log('🖱️  브라우저 창에서 캡차를 직접 해결해주세요!');
            this.log('⏳  해결될 때까지 최대 10분간 기다립니다...');
            this.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
            this.log('');

            // Windows 소리 알림 (3번 울림)
            try {
              const { exec } = await import('child_process');
              exec('powershell -c "1..3 | ForEach-Object { (New-Object Media.SoundPlayer \\"C:\\Windows\\Media\\notify.wav\\").PlaySync(); Start-Sleep -Milliseconds 500 }"');
            } catch { }

            // progressCallback으로 UI에 알림
            if (this.progressCallback) {
              this.progressCallback(0, 100, '🚨 캡차 감지! 브라우저에서 캡차를 해결해주세요!');
            }
          } else {
            // 캡차 대기 중 시간 체크
            if (captchaWaitStartTime) {
              const elapsed = Date.now() - captchaWaitStartTime;
              const remaining = Math.max(0, CAPTCHA_MAX_WAIT_TIME - elapsed);
              const remainingMinutes = Math.floor(remaining / 60000);
              const remainingSeconds = Math.floor((remaining % 60000) / 1000);

              if (remaining > 0) {
                // 20초마다 한 번씩만 로그 출력 (너무 많이 출력 방지)
                if (checkAttempt % 10 === 0) {
                  this.log(`⏳ 캡차 해결 대기 중... (남은 시간: ${remainingMinutes}분 ${remainingSeconds}초)`);
                  this.log(`   💡 브라우저 창에서 캡차를 직접 해결해주세요!`);
                }
              } else {
                throw new Error('캡차 해결 시간이 초과되었습니다. (10분)');
              }
            }
          }
          continue;
        } else if (captchaDetected) {
          // 캡차가 사라졌으면 해결된 것으로 간주
          captchaDetected = false;
          captchaWaitStartTime = null;
          this.log('✅ 캡차가 해결되었습니다. 로그인을 계속 진행합니다...');

          // 캡차 해결 후 로그인 버튼 재클릭 시도
          await this.delay(1000);
          try {
            const loginButtonSelectors = [
              ...this.LOGIN_BUTTON_SELECTORS,
              'button[type="submit"].next_step',
            ];

            for (const selector of loginButtonSelectors) {
              const loginButton = await page.$(selector).catch(() => null);
              if (loginButton) {
                const isClickable = await loginButton.evaluate((el: Element) => {
                  const htmlEl = el as HTMLElement;
                  const buttonEl = el as HTMLButtonElement;
                  return !buttonEl.disabled && htmlEl.offsetParent !== null;
                }).catch(() => false);

                if (isClickable) {
                  await loginButton.click();
                  this.log('🔄 로그인 버튼을 다시 클릭했습니다.');
                  await this.delay(2000);
                  break;
                }
              }
            }
          } catch (error) {
            // 로그인 버튼 재클릭 실패는 무시 (이미 해결되었을 수 있음)
            this.log(`ℹ️ 로그인 버튼 재클릭 시도 중 오류 (무시): ${(error as Error).message}`);
          }
        }
      } catch (error) {
        // 캡차 감지 오류 무시
        if ((error as Error).message.includes('캡차 해결 시간이 초과')) {
          throw error;
        }
      }

      // ✅ 보호조치/본인인증 페이지 감지
      if (currentUrl.includes('protect') || currentUrl.includes('security') || currentUrl.includes('verification')) {
        this.log('');
        this.log('🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒');
        this.log('⚠️  보호조치/본인인증 페이지 감지!');
        this.log('🖱️  브라우저에서 본인인증을 완료해주세요!');
        this.log('🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒🔒');
        this.log('');

        // Windows 소리 알림
        try {
          const { exec } = await import('child_process');
          exec('powershell -c "1..3 | ForEach-Object { (New-Object Media.SoundPlayer \\"C:\\Windows\\Media\\notify.wav\\").PlaySync(); Start-Sleep -Milliseconds 500 }"');
        } catch { }

        if (this.progressCallback) {
          this.progressCallback(0, 100, '🔒 보호조치 감지! 브라우저에서 본인인증을 완료해주세요!');
        }

        await this.delay(3000);
        continue;
      }

      // ✅ [2026-01-24] 기기 등록 페이지 자동 처리 (등록안함 클릭)
      if (currentUrl.includes('deviceConfirm') || currentUrl.includes('device_confirm')) {
        this.log('📱 기기 등록 페이지 감지 - 자동으로 "등록안함" 클릭 중...');

        try {
          // 등록안함 버튼 찾기 (여러 셀렉터 시도)
          const skipButtonSelectors = [
            'button.btn_cancel',          // 등록안함 버튼
            'a.btn_cancel',               // 링크 형태
            'button:has-text("등록안함")',
            '[class*="cancel"]',
            'button[type="button"]:not(.btn_confirm):not(.btn_primary)',
          ];

          let skipButton = null;
          for (const selector of skipButtonSelectors) {
            skipButton = await page.$(selector).catch(() => null);
            if (skipButton) break;
          }

          // 셀렉터로 못 찾으면 텍스트로 찾기
          if (!skipButton) {
            skipButton = await page.evaluateHandle(() => {
              const buttons = Array.from(document.querySelectorAll('button, a'));
              return buttons.find(btn => {
                const text = btn.textContent || '';
                return text.includes('등록안함') || text.includes('취소') || text.includes('나중에');
              }) || null;
            }) as any;

            // evaluateHandle 결과가 null인지 확인
            const isNull = await skipButton.evaluate((el: any) => el === null).catch(() => true);
            if (isNull) skipButton = null;
          }

          if (skipButton) {
            await skipButton.click();
            this.log('✅ "등록안함" 버튼 클릭 완료');
            await this.delay(2000);
          } else {
            this.log('⚠️ "등록안함" 버튼을 찾지 못했습니다. 수동으로 클릭해주세요.');
          }
        } catch (deviceError) {
          this.log(`⚠️ 기기 등록 페이지 처리 중 오류: ${(deviceError as Error).message}`);
        }

        continue;
      }

      // 로그인 성공 여부 확인
      if (!currentUrl.includes('nidlogin') && !currentUrl.includes('login')) {
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
    }

    // 최종 확인
    const finalUrl = page.url();
    if (!loginSuccess && (finalUrl.includes('nidlogin') || finalUrl.includes('login'))) {
      if (captchaDetected) {
        throw new Error(`캡차 해결 시간이 초과되었습니다. 최종 URL: ${finalUrl}`);
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

    // 로그인 페이지에 있으면 로그인이 필요함
    if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
      this.log('   ⚠️ 로그인 페이지에 있습니다. 로그인을 다시 시도합니다...');
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

        // 로그인 페이지로 리다이렉트된 경우
        if (finalUrl.includes('nidlogin') || finalUrl.includes('login')) {
          this.log(`   ⚠️ 로그인 페이지로 리다이렉트됨. 로그인 세션이 만료되었습니다.`);

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
            } catch { }

            if (this.progressCallback) {
              this.progressCallback(0, 100, '🚨 세션 만료! 브라우저에서 직접 로그인해주세요!');
            }

            // 수동 로그인 대기 (최대 10분)
            await this.waitForManualLogin(page, 600000);

            // 로그인 성공 후 블로그 페이지로 다시 이동
            this.log('🔄 블로그 글쓰기 페이지로 다시 이동합니다...');
            await page.goto(this.options.blogWriteUrl ?? 'https://blog.naver.com/GoBlogWrite.naver', {
              waitUntil: 'domcontentloaded',
              timeout: 30000
            });
            await this.delay(3000);

            const retryUrl = page.url();
            if (retryUrl.includes('blog.naver.com')) {
              navigationSuccess = true;
              break;
            } else {
              throw new Error('수동 로그인 후에도 블로그 페이지 접근 실패');
            }
          }
        }

        // 블로그 페이지 확인
        if (!finalUrl.includes('blog.naver.com')) {
          throw new Error(
            `블로그 글쓰기 페이지로 이동하지 못했습니다.\n\n` +
            `현재 URL: ${finalUrl}\n` +
            `예상 URL: https://blog.naver.com/GoBlogWrite.naver\n\n` +
            `네이버 서버 오류이거나 네트워크 문제일 수 있습니다.`
          );
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
      } catch { }

      if (this.progressCallback) {
        this.progressCallback(0, 100, '🚨 로그인 필요! 브라우저에서 직접 로그인해주세요!');
      }

      // 수동 로그인 대기 (최대 10분)
      await this.waitForManualLogin(page, 600000);

      // 로그인 성공 후 블로그 페이지로 이동
      this.log('🔄 블로그 글쓰기 페이지로 이동합니다...');
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

    // 블로그 글쓰기 페이지가 아니면 에러
    if (!currentUrl.includes('blog.naver.com') && !currentUrl.includes('GoBlogWrite')) {
      throw new Error(
        `메인 프레임을 찾을 수 없습니다.\n` +
        `페이지 URL: ${currentUrl}\n` +
        `가능한 원인:\n` +
        `1. 블로그 글쓰기 페이지로 이동하지 못했습니다.\n` +
        `2. 네이버 블로그 UI가 변경되었을 수 있습니다.\n` +
        `해결 방법: 블로그 글쓰기 페이지로 이동한 후 다시 시도해주세요.`
      );
    }

    // ✅ 최적화: 짧은 대기 후 즉시 프레임 찾기 시작
    await this.delay(500); // 3000ms → 500ms

    // 여러 방법으로 mainFrame 찾기 시도 (병렬 처리)
    let frameHandle: ElementHandle<Element> | null = null;
    const maxRetries = 2; // 3 → 2

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
    } catch { }

    this.mainFrame = frame;
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

    // 제목이 문자열인지 확인
    const titleText = typeof title === 'string' ? title : String(title || '');
    if (!titleText.trim()) {
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
        await page.keyboard.type(titleText, { delay: 20 });
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
      await page.keyboard.type(content, { delay: 20 });
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
    const [datePart, timePart] = scheduleDate.split(' ');
    const [year, month, day] = datePart.split('-');
    const [hour, minute] = timePart.split(':');

    this.log(`   📅 입력할 날짜: ${year}년 ${month}월 ${day}일 ${hour}:${minute}`);

    // ✅ 예약 라디오 클릭 후 날짜/시간 입력 필드가 나타날 때까지 대기
    await this.delay(1000);

    // 방법 1: datetime-local input
    let dateTimeInput = await frame.waitForSelector('input[type="datetime-local"]', {
      visible: true,
      timeout: 3000
    }).catch(() => null);

    if (dateTimeInput) {
      const dateTimeValue = `${year}-${month}-${day}T${hour}:${minute}`;
      await dateTimeInput.click({ clickCount: 3 });
      await this.delay(200);
      await dateTimeInput.type(dateTimeValue, { delay: 50 });
      this.log(`✅ 날짜/시간 입력 완료: ${dateTimeValue}`);
      return;
    }

    // 방법 2: date + time 분리
    const dateInput = await frame.$('input[type="date"]').catch(() => null);
    const timeInput = await frame.$('input[type="time"]').catch(() => null);

    if (dateInput && timeInput) {
      const dateValue = `${year}-${month}-${day}`;
      const timeValue = `${hour}:${minute}`;

      await dateInput.click({ clickCount: 3 });
      await dateInput.type(dateValue, { delay: 50 });
      await this.delay(200);

      await timeInput.click({ clickCount: 3 });
      await timeInput.type(timeValue, { delay: 50 });

      this.log(`✅ 날짜/시간 입력 완료: ${dateValue} ${timeValue}`);
      return;
    }

    // 방법 3: 개별 input (년/월/일/시/분)
    const yearInput = await frame.$('input[name*="year"], input[placeholder*="년"]').catch(() => null);
    if (yearInput) {
      await yearInput.click({ clickCount: 3 });
      await yearInput.type(year, { delay: 50 });
      this.log(`✅ 년도 입력: ${year}`);
    }

    const monthInput = await frame.$('input[name*="month"], input[placeholder*="월"]').catch(() => null);
    if (monthInput) {
      await monthInput.click({ clickCount: 3 });
      await monthInput.type(month, { delay: 50 });
      this.log(`✅ 월 입력: ${month}`);
    }

    const dayInput = await frame.$('input[name*="day"], input[placeholder*="일"]').catch(() => null);
    if (dayInput) {
      await dayInput.click({ clickCount: 3 });
      await dayInput.type(day, { delay: 50 });
      this.log(`✅ 일 입력: ${day}`);
    }

    const hourInput = await frame.$('input[name*="hour"], input[placeholder*="시"], select[name*="hour"]').catch(() => null);
    if (hourInput) {
      const tagName = await hourInput.evaluate(el => el.tagName);
      if (tagName === 'SELECT') {
        await hourInput.select(hour);
      } else {
        await hourInput.click({ clickCount: 3 });
        await hourInput.type(hour, { delay: 50 });
      }
      this.log(`✅ 시 입력: ${hour}`);
    }

    const minuteInput = await frame.$('input[name*="minute"], input[placeholder*="분"], select[name*="minute"]').catch(() => null);
    if (minuteInput) {
      const tagName = await minuteInput.evaluate(el => el.tagName);
      if (tagName === 'SELECT') {
        await minuteInput.select(minute);
      } else {
        await minuteInput.click({ clickCount: 3 });
        await minuteInput.type(minute, { delay: 50 });
      }
      this.log(`✅ 분 입력: ${minute}`);
    }
  }

  /**
   * 발행 모달 디버깅 (네이버 UI 구조 파악)
   */
  private async debugPublishModal(): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    this.log('🔍 발행 모달 디버깅 시작...');

    try {
      // 1. 모달 HTML 전체 덤프
      const modalHtml = await frame.evaluate(() => {
        const modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="publish"], [class*="layer"]');
        return Array.from(modals).map((m, idx) => {
          return `=== 모달 ${idx + 1} ===\n${m.outerHTML}\n`;
        }).join('\n\n');
      });

      console.log('=== 발행 모달 HTML 구조 ===');
      console.log(modalHtml);

      // 2. 모든 라디오 버튼 찾기
      const radioButtons = await frame.evaluate(() => {
        const radios = document.querySelectorAll('input[type="radio"]');
        return Array.from(radios).map(r => ({
          value: r.getAttribute('value'),
          name: r.getAttribute('name'),
          id: r.getAttribute('id'),
          checked: (r as HTMLInputElement).checked,
          labelText: r.parentElement?.textContent?.trim() || '',
        }));
      });

      console.log('=== 라디오 버튼 목록 ===');
      console.table(radioButtons);

      // 3. 모든 버튼 찾기
      const buttons = await frame.evaluate(() => {
        const btns = document.querySelectorAll('button');
        return Array.from(btns).map(b => ({
          text: b.textContent?.trim() || '',
          className: b.className,
          dataAttrs: Object.fromEntries(
            Array.from(b.attributes)
              .filter(a => a.name.startsWith('data-'))
              .map(a => [a.name, a.value])
          ),
        }));
      });

      console.log('=== 버튼 목록 ===');
      console.table(buttons);

      // 4. 모든 레이블 찾기
      const labels = await frame.evaluate(() => {
        const lbls = document.querySelectorAll('label, span');
        return Array.from(lbls)
          .filter(l => l.textContent?.includes('예약') || l.textContent?.includes('발행'))
          .map(l => ({
            tag: l.tagName,
            text: l.textContent?.trim() || '',
            className: l.className,
            htmlFor: l.getAttribute('for') || '',
          }));
      });

      console.log('=== 예약/발행 관련 레이블 ===');
      console.table(labels);

      // 5. 스크린샷 저장
      await page.screenshot({
        path: 'publish-modal-debug.png',
        fullPage: true
      });
      this.log('✅ 스크린샷 저장: publish-modal-debug.png');

    } catch (error) {
      this.log(`❌ 디버깅 실패: ${(error as Error).message}`);
    }
  }

  /**
   * 네이버 블로그 예약발행 (완벽 수정 버전 - 자동으로 최적 방식 선택)
   */
  private async publishScheduled(scheduleDate: string): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    this.log(`📅 예약발행 시작: ${scheduleDate}`);

    try {
      // ✅ 날짜 유효성 검증
      this.validateScheduleDate(scheduleDate);

      // 1단계: 발행 버튼 클릭
      this.log('📌 1단계: 발행 모달 열기');
      const publishButton = await this.waitForAnySelector(frame, [
        'button.publish_btn__m9KHH[data-click-area="tpb.publish"]',
        'button[data-click-area="tpb.publish"]',
        'button:has-text("발행")',
      ], 10000);

      if (!publishButton) {
        // ✅ 에러 시 스크린샷
        await page.screenshot({ path: 'error-no-publish-btn.png', fullPage: true });
        throw new Error('발행 버튼을 찾을 수 없습니다. 스크린샷을 확인하세요.');
      }

      await publishButton.click();
      await this.delay(2000);
      this.log('✅ 발행 모달 열림');

      // ✅ 카테고리(폴더) 자동 선택 로직 (네이버 UI 2024+ 호환)
      if (this.options.categoryName) {
        try {
          this.log(`📂 카테고리 자동 선택 시도: "${this.options.categoryName}"`);

          // 1. 카테고리 선택 드롭다운 버튼 클릭 (다양한 선택자 시도)
          const categorySelectorPatterns = [
            '[data-testid*="categorySelector"]',
            '[class*="category_selector"]',
            '[class*="categoryArea"]',
            'button[class*="select_btn"]',
            '.publish_category button',
            '[data-testid="seOneCategoryBtn"]',
            '[class*="PublishCategory"]',
            // 드롭다운 버튼인 경우
            'select[class*="category"]',
            // 현재 선택된 카테고리 표시 영역 클릭
            '[class*="category"][class*="wrap"] button',
          ];

          let categorySelector = null;
          for (const pattern of categorySelectorPatterns) {
            categorySelector = await frame.waitForSelector(pattern, { visible: true, timeout: 2000 }).catch(() => null);
            if (categorySelector) {
              this.log(`   ✅ 카테고리 드롭다운 발견: ${pattern}`);
              break;
            }
          }

          if (categorySelector) {
            await categorySelector.click();
            await this.delay(1000);

            // 2. 카테고리 목록에서 정확한 이름 찾기 (다양한 선택자 시도)
            const categoryItemPatterns = [
              '[data-testid^="categoryItemText_"]',  // ✅ 네이버 최신 UI 형식 (categoryItemText_0, categoryItemText_1, ...)
              '[class*="category_item"]',
              '[class*="categoryItem"]',
              '.list_item span',
              'li[class*="item"] span',
              'ul[class*="category"] li',
              '.category_list li',
              'option', // select 태그인 경우
            ];

            let categoryItems: any[] = [];
            for (const pattern of categoryItemPatterns) {
              categoryItems = await frame.$$(pattern).catch(() => []);
              if (categoryItems.length > 0) {
                this.log(`   ✅ 카테고리 항목 ${categoryItems.length}개 발견: ${pattern}`);
                break;
              }
            }

            let found = false;
            const normalizedTarget = this.options.categoryName!.replace(/[\s·_\-\/\\]+/g, '').toLowerCase();

            for (const item of categoryItems) {
              const text = await frame.evaluate((el: Element) => (el as HTMLElement).innerText?.trim() || (el as HTMLElement).textContent?.trim() || '', item);
              this.log(`   🔍 카테고리 후보: "${text}"`);

              const normalizedText = text.replace(/[\s·_\-\/\\]+/g, '').toLowerCase();

              // 다양한 매칭 방식 시도
              if (
                text === this.options.categoryName ||
                normalizedText === normalizedTarget ||
                text.includes(this.options.categoryName!) ||
                this.options.categoryName!.includes(text) ||
                normalizedText.includes(normalizedTarget) ||
                normalizedTarget.includes(normalizedText)
              ) {
                await item.click();
                this.log(`   ✅ 카테고리 "${this.options.categoryName}" → "${text}" 선택 완료`);
                found = true;
                break;
              }
            }

            if (!found) {
              this.log(`   ⚠️ 카테고리 "${this.options.categoryName}"을 목록에서 찾을 수 없습니다.`);
              this.log(`   💡 블로그에 해당 카테고리가 있는지 확인해주세요. 기본 카테고리로 발행됩니다.`);
              const page = this.ensurePage();
              await page.keyboard.press('Escape').catch(() => { });
            }
          } else {
            this.log('   ⚠️ 카테고리 선택 요소를 찾을 수 없습니다. 네이버 UI가 변경되었을 수 있습니다.');
            this.log('   💡 기본 카테고리로 진행합니다.');
          }
        } catch (catError) {
          this.log(`   ⚠️ 카테고리 선택 중 오류 발생 (무시하고 진행): ${(catError as Error).message}`);
        }
        await this.delay(500);
      }

      // 2단계: 예약발행 라디오 버튼 선택 (정확한 셀렉터!)
      this.log('📌 2단계: 예약발행 옵션 선택');

      const scheduleRadio = await this.waitForAnySelector(frame, [
        'input#radio_time2',  // ✅ 가장 확실함!
        'input[name="radio_time"][value="pre"]',
        'input[type="radio"][value="pre"]',
        'label[for="radio_time2"]',  // 레이블 클릭도 가능
      ], 5000);

      if (!scheduleRadio) {
        await page.screenshot({ path: 'error-no-schedule-radio.png', fullPage: true });
        throw new Error('예약 라디오 버튼을 찾을 수 없습니다.');
      }

      // 라디오 버튼 클릭
      try {
        await scheduleRadio.click();
        this.log('✅ 라디오 버튼 클릭 성공');
      } catch {
        // 레이블 클릭 시도
        const label = await frame.$('label[for="radio_time2"]');
        if (label) {
          await label.click();
          this.log('✅ 레이블 클릭 성공');
        }
      }

      // ✅ 중요: 예약 UI가 나타날 때까지 충분히 대기!
      await this.delay(2000);
      this.log('✅ 예약발행 옵션 선택됨, 날짜/시간 UI 대기 중...');

      // 3단계: 날짜/시간 입력 (자동으로 3가지 방식 시도)
      this.log('📌 3단계: 날짜/시간 설정 (자동으로 최적 방식 선택)');
      await this.setScheduleDateTime(frame, scheduleDate);

      // ✅ 날짜 입력 후 추가 대기 (UI 업데이트)
      await this.delay(1000);

      // 4단계: 확인 버튼 클릭
      this.log('📌 4단계: 예약발행 확인');

      // ✅ 확인 버튼은 항상 같은 위치!
      const confirmButton = await this.waitForAnySelector(frame, [
        'button[data-testid="seOnePublishBtn"]',
        'button.confirm_btn__WEaBq',
        'button[data-click-area="tpb*i.publish"]',
      ], 5000);

      if (!confirmButton) {
        await page.screenshot({ path: 'error-no-confirm-btn.png', fullPage: true });

        // 디버깅: 모든 버튼 찾기
        const allButtons = await frame.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons
            .filter(b => b.textContent?.includes('발행') || b.textContent?.includes('확인'))
            .map(b => ({
              text: b.textContent?.trim(),
              className: b.className,
              testId: b.getAttribute('data-testid'),
            }));
        });
        console.log('발행/확인 버튼 목록:', allButtons);

        throw new Error('확인 버튼을 찾을 수 없습니다. 스크린샷을 확인하세요.');
      }

      await confirmButton.click();
      await this.delay(2000);

      this.log(`✅ 블로그 글이 예약발행되었습니다: ${scheduleDate}`);

      // 예약 완료 후 URL 로깅
      try {
        const pageUrl = page.url();
        if (pageUrl && /blog\.naver\.com/i.test(pageUrl)) {
          this.log(`POST_URL_SCHEDULED: ${pageUrl} @ ${scheduleDate}`);
        } else {
          this.log(`POST_URL_SCHEDULED: (예약 완료, URL 미확정) @ ${scheduleDate}`);
        }
      } catch { }

    } catch (error) {
      this.log(`❌ 예약발행 실패: ${(error as Error).message}`);

      // ✅ 에러 발생 시 자동으로 스크린샷 저장
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const screenshotPath = `./error-schedule-${timestamp}.png`;

        await page.screenshot({
          path: screenshotPath,
          fullPage: true
        });

        this.log(`📸 에러 스크린샷 저장됨: ${screenshotPath}`);
      } catch (screenshotError) {
        this.log('⚠️ 스크린샷 저장 실패 (무시됨)');
      }

      await page.keyboard.press('Escape').catch(() => { });
      throw error;
    }
  }

  async publishBlogPost(mode: PublishMode, scheduleDate?: string, scheduleMethod: 'datetime-local' | 'individual-inputs' = 'datetime-local'): Promise<void> {
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
          for (let i = 0; i < imageElements.length; i++) {
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

        // ✅ 발행 버튼 찾기 (사용자가 제공한 정확한 셀렉터 우선)
        const publishButtonSelectors = [
          'button.publish_btn__m9KHH[data-click-area="tpb.publish"]', // ✅ 최우선: 사용자가 제공한 정확한 셀렉터
          ...this.PUBLISH_BUTTON_SELECTORS,
          '.publish_btn__bzc5B',
          '[data-testid="publish-button"]',
          'button:has-text("발행")',
        ];

        let publishButton: ElementHandle<Element> | null = null;
        for (const selector of publishButtonSelectors) {
          publishButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null); // ✅ 타임아웃 3초 → 5초 증가
          if (publishButton) break;
        }

        if (publishButton) {
          // ✅ 발행 모달 열기 버튼 클릭
          await publishButton.click();
          await this.delay(500); // ✅ 대기 시간 증가: 250ms → 500ms

          // ✅ 발행 모달이 열릴 때까지 충분히 대기
          await this.delay(1000); // ✅ 대기 시간 증가: 250ms → 1000ms

          // ✅ 카테고리(폴더) 자동 선택 로직 (네이버 UI 2024+ 호환)
          if (this.options.categoryName) {
            try {
              this.log(`📂 카테고리 자동 선택 시도: "${this.options.categoryName}"`);

              // 1. 카테고리 선택 드롭다운 버튼 클릭 (다양한 선택자 시도)
              const categorySelectorPatterns = [
                '[data-testid*="categorySelector"]',
                '[data-testid*="category"]',
                '[class*="category_selector"]',
                '[class*="categoryArea"]',
                'button[class*="select_btn"]',
                '.publish_category button',
                '[data-testid="seOneCategoryBtn"]',
                '[class*="PublishCategory"]',
                'select[class*="category"]',
                '[class*="category"][class*="wrap"] button',
                // 카테고리 텍스트가 있는 영역 클릭
                '[class*="category"] [class*="text"]',
              ];

              let categorySelector = null;
              for (const pattern of categorySelectorPatterns) {
                categorySelector = await frame.waitForSelector(pattern, { visible: true, timeout: 2000 }).catch(() => null);
                if (categorySelector) {
                  this.log(`   ✅ 카테고리 드롭다운 발견: ${pattern}`);
                  break;
                }
              }

              if (categorySelector) {
                await categorySelector.click();
                await this.delay(1000);

                // 2. 카테고리 목록에서 정확한 이름 찾기 (다양한 선택자 시도)
                const categoryItemPatterns = [
                  '[data-testid^="categoryItemText_"]',  // ✅ 네이버 최신 UI 형식
                  'span[class*="text"]',  // 카테고리 텍스트 span
                  '[class*="category_item"]',
                  '[class*="categoryItem"]',
                  '.list_item span',
                  'li[class*="item"] span',
                  'ul[class*="category"] li',
                  '.category_list li',
                  'option',
                ];

                let categoryItems: any[] = [];
                for (const pattern of categoryItemPatterns) {
                  categoryItems = await frame.$$(pattern).catch(() => []);
                  if (categoryItems.length > 0) {
                    this.log(`   ✅ 카테고리 항목 ${categoryItems.length}개 발견: ${pattern}`);
                    break;
                  }
                }

                let found = false;
                const normalizedTarget = this.options.categoryName!.replace(/[\s·_\-\/\\]+/g, '').toLowerCase();

                for (const item of categoryItems) {
                  const text = await frame.evaluate((el: Element) => (el as HTMLElement).innerText?.trim() || (el as HTMLElement).textContent?.trim() || '', item);
                  this.log(`   🔍 카테고리 후보: "${text}"`);

                  const normalizedText = text.replace(/[\s·_\-\/\\]+/g, '').toLowerCase();

                  // 다양한 매칭 방식 시도
                  // 1. 정확히 일치
                  // 2. 정규화된 문자열이 일치
                  // 3. 타겟이 텍스트에 포함
                  // 4. 텍스트가 타겟에 포함 (역방향)
                  if (
                    text === this.options.categoryName ||
                    normalizedText === normalizedTarget ||
                    text.includes(this.options.categoryName!) ||
                    this.options.categoryName!.includes(text) ||
                    normalizedText.includes(normalizedTarget) ||
                    normalizedTarget.includes(normalizedText)
                  ) {
                    await item.click();
                    this.log(`   ✅ 카테고리 "${this.options.categoryName}" → "${text}" 선택 완료`);
                    found = true;
                    break;
                  }
                }

                if (!found) {
                  this.log(`   ⚠️ 카테고리 "${this.options.categoryName}"을 목록에서 찾을 수 없습니다.`);
                  this.log(`   💡 블로그에 해당 카테고리가 있는지 확인해주세요. 기본 카테고리로 발행됩니다.`);
                  const page = this.ensurePage();
                  await page.keyboard.press('Escape').catch(() => { });
                }
              } else {
                this.log('   ⚠️ 카테고리 선택 요소를 찾을 수 없습니다. 네이버 UI가 변경되었을 수 있습니다.');
              }
            } catch (catError) {
              this.log(`   ⚠️ 카테고리 선택 중 오류 발생 (무시하고 진행): ${(catError as Error).message}`);
            }
            await this.delay(500);
          }

          // ✅ 최종 발행 확인 버튼 찾기 (사용자가 제공한 정확한 셀렉터 최우선)
          const confirmPublishSelectors = [
            'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"][data-click-area="tpb*i.publish"]', // ✅ 최우선: 사용자가 제공한 정확한 셀렉터
            'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"]',
            'button[data-testid="seOnePublishBtn"]',
            'button.confirm_btn__WEaBq[data-click-area*="publish"]',
            'button.confirm_btn__WEaBq',
            'button:has-text("발행")',
          ];

          let confirmPublishButton: ElementHandle<Element> | null = null;
          for (const selector of confirmPublishSelectors) {
            confirmPublishButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null); // ✅ 타임아웃 3초 → 5초 증가
            if (confirmPublishButton) break;
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
          const publishOption = await frame.waitForSelector(
            '[data-value="publish"], button:has-text("발행")',
            { visible: true, timeout: 5000 } // ✅ 타임아웃 3초 → 5초 증가
          ).catch(() => null);

          if (publishOption) {
            await publishOption.click();
            await this.delay(1000); // ✅ 대기 시간 증가

            // 최종 발행 확인 버튼 찾기
            const confirmPublishSelectors = [
              'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"][data-click-area="tpb*i.publish"]',
              'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"]',
              'button[data-testid="seOnePublishBtn"]',
              'button.confirm_btn__WEaBq[data-click-area*="publish"]',
              'button.confirm_btn__WEaBq',
              'button:has-text("발행")',
            ];

            let confirmPublishButton: ElementHandle<Element> | null = null;
            for (const selector of confirmPublishSelectors) {
              confirmPublishButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null); // ✅ 타임아웃 3초 → 5초 증가
              if (confirmPublishButton) break;
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

        // ✅ 예약발행 시도, 실패 시 임시저장으로 폴백
        try {
          await this.publishScheduled(scheduleDate);
        } catch (scheduleError) {
          this.log(`⚠️ 예약발행 실패: ${(scheduleError as Error).message}`);
          this.log(`💾 예약발행 실패로 인해 임시저장으로 폴백합니다...`);

          // 모달이 열려있으면 닫기
          const frame = (await this.getAttachedFrame());
          const page = this.ensurePage();
          await page.keyboard.press('Escape').catch(() => { });
          await this.delay(500);

          // 임시저장 시도
          try {
            this.log('🔄 임시저장 시도 중...');
            const saveButtonSelectors = [
              'button.save_btn__bzc5B[data-click-area="tpb.save"]',
              'button.save_btn__bzc5B',
              'button[data-click-area="tpb.save"]',
            ];

            let saveButton: ElementHandle<Element> | null = null;
            for (const selector of saveButtonSelectors) {
              saveButton = await frame.waitForSelector(selector, { visible: true, timeout: 3000 }).catch(() => null);
              if (saveButton) break;
            }

            if (saveButton) {
              await saveButton.click();
              await this.delay(this.DELAYS.MEDIUM);
              await frame.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);
              this.log('✅ 예약발행 실패 → 임시저장 성공! 글을 나중에 수동으로 발행할 수 있습니다.');
            } else {
              this.log('⚠️ 임시저장 버튼도 찾을 수 없습니다. 저장 버튼을 수동으로 확인해주세요.');
              throw new Error('임시저장 버튼을 찾을 수 없습니다.');
            }
          } catch (fallbackError) {
            this.log(`❌ 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
            throw new Error(`예약발행 실패: ${(scheduleError as Error).message}\n임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
          }
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
            await this.switchToMainFrame();
            this.log(`   ✅ 프레임 재연결 성공, 재시도합니다...`);
            await this.delay(1000);
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
      await page.keyboard.type(normalizedText, { delay: 30 });
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
    const selectors = [
      'button[data-name="quotation"]',
      'button.se-toolbar-button-quotation',
      'button[aria-label="인용구"]',
      'button[title="인용구"]'
    ];

    // 1) 인용구 버튼 클릭 (팝업 열기)
    const clicked = await this.clickToolbarButton(frame, page, selectors);
    if (!clicked) {
      this.log('   ⚠️ 인용구 버튼을 찾을 수 없습니다.');
      // 버튼을 못 찾았더라도 텍스트 입력은 시도해야 함
      return;
    }

    // 팝업이 렌더링될 시간을 충분히 줍니다. 네트워크/DOM 속도에 따라 다를 수 있음
    await this.delay(this.DELAYS.MEDIUM);

    // 2) 스타일에 따라 적절한 인용구 선택
    // ✅ [복구] 쇼핑커넥트 모드: 'underline' (4번, 밑줄) / 일반 모드: 'line' (2번, 버티컬 바)
    let targetStyleClass = 'quotation_line';
    let targetButtonIndex = 1; // 기본: 2번 인용구 (버티컬 바)

    if (style === 'bracket' || style === 'quotation_bracket' || style === '1') {
      // 1번 인용구 (따옴표)
      targetStyleClass = 'quotation_quote';
      targetButtonIndex = 0;
    } else if (style === 'underline' || style === 'quotation_underline' || style === '4') {
      // 4번 인용구 (밑줄) - 쇼핑커넥트 모드 전용
      targetStyleClass = 'quotation_underline';
      targetButtonIndex = 3;
    } else {
      // 기본: 2번 인용구 (버티컬 라인) - 일반 모드
      targetStyleClass = 'quotation_line';
      targetButtonIndex = 1;
    }

    this.log(`   🔸 인용구 스타일 적용: ${targetStyleClass} (Index: ${targetButtonIndex})`);

    // 3) 스타일 버튼 클릭 시도 (Retry 로직 추가)
    // 팝업이 iframe 안에 있을 수도 있고, top document에 있을 수도 있음 (SmartEditor 버전에 따라 다름)
    let styleClicked = false;

    // 시도 1: Frame 내부에서 찾기
    try {
      styleClicked = await frame.evaluate((targetClass, btnIndex) => {
        // A. 클래스명/속성으로 정확히 찾기 (사용자 제공 셀렉터 우선)
        const exactSelectors = [
          `.se-toolbar-option-insert-quotation-${targetClass}-button`,
          `button[data-value="${targetClass}"]`,
          `li[data-value="${targetClass}"]`,
          `.se-toolbar-option-${targetClass}-button`,
          // 하위 호환성
          `.se-toolbar-option-insert-quotation-${targetClass.replace('quotation_', '')}-button`,
          `.se-popup-content button:nth-child(${btnIndex + 1})`,
          `.se-popup-quotation button:nth-child(${btnIndex + 1})`
        ];

        for (const sel of exactSelectors) {
          const btn = document.querySelector(sel);
          if (btn && (btn as HTMLElement).offsetParent !== null) {
            (btn as HTMLElement).click();
            console.log(`[insertQuotation] 클릭 성공: ${sel}`);
            return true;
          }
        }

        // B. 팝업 레이어 찾아서 인덱스로 클릭 (버튼 또는 li)
        const layers = document.querySelectorAll('.se-popup-quotation, .se-toolbar-layer-quotation, .se-layer-quotation, .se-popup-layer, .se-popup-content, .se-toolbar-popup');
        for (const layer of layers) {
          if ((layer as HTMLElement).offsetParent === null) continue; // 안 보이는 레이어 제외

          // 버튼 먼저 시도
          const btns = Array.from(layer.querySelectorAll('button, li[data-value], .se-toolbar-button'));
          if (btns.length > 0) {
            const availableBtns = btns.map((b, idx) => `${idx}:${b.textContent?.trim() || (b as any).dataset?.value || b.className}`);
            console.log(`[insertQuotation] 발견된 버튼들: ${availableBtns.join(', ')}`);

            if (btns.length > btnIndex) {
              (btns[btnIndex] as HTMLElement).click();
              console.log(`[insertQuotation] 인덱스 클릭 성공: ${btnIndex} (총 ${btns.length}개)`);
              return true;
            }
          }
        }

        console.log('[insertQuotation] 팝업 내 버튼/li 찾지 못함');
        return false;
      }, targetStyleClass, targetButtonIndex);
    } catch (e) { /* ignore */ }

    // 시도 2: Page(Main Document)에서 찾기 (Frame에서 실패한 경우)
    if (!styleClicked) {
      try {
        styleClicked = await page.evaluate((targetClass, btnIndex) => {
          // A. 클래스명으로 찾기
          const exactSelectors = [
            `.se-toolbar-option-insert-quotation-${targetClass}-button`,
            `.se-toolbar-option-${targetClass}-button`,
            `button[data-value="quotation_${targetClass}"]`,
            `button[data-value="${targetClass}"]`,
            // ✅ 추가: li 기반 선택자
            `li[data-value="quotation_${targetClass}"]`,
            `li.se-toolbar-option-insert-quotation-${targetClass}`,
            `.se-popup-content button:nth-child(${btnIndex + 1})`,
            `.se-popup-quotation button:nth-child(${btnIndex + 1})`
          ];
          for (const sel of exactSelectors) {
            const btn = document.querySelector(sel);
            if (btn && (btn as HTMLElement).offsetParent !== null) {
              (btn as HTMLElement).click();
              console.log(`[insertQuotation] Page 레벨 클릭 성공: ${sel}`);
              return true;
            }
          }

          // B. 팝업 레이어에서 찾기
          const layers = document.querySelectorAll('.se-popup-quotation, .se-toolbar-layer-quotation, .se-layer-quotation, .se-popup-layer, .se-popup-content, .se-toolbar-popup');
          for (const layer of layers) {
            if ((layer as HTMLElement).offsetParent === null) continue;

            // 버튼 먼저
            const btns = Array.from(layer.querySelectorAll('button'));
            if (btns.length > btnIndex) {
              (btns[btnIndex] as HTMLElement).click();
              console.log(`[insertQuotation] Page 버튼 인덱스 클릭: ${btnIndex}`);
              return true;
            }

            // li 요소
            const lis = Array.from(layer.querySelectorAll('li[data-value]'));
            if (lis.length > btnIndex) {
              (lis[btnIndex] as HTMLElement).click();
              console.log(`[insertQuotation] Page li 인덱스 클릭: ${btnIndex}`);
              return true;
            }
          }
          return false;
        }, targetStyleClass, targetButtonIndex);
      } catch (e) { /* ignore */ }
    }

    if (!styleClicked) {
      this.log('   ⚠️ 인용구 스타일 버튼을 찾지 못했습니다. (기본 스타일로 진행 가능성 있음)');
    } else {
      this.log(`   ✅ 인용구 스타일 선택 성공: ${style}`);
    }

    await this.delay(this.DELAYS.SHORT);
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
    // 🔍 디버그: 원본 텍스트 확인
    this.log(`   🔍 [디버그] typeBodyWithRetry 호출됨`);
    this.log(`   🔍 [디버그] 원본 텍스트 길이: ${text.length}자`);
    this.log(`   🔍 [디버그] 원본 텍스트 시작 50자: ${text.substring(0, 50)}...`);

    await this.retry(async () => {
      this.log(`   → 본문 입력 시작 (${text.length}자)`);

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

      // ⚠️ Frame이 detached되었는지 확인 후 재연결 시도
      try {
        await frame.evaluate(() => true);
      } catch (error) {
        if ((error as Error).message.includes('detached')) {
          this.log('   ⚠️ Frame이 detached 됨. 메인 프레임을 재연결합니다...');
          await this.switchToMainFrame();
          frame = (await this.getAttachedFrame());
        } else {
          throw error;
        }
      }

      // 1. 폰트 크기 설정
      await this.setFontSize(fontSize, true);
      await this.delay(this.DELAYS.SHORT);

      // ✅ 본문은 굵게가 남지 않도록 해제
      await this.setBold(false);
      await this.delay(this.DELAYS.SHORT);

      // 4. 텍스트를 문장 단위로 분리 (3~4문장마다 줄바꿈)
      // ✅ [강화] 마침표(.), 느낌표(!), 물음표(?)뒤에서 문장 분리
      // ✅ 한글 문장 부호(。！？)도 지원
      // ✅ 줄바꿈(\n)도 문장 분리로 처리
      // ✅ [NEW] 한국어 캐주얼 종결 패턴 (~, ㅎㅎ, ㅋㅋ, ㅠㅠ, ^^, 요, 다 등)

      // 1단계: 줄바꿈을 문장 구분자로 먼저 정규화
      let normalizedText = text
        .replace(/\r\n/g, '\n')
        .replace(/\n{2,}/g, '[PARAGRAPH_BREAK]')  // 연속 줄바꿈은 문단 구분으로 표시
        .replace(/\n/g, ' ')  // 단일 줄바꿈은 공백으로
        .replace(/\[PARAGRAPH_BREAK\]/g, '.\n\n');  // 문단 구분 복원

      // 2단계: 숫자+점 패턴을 임시 마커로 치환 (1., 2., 10. 등)
      normalizedText = normalizedText.replace(/(\d+)\.\s*/g, '$1__NUM_DOT__');

      // ✅ [NEW] 2.5단계: 한국어 캐주얼 문장 종결 패턴에 마침표 추가
      // 패턴: ~, ㅎㅎ, ㅋㅋ, ㅠㅠ, ^^, 요, 해요, 드려요, 합니다, 답니다 등
      normalizedText = normalizedText
        // 물결표(~) 뒤에 공백이 오면 문장 끝으로 처리
        .replace(/~\s+/g, '~ [SENTENCE_END] ')
        // ㅎㅎ, ㅋㅋ, ㅠㅠ 등 반복 자음 뒤에 공백
        .replace(/([ㅎㅋㅠㅜ]{2,})\s+/g, '$1 [SENTENCE_END] ')
        // ^^ 이모티콘 뒤에 공백
        .replace(/\^\^\s+/g, '^^ [SENTENCE_END] ')
        // 한국어 구어체 종결어미 뒤에 공백 (요, 해요, 드려요, 해봐요 등)
        .replace(/(요|용|욥|예요|에요|해요|드려요|봐요|해봐요|던데요|했거든요|하더라구요|라구요|어요|거든요|드랍니다|습니다|합니다|답니다|입니다|이당|당ㅎ|닝)\s+/g, '$1 [SENTENCE_END] ');

      // 3단계: 실제 문장 분리 (마침표, 느낌표, 물음표 뒤 + 공백 또는 줄바꿈 또는 SENTENCE_END 마커)
      const rawSentences = normalizedText
        .split(/(?<=[.!?。！？])\s+|\[SENTENCE_END\]\s*/)
        // 임시 마커를 다시 원래대로 복원
        .map(s => s.replace(/__NUM_DOT__/g, '. '))
        .map(s => s.trim())
        .filter(s => s.length > 0);

      this.log(`   🔍 [문장분리] 1차 분리: ${rawSentences.length}개 문장`);

      // ✅ 너무 짧은 문장(이모지만 있는 경우 등)은 이전 문장과 합치기
      const sentences: string[] = [];
      for (let i = 0; i < rawSentences.length; i++) {
        const sentence = rawSentences[i].trim();

        // 문장이 너무 짧으면 (10자 미만, 주로 이모지만 있는 경우) 이전 문장과 합치기
        // 단, 숫자로 시작하는 리스트 항목은 합치지 않음 (1. xxx, 2. xxx 등)
        const isNumberedList = /^\d+\.\s/.test(sentence);
        if (sentence.length < 10 && sentences.length > 0 && !isNumberedList) {
          sentences[sentences.length - 1] += ' ' + sentence;
        } else {
          sentences.push(sentence);
        }
      }

      const sentencesPerParagraph = 3; // ✅ [2026-01-19] 3문장마다 줄바꿈 (사용자 요청)
      const maxCharsPerParagraph = 300; // ✅ [수정] 300자 이상이면 강제 문단 분리

      // 🔍 디버그: 원본 텍스트와 분리된 문장 수 확인
      this.log(`   🔍 [문장분리] 원본 텍스트 길이: ${text.length}자`);
      this.log(`   🔍 [문장분리] 원본 분리: ${rawSentences.length}개 → 병합 후: ${sentences.length}개`);
      if (sentences.length > 0) {
        this.log(`   🔍 [문장분리] 첫 번째 문장: ${sentences[0].substring(0, 80)}...`);
        this.log(`   🔍 [문장분리] 마지막 문장: ${sentences[sentences.length - 1].substring(0, 80)}...`);
      }

      let currentParagraph = '';
      let sentenceCount = 0;
      let totalTypedChars = 0; // 실제로 타이핑된 문자 수 추적

      for (let i = 0; i < sentences.length; i++) {
        // ✅ [중지 체크] 각 문장 처리 전 중지 여부 확인 (백그라운드 타이핑 즉시 중지)
        this.ensureNotCancelled();

        const sentence = sentences[i].trim();
        if (!sentence) continue;

        // ✅ 이미 마침표가 포함되어 있으므로 그대로 사용
        if (currentParagraph) {
          currentParagraph += ' ' + sentence;
        } else {
          currentParagraph = sentence;
        }

        sentenceCount++;

        const isLast = i === sentences.length - 1;
        const tooLong = currentParagraph.length >= maxCharsPerParagraph && sentenceCount >= 1;

        // 2문장마다(또는 너무 길면) 또는 마지막 문장일 때 문단 완성
        if (sentenceCount >= sentencesPerParagraph || tooLong || isLast) {
          // 현재 문단 입력
          const paragraphNum = Math.floor(i / sentencesPerParagraph) + 1;
          this.log(`   📝 [문단 ${paragraphNum}] ${sentenceCount}개 문장, ${currentParagraph.length}자: ${currentParagraph.substring(0, 60)}...`);
          totalTypedChars += currentParagraph.length;

          // ❌ [Smart Typing] 핵심 키워드 자동 강조 비활성화
          await smartTypeWithAutoHighlight(page, currentParagraph, { baseDelay: 20, enableHighlight: false });
          await this.delay(this.DELAYS.MEDIUM);

          // ✅ 입력 확인 (첫 문단만 확인하여 성능 최적화)
          if (i < sentencesPerParagraph) {
            // 입력 후 DOM 업데이트 대기 (더 긴 대기)
            await this.delay(600);

            // 텍스트 확인을 위해 더 짧은 부분 문자열 사용 (처음 10자)
            const firstPart = currentParagraph.substring(0, Math.min(10, currentParagraph.length)).trim();
            if (!firstPart) {
              this.log(`   ⚠️ 첫 문단이 비어있음 - 확인 건너뜀`);
            } else {
              const inputVerified = await frame.evaluate((textPart) => {
                // 여러 방법으로 텍스트 확인 (더 관대한 검사)
                const sectionText = document.querySelector('.se-section-text');
                if (sectionText) {
                  const content = (sectionText.textContent || '').trim();
                  // 부분 문자열이 포함되어 있거나, 처음 10자가 일치하는지 확인
                  if (content.includes(textPart)) return true;
                  if (content.length >= textPart.length && content.substring(0, textPart.length) === textPart) return true;
                }

                // 대체 방법: 모든 편집 가능한 영역 확인
                const editableAreas = document.querySelectorAll('[contenteditable="true"], .se-component, .se-section');
                for (let i = 0; i < editableAreas.length; i++) {
                  const content = (editableAreas[i].textContent || '').trim();
                  if (content.includes(textPart)) return true;
                  if (content.length >= textPart.length && content.substring(0, textPart.length) === textPart) return true;
                }

                // 마지막 시도: body 전체 텍스트 확인
                const bodyContent = (document.body.textContent || '').trim();
                if (bodyContent.includes(textPart)) return true;

                return false;
              }, firstPart);

              if (!inputVerified) {
                this.log(`   ⚠️ 첫 문단 입력 확인 실패 - 더 긴 대기 후 재확인...`);
                // 더 긴 대기 후 재확인
                await this.delay(800);

                const retryVerified = await frame.evaluate((textPart) => {
                  const sectionText = document.querySelector('.se-section-text');
                  if (sectionText) {
                    const content = (sectionText.textContent || '').trim();
                    if (content.includes(textPart)) return true;
                    if (content.length >= textPart.length && content.substring(0, textPart.length) === textPart) return true;
                  }

                  const editableAreas = document.querySelectorAll('[contenteditable="true"], .se-component, .se-section');
                  for (let i = 0; i < editableAreas.length; i++) {
                    const content = (editableAreas[i].textContent || '').trim();
                    if (content.includes(textPart)) return true;
                  }

                  const bodyContent = (document.body.textContent || '').trim();
                  if (bodyContent.includes(textPart)) return true;

                  return false;
                }, firstPart);

                if (retryVerified) {
                  this.log(`   ✅ 재시도 후 첫 문단 입력 확인 완료`);
                } else {
                  this.log(`   ⚠️ 재시도 후에도 입력 확인 실패 (계속 진행 - 실제로는 입력되었을 수 있음)`);
                }
              } else {
                this.log(`   ✅ 첫 문단 입력 확인 완료`);
              }
            }
          }

          // 마지막 문장이 아니면 Enter 2번 추가 (문단 구분)
          if (i < sentences.length - 1) {
            this.log(`   ⏎⏎ [문단구분] Enter 2번 입력 시작...`);

            // ✅ [2026-01-19] 문단정리는 엔터 2번 (사용자 확인)
            try {
              await page.keyboard.press('Enter');
              await this.delay(300);
              await page.keyboard.press('Enter');
              await this.delay(300);
              this.log(`   ✅ [문단구분] Enter 2번 입력 완료`);
            } catch (enterError) {
              this.log(`   ⚠️ [문단구분] Enter 입력 실패: ${(enterError as Error).message} - 계속 진행`);
              // 실패해도 계속 진행
            }

            // Enter 후 폰트 크기 유지를 위해 다시 설정
            await this.setFontSize(fontSize, true);
            await this.delay(this.DELAYS.SHORT);
          }

          // 문단 초기화
          currentParagraph = '';
          sentenceCount = 0;
        }
      }

      // 남은 문장이 있으면 입력
      if (currentParagraph.trim()) {
        this.log(`   🔍 [타이핑] 마지막 문단 (${currentParagraph.length}자): ${currentParagraph.substring(0, 60)}...`);
        totalTypedChars += currentParagraph.length;
        // ❌ [Smart Typing] 핵심 키워드 자동 강조 비활성화
        await smartTypeWithAutoHighlight(page, currentParagraph, { baseDelay: 20, enableHighlight: false });
        await this.delay(this.DELAYS.MEDIUM);
      }

      this.log(`   🔍 [최종] 원본 ${text.length}자 → 실제 타이핑 ${totalTypedChars}자 (차이: ${text.length - totalTypedChars}자)`);

      // 3. DOM 업데이트 대기 (이미지 삽입 후 충분한 대기)
      await this.delay(this.DELAYS.LONG); // 500ms 추가 대기

      // 4. DOM 검증 (강화된 검증 로직)
      // 본문의 경우 첫 30자만 검증
      const textToVerify = text.substring(0, Math.min(30, text.length)).trim();
      if (textToVerify.length > 0) {
        // 여러 번 시도 (DOM 업데이트 지연 대비)
        let verified = false;
        for (let verifyAttempt = 0; verifyAttempt < 5; verifyAttempt++) {
          if (verifyAttempt > 0) {
            await this.delay(500); // 재시도 전 대기 시간 증가
          }

          // ✅ 개선: 더 폭넓은 선택자로 에디터 내용 확인
          const editorContent = await frame.evaluate(() => {
            const possibleSelectors = [
              '.se-section-text',
              '.se-main-container',
              '.se-component-content',
              '[contenteditable="true"]',
              '.se-text-paragraph',
              '.se-component'
            ];

            let combinedText = '';
            for (const selector of possibleSelectors) {
              const elements = document.querySelectorAll(selector);
              elements.forEach(el => {
                combinedText += ' ' + ((el as HTMLElement).innerText || el.textContent || '');
              });
            }
            return combinedText.trim();
          });

          if (editorContent.length > 0) {
            // 에디터에 내용이 있으면 검증 시도
            verified = await this.verifyContentInDOM(frame, textToVerify, 'body');
            if (verified) {
              this.log(`   ✅ 본문 DOM 검증 완료 (에디터 내용: ${editorContent.length}자)`);
              break;
            } else {
              // ✅ [긴급 수정] 스마트 타이핑(HTML)으로 인해 텍스트 매칭이 실패하더라도 내용은 입력된 경우 통과
              if (editorContent.length > 30) { // 30자 이상이면 입력된 것으로 간주
                this.log(`   ⚠️ 정확한 매칭 실패했으나 내용 있음 (${editorContent.length}자) - 성공으로 간주`);
                verified = true;
                break;
              }
              this.log(`   ⚠️ 검증 시도 ${verifyAttempt + 1}/5: 에디터 내용은 있음 (${editorContent.length}자)이지만 검증 실패`);
            }
          } else {
            this.log(`   ⚠️ 검증 시도 ${verifyAttempt + 1}/5: 에디터 내용이 비어있음`);
          }
        }

        if (!verified) {
          // ✅ 검증 실패 시 에러 던지기 (빈 글 발행 방지)
          // ✅ 개선:broader selectors로 최종 확인 (querySelectorAll 사용)
          const finalContent = await frame.evaluate(() => {
            const possibleSelectors = ['.se-section-text', '.se-main-container', '[contenteditable="true"]', '.se-text-paragraph', '.se-component-content'];
            let combined = '';
            possibleSelectors.forEach(sel => {
              document.querySelectorAll(sel).forEach(el => {
                combined += ' ' + (el.textContent || '');
              });
            });
            return combined.trim();
          });

          if (finalContent.length === 0) {
            throw new Error(`본문 입력 실패: 에디터에 내용이 없습니다. (검증 시도 5회 모두 실패)`);
          } else {
            this.log(`   ⚠️ 본문 DOM 검증 실패했지만 에디터에 내용이 있음 (${finalContent.length}자) - 계속 진행`);
          }
        }
      } else {
        // 텍스트가 비어있으면 에러
        throw new Error('본문 입력 실패: 입력할 텍스트가 비어있습니다.');
      }

      // 5. 마지막 Enter 2회 (본문 입력 완료 후)
      await page.keyboard.press('Enter');
      await this.delay(this.DELAYS.MEDIUM);
      await page.keyboard.press('Enter');
      await this.delay(this.DELAYS.MEDIUM);

      // Enter 후 DOM 안정화 대기
      await this.delay(this.DELAYS.SHORT);
    }, 3, '본문 입력');
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
        await page.keyboard.type(before, { delay });
      }

      const boldText = String(match[1] || '');
      if (boldText) {
        await this.setBold(true);
        await this.delay(30);
        await page.keyboard.type(boldText, { delay });
        await this.delay(30);
        await this.setBold(false);
        await this.delay(30);
      }

      lastIndex = match.index + match[0].length;
    }

    const tail = raw.slice(lastIndex);
    if (tail) {
      await page.keyboard.type(tail, { delay });
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
    await this.retry(async () => {
      const structured = resolved.structuredContent;
      if (!structured) {
        await this.applyPlainContent(resolved);
        return;
      }

      // ✅ 본문에서 중복된 CTA 텍스트 제거 (🔗 더 알아보기 등)
      if (structured.bodyPlain) {
        const cleanedBody = structured.bodyPlain
          .replace(/🔗\s*더\s*알아보기[^\n]*\n?/g, '') // "🔗 더 알아보기" 제거
          .replace(/더\s*알아보기[^\n]*\n?/g, '') // "더 알아보기" 제거
          .replace(/━━━━━━━━━━━━━━━━━━━━━━[^\n]*\n?/g, '') // 구분선 제거
          .replace(/👉\s*https?:\/\/[^\n]*\n?/g, '') // CTA 링크 제거
          .trim();

        if (cleanedBody !== structured.bodyPlain) {
          this.log('🧹 본문에서 중복된 CTA 텍스트 제거 완료');
          structured.bodyPlain = cleanedBody;
          resolved.content = cleanedBody;
        }
      }

      if (structured.bodyPlain) {
        structured.bodyPlain = this.stripRepeatedHookBlocks(structured.bodyPlain);
        structured.bodyPlain = this.enforceOrdinalLineBreaks(structured.bodyPlain);
        resolved.content = structured.bodyPlain;
      }

      // ✅ 반자동 모드: 사용자가 수정한 내용이 있으면 그것을 사용하여 타이핑
      if (resolved.imageMode === 'semi-auto') {
        this.log('🔍 반자동 모드: 에디터의 현재 내용을 확인합니다...');
        const currentContent = await this.getCurrentEditorContent();

        if (currentContent && (currentContent.title.length > 0 || currentContent.content.length > 0)) {
          this.log('✅ 에디터에 사용자가 수정한 내용이 있습니다. 수정된 내용을 그대로 타이핑합니다.');
          this.log(`📝 제목: ${currentContent.title.substring(0, 50)}${currentContent.title.length > 50 ? '...' : ''}`);
          this.log(`📄 본문 길이: ${currentContent.content.length}자`);
          if (currentContent.hashtags.length > 0) {
            this.log(`🏷️ 해시태그: ${currentContent.hashtags.join(', ')}`);
          }

          // ✅ 수정된 본문에서도 중복된 CTA 텍스트 제거
          let cleanedContent = currentContent.content
            .replace(/🔗\s*더\s*알아보기[^\n]*\n?/g, '')
            .replace(/더\s*알아보기[^\n]*\n?/g, '')
            .replace(/━━━━━━━━━━━━━━━━━━━━━━[^\n]*\n?/g, '')
            .replace(/👉\s*https?:\/\/[^\n]*\n?/g, '')
            .trim();

          cleanedContent = this.stripRepeatedHookBlocks(cleanedContent);
          cleanedContent = this.enforceOrdinalLineBreaks(cleanedContent);

          // 수정된 내용으로 structuredContent 업데이트
          structured.selectedTitle = currentContent.title || structured.selectedTitle;
          structured.bodyPlain = cleanedContent || structured.bodyPlain;
          if (currentContent.hashtags.length > 0) {
            structured.hashtags = currentContent.hashtags;
          }

          // ✅ 수정된 제목을 그대로 타이핑
          if (currentContent.title && currentContent.title.length > 0) {
            structured.selectedTitle = currentContent.title;
            resolved.title = currentContent.title;
            this.log('✅ 수정된 제목을 타이핑합니다.');
          }

          // 해시태그가 있으면 설정 (나중에 입력)
          if (currentContent.hashtags.length > 0) {
            structured.hashtags = currentContent.hashtags;
            resolved.hashtags = currentContent.hashtags;
          }

          // ✅ 수정된 본문 내용을 그대로 타이핑 (덮어쓰기)
          structured.bodyPlain = cleanedContent;
          resolved.content = cleanedContent;
          this.log('✅ 수정된 본문 내용을 타이핑합니다.');
          // 본문 타이핑은 아래 로직에서 계속 진행됨
        } else {
          this.log('ℹ️ 에디터에 내용이 없습니다. 생성된 콘텐츠를 적용합니다.');
        }
      }

      this.log('🧱 구조화된 콘텐츠를 체계적으로 적용합니다 (완전 순차 실행)...');
      this.log('📋 타이핑 순서: 제목 → Enter 2회 → 소제목(28px) → Enter 2회 → 이미지 → Enter 1회 → 본문(19px) → Enter 2회 → 반복');
      this.ensureNotCancelled();

      const frame = (await this.getAttachedFrame());
      const page = this.ensurePage();

      // 0. 글 톤 설정 (있는 경우)
      if (resolved.toneStyle) {
        await this.setToneStyle(resolved.toneStyle);
      }

      // 1. 도움말 닫기 버튼 클릭 (있는 경우)
      try {
        const helpCloseSelectors = [
          '.se-help-panel-close-button',
          '.se-hlpr-panel-close-button',
          '.se-hlpe-panel-close-button',
          'button[aria-label*="도움말"][aria-label*="닫기"]',
          'button[title*="도움말"][title*="닫기"]',
          'button[class*="help"][class*="close"]',
          'button[aria-label*="닫기"]',
          '.se-help-close',
        ];

        for (const selector of helpCloseSelectors) {
          const helpCloseButton = await frame.$(selector).catch(() => null);
          if (helpCloseButton) {
            const isVisible = await helpCloseButton.evaluate((el: Element) => {
              const htmlEl = el as HTMLElement;
              return htmlEl.offsetParent !== null && htmlEl.style.display !== 'none';
            }).catch(() => false);

            if (isVisible) {
              await helpCloseButton.click();
              await this.delay(this.DELAYS.MEDIUM);
              this.log('✅ 도움말 패널을 닫았습니다.');
              break;
            }
          }
        }
      } catch {
        // 도움말이 없으면 무시
      }

      // 1. 제목 입력 (본문 영역으로 자동 이동)
      this.log('📝 [1단계] 제목 입력 중...');
      await this.inputTitle(resolved.title);
      await this.delay(200); // 500ms → 200ms

      // 1-1. 서식 초기화 (제목 입력 후, 본문에서)
      this.log('🔄 에디터 서식 초기화 중...');
      await this.clearAllFormatting();
      await this.delay(300);

      // 1-2. CTA 상단 삽입 (위치가 top인 경우, skipCta가 false인 경우만)
      if (resolved.skipCta) {
        this.log(`   🚫 CTA 없이 발행하기가 선택되어 CTA를 추가하지 않습니다.`);
      } else if (resolved.ctaPosition === 'top' && resolved.ctas.length > 0) {
        for (let i = 0; i < resolved.ctas.length; i++) {
          const c = resolved.ctas[i];
          this.log(`   → CTA 버튼 상단 삽입 중... (${i + 1}/${resolved.ctas.length}, 텍스트: "${c.text}", 링크: "${resolved.affiliateLink || c.link || '#'}")`);
          // ✅ [핸심 수정] affiliateLink 우선 사용
          await this.insertCtaLink(resolved.affiliateLink || c.link || '#', c.text, 'top');
          await this.delay(this.DELAYS.MEDIUM);
        }
        this.log(`   ✅ CTA 버튼 상단 삽입 완료`);
      } else if (resolved.ctaPosition === 'top') {
        this.log(`   ⚠️ CTA 위치는 'top'이지만 CTA가 없어서 삽입하지 않습니다.`);
      }

      // 2. 서론(Introduction) 작성
      const headings = structured.headings || [];
      const bodyText = structured.bodyPlain || '';

      // ✅ 쇼핑커넥트 모드 감지 (for 루프 밖에서 미리 체크)
      const isShoppingConnectModeGlobal = resolved.contentMode === 'affiliate' || !!resolved.affiliateLink;

      // ✅ [쇼핑커넥트 모드] 고지문 최상단 → 서론 작성 + 썸네일 이미지 삽입
      if (isShoppingConnectModeGlobal && structured.introduction && structured.introduction.trim().length > 10) {
        this.log('📖 [쇼핑커넥트] 서론 작성 중...');

        // ✅ [수정] 제휴 마케팅 고지 문구를 최상단에 먼저 삽입 (썸네일보다 위!)
        if (resolved.affiliateLink) {
          const affiliateDisclosure = '※ 이 포스팅은 제휴 마케팅의 일환으로, 구매 시 소정의 수수료를 제공받을 수 있습니다.';
          this.log(`   📋[쇼핑커넥트] 제휴 마케팅 고지 문구 최상단 삽입 중...`);
          await page.keyboard.type(affiliateDisclosure, { delay: 15 });
          await this.delay(300);
          await page.keyboard.press('Enter');
          await page.keyboard.press('Enter');
          await this.delay(200);
          this.log(`   ✅ 제휴 마케팅 고지 문구 최상단 삽입 완료`);
        }

        // 썸네일 이미지 검색 ('🖼️ 썸네일' 키로 저장됨)
        let introImages = (resolved.images || []).filter((img: any) =>
          img.heading === '🖼️ 썸네일' || img.heading === '썸네일' || img.isThumbnail === true || img.isIntro === true
        );

        // ✅ [신규] 서론 이미지가 없으면 수집된 제품 이미지 + 제목 텍스트 오버레이로 썸네일 생성
        if (introImages.length === 0 && !resolved.skipImages) {
          this.log(`   🎨 서론 이미지 없음 → 수집된 제품이미지 + 제목 텍스트 오버레이 썸네일 생성 중...`);
          try {
            // ✅ [개선] 수집된 제품 이미지가 있으면 그 위에 텍스트 오버레이
            const { generateThumbnailWithTextOverlay, generateThumbnailWithTitle } = await import('./image/tableImageGenerator.js');
            const blogTitle = resolved.title || structured.selectedTitle || '상품 리뷰';

            // ✅ [수정] 수집된 원본 제품 이미지(collectedImages)를 우선 사용 (AI 생성 이미지 아님!)
            let productImagePath = '';

            // ✅ [2026-01-24 개선] 수집된 이미지 검색 - AI 생성 이미지 완전 제외!
            const allImages = resolved.images || [];
            const aiProviders = ['nano-banana-pro', 'stability', 'fal', 'pollinations', 'dalle', 'gemini', 'ideogram', 'ai'];

            this.log(`   🔍 [썸네일] 원본 제품 이미지 검색 시작 (AI 생성 이미지 완전 제외)`);

            // 1순위: collectedImages (수집된 원본 제품 이미지) - URL 직접 사용
            const collectedImages = resolved.collectedImages || [];
            if (collectedImages.length > 0) {
              const firstCollectedImg = collectedImages[0] as any;
              // ✅ URL 우선 사용 (로컬 파일보다 URL이 더 신뢰성 있음)
              productImagePath = firstCollectedImg?.url || firstCollectedImg?.thumbnailUrl || firstCollectedImg?.filePath || '';
              if (productImagePath) {
                this.log(`   📦 [1순위: collectedImages] 수집된 원본 이미지 URL 발견: ${productImagePath.substring(0, 60)}...`);
              }
            }

            // 2순위: resolved.images 중 수집된 이미지 (source=collected, AI 제외!)
            if (!productImagePath) {
              const collectedFromImages = allImages.find((img: any) =>
                (img.source === 'collected' || img.isCollected === true || img.provider === 'collected') &&
                !aiProviders.includes(img.provider) &&
                !img.isAiGenerated &&
                (img.url || img.filePath)
              );
              if (collectedFromImages) {
                productImagePath = (collectedFromImages as any)?.url || (collectedFromImages as any)?.filePath || '';
                this.log(`   📦 [2순위: source=collected] 수집된 이미지 발견`);
              }
            }

            // 3순위: 로컬 저장된 이미지 (AI 생성 이미지 완전 제외!)
            // ✅ [2026-01-24 개선] provider가 없는 이미지도 원본으로 간주 (수집된 이미지 포함)
            if (!productImagePath) {
              const localImage = allImages.find((img: any) => {
                const hasPath = img.filePath || img.url;
                const isAi = aiProviders.includes(img.provider) || img.isAiGenerated === true || img.provider === 'nano-banana-pro';
                // provider가 없거나 undefined인 경우는 원본 이미지로 간주
                return hasPath && !isAi;
              });
              if (localImage) {
                productImagePath = (localImage as any)?.url || (localImage as any)?.filePath || '';
                this.log(`   📦 [3순위: 로컬 저장] 비-AI 이미지 발견: provider=${(localImage as any)?.provider || 'none'}`);
              }
            }

            // 4순위: 첫 번째 소제목 이미지 (AI 제외, URL만 있는 경우)
            // ✅ [2026-01-24 신규] 소제목 이미지 중 첫 번째 비-AI 이미지 사용
            if (!productImagePath) {
              const headingImages = allImages.filter((img: any) =>
                img.heading && !img.heading.includes('썸네일') && !img.heading.includes('Thumbnail')
              );
              const firstHeadingImage = headingImages.find((img: any) => {
                const hasUrl = img.url || img.filePath;
                const isAi = aiProviders.includes(img.provider) || img.isAiGenerated === true;
                return hasUrl && !isAi;
              });
              if (firstHeadingImage) {
                productImagePath = (firstHeadingImage as any)?.url || (firstHeadingImage as any)?.filePath || '';
                this.log(`   📦 [4순위: 소제목 이미지] heading="${(firstHeadingImage as any)?.heading}" 이미지 발견`);
              }
            }

            // 5순위: 네이버 쇼핑 이미지 URL 직접 검색 (shop-phinf.pstatic.net, pstatic.net -> 원본 제품 이미지)
            // ✅ [2026-01-24 신규] AI 생성 여부와 관계없이 네이버 쇼핑 도메인 URL은 원본 제품 이미지
            if (!productImagePath) {
              const naverShoppingImage = allImages.find((img: any) => {
                const imageUrl = (img.url || img.filePath || '').toLowerCase();
                return imageUrl.includes('shop-phinf.pstatic.net') ||
                  imageUrl.includes('pstatic.net') ||
                  imageUrl.includes('shop.naver.com');
              });
              if (naverShoppingImage) {
                productImagePath = (naverShoppingImage as any)?.url || (naverShoppingImage as any)?.filePath || '';
                this.log(`   📦 [5순위: 네이버 쇼핑 URL] 원본 제품 이미지 URL 발견`);
              }
            }

            // 6순위: structuredContent에 저장된 수집 이미지 (collectedImages가 structuredContent에 있을 수 있음)
            if (!productImagePath && resolved.structuredContent) {
              const scImages = (resolved.structuredContent as any).collectedImages ||
                (resolved.structuredContent as any).images || [];
              const firstScImage = scImages.find((img: any) => {
                if (typeof img === 'string') {
                  return img.includes('pstatic.net') || img.includes('shop.naver.com');
                }
                const imageUrl = (img?.url || img?.filePath || img?.thumbnailUrl || '').toLowerCase();
                return imageUrl.includes('pstatic.net') || imageUrl.includes('shop.naver.com');
              });
              if (firstScImage) {
                productImagePath = typeof firstScImage === 'string'
                  ? firstScImage
                  : (firstScImage?.url || firstScImage?.filePath || firstScImage?.thumbnailUrl || '');
                this.log(`   📦 [6순위: structuredContent] 수집 이미지 발견`);
              }
            }

            // 수집된 원본 이미지가 없으면 그라데이션 배경 사용
            if (!productImagePath) {
              this.log(`   ⚠️ [썸네일] 수집된 원본 이미지 없음 → 그라데이션 배경 폴백`);
              this.log(`   📊 [디버깅] allImages.length=${allImages.length}, 각 이미지 정보:`);
              allImages.slice(0, 5).forEach((img: any, idx: number) => {
                this.log(`      [${idx}] heading=${img.heading || 'N/A'}, provider=${img.provider || 'N/A'}, isAi=${img.isAiGenerated ?? 'N/A'}, url=${(img.url || img.filePath || 'N/A').substring(0, 80)}`);
              });
            }

            let thumbnailPath: string;
            if (productImagePath) {
              // ✅ 수집된 제품 이미지 위에 텍스트 오버레이
              this.log(`   📷 수집된 제품 이미지 사용: ${productImagePath.substring(productImagePath.lastIndexOf('/') + 1)}`);
              thumbnailPath = await generateThumbnailWithTextOverlay(productImagePath, blogTitle);
            } else {
              // 폴백: 그라데이션 배경
              this.log(`   🎨 수집된 이미지 없음 → 그라데이션 배경 사용`);
              thumbnailPath = await generateThumbnailWithTitle(blogTitle);
            }

            if (thumbnailPath) {
              this.log(`   ✅ 서론 썸네일 생성 완료(제목 텍스트 포함: "${blogTitle.substring(0, 30)}...")`);
              await this.insertBase64ImageAtCursor(thumbnailPath);
              await this.delay(500);
              // 썸네일에 제휴 링크 삽입
              if (resolved.affiliateLink) {
                await this.attachLinkToLastImage(resolved.affiliateLink);
              }
            }
          } catch (thumbError) {
            this.log(`   ⚠️ 서론 썸네일 생성 실패: ${(thumbError as Error).message} `);
          }
        } else if (introImages.length > 0 && !resolved.skipImages) {
          this.log(`   📸 서론 이미지 ${introImages.length}개 삽입 중...`);
          await this.insertImagesAtCurrentCursor(introImages, page, frame, resolved.affiliateLink);
        }

        // 서론 본문 타이핑
        await this.typeBodyWithRetry(frame, page, structured.introduction.trim(), 19);
        await this.delay(this.DELAYS.MEDIUM);

        // 서론 후 구분선
        await this.insertHorizontalLine();
        await page.keyboard.press('Enter'); // ✅ [2026-01-19] 엔터 1회로 축소 (2회 → 1회)
        await this.delay(this.DELAYS.MEDIUM);

        this.log('   ✅ 서론 작성 완료');
      } else {
        this.log('   ⏭️ [설정] 서론 건너뛰기 (일반 모드 또는 서론 없음)');
      }

      // 3. 소제목과 본문을 순차적으로 작성 (완전 순차 실행)
      this.log(`📋 총 ${headings.length}개의 섹션을 순차적으로 작성합니다.`);

      // for문으로 완전 순차 실행 (클릭 절대 금지, 키보드만 사용)
      for (let i = 0; i < headings.length; i++) {
        this.ensureNotCancelled();
        const heading = headings[i];

        this.log(`\n📝[${i + 1}/${headings.length}] 섹션 "${heading.title}" 처리 시작...`);

        // ✅ 소제목은 heading.title을 그대로 사용 (bodyPlain에서 추출 로직 제거됨)
        // 이전의 "복구" 로직이 본문 내용을 소제목으로 잘못 추출하는 버그가 있었음
        const fullHeadingTitle = heading.title;

        try {
          // 클릭 완전 제거 - 현재 커서 위치에서 바로 시작

          // ✅ 쇼핑커넥트 모드 감지
          const isShoppingConnectMode = resolved.contentMode === 'affiliate' || !!resolved.affiliateLink;

          // ✅ 디버그 로그: 쇼핑커넥트 모드 판단 근거 출력
          this.log(`   🔍[쇼핑커넥트 체크] contentMode: "${resolved.contentMode}", affiliateLink: "${resolved.affiliateLink ? '있음' : '없음'}" → isShoppingConnectMode: ${isShoppingConnectMode} `);

          // a) 소제목 입력 (전체 소제목 사용)
          // ✅ [복구] 쇼핑커넥트 모드: 'underline' (4번, 밑줄) / 일반 모드: 'line' (2번, 버티컬 바)
          const quotationStyle = isShoppingConnectMode ? 'underline' : 'line';

          // ✅ [수정] 고지문은 이제 서론 삽입 전에 최상단에 삽입되므로 여기서는 생략

          // ✅ [수정] 모든 섹션에서 소제목 먼저 입력 (첫 번째 섹션 예외 제거)
          await this.typeSubtitleWithRetry(frame, page, fullHeadingTitle, 28, quotationStyle);
          const styleLabel = isShoppingConnectMode ? '4번-밑줄' : '2번-버티컬라인';
          this.log(`   ✅ 소제목 "${fullHeadingTitle}" 완료(인용구: ${styleLabel})`);

          // 소제목 입력 후 충분한 대기 (DOM 업데이트)
          await this.delay(2000); // 1500ms → 2000ms

          // b) 이미지 업로드 (skipImages가 false인 경우)
          if (!resolved.skipImages) {
            // ⚠️ 중요: 이미지 삽입 전 본문 영역으로 커서 이동 (제목 영역에 있으면 안 됨)
            this.log(`   🔄 본문 영역으로 커서 이동 확인 중...`);

            const cursorInfo = await frame.evaluate(() => {
              const titleElement = document.querySelector('.se-section-documentTitle');
              const bodyElement = document.querySelector('.se-section-text, .se-main-container');

              if (!bodyElement) return { inTitle: false, inBody: false };

              const selection = window.getSelection();
              if (!selection || selection.rangeCount === 0) {
                return { inTitle: false, inBody: false, needsMove: true };
              }

              const range = selection.getRangeAt(0);
              const container = range.commonAncestorContainer;
              const node = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

              const inTitle = titleElement && titleElement.contains(node);
              const inBody = bodyElement.contains(node);

              return { inTitle, inBody, needsMove: inTitle || !inBody };
            });

            if (cursorInfo.needsMove) {
              if (cursorInfo.inTitle) {
                this.log(`   ⚠️ 제목 영역에 커서가 있어 본문 영역으로 이동합니다.`);
              }

              await frame.evaluate(() => {
                const titleElement = document.querySelector('.se-section-documentTitle');
                const bodyElement = document.querySelector('.se-section-text, .se-main-container');

                if (!bodyElement) return;

                const selection = window.getSelection();
                if (!selection) return;

                const newRange = document.createRange();

                // 소제목 다음 위치 찾기 (최근 입력된 텍스트 다음)
                const textNodes: Node[] = [];
                const walker = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
                let textNode;
                while (textNode = walker.nextNode()) {
                  if (textNode.textContent && textNode.textContent.trim().length > 0) {
                    textNodes.push(textNode);
                  }
                }

                if (textNodes.length > 0) {
                  const lastTextNode = textNodes[textNodes.length - 1];
                  const parent = lastTextNode.parentElement;
                  if (parent) {
                    newRange.setStartAfter(parent);
                    newRange.collapse(true);
                  } else {
                    newRange.setStartAfter(lastTextNode);
                    newRange.collapse(true);
                  }
                } else {
                  // 텍스트 노드가 없으면 본문 영역 끝으로
                  newRange.selectNodeContents(bodyElement);
                  newRange.collapse(false);
                }

                selection.removeAllRanges();
                selection.addRange(newRange);
              });

              await this.delay(300); // 커서 이동 대기
              this.log(`   ✅ 본문 영역으로 커서 이동 완료`);
            } else {
              this.log(`   ✅ 커서가 이미 본문 영역에 있습니다.`);
            }
            // ✅ ImageManager에서 최신 이미지 가져오기 (사용자가 변경한 이미지 반영)
            // renderer.ts의 normalizeHeadingTitle과 동일한 정규화 함수 사용 (강화됨)
            const normalizeHeading = (text: string) => {
              if (!text) return '';
              return text
                .replace(/^#+\s*/, '')           // Markdown 해시 (#) 제거
                .replace(/\n/g, ' ')             // 줄바꿈을 공백으로
                .replace(/\r/g, ' ')             // 캐리지 리턴도 공백으로
                .replace(/\t/g, ' ')             // 탭도 공백으로
                .replace(/\s+/g, ' ')            // 여러 공백을 하나로
                .trim();                          // 앞뒤 공백 제거
            };

            // ✅ 더 공격적인 정규화 (소문자, 특수문자 제거)
            const aggressiveNormalize = (text: string) => {
              return normalizeHeading(text)
                .toLowerCase()                   // 소문자 변환
                .replace(/[^a-z0-9가-힣\s]/g, '') // 특수문자 제거 (한글/영문/숫자/공백만 유지)
                .replace(/\s+/g, ' ')            // 여러 공백을 하나로
                .trim();
            };

            // 원본 heading.title과 정규화된 값 모두 준비
            const originalHeadingTitle = heading.title;
            const normalizedHeadingTitle = normalizeHeading(originalHeadingTitle);

            this.log(`   🔍[ImageManager] 이미지 검색 시작`);
            this.log(`   🔍[ImageManager] 원본 소제목: "${originalHeadingTitle}"`);
            this.log(`   🔍[ImageManager] 정규화된 소제목: "${normalizedHeadingTitle}"`);

            // ImageManager에서 해당 소제목의 이미지 가져오기
            let headingImages: any[] = [];

            // 1. ImageManager에서 먼저 확인 (최우선)
            if (typeof (global as any).ImageManager !== 'undefined' && (global as any).ImageManager.imageMap) {
              const imageMap = (global as any).ImageManager.imageMap;

              this.log(`   🔍[ImageManager] ImageMap 크기: ${imageMap.size} 개`);

              // ImageMap의 모든 키 로그 출력
              const allKeys: string[] = Array.from(imageMap.keys()) as string[];
              this.log(`   🔍[ImageManager] ImageMap 키 목록(${allKeys.length}개): `);
              allKeys.forEach((key, idx) => {
                const normalizedKey = normalizeHeading(key);
                const exactMatch = key === normalizedHeadingTitle || key === originalHeadingTitle;
                const normalizedMatch = normalizedKey === normalizedHeadingTitle;
                const match = exactMatch || normalizedMatch ? '✅ 매칭!' : '';
                this.log(`      [${idx + 1}]"${key}"(정규화: "${normalizedKey}") ${match} `);
              });

              // 1-1. 정확한 키 매칭 시도 (정규화된 값)
              if (imageMap.has(normalizedHeadingTitle)) {
                const images = imageMap.get(normalizedHeadingTitle);
                if (images && images.length > 0) {
                  headingImages = images;
                  this.log(`   ✅[ImageManager] 정확한 키 매칭 성공(정규화): "${normalizedHeadingTitle}"에서 ${images.length}개 이미지 발견`);
                }
              }

              // 1-2. 원본 키 매칭 시도
              if (headingImages.length === 0 && imageMap.has(originalHeadingTitle)) {
                const images = imageMap.get(originalHeadingTitle);
                if (images && images.length > 0) {
                  headingImages = images;
                  this.log(`   ✅[ImageManager] 정확한 키 매칭 성공(원본): "${originalHeadingTitle}"에서 ${images.length}개 이미지 발견`);
                }
              }

              // 1-3. 정확한 매칭 실패 시 모든 키를 순회하며 정규화된 값으로 비교
              if (headingImages.length === 0) {
                for (const [key, images] of imageMap.entries()) {
                  const normalizedKey = normalizeHeading(key);
                  // 정규화된 값 비교 또는 원본 값 비교
                  if ((normalizedKey === normalizedHeadingTitle || key === originalHeadingTitle || key === normalizedHeadingTitle) && images && images.length > 0) {
                    headingImages = images;
                    this.log(`   ✅[ImageManager] 정규화 매칭 성공: "${key}"(정규화: "${normalizedKey}") → "${normalizedHeadingTitle}"에서 ${images.length}개 이미지 발견`);
                    break;
                  }
                }
              }

              if (headingImages.length === 0) {
                this.log(`   ℹ️[ImageManager] 이 소제목에 대한 사용자 지정 이미지가 없습니다. (Renderer 전용 기능)`);
              } else {
                this.log(`   ✅[ImageManager] 최종 매칭 성공: ${headingImages.length}개 이미지 발견`);
                headingImages.forEach((img, idx) => {
                  const filePath = img.filePath || img.savedToLocal || img.url || '경로 없음';
                  this.log(`      [${idx + 1}] ${filePath.substring(0, 80)}...`);
                });
              }
            } else {
              this.log(`   ℹ️[ImageManager] Main Process 컨텍스트: 전달된 이미지(resolved.images)를 사용합니다.`);
            }

            // ✅✅✅ 끝판왕 이미지 매칭 로직 ✅✅✅
            // 2. ImageManager에 없을 때 resolved.images에서 찾기
            if (headingImages.length === 0 && resolved.images && resolved.images.length > 0) {
              this.log(`   🔍[이미지 매칭] ImageManager에 이미지 없음, resolved.images에서 찾기 시도...`);
              this.log(`   🔍[이미지 매칭] 현재 소제목: "${heading.title}"(인덱스: ${i})`);
              this.log(`   🔍[이미지 매칭] 전체 이미지 수: ${resolved.images.length} 개`);

              // ✅ 방법 1: heading 이름으로 매칭 시도 (다양한 매칭 방법 적용)
              headingImages = resolved.images.filter(img => {
                const normalizedImgHeading = normalizeHeading(img.heading);
                const aggressiveImgHeading = aggressiveNormalize(img.heading);
                const aggressiveTargetHeading = aggressiveNormalize(heading.title);

                // 1. 정확한 매칭 (original === original)
                if (img.heading === heading.title) return true;
                // 2. 정규화된 매칭
                if (normalizedImgHeading === normalizedHeadingTitle) return true;
                // 3. 공격적 정규화 매칭 (소문자, 특수문자 무시)
                if (aggressiveImgHeading === aggressiveTargetHeading) return true;
                // 4. 포함 관계 매칭 (더 긴 쪽이 짧은 쪽을 포함)
                if (aggressiveImgHeading.includes(aggressiveTargetHeading) && aggressiveTargetHeading.length > 5) return true;
                if (aggressiveTargetHeading.includes(aggressiveImgHeading) && aggressiveImgHeading.length > 5) return true;

                return false;
              });

              // ✅ 디버그: 매칭 실패 시 상세 로그
              if (headingImages.length === 0) {
                this.log(`   ⚠️[매칭 실패] 소제목 "${heading.title}" 에 대응하는 이미지를 찾지 못했습니다.`);
                this.log(`   🔍 resolved.images의 heading 목록: `);
                resolved.images.forEach((img, idx) => {
                  this.log(`      [${idx}]"${img.heading}"(normalized: "${normalizeHeading(img.heading)}")`);
                });
              }

              if (headingImages.length > 0) {
                this.log(`   ✅[heading 매칭] resolved.images에서 ${headingImages.length}개 이미지 발견`);
              } else {
                // ✅ Full-Auto 모드에서는 인덱스 기반 폴백 허용 (2026-01-13 수정)
                // Main Process(ImageManager 없음) + 풀오토 모드에서는 인덱스로 할당
                const isMainProcess = typeof (global as any).ImageManager === 'undefined';
                const isFullAutoMode = resolved.isFullAuto === true;

                if (isMainProcess && isFullAutoMode && resolved.images && i < resolved.images.length) {
                  // ✅ Full-Auto 폴백: 인덱스 기반 할당 (이미 할당된 이미지 제외)
                  const candidateImage = resolved.images[i];
                  if (candidateImage && candidateImage.filePath) {
                    headingImages = [candidateImage];
                    this.log(`   ✅[Full - Auto 폴백] 인덱스 ${i}번 이미지 할당: "${candidateImage.heading?.substring(0, 30)}..."`);
                  } else {
                    this.log(`   ⚠️[Full - Auto 폴백] 인덱스 ${i}번 이미지가 없거나 경로 없음`);
                    headingImages = [];
                  }
                } else {
                  // Renderer 컨텍스트 또는 일반 모드: 기존 로직 유지
                  this.log(`   ℹ️[이미지 매칭] 이 소제목에 매칭된 이미지가 없습니다 → 이미지 없이 진행`);
                  headingImages = [];
                }
              }

            } else if (headingImages.length > 0) {
              // ✅ ImageManager에서 이미지를 찾았으면 resolved.images 사용 안 함
              this.log(`   ✅[우선순위] ImageManager에서 ${headingImages.length}개 이미지 발견 → 사용자 지정 이미지 우선`);
            }

            // ✅ [1단계] 본문 및 이미지 데이터 준비
            const currentFrame = (await this.getAttachedFrame());
            let cleanBody = '';

            // 1-1. 본문 추출 (항상 실행)
            if (heading.content && heading.content.trim().length > 30) {
              cleanBody = heading.content.trim();
            } else {
              const headingBody = this.extractBodyForHeading(bodyText, heading.title, i, headings.length, headings);
              cleanBody = headingBody.trim();

              if (cleanBody.length < 30) {
                const sentences = bodyText.split(/(?<=[.!?])\s+/).filter(s => s.trim());
                const sentencesPerHeading = Math.max(5, Math.ceil(sentences.length / headings.length));
                const startIdx = i * sentencesPerHeading;
                const endIdx = Math.min(startIdx + sentencesPerHeading, sentences.length);
                cleanBody = sentences.slice(startIdx, endIdx).join(' ').trim();
              }
            }

            // 제목 중복 등 기초 정리 + URL 링크 텍스트 제거
            const escapedTitleForRegex = heading.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            cleanBody = cleanBody
              .replace(new RegExp(`^\\s * ${escapedTitleForRegex} \\s *:?\\s * `, 'i'), '')
              .replace(/🔗[^\n]*\n?/g, '')
              .replace(/도움이\s*되(었|셧|셨)으면[^\n]*/gi, '')
              // ✅ URL 링크 텍스트 제거 (이미지에 링크가 걸리므로 본문에 텍스트로 나올 필요 없음)
              .replace(/https?:\/\/[^\s\n]+/g, '')
              .replace(/\n{3,}/g, '\n\n') // 연속 줄바꿈 정리
              .trim();

            // 1-2. 이미지 분류
            const topImages = headingImages.filter((img: any) => (img.position || 'top') === 'top');
            const middleImages = headingImages.filter((img: any) => img.position === 'middle');
            const bottomImages = headingImages.filter((img: any) => img.position === 'bottom');

            // ✅ [2단계] 순차적 삽입
            // 쇼핑커넥트 첫 번째 섹션: 이미지 → 소제목 → 본문
            // 그 외: 소제목(위에서 이미 삽입됨) → 이미지 → 본문

            // A. 모든 이미지 삽입 (Top, Middle, Bottom 통합 또는 Top 우선)
            const allSectionImages = [
              ...topImages,
              ...middleImages,
              ...bottomImages
            ];

            if (allSectionImages.length > 0) {
              this.log(`   📸[이미지] 총 ${allSectionImages.length}개 이미지 삽입 중...`);
              await this.insertImagesAtCurrentCursor(allSectionImages, page, currentFrame, resolved.affiliateLink);
            }

            // B. 본문 타이핑
            if (cleanBody.trim()) {
              this.log(`   ⌨️[본문] 타이핑 시작...`);
              await this.typeBodyWithRetry(currentFrame, page, cleanBody, 19);
            }

            // ✅ 쇼핑커넥트 모드: 표 이미지 삽입
            if (isShoppingConnectMode) {
              const productName = resolved.title?.split(' ').slice(0, 5).join(' ') || '제품';
              const fullBodyText = bodyText || cleanBody;

              // C-1. 첫 번째 섹션: 제품 스펙 표 이미지
              if (i === 0) {
                try {
                  this.log(`   📊[쇼핑커넥트] 제품 스펙 표 이미지 생성 중...`);

                  let specTablePath: string | null = null;

                  // ✅ [핵심 수정] 공식 네이버 쇼핑 API 사용 (캡차 없음!)
                  // 1차: 제휴링크에서 브랜드/스토어명 추출하여 검색
                  // 2차: 제품명으로 검색
                  let searchQuery = productName;
                  let resolvedAffiliateUrl = resolved.affiliateLink || '';

                  // ✅ [NEW] naver.me 단축 URL 리다이렉트 추적
                  if (resolvedAffiliateUrl.includes('naver.me')) {
                    this.log(`   🔗 naver.me 단축 URL 감지, 리다이렉트 추적 중...`);
                    try {
                      let currentUrl = resolvedAffiliateUrl;
                      for (let i = 0; i < 5; i++) {
                        const response = await fetch(currentUrl, {
                          method: 'HEAD',
                          redirect: 'manual',
                          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                        });
                        if (response.status >= 300 && response.status < 400) {
                          const location = response.headers.get('location');
                          if (location) {
                            currentUrl = location.startsWith('/')
                              ? `${new URL(currentUrl).origin}${location} `
                              : location;
                            // 스마트스토어/브랜드스토어 URL 발견 시 중단
                            if (currentUrl.includes('smartstore.naver.com') || currentUrl.includes('brand.naver.com')) {
                              resolvedAffiliateUrl = currentUrl;
                              this.log(`   ✅ 최종 스토어 URL: ${currentUrl.substring(0, 50)}...`);
                              break;
                            }
                          } else break;
                        } else break;
                      }
                    } catch (redirectError) {
                      this.log(`   ⚠️ 리다이렉트 추적 실패: ${(redirectError as Error).message} `);
                    }
                  }

                  // ✅ 제휴링크 URL에서 브랜드/스토어명 추출
                  let extractedStoreName: string | null = null;
                  if (resolvedAffiliateUrl) {
                    const url = resolvedAffiliateUrl;
                    // brand.naver.com 패턴
                    const brandMatch = url.match(/brand\.naver\.com\/([^\/\?]+)/);
                    if (brandMatch) {
                      const brandId = brandMatch[1];
                      const brandMap: Record<string, string> = {
                        'samsungelectronics': '삼성전자',
                        'lgelectronics': 'LG전자',
                        'dyson': '다이슨',
                        'apple': '애플',
                        'philips': '필립스',
                      };
                      const brandName = brandMap[brandId.toLowerCase()] || brandId;
                      extractedStoreName = brandName;
                      searchQuery = `${brandName} ${productName.split(' ').slice(0, 3).join(' ')} `;
                      this.log(`   📎 브랜드스토어 감지: ${brandName} `);
                    }
                    // smartstore.naver.com 패턴
                    const storeMatch = url.match(/smartstore\.naver\.com\/([^\/\?]+)/);
                    if (storeMatch) {
                      const storeName = storeMatch[1];
                      extractedStoreName = storeName;
                      searchQuery = `${storeName} ${productName.split(' ').slice(0, 3).join(' ')} `;
                      this.log(`   📎 스마트스토어 감지: ${storeName} `);
                    }
                  }

                  // ✅ [완벽 해결] naver.me URL인데 스토어명 추출 실패 시 Puppeteer로 재시도
                  if (!extractedStoreName && resolved.affiliateLink?.includes('naver.me') && page) {
                    this.log(`   🔄 스토어명 추출 실패 → Puppeteer로 최종 URL 추적...`);
                    try {
                      // 현재 발행 중인 브라우저의 새 탭 사용
                      const trackPage = await page.browser().newPage();
                      await trackPage.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15');

                      // 리소스 차단
                      await trackPage.setRequestInterception(true);
                      trackPage.on('request', (req: any) => {
                        const type = req.resourceType();
                        if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                          req.abort();
                        } else {
                          req.continue();
                        }
                      });

                      await trackPage.goto(resolved.affiliateLink, { waitUntil: 'domcontentloaded', timeout: 10000 });

                      // 최대 5초 대기
                      for (let wait = 0; wait < 5000; wait += 300) {
                        await this.delay(300);
                        const currentUrl = trackPage.url();
                        if (currentUrl.includes('smartstore.naver.com') || currentUrl.includes('brand.naver.com')) {
                          const storeMatch = currentUrl.match(/(?:smartstore|brand)\.naver\.com\/([^\/\?]+)/);
                          if (storeMatch) {
                            extractedStoreName = storeMatch[1];
                            searchQuery = `${extractedStoreName} ${productName.split(' ').slice(0, 3).join(' ')} `;
                            this.log(`   ✅ Puppeteer로 스토어명 확보: ${extractedStoreName} `);
                          }
                          break;
                        }
                      }

                      // ✅ [핵심 수정] 에러 페이지 감지 - OG 태그 확인
                      const ogTitle = await trackPage.evaluate(() => {
                        const meta = document.querySelector('meta[property="og:title"]');
                        return meta?.getAttribute('content') || '';
                      });

                      const errorKeywords = ['에러', '오류', 'error', '접근', '차단', '제한', '캡차', '시스템'];
                      const isErrorPage = errorKeywords.some(kw => ogTitle.toLowerCase().includes(kw.toLowerCase()));

                      if (isErrorPage) {
                        this.log(`   ❌ 에러 페이지 감지! "${ogTitle.substring(0, 30)}..."`);
                        this.log(`   🔄 제품명 기반 검색으로 폴백: "${productName}"`);
                        extractedStoreName = null;
                        searchQuery = productName;  // 제품명으로 폴백
                      }

                      await trackPage.close();
                    } catch (puppeteerError) {
                      this.log(`   ⚠️ Puppeteer 추적 실패: ${(puppeteerError as Error).message} `);
                      this.log(`   🔄 제품명 기반 검색으로 폴백: "${productName}"`);
                      searchQuery = productName;  // 실패 시 제품명으로 폴백
                    }
                  }

                  this.log(`   🔍 공식 API로 상품 정보 조회 중: "${searchQuery.substring(0, 40)}..."`);
                  try {
                    const { searchShopping, stripHtmlTags } = await import('./naverSearchApi.js');
                    const searchResult = await searchShopping({ query: searchQuery, display: 1 });

                    if (searchResult.items.length > 0) {
                      const item = searchResult.items[0];
                      // ✅ [2026-01-18] 제품명 정리: 끝에 쉼표, 마침표 등 불필요한 문자 제거
                      const cleanTitle = stripHtmlTags(item.title)
                        .substring(0, 50)
                        .replace(/[,.\s]+$/g, '') // 끝에 쉼표, 마침표, 공백 제거
                        .trim();
                      const specs = [
                        { label: '제품명', value: cleanTitle },
                        { label: '가격', value: item.lprice ? `${parseInt(item.lprice).toLocaleString()}원` : '가격 문의' },
                        { label: '브랜드', value: item.brand || item.maker || '' },
                        { label: '판매처', value: item.mallName || '네이버 쇼핑' },
                        { label: '카테고리', value: [item.category1, item.category2].filter(Boolean).join(' > ') || '' },
                      ].filter(s => s.value && s.value.length > 0);

                      this.log(`   ✅ 공식 API 조회 성공: ${specs.length}개 스펙`);
                      specTablePath = await generateProductSpecTableImage(productName, specs);
                    } else {
                      this.log(`   ⚠️ 공식 API 검색 결과 없음, 기본 스펙 사용`);
                    }
                  } catch (apiError) {
                    this.log(`   ⚠️ 공식 API 호출 실패: ${(apiError as Error).message} `);
                  }


                  // ✅ [2026-01-18 수정] API 실패 시 스펙 표 대신 장단점 표 생성
                  if (!specTablePath) {
                    this.log(`   📝 API 실패 - 본문에서 장단점 추출하여 표 생성...`);
                    // ✅ 제품명 정리: 끝에 쉼표, 마침표 등 불필요한 문자 제거
                    const cleanProductName = productName
                      .replace(/[,.\s]+$/g, '')
                      .trim();
                    // ✅ 본문에서 장단점 추출
                    const { pros, cons } = extractProsConsFromContent(fullBodyText);
                    if (pros.length >= 1 || cons.length >= 1) {
                      // ✅ [2026-01-18] useAiTableImage 옵션에 따라 AI 표 또는 HTML 표 선택
                      if (resolved.useAiTableImage) {
                        const { generateProsConsWithAI } = await import('./image/nanoBananaProGenerator.js');
                        specTablePath = await generateProsConsWithAI(cleanProductName, pros, cons) || await generateProsConsTableImage(cleanProductName, pros, cons);
                        this.log(`   🤖 AI 장단점 표 생성 시도...`);
                      } else {
                        specTablePath = await generateProsConsTableImage(cleanProductName, pros, cons);
                      }
                      this.log(`   ✅ 장단점 표 생성 완료: 장점 ${pros.length}개, 단점 ${cons.length}개`);
                    } else {
                      this.log(`   ⚠️ 장단점 추출 실패 - 표 생성 건너뜀`);
                    }
                  }

                  // ✅ 표 이미지 삽입
                  if (specTablePath) {
                    await page.keyboard.press('Enter');
                    await this.delay(300);
                    await this.insertBase64ImageAtCursor(specTablePath);
                    await this.delay(1000);

                    // 표 이미지에도 제휴 링크 삽입
                    if (resolved.affiliateLink) {
                      await this.attachLinkToLastImage(resolved.affiliateLink);
                    }
                    this.log(`   ✅ 제품 스펙 표 이미지 삽입 완료`);
                  } else {
                    this.log(`   ⚠️ 스펙이 없어 표 생성 건너뜀`);
                  }
                } catch (tableError) {
                  this.log(`   ⚠️ 제품 스펙 표 생성 실패: ${(tableError as Error).message} `);
                }
              }

              // C-2. 마지막 섹션: 장단점 비교 표 이미지
              if (i === headings.length - 1) {
                try {
                  this.log(`   📊[쇼핑커넥트] 장단점 비교 표 이미지 생성 중...`);
                  const { pros, cons } = extractProsConsFromContent(fullBodyText);
                  if (pros.length >= 1 && cons.length >= 1) {
                    // ✅ [2026-01-18] useAiTableImage 옵션에 따라 AI 표 또는 HTML 표 선택
                    let prosConsTablePath: string;
                    if (resolved.useAiTableImage) {
                      const { generateProsConsWithAI } = await import('./image/nanoBananaProGenerator.js');
                      prosConsTablePath = await generateProsConsWithAI(productName, pros, cons) || await generateProsConsTableImage(productName, pros, cons);
                      this.log(`   🤖 AI 장단점 표 생성 시도...`);
                    } else {
                      prosConsTablePath = await generateProsConsTableImage(productName, pros, cons);
                    }
                    await page.keyboard.press('Enter');
                    await this.delay(300);
                    await this.insertBase64ImageAtCursor(prosConsTablePath);
                    await this.delay(1000); // 렌더링 대기

                    // ✅ 장단점 표 이미지에도 제휴 링크 삽입
                    if (resolved.affiliateLink) {
                      await this.attachLinkToLastImage(resolved.affiliateLink);
                    }
                    this.log(`   ✅ 장단점 비교 표 이미지 삽입 완료`);
                  }
                } catch (tableError) {
                  this.log(`   ⚠️ 장단점 표 생성 실패: ${(tableError as Error).message} `);
                }
              }

              // C-3. 2번 섹션 본문 아래: CTA 배너 이미지 추가
              if (i === 1 && resolved.affiliateLink) {
                try {
                  this.log(`   📢[쇼핑커넥트] 2번 섹션 본문 아래 CTA 배너 삽입 중...`);

                  let ctaBannerPath: string;

                  // ✅ [2026-01-22] 배너 우선순위: autoBannerGenerate > customBannerPath > 자동생성
                  if (resolved.autoBannerGenerate) {
                    // 랜덤 배너 자동 생성
                    const ctaHooks = [
                      '[공식] 최저가 보러가기 →',
                      '✓ 할인가 확인하기 →',
                      '지금 바로 구매하기 →',
                      '▶ 상품 자세히 보기',
                      '할인 혜택 확인 →',
                    ];
                    const randomHook = ctaHooks[Math.floor(Math.random() * ctaHooks.length)];
                    ctaBannerPath = await generateCtaBannerImage(randomHook, productName);
                    this.log(`   🎲 [랜덤 배너] 2번 섹션 배너 자동 생성: ${randomHook}`);
                  } else if (resolved.customBannerPath) {
                    // 커스텀 배너 사용
                    ctaBannerPath = resolved.customBannerPath;
                    this.log(`   🎨 커스텀 배너 사용: ${ctaBannerPath.split(/[/\\]/).pop()}`);
                  } else {
                    // 기본 자동 생성 (랜덤 아닌 고정 풀에서)
                    const ctaHooks = [
                      '[공식] 최저가 보러가기 →',
                      '✓ 할인가 확인하기 →',
                      '지금 바로 구매하기 →',
                    ];
                    const randomHook = ctaHooks[Math.floor(Math.random() * ctaHooks.length)];
                    ctaBannerPath = await generateCtaBannerImage(randomHook, productName);
                  }

                  await page.keyboard.press('Enter');
                  await this.delay(300);
                  await this.insertBase64ImageAtCursor(ctaBannerPath);
                  await this.delay(1000);

                  // ✅ 배너에 제휴 링크 삽입
                  await this.attachLinkToLastImage(resolved.affiliateLink);
                  this.log(`   ✅ 2번 섹션 CTA 배너 + 제휴 링크 삽입 완료`);
                } catch (bannerError) {
                  this.log(`   ⚠️ 2번 섹션 CTA 배너 생성 실패: ${(bannerError as Error).message} `);
                }
              }
            }

          } else {
            // 이미지 건너뛰기 모드일 때
            const cFrame = (await this.getAttachedFrame());
            let cBody = '';
            if (heading.content && heading.content.trim().length > 30) {
              cBody = heading.content.trim();
            } else {
              cBody = this.extractBodyForHeading(bodyText, heading.title, i, headings.length, headings).trim();
            }

            if (cBody.trim()) {
              this.log(`   ⌨️ 본문 타이핑 시작(이미지 없음)...`);
              await this.typeBodyWithRetry(cFrame, page, cBody, 19);
            }
          }

          // d) CTA 중간 삽입 (위치가 middle이고 중간 지점인 경우, skipCta가 false인 경우만)
          if (!resolved.skipCta && resolved.ctaPosition === 'middle' && resolved.ctas.length > 0) {
            const middleIndex = Math.floor(headings.length / 2);
            if (i === middleIndex - 1) { // 중간 지점 직전 섹션 완료 후
              for (let k = 0; k < 2; k++) {
                await page.keyboard.press('Enter');
                await this.delay(this.DELAYS.MEDIUM);
              }
              for (let ci = 0; ci < resolved.ctas.length; ci++) {
                const c = resolved.ctas[ci];
                this.log(`   → CTA 버튼 중간 삽입 중... (${ci + 1}/${resolved.ctas.length}, 텍스트: "${c.text}", 링크: "${resolved.affiliateLink || c.link || '#'}")`);
                // ✅ [핸심 수정] affiliateLink 우선 사용
                await this.insertCtaLink(resolved.affiliateLink || c.link || '#', c.text, 'middle');
                await this.delay(this.DELAYS.MEDIUM);
              }
              this.log(`   ✅ CTA 버튼 중간 삽입 완료`);
            }
          }

          // e) 다음 섹션 준비 (마지막 섹션이 아니면 구분선 추가)
          if (i < headings.length - 1) {
            this.log(`   → 구분선 생성 중...`);
            await this.insertHorizontalLine();
            await this.delay(this.DELAYS.MEDIUM);
            await page.keyboard.press('Enter'); // ✅ [2026-01-19] 엔터 1회로 축소 (2회 → 1회)
            await this.delay(this.DELAYS.MEDIUM);
            this.log(`   ✅ 구분선 추가 완료`);
          }

          this.log(`   ✅ 섹션[${i + 1}/${headings.length}]완료\n`);

          // ✅ 다음 섹션 준비: Frame 재설정 (마지막 섹션이 아닐 때만)
          if (i < headings.length - 1) {
            await this.delay(this.DELAYS.LONG); // 500ms 대기
            try {
              await this.switchToMainFrame();
              this.log(`   ✅ 다음 섹션을 위한 Frame 재설정 완료`);
            } catch (frameError) {
              this.log(`   ⚠️ Frame 재설정 실패(무시하고 계속): ${(frameError as Error).message} `);
            }
          }
        } catch (error) {
          this.log(`   ❌ 섹션[${i + 1}/${headings.length}]실패: ${(error as Error).message} `);
          throw error;
        }
      }

      // ✅ [쇼핑커넥트 모드] 마무리(Conclusion) 작성 + 이미지 삽입
      if (isShoppingConnectModeGlobal && structured.conclusion && structured.conclusion.trim().length > 10) {
        this.log('📝 [쇼핑커넥트] 마무리 작성 중...');

        // ✅ [2026-01-19 수정] 마무리 전 엔터 제거 (중복 방지)
        // 마지막 소제목 본문 후 바로 마무리글로 이어짐
        await this.delay(this.DELAYS.MEDIUM);

        // 마무리 이미지 검색 ('📝 마무리' 키로 저장됨) - 제거됨 (사용자 요청)
        // ✅ 쇼핑커넥트 마무리는 이미지 없이 본문만 (사용자 요청)

        // 마무리 본문 타이핑
        const currentFrame = (await this.getAttachedFrame());
        await this.typeBodyWithRetry(currentFrame, page, structured.conclusion.trim(), 19);
        await this.delay(this.DELAYS.MEDIUM);

        // ✅ [2026-01-18 삭제] 마무리 후 2번 배너 삽입 제거 (사용자 요청)
        // 배너가 CTA 전에만 삽입되도록 하고, 마무리글 아래 배너는 삭제
        // (모든 사용자가 같은 배너를 사용하면 문제 발생 가능)
        // if (resolved.affiliateLink) {
        //   try {
        //     this.log(`   📢[쇼핑커넥트] 마무리 후 2번 배너 삽입 중...`);
        //     const { generateCtaBannerImage } = await import('./image/tableImageGenerator.js');
        //     const ctaHooks = [
        //       '✓ 마음에 드셨다면 여기서 구매!',
        //       '▶ 지금 최저가 확인하기 →',
        //       '놓치면 후회! 지금 바로 →',
        //     ];
        //     const randomHook = ctaHooks[Math.floor(Math.random() * ctaHooks.length)];
        //     const productName = resolved.title?.split(' ').slice(0, 5).join(' ') || '제품';
        //     const banner2Path = await generateCtaBannerImage(randomHook, productName);
        //     await page.keyboard.press('Enter');
        //     await this.delay(300);
        //     await this.insertBase64ImageAtCursor(banner2Path);
        //     await this.delay(500);
        //     // 배너에 제휴 링크 삽입
        //     await this.attachLinkToLastImage(resolved.affiliateLink);
        //     this.log(`   ✅ 마무리 후 2번 배너 + 제휴 링크 삽입 완료`);
        //   } catch (bannerError) {
        //     this.log(`   ⚠️ 마무리 2번 배너 생성 실패: ${(bannerError as Error).message} `);
        //   }
        // }

        this.log('   ✅ 마무리 작성 완료');
      }

      // ✅ 빠른 검증 (성능 최적화)
      this.log('\n✅ 콘텐츠 작성 완료! 발행 준비 중...');

      // 간단한 이미지 배치 현황만 로깅
      if (resolved.images && resolved.images.length > 0) {
        this.log(`   📊 이미지 ${Math.min(resolved.images.length, headings.length)}개 배치 완료`);
      }

      // 3. 마지막 본문 끝에서 Enter 2회 (CTA와 본문 사이 간격)
      this.log('📝 [마지막 단계] CTA 및 해시태그 영역 준비 중...');
      this.log('   → Enter 2회 입력 (CTA 삽입 준비)');
      for (let i = 0; i < 2; i++) {
        await page.keyboard.press('Enter');
        await this.delay(this.DELAYS.SHORT); // 150ms
        this.log(`   ✅ Enter ${i + 1}/2 완료`);
      }

      // 4. CTA 버튼 삽입 (해시태그 전에 배치, skipCta가 false인 경우만)
      // ✅ 쇼핑커넥트 모드: CTA가 없어도 자동으로 후킹 CTA 생성
      let effectiveCtas = resolved.ctas || [];
      if (!resolved.skipCta && resolved.affiliateLink && effectiveCtas.length === 0) {
        // 🛒 쇼핑커넥트 자동 CTA 생성 (구매 결심 유도 후킹 문구)
        const hookTexts = [
          '🔥 지금 바로 확인하기 →',
          '✨ 특가 혜택 보러가기 →',
          '🎁 한정 수량 확인하기 →',
          '💰 최저가로 구매하기 →',
          '🛒 품절 전에 확인하기 →'
        ];
        const randomHook = hookTexts[Math.floor(Math.random() * hookTexts.length)];
        effectiveCtas = [{ text: randomHook, link: resolved.affiliateLink }];
        this.log(`   🛒 [쇼핑커넥트] 자동 CTA 생성: "${randomHook}"`);
      }

      if (!resolved.skipCta && effectiveCtas.length > 0) {
        const ctaPosition = resolved.ctaPosition || 'bottom'; // 풀오토는 항상 하단

        // ✅ [2026-01-19 버그 수정] 쇼핑커넥트 모드에서는 CTA를 1개로 제한 (링크카드 중복 방지)
        if (resolved.affiliateLink && effectiveCtas.length > 1) {
          this.log(`   ⚠️ [쇼핑커넥트] CTA ${effectiveCtas.length}개 → 1개로 제한 (링크카드 중복 방지)`);
          effectiveCtas = [effectiveCtas[0]]; // 첫 번째 CTA만 사용
        }

        // ✅ [수정] 제휴 마케팅 고지 문구는 최상단(첫 번째 섹션)에서 삽입됨
        // 이전: CTA 앞에 삽입 → 변경: 글 최상단(1번 소제목 위)에 삽입

        for (let i = 0; i < effectiveCtas.length; i++) {
          const c = effectiveCtas[i];

          // ✅ 쇼핑커넥트 모드(affiliateLink 존재 시)면 강화된 CTA 사용 (하단에만 적용)
          if (resolved.affiliateLink && ctaPosition === 'bottom') {
            this.log(`   → 쇼핑커넥트 모드: 강화된 CTA 하단 삽입 중... (${i + 1}/${effectiveCtas.length})`);
            // ✅ [디버깅] 이전글 정보 확인
            this.log(`   📋 [디버깅] 이전글 제목: ${resolved.previousPostTitle || '없음'}`);
            this.log(`   📋 [디버깅] 이전글 URL: ${resolved.previousPostUrl || '없음'}`);
            this.log(`   📋 [디버깅] 제휴링크: ${resolved.affiliateLink}`);

            // ✅ [2026-01-19] 쇼핑커넥트 CTA 로직 재구성
            // - 첫 번째 CTA(i===0): 배너 + affiliateLink (제품 CTA)
            // - 추가 CTA들(i>0): 각자의 link 사용 (사용자 추가 CTA)
            // - 마지막 CTA 후: 이전글 삽입
            const isFirstCta = i === 0;
            const isLastCta = i === effectiveCtas.length - 1;

            if (isFirstCta) {
              // ✅ 첫 번째 CTA: 배너 이미지 + 제휴링크 (Enhanced CTA)
              this.log(`   🛒 [쇼핑커넥트] 첫 번째 CTA (제품): \"${c.text}\"`);
              await this.insertEnhancedCta(
                resolved.affiliateLink, // 제휴링크
                c.text,
                resolved.title || '',
                undefined, // 이전글은 마지막에 별도 삽입
                undefined,
                resolved.hashtags,
                resolved.useAiBanner,
                resolved.customBannerPath,
                resolved.autoBannerGenerate // ✅ [2026-01-21] 배너 자동 랜덤 생성
              );
            } else {
              // ✅ 추가 CTA들: 배너 없이 구분선 + 후킹 + 링크만 (사용자 추가 CTA)
              this.log(`   📎 [추가 CTA ${i}] \"${c.text}\" → ${c.link || '#'}`);
              const page = this.ensurePage();

              // 구분선 삽입
              const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
              await page.keyboard.press('Enter');
              await page.keyboard.type(divider, { delay: 5 });
              await page.keyboard.press('Enter');

              // 후킹 문구 + 링크 삽입
              await page.keyboard.type(`📎 ${c.text}`, { delay: 10 });
              await page.keyboard.press('Enter');
              await page.keyboard.type(`👉 ${c.link || '#'}`, { delay: 10 });
              await page.keyboard.press('Enter');

              // 링크 카드 로딩 대기
              await this.delay(3000);
            }

            // ✅ 마지막 CTA 후: 이전글 삽입
            if (isLastCta && resolved.previousPostUrl) {
              this.log(`   📖 [이전글] 같은 카테고리 이전글 삽입`);
              const page = this.ensurePage();

              // 구분선
              const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
              await page.keyboard.press('Enter');
              await page.keyboard.type(divider, { delay: 5 });
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
              await page.keyboard.type(randomPrevHook, { delay: 10 });
              await page.keyboard.press('Enter');
              await page.keyboard.type(`📖 ${resolved.previousPostTitle || '이전 글 보기'}`, { delay: 10 });
              await page.keyboard.press('Enter');
              await page.keyboard.type(`👉 ${resolved.previousPostUrl}`, { delay: 10 });
              await page.keyboard.press('Enter');

              // 링크 카드 로딩 대기
              await this.delay(3000);
              this.log(`   ✅ 이전글 삽입 완료 (후킹: ${randomPrevHook})`);
            }
          } else {
            // ✅ [2026-01-22] 일반 모드 (affiliateLink 없음): CTA + 이전글 삽입
            const isLastCta = i === effectiveCtas.length - 1;
            const page = this.ensurePage();

            // ✅ CTA가 있으면 CTA 삽입 (구분선 + 후킹 + 링크)
            if (c.text && c.link) {
              this.log(`   📎 [일반 CTA ${i + 1}] \"${c.text}\" → ${c.link}`);

              // 구분선 삽입
              const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
              await page.keyboard.press('Enter');
              await page.keyboard.type(divider, { delay: 5 });
              await page.keyboard.press('Enter');

              // 후킹 문구 + 링크 삽입
              await page.keyboard.type(`📎 ${c.text}`, { delay: 10 });
              await page.keyboard.press('Enter');
              await page.keyboard.type(`👉 ${c.link}`, { delay: 10 });
              await page.keyboard.press('Enter');

              // 링크 카드 로딩 대기
              await this.delay(3000);
            }

            // ✅ 마지막 CTA 후: 이전글 삽입 (중복 방지)
            if (isLastCta && resolved.previousPostUrl) {
              this.log(`   📖 [이전글] 같은 카테고리 이전글 연결`);

              // 구분선
              const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
              await page.keyboard.press('Enter');
              await page.keyboard.type(divider, { delay: 5 });
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
              await page.keyboard.type(randomPrevHook, { delay: 10 });
              await page.keyboard.press('Enter');
              await page.keyboard.type(`📖 ${resolved.previousPostTitle || '이전 글 보기'}`, { delay: 10 });
              await page.keyboard.press('Enter');
              await page.keyboard.type(`👉 ${resolved.previousPostUrl}`, { delay: 10 });
              await page.keyboard.press('Enter');

              // 링크 카드 로딩 대기
              await this.delay(3000);
              this.log(`   ✅ 이전글 연결 완료 (후킹: ${randomPrevHook})`);
            }
          }
          await this.delay(500); // CTA 삽입 후 충분한 대기 시간
        }
        this.log(`   ✅ CTA 버튼 삽입 완료`);

        // ✅ [2026-01-24 FIX] CTA 재시도 로직 제거 - 중복 CTA 삽입 방지
        //    기존 로직: CTA 확인 실패 시 재삽입 → 이전글 후 CTA 중복 발생
        //    수정: 재시도 로직 제거, CTA는 한 번만 삽입
        await this.delay(500); // 삽입 후 대기
        this.log(`   ✅ CTA 버튼 삽입 및 확인 완료 (재시도 건너뜀)`);
      }

      // ✅ 중복 문구 제거됨: '쇼핑커넥트 수익이 발생할 수 있습니다' 문구는 
      // 이미 위에서 '제휴 마케팅 고지 문구'로 처리되므로 별도 추가하지 않음

      // 5. 커서를 에디터 맨 끝으로 확실히 이동 (해시태그 짤림 방지)
      this.log('   → 커서를 에디터 맨 끝으로 이동 (해시태그 영역 준비)');
      await page.keyboard.press('End');
      await this.delay(100);
      await page.keyboard.down('Control');
      await page.keyboard.press('End');
      await page.keyboard.up('Control');
      await this.delay(200);

      // 6. Enter 3회 (CTA와 해시태그 사이 간격)
      this.log('   → Enter 3회 입력 (해시태그 영역 준비)');
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Enter');
        await this.delay(this.DELAYS.SHORT); // 150ms
      }
      this.log(`   ✅ Enter 3회 완료`);

      // ✅ CTA 카드 로딩 대기 (5초) - 카드가 3초 뒤에 뜨므로 여유있게 대기
      this.log('   → CTA 카드 로딩 대기 (5초)...');
      await this.delay(5000);
      this.log('   ✅ CTA 카드 로딩 대기 완료');

      // 7. 해시태그 입력 (최대 5개) - 본문에 직접 입력
      const hashtagsToApply = resolved.hashtags.slice(0, 5);
      if (hashtagsToApply.length > 0) {
        this.log(`   → 해시태그 ${hashtagsToApply.length}개 입력 중...`);

        // ✅ 해시태그 입력 전 다시 한번 커서 위치 확인
        await page.keyboard.press('End');
        await this.delay(100);

        await this.applyHashtagsInBody(hashtagsToApply);
        await this.delay(this.DELAYS.MEDIUM); // 200ms
        this.log(`   ✅ 해시태그 입력 완료`);
      }

      // 7. CTA 버튼 최종 확인 (발행 전)
      if (resolved.ctas.length > 0 || resolved.ctaText) {
        this.log('\n🔍 CTA 버튼 최종 확인 중...');
        const frame = (await this.getAttachedFrame());
        const finalCheck = await this.verifyCtaInsertion(frame, resolved.ctas[0]?.text || resolved.ctaText || '');

        if (finalCheck) {
          this.log('✅ CTA 버튼이 정상적으로 삽입되었습니다.');
        } else {
          this.log('⚠️ CTA 버튼이 확인되지 않습니다. 발행 후 브라우저에서 직접 확인해주세요.');
          this.log('💡 만약 버튼이 보이지 않으면, 네이버 블로그 에디터에서 직접 링크를 추가해주세요.');
        }
      }

      // 8. 이미지 배치 검증 (skipImages가 false인 경우)
      if (!resolved.skipImages && resolved.images && resolved.images.length > 0) {
        await this.verifyImagePlacement(resolved.images);
      }

      this.log('\n✅ 구조화된 콘텐츠 작성이 완료되었습니다.');
    }, 2, '콘텐츠 적용');
  }


  private async setFontSize(size: number, force: boolean = false): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    this.log(`   → 폰트 크기 ${size}px 설정 중...`);

    try {
      // 방법 1: 툴바 버튼으로 설정
      const fontSizeToggleButton = await frame.waitForSelector(
        'button.se-font-size-code-toolbar-button[data-name="font-size"]',
        { visible: true, timeout: 2000 }
      ).catch(() => null);

      if (fontSizeToggleButton) {
        // 드롭다운 열기
        await fontSizeToggleButton.click();
        await this.delay(this.DELAYS.MEDIUM); // 300ms → 200ms

        // 특정 크기 버튼 클릭 (네이버 표준 크기: 11, 13, 15, 16, 19, 24, 28, 30, 38)
        const sizeButton = await frame.waitForSelector(
          `button[data-value="fs${size}"], .se-toolbar-option-font-size-code-fs${size}-button`,
          { visible: true, timeout: 1000 }
        ).catch(() => null);

        if (sizeButton) {
          await sizeButton.click();
          await this.delay(this.DELAYS.MEDIUM); // 300ms → 200ms
          this.log(`   ✅ 폰트 크기 ${size}px 설정 완료 (툴바)`);
          return;
        }
      }

      // 방법 2: JavaScript로 강제 설정 (더 확실한 방법)
      if (force) {
        await frame.evaluate((fontSize) => {
          // 네이버 에디터의 실제 편집 영역 찾기
          const editorAreas = [
            '.se-section-text',
            '.se-main-container .se-editing-area',
            '.se-editing-area',
            '.se-component-content',
            '[contenteditable="true"]'
          ];

          let editorElement: HTMLElement | null = null;
          for (const selector of editorAreas) {
            const element = document.querySelector(selector) as HTMLElement;
            if (element && element.contentEditable === 'true') {
              editorElement = element;
              break;
            }
          }

          if (!editorElement) {
            // contentEditable이 명시되지 않은 경우도 시도
            const activeElement = document.activeElement as HTMLElement;
            if (activeElement) {
              editorElement = activeElement;
            }
          }

          if (editorElement) {
            // 1. 편집 영역 전체에 기본 폰트 크기 설정
            editorElement.style.fontSize = `${fontSize}px`;
            editorElement.setAttribute('data-font-size', fontSize.toString());

            // 2. 네이버 에디터 폰트 크기 클래스 적용
            const classes = Array.from(editorElement.classList);
            classes.forEach(cls => {
              if (cls.startsWith('se-fs') || cls.startsWith('fs')) {
                editorElement!.classList.remove(cls);
              }
            });

            // 네이버 에디터 표준 클래스 추가
            editorElement.classList.add(`se-fs${fontSize}`);

            // 3. 현재 커서 위치의 모든 부모 요소에 폰트 크기 적용
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              let container: Node = range.commonAncestorContainer;

              // 텍스트 노드인 경우 부모 요소로 이동
              if (container.nodeType === Node.TEXT_NODE) {
                container = (container as Text).parentElement || container;
              }

              // 모든 부모 요소에 폰트 크기 적용 (최대 5단계까지)
              let current: Element | null = container as Element;
              let depth = 0;
              while (current && depth < 5 && editorElement.contains(current)) {
                if (current instanceof HTMLElement) {
                  current.style.fontSize = `${fontSize}px`;
                  current.setAttribute('data-font-size', fontSize.toString());

                  // 네이버 에디터 클래스도 적용
                  const currentClasses = Array.from(current.classList);
                  currentClasses.forEach(cls => {
                    if (cls.startsWith('se-fs') || cls.startsWith('fs')) {
                      current!.classList.remove(cls);
                    }
                  });
                  current.classList.add(`se-fs${fontSize}`);
                }
                current = current.parentElement;
                depth++;
              }
            }

            // 4. 네이버 에디터의 기본 스타일도 오버라이드
            const style = document.createElement('style');
            style.textContent = `
              .se-section-text,
              .se-section-text *,
              .se-component-content,
              .se-component-content * {
                font-size: ${fontSize}px !important;
              }
              .se-fs${fontSize} {
                font-size: ${fontSize}px !important;
              }
            `;

            // 기존 스타일 태그 제거 후 새로 추가
            const existingStyle = document.getElementById('naver-font-size-override');
            if (existingStyle) {
              existingStyle.remove();
            }
            style.id = 'naver-font-size-override';
            document.head.appendChild(style);
          }
        }, size);

        await this.delay(this.DELAYS.MEDIUM);
        this.log(`   ✅ 폰트 크기 ${size}px 강제 설정 완료 (JavaScript + CSS)`);
      }
    } catch (error) {
      this.log(`   ⚠️ 폰트 크기 설정 실패: ${(error as Error).message}`);
    }
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
  private async setToneStyle(toneStyle: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe'): Promise<void> {
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
          let cleanContent = extractedContent
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
    let extractedContent: string[] = [];
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
    const page = this.ensurePage();
    const frame = (await this.getAttachedFrame());

    try {
      // 1. 이미지 업로드 버튼 찾기 (Frame과 Page 모두 검색)
      const imageButtonSelectors = [
        'button[aria-label*="이미지"]',
        'button[data-tooltip*="이미지"]',
        'button[class*="image"]',
        'button[class*="photo"]',
        'button[class*="picture"]',
        'div[role="button"][aria-label*="이미지"]',
        '.se-toolbar-item[aria-label*="이미지"]',
        '.se-toolbar-item[data-tooltip*="이미지"]',
        'button.se-toolbar-item',
        // 네이버 에디터 특정 선택자들
        '[data-name="image"]',
        '[data-command="openImagePopup"]',
        '.se-popup-image button',
        'button[data-command="image"]',
        '.se-image-toolbar-button'
      ];

      let imageButton: any = null;

      // 먼저 Frame에서 찾기 (네이버 블로그는 iframe 구조)
      for (const selector of imageButtonSelectors) {
        try {
          const buttons = await frame.$$(selector).catch(() => []);
          for (const button of buttons) {
            const isVisible = await button.isIntersectingViewport().catch(() => false);
            const ariaLabel = await frame.evaluate(el => el.getAttribute('aria-label'), button).catch(() => '');
            const dataTooltip = await frame.evaluate(el => el.getAttribute('data-tooltip'), button).catch(() => '');
            const className = await frame.evaluate(el => el.getAttribute('class'), button).catch(() => '');

            if (isVisible && (ariaLabel?.includes('이미지') || dataTooltip?.includes('이미지') ||
              className?.includes('image') || className?.includes('photo'))) {
              imageButton = button;
              this.log(`   ✅ 이미지 업로드 버튼 발견 (Frame): ${selector}`);
              break;
            }
          }
          if (imageButton) break;
        } catch (error) {
          continue;
        }
      }

      // Frame에서 못 찾으면 Page에서 찾기
      if (!imageButton) {
        for (const selector of imageButtonSelectors) {
          try {
            const buttons = await page.$$(selector).catch(() => []);
            for (const button of buttons) {
              const isVisible = await button.isIntersectingViewport().catch(() => false);
              const ariaLabel = await page.evaluate(el => el.getAttribute('aria-label'), button).catch(() => '');
              const dataTooltip = await page.evaluate(el => el.getAttribute('data-tooltip'), button).catch(() => '');
              const className = await page.evaluate(el => el.getAttribute('class'), button).catch(() => '');

              if (isVisible && (ariaLabel?.includes('이미지') || dataTooltip?.includes('이미지') ||
                className?.includes('image') || className?.includes('photo'))) {
                imageButton = button;
                this.log(`   ✅ 이미지 업로드 버튼 발견 (Page): ${selector}`);
                break;
              }
            }
            if (imageButton) break;
          } catch (error) {
            continue;
          }
        }
      }

      if (!imageButton) {
        throw new Error('네이버 블로그에서 이미지 업로드 버튼을 찾을 수 없습니다');
      }

      // 2. 파일 경로 준비
      let absolutePath: string;
      const fs = await import('fs/promises');
      const pathModule = await import('path');

      // ✅ file:// 프로토콜 제거 및 URL 디코딩
      let cleanFilePath = filePath;
      if (cleanFilePath.startsWith('file://')) {
        // file:// 프로토콜 제거
        cleanFilePath = cleanFilePath.replace(/^file:\/\//, '');
        // Windows 경로의 경우 file:///C:/ 형태이므로 / 제거
        if (cleanFilePath.startsWith('/') && /^\/[A-Za-z]:/.test(cleanFilePath)) {
          cleanFilePath = cleanFilePath.substring(1);
        }
        // URL 디코딩
        try {
          cleanFilePath = decodeURIComponent(cleanFilePath);
        } catch {
          // 디코딩 실패 시 원본 사용
        }
        this.log(`   🔧 file:// 프로토콜 제거 및 디코딩: ${filePath.substring(0, 50)}... → ${cleanFilePath.substring(0, 50)}...`);
      }

      if (cleanFilePath.startsWith('http://') || cleanFilePath.startsWith('https://')) {
        // URL인 경우 다운로드 후 임시 파일로 저장
        this.log(`   🌐 URL 이미지 다운로드 중...`);
        const os = await import('os');
        const https = await import('https');
        const http = await import('http');
        const url = await import('url');

        // SSL 검증 무시 (공공 사이트의 SSL 설정 문제 대응)
        const agent = new https.Agent({
          rejectUnauthorized: false,
          secureOptions: 0x4,
        });

        // URL 파싱
        const parsedUrl = new url.URL(cleanFilePath);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        // Promise로 래핑하여 다운로드
        const buffer = await new Promise<Buffer>((resolve, reject) => {
          const request = client.get(cleanFilePath, {
            agent: isHttps ? agent : undefined,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: 10000,
          }, (response) => {
            if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
              reject(new Error(`이미지 다운로드 실패: ${response.statusCode} ${response.statusMessage || ''}`));
              return;
            }

            const chunks: Buffer[] = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
          });

          request.on('error', reject);
          request.on('timeout', () => {
            request.destroy();
            reject(new Error('이미지 다운로드 타임아웃'));
          });
        });
        const tempDir = os.tmpdir();
        // URL에서 쿼리 파라미터 제거 후 확장자 추출 (안전한 방법)
        let urlWithoutQuery = cleanFilePath;
        try {
          // URL 모듈을 사용하여 pathname만 추출 (쿼리 파라미터와 해시 자동 제거)
          const url = await import('url');
          const parsedUrl = new url.URL(cleanFilePath);
          urlWithoutQuery = parsedUrl.pathname;
        } catch {
          // URL 파싱 실패 시 수동으로 제거 (?와 & 모두 처리)
          urlWithoutQuery = cleanFilePath.split('?')[0].split('&')[0].split('#')[0];
        }
        const ext = urlWithoutQuery.split('.').pop()?.toLowerCase() || 'jpg';
        // 유효한 확장자만 허용 (보안) - 확장자에 쿼리 파라미터가 포함되지 않도록 추가 검증
        const cleanExt = ext.split('&')[0].split('?')[0].split('#')[0];
        const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(cleanExt) ? cleanExt : 'jpg';
        const tempFileName = `naver-blog-img-${Date.now()}.${validExt}`;
        absolutePath = pathModule.join(tempDir, tempFileName);

        await fs.writeFile(absolutePath, buffer);
        this.log(`   💾 임시 파일 저장: ${tempFileName}`);
      } else {
        // 로컬 파일인 경우
        // 절대 경로로 변환
        absolutePath = pathModule.isAbsolute(cleanFilePath)
          ? cleanFilePath
          : pathModule.resolve(cleanFilePath);

        // ✅ [수정] 쿼리 파라미터 제거는 HTTP URL에서만 적용
        // 로컬 파일 경로에서는 & 등의 문자가 파일명에 포함될 수 있으므로 건너뜀
        // (HTTP URL은 이미 위에서 처리됨)
        // 로컬 파일은 그대로 사용
      }

      // 파일 존재 확인
      try {
        await fs.access(absolutePath);
      } catch (error) {
        throw new Error(`이미지 파일을 찾을 수 없습니다: ${absolutePath}`);
      }

      // 3. 파일 업로드 실행 (이미지 버튼 클릭 + FileChooser만 사용)
      this.log(`   📤 파일 업로드 시작 (이미지 버튼 클릭 + FileChooser)...`);

      // ✅ 업로드 전 이미지 개수 확인 (Frame에서 확인)
      const imagesBeforeCount = await frame.$$eval(
        'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"], img[src*="postfiles"], img[data-attachment-id]',
        imgs => imgs.length
      ).catch(() => 0);
      this.log(`   📊 업로드 전 이미지 개수: ${imagesBeforeCount}`);

      try {
        this.log(`   🔄 FileChooser 대기 중...`);

        const [fileChooser] = await Promise.all([
          page.waitForFileChooser({ timeout: 5000 }),
          imageButton.click()
        ]);

        // ✅ 파일 선택 먼저 수행
        await fileChooser.accept([absolutePath]);
        this.log(`   ✅ FileChooser로 파일 선택 완료`);

        // ✅ 파일 선택 후 업로드 완료 대기 (충분히 기다림)
        this.log(`   ⏳ 이미지 업로드 처리 중... (5초 대기)`);
        await this.delay(5000);

        // ✅ MYBOX 팝업이 있으면 닫기 (파일 선택 후)
        await page.keyboard.press('Escape').catch(() => { });
        await this.delay(300);
        await page.keyboard.press('Escape').catch(() => { });
        await this.delay(300);

      } catch (fcError) {
        throw new Error(`이미지 버튼 클릭 + FileChooser 실패: ${(fcError as Error).message}`);
      }

      // 4. 업로드 완료 확인 (Frame에서 이미지 요소 확인 - 가장 정확함)
      this.log(`   🔍 이미지 삽입 확인 중...`);

      // ✅ Frame에서 이미지 확인 (네이버 에디터는 iframe 구조)
      const imagesAfterCount = await frame.$$eval(
        'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"], img[src*="postfiles"], img[data-attachment-id]',
        imgs => imgs.length
      ).catch(() => 0);

      const newImagesAdded = imagesAfterCount - imagesBeforeCount;

      if (newImagesAdded > 0) {
        this.log(`   ✅ 이미지 업로드 성공! (새로 추가된 이미지: ${newImagesAdded}개, 총 ${imagesAfterCount}개)`);

        // ✅ 이미지 크기를 '문서 너비'로 설정
        try {
          await this.setImageSizeToDocumentWidth();
          this.log(`   ✅ 이미지 크기 '문서 너비'로 설정 완료`);
        } catch (sizeError) {
          this.log(`   ⚠️ 이미지 크기 설정 실패 (계속 진행): ${(sizeError as Error).message}`);
        }
      } else {
        this.log(`   ⚠️ 이미지가 삽입되지 않음 - Base64 방식으로 재시도...`);
        // Base64 방식으로 폴백
        await this.insertImageViaBase64(absolutePath, frame, page);
      }

      // 5. 커서 위치 조정 (이미지 아래로 이동)
      await page.keyboard.press('ArrowDown');
      await this.delay(200);
      await page.keyboard.press('End');
      await this.delay(200);

      this.log(`   🎉 이미지 삽입 프로세스 완료`);

    } catch (error) {
      this.log(`   ❌ 이미지 업로드 실패: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 네이버 이미지 버튼을 통해 이미지 업로드 (메인 방식)
   */
  private async insertBase64ImageAtCursor(filePath: string): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

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

    const fs = await import('fs/promises');
    const pathModule = await import('path');
    const os = await import('os');

    let absolutePath: string;
    let isTemporaryFile = false;

    // ✅ Base64 Data URL 또는 프리픽스 없는 Base64인 경우 임시 파일로 저장
    const isBase64 = filePath.startsWith('data:') || (/^[A-Za-z0-9+/=]{100,}$/.test(filePath) && !filePath.includes(':') && !filePath.includes('\\'));

    if (isBase64) {
      this.log(`   🔄 Base64 데이터 감지 → 임시 파일로 변환 중...`);

      try {
        // data:image/jpeg;base64,/9j/... 형식에서 데이터 추출
        const matches = filePath.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
          throw new Error('잘못된 Base64 Data URL 형식입니다');
        }

        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        const tempDir = os.tmpdir();
        const tempFileName = `naver-blog-img-${Date.now()}.${ext}`;
        absolutePath = pathModule.join(tempDir, tempFileName);

        await fs.writeFile(absolutePath, buffer);
        isTemporaryFile = true;

        this.log(`   ✅ Base64 → 임시 파일 변환 완료: ${(buffer.length / 1024).toFixed(1)}KB`);
      } catch (error) {
        throw new Error(`Base64 이미지 변환 실패: ${(error as Error).message}`);
      }
    }
    // URL인 경우 다운로드
    else if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      this.log(`   🌐 URL 이미지 다운로드 중: ${filePath.substring(0, 80)}...`);

      try {
        const https = await import('https');
        const http = await import('http');
        const url = await import('url');

        // SSL 검증 무시 (공공 사이트의 SSL 설정 문제 대응)
        const agent = new https.Agent({
          rejectUnauthorized: false,
          // Legacy SSL renegotiation 허용 (OpenSSL 3.0+ 필수)
          secureOptions: 0x4, // SSL_OP_LEGACY_SERVER_CONNECT
        });

        // URL 파싱
        const parsedUrl = new url.URL(filePath);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        // Promise로 래핑하여 다운로드
        const buffer = await new Promise<Buffer>((resolve, reject) => {
          const request = client.get(filePath, {
            agent: isHttps ? agent : undefined,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: 10000, // 10초 타임아웃
          }, (response) => {
            if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
              reject(new Error(`이미지 다운로드 실패: ${response.statusCode} ${response.statusMessage || ''}`));
              return;
            }

            const chunks: Buffer[] = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
          });

          request.on('error', reject);
          request.on('timeout', () => {
            request.destroy();
            reject(new Error('이미지 다운로드 타임아웃'));
          });
        });

        // 임시 파일로 저장
        const tempDir = os.tmpdir();
        // URL에서 쿼리 파라미터 제거 후 확장자 추출 (안전한 방법)
        let urlWithoutQuery = filePath;
        try {
          // URL 모듈을 사용하여 pathname만 추출 (쿼리 파라미터와 해시 자동 제거)
          const parsedUrl = new url.URL(filePath);
          urlWithoutQuery = parsedUrl.pathname;
        } catch {
          // URL 파싱 실패 시 수동으로 제거 (?와 & 모두 처리)
          urlWithoutQuery = filePath.split('?')[0].split('&')[0].split('#')[0];
        }
        const ext = urlWithoutQuery.split('.').pop()?.toLowerCase() || 'jpg';
        // 유효한 확장자만 허용 (보안) - 확장자에 쿼리 파라미터가 포함되지 않도록 추가 검증
        const cleanExt = ext.split('&')[0].split('?')[0].split('#')[0];
        const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(cleanExt) ? cleanExt : 'jpg';
        const tempFileName = `naver-blog-img-${Date.now()}.${validExt}`;
        absolutePath = pathModule.join(tempDir, tempFileName);

        await fs.writeFile(absolutePath, buffer);
        isTemporaryFile = true;

        this.log(`   ✅ 이미지 다운로드 완료: ${(buffer.length / 1024).toFixed(1)}KB`);
      } catch (error) {
        throw new Error(`URL 이미지 다운로드 실패: ${(error as Error).message}`);
      }
    } else {
      // 로컬 파일 경로
      // ✅ file:// 프로토콜 제거 및 URL 디코딩
      let cleanFilePath = filePath;
      if (cleanFilePath.startsWith('file://')) {
        // file:// 프로토콜 제거
        cleanFilePath = cleanFilePath.replace(/^file:\/\//, '');
        // Windows 경로의 경우 file:///C:/ 형태이므로 / 제거
        if (cleanFilePath.startsWith('/') && /^\/[A-Za-z]:/.test(cleanFilePath)) {
          cleanFilePath = cleanFilePath.substring(1);
        }
        // URL 디코딩
        try {
          cleanFilePath = decodeURIComponent(cleanFilePath);
        } catch {
          // 디코딩 실패 시 원본 사용
        }
        this.log(`   🔧 file:// 프로토콜 제거 및 디코딩: ${filePath.substring(0, 50)}... → ${cleanFilePath.substring(0, 50)}...`);
      }

      absolutePath = pathModule.isAbsolute(cleanFilePath)
        ? cleanFilePath
        : pathModule.resolve(cleanFilePath);

      // ✅ [수정] 쿼리 파라미터 제거는 HTTP URL에서만 적용
      // 로컬 파일 경로에서는 & 등의 문자가 파일명에 포함될 수 있으므로 건너뜀
      // (HTTP URL은 이미 위에서 처리됨)
      // 로컬 파일은 그대로 사용

      try {
        await fs.access(absolutePath);
      } catch {
        throw new Error(`이미지 파일을 찾을 수 없습니다: ${absolutePath}`);
      }
    }

    // 보안: 파일 경로 마스킹
    const maskedPath = absolutePath.replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~');
    this.log(`   📁 파일 경로: ${maskedPath}`);

    // ✅ 이미지 버튼 클릭 + FileChooser만 사용 (file input 직접 사용 안 함)
    this.log(`   📤 이미지 버튼 클릭 + FileChooser로 업로드 시작...`);

    // 이미지 버튼 찾기
    const imageButtonSelectors = [
      'button[data-name="image"]',
      'button.se-image-toolbar-button',
      'button[data-command="image"]',
      'button[aria-label*="이미지"]',
      'button[title*="이미지"]',
    ];

    let imageButton = null;
    for (const selector of imageButtonSelectors) {
      imageButton = await frame.$(selector).catch(() => null);
      if (imageButton) {
        this.log(`   ✅ 이미지 버튼 발견: ${selector}`);
        break;
      }
    }

    if (!imageButton) {
      throw new Error('네이버 블로그에서 이미지 업로드 버튼을 찾을 수 없습니다');
    }

    // 이미지 버튼 클릭 + FileChooser
    try {
      this.log(`   🔄 FileChooser 대기 중...`);

      const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 5000 }),
        imageButton.click()
      ]);

      // ✅ 파일 선택 먼저 수행 (ESC 키는 나중에!)
      await fileChooser.accept([absolutePath]);
      this.log(`   ✅ FileChooser로 파일 선택 완료`);

      // 업로드 완료 대기 (충분히 기다림)
      this.log(`   ⏳ 이미지 업로드 처리 중... (5초 대기)`);
      await this.delay(5000);

      // ✅ 파일 업로드 후 MYBOX 팝업 닫기
      await page.keyboard.press('Escape').catch(() => { });
      await this.delay(300);
      await page.keyboard.press('Escape').catch(() => { });
      await this.delay(300);

      // 확인 버튼이 있으면 클릭
      const confirmButton = await frame.$('button:has-text("확인"), button:has-text("삽입")').catch(() => null);
      if (confirmButton) {
        await confirmButton.click();
        await this.delay(1000);
      }

      // 이미지가 삽입되었는지 확인
      const imgCount = await frame.$$eval(
        'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"], img[src*="postfiles"], img[data-attachment-id]',
        imgs => imgs.length
      );

      if (imgCount > 0) {
        this.log(`   ✅ 이미지 버튼 클릭 + FileChooser 성공 (이미지 ${imgCount}개 확인됨)`);

        // ✅ MyBox 팝업 자동 닫기
        await this.delay(500); // 팝업이 뜰 시간 대기
        await page.keyboard.press('Escape').catch(() => { });
        await this.delay(300);
        await page.keyboard.press('Escape').catch(() => { }); // 한 번 더 (확실히)
        await this.delay(300);
        this.log('   ✅ MyBox 팝업 자동 닫기 완료');

        if (isTemporaryFile) {
          await fs.unlink(absolutePath).catch(() => { });
        }
        return;
      } else {
        throw new Error('파일 선택했으나 이미지가 삽입되지 않음');
      }
    } catch (error) {
      // ESC로 열린 패널 닫기
      await page.keyboard.press('Escape').catch(() => { });
      await this.delay(300);

      this.log(`   ⚠️ FileChooser 방식 실패, Base64 변환 방식으로 폴백 시도...`);

      // ✅ Base64 변환 방식으로 폴백
      try {
        await this.insertImageViaBase64(absolutePath, frame, page);
        this.log(`   ✅ Base64 변환 방식으로 이미지 삽입 성공`);

        if (isTemporaryFile) {
          await fs.unlink(absolutePath).catch(() => { });
        }
        return;
      } catch (base64Error) {
        this.log(`   ❌ Base64 변환 방식도 실패: ${(base64Error as Error).message}`);
        throw new Error(`이미지 삽입 실패 (FileChooser + Base64 모두 실패): ${(error as Error).message}`);
      }
    }

    // ✅ 이미지 크기를 '문서 너비'로 설정
    try {
      await this.setImageSizeToDocumentWidth();
      this.log(`   ✅ 이미지 크기 '문서 너비'로 설정 완료`);
    } catch (sizeError) {
      this.log(`   ⚠️ 이미지 크기 설정 실패 (계속 진행): ${(sizeError as Error).message}`);
    }

    // 임시 파일 정리
    if (isTemporaryFile) {
      try {
        await fs.unlink(absolutePath);
        this.log(`   🗑️ 임시 파일 삭제 완료`);
      } catch (error) {
        this.log(`   ⚠️ 임시 파일 삭제 실패: ${(error as Error).message}`);
      }
    }

    // 이미지 삽입 후 커서를 다음 줄로 이동
    await page.keyboard.press('ArrowDown');
    await this.delay(100);
    await page.keyboard.press('End');
    await this.delay(100);
  }

  /**
   * Base64 변환 방식으로 이미지 삽입 (클립보드 붙여넣기)
   */
  private async insertImageViaBase64(filePath: string, frame: Frame, page: Page): Promise<void> {
    const fs = await import('fs/promises');
    const pathModule = await import('path');

    this.log(`   🔄 Base64 변환 방식으로 이미지 삽입 시작...`);

    // 이미지를 Base64로 읽기
    let absolutePath = filePath;
    let imageBuffer: Buffer;

    try {
      imageBuffer = await fs.readFile(absolutePath);
      this.log(`   ✅ 이미지 파일 읽기 완료: ${(imageBuffer.length / 1024).toFixed(1)}KB`);
    } catch (error) {
      throw new Error(`이미지 파일 읽기 실패: ${(error as Error).message}`);
    }

    // Base64로 변환
    const base64 = imageBuffer.toString('base64');
    const ext = pathModule.extname(absolutePath).toLowerCase().slice(1) || 'png';
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'png' ? 'image/png' :
        ext === 'gif' ? 'image/gif' :
          ext === 'webp' ? 'image/webp' : 'image/png';

    this.log(`   🔄 Base64 변환 완료 (크기: ${(base64.length / 1024).toFixed(2)} KB, MIME: ${mimeType})`);

    // 클립보드에 이미지 데이터 설정
    const clipboardSet = await frame.evaluate(async (b64: string, mime: string) => {
      try {
        // Base64를 Blob으로 변환
        const byteCharacters = atob(b64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mime });

        // ClipboardItem 생성
        const clipboardItem = new ClipboardItem({ [mime]: blob });

        // 클립보드에 쓰기
        await navigator.clipboard.write([clipboardItem]);
        return true;
      } catch (e) {
        console.error('[Base64] 클립보드 설정 오류:', e);
        return false;
      }
    }, base64, mimeType);

    if (!clipboardSet) {
      throw new Error('Base64 클립보드 설정 실패');
    }

    this.log(`   ✅ Base64 클립보드 설정 완료`);

    // 에디터 요소 포커스
    await frame.evaluate(() => {
      const editorElement = document.querySelector('.se-section-text, .se-component-content, [contenteditable="true"]') as HTMLElement;
      if (editorElement) {
        editorElement.focus();
        // 커서를 끝으로 이동
        const range = document.createRange();
        const selection = window.getSelection();
        if (selection) {
          range.selectNodeContents(editorElement);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    });

    await this.delay(300);

    // ✅ Puppeteer로 실제 Ctrl+V 키 입력 (더 확실한 방법)
    this.log(`   📋 Ctrl+V 키 입력으로 이미지 붙여넣기...`);
    await page.keyboard.down('Control');
    await page.keyboard.press('v');
    await page.keyboard.up('Control');

    this.log(`   ✅ Ctrl+V 키 입력 완료`);

    // 이미지 삽입 완료 대기
    await this.delay(2500);

    // 이미지가 삽입되었는지 확인
    const imgCount = await frame.$$eval(
      'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"], img[src*="postfiles"], img[data-attachment-id]',
      imgs => imgs.length
    ).catch(() => 0);

    if (imgCount > 0) {
      this.log(`   ✅ Base64 방식으로 이미지 삽입 성공 (이미지 ${imgCount}개 확인됨)`);
    } else {
      this.log(`   ⚠️ Base64 방식으로 삽입했으나 DOM에서 이미지를 찾을 수 없음`);
    }

    // ✅ 이미지 크기를 '문서 너비'로 설정
    try {
      await this.setImageSizeToDocumentWidth();
      this.log(`   ✅ 이미지 크기 '문서 너비'로 설정 완료`);
    } catch (sizeError) {
      this.log(`   ⚠️ 이미지 크기 설정 실패 (계속 진행): ${(sizeError as Error).message}`);
    }

    // ✅ MyBox 팝업 자동 닫기 (3층 방어)
    try {
      await this.delay(500); // 팝업이 뜰 시간 대기
      await page.keyboard.press('Escape');
      await this.delay(300);
      await page.keyboard.press('Escape'); // 한 번 더 (확실히)
      await this.delay(300);
      this.log('✅ MyBox 팝업 자동 닫기 완료');
    } catch (escError) {
      // ESC 키 입력 실패는 무시 (팝업이 없을 수도 있음)
      this.log(`   ℹ️ ESC 키 입력 중 오류 (무시): ${(escError as Error).message}`);
    }
  }

  /**
   * 이미지 크기를 '문서 너비'로 설정 (안전 모드: DOM 스타일만 적용, 툴바 클릭 없음)
   */
  private async setImageSizeToDocumentWidth(): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    try {
      await this.delay(150);

      const appliedCount = await frame.evaluate(() => {
        const imgs = document.querySelectorAll('img.se-image-resource, img[data-se-image-resource="true"], .se-module-image img, .se-section-image img');
        let count = 0;

        imgs.forEach((img) => {
          const targetImage = img as HTMLImageElement;

          // 상위 컨테이너들 설정
          let el: HTMLElement | null = targetImage;
          while (el && el !== document.body) {
            if (el.classList.contains('se-section') || el.classList.contains('se-module') || el.classList.contains('se-component') || el.classList.contains('se-image')) {
              el.classList.remove('se-l-left', 'se-l-right', 'se-l-original');
              el.classList.add('se-l-default');
              el.style.width = '100%';
              el.style.maxWidth = '100%';
              el.setAttribute('data-size', 'document-width');
            }
            el = el.parentElement;
          }

          // 이미지 스타일
          targetImage.style.width = '100%';
          targetImage.style.maxWidth = '100%';
          targetImage.style.height = 'auto';
          targetImage.style.display = 'block';

          // figure/wrap 보정
          const figure = targetImage.closest('figure, .se-image-wrap, .se-module-image-link, .se-component-image') as HTMLElement;
          if (figure) {
            figure.style.width = '100%';
            figure.style.maxWidth = '100%';
          }

          count++;
        });

        return count;
      });

      if (appliedCount > 0) {
        this.log(`   ✅ 직접 스타일 설정 완료 (${appliedCount}개 이미지)`);
      } else {
        this.log(`   ⚠️ 이미지를 찾을 수 없어 크기 조정을 건너뜁니다`);
      }

      await this.delay(200);

      // 7. ✅ 중요: 툴바 포커스 해제 및 에디터 본문으로 포커스 이동
      // 문서 너비 버튼 클릭 후 툴바에 포커스가 남아있으면 Enter가 잘못된 동작 유발
      try {
        // Escape로 툴바/패널 닫기
        await page.keyboard.press('Escape');
        await this.delay(100);

        // 에디터 본문 클릭하여 포커스 이동
        await frame.evaluate(() => {
          // 이미지 아래 텍스트 영역 클릭
          const textContainer = document.querySelector('.se-section-text, [contenteditable="true"]') as HTMLElement;
          if (textContainer) {
            textContainer.focus();
            // 커서를 끝으로 이동
            const selection = window.getSelection();
            if (selection) {
              const range = document.createRange();
              range.selectNodeContents(textContainer);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        });
        await this.delay(100);
      } catch (focusError) {
        // 포커스 이동 실패해도 계속 진행
      }

    } catch (error) {
      this.log(`   ⚠️ 이미지 크기 조정 중 오류 발생 (계속 진행): ${(error as Error).message}`);
    }
  }

  private async insertSingleImage(image: AutomationImage): Promise<void> {
    const frame = (await this.getAttachedFrame());
    this.log(`🖼️ '${image.heading}' 이미지를 현재 커서 위치에 삽입합니다...`);

    let imageDataUrl = image.filePath || (image as any).url || (image as any).previewDataUrl;
    if (!imageDataUrl) {
      this.log(`⚠️ '${image.heading}' 이미지 경로가 비어있습니다. 삽입을 건너뜁니다.`);
      return;
    }

    const isUrl = imageDataUrl.startsWith('http://') || imageDataUrl.startsWith('https://');
    const isBase64 = imageDataUrl.startsWith('data:');

    if (!isUrl && !isBase64) {
      try {
        const fs = await import('fs/promises');
        const imageBuffer = await fs.readFile(imageDataUrl);
        const base64 = imageBuffer.toString('base64');

        // 확장자 및 MimeType 추출
        const urlWithoutQuery = imageDataUrl.split('?')[0].split('#')[0];
        const ext = urlWithoutQuery.split('.').pop()?.toLowerCase() || 'png';
        const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'png';
        const mimeType = validExt === 'jpg' || validExt === 'jpeg' ? 'image/jpeg' :
          validExt === 'png' ? 'image/png' :
            validExt === 'gif' ? 'image/gif' :
              validExt === 'webp' ? 'image/webp' : 'image/png';

        imageDataUrl = `data:${mimeType};base64,${base64}`;
      } catch (err) {
        this.log(`❌ 이미지 파일 로드 실패: ${imageDataUrl}. 상세: ${(err as Error).message}`);
        return;
      }
    }

    const inserted = await this.retry(async () => {
      return await frame.evaluate((imgUrl) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          return false;
        }

        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;

        const titleElement = document.querySelector('.se-section-documentTitle');
        let currentNode = container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : container as HTMLElement;

        if (titleElement && titleElement.contains(currentNode)) {
          return false;
        }

        const bodyElement = document.querySelector('.se-section-text, .se-main-container, .se-component');
        if (!bodyElement || !bodyElement.contains(currentNode)) {
          return false;
        }

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
        img.src = imgUrl;
        img.setAttribute('data-width', 'original');
        img.setAttribute('data-height', 'original');
        img.style.maxWidth = '100%';
        img.style.height = 'auto';

        seLink.appendChild(img);
        seModule.appendChild(seLink);
        seSection.appendChild(seModule);
        seComponentContent.appendChild(seSection);
        seComponent.appendChild(seComponentContent);

        try {
          let insertPoint = currentNode;
          while (insertPoint && !insertPoint.classList.contains('se-component') && insertPoint.parentElement) {
            insertPoint = insertPoint.parentElement;
          }

          if (!insertPoint || !insertPoint.parentElement) {
            range.collapse(false);
            range.insertNode(seComponent);
          } else {
            if (insertPoint.nextSibling) {
              insertPoint.parentElement.insertBefore(seComponent, insertPoint.nextSibling);
            } else {
              insertPoint.parentElement.appendChild(seComponent);
            }
          }

          const newRange = document.createRange();
          newRange.setStartAfter(seComponent);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);

          return true;
        } catch (e) {
          return false;
        }
      }, imageDataUrl);
    }, 3, `"${image.heading}" 이미지 삽입`).catch(() => false);

    if (inserted) {
      this.log(`   ✅ "${image.heading}" 이미지 삽입 완료`);
      await this.delay(this.DELAYS.MEDIUM);
    } else {
      this.log(`   ❌ "${image.heading}" 이미지 삽입 실패 (3회 시도)`);
    }
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
    const frame = (await this.getAttachedFrame());

    this.log('\n🔍 [이미지 배치 검증 시작]');

    try {
      // 에디터 콘텐츠 영역에서 실제 콘텐츠 이미지 찾기
      const imageInfo = await frame.evaluate(() => {
        // 네이버 에디터의 실제 콘텐츠 편집 영역 찾기
        const contentSelectors = [
          '.se-main-container .se-editing-area',
          '.se-main-container',
          '.se-editing-area',
          '.se-component-content',
          '.se-canvas-area',
          '[contenteditable="true"]',
          '.se-section-text'
        ];

        let contentArea: Element | null = null;
        for (const selector of contentSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            contentArea = element;
            break;
          }
        }

        // 콘텐츠 영역 내 실제 이미지 찾기
        let contentImages = 0;
        let uiImages = 0;
        const imageDetails: Array<{ src: string, isContent: boolean }> = [];

        if (contentArea) {
          const allImages = contentArea.querySelectorAll('img');
          allImages.forEach(img => {
            const src = img.getAttribute('src') || '';

            // 실제 업로드된 콘텐츠 이미지 판별 (엄격한 기준)
            const isContentImage = src.length > 0 &&
              (src.includes('blogfiles.naver.net') ||
                src.includes('postfiles.pstatic.net') ||
                src.includes('blob:') ||
                (src.includes('http') && !src.includes('static.blog.naver.net'))) &&
              !src.includes('icon') &&
              !src.includes('btn_') &&
              !src.includes('ico_');

            if (isContentImage) {
              contentImages++;
            } else {
              uiImages++;
            }

            imageDetails.push({
              src: src.substring(0, 80) + (src.length > 80 ? '...' : ''),
              isContent: isContentImage
            });
          });
        }

        return {
          contentImages,
          uiImages,
          totalImages: contentImages + uiImages,
          imageDetails,
          contentAreaFound: !!contentArea
        };
      });

      this.log(`   → 업로드 요청 이미지: ${images.length}개`);
      this.log(`   → 콘텐츠 영역 찾음: ${imageInfo.contentAreaFound ? '예' : '아니오'}`);
      this.log(`   → 콘텐츠 이미지: ${imageInfo.contentImages}개`);
      this.log(`   → UI 아이콘: ${imageInfo.uiImages}개`);

      // 상세 이미지 정보 로깅 (디버그용)
      if (imageInfo.imageDetails.length > 0) {
        this.log('   📋 발견된 이미지 목록:');
        imageInfo.imageDetails.forEach((img, idx) => {
          this.log(`     ${idx + 1}. [${img.isContent ? '콘텐츠' : 'UI'}] ${img.src}`);
        });
      }

      if (!imageInfo.contentAreaFound) {
        this.log('   ⚠️ 콘텐츠 편집 영역을 찾을 수 없습니다.');
        this.log('   ℹ️ 네이버 블로그 에디터 UI가 변경되었을 수 있습니다.');
      }

      if (imageInfo.contentImages === 0) {
        this.log('   ❌ 실제 콘텐츠 이미지가 하나도 없습니다!');
        this.log('   ℹ️ 이미지 업로드가 완전히 실패했거나, 네이버 에디터가 이미지를 표시하지 않습니다.');
      } else if (imageInfo.contentImages < images.length) {
        const missing = images.length - imageInfo.contentImages;
        this.log(`   ⚠️ ${missing}개 이미지가 누락되었습니다.`);
        this.log('   ℹ️ 일부 이미지만 업로드되었을 수 있습니다.');
      } else if (imageInfo.contentImages === images.length) {
        this.log('   ✅ 모든 이미지가 정상적으로 업로드되었습니다!');
      }

      // 소제목별 이미지 배치 확인
      const headingImageMap = new Map<string, number>();
      for (const img of images) {
        const count = headingImageMap.get(img.heading) || 0;
        headingImageMap.set(img.heading, count + 1);
      }

      this.log('\n   📊 소제목별 이미지 배치 현황:');
      for (const [heading, count] of headingImageMap.entries()) {
        this.log(`      • "${heading}": ${count}개`);
      }

      this.log('\n✅ 이미지 배치 검증 완료');
    } catch (error) {
      this.log(`   ⚠️ 이미지 검증 중 오류: ${(error as Error).message}`);
      this.log(`   ℹ️ 수동으로 이미지 배치를 확인해주세요.`);
    }
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
          await page.keyboard.type(batch, { delay: 40 });

          // 한글 조합 완료 대기 (최소화)
          await this.delay(80);

          // 다음 배치가 있으면 공백 추가
          if (i + batchSize < hashtagList.length) {
            await page.keyboard.type(' ', { delay: 20 });
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
      await page.keyboard.type(divider, { delay: 5 });
      await page.keyboard.press('Enter');
      this.log(`   ✅ 구분선 1 삽입 완료`);

      // ✅ 3. [신규] CTA 텍스트 삽입 (📎 후킹문구 + 제휴링크)
      // 배너와 다른 강력한 구매 결심 유도 문구!
      this.log(`   🛒 CTA 텍스트 삽입 중: "${ctaHook}"`);
      await page.keyboard.press('Enter');
      await page.keyboard.type(`📎 ${ctaHook}`, { delay: 10 });
      await page.keyboard.press('Enter');
      await page.keyboard.type(`👉 ${url}`, { delay: 10 });
      await page.keyboard.press('Enter');
      this.log(`   ✅ CTA 텍스트 + 제휴링크 삽입 완료`);

      // ✅ 4. [신규] 5초 대기 (링크 카드 로딩)
      this.log(`   ⏳ 5초 대기 중 (링크 카드 로딩)...`);
      await this.delay(5000);

      // ✅ [2026-01-19] 마지막 구분선 제거 - 추가 CTA/이전글에서 각자 구분선 삽입
      // 중복 구분선 방지

      // ✅ 6. 이전글 제목 + 링크 삽입 (구분선 포함)
      if (previousPostTitle && previousPostUrl) {
        this.log(`🔗 [이전글] 같은 카테고리 이전글 삽입 중: "${previousPostTitle}"`);

        // ✅ 이전글 전 구분선 삽입
        const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        await page.keyboard.press('Enter');
        await page.keyboard.type(divider, { delay: 5 });
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
        await page.keyboard.type(randomPrevHook, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.type(`📖 ${previousPostTitle}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.type(`👉 ${previousPostUrl}`, { delay: 10 });
        await page.keyboard.press('Enter');
        this.log(`   ✅ 이전글 연결 완료 (후킹: ${randomPrevHook})`);


        // ✅ 7. [신규] 5초 대기 (이전글 링크 카드 로딩)
        this.log(`   ⏳ 5초 대기 중 (이전글 카드 로딩)...`);
        await this.delay(5000);
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
        await page.keyboard.type(divider, { delay: 5 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type(ctaHook, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type(`🔗 ${displayProductName}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.type(`👉 ${url}`, { delay: 10 });
        await page.keyboard.press('Enter');
        this.log(`   ✅ 텍스트 CTA 폴백 완료`);
      } catch (fallbackError) {
        this.log(`⚠️ 텍스트 CTA 폴백도 실패: ${(fallbackError as Error).message}`);
      }
    }
  }

  private async insertCtaLink(url: string, text: string, position: 'top' | 'middle' | 'bottom' = 'bottom'): Promise<void> {
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
      // 형식: 
      // ━━━━━━━━ (구분선)
      // 
      // 🔗 텍스트
      // 
      // 👉 링크
      // 
      // [URL 카드 자동 생성됨]
      const divider = '━━━━━━━━━━━━━━━━━━━';

      // 위치에 따라 텍스트 타이핑 (각 요소를 개별 줄에 배치)
      if (position === 'top') {
        this.log(`   → 상단 위치에 CTA 텍스트 삽입 중...`);
        await page.keyboard.type(divider, { delay: 5 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type(`🔗 ${cleanText}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type(`👉 ${finalUrl}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
      } else if (position === 'middle') {
        this.log(`   → 중간 위치에 CTA 텍스트 삽입 중...`);
        await page.keyboard.type(divider, { delay: 5 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type(`🔗 ${cleanText}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type(`👉 ${finalUrl}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
      } else {
        this.log(`   → 하단 위치에 CTA 텍스트 삽입 중...`);
        await page.keyboard.type(divider, { delay: 5 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type(`🔗 ${cleanText}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type(`👉 ${finalUrl}`, { delay: 10 });
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
      await page.keyboard.type(text, { delay: 30 });
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
    const fs = await import('fs/promises');
    const MAX_RETRIES = 3;

    for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
      const image = images[imgIdx];
      const maskedPath = (image.filePath || '').replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~');

      this.log(`      📷 이미지 ${imgIdx + 1}/${images.length} 업로드 시도: ${maskedPath}`);

      const imagePath = image.filePath || image.savedToLocal || image.url;
      if (!imagePath) {
        this.log(`      ⚠️ 이미지 경로가 없음, 건너뜀`);
        continue;
      }

      // ✅ [신규] 파일 경로인 경우 존재 여부 확인
      if (!imagePath.startsWith('http') && !imagePath.startsWith('data:')) {
        try {
          await fs.access(imagePath);
        } catch {
          this.log(`      ⚠️ 이미지 파일 없음: ${maskedPath}, 건너뜀`);
          continue;
        }
      }

      // ✅ [신규] 프레임 안정성 확인
      try {
        await frame.evaluate(() => true);
      } catch {
        this.log(`      ⚠️ 프레임 연결 불안정, 재연결 시도...`);
        try {
          await this.switchToMainFrame();
          frame = await this.getAttachedFrame();
        } catch (reconnectError) {
          this.log(`      ❌ 프레임 재연결 실패, 이미지 건너뜀`);
          continue;
        }
      }

      // ✅ [신규] 삽입 전 이미지 개수 확인
      const beforeCount = await frame.$$eval(
        'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"]',
        imgs => imgs.length
      ).catch(() => 0);

      // ✅ [핵심] 재시도 로직 (최대 3회)
      let insertSuccess = false;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await this.insertBase64ImageAtCursor(imagePath);
          await this.delay(1500); // 안정화 대기: 1초 → 1.5초

          // ✅ [신규] 삽입 성공 확인
          const afterCount = await frame.$$eval(
            'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"]',
            imgs => imgs.length
          ).catch(() => 0);

          if (afterCount > beforeCount) {
            this.log(`      ✅ 이미지 삽입 확인됨 (${beforeCount} → ${afterCount})`);
            insertSuccess = true;
            break;
          } else {
            throw new Error('이미지 삽입이 확인되지 않음');
          }
        } catch (error) {
          this.log(`      ⚠️ 이미지 삽입 시도 ${attempt}/${MAX_RETRIES} 실패: ${(error as Error).message}`);
          if (attempt < MAX_RETRIES) {
            // 점진적 대기 (1초, 2초)
            const waitTime = 1000 * attempt;
            this.log(`      🔄 ${waitTime / 1000}초 후 재시도...`);
            await this.delay(waitTime);

            // ESC 눌러서 열린 팝업/패널 닫기
            await page.keyboard.press('Escape').catch(() => { });
            await this.delay(300);
          }
        }
      }

      if (!insertSuccess) {
        this.log(`      ❌ 이미지 ${imgIdx + 1} 최종 삽입 실패, 건너뜀`);
        continue;
      }

      // ✅ 문서너비 맞추기 + 링크 삽입
      try {
        if (affiliateLink) {
          await this.setImageSizeAndAttachLink(affiliateLink);
        } else {
          await this.setImageSizeToDocumentWidth();
        }
      } catch (sizeError) {
        this.log(`      ⚠️ 문서너비 설정 실패 (계속 진행): ${(sizeError as Error).message}`);
      }

      // 마지막 이미지가 아니면 줄바꿈 시도
      if (imgIdx < images.length - 1) {
        await page.keyboard.press('Enter');
        await this.delay(500); // 300ms → 500ms
      }
    }

    // 이미지 툴바 및 모달 닫기
    try {
      for (let k = 0; k < 2; k++) {
        await page.keyboard.press('Escape');
        await this.delay(100);
      }

      // 이미지 아래로 커서 이동 확보
      await page.keyboard.press('Enter');
      await this.delay(400); // 300ms → 400ms

      // 공백 정리
      await this.normalizeSpacingAfterLastImage(frame, 1);
    } catch (sizeError) {
      this.log(`      ⚠️ 이미지 후처리 실패: ${(sizeError as Error).message}`);
    }
  }

  /**
   * ✅ [신규] 문서너비 맞추기 + 바로 링크 삽입 (물리 마우스 클릭 적용!)
   */
  private async setImageSizeAndAttachLink(link: string): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    try {
      this.log(`   🔗 [통합] 문서너비 맞추기 + 링크 삽입: ${link.substring(0, 50)}...`);

      // iframe 오프셋 계산
      const frameElement = await page.$('iframe#mainFrame, iframe.se-iframe, iframe[name="mainFrame"]');
      let offsetX = 0, offsetY = 0;
      if (frameElement) {
        const frameRect = await frameElement.boundingBox();
        if (frameRect) {
          offsetX = frameRect.x;
          offsetY = frameRect.y;
        }
      }

      // ✅ [핵심 1] 이미지 스크롤 + 좌표 가져오기
      await frame.evaluate(() => {
        const imgs = document.querySelectorAll('img.se-image-resource');
        if (imgs.length > 0) {
          const lastImg = imgs[imgs.length - 1] as HTMLElement;
          lastImg.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      });
      await this.delay(800);

      const imgRect = await frame.evaluate(() => {
        const imgs = document.querySelectorAll('img.se-image-resource');
        if (imgs.length > 0) {
          const lastImg = imgs[imgs.length - 1] as HTMLElement;
          const rect = lastImg.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, found: true };
        }
        return { x: 0, y: 0, found: false };
      });

      if (!imgRect.found) {
        this.log('   ⚠️ 이미지를 찾을 수 없습니다.');
        return;
      }

      // ✅ [핵심 2] 물리 마우스 더블 클릭 (이미지 선택)
      const clickX = offsetX + imgRect.x;
      const clickY = offsetY + imgRect.y;
      this.log(`   🎯 물리적 마우스 클릭: 이미지 정중앙 (${Math.round(clickX)}, ${Math.round(clickY)})`);

      await page.mouse.move(clickX, clickY);
      await this.delay(100);

      // 첫 번째 클릭
      this.log(`   🖱️ 첫 번째 클릭 (down → 200ms → up)`);
      await page.mouse.down();
      await this.delay(200);
      await page.mouse.up();
      await this.delay(300);

      // 두 번째 클릭 (더블 클릭)
      this.log(`   🖱️ 두 번째 클릭 (더블 클릭)`);
      await page.mouse.down();
      await this.delay(100);
      await page.mouse.up();

      await this.delay(2000); // 툴바 렌더링 충분히 대기
      this.log(`   ✅ 물리적 더블 클릭 완료`);

      // ✅ [핵심 3] image-link 버튼 확인
      const imageLinkBtnSelector = 'button[data-name="image-link"]';
      const toolbarVisible = await frame.evaluate((selector) => {
        const btn = document.querySelector(selector);
        return btn && (btn as HTMLElement).offsetParent !== null;
      }, imageLinkBtnSelector);

      if (!toolbarVisible) {
        this.log('   ⚠️ 이미지가 선택되지 않았습니다 (image-link 버튼 안 보임)');
        return;
      }

      this.log('   ✅ 이미지 선택됨 (초록색 테두리 + image-link 버튼 확인)');

      // 2. 문서너비 버튼 클릭
      const documentWidthClicked = await frame.evaluate(() => {
        const selectors = [
          'button[data-name="documentWidth"]',
          'button[data-value="documentWidth"]',
          '.se-component-toolbar button[data-name="documentWidth"]'
        ];
        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn && (btn as HTMLElement).offsetParent !== null) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (documentWidthClicked) {
        this.log('   ✅ 문서너비 버튼 클릭 성공');
      }
      await this.delay(500);

      // 3. 이미지 다시 물리 클릭 (문서너비 후 선택이 해제될 수 있음)
      await page.mouse.move(clickX, clickY);
      await this.delay(100);
      await page.mouse.down();
      await this.delay(200);
      await page.mouse.up();
      await this.delay(1500); // 툴바 렌더링 충분히 대기

      // ✅ [핵심 4] image-link 버튼만 클릭! (text-link 제외)
      this.log('   🔗 이미지 링크 버튼(image-link) 클릭 시도...');
      const linkButtonClicked = await frame.evaluate(() => {
        // ✅ 반드시 data-name="image-link"인 버튼만!
        const imageLinkBtn = document.querySelector('button[data-name="image-link"]') as HTMLElement;

        if (imageLinkBtn && imageLinkBtn.offsetParent !== null) {
          console.log('[링크 삽입] ✅ image-link 버튼 발견 및 클릭!');
          imageLinkBtn.click();
          return { success: true, selector: 'button[data-name="image-link"]' };
        }

        // ⚠️ 폴백에서도 text-link는 절대 클릭 안 함!
        const allLinkBtns = document.querySelectorAll('.se-link-toolbar-button');
        for (const btn of Array.from(allLinkBtns)) {
          const htmlBtn = btn as HTMLElement;
          const dataName = htmlBtn.getAttribute('data-name');

          if (dataName === 'text-link') {
            console.log('[링크 삽입] ⚠️ text-link 버튼 발견 - 건너뜀');
            continue;
          }

          if (htmlBtn.offsetParent !== null) {
            console.log('[링크 삽입] ✅ 폴백 링크 버튼 클릭:', dataName);
            htmlBtn.click();
            return { success: true, selector: `data-name="${dataName}"` };
          }
        }

        return { success: false, selector: '' };
      });

      if (linkButtonClicked.success) {
        this.log(`   ✅ 이미지 링크 버튼 클릭 성공: ${linkButtonClicked.selector}`);
      } else {
        this.log('   ⚠️ image-link 버튼을 찾을 수 없습니다.');
        return;
      }

      await this.delay(800); // 링크 입력창 나타남 대기

      // 5. 이미지 위에 나타난 링크 입력창 찾기 및 링크 입력
      this.log('   📝 링크 입력창 찾는 중...');
      const inputFound = await frame.evaluate(() => {
        // 이미지 위에 나타나는 인라인 입력창 셀렉터
        const inputSelectors = [
          // 이미지 위 인라인 입력창
          '.se-image-link-input input',
          '.se-link-input input',
          'input.se-image-link-url',
          // 일반 링크 팝업 입력창
          '.se-popup-link-url input',
          'input.se-popup-input-text',
          'input[placeholder*="URL"]',
          'input[placeholder*="url"]',
          'input[placeholder*="링크"]',
          'input[placeholder*="http"]',
          // 범용
          '.se-layer input[type="text"]',
          '.se-popup input[type="text"]'
        ];

        for (const sel of inputSelectors) {
          const input = document.querySelector(sel) as HTMLInputElement;
          if (input && input.offsetParent !== null) {
            input.focus();
            input.value = ''; // 기존 값 지우기
            console.log('[링크 삽입] ✅ 입력창 발견:', sel);
            return { found: true, selector: sel };
          }
        }
        return { found: false, selector: '' };
      });

      if (inputFound.found) {
        this.log(`   ✅ 링크 입력창 발견: ${inputFound.selector}`);
      } else {
        this.log('   ⚠️ 링크 입력창을 찾을 수 없습니다.');
        await page.keyboard.press('Escape');
        return;
      }

      // 6. 링크 입력
      await page.keyboard.type(link, { delay: 15 });
      await this.delay(400);

      // 7. Enter 2번으로 확정
      this.log('   ⏎ Enter 2회 입력 (링크 확정)...');
      await page.keyboard.press('Enter');
      await this.delay(300);
      await page.keyboard.press('Enter');
      await this.delay(500);

      this.log('   ✅ 문서너비 + 링크 삽입 완료!');

    } catch (error) {
      this.log(`   ⚠️ 문서너비+링크 삽입 실패: ${(error as Error).message}`);
      await this.setImageSizeToDocumentWidth();
    }
  }

  // ✅ 이미지에 링크 삽입 (쇼핑커넥트용) - 강화된 버전
  private async attachLinkToLastImage(link: string): Promise<void> {
    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    try {
      this.log(`   🔗 이미지에 제휴 링크 삽입 중: ${link}`);

      // 0. 기존 선택 해제
      await page.keyboard.press('Escape');
      await this.delay(300);

      // 1. 마지막 이미지 위치 찾기
      const imageInfo = await frame.evaluate(() => {
        const selectors = [
          'img.se-image-resource',
          '.se-module-image img',
          '.se-image-resource',
          '.se-component-content img'
        ];

        for (const selector of selectors) {
          const imgs = document.querySelectorAll(selector);
          if (imgs.length > 0) {
            const lastImg = imgs[imgs.length - 1] as HTMLElement;
            const rect = lastImg.getBoundingClientRect();

            // 스크롤하여 이미지를 화면에 표시
            lastImg.scrollIntoView({ behavior: 'auto', block: 'center' });

            console.log('[이미지 링크] ✅ 이미지 위치 확인:', rect);
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              found: true
            };
          }
        }
        return { x: 0, y: 0, found: false };
      });

      if (!imageInfo.found) {
        this.log('   ⚠️ 이미지를 찾을 수 없습니다.');
        return;
      }

      this.log(`   📍 이미지 위치: x=${imageInfo.x}, y=${imageInfo.y}`);
      await this.delay(500);

      // ✅ [핵심 수정] 실제 마우스 클릭으로 이미지 선택 (DOM click은 네이버 에디터에서 안 먹음)
      let imageSelected = false;

      // iframe 오프셋 계산
      const frameElement = await page.$('iframe#mainFrame, iframe.se-iframe, iframe[name="mainFrame"]');
      let offsetX = 0, offsetY = 0;
      if (frameElement) {
        const frameRect = await frameElement.boundingBox();
        if (frameRect) {
          offsetX = frameRect.x;
          offsetY = frameRect.y;
        }
      }

      for (let attempt = 1; attempt <= 3; attempt++) {
        this.log(`   🖱️ 이미지 클릭 시도 ${attempt}/3...`);

        // ✅ [핵심 1] 스크롤 - 이미지를 화면 정중앙으로 가져옴 (behavior: 'instant' 필수!)
        await frame.evaluate(() => {
          const imgs = document.querySelectorAll('img.se-image-resource');
          if (imgs.length > 0) {
            const lastImg = imgs[imgs.length - 1] as HTMLElement;
            lastImg.scrollIntoView({ behavior: 'instant', block: 'center' });
          }
        });
        await this.delay(800); // 스크롤 안정화 대기 (증가)

        // ✅ [핵심 2] 좌표 재계산 (스크롤 후 좌표가 바뀜!)
        const imgRect = await frame.evaluate(() => {
          const imgs = document.querySelectorAll('img.se-image-resource');
          if (imgs.length > 0) {
            const lastImg = imgs[imgs.length - 1] as HTMLElement;
            const rect = lastImg.getBoundingClientRect();
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              width: rect.width,
              height: rect.height,
              found: true
            };
          }
          return { x: 0, y: 0, width: 0, height: 0, found: false };
        });

        if (!imgRect.found) {
          this.log(`   ⚠️ 이미지 좌표 가져오기 실패 (시도 ${attempt}/3)`);
          await this.delay(500);
          continue;
        }

        // ✅ [핵심 3] 물리적 마우스 클릭 (iframe 오프셋 + 이미지 정중앙)
        const clickX = offsetX + imgRect.x;
        const clickY = offsetY + imgRect.y;
        this.log(`   🎯 물리적 마우스 클릭: 이미지 정중앙 (${Math.round(clickX)}, ${Math.round(clickY)})`);

        // ✅ [강화] 마우스 이동
        await page.mouse.move(clickX, clickY);
        await this.delay(100);

        // ✅ [강화] 첫 번째 클릭 (꾹 누름)
        this.log(`   🖱️ 첫 번째 클릭 (down → 200ms → up)`);
        await page.mouse.down();
        await this.delay(200); // 0.2초 꾹 누름
        await page.mouse.up();
        await this.delay(300);

        // ✅ [강화] 두 번째 클릭 (더블 클릭 효과)
        this.log(`   🖱️ 두 번째 클릭 (더블 클릭)`);
        await page.mouse.down();
        await this.delay(100);
        await page.mouse.up();

        this.log(`   ✅ 물리적 더블 클릭 완료`);

        // ✅ [핵심 4] 툴바 확인 - 2초 대기 후 버튼 확인
        await this.delay(2000);

        const imageLinkBtnSelector = 'button[data-name="image-link"]';
        const toolbarVisible = await frame.evaluate((selector) => {
          const btn = document.querySelector(selector);
          if (btn && (btn as HTMLElement).offsetParent !== null) {
            console.log('[이미지 링크] ✅ 이미지 링크 버튼 발견!');
            return true;
          }
          return false;
        }, imageLinkBtnSelector);

        if (toolbarVisible) {
          this.log(`   ✅ 이미지 선택 성공! (초록색 테두리 + image-link 버튼 확인됨)`);
          imageSelected = true;
          break;
        } else {
          this.log(`   ⚠️ 클릭했는데 image-link 버튼 안 뜸, 재시도... (${attempt}/3)`);
          // 재시도 전 Escape 눌러서 리셋 후 다시 시도
          await page.keyboard.press('Escape');
          await this.delay(500);
        }
      }

      if (!imageSelected) {
        this.log('   ⚠️ 이미지 선택 실패, 링크 삽입을 건너뜁니다.');
        return;
      }

      // ✅ [2026-01-21] 문서너비 버튼 먼저 클릭 (이미지가 문서 너비에 맞게 표시되도록)
      // 이미지 선택 후 (초록색 테두리) 툴바에 있는 "문서 너비" 버튼 클릭
      this.log('   📐 문서너비 버튼 클릭 시도...');

      const docWidthClicked = await frame.evaluate(() => {
        // ✅ 정확한 셀렉터: data-name="content-mode-without-pagefull" 또는 data-value="fit"
        const docWidthSelectors = [
          'button[data-name="content-mode-without-pagefull"]',
          'button[data-value="fit"]',
          'button.se-object-arrangement-fit-toolbar-button',
          'button[data-name*="fit"]'
        ];

        for (const selector of docWidthSelectors) {
          const btn = document.querySelector(selector) as HTMLElement;
          if (btn && btn.offsetParent !== null) {
            // 이미 선택되어 있는지 확인 (se-is-selected 클래스)
            const isAlreadySelected = btn.classList.contains('se-is-selected');

            if (!isAlreadySelected) {
              console.log('[문서너비] ✅ 문서너비 버튼 클릭:', selector);
              btn.click();
              return { found: true, clicked: true, selector, alreadySelected: false };
            } else {
              console.log('[문서너비] ℹ️ 문서너비 버튼 이미 선택됨:', selector);
              return { found: true, clicked: false, selector, alreadySelected: true };
            }
          }
        }

        // 폴백: 텍스트로 찾기
        const allButtons = document.querySelectorAll('button.se-icon-toolbar-button');
        for (const btn of Array.from(allButtons)) {
          const htmlBtn = btn as HTMLElement;
          const tooltip = htmlBtn.querySelector('.se-toolbar-tooltip')?.textContent?.trim() || '';
          const blind = htmlBtn.querySelector('.se-blind')?.textContent?.trim() || '';

          if (tooltip.includes('문서 너비') || blind.includes('문서 너비')) {
            const isAlreadySelected = htmlBtn.classList.contains('se-is-selected');

            if (!isAlreadySelected) {
              console.log('[문서너비] ✅ 문서너비 버튼 클릭 (텍스트 매칭):', tooltip || blind);
              htmlBtn.click();
              return { found: true, clicked: true, selector: '텍스트 매칭', alreadySelected: false };
            } else {
              console.log('[문서너비] ℹ️ 문서너비 버튼 이미 선택됨 (텍스트 매칭):', tooltip || blind);
              return { found: true, clicked: false, selector: '텍스트 매칭', alreadySelected: true };
            }
          }
        }

        console.log('[문서너비] ⚠️ 문서너비 버튼을 찾을 수 없음');
        return { found: false, clicked: false, selector: '', alreadySelected: false };
      });

      if (docWidthClicked.found) {
        if (docWidthClicked.clicked) {
          this.log(`   ✅ 문서너비 버튼 클릭 완료: ${docWidthClicked.selector}`);
        } else if (docWidthClicked.alreadySelected) {
          this.log(`   ℹ️ 문서너비 이미 선택됨: ${docWidthClicked.selector}`);
        }
        await this.delay(300); // 버튼 클릭 후 잠깐 대기
      } else {
        this.log('   ⚠️ 문서너비 버튼을 찾지 못함 (이미지 툴바에 없을 수 있음)');
      }

      // ✅ [수정] 이미지 선택 완료 후 링크 버튼 클릭으로 진행


      // 툴바 한번 더 확인
      const toolbarExists = await frame.evaluate(() => {
        const toolbarSelectors = [
          'button[data-name="image-link"]',
          '.se-link-toolbar-button',
          '.se-component-toolbar'
        ];
        for (const sel of toolbarSelectors) {
          const el = document.querySelector(sel);
          if (el && (el as HTMLElement).offsetParent !== null) {
            return true;
          }
        }
        return false;
      });

      if (!toolbarExists) {
        this.log('      ⚠️ 이미지 툴바가 보이지 않음, 추가 대기...');
        await this.delay(500);
      }

      // ✅ [수정] 2. 이미지 링크 버튼 클릭 (반드시 data-name="image-link"만 사용!)
      this.log('      🔍 이미지 툴바에서 "image-link" 버튼 찾는 중...');

      // ✅ [핵심] image-link 버튼만 클릭 (text-link 버튼 절대 클릭 금지!)
      const linkButtonClicked = await frame.evaluate(() => {
        // ✅ 반드시 data-name="image-link"인 버튼만 찾음 (text-link 제외)
        const imageLinkBtn = document.querySelector('button[data-name="image-link"]') as HTMLElement;

        if (imageLinkBtn && imageLinkBtn.offsetParent !== null) {
          console.log('[이미지 링크] ✅ image-link 버튼 발견 및 클릭!');
          imageLinkBtn.click();
          return { success: true, selector: 'button[data-name="image-link"]' };
        }

        // ✅ 폴백: 이미지 컴포넌트 툴바 내의 링크 버튼 (text-link 제외)
        const allLinkBtns = document.querySelectorAll('.se-link-toolbar-button, button[data-name="link"]');
        for (const btn of Array.from(allLinkBtns)) {
          const htmlBtn = btn as HTMLElement;
          const dataName = htmlBtn.getAttribute('data-name');

          // ⚠️ text-link는 절대 클릭하지 않음!
          if (dataName === 'text-link') {
            console.log('[이미지 링크] ⚠️ text-link 버튼 발견 - 건너뜀');
            continue;
          }

          if (htmlBtn.offsetParent !== null) {
            console.log('[이미지 링크] ✅ 폴백 링크 버튼 클릭:', dataName);
            htmlBtn.click();
            return { success: true, selector: `data-name="${dataName}"` };
          }
        }

        return { success: false, selector: '' };
      });

      if (linkButtonClicked.success) {
        this.log(`      ✅ 이미지 링크 버튼 클릭 성공: ${linkButtonClicked.selector}`);
      } else {
        this.log('      ⚠️ image-link 버튼을 찾을 수 없습니다. 이미지가 선택되지 않았을 수 있습니다.');
        await page.keyboard.press('Escape');
        return;
      }

      await this.delay(1000); // ✅ 팝업 열림 대기

      // 3. 링크 입력창 찾기 및 URL 입력
      this.log('      📝 링크 입력창 찾는 중...');

      const inputSelectors = [
        // ✅ 네이버 최신 에디터 셀렉터 추가
        '.se-popup-link-url input',
        '.se-popup-link input[type="text"]',
        'input.se-popup-input-text',
        'input[type="url"]',
        'input[type="text"][placeholder*="링크"]',
        'input[placeholder*="URL"]',
        'input[placeholder*="url"]',
        'input[placeholder*="주소"]',
        'input[placeholder*="http"]',
        '.se-popup input[type="text"]',
        '.se-layer input[type="text"]',
        '.se-link-input input',
        '.se-link-input'
      ];

      let inputFound = false;
      for (const selector of inputSelectors) {
        const linkInput = await frame.$(selector).catch(() => null);
        if (linkInput) {
          this.log(`      ✅ 입력창 발견: ${selector}`);

          // 입력창 클릭
          await linkInput.click();
          await this.delay(100);

          // 기존 텍스트 전체 선택 후 삭제
          await page.keyboard.down('Control');
          await page.keyboard.press('KeyA');
          await page.keyboard.up('Control');
          await this.delay(50);
          await page.keyboard.press('Backspace');
          await this.delay(100);

          // 링크 입력
          await page.keyboard.type(link, { delay: 15 });
          await this.delay(400);

          inputFound = true;
          break;
        }
      }

      if (!inputFound) {
        this.log('   ⚠️ 링크 입력창을 찾을 수 없습니다.');
        // 팝업 닫기
        await page.keyboard.press('Escape');
        return;
      }

      // ✅ [개선] 링크 입력 후 확인 버튼 클릭으로 확정
      this.log('      ⏎ 링크 확정 중...');

      // 방법 1: 확인 버튼 찾아서 클릭
      const confirmClicked = await frame.evaluate(() => {
        const confirmSelectors = [
          'button.se-popup-button-confirm',
          'button[data-type="confirm"]',
          'button.se-popup-confirm',
          '.se-popup-button-wrap button:last-child',
          'button[class*="confirm"]',
          '.se-popup button:not([data-type="cancel"])'
        ];

        for (const sel of confirmSelectors) {
          const btn = document.querySelector(sel) as HTMLElement;
          if (btn && btn.offsetParent !== null && !btn.textContent?.includes('취소')) {
            console.log('[링크 확정] ✅ 확인 버튼 클릭:', sel);
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (confirmClicked) {
        this.log('      ✅ 확인 버튼 클릭 성공');
        await this.delay(500);
      } else {
        // ✅ [수정] 확인 버튼을 못 찾으면 Enter 2회 시도 (사용자 피드백 반영)
        this.log('      ⏎ 확인 버튼 없음, Enter 2회 시도...');
        await page.keyboard.press('Enter');
        await this.delay(200);
        await page.keyboard.press('Enter');
        await this.delay(500);
      }

      this.log('   ✅ 이미지에 제휴 링크 삽입 완료');

      // ✅ [개선] 링크 삽입 후 Enter 두번으로 바로 커서 이탈
      await this.delay(300);
      this.log('      ⏎ Enter 2회 입력 (커서 이탈)...');
      await page.keyboard.press('Enter');
      await this.delay(150);
      await page.keyboard.press('Enter');
      await this.delay(300);

    } catch (error) {
      this.log(`   ⚠️ 이미지 링크 삽입 중 오류: ${(error as Error).message}`);
      // 팝업이 열려있을 수 있으니 닫기
      await page.keyboard.press('Escape').catch(() => { });
    }
  }

  private async insertImages(images: AutomationImage[], plans: ImagePlan[]): Promise<void> {
    if (!images.length) {
      return;
    }

    const planMap = new Map<string, ImagePlan>();
    plans.forEach((plan) => {
      planMap.set(plan.heading, plan);
    });

    const frame = (await this.getAttachedFrame());
    const page = this.ensurePage();

    for (const image of images) {
      this.ensureNotCancelled();
      const plan = planMap.get(image.heading);
      let uploadSucceeded = false;

      try {
        this.log(`🖼️ '${image.heading}' 이미지를 업로드합니다...`);

        // ✅ filePath가 없는 경우 건너뛰기
        if (!image.filePath) {
          this.log(`   ⚠️ 이미지 경로가 없습니다. 이 이미지를 건너뜁니다.`);
          continue;
        }

        // 보안: 파일 경로 마스킹
        const maskedPath = image.filePath.replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~');
        this.log(`   📁 파일 경로: ${maskedPath}`);

        // URL인지 확인 (파일 검증 전에 먼저 체크)
        const isUrl = image.filePath.startsWith('http://') || image.filePath.startsWith('https://');

        // 로컬 파일인 경우에만 검증
        if (!isUrl) {
          // 이미지 파일 검증: 앱에서 생성했거나 로컬에 저장된 파일만 사용
          const fs = await import('fs/promises');
          let isValidImage = false;

          try {
            await fs.access(image.filePath);
            const stats = await fs.stat(image.filePath);
            isValidImage = stats.isFile();

            // 파일 확장자 확인
            const path = await import('path');
            const ext = path.extname(image.filePath).toLowerCase();
            isValidImage = isValidImage && ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);

            // 파일 크기 확인 (최소 0.5KB, 최대 50MB)
            const fileSizeKB = stats.size / 1024;
            if (fileSizeKB < 0.5 || fileSizeKB > 51200) {
              isValidImage = false;
              this.log(`   ⚠️ 파일 크기가 적절하지 않습니다: ${fileSizeKB.toFixed(2)} KB`);
            }
          } catch (fileError) {
            this.log(`   ❌ 이미지 파일 접근 실패: ${(fileError as Error).message}`);
            isValidImage = false;
          }

          if (!isValidImage) {
            this.log(`   ⚠️ 유효하지 않은 이미지 파일입니다. 이 이미지를 건너뜁니다.`);
            continue; // 다음 이미지로 진행
          }

          this.log(`   ✅ 로컬에 저장된 이미지를 업로드합니다.`);
        } else {
          this.log(`   ✅ 이미지 URL을 사용합니다.`);
        }

        // 🎯 방법 1: 모든 이미지를 Base64 Data URL로 변환하여 DOM에 직접 삽입 (가장 확실한 방법)
        let imageDataUrl = image.filePath;

        // 로컬 파일인 경우 Base64 Data URL로 변환 (네이버 보안 우회)
        if (!isUrl) {
          this.log(`   🔄 로컬 파일을 Base64 Data URL로 변환 중... (네이버 보안 우회)`);
          try {
            const fs = await import('fs/promises');
            const imageBuffer = await fs.readFile(image.filePath);
            const base64 = imageBuffer.toString('base64');

            // 확장자에 따라 MIME 타입 결정
            // URL에서 쿼리 파라미터 제거 후 확장자 추출
            const urlWithoutQuery = image.filePath.split('?')[0].split('#')[0];
            const ext = urlWithoutQuery.split('.').pop()?.toLowerCase() || 'png';
            // 유효한 확장자만 허용
            const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'png';
            const mimeType = validExt === 'jpg' || validExt === 'jpeg' ? 'image/jpeg' :
              validExt === 'png' ? 'image/png' :
                validExt === 'gif' ? 'image/gif' :
                  validExt === 'webp' ? 'image/webp' : 'image/png';

            imageDataUrl = `data:${mimeType};base64,${base64}`;
            this.log(`   ✅ Base64 변환 완료 (크기: ${(base64.length / 1024).toFixed(2)} KB)`);
          } catch (base64Error) {
            this.log(`   ❌ Base64 변환 실패: ${(base64Error as Error).message}`);
            throw base64Error; // Base64 변환 실패 시 중단
          }
        } else {
          // 외부 URL인 경우도 Base64로 변환 시도 (더 확실함)
          this.log(`   🔄 외부 URL 이미지를 Base64로 변환 중...`);
          try {
            const https = await import('https');
            const http = await import('http');
            const url = await import('url');

            // URL 파싱
            const parsedUrl = new url.URL(image.filePath);
            const isHttps = parsedUrl.protocol === 'https:';
            const client = isHttps ? https : http;

            // Promise로 래핑하여 다운로드
            const buffer = await new Promise<Buffer>((resolve, reject) => {
              const request = client.get(image.filePath, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                timeout: 10000,
              }, (response) => {
                if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
                  reject(new Error(`이미지 다운로드 실패: ${response.statusCode} ${response.statusMessage || ''}`));
                  return;
                }

                const chunks: Buffer[] = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => resolve(Buffer.concat(chunks)));
                response.on('error', reject);
              });

              request.on('error', reject);
              request.on('timeout', () => {
                request.destroy();
                reject(new Error('이미지 다운로드 타임아웃'));
              });
            });
            const base64 = buffer.toString('base64');

            // URL에서 확장자 추출 (쿼리 파라미터 제거)
            const urlPath = new URL(image.filePath).pathname;
            const ext = urlPath.split('.').pop()?.toLowerCase() || 'png';
            // 유효한 확장자만 허용
            const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'png';
            const mimeType = validExt === 'jpg' || validExt === 'jpeg' ? 'image/jpeg' :
              validExt === 'png' ? 'image/png' :
                validExt === 'gif' ? 'image/gif' :
                  validExt === 'webp' ? 'image/webp' : 'image/png';

            imageDataUrl = `data:${mimeType};base64,${base64}`;
            this.log(`   ✅ 외부 URL을 Base64로 변환 완료 (크기: ${(base64.length / 1024).toFixed(2)} KB)`);
          } catch (urlError) {
            this.log(`   ⚠️ 외부 URL을 Base64로 변환 실패, 원본 URL 사용: ${(urlError as Error).message}`);
            // 실패 시 원본 URL 사용
          }
        }

        // 외부 URL인 경우 네이버 에디터의 이미지 URL 삽입 기능 사용
        if (isUrl && imageDataUrl) {
          this.log(`   🔄 외부 이미지 URL을 에디터에 삽입 중...`);
          this.log(`   📎 URL: ${imageDataUrl.substring(0, 100)}...`);

          try {
            // 네이버 에디터의 이미지 URL 삽입 기능 사용
            // 방법 1: 이미지 버튼 클릭 → URL 입력 옵션 찾기
            const imageButton = await frame.$('button[data-name="image"], button.se-image-toolbar-button').catch(() => null);

            if (imageButton) {
              await imageButton.click();
              await this.delay(this.DELAYS.LONG);

              // URL 입력 옵션 찾기 (여러 패턴 시도)
              const urlInputOption = await frame.$('input[type="url"], input[placeholder*="URL"], input[placeholder*="url"], input[placeholder*="주소"], button:has-text("URL"), button:has-text("주소"), a[href*="url"], a:has-text("URL")').catch(() => null);

              if (urlInputOption) {
                this.log(`   ✅ URL 입력 옵션 발견`);
                await urlInputOption.click().catch(() => {
                  // 클릭 실패 시 직접 입력 시도
                  return urlInputOption.type(imageDataUrl, { delay: 50 });
                });
                await this.delay(this.DELAYS.LONG);
              }

              // URL 입력 필드 찾기 및 입력
              const urlInput = await frame.$('input[type="url"], input[placeholder*="URL"], input[placeholder*="url"], input[placeholder*="주소"], input[type="text"]').catch(() => null);

              if (urlInput) {
                await urlInput.click({ clickCount: 3 }); // 기존 내용 선택
                await urlInput.type(imageDataUrl, { delay: 50 });
                await this.delay(this.DELAYS.LONG);

                // 확인/삽입 버튼 찾기 및 클릭
                const insertButton = await frame.$('button:has-text("확인"), button:has-text("삽입"), button:has-text("OK"), button:has-text("Insert"), button[type="submit"]').catch(() => null);
                if (insertButton) {
                  await insertButton.click();
                  await this.delay(2000);

                  // 이미지가 삽입되었는지 확인
                  const imgCheck = await frame.$$('img').catch(() => []);
                  if (imgCheck.length > 0) {
                    uploadSucceeded = true;
                    this.log(`   ✅ 외부 이미지 URL 삽입 성공! (DOM에서 ${imgCheck.length}개 이미지 발견)`);
                  }
                }
              }

              // 패널이 열려있으면 닫기
              await page.keyboard.press('Escape').catch(() => { });
              await this.delay(this.DELAYS.MEDIUM);
            }

            // 방법 2: DOM에 직접 삽입 (방법 1 실패 시)
            if (!uploadSucceeded) {
              this.log(`   🔄 DOM에 직접 삽입 시도...`);

              // 여러 방법으로 DOM 삽입 시도
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  const inserted = await frame.evaluate((imgUrl) => {
                    // 방법 1: Selection API 사용
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                      const range = selection.getRangeAt(0);

                      const img = document.createElement('img');
                      img.src = imgUrl;
                      // ✅ 본문 크기에 딱 맞게 중앙 정렬
                      img.style.width = '100%'; // 본문 전체 너비 사용
                      img.style.maxWidth = '100%'; // 본문을 넘지 않도록 제한
                      img.style.height = 'auto'; // 비율 유지
                      img.style.display = 'block'; // 블록 요소로 표시
                      img.style.margin = '20px auto'; // 중앙 정렬 + 상하 여백
                      img.style.borderRadius = '8px'; // 약간 둥근 모서리
                      img.style.objectFit = 'contain'; // 이미지 전체가 보이도록

                      range.deleteContents();
                      range.insertNode(img);

                      // ✅ 다음 이미지가 바로 이어서 들어가도 공백이 생기지 않도록 <br>를 만들지 않고,
                      // 커서를 이미지 바로 뒤로 이동
                      range.setStartAfter(img);
                      range.collapse(true);
                      selection.removeAllRanges();
                      selection.addRange(range);
                      return true;
                    }

                    // 방법 2: 에디터 본문 영역에 직접 추가
                    const editor = document.querySelector('.se-section-text, .se-main-container, .se-component');
                    if (editor) {
                      const img = document.createElement('img');
                      img.src = imgUrl;
                      // ✅ 본문 크기에 딱 맞게 중앙 정렬
                      img.style.width = '100%'; // 본문 전체 너비 사용
                      img.style.maxWidth = '100%'; // 본문을 넘지 않도록 제한
                      img.style.height = 'auto'; // 비율 유지
                      img.style.display = 'block'; // 블록 요소로 표시
                      img.style.margin = '20px auto'; // 중앙 정렬 + 상하 여백
                      img.style.borderRadius = '8px'; // 약간 둥근 모서리
                      img.style.objectFit = 'contain'; // 이미지 전체가 보이도록

                      editor.appendChild(img);

                      // 커서를 이미지 뒤로 이동 (다음 삽입을 위해)
                      const selection = window.getSelection();
                      if (selection) {
                        const r = document.createRange();
                        r.setStartAfter(img);
                        r.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(r);
                      }
                      return true;
                    }

                    return false;
                  }, imageDataUrl);

                  if (inserted) {
                    await this.delay(1000);

                    // 이미지가 삽입되었는지 확인
                    const imgCheck = await frame.$$('img').catch(() => []);
                    const contentImages = await frame.evaluate(() => {
                      const imgs = Array.from(document.querySelectorAll('img'));
                      return imgs.filter(img => {
                        const src = img.getAttribute('src') || '';
                        return src.startsWith('http') && !src.includes('static.blog.naver.net');
                      });
                    }).catch(() => []);

                    if (contentImages.length > 0 || imgCheck.length > 0) {
                      uploadSucceeded = true;
                      this.log(`   ✅ 외부 이미지 DOM 삽입 성공! (시도 ${attempt + 1}, 이미지 ${contentImages.length || imgCheck.length}개 발견)`);
                      break;
                    }
                  }
                } catch (domError) {
                  this.log(`   ⚠️ DOM 삽입 시도 ${attempt + 1} 실패: ${(domError as Error).message}`);
                }

                if (attempt < 2) {
                  await this.delay(this.DELAYS.LONG);
                }
              }

              if (!uploadSucceeded) {
                this.log(`   ⚠️ DOM 직접 삽입이 실패했습니다. 외부 URL 이미지는 네이버 에디터에서 직접 삽입해야 할 수 있습니다.`);
              }
            }
          } catch (insertError) {
            this.log(`   ❌ 외부 이미지 삽입 실패: ${(insertError as Error).message}`);
          }
        }

        // Base64 Data URL을 DOM에 직접 삽입 (가장 확실한 방법)
        if (imageDataUrl && imageDataUrl.startsWith('data:')) {
          this.log(`   🔄 Base64 Data URL을 네이버 에디터에 직접 삽입 중...`);
          this.log(`   📎 Data URL 크기: ${(imageDataUrl.length / 1024).toFixed(2)} KB`);

          // 여러 방법으로 시도
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              const inserted = await frame.evaluate((imgUrl) => {
                // ⚠️ 중요: 제목 필드가 아닌 본문 영역에만 삽입
                const titleElement = document.querySelector('.se-section-documentTitle');
                const bodyElement = document.querySelector('.se-section-text, .se-main-container, .se-component, .se-module-text');

                if (!bodyElement) {
                  return false; // 본문 영역을 찾을 수 없음
                }

                // 방법 1: Selection API 사용 (가장 정확) - 현재 커서 위치에 삽입
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                  const range = selection.getRangeAt(0).cloneRange(); // 원본 range 복사
                  const container = range.commonAncestorContainer;
                  const node = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

                  // ⚠️ 중요: 제목 필드에 있으면 본문 영역으로 이동하되, 최상단이 아닌 현재 위치 유지
                  if (titleElement && titleElement.contains(node)) {
                    // 제목 필드에 있으면 본문 영역의 현재 커서 위치를 찾기
                    // 소제목이 입력된 위치를 찾기 위해 최근 입력된 텍스트를 찾음
                    const textNodes = [];
                    const walker = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
                    let textNode;
                    while (textNode = walker.nextNode()) {
                      if (textNode.textContent && textNode.textContent.trim().length > 0) {
                        textNodes.push(textNode);
                      }
                    }

                    // 마지막 텍스트 노드(방금 입력한 소제목) 다음으로 이동
                    if (textNodes.length > 0) {
                      const lastTextNode = textNodes[textNodes.length - 1];
                      const parent = lastTextNode.parentElement;
                      if (parent && parent.nextSibling) {
                        range.setStartBefore(parent.nextSibling);
                      } else if (parent) {
                        range.setStartAfter(parent);
                      } else {
                        range.setStartAfter(lastTextNode);
                      }
                      range.collapse(true);
                    } else {
                      // 텍스트 노드를 찾을 수 없으면 본문 영역 끝으로
                      range.selectNodeContents(bodyElement);
                      range.collapse(false);
                    }
                  }

                  // ⚠️ 중요: 본문 영역에 있는지 확인하되, 최상단으로 이동하지 않음
                  const currentContainer = range.commonAncestorContainer;
                  const currentNode = currentContainer.nodeType === Node.TEXT_NODE ? currentContainer.parentElement : currentContainer;

                  // 본문 영역이 아니면 현재 위치를 유지하지 않고 본문 영역으로 이동
                  if (!bodyElement.contains(currentNode)) {
                    // 본문 영역 끝으로 이동 (하지만 이미 위에서 처리했으므로 여기서는 최후의 수단)
                    range.selectNodeContents(bodyElement);
                    range.collapse(false);
                  }

                  // ⚠️ 중요: 현재 커서 위치에 이미지를 삽입 (소제목 바로 아래)
                  // ✅ 이미지 요소 생성 (본문 크기에 딱 맞게 중앙 정렬)
                  const img = document.createElement('img');
                  img.src = imgUrl;

                  // ✅ 네이버 블로그 본문 너비에 맞춤 (중앙 정렬)
                  img.style.width = '100%'; // 본문 전체 너비 사용
                  img.style.maxWidth = '100%'; // 본문을 넘지 않도록 제한
                  img.style.height = 'auto'; // 비율 유지
                  img.style.display = 'block'; // 블록 요소로 표시
                  img.style.margin = '20px auto'; // 중앙 정렬 + 상하 여백
                  img.style.borderRadius = '8px'; // 약간 둥근 모서리
                  img.style.objectFit = 'contain'; // 이미지 전체가 보이도록 (잘리지 않음)
                  img.setAttribute('data-se-image-resource', 'true');

                  // 현재 위치에 이미지 삽입 (제목 필드 제외, 본문 영역만)
                  try {
                    // 컨테이너 생성 (이미지를 감싸는 div)
                    const imgContainer = document.createElement('div');
                    imgContainer.style.margin = '15px 0';
                    imgContainer.style.textAlign = 'center';
                    imgContainer.appendChild(img);


                    // range가 collapse된 상태인지 확인
                    if (range.collapsed) {
                      // ⚠️ 중요: 제목 필드가 아닌 본문 영역 찾기
                      const titleElement = document.querySelector('.se-section-documentTitle');
                      const bodyElement = document.querySelector('.se-section-text, .se-main-container, .se-component');

                      // 현재 커서가 있는 위치 확인
                      const container = range.commonAncestorContainer;
                      let parentElement = container.nodeType === Node.TEXT_NODE
                        ? container.parentElement
                        : container as HTMLElement;

                      // 제목 필드에 있는지 확인
                      if (titleElement && titleElement.contains(parentElement)) {
                        // 제목 필드에 있으면 본문 영역으로 이동
                        if (bodyElement) {
                          // 본문 영역의 가장 마지막 텍스트 노드 찾기 (소제목)
                          const textNodes = [];
                          const walker = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
                          let textNode;
                          while (textNode = walker.nextNode()) {
                            if (textNode.textContent && textNode.textContent.trim().length > 0) {
                              textNodes.push(textNode);
                            }
                          }

                          if (textNodes.length > 0) {
                            // 마지막 텍스트 노드(소제목)의 부모 요소로 변경
                            const lastTextNode = textNodes[textNodes.length - 1];
                            parentElement = lastTextNode.parentElement as HTMLElement;
                          } else {
                            // 텍스트 노드가 없으면 본문 영역 자체 사용
                            parentElement = bodyElement as HTMLElement;
                          }
                        }
                      }

                      if (parentElement) {
                        // 부모 요소의 다음 위치에 삽입
                        if (parentElement.nextSibling) {
                          parentElement.parentNode?.insertBefore(imgContainer, parentElement.nextSibling);
                        } else if (parentElement.parentNode) {
                          parentElement.parentNode.appendChild(imgContainer);
                        } else {
                          // 폴백: 본문 영역에 추가
                          if (bodyElement) {
                            bodyElement.appendChild(imgContainer);
                          }
                        }
                      } else {
                        // 폴백: range에 직접 삽입
                        range.insertNode(imgContainer);
                      }

                      // 커서를 이미지 뒤로 이동
                      range.setStartAfter(imgContainer);
                      range.collapse(true);
                      selection.removeAllRanges();
                      selection.addRange(range);
                    } else {
                      // range가 collapse되지 않았으면 현재 위치에 삽입
                      const container = range.commonAncestorContainer;
                      const parentElement = container.nodeType === Node.TEXT_NODE
                        ? container.parentElement
                        : container as HTMLElement;

                      if (parentElement && parentElement.parentNode) {
                        if (parentElement.nextSibling) {
                          parentElement.parentNode.insertBefore(imgContainer, parentElement.nextSibling);
                        } else {
                          parentElement.parentNode.appendChild(imgContainer);
                        }
                      } else {
                        range.insertNode(imgContainer);
                      }

                      range.setStartAfter(imgContainer);
                      range.collapse(true);
                      selection.removeAllRanges();
                      selection.addRange(range);
                    }

                    return true;
                  } catch (e) {
                    // 삽입 실패 시 방법 2로 폴백
                    // 이미지 삽입 실패 (에러는 상위에서 처리)
                  }
                }

                // 방법 2: 에디터 본문 영역에 직접 추가 (제목 필드 제외)
                if (bodyElement) {
                  const img = document.createElement('img');
                  img.src = imgUrl;
                  // ✅ 본문 크기에 딱 맞게 중앙 정렬
                  img.style.width = '100%'; // 본문 전체 너비 사용
                  img.style.maxWidth = '100%'; // 본문을 넘지 않도록 제한
                  img.style.height = 'auto'; // 비율 유지
                  img.style.display = 'block'; // 블록 요소로 표시
                  img.style.margin = '20px auto'; // 중앙 정렬 + 상하 여백
                  img.style.borderRadius = '8px'; // 약간 둥근 모서리
                  img.style.objectFit = 'contain'; // 이미지 전체가 보이도록
                  img.setAttribute('data-se-image-resource', 'true');


                  // 현재 커서 위치 찾기
                  const selection = window.getSelection();
                  if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const container = range.commonAncestorContainer;
                    const node = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

                    // 제목 필드가 아닌 본문 영역에만 삽입
                    if (node && bodyElement.contains(node) && (!titleElement || !titleElement.contains(node))) {
                      // 커서 위치에 삽입
                      range.insertNode(img);
                      range.setStartAfter(img);
                      range.collapse(true);
                      selection.removeAllRanges();
                      selection.addRange(range);
                    } else {
                      // 마지막으로 입력된 텍스트 노드(소제목) 찾기
                      const textNodes = [];
                      const walker = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
                      let textNode;
                      while (textNode = walker.nextNode()) {
                        if (textNode.textContent && textNode.textContent.trim().length > 0) {
                          textNodes.push(textNode);
                        }
                      }

                      if (textNodes.length > 0) {
                        // 마지막 텍스트 노드의 부모 요소 찾기
                        const lastTextNode = textNodes[textNodes.length - 1];
                        const parent = lastTextNode.parentElement;

                        if (parent && parent.parentElement) {
                          // 소제목 부모 요소 바로 다음에 이미지 삽입
                          if (parent.nextSibling) {
                            parent.parentElement.insertBefore(img, parent.nextSibling);
                          } else {
                            parent.parentElement.appendChild(img);
                          }
                        } else {
                          // 폴백: 본문 영역 끝에 추가
                          bodyElement.appendChild(img);
                        }
                      } else {
                        // 텍스트 노드가 없으면 본문 영역 끝에 추가
                        bodyElement.appendChild(img);
                      }

                      // 커서를 이미지 뒤로 이동
                      const newRange = document.createRange();
                      newRange.setStartAfter(img);
                      newRange.collapse(true);
                      if (selection) {
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                      }
                    }
                  } else {
                    // 마지막으로 입력된 텍스트 노드(소제목) 찾기
                    const textNodes = [];
                    const walker = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
                    let textNode;
                    while (textNode = walker.nextNode()) {
                      if (textNode.textContent && textNode.textContent.trim().length > 0) {
                        textNodes.push(textNode);
                      }
                    }

                    if (textNodes.length > 0) {
                      // 마지막 텍스트 노드의 부모 요소 찾기
                      const lastTextNode = textNodes[textNodes.length - 1];
                      const parent = lastTextNode.parentElement;

                      if (parent && parent.parentElement) {
                        // 소제목 부모 요소 바로 다음에 이미지 삽입
                        if (parent.nextSibling) {
                          parent.parentElement.insertBefore(img, parent.nextSibling);
                        } else {
                          parent.parentElement.appendChild(img);
                        }
                      } else {
                        // 폴백: 본문 영역 끝에 추가
                        bodyElement.appendChild(img);
                      }
                    } else {
                      // 텍스트 노드가 없으면 본문 영역 끝에 추가
                      bodyElement.appendChild(img);
                    }

                    // 커서를 이미지 뒤로 이동
                    const newRange = document.createRange();
                    newRange.setStartAfter(img);
                    newRange.collapse(true);
                    if (selection) {
                      selection.removeAllRanges();
                      selection.addRange(newRange);
                    }
                  }

                  return true;
                }

                return false;
              }, imageDataUrl);

              if (inserted) {
                await this.delay(1500);

                // 이미지가 실제로 삽입되었는지 확인
                const imgCheck = await frame.$$('img').catch(() => []);
                const dataUrlImages = await frame.evaluate((imgUrl) => {
                  const imgs = Array.from(document.querySelectorAll('img'));
                  return imgs.filter(img => img.src === imgUrl || img.src.startsWith('data:image'));
                }, imageDataUrl).catch(() => []);

                if (dataUrlImages.length > 0 || imgCheck.length > 0) {
                  uploadSucceeded = true;
                  this.log(`   ✅ Base64 Data URL 삽입 성공! (시도 ${attempt + 1}, 이미지 ${dataUrlImages.length || imgCheck.length}개 발견)`);
                  break;
                } else {
                  this.log(`   ⚠️ 시도 ${attempt + 1}: 이미지가 DOM에 나타나지 않았습니다. 재시도...`);
                }
              }
            } catch (insertError) {
              this.log(`   ⚠️ 시도 ${attempt + 1} 실패: ${(insertError as Error).message}`);
            }

            if (attempt < 4) {
              await this.delay(this.DELAYS.LONG);
            }
          }

          if (!uploadSucceeded) {
            this.log(`   ❌ Base64 Data URL 삽입 실패 (5회 시도)`);
          }
        }

        // Base64 삽입이 실패한 경우에만 파일 업로드 시도 (네이버 보안 때문에 비추천)
        if (!uploadSucceeded && !isUrl && !imageDataUrl.startsWith('data:')) {
          // 🎯 방법 2: 이미지 버튼 클릭 + 파일 선택 대화상자 사용
          this.log(`   🔄 이미지 삽입 버튼 클릭 → 파일 선택 대화상자 사용...`);

          // 파일 존재 확인
          const fs = await import('fs/promises');
          try {
            await fs.access(image.filePath);
            const stats = await fs.stat(image.filePath);
            this.log(`   📁 파일 확인 완료: ${image.filePath}`);
            this.log(`   📏 파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);
          } catch (fileCheckError) {
            this.log(`   ❌ 파일 접근 실패: ${(fileCheckError as Error).message}`);
            this.log(`   💡 파일 경로를 확인해주세요: ${image.filePath}`);
          }

          try {
            // 이미지 버튼 찾기
            const imageButton = await frame.$('button[data-name="image"], button.se-image-toolbar-button').catch(() => null);

            if (imageButton) {
              this.log(`   ✅ 이미지 삽입 버튼 발견`);

              // 파일 선택 대화상자 대기 + 버튼 클릭
              const [fileChooser] = await Promise.all([
                page.waitForFileChooser({ timeout: 10000 }), // 10초 대기
                imageButton.click()
              ]);

              // ✅ 이미지 버튼 클릭 후 즉시 ESC 키로 MYBOX 팝업 차단
              await page.keyboard.press('Escape');
              await this.delay(100);

              this.log(`   ✅ 파일 선택 대화상자 열림 (MYBOX 팝업 차단 완료)`);

              // 파일 선택 (절대 경로 사용, 쿼리 파라미터 제거)
              const pathModule = await import('path');
              let absolutePath = pathModule.isAbsolute(image.filePath)
                ? image.filePath
                : pathModule.resolve(image.filePath);

              // ✅ 파일 경로에서 쿼리 파라미터 제거 (파일명에 &type=a340 같은 파라미터가 포함되지 않도록)
              if (absolutePath.includes('&') || absolutePath.includes('?')) {
                const pathParts = absolutePath.split(pathModule.sep);
                const fileName = pathParts[pathParts.length - 1];
                const cleanFileName = fileName.split('?')[0].split('&')[0].split('#')[0];
                if (fileName !== cleanFileName) {
                  pathParts[pathParts.length - 1] = cleanFileName;
                  absolutePath = pathParts.join(pathModule.sep);
                  this.log(`   🔧 파일명 정리: "${fileName}" → "${cleanFileName}"`);
                }
              }

              await fileChooser.accept([absolutePath]);
              this.log(`   ✅ 파일 선택 완료: ${absolutePath}`);

              // 파일 전송 대화상자의 "확인" 버튼 대기 및 클릭
              await this.delay(this.DELAYS.LONG); // 대화상자가 나타날 시간

              // ✅ 파일 전송 오류 다이얼로그 감지 및 처리
              try {
                // 오류 다이얼로그가 나타나는지 확인 (3초 대기)
                const errorDialog = await frame.waitForSelector(
                  'text="파일 전송 오류", text="파일 형식 오류", [class*="error"], [class*="오류"]',
                  { timeout: 3000 }
                ).catch(() => null);

                if (errorDialog) {
                  this.log(`   ⚠️ 파일 전송 오류 다이얼로그 감지됨`);

                  // 오류 다이얼로그의 "확인" 버튼 찾기 및 클릭
                  const confirmButtons = await frame.$$('button').catch(() => []);
                  for (const btn of confirmButtons) {
                    const text = await btn.evaluate((el: Element) => el.textContent?.trim() || '').catch(() => '');
                    if (text === '확인' || text === 'OK') {
                      await btn.click();
                      this.log(`   ✅ 오류 다이얼로그 확인 버튼 클릭 완료`);
                      await this.delay(500);
                      break;
                    }
                  }

                  // 오류 발생 시 이 이미지는 건너뛰고 다음 이미지로 진행
                  this.log(`   ⚠️ 파일 형식 오류로 인해 이 이미지를 건너뜁니다: ${image.heading}`);
                  continue;
                }
              } catch (error) {
                // 오류 다이얼로그가 없으면 정상 진행
              }

              // "확인" 버튼 찾기 및 클릭 (여러 방식 시도) - 정상적인 파일 전송 확인 버튼
              const confirmButton = await frame.$('button:has-text("확인"), button:has-text("OK"), button[class*="confirm"], button[type="submit"]').catch(() => null);
              if (confirmButton) {
                await confirmButton.click();
                this.log(`   ✅ 파일 전송 확인 버튼 클릭 완료`);
              } else {
                // 텍스트로 버튼 찾기
                const buttons = await frame.$$('button').catch(() => []);
                for (const btn of buttons) {
                  const text = await btn.evaluate((el: Element) => el.textContent?.trim() || '').catch(() => '');
                  if (text === '확인' || text === 'OK') {
                    await btn.click();
                    this.log(`   ✅ 파일 전송 확인 버튼 클릭 완료`);
                    break;
                  }
                }
              }

              this.log(`   ⏳ 네이버가 이미지를 처리하는 중...`);

              // 네이버가 파일을 업로드하고 처리할 시간 대기 (시간 증가)
              await this.delay(5000); // 3초 → 5초

              // DOM에서 이미지 확인
              const uploadCheck = await frame.$$('img').catch(() => []);
              this.log(`   🔍 [즉시 확인] DOM에서 이미지 수: ${uploadCheck.length}개`);

              if (uploadCheck.length > 0) {
                uploadSucceeded = true;
                this.log(`   ✅ 이미지 버튼 클릭 방식 성공! (이미지 ${uploadCheck.length}개 발견)`);
              } else {
                this.log(`   ⚠️ 아직 이미지가 DOM에 나타나지 않았습니다. 추가 대기...`);
                await this.delay(5000); // 추가 5초 대기

                const recheckImages = await frame.$$('img').catch(() => []);
                this.log(`   🔍 [재확인] DOM에서 이미지 수: ${recheckImages.length}개`);

                if (recheckImages.length > 0) {
                  uploadSucceeded = true;
                  this.log(`   ✅ 이미지 버튼 클릭 방식 성공! (이미지 ${recheckImages.length}개 발견)`);
                } else {
                  this.log(`   ❌ 10초 대기 후에도 이미지가 DOM에 나타나지 않았습니다`);
                }
              }
            } else {
              throw new Error('이미지 삽입 버튼을 찾을 수 없습니다');
            }
          } catch (buttonError) {
            this.log(`   ❌ 이미지 버튼 클릭 방식 실패: ${(buttonError as Error).message}`);
            this.log(`   💡 기존 방식(파일 input)으로 시도합니다...`);
          }
        } // if (!uploadSucceeded && !isUrl) 닫기 - 로컬 파일 처리

        // 버튼 클릭 방식이 실패한 경우에만 기존 로직 실행 (로컬 파일인 경우에만)
        if (!uploadSucceeded && !isUrl) {
          // 네이버 이미지 라이브러리 패널이 열려있으면 즉시 닫기 (여러 번 시도)
          for (let attempt = 0; attempt < 3; attempt++) {
            const libraryPanel = await frame.$('.se-image-library, .se-image-selector, [class*="image-library"], [class*="image-selector"], [class*="인기"], [id*="image"], [id*="library"], [class*="se-image-panel"], [class*="se-image-popup"]').catch(() => null);
            if (libraryPanel) {
              const closeButton = await libraryPanel.$('button[aria-label*="닫기"], button[aria-label*="close"], .close-button, [class*="close"], button:has-text("X"), button:has-text("×"), [aria-label*="닫기"]').catch(() => null);
              if (closeButton) {
                await closeButton.click();
                await this.delay(this.DELAYS.MEDIUM);
                this.log(`   ✅ 네이버 이미지 라이브러리 패널 닫기 완료 (시도 ${attempt + 1})`);
              } else {
                // X 버튼을 찾지 못하면 ESC 키로 닫기 시도
                await page.keyboard.press('Escape');
                await this.delay(this.DELAYS.MEDIUM);
                this.log(`   ✅ ESC 키로 네이버 이미지 라이브러리 패널 닫기 시도 (시도 ${attempt + 1})`);
              }
            } else {
              break; // 패널이 없으면 종료
            }
          }

          // 네이버 이미지 업로드 버튼 클릭 방지 (절대 클릭하지 않음)
          // 버튼 클릭 없이 바로 파일 input 찾기 (네이버 이미지 라이브러리 패널이 열리지 않도록)
          this.log('   🔄 앱에서 생성한 이미지를 직접 업로드합니다 (네이버 이미지 라이브러리 사용 안 함)...');

          // 방법 1: 페이지와 프레임에서 파일 input 찾기 (가장 안정적)
          // 네이버 이미지 라이브러리와 관련 없는 파일 input만 찾기
          this.log('   🔍 파일 input을 찾는 중... (네이버 라이브러리 버튼은 절대 클릭하지 않음)');

          const pageFileInputs = await page.$$('input[type="file"]').catch(() => []);
          const frameFileInputs = await frame.$$('input[type="file"]').catch(() => []);
          const allFileInputs = [...pageFileInputs, ...frameFileInputs];

          if (allFileInputs.length > 0) {
            this.log(`   ✅ 파일 input ${allFileInputs.length}개 발견`);
            for (const input of allFileInputs) {
              try {
                // 네이버 이미지 라이브러리 패널 내부의 input이 아닌지 확인
                const isInLibraryPanel = await input.evaluate((el: Element) => {
                  let current = el.parentElement;
                  while (current) {
                    const className = current.className || '';
                    const id = current.id || '';
                    if (className.includes('image-library') ||
                      className.includes('image-selector') ||
                      className.includes('인기') ||
                      id.includes('image') ||
                      id.includes('library')) {
                      return true;
                    }
                    current = current.parentElement;
                  }
                  return false;
                }).catch(() => false);

                if (isInLibraryPanel) {
                  this.log(`   ⚠️ 네이버 이미지 라이브러리 패널 내부의 input은 건너뜁니다.`);
                  continue;
                }

                // input이 보이는지 확인 (보이지 않아도 업로드는 가능)
                const isVisible = await input.isIntersectingViewport().catch(() => true);

                // input을 보이게 만들기 (필요한 경우)
                if (!isVisible) {
                  await input.evaluate((el: Element) => {
                    const inputEl = el as HTMLInputElement;
                    inputEl.style.display = 'block';
                    inputEl.style.visibility = 'visible';
                    inputEl.style.opacity = '1';
                    inputEl.style.position = 'absolute';
                    inputEl.style.left = '0';
                    inputEl.style.top = '0';
                    inputEl.style.width = '1px';
                    inputEl.style.height = '1px';
                  });
                  await this.delay(100);
                }

                // 파일 업로드 전 최종 확인
                const fs = await import('fs/promises');
                const pathModule = await import('path');
                try {
                  // ✅ 파일 경로에서 쿼리 파라미터 제거 (파일명에 &type=a340 같은 파라미터가 포함되지 않도록)
                  let cleanFilePath = image.filePath;
                  if (cleanFilePath.includes('&') || cleanFilePath.includes('?')) {
                    // URL이 아닌 로컬 파일 경로인 경우에도 쿼리 파라미터가 포함될 수 있음
                    const pathParts = cleanFilePath.split(pathModule.sep);
                    const fileName = pathParts[pathParts.length - 1];
                    const cleanFileName = fileName.split('?')[0].split('&')[0].split('#')[0];
                    if (fileName !== cleanFileName) {
                      pathParts[pathParts.length - 1] = cleanFileName;
                      cleanFilePath = pathParts.join(pathModule.sep);
                      this.log(`   🔧 파일명 정리: "${fileName}" → "${cleanFileName}"`);
                    }
                  }

                  await fs.access(cleanFilePath);
                  const stats = await fs.stat(cleanFilePath);
                  this.log(`   📤 앱에서 생성한 이미지 파일 업로드 중...`);
                  this.log(`   📁 파일 경로: ${cleanFilePath}`);
                  this.log(`   📏 파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);

                  // Puppeteer의 uploadFile() 사용 (로컬 파일 경로 필요)
                  await input.uploadFile(cleanFilePath);
                  this.log(`   ✅ 파일 input에 파일 설정 완료`);
                  await this.delay(2000); // 업로드 진행 대기 (시간 증가)

                  // ✅ 파일 전송 오류 다이얼로그 감지 및 처리
                  try {
                    // 오류 다이얼로그가 나타나는지 확인 (3초 대기)
                    const errorDialog = await frame.waitForSelector(
                      'text="파일 전송 오류", text="파일 형식 오류", [class*="error"], [class*="오류"]',
                      { timeout: 3000 }
                    ).catch(() => null);

                    if (errorDialog) {
                      this.log(`   ⚠️ 파일 전송 오류 다이얼로그 감지됨`);

                      // 오류 다이얼로그의 "확인" 버튼 찾기 및 클릭
                      const confirmButtons = await frame.$$('button').catch(() => []);
                      for (const btn of confirmButtons) {
                        const text = await btn.evaluate((el: Element) => el.textContent?.trim() || '').catch(() => '');
                        if (text === '확인' || text === 'OK') {
                          await btn.click();
                          this.log(`   ✅ 오류 다이얼로그 확인 버튼 클릭 완료`);
                          await this.delay(500);
                          break;
                        }
                      }

                      // 오류 발생 시 이 이미지는 건너뛰고 다음 이미지로 진행
                      this.log(`   ⚠️ 파일 형식 오류로 인해 이 이미지를 건너뜁니다: ${image.heading}`);
                      continue;
                    }
                  } catch (error) {
                    // 오류 다이얼로그가 없으면 정상 진행
                  }

                  // 이미지가 DOM에 나타날 때까지 대기
                  try {
                    await frame.waitForSelector('img[src*="postfiles"], img[src*="blogfiles"], img.se-image-resource', {
                      visible: true,
                      timeout: 10000
                    });
                    uploadSucceeded = true;
                    this.log(`   ✅ 이미지가 DOM에 나타남 - 업로드 성공`);
                  } catch {
                    this.log(`   ⚠️ 이미지 DOM 대기 타임아웃 (계속 진행)`);
                    // 타임아웃이어도 업로드는 진행 중일 수 있음
                  }
                } catch (fileError) {
                  this.log(`   ❌ 파일 접근 실패: ${(fileError as Error).message}`);
                  throw fileError;
                }

                // change 이벤트 트리거 (일부 에디터에서 필요)
                await input.evaluate((el: Element) => {
                  const inputEl = el as HTMLInputElement;
                  const event = new Event('change', { bubbles: true });
                  inputEl.dispatchEvent(event);
                });
                await this.delay(this.DELAYS.MEDIUM);

                // 네이버 라이브러리 패널이 다시 열렸는지 확인하고 닫기
                const libraryPanelAfter = await frame.$('.se-image-library, .se-image-selector, [class*="image-library"], [class*="image-selector"], [class*="인기"]').catch(() => null);
                if (libraryPanelAfter) {
                  await page.keyboard.press('Escape');
                  await this.delay(this.DELAYS.MEDIUM);
                  this.log(`   ✅ 업로드 후 열린 네이버 라이브러리 패널 닫기 완료`);
                }

                break;
              } catch (error) {
                this.log(`   ⚠️ 파일 input 업로드 실패: ${(error as Error).message}`);
                // continue to next input
              }
            }
          }

          // 방법 2: 파일 input을 찾지 못한 경우 JavaScript로 생성하여 업로드
          if (!uploadSucceeded) {
            this.log('   🔄 파일 input을 찾지 못해 JavaScript로 생성하여 업로드 시도...');
            this.log('   ⚠️ 네이버 이미지 라이브러리는 절대 사용하지 않습니다.');
            try {
              // 본문 영역 또는 에디터 컨테이너 찾기
              const contentElement = await frame.$('.se-section-text, .se-component, .se-module-text, .se-main-container').catch(() => null);
              if (contentElement) {
                // JavaScript로 파일 input 생성 및 업로드
                const inputHandle = await contentElement.evaluateHandle((el) => {
                  // 기존 파일 input이 있는지 확인 (부모 요소까지 검색)
                  // 단, 네이버 이미지 라이브러리 패널 내부의 input은 제외
                  let existingInput: HTMLInputElement | null = el.querySelector('input[type="file"]') as HTMLInputElement | null;
                  if (existingInput) {
                    // 네이버 라이브러리 패널 내부인지 확인
                    let current = existingInput.parentElement;
                    let isInLibrary = false;
                    while (current) {
                      const className = current.className || '';
                      const id = current.id || '';
                      if (className.includes('image-library') ||
                        className.includes('image-selector') ||
                        className.includes('인기') ||
                        id.includes('image') ||
                        id.includes('library')) {
                        isInLibrary = true;
                        break;
                      }
                      current = current.parentElement;
                    }
                    if (isInLibrary) {
                      existingInput = null; // 라이브러리 내부 input은 사용하지 않음
                    }
                  }

                  if (!existingInput) {
                    // document.body에서도 찾기 (라이브러리 패널 외부만)
                    const allInputs = document.body.querySelectorAll('input[type="file"]');
                    for (const inp of Array.from(allInputs)) {
                      let current = inp.parentElement;
                      let isInLibrary = false;
                      while (current) {
                        const className = current.className || '';
                        const id = current.id || '';
                        if (className.includes('image-library') ||
                          className.includes('image-selector') ||
                          className.includes('인기') ||
                          id.includes('image') ||
                          id.includes('library')) {
                          isInLibrary = true;
                          break;
                        }
                        current = current.parentElement;
                      }
                      if (!isInLibrary) {
                        existingInput = inp as HTMLInputElement;
                        break;
                      }
                    }
                  }

                  if (!existingInput) {
                    // 새로 생성 (네이버 라이브러리와 완전히 분리)
                    existingInput = document.createElement('input');
                    existingInput.type = 'file';
                    existingInput.accept = 'image/*';
                    existingInput.multiple = false;
                    existingInput.style.cssText = 'position: absolute; left: -9999px; opacity: 0; width: 1px; height: 1px; pointer-events: none;';

                    // 에디터 컨테이너에 추가 (네이버 라이브러리 패널 외부)
                    const container = document.querySelector('.se-main-container') || document.body;
                    container.appendChild(existingInput);
                  }

                  return existingInput;
                });

                if (inputHandle) {
                  const input = inputHandle.asElement();
                  if (input && inputHandle instanceof ElementHandle) {
                    // 타입 가드를 사용하여 안전하게 변환
                    const inputElement = inputHandle as ElementHandle<HTMLInputElement>;

                    // 파일 업로드 전 확인
                    const fs = await import('fs/promises');
                    try {
                      await fs.access(image.filePath);
                      const stats = await fs.stat(image.filePath);
                      this.log(`   📤 앱에서 생성한 이미지 파일 업로드 중...`);
                      this.log(`   📁 파일 경로: ${image.filePath}`);
                      this.log(`   📏 파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);

                      // Puppeteer의 uploadFile() 사용 (로컬 파일 경로 필요)
                      await inputElement.uploadFile(image.filePath);
                      this.log(`   ✅ 파일 input에 파일 설정 완료`);
                      await this.delay(2000);

                      // change 이벤트 트리거
                      await inputElement.evaluate((el: Element) => {
                        const inputEl = el as HTMLInputElement;
                        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
                        inputEl.dispatchEvent(changeEvent);

                        // input 이벤트도 트리거 (일부 에디터에서 필요)
                        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
                        inputEl.dispatchEvent(inputEvent);
                      });

                      await this.delay(1000);

                      // 이미지가 DOM에 나타날 때까지 대기
                      try {
                        await frame.waitForSelector('img[src*="postfiles"], img[src*="blogfiles"], img.se-image-resource', {
                          visible: true,
                          timeout: 10000
                        });
                        uploadSucceeded = true;
                        this.log(`   ✅ 이미지가 DOM에 나타남 - 업로드 성공`);
                      } catch {
                        this.log(`   ⚠️ 이미지 DOM 대기 타임아웃 (계속 진행)`);
                      }
                    } catch (fileError) {
                      this.log(`   ❌ 파일 접근 실패: ${(fileError as Error).message}`);
                      throw fileError;
                    }

                    // 네이버 라이브러리 패널이 열렸는지 확인하고 닫기
                    const libraryPanelAfter = await frame.$('.se-image-library, .se-image-selector, [class*="image-library"], [class*="image-selector"], [class*="인기"]').catch(() => null);
                    if (libraryPanelAfter) {
                      await page.keyboard.press('Escape');
                      await this.delay(this.DELAYS.MEDIUM);
                      this.log(`   ✅ 업로드 후 열린 네이버 라이브러리 패널 닫기 완료`);
                    }
                  }
                }
              }
            } catch (jsError) {
              this.log(`   ⚠️ JavaScript 파일 input 생성 실패: ${(jsError as Error).message}`);
            }
          }

          // 여전히 실패한 경우 드래그 앤 드롭 시도 (로컬 파일인 경우에만)
          if (!uploadSucceeded && !isUrl) {
            this.log('   🔄 드래그 앤 드롭으로 이미지 삽입 시도...');
            try {
              const contentElement = await frame.$('.se-section-text, .se-component, .se-text-paragraph').catch(() => null);
              if (contentElement) {
                // 파일을 읽어서 DataTransfer로 드래그 앤 드롭 시뮬레이션
                const fs = await import('fs/promises');
                const fileBuffer = await fs.readFile(image.filePath);
                // URL에서 파일명 추출 (쿼리 파라미터 제거)
                const urlWithoutQuery = image.filePath.split('?')[0].split('#')[0];
                const fileName = urlWithoutQuery.split(/[/\\]/).pop() || 'image.png';

                // 파일 타입 결정
                const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
                // 유효한 확장자만 허용
                const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'png';
                const mimeType = validExt === 'jpg' || validExt === 'jpeg' ? 'image/jpeg' :
                  validExt === 'gif' ? 'image/gif' :
                    validExt === 'webp' ? 'image/webp' : 'image/png';

                this.log(`   📁 파일: ${fileName} (${mimeType}, ${(fileBuffer.length / 1024).toFixed(2)} KB)`);

                await contentElement.evaluate((el, buffer, name, mime) => {
                  const file = new File([new Uint8Array(buffer)], name, { type: mime });
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(file);

                  // dragenter 이벤트
                  const dragEnterEvent = new DragEvent('dragenter', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: dataTransfer,
                  });
                  el.dispatchEvent(dragEnterEvent);

                  // dragover 이벤트
                  const dragOverEvent = new DragEvent('dragover', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: dataTransfer,
                  });
                  el.dispatchEvent(dragOverEvent);

                  // drop 이벤트
                  const dropEvent = new DragEvent('drop', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: dataTransfer,
                  });
                  el.dispatchEvent(dropEvent);
                }, Array.from(fileBuffer), fileName, mimeType);

                await this.delay(1000); // 드래그 앤 드롭 처리 대기 시간 증가
                this.log(`   ✅ 드래그 앤 드롭 이벤트 발생 완료 (DOM 확인 필요)`);
                // uploadSucceeded = true;  // DOM에서 확인 후에만 true로 설정
              } else {
                this.log(`   ⚠️ 드래그 앤 드롭 대상 요소를 찾을 수 없습니다`);
              }
            } catch (dropError) {
              this.log(`   ⚠️ 드래그 앤 드롭 실패: ${(dropError as Error).message}`);
            }
          }

          // 업로드 성공 여부와 관계없이 DOM에서 이미지 확인
          if (!uploadSucceeded) {
            this.log(`   ⏳ 네이버 서버 이미지 처리 대기 중... (최대 15초)`);

            // 최대 15초 동안 이미지가 나타날 때까지 대기
            let imageFound = false;
            for (let waitAttempt = 0; waitAttempt < 15; waitAttempt++) {
              await this.delay(1000);

              const uploadedImages = await frame.$$('img.se-image-resource, .se-module-image img, img[src*="naver"], img[src*="postfiles"], img[src*="blogfiles"], img[src*="blob:"]').catch(() => []);

              // UI 이미지 제외 (실제 콘텐츠 이미지만)
              const contentImages = await frame.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll('img'));
                return imgs.filter(img => {
                  const src = img.getAttribute('src') || '';
                  return (src.includes('postfiles') || src.includes('blogfiles') || src.includes('blob:')) &&
                    !src.includes('static.blog.naver.net') &&
                    !src.includes('icon') &&
                    !src.includes('btn');
                });
              }).catch(() => []);

              if (contentImages.length > 0) {
                uploadSucceeded = true;
                imageFound = true;
                this.log(`   ✅ 이미지가 DOM에 나타남 (${waitAttempt + 1}초 후, ${contentImages.length}개 발견)`);
                break;
              }
            }

            if (!imageFound) {
              this.log(`   ⚠️ 15초 대기 후에도 이미지가 DOM에 나타나지 않았습니다.`);
            }
          }

          // 최종 확인
          const allImages = await frame.$$('img').catch(() => []);
          const contentImages = await frame.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            return imgs.filter(img => {
              const src = img.getAttribute('src') || '';
              return (src.includes('postfiles') || src.includes('blogfiles') || src.includes('blob:')) &&
                !src.includes('static.blog.naver.net') &&
                !src.includes('icon') &&
                !src.includes('btn');
            });
          }).catch(() => []);

          this.log(`   🔍 DOM 확인: 전체 이미지 ${allImages.length}개, 콘텐츠 이미지 ${contentImages.length}개`);

          if (uploadSucceeded || contentImages.length > 0) {
            this.log(`   ✅ 이미지 업로드 성공 확인`);
          } else {
            // 보안: 파일 경로 마스킹
            const maskedPath = image.filePath.replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~');
            this.log(`   ⚠️ 이미지 업로드 실패 가능성: ${maskedPath}`);
            this.log(`   💡 네이버 블로그 에디터의 UI가 변경되었을 수 있습니다.`);
            this.log(`   💡 브라우저에서 수동으로 확인해주세요.`);
          }
        } // if (!uploadSucceeded) 닫기

        // ✅ alt 태그에 출처 정보 자동 추가
        const altWithSource = this.generateAltWithSource(image);
        if (altWithSource) {
          await frame
            .evaluate((altText) => {
              const editor = document.querySelector('.se-main-container');
              if (!editor) return;
              const imgs = editor.querySelectorAll('img');
              const target = imgs[imgs.length - 1] as HTMLImageElement | undefined;
              if (target) {
                target.alt = altText;
              }
            }, altWithSource)
            .catch(() => undefined);
        }

        if (plan?.caption) {
          await this.applyCaption(plan.caption).catch(() => undefined);
        }

        this.log(`✅ 이미지 업로드 성공 (${image.filePath})`);
      } catch (error) {
        this.log(`⚠️ 이미지 삽입 중 오류: ${(error as Error).message}`);
      }
    }
  }

  /**
   * ✅ 이미지 alt 태그에 출처 정보 자동 추가
   * 형식: "소제목 | 출처: Provider명 (URL)"
   */
  private generateAltWithSource(image: any): string {
    const parts: string[] = [];

    // 1. 기본 alt 텍스트 (소제목 또는 heading)
    const baseAlt = image.alt || image.heading || image.title || '';
    if (baseAlt) {
      parts.push(baseAlt);
    }

    // 2. 출처 정보 추가
    const sourceInfo: string[] = [];

    // Provider 정보
    if (image.provider) {
      const providerNames: { [key: string]: string } = {
        'naver': '네이버',
        'pexels': 'Pexels',
        'pollinations': '나노 바나나 프로 (Gemini API 키, 과금 가능)',
        'nano-banana-pro': '나노 바나나 프로 (Gemini API 키, 과금 가능)',
        'dalle': 'DALL-E',
        'gemini': 'Gemini',
        'local': '로컬 파일',
        'shopping': '쇼핑몰',
        'blog': '블로그'
      };
      sourceInfo.push(providerNames[image.provider] || image.provider);
    }

    // 원본 URL 또는 출처 URL
    const sourceUrl = image.sourceUrl || image.originalUrl || image.url || '';
    if (sourceUrl && sourceUrl.startsWith('http')) {
      try {
        const url = new URL(sourceUrl);
        // 도메인만 추출 (예: blog.naver.com)
        sourceInfo.push(url.hostname);
      } catch {
        // URL 파싱 실패 시 무시
      }
    }

    // 출처 정보가 있으면 추가
    if (sourceInfo.length > 0) {
      parts.push(`출처: ${sourceInfo.join(' - ')}`);
    }

    return parts.join(' | ');
  }

  private async applyCaption(caption: string): Promise<void> {
    if (!caption) return;
    const frame = (await this.getAttachedFrame());

    const selectors = ['.se-caption-input input', '.se-caption-textarea textarea', '.se-image-caption input'];
    for (const selector of selectors) {
      const input = await frame.$(selector);
      if (input) {
        try {
          await input.click({ clickCount: 3 });
          await input.type(caption, { delay: 25 });
          this.log('📝 이미지 캡션을 입력했습니다.');
          return;
        } catch {
          continue;
        }
      }
    }
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

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      this.log('⏳ 브라우저 종료 중...');

      // ✅ 메모리 최적화: 이벤트 리스너 및 페이지 정리
      if (this.page) {
        this.page.removeAllListeners('request');
        this.page.removeAllListeners('response');
        this.page.removeAllListeners('console');
        this.page.removeAllListeners('error');

        // 페이지 메모리 정리
        try {
          await this.page.evaluate(() => {
            // 전역 변수 정리
            if (window.localStorage) window.localStorage.clear();
            if (window.sessionStorage) window.sessionStorage.clear();
            // DOM 정리
            document.body.innerHTML = '';
          });
        } catch (e) {
          // 페이지가 이미 닫혔을 수 있음
        }
      }

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
        // ✅ 페이지(탭)는 닫고, 브라우저 프로세스만 유지 (다음 발행 시 새 탭 생성)
        if (this.page) {
          try {
            await this.page.close().catch(() => { });
            this.page = null;
            this.mainFrame = null;
            this.log('🔚 페이지가 닫혔습니다. (브라우저 세션은 유지됨)');
          } catch { }
        }
      }
    }
  }

  // ✅ 발행된 URL getter
  getPublishedUrl(): string | null {
    return this.publishedUrl;
  }
}

