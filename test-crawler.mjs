/**
 * 쇼핑 크롤러 테스트 스크립트
 */

import { collectShoppingImages } from './dist/crawler/shopping/index.js';

const testUrl = 'https://brand.naver.com/pulmuone_cooking/products/11131467341';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 쇼핑 크롤러 테스트');
console.log('═══════════════════════════════════════════════════════');
console.log(`📌 URL: ${testUrl}`);
console.log('═══════════════════════════════════════════════════════\n');

try {
    const result = await collectShoppingImages(testUrl, {
        timeout: 30000,
        maxImages: 20,
        includeDetails: true,
    });

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 결과 요약');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ 성공 여부: ${result.success}`);
    console.log(`🖼️ 이미지 수: ${result.images?.length || 0}개`);
    console.log(`🏷️ 제품명: ${result.productInfo?.name || 'N/A'}`);
    console.log(`💰 가격: ${result.productInfo?.price || 'N/A'}`);
    console.log(`⚙️ 사용된 전략: ${result.usedStrategy || 'N/A'}`);
    console.log(`⏱️ 소요 시간: ${result.timing || 0}ms`);

    if (result.images?.length > 0) {
        console.log('\n📸 수집된 이미지 목록:');
        result.images.forEach((img, i) => {
            console.log(`  ${i + 1}. [${img.type}] ${img.url.substring(0, 80)}...`);
        });
    }

    if (result.error) {
        console.log(`\n❌ 오류: ${result.error}`);
    }

} catch (error) {
    console.error('❌ 테스트 실패:', error.message);
}

console.log('\n═══════════════════════════════════════════════════════');
