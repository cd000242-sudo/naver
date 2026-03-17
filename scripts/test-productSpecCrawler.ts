import { crawlProductSpecs } from '../src/crawler/productSpecCrawler.js';

async function test() {
  const url = 'https://link.coupang.com/a/d3lVwh';
  console.log('--- Testing productSpecCrawler on', url);
  const result = await crawlProductSpecs(url);
  console.log('Result:', result?.productName);
  process.exit(0);
}

test();
