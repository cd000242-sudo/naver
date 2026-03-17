/**
 * Gemini 3 이미지 생성 테스트 (새 API 키)
 */
const fs = require('fs');
const path = require('path');

// 새 API 키 직접 사용
const apiKey = 'AIzaSyCZRoRk9Rf_yy5DUUzNKUDNB-74NV4ohKg';

async function test() {
    console.log('🚀 새 API 키로 Gemini 3 테스트...');
    console.log('⏳ 생성 중... (30초~1분 소요)');

    const startTime = Date.now();

    try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-3-pro-image-preview',
            generationConfig: { responseModalities: ['Text', 'Image'] }
        });

        const result = await model.generateContent('Generate a simple Korean blog thumbnail about 실비보험 with Korean text overlay');
        const response = result.response;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log(`⏱️ 응답 시간: ${elapsed}초`);

        if (response.candidates && response.candidates[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const imageData = Buffer.from(part.inlineData.data, 'base64');
                    const outputPath = path.join(__dirname, 'test-gemini-output.png');
                    fs.writeFileSync(outputPath, imageData);
                    console.log('✅ 이미지 생성 성공!');
                    console.log('📁 저장:', outputPath);
                    console.log('📐 크기:', (imageData.length / 1024).toFixed(1), 'KB');
                    return;
                }
                if (part.text) {
                    console.log('📝 텍스트:', part.text.substring(0, 100));
                }
            }
        }
        console.log('⚠️ 이미지 없음');
        console.log(JSON.stringify(response, null, 2).substring(0, 500));
    } catch (e) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`❌ 에러 (${elapsed}초):`, e.message.substring(0, 300));

        if (e.message.includes('503')) {
            console.log('\n⚠️ 503 에러: 서버 불안정');
        } else if (e.message.includes('429')) {
            console.log('\n⚠️ 429 에러: Rate Limit (잠시 후 재시도)');
        }
    }
}

test();
