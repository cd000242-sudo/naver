// 빠른 크롤링 테스트
import('./dist/naverBlogCrawler.js').then(async m => {
    console.log('크롤링 시작...');
    const r = await m.crawlNaverBlogWithPuppeteer('https://blog.naver.com/leadernam-/224158226860');
    console.log('\n=== 크롤링 결과 ===');
    console.log('제목:', r.title);
    console.log('본문 길이:', r.content?.length || 0, '자');
    console.log('이미지 수:', r.images?.length || 0, '개');
    console.log('==================');
    process.exit(0);
}).catch(e => {
    console.error('에러:', e.message);
    process.exit(1);
});
