/**
 * 브랜드스토어 크롤링 정확도 테스트 v2 - JSON 출력
 */
const { fetchShoppingImages } = require('./dist/sourceAssembler.js');
const fs = require('fs');

async function test() {
    const url = 'https://brand.naver.com/jupazip/products/12453396043';

    try {
        const result = await fetchShoppingImages(url, { imagesOnly: false });

        const output = {
            url,
            expectedProduct: '멀티탭 어댑터 (주파집)',
            crawledTitle: result.title || 'EMPTY',
            crawledPrice: result.price || 'EMPTY',
            imageCount: (result.images || []).length,
            images: (result.images || []).map((img, i) => `[${i + 1}] ${img.substring(0, 120)}`),
            descriptionPreview: (result.description || '').substring(0, 200),
            specPreview: (result.spec || '').substring(0, 200),
            // 정확도 판별
            titleContainsMultitap: /멀티탭|어댑터|콘센트|전원|power/i.test(result.title || ''),
            titleContainsCarMount: /거치대|차량/i.test(result.title || ''),
        };

        fs.writeFileSync('test-crawl-result.json', JSON.stringify(output, null, 2), 'utf8');
        console.log('Result written to test-crawl-result.json');
    } catch (err) {
        fs.writeFileSync('test-crawl-result.json', JSON.stringify({ error: err.message, stack: err.stack }, null, 2), 'utf8');
        console.log('Error written to test-crawl-result.json');
    }

    process.exit(0);
}

test();
