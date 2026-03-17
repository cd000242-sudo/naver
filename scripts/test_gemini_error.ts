/**
 * Gemini 이미지 생성 에러 테스트 (임시)
 * 현재 API 상태를 빠르게 확인
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function loadApiKey(): string | null {
    try {
        const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        const settingsPath = path.join(appDataPath, 'better-life-naver', 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            if (settings.geminiApiKey) return settings.geminiApiKey;
        }
    } catch (e) { }
    return process.env.GEMINI_API_KEY || null;
}

async function testGeminiImage() {
    const apiKey = loadApiKey();
    if (!apiKey) {
        console.error('API KEY NOT FOUND');
        return;
    }
    console.log('KEY: ' + apiKey.substring(0, 15) + '...');
    console.log('TIME: ' + new Date().toISOString());

    const models = [
        'gemini-2.0-flash-exp',
        'gemini-2.0-flash-preview-image-generation',
    ];

    const testPrompt = 'Generate a simple photograph of a coffee cup on a wooden table. Warm lighting. Photorealistic.';

    for (const model of models) {
        console.log('\n--- MODEL: ' + model + ' ---');

        try {
            const startTime = Date.now();
            const response = await axios.post(
                'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey,
                {
                    contents: [{ parts: [{ text: testPrompt }] }],
                    generationConfig: {
                        responseModalities: ['Text', 'Image'],
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
                let hasImage = false;
                for (const part of candidates[0].content.parts) {
                    if (part.inlineData?.data) {
                        const buffer = Buffer.from(part.inlineData.data, 'base64');
                        const sizeKB = Math.round(buffer.length / 1024);
                        const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
                        const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
                        const format = isPNG ? 'PNG' : isJPEG ? 'JPEG' : 'OTHER';
                        console.log('OK! ' + elapsed + 's, ' + sizeKB + 'KB, ' + format);
                        hasImage = true;
                        break;
                    }
                }
                if (!hasImage) {
                    const textPart = candidates[0].content.parts.find((p: any) => p.text);
                    console.log('NO IMAGE, TEXT ONLY (' + elapsed + 's)');
                    if (textPart) console.log('TEXT: ' + textPart.text.substring(0, 100));
                }
            } else {
                console.log('NO CANDIDATES (' + elapsed + 's)');
                console.log('DATA: ' + JSON.stringify(response.data).substring(0, 300));
            }

        } catch (error: any) {
            const status = error.response?.status || 'N/A';
            const errMsg = error.response?.data?.error?.message || error.message;
            console.log('ERROR HTTP ' + status);
            console.log('MSG: ' + (errMsg || '').substring(0, 200));

            if (status === 429) console.log('-> QUOTA EXCEEDED');
            else if (status === 503) console.log('-> SERVER OVERLOAD');
            else if (status === 400) console.log('-> BAD REQUEST');
            else if (status === 401 || status === 403) console.log('-> AUTH ERROR');
            else if (status === 500) console.log('-> SERVER ERROR');
        }

        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n=== DONE ===');
}

testGeminiImage().catch(console.error);
