/**
 * 단축 URL 리다이렉트 및 플랫폼 감지
 * @module crawler/shopping/utils/UrlResolver
 * 
 * 핵심 기능:
 * 1. naver.me, coupa.ng 등 단축 URL을 실제 URL로 변환
 * 2. 최종 URL에서 플랫폼 감지
 * 3. 에러 페이지 감지
 */

import { ShoppingPlatform, ERROR_PAGE_INDICATORS } from '../types.js';

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 단축 URL 패턴
 */
const SHORT_URL_PATTERNS = [
    'naver.me/',
    'brandconnect.naver.com/',
    'link.coupang.com/',
    'coupa.ng/',
    'bit.ly/',
    'goo.gl/',
    't.ly/',
    'tinyurl.com/',
    'me2.do/',
];

/**
 * 플랫폼 감지 패턴
 */
const PLATFORM_PATTERNS: { pattern: RegExp; platform: ShoppingPlatform }[] = [
    { pattern: /brandconnect\.naver\.com/i, platform: 'smart-store' },
    { pattern: /brand\.naver\.com/i, platform: 'brand-store' },
    { pattern: /smartstore\.naver\.com/i, platform: 'smart-store' },
    { pattern: /m\.smartstore\.naver\.com/i, platform: 'smart-store' },
    { pattern: /shopping\.naver\.com/i, platform: 'smart-store' },
    { pattern: /coupang\.com/i, platform: 'coupang' },
    { pattern: /coupa\.ng/i, platform: 'coupang' },
    { pattern: /gmarket\.co\.kr/i, platform: 'gmarket' },
    { pattern: /11st\.co\.kr/i, platform: '11st' },
];

function htmlToVisibleText(html: string): string {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectErrorIndicatorFromVisibleText(text: string): string | undefined {
    const visibleText = String(text || '').replace(/\s+/g, ' ').trim();
    if (!visibleText) return undefined;

    return ERROR_PAGE_INDICATORS.find(indicator => {
        if (!indicator) return false;
        if (indicator === '404') {
            return /\b404\b/i.test(visibleText) && /(not\s*found|page\s*not\s*found|error|에러|찾을 수|존재하지)/i.test(visibleText);
        }
        return visibleText.includes(indicator);
    });
}

export interface ResolvedUrl {
    originalUrl: string;
    finalUrl: string;
    platform: ShoppingPlatform;
    isShortUrl: boolean;
    isErrorPage: boolean;
    errorReason?: string;
    productId?: string;
    storeName?: string;
}

/**
 * URL을 해석하고 플랫폼을 감지합니다.
 * 단축 URL인 경우 실제 URL로 리다이렉트합니다.
 */
export async function resolveUrl(url: string): Promise<ResolvedUrl> {
    const isShortUrl = SHORT_URL_PATTERNS.some(pattern => url.includes(pattern));

    console.log(`[UrlResolver] 📎 URL 분석 시작: ${url.substring(0, 50)}...`);
    console.log(`[UrlResolver] 단축 URL 여부: ${isShortUrl}`);

    let finalUrl = url;
    let isErrorPage = false;
    let errorReason: string | undefined;

    // 1. 단축 URL → 실제 URL 변환
    if (isShortUrl) {
        try {
            console.log(`[UrlResolver] 🔄 리다이렉트 추적 중...`);

            const response = await fetch(url, {
                method: 'GET',  // GET으로 변경하여 본문도 확인
                redirect: 'follow',
                headers: {
                    'User-Agent': CHROME_UA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                },
            });

            finalUrl = response.url;
            console.log(`[UrlResolver] ✅ 최종 URL: ${finalUrl.substring(0, 80)}...`);

            // 응답 본문에서 에러 페이지 감지
            const bodyText = await response.text();
            const errorIndicator = detectErrorIndicatorFromVisibleText(htmlToVisibleText(bodyText));

            if (errorIndicator) {
                isErrorPage = true;
                errorReason = `에러 페이지 감지: "${errorIndicator}"`;
                console.warn(`[UrlResolver] ⚠️ ${errorReason}`);
            }

        } catch (error) {
            console.warn(`[UrlResolver] ⚠️ 리다이렉트 실패: ${(error as Error).message}`);
            // 실패해도 원본 URL로 계속 진행
        }
    }

    // 2. 플랫폼 감지
    const platform = detectPlatform(finalUrl);
    console.log(`[UrlResolver] 🏪 플랫폼 감지: ${platform}`);

    // 3. 상품 ID 추출
    const { productId, storeName } = extractProductInfo(finalUrl);
    if (productId) {
        console.log(`[UrlResolver] 🔢 상품 ID: ${productId}`);
    }

    return {
        originalUrl: url,
        finalUrl,
        platform,
        isShortUrl,
        isErrorPage,
        errorReason,
        productId,
        storeName,
    };
}

/**
 * URL에서 플랫폼 감지
 */
export function detectPlatform(url: string): ShoppingPlatform {
    for (const { pattern, platform } of PLATFORM_PATTERNS) {
        if (pattern.test(url)) {
            return platform;
        }
    }
    return 'unknown';
}

/**
 * URL에서 상품 ID 및 스토어명 추출
 */
export function extractProductInfo(url: string): { productId?: string; storeName?: string } {
    // 1. products/숫자 패턴
    const productsMatch = url.match(/products\/(\d+)/);
    if (productsMatch) {
        // 스토어명도 추출 시도
        const storeMatch = url.match(/(?:brand|smartstore)\.naver\.com\/([^\/\?]+)/);
        return {
            productId: productsMatch[1],
            storeName: storeMatch?.[1],
        };
    }

    // 2. channelProductNo 파라미터
    const channelMatch = url.match(/[?&]channelProductNo=(\d+)/);
    if (channelMatch) {
        return { productId: channelMatch[1] };
    }

    // 3. productNo 파라미터
    const productNoMatch = url.match(/[?&]productNo=(\d+)/);
    if (productNoMatch) {
        return { productId: productNoMatch[1] };
    }

    // 4. 쿠팡 상품 ID
    const coupangMatch = url.match(/products\/(\d+)/);
    if (coupangMatch) {
        return { productId: coupangMatch[1] };
    }

    return {};
}

/**
 * 페이지 본문에서 에러 페이지인지 확인
 */
export function isErrorPageContent(htmlContent: string): { isError: boolean; reason?: string } {
    const indicator = detectErrorIndicatorFromVisibleText(htmlToVisibleText(htmlContent));
    if (indicator) {
        return {
            isError: true,
            reason: `에러 페이지 감지: "${indicator}"`
        };
    }
    return { isError: false };
}
