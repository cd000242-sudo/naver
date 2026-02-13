/**
 * ✅ [2026-02-12 100점] Stability AI 이미지 및 비디오 생성기
 * - 퍼지 카테고리 매칭 (getStyleGuideByCategory)
 * - 쇼핑커넥트 라이프스타일 스타일
 * - NO PEOPLE 충돌 방지
 * - 재시도 + 프롬프트 변형 (VARIATION_STYLES)
 * - 28개 카테고리 × 실사/애니메 스타일
 * - 비즈니스/사회 카테고리 Korean hands 스타일
 */

import type { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { PromptBuilder } from './promptBuilder.js';
import { loadConfig } from '../configManager.js';
import { addThumbnailTextOverlay } from './textOverlay.js';
import axios from 'axios';
import FormData from 'form-data';
// ✅ [2026-02-12 100점] 공유 유틸리티 임포트
import {
    getStyleGuideByCategory,
    SHOPPING_CONNECT_LIFESTYLE,
    VARIATION_STYLES,
    REALISTIC_CATEGORY_STYLES,
    ANIME_CATEGORY_STYLES,
    STYLE_PROMPT_MAP,
    filterPersonKeywordsIfNeeded,
} from './imageStyles.js';

// ✅ [2026-01-16] Stability AI 모델 매핑 (configManager 설정값 → API 엔드포인트/모델)
export const STABILITY_MODELS: Record<string, { endpoint: string; modelParam?: string; name: string }> = {
    'sdxl-1.0': { endpoint: 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', name: '💰 SDXL 1.0 (₩13)' },
    'sd35-flash': { endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/sd3', modelParam: 'sd3.5-flash', name: '⚡ SD 3.5 Flash (₩35)' },
    'sd35-medium': { endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/sd3', modelParam: 'sd3.5-medium', name: '⚖️ SD 3.5 Medium (₩49)' },
    'sd35-large-turbo': { endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/sd3', modelParam: 'sd3.5-large-turbo', name: '🚀 SD 3.5 Large Turbo (₩56)' },
    'sd35-large': { endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/sd3', modelParam: 'sd3.5-large', name: '🎨 SD 3.5 Large (₩91)' },
    'stable-image-ultra': { endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/ultra', name: '👑 Stable Image Ultra (₩112)' },
};

/**
 * ✅ [2026-02-12 100점] Stability AI로 이미지 생성
 * - 퍼지 카테고리 매칭
 * - 쇼핑커넥트 라이프스타일
 * - NO PEOPLE 충돌 방지
 * - 재시도 + 프롬프트 변형
 */
export async function generateWithStability(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    isFullAuto: boolean = false,
    providedApiKey?: string,
    modelOverride?: string,
    isShoppingConnect: boolean = false // ✅ [2026-02-12] 쇼핑커넥트 모드
): Promise<GeneratedImage[]> {
    const config = await loadConfig();
    const apiKey = providedApiKey || (config as any).stabilityApiKey?.trim() || process.env.STABILITY_API_KEY;
    const selectedModel = modelOverride || (config as any).stabilityModel || 'sd35-large-turbo';

    if (!apiKey) {
        throw new Error('Stability AI API 키가 설정되지 않았습니다.');
    }

    const imageRatio = (config as any).imageRatio || '1:1';
    console.log(`[Stability] 🎨 총 ${items.length}개 이미지 생성 시작 (모델: ${selectedModel}, 비율: ${imageRatio}, 쇼핑커넥트: ${isShoppingConnect})`);

    const results: GeneratedImage[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isThumbnail = i === 0 || (item as any).isThumbnail;
        const itemRatio = (item as any).imageRatio || imageRatio;

        console.log(`[Stability] 🎨 [${i + 1}/${items.length}] "${item.heading}" 생성 중... (Model: ${selectedModel})`);

        try {
            // ═══════════════════════════════════════════════════════
            // 재시도 루프 (최대 2회, 프롬프트 변형)
            // ═══════════════════════════════════════════════════════
            const maxRetries = 2;
            let imageBuffer: Buffer | null = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const variationHint = attempt > 1
                        ? VARIATION_STYLES[Math.floor(Math.random() * VARIATION_STYLES.length)]
                        : undefined;

                    if (variationHint) {
                        console.log(`[Stability] 🔄 재시도 ${attempt}/${maxRetries}: ${variationHint}`);
                    }

                    imageBuffer = await generateSingleStabilityImage(
                        item, apiKey, isThumbnail, selectedModel, postTitle, itemRatio, isShoppingConnect, variationHint
                    );

                    if (imageBuffer && imageBuffer.length > 0) break;
                } catch (retryError) {
                    console.warn(`[Stability] ⚠️ 시도 ${attempt} 실패: ${(retryError as Error).message}`);
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        throw retryError;
                    }
                }
            }

            if (!imageBuffer) throw new Error('이미지 버퍼가 비어있습니다.');

            // ✅ 텍스트 오버레이 (1번 이미지 + allowText)
            const isFirstImage = i === 0;
            const explicitlyAllowText = (item as any).allowText === true;
            const shouldApplyTextOverlay = isFirstImage && explicitlyAllowText && postTitle;

            if (shouldApplyTextOverlay) {
                console.log(`[Stability] 📝 1번 이미지 텍스트 오버레이 적용 중...`);
                try {
                    const overlayResult = await addThumbnailTextOverlay(imageBuffer, postTitle);
                    if (overlayResult.success && overlayResult.outputBuffer) {
                        imageBuffer = overlayResult.outputBuffer;
                        console.log(`[Stability] ✅ 텍스트 오버레이 적용 완료`);
                    }
                } catch (overlayError) {
                    console.warn(`[Stability] ⚠️ 텍스트 오버레이 예외:`, overlayError);
                }
            }

            const savedResult = await writeImageFile(imageBuffer, 'webp', item.heading, postTitle, postId);

            results.push({
                heading: item.heading,
                filePath: savedResult.savedToLocal || savedResult.filePath,
                provider: 'stability',
                previewDataUrl: savedResult.previewDataUrl,
                savedToLocal: savedResult.savedToLocal
            });

            console.log(`[Stability] ✅ 이미지 생성 성공: ${item.heading}`);

        } catch (error: any) {
            console.error(`[Stability] ❌ 실패:`, error.message);
        }
    }

    return results;
}

/**
 * ✅ [2026-02-12 100점] 단일 이미지 생성
 * - 퍼지 카테고리 매칭
 * - 쇼핑커넥트 오버라이드
 * - NO PEOPLE 충돌 방지
 * - 재시도 변형 힌트
 */
async function generateSingleStabilityImage(
    item: ImageRequestItem,
    apiKey: string,
    isThumbnail: boolean,
    model: string = 'ultra',
    postTitle?: string,
    imageRatio: string = '1:1',
    isShoppingConnect: boolean = false,
    variationHint?: string
): Promise<Buffer> {
    // ═══════════════════════════════════════════════════════
    // 1️⃣ 이미지 스타일 결정
    // ═══════════════════════════════════════════════════════
    const configModule = await import('../configManager.js');
    const config = await configModule.loadConfig();
    const imageStyle = (item as any).imageStyle || (config as any).imageStyle || 'realistic';
    const isAnime = imageStyle === 'anime';
    console.log(`[Stability] 🎨 이미지 스타일: ${imageStyle}`);

    // ═══════════════════════════════════════════════════════
    // 2️⃣ 카테고리 스타일 가져오기 (퍼지 매칭)
    // ═══════════════════════════════════════════════════════
    const categoryStyleMap = isAnime ? ANIME_CATEGORY_STYLES : REALISTIC_CATEGORY_STYLES;
    const { styleGuide: categoryStyle, matchedKey } = getStyleGuideByCategory(item.category, categoryStyleMap);
    console.log(`[Stability] 📂 카테고리: "${item.category}" → 매칭: "${matchedKey}"`);

    // ═══════════════════════════════════════════════════════
    // 3️⃣ 쇼핑커넥트 모드 → 라이프스타일 스타일 오버라이드
    // ═══════════════════════════════════════════════════════
    const styleGuide = isShoppingConnect ? SHOPPING_CONNECT_LIFESTYLE : categoryStyle;
    if (isShoppingConnect) {
        console.log(`[Stability] 🛒 쇼핑커넥트 모드 → 라이프스타일 스타일 적용`);
    }

    // ═══════════════════════════════════════════════════════
    // 4️⃣ 스타일 프롬프트 매핑
    // ═══════════════════════════════════════════════════════
    const stylePrompt = STYLE_PROMPT_MAP[imageStyle] || STYLE_PROMPT_MAP['realistic'];
    const isNonRealisticStyle = imageStyle !== 'realistic' && imageStyle !== 'bokeh' && !isAnime;

    // ═══════════════════════════════════════════════════════
    // 5️⃣ PromptBuilder로 프롬프트 생성
    // ═══════════════════════════════════════════════════════
    let prompt = '';
    try {
        const categoryStyleToUse = isNonRealisticStyle ? stylePrompt : styleGuide;

        // ✅ NO PEOPLE 충돌 방지 처리를 위한 basePrompt 준비
        let basePrompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading || 'Abstract Image');
        basePrompt = filterPersonKeywordsIfNeeded(styleGuide, basePrompt, item.heading, sanitizeImagePrompt);

        // PromptBuilder 활용
        const modifiedItem = { ...item, englishPrompt: basePrompt };
        prompt = PromptBuilder.build(modifiedItem, {
            isThumbnail,
            postTitle,
            categoryStyle: categoryStyleToUse
        });
    } catch {
        // Fallback
        let baseSubject = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading || 'Abstract Image');
        baseSubject = filterPersonKeywordsIfNeeded(styleGuide, baseSubject, item.heading, sanitizeImagePrompt);
        prompt = isThumbnail && postTitle
            ? `Generate a premium, high-impact blog thumbnail for "${postTitle}". Topic: ${baseSubject}. Style: ${stylePrompt}. ${styleGuide}. High contrast, vibrant colors.`
            : `Photorealistic image of "${item.heading}". Context: ${baseSubject}. Style: ${stylePrompt}. ${styleGuide}. 8k resolution, cinematic lighting.`;
    }

    // ✅ 실사 외 스타일인 경우 스타일 강화 프롬프트 추가
    if (isNonRealisticStyle) {
        prompt = `[ART STYLE: ${imageStyle.toUpperCase()}]\n${stylePrompt}\n\n${prompt}\n\nIMPORTANT: Generate the image in ${imageStyle} style. DO NOT generate photorealistic images.`;
        console.log(`[Stability] 🎨 스타일 프롬프트 적용: ${imageStyle}`);
    }

    // ✅ 재시도 프롬프트 변형 적용
    if (variationHint) {
        prompt += ` [VARIATION: ${variationHint}]`;
    }

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('output_format', 'webp');
    formData.append('aspect_ratio', imageRatio);
    console.log(`[Stability] 📐 이미지 비율: ${imageRatio}`);

    // ✅ STABILITY_MODELS 매핑 테이블로 엔드포인트/모델 파라미터 결정
    const modelConfig = STABILITY_MODELS[model];
    let endpoint: string;

    if (modelConfig) {
        endpoint = modelConfig.endpoint;
        if (modelConfig.modelParam) {
            formData.append('model', modelConfig.modelParam);
        }
        console.log(`[Stability] 📌 모델 설정 적용: ${modelConfig.name}`);
    } else {
        endpoint = 'https://api.stability.ai/v2beta/stable-image/generate/ultra';
        console.warn(`[Stability] ⚠️ 알 수 없는 모델 "${model}", Ultra로 fallback`);
    }

    const response = await axios.post(
        endpoint,
        formData,
        {
            headers: {
                ...formData.getHeaders(),
                Authorization: `Bearer ${apiKey}`,
                Accept: 'image/*'
            },
            responseType: 'arraybuffer',
            timeout: 60000
        }
    );

    return Buffer.from(response.data);
}

/**
 * 비디오 생성 (Stable Video Diffusion) - 안전장치 추가됨
 */
export async function generateStabilityVideo(imageBuffer: Buffer, apiKey: string): Promise<Buffer> {
    const formData = new FormData();
    formData.append('image', imageBuffer, { filename: 'image.webp' });
    formData.append('seed', '0');
    formData.append('cfg_scale', '1.8');
    formData.append('motion_bucket_id', '127');

    console.log('[Stability] 🎬 비디오 생성 요청 중...');

    const response = await axios.post(
        'https://api.stability.ai/v2beta/image-to-video',
        formData,
        {
            headers: {
                ...formData.getHeaders(),
                Authorization: `Bearer ${apiKey}`
            },
            timeout: 30000
        }
    );

    const generationId = response.data.id;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
            const resultResponse = await axios.get(
                `https://api.stability.ai/v2beta/image-to-video/result/${generationId}`,
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        Accept: 'video/*'
                    },
                    responseType: 'arraybuffer',
                    timeout: 10000
                }
            );

            if (resultResponse.status === 202) {
                console.log(`[Stability] ⏳ 비디오 처리 중... (${attempts}/${MAX_ATTEMPTS})`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                continue;
            }

            if (resultResponse.status === 200) {
                console.log('[Stability] ✅ 비디오 생성 완료!');
                return Buffer.from(resultResponse.data);
            }
        } catch (error: any) {
            throw new Error(`비디오 결과 조회 실패: ${error.message}`);
        }
    }

    throw new Error('비디오 생성 시간 초과 (Timeout)');
}
