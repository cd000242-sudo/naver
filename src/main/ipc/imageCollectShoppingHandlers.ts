// src/main/ipc/imageCollectShoppingHandlers.ts
// 쇼핑몰(브랜드스토어/스마트스토어/쿠팡) 이미지 수집 IPC 핸들러
// [v2.10.253] main.ts에서 분리 — god-file 압축 12단계.
//
// 분리 1개 핸들러:
//   image:collectFromShopping — URL 입력 → 플랫폼 감지 → 이미지 수집 → AI Vision 필터링

import { ipcMain } from 'electron';
import { loadConfig } from '../../configManager.js';
import { validateLicenseAndQuota, isFreeTierUser } from '../utils/authUtils.js';
import { consume as consumeQuota } from '../../quotaManager.js';
import { filterDuplicateAndLowQualityImages } from '../utils/imageFilters.js';

export function registerImageCollectShoppingHandlers(): void {
    ipcMain.handle('image:collectFromShopping', async (_event, url: string) => {
        // ✅ [리팩토링] 통합 검증
        const check = await validateLicenseAndQuota('media', 1);
        if (!check.valid) return check.response;

        try {
            console.log('[Main] ════════════════════════════════════════');
            console.log('[Main] 🛒 쇼핑몰 이미지 수집 시작:', url);

            // ✅ [v2.10.306+307] 단축 URL + brandconnect 사전 resolve
            //   사용자 제보: naver.me URL 입력 시 이미지 1장만 수집됨.
            //   v2.10.306: SHORT_URL_PATTERNS만 처리 → brandconnect.naver.com까지만 resolve되고 멈춤.
            //   v2.10.307: brandconnect.naver.com 패턴 추가. smartCrawler.ts:459의 정확한 셀렉터와 일치.
            //   조치: brandconnect URL도 한 번 더 resolve해서 최종 brand.naver.com까지 도달.
            const SHORT_URL_PATTERNS = /naver\.me\/|brandconnect\.naver\.com\/|link\.coupang\.com\/|coupa\.ng\/|bit\.ly\/|goo\.gl\/|t\.ly\/|tinyurl\.com\//;
            const MAX_RESOLVE_HOPS = 3; // naver.me → brandconnect → brand.naver.com 같은 다단계 redirect 대응
            let hopCount = 0;
            while (SHORT_URL_PATTERNS.test(url) && hopCount < MAX_RESOLVE_HOPS) {
                const { resolveShortUrl } = await import('../../sourceAssembler.js');
                try {
                    const resolved = await resolveShortUrl(url);
                    if (resolved && resolved !== url) {
                        console.log(`[Main] 🔗 단축 URL resolve hop ${hopCount + 1}: ${url.substring(0, 60)}... → ${resolved.substring(0, 80)}...`);
                        url = resolved;
                        hopCount++;
                    } else {
                        console.warn(`[Main] ⚠️ resolve 정체 (hop ${hopCount + 1}) — 원본 URL 그대로 진행: ${url.substring(0, 80)}`);
                        break;
                    }
                } catch (resolveErr) {
                    console.warn(`[Main] ⚠️ resolve 오류: ${(resolveErr as Error).message}`);
                    break;
                }
            }

            // ✅ 플랫폼 감지 (resolve 후 URL 기준)
            const isBrandStore = url.includes('brand.naver.com');
            const isSmartStore = url.includes('smartstore.naver.com');
            const isCoupang = url.includes('coupang.com') || url.includes('coupa.ng');

            let images: string[] = [];
            let title = '';
            let productInfo: any = {};

            if (isBrandStore) {
                // ✅ [v2.10.308] 브랜드스토어 회귀 fix: fetchShoppingImages → BrandStoreProvider 전환
                //   사용자 제보: "추가이미지 셀렉터를 분명 줬는데 또 돌아왔니"
                //   회귀 원인: crawler/shopping/providers/BrandStoreProvider.ts에 사용자가 알려준
                //              정확한 메커니즘 (img[alt^="추가이미지"] 클릭 → 큰 이미지 추출 PHASE 0,
                //              리뷰 이미지 수집 PHASE 2) 존재하나, 본 handler가 fetchShoppingImages
                //              경로로 빠뜨려서 Provider 우회.
                //   조치: SmartStore/Coupang와 동일하게 collectShoppingImages(Provider) 사용.
                console.log('[Main] 🏪 브랜드스토어 감지 → BrandStoreProvider 사용 (추가이미지 클릭 + 리뷰 수집)');
                const { collectShoppingImages } = await import('../../crawler/shopping/index.js');
                const result = await collectShoppingImages(url, {
                    timeout: 30000,
                    maxImages: 100,
                    includeDetails: true,
                    includeReviews: true,    // ✅ 리뷰 이미지 수집 활성화 (사용자 요청)
                    useCache: true,
                });

                if (result.isErrorPage) {
                    console.error('[Main] ❌ 브랜드스토어 에러 페이지:', result.error);
                    return { success: false, message: result.error || '에러 페이지', isErrorPage: true };
                }

                images = (result.images || []).map((img: any) => typeof img === 'string' ? img : img.url);
                title = result.productInfo?.name || '';
                productInfo = result.productInfo || { name: title };
                console.log(`[Main] 📊 BrandStoreProvider 결과: ${images.length}개 이미지, 전략=${result.usedStrategy}`);

                // ✅ [2026-02-08] 이미지 7장 미만이면 crawlBrandStoreProduct 폴백으로 추가 수집
                const MIN_BRAND_IMAGES = 7;
                if (images.length < MIN_BRAND_IMAGES) {
                    console.log(`[Main] ⚠️ 브랜드스토어 이미지 ${images.length}개 < 목표 ${MIN_BRAND_IMAGES}개 → 폴백 크롤러 호출`);
                    try {
                        // URL에서 productId와 brandName 추출
                        const productIdMatch = url.match(/\/products\/(\d+)/) || url.match(/channelProductNo=(\d+)/);
                        const brandMatch = url.match(/(?:m\.)?brand\.naver\.com\/([^\/\?]+)/);
                        const productId = productIdMatch?.[1] || '';
                        const brandName = brandMatch?.[1] || '';

                        if (productId && brandName) {
                            const { crawlBrandStoreProduct } = await import('../../crawler/productSpecCrawler.js');
                            const fallbackResult = await crawlBrandStoreProduct(productId, brandName, url);

                            if (fallbackResult) {
                                // ✅ AffiliateProductInfo에서 이미지 추출 (mainImage + galleryImages + detailImages)
                                const fallbackAllImages: string[] = [];
                                if (fallbackResult.mainImage) fallbackAllImages.push(fallbackResult.mainImage);
                                if (fallbackResult.galleryImages?.length) fallbackAllImages.push(...fallbackResult.galleryImages);
                                if (fallbackResult.detailImages?.length) fallbackAllImages.push(...fallbackResult.detailImages);

                                // 폴백에서 얻은 이미지 병합 (중복 제거)
                                const existingNorm = new Set(images.map(u => u.split('?')[0]));
                                const fallbackImages = fallbackAllImages
                                    .filter((img: string) => {
                                        const norm = img.split('?')[0];
                                        return !existingNorm.has(norm) && img.startsWith('http');
                                    });

                                if (fallbackImages.length > 0) {
                                    images = [...images, ...fallbackImages];
                                    console.log(`[Main] ✅ 폴백 크롤러에서 ${fallbackImages.length}개 추가 이미지 수집 → 총 ${images.length}개`);
                                }

                                // 상품명이 없으면 폴백에서 가져오기
                                if (!title && fallbackResult.name && fallbackResult.name !== '상품명을 불러올 수 없습니다') {
                                    title = fallbackResult.name;
                                    productInfo.name = title;
                                    console.log(`[Main] ✅ 폴백 크롤러에서 상품명 추출: "${title}"`);
                                }
                                if (!productInfo.price && fallbackResult.price) {
                                    productInfo.price = fallbackResult.price;
                                }
                            }
                        } else {
                            console.log(`[Main] ⚠️ URL에서 productId/brandName 추출 실패 → 폴백 건너뜀`);
                        }
                    } catch (fallbackErr) {
                        console.warn(`[Main] ⚠️ 브랜드스토어 폴백 크롤링 오류:`, (fallbackErr as Error).message);
                    }
                }
            } else if (isSmartStore || isCoupang) {
                // ✅ 스마트스토어/쿠팡: 새 모듈화된 크롤러 사용
                console.log(`[Main] 🏪 ${isSmartStore ? '스마트스토어' : '쿠팡'} 감지 → 새 크롤러 사용`);
                const { collectShoppingImages } = await import('../../crawler/shopping/index.js');

                // ✅ [v2.10.308] includeReviews: true 활성화 — 사용자 요청 (추가이미지 다 모은 후 리뷰이미지)
                const result = await collectShoppingImages(url, {
                    timeout: 30000,
                    maxImages: 100,
                    includeDetails: true,
                    includeReviews: true,
                    useCache: true,
                });

                if (result.isErrorPage) {
                    console.error('[Main] ❌ 에러 페이지 감지:', result.error);
                    return { success: false, message: result.error || '에러 페이지입니다', isErrorPage: true };
                }

                if (!result.success) {
                    console.warn('[Main] ⚠️ 이미지 수집 실패:', result.error);
                    return { success: false, message: result.error || '이미지를 수집할 수 없습니다' };
                }

                images = result.images.map(img => img.url);
                title = result.productInfo?.name || '';
                productInfo = result.productInfo || {};

                console.log(`[Main] 📊 사용된 전략: ${result.usedStrategy}`);
                console.log(`[Main] ⏱️ 소요 시간: ${result.timing}ms`);
            } else {
                // ✅ 기타 쇼핑몰: 기존 방식 폴백
                console.log('[Main] 🏪 기타 쇼핑몰 → 기존 방식 사용');
                const { fetchShoppingImages } = await import('../../sourceAssembler.js');
                const result = await fetchShoppingImages(url, { imagesOnly: true });

                images = result.images || [];
                title = result.title || '';
                productInfo = {
                    name: title,
                    price: result.price,
                    description: result.description,
                };
            }

            console.log(`[Main] ✅ 쇼핑몰 이미지 수집 완료: ${images.length}개`);

            // ✅ [2026-02-01 FIX] 1단계: 배너/배찌/마크 등 비제품 이미지 URL 필터링
            const filteredImages = filterDuplicateAndLowQualityImages(images);
            console.log(`[Main] 🎯 1단계 URL 필터 후: ${filteredImages.length}개 (제외: ${images.length - filteredImages.length}개)`);

            // ✅ [2026-02-27] 2~4단계: 이미지 콘텐츠 분석 + 유사도 필터 + AI Vision 분류
            let analyzedImages = filteredImages;
            if (filteredImages.length > 1) {
                try {
                    const config = await loadConfig();
                    const { analyzeAndFilterShoppingImages } = await import('../../image/shoppingImageAnalyzer.js');
                    analyzedImages = await analyzeAndFilterShoppingImages(filteredImages, {
                        referenceImageUrl: filteredImages[0], // 갤러리 대표 이미지
                        geminiApiKey: config.geminiApiKey || '',
                        openaiApiKey: (config as any).openaiApiKey || '',
                    });
                    console.log(`[Main] 🔬 2~4단계 분석 후: ${analyzedImages.length}개 (추가 제외: ${filteredImages.length - analyzedImages.length}개)`);
                } catch (analyzeErr) {
                    console.warn(`[Main] ⚠️ 2단계 분석 실패, 1단계 결과 사용:`, (analyzeErr as Error).message);
                    analyzedImages = filteredImages;
                }
            }

            console.log('[Main] ════════════════════════════════════════');

            const response = {
                success: analyzedImages.length > 0,
                images: analyzedImages,
                title,
                productInfo,
            };

            if ((response.images?.length ?? 0) > 0 && (await isFreeTierUser())) {
                await consumeQuota('media', 1);
            }
            return response;

        } catch (error) {
            console.error('[Main] ❌ 쇼핑몰 이미지 수집 실패:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    console.log('[IPC] Image collect-shopping handlers registered (1 handler)');
}
