import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { loadConfig } from '../configManager.js';
import { trackApiUsage } from '../apiUsageTracker.js';
import { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { STYLE_PROMPT_MAP, getWebtoonStylePrompt, WebtoonGender, WebtoonSubStyle, getImageDiversityHints } from './imageStyles.js';
import { addThumbnailTextOverlay } from './textOverlay.js'; // ✅ [2026-01-30] 썸네일 텍스트 오버레이
import { AutomationService } from '../main/services/AutomationService.js'; // ✅ [2026-01-29 FIX] 중지 체크용
import sharp from 'sharp'; // ✅ [2026-01-30] 이미지 하단 텍스트 영역 크롭용

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

// ✅ [2026-02-12] 쇼핑커넥트 라이프스타일 전용 스타일 (NanoBananaPro와 동일 전략)
const DEEPINFRA_SHOPPING_CONNECT_LIFESTYLE = 'Premium lifestyle photography with Korean person using or enjoying the product, luxury lifestyle setting, modern Korean apartment or trendy cafe, product clearly visible while being used, natural warm lighting, Instagram-worthy aesthetic, aspirational lifestyle imagery, NO TEXT NO WRITING';

// ✅ [2026-02-12] 재시도 시 프롬프트 변형 전략 (NanoBananaPro variationStyles와 동일)
const VARIATION_STYLES = [
    'Use a COMPLETELY DIFFERENT color palette and lighting.',
    'Change the camera angle to a unique perspective (overhead, low angle, dutch angle).',
    'Simplify the composition with fewer elements and more negative space.',
    'Use warm colors if previous was cool, or vice versa.',
    'Add more visual elements and environmental details.',
    'Change the background setting completely.'
];

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
async function translateKoreanToEnglishWithAI(koreanText: string, category?: string, imageStyle?: string): Promise<string> {
    const trimmed = koreanText.trim();
    if (!trimmed) return 'everyday life scene, daily activity';

    // ✅ [2026-02-26] 스타일별 캐시 키 (같은 텍스트도 스타일마다 다른 프롬프트 생성)
    const cacheKey = `${trimmed}__style:${imageStyle || 'default'}`;
    if (translationCache.has(cacheKey)) {
        const cached = translationCache.get(cacheKey)!;
        console.log(`[DeepInfra] 🔤 번역 캐시 히트: "${trimmed.substring(0, 20)}" → "${cached.substring(0, 40)}"`);
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
                    model: 'gpt-5.4',
                    messages: [
                        { role: 'system', content: `You are an expert AI image prompt engineer for ${imageStyle || 'realistic'} style. Output ONLY the English prompt, nothing else.` },
                        { role: 'user', content: promptText }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                },
                {
                    headers: {
                        'Authorization': `Bearer ${openaiApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 8000 // 8초 타임아웃
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
                console.log(`[DeepInfra] 🔤 OpenAI 번역 완료: "${trimmed.substring(0, 25)}" → "${cleaned.substring(0, 60)}"`);
                return cleaned;
            }

            console.log(`[DeepInfra] ⚠️ OpenAI 번역 응답 부적절 → Gemini 폴백 시도`);
        } catch (error: any) {
            const errMsg = error.response?.data?.error?.message || error.message || 'unknown';
            console.log(`[DeepInfra] ⚠️ OpenAI 번역 API 실패 (${errMsg}) → Gemini 폴백 시도`);
        }
    } else {
        console.log(`[DeepInfra] ⚠️ OpenAI API 키 없음 → Gemini 폴백 시도`);
    }

    // ✅ [2026-03-01] 2순위: Gemini API (OpenAI 실패 시 폴백)
    if (geminiApiKey) {
        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
                {
                    contents: [{ parts: [{ text: promptText }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 150, topP: 0.9 }
                },
                {
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
                    timeout: 5000
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
                console.log(`[DeepInfra] 🔤 Gemini 폴백 번역 완료: "${trimmed.substring(0, 25)}" → "${cleaned.substring(0, 60)}"`);
                return cleaned;
            }

            console.log(`[DeepInfra] ⚠️ Gemini 번역 응답 부적절 → 카테고리 폴백`);
        } catch (error: any) {
            const errMsg = error.response?.data?.error?.message || error.message || 'unknown';
            console.log(`[DeepInfra] ⚠️ Gemini 번역 API 실패 (${errMsg}) → 카테고리 폴백`);
        }
    } else {
        console.log(`[DeepInfra] ⚠️ Gemini API 키도 없음 → 카테고리 폴백`);
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

// ✅ DeepInfra FLUX API 설정 (참고: https://deepinfra.com/black-forest-labs/FLUX-2-dev)
const DEEPINFRA_API_URL = 'https://api.deepinfra.com/v1/openai/images/generations';
const DEFAULT_DEEPINFRA_MODEL = 'black-forest-labs/FLUX-2-dev'; // 기본값

// ✅ [2026-01-28] FLUX Redux (image-to-image) API 설정
const DEEPINFRA_REDUX_API_URL = 'https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-1-Redux-dev';

// ✅ [2026-01-27] 사용자 설정값 → DeepInfra API 모델명 매핑
const DEEPINFRA_MODEL_MAP: Record<string, string> = {
    'flux-2-dev': 'black-forest-labs/FLUX-2-dev',      // FLUX.2-dev (최신)
    'flux-dev': 'black-forest-labs/FLUX-1-dev',        // FLUX.1-dev
    'flux-schnell': 'black-forest-labs/FLUX-1-schnell' // FLUX.1-schnell (빠름)
};


export interface DeepInfraGenerateOptions {
    prompt: string;
    size?: string; // "1024x1024", "512x512", etc.
    n?: number;
    model?: string; // ✅ [2026-01-27] 동적 모델 선택 지원
    referenceImageUrl?: string; // ✅ [2026-01-28] 참조 이미지 URL (img2img)
    referenceImagePath?: string; // ✅ [2026-01-28] 참조 이미지 로컬 경로
    guidanceScale?: number; // ✅ [2026-01-28] img2img 가이던스 (기본 7.5)
}

export interface DeepInfraResult {
    success: boolean;
    imageData?: string; // base64
    localPath?: string;
    error?: string;
}

/**
 * DeepInfra API 키 확인
 */
export async function isDeepInfraConfigured(): Promise<boolean> {
    const config = await loadConfig();
    return !!((config as any).deepinfraApiKey && (config as any).deepinfraApiKey.trim());
}

/**
 * DeepInfra로 일괄 이미지 생성 (공통 인터페이스)
 */
export async function generateWithDeepInfra(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    isFullAuto: boolean = false,
    providedApiKey?: string,
    isShoppingConnect: boolean = false, // ✅ [2026-02-12] 쇼핑커넥트 모드 전달
    onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,  // ✅ [2026-02-27] 실시간 콜백
    collectedImages?: string[]  // ✅ [2026-03-03] 수집 이미지 참조 (img2img)
): Promise<GeneratedImage[]> {
    const config = await loadConfig();
    const apiKey = providedApiKey || (config as any).deepinfraApiKey?.trim();

    if (!apiKey) {
        throw new Error('DeepInfra API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.');
    }

    // ✅ [2026-01-27] 사용자 설정에서 모델 선택 읽기
    const selectedModelKey = (config as any).deepinfraModel || 'flux-2-dev';
    const actualModel = DEEPINFRA_MODEL_MAP[selectedModelKey] || DEFAULT_DEEPINFRA_MODEL;

    console.log(`[DeepInfra] 🎨 총 ${items.length}개 이미지 생성 시작`);
    console.log(`[DeepInfra] 📋 선택된 모델: ${selectedModelKey} → ${actualModel}`);

    const results: GeneratedImage[] = [];

    for (let i = 0; i < items.length; i++) {
        // ✅ [2026-01-29 FIX] 각 이미지 생성 전 중지 체크
        if (AutomationService.isCancelRequested()) {
            console.log('[DeepInfra] ⛔ 중지 요청 감지 → 이미지 생성 중단');
            break;
        }

        const item = items[i];
        const isThumbnail = (item as any).isThumbnail !== undefined ? (item as any).isThumbnail : (i === 0);

        console.log(`[DeepInfra] 🖼️ [${i + 1}/${items.length}] "${item.heading}" 생성 중...`);

        try {
            // ✅ [2026-03-03] collectedImages에서 참조 이미지 폴백 (item에 referenceImageUrl이 없을 때)
            const currentRefUrl = item.referenceImageUrl
                || (isShoppingConnect && collectedImages && collectedImages.length > 0
                    ? collectedImages[Math.min(i, collectedImages.length - 1)]
                    : undefined);

            // ✅ [2026-01-28] 참조 이미지가 있으면 img2img 우선 시도
            if (currentRefUrl) {
                console.log(`[DeepInfra] 🖼️ 참조 이미지 감지 → FLUX Redux (img2img) 모드 사용`);
                const refItem = { ...item, referenceImageUrl: currentRefUrl };
                const img2imgResult = await generateDeepInfraWithReference(refItem, apiKey, postTitle, postId);

                if (img2imgResult) {
                    results.push(img2imgResult);
                    console.log(`[DeepInfra] ✅ [${i + 1}/${items.length}] "${item.heading}" img2img 완료`);
                    continue; // 성공 시 다음 아이템으로
                }

                console.log(`[DeepInfra] ⚠️ img2img 실패, text-to-image로 폴백`);
            }

            // ✅ [2026-02-08 FIX] 이미지 스타일 설정 읽기 — config.json 폴백 (main 프로세스에서 localStorage 접근 불가)
            const imageStyle = (item as any).imageStyle || (config as any).imageStyle || 'realistic';

            console.log(`[DeepInfra] 🎨 이미지 스타일: ${imageStyle}`);

            // ✅ [2026-03-01] AI 추론 기반: 하드코딩 카테고리 스타일 제거 → getPersonRule로 인물 규칙만 제공
            const { personRule, isNoPerson } = getPersonRule(item.category);

            // ✅ [2026-02-12] 쇼핑커넥트 모드일 때 라이프스타일 스타일 강제 적용 (비즈니스 요구사항)
            const styleGuide = isShoppingConnect ? DEEPINFRA_SHOPPING_CONNECT_LIFESTYLE : '';
            console.log(`[DeepInfra] 🎨 인물 규칙: category="${item.category || '(없음)'}" → personRule="${personRule.substring(0, 50)}..."${isShoppingConnect ? ' (쇼핑커넥트 모드)' : ''}`);

            // ✅ 영문 프롬프트 우선 사용 (FLUX는 영어 프롬프트에 최적화)
            let basePrompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading);

            // ✅ [2026-02-18 FIX] 비사실적 스타일에서 renderer가 주입한 photography 키워드 제거
            // generateEnglishPromptForHeadingSync()가 항상 "professional photography, natural lighting" 등을 주입
            const isNonRealisticForClean = imageStyle === 'stickman' || imageStyle === 'roundy' || imageStyle === 'vintage' || imageStyle === '2d';
            if (isNonRealisticForClean) {
                basePrompt = basePrompt
                    .replace(/professional photography,?\s*/gi, '')
                    .replace(/natural lighting,?\s*/gi, '')
                    .replace(/cinematic composition,?\s*/gi, '')
                    .replace(/4k resolution,?\s*/gi, '')
                    .replace(/high detail,?\s*/gi, '')
                    .replace(/photorealistic,?\s*/gi, '')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
                console.log(`[DeepInfra] 🧹 비사실적 스타일(${imageStyle}) photography 키워드 제거 완료`);
            }

            // ✅ [2026-03-01] NO PEOPLE 카테고리에서 englishPrompt 인물 키워드 필터링
            // ✅ 캐릭터 스타일(stickman, roundy)은 캐릭터가 주체이므로 필터 면제
            const isCharacterStyleForFilter = imageStyle === 'stickman' || imageStyle === 'roundy';
            if (isNoPerson && !isCharacterStyleForFilter && /person|people|celebrity|human|checking phone|studying|exercising/i.test(basePrompt)) {
                const originalBasePrompt = basePrompt;
                basePrompt = `visual scene depicting: ${sanitizeImagePrompt(item.heading)}`;
                console.log(`[DeepInfra] ⚠️ NO PEOPLE 카테고리에서 인물 프롬프트 감지 → 재생성: "${originalBasePrompt.substring(0, 40)}..." → "${basePrompt.substring(0, 40)}..."`);
            }

            // ✅ [2026-01-30 FIX] 한글 감지 시 → 카테고리별 다른 처리!
            // ✅ [2026-02-19 FIX v2] 캐릭터/아트 스타일: englishPrompt 우선 사용
            // 이전 로직: 캐릭터 스타일은 englishPrompt가 있어도 사전 번역 강제 → 사전에 없는 단어 전부 제거 → 폴백
            // 수정 로직: englishPrompt가 있으면 우선 사용 (AI 번역이 사전보다 정확), 없을 때만 사전 번역
            const isCharacterOrArtStyle = imageStyle === 'stickman' || imageStyle === 'roundy' || imageStyle === '2d';
            const hasKoreanHeading = /[가-힣]/.test(item.heading || item.prompt || '');
            const hasKorean = /[가-힣]/.test(basePrompt);

            // 캐릭터/아트 스타일: englishPrompt가 있으면 그걸로 사용, 없으면 사전 번역
            // 비 캐릭터 스타일: 기존 로직 유지 (한글이 있고 englishPrompt 없으면 사전 번역)
            const shouldUseKoreanFallback = isCharacterOrArtStyle
                ? (hasKoreanHeading && !item.englishPrompt) // englishPrompt 있으면 강제 진입 안 함
                : (hasKorean && !item.englishPrompt);

            // ✅ [2026-02-19 FIX v2] 캐릭터/아트 스타일에서 englishPrompt 활용 경로
            if (isCharacterOrArtStyle && item.englishPrompt && hasKoreanHeading) {
                // AI가 생성한 englishPrompt 사용 (사전 번역보다 정확)
                let englishContext = item.englishPrompt;
                // 혹시 남은 한국어 제거
                if (/[가-힣]/.test(englishContext)) {
                    englishContext = englishContext.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]+/g, '').replace(/\s+/g, ' ').trim();
                }
                console.log(`[DeepInfra] ✅ 캐릭터/아트 스타일 + englishPrompt 사용: "${englishContext.substring(0, 60)}"`);

                // ✅ [2026-02-26] AI가 스타일별 완전한 프롬프트를 생성하므로, 다양성 힌트만 보강
                const hints = getImageDiversityHints(i);
                basePrompt = `${hints.angle}, ${englishContext}, ${hints.color}`;
            } else if (shouldUseKoreanFallback) {
                // ✅ [2026-02-26] Gemini API로 스타일별 완전한 이미지 프롬프트 생성
                const koreanContext = sanitizeImagePrompt(item.heading || item.prompt || '');
                const englishContext = await translateKoreanToEnglishWithAI(koreanContext, item.category, imageStyle);
                console.log(`[DeepInfra] ✅ 한글→영어 AI 변환 완료: "${koreanContext.substring(0, 20)}" → "${englishContext.substring(0, 40)}"`);

                // ✅ AI가 스타일별 프롬프트를 생성하므로, 다양성 힌트만 보강
                const hintsK = getImageDiversityHints(i);
                basePrompt = `${hintsK.angle}, ${englishContext}, ${hintsK.color}`;
            }

            // ✅ [2026-02-19 FIX] 최종 안전장치: 프롬프트에 한국어가 남아있으면 제거
            // FLUX 모델은 프롬프트의 한국어를 이미지에 텍스트로 렌더링하므로 반드시 제거
            if (/[가-힣]/.test(basePrompt)) {
                const beforeKorean = basePrompt;
                basePrompt = basePrompt.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]+/g, '').replace(/\s+/g, ' ').trim();
                console.log(`[DeepInfra] 🚫 프롬프트 한국어 잔여 제거: "${beforeKorean.substring(0, 30)}..." → "${basePrompt.substring(0, 30)}..."`);
            }

            // ✅ [2026-01-26] FLUX-2-dev용 8개 스타일별 프롬프트 조합
            let prompt = '';

            // ✅ [2026-02-18] STYLE_PROMPT_MAP 참조 (imageStyles.ts에서 중앙 관리)
            // 2D 웹툰 스타일은 성별 분기 적용
            const webtoonGender: WebtoonGender = (item as any).webtoonGender || (config as any).webtoonGender || 'male';
            const webtoonSubStyle: WebtoonSubStyle = (item as any).webtoonSubStyle || (config as any).webtoonSubStyle || 'webtoon_illust';
            // ✅ [2026-02-22 FIX] getWebtoonStylePrompt에 카테고리 전달 → 인물 제외 카테고리에서 성별 프롬프트 제거
            const selectedStyleBase = imageStyle === '2d'
                ? getWebtoonStylePrompt(webtoonGender, webtoonSubStyle, item.category)
                : (STYLE_PROMPT_MAP[imageStyle] || STYLE_PROMPT_MAP['realistic']);

            if (imageStyle === '2d') {
                console.log(`[DeepInfra] 🎨 웹툰 성별: ${webtoonGender}, 서브스타일: ${webtoonSubStyle}`);
            }

            // ✅ [2026-03-01] 인물 규칙은 getPersonRule()에서 이미 결정됨
            const noTextPrefix = 'IMPORTANT: Generate a CLEAN image with ABSOLUTELY NEVER TEXT, NEVER LETTERS, NEVER WORDS, NEVER WRITING, NEVER CAPTIONS, NEVER SUBTITLES, NEVER WATERMARKS, NEVER SPEECH BUBBLES, NEVER DIALOGUE BOXES, NEVER COMIC PANELS.';
            const thumbnailStyle = 'professional photography, cinematic composition, clean background, high visual impact';

            // ✅ [2026-02-18 FIX] 스타일별 세분화된 프롬프트 조합
            const isCharacterStyle = imageStyle === 'stickman' || imageStyle === 'roundy';
            const isArtStyle = imageStyle === 'vintage' || imageStyle === '2d';

            // ✅ [2026-03-01] AI 추론 기반: 하드코딩 카테고리 스타일 제거 → personRule만 삽입
            if (imageStyle === 'realistic') {
                // 📸 사실적 스타일
                if (isThumbnail && postTitle) {
                    prompt = `${noTextPrefix} ${basePrompt}, ${thumbnailStyle}, ${styleGuide ? styleGuide + ', ' : ''}photo style: ${selectedStyleBase}, cinematic lighting, varied composition. ${personRule}. REMINDER: ZERO TEXT ON IMAGE.`;
                } else {
                    prompt = `${noTextPrefix} ${basePrompt}, ${styleGuide ? styleGuide + ', ' : ''}photo style: ${selectedStyleBase}, ultra detailed, natural lighting, dynamic scene composition. ${personRule}. NEVER TEXT.`;
                }
            } else if (imageStyle === 'anime') {
                // 🎌 애니메이션 스타일
                if (isThumbnail && postTitle) {
                    prompt = `${noTextPrefix} masterpiece, best quality, ${basePrompt}, anime style: ${selectedStyleBase}, stunning anime visual, eye-catching composition. ${personRule}. CLEAN IMAGE ONLY.`;
                } else {
                    prompt = `${noTextPrefix} masterpiece, best quality, ${basePrompt}, anime style: ${selectedStyleBase}, beautiful anime scene, detailed artwork. ${personRule}.`;
                }
            } else if (isCharacterStyle) {
                // 🎨 캐릭터 스타일 (stickman, roundy): 캐릭터가 주체이므로 personRule 적용 안함
                prompt = `${noTextPrefix} ${basePrompt}, character style: ${selectedStyleBase}. SINGLE ILLUSTRATION ONLY, NOT a comic strip, NEVER SPEECH BUBBLES, NEVER DIALOGUE, CLEAN IMAGE ONLY.`;
            } else if (isArtStyle) {
                // 🖼️ 아트 스타일 (vintage, 2d)
                prompt = `${noTextPrefix} ${basePrompt}, art style: ${selectedStyleBase}, artistic composition, vibrant visual storytelling. ${personRule}. NEVER TEXT, NEVER SPEECH BUBBLES, CLEAN IMAGE ONLY.`;
            } else {
                // 기타 스타일
                prompt = `${noTextPrefix} ${basePrompt}, style: ${selectedStyleBase}, detailed visual. ${personRule}. NEVER TEXT.`;
            }

            // ✅ [2026-01-27] 이미지 비율 설정 (config.json에서 - localStorage는 메인 프로세스에서 접근 불가)
            const imageRatio = (item as any).imageRatio || (config as any).imageRatio || '1:1';
            const sizeMap: Record<string, string> = {
                '1:1': '1024x1024',
                '16:9': '1344x768',
                '9:16': '768x1344',
                '4:3': '1152x896',
                '3:4': '896x1152'
            };
            const imageSize = sizeMap[imageRatio] || '1024x1024';

            console.log(`[DeepInfra] 📐 이미지 비율: ${imageRatio} → ${imageSize}`);

            // ✅ [2026-02-12] 재시도 루프 (NanoBananaPro와 동일 전략 — 최대 2회)
            const maxRetries = 2;
            let res: DeepInfraResult | null = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                let attemptPrompt = prompt;

                // ✅ 재시도 시 프롬프트 변형 (이미지 다양성 확보)
                if (attempt > 1) {
                    const randomVariation = VARIATION_STYLES[Math.floor(Math.random() * VARIATION_STYLES.length)];
                    attemptPrompt += ` [VARIATION: ${randomVariation}]`;
                    console.log(`[DeepInfra] 🔄 재시도 ${attempt}/${maxRetries}: ${randomVariation}`);
                }

                res = await generateSingleDeepInfraImage({
                    prompt: attemptPrompt,
                    size: imageSize,
                    n: 1,
                    model: actualModel
                }, apiKey);

                if (res.success && res.localPath) break; // 성공하면 루프 탈출

                if (attempt < maxRetries) {
                    console.log(`[DeepInfra] ⚠️ 시도 ${attempt} 실패, ${attempt + 1}번째 재시도...`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
                }
            }

            if (!res) {
                console.error(`[DeepInfra] ❌ "${item.heading}" 모든 재시도 실패`);
                continue;
            }


            if (res.success && res.localPath) {
                let buffer: Buffer = fs.readFileSync(res.localPath);

                // ✅ [2026-01-30 100점] FLUX AI 생성 텍스트 완전 제거 - 하단 크롭
                // FLUX 모델은 항상 이미지 하단에 텍스트를 넣으므로, 하단을 잘라내고 다시 리사이즈
                // ✅ [2026-02-20 FIX] allowText가 true면 더 많이 크롭 (35%) → 텍스트 오버레이로 대체되므로
                const isFirstImage = i === 0;
                const explicitlyAllowText = (item as any).allowText === true;
                const shouldApplyTextOverlay = isFirstImage && explicitlyAllowText && postTitle;
                const cropRatio = shouldApplyTextOverlay ? 0.65 : 0.80; // 텍스트 오버레이 시 35% 크롭, 아니면 20%

                try {
                    const metadata = await sharp(buffer).metadata();
                    if (metadata.width && metadata.height) {
                        const cropHeight = Math.floor(metadata.height * cropRatio);
                        buffer = await sharp(buffer)
                            .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
                            .resize(metadata.width, metadata.height, { fit: 'fill' }) // 원래 크기로 다시 리사이즈
                            .toBuffer();
                        console.log(`[DeepInfra] ✂️ 하단 텍스트 영역 크롭 완료 (${metadata.height} → ${cropHeight} → ${metadata.height}, ratio: ${cropRatio})`);
                    }
                } catch (cropError) {
                    console.warn(`[DeepInfra] ⚠️ 크롭 실패, 원본 사용:`, cropError);
                }

                // ✅ [2026-01-30 FIX] 텍스트 오버레이 조건 수정:
                // - i === 0 (1번 이미지만)
                // - allowText === true (명시적으로 설정된 경우만)
                // - 나노바나나프로는 AI가 직접 텍스트 생성하므로 여기서는 DeepInfra만 해당

                if (shouldApplyTextOverlay) {
                    // ✅ [2026-03-12 FIX] 텍스트 오버레이는 imageGenerator.ts의 applyKoreanTextOverlayIfNeeded에서 일괄 처리
                    // 여기서 추가로 적용하면 2중 오버레이가 발생하므로 제거
                    console.log(`[DeepInfra] ℹ️ 텍스트 오버레이는 imageGenerator.ts에서 일괄 적용 예정`);
                }

                const savedResult = await writeImageFile(buffer, 'png', item.heading, postTitle, postId);

                results.push({
                    heading: item.heading,
                    filePath: savedResult.savedToLocal || savedResult.filePath,
                    provider: 'deepinfra',
                    previewDataUrl: savedResult.previewDataUrl,
                    savedToLocal: savedResult.savedToLocal,
                    originalIndex: (item as any).originalIndex, // ✅ [2026-03-05 FIX] headingImageMode 필터링 후 정확한 소제목 매칭
                });

                // 임시 파일 정리
                try { fs.unlinkSync(res.localPath); } catch { }

                // ✅ [2026-03-19] 사용량 추적
                trackApiUsage('deepinfra', { images: 1, model: actualModel });

                console.log(`[DeepInfra] ✅ [${i + 1}/${items.length}] "${item.heading}" 완료`);

                // ✅ [2026-02-27] 실시간 콜백 호출
                if (onImageGenerated) {
                    try { onImageGenerated(results[results.length - 1], i, items.length); } catch (cbErr) { /* 콜백 오류 무시 */ }
                }
            }
        } catch (error) {
            console.error(`[DeepInfra] ❌ "${item.heading}" 생성 실패:`, (error as Error).message);
        }
    }

    console.log(`[DeepInfra] ✅ 완료: ${results.length}/${items.length}개 성공`);
    return results;
}

/**
 * DeepInfra로 단일 이미지 생성 (핵심 로직)
 */
export async function generateSingleDeepInfraImage(
    options: DeepInfraGenerateOptions,
    apiKey: string
): Promise<DeepInfraResult> {
    try {
        // OpenAI 호환 API 호출 (공식 문서: https://deepinfra.com/black-forest-labs/FLUX-2-dev/api)
        const response = await axios.post(
            DEEPINFRA_API_URL,
            {
                prompt: options.prompt,
                size: options.size || '1024x1024',
                model: options.model || DEFAULT_DEEPINFRA_MODEL,
                n: options.n || 1
                // ✅ response_format 불필요 - API가 기본으로 b64_json 반환
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 120000, // 2분 타임아웃
            }
        );

        const data = response.data;

        if (!data.data || data.data.length === 0) {
            return { success: false, error: 'DeepInfra 응답에 이미지가 없습니다.' };
        }

        // base64 이미지 데이터 추출 (공식 응답 형식: { data: [{ b64_json: "..." }] })
        const imageData = data.data[0].b64_json;

        if (!imageData) {
            return { success: false, error: 'DeepInfra 응답에 b64_json이 없습니다.' };
        }

        // Base64 → 파일 저장
        const buffer = Buffer.from(imageData, 'base64');
        const filename = `deepinfra_${Date.now()}.png`;
        const localPath = path.join(app.getPath('temp'), filename);

        fs.writeFileSync(localPath, buffer);

        return {
            success: true,
            imageData,
            localPath,
        };

    } catch (error: any) {
        const msg = error.response?.data?.error?.message ||
            error.response?.data?.detail ||
            error.message ||
            'DeepInfra API Error';
        console.error('[DeepInfra] 오류 발생:', msg);
        return { success: false, error: msg };
    }
}

/**
 * DeepInfra API 테스트
 */
export async function testDeepInfra(): Promise<{ success: boolean; message: string }> {
    try {
        const config = await loadConfig();
        const apiKey = (config as any).deepinfraApiKey?.trim();
        if (!apiKey) return { success: false, message: 'DeepInfra API 키가 없습니다.' };

        const result = await generateSingleDeepInfraImage({
            prompt: 'A cute robot artist painting a landscape, 4k, digital art',
            size: '512x512', // 테스트용 작은 사이즈
        }, apiKey);

        if (result.success) {
            // 테스트 파일 정리
            if (result.localPath) {
                try { fs.unlinkSync(result.localPath); } catch { }
            }
            return { success: true, message: '✅ DeepInfra FLUX-2-dev 테스트 성공!' };
        } else {
            return { success: false, message: result.error || '실패' };
        }
    } catch (error: any) {
        return { success: false, message: `오류: ${error.message}` };
    }
}

/**
 * ✅ [2026-01-28] FLUX Redux img2img 생성
 * - 참조 이미지 URL을 기반으로 이미지 변형 생성
 * - URL 크롤링에서 수집된 이미지를 활용 가능
 */
export async function generateDeepInfraImg2Img(
    referenceImageUrl: string,
    prompt: string,
    apiKey: string,
    options: {
        width?: number;
        height?: number;
        guidanceScale?: number;
        numInferenceSteps?: number;
    } = {}
): Promise<DeepInfraResult> {
    try {
        console.log(`[DeepInfra Redux] 🎨 img2img 생성 시작: ${referenceImageUrl.substring(0, 50)}...`);
        console.log(`[DeepInfra Redux] 📝 프롬프트: ${prompt.substring(0, 100)}...`);

        // 1. 참조 이미지 다운로드 및 base64 변환
        let imageBase64: string;

        if (referenceImageUrl.startsWith('data:')) {
            // 이미 base64인 경우
            imageBase64 = referenceImageUrl.split(',')[1] || referenceImageUrl;
        } else {
            // URL에서 다운로드
            console.log('[DeepInfra Redux] 📥 참조 이미지 다운로드 중...');
            const response = await axios.get(referenceImageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/*',
                }
            });
            imageBase64 = Buffer.from(response.data).toString('base64');
            console.log(`[DeepInfra Redux] ✅ 이미지 다운로드 완료 (${Math.round(imageBase64.length / 1024)}KB)`);
        }

        // 2. FLUX Redux API 호출
        const {
            width = 1024,
            height = 1024,
            guidanceScale = 7.5,
            numInferenceSteps = 25
        } = options;

        console.log(`[DeepInfra Redux] 📡 API 호출 중... (${width}x${height}, guidance: ${guidanceScale})`);

        const response = await axios.post(
            DEEPINFRA_REDUX_API_URL,
            {
                image: imageBase64,
                prompt: prompt,
                width: width,
                height: height,
                guidance_scale: guidanceScale,
                num_inference_steps: numInferenceSteps,
                num_images: 1
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 120000,
            }
        );

        const data = response.data;

        // 응답에서 이미지 추출
        let outputImageBase64 = '';

        if (data.images && data.images.length > 0) {
            // 응답 형식 1: { images: [base64...] }
            outputImageBase64 = data.images[0];
        } else if (data.output && data.output.length > 0) {
            // 응답 형식 2: { output: [base64...] }
            outputImageBase64 = data.output[0];
        } else if (data.image) {
            // 응답 형식 3: { image: base64 }
            outputImageBase64 = data.image;
        } else {
            console.error('[DeepInfra Redux] ❌ 응답에서 이미지를 찾을 수 없습니다:', Object.keys(data));
            return { success: false, error: 'FLUX Redux 응답에 이미지가 없습니다.' };
        }

        // 3. 결과 저장
        const buffer = Buffer.from(outputImageBase64, 'base64');
        const filename = `deepinfra_redux_${Date.now()}.png`;
        const localPath = path.join(app.getPath('temp'), filename);
        fs.writeFileSync(localPath, buffer);

        console.log(`[DeepInfra Redux] ✅ img2img 생성 완료! ${localPath}`);

        return {
            success: true,
            imageData: outputImageBase64,
            localPath,
        };

    } catch (error: any) {
        const msg = error.response?.data?.error?.message ||
            error.response?.data?.detail ||
            error.message ||
            'DeepInfra Redux API Error';
        console.error('[DeepInfra Redux] ❌ img2img 오류:', msg);
        return { success: false, error: msg };
    }
}

/**
 * ✅ [2026-01-28] 참조 이미지가 있으면 img2img, 없으면 text-to-image
 * - 크롤링에서 수집된 이미지를 자동으로 활용
 */
export async function generateDeepInfraWithReference(
    item: ImageRequestItem,
    apiKey: string,
    postTitle?: string,
    postId?: string
): Promise<GeneratedImage | null> {
    const referenceUrl = item.referenceImageUrl;

    // 참조 이미지가 있으면 img2img 사용
    if (referenceUrl) {
        console.log(`[DeepInfra] 🖼️ 참조 이미지 감지 → img2img 모드 사용`);

        // ✅ [2026-01-30 FIX] 프롬프트에 다양한 구도 지시 추가 + 참조 이미지 맥락 활용
        const basePrompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading);
        const diversityPrompt = `${basePrompt}, inspired by reference image context and style, varied camera angle, NOT front-facing portrait, dynamic composition, situational scene matching the headline`;

        const result = await generateDeepInfraImg2Img(
            referenceUrl,
            diversityPrompt,
            apiKey,
            {
                width: 1024,
                height: 1024,
                guidanceScale: 3.5, // ✅ [2026-01-30 FIX] 더 낮춰서 참조 이미지 영향력 강화
                numInferenceSteps: 30 // ✅ 품질 향상을 위해 스텝 증가
            }
        );

        if (result.success && result.localPath) {
            const buffer = fs.readFileSync(result.localPath);
            const savedResult = await writeImageFile(buffer, 'png', item.heading, postTitle, postId);

            // 임시 파일 정리
            try { fs.unlinkSync(result.localPath); } catch { }

            return {
                heading: item.heading,
                filePath: savedResult.savedToLocal || savedResult.filePath,
                provider: 'deepinfra',
                previewDataUrl: savedResult.previewDataUrl,
                savedToLocal: savedResult.savedToLocal,
                originalIndex: (item as any).originalIndex, // ✅ [2026-03-05 FIX] headingImageMode 필터링 후 정확한 소제목 매칭
            };
        } else {
            console.warn(`[DeepInfra] ⚠️ img2img 실패, text-to-image로 폴백: ${result.error}`);
            // img2img 실패 시 null 반환 → 호출자가 기존 로직 사용
            return null;
        }
    }

    return null; // 참조 이미지 없음 → 기존 text-to-image 사용
}
