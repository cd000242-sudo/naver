// ============================================
// costAndAutoGen.ts — renderer.ts에서 추출한 비용 안전 + 자동 이미지 생성
// Phase 5B-6: ensureExternalApiCostConsent, reserveExternalApiImageQuota,
//             generateImagesWithCostSafety, autoSearchAndPopulateImages,
//             runUiActionLockedCompat, ensurePromptCardRemoveHandler
// ============================================

import { rememberPlan, recallPlan } from '../utils/geminiPlanMemo.js';

// 전역 스코프 의존성
declare let generatedImages: any[];
declare let currentStructuredContent: any;
declare let currentPostId: string | null;
declare function appendLog(message: string, logOutputId?: string): void;
declare function runUiActionLocked(...args: any[]): any;
declare function isCostRiskImageProvider(provider: string): boolean;
declare function getCostRiskProviderLabel(provider: string): string;
declare function getTodayKey(): string;
declare function getGlobalImageSettings(): any;
declare function escapeHtml(str: string): string;
declare function hydrateImageManagerFromImages(structuredContent: any, images: any[]): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function pushImageHistorySnapshot(reason: string): void;
declare function saveGeneratedPost(structuredContent: any, isUpdate?: boolean, overrides?: any): string | null;
declare function updatePostImages(postId: string, images: any[]): void;
declare function refreshGeneratedPostsList(): void;
declare const ImageManager: any;
declare const toastManager: any;
declare const UnifiedDOMCache: any;
declare let progressModal: any;
declare function shouldRunAutoImageSearch(...args: any[]): boolean;
declare function runAutoImageSearch(...args: any[]): Promise<void>;
declare function isShoppingConnectModeActive(): boolean;
declare function getSafeHeadingTitle(heading: any): string;
declare function getHeadingSelectedImageKey(...args: any[]): string;
declare function getStableImageKey(heading: any): string;
declare function toFileUrlMaybe(p: string): string;

type ImageFallbackPolicy = 'engine-only' | 'ask' | 'guarantee';

const FALLBACK_CONFIRM_MARKER = 'FALLBACK_REQUIRES_CONFIRMATION';
const IMAGE_FALLBACK_POLICIES: ImageFallbackPolicy[] = ['engine-only', 'ask', 'guarantee'];
const DEFAULT_IMAGE_GENERATION_TIMEOUT_MS = 6 * 60 * 1000;
const LONG_RUN_IMAGE_MAX_TIMEOUT_MS = 45 * 60 * 1000;
const FLOW_IMAGE_GENERATION_MAX_TIMEOUT_MS = 18 * 60 * 1000;
const MIN_IMAGE_GENERATION_TIMEOUT_MS = 30_000;
const DEFAULT_IMAGE_STABILIZE_MS = 3_000;
const LONG_RUN_IMAGE_STABILIZE_MS = 8_000;
const UI_AUTOMATION_IMAGE_STABILIZE_MS = 15_000;
const FLOW_IMAGE_STABILIZE_MS = 45_000;
const UI_AUTOMATION_IMAGE_PROVIDERS = new Set(['dropshot', 'flow', 'imagefx']);
const SLOW_IMAGE_PROVIDERS = new Set([
  'dropshot',
  'flow',
  'imagefx',
  'nano-banana-pro',
  'nano-banana-2',
  'openai-image',
  'leonardoai',
]);
let imageGenerationQueue: Promise<void> = Promise.resolve();
let lastImageGenerationFinishedAt = 0;

function isExplicitUserImageGenerationRequest(options: any): boolean {
  try {
    if ((window as any).__manualImageGenerationInProgress === true) return true;
  } catch {
    // window is unavailable only in isolated static-test/import contexts.
  }
  return options?.forceImageGeneration === true
    || options?.manualImageGeneration === true
    || options?.regenerate === true;
}

function disableTextOnlyPublishForExplicitImageGeneration(): void {
  try {
    localStorage.setItem('textOnlyPublish', 'false');
  } catch {
    // localStorage can be unavailable in isolated tests.
  }

  try {
    const unifiedSkipImages = document.getElementById('unified-skip-images') as HTMLInputElement | null;
    if (unifiedSkipImages) unifiedSkipImages.checked = false;
  } catch {
    // document can be unavailable in isolated tests.
  }

  try {
    const syncImageSkipUI = (window as any).syncImageSkipUI;
    if (typeof syncImageSkipUI === 'function') {
      syncImageSkipUI(false);
    }
  } catch {
    // Best-effort UI sync only.
  }
}

function getLocalStorageFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function getDomSkipImagesChecked(): boolean {
  try {
    return (document.getElementById('unified-skip-images') as HTMLInputElement | null)?.checked === true;
  } catch {
    return false;
  }
}

function normalizeImageFallbackPolicy(value: any): ImageFallbackPolicy {
  return IMAGE_FALLBACK_POLICIES.includes(value as ImageFallbackPolicy)
    ? value as ImageFallbackPolicy
    : 'engine-only';
}

function normalizeImageProvider(value: any): string {
  return String(value || '').trim();
}

function getImageItemCount(options: any): number {
  return Math.max(1, Array.isArray(options?.items) ? options.items.length : 1);
}

function isLongRunImageGeneration(options: any): boolean {
  const provider = normalizeImageProvider(options?.provider);
  return options?.isFullAuto === true
    || options?.isContinuousMode === true
    || options?.isMultiAccount === true
    || options?.longRunImageGeneration === true
    || UI_AUTOMATION_IMAGE_PROVIDERS.has(provider);
}

function estimateImageGenerationTimeoutMs(options: any): number {
  const provider = normalizeImageProvider(options?.provider);
  const count = getImageItemCount(options);
  if (provider === 'flow') {
    return Math.min(FLOW_IMAGE_GENERATION_MAX_TIMEOUT_MS, 120_000 + (count * 210_000));
  }
  const startupMs = UI_AUTOMATION_IMAGE_PROVIDERS.has(provider) ? 180_000 : 90_000;
  const perItemMs = provider === 'dropshot'
    ? 150_000
    : UI_AUTOMATION_IMAGE_PROVIDERS.has(provider)
      ? 135_000
      : SLOW_IMAGE_PROVIDERS.has(provider)
        ? 90_000
        : 60_000;
  return startupMs + (count * perItemMs);
}

function getImageStabilizeDelayMs(options: any): number {
  const provider = normalizeImageProvider(options?.provider);
  if (provider === 'flow') return FLOW_IMAGE_STABILIZE_MS;
  if (UI_AUTOMATION_IMAGE_PROVIDERS.has(provider)) return UI_AUTOMATION_IMAGE_STABILIZE_MS;
  if (isLongRunImageGeneration(options) || SLOW_IMAGE_PROVIDERS.has(provider)) return LONG_RUN_IMAGE_STABILIZE_MS;
  return DEFAULT_IMAGE_STABILIZE_MS;
}

function logImageQueueMessage(message: string): void {
  try {
    appendLog(message);
  } catch {
    // appendLog is unavailable in a few isolated test/import contexts.
  }
}

function resolveImageGenerationTimeoutMs(options: any): number {
  const provider = normalizeImageProvider(options?.provider);
  const rawTimeoutValue = options?.imageGenerationTimeoutMs
    ?? options?.timeoutMs
    ?? options?.timeout;
  const explicitTimeout = Number(rawTimeoutValue);
  const estimatedTimeout = estimateImageGenerationTimeoutMs(options);
  const isLongRun = isLongRunImageGeneration(options);
  const rawTimeout = Number(
    options?.imageGenerationTimeoutMs
      ?? options?.timeoutMs
      ?? options?.timeout
      ?? (isLongRun ? estimatedTimeout : DEFAULT_IMAGE_GENERATION_TIMEOUT_MS)
  );

  if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) {
    if (provider === 'flow') {
      return Math.min(Math.max(estimatedTimeout, MIN_IMAGE_GENERATION_TIMEOUT_MS), FLOW_IMAGE_GENERATION_MAX_TIMEOUT_MS);
    }
    return isLongRun
      ? Math.min(Math.max(estimatedTimeout, DEFAULT_IMAGE_GENERATION_TIMEOUT_MS), LONG_RUN_IMAGE_MAX_TIMEOUT_MS)
      : DEFAULT_IMAGE_GENERATION_TIMEOUT_MS;
  }

  const maximum = provider === 'flow'
    ? FLOW_IMAGE_GENERATION_MAX_TIMEOUT_MS
    : isLongRun ? LONG_RUN_IMAGE_MAX_TIMEOUT_MS : DEFAULT_IMAGE_GENERATION_TIMEOUT_MS;
  const minimum = isLongRun
    ? Math.min(maximum, Math.max(MIN_IMAGE_GENERATION_TIMEOUT_MS, estimatedTimeout))
    : MIN_IMAGE_GENERATION_TIMEOUT_MS;
  const requested = Number.isFinite(explicitTimeout) && explicitTimeout > 0 && isLongRun
    ? Math.max(rawTimeout, estimatedTimeout)
    : rawTimeout;

  return Math.min(
    Math.max(requested, minimum),
    maximum
  );
}

async function runQueuedImageGeneration<T>(options: any, task: () => Promise<T>): Promise<T> {
  let releaseCurrentTurn: () => void = () => undefined;
  const previousTurn = imageGenerationQueue;
  const currentTurn = new Promise<void>((resolve) => {
    releaseCurrentTurn = resolve;
  });
  imageGenerationQueue = previousTurn.then(() => currentTurn, () => currentTurn);

  await previousTurn.catch(() => undefined);

  const stabilizeMs = getImageStabilizeDelayMs(options);
  if (lastImageGenerationFinishedAt > 0 && stabilizeMs > 0) {
    const elapsedSinceLast = Date.now() - lastImageGenerationFinishedAt;
    if (elapsedSinceLast < stabilizeMs) {
      const waitMs = stabilizeMs - elapsedSinceLast;
      logImageQueueMessage(`[Image Queue] Waiting ${Math.ceil(waitMs / 1000)}s before next image job (${normalizeImageProvider(options?.provider) || 'unknown'}).`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  try {
    return await task();
  } finally {
    lastImageGenerationFinishedAt = Date.now();
    releaseCurrentTurn();
  }
}

async function abortImageGenerationIfAvailable(): Promise<void> {
  try {
    if (window.api && typeof (window.api as any).abortImageGeneration === 'function') {
      await (window.api as any).abortImageGeneration();
    }
  } catch (abortErr) {
    console.warn('[Renderer] 이미지 생성 중단 신호 전달 실패:', abortErr);
  }
}

function getProgressModalForImagePreview(): any {
  try {
    return progressModal
      || (window as any).currentProgressModal
      || ((window as any).progressModal ?? null);
  } catch {
    return null;
  }
}

function updateGeneratedImagePreview(data: { image: any; index: number; total: number }): void {
  const { index, total, image } = data;
  if (!image) return;

  try {
    const progressStepText = document.getElementById('progress-step-text');
    if (progressStepText) {
      progressStepText.textContent = `이미지 생성 중... (${index + 1}/${total} 완료)`;
    }

    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    if (progressBar && progressPercent && total > 0) {
      const pct = Math.round(40 + (25 * (index + 1) / total));
      progressBar.style.width = `${pct}%`;
      progressPercent.textContent = `${pct}%`;
    }

    const modal = getProgressModalForImagePreview();
    if (index === 0 && modal && typeof modal.clearImages === 'function') {
      modal.clearImages();
    }

    if (modal && typeof modal.updateSingleImage === 'function') {
      const imgSrc = image.filePath || image.url || image.previewDataUrl || '';
      if (imgSrc) {
        modal.updateSingleImage(index, {
          url: imgSrc,
          filePath: image.filePath || '',
          heading: image.heading || `이미지 ${index + 1}`,
        }, total);
      }
    }

    // Mirror into the continuous-publishing modal preview (it has no image UI
    // of its own): the latest image fills the large preview, every image adds
    // a thumb. Multi-image batches (full-auto style) reset at index 0;
    // single-image calls (continuous types one heading per IPC, index always
    // 0) accumulate — the item loop clears the preview at each post boundary.
    const cpWrap = document.getElementById('cp-image-preview-wrap');
    const cpGrid = document.getElementById('cp-image-grid');
    const cpMain = document.getElementById('cp-image-main') as HTMLImageElement | null;
    if (cpWrap && cpGrid && cpMain) {
      if (index === 0 && total > 1) cpGrid.innerHTML = '';
      const cpSrc = image.filePath || image.url || image.previewDataUrl || '';
      if (cpSrc) {
        const thumb = document.createElement('img');
        thumb.src = cpSrc;
        thumb.title = `${image.heading || `이미지 ${index + 1}`} (${index + 1}/${total}) — 클릭하면 크게 보기`;
        thumb.style.cssText = 'width: 56px; height: 56px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); cursor: pointer;';
        thumb.addEventListener('click', () => { cpMain.src = cpSrc; });
        thumb.onerror = () => { thumb.remove(); };
        cpGrid.appendChild(thumb);
        cpMain.src = cpSrc;
        if (!cpMain.dataset.lightboxWired) {
          cpMain.dataset.lightboxWired = '1';
          cpMain.addEventListener('click', () => {
            if (cpMain.src) openCpImageLightbox(cpMain.src);
          });
        }
        cpWrap.style.display = 'block';
      }
    }
  } catch (previewErr) {
    console.warn('[Renderer] image preview update failed:', previewErr);
  }
}

// Full-screen lightbox for the continuous modal preview — created lazily so
// the markup stays out of index.html. Click anywhere to close.
function openCpImageLightbox(src: string): void {
  let box = document.getElementById('cp-image-lightbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'cp-image-lightbox';
    box.style.cssText = 'position: fixed; inset: 0; z-index: 40000; background: rgba(0, 0, 0, 0.88); display: none; align-items: center; justify-content: center; cursor: zoom-out;';
    box.addEventListener('click', () => { (box as HTMLElement).style.display = 'none'; });
    const img = document.createElement('img');
    img.id = 'cp-image-lightbox-img';
    img.style.cssText = 'max-width: 92vw; max-height: 92vh; object-fit: contain; border-radius: 12px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);';
    box.appendChild(img);
    document.body.appendChild(box);
  }
  const img = document.getElementById('cp-image-lightbox-img') as HTMLImageElement | null;
  if (img) img.src = src;
  box.style.display = 'flex';
}

function registerImageGeneratedPreviewBridge(): (() => void) | null {
  try {
    if (!window.api || typeof (window.api as any).onImageGenerated !== 'function') return null;
    return (window.api as any).onImageGenerated((data: { image: any; index: number; total: number }) => {
      updateGeneratedImagePreview(data);
    });
  } catch (listenerErr) {
    console.warn('[Renderer] onImageGenerated preview bridge registration failed:', listenerErr);
    return null;
  }
}

async function invokeGenerateImagesIpc(options: any): Promise<any> {
  const timeoutMs = resolveImageGenerationTimeoutMs(options);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let cleanupPreviewListener: (() => void) | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`이미지 생성 타임아웃 (${Math.round(timeoutMs / 1000)}초)`));
    }, timeoutMs);
  });

  try {
    cleanupPreviewListener = registerImageGeneratedPreviewBridge();
    return await Promise.race([
      window.api.generateImages(options),
      timeoutPromise
    ]);
  } catch (error) {
    const message = (error as Error)?.message || '';
    if (message.includes('타임아웃') || message.toLowerCase().includes('timeout')) {
      await abortImageGenerationIfAvailable();
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (cleanupPreviewListener) {
      try { cleanupPreviewListener(); } catch { /* ignore */ }
    }
  }
}

function isEmptyImageSuccessAllowed(options: any, result: any): boolean {
  const message = String(result?.message || '');
  let provider = String(options?.provider || '').trim();
  return options?.skipImages === true ||
    options?.headingImageMode === 'none' ||
    provider === 'skip' ||
    provider === 'local-folder' ||
    message.includes('thumbnailOnly') ||
    message.includes('이미지 없이') ||
    message.includes('textOnlyPublish');
}

function normalizeEmptyImageSuccess(options: any, result: any): any {
  const requestedCount = Array.isArray(options?.items) ? options.items.length : 0;
  const imageCount = Array.isArray(result?.images) ? result.images.length : 0;
  if (result?.success !== false && requestedCount > 0 && imageCount < requestedCount && !isEmptyImageSuccessAllowed(options, result)) {
    const provider = String(options?.provider || 'unknown').trim() || 'unknown';
    const message = imageCount === 0
      ? `[${provider}] 이미지 생성 결과가 비어있습니다. 화면 결과 감지, 로그인 세션, 구독/쿼터, 또는 엔진 UI 변경을 확인해야 합니다.`
      : `[${provider}] 이미지가 일부만 생성되었습니다 (${imageCount}/${requestedCount}). 누락 이미지가 있어 발행을 중단하고 이미지 단계부터 다시 시도합니다.`;
    return {
      ...result,
      success: false,
      images: Array.isArray(result?.images) ? result.images : [],
      message: result?.message || message,
    };
  }
  return result;
}

async function invokeGenerateImagesWithPolicy(options: any): Promise<any> {
  const result = normalizeEmptyImageSuccess(options, await invokeGenerateImagesIpc(options));
  const policy = normalizeImageFallbackPolicy(options?.imageFallbackPolicy);
  const message = String(result?.message || '');

  if (result?.success !== false || policy !== 'ask' || !message.includes(FALLBACK_CONFIRM_MARKER)) {
    return result;
  }

  const confirmed = window.confirm(
    `${message.replace(`[${FALLBACK_CONFIRM_MARKER}] `, '')}\n\n대체 결과를 사용하시겠습니까?\n` +
    '확인: 결과 보장 모드로 한 번만 재시도\n취소: 선택 엔진 실패로 종료'
  );
  if (!confirmed) {
    return result;
  }

  appendLog('🧭 엔진 우선 모드: 사용자 확인으로 결과 보장 재시도를 실행합니다.');
  const guaranteeOptions = {
    ...options,
    imageFallbackPolicy: 'guarantee',
  };
  return normalizeEmptyImageSuccess(guaranteeOptions, await invokeGenerateImagesIpc(guaranteeOptions));
}

async function autoSearchAndPopulateImages(
  structuredContent: any,
  mainKeyword: string,
  suppressModal?: boolean,
  // ✅ [v2.7.77] 풀오토/연속/다계정에서 명시 주입한 옵션
  forceOptions?: { sourceUrl?: string; fillGapWithAI?: boolean }
): Promise<void> {
  // ✅ [v2.7.77] force 옵션 있으면 가드 우회 (사용자 명시 의도)
  if (!forceOptions?.sourceUrl && !shouldRunAutoImageSearch(suppressModal)) return;

  try {
    await runAutoImageSearch(
      structuredContent,
      mainKeyword,
      appendLog,
      ImageManager,
      syncGlobalImagesFromImageManager,
      forceOptions
    );
  } catch (error) {
    console.error('[AutoImageSearch] ❌ 오류:', error);
    appendLog(`⚠️ 이미지 자동 수집 중 오류: ${(error as Error).message}`);
  }
}



// ✅ [Phase 5B-5] saveGeneratedPostFromData → postManager.ts로 이동 완료

// toastManager 호환을 위한 래퍼 (기존 코드와의 호환성 유지)
async function runUiActionLockedCompat<T>(key: string, message: string, fn: () => Promise<T>): Promise<T | null> {
  return runUiActionLocked(key, message, fn, toastManager);
}




async function ensureExternalApiCostConsent(provider: string): Promise<boolean> {
  if (!window.api || typeof window.api.getConfig !== 'function' || typeof window.api.saveConfig !== 'function') {
    return true;
  }

  // ✅ [v2.10.76] 모달 재출현 차단 — IPC getConfig 실패/지연/race 무관하게
  //   세션 메모(+localStorage)에 직전 답변이 있으면 즉시 통과.
  //   사용자 보고: 연속발행 중 plan 모달이 반복 출현, '유료' 클릭해도 재출현.
  //   원인: getConfig 10s timeout이 연속발행 IPC 폭주 중 실제로 발생 → config={} → 모달 재진입.
  // ✅ [v2.10.335] 나노바나나 3종 모두 Gemini 플랜 선택 대상
  if (provider === 'nano-banana' || provider === 'nano-banana-2' || provider === 'nano-banana-pro' || provider === 'falai') {
    const memoed = recallPlan();
    if (memoed) {
      console.log(`[CostConsent] ✅ memo hit (${memoed}) → modal 생략, IPC 우회`);
      return true;
    }
  }

  // ✅ [2026-02-02 FIX] IPC 호출에 타임아웃 추가 (무한 대기 방지)
  let config: any = {};
  try {
    config = await Promise.race([
      window.api.getConfig(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getConfig timeout')), 10000))
    ]) || {};
  } catch (e) {
    console.warn('[CostConsent] ⚠️ getConfig 호출 실패/타임아웃, 기본값 사용:', e);
    config = {};
  }

  // ✅ 나노바나나 3종 / Fal.ai (FLUX) 전용 플랜 자동 처리
  if (provider === 'nano-banana' || provider === 'nano-banana-2' || provider === 'nano-banana-pro' || provider === 'falai') {
    const diskPlan = config.geminiPlanType;
    let resolvedPlan: 'auto' | 'free' | 'paid' =
      diskPlan === 'auto' || diskPlan === 'free' || diskPlan === 'paid'
        ? diskPlan
        : 'auto';

    // ✅ 보안 강화: 무료 앱 라이선스는 사용자 선택 없이 free 정책 적용
    let isFreeLicense = false;
    try {
      const result = await window.api.getLicense();
      isFreeLicense = result?.license?.licenseType === 'free';
    } catch {
      isFreeLicense = false;
    }

    if (isFreeLicense) {
      resolvedPlan = 'free';
    }

    rememberPlan(resolvedPlan);
    if (diskPlan !== resolvedPlan) {
      try {
        await window.api.saveConfig({
          ...config,
          geminiPlanType: resolvedPlan,
          geminiImageDailyCount: Number(config.geminiImageDailyCount || 0),
          geminiImageLastReset: config.geminiImageLastReset || new Date().toISOString().split('T')[0]
        });
        console.log(`[CostConsent] ✅ Gemini 플랜 자동 저장: ${resolvedPlan}`);
      } catch (e) {
        console.warn('[CostConsent] Gemini 자동 플랜 저장 실패(세션 메모로 진행):', e);
      }
    } else {
      console.log(`[CostConsent] ✅ disk hit (${resolvedPlan}) → memo 채움, modal 생략`);
    }
    return true;
  }

  // ✅ [2026-02-24] 비용/할당량 경고 다이얼로그 제거 - 자동 동의 처리
  if (config.externalApiCostConsent === true) return true;

  // 자동 동의 저장 (팝업 없이)
  await window.api.saveConfig({
    ...config,
    externalApiCostConsent: true,
    externalApiCostConsentAt: new Date().toISOString(),
  });
  return true;
}

async function reserveExternalApiImageQuota(provider: string, requestCount: number): Promise<{ ok: true; rollback: () => Promise<void> } | { ok: false; message: string }> {
  if (!window.api || typeof window.api.getConfig !== 'function' || typeof window.api.saveConfig !== 'function') {
    return { ok: true, rollback: async () => undefined };
  }

  void provider;
  void requestCount;
  return { ok: true, rollback: async () => undefined };
}




async function generateImagesWithCostSafety(options: any): Promise<any> {
  return runQueuedImageGeneration(options, () => generateImagesWithCostSafetyInternal(options));
}

async function generateImagesWithCostSafetyInternal(options: any): Promise<any> {
  // ✅ [2026-02-11 FIX] provider 결정 우선순위: 전달값 → fullAutoImageSource → globalImageSource → 'nano-banana-pro'
  console.log(`[generateImagesWithCostSafety] 📥 전달받은 provider: "${String(options?.provider || '').trim()}"`);

  // ✅ [2026-04-18 CRITICAL GUARD] 유료 이미지 API의 최종 방어선
  //    모든 유료/과금 가능 이미지 생성이 이 함수를 경유하므로 여기서 skipImages 차단하면
  //    어느 호출 경로에서 skipImages 체크가 누락돼도 API 호출/과금 방지 가능.
  //    사용자 제보: "이미지 없음" 설정에도 나노바나나2 실행 → 글 1개당 650원 과금 발생.
  const _forceImageGeneration = isExplicitUserImageGenerationRequest(options);
  if (_forceImageGeneration && options?.skipImages !== true) {
    disableTextOnlyPublishForExplicitImageGeneration();
  }

  const _textOnlyPublishFlag = !_forceImageGeneration && getLocalStorageFlag('textOnlyPublish');
  const _domSkipImagesFlag = !_forceImageGeneration && getDomSkipImagesChecked();
  const _skipImagesFlag = options?.skipImages === true
    || _textOnlyPublishFlag
    || _domSkipImagesFlag;
  if (_skipImagesFlag) {
    console.warn('[generateImagesWithCostSafety] 🚫 skipImages/textOnlyPublish=true → 유료 이미지 API 호출 전면 차단');
    return { success: true, images: [], message: '이미지 없이 발행 설정으로 차단됨' };
  }

  // ✅ [2026-04-18 CRITICAL GUARD #2] thumbnailOnly 단일 초크포인트 가드
  //    호출자(headingImageGen / fullAutoFlow / multiAccountManager / continuousPublishing 등
  //    15+ 경로)마다 thumbnailOnly를 개별 체크하던 구조라 누락이 반복 발생.
  //    사용자 제보: "썸네일만" 설정인데도 본문 소제목 이미지까지 전량 생성됨.
  //    단일 규칙: thumbnailOnly=true 면 items[] 중 isThumbnail===true 인 항목만 통과시키고
  //    나머지(본문 소제목)는 전량 차단. 통과할 아이템이 없으면 빈 성공 반환.
  // Explicit option or headingImageMode only — the legacy 'thumbnailOnly'
  // checkbox key is full-auto-scoped and arrives here via options; reading it
  // globally let stale values force thumbnail-only in every flow.
  const _thumbnailOnlyFlag = options?.thumbnailOnly === true
    || localStorage.getItem('headingImageMode') === 'thumbnail-only';
  if (_thumbnailOnlyFlag && Array.isArray(options?.items)) {
    const beforeCount = options.items.length;
    const thumbOnlyItems = options.items.filter((it: any) => it?.isThumbnail === true);
    const bodyCount = beforeCount - thumbOnlyItems.length;
    if (bodyCount > 0) {
      console.warn(`[generateImagesWithCostSafety] 🚫 thumbnailOnly=true → 본문 소제목 이미지 ${bodyCount}개 차단 (썸네일 ${thumbOnlyItems.length}개만 통과)`);
    }
    if (thumbOnlyItems.length === 0) {
      return { success: true, images: [], message: 'thumbnailOnly로 본문 이미지 생성 차단됨' };
    }
    options.items = thumbOnlyItems;
  }

  let provider = String(options?.provider || '').trim();

  // ✅ [2026-01-24 FIX] headingImageMode 자동 주입 - 다중계정 발행에서도 홀수/짝수 필터링 적용
  if (!options.headingImageMode) {
    const savedMode = localStorage.getItem('headingImageMode') as 'all' | 'thumbnail-only' | 'odd-only' | 'even-only' | 'none' | null;
    if (savedMode) {
      options.headingImageMode = savedMode;
      console.log(`[Renderer] 🖼️ headingImageMode 자동 주입: "${savedMode}"`);
    }
  }

  // ✅ [2026-02-11 FIX] 이미지 소스 자동 주입 - fullAutoImageSource를 globalImageSource보다 우선 참조
  if (!options.provider) {
    const fullAutoSource = localStorage.getItem('fullAutoImageSource');
    const globalSource = localStorage.getItem('globalImageSource');
    const resolvedSource = fullAutoSource || globalSource;
    if (resolvedSource) {
      options.provider = resolvedSource;
      console.log(`[Renderer] 🎨 이미지 소스 자동 주입: "${resolvedSource}" (fullAuto: ${fullAutoSource || 'null'}, global: ${globalSource || 'null'})`);
    }
  }
  provider = String(options?.provider || provider || '').trim();
  if (!options.imageStyle) {
    const savedStyle = localStorage.getItem('imageStyle');
    if (savedStyle) {
      options.imageStyle = savedStyle;
      console.log(`[Renderer] ✨ 이미지 스타일 자동 주입: "${savedStyle}"`);
    }
  }
  if (!options.imageRatio) {
    const savedRatio = localStorage.getItem('imageRatio');
    if (savedRatio) {
      options.imageRatio = savedRatio;
      console.log(`[Renderer] 📐 이미지 비율 자동 주입: "${savedRatio}"`);
    }
  }

  // ✅ [2026-02-12] 카테고리 자동 주입 → DeepInfra 카테고리별 스타일 적용 (NO PEOPLE 등)
  if (!options.category) {
    const cachedCategory = UnifiedDOMCache?.getRealCategory?.() || '';
    if (cachedCategory) {
      options.category = cachedCategory;
      console.log(`[Renderer] 📂 카테고리 자동 주입: "${cachedCategory}" → DeepInfra 스타일 매칭에 사용`);
    }
  }

  // ✅ [2026-01-27] 썸네일/소제목 분리 비율 주입
  if (!(options as any).thumbnailImageRatio) {
    const savedThumbnailRatio = localStorage.getItem('thumbnailImageRatio') || localStorage.getItem('imageRatio') || '1:1';
    (options as any).thumbnailImageRatio = savedThumbnailRatio;
    console.log(`[Renderer] 📐 썸네일 비율 자동 주입: "${savedThumbnailRatio}"`);
  }
  if (!(options as any).subheadingImageRatio) {
    const savedSubheadingRatio = localStorage.getItem('subheadingImageRatio') || localStorage.getItem('imageRatio') || '1:1';
    (options as any).subheadingImageRatio = savedSubheadingRatio;
    console.log(`[Renderer] 📐 소제목 비율 자동 주입: "${savedSubheadingRatio}"`);
  }

  // ✅ [2026-06-09] 썸네일 텍스트는 실제 썸네일 항목에만 자동 주입
  const hasImageItems = Array.isArray(options.items) && options.items.length > 0;
  const hasThumbnailTextTarget = !hasImageItems || options.items.some((item: any) =>
    item?.isThumbnail === true && item?.allowText !== false
  );
  if (options.thumbnailTextInclude === undefined && options.allowThumbnailText !== undefined) {
    options.thumbnailTextInclude = hasThumbnailTextTarget && !!options.allowThumbnailText;
    console.log(`[Renderer] 🔤 thumbnailTextInclude 별칭 정규화: ${options.thumbnailTextInclude}`);
  }
  if (options.thumbnailTextInclude === undefined) {
    const savedThumbnailText = localStorage.getItem('thumbnailTextInclude') === 'true';
    options.thumbnailTextInclude = hasThumbnailTextTarget && savedThumbnailText;
    console.log(`[Renderer] 🔤 thumbnailTextInclude 자동 주입: ${options.thumbnailTextInclude}`);
  }

  if (!options.imageFallbackPolicy) {
    const savedFallbackPolicy = normalizeImageFallbackPolicy(localStorage.getItem('imageFallbackPolicy'));
    options.imageFallbackPolicy = savedFallbackPolicy;
    console.log(`[Renderer] 🧭 imageFallbackPolicy 자동 주입: "${savedFallbackPolicy}"`);
  } else {
    options.imageFallbackPolicy = normalizeImageFallbackPolicy(options.imageFallbackPolicy);
  }

  // Authoritative shopping-connect detection: caller-provided flag takes
  // precedence, then data markers on currentStructuredContent, finally the
  // legacy UI-state probe. Data-based detection is required because the
  // image tab collapses the shopping-connect settings panel, which flips
  // the UI probe to false even when the post was crawled from an affiliate.
  // ✅ [v1.4.82] stale productInfo/crawledProductInfo 때문에 비쇼핑 글에서도
  //   쇼핑커넥트가 false-triggering되어 사용자가 선택한 이미지 엔진(ImageFX 등)이
  //   nano-banana-pro로 강제 전환되는 버그 수정:
  //   - contentMode가 명시적으로 'affiliate'일 때만 data-marker를 신뢰
  //   - 그 외에는 caller 명시 플래그 또는 UI probe만 사용
  const sc = currentStructuredContent as any;
  const explicitAffiliateMode = (options.contentMode === 'affiliate')
    || ((window as any)?.currentContentMode === 'affiliate');
  const dataShoppingActive = explicitAffiliateMode
    && !!(sc?.productInfo || sc?.affiliateLink || (window as any)?.crawledProductInfo);
  const isShoppingConnect = options.isShoppingConnect === true
    || dataShoppingActive
    || (explicitAffiliateMode && isShoppingConnectModeActive());
  options.isShoppingConnect = isShoppingConnect; // 메인 프로세스에도 전달

  console.log(`[Renderer] 🛒 isShoppingConnect 결정: ${isShoppingConnect} (전달값: ${options.isShoppingConnect}, UI: ${isShoppingConnectModeActive()}, 데이터: ${dataShoppingActive}, affiliateMode: ${explicitAffiliateMode})`);

  if (isShoppingConnect) {
    // ✅ [FIX] 빈 배열도 체크: collectedImages가 없거나 빈 배열이면 currentStructuredContent.images 사용
    const hasCollectedImages = options.collectedImages && Array.isArray(options.collectedImages) && options.collectedImages.length > 0;
    const hasStructuredImages = currentStructuredContent?.images && Array.isArray(currentStructuredContent.images) && currentStructuredContent.images.length > 0;

    if (!hasCollectedImages && hasStructuredImages) {
      options.collectedImages = (currentStructuredContent as any).images;
      console.log(`[Renderer] 🛒 쇼핑커넥트: ${(currentStructuredContent as any).images.length}개 수집 이미지 자동 주입`);
    } else if (hasCollectedImages) {
      console.log(`[Renderer] 🛒 쇼핑커넥트: ${options.collectedImages.length}개 수집 이미지 전달됨`);
    }

    // ✅ [v2.7.28] HARD RULE 재설계 — 화이트리스트 → 블랙리스트
    //   기존 화이트리스트(nano-banana-pro/2만 허용)는 'naver'(검색) / 'collected'(수집)
    //   / 'saved'(저장) / 'local-folder'(내폴더) / 'no-images' 같이 가짜를 만들지 않는
    //   provider까지 차단해 사용자가 "수집한 이미지로" 발행 시도해도 막히는 회귀를 만듦.
    //   블랙리스트 패턴: 명시적으로 제품을 가짜로 만들어내는 AI 엔진만 차단.
    //   허용 (자동 통과): nano-banana-pro, nano-banana-2 (Gemini img2img),
    //                    openai-image (gpt-image-2 img2img),
    //                    naver, collected, saved, local-folder, no-images, gallery.
    //   차단: ImageFX, DALL-E 3, Leonardo, DeepInfra, Stability, Fal.ai, Prodia, Pollinations, flow
    //         (text-only 생성이라 제품 정체성을 유지할 수 없음)
    const SC_BLOCKED_FAKE_AI = [
      'imagefx', 'dall-e-3', 'leonardoai', 'deepinfra', 'deepinfra-flux',
      'stability', 'falai', 'prodia', 'pollinations', 'flow',
    ];
    if (provider && SC_BLOCKED_FAKE_AI.includes(provider)) {
      const poolSize = Array.isArray(options.collectedImages) ? options.collectedImages.length : 0;
      console.warn(`[쇼핑커넥트] 🚫 "${provider}" 엔진 차단 — 제품 정체성 보존 안 되는 AI 엔진`);
      if (poolSize === 0) {
        const errMsg = '🛒 쇼핑커넥트: 수집된 제품 이미지가 없습니다. "쇼핑몰 이미지 수집" 버튼으로 제품 이미지를 먼저 크롤링하거나, 이미지 엔진을 "나노바나나" 또는 "덕트테이프"로 변경하세요.';
        console.error(`[쇼핑커넥트] ❌ ${errMsg}`);
        return { success: false, message: errMsg };
      }
      console.warn(`[쇼핑커넥트] 🛒 수집 이미지 ${poolSize}장으로 자동 대체 (AI 생성 스킵)`);
    } else if (!hasCollectedImages && !hasStructuredImages
        && (provider === 'nano-banana' || provider === 'nano-banana-2' || provider === 'nano-banana-pro' || provider === 'openai-image')) {
      // 나노바나나 3종/덕테이프 + 수집 이미지 없음 = text2img/img2img 진입 허용
      console.log(`[Renderer] 🛒 쇼핑커넥트: 수집 이미지 없음 → ${provider}로 진행`);
    } else {
      // 그 외 (naver/collected/saved/local-folder/no-images/gallery 등) — 가드 통과
      console.log(`[Renderer] 🛒 쇼핑커넥트: provider="${provider}" — 비-AI 또는 안전 엔진, 통과`);
    }

    // ✅ [2026-02-23 FIX] 제품 가격 정보를 options에 주입 → 스펙 표에 정확한 가격 반영
    const productInfo = (currentStructuredContent as any)?.productInfo || (window as any).crawledProductInfo;
    if (productInfo) {
      options.productData = {
        name: productInfo.name || productInfo.productName || '',
        price: productInfo.price || productInfo.lprice || productInfo.hprice || '',
        brand: productInfo.brand || productInfo.maker || '',
        category: productInfo.category || '',
      };
      console.log(`[Renderer] 💰 제품 가격 정보 주입: ${JSON.stringify(options.productData)}`);
    }

  } else {
    // ✅ [수정] 일반 모드에서도 collectedImages가 있으면 참조 이미지로 사용 (제품 이미지 기반 생성 지원)
    // 더 이상 delete하지 않음 - 수집된 이미지가 있으면 참조로 활용
    if (options.collectedImages && options.collectedImages.length > 0) {
      console.log(`[Renderer] 🔍 일반 모드: 수집 이미지 ${(options.collectedImages as any[]).length}개를 참조 이미지로 사용합니다.`);
    }
  }

  if (!isCostRiskImageProvider(provider)) {
    return invokeGenerateImagesWithPolicy(options);
  }

  const locked = await runUiActionLocked(
    `cost-risk-image:${provider}`,
    '이미지 생성이 이미 진행 중입니다. 잠시만 기다려주세요.',
    async () => {
      const consentOk = await ensureExternalApiCostConsent(provider);
      if (!consentOk) {
        throw new Error('사용자가 과금/쿼터 안내에 동의하지 않았습니다.');
      }

      const items = Array.isArray(options?.items) ? options.items : [];
      const reserve = await reserveExternalApiImageQuota(provider, items.length || 1);
      if (!reserve.ok) {
        throw new Error(reserve.message);
      }

      // ✅ [2026-02-13 SPEED] 리스너를 try 밖에 선언 (catch에서도 접근 가능)
      let cleanupImageListener: (() => void) | null = null;
      let imageApiTimeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        // 이미지 생성 IPC는 무한 대기하지 않고 호출자별 제한 시간 안에서 정리한다.
        const IMAGE_API_TIMEOUT = resolveImageGenerationTimeoutMs(options);
        const timeoutPromise = new Promise((_, reject) => {
          imageApiTimeoutId = setTimeout(() => {
            reject(new Error(`이미지 생성 타임아웃 (${IMAGE_API_TIMEOUT / 1000}초)`));
          }, IMAGE_API_TIMEOUT);
        });
        try {
          if (window.api && typeof (window.api as any).onImageGenerated === 'function') {
            cleanupImageListener = (window.api as any).onImageGenerated((data: { image: any; index: number; total: number }) => {
              const { index, total, image } = data;
              console.log(`[Renderer] 🖼️ 이미지 실시간 수신 (${index + 1}/${total}): ${image?.heading || '이미지'}`);
              // ProgressModal에 실시간 진행 메시지 표시
              try {
                // ✅ [2026-02-13 FIX] 실제 ProgressModal DOM ID 사용 (#progress-step-text)
                const progressStepText = document.getElementById('progress-step-text');
                if (progressStepText) {
                  progressStepText.textContent = `🖼️ 이미지 생성 중... (${index + 1}/${total} 완료)`;
                }
                // 퍼센트 바도 업데이트 (이미지 생성은 40~65% 구간)
                const progressBar = document.getElementById('progress-bar');
                const progressPercent = document.getElementById('progress-percent');
                if (progressBar && progressPercent) {
                  const pct = Math.round(40 + (25 * (index + 1) / total));
                  progressBar.style.width = `${pct}%`;
                  progressPercent.textContent = `${pct}%`;
                }

                // The main preview grid is updated by invokeGenerateImagesIpc's
                // preview bridge. This listener only keeps progress text/live panel
                // metadata in sync so a single imageGenerated event is not rendered
                // into the grid twice.

                // ✅ [2026-02-28 NEW] liveImagePreview DOM 직접 업데이트 (headingImageGen.ts 로컬 객체 접근 불가 → DOM 기반)
                const livePanel = document.getElementById('live-image-preview-panel');
                if (livePanel && image) {
                  const liveSrc = image.filePath || image.url || image.previewDataUrl || '';
                  // 1) 그리드 아이템 업데이트 — 플레이스홀더를 실제 이미지로 교체
                  const gridItem = livePanel.querySelector(`.live-grid-item[data-index="${index}"]`) as HTMLElement;
                  if (gridItem && liveSrc) {
                    gridItem.style.border = '2px solid #22c55e';
                    gridItem.innerHTML = `
                      <img src="${liveSrc}" style="width: 100%; height: 100%; object-fit: cover;">
                      <span style="position: absolute; bottom: 2px; right: 2px; background: #22c55e; color: white; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 0.6rem;">✓</span>
                    `;
                  }
                  // 2) 첫 번째 완료 이미지 → 메인 미리보기 자동 표시
                  if (liveSrc && index === 0) {
                    const mainContainer = document.getElementById('live-main-preview-container');
                    if (mainContainer) {
                      mainContainer.innerHTML = `<img src="${liveSrc}" alt="${image.heading || ''}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px;">`;
                    }
                  }
                  // 3) 로그 추가
                  const logArea = livePanel.querySelector('#live-preview-log');
                  if (logArea) {
                    const logEntry = document.createElement('div');
                    logEntry.style.marginBottom = '4px';
                    logEntry.textContent = `✅ [${index + 1}/${total}] ${String(image.heading || '').substring(0, 25)}... 완료`;
                    logArea.appendChild(logEntry);
                    logArea.scrollTop = logArea.scrollHeight;
                  }
                  // 4) 진행률 제목 업데이트
                  const liveTitle = livePanel.querySelector('#live-preview-title');
                  if (liveTitle) {
                    liveTitle.textContent = `🎨 이미지 생성 중... (${index + 1}/${total})`;
                  }
                }
              } catch { } // DOM 업데이트 실패 무시
            });
          }
        } catch (listenerErr) {
          console.warn('[Renderer] ⚠️ onImageGenerated 리스너 등록 실패:', listenerErr);
        }

        const result = await Promise.race([
          invokeGenerateImagesWithPolicy(options),
          timeoutPromise
        ]);

        if (imageApiTimeoutId) { clearTimeout(imageApiTimeoutId); }

        // ✅ [2026-02-13 SPEED] 리스너 정리
        if (cleanupImageListener) { try { cleanupImageListener(); } catch { } }

        return result;
      } catch (e) {
        // ✅ [2026-02-13 SPEED] 에러/타임아웃 시에도 리스너 반드시 정리 (좀비 리스너 방지)
        if (imageApiTimeoutId) { clearTimeout(imageApiTimeoutId); }
        if (cleanupImageListener) { try { cleanupImageListener(); } catch { } }
        await reserve.rollback();
        const _emsg = (e as Error).message || '(메시지 없음)';
        console.error('[Renderer] ❌ 이미지 생성 실패/타임아웃:', _emsg);
        // ✅ [v2.10.332] 상류(IPC) 실패 진단 — nanoBanana 내부 로그가 못 잡는 사각지대.
        //   이미지 생성 IPC가 타임아웃되거나 거부되면 여기서만 보임. UI 로그 패널에 표기.
        appendLog(`🔬 [GEMINI-IMG-DEBUG] 상류 IPC 실패 — ${_emsg.includes('타임아웃') ? 'IPC 타임아웃(이미지 생성기 도달 전/응답 없음)' : 'IPC 오류'} | 메시지: ${_emsg}`);

        // ✅ [2026-02-13 FIX] 타임아웃 시 main process에 abort 신호 전달 (orphan 작업 방지)
        if ((e as Error).message?.includes('타임아웃')) {
          try {
            await abortImageGenerationIfAvailable();
            console.log('[Renderer] 🛑 타임아웃 → main process에 이미지 생성 중단 신호 전달');
          } catch (abortErr) {
            console.warn('[Renderer] ⚠️ abort 신호 전달 실패:', abortErr);
          }
        }

        throw e;
      }
    }
  );

  if (locked === null) {
    // ✅ [v2.10.332] 스핀락 차단 진단 — 이전 글의 이미지 IPC가 안 끝났을 때 다음 글이 막힘.
    appendLog('🔬 [GEMINI-IMG-DEBUG] 상류 스핀락 차단 — 이전 이미지 생성이 아직 진행/미정리 상태 (다음 글 차단됨)');
    throw new Error('이미지 생성이 이미 진행 중입니다.');
  }
  return locked;
}


function ensurePromptCardRemoveHandler(): void {
  const promptsContainer = document.getElementById('prompts-container') as HTMLDivElement | null;
  if (!promptsContainer) return;
  if ((promptsContainer as any)._imageButtonsHandler) return;

  const existing = (promptsContainer as any)._promptCardRemoveHandler;
  if (existing) return;

  const handler = (e: Event) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.remove-image-from-preview-btn') as HTMLElement | null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const index = parseInt(btn.getAttribute('data-image-index') || '0', 10);
    const promptItem = promptsContainer.querySelector(`.prompt-item[data-index="${index + 1}"]`) as HTMLDivElement | null;
    // ✅ [2026-03-16 FIX] getSafeHeadingTitle로 배지 오염 방지
    const headingTitle = (getSafeHeadingTitle(promptItem) || `소제목 ${index + 1}`).trim();

    if (!headingTitle) return;
    if (!confirm('이 이미지를 제거하시겠습니까?')) return;

    try {
      pushImageHistorySnapshot('prompt-card-remove-image');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }

    try {
      const titleKey = ImageManager.resolveHeadingKey(headingTitle);
      const imagesForHeading = ImageManager.getImages(titleKey);

      let targetIdx = -1;
      const selectedKey = (() => {
        try {
          return String(getHeadingSelectedImageKey(titleKey) || '').trim();
        } catch {
          return '';
        }
      })();
      if (selectedKey) {
        targetIdx = imagesForHeading.findIndex((img: any) => getStableImageKey(img) === selectedKey);
      }
      const currentImgEl = (promptItem?.querySelector('.generated-image img') || promptItem?.querySelector('.images-grid img')) as HTMLImageElement | null;
      if (currentImgEl && currentImgEl.src) {
        const normalizedRemoved = toFileUrlMaybe(String(currentImgEl.src || '').trim());
        if (targetIdx < 0) targetIdx = imagesForHeading.findIndex((img: any) => {
          const raw = img?.url || img?.filePath || img?.previewDataUrl || '';
          const norm = toFileUrlMaybe(String(raw || '').trim());
          return norm === normalizedRemoved;
        });
      }
      if (targetIdx < 0) targetIdx = 0;

      if (targetIdx >= 0 && targetIdx < imagesForHeading.length) {
        ImageManager.removeImageAtIndex(titleKey, targetIdx);
      }
    } catch (err) {
      console.error('[ImageManager] prompt-card remove handler failed:', err);
    }

    syncGlobalImagesFromImageManager();

    // ✅ [2026-03-16 FIX] 삭제 후 프롬프트 영역 UI 갱신
    try {
      const allImagesAfterRemove = ImageManager.getAllImages();
      updatePromptItemsWithImages(allImagesAfterRemove);
    } catch (e) {
      console.warn('[renderer] 삭제 후 UI 갱신 실패:', e);
    }
  };

  (promptsContainer as any)._promptCardRemoveHandler = handler;
  promptsContainer.addEventListener('click', handler);
}

export { autoSearchAndPopulateImages, runUiActionLockedCompat, ensureExternalApiCostConsent, reserveExternalApiImageQuota, generateImagesWithCostSafety, ensurePromptCardRemoveHandler };
