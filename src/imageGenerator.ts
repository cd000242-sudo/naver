import type { GenerateImagesOptions, GeneratedImage, ImageProvider } from './image/types.js';
import { assertProvider as assertProviderFn } from './image/types.js';
import { generateWithNanoBananaPro, abortImageGeneration } from './image/nanoBananaProGenerator.js';
import { generateWithFalAI } from './image/falaiGenerator.js';
import { generateWithDeepInfra } from './image/deepinfraGenerator.js';
import { generateWithNaver } from './image/naverImageGenerator.js';
import { generateWithProdia } from './image/prodiaGenerator.js';
import { generateWithStability } from './image/stabilityGenerator.js';
import { generateWithPollinations } from './image/pollinationsGenerator.js';
import { downloadAndSaveImage } from './image/imageUtils.js';
import { thumbnailService } from './thumbnailService.js';
import { AutomationService } from './main/services/AutomationService.js'; // ✅ [2026-01-29 FIX] 중지 체크용
import * as fs from 'fs/promises';
import * as path from 'path';


// Re-export types for backward compatibility
export type { GenerateImagesOptions, GeneratedImage } from './image/types.js';

// Re-export downloadAndSaveImage for backward compatibility
export { downloadAndSaveImage };

// ✅ [100점 수정] 이미지 생성 중지 함수 export
export { abortImageGeneration };

/**
 * 엔진이 한글 텍스트를 네이티브로 지원하는지 확인
 */
function isKoreanTextSupportedEngine(engine: string): boolean {
  // 나노바나나프로(Gemini)만 한글 텍스트 직접 생성 지원
  return engine === 'nano-banana-pro';
}

/**
 * ✅ [2026-01-30] 한글 텍스트 오버레이 후처리
 * - 기존 thumbnailService.createProductThumbnail 재활용
 * - 나노바나나프로 외 엔진에서 썸네일(0번)에만 한글 텍스트 오버레이
 * - 일반 모드: 1번 소제목 = 썸네일 (인덱스 0)
 * - 쇼핑커넥트 모드: 별도 썸네일 (인덱스 0)
 * - thumbnailTextInclude 설정이 true일 때만 적용
 */
async function applyKoreanTextOverlayIfNeeded(
  images: GeneratedImage[],
  provider: string,
  postTitle?: string,
  thumbnailTextInclude?: boolean,
  items?: { heading: string }[]  // 미사용 (호환성 유지)
): Promise<GeneratedImage[]> {
  // 나노바나나프로는 한글 텍스트 지원 → 오버레이 불필요
  if (isKoreanTextSupportedEngine(provider)) {
    console.log(`[ImageGenerator] 📝 ${provider}는 한글 텍스트 네이티브 지원 → 오버레이 스킵`);
    return images;
  }

  // thumbnailTextInclude가 false면 오버레이 불필요
  if (!thumbnailTextInclude) {
    console.log(`[ImageGenerator] 📝 텍스트 포함 옵션 OFF → 오버레이 스킵`);
    return images;
  }

  // postTitle이 없으면 오버레이 불필요
  if (!postTitle || postTitle.trim().length === 0) {
    console.log(`[ImageGenerator] 📝 제목 없음 → 오버레이 스킵`);
    return images;
  }

  console.log(`[ImageGenerator] 📝 ${provider} 엔진: 썸네일(0번)에 한글 텍스트 오버레이 시작...`);

  const result: GeneratedImage[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    // ✅ [2026-01-30] 썸네일(0번)만 텍스트 오버레이 적용
    // - 일반 모드: 1번 소제목 = 썸네일 역할 (인덱스 0)
    // - 쇼핑커넥트: 별도 썸네일 (인덱스 0)
    if (i === 0 && img.filePath) {
      try {
        console.log(`[ImageGenerator] 🖼️ 썸네일에 텍스트 오버레이: "${postTitle.substring(0, 30)}..."`);

        // ✅ 기존 thumbnailService.createProductThumbnail 활용
        const outputPath = img.filePath;

        await thumbnailService.createProductThumbnail(
          img.filePath,
          postTitle,
          outputPath,
          {
            position: 'bottom',
            fontSize: 28,
            textColor: '#ffffff',
            opacity: 0.8
          }
        );

        // previewDataUrl 업데이트
        const overlaidBuffer = await fs.readFile(outputPath);
        const updatedImg = { ...img };
        updatedImg.previewDataUrl = `data:image/png;base64,${overlaidBuffer.toString('base64')}`;

        result.push(updatedImg);
        console.log(`[ImageGenerator] ✅ 썸네일 텍스트 오버레이 완료!`);
      } catch (overlayError) {
        console.warn(`[ImageGenerator] ⚠️ 텍스트 오버레이 실패:`, (overlayError as Error).message);
        result.push(img); // 실패 시 원본 사용
      }
    } else {
      result.push(img);
    }
  }

  return result;
}

export async function generateImages(options: GenerateImagesOptions, apiKeys?: {
  geminiApiKey?: string; // ✅ Gemini 키
  prodiaToken?: string; // ✅ Prodia 토큰
  stabilityApiKey?: string; // ✅ Stability AI 키
  falaiApiKey?: string; // ✅ Fal.ai 키
  deepinfraApiKey?: string; // ✅ DeepInfra 키 추가
}): Promise<GeneratedImage[]> {
  // ✅ [2026-01-28 FIX] 프로바이더 이름 정규화
  let normalizedProvider: string = options.provider || 'nano-banana-pro';

  // deepinfra-flux, deepinfra-flux-2 등 → deepinfra
  if (normalizedProvider.startsWith('deepinfra')) {
    console.log(`[ImageGenerator] 📋 프로바이더 정규화: ${options.provider} → deepinfra`);
    normalizedProvider = 'deepinfra';
  }
  // fal-ai → falai (하이픈 제거)
  if (normalizedProvider === 'fal-ai') {
    console.log(`[ImageGenerator] 📋 프로바이더 정규화: fal-ai → falai`);
    normalizedProvider = 'falai';
  }
  // ✅ [엔진명 한글 매핑]
  const providerDisplayNames: Record<string, string> = {
    'nano-banana-pro': '나노 바나나 프로 (Gemini)',
    'deepinfra': '딥인프라 FLUX-2',
    'falai': 'Fal.ai FLUX',
    'prodia': 'Prodia',
    'stability': 'Stability AI',
    'pollinations': 'Pollinations (무료)',
    'naver': '네이버 이미지 검색'
  };
  const displayName = providerDisplayNames[normalizedProvider] || normalizedProvider;

  // ✅ [2026-02-04] 선택된 엔진 명확히 표시 (한글 로그)
  console.log(`[이미지생성] 🎨 선택된 AI 이미지 생성 엔진: ${displayName}`);

  assertProviderFn(normalizedProvider === 'pollinations' ? 'nano-banana-pro' : normalizedProvider as ImageProvider);

  // ✅ [2026-01-28] 크롤링 이미지가 있으면 각 item에 분배 (img2img 활성화)
  const crawledImages = options.crawledImages || [];
  if (crawledImages.length > 0) {
    console.log(`[이미지생성] 🖼️ 크롤링 이미지 ${crawledImages.length}개 감지 → img2img 모드 활성화`);
  }

  const items = options.items
    .map((item, idx) => ({
      heading: item.heading,
      prompt: String(item.prompt || '').trim(),
      isThumbnail: item.isThumbnail || false, // ✅ isThumbnail 플래그 전달
      allowText: (item as any).allowText || false, // ✅ 상세페이지/인포그래픽 텍스트 허용
      englishPrompt: item.englishPrompt,
      category: item.category || options.category || '', // ✅ [2026-02-12] options.category 폴백 → DeepInfra 카테고리별 스타일 적용
      referenceImagePath: item.referenceImagePath || options.referenceImagePath, // ✅ 전역 참조 이미지 적용
      // ✅ [2026-01-28] 크롤링 이미지를 referenceImageUrl에 할당 (img2img 활성화)
      referenceImageUrl: item.referenceImageUrl || crawledImages[idx] || crawledImages[0],
      originalIndex: (item as any).originalIndex, // ✅ [2026-01-24] 원래 인덱스 보존
      // ✅ [2026-02-08] 이미지 스타일/비율 전달 (모든 엔진에서 사용)
      imageStyle: (item as any).imageStyle,
      imageRatio: (item as any).imageRatio,
    }))
    .filter((item) => item.prompt.length > 0);

  // ✅ [2026-02-04] 생성할 이미지 수 로그 (items 선언 후)
  console.log(`[이미지생성] 🖼️ 생성할 이미지 수: ${items.length}개`);

  if (items.length === 0) {
    throw new Error('이미지를 생성할 소제목과 프롬프트를 확인해주세요.');
  }

  // ✅ [2026-01-29 FIX] 중지 요청 체크 - 이미지 생성 시작 전
  if (AutomationService.isCancelRequested()) {
    console.log('[ImageGenerator] ⛔ 중지 요청 감지 → 이미지 생성 취소');
    return [];
  }


  // ✅ Pollinations 선택 시 (무료 FLUX 기반)
  if (normalizedProvider === 'pollinations') {
    try {
      console.log(`[이미지생성] 🌸 Pollinations로 ${items.length}개 이미지 생성 시작... (무료)`);
      const pollinationsImages = await generateWithPollinations(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto,
        options.isShoppingConnect || false // ✅ [2026-02-12] 쇼핑커넥트 모드 전달
      );
      console.log(`[이미지생성] ✅ Pollinations로 ${pollinationsImages.length}개 이미지 생성 완료!`);
      return await applyKoreanTextOverlayIfNeeded(pollinationsImages, 'pollinations', options.postTitle, options.thumbnailTextInclude, items);
    } catch (pollError) {
      console.warn(`[ImageGenerator] ⚠️ Pollinations 실패:`, (pollError as Error).message);
      throw new Error(`이미지 생성 실패: Pollinations 실패 (${(pollError as Error).message})`);
    }
  }

  // ✅ Fal.ai 선택 시 (FLUX 모델 기반)
  if (normalizedProvider === 'falai') {
    try {
      console.log(`[이미지생성] 🎨 Fal.ai로 ${items.length}개 이미지 생성 시작...`);
      const falaiImages = await generateWithFalAI(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto,
        apiKeys?.falaiApiKey,
        options.isShoppingConnect || false // ✅ [2026-02-12] 쇼핑커넥트 모드 전달
      );
      console.log(`[이미지생성] ✅ Fal.ai로 ${falaiImages.length}개 이미지 생성 완료!`);
      return await applyKoreanTextOverlayIfNeeded(falaiImages, 'falai', options.postTitle, options.thumbnailTextInclude, items);
    } catch (falError) {
      console.warn(`[ImageGenerator] ⚠️ Fal.ai 실패:`, (falError as Error).message);
      throw new Error(`이미지 생성 실패: Fal.ai 실패 (${(falError as Error).message})`);
    }
  }

  // ✅ DeepInfra 선택 시 (FLUX-2-dev, 고품질 저가)
  // ✅ [2026-01-30 FIX] DeepInfra도 텍스트 오버레이 적용 (한글 텍스트 지원 안함)
  if (normalizedProvider === 'deepinfra') {
    try {
      console.log(`[이미지생성] 🚀 딥인프라 FLUX-2로 ${items.length}개 이미지 생성 시작...`);
      const deepinfraImages = await generateWithDeepInfra(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto,
        apiKeys?.deepinfraApiKey,
        options.isShoppingConnect || false // ✅ [2026-02-12] 쇼핑커넥트 모드 전달
      );
      console.log(`[이미지생성] ✅ 딥인프라 FLUX-2로 ${deepinfraImages.length}개 이미지 생성 완료!`);
      // ✅ [2026-01-30 FIX] DeepInfra도 텍스트 오버레이 적용 (한글 텍스트 지원 안함)
      return await applyKoreanTextOverlayIfNeeded(deepinfraImages, 'deepinfra', options.postTitle, options.thumbnailTextInclude, items);
    } catch (deepinfraError) {
      console.warn(`[ImageGenerator] ⚠️ DeepInfra 실패:`, (deepinfraError as Error).message);
      throw new Error(`이미지 생성 실패: DeepInfra 실패 (${(deepinfraError as Error).message})`);
    }
  }

  // ✅ Prodia 선택 시 (Prodia v2 Inference API)
  if (normalizedProvider === 'prodia') {
    try {
      console.log(`[이미지생성] ⚡ Prodia로 ${items.length}개 이미지 생성 시작...`);
      console.log(`[ImageGenerator] Prodia Token: ${apiKeys?.prodiaToken ? apiKeys.prodiaToken.substring(0, 10) + '...' : '미설정'}`);
      const prodiaImages = await generateWithProdia(items, options.postTitle, options.postId, options.isFullAuto, apiKeys?.prodiaToken, options.isShoppingConnect || false); // ✅ [2026-02-12] 쇼핑커넥트 모드 전달
      console.log(`[이미지생성] ✅ Prodia로 ${prodiaImages.length}개 이미지 생성 완료!`);
      return await applyKoreanTextOverlayIfNeeded(prodiaImages, 'prodia', options.postTitle, options.thumbnailTextInclude, items);
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
        console.log(`[이미지생성] 🍌 나노 바나나 프로(Gemini)로 ${items.length}개 이미지 생성 시작... (시도 ${attempt}/3)`);
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
        console.log(`[이미지생성] ✅ 나노 바나나 프로(Gemini)로 ${nanoBananaImages.length}개 이미지 생성 완료!`);
        // ✅ [2026-01-28] Gemini는 프롬프트를 통해 한글 텍스트를 직접 생성함
        // items[0].allowText + items[0].isThumbnail가 true이면 PromptBuilder가 텍스트 포함 프롬프트 생성
        // 후처리 오버레이는 Gemini 결과를 덮어쓰므로 제거
        return nanoBananaImages;
      } catch (nanoBananaError) {
        lastError = nanoBananaError;
        console.warn(`[이미지생성] ⚠️ 나노 바나나 프로 실패 (시도 ${attempt}/3):`, (nanoBananaError as Error).message);

        // 500 오류이거나 치명적이지 않은 오류인 경우 잠시 대기 후 재시도
        if (attempt < 3) {
          const delay = 2000 * attempt;
          console.log(`[이미지생성] ⏳ ${delay}ms 후 재시도합니다...`);
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
        console.log(`[이미지생성] 🚀 Stability AI로 ${items.length}개 이미지 생성 시작... (시도 ${attempt}/3)`);
        const stabilityImages = await generateWithStability(
          items,
          options.postTitle,
          options.postId,
          options.isFullAuto,
          apiKeys?.stabilityApiKey,
          (options as any).model,
          options.isShoppingConnect || false // ✅ [2026-02-12] 쇼핑커넥트 모드 전달
        );
        console.log(`[이미지생성] ✅ Stability AI로 ${stabilityImages.length}개 이미지 생성 완료!`);
        return await applyKoreanTextOverlayIfNeeded(stabilityImages, 'stability', options.postTitle, options.thumbnailTextInclude, items);
      } catch (stabilityError) {
        lastError = stabilityError;
        console.warn(`[이미지생성] ⚠️ Stability AI 실패 (시도 ${attempt}/3):`, (stabilityError as Error).message);

        if (attempt < 3) {
          const delay = 2000 * attempt;
          console.log(`[이미지생성] ⏳ ${delay}ms 후 재시도합니다...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(`이미지 생성 실패: Stability AI 실패 (3회 시도 초과) - ${(lastError as Error).message}`);
  }

  // ✅ [2026-02-13 FIX] 'saved', 'skip' 등 유효하지 않은 provider는 nano-banana-pro로 폴백
  console.warn(`[ImageGenerator] ⚠️ 지원하지 않는 제공자 "${normalizedProvider}" → nano-banana-pro로 폴백`);
  normalizedProvider = 'nano-banana-pro';

  // nano-banana-pro 폴백 실행
  try {
    console.log(`[이미지생성] 🍌 폴백: 나노 바나나 프로(Gemini)로 ${items.length}개 이미지 생성 시작...`);
    const fallbackImages = await generateWithNanoBananaPro(
      items,
      options.postTitle,
      options.postId,
      options.isFullAuto,
      apiKeys?.geminiApiKey,
      options.isShoppingConnect,
      options.collectedImages,
      options.stopCheck
    );
    console.log(`[이미지생성] ✅ 폴백 나노 바나나 프로(Gemini)로 ${fallbackImages.length}개 이미지 생성 완료!`);
    return fallbackImages;
  } catch (fallbackError) {
    throw new Error(`이미지 생성 실패: 지원하지 않는 이미지 제공자(${options.provider}) 및 폴백 실패 - ${(fallbackError as Error).message}`);
  }
}
