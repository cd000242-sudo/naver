import { crawlShoppingSite, CrawlResult } from './strategies/shoppingStrategy.js';
import { tryNaverApiFirst, searchNaverImages } from './strategies/naverStrategy.js';

export interface CrawlOptions {
    imagesOnly?: boolean;
    naverClientId?: string;
    naverClientSecret?: string;
}

export { CrawlResult };

/**
 * 쇼핑몰 이미지 및 콘텐츠 수집 메인 함수
 * 전략: 네이버 API (빠름) -> Puppeteer (확실함) -> 이미지 검색 API (최후 수단)
 */
export async function fetchShoppingImages(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    console.log(`[SourceCollector] 수집 시작: ${url}`);

    // 1. [Fast Path] 네이버 API 키가 있으면 우선 시도
    if (options.naverClientId && options.naverClientSecret) {
        try {
            const apiResult = await tryNaverApiFirst(url, options.naverClientId, options.naverClientSecret);
            if (apiResult.success && apiResult.images.length > 0) {
                console.log(`[SourceCollector] ✅ 네이버 API로 수집 성공: ${apiResult.images.length}개 이미지`);
                return {
                    images: apiResult.images,
                    title: apiResult.title,
                    content: apiResult.description,
                    price: apiResult.price
                };
            }
        } catch (e) {
            console.warn(`[SourceCollector] ⚠️ 네이버 API 실패, 크롤링으로 전환...`);
        }
    }

    // 2. [Reliable Path] Puppeteer 브라우저 크롤링
    // 보안이 강한 쇼핑몰이나 API로 못 찾은 경우 실행
    console.log(`[SourceCollector] Puppeteer 크롤링 시작...`);
    const crawlResult = await crawlShoppingSite(url);

    // 크롤링 성공 시 반환
    if (crawlResult.images.length > 0) {
        console.log(`[SourceCollector] ✅ 크롤링 성공: ${crawlResult.images.length}개 이미지`);
        return crawlResult;
    }

    // 3. [Fallback Path] 최후의 수단: 네이버 이미지 검색 API
    // 크롤링도 실패했다면 제품명(제목)으로 이미지 검색이라도 해서 가져옴
    if (options.naverClientId && options.naverClientSecret) {
        console.log(`[SourceCollector] ⚠️ 크롤링 실패, 이미지 검색 API로 폴백...`);
        const searchKeyword = crawlResult.title || extractKeywordFromUrl(url) || '추천 상품';
        try {
            const fallbackImages = await searchNaverImages(searchKeyword, options.naverClientId, options.naverClientSecret);
            if (fallbackImages.length > 0) {
                console.log(`[SourceCollector] ✅ 이미지 검색 폴백 성공: ${fallbackImages.length}개 이미지`);
                return {
                    images: fallbackImages.map(img => img.link),
                    title: crawlResult.title || searchKeyword,
                    content: crawlResult.content
                };
            }
        } catch (e) {
            console.error(`[SourceCollector] ❌ 모든 수단 실패`);
        }
    }

    console.log(`[SourceCollector] ❌ 수집 실패`);
    return { images: [] };
}

/**
 * URL에서 키워드 추출 (간단 버전)
 */
function extractKeywordFromUrl(url: string): string {
    try {
        const decoded = decodeURIComponent(url);

        // 경로에서 한글 추출
        const match = decoded.match(/[가-힣]+/g);
        if (match && match.length > 0) {
            return match.slice(0, 3).join(' ');
        }

        return '';
    } catch {
        return '';
    }
}

// 편의 함수들 re-export
export { crawlShoppingSite } from './strategies/shoppingStrategy.js';
export { crawlGeneralPage } from './strategies/generalStrategy.js';
export { tryNaverApiFirst, searchNaverImages } from './strategies/naverStrategy.js';
export { normalizeImageUrl, isUIGarbage, deduplicateImages } from './utils/imageUtils.js';
export { launchBrowser, createOptimizedPage } from './utils/browserFactory.js';
export { cleanText, stripHtmlTags, extractContent } from './utils/textUtils.js';
export { SHOPPING_SELECTORS, TEXT_SELECTORS } from './config/selectors.js';
