/**
 * 🔗 URL 유틸리티 - 단축 URL 리졸브
 * naver.me, me2.do 등 단축 URL → 최종 목적지 URL 변환
 * ✅ [2026-02-19] Playwright 전용세션으로 간단하게 처리
 */

import { getChromiumExecutablePath } from '../../browserUtils.js';

/**
 * 단축/경유 URL 패턴 목록
 */
const SHORT_URL_PATTERNS = [
    'naver.me',
    'me2.do',
    'bit.ly',
    'goo.gl',
    'url.kr',
    't.co',
    'tinyurl.com',
    'is.gd',
    'han.gl',
    'vo.la',
    'me2.kr',
    'reurl.cc',
    'brandconnect.naver.com',
];

/**
 * URL이 단축/경유 URL인지 확인
 */
export function isShortUrl(url: string): boolean {
    return SHORT_URL_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * ✅ 단축 URL을 실제 URL로 리졸브 (Playwright 전용세션)
 * - naver.me → brandconnect → smartstore 체인을 브라우저가 알아서 따라감
 * - HTTP/JS 리다이렉트 모두 자동 처리
 * - 리소스 차단으로 빠르게 처리
 */
export async function resolveShortUrl(url: string): Promise<string> {
    if (!isShortUrl(url)) return url;

    console.log(`[URL Resolver] 🔗 단축 URL 감지: ${url}`);

    let browser = null;
    try {
        const { chromium } = await import('playwright');
        const execPath = await getChromiumExecutablePath();
        browser = await chromium.launch({
            headless: false,
            ...(execPath ? { executablePath: execPath } : {}),
        });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        });
        const page = await context.newPage();

        // 리소스 절약: 이미지/폰트/미디어/CSS 차단
        await page.route('**/*', route => {
            const type = route.request().resourceType();
            if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // 최종 URL 추출 (최대 5초, 500ms 간격 폴링)
        let finalUrl = page.url();
        const storePatterns = ['smartstore.naver.com', 'brand.naver.com', 'shopping.naver.com'];
        for (let i = 0; i < 10; i++) {
            if (storePatterns.some(p => finalUrl.includes(p))) break;
            await page.waitForTimeout(500);
            finalUrl = page.url();
        }

        await browser.close().catch(() => undefined);
        browser = null;

        if (finalUrl !== url && !finalUrl.includes('naver.me')) {
            console.log(`[URL Resolver] ✅ 최종 URL: ${finalUrl}`);
            return finalUrl;
        } else {
            console.warn(`[URL Resolver] ⚠️ 리졸브 실패, 원본 URL 유지`);
            return url;
        }
    } catch (error) {
        console.warn(`[URL Resolver] ❌ 리졸브 실패: ${(error as Error).message}`);
        if (browser) { try { await browser.close(); } catch { } }
        return url;
    }
}
