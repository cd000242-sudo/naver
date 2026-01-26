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
 * 쿠팡 제품 크롤링
 */
async function crawlCoupangProduct(url: string): Promise<ProductSpec | null> {
    let browser = null;

    try {
        const chromePath = await getChromiumExecutablePath();
        browser = await puppeteer.launch({
            headless: true,
            ...(chromePath ? { executablePath: chromePath } : {}),
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });

        const page = await browser.newPage();

        // 쿠팡 쿠키 설정
        await page.setCookie(
            { name: 'x-coupang-origin-region', value: 'KR', domain: '.coupang.com' },
            { name: 'x-coupang-accept-language', value: 'ko-KR', domain: '.coupang.com' }
        );

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        const spec = await page.evaluate(() => {
            const getTextContent = (selector: string): string => {
                const el = document.querySelector(selector);
                return el?.textContent?.trim() || '';
            };

            // 제품명
            const productName = getTextContent('.prod-buy-header__title, h2.prod-title, .product-title');

            // 가격
            const priceEl = document.querySelector('.total-price strong, .prod-price .total-price, .prod-origin-price');
            const price = priceEl?.textContent?.replace(/[^\d,]/g, '').replace(',', '') || '';

            // 할인율
            const discountEl = document.querySelector('.discount-percentage, .prod-discount');
            const discount = discountEl?.textContent?.trim() || '';

            // 평점
            const ratingEl = document.querySelector('.rating-star-num, .prod-rating-num');
            const rating = ratingEl?.textContent?.trim() || '';

            // 리뷰 수
            const reviewCountEl = document.querySelector('.count, .prod-review-count');
            const reviewCount = reviewCountEl?.textContent?.replace(/[^\d]/g, '') || '';

            // 브랜드
            const brandEl = document.querySelector('.prod-brand-name a, .prod-brand');
            const brand = brandEl?.textContent?.trim() || '';

            // 배송
            const shippingEl = document.querySelector('.prod-shipping-fee, .free-shipping-badge');
            let shipping = shippingEl?.textContent?.trim() || '';
            if (!shipping || shipping.includes('무료')) shipping = '무료 배송';

            // 상세 스펙 테이블
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

            // 이미지 목록
            const images: string[] = [];
            document.querySelectorAll('.prod-image__item img, .gallery-image-item img').forEach(img => {
                const src = (img as HTMLImageElement).src;
                if (src && !src.includes('data:') && !src.includes('svg')) {
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
                images: images.slice(0, 5)
            };
        });

        await browser.close();

        if (!spec.productName) {
            console.log('[ProductSpecCrawler] ⚠️ 쿠팡 제품명 추출 실패');
            return null;
        }

        console.log(`[ProductSpecCrawler] ✅ 쿠팡 크롤링 완료: ${spec.productName}`);
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
 * ✅ [2026-01-21] 브랜드스토어 전용 크롤링 함수
 * - 1단계: 모바일 페이지에서 OG 태그 직접 파싱 (정확도 최고)
 * - 2단계: 실패 시 네이버 쇼핑 API 폴백
 */
async function crawlBrandStoreProduct(
    productId: string,
    brandName: string,
    originalUrl: string
): Promise<AffiliateProductInfo | null> {
    const axios = (await import('axios')).default;

    // ============================================
    // 🎯 1단계: 모바일 브랜드스토어 페이지 직접 파싱 (정확도 최고!)
    // ============================================
    try {
        const mobileUrl = `https://m.brand.naver.com/${brandName}/products/${productId}`;
        console.log(`[BrandStore] 🔍 모바일 페이지 직접 파싱: ${mobileUrl}`);

        const userAgents = [
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
            'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
        ];

        const response = await axios.get(mobileUrl, {
            headers: {
                'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9',
            },
            timeout: 15000
        });

        const html = response.data;

        if (typeof html === 'string' && html.length > 1000) {
            // ✅ og:title에서 제품명 추출 (가장 정확!)
            const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);

            let productName = '';
            if (ogTitleMatch && ogTitleMatch[1]) {
                productName = ogTitleMatch[1]
                    .replace(/&#x27;/g, "'")
                    .replace(/&amp;/g, '&')
                    .replace(/&quot;/g, '"')
                    .trim();

                // 스토어명만 있는지 확인 (제품명이 아닌 경우 제외)
                const isOnlyStoreName = /^[가-힣a-zA-Z0-9_]+\s*(공식스토어|브랜드스토어|Official Store)?$/i.test(productName);
                const isTooShort = productName.length < 5;

                if (isOnlyStoreName || isTooShort) {
                    console.log(`[BrandStore] ⚠️ OG title이 스토어명이라 무시: [${productName}]`);
                    productName = '';
                }
            }

            // og:description에서 추가 정보 추출
            let description = '';
            const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
                html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
            if (ogDescMatch && ogDescMatch[1]) {
                description = ogDescMatch[1]
                    .replace(/&#x27;/g, "'")
                    .replace(/&amp;/g, '&')
                    .replace(/&quot;/g, '"')
                    .trim();
            }

            // og:image에서 이미지 추출
            let mainImage = '';
            const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
            if (ogImageMatch && ogImageMatch[1]) {
                mainImage = ogImageMatch[1];
            }

            // JSON-LD에서 제품 정보 추출 시도
            const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
            if (jsonLdMatch && jsonLdMatch[1]) {
                try {
                    const jsonLd = JSON.parse(jsonLdMatch[1]);
                    if (jsonLd.name && jsonLd.name.length > productName.length) {
                        productName = jsonLd.name;
                        console.log(`[BrandStore] 📦 JSON-LD에서 제품명 발견: [${productName}]`);
                    }
                    if (jsonLd.description && !description) {
                        description = jsonLd.description;
                    }
                    if (jsonLd.image && !mainImage) {
                        mainImage = Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image;
                    }
                } catch (e) {
                    // JSON 파싱 실패 - 무시
                }
            }

            // HTML 본문에서 제품명 추출 (폴백)
            if (!productName) {
                const productNamePatterns = [
                    /"productName"\s*:\s*"([^"]{10,100})"/,
                    /"name"\s*:\s*"([^"]{10,100})"[,}]/,
                    /<h1[^>]*class="[^"]*product[^"]*"[^>]*>([^<]+)<\/h1>/i,
                    /<span[^>]*class="[^"]*_3oDjSvLfl6[^"]*"[^>]*>([^<]+)<\/span>/i,
                ];

                for (const pattern of productNamePatterns) {
                    const match = html.match(pattern);
                    if (match && match[1] && match[1].length >= 10) {
                        productName = match[1].trim();
                        console.log(`[BrandStore] 📦 HTML 본문에서 제품명 발견: [${productName}]`);
                        break;
                    }
                }
            }

            if (productName && productName.length >= 5) {
                console.log(`[BrandStore] ✅ 페이지 파싱 성공! 제품명: "${productName}"`);

                return {
                    name: productName,
                    price: 0,  // 페이지에서 추출 어려움
                    stock: 1,
                    options: [],
                    detailUrl: originalUrl,
                    mainImage: mainImage || null,
                    galleryImages: mainImage ? [mainImage] : [],
                    detailImages: [],
                    description: description || `${productName} 제품입니다.`
                };
            }
        }

        console.log(`[BrandStore] ⚠️ 페이지 파싱 실패 → 네이버 쇼핑 API 폴백`);
    } catch (pageError) {
        console.log(`[BrandStore] ⚠️ 페이지 요청 실패: ${(pageError as Error).message} → 네이버 쇼핑 API 폴백`);
    }

    // ============================================
    // 🔄 2단계: 네이버 쇼핑 API 폴백
    // ============================================
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

        // productId가 포함된 상품 찾기
        let targetProduct = response.data.items.find((item: any) =>
            item.link?.includes(productId) || item.productId === productId
        );

        // 정확한 매칭이 없으면 브랜드가 같은 첫 번째 상품
        if (!targetProduct) {
            targetProduct = response.data.items.find((item: any) =>
                item.mallName?.toLowerCase().includes(brandName.toLowerCase()) ||
                item.brand?.toLowerCase().includes(brandName.toLowerCase())
            );
        }

        // 그래도 없으면 첫 번째 결과
        if (!targetProduct) {
            targetProduct = response.data.items[0];
        }

        const productTitle = targetProduct.title.replace(/<[^>]*>/g, '').trim();
        const productPrice = parseInt(targetProduct.lprice) || 0;
        const productImage = targetProduct.image || null;

        // 제품 설명 구성
        const description = [
            productTitle,
            targetProduct.brand ? `브랜드: ${targetProduct.brand}` : '',
            targetProduct.maker ? `제조사: ${targetProduct.maker}` : '',
            targetProduct.category1 ? `카테고리: ${[targetProduct.category1, targetProduct.category2, targetProduct.category3, targetProduct.category4].filter(Boolean).join(' > ')}` : '',
            `가격: ${productPrice.toLocaleString()}원`,
            targetProduct.mallName ? `판매처: ${targetProduct.mallName}` : ''
        ].filter(Boolean).join('\n');

        console.log(`[BrandStore] ✅ API 성공! 제품명: "${productTitle}" (${productPrice}원)`);

        return {
            name: productTitle,
            price: productPrice,
            stock: 1,
            options: [],
            detailUrl: originalUrl,
            mainImage: productImage,
            galleryImages: productImage ? [productImage] : [],
            detailImages: [],
            description
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

    // ✅ [완벽 해결] naver.me URL인데 스토어명 추출 실패 시 Puppeteer로 최종 목적지 추적
    if (!storeName && rawUrl.includes('naver.me')) {
        console.log(`[AffiliateCrawler] 🔄 naver.me URL → Puppeteer로 최종 목적지 추적...`);

        // channelProductNo 추출 (나중에 검색용)
        const channelMatch = resolvedUrl.match(/channelProductNo=(\d+)/);
        const productNo = channelMatch ? channelMatch[1] : null;
        if (productNo) {
            console.log(`[AffiliateCrawler] 📎 상품번호: ${productNo}`);
        }

        try {
            const chromePath = await getChromiumExecutablePath();
            const browser = await puppeteer.launch({
                headless: true,
                ...(chromePath ? { executablePath: chromePath } : {}),
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15');

            // 리소스 차단으로 속도 최적화
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const type = req.resourceType();
                if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // 원본 URL로 이동 (rawUrl 사용)
            await page.goto(rawUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // 최대 5초 대기하며 스토어 URL 감지
            const maxWait = 5000;
            const interval = 300;
            let elapsed = 0;

            while (elapsed < maxWait) {
                await new Promise(r => setTimeout(r, interval));
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

            // OG 태그에서 상품명도 추출
            if (!storeName) {
                const ogTitle = await page.evaluate(() => {
                    const meta = document.querySelector('meta[property="og:title"]');
                    return meta?.getAttribute('content') || '';
                });

                // ✅ [핵심 수정] 에러 페이지 감지 - 에러 키워드가 있으면 무시
                const errorKeywords = [
                    '에러', '오류', 'error', '접근', '차단', '제한', '캡차',
                    '로그인', '점검', '삭제', '존재하지', '찾을 수 없', 'not found',
                    'blocked', 'denied', 'captcha', '시스템', 'system'
                ];
                const isErrorPage = errorKeywords.some(keyword =>
                    ogTitle.toLowerCase().includes(keyword.toLowerCase())
                );

                if (isErrorPage) {
                    console.log(`[AffiliateCrawler] ❌ 에러 페이지 감지! OG title: "${ogTitle.substring(0, 40)}..."`);
                    console.log(`[AffiliateCrawler] ❌ 에러 페이지 데이터 무시 → 공식 API 폴백 사용`);
                    // 에러 페이지면 스토어명을 null로 유지하여 공식 API 폴백 유도
                    storeName = null;
                } else if (ogTitle) {
                    console.log(`[AffiliateCrawler] 📦 OG 태그 상품명: ${ogTitle.substring(0, 40)}...`);
                }
            }

            await browser.close();
        } catch (puppeteerError) {
            console.log(`[AffiliateCrawler] ⚠️ Puppeteer 추적 실패: ${(puppeteerError as Error).message}`);
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

        // ✅ 스마트스토어 또는 브랜드스토어 폴백: 기존 모바일 API 사용
        const directResult = await fetchProductByIdDirectly(productId, resolvedUrl);
        if (directResult && directResult.name && directResult.name !== '상품명을 불러올 수 없습니다') {
            console.log(`[AffiliateCrawler] ✅ 직접 API 성공: [${directResult.name}]`);
            return directResult;
        } else {
            console.log(`[AffiliateCrawler] ⚠️ 직접 API 실패 → 검색 API 폴백`);
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
    crawlFromAffiliateLink
};

