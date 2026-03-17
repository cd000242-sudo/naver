/**
 * 전체보기 모달 디버그 — 각 단계별 결과 출력
 */
const { chromium } = require('playwright');

async function test() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    try {
        console.log('=== 전체보기 모달 디버그 ===');

        await page.goto('https://brand.naver.com/jupazip/products/12453396043', {
            waitUntil: 'domcontentloaded', timeout: 30000
        });
        await page.waitForTimeout(5000);
        console.log('✅ 페이지 로드 완료');

        // Step 1: 리뷰 탭 클릭
        const reviewTabResult = await page.evaluate(() => {
            const exactTab = document.querySelector('a[data-name="REVIEW"]');
            if (exactTab) {
                exactTab.click();
                return `found: "${exactTab.textContent?.trim()?.substring(0, 30)}"`;
            }
            return 'NOT FOUND';
        });
        console.log(`[Step1] 리뷰 탭: ${reviewTabResult}`);
        await page.waitForTimeout(4000);

        // Step 2: 전체보기 버튼 찾기 (클릭 전에 먼저 존재 확인)
        const viewAllInfo = await page.evaluate(() => {
            const btn1 = document.querySelector('button.lbsWelnf3O');
            const allBtns = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent?.includes('전체보기'));
            return {
                exactSelector: btn1 ? `found: "${btn1.textContent?.trim()}"` : 'NOT FOUND',
                textSearch: allBtns.length > 0 ? allBtns.map(b => `"${b.textContent?.trim()?.substring(0, 30)}"`).join(', ') : 'NOT FOUND',
                totalButtons: document.querySelectorAll('button').length
            };
        });
        console.log(`[Step2] 전체보기 버튼 검색:`);
        console.log(`  - 정확셀렉터(button.lbsWelnf3O): ${viewAllInfo.exactSelector}`);
        console.log(`  - 텍스트검색(전체보기): ${viewAllInfo.textSearch}`);
        console.log(`  - 총 버튼 수: ${viewAllInfo.totalButtons}`);

        // Step 2b: 스크롤해서 전체보기 버튼 노출 시도
        for (let i = 0; i < 10; i++) {
            await page.evaluate((i) => window.scrollBy(0, 500 + i * 200), i);
            await page.waitForTimeout(300);
        }
        await page.waitForTimeout(2000);

        const viewAllAfterScroll = await page.evaluate(() => {
            const btn1 = document.querySelector('button.lbsWelnf3O');
            const allBtns = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent?.includes('전체보기'));
            return {
                exactSelector: btn1 ? `found: "${btn1.textContent?.trim()}"` : 'NOT FOUND',
                textSearch: allBtns.length > 0 ? allBtns.map(b => `"${b.textContent?.trim()?.substring(0, 30)}"`).join(', ') : 'NOT FOUND',
            };
        });
        console.log(`[Step2b] 스크롤 후 전체보기 버튼:`);
        console.log(`  - 정확셀렉터: ${viewAllAfterScroll.exactSelector}`);
        console.log(`  - 텍스트검색: ${viewAllAfterScroll.textSearch}`);

        // Step 3: 전체보기 클릭
        const clickResult = await page.evaluate(() => {
            const btn = document.querySelector('button.lbsWelnf3O') ||
                Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('전체보기'));
            if (btn) {
                (btn).click();
                return `clicked: "${btn.textContent?.trim()}"`;
            }
            return 'NO BUTTON TO CLICK';
        });
        console.log(`[Step3] 전체보기 클릭: ${clickResult}`);
        await page.waitForTimeout(3000);

        // Step 4: 모달 확인
        const modalInfo = await page.evaluate(() => {
            const modal1 = document.querySelector('div.w1HvXHyVCb');
            const modal2 = document.querySelector('div.ZLJruxZTMK');
            const fixedOverlay = document.querySelector('[style*="position: fixed"][style*="z-index: 2147483647"]');
            const allDtlLinks = document.querySelectorAll('a[data-shp-contents-dtl]');

            return {
                modal1: modal1 ? 'FOUND' : 'NOT FOUND',
                modal2: modal2 ? 'FOUND' : 'NOT FOUND',
                fixedOverlay: fixedOverlay ? 'FOUND' : 'NOT FOUND',
                dtlLinksCount: allDtlLinks.length,
                sampleDtl: allDtlLinks.length > 0 ? allDtlLinks[0].getAttribute('data-shp-contents-dtl')?.substring(0, 100) : 'N/A'
            };
        });
        console.log(`[Step4] 모달 확인:`);
        console.log(`  - div.w1HvXHyVCb: ${modalInfo.modal1}`);
        console.log(`  - div.ZLJruxZTMK: ${modalInfo.modal2}`);
        console.log(`  - fixedOverlay: ${modalInfo.fixedOverlay}`);
        console.log(`  - data-shp-contents-dtl 링크 수: ${modalInfo.dtlLinksCount}`);
        console.log(`  - 샘플 dtl: ${modalInfo.sampleDtl}`);

        // Step 5: URL 추출
        if (modalInfo.dtlLinksCount > 0) {
            const urls = await page.evaluate(() => {
                const imgs = [];
                const seen = new Set();
                document.querySelectorAll('a[data-shp-contents-dtl]').forEach(link => {
                    try {
                        const dtl = link.getAttribute('data-shp-contents-dtl') || '';
                        const parsed = JSON.parse(dtl);
                        if (Array.isArray(parsed)) {
                            for (const item of parsed) {
                                if (item.key === 'img_url' && item.value) {
                                    if (!seen.has(item.value)) {
                                        imgs.push(item.value);
                                        seen.add(item.value);
                                    }
                                }
                            }
                        }
                    } catch (e) { }
                });
                return imgs.slice(0, 5);
            });
            console.log(`[Step5] 추출된 URL ${urls.length}개:`);
            urls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));
        }

    } catch (err) {
        console.log('Error:', err.message);
    } finally {
        await browser.close();
    }
    process.exit(0);
}

test();
