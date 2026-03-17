/**
 * crawlFromAffiliateLink 직접 테스트
 * naver.me 단축 URL → 스마트스토어 상품 정보 수집
 */

// dist에서 빌드된 JS 직접 import
const path = require('path');

async function main() {
    console.log('='.repeat(60));
    console.log('🧪 crawlFromAffiliateLink 테스트');
    console.log('   URL: https://naver.me/5XcLgMkJ');
    console.log('='.repeat(60));

    try {
        // 빌드된 모듈 로드
        const crawler = require('./dist/crawler/productSpecCrawler.js');
        
        console.log('\n📡 crawlFromAffiliateLink 호출 중...');
        const startTime = Date.now();
        
        const result = await crawler.crawlFromAffiliateLink('https://naver.me/5XcLgMkJ');
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        
        if (result) {
            console.log(`\n✅ 성공! (${elapsed}초)`);
            console.log(`  상품명: ${result.name}`);
            console.log(`  가격: ${(result.price || 0).toLocaleString()}원`);
            console.log(`  메인 이미지: ${result.mainImage ? result.mainImage.substring(0, 60) + '...' : '없음'}`);
            console.log(`  갤러리 이미지: ${(result.galleryImages || []).length}개`);
            console.log(`  상세 이미지: ${(result.detailImages || []).length}개`);
            console.log(`  설명: ${(result.description || '').substring(0, 100)}...`);
            console.log(`  URL: ${result.detailUrl}`);
        } else {
            console.log(`\n❌ 실패 (${elapsed}초) - null 반환됨`);
        }
    } catch (err) {
        console.error(`\n❌ 에러: ${err.message}`);
        console.error(err.stack);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('테스트 완료');
    
    // Playwright 프로세스 정리
    setTimeout(() => process.exit(0), 2000);
}

main();
