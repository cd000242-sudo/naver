/**
 * Seedream 4.0 (getimg.ai) 한글 텍스트 렌더링 테스트 v2
 * 올바른 엔드포인트: POST /v1/seedream-v4/text-to-image
 * 파라미터: prompt, aspect_ratio (1:1, 16:9, 9:16 등), response_format (b64/url)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'key-1lysg7QpJXXlejw5YQOo9LAIh9RjoLUjXzY8RjPkGUfrcaSkmlKUC72wg0mcUeSI4X6ZG91pYBXlrQOQ82ytsQjPeV75hSSF';
const API_URL = 'https://api.getimg.ai/v1/seedream-v4/text-to-image';

const OUTPUT_DIR = path.join(__dirname, 'test-seedream4-output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const testCases = [
    {
        name: '01_korean_thumbnail',
        prompt: 'Professional blog thumbnail with bold Korean text "겨울 피부 관리 꿀팁 5가지" written clearly in center. Clean modern design, soft pastel background, skincare products. Magazine quality with readable Korean typography.',
        aspect_ratio: '16:9',
        description: '한글 텍스트 썸네일 (블로그 스타일)',
    },
    {
        name: '02_lifestyle',
        prompt: 'Beautiful Korean woman in 30s enjoying warm coffee at a cozy modern Seoul cafe. Soft natural window light, Instagram aesthetic, warm tones, lifestyle photography. No text in image.',
        aspect_ratio: '1:1',
        description: '라이프스타일 이미지 (텍스트 없음)',
    },
    {
        name: '03_korean_mixed_text',
        prompt: 'Modern infographic with Korean text "2026년 최고의 노트북 TOP 5" and English "Best Laptops 2026". Clean white background, minimal tech aesthetic, bold typography.',
        aspect_ratio: '16:9',
        description: '한글+영어 혼합 텍스트',
    },
    {
        name: '04_food_photo',
        prompt: 'Professional food photography of Korean bibimbap in premium stone bowl. Overhead flat lay, vibrant colorful vegetables, golden fried egg, warm cinematic lighting. No text.',
        aspect_ratio: '1:1',
        description: '음식 사진 (품질 비교용)',
    },
];

async function generateImage(testCase) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            prompt: testCase.prompt,
            aspect_ratio: testCase.aspect_ratio,
            response_format: 'b64',
        });

        const url = new URL(API_URL);
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const startTime = Date.now();
        console.log(`\n🎨 [${testCase.name}] ${testCase.description}`);
        console.log(`   비율: ${testCase.aspect_ratio}`);
        console.log(`   프롬프트: ${testCase.prompt.substring(0, 80)}...`);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                if (res.statusCode !== 200) {
                    console.log(`   ❌ HTTP ${res.statusCode}: ${data.substring(0, 300)}`);
                    resolve(null);
                    return;
                }

                try {
                    const json = JSON.parse(data);
                    const imageData = json.image;
                    const cost = json.cost;
                    const seed = json.seed;

                    if (!imageData) {
                        console.log(`   ❌ 이미지 데이터 없음: ${JSON.stringify(json).substring(0, 200)}`);
                        resolve(null);
                        return;
                    }

                    const buffer = Buffer.from(imageData, 'base64');
                    const filePath = path.join(OUTPUT_DIR, `${testCase.name}.png`);
                    fs.writeFileSync(filePath, buffer);

                    const sizeKB = Math.round(buffer.length / 1024);
                    console.log(`   ✅ 성공! ${elapsed}초, ${sizeKB}KB, 비용: $${cost || '?'}, seed: ${seed || '?'}`);
                    console.log(`   📁 ${filePath}`);
                    resolve({ filePath, elapsed, sizeKB, cost, seed });
                } catch (e) {
                    console.log(`   ❌ JSON 파싱 실패: ${e.message}`);
                    console.log(`   응답 (처음 300자): ${data.substring(0, 300)}`);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.log(`   ❌ 네트워크 오류: ${e.message}`);
            resolve(null);
        });

        req.setTimeout(120000, () => {
            console.log(`   ❌ 타임아웃 (120초)`);
            req.destroy();
            resolve(null);
        });

        req.write(body);
        req.end();
    });
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Seedream 4.0 (getimg.ai) 한글 텍스트 렌더링 테스트 v2');
    console.log('  엔드포인트: POST /v1/seedream-v4/text-to-image');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`출력 폴더: ${OUTPUT_DIR}\n`);

    const results = [];
    let totalCost = 0;

    for (const testCase of testCases) {
        const result = await generateImage(testCase);
        results.push({
            name: testCase.name,
            description: testCase.description,
            success: !!result,
            ...(result || {})
        });
        if (result?.cost) totalCost += result.cost;
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  📊 결과 요약');
    console.log('═══════════════════════════════════════════════════════');
    const successCount = results.filter(r => r.success).length;
    for (const r of results) {
        if (r.success) {
            console.log(`  ✅ ${r.description} — ${r.elapsed}초, ${r.sizeKB}KB, $${r.cost || '?'}`);
        } else {
            console.log(`  ❌ ${r.description} — 실패`);
        }
    }
    console.log(`\n  총 ${successCount}/${results.length} 성공`);
    console.log(`  총 비용: $${totalCost.toFixed(6)}`);
    console.log(`  장당 평균: $${(totalCost / successCount).toFixed(6)}`);
    console.log(`  출력 폴더: ${OUTPUT_DIR}`);
}

main().catch(console.error);
