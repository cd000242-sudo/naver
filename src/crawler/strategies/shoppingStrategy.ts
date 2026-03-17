import { SHOPPING_SELECTORS, TEXT_SELECTORS } from '../config/selectors.js';
import { deduplicateImages } from '../utils/imageUtils.js';
import { isShortUrl } from '../utils/urlUtils.js';
import { getChromiumExecutablePath } from '../../browserUtils.js';
import type { Page } from 'playwright';

// ════════════════════════════════════════════════════════════════════
// ✅ [2026-03-12] Playwright + Stealth 브라우저 전용 크롤링
// ════════════════════════════════════════════════════════════════════

/** 3분 하드 타임아웃 (캡차 대기 제외) */
const CRAWL_TIMEOUT_MS = 180_000;

/**
 * ✅ 캡차/보안 페이지 감지 → 사용자가 풀 때까지 대기 (최대 2분)
 * ⚠ 캡차 대기 시간은 타임아웃에 포함되지 않음
 */
async function waitForCaptchaIfNeeded(page: Page): Promise<void> {
    try {
        const pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        const captchaKeywords = ['보안 확인', '캡차', 'captcha', '자동입력 방지', '보안문자',
            '현재 서비스 접속이 불가', '비정상적인 접근'];
        const hasCaptcha = captchaKeywords.some(kw => pageText.includes(kw));

        if (!hasCaptcha) return;

        console.log(`[Shopping Crawler] 🔒 캡차/보안 페이지 감지! 브라우저에서 직접 해결해주세요. (최대 2분 대기)`);

        const maxWait = 120000;
        const pollInterval = 3000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            await page.waitForTimeout(pollInterval);
            const currentText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
            const stillBlocked = captchaKeywords.some(kw => currentText.includes(kw));

            if (!stillBlocked) {
                console.log(`[Shopping Crawler] ✅ 캡차 해결됨! 크롤링 계속 진행합니다.`);
                return;
            }

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log(`[Shopping Crawler] ⏳ 캡차 대기 중... (${elapsed}초 경과)`);
        }

        console.warn(`[Shopping Crawler] ⚠️ 캡차 대기 시간 초과 (2분). 그대로 진행합니다.`);
    } catch {
        // 무시
    }
}

export interface CrawlResult {
    images: string[];
    /** ✅ [2026-03-12] 섹션별 분류 이미지 */
    categorizedImages?: {
        gallery: string[];
        detail: string[];
        review: string[];
    };
    title?: string;
    content?: string;
    price?: string;
}

// ════════════════════════════════════════════════════════════════════
// 네이버 스마트스토어 전용 섹션별 수집
// ════════════════════════════════════════════════════════════════════

/** 스마트스토어 모바일 페이지인지 판별 */
function isNaverSmartStore(url: string): boolean {
    return /m\.smartstore\.naver\.com|smartstore\.naver\.com|brand\.naver\.com/i.test(url);
}

/**
 * ✅ [2026-03-12] 스마트스토어 "상세 더보기" 펼치기
 * 모바일에서는 상세 이미지가 접혀 있으므로 클릭해서 로드
 */
async function expandDetailSection(page: Page): Promise<void> {
    try {
        // 상세보기 더보기/펼치기 버튼 클릭 시도 (다양한 셀렉터)
        const expandSelectors = [
            'button[class*="unfold"]',
            'button[class*="more"]',
            'a[class*="unfold"]',
            '._2-uvQuRWK5',         // 네이버 스마트스토어 클래스
            '[class*="detail"] button',
            '#INTRODUCE ~ button',
            'button:has-text("상세보기")',
            'button:has-text("더보기")',
            'button:has-text("펼치기")',
        ];

        for (const sel of expandSelectors) {
            try {
                const btn = page.locator(sel).first();
                if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
                    await btn.click({ timeout: 1000 });
                    console.log(`[Shopping Crawler] 📖 상세보기 펼침 (${sel})`);
                    await page.waitForTimeout(500); // 상세 이미지 로딩 대기
                    return;
                }
            } catch { /* 다음 셀렉터 시도 */ }
        }
    } catch {
        // 상세보기 버튼이 없으면 무시
    }
}

/**
 * ✅ [2026-03-12] 스마트스토어 리뷰 탭 클릭 → 포토리뷰 이미지 로드
 */
async function loadReviewSection(page: Page): Promise<void> {
    try {
        const reviewTabSelectors = [
            'a[href*="review"]',
            'button[class*="review"]',
            '[role="tab"]:has-text("리뷰")',
            'a:has-text("리뷰")',
            'button:has-text("리뷰")',
            '[class*="tab"] a:has-text("리뷰")',
            'li[class*="tab"] a',  // 탭 리스트
        ];

        for (const sel of reviewTabSelectors) {
            try {
                const tab = page.locator(sel).first();
                if (await tab.isVisible({ timeout: 500 }).catch(() => false)) {
                    await tab.click({ timeout: 1000 });
                    console.log(`[Shopping Crawler] 📝 리뷰 탭 클릭 (${sel})`);
                    await page.waitForTimeout(800); // 리뷰 이미지 로딩 대기
                    return;
                }
            } catch { /* 다음 셀렉터 시도 */ }
        }
    } catch {
        // 리뷰 탭이 없으면 무시
    }
}

/**
 * ✅ [2026-03-12] shop-phinf URL을 고해상도로 변환
 * 40x40 썸네일 URL도 type=w860으로 변환하면 고해상도 이미지 획득 가능
 */
function upgradeShopPhinfUrl(url: string): string {
    if (!url.includes('shop-phinf.pstatic.net')) return url;
    // type 파라미터가 있으면 w860으로 교체, 없으면 추가
    if (/[?&]type=/i.test(url)) {
        return url.replace(/([?&])type=[^&]*/i, '$1type=w860');
    }
    return url + (url.includes('?') ? '&' : '?') + 'type=w860';
}

/**
 * ✅ [2026-03-12] 네이버 스마트스토어 섹션별 이미지 수집
 * PC + 모바일 호환, 갤러리 → 상세 → 리뷰 순서로 분류하여 반환
 */
async function extractSmartStoreImages(page: Page): Promise<{
    gallery: string[];
    detail: string[];
    review: string[];
}> {
    const raw = await page.evaluate(() => {
        const gallery: string[] = [];
        const detail: string[] = [];
        const review: string[] = [];
        const seen = new Set<string>();

        const normKey = (url: string): string => {
            // 쿼리 파라미터 무시하고 경로만으로 중복 체크
            return url.split('?')[0];
        };

        const addImg = (url: string, target: string[]) => {
            if (!url || url.startsWith('data:') || url.length < 20) return;
            // 절대 URL 변환
            try { url = new URL(url, location.href).href; } catch { return; }
            // 소형 아이콘/추적 픽셀 패턴 제외 (배너는 shop-phinf면 허용)
            if (/icon|logo|btn|button|ad_|tracking|spacer|blank\.gif|favicon/i.test(url)) return;
            // 프로모션 배너(ssl.pstatic.net 등) 제외, shop-phinf만 허용
            if (url.includes('pstatic.net') && !url.includes('shop-phinf.pstatic.net')) return;
            const key = normKey(url);
            if (seen.has(key)) return;
            seen.add(key);
            target.push(url);
        };

        // ═══ 1. 갤러리 이미지 ═══
        // 1-a. 모바일용 셀렉터
        const gallerySelectors = [
            '.swiper-slide img',
            '._2tD33dtvVN img',
            '[class*="thumbnail"] img',
            '[class*="gallery"] img',
            '[class*="slider"] img',
            '[class*="carousel"] img',
            '.product_img img',
        ];
        for (const sel of gallerySelectors) {
            document.querySelectorAll(sel).forEach(img => {
                const src = (img as HTMLImageElement).src ||
                    img.getAttribute('data-src') ||
                    img.getAttribute('data-original') || '';
                addImg(src, gallery);
            });
        }

        // 1-b. ⭐ PC용: alt 속성 기반 수집 (대표이미지 + 추가이미지0~9)
        // PC 스마트스토어에서 추가이미지는 40x40 썸네일로 렌더링되지만 URL은 고해상도
        document.querySelectorAll('img').forEach(img => {
            const alt = img.alt || '';
            const src = img.src || img.getAttribute('data-src') || '';
            if (!src || !src.includes('shop-phinf.pstatic.net')) return;
            if (/^(대표이미지|추가이미지\d*)$/.test(alt.trim())) {
                addImg(src, gallery);
            }
        });

        // 1-c. OG 이미지도 갤러리에 포함
        const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
        if (ogImg) addImg(ogImg, gallery);

        // ═══ 2. 상세 이미지 (상품 설명 영역) ═══
        const detailSelectors = [
            '#INTRODUCE img',
            '.se-main-container img',
            '.se-module-image img',
            '[class*="detail_img"] img',
            '[class*="product_detail"] img',
            '._3xqm6OVqKs img',
            '.product-description img',
            // PC용 상세 영역 (렌더링된 상세페이지)
            '[class*="_detailArea"] img',
            '[class*="content_detail"] img',
            'iframe[src*="smartstore"] img',
        ];
        for (const sel of detailSelectors) {
            document.querySelectorAll(sel).forEach(img => {
                const src = (img as HTMLImageElement).src ||
                    img.getAttribute('data-src') ||
                    img.getAttribute('data-original') || '';
                addImg(src, detail);
            });
        }

        // 갤러리/리뷰에 이미 포함되지 않은 shop-phinf 이미지를 상세에 추가
        document.querySelectorAll('img[src*="shop-phinf.pstatic.net"]').forEach(img => {
            const src = (img as HTMLImageElement).src;
            const alt = (img as HTMLImageElement).alt || '';
            // 대표/추가이미지는 이미 갤러리에 있으므로 스킵
            if (/^(대표이미지|추가이미지\d*)$/.test(alt.trim())) return;
            addImg(src, detail);
        });

        // ═══ 3. 리뷰 이미지 (포토 리뷰) ═══
        const reviewSelectors = [
            '.review_item img',
            '.review-photo img',
            '.review_photo img',
            '.photo_review img',
            '.YvTyxRfXAK img',
            'img.K0hV0afCJe',
            '[class*="review"] img',
            '[class*="photo"] img',
        ];
        for (const sel of reviewSelectors) {
            document.querySelectorAll(sel).forEach(img => {
                const src = (img as HTMLImageElement).src ||
                    img.getAttribute('data-src') ||
                    img.getAttribute('data-original') || '';
                // 리뷰 이미지에서 작은 프로필 아이콘 제외 (40px 이하)
                const w = (img as HTMLImageElement).naturalWidth || parseInt(img.getAttribute('width') || '0');
                if (w > 0 && w < 40) return;
                addImg(src, review);
            });
        }

        return { gallery, detail, review };
    });

    // ⭐ Post-processing: shop-phinf URL을 고해상도로 변환
    return {
        gallery: raw.gallery.map(upgradeShopPhinfUrl),
        detail: raw.detail.map(upgradeShopPhinfUrl),
        review: raw.review.map(upgradeShopPhinfUrl),
    };
}

/**
 * ✅ [2026-03-12] 스마트 스크롤 — 빠르고 효율적 (최대 8초)
 */
async function smartScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
        if (!document.body) return; // 차단 페이지 등에서 body 없을 수 있음
        const maxTime = 8000; // 8초 제한
        const start = Date.now();
        const scrollStep = 2000; // 2000px씩
        let pos = 0;

        while (Date.now() - start < maxTime) {
            const pageHeight = document.body?.scrollHeight || 0;
            if (pageHeight === 0 || pos >= pageHeight) break;

            window.scrollBy(0, scrollStep);
            pos += scrollStep;
            await new Promise(r => setTimeout(r, 80)); // 80ms 간격
        }

        // 맨 위로 돌아가기 (갤러리 이미지 확인)
        window.scrollTo(0, 0);
    });
}

// ════════════════════════════════════════════════════════════════════
// 일반 쇼핑몰 (쿠팡, 알리 등) 이미지 추출
// ════════════════════════════════════════════════════════════════════

async function extractGenericShoppingImages(page: Page): Promise<string[]> {
    return page.evaluate(({ imgSelectors }: any) => {
        const images: string[] = [];

        const allSelectors = [
            ...imgSelectors.COUPANG,
            ...imgSelectors.ALIEXPRESS,
            ...imgSelectors.GENERIC.map((s: string) => ({ priority: 'generic', selector: s }))
        ];

        allSelectors.forEach(({ selector }: any) => {
            document.querySelectorAll(selector).forEach((img) => {
                const src = (img as HTMLImageElement).getAttribute('src') ||
                    (img as HTMLImageElement).getAttribute('data-src') ||
                    (img as HTMLImageElement).getAttribute('data-original');
                if (src) images.push(src);
            });
        });

        return images;
    }, { imgSelectors: SHOPPING_SELECTORS });
}

// ════════════════════════════════════════════════════════════════════
// 텍스트 추출 (공통)
// ════════════════════════════════════════════════════════════════════

async function extractTextData(page: Page): Promise<{ title: string; content: string; price: string }> {
    return page.evaluate(({ txtSelectors }: any) => {
        // 본문 추출
        let content = '';
        for (const selector of txtSelectors.CONTENT) {
            const el = document.querySelector(selector);
            if (el && el.textContent && el.textContent.length > 50) {
                content = el.textContent.trim();
                break;
            }
        }

        // 제목 추출
        const title = document.title ||
            document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';

        // 가격 추출
        const priceEl = document.querySelector('[class*="price"], .price, ._1LY7DqCnwR, .total_price');
        const price = priceEl?.textContent?.replace(/[^0-9,]/g, '') || '';

        return { title, content, price };
    }, { txtSelectors: TEXT_SELECTORS });
}

// ════════════════════════════════════════════════════════════════════
// 메인 크롤링 함수
// ════════════════════════════════════════════════════════════════════

/**
 * ✅ [2026-03-12] Playwright + Stealth 브라우저 크롤링 (브라우저 전용)
 * - 모바일 API 사용하지 않음 — 항상 브라우저로 크롤링
 * - 캡차/차단 페이지 감지 시 새로고침 재시도
 * - 섹션별 이미지 수집
 */
export async function crawlShoppingSite(url: string): Promise<CrawlResult> {
    let context: any = null;
    const crawlStart = Date.now();

    try {
        // ═══════════════════════════════════════════════════════
        // Playwright + Stealth 브라우저 크롤링
        // ═══════════════════════════════════════════════════════
        console.log(`[Shopping Crawler] 🎭 Playwright + Stealth 세션 시작... Target: ${url}`);

        // ✅ playwright-extra + stealth 적용 (봇 감지 우회)
        const { chromium } = await import('playwright-extra');
        const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
        chromium.use(stealth());
        console.log(`[Shopping Crawler] ✅ playwright-extra + stealth 로드 완료`);

        const execPath = await getChromiumExecutablePath();

        // ✅ 전용 프로필 디렉터리로 launchPersistentContext 사용
        // - 기존 Chrome과 충돌 없음 (별도 디렉터리)
        // - 캡차 1회 해결 후 쿠키 지속 → 이후 캡차 불필요
        const path = await import('path');
        const os = await import('os');
        const crawlerProfileDir = path.join(os.tmpdir(), 'leword-crawler-profile');

        console.log(`[Shopping Crawler] 🍪 전용 크롤러 프로필: ${crawlerProfileDir}`);

        context = await chromium.launchPersistentContext(crawlerProfileDir, {
            headless: false,
            ...(execPath ? { executablePath: execPath } : {}),
            // ⭐ --enable-automation (자동화 배너) + --no-sandbox (경고 배너) 모두 제거
            ignoreDefaultArgs: ['--enable-automation', '--no-sandbox'],
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--start-maximized',
                '--disable-infobars',
                '--no-first-run',
                '--no-default-browser-check',
            ],
            viewport: null,  // 전체화면 (null = OS 기본 크기)
            // ⭐ 최신 Chrome 135 UA 사용
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
            locale: 'ko-KR',
            timezoneId: 'Asia/Seoul',
        });
        console.log('[Shopping Crawler] ✅ 전용 프로필 로드 성공');

        // 기존 about:blank 페이지 재사용 (빈 탭 방지)
        const page = context.pages()[0] || await context.newPage();

        // ⭐ 강화된 봇 감지 우회 + tsx/esbuild 호환
        await page.addInitScript(() => {
            // ⭐ tsx/esbuild __name 데코레이터 polyfill (page.evaluate에서 ReferenceError 방지)
            if (typeof (globalThis as any).__name === 'undefined') {
                (globalThis as any).__name = (fn: any, _name: string) => fn;
            }
            // webdriver 속성 숨기기
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            // Chrome 런타임 위조
            (window as any).chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
            // 언어 설정
            Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
            // plugins 위조 (빈 배열이면 봇으로 판단)
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            // permissions 위조
            const originalQuery = window.navigator.permissions.query;
            (window.navigator.permissions as any).query = (parameters: any) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
                    : originalQuery(parameters);
        });

        // ⭐ __name polyfill을 현재 페이지에도 즉시 주입 (addInitScript는 새 네비게이션 시에만 적용)
        await page.evaluate(() => {
            if (typeof (globalThis as any).__name === 'undefined') {
                (globalThis as any).__name = (fn: any, _name: string) => fn;
            }
        }).catch(() => {});

        // ⭐ 네이버 메인 먼저 방문 (쿠키 생성 → 차단 회피)
        console.log('[Shopping Crawler] 🏠 네이버 메인 선방문 (쿠키 생성)...');
        try {
            await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 10000 });
            // 인간적 행동 시뮬레이션: 마우스 이동 + 약간의 스크롤
            await page.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 100);
            await page.waitForTimeout(500 + Math.random() * 300);
            await page.mouse.move(300 + Math.random() * 300, 200 + Math.random() * 200);
            await page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 300));
            await page.waitForTimeout(800 + Math.random() * 700);
            console.log('[Shopping Crawler] ✅ 네이버 메인 방문 완료');
        } catch {
            console.log('[Shopping Crawler] ⚠️ 네이버 메인 방문 실패 (무시)');
        }

        // ═══ 페이지 네비게이션 ═══

        // ⭐ URL 클린업: 트래킹 파라미터 제거 (봇 감지 트리거 방지)
        const cleanUrl = (rawUrl: string): string => {
            try {
                const u = new URL(rawUrl);
                // 네이버 트래킹 파라미터 제거
                ['NaPm', 'originChannelInfo', 'n_media', 'n_query', 'n_rank', 'n_ad_group'].forEach(p => u.searchParams.delete(p));
                return u.toString();
            } catch { return rawUrl; }
        };
        const cleanedUrl = cleanUrl(url);
        console.log(`[Shopping Crawler] 🧹 URL 클린업: ${cleanedUrl.substring(0, 80)}...`);

        /**
         * ⭐ 차단/캡차 통합 처리 — 사용자가 해결할 때까지 최대 2분 대기
         * - "현재 서비스 접속이 불가합니다" → 새로고침 버튼 자동 클릭 + 대기
         * - 캡차/보안 페이지 → 사용자 해결 대기
         * - 30초마다 새로고침 시도 (차단인 경우)
         */
        const waitForPageReady = async (targetUrl: string): Promise<boolean> => {
            const allBlockKeywords = [
                '현재 서비스 접속이 불가', '비정상적인 접근', '접속이 불가합니다',
                '보안 확인', '캡차', 'captcha', '자동입력 방지', '보안문자',
            ];
            const refreshableKeywords = ['현재 서비스 접속이 불가', '접속이 불가합니다'];
            const MAX_WAIT_MS = 120_000; // 2분
            const POLL_INTERVAL = 3_000; // 3초마다 체크
            const AUTO_REFRESH_INTERVAL = 30_000; // 30초마다 새로고침 시도

            // 1차 접속
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(1500 + Math.random() * 500);

            // 페이지 상태 체크
            const getBodyText = async () => 
                page.evaluate(() => document.body?.innerText || '').catch(() => '');

            let bodyText = await getBodyText();
            let isBlocked = allBlockKeywords.some(kw => bodyText.includes(kw));

            if (!isBlocked) return true; // 즉시 접속 성공

            // ══ 차단/캡차 감지 → 사용자 대기 루프 ══
            const isRefreshable = refreshableKeywords.some(kw => bodyText.includes(kw));
            if (isRefreshable) {
                console.log(`[Shopping Crawler] 🚫 차단 페이지 감지! 새로고침 시도 + 사용자 대기 (최대 2분)`);
            } else {
                console.log(`[Shopping Crawler] 🔒 캡차/보안 감지! 브라우저에서 해결해주세요. (최대 2분 대기)`);
            }

            const startTime = Date.now();
            let lastRefreshTime = startTime;

            while (Date.now() - startTime < MAX_WAIT_MS) {
                await page.waitForTimeout(POLL_INTERVAL);

                bodyText = await getBodyText();
                isBlocked = allBlockKeywords.some(kw => bodyText.includes(kw));

                if (!isBlocked) {
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    console.log(`[Shopping Crawler] ✅ 페이지 접근 성공! (${elapsed}초 후)`);
                    await page.waitForTimeout(500); // 페이지 안정 대기
                    return true;
                }

                const elapsed = Math.round((Date.now() - startTime) / 1000);
                console.log(`[Shopping Crawler] ⏳ 대기 중... (${elapsed}초 경과)`);

                // 차단 페이지(서비스 접속 불가)이면 30초마다 자동 새로고침
                const currentIsRefreshable = refreshableKeywords.some(kw => bodyText.includes(kw));
                if (currentIsRefreshable && (Date.now() - lastRefreshTime) >= AUTO_REFRESH_INTERVAL) {
                    try {
                        // "새로고침" 버튼 클릭 시도
                        const refreshBtn = page.locator('button:has-text("새로고침"), a:has-text("새로고침")').first();
                        if (await refreshBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                            await refreshBtn.click({ timeout: 2000 });
                            console.log(`[Shopping Crawler] 🔄 새로고침 버튼 클릭`);
                        } else {
                            await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
                            console.log(`[Shopping Crawler] 🔄 페이지 새로고침`);
                        }
                        lastRefreshTime = Date.now();
                        await page.waitForTimeout(2000 + Math.random() * 1000);
                    } catch { /* 무시 */ }
                }
            }

            console.warn(`[Shopping Crawler] ⚠️ 2분 대기 초과. 그대로 진행 시도...`);
            return false;
        };

        // ═══ 페이지 접속 ═══
        let navigationSuccess: boolean;

        if (isShortUrl(cleanedUrl)) {
            console.log(`[Shopping Crawler] 🔗 단축/경유 URL 감지 → 리다이렉트 추적`);
            navigationSuccess = await waitForPageReady(cleanedUrl);

            if (navigationSuccess) {
                // JS 리다이렉트 대기 (naver.me → brandconnect → smartstore) — 최대 5초
                let finalUrl = page.url();
                const storePatterns = ['smartstore.naver.com', 'brand.naver.com', 'shopping.naver.com'];
                for (let i = 0; i < 10; i++) {
                    if (storePatterns.some(p => finalUrl.includes(p))) break;
                    await page.waitForTimeout(500);
                    finalUrl = page.url();
                }
                console.log(`[Shopping Crawler] ✅ 리다이렉트 완료 → ${finalUrl}`);
            }
        } else {
            navigationSuccess = await waitForPageReady(cleanedUrl);
        }

        // 차단되어 페이지 접근 불가 시에도 일단 진행 (일부 데이터라도 추출 시도)
        if (!navigationSuccess) {
            console.warn(`[Shopping Crawler] ⚠️ 네이버 차단 상태지만 추출 시도...`);
        }

        // ✅ 3분 타임아웃 시작 (캡차/차단 처리 이후부터 카운트)
        const timeoutStart = Date.now();

        /** 남은 시간 체크 헬퍼 */
        const remainingMs = () => Math.max(0, CRAWL_TIMEOUT_MS - (Date.now() - timeoutStart));
        const isTimedOut = () => (Date.now() - timeoutStart) >= CRAWL_TIMEOUT_MS;

        // ═══ 페이지 안정 대기 (최소화) ═══
        try {
            await page.waitForLoadState('networkidle', { timeout: Math.min(3000, remainingMs()) });
        } catch {
            await page.waitForTimeout(500);
        }

        if (isTimedOut()) {
            console.warn(`[Shopping Crawler] ⏱️ 3분 타임아웃 초과 (안정 대기 후)`);
        }

        // ═══ 스마트 스크롤 (최대 8초) ═══
        if (!isTimedOut()) {
            console.log(`[Shopping Crawler] 📜 스마트 스크롤 시작 (남은: ${(remainingMs() / 1000).toFixed(1)}초)`);
            await smartScroll(page);
        }

        const currentUrl = page.url();
        const isSS = isNaverSmartStore(currentUrl);

        // ═══ 이미지 수집 ═══
        let allImages: string[] = [];
        let categorized: { gallery: string[]; detail: string[]; review: string[] } | undefined;

        if (isSS && !isTimedOut()) {
            // ✅ 네이버 스마트스토어: 섹션별 수집
            console.log(`[Shopping Crawler] 🛒 네이버 스마트스토어 감지 → 섹션별 수집`);

            // 1단계: 상세보기 펼치기
            if (!isTimedOut()) await expandDetailSection(page);

            // 2단계: 갤러리 + 상세 이미지 수집
            categorized = await extractSmartStoreImages(page);

            // 3단계: 리뷰 탭 클릭 + 리뷰 이미지 수집
            if (!isTimedOut() && categorized.review.length === 0) {
                await loadReviewSection(page);
                const withReview = await extractSmartStoreImages(page);
                categorized.review = withReview.review;
            }

            // 합산 (갤러리 → 상세 → 리뷰 순서)
            allImages = [...categorized.gallery, ...categorized.detail, ...categorized.review];

            console.log(`[Shopping Crawler] 📊 섹션별: 갤러리=${categorized.gallery.length}, 상세=${categorized.detail.length}, 리뷰=${categorized.review.length}`);
        } else {
            // 일반 쇼핑몰 (쿠팡, 알리 등)
            allImages = await extractGenericShoppingImages(page);
        }

        // ═══ 텍스트 추출 ═══
        const textData = await extractTextData(page);

        // ═══ 후처리 ═══
        const finalImages = deduplicateImages(allImages);

        const elapsed = Date.now() - crawlStart;
        console.log(`[Shopping Crawler] ✅ 완료 (${(elapsed / 1000).toFixed(1)}초): 이미지 ${finalImages.length}개, 텍스트 ${textData.content?.length || 0}자`);

        return {
            images: finalImages,
            categorizedImages: categorized,
            title: textData.title,
            content: textData.content,
            price: textData.price
        };

    } catch (error: any) {
        const elapsed = Date.now() - crawlStart;
        console.error(`[Shopping Crawler] Error (${(elapsed / 1000).toFixed(1)}초): ${error.message}`);
        return { images: [] };
    } finally {
        if (context) await context.close().catch(() => {});
    }
}
