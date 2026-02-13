import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { loadConfig } from '../configManager.js';
import { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { addThumbnailTextOverlay } from './textOverlay.js';
// ✅ [2026-02-12 100점] 공유 유틸리티 임포트
import {
    getStyleGuideByCategory,
    SHOPPING_CONNECT_LIFESTYLE,
    VARIATION_STYLES,
    REALISTIC_CATEGORY_STYLES,
    ANIME_CATEGORY_STYLES,
    STYLE_PROMPT_MAP,
    filterPersonKeywordsIfNeeded,
    getImageSize,
} from './imageStyles.js';

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
 * ✅ [2026-02-12 100점] Fal.ai로 일괄 이미지 생성 (공통 인터페이스)
 * - 퍼지 카테고리 매칭
 * - 쇼핑커넥트 라이프스타일 스타일
 * - NO PEOPLE 충돌 방지
 * - 재시도 + 프롬프트 변형
 * - 하단 크롭 (FLUX 텍스트 제거)
 * - 28개 카테고리 × 실사/애니메 스타일
 */
export async function generateWithFalAI(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    isFullAuto: boolean = false,
    providedApiKey?: string,
    isShoppingConnect: boolean = false // ✅ [2026-02-12] 쇼핑커넥트 모드
): Promise<GeneratedImage[]> {
    const config = await loadConfig();
    const apiKey = providedApiKey || (config as any).falaiApiKey?.trim();
    const selectedModel = (config as any).falaiModel || 'flux-realism';

    if (!apiKey) {
        throw new Error('Fal.ai API 키가 설정되지 않았습니다.');
    }

    console.log(`[Fal.ai] 🎨 총 ${items.length}개 이미지 생성 시작 (모델: ${selectedModel}, 쇼핑커넥트: ${isShoppingConnect})`);

    const results: GeneratedImage[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isThumbnail = (item as any).isThumbnail !== undefined ? (item as any).isThumbnail : (i === 0);

        console.log(`[Fal.ai] 🖼️ [${i + 1}/${items.length}] "${item.heading}" 생성 중...`);

        try {
            // ═══════════════════════════════════════════════════════
            // 1️⃣ 이미지 스타일 결정 (realistic / anime / 기타 11가지)
            // ═══════════════════════════════════════════════════════
            const imageStyle = (item as any).imageStyle || (config as any).imageStyle || 'realistic';
            const isAnime = imageStyle === 'anime';
            console.log(`[Fal.ai] 🎨 이미지 스타일: ${imageStyle}`);

            // ═══════════════════════════════════════════════════════
            // 2️⃣ 카테고리 스타일 가져오기 (퍼지 매칭)
            // ═══════════════════════════════════════════════════════
            const categoryStyleMap = isAnime ? ANIME_CATEGORY_STYLES : REALISTIC_CATEGORY_STYLES;
            const { styleGuide: categoryStyle, matchedKey } = getStyleGuideByCategory(item.category, categoryStyleMap);
            console.log(`[Fal.ai] 📂 카테고리: "${item.category}" → 매칭: "${matchedKey}"`);

            // ═══════════════════════════════════════════════════════
            // 3️⃣ 쇼핑커넥트 모드 → 라이프스타일 스타일 오버라이드
            // ═══════════════════════════════════════════════════════
            const styleGuide = isShoppingConnect ? SHOPPING_CONNECT_LIFESTYLE : categoryStyle;
            if (isShoppingConnect) {
                console.log(`[Fal.ai] 🛒 쇼핑커넥트 모드 → 라이프스타일 스타일 적용`);
            }

            // ═══════════════════════════════════════════════════════
            // 4️⃣ 스타일 프롬프트 매핑
            // ═══════════════════════════════════════════════════════
            const stylePrompt = STYLE_PROMPT_MAP[imageStyle] || STYLE_PROMPT_MAP['realistic'];

            // ═══════════════════════════════════════════════════════
            // 5️⃣ 베이스 프롬프트 결정
            // ═══════════════════════════════════════════════════════
            let basePrompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading);

            // 한글 감지: 한글이 포함되면 영어 스타일 키워드로 보강
            const hasKorean = /[가-힣]/.test(basePrompt);
            if (hasKorean && !item.englishPrompt) {
                console.log(`[Fal.ai] ⚠️ 한글 프롬프트 감지 → 영어 스타일 보강`);
                basePrompt = `high quality stock photography, ${styleGuide}, professional commercial image, modern aesthetic`;
            }

            // ═══════════════════════════════════════════════════════
            // 6️⃣ NO PEOPLE 충돌 방지
            // ═══════════════════════════════════════════════════════
            basePrompt = filterPersonKeywordsIfNeeded(styleGuide, basePrompt, item.heading, sanitizeImagePrompt);

            // ═══════════════════════════════════════════════════════
            // 7️⃣ 최종 프롬프트 조합
            // ═══════════════════════════════════════════════════════
            let prompt = '';
            if (isThumbnail && postTitle) {
                prompt = `masterpiece, best quality, ${stylePrompt}, ${styleGuide}, ${basePrompt}, cinematic lighting, high contrast, 8k wallpaper`;
            } else {
                prompt = `masterpiece, best quality, ${stylePrompt}, ${styleGuide}, ${basePrompt}, ultra detailed, 8k`;
            }

            // 실사 외 스타일인 경우 스타일 강화 프롬프트 추가
            if (imageStyle !== 'realistic' && imageStyle !== 'bokeh' && !isAnime) {
                prompt = `[ART STYLE: ${imageStyle.toUpperCase()}]\n${stylePrompt}\n\n${prompt}\n\nIMPORTANT: Generate the image in ${imageStyle} style. DO NOT generate photorealistic images.`;
                console.log(`[Fal.ai] 🎨 스타일 프롬프트 적용: ${imageStyle}`);
            }

            // ═══════════════════════════════════════════════════════
            // 8️⃣ 이미지 비율 설정
            // ═══════════════════════════════════════════════════════
            const imageRatio = (item as any).imageRatio || (config as any).imageRatio || '1:1';
            const imageSize = getImageSize(imageRatio);
            console.log(`[Fal.ai] 📐 이미지 비율: ${imageRatio} → ${imageSize}`);

            // ═══════════════════════════════════════════════════════
            // 9️⃣ 재시도 루프 (최대 2회, 프롬프트 변형)
            // ═══════════════════════════════════════════════════════
            const maxRetries = 2;
            let res: FalAIResult | null = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                let attemptPrompt = prompt;

                // ✅ 재시도 시 프롬프트 변형 (이미지 다양성 확보)
                if (attempt > 1) {
                    const randomVariation = VARIATION_STYLES[Math.floor(Math.random() * VARIATION_STYLES.length)];
                    attemptPrompt += ` [VARIATION: ${randomVariation}]`;
                    console.log(`[Fal.ai] 🔄 재시도 ${attempt}/${maxRetries}: ${randomVariation}`);
                }

                res = await generateSingleFalAIImage({
                    prompt: attemptPrompt,
                    model: selectedModel as keyof typeof FALAI_MODELS,
                    size: imageSize,
                    enable_safety_checker: false
                }, apiKey);

                if (res.success && res.localPath) break; // 성공하면 루프 탈출

                if (attempt < maxRetries) {
                    console.log(`[Fal.ai] ⚠️ 시도 ${attempt} 실패, ${attempt + 1}번째 재시도...`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
                }
            }

            if (res && res.success && res.localPath) {
                let buffer: Buffer = fs.readFileSync(res.localPath);

                // ═══════════════════════════════════════════════════
                // 🔟 하단 크롭 (FLUX 모델 텍스트 제거)
                // ═══════════════════════════════════════════════════
                try {
                    const sharpModule = await import('sharp');
                    const sharp = sharpModule.default || sharpModule;
                    const metadata = await sharp(buffer).metadata();
                    if (metadata.width && metadata.height && metadata.height > 100) {
                        const cropHeight = Math.floor(metadata.height * 0.05); // 하단 5% 크롭
                        const croppedBuffer = await sharp(buffer)
                            .extract({ left: 0, top: 0, width: metadata.width, height: metadata.height - cropHeight })
                            .toBuffer();
                        buffer = croppedBuffer;
                        console.log(`[Fal.ai] ✂️ 하단 ${cropHeight}px 크롭 (FLUX 텍스트 제거)`);
                    }
                } catch (cropError) {
                    console.warn(`[Fal.ai] ⚠️ 하단 크롭 실패, 원본 사용`);
                }

                // ═══════════════════════════════════════════════════
                // 1️⃣1️⃣ 텍스트 오버레이 (1번 이미지 + allowText)
                // ═══════════════════════════════════════════════════
                const isFirstImage = i === 0;
                const explicitlyAllowText = (item as any).allowText === true;
                const shouldApplyTextOverlay = isFirstImage && explicitlyAllowText && postTitle;

                if (shouldApplyTextOverlay) {
                    console.log(`[Fal.ai] 📝 1번 이미지 텍스트 오버레이 적용 중...`);
                    try {
                        const overlayResult = await addThumbnailTextOverlay(buffer, postTitle);
                        if (overlayResult.success && overlayResult.outputBuffer) {
                            buffer = overlayResult.outputBuffer;
                            console.log(`[Fal.ai] ✅ 텍스트 오버레이 적용 완료`);
                        } else {
                            console.warn(`[Fal.ai] ⚠️ 텍스트 오버레이 실패, 원본 이미지 사용`);
                        }
                    } catch (overlayError) {
                        console.warn(`[Fal.ai] ⚠️ 텍스트 오버레이 예외:`, overlayError);
                    }
                }

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
                num_inference_steps: modelKey === 'flux-schnell' ? 4 : 28,
                guidance_scale: 3.5,
                sync_mode: true
            },
            {
                headers: {
                    'Authorization': `Key ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 120000,
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