import { smartCrawler } from '../src/crawler/smartCrawler.js';

async function testCrawlers() {
  console.log('\n--- 쿠팡 단축 URL 크롤링 테스트 ---');
  try {
    const coupangUrl = 'https://link.coupang.com/a/d3lVwh';
    const coupangResult = await smartCrawler.crawl(coupangUrl, { maxLength: 5000, extractImages: true });
    console.log('쿠팡 결과:', coupangResult.title);
    console.log('본문 일부:', coupangResult.content.substring(0, 100));
    console.log('이미지 갯수:', coupangResult.images?.length);
  } catch (error) {
    console.error('쿠팡 오류:', error);
    require('fs').writeFileSync('error.json', JSON.stringify({
      message: (error as Error).message,
      stack: (error as Error).stack
    }, null, 2));
    process.exit(1);
  }

  process.exit(0);
}

testCrawlers();
