/**
 * naver.me 단축 URL → 스마트스토어 최종 URL 해석 + 상품 정보 수집 테스트
 */
const https = require('https');
const http = require('http');

const TEST_URL = 'https://naver.me/5XcLgMkJ';

// 1단계: HTTP 리다이렉트 추적
function followRedirects(url, maxRedirects = 10) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return resolve(url);
        
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let nextUrl = res.headers.location;
                if (nextUrl.startsWith('/')) {
                    const urlObj = new URL(url);
                    nextUrl = urlObj.origin + nextUrl;
                }
                console.log(`  → [${res.statusCode}] 리다이렉트: ${nextUrl.substring(0, 80)}...`);
                resolve(followRedirects(nextUrl, maxRedirects - 1));
            } else {
                console.log(`  → [${res.statusCode}] 최종 URL: ${url.substring(0, 80)}...`);
                resolve(url);
            }
        });
        req.on('error', (err) => {
            console.error(`  → ❌ 요청 실패: ${err.message}`);
            resolve(url);
        });
        req.setTimeout(10000, () => {
            req.destroy();
            resolve(url);
        });
    });
}

// 2단계: 모바일 API로 상품 정보 수집
async function fetchProductFromMobileApi(storeName, productId) {
    const apiUrl = `https://m.smartstore.naver.com/i/v1/products/${productId}`;
    console.log(`\n📡 모바일 API 호출: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': 'application/json',
        }
    });
    
    if (!response.ok) {
        console.log(`  → ❌ API 응답: ${response.status} ${response.statusText}`);
        return null;
    }
    
    const data = await response.json();
    return data;
}

async function main() {
    console.log('='.repeat(60));
    console.log(`🧪 단축 URL 테스트: ${TEST_URL}`);
    console.log('='.repeat(60));
    
    // 1단계: 리다이렉트 추적
    console.log('\n📎 1단계: HTTP 리다이렉트 추적...');
    const finalUrl = await followRedirects(TEST_URL);
    console.log(`\n최종 URL: ${finalUrl}`);
    
    // URL 분석
    const isSmartStore = finalUrl.includes('smartstore.naver.com');
    const isBrandStore = finalUrl.includes('brand.naver.com');
    const isBrandConnect = finalUrl.includes('brandconnect.naver.com');
    
    console.log(`\n📊 URL 분석:`);
    console.log(`  스마트스토어: ${isSmartStore}`);
    console.log(`  브랜드스토어: ${isBrandStore}`);
    console.log(`  브랜드커넥트(SPA): ${isBrandConnect}`);
    
    // 상품 ID 추출
    const productMatch = finalUrl.match(/products\/(\d+)/);
    const storeMatch = finalUrl.match(/(?:smartstore|brand)\.naver\.com\/([^\/\?]+)/);
    
    if (productMatch) {
        console.log(`  상품 ID: ${productMatch[1]}`);
    }
    if (storeMatch) {
        console.log(`  스토어명: ${storeMatch[1]}`);
    }
    
    // brandconnect SPA라면 fetch로는 최종 URL을 못 얻음
    if (isBrandConnect || (!isSmartStore && !isBrandStore)) {
        console.log(`\n⚠️ brandconnect SPA 페이지입니다. fetch만으로는 최종 스마트스토어 URL을 얻을 수 없습니다.`);
        console.log(`  → 앱에서는 Playwright로 JS 리다이렉트를 추적하여 최종 URL을 얻습니다.`);
        
        // brandconnect URL에서 상품 정보 추출 시도
        const bcProductMatch = finalUrl.match(/products\/(\d+)/);
        const bcStoreMatch = finalUrl.match(/\/([^\/\?]+)\/products/);
        
        if (bcProductMatch && bcStoreMatch) {
            console.log(`\n🎯 brandconnect URL에서 추출한 정보:`);
            console.log(`  상품 ID: ${bcProductMatch[1]}`);
            console.log(`  스토어명: ${bcStoreMatch[1]}`);
            
            // 모바일 API로 직접 확인
            try {
                const data = await fetchProductFromMobileApi(bcStoreMatch[1], bcProductMatch[1]);
                if (data) {
                    console.log(`\n✅ 상품 정보 수집 성공!`);
                    console.log(`  상품명: ${data.name || data.productName || '(없음)'}`);
                    console.log(`  가격: ${(data.salePrice || data.price || 0).toLocaleString()}원`);
                    if (data.productImages) {
                        console.log(`  이미지 수: ${data.productImages.length}개`);
                        data.productImages.slice(0, 3).forEach((img, i) => {
                            console.log(`    [${i+1}] ${(img.url || img).substring(0, 60)}...`);
                        });
                    }
                }
            } catch (e) {
                console.log(`  → API 호출 실패: ${e.message}`);
            }
        } else {
            console.log(`  → URL에서 상품 ID를 추출할 수 없습니다. Playwright 필요.`);
            
            // 대안: 원본 fetch 응답에서 힌트 추출
            console.log(`\n🔍 원본 페이지에서 힌트 추출 시도...`);
            try {
                const resp = await fetch(finalUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                const html = await resp.text();
                
                // meta tag, script 내 JSON 등에서 productId 추출 시도
                const metaProductMatch = html.match(/productNo["\s:=]+(\d+)/i) || html.match(/productId["\s:=]+(\d+)/i);
                if (metaProductMatch) {
                    console.log(`  → HTML에서 상품 ID 발견: ${metaProductMatch[1]}`);
                }
                
                // og:url에서 최종 smartstore URL 추출
                const ogUrlMatch = html.match(/og:url["\s]+content="([^"]+)"/i);
                if (ogUrlMatch) {
                    console.log(`  → og:url: ${ogUrlMatch[1]}`);
                }
            } catch (e) {
                console.log(`  → 힌트 추출 실패: ${e.message}`);
            }
        }
    }
    
    // 스마트스토어 URL이면 모바일 API 테스트
    if ((isSmartStore || isBrandStore) && productMatch) {
        try {
            const data = await fetchProductFromMobileApi(
                storeMatch ? storeMatch[1] : '',
                productMatch[1]
            );
            if (data) {
                console.log(`\n✅ 상품 정보 수집 성공!`);
                console.log(`  상품명: ${data.name || data.productName || '(없음)'}`);
                console.log(`  가격: ${(data.salePrice || data.price || 0).toLocaleString()}원`);
            }
        } catch (e) {
            console.log(`\n❌ 모바일 API 실패: ${e.message}`);
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('테스트 완료');
}

main().catch(console.error);
