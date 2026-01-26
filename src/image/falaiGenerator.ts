import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { loadConfig } from '../configManager.js';
import { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';

// ✅ Fal.ai 지원 모델 (FLUX 계열)
export const FALAI_MODELS = {
    'flux-schnell': 'fal-ai/flux/schnell',     // ⚡ 가성비 (₩11/MP, 초고속)
    'flux-dev': 'fal-ai/flux/dev',             // 테스트/개발용
    'flux-pro': 'fal-ai/flux-pro',             // 고품질
    'flux-1.1-pro': 'fal-ai/flux-pro/v1.1',    // 🏆 최신 최고 품질 (₩77/장)
    'flux-realism': 'fal-ai/flux-realism',     // 📷 실사 특화 (₩29/초, 기본값)
} as const;

export interface FalAIGenerateOptions {
    prompt: string;
    model?: keyof typeof FALAI_MODELS;
    size?: string;
    num_images?: number;
    enable_safety_checker?: boolean;
}

export interface FalAIResult {
    success: boolean;
    imageUrl?: string;
    localPath?: string;
    error?: string;
    model?: string;
}

/**
 * Fal.ai API 키 확인
 */
export async function isFalAIConfigured(): Promise<boolean> {
    const config = await loadConfig();
    return !!((config as any).falaiApiKey && (config as any).falaiApiKey.trim());
}

/**
 * Fal.ai로 일괄 이미지 생성 (공통 인터페이스)
 */
export async function generateWithFalAI(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    isFullAuto: boolean = false,
    providedApiKey?: string
): Promise<GeneratedImage[]> {
    const config = await loadConfig();
    const apiKey = providedApiKey || (config as any).falaiApiKey?.trim();
    // ✅ [2026-01-16] configManager에서 설정된 모델 우선, 없으면 flux-realism (실사 특화, 기본값)
    const selectedModel = (config as any).falaiModel || 'flux-realism';

    if (!apiKey) {
        throw new Error('Fal.ai API 키가 설정되지 않았습니다.');
    }

    console.log(`[Fal.ai] 🎨 총 ${items.length}개 이미지 생성 시작 (모델: ${selectedModel})`);

    const results: GeneratedImage[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isThumbnail = (item as any).isThumbnail !== undefined ? (item as any).isThumbnail : (i === 0);

        console.log(`[Fal.ai] 🖼️ "${item.heading}" 생성 중...`);

        try {
            // 카테고리별 스타일 (기존 로직 유지)
            const categoryStyles: Record<string, string> = {
                '연예': 'elegant bokeh lighting, soft dreamy atmosphere, abstract artistic photography, glowing stage lights',
                '스포츠': 'dynamic action sports photography, high speed capture, cinematic motion blur, vibrant energy',
                '음식': 'professional food photography, appetizing presentation, soft warm lighting, macro details',
                '여행': 'stunning cinematic travel photography, breathtaking landscape, professional lighting',
                '건강': 'wellness and healthy lifestyle photography, clean bright environment, professional medical stock quality',
                '테크': 'futuristic technology product photography, sleek minimalist design, professional studio lighting',
                '뉴스': 'abstract conceptual photography, symbolic visual metaphor, dramatic lighting, editorial style',
                '경제': 'corporate business photography, modern office environment, professional financial concept imagery',
                '쇼핑': 'product photography, e-commerce style, clean white background, professional studio lighting',
                '육아': 'warm family photography, soft natural lighting, cozy home atmosphere, heartwarming moments',
                '라이프': 'lifestyle photography, modern living, bright airy atmosphere, everyday moments',
                'default': 'professional commercial photography, cinematic lighting, 8k resolution, ultra realistic'
            };

            const styleGuide = categoryStyles[item.category || 'default'] || categoryStyles['default'];

            // ✅ [2026-01-21 FIX] 영문 프롬프트 우선 + 한글 감지 시 기본 영어 스타일 강화
            // FLUX 모델은 한글을 잘 이해 못하므로, 한글 프롬프트는 영어 스타일로 감싸기
            let basePrompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading);

            // ✅ 한글 감지: 한글이 포함되면 영어 스타일 키워드로 보강
            const hasKorean = /[가-힣]/.test(basePrompt);
            if (hasKorean && !item.englishPrompt) {
                console.log(`[Fal.ai] ⚠️ 한글 프롬프트 감지 → 영어 스타일 보강: "${basePrompt.substring(0, 30)}..."`);
                // 한글 프롬프트를 영어 스타일 키워드로 감싸기
                basePrompt = `high quality stock photography, ${styleGuide}, professional commercial image, modern aesthetic`;
            }

            // FLUX 모델용 프롬프트 조합
            let prompt = '';
            if (isThumbnail && postTitle) {
                // 썸네일은 텍스트보다는 시각적 강렬함에 집중 (텍스트 생성은 FLUX가 잘하지만, 한글 텍스트는 아직 완벽하지 않음)
                prompt = `masterpiece, best quality, ${styleGuide}, ${basePrompt}, cinematic lighting, high contrast, 8k wallpaper`;
            } else {
                prompt = `masterpiece, best quality, ${styleGuide}, ${basePrompt}, ultra detailed, photorealistic, 8k`;
            }

            // 이미지 생성 요청
            const res = await generateSingleFalAIImage({
                prompt,
                model: selectedModel as keyof typeof FALAI_MODELS, // 설정된 모델 사용
                size: '1024x1024', // ✅ [100점 수정] 모든 이미지 1:1 비율 - 모바일 피드에서 꽉찬 표시
                enable_safety_checker: false
            }, apiKey);

            if (res.success && res.localPath) {
                const buffer = fs.readFileSync(res.localPath);
                const savedResult = await writeImageFile(buffer, 'png', item.heading, postTitle, postId);

                results.push({
                    heading: item.heading,
                    filePath: savedResult.savedToLocal || savedResult.filePath,
                    provider: 'falai',
                    previewDataUrl: savedResult.previewDataUrl,
                    savedToLocal: savedResult.savedToLocal
                });

                // 임시 파일 정리
                try { fs.unlinkSync(res.localPath); } catch { }
            }
        } catch (error) {
            console.error(`[Fal.ai] "${item.heading}" 생성 실패:`, (error as Error).message);
        }
    }

    console.log(`[Fal.ai] ✅ 완료: ${results.length}/${items.length}개 성공`);
    return results;
}

/**
 * Fal.ai로 단일 이미지 생성 (핵심 로직)
 */
export async function generateSingleFalAIImage(
    options: FalAIGenerateOptions,
    apiKey: string
): Promise<FalAIResult> {
    const modelKey = options.model || 'flux-realism';
    const modelId = FALAI_MODELS[modelKey];

    // 해상도 처리
    let imageSize: any = "landscape_4_3"; // 기본값
    if (options.size) {
        const [w, h] = options.size.split('x').map(Number);
        imageSize = { width: w, height: h };
    }

    try {
        // ✅ 1. 추론 요청 (Submit)
        const submitResponse = await axios.post(
            `https://fal.run/${modelId}`,
            {
                prompt: options.prompt,
                image_size: imageSize,
                num_images: 1,
                enable_safety_checker: options.enable_safety_checker ?? false,
                num_inference_steps: modelKey === 'flux-schnell' ? 4 : 28, // 모델별 최적 스텝 수
                guidance_scale: 3.5,
                sync_mode: true // 동기 모드 (기다렸다가 응답 받음)
            },
            {
                headers: {
                    'Authorization': `Key ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 120000, // 2분 (여유 있게)
            }
        );

        const data = submitResponse.data;

        if (!data.images || data.images.length === 0 || !data.images[0].url) {
            return { success: false, error: 'Fal.ai 응답에 이미지 URL이 없습니다.' };
        }

        const imageUrl = data.images[0].url;
        const filename = `fal_${Date.now()}.png`;
        const localPath = path.join(app.getPath('temp'), filename);

        // ✅ 2. 이미지 다운로드 및 검증
        const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });

        const contentType = imgResp.headers['content-type'];
        if (contentType && !contentType.startsWith('image/')) {
            const errorText = Buffer.from(imgResp.data).toString('utf-8').slice(0, 100);
            throw new Error(`이미지가 아닌 응답 (${contentType}): ${errorText}`);
        }

        fs.writeFileSync(localPath, Buffer.from(imgResp.data));

        return {
            success: true,
            imageUrl,
            localPath,
            model: modelId,
        };

    } catch (error: any) {
        const msg = error.response?.data?.detail || error.message || 'Fal.ai API Error';
        console.error('[Fal.ai] 오류 발생:', msg);
        return { success: false, error: msg };
    }
}

// ... testFalAI 함수는 기존과 동일하게 유지 ...
export async function testFalAI(): Promise<{ success: boolean; message: string }> {
    try {
        const config = await loadConfig();
        const apiKey = (config as any).falaiApiKey?.trim();
        if (!apiKey) return { success: false, message: 'API 키가 없습니다.' };

        const result = await generateSingleFalAIImage({
            prompt: 'A cute robot artist painting a landscape, 4k, digital art',
            model: 'flux-schnell',
            size: '1024x1024',
        }, apiKey);

        if (result.success) {
            return { success: true, message: `테스트 성공! (모델: ${result.model})` };
        } else {
            return { success: false, message: result.error || '실패' };
        }
    } catch (error: any) {
        return { success: false, message: `오류: ${error.message}` };
    }
}