/**
 * DeepInfra 이미지 생성 테스트 - 뚱글이 2장 + 졸라맨 2장
 * 제목: 소상공인 '노란우산공제' 대출 이자 지원(1%p) 지자체별 현황
 * 모델: FLUX-2-dev (OpenAI 호환 API)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ═══════════════════════════════════════════════════
// 설정
// ═══════════════════════════════════════════════════
const settingsPath = path.join(process.env.APPDATA, 'better-life-naver', 'settings.json');
const config = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
const API_KEY = config.deepinfraApiKey;

if (!API_KEY) {
    console.error('❌ DeepInfra API 키를 찾을 수 없습니다!');
    process.exit(1);
}
console.log(`✅ DeepInfra API 키 발견: ${API_KEY.substring(0, 8)}...`);

const outputDir = path.join(__dirname, 'test-deepinfra-images');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// ═══════════════════════════════════════════════════
// 스타일 프롬프트 (imageStyles.ts 기반)
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
// DeepInfra API 호출 (OpenAI 호환)
// ═══════════════════════════════════════════════════
function generateImage(testCase) {
    return new Promise((resolve) => {
        const postData = JSON.stringify({
            model: 'black-forest-labs/FLUX-2-dev',
            prompt: testCase.prompt,
            size: '1024x1024',
            n: 1,
        });

        const options = {
            hostname: 'api.deepinfra.com',
            path: '/v1/openai/images/generations',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
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
            res.on('end', () => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                if (res.statusCode !== 200) {
                    console.error(`   ❌ HTTP ${res.statusCode}: ${data.substring(0, 300)}`);
                    resolve({ success: false, name: testCase.name, error: `HTTP ${res.statusCode}` });
                    return;
                }

                try {
                    const result = JSON.parse(data);

                    if (!result.data || result.data.length === 0) {
                        console.error(`   ❌ 이미지 데이터 없음`);
                        resolve({ success: false, name: testCase.name, error: '이미지 없음' });
                        return;
                    }

                    const imageItem = result.data[0];
                    const filePath = path.join(outputDir, `${testCase.name}.png`);

                    // b64_json인 경우
                    if (imageItem.b64_json) {
                        const buffer = Buffer.from(imageItem.b64_json, 'base64');
                        fs.writeFileSync(filePath, buffer);
                        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                        const sizeKB = (buffer.length / 1024).toFixed(0);
                        console.log(`   ✅ 완료! ${sizeKB}KB, ${totalElapsed}s (b64) → ${filePath}`);
                        resolve({
                            success: true, name: testCase.name, style: testCase.style,
                            size: buffer.length, elapsed: totalElapsed, filePath,
                        });
                        return;
                    }

                    // URL인 경우 다운로드
                    if (imageItem.url) {
                        console.log(`   ⬇️ URL 다운로드... (생성 ${elapsed}s)`);
                        const protocol = imageItem.url.startsWith('https') ? https : require('http');
                        protocol.get(imageItem.url, { timeout: 30000 }, (imgRes) => {
                            const chunks = [];
                            imgRes.on('data', (chunk) => chunks.push(chunk));
                            imgRes.on('end', () => {
                                const buffer = Buffer.concat(chunks);
                                fs.writeFileSync(filePath, buffer);
                                const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                                const sizeKB = (buffer.length / 1024).toFixed(0);
                                console.log(`   ✅ 완료! ${sizeKB}KB, ${totalElapsed}s (url) → ${filePath}`);
                                resolve({
                                    success: true, name: testCase.name, style: testCase.style,
                                    size: buffer.length, elapsed: totalElapsed, filePath,
                                });
                            });
                            imgRes.on('error', (err) => {
                                resolve({ success: false, name: testCase.name, error: `다운로드 실패: ${err.message}` });
                            });
                        });
                        return;
                    }

                    resolve({ success: false, name: testCase.name, error: '이미지 URL/데이터 형식 미지원' });
                } catch (e) {
                    console.error(`   ❌ 응답 파싱 실패: ${e.message}`);
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
    console.log('=======================================');
    console.log('🎯 DeepInfra FLUX-2-dev 이미지 생성 테스트');
    console.log('   제목: 노란우산공제 대출 이자 지원');
    console.log('   뚱글이 2장 + 졸라맨 2장');
    console.log('=======================================');

    const results = [];
    for (const tc of testCases) {
        const result = await generateImage(tc);
        results.push(result);
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log('\n=======================================');
    console.log('📊 결과 요약');
    console.log('=======================================');
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);
    for (const r of successes) {
        console.log(`  ✅ ${r.name} (${r.style}) - ${(r.size / 1024).toFixed(0)}KB, ${r.elapsed}s`);
    }
    for (const r of failures) {
        console.log(`  ❌ ${r.name} - ${r.error}`);
    }
    console.log(`\n🎯 성공: ${successes.length}/${results.length}`);
    console.log(`📁 출력: ${outputDir}`);
}

runTests().catch(console.error);
