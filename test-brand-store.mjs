// 실제 앱과 동일한 환경에서 브랜드스토어 크롤링 테스트
// 환경변수를 앱과 동일하게 로드

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파일 로드 (앱과 동일한 방식)
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('='.repeat(70));
console.log('🧪 브랜드스토어 크롤링 테스트 (실제 앱 환경)');
console.log('='.repeat(70));

// 환경변수 확인
console.log('\n📌 환경변수 상태:');
console.log(`  NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`  NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    console.log('\n❌ 테스트 실패: 네이버 API 키가 없습니다.');
    console.log('   .env 파일에 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 확인 필요');
    process.exit(1);
}

// 테스트 URL
const testUrl = 'https://brand.naver.com/catchwell/products/11705732817';
console.log(`\n📦 테스트 URL: ${testUrl}`);

// crawlFromAffiliateLink 함수 import 및 테스트
try {
    const { crawlFromAffiliateLink } = await import('./dist/crawler/productSpecCrawler.js');

    console.log('\n🚀 크롤링 시작...\n');
    console.log('-'.repeat(70));

    const result = await crawlFromAffiliateLink(testUrl);

    console.log('-'.repeat(70));
    console.log('\n📋 크롤링 결과:');

    if (result) {
        console.log(`\n  ✅ 제품명: "${result.name}"`);
        console.log(`  💰 가격: ${result.price?.toLocaleString() || 0}원`);
        console.log(`  📝 설명 길이: ${result.description?.length || 0}자`);
        console.log(`  🖼️ 메인 이미지: ${result.mainImage ? '있음' : '없음'}`);
        console.log(`  📸 갤러리 이미지: ${result.galleryImages?.length || 0}개`);

        // 검증
        console.log('\n🔍 검증:');

        const hasProductName = result.name && result.name.length > 5;
        const isNotSlogan = !/함께|편리한|일상|그리는/i.test(result.name) || /청소기|PRO|무선/i.test(result.name);
        const isNotFilename = !/\.(jpg|png|gif)$/i.test(result.name);
        const hasDescription = result.description && result.description.length > 20;
        const hasPrice = result.price > 0;
        const hasImage = !!result.mainImage;

        console.log(`  - 제품명 있음: ${hasProductName ? '✅' : '❌'}`);
        console.log(`  - 슬로건 아님: ${isNotSlogan ? '✅' : '❌ 문제!'}`);
        console.log(`  - 파일명 아님: ${isNotFilename ? '✅' : '❌ 문제!'}`);
        console.log(`  - 설명 있음: ${hasDescription ? '✅' : '❌'}`);
        console.log(`  - 가격 있음: ${hasPrice ? '✅' : '⚠️ (0원일 수 있음)'}`);
        console.log(`  - 이미지 있음: ${hasImage ? '✅' : '⚠️'}`);

        if (hasProductName && isNotSlogan && isNotFilename) {
            console.log('\n' + '='.repeat(70));
            console.log('🎉 테스트 성공! 제품 정보가 정확하게 추출되었습니다.');
            console.log('='.repeat(70));

            console.log('\n📄 AI 글 생성에 전달될 데이터:');
            console.log(`  제품명 (키워드): ${result.name}`);
            console.log(`  설명 (rawText): ${result.description?.substring(0, 100)}...`);
        } else {
            console.log('\n' + '='.repeat(70));
            console.log('❌ 테스트 실패! 제품 정보가 정확하지 않습니다.');
            console.log('='.repeat(70));
        }
    } else {
        console.log('\n❌ 결과 없음 (null 반환)');
    }
} catch (error) {
    console.error('\n❌ 테스트 오류:', error.message);
    console.error(error.stack);
}
