/**
 * 졸라맨(stickman) 스타일 이미지 생성 테스트
 * - DeepInfra FLUX-2-dev API 사용
 * - 6개 다양한 장면(요리, 여행, 운동, IT, 카페, 쇼핑)으로 테스트
 * - 장면 맥락이 제대로 반영되는지 확인
 */

import * as fs from 'fs';
import * as path from 'path';

const DEEPINFRA_API_URL = 'https://api.deepinfra.com/v1/openai/images/generations';
const MODEL = 'black-forest-labs/FLUX-2-dev';

// ✅ 졸라맨 프롬프트 (imageStyles.ts와 동일)
const STICKMAN_STYLE = 'cute simple character with round white circle head, dot eyes, expressive mouth, thick round limbs, wearing casual clothes, LINE Friends mascot style, bold black outlines, flat bright colors, digital illustration, character actively interacting with the scene, TEXTLESS';

// ✅ 6개 장면 시나리오 (basePrompt 역할 — 실제 블로그 소제목에서 나올 법한 주제들)
const SCENES = [
    { name: '01_cooking', basePrompt: 'A character happily cooking in a modern kitchen, stirring a pot of Korean kimchi stew, steam rising, colorful ingredients on the counter' },
    { name: '02_travel', basePrompt: 'A character standing in front of the Eiffel Tower at sunset, holding a camera, excited expression, beautiful Parisian cityscape background' },
    { name: '03_exercise', basePrompt: 'A character jogging in a park on a sunny morning, wearing workout clothes, surrounded by trees and nature, energetic pose' },
    { name: '04_coding', basePrompt: 'A character sitting at a desk with multiple computer monitors, typing code, coffee cup beside, modern office with LED lights' },
    { name: '05_cafe', basePrompt: 'A character sitting at a cozy cafe table, drinking a latte with latte art, reading a book, warm indoor lighting, plants in background' },
    { name: '06_shopping', basePrompt: 'A character walking through a shopping mall carrying colorful shopping bags, happy expression, modern boutique stores in the background' },
];

async function getDeepInfraApiKey(): Promise<string> {
    const appDataPath = process.env.APPDATA || '';
    const possiblePaths = [
        path.join(appDataPath, 'better-life-naver', 'settings.json'),
        path.join(appDataPath, '리더 네이버 자동화', 'settings.json'),
        path.join(appDataPath, 'leader-naver-automation', 'settings.json'),
    ];

    for (const p of possiblePaths) {
        try {
            const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (data.deepinfraApiKey) {
                console.log(`✅ DeepInfra API 키 발견: ${p}`);
                return data.deepinfraApiKey;
            }
        } catch (e) {
            // ignore
        }
    }

    if (process.env.DEEPINFRA_API_KEY) {
        return process.env.DEEPINFRA_API_KEY;
    }

    throw new Error('DeepInfra API 키를 찾을 수 없습니다.');
}

async function generateImage(apiKey: string, scene: typeof SCENES[0], index: number): Promise<boolean> {
    // ✅ deepinfraGenerator.ts의 캐릭터 스타일 프롬프트 조합과 동일한 구조
    // prompt = `${noTextPrefix} ${basePrompt}, character style: ${selectedStyleBase}. SINGLE ILLUSTRATION ONLY...`
    const prompt = `TEXTLESS ${scene.basePrompt}, character style: ${STICKMAN_STYLE}. SINGLE ILLUSTRATION ONLY, NOT a comic strip, NEVER SPEECH BUBBLES, NEVER DIALOGUE, CLEAN IMAGE ONLY.`;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🖼️ [${index + 1}/6] ${scene.name}`);
    console.log(`📝 장면: ${scene.basePrompt.substring(0, 80)}...`);
    console.log(`📐 프롬프트 길이: ${prompt.length}자`);
    console.log(`${'─'.repeat(60)}`);

    try {
        const startTime = Date.now();
        const response = await fetch(DEEPINFRA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: MODEL,
                prompt: prompt,
                n: 1,
                size: '1024x1024',
                response_format: 'b64_json',
            }),
        });

        const elapsed = Date.now() - startTime;
        console.log(`⏱ 응답 시간: ${(elapsed / 1000).toFixed(1)}초`);

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`❌ HTTP ${response.status}: ${errorText.substring(0, 200)}`);
            return false;
        }

        const data = await response.json() as any;

        if (data.data && data.data[0]?.b64_json) {
            const buffer = Buffer.from(data.data[0].b64_json, 'base64');
            const outputPath = path.join(__dirname, `test_stickman_${scene.name}.png`);
            fs.writeFileSync(outputPath, buffer);

            console.log(`✅ 성공! → ${path.basename(outputPath)} (${Math.round(buffer.length / 1024)}KB)`);
            return true;
        }

        console.log(`❌ 이미지 데이터 없음`);
        return false;
    } catch (error: any) {
        console.log(`❌ 에러: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🎨 졸라맨(Stickman) 스타일 이미지 생성 테스트');
    console.log(`📅 ${new Date().toLocaleString('ko-KR')}`);
    console.log(`🤖 모델: ${MODEL}`);
    console.log(`📋 테스트: 6개 장면 (요리/여행/운동/코딩/카페/쇼핑)`);
    console.log('═'.repeat(60));

    const apiKey = await getDeepInfraApiKey();
    console.log(`🔑 API 키: ${apiKey.substring(0, 8)}...`);

    let success = 0;
    let fail = 0;

    for (let i = 0; i < SCENES.length; i++) {
        const ok = await generateImage(apiKey, SCENES[i], i);
        if (ok) success++;
        else fail++;
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📊 결과 요약');
    console.log('═'.repeat(60));
    console.log(`  ✅ 성공: ${success}개`);
    console.log(`  ❌ 실패: ${fail}개`);
    console.log(`  📁 출력 위치: ${__dirname}/test_stickman_*.png`);

    if (success > 0) {
        console.log('\n💡 생성된 이미지를 확인하여 졸라맨이 각 장면에 맞게 상호작용하는지 확인하세요!');
    }
}

main().catch(console.error);
