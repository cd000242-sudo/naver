/**
 * 사용자 제공 브랜드스토어 2개 테스트
 * 1. airmade - 10843229255
 * 2. thehaam - 11586209415
 */
const crawler = require('./dist/crawler/productSpecCrawler.js').default;
const fs = require('fs');

const tests = [
    { brand: 'airmade', id: '10843229255', url: 'https://brand.naver.com/airmade/products/10843229255' },
    { brand: 'thehaam', id: '11586209415', url: 'https://brand.naver.com/thehaam/products/11586209415' },
];

async function main() {
    const allResults = [];

    for (const t of tests) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`테스트: ${t.brand} (${t.id})`);
        console.log(`URL: ${t.url}`);
        console.log('='.repeat(60));

        try {
            const result = await crawler.crawlBrandStoreProduct(t.id, t.brand, t.url);
            if (!result) {
                console.log('❌ NULL');
                allResults.push({ brand: t.brand, error: 'NULL' });
                continue;
            }

            const images = result.galleryImages || [];
            const analysis = images.map((img, i) => {
                const cdn = img.includes('checkout.phinf') ? 'REVIEW' :
                    img.includes('image.nmv') ? 'VIDEO' :
                        img.includes('searchad-phinf') ? '⚠️SEARCHAD' :
                            (img.includes('shopping-phinf') && img.includes('/main_')) ? '⚠️CATALOG' :
                                img.includes('shop-phinf') ? 'SHOP' : 'OTHER';
                const has404Risk = (img.includes('checkout.phinf') || img.includes('image.nmv')) && img.includes('?type=');
                return `[${i + 1}] ${cdn} ${has404Risk ? '❌404' : '✅'} ${img.split('/').pop().substring(0, 50)}`;
            });

            console.log(`✅ ${result.name}`);
            console.log(`   이미지: ${images.length}개`);
            analysis.forEach(a => console.log(`   ${a}`));

            const warns = analysis.filter(a => a.includes('⚠️') || a.includes('❌404'));
            console.log(warns.length === 0 ? '   ✅ 모든 이미지 깨끗' : `   ⚠️ 경고 ${warns.length}개`);

            allResults.push({
                brand: t.brand,
                name: result.name,
                totalImages: images.length,
                warnings: warns.length,
                images: images.map((img, i) => `[${i + 1}] ${img}`)
            });
        } catch (err) {
            console.log(`❌ Error: ${err.message}`);
            allResults.push({ brand: t.brand, error: err.message });
        }
    }

    fs.writeFileSync('test-cross-store-result.json', JSON.stringify(allResults, null, 2), 'utf8');

    console.log('\n\n======= 최종 요약 =======');
    for (const r of allResults) {
        if (r.error) {
            console.log(`❌ ${r.brand}: ${r.error}`);
        } else {
            console.log(`${r.warnings === 0 ? '✅' : '⚠️'} ${r.brand}: ${r.totalImages}개 (경고: ${r.warnings})`);
        }
    }

    // 전체 갤러리 HTML 생성
    let cards = '';
    for (const r of allResults) {
        if (r.error) continue;
        (r.images || []).forEach((imgStr, i) => {
            const url = imgStr.replace(/^\[\d+\] /, '');
            const cdn = url.includes('checkout.phinf') ? 'REVIEW' :
                url.includes('image.nmv') ? 'VIDEO' : 'PRODUCT';
            cards += `<div class="card" id="card-${r.brand}-${i}">
                <img src="${url}" onload="this.parentElement.classList.add('ok')" onerror="this.parentElement.classList.add('fail')">
                <p><b>${r.brand}</b> [${i + 1}] ${cdn}<br>${url.split('/').pop().substring(0, 30)}</p>
            </div>\n`;
        });
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Cross-Store Gallery</title>
<style>
body{background:#111;color:#fff;font-family:sans-serif;padding:20px}
h1{text-align:center}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.card{background:#222;border-radius:8px;overflow:hidden;padding:5px}
.card img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px}
.card p{text-align:center;font-size:10px;margin:4px 0;color:#aaa;word-break:break-all}
.ok{border:2px solid #0f0}
.fail{border:2px solid #f00}
</style></head>
<body>
<h1>Cross-Store Image Gallery</h1>
<p style="text-align:center;color:#888">Green = OK, Red = FAILED (404)</p>
<div class="grid">${cards}</div>
</body></html>`;
    fs.writeFileSync('test-review-gallery.html', html);
    console.log('갤러리 HTML 생성 완료');

    process.exit(0);
}

main();
