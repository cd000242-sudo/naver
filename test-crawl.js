// 환경변수 로드 후 실제 API 테스트
import 'dotenv/config';
import { crawlFromAffiliateLink } from './dist/crawler/productSpecCrawler.js';

const testUrl = 'https://brand.naver.com/catchwell/products/11705732817';

console.log('환경변수 확인:');
console.log('NAVER_CLIENT_ID:', process.env.NAVER_CLIENT_ID ? '설정됨' : '없음');
console.log('');
console.log('='.repeat(60));
console.log('실제 API 테스트: 브랜드스토어 제품명 추출');
console.log('URL:', testUrl);
console.log('='.repeat(60));

try {
    const result = await crawlFromAffiliateLink(testUrl);

    console.log('\n결과:');
    console.log('-'.repeat(40));

    if (result) {
        console.log('제품명:', result.name);
        console.log('가격:', result.price);
        console.log('설명 길이:', result.description?.length || 0, '자');
        console.log('메인 이미지:', result.mainImage ? '있음' : '없음');

        // 성공 기준 확인
        const isProductName = /CX\s*PRO|매직타워|무선청소기/i.test(result.name);
        const isSlogan = /함께|편리한|일상|그리는/i.test(result.name) && !/청소기|PRO/i.test(result.name);

        console.log('\n검증:');
        console.log('- 제품명 패턴 있음:', isProductName ? '✅' : '❌');
        console.log('- 슬로건 패턴 (문제):', isSlogan ? '❌ 문제!' : '✅ 없음');

        if (isProductName) {
            console.log('\n✅ 테스트 성공! 올바른 제품명 추출됨');
        } else if (result.name === '상품명을 불러올 수 없습니다') {
            console.log('\n⚠️ API 호출 실패 (Rate Limit?)');
        } else {
            console.log('\n❌ 테스트 실패! 제품명:', result.name);
        }
    } else {
        console.log('❌ 결과 없음 (null 반환)');
    }
} catch (error) {
    console.error('오류:', error.message);
}
