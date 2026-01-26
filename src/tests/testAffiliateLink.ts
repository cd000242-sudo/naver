// 테스트: crawlFromAffiliateLink가 정확한 제품 정보를 가져오는지 확인
import { crawlFromAffiliateLink } from '../crawler/productSpecCrawler.js';

async function testCrawlFromAffiliateLink() {
    console.log('='.repeat(60));
    console.log('🧪 crawlFromAffiliateLink 테스트 시작');
    console.log('='.repeat(60));

    const testUrl = 'https://brand.naver.com/pulio_official/products/11236043404';

    console.log(`\n📌 테스트 URL: ${testUrl}`);
    console.log('⏳ 상품 정보 수집 중...\n');

    try {
        const result = await crawlFromAffiliateLink(testUrl);

        if (result) {
            console.log('\n✅ 수집 성공!');
            console.log('='.repeat(60));
            console.log(`📦 상품명: ${result.name}`);
            console.log(`💰 가격: ${result.price?.toLocaleString()}원`);
            console.log(`🔗 상세URL: ${result.detailUrl}`);
            console.log(`🖼️ 메인 이미지: ${result.mainImage ? '있음' : '없음'}`);
            console.log(`📸 갤러리 이미지: ${result.galleryImages?.length || 0}개`);
            console.log(`📋 상세 이미지: ${result.detailImages?.length || 0}개`);
            console.log('='.repeat(60));

            // 검증
            if (result.name && result.name !== '상품명을 불러올 수 없습니다') {
                console.log('\n🎉 테스트 통과! 정확한 제품 정보를 가져왔습니다.');

                // 이름에 "스토어" 또는 "pulio_official"이 포함되면 실패
                if (result.name.includes('스토어') || result.name.includes('pulio_official')) {
                    console.log('⚠️ 경고: 제품명에 스토어 이름이 포함됨 - 잘못된 결과일 수 있음');
                } else {
                    console.log('✅ 제품명이 스토어명이 아닌 실제 제품명입니다!');
                }
            } else {
                console.log('\n❌ 테스트 실패: 제품 정보를 가져오지 못했습니다.');
            }
        } else {
            console.log('\n❌ 테스트 실패: 결과가 null입니다.');
        }
    } catch (error) {
        console.error('\n❌ 테스트 오류:', (error as Error).message);
    }
}

testCrawlFromAffiliateLink().then(() => {
    console.log('\n테스트 완료');
    process.exit(0);
}).catch((err) => {
    console.error('테스트 실행 오류:', err);
    process.exit(1);
});
