/**
 * NanoBananaPro (Gemini 3 Pro) 이미지 생성 테스트 v3
 * - Gemini 3 Pro: :generateContent endpoint
 * - Imagen 4 (fallback): :predict endpoint, x-goog-api-key header
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const logLines = [];
function log(msg) { logLines.push(msg); console.log(msg); }
function flushLog() {
    fs.writeFileSync(path.join(__dirname, 'test-nbp-result.txt'), logLines.join('\n'), 'utf-8');
}

const API_KEY = 'AIzaSyAtjFG4IP1xlTSgAfQVUJI-dpOcju3KBAY';

async function testGemini3Pro() {
    log('[TEST 1] Gemini 3 Pro Image Preview (:generateContent)');
    const model = 'gemini-3-pro-image-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    const prompt = 'Hyper-realistic professional photography. A beautiful spring cherry blossom park in Korea, warm sunlight, families enjoying picnic. NO TEXT NO WATERMARK';

    const start = Date.now();
    try {
        const res = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseModalities: ['Text', 'Image'],
                imageConfig: { imageSize: '1K', aspectRatio: '1:1' }
            }
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 });

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const parts = res.data?.candidates?.[0]?.content?.parts || [];

        for (const p of parts) {
            if (p.inlineData && p.inlineData.data) {
                const buf = Buffer.from(p.inlineData.data, 'base64');
                const out = path.join(__dirname, 'test-nbp-gemini3.png');
                fs.writeFileSync(out, buf);
                log(`[OK] Gemini 3 Pro success! ${elapsed}s, ${Math.round(buf.length / 1024)}KB`);
                log(`[SAVED] ${out}`);
                return true;
            }
            if (p.text) log(`[TEXT] ${p.text.substring(0, 200)}`);
        }
        log(`[FAIL] No image in response (${elapsed}s)`);
        return false;
    } catch (e) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const status = e.response?.status;
        const msg = e.response?.data?.error?.message || e.message;
        log(`[ERROR] ${status || 'N/A'} (${elapsed}s): ${msg.substring(0, 300)}`);
        if (status === 429) log('[INFO] 429 = quota exceeded. Wait and retry or use different key.');
        if (status === 503) log('[INFO] 503 = server overloaded. Imagen 4 fallback recommended.');
        return false;
    }
}

async function testImagen4() {
    log('\n[TEST 2] Imagen 4 Fallback (:predict with x-goog-api-key)');
    const model = 'imagen-4.0-generate-001';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;
    const prompt = 'A beautiful spring cherry blossom park in Korea, warm sunlight filtering through pink petals, professional photography';

    const start = Date.now();
    try {
        const res = await axios.post(url, {
            instances: [{ prompt }],
            parameters: {
                sampleCount: 1,
                aspectRatio: '1:1',
                personGeneration: 'allow_adult'
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': API_KEY
            },
            timeout: 60000
        });

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const predictions = res.data?.predictions;

        if (predictions && predictions.length > 0 && predictions[0].bytesBase64Encoded) {
            const buf = Buffer.from(predictions[0].bytesBase64Encoded, 'base64');
            const out = path.join(__dirname, 'test-nbp-imagen4.png');
            fs.writeFileSync(out, buf);
            log(`[OK] Imagen 4 success! ${elapsed}s, ${Math.round(buf.length / 1024)}KB`);
            log(`[SAVED] ${out}`);
            return true;
        }
        log(`[FAIL] No image in Imagen 4 response (${elapsed}s)`);
        log(`[DEBUG] response: ${JSON.stringify(res.data).substring(0, 300)}`);
        return false;
    } catch (e) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const status = e.response?.status;
        const msg = e.response?.data?.error?.message || e.message;
        log(`[ERROR] ${status || 'N/A'} (${elapsed}s): ${msg.substring(0, 300)}`);
        return false;
    }
}

async function main() {
    log('=== NanoBananaPro Test v3 ===');
    log(`API Key: ${API_KEY.substring(0, 10)}...`);
    log(`Time: ${new Date().toISOString()}\n`);

    // Gemini 3 Pro test
    const r1 = await testGemini3Pro();

    // 1s pause between tests
    await new Promise(r => setTimeout(r, 1000));

    // Imagen 4 fallback test
    const r2 = await testImagen4();

    log('\n=== Results ===');
    log(`Gemini 3 Pro: ${r1 ? 'PASS' : 'FAIL'}`);
    log(`Imagen 4:     ${r2 ? 'PASS' : 'FAIL'}`);
    log(`Overall:      ${r1 || r2 ? 'AT LEAST ONE PASS' : 'ALL FAILED'}`);

    flushLog();
    log('\nLog: test-nbp-result.txt');

    // Open generated images
    if (r1) require('child_process').exec(`start "" "${path.join(__dirname, 'test-nbp-gemini3.png')}"`);
    if (r2) require('child_process').exec(`start "" "${path.join(__dirname, 'test-nbp-imagen4.png')}"`);
}

main().catch(e => { log('FATAL: ' + e.message); flushLog(); });
