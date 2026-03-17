/**
 * Imagen 4 + Gemini 3 Pro 이미지 생성 API 테스트
 * 
 * 1. Imagen 4 (imagen-4.0-generate-001) - :predict 엔드포인트
 * 2. Gemini 3 Pro (gemini-3-pro-image-preview) - :generateContent 엔드포인트
 */

import * as fs from 'fs';
import * as path from 'path';

async function getApiKey(): Promise<string> {
    // configManager에서 키 가져오기 시도
    try {
        const configModule = await import('./dist/configManager.js');
        const config = await configModule.loadConfig();
        if ((config as any).geminiApiKey) {
            return (config as any).geminiApiKey;
        }
    } catch (e) {
        // ignore
    }

    // 환경변수에서 시도
    if (process.env.GEMINI_API_KEY) {
        return process.env.GEMINI_API_KEY;
    }

    // settings.json fallback (AppData)
    const appDataPath = process.env.APPDATA || '';
    const possiblePaths = [
        path.join(appDataPath, '리더 네이버 자동화', 'settings.json'),
        path.join(appDataPath, 'leader-naver-automation', 'settings.json'),
        path.join(appDataPath, '..', 'Local', '리더 네이버 자동화', 'settings.json'),
    ];

    for (const p of possiblePaths) {
        try {
            const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (data.geminiApiKey) {
                console.log(`✅ API 키 발견: ${p}`);
                return data.geminiApiKey;
            }
        } catch (e) {
            // ignore
        }
    }

    throw new Error('API 키를 찾을 수 없습니다. GEMINI_API_KEY 환경변수를 설정하세요.');
}

async function testImagen4(apiKey: string): Promise<boolean> {
    console.log('\n' + '='.repeat(60));
    console.log('📷 테스트 1: Imagen 4 (imagen-4.0-generate-001)');
    console.log('='.repeat(60));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict`;

    const body = {
        instances: [
            { prompt: 'A friendly Korean woman in her 30s smiling warmly, natural lighting, professional portrait photography, Korean beauty, elegant casual style' }
        ],
        parameters: {
            sampleCount: 1,
            aspectRatio: '1:1'
        }
    };

    console.log(`🔗 엔드포인트: ${url}`);
    console.log(`📝 프롬프트: "${body.instances[0].prompt}"`);

    try {
        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(body),
        });

        const elapsed = Date.now() - startTime;
        console.log(`⏱ 응답 시간: ${elapsed}ms`);
        console.log(`📡 HTTP 상태: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`❌ 에러 응답:`, errorText.substring(0, 500));
            return false;
        }

        const data = await response.json() as any;

        if (data.predictions && data.predictions.length > 0) {
            const prediction = data.predictions[0];
            const imageData = prediction.bytesBase64Encoded;
            const mimeType = prediction.mimeType || 'image/png';

            if (imageData) {
                const buffer = Buffer.from(imageData, 'base64');
                const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
                const outputPath = path.join(__dirname, `test_imagen4_output.${ext}`);
                fs.writeFileSync(outputPath, buffer);

                console.log(`✅ Imagen 4 성공!`);
                console.log(`   파일: ${outputPath}`);
                console.log(`   크기: ${Math.round(buffer.length / 1024)}KB`);
                console.log(`   MIME: ${mimeType}`);
                return true;
            }
        }

        console.log(`❌ 예상 외 응답 형식:`, JSON.stringify(data).substring(0, 500));
        return false;
    } catch (error: any) {
        console.log(`❌ 네트워크 에러: ${error.message}`);
        return false;
    }
}

async function testGemini3Pro(apiKey: string): Promise<boolean> {
    console.log('\n' + '='.repeat(60));
    console.log('📷 테스트 2: Gemini 3 Pro (gemini-3-pro-image-preview)');
    console.log('='.repeat(60));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`;

    const body = {
        contents: [{
            parts: [{ text: 'Generate a photo of a friendly Korean woman in her 30s smiling warmly, natural lighting, professional portrait. Return ONLY the image, no text.' }]
        }],
        generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            responseMimeType: 'text/plain',
        }
    };

    console.log(`🔗 엔드포인트: ${url}`);

    try {
        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(body),
        });

        const elapsed = Date.now() - startTime;
        console.log(`⏱ 응답 시간: ${elapsed}ms`);
        console.log(`📡 HTTP 상태: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`❌ 에러 응답:`, errorText.substring(0, 500));
            return false;
        }

        const data = await response.json() as any;

        if (data.candidates && data.candidates[0]?.content?.parts) {
            for (const part of data.candidates[0].content.parts) {
                if (part.inlineData) {
                    const buffer = Buffer.from(part.inlineData.data, 'base64');
                    const ext = part.inlineData.mimeType?.includes('jpeg') ? 'jpg' : 'png';
                    const outputPath = path.join(__dirname, `test_gemini3pro_output.${ext}`);
                    fs.writeFileSync(outputPath, buffer);

                    console.log(`✅ Gemini 3 Pro 성공!`);
                    console.log(`   파일: ${outputPath}`);
                    console.log(`   크기: ${Math.round(buffer.length / 1024)}KB`);
                    return true;
                }
            }
        }

        console.log(`❌ 이미지 없는 응답:`, JSON.stringify(data).substring(0, 500));
        return false;
    } catch (error: any) {
        console.log(`❌ 네트워크 에러: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🚀 Imagen 4 + Gemini 3 Pro 이미지 API 테스트');
    console.log(`📅 ${new Date().toLocaleString('ko-KR')}`);

    const apiKey = await getApiKey();
    console.log(`🔑 API 키: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);

    // 테스트 1: Imagen 4
    const imagen4Ok = await testImagen4(apiKey);

    // 테스트 2: Gemini 3 Pro (나노바나나프로)
    const gemini3Ok = await testGemini3Pro(apiKey);

    // 결과 요약
    console.log('\n' + '='.repeat(60));
    console.log('📊 테스트 결과 요약');
    console.log('='.repeat(60));
    console.log(`  Imagen 4:       ${imagen4Ok ? '✅ 사용 가능' : '❌ 사용 불가'}`);
    console.log(`  Gemini 3 Pro:   ${gemini3Ok ? '✅ 사용 가능' : '❌ 사용 불가 (503?)'}`);

    if (!gemini3Ok && imagen4Ok) {
        console.log('\n💡 결론: Gemini 3 Pro(나노바나나프로)가 503이므로 Imagen 4 폴백이 유효합니다!');
    } else if (gemini3Ok) {
        console.log('\n💡 결론: Gemini 3 Pro(나노바나나프로)가 정상이므로 503이 해결된 것 같습니다!');
    } else {
        console.log('\n⚠️ 결론: 두 API 모두 사용 불가. API 키 또는 서버 상태 확인 필요.');
    }
}

main().catch(console.error);
