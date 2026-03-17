/**
 * crawlBrandStoreProduct 직접 테스트
 * 전용세션(Playwright + headless: false + 세션 유지)으로 크롤링
 */
const { crawlBrandStoreProduct } = require('./dist/crawler/productSpecCrawler.js');
const fs = require('fs');

async function test() {
    const productId = '12453396043';
    const brandName = 'jupazip';
    const originalUrl = 'https://brand.naver.com/jupazip/products/12453396043';

    console.log('=== crawlBrandStoreProduct 직접 테스트 ===');
    console.log(`브랜드: ${brandName}, 상품ID: ${productId}`);

    try {
        const result = await crawlBrandStoreProduct(productId, brandName, originalUrl);

        if (result) {
            const output = {
                name: result.name || 'EMPTY',
                price: result.price || 0,
                mainImage: result.mainImage || 'EMPTY',
                galleryImageCount: (result.galleryImages || []).length,
                galleryImages: (result.galleryImages || []).map((img, i) => `[${i + 1}] ${img.substring(0, 120)}`),
                detailImageCount: (result.detailImages || []).length,
                descriptionPreview: (result.description || '').substring(0, 200),
                containsMultitap: /멀티탭|어댑터|콘센트|전원/i.test(result.name || ''),
                containsCarMount: /거치대|차량/i.test(result.name || ''),
            };

            fs.writeFileSync('test-dedicated-result.json', JSON.stringify(output, null, 2), 'utf8');
            console.log('Result written to test-dedicated-result.json');
            console.log(`NAME: ${output.name}`);
            console.log(`IMAGES: ${output.galleryImageCount}`);
        } else {
            fs.writeFileSync('test-dedicated-result.json', JSON.stringify({ result: 'NULL - 크롤링 실패' }, null, 2), 'utf8');
            console.log('Result: NULL');
        }
    } catch (err) {
        fs.writeFileSync('test-dedicated-result.json', JSON.stringify({ error: err.message, stack: err.stack }, null, 2), 'utf8');
        console.log('Error:', err.message);
    }

    process.exit(0);
}

test();
