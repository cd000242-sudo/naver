/**
 * 테스트: Gemini Google Search Grounding 웹 리서치
 * 키워드만 넣었을 때 Google 검색 기반으로 소스 수집이 되는지 확인
 */

async function testGeminiGrounding() {
    const testKeywords = [
        '프리다이빙 입문 방법',  // 일반 키워드
    ];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 Gemini Grounding Search 웹 리서치 테스트');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        const { researchWithGeminiGrounding } = await import('./dist/contentGenerator.js');

        for (const keyword of testKeywords) {
            console.log(`\n📝 키워드: "${keyword}"`);
            console.log('─────────────────────────────────────────────');

            const startTime = Date.now();
            const result = await researchWithGeminiGrounding(keyword);
            const elapsed = Date.now() - startTime;

            console.log(`\n📊 결과 (${elapsed}ms):`);
            console.log(`  ✅ 성공: ${result.success}`);
            console.log(`  📌 제목: "${result.title || '없음'}"`);
            console.log(`  📝 본문 길이: ${result.content?.length || 0}자`);
            console.log(`  🔗 출처: ${result.sources?.length || 0}개`);

            if (result.content && result.content.length > 0) {
                console.log(`\n  📄 본문 미리보기 (처음 400자):`);
                console.log(`  "${result.content.substring(0, 400).replace(/\n/g, '\n  ')}..."`);
            }

            if (result.sources && result.sources.length > 0) {
                console.log(`\n  🔗 출처 URL:`);
                result.sources.slice(0, 5).forEach((src, i) => {
                    console.log(`    [${i + 1}] ${src}`);
                });
            }

            // 판정
            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            if (result.success && result.content.length > 500) {
                console.log(`✅ 테스트 통과! ${result.content.length}자 리서치 완료`);
            } else {
                console.log(`❌ 테스트 실패: 리서치 결과 부족`);
            }
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }
    } catch (error) {
        console.error('❌ 테스트 실패:', error.message);
        console.error(error.stack);
    }
}

testGeminiGrounding().then(() => {
    console.log('\n🏁 테스트 완료');
    process.exit(0);
}).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
