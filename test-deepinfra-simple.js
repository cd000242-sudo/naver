const https = require('https');

const API_KEY = 'YYbFgUGCfUZlqs0yCGTPF6KRY88PUCKH';
const body = JSON.stringify({
    prompt: "simple test photo of a red apple on white background",
    model: "black-forest-labs/FLUX-2-dev",
    size: "512x512",
    n: 1
});

console.log('🚀 DeepInfra 간단한 테스트 시작...');
console.log('📦 요청 Body:', body);

const options = {
    hostname: 'api.deepinfra.com',
    path: '/v1/openai/images/generations',
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
    }
};

const startTime = Date.now();

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n⏱️ 응답 시간: ${elapsed}초`);
        console.log(`📊 상태 코드: ${res.statusCode}`);

        if (res.statusCode === 200) {
            try {
                const json = JSON.parse(data);
                if (json.data && json.data[0] && json.data[0].url) {
                    console.log('✅ 성공! 이미지 URL:', json.data[0].url.substring(0, 100) + '...');
                } else if (json.data && json.data[0] && json.data[0].b64_json) {
                    console.log('✅ 성공! Base64 이미지 (길이:', json.data[0].b64_json.length, ')');
                }
            } catch (e) {
                console.log('응답 데이터:', data.substring(0, 500));
            }
        } else {
            console.log('❌ 오류 응답:', data.substring(0, 500));
        }
    });
});

req.on('error', (e) => {
    console.error('❌ 요청 오류:', e.message);
});

req.setTimeout(180000, () => {
    console.log('⏰ 타임아웃 (3분)');
    req.destroy();
});

req.write(body);
req.end();
console.log('📤 요청 전송됨, 응답 대기 중...');
