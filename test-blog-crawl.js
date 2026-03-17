/**
 * 테스트: 네이버 블로그 URL 크롤링 검증
 * blog.naver.com URL을 넣었을 때 원본 글의 콘텐츠가 정확히 추출되는지 확인
 */

const TEST_URL = 'https://blog.naver.com/hi_nice2meetu/224135476796';

async function testBlogCrawl() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 네이버 블로그 URL 크롤링 테스트');
    console.log(`📌 URL: ${TEST_URL}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        // fetchArticleContent 테스트 (블로그 전용 크롤러 직접 호출)
        console.log('\n📝 [테스트 1] fetchArticleContent 직접 호출');
        console.log('─────────────────────────────────────────────');

        const { fetchArticleContent } = await import('./dist/sourceAssembler.js');
        const result = await fetchArticleContent(TEST_URL);

        console.log('\n📊 결과:');
        console.log(`  📌 제목: "${result.title || '없음'}"`);
        console.log(`  📝 본문 길이: ${result.content?.length || 0}자`);
        console.log(`  🖼️ 이미지: ${result.images?.length || 0}개`);
        console.log(`  📅 발행일: ${result.publishedAt || '없음'}`);

        if (result.content && result.content.length > 0) {
            console.log(`\n  📄 본문 미리보기 (처음 300자):`);
            console.log(`  "${result.content.substring(0, 300).replace(/\n/g, ' ')}..."`);
        }

        if (result.images && result.images.length > 0) {
            console.log(`\n  🖼️ 추출된 이미지 (최대 5개):`);
            result.images.slice(0, 5).forEach((img, i) => {
                console.log(`    [${i + 1}] ${img.substring(0, 80)}...`);
            });
        }

        // 결과 판정
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        if (result.title && result.content && result.content.length > 100) {
            console.log('✅ 테스트 통과! 블로그 크롤링 성공');

            // 원본 글과의 일치 확인 (키워드 기반 — 스크린샷에서 "도시락만 7년째" 키워드 확인)
            const keywords = ['도시락', '날라리엄마', '엄마'];
            const found = keywords.filter(k =>
                (result.title || '').includes(k) || (result.content || '').includes(k)
            );

            if (found.length > 0) {
                console.log(`✅ 원본 글 키워드 매칭: [${found.join(', ')}] → 올바른 글이 크롤링됨!`);
            } else {
                console.log(`⚠️ 원본 글 키워드 미매칭 (해당 글이 삭제되었거나 다른 글일 수 있음)`);
                console.log(`   실제 제목: "${result.title}"`);
            }
        } else {
            console.log('❌ 테스트 실패: 본문 추출 불충분');
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
        console.error('❌ 테스트 실패:', error.message);
        console.error(error.stack);
    }
}

testBlogCrawl().then(() => {
    console.log('\n🏁 테스트 완료');
    process.exit(0);
}).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
