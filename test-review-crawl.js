/**
 * crawlBrandStoreProduct 리뷰 이미지 포함 테스트
 */
const { crawlBrandStoreProduct } = require('./dist/crawler/productSpecCrawler.js');
const fs = require('fs');

async function test() {
    const productId = '12453396043';
    const brandName = 'jupazip';
    const originalUrl = 'https://brand.naver.com/jupazip/products/12453396043';

    console.log('=== 리뷰 이미지 포함 전용세션 테스트 ===');

    try {
        const result = await crawlBrandStoreProduct(productId, brandName, originalUrl);

        if (result) {
            const output = {
                name: result.name || 'EMPTY',
                price: result.price || 0,
                mainImage: result.mainImage || 'EMPTY',
                totalImages: (result.galleryImages || []).length,
                galleryImages: (result.galleryImages || []).map((img, i) => `[${i + 1}] ${img}`),
            };

            fs.writeFileSync('test-review-result.json', JSON.stringify(output, null, 2), 'utf8');
            console.log(`NAME: ${output.name}`);
            console.log(`TOTAL_IMAGES: ${output.totalImages}`);
            output.galleryImages.forEach(i => console.log(i));
        } else {
            console.log('Result: NULL');
        }
    } catch (err) {
        console.log('Error:', err.message);
    }

    process.exit(0);
}

test();
