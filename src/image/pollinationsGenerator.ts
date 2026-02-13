/**
 * ✅ [2026-02-12 100점] Pollinations.AI 무료 이미지 생성기
 * - 퍼지 카테고리 매칭 (getStyleGuideByCategory)
 * - 쇼핑커넥트 라이프스타일 스타일
 * - NO PEOPLE 충돌 방지
 * - 재시도 + 프롬프트 변형 (VARIATION_STYLES)
 * - 28개 카테고리 스타일
 * - 텍스트 오버레이 지원
 * - writeImageFile 표준화
 */

import axios from 'axios';
import { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { loadConfig } from '../configManager.js';
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
} from './imageStyles.js';

export async function isPollinationsConfigured(): Promise<boolean> {
    return true;
}

// 지원 사이즈
export const POLLINATIONS_SIZES = [
    '1024x1024',
    '768x1024', // 세로형 (블로그 최적)
    '1024x768', // 가로형
    '512x512',
] as const;

/**
 * ✅ [2026-02-12 100점] Pollinations.AI로 단일 이미지 생성
 */
async function generateSingleImage(
    prompt: string,
    width: number = 1024,
    height: number = 1024
): Promise<{ success: boolean; imageUrl?: string; buffer?: Buffer; error?: string }> {

    // ✅ 한글 프롬프트는 URL 인코딩 필수
    const safePrompt = encodeURIComponent(prompt);

    // ✅ FLUX 모델 명시 & enhance=true (프롬프트 자동 보정)
    const seed = Math.floor(Math.random() * 1000000);
    const requestUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}&enhance=true`;

    console.log(`[Pollinations] 🌸 요청 URL 길이: ${requestUrl.length}자`);

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await axios.get(requestUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/jpeg, image/png, image/webp'
                }
            });

            if (response.status !== 200) {
                throw new Error(`HTTP Status ${response.status}`);
            }

            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.startsWith('image/')) {
                const errorBody = Buffer.from(response.data).toString('utf-8').slice(0, 100);
                throw new Error(`응답이 이미지가 아님 (${contentType}): ${errorBody}`);
            }

            const buffer = Buffer.from(response.data);
            const imageSize = buffer.length;

            if (imageSize < 5000) {
                throw new Error(`이미지 용량이 너무 작음 (${imageSize} bytes) - 생성 실패 의심`);
            }

            console.log(`[Pollinations] ✅ 생성 성공: ${(imageSize / 1024).toFixed(1)}KB`);

            return {
                success: true,
                imageUrl: requestUrl,
                buffer
            };

        } catch (error: any) {
            console.error(`[Pollinations] ❌ 시도 ${attempt}/3 실패: ${error.message}`);

            if (attempt < 3) {
                const delay = 3000 * attempt;
                console.log(`[Pollinations] ⏳ ${delay / 1000}초 후 재시도...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    return { success: false, error: '3회 시도 모두 실패' };
}

/**
 * ✅ [2026-02-12 100점] Pollinations.AI로 일괄 이미지 생성
 * - 퍼지 카테고리 매칭
 * - 쇼핑커넥트 라이프스타일
 * - NO PEOPLE 충돌 방지
 * - 재시도 + 프롬프트 변형
 * - 텍스트 오버레이
 * - writeImageFile 표준화
 */
export async function generateWithPollinations(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    isFullAuto: boolean = false,
    isShoppingConnect: boolean = false // ✅ [2026-02-12] 쇼핑커넥트 모드
): Promise<GeneratedImage[]> {
    const config = await loadConfig();
    const imageRatio = (config as any).imageRatio || '1:1';

    console.log(`[Pollinations] 🌸 총 ${items.length}개 이미지 생성 시작 (FLUX 모델, 순차 처리, 쇼핑커넥트: ${isShoppingConnect})`);

    const results: GeneratedImage[] = [];

    // ✅ [2026-01-30] 순차 처리 (무료 API 안정성 확보)
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isThumbnail = i === 0 || (item as any).isThumbnail;
        const itemRatio = (item as any).imageRatio || imageRatio;

        console.log(`[Pollinations] 🖼️ [${i + 1}/${items.length}] "${item.heading}" 생성 중...`);

        try {
            // ═══════════════════════════════════════════════════════
            // 1️⃣ 이미지 스타일 결정
            // ═══════════════════════════════════════════════════════
            const imageStyle = (item as any).imageStyle || (config as any).imageStyle || 'realistic';
            const isAnime = imageStyle === 'anime';

            // ═══════════════════════════════════════════════════════
            // 2️⃣ 카테고리 스타일 가져오기 (퍼지 매칭)
            // ═══════════════════════════════════════════════════════
            const categoryStyleMap = isAnime ? ANIME_CATEGORY_STYLES : REALISTIC_CATEGORY_STYLES;
            const { styleGuide: categoryStyle, matchedKey } = getStyleGuideByCategory(item.category, categoryStyleMap);
            console.log(`[Pollinations] 📂 카테고리: "${item.category}" → 매칭: "${matchedKey}"`);

            // ═══════════════════════════════════════════════════════
            // 3️⃣ 쇼핑커넥트 모드 → 라이프스타일 스타일 오버라이드
            // ═══════════════════════════════════════════════════════
            const styleGuide = isShoppingConnect ? SHOPPING_CONNECT_LIFESTYLE : categoryStyle;
            if (isShoppingConnect) {
                console.log(`[Pollinations] 🛒 쇼핑커넥트 모드 → 라이프스타일 스타일 적용`);
            }

            // ═══════════════════════════════════════════════════════
            // 4️⃣ 스타일 프롬프트 매핑
            // ═══════════════════════════════════════════════════════
            const stylePrompt = STYLE_PROMPT_MAP[imageStyle] || STYLE_PROMPT_MAP['realistic'];
            const isNonRealisticStyle = imageStyle !== 'realistic' && imageStyle !== 'bokeh' && !isAnime;

            // ═══════════════════════════════════════════════════════
            // 5️⃣ 베이스 프롬프트 + NO PEOPLE 충돌 방지
            // ═══════════════════════════════════════════════════════
            let baseSubject = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading);
            baseSubject = filterPersonKeywordsIfNeeded(styleGuide, baseSubject, item.heading, sanitizeImagePrompt);

            // ═══════════════════════════════════════════════════════
            // 6️⃣ 프롬프트 조합
            // ═══════════════════════════════════════════════════════
            let prompt = '';
            const noTextInstruction = 'NO TEXT NO WRITING NO LETTERS NO WORDS NO NUMBERS NO SYMBOLS';

            if (isThumbnail && postTitle) {
                prompt = isNonRealisticStyle
                    ? `Generate a premium blog thumbnail in ${imageStyle} style. ${stylePrompt}. Topic: ${baseSubject}. Style: ${styleGuide}. Professional magazine quality, high contrast, vibrant colors. SINGLE COHESIVE IMAGE. ${noTextInstruction}.`
                    : `Generate a premium, high-impact blog thumbnail. ${stylePrompt}. Topic: ${baseSubject}. Style: ${styleGuide}. Professional magazine quality, high contrast, vibrant colors. SINGLE COHESIVE IMAGE. ${noTextInstruction}.`;
            } else {
                prompt = isNonRealisticStyle
                    ? `${imageStyle} style image for blog section "${item.heading}". ${stylePrompt}. Subject: ${baseSubject}. Style: ${styleGuide}. Cinematic lighting, ultra-detailed. ${noTextInstruction}.`
                    : `Photorealistic professional image for blog section "${item.heading}". ${stylePrompt}. Subject: ${baseSubject}. Style: ${styleGuide}. 8k quality, cinematic lighting, sharp focus. ${noTextInstruction}.`;
            }

            if (isNonRealisticStyle) {
                prompt += ` IMPORTANT: Generate in ${imageStyle} style. DO NOT generate photorealistic images.`;
            }

            // ═══════════════════════════════════════════════════════
            // 7️⃣ 이미지 비율 → 픽셀 변환
            // ═══════════════════════════════════════════════════════
            const sizeMap: Record<string, { w: number; h: number }> = {
                '1:1': { w: 1024, h: 1024 },
                '16:9': { w: 1344, h: 768 },
                '9:16': { w: 768, h: 1344 },
                '4:3': { w: 1152, h: 896 },
                '3:4': { w: 896, h: 1152 },
            };
            const dims = sizeMap[itemRatio] || { w: 1024, h: 1024 };

            // ═══════════════════════════════════════════════════════
            // 8️⃣ 재시도 루프 (프롬프트 변형)
            // ═══════════════════════════════════════════════════════
            const maxAttempts = 2;
            let imageResult: { success: boolean; buffer?: Buffer } | null = null;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                let attemptPrompt = prompt;

                if (attempt > 1) {
                    const variationHint = VARIATION_STYLES[Math.floor(Math.random() * VARIATION_STYLES.length)];
                    attemptPrompt += ` ${variationHint}`;
                    console.log(`[Pollinations] 🔄 재시도 ${attempt}/${maxAttempts}: ${variationHint}`);
                }

                imageResult = await generateSingleImage(attemptPrompt, dims.w, dims.h);

                if (imageResult.success && imageResult.buffer) break;
            }

            if (!imageResult?.success || !imageResult?.buffer) {
                console.warn(`[Pollinations] ⚠️ "${item.heading}" 생성 실패, 건너뜀.`);
                continue;
            }

            let buffer = imageResult.buffer;

            // ═══════════════════════════════════════════════════════
            // 9️⃣ 텍스트 오버레이 (1번 이미지 + allowText)
            // ═══════════════════════════════════════════════════════
            const isFirstImage = i === 0;
            const explicitlyAllowText = (item as any).allowText === true;
            const shouldApplyTextOverlay = isFirstImage && explicitlyAllowText && postTitle;

            if (shouldApplyTextOverlay) {
                console.log(`[Pollinations] 📝 1번 이미지 텍스트 오버레이 적용 중...`);
                try {
                    const overlayResult = await addThumbnailTextOverlay(buffer, postTitle);
                    if (overlayResult.success && overlayResult.outputBuffer) {
                        buffer = overlayResult.outputBuffer;
                        console.log(`[Pollinations] ✅ 텍스트 오버레이 적용 완료`);
                    }
                } catch (overlayError) {
                    console.warn(`[Pollinations] ⚠️ 텍스트 오버레이 예외:`, overlayError);
                }
            }

            // ═════════════════════════════════════════════════
            // 🔟 writeImageFile 표준 저장
            // ═════════════════════════════════════════════════
            const saved = await writeImageFile(buffer, 'jpg', item.heading, postTitle, postId);

            results.push({
                heading: item.heading,
                filePath: saved.savedToLocal || saved.filePath,
                previewDataUrl: saved.previewDataUrl,
                provider: 'pollinations',
                savedToLocal: saved.savedToLocal,
            });

            console.log(`[Pollinations] ✅ [${i + 1}/${items.length}] "${item.heading}" 저장 완료`);

        } catch (e) {
            console.error(`[Pollinations] 치명적 오류 (${item.heading}):`, e);
        }

        // 다음 이미지 전 대기 (무료 API 안정성 - 5초)
        if (i + 1 < items.length) {
            console.log(`[Pollinations] ⏳ 다음 이미지 생성 전 5초 대기 (안정성)...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log(`[Pollinations] ✅ 완료: ${results.length}/${items.length}개 성공`);
    return results;
}

export default { generateWithPollinations, isPollinationsConfigured };