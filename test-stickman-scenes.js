/**
 * 졸라맨(Stickman) 스타일 이미지 생성 테스트
 * - DeepInfra FLUX-2-dev API
 * - 소제목 6개: 자영업자 고용보험 관련 블로그 글
 * - ✅ deepinfraGenerator.ts의 프롬프트 조합 구조 그대로 사용
 *   → TEXTLESS ${basePrompt}, character style: ${stickmanStyle}. SINGLE ILLUSTRATION ONLY...
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

const outputDir = path.join(__dirname, 'test-stickman-images');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// ═══════════════════════════════════════════════════
// ✅ 졸라맨 프롬프트 (imageStyles.ts 현재 버전과 동일)
// ═══════════════════════════════════════════════════
const STICKMAN_STYLE = 'cute simple character with round white circle head, dot eyes, expressive mouth, thick round limbs, wearing casual clothes, LINE Friends mascot style, bold black outlines, flat bright colors, digital illustration, character actively interacting with the scene, TEXTLESS';

// ═══════════════════════════════════════════════════
// 테스트 케이스 — 실제 블로그 소제목 6개
// basePrompt = 앱에서 Gemini가 영어로 번역한 장면 설명 (시뮬레이션)
// ═══════════════════════════════════════════════════
const testCases = [
    {
        name: '01_employment_insurance',
        heading: '자영업자 고용보험, 왜 가입해야 할까?',
        basePrompt: 'A self-employed business owner carefully reading insurance documents at a desk, thinking about financial protection, office setting with calculator and papers',
    },
    {
        name: '02_premium_support',
        heading: '보험료 최대 80% 지원',
        basePrompt: 'A happy person receiving a large discount coupon showing 80 percent off, gold coins and money savings, government support office background with bright lighting',
    },
    {
        name: '03_unemployment_benefit',
        heading: '자영업자 실업급여, 정말 받을 수 있을까?',
        basePrompt: 'A person with a question mark above their head, standing at a government service center counter, an official staff member explaining benefits with a document',
    },
    {
        name: '04_new_changes_2026',
        heading: '2026년 실업급여, 달라진 점',
        basePrompt: 'A calendar showing year 2026 with highlighted new policy changes, comparison chart showing old vs new benefits, modern infographic style scene',
    },
    {
        name: '05_government_benefits',
        heading: '정부 지원 혜택, 이렇게 활용하세요',
        basePrompt: 'A person happily using a smartphone to apply for government benefits online, checklist with green checkmarks, bright modern setting with Korean government building in background',
    },
    {
        name: '06_faq',
        heading: '사장님도 궁금증 폭발!',
        basePrompt: 'An excited small business owner with many question marks and exclamation marks floating around, standing in front of their shop, curious and energetic expression',
    },
];

// ═══════════════════════════════════════════════════
// ✅ 프롬프트 조합 (deepinfraGenerator.ts line 540과 동일 구조)
// → TEXTLESS ${basePrompt}, character style: ${stickmanStyle}. SINGLE ILLUSTRATION ONLY...
// ═══════════════════════════════════════════════════
function buildPrompt(basePrompt) {
    return `TEXTLESS ${basePrompt}, character style: ${STICKMAN_STYLE}. SINGLE ILLUSTRATION ONLY, NOT a comic strip, NEVER SPEECH BUBBLES, NEVER DIALOGUE, CLEAN IMAGE ONLY.`;
}

// ═══════════════════════════════════════════════════
// DeepInfra API 호출
// ═══════════════════════════════════════════════════
function generateImage(testCase) {
    return new Promise((resolve) => {
        const prompt = buildPrompt(testCase.basePrompt);

        const postData = JSON.stringify({
            model: 'black-forest-labs/FLUX-2-dev',
            prompt: prompt,
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

        console.log(`\n${'─'.repeat(60)}`);
        console.log(`🎨 [${testCase.name}] "${testCase.heading}"`);
        console.log(`   장면: ${testCase.basePrompt.substring(0, 80)}...`);
        console.log(`   프롬프트 길이: ${prompt.length}자`);
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

                    if (imageItem.b64_json) {
                        const buffer = Buffer.from(imageItem.b64_json, 'base64');
                        fs.writeFileSync(filePath, buffer);
                        const sizeKB = (buffer.length / 1024).toFixed(0);
                        console.log(`   ✅ 완료! ${sizeKB}KB, ${elapsed}s → ${path.basename(filePath)}`);
                        resolve({ success: true, name: testCase.name, heading: testCase.heading, size: buffer.length, elapsed, filePath });
                        return;
                    }

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
                                console.log(`   ✅ 완료! ${sizeKB}KB, ${totalElapsed}s → ${path.basename(filePath)}`);
                                resolve({ success: true, name: testCase.name, heading: testCase.heading, size: buffer.length, elapsed: totalElapsed, filePath });
                            });
                            imgRes.on('error', (err) => {
                                resolve({ success: false, name: testCase.name, error: `다운로드 실패: ${err.message}` });
                            });
                        });
                        return;
                    }

                    resolve({ success: false, name: testCase.name, error: 'URL/b64 형식 미지원' });
                } catch (e) {
                    console.error(`   ❌ 파싱 실패: ${e.message}`);
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
    console.log('🤸 졸라맨(Stickman) 스타일 이미지 생성 테스트');
    console.log('   소제목 6개 × 졸라맨 스타일');
    console.log('   프롬프트: basePrompt(장면) → character style(졸라맨)');
    console.log('═══════════════════════════════════════════');

    const results = [];
    for (const tc of testCases) {
        const result = await generateImage(tc);
        results.push(result);
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('📊 결과 요약');
    console.log('═══════════════════════════════════════════');
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);
    for (const r of successes) {
        console.log(`  ✅ ${r.name} "${r.heading}" - ${(r.size / 1024).toFixed(0)}KB, ${r.elapsed}s`);
    }
    for (const r of failures) {
        console.log(`  ❌ ${r.name} - ${r.error}`);
    }
    console.log(`\n🎯 성공: ${successes.length}/${results.length}`);
    console.log(`📁 출력: ${outputDir}`);
}

runTests().catch(console.error);
