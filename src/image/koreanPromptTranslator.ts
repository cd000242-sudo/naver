import axios from 'axios';
import { loadConfig } from '../configManager.js';
import { GEMINI_TEXT_MODELS, OPENAI_TEXT_MODELS } from '../runtime/modelRegistry.js';

// Korean -> English image prompt translator shared by the Flow generator.
// Extracted from the retired DeepInfra generator; behavior is unchanged except for log prefixes.

// ✅ [2026-03-01] 인물 규칙 함수 — 카테고리별 인물 포함/제외 + 한국인 하드코딩
// AI 추론 기반: 하드코딩 카테고리 스타일 제거, 인물 규칙만 제공
const PERSON_REQUIRED_CATEGORIES = new Set([
    '스타 연예인', '스포츠', '패션 뷰티', '건강',
    '교육/육아', '자기계발', '취미 라이프'
]);

const NO_PERSON_CATEGORIES = new Set([
    '요리 맛집', '여행', 'IT 테크', '제품 리뷰', '리빙 인테리어',
    '반려동물', '자동차', '부동산', '비즈니스 경제', '사회 정치',
    '공부', '생활 꿀팁'
]);

function getPersonRule(category: string | undefined): { personRule: string; isNoPerson: boolean } {
    const cat = (category || '').toLowerCase().trim();

    // 퍼지 매칭: 카테고리명 부분 일치
    for (const key of NO_PERSON_CATEGORIES) {
        if (cat.includes(key.toLowerCase()) || key.toLowerCase().includes(cat)) {
            return {
                personRule: 'NO PEOPLE, NO HANDS, NO HUMAN FIGURES. Focus entirely on objects, environment, and atmosphere.',
                isNoPerson: true
            };
        }
    }
    for (const key of PERSON_REQUIRED_CATEGORIES) {
        if (cat.includes(key.toLowerCase()) || key.toLowerCase().includes(cat)) {
            return {
                personRule: 'Include a KOREAN person (한국인 ONLY — NOT Western, NOT Caucasian, NOT European). Authentic Korean facial features, Korean bone structure, Korean skin tone, natural Korean appearance.',
                isNoPerson: false
            };
        }
    }
    // 기본: 인물 중립 (AI가 판단하되, 인물이 나오면 반드시 한국인)
    return {
        personRule: 'If people appear in the image, they MUST be KOREAN (한국인 ONLY — NOT Western, NOT Caucasian). Focus on the main subject matter.',
        isNoPerson: false
    };
}

// ✅ [2026-03-01] OpenAI 기반 한국어→영어 번역 (1순위: OpenAI, 2순위: Gemini 폴백)
// 사전 매핑 방식(90개 단어)은 커버리지 부족 → AI API로 정확한 번역
// FLUX 모델은 프롬프트에 한국어가 있으면 이미지에 (깨진) 한국어 텍스트를 렌더링함

// 번역 캐시 (같은 소제목 반복 번역 방지)
const translationCache = new Map<string, string>();

/**
 * ✅ [2026-03-01] OpenAI API로 한국어 소제목/프롬프트를 이미지 프롬프트용 영어로 번역
 * - 1순위: OpenAI gpt-5.4 (추론 품질 최우수, 최신 모델)
 * - 2순위: Gemini 폴백 (OpenAI 키 없거나 실패 시)
 * - 이미지 생성에 최적화된 시각적 묘사로 번역
 * - API 전부 실패 시 카테고리 기반 제너릭 장면 사용
 */
export async function translateKoreanToEnglishWithAI(koreanText: string, category?: string, imageStyle?: string): Promise<string> {
    const trimmed = koreanText.trim();
    if (!trimmed) return 'everyday life scene, daily activity';

    // ✅ [2026-02-26] 스타일별 캐시 키 (같은 텍스트도 스타일마다 다른 프롬프트 생성)
    const cacheKey = `${trimmed}__style:${imageStyle || 'default'}`;
    if (translationCache.has(cacheKey)) {
        const cached = translationCache.get(cacheKey)!;
        console.log(`[PromptTranslator] 🔤 번역 캐시 히트: "${trimmed.substring(0, 20)}" → "${cached.substring(0, 40)}"`);
        return cached;
    }

    // ✅ [2026-03-01] API 키 로드 (OpenAI 우선, Gemini 폴백)
    let openaiApiKey: string | undefined;
    let geminiApiKey: string | undefined;
    try {
        const config = await loadConfig();
        openaiApiKey = (config as any).openaiApiKey?.trim() || (config as any).openaiImageApiKey?.trim();
        geminiApiKey = (config as any).geminiApiKey?.trim();
    } catch (e) {
        // config 로드 실패
    }

    // ✅ [2026-02-26] 스타일별 지시사항 (카메라 앵글/색감은 제너레이터가 추가하므로 제외)
    const styleInstructions: Record<string, string> = {
        'realistic': 'Generate a photorealistic image prompt. Focus on subject, composition, environment, and mood.',
        'anime': 'Generate an anime/manga style illustration prompt. Focus on vibrant colors, dynamic composition, and cel-shading style.',
        'stickman': 'Generate a cute stick figure illustration prompt with simple lines, expressive poses, and playful composition.',
        'roundy': 'Generate a cute chibi/rounded character illustration prompt with soft edges, pastel colors, and adorable proportions.',
        '2d': 'Generate a Korean webtoon style 2D illustration prompt with clean lines, vivid colors, and dramatic composition.',
        'vintage': 'Generate a vintage retro style illustration prompt with muted tones, film grain effect, and nostalgic atmosphere.'
    };
    const styleGuide = styleInstructions[imageStyle || 'realistic'] || styleInstructions['realistic'];

    // ✅ [2026-03-01] 인물 규칙 적용
    const { personRule } = getPersonRule(category);

    // 공통 프롬프트 텍스트
    const promptText = `You are an expert AI image prompt engineer for ${imageStyle || 'realistic'} style images. Generate a complete, detailed image generation prompt from the following Korean text.

Rules:
- Output ONLY the English image prompt, nothing else
- ${styleGuide}
- DO NOT include camera angle, color grading, or lighting — these are added separately by the system
- PERSON RULE: ${personRule}
- Analyze the topic and infer the most appropriate visual style, composition, and mood
- Keep it under 40 words
- Do NOT include any Korean characters
- End with "NO TEXT NO WRITING"

Korean text: "${trimmed}"
Category: ${category || 'general'}

Complete image prompt:`;

    // ✅ [2026-03-01] 1순위: OpenAI API (추론 품질 최우수)
    if (openaiApiKey) {
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: OPENAI_TEXT_MODELS.LUNA,
                    messages: [
                        { role: 'system', content: `You are an expert AI image prompt engineer for ${imageStyle || 'realistic'} style. Output ONLY the English prompt, nothing else.` },
                        { role: 'user', content: promptText }
                    ],
                    // [v2.11.136] gpt-5.x 추론 모델이 예산을 reasoning으로 소진해
                    // 출력 0이 되는 것 방지: 소출력(영문 프롬프트) 작업엔 추론 불필요
                    // → effort low + 예산 여유. 비용도 절감.
                    max_completion_tokens: 4096,
                    reasoning_effort: 'low'
                },
                {
                    headers: {
                        'Authorization': `Bearer ${openaiApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30_000
                }
            );

            const result = response.data?.choices?.[0]?.message?.content?.trim();

            if (result && result.length > 3 && !/[가-힣]/.test(result)) {
                const cleaned = result
                    .replace(/^["'\s]+|["'\s]+$/g, '')
                    .replace(/\n/g, ', ')
                    .replace(/\s+/g, ' ')
                    .trim();

                translationCache.set(cacheKey, cleaned);
                console.log(`[PromptTranslator] 🔤 OpenAI 번역 완료: "${trimmed.substring(0, 25)}" → "${cleaned.substring(0, 60)}"`);
                return cleaned;
            }

            console.log(`[PromptTranslator] ⚠️ OpenAI 번역 응답 부적절 → Gemini 폴백 시도`);
        } catch (error: any) {
            const errMsg = error.response?.data?.error?.message || error.message || 'unknown';
            console.log(`[PromptTranslator] ⚠️ OpenAI 번역 API 실패 (${errMsg}) → Gemini 폴백 시도`);
        }
    } else {
        console.log(`[PromptTranslator] ⚠️ OpenAI API 키 없음 → Gemini 폴백 시도`);
    }

    // ✅ [2026-03-01] 2순위: Gemini API (OpenAI 실패 시 폴백)
    if (geminiApiKey) {
        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODELS.FLASH_LITE}:generateContent`,
                {
                    contents: [{ parts: [{ text: promptText }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 1024, topP: 0.9 }
                },
                {
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
                    timeout: 30_000
                }
            );

            const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

            if (result && result.length > 3 && !/[가-힣]/.test(result)) {
                const cleaned = result
                    .replace(/^["'\s]+|["'\s]+$/g, '')
                    .replace(/\n/g, ', ')
                    .replace(/\s+/g, ' ')
                    .trim();

                translationCache.set(cacheKey, cleaned);
                console.log(`[PromptTranslator] 🔤 Gemini 폴백 번역 완료: "${trimmed.substring(0, 25)}" → "${cleaned.substring(0, 60)}"`);
                return cleaned;
            }

            console.log(`[PromptTranslator] ⚠️ Gemini 번역 응답 부적절 → 카테고리 폴백`);
        } catch (error: any) {
            const errMsg = error.response?.data?.error?.message || error.message || 'unknown';
            console.log(`[PromptTranslator] ⚠️ Gemini 번역 API 실패 (${errMsg}) → 카테고리 폴백`);
        }
    } else {
        console.log(`[PromptTranslator] ⚠️ Gemini API 키도 없음 → 카테고리 폴백`);
    }

    // 3순위: 카테고리 기반 제너릭 장면 (모든 API 실패 시)
    return getGenericSceneByCategory(category);
}

// ✅ [2026-02-19 FIX v3] 사전 기반 폴백 완전 제거
// 사전(~90개 단어)은 커버리지 부족으로 오히려 더 이상한 이미지를 만듦
// Gemini API 실패 시: 카테고리 기반 제너릭 장면 사용 (사전보다 안전)
function getGenericSceneByCategory(category?: string): string {
    const cat = (category || '').toLowerCase();

    if (cat.includes('지원') || cat.includes('복지') || cat.includes('보조') || cat.includes('보험'))
        return 'government subsidy application documents on desk, official paperwork and calculator, financial support concept';
    if (cat.includes('경제') || cat.includes('비즈니스') || cat.includes('재테크'))
        return 'professional office workspace with documents and laptop, business meeting';
    // ✅ [2026-02-22 FIX] 'person exercising' 제거 → 사물/개념 중심
    if (cat.includes('건강') || cat.includes('의료') || cat.includes('다이어트'))
        return 'fitness equipment and healthy food arrangement, wellness concept, bright atmosphere';
    if (cat.includes('음식') || cat.includes('요리') || cat.includes('맛집'))
        return 'delicious food arrangement on table, fresh ingredients, kitchen scene';
    if (cat.includes('여행') || cat.includes('관광'))
        return 'beautiful travel destination landscape, scenic view, tourism';
    if (cat.includes('교육') || cat.includes('학습') || cat.includes('공부'))
        return 'study desk with books and notebook, learning environment, education';
    if (cat.includes('기술') || cat.includes('IT') || cat.includes('디지털'))
        return 'modern technology workspace, digital devices, futuristic concept';
    if (cat.includes('스타') || cat.includes('연예'))
        return 'celebrity entertainment stage, spotlight, glamorous event';
    if (cat.includes('스포츠'))
        return 'athletic sports scene, competition, dynamic action';
    if (cat.includes('패션') || cat.includes('뷰티'))
        return 'stylish fashion display, elegant clothing, beauty scene';
    if (cat.includes('부동산') || cat.includes('인테리어'))
        return 'modern apartment interior, cozy home living room, real estate';
    if (cat.includes('육아') || cat.includes('가족'))
        return 'happy family moment together, warm home scene, parenting';
    if (cat.includes('반려동물') || cat.includes('펫'))
        return 'cute pet playing at home, adorable animal, pet care';
    if (cat.includes('자동차'))
        return 'sleek modern car on road, automobile, driving scene';
    if (cat.includes('게임'))
        return 'gaming setup with controller and screen, esports, digital entertainment';

    // 기본 폴백 (카테고리도 없는 경우)
    return 'informative scene with documents and visual elements, professional illustration';
}
