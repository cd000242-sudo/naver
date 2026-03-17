// 쇼핑 크롤러 테스트 스크립트
const { crawlShoppingSite } = require('./dist/crawler/strategies/shoppingStrategy.js');

async function main() {
    const url = 'https://smartstore.naver.com/bfkr/products/11394122187?NaPm=ct%3Dmmms55jb%7Cci%3Daffiliate%7Ctr%3Daff%7Ctrx%3D928527918642656%7Chk%3D79729d6e59cdc27f276e6b124cc8947e5da870e5&originChannelInfo=ac%3DUNKNOWN%7Cctid%3Dnull%7Ccid%3Dnull';
    
    console.log('═══════════════════════════════════════');
    console.log('🧪 Shopping Crawler Test');
    console.log('═══════════════════════════════════════');
    console.log(`URL: ${url.substring(0, 80)}...`);
    console.log('');
    
    const start = Date.now();
    
    try {
        const result = await crawlShoppingSite(url);
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        
        console.log('');
        console.log('═══════════════════════════════════════');
        console.log(`⏱️  총 소요시간: ${elapsed}초`);
        console.log(`📷  총 이미지: ${result.images.length}개`);
        
        if (result.categorizedImages) {
            console.log(`   🖼️  갤러리: ${result.categorizedImages.gallery.length}개`);
            console.log(`   📄  상세: ${result.categorizedImages.detail.length}개`);
            console.log(`   📝  리뷰: ${result.categorizedImages.review.length}개`);
        }
        
        console.log(`📝  제목: ${(result.title || '없음').substring(0, 60)}`);
        console.log(`📄  본문: ${result.content?.length || 0}자`);
        console.log(`💰  가격: ${result.price || '없음'}`);
        console.log('');
        
        // 이미지 URL 목록 출력 (최대 20개)
        console.log('--- 이미지 목록 (최대 20개) ---');
        result.images.slice(0, 20).forEach((img, idx) => {
            console.log(`  ${idx + 1}. ${img.substring(0, 100)}...`);
        });
        
        if (result.images.length > 20) {
            console.log(`  ... 외 ${result.images.length - 20}개`);
        }
        
        // 3분 이내 체크
        const sec = parseFloat(elapsed);
        if (sec <= 180) {
            console.log(`\n✅ 3분 이내 완료! (${elapsed}초)`);
        } else {
            console.log(`\n⚠️ 3분 초과! (${elapsed}초)`);
        }
        
        console.log('═══════════════════════════════════════');
    } catch (error) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.error(`\n❌ 크롤링 실패 (${elapsed}초):`, error.message);
    }
}

main();
