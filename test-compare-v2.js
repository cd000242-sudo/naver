/**
 * fal.ai FLUX-2 + DeepInfra FLUX-2 비교 테스트
 * - 뚱글이 2장 (fal / deepinfra)
 * - 졸라맨 2장 (fal / deepinfra)
 * - ✅ FLUX-2-dev 모델 통일
 * - ✅ NO TEXT 강화 (한글 깨짐 방지)
 * - ✅ 2D 플랫 일러스트 스타일 테스트 포함
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ═══════════════════════════════════════════════════
// 설정
// ═══════════════════════════════════════════════════
const settingsPath = path.join(process.env.APPDATA, 'better-life-naver', 'settings.json');
const config = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
const FAL_KEY = config.falaiApiKey;
const DEEPINFRA_KEY = config.deepinfraApiKey;

if (!FAL_KEY) { console.error('❌ fal.ai API 키 없음!'); process.exit(1); }
if (!DEEPINFRA_KEY) { console.error('❌ DeepInfra API 키 없음!'); process.exit(1); }
console.log(`✅ fal.ai: ${FAL_KEY.substring(0, 8)}...`);
console.log(`✅ DeepInfra: ${DEEPINFRA_KEY.substring(0, 8)}...`);

const outputDir = path.join(__dirname, 'test-compare-v2');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// ═══════════════════════════════════════════════════
// 스타일 프롬프트 - ✅ NO TEXT 더 강하게!
// ═══════════════════════════════════════════════════
const STYLE_PROMPTS = {
    stickman: 'Cute chibi cartoon character with oversized round white head much larger than body, simple black dot eyes, small expressive mouth, tiny simple body wearing colorful casual clothes, thick bold black outlines, flat cel-shaded colors, detailed colorful background scene, Korean internet meme comic art style, humorous lighthearted mood, clean digital vector art, ABSOLUTELY NO TEXT NO LETTERS NO WORDS NO WRITING NO SPEECH BUBBLES NO WATERMARK NO NUMBERS ON IMAGE',
    roundy: 'Adorable chubby round blob character with extremely round soft body and very short stubby limbs, small dot eyes and tiny happy smile, pure white or soft pastel colored body, soft rounded outlines, dreamy pastel colored background with gentle gradient, Molang and Sumikko Gurashi inspired kawaii aesthetic, healing cozy atmosphere, minimalist cute character design, soft lighting with gentle shadows, high quality digital illustration, ABSOLUTELY NO TEXT NO LETTERS NO WORDS NO WRITING NO SPEECH BUBBLES NO WATERMARK NO NUMBERS ON IMAGE',
};

// ═══════════════════════════════════════════════════
// 테스트 케이스 (6개: 뚱글이2 + 졸라맨2 + 2D 2장)
// ═══════════════════════════════════════════════════
const testCases = [
    // 뚱글이 2장
    {
        name: 'roundy_saving',
        style: 'roundy',
        prompt: `${STYLE_PROMPTS.roundy}, adorable round blob character happily putting gold coins into a yellow piggy bank shaped like an umbrella, scattered gold coins around, warm cozy pastel financial setting, cheerful saving money scene, bright vivid colors`,
    },
    {
        name: 'roundy_support',
        style: 'roundy',
        prompt: `${STYLE_PROMPTS.roundy}, cute round blob character standing next to a colorful bar chart with rainbow bars, tiny pastel city buildings in background, official looking stamp nearby, pastel colored data visualization scene, bright vivid illustration`,
    },
    // 졸라맨 2장
    {
        name: 'stickman_loan',
        style: 'stickman',
        prompt: `${STYLE_PROMPTS.stickman}, chibi character celebrating with arms raised excitedly, giant golden percentage sign floating above, green money bills flying around, classic bank building in background, bright blue sky, excited happy expression, celebration scene`,
    },
    {
        name: 'stickman_apply',
        style: 'stickman',
        prompt: `${STYLE_PROMPTS.stickman}, chibi character sitting at desk writing on papers, laptop computer with yellow umbrella icon on screen, checklist paper with green checkmarks, step by step guide scene, organized desk setting, helpful mood`,
    },
    // ✅ 2D 플랫 스타일 2장
    {
        name: '2d_flat_saving',
        style: '2d-flat',
        prompt: `Simple flat 2D vector illustration, minimalist geometric shapes, a yellow umbrella icon protecting a stack of gold coins, savings and finance concept, clean flat design with solid colors, no gradients no shadows, modern infographic style illustration, bright cheerful color palette, white background, ABSOLUTELY NO TEXT NO LETTERS NO WORDS NO WRITING NO WATERMARK`,
    },
    {
        name: '2d_flat_support',
        style: '2d-flat',
        prompt: `Simple flat 2D vector illustration, minimalist geometric shapes, colorful bar chart with different height bars in rainbow colors, small house and building icons below each bar, city skyline silhouette in background, government support concept, clean flat design with solid colors, modern infographic style, bright cheerful palette, white background, ABSOLUTELY NO TEXT NO LETTERS NO WORDS NO WRITING NO WATERMARK`,
    },
];

// ═══════════════════════════════════════════════════
// 이미지 다운로드 유틸
// ═══════════════════════════════════════════════════
function downloadBuffer(imageUrl) {
    return new Promise((resolve, reject) => {
        if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
            if (matches) resolve(Buffer.from(matches[1], 'base64'));
            else reject(new Error('data URL 파싱 실패'));
            return;
        }
        const proto = imageUrl.startsWith('https') ? https : require('http');
        proto.get(imageUrl, { timeout: 30000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadBuffer(res.headers.location).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// ═══════════════════════════════════════════════════
// fal.ai API (FLUX-2-dev)
// ═══════════════════════════════════════════════════
function falGenerate(tc) {
    return new Promise((resolve) => {
        // ✅ FLUX-2 사용! (fal-ai/flux-2)
        const modelId = 'fal-ai/flux-2';
        const postData = JSON.stringify({
            prompt: tc.prompt,
            image_size: { width: 1024, height: 1024 },
            num_images: 1,
            enable_safety_checker: false,
            num_inference_steps: 28,
            guidance_scale: 3.5,
            sync_mode: true
        });

        const options = {
            hostname: 'fal.run',
            path: `/${modelId}`,
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
            timeout: 120000,
        };

        console.log(`  🔵 [fal.ai] "${tc.name}" 생성 중... (FLUX-2-dev)`);
        const start = Date.now();

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', async () => {
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                if (res.statusCode !== 200) {
                    console.error(`  🔵 ❌ HTTP ${res.statusCode}: ${data.substring(0, 200)}`);
                    resolve({ success: false, name: tc.name, engine: 'fal', error: `HTTP ${res.statusCode}: ${data.substring(0, 100)}` });
                    return;
                }
                try {
                    const result = JSON.parse(data);
                    if (!result.images || !result.images[0]) {
                        resolve({ success: false, name: tc.name, engine: 'fal', error: '이미지 없음' });
                        return;
                    }
                    const imageUrl = result.images[0].url || result.images[0];
                    const filePath = path.join(outputDir, `fal_${tc.name}.png`);
                    const buffer = await downloadBuffer(imageUrl);
                    fs.writeFileSync(filePath, buffer);
                    console.log(`  🔵 ✅ ${(buffer.length / 1024).toFixed(0)}KB, ${elapsed}s`);
                    resolve({ success: true, name: tc.name, engine: 'fal', size: buffer.length, elapsed, filePath, style: tc.style });
                } catch (e) {
                    resolve({ success: false, name: tc.name, engine: 'fal', error: e.message });
                }
            });
        });
        req.on('error', e => resolve({ success: false, name: tc.name, engine: 'fal', error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, name: tc.name, engine: 'fal', error: 'TIMEOUT' }); });
        req.write(postData);
        req.end();
    });
}

// ═══════════════════════════════════════════════════
// DeepInfra API (FLUX-2-dev)
// ═══════════════════════════════════════════════════
function deepinfraGenerate(tc) {
    return new Promise((resolve) => {
        const postData = JSON.stringify({
            model: 'black-forest-labs/FLUX-2-dev',
            prompt: tc.prompt,
            size: '1024x1024',
            n: 1,
        });

        const options = {
            hostname: 'api.deepinfra.com',
            path: '/v1/openai/images/generations',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEEPINFRA_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
            timeout: 120000,
        };

        console.log(`  🟠 [DeepInfra] "${tc.name}" 생성 중... (FLUX-2-dev)`);
        const start = Date.now();

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', async () => {
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                if (res.statusCode !== 200) {
                    console.error(`  🟠 ❌ HTTP ${res.statusCode}: ${data.substring(0, 200)}`);
                    resolve({ success: false, name: tc.name, engine: 'deepinfra', error: `HTTP ${res.statusCode}` });
                    return;
                }
                try {
                    const result = JSON.parse(data);
                    if (!result.data || !result.data[0]) {
                        resolve({ success: false, name: tc.name, engine: 'deepinfra', error: '이미지 없음' });
                        return;
                    }
                    const item = result.data[0];
                    const filePath = path.join(outputDir, `deepinfra_${tc.name}.png`);
                    if (item.b64_json) {
                        const buffer = Buffer.from(item.b64_json, 'base64');
                        fs.writeFileSync(filePath, buffer);
                        console.log(`  🟠 ✅ ${(buffer.length / 1024).toFixed(0)}KB, ${elapsed}s (b64)`);
                        resolve({ success: true, name: tc.name, engine: 'deepinfra', size: buffer.length, elapsed, filePath, style: tc.style });
                    } else if (item.url) {
                        const buffer = await downloadBuffer(item.url);
                        fs.writeFileSync(filePath, buffer);
                        console.log(`  🟠 ✅ ${(buffer.length / 1024).toFixed(0)}KB, ${elapsed}s (url)`);
                        resolve({ success: true, name: tc.name, engine: 'deepinfra', size: buffer.length, elapsed, filePath, style: tc.style });
                    } else {
                        resolve({ success: false, name: tc.name, engine: 'deepinfra', error: '응답 형식 미지원' });
                    }
                } catch (e) {
                    resolve({ success: false, name: tc.name, engine: 'deepinfra', error: e.message });
                }
            });
        });
        req.on('error', e => resolve({ success: false, name: tc.name, engine: 'deepinfra', error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, name: tc.name, engine: 'deepinfra', error: 'TIMEOUT' }); });
        req.write(postData);
        req.end();
    });
}

// ═══════════════════════════════════════════════════
// 실행
// ═══════════════════════════════════════════════════
async function runTests() {
    console.log('═══════════════════════════════════════════');
    console.log('🎯 FLUX-2-dev 엔진 비교 (fal.ai vs DeepInfra)');
    console.log('   뚱글이 2장 + 졸라맨 2장 + 2D 플랫 2장');
    console.log('   ✅ 텍스트 완전 금지 강화');
    console.log('═══════════════════════════════════════════');

    const results = [];

    for (const tc of testCases) {
        console.log(`\n🎨 [${tc.name}] (${tc.style})`);

        // fal.ai 먼저
        const falResult = await falGenerate(tc);
        results.push(falResult);
        await new Promise(r => setTimeout(r, 1000));

        // DeepInfra
        const diResult = await deepinfraGenerate(tc);
        results.push(diResult);
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('📊 결과 요약');
    console.log('═══════════════════════════════════════════');

    for (const tc of testCases) {
        const fal = results.find(r => r.name === tc.name && r.engine === 'fal');
        const di = results.find(r => r.name === tc.name && r.engine === 'deepinfra');
        console.log(`\n  📌 ${tc.name} (${tc.style})`);
        if (fal?.success) console.log(`    🔵 fal.ai:     ${(fal.size / 1024).toFixed(0)}KB, ${fal.elapsed}s ✅`);
        else console.log(`    🔵 fal.ai:     ❌ ${fal?.error}`);
        if (di?.success) console.log(`    🟠 DeepInfra:  ${(di.size / 1024).toFixed(0)}KB, ${di.elapsed}s ✅`);
        else console.log(`    🟠 DeepInfra:  ❌ ${di?.error}`);
    }

    const total = results.length;
    const ok = results.filter(r => r.success).length;
    console.log(`\n🎯 전체: ${ok}/${total} 성공`);
    console.log(`📁 출력: ${outputDir}`);
}

runTests().catch(console.error);
