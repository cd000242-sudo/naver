import { launchBrowser, createOptimizedPage } from '../utils/browserFactory.js';
import { SHOPPING_SELECTORS, TEXT_SELECTORS } from '../config/selectors.js';
import { deduplicateImages } from '../utils/imageUtils.js';

export interface CrawlResult {
    images: string[];
    title?: string;
    content?: string;
    price?: string;
}

export async function crawlShoppingSite(url: string): Promise<CrawlResult> {
    let browser;
    try {
        console.log(`[Shopping Crawler] 브라우저 실행 중... Target: ${url}`);
        browser = await launchBrowser();
        const page = await createOptimizedPage(browser);

        // 스마트스토어 모바일 우회 (봇 탐지 회피용)
        // ✅ [FIX] m.m. 중복 방지 조건 추가
        const targetUrl = (url.includes('smartstore.naver.com') && !url.includes('m.smartstore.naver.com'))
            ? url.replace('smartstore.naver.com', 'm.smartstore.naver.com')
            : url;

        // 페이지 이동 (타임아웃 30초)
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 동적 로딩을 위한 스크롤 (가속화)
        await page.evaluate(async () => {
            const distance = 1000;
            let totalHeight = 0;
            while (totalHeight < document.body.scrollHeight) {
                window.scrollBy(0, distance);
                totalHeight += distance;
                await new Promise(r => setTimeout(r, 100)); // 0.1초 간격으로 빠르게 스크롤
                if (totalHeight > 15000) break; // 너무 긴 페이지는 중단
            }
        });

        // 브라우저 내에서 데이터 추출 실행
        const extractedData = await page.evaluate((imgSelectors: typeof SHOPPING_SELECTORS, txtSelectors: typeof TEXT_SELECTORS) => {
            const images: string[] = [];

            // 1. 이미지 추출 (우선순위 기반)
            const allSelectors = [
                ...imgSelectors.NAVER_BRAND,
                ...imgSelectors.COUPANG,
                ...imgSelectors.ALIEXPRESS,
                ...imgSelectors.GENERIC.map(s => ({ priority: 'generic', selector: s }))
            ];

            allSelectors.forEach(({ selector }) => {
                document.querySelectorAll(selector).forEach((img) => {
                    const src = (img as HTMLImageElement).getAttribute('src') ||
                        (img as HTMLImageElement).getAttribute('data-src') ||
                        (img as HTMLImageElement).getAttribute('data-original');
                    if (src) images.push(src);
                });
            });

            // 2. 텍스트(본문/설명) 추출
            let content = '';
            for (const selector of txtSelectors.CONTENT) {
                const el = document.querySelector(selector);
                if (el && el.textContent && el.textContent.length > 50) {
                    content = el.textContent.trim();
                    break; // 가장 먼저 발견된 유효한 본문 사용
                }
            }

            // 3. 제목 추출
            const title = document.title ||
                document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';

            // 4. 가격 추출
            const priceEl = document.querySelector('[class*="price"], .price, ._1LY7DqCnwR, .total_price');
            const price = priceEl?.textContent?.replace(/[^0-9,]/g, '') || '';

            return { images, title, content, price };
        }, SHOPPING_SELECTORS, TEXT_SELECTORS);

        // 후처리: 이미지 정규화 및 중복 제거
        const finalImages = deduplicateImages(extractedData.images);

        console.log(`[Shopping Crawler] 완료: 이미지 ${finalImages.length}개, 텍스트 ${extractedData.content?.length || 0}자`);

        return {
            images: finalImages,
            title: extractedData.title,
            content: extractedData.content,
            price: extractedData.price
        };

    } catch (error: any) {
        console.error(`[Shopping Crawler] Error: ${error.message}`);
        return { images: [] }; // 에러 발생 시 빈 결과 반환 (상위에서 폴백 처리)
    } finally {
        if (browser) await browser.close();
    }
}
