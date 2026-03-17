import { smartCrawler } from '../crawler/smartCrawler.js';

async function testCoupang() {
    console.log('Testing Coupang Stealth Crawling inside src/tests...');
    const url = 'https://link.coupang.com/a/d3lVwh'; // or any product
    const start = Date.now();
    try {
        const result = await smartCrawler.crawl(url) as any;
        if (result && typeof result === 'string' && result.length > 500) {
            console.log('SUCCESS! Extracted HTML length:', result.length);
            console.log('Preview:');
            console.log(result.substring(0, 500));
        } else {
            console.log('FAILED or partial extraction. Result:', result ? (result.length ? result.length : result) : 'null');
            console.log('Content preview:');
            console.log(typeof result === 'string' ? result.substring(0, 200) : result);
        }
    } catch (error) {
        console.error('Error during test:', error);
    }
    console.log(`Execution time: ${((Date.now() - start) / 1000).toFixed(2)} seconds`);
    process.exit(0);
}

testCoupang();
