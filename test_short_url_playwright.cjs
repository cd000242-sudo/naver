/**
 * Playwright로 naver.me 단축 URL의 JS 리다이렉트 추적 테스트
 */
const { chromium } = require('playwright');

const TEST_URL = 'https://naver.me/5XcLgMkJ';

async function main() {
    console.log('='.repeat(60));
    console.log(`🧪 Playwright로 단축 URL JS 리다이렉트 추적`);
    console.log(`   URL: ${TEST_URL}`);
    console.log('='.repeat(60));
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();
    
    // 리소스 절약
    await page.route('**/*', route => {
        const type = route.request().resourceType();
        if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
            route.abort();
        } else {
            route.continue();
        }
    });
    
    console.log('\n📎 페이지 로딩 중...');
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    // 최종 URL 추출 (최대 10초 대기)
    const storePatterns = ['smartstore.naver.com', 'brand.naver.com', 'shopping.naver.com'];
    let finalUrl = page.url();
    console.log(`  → 초기 URL: ${finalUrl.substring(0, 80)}...`);
    
    for (let i = 0; i < 20; i++) {
        if (storePatterns.some(p => finalUrl.includes(p))) {
            console.log(`  → ✅ 스토어 URL 감지됨! (${i * 500}ms 후)`);
            break;
        }
        await page.waitForTimeout(500);
        finalUrl = page.url();
        if (i % 4 === 0) {
            console.log(`  → [${i * 500}ms] 현재: ${finalUrl.substring(0, 80)}...`);
        }
    }
    
    console.log(`\n🎯 최종 URL: ${finalUrl}`);
    
    // URL 분석
    const isSmartStore = finalUrl.includes('smartstore.naver.com');
    const isBrandStore = finalUrl.includes('brand.naver.com');
    const productMatch = finalUrl.match(/products\/(\d+)/);
    const storeMatch = finalUrl.match(/(?:smartstore|brand)\.naver\.com\/([^\/\?]+)/);
    
    console.log(`\n📊 URL 분석:`);
    console.log(`  스마트스토어: ${isSmartStore}`);
    console.log(`  브랜드스토어: ${isBrandStore}`);
    if (productMatch) console.log(`  상품 ID: ${productMatch[1]}`);
    if (storeMatch) console.log(`  스토어명: ${storeMatch[1]}`);
    
    // 상품 정보 추출
    if (productMatch) {
        console.log(`\n📡 모바일 API로 상품 정보 수집...`);
        const apiUrl = `https://m.smartstore.naver.com/i/v1/products/${productMatch[1]}`;
        try {
            const resp = await fetch(apiUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36' }
            });
            if (resp.ok) {
                const data = await resp.json();
                console.log(`\n✅ 상품 정보 수집 성공!`);
                console.log(`  상품명: ${data.name || '(없음)'}`);
                console.log(`  가격: ${(data.salePrice || data.discountedSalePrice || 0).toLocaleString()}원`);
                if (data.productImages) {
                    console.log(`  이미지: ${data.productImages.length}개`);
                    data.productImages.slice(0, 5).forEach((img, i) => {
                        const imgUrl = typeof img === 'string' ? img : img.url;
                        console.log(`    [${i+1}] ${imgUrl ? imgUrl.substring(0, 70) : JSON.stringify(img).substring(0, 70)}...`);
                    });
                }
            } else {
                console.log(`  → API 응답: ${resp.status}`);
            }
        } catch (e) {
            console.log(`  → API 실패: ${e.message}`);
        }
    }
    
    // 페이지에서도 정보 추출
    try {
        const pageTitle = await page.title();
        console.log(`\n📄 페이지 제목: ${pageTitle}`);
    } catch {}
    
    await browser.close();
    console.log('\n' + '='.repeat(60));
    console.log('테스트 완료');
}

main().catch(err => {
    console.error('❌ 테스트 실패:', err.message);
    process.exit(1);
});
