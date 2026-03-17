/**
 * Fal.ai PuLID 단일 테스트 (타임아웃 120초)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const FAL_API_KEY = process.env.FAL_KEY;
const NEWS_URL = 'https://m.entertain.naver.com/home/article/477/0000591298';

const outputDir = path.join(process.env.TEMP || '.', 'pulid_single_' + Date.now());
fs.mkdirSync(outputDir, { recursive: true });

console.log('🎨 Fal.ai PuLID 단일 테스트 (타임아웃 120초)');
console.log('📁 저장 위치:', outputDir);

async function main() {
    if (!FAL_API_KEY) {
        console.log('⚠️ FAL_KEY 환경변수 없음');
        return;
    }

    try {
        // 1. 이미지 URL 수집
        console.log('\n📰 뉴스에서 이미지 수집 중...');
        const response = await axios.get(NEWS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const ogMatch = response.data.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
        const imageUrl = ogMatch[1].replace(/&amp;/g, '&');
        console.log('   ✅ 이미지 URL:', imageUrl.substring(0, 60) + '...');

        // 원본 저장
        const imgResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.entertain.naver.com/' }
        });
        fs.writeFileSync(path.join(outputDir, 'source.jpg'), imgResponse.data);
        console.log('   💾 원본 저장 완료');

        // 2. PuLID 요청 제출
        console.log('\n🎨 PuLID 요청 제출...');
        const startTime = Date.now();

        const submitResponse = await axios.post(
            'https://queue.fal.run/fal-ai/pulid',
            {
                reference_images: [{ image_url: imageUrl }],
                prompt: "professional magazine cover photo, stunning studio lighting, elegant pose, high fashion, same person",
                negative_prompt: "blurry, low quality, distorted face",
                num_images: 1,
                guidance_scale: 1.2,
                num_inference_steps: 4,
                image_size: "square_hd",
                id_scale: 0.8,
                mode: "fidelity"
            },
            {
                headers: {
                    'Authorization': `Key ${FAL_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const requestId = submitResponse.data.request_id;
        console.log('   📤 요청 ID:', requestId);

        // 3. 결과 대기 (최대 120초)
        console.log('\n⏳ 결과 대기 중 (최대 120초)...');

        let attempts = 0;
        const maxAttempts = 120;

        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
            attempts++;

            try {
                const statusResponse = await axios.get(
                    `https://queue.fal.run/fal-ai/pulid/requests/${requestId}/status`,
                    { headers: { 'Authorization': `Key ${FAL_API_KEY}` } }
                );

                const status = statusResponse.data.status;

                if (status === 'COMPLETED') {
                    console.log(`   ✅ 완료! (${attempts}초)`);

                    // 결과 가져오기
                    const resultResponse = await axios.get(
                        `https://queue.fal.run/fal-ai/pulid/requests/${requestId}`,
                        { headers: { 'Authorization': `Key ${FAL_API_KEY}` } }
                    );

                    const result = resultResponse.data;
                    console.log('   📦 응답 키:', Object.keys(result).join(', '));

                    if (result.images && result.images[0]) {
                        const resultImageUrl = result.images[0].url;
                        console.log('   🖼️ 이미지 URL:', resultImageUrl.substring(0, 60) + '...');

                        // 다운로드
                        const resultImg = await axios.get(resultImageUrl, { responseType: 'arraybuffer' });
                        const savePath = path.join(outputDir, 'pulid_result.png');
                        fs.writeFileSync(savePath, resultImg.data);

                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                        console.log(`\n🎉 성공! (${elapsed}초)`);
                        console.log(`   📁 ${savePath}`);
                    }

                    break;
                } else if (status === 'FAILED') {
                    console.log('   ❌ 실패:', statusResponse.data);
                    break;
                } else if (status === 'IN_QUEUE') {
                    if (attempts % 10 === 0) console.log(`   ⏳ 큐 대기 중... (${attempts}초)`);
                } else if (status === 'IN_PROGRESS') {
                    if (attempts % 10 === 0) console.log(`   🔄 처리 중... (${attempts}초)`);
                }
            } catch (e) {
                // 상태 확인 실패 시 계속 시도
            }
        }

        if (attempts >= maxAttempts) {
            console.log('   ⏰ 타임아웃 (120초)');
        }

        // 폴더 열기
        require('child_process').exec(`explorer "${outputDir}"`);

    } catch (e) {
        console.error('오류:', e.response?.data || e.message);
    }
}

main();
