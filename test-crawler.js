// 상세 결과 확인
async function test() {
    console.log('🧪 스마트스토어 상세 테스트...');

    const { SmartCrawler } = require('./dist/crawler/smartCrawler.js');
    const crawler = new SmartCrawler();

    const url = 'https://smartstore.naver.com/pkplaza/products/8627632754';

    try {
        const result = await crawler.crawlPerfect(url, 2000, true, 60000);

        console.log('\n========================================');
        console.log('🎉 크롤링 결과');
        console.log('========================================');
        console.log('📌 제목:', result.title);
        console.log('📌 본문 길이:', result.content?.length || 0, '자');
        console.log('📌 본문 미리보기:', result.content?.substring(0, 150) || '없음');
        console.log('📌 이미지 수:', result.images?.length || 0, '개');
        if (result.images && result.images.length > 0) {
            console.log('📌 첫 이미지:', result.images[0]);
        }
        console.log('========================================');

        if (result.title && !result.title.includes('에러') && !result.title.includes('NAVER')) {
            console.log('\n✅ 스마트스토어 크롤링 성공!');
        } else {
            console.log('\n❌ 제목이 비정상');
        }
    } catch (e) {
        console.log('❌ 크롤링 실패:', e.message);
    }
}

test();
