// 디버그 스크립트: 브라우저 열기 → 스크린샷 → 이미지 개수 확인
const path = require('path');
const os = require('os');

async function main() {
    // playwright-extra + stealth
    const { chromium } = require('playwright-extra');
    const stealth = require('puppeteer-extra-plugin-stealth');
    chromium.use(stealth());
    
    const profileDir = path.join(os.tmpdir(), 'leword-crawler-profile');
    console.log(`프로필: ${profileDir}`);
    
    let context;
    try {
        context = await chromium.launchPersistentContext(profileDir, {
            headless: false,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--start-maximized',
            ],
            viewport: null,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            locale: 'ko-KR',
            timezoneId: 'Asia/Seoul',
        });
        console.log('✅ 브라우저 시작됨');
        
        const page = context.pages()[0] || await context.newPage();
        
        // webdriver 숨기기
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
        });

        // 1. 네이버 메인 방문
        console.log('🏠 네이버 메인 방문...');
        await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        console.log(`✅ 네이버 메인: ${page.url()}`);
        
        // 2. 스마트스토어 접속
        const targetUrl = 'https://smartstore.naver.com/bfkr/products/11394122187';
        console.log(`🛒 스마트스토어 접속: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // 3. 캡차 체크
        const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        const captchaKeywords = ['보안 확인', '캡차', 'captcha', '자동입력 방지', '보안문자', '현재 서비스 접속이 불가', '비정상적인 접근'];
        const hasCaptcha = captchaKeywords.some(kw => bodyText.includes(kw));
        
        if (hasCaptcha) {
            console.log('⚠️ 캡차 감지됨! 브라우저에서 직접 해결해주세요...');
            // 최대 3분 대기
            for (let i = 0; i < 60; i++) {
                await page.waitForTimeout(3000);
                const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
                const still = captchaKeywords.some(kw => text.includes(kw));
                if (!still) {
                    console.log('✅ 캡차 해결됨!');
                    break;
                }
                console.log(`⏳ 캡차 대기... (${(i+1)*3}초)`);
            }
        } else {
            console.log('✅ 캡차 없음!');
        }
        
        // 4. 현재 페이지 정보
        const currentUrl = page.url();
        console.log(`📍 현재 URL: ${currentUrl}`);
        
        // 5. 페이지 로딩 대기
        try {
            await page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch { }
        await page.waitForTimeout(2000);
        
        // 6. 스크린샷
        await page.screenshot({ path: 'debug-screenshot.png', fullPage: false });
        console.log('📸 스크린샷 저장: debug-screenshot.png');
        
        // 7. 이미지 태그 분석
        const imgInfo = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            return {
                total: imgs.length,
                withSrc: imgs.filter(i => i.src && i.src.startsWith('http')).length,
                shopPhinf: imgs.filter(i => i.src?.includes('shop-phinf')).length,
                samples: imgs.slice(0, 10).map(i => ({
                    src: (i.src || '').substring(0, 100),
                    alt: i.alt || '',
                    width: i.naturalWidth,
                    height: i.naturalHeight,
                })),
            };
        });
        
        console.log(`\n📊 이미지 분석:`);
        console.log(`  총 img 태그: ${imgInfo.total}`);
        console.log(`  HTTP src 있는: ${imgInfo.withSrc}`);
        console.log(`  shop-phinf: ${imgInfo.shopPhinf}`);
        console.log(`\n샘플 이미지 (처음 10개):`);
        imgInfo.samples.forEach((img, i) => {
            console.log(`  ${i+1}. [${img.width}x${img.height}] alt="${img.alt}" src=${img.src}`);
        });
        
        // 8. 제목
        const title = await page.title();
        console.log(`\n📝 페이지 제목: ${title}`);
        
        // 9. HTML 구조 분석 (키 요소)
        const structure = await page.evaluate(() => {
            const checks = {
                'div.product_img': !!document.querySelector('.product_img'),
                'swiper': !!document.querySelector('.swiper-slide'),
                'INTRODUCE': !!document.querySelector('#INTRODUCE'),
                'og:image': document.querySelector('meta[property="og:image"]')?.getAttribute('content') || 'none',
                'og:title': document.querySelector('meta[property="og:title"]')?.getAttribute('content') || 'none',
            };
            return checks;
        });
        console.log('\n🏗️ 페이지 구조:');
        Object.entries(structure).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
        
        console.log('\n✅ 디버그 완료! 30초 후 브라우저를 닫습니다...');
        await page.waitForTimeout(30000);
        
    } catch (err) {
        console.error('❌ 에러:', err.message);
    } finally {
        if (context) await context.close().catch(() => {});
    }
}

main();
