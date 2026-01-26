import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

dotenv.config();

function loadApiKey(): string | null {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    try {
        const appDataPath = process.env.APPDATA || (os.platform() === 'win32'
            ? path.join(os.homedir(), 'AppData', 'Roaming')
            : os.homedir());
        const settingsPath = path.join(appDataPath, 'better-life-naver', 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            if (settings.geminiApiKey) return settings.geminiApiKey;
        }
    } catch (e) { }
    try {
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const match = content.match(/GEMINI_API_KEY\s*=\s*(.+)/);
            if (match) return match[1].trim();
        }
    } catch (e) { }
    return null;
}

const apiKey = loadApiKey();
if (!apiKey) {
    console.error('API KEY NOT FOUND');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const results: { model: string, status: string }[] = [];

async function testModel(modelName: string) {
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: "Say OK" }] }],
            generationConfig: { maxOutputTokens: 10 }
        });
        const text = (await result.response).text();
        results.push({ model: modelName, status: 'SUCCESS' });
        console.log(`✅ ${modelName}`);
    } catch (error: any) {
        results.push({ model: modelName, status: 'FAIL' });
        console.log(`❌ ${modelName}`);
    }
}

async function runTests() {
    const models = [
        // Gemini 3 Series
        'gemini-3-pro-preview',
        'gemini-3-flash-preview',
        'gemini-3-pro',
        'gemini-3-flash',
        // Gemini 2.0 Series
        'gemini-2.0-flash-exp',
        'gemini-2.0-flash',
        'gemini-2.0-pro',
        // Gemini 1.5 Series (for reference)
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        // Legacy
        'gemini-pro',
    ];

    console.log('=== Gemini Model Compatibility Test ===\n');
    for (const m of models) await testModel(m);

    console.log('\n=== SUMMARY ===');
    const working = results.filter(r => r.status === 'SUCCESS').map(r => r.model);
    console.log('Working models:', working.join(', ') || 'NONE');
}

runTests();
