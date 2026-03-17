/**
 * 기존 sourceAssembler 방식으로 브랜드스토어 테스트
 */

import { fetchShoppingImages } from './dist/sourceAssembler.js';

const testUrl = 'https://brand.naver.com/pulmuone_cooking/products/11131467341';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 기존 sourceAssembler 테스트');
console.log('═══════════════════════════════════════════════════════');
console.log(`📌 URL: ${testUrl}`);
console.log('═══════════════════════════════════════════════════════\n');

try {
    const result = await fetchShoppingImages(testUrl, {
        imagesOnly: true,
    });

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 결과 요약');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ 이미지 수: ${result.images?.length || 0}개`);
    console.log(`🏷️ 제목: ${result.title || 'N/A'}`);

    if (result.images?.length > 0) {
        console.log('\n📸 수집된 이미지 (처음 10개):');
        result.images.slice(0, 10).forEach((img, i) => {
            console.log(`  ${i + 1}. ${typeof img === 'string' ? img.substring(0, 80) : JSON.stringify(img).substring(0, 80)}...`);
        });
    }

} catch (error) {
    console.error('❌ 테스트 실패:', error.message);
}

console.log('\n═══════════════════════════════════════════════════════');
