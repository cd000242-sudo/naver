const axios = require('axios');
const fs = require('fs');
const path = require('path');

const KEY = 'AIzaSyAtjFG4IP1xlTSgAfQVUJI-dpOcju3KBAY';
const model = 'gemini-3-pro-image-preview';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
const prompt = 'Hyper-realistic Korean cafe interior, warm morning light, latte art on wooden table, cozy atmosphere. NO TEXT NO WATERMARK';

console.log('NanoBananaPro (Gemini 3 Pro) only test...');
const start = Date.now();

axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
        responseModalities: ['Text', 'Image'],
        imageConfig: { imageSize: '1K', aspectRatio: '1:1' }
    }
}, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 })
    .then(r => {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const parts = r.data?.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
            if (p.inlineData && p.inlineData.data) {
                const buf = Buffer.from(p.inlineData.data, 'base64');
                const out = path.join(__dirname, 'test-nbp-only.png');
                fs.writeFileSync(out, buf);
                console.log(`PASS! ${elapsed}s, ${Math.round(buf.length / 1024)}KB saved`);
                return;
            }
            if (p.text) console.log('TEXT:', p.text.substring(0, 100));
        }
        console.log('FAIL: no image in response');
    })
    .catch(e => {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const st = e.response?.status;
        const msg = e.response?.data?.error?.message || e.message;
        console.log(`ERROR ${st} (${elapsed}s): ${msg.substring(0, 300)}`);
    });
