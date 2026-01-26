/**
 * Groq API Test Script
 * Tests available Groq models to find working ones
 */
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

async function testGroq() {
    console.log('🔍 [Groq] Testing Groq API models...');

    // Load settings to get API key if exists
    const settingsPath = path.join(homedir(), 'AppData/Roaming/better-life-naver/settings.json');
    let groqApiKey = process.env.GROQ_API_KEY || '';

    try {
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            groqApiKey = settings.groqApiKey || groqApiKey;
        }
    } catch (e) {
        // ignore
    }

    if (!groqApiKey) {
        console.log('❌ Groq API Key not found. Please set GROQ_API_KEY environment variable or add groqApiKey to settings.json');
        console.log('');
        console.log('💡 Get a FREE Groq API Key at: https://console.groq.com/keys');
        process.exit(1);
    }

    console.log(`🔑 Groq API Key: ${groqApiKey.substring(0, 10)}...`);

    const groq = new OpenAI({
        apiKey: groqApiKey,
        baseURL: 'https://api.groq.com/openai/v1',
    });

    // Models to test (in priority order)
    const models = [
        'llama-3.3-70b-versatile',      // Latest Llama 3.3
        'llama-3.1-70b-versatile',      // Llama 3.1 70B
        'llama-3.1-8b-instant',         // Fast Llama 3.1 8B
        'llama3-70b-8192',              // Legacy Llama 3 70B
        'llama3-8b-8192',               // Legacy Llama 3 8B
        'mixtral-8x7b-32768',           // Mixtral
        'gemma2-9b-it',                 // Gemma 2
    ];

    let workingModels: string[] = [];

    for (const model of models) {
        process.stdout.write(`Testing [${model}] ... `);
        const start = Date.now();

        try {
            const completion = await groq.chat.completions.create({
                model: model,
                messages: [
                    { role: 'user', content: '안녕하세요, 테스트입니다. 한국어로 "성공"이라고만 답하세요.' }
                ],
                max_tokens: 50,
            });

            const text = completion.choices?.[0]?.message?.content || '';
            if (text) {
                console.log(`✅ OK! (${Date.now() - start}ms) - "${text.substring(0, 30)}..."`);
                workingModels.push(model);
            } else {
                console.log(`❌ Empty response`);
            }
        } catch (error: any) {
            const msg = error.message || '';
            if (msg.includes('rate_limit')) {
                console.log(`⚠️ Rate Limited`);
            } else if (msg.includes('404') || msg.includes('not found')) {
                console.log(`❌ Not Found (404)`);
            } else if (msg.includes('invalid_api_key') || msg.includes('401')) {
                console.log(`❌ Invalid API Key`);
                break; // No point testing other models if key is invalid
            } else {
                console.log(`❌ Error: ${msg.substring(0, 50)}`);
            }
        }
    }

    console.log('-'.repeat(50));
    if (workingModels.length > 0) {
        console.log(`🎉 Working Groq models found:`);
        workingModels.forEach((m, i) => console.log(`   ${i + 1}. ${m}`));
        console.log(`\n👉 Recommended: ${workingModels[0]} (first working model)`);
    } else {
        console.log('🚨 No working Groq models found.');
        console.log('   Please check your API key or try again later.');
    }
}

testGroq().catch(console.error);
