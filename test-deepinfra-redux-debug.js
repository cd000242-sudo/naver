/**
 * DeepInfra Redux 디버깅 - API 응답 형식 확인
 */

const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'YYbFgUGCfUZlqs0yCGTPF6KRY88PUCKH';

// 테스트 이미지 (작은 빨간 사각형)
const testImageUrl = 'https://imgnews.pstatic.net/image/477/2026/01/30/0000591298_001_20260130102701191.jpg';

const outputDir = path.join(process.env.TEMP || '.', 'deepinfra_debug_' + Date.now());
fs.mkdirSync(outputDir, { recursive: true });

console.log('🔍 DeepInfra Redux API 디버깅');
console.log('📁 저장 위치:', outputDir);

async function testReduxAPI() {
    // 1. 참조 이미지 다운로드
    console.log('\n📥 참조 이미지 다운로드 중...');
    const imgResponse = await axios.get(testImageUrl, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.entertain.naver.com/' }
    });

    const sourceBase64 = imgResponse.data.toString('base64');
    fs.writeFileSync(path.join(outputDir, 'source.jpg'), imgResponse.data);
    console.log(`   ✅ 다운로드 완료 (${(imgResponse.data.length / 1024).toFixed(1)}KB)`);
    console.log(`   📊 Base64 길이: ${sourceBase64.length}`);

    // 2. Redux API 호출
    console.log('\n🎨 Redux API 호출...');

    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            image: sourceBase64,
            prompt: 'same person, professional photo, elegant lighting',
            num_inference_steps: 28,
            guidance_scale: 2.0  // 더 낮춰서 원본 유지 ↑
        });

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
                console.log(`   ⏱️ 응답 시간: ${elapsed}초`);
                console.log(`   📊 상태 코드: ${res.statusCode}`);
                console.log(`   📦 응답 길이: ${data.length}`);

                // 응답 저장 (디버깅용)
                fs.writeFileSync(path.join(outputDir, 'response_raw.txt'), data);

                try {
                    const json = JSON.parse(data);
                    console.log(`   🔑 응답 키: ${Object.keys(json).join(', ')}`);

                    // 다양한 응답 형식 확인
                    let imageData = null;
                    let imageFormat = 'unknown';

                    if (json.images && json.images[0]) {
                        imageData = json.images[0];
                        imageFormat = 'images[0]';
                    } else if (json.image) {
                        imageData = json.image;
                        imageFormat = 'image';
                    } else if (json.output) {
                        imageData = json.output;
                        imageFormat = 'output';
                    } else if (json.data && json.data[0]) {
                        imageData = json.data[0].b64_json || json.data[0];
                        imageFormat = 'data[0]';
                    }

                    console.log(`   📄 이미지 형식: ${imageFormat}`);

                    if (imageData) {
                        console.log(`   📊 이미지 데이터 길이: ${imageData.length}`);
                        console.log(`   📋 첫 50자: ${imageData.substring(0, 50)}...`);

                        // Base64 디코딩 시도
                        try {
                            // data:image/... 형식인지 확인
                            if (imageData.startsWith('data:image')) {
                                const base64Part = imageData.split(',')[1];
                                const buffer = Buffer.from(base64Part, 'base64');
                                fs.writeFileSync(path.join(outputDir, 'result.png'), buffer);
                                console.log(`   ✅ data URL에서 이미지 저장 (${buffer.length} bytes)`);
                            } else {
                                // 순수 base64
                                const buffer = Buffer.from(imageData, 'base64');
                                const header = buffer.slice(0, 4).toString('hex');
                                console.log(`   📋 디코딩된 헤더: ${header}`);

                                // PNG: 89504e47, JPEG: ffd8ffe0, WEBP: 52494646
                                if (header.startsWith('89504e47')) {
                                    fs.writeFileSync(path.join(outputDir, 'result.png'), buffer);
                                    console.log('   ✅ PNG 이미지 저장');
                                } else if (header.startsWith('ffd8ff')) {
                                    fs.writeFileSync(path.join(outputDir, 'result.jpg'), buffer);
                                    console.log('   ✅ JPEG 이미지 저장');
                                } else if (header.startsWith('52494646')) {
                                    fs.writeFileSync(path.join(outputDir, 'result.webp'), buffer);
                                    console.log('   ✅ WEBP 이미지 저장');
                                } else {
                                    fs.writeFileSync(path.join(outputDir, 'result.bin'), buffer);
                                    console.log(`   ⚠️ 알 수 없는 형식, .bin으로 저장 (헤더: ${header})`);
                                }
                            }
                        } catch (e) {
                            console.log(`   ❌ 디코딩 실패: ${e.message}`);
                        }
                    } else {
                        console.log('   ⚠️ 이미지 데이터 없음');
                        console.log(`   전체 응답: ${data.substring(0, 500)}`);
                    }

                    resolve(json);
                } catch (e) {
                    console.log(`   ❌ JSON 파싱 실패: ${e.message}`);
                    console.log(`   응답 일부: ${data.substring(0, 200)}`);
                    reject(e);
                }
            });
        });

        req.on('error', e => {
            console.error('   ❌ 요청 오류:', e.message);
            reject(e);
        });

        req.setTimeout(180000, () => {
            req.destroy();
            reject(new Error('타임아웃'));
        });

        req.write(body);
        req.end();
    });
}

async function main() {
    try {
        await testReduxAPI();
        console.log(`\n📁 결과 폴더: ${outputDir}`);
        require('child_process').exec(`explorer "${outputDir}"`);
    } catch (e) {
        console.error('오류:', e.message);
    }
}

main();
