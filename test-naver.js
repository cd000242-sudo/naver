const cheerio = require('cheerio');

async function test() {
    // 모바일 API 방식
    const productNo = '8627632754';
    const mobileApiUrl = `https://m.smartstore.naver.com/pkplaza/products/${productNo}`;

    console.log('📱 스마트스토어 모바일 API 테스트...');
    console.log('URL:', mobileApiUrl);

    const response = await fetch(mobileApiUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html',
            'Accept-Language': 'ko-KR,ko;q=0.9',
        },
    });

    console.log('응답 상태:', response.status);

    if (response.status === 429) {
        console.log('⚠️ 429 Rate Limit');
        return;
    }

    if (response.status === 403) {
        console.log('❌ 403 Access Denied');
        return;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
    const ogImage = $('meta[property="og:image"]').attr('content');
    const desc = $('meta[property="og:description"]').attr('content');

    console.log('');
    console.log('==== 결과 ====');
    console.log('제목:', title || '없음');
    console.log('설명:', desc ? desc.substring(0, 60) + '...' : '없음');
    console.log('이미지:', ogImage ? '있음' : '없음');
    if (ogImage) console.log('이미지 URL:', ogImage);
}

test().catch(e => console.log('에러:', e.message));
