// src/crawler/strategies/generalStrategy.ts
import { launchBrowser, createOptimizedPage } from '../utils/browserFactory.js';
import { TEXT_SELECTORS } from '../config/selectors.js';

export interface GeneralCrawlResult {
    title: string;
    content: string;
    images: string[];
}

/**
 * 일반 웹페이지 크롤링 전략
 * - 블로그, 뉴스, 일반 사이트 등 JS 동적 렌더링이 필요한 페이지 지원
 * - Puppeteer 기반으로 완전히 렌더링된 페이지에서 데이터 추출
 */
export async function crawlGeneralPage(url: string): Promise<GeneralCrawlResult> {
    let browser;
    try {
        console.log(`[General Crawler] 브라우저 실행 중... Target: ${url}`);
        browser = await launchBrowser();
        const page = await createOptimizedPage(browser);

        // 페이지 이동 (타임아웃 30초)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 스크롤 로직 (Lazy Loading 이미지 및 텍스트 로딩)
        await page.evaluate(async () => {
            const distance = 1000;
            let totalHeight = 0;
            while (totalHeight < document.body.scrollHeight) {
                window.scrollBy(0, distance);
                totalHeight += distance;
                await new Promise(r => setTimeout(r, 100)); // 빠르게 스크롤
                if (totalHeight > 20000) break; // 무한 스크롤 방지
            }
        });

        // 데이터 추출
        const extracted = await page.evaluate((selectors: typeof TEXT_SELECTORS) => {
            // 1. 본문 추출 (여러 후보 중 가장 긴 텍스트 선택)
            let content = '';
            const candidates = document.querySelectorAll(selectors.CONTENT.join(','));
            candidates.forEach(el => {
                const text = el.textContent?.trim() || '';
                // 기존 찾은 것보다 길고, 불필요한 요소가 아니면 선택
                if (text.length > content.length && text.length > 200) {
                    content = text;
                }
            });

            // 후보가 없으면 body 전체에서 텍스트 추출 (최후 수단)
            if (!content) content = document.body.innerText;

            // 2. 제목 추출
            const title = document.querySelector('title')?.innerText ||
                document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';

            // 3. 이미지 추출 (본문 내 이미지)
            const images: string[] = [];
            document.querySelectorAll('img').forEach(img => {
                const src = (img as HTMLImageElement).src || img.getAttribute('data-src');
                if (src && src.startsWith('http')) images.push(src);
            });

            return { title, content, images };
        }, TEXT_SELECTORS);

        console.log(`[General Crawler] 완료: ${extracted.content?.length || 0}자, ${extracted.images?.length || 0}개 이미지`);

        return {
            title: extracted.title || '',
            content: extracted.content || '',
            images: extracted.images || []
        };

    } catch (error) {
        console.error(`[General Crawler] Error: ${(error as Error).message}`);
        return { title: '', content: '', images: [] };
    } finally {
        if (browser) await browser.close();
    }
}
