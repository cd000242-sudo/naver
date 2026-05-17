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

            // ✅ 플랫폼 감지
            const isBrandStore = url.includes('brand.naver.com');
            const isSmartStore = url.includes('smartstore.naver.com');
            const isCoupang = url.includes('coupang.com') || url.includes('coupa.ng');

            let images: string[] = [];
            let title = '';
            let productInfo: any = {};

            if (isBrandStore) {
                // ✅ [2026-02-08] 브랜드스토어: fetchShoppingImages + crawlBrandStoreProduct 이중 수집
                console.log('[Main] 🏪 브랜드스토어 감지 → 강화된 이미지 수집');
                const { fetchShoppingImages } = await import('../../sourceAssembler.js');
                const result = await fetchShoppingImages(url, { imagesOnly: true });

                images = result.images || [];
                title = result.title || '';
                productInfo = {
                    name: title,
                    price: result.price,
                    description: result.description,
                };

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

                // ✅ [2026-02-27] maxImages 30→100 확대 (대량 수집)
                const result = await collectShoppingImages(url, {
                    timeout: 30000,
                    maxImages: 100,
                    includeDetails: true,
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
