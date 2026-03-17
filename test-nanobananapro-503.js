const fs = require('fs');
const path = require('path');

const API_KEY = 'AIzaSyAtjFG4IP1xlTSgAfQVUJI-dpOcju3KBAY';
const RESULTS_FILE = path.join(__dirname, 'test-results-503.txt');

let output = '';
function log(msg) { output += msg + '\n'; console.log(msg); }

const MODELS = [
    { name: 'NanoBananaPro', model: 'gemini-3-pro-image-preview' },
    { name: 'NanoBanana', model: 'gemini-2.5-flash-image' },
];

async function testModel({ name, model }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    log(`\n--- [${name}] (${model}) ---`);

    const body = {
        contents: [{ parts: [{ text: "Generate a simple test image: a red circle on white background" }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
    };

    const t0 = Date.now();
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(90000)
        });
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        if (!res.ok) {
            const txt = await res.text();
            let msg = '';
            try { msg = JSON.parse(txt)?.error?.message || txt.substring(0, 300); } catch { msg = txt.substring(0, 300); }
            log(`FAIL: HTTP ${res.status} (${res.statusText})`);
            log(`Time: ${elapsed}s`);
            log(`Error: ${msg}`);
            return;
        }

        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const hasImg = parts.some(p => p.inlineData);
        const hasText = parts.some(p => p.text);
        let imgKB = 0;
        if (hasImg) {
            const d = parts.find(p => p.inlineData);
            imgKB = Math.round(Buffer.from(d.inlineData.data, 'base64').length / 1024);
        }
        log(`OK: HTTP 200`);
        log(`Time: ${elapsed}s`);
        log(`Image: ${hasImg ? 'YES (' + imgKB + 'KB)' : 'NO'}`);
        log(`Text: ${hasText ? 'YES' : 'NO'}`);
    } catch (err) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        log(`ERROR: ${err.message} [${elapsed}s]`);
    }
}

async function main() {
    log('=== Nano Banana Pro 503 Test ===');
    log(`Date: ${new Date().toISOString()}`);
    log(`API Key: ${API_KEY.substring(0, 12)}... (${API_KEY.length} chars)`);

    for (const m of MODELS) {
        await testModel(m);
        await new Promise(r => setTimeout(r, 2000));
    }

    log('\n=== DONE ===');
    fs.writeFileSync(RESULTS_FILE, output, 'utf8');
}

main().catch(e => { log(`Fatal: ${e.message}`); fs.writeFileSync(RESULTS_FILE, output, 'utf8'); });
