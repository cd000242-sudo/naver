/**
 * ✅ [2026-02-12 100점] Prodia 이미지 생성기
 * - 퍼지 카테고리 매칭 (getStyleGuideByCategory)
 * - 쇼핑커넥트 라이프스타일 스타일
 * - NO PEOPLE 충돌 방지
 * - 재시도 + 프롬프트 변형 (VARIATION_STYLES)
 * - 28개 카테고리 스타일
 * - 텍스트 오버레이 지원
 */

import type { GeneratedImage, ImageRequestItem } from './types.js';
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

const PRODIA_INFERENCE_URL = 'https://inference.prodia.com/v2/job';

// ✅ [2026-02-08] Prodia v2 API 모델 매핑 테이블
export const PRODIA_MODELS: Record<string, { type: string; name: string; steps: number; cfg_scale: number }> = {
  'sd35': { type: 'inference.sd3.5.txt2img.v1', name: '🎨 SD 3.5 (고품질)', steps: 30, cfg_scale: 7.0 },
  'sdxl': { type: 'inference.sdxl.txt2img.v1', name: '⚖️ SDXL 1.0 (균형)', steps: 25, cfg_scale: 7.0 },
  'flux-schnell': { type: 'inference.flux.schnell.txt2img.v1', name: '⚡ Flux Schnell (초고속)', steps: 4, cfg_scale: 3.5 },
  'flux-2-dev': { type: 'inference.flux-2.dev.txt2img.v1', name: '🏆 Flux 2 Dev (최신)', steps: 28, cfg_scale: 3.5 },
};

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * ✅ [2026-02-12 100점] Prodia 프롬프트 빌더
 * - 카테고리 스타일 적용
 * - NO PEOPLE 충돌 방지
 * - 쇼핑커넥트 라이프스타일
 * - 재시도 변형 힌트
 */
function buildProdiaPrompt(
  item: ImageRequestItem,
  isThumbnail: boolean,
  postTitle?: string,
  imageStyle: string = 'realistic',
  isShoppingConnect: boolean = false,
  variationHint?: string
): string {
  // ═══════════════════════════════════════════════════════
  // 1️⃣ 이미지 스타일 결정
  // ═══════════════════════════════════════════════════════
  const isAnime = imageStyle === 'anime';

  // ═══════════════════════════════════════════════════════
  // 2️⃣ 카테고리 스타일 가져오기 (퍼지 매칭)
  // ═══════════════════════════════════════════════════════
  const categoryStyleMap = isAnime ? ANIME_CATEGORY_STYLES : REALISTIC_CATEGORY_STYLES;
  const { styleGuide: categoryStyle, matchedKey } = getStyleGuideByCategory(item.category, categoryStyleMap);
  console.log(`[Prodia] 📂 카테고리: "${item.category}" → 매칭: "${matchedKey}"`);

  // ═══════════════════════════════════════════════════════
  // 3️⃣ 쇼핑커넥트 모드 → 라이프스타일 스타일 오버라이드
  // ═══════════════════════════════════════════════════════
  const styleGuide = isShoppingConnect ? SHOPPING_CONNECT_LIFESTYLE : categoryStyle;
  if (isShoppingConnect) {
    console.log(`[Prodia] 🛒 쇼핑커넥트 모드 → 라이프스타일 스타일 적용`);
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

  if (isThumbnail && postTitle) {
    const styleSpecific = isNonRealisticStyle
      ? `Generate a premium blog thumbnail in ${imageStyle} style.\n${stylePrompt}.`
      : `Generate a premium, high-impact blog thumbnail.\n${stylePrompt}.`;
    prompt = `${styleSpecific}
Topic: ${baseSubject}.
Style: ${styleGuide}.
Aesthetic: Professional magazine quality, high contrast, vibrant colors.

DESIGN REQUIREMENTS:
- SINGLE COHESIVE IMAGE (NO collage, NO split-screen).
- Place the main subject prominently.
- Eye-catching blog thumbnail style.
- ABSOLUTELY NO TEXT, NO letters, NO words, NO watermarks.
- Pure visual impact only.${isNonRealisticStyle ? `\n\nIMPORTANT: Generate in ${imageStyle} style. DO NOT generate photorealistic images.` : ''}`;
  } else {
    const styleSpecific = isNonRealisticStyle
      ? `Generate a ${imageStyle} style image for a blog section titled "${item.heading}".\n${stylePrompt}.`
      : `Generate a photorealistic professional image for a blog section titled "${item.heading}".\n${stylePrompt}.`;
    prompt = `${styleSpecific}
Subject Detail: "${baseSubject}".
Style: ${styleGuide}.

ABSOLUTE REQUIREMENTS:
- NEVER TEXT. No letters, words, numbers, symbols, signs, labels, banners, watermarks.
- Cinematic lighting, ultra-detailed, 8k quality.
- High-end commercial photography, sharp focus.${isNonRealisticStyle ? `\n\nIMPORTANT: Generate in ${imageStyle} style. DO NOT generate photorealistic images.` : ''}`;
  }

  // ✅ 재시도 프롬프트 변형 적용
  if (variationHint) {
    prompt += `\n[VARIATION: ${variationHint}]`;
  }

  return prompt;
}

/**
 * ✅ [2026-02-12 100점] Prodia로 일괄 이미지 생성
 * - 퍼지 카테고리 매칭
 * - 쇼핑커넥트 라이프스타일
 * - NO PEOPLE 충돌 방지
 * - 재시도 + 프롬프트 변형
 * - 텍스트 오버레이
 */
export async function generateWithProdia(
  items: ImageRequestItem[],
  postTitle?: string,
  postId?: string,
  isFullAuto: boolean = false,
  prodiaToken?: string,
  isShoppingConnect: boolean = false // ✅ [2026-02-12] 쇼핑커넥트 모드
): Promise<GeneratedImage[]> {
  const config = await loadConfig();
  const token = String(prodiaToken || config.prodiaToken || process.env.PRODIA_TOKEN || '').trim();
  if (!token) {
    throw new Error(
      'Prodia API 토큰이 설정되지 않았습니다.\n\n' +
      '환경 설정 → Prodia API Token을 입력해주세요.\n' +
      '발급: https://app.prodia.com/api',
    );
  }

  const selectedModelKey = (config as any).prodiaModel || 'sd35';
  const modelConfig = PRODIA_MODELS[selectedModelKey] || PRODIA_MODELS['sd35'];
  console.log(`[Prodia] 🎨 모델: ${selectedModelKey} → ${modelConfig.name} (${modelConfig.type}), 쇼핑커넥트: ${isShoppingConnect}`);

  const results: GeneratedImage[] = [];
  const axios = (await import('axios')).default;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isThumbnail = (item as any).isThumbnail !== undefined ? !!(item as any).isThumbnail : i === 0;
    const imageStyle = (item as any).imageStyle || (config as any).imageStyle || 'realistic';
    console.log(`[Prodia] 🖼️ [${i + 1}/${items.length}] "${item.heading}" 생성 중... (스타일: ${imageStyle})`);

    // ═══════════════════════════════════════════════════════
    // 이미지 비율 설정
    // ═══════════════════════════════════════════════════════
    const imageRatio = (item as any).imageRatio || (config as any).imageRatio || '1:1';
    const sizeMap: Record<string, { w: number; h: number }> = {
      '1:1': { w: 1024, h: 1024 },
      '16:9': { w: 1344, h: 768 },
      '9:16': { w: 768, h: 1344 },
      '4:3': { w: 1152, h: 896 },
      '3:4': { w: 896, h: 1152 },
    };
    const dims = sizeMap[imageRatio] || { w: 1024, h: 768 };
    console.log(`[Prodia] 📐 이미지 비율: ${imageRatio} → ${dims.w}x${dims.h}`);

    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // ✅ 재시도 시 프롬프트 변형 (이미지 다양성 확보)
        const variationHint = attempt > 1
          ? VARIATION_STYLES[Math.floor(Math.random() * VARIATION_STYLES.length)]
          : undefined;

        if (variationHint) {
          console.log(`[Prodia] 🔄 재시도 ${attempt}/${maxRetries}: ${variationHint}`);
        }

        const prompt = buildProdiaPrompt(item, isThumbnail, postTitle, imageStyle, isShoppingConnect, variationHint);

        const job = {
          type: modelConfig.type,
          config: {
            prompt,
            width: dims.w,
            height: dims.h,
            steps: modelConfig.steps,
            cfg_scale: modelConfig.cfg_scale,
          },
        };

        const response = await axios.post(PRODIA_INFERENCE_URL, job, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'image/png',
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 120000,
          validateStatus: () => true,
        });

        if (response.status === 429) {
          const retryAfterRaw = String(response.headers?.['retry-after'] || '').trim();
          const retryAfterSec = Number.parseInt(retryAfterRaw, 10);
          const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : Math.min(3000, 400 * attempt);
          await sleep(waitMs);
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          throw new Error(`Prodia 인증 실패(${response.status}). 토큰이 올바른지 확인해주세요.`);
        }

        if (response.status !== 200) {
          const body = (() => {
            try {
              return Buffer.from(response.data || []).toString('utf-8');
            } catch {
              return '';
            }
          })();
          throw new Error(`Prodia 요청 실패(${response.status}). ${String(body || '').slice(0, 200)}`);
        }

        let buffer = Buffer.from(response.data);
        if (!buffer || buffer.length < 1000) {
          throw new Error('Prodia 응답 이미지가 너무 작습니다.');
        }

        // ═══════════════════════════════════════════════════
        // ✅ 텍스트 오버레이 (1번 이미지 + allowText)
        // ═══════════════════════════════════════════════════
        const isFirstImage = i === 0;
        const explicitlyAllowText = (item as any).allowText === true;
        const shouldApplyTextOverlay = isFirstImage && explicitlyAllowText && postTitle;

        if (shouldApplyTextOverlay) {
          console.log(`[Prodia] 📝 1번 이미지 텍스트 오버레이 적용 중...`);
          try {
            const overlayResult = await addThumbnailTextOverlay(buffer, postTitle);
            if (overlayResult.success && overlayResult.outputBuffer) {
              buffer = overlayResult.outputBuffer;
              console.log(`[Prodia] ✅ 텍스트 오버레이 적용 완료`);
            }
          } catch (overlayError) {
            console.warn(`[Prodia] ⚠️ 텍스트 오버레이 예외:`, overlayError);
          }
        }

        const saved = await writeImageFile(buffer, 'png', item.heading, postTitle, postId);
        const finalFilePath = saved.savedToLocal || saved.filePath;

        results.push({
          heading: item.heading,
          filePath: finalFilePath,
          previewDataUrl: saved.previewDataUrl,
          provider: 'prodia',
          savedToLocal: saved.savedToLocal,
        });
        break;
      } catch (e) {
        const msg = (e as Error).message;
        if (attempt >= maxRetries) {
          throw new Error(`Prodia 이미지 생성 실패: ${msg}`);
        }
        await sleep(Math.min(2500, 350 * attempt));
      }
    }
  }

  console.log(`[Prodia] ✅ 완료: ${results.length}/${items.length}개 성공`);
  return results;
}
