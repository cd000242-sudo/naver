// 네이버 쇼핑 상품 API 직접 호출
const cheerio = require('cheerio');

async function test() {
    console.log('🔍 네이버 모바일 상품 API 테스트...');

    // 모바일 상품 페이지 직접 접근
    const productId = '8627632754';
    const url = `https://m.shopping.naver.com/product/${productId}`;

    console.log('URL:', url);

    await new Promise(r => setTimeout(r, 3000)); // 3초 대기

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'ko-KR,ko;q=0.9',
        },
    });

    console.log('응답 상태:', response.status);
    console.log('최종 URL:', response.url);

    if (response.status !== 200) {
        console.log('❌ 응답 실패');
        return;
    }

    const html = await response.text();

    if (html.includes('Access Denied') || html.includes('에러') || html.includes('오류')) {
        console.log('❌ 에러 페이지');
        console.log('HTML 일부:', html.substring(0, 300));
        return;
    }

    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
    const ogImage = $('meta[property="og:image"]').attr('content');

    console.log('');
    console.log('제목:', title || '없음');
    console.log('이미지:', ogImage ? '있음' : '없음');
}

test().catch(e => console.log('에러:', e.message));
