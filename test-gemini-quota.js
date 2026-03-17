/**
 * Gemini API 할당량 테스트 스크립트
 * API 키가 실제로 429를 반환하는지 직접 확인
 */
const axios = require('axios');

const API_KEY = 'AIzaSyCZRoRk9Rf_yy5DUUzNKUDNB-74NV4ohKg';
const MODEL = 'gemini-3-pro-image-preview';

async function testQuota() {
    console.log('=== Gemini API 할당량 테스트 ===');
    console.log(`API Key: ${API_KEY.substring(0, 10)}...${API_KEY.substring(API_KEY.length - 4)}`);
    console.log(`Model: ${MODEL}`);
    console.log('');

    // 1. 간단한 텍스트 요청 (이미지 생성 없이)
    console.log('[테스트 1] 텍스트 전용 요청...');
    try {
        const textRes = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
            {
                contents: [{ parts: [{ text: 'Say hello in Korean, one word only' }] }],
                generationConfig: { maxOutputTokens: 10 }
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        console.log(`  ✅ 텍스트 요청 성공! Status: ${textRes.status}`);
        const text = textRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`  응답: ${text}`);
    } catch (e) {
        console.log(`  ❌ 텍스트 요청 실패!`);
        console.log(`  Status: ${e.response?.status}`);
        console.log(`  Error: ${e.response?.data?.error?.message || e.message}`);
        console.log(`  Code: ${e.response?.data?.error?.code}`);
        console.log(`  Status text: ${e.response?.data?.error?.status}`);
        if (e.response?.status === 429) {
            console.log('\n  🔴 429 확인됨 - API 키에 할당량 문제가 있습니다!');
            // 상세 에러 정보 출력
            const errDetails = e.response?.data?.error?.details;
            if (errDetails) {
                console.log('  상세 정보:', JSON.stringify(errDetails, null, 2));
            }
        }
    }

    console.log('');

    // 2. 이미지 생성 요청
    console.log('[테스트 2] 이미지 생성 요청...');
    try {
        const imgRes = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
            {
                contents: [{ parts: [{ text: 'Generate a simple red circle on white background' }] }],
                generationConfig: {
                    responseModalities: ['Text', 'Image'],
                    imageConfig: { imageSize: '1K' }
                }
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
        );
        console.log(`  ✅ 이미지 요청 성공! Status: ${imgRes.status}`);
        const parts = imgRes.data?.candidates?.[0]?.content?.parts;
        if (parts) {
            parts.forEach((p, i) => {
                if (p.inlineData) {
                    console.log(`  Part ${i}: 이미지 데이터 (${Math.round(p.inlineData.data.length / 1024)}KB base64)`);
                } else if (p.text) {
                    console.log(`  Part ${i}: 텍스트 - ${p.text.substring(0, 100)}`);
                }
            });
        }
    } catch (e) {
        console.log(`  ❌ 이미지 요청 실패!`);
        console.log(`  Status: ${e.response?.status}`);
        console.log(`  Error: ${e.response?.data?.error?.message || e.message}`);
        console.log(`  Code: ${e.response?.data?.error?.code}`);
        console.log(`  Status text: ${e.response?.data?.error?.status}`);
        if (e.response?.status === 429) {
            console.log('\n  🔴 429 확인됨 - 이미지 생성 할당량이 소진되었습니다!');
            console.log('  → Gemini 무료 이미지 생성은 분당 제한이 매우 낮습니다 (2-5 RPM)');
            console.log('  → 해결: Google AI Studio에서 유료 등급(Pay-as-you-go) 활성화 필요');
        }
        if (e.response?.data?.error?.details) {
            console.log('  상세 정보:', JSON.stringify(e.response.data.error.details, null, 2));
        }
    }

    console.log('\n=== 테스트 완료 ===');
}

testQuota().catch(console.error);
