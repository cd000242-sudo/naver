// ✅ 스타일 예시이미지 생성 스크립트 (Gemini 3 Pro - native fetch 사용)
// 키워드: 대학교 캠퍼스 생활

const fs = require('fs');
const path = require('path');

const API_KEY = 'AIzaSyBx5DIw--uL2MCv3bskwEhTDbYYSew8t4I';
const MODEL = 'gemini-3-pro-image-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// 6개 스타일별 프롬프트 — 키워드 "대학교 캠퍼스 생활" 기반
const STYLE_PROMPTS = {
    'realistic': 'Hyper-realistic professional photography, 8K UHD, DSLR camera, natural lighting. A Korean university campus in spring, cherry blossom trees lining the walkway, students walking with backpacks, modern campus buildings in the background, warm golden hour sunlight, shallow depth of field',
    'vintage': 'Vintage retro 1960s poster illustration style, muted warm sepia color palette. A Korean university campus scene with students sitting on grass reading books, retro typography elements, nostalgic aesthetic, aged paper texture, classic mid-century design, old-fashioned charm',
    'stickman': 'Cute chibi cartoon character with oversized round white head much larger than body, simple black dot eyes, tiny body wearing a university hoodie and carrying a backpack, walking through a colorful campus with trees and buildings, thick bold black outlines, flat cel-shaded colors, Korean internet meme comic style, NO TEXT NO LETTERS',
    'roundy': 'Adorable chubby round blob character with extremely round soft white body, small dot eyes and tiny happy smile, wearing a tiny graduation cap, sitting on a grassy campus lawn with cherry blossoms, dreamy pastel pink and lavender background with sparkles, Molang inspired kawaii aesthetic, healing cozy atmosphere, NO TEXT NO LETTERS',
    '2d': 'Korean webtoon style 2D illustration of a young Korean woman with short bob hair, wearing a denim jacket and carrying books, walking through a vibrant university campus with sakura trees, vibrant flat colors, clean line art, manhwa aesthetic, soft pastel color palette, cute and expressive character design',
    'disney': 'Disney Pixar 3D animation style, adorable cartoon college students studying together under a big tree on a beautiful campus, big expressive eyes, vibrant saturated colors, magical glowing cherry blossom petals floating, soft volumetric lighting, cinematic composition, family-friendly whimsical atmosphere'
};

const STYLE_NAMES = {
    'realistic': '📷 실사',
    'vintage': '📜 빈티지',
    'stickman': '🤸 졸라맨',
    'roundy': '🫧 뚱글이',
    '2d': '🎨 한국웹툰',
    'disney': '🏰 디즈니'
};

async function generateImage(prompt) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120초

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseModalities: ['Text', 'Image'],
                    imageConfig: { imageSize: '1K' }
                }
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText.substring(0, 200)}`);
        }

        const json = await response.json();
        const candidates = json?.candidates;
        if (candidates?.[0]?.content?.parts) {
            for (const part of candidates[0].content.parts) {
                if (part.inlineData?.data) {
                    return Buffer.from(part.inlineData.data, 'base64');
                }
            }
        }
        throw new Error('이미지 데이터 없음 (finishReason: ' + (candidates?.[0]?.finishReason || 'unknown') + ')');
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

async function main() {
    console.log('🎨 스타일 예시이미지 생성 시작 (Gemini 3 Pro - 대학교 캠퍼스 생활)');
    console.log(`📡 모델: ${MODEL}`);
    console.log(`🔑 API 키: ${API_KEY.substring(0, 15)}...\n`);

    const outputDir = path.join(__dirname, 'public', 'style-previews');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const styles = Object.keys(STYLE_PROMPTS);
    let successCount = 0;

    for (let i = 0; i < styles.length; i++) {
        const style = styles[i];
        const prompt = STYLE_PROMPTS[style];
        const outputPath = path.join(outputDir, `${style}.png`);

        console.log(`[${i + 1}/${styles.length}] ${STYLE_NAMES[style]} 생성 중...`);

        try {
            const startTime = Date.now();
            const imageBuffer = await generateImage(prompt);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            fs.writeFileSync(outputPath, imageBuffer);
            console.log(`  ✅ 저장됨 (${elapsed}초, ${(imageBuffer.length / 1024).toFixed(1)}KB)`);
            successCount++;

            // API 레이트 리밋 방지 (5초 대기)
            if (i < styles.length - 1) {
                console.log('  ⏳ 5초 대기...');
                await new Promise(r => setTimeout(r, 5000));
            }
        } catch (err) {
            console.error(`  ❌ 실패: ${err.message?.substring(0, 200)}`);
        }
    }

    console.log(`\n🎉 완료! ${successCount}/${styles.length}개 이미지 생성됨`);
    console.log(`📂 저장 위치: ${outputDir}`);
}

main().catch(console.error);
