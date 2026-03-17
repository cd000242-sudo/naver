/**
 * Stability AI 스타일 테스트 스크립트
 * 졸라맨 (stickman) + 뚱글이 (roundy) 비교 테스트
 * SD 3.5 Large Turbo 모델 사용
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// 설정 파일에서 API 키 읽기
const settingsPath = path.join(process.env.APPDATA, 'better-life-naver', 'settings.json');
const config = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
const API_KEY = config.stabilityApiKey || config['stability-api-key'];

if (!API_KEY) {
    console.error('❌ Stability AI API 키를 찾을 수 없습니다!');
    process.exit(1);
}
console.log(`✅ API 키 확인: ${API_KEY.substring(0, 10)}...`);

// SD 3.5 Large Turbo 엔드포인트
const API_URL = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';
const MODEL = 'sd3.5-large-turbo';

// 테스트할 스타일 프롬프트 (DeepInfra 테스트와 동일)
const testCases = [
    {
        name: 'stickman_coffee',
        style: '졸라맨',
        prompt: 'A character drinking coffee at a cozy cafe, Cute chibi cartoon character with oversized round white head much larger than body, simple black dot eyes, small expressive mouth showing happy emotion, tiny simple body wearing colorful casual clothes, thick bold black outlines, flat cel-shaded colors with NO gradients, detailed colorful background scene of a warm coffee shop with wooden tables, Korean internet meme comic art style, humorous and lighthearted mood, web comic panel composition, clean high quality digital vector art, NO TEXT NO LETTERS NO WATERMARK'
    },
    {
        name: 'roundy_coffee',
        style: '뚱글이',
        prompt: 'A character drinking coffee at a cozy cafe, Adorable chubby round blob character with extremely round soft body and very short stubby limbs, small dot eyes and tiny happy smile, pure white or soft pastel colored body, soft rounded outlines with NO sharp edges, dreamy pastel colored background with gentle gradient of a warm cafe scene with latte art, Molang and Sumikko Gurashi inspired kawaii aesthetic, healing and cozy atmosphere, minimalist cute Korean character design, soft lighting with gentle shadows, warm comforting mood, high quality digital illustration, NO TEXT NO LETTERS NO WATERMARK'
    },
    {
        name: 'stickman_cooking',
        style: '졸라맨',
        prompt: 'A character cooking in a kitchen, Cute chibi cartoon character with oversized round white head much larger than body, simple black dot eyes, small expressive mouth showing excited emotion, tiny simple body wearing a chef apron, thick bold black outlines, flat cel-shaded colors with NO gradients, detailed colorful background scene of a modern kitchen with ingredients, Korean internet meme comic art style, humorous and lighthearted mood, web comic panel composition, clean high quality digital vector art, NO TEXT NO LETTERS NO WATERMARK'
    },
    {
        name: 'roundy_cooking',
        style: '뚱글이',
        prompt: 'A character cooking in a kitchen, Adorable chubby round blob character with extremely round soft body and very short stubby limbs, small dot eyes and tiny happy smile, soft pink pastel colored body wearing a tiny apron, soft rounded outlines with NO sharp edges, dreamy pastel colored background with gentle gradient of a cute kitchen with soft pastel cookware, Molang and Sumikko Gurashi inspired kawaii aesthetic, healing and cozy atmosphere, minimalist cute Korean character design, soft lighting with gentle shadows, warm comforting mood, high quality digital illustration, NO TEXT NO LETTERS NO WATERMARK'
    }
];

// 출력 디렉토리 생성
const outputDir = path.join(__dirname, 'test-stability-images');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function generateImage(testCase) {
    console.log(`\n🎨 [${testCase.style}] ${testCase.name} 생성 중... (Model: ${MODEL})`);

    return new Promise((resolve, reject) => {
        // FormData를 수동으로 구성 (multipart/form-data)
        const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

        let body = '';
        // prompt
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="prompt"\r\n\r\n`;
        body += `${testCase.prompt}\r\n`;
        // model
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="model"\r\n\r\n`;
        body += `${MODEL}\r\n`;
        // output_format
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="output_format"\r\n\r\n`;
        body += `png\r\n`;
        // aspect_ratio
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="aspect_ratio"\r\n\r\n`;
        body += `1:1\r\n`;
        // boundary end
        body += `--${boundary}--\r\n`;

        const url = new URL(API_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'image/*'
            }
        };

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => { chunks.push(chunk); });
            res.on('end', () => {
                const responseBuffer = Buffer.concat(chunks);

                if (res.statusCode !== 200) {
                    const errorText = responseBuffer.toString('utf-8');
                    console.error(`❌ HTTP ${res.statusCode}: ${errorText.substring(0, 300)}`);
                    reject(new Error(`HTTP ${res.statusCode}: ${errorText.substring(0, 100)}`));
                    return;
                }

                // Accept: image/* → 직접 이미지 바이너리 반환
                const contentType = res.headers['content-type'] || '';
                if (contentType.includes('image')) {
                    const ext = contentType.includes('png') ? 'png' : 'webp';
                    const filePath = path.join(outputDir, `${testCase.name}.${ext}`);
                    fs.writeFileSync(filePath, responseBuffer);
                    console.log(`✅ [${testCase.style}] ${testCase.name} 저장 완료 (${(responseBuffer.length / 1024).toFixed(1)}KB): ${filePath}`);
                    resolve(filePath);
                } else {
                    // JSON 응답 (에러 등)
                    const text = responseBuffer.toString('utf-8');
                    console.error('❌ 예상치 못한 응답:', text.substring(0, 300));
                    reject(new Error('Unexpected response format'));
                }
            });
        });

        req.on('error', (e) => {
            console.error('❌ 요청 에러:', e.message);
            reject(e);
        });

        req.setTimeout(120000, () => {
            req.destroy();
            reject(new Error('Timeout (120s)'));
        });

        req.write(body);
        req.end();
    });
}

async function runTests() {
    console.log('='.repeat(60));
    console.log('🚀 Stability AI 스타일 테스트 시작');
    console.log(`모델: ${MODEL} (SD 3.5 Large Turbo)`);
    console.log(`테스트 수: ${testCases.length} (졸라맨 2개, 뚱글이 2개)`);
    console.log(`출력: ${outputDir}`);
    console.log('='.repeat(60));

    const results = [];
    const startTime = Date.now();

    for (const tc of testCases) {
        const tcStart = Date.now();
        try {
            const filePath = await generateImage(tc);
            const elapsed = ((Date.now() - tcStart) / 1000).toFixed(1);
            results.push({ name: tc.name, style: tc.style, status: '✅ 성공', path: filePath, time: `${elapsed}s` });
        } catch (e) {
            results.push({ name: tc.name, style: tc.style, status: '❌ 실패', error: e.message });
        }
        // 요청 간 1.5초 대기 (rate limit 방지)
        await new Promise(r => setTimeout(r, 1500));
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log('📊 테스트 결과 요약');
    console.log('='.repeat(60));
    results.forEach(r => {
        console.log(`  ${r.status} [${r.style}] ${r.name}${r.time ? ` (${r.time})` : ''}${r.error ? ` - ${r.error}` : ''}`);
    });
    console.log(`\n⏱️ 총 소요 시간: ${totalTime}s`);
    console.log('📁 출력 디렉토리:', outputDir);
}

runTests().catch(console.error);
