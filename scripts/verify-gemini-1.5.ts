
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import os from 'os';

// 앱 이름 (package.json의 name 필드 기반 유추)
// Electron 앱의 기본 userData 경로는 AppData/Roaming/<AppName> 입니다.
const APP_NAMES = ['Better Life Naver', 'better-life-naver'];

function findSettingsFile() {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

    for (const name of APP_NAMES) {
        const settingsPath = path.join(appData, name, 'settings.json');
        if (fs.existsSync(settingsPath)) {
            return settingsPath;
        }
    }
    return null;
}

function getApiKey() {
    if (process.env.GEMINI_API_KEY) {
        console.log('✅ 환경변수에서 키 발견');
        return process.env.GEMINI_API_KEY;
    }

    const settingsPath = findSettingsFile();
    if (!settingsPath) {
        console.log('⚠️ 설정 파일(settings.json)을 찾을 수 없습니다.');
        return null;
    }

    try {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        const config = JSON.parse(content);

        // configManager.ts의 로직 참조
        const key = config.geminiApiKey || config['gemini-api-key'];
        if (key) {
            console.log(`✅ 설정 파일에서 키 발견: ${settingsPath}`);
            return key;
        }
    } catch (error) {
        console.error('❌ 설정 파일 읽기 실패:', error);
    }
    return null;
}

async function runTest() {
    console.log('🔍 [Full-Scan] 생존 가능한 무료 Gemini 모델 탐색 시작...');

    const apiKey = getApiKey();
    if (!apiKey) {
        console.error('❌ API 키 없음.');
        process.exit(1);
    }

    console.log(`🔑 API Key: ${apiKey.substring(0, 10)}...`);

    const genAI = new GoogleGenerativeAI(apiKey);

    // 테스트할 후보군 (우선순위 순)
    const candidates = [
        'gemini-2.0-flash-exp', // (할당량 초과 의심)
        'gemini-1.5-flash',     // (Alias)
        'gemini-1.5-flash-001', // (Specific Version 1)
        'gemini-1.5-flash-002', // (Specific Version 2 - experimental)
        'gemini-1.5-flash-8b',  // (Lite version)
        'gemini-1.5-pro',       // (High quality)
        'gemini-pro',           // (Legacy 1.0)
        'gemini-1.0-pro'        // (Legacy 1.0 explicit)
    ];

    let foundWorkingModel = null;

    for (const modelName of candidates) {
        process.stdout.write(`Testing [${modelName}] ... `);
        const model = genAI.getGenerativeModel({ model: modelName });
        const start = Date.now();

        try {
            const result = await model.generateContent('Hi');
            const response = await result.response;
            const text = response.text();

            if (text) {
                console.log(`✅ OK! (${Date.now() - start}ms)`);
                foundWorkingModel = modelName;
                break; // 찾으면 즉시 중단
            }
        } catch (error: any) {
            const msg = error.message || '';
            if (msg.includes('429')) {
                console.log(`⚠️ Quota (429)`);
            } else if (msg.includes('404')) {
                console.log(`❌ Not Found (404)`);
            } else {
                console.log(`❌ Error: ${msg.split(']')[1] || 'Unknown'}`);
            }
        }
    }

    console.log('-'.repeat(30));
    if (foundWorkingModel) {
        console.log(`🎉 [발견] 사용 가능한 모델: "${foundWorkingModel}"`);
        console.log(`👉 설정 파일의 모델명을 위 이름으로 변경하면 즉시 사용 가능합니다.`);
    } else {
        console.log('🚨 [전멸] 모든 모델이 사용 불가합니다.');
        console.log('   - 429: 오늘 무료 사용량 소진 (내일 리셋)');
        console.log('   - 404: 권한 없음');
        console.log('💡 해결책: 새로운 구글 계정으로 API 키를 재발급 받으세요.');
    }
}
runTest();
