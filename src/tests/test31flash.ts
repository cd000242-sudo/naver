/**
 * gemini-3.1-flash-image-preview 이미지 생성 테스트
 * 실행: npx ts-node src/tests/test31flash.ts
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

async function test31Flash() {
    // API 키 로드 (여러 경로에서 시도)
    let apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
        const appData = process.env.APPDATA || '';
        const configPaths = [
            path.join(appData, 'leword', 'settings.json'),
            path.join(appData, 'leword', 'config.json'),
            path.join(appData, 'Electron', 'settings.json'),
            path.join(appData, 'better-life-naver', 'settings.json'),
            path.join(appData, 'blogger-gpt-cli', 'config.json'),
            path.join(appData, 'naver-blog-automation', 'settings.json'),
            path.join(appData, 'blog-automation-premium', 'settings.json'),
        ];
        for (const cp of configPaths) {
            try {
                const config = JSON.parse(fs.readFileSync(cp, 'utf-8'));
                if (config.geminiApiKey && config.geminiApiKey.trim().length > 5) {
                    apiKey = config.geminiApiKey.trim();
                    console.log(`📂 키 로드: ${path.basename(path.dirname(cp))}/${path.basename(cp)}`);
                    break;
                }
            } catch (e) { /* ignore */ }
        }
    }

    if (!apiKey) {
        console.error('❌ Gemini API 키가 없습니다.');
        return;
    }

    console.log(`\n🔑 API 키: ${apiKey.substring(0, 15)}...`);
    console.log(`⏰ ${new Date().toLocaleString('ko-KR')}\n`);

    const model = 'gemini-3.1-flash-image-preview';
    const prompt = 'Generate a beautiful image of a cozy Korean cafe interior with warm lighting. Photorealistic style, 8K UHD quality.';

    console.log(`📡 모델: ${model}`);
    console.log(`📝 프롬프트: ${prompt.substring(0, 60)}...`);
    console.log('─'.repeat(50));

    try {
        const startTime = Date.now();

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
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

        const candidates = response.data?.candidates;
        if (candidates?.[0]?.content?.parts) {
            let imageFound = false;
            for (const part of candidates[0].content.parts) {
                if (part.inlineData?.data) {
                    const buffer = Buffer.from(part.inlineData.data, 'base64');
                    const sizeKB = Math.round(buffer.length / 1024);
                    console.log(`✅ 이미지 생성 성공! (${elapsed}초, ${sizeKB}KB)`);

                    // 이미지 저장
                    const ext = (part.inlineData.mimeType || '').includes('jpeg') ? 'jpg' : 'png';
                    const outputPath = path.join(__dirname, `test_31flash_result.${ext}`);
                    fs.writeFileSync(outputPath, buffer);
                    console.log(`📁 저장: ${outputPath}`);
                    imageFound = true;
                    break;
                }
                if (part.text) {
                    console.log(`📝 텍스트 응답: ${part.text.substring(0, 200)}`);
                }
            }
            if (!imageFound) {
                console.log(`⚠️ 텍스트만 응답됨, 이미지 없음 (${elapsed}초)`);
            }
        } else {
            console.log(`⚠️ 응답 없음 (${elapsed}초)`);
            console.log('   finishReason:', candidates?.[0]?.finishReason);
            console.log('   blockReason:', response.data?.promptFeedback?.blockReason);
            console.log('   응답:', JSON.stringify(response.data).substring(0, 300));
        }

    } catch (error: any) {
        const status = error.response?.status || 'N/A';
        const message = error.response?.data?.error?.message || error.message;
        console.log(`\n❌ 에러 (${status}): ${message}`);

        if (status === 404) {
            console.log('   → 모델이 존재하지 않습니다. 모델명을 확인하세요.');
        } else if (status === 503) {
            console.log('   → 서버 과부하. 잠시 후 재시도하세요.');
        } else if (status === 429) {
            console.log('   → 할당량 초과. API 키를 확인하세요.');
        }
    }

    console.log('\n' + '═'.repeat(50));
    console.log('테스트 완료');
}

test31Flash().catch(console.error);
