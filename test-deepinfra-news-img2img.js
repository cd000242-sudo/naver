/**
 * 네이버 연예 뉴스에서 이미지 수집 후 DeepInfra로 이미지 생성
 * (jsdom 없이 정규식으로 파싱)
 */

const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

const NEWS_URL = 'https://m.entertain.naver.com/home/article/477/0000591298';
const API_KEY = 'YYbFgUGCfUZlqs0yCGTPF6KRY88PUCKH';

// 출력 디렉토리
const outputDir = path.join(process.env.TEMP || '.', 'deepinfra_img2img_test_' + Date.now());
fs.mkdirSync(outputDir, { recursive: true });

console.log('🚀 DeepInfra img2img 테스트 시작');
console.log('📰 뉴스 URL:', NEWS_URL);
console.log('📁 저장 위치:', outputDir);
console.log('');

// 1. 뉴스에서 이미지 URL 수집 (정규식 사용)
async function crawlNewsImages(url) {
    console.log('📥 뉴스 페이지 크롤링 중...');

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 30000
        });

        const html = response.data;

        // 기사 제목 추출
        const titleMatch = html.match(/<h2[^>]*class="[^"]*end_tit[^"]*"[^>]*>([^<]+)<\/h2>/i) ||
            html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) ||
            html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '제목 없음';
        console.log('📌 기사 제목:', title);

        // 이미지 URL 수집 (정규식)
        const images = [];

        // og:image
        const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
        if (ogMatch && ogMatch[1]) {
            images.push(ogMatch[1]);
        }

        // imgnews.naver.net 이미지들
        const imgMatches = html.matchAll(/https?:\/\/imgnews\.pstatic\.net\/[^"'\s<>]+/gi);
        for (const match of imgMatches) {
            const imgUrl = match[0].replace(/&amp;/g, '&');
            if (!images.includes(imgUrl) && !imgUrl.includes('logo')) {
                images.push(imgUrl);
            }
        }

        // 추가로 mimgnews 이미지
        const mimgMatches = html.matchAll(/https?:\/\/mimgnews\.pstatic\.net\/[^"'\s<>]+/gi);
        for (const match of mimgMatches) {
            const imgUrl = match[0].replace(/&amp;/g, '&');
            if (!images.includes(imgUrl)) {
                images.push(imgUrl);
            }
        }

        console.log(`✅ ${images.length}개 이미지 발견`);
        images.slice(0, 5).forEach((img, i) => console.log(`   [${i + 1}] ${img.substring(0, 80)}...`));

        return { title, images };
    } catch (error) {
        console.error('❌ 크롤링 실패:', error.message);
        return { title: '', images: [] };
    }
}

// 2. 이미지 다운로드
async function downloadImage(url, filename) {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://m.entertain.naver.com/'
            }
        });

        const savePath = path.join(outputDir, filename);
        fs.writeFileSync(savePath, response.data);
        console.log(`   💾 저장: ${filename} (${(response.data.length / 1024).toFixed(1)}KB)`);
        return savePath;
    } catch (e) {
        console.error(`   ❌ 다운로드 실패: ${e.message}`);
        return null;
    }
}

// 3. DeepInfra API (text-to-image) 호출
async function generateWithDeepInfra(prompt, outputName) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            prompt: prompt,
            model: 'black-forest-labs/FLUX-2-dev',
            size: '1024x1024',
            n: 1
        });

        console.log(`\n🎨 [${outputName}] 생성 중...`);
        console.log(`   📝 프롬프트: ${prompt.substring(0, 80)}...`);

        const startTime = Date.now();

        const options = {
            hostname: 'api.deepinfra.com',
            path: '/v1/openai/images/generations',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        if (json.data && json.data[0]) {
                            const savePath = path.join(outputDir, `generated_${outputName}.png`);
                            if (json.data[0].b64_json) {
                                const buffer = Buffer.from(json.data[0].b64_json, 'base64');
                                fs.writeFileSync(savePath, buffer);
                            } else if (json.data[0].url) {
                                console.log(`   🔗 URL: ${json.data[0].url.substring(0, 60)}`);
                            }
                            console.log(`   ✅ 성공! (${elapsed}초) → generated_${outputName}.png`);
                            resolve({ success: true, path: savePath, time: elapsed });
                        }
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    console.log(`   ❌ 실패 (${elapsed}초): Status ${res.statusCode}`);
                    resolve({ success: false });
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.setTimeout(180000, () => {
            req.destroy();
            reject(new Error('타임아웃'));
        });

        req.write(body);
        req.end();
    });
}

// 메인 실행
async function main() {
    console.log('='.repeat(60));
    console.log('🔍 1단계: 뉴스에서 이미지 수집');
    console.log('='.repeat(60));

    const { title, images } = await crawlNewsImages(NEWS_URL);

    // 이미지 다운로드 (최대 3개)
    if (images.length > 0) {
        console.log('\n📥 참조 이미지 다운로드 중...');
        for (let i = 0; i < Math.min(3, images.length); i++) {
            await downloadImage(images[i], `source_${i + 1}.jpg`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎨 2단계: DeepInfra로 이미지 생성 (총 6개)');
    console.log('='.repeat(60));

    // 기사 제목에서 키워드 추출
    const keyword = title.includes('ENHYPEN') ? 'ENHYPEN' :
        title.includes('BTS') ? 'BTS' :
            'Korean idol';

    // 프롬프트 목록 (다양한 카메라 앵글)
    const prompts = [
        { name: '01_thumbnail', prompt: `RAW photo, hyperrealistic, 8k uhd, professional ${keyword} photoshoot, elegant composition, cinematic lighting, magazine cover style, handsome Korean male idol, NO TEXT NO WRITING` },
        { name: '02_bird_eye', prompt: `RAW photo, hyperrealistic, 8k uhd, bird-eye view overhead shot, ${keyword} performance scene, dynamic action, stage lighting, NOT front-facing portrait, professional photography, NO TEXT` },
        { name: '03_low_angle', prompt: `RAW photo, hyperrealistic, 8k uhd, low angle shot looking up dramatic perspective, ${keyword} on stage, powerful presence, concert lighting, NOT front-facing portrait, NO TEXT` },
        { name: '04_silhouette', prompt: `RAW photo, hyperrealistic, 8k uhd, silhouette backlit atmospheric, ${keyword} artistic portrait, moody lighting, stage smoke, NOT front-facing portrait, professional photography, NO TEXT` },
        { name: '05_wide_shot', prompt: `RAW photo, hyperrealistic, 8k uhd, wide shot full scene visible environmental, ${keyword} concert venue, crowd atmosphere, stage design, NOT front-facing portrait, NO TEXT` },
        { name: '06_profile', prompt: `RAW photo, hyperrealistic, 8k uhd, profile view side angle elegant composition, ${keyword} fashion shot, stylish outfit, editorial style, NOT front-facing portrait, professional photography, NO TEXT` }
    ];

    const results = [];

    for (const p of prompts) {
        try {
            const result = await generateWithDeepInfra(p.prompt, p.name);
            results.push({ ...p, ...result });
            // API 요청 간 간격
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.log(`   ❌ ${p.name} 실패:`, e.message);
            results.push({ ...p, success: false, error: e.message });
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 결과 요약');
    console.log('='.repeat(60));

    const successes = results.filter(r => r.success);
    console.log(`✅ 성공: ${successes.length}/${results.length}`);
    console.log(`📁 이미지 폴더: ${outputDir}`);
    console.log('\n💡 이미지 종류:');
    console.log('   - source_*.jpg: 뉴스에서 수집한 참조 이미지');
    console.log('   - generated_*.png: DeepInfra로 생성한 이미지');

    // 폴더 열기
    require('child_process').exec(`explorer "${outputDir}"`);
}

main().catch(console.error);
