/**
 * 쇼핑몰 크롤러 허브 (메인 진입점)
 * @module crawler/shopping/index
 * 
 * URL을 분석하여 적절한 Provider로 라우팅
 * 캐싱, 레이트 리밋, 에러 핸들링 통합
 */

import { CollectionResult, CollectionOptions, ShoppingPlatform, ProductImage, ShoppingCollectionDiagnostics } from './types.js';
import { resolveUrl, detectPlatform } from './utils/UrlResolver.js';
import { imageCache } from './utils/ImageCache.js';
import { rateLimiter } from './utils/RateLimiter.js';
import { BaseProvider } from './providers/BaseProvider.js';
import { BrandStoreProvider } from './providers/BrandStoreProvider.js';
import { SmartStoreProvider } from './providers/SmartStoreProvider.js';
import { CoupangProvider } from './providers/CoupangProvider.js';

/**
 * 등록된 Provider 목록
 */
const providers: BaseProvider[] = [
    new BrandStoreProvider(),
    new SmartStoreProvider(),
    new CoupangProvider(),
];

function countByType(images: ProductImage[] = [], type: ProductImage['type']): number {
    return images.filter(img => img.type === type).length;
}

function buildDiagnostics(result: CollectionResult): ShoppingCollectionDiagnostics {
    const imageCount = result.images?.length ?? 0;
    const warnings: string[] = [];

    if (imageCount === 0) {
        warnings.push('상품 이미지를 찾지 못했습니다. 링크가 상품 페이지인지, 로그인/품절/차단 페이지로 이동했는지 확인이 필요합니다.');
    } else if (imageCount < 3) {
        warnings.push('수집 이미지가 3개 미만입니다. 썸네일만 잡혔거나 상세/리뷰 이미지 로딩이 제한됐을 수 있습니다.');
    }

    if (!result.productInfo?.name) {
        warnings.push('상품명이 확인되지 않았습니다. og:title 또는 상품 메타데이터가 비어 있습니다.');
    }

    return {
        imageCount,
        galleryCount: countByType(result.images, 'gallery') + countByType(result.images, 'main') + countByType(result.images, 'gallery-thumb-fallback'),
        detailCount: countByType(result.images, 'detail'),
        reviewCount: countByType(result.images, 'review'),
        quality: imageCount === 0 ? 'failed' : imageCount < 3 ? 'weak' : 'ok',
        warnings,
    };
}

function attachDiagnostics(result: CollectionResult): CollectionResult {
    const diagnostics = buildDiagnostics(result);
    if (diagnostics.quality === 'failed' && result.success) {
        return {
            ...result,
            success: false,
            diagnostics,
            error: result.error || diagnostics.warnings[0],
        };
    }
    return { ...result, diagnostics };
}

function buildCacheKey(url: string, opts: CollectionOptions): string {
    const policy = [
        `details=${opts.includeDetails === true ? 1 : 0}`,
        `reviews=${opts.includeReviews === true ? 1 : 0}`,
        `reviewTexts=${opts.includeReviewTexts === true ? 1 : 0}`,
        `reviewFallback=${opts.reviewFallbackWhenGalleryWeak === true ? 1 : 0}`,
        `max=${opts.maxImages || 30}`,
    ].join(';');
    return `${url}${url.includes('?') ? '&' : '?'}__imagePolicy=${encodeURIComponent(policy)}`;
}

/**
 * 메인 이미지 수집 함수
 * 
 * @param url - 쇼핑몰 URL (단축 URL 지원)
 * @param options - 수집 옵션
 * @returns 수집 결과
 * 
 * @example
 * ```typescript
 * const result = await collectShoppingImages('https://naver.me/FJIosgHL');
 * if (result.success) {
 *   console.log('수집된 이미지:', result.images.length);
 * }
 * ```
 */
export async function collectShoppingImages(
    url: string,
    options: CollectionOptions = {}
): Promise<CollectionResult> {
    const startTime = Date.now();
    const opts = {
        timeout: 30000,
        maxImages: 30,
        includeDetails: false,
        includeReviews: false,
        includeReviewTexts: false,
        validateWithAI: false,  // AI 검증은 나중에 추가
        useCache: true,
        ...options,
    };

    console.log('[ShoppingCrawlerHub] ════════════════════════════════════════');
    console.log(`[ShoppingCrawlerHub] 🚀 이미지 수집 시작: ${url.substring(0, 60)}...`);

    try {
        const cacheKey = buildCacheKey(url, opts);

        // 1. 캐시 확인
        if (opts.useCache) {
            const cached = imageCache.get(cacheKey);
            if (cached) {
                console.log('[ShoppingCrawlerHub] 📦 캐시에서 반환');
                return attachDiagnostics({
                    ...cached,
                    timing: Date.now() - startTime,
                });
            }
        }

        // 2. URL 해석 (단축 URL 리다이렉트)
        console.log('[ShoppingCrawlerHub] 🔗 URL 해석 중...');
        const resolved = await resolveUrl(url);

        if (resolved.isErrorPage) {
            console.error('[ShoppingCrawlerHub] ❌ 에러 페이지 감지');
            return {
                success: false,
                images: [],
                usedStrategy: 'none',
                timing: Date.now() - startTime,
                error: resolved.errorReason || '에러 페이지',
                isErrorPage: true,
                resolvedUrl: resolved.finalUrl,
            };
        }

        // 3. 플랫폼 감지 및 Provider 선택
        const platform = resolved.platform;
        console.log(`[ShoppingCrawlerHub] 🏪 플랫폼: ${platform}`);

        const provider = providers.find(p => p.platform === platform);

        if (!provider) {
            console.warn(`[ShoppingCrawlerHub] ⚠️ 지원하지 않는 플랫폼: ${platform}`);
            // 기본 Provider 사용 (스마트스토어)
            const defaultProvider = providers.find(p => p.platform === 'smart-store');
            if (defaultProvider) {
                console.log('[ShoppingCrawlerHub] 🔄 기본 Provider 사용: SmartStoreProvider');
                return await collectWithProvider(defaultProvider, resolved.finalUrl, opts, startTime);
            }

            return {
                success: false,
                images: [],
                usedStrategy: 'none',
                timing: Date.now() - startTime,
                error: `지원하지 않는 플랫폼: ${platform}`,
                resolvedUrl: resolved.finalUrl,
            };
        }

        // 4. 레이트 리밋 적용
        await rateLimiter.acquire(platform);

        // 5. Provider로 수집
        const result = await collectWithProvider(provider, resolved.finalUrl, opts, startTime);

        // 6. 캐시 저장
        if (opts.useCache && result.success) {
            imageCache.set(cacheKey, result);
            if (resolved.finalUrl && resolved.finalUrl !== url) {
                imageCache.set(buildCacheKey(resolved.finalUrl, opts), result);
            }
        }

        return result;

    } catch (error) {
        console.error('[ShoppingCrawlerHub] ❌ 치명적 오류:', (error as Error).message);
        return {
            success: false,
            images: [],
            usedStrategy: 'none',
            timing: Date.now() - startTime,
            error: (error as Error).message,
        };
    }
}

/**
 * Provider로 이미지 수집
 */
async function collectWithProvider(
    provider: BaseProvider,
    url: string,
    options: CollectionOptions,
    startTime: number
): Promise<CollectionResult> {
    console.log(`[ShoppingCrawlerHub] 🔧 ${provider.name} 사용`);

    const result = await provider.collectImages(url, options);

    // 결과 로깅
    if (result.success) {
        console.log(`[ShoppingCrawlerHub] ✅ 수집 완료: ${result.images.length}개 이미지`);
        console.log(`[ShoppingCrawlerHub] 📊 전략: ${result.usedStrategy}`);
        console.log(`[ShoppingCrawlerHub] ⏱️ 소요 시간: ${Date.now() - startTime}ms`);
    } else {
        console.warn(`[ShoppingCrawlerHub] ⚠️ 수집 실패: ${result.error}`);
    }

    console.log('[ShoppingCrawlerHub] ════════════════════════════════════════');

    return attachDiagnostics({
        ...result,
        timing: Date.now() - startTime,
    });
}

/**
 * 지원 플랫폼 목록 조회
 */
export function getSupportedPlatforms(): ShoppingPlatform[] {
    return providers.map(p => p.platform);
}

/**
 * 캐시 클리어
 */
export function clearCache(): void {
    imageCache.clear();
}

/**
 * 레이트 리밋 리셋
 */
export function resetRateLimits(): void {
    rateLimiter.reset();
}

// 타입 재export
export * from './types.js';
