/**
 * Fal.ai PuLID 테스트 (올바른 API 형식)
 * 수집된 이미지의 얼굴을 유지하며 새 이미지 생성
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const FAL_API_KEY = process.env.FAL_KEY;
const NEWS_URL = 'https://m.entertain.naver.com/home/article/477/0000591298';

const outputDir = path.join(process.env.TEMP || '.', 'pulid_test_' + Date.now());
fs.mkdirSync(outputDir, { recursive: true });

console.log('🎨 Fal.ai PuLID 얼굴 유지 테스트');
console.log('📁 저장 위치:', outputDir);

// 1. 뉴스에서 이미지 URL 수집
async function getNewsImageUrl() {
    console.log('\n📰 뉴스에서 이미지 수집 중...');

    const response = await axios.get(NEWS_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000
    });

    const ogMatch = response.data.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    if (ogMatch) {
        let imageUrl = ogMatch[1].replace(/&amp;/g, '&');
        console.log('   ✅ 이미지 URL 발견');

        // 이미지 다운로드해서 로컬 저장
        const imgResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.entertain.naver.com/' }
        });
        fs.writeFileSync(path.join(outputDir, 'source_face.jpg'), imgResponse.data);
        console.log('   💾 원본 이미지 저장 완료');

        return imageUrl;
    }
    throw new Error('이미지 없음');
}

// 2. Fal.ai PuLID Queue API 호출
async function callPuLID(imageUrl, prompt, outputName) {
    console.log(`\n🎨 [${outputName}] PuLID 생성 중...`);
    console.log(`   📝 프롬프트: ${prompt.substring(0, 50)}...`);

    const startTime = Date.now();

    try {
        // 1단계: 요청 제출
        const submitResponse = await axios.post(
            'https://queue.fal.run/fal-ai/pulid',
            {
                reference_images: [{ image_url: imageUrl }],
                prompt: prompt,
                negative_prompt: "blurry, low quality, distorted face, bad anatomy, deformed",
                num_images: 1,
                guidance_scale: 1.2,
                num_inference_steps: 4,
                image_size: "square_hd",
                id_scale: 0.8,  // 얼굴 유지 강도 (0.8 = 80%)
                mode: "fidelity"  // 얼굴 충실도 우선
            },
            {
                headers: {
                    'Authorization': `Key ${FAL_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const requestId = submitResponse.data.request_id;
        console.log(`   📤 요청 제출 완료 (ID: ${requestId.substring(0, 20)}...)`);

        // 2단계: 결과 폴링
        let result = null;
        let attempts = 0;
        const maxAttempts = 60; // 최대 60초 대기

        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
            attempts++;

            const statusResponse = await axios.get(
                `https://queue.fal.run/fal-ai/pulid/requests/${requestId}/status`,
                {
                    headers: { 'Authorization': `Key ${FAL_API_KEY}` }
                }
            );

            const status = statusResponse.data.status;

            if (status === 'COMPLETED') {
                // 결과 가져오기
                const resultResponse = await axios.get(
                    `https://queue.fal.run/fal-ai/pulid/requests/${requestId}`,
                    {
                        headers: { 'Authorization': `Key ${FAL_API_KEY}` }
                    }
                );
                result = resultResponse.data;
                break;
            } else if (status === 'FAILED') {
                throw new Error('요청 실패');
            }

            if (attempts % 5 === 0) {
                console.log(`   ⏳ 대기 중... (${attempts}초)`);
            }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (result && result.images && result.images[0]) {
            const resultImageUrl = result.images[0].url;

            // 이미지 다운로드
            const imgResponse = await axios.get(resultImageUrl, { responseType: 'arraybuffer' });
            const savePath = path.join(outputDir, `pulid_${outputName}.png`);
            fs.writeFileSync(savePath, imgResponse.data);

            console.log(`   ✅ 성공! (${elapsed}초) → pulid_${outputName}.png`);
            return { success: true, path: savePath };
        }

        console.log(`   ⚠️ 결과 없음 (${elapsed}초)`);
        return { success: false };

    } catch (error) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const errMsg = error.response?.data?.detail || error.response?.data?.message || error.message;
        console.log(`   ❌ 실패 (${elapsed}초): ${errMsg}`);
        return { success: false, error: errMsg };
    }
}

// 메인 실행
async function main() {
    if (!FAL_API_KEY) {
        console.log('⚠️ FAL_KEY 환경변수가 설정되지 않았습니다.');
        return;
    }

    try {
        // 1. 이미지 수집
        const imageUrl = await getNewsImageUrl();

        console.log('\n' + '='.repeat(50));
        console.log('🎭 PuLID로 이미지 생성 (얼굴 80% 유지)');
        console.log('='.repeat(50));

        // 2. PuLID 생성 (6개)
        const prompts = [
            { name: '01_magazine', prompt: 'professional magazine cover photo, stunning studio lighting, elegant pose, high fashion editorial, same person' },
            { name: '02_stage', prompt: 'performing on concert stage, dramatic spotlight, energetic pose, crowd in background, same person' },
            { name: '03_casual', prompt: 'casual street style photo, warm natural lighting, confident smile, urban background, same person' },
            { name: '04_artistic', prompt: 'artistic portrait, moody cinematic lighting, dramatic shadows, fine art photography, same person' },
            { name: '05_outdoor', prompt: 'outdoor photoshoot, golden hour sunlight, nature background, relaxed pose, same person' },
            { name: '06_formal', prompt: 'formal business portrait, professional setting, confident expression, clean background, same person' }
        ];

        let successCount = 0;
        for (const p of prompts) {
            const result = await callPuLID(imageUrl, p.prompt, p.name);
            if (result.success) successCount++;
            await new Promise(r => setTimeout(r, 1000));
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
