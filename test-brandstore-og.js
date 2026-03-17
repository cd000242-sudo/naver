/**
 * 브랜드스토어 OG 태그 직접 추출 테스트
 * 모바일/데스크톱 URL에서 HTTP GET으로 OG 태그 추출
 */
const https = require('https');
const http = require('http');
const fs = require('fs');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9',
            },
        };

        const req = client.get(url, options, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve({ redirectTo: res.headers.location, statusCode: res.statusCode });
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ html: data, statusCode: res.statusCode, url: res.url || url }));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

async function test() {
    const productId = '12453396043';
    const brandName = 'jupazip';

    const urls = [
        `https://m.brand.naver.com/${brandName}/products/${productId}`,
        `https://brand.naver.com/${brandName}/products/${productId}`,
    ];

    const results = {};

    for (const url of urls) {
        console.log(`\n=== Testing: ${url} ===`);
        try {
            const res = await fetchUrl(url);

            if (res.redirectTo) {
                console.log(`Redirect ${res.statusCode} -> ${res.redirectTo}`);
                results[url] = { redirect: res.redirectTo, statusCode: res.statusCode };
                continue;
            }

            console.log(`Status: ${res.statusCode}, HTML length: ${(res.html || '').length}`);

            const html = res.html || '';

            // OG tags
            const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
                html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1] || '';
            const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
                html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1] || '';
            const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
                html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i)?.[1] || '';

            // Title tag
            const titleTag = html.match(/<title>([^<]+)<\/title>/i)?.[1] || '';

            // JSON-LD
            const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
            let jsonLd = null;
            if (jsonLdMatch) {
                try { jsonLd = JSON.parse(jsonLdMatch[1]); } catch { }
            }

            const result = {
                statusCode: res.statusCode,
                htmlLength: html.length,
                ogTitle,
                ogImage: ogImage.substring(0, 120),
                ogDescription: ogDesc.substring(0, 120),
                titleTag,
                hasJsonLd: !!jsonLd,
                jsonLdName: jsonLd?.name || '',
                jsonLdImage: Array.isArray(jsonLd?.image) ? jsonLd.image.length + ' images' : jsonLd?.image?.substring(0, 80) || '',
                jsonLdPrice: jsonLd?.offers?.price || '',
                // Check for error page
                isErrorPage: html.includes('서비스 접속이 불가') || html.includes('에러페이지') || html.includes('보안 확인'),
            };

            results[url] = result;
            console.log(JSON.stringify(result, null, 2));

        } catch (err) {
            console.log(`Error: ${err.message}`);
            results[url] = { error: err.message };
        }
    }

    fs.writeFileSync('test-og-result.json', JSON.stringify(results, null, 2), 'utf8');
    console.log('\nResults written to test-og-result.json');
}

test();
