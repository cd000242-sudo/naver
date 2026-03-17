// 네이버 상품 내부 API 직접 호출
async function test() {
    console.log('🔍 네이버 상품 내부 API 테스트...');

    // 스마트스토어 상품 ID
    const channelProductNo = '8627632754';
    const mallId = 'pkplaza';

    // 네이버 내부 상품 API (모바일)
    const apiUrl = `https://shopping.naver.com/v1/products/${channelProductNo}`;

    console.log('API URL:', apiUrl);

    try {
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                'Accept': 'application/json',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Referer': 'https://m.shopping.naver.com/',
            },
        });

        console.log('응답 상태:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log('');
            console.log('==== JSON 결과 ====');
            console.log('상품명:', data.name || data.productName || '없음');
            console.log('가격:', data.price || data.salePrice || '없음');
            console.log('이미지:', data.imageUrl ? '있음' : '없음');
        } else {
            console.log('API 실패, HTML 응답 확인...');
            const text = await response.text();
            console.log('응답 일부:', text.substring(0, 200));
        }
    } catch (e) {
        console.log('에러:', e.message);
    }

    // 다른 API 시도: 스마트스토어 채널 상품 API
    console.log('');
    console.log('🔍 스마트스토어 채널 API 시도...');

    const channelApiUrl = `https://smartstore.naver.com/i/v1/stores/${mallId}/products/${channelProductNo}`;
    console.log('API URL:', channelApiUrl);

    try {
        const response = await fetch(channelApiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                'Accept': 'application/json',
            },
        });

        console.log('응답 상태:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log('JSON 결과:', JSON.stringify(data).substring(0, 300));
        } else {
            const text = await response.text();
            console.log('응답:', text.substring(0, 200));
        }
    } catch (e) {
        console.log('에러:', e.message);
    }
}

test();
