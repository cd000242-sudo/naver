/**
 * 🎭 v8: PC 버전 - networkidle 대기 + JS 렌더링 완료 후 상세 이미지 수집
 * React SPA 완전 로딩 대기 + 스크롤로 lazy-load 트리거
 */
const TEST_URL = 'https://naver.me/5XcLgMkJ';
const fs = require('fs');

function log(msg) {
    console.log(msg);
    fs.appendFileSync('test-crawl-log.txt', msg + '\n');
}

async function testCrawl() {
    fs.writeFileSync('test-crawl-log.txt', '');
    log('=== v8: PC + networkidle + 스크롤 lazy-load ===');
    log(`URL: ${TEST_URL}\n`);

    const { chromium } = require('playwright-extra');
    const stealth = require('puppeteer-extra-plugin-stealth');
    chromium.use(stealth());

    const path = require('path');
    const os = require('os');
    const profileDir = path.join(os.tmpdir(), 'leword-crawler-profile');

    let context;
    try {
        context = await chromium.launchPersistentContext(profileDir, {
            headless: false,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--disable-infobars',
                '--no-first-run',
                '--no-default-browser-check',
            ],
            viewport: { width: 1280, height: 900 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            locale: 'ko-KR',
            timezoneId: 'Asia/Seoul',
        });

        const page = context.pages()[0] || await context.newPage();

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 네이버/pstatic 외 광고만 차단
        await page.route('**/*', (route) => {
            const reqUrl = route.request().url();
            const type = route.request().resourceType();
            // 광고/트래커만 차단, 나머지는 모두 허용
            if (reqUrl.includes('google-analytics') || reqUrl.includes('doubleclick') ||
                reqUrl.includes('criteo') || reqUrl.includes('facebook') ||
                reqUrl.includes('twitter') || reqUrl.includes('adservice')) {
                return route.abort();
            }
            route.continue();
        });

        const start = Date.now();

        // 접속 + networkidle 대기
        log('📌 스마트스토어 접속...');
        await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 20000 });
        log(`   로딩 완료: ${((Date.now() - start) / 1000).toFixed(1)}초`);

        const url = page.url();
        log(`   URL: ${url.substring(0, 80)}`);

        // 캡차 체크
        let content = '';
        try { content = await page.content(); } catch {}
        const captchaKw = ['캡차', 'captcha', 'CAPTCHA', '자동입력', '보안문자'];
        if (captchaKw.some(k => content.includes(k))) {
            log('\n🔒 캡차! 브라우저에서 풀어주세요...');
            for (let i = 0; i < 180; i++) {
                await page.waitForTimeout(1000);
                try {
                    const c = await page.content();
                    if (!captchaKw.some(k => c.includes(k))) {
                        log(`✅ 캡차 해결! (${i+1}초)`);
                        break;
                    }
                } catch { break; }
                if (i % 15 === 0 && i > 0) log(`⏳ ${i}초 대기...`);
            }
            // 캡차 후 다시 로딩
            try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
        } else {
            log('✅ 캡차 없음');
        }

        const title = await page.title();
        log(`📝 타이틀: ${title}`);

        // React 렌더링 완료 대기
        log('\n⏳ React 렌더링 대기...');
        try {
            await page.waitForSelector('img[src*="shop-phinf.pstatic.net"]', { timeout: 5000 });
            log('   ✅ 상품 이미지 감지');
        } catch {
            log('   ⚠️ 상품 이미지 미감지 (5초 내)');
        }

        // 추가 대기 (SPA 데이터 바인딩)
        await page.waitForTimeout(2000);

        // 1. 갤러리 이미지 수집
        log('\n🖼️ 1. 갤러리 이미지 (상단)...');
        const galleryImgs = await page.evaluate(() => {
            const imgs = [];
            document.querySelectorAll('img').forEach(img => {
                const src = img.src || '';
                if (src.includes('shop-phinf.pstatic.net') && img.naturalWidth >= 200) {
                    const rect = img.getBoundingClientRect();
                    if (rect.top < 1000) {
                        imgs.push({ src, w: img.naturalWidth, h: img.naturalHeight, y: Math.round(rect.top) });
                    }
                }
            });
            return imgs;
        });
        log(`   갤러리 이미지: ${galleryImgs.length}개`);
        galleryImgs.forEach((g, i) => log(`   ${i+1}. [${g.w}x${g.h}] ${g.src.substring(0, 90)}`));

        // 2. 스크롤로 lazy-load 이미지 트리거
        log('\n📜 2. 점진 스크롤 (lazy-load 트리거)...');
        const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
        log(`   페이지 높이: ${scrollHeight}px`);
        
        const step = 500;
        for (let y = 0; y <= scrollHeight; y += step) {
            await page.evaluate((pos) => window.scrollTo(0, pos), y);
            await page.waitForTimeout(200);
        }
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);

        // 스크롤 후 높이가 바뀌었을 경우 추가 스크롤
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight > scrollHeight + 500) {
            log(`   새 높이: ${newHeight}px (${newHeight - scrollHeight}px 증가)`);
            for (let y = scrollHeight; y <= newHeight; y += step) {
                await page.evaluate((pos) => window.scrollTo(0, pos), y);
                await page.waitForTimeout(200);
            }
            await page.waitForTimeout(1500);
        }

        // 3. 전체 이미지 수집
        log('\n📊 3. 전체 이미지 수집...');
        const allImgs = await page.evaluate(() => {
            const result = [];
            document.querySelectorAll('img').forEach(img => {
                const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || '';
                if (!src || src.startsWith('data:')) return;
                const rect = img.getBoundingClientRect();
                result.push({
                    src,
                    w: img.naturalWidth,
                    h: img.naturalHeight,
                    y: Math.round(rect.top + window.scrollY),
                    cls: (img.className || '').substring(0, 60),
                    parent: img.parentElement?.tagName || '',
                    alt: (img.alt || '').substring(0, 40)
                });
            });
            return result;
        });

        const shopImages = allImgs.filter(i => i.src.includes('shop-phinf.pstatic.net'));
        const largeImages = shopImages.filter(i => i.w >= 200 || i.h >= 200);

        log(`   전체 img: ${allImgs.length}개`);
        log(`   shop-phinf 이미지: ${shopImages.length}개`);
        log(`   large (200+): ${largeImages.length}개`);

        log('\n--- shop-phinf 이미지 ---');
        shopImages.forEach((i, idx) => {
            log(`${idx+1}. [${i.w}x${i.h}] y=${i.y} alt=${i.alt} ${i.src.substring(0, 100)}`);
        });

        // 4. iframe 내부 상세 이미지
        log('\n🔍 4. iframe 상세 이미지...');
        const frames = page.frames();
        log(`   프레임 수: ${frames.length}개`);
        
        let iframeImages = [];
        for (const frame of frames) {
            const frameUrl = frame.url();
            if (!frameUrl || frameUrl.startsWith('about:') || frameUrl === url) continue;
            
            log(`   프레임: ${frameUrl.substring(0, 80)}`);
            try {
                // iframe 내부 스크롤
                await frame.evaluate(() => {
                    let pos = 0;
                    const h = document.body?.scrollHeight || 0;
                    while (pos < h) { pos += 500; window.scrollTo(0, pos); }
                });
                await page.waitForTimeout(500);
                
                const imgs = await frame.evaluate(() => {
                    return Array.from(document.querySelectorAll('img')).map(img => ({
                        src: img.src || img.getAttribute('data-src') || '',
                        w: img.naturalWidth || 0,
                        h: img.naturalHeight || 0,
                    })).filter(i => i.src && !i.src.startsWith('data:') && i.src.includes('pstatic.net'));
                });
                
                if (imgs.length > 0) {
                    log(`     → pstatic 이미지: ${imgs.length}개`);
                    iframeImages.push(...imgs);
                }
            } catch (e) {
                log(`     → 접근 불가: ${e.message.substring(0, 40)}`);
            }
        }
        log(`   iframe 총: ${iframeImages.length}개`);

        // 5. 배경 이미지 수집 (div background-image)
        log('\n🎨 5. 배경 이미지...');
        const bgImgs = await page.evaluate(() => {
            const result = [];
            document.querySelectorAll('*').forEach(el => {
                const bg = getComputedStyle(el).backgroundImage;
                if (bg && bg !== 'none' && bg.includes('shop-phinf.pstatic.net')) {
                    const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
                    if (match) {
                        const rect = el.getBoundingClientRect();
                        result.push({
                            src: match[1],
                            w: Math.round(rect.width),
                            h: Math.round(rect.height),
                            y: Math.round(rect.top + window.scrollY),
                            tag: el.tagName
                        });
                    }
                }
            });
            return result;
        });
        log(`   배경 이미지: ${bgImgs.length}개`);
        bgImgs.forEach((i, idx) => {
            log(`   ${idx+1}. [${i.w}x${i.h}] y=${i.y} <${i.tag}> ${i.src.substring(0, 90)}`);
        });

        // 6. OG 메타 이미지
        log('\n🏷️ 6. OG/메타 이미지...');
        const metaImgs = await page.evaluate(() => {
            const imgs = [];
            document.querySelectorAll('meta[property*="image"], meta[name*="image"]').forEach(meta => {
                const c = meta.content || meta.getAttribute('content') || '';
                if (c && c.includes('http')) imgs.push(c);
            });
            return imgs;
        });
        log(`   메타 이미지: ${metaImgs.length}개`);
        metaImgs.forEach((src, i) => log(`   ${i+1}. ${src.substring(0, 100)}`));

        // 결과 종합
        const seen = new Set();
        const result = [];
        const addImg = (src, w, h, category) => {
            const key = src.split('?')[0];
            if (seen.has(key)) return;
            if (!src.includes('shop-phinf.pstatic.net')) return;
            seen.add(key);
            result.push({ src, w, h, category });
        };

        galleryImgs.forEach(i => addImg(i.src, i.w, i.h, 'gallery'));
        largeImages.forEach(i => addImg(i.src, i.w, i.h, 'main'));
        bgImgs.forEach(i => addImg(i.src, i.w, i.h, 'bg'));
        iframeImages.forEach(i => addImg(i.src, i.w, i.h, 'iframe'));
        metaImgs.forEach(s => addImg(s, 0, 0, 'meta'));

        log(`\n🎯 최종 수집: ${result.length}개`);
        result.forEach((i, idx) => {
            log(`   ${idx+1}. [${i.category}] ${i.w}x${i.h} ${i.src.substring(0, 80)}`);
        });

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        log(`\n⏱️ 소요: ${elapsed}초`);
        log(`📍 최종: ${page.url().substring(0, 80)}`);

        // 위로 스크롤 후 스크린샷
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        await page.screenshot({ path: 'test-crawl-result.png', fullPage: false });
        
        // 스크롤 중간 지점 스크린샷
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await page.waitForTimeout(300);
        await page.screenshot({ path: 'test-crawl-mid.png', fullPage: false });
        
        log('📸 스크린샷 저장');

        await context.close();
    } catch (e) {
        log(`\n❌ 에러: ${e.message}`);
        log(e.stack);
        if (context) await context.close().catch(() => {});
    }

    log('\n=== 완료 ===');
}

testCrawl();
