const { crawlProductSpecs } = require('../dist/crawler/productSpecCrawler.js');
const fs = require('fs');

async function testOldCoupang() {
    console.log('Testing old ProductSpecCrawler on Coupang...');
    const url = 'https://link.coupang.com/a/d3lVwh'; 
    const start = Date.now();
    try {
        const result = await crawlProductSpecs(url);
        if (result) {
            console.log('SUCCESS!');
            console.log('Title:', result.title);
            console.log('Price:', result.price);
        } else {
            console.log('FAILED (returned null)');
        }
    } catch (error) {
        console.error('Error during test:', error);
    }
    console.log(`Execution time: ${((Date.now() - start) / 1000).toFixed(2)} seconds`);
    process.exit(0);
}

testOldCoupang();
