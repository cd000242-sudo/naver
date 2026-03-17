/**
 * fal.ai 이미지 생성 테스트 - 뚱글이 2장 + 졸라맨 2장
 * 제목: 소상공인 '노란우산공제' 대출 이자 지원(1%p) 지자체별 현황
 * ✅ data: URL 및 https URL 모두 처리
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ═══════════════════════════════════════════════════
// 설정
// ═══════════════════════════════════════════════════
const settingsPath = path.join(process.env.APPDATA, 'better-life-naver', 'settings.json');
const config = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
const API_KEY = config.falaiApiKey || config['falai-api-key'] || config['fal-api-key'];

if (!API_KEY) {
    console.error('❌ fal.ai API 키를 찾을 수 없습니다!');
    console.log('설정 파일:', settingsPath);
    console.log('사용 가능한 키:', Object.keys(config).filter(k => k.toLowerCase().includes('fal') || k.toLowerCase().includes('api')));
    process.exit(1);
}
console.log(`✅ API 키 발견: ${API_KEY.substring(0, 8)}...`);

const outputDir = path.join(__dirname, 'test-falai-images');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// ═══════════════════════════════════════════════════
// 스타일 프롬프트
// ═══════════════════════════════════════════════════
const STYLE_PROMPTS = {
    stickman: 'Cute chibi cartoon character with oversized round white head much larger than body, simple black dot eyes, small expressive mouth showing emotion, tiny simple body wearing colorful casual clothes, thick bold black outlines, flat cel-shaded colors with NO gradients, detailed colorful background scene that matches the topic, Korean internet meme comic art style, humorous and lighthearted mood, web comic panel composition, clean high quality digital vector art, NO TEXT NO LETTERS NO WATERMARK',
    roundy: 'Adorable chubby round blob character with extremely round soft body and very short stubby limbs, small dot eyes and tiny happy smile, pure white or soft pastel colored body, soft rounded outlines with NO sharp edges, dreamy pastel colored background with gentle gradient, Molang and Sumikko Gurashi inspired kawaii aesthetic, healing and cozy atmosphere, minimalist cute Korean character design, soft lighting with gentle shadows, warm comforting mood, high quality digital illustration, NO TEXT NO LETTERS NO WATERMARK',
};

// ═══════════════════════════════════════════════════
// 테스트 케이스
// ═══════════════════════════════════════════════════
const testCases = [
    {
        name: 'roundy_saving',
        style: 'roundy',
        heading: '노란우산공제 가입 혜택',
        prompt: `${STYLE_PROMPTS.roundy}, adorable round blob character happily putting coins into a yellow piggy bank shaped like an umbrella, gold coins and savings symbols around, warm cozy financial setting, cheerful saving money scene`,
    },
    {
        name: 'roundy_support',
        style: 'roundy',
        heading: '지자체별 이자 지원 현황',
        prompt: `${STYLE_PROMPTS.roundy}, cute round blob character standing next to a colorful bar chart showing different regions, tiny city buildings in background, official document with stamps, pastel colored data visualization scene`,
    },
    {
        name: 'stickman_loan',
        style: 'stickman',
        heading: '대출 이자 1%p 지원',
        prompt: `${STYLE_PROMPTS.stickman}, chibi character celebrating with arms raised, giant golden percentage sign showing 1 percent, money bills floating around, bank building in background, excited and happy expression, financial benefit celebration scene`,
    },
    {
        name: 'stickman_apply',
        style: 'stickman',
        heading: '노란우산공제 신청 방법',
        prompt: `${STYLE_PROMPTS.stickman}, chibi character sitting at desk filling out application form, laptop showing yellow umbrella logo, checklist with checkmarks, step by step process scene, organized and helpful mood, application guide composition`,
    },
];

// ═══════════════════════════════════════════════════
// 이미지 다운로드 (https URL / data: URL 모두 처리)
// ═══════════════════════════════════════════════════
function downloadImage(imageUrl, filePath) {
    return new Promise((resolve, reject) => {
        // data: URL인 경우 base64 디코딩
        if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
            if (matches && matches[1]) {
                const buffer = Buffer.from(matches[1], 'base64');
                fs.writeFileSync(filePath, buffer);
                resolve(buffer);
            } else {
                reject(new Error('data: URL 파싱 실패'));
            }
            return;
        }

        // https URL인 경우 다운로드
        const protocol = imageUrl.startsWith('https') ? https : require('http');
        protocol.get(imageUrl, { timeout: 30000 }, (res) => {
            // 리다이렉트 처리
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadImage(res.headers.location, filePath).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                fs.writeFileSync(filePath, buffer);
                resolve(buffer);
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

// ═══════════════════════════════════════════════════
// fal.ai API 호출 (axios 스타일은 아니지만 https 모듈 사용)
// ═══════════════════════════════════════════════════
function generateImage(testCase) {
    return new Promise((resolve) => {
        const modelId = 'fal-ai/flux/dev';
        const url = `https://fal.run/${modelId}`;

        const postData = JSON.stringify({
            prompt: testCase.prompt,
            image_size: { width: 1024, height: 1024 },
            num_images: 1,
            enable_safety_checker: false,
            num_inference_steps: 28,
            guidance_scale: 3.5,
            sync_mode: true
        });

        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Key ${API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
            timeout: 120000,
        };

        console.log(`\n🎨 [${testCase.name}] "${testCase.heading}" 생성 중...`);
        console.log(`   스타일: ${testCase.style}`);
        const startTime = Date.now();

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', async () => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                if (res.statusCode !== 200) {
                    console.error(`   ❌ HTTP ${res.statusCode}: ${data.substring(0, 300)}`);
                    resolve({ success: false, name: testCase.name, error: `HTTP ${res.statusCode}: ${data.substring(0, 100)}` });
                    return;
                }

                try {
                    const result = JSON.parse(data);

                    if (!result.images || result.images.length === 0) {
                        console.error(`   ❌ 이미지 없음`);
                        resolve({ success: false, name: testCase.name, error: '이미지 응답 없음' });
                        return;
                    }

                    const imageData = result.images[0];
                    const imageUrl = imageData.url || imageData;
                    const filePath = path.join(outputDir, `${testCase.name}.png`);

                    console.log(`   ⬇️ 이미지 다운로드 중... (생성 ${elapsed}s)`);
                    console.log(`   📎 URL 타입: ${String(imageUrl).substring(0, 50)}...`);

                    try {
                        const buffer = await downloadImage(imageUrl, filePath);
                        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                        const sizeKB = (buffer.length / 1024).toFixed(0);
                        console.log(`   ✅ 완료! ${sizeKB}KB, ${totalElapsed}s → ${filePath}`);

                        resolve({
                            success: true,
                            name: testCase.name,
                            style: testCase.style,
                            size: buffer.length,
                            elapsed: totalElapsed,
                            filePath,
                        });
                    } catch (dlErr) {
                        console.error(`   ❌ 다운로드 실패: ${dlErr.message}`);
                        resolve({ success: false, name: testCase.name, error: `다운로드 실패: ${dlErr.message}` });
                    }
                } catch (e) {
                    console.error(`   ❌ JSON 파싱 실패: ${e.message}`);
                    console.error(`   📝 응답 앞부분: ${data.substring(0, 200)}`);
                    resolve({ success: false, name: testCase.name, error: e.message });
                }
            });
        });

        req.on('error', (err) => {
            console.error(`   ❌ 요청 실패: ${err.message}`);
            resolve({ success: false, name: testCase.name, error: err.message });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, name: testCase.name, error: 'TIMEOUT (120s)' });
        });

        req.write(postData);
        req.end();
    });
}

// ═══════════════════════════════════════════════════
// 실행
// ═══════════════════════════════════════════════════
async function runTests() {
    console.log('═══════════════════════════════════════════');
    console.log('🎯 fal.ai 이미지 생성 테스트');
    console.log('   제목: 소상공인 노란우산공제 대출 이자 지원');
    console.log('   뚱글이 2장 + 졸라맨 2장');
    console.log('   모델: fal-ai/flux/dev');
    console.log('═══════════════════════════════════════════');

    const results = [];
    for (const testCase of testCases) {
        const result = await generateImage(testCase);
        results.push(result);
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('📊 결과 요약');
    console.log('═══════════════════════════════════════════');

    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    for (const r of successes) {
        console.log(`  ✅ ${r.name} (${r.style}) - ${(r.size / 1024).toFixed(0)}KB, ${r.elapsed}s`);
    }
    for (const r of failures) {
        console.log(`  ❌ ${r.name} - ${r.error}`);
    }

    console.log(`\n🎯 성공: ${successes.length}/${results.length}`);
    console.log(`📁 출력 폴더: ${outputDir}`);
}

runTests().catch(console.error);
