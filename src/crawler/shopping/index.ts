/**
 * 쇼핑몰 크롤러 허브 (메인 진입점)
 * @module crawler/shopping/index
 * 
 * URL을 분석하여 적절한 Provider로 라우팅
 * 캐싱, 레이트 리밋, 에러 핸들링 통합
 */

import { CollectionResult, CollectionOptions, ShoppingPlatform } from './types.js';
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
        includeDetails: true,
        includeReviews: false,
        validateWithAI: false,  // AI 검증은 나중에 추가
        useCache: true,
        ...options,
    };

    console.log('[ShoppingCrawlerHub] ════════════════════════════════════════');
    console.log(`[ShoppingCrawlerHub] 🚀 이미지 수집 시작: ${url.substring(0, 60)}...`);

    try {
        // 1. 캐시 확인
        if (opts.useCache) {
            const cached = imageCache.get(url);
            if (cached) {
                console.log('[ShoppingCrawlerHub] 📦 캐시에서 반환');
                return {
                    ...cached,
                    timing: Date.now() - startTime,
                };
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
            imageCache.set(url, result);
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

    return {
        ...result,
        timing: Date.now() - startTime,
    };
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
