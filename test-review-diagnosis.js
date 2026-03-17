/**
 * 리뷰 탭 클릭 후 이미지 진단
 */
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());
const path = require('path');
const fs = require('fs');

async function test() {
    const appDataPath = process.env.APPDATA || '';
    const sessionDir = path.join(appDataPath, 'better-life-naver', 'puppeteer-session-diag-' + Date.now());
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const browser = await puppeteerExtra.launch({
        headless: false,
        userDataDir: sessionDir,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://brand.naver.com/jupazip/products/12453396043', {
        waitUntil: 'domcontentloaded', timeout: 30000
    });
    await new Promise(r => setTimeout(r, 5000));

    // 상품명 확인
    const title = await page.evaluate(() => {
        return document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
            document.querySelector('h3')?.textContent || ''
    });
    console.log('상품명:', title);

    // 리뷰 탭 클릭
    const clicked = await page.evaluate(() => {
        const allEls = Array.from(document.querySelectorAll('a, button, [role="tab"], li'));
        for (const el of allEls) {
            const text = (el.textContent || '').trim();
            if (text.includes('리뷰') || text.includes('후기')) {
                (el).click();
                return text;
            }
        }
        return null;
    });
    console.log('리뷰 탭 클릭:', clicked);

    await new Promise(r => setTimeout(r, 4000));

    // 포토리뷰 탭 클릭 시도
    const photoClicked = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a, button, span, li'));
        for (const el of els) {
            const text = (el.textContent || '').trim();
            if (text.includes('포토') || text.includes('사진') || text.includes('photo')) {
                (el).click();
                return text;
            }
        }
        return null;
    });
    console.log('포토리뷰 탭:', photoClicked);
    await new Promise(r => setTimeout(r, 3000));

    // 스크롤
    for (let i = 0; i < 5; i++) {
        await page.evaluate((i) => window.scrollBy(0, 500 + i * 200), i);
        await new Promise(r => setTimeout(r, 800));
    }

    // 리뷰 영역 진단
    const diagnosis = await page.evaluate(() => {
        const results = {};

        // 1. [class*="review"] 안의 img 태그
        const reviewImgs = document.querySelectorAll('[class*="review"] img, [class*="Review"] img');
        results.reviewImgCount = reviewImgs.length;
        results.reviewImgSrcs = Array.from(reviewImgs).slice(0, 5).map(img => ({
            src: (img).src?.substring(0, 100),
            cls: (img).className,
            parent: img.parentElement?.className
        }));

        // 2. 모든 img에서 pstatic.net 포함된 것
        const allPstaticImgs = Array.from(document.querySelectorAll('img'))
            .filter(img => img.src.includes('pstatic.net'))
            .map(img => ({
                src: img.src.substring(0, 120),
                w: img.naturalWidth, h: img.naturalHeight,
                parent: img.parentElement?.className?.substring(0, 50)
            }));
        results.totalPstaticImgs = allPstaticImgs.length;
        results.pstaticImgSamples = allPstaticImgs.slice(0, 20);

        // 3. 리뷰 관련 클래스 찾기
        const reviewEls = document.querySelectorAll('[class*="review"], [class*="Review"]');
        results.reviewElCount = reviewEls.length;
        results.reviewElClasses = Array.from(reviewEls).slice(0, 10).map(el => ({
            tag: el.tagName, cls: el.className?.substring(0, 80),
            imgCount: el.querySelectorAll('img').length,
            childText: el.textContent?.substring(0, 50)
        }));

        // 4. M6TOdPtHmb 클래스 확인
        results.m6todCount = document.querySelectorAll('.M6TOdPtHmb, img.M6TOdPtHmb').length;

        return results;
    });

    fs.writeFileSync('test-review-diagnosis.json', JSON.stringify(diagnosis, null, 2), 'utf8');
    console.log('reviewImgCount:', diagnosis.reviewImgCount);
    console.log('totalPstaticImgs:', diagnosis.totalPstaticImgs);
    console.log('reviewElCount:', diagnosis.reviewElCount);
    console.log('m6todCount:', diagnosis.m6todCount);

    await browser.close();
    process.exit(0);
}

test().catch(err => { console.error(err); process.exit(1); });
