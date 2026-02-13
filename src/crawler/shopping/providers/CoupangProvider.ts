/**
 * 쿠팡 전용 크롤러 (Playwright + Stealth - 100점 솔루션)
 * @module crawler/shopping/providers/CoupangProvider
 * 
 * ✅ [2026-02-01] Playwright + Stealth 플러그인 적용
 * ✅ headless: false로 실제 브라우저 사용 (탐지 거의 불가능)
 * ✅ 쿠팡 메인 페이지 먼저 방문 → 쿠키 생성
 * ✅ 인간 행동 모방 (마우스, 스크롤)
 * ✅ CDP 레벨 navigator/plugins 조작
 */

import { BaseProvider } from './BaseProvider.js';
import {
    CollectionResult,
    CollectionStrategy,
    CollectionOptions,
    ProductImage,
    ProductInfo,
    ERROR_PAGE_INDICATORS,
} from '../types.js';

// ✅ Playwright + Stealth 조합
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

// Stealth 플러그인 적용
chromium.use(stealth());

// User-Agent 목록
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

/**
 * 쿠팡 이미지 선택자
 */
const COUPANG_SELECTORS = {
    mainImage: [
        '.prod-image__detail img',
        '#productImage img',
        '.prod-image img',
        '.prod-image__item img',
        'img[alt*="상품"]',
    ],
    galleryImages: [
        '.prod-image__items img',
        '.prod-image__list img',
        '.other-images img',
        '.prod-image__thumb img',
    ],
    detailImages: [
        '.product-detail-content-inside img',
        '.product-detail img',
        '#productDescriptionContent img',
    ],
    productName: [
        '.prod-buy-header__title',
        'h2.prod-buy-header__title',
        '.prod-buy-header h2',
    ],
    price: [
        '.total-price strong',
        '.prod-price .total-price',
        '.prod-coupon-price .total-price',
    ],
};

/**
 * 쿠팡 광고/프로모션 이미지 패턴 (제외 대상)
 */
const COUPANG_AD_PATTERNS = [
    /\/np\//i,
    /\/marketing\//i,
    /\/event\//i,
    /\/banner\//i,
    /coupang-logo/i,
    /rocket-/i,
    /rocketwow/i,
    /badge/i,
    /icon/i,
    /seller-logo/i,
    /\/static\//i,
    /\/assets\//i,
    /thumbnail.*small/i,
    /100x100/i,
    /50x50/i,
    /loading/i,
    /placeholder/i,
];

/**
 * 랜덤 딜레이
 */
function randomDelay(min = 1000, max = 3000): number {
    return min + Math.random() * (max - min);
}

/**
 * 랜덤 User-Agent
 */
function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export class CoupangProvider extends BaseProvider {
    readonly name = 'CoupangProvider';
    readonly platform = 'coupang' as const;
    readonly urlPatterns = [
        /coupang\.com/i,
        /coupa\.ng/i,
        /link\.coupang\.com/i,
    ];

    readonly strategies: CollectionStrategy[] = [
        {
            name: 'playwright-stealth',
            priority: 1,
            execute: (url, options) => this.playwrightStealthStrategy(url, options),
        },
        {
            name: 'mobile-api',
            priority: 2,
            execute: (url, options) => this.mobileApiStrategy(url, options),
        },
        {
            name: 'og-meta-fallback',
            priority: 3,
            execute: (url, options) => this.ogMetaStrategy(url, options),
        },
    ];

    /**
     * ✅ 100점 솔루션: Playwright + Stealth
     */
    private async playwrightStealthStrategy(url: string, options?: CollectionOptions): Promise<CollectionResult> {
        const startTime = Date.now();
        let browser: any = null;

        try {
            console.log(`[Coupang:Playwright] 🕵️ Stealth 모드 크롤링 시작...`);

            // ✅ [2026-02-08 FIX] 배포환경 Chromium 경로 설정 (필수!)
            const { getChromiumExecutablePath } = await import('../../../browserUtils.js');
            const executablePath = await getChromiumExecutablePath();
            console.log(`[Coupang:Playwright] 🔧 브라우저 경로: ${executablePath || 'Playwright 기본값'}`);

            browser = await chromium.launch({
                headless: false, // ⭐ CRITICAL: true면 100% 탐지됨
                ...(executablePath ? { executablePath } : {}), // ✅ [2026-02-08 FIX] 배포환경 지원
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-site-isolation-trials',
                    '--window-size=1920,1080',
                    '--start-maximized',
                ],
            });

            const context = await browser.newContext({
                viewport: { width: 1920, height: 1080 },
                userAgent: getRandomUserAgent(),
                locale: 'ko-KR',
                timezoneId: 'Asia/Seoul',
                permissions: ['geolocation'],
                geolocation: { latitude: 37.5665, longitude: 126.9780 }, // 서울
                colorScheme: 'light',
                extraHTTPHeaders: {
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                },
            });

            const page = await context.newPage();

            // ⭐ CDP 레벨 속성 조작 (핵심!)
            await page.addInitScript(() => {
                // webdriver 완전 제거
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });

                // Chrome 객체 추가
                (window as any).chrome = {
                    runtime: {},
                    loadTimes: function () { },
                    csi: function () { },
                    app: {},
                };

                // Plugin 배열 조작
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [
                        { name: 'Chrome PDF Plugin' },
                        { name: 'Chrome PDF Viewer' },
                        { name: 'Native Client' },
                    ],
                });

                // Permissions API 오버라이드
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters: any) => {
                    if (parameters.name === 'notifications') {
                        return Promise.resolve({ state: 'prompt' } as PermissionStatus);
                    }
                    return originalQuery(parameters);
                };

                // Canvas fingerprinting 방지
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function (parameter) {
                    if (parameter === 37445) {
                        return 'Intel Inc.';
                    }
                    if (parameter === 37446) {
                        return 'Intel Iris OpenGL Engine';
                    }
                    return getParameter.call(this, parameter);
                };
            });

            // 🔄 1단계: 쿠팡 메인 페이지 먼저 방문 (쿠키 생성)
            console.log(`[Coupang:Playwright] 🏠 메인 페이지 방문 중...`);
            await page.goto('https://www.coupang.com', {
                waitUntil: 'networkidle',
                timeout: 30000,
            });

            // 인간처럼 행동
            await page.mouse.move(500, 300);
            await page.waitForTimeout(randomDelay(1500, 2500));
            await page.mouse.wheel(0, 300);
            await page.waitForTimeout(randomDelay(800, 1500));

            // 🎯 2단계: 상품 페이지 접근
            console.log(`[Coupang:Playwright] 🎯 상품 페이지 이동...`);
            await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: 30000,
            });

            // 페이지 로드 대기
            await page.waitForTimeout(randomDelay(2000, 3500));

            // Access Denied 체크
            const content = await page.content();
            const errorIndicator = ERROR_PAGE_INDICATORS.find(indicator =>
                content.includes(indicator)
            );

            if (errorIndicator || content.includes('Access Denied') || content.includes('차단')) {
                console.error(`[Coupang:Playwright] ❌ Access Denied 발생!`);
                await browser.close();
                return {
                    success: false,
                    images: [],
                    usedStrategy: 'playwright-stealth',
                    timing: Date.now() - startTime,
                    error: 'Access Denied',
                    isErrorPage: true,
                };
            }

            console.log(`[Coupang:Playwright] ✅ 페이지 접근 성공!`);

            // 이미지 수집
            const images = await this.extractImagesFromPlaywright(page);
            const productInfo = await this.extractProductInfoFromPlaywright(page);

            await browser.close();

            console.log(`[Coupang:Playwright] 📸 ${images.length}개 이미지 수집 완료`);

            return {
                success: images.length > 0,
                images,
                productInfo,
                usedStrategy: 'playwright-stealth',
                timing: Date.now() - startTime,
            };

        } catch (error) {
            console.error(`[Coupang:Playwright] ❌ 오류:`, (error as Error).message);
            if (browser) await browser.close();
            return {
                success: false,
                images: [],
                usedStrategy: 'playwright-stealth',
                timing: Date.now() - startTime,
                error: (error as Error).message,
            };
        }
    }

    /**
     * Playwright 페이지에서 이미지 추출
     */
    private async extractImagesFromPlaywright(page: any): Promise<ProductImage[]> {
        const images: ProductImage[] = [];
        const seenUrls = new Set<string>();

        // 모든 이미지 수집
        const allImgs = await page.$$eval('img', (imgs: HTMLImageElement[]) =>
            imgs.map((img) => ({
                src: img.src || img.dataset.src || '',
                alt: img.alt || '',
            }))
        );

        for (const img of allImgs) {
            if (img.src && !seenUrls.has(img.src) && this.isValidCoupangImage(img.src)) {
                seenUrls.add(img.src);

                // 이미지 타입 추론
                let type: 'main' | 'gallery' | 'detail' = 'gallery';
                if (images.length === 0) type = 'main';
                else if (img.src.includes('detail') || img.src.includes('상세')) type = 'detail';

                images.push({
                    url: this.enhanceImageUrl(img.src),
                    type,
                    alt: img.alt,
                });

                if (images.length >= 20) break;
            }
        }

        return images;
    }

    /**
     * Playwright 페이지에서 제품 정보 추출
     */
    private async extractProductInfoFromPlaywright(page: any): Promise<ProductInfo | undefined> {
        try {
            let name = '';
            let price = '';

            for (const selector of COUPANG_SELECTORS.productName) {
                try {
                    const el = await page.$(selector);
                    if (el) {
                        name = await el.textContent() || '';
                        if (name.trim()) break;
                    }
                } catch { /* 무시 */ }
            }

            for (const selector of COUPANG_SELECTORS.price) {
                try {
                    const el = await page.$(selector);
                    if (el) {
                        price = await el.textContent() || '';
                        if (price.trim()) break;
                    }
                } catch { /* 무시 */ }
            }

            if (name || price) {
                return { name: name.trim(), price: price.trim() };
            }
        } catch { /* 무시 */ }

        return undefined;
    }

    /**
     * 모바일 API 폴백
     */
    private async mobileApiStrategy(url: string, options?: CollectionOptions): Promise<CollectionResult> {
        const startTime = Date.now();

        try {
            console.log(`[Coupang:Mobile] � 모바일 API 폴백 시도...`);

            const mobileUrl = url.replace('www.coupang.com', 'm.coupang.com');
            const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

            await new Promise(r => setTimeout(r, randomDelay(500, 1000)));

            const response = await fetch(mobileUrl, {
                headers: {
                    'User-Agent': MOBILE_UA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                },
                redirect: 'follow',
            });

            const html = await response.text();

            if (html.includes('Access Denied') || html.includes('차단')) {
                return {
                    success: false,
                    images: [],
                    usedStrategy: 'mobile-api',
                    timing: Date.now() - startTime,
                    error: 'Access Denied',
                    isErrorPage: true,
                };
            }

            const images: ProductImage[] = [];
            const seenUrls = new Set<string>();

            // OG 이미지 추출
            const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
            if (ogImageMatch?.[1] && this.isValidCoupangImage(ogImageMatch[1])) {
                images.push({ url: ogImageMatch[1], type: 'main' });
                seenUrls.add(ogImageMatch[1]);
            }

            // 모든 이미지 추출
            const imgMatches = html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi);
            for (const match of imgMatches) {
                const imgUrl = match[1];
                if (imgUrl && !seenUrls.has(imgUrl) && this.isValidCoupangImage(imgUrl)) {
                    seenUrls.add(imgUrl);
                    images.push({
                        url: this.enhanceImageUrl(imgUrl),
                        type: 'gallery',
                    });
                    if (images.length >= 15) break;
                }
            }

            const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
            const productInfo: ProductInfo | undefined = ogTitleMatch?.[1]
                ? { name: ogTitleMatch[1] }
                : undefined;

            console.log(`[Coupang:Mobile] ✅ ${images.length}개 이미지 수집`);

            return {
                success: images.length > 0,
                images,
                productInfo,
                usedStrategy: 'mobile-api',
                timing: Date.now() - startTime,
            };

        } catch (error) {
            console.error(`[Coupang:Mobile] ❌ 오류:`, (error as Error).message);
            return {
                success: false,
                images: [],
                usedStrategy: 'mobile-api',
                timing: Date.now() - startTime,
                error: (error as Error).message,
            };
        }
    }

    /**
     * OG 메타 태그 폴백
     */
    private async ogMetaStrategy(url: string, options?: CollectionOptions): Promise<CollectionResult> {
        const startTime = Date.now();

        try {
            console.log(`[Coupang:OGMeta] 📋 OG 태그 추출 중...`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                redirect: 'follow',
            });

            const html = await response.text();

            if (html.includes('Access Denied') || html.includes('차단')) {
                return {
                    success: false,
                    images: [],
                    usedStrategy: 'og-meta-fallback',
                    timing: Date.now() - startTime,
                    error: 'Access Denied',
                    isErrorPage: true,
                };
            }

            const images: ProductImage[] = [];

            const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
            if (ogImageMatch?.[1] && this.isValidCoupangImage(ogImageMatch[1])) {
                images.push({ url: ogImageMatch[1], type: 'main' });
            }

            const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
            const productInfo: ProductInfo | undefined = ogTitleMatch?.[1]
                ? { name: ogTitleMatch[1] }
                : undefined;

            console.log(`[Coupang:OGMeta] ✅ ${images.length}개 이미지 수집`);

            return {
                success: images.length > 0,
                images,
                productInfo,
                usedStrategy: 'og-meta-fallback',
                timing: Date.now() - startTime,
            };

        } catch (error) {
            console.error(`[Coupang:OGMeta] ❌ 오류:`, (error as Error).message);
            return {
                success: false,
                images: [],
                usedStrategy: 'og-meta-fallback',
                timing: Date.now() - startTime,
                error: (error as Error).message,
            };
        }
    }

    /**
     * 쿠팡 이미지 유효성 검사
     */
    private isValidCoupangImage(url: string): boolean {
        if (!url) return false;
        if (url.startsWith('data:')) return false;

        for (const pattern of COUPANG_AD_PATTERNS) {
            if (pattern.test(url)) {
                return false;
            }
        }

        const validDomains = ['thumbnail', 'image', 'img', 'cdn', 'static.coupangcdn.com'];
        const hasValidDomain = validDomains.some(domain => url.includes(domain));
        const hasValidExtension = /\.(jpg|jpeg|png|webp|gif)/i.test(url);

        return hasValidDomain && hasValidExtension;
    }

    /**
     * 쿠팡 이미지 URL 최적화
     */
    private enhanceImageUrl(url: string): string {
        return url
            .replace(/\/thumbnails\//, '/product/')
            .replace(/_[0-9]+x[0-9]+\./, '.')
            .replace(/\/remote\/.*?\//, '/');
    }
}
