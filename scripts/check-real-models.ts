
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// .env 로드
dotenv.config({ path: path.resolve(__dirname, '.env') });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error('❌ GEMINI_API_KEY가 .env 파일에 없습니다.');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// 테스트할 모델 목록 (사용자 우려 모델 집중 테스트)
const candidateModels = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
];

async function testModel(modelName: string) {
    process.stdout.write(`Testing ${modelName.padEnd(25)} ... `);
    const start = Date.now();
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Say "Hello" if you are working.');
        const response = await result.response;
        const text = response.text();
        const duration = Date.now() - start;

        if (text) {
            console.log(`✅ OK (${duration}ms) - Response: "${text.trim()}"`);
            return true;
        } else {
            console.log('❓ Empty response');
            return false;
        }
    } catch (error: any) {
        const duration = Date.now() - start;
        if (error.message.includes('404') || error.message.includes('not found')) {
            console.log('❌ Not Found (404)');
        } else if (error.message.includes('429') || error.message.includes('quota')) {
            console.log('⚠️ Quota Exceeded (Exist but limited)');
            return true;
        } else {
            console.log(`❌ Error: ${error.message.split(']')[1] || error.message.split(':')[0]}`);
        }
        return false;
    }
}

async function run() {
    console.log('🔍 Gemini Model Availability Test');
    console.log('=================================');

    const availableModels = [];

    for (const model of candidateModels) {
        const isAvailable = await testModel(model);
        if (isAvailable) availableModels.push(model);
        // 딜레이 (Rate Limit 방지)
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n📝 Summary of Available Models:');
    availableModels.forEach(m => console.log(`- ${m}`));
}

run();
