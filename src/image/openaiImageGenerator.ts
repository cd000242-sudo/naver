// ✅ [2026-02-22] OpenAI Image Generator (DALL-E / gpt-image-1)
// OpenAI Images API를 사용한 고품질 이미지 생성

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { loadConfig } from '../configManager.js';
import { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { STYLE_PROMPT_MAP, isNoPersonCategory, getImageDiversityHints } from './imageStyles.js';
import { addThumbnailTextOverlay } from './textOverlay.js';
import { AutomationService } from '../main/services/AutomationService.js';

const OPENAI_IMAGES_API_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_MODEL = 'gpt-image-1';

/**
 * OpenAI Image API로 일괄 이미지 생성
 */
export async function generateWithOpenAIImage(
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
    const apiKey = providedApiKey || (config as any).openaiImageApiKey?.trim() || (config as any).openaiApiKey?.trim();

    if (!apiKey) {
        throw new Error('OpenAI API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.');
    }

    console.log(`[OpenAI-Image] 🎨 총 ${items.length}개 이미지 생성 시작 (모델: ${DEFAULT_MODEL})`);

    // ✅ [2026-03-03] 참조 이미지 사전 캐싱 (쇼핑커넥트 수집 이미지)
    let cachedReferenceBase64: string | null = null;
    if (isShoppingConnect && collectedImages && collectedImages.length > 0) {
        try {
            const firstImage = collectedImages[0];
            const candidateUrl = typeof firstImage === 'string'
                ? firstImage
                : ((firstImage as any)?.url || (firstImage as any)?.thumbnailUrl || '');
            if (candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
                console.log(`[OpenAI-Image] 🖼️ 참조 이미지 다운로드: ${candidateUrl.substring(0, 80)}...`);
                const refResponse = await axios.get(candidateUrl, { responseType: 'arraybuffer', timeout: 15000 });
                const refBuf = Buffer.from(refResponse.data);
                if (refBuf && refBuf.length > 0) {
                    cachedReferenceBase64 = refBuf.toString('base64');
                    console.log(`[OpenAI-Image] ✅ 참조 이미지 캐싱 완료 (${Math.round(refBuf.length / 1024)}KB) → img2img 모드 활성화`);
                }
            }
        } catch (refErr: any) {
            console.warn(`[OpenAI-Image] ⚠️ 참조 이미지 다운로드 실패: ${refErr.message} → text-to-image로 진행`);
        }
    }

    const results: GeneratedImage[] = [];

    for (let i = 0; i < items.length; i++) {
        if (AutomationService.isCancelRequested()) {
            console.log('[OpenAI-Image] ⛔ 중지 요청 감지 → 이미지 생성 중단');
            break;
        }

        const item = items[i];
        console.log(`[OpenAI-Image] 🖼️ [${i + 1}/${items.length}] "${item.heading}" 생성 중...`);

        try {
            // ✅ [2026-02-23] imageStyle 핸들링 구현
            const imageStyle = (item as any).imageStyle || 'realistic';
            console.log(`[OpenAI-Image] 🎨 이미지 스타일: ${imageStyle}`);

            // 프롬프트 구성
            let prompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading);

            // 한글 제거 (gpt-image-1은 영어 프롬프트 최적)
            if (/[가-힣]/.test(prompt)) {
                prompt = prompt.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]+/g, '').replace(/\s+/g, ' ').trim();
            }

            // 스타일별 프롬프트 분기
            // ✅ [2026-03-03 FIX] DALL-E에도 스타일 프롬프트(STYLE_PROMPT_MAP) 적용 + 한국인 인물 지시
            const dh = getImageDiversityHints(i);
            console.log(`[OpenAI-Image] 🎲 다양성[${i}]: 📐${dh.angle.split(',')[0]} | 💡${dh.lighting.split(',')[0]} | 🎨${dh.color.split(',')[0]}`);

            // ✅ 스타일 프롬프트 적용 (stickman/roundy/2d/disney 등)
            const stylePromptText = STYLE_PROMPT_MAP[imageStyle] || STYLE_PROMPT_MAP['realistic'];
            const isRealistic = imageStyle === 'realistic' || !imageStyle;

            // ✅ [2026-03-12 FIX] NO TEXT 지시를 프롬프트 맨 앞에 배치 → AI가 텍스트 렌더링 강력 방지
            const NO_TEXT_PREFIX = 'CRITICAL RULE: This image must contain ZERO text, ZERO letters, ZERO words, ZERO writing of any kind. Generate a COMPLETELY TEXT-FREE image.';

            if (isShoppingConnect) {
                if (cachedReferenceBase64) {
                    prompt = `${NO_TEXT_PREFIX} Based on the provided product reference image, create a premium lifestyle photograph showing this exact product being used by a Korean person (20-40s). ${dh.angle}, ${dh.framing}, ${prompt}, luxury Korean lifestyle setting, ${dh.lighting}, ${dh.focus}, maintain the product's exact appearance and design from the reference.`;
                } else {
                    prompt = `${NO_TEXT_PREFIX} ${dh.angle}, ${dh.framing}, Premium lifestyle photography with Korean person, ${dh.personAction}, using or enjoying the product, ${prompt}, luxury lifestyle setting, ${dh.lighting}, ${dh.focus}.`;
                }
            } else if (!isRealistic) {
                prompt = `${NO_TEXT_PREFIX} ${stylePromptText}, ${prompt}.`;
            } else {
                const koreanPersonDirective = 'If any person appears in this image, they must be Korean with East Asian features. ';
                prompt = `${NO_TEXT_PREFIX} ${dh.angle}, ${koreanPersonDirective}${prompt}, ${dh.color}.`;
            }

            // 이미지 비율 설정
            const imageRatio = (item as any).imageRatio || (config as any).imageRatio || '1:1';
            const sizeMap: Record<string, string> = {
                '1:1': '1024x1024',
                '16:9': '1536x1024',
                '9:16': '1024x1536',
                '4:3': '1536x1024',
                '3:4': '1024x1536'
            };
            const size = sizeMap[imageRatio] || '1024x1024';

            // 재시도 로직
            const maxRetries = 3;
            let lastError: any;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // ✅ [2026-03-03] 참조 이미지가 있으면 image 파라미터로 전달 (img2img)
                    const requestBody: any = {
                        model: DEFAULT_MODEL,
                        prompt: prompt,
                        n: 1,
                        size: size,
                        quality: 'auto',
                    };

                    // gpt-image-1은 image 파라미터로 참조 이미지 전달 가능
                    if (cachedReferenceBase64) {
                        requestBody.image = `data:image/png;base64,${cachedReferenceBase64}`;
                        console.log(`[OpenAI-Image] 🖼️ 참조 이미지를 image 파라미터로 전달 (img2img 모드)`);
                    }

                    const response = await axios.post(
                        OPENAI_IMAGES_API_URL,
                        requestBody,
                        {
                            headers: {
                                'Authorization': `Bearer ${apiKey}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 120000, // 2분 타임아웃
                            responseType: 'json'
                        }
                    );

                    // base64 또는 URL 응답 처리
                    const imageData = response.data?.data?.[0];

                    if (!imageData) {
                        throw new Error('이미지 데이터가 응답에 없습니다.');
                    }

                    let buffer: Buffer;

                    if (imageData.b64_json) {
                        // base64 응답
                        buffer = Buffer.from(imageData.b64_json, 'base64');
                    } else if (imageData.url) {
                        // URL 응답 → 다운로드
                        const imgResponse = await axios.get(imageData.url, {
                            responseType: 'arraybuffer',
                            timeout: 30000
                        });
                        buffer = Buffer.from(imgResponse.data);
                    } else {
                        throw new Error('이미지 데이터 형식이 올바르지 않습니다.');
                    }

                    // ✅ [2026-03-12 FIX] 텍스트 오버레이는 imageGenerator.ts의 applyKoreanTextOverlayIfNeeded에서 일괄 처리
                    // 여기서 추가로 적용하면 2중 오버레이가 발생하므로 제거

                    // 파일 저장
                    const savedResult = await writeImageFile(buffer, 'png', item.heading, postTitle, postId);

                    results.push({
                        heading: item.heading,
                        filePath: savedResult.savedToLocal || savedResult.filePath,
                        provider: 'openai-image',
                        previewDataUrl: savedResult.previewDataUrl,
                        savedToLocal: savedResult.savedToLocal,
                        originalIndex: (item as any).originalIndex, // ✅ [2026-03-05 FIX] headingImageMode 필터링 후 정확한 소제목 매칭
                    });

                    console.log(`[OpenAI-Image] ✅ [${i + 1}/${items.length}] "${item.heading}" 생성 완료!`);

                    // ✅ [2026-02-27] 실시간 콜백 호출
                    if (onImageGenerated) {
                        try { onImageGenerated(results[results.length - 1], i, items.length); } catch (cbErr) { /* 콜백 오류 무시 */ }
                    }

                    break; // 성공 시 재시도 루프 탈출

                } catch (apiError: any) {
                    lastError = apiError;
                    const errMsg = apiError.response?.data?.error?.message || apiError.message || 'unknown';
                    console.warn(`[OpenAI-Image] ⚠️ 시도 ${attempt}/${maxRetries} 실패: ${errMsg}`);

                    if (attempt < maxRetries) {
                        const delay = 2000 * attempt;
                        console.log(`[OpenAI-Image] ⏳ ${delay}ms 후 재시도...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            if (results.length <= i) {
                // 모든 재시도 실패
                console.error(`[OpenAI-Image] ❌ "${item.heading}" 모든 재시도 실패: ${lastError?.message}`);
            }

        } catch (error: any) {
            console.error(`[OpenAI-Image] ❌ "${item.heading}" 생성 실패:`, error.message);
        }
    }

    console.log(`[OpenAI-Image] 📊 최종 결과: ${results.length}/${items.length}개 생성 완료`);
    return results;
}

/**
 * 단일 이미지 생성 (테스트 이미지 생성 핸들러용)
 */
export async function generateSingleOpenAIImage(
    options: { prompt: string; size?: string; model?: string },
    apiKey: string
): Promise<{ success: boolean; localPath?: string; error?: string }> {
    try {
        const response = await axios.post(
            OPENAI_IMAGES_API_URL,
            {
                model: options.model || DEFAULT_MODEL,
                prompt: options.prompt,
                n: 1,
                size: options.size || '1024x1024',
                quality: 'auto',
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000,
                responseType: 'json'
            }
        );

        const imageData = response.data?.data?.[0];
        if (!imageData) {
            return { success: false, error: '이미지 데이터가 응답에 없습니다.' };
        }

        let buffer: Buffer;
        if (imageData.b64_json) {
            buffer = Buffer.from(imageData.b64_json, 'base64');
        } else if (imageData.url) {
            const imgResponse = await axios.get(imageData.url, { responseType: 'arraybuffer', timeout: 30000 });
            buffer = Buffer.from(imgResponse.data);
        } else {
            return { success: false, error: '이미지 데이터 형식이 올바르지 않습니다.' };
        }

        const filename = `openai_img_${Date.now()}.png`;
        const localPath = path.join(app.getPath('temp'), filename);
        fs.writeFileSync(localPath, buffer);

        return { success: true, localPath };
    } catch (err: any) {
        return { success: false, error: err.response?.data?.error?.message || err.message || 'OpenAI Image 생성 실패' };
    }
}
