/**
 * Gemini 2.5 Flash Image 테스트 (새 API 키)
 * 모델: gemini-2.5-flash-image vs gemini-3-pro-image-preview
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const apiKey = 'AIzaSyAtjFG4IP1xlTSgAfQVUJI-dpOcju3KBAY';

const TESTS = [
    {
        name: '2.5 Flash - 한글 썸네일',
        model: 'gemini-2.5-flash-image',
        prompt: 'Create a Korean blog thumbnail. Include Korean text "실비보험 가입 꿀팁 5가지" prominently. Modern clean design, warm colors.'
    },
    {
        name: '2.5 Flash - 풍경',
        model: 'gemini-2.5-flash-image',
        prompt: 'Beautiful autumn Korean traditional village. Golden ginkgo trees, tile roofs. Professional photo, 8K, golden hour.'
    },
    {
        name: '3 Pro - 한글 썸네일 (비교)',
        model: 'gemini-3-pro-image-preview',
        prompt: 'Create a Korean blog thumbnail. Include Korean text "실비보험 가입 꿀팁 5가지" prominently. Modern clean design, warm colors.'
    }
];

async function testGenerate(test) {
    const start = Date.now();
    console.log(`\n${'━'.repeat(50)}`);
    console.log(`🧪 ${test.name}`);
    console.log(`📌 모델: ${test.model}`);
    console.log(`⏳ 생성 중...`);

    const postData = JSON.stringify({
        contents: [{ parts: [{ text: test.prompt }] }],
        generationConfig: {
            responseModalities: ['Text', 'Image'],
            imageConfig: { imageSize: '1K' }
        }
    });

    return new Promise((resolve) => {
        const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${test.model}:generateContent?key=${apiKey}`);
        const req = https.request({
            hostname: url.hostname, path: url.pathname + url.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
            timeout: 90000
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                try {
                    const data = JSON.parse(body);
                    if (data.error) {
                        console.log(`❌ [${data.error.code}] ${data.error.message?.substring(0, 150)}`);
                        resolve({ ok: false, name: test.name, model: test.model, elapsed, err: `${data.error.code}` });
                        return;
                    }
                    const parts = data.candidates?.[0]?.content?.parts || [];
                    for (const part of parts) {
                        if (part.inlineData?.data) {
                            const buf = Buffer.from(part.inlineData.data, 'base64');
                            const fname = `test-${test.model.replace(/[^a-z0-9]/g, '-')}-${Date.now()}.png`;
                            fs.writeFileSync(path.join(__dirname, fname), buf);
                            console.log(`✅ 성공! ${elapsed}초 | ${(buf.length / 1024).toFixed(0)}KB | ${fname}`);
                            resolve({ ok: true, name: test.name, model: test.model, elapsed, kb: (buf.length / 1024).toFixed(0), file: fname });
                            return;
                        }
                        if (part.text) console.log(`💬 ${part.text.substring(0, 80)}`);
                    }
                    resolve({ ok: false, name: test.name, model: test.model, elapsed, err: 'no-image' });
                } catch (e) {
                    resolve({ ok: false, name: test.name, model: test.model, elapsed, err: e.message });
                }
            });
        });
        req.on('error', e => resolve({ ok: false, name: test.name, model: test.model, elapsed: '?', err: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, name: test.name, model: test.model, elapsed: '90', err: 'timeout' }); });
        req.write(postData);
        req.end();
    });
}

async function main() {
    console.log('🚀 Gemini 이미지 모델 비교 테스트 (새 API 키)');
    const results = [];
    for (let i = 0; i < TESTS.length; i++) {
        const r = await testGenerate(TESTS[i]);
        results.push(r);
        if (i < TESTS.length - 1) { console.log('\n⏳ 3초 대기...'); await new Promise(r => setTimeout(r, 3000)); }
    }
    console.log(`\n${'━'.repeat(60)}`);
    console.log('📊 결과 비교');
    console.log('━'.repeat(60));
    for (const r of results) {
        const s = r.ok ? '✅' : '❌';
        const m = r.model.replace('gemini-', '').replace('-image-preview', '(3P)').replace('-image', '(2.5F)');
        console.log(`${s} ${m.padEnd(20)} | ${r.elapsed}초 | ${r.kb ? r.kb + 'KB' : r.err}`);
    }
}
main();
