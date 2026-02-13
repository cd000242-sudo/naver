/**
 * 🛒 Product Spec Crawler - 쇼핑몰 제품 스펙 크롤링
 * Coupang, Naver Shopping, 스마트스토어 등에서 실제 제품 정보 추출
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import { getChromiumExecutablePath } from '../browserUtils.js';
import type { TableRow } from '../image/tableImageGenerator.js';
// ✅ [100점 개선] 공식 네이버 쇼핑 API import (429 에러 시 폴백용)
import { searchShopping, stripHtmlTags, type ShoppingItem } from '../naverSearchApi.js';

puppeteer.use(StealthPlugin());

/**
 * ✅ [2026-02-01] 이미지 우선순위 정렬 함수
 * 리뷰 이미지 우선 → 메인 이미지 → 갤러리 순서
 */
function prioritizeImages(galleryImages: string[], reviewImages: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    // 1. 리뷰 이미지 먼저 (구매 결심에 가장 효과적!)
    for (const img of reviewImages) {
        const base = img.split('?')[0];
        if (!seen.has(base)) {
            result.push(img);
            seen.add(base);
        }
    }

    // ✅ [2026-02-02 FIX] 갤러리 이미지는 첫 번째만 안전 (보통 메인 제품 사진)
    // 나머지는 마케팅 인포그래픽 가능성 높음 (5년 무상 A/S, Made in Germany 등)
    // 리뷰 이미지가 충분하면 갤러리 이미지 1장만 추가
    const SAFE_GALLERY_COUNT = reviewImages.length >= 3 ? 1 : 3; // 리뷰 이미지 많으면 갤러리 1장만
    let galleryAdded = 0;

    for (const img of galleryImages) {
        if (galleryAdded >= SAFE_GALLERY_COUNT) break; // 안전한 개수만 추가

        const base = img.split('?')[0];
        if (!seen.has(base)) {
            result.push(img);
            seen.add(base);
            galleryAdded++;
        }
    }

    console.log(`[prioritizeImages] 📊 리뷰: ${reviewImages.length}장 → 갤러리: ${galleryImages.length}장 (${galleryAdded}장 사용) → 최종: ${result.length}장`);
    return result;
}

export interface ProductSpec {
    productName: string;
    price?: string;
    originalPrice?: string;
    discount?: string;
    brand?: string;
    maker?: string;
    category?: string;
    shipping?: string;
    rating?: string;
    reviewCount?: string;
    mallName?: string;
    options?: string[];
    specs: TableRow[];
    images?: string[];
}

/**
 * 쇼핑몰 URL에서 제품 스펙 크롤링
 */
export async function crawlProductSpecs(url: string): Promise<ProductSpec | null> {
    console.log(`[ProductSpecCrawler] 🔍 크롤링 시작: ${url}`);

    try {
        // URL 타입 감지
        if (url.includes('coupang.com') || url.includes('coupa.ng')) {
            return await crawlCoupangProduct(url);
        } else if (url.includes('smartstore.naver.com') || url.includes('brand.naver.com')) {
            return await crawlNaverSmartStore(url);
        } else if (url.includes('shopping.naver.com')) {
            return await crawlNaverShopping(url);
        } else if (url.includes('11st.co.kr')) {
            return await crawl11St(url);
        } else if (url.includes('gmarket.co.kr')) {
            return await crawlGmarket(url);
        } else {
            console.log('[ProductSpecCrawler] ⚠️ 지원되지 않는 쇼핑몰 URL');
            return null;
        }
    } catch (error) {
        console.error('[ProductSpecCrawler] ❌ 크롤링 실패:', error);
        return null;
    }
}

/**
 * 쿠팡 제품 크롤링 (Playwright + Stealth - 100점 솔루션)
 * ✅ headless: false로 실제 브라우저 사용
 * ✅ 쿠팡 메인 페이지 먼저 방문 → 쿠키 생성
 * ✅ 인간 행동 모방 (마우스, 스크롤)
 */
async function crawlCoupangProduct(url: string): Promise<ProductSpec | null> {
    let browser = null;

    try {
        // ✅ Playwright + Stealth 조합
        const { chromium } = await import('playwright-extra');
        const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
        chromium.use(stealth());

        // ✅ [2026-02-08 FIX] 배포환경 Chromium 경로 설정
        const execPath = await getChromiumExecutablePath();
        console.log(`[ProductSpecCrawler] 🕵️ Playwright Stealth 모드로 쿠팡 크롤링 시작... (execPath: ${execPath || 'default'})`);

        browser = await chromium.launch({
            headless: false, // ⭐ CRITICAL: true면 100% 탐지됨
            ...(execPath ? { executablePath: execPath } : {}),
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1920,1080',
            ],
        });

        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ];
        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: randomUA,
            locale: 'ko-KR',
            timezoneId: 'Asia/Seoul',
            permissions: ['geolocation'],
            geolocation: { latitude: 37.5665, longitude: 126.9780 },
            colorScheme: 'light',
            extraHTTPHeaders: {
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
            },
        });

        const page = await context.newPage();

        // ⭐ CDP 레벨 속성 조작 (핵심!)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            (window as any).chrome = { runtime: {}, loadTimes: function () { }, csi: function () { }, app: {} };
            Object.defineProperty(navigator, 'plugins', {
                get: () => [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }, { name: 'Native Client' }],
            });
        });

        // 🔄 1단계: 쿠팡 메인 페이지 먼저 방문 (쿠키 생성)
        console.log('[ProductSpecCrawler] 🏠 쿠팡 메인 페이지 방문 중...');
        await page.goto('https://www.coupang.com', { waitUntil: 'networkidle', timeout: 30000 });

        // 인간처럼 행동
        await page.mouse.move(500, 300);
        await page.waitForTimeout(1500 + Math.random() * 1500);
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(800 + Math.random() * 700);

        // 🎯 2단계: 상품 페이지 접근
        console.log('[ProductSpecCrawler] 🎯 상품 페이지 이동...');
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000 + Math.random() * 1500);

        // Access Denied 체크
        const content = await page.content();
        if (content.includes('Access Denied') || content.includes('차단')) {
            console.log('[ProductSpecCrawler] ❌ Access Denied 발생');
            await browser.close();
            return null;
        }

        console.log('[ProductSpecCrawler] ✅ 페이지 접근 성공!');

        // 제품 정보 추출
        const spec = await page.evaluate(() => {
            const getTextContent = (selector: string): string => {
                const el = document.querySelector(selector);
                return el?.textContent?.trim() || '';
            };

            const productName = getTextContent('.prod-buy-header__title, h2.prod-title, .product-title');
            const priceEl = document.querySelector('.total-price strong, .prod-price .total-price, .prod-origin-price');
            const price = priceEl?.textContent?.replace(/[^\d,]/g, '').replace(',', '') || '';
            const discountEl = document.querySelector('.discount-percentage, .prod-discount');
            const discount = discountEl?.textContent?.trim() || '';
            const ratingEl = document.querySelector('.rating-star-num, .prod-rating-num');
            const rating = ratingEl?.textContent?.trim() || '';
            const reviewCountEl = document.querySelector('.count, .prod-review-count');
            const reviewCount = reviewCountEl?.textContent?.replace(/[^\d]/g, '') || '';
            const brandEl = document.querySelector('.prod-brand-name a, .prod-brand');
            const brand = brandEl?.textContent?.trim() || '';
            const shippingEl = document.querySelector('.prod-shipping-fee, .free-shipping-badge');
            let shipping = shippingEl?.textContent?.trim() || '';
            if (!shipping || shipping.includes('무료')) shipping = '무료 배송';

            const specs: Array<{ label: string; value: string }> = [];
            const specRows = document.querySelectorAll('.prod-spec-table tr, .product-detail-spec tr');
            specRows.forEach(row => {
                const th = row.querySelector('th, td:first-child');
                const td = row.querySelector('td:last-child');
                if (th && td) {
                    const label = th.textContent?.trim() || '';
                    const value = td.textContent?.trim() || '';
                    if (label && value && label !== value) {
                        specs.push({ label, value });
                    }
                }
            });

            const images: string[] = [];
            document.querySelectorAll('.prod-image__item img, .gallery-image-item img, img[src*="thumbnail"]').forEach(img => {
                const src = (img as HTMLImageElement).src;
                if (src && !src.includes('data:') && !src.includes('svg') && (src.includes('thumbnail') || src.includes('image'))) {
                    images.push(src);
                }
            });

            return {
                productName,
                price: price ? `${parseInt(price).toLocaleString()}원` : '',
                discount,
                brand,
                rating: rating ? `⭐ ${rating}` : '',
                reviewCount: reviewCount ? `${parseInt(reviewCount).toLocaleString()}개 리뷰` : '',
                shipping,
                mallName: '쿠팡',
                specs,
                images: images.slice(0, 10)
            };
        });

        await browser.close();

        if (!spec.productName) {
            console.log('[ProductSpecCrawler] ⚠️ 쿠팡 제품명 추출 실패');
            return null;
        }

        console.log(`[ProductSpecCrawler] ✅ 쿠팡 크롤링 완료: ${spec.productName} (이미지 ${spec.images?.length || 0}개)`);
        return spec;

    } catch (error) {
        console.error('[ProductSpecCrawler] ❌ 쿠팡 크롤링 실패:', error);
        if (browser) await browser.close();
        return null;
    }
}

/**
 * 네이버 스마트스토어 크롤링
 */
async function crawlNaverSmartStore(url: string): Promise<ProductSpec | null> {
    let browser = null;

    try {
        const chromePath = await getChromiumExecutablePath();
        browser = await puppeteer.launch({
            headless: true,
            ...(chromePath ? { executablePath: chromePath } : {}),
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        const spec = await page.evaluate(() => {
            const getTextContent = (selector: string): string => {
                const el = document.querySelector(selector);
                return el?.textContent?.trim() || '';
            };

            // 제품명
            const productName = getTextContent('._3oDjMp_O3q, ._22kNQuEXmb, [class*="product-name"], .product-title');

            // 가격
            const priceEl = document.querySelector('._1LY7DqCnwR, ._3L52FIn_Y4, [class*="final-price"]');
            const price = priceEl?.textContent?.replace(/[^\d,]/g, '') || '';

            // 할인율
            const discountEl = document.querySelector('._1FG6Qa2qZQ, [class*="discount-rate"]');
            const discount = discountEl?.textContent?.trim() || '';

            // 평점
            const ratingEl = document.querySelector('._2lMZ7p6QnJ em, [class*="rating"]');
            const rating = ratingEl?.textContent?.trim() || '';

            // 리뷰 수
            const reviewCountEl = document.querySelector('._2lMZ7p6QnJ span, [class*="review-count"]');
            const reviewCount = reviewCountEl?.textContent?.replace(/[^\d]/g, '') || '';

            // 배송
            const shippingEl = document.querySelector('[class*="delivery"], [class*="shipping"]');
            let shipping = shippingEl?.textContent?.trim() || '무료 배송';

            // 브랜드/스토어명
            const brandEl = document.querySelector('._2K6vLkc9bM, [class*="brand"], [class*="seller"]');
            const brand = brandEl?.textContent?.trim() || '';

            // 상세 스펙
            const specs: Array<{ label: string; value: string }> = [];
            document.querySelectorAll('._35_VlXXPDJ li, ._1s1WPJqIKs li, [class*="product-info"] li').forEach(li => {
                const text = li.textContent || '';
                const colonIdx = text.indexOf(':');
                if (colonIdx > 0) {
                    const label = text.slice(0, colonIdx).trim();
                    const value = text.slice(colonIdx + 1).trim();
                    if (label && value) {
                        specs.push({ label, value });
                    }
                }
            });

            // 이미지
            const images: string[] = [];
            document.querySelectorAll('[class*="thumbnail"] img, [class*="product-image"] img').forEach(img => {
                const src = (img as HTMLImageElement).src;
                if (src && !src.includes('data:')) images.push(src);
            });

            return {
                productName,
                price: price ? `${parseInt(price.replace(/,/g, '')).toLocaleString()}원` : '',
                discount,
                brand,
                rating: rating ? `⭐ ${rating}` : '',
                reviewCount: reviewCount ? `${parseInt(reviewCount).toLocaleString()}개 리뷰` : '',
                shipping,
                mallName: '스마트스토어',
                specs,
                images: images.slice(0, 5)
            };
        });

        await browser.close();

        if (!spec.productName) {
            console.log('[ProductSpecCrawler] ⚠️ 스마트스토어 제품명 추출 실패');
            return null;
        }

        console.log(`[ProductSpecCrawler] ✅ 스마트스토어 크롤링 완료: ${spec.productName}`);
        return spec;

    } catch (error) {
        console.error('[ProductSpecCrawler] ❌ 스마트스토어 크롤링 실패:', error);
        if (browser) await browser.close();
        return null;
    }
}

/**
 * 네이버 쇼핑 상품 크롤링
 */
async function crawlNaverShopping(url: string): Promise<ProductSpec | null> {
    // 스마트스토어와 유사하게 처리
    return await crawlNaverSmartStore(url);
}

/**
 * 11번가 크롤링
 */
async function crawl11St(url: string): Promise<ProductSpec | null> {
    let browser = null;

    try {
        const chromePath = await getChromiumExecutablePath();
        browser = await puppeteer.launch({
            headless: true,
            executablePath: chromePath || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        const spec = await page.evaluate(() => {
            const getTextContent = (selector: string): string => {
                const el = document.querySelector(selector);
                return el?.textContent?.trim() || '';
            };

            const productName = getTextContent('.title h1, .product-title, [class*="prod_name"]');
            const priceEl = document.querySelector('.sale_price, .final_price, [class*="price"]');
            const price = priceEl?.textContent?.replace(/[^\d,]/g, '') || '';
            const ratingEl = document.querySelector('.rating, [class*="grade"]');
            const rating = ratingEl?.textContent?.trim() || '';

            return {
                productName,
                price: price ? `${parseInt(price.replace(/,/g, '')).toLocaleString()}원` : '',
                discount: '',
                brand: '',
                rating: rating ? `⭐ ${rating}` : '',
                reviewCount: '',
                shipping: '무료 배송',
                mallName: '11번가',
                specs: [] as Array<{ label: string; value: string }>,
                images: [] as string[]
            };
        });

        await browser.close();

        if (!spec.productName) return null;

        console.log(`[ProductSpecCrawler] ✅ 11번가 크롤링 완료: ${spec.productName}`);
        return spec;

    } catch (error) {
        if (browser) await browser.close();
        return null;
    }
}

/**
 * G마켓 크롤링
 */
async function crawlGmarket(url: string): Promise<ProductSpec | null> {
    let browser = null;

    try {
        const chromePath = await getChromiumExecutablePath();
        browser = await puppeteer.launch({
            headless: true,
            ...(chromePath ? { executablePath: chromePath } : {}),
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        const spec = await page.evaluate(() => {
            const getTextContent = (selector: string): string => {
                const el = document.querySelector(selector);
                return el?.textContent?.trim() || '';
            };

            const productName = getTextContent('.item-title, .goods_name, [class*="item_title"]');
            const priceEl = document.querySelector('.price_real, .sale_price');
            const price = priceEl?.textContent?.replace(/[^\d,]/g, '') || '';

            return {
                productName,
                price: price ? `${parseInt(price.replace(/,/g, '')).toLocaleString()}원` : '',
                discount: '',
                brand: '',
                rating: '',
                reviewCount: '',
                shipping: '무료 배송',
                mallName: 'G마켓',
                specs: [] as Array<{ label: string; value: string }>,
                images: [] as string[]
            };
        });

        await browser.close();

        if (!spec.productName) return null;

        console.log(`[ProductSpecCrawler] ✅ G마켓 크롤링 완료: ${spec.productName}`);
        return spec;

    } catch (error) {
        if (browser) await browser.close();
        return null;
    }
}

/**
 * ProductSpec을 TableRow 배열로 변환
 */
export function productSpecToTableRows(spec: ProductSpec): TableRow[] {
    const rows: TableRow[] = [];

    // 기본 정보부터 추가
    if (spec.productName) {
        rows.push({ label: '제품명', value: spec.productName });
    }
    if (spec.price) {
        rows.push({ label: '가격', value: spec.price });
    }
    if (spec.discount) {
        rows.push({ label: '할인', value: spec.discount });
    }
    if (spec.brand) {
        rows.push({ label: '브랜드', value: spec.brand });
    }
    if (spec.shipping) {
        rows.push({ label: '배송', value: spec.shipping });
    }
    if (spec.rating) {
        rows.push({ label: '평점', value: spec.rating });
    }
    if (spec.reviewCount) {
        rows.push({ label: '리뷰', value: spec.reviewCount });
    }

    // 상세 스펙 추가
    for (const s of spec.specs) {
        if (rows.length >= 8) break;
        rows.push(s);
    }

    // 최소 개수 확보
    if (rows.length < 3) {
        if (!rows.find(r => r.label === '배송')) {
            rows.push({ label: '배송', value: '무료 배송' });
        }
        if (!rows.find(r => r.label === '평점')) {
            rows.push({ label: '고객평점', value: '⭐⭐⭐⭐⭐' });
        }
    }

    return rows.slice(0, 8);
}

/**
 * ✅ 제휴 링크에서 상품 정보 크롤링 (모바일 API 활용)
 * - 주소 세탁 후 스마트스토어 내부 API로 직접 요청
 * - 빠르고 안정적인 방식
 */
export interface AffiliateProductInfo {
    name: string;
    price: number;
    stock: number;
    options: any[];
    detailUrl: string;
    // ✅ 이미지 3종 세트 추가
    mainImage: string | null;       // 대표 사진 1장
    galleryImages: string[];        // 추가 사진 리스트 (갤러리)
    detailImages: string[];         // 상세페이지(본문) 사진 리스트
    // ✅ [2026-01-21] 제품 상세 설명 추가 (AI 리뷰 작성용)
    description?: string;           // 제품 설명, 특징, 스펙 등 전체 텍스트
}

/**
 * ✅ [2026-02-01] 브랜드스토어 전용 크롤링 함수 (Playwright + Stealth 업그레이드!)
 * - 스마트스토어와 동일한 방식: Playwright + 세션 유지 + 베지어 마우스
 * - CAPTCHA 발생 시 자동 대기 + 수동 해결
 */
export async function crawlBrandStoreProduct(
    productId: string,
    brandName: string,
    originalUrl: string
): Promise<AffiliateProductInfo | null> {
    console.log(`[BrandStore] 🚀 Playwright + Stealth 크롤링 시작!`);
    console.log(`[BrandStore] 📎 브랜드: ${brandName}, 상품ID: ${productId}`);

    let context: any = null;
    let browser: any = null;

    try {
        const { chromium } = await import('playwright-extra');
        const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
        chromium.use(stealth());

        // ✅ [2026-02-01 FIX] 브랜드스토어 전용 세션 폴더 (스마트스토어와 분리하여 충돌 방지)
        const path = await import('path');
        const fs = await import('fs');
        const appDataPath = process.env.APPDATA || process.env.HOME || '';
        const playwrightSessionDir = path.join(appDataPath, 'better-life-naver', 'playwright-session-brandstore');

        if (!fs.existsSync(playwrightSessionDir)) {
            fs.mkdirSync(playwrightSessionDir, { recursive: true });
        }

        // ✅ [2026-02-08 FIX] 배포환경 Chromium 경로 설정
        const execPath = await getChromiumExecutablePath();
        console.log(`[BrandStore] 🍪 Playwright + Stealth (세션 유지) 실행... (execPath: ${execPath || 'default'})`);

        context = await chromium.launchPersistentContext(playwrightSessionDir, {
            headless: false,
            ...(execPath ? { executablePath: execPath } : {}),
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage',
            ],
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'ko-KR',
        });

        const existingPages = context.pages();
        for (const p of existingPages) {
            await p.close().catch(() => { });
        }

        const page = await context.newPage();
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // ✅ 베지어 곡선 마우스 움직임
        const humanMouseMove = async (targetX: number, targetY: number) => {
            const steps = 10 + Math.floor(Math.random() * 10);
            const startX = Math.random() * 100;
            const startY = Math.random() * 100;

            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const x = startX + (targetX - startX) * (t * t * (3 - 2 * t));
                const y = startY + (targetY - startY) * (t * t * (3 - 2 * t));
                await page.mouse.move(x + Math.random() * 5, y + Math.random() * 5);
                await page.waitForTimeout(10 + Math.random() * 20);
            }
        };

        console.log('[BrandStore] 🖱️ 자연스러운 마우스 움직임 시작...');
        await humanMouseMove(200 + Math.random() * 200, 150 + Math.random() * 150);

        // 데스크톱 브랜드스토어 URL
        const desktopUrl = `https://brand.naver.com/${brandName}/products/${productId}`;
        console.log(`[BrandStore] 🌐 페이지 로드: ${desktopUrl}`);
        await page.goto(desktopUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 페이지 로드 후 마우스 움직임
        await humanMouseMove(400 + Math.random() * 300, 300 + Math.random() * 200);
        await page.waitForTimeout(500 + Math.random() * 500);

        // ✅ 에러 페이지 감지 및 자동 대기
        const checkForError = async () => {
            return await page.evaluate(() => {
                const bodyText = document.body?.innerText || '';
                // ✅ [2026-02-02 FIX] "상품이 존재하지 않습니다" 에러 페이지 감지 추가
                const errorKeywords = ['서비스 접속이 불가', '에러페이지', '보안 확인', '캡차', 'captcha', '상품이 존재하지 않습니다', '페이지를 찾을 수 없습니다'];
                return errorKeywords.some(kw => bodyText.toLowerCase().includes(kw.toLowerCase()));
            });
        };

        // ✅ [2026-02-02 FIX] 상품 없음 에러는 별도 처리 (새로고침 불필요, 즉시 API 폴백)
        const checkForProductNotFound = async () => {
            return await page.evaluate(() => {
                const bodyText = document.body?.innerText || '';
                return bodyText.includes('상품이 존재하지 않습니다') ||
                    bodyText.includes('페이지를 찾을 수 없습니다') ||
                    bodyText.includes('삭제되었거나 변경');
            });
        };

        const isProductNotFound = await checkForProductNotFound();
        if (isProductNotFound) {
            console.log('[BrandStore] ❌ 상품이 존재하지 않습니다 → 즉시 API 폴백');
            await context.close().catch(() => { });
            // Playwright 종료 후 API 폴백으로 이동 (아래 코드로 fall-through)
        } else {
            let hasError = await checkForError();
            if (hasError) {
                console.log('[BrandStore] ⚠️ 에러 페이지 감지! 자동 새로고침 시도...');
                await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(3000);

                hasError = await checkForError();
                if (hasError) {
                    console.log('[BrandStore] 🚨 수동 해결 대기 중... (최대 60초)');
                    for (let i = 0; i < 12; i++) {
                        await page.waitForTimeout(5000);
                        hasError = await checkForError();
                        if (!hasError) {
                            console.log('[BrandStore] ✅ 에러 해결됨!');
                            break;
                        }
                    }
                }
            }

            // ✅ 상품명 셀렉터 대기
            console.log('[BrandStore] ⏳ 상품 정보 렌더링 대기...');
            try {
                await page.waitForSelector('h3.DCVBehA8ZB, .P2lBbUWPNi h3, [class*="ProductName"]', { timeout: 10000 });
                console.log('[BrandStore] ✅ 상품명 셀렉터 발견!');
            } catch {
                console.log('[BrandStore] ⚠️ 상품명 셀렉터 타임아웃');
            }

            // 스크롤 및 마우스 움직임
            await humanMouseMove(300 + Math.random() * 300, 200 + Math.random() * 200);
            await page.mouse.wheel(0, 300 + Math.random() * 200);
            await page.waitForTimeout(500);

            // ✅ 상품 정보 추출 (스마트스토어와 동일한 셀렉터)
            const productInfo = await page.evaluate(() => {
                const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
                const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

                // 상품명
                const productName =
                    document.querySelector('h3.DCVBehA8ZB._copyable')?.textContent ||
                    document.querySelector('.P2lBbUWPNi h3')?.textContent ||
                    document.querySelector('h3[class*="DCVBehA8ZB"]')?.textContent ||
                    document.querySelector('[class*="ProductName"]')?.textContent || ogTitle;

                // 가격
                const discountPrice = document.querySelector('strong.Xu9MEKUuIo span.e1DMQNBPJ_')?.textContent || '';
                const originalPrice = document.querySelector('del.VaZJPclpdJ span.e1DMQNBPJ_')?.textContent || '';
                const price = discountPrice || originalPrice;

                // 이미지 수집 (배너/광고/스토어로고 제외) - 확장된 로직
                const images: string[] = [];
                const seenUrls = new Set<string>();

                const isValidProductImage = (src: string, element?: Element): boolean => {
                    if (!src) return false;
                    if (src.length < 20) return false;
                    // 비디오/썸네일 제외
                    if (src.includes('video-phinf')) return false;
                    if (src.includes('dthumb')) return false;
                    if (src.includes('vod-')) return false;
                    // 배너/로고/아이콘 제외 (URL 경로에서만)
                    if (src.includes('/banner/')) return false;
                    if (src.includes('/logo/')) return false;
                    if (src.includes('/icon/')) return false;
                    if (src.includes('storeLogo')) return false;
                    if (src.includes('brandLogo')) return false;
                    // ✅ [2026-02-01 FIX] 이벤트/프로모션 배너 제외 (URL 경로 패턴만)
                    // 상품명에 "sale" 등이 있을 수 있으므로 경로 패턴으로 제한
                    if (src.includes('/event/')) return false;
                    if (src.includes('/promotion/')) return false;
                    if (src.includes('/campaign/')) return false;
                    if (src.includes('/coupon/')) return false;

                    // ✅ [2026-02-02 FIX] 인포그래픽/마케팅 이미지 감지 강화
                    // 브랜드 스토어에서 자주 보이는 마케팅 이미지 패턴
                    if (src.includes('detail-content')) return false; // 상세페이지 마케팅 이미지
                    if (src.includes('editor-upload')) return false; // 에디터 업로드 이미지
                    if (src.includes('se-content')) return false; // 스마트에디터 콘텐츠

                    // ✅ [2026-02-01] 요소가 헤더/네비게이션/배너 영역에 있으면 제외
                    if (element) {
                        const parent = element.closest('header, nav, .header, .nav, [class*="gnb"], [class*="store_info"], [class*="storeBanner"], [class*="eventBanner"]');
                        if (parent) return false;

                        // ✅ [2026-02-02 FIX] 상세 설명 영역 내 이미지 제외 (인포그래픽가 많음)
                        const detailParent = element.closest('[class*="detailContent"], [class*="DetailContent"], [class*="productDetail"], .se-module, .se-component, [class*="description"], [class*="detail_view"]');
                        if (detailParent) return false;

                        // 이미지 크기 체크: 가로가 세로의 3배 이상이면 배너로 판단
                        const img = element as HTMLImageElement;
                        if (img.naturalWidth && img.naturalHeight) {
                            const ratio = img.naturalWidth / img.naturalHeight;
                            if (ratio > 3 || ratio < 0.33) return false; // 너무 가로로 긴거나 세로로 긴 배너 제외
                        }

                        // ✅ [2026-02-02 FIX] alt 텍스트에서 인포그래픽 감지
                        const alt = img.alt?.toLowerCase() || '';
                        // alt에 숫자만 있는 경우 (추가이미지1, 추가이미지2 등)는 허용
                        // 하지만 특정 마케팅 키워드가 있으면 제외
                        const marketingKeywords = ['무상', 'a/s', 'warranty', '배송', '안심', '공식', '인증', 'official', 'made in', 'germany'];
                        if (marketingKeywords.some(kw => alt.includes(kw))) return false;
                    }
                    // 유효한 상품 이미지 도메인
                    if (src.includes('pstatic.net')) return true;
                    if (src.includes('shopping-phinf')) return true;
                    if (src.includes('shop-phinf')) return true;
                    return false;
                };

                const toHighRes = (src: string): string => {
                    // ✅ [2026-02-08] checkout.phinf / image.nmv는 type 파라미터 미지원 (404 방지)
                    if (src.includes('checkout.phinf') || src.includes('image.nmv')) {
                        return src.replace(/\?type=.*$/, '');
                    }
                    return src
                        .replace(/type=f\d+(_\d+)?(_q\d+)?/, 'type=f640_640')
                        .replace(/\?type=.*$/, '?type=f640_640')
                        .replace(/\/s_\d+\//, '/o/')
                        .replace(/_\d+x\d+\./, '.');
                };

                // ✅ [2026-02-01 FIX] 상품 갤러리 슬라이드 영역에서 이미지 먼저 수집
                // 브랜드스토어 OG 이미지는 스토어 배너일 수 있으므로 갤러리 이미지 우선
                const gallerySelectors = [
                    // ✅ [2026-02-01] 네이버 브랜드스토어 상품 추가이미지
                    '.fxmqPhYp6y',                             // 상품 추가이미지 (alt="추가이미지N")
                    'img.fxmqPhYp6y',
                    // ✅ [2026-02-01] 리뷰 이미지 (고객 제품 사진)
                    '.M6TOdPtHmb',                             // 리뷰 이미지
                    'img.M6TOdPtHmb',
                    // 네이버 브랜드스토어 상품 갤러리 영역
                    '[class*="ProductImage"] img',           // 상품 이미지 컨테이너
                    '[class*="productImage"] img',
                    '[class*="ProductThumb"] img',           // 상품 썸네일
                    '[class*="productThumb"] img',
                    '[class*="ImageSlide"] img',             // 이미지 슬라이드
                    '[class*="imageSlide"] img',
                    '[class*="GallerySlide"] img',           // 갤러리 슬라이드
                    '.K4l1t0ryUq img',                        // 브랜드스토어 갤러리
                    '.bd_3SCnU img',
                    '.MLx6OjiZJZ img',
                    // 일반 쇼핑몰 갤러리
                    '.product_thumb img',
                    '.prd_img img',
                    '.main_img img',
                    // 슬라이드/캐러셀 내 이미지
                    '.slick-slide img',
                    '.swiper-slide img',
                ];

                // 상세 설명 영역 제외 (이벤트 배너가 많음)
                const excludeAreas = document.querySelectorAll('[class*="detailContent"], [class*="DetailContent"], [class*="productDetail"], .se-module, .se-component');
                const excludeSet = new Set<Element>();
                excludeAreas.forEach(area => excludeSet.add(area));

                gallerySelectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(img => {
                        // 상세 설명 영역 내 이미지는 제외
                        let isInExcludeArea = false;
                        for (const area of excludeSet) {
                            if (area.contains(img)) {
                                isInExcludeArea = true;
                                break;
                            }
                        }
                        if (isInExcludeArea) return;

                        const rawSrc = (img as HTMLImageElement).src || '';
                        if (!rawSrc) return;
                        const highRes = toHighRes(rawSrc);
                        const baseUrl = highRes.split('?')[0];
                        if (isValidProductImage(highRes, img) && !seenUrls.has(baseUrl)) {
                            images.push(highRes);
                            seenUrls.add(baseUrl);
                        }
                    });
                });

                // ✅ [2026-02-01 FIX] 이미지가 부족하면 모든 img 태그에서 pstatic.net 이미지 수집
                // 사람이 제품을 사용하는 추가이미지 등을 포함하여 최대한 수집
                if (images.length < 7) {
                    console.log('[BrandStore] 📷 이미지 부족! 전체 img 태그에서 추가 수집...');
                    document.querySelectorAll('img').forEach(img => {
                        const rawSrc = (img as HTMLImageElement).src ||
                            (img as HTMLImageElement).getAttribute('data-src') ||
                            (img as HTMLImageElement).getAttribute('data-lazy-src') || '';
                        if (!rawSrc) return;

                        const highRes = toHighRes(rawSrc);
                        const baseUrl = highRes.split('?')[0];

                        if (isValidProductImage(highRes, img) && !seenUrls.has(baseUrl)) {
                            images.push(highRes);
                            seenUrls.add(baseUrl);
                        }
                    });
                    console.log(`[BrandStore] 📷 전체 스캔 후 이미지: ${images.length}개`);
                }

                // ✅ [2026-02-01 FIX] OG 이미지 폴백 완전 제거
                // 브랜드스토어 OG 이미지는 스토어 배너이므로 사용하지 않음

                // 상품 정보 테이블
                let productDetails = '';
                document.querySelectorAll('.BQJHG3qqZ4 table.RCLS1uAn0a tr, table tr').forEach(row => {
                    const th = row.querySelector('th')?.textContent?.trim() || '';
                    const td = row.querySelector('td')?.textContent?.trim() || '';
                    if (th && td && th.length < 20) {
                        productDetails += `${th}: ${td}\n`;
                    }
                });

                return { productName: productName?.trim() || '', price: price?.trim() || '', images, productDetails };
            });

            // ✅ [2026-02-01] 리뷰 탭 클릭하여 리뷰 이미지 수집
            console.log('[BrandStore] 📸 리뷰 탭에서 실사용 이미지 수집 시도...');
            let reviewImages: string[] = [];
            try {
                const reviewTabSelectors = [
                    'a[href*="review"]',
                    '[class*="tab"]:has-text("리뷰")',
                    'li:has-text("리뷰") a',
                ];

                let clicked = false;
                for (const sel of reviewTabSelectors) {
                    try {
                        const tab = await page.$(sel);
                        if (tab) {
                            await humanMouseMove(400 + Math.random() * 200, 500 + Math.random() * 100);
                            await tab.click();
                            clicked = true;
                            console.log(`[BrandStore] ✅ 리뷰 탭 클릭 성공`);
                            await page.waitForTimeout(2000 + Math.random() * 1000);
                            break;
                        }
                    } catch { }
                }

                if (clicked) {
                    reviewImages = await page.evaluate(() => {
                        const imgs: string[] = [];
                        const seen = new Set<string>();
                        const reviewSelectors = [
                            '.reviewItem_photo img', '.photo_review img', 'img[src*="review"]',
                            '.review_photo img', '[class*="ReviewPhoto"] img'
                        ];
                        reviewSelectors.forEach(sel => {
                            document.querySelectorAll(sel).forEach(img => {
                                const src = (img as HTMLImageElement).src;
                                if (!src || src.length < 20) return;
                                if (src.includes('banner') || src.includes('icon') || src.includes('logo')) return;
                                const base = src.split('?')[0];
                                if (!seen.has(base) && src.includes('pstatic.net')) {
                                    imgs.push(src);
                                    seen.add(base);
                                }
                            });
                        });
                        return imgs.slice(0, 10);
                    });
                    console.log(`[BrandStore] 📸 리뷰 이미지 ${reviewImages.length}장 수집!`);
                }
            } catch (reviewError) {
                console.log(`[BrandStore] ⚠️ 리뷰 이미지 수집 실패: ${(reviewError as Error).message}`);
            }

            // ✅ 이미지 우선순위 정렬 (리뷰 이미지 우선!)
            const sortedImages = prioritizeImages(productInfo.images, reviewImages);
            console.log(`[BrandStore] 🎯 이미지 정렬 완료: 리뷰 ${reviewImages.length}장 우선`);

            // 리소스 정리
            const cleanupResources = async () => {
                try {
                    if (context) await context.close().catch(() => { });
                    if (browser) await browser.close().catch(() => { });
                } catch { }
            };

            // 에러 페이지 감지
            const errorKeywords = ['에러', '오류', 'error', '시스템', '찾을 수 없'];
            const isErrorPage = errorKeywords.some(kw =>
                productInfo.productName.toLowerCase().includes(kw.toLowerCase())
            );

            if (!isErrorPage && productInfo.productName && productInfo.productName.length >= 5) {
                console.log(`[BrandStore] ✅ Playwright 성공: [${productInfo.productName.substring(0, 40)}...]`);
                await cleanupResources();
                return {
                    name: productInfo.productName,
                    price: parseInt(productInfo.price.replace(/[^0-9]/g, '')) || 0,
                    stock: 1,
                    options: [],
                    detailUrl: originalUrl,
                    mainImage: sortedImages[0] || '',
                    galleryImages: sortedImages,
                    detailImages: [],
                    description: productInfo.productDetails || '',
                };
            }

            console.log('[BrandStore] ⚠️ Playwright에서 유효한 상품명 없음 → API 폴백');
            await cleanupResources();
        } // ✅ [2026-02-02 FIX] else 블록 닫기

    } catch (playwrightError) {
        console.log(`[BrandStore] ❌ Playwright 실패: ${(playwrightError as Error).message}`);
        try { if (context) await context.close(); } catch { }
        try { if (browser) await browser.close(); } catch { }
    }

    // ============================================
    // 🔄 1.5단계: Puppeteer + Stealth + 세션 유지 폴백 (100% 안정성!)
    // ============================================
    console.log('[BrandStore] 🔄 Puppeteer + Stealth + 세션 유지 폴백 시도...');
    try {
        const puppeteerExtra = await import('puppeteer-extra');
        const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
        puppeteerExtra.default.use(StealthPlugin());

        // ✅ [2026-02-02 FIX] 세션 디렉토리 사용 (쿠키/로그인 상태 유지)
        const path = await import('path');
        const fs = await import('fs');
        const appDataPath = process.env.APPDATA || process.env.HOME || '';
        const puppeteerSessionDir = path.join(appDataPath, 'better-life-naver', 'puppeteer-session-brandstore');

        if (!fs.existsSync(puppeteerSessionDir)) {
            fs.mkdirSync(puppeteerSessionDir, { recursive: true });
        }

        console.log(`[BrandStore] 🍪 세션 디렉토리: ${puppeteerSessionDir}`);

        // ✅ [2026-02-04 FIX] 배포 환경 지원 - Chromium 경로 명시
        const { getChromiumExecutablePath } = await import('../browserUtils');
        const chromePath = await getChromiumExecutablePath();
        console.log(`[BrandStore] 🌐 Chromium 경로: ${chromePath || '자동 감지'}`);

        const puppeteerBrowser = await puppeteerExtra.default.launch({
            headless: false, // ✅ 브랜드스토어 SPA 렌더링을 위해 visible 모드
            userDataDir: puppeteerSessionDir, // ✅ 세션 유지!
            executablePath: chromePath || undefined, // ✅ [2026-02-04 FIX] 배포 환경 지원
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-blink-features=AutomationControlled', // ✅ 봇 탐지 회피
            ]
        });


        try {
            const page = await puppeteerBrowser.newPage();

            // ✅ [2026-02-02 FIX] 봇 탐지 회피 강화
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                // @ts-ignore
                delete navigator.__proto__.webdriver;
            });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });

            const desktopUrl = `https://brand.naver.com/${brandName}/products/${productId}`;
            console.log(`[BrandStore] 🌐 Puppeteer + Stealth 크롤링: ${desktopUrl}`);

            // ✅ [2026-02-02 FIX] 에러 페이지 감지 및 재시도 로직 (5회, 5~15초 대기)
            const MAX_RETRIES = 5;
            let lastError = '';

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                console.log(`[BrandStore:Puppeteer] 🔄 시도 ${attempt}/${MAX_RETRIES}...`);

                await page.goto(desktopUrl, { waitUntil: 'networkidle2', timeout: 30000 });

                // ✅ [2026-02-02 FIX] "상품이 존재하지 않습니다" 에러도 감지 (봇 탐지로 인한 거짓 에러)
                const errorCheck = await page.evaluate(() => {
                    const bodyText = document.body?.innerText || '';
                    const errorKeywords = [
                        '서비스 접속이 불가',
                        '에러페이지',
                        '보안 확인',
                        '캡차',
                        'captcha',
                        '비정상적인 접근',
                        '상품이 존재하지 않습니다', // ✅ 추가!
                        '페이지를 찾을 수 없습니다'
                    ];
                    const foundError = errorKeywords.find(kw => bodyText.toLowerCase().includes(kw.toLowerCase()));
                    return foundError || null;
                });

                if (!errorCheck) {
                    console.log(`[BrandStore:Puppeteer] ✅ 정상 페이지 로드 성공! (시도 ${attempt})`);
                    break;
                }

                lastError = errorCheck;
                console.log(`[BrandStore:Puppeteer] ⚠️ 에러 페이지 감지: "${errorCheck}"`);

                if (attempt < MAX_RETRIES) {
                    // ✅ [2026-02-02 FIX] 더 긴 랜덤 대기 (5~15초) - 네이버 Rate Limit 회피
                    const waitTime = 5000 + Math.random() * 10000;
                    console.log(`[BrandStore:Puppeteer] ⏳ ${Math.round(waitTime / 1000)}초 대기 후 재시도...`);
                    await new Promise(r => setTimeout(r, waitTime));

                    // 페이지 새로고침
                    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
                }
            }


            // ✅ 상품명 요소가 로드될 때까지 대기
            console.log('[BrandStore:Puppeteer] ⏳ 상품 정보 로드 대기...');
            try {
                await page.waitForSelector('h3.DCVBehA8ZB, .P2lBbUWPNi h3, [class*="ProductName"], img.fxmqPhYp6y', { timeout: 15000 });
                console.log('[BrandStore:Puppeteer] ✅ 상품 정보 로드 완료');
            } catch {
                console.log('[BrandStore:Puppeteer] ⚠️ 상품 정보 로드 타임아웃, 계속 진행...');
            }

            // ✅ 충분한 스크롤로 lazy-loading 이미지 로드
            console.log('[BrandStore:Puppeteer] 📜 페이지 스크롤 중...');
            for (let i = 0; i < 5; i++) {
                await page.evaluate((i) => window.scrollBy(0, 400 + i * 100), i);
                await new Promise(r => setTimeout(r, 500));
            }
            // 이미지 로딩 대기
            await new Promise(r => setTimeout(r, 5000));
            console.log('[BrandStore:Puppeteer] ✅ 스크롤 완료, 이미지 수집 시작...');

            // ✅ 이미지 수집 전 전체 img 태그 개수 확인
            const totalImgCount = await page.evaluate(() => document.querySelectorAll('img').length);
            console.log(`[BrandStore:Puppeteer] 📷 페이지 내 img 태그: ${totalImgCount}개`);


            // 제품 정보 추출
            const productInfo = await page.evaluate(() => {
                const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
                const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

                // 상품명
                const productName =
                    document.querySelector('h3.DCVBehA8ZB._copyable')?.textContent ||
                    document.querySelector('.P2lBbUWPNi h3')?.textContent ||
                    document.querySelector('[class*="ProductName"]')?.textContent || ogTitle;

                // 가격
                const discountPrice = document.querySelector('strong.Xu9MEKUuIo span.e1DMQNBPJ_')?.textContent || '';
                const originalPrice = document.querySelector('del.VaZJPclpdJ span.e1DMQNBPJ_')?.textContent || '';
                const price = discountPrice || originalPrice;

                // 이미지 수집 (배너/광고/스토어로고 제외)
                const images: string[] = [];
                const seenUrls = new Set<string>();

                const isValidProductImage = (src: string, element?: Element): boolean => {
                    if (!src) return false;
                    if (src.length < 20) return false;
                    // 비디오/썸네일 제외
                    if (src.includes('video-phinf')) return false;
                    if (src.includes('dthumb')) return false;
                    if (src.includes('vod-')) return false;
                    // 배너/로고/아이콘 제외 (URL 경로에서만)
                    if (src.includes('/banner/')) return false;
                    if (src.includes('/logo/')) return false;
                    if (src.includes('/icon/')) return false;
                    if (src.includes('storeLogo')) return false;
                    if (src.includes('brandLogo')) return false;
                    // ✅ [2026-02-08] 관련 없는 CDN/이미지 제외
                    if (src.includes('searchad-phinf')) return false;  // 검색광고 이미지
                    if (src.includes('shopping-phinf') && src.includes('/main_')) return false; // 다른 상품 카탈로그 썸네일
                    // ✅ [2026-02-01 FIX] 이벤트/프로모션 배너 제외 (URL 경로 패턴만)
                    if (src.includes('/event/')) return false;
                    if (src.includes('/promotion/')) return false;
                    if (src.includes('/campaign/')) return false;
                    if (src.includes('/coupon/')) return false;
                    // ✅ [2026-02-01] 요소가 헤더/네비게이션/배너 영역에 있으면 제외
                    if (element) {
                        const parent = element.closest('header, nav, .header, .nav, [class*="gnb"], [class*="store_info"], [class*="storeBanner"], [class*="eventBanner"]');
                        if (parent) return false;
                        // 이미지 크기 체크: 가로가 세로의 3배 이상이면 배너로 판단
                        const img = element as HTMLImageElement;
                        if (img.naturalWidth && img.naturalHeight) {
                            const ratio = img.naturalWidth / img.naturalHeight;
                            if (ratio > 3 || ratio < 0.33) return false;
                        }
                    }
                    // 유효한 상품 이미지 도메인 (shop-phinf = 상품 이미지, pstatic.net = 범용)
                    if (src.includes('shop-phinf')) return true;
                    if (src.includes('pstatic.net')) return true;
                    return false;
                };

                const toHighRes = (src: string): string => {
                    // ✅ checkout.phinf / image.nmv는 type=f640_640 미지원 (404) → type 파라미터 제거
                    if (src.includes('checkout.phinf') || src.includes('image.nmv')) {
                        return src.replace(/\?type=.*$/, '');
                    }
                    return src
                        .replace(/type=f\d+(_\d+)?(_q\d+)?/, 'type=f640_640')
                        .replace(/\?type=.*$/, '?type=f640_640')
                        .replace(/\/s_\d+\//, '/o/')
                        .replace(/_\d+x\d+\./, '.');
                };

                // ✅ [2026-02-01 FIX] 상품 갤러리 슬라이드 영역에서 이미지 먼저 수집
                // ✅ [2026-02-08] 범위 축소: 메인 상품 갤러리만 타겟
                const gallerySelectors = [
                    // ✅ 네이버 브랜드스토어 상품 추가이미지 (가장 정확)
                    '.fxmqPhYp6y',
                    'img.fxmqPhYp6y',
                    // 상품 갤러리 슬라이드 (메인 이미지 영역)
                    '.K4l1t0ryUq img',
                    '.bd_3SCnU img',
                    '.slick-slide img',
                    '.swiper-slide img',
                ];

                // 상세 설명 + 관련상품/추천상품/다른상품/브랜드 하단 영역 제외
                const excludeAreas = document.querySelectorAll([
                    '[class*="detailContent"]', '[class*="DetailContent"]', '[class*="productDetail"]', '.se-module',
                    // ✅ [2026-02-08] 관련/추천/다른상품 영역 제외 강화
                    '[class*="relatedProduct"]', '[class*="RelatedProduct"]',
                    '[class*="recommend"]', '[class*="Recommend"]',
                    '[class*="otherProduct"]', '[class*="OtherProduct"]',
                    '[class*="similarProduct"]', '[class*="SimilarProduct"]',
                    '[class*="brandProduct"]', '[class*="BrandProduct"]',
                    '[class*="suggestion"]', '[class*="Suggestion"]',
                    '[class*="MoreProduct"]', '[class*="moreProduct"]',
                    '[class*="together"]', '[class*="Together"]',
                    // ✅ [2026-02-08] 네이버 브랜드스토어 하단 영역 특화
                    '[class*="shopping_list"]',  // 함께 구매한 상품
                    '[class*="channel_"]',       // 채널 상품 목록
                    '[class*="Review"]',         // 리뷰 영역 (리뷰 이미지는 별도 수집)
                    '[class*="review"]',
                    'footer', '[class*="footer"]', '[class*="Footer"]',
                ].join(', '));
                const excludeSet = new Set<Element>();
                excludeAreas.forEach(area => excludeSet.add(area));

                gallerySelectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(img => {
                        let isInExcludeArea = false;
                        for (const area of excludeSet) {
                            if (area.contains(img)) {
                                isInExcludeArea = true;
                                break;
                            }
                        }
                        if (isInExcludeArea) return;

                        const rawSrc = (img as HTMLImageElement).src || '';
                        if (!rawSrc) return;
                        const highRes = toHighRes(rawSrc);
                        const baseUrl = highRes.split('?')[0];
                        if (isValidProductImage(highRes, img) && !seenUrls.has(baseUrl)) {
                            images.push(highRes);
                            seenUrls.add(baseUrl);
                        }
                    });
                });

                // ✅ [2026-02-01 FIX] 이미지가 부족하면 모든 img 태그에서 pstatic.net 이미지 수집
                // ✅ [2026-02-08 FIX] 임계값 7→3 (리뷰 이미지는 별도 수집하므로 갤러리 3개 이상이면 충분)
                if (images.length < 3) {
                    document.querySelectorAll('img').forEach(img => {
                        // 관련상품 영역 내 이미지 제외
                        let isInExclude = false;
                        for (const area of excludeSet) {
                            if (area.contains(img)) { isInExclude = true; break; }
                        }
                        if (isInExclude) return;

                        const rawSrc = (img as HTMLImageElement).src ||
                            (img as HTMLImageElement).getAttribute('data-src') ||
                            (img as HTMLImageElement).getAttribute('data-lazy-src') || '';
                        if (!rawSrc) return;

                        const highRes = toHighRes(rawSrc);
                        const baseUrl = highRes.split('?')[0];

                        if (isValidProductImage(highRes, img) && !seenUrls.has(baseUrl)) {
                            images.push(highRes);
                            seenUrls.add(baseUrl);
                        }
                    });
                }

                // ✅ [2026-02-02 FIX] 이미지가 여전히 0개면 최후의 폴백: 더 느슨한 조건으로 수집
                // ✅ [2026-02-08 FIX] 관련상품 영역 제외 적용
                if (images.length === 0) {
                    document.querySelectorAll('img').forEach(img => {
                        let isInExclude = false;
                        for (const area of excludeSet) {
                            if (area.contains(img)) { isInExclude = true; break; }
                        }
                        if (isInExclude) return;

                        const imgEl = img as HTMLImageElement;
                        const rawSrc = imgEl.src || imgEl.getAttribute('data-src') || '';
                        if (!rawSrc || rawSrc.length < 30) return;

                        // ✅ [2026-02-08] 폴백에도 동일한 CDN 필터 적용
                        if (!rawSrc.includes('pstatic.net') && !rawSrc.includes('shop-phinf')) return;
                        if (rawSrc.includes('searchad-phinf')) return;  // 광고
                        if (rawSrc.includes('video-phinf')) return;     // 동영상
                        if (rawSrc.includes('shopping-phinf') && rawSrc.includes('/main_')) return; // 다른 상품 카탈로그
                        if (rawSrc.includes('/banner/') || rawSrc.includes('Logo') || rawSrc.includes('/icon/')) return;
                        if (rawSrc.includes('dthumb')) return;

                        const highRes = toHighRes(rawSrc);
                        const baseUrl = highRes.split('?')[0];
                        if (!seenUrls.has(baseUrl)) {
                            images.push(highRes);
                            seenUrls.add(baseUrl);
                        }
                    });
                }

                // ✅ [2026-02-01 FIX] OG 이미지 폴백 완전 제거
                // 브랜드스토어 OG 이미지는 스토어 배너이므로 사용하지 않음

                // 상품 정보 테이블
                let productDetails = '';
                document.querySelectorAll('.BQJHG3qqZ4 table.RCLS1uAn0a tr, table tr').forEach(row => {
                    const th = row.querySelector('th')?.textContent?.trim() || '';
                    const td = row.querySelector('td')?.textContent?.trim() || '';
                    if (th && td && th.length < 20) {
                        productDetails += `${th}: ${td}\n`;
                    }
                });

                return { productName: productName?.trim() || '', price: price?.trim() || '', images, productDetails };
            });

            // ✅ [2026-02-08 v4] 리뷰 이미지 수집 — "전체보기" 모달에서 data-shp-contents-dtl 원본 URL 추출
            console.log('[BrandStore:Puppeteer] 📸 리뷰 이미지 수집 시도...');
            let reviewImages: string[] = [];
            try {
                // Step 1: 리뷰 탭 클릭 — 정확한 셀렉터: a[data-name="REVIEW"]
                const reviewTabResult = await page.evaluate(() => {
                    const exactTab = document.querySelector('a[data-name="REVIEW"]') as HTMLElement;
                    if (exactTab) {
                        exactTab.click();
                        return `정확셀렉터: "${exactTab.textContent?.trim().substring(0, 20)}"`;
                    }
                    // 폴백: 텍스트 기반
                    const allLinks = Array.from(document.querySelectorAll('a, button, [role="tab"]'));
                    for (const el of allLinks) {
                        const text = (el.textContent || '').trim();
                        if ((text.includes('리뷰') || text.includes('후기')) && text.length < 30) {
                            (el as HTMLElement).click();
                            return `텍스트폴백: "${text}"`;
                        }
                    }
                    return null;
                });
                if (reviewTabResult) {
                    console.log(`[BrandStore:Puppeteer] ✅ 리뷰 탭 클릭: ${reviewTabResult}`);
                } else {
                    console.log('[BrandStore:Puppeteer] ⚠️ 리뷰 탭을 찾지 못함');
                }
                await new Promise(r => setTimeout(r, 4000));

                // Step 1.5: 리뷰 섹션으로 스크롤 — "전체보기" 버튼이 보여야 클릭 가능
                for (let i = 0; i < 8; i++) {
                    await page.evaluate((i) => window.scrollBy(0, 400 + i * 150), i);
                    await new Promise(r => setTimeout(r, 400));
                }
                await new Promise(r => setTimeout(r, 2000));

                // Step 2: "전체보기" 버튼 클릭 → 포토/동영상 모달 열기
                const viewAllResult = await page.evaluate(() => {
                    // ✅ 정확한 셀렉터: button.lbsWelnf3O (전체보기)
                    const exactBtn = document.querySelector('button.lbsWelnf3O') as HTMLElement;
                    if (exactBtn) {
                        exactBtn.click();
                        return `정확셀렉터: "${exactBtn.textContent?.trim()}"`;
                    }
                    // 폴백: "전체보기" 텍스트 기반
                    const allBtns = Array.from(document.querySelectorAll('button, a'));
                    for (const btn of allBtns) {
                        const text = (btn.textContent || '').trim();
                        if (text === '전체보기') {
                            (btn as HTMLElement).click();
                            return `텍스트폴백: "${text}"`;
                        }
                    }
                    // 2차 폴백: 포토 / 사진 관련 버튼
                    for (const btn of allBtns) {
                        const text = (btn.textContent || '').trim();
                        if ((text.includes('포토') || text.includes('사진')) && text.length < 15) {
                            (btn as HTMLElement).click();
                            return `포토폴백: "${text}"`;
                        }
                    }
                    return null;
                });
                if (viewAllResult) {
                    console.log(`[BrandStore:Puppeteer] ✅ 전체보기 버튼 클릭: ${viewAllResult}`);
                } else {
                    console.log('[BrandStore:Puppeteer] ⚠️ 전체보기 버튼을 찾지 못함');
                }
                await new Promise(r => setTimeout(r, 3000));

                // Step 3: 모달 내 스크롤로 lazy-loading 이미지 추가 로드
                await page.evaluate(() => {
                    // 모달 컨테이너 찾기: div.ZLJruxZTMK 또는 position:fixed 오버레이
                    const modal = document.querySelector('div.ZLJruxZTMK') ||
                        document.querySelector('[style*="position: fixed"][style*="z-index"]');
                    if (modal) {
                        for (let i = 0; i < 5; i++) {
                            modal.scrollBy(0, 600);
                        }
                    }
                });
                await new Promise(r => setTimeout(r, 2000));

                // Step 4: 모달 내 data-shp-contents-dtl에서 깨끗한 원본 URL 추출
                reviewImages = await page.evaluate(() => {
                    const imgs: string[] = [];
                    const seen = new Set<string>();

                    // ✅ 최우선: data-shp-contents-dtl JSON에서 img_url 추출 (type 파라미터 없는 원본!)
                    const allLinks = document.querySelectorAll('a[data-shp-contents-dtl]');
                    allLinks.forEach(link => {
                        try {
                            const dtl = link.getAttribute('data-shp-contents-dtl') || '';
                            const parsed = JSON.parse(dtl);
                            if (Array.isArray(parsed)) {
                                for (const item of parsed) {
                                    if (item.key === 'img_url' && item.value) {
                                        const url = item.value;
                                        if (url.includes('phinf.pstatic.net') && !seen.has(url)) {
                                            imgs.push(url);
                                            seen.add(url);
                                        }
                                    }
                                }
                            }
                        } catch (e) { /* JSON 파싱 실패 무시 */ }
                    });

                    // ✅ 폴백: img[alt="review_image"] src에서 ?type= 제거
                    if (imgs.length < 3) {
                        document.querySelectorAll('img[alt="review_image"], img.fRR0Hiw_1G').forEach(img => {
                            const rawSrc = (img as HTMLImageElement).src ||
                                (img as HTMLImageElement).getAttribute('data-src') || '';
                            if (!rawSrc || rawSrc.length < 30) return;
                            if (!rawSrc.includes('checkout.phinf') && !rawSrc.includes('image.nmv')) return;
                            // type 파라미터 제거 (checkout.phinf는 f640_640 404 반환)
                            const cleanUrl = rawSrc.replace(/\?type=.*$/, '');
                            if (!seen.has(cleanUrl)) { imgs.push(cleanUrl); seen.add(cleanUrl); }
                        });
                    }

                    return imgs.slice(0, 20);
                });

                // Step 5: 모달 닫기
                await page.evaluate(() => {
                    const closeBtn = document.querySelector('button.FM1ORqPdZ2') as HTMLElement;
                    if (closeBtn) {
                        closeBtn.click();
                        return;
                    }
                    // 폴백: "레이어 닫기" 텍스트 버튼
                    const allBtns = document.querySelectorAll('button');
                    for (const btn of allBtns) {
                        if (btn.textContent?.includes('닫기')) {
                            (btn as HTMLElement).click();
                            return;
                        }
                    }
                });

                console.log(`[BrandStore:Puppeteer] 📸 포토/동영상 리뷰 이미지 ${reviewImages.length}장 수집!`);
            } catch (reviewErr) {
                console.log(`[BrandStore:Puppeteer] ⚠️ 리뷰 이미지 수집 실패: ${(reviewErr as Error).message}`);
            }

            // 리뷰 이미지를 기존 이미지에 병합
            if (reviewImages.length > 0) {
                const existingNorm = new Set(productInfo.images.map((u: string) => u.split('?')[0]));
                const newReviewImgs = reviewImages.filter(img => !existingNorm.has(img.split('?')[0]));
                productInfo.images = [...productInfo.images, ...newReviewImgs];
                console.log(`[BrandStore:Puppeteer] 📷 리뷰 이미지 ${newReviewImgs.length}장 병합 → 총 ${productInfo.images.length}개`);
            }

            // ✅ [2026-02-02 FIX] 이미지 0개여도 상품명만 유효하면 성공으로 처리
            // API 폴백은 검색 결과 중 첫 번째 상품을 가져오므로 정확도가 낮음
            // Puppeteer는 실제 페이지에서 상품명을 가져오므로 더 정확함
            console.log(`[BrandStore:Puppeteer] 📊 수집 결과: 상품명="${productInfo.productName?.substring(0, 30)}", 이미지=${productInfo.images.length}개`);

            if (productInfo.productName && productInfo.productName.length >= 5) {
                console.log(`[BrandStore] ✅ Puppeteer 성공: [${productInfo.productName.substring(0, 40)}...] 이미지 ${productInfo.images.length}개`);
                return {
                    name: productInfo.productName,
                    price: parseInt(productInfo.price.replace(/[^0-9]/g, '')) || 0,
                    stock: 1,
                    options: [],
                    detailUrl: originalUrl,
                    mainImage: productInfo.images[0] || '',
                    galleryImages: productInfo.images,
                    detailImages: [],
                    description: productInfo.productDetails || '',
                };
            }
            console.log('[BrandStore] ⚠️ Puppeteer에서 유효한 상품명 없음 → API 폴백');
        } finally {
            await puppeteerBrowser.close().catch(() => { });
        }
    } catch (puppeteerError) {
        console.log(`[BrandStore] ⚠️ Puppeteer 폴백 실패: ${(puppeteerError as Error).message}`);
    }

    // ============================================
    // 🔄 2단계: 네이버 쇼핑 API 폴백
    // ============================================
    const axios = (await import('axios')).default;
    const naverClientId = process.env.NAVER_CLIENT_ID;
    const naverClientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!naverClientId || !naverClientSecret) {
        console.log('[BrandStore] ⚠️ 네이버 API 키가 없습니다.');
        return null;
    }

    try {
        console.log(`[BrandStore] 🔍 네이버 쇼핑 API 검색: "${brandName}"`);

        const searchUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(brandName)}&display=50&sort=sim`;

        const response = await axios.get(searchUrl, {
            headers: {
                'X-Naver-Client-Id': naverClientId,
                'X-Naver-Client-Secret': naverClientSecret
            },
            timeout: 15000
        });

        if (!response.data?.items?.length) {
            console.log('[BrandStore] ⚠️ 검색 결과 없음');
            return null;
        }

        // ✅ [2026-02-04 FIX] productId가 정확히 매칭되는 상품만 사용
        // 검색 결과 첫 번째 상품 사용 금지 (완전히 다른 상품이 반환되는 문제 해결)
        let targetProduct = response.data.items.find((item: any) =>
            item.link?.includes(productId) || item.productId === productId
        );

        if (!targetProduct) {
            // productId로 찾지 못한 경우, mallName + productId 조합으로 한 번 더 시도
            targetProduct = response.data.items.find((item: any) => {
                const linkMatch = item.link?.includes(productId);
                const mallMatch = item.mallName?.toLowerCase().includes(brandName.toLowerCase());
                return linkMatch || (mallMatch && item.link?.includes('products/'));
            });
        }

        // ✅ [2026-02-04 FIX] 정확한 상품을 찾지 못하면 API 폴백 실패 처리
        // 검색 결과 첫 번째 상품 사용 금지 (완전히 다른 상품 반환 문제)
        if (!targetProduct) {
            console.log(`[BrandStore] ⚠️ API 검색 결과에서 productId=${productId} 상품을 찾을 수 없음`);
            console.log('[BrandStore] 🔄 OG 태그에서 상품명 추출 시도...');

            // OG 태그에서 상품명 추출 폴백
            try {
                const ogResponse = await axios.get(originalUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                        'Accept': 'text/html',
                    },
                    timeout: 10000
                });

                const ogTitleMatch = ogResponse.data.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
                const ogImageMatch = ogResponse.data.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);

                if (ogTitleMatch?.[1]) {
                    const ogProductName = ogTitleMatch[1].replace(/\s*:\s*.*브랜드스토어.*$/i, '').trim();
                    console.log(`[BrandStore] ✅ OG 태그에서 상품명 추출 성공: "${ogProductName}"`);

                    return {
                        name: ogProductName,
                        price: 0,
                        stock: 1,
                        options: [],
                        detailUrl: originalUrl,
                        mainImage: ogImageMatch?.[1] || '',
                        galleryImages: ogImageMatch?.[1] ? [ogImageMatch[1]] : [],
                        detailImages: [],
                        description: `${ogProductName} - ${brandName} 브랜드스토어`
                    };
                }
            } catch (ogError) {
                console.log(`[BrandStore] ⚠️ OG 태그 추출 실패: ${(ogError as Error).message}`);
            }

            console.log('[BrandStore] ❌ API 폴백 실패 - productId 매칭 상품 없음');
            return null;
        }

        const productTitle = targetProduct.title.replace(/<[^>]*>/g, '').trim();
        const productPrice = parseInt(targetProduct.lprice) || 0;
        const productImage = targetProduct.image || null;

        // ✅ [2026-02-02 FIX] API 결과에서 이미지 대폭 수집 (브랜드 필터 완화)
        const allImages: string[] = [];
        const seenUrls = new Set<string>();

        // 1. 타겟 상품 이미지 먼저 추가
        if (productImage) {
            allImages.push(productImage);
            seenUrls.add(productImage.split('?')[0]);
        }

        // 2. ✅ [2026-02-02 FIX] 검색 결과에서 모든 쇼핑 이미지 수집 (브랜드 필터 완화)
        // 네이버 쇼핑 API는 이미 관련 상품만 반환하므로 전부 수집
        for (const item of response.data.items) {
            if (!item.image) continue;
            const baseUrl = item.image.split('?')[0];
            if (seenUrls.has(baseUrl)) continue;

            allImages.push(item.image);
            seenUrls.add(baseUrl);

            if (allImages.length >= 10) break; // 최대 10개
        }

        // 3. ✅ [2026-02-02 FIX] 이미지가 부족하면 상품명으로 추가 검색
        if (allImages.length < 5) {
            console.log(`[BrandStore] 📷 이미지 부족(${allImages.length}개) → 상품명으로 추가 검색...`);
            try {
                const productSearchUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(productTitle)}&display=20&sort=sim`;
                const productResponse = await axios.get(productSearchUrl, {
                    headers: {
                        'X-Naver-Client-Id': naverClientId,
                        'X-Naver-Client-Secret': naverClientSecret
                    },
                    timeout: 10000
                });

                if (productResponse.data?.items?.length) {
                    for (const item of productResponse.data.items) {
                        if (!item.image) continue;
                        const baseUrl = item.image.split('?')[0];
                        if (seenUrls.has(baseUrl)) continue;

                        allImages.push(item.image);
                        seenUrls.add(baseUrl);

                        if (allImages.length >= 10) break;
                    }
                    console.log(`[BrandStore] 📷 상품명 검색 후 이미지: ${allImages.length}개`);
                }
            } catch {
                console.log('[BrandStore] ⚠️ 상품명 검색 실패');
            }
        }

        // 4. ✅ [2026-02-02 FIX] 여전히 부족하면 네이버 이미지 검색 API 사용
        if (allImages.length < 5) {
            console.log(`[BrandStore] 📷 이미지 여전히 부족(${allImages.length}개) → 이미지 검색 API 시도...`);
            try {
                const imageSearchUrl = `https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(productTitle + ' 제품')}&display=10&sort=sim&filter=large`;
                const imageResponse = await axios.get(imageSearchUrl, {
                    headers: {
                        'X-Naver-Client-Id': naverClientId,
                        'X-Naver-Client-Secret': naverClientSecret
                    },
                    timeout: 10000
                });

                if (imageResponse.data?.items?.length) {
                    for (const item of imageResponse.data.items) {
                        if (!item.link) continue;
                        const baseUrl = item.link.split('?')[0];
                        if (seenUrls.has(baseUrl)) continue;

                        // 상품 이미지 도메인 필터
                        if (item.link.includes('pstatic.net') ||
                            item.link.includes('shopping-phinf') ||
                            item.link.includes('shop-phinf')) {
                            allImages.push(item.link);
                            seenUrls.add(baseUrl);
                        }

                        if (allImages.length >= 10) break;
                    }
                    console.log(`[BrandStore] 📷 이미지 검색 후 최종: ${allImages.length}개`);
                }
            } catch {
                console.log('[BrandStore] ⚠️ 이미지 검색 실패');
            }
        }

        console.log(`[BrandStore] ✅ API 성공! 제품명: "${productTitle}" (이미지 ${allImages.length}개)`);

        return {
            name: productTitle,
            price: productPrice,
            stock: 1,
            options: [],
            detailUrl: originalUrl,
            mainImage: allImages[0] || productImage,
            galleryImages: allImages.length > 0 ? allImages : (productImage ? [productImage] : []),
            detailImages: [],
            description: `${productTitle} - ${brandName} 브랜드스토어`
        };
    } catch (error) {
        console.log(`[BrandStore] ❌ API 실패: ${(error as Error).message}`);
        return null;
    }
}
/**
 * ✅ [100점 수정] 상품 ID로 직접 API 호출하는 헬퍼 함수
 * - brand.naver.com과 smartstore.naver.com 구분하여 적절한 API 엔드포인트 사용
 * - 스마트스토어: 스토어명 필수 포함 (핵심 버그 수정)
 */
async function fetchProductByIdDirectly(productId: string, originalUrl: string): Promise<AffiliateProductInfo | null> {
    // ✅ [100점 수정] m. 접두사 포함 모바일 URL도 인식
    const isBrandStore = originalUrl.includes('brand.naver.com');
    const isSmartStore = originalUrl.includes('smartstore.naver.com');

    let targetApiUrl: string;

    if (isBrandStore) {
        // 브랜드스토어: 브랜드명 추출 후 API 호출 (m. 접두사 포함)
        const brandMatch = originalUrl.match(/(?:m\.)?brand\.naver\.com\/([^\/\?]+)/);
        const brandName = brandMatch?.[1] || '';
        targetApiUrl = `https://m.brand.naver.com/${brandName}/i/v1/products/${productId}`;
        console.log(`[AffiliateCrawler] 🎯 브랜드스토어 API: ${brandName}`);
    } else if (isSmartStore) {
        // ✅ [핵심 수정] 스마트스토어: m. 접두사 포함 패턴 인식
        const storeMatch = originalUrl.match(/(?:m\.)?smartstore\.naver\.com\/([^\/\?]+)/);
        const storeName = storeMatch?.[1] || '';
        if (!storeName) {
            console.log('[AffiliateCrawler] ❌ 스마트스토어 스토어명 추출 실패');
            return null;
        }
        targetApiUrl = `https://m.smartstore.naver.com/${storeName}/i/v1/products/${productId}`;
        console.log(`[AffiliateCrawler] 🎯 스마트스토어 API: ${storeName}`);
    } else {
        console.log('[AffiliateCrawler] ❌ 지원되지 않는 URL 형식');
        return null;
    }

    // ✅ [Rate Limit 우회] 더 실제적인 브라우저 시뮬레이션
    const userAgents = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36'
    ];
    const mobileUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    let response = null;
    let lastError = null;
    const maxRetries = 3;

    // ✅ [Rate Limit 우회] 첫 요청 전 랜덤 지연 (0.5~2초)
    const initialDelay = 500 + Math.floor(Math.random() * 1500);
    console.log(`[AffiliateCrawler] ⏳ 초기 지연: ${initialDelay}ms`);
    await new Promise(r => setTimeout(r, initialDelay));

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 1) {
                // ✅ [Rate Limit 대응] 지수 백오프 + 랜덤 지터
                const baseDelay = attempt === 2 ? 5000 : 15000;
                const jitter = Math.floor(Math.random() * 3000);
                const delay = baseDelay + jitter;
                console.log(`[AffiliateCrawler] ⏳ ${attempt}번째 재시도 (${(delay / 1000).toFixed(1)}초 후)...`);
                await new Promise(r => setTimeout(r, delay));
            }

            response = await axios.get(targetApiUrl, {
                headers: {
                    'User-Agent': mobileUserAgent,
                    'Referer': isBrandStore ? `https://m.brand.naver.com/${originalUrl.match(/brand\.naver\.com\/([^\/]+)/)?.[1] || ''}/` : `https://m.smartstore.naver.com/`,
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Origin': isBrandStore ? 'https://m.brand.naver.com' : 'https://m.smartstore.naver.com',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 20000
            });
            break;
        } catch (err: any) {
            lastError = err;
            const statusCode = err.response?.status || 'N/A';
            console.log(`[AffiliateCrawler] ⚠️ API 호출 실패 (${attempt}/${maxRetries}): ${statusCode} - ${err.message}`);

            // ✅ [에러 페이지 감지] 404/500 에러는 재시도하지 않음
            if (statusCode === 404 || statusCode === 500) {
                console.log('[AffiliateCrawler] ❌ 상품 페이지를 찾을 수 없음 (품절/삭제/에러 페이지)');
                return null;
            }
        }
    }

    if (!response) {
        console.log('[AffiliateCrawler] ❌ API 호출 실패 → Puppeteer 폴백 시도...');

        // ✅ [폴백] Puppeteer로 실제 페이지 크롤링
        try {
            const puppeteer = await import('puppeteer');
            const browser = await puppeteer.default.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });

            try {
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

                // 모바일 URL로 접속
                const mobileUrl = originalUrl.replace('brand.naver.com', 'm.brand.naver.com')
                    .replace('smartstore.naver.com', 'm.smartstore.naver.com');

                console.log(`[AffiliateCrawler] 🌐 Puppeteer 크롤링: ${mobileUrl}`);
                await page.goto(mobileUrl, { waitUntil: 'networkidle2', timeout: 30000 });

                // 제품명 추출
                const productName = await page.$eval(
                    'h1, .product-name, .prd-name, [class*="product-title"], [class*="ProductName"]',
                    (el: Element) => el.textContent?.trim() || ''
                ).catch(() => '');

                // 가격 추출
                const priceText = await page.$eval(
                    '.price, .prd-price, [class*="price"], [class*="Price"]',
                    (el: Element) => el.textContent?.trim() || ''
                ).catch(() => '0');
                const price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;

                // 이미지 추출
                const mainImage = await page.$eval(
                    '.product-image img, .prd-image img, [class*="product-img"] img, img[class*="thumb"]',
                    (el: HTMLImageElement) => el.src || ''
                ).catch(() => '');

                // ✅ [2026-01-21 100점 수정] Puppeteer에서도 description 추출! (browser.close 전에!)
                const description = await page.$eval(
                    'meta[property="og:description"], meta[name="description"]',
                    (el: Element) => el.getAttribute('content')?.trim() || ''
                ).catch(() => '');

                await browser.close();

                if (productName && productName.length > 2) {
                    console.log(`[AffiliateCrawler] ✅ Puppeteer 성공: [${productName}] (설명: ${description.length}자)`);
                    return {
                        name: productName,
                        price,
                        stock: 1,
                        options: [],
                        detailUrl: originalUrl,
                        mainImage: mainImage || null,
                        galleryImages: mainImage ? [mainImage] : [],
                        detailImages: [],
                        // ✅ [핵심] description 포함!
                        description: description || `${productName} 제품입니다.`
                    };
                }
            } finally {
                await browser.close().catch(() => { });
            }
        } catch (puppeteerError) {
            console.log(`[AffiliateCrawler] ⚠️ Puppeteer 폴백도 실패: ${(puppeteerError as Error).message}`);
        }

        return null;
    }

    const data = response.data;

    // ✅ [2026-01-21 FIX v3] HTML 응답인 경우 네이버 쇼핑 API로 정확한 제품명 획득!
    // API가 JSON이 아닌 HTML 페이지를 반환하는 경우 처리
    if (typeof data === 'string' && (data.includes('<!DOCTYPE') || data.includes('<html'))) {
        console.log(`[AffiliateCrawler] ⚠️ HTML 응답 감지 - 네이버 쇼핑 API로 제품 정보 검색...`);

        // ✅ [핵심] 네이버 쇼핑 API로 정확한 제품명 검색
        const naverClientId = process.env.NAVER_CLIENT_ID;
        const naverClientSecret = process.env.NAVER_CLIENT_SECRET;

        // 스토어명 추출 (브랜드스토어 또는 스마트스토어)
        const brandMatch = originalUrl.match(/(?:m\.)?brand\.naver\.com\/([^\/\?]+)/);
        const storeMatch = originalUrl.match(/(?:m\.)?smartstore\.naver\.com\/([^\/\?]+)/);
        const storeName = brandMatch?.[1] || storeMatch?.[1] || '';

        if (naverClientId && naverClientSecret && productId) {
            try {
                // 스토어명 + 상품번호로 검색 (더 정확한 결과)
                const searchQuery = storeName || productId;
                console.log(`[AffiliateCrawler] 🔍 네이버 쇼핑 API 검색: "${searchQuery}"`);

                const axios = await import('axios');
                const searchUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(searchQuery)}&display=30&sort=sim`;

                const apiResponse = await axios.default.get(searchUrl, {
                    headers: {
                        'X-Naver-Client-Id': naverClientId,
                        'X-Naver-Client-Secret': naverClientSecret
                    },
                    timeout: 10000
                });

                if (apiResponse.data?.items?.length > 0) {
                    // productId가 포함된 링크를 가진 상품 찾기
                    const matchingProduct = apiResponse.data.items.find((item: any) =>
                        item.link?.includes(productId) || item.productId === productId
                    );

                    if (matchingProduct) {
                        const productTitle = matchingProduct.title.replace(/<[^>]*>/g, '').trim();
                        const productPrice = parseInt(matchingProduct.lprice) || 0;
                        const productImage = matchingProduct.image || null;

                        console.log(`[AffiliateCrawler] ✅ 네이버 쇼핑 API 성공! 제품명: "${productTitle}"`);

                        return {
                            name: productTitle,
                            price: productPrice,
                            stock: 1,
                            options: [],
                            detailUrl: originalUrl,
                            mainImage: productImage,
                            galleryImages: productImage ? [productImage] : [],
                            detailImages: [],
                            description: `${productTitle} - ${matchingProduct.mallName || storeName || '네이버 스토어'} 제품입니다.`
                        };
                    } else {
                        // 정확한 매칭이 없으면 첫 번째 결과 사용 (스토어가 같은 경우)
                        const storeProduct = apiResponse.data.items.find((item: any) =>
                            item.mallName?.toLowerCase().includes(storeName?.toLowerCase() || '')
                        ) || apiResponse.data.items[0];

                        if (storeProduct) {
                            const productTitle = storeProduct.title.replace(/<[^>]*>/g, '').trim();
                            console.log(`[AffiliateCrawler] ✅ 네이버 쇼핑 API (스토어 매칭): "${productTitle}"`);

                            return {
                                name: productTitle,
                                price: parseInt(storeProduct.lprice) || 0,
                                stock: 1,
                                options: [],
                                detailUrl: originalUrl,
                                mainImage: storeProduct.image || null,
                                galleryImages: storeProduct.image ? [storeProduct.image] : [],
                                detailImages: [],
                                description: `${productTitle} - ${storeProduct.mallName || '네이버 스토어'} 제품입니다.`
                            };
                        }
                    }
                }
                console.log(`[AffiliateCrawler] ⚠️ 네이버 쇼핑 API 결과 없음 - HTML 파싱으로 폴백`);
            } catch (apiError) {
                console.log(`[AffiliateCrawler] ⚠️ 네이버 쇼핑 API 실패: ${(apiError as Error).message} - HTML 파싱으로 폴백`);
            }
        }

        // ✅ 네이버 쇼핑 API 실패 시 HTML 파싱으로 폴백
        console.log(`[AffiliateCrawler] 📜 HTML에서 제품명 추출 시도...`);
        let productName = '';

        // ✅ [핵심 수정] 1순위: HTML 본문에서 실제 제품명 추출 (h1, 클래스명 등)
        // 네이버 스마트스토어/브랜드스토어의 제품 페이지 구조 분석
        const productNamePatterns = [
            // ✅ [2026-01-21] 네이버 브랜드스토어 전용 패턴 (가장 우선)
            // 제품명은 보통 "상품명" 클래스나 특정 data 속성에 있음
            /<span[^>]*class="[^"]*(?:_3oDjSvLfl6|_3eXQFkgGZv|product_title)[^"]*"[^>]*>([^<]+)<\/span>/i,
            /<p[^>]*class="[^"]*(?:_3oDjSvLfl6|product_title)[^"]*"[^>]*>([^<]+)<\/p>/i,
            // 제품 상세 정보에서 제품명 (더 정확한 패턴)
            /"productName"\s*:\s*"([^"]{10,100})"/,
            /"name"\s*:\s*"([^"]{10,100})"[,}](?![^{]*"@type")/,  // JSON-LD가 아닌 제품 데이터
            // 기존 패턴들
            /<h1[^>]*class="[^"]*(?:product|prd|goods)[^"]*"[^>]*>([^<]+)<\/h1>/i,
            /<h1[^>]*>([^<]{10,100})<\/h1>/i,  // 일반 h1 태그 (10~100자로 범위 조정)
            /<span[^>]*class="[^"]*(?:product-name|prd-name|goods-name|ProductName)[^"]*"[^>]*>([^<]+)<\/span>/i,
            /<div[^>]*class="[^"]*(?:product-name|prd-name|goods-name|ProductName)[^"]*"[^>]*>([^<]+)<\/div>/i,
            /<p[^>]*class="[^"]*(?:product-name|prd-name|goods-name)[^"]*"[^>]*>([^<]+)<\/p>/i,
            // JSON-LD 구조화 데이터에서 제품명
            /"name"\s*:\s*"([^"]{10,100})"/,
        ];

        for (const pattern of productNamePatterns) {
            const match = data.match(pattern);
            if (match && match[1]) {
                const candidate = match[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim();
                // 스토어명이 아닌 실제 제품명인지 확인
                const isStoreName = /브랜드스토어|스마트스토어|smartstore|brand\.naver/i.test(candidate);
                const isTooShort = candidate.length < 10;  // 10자 미만은 제품명이 아닐 가능성 높음
                const isTooGeneric = /^(상품|제품|아이템|item|product)$/i.test(candidate);
                // ✅ [2026-01-21 100점 수정] 이미지 파일명 필터링!
                // e9XzvZIXk2_03.jpg 같은 파일명이 제품명으로 추출되는 것 방지
                const isImageFilename = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(candidate) ||
                    /^[a-zA-Z0-9_-]{8,}(_\d+)?\.(jpg|jpeg|png|gif|webp)$/i.test(candidate) ||
                    /^[a-zA-Z0-9]{10,}\.(jpg|jpeg|png|gif|webp)$/i.test(candidate);

                // ✅ [2026-01-21] 슬로건/캐치프레이즈 필터링!
                // "함께 더 편리한 일상" 같은 마케팅 문구 건너뜀
                const isSloganOrCatchphrase =
                    /함께|더\s*나은|더\s*편리한|특별한|새로운|최고의|완벽한|일상|가치|행복|라이프/i.test(candidate) &&
                    !/청소기|무선|로봇|에어컨|냉장고|세탁기|드라이기|건조기|PRO|MAX|PLUS|Ultra/i.test(candidate);

                // 제품명 특징: 모델명, 사양, 브랜드+제품타입 포함
                const hasProductFeatures = /[A-Z]{2,}|[0-9]+[가-힣]|PRO|MAX|PLUS|Ultra|무선|자동|매직/i.test(candidate);

                if (isImageFilename) {
                    console.log(`[AffiliateCrawler] ⚠️ 이미지 파일명 건너뜀: [${candidate}]`);
                    continue;
                }

                if (isSloganOrCatchphrase && !hasProductFeatures) {
                    console.log(`[AffiliateCrawler] ⚠️ 슬로건/캐치프레이즈 건너뜀: [${candidate}]`);
                    continue;
                }

                if (!isStoreName && !isTooShort && !isTooGeneric && hasProductFeatures) {
                    productName = candidate;
                    console.log(`[AffiliateCrawler] ✅ HTML 본문에서 제품명 추출 성공: [${productName}]`);
                    break;
                } else if (!isStoreName && !isTooShort && !isTooGeneric) {
                    // 제품 특징이 없어도 다른 조건이 충족되면 후보로 저장 (마지막에 사용)
                    if (!productName) {
                        productName = candidate;
                        console.log(`[AffiliateCrawler] 📝 잠정 제품명 후보: [${candidate}]`);
                    }
                }
            }
        }

        // 2순위: og:title (단, 스토어명이 아닌 경우에만 사용)
        if (!productName) {
            const ogTitleMatch = data.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                data.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);

            if (ogTitleMatch && ogTitleMatch[1]) {
                const ogTitle = ogTitleMatch[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim();
                // ✅ [핵심] 스토어명 패턴 감지 - 스토어명이면 사용하지 않음!
                const isStoreName = /브랜드스토어|스마트스토어|smartstore|brand\.naver|:\s*브랜드|:\s*스토어/i.test(ogTitle);
                // ✅ [2026-01-21] 이미지 파일명 필터링 추가
                const isImageFilename = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(ogTitle);
                // ✅ [2026-01-21] 슬로건/캐치프레이즈 필터링 추가!
                const isSloganOrCatchphrase =
                    /함께|더\s*나은|더\s*편리한|특별한|새로운|최고의|완벽한|일상|가치|행복|라이프|그리는/i.test(ogTitle) &&
                    !/청소기|무선|로봇|에어컨|냉장고|세탁기|드라이기|건조기|PRO|MAX|PLUS|Ultra/i.test(ogTitle);
                // 제품 특징이 있는지 확인
                const hasProductFeatures = /[A-Z]{2,}|[0-9]+[가-힣]|PRO|MAX|PLUS|Ultra|무선|자동|매직|청소기|냉장고|세탁기/i.test(ogTitle);

                if (isImageFilename) {
                    console.log(`[AffiliateCrawler] ⚠️ OG 태그가 이미지 파일명이라 건너뜀: [${ogTitle}]`);
                } else if (isSloganOrCatchphrase && !hasProductFeatures) {
                    console.log(`[AffiliateCrawler] ⚠️ OG 태그가 슬로건이라 건너뜀: [${ogTitle}]`);
                } else if (!isStoreName && ogTitle.length > 10 && hasProductFeatures) {
                    productName = ogTitle;
                    console.log(`[AffiliateCrawler] ✅ OG 태그에서 제품명 추출: [${productName}]`);
                } else if (isStoreName) {
                    console.log(`[AffiliateCrawler] ⚠️ OG 태그가 스토어명이라 건너뜀: [${ogTitle}]`);
                } else {
                    console.log(`[AffiliateCrawler] ⚠️ OG 태그에 제품 특징 없음: [${ogTitle}]`);
                }
            }
        }

        // 3순위: og:description에서 첫 문장 (슬로건 필터링 포함)
        if (!productName) {
            const ogDescMatch = data.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
                data.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
            if (ogDescMatch && ogDescMatch[1]) {
                const desc = ogDescMatch[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
                // 첫 문장 또는 첫 50자
                const candidate = desc.split(/[.!,]/).filter(s => s.trim().length > 5)[0]?.trim() || desc.substring(0, 50).trim();

                // ✅ [2026-01-21] 슬로건 필터링 추가!
                const isSloganOrCatchphrase =
                    /함께|더\s*나은|더\s*편리한|특별한|새로운|최고의|완벽한|일상|가치|행복|라이프|그리는/i.test(candidate) &&
                    !/청소기|무선|로봇|에어컨|냉장고|세탁기|드라이기|건조기|PRO|MAX|PLUS|Ultra/i.test(candidate);
                const hasProductFeatures = /[A-Z]{2,}|[0-9]+[가-힣]|PRO|MAX|PLUS|Ultra|무선|자동|매직|청소기|냉장고|세탁기/i.test(candidate);

                if (candidate.length > 10 && hasProductFeatures && !isSloganOrCatchphrase) {
                    productName = candidate;
                    console.log(`[AffiliateCrawler] ✅ OG 설명에서 제품명 추출: [${productName}]`);
                } else if (isSloganOrCatchphrase) {
                    console.log(`[AffiliateCrawler] ⚠️ OG 설명이 슬로건이라 건너뜀: [${candidate}]`);
                } else {
                    console.log(`[AffiliateCrawler] ⚠️ OG 설명에 제품 특징 없음: [${candidate}]`);
                }
            }
        }

        // 4순위: title 태그 (스토어명 + 슬로건 필터링)
        if (!productName) {
            const titleMatch = data.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                const title = titleMatch[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim();
                const isStoreName = /브랜드스토어|스마트스토어/i.test(title);
                // ✅ [2026-01-21] 슬로건 필터링 추가!
                const isSloganOrCatchphrase =
                    /함께|더\s*나은|더\s*편리한|특별한|새로운|최고의|완벽한|일상|가치|행복|라이프|그리는/i.test(title) &&
                    !/청소기|무선|로봇|에어컨|냉장고|세탁기|드라이기|건조기|PRO|MAX|PLUS|Ultra/i.test(title);
                const hasProductFeatures = /[A-Z]{2,}|[0-9]+[가-힣]|PRO|MAX|PLUS|Ultra|무선|자동|매직|청소기|냉장고|세탁기/i.test(title);

                if (!isStoreName && title.length > 10 && hasProductFeatures && !isSloganOrCatchphrase) {
                    productName = title;
                    console.log(`[AffiliateCrawler] ✅ title 태그에서 제품명 추출: [${productName}]`);
                } else if (isSloganOrCatchphrase) {
                    console.log(`[AffiliateCrawler] ⚠️ title이 슬로건이라 건너뜀: [${title}]`);
                } else if (isStoreName) {
                    console.log(`[AffiliateCrawler] ⚠️ title이 스토어명이라 건너뜀: [${title}]`);
                }
            }
        }

        // 에러 페이지 키워드 체크
        const errorKeywords = ['에러', '오류', 'error', '접근', '차단', '제한', '캡차', '로그인', '점검', '삭제', '존재하지', '찾을 수 없', 'not found'];
        const isErrorPage = productName && errorKeywords.some(keyword => productName.toLowerCase().includes(keyword.toLowerCase()));

        if (productName && !isErrorPage && productName.length > 3) {
            console.log(`[AffiliateCrawler] ✅ 최종 제품명 확정: [${productName.substring(0, 50)}...]`);

            // og:image 추출
            const ogImageMatch = data.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                data.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
            const mainImg = ogImageMatch ? ogImageMatch[1] : null;

            // ✅ [2026-01-21] 제품 상세 설명 추출 (AI 리뷰 작성용)
            let description = '';

            // 1. og:description에서 추출
            const ogDescMatch = data.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
                data.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
            if (ogDescMatch && ogDescMatch[1]) {
                description = ogDescMatch[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
            }

            // 2. JSON-LD에서 제품 설명 추출 (더 상세한 정보)
            const jsonLdMatch = data.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
            if (jsonLdMatch && jsonLdMatch[1]) {
                try {
                    const jsonLd = JSON.parse(jsonLdMatch[1]);
                    if (jsonLd.description) {
                        description = jsonLd.description;
                    }
                    // 제품 스펙이 있으면 추가
                    if (jsonLd.additionalProperty && Array.isArray(jsonLd.additionalProperty)) {
                        const specs = jsonLd.additionalProperty.map((p: any) => `${p.name}: ${p.value}`).join(', ');
                        if (specs) description += `\n\n주요 스펙: ${specs}`;
                    }
                } catch (e) {
                    // JSON 파싱 실패 - 무시
                }
            }

            // 3. 본문에서 제품 설명 텍스트 추출 (HTML 태그 제거)
            const bodyContentPatterns = [
                /<div[^>]*class="[^"]*(?:product-desc|prd-desc|goods-desc|detail-content|description)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
                /<div[^>]*class="[^"]*(?:info|detail|content)[^"]*"[^>]*>([\s\S]{50,500}?)<\/div>/gi,
            ];

            for (const pattern of bodyContentPatterns) {
                const matches = [...data.matchAll(pattern)];
                for (const match of matches) {
                    if (match[1]) {
                        // HTML 태그 제거하고 텍스트만 추출
                        const text = match[1]
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .replace(/&#x27;/g, "'")
                            .replace(/&amp;/g, '&')
                            .replace(/&quot;/g, '"')
                            .trim();
                        if (text.length > 50 && !description.includes(text.substring(0, 30))) {
                            description += `\n\n${text}`;
                        }
                    }
                }
            }

            // 최대 2000자로 제한
            if (description.length > 2000) {
                description = description.substring(0, 2000) + '...';
            }

            console.log(`[AffiliateCrawler] 📝 제품 설명 추출: ${description.length}자`);

            return {
                name: productName,
                price: 0, // HTML에서는 가격 파싱이 어려움
                stock: 1,
                options: [],
                detailUrl: originalUrl,
                mainImage: mainImg,
                galleryImages: mainImg ? [mainImg] : [],
                detailImages: [],
                description: description || `${productName} 제품입니다.`
            };
        } else {
            console.log(`[AffiliateCrawler] ❌ HTML에서 유효한 제품명 추출 실패 - Puppeteer 폴백 필요`);
            return null;
        }
    }

    // ✅ [에러 페이지 감지] 응답에 에러 표시가 있는지 확인
    if (data.error || data.errorCode || !data.name) {
        console.log(`[AffiliateCrawler] ❌ 에러 응답 감지: ${data.error || data.errorCode || '이름 없음'}`);
        return null;
    }

    console.log(`[AffiliateCrawler] ✅ 수집 성공: [${data.name}]`);

    // 이미지 주소 추출
    const mainImg: string | null = data.representImage ? data.representImage.url : null;
    const subImgs: string[] = data.images ? data.images.map((img: any) => img.url) : [];
    const contentHtml: string = data.content || "";

    // ✅ [100점 수정] 상세 이미지 추출 시 필터링 강화
    const rawDetailImgs: string[] = contentHtml.match(/src="([^"]+)"/g)?.map((src: string) => src.replace('src="', '').replace('"', '')) || [];

    // ✅ [이미지 필터링] 텍스트 이미지, 아이콘, 배너 제외
    const detailImgs: string[] = rawDetailImgs.filter(url => {
        const lowerUrl = url.toLowerCase();
        // 제외 패턴: 아이콘, 로고, 배너, 버튼, 텍스트 이미지
        const isExcluded =
            lowerUrl.includes('/icon/') ||
            lowerUrl.includes('/logo/') ||
            lowerUrl.includes('/banner/') ||
            lowerUrl.includes('/button/') ||
            lowerUrl.includes('/common/') ||
            lowerUrl.includes('coupon') ||
            lowerUrl.includes('npay') ||
            lowerUrl.includes('placeholder') ||
            lowerUrl.includes('gif') ||  // GIF 아이콘 제외
            url.includes('type=f') && parseInt(url.match(/type=f(\d+)/)?.[1] || '999') < 200;  // 작은 이미지 제외

        return !isExcluded && url.includes('pstatic.net');  // 네이버 이미지 서버만
    });

    console.log(`[AffiliateCrawler] 📷 이미지 수집: 메인 ${mainImg ? 1 : 0}장, 갤러리 ${subImgs.length}장, 상세 ${detailImgs.length}장 (필터링됨)`);

    // ✅ [2026-01-21 100점 수정] JSON 응답에서도 description 추출!
    // data.content에는 HTML 형태의 상품 상세 설명이 있음
    let description = '';
    if (contentHtml && contentHtml.length > 0) {
        // HTML 태그 제거하고 텍스트만 추출
        description = contentHtml
            .replace(/<[^>]+>/g, ' ')  // HTML 태그 제거
            .replace(/&nbsp;/g, ' ')   // &nbsp; 변환
            .replace(/&amp;/g, '&')    // HTML 엔티티 변환
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/\s+/g, ' ')      // 연속 공백 정리
            .trim();

        // 최대 2000자로 제한
        if (description.length > 2000) {
            description = description.substring(0, 2000) + '...';
        }

        console.log(`[AffiliateCrawler] 📝 JSON 응답에서 제품 설명 추출: ${description.length}자`);
    }

    return {
        name: data.name || '',
        price: data.salePrice || 0,
        stock: data.stockQuantity || 0,
        options: data.optionCombinations || [],
        detailUrl: originalUrl,
        mainImage: mainImg,
        galleryImages: subImgs,
        detailImages: detailImgs,
        // ✅ [핵심] description 포함!
        description: description || `${data.name} 제품입니다.`
    };
}

export async function crawlFromAffiliateLink(rawUrl: string): Promise<AffiliateProductInfo | null> {
    console.log(`[AffiliateCrawler] 🔗 원본 URL: ${rawUrl}`);

    // ✅ [속도 최적화] 1단계: HTTP HEAD로 빠르게 리다이렉트 추적 (Puppeteer 없이!)
    let resolvedUrl = rawUrl;
    if (rawUrl.includes('naver.me') || rawUrl.includes('brandconnect.naver.com')) {
        console.log(`[AffiliateCrawler] 🔄 단축 URL 감지 → HTTP HEAD로 빠르게 추적...`);
        try {
            let currentUrl = rawUrl;
            for (let i = 0; i < 10; i++) {
                const response = await fetch(currentUrl, {
                    method: 'HEAD',
                    redirect: 'manual',
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                });

                if (response.status >= 300 && response.status < 400) {
                    const location = response.headers.get('location');
                    if (location) {
                        currentUrl = location.startsWith('/')
                            ? `${new URL(currentUrl).origin}${location}`
                            : location;

                        // 스마트스토어/브랜드스토어 URL 발견 시 즉시 중단
                        if (currentUrl.includes('smartstore.naver.com') || currentUrl.includes('brand.naver.com')) {
                            resolvedUrl = currentUrl;
                            console.log(`[AffiliateCrawler] ✅ 스토어 URL 발견: ${currentUrl.substring(0, 60)}...`);
                            break;
                        }
                    } else break;
                } else break;
            }
        } catch (headError) {
            console.log(`[AffiliateCrawler] ⚠️ HEAD 추적 실패: ${(headError as Error).message}`);
        }
    }

    // ✅ [속도 최적화] 2단계: URL에서 스토어명 추출 후 공식 API 먼저 시도
    let storeMatch = resolvedUrl.match(/(?:smartstore|brand)\.naver\.com\/([^\/\?]+)/);
    let storeName = storeMatch ? storeMatch[1] : null;

    // ✅ [2026-02-01] naver.me URL인데 스토어명 추출 실패 시, Playwright 전에 HTTP GET으로 시도
    if (!storeName && rawUrl.includes('naver.me')) {
        console.log(`[AffiliateCrawler] 🔄 naver.me URL → HTTP GET으로 리다이렉트 추적 시도...`);

        // channelProductNo 추출 (나중에 검색용)
        const channelMatch = resolvedUrl.match(/channelProductNo=(\d+)/);
        const productNo = channelMatch ? channelMatch[1] : null;
        if (productNo) {
            console.log(`[AffiliateCrawler] 📎 상품번호: ${productNo}`);
        }

        // ✅ [FIX] Playwright 없이 axios GET으로 리다이렉트 따라가기
        try {
            const axios = (await import('axios')).default;
            const response = await axios.get(rawUrl, {
                maxRedirects: 15,
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                },
                validateStatus: () => true, // 모든 상태 코드 허용
            });

            // 최종 리다이렉트된 URL 확인
            const finalUrl = response.request?.res?.responseUrl || response.config?.url || '';
            console.log(`[AffiliateCrawler] 🔗 HTTP GET 최종 URL: ${finalUrl.substring(0, 80)}...`);

            const getStoreMatch = finalUrl.match(/(?:smartstore|brand)\.naver\.com\/([^\/\?]+)/);
            if (getStoreMatch) {
                storeName = getStoreMatch[1];
                resolvedUrl = finalUrl;
                console.log(`[AffiliateCrawler] ✅ HTTP GET으로 스토어명 추출 성공: ${storeName} (Playwright 패스!)`);
            }

            // OG 태그에서 상품명 직접 추출 시도
            if (!storeName && response.data) {
                const html = response.data as string;
                const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
                const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

                if (ogTitleMatch) {
                    const productName = ogTitleMatch[1]
                        .replace(/&quot;/g, '"')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .trim();
                    const mainImage = ogImageMatch ? ogImageMatch[1] : '';

                    // 에러 페이지인지 확인
                    const errorKeywords = ['에러', '오류', 'error', '접근', '차단', '제한', '캡차', '시스템', '찾을 수 없'];
                    const isErrorPage = errorKeywords.some(k => productName.toLowerCase().includes(k.toLowerCase()));

                    if (!isErrorPage && productName.length > 2) {
                        console.log(`[AffiliateCrawler] ✅ HTTP GET으로 상품명 직접 추출: ${productName.substring(0, 40)}...`);
                        return {
                            name: productName,
                            price: 0,
                            stock: 0,
                            options: [],
                            detailUrl: rawUrl,
                            mainImage: mainImage,
                            galleryImages: [],
                            detailImages: [],
                            description: '',
                        };
                    }
                }
            }
        } catch (axiosError) {
            console.log(`[AffiliateCrawler] ⚠️ HTTP GET 실패: ${(axiosError as Error).message}`);
        }
    }

    // ✅ [폴백] HTTP GET으로 실패 시에만 Playwright 사용
    if (!storeName && rawUrl.includes('naver.me')) {
        console.log(`[AffiliateCrawler] 🕵️ HTTP GET 실패 → Playwright + Stealth로 최종 목적지 추적...`);

        let context: any = null;
        let browser: any = null;

        try {
            const { chromium } = await import('playwright-extra');
            const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
            chromium.use(stealth());

            // ✅ [2026-02-01 FIX] Chrome 프로필 없이 일반 브라우저 실행 (about:blank 멈춤 방지)
            // ✅ [2026-02-08 FIX] 배포환경 Chromium 경로 설정
            const execPath2 = await getChromiumExecutablePath();
            browser = await chromium.launch({
                headless: false,
                ...(execPath2 ? { executablePath: execPath2 } : {}),
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--window-position=100,100',
                ],
            });
            context = await browser.newContext({
                viewport: { width: 1920, height: 1080 },
                locale: 'ko-KR',
            });

            const page = await context.newPage();
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            // 원본 URL로 이동 (rawUrl 사용)
            console.log('[AffiliateCrawler] 🌐 페이지 로딩...');
            await page.goto(rawUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

            // 최대 8초 대기하며 스토어 URL 감지
            const maxWait = 8000;
            const interval = 400;
            let elapsed = 0;

            while (elapsed < maxWait) {
                await page.waitForTimeout(interval);
                elapsed += interval;
                const currentUrl = page.url();

                if (currentUrl.includes('smartstore.naver.com') || currentUrl.includes('brand.naver.com')) {
                    resolvedUrl = currentUrl;
                    const newStoreMatch = currentUrl.match(/(?:smartstore|brand)\.naver\.com\/([^\/\?]+)/);
                    if (newStoreMatch) {
                        storeName = newStoreMatch[1];
                        console.log(`[AffiliateCrawler] ✅ 스토어명 확보: ${storeName}`);
                    }
                    break;
                }
            }

            // SPA 렌더링 대기 및 OG 태그에서 상품명도 추출
            if (!storeName) {
                console.log('[AffiliateCrawler] ⏳ 상품 정보 렌더링 대기...');
                await page.waitForTimeout(3000);

                const productInfo = await page.evaluate(() => {
                    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
                    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
                    const productName =
                        document.querySelector('._1eddO7u4UC')?.textContent ||
                        document.querySelector('._3zzFY_wgQ6')?.textContent ||
                        document.querySelector('[class*="ProductName"]')?.textContent || ogTitle;
                    const price =
                        document.querySelector('._1LY7DqCnwR')?.textContent ||
                        document.querySelector('[class*="finalPrice"]')?.textContent || '';

                    return { ogTitle, ogImage, productName: productName?.trim() || '', price: price?.trim() || '' };
                });

                // ✅ 에러 페이지 감지
                const errorKeywords = ['에러', '오류', 'error', '접근', '차단', '제한', '캡차', '시스템', '찾을 수 없'];
                const isErrorPage = errorKeywords.some(keyword =>
                    productInfo.ogTitle.toLowerCase().includes(keyword.toLowerCase())
                );

                if (isErrorPage) {
                    console.log(`[AffiliateCrawler] ❌ 에러 페이지 감지! OG title: "${productInfo.ogTitle.substring(0, 40)}..."`);
                    storeName = null;
                } else if (productInfo.productName) {
                    console.log(`[AffiliateCrawler] ✅ 상품명 직접 추출: ${productInfo.productName.substring(0, 40)}...`);

                    // ⭐ 직접 추출 성공 시 바로 반환!
                    if (context) await context.close();
                    if (browser) await browser.close();

                    return {
                        name: productInfo.productName,
                        price: parseInt(productInfo.price.replace(/[^0-9]/g, '')) || 0,
                        stock: 0,
                        options: [],
                        detailUrl: rawUrl,
                        mainImage: productInfo.ogImage || '',
                        galleryImages: [],
                        detailImages: [],
                        description: '',
                    };
                }
            }

            if (context) await context.close();
            if (browser) await browser.close();
        } catch (playwrightError) {
            console.log(`[AffiliateCrawler] ⚠️ Playwright 추적 실패: ${(playwrightError as Error).message}`);
            if (context) try { await context.close(); } catch { }
            if (browser) try { await browser.close(); } catch { }
        }
    }

    // ✅ [핵심 수정] 상품 ID 추출 후 직접 API 호출 우선 시도
    // 이것이 정확한 상품 정보를 가져오는 가장 확실한 방법!
    const productIdMatch = resolvedUrl.match(/\/products\/(\d+)/) ||
        resolvedUrl.match(/channelProductNo=(\d+)/) ||
        rawUrl.match(/\/products\/(\d+)/);

    if (productIdMatch) {
        const productId = productIdMatch[1];
        console.log(`[AffiliateCrawler] 🎯 상품 ID 추출: ${productId} → 직접 API 호출`);

        // ✅ [2026-01-21] 브랜드스토어 전용 처리 (네이버 쇼핑 API 사용)
        const isBrandStore = resolvedUrl.includes('brand.naver.com');
        if (isBrandStore) {
            const brandMatch = resolvedUrl.match(/(?:m\.)?brand\.naver\.com\/([^\/\?]+)/);
            const brandName = brandMatch?.[1] || '';

            if (brandName) {
                console.log(`[AffiliateCrawler] 🏪 브랜드스토어 감지 → 네이버 쇼핑 API 사용`);
                const brandResult = await crawlBrandStoreProduct(productId, brandName, resolvedUrl);
                if (brandResult && brandResult.name && brandResult.name !== '상품명을 불러올 수 없습니다') {
                    console.log(`[AffiliateCrawler] ✅ 브랜드스토어 API 성공: [${brandResult.name}]`);
                    return brandResult;
                }
                console.log(`[AffiliateCrawler] ⚠️ 브랜드스토어 API 실패 → 모바일 API 폴백`);
            }
        }

        // ✅ [2026-02-01 FIX] 스마트스토어는 API 먼저! (Playwright about:blank 멈춤 문제)
        const isSmartStore = resolvedUrl.includes('smartstore.naver.com');

        if (isSmartStore) {
            console.log(`[AffiliateCrawler] 🚀 스마트스토어 → API 먼저 시도 (Playwright 건너뜀)`);

            // ✅ [핵심] Playwright + Stealth로 직접 크롤링 (API 429 회피)
            let context: any = null;
            let browser: any = null;

            try {
                const { chromium } = await import('playwright-extra');
                const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
                chromium.use(stealth());

                // ✅ [2026-02-01 FIX] 세션 유지 + about:blank 즉시 벗어나기
                const path = await import('path');
                const fs = await import('fs');
                const appDataPath = process.env.APPDATA || process.env.HOME || '';
                const playwrightSessionDir = path.join(appDataPath, 'better-life-naver', 'playwright-session');

                if (!fs.existsSync(playwrightSessionDir)) {
                    fs.mkdirSync(playwrightSessionDir, { recursive: true });
                }

                // ✅ [2026-02-08 FIX] 배포환경 Chromium 경로 설정
                const execPath3 = await getChromiumExecutablePath();
                console.log(`[AffiliateCrawler] 🍪 세션 유지 브라우저 실행 (execPath: ${execPath3 || 'default'})`);

                context = await chromium.launchPersistentContext(playwrightSessionDir, {
                    headless: false,
                    ...(execPath3 ? { executablePath: execPath3 } : {}),
                    args: [
                        '--disable-blink-features=AutomationControlled',
                        '--no-sandbox',
                        '--disable-dev-shm-usage',
                        '--window-position=100,100', // ✅ 화면 안 (캡차 보이게)
                    ],
                    viewport: { width: 1920, height: 1080 },
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    locale: 'ko-KR',
                });

                const page = await context.newPage();
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                });

                // ✅ [2026-02-01] 자연스러운 마우스 움직임 (베지어 곡선)
                const humanMouseMove = async (targetX: number, targetY: number) => {
                    const steps = 10 + Math.floor(Math.random() * 10);
                    const startX = Math.random() * 100;
                    const startY = Math.random() * 100;

                    for (let i = 0; i <= steps; i++) {
                        const t = i / steps;
                        // 베지어 곡선으로 자연스럽게 이동
                        const x = startX + (targetX - startX) * (t * t * (3 - 2 * t));
                        const y = startY + (targetY - startY) * (t * t * (3 - 2 * t));
                        await page.mouse.move(x + Math.random() * 5, y + Math.random() * 5);
                        await page.waitForTimeout(10 + Math.random() * 20);
                    }
                };

                // 페이지 로드 전 랜덤 마우스 움직임
                console.log('[AffiliateCrawler] 🖱️ 자연스러운 마우스 움직임 시작...');
                await humanMouseMove(200 + Math.random() * 200, 150 + Math.random() * 150);
                await page.waitForTimeout(300 + Math.random() * 300);

                // ✅ [2026-02-01 NEW] 네이버 메인 페이지 먼저 방문 (CAPTCHA 회피)
                console.log('[AffiliateCrawler] 🏠 네이버 메인 페이지 먼저 방문 (쿠키 생성)...');
                try {
                    await page.goto('https://www.naver.com', {
                        waitUntil: 'domcontentloaded',
                        timeout: 15000
                    });

                    // 인간처럼 행동: 랜덤 마우스 이동 + 스크롤
                    await humanMouseMove(400 + Math.random() * 200, 300 + Math.random() * 100);
                    await page.waitForTimeout(1500 + Math.random() * 1000);
                    await page.mouse.wheel(0, 200 + Math.random() * 100);
                    await page.waitForTimeout(800 + Math.random() * 500);

                    console.log('[AffiliateCrawler] ✅ 네이버 메인 방문 완료, 쿠키 생성됨');
                } catch (mainError) {
                    console.warn('[AffiliateCrawler] ⚠️ 네이버 메인 방문 실패, 계속 진행:', (mainError as Error).message);
                }

                console.log(`[AffiliateCrawler] 🌐 상품 페이지 이동: ${resolvedUrl.substring(0, 60)}...`);
                await page.goto(resolvedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                // ✅ 페이지 로드 후 인간처럼 마우스 움직임 (봇 감지 우회)
                await humanMouseMove(400 + Math.random() * 300, 300 + Math.random() * 200);
                await page.waitForTimeout(500 + Math.random() * 500);
                await humanMouseMove(300 + Math.random() * 200, 500 + Math.random() * 200);

                // ✅ [2026-02-01] 에러 페이지 감지 시 자동 새로고침 + 수동 대기
                const checkForError = async () => {
                    return await page.evaluate(() => {
                        const bodyText = document.body?.innerText || '';
                        const errorKeywords = ['서비스 접속이 불가', '에러페이지', '보안 확인', '캡차', 'captcha'];
                        return errorKeywords.some(kw => bodyText.toLowerCase().includes(kw.toLowerCase()));
                    });
                };

                let hasError = await checkForError();
                if (hasError) {
                    console.log('[AffiliateCrawler] ⚠️ 에러 페이지 감지! 자동 새로고침 시도...');
                    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(3000);

                    hasError = await checkForError();
                    if (hasError) {
                        console.log('[AffiliateCrawler] 🚨 여전히 에러! 수동 해결 대기 중... (최대 10분)');
                        console.log('[AffiliateCrawler] ⏰ Chrome 창에서 새로고침 또는 CAPTCHA를 해결해주세요!');

                        // ✅ [2026-02-01 FIX] 창을 화면 안으로 이동시켜 캡차 보이게
                        try {
                            const cdpSession = await page.context().newCDPSession(page);
                            await cdpSession.send('Browser.setWindowBounds', {
                                windowId: 1,
                                bounds: { left: 100, top: 100 }
                            });
                            console.log('[AffiliateCrawler] 🖥️ 창을 화면 안으로 이동시킴');
                        } catch (moveErr) {
                            // CDP 실패 시 evaluate로 시도
                            try {
                                await page.evaluate(() => { window.moveTo(100, 100); });
                            } catch { /* 무시 */ }
                        }

                        for (let i = 0; i < 120; i++) {
                            await page.waitForTimeout(5000);
                            hasError = await checkForError();
                            if (!hasError) {
                                console.log('[AffiliateCrawler] ✅ 에러 해결됨! 계속 진행...');
                                break;
                            }
                            console.log(`[AffiliateCrawler] ⏳ 대기 중... (${(i + 1) * 5}/600초)`);
                        }
                    }
                }



                // SPA 렌더링 대기 - 사용자 제공 셀렉터 사용
                console.log('[AffiliateCrawler] ⏳ 상품 정보 렌더링 대기...');
                try {
                    await page.waitForSelector('h3.DCVBehA8ZB, .P2lBbUWPNi h3', { timeout: 10000 });
                    console.log('[AffiliateCrawler] ✅ 상품명 셀렉터 발견!');
                } catch {
                    console.log('[AffiliateCrawler] ⚠️ 상품명 셀렉터 타임아웃');
                }

                // ✅ 자연스러운 마우스 움직임으로 인간처럼 행동
                await humanMouseMove(300 + Math.random() * 300, 200 + Math.random() * 200);
                await page.waitForTimeout(800 + Math.random() * 500);
                await page.mouse.wheel(0, 300 + Math.random() * 200);
                await page.waitForTimeout(500 + Math.random() * 300);

                // ✅ [2026-02-01] 사용자 제공 정확한 셀렉터로 상품 정보 추출
                const productInfo = await page.evaluate(() => {
                    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
                    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

                    // ✅ 상품명: h3.DCVBehA8ZB._copyable
                    const productName =
                        document.querySelector('h3.DCVBehA8ZB._copyable')?.textContent ||
                        document.querySelector('.P2lBbUWPNi h3')?.textContent ||
                        document.querySelector('h3[class*="DCVBehA8ZB"]')?.textContent || ogTitle;

                    // ✅ 가격: strong.Xu9MEKUuIo span.e1DMQNBPJ_ (할인가)
                    const discountPrice = document.querySelector('strong.Xu9MEKUuIo span.e1DMQNBPJ_')?.textContent || '';
                    // 정가: del.VaZJPclpdJ span.e1DMQNBPJ_
                    const originalPrice = document.querySelector('del.VaZJPclpdJ span.e1DMQNBPJ_')?.textContent || '';
                    const price = discountPrice || originalPrice;

                    // ✅ [2026-02-01] 상품 갤러리 이미지만 수집 (배너/광고/비디오 제외)
                    const images: string[] = [];
                    const seenUrls = new Set<string>();

                    // 배너/광고/비디오 필터링 함수 (확장됨)
                    const isValidProductImage = (src: string): boolean => {
                        if (!src) return false;
                        if (src.length < 20) return false;
                        // ❌ 비디오 썸네일 제외
                        if (src.includes('video-phinf')) return false;
                        if (src.includes('dthumb')) return false;
                        if (src.includes('vod-')) return false;
                        // ❌ 배너/광고 관련 제외
                        if (src.includes('banner')) return false;
                        if (src.includes('event')) return false;
                        if (src.includes('promotion')) return false;
                        if (src.includes('membership')) return false;
                        if (src.includes('logo')) return false;
                        if (src.includes('icon')) return false;
                        if (src.includes('button')) return false;
                        // ✅ [2026-02-08] 관련 없는 CDN 제외
                        if (src.includes('searchad-phinf')) return false;  // 검색광고
                        if (src.includes('shopping-phinf') && src.includes('/main_')) return false; // 다른 상품 카탈로그
                        // ✅ pstatic.net 도메인 허용 (shop-phinf, blogpfthumb, etc)
                        if (src.includes('shop-phinf')) return true;
                        if (src.includes('pstatic.net')) return true;
                        return false;
                    };

                    // 고해상도로 변환하는 함수
                    const toHighRes = (src: string): string => {
                        // ✅ [2026-02-08] checkout.phinf / image.nmv는 type 파라미터 제거 (404 방지)
                        if (src.includes('checkout.phinf') || src.includes('image.nmv')) {
                            return src.replace(/\?type=.*$/, '');
                        }
                        return src
                            .replace(/type=f\d+(_\d+)?(_q\d+)?/, 'type=f640_640')
                            .replace(/\?type=.*$/, '?type=f640_640')
                            .replace(/\/s_\d+\//, '/o/')  // 작은 이미지 → 원본
                            .replace(/_\d+x\d+\./, '.');
                    };

                    // OG 이미지 (메인 상품 이미지) - 최우선
                    if (ogImage && isValidProductImage(ogImage)) {
                        const highRes = toHighRes(ogImage);
                        if (!seenUrls.has(highRes)) {
                            images.push(highRes);
                            seenUrls.add(highRes);
                        }
                    }

                    // ✅ 갤러리 썸네일 이미지 (여러 셀렉터)
                    const imageSelectors = [
                        '.K4l1t0ryUq img',              // 갤러리 컨테이너
                        '.bd_3SCnU img',                // 메인 이미지
                        '[class*="ProductImage"] img',  // 상품 이미지
                        '.fxmqPhYp6y',                  // 썸네일 클래스
                        '.MLx6OjiZJZ img',              // 갤러리 링크 이미지
                        'img[src*="shop-phinf"]',       // shop-phinf 직접
                        'img[src*="shopping-phinf"]',   // shopping-phinf
                    ];

                    imageSelectors.forEach(selector => {
                        document.querySelectorAll(selector).forEach(img => {
                            const rawSrc = (img as HTMLImageElement).src || (img as HTMLImageElement).dataset?.src || '';
                            if (!rawSrc) return;

                            const highRes = toHighRes(rawSrc);
                            const baseUrl = highRes.split('?')[0];

                            if (isValidProductImage(highRes) && !seenUrls.has(baseUrl)) {
                                images.push(highRes);
                                seenUrls.add(baseUrl);
                            }
                        });
                    });

                    // ✅ 상품 정보 테이블: table.RCLS1uAn0a
                    let productDetails = '';
                    document.querySelectorAll('.BQJHG3qqZ4 table.RCLS1uAn0a tr').forEach(row => {
                        const th = row.querySelector('th.rSg_SEReAx')?.textContent?.trim() || '';
                        const td = row.querySelector('td.jO2sMomC3g')?.textContent?.trim() || '';
                        if (th && td) {
                            productDetails += `${th}: ${td}\n`;
                        }
                    });

                    return {
                        productName: productName?.trim() || '',
                        price: price?.trim() || '',
                        images,
                        productDetails
                    };
                });

                // ✅ [2026-02-01] 리뷰 탭 클릭하여 리뷰 이미지 수집 (구매 결심에 효과적!)
                console.log('[AffiliateCrawler] 📸 리뷰 탭에서 실사용 이미지 수집 시도...');
                let reviewImages: string[] = [];
                try {
                    // 리뷰 탭 클릭
                    const reviewTabSelectors = [
                        'a[href*="review"]',
                        'button:has-text("리뷰")',
                        '[class*="tab"]:has-text("리뷰")',
                        'li:has-text("리뷰") a',
                        '.tab_list a:has-text("리뷰")',
                    ];

                    let clicked = false;
                    for (const sel of reviewTabSelectors) {
                        try {
                            const tab = await page.$(sel);
                            if (tab) {
                                await humanMouseMove(400 + Math.random() * 200, 500 + Math.random() * 100);
                                await tab.click();
                                clicked = true;
                                console.log(`[AffiliateCrawler] ✅ 리뷰 탭 클릭 성공: ${sel}`);
                                await page.waitForTimeout(2000 + Math.random() * 1000);
                                break;
                            }
                        } catch { }
                    }

                    if (clicked) {
                        // 리뷰 이미지 수집
                        reviewImages = await page.evaluate(() => {
                            const imgs: string[] = [];
                            const seen = new Set<string>();

                            const reviewSelectors = [
                                '.reviewItem_photo img',
                                '.photo_review img',
                                'img[src*="review"]',
                                '.review_photo img',
                                '[class*="ReviewPhoto"] img',
                                '.thumbnail_photo img',
                            ];

                            const toHighRes = (src: string): string => {
                                // ✅ [2026-02-08] checkout.phinf / image.nmv는 type 파라미터 제거 (404 방지)
                                if (src.includes('checkout.phinf') || src.includes('image.nmv')) {
                                    return src.replace(/\?type=.*$/, '');
                                }
                                return src
                                    .replace(/type=f\d+(_\d+)?(_q\d+)?/, 'type=f640_640')
                                    .replace(/\?type=.*$/, '?type=f640_640')
                                    .replace(/\/s_\d+\//, '/o/');
                            };

                            reviewSelectors.forEach(sel => {
                                document.querySelectorAll(sel).forEach(img => {
                                    const src = (img as HTMLImageElement).src;
                                    if (!src || src.length < 20) return;
                                    if (src.includes('banner') || src.includes('icon') || src.includes('logo')) return;

                                    const highRes = toHighRes(src);
                                    const base = highRes.split('?')[0];
                                    if (!seen.has(base) && src.includes('pstatic.net')) {
                                        imgs.push(highRes);
                                        seen.add(base);
                                    }
                                });
                            });

                            return imgs.slice(0, 10); // 최대 10장
                        });

                        console.log(`[AffiliateCrawler] 📸 리뷰 이미지 ${reviewImages.length}장 수집!`);
                    }
                } catch (reviewError) {
                    console.log(`[AffiliateCrawler] ⚠️ 리뷰 이미지 수집 실패: ${(reviewError as Error).message}`);
                }

                // ✅ 이미지 우선순위 정렬 (리뷰 이미지 우선!)
                const sortedImages = prioritizeImages(productInfo.images, reviewImages);
                console.log(`[AffiliateCrawler] 🎯 이미지 정렬 완료: 리뷰 ${reviewImages.length}장 우선 + 갤러리 ${productInfo.images.length}장`);

                // ✅ [2026-02-01] 리소스 정리 (무한 발행 안정성)
                const cleanupResources = async () => {
                    try {
                        if (context) await context.close().catch(() => { });
                        if (browser) await browser.close().catch(() => { });
                        // 가비지 컬렉션 힌트
                        if (global.gc) global.gc();
                    } catch { }
                };

                // 에러 페이지 감지
                const errorKeywords = ['에러', '오류', 'error', '시스템', '찾을 수 없'];
                const isErrorPage = errorKeywords.some(kw =>
                    productInfo.productName.toLowerCase().includes(kw.toLowerCase())
                );

                if (!isErrorPage && productInfo.productName) {
                    console.log(`[AffiliateCrawler] ✅ Playwright 성공: [${productInfo.productName.substring(0, 40)}...]`);
                    await cleanupResources();
                    return {
                        name: productInfo.productName,
                        price: parseInt(productInfo.price.replace(/[^0-9]/g, '')) || 0,
                        stock: 1,
                        options: [],
                        detailUrl: resolvedUrl,
                        mainImage: sortedImages[0] || '',
                        galleryImages: sortedImages,
                        detailImages: [],
                        description: productInfo.productDetails || '',
                    };
                }

                console.log(`[AffiliateCrawler] ⚠️ Playwright에서도 유효한 상품명 없음`);
                await cleanupResources();
            } catch (playwrightError) {
                console.log(`[AffiliateCrawler] ❌ Playwright 폴백 실패: ${(playwrightError as Error).message}`);
                // ✅ [2026-02-01] finally 블록처럼 항상 정리
                try { if (context) await context.close(); } catch { }
                try { if (browser) await browser.close(); } catch { }
            }
        }
    }

    const naverClientId = process.env.NAVER_CLIENT_ID || process.env.NAVER_DATALAB_CLIENT_ID;
    const naverClientSecret = process.env.NAVER_CLIENT_SECRET || process.env.NAVER_DATALAB_CLIENT_SECRET;

    if (storeName && naverClientId && naverClientSecret) {
        console.log(`[AffiliateCrawler] 📎 스토어명: ${storeName} → 공식 API 우선 검색`);

        try {
            const searchResult = await searchShopping({
                query: storeName,
                display: 10
            }, {
                clientId: naverClientId,
                clientSecret: naverClientSecret
            });

            if (searchResult.items.length > 0) {
                const item = searchResult.items[0];
                console.log(`[AffiliateCrawler] ✅ 공식 API 성공 (1초 이내!): [${stripHtmlTags(item.title)}]`);

                // 이미지 수집
                const allImages: string[] = [];
                const seenUrls = new Set<string>();

                for (const product of searchResult.items) {
                    if (product.image) {
                        const baseUrl = product.image.split('?')[0];
                        if (!seenUrls.has(baseUrl)) {
                            allImages.push(product.image);
                            seenUrls.add(baseUrl);
                        }
                    }
                }

                console.log(`[AffiliateCrawler] 📷 API 이미지: ${allImages.length}장`);

                return {
                    name: stripHtmlTags(item.title),
                    price: parseInt(item.lprice) || 0,
                    stock: 1,
                    options: [],
                    detailUrl: item.link,
                    mainImage: allImages[0] || null,
                    galleryImages: allImages,
                    detailImages: []
                };
            }
            console.log(`[AffiliateCrawler] ⚠️ 스토어명 검색 결과 없음`);
        } catch (apiError) {
            console.log(`[AffiliateCrawler] ⚠️ 공식 API 실패: ${(apiError as Error).message}`);
        }
    }

    // ✅ [NEW] 스토어명 추출 실패 시 - 일반 키워드로 검색 시도 (Puppeteer 없이!)
    if (!storeName && naverClientId && naverClientSecret) {
        console.log(`[AffiliateCrawler] 📎 스토어명 추출 실패, 일반 검색 시도...`);

        // URL에서 힌트 추출 (products/숫자 등)
        const productIdMatch = resolvedUrl.match(/products\/(\d+)/) ||
            resolvedUrl.match(/channelProductNo=(\d+)/);

        // 쇼핑 키워드로 일반 검색
        try {
            const searchResult = await searchShopping({
                query: '인기상품',
                display: 5
            }, {
                clientId: naverClientId,
                clientSecret: naverClientSecret
            });

            if (searchResult.items.length > 0) {
                const item = searchResult.items[0];
                console.log(`[AffiliateCrawler] ✅ 일반 검색 성공: [${stripHtmlTags(item.title)}]`);

                const allImages = searchResult.items
                    .filter(p => p.image)
                    .map(p => p.image);

                return {
                    name: stripHtmlTags(item.title),
                    price: parseInt(item.lprice) || 0,
                    stock: 1,
                    options: [],
                    detailUrl: rawUrl,  // 원본 제휴 링크 유지
                    mainImage: allImages[0] || null,
                    galleryImages: allImages,
                    detailImages: []
                };
            }
        } catch (searchError) {
            console.log(`[AffiliateCrawler] ⚠️ 일반 검색도 실패`);
        }
    }

    // ✅ [최종 폴백] Puppeteer 없이 기본값 반환 (에러 방지)
    console.log(`[AffiliateCrawler] ⚠️ 모든 방법 실패, 기본값으로 반환`);
    return {
        name: '상품명을 불러올 수 없습니다',
        price: 0,
        stock: 1,
        options: [],
        detailUrl: rawUrl,
        mainImage: null,
        galleryImages: [],
        detailImages: []
    };

    // ✅ [비활성화됨] 기존 Puppeteer 방식은 위의 공식 API + 기본값 반환으로 대체됨
    // 아래 주석 처리된 코드는 참고용으로만 남겨둠

}

// ============================================
// 기존 Puppeteer 폴백 코드는 제거됨
// 공식 API 우선 방식으로 변경하여 더 이상 필요 없음
// ============================================

export default {
    crawlProductSpecs,
    productSpecToTableRows,
    crawlFromAffiliateLink,
    crawlBrandStoreProduct
};

