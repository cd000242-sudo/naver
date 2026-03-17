import { crawlShoppingSite } from './src/crawler/strategies/shoppingStrategy.js';

const TEST_URL = 'https://smartstore.naver.com/bfkr/products/11394122187?NaPm=ct%3Dmmmzfpx6%7Cci%3Daffiliate%7Ctr%3Daff%7Ctrx%3D928527918642656%7Chk%3D65c05298c0cf03569f4d4c46ef70ba4793d5a8ca&originChannelInfo=ac%3DUNKNOWN%7Cctid%3Dnull%7Ccid%3Dnull';

async function main() {
    console.log('=== 쇼핑 크롤러 테스트 시작 ===');
    console.log(`URL: ${TEST_URL.substring(0, 80)}...`);
    console.log('');

    const start = Date.now();
    const result = await crawlShoppingSite(TEST_URL);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log('');
    console.log('=== 크롤링 결과 ===');
    console.log(`소요 시간: ${elapsed}초`);
    console.log(`총 이미지: ${result.images.length}개`);
    console.log(`제목: ${result.title || '(없음)'}`);
    console.log(`가격: ${result.price || '(없음)'}`);
    console.log(`본문: ${(result.content || '').substring(0, 100)}...`);

    if (result.categorizedImages) {
        const cat = result.categorizedImages;
        console.log('');
        console.log('=== 섹션별 이미지 ===');
        console.log(`갤러리: ${cat.gallery.length}개`);
        cat.gallery.forEach((url, i) => console.log(`  [G${i}] ${url.substring(0, 100)}`));
        console.log(`상세: ${cat.detail.length}개`);
        cat.detail.slice(0, 5).forEach((url, i) => console.log(`  [D${i}] ${url.substring(0, 100)}`));
        if (cat.detail.length > 5) console.log(`  ... (${cat.detail.length - 5}개 더)`);
        console.log(`리뷰: ${cat.review.length}개`);
        cat.review.slice(0, 3).forEach((url, i) => console.log(`  [R${i}] ${url.substring(0, 100)}`));
        if (cat.review.length > 3) console.log(`  ... (${cat.review.length - 3}개 더)`);
    } else {
        console.log('⚠️ categorizedImages 없음 (일반 쇼핑몰로 처리됨)');
    }

    console.log('');
    console.log(`=== 테스트 완료 (${elapsed}초) ===`);
}

main().catch(err => {
    console.error('테스트 실패:', err);
    process.exit(1);
});
