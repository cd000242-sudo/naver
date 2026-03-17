/**
 * 배포환경(win-unpacked) 시뮬레이션 — Playwright-Extra launch 테스트
 * Usage: node test-playwright-deployed.js
 */
(async () => {
    try {
        console.log('=== Playwright-Extra 배포환경 테스트 ===');

        // 1. playwright-extra 로드
        console.log('[1] playwright-extra 로드 중...');
        const { chromium } = require('playwright-extra');
        const stealth = require('puppeteer-extra-plugin-stealth');
        chromium.use(stealth());
        console.log('[1] ✅ playwright-extra + stealth 로드 완료');

        // 2. executablePath 가져오기
        console.log('[2] executablePath 가져오는 중...');
        const { getChromiumExecutablePath } = require('./dist/browserUtils.js');
        const execPath = await getChromiumExecutablePath();
        console.log('[2] ✅ execPath:', execPath);

        // 3. chromium.launch 테스트
        console.log('[3] chromium.launch 시도...');
        const browser = await chromium.launch({
            headless: false,
            ...(execPath ? { executablePath: execPath } : {}),
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--window-size=800,600',
            ],
        });
        console.log('[3] ✅ 브라우저 실행 성공!');

        // 4. 페이지 테스트
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto('https://m.smartstore.naver.com', { timeout: 10000 });
        console.log('[4] ✅ 페이지 로딩 성공:', page.url());

        await new Promise(r => setTimeout(r, 3000));
        await browser.close();
        console.log('[5] ✅ 전체 성공!');
    } catch (e) {
        console.error('❌ 에러:', e.message);
        console.error('📋 스택:', e.stack);
    }
    process.exit(0);
})();
