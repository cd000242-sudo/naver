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
    // ✅ [v1.4.77 P2] 2026-04 현행 난독화 클래스 + 구버전 fallback + 범용 셀렉터
    productName: [
        '._1PF-0vpPXO',           // 구버전 (유지)
        '.product_title',
        'h1[class*="product"]',
        '._productName',
        'h2[class*="title"]',     // 신규 범용
        '[class*="ProductName"]', // 신규 범용
        'h1',                     // 최후 폴백
    ],
    price: [
        'strong.Xu9MEKUuIo span.e1DMQNBPJ_',  // 2026-04 현행 할인가
        'del.VaZJPclpdJ span.e1DMQNBPJ_',     // 2026-04 현행 정가
        '._1LY7DqCnwR',                       // 구버전 (유지)
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
     * ✅ [2026-03-14] crawlerBrowser 싱글톤 + 갤러리 썸네일 클릭 방식으로 재작성
     * - crawlerBrowser 모듈로 AdsPower 자동 연동
     * - 추가이미지 썸네일 클릭 → 대표이미지 영역에서 고해상도 이미지 추출
     */
    private async puppeteerStrategy(url: string, options?: CollectionOptions): Promise<CollectionResult> {
        const startTime = Date.now();
        let page: any = null;

        try {
            console.log(`[BrandStore:Playwright] 🕵️ 싱글톤 브라우저로 크롤링 시작...`);

            const { createPage, releasePage, warmup, navigateWithRetry } = await import('../../crawlerBrowser.js');

            page = await createPage();
            await warmup(page);

            // ✅ [v2.10.313] 사용자 진단: "크롬창 자체를 창모드가 아니라 전체모드로 열면 되잖아"
            //   더 간단하고 정확한 해법: viewport를 충분히 크게 잡으면 갤러리/리뷰 영역까지
            //   모두 화면에 들어와 lazy-load 정상 트리거. zoom 축소 + scale factor 트릭 불필요.
            //   2560×1440 (QHD) — 모니터 크기 무관하게 모든 페이지 영역 visible 보장.
            try {
                await page.setViewportSize({ width: 2560, height: 1440 });
                // CDP는 더 이상 필요 없으나 안전망: setPageScaleFactor 1.0 명시 (기본값 reset)
                const cdp = await page.context().newCDPSession(page);
                await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.0 }).catch(() => undefined);
                console.log('[BrandStore:Playwright] 🖥️ viewport 2560x1440 (QHD 전체화면 모드) — 사용자 요구 반영');
            } catch (zoomErr) {
                console.warn('[BrandStore:Playwright] ⚠️ viewport 적용 실패:', (zoomErr as Error).message);
            }

            // 모바일 URL로 변환
            const mobileUrl = url.replace('brand.naver.com', 'm.brand.naver.com');
            console.log(`[BrandStore:Playwright] 🌐 상품 페이지 이동: ${mobileUrl.substring(0, 60)}...`);

            const navSuccess = await navigateWithRetry(page, mobileUrl);
            if (!navSuccess) {
                await releasePage(page);
                return {
                    success: false,
                    images: [],
                    usedStrategy: 'puppeteer-direct',
                    timing: Date.now() - startTime,
                    error: '페이지 로드 실패',
                };
            }

            // ✅ [v2.10.313] viewport 2560x1440 적용으로 zoom 축소 불필요 (사용자 "전체화면" 진단).
            //   다만 lazy intersection observer 트리거 위해 워밍업 스크롤은 유지.
            await page.evaluate(async () => {
                const step = 400;
                const max = Math.min(document.body.scrollHeight, 12000);
                for (let y = 0; y <= max; y += step) {
                    window.scrollTo(0, y);
                    await new Promise(r => setTimeout(r, 80));
                }
                window.scrollTo(0, 0);
            }).catch(() => undefined);
            await page.waitForTimeout(1000);

            // 에러 페이지 감지
            const pageContent = await page.content();
            const errorIndicator = ERROR_PAGE_INDICATORS.find(indicator =>
                pageContent.includes(indicator)
            );

            if (errorIndicator) {
                await releasePage(page);
                return {
                    success: false,
                    images: [],
                    usedStrategy: 'puppeteer-direct',
                    timing: Date.now() - startTime,
                    error: `에러 페이지 감지: "${errorIndicator}"`,
                    isErrorPage: true,
                };
            }

            const allImages: { url: string; type: string }[] = [];
            const seenNorms = new Set<string>();

            const normalizeUrl = (u: string) => u.split('?')[0];

            /**
             * 네이버 이미지 URL을 고해상도로 업스케일.
             * ✅ [v2.10.314 BUG FIX] type=f860은 실제 네이버 CDN에서 404 반환하는 무효 type.
             *   사용자 제보: "추가이미지나 대표이미지는 수집 저장 안 되어있네요" — 시뮬레이션 fetch에서 404.
             *   실측 검증: ?type=o1000 → 200 OK (49~67KB 정상 이미지)
             *   조치: f860 → o1000 으로 교체. o1000은 1000px width 원본급 검증된 type.
             */
            const upscaleUrl = (u: string): string => {
                const typeMatch = u.match(/\?type=([a-z])(\d+)/);
                if (typeMatch) {
                    const size = parseInt(typeMatch[2]);
                    if (size < 500) {
                        return u.replace(/\?type=[a-z]\d+[^&]*/, '?type=o1000');
                    }
                }
                return u;
            };

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
                if (lower.endsWith('.gif') || lower.endsWith('.svg')) return true;
                return false;
            };

            const addImg = (rawUrl: string, type: string) => {
                if (isJunkUrl(rawUrl)) return;
                const url = upscaleUrl(rawUrl);
                const norm = normalizeUrl(url);
                if (seenNorms.has(norm)) return;
                seenNorms.add(norm);
                allImages.push({ url, type });
            };

            // ═══════════════════════════════════════════════════
            // PHASE 0: 갤러리 썸네일 클릭 → 큰 이미지 추출
            // ═══════════════════════════════════════════════════
            console.log('[BrandStore:Playwright] 🖱️ PHASE 0: 갤러리 썸네일 클릭 → 큰 이미지 추출...');

            try {
                // ✅ [v2.10.313] viewport 2560x1440 + 워밍업 스크롤로 lazy-load 이미 트리거됨.
                //   PHASE 0 진입 시점엔 갤러리 DOM 안정적으로 렌더된 상태.
                const thumbImgs = await page.$$('img[alt^="추가이미지"]');

                if (thumbImgs.length > 0) {
                    console.log(`[BrandStore:Playwright] ✅ 추가이미지 ${thumbImgs.length}개 발견 (viewport 2560x1440)`);

                    // 대표이미지 먼저 수집 (alt="대표이미지" 모바일/데스크톱 둘 다 시도)
                    let mainImgEl = await page.$('img[alt="대표이미지"]');
                    if (!mainImgEl) {
                        // 데스크톱 페이지 폴백: 첫 번째 추가이미지의 부모 a 클릭한 결과로 잡힌 큰 이미지
                        mainImgEl = await page.$('[data-shp-area="topi.image"] img, .product-detail__main-image img, [class*="ProductImage_main"] img');
                    }
                    if (mainImgEl) {
                        const mainSrc = await mainImgEl.evaluate((img: HTMLImageElement) =>
                            img.getAttribute('data-src') || img.src || ''
                        );
                        if (mainSrc) addImg(mainSrc, 'main');
                    }

                    // 각 추가이미지 썸네일 클릭 → 대표이미지 영역에서 큰 이미지 추출
                    let prevBigSrc = '';
                    for (let i = 0; i < thumbImgs.length; i++) {
                        try {
                            // ✅ [v2.10.309+317] scrollIntoView로 viewport 안에 위치 강제 (QHD viewport + scroll 이중 보장)
                            await thumbImgs[i].evaluate((el: HTMLElement) => {
                                el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
                            }).catch(() => undefined);
                            await page.waitForTimeout(200);

                            const parent = await thumbImgs[i].evaluateHandle((el: HTMLElement) =>
                                el.closest('li') || el.closest('a') || el
                            );
                            await (parent || thumbImgs[i]).click();

                            // ✅ [v2.10.310] blur placeholder 회귀 패치 — Playwright MCP 실측에서
                            //   13개 클릭이 모두 같은 ?type=blur0_8 placeholder URL 반환 → dedup 후 1장만 남는 회귀.
                            //   원인: 클릭 직후 큰 이미지가 lazy-load 교체되는데 우리가 너무 빨리 읽음.
                            //   조치: (1) blur URL 자체를 거부 (2) 새 큰 이미지가 로드될 때까지 최대 2.5초 polling
                            //         (3) timeout 시 썸네일 fallback (upscale)
                            const isBlur = (u: string) => /[?&]type=blur/i.test(u);
                            let bigSrc = '';
                            const POLL_MAX = 10; // 2.5초 (250ms * 10)
                            for (let p = 0; p < POLL_MAX; p++) {
                                await page.waitForTimeout(250);
                                let bigImgEl = await page.$('img[alt="대표이미지"]');
                                if (!bigImgEl) {
                                    bigImgEl = await page.$('[data-shp-area="topi.image"] img');
                                }
                                if (!bigImgEl) continue;
                                const cur = await bigImgEl.evaluate((img: HTMLImageElement) =>
                                    img.getAttribute('data-src') || img.src || ''
                                );
                                // blur placeholder는 건너뜀, 이전 클릭의 URL과 같으면 아직 교체 안 됨
                                if (!cur || isBlur(cur) || cur === prevBigSrc) continue;
                                bigSrc = cur;
                                break;
                            }

                            if (bigSrc) {
                                addImg(bigSrc, 'gallery');
                                prevBigSrc = bigSrc;
                                console.log(`[BrandStore:Playwright] 📸 추가이미지 ${i + 1} 클릭 → 큰 이미지 추출 OK`);
                            } else {
                                // ✅ [v2.10.309+310+317] 큰 이미지 polling 실패 → 썸네일 자체 src를 fallback으로 사용
                                //   upscaleUrl()이 ?type=o1000으로 업스케일 처리 (작은 type=f40 → 1000px). v2.10.315 fix.
                                const thumbSrc = await thumbImgs[i].evaluate((img: HTMLImageElement) =>
                                    img.getAttribute('data-src') || img.src || ''
                                );
                                if (thumbSrc) {
                                    addImg(thumbSrc, 'gallery-thumb-fallback');
                                    console.log(`[BrandStore:Playwright] 📷 추가이미지 ${i + 1} polling 타임아웃 → 썸네일 fallback (upscale)`);
                                }
                            }
                        } catch (clickErr) { /* 개별 클릭 실패 무시 */ }
                    }
                    console.log(`[BrandStore:Playwright] ✅ PHASE 0 완료: ${allImages.length}개 갤러리 이미지`);
                } else {
                    console.log('[BrandStore:Playwright] ℹ️ 추가이미지 없음 → PHASE 1 진행');
                }
            } catch (phase0Err) {
                console.warn('[BrandStore:Playwright] ⚠️ PHASE 0 실패:', (phase0Err as Error).message);
            }

            // ═══════════════════════════════════════════════════
            // PHASE 1: OG 이미지 안전망 (Phase 0에서 못 가져온 경우)
            // ═══════════════════════════════════════════════════
            if (allImages.length === 0) {
                console.log('[BrandStore:Playwright] ⚠️ Phase 0에서 이미지 없음 → OG 이미지 폴백');
                const ogUrl = await page.evaluate(() =>
                    document.querySelector('meta[property="og:image"]')?.getAttribute('content') || ''
                );
                if (ogUrl) addImg(ogUrl, 'main');
            }

            // ═══════════════════════════════════════════════════
            // ✅ PHASE 2: 리뷰 이미지 수집
            // ═══════════════════════════════════════════════════
            console.log('[BrandStore:Playwright] 📝 PHASE 2: 리뷰 이미지 수집...');

            try {
                // ✅ [v2.10.310] 리뷰 탭 회귀 패치 — "리뷰이벤트" 별도 페이지 링크 클릭 시 navigation
                //   일어나 context 파괴되는 회귀 차단. MCP 실측: "리뷰이벤트" /review-event/list 페이지로 이동.
                //   조치: navigation 일으키는 <a href="...review-event..."> 제외, 진짜 리뷰 탭만 클릭.
                try {
                    const reviewTabClicked = await page.evaluate(() => {
                        const candidates = Array.from(document.querySelectorAll('a, button, [role="tab"]'));
                        const reviewTab = candidates.find(t => {
                            const text = t.textContent?.trim() || '';
                            // 정확히 "리뷰" 또는 "리뷰 (N)" 또는 "리뷰 N건" 패턴만. "리뷰이벤트"/"리뷰포인트" 제외.
                            const isReviewLabel = /^리뷰(\s*\(|\s*\d|$)/.test(text) && !/리뷰이벤트|리뷰포인트|리뷰적립/.test(text);
                            if (!isReviewLabel) return false;
                            // navigation 일으키는 <a href="...review-event..."> 류 제외
                            if (t.tagName === 'A') {
                                const href = t.getAttribute('href') || '';
                                if (href.includes('review-event') || href.includes('review-point') || /^https?:\/\//.test(href)) {
                                    return false;
                                }
                            }
                            return true;
                        });
                        if (reviewTab) {
                            (reviewTab as HTMLElement).click();
                            return { clicked: true, label: (reviewTab.textContent || '').trim().substring(0, 30) };
                        }
                        return { clicked: false };
                    });
                    if (reviewTabClicked.clicked) {
                        console.log(`[BrandStore:Playwright] 📋 리뷰 탭 클릭 OK ("${reviewTabClicked.label}")`);
                        await page.waitForTimeout(2000);
                    } else {
                        console.log('[BrandStore:Playwright] ℹ️ 리뷰 탭 못 찾음 (이미 lazy-load 되어 있거나 페이지 구조 다름)');
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

                const reviewUrls: string[] = await page.evaluate(() => {
                    const results: string[] = [];
                    const addUrl = (u: string | null | undefined) => {
                        if (u && u.startsWith('http') && !u.startsWith('data:')) results.push(u);
                    };
                    // ✅ [v2.10.312] 사용자 케이스(homelia/12059215662) MCP 실측에서 발견:
                    //   alt="review_image" img가 12개 페이지에 직접 로드되어 있는데
                    //   기존 셀렉터 [class*="review"] img 가 alt 기반 셀렉터 누락으로 못 잡음.
                    //   조치: alt="review_image" / alt^="리뷰" 직접 셀렉터 추가.
                    const reviewSelectors = [
                        'img[alt="review_image"]',
                        'img[alt^="리뷰"]',
                        '[class*="review"] img',
                        '[class*="Review"] img',
                        '[data-testid*="review"] img',
                        '[class*="photo_review"] img',
                        '[data-shp-area*="review"] img',
                    ];
                    for (const sel of reviewSelectors) {
                        try {
                            document.querySelectorAll(sel).forEach(img => {
                                const el = img as HTMLImageElement;
                                const src = el.getAttribute('data-src') || el.src || '';
                                if (src.includes('profile') || src.includes('star') ||
                                    src.includes('icon') || src.includes('logo') ||
                                    src.includes('badge') || src.includes('emoji') ||
                                    src.endsWith('.gif') || src.endsWith('.svg')) return;
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
                console.log(`[BrandStore:Playwright] ✅ PHASE 2 완료: 리뷰 이미지 ${reviewUrls.length}개`);
            } catch (phase2Err) {
                console.warn('[BrandStore:Playwright] ⚠️ PHASE 2 실패:', (phase2Err as Error).message);
            }

            // ✅ [v2.10.314] 사용자 명시 요구: "추가이미지 먼저 배치, 그다음 리뷰이미지"
            //   최종 정리: 메인 → 갤러리(추가이미지) → 갤러리 폴백(thumb-upscale) → 리뷰
            //   소제목 N개에 배치 시 갤러리 이미지부터 N개 우선 채워지고 부족 시 리뷰로 보완.
            const mainImages = allImages.filter(i => i.type === 'main');
            const galleryImages = allImages.filter(i => i.type === 'gallery');
            const galleryFallbackImages = allImages.filter(i => i.type === 'gallery-thumb-fallback');
            const reviewImages = allImages.filter(i => i.type === 'review');

            const sortedImages = [
                ...mainImages,
                ...galleryImages,            // 클릭으로 큰 이미지 추출 성공
                ...galleryFallbackImages,    // 클릭 실패 → 썸네일 upscale 폴백
                ...reviewImages,             // 리뷰는 갤러리 다음 (사용자 요구)
            ].slice(0, 100);
            const images: ProductImage[] = sortedImages as ProductImage[];

            console.log(`[BrandStore:Playwright] 📋 우선순위 정렬: 메인 ${mainImages.length} → 갤러리 ${galleryImages.length} → 갤러리폴백 ${galleryFallbackImages.length} → 리뷰 ${reviewImages.length}`);

            // 제품 정보 추출
            const productInfo = await page.evaluate(() => {
                const name =
                    document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
                const price =
                    document.querySelector('[class*="price"]')?.textContent || '';
                return { name: name.trim(), price: price.trim() };
            }) as ProductInfo;

            await releasePage(page);

            console.log(`[BrandStore:Playwright] ✅ 최종 ${images.length}개 (메인: ${mainImages.length}, 갤러리: ${galleryImages.length}, 리뷰: ${reviewImages.length})`);

            return {
                success: images.length > 0,
                images,
                productInfo,
                usedStrategy: 'puppeteer-direct',
                timing: Date.now() - startTime,
            };

        } catch (error) {
            console.error(`[BrandStore:Playwright] ❌ 오류:`, (error as Error).message);
            if (page) {
                try {
                    const { releasePage } = await import('../../crawlerBrowser.js');
                    await releasePage(page);
                } catch { /* */ }
            }
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
