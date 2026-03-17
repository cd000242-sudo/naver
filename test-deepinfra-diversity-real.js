const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'YYbFgUGCfUZlqs0yCGTPF6KRY88PUCKH';

// 다양한 카메라 앵글 테스트
const testCases = [
    {
        name: '1_bird_eye_view',
        prompt: 'RAW photo, hyperrealistic, 8k uhd, bird-eye view overhead shot looking down, K-pop idol performing on stage, Korean person, dynamic action, NOT front-facing portrait, professional photography, NO TEXT'
    },
    {
        name: '2_low_angle',
        prompt: 'RAW photo, hyperrealistic, 8k uhd, low angle shot looking up dramatic perspective, Korean celebrity at red carpet event, stylish outfit, NOT front-facing portrait, dynamic composition, professional photography, NO TEXT'
    },
    {
        name: '3_silhouette_backlit',
        prompt: 'RAW photo, hyperrealistic, 8k uhd, silhouette backlit atmospheric, musician sunset performance, artistic composition, NOT front-facing portrait, cinematic lighting, professional photography, NO TEXT'
    }
];

// 출력 디렉토리
const outputDir = path.join(process.env.TEMP || '.', 'deepinfra_diversity_test_' + Date.now());
fs.mkdirSync(outputDir, { recursive: true });
console.log('📁 저장 위치:', outputDir);
console.log('');

async function generateImage(testCase) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            prompt: testCase.prompt,
            model: 'black-forest-labs/FLUX-2-dev',
            size: '1024x1024',
            n: 1
        });

        console.log(`\n🎨 [${testCase.name}] 생성 중...`);
        console.log(`📝 프롬프트: ${testCase.prompt.substring(0, 80)}...`);

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
                            const imgData = json.data[0];
                            const savePath = path.join(outputDir, `${testCase.name}.png`);

                            if (imgData.b64_json) {
                                const buffer = Buffer.from(imgData.b64_json, 'base64');
                                fs.writeFileSync(savePath, buffer);
                                console.log(`✅ 성공! (${elapsed}초) → ${savePath}`);
                                resolve({ success: true, path: savePath, time: elapsed });
                            } else if (imgData.url) {
                                // URL인 경우 다운로드 (추후 구현)
                                console.log(`✅ 성공! (${elapsed}초) URL: ${imgData.url.substring(0, 50)}...`);
                                resolve({ success: true, url: imgData.url, time: elapsed });
                            }
                        }
                    } catch (e) {
                        reject(new Error('JSON 파싱 실패'));
                    }
                } else {
                    console.log(`❌ 실패 (${elapsed}초): Status ${res.statusCode}`);
                    console.log(data.substring(0, 200));
                    reject(new Error(`Status ${res.statusCode}`));
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

async function main() {
    console.log('🚀 DeepInfra 다양성 테스트 시작 (3개 이미지)\n');
    console.log('='.repeat(60));

    const results = [];

    for (const testCase of testCases) {
        try {
            const result = await generateImage(testCase);
            results.push({ ...testCase, ...result });
            // API 요청 간 간격
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.error(`❌ ${testCase.name} 실패:`, e.message);
            results.push({ ...testCase, success: false, error: e.message });
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 결과 요약');
    console.log('='.repeat(60));

    const successes = results.filter(r => r.success);
    console.log(`✅ 성공: ${successes.length}/${results.length}`);

    if (successes.length > 0) {
        console.log(`\n📁 이미지 저장 폴더: ${outputDir}`);
        console.log('\n💡 폴더를 열어 이미지 다양성을 직접 확인하세요:');
        console.log('   - bird_eye_view: 버드아이 위에서 내려다보기');
        console.log('   - low_angle: 로우앵글 아래에서 올려다보기');
        console.log('   - silhouette_backlit: 실루엣 역광 효과');

        // 폴더 열기
        require('child_process').exec(`explorer "${outputDir}"`);
    }
}

main().catch(console.error);
