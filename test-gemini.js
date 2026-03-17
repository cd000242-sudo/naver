const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.APPDATA, 'better-life-naver', 'settings.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const key = config.geminiApiKey;
if (!key) { console.log('NO KEY'); process.exit(1); }

async function test(name) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + name + ':generateContent?key=' + key;
    const start = Date.now();
    try {
        const controller = new AbortController();
        const timer = setTimeout(function () { controller.abort(); }, 30000);
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'A cute cat on a table' }] }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
            })
        });
        clearTimeout(timer);
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const txt = await r.text();
        let result = '';
        try {
            const j = JSON.parse(txt);
            if (j.error) result = j.error.status;
            else if (j.candidates) {
                const parts = j.candidates[0].content.parts;
                const img = parts.find(function (p) { return p.inlineData; });
                result = img ? 'OK (' + Math.round(img.inlineData.data.length / 1024) + 'KB)' : 'TEXT_ONLY';
            }
        } catch (e) { result = 'PARSE_ERR'; }
        console.log(r.status + ' | ' + elapsed + 's | ' + name + ' | ' + result);
    } catch (e) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log('ERR | ' + elapsed + 's | ' + name + ' | ' + e.message);
    }
}

(async function () {
    console.log('STATUS | TIME | MODEL | RESULT');
    console.log('---');
    await test('gemini-3-pro-image-preview');
    await test('imagen-4.0-generate-001');
    console.log('---\nDone');
})();
