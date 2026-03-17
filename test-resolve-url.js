const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

function findChrome() {
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    for (const p of paths) { if (fs.existsSync(p)) return p; }
    return undefined;
}

async function crawlTest(shortUrl) {
    const execPath = findChrome();
    console.log(`\n[테스트] Playwright 전용세션 크롤링`);
    console.log(`[테스트] URL: ${shortUrl}`);
    console.log(`[테스트] 브라우저: ${execPath}\n`);

    let browser = null;
    try {
        // ✅ 하나의 세션으로 URL 리졸브 + 크롤링
        browser = await chromium.launch({
            headless: false,
            ...(execPath ? { executablePath: execPath } : {}),
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            viewport: { width: 390, height: 844 },
        });

        const page = await context.newPage();

        // 리소스 절약 (이미지는 크롤링 필요하므로 유지)
        await page.route('**/*', route => {
            const type = route.request().resourceType();
            const u = route.request().url();
            if (['font', 'media'].includes(type) || u.includes('google-analytics') || u.includes('tracking')) {
                route.abort();
            } else {
                route.continue();
            }
        });

        // 1) 단축 URL 이동 → 리다이렉트 추적
        console.log(`[1단계] naver.me 이동 중...`);
        await page.goto(shortUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        let finalUrl = page.url();
        const storePatterns = ['smartstore.naver.com', 'brand.naver.com'];
        for (let i = 0; i < 15; i++) {
            if (storePatterns.some(p => finalUrl.includes(p))) break;
            await page.waitForTimeout(500);
            finalUrl = page.url();
            console.log(`  폴링 ${i + 1}: ${finalUrl.substring(0, 80)}`);
        }
        console.log(`[1단계] ✅ 최종 URL: ${finalUrl.substring(0, 100)}`);

        // 모바일 전환
        if (finalUrl.includes('smartstore.naver.com') && !finalUrl.includes('m.smartstore.naver.com')) {
            const mobileUrl = finalUrl.replace('smartstore.naver.com', 'm.smartstore.naver.com');
            console.log(`[1단계] 📱 모바일 전환: ${mobileUrl.substring(0, 80)}`);
            await page.goto(mobileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }

        // 2) 상품 페이지 크롤링
        console.log(`\n[2단계] 상품 페이지 크롤링...`);
        await page.waitForTimeout(3000);

        // 스크롤
        for (let i = 0; i < 10; i++) {
            await page.evaluate(() => window.scrollBy(0, 500));
            await page.waitForTimeout(150);
        }
        await page.waitForTimeout(1000);

        const info = await page.evaluate(() => {
            const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
            const getAttr = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '';

            const ogTitle = getAttr('meta[property="og:title"]', 'content');
            const ogImage = getAttr('meta[property="og:image"]', 'content');
            const ogDesc = getAttr('meta[property="og:description"]', 'content');

            const images = [];
            const seen = new Set();
            document.querySelectorAll('img').forEach(img => {
                const src = img.src || img.getAttribute('data-src') || '';
                if (src && (src.includes('pstatic.net') || src.includes('shop-phinf')) && !seen.has(src.split('?')[0])) {
                    seen.add(src.split('?')[0]);
                    images.push(src);
                }
            });

            const bodyText = document.body?.innerText?.substring(0, 300) || '';

            return {
                ogTitle, ogImage, ogDesc, images, bodyText,
                title: document.title, url: location.href
            };
        });

        // 결과 출력
        const result = [];
        result.push(`\n${'='.repeat(50)}`);
        result.push(`크롤링 결과`);
        result.push(`${'='.repeat(50)}`);
        result.push(`제목: ${info.ogTitle || info.title}`);
        result.push(`OG설명: ${info.ogDesc}`);
        result.push(`OG이미지: ${info.ogImage}`);
        result.push(`최종URL: ${info.url}`);
        result.push(`이미지수: ${info.images.length}장`);
        info.images.slice(0, 10).forEach((img, i) => result.push(`  [${i + 1}] ${img.substring(0, 100)}`));
        result.push(`\nbody (300자):\n${info.bodyText}`);
        result.push(`${'='.repeat(50)}`);

        result.forEach(l => console.log(l));
        fs.writeFileSync('test-crawl-result.txt', result.join('\n'), 'utf8');
        console.log(`\n결과 저장: test-crawl-result.txt`);

    } catch (error) {
        console.error(`에러: ${error.message}`);
    } finally {
        if (browser) await browser.close();
    }
}

crawlTest('https://naver.me/5T0IDrLf');
