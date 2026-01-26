import type { GenerateImagesOptions, GeneratedImage } from './image/types.js';
import { assertProvider as assertProviderFn } from './image/types.js';
import { generateWithNanoBananaPro, abortImageGeneration } from './image/nanoBananaProGenerator.js';
import { generateWithFalAI } from './image/falaiGenerator.js';
import { generateWithNaver } from './image/naverImageGenerator.js';
import { generateWithProdia } from './image/prodiaGenerator.js';
import { generateWithStability } from './image/stabilityGenerator.js';
import { generateWithPollinations } from './image/pollinationsGenerator.js';
import { downloadAndSaveImage } from './image/imageUtils.js';

// Re-export types for backward compatibility
export type { GenerateImagesOptions, GeneratedImage } from './image/types.js';

// Re-export downloadAndSaveImage for backward compatibility
export { downloadAndSaveImage };

// ✅ [100점 수정] 이미지 생성 중지 함수 export
export { abortImageGeneration };

export async function generateImages(options: GenerateImagesOptions, apiKeys?: {
  geminiApiKey?: string; // ✅ Gemini 키
  prodiaToken?: string; // ✅ Prodia 토큰
  stabilityApiKey?: string; // ✅ Stability AI 키
  falaiApiKey?: string; // ✅ Fal.ai 키 추가
}): Promise<GeneratedImage[]> {
  const normalizedProvider = options.provider;
  assertProviderFn(normalizedProvider === 'pollinations' ? 'nano-banana-pro' : normalizedProvider);

  const items = options.items
    .map((item) => ({
      heading: item.heading,
      prompt: String(item.prompt || '').trim(),
      isThumbnail: item.isThumbnail || false, // ✅ isThumbnail 플래그 전달
      allowText: (item as any).allowText || false, // ✅ 상세페이지/인포그래픽 텍스트 허용
      englishPrompt: item.englishPrompt,
      category: item.category,
      referenceImagePath: item.referenceImagePath || options.referenceImagePath, // ✅ 전역 참조 이미지 적용
      referenceImageUrl: item.referenceImageUrl,
      originalIndex: (item as any).originalIndex, // ✅ [2026-01-24] 원래 인덱스 보존
    }))
    .filter((item) => item.prompt.length > 0);

  if (items.length === 0) {
    throw new Error('이미지를 생성할 소제목과 프롬프트를 확인해주세요.');
  }

  // ✅ Pollinations 선택 시 (무료 FLUX 기반)
  if (normalizedProvider === 'pollinations') {
    try {
      console.log(`[ImageGenerator] 🌸 Pollinations로 ${items.length}개 이미지 생성 시도... (무료)`);
      const pollinationsImages = await generateWithPollinations(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto
      );
      console.log(`[ImageGenerator] ✅ Pollinations로 ${pollinationsImages.length}개 이미지 생성 성공!`);
      return pollinationsImages;
    } catch (pollError) {
      console.warn(`[ImageGenerator] ⚠️ Pollinations 실패:`, (pollError as Error).message);
      throw new Error(`이미지 생성 실패: Pollinations 실패 (${(pollError as Error).message})`);
    }
  }

  // ✅ Fal.ai 선택 시 (FLUX 모델 기반)
  if (normalizedProvider === 'falai') {
    try {
      console.log(`[ImageGenerator] 🎨 Fal.ai로 ${items.length}개 이미지 생성 시도...`);
      const falaiImages = await generateWithFalAI(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto,
        apiKeys?.falaiApiKey
      );
      console.log(`[ImageGenerator] ✅ Fal.ai로 ${falaiImages.length}개 이미지 생성 성공!`);
      return falaiImages;
    } catch (falError) {
      console.warn(`[ImageGenerator] ⚠️ Fal.ai 실패:`, (falError as Error).message);
      throw new Error(`이미지 생성 실패: Fal.ai 실패 (${(falError as Error).message})`);
    }
  }

  // ✅ Prodia 선택 시 (Prodia v2 Inference API)
  if (normalizedProvider === 'prodia') {
    try {
      console.log(`[ImageGenerator] ⚡ Prodia로 ${items.length}개 이미지 생성 시도...`);
      console.log(`[ImageGenerator] Prodia Token: ${apiKeys?.prodiaToken ? apiKeys.prodiaToken.substring(0, 10) + '...' : '미설정'}`);
      const prodiaImages = await generateWithProdia(items, options.postTitle, options.postId, options.isFullAuto, apiKeys?.prodiaToken);
      console.log(`[ImageGenerator] ✅ Prodia로 ${prodiaImages.length}개 이미지 생성 성공!`);
      return prodiaImages;
    } catch (prodiaError) {
      console.warn(`[ImageGenerator] ⚠️ Prodia 실패:`, (prodiaError as Error).message);
      throw new Error(`이미지 생성 실패: Prodia 실패 (${(prodiaError as Error).message})`);
    }
  }

  // 네이버 선택 시
  if (normalizedProvider === 'naver') {
    return generateWithNaver(items, options.postTitle, options.postId, options.regenerate, options.sourceUrl, options.articleUrl);
  }

  // ✅ 나노 바나나 프로 선택 시 (Gemini 기반, 썸네일 제외 NEVER TEXT 적용)
  if (normalizedProvider === 'nano-banana-pro') {
    let lastError: any;
    // 최대 3회 재시도 (500 오류 등 일시적 장애 대응)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[ImageGenerator] 🍌 나노 바나나 프로(Gemini)로 ${items.length}개 이미지 생성 시도... (시도 ${attempt}/3)`);
        if (attempt === 1) {
          console.log(`[ImageGenerator] ℹ️ 썸네일(1번) 제외 모든 이미지에 NEVER TEXT 적용`);
          console.log(`[ImageGenerator] Gemini API 키: ${apiKeys?.geminiApiKey ? apiKeys.geminiApiKey.substring(0, 10) + '...' : '미설정'}`);
        }

        const nanoBananaImages = await generateWithNanoBananaPro(
          items,
          options.postTitle,
          options.postId,
          options.isFullAuto,
          apiKeys?.geminiApiKey, // ✅ Gemini API 키 전달
          options.isShoppingConnect, // ✅ 쇼핑커넥트 모드 전달
          options.collectedImages, // ✅ 수집된 이미지 목록 전달
          options.stopCheck  // ✅ [100점 수정] 중지 여부 확인 콜백 전달
        );
        console.log(`[ImageGenerator] ✅ 나노 바나나 프로(Gemini)로 ${nanoBananaImages.length}개 이미지 생성 성공!`);
        return nanoBananaImages;
      } catch (nanoBananaError) {
        lastError = nanoBananaError;
        console.warn(`[ImageGenerator] ⚠️ 나노 바나나 프로 실패 (시도 ${attempt}/3):`, (nanoBananaError as Error).message);

        // 500 오류이거나 치명적이지 않은 오류인 경우 잠시 대기 후 재시도
        if (attempt < 3) {
          const delay = 2000 * attempt;
          console.log(`[ImageGenerator] ⏳ ${delay}ms 후 재시도합니다...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(`이미지 생성 실패: 나노 바나나 프로(Gemini) 실패 (3회 시도 초과) - ${(lastError as Error).message}`);
  }

  // ✅ Stability AI 선택 시
  if (normalizedProvider === 'stability') {
    let lastError: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[ImageGenerator] 🚀 Stability AI로 ${items.length}개 이미지 생성 시도... (시도 ${attempt}/3)`);
        const stabilityImages = await generateWithStability(
          items,
          options.postTitle,
          options.postId,
          options.isFullAuto,
          apiKeys?.stabilityApiKey,
          (options as any).model
        );
        console.log(`[ImageGenerator] ✅ Stability AI로 ${stabilityImages.length}개 이미지 생성 성공!`);
        return stabilityImages;
      } catch (stabilityError) {
        lastError = stabilityError;
        console.warn(`[ImageGenerator] ⚠️ Stability AI 실패 (시도 ${attempt}/3):`, (stabilityError as Error).message);

        if (attempt < 3) {
          const delay = 2000 * attempt;
          console.log(`[ImageGenerator] ⏳ ${delay}ms 후 재시도합니다...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(`이미지 생성 실패: Stability AI 실패 (3회 시도 초과) - ${(lastError as Error).message}`);
  }

  throw new Error(`지원하지 않는 이미지 제공자입니다: ${normalizedProvider}`);
}
