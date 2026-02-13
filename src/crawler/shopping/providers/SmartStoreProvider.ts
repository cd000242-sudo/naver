/**
 * 네이버 스마트스토어 전용 크롤러
 * @module crawler/shopping/providers/SmartStoreProvider
 * 
 * ✅ 모바일 API 우선 (가장 정확)
 * ✅ Puppeteer 폴백
 * ✅ OG 메타 태그 최종 폴백
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

const MOBILE_API_BASE = 'https://m.smartstore.naver.com/i/v1/products';
const CHROME_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

let puppeteer: typeof import('puppeteer');

/**
 * 스마트스토어 선택자
 */
const SMART_STORE_SELECTORS = {
    mainImage: [
        '._1oAR8r2aH0 img',
        '.bd_3Wy0H img',
        '._3a2lXNd-Qj img',
        '[class*="ProductImage"] img',
    ],
    galleryImages: [
        '._3bAr_L-hvy img',
        '._thumbnailList img',
        '[class*="thumbnail"] img',
    ],
    detailImages: [
        '._3H7HBYx_h5 img',
        '._3nSSmfH-Ro img',
        '[class*="detail"] img',
    ],
    productName: [
        '._3oDjSvLGtw',
        '._1eddO7u4UC',
        'h3[class*="name"]',
    ],
    price: [
        '._2DywKu0J_0',
        '._2pgHN-ntx6',
        '[class*="price"]',
    ],
};

export class SmartStoreProvider extends BaseProvider {
    readonly name = 'SmartStoreProvider';
    readonly platform = 'smart-store' as const;
    readonly urlPatterns = [
        /smartstore\.naver\.com/i,
        /m\.smartstore\.naver\.com/i,
        /shopping\.naver\.com/i,
    ];

    readonly strategies: CollectionStrategy[] = [
        {
            // ✅ [1순위] Playwright + Stealth (CAPTCHA 우회, 가장 확실)
            name: 'playwright-stealth',
            priority: 1,
            execute: (url, options) => this.puppeteerStrategy(url, options),
        },
        {
            // [2순위] 모바일 API (빠르지만 실패할 수 있음)
            name: 'mobile-api',
            priority: 2,
            execute: (url, options) => this.mobileApiStrategy(url, options),
        },
        {
            // [3순위] OG 메타 태그 (최후의 수단)
            name: 'og-meta-tags',
            priority: 3,
            execute: (url, options) => this.ogMetaStrategy(url, options),
        },
    ];

    /**
     * 모바일 API 전략 (가장 정확)
     */
    private async mobileApiStrategy(url: string, options?: CollectionOptions): Promise<CollectionResult> {
        const startTime = Date.now();

        try {
            // 상품 ID 추출
            const productIdMatch = url.match(/products\/(\d+)/);
            const storeMatch = url.match(/smartstore\.naver\.com\/([^\/\?]+)/);

            if (!productIdMatch) {
                return {
                    success: false,
                    images: [],
                    usedStrategy: 'mobile-api',
                    timing: Date.now() - startTime,
                    error: '상품 ID를 찾을 수 없습니다',
                };
            }

            const productId = productIdMatch[1];
            const storeName = storeMatch?.[1] || '';

            console.log(`[SmartStore:API] 📡 모바일 API 호출: ${productId}`);

            // 1. 상품 상세 API
            const apiUrl = `${MOBILE_API_BASE}/${productId}`;
            const response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': CHROME_UA,
                    'Accept': 'application/json',
                    'Referer': `https://m.smartstore.naver.com/${storeName}/products/${productId}`,
                },
            });

            if (!response.ok) {
                throw new Error(`API 응답 실패: ${response.status}`);
            }

            const data = await response.json();

            // 에러 응답 체크
            if (data.error || data.code === 'NOT_FOUND') {
                return {
                    success: false,
                    images: [],
                    usedStrategy: 'mobile-api',
                    timing: Date.now() - startTime,
                    error: '상품을 찾을 수 없습니다',
                    isErrorPage: true,
                };
            }

            const images: ProductImage[] = [];
            const product = data.product || data;

            // 대표 이미지
            if (product.representImage?.url) {
                images.push({
                    url: product.representImage.url,
                    type: 'main',
                });
            }

            // 추가 이미지
            if (product.productImages && Array.isArray(product.productImages)) {
                for (const img of product.productImages) {
                    if (img.url && !images.some(i => i.url === img.url)) {
                        images.push({
                            url: img.url,
                            type: 'gallery',
                        });
                    }
                }
            }

            // 상세 이미지 (최대 10개)
            if (product.detailImages && Array.isArray(product.detailImages)) {
                for (const img of product.detailImages.slice(0, 10)) {
                    if (img.url && !images.some(i => i.url === img.url)) {
                        images.push({
                            url: img.url,
                            type: 'detail',
                        });
                    }
                }
            }

            // 제품 정보
            const productInfo: ProductInfo = {
                name: product.name || product.productName || '',
                price: product.salePrice?.toString() || product.price?.toString() || '',
                originalPrice: product.regularPrice?.toString() || '',
                description: product.productInfoProvidedNotice?.productInfoFromSeller || '',
            };

            console.log(`[SmartStore:API] ✅ ${images.length}개 이미지 수집`);

            return {
                success: images.length > 0,
                images,
                productInfo,
                usedStrategy: 'mobile-api',
                timing: Date.now() - startTime,
            };

        } catch (error) {
            console.warn(`[SmartStore:API] ⚠️ 실패:`, (error as Error).message);
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
     * ✅ [2026-02-08 FIX v2] Playwright-Extra + Stealth + Chrome 프로필 전략
     * - 배포환경 asar 호환성을 위한 환경변수/경로 보정 추가
     * - CAPTCHA 감지 및 수동 해결 대기 기능 유지
     */
    private async puppeteerStrategy(url: string, options?: CollectionOptions): Promise<CollectionResult> {
        const startTime = Date.now();
        let context: any = null;
        let browser: any = null;

        try {
            console.log(`[SmartStore:Playwright] 🕵️ Playwright + Stealth 로드 중...`);

            // ✅ [2026-02-08 FIX] asar 환경에서 playwright-core 경로 보정
            const path = await import('path');
            const fs = await import('fs');

            // Electron asar 환경에서 playwright-core의 실제 경로를 찾아서 환경변수 설정
            try {
                const playwrightCorePath = require.resolve('playwright-core');
                const unpacked = playwrightCorePath.replace('app.asar', 'app.asar.unpacked');
                if (fs.existsSync(unpacked)) {
                    // playwright-core가 app.asar.unpacked에 있으면 그 경로를 사용
                    const browserPath = path.dirname(path.dirname(unpacked));
                    console.log(`[SmartStore:Playwright] 📂 playwright-core 경로: ${browserPath}`);
                }
            } catch (pathErr) {
                console.log(`[SmartStore:Playwright] ⚠️ playwright-core 경로 확인 실패 (무시): ${(pathErr as Error).message}`);
            }

            const { chromium } = await import('playwright-extra');
            const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
            chromium.use(stealth());

            console.log(`[SmartStore:Playwright] ✅ playwright-extra + stealth 로드 완료`);

            // ✅ 배포환경 Chromium 경로 설정
            const { getChromiumExecutablePath } = await import('../../../browserUtils.js');
            const executablePath = await getChromiumExecutablePath();
            console.log(`[SmartStore:Playwright] 🔧 브라우저 경로: ${executablePath || 'Playwright 기본값'}`);

            // ⭐ 사용자 Chrome 프로필 경로 (쿠키/세션 재사용으로 CAPTCHA 우회)
            const userDataDir = process.env.LOCALAPPDATA
                ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`
                : process.env.HOME
                    ? `${process.env.HOME}/Library/Application Support/Google/Chrome`
                    : null;

            if (userDataDir) {
                console.log('[SmartStore:Playwright] 🍪 사용자 Chrome 프로필 사용 (CAPTCHA 우회)');

                try {
                    console.log(`[SmartStore:Playwright] 🚀 launchPersistentContext 시도... (userDataDir: ${userDataDir})`);
                    context = await chromium.launchPersistentContext(userDataDir, {
                        headless: false,
                        ...(executablePath ? { executablePath } : {}),
                        args: [
                            '--disable-blink-features=AutomationControlled',
                            '--disable-dev-shm-usage',
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--window-size=1920,1080',
                            '--window-position=100,100',
                            '--profile-directory=Default',
                        ],
                        viewport: { width: 1920, height: 1080 },
                        locale: 'ko-KR',
                        timezoneId: 'Asia/Seoul',
                    });
                    console.log('[SmartStore:Playwright] ✅ launchPersistentContext 성공!');
                } catch (profileError) {
                    console.warn('[SmartStore:Playwright] ⚠️ Chrome 프로필 사용 실패:', (profileError as Error).message);
                    console.warn('[SmartStore:Playwright] 📋 전체 에러:', JSON.stringify(profileError, Object.getOwnPropertyNames(profileError as Error)));
                    console.log('[SmartStore:Playwright] 🔄 새 세션으로 폴백...');
                    try {
                        browser = await chromium.launch({
                            headless: false,
                            ...(executablePath ? { executablePath } : {}),
                            args: [
                                '--disable-blink-features=AutomationControlled',
                                '--no-sandbox',
                                '--window-position=100,100',
                            ],
                        });
                        context = await browser.newContext({
                            viewport: { width: 1920, height: 1080 },
                            userAgent: CHROME_UA,
                            locale: 'ko-KR',
                        });
                        console.log('[SmartStore:Playwright] ✅ 폴백 launch 성공!');
                    } catch (fallbackError) {
                        console.error('[SmartStore:Playwright] ❌ 폴백 launch도 실패:', (fallbackError as Error).message);
                        console.error('[SmartStore:Playwright] 📋 전체 에러:', JSON.stringify(fallbackError, Object.getOwnPropertyNames(fallbackError as Error)));
                        throw fallbackError; // 최종 실패
                    }
                }
            } else {
                console.log('[SmartStore:Playwright] 🔄 새 브라우저 세션 사용');
                browser = await chromium.launch({
                    headless: false,
                    ...(executablePath ? { executablePath } : {}),
                    args: [
                        '--disable-blink-features=AutomationControlled',
                        '--no-sandbox',
                        '--window-position=100,100',
                    ],
                });
                context = await browser.newContext({
                    viewport: { width: 1920, height: 1080 },
                    userAgent: CHROME_UA,
                    locale: 'ko-KR',
                });
            }

            const page = await context.newPage();

            // webdriver 속성 숨기기
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            // ✅ 네이버 메인 페이지 먼저 방문 (CAPTCHA 회피)
            console.log('[SmartStore:Playwright] 🏠 네이버 메인 페이지 먼저 방문 (쿠키 생성)...');
            try {
                await page.goto('https://www.naver.com', {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });

                await page.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 100);
                await page.waitForTimeout(1500 + Math.random() * 1000);
                await page.mouse.wheel(0, 200 + Math.random() * 100);
                await page.waitForTimeout(800 + Math.random() * 500);

                console.log('[SmartStore:Playwright] ✅ 네이버 메인 방문 완료');
            } catch (mainError) {
                console.warn('[SmartStore:Playwright] ⚠️ 네이버 메인 방문 실패:', (mainError as Error).message);
            }

            // 모바일 URL로 변환
            const mobileUrl = url.replace('smartstore.naver.com', 'm.smartstore.naver.com');
            console.log(`[SmartStore:Playwright] 🌐 상품 페이지 이동: ${mobileUrl.substring(0, 60)}...`);

            await page.goto(mobileUrl, {
                waitUntil: 'networkidle',
                timeout: options?.timeout || 30000
            });

            // CAPTCHA 감지 및 수동 해결 대기
            const pageContent = await page.content();
            const hasCaptcha = pageContent.includes('captcha') ||
                pageContent.includes('CAPTCHA') ||
                pageContent.includes('자동입력 방지') ||
                pageContent.includes('보안문자') ||
                pageContent.includes('reCAPTCHA') ||
                pageContent.includes('확인 문자') ||
                await page.$('iframe[src*="captcha"]') !== null ||
                await page.$('iframe[src*="recaptcha"]') !== null;

            if (hasCaptcha) {
                console.log('[SmartStore:Playwright] 🔐 CAPTCHA 감지! 브라우저 창에서 수동으로 풀어주세요! (10분 대기)');

                const maxWait = 600000;
                const checkInterval = 2000;
                let waited = 0;

                while (waited < maxWait) {
                    await page.waitForTimeout(checkInterval);
                    waited += checkInterval;

                    const currentContent = await page.content();
                    const stillHasCaptcha = currentContent.includes('captcha') ||
                        currentContent.includes('CAPTCHA') ||
                        currentContent.includes('자동입력 방지') ||
                        currentContent.includes('보안문자');

                    const productNameVisible = await page.$('._3oDjSvLGtw, ._1eddO7u4UC, [class*="ProductName"]');

                    if (!stillHasCaptcha || productNameVisible) {
                        console.log('[SmartStore:Playwright] ✅ CAPTCHA 해결됨!');
                        break;
                    }

                    console.log(`[SmartStore:Playwright] ⏳ CAPTCHA 대기 중... (${waited / 1000}/${maxWait / 1000}초)`);
                }

                if (waited >= maxWait) {
                    console.log('[SmartStore:Playwright] ⚠️ CAPTCHA 대기 타임아웃');
                }
            }

            // SPA 렌더링 대기
            console.log('[SmartStore:Playwright] ⏳ 상품 정보 렌더링 대기...');
            try {
                await page.waitForSelector('._3oDjSvLGtw, ._1eddO7u4UC, [class*="ProductName"]', { timeout: 10000 });
            } catch {
                console.log('[SmartStore:Playwright] ⚠️ 상품명 셀렉터 타임아웃');
            }

            // 인간처럼 행동
            await page.mouse.move(300, 200);
            await page.waitForTimeout(1500 + Math.random() * 1000);
            await page.mouse.wheel(0, 300);
            await page.waitForTimeout(1000);

            // 에러 페이지 감지
            const finalPageContent = await page.content();
            const errorIndicator = ERROR_PAGE_INDICATORS.find(indicator =>
                finalPageContent.includes(indicator)
            );

            if (errorIndicator) {
                console.log(`[SmartStore:Playwright] ⚠️ 에러 페이지 감지, 재시도...`);
                await page.waitForTimeout(3000);
                await page.reload({ waitUntil: 'networkidle' });
            }

            // 이미지 추출
            const images: ProductImage[] = await page.evaluate(() => {
                const imgs: { url: string; type: string }[] = [];
                const seenUrls = new Set<string>();

                const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
                if (ogImage && !seenUrls.has(ogImage)) {
                    seenUrls.add(ogImage);
                    imgs.push({ url: ogImage, type: 'main' });
                }

                const selectors = ['._1oAR8r2aH0 img', '.bd_3Wy0H img', '[class*="ProductImage"] img', 'img[src*="pstatic"]'];
                for (const selector of selectors) {
                    document.querySelectorAll(selector).forEach((img) => {
                        const src = (img as HTMLImageElement).src;
                        if (src && src.startsWith('http') && !seenUrls.has(src) && !src.includes('logo') && !src.includes('icon') && !src.includes('searchad-phinf') && !(src.includes('shopping-phinf') && src.includes('/main_'))) {
                            seenUrls.add(src);
                            imgs.push({ url: src, type: imgs.length === 0 ? 'main' : 'gallery' });
                        }
                    });
                }

                return imgs.slice(0, 15);
            }) as ProductImage[];

            // 제품 정보 추출
            const productInfo = await page.evaluate(() => {
                const name =
                    document.querySelector('._3oDjSvLGtw')?.textContent ||
                    document.querySelector('._1eddO7u4UC')?.textContent ||
                    document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
                const price =
                    document.querySelector('._2DywKu0J_0')?.textContent ||
                    document.querySelector('._2pgHN-ntx6')?.textContent || '';
                return { name: name.trim(), price: price.trim() };
            }) as ProductInfo;

            // 브라우저 종료
            if (context) await context.close();
            if (browser) await browser.close();

            console.log(`[SmartStore:Playwright] ✅ ${images.length}개 이미지 수집, 상품명: ${productInfo?.name?.substring(0, 30)}...`);

            return {
                success: images.length > 0,
                images,
                productInfo,
                usedStrategy: 'playwright-stealth',
                timing: Date.now() - startTime,
            };

        } catch (error) {
            console.error(`[SmartStore:Playwright] ❌ 최종 오류:`, (error as Error).message);
            console.error(`[SmartStore:Playwright] 📋 스택:`, (error as Error).stack);
            if (context) try { await context.close(); } catch { /* */ }
            if (browser) try { await browser.close(); } catch { /* */ }
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
     * OG 메타 태그 최종 폴백
     */
    private async ogMetaStrategy(url: string, options?: CollectionOptions): Promise<CollectionResult> {
        const startTime = Date.now();

        try {
            console.log(`[SmartStore:OGMeta] 📋 OG 태그 추출 중...`);

            const response = await fetch(url, {
                headers: { 'User-Agent': CHROME_UA },
            });

            const html = await response.text();

            // 에러 페이지 감지
            const errorIndicator = ERROR_PAGE_INDICATORS.find(indicator =>
                html.includes(indicator)
            );

            if (errorIndicator) {
                return {
                    success: false,
                    images: [],
                    usedStrategy: 'og-meta-tags',
                    timing: Date.now() - startTime,
                    error: `에러 페이지 감지: "${errorIndicator}"`,
                    isErrorPage: true,
                };
            }

            const images: ProductImage[] = [];

            // OG 이미지 추출
            const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
            if (ogImageMatch?.[1]) {
                images.push({ url: ogImageMatch[1], type: 'main' });
            }

            // 추가 이미지 추출 시도
            const imgMatches = html.matchAll(/<img[^>]+src="(https:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi);
            for (const match of imgMatches) {
                const imgUrl = match[1];
                if (imgUrl && !images.some(i => i.url === imgUrl) && this.isValidImageUrl(imgUrl)) {
                    images.push({ url: imgUrl, type: 'gallery' });
                    if (images.length >= 10) break;
                }
            }

            const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
            const productInfo: ProductInfo | undefined = ogTitleMatch?.[1]
                ? { name: ogTitleMatch[1] }
                : undefined;

            console.log(`[SmartStore:OGMeta] ✅ ${images.length}개 이미지 수집`);

            return {
                success: images.length > 0,
                images,
                productInfo,
                usedStrategy: 'og-meta-tags',
                timing: Date.now() - startTime,
            };

        } catch (error) {
            console.error(`[SmartStore:OGMeta] ❌ 오류:`, (error as Error).message);
            return {
                success: false,
                images: [],
                usedStrategy: 'og-meta-tags',
                timing: Date.now() - startTime,
                error: (error as Error).message,
            };
        }
    }

    private async extractImages(page: import('puppeteer').Page): Promise<ProductImage[]> {
        const images: ProductImage[] = [];
        const seenUrls = new Set<string>();

        for (const selector of [...SMART_STORE_SELECTORS.mainImage, ...SMART_STORE_SELECTORS.galleryImages]) {
            try {
                const imgs = await page.$$eval(selector, (elements) =>
                    elements.map((img) => (img as HTMLImageElement).src).filter(Boolean)
                );
                for (const src of imgs) {
                    if (!seenUrls.has(src) && this.isValidImageUrl(src)) {
                        seenUrls.add(src);
                        images.push({ url: src, type: images.length === 0 ? 'main' : 'gallery' });
                    }
                }
            } catch { /* 무시 */ }
        }

        return images;
    }

    private async extractProductInfo(page: import('puppeteer').Page): Promise<ProductInfo | undefined> {
        try {
            let name = '';
            for (const selector of SMART_STORE_SELECTORS.productName) {
                try {
                    name = await page.$eval(selector, (el) => el.textContent?.trim() || '');
                    if (name) break;
                } catch { /* 무시 */ }
            }
            if (name) return { name };
        } catch { /* 무시 */ }
        return undefined;
    }

    private isValidImageUrl(url: string): boolean {
        if (!url) return false;
        if (url.startsWith('data:')) return false;
        if (url.includes('placeholder')) return false;
        if (url.includes('logo')) return false;
        if (url.includes('icon')) return false;
        // ✅ [2026-02-08] 광고/비디오/다른 상품 카탈로그 제외
        if (url.includes('searchad-phinf')) return false;
        if (url.includes('shopping-phinf') && url.includes('/main_')) return false;
        if (url.includes('video-phinf')) return false;
        if (url.includes('banner')) return false;
        if (url.includes('button')) return false;
        return true;
    }
}
