/**
 * gemini-2.0-flash-exp-image-generation 실험 모델 테스트
 * 무료 한도 확인 + 한글 텍스트 품질 테스트
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const apiKey = 'AIzaSyAtjFG4IP1xlTSgAfQVUJI-dpOcju3KBAY';

const TESTS = [
    {
        name: '2.0 Flash Exp - 한글 썸네일',
        model: 'gemini-2.0-flash-exp-image-generation',
        prompt: 'Create a Korean blog thumbnail. Include Korean text "실비보험 가입 꿀팁 5가지" prominently. Modern clean design, warm colors.'
    },
    {
        name: '2.0 Flash Exp - 풍경',
        model: 'gemini-2.0-flash-exp-image-generation',
        prompt: 'Beautiful autumn Korean traditional village. Golden ginkgo trees, tile roofs. Professional photo, golden hour.'
    },
    {
        name: '2.5 Flash - 한글 썸네일 (비교)',
        model: 'gemini-2.5-flash-image',
        prompt: 'Create a Korean blog thumbnail. Include Korean text "실비보험 가입 꿀팁 5가지" prominently. Modern clean design, warm colors.'
    }
];

async function testGenerate(test) {
    const start = Date.now();
    console.log(`\n${'━'.repeat(50)}`);
    console.log(`🧪 ${test.name}`);
    console.log(`📌 ${test.model}`);
    console.log(`⏳ 생성 중...`);

    const postData = JSON.stringify({
        contents: [{ parts: [{ text: test.prompt }] }],
        generationConfig: {
            responseModalities: ['Text', 'Image']
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
                        console.log(`❌ [${data.error.code}] ${data.error.message?.substring(0, 200)}`);
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
    console.log('🚀 gemini-2.0-flash-exp 실험 모델 테스트\n');
    const results = [];
    for (let i = 0; i < TESTS.length; i++) {
        const r = await testGenerate(TESTS[i]);
        results.push(r);
        if (i < TESTS.length - 1) { console.log('\n⏳ 3초 대기...'); await new Promise(r => setTimeout(r, 3000)); }
    }
    console.log(`\n${'━'.repeat(55)}`);
    console.log('📊 결과');
    console.log('━'.repeat(55));
    for (const r of results) {
        const s = r.ok ? '✅' : '❌';
        const m = r.model.includes('2.0') ? '2.0-exp' : '2.5-flash';
        console.log(`${s} ${m.padEnd(10)} | ${(r.elapsed + '초').padStart(6)} | ${r.kb ? r.kb + 'KB' : r.err} | ${r.name}`);
    }
}
main();
