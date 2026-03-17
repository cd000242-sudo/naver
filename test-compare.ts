import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const API_KEY = 'b2e81d90-f280-49bb-a2f2-43db201ca040';
const V1 = 'https://cloud.leonardo.ai/api/rest/v1';

const PROMPT = 'A modern Korean office desk with real estate documents, a house model, tax calculation papers with percentage charts showing 12%, family photo frame, corporate seal stamp, and a calculator. Clean professional photography style, warm lighting, top-down view.';

async function testLucidRealism() {
    console.log('🎯 [Lucid Realism] 테스트...');

    const res = await axios.post(`${V1}/generations`, {
        modelId: '05ce0082-2d80-4a2d-8653-4d1c85e2418e',
        prompt: PROMPT,
        num_images: 1,
        width: 1024,
        height: 1024,
        alchemy: false,
        contrast: 3.5,
        enhancePrompt: false,
    }, { headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 });

    const gid = res.data?.sdGenerationJob?.generationId;
    const cost = res.data?.sdGenerationJob?.apiCreditCost;
    console.log('  생성ID:', gid, '토큰비용:', cost);
    if (!gid) { console.log('  ERROR:', JSON.stringify(res.data)); return; }

    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const s = await axios.get(`${V1}/generations/${gid}`, { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 15000 });
        const g = s.data?.generations_by_pk || s.data;
        if (g?.status === 'COMPLETE') {
            const url = g.generated_images[0].url;
            const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            fs.writeFileSync(path.join(process.cwd(), 'compare_lucid_realism.png'), Buffer.from(img.data));
            console.log(`  ✅ 완료! ${(img.data.length / 1024).toFixed(1)}KB`);
            return;
        }
        console.log(`  대기중... ${g?.status} (${(i + 1) * 4}초)`);
    }
}

testLucidRealism().catch(e => console.error('에러:', e.response?.status, JSON.stringify(e.response?.data)?.slice(0, 300) || e.message));
