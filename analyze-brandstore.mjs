/**
 * 브랜드스토어 HTML 분석 스크립트
 */

const testUrl = 'https://brand.naver.com/pulmuone_cooking/products/11131467341';

console.log('═══════════════════════════════════════════════════════');
console.log('🔍 브랜드스토어 HTML 분석');
console.log('═══════════════════════════════════════════════════════\n');

try {
    const response = await fetch(testUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        },
    });

    const html = await response.text();

    console.log(`📄 HTML 길이: ${html.length} bytes\n`);

    // OG 이미지 찾기
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    console.log('📷 OG Image:', ogImageMatch?.[1] || 'N/A');

    // OG 제목 찾기
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    console.log('🏷️ OG Title:', ogTitleMatch?.[1] || 'N/A');

    // 모든 이미지 src 추출
    console.log('\n📸 발견된 이미지 URL들:');
    const imgSrcMatches = html.matchAll(/<img[^>]+src="(https:\/\/[^"]+)"/gi);
    let imgCount = 0;
    for (const match of imgSrcMatches) {
        const url = match[1];
        if (url.includes('shop') || url.includes('product') || url.includes('goods')) {
            imgCount++;
            if (imgCount <= 10) {
                console.log(`  ${imgCount}. ${url.substring(0, 100)}...`);
            }
        }
    }
    console.log(`\n총 상품 관련 이미지: ${imgCount}개`);

    // 클래스명 분석
    console.log('\n🔍 주요 클래스명 분석:');
    const classMatches = html.matchAll(/class="([^"]+)"/g);
    const classSet = new Set();
    for (const match of classMatches) {
        const classes = match[1].split(/\s+/);
        for (const cls of classes) {
            if (cls.includes('image') || cls.includes('Image') || cls.includes('product') || cls.includes('Product') || cls.includes('thumb') || cls.includes('Thumb')) {
                classSet.add(cls);
            }
        }
    }
    console.log([...classSet].slice(0, 20).join('\n  '));

    // __PRELOADED_STATE__ 찾기 (JSON 데이터)
    const stateMatch = html.match(/__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (stateMatch) {
        console.log('\n✅ __PRELOADED_STATE__ 발견! JSON 데이터에서 이미지 추출 가능');
    } else {
        console.log('\n❌ __PRELOADED_STATE__ 없음');
    }

    // window.__INITIAL_STATE__ 찾기
    const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (initialStateMatch) {
        console.log('✅ window.__INITIAL_STATE__ 발견!');
    }

    // productImages 찾기
    const productImagesMatch = html.match(/"productImages"\s*:\s*\[([^\]]+)\]/);
    if (productImagesMatch) {
        console.log('\n📷 productImages 배열 발견:');
        console.log(productImagesMatch[0].substring(0, 500));
    }

    // representImage 찾기
    const representImageMatch = html.match(/"representImage"\s*:\s*\{[^}]+\}/);
    if (representImageMatch) {
        console.log('\n📷 representImage 발견:');
        console.log(representImageMatch[0]);
    }

} catch (error) {
    console.error('❌ 분석 실패:', error.message);
}

console.log('\n═══════════════════════════════════════════════════════');
