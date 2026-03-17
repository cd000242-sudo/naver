// Playwright + Stealth로 스마트스토어 테스트
async function test() {
    console.log('🕵️ Playwright + Stealth 스마트스토어 테스트...');

    const { chromium } = require('playwright-extra');
    const stealth = require('puppeteer-extra-plugin-stealth');
    chromium.use(stealth());

    const url = 'https://smartstore.naver.com/pkplaza/products/8627632754';
    console.log('URL:', url);

    const browser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled', '--window-size=1920,1080'],
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'ko-KR',
    });

    const page = await context.newPage();

    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('페이지 로딩 중...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    await page.mouse.move(300, 200);
    await page.waitForTimeout(2000);

    const title = await page.title();
    console.log('페이지 제목:', title);

    const result = await page.evaluate(() => {
        const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
        const ogImage = document.querySelector('meta[property="og:image"]')?.content || '';
        const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
        const price = document.querySelector('._1LY7DqCnwR, [class*="price"]')?.textContent || '';

        return { ogTitle, ogImage, ogDesc, price };
    });

    console.log('');
    console.log('==== 결과 ====');
    console.log('OG 제목:', result.ogTitle || '없음');
    console.log('가격:', result.price || '없음');
    console.log('설명:', result.ogDesc ? result.ogDesc.substring(0, 60) + '...' : '없음');
    console.log('이미지:', result.ogImage ? '있음' : '없음');

    if (result.ogTitle && !result.ogTitle.includes('에러')) {
        console.log('');
        console.log('✅ Playwright + Stealth 성공!');
    } else {
        console.log('');
        console.log('❌ 여전히 에러');
    }

    await browser.close();
}

test().catch(e => console.log('에러:', e.message));
