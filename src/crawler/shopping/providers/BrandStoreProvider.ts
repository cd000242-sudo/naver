/**
 * 네이버 브랜드스토어 전용 크롤러
 * @module crawler/shopping/providers/BrandStoreProvider
 * 
 * ⚠️ 중요: 네이버 이미지 API 사용 금지 (잘못된 이미지 반환 문제)
 * ✅ Puppeteer 직접 크롤링만 사용
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

// Puppeteer는 동적 import로 가져옴 (Electron 환경 호환)
let puppeteer: typeof import('puppeteer');

/**
 * 브랜드스토어 이미지 선택자
 */
const BRAND_STORE_SELECTORS = {
    // 메인 이미지
    mainImage: [
        '._23RpOU6xpc img',
        '.product_thumb img',
        '.swiper-slide-active img',
        '._3bHxC0WuDz img',
        '[class*="ProductImage"] img',
        '._productImageBox img',
        '.product_image img',
    ],
    // 갤러리 이미지  
    galleryImages: [
        '._2gUWrQJRB6 img',
        '.product_gallery img',
        '.swiper-slide img',
        '[class*="gallery"] img',
        '._thumbnailList img',
    ],
    // 상세 이미지
    detailImages: [
        '._1_27LPY3m1 img',
        '.product_detail img',
        '._productDetail img',
        '[class*="detail"] img:not([class*="icon"]):not([class*="logo"])',
    ],
    // 제품명
    productName: [
        '._1PF-0vpPXO',
        '.product_title',
        'h1[class*="product"]',
        '._productName',
    ],
    // 가격
    price: [
        '._1LY7DqCnwR',
        '.product_price',
        '[class*="price"]',
    ],
};

export class BrandStoreProvider extends BaseProvider {
    readonly name = 'BrandStoreProvider';
    readonly platform = 'brand-store' as const;
    readonly urlPatterns = [
        /brand\.naver\.com/i,
    ];

    readonly strategies: CollectionStrategy[] = [
        {
            name: 'puppeteer-direct',
            priority: 1,
            execute: (url, options) => this.puppeteerStrategy(url, options),
        },
        {
            name: 'mobile-og-meta',
            priority: 2,
            execute: (url, options) => this.ogMetaStrategy(url, options),
        },
    ];

    /**
     * Puppeteer 직접 크롤링 전략
     * 가장 정확한 방법
     */
    private async puppeteerStrategy(url: string, options?: CollectionOptions): Promise<CollectionResult> {
        const startTime = Date.now();

        try {
            if (!puppeteer) {
                puppeteer = await import('puppeteer');
            }

            console.log(`[BrandStore:Puppeteer] 🌐 페이지 로드 중...`);

            // ✅ [2026-02-08 FIX] 배포환경 Chromium 경로 설정 (필수!)
            const { getChromiumExecutablePath } = await import('../../../browserUtils.js');
            const executablePath = await getChromiumExecutablePath();

            const browser = await puppeteer.launch({
                headless: true,
                ...(executablePath ? { executablePath } : {}), // ✅ [2026-02-08 FIX] 배포환경 지원
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                ],
            });

            const page = await browser.newPage();

            // 모바일 뷰포트 (더 많은 이미지 로드)
            await page.setViewport({ width: 412, height: 915 });
            await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');

            // 페이지 로드
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: options?.timeout || 30000
            });

            // 에러 페이지 감지
            const pageContent = await page.content();
            const errorIndicator = ERROR_PAGE_INDICATORS.find(indicator =>
                pageContent.includes(indicator)
            );

            if (errorIndicator) {
                await browser.close();
                return {
                    success: false,
                    images: [],
                    usedStrategy: 'puppeteer-direct',
                    timing: Date.now() - startTime,
                    error: `에러 페이지 감지: "${errorIndicator}"`,
                    isErrorPage: true,
                };
            }

            // 스크롤하여 지연 로딩 이미지 트리거
            await this.autoScroll(page);

            // 이미지 수집
            const images = await this.extractImages(page);
            const productInfo = await this.extractProductInfo(page);

            await browser.close();

            console.log(`[BrandStore:Puppeteer] ✅ ${images.length}개 이미지 수집`);

            return {
                success: images.length > 0,
                images,
                productInfo,
                usedStrategy: 'puppeteer-direct',
                timing: Date.now() - startTime,
            };

        } catch (error) {
            console.error(`[BrandStore:Puppeteer] ❌ 오류:`, (error as Error).message);
            return {
                success: false,
                images: [],
                usedStrategy: 'puppeteer-direct',
                timing: Date.now() - startTime,
                error: (error as Error).message,
            };
        }
    }

    /**
     * OG 메타 태그 폴백 전략
     * Puppeteer 실패 시 최소 1개 이미지 확보
     */
    private async ogMetaStrategy(url: string, options?: CollectionOptions): Promise<CollectionResult> {
        const startTime = Date.now();

        try {
            console.log(`[BrandStore:OGMeta] 📋 OG 태그 추출 중...`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                },
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
                    usedStrategy: 'mobile-og-meta',
                    timing: Date.now() - startTime,
                    error: `에러 페이지 감지: "${errorIndicator}"`,
                    isErrorPage: true,
                };
            }

            // OG 이미지 추출
            const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
            const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);

            const images: ProductImage[] = [];
            if (ogImageMatch?.[1]) {
                images.push({
                    url: ogImageMatch[1],
                    type: 'main',
                });
            }

            const productInfo: ProductInfo | undefined = ogTitleMatch?.[1]
                ? { name: ogTitleMatch[1] }
                : undefined;

            console.log(`[BrandStore:OGMeta] ✅ ${images.length}개 이미지 수집`);

            return {
                success: images.length > 0,
                images,
                productInfo,
                usedStrategy: 'mobile-og-meta',
                timing: Date.now() - startTime,
            };

        } catch (error) {
            console.error(`[BrandStore:OGMeta] ❌ 오류:`, (error as Error).message);
            return {
                success: false,
                images: [],
                usedStrategy: 'mobile-og-meta',
                timing: Date.now() - startTime,
                error: (error as Error).message,
            };
        }
    }

    /**
     * 페이지에서 이미지 추출 (강화된 버전)
     */
    private async extractImages(page: import('puppeteer').Page): Promise<ProductImage[]> {
        // 브라우저 컨텍스트에서 직접 이미지 수집 (sourceAssembler.ts 방식)
        const extractedData = await page.evaluate(() => {
            const images: Array<{ url: string; type: string }> = [];
            const seenUrls = new Set<string>();

            // 네이버 쇼핑 이미지 도메인 패턴
            const naverShoppingDomains = [
                'shop-phinf.pstatic.net',
                'pstatic.net',
                'naver.net',
                'brand.naver.com'
            ];

            // UI 요소 필터링
            const isUIElement = (url: string): boolean => {
                const lower = url.toLowerCase();
                return (
                    lower.includes('/icon/') ||
                    lower.includes('/logo/') ||
                    lower.includes('logo_') ||
                    lower.includes('favicon') ||
                    lower.includes('sprite') ||
                    lower.includes('blank.gif') ||
                    lower.includes('loading') ||
                    lower.includes('spinner') ||
                    lower.includes('banner') ||
                    lower.includes('promo') ||
                    lower.includes('/ads/') ||
                    lower.includes('npay') ||
                    lower.includes('naverpay') ||
                    lower.includes('placeholder') ||
                    lower.includes('ico_') ||
                    lower.includes('_ico') ||
                    lower.includes('btn_') ||
                    lower.includes('/gnb/') ||
                    // ✅ [2026-02-08] 광고/다른 상품 이미지 제외
                    lower.includes('searchad-phinf') ||
                    (lower.includes('shopping-phinf') && lower.includes('/main_')) ||
                    lower.includes('video-phinf') ||
                    lower.includes('/common/') && (lower.includes('.svg') || lower.includes('.gif'))
                );
            };

            // 원본 이미지 URL로 변환
            const getOriginalUrl = (url: string): string => {
                if (url.includes('pstatic.net') || url.includes('naver.net')) {
                    // ✅ [2026-02-08] checkout.phinf / image.nmv는 type 파라미터 미지원 (404 방지)
                    if (url.includes('checkout.phinf') || url.includes('image.nmv')) {
                        return url.replace(/\?type=.*$/, '');
                    }
                    // type 파라미터를 고화질로 변경
                    if (url.includes('type=')) {
                        url = url.replace(/type=f\d+/gi, 'type=f640');
                        url = url.replace(/type=w\d+/gi, 'type=w640');
                        url = url.replace(/type=m\d+/gi, 'type=w640');
                        url = url.replace(/type=s\d+/gi, 'type=w640');
                    }
                }
                return url;
            };

            // 모든 이미지 태그에서 수집
            const allImages = document.querySelectorAll('img');

            allImages.forEach((img) => {
                // 다양한 소스에서 URL 추출
                const src =
                    img.getAttribute('data-original') ||
                    img.getAttribute('data-src-original') ||
                    img.getAttribute('data-origin') ||
                    img.src ||
                    img.getAttribute('data-src') ||
                    img.getAttribute('data-lazy-src') ||
                    '';

                if (!src || !src.startsWith('http')) return;

                // UI 요소 필터링
                if (isUIElement(src)) return;

                // 네이버 쇼핑 이미지인지 확인
                const isNaverShoppingImage = naverShoppingDomains.some(domain => src.includes(domain));

                // 일반 이미지 확장자 확인
                const hasImageExtension = /\.(jpg|jpeg|png|webp|gif)/i.test(src);

                // 네이버 쇼핑 이미지이거나 일반 상품 이미지 포함
                if (!isNaverShoppingImage && !hasImageExtension) return;

                // 원본 URL로 변환
                const originalUrl = getOriginalUrl(src);

                // 중복 체크
                const normalizedUrl = originalUrl.replace(/[?&](type|size|w|h|quality)=[^&]*/gi, '').replace(/\?$/, '');
                if (seenUrls.has(normalizedUrl)) return;
                seenUrls.add(normalizedUrl);

                // 이미지 타입 분류
                let type = 'gallery';

                // 부모 요소 확인으로 타입 분류
                let parent = img.parentElement;
                let depth = 0;
                while (parent && depth < 5) {
                    const className = parent.className?.toLowerCase() || '';
                    const id = parent.id?.toLowerCase() || '';

                    if (className.includes('main') || className.includes('hero') || className.includes('represent')) {
                        type = 'main';
                        break;
                    }
                    if (className.includes('detail') || className.includes('description') || id.includes('detail')) {
                        type = 'detail';
                        break;
                    }
                    if (className.includes('review') || className.includes('photo') || id.includes('review')) {
                        type = 'review';
                        break;
                    }

                    parent = parent.parentElement;
                    depth++;
                }

                // 첫 번째 이미지는 메인으로 설정
                if (images.length === 0) {
                    type = 'main';
                }

                images.push({ url: originalUrl, type });
            });

            return images;
        });

        return extractedData.map(img => ({
            url: img.url,
            type: img.type as ProductImage['type'],
        }));
    }

    /**
     * 제품 정보 추출
     */
    private async extractProductInfo(page: import('puppeteer').Page): Promise<ProductInfo | undefined> {
        try {
            let name = '';
            let price = '';

            // 제품명 추출
            for (const selector of BRAND_STORE_SELECTORS.productName) {
                try {
                    name = await page.$eval(selector, (el) => el.textContent?.trim() || '');
                    if (name) break;
                } catch { /* 선택자 실패 무시 */ }
            }

            // 가격 추출
            for (const selector of BRAND_STORE_SELECTORS.price) {
                try {
                    price = await page.$eval(selector, (el) => el.textContent?.trim() || '');
                    if (price) break;
                } catch { /* 선택자 실패 무시 */ }
            }

            if (name || price) {
                return { name, price };
            }
        } catch { /* 무시 */ }

        return undefined;
    }

    /**
     * 자동 스크롤 (지연 로딩 이미지 트리거)
     */
    private async autoScroll(page: import('puppeteer').Page): Promise<void> {
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const distance = 300;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight || totalHeight > 5000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        // 이미지 로딩 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    /**
     * 유효한 이미지 URL인지 확인
     */
    private isValidImageUrl(url: string): boolean {
        if (!url) return false;
        if (url.startsWith('data:')) return false;
        if (url.includes('placeholder')) return false;
        if (url.includes('loading')) return false;
        if (url.includes('spinner')) return false;
        if (url.includes('icon') && url.includes('.svg')) return false;
        if (url.includes('logo')) return false;

        // 최소 크기 체크 (URL에 크기 정보가 있는 경우)
        const sizeMatch = url.match(/(\d+)x(\d+)/);
        if (sizeMatch) {
            const width = parseInt(sizeMatch[1]);
            const height = parseInt(sizeMatch[2]);
            if (width < 100 || height < 100) return false;
        }

        return true;
    }
}
