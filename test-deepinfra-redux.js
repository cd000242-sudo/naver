/**
 * DeepInfra Redux (img2img) - 참조 이미지 인물 80% 유지
 * 수집한 이미지를 기반으로 새 이미지 생성
 */

const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

const NEWS_URL = 'https://m.entertain.naver.com/home/article/477/0000591298';
const API_KEY = 'YYbFgUGCfUZlqs0yCGTPF6KRY88PUCKH';

// 출력 디렉토리
const outputDir = path.join(process.env.TEMP || '.', 'deepinfra_redux_test_' + Date.now());
fs.mkdirSync(outputDir, { recursive: true });

console.log('🚀 DeepInfra Redux (img2img) 테스트 - 인물 80% 유지');
console.log('📁 저장 위치:', outputDir);
console.log('');

// 1. 뉴스에서 이미지 URL 수집
async function crawlNewsImages(url) {
    console.log('📥 뉴스 페이지 크롤링 중...');

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html',
                'Accept-Language': 'ko-KR,ko;q=0.9'
            },
            timeout: 30000
        });

        const html = response.data;

        // og:image
        const images = [];
        const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
        if (ogMatch && ogMatch[1]) {
            images.push(ogMatch[1]);
        }

        // imgnews 이미지들
        const imgMatches = html.matchAll(/https?:\/\/imgnews\.pstatic\.net\/[^"'\s<>]+/gi);
        for (const match of imgMatches) {
            const imgUrl = match[0].replace(/&amp;/g, '&');
            if (!images.includes(imgUrl) && !imgUrl.includes('logo')) {
                images.push(imgUrl);
            }
        }

        console.log(`✅ ${images.length}개 이미지 발견`);
        return images;
    } catch (error) {
        console.error('❌ 크롤링 실패:', error.message);
        return [];
    }
}

// 2. 이미지 다운로드 및 Base64 변환
async function downloadAndConvertToBase64(url, filename) {
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

        // Base64 변환
        const base64 = response.data.toString('base64');
        const mimeType = response.headers['content-type'] || 'image/jpeg';

        console.log(`   💾 ${filename} (${(response.data.length / 1024).toFixed(1)}KB)`);

        return {
            path: savePath,
            base64: base64,
            dataUrl: `data:${mimeType};base64,${base64}`
        };
    } catch (e) {
        console.error(`   ❌ 다운로드 실패: ${e.message}`);
        return null;
    }
}

// 3. DeepInfra Redux (img2img) API 호출
async function generateWithRedux(imageBase64, prompt, outputName, strength = 0.2) {
    return new Promise((resolve, reject) => {
        // Redux API는 strength가 낮을수록 원본 유지 (0.2 = 80% 원본 유지)
        const body = JSON.stringify({
            image: imageBase64,  // base64 이미지
            prompt: prompt,
            num_inference_steps: 28,
            guidance_scale: 3.5,  // 낮을수록 원본 이미지 영향력 증가
            // strength: strength   // 일부 모델에서 사용
        });

        console.log(`\n🎨 [${outputName}] Redux 생성 중... (원본 ${Math.round((1 - strength) * 100)}% 유지)`);
        console.log(`   📝 프롬프트: ${prompt.substring(0, 60)}...`);

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
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);

                        // Redux 응답 형식 확인
                        let imageData = null;
                        if (json.images && json.images[0]) {
                            imageData = json.images[0];
                        } else if (json.output) {
                            imageData = json.output;
                        } else if (json.image) {
                            imageData = json.image;
                        }

                        if (imageData) {
                            const savePath = path.join(outputDir, `redux_${outputName}.png`);
                            const buffer = Buffer.from(imageData, 'base64');
                            fs.writeFileSync(savePath, buffer);
                            console.log(`   ✅ 성공! (${elapsed}초) → redux_${outputName}.png`);
                            resolve({ success: true, path: savePath, time: elapsed });
                        } else {
                            console.log(`   ⚠️ 이미지 없음 (${elapsed}초)`);
                            console.log(`   응답 키: ${Object.keys(json).join(', ')}`);
                            resolve({ success: false, response: json });
                        }
                    } catch (e) {
                        console.log(`   ❌ 파싱 실패:`, e.message);
                        reject(e);
                    }
                } else {
                    console.log(`   ❌ 실패 (${elapsed}초): Status ${res.statusCode}`);
                    try {
                        const errJson = JSON.parse(data);
                        console.log(`   오류: ${errJson.error || errJson.detail || data.substring(0, 200)}`);
                    } catch {
                        console.log(`   ${data.substring(0, 200)}`);
                    }
                    resolve({ success: false, status: res.statusCode });
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
    console.log('🔍 1단계: 뉴스에서 참조 이미지 수집');
    console.log('='.repeat(60));

    const images = await crawlNewsImages(NEWS_URL);

    if (images.length === 0) {
        console.log('❌ 이미지를 찾을 수 없습니다.');
        return;
    }

    // 첫 번째 이미지 다운로드
    console.log('\n📥 참조 이미지 다운로드 중...');
    const sourceImage = await downloadAndConvertToBase64(images[0], 'source_reference.jpg');

    if (!sourceImage) {
        console.log('❌ 참조 이미지 다운로드 실패');
        return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎨 2단계: Redux로 이미지 생성 (인물 80% 유지)');
    console.log('='.repeat(60));

    // 프롬프트 목록 (다양한 스타일)
    const prompts = [
        { name: '01_thumbnail', prompt: 'professional magazine cover photo, same person, elegant lighting, cinematic quality' },
        { name: '02_stage', prompt: 'same person performing on stage, concert lighting, dynamic pose, energetic atmosphere' },
        { name: '03_artistic', prompt: 'same person, artistic portrait, dramatic lighting, moody atmosphere, professional photography' },
        { name: '04_fashion', prompt: 'same person, high fashion editorial, stylish outfit, sophisticated composition' },
        { name: '05_casual', prompt: 'same person, casual lifestyle shot, natural lighting, warm atmosphere' },
        { name: '06_dramatic', prompt: 'same person, dramatic cinematic shot, low key lighting, intense expression' }
    ];

    const results = [];

    for (const p of prompts) {
        try {
            const result = await generateWithRedux(sourceImage.base64, p.prompt, p.name, 0.2);
            results.push({ ...p, ...result });
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
    console.log('\n💡 이미지:');
    console.log('   - source_reference.jpg: 원본 참조 이미지');
    console.log('   - redux_*.png: 인물 80% 유지하며 생성된 이미지');

    // 폴더 열기
    require('child_process').exec(`explorer "${outputDir}"`);
}

main().catch(console.error);
