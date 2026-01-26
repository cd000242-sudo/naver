/**
 * Stability AI 이미지 및 비디오 생성기 (Refactored)
 * - PromptBuilder 재사용으로 일관성 확보
 * - 카테고리별 스타일 매핑
 * - 비디오 생성 안전장치 추가
 * - [2026-01-16] configManager에서 모델 설정 읽어오기 추가
 */

import type { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { PromptBuilder } from './promptBuilder.js';
import { loadConfig } from '../configManager.js';
import axios from 'axios';
import FormData from 'form-data';

// ✅ [2026-01-16] Stability AI 모델 매핑 (configManager 설정값 → API 엔드포인트/모델)
export const STABILITY_MODELS: Record<string, { endpoint: string; modelParam?: string; name: string }> = {
    'sdxl-1.0': { endpoint: 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', name: '💰 SDXL 1.0 (₩13)' },
    'sd35-flash': { endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/sd3', modelParam: 'sd3.5-flash', name: '⚡ SD 3.5 Flash (₩35)' },
    'sd35-medium': { endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/sd3', modelParam: 'sd3.5-medium', name: '⚖️ SD 3.5 Medium (₩49)' },
    'sd35-large-turbo': { endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/sd3', modelParam: 'sd3.5-large-turbo', name: '🚀 SD 3.5 Large Turbo (₩56)' },
    'sd35-large': { endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/sd3', modelParam: 'sd3.5-large', name: '🎨 SD 3.5 Large (₩91)' },
    'stable-image-ultra': { endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/ultra', name: '👑 Stable Image Ultra (₩112)' },
};

// ✅ 카테고리별 이미지 스타일 매핑 (나노 바나나 프로급 실사 스타일 최적화)
const STABILITY_STYLES: Record<string, string> = {
    'entertainment': 'Professional photography of a FAMOUS KOREAN CELEBRITY, genuine Hallyu star likeness, K-star facial features, high-impact glamorous lighting, vibrant colors, premium magazine editorial quality',
    '연예': 'Professional photography of a FAMOUS KOREAN CELEBRITY, genuine Hallyu star likeness, K-star facial features, high-impact glamorous lighting, vibrant colors, premium magazine editorial quality',
    '이슈': 'Breaking news style, high-impact photojournalism, dynamic composition, dramatic and eye-catching photorealistic news scene',
    'economy': 'Corporate photography, clean minimalist design, professional business imagery, Bloomberg/Forbes style, photorealistic office environment',
    'business': 'Corporate photography, clean minimalist design, professional business imagery, Bloomberg/Forbes style, photorealistic office environment',
    '경제': 'Corporate photography, clean minimalist design, professional business imagery, data visualization elements',
    '비즈니스': 'Modern corporate style, sleek office environments, professional business concepts',
    'health': 'Clean medical photography, wellness imagery, calming colors, healthcare professional style, photorealistic',
    '건강': 'Wellness and lifestyle photography, healthy living concepts, bright and optimistic, photorealistic',
    '의료': 'Medical professional photography, clinical yet approachable, healthcare imagery, photorealistic',
    'food': 'Appetizing food photography, restaurant quality presentation, warm cinematic lighting, culinary magazine style, photorealistic',
    '음식': 'Appetizing food photography, restaurant quality presentation, warm cinematic lighting, culinary magazine style, photorealistic',
    '요리': 'Cooking process photography, kitchen scenes, step-by-step culinary imagery, photorealistic',
    'fashion': 'High fashion editorial photography of Korean models, Vogue Korea style, elegant and stylish modern K-fashion, photorealistic',
    '패션': 'High fashion editorial photography of Korean models, Vogue Korea style, elegant and stylish modern K-fashion, photorealistic',
    '뷰티': 'K-beauty professional photography, clear Korean skin texture, glowing and radiant Korean facial features, skincare and makeup editorial, photorealistic',
    'sports': 'High-octane action sports photography, extreme motion blur elements, vibrant energy, professional magazine quality, photorealistic',
    '스포츠': 'High-octane action sports photography, extreme motion blur elements, vibrant energy, professional magazine quality, photorealistic',
    'tech': 'Technology product photography, futuristic design, clean tech aesthetics, Apple-style minimalism, photorealistic',
    'it': 'Digital technology imagery, modern gadgets, innovative tech concepts, photorealistic',
    '테크': 'Cutting-edge technology, sleek devices, futuristic and innovative, photorealistic',
    'default': 'Cinematic movie poster quality, dramatic lighting, rich colors, professional editorial photography style, photorealistic'
};

function getStabilityStyle(category?: string): string {
    if (!category) return STABILITY_STYLES['default'];
    const normalized = category.toLowerCase().trim();
    return STABILITY_STYLES[normalized] || STABILITY_STYLES['default'];
}

/**
 * Stability AI로 이미지 생성
 */
export async function generateWithStability(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    isFullAuto: boolean = false,
    providedApiKey?: string,
    modelOverride?: string // 선택적 모델 오버라이드
): Promise<GeneratedImage[]> {
    // ✅ [2026-01-16] configManager에서 API 키와 모델 설정 읽어오기
    const config = await loadConfig();
    const apiKey = providedApiKey || (config as any).stabilityApiKey?.trim() || process.env.STABILITY_API_KEY;
    const selectedModel = modelOverride || (config as any).stabilityModel || 'sd35-large-turbo';

    if (!apiKey) {
        throw new Error('Stability AI API 키가 설정되지 않았습니다.');
    }

    console.log(`[Stability] 🎨 총 ${items.length}개 이미지 생성 시작 (모델: ${selectedModel})`);


    const results: GeneratedImage[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isThumbnail = i === 0 || (item as any).isThumbnail;

        console.log(`[Stability] 🎨 [${i + 1}/${items.length}] "${item.heading}" 생성 중... (Model: ${selectedModel})`);

        try {
            const imageBuffer = await generateSingleStabilityImage(item, apiKey, isThumbnail, selectedModel, postTitle);
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
 * 단일 이미지 생성 (Ultra/SD3.5/SD3/Core 등 선택한 모델에 맞게 호출)
 */
async function generateSingleStabilityImage(
    item: ImageRequestItem,
    apiKey: string,
    isThumbnail: boolean,
    model: string = 'ultra',
    postTitle?: string
): Promise<Buffer> {
    const style = getStabilityStyle(item.category);

    // ✅ PromptBuilder 사용으로 일관된 고품질 프롬프트 생성
    let prompt = '';
    try {
        prompt = PromptBuilder.build(item, {
            isThumbnail,
            postTitle,
            categoryStyle: style
        });
    } catch {
        // Fallback: PromptBuilder가 없는 경우 기존 로직
        const baseSubject = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading || 'Abstract Image');
        prompt = isThumbnail && postTitle
            ? `Generate a premium, high-impact blog thumbnail for "${postTitle}". Topic: ${baseSubject}. Style: ${style}. High contrast, vibrant colors.`
            : `Photorealistic image of "${item.heading}". Context: ${baseSubject}. Style: ${style}. 8k resolution, cinematic lighting.`;
    }

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('output_format', 'webp');

    if (!isThumbnail) {
        formData.append('aspect_ratio', '1:1'); // ✅ [100점 수정] 모든 이미지 1:1 비율 - 모바일 피드에서 꽉찬 표시
    }

    // ✅ [리팩토링] STABILITY_MODELS 매핑 테이블로 엔드포인트/모델 파라미터 결정
    const modelConfig = STABILITY_MODELS[model];
    let endpoint: string;

    if (modelConfig) {
        endpoint = modelConfig.endpoint;
        // SD 3.5 계열은 modelParam 추가 필요
        if (modelConfig.modelParam) {
            formData.append('model', modelConfig.modelParam);
        }
        console.log(`[Stability] 📌 모델 설정 적용: ${modelConfig.name} (endpoint: ${endpoint})`);
    } else {
        // Fallback: 알 수 없는 모델인 경우 Ultra로 기본값
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
            timeout: 60000 // 60초 타임아웃
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
    const MAX_ATTEMPTS = 20; // 최대 20번 시도 (약 3분)

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
                await new Promise(resolve => setTimeout(resolve, 10000)); // 10초 대기
                continue;
            }

            if (resultResponse.status === 200) {
                console.log('[Stability] ✅ 비디오 생성 완료!');
                return Buffer.from(resultResponse.data);
            }
        } catch (error: any) {
            // 202가 아닌 에러(4xx, 5xx) 발생 시 즉시 중단
            throw new Error(`비디오 결과 조회 실패: ${error.message}`);
        }
    }

    throw new Error('비디오 생성 시간 초과 (Timeout)');
}
