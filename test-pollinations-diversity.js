/**
 * Pollinations 무료 API를 이용한 이미지 다양성 실제 검증
 * - DeepInfra와 동일한 프롬프트 로직 사용
 * - 실제 이미지 생성하여 다양성 확인
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('🚀 Pollinations 이미지 다양성 실제 검증 시작\n');

// 카메라 앵글 배열 (DeepInfra 코드와 동일)
const cameraAngles = [
    'bird-eye view, overhead shot, looking down',
    'low angle shot, looking up, dramatic perspective',
    'wide shot, full scene visible, environmental',
    'profile view, side angle, elegant composition',
    'silhouette, backlit, atmospheric'
];

// 테스트 케이스 (3개만 - 빠른 테스트)
const testCases = [
    { name: 'test1_celebrity', category: '스타 연예인', heading: 'K-pop idol on stage performance' },
    { name: 'test2_food', category: '요리 맛집', heading: 'Korean BBQ restaurant delicious meal' },
    { name: 'test3_travel', category: '여행', heading: 'Jeju Island beautiful beach sunrise' }
];

const personRequiredCategories = ['스타 연예인', '스포츠', '패션 뷰티', '건강'];
const noPersonCategories = ['요리 맛집', '여행', 'IT 테크'];

// 프롬프트 생성 (DeepInfra 로직 재현)
function generatePrompt(category, heading, angleIndex) {
    const angle = cameraAngles[angleIndex];
    const isPersonRequired = personRequiredCategories.includes(category);
    const isNoPersonCategory = noPersonCategories.includes(category);

    let basePrompt;
    if (isPersonRequired) {
        const poses = ['action shot in motion', 'candid moment', 'back view looking away', 'side profile'];
        const randomPose = poses[Math.floor(Math.random() * poses.length)];
        basePrompt = `${angle}, ${heading}, Korean person, ${randomPose}, professional photography, NOT front-facing portrait, NO TEXT`;
    } else if (isNoPersonCategory) {
        basePrompt = `${angle}, ${heading}, professional photography, NO PEOPLE, cinematic, NO TEXT`;
    } else {
        basePrompt = `${angle}, ${heading}, professional photography, cinematic lighting, NO TEXT`;
    }

    return `RAW photo, hyperrealistic, 8k uhd, ${basePrompt}`;
}

// Pollinations 이미지 생성 (URL 기반)
function generatePollinationsUrl(prompt, seed) {
    const encodedPrompt = encodeURIComponent(prompt);
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${seed}&model=flux`;
}

// 이미지 다운로드
function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                https.get(response.headers.location, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve(true);
                    });
                }).on('error', reject);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(true);
                });
            }
        }).on('error', (err) => {
            fs.unlink(filepath, () => { });
            reject(err);
        });
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const outputDir = path.join(process.env.TEMP || '.', 'diversity_test_' + Date.now());
    fs.mkdirSync(outputDir, { recursive: true });

    console.log(`📁 출력 폴더: ${outputDir}\n`);
    console.log('='.repeat(60));
    console.log('🎨 이미지 생성 테스트 (각 카테고리별 다른 앵글 적용)');
    console.log('='.repeat(60) + '\n');

    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const angleIndex = i % cameraAngles.length;
        const prompt = generatePrompt(tc.category, tc.heading, angleIndex);

        console.log(`[${i + 1}/${testCases.length}] ${tc.name}`);
        console.log(`   카테고리: ${tc.category}`);
        console.log(`   카메라 앵글: ${cameraAngles[angleIndex].split(',')[0]}`);
        console.log(`   프롬프트: ${prompt.substring(0, 80)}...`);

        const imageUrl = generatePollinationsUrl(prompt, Date.now() + i);
        const filepath = path.join(outputDir, `${tc.name}.png`);

        console.log(`   ⏳ 이미지 생성 중...`);

        try {
            const startTime = Date.now();
            await downloadImage(imageUrl, filepath);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            const stats = fs.statSync(filepath);
            if (stats.size > 1000) {
                console.log(`   ✅ 성공! (${elapsed}초, ${Math.round(stats.size / 1024)}KB)`);
                console.log(`   💾 저장: ${filepath}\n`);
            } else {
                console.log(`   ⚠️ 파일 크기 이상 (${stats.size} bytes)\n`);
            }
        } catch (error) {
            console.log(`   ❌ 실패: ${error.message}\n`);
        }

        // 다음 요청 전 대기
        if (i < testCases.length - 1) {
            console.log('   ⏳ 5초 대기...\n');
            await sleep(5000);
        }
    }

    // 결과 요약
    console.log('='.repeat(60));
    console.log('📊 결과 요약');
    console.log('='.repeat(60));

    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.png'));
    console.log(`\n✅ 생성된 이미지: ${files.length}개`);
    console.log(`📁 폴더 위치: ${outputDir}`);

    console.log('\n🎯 검증 항목:');
    console.log('  1. 각 이미지가 서로 다른 카메라 앵글을 사용했는지');
    console.log('  2. "스타 연예인" 이미지가 정면이 아닌 다양한 구도인지');
    console.log('  3. "요리 맛집" 이미지가 위에서 찍은 오버헤드 샷인지');

    console.log('\n💡 직접 폴더를 열어서 이미지를 확인해주세요:');
    console.log(`   explorer "${outputDir}"`);

    // 폴더 열기
    require('child_process').exec(`explorer "${outputDir}"`);

    console.log('\n🏁 테스트 완료!');
}

main().catch(console.error);
