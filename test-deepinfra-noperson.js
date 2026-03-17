/**
 * DeepInfra 인물 편향 수정 검증 테스트
 * 3가지 시나리오:
 * 1. 일반 카테고리 (경기컬처패스) → 인물 없이 장면/피사체 중심
 * 2. NO PEOPLE 카테고리 (요리) → 음식만, 인물 없음
 * 3. 인물 필수 카테고리 (스포츠) → 한국인 인물 포함
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'YYbFgUGCfUZlqs0yCGTPF6KRY88PUCKH';

// ✅ [2026-02-20] 수정된 프롬프트 로직 반영
const STYLE_BASE = 'RAW photo, hyperrealistic, 8k uhd, shot on Canon EOS R5 with 24-70mm f/2.8 lens, cinematic color grading, volumetric lighting with soft golden hour glow, shallow depth of field with creamy bokeh background, professional studio quality, film grain, high dynamic range, magazine editorial quality, rich texture and detail, TEXTLESS';
const NO_TEXT_PREFIX = 'IMPORTANT: Generate a CLEAN image with ABSOLUTELY NEVER TEXT, NEVER LETTERS, NEVER WORDS, NEVER WRITING, NEVER CAPTIONS, NEVER SUBTITLES, NEVER WATERMARKS.';

const testCases = [
    {
        name: '1_general_culture_pass',
        description: '일반 카테고리 (경기컬처패스) - 인물 없이 피사체 중심',
        // default 카테고리 → personPrompt 없음
        prompt: `${NO_TEXT_PREFIX} Gyeonggi Culture Pass application process showing smartphone screen with app interface, High quality professional photography, cinematic lighting, rich colors, 8K UHD quality, clean composition, focus on the main subject matter, NO TEXT NO WRITING NO LETTERS, photo style: ${STYLE_BASE}, ultra detailed, natural lighting, dynamic scene composition. NEVER TEXT.`
    },
    {
        name: '2_food_no_people',
        description: 'NO PEOPLE 카테고리 (요리 맛집) - 음식만',
        prompt: `${NO_TEXT_PREFIX} Delicious Korean bibimbap in stone pot, Professional food photography, overhead flat lay, appetizing Korean cuisine close-up, warm lighting, NO PEOPLE NO HANDS, NO TEXT NO WRITING, photo style: ${STYLE_BASE}, ultra detailed, natural lighting, dynamic scene composition. NEVER TEXT.`
    },
    {
        name: '3_sports_person_required',
        description: '인물 필수 카테고리 (스포츠) - 한국인 인물 포함',
        prompt: `${NO_TEXT_PREFIX} Korean soccer player scoring a dramatic goal, Dynamic Korean athlete in action, high-speed motion capture, stadium lighting, sports magazine quality, NO TEXT NO WRITING, photo style: ${STYLE_BASE}, ultra detailed, natural lighting, dynamic scene composition. KOREAN person ONLY (NOT Western, NOT Caucasian, NOT European), authentic Korean facial features, Korean bone structure, Korean skin tone. NEVER TEXT.`
    },
    {
        name: '4_travel_landscape',
        description: 'NO PEOPLE 카테고리 (여행) - 풍경만',
        prompt: `${NO_TEXT_PREFIX} Beautiful autumn foliage at Korean temple with traditional architecture, Stunning landscape, breathtaking scenic view, golden hour lighting, NO PEOPLE, National Geographic quality, NO TEXT NO WRITING, photo style: ${STYLE_BASE}, ultra detailed, natural lighting, dynamic scene composition. NEVER TEXT.`
    }
];

const outputDir = path.join(process.env.TEMP || '.', 'deepinfra_noperson_test_' + Date.now());
fs.mkdirSync(outputDir, { recursive: true });
console.log('📁 저장 위치:', outputDir);

async function generateImage(testCase) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            prompt: testCase.prompt,
            model: 'black-forest-labs/FLUX-2-dev',
            size: '1024x1024',
            n: 1
        });

        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎨 [${testCase.name}] ${testCase.description}`);
        console.log(`📝 프롬프트 (앞 120자): ${testCase.prompt.substring(0, 120)}...`);

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
                                console.log(`✅ URL 성공! (${elapsed}초): ${imgData.url.substring(0, 60)}...`);
                                resolve({ success: true, url: imgData.url, time: elapsed });
                            }
                        }
                    } catch (e) {
                        reject(new Error('JSON 파싱 실패'));
                    }
                } else {
                    console.log(`❌ 실패 (${elapsed}초): Status ${res.statusCode}`);
                    console.log(data.substring(0, 300));
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
    console.log('🚀 DeepInfra 인물 편향 수정 검증 테스트 (4개 이미지)');
    console.log('   목표: 일반/NO PEOPLE 카테고리에서 인물 없이 생성되는지 확인');
    console.log('='.repeat(60));

    const results = [];

    for (const testCase of testCases) {
        try {
            const result = await generateImage(testCase);
            results.push({ ...testCase, ...result });
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

    console.log('\n🔍 확인 포인트:');
    console.log('   1️⃣  culture_pass: 스마트폰/앱 화면 중심, 인물 없음 ✓');
    console.log('   2️⃣  food_no_people: 비빔밥 음식 사진, 인물/손 없음 ✓');
    console.log('   3️⃣  sports_person: 한국인 축구선수, 인물 있음 ✓');
    console.log('   4️⃣  travel_landscape: 절 풍경, 인물 없음 ✓');

    if (successes.length > 0) {
        console.log(`\n📁 이미지 저장 폴더: ${outputDir}`);
        require('child_process').exec(`explorer "${outputDir}"`);
    }
}

main().catch(console.error);
