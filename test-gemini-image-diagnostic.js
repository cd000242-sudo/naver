/**
 * Gemini 이미지 API 심층 진단 테스트
 * 목적: NanoBananaPro 이미지 생성 실패 원인 파악
 * - 각 이미지 모델 엔드포인트 직접 호출
 * - 에러 응답 상세 분석
 * - 할당량/권한/서버 상태 확인
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// config.json에서 API 키 로드 (여러 경로 시도)
const searchPaths = [
    path.join(process.env.APPDATA || '', 'config.json'),              // 개발 모드: APPDATA/Roaming/config.json
    path.join(process.env.APPDATA || '', 'Electron', 'config.json'),   // Electron dev
    path.join(process.env.APPDATA || '', 'better-life-naver', 'config.json'),  // 프로덕션
    path.join(require('os').homedir(), '.leword', 'config.json'),      // 레거시
];

let apiKey = '';
let loadedConfig = null;

for (const cp of searchPaths) {
    try {
        const config = JSON.parse(fs.readFileSync(cp, 'utf8'));
        const key = config.geminiApiKey || config['gemini-api-key'] || '';
        if (key) {
            apiKey = key;
            loadedConfig = config;
            console.log(`✅ config.json 로드: ${cp}`);
            console.log(`🔑 API 키: ${apiKey.substring(0, 15)}...`);
            console.log(`📋 이미지 모델: Main="${config.nanoBananaMainModel || '(미설정→gemini-2.5-flash)'}", Sub="${config.nanoBananaSubModel || '(미설정→gemini-2.5-flash)'}"`);
            console.log(`📋 플랜: ${config.geminiPlanType || '(미설정)'}`);
            console.log('');
            break;
        }
    } catch (e) {
        // 해당 경로에 없으면 다음 시도
    }
}

if (!apiKey) {
    console.error('❌ API 키를 찾을 수 없습니다!');
    process.exit(1);
}

// 테스트할 모델 목록
const MODELS_TO_TEST = [
    {
        name: 'gemini-2.5-flash-image',
        label: '⚡ Gemini 2.5 Flash (가성비 기본)',
        type: 'gemini'  // generateContent API
    },
    {
        name: 'gemini-2.0-flash-exp-image-generation',
        label: '🆓 Gemini 2.0 Flash Exp (무료)',
        type: 'gemini'
    },
    {
        name: 'gemini-3-pro-image-preview',
        label: '🏆 Gemini 3 Pro (고품질)',
        type: 'gemini'
    },
    {
        name: 'imagen-4.0-generate-001',
        label: '🖼️ Imagen 4 (폴백)',
        type: 'imagen'  // predict API
    },
];

const SIMPLE_PROMPT = 'A beautiful sunset over a calm ocean, digital art style, vibrant colors';

/**
 * Gemini generateContent API 호출
 */
function testGeminiModel(model, prompt) {
    return new Promise((resolve) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const body = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseModalities: ['Text', 'Image'],
                imageConfig: { imageSize: '1K' }
            }
        });

        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 60000
        };

        const startTime = Date.now();

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const elapsed = Date.now() - startTime;
                try {
                    const json = JSON.parse(data);

                    if (res.statusCode === 200) {
                        // 성공 응답 분석
                        const candidates = json.candidates;
                        const hasImage = candidates?.[0]?.content?.parts?.some(p => p.inlineData);
                        const hasText = candidates?.[0]?.content?.parts?.some(p => p.text);
                        const finishReason = candidates?.[0]?.finishReason;
                        const blockReason = json.promptFeedback?.blockReason;

                        resolve({
                            success: hasImage,
                            status: res.statusCode,
                            elapsed,
                            hasImage,
                            hasText,
                            finishReason,
                            blockReason,
                            imageSize: hasImage ?
                                Math.round(candidates[0].content.parts.find(p => p.inlineData)?.inlineData?.data?.length / 1024) + 'KB (base64)' :
                                null,
                            error: hasImage ? null : 'No image in response',
                            rawUsage: json.usageMetadata
                        });
                    } else {
                        // 에러 응답
                        resolve({
                            success: false,
                            status: res.statusCode,
                            elapsed,
                            error: json.error?.message || JSON.stringify(json).substring(0, 300),
                            errorCode: json.error?.code,
                            errorStatus: json.error?.status,
                            errorDetails: json.error?.details?.map(d => d.reason || d['@type'])?.join(', '),
                            headers: {
                                'retry-after': res.headers['retry-after'],
                                'x-ratelimit-remaining': res.headers['x-ratelimit-remaining'],
                                'x-ratelimit-limit': res.headers['x-ratelimit-limit'],
                            }
                        });
                    }
                } catch (parseErr) {
                    resolve({
                        success: false,
                        status: res.statusCode,
                        elapsed,
                        error: `JSON 파싱 실패: ${data.substring(0, 200)}`
                    });
                }
            });
        });

        req.on('error', (err) => {
            resolve({
                success: false,
                status: 0,
                elapsed: Date.now() - startTime,
                error: `네트워크 에러: ${err.message}`
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                success: false,
                status: 0,
                elapsed: Date.now() - startTime,
                error: '타임아웃 (60초)'
            });
        });

        req.write(body);
        req.end();
    });
}

/**
 * Imagen predict API 호출
 */
function testImagenModel(model, prompt) {
    return new Promise((resolve) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;

        const body = JSON.stringify({
            instances: [{ prompt }],
            parameters: {
                sampleCount: 1,
                aspectRatio: '1:1'
            }
        });

        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 60000
        };

        const startTime = Date.now();

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const elapsed = Date.now() - startTime;
                try {
                    const json = JSON.parse(data);

                    if (res.statusCode === 200) {
                        const hasImage = json.predictions?.[0]?.bytesBase64Encoded;
                        resolve({
                            success: !!hasImage,
                            status: res.statusCode,
                            elapsed,
                            hasImage: !!hasImage,
                            imageSize: hasImage ? Math.round(hasImage.length / 1024) + 'KB (base64)' : null,
                            error: hasImage ? null : 'No image in response'
                        });
                    } else {
                        resolve({
                            success: false,
                            status: res.statusCode,
                            elapsed,
                            error: json.error?.message || JSON.stringify(json).substring(0, 300),
                            errorCode: json.error?.code,
                            errorStatus: json.error?.status,
                        });
                    }
                } catch (parseErr) {
                    resolve({
                        success: false,
                        status: res.statusCode,
                        elapsed,
                        error: `JSON 파싱 실패: ${data.substring(0, 200)}`
                    });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ success: false, status: 0, elapsed: Date.now() - startTime, error: `네트워크: ${err.message}` });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, status: 0, elapsed: Date.now() - startTime, error: '타임아웃 (60초)' });
        });

        req.write(body);
        req.end();
    });
}

/**
 * 모델 목록 조회 (사용 가능한 모델 확인)
 */
function listAvailableModels() {
    return new Promise((resolve) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const urlObj = new URL(url);

        const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.models) {
                        // 이미지 관련 모델만 필터
                        const imageModels = json.models.filter(m =>
                            m.name.includes('image') ||
                            m.name.includes('imagen') ||
                            m.supportedGenerationMethods?.includes('generateImages')
                        );
                        resolve({ success: true, total: json.models.length, imageModels });
                    } else {
                        resolve({ success: false, error: json.error?.message || 'Unknown' });
                    }
                } catch (e) {
                    resolve({ success: false, error: e.message });
                }
            });
        });
        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout' }); });
        req.end();
    });
}

// ===== 메인 실행 =====
async function main() {
    console.log('='.repeat(70));
    console.log('🔬 Gemini 이미지 API 심층 진단');
    console.log(`📅 시간: ${new Date().toLocaleString('ko-KR')}`);
    console.log(`🔑 API 키: ${apiKey.substring(0, 15)}...${apiKey.substring(apiKey.length - 5)}`);
    console.log('='.repeat(70));
    console.log('');

    // Step 1: 사용 가능한 모델 목록 확인
    console.log('📋 Step 1: 사용 가능한 이미지 모델 확인...');
    const modelList = await listAvailableModels();
    if (modelList.success) {
        console.log(`   총 ${modelList.total}개 모델 중 이미지 관련 ${modelList.imageModels.length}개:`);
        modelList.imageModels.forEach(m => {
            console.log(`   - ${m.name} (${m.supportedGenerationMethods?.join(', ')})`);
        });
    } else {
        console.log(`   ❌ 모델 목록 조회 실패: ${modelList.error}`);
    }
    console.log('');

    // Step 2: 각 모델 직접 테스트
    console.log('🧪 Step 2: 각 이미지 모델 직접 호출 테스트');
    console.log(`   프롬프트: "${SIMPLE_PROMPT}"`);
    console.log('');

    const results = [];

    for (const modelInfo of MODELS_TO_TEST) {
        console.log(`   ⏳ ${modelInfo.label} (${modelInfo.name}) 테스트 중...`);

        let result;
        if (modelInfo.type === 'imagen') {
            result = await testImagenModel(modelInfo.name, SIMPLE_PROMPT);
        } else {
            result = await testGeminiModel(modelInfo.name, SIMPLE_PROMPT);
        }

        results.push({ ...modelInfo, result });

        if (result.success) {
            console.log(`   ✅ 성공! (${result.elapsed}ms, 이미지: ${result.imageSize})`);
        } else {
            console.log(`   ❌ 실패! (${result.elapsed}ms)`);
            console.log(`      HTTP ${result.status} — ${result.error}`);
            if (result.errorCode) console.log(`      에러 코드: ${result.errorCode} (${result.errorStatus})`);
            if (result.errorDetails) console.log(`      상세: ${result.errorDetails}`);
            if (result.headers) {
                const rh = result.headers;
                if (rh['retry-after']) console.log(`      Retry-After: ${rh['retry-after']}초`);
                if (rh['x-ratelimit-remaining']) console.log(`      남은 할당량: ${rh['x-ratelimit-remaining']}/${rh['x-ratelimit-limit']}`);
            }
            if (result.finishReason) console.log(`      finishReason: ${result.finishReason}`);
            if (result.blockReason) console.log(`      blockReason: ${result.blockReason}`);
        }
        console.log('');
    }

    // Step 3: 결과 요약
    console.log('='.repeat(70));
    console.log('📊 진단 결과 요약');
    console.log('='.repeat(70));

    const successCount = results.filter(r => r.result.success).length;
    const failCount = results.filter(r => !r.result.success).length;

    console.log(`   성공: ${successCount}개 / 실패: ${failCount}개`);
    console.log('');

    results.forEach(r => {
        const icon = r.result.success ? '✅' : '❌';
        const detail = r.result.success ?
            `${r.result.elapsed}ms, ${r.result.imageSize}` :
            `HTTP ${r.result.status}: ${r.result.error?.substring(0, 80)}`;
        console.log(`   ${icon} ${r.label}: ${detail}`);
    });

    console.log('');

    // 진단 분석
    if (successCount === 0) {
        const allQuota = results.every(r => r.result.status === 429);
        const allServer = results.every(r => r.result.status === 503 || r.result.status === 500);
        const allAuth = results.every(r => r.result.status === 401 || r.result.status === 403);
        const allNotFound = results.every(r => r.result.status === 404);

        if (allQuota) {
            console.log('   🔴 결론: 모든 모델에서 할당량 초과 (429)');
            console.log('   → Google Cloud Console에서 Generative Language API 할당량 확인 필요');
            console.log('   → 유료 플랜 확인: https://aistudio.google.com/app/plan');
        } else if (allServer) {
            console.log('   🔴 결론: Gemini 이미지 서버 장애 (503/500)');
            console.log('   → Google 측 서버 문제 - 시간을 두고 재시도 필요');
            console.log('   → 상태 확인: https://status.cloud.google.com/');
        } else if (allAuth) {
            console.log('   🔴 결론: API 키 인증 실패 (401/403)');
            console.log('   → API 키가 이미지 생성 권한이 있는지 확인 필요');
            console.log('   → Google AI Studio에서 새 키 발급 권장');
        } else if (allNotFound) {
            console.log('   🔴 결론: 모델을 찾을 수 없음 (404)');
            console.log('   → 모델명이 변경되었거나 해당 리전에서 사용 불가');
        } else {
            console.log('   🔴 결론: 복합적 오류 — 각 모델별 에러 확인 필요');
        }
    } else if (failCount > 0) {
        console.log(`   🟡 결론: 일부 모델만 동작 (${successCount}/${results.length})`);
        const workingModels = results.filter(r => r.result.success).map(r => r.name);
        console.log(`   → 작동 중인 모델: ${workingModels.join(', ')}`);
        console.log('   → 앱 설정에서 작동하는 모델로 변경하면 해결됨');
    } else {
        console.log('   🟢 결론: 모든 모델 정상 작동!');
        console.log('   → API 서버 문제 아님 → 앱 코드 쪽 문제 가능성 높음');
    }

    console.log('');
    console.log('='.repeat(70));
}

main().catch(err => {
    console.error('❌ 진단 실패:', err);
});
