import puppeteer, { Browser, Page } from 'puppeteer';
import { getChromiumExecutablePath } from '../../browserUtils.js';
import { getProxyUrl } from './proxyManager.js';

// ✅ [v2.7.84] headless 옵션 추가 — URL 이미지 수집 시 사용자가 진행 시각 확인 가능
export async function launchBrowser(opts?: { headless?: boolean }): Promise<Browser> {
    const executablePath = await getChromiumExecutablePath();

    // ✅ [2026-03-16] 프록시 자동 적용
    const proxyUrl = await getProxyUrl();
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--js-flags=--max-old-space-size=256',
        '--disable-extensions',
        '--mute-audio'
    ];
    if (proxyUrl) {
        args.push(`--proxy-server=${proxyUrl}`);
        console.log(`[BrowserFactory] 🌐 프록시 적용: ${proxyUrl}`);
    }

    return puppeteer.launch({
        headless: opts?.headless !== undefined ? opts.headless : true,
        executablePath,
        args,
    });
}

export async function createOptimizedPage(browser: Browser): Promise<Page> {
    const page = await browser.newPage();

    // 1. 봇 탐지 우회 설정
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // @ts-ignore
        window.chrome = { runtime: {} };
    });

    // 2. 리소스 차단 (속도 향상 및 데이터 절약)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const type = req.resourceType();
        const url = req.url();

        // 폰트, 미디어, 트래킹 스크립트 차단
        if (['font', 'media'].includes(type) ||
            url.includes('google-analytics') ||
            url.includes('facebook') ||
            url.includes('tracking')) {
            req.abort();
        } else {
            req.continue();
        }
    });

    // 3. 뷰포트 설정
    await page.setViewport({ width: 1920, height: 1080 });

    return page;
}
