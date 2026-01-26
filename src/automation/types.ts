/**
 * 자동화 관련 공유 타입 정의
 */

import type { Browser, Page, Frame, ElementHandle } from 'puppeteer';

/**
 * 자동화 옵션
 */
export interface AutomationOptions {
    naverId: string;
    naverPassword: string;
    loginUrl?: string;
    blogWriteUrl?: string;
    headless?: boolean;
    slowMo?: number;
    viewport?: { width: number; height: number };
    navigationTimeoutMs?: number;
    defaultTitle?: string;
    defaultContent?: string;
    defaultLines?: number;
    categoryName?: string;
}

/**
 * 발행 모드 타입
 */
export type PublishMode = 'publish' | 'schedule' | 'draft';

/**
 * 자동화 이미지 타입
 */
export interface AutomationImage {
    heading: string;
    filePath: string;
    provider: string;
    alt?: string;
    caption?: string;
    savedToLocal?: string | boolean;
}

/**
 * 실행 옵션
 */
export interface RunOptions {
    title?: string;
    content?: string;
    lines?: number;
    selectedHeadings?: string[];
    structuredContent?: any;
    hashtags?: string[];
    images?: AutomationImage[];
    publishMode?: PublishMode;
    categoryName?: string;
    keepBrowserOpen?: boolean;
    scheduleDate?: string;
    scheduleMethod?: 'datetime-local' | 'individual-inputs';
    useLegacyDateInput?: boolean;
    useDirectNaverImageSearch?: boolean;
    toneStyle?: string;
    ctaLink?: string;
    ctaText?: string;
    ctaPosition?: 'top' | 'middle' | 'bottom';
    useIntelligentImagePlacement?: boolean;
    onlyImagePlacement?: boolean;
    affiliateLink?: string;
    useAffiliateVideo?: boolean;
    contentMode?: string;
    useAiImage?: boolean;
    createProductThumbnail?: boolean;
    includeThumbnailText?: boolean;
    isFullAuto?: boolean;
    /** 소제목 이미지 생성 모드: 'all' | 'thumbnail-only' | 'odd-only' | 'even-only' | 'none' */
    headingImageMode?: 'all' | 'thumbnail-only' | 'odd-only' | 'even-only' | 'none';
}

/**
 * 해결된 실행 옵션 (기본값 적용됨)
 */
export interface ResolvedRunOptions extends Omit<RunOptions, 'title' | 'content' | 'lines' | 'selectedHeadings' | 'hashtags' | 'images' | 'publishMode' | 'keepBrowserOpen'> {
    title: string;
    content: string;
    lines: number;
    selectedHeadings: string[];
    hashtags: string[];
    images: AutomationImage[];
    publishMode: PublishMode;
    keepBrowserOpen: boolean;
    includeThumbnailText: boolean;
}

/**
 * 자동화 컨텍스트 (핸들러에서 사용)
 */
export interface AutomationContext {
    browser: Browser | null;
    page: Page | null;
    mainFrame: Frame | null;
    options: AutomationOptions;
    log: (message: string) => void;
    delay: (ms: number) => Promise<void>;
    ensureNotCancelled: () => void;
    ensurePage: () => Page;
    getAttachedFrame: () => Promise<Frame>;
}

/**
 * 딜레이 상수
 */
export const DELAYS = {
    SHORT: 50,
    MEDIUM: 150,
    LONG: 250,
    IMAGE_UPLOAD: 500,
    NAVIGATION: 1000,
} as const;

/**
 * 셀렉터 상수
 */
export const SELECTORS = {
    PUBLISH_BUTTON: [
        'button.publish_btn__m9KHH[data-click-area="tpb.publish"]',
        'button.publish_btn__m9KHH',
        'button[data-click-area="tpb.publish"]',
    ],
    CONFIRM_PUBLISH: [
        'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"]',
        'button[data-testid="seOnePublishBtn"]',
        'button.confirm_btn__WEaBq',
    ],
    LOGIN_BUTTON: [
        '#log\\.login',
        'button[type="submit"].btn_login',
        'button.btn_login',
        'button[type="submit"]',
    ],
    IMAGE_BUTTON: [
        'button[data-name="image"]',
        'button.se-image-toolbar-button',
        'button[data-command="image"]',
        'button[aria-label*="이미지"]',
        'button[title*="이미지"]',
    ],
} as const;
