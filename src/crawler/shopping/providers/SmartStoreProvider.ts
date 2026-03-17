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
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CHROME_UA = MOBILE_UA; // 모바일 API용

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
            // ✅ [2026-02-27 FIX] 1순위: Playwright + Stealth (사용자가 CAPTCHA 풀어줌, 가장 확실)
            name: 'playwright-stealth',
            priority: 1,
            execute: (url, options) => this.puppeteerStrategy(url, options),
        },
        {
            // [2순위] 모바일 API (Playwright 실패 시 폴백)
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
            const seenUrls = new Set<string>();

            const addImage = (url: string, type: string) => {
                const norm = url.split('?')[0];
                if (url && !seenUrls.has(norm)) {
                    seenUrls.add(norm);
                    images.push({ url, type: type as any });
                }
            };

            // 대표 이미지
            if (product.representImage?.url) {
                addImage(product.representImage.url, 'main');
            }

            // 추가 이미지 (갤러리)
            if (product.productImages && Array.isArray(product.productImages)) {
                for (const img of product.productImages) {
                    if (img.url) addImage(img.url, 'gallery');
                }
            }

            // ✅ [2026-02-27 FIX] 상세 이미지 배열 (있으면)
            if (product.detailImages && Array.isArray(product.detailImages)) {
                for (const img of product.detailImages.slice(0, 100)) {
                    if (img.url) addImage(img.url, 'detail');
                }
            }

            // ✅ [2026-02-27 FIX] 상세 콘텐츠 HTML에서 이미지 추출 (detailContentUrl 또는 contentHtml)
            const detailHtml = product.detailContent || product.contentHtml || product.detailInfo?.detailHtml || '';
            if (detailHtml && typeof detailHtml === 'string') {
                const htmlImgRegex = /(?:src|data-src|data-original)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
                let htmlMatch;
                while ((htmlMatch = htmlImgRegex.exec(detailHtml)) !== null) {
                    addImage(htmlMatch[1], 'detail');
                }
                console.log(`[SmartStore:API] 📄 상세 HTML에서 이미지 추출: ${images.filter(i => i.type === 'detail').length}개`);
            }

            // ✅ [2026-02-27 FIX] 상세 콘텐츠 URL이 있으면 별도 fetch
            const detailContentUrl = product.detailContentUrl || product.detailInfoUrl;
            if (detailContentUrl && typeof detailContentUrl === 'string' && images.filter(i => i.type === 'detail').length < 5) {
                try {
                    console.log(`[SmartStore:API] 📡 상세 콘텐츠 URL fetch: ${detailContentUrl.substring(0, 60)}...`);
                    const detailResp = await fetch(detailContentUrl, {
                        headers: { 'User-Agent': CHROME_UA, 'Referer': url },
                    });
                    const detailBody = await detailResp.text();
                    const detailImgRegex = /(?:src|data-src|data-original)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
                    let detailMatch;
                    while ((detailMatch = detailImgRegex.exec(detailBody)) !== null) {
                        addImage(detailMatch[1], 'detail');
                    }
                    console.log(`[SmartStore:API] 📄 상세 URL에서 추가 이미지: ${images.filter(i => i.type === 'detail').length}개`);
                } catch (detailErr) {
                    console.warn(`[SmartStore:API] ⚠️ 상세 콘텐츠 URL fetch 실패:`, (detailErr as Error).message);
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
     * ✅ [2026-03-13 v4] Playwright + Stealth + 싱글톤 브라우저
     * - crawlerBrowser 모듈로 브라우저 재사용 (프로필 충돌/브라우저 누수 방지)
     * - 호출 간 3초 쿨다운 + 5분 미사용 시 자동 정리
     * - 자동 리트라이 + 워밍업 내장
     */
    private async puppeteerStrategy(url: string, options?: CollectionOptions): Promise<CollectionResult> {
        const startTime = Date.now();
        let page: any = null;

        try {
            console.log(`[SmartStore:Playwright] 🕵️ 싱글톤 브라우저로 크롤링 시작...`);

            const { createPage, releasePage, warmup, navigateWithRetry } = await import('../../crawlerBrowser.js');

            page = await createPage();

            // 워밍업 (5분 이내 이전 워밍업 있으면 자동 스킵)
            await warmup(page);

            // 모바일 URL로 변환 + 자동 리트라이 (CAPTCHA/에러 → 워밍업 → 재시도)
            const mobileUrl = url.replace('smartstore.naver.com', 'm.smartstore.naver.com');
            console.log(`[SmartStore:Playwright] 🌐 상품 페이지 이동: ${mobileUrl.substring(0, 60)}...`);

            const navSuccess = await navigateWithRetry(page, mobileUrl);
            if (!navSuccess) {
                console.log('[SmartStore:Playwright] ❌ 모든 리트라이 실패');
                await releasePage(page);
                return {
                    success: false,
                    images: [],
                    usedStrategy: 'playwright-stealth',
                    timing: Date.now() - startTime,
                    error: '페이지 로드 실패 (CAPTCHA/에러)',
                };
            }

            // 에러 페이지 최종 감지
            const finalPageContent = await page.content();
            const errorIndicator = ERROR_PAGE_INDICATORS.find(indicator =>
                finalPageContent.includes(indicator)
            );

            if (errorIndicator) {
                console.log(`[SmartStore:Playwright] ⚠️ 최종 에러 페이지 감지: ${errorIndicator}`);
            }

            // ═══════════════════════════════════════════════════════════════
            // ✅ [2026-03-12] 정확한 제품 이미지만 수집 (영역 기반)
            // ═══════════════════════════════════════════════════════════════

            const allImages: { url: string; type: string }[] = [];
            const seenNorms = new Set<string>();

            /** URL 정규화 (쿼리 제거) */
            const normalizeUrl = (u: string) => u.split('?')[0];

            /** 네이버 이미지 URL을 고해상도로 업스케일 (작은 이미지만) */
            const upscaleUrl = (u: string): string => {
                const typeMatch = u.match(/\?type=([a-z])(\d+)/);
                if (typeMatch) {
                    const size = parseInt(typeMatch[2]);
                    // 500px 미만 썸네일만 업스케일, m1000_pd 같은 큰 이미지는 유지
                    if (size < 500) {
                        return u.replace(/\?type=[a-z]\d+[^&]*/, '?type=f860');
                    }
                }
                return u;
            };

            /** 비제품 이미지 필터 */
            const isJunkUrl = (src: string): boolean => {
                if (!src || !src.startsWith('http')) return true;
                if (src.startsWith('data:')) return true;
                const lower = src.toLowerCase();
                const junkPatterns = [
                    'logo', 'icon', 'searchad-phinf', 'button', 'emoji',
                    'storefront', 'sprite', '1x1', 'gnb_', 'favicon',
                    'video-phinf', 'ssl.pstatic.net/static', 'placeholder',
                    'ncpt.naver.com', 'nid.naver.com',
                    'banner', 'member', 'npay', 'npoint', 'badge', 'arrow',
                ];
                if (junkPatterns.some(p => lower.includes(p))) return true;
                // ✅ GIF/SVG는 UI 요소일 가능성 높음
                if (lower.endsWith('.gif') || lower.endsWith('.svg')) return true;
                return false;
            };

            /** 중복 체크 후 추가 */
            const addImg = (rawUrl: string, type: string) => {
                if (isJunkUrl(rawUrl)) return;
                const url = upscaleUrl(rawUrl);
                const norm = normalizeUrl(url);
                if (seenNorms.has(norm)) return;
                seenNorms.add(norm);
                allImages.push({ url, type });
            };

            // ───────────────────────────────────────────────
            // ✅ [2026-03-14] PHASE 0: 갤러리 썸네일 클릭 → 큰 이미지 추출
            // 추가이미지 썸네일(f40)을 클릭하면 대표이미지 영역에 고해상도 이미지 로드
            // ───────────────────────────────────────────────
            console.log('[SmartStore:Playwright] 🖱️ PHASE 0: 갤러리 썸네일 클릭 → 큰 이미지 추출...');

            try {
                // 1. 추가이미지 썸네일 찾기
                const thumbImgs = await page.$$('img[alt^="추가이미지"]');

                if (thumbImgs.length > 0) {
                    console.log(`[SmartStore:Playwright] ✅ 추가이미지 ${thumbImgs.length}개 발견`);

                    // 2. 대표이미지 먼저 수집
                    const mainImgEl = await page.$('img[alt="대표이미지"]');
                    if (mainImgEl) {
                        const mainSrc = await mainImgEl.evaluate((img: HTMLImageElement) =>
                            img.getAttribute('data-src') || img.src || ''
                        );
                        if (mainSrc) addImg(mainSrc, 'main');
                    }

                    // 3. 각 추가이미지 썸네일 클릭 → 대표이미지 영역에서 큰 이미지 추출
                    for (let i = 0; i < thumbImgs.length; i++) {
                        try {
                            // 썸네일 클릭 (또는 부모 li/a 클릭)
                            const parent = await thumbImgs[i].evaluateHandle((el: HTMLElement) =>
                                el.closest('li') || el.closest('a') || el
                            );
                            await (parent || thumbImgs[i]).click();
                            await page.waitForTimeout(500 + Math.random() * 300);

                            // 대표이미지 영역에서 변경된 큰 이미지 URL 가져오기
                            const bigImgEl = await page.$('img[alt="대표이미지"]');
                            if (bigImgEl) {
                                const bigSrc = await bigImgEl.evaluate((img: HTMLImageElement) =>
                                    img.getAttribute('data-src') || img.src || ''
                                );
                                if (bigSrc) {
                                    addImg(bigSrc, 'gallery');
                                    console.log(`[SmartStore:Playwright] 📸 추가이미지 ${i + 1} 클릭 → 큰 이미지 추출 OK`);
                                }
                            }
                        } catch {
                            // 개별 클릭 실패 무시
                        }
                    }
                    console.log(`[SmartStore:Playwright] ✅ PHASE 0 완료: ${allImages.length}개 고해상도 갤러리 이미지`);
                } else {
                    console.log('[SmartStore:Playwright] ℹ️ 추가이미지 없음 → PHASE 1 진행');
                }
            } catch (phase0Err) {
                console.warn('[SmartStore:Playwright] ⚠️ PHASE 0 실패:', (phase0Err as Error).message);
            }

            // ───────────────────────────────────────────────
            // PHASE 1: OG 이미지 안전망 (Phase 0에서 못 가져온 경우)
            // ───────────────────────────────────────────────
            if (allImages.length === 0) {
                console.log('[SmartStore:Playwright] ⚠️ Phase 0에서 이미지 없음 → OG 이미지 폴백');
                const ogUrl = await page.evaluate(() =>
                    document.querySelector('meta[property="og:image"]')?.getAttribute('content') || ''
                );
                if (ogUrl) addImg(ogUrl, 'main');
            }

            // ───────────────────────────────────────────────
            // ✅ [2026-03-14] PHASE 2: 리뷰 이미지 수집
            // ───────────────────────────────────────────────
            console.log('[SmartStore:Playwright] 📝 PHASE 2: 리뷰 이미지 수집...');

            try {
                // ✅ 리뷰 탭 클릭 (탭 없이는 리뷰 DOM이 로드되지 않음!)
                try {
                    const reviewTabClicked = await page.evaluate(() => {
                        // 네이버 모바일 탭 구조: 상품정보 | 리뷰(N) | 문의 | 교환/반품
                        const tabs = Array.from(document.querySelectorAll('a, button, [role="tab"]'));
                        const reviewTab = tabs.find(t => {
                            const text = t.textContent?.trim() || '';
                            return /^리뷰/.test(text) || /리뷰\s*\(/.test(text) || /리뷰\s*\d/.test(text);
                        });
                        if (reviewTab) {
                            (reviewTab as HTMLElement).click();
                            return true;
                        }
                        return false;
                    });
                    if (reviewTabClicked) {
                        console.log('[SmartStore:Playwright] 📋 리뷰 탭 클릭 OK');
                        await page.waitForTimeout(2000);
                    }
                } catch {}

                // 리뷰 탭 클릭 후 스크롤 (lazy-load 트리거)
                await page.evaluate(async () => {
                    const step = 600;
                    let scrolled = 0;
                    const maxScroll = Math.min(document.body.scrollHeight, 15000);
                    while (scrolled < maxScroll) {
                        window.scrollBy(0, step);
                        scrolled += step;
                        await new Promise(r => setTimeout(r, 100 + Math.random() * 60));
                    }
                });
                await page.waitForTimeout(1500);

                // 리뷰 이미지 추출
                const reviewUrls: string[] = await page.evaluate(() => {
                    const results: string[] = [];
                    const addUrl = (u: string | null | undefined) => {
                        if (u && u.startsWith('http') && !u.startsWith('data:')) results.push(u);
                    };

                    // 리뷰 영역 내부 이미지만 수집
                    const reviewSelectors = [
                        '[class*="review"] img',
                        '[class*="Review"] img',
                        '[data-testid*="review"] img',
                        '[class*="photo_review"] img',
                    ];
                    for (const sel of reviewSelectors) {
                        try {
                            document.querySelectorAll(sel).forEach(img => {
                                const el = img as HTMLImageElement;
                                const src = el.getAttribute('data-src') || el.src || '';
                                // 프로필 사진, 별점 아이콘 등 제외
                                if (src.includes('profile') || src.includes('star') ||
                                    src.includes('icon') || src.includes('logo') ||
                                    src.includes('badge') || src.includes('emoji') ||
                                    src.endsWith('.gif') || src.endsWith('.svg')) return;
                                // shop-phinf 또는 일반 이미지 확장자만 허용
                                if (src.includes('phinf.pstatic.net') || /\.(jpg|jpeg|png|webp)/i.test(src)) {
                                    addUrl(src);
                                }
                            });
                        } catch {}
                    }
                    return results;
                });

                for (const rawUrl of reviewUrls) {
                    addImg(rawUrl, 'review');
                }
                console.log(`[SmartStore:Playwright] ✅ PHASE 2 완료: 리뷰 이미지 ${reviewUrls.length}개`);
            } catch (phase2Err) {
                console.warn('[SmartStore:Playwright] ⚠️ PHASE 2 실패:', (phase2Err as Error).message);
            }

            // 최종 정리: 메인 > 갤러리 > 리뷰 순서
            const mainImages = allImages.filter(i => i.type === 'main');
            const galleryImages = allImages.filter(i => i.type === 'gallery');
            const reviewImages = allImages.filter(i => i.type === 'review');

            const sortedImages = [...mainImages, ...galleryImages, ...reviewImages].slice(0, 100);
            const images: ProductImage[] = sortedImages as ProductImage[];

            console.log(`[SmartStore:Playwright] 📊 최종: 총 ${images.length}개`);
            console.log(`  ├ 메인: ${mainImages.length}개`);
            console.log(`  ├ 갤러리: ${galleryImages.length}개`);
            console.log(`  └ 리뷰: ${reviewImages.length}개`);

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

            // ✅ [2026-03-13] 페이지만 해제 (브라우저 컨텍스트는 재사용)
            await releasePage(page);

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
            // 페이지만 정리 (컨텍스트는 재사용)
            if (page) {
                try {
                    const { releasePage } = await import('../../crawlerBrowser.js');
                    await releasePage(page);
                } catch { /* */ }
            }
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
                    if (images.length >= 50) break; // ✅ [2026-02-27] 한도 확대: 10→50개
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
