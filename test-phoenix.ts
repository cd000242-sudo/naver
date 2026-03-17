import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const API_KEY = 'b2e81d90-f280-49bb-a2f2-43db201ca040';
const V1 = 'https://cloud.leonardo.ai/api/rest/v1';

// API에서 확인된 모델들
const MODELS = [
    { name: 'Leonardo Signature', id: '291be633-cb24-434f-898f-e662799936ad' },
];

async function testModel(modelName: string, modelId: string) {
    console.log(`\n🎨 ${modelName} 테스트...`);

    const res = await axios.post(`${V1}/generations`, {
        prompt: 'A cozy Korean coffee shop interior with warm lighting, wooden tables, and plants. Photorealistic.',
        modelId: modelId,
        width: 1024,
        height: 1024,
        num_images: 1,
    }, {
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 30000
    });

    const gid = res.data?.sdGenerationJob?.generationId;
    console.log('생성ID:', gid);
    const apiCredit = res.data?.sdGenerationJob?.apiCreditCost;
    console.log('비용(토큰):', apiCredit);

    if (!gid) { console.log('ERROR: ID 없음'); return; }

    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const s = await axios.get(`${V1}/generations/${gid}`, {
            headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 15000
        });
        const g = s.data?.generations_by_pk || s.data;
        if (g?.status === 'COMPLETE') {
            const url = g.generated_images[0].url;
            const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            const fp = path.join(process.cwd(), `phoenix_test_result.png`);
            fs.writeFileSync(fp, Buffer.from(img.data));
            console.log(`✅ 완료! 크기: ${(img.data.length / 1024).toFixed(1)}KB → ${fp}`);
            return;
        }
        console.log('대기중...', g?.status, ((i + 1) * 4) + '초');
    }
}

async function run() {
    for (const m of MODELS) {
        try {
            await testModel(m.name, m.id);
        } catch (e: any) {
            console.log(`❌ ${m.name} 실패:`, e.response?.status, JSON.stringify(e.response?.data)?.slice(0, 200) || e.message);
        }
    }
}

run();
