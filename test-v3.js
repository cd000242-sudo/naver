/**
 * 테스트 v3: 한국 웹툰 스타일 + 동일 프롬프트 다양성 검증
 * 
 * 1) 한국 웹툰(만화) 스타일 2장 — 네이버웹툰 같은 한국식 만화체
 * 2) 동일 프롬프트로 3번 생성 → 얼마나 다른지 검증 (중복 위험 체크)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const settingsPath = path.join(process.env.APPDATA, 'better-life-naver', 'settings.json');
const config = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
const DEEPINFRA_KEY = config.deepinfraApiKey;
console.log(`✅ DeepInfra: ${DEEPINFRA_KEY.substring(0, 8)}...`);

const outputDir = path.join(__dirname, 'test-v3');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// ═══════════════════════════════════════════════════
// 한국 웹툰 스타일 프롬프트
// ═══════════════════════════════════════════════════
const WEBTOON_STYLE = 'Korean webtoon manhwa illustration style, clean sharp line art with consistent stroke width, expressive cute chibi characters with large sparkling eyes, vibrant saturated colors with cel shading, dynamic composition with manga-like energy lines and emotion effects, soft pastel background with bokeh, modern Korean digital comic art aesthetic, Naver Webtoon quality, detailed expressive faces with blush marks, ABSOLUTELY NO TEXT NO LETTERS NO WORDS NO WRITING NO SPEECH BUBBLES NO WATERMARK';

// ═══════════════════════════════════════════════════
// 테스트 케이스
// ═══════════════════════════════════════════════════
const testCases = [
    // ✅ 한국 웹툰 스타일 2장
    {
        name: 'webtoon_saving',
        prompt: `${WEBTOON_STYLE}, cute chibi character with sparkly eyes happily holding a yellow umbrella over a golden piggy bank, gold coins scattered around, warm cozy room with soft lighting, savings and financial protection concept, cheerful heartwarming scene`,
    },
    {
        name: 'webtoon_support',
        prompt: `${WEBTOON_STYLE}, cute chibi character standing proudly next to a colorful ascending bar chart, miniature city skyline with buildings in background, official government seal stamp on the ground, regional support and statistics concept, bright optimistic mood`,
    },
    // ✅ 동일 프롬프트 3회 반복 (중복 다양성 검증)
    // → 졸라맨 스타일로 동일 프롬프트 3번 돌려서 결과 비교
    {
        name: 'diversity_test_1',
        prompt: 'Cute chibi cartoon character with oversized round white head, simple black dot eyes, small mouth, tiny body wearing yellow t-shirt and blue shorts, thick bold black outlines, flat cel-shaded colors, character celebrating with arms raised in front of a classic bank building, golden percentage symbol floating above, green money bills flying around, bright blue sky with white clouds, Korean internet meme comic style, ABSOLUTELY NO TEXT NO LETTERS NO WORDS NO WRITING NO SPEECH BUBBLES NO WATERMARK',
    },
    {
        name: 'diversity_test_2',
        prompt: 'Cute chibi cartoon character with oversized round white head, simple black dot eyes, small mouth, tiny body wearing yellow t-shirt and blue shorts, thick bold black outlines, flat cel-shaded colors, character celebrating with arms raised in front of a classic bank building, golden percentage symbol floating above, green money bills flying around, bright blue sky with white clouds, Korean internet meme comic style, ABSOLUTELY NO TEXT NO LETTERS NO WORDS NO WRITING NO SPEECH BUBBLES NO WATERMARK',
    },
    {
        name: 'diversity_test_3',
        prompt: 'Cute chibi cartoon character with oversized round white head, simple black dot eyes, small mouth, tiny body wearing yellow t-shirt and blue shorts, thick bold black outlines, flat cel-shaded colors, character celebrating with arms raised in front of a classic bank building, golden percentage symbol floating above, green money bills flying around, bright blue sky with white clouds, Korean internet meme comic style, ABSOLUTELY NO TEXT NO LETTERS NO WORDS NO WRITING NO SPEECH BUBBLES NO WATERMARK',
    },
];

// ═══════════════════════════════════════════════════
// DeepInfra API
// ═══════════════════════════════════════════════════
function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        if (url.startsWith('data:')) {
            const m = url.match(/^data:image\/\w+;base64,(.+)$/);
            if (m) resolve(Buffer.from(m[1], 'base64'));
            else reject(new Error('data URL parse fail'));
            return;
        }
        const proto = url.startsWith('https') ? https : require('http');
        proto.get(url, { timeout: 30000 }, (res) => {
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

function generate(tc) {
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

        console.log(`\n🎨 [${tc.name}] 생성 중...`);
        const start = Date.now();

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', async () => {
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                if (res.statusCode !== 200) {
                    console.error(`   ❌ HTTP ${res.statusCode}: ${data.substring(0, 200)}`);
                    resolve({ success: false, name: tc.name, error: `HTTP ${res.statusCode}` });
                    return;
                }
                try {
                    const result = JSON.parse(data);
                    if (!result.data || !result.data[0]) {
                        resolve({ success: false, name: tc.name, error: 'no image' });
                        return;
                    }
                    const item = result.data[0];
                    const filePath = path.join(outputDir, `${tc.name}.png`);
                    if (item.b64_json) {
                        const buf = Buffer.from(item.b64_json, 'base64');
                        fs.writeFileSync(filePath, buf);
                        console.log(`   ✅ ${(buf.length / 1024).toFixed(0)}KB, ${elapsed}s`);
                        resolve({ success: true, name: tc.name, size: buf.length, elapsed, filePath });
                    } else if (item.url) {
                        const buf = await downloadBuffer(item.url);
                        fs.writeFileSync(filePath, buf);
                        console.log(`   ✅ ${(buf.length / 1024).toFixed(0)}KB, ${elapsed}s`);
                        resolve({ success: true, name: tc.name, size: buf.length, elapsed, filePath });
                    } else {
                        resolve({ success: false, name: tc.name, error: 'format' });
                    }
                } catch (e) {
                    resolve({ success: false, name: tc.name, error: e.message });
                }
            });
        });
        req.on('error', e => resolve({ success: false, name: tc.name, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, name: tc.name, error: 'TIMEOUT' }); });
        req.write(postData);
        req.end();
    });
}

async function run() {
    console.log('═══════════════════════════════════════════');
    console.log('🎯 v3: 한국 웹툰 스타일 + 다양성 검증');
    console.log('   웹툰 2장 + 동일프롬프트 3회 반복');
    console.log('═══════════════════════════════════════════');

    const results = [];
    for (const tc of testCases) {
        results.push(await generate(tc));
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('📊 결과');
    results.forEach(r => {
        if (r.success) console.log(`  ✅ ${r.name} - ${(r.size / 1024).toFixed(0)}KB, ${r.elapsed}s`);
        else console.log(`  ❌ ${r.name} - ${r.error}`);
    });
    console.log(`\n🎯 ${results.filter(r => r.success).length}/${results.length} 성공`);
    console.log(`📁 ${outputDir}`);
}

run().catch(console.error);
