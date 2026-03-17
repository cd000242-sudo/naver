// 디버깅용: 네이버 메인 선방문 → 스마트스토어 크롤링 테스트
const path = require('path');

async function main() {
    const url = 'https://smartstore.naver.com/bfkr/products/11394122187';
    
    // playwright-extra + stealth
    const { chromium } = require('playwright-extra');
    const stealth = require('puppeteer-extra-plugin-stealth');
    chromium.use(stealth());
    
    const { getChromiumExecutablePath } = require('./dist/browserUtils.js');
    const execPath = await getChromiumExecutablePath();
    
    console.log('🚀 브라우저 시작...');
    const browser = await chromium.launch({
        headless: false,
        ...(execPath ? { executablePath: execPath } : {}),
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        viewport: { width: 390, height: 844 },
    });

    const page = await context.newPage();
    
    // webdriver 속성 숨기기
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    // Step 1: 네이버 메인 먼저 방문 (쿠키 확보)
    console.log('🌐 Step 1: 네이버 메인 방문 (쿠키 확보)...');
    try {
        await page.goto('https://m.naver.com', { waitUntil: 'domcontentloaded', timeout: 10000 });
        console.log(`   → 네이버 메인 로드 완료: ${page.url()}`);
        await page.waitForTimeout(2000);
        
        // 쿠키 확인
        const cookies = await context.cookies();
        const naverCookies = cookies.filter(c => c.domain.includes('naver'));
        console.log(`   → 네이버 쿠키 ${naverCookies.length}개 확보`);
    } catch (e) {
        console.log(`   → 네이버 메인 로드 실패: ${e.message}, 계속 진행...`);
    }
    
    // Step 2: 스마트스토어 모바일 접속
    const mobileUrl = url.replace('smartstore.naver.com', 'm.smartstore.naver.com');
    console.log(`\n📦 Step 2: 스마트스토어 접속: ${mobileUrl}`);
    
    try {
        await page.goto(mobileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
        console.log(`   → goto 타임아웃: ${e.message}`);
    }
    
    const urlAfterGoto = page.url();
    console.log(`   → URL after goto: ${urlAfterGoto}`);
    console.log(`   → Title: ${await page.title()}`);
    
    // Step 3: 캡차 체크 (개선)
    console.log('\n🔍 Step 3: 캡차 체크...');
    const captchaResult = await checkCaptcha(page);
    
    if (captchaResult.hasCaptcha) {
        console.log(`⚠️  캡차 감지! (이유: ${captchaResult.reason})`);
        console.log('⏳ 캡차를 풀어주세요... 최대 120초 대기');
        
        const resolved = await waitForCaptchaResolution(page, 120000);
        if (resolved) {
            console.log('✅ 캡차 해결됨!');
            await page.waitForTimeout(2000);
        } else {
            console.log('❌ 캡차 타임아웃');
        }
    } else {
        console.log('✅ 캡차 없음! 바로 진행');
    }
    
    console.log(`\n🌐 현재 URL: ${page.url()}`);
    
    // URL이 PC 버전으로 리다이렉트됐으면 다시 모바일로
    const currentUrl = page.url();
    if (currentUrl.includes('smartstore.naver.com') && !currentUrl.includes('m.smartstore')) {
        console.log('🔄 PC URL로 리다이렉트됨, 모바일로 재접속...');
        const reMobileUrl = currentUrl.replace('smartstore.naver.com', 'm.smartstore.naver.com');
        try {
            await page.goto(reMobileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            console.log(`   → 재접속 URL: ${page.url()}`);
        } catch (e) {
            console.log(`   → 재접속 실패: ${e.message}`);
        }
    }
    
    // Step 4: networkidle 대기
    console.log('\n⏳ Step 4: 페이지 로드 대기...');
    try {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        console.log('   → networkidle 완료');
    } catch { 
        console.log('   → networkidle 타임아웃, 계속 진행');
    }
    
    // Step 5: 스크롤 → lazy load
    console.log('\n📜 Step 5: 스크롤링...');
    await page.evaluate(async () => {
        const totalHeight = document.body.scrollHeight;
        const step = Math.floor(totalHeight / 10) || 500;
        for (let i = 0; i < 10; i++) {
            window.scrollBy(0, step);
            await new Promise(r => setTimeout(r, 300));
        }
        window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);
    console.log('   → 스크롤 완료');
    
    // Step 6: 상세정보 펼치기
    console.log('\n🔽 Step 6: 상세정보 펼치기 시도...');
    try {
        // 여러 셀렉터 시도
        const selectors = [
            'button:has-text("상품정보 더보기")',
            'a:has-text("상품정보 더보기")',
            'button:has-text("더보기")',
            '[class*="more"]',
            '[class*="fold"]',
            '[class*="expand"]',
        ];
        let clicked = false;
        for (const sel of selectors) {
            const btn = await page.$(sel);
            if (btn && await btn.isVisible()) {
                await btn.click();
                console.log(`   → 클릭 성공: ${sel}`);
                clicked = true;
                await page.waitForTimeout(2000);
                break;
            }
        }
        if (!clicked) console.log('   → 더보기 버튼 없음');
    } catch (e) {
        console.log(`   → 에러: ${e.message}`);
    }
    
    // 다시 스크롤
    await page.evaluate(async () => {
        for (let i = 0; i < 10; i++) {
            window.scrollBy(0, 500);
            await new Promise(r => setTimeout(r, 200));
        }
        window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);
    
    // Step 7: 결과 수집
    console.log('\n📊 Step 7: 결과 수집...');
    
    // 스크린샷
    const ssPath = path.join(__dirname, 'debug-screenshot.png');
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log(`📸 Screenshot: ${ssPath}`);
    
    // 페이지 제목과 가격
    const title = await page.title();
    console.log(`📌 Title: ${title}`);
    
    const price = await page.evaluate(() => {
        // 여러 가격 셀렉터 시도
        const priceSelectors = [
            '[class*="price"]',
            '[class*="Price"]',
            '[data-testid*="price"]',
        ];
        for (const sel of priceSelectors) {
            const el = document.querySelector(sel);
            if (el?.textContent?.match(/[0-9,]+원/)) {
                return el.textContent.trim().substring(0, 50);
            }
        }
        // 전체 텍스트에서 가격 패턴 찾기
        const body = document.body?.innerText || '';
        const match = body.match(/([0-9,]+)원/);
        return match ? match[0] : '없음';
    });
    console.log(`💰 가격: ${price}`);
    
    // 이미지 수집
    const allImgs = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.map(img => ({
            src: img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '',
            alt: img.alt || '',
            width: img.naturalWidth,
            height: img.naturalHeight,
            className: img.className?.substring(0, 80) || '',
        }));
    });
    
    console.log(`\n🖼️  Total <img> tags: ${allImgs.length}`);
    allImgs.forEach((img, i) => {
        if (img.src && img.width > 50) {
            console.log(`  ✅ ${i+1}. [${img.width}x${img.height}] ${img.src?.substring(0, 120)}`);
        } else if (img.src) {
            console.log(`  ⬜ ${i+1}. [${img.width}x${img.height}] ${img.src?.substring(0, 80)} (${img.className?.substring(0, 30)})`);
        }
    });
    
    // background-image도 검사
    const bgImgs = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('[style*="background-image"]'));
        return elements.map(el => {
            const style = el.getAttribute('style') || '';
            const match = style.match(/url\(["']?(.*?)["']?\)/);
            return { url: match ? match[1] : '', tag: el.tagName, className: el.className?.substring(0, 80) || '' };
        });
    });
    if (bgImgs.length > 0) {
        console.log(`\n🎨 Background images: ${bgImgs.length}`);
        bgImgs.forEach((bg, i) => console.log(`  ${i+1}. ${bg.url?.substring(0, 120)}`));
    }
    
    // 유효 상품 이미지 필터
    const productImages = allImgs.filter(img => 
        img.src && 
        img.width > 100 && img.height > 100 &&
        (img.src.includes('pstatic.net') || img.src.includes('.jpg') || img.src.includes('.png') || img.src.includes('.webp'))
    );
    
    console.log(`\n✨ 상품 이미지: ${productImages.length}개`);
    productImages.forEach((img, i) => {
        console.log(`  ${i+1}. [${img.width}x${img.height}] ${img.src?.substring(0, 150)}`);
    });
    
    // 페이지 HTML 구조 간략 출력
    const structure = await page.evaluate(() => {
        const body = document.body;
        if (!body) return 'NO BODY';
        const children = Array.from(body.children);
        return children.map(c => `<${c.tagName} class="${(c.className || '').toString().substring(0, 40)}" id="${c.id || ''}">`).join('\n');
    });
    console.log(`\n🏗️ Body children:\n${structure}`);
    
    console.log(`\n🌐 Final URL: ${page.url()}`);
    
    await browser.close();
    console.log('\n🏁 완료!');
}

function checkCaptcha(page) {
    return page.evaluate(() => {
        const url = window.location.href;
        const html = document.documentElement.innerHTML;
        const body = document.body?.innerText || '';
        
        // URL 기반
        if (url.includes('captcha')) return { hasCaptcha: true, reason: 'URL contains captcha' };
        if (url.includes('nidlogin')) return { hasCaptcha: true, reason: 'URL contains nidlogin' };
        if (url.includes('security')) return { hasCaptcha: true, reason: 'URL contains security' };
        
        // 콘텐츠 기반
        if (body.includes('캡차') || body.includes('자동입력방지')) return { hasCaptcha: true, reason: '캡차 텍스트 발견' };
        if (body.includes('보안문자')) return { hasCaptcha: true, reason: '보안문자 텍스트 발견' };
        if (html.includes('CAPTCHA') || html.includes('captcha')) return { hasCaptcha: true, reason: 'CAPTCHA in HTML' };
        if (body.includes('로봇이 아닙니다') || body.includes('I am not a robot')) return { hasCaptcha: true, reason: 'robot check' };
        if (html.includes('g-recaptcha') || html.includes('hcaptcha')) return { hasCaptcha: true, reason: 'reCAPTCHA/hCaptcha widget' };
        
        // 접두사 체크: 페이지에 상품 정보가 전혀 없으면 블록될 수 있音
        const hasProduct = body.length > 200 && (body.includes('원') || body.includes('구매') || body.includes('상품'));
        if (!hasProduct && body.length < 100) return { hasCaptcha: true, reason: '페이지 내용 없음 (might be blocked)' };
        
        return { hasCaptcha: false, reason: 'none' };
    });
}

async function waitForCaptchaResolution(page, timeout) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        await page.waitForTimeout(3000);
        
        const result = await checkCaptcha(page);
        
        if (!result.hasCaptcha) return true;
        
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(`\r  ⏳ ${elapsed}초 경과... 캡차 해결 대기 중`);
    }
    
    console.log('');
    return false;
}

main().catch(console.error);
