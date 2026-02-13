/**
 * 나노 바나나 프로 이미지 생성기
 * Refactored: PromptBuilder 모듈로 프롬프트 로직 분리
 */

import type { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { PromptBuilder } from './promptBuilder.js';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import sharp from 'sharp';

// 전역 사용된 이미지 URL 추적
const usedImageUrls = new Set<string>();
const MAX_USED_URLS = 500; // ✅ [2026-02-03] 메모리 누수 방지: 최대 500개 유지

// ✅ [2026-02-03 FIX] Set 크기 제한 함수
function addToUsedUrls(url: string): void {
  if (usedImageUrls.size >= MAX_USED_URLS) {
    // 가장 오래된 항목 삭제 (FIFO)
    const firstUrl = usedImageUrls.values().next().value;
    if (firstUrl) usedImageUrls.delete(firstUrl);
  }
  usedImageUrls.add(url);
}

// ✅ 카테고리별 이미지 스타일 매핑
// ✅ [2026-01-29 100점 수정] 표준 카테고리명 사용 (categoryNormalizeUtils.ts 기준)
const CATEGORY_IMAGE_STYLES: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════════════════
  // ✅ 표준 카테고리명 기준 - 인물 필수/제외 명확 구분
  // ═══════════════════════════════════════════════════════════════════════════════

  // ===== 🎭 인물 필수 카테고리 (PERSON REQUIRED) =====

  // 스타 연예인: 한국 연예인 화보 스타일 (Nano Banana Pro만 텍스트 가능)
  '스타 연예인': 'Naver Homefeed Style: Professional photography of a FAMOUS KOREAN CELEBRITY, genuine Hallyu star likeness with recognizable K-star facial features, high-impact glamorous stage lighting, vibrant rich colors, premium magazine editorial quality. Can include Korean text overlay for thumbnail.',

  // 스포츠: 한국 선수 액션샷
  '스포츠': 'Naver Sports Style: Dynamic action shot of Korean athlete, high-speed motion capture, dramatic lighting, intense competitive moment, sports magazine quality.',

  // 패션 뷰티: 한국인 모델 필수
  '패션 뷰티': 'K-beauty and K-fashion editorial: Beautiful Korean model with flawless glass skin, stylish modern outfit, Vogue Korea magazine cover quality, professional studio lighting.',

  // 건강: 한국인 인물 포함 가능
  '건강': 'Health and wellness photography: Clean bright medical/wellness concept, can include healthy Korean person exercising, soft natural lighting, wellness magazine quality.',

  // 교육/육아: 따뜻한 가족 사진
  '교육/육아': 'Heartwarming Korean family photography: Loving Korean mother with adorable child, cozy home atmosphere, warm natural lighting, genuine happy smiles, family magazine quality.',

  // 자기계발: 성공한 전문직 한국인
  '자기계발': 'Successful Korean professional: Confident Korean business person in modern office, motivational atmosphere, clean bright lighting, career success imagery.',

  // 취미 라이프: 라이프스타일 (인물 포함 가능)
  '취미 라이프': 'Korean lifestyle photography: Modern living moments, bright airy atmosphere, can include Korean person naturally, lifestyle magazine quality.',

  // ===== 🍽️ 인물 제외 카테고리 (NO PEOPLE - 사물/풍경 중심) =====

  // 요리 맛집: 푸드 포토그래피 (인물 절대 제외)
  '요리 맛집': 'Professional food photography: Overhead flat lay composition, appetizing Korean cuisine close-up, warm cinematic lighting, NO PEOPLE NO HANDS, clean table styling, food magazine quality.',

  // 여행: 풍경 중심 (인물 제외)
  '여행': 'Stunning Korean landscape photography: Breathtaking scenic view, golden hour lighting, NO PEOPLE, travel destination focus, National Geographic quality.',

  // IT 테크: 제품 히어로샷 (인물 제외)
  'IT 테크': 'Technology product hero shot: Sleek modern device on minimalist background, professional studio lighting, NO PEOPLE, Apple-style product photography.',

  // 제품 리뷰: 제품 중심 (인물 제외)
  '제품 리뷰': 'E-commerce product photography: Premium product on clean white background, professional studio lighting, NO PEOPLE, Amazon/Naver Shopping style.',

  // 리빙 인테리어: 인테리어 사진 (인물 제외)
  '리빙 인테리어': 'Modern interior photography: Beautiful Korean home interior, clean minimalist design, natural daylight, NO PEOPLE, home magazine quality.',

  // 반려동물: 동물 중심
  '반려동물': 'Adorable pet photography: Cute dog or cat portrait, warm lighting, NO PEOPLE, pet magazine quality.',

  // 자동차: 차량 중심
  '자동차': 'Automotive photography: Sleek car exterior/interior shot, dramatic lighting, NO PEOPLE, car magazine quality.',

  // 부동산: 건물/공간 사진
  '부동산': 'Real estate photography: Beautiful property exterior or interior, wide angle shot, natural lighting, NO PEOPLE, real estate listing quality.',

  // ===== 📊 비즈니스/경제/정치 카테고리 (손/사람 + 한글 텍스트 오버레이 스타일) =====

  // 비즈니스 경제: 손이 나오는 실사 + 한글 텍스트 오버레이 (네이버 블로그 썸네일 스타일)
  '비즈니스 경제': 'Naver Blog Thumbnail Style: Korean person hands holding smartphone, tablet, document, credit card, or money. Split composition with real-life photo on one side and text space on other side. Korean business professional atmosphere, warm indoor lighting, office or home setting. BOLD LARGE Korean text overlay with key message. Clean modern design with icons, checkmarks, X marks for emphasis. High-CTR thumbnail optimized for Korean blog. Can include Korean text overlay.',

  // 사회 정치: 손이 나오는 실사 + 뉴스 스타일 한글 텍스트
  '사회 정치': 'Naver News Thumbnail Style: Korean person hands with official document, smartphone showing news, or pen signing paper. Split composition with real photo and text area. Government/official atmosphere, soft lighting. BOLD Korean text overlay with breaking news style. Red/blue official colors for emphasis. Broadcast news quality thumbnail. Can include Korean text overlay.',

  // 공부: 교육 인포그래픽
  '공부': 'Educational infographic: Colorful learning icons, step-by-step guide, NO PEOPLE, textbook quality graphics.',

  // ===== 🎨 기타 카테고리 =====

  // 책 영화: 영화 포스터/책 커버 스타일
  '책 영화': 'Cinematic movie poster style: Dramatic lighting, rich colors, book cover or film poster aesthetic, can include Korean person for character.',

  // 게임: 게임 아트 스타일
  '게임': 'Gaming aesthetic: Vibrant neon colors, dynamic composition, game character or scene, high energy visuals.',

  // 사진 영상: 예술적 사진
  '사진 영상': 'Artistic photography: Creative composition, dramatic lighting, visual storytelling, fine art photography quality.',

  // 예술: 미술/디자인
  '예술': 'Fine art aesthetic: Artistic composition, gallery quality, creative design, museum exhibition style.',

  // 음악: 음악 관련 비주얼
  '음악': 'Music visual: Concert stage aesthetic, musical instruments, artistic lighting, album cover style.',

  // 생활 꿀팁: 라이프핵 스타일
  '생활 꿀팁': 'Lifestyle tips photography: Clean organized visuals, before/after style, NO PEOPLE, practical life hacks aesthetic.',

  // 일반: 범용
  '일반': 'High quality professional photography: Clean composition, natural lighting, versatile blog content style.',

  // ===== 🎯 기본값 (DEFAULT) =====
  'default': 'High quality professional photography, cinematic lighting, rich colors, 8K UHD quality, clean composition. For Korean blog content. Can include Korean text overlay for thumbnail if needed.'
};

// ✅ [2026-01-29] 쇼핑커넥트 라이프스타일 전용 스타일 (인물 + 제품 사용 장면 필수!)
const SHOPPING_CONNECT_LIFESTYLE_STYLE = `Premium lifestyle photography with Korean person using/enjoying the product.
REQUIRED ELEMENTS:
- A beautiful Korean person (20-40s) naturally interacting with or using the product
- Luxury lifestyle setting (modern Korean apartment, trendy café, elegant workspace)
- Product clearly visible while being used, worn, or displayed by the person
- Natural, warm lighting (golden hour, soft window light)
- Instagram-worthy aesthetic, aspirational lifestyle imagery
- The person should look happy, satisfied, or enjoying the product

STYLE: Samsung/LG advertisement quality, K-beauty campaign aesthetic, magazine editorial
EMOTIONAL GOAL: Make viewers think "I want that life" and "I need this product"
NO TEXT NO WRITING - Pure visual storytelling only.`;




/**
 * 카테고리에 맞는 이미지 스타일 반환
 */
function getCategoryStyle(category?: string): string {
  if (!category || typeof category !== 'string') return CATEGORY_IMAGE_STYLES['default'];

  const normalizedCategory = String(category).toLowerCase().trim();
  if (CATEGORY_IMAGE_STYLES[normalizedCategory]) {
    return CATEGORY_IMAGE_STYLES[normalizedCategory];
  }
  for (const [key, style] of Object.entries(CATEGORY_IMAGE_STYLES)) {
    if (normalizedCategory.includes(key) || key.includes(normalizedCategory)) {
      return style;
    }
  }
  return CATEGORY_IMAGE_STYLES['default'];
}

// ===== 해시 유틸리티 =====

function popcountBigInt(x: bigint): number {
  let v = x;
  let count = 0;
  while (v) {
    count += Number(v & 1n);
    v >>= 1n;
  }
  return count;
}

function hammingDistance64(a: bigint, b: bigint): number {
  return popcountBigInt(a ^ b);
}

async function computeAHash64(buffer: Buffer): Promise<bigint | null> {
  try {
    const pixels = await sharp(buffer)
      .resize(8, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    if (!pixels || pixels.length < 64) return null;

    let sum = 0;
    for (let i = 0; i < 64; i++) sum += pixels[i];
    const avg = sum / 64;

    let bits = 0n;
    for (let i = 0; i < 64; i++) {
      if (pixels[i] > avg) {
        bits |= 1n << BigInt(63 - i);
      }
    }
    return bits;
  } catch {
    return null;
  }
}

// ===== API 키 관리 =====

let storedGeminiApiKey: string | null = null;

// ✅ [2026-02-03 FIX] AbortController를 세션 ID 기반으로 관리 (경쟁 조건 해결)
// 이전: 전역 변수로 동시 요청 시 덮어쓰기 문제
// 변경: Map으로 각 세션별 AbortController 관리
const abortControllerMap = new Map<string, AbortController>();
let currentSessionId: string | null = null;

export function setGeminiApiKey(apiKey: string): void {
  storedGeminiApiKey = apiKey;
  console.log(`[NanoBananaPro] Gemini API 키 설정됨: ${apiKey.substring(0, 10)}...`);
}

/**
 * ✅ [2026-02-03 FIX] 이미지 생성 중지 함수 (모든 세션 중지)
 */
export function abortImageGeneration(): void {
  if (abortControllerMap.size > 0) {
    for (const [sessionId, controller] of abortControllerMap.entries()) {
      controller.abort();
      console.log(`[NanoBananaPro] ⏹️ 세션 ${sessionId} 이미지 생성 중지됨`);
    }
    abortControllerMap.clear();
    currentSessionId = null;
    console.log('[NanoBananaPro] ⏹️ 모든 이미지 생성이 중지되었습니다.');
  }
}

/**
 * ✅ [2026-02-03] 특정 세션만 중지
 */
export function abortImageGenerationSession(sessionId: string): void {
  const controller = abortControllerMap.get(sessionId);
  if (controller) {
    controller.abort();
    abortControllerMap.delete(sessionId);
    console.log(`[NanoBananaPro] ⏹️ 세션 ${sessionId} 이미지 생성 중지됨`);
  }
}

/**
 * 나노 바나나 프로로 이미지 생성 (Gemini 기반)
 * ✅ [100점 수정] stopCheck 콜백 추가 - 루프 중 중지 여부 확인
 * ✅ [2026-02-03 FIX] 세션 기반 AbortController + global503Count
 */
export async function generateWithNanoBananaPro(
  items: ImageRequestItem[],
  postTitle?: string,
  postId?: string,
  isFullAuto: boolean = false,
  providedApiKey?: string,
  isShoppingConnect?: boolean,
  collectedImages?: string[],
  stopCheck?: () => boolean  // ✅ 중지 여부 확인 콜백
): Promise<GeneratedImage[]> {
  const mode = isFullAuto ? '풀오토' : '일반';
  const apiKey = providedApiKey || storedGeminiApiKey || process.env.GEMINI_API_KEY;

  // ✅ [2026-02-03 FIX] 세션 ID 생성 및 AbortController 등록 (경쟁 조건 해결)
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const sessionAbortController = new AbortController();
  abortControllerMap.set(sessionId, sessionAbortController);
  currentSessionId = sessionId;
  console.log(`[NanoBananaPro] 🆔 새 세션 시작: ${sessionId}`);

  // ✅ [2026-02-03 FIX] 전체 배치에서 503 에러 추적 (개별 이미지가 아닌 전체 배치 레벨)
  let global503Count = 0;
  const MAX_GLOBAL_503 = 5; // 전체 배치에서 503 에러 5회 이상 시 배치 전체 포기


  // ✅ [2026-01-24 FIX] 수집된 이미지 유사도 필터링 (스티커가 붙은 같은 이미지 중복 제거)
  let filteredCollectedImages = collectedImages || [];
  if (isShoppingConnect && collectedImages && collectedImages.length > 1) {
    try {
      const { filterSimilarImages } = await import('./imageUtils.js');
      console.log(`[NanoBananaPro] 🔍 수집된 이미지 유사도 필터링 시작 (${collectedImages.length}개)...`);
      filteredCollectedImages = await filterSimilarImages(collectedImages, 12); // threshold=12 (약간 관대하게)
      console.log(`[NanoBananaPro] ✅ 유사 이미지 필터링 완료: ${collectedImages.length}개 → ${filteredCollectedImages.length}개`);
    } catch (filterError) {
      console.warn(`[NanoBananaPro] ⚠️ 유사 이미지 필터링 실패, 원본 사용:`, (filterError as Error).message);
      filteredCollectedImages = collectedImages;
    }
  }

  console.log(`[NanoBananaPro] 🍌 총 ${items.length}개 이미지 생성 시작 (${mode} 모드)`);
  console.log(`[NanoBananaPro] Gemini API 키: ${apiKey ? apiKey.substring(0, 10) + '...' : '미설정'}`);

  const configModule = await import('../configManager.js');
  const config = await configModule.loadConfig();

  const todayKey = new Date().toISOString().split('T')[0];

  if (config.geminiImageLastReset !== todayKey) {
    config.geminiImageLastReset = todayKey;
    config.geminiImageDailyCount = 0;
    await configModule.saveConfig(config);
    console.log(`[NanoBananaPro] 📅 날짜 변경됨 → 카운트 초기화 (${todayKey})`);
  }

  let planType = config.geminiPlanType || 'paid';
  console.log(`[NanoBananaPro] 적용된 플랜 정책: ${planType.toUpperCase()}`);

  const currentCount = config.geminiImageDailyCount || 0;
  const FREE_DAILY_LIMIT = 100;
  const PAID_DAILY_LIMIT = 9999;
  const isPaid = planType === 'paid';
  const limit = isPaid ? PAID_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const estimatedBatchCost = items.length * 0.04;

  console.log(`[NanoBananaPro] 현재 플랜: ${planType.toUpperCase()}, 금일 사용량: ${currentCount}/${limit}`);
  console.log(`[NanoBananaPro] 💰 이번 작업 예상 비용: 약 $${estimatedBatchCost.toFixed(2)} (KRW 약 ${(estimatedBatchCost * 1350).toLocaleString()}원)`);

  if (currentCount >= limit) {
    throw new Error(isPaid ? '⛔ 유료 플랜 한도 초과' : '⛔ 무료 플랜 한도 초과');
  }

  if (!apiKey) {
    throw new Error('나노 바나나 프로(Gemini) API 키가 설정되지 않았습니다.');
  }

  const results: GeneratedImage[] = [];
  const usedImageHashes = new Set<string>();
  const usedImageAHashes: bigint[] = [];

  // ✅ [2026-01-21 수정] 병렬 처리 2개로 제한 (Gemini API 과부하 방지)
  const PARALLEL_LIMIT = isPaid ? 2 : 1;
  console.log(`[NanoBananaPro] ⚡ 병렬 처리 모드: ${PARALLEL_LIMIT}개 동시 생성`);

  // 병렬 처리를 위한 세마포어 (동시 실행 제한)
  let activeCount = 0;
  const queue: Array<() => Promise<void>> = [];

  const runNext = () => {
    while (activeCount < PARALLEL_LIMIT && queue.length > 0) {
      const task = queue.shift();
      if (task) {
        activeCount++;
        task().finally(() => {
          activeCount--;
          runNext();
        });
      }
    }
  };

  // 각 이미지 생성 작업을 Promise로 래핑
  const generatePromises = items.map((item, i) => {
    return new Promise<GeneratedImage | null>((resolve) => {
      const task = async () => {
        // 중지 여부 확인
        if (stopCheck && stopCheck()) {
          console.log(`[NanoBananaPro] ⏹️ 중지 요청됨 - 이미지 ${i + 1} 건너뜀`);
          resolve(null);
          return;
        }

        // ✅ [2026-01-19 수정] 쇼핑커넥트 모드에서는 AI 이미지가 썸네일이 아님 (수집된 제품 이미지가 썸네일)
        const isThumbnail = isShoppingConnect
          ? false  // 쇼핑커넥트: 썸네일은 수집된 제품 이미지 사용, AI 이미지는 모두 소제목용
          : ((item as any).isThumbnail !== undefined ? (item as any).isThumbnail : (i === 0));

        // ✅ [수정 2026-01-18] 쇼핑커넥트 썸네일은 HTML 렌더링(generateThumbnailWithTextOverlay)으로 별도 생성
        // 나노바나나프로에서는 1번 소제목 이미지에 텍스트를 강제로 넣지 않음 (텍스트 없이 생성)
        let modifiedItem = { ...item };
        // if (isShoppingConnect && isThumbnail) {
        //   (modifiedItem as any).allowText = true;
        //   console.log(`[NanoBananaPro] 🛒 [쇼핑커넥트 썸네일] 제목 텍스트 포함 강제 적용`);
        // }

        console.log(`[NanoBananaPro] 🖼️ [Parallel] "${item.heading}" 생성 시작 (${i + 1}/${items.length})...`);
        // ✅ [2026-01-28 DEBUG] allowText/isThumbnail 값 확인 로그
        console.log(`[NanoBananaPro] 📋 [DEBUG] i=${i}, isThumbnail=${isThumbnail}, allowText=${(modifiedItem as any).allowText}, itemAllowText=${(item as any).allowText}`);

        try {
          if (isShoppingConnect && filteredCollectedImages && filteredCollectedImages.length > 0) {
            console.log(`[NanoBananaPro] 🛒 [쇼핑커넥트] AI가 수집된 제품 이미지를 참조하여 이미지 생성 (${i + 1}번)`);
          }

          const result = await generateSingleImageWithGemini(
            modifiedItem,  // ✅ item 대신 modifiedItem 사용 (쇼핑커넥트 썸네일에 allowText 적용됨)
            i,
            isThumbnail,
            postTitle,
            postId,
            isFullAuto,
            apiKey,
            isShoppingConnect,
            filteredCollectedImages,
            usedImageHashes,
            usedImageAHashes,
            sessionAbortController?.signal,
            items.length  // ✅ [2026-01-18] 배치 크기 전달 (첫 번째 이미지 = 대표 이미지 구분용)
          );

          if (result) {
            console.log(`[NanoBananaPro] ✅ [Parallel] "${item.heading}" 생성 완료 (${i + 1}/${items.length})`);
            if (result.filePath) addToUsedUrls(result.filePath);
            resolve(result);
          } else {
            resolve(null);
          }
        } catch (error: any) {
          if (error.name === 'CanceledError' || error.name === 'AbortError') {
            console.log('[NanoBananaPro] ⏹️ 요청이 취소되었습니다.');
          } else {
            console.error(`[NanoBananaPro] ❌ "${item.heading}" 생성 실패:`, (error as Error).message);
          }
          resolve(null);
        }
      };

      queue.push(task);
    });
  });

  // 병렬 실행 시작
  runNext();

  // 모든 작업 완료 대기
  const allResults = await Promise.all(generatePromises);

  // ✅ [2026-01-24 FIX] 실패한 이미지 재시도 로직 강화 (100% 성공률 목표)
  const MAX_RETRY_ROUNDS = 3; // 실패한 이미지에 대해 최대 3회 추가 재시도

  // 인덱스별 결과 매핑 (null = 실패)
  const indexedResults: (GeneratedImage | null)[] = [...allResults];

  // 실패한 이미지 인덱스 수집
  let failedIndices = indexedResults
    .map((r, idx) => r === null ? idx : -1)
    .filter(idx => idx >= 0);

  console.log(`[NanoBananaPro] 📊 1차 시도 결과: ${items.length - failedIndices.length}/${items.length} 성공`);

  // 실패한 이미지가 있으면 재시도
  for (let retryRound = 1; retryRound <= MAX_RETRY_ROUNDS && failedIndices.length > 0; retryRound++) {
    console.log(`[NanoBananaPro] 🔄 [재시도 ${retryRound}/${MAX_RETRY_ROUNDS}] ${failedIndices.length}개 실패 이미지 재생성 시작...`);

    // 재시도 전 잠시 대기 (API 안정화)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 실패한 각 이미지를 순차적으로 재시도 (병렬 X, 안정성 우선)
    for (const failedIdx of failedIndices) {
      if (stopCheck && stopCheck()) break;

      const item = items[failedIdx];
      const isThumbnail = isShoppingConnect ? false : ((item as any).isThumbnail !== undefined ? (item as any).isThumbnail : (failedIdx === 0));

      console.log(`[NanoBananaPro] 🔄 [재시도] "${item.heading}" (인덱스 ${failedIdx + 1}/${items.length})...`);

      try {
        const result = await generateSingleImageWithGemini(
          item,
          failedIdx,
          isThumbnail,
          postTitle,
          postId,
          isFullAuto,
          apiKey,
          isShoppingConnect,
          filteredCollectedImages,
          usedImageHashes,
          usedImageAHashes,
          sessionAbortController?.signal,
          items.length
        );

        if (result) {
          indexedResults[failedIdx] = result;
          console.log(`[NanoBananaPro] ✅ [재시도 성공] "${item.heading}"`);
          if (result.filePath) addToUsedUrls(result.filePath);
        }
      } catch (retryError: any) {
        console.warn(`[NanoBananaPro] ⚠️ [재시도 실패] "${item.heading}": ${retryError.message}`);
      }

      // 다음 재시도 전 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 재시도 후 여전히 실패한 인덱스 업데이트
    failedIndices = indexedResults
      .map((r, idx) => r === null ? idx : -1)
      .filter(idx => idx >= 0);

    console.log(`[NanoBananaPro] 📊 [재시도 ${retryRound}] 결과: ${items.length - failedIndices.length}/${items.length} 성공`);
  }

  // 최종 결과 수집 (원래 순서 유지)
  indexedResults.forEach((result) => {
    if (result) {
      results.push(result);
    }
  });

  // 최종 성공률 로깅
  const finalSuccessRate = Math.round((results.length / items.length) * 100);
  console.log(`[NanoBananaPro] 🎯 최종 성공률: ${finalSuccessRate}% (${results.length}/${items.length})`);

  if (results.length > 0) {
    config.geminiImageDailyCount = (config.geminiImageDailyCount || 0) + results.length;
    await configModule.saveConfig(config);
    console.log(`[NanoBananaPro] 📈 쿼터 사용: +${results.length} (누적: ${config.geminiImageDailyCount})`);
  }

  // ✅ [표 이미지 통합] 쇼핑커넥트 모드에서 스펙 표 & 장단점 표 생성
  if (isShoppingConnect && postTitle) {
    console.log(`[NanoBananaPro] 📊 [표 이미지] 쇼핑커넥트 모드: 표 이미지 생성 시작...`);

    try {
      const { extractSpecsWithGemini, extractProsConsWithGemini, canGenerateSpecTable, canGenerateProsConsTable } = await import('./geminiTableExtractor.js');
      const { generateProductSpecTableImage, generateProsConsTableImage } = await import('./tableImageGenerator.js');

      // 본문 내용 수집 (items에서 body 필드 추출)
      const bodyContent = items.map(item => `${item.heading}\n${(item as any).body || ''}`).join('\n\n');

      // 1. 스펙 추출 및 스펙 표 이미지 생성
      console.log(`[NanoBananaPro] 📊 [표 이미지] 스펙 추출 중...`);
      const specs = await extractSpecsWithGemini(postTitle, null, bodyContent, apiKey);

      if (canGenerateSpecTable(specs)) {
        console.log(`[NanoBananaPro] ✅ [표 이미지] 스펙 ${specs.length}개 추출 성공, 표 이미지 생성 중...`);
        const specTablePath = await generateProductSpecTableImage(postTitle, specs);

        // 30% 지점 계산 (예: 8개 섹션이면 2~3번째)
        const specPosition = Math.floor(items.length * 0.3);
        const specHeading = items[specPosition]?.heading || '제품 스펙';

        results.push({
          heading: `[스펙표] ${specHeading}`,
          filePath: specTablePath,
          provider: 'nano-banana-pro',
          previewDataUrl: '',
          savedToLocal: specTablePath,
          tableType: 'spec', // 표 이미지 타입 표시
          targetPosition: specPosition // 배치할 위치
        } as any);

        console.log(`[NanoBananaPro] ✅ [표 이미지] 스펙 표 생성 완료: ${specTablePath}`);
      } else {
        console.log(`[NanoBananaPro] ℹ️ [표 이미지] 스펙 부족 (${specs.length}개), 표 생성 건너뜀 (Silent Skip)`);
      }

      // 2. 장단점 추출 및 장단점 표 이미지 생성
      console.log(`[NanoBananaPro] 📊 [표 이미지] 장단점 추출 중...`);
      const prosConsData = await extractProsConsWithGemini(postTitle, bodyContent, apiKey);

      if (canGenerateProsConsTable(prosConsData)) {
        console.log(`[NanoBananaPro] ✅ [표 이미지] 장점 ${prosConsData.pros.length}개, 단점 ${prosConsData.cons.length}개 추출 성공, 표 이미지 생성 중...`);
        const prosConsTablePath = await generateProsConsTableImage(postTitle, prosConsData.pros, prosConsData.cons);

        // 80% 지점 계산 (예: 8개 섹션이면 6~7번째)
        const prosConsPosition = Math.floor(items.length * 0.8);
        const prosConsHeading = items[prosConsPosition]?.heading || '장단점 요약';

        results.push({
          heading: `[장단점표] ${prosConsHeading}`,
          filePath: prosConsTablePath,
          provider: 'nano-banana-pro',
          previewDataUrl: '',
          savedToLocal: prosConsTablePath,
          tableType: 'proscons', // 표 이미지 타입 표시
          targetPosition: prosConsPosition // 배치할 위치
        } as any);

        console.log(`[NanoBananaPro] ✅ [표 이미지] 장단점 표 생성 완료: ${prosConsTablePath}`);
      } else {
        console.log(`[NanoBananaPro] ℹ️ [표 이미지] 장단점 부족, 표 생성 건너뜀 (Silent Skip)`);
      }

    } catch (tableError: any) {
      // ✅ Silent Skip: 표 이미지 실패해도 발행 계속 진행
      console.warn(`[NanoBananaPro] ⚠️ [표 이미지] 생성 실패 (Silent Skip): ${tableError.message}`);
    }
  }

  // ✅ [2026-02-03 FIX] 세션 정리 (AbortController 제거)
  abortControllerMap.delete(sessionId);
  if (currentSessionId === sessionId) {
    currentSessionId = null;
  }
  console.log(`[NanoBananaPro] 🏁 세션 종료: ${sessionId} (최종 성공 ${results.length}/${items.length}개)`);

  return results;
}

/**
 * Gemini를 사용한 단일 이미지 생성 (PromptBuilder 사용으로 리팩토링됨)
 * ✅ [100점 수정] AbortSignal 파라미터 추가
 * ✅ [2026-01-18] batchSize 파라미터 추가 (배치 처리 시 첫 번째 이미지 구분용)
 */
async function generateSingleImageWithGemini(
  item: ImageRequestItem,
  index: number,
  isThumbnail: boolean,
  postTitle?: string,
  postId?: string,
  isFullAuto?: boolean,
  apiKey?: string,
  isShoppingConnect?: boolean,
  collectedImages?: string[],
  usedImageHashes?: Set<string>,
  usedImageAHashes?: bigint[],
  signal?: AbortSignal,  // ✅ [100점 수정] 중지 신호
  batchSize?: number     // ✅ [2026-01-18] 배치 크기 (배치 처리 시 첫 번째 이미지 구분용)
): Promise<GeneratedImage | null> {

  // 썸네일 크롭 헬퍼
  const cropThumbnail = async (buf: Buffer, ext: string): Promise<Buffer> => {
    try {
      const sharpModule = await import('sharp');
      const sharpFn = (sharpModule as any).default || (sharpModule as any);
      const s = sharpFn(buf).resize(1200, 630, { fit: 'inside' });
      if (ext === 'jpg' || ext === 'jpeg') return await s.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      if (ext === 'webp') return await s.webp({ quality: 88 }).toBuffer();
      return await s.png({ quality: 90, compressionLevel: 9 }).toBuffer();
    } catch {
      return buf;
    }
  };

  // ✅ [2026-02-03 FIX] 재시도 횟수 감소 (8→4회) - 30분+ hang 방지
  const maxRetries = 4;

  // ✅ [2026-01-27 FIX] config를 for 루프 앞에서 미리 로드 (imageStyle/imageRatio 사용 위해)
  const configModulePre = await import('../configManager.js');
  const configPre = await configModulePre.loadConfig();

  // ✅ [2026-01-30] 503 에러 연속 발생 추적 (더 긴 대기 시간 적용)
  let consecutive503Count = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // ✅ [2026-01-27] 이미지 스타일 및 비율 설정 읽기 (config.json에서 - localStorage는 메인 프로세스에서 접근 불가)
      const imageStyle = (item as any).imageStyle || (configPre as any).imageStyle || 'realistic';
      const imageRatio = (item as any).imageRatio || (configPre as any).imageRatio || '1:1';

      console.log(`[NanoBananaPro] 🎨 이미지 스타일: ${imageStyle}, 비율: ${imageRatio}`);

      // ✅ [2026-02-08] 11가지 스타일별 프롬프트 매핑 (3카테고리)
      const stylePromptMap: Record<string, string> = {
        // 📷 실사
        'realistic': 'Hyper-realistic professional photography, 8K UHD quality, DSLR camera, natural lighting, authentic Korean person, Fujifilm XT3 quality',
        'bokeh': 'Beautiful bokeh photography, shallow depth of field, dreamy out-of-focus background lights, soft circular bokeh orbs, DSLR wide aperture f/1.4 quality, romantic atmosphere, fairy light aesthetic',
        // 🖌️ 아트
        'vintage': 'Vintage retro illustration, 1950s poster art style, muted color palette, nostalgic aesthetic, old-fashioned charm, classic design elements, aged paper texture',
        'minimalist': 'Minimalist flat design, simple clean lines, solid colors, modern aesthetic, geometric shapes, professional infographic style, san-serif typography',
        '3d-render': '3D render, Octane render quality, Cinema 4D style, Blender 3D art, realistic materials and textures, studio lighting setup, high-end 3D visualization',
        'korean-folk': 'Korean traditional Minhwa folk painting style (한국 민화), vibrant primary colors on hanji paper, stylized tiger and magpie motifs, peony flowers, lotus blossoms, pine trees, traditional Korean decorative patterns, bold flat color areas with fine ink outlines, cheerful folk art aesthetic, naive but charming composition',
        // ✨ 이색
        'stickman': 'Simple stick figure drawing style (졸라맨), black line art on white background, crude hand-drawn stick people with basic shapes, childlike doodle aesthetic, humorous comic strip, thick marker lines, NO shading NO gradient, pure minimal stick figure illustration',
        'claymation': 'Claymation stop-motion style, cute clay figurines, handmade plasticine texture, soft rounded shapes, miniature diorama set, warm studio lighting, Aardman Animations quality, Wallace and Gromit aesthetic',
        'neon-glow': 'Neon glow effect, luminous light trails, dark background with vibrant neon lights, synthwave aesthetic, glowing outlines, electric blue and hot pink, LED sign style, night atmosphere',
        'papercut': 'Paper cut art style, layered paper craft, 3D paper sculpture effect, shadow between layers, handmade tactile texture, colorful construction paper, kirigami aesthetic, depth through layering',
        'isometric': 'Isometric 3D illustration, cute isometric pixel world, 30-degree angle view, clean geometric shapes, pastel color palette, miniature city/scene, game-like perspective, detailed tiny world'
      };

      const stylePrompt = stylePromptMap[imageStyle] || stylePromptMap['realistic'];

      // ✅ [2026-01-29] 쇼핑커넥트 모드일 때 라이프스타일 스타일 강제 적용 (인물 + 제품 사용 장면)
      let categoryStyleToUse: string;
      if (isShoppingConnect && collectedImages && collectedImages.length > 0) {
        // 쇼핑커넥트: 라이프스타일 이미지 전용 스타일 (사람이 제품 사용하는 장면)
        categoryStyleToUse = SHOPPING_CONNECT_LIFESTYLE_STYLE;
        console.log(`[NanoBananaPro] 🛒 쇼핑커넥트 라이프스타일 스타일 적용 (인물 + 제품 사용 장면)`);
      } else if (imageStyle === 'realistic') {
        categoryStyleToUse = getCategoryStyle(item.category);
      } else {
        categoryStyleToUse = stylePrompt;
      }

      // 🔥 [핵심] PromptBuilder를 사용하여 프롬프트 생성 (코드가 매우 짧아짐)
      // ✅ [2026-01-30 100점] provider: 'nano-banana-pro' → Gemini가 한글 텍스트 직접 생성
      let prompt = PromptBuilder.build(item, {
        isThumbnail,
        postTitle,
        categoryStyle: categoryStyleToUse, // ✅ 쇼핑커넥트는 라이프스타일 스타일 적용
        isShoppingConnect,
        hasCollectedImages: !!(collectedImages && collectedImages.length > 0), // ✅ 추가: collectedImages 참조 모드
        provider: 'nano-banana-pro' // ✅ [2026-01-30] 나노바나나프로는 한글 지원 → AI 직접 텍스트 생성
      });

      // ✅ [2026-01-26] 실사 외 스타일인 경우 스타일 프롬프트 추가 강화
      if (imageStyle !== 'realistic' && !isShoppingConnect) {
        prompt = `[ART STYLE: ${imageStyle.toUpperCase()}]\n${stylePrompt}\n\n${prompt}\n\nIMPORTANT: Generate the image in ${imageStyle} style. DO NOT generate photorealistic images.`;
        console.log(`[NanoBananaPro] 🎨 스타일 프롬프트 적용: ${imageStyle}`);
      }


      // ✅ [2026-01-23 FIX] 재시도 시 프롬프트 변형 강화 (이미지 다양성 확보)
      if (attempt > 1) {
        const variationStyles = [
          'Use a COMPLETELY DIFFERENT color palette.',
          'Change the camera angle to a unique perspective.',
          'Use a different artistic style (e.g., watercolor, flat design, 3D render).',
          'Add more visual elements and details.',
          'Simplify the composition with fewer elements.',
          'Use warm colors if previous was cool, or vice versa.',
        ];
        const randomVariation = variationStyles[Math.floor(Math.random() * variationStyles.length)];
        prompt += `\n\n[VARIATION REQUEST ${attempt}/${maxRetries}]\n- Create a COMPLETELY DIFFERENT image.\n- ${randomVariation}\n- Do NOT repeat previous compositions.`;
        console.log(`[NanoBananaPro] 🎨 변형 요청: ${randomVariation}`);
      }

      console.log(`[NanoBananaPro] 📡 Gemini 시도 ${attempt}/${maxRetries}: ${item.heading}`);

      // ===== Axios 호출 준비 =====
      const axios = (await import('axios')).default;

      const normalizeLocalPath = (raw: string): string => {
        const v = String(raw || '').trim();
        if (!v) return '';
        return v.replace(/^file:\/\//i, '').replace(/^\/+/, '');
      };

      const inferMimeType = (p: string): string => {
        const s = String(p || '').toLowerCase();
        if (s.endsWith('.jpg') || s.endsWith('.jpeg')) return 'image/jpeg';
        if (s.endsWith('.webp')) return 'image/webp';
        return 'image/png';
      };

      // ===== 레퍼런스 이미지 처리 =====
      const parts: Array<any> = [];
      let referenceImageLoaded = false;
      try {
        const rawRefPath = String((item as any).referenceImagePath || '').trim();
        const rawRefUrl = String((item as any).referenceImageUrl || '').trim();

        // ✅ [2026-01-21 FIX] referenceImagePath가 URL인지 먼저 확인
        // URL이면 urlRef로 처리, 아니면 localRef로 처리
        const isRefPathUrl = /^https?:\/\//i.test(rawRefPath);

        const localRef = isRefPathUrl ? '' : normalizeLocalPath(rawRefPath);
        const urlRef = isRefPathUrl ? rawRefPath : (rawRefUrl && /^https?:\/\//i.test(rawRefUrl) ? rawRefUrl : '');

        if (localRef) {
          const buf = await fs.readFile(localRef);
          if (buf && buf.length > 0) {
            parts.push({
              inlineData: {
                data: buf.toString('base64'),
                mimeType: inferMimeType(localRef),
              },
            });
            referenceImageLoaded = true;
            console.log(`[NanoBananaPro] ✅ 로컬 참조 이미지 로드: ${localRef}`);
          }
        } else if (urlRef) {
          const fetched = await axios.get(urlRef, { responseType: 'arraybuffer', timeout: 25000 });
          const buf = Buffer.from(fetched.data);
          if (buf && buf.length > 0) {
            parts.push({
              inlineData: {
                data: buf.toString('base64'),
                mimeType: String(fetched.headers?.['content-type'] || inferMimeType(urlRef) || 'image/png'),
              },
            });
            referenceImageLoaded = true;
            console.log(`[NanoBananaPro] ✅ URL 참조 이미지 로드: ${urlRef}`);
          }
        }

        // ✅ [핵심 수정 2026-01-19] 참조 이미지가 없으면 collectedImages에서 첫 번째 이미지(1번 제품 이미지) 사용
        // 모든 AI 생성 이미지가 동일한 제품 이미지를 참조하여 일관성 유지
        // ✅ [버그 수정] collectedImages는 객체 배열 { url, thumbnailUrl, ... } 또는 문자열 배열일 수 있음
        if (!referenceImageLoaded && collectedImages && collectedImages.length > 0) {
          const firstImage = collectedImages[0];
          // 객체({ url: "...", thumbnailUrl: "..." })인지 문자열인지 판별
          const candidateUrl = typeof firstImage === 'string'
            ? firstImage
            : ((firstImage as any)?.url || (firstImage as any)?.thumbnailUrl || '');

          if (candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
            try {
              console.log(`[NanoBananaPro] 🔄 1번 제품 이미지를 참조하여 AI 생성: ${candidateUrl.substring(0, 80)}...`);
              const fetched = await axios.get(candidateUrl, { responseType: 'arraybuffer', timeout: 25000 });
              const buf = Buffer.from(fetched.data);
              if (buf && buf.length > 0) {
                parts.push({
                  inlineData: {
                    data: buf.toString('base64'),
                    mimeType: String(fetched.headers?.['content-type'] || 'image/png'),
                  },
                });
                referenceImageLoaded = true;
                console.log(`[NanoBananaPro] ✅ collectedImages 참조 이미지 로드 성공 (${Math.round(buf.length / 1024)}KB)`);
              }
            } catch (collectedErr: any) {
              console.warn(`[NanoBananaPro] ⚠️ collectedImages 참조 이미지 로드 실패: ${collectedErr.message}`);
            }
          } else {
            console.warn(`[NanoBananaPro] ⚠️ collectedImages[0]에서 유효한 URL을 찾을 수 없음: ${JSON.stringify(firstImage).substring(0, 100)}`);
          }
        }
      } catch (err: any) {
        console.warn(`[NanoBananaPro] ⚠️ 참조 이미지 로드 실패: ${err.message}`);
      }

      parts.push({ text: prompt });

      // ===== 이미지 품질 티어 시스템: 모델 동적 선택 =====
      const configModule = await import('../configManager.js');
      const config = await configModule.loadConfig();

      // ✅ [2026-01-16] 환경설정에서 Nano Banana Pro 모델 설정 읽어오기
      // nanoBananaMainModel: 대표/썸네일 이미지 (통합)
      // nanoBananaSubModel: 본문 서브 이미지
      const userMainModel = (config as any).nanoBananaMainModel || 'gemini-3-pro';
      const userSubModel = (config as any).nanoBananaSubModel || 'gemini-3-pro';  // ✅ [2026-01-21] 기본값 1K로 변경

      // ✅ [2026-01-18] 디버그 로그: 어떤 모델이 설정에서 로드되었는지 확인
      console.log(`[NanoBananaPro] 📋 환경설정 모델: Main="${(config as any).nanoBananaMainModel || '(미설정→gemini-3-pro)'}", Sub="${(config as any).nanoBananaSubModel || '(미설정→gemini-3-pro)'}"`);  // ✅ 변경
      console.log(`[NanoBananaPro] 📋 적용 모델: Main="${userMainModel}", Sub="${userSubModel}"`);

      // 모델 매핑 (설정값 → API 모델명)
      // ✅ [2026-01-30] Gemini 3 모델만 사용 (사용자 요청)
      // - gemini-3-pro-image-preview: 4K/2K/1K 해상도 지원, 복잡한 지시 처리, Thinking 프로세스
      const MODEL_MAP: Record<string, { model: string; resolution: string }> = {
        'gemini-3-pro-4k': { model: 'gemini-3-pro-image-preview', resolution: '4K' },
        'gemini-3-pro': { model: 'gemini-3-pro-image-preview', resolution: '1K' },
        'gemini-2.5-flash': { model: 'gemini-3-pro-image-preview', resolution: '1K' },  // Gemini 3으로 통일
      };

      // 이미지 유형에 따라 모델 결정 (썸네일과 대표 이미지 통합)
      let selectedModel: string;
      let selectedResolution: string = '1K';
      // ✅ [2026-01-18 FIX v2] 모델 결정 로직 완성
      // - isThumbnail: 명시적 썸네일 플래그 (텍스트 포함)
      // - index === 0 && batchSize > 1: 배치 요청의 첫 번째 이미지 (대표 이미지)
      // - 한 장씩 요청(batchSize === 1 또는 undefined)이면서 isThumbnail이 false면 Sub 모델
      const effectiveBatchSize = batchSize ?? 1;
      const isFirstInBatch = index === 0 && effectiveBatchSize > 1;
      const isMainOrThumbnail = isThumbnail === true || isFirstInBatch;

      if (isMainOrThumbnail) {
        // 대표/썸네일 이미지: nanoBananaMainModel 사용 (통합)
        const configForMain = MODEL_MAP[userMainModel] || { model: 'gemini-3-pro-image-preview', resolution: '1K' };
        selectedModel = configForMain.model;
        selectedResolution = configForMain.resolution;
        const imageType = isThumbnail ? '썸네일' : '대표';
        console.log(`[NanoBananaPro] 🖼️ ${imageType} 이미지: ${userMainModel} (${selectedModel}, ${selectedResolution})`);
      } else {
        // 본문 서브 이미지: nanoBananaSubModel 사용
        const configForSub = MODEL_MAP[userSubModel] || { model: 'gemini-3-pro-image-preview', resolution: '1K' };
        selectedModel = configForSub.model;
        selectedResolution = configForSub.resolution;
        console.log(`[NanoBananaPro] 📷 서브 이미지: ${userSubModel} (${selectedModel}, ${selectedResolution})`);
      }



      // ===== Gemini API 호출 =====
      // ✅ [100점 수정] imageConfig로 해상도 설정 (4K/2K/1K)
      // ✅ [2026-01-26] 사용자 선택 비율 적용
      const imageConfigOptions: any = {
        imageSize: selectedResolution  // ✅ 4K, 2K, 1K 해상도 지원
      };

      // 쇼핑커넥트 모드에서는 1:1 비율 강제
      if (isShoppingConnect) {
        imageConfigOptions.aspectRatio = '1:1';
        console.log(`[NanoBananaPro] 🛒 쇼핑커넥트 모드: 1:1 비율 적용`);
      } else {
        // ✅ [2026-01-26] 사용자 선택 비율 적용 (1:1, 16:9, 9:16, 4:3, 3:4)
        imageConfigOptions.aspectRatio = imageRatio;
        console.log(`[NanoBananaPro] 📐 사용자 선택 비율 적용: ${imageRatio}`);
      }


      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
        {
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['Text', 'Image'],
            imageConfig: imageConfigOptions
          }
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: selectedResolution === '4K' ? 180000 : 120000,  // ✅ [2026-01-21] 타임아웃 연장 (4K:180초, 1K:120초)
          signal: signal  // ✅ [100점 수정] AbortSignal로 요청 취소 지원
        }
      );

      // ===== 응답 처리 =====
      const candidates = response.data?.candidates;

      // ✅ [2026-01-23 FIX] API 응답 상세 로깅 (디버깅용)
      const hasValidCandidate = candidates && candidates[0]?.content?.parts;
      if (!hasValidCandidate) {
        console.error(`[NanoBananaPro] ❌ API 응답 구조 이상:`, {
          hasCandidates: !!candidates,
          candidatesLength: candidates?.length || 0,
          hasContent: !!candidates?.[0]?.content,
          hasParts: !!candidates?.[0]?.content?.parts,
          finishReason: candidates?.[0]?.finishReason,
          blockReason: response.data?.promptFeedback?.blockReason
        });
      }

      if (candidates && candidates[0]?.content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            const imageData = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || 'image/png';
            const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';

            let buffer: Buffer = Buffer.from(imageData, 'base64');

            // 크기 검증 - 경고만 출력하고 허용
            if (buffer.length < 1000) {
              console.warn(`[NanoBananaPro] ⚠️ 이미지 크기가 작음 (${buffer.length} bytes) - 허용하고 진행`);
            }

            // 썸네일 크롭
            if (isThumbnail) buffer = await cropThumbnail(buffer, extension);

            // ===== 중복/유사 이미지 검사 =====
            // ✅ [2026-01-23 FIX] 중복/유사 이미지 감지 시 에러가 아닌 경고로 변경
            // 이전: throw new Error → 재시도해도 Gemini가 비슷한 이미지 생성 시 무한 실패
            // 변경: 경고 출력 후 허용 (사용자에게 이미지를 제공하는 것이 실패보다 나음)
            let isDuplicate = false;
            let isSimilar = false;

            if (usedImageHashes) {
              const hash = createHash('sha256').update(buffer).digest('hex');
              if (usedImageHashes.has(hash)) {
                isDuplicate = true;
                console.warn(`[NanoBananaPro] ⚠️ 중복 이미지 감지됨 (허용하고 진행) - ${item.heading}`);
              } else {
                usedImageHashes.add(hash);
              }
            }

            if (usedImageAHashes && !isDuplicate) {
              const aHash = await computeAHash64(buffer);
              if (aHash !== null) {
                const foundSimilar = usedImageAHashes.some((prev) => hammingDistance64(prev, aHash) <= 6);
                if (foundSimilar) {
                  isSimilar = true;
                  console.warn(`[NanoBananaPro] ⚠️ 유사 이미지 감지됨 (허용하고 진행) - ${item.heading}`);
                } else {
                  usedImageAHashes.push(aHash);
                }
              }
            }

            // ✅ 중복/유사여도 이미지 반환 (실패보다 나음)
            if (isDuplicate || isSimilar) {
              console.log(`[NanoBananaPro] ℹ️ 중복/유사 이미지지만 발행에 사용됩니다.`);
            }

            // ===== 파일 저장 =====
            const savedResult = await writeImageFile(buffer, extension, item.heading, postTitle, postId);
            console.log(`[NanoBananaPro] ✅ 생성 성공 (${Math.round(buffer.length / 1024)}KB)`);

            return {
              heading: item.heading,
              filePath: savedResult.savedToLocal || savedResult.filePath,
              provider: 'nano-banana-pro',
              previewDataUrl: savedResult.previewDataUrl,
              savedToLocal: savedResult.savedToLocal,
              originalIndex: (item as any).originalIndex, // ✅ [2026-01-24] 원래 인덱스 보존
            };
          }
        }

        // ✅ [2026-01-23 FIX] parts는 있지만 이미지가 없는 경우 로깅
        console.warn(`[NanoBananaPro] ⚠️ 응답에 parts 있지만 이미지 없음. Parts 타입:`,
          candidates[0].content.parts.map((p: any) => p.text ? 'text' : p.inlineData ? 'inlineData' : 'unknown')
        );
      }
      throw new Error('Gemini 응답에서 이미지를 찾을 수 없습니다');

    } catch (error: any) {
      const errorMessage = error?.message || '알 수 없는 오류';
      const statusCode = error?.response?.status || (errorMessage.match(/(\d{3})/)?.[1]);

      // ✅ [2026-01-24 FIX] 에러 코드별 사용자 친화적 메시지
      const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('429') || statusCode === 429;
      const isServerError = statusCode === 500 || statusCode === 503 || errorMessage.includes('500') || errorMessage.includes('503');
      const isAuthError = statusCode === 401 || statusCode === 403 || errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('API key');
      const isTimeoutError = errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNRESET');

      // 최대 재시도 도달 시 사용자 친화적 에러 throw
      if (attempt === maxRetries) {
        if (isQuotaError) {
          throw new Error('⚠️ [할당량 초과] Gemini API 일일 한도에 도달했습니다.\n' +
            '→ 해결방법: Google AI Studio에서 유료 등급(Pay-as-you-go)으로 업그레이드하세요.\n' +
            '→ 또는 내일 자정(UTC) 이후 다시 시도하세요.');
        }
        if (isServerError) {
          throw new Error('⚠️ [서버 오류] Gemini API 서버가 일시적으로 불안정합니다.\n' +
            '→ 해결방법: 잠시 후(5-10분) 다시 시도하세요.\n' +
            '→ Google AI 서비스 상태 확인: https://status.cloud.google.com');
        }
        if (isAuthError) {
          throw new Error('⚠️ [인증 오류] Gemini API 키가 올바르지 않습니다.\n' +
            '→ 해결방법: 환경설정에서 API 키를 다시 확인하세요.\n' +
            '→ API 키 발급: https://aistudio.google.com/apikey');
        }
        if (isTimeoutError) {
          throw new Error('⚠️ [연결 시간 초과] 네트워크 연결이 불안정합니다.\n' +
            '→ 해결방법: 인터넷 연결 상태를 확인하세요.\n' +
            '→ 회사/학교 네트워크는 API 접속이 차단될 수 있습니다.');
        }
        throw new Error(`⚠️ [이미지 생성 실패] ${errorMessage}\n` +
          '→ 개발자 도구(F12) 콘솔 로그를 확인하세요.');
      }

      // ✅ [2026-01-24 FIX] 재시도 대기 시간 강화 - 429 에러 시 더 긴 대기
      let waitTime = 3000 * attempt;
      if (isQuotaError) {
        // 429 에러: 15초 + 랜덤 0-10초 (총 15-25초 대기)
        waitTime = 15000 + (Math.random() * 10000);
        consecutive503Count = 0;  // 다른 에러는 503 카운트 리셋
        console.log(`[NanoBananaPro] ⚠️ 할당량 오류(429) 감지 - 더 긴 대기 시간 적용`);
      } else if (isServerError) {
        // ✅ [2026-02-03 FIX] 503 에러 시 빠른 포기 - 30분+ hang 방지
        consecutive503Count++;
        console.log(`[NanoBananaPro] ⚠️ 서버 오류(${statusCode}) 감지 - 연속 ${consecutive503Count}회`);

        // ✅ [2026-02-03] 503 에러 연속 3회 시 즉시 포기 (Gemini 서버 장애로 판단)
        if (consecutive503Count >= 3) {
          console.error(`[NanoBananaPro] ❌ 503 에러 ${consecutive503Count}회 연속 → Gemini 서버 장애로 판단, 이미지 생성 포기`);
          throw new Error(`⚠️ [Gemini 서버 장애] 503 에러가 ${consecutive503Count}회 연속 발생했습니다.\n→ Gemini 서버가 현재 과부하 상태입니다.\n→ 몇 분 후 다시 시도해주세요.`);
        }

        // 연속 503 에러가 많을수록 더 오래 대기 (최대 30초로 단축)
        const baseWait = 10000;
        const additionalWait = Math.min(consecutive503Count * 5000, 20000);
        waitTime = baseWait + additionalWait + (Math.random() * 5000);
        console.log(`[NanoBananaPro] ⏳ 503 에러 ${consecutive503Count}회 연속 → ${Math.round(waitTime / 1000)}초 대기`);
      } else {
        consecutive503Count = 0;  // 다른 에러는 503 카운트 리셋
      }

      console.log(`[NanoBananaPro] ⏳ 에러 발생, ${Math.round(waitTime / 1000)}초 후 재시도... (${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error(`⚠️ [이미지 생성 실패] 최대 재시도 횟수(${maxRetries}회)를 초과했습니다.`);
}

/**
 * 사용된 URL 목록 초기화
 */
export function clearUsedUrls(): void {
  usedImageUrls.clear();
  console.log('[NanoBananaPro] 🔄 사용된 URL 목록 초기화됨');
}

/**
 * ✅ [2026-01-18] 장단점 표 AI 이미지 생성
 * 나노바나나프로(Gemini)로 시각적인 장단점 비교 인포그래픽 생성
 */
export async function generateProsConsWithAI(
  productName: string,
  pros: string[],
  cons: string[],
  productImagePath?: string,
  apiKey?: string
): Promise<string | null> {
  const key = apiKey || storedGeminiApiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn('[NanoBananaPro] ⚠️ API 키 없음 - AI 표 생성 불가');
    return null;
  }

  console.log(`[NanoBananaPro] 📊 AI 장단점 표 생성 시작: ${productName}`);

  const prompt = `Create a clean, professional PROS & CONS comparison infographic image.

PRODUCT: "${productName}"

PROS (장점):
${pros.map((p, i) => `${i + 1}. ✅ ${p}`).join('\n')}

CONS (단점):
${cons.map((c, i) => `${i + 1}. ❌ ${c}`).join('\n')}

DESIGN REQUIREMENTS:
- Clean white/light gray background
- Two-column layout: LEFT = PROS (green), RIGHT = CONS (red/orange)
- Use check marks (✓) for pros, X marks (✗) for cons
- Large, readable Korean text
- Professional infographic style (like Samsung/LG product comparison)
- Modern, minimalist design
- Include subtle icons next to each point
- Header: "${productName} 장단점 비교"

SIZE: 1200x800 pixels (landscape)
STYLE: Corporate infographic, magazine quality
TEXT: Must be in Korean, clearly readable

ABSOLUTE REQUIREMENTS:
- NO product photos, ONLY text and icons
- Clean, professional, easy to read
- High contrast for mobile viewing`;

  try {
    const axios = (await import('axios')).default;
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${key}`,  // ✅ [2026-01-21] 변경됨
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['Text', 'Image'],
          imageConfig: { imageSize: '1K' }
        }
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );

    const candidates = response.data?.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData?.data) {
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          const { writeImageFile } = await import('./imageUtils.js');
          const result = await writeImageFile(buffer, 'png', `${productName}_장단점`);
          console.log(`[NanoBananaPro] ✅ AI 장단점 표 생성 완료: ${result.savedToLocal}`);
          return result.savedToLocal || result.filePath;
        }
      }
    }
    console.warn('[NanoBananaPro] ⚠️ AI 장단점 표 응답에서 이미지 없음');
    return null;
  } catch (error: any) {
    console.error(`[NanoBananaPro] ❌ AI 장단점 표 생성 실패: ${error.message}`);
    return null;
  }
}

/**
 * ✅ [2026-01-18] CTA 배너 AI 이미지 생성
 * 나노바나나프로(Gemini)로 클릭 유도 배너 이미지 생성
 */
export async function generateCtaBannerWithAI(
  productName: string,
  ctaText: string,
  productImagePath?: string,
  apiKey?: string
): Promise<string | null> {
  const key = apiKey || storedGeminiApiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn('[NanoBananaPro] ⚠️ API 키 없음 - AI 배너 생성 불가');
    return null;
  }

  console.log(`[NanoBananaPro] 🖼️ AI CTA 배너 생성 시작: ${productName}`);

  const prompt = `Create a high-converting CTA (Call-to-Action) banner image for e-commerce.

PRODUCT: "${productName}"
CTA TEXT: "${ctaText}"

DESIGN REQUIREMENTS:
- Eye-catching gradient background (deep blue to purple, or vibrant green to teal)
- Large, bold CTA button in the center
- Button text: "${ctaText}" (in Korean)
- Premium, luxury feel
- Subtle product silhouette or abstract shape in background
- Modern Korean shopping mall style (like Coupang, 11st, SSG)

BUTTON STYLE:
- Large rounded rectangle
- Gradient fill (orange-to-red OR green-to-teal)
- White or light text
- Subtle shadow for depth
- Arrow icon (→) next to text

SIZE: 1200x400 pixels (wide banner, 3:1 ratio)
STYLE: Premium e-commerce, high-end shopping

ABSOLUTE REQUIREMENTS:
- The CTA button must be PROMINENTLY visible
- Text must be LARGE and READABLE
- Evokes urgency and desire to click
- NO product photos, ONLY abstract/gradient design with text`;

  try {
    const axios = (await import('axios')).default;
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${key}`,  // ✅ [2026-01-21] 변경됨
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['Text', 'Image'],
          imageConfig: { imageSize: '1K' }
        }
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );

    const candidates = response.data?.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData?.data) {
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          const { writeImageFile } = await import('./imageUtils.js');
          const result = await writeImageFile(buffer, 'png', `${productName}_CTA배너`);
          console.log(`[NanoBananaPro] ✅ AI CTA 배너 생성 완료: ${result.savedToLocal}`);
          return result.savedToLocal || result.filePath;
        }
      }
    }
    console.warn('[NanoBananaPro] ⚠️ AI CTA 배너 응답에서 이미지 없음');
    return null;
  } catch (error: any) {
    console.error(`[NanoBananaPro] ❌ AI CTA 배너 생성 실패: ${error.message}`);
    return null;
  }
}
