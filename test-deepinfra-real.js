/**
 * DeepInfra 실제 이미지 생성 테스트
 * - config.json에서 API 키 로드  
 * - 실제 이미지 생성하여 다양성 확인
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

console.log('🚀 DeepInfra 실제 이미지 생성 테스트 시작\n');

// config.json에서 API 키 로드 (settings.json)
async function loadApiKey() {
    const settingsPath = path.join(process.env.APPDATA || '', 'leword', 'settings.json');
    console.log(`📁 설정 파일 경로: ${settingsPath}`);

    try {
        const data = fs.readFileSync(settingsPath, 'utf-8');
        const config = JSON.parse(data);
        const apiKey = config.deepinfraApiKey || config['deepinfra-api-key'];

        if (apiKey) {
            console.log(`✅ DeepInfra API 키 발견: ${apiKey.substring(0, 10)}...`);
            return apiKey;
        } else {
            console.log('❌ settings.json에 deepinfraApiKey 없음');
            console.log('   사용 가능한 키들:', Object.keys(config).filter(k => k.includes('Api') || k.includes('api')));
            return null;
        }
    } catch (e) {
        console.error('❌ settings.json 로드 실패:', e.message);
        return null;
    }
}

// 카메라 앵글 배열 (수정된 코드와 동일)
const cameraAngles = [
    'bird-eye view, overhead shot, looking down',
    'low angle shot, looking up, dramatic perspective',
    'wide shot, full scene visible, environmental',
    'profile view, side angle, elegant composition',
    'silhouette, backlit, atmospheric'
];

// 테스트 케이스
const testCases = [
    { name: 'celebrity_back_view', heading: 'K-pop idol on stage', angleIdx: 0 },
    { name: 'food_overhead', heading: 'Korean BBQ delicious grill', angleIdx: 0 },
    { name: 'scenery_wide', heading: 'Jeju Island beach sunrise', angleIdx: 2 }
];

async function generateImage(apiKey, prompt, testName) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎨 테스트: ${testName}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📝 프롬프트: ${prompt.substring(0, 200)}...`);

    const startTime = Date.now();

    try {
        const response = await axios.post(
            'https://api.deepinfra.com/v1/openai/images/generations',
            {
                prompt: prompt,
                model: 'black-forest-labs/FLUX-2-dev',
                size: '1024x1024',
                n: 1
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            }
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (response.data && response.data.data && response.data.data[0]) {
            const imageUrl = response.data.data[0].url;
            console.log(`✅ 성공! (${elapsed}초)`);
            console.log(`🔗 이미지 URL: ${imageUrl?.substring(0, 80)}...`);

            // 이미지 다운로드 및 저장
            if (imageUrl) {
                const outputDir = path.join(process.env.TEMP || '.', 'deepinfra_test_' + Date.now());
                if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

                const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                const filename = `${testName}.png`;
                const savePath = path.join(outputDir, filename);
                fs.writeFileSync(savePath, imgResponse.data);
                console.log(`💾 저장: ${savePath}`);
                return { success: true, path: savePath, outputDir };
            }
        }

        return { success: true };
    } catch (error) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`❌ 실패 (${elapsed}초): ${error.response?.data?.error?.message || error.message}`);
        return { success: false, error: error.message };
    }
}

async function main() {
    const apiKey = await loadApiKey();

    if (!apiKey) {
        console.log('\n⚠️ API 키가 없습니다. 앱에서 환경설정 저장 후 다시 시도해주세요.');
        console.log('💡 앱을 재시작하면 settings.json에 API 키가 저장됩니다.');
        process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎨 DeepInfra FLUX-2-dev 이미지 생성 테스트 (1개만)');
    console.log('='.repeat(60) + '\n');

    // 첫 번째 테스트만 실행 (비용 절약)
    const tc = testCases[0];
    const angle = cameraAngles[tc.angleIdx];

    // 수정된 프롬프트 형식 사용
    const prompt = `RAW photo, hyperrealistic, 8k uhd, ${angle}, ${tc.heading}, Korean person, action shot in motion, NOT front-facing portrait, dynamic composition, professional photography, NO TEXT NO WRITING`;

    const result = await generateImage(apiKey, prompt, tc.name);

    if (result.success && result.path) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 테스트 완료!');
        console.log('='.repeat(60));
        console.log(`\n✅ 이미지 생성 성공`);
        console.log(`📁 저장 위치: ${result.outputDir}`);
        console.log('\n💡 이미지를 직접 확인하여 다양한 구도인지 검증하세요.');

        // 폴더 열기
        require('child_process').exec(`explorer "${result.outputDir}"`);
    } else {
        console.log('\n❌ 이미지 생성 실패');
        if (result.error && result.error.includes('401')) {
            console.log('⚠️ API 키가 유효하지 않습니다. 확인해주세요.');
        }
    }
}

main().catch(console.error);
