/**
 * Gemini 2.5 Flash 테스트 스크립트
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    // API 키 로드
    const homeDir = process.env.APPDATA || '';
    const configPath = path.join(homeDir, 'better-life-naver', 'settings.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const apiKey = config.geminiApiKey;

    console.log('API 키 발견:', apiKey ? '있음' : '없음');

    const client = new GoogleGenerativeAI(apiKey);

    // 테스트 모델
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];

    for (const modelName of models) {
        console.log('\n--- 테스트:', modelName, '---');

        try {
            const model = client.getGenerativeModel({ model: modelName });
            const start = Date.now();

            const result = await model.generateContent('안녕하세요! 짧게 자기소개해주세요.');
            const text = result.response.text();
            const elapsed = Date.now() - start;

            console.log('성공!', elapsed + 'ms');
            console.log('응답:', text.substring(0, 80) + '...');
        } catch (err: any) {
            console.log('실패:', err.message);
            if (err.message.includes('404')) {
                console.log('-> 모델 없음 또는 접근 불가');
            }
        }
    }

    console.log('\n테스트 완료!');
}

main();
