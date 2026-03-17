import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const API_KEY = 'b2e81d90-f280-49bb-a2f2-43db201ca040';
const V2 = 'https://cloud.leonardo.ai/api/rest/v2';
const V1 = 'https://cloud.leonardo.ai/api/rest/v1';

async function run() {
    console.log('생성 요청중...');
    const res = await axios.post(`${V2}/generations`, {
        model: 'gemini-image-2',
        parameters: { width: 1024, height: 1024, prompt: 'A cozy Korean coffee shop interior with warm lighting, wooden tables, and plants. Photorealistic.', quantity: 1, prompt_enhance: 'OFF' },
        public: false
    }, { headers: { authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 });

    const gid = res.data?.generate?.generationId;
    console.log('생성ID:', gid, '비용:', res.data?.generate?.cost?.amount);

    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const s = await axios.get(`${V1}/generations/${gid}`, {
            headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 15000
        });
        const g = s.data?.generations_by_pk || s.data;
        if (g?.status === 'COMPLETE') {
            const url = g.generated_images[0].url;
            console.log('완료! URL:', url);
            const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            const fp = path.join(process.cwd(), 'nano_test_result.png');
            fs.writeFileSync(fp, Buffer.from(img.data));
            console.log('저장:', fp, '크기:', (img.data.length / 1024).toFixed(1) + 'KB');
            return;
        }
        console.log('대기중...', g?.status, ((i + 1) * 4) + '초');
    }
    console.log('타임아웃');
}

run().catch(e => console.error('에러:', e.response?.data || e.message));
