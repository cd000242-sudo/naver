import type { GenerateImagesOptions, GeneratedImage, ImageFallbackPolicy, ImageProvider } from './image/types.js';
import { assertProvider as assertProviderFn, normalizeImageFallbackPolicy } from './image/types.js';
// ✅ [v2.10.335] 나노바나나 3종 → 모델 키 SSOT
import { NANO_PROVIDER_TO_MODEL_KEY } from './runtime/imageEngineCatalog.js';
import {
  generateWithNanoBananaPro,
  abortImageGeneration as abortNanoBananaImageGeneration,
  resetAllImageState,
} from './image/nanoBananaProGenerator.js';
import { generateWithDeepInfra } from './image/deepinfraGenerator.js';
import { generateWithNaver } from './image/naverImageGenerator.js';
import { generateWithOpenAIImage } from './image/openaiImageGenerator.js';
import { generateWithLeonardoAI } from './image/leonardoAIGenerator.js';
import { generateWithImageFx } from './image/imageFxGenerator.js';
import { generateWithFlow, resetFlowState } from './image/flowGenerator.js';
import { generateWithProdia } from './image/prodiaGenerator.js';
// ✅ [v2.11.7] 리더스 나노바나나 무제한 (dropshot)
import { generateWithDropshot } from './image/dropshotGenerator.js';

import { downloadAndSaveImage } from './image/imageUtils.js';
import { getImageErrorMessage } from './image/imageErrorMessages.js';
import { thumbnailService } from './thumbnailService.js';
import { AutomationService } from './main/services/AutomationService.js'; // ✅ [2026-01-29 FIX] 중지 체크용
import * as fs from 'fs/promises';
import * as path from 'path';


// Re-export types for backward compatibility
export type { GenerateImagesOptions, GeneratedImage } from './image/types.js';

// Re-export downloadAndSaveImage for backward compatibility
export { downloadAndSaveImage };

// ✅ [100점 수정] 이미지 생성 중지 함수 export
export async function abortImageGeneration(): Promise<void> {
  abortNanoBananaImageGeneration();
  try {
    await resetFlowState();
  } catch (error) {
    console.warn('[ImageGenerator] Flow 상태 초기화 실패 (abort 계속 진행):', (error as Error).message);
  }
}

// ✅ [2026-02-23 FIX] 이미지 생성 전체 상태 초기화 함수 export
export { resetAllImageState };

const FALLBACK_CONFIRM_MARKER = 'FALLBACK_REQUIRES_CONFIRMATION';
const HTTP_URL_RE = /^https?:\/\//i;

type ReferenceImageLike = string | {
  url?: string;
  thumbnailUrl?: string;
  filePath?: string;
  savedToLocal?: string;
  referenceImageUrl?: string;
  referenceImagePath?: string;
  src?: string;
};
type ReferenceImageObject = Exclude<ReferenceImageLike, string>;

export function normalizeReferenceImageUrl(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return HTTP_URL_RE.test(trimmed) ? trimmed : '';
  }
  if (typeof value !== 'object') return '';

  const image = value as ReferenceImageObject;
  const candidates = [
    image.referenceImageUrl,
    image.url,
    image.filePath,
    image.thumbnailUrl,
    image.savedToLocal,
    image.referenceImagePath,
    image.src,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeReferenceImageUrl(candidate);
    if (normalized) return normalized;
  }
  return '';
}

function collectReferenceImageUrls(...sources: unknown[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const add = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) add(item);
      return;
    }
    const url = normalizeReferenceImageUrl(value);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };

  for (const source of sources) add(source);
  return urls;
}

function annotateEngineTrace(
  images: GeneratedImage[],
  trace: {
    requestedProvider: string;
    actualProvider: string;
    policy: ImageFallbackPolicy;
    fallbackReason?: string;
  }
): GeneratedImage[] {
  const fallbackUsed = trace.requestedProvider !== trace.actualProvider || !!trace.fallbackReason;
  return images.map((img) => ({
    ...img,
    requestedProvider: trace.requestedProvider,
    actualProvider: trace.actualProvider,
    fallbackUsed,
    fallbackReason: trace.fallbackReason,
    imageFallbackPolicy: trace.policy,
  }));
}

function createFallbackPolicyError(
  requestedProvider: string,
  fallbackProvider: string,
  policy: ImageFallbackPolicy,
  reason: string
): Error {
  const prefix = policy === 'ask'
    ? `[${FALLBACK_CONFIRM_MARKER}] 선택한 엔진(${requestedProvider}) 우선 모드입니다.`
    : `[엔진 고정 모드] 선택한 엔진(${requestedProvider})만 사용하도록 설정되어 있습니다.`;
  return new Error(`${prefix}\n대체 후보: ${fallbackProvider}\n사유: ${reason}`);
}

function shouldUseAutomaticFallback(policy: ImageFallbackPolicy): boolean {
  return policy === 'guarantee';
}

/**
 * ✅ [2026-03-18 FIX] 반환 이미지에 isThumbnail 플래그 보존
 * 모든 provider generator가 isThumbnail을 반환하지 않으므로
 * generateImages 레벨에서 입력 items의 플래그를 출력에 합성
 */
function preserveThumbnailFlags(
  generatedImages: GeneratedImage[],
  inputItems: { heading: string; isThumbnail: boolean }[]
): GeneratedImage[] {
  return generatedImages.map((img, idx) => {
    // 1. 인덱스 기반 매칭 (가장 정확)
    if (idx < inputItems.length && inputItems[idx].isThumbnail) {
      return { ...img, isThumbnail: true };
    }
    // 2. heading 이름 기반 매칭 (필터링으로 인덱스가 어긋난 경우)
    const matchedItem = inputItems.find(item =>
      item.isThumbnail && item.heading === img.heading
    );
    if (matchedItem) {
      return { ...img, isThumbnail: true };
    }
    return img;
  });
}

/**
 * 엔진이 한글 텍스트를 네이티브로 지원하는지 확인
 */
function shouldAllowTextForImageItem(item: any, options: GenerateImagesOptions): boolean {
  if (item?.allowText !== true) return false;

  const thumbnailOnlyContext =
    options.thumbnailTextInclude === true ||
    options.isFullAuto === true ||
    (options as any).isContinuousMode === true ||
    (options as any).isMultiAccount === true;

  if (!thumbnailOnlyContext) return true;
  return item?.isThumbnail === true;
}

function shouldApplyThumbnailTextOverlay(
  img: GeneratedImage,
  index: number,
  items?: Array<{ heading?: string; isThumbnail?: boolean; allowText?: boolean }>
): boolean {
  const item = Array.isArray(items) ? items[index] : undefined;
  if (item) {
    return item?.isThumbnail === true && item?.allowText !== false;
  }
  return img?.isThumbnail === true;
}

function isKoreanTextSupportedEngine(engine: string): boolean {
  // ✅ [v1.4.80] 'flow' 추가 — Flow는 Nano Banana Pro 기반이라 한글 텍스트 네이티브 지원
  // ✅ [v2.10.335] 나노바나나2(3.1)/프로(3-pro)는 한글 네이티브 지원. 구버전 'nano-banana'(2.5)는
  //   한글 텍스트가 깨지므로 제외 → 오버레이 폴백 대상.
  // dropshot can generate Korean, but thumbnail copy needs deterministic app-side line breaks.
  return engine === 'nano-banana-2' || engine === 'nano-banana-pro' || engine === 'flow';
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
    if (shouldApplyThumbnailTextOverlay(img, i, items) && img.filePath) {
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

/**
 * ✅ [2026-03-03] 수집 이미지를 GeneratedImage[] 형태로 변환
 * 쇼핑커넥트에서 비-Gemini 엔진 또는 Gemini 실패 시 수집 이미지를 그대로 사용
 */
async function convertCollectedImagesToResults(
  collectedImages: unknown[] | undefined,
  items: { heading: string }[],
  postTitle?: string,
  postId?: string
): Promise<GeneratedImage[]> {
  const images = collectedImages || [];
  if (images.length === 0) {
    console.warn('[ImageGenerator] ⚠️ 수집 이미지 없음 → 빈 배열 반환');
    return [];
  }

  console.log(`[ImageGenerator] 🛒 수집 이미지 ${images.length}개를 블로그 이미지로 변환 중...`);

  const results: GeneratedImage[] = [];

  for (let i = 0; i < Math.min(items.length, images.length); i++) {
    const imageUrl = normalizeReferenceImageUrl(images[i]);
    if (!imageUrl) continue;

    try {
      // 이미지 다운로드
      const response = await (await import('axios')).default.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: { 'Referer': 'https://brand.naver.com/' }
      });
      const buffer = Buffer.from(response.data);

      if (buffer.length < 1000) {
        console.warn(`[ImageGenerator] ⚠️ [${i + 1}] 이미지 크기 너무 작음 (${buffer.length}B) → 스킵`);
        continue;
      }

      // 파일 저장
      const savedResult = await (await import('./image/imageUtils.js')).writeImageFile(
        buffer, 'png', items[i]?.heading || `product-${i + 1}`, postTitle, postId
      );

      results.push({
        heading: items[i]?.heading || `제품 이미지 ${i + 1}`,
        filePath: savedResult.savedToLocal || savedResult.filePath,
        provider: 'collected' as any,
        previewDataUrl: savedResult.previewDataUrl,
        savedToLocal: savedResult.savedToLocal
      });

      console.log(`[ImageGenerator] ✅ [${i + 1}/${items.length}] 수집 이미지 저장 완료`);
    } catch (err: any) {
      console.warn(`[ImageGenerator] ⚠️ [${i + 1}] 수집 이미지 다운로드 실패: ${err.message}`);
    }
  }

  console.log(`[ImageGenerator] 📊 수집 이미지 변환 완료: ${results.length}/${items.length}개`);
  return results;
}

export async function generateImages(options: GenerateImagesOptions, apiKeys?: {
  openaiApiKey?: string;
  geminiApiKey?: string; // ✅ Gemini 키
  deepinfraApiKey?: string; // ✅ DeepInfra 키
  openaiImageApiKey?: string; // ✅ OpenAI Image (DALL-E) 키
  leonardoaiApiKey?: string; // ✅ Leonardo AI 키
  prodiaApiKey?: string; // Prodia
}, onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void  // ✅ [2026-02-13 SPEED] 실시간 콜백
): Promise<GeneratedImage[]> {
  // ✅ [v2.7.27] Adaptive Limiter — 메인 스레드 lag 발생 시 자동으로 동시성 다운
  const { globalLimiter } = await import('./runtime/adaptiveLimiter.js');
  const release = await globalLimiter.acquire('image');
  try {
  // ✅ [2026-02-18 DEBUG] 프로바이더 수신 진단 로그
  console.log(`[ImageGenerator] 🔍🔍🔍 수신된 options.provider = "${options.provider}" (type: ${typeof options.provider})`);

  // ✅ [2026-01-28 FIX] 프로바이더 이름 정규화
  // ✅ [v2.10.335] 기본값 nano-banana-2 — 구 통합 옵션(nano-banana-pro)이 호출하던
  //   gemini-3-1-flash와 동일 모델이라 행동 보존. (nano-banana-pro는 이제 고가 3-pro)
  let normalizedProvider: string = options.provider || 'nano-banana-2';
  if (!options.provider) {
    console.warn(`[ImageGenerator] ⚠️⚠️⚠️ options.provider가 비어있어 'nano-banana-2' 기본값 적용! 호출자 확인 필요!`);
  }
  // deepinfra-flux, deepinfra-flux-2 등 → deepinfra
  if (normalizedProvider.startsWith('deepinfra')) {
    console.log(`[ImageGenerator] 📋 프로바이더 정규화: ${options.provider} → deepinfra`);
    normalizedProvider = 'deepinfra';
  }
  const requestedProvider = normalizedProvider;
  const fallbackPolicy = normalizeImageFallbackPolicy(options.imageFallbackPolicy);
  console.log(`[이미지생성] 🧭 엔진 실패 시 동작: ${fallbackPolicy}`);
  // ✅ [v2.10.335] 나노바나나 3종 분리 — nano-banana / nano-banana-2 / nano-banana-pro는
  //   각각 별개 모델(gemini-2.5-flash-image / 3.1-flash-image-preview / 3-pro-image-preview)로
  //   라우팅된다. v2.7.28의 통합 정규화는 제거됨.
  // ✅ [엔진명 한글 매핑]
  const providerDisplayNames: Record<string, string> = {
    'nano-banana': '나노바나나 (Gemini 2.5 Flash Image, ₩54/장)',
    'nano-banana-2': '나노바나나2 (Gemini 3.1 Flash Image, ₩97/장)',
    'nano-banana-pro': '나노바나나 프로 (Gemini 3 Pro Image, ₩185/장)',
    'deepinfra': '딥인프라 FLUX-2',
    'openai-image': 'OpenAI 덕트테이프 (gpt-image-2)',
    'dall-e-3': 'GPT 이미지 시리즈 (OpenAI, 기존 DALL-E 설정 자동 전환)',
    'leonardoai': 'Leonardo AI',
    'prodia': 'Prodia',
    'imagefx': 'ImageFX (Google Labs, 계정/IP 제한 가능)',
    'flow': 'Flow (Nano Banana 2, AI Pro 무료)', // ✅ [v1.5.4]
    'dropshot': '🍌 리더스 나노바나나 무제한 (구독자 무제한 · 추가비용 0원)', // ✅ [v2.11.7]
    'naver': '네이버 이미지 검색',
    'local-folder': '내 폴더',
  };
  const displayName = providerDisplayNames[normalizedProvider] || normalizedProvider;
  const shouldForceSequentialImages =
    options.isFullAuto === true ||
    options.isContinuousMode === true ||
    options.isMultiAccount === true ||
    options.forceSequential === true;

  // ✅ [2026-02-04] 선택된 엔진 명확히 표시 (한글 로그)
  console.log(`[이미지생성] 🎨 선택된 AI 이미지 생성 엔진: ${displayName}`);

  assertProviderFn(normalizedProvider as ImageProvider);

  // ✅ [2026-01-28] 크롤링 이미지가 있으면 각 item에 분배 (img2img 활성화)
  const crawledImages = collectReferenceImageUrls(
    options.crawledImages || [],
    options.collectedImages || [],
    options.referenceImagePath,
  );
  if (crawledImages.length > 0) {
    console.log(`[이미지생성] 🖼️ 대표/수집 이미지 ${crawledImages.length}개 감지 → img2img reference 활성화`);
  }

  const items = options.items
    .map((item, idx) => ({
      heading: item.heading,
      prompt: String(item.prompt || '').trim(),
      isThumbnail: item.isThumbnail || false, // ✅ isThumbnail 플래그 전달
      allowText: shouldAllowTextForImageItem(item, options), // text is thumbnail-only in auto publish contexts
      englishPrompt: item.englishPrompt,
      category: item.category || options.category || '', // ✅ [2026-02-12] options.category 폴백 → DeepInfra 카테고리별 스타일 적용
      referenceImagePath: item.referenceImagePath || options.referenceImagePath, // ✅ 전역 참조 이미지 적용
      // ✅ [2026-01-28] 크롤링 이미지를 referenceImageUrl에 할당 (img2img 활성화)
      referenceImageUrl: normalizeReferenceImageUrl(item.referenceImageUrl)
        || normalizeReferenceImageUrl(item.referenceImagePath)
        || crawledImages[idx]
        || crawledImages[0],
      referenceImageList: collectReferenceImageUrls(
        (item as any).referenceImageList,
        item.referenceImageUrl,
        item.referenceImagePath,
        crawledImages[idx],
        crawledImages[0],
      ).slice(0, 4),
      originalIndex: (item as any).originalIndex, // ✅ [2026-01-24] 원래 인덱스 보존
      // ✅ [2026-02-08] 이미지 스타일/비율 전달 (모든 엔진에서 사용)
      imageStyle: (item as any).imageStyle || (options as any).imageStyle, // ✅ [2026-02-18 FIX] options.imageStyle 폴백 추가 (full-auto에서 per-item에 없음)
      imageRatio: (item as any).imageRatio || (options as any).imageRatio, // ✅ [2026-02-18 FIX] options.imageRatio 폴백 추가
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

  // ✅ [v1.6.3] 쇼핑커넥트 AI 엔진 화이트리스트
  // 쇼핑커넥트에서는 img2img 지원 엔진만 제품 이미지를 정확히 재현 가능:
  //   - nano-banana-pro (Gemini img2img, 기본 gemini-3-1-flash = 나노바나나2)
  //   - openai-image (gpt-image-2 = 덕트테이프, image 파라미터로 참조 이미지 주입)
  // 그 외 엔진(Leonardo/DeepInfra/ImageFX 등)은 제품이 변형되므로 수집 이미지 그대로 사용
  const SC_IMG2IMG_ENGINES = ['nano-banana', 'nano-banana-2', 'nano-banana-pro', 'openai-image'];
  if (options.isShoppingConnect && !SC_IMG2IMG_ENGINES.includes(normalizedProvider)) {
    const reason = `쇼핑커넥트 모드에서 ${displayName}는 제품 외형을 정확히 재현할 수 없어 수집 이미지 대체가 필요합니다.`;
    if (!shouldUseAutomaticFallback(fallbackPolicy)) {
      throw createFallbackPolicyError(requestedProvider, 'collected-image', fallbackPolicy, reason);
    }
    console.log(`[이미지생성] 🛒 쇼핑커넥트 모드: ${displayName}는 제품 재현 불가 → 수집 이미지 직접 사용 (결과 보장 모드)`);
    const collectedResults = await convertCollectedImagesToResults(options.collectedImages || crawledImages, items, options.postTitle, options.postId);
    if (collectedResults.length === 0) {
      throw new Error(`[${displayName}] ${reason}\n수집 이미지가 없어 대체 결과를 만들 수 없습니다.`);
    }
    const traced = annotateEngineTrace(collectedResults, {
      requestedProvider,
      actualProvider: 'collected-image',
      policy: fallbackPolicy,
      fallbackReason: reason,
    });
    return preserveThumbnailFlags(await applyKoreanTextOverlayIfNeeded(traced, 'collected', options.postTitle, options.thumbnailTextInclude, items), items);
  }


  // ✅ [v1.5.5] OpenAI 덕트테이프 (gpt-image-2) 선택 시
  if (normalizedProvider === 'openai-image') {
    try {
      console.log(`[이미지생성] 🦆 OpenAI 덕트테이프(gpt-image-2)로 ${items.length}개 이미지 생성 시작...`);
      const openaiImages = await generateWithOpenAIImage(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto,
        apiKeys?.openaiImageApiKey,
        options.isShoppingConnect || false,
        onImageGenerated,
        options.collectedImages,
        undefined,
        apiKeys?.openaiApiKey
      );
      console.log(`[이미지생성] ✅ 덕트테이프(gpt-image-2)로 ${openaiImages.length}개 이미지 생성 완료!`);
      return preserveThumbnailFlags(await applyKoreanTextOverlayIfNeeded(annotateEngineTrace(openaiImages, {
        requestedProvider,
        actualProvider: 'openai-image',
        policy: fallbackPolicy,
      }), 'openai-image', options.postTitle, options.thumbnailTextInclude, items), items);
    } catch (openaiError) {
      console.warn(`[ImageGenerator] ⚠️ 덕트테이프 실패:`, (openaiError as Error).message);
      const userMsg = getImageErrorMessage(openaiError);
      throw new Error(`[OpenAI 이미지] ${userMsg}`);
    }
  }

  // ✅ [v2.10.216] 레거시 dall-e-3 — OpenAI 이미지 시리즈로 자동 전환
  //   사용자 보고: "달리 3는 없어지지않았니??"
  //   조치: 자동으로 gpt-image-1 (openai-image)로 마이그레이션 — 사용자 선택 무효화 안 하고 새 모델로 우회
  if (normalizedProvider === 'dall-e-3') {
    console.warn(`[이미지생성] ⚠️ 기존 DALL-E 설정 감지 → GPT 이미지 시리즈로 자동 전환`);
    const reason = '기존 DALL-E 설정은 OpenAI GPT 이미지 시리즈로 자동 전환됩니다.';
    if (!shouldUseAutomaticFallback(fallbackPolicy)) {
      throw createFallbackPolicyError(requestedProvider, 'openai-image', fallbackPolicy, reason);
    }
    try {
      console.log(`[이미지생성] 🎨 GPT 이미지 시리즈로 ${items.length}개 이미지 생성...`);
      const migratedImages = await generateWithOpenAIImage(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto,
        apiKeys?.openaiImageApiKey,
        options.isShoppingConnect || false,
        onImageGenerated,
        options.collectedImages,
        // 'dall-e-3' 모델 강제 지정 제거 — 기본 gpt-image-1 사용
        undefined,
        apiKeys?.openaiApiKey
      );
      console.log(`[이미지생성] ✅ GPT 이미지 시리즈로 ${migratedImages.length}개 생성 완료 (레거시 설정 자동 전환)`);
      return preserveThumbnailFlags(await applyKoreanTextOverlayIfNeeded(annotateEngineTrace(migratedImages, {
        requestedProvider,
        actualProvider: 'openai-image',
        policy: fallbackPolicy,
        fallbackReason: reason,
      }), 'openai-image', options.postTitle, options.thumbnailTextInclude, items), items);
    } catch (migrationError) {
      console.error(`[ImageGenerator] ❌ gpt-image-1 자동 마이그레이션 실패:`, (migrationError as Error).message);
      const userMsg = getImageErrorMessage(migrationError);
      throw new Error(`기존 DALL-E 설정은 사용할 수 없어 GPT 이미지 시리즈로 전환해야 합니다.\n환경설정 → 이미지 엔진에서 OpenAI Image (gpt-image-1 / 1.5 / 2)를 선택해주세요.\n\n원본 오류: ${userMsg}`);
    }
  }

  // ✅ [2026-02-22] Leonardo AI 선택 시
  if (normalizedProvider === 'leonardoai') {
    try {
      console.log(`[이미지생성] 🦁 Leonardo AI로 ${items.length}개 이미지 생성 시작...`);
      const leonardoImages = await generateWithLeonardoAI(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto,
        apiKeys?.leonardoaiApiKey,
        options.isShoppingConnect || false,
        onImageGenerated,  // ✅ [2026-02-27] 실시간 콜백 전달
        options.collectedImages  // ✅ [2026-03-03] 수집 이미지 참조 (img2img)
      );
      console.log(`[이미지생성] ✅ Leonardo AI로 ${leonardoImages.length}개 이미지 생성 완료!`);
      return preserveThumbnailFlags(await applyKoreanTextOverlayIfNeeded(annotateEngineTrace(leonardoImages, {
        requestedProvider,
        actualProvider: 'leonardoai',
        policy: fallbackPolicy,
      }), 'leonardoai', options.postTitle, options.thumbnailTextInclude, items), items);
    } catch (leonardoError) {
      console.warn(`[ImageGenerator] ⚠️ Leonardo AI 실패:`, (leonardoError as Error).message);
      const userMsg = getImageErrorMessage(leonardoError);
      throw new Error(`[Leonardo AI] ${userMsg}`);
    }
  }

  // ✅ [2026-03-15] ImageFX 선택 시 (Google Labs — Gemini API 키 불필요, 단 계정/IP 접근 제한 가능)
  if (normalizedProvider === 'imagefx') {
    try {
      console.log(`[이미지생성] ✨ ImageFX로 ${items.length}개 이미지 생성 시작... (Google Labs 계정/IP 접근 제한 가능)`);
      const imageFxImages = await generateWithImageFx(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto,
        options.isShoppingConnect || false,
        options.stopCheck,
        onImageGenerated
      );
      console.log(`[이미지생성] ✅ ImageFX로 ${imageFxImages.length}개 이미지 생성 완료!`);
      return preserveThumbnailFlags(await applyKoreanTextOverlayIfNeeded(annotateEngineTrace(imageFxImages, {
        requestedProvider,
        actualProvider: 'imagefx',
        policy: fallbackPolicy,
      }), 'imagefx', options.postTitle, options.thumbnailTextInclude, items), items);
    } catch (imageFxError) {
      const rawMsg = (imageFxError as Error).message || '';
      console.warn(`[ImageGenerator] ⚠️ ImageFX 실패:`, rawMsg);

      // ✅ [v1.4.40] 분류된 에러는 IMAGEFX_TYPE: 접두사 제거하고 그대로 전달
      // 사용자가 정확한 사유(쿼터 초과/안전 필터/세션 만료)를 알 수 있도록
      if (rawMsg.startsWith('IMAGEFX_FORBIDDEN')) {
        throw new Error(
          '[ImageFX] Google ImageFX가 현재 계정/IP/지역에서 생성 API 접근을 거부했습니다.\n\n' +
          '이 문제는 API 키나 앱 오류가 아니라 Google Labs 접근 정책 문제입니다. 로그인은 성공해도 생성 API에서 403으로 막힐 수 있습니다.\n\n' +
          '해결 방법:\n' +
          '1. 환경설정 → ImageFX → Google 계정 변경으로 다른 Google 계정을 시도하세요.\n' +
          '2. 테더링, 다른 네트워크, VPN 등으로 IP를 바꾼 뒤 다시 시도하세요.\n' +
          '3. 대량 발행은 Flow, 리더스 나노바나나프로, OpenAI Image, DeepInfra처럼 접근성이 확인된 엔진을 권장합니다.'
        );
      }
      if (rawMsg.startsWith('IMAGEFX_')) {
        const userMessage = rawMsg.replace(/^IMAGEFX_[A-Z_]+:/, '');
        throw new Error(`[ImageFX] ${userMessage}`);
      }

      // 분류 안 된 에러 → 일반 메시지
      throw new Error(`[ImageFX] 이미지 생성 실패: ${rawMsg}\n\n💡 가능한 원인:\n1. 시간당 한도 초과 (1시간 후 재시도)\n2. Google 세션 만료 (재로그인 필요)\n3. 안전 필터 차단 (키워드 변경)\n4. 일시적인 응답 오류`);
    }
  }



  // ✅ [v1.4.80] Google Labs Flow 선택 시 (Nano Banana Pro 무료 쿼터, labs.google 세션 공유)
  if (normalizedProvider === 'flow') {
    try {
      console.log(`[이미지생성] 🍌 Google Labs Flow(Nano Banana 2)로 ${items.length}개 이미지 생성 시작... (AI Pro 쿼터 무료)`);
      const flowImages = await generateWithFlow(
        items,
        options.postTitle,
        options.postId,
        onImageGenerated,
        undefined,
        undefined,
        { sequential: shouldForceSequentialImages },
      );
      if (flowImages.length === 0) {
        throw new Error('Flow가 0건 반환 — 상세 원인은 이전 로그(sendImageLog) 참고. 쿼터/세션/안전필터/API 구조 변경 가능성.');
      }
      console.log(`[이미지생성] ✅ Flow로 ${flowImages.length}개 이미지 생성 완료!`);
      return preserveThumbnailFlags(await applyKoreanTextOverlayIfNeeded(annotateEngineTrace(flowImages, {
        requestedProvider,
        actualProvider: 'flow',
        policy: fallbackPolicy,
      }), 'flow', options.postTitle, options.thumbnailTextInclude, items), items);
    } catch (flowError) {
      const rawMsg = (flowError as Error).message || '';
      console.warn(`[ImageGenerator] ⚠️ Flow 실패:`, rawMsg);
      if (rawMsg.startsWith('FLOW_')) {
        const userMessage = rawMsg.replace(/^FLOW_[A-Z_]+:/, '');
        throw new Error(`[Flow] ${userMessage}`);
      }
      throw new Error(`[Flow] 이미지 생성 실패: ${rawMsg}\n\n💡 가능한 원인:\n1. 계정 쿼터 초과 (1시간 후 재시도)\n2. Google 세션 만료 (AdsPower 재로그인)\n3. 안전 필터 차단\n4. Flow 내부 API 구조 변경 (자동 재학습 시도됨)`);
    }
  }

  if (normalizedProvider === 'prodia') {
    try {
      console.log(`[이미지생성] ⚡ Prodia로 ${items.length}개 이미지 생성 시작...`);
      const prodiaImages = await generateWithProdia(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto,
        apiKeys?.prodiaApiKey,
        onImageGenerated,
      );
      if (prodiaImages.length === 0) {
        throw new Error('Prodia가 0건을 반환했습니다. API 키, 크레딧, 모델 제한을 확인해주세요.');
      }
      return preserveThumbnailFlags(await applyKoreanTextOverlayIfNeeded(annotateEngineTrace(prodiaImages, {
        requestedProvider,
        actualProvider: 'prodia',
        policy: fallbackPolicy,
      }), 'prodia', options.postTitle, options.thumbnailTextInclude, items), items);
    } catch (prodiaError) {
      const userMsg = getImageErrorMessage(prodiaError);
      throw new Error(`[Prodia] ${userMsg}`);
    }
  }

  // ✅ [v2.11.7] 리더스 나노바나나 무제한 (dropshot) — 사용자 명시 선택 시만. auto/폴백 체인 제외.
  if (normalizedProvider === 'dropshot') {
    try {
      console.log(`[이미지생성] 🍌 리더스 나노바나나 무제한으로 ${items.length}개 이미지 생성 시작... (구독자 무제한 · 추가비용 0원)`);
      const dropshotImages = await generateWithDropshot(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto,
        options.isShoppingConnect || false,
        options.stopCheck,
        onImageGenerated,
      );
      if (dropshotImages.length === 0) {
        throw new Error('리더스 나노바나나 무제한 0건 반환 — 로그인/세션/쿼터 확인 필요');
      }
      console.log(`[이미지생성] ✅ 리더스 나노바나나 무제한으로 ${dropshotImages.length}개 이미지 생성 완료!`);
      return preserveThumbnailFlags(await applyKoreanTextOverlayIfNeeded(annotateEngineTrace(dropshotImages, {
        requestedProvider,
        actualProvider: 'dropshot',
        policy: fallbackPolicy,
      }), 'dropshot', options.postTitle, options.thumbnailTextInclude, items), items);
    } catch (dropshotError) {
      const rawMsg = (dropshotError as Error).message || '';
      console.warn(`[ImageGenerator] ⚠️ 리더스 나노바나나 무제한 실패:`, rawMsg);
      throw new Error(`[리더스 나노바나나 무제한] 이미지 생성 실패: ${rawMsg}\n\n💡 가능한 원인:\n1. Dropshot Pro 구독 미완료 또는 만료\n2. 로그인 세션 만료 (재로그인 필요)\n3. Dropshot UI 구조 변경\n4. 브라우저 실행 실패 (Chrome/Edge 설치 필요)`);
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
        options.isShoppingConnect || false, // ✅ [2026-02-12] 쇼핑커넥트 모드 전달
        onImageGenerated,  // ✅ [2026-02-27] 실시간 콜백 전달
        options.collectedImages  // ✅ [2026-03-03] 수집 이미지 참조 (img2img)
      );
      console.log(`[이미지생성] ✅ 딥인프라 FLUX-2로 ${deepinfraImages.length}개 이미지 생성 완료!`);
      // ✅ [2026-01-30 FIX] DeepInfra도 텍스트 오버레이 적용 (한글 텍스트 지원 안함)
      return preserveThumbnailFlags(await applyKoreanTextOverlayIfNeeded(annotateEngineTrace(deepinfraImages, {
        requestedProvider,
        actualProvider: 'deepinfra',
        policy: fallbackPolicy,
      }), 'deepinfra', options.postTitle, options.thumbnailTextInclude, items), items);
    } catch (deepinfraError) {
      console.warn(`[ImageGenerator] ⚠️ DeepInfra 실패:`, (deepinfraError as Error).message);
      const userMsg = getImageErrorMessage(deepinfraError);
      throw new Error(`[DeepInfra FLUX] ${userMsg}`);
    }
  }

  // 네이버 선택 시
  if (normalizedProvider === 'naver') {
    return preserveThumbnailFlags(annotateEngineTrace(await generateWithNaver(items, options.postTitle, options.postId, options.regenerate, options.sourceUrl, options.articleUrl), {
      requestedProvider,
      actualProvider: 'naver',
      policy: fallbackPolicy,
    }), items);
  }

  // ✅ [v1.4.80] 'local-folder'는 renderer에서 별도 처리되어야 하는 값
  //    이 경로로 도달 시 명확한 에러 throw (nano-banana-pro 폴백으로 오작동하는 것 방지)
  if (normalizedProvider === 'local-folder') {
    throw new Error('[local-folder] 내 폴더 이미지는 renderer의 localFolderImageLoader에서 처리해야 합니다. generateImages로 전달되면 안 됩니다.');
  }

  // ✅ [v2.10.335] 나노바나나 3종 (Gemini 기반) — 엔진 선택이 곧 모델
  if (normalizedProvider === 'nano-banana' || normalizedProvider === 'nano-banana-2' || normalizedProvider === 'nano-banana-pro') {
    // provider → nanoBananaProGenerator MODEL_MAP 키. forceModelKey로 config를 오버라이드해
    //   사용자가 그리드/드롭다운에서 고른 엔진이 정확히 그 모델로 호출되게 한다.
    const forceModelKey = NANO_PROVIDER_TO_MODEL_KEY[normalizedProvider];
    const modelLabel = providerDisplayNames[normalizedProvider] || normalizedProvider;
    console.log(`[이미지생성] 🍌 ${modelLabel}로 ${items.length}개 이미지 생성 시작...`);
    console.log(`[ImageGenerator] Gemini API 키: ${apiKeys?.geminiApiKey ? `*** (길이: ${apiKeys.geminiApiKey.length})` : '미설정'}`);

    try {
      const nanoBananaImages = await generateWithNanoBananaPro(
        items,
        options.postTitle,
        options.postId,
        options.isFullAuto,
        apiKeys?.geminiApiKey,
        options.isShoppingConnect,
        options.collectedImages,
        options.stopCheck,
        onImageGenerated,
        (options as any).productData,
        forceModelKey, // v2.7.16: 모델 강제 지정
        shouldForceSequentialImages,
      );
      console.log(`[이미지생성] ✅ ${modelLabel} ${nanoBananaImages.length}개 이미지 생성 완료!`);
      return preserveThumbnailFlags(annotateEngineTrace(nanoBananaImages, {
        requestedProvider,
        actualProvider: normalizedProvider,
        policy: fallbackPolicy,
      }), items);
    } catch (geminiError: any) {
      if (options.isShoppingConnect) {
        const reason = `Gemini 계열 엔진 실패 후 쇼핑커넥트 수집 이미지 대체가 필요합니다. 원본 오류: ${geminiError.message}`;
        if (!shouldUseAutomaticFallback(fallbackPolicy)) {
          throw createFallbackPolicyError(requestedProvider, 'collected-image', fallbackPolicy, reason);
        }
        console.warn(`[ImageGenerator] ⚠️ Gemini 실패 → 쇼핑커넥트 수집 이미지로 폴백 (결과 보장 모드): ${geminiError.message}`);
        const collectedResults = await convertCollectedImagesToResults(options.collectedImages || crawledImages, items, options.postTitle, options.postId);
        if (collectedResults.length === 0) {
          throw new Error(`[${modelLabel}] ${reason}\n수집 이미지가 없어 대체 결과를 만들 수 없습니다.`);
        }
        const traced = annotateEngineTrace(collectedResults, {
          requestedProvider,
          actualProvider: 'collected-image',
          policy: fallbackPolicy,
          fallbackReason: reason,
        });
        return preserveThumbnailFlags(await applyKoreanTextOverlayIfNeeded(traced, 'collected', options.postTitle, options.thumbnailTextInclude, items), items);
      }
      throw geminiError;
    }
  }

  // ✅ [2026-03-17 FIX] 'saved', 'skip' 등 유효하지 않은 provider는 nano-banana-pro로 폴백
  const unsupportedReason = `지원하지 않는 이미지 제공자입니다: ${normalizedProvider}`;
  if (!shouldUseAutomaticFallback(fallbackPolicy)) {
    throw createFallbackPolicyError(requestedProvider, 'nano-banana-pro', fallbackPolicy, unsupportedReason);
  }
  console.warn(`[ImageGenerator] ⚠️ 지원하지 않는 제공자 "${normalizedProvider}" → nano-banana-pro(Gemini)로 폴백 (결과 보장 모드)`);
  normalizedProvider = 'nano-banana-pro';

  // nano-banana-pro 폴백 실행 (Gemini API)
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
      options.stopCheck,
      onImageGenerated,
      (options as any).productData,
      undefined,
      shouldForceSequentialImages
    );
    console.log(`[이미지생성] ✅ 폴백 나노 바나나 프로(Gemini)로 ${fallbackImages.length}개 이미지 생성 완료!`);
    return preserveThumbnailFlags(annotateEngineTrace(fallbackImages, {
      requestedProvider,
      actualProvider: 'nano-banana-pro',
      policy: fallbackPolicy,
      fallbackReason: unsupportedReason,
    }), items);
  } catch (fallbackError) {
    throw new Error(`이미지 생성 실패: 지원하지 않는 이미지 제공자(${options.provider}) 및 Gemini 폴백 실패 - ${(fallbackError as Error).message}`);
  }
  } finally {
    // ✅ [v2.7.27] Adaptive Limiter 슬롯 반환 (acquire/finally 짝)
    release();
  }
}
