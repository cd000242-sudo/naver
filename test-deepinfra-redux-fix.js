/**
 * DeepInfra Redux 올바른 테스트 - 뉴스에서 이미지 수집 후 Redux 호출
 */

const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

const NEWS_URL = 'https://m.entertain.naver.com/home/article/477/0000591298';
const API_KEY = 'YYbFgUGCfUZlqs0yCGTPF6KRY88PUCKH';

const outputDir = path.join(process.env.TEMP || '.', 'deepinfra_redux_fix_' + Date.now());
fs.mkdirSync(outputDir, { recursive: true });

console.log('🔍 DeepInfra Redux API 테스트 (올바른 이미지 처리)');
console.log('📁 저장 위치:', outputDir);

// 1. 뉴스에서 이미지 수집
async function getNewsImage() {
    console.log('\n📰 뉴스에서 이미지 수집 중...');

    const response = await axios.get(NEWS_URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html'
        },
        timeout: 30000
    });

    const html = response.data;

    // og:image 추출
    const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    if (ogMatch && ogMatch[1]) {
        console.log('   ✅ og:image 발견:', ogMatch[1].substring(0, 80));
        return ogMatch[1];
    }

    // imgnews 이미지
    const imgMatch = html.match(/https?:\/\/imgnews\.pstatic\.net\/[^"'\s<>]+/i);
    if (imgMatch) {
        console.log('   ✅ imgnews 발견:', imgMatch[0].substring(0, 80));
        return imgMatch[0].replace(/&amp;/g, '&');
    }

    throw new Error('이미지 없음');
}

// 2. 이미지 다운로드 및 Base64 변환
async function downloadImage(url) {
    console.log('\n📥 이미지 다운로드 중...');

    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://m.entertain.naver.com/'
        },
        timeout: 30000
    });

    fs.writeFileSync(path.join(outputDir, 'source.jpg'), response.data);
    console.log(`   ✅ 저장 완료 (${(response.data.length / 1024).toFixed(1)}KB)`);

    return response.data.toString('base64');
}

// 3. Redux API 호출
async function callReduxAPI(imageBase64, prompt, name) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            image: imageBase64,
            prompt: prompt,
            num_inference_steps: 28,
            guidance_scale: 2.0  // 매우 낮게 → 원본 100% 가깝게 유지
        });

        console.log(`\n🎨 [${name}] Redux 생성 중...`);
        const startTime = Date.now();

        const options = {
            hostname: 'api.deepinfra.com',
            path: '/v1/inference/black-forest-labs/FLUX-1-Redux-dev',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                if (res.statusCode !== 200) {
                    console.log(`   ❌ Status ${res.statusCode}: ${data.substring(0, 200)}`);
                    resolve({ success: false });
                    return;
                }

                try {
                    const json = JSON.parse(data);
                    console.log(`   📦 응답 키: ${Object.keys(json).join(', ')}`);

                    // 이미지 데이터 추출
                    let imageData = json.images?.[0] || json.image || json.output;

                    if (!imageData) {
                        console.log(`   ⚠️ 이미지 없음`);
                        console.log(`   응답: ${JSON.stringify(json).substring(0, 300)}`);
                        resolve({ success: false });
                        return;
                    }

                    // Base64 디코딩
                    const buffer = Buffer.from(imageData, 'base64');
                    const header = buffer.slice(0, 4).toString('hex');

                    console.log(`   🔍 이미지 헤더: ${header} (${buffer.length} bytes)`);

                    let ext = 'bin';
                    if (header.startsWith('89504e47')) ext = 'png';
                    else if (header.startsWith('ffd8ff')) ext = 'jpg';
                    else if (header.startsWith('52494646')) ext = 'webp';

                    const savePath = path.join(outputDir, `${name}.${ext}`);
                    fs.writeFileSync(savePath, buffer);
                    console.log(`   ✅ 저장! (${elapsed}초) → ${name}.${ext}`);

                    resolve({ success: true, path: savePath, time: elapsed });
                } catch (e) {
                    console.log(`   ❌ 파싱 실패: ${e.message}`);
                    reject(e);
                }
            });
        });

        req.on('error', e => reject(e));
        req.setTimeout(180000, () => { req.destroy(); reject(new Error('타임아웃')); });
        req.write(body);
        req.end();
    });
}

// 메인
async function main() {
    try {
        // 1. 이미지 수집
        const imageUrl = await getNewsImage();
        const imageBase64 = await downloadImage(imageUrl);

        console.log('\n' + '='.repeat(50));
        console.log('🎨 Redux로 이미지 생성 (원본 인물 100% 유지 시도)');
        console.log('='.repeat(50));

        // 2. Redux 생성 (6개)
        const prompts = [
            { name: 'redux_01_thumb', prompt: 'same exact person, same face, professional magazine photo, elegant studio lighting' },
            { name: 'redux_02_stage', prompt: 'same exact person, same face, on stage performance, concert lighting, dramatic' },
            { name: 'redux_03_artistic', prompt: 'same exact person, same face, artistic portrait, moody lighting' },
            { name: 'redux_04_fashion', prompt: 'same exact person, same face, high fashion editorial, stylish' },
            { name: 'redux_05_casual', prompt: 'same exact person, same face, casual lifestyle photo, warm lighting' },
            { name: 'redux_06_dramatic', prompt: 'same exact person, same face, cinematic shot, dramatic lighting' }
        ];

        let successCount = 0;
        for (const p of prompts) {
            try {
                const result = await callReduxAPI(imageBase64, p.prompt, p.name);
                if (result.success) successCount++;
                await new Promise(r => setTimeout(r, 2000));
            } catch (e) {
                console.log(`   ❌ ${p.name} 실패: ${e.message}`);
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log(`📊 결과: ${successCount}/6 성공`);
        console.log(`📁 폴더: ${outputDir}`);
        console.log('='.repeat(50));

        require('child_process').exec(`explorer "${outputDir}"`);
    } catch (e) {
        console.error('오류:', e.message);
    }
}

main();
