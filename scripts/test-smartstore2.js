const { smartCrawler } = require('../dist/crawler/smartCrawler.js');

async function test() {
  const url = 'https://smartstore.naver.com/miznco/products/4979316503';
  console.log('--- Testing smartCrawler on Smartstore via JS ---');
  console.log('URL:', url);
  
  try {
    const result = await smartCrawler.crawl(url, {
      mode: 'perfect',
      maxLength: 15000,
      extractImages: true,
      timeout: 30000
    });
    
    console.log('\n--- SUCCESS ---');
    console.log('Title:', result.title);
    console.log('Content Length:', result.content ? result.content.length : 0);
    console.log('Images Found:', result.images ? result.images.length : 0);
    console.log('Mode used:', result.mode);
  } catch (error) {
    console.log('\n--- FAILED ---');
    console.error(error);
  }
  
  process.exit(0);
}

test();
