/**
 * Gemini 이미지 생성 테스트 스크립트
 * 실행: npx ts-node src/tests/testGeminiImage.ts
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

async function testGeminiImageGeneration() {
    // API 키 로드 시도
    let apiKey = process.env.GEMINI_API_KEY || '';

    // 환경변수 없으면 leword config에서 시도
    if (!apiKey) {
        try {
            const configPath = path.join(process.env.APPDATA || '', 'leword', 'config.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            apiKey = config.geminiApiKey || '';
        } catch (e) {
            // ignore
        }
    }

    if (!apiKey) {
        console.error('❌ Gemini API 키가 설정되지 않았습니다.');
        console.log('💡 환경변수로 설정: set GEMINI_API_KEY=your_api_key');
        return;
    }

    console.log(`\n🔑 API 키: ${apiKey.substring(0, 15)}...`);
    console.log(`⏰ 테스트 시간: ${new Date().toLocaleString('ko-KR')}\n`);

    // 테스트할 모델들
    const models = [
        'gemini-3-pro-image-preview',
        'gemini-2.5-flash-image',
        'gemini-2.0-flash-exp'
    ];

    const testPrompt = 'Generate a simple image of a cute orange cat sitting on a white background. The cat should be looking at the camera. Photorealistic style.';

    for (const model of models) {
        console.log(`\n📡 테스트 중: ${model}`);
        console.log('─'.repeat(50));

        try {
            const startTime = Date.now();

            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    contents: [{ parts: [{ text: testPrompt }] }],
                    generationConfig: {
                        responseModalities: ['Text', 'Image'],
                        imageConfig: { imageSize: '1K' }
                    }
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60000
                }
            );

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            // 응답 확인
            const candidates = response.data?.candidates;
            if (candidates?.[0]?.content?.parts) {
                for (const part of candidates[0].content.parts) {
                    if (part.inlineData?.data) {
                        const buffer = Buffer.from(part.inlineData.data, 'base64');
                        const sizeKB = Math.round(buffer.length / 1024);
                        console.log(`✅ 성공! (${elapsed}초, ${sizeKB}KB)`);

                        // 이미지 저장
                        const outputPath = path.join(__dirname, `test_${model.replace(/[^a-z0-9]/gi, '_')}.png`);
                        fs.writeFileSync(outputPath, buffer);
                        console.log(`   📁 저장됨: ${outputPath}`);
                        break;
                    }
                }
            } else {
                console.log(`⚠️ 응답에 이미지 없음 (${elapsed}초)`);
                console.log('   응답:', JSON.stringify(response.data).substring(0, 200));
            }

        } catch (error: any) {
            const status = error.response?.status || 'N/A';
            const message = error.response?.data?.error?.message || error.message;

            if (status === 503) {
                console.log(`❌ 503 Service Unavailable - 서버 과부하`);
            } else if (status === 429) {
                console.log(`❌ 429 Rate Limit - 할당량 초과`);
            } else if (status === 400) {
                console.log(`❌ 400 Bad Request - 모델이 이미지 생성을 지원하지 않음`);
            } else {
                console.log(`❌ 에러 (${status}): ${message}`);
            }
        }

        // 다음 모델 테스트 전 잠시 대기
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n' + '═'.repeat(50));
    console.log('테스트 완료');
}

testGeminiImageGeneration().catch(console.error);
