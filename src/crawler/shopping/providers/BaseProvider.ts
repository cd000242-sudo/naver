/**
 * 쇼핑몰 크롤러 기본 Provider
 * @module crawler/shopping/providers/BaseProvider
 * 
 * 모든 플랫폼별 Provider의 기본 클래스
 * - 폴백 체인 자동 관리
 * - 에러 페이지 감지
 * - 이미지 필터링
 */

import {
    CollectionResult,
    CollectionStrategy,
    CollectionOptions,
    ProductImage,
    ShoppingPlatform,
    AD_BANNER_PATTERNS,
    ERROR_PAGE_INDICATORS,
    MIN_IMAGE_SIZE,
} from '../types.js';
import { resolveUrl, ResolvedUrl } from '../utils/UrlResolver.js';

export abstract class BaseProvider {
    abstract readonly name: string;
    abstract readonly platform: ShoppingPlatform;
    abstract readonly urlPatterns: RegExp[];
    abstract readonly strategies: CollectionStrategy[];

    /**
     * 이 Provider가 해당 URL을 처리할 수 있는지 확인
     */
    canHandle(url: string): boolean {
        return this.urlPatterns.some(pattern => pattern.test(url));
    }

    /**
     * 이미지 수집 메인 메서드
     * 폴백 체인을 통해 순차적으로 전략 시도
     */
    async collectImages(url: string, options: CollectionOptions = {}): Promise<CollectionResult> {
        const startTime = Date.now();
        const opts = this.mergeOptions(options);

        console.log(`[${this.name}] 🚀 이미지 수집 시작: ${url.substring(0, 60)}...`);

        // 1. URL 해석 (단축 URL 리다이렉트 + 에러 페이지 감지)
        const resolved = await resolveUrl(url);

        if (resolved.isErrorPage) {
            console.error(`[${this.name}] ❌ 에러 페이지 감지: ${resolved.errorReason}`);
            return {
                success: false,
                images: [],
                usedStrategy: 'none',
                timing: Date.now() - startTime,
                error: resolved.errorReason,
                isErrorPage: true,
                resolvedUrl: resolved.finalUrl,
            };
        }

        // 2. 폴백 체인 실행
        const sortedStrategies = [...this.strategies].sort((a, b) => a.priority - b.priority);
        let bestFailure: CollectionResult | null = null;

        for (const strategy of sortedStrategies) {
            console.log(`[${this.name}] 🔄 전략 시도: ${strategy.name} (우선순위: ${strategy.priority})`);

            try {
                const result = await this.executeStrategyWithTimeout(strategy, resolved.finalUrl, opts);

                if (result.success && result.images.length > 0) {
                    const policyImages = result.images.filter(img => {
                        if (opts.includeReviews !== true && img.type === 'review') return false;
                        if (opts.includeReviews !== true && this.isReviewImageUrl(img.url)) return false;
                        if (opts.includeDetails !== true && img.type === 'detail') return false;
                        return true;
                    });
                    const filteredImages = this.filterImages(policyImages);

                    console.log(`[${this.name}] ✅ 전략 "${strategy.name}" 성공: ${result.images.length}개 → ${filteredImages.length}개 (필터 후)`);

                    return {
                        ...result,
                        images: filteredImages,
                        usedStrategy: strategy.name,
                        timing: Date.now() - startTime,
                        resolvedUrl: resolved.finalUrl,
                    };
                }

                if (result.isErrorPage) {
                    bestFailure = {
                        ...result,
                        usedStrategy: strategy.name,
                        timing: Date.now() - startTime,
                        resolvedUrl: resolved.finalUrl,
                    };
                    console.warn(`[${this.name}] recoverable error page in "${strategy.name}", trying next strategy...`);
                    continue;
                }

                console.warn(`[${this.name}] ⚠️ 전략 "${strategy.name}" 결과 없음, 다음 전략 시도...`);
                if (!bestFailure && result.error) {
                    bestFailure = {
                        ...result,
                        usedStrategy: strategy.name,
                        timing: Date.now() - startTime,
                        resolvedUrl: resolved.finalUrl,
                    };
                }
            } catch (error) {
                console.warn(`[${this.name}] ⚠️ 전략 "${strategy.name}" 실패:`, (error as Error).message);
            }
        }

        // 3. 모든 전략 실패
        console.error(`[${this.name}] ❌ 모든 전략 실패`);
        if (bestFailure) {
            return bestFailure;
        }
        return {
            success: false,
            images: [],
            usedStrategy: 'none',
            timing: Date.now() - startTime,
            error: '모든 수집 전략이 실패했습니다',
            resolvedUrl: resolved.finalUrl,
        };
    }

    /**
     * 광고/배너/저품질 이미지 필터링
     */
    private async executeStrategyWithTimeout(
        strategy: CollectionStrategy,
        url: string,
        options: CollectionOptions,
    ): Promise<CollectionResult> {
        const timeoutMs = Math.min(Math.max(options.timeout ?? 30000, 5000), 60000);
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        try {
            return await Promise.race([
                strategy.execute(url, options),
                new Promise<CollectionResult>((resolve) => {
                    timeoutId = setTimeout(() => {
                        resolve({
                            success: false,
                            images: [],
                            usedStrategy: strategy.name,
                            timing: timeoutMs,
                            error: `Strategy timed out after ${timeoutMs}ms`,
                        });
                    }, timeoutMs);
                }),
            ]);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    protected filterImages(images: ProductImage[]): ProductImage[] {
        return images.filter(img => {
            // 1. 광고/배너 패턴 체크
            const isAdBanner = AD_BANNER_PATTERNS.some(pattern => pattern.test(img.url));
            if (isAdBanner) {
                console.log(`[Filter] 광고/배너 제외: ${img.url.substring(0, 50)}...`);
                return false;
            }

            // 2. 최소 크기 체크 (크기 정보가 있는 경우)
            if (img.width && img.height) {
                if (img.width < MIN_IMAGE_SIZE || img.height < MIN_IMAGE_SIZE) {
                    console.log(`[Filter] 너무 작은 이미지 제외: ${img.width}x${img.height}`);
                    return false;
                }
            }

            // 3. 유효하지 않은 URL 체크
            if (!img.url || img.url.startsWith('data:image/svg') || img.url.includes('placeholder')) {
                return false;
            }

            return true;
        });
    }

    private isReviewImageUrl(url: string): boolean {
        return /checkout\.phinf|image\.nmv|shopnbuyer|review_image|photo_review/i.test(String(url || ''));
    }

    protected detectErrorPage(input: { html?: string; title?: string; bodyText?: string }): string | undefined {
        const visibleText = [
            input.title || '',
            input.bodyText || '',
            input.html ? this.htmlToVisibleText(input.html) : '',
        ]
            .join('\n')
            .replace(/\s+/g, ' ')
            .trim();

        if (!visibleText) return undefined;

        return ERROR_PAGE_INDICATORS.find(indicator => {
            if (!indicator) return false;
            if (indicator === '404') {
                return /\b404\b/i.test(visibleText) && /(not\s*found|page\s*not\s*found|error|에러|찾을 수|존재하지)/i.test(visibleText);
            }
            return visibleText.includes(indicator);
        });
    }

    private htmlToVisibleText(html: string): string {
        return String(html || '')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"');
    }

    /**
     * 기본 옵션과 사용자 옵션 병합
     */
    protected mergeOptions(options: CollectionOptions): CollectionOptions {
        return {
            timeout: 30000,
            maxImages: 30,
            includeDetails: false,
            includeReviews: false,
            includeReviewTexts: false,
            validateWithAI: true,
            useCache: true,
            ...options,
        };
    }
}
