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
} from '../types.js';
import { upscaleUrl, isJunkUrl, normalizeUrl } from '../utils/imageUrlUtils.js';
import { collectReviewImageUrls, clickReviewTab, extractBrandProductInfo } from './brandStore/brandStoreDom.js';

// Puppeteer는 동적 import로 가져옴 (Electron 환경 호환)
let puppeteer: typeof import('puppeteer');

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

            // Use the desktop brand-store URL first. Some product pages render an
            // error page on m.brand.naver.com while the desktop gallery is valid.
            const pageUrl = url.replace('m.brand.naver.com', 'brand.naver.com');
            console.log(`[BrandStore:Playwright] 🌐 상품 페이지 이동: ${pageUrl.substring(0, 60)}...`);

            const navSuccess = await navigateWithRetry(page, pageUrl);
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

            // 에러 페이지 감지는 HTML 원문이 아니라 실제 보이는 제목/본문 기준으로만 판단한다.
            const pageProbe = await page.evaluate(() => ({
                title: document.title || '',
                bodyText: document.body?.innerText?.slice(0, 5000) || '',
            })).catch(() => ({ title: '', bodyText: '' }));
            const errorIndicator = this.detectErrorPage(pageProbe);

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

            const addImg = (rawUrl: string, type: string) => {
                if (/[?&]type=blur/i.test(rawUrl)) return;
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

                    const directThumbUrls: string[] = [];
                    for (const thumb of thumbImgs) {
                        try {
                            const thumbSrc = await thumb.evaluate((img: HTMLImageElement) =>
                                img.getAttribute('data-src') || img.src || ''
                            );
                            if (thumbSrc) {
                                directThumbUrls.push(thumbSrc);
                                const hasMain = allImages.some(img => img.type === 'main');
                                addImg(thumbSrc, hasMain ? 'gallery-thumb-fallback' : 'main');
                            }
                        } catch { /* skip */ }
                    }
                    if (directThumbUrls.length > 0) {
                        console.log(`[BrandStore:Playwright] ⚡ 공식 갤러리 썸네일 ${directThumbUrls.length}개 즉시 수집 (upscale)`);
                    }
                    const shouldClickThumbnails = directThumbUrls.length < Math.min(3, thumbImgs.length);
                    if (!shouldClickThumbnails) {
                        console.log('[BrandStore:Playwright] ⚡ 공식 갤러리 URL 확보 완료 → 느린 클릭 polling 생략');
                    } else {

                    // ✅ [v2.10.319] isBlur 함수를 루프 외부로 추출 (매 iteration 재선언 제거 — 10팀 팀4)
                    //   blur placeholder URL 검출. ?type=blur0_8 등 네이버 CDN 패턴.
                    const isBlur = (u: string) => /[?&]type=blur/i.test(u);

                    // ✅ [v2.10.319] PHASE 0 전체 deadline — 13장 × 2.5초 = 32초 폭주 방지 (10팀 팀4)
                    const PHASE0_DEADLINE_MS = 25000;
                    const phase0Start = Date.now();

                    // 각 추가이미지 썸네일 클릭 → 대표이미지 영역에서 큰 이미지 추출
                    let prevBigSrc = '';
                    for (let i = 0; i < thumbImgs.length; i++) {
                        // ✅ [v2.10.319] deadline 초과 시 남은 썸네일은 fallback src로만 빠르게 수집
                        if (Date.now() - phase0Start > PHASE0_DEADLINE_MS) {
                            console.warn(`[BrandStore:Playwright] ⏰ PHASE 0 deadline(${PHASE0_DEADLINE_MS}ms) 초과 — 남은 ${thumbImgs.length - i}장은 썸네일 fallback`);
                            for (let j = i; j < thumbImgs.length; j++) {
                                try {
                                    const ts = await thumbImgs[j].evaluate((img: HTMLImageElement) =>
                                        img.getAttribute('data-src') || img.src || '');
                                    if (ts) addImg(ts, 'gallery-thumb-fallback');
                                } catch { /* skip */ }
                            }
                            break;
                        }
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

                            // ✅ [v2.10.310] blur placeholder 회귀 패치 — 13개 클릭이 모두 같은
                            //   ?type=blur0_8 placeholder URL 반환 → dedup 후 1장만 남는 회귀.
                            //   조치: blur URL 거부 + 새 큰 이미지 로드까지 최대 2.5초 polling + timeout 시 썸네일 fallback
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
                        } catch (clickErr) {
                            // ✅ [v2.10.319] catch 묵음 → console.warn 기록 (10팀 팀4 — 디버깅 가능하게)
                            console.warn(`[BrandStore:Playwright] ⚠️ 추가이미지 ${i + 1} 클릭 처리 실패:`, (clickErr as Error).message);
                        }
                    }
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
            if (options?.includeReviews === true) {
                console.log('[BrandStore:Playwright] 📝 PHASE 2: 리뷰 이미지 수집...');
                try {
                // ✅ [v2.10.310] 리뷰 탭 회귀 패치 — "리뷰이벤트" 별도 페이지 링크 클릭 시 navigation
                //   일어나 context 파괴되는 회귀 차단. MCP 실측: "리뷰이벤트" /review-event/list 페이지로 이동.
                //   조치: navigation 일으키는 <a href="...review-event..."> 제외, 진짜 리뷰 탭만 클릭.
                try {
                    const reviewTabClicked = await page.evaluate(clickReviewTab);
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

                const reviewUrls: string[] = await page.evaluate(collectReviewImageUrls);

                for (const rawUrl of reviewUrls) {
                    addImg(rawUrl, 'review');
                }
                console.log(`[BrandStore:Playwright] ✅ PHASE 2 완료: 리뷰 이미지 ${reviewUrls.length}개`);
                } catch (phase2Err) {
                    console.warn('[BrandStore:Playwright] ⚠️ PHASE 2 실패:', (phase2Err as Error).message);
                }
            } else {
                console.log('[BrandStore:Playwright] 🛡️ 리뷰 이미지는 저작권 안전 기본값으로 수집하지 않습니다.');
            }

            // ✅ [v2.10.314] 사용자 명시 요구: "추가이미지 먼저 배치, 그다음 리뷰이미지"
            //   최종 정리: 메인 → 갤러리(추가이미지) → 갤러리 폴백(thumb-upscale) → 리뷰
            //   소제목 N개에 배치 시 갤러리 이미지부터 N개 우선 채워지고 부족 시 리뷰로 보완.
            const mainImages = allImages.filter(i => i.type === 'main');
            const galleryImages = allImages.filter(i => i.type === 'gallery');
            const galleryFallbackImages = allImages.filter(i => i.type === 'gallery-thumb-fallback');
            const reviewImages = options?.includeReviews === true
                ? allImages.filter(i => i.type === 'review')
                : [];

            const sortedImages = [
                ...mainImages,
                ...galleryImages,            // 클릭으로 큰 이미지 추출 성공
                ...galleryFallbackImages,    // 클릭 실패 → 썸네일 upscale 폴백
                ...reviewImages,             // 리뷰는 갤러리 다음 (사용자 요구)
            ].slice(0, 100);
            const images: ProductImage[] = sortedImages as ProductImage[];

            console.log(`[BrandStore:Playwright] 📋 우선순위 정렬: 메인 ${mainImages.length} → 갤러리 ${galleryImages.length} → 갤러리폴백 ${galleryFallbackImages.length} → 리뷰 ${reviewImages.length}`);

            // 제품 정보 추출
            const productInfo = await page.evaluate(extractBrandProductInfo) as ProductInfo;

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
            const errorIndicator = this.detectErrorPage({ html });

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

}
