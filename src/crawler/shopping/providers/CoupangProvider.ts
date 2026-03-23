/**
 * 쿠팡 전용 크롤러 (The Absolute Human Engine)
 * @module crawler/shopping/providers/CoupangProvider
 * 
 * ✅ [2026-02-01] Playwright + Stealth 플러그인 적용
 * ✅ [2026-03-11] 'The Absolute Human' 엔진 통합
 *    - ghost-cursor 기반 인간 마우스 행동 모방
 *    - 포털 경유 Warm-up (Google/Naver → 쿠팡 검색 → 상품 페이지)
 *    - Distraction Logic (15% 확률 무의미 행동)
 *    - 쿠키 세션 유지 및 TLS 핑거프린트 일관성
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

// ✅ User-Agent 목록 (최신 Chrome 버전 반영)
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
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
    // ✅ [2026-03-13] 추가 패턴: 광고/추천/쿠폰/프로모션 이미지 제거
    /\/ad\//i,
    /promotion/i,
    /coupon/i,
    /\/recommend\//i,
    /\/widget\//i,
    /sprite/i,
    /logo/i,
    /payment/i,
    /delivery/i,
    /guarantee/i,
    /\/common\//i,
    /\/category\//i,
    /seller.*profile/i,
    /\/brand-shop\//i,
    /rating.*star/i,
    /empty.*image/i,
    /no.*image/i,
    /blank/i,
];

// ============================================================
// 🧠 The Absolute Human Engine - 유틸리티 함수들
// ============================================================

/** 가우스 분포 난수 (Box-Muller 변환) */
function gaussianRandom(mean: number, stdev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return Math.max(0, z0 * stdev + mean);
}

/** 랜덤 딜레이 (가우스 분포) */
function randomDelay(min = 1000, max = 3000): number {
    const mean = (min + max) / 2;
    const stdev = (max - min) / 4;
    return Math.max(min, Math.min(max, gaussianRandom(mean, stdev)));
}

/** 랜덤 User-Agent */
function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * ✅ ghost-cursor 스타일 인간 마우스 이동
 * Bézier 곡선 + 미세 떨림(jitter) + 오버슈팅(overshoot)
 */
async function humanMouseMove(page: any, targetX: number, targetY: number): Promise<void> {
    const mouse = page.mouse;
    
    // 현재 위치에서 목표까지의 경로를 여러 단계로 분할
    const steps = 8 + Math.floor(Math.random() * 6); // 8~13 단계
    const startX = 100 + Math.random() * 800;
    const startY = 100 + Math.random() * 400;
    
    // ✅ 오버슈팅: 목표를 약간 지나쳤다 돌아오기 (30% 확률)
    const overshoot = Math.random() < 0.3;
    const overshootX = overshoot ? targetX + (Math.random() - 0.5) * 40 : targetX;
    const overshootY = overshoot ? targetY + (Math.random() - 0.5) * 30 : targetY;
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Bézier 곡선 보간
        const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        
        let x = startX + (overshootX - startX) * easeT;
        let y = startY + (overshootY - startY) * easeT;
        
        // ✅ 미세 떨림 (jitter) - 인간 손떨림 모방
        x += (Math.random() - 0.5) * 3;
        y += (Math.random() - 0.5) * 2;
        
        await mouse.move(Math.round(x), Math.round(y));
        await page.waitForTimeout(10 + Math.random() * 25);
    }
    
    // 오버슈팅했으면 원래 목표로 돌아오기
    if (overshoot) {
        await page.waitForTimeout(50 + Math.random() * 100);
        await mouse.move(Math.round(targetX), Math.round(targetY));
    }
}

/**
 * ✅ Bounding Box 랜덤 좌표 클릭 (정중앙 아닌 가우스 분포)
 */
async function humanClick(page: any, selector: string): Promise<boolean> {
    try {
        const el = await page.$(selector);
        if (!el) return false;
        
        const box = await el.boundingBox();
        if (!box) return false;
        
        // 가우스 분포로 클릭 좌표 결정 (중앙 근처에 높은 확률)
        const clickX = gaussianRandom(box.x + box.width / 2, box.width / 6);
        const clickY = gaussianRandom(box.y + box.height / 2, box.height / 6);
        
        // 클릭 범위 보정
        const safeX = Math.max(box.x + 2, Math.min(box.x + box.width - 2, clickX));
        const safeY = Math.max(box.y + 2, Math.min(box.y + box.height - 2, clickY));
        
        await humanMouseMove(page, safeX, safeY);
        await page.waitForTimeout(50 + Math.random() * 100);
        await page.mouse.click(safeX, safeY);
        
        return true;
    } catch {
        return false;
    }
}

/**
 * ✅ Distraction Logic: 15% 확률로 무의미한 인간 행동 수행
 */
async function performDistraction(page: any): Promise<void> {
    if (Math.random() > 0.15) return; // 85%는 그냥 통과
    
    const actions = [
        // 1. 무의미한 스크롤
        async () => {
            const scrollY = 100 + Math.random() * 300;
            await page.mouse.wheel(0, scrollY);
            await page.waitForTimeout(randomDelay(300, 700));
            await page.mouse.wheel(0, -scrollY * 0.7); // 살짝 올라오기
            console.log(`[Distraction] 📜 무작위 스크롤 수행`);
        },
        // 2. 텍스트 드래그 (선택 후 해제)
        async () => {
            const x = 200 + Math.random() * 600;
            const y = 200 + Math.random() * 300;
            await humanMouseMove(page, x, y);
            await page.mouse.down();
            await humanMouseMove(page, x + 80 + Math.random() * 100, y + 5);
            await page.mouse.up();
            await page.waitForTimeout(randomDelay(200, 500));
            // 선택 해제
            await page.mouse.click(x - 50, y - 50);
            console.log(`[Distraction] 📝 텍스트 드래그 수행`);
        },
        // 3. 마우스를 페이지 구석으로 이동
        async () => {
            const corners = [
                { x: 50, y: 50 },
                { x: 1800, y: 50 },
                { x: 50, y: 900 },
                { x: 1800, y: 900 },
            ];
            const corner = corners[Math.floor(Math.random() * corners.length)];
            await humanMouseMove(page, corner.x, corner.y);
            await page.waitForTimeout(randomDelay(300, 800));
            console.log(`[Distraction] 🖱️ 구석 이동 수행`);
        },
    ];
    
    const action = actions[Math.floor(Math.random() * actions.length)];
    await action();
}

/**
 * ✅ 인간 스크롤 (가변 속도 + 일시 정지)
 */
async function humanScroll(page: any, totalDistance: number): Promise<void> {
    let scrolled = 0;
    while (scrolled < totalDistance) {
        const chunk = 80 + Math.random() * 200;
        await page.mouse.wheel(0, chunk);
        scrolled += chunk;
        
        // 가변 속도 대기
        await page.waitForTimeout(50 + Math.random() * 150);
        
        // 5% 확률로 잠시 멈춤 (글 읽는 척)
        if (Math.random() < 0.05) {
            await page.waitForTimeout(randomDelay(800, 2000));
        }
    }
}

// ============================================================
// 쿠팡 프로바이더 클래스
// ============================================================

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
            name: 'absolute-human',
            priority: 1,
            execute: (url, options) => this.absoluteHumanStrategy(url, options),
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
     * ✅ The Absolute Human Engine: 포털 경유 + ghost-cursor + Distraction
     */
    private async absoluteHumanStrategy(url: string, options?: CollectionOptions): Promise<CollectionResult> {
        const startTime = Date.now();
        let browser: any = null;

        try {
            console.log(`[Coupang:AbsoluteHuman] 🕵️ The Absolute Human 엔진 시작...`);

            // ✅ 배포환경 Chromium 경로 설정
            const { getChromiumExecutablePath } = await import('../../../browserUtils.js');
            const executablePath = await getChromiumExecutablePath();

            browser = await chromium.launch({
                headless: false, // ⭐ CRITICAL: true면 100% 탐지됨
                ...(executablePath ? { executablePath } : {}),
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
                geolocation: { latitude: 37.5665, longitude: 126.9780 },
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
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                (window as any).chrome = {
                    runtime: {},
                    loadTimes: function () { },
                    csi: function () { },
                    app: {},
                };
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [
                        { name: 'Chrome PDF Plugin' },
                        { name: 'Chrome PDF Viewer' },
                        { name: 'Native Client' },
                    ],
                });
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters: any) => {
                    if (parameters.name === 'notifications') {
                        return Promise.resolve({ state: 'prompt' } as PermissionStatus);
                    }
                    return originalQuery(parameters);
                };
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function (parameter) {
                    if (parameter === 37445) return 'Intel Inc.';
                    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
                    return getParameter.call(this, parameter);
                };
            });

            // ============================================================
            // 🔄 Phase 1: Warm-up Routine (포털 경유로 정상 쿠키 생성)
            // ============================================================
            console.log(`[Coupang:AbsoluteHuman] 🌐 Phase 1: Warm-up 시작...`);

            // URL에서 제품명 추출 시도
            const productKeyword = this.extractProductKeywordFromUrl(url);

            if (productKeyword) {
                // ✅ 네이버에서 제품명 검색 → 쿠팡 링크 경유 방식
                console.log(`[Coupang:AbsoluteHuman] 🔍 네이버에서 "${productKeyword}" 검색 경유...`);
                
                try {
                    await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await page.waitForTimeout(randomDelay(1000, 2000));
                    
                    // 인간처럼 검색창 클릭
                    await humanMouseMove(page, 600, 220);
                    await page.waitForTimeout(randomDelay(300, 600));
                    
                    // 검색어 입력 (인간 타이핑 속도)
                    const searchInput = await page.$('#query') || await page.$('input[name="query"]');
                    if (searchInput) {
                        await searchInput.click();
                        await page.waitForTimeout(randomDelay(200, 500));
                        
                        // 인간 타이핑: 키별 가변 딜레이
                        for (const char of productKeyword) {
                            await page.keyboard.type(char, { delay: gaussianRandom(80, 50) });
                        }
                        await page.waitForTimeout(randomDelay(300, 700));
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(randomDelay(2000, 3500));
                    }
                    
                    // Distraction: 검색 결과 훑어보기
                    await humanScroll(page, 300 + Math.random() * 200);
                    await page.waitForTimeout(randomDelay(800, 1500));
                    
                } catch (warmupError) {
                    console.warn(`[Coupang:AbsoluteHuman] ⚠️ 네이버 Warm-up 실패, 직접 접근...`);
                }
            }

            // ============================================================
            // 🔄 Phase 2: 쿠팡 메인 경유 (쿠키 생성)
            // ============================================================
            console.log(`[Coupang:AbsoluteHuman] 🏠 Phase 2: 쿠팡 메인 페이지 경유...`);
            
            await page.goto('https://www.coupang.com', {
                waitUntil: 'domcontentloaded',
                timeout: 20000,
            });
            await page.waitForTimeout(randomDelay(1500, 3000));
            
            // 인간 행동: 메인 페이지에서 둘러보기
            await humanMouseMove(page, 400 + Math.random() * 400, 200 + Math.random() * 200);
            await page.waitForTimeout(randomDelay(500, 1000));
            await humanScroll(page, 200 + Math.random() * 300);
            await page.waitForTimeout(randomDelay(500, 1000));
            
            // Distraction 수행
            await performDistraction(page);

            // ============================================================
            // 🎯 Phase 3: 상품 페이지 접근
            // ============================================================
            console.log(`[Coupang:AbsoluteHuman] 🎯 Phase 3: 상품 페이지 이동...`);
            
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });
            await page.waitForTimeout(randomDelay(2000, 4000));

            // Distraction 수행
            await performDistraction(page);

            // Access Denied 체크
            const content = await page.content();
            const errorIndicator = ERROR_PAGE_INDICATORS.find(indicator =>
                content.includes(indicator)
            );

            if (errorIndicator || content.includes('Access Denied') || content.includes('차단')) {
                console.error(`[Coupang:AbsoluteHuman] ❌ Access Denied 발생!`);
                return {
                    success: false,
                    images: [],
                    usedStrategy: 'absolute-human',
                    timing: Date.now() - startTime,
                    error: 'Access Denied',
                    isErrorPage: true,
                };
            }

            console.log(`[Coupang:AbsoluteHuman] ✅ 페이지 접근 성공!`);

            // ============================================================
            // 📸 Phase 4: 인간처럼 이미지 수집
            // ============================================================
            
            // 상품 이미지 영역까지 스크롤
            await humanScroll(page, 400 + Math.random() * 300);
            await page.waitForTimeout(randomDelay(500, 1000));

            const images = await this.extractImagesFromPlaywright(page);
            const productInfo = await this.extractProductInfoFromPlaywright(page);

            console.log(`[Coupang:AbsoluteHuman] 📸 ${images.length}개 이미지 수집 완료`);

            return {
                success: images.length > 0,
                images,
                productInfo,
                usedStrategy: 'absolute-human',
                timing: Date.now() - startTime,
            };

        } catch (error) {
            console.error(`[Coupang:AbsoluteHuman] ❌ 오류:`, (error as Error).message);
            return {
                success: false,
                images: [],
                usedStrategy: 'absolute-human',
                timing: Date.now() - startTime,
                error: (error as Error).message,
            };
        } finally {
            // ✅ [2026-03-16] 브라우저 확실히 닫기 — 어떤 경로든 반드시 실행
            if (browser) {
                try {
                    await browser.close().catch(() => undefined);
                    console.log('[Coupang:AbsoluteHuman] 🧹 브라우저 정상 종료');
                } catch (closeErr: any) {
                    console.warn(`[Coupang:AbsoluteHuman] ⚠️ 브라우저 닫기 실패: ${closeErr.message}`);
                    // 프로세스 강제 종료 시도
                    try {
                        const proc = browser.process?.();
                        if (proc) proc.kill('SIGKILL');
                    } catch { /* 무시 */ }
                }
            }
        }
    }

    /**
     * ✅ URL에서 제품 키워드 추출 (Warm-up용)
     */
    private extractProductKeywordFromUrl(url: string): string {
        try {
            const decodedUrl = decodeURIComponent(url);
            
            // itemName 파라미터에서 추출
            const itemNameMatch = decodedUrl.match(/itemName=([^&]+)/i);
            if (itemNameMatch?.[1]) {
                return itemNameMatch[1].replace(/\+/g, ' ').trim().substring(0, 30);
            }
            
            // URL 경로에서 한글 제품명 추출
            const koreanMatch = decodedUrl.match(/\/([가-힣\s]+(?:[가-힣\s]+)*)/);
            if (koreanMatch?.[1] && koreanMatch[1].length > 3) {
                return koreanMatch[1].trim().substring(0, 30);
            }
            
            return '';
        } catch {
            return '';
        }
    }

    /**
     * Playwright 페이지에서 이미지 추출
     * ✅ [2026-03-14] 썸네일 클릭 → 큰 이미지 추출 방식으로 완전 재작성
     * 쿠팡은 왼쪽 갤러리 썸네일을 클릭하면 오른쪽에 고해상도 이미지가 로드됨
     */
    private async extractImagesFromPlaywright(page: any): Promise<ProductImage[]> {
        const images: ProductImage[] = [];
        const seenBaseUrls = new Set<string>();

        const addImage = (url: string, type: 'main' | 'gallery' | 'detail', alt: string = ''): boolean => {
            const enhanced = this.enhanceImageUrl(url);
            const baseUrl = enhanced.split('?')[0].replace(/_\d+x\d+/g, '').replace(/\/\d+x\d+\//g, '/');
            if (seenBaseUrls.has(baseUrl)) return false;
            if (!this.isValidCoupangImage(enhanced)) return false;
            seenBaseUrls.add(baseUrl);
            images.push({ url: enhanced, type, alt });
            return true;
        };

        // ═══════════════════════════════════════════════════
        // Phase A: 갤러리 썸네일 클릭 → 큰 이미지 추출 (핵심!)
        // ═══════════════════════════════════════════════════
        try {
            console.log(`[CoupangProvider] 🖱️ Phase A: 갤러리 썸네일 클릭 → 큰 이미지 추출`);

            // 1. 썸네일 목록 찾기
            const thumbSelectors = [
                '.prod-image__items .prod-image__item',
                '.prod-image__list .prod-image__item',
                '.prod-image__items li',
                '.other-images li',
                '.prod-image__thumb-list li',
            ];

            let thumbElements: any[] = [];
            let usedThumbSel = '';
            for (const sel of thumbSelectors) {
                thumbElements = await page.$$(sel);
                if (thumbElements.length > 1) { usedThumbSel = sel; break; }
            }

            // 2. 메인 이미지 셀렉터 찾기
            const mainImgSelectors = [
                '.prod-image__detail img',
                '.prod-image__item--selected img',
                '.prod-image img',
                '#mainImage',
            ];

            let mainImgSel = '';
            for (const sel of mainImgSelectors) {
                if (await page.$(sel)) { mainImgSel = sel; break; }
            }

            if (mainImgSel && thumbElements.length > 1) {
                console.log(`[CoupangProvider] ✅ 갤러리 발견: ${thumbElements.length}개 썸네일`);

                for (let i = 0; i < thumbElements.length && images.length < 50; i++) {
                    try {
                        await thumbElements[i].click();
                        await page.waitForTimeout(400 + Math.random() * 400);

                        const mainEl = await page.$(mainImgSel);
                        if (mainEl) {
                            const imgUrl = await mainEl.evaluate((img: HTMLImageElement) =>
                                img.getAttribute('data-original')
                                || img.getAttribute('data-img-src')
                                || img.getAttribute('data-lazy-src')
                                || img.getAttribute('data-src')
                                || img.src || ''
                            );
                            if (imgUrl && addImage(imgUrl, i === 0 ? 'main' : 'gallery', `제품 이미지 ${i + 1}`)) {
                                console.log(`[CoupangProvider] 📸 썸네일 ${i + 1} 클릭 → 고해상도 추출 OK`);
                            }
                        }
                    } catch { /* 개별 클릭 실패 무시 */ }
                }

                if (images.length > 0) {
                    console.log(`[CoupangProvider] ✅ Phase A 완료: ${images.length}개 고해상도 이미지`);
                }
            } else {
                console.log(`[CoupangProvider] ℹ️ 갤러리 미발견 → Phase B 폴백`);
            }
        } catch (err) {
            console.warn(`[CoupangProvider] ⚠️ Phase A 실패:`, (err as Error).message);
        }

        // ═══════════════════════════════════════════════════
        // Phase B: 폴백 — 전체 img 태그 스캔
        // ═══════════════════════════════════════════════════
        if (images.length < 3) {
            console.log(`[CoupangProvider] 🔄 Phase B: 전체 img 폴백 (Phase A: ${images.length}개)`);

            const allImgs = await page.$$eval('img', (imgs: HTMLImageElement[]) =>
                imgs.map((img) => ({
                    src: img.getAttribute('data-original')
                        || img.getAttribute('data-img-src')
                        || img.getAttribute('data-lazy-src')
                        || img.getAttribute('data-src')
                        || img.src || '',
                    alt: img.alt || '',
                }))
            );

            for (const img of allImgs) {
                if (!img.src) continue;
                addImage(img.src, images.length === 0 ? 'main' : 'gallery', img.alt);
                if (images.length >= 50) break;
            }
        }

        console.log(`[CoupangProvider] 📸 최종 ${images.length}개 이미지 추출 완료`);
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
            console.log(`[Coupang:Mobile] 📱 모바일 API 폴백 시도...`);

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

            // OG 이미지 추출 (✅ 고해상도 변환 적용)
            const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
            if (ogImageMatch?.[1] && this.isValidCoupangImage(ogImageMatch[1])) {
                const enhancedOg = this.enhanceImageUrl(ogImageMatch[1]);
                images.push({ url: enhancedOg, type: 'main' });
                seenUrls.add(enhancedOg);
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
                    if (images.length >= 50) break;
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
                images.push({ url: this.enhanceImageUrl(ogImageMatch[1]), type: 'main' });
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

        // ✅ [2026-03-13] GIF/SVG 확장자 제외 (아이콘/애니메이션)
        if (/\.(gif|svg)(\?|$)/i.test(url)) return false;

        for (const pattern of COUPANG_AD_PATTERNS) {
            if (pattern.test(url)) {
                return false;
            }
        }

        const validDomains = ['thumbnail', 'image', 'img', 'cdn', 'static.coupangcdn.com'];
        const hasValidDomain = validDomains.some(domain => url.includes(domain));
        const hasValidExtension = /\.(jpg|jpeg|png|webp)/i.test(url);

        return hasValidDomain && hasValidExtension;
    }

    /**
     * ✅ [2026-03-14] 쿠팡 이미지 URL → 원본 고해상도 변환 (대폭 강화)
     * thumbnail → original, 크기 제한 경로 제거, 쿼리 파라미터 정리
     */
    private enhanceImageUrl(url: string): string {
        let enhanced = url;

        // 1. /thumbnail/ → /original/ (쿠팡 CDN 원본 경로)
        enhanced = enhanced.replace(/\/thumbnail\//gi, '/original/');
        enhanced = enhanced.replace(/\/thumbnails\//gi, '/original/');

        // 2. 크기 제한 경로 제거 (/230x230ex/, /492x492ex/, /100x100/ 등)
        enhanced = enhanced.replace(/\/\d+x\d+(ex)?\//gi, '/');

        // 3. 파일명의 크기 접미사 제거 (_230x230, -100x100 등)
        enhanced = enhanced.replace(/[_-]\d+x\d+\./g, '.');

        // 4. /remote/.../ 프록시 경로 제거 (원본 CDN 직접 접근)
        enhanced = enhanced.replace(/\/remote\/.*?\//i, '/');

        // 5. 크기 제한 쿼리 파라미터 제거 (?type=f300 등)
        enhanced = enhanced.replace(/[?&]type=[a-z]\d+/gi, '');
        enhanced = enhanced.replace(/[?&]w=\d+/gi, '');
        enhanced = enhanced.replace(/[?&]h=\d+/gi, '');
        enhanced = enhanced.replace(/[?&]q=\d+/gi, '');

        // 6. 남은 빈 쿼리스트링 정리
        enhanced = enhanced.replace(/\?$/, '').replace(/\?&/, '?');

        // 7. 이중 슬래시 정리 (프로토콜 제외)
        enhanced = enhanced.replace(/([^:])\/{2,}/g, '$1/');

        if (enhanced !== url) {
            console.log(`[CoupangProvider] 🔍 이미지 URL 변환: ${url.substring(0, 60)}... → ${enhanced.substring(0, 60)}...`);
        }

        return enhanced;
    }
}
