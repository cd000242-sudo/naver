// ✅ [2026-02-23] Leonardo AI Image Generator
// Leonardo AI REST API를 사용한 이미지 생성
// v1 API: Phoenix 1.0
// v2 API: SeeDream 4.5 (기본), Ideogram 3.0, Nano Banana Pro

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { loadConfig } from '../configManager.js';
import { trackApiUsage } from '../apiUsageTracker.js';
import { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { STYLE_PROMPT_MAP, isNoPersonCategory, getPresetStyleMapping, getStyleNegativePrompt, getImageDiversityHints } from './imageStyles.js';
import { addThumbnailTextOverlay } from './textOverlay.js';
import { AutomationService } from '../main/services/AutomationService.js';

const LEONARDO_API_V1 = 'https://cloud.leonardo.ai/api/rest/v1';
const LEONARDO_API_V2 = 'https://cloud.leonardo.ai/api/rest/v2';

// ═══════════════════════════════════════════════════════════
// Leonardo AI 모델 매핑 (v1 API — UUID 기반)
// ═══════════════════════════════════════════════════════════
const LEONARDO_V1_MODEL_MAP: Record<string, string> = {
    'phoenix-1.0': 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3',  // Phoenix 1.0 (토큰 차감)
};

// ═══════════════════════════════════════════════════════════
// v2 API 모델 (model string 기반, UUID 아님)
// ═══════════════════════════════════════════════════════════
const LEONARDO_V2_MODEL_MAP: Record<string, string> = {
    'seedream-4.5': 'seedream-4.5',          // SeeDream 4.5 ($0.04/장, 가성비 최강)
    'ideogram-3.0': 'ideogram-v3.0',         // Ideogram 3.0 ($0.11/장, 텍스트 렌더링)
    'nano-banana-pro': 'gemini-image-2',     // Nano Banana Pro ($0.21/장, 한글 최강)
};

// v2 API를 사용하는 모델인지 확인
function isV2Model(modelKey: string): boolean {
    return modelKey in LEONARDO_V2_MODEL_MAP;
}

const DEFAULT_LEONARDO_MODEL = 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3'; // Phoenix 1.0 UUID (v1 폴백용)

/**
 * v1 API 생성 요청 (Phoenix, FLUX Kontext 등)
 */
async function requestV1Generation(
    apiKey: string,
    modelId: string,
    prompt: string,
    width: number,
    height: number,
    imageStyle?: string,
    initImageId?: string | null  // ✅ [2026-03-03] 참조 이미지 ID (img2img)
): Promise<string> {
    const presetStyle = getPresetStyleMapping(imageStyle || 'realistic');
    const negativePrompt = getStyleNegativePrompt(imageStyle || 'realistic');
    console.log(`[LeonardoAI-v1] 🎨 presetStyle: ${presetStyle}, negativePrompt 길이: ${negativePrompt.length}${initImageId ? ', initImage: ' + initImageId : ''}`);

    const requestBody: any = {
        prompt: prompt,
        negative_prompt: negativePrompt,
        modelId: modelId,
        width, height,
        num_images: 1,
        alchemy: true,
        presetStyle: presetStyle,
        promptMagic: false,
        promptMagicStrength: 0
    };

    // ✅ [2026-03-03] 참조 이미지가 있으면 init-image로 전달 (img2img)
    if (initImageId) {
        requestBody.init_generation_image_id = initImageId;
        requestBody.init_strength = 0.35;  // 0.0~1.0, 낮을수록 참조 이미지 영향 큼
        console.log(`[LeonardoAI-v1] 🖼️ init-image 모드 활성화 (strength: 0.35)`);
    }

    const genResponse = await axios.post(
        `${LEONARDO_API_V1}/generations`,
        requestBody,
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }
    );

    const generationId = genResponse.data?.sdGenerationJob?.generationId;
    if (!generationId) {
        throw new Error('v1 생성 ID를 받지 못했습니다: ' + JSON.stringify(genResponse.data));
    }
    return generationId;
}

/**
 * v2 API 생성 요청 (Nano Banana Pro)
 */
async function requestV2Generation(
    apiKey: string,
    modelString: string,
    prompt: string,
    width: number,
    height: number
): Promise<string> {
    const genResponse = await axios.post(
        `${LEONARDO_API_V2}/generations`,
        {
            model: modelString,
            parameters: {
                width: width,
                height: height,
                prompt: prompt,
                quantity: 1,
                prompt_enhance: 'OFF'
            },
            public: false
        },
        {
            headers: {
                'authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }
    );

    // v2 응답에서 generationId 추출
    // v2 응답 구조: { generate: { generationId: "...", cost: {...} } }
    const generationId = genResponse.data?.generate?.generationId
        || genResponse.data?.generationId
        || genResponse.data?.sdGenerationJob?.generationId
        || genResponse.data?.id;
    if (!generationId) {
        throw new Error('v2 생성 ID를 받지 못했습니다: ' + JSON.stringify(genResponse.data));
    }
    return generationId;
}

/**
 * 생성 결과 폴링 (v1 API 사용 — v2 생성도 v1으로 폴링)
 * Leonardo AI 문서에 따르면 GET /generations/{id}는 v1에서만 지원
 */
async function pollGenerationResult(
    apiKey: string,
    generationId: string,
    _apiVersion: 'v1' | 'v2' = 'v1'
): Promise<string> {
    // ✅ 항상 v1 API로 폴링 (v2에는 GET /generations/{id} 없음)
    const baseUrl = LEONARDO_API_V1;
    const pollInterval = 3000;
    const maxPollTime = 120000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollTime) {
        if (AutomationService.isCancelRequested()) {
            throw new Error('사용자 중지 요청');
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const statusResponse = await axios.get(
            `${baseUrl}/generations/${generationId}`,
            {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                timeout: 15000
            }
        );

        // v1: data.generations_by_pk, v2: data.generation 또는 data.generations_by_pk
        const generation = statusResponse.data?.generations_by_pk
            || statusResponse.data?.generation
            || statusResponse.data;
        const status = generation?.status;

        if (status === 'COMPLETE') {
            const images = generation?.generated_images || generation?.images;
            if (images && images.length > 0) {
                const imageUrl = images[0].url || images[0].uri;
                if (imageUrl) {
                    console.log(`[LeonardoAI] ✅ 이미지 생성 완료! (${((Date.now() - startTime) / 1000).toFixed(1)}초 소요)`);
                    return imageUrl;
                }
            }
            throw new Error('이미지 URL을 찾을 수 없습니다.');
        } else if (status === 'FAILED') {
            throw new Error('Leonardo AI 이미지 생성 실패');
        }

        console.log(`[LeonardoAI] ⏳ 상태: ${status} (${((Date.now() - startTime) / 1000).toFixed(0)}초 경과)`);
    }

    throw new Error('이미지 생성 타임아웃 (120초 초과)');
}

/**
 * Leonardo AI로 일괄 이미지 생성
 */
export async function generateWithLeonardoAI(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    isFullAuto: boolean = false,
    providedApiKey?: string,
    isShoppingConnect: boolean = false,
    onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,  // ✅ [2026-02-27] 실시간 콜백
    collectedImages?: string[]  // ✅ [2026-03-03] 수집 이미지 참조 (img2img)
): Promise<GeneratedImage[]> {
    const config = await loadConfig();
    const apiKey = providedApiKey || (config as any).leonardoaiApiKey?.trim();

    if (!apiKey) {
        throw new Error('Leonardo AI API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.');
    }

    // 모델 선택
    const selectedModelKey = (config as any).leonardoaiModel || 'seedream-4.5';
    const useV2 = isV2Model(selectedModelKey);
    const modelIdOrString = useV2
        ? LEONARDO_V2_MODEL_MAP[selectedModelKey]
        : (LEONARDO_V1_MODEL_MAP[selectedModelKey] || DEFAULT_LEONARDO_MODEL);

    const apiLabel = useV2 ? 'v2' : 'v1';
    console.log(`[LeonardoAI] 🎨 총 ${items.length}개 이미지 생성 시작 (모델: ${selectedModelKey}, API: ${apiLabel})`);

    // ✅ [2026-03-03] 참조 이미지 업로드 (v1 API init-image용)
    let initImageId: string | null = null;
    if (isShoppingConnect && collectedImages && collectedImages.length > 0 && !useV2) {
        try {
            const firstImage = collectedImages[0];
            const candidateUrl = typeof firstImage === 'string'
                ? firstImage
                : ((firstImage as any)?.url || (firstImage as any)?.thumbnailUrl || '');
            if (candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
                console.log(`[LeonardoAI] 🖼️ 참조 이미지 업로드 시작: ${candidateUrl.substring(0, 80)}...`);
                // Step 1: 프리사인 URL 획득
                const presignResponse = await axios.post(
                    `${LEONARDO_API_V1}/init-image`,
                    { extension: 'png' },
                    { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 15000 }
                );
                const presignData = presignResponse.data?.uploadInitImage;
                if (presignData?.url && presignData?.id) {
                    // Step 2: 참조 이미지 다운로드
                    const refResponse = await axios.get(candidateUrl, { responseType: 'arraybuffer', timeout: 15000 });
                    const refBuf = Buffer.from(refResponse.data);

                    // Step 3: S3에 업로드
                    const formFields = presignData.fields ? JSON.parse(presignData.fields) : {};
                    const FormData = (await import('form-data')).default;
                    const form = new FormData();
                    Object.entries(formFields).forEach(([key, value]) => form.append(key, value as string));
                    form.append('file', refBuf, { filename: 'reference.png', contentType: 'image/png' });

                    await axios.post(presignData.url, form, {
                        headers: { ...form.getHeaders() },
                        timeout: 30000
                    });

                    initImageId = presignData.id;
                    console.log(`[LeonardoAI] ✅ 참조 이미지 업로드 완료 (ID: ${initImageId}) → img2img 모드 활성화`);
                }
            }
        } catch (uploadErr: any) {
            console.warn(`[LeonardoAI] ⚠️ 참조 이미지 업로드 실패: ${uploadErr.message} → text-to-image로 진행`);
            initImageId = null;
        }
    }

    const results: GeneratedImage[] = [];

    for (let i = 0; i < items.length; i++) {
        if (AutomationService.isCancelRequested()) {
            console.log('[LeonardoAI] ⛔ 중지 요청 감지 → 이미지 생성 중단');
            break;
        }

        const item = items[i];
        console.log(`[LeonardoAI] 🖼️ [${i + 1}/${items.length}] "${item.heading}" 생성 중...`);

        try {
            // ✅ [2026-02-23] imageStyle 핸들링 구현
            const imageStyle = (item as any).imageStyle || 'realistic';
            console.log(`[LeonardoAI] 🎨 이미지 스타일: ${imageStyle}`);

            // 프롬프트 구성
            let prompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading);

            // 한글 제거
            if (/[가-힣]/.test(prompt)) {
                prompt = prompt.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]+/g, '').replace(/\s+/g, ' ').trim();
            }

            // 스타일별 프롬프트 분기
            // ✅ [2026-03-03 FIX] Leonardo에도 스타일 프롬프트(STYLE_PROMPT_MAP) 적용 + 한국인 인물 지시
            const dh = getImageDiversityHints(i);
            console.log(`[LeonardoAI] 🎲 다양성[${i}]: 📐${dh.angle.split(',')[0]} | 💡${dh.lighting.split(',')[0]} | 🎨${dh.color.split(',')[0]}`);

            // ✅ 스타일 프롬프트 적용 (stickman/roundy/2d/disney 등)
            const stylePromptText = STYLE_PROMPT_MAP[imageStyle] || STYLE_PROMPT_MAP['realistic'];
            const isRealistic = imageStyle === 'realistic' || !imageStyle;

            // ✅ [2026-03-12 FIX] NO TEXT 지시를 프롬프트 맨 앞에 배치 → AI가 텍스트 렌더링 강력 방지
            const NO_TEXT_PREFIX = 'CRITICAL RULE: This image must contain ZERO text, ZERO letters, ZERO words, ZERO writing of any kind. Generate a COMPLETELY TEXT-FREE image.';

            if (isShoppingConnect) {
                if (initImageId) {
                    prompt = `${NO_TEXT_PREFIX} Based on this product reference image, create a premium lifestyle photograph showing this exact product being used by a Korean person (20-40s). ${dh.angle}, ${dh.framing}, ${prompt}, luxury Korean lifestyle setting, ${dh.lighting}, ${dh.focus}, maintain the product's exact appearance.`;
                } else {
                    prompt = `${NO_TEXT_PREFIX} ${dh.angle}, ${dh.framing}, Premium lifestyle photography with Korean person, ${dh.personAction}, using or enjoying the product, ${prompt}, luxury lifestyle setting, ${dh.lighting}, ${dh.focus}.`;
                }
            } else if (!isRealistic) {
                prompt = `${NO_TEXT_PREFIX} ${stylePromptText}, ${prompt}.`;
            } else {
                const koreanPersonDirective = 'If any person appears in this image, they must be Korean with East Asian features. ';
                prompt = `${NO_TEXT_PREFIX} ${dh.angle}, ${koreanPersonDirective}${prompt}, ${dh.color}.`;
            }

            // 이미지 크기 설정
            const imageRatio = (item as any).imageRatio || (config as any).imageRatio || '1:1';
            const dimensionMap: Record<string, { width: number; height: number }> = {
                '1:1': { width: 1024, height: 1024 },
                '16:9': { width: 1344, height: 768 },
                '9:16': { width: 768, height: 1344 },
                '4:3': { width: 1152, height: 896 },
                '3:4': { width: 896, height: 1152 }
            };
            const dimensions = dimensionMap[imageRatio] || { width: 1024, height: 1024 };

            // 재시도 로직
            const maxRetries = 3;
            let lastError: any;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // Step 1: 이미지 생성 요청 (v1 또는 v2)
                    let generationId: string;
                    if (useV2) {
                        generationId = await requestV2Generation(apiKey, modelIdOrString, prompt, dimensions.width, dimensions.height);
                    } else {
                        generationId = await requestV1Generation(apiKey, modelIdOrString, prompt, dimensions.width, dimensions.height, imageStyle, initImageId);
                    }

                    console.log(`[LeonardoAI] ⏳ 생성 ID: ${generationId} — 결과 대기 중... (API ${apiLabel})`);

                    // Step 2: 결과 폴링
                    const imageUrl = await pollGenerationResult(apiKey, generationId, useV2 ? 'v2' : 'v1');

                    // 이미지 다운로드
                    const imgResponse = await axios.get(imageUrl, {
                        responseType: 'arraybuffer',
                        timeout: 30000
                    });
                    const buffer = Buffer.from(imgResponse.data);

                    // ✅ [2026-03-12 FIX] 텍스트 오버레이는 imageGenerator.ts의 applyKoreanTextOverlayIfNeeded에서 일괄 처리
                    // 여기서 추가로 적용하면 2중 오버레이가 발생하므로 제거

                    // 파일 저장
                    const savedResult = await writeImageFile(buffer, 'png', item.heading, postTitle, postId);

                    results.push({
                        heading: item.heading,
                        filePath: savedResult.savedToLocal || savedResult.filePath,
                        provider: 'leonardoai',
                        previewDataUrl: savedResult.previewDataUrl,
                        savedToLocal: savedResult.savedToLocal,
                        originalIndex: (item as any).originalIndex, // ✅ [2026-03-05 FIX] headingImageMode 필터링 후 정확한 소제목 매칭
                    });

                    // ✅ [2026-03-19] 사용량 추적
                    trackApiUsage('leonardoai', { images: 1, model: selectedModelKey });

                    console.log(`[LeonardoAI] ✅ [${i + 1}/${items.length}] "${item.heading}" 생성 완료!`);

                    // ✅ [2026-02-27] 실시간 콜백 호출
                    if (onImageGenerated) {
                        try { onImageGenerated(results[results.length - 1], i, items.length); } catch (cbErr) { /* 콜백 오류 무시 */ }
                    }

                    break; // 성공 시 재시도 루프 탈출

                } catch (apiError: any) {
                    lastError = apiError;
                    const errMsg = apiError.response?.data?.error || apiError.message || 'unknown';
                    console.warn(`[LeonardoAI] ⚠️ 시도 ${attempt}/${maxRetries} 실패: ${errMsg}`);

                    if (attempt < maxRetries) {
                        const delay = 3000 * attempt;
                        console.log(`[LeonardoAI] ⏳ ${delay}ms 후 재시도...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            if (results.length <= i) {
                console.error(`[LeonardoAI] ❌ "${item.heading}" 모든 재시도 실패: ${lastError?.message}`);
            }

        } catch (error: any) {
            console.error(`[LeonardoAI] ❌ "${item.heading}" 생성 실패:`, error.message);
        }
    }

    console.log(`[LeonardoAI] 📊 최종 결과: ${results.length}/${items.length}개 생성 완료`);
    return results;
}

/**
 * 단일 이미지 생성 (테스트 이미지 생성 핸들러용)
 */
export async function generateSingleLeonardoAIImage(
    options: { prompt: string; size?: string; model?: string },
    apiKey: string
): Promise<{ success: boolean; localPath?: string; error?: string }> {
    try {
        const selectedModelKey = options.model || 'seedream-4.5';
        const useV2 = isV2Model(selectedModelKey);
        const modelIdOrString = useV2
            ? LEONARDO_V2_MODEL_MAP[selectedModelKey]
            : (LEONARDO_V1_MODEL_MAP[selectedModelKey] || DEFAULT_LEONARDO_MODEL);

        // size → width/height 파싱
        let width = 1024, height = 1024;
        if (options.size) {
            const parts = options.size.split('x');
            if (parts.length === 2) {
                width = parseInt(parts[0]) || 1024;
                height = parseInt(parts[1]) || 1024;
            }
        }

        const apiLabel = useV2 ? 'v2' : 'v1';
        console.log(`[LeonardoAI-Test] 🎨 단일 이미지 생성 (모델: ${selectedModelKey}, API: ${apiLabel})`);

        // Step 1: 생성 요청
        let generationId: string;
        if (useV2) {
            generationId = await requestV2Generation(apiKey, modelIdOrString, options.prompt, width, height);
        } else {
            generationId = await requestV1Generation(apiKey, modelIdOrString, options.prompt, width, height);
        }

        // Step 2: 폴링
        const imageUrl = await pollGenerationResult(apiKey, generationId, useV2 ? 'v2' : 'v1');

        const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const buffer = Buffer.from(imgResponse.data);

        const filename = `leonardo_img_${Date.now()}.png`;
        const localPath = path.join(app.getPath('temp'), filename);
        fs.writeFileSync(localPath, buffer);

        return { success: true, localPath };
    } catch (err: any) {
        return { success: false, error: err.response?.data?.error || err.message || 'Leonardo AI 생성 실패' };
    }
}
