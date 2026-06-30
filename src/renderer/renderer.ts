// [v-auto-sync] Top-level version banner — must appear in user console on every load.
//   If missing, user has NOT installed this build.
import { APP_VERSION } from '../runtime/version.generated.js';
console.log(`%c🚀 Better Life Naver v${APP_VERSION} RENDERER STARTED`, 'background: gold; color: black; font-size: 18px; font-weight: bold; padding: 8px 16px; border-radius: 6px');

import type { StructuredContent, ImagePlan, HeadingPlan } from '../contentGenerator.js';
// ✅ [v2.10.335] 나노바나나 3종 분리 — provider 저장값 1회성 마이그레이션
import { migrateImageProviderStorage } from '../runtime/imageProviderMigration.js';
// ✅ [2026-02-26 모듈화] 프롬프트 번역 모듈
import { generateEnglishPromptForHeading, decomposeKoreanCompound, koreanMorphemes, getTranslationPrompt, cacheTranslation, _promptTranslationCache } from './modules/promptTranslation.js';
// ✅ [2026-02-26 모듈화] 페이월 시스템 모듈
import { isPaywallPayload, activatePaywall, initPaywallSystem } from './modules/paywallSystem.js';
// ✅ [2026-02-26 모듈화] 향상된 fetch + 자격증명 + 글자수
import { enhancedFetch } from './modules/enhancedFetch.js';
import { initCredentialsSave } from './modules/credentialsSave.js';
import { initCharCountDisplay } from './modules/charCountDisplay.js';
// ✅ [2026-02-26 모듈화] 사용법 영상 + API 가이드 + 사용 가이드 모달
import { loadTutorialVideos } from './modules/tutorialsTab.js';
import { initApiGuideModal } from './modules/apiGuideModals.js';
import { initAllApiKeysModal } from './modules/apiGuideModals.js';
import { initUserGuideModal } from './modules/guideModals.js';
// ✅ [2026-02-26 모듈화] 도구 모음/Gemini 선택/콘텐츠 모드/이미지 화질/예약 도움말
import { initToolsHubModal, initGeminiSelectionUI, initContentModeHelpAndSmartPublish } from './modules/tailUIUtils.js';
import { initBestProductModal } from './modules/bestProductModal.js';
import './modules/tailUIUtils.js';
// ✅ [2026-02-26 모듈화] AI 어시스턴트 + 가격 정보 + 이미지 관리
import { initAIAssistant } from './modules/aiAssistant.js';
import { initPriceInfoModal } from './modules/priceInfoModal.js';
import { initNoticeAdmin } from './modules/noticeAdmin.js';
import { initImageManagementTab } from './modules/imageManagementTab.js';
import { testLicenseCode, initLicenseBadge, initCustomerServiceButton, initGlobalRefreshButton, performGlobalRefresh, initLicenseModal, showErrorAlertModal } from './modules/licenseUI.js';
import { showRescheduleModal, initScheduleManagement, showSchedulePreviewModal, connectToAdminPanel, syncAdminSettings, sendAdminReport, checkAdminPermissions } from './modules/scheduleManager.js';
import { loadImagesFromFolder, getAllGeneratedImagesFromFolders, showLocalImageManagementModal, openGeneratedImagesFolder, openExistingImageFolder, showFolderSelectionModal, showLocalImageSelectionModal, showLoadImagesFromFoldersModal, showImagePlacementModal } from './modules/localImageModals.js';
import { refreshGeneratedPostsList, attachPostItemEventListeners, updateBatchDeleteButton, toggleSelectAllPosts, batchDeletePosts, showImageModal, showHeadingImagesModal, showPostsStatsDashboard, togglePostsView, loadGeneratedPostToFields, validateAndRecoverImages, toggleFavoritePost, reusePostImages } from './modules/postListUI.js';
import { syncHeadingVideoInPromptItems, openApplyVideoToHeadingModal, removeHeadingVideoByTitle, ensureGifImageForHeading, applyHeadingVideoFromFile, createKenBurnsFallbackVideoForHeading, regenerateHeadingVideoByTitle, generateHeadingVideoForPrompt, getHeadingsForVeo, ensureUnifiedPreviewVideoDelegation, ensurePreGenerationSelectionsOrWarn, syncHeadingVideoSlotsInUnifiedPreview, getAiVideoFolderPath, refreshMp4FilesList, prefetchHeadingVideoPreview, buildMinimalSilentVeoPrompt, getReviewProductAnchor, buildHeadingAlignedVeoPrompt, lockVeoQuota, generateVeoVideoWithRetry, openVeoHeadingSelectModal } from './modules/videoManager.js';
import { handleFullAutoPublish, handleMultiAccountPublish, handleSemiAutoPublish } from './modules/publishingHandlers.js';
import { executeFullAutoFlow, executeSemiAutoFlow, updateUnifiedPreview, updateUnifiedImagePreview, initFullAutoImageSourceSelection, initFullAutoExecution, collectFullAutoFormData, validateFullAutoFormData, executeFullAutoAutomation, generateFullAutoContent, displayContentInAllTabs, generateImagesForContent, generateLibraryImagesForHeadings, generateAIImagesForHeadings, executeBlogPublishing } from './modules/fullAutoFlow.js';
import { generateContentFromUrl, normalizeKeywordsForGeneration, generateContentFromKeywords, disableFullAutoPublishButton, enableFullAutoPublishButton, enableSemiAutoPublishButton, autoGenerateCTA, autoFillCTAFromContent, fillSemiAutoFields, paraphraseContent } from './modules/contentGeneration.js';
import { undoLastImageChange } from './modules/undoImageChange.js';
import { collectFormData } from './modules/formAndAutomation.js';
import { resolveFirstHeadingTitleForThumbnail, initThumbnailGenerator, updateThumbnailPreview } from './modules/thumbnailPreview.js';
import { initTitleGeneration, updateFullAutoPreview, updateFullAutoFinalImagePreview, toggleFullAutoPreview, updateFullAutoHeadingsPreview, extractSearchKeywords, setTitleInAllTabs, autoGenerateImagesAndPublish } from './modules/titleGeneration.js';
import { globalCleanupManager, memoryMonitor, cleanupAllMemoryManagers } from '../utils/memoryManager.js';
// ✅ [2026-01-25 모듈화] 안전 실행 유틸리티
import { safeExecute, safeExecuteAsync, safeGetElement, safeAddEventListener } from './utils/safeExecute.js';
// ✅ [2026-01-25 모듈화] 진행상황 모달
import { ProgressModal } from './components/ProgressModal.js';
// ✅ [2026-01-25 모듈화] 소제목 이미지 설정
import { HeadingImageMode, getHeadingImageMode, setHeadingImageMode, openHeadingImageModal, initHeadingImageButton, getFullAutoImageSource } from './components/HeadingImageSettings.js';
// ✅ [2026-01-25 모듈화] 프롬프트 편집 모달
import './components/PromptEditModal.js';
// ✅ [2026-01-25 모듈화] 초기화 가드 및 UI 락 시스템
import { InitializationGuard, clearImageGenerationLocks, runUiActionLocked } from './utils/stabilityUtils.js';
// ✅ [2026-01-25 모듈화] HTML 유틸리티
import { escapeHtml, removeMarkdownBold } from './utils/htmlUtils.js';
import { extractSemiAutoHeadingsFromBody } from './utils/semiAutoHeadingExtractor.js';
// ✅ [2026-01-25 모듈화] 이미지 비용 유틸리티
import { isCostRiskImageProvider, getCostRiskProviderLabel, getTodayKey } from './utils/imageCostUtils.js';
// ✅ [2026-01-25 모듈화] 쇼핑커넥트 유틸리티
import { isShoppingConnectModeActive, isAffiliateUrl, resolveAffiliateLink } from './utils/shoppingConnectUtils.js';
// ✅ [2026-05-18] scSubImageSource 키 충돌 분리: mode('ai'|'collected') vs engine(엔진명)
import './utils/subImageMode.js';
// ✅ [2026-04-18] 이미지 스킵 여부 단일 진실 공급원 — UI 3개 소스 통합
import { isImageSkipEnabled, syncImageSkipUI } from './utils/imageSkipCheck.js';
// ✅ [2026-01-25 모듈화] 스토리지 유틸리티
import { safeLocalStorageSetItem } from './utils/storageUtils.js';
// ✅ [2026-01-25 모듈화] Gemini 모델 동기화
import { initGeminiModelSync } from './utils/geminiModelSync.js';
// ✅ [2026-01-25 모듈화] 에러 유틸리티
import { translateGeminiError } from './utils/errorUtils.js';
// ✅ [2026-02-12] 반자동 전용 이미지 자동 수집 모듈
import { shouldRunAutoImageSearch, runAutoImageSearch, injectAutoCollectCheckboxUI } from './utils/semiAutoImageSearch.js';
// ✅ [v2.7.81/82] runAutoImageSearch + ImageManager + syncFn을 window에 등록
//   - dynamic import 없이 fullAutoFlow/multiAccount/headingImageGen에서 호출
//   - getImages/addImage 등 ImageManager 메서드 접근 (v2.7.82 핫픽스)
(window as any).runAutoImageSearch = runAutoImageSearch;
// ✅ [2026-01-25 모듈화] 카테고리 모달 유틸리티
import { initCategorySelectionListener } from './utils/categoryModalUtils.js';
// ✅ [2026-01-25 모듈화] 앱 이벤트 핸들러
import { initAllAppEventHandlers } from './utils/appEventsHandler.js';
// ✅ [2026-01-25 모듈화] 전체 자동 발행 유틸리티
import { isFullAutoStopRequested, requestStopFullAutoPublish, normalizeReviewHeadingSeed, applyReviewHeadingPrefix } from './utils/fullAutoUtils.js';
// ✅ [2026-01-25 모듈화] 소제목 키 및 파일 URL 유틸리티
import { toFileUrlMaybe, normalizeHeadingKeyForVideoCache } from './utils/headingKeyUtils.js';
// ✅ [2026-01-25 모듈화] Veo 진행 오버레이
import { showVeoProgressOverlay, setVeoProgressOverlay, hideVeoProgressOverlay, handleVeoLogForOverlay } from './components/VeoProgressOverlay.js';
// v2.10.85: SPEC-IMAGE-RECOVERY-001 모달 — 빌드 시 components inline으로 같은 scope에 정의됨.
//   이전: dynamic import → 인라인 빌드에서 404 silent fail → 복구 모달 안 떠 무한 재시도.
import { recoveryBlockingModal, RECOVERY_MODAL_PRESETS } from './components/RecoveryBlockingModal.js';
import { handleRecoveryChoice } from './components/RecoveryFollowupActions.js';
// ✅ [2026-01-25 모듈화] 영상 제공자 유틸리티
import {
  VideoProvider, getCurrentVideoProvider, setCurrentVideoProvider,
  isVeoQuotaExceededMessage, buildVeoQuotaUserMessage,
  isImageStylePromptForVeo, extractEnglishishProductName
} from './utils/videoProviderUtils.js';
// ✅ [2026-01-25 모듈화] 이미지 헬퍼
import { getSafeHeadingTitle, getHeadingTitleByIndex, getStableImageKey, getRequiredImageBasePath } from './utils/imageHelpers.js';
// ✅ [2026-01-25 모듈화] Ken Burns 스타일
import { ensureKenBurnsStyles } from './utils/kenBurnsStyles.js';
// ✅ [2026-01-25 모듈화] 카테고리 정규화 유틸
import { CATEGORY_NORMALIZE_MAP, normalizeCategory } from './utils/categoryNormalizeUtils.js';
// ✅ [2026-01-25 모듈화] 텍스트 포맷 유틸
import { formatContentForPreview, normalizeReadableBodyText, formatParagraph } from './utils/textFormatUtils.js';
// ✅ [2026-01-25 모듈화] Veo 프롬프트 안전화 유틸
import { buildVeoSafePrompt, isVeoAudioBlockedMessage } from './utils/veoSafetyUtils.js';
// ✅ [2026-01-25 모듈화] UI 매니저 클래스
import { LoadingManager, ToastManager, AnimationHelper, loadingManager, toastManager } from './utils/uiManagers.js';
// ✅ [2026-01-25 모듈화] 향상된 API 클라이언트
import { EnhancedApiClient, ApiRequestOptions, ApiResponse, apiClient } from './utils/apiClient.js';
// ✅ [2026-01-25 모듈화] 발행 글 저장소 유틸리티
import {
  GENERATED_POSTS_KEY,
  POSTS_MIGRATION_DONE_KEY,
  getPublishedPostsKey,
  loadPublishedPosts,
  savePublishedPost,
  getPostsStorageKey,
  getCurrentNaverId
} from './utils/postStorageUtils.js';
// ✅ [2026-04-03 모듈화] Post CRUD 모듈
import {
  saveGeneratedPostFromData, saveGeneratedPost,
  loadGeneratedPosts, loadAllGeneratedPosts, loadGeneratedPost,
  deleteGeneratedPost, copyGeneratedPost, previewGeneratedPost,
  updatePostAfterPublish, updatePostImages,
  openPostImageFolder, deletePostImageFolder,
  exportAllPosts, importPosts, importSelectedPosts,
  showPostSelectionModal,
  migratePostCategories, ensureCategoryMigration,
  migrateAccountPostsToGlobal, migratePostsToPerAccount, backfillNaverIdForLegacyPosts,
  normalizeGeneratedPostCategoryKey, getGeneratedPostCategoryLabel,
  isGeneratedPostCategoryCollapsed, setGeneratedPostCategoryCollapsed,
} from './modules/postManager.js';
// ✅ [2026-01-25 모듈화] 오류 처리 시스템
import {
  ErrorType,
  ErrorInfo,
  showError,
  handleApiError,
  errorHandler
} from './utils/errorHandlerUtils.js';
// ✅ [2026-01-25 모듈화] 날짜/스케줄 유틸리티
import {
  convertDatetimeLocalToScheduleFormat,
  getScheduleDateFromInput,
  getRecommendedScheduleTime
} from './utils/dateUtils.js';
// ✅ [2026-03-29] 24시간 시간 선택 유틸리티 (10분 단위)
import { createTime24Select, bindTime24Events } from './utils/time24Select.js';
// ✅ [2026-01-25 모듈화] 제목 처리 유틸리티
import {
  applyKeywordPrefixToTitle
} from './utils/titleUtils.js';
// ✅ [2026-01-25 모듈화] 프롬프트 오버라이드 유틸리티
import {
  getManualEnglishPromptOverridesStore,
  getManualEnglishPromptOverrideForHeading,
  setManualEnglishPromptOverrideForHeading,
  clearManualEnglishPromptOverrideForHeading
} from './utils/promptOverrideUtils.js';
// ✅ [2026-01-25 모듈화] 소제목 영상 미리보기 유틸리티
import {
  HeadingVideoPreviewCacheEntry,
  headingVideoPreviewCache,
  headingVideoPreviewInFlight,
  getHeadingVideoPreviewFromCache,
  getReviewHeadingSeed,
  ImageManagerLike
} from './utils/headingVideoPreviewUtils.js';
// ✅ [2026-01-25 모듈화] VEO 영상 생성 유틸리티
import {
  getVeoQuotaLockUntil,
  setVeoQuotaLockUntil,
  VeoQuotaCallbacks,
  GenerateVeoCallbacks
} from './utils/veoVideoUtils.js';
// ✅ [Phase 0] 공유 타입 정의
import type {
  GeneratorType, RendererAutomationImage, RendererStatus,
  RendererAutomationPayload, ContinuousQueueItem, GeneratedPost,
  ImageHistoryEntry, ImageHistorySnapshot, PaywallResponse,
  ErrorLog, AutosaveData, TutorialVideo
} from './types/index.js';
// ✅ [Phase 1] 에러 로깅 + 자동 저장/백업 시스템
import {
  logError, handleCrash, exportErrorLogs, clearErrorLogs,
  autosaveContent, loadAutosavedContent, clearAutosavedContent,
  createBackup, listBackups, BACKUP_KEY_PREFIX,
  startAutosave, stopAutosave, startAutoBackup, stopAutoBackup,
  registerGlobalErrorHandlers, injectAppendLog
} from './utils/errorAndAutosave.js';
// ✅ [2026-01-25] 환경설정 모달
import { initSettingsModal as initSettingsModalFunc } from './utils/settingsModal.js';
// ✅ [2026-02-24 모듈화] 연속 발행
import { switchExternalLinksTab, startContinuousMode, stopContinuousMode, toggleContinuousModeModal, startContinuousPublishing, initContinuousPublishingV2, startContinuousModeEnhanced, executeContinuousPublish, testApiKeysAndFullAuto, runRealFullAutoTest, setupMutualExclusiveCheckboxes, updateContinuousProgressModal, setKeywordTitleOptionsFromItem, applyKeywordPrefixToTitleContinuous, continuousQueueV2, scheduleNextPosting } from './modules/continuousPublishing.js';
// ✅ [2026-02-25 모듈화] 썸네일 생성기
import { ThumbnailGenerator, applyPresetThumbnailIfExists } from './modules/thumbnailGenerator.js';
// thumbnailGenerator 변수는 thumbnailGenerator.ts에서 let으로 선언됨 (런타임 중복 방지)
declare let thumbnailGenerator: ThumbnailGenerator | null;
// ✅ [2026-02-25 모듈화] 다중계정 관리
import { initMultiAccountManager, initMultiAccountPublishModal, initMainAccountSelector, generateImagesForAutomation } from './modules/multiAccountManager.js';
console.log('%c📦 multiAccountManager 모듈 IMPORT 완료 v2.10.214', 'background: #8b5cf6; color: white; font-size: 14px; padding: 4px 10px; border-radius: 4px');
// ✅ [2026-03-22] 로컬 폴더 이미지 로더 (window 전역 등록 — fullAutoFlow.ts에서 declare로 사용)
import './modules/localFolderImageLoader.js';
// ✅ [2026-03-17 모듈화] 예약 시간 분산 유틸리티
import { distributeByInterval, distributeByRandomRange, distributeWithProtection } from './modules/scheduleDistributor.js';
// window 전역 노출 (@ts-nocheck 파일에서 사용)
(window as any).distributeByInterval = distributeByInterval;
(window as any).distributeByRandomRange = distributeByRandomRange;
(window as any).distributeWithProtection = distributeWithProtection;
// ✅ [2026-02-25 모듈화] 소제목 이미지 생성
import { initHeadingImageGeneration, generateEnglishPromptForHeadingSync, generateImagePromptByIndex, autoAnalyzeHeadings, updateReserveImagesThumbnails, initUnifiedImageEventHandlers, getCurrentImageHeadings, getHeadingSelectedImageKey, setHeadingSelectedImageKey, displayCollectedImages, extractHeadingsFromContent, displayImageHeadingsWithPrompts, getHeadingSelectedImageKeyStore } from './modules/headingImageGen.js';
// ✅ [2026-02-25 모듈화] 이미지 표시/그리드/재생성
import { displayGeneratedImages, searchNaverImage, resolveReferenceImageForHeadingAsync, generateNanoBananaProImage, resolveReferenceImageForHeading, getAutoReferenceSourceUrlCandidate } from './modules/imageDisplayGrid.js';
// ✅ [Phase 5B] renderer.ts에서 추출된 모듈들
import { registeredEventListeners, registerEventListener, unregisterEventListener, clearAllEventListeners, rendererDomCache, getElement, getElementById, clearDomCache, disableDomCache, apiCallsInProgress, preventDuplicateApiCall, buttonStates, setButtonLoading, resetButtonState, disableButton, withErrorHandling, imageDataUrls, createImageDataUrl, revokeImageDataUrl, revokeAllImageDataUrls, getAllUrls, getUrlsAsString, appendLog, _logUpdatePending, _logPendingEntries, _flushLogEntries } from './modules/rendererUtils.js';
import { UnifiedDOMCache } from './modules/unifiedDOMCache.js';
import { ImageManager, imageHistoryStack, pushImageHistorySnapshot } from './modules/imageManagerCore.js';
import { getGlobalImageSettings, hydrateImageManagerFromImages, syncGlobalImagesFromImageManager, filterImagesForPublish } from './modules/imageSyncService.js';
// ✅ [v2.7.82] ImageManager + syncFn을 window에 등록 — runAutoImageSearch 의존성
(window as any).ImageManager = ImageManager;
(window as any).syncGlobalImagesFromImageManager = syncGlobalImagesFromImageManager;
import { autoSearchAndPopulateImages, runUiActionLockedCompat, ensureExternalApiCostConsent, reserveExternalApiImageQuota, generateImagesWithCostSafety, ensurePromptCardRemoveHandler } from './modules/costAndAutoGen.js';

const MODAL_BACKDROP_CONTENT_SELECTOR = [
  '.modal-content',
  '.modal-dialog',
  '.modal-card',
  '.ma-modal-content',
  '.modal-panel',
  '.modal-container',
  '.modal-box',
  '.dialog-content',
  '.settings-modal-content',
  '.progress-modal-content',
  '.price-modal-content',
  '.api-guide-content',
  '.license-modal-content',
  '.category-modal-content',
  '.glass-panel',
  '[data-modal-content="true"]',
].join(',');

const MODAL_INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[contenteditable="true"]',
  '[data-modal-action="true"]',
].join(',');

function isModalBackdropClick(event: MouseEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.dataset.allowBackdropClose === 'true') return false;
  if (target.closest(MODAL_INTERACTIVE_SELECTOR)) return false;
  if (target.closest(MODAL_BACKDROP_CONTENT_SELECTOR)) return false;

  const id = String(target.id || '').toLowerCase();
  const role = String(target.getAttribute('role') || '').toLowerCase();
  const ariaModal = target.getAttribute('aria-modal') === 'true';
  const looksLikeBackdrop =
    target.classList.contains('modal-backdrop') ||
    target.classList.contains('modal-overlay') ||
    target.classList.contains('progress-full-image-preview-overlay') ||
    target.dataset.modalBackdrop === 'true' ||
    id === 'global-paywall-modal-backdrop' ||
    /(^|[-_])(modal|backdrop|overlay)$/.test(id) ||
    id.includes('backdrop') ||
    id.includes('overlay') ||
    role === 'dialog' ||
    ariaModal;

  if (!looksLikeBackdrop) return false;

  try {
    const style = window.getComputedStyle(target);
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
      return false;
    }
  } catch {
    // If style lookup fails, still protect modal state.
  }

  return true;
}

function initModalBackdropClickGuard(): void {
  const w = window as any;
  if (w.__modalBackdropClickGuardInstalled === true) return;
  w.__modalBackdropClickGuardInstalled = true;

  document.addEventListener('click', (event) => {
    if (!isModalBackdropClick(event as MouseEvent)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

initModalBackdropClickGuard();

// ✅ [SPEC-IMAGE-NARRATIVE-2026 Phase 3] Image narrative mode modules
import { initImageNarrativeMode } from './modules/imageNarrativeMode.js';
// ✅ [SPEC-DROPSHOT-2026] 이미지 관리 → 🎨 이미지 생성 서브탭 (멀티엔진 대량 생성 스튜디오)
import { initImageGenStudio } from './modules/imageGenStudio.js';
// ✅ [SPEC-DROPSHOT-2026 2단계] dropshot 로그인/확인 UI (엔진 선택 시 노출)
import { wireSelectDropshotRow, wireSelectFlowRow } from './modules/dropshotLoginUi.js';
import { initImageLibrary, loadLibraryImages, useLibraryImage, switchToTab, generateFavoritesContent, generateTemplatesContent, getEnhancedTemplates } from './modules/contentPreviewAndLibrary.js';
declare let thumbnailBackgroundImage: string | null;
declare let thumbnailBackgroundDataUrl: string | null;

// ✅ [리팩토링] 새 UI 모듈 import - 점진적 마이그레이션용
// 새로 작성하는 코드에서는 아래 모듈들(ui* 접두사)을 사용하세요.
// 기존 함수와 충돌 방지를 위해 모든 import에 ui* 별칭 적용
import {
  // 상태 관리
  GlobalStore as UIGlobalStore,
  // 서비스
  ApiBridge as UIApiBridge,
  // 유틸리티
  escapeHtml as uiEscapeHtml,
  debounce as uiDebounce,
  delay as uiDelay,
  formatDate as uiFormatDate,
  // DOM 헬퍼
  getCachedElement as uiGetCachedElement,
  show as uiShow,
  hide as uiHide,
  setText as uiSetText,
  setValue as uiSetValue,
  getValue as uiGetValue,
  addClasses as uiAddClasses,
  removeClasses as uiRemoveClasses,
  setButtonLoading as uiSetButtonLoading,
  // UI 팩토리
  showToast as uiShowToast,
  createSpinner as uiCreateSpinner,
  // 매니저
  EventManager as UIEventManager,
  ErrorHandler as UIErrorHandler,
  withErrorHandling as uiWithErrorHandling,
  // 설정
  AFFILIATE_ENABLED_CATEGORIES as UI_AFFILIATE_CATEGORIES,
  isAffiliateCategoryEnabled as uiIsAffiliateCategoryEnabled,
  DELAYS as UI_DELAYS,
  ERROR_MESSAGES as UI_ERROR_MESSAGES,
  SUCCESS_MESSAGES as UI_SUCCESS_MESSAGES,
} from '../ui/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-03-23 FIX] 중복 에러 핸들러 제거
// 전역 에러 핸들링은 registerGlobalErrorHandlers() (errorAndAutosave.ts)에서 통합 처리
// → window.addEventListener('error') + window.addEventListener('unhandledrejection')
// → 로깅 + appendLog + handleCrash + Toast 표시까지 단일 지점에서 관리
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-02-05] 업데이터 로그 리스너 - DevTools 콘솔에 업데이트 진행 상황 표시
// ═══════════════════════════════════════════════════════════════════════════════
(function setupUpdaterLogListener() {
  if (window.api && typeof window.api.on === 'function') {
    window.api.on('updater-log', (message: string) => {
      console.log(`%c${message}`, 'color: #FFC107; font-weight: bold;');
    });
    console.log('[Updater] 업데이터 로그 리스너 등록 완료');
  }
})();

// [v2.10.155] 종료 시 좀비 정리 모달 IPC handler
//   main.ts _runFullCleanup이 phase별로 'cleanup-modal' IPC 전송
//   phase: 'start' | 'progress' | 'done'
(function setupCleanupModalListener() {
  if (window.api && typeof window.api.on === 'function') {
    let progressPercent = 0;
    window.api.on('cleanup-modal', (payload: { phase: 'start' | 'progress' | 'done'; message: string; count?: number }) => {
      const modal = document.getElementById('cleanup-modal');
      const titleEl = document.getElementById('cleanup-modal-title');
      const msgEl = document.getElementById('cleanup-modal-message');
      const progEl = document.getElementById('cleanup-modal-progress');
      if (!modal || !titleEl || !msgEl || !progEl) return;

      if (payload.phase === 'start') {
        progressPercent = 10;
        modal.style.display = 'flex';
        titleEl.textContent = '🧹 기존 좀비 프로세스를 정리하는 중...';
        msgEl.textContent = payload.message;
        progEl.style.width = '10%';
      } else if (payload.phase === 'progress') {
        progressPercent = Math.min(progressPercent + 18, 85);
        msgEl.textContent = payload.message;
        progEl.style.width = `${progressPercent}%`;
      } else if (payload.phase === 'done') {
        msgEl.textContent = payload.message;
        progEl.style.width = '100%';
        titleEl.textContent = '✅ 정리 완료';
        // 1.2초 후 모달 자동 사라짐 (앱 종료 직전이라 timing 짧게)
        setTimeout(() => {
          modal.style.display = 'none';
        }, 1200);
      }
    });
    console.log('[CleanupModal] 종료 정리 모달 리스너 등록 완료');
  }
})();

import { onAccountLogout as accountLogout } from './modules/accountSettingsManager.js';
import { runWhenIdle } from './utils/idleInit.js';
import { initShoppingConnectObserver } from './utils/shoppingConnectEvents.js';

// ═══════════════════════════════════════════════════════════════════════════════
// [Phase 0/v2.10.128] setInterval / setTimeout / MutationObserver monkey-patch.
//   목적: 모든 자동 콜백에 출처 마커 자동 부착 → LongTask observer가 *어느 콜백*에서 발생했는지 식별.
//   콜백 실행 *전*에 window.__lastBackgroundTask = '<type>:<source>' 설정.
//   부작용: setInterval 등록 시 Error().stack 1회 파싱 (콜백마다 아님). 비용 무시.
// ═══════════════════════════════════════════════════════════════════════════════
(function setupAutoTaskMarkers() {
  const w = window as any;
  // [v2.10.129] 호출자 추출 강화 — minified renderer.js + 다양한 stack 형식 대응.
  //   기존: 정규식 1개로 unknown 반환률 높음.
  //   강화: stack 깊이 10, 다중 정규식, fallback으로 raw 부분 반환.
  const getCaller = (): string => {
    try {
      const stack = new Error().stack || '';
      const lines = stack.split('\n');
      // 0=Error, 1=getCaller, 2=래퍼(setInterval/MutationObserver 등), 3+=실제 호출자
      // 더 깊이 (스트림: 일부 anonymous arrow 통과)
      for (let i = 3; i < Math.min(lines.length, 12); i++) {
        const line = lines[i].trim();
        if (!line) continue;
        // 다양한 형식 매칭:
        // "at funcName (file:N:M)"
        // "at funcName (file:N:M:O)" — Chromium :col 포함
        // "at file:N:M"
        // "at async funcName (file:N:M)"
        let m = line.match(/at\s+(?:async\s+)?(\S+)\s+\((.+?):(\d+):(\d+)\)/);
        if (m) {
          const [, name, file, ln] = m;
          const shortFile = (file.split('/').pop() || file).split('?')[0];
          if (name === '<anonymous>' || name === 'Object.<anonymous>') {
            return `${shortFile}:${ln}`;
          }
          return `${name}@${shortFile}:${ln}`;
        }
        // "at file:N:M" (이름 없음)
        m = line.match(/at\s+(.+?):(\d+):(\d+)/);
        if (m) {
          const shortFile = (m[1].split('/').pop() || m[1]).split('?')[0];
          return `${shortFile}:${m[2]}`;
        }
      }
      // fallback — raw stack 일부 (디버깅 가능)
      const raw = lines.slice(2, 5).map(l => l.trim()).filter(l => l).join(' | ');
      return raw.substring(0, 100) || 'unknown';
    } catch { return 'unknown'; }
  };
  // setInterval 래핑
  const _setInterval = window.setInterval.bind(window);
  (window as any).setInterval = function (fn: any, ms?: number, ...args: any[]) {
    const caller = getCaller().substring(0, 80);
    const wrapped = typeof fn === 'function'
      ? function (this: any, ...cbArgs: any[]) {
          w.__lastBackgroundTask = `interval:${caller}`;
          return (fn as any).apply(this, cbArgs);
        }
      : fn;
    return _setInterval(wrapped, ms, ...args);
  };
  // setTimeout 래핑 (>500ms만 — 짧은 yield/throttle은 노이즈)
  const _setTimeout = window.setTimeout.bind(window);
  (window as any).setTimeout = function (fn: any, ms?: number, ...args: any[]) {
    if (typeof fn !== 'function' || typeof ms !== 'number' || ms < 500) return _setTimeout(fn, ms as any, ...args);
    const caller = getCaller().substring(0, 80);
    const wrapped = function (this: any, ...cbArgs: any[]) {
      w.__lastBackgroundTask = `timeout(${ms}ms):${caller}`;
      return (fn as any).apply(this, cbArgs);
    };
    return _setTimeout(wrapped, ms, ...args);
  };
  // MutationObserver 래핑
  const OrigMO = window.MutationObserver;
  if (OrigMO) {
    (window as any).MutationObserver = class WrappedMutationObserver extends OrigMO {
      constructor(cb: MutationCallback) {
        const caller = getCaller().substring(0, 80);
        super((muts: MutationRecord[], obs: MutationObserver) => {
          w.__lastBackgroundTask = `observer:${caller}`;
          cb(muts, obs);
        });
      }
    } as any;
  }
  // IntersectionObserver / ResizeObserver도 동일 패턴
  if (typeof (window as any).IntersectionObserver === 'function') {
    const OrigIO = (window as any).IntersectionObserver;
    (window as any).IntersectionObserver = class WrappedIO extends OrigIO {
      constructor(cb: any, opts?: any) {
        const caller = getCaller().substring(0, 80);
        super((entries: any, obs: any) => {
          w.__lastBackgroundTask = `intersect:${caller}`;
          cb(entries, obs);
        }, opts);
      }
    };
  }
  if (typeof (window as any).ResizeObserver === 'function') {
    const OrigRO = (window as any).ResizeObserver;
    (window as any).ResizeObserver = class WrappedRO extends OrigRO {
      constructor(cb: any) {
        const caller = getCaller().substring(0, 80);
        super((entries: any, obs: any) => {
          w.__lastBackgroundTask = `resize:${caller}`;
          cb(entries, obs);
        });
      }
    };
  }
  console.warn('[PerfDebug] Auto task markers 등록 (setInterval/setTimeout>=500/MutationObserver/IntersectionObserver/ResizeObserver)');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [v2.10.109] 메모리/DOM 누수 진단 도구 — 사용자 보고: 작동할수록 점진적 느려짐.
//   원인 후보: DOM 누수, listener 누수, MutationObserver 누수, 메모리 누수.
//   진단 방식:
//     - 매 클릭 후 0.5초에 스냅샷 (어떤 인터랙션이 누수 만드는지 식별)
//     - 10초마다 주기 스냅샷 (백그라운드 누수 식별)
//   콘솔에 DOM element 수 + 메모리(MB) + delta 출력.
//   사용자가 환경설정 열고/닫고/버튼 누르고 → 어느 시점에 +N 큰지 보면 즉시 진단.
// ═══════════════════════════════════════════════════════════════════════════════
(function setupMemoryMonitor() {
  // [v2.10.110] opt-in으로 전환 — 기본 OFF.
  //   진단 도구 자체가 매 클릭 querySelectorAll('*') + 30초마다 풀스캔 → DOM 클수록 비용 폭증.
  //   필요 시: DevTools 콘솔에서 `window.__ECC_MEM_MONITOR = true` 후 reload.
  if (!(window as any).__ECC_MEM_MONITOR) return;
  // 진단 도구 자체 누수 방지: reload 시 이전 interval 정리.
  const prev = (window as any).__memoryMonitorIntervalId;
  if (prev) { try { clearInterval(prev); } catch { /* ignore */ } }
  let _lastSnapshot = { elements: 0, mem: 0 };
  let _snapshotCount = 0;
  const snapshot = (label: string) => {
    try {
      const elements = document.querySelectorAll('*').length;
      const memInfo = (performance as any).memory;
      const mem = memInfo ? Math.round(memInfo.usedJSHeapSize / 1024 / 1024) : 0;
      const deltaEl = elements - _lastSnapshot.elements;
      const deltaMem = mem - _lastSnapshot.mem;
      // 첫 스냅샷은 baseline, 그 다음부터 delta 의미 있음
      if (_snapshotCount > 0) {
        const elArrow = deltaEl > 100 ? '🚨' : deltaEl > 30 ? '⚠️' : deltaEl > 0 ? '+' : '';
        const memArrow = deltaMem > 10 ? '🚨' : deltaMem > 3 ? '⚠️' : deltaMem > 0 ? '+' : '';
        console.warn(
          `[Monitor ${label}] DOM=${elements} ${elArrow}${deltaEl > 0 ? '+' : ''}${deltaEl}  Mem=${mem}MB ${memArrow}${deltaMem > 0 ? '+' : ''}${deltaMem}`
        );
      } else {
        console.warn(`[Monitor ${label}] baseline DOM=${elements} Mem=${mem}MB`);
      }
      _lastSnapshot = { elements, mem };
      _snapshotCount++;
    } catch { /* ignore */ }
  };
  // [v2.10.110] click snapshot throttle — 진단 도구 자체가 progressive slowdown 원인이었음.
  //   snapshot()은 querySelectorAll('*')로 DOM 전체 스캔(O(N)). 매 클릭 호출 시 N 증가에 따라 비용 폭증.
  //   해결: 클릭 후 5초 이내 추가 클릭은 무시. 빠른 연타 시 진단 비용을 ~10x 감소.
  let _lastClickSnapshotAt = 0;
  document.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - _lastClickSnapshotAt < 5000) return; // throttle: 5초
    _lastClickSnapshotAt = now;
    const target = e.target as HTMLElement;
    const label = target?.id || target?.className?.toString().slice(0, 30) || target?.tagName || 'click';
    setTimeout(() => snapshot(`click:${label}`), 500);
  }, true);
  // 30초마다 주기 스냅샷 — 10s → 30s로 완화 (DOM 풀스캔 비용 ⅓)
  const intervalId = setInterval(() => snapshot('periodic-30s'), 30000);
  (window as any).__memoryMonitorIntervalId = intervalId;
  window.addEventListener('beforeunload', () => { try { clearInterval(intervalId); } catch { /* ignore */ } }, { once: true });
  // 초기 baseline은 init 완료 후 (DOMContentLoaded + 2s)
  setTimeout(() => snapshot('initial'), 2000);
})();

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [v2.10.106] 글로벌 img error 핸들러 — broken img 자동 숨김.
//   sonnet agent 분석: 6 파일의 19개 <img> 태그에 onerror 핸들러 없음.
//   삭제된 파일을 src로 가진 img가 ERR_FILE_NOT_FOUND 콘솔 오염 + 레이아웃 깨짐.
//   capture phase listener 1개로 모든 미처리 케이스 자동 처리 (인라인 추가 불필요).
//   Chromium 콘솔 출력 자체는 사용자 코드로 못 막지만 *시각적 broken 표시*는 차단.
// ═══════════════════════════════════════════════════════════════════════════════
(function setupGlobalImgErrorHandler() {
  // [v2.10.133 REVERT] localStorage 정리 제거 — v2.10.132 fix가 81ms LongTask 만듦 (회귀).
  //   500KB localStorage + 1000+ iteration이 main thread block.
  //   진짜 fix는 *근본적 변경* 필요 (chunked + idle callback) — Phase 1 영역.
  //   현재는 시각만 숨김 (v2.10.106 동작) + 콘솔 ERR는 cosmetic으로 양해.
  document.addEventListener('error', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && t.tagName === 'IMG') {
      const img = t as HTMLImageElement;
      if (img.style.display === 'none') return;
      img.style.display = 'none';
    }
  }, true /* capture phase — img error는 bubble 안 함 */);
})();

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [v2.10.90 PerfDebug] Long Task Observer — 50ms 이상 main thread 블로킹 작업 자동 감지
//   "응답 없음" 원인을 식별하려면 어떤 코드가 main thread를 얼마나 점유하는지 알아야 함.
//   PerformanceObserver의 'longtask' 항목은 *50ms 이상의 작업*을 자동 보고.
//   콘솔(F12)에서 [LongTask] 로그를 보면 그 시간대에 어떤 코드가 동기 실행 중인지 추적 가능.
// ═══════════════════════════════════════════════════════════════════════════════
// [Phase 0/v2.10.127] LongTask 진단 강화 — 마지막 사용자 액션 + attribution + 진단 hint.
//   기존: 시점/길이만. "17초 시점 212ms HEAVY"가 *무엇*인지 불명.
//   강화:
//     1. 마지막 click/focus event target/id 추적 (window.__lastUserAction)
//     2. Performance entry의 attribution 필드 (Chromium 표준 — script/iframe 출처)
//     3. LongTask 발생 시점과 마지막 액션의 *시간 차이* (즉시 클릭 후 vs 자동 polling 구분)
//     4. 자동 작업 마커 (window.__lastBackgroundTask — interval/setTimeout 식별용)
(function setupUserActionTracker() {
  const tracker = { type: '', target: '', id: '', ts: 0 };
  (window as any).__lastUserAction = tracker;
  const update = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    tracker.type = e.type;
    tracker.target = t.tagName?.toLowerCase() || '?';
    tracker.id = t.id || t.className?.toString().slice(0, 40) || '';
    tracker.ts = performance.now();
  };
  document.addEventListener('click', update, true);
  document.addEventListener('focusin', update, true);
  document.addEventListener('change', update, true);
  document.addEventListener('keydown', update, true);
})();

(function setupLongTaskObserver() {
  // ✅ [v2.10.223] LongTask 경고를 기본 silent. localStorage.debug_longtask='1' 일 때만 출력
  //   기존: console.warn으로 50ms+ 모든 작업 보고 → 풀오토/다중계정 발행 시
  //   sharp 이미지 처리, base64 디코딩 등이 매번 50ms 넘겨서 콘솔 도배 →
  //   [DeepInfra] 같은 진단 로그가 묻혀버림. 디버그 모드에서만 활성화하도록 변경.
  try {
    if (typeof PerformanceObserver === 'undefined') return;
    const debugEnabled = (() => {
      try { return localStorage.getItem('debug_longtask') === '1'; } catch { return false; }
    })();
    if (!debugEnabled) {
      // 평소엔 observer 등록 자체를 안 함 → 콘솔 깨끗
      return;
    }
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const dur = entry.duration;
        if (dur < 50) continue;
        const level = dur > 500 ? '🚨 SEVERE' : dur > 200 ? '🐌 HEAVY' : '⚠️';
        const startMs = entry.startTime;
        const ua = (window as any).__lastUserAction as { type: string; target: string; id: string; ts: number };
        let userCtx = '';
        if (ua && ua.ts > 0) {
          const deltaMs = (startMs - ua.ts).toFixed(0);
          userCtx = ` | 직전 ${ua.type}:${ua.target}#${ua.id || '<none>'} (${deltaMs}ms 전)`;
        }
        const attribution = (entry as any).attribution as Array<{ containerType?: string; containerSrc?: string; containerId?: string; containerName?: string; name?: string }> | undefined;
        let attrCtx = '';
        if (Array.isArray(attribution) && attribution.length > 0) {
          const a = attribution[0];
          attrCtx = ` | attribution:${a.containerType || '?'}/${a.containerName || a.containerId || a.containerSrc || a.name || '?'}`;
        }
        const bgTask = (window as any).__lastBackgroundTask;
        let bgCtx = '';
        if (bgTask && typeof bgTask === 'string') bgCtx = ` | bg:${bgTask}`;
        console.warn(
          `[LongTask] ${level} main thread 블로킹 ${dur.toFixed(0)}ms (start=${startMs.toFixed(0)}ms)${userCtx}${attrCtx}${bgCtx}`,
        );
      }
    });
    obs.observe({ type: 'longtask', buffered: true });
    console.log('[PerfDebug] LongTask observer 등록 — debug_longtask=1 (활성화됨)');
  } catch (e) {
    // 등록 실패는 silent — 진단 logger 자체가 콘솔 노이즈가 되면 안 됨
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-02-17] 중복 로그인 감지 시 강제 로그아웃 처리
// ═══════════════════════════════════════════════════════════════════════════════
(function setupSessionForceLogoutListener() {
  if (window.api && typeof window.api.onSessionForceLogout === 'function') {
    window.api.onSessionForceLogout((data: { message: string }) => {
      console.warn('[Session] 강제 로그아웃:', data.message);
      // ✅ [2026-02-26] 계정별 세팅 해제
      accountLogout().catch(() => { });
      // 라이선스 정보 초기화
      if (window.api.clearLicense) {
        window.api.clearLicense().catch(() => { });
      }
      // 사용자에게 알림 후 로그인 화면으로 이동
      alert(data.message || '다른 기기에서 로그인하여 현재 세션이 종료되었습니다.');
      window.location.reload();
    });
    console.log('[Session] 중복 로그인 감지 리스너 등록 완료');
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-02-05] 앱 버전 표시 - 메인 창 헤더에 버전 표시
// ═══════════════════════════════════════════════════════════════════════════════
(async function loadAppVersion() {
  try {
    const version = await window.api.getAppVersion();
    const badge = document.getElementById('app-version-badge');
    if (badge && version) {
      badge.textContent = `v${version}`;
      console.log(`[App] 버전: v${version}`);
    }
  } catch (error) {
    console.error('[App] 버전 로드 실패:', error);
  }
})();




// ✅ [Stability] 앱 종료 시 메모리 정리 등록
window.addEventListener('beforeunload', () => {
  cleanupAllMemoryManagers();
});



import type { AppConfig } from '../configManager.js';
import { initClockAndCalendar, externalLinks, loadCalendarMemo, saveCalendarMemo } from './scheduleAndUI.js';


document.addEventListener('DOMContentLoaded', () => {
  initCategorySelectionListener(); // ✅ 카테고리 모달 이벤트 리스너
  initHeadingImageButton();
  initSettingsModalFunc(); // ✅ [2026-01-25] 환경설정 모달 초기화

  // ✅ [v2.10.185 Phase 3.5] SERP 실측 비교 버튼 + 모달 wiring
  initSerpBenchmarkUI();

  // ✅ [v2.10.189] LEWORD redirect 버튼 wiring (키워드 분석 deprecation 안내)
  const lewordRedirectBtn = document.getElementById('leword-redirect-btn');
  if (lewordRedirectBtn) {
    lewordRedirectBtn.addEventListener('click', async () => {
      try {
        await (window as any).api.openExternalUrl('https://www.leaderspro.kr/leword');
      } catch (err) {
        console.error('[LEWORD] 사이트 열기 실패:', err);
        alert('LEWORD 사이트 열기 실패: ' + (err as Error).message);
      }
    });
  }

  // ✅ [v2.10.191 Phase 3.8.3] SERP 추이 서브탭 wiring
  initSerpHistoryPanel();

  // ✅ [2026-01-25] 환경설정 저장 버튼 이벤트 리스너 (CSP 우회)
  const saveBtn = document.getElementById('save-settings-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      console.log('[Settings] 💾 저장 버튼 클릭됨 (DOMContentLoaded)');
      if (typeof (window as any).saveSettingsHandler === 'function') {
        (window as any).saveSettingsHandler();
      } else {
        console.error('[Settings] ❌ saveSettingsHandler 함수를 찾을 수 없음');
      }
    });
    console.log('[Settings] ✅ 저장 버튼 이벤트 리스너 등록 완료');
  }

  // ✅ 취소 버튼도 등록
  const cancelBtn = document.querySelector('#settings-modal button[onclick*="closeSettingsModal"]');
  if (cancelBtn) {
    cancelBtn.removeAttribute('onclick');
    cancelBtn.addEventListener('click', () => {
      if (typeof (window as any).closeSettingsModal === 'function') {
        (window as any).closeSettingsModal();
      }
    });
  }
});
// ✅ [2026-03-23] 중복 unhandledrejection 리스너 제거됨
// → L220 IIFE의 window.onunhandledrejection이 1차 처리
// → L10093 registerGlobalErrorHandlers()가 2차 처리 (로깅 + appendLog)
// → 여기서 3번째로 등록하면 사용자에게 Toast가 중복 표시되므로 제거


initAllAppEventHandlers();

declare global {
  function updateReserveImagesThumbnails(): void;
  function showHeadingSelectionModalV2(image: any, currentIndex: number): Promise<void>;
  function regenerateWithNewAI(index: number, heading: string): Promise<void>;
  function showSavedImagesForReplace(targetIndex: number): Promise<void>;
  function initDashboard(): void;
  function initTabSwitching(): void;
  function initUnifiedImageEventHandlers(): void;
  function displayGeneratedImages(images: any[]): void;
  function updatePromptItemsWithImages(images: any[]): void;
  function autoAnalyzeHeadings(structuredContent: any): Promise<void>;
  function generateImagePromptByIndex(heading: string, index: number, blogTitle?: string): string;
  function generateImagen4ImageLocal(prompt: string, isRegenerate?: boolean): Promise<string>;
  function searchNaverImage(prompt: string, isRegenerate?: boolean): Promise<string>;
  function generateNanoBananaProImage(prompt: string, headingOrRegenerate?: string | boolean, isRegenerate?: boolean): Promise<string>;
  function generateEnglishPromptForHeadingSync(heading: string): string;
  function initMultiAccountManager(): Promise<void>;
  // ✅ [2026-01-25] 환경설정 저장/닫기 전역 함수
  function saveSettingsHandler(): void;
  function closeSettingsModal(): void;
}




// 전역 진행상황 모달 인스턴스
let progressModal: ProgressModal | null = null;
// clockIntervalId는 dashboardUI.ts에서 선언됨 (전역 스코프 공유)
declare let clockIntervalId: ReturnType<typeof setInterval> | null;

function getProgressModal(): ProgressModal {
  if (!progressModal) {
    progressModal = new ProgressModal();
  }
  return progressModal;
}




function readUnifiedCtasFromUi(): Array<{ text: string; link?: string }> {
  const container = document.getElementById('unified-cta-items-container');
  const items: Array<{ text: string; link?: string }> = [];

  // 1. 새 row UI에서 읽기
  if (container) {
    const rows = Array.from(container.querySelectorAll('.unified-cta-item')) as HTMLElement[];
    for (const row of rows) {
      const textEl = row.querySelector('.unified-cta-text') as HTMLInputElement | null;
      const linkEl = row.querySelector('.unified-cta-link') as HTMLInputElement | null;
      const text = String(textEl?.value || '').trim();
      const link = String(linkEl?.value || '').trim();
      if (text) items.push({ text, link: link || undefined });
    }
  }

  // 2. 레거시 입력도 항상 읽기 (새 row가 비어있거나 없을 때)
  const legacyText = (document.getElementById('unified-cta-text') as HTMLInputElement | null)?.value?.trim() || '';
  const legacyLink = (document.getElementById('unified-cta-link') as HTMLInputElement | null)?.value?.trim() || '';

  if (legacyText) {
    // 레거시 입력에 값이 있으면 추가 (중복 방지: 같은 텍스트가 없을 때만)
    const alreadyExists = items.some(item => item.text === legacyText);
    if (!alreadyExists) {
      items.push({ text: legacyText, link: legacyLink || undefined });
    }
  }

  return items;
}


// RendererAutomationPayload 타입은 global.d.ts에서 정의됨

// 기본 요소 참조
const form = document.getElementById('automation-form') as HTMLFormElement;
const runButton = document.getElementById('run-button') as HTMLButtonElement;
const publishOnlyButton = document.getElementById('publish-only-button') as HTMLButtonElement;
const cancelButton = document.getElementById('cancel-button') as HTMLButtonElement;
const publishModeSelect = document.getElementById('publish-mode-select') as HTMLSelectElement;
const unifiedPublishModeInput = document.getElementById('unified-publish-mode') as HTMLInputElement;
const scheduleDateContainer = document.getElementById('schedule-date-container') as HTMLDivElement;
const scheduleDateInput = document.getElementById('schedule-date') as HTMLInputElement;
const logOutput = document.getElementById('log-output') as HTMLElement;
const progressContainer = document.getElementById('progress-container') as HTMLDivElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;
const progressStatus = document.getElementById('progress-status') as HTMLSpanElement;

// 위험 지표 요소
const riskSummaryElement = document.getElementById('risk-summary') as HTMLElement || document.getElementById('risk-summary-fixed') as HTMLElement;
const riskAiValue = (document.querySelector('[data-risk-ai]') as HTMLElement) ?? null;
const riskLegalValue = (document.querySelector('[data-risk-legal]') as HTMLElement) ?? null;
const riskSeoValue = (document.querySelector('[data-risk-seo]') as HTMLElement) ?? null;
const riskDailyValue = (document.querySelector('[data-risk-daily]') as HTMLElement) ?? null;
const riskWarning = (document.querySelector('[data-risk-warning]') as HTMLElement) ?? null;

// 우측 상단 고정 버튼들
const licenseButtonFixed = document.getElementById('license-button-fixed') as HTMLButtonElement;
const settingsButtonFixed = document.getElementById('settings-button-fixed') as HTMLButtonElement;
const externalLinksButtonFixed = document.getElementById('external-links-button-fixed') as HTMLButtonElement;

// 모달들
const licenseModal = document.getElementById('license-modal') as HTMLDivElement;
const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
const externalLinksModal = document.getElementById('external-links-modal') as HTMLDivElement;
const calendarDateModal = document.getElementById('calendar-date-modal') as HTMLDivElement;

// 시계와 달력 초기화
if (typeof window !== 'undefined') {
  initClockAndCalendar();
}

// ============================================
// 날짜 형식 변환 헬퍼 함수
// ============================================



// API 키들을 자동으로 로드하는 함수
// ✅ 배포 시 안전: API 키는 사용자 로컬 설정 파일(settings.json)에만 저장됨
// ✅ 소스 코드에 API 키가 포함되지 않음
async function autoLoadApiKeys() {
  console.log('[AutoLoad] API 키 자동 로드 시작');

  try {
    // 현재 설정 로드
    console.log('[AutoLoad] 설정 로드 시작...');
    const currentConfig = await window.api.getConfig();

    if (!currentConfig) {
      console.warn('[AutoLoad] ⚠️ 설정이 null 또는 undefined입니다.');
      return;
    }

    console.log('[AutoLoad] 현재 설정 로드 성공:', Object.keys(currentConfig || {}).length, '개 항목');

    // 저장된 API 키들 확인
    const apiKeyFields = [
      'openai-image-api-key', 'leonardoai-api-key',
      'perplexity-api-key', // ✅ [2026-01-25] Perplexity API 키 추가
      'naver-client-id', 'naver-client-secret', // ✅ [2026-01-25] 네이버 검색 API 키 추가
      'naver-ad-api-key', 'naver-ad-secret-key', 'naver-ad-customer-id', // ✅ [2026-01-25] 네이버 광고 API 키 추가
    ];

    for (const key of apiKeyFields) {
      if (currentConfig[key] && currentConfig[key].trim() !== '') {
        console.log(`[AutoLoad] ${key} 이미 설정됨`);

        // 입력 필드에 값 설정
        const input = document.getElementById(key) as HTMLInputElement;
        if (input) {
          input.value = currentConfig[key];
        }
      } else {
        console.log(`[AutoLoad] ${key} 미설정 - 환경설정에서 입력 필요`);
      }
    }

    console.log('[AutoLoad] API 키 로드 완료 ✅');

  } catch (error) {
    const errorMsg = (error as Error).message || '알 수 없는 오류';
    console.error('[AutoLoad] ❌ API 키 자동 로드 실패:', errorMsg);
    // 오류가 발생해도 앱은 계속 실행되도록 함 (치명적이지 않음)
  }
}

// 여러 방식으로 이벤트 리스너 연결 시도
function setupHeaderButtons() {
  console.log('[Setup] 헤더 버튼 설정 시작');

  const settingsButton = document.getElementById('settings-button-fixed') as HTMLButtonElement;
  const externalLinksButton = document.getElementById('external-links-button-fixed') as HTMLButtonElement;
  const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
  const externalLinksModal = document.getElementById('external-links-modal') as HTMLDivElement;

  console.log('[Setup] ===== 상세 DOM 요소 분석 =====');
  console.log('[Setup] settingsButton:', settingsButton);
  console.log('[Setup] settingsButton.tagName:', settingsButton?.tagName);
  console.log('[Setup] settingsButton.id:', settingsButton?.id);
  console.log('[Setup] settingsButton.className:', settingsButton?.className);

  console.log('[Setup] externalLinksButton:', externalLinksButton);
  console.log('[Setup] externalLinksButton.tagName:', externalLinksButton?.tagName);
  console.log('[Setup] externalLinksButton.id:', externalLinksButton?.id);
  console.log('[Setup] externalLinksButton.className:', externalLinksButton?.className);

  console.log('[Setup] settingsModal:', settingsModal);
  console.log('[Setup] settingsModal.tagName:', settingsModal?.tagName);
  console.log('[Setup] settingsModal.id:', settingsModal?.id);
  console.log('[Setup] settingsModal.className:', settingsModal?.className);
  console.log('[Setup] settingsModal.style.display (현재):', settingsModal?.style.display);
  console.log('[Setup] settingsModal.getAttribute(aria-hidden):', settingsModal?.getAttribute('aria-hidden'));

  console.log('[Setup] externalLinksModal:', externalLinksModal);
  console.log('[Setup] externalLinksModal.tagName:', externalLinksModal?.tagName);
  console.log('[Setup] externalLinksModal.id:', externalLinksModal?.id);
  console.log('[Setup] externalLinksModal.className:', externalLinksModal?.className);
  console.log('[Setup] externalLinksModal.style.display (현재):', externalLinksModal?.style.display);
  console.log('[Setup] externalLinksModal.getAttribute(aria-hidden):', externalLinksModal?.getAttribute('aria-hidden'));

  console.log('[Setup] ===== CSS 스타일 확인 =====');
  if (settingsModal) {
    const computedStyle = window.getComputedStyle(settingsModal);
    console.log('[Setup] settingsModal computed style:');
    console.log('  display:', computedStyle.display);
    console.log('  visibility:', computedStyle.visibility);
    console.log('  opacity:', computedStyle.opacity);
    console.log('  z-index:', computedStyle.zIndex);
    console.log('  position:', computedStyle.position);
  }

  if (externalLinksModal) {
    const computedStyle = window.getComputedStyle(externalLinksModal);
    console.log('[Setup] externalLinksModal computed style:');
    console.log('  display:', computedStyle.display);
    console.log('  visibility:', computedStyle.visibility);
    console.log('  opacity:', computedStyle.opacity);
    console.log('  z-index:', computedStyle.zIndex);
    console.log('  position:', computedStyle.position);
  }

  // [v2.10.110] 환경설정 버튼 핸들러 중복 제거 — settingsModal.ts:289가 단독 처리.
  // 이전: onclick + addEventListener + 강제 inline style + 15+ console.log + getComputedStyle reflow
  //       → 클릭마다 3핸들러 실행 + 매번 reflow → 환경설정 후 체감 slowdown 원인
  // 현재: settingsModal.ts initSettingsModal()의 단일 click listener가 openSettingsModal() 호출.
  //       openSettingsModal()이 display:flex + 상태 리셋을 자체 수행하므로 강제 style 불필요.
  if (!settingsButton) {
    console.debug('[Setup] settingsButton이 존재하지 않음 (레거시 - 무시 가능)');
  }

  // [v2.10.110] 외부유입 버튼 — 디버그 reflow 패턴 제거.
  // 이전: dev 모드에서 getComputedStyle + 6 inline style write + 15+ console.log + isPackaged() IPC
  //       → 클릭마다 강제 reflow + IPC round-trip
  // 현재: production/dev 통합 단일 경로. CSS class로 표시 토글.
  if (externalLinksButton) {
    externalLinksButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (externalLinksModal) {
        externalLinksModal.setAttribute('aria-hidden', 'false');
        externalLinksModal.style.display = 'flex';
      }
    };
  } else {
    console.debug('[Setup] externalLinksButton이 존재하지 않음 (레거시 - 무시 가능)');
  }

  // ✅ [2026-04-03] 트레이 아이콘화 버튼
  const minimizeToTrayBtn = document.getElementById('minimize-to-tray-btn');
  if (minimizeToTrayBtn) {
    minimizeToTrayBtn.addEventListener('click', async () => {
      try {
        await (window as any).api.minimizeToTray();
      } catch (err) {
        console.error('[Tray] 트레이 숨기기 실패:', err);
      }
    });
    console.log('[Setup] 트레이 숨기기 버튼 이벤트 연결됨');
  }
}

// 여러 타이밍에 이벤트 리스너 연결 시도 (중복 방지)
// 첫 번째 DOMContentLoaded 리스너는 setupHeaderButtons만 담당
// 중복 방지 플래그를 사용하지 않고, 두 번째 리스너보다 먼저 실행되도록 함
document.addEventListener('DOMContentLoaded', () => {
  console.log('[DOMContentLoaded] 헤더 버튼 초기화 시작');

  // 헤더 버튼 설정만 담당 (다른 초기화와 충돌 없음)
  setTimeout(() => {
    setupHeaderButtons();
    console.log('[DOMContentLoaded] 헤더 버튼 초기화 완료');

    // ✅ [2026-01-27] 연속 발행 시작 버튼 - 이벤트 리스너로 처리 (이중 호출 방지)
    const continuousBtn = document.getElementById('continuous-mode-start-btn');
    if (continuousBtn) {
      continuousBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('[Continuous] 버튼 클릭 - 이벤트 리스너');
        toggleContinuousModeModal();
      }, { capture: true }); // 캡처 단계에서 처리
      console.log('[DOMContentLoaded] 연속 발행 시작 버튼 이벤트 리스너 등록 완료');
    }
    // ✅ [2026-02-13] 연속발행/풀오토 키워드 제목 옵션 상호 배타 등록
    setupMutualExclusiveCheckboxes('continuous-keyword-as-title', 'continuous-keyword-title-prefix');
    setupMutualExclusiveCheckboxes('fullauto-keyword-as-title', 'fullauto-keyword-title-prefix');
    console.log('[DOMContentLoaded] 키워드 제목 옵션 상호배타 등록 완료');
  }, 50); // 두 번째 리스너보다 먼저 실행 (50ms vs 100ms)
});

// ✅ [2026-01-27] 문제가 되던 document.addEventListener('click') 핸들러 삭제
// - 이 핸들러가 모든 모달 클릭을 가로채서 연속발행, 달력, 풀오토 세팅 등이 열리지 않았음
// - 원래 백업(pre-pack-backup)에도 없던 코드였음


// 달력 날짜 메모 모달
const calendarDateCloseButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-close-calendar-date]'));
const selectedDateText = document.getElementById('selected-date-text') as HTMLHeadingElement;
const calendarDateMemoInput = document.getElementById('calendar-date-memo') as HTMLTextAreaElement;
const saveDateMemoBtn = document.getElementById('save-date-memo-btn') as HTMLButtonElement;
const calendarDatePostsList = document.getElementById('calendar-date-posts-list') as HTMLDivElement;



// 달력 날짜 모달 열기 함수 (window에 노출)
(window as any).openCalendarDateModal = (dateStr: string): void => {
  if (!calendarDateModal || !dateStr) return;

  const [year, month, day] = (dateStr || '').split('-').map(Number);
  const selectedDate = new Date(year, month - 1, day);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  // 날짜 텍스트 업데이트
  if (selectedDateText) {
    selectedDateText.textContent = `${year}년 ${month}월 ${day}일 ${weekdays[selectedDate.getDay()]}요일`;
  }

  // 해당 날짜의 메모 로드
  if (calendarDateMemoInput) {
    const memo = loadCalendarMemo(selectedDate);
    calendarDateMemoInput.value = memo;
  }

  // 해당 날짜의 발행 글 로드
  if (calendarDatePostsList) {
    const posts = loadPublishedPosts(selectedDate);
    if (posts.length > 0) {
      calendarDatePostsList.innerHTML = posts.map(post => `
        <div class="calendar-date-post-item" data-url="${post.url}">
          <h4>${post.title}</h4>
          <div class="post-time">발행 시간: ${post.time}</div>
        </div>
      `).join('');

      // 더블클릭 이벤트 추가
      calendarDatePostsList.querySelectorAll('.calendar-date-post-item').forEach(item => {
        item.addEventListener('dblclick', () => {
          const url = item.getAttribute('data-url');
          if (url) {
            window.open(url, '_blank');
          }
        });
      });
    } else {
      calendarDatePostsList.innerHTML = '<p class="calendar-date-empty">발행한 글이 없습니다.</p>';
    }
  }

  // 모달 열기
  calendarDateModal.setAttribute('aria-hidden', 'false');
  calendarDateModal.style.display = 'flex';
};

// 달력 날짜 메모 저장
if (saveDateMemoBtn && calendarDateMemoInput && selectedDateText) {
  saveDateMemoBtn.addEventListener('click', () => {
    const dateStr = selectedDateText.textContent;
    if (!dateStr) return;

    const match = dateStr.match(/(\d+)년\s+(\d+)월\s+(\d+)일/);
    if (match) {
      const [, year, month, day] = match.map(Number);
      const selectedDate = new Date(year, month - 1, day);
      const memo = calendarDateMemoInput.value.trim();
      saveCalendarMemo(selectedDate, memo);
      alert('✅ 메모가 저장되었습니다.');

      // 달력 위젯 새로고침
      const calendarWidgetEl = document.getElementById('calendar-widget');
      if (calendarWidgetEl) {
        initClockAndCalendar();
      }
    }
  });
}

// ✅ 달력 날짜 메모 삭제
const deleteDateMemoBtn = document.getElementById('delete-date-memo-btn') as HTMLButtonElement;
if (deleteDateMemoBtn && calendarDateMemoInput && selectedDateText) {
  deleteDateMemoBtn.addEventListener('click', () => {
    const dateStr = selectedDateText.textContent;
    if (!dateStr) return;

    const match = dateStr.match(/(\d+)년\s+(\d+)월\s+(\d+)일/);
    if (match) {
      if (!confirm('정말로 이 날짜의 메모를 삭제하시겠습니까?')) return;

      const [, year, month, day] = match.map(Number);
      const selectedDate = new Date(year, month - 1, day);

      // 메모 삭제 (빈 문자열로 저장)
      saveCalendarMemo(selectedDate, '');
      calendarDateMemoInput.value = '';
      alert('✅ 메모가 삭제되었습니다.');

      // 달력 위젯 새로고침
      const calendarWidgetEl = document.getElementById('calendar-widget');
      if (calendarWidgetEl) {
        initClockAndCalendar();
      }
    }
  });
}

// 달력 날짜 모달 닫기
calendarDateCloseButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (calendarDateModal) {
      calendarDateModal.setAttribute('aria-hidden', 'true');
      calendarDateModal.style.display = 'none';
    }
  });
});

// 모달 배경 클릭 시 닫기
if (calendarDateModal) {
  calendarDateModal.addEventListener('click', (e) => {
    if (e.target === calendarDateModal) {
      calendarDateModal.setAttribute('aria-hidden', 'true');
      calendarDateModal.style.display = 'none';
    }
  });
}

// 포스팅 완료 시 발행 글 저장 (자동화 완료 시)
if (typeof window !== 'undefined' && window.api) {
  window.api.onStatus((status: any) => {
    if (status.success) {
      const titleInput = document.getElementById('post-title') as HTMLInputElement;
      const title = titleInput?.value.trim();
      if (title) {
        const today = new Date();
        // ✅ 실제 발행 URL 사용
        const publishedUrl = status.url || `https://blog.naver.com/`;
        savePublishedPost(today, title, publishedUrl);

        // ✅ [v2.10.199 Phase 3.18.4] publishedPostTracker 자동 호출 — 실측 calibration 데이터 누적
        //   evaluator 결과 + publishedUrl 합쳐서 main 프로세스 저장
        //   blogId/logNo 자동 추출 (URL 형식: blog.naver.com/{blogId}/{logNo})
        try {
          const _last = (window as any).__lastGeneratedContent;
          if (_last && status.url && /blog\.naver\.com\/[^/?]+\/\d+/i.test(status.url)) {
            const _q = _last.quality || {};
            const _gate = _q.qualityGate;
            if (_gate && typeof _gate.finalScore === 'number') {
              (window as any).api.trackPublishedPost({
                publishedAt: new Date().toISOString(),
                keyword: _last.keyword || '',
                mode: _last.mode || 'seo',
                publishedUrl: status.url,
                title: _last.title || title,
                evaluator: {
                  finalScore: _gate.finalScore,
                  modeScore: _gate.modeScore,
                  safetyScore: _gate.safetyScore,
                  humanlikeScore: _gate.humanlikeScore,
                  decision: _gate.decision,
                  details: _q.qualityGateDetails || {},
                },
                serpBenchmark: _q.serpBenchmark,
              }).then((r: any) => {
                if (r?.ok) console.log('[PublishedTracker] ✅ 발행 추적 저장 (실측 calibration용):', r.id);
                else console.warn('[PublishedTracker] 저장 실패:', r?.error);
              }).catch((err: any) => console.warn('[PublishedTracker] IPC 실패:', err));
            }
          }
        } catch (trackErr) {
          console.warn('[PublishedTracker] 발행 추적 실패 (정상 흐름 유지):', trackErr);
        }

        // ✅ 현재 글에도 URL 저장
        if (status.url) {
          if (currentPostId) {
            updatePostAfterPublish(currentPostId, status.url);
          } else {
            // ✅ currentPostId가 없으면 제목으로 글 찾아서 URL 저장
            const posts = loadGeneratedPosts();
            const matchingPost = posts.find(p => p.title === title && !p.publishedUrl);
            if (matchingPost) {
              updatePostAfterPublish(matchingPost.id, status.url);
            }
          }
        }
      }
    }
  });
}

// 외부유입 링크 모달 초기화 (기존 코드와 연동)
const externalLinksTabsContainer = document.getElementById('external-links-tabs') as HTMLDivElement;
const externalLinksContentContainer = document.getElementById('external-links-content') as HTMLDivElement;

function initExternalLinksUI(): void {
  if (!externalLinksTabsContainer || !externalLinksContentContainer) return;

  // 이미 초기화되었으면 스킵
  if (externalLinksTabsContainer.hasAttribute('data-initialized')) {
    return;
  }
  externalLinksTabsContainer.setAttribute('data-initialized', 'true');

  const categories = Object.keys(externalLinks);

  // 탭 버튼 생성
  externalLinksTabsContainer.innerHTML = categories.map((category, index) => {
    return `<button type="button" class="link-tab-button ${index === 0 ? 'active' : ''}" data-link-category="${category}">${category}</button>`;
  }).join('');

  // 패널 생성
  externalLinksContentContainer.innerHTML = categories.map((category, index) => {
    return `
      <div class="links-grade-panel ${index === 0 ? 'active' : ''}">
        <div class="links-grid" id="links-grid-${category}"></div>
      </div>
    `;
  }).join('');

  // 첫 번째 카테고리 렌더링
  if (categories.length > 0) {
    renderExternalLinks(categories[0]);
  }

  // 탭 전환 이벤트 리스너 설정
  externalLinksTabsContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('link-tab-button')) {
      const category = target.getAttribute('data-link-category');
      if (category) {
        // 모든 탭 비활성화
        externalLinksTabsContainer.querySelectorAll('.link-tab-button').forEach(btn => {
          btn.classList.remove('active');
        });
        // 클릭한 탭 활성화
        target.classList.add('active');

        // 모든 패널 숨기기
        externalLinksContentContainer.querySelectorAll('.links-grade-panel').forEach(panel => {
          panel.classList.remove('active');
        });
        // 해당 패널 표시
        const panel = document.getElementById(`links-grid-${category}`)?.parentElement;
        if (panel) {
          panel.classList.add('active');
        }

        // 링크 렌더링
        renderExternalLinks(category);
      }
    }
  });
}

function renderExternalLinks(category: string): void {
  const links = externalLinks[category as keyof typeof externalLinks];
  if (!links) return;

  const gridId = `links-grid-${category}`;
  const grid = document.getElementById(gridId);

  if (!grid) return;

  grid.innerHTML = links.map(link => {
    const url = link.url.startsWith('http') ? link.url : `https://${link.url}`;
    return `
      <a href="${url}" target="_blank" rel="noopener noreferrer" class="external-link-item" data-external-url="${url}">
        <span class="link-name">${link.name}</span>
        <span class="link-url">${url}</span>
      </a>
    `;
  }).join('');

  // 외부 링크 클릭 이벤트 추가
  grid.querySelectorAll('.external-link-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      const url = (item as HTMLElement).getAttribute('data-external-url');
      if (url && window.api.openExternalUrl) {
        try {
          const result = await window.api.openExternalUrl(url);
          if (!result.success) {
            console.error('외부 URL 열기 실패:', result.message);
            // 실패 시 새 탭으로 열기 시도
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        } catch (error) {
          console.error('외부 URL 열기 오류:', error);
          // 오류 발생 시 새 탭으로 열기 시도
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      } else if (url) {
        // API가 없는 경우 새 탭으로 열기
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  });
}

// 외부유입 링크 모달 초기화
if (externalLinksTabsContainer && externalLinksContentContainer) {
  initExternalLinksUI();
}

// 환경설정 모달 (기존 코드와 연동)
const settingsButton = document.getElementById('settings-button') as HTMLButtonElement;
const openSettingsFromLicense = document.getElementById('open-settings-from-license') as HTMLButtonElement;
const closeSettingsButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-close-settings]'));

if (settingsButton) {
  settingsButton.addEventListener('click', () => {
    if (settingsModal) {
      settingsModal.setAttribute('aria-hidden', 'false');
      settingsModal.style.display = 'flex';
    }
  });
}

if (openSettingsFromLicense) {
  openSettingsFromLicense.addEventListener('click', () => {
    if (licenseModal) {
      licenseModal.setAttribute('aria-hidden', 'true');
      licenseModal.style.display = 'none';
    }
    if (settingsModal) {
      settingsModal.setAttribute('aria-hidden', 'false');
      settingsModal.style.display = 'flex';
    }
  });
}

closeSettingsButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    // [2026-05-27 작업 22] 모달 닫기 시 자동 저장 (저장/취소 버튼 제거 대체)
    try {
      if (typeof (window as any).saveSettingsHandler === 'function') {
        (window as any).saveSettingsHandler();
        console.log('[Settings] 💾 모달 닫기 → 자동 저장 호출');
      }
    } catch (e) {
      console.warn('[Settings] 자동 저장 실패 (무시):', e);
    }
    if (settingsModal) {
      settingsModal.setAttribute('aria-hidden', 'true');
      settingsModal.style.display = 'none';
    }
  });
});

// 외부유입 링크 모달 닫기
const openExternalLinksFromLicense = document.getElementById('open-external-links-from-license') as HTMLButtonElement;
const closeExternalLinksButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-close-external-links]'));

if (openExternalLinksFromLicense) {
  openExternalLinksFromLicense.addEventListener('click', async () => {
    // ✅ 라이선스 체크 완화 - 외부유입 모달 바로 표시
    console.log('[ExternalLinks] 외부유입 모달 열기 (라이선스 모달에서)');

    // 라이선스 확인은 로그만 남기고 모달은 항상 열기
    try {
      const licenseResult = await window.api.getLicense();
      if (licenseResult.license && licenseResult.license.expiresAt) {
        console.log('[ExternalLinks] 라이선스 만료일:', new Date(licenseResult.license.expiresAt).toLocaleDateString('ko-KR'));
      } else {
        console.log('[ExternalLinks] 라이선스 정보 없음 - 기본 모드로 진행');
      }
    } catch (licenseError) {
      console.warn('[ExternalLinks] 라이선스 확인 실패, 기본 모드로 진행:', licenseError);
    }

    // ✅ 외부유입 모달 항상 표시
    if (licenseModal) {
      licenseModal.setAttribute('aria-hidden', 'true');
      licenseModal.style.display = 'none';
    }
    if (externalLinksModal) {
      externalLinksModal.setAttribute('aria-hidden', 'false');
      externalLinksModal.style.display = 'flex';
    }
  });
}

closeExternalLinksButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (externalLinksModal) {
      externalLinksModal.setAttribute('aria-hidden', 'true');
      externalLinksModal.style.display = 'none';
    }
  });
});

// ============================================
// 폼 제출 및 자동화 실행 핵심 기능
// ============================================
// 전역 상태 관리
// ============================================
let currentStructuredContent: StructuredContent | null = null;
let generatedImages: Array<{ heading: string; filePath: string; previewDataUrl: string; provider: string; url?: string; savedToLocal?: boolean }> = [];
let automationRunning = false;
let currentPostId: string | null = null; // ✅ 현재 글 ID (이미지 폴더 정리용)

// ✅ 전역 상태 초기화 함수

function resetGlobalState(): void {
  console.log('[GlobalState] 전역 상태 초기화');
  currentStructuredContent = null;
  generatedImages = [];
  automationRunning = false;
  currentPostId = null;
  ImageManager.clear(); // ✅ 이미지 관리자도 초기화
}

// ✅ 전역 상태 설정 함수
function setGlobalState(key: 'content' | 'images' | 'running' | 'postId', value: any): void {
  switch (key) {
    case 'content':
      currentStructuredContent = value;
      console.log('[GlobalState] currentStructuredContent 설정됨', value?.selectedTitle || '(제목 없음)');
      break;
    case 'images':
      generatedImages = value || [];
      console.log('[GlobalState] generatedImages 설정됨:', generatedImages.length, '개');
      break;
    case 'running':
      automationRunning = value;
      console.log('[GlobalState] automationRunning:', value);
      break;
    case 'postId':
      currentPostId = value;
      console.log('[GlobalState] currentPostId 설정됨:', value);
      break;
  }
}

// ✅ 전역 상태 조회 함수
function getGlobalState<T>(key: 'content' | 'images' | 'running' | 'postId'): T {
  switch (key) {
    case 'content':
      return currentStructuredContent as T;
    case 'images':
      return generatedImages as T;
    case 'running':
      return automationRunning as T;
    case 'postId':
      return currentPostId as T;
    default:
      return null as T;
  }
}

// 연속 발행 관련 전역 변수
// ✅ [v1.4.59] let 복원 — ESLint prefer-const가 `declare let` 기반 재할당을 감지 못해 const로 잘못 변경했던 버그 수정
// 다른 모듈(continuousPublishing.ts 등)에서 이 변수들을 재할당하므로 반드시 let
let isContinuousMode = false;
let continuousCountdown = 0;
let continuousInterval: NodeJS.Timeout | null = null;
let continuousQueue: string[] = []; // 연속 발행할 URL/콘텐츠 큐
let __continuousV2Initialized = false; // V2 초기화 플래그

// 위험 지표 업데이트
function updateRiskIndicators(content: StructuredContent | null): void {
  // ✅ [v2.10.277] early return 제거 — quality 없어도 4개 지표 placeholder 표시
  //   글 불러오기 시 quality 누락된 옛날 글도 일일권장은 표시되어야 함
  const _quality = content?.quality;

  if (riskAiValue) {
    const risk = _quality?.aiDetectionRisk;
    if (risk) {
      // [2026-06-30] 'high'는 내부 휴리스틱 품질 라벨(진짜 외부 AI 탐지기 아님)인데
      //   '높음' 표기가 사용자 불안·민원을 유발 → 사용자 표기는 '보통'까지만 노출한다.
      //   내부 로직(재생성/faithfulness 게이트)은 high를 그대로 사용하므로 품질은 영향 없음.
      const displayRisk = risk === 'high' ? 'medium' : risk;
      riskAiValue.textContent = displayRisk === 'low' ? '낮음' : '보통';
      riskAiValue.className = `value risk-${displayRisk}`;
    } else {
      riskAiValue.textContent = '-';
      riskAiValue.className = 'value risk-unknown';
    }
  }

  if (riskLegalValue) {
    const risk = _quality?.legalRisk;
    if (risk) {
      riskLegalValue.textContent = risk === 'safe' ? '안전' : risk === 'caution' ? '주의' : '위험';
      riskLegalValue.className = `value legal-${risk}`;
    } else {
      riskLegalValue.textContent = '-';
      riskLegalValue.className = 'value legal-unknown';
    }
  }

  if (riskSeoValue) {
    const _gate = (_quality as any)?.qualityGate;
    if (_gate && typeof _gate.finalScore === 'number') {
      const _decisionLabel = _gate.decision === 'pass' ? '✓통과'
        : _gate.decision === 'patch' ? '⚙수정'
        : '↻재생성';
      const _modeScore = typeof _gate.modeScore === 'number' ? ` · 모드 ${_gate.modeScore}` : '';
      const _seoScore = typeof _quality?.seoScore === 'number' ? ` · SEO ${_quality.seoScore}` : '';
      riskSeoValue.textContent = `${_gate.finalScore}/100 (${_decisionLabel})${_modeScore}${_seoScore}`;
    } else if (_quality && typeof _quality.seoScore === 'number') {
      riskSeoValue.textContent = `${_quality.seoScore}/100`;
    } else {
      riskSeoValue.textContent = '-/100';
    }
  }

  // ✅ [v2.10.185 Phase 3.5] SERP 실측 비교 버튼 활성화 + 데이터 동봉
  //   글 생성 완료 시 본문/키워드를 글로벌 변수에 저장 → 사용자가 버튼 클릭 시 사용
  try {
    const _serpBtn = document.getElementById('serp-benchmark-btn') as HTMLButtonElement | null;
    if (_serpBtn && content?.bodyPlain && content.bodyPlain.length >= 100) {
      (window as any).__lastGeneratedContent = {
        body: content.bodyPlain,
        title: content.selectedTitle || '',
        keyword: (content as any).primaryKeyword || (content as any).keyword || '',
        mode: (content as any).contentMode || 'seo',
        autoSerpResult: (content.quality as any)?.serpBenchmark || null,
      };
      _serpBtn.style.display = 'inline-flex';
    }
  } catch { /* UI 갱신 실패는 무시 */ }

  // ✅ [v2.10.188 Phase 3.7.1] 자동 SERP 결과 알림 카드
  //   조건: quality.serpBenchmark 있고 ranking이 below_median 또는 below_25th면 자동 알림
  //   사용자가 즉시 "내 글이 상위 노출 글보다 부족한 부분"을 인식하도록
  try {
    const _autoSerp = (content?.quality as any)?.serpBenchmark;
    if (_autoSerp && (_autoSerp.ranking === 'below_median' || _autoSerp.ranking === 'below_25th')) {
      showSerpAlertCard(_autoSerp);
    } else if (_autoSerp && (_autoSerp.ranking === 'above_median' || _autoSerp.ranking === 'near_median')) {
      showSerpAlertCard(_autoSerp, 'good');
    }
  } catch { /* 알림 실패는 무시 */ }

  if (riskDailyValue) {
    // Read from cached config (set at init time). Falls back to the HTML default "3회"
    // if config is not yet loaded, so no async IPC call is needed here.
    const _cfg = (window as any).appConfig;
    const _limit: number = _cfg?.dailyPostLimit ?? 3;
    riskDailyValue.textContent = `${_limit}회`;
  }

  if (riskSummaryElement) {
    riskSummaryElement.style.display = 'grid';
  }
}

// ✅ [2026-05-18] 발행 완료 후 4지표를 placeholder로 리셋 (값만 — 박스는 유지)
function resetRiskIndicators(): void {
  if (riskAiValue) {
    riskAiValue.textContent = '-';
    riskAiValue.className = 'value risk-unknown';
  }
  if (riskLegalValue) {
    riskLegalValue.textContent = '-';
    riskLegalValue.className = 'value legal-unknown';
  }
  if (riskSeoValue) {
    riskSeoValue.textContent = '-/100';
  }
  if (riskDailyValue) {
    const _cfg = (window as any).appConfig;
    const _limit: number = _cfg?.dailyPostLimit ?? 3;
    riskDailyValue.textContent = `${_limit}회`;
  }
}
(window as any).resetRiskIndicators = resetRiskIndicators;

// 진행 상태 업데이트
function updateProgress(percent: number, status: string): void {
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
  if (progressStatus) {
    progressStatus.textContent = status;
  }
  if (progressContainer) {
    progressContainer.style.display = percent > 0 ? 'block' : 'none';
  }
  async function runAutomation(skipImages: boolean = false): Promise<void> {
    if (automationRunning) {
      alert('이미 자동화가 실행 중입니다.');
      return;
    }

    const payload = collectFormData(skipImages);
    if (!payload) return;

    automationRunning = true;
    if (runButton) runButton.disabled = true;
    if (publishOnlyButton) publishOnlyButton.disabled = true;
    if (cancelButton) cancelButton.disabled = false;

    // ✅ 진행률 모달 표시
    const isPublishSkipped = !payload.publishMode || (payload as any).skipPublish === true;
    const isTextOnly = skipImages && isPublishSkipped;
    ((window as any).aiProgressModal).show('AI 글 생성 중...', {
      mode: isTextOnly ? 'textOnly' : 'fullFlow'
    });

    updateProgress(0, '자동화 준비 중...');
    appendLog('🚀 자동화를 시작합니다...');

    // ✅ [2026-01-20] 프리셋 썸네일 적용 (풀오토 모드)
    if ((payload as any).isFullAuto) {
      const preset = applyPresetThumbnailIfExists('full-auto');
      if (preset.applied) {
        // generatedImages[0]에 프리셋 썸네일 주입
        if (!payload.generatedImages || payload.generatedImages.length === 0) {
          payload.generatedImages = [preset.forHeading];
        } else {
          payload.generatedImages[0] = preset.forHeading;
        }
        // thumbnailPath도 설정 (쇼핑커넥트 대비)
        if (preset.forThumbnail) {
          payload.thumbnailPath = preset.forThumbnail;
        }
        appendLog('🎨 미리 세팅된 썸네일이 적용되었습니다!');
      }
    }

    try {
      const status = await window.api.runAutomation(payload);

      if (status.success) {
        appendLog('✅ 자동화가 성공적으로 완료되었습니다!');
        updateProgress(100, '완료');
        ((window as any).aiProgressModal).complete(true);

        // ✅ [Fix] 반자동 편집 미리보기 업데이트 (생성된 콘텐츠가 있으면)
        if ((status as any).structuredContent) {
          currentStructuredContent = (status as any).structuredContent;
          fillSemiAutoFields(currentStructuredContent);
          // 섹션 강제 표시
          const semiAutoElem = document.getElementById('unified-semi-auto-section');
          if (semiAutoElem) semiAutoElem.style.display = 'block';
        }

        // ✅ 어떤 모드든(즉시/임시/예약/글만) 성공 시 이미지 정보도 글목록에 저장
        try {
          const snapshot = (() => {
            try {
              const from = ImageManager.getAllImages();
              if (Array.isArray(from) && from.length > 0) return from;
            } catch (e) {
              console.warn('[renderer] catch ignored:', e);
            }
            const globalAll = (window as any).imageManagementGeneratedImages;
            if (Array.isArray(globalAll) && globalAll.length > 0) return globalAll;
            return generatedImages || [];
          })();

          if (currentPostId) {
            updatePostImages(currentPostId, snapshot);
          } else if (payload.title) {
            const posts = loadGeneratedPosts();
            const matchingPost = posts.find(p => p.title === payload.title);
            if (matchingPost) updatePostImages(matchingPost.id, snapshot);
          }
        } catch (e) {
          console.warn('[renderer] catch ignored:', e);
        }

        // 발행 글 저장
        if (payload.title) {
          const today = new Date();
          const defaultUrl = 'https://blog.naver.com/';
          savePublishedPost(today, payload.title, defaultUrl);
        }

        // ✅ [Fix] 발행/임시저장/예약 성공 시 자동으로 필드 초기화 (사용자 요청 반영)
        // 단, structuredContent만 받고 발행은 안 한 경우는 제외 (미리보기 모드)
        const isActualPublish = payload.publishMode === 'publish' || payload.publishMode === 'schedule' || payload.publishMode === 'draft';
        if (isActualPublish && status.success) {
          setTimeout(() => {
            resetAllFields();
            appendLog('🆕 다음 글 작성을 위해 필드가 초기화되었습니다.');
            if (typeof toastManager !== 'undefined') {
              toastManager.success('✅ 발행 완료! 새로운 글을 작성할 수 있습니다.');
            }
          }, 5000); // 5초 대기 (사용자가 성공 메시지를 볼 시간 충분히 부여)
        }
      } else {
        appendLog(`❌ 자동화 실패: ${status.message || '알 수 없는 오류'}`);
        updateProgress(0, '실패');
        ((window as any).aiProgressModal).complete(false);
      }
    } catch (error) {
      appendLog(`❌ 오류 발생: ${(error as Error).message}`);
      updateProgress(0, '오류');
      ((window as any).aiProgressModal).complete(false);
    } finally {
      automationRunning = false;
      if (runButton) runButton.disabled = false;
      if (publishOnlyButton) publishOnlyButton.disabled = false;
      if (cancelButton) cancelButton.disabled = true;

      setTimeout(() => {
        updateProgress(0, '');
      }, 3000);
    }
  }

  // 자동화 취소
  async function cancelAutomation(): Promise<void> {
    if (!automationRunning) return;

    const confirmed = confirm('자동화를 취소하시겠습니까?');
    if (!confirmed) return;

    try {
      await window.api.cancelAutomation();
      appendLog('⏹️ 자동화가 취소되었습니다.');
      automationRunning = false;
      if (runButton) runButton.disabled = false;
      if (publishOnlyButton) publishOnlyButton.disabled = false;
      if (cancelButton) cancelButton.disabled = true;
      updateProgress(0, '취소됨');
    } catch (error) {
      appendLog(`❌ 취소 실패: ${(error as Error).message}`);
    }
  }

  // 로그 리스너
  if (typeof window !== 'undefined' && window.api) {
    window.api.onLog((message: string) => {
      handleVeoLogForOverlay(message);
      appendLog(message);

      // ✅ [2026-03-07] AI 진행률 모달 로그 브리지 (Main 프로세스 IPC 로그 → aiProgressModal)
      try {
        const aiModal = (window as any).aiProgressModal;
        if (aiModal && typeof aiModal.addLog === 'function') {
          const aiModalEl = document.getElementById('ai-progress-modal');
          if (aiModalEl && aiModalEl.style.display !== 'none') {
            aiModal.addLog(message);
          }
        }
      } catch (e) { /* 무시 */ }

      // ✅ [2026-02-22] 연속발행 모달 로그 브리지
      if (isContinuousMode) {
        try {
          updateContinuousProgressModal({ log: message });
        } catch (e) { /* 무시 */ }
      }

      // ✅ [2026-03-07] 다중계정 발행 모달 로그 브리지 (타임스탬프 + 컬러)
      try {
        const maModal = document.getElementById('ma-publish-progress-modal');
        if (maModal && maModal.style.display !== 'none') {
          const liveLog = document.getElementById('ma-live-log');
          if (liveLog) {
            const ts = new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            let logColor = '#94a3b8';
            if (message.includes('✅') || message.includes('완료')) logColor = '#10b981';
            else if (message.includes('❌') || message.includes('실패')) logColor = '#ef4444';
            else if (message.includes('⚠️')) logColor = '#f59e0b';
            const item = document.createElement('div');
            item.style.cssText = `line-height: 1.5; padding: 1px 0; border-bottom: 1px solid rgba(255,255,255,0.03);`;
            item.innerHTML = `<span style="color: rgba(255,255,255,0.3); font-size: 0.7rem; margin-right: 5px;">[${ts}]</span><span style="color: ${logColor}">${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
            liveLog.appendChild(item);
            while (liveLog.childElementCount > 150) {
              liveLog.removeChild(liveLog.firstElementChild as Element);
            }
            liveLog.scrollTop = liveLog.scrollHeight;
          }
        }
      } catch (e) { /* 무시 */ }

      // ✅ [Log Bridging] 자동화 실행 중이면(Main 프로세스 로그 포함) 모달에도 로그 출력
      if ((window as any).stopFullAutoPublish !== true) {
        try {
          const modal = getProgressModal();
          if (modal && modal.addLog) {
            modal.addLog(message);
          }
        } catch (e) {
          // 모달 접근 실패 시 무시
        }
      }
    });

    // ✅ [2026-03-02] 이미지 생성 실시간 로그 리스너 (429/503/쓰로틀 대기 등)
    if (window.api && window.api.on) {
      window.api.on('image-generation:log', (message: string) => {
        // ✅ [v1.4.37] DevTools 콘솔에도 출력 — 디버깅용 로그 수집 편의
        console.log(`[ImageGen] ${message}`);
        appendLog(`🖼️ ${message}`);
        if (isContinuousMode) {
          try { updateContinuousProgressModal({ log: `🖼️ ${message}` }); } catch { /* 무시 */ }
        }
      });

      // ✅ [v1.4.37] 메인 프로세스 콘솔 → 렌더러 DevTools 콘솔 미러링
      window.api.on('main:console', (data: { level: string; msg: string }) => {
        const fn = (data.level === 'warn' ? console.warn
                  : data.level === 'error' ? console.error
                  : console.log).bind(console);
        fn(`[MAIN] ${data.msg}`);
      });

      // ✅ [SPEC-IMAGE-RECOVERY-001 Phase 6 C1] 차단형 모달 IPC 수신 + 후속 동작 7종 실제 트리거
      // v2.10.85: dynamic import 제거 — 인라인 빌드에서 .js 파일 404 silent fail 방지.
      //   recoveryBlockingModal / RECOVERY_MODAL_PRESETS / handleRecoveryChoice는
      //   componentModules에 inline되어 같은 scope에 정의됨.
      window.api.on('recovery:show-modal', async (payload: { code: string; reason: string; errorCode?: string }) => {
        try {
          const code = payload.code as keyof typeof RECOVERY_MODAL_PRESETS;
          const preset = RECOVERY_MODAL_PRESETS[code];
          if (!preset) {
            console.warn('[Renderer] 알 수 없는 recovery 모달 코드:', payload.code);
            return;
          }
          const options = preset(payload.errorCode);
          const choice = await recoveryBlockingModal.show(code, options);
          console.log('[Renderer] Recovery 사용자 선택:', choice);

          // C1: 사용자 선택을 메인에 보고 (메트릭)
          if (window.api?.send) {
            window.api.send('recovery:user-choice', {
              code: payload.code,
              chosenId: choice.chosenId,
              choiceLabel: choice.choiceLabel,
            });
          }

          // C1: 사용자 선택에 따른 실제 후속 동작 트리거
          await handleRecoveryChoice(code, choice.chosenId, payload);
        } catch (e) {
          console.error('[Renderer] Recovery 모달 처리 실패:', e);
        }
      });
    }
    // ✅ 예약 발행 완료 후 자동 초기화 리스너
    if (window.api.on) {
      window.api.on('automation:reset-fields', () => {
        console.log('[Renderer] 예약 발행 완료 - 자동 초기화 시작');
        setTimeout(() => {
          resetAllFields();
          appendLog('🆕 다음 글 작성을 위해 필드가 초기화되었습니다.');
          toastManager.success('✅ 예약 발행 완료! 다음 글을 작성할 수 있습니다.');
        }, 2000); // 2초 후 초기화 (사용자가 완료 메시지를 볼 시간 제공)
      });
    }

    window.api.onStatus((status: any) => {
      if (status.success) {
        const titleInput = document.getElementById('post-title') as HTMLInputElement;
        const title = titleInput?.value.trim();
        if (title) {
          const today = new Date();
          // ✅ 실제 발행 URL 사용 (status에서 받아옴)
          const publishedUrl = status.url || 'https://blog.naver.com/';
          savePublishedPost(today, title, publishedUrl);

          // ✅ 현재 글에도 URL 저장
          if (status.url) {
            if (currentPostId) {
              updatePostAfterPublish(currentPostId, status.url, (document.getElementById('unified-publish-mode') as HTMLInputElement)?.value as any || undefined);
              appendLog(`📎 발행 URL이 저장되었습니다: ${status.url}`);

              // ✅ 발행/임시/예약 등 어떤 모드든 이미지도 함께 저장
              try {
                const snapshot = (() => {
                  try {
                    const from = ImageManager.getAllImages();
                    if (Array.isArray(from) && from.length > 0) return from;
                  } catch (e) {
                    console.warn('[renderer] catch ignored:', e);
                  }
                  const globalAll = (window as any).imageManagementGeneratedImages;
                  if (Array.isArray(globalAll) && globalAll.length > 0) return globalAll;
                  return generatedImages || [];
                })();
                updatePostImages(currentPostId, snapshot);
              } catch (e) {
                console.warn('[renderer] catch ignored:', e);
              }
            } else {
              // ✅ currentPostId가 없으면 제목으로 글 찾아서 URL 저장
              const posts = loadGeneratedPosts();
              const matchingPost = posts.find(p => p.title === title && !p.publishedUrl);
              if (matchingPost) {
                updatePostAfterPublish(matchingPost.id, status.url, (document.getElementById('unified-publish-mode') as HTMLInputElement)?.value as any || undefined);
                appendLog(`📎 발행 URL이 저장되었습니다 (제목 매칭): ${status.url}`);

                try {
                  const snapshot = (() => {
                    try {
                      const from = ImageManager.getAllImages();
                      if (Array.isArray(from) && from.length > 0) return from;
                    } catch (e) {
                      console.warn('[renderer] catch ignored:', e);
                    }
                    const globalAll = (window as any).imageManagementGeneratedImages;
                    if (Array.isArray(globalAll) && globalAll.length > 0) return globalAll;
                    return generatedImages || [];
                  })();
                  updatePostImages(matchingPost.id, snapshot);
                } catch (e) {
                  console.warn('[renderer] catch ignored:', e);
                }
              }
            }
          }
        }
      }

      if (status.success === false && !status.cancelled) {
        appendLog(`❌ ${status.message || '알 수 없는 오류가 발생했습니다.'}`);
      }
    });
  }

  // 폼 제출 이벤트
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await runAutomation(false);
    });
  }

  // 실행 버튼 클릭
  if (runButton) {
    runButton.addEventListener('click', async () => {
      await runAutomation(false);
    });
  }

  // 글만 발행하기 버튼
  if (publishOnlyButton) {
    publishOnlyButton.addEventListener('click', async () => {
      await runAutomation(true);
    });
  }

  // 취소 버튼
  if (cancelButton) {
    cancelButton.addEventListener('click', async () => {
      await cancelAutomation();
    });
  }

  // 발행 모드 변경 시 스케줄 날짜 표시/숨김
  if (publishModeSelect && scheduleDateContainer) {
    publishModeSelect.addEventListener('change', () => {
      const mode = publishModeSelect.value;
      if (mode === 'schedule') {
        scheduleDateContainer.style.display = 'block';
        if (scheduleDateInput) {
          const now = new Date();
          const minDate = new Date(now.getTime() + 60000); // 1분 후
          const year = minDate.getFullYear();
          const month = String(minDate.getMonth() + 1).padStart(2, '0');
          const day = String(minDate.getDate()).padStart(2, '0');
          const hours = String(minDate.getHours()).padStart(2, '0');
          const minutes = String(Math.ceil(minDate.getMinutes() / 10) * 10 % 60).padStart(2, '0'); // 10분 단위 올림
          scheduleDateInput.min = `${year}-${month}-${day}T${hours}:${minutes}`;
          if (!scheduleDateInput.value) {
            scheduleDateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
          }
        }
      } else {
        scheduleDateContainer.style.display = 'none';
      }
    });

    // 초기 상태 설정
    if (publishModeSelect.value === 'schedule') {
      scheduleDateContainer.style.display = 'block';
    } else {
      scheduleDateContainer.style.display = 'none';
    }
  }

  // ============================================
  // 탭 전환 기능
  // ============================================

  const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-button'));
  const tabPanels = Array.from(document.querySelectorAll<HTMLDivElement>('.tab-panel'));

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      if (!targetTab) return;

      // 모든 탭 비활성화
      tabButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });

      tabPanels.forEach(panel => {
        panel.classList.remove('active');
        (panel as HTMLElement).style.display = 'none';
      });

      // 선택한 탭 활성화
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');

      const targetPanel = document.getElementById(`tab-${targetTab}`) as HTMLDivElement;
      if (targetPanel) {
        targetPanel.classList.add('active');
        targetPanel.style.display = 'block';
      }
    });
  });

  // ============================================
  // 모달 닫기 기능 (배경 클릭)
  // ============================================

  // [v2.10.110] settingsModal 배경 클릭은 settingsModal.ts:308이 단독 처리 (중복 제거)
  [licenseModal, externalLinksModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.setAttribute('aria-hidden', 'true');
          modal.style.display = 'none';
        }
      });
    }
  });

  // 라이선스 모달 닫기 버튼
  const closeLicenseButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-close-license]'));
  closeLicenseButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (licenseModal) {
        licenseModal.setAttribute('aria-hidden', 'true');
        licenseModal.style.display = 'none';
      }
    });
  });

  // ============================================
  // 구조화 콘텐츠 미리보기 및 소제목 선택 UI
  // ============================================
}

// 폼 데이터 수집
function displayStructuredContentPreview(content: StructuredContent): void {
  const previewContainer = document.getElementById('structured-content-preview') as HTMLDivElement;
  const headingsList = document.getElementById('structured-headings-list') as HTMLDivElement;
  const imageGenerationSection = document.getElementById('heading-image-generation-section') as HTMLDivElement;

  if (!previewContainer || !headingsList) return;

  // 소제목 목록 생성 (✅ HTML 이스케이프 적용)
  if (content.headings && content.headings.length > 0) {
    headingsList.innerHTML = content.headings.map((heading, index) => {
      const safeTitle = escapeHtml(heading.title || '');
      const safeSummary = escapeHtml(heading.summary || '');
      const safeImagePrompt = escapeHtml(heading.imagePrompt || heading.title || '');
      return `
        <label style="display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.75rem; border-radius: 0.5rem; cursor: pointer; transition: all var(--transition-fast); border: 1px solid var(--border-light); background: var(--bg-primary);">
          <input type="checkbox" class="structured-heading-checkbox" data-heading-index="${index}" checked style="margin-top: 0.25rem;">
          <div style="flex: 1;">
            <div style="font-weight: 600; margin-bottom: 0.25rem; color: var(--text-strong);">${safeTitle}</div>
            <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.25rem;">${safeSummary}</div>
            <div style="font-size: 0.75rem; color: var(--text-light);">이미지 프롬프트: ${safeImagePrompt}</div>
          </div>
        </label>
      `;
    }).join('');

    // 체크박스 호버 효과
    headingsList.querySelectorAll('label').forEach(label => {
      label.addEventListener('mouseenter', () => {
        label.style.background = 'var(--bg-hover)';
        label.style.borderColor = 'var(--primary)';
      });
      label.addEventListener('mouseleave', () => {
        label.style.background = 'var(--bg-primary)';
        label.style.borderColor = 'var(--border-light)';
      });
    });

    // 이미지 생성 섹션 표시
    if (imageGenerationSection) {
      imageGenerationSection.style.display = 'block';
    }

    previewContainer.style.display = 'block';
  } else {
    previewContainer.style.display = 'none';
  }
}

// ============================================
// 자동 생성 기능 (URL 기반)
// ============================================

let currentRssUrl = '';
let autoGenerateTimeout: NodeJS.Timeout | null = null;

async function autoGenerateFromUrl(urls: string): Promise<void> {
  if (!urls.trim() || urls === currentRssUrl) return;

  currentRssUrl = urls.trim();

  if (autoGenerateTimeout) {
    clearTimeout(autoGenerateTimeout);
  }

  autoGenerateTimeout = setTimeout(async () => {
    try {
      // ✅ 새 URL 분석 전 이전 콘텐츠 자동 초기화 (제목 버그 방지)
      if (currentStructuredContent) {
        console.log('[AutoGenerate] 이전 콘텐츠를 초기화합니다...');
        currentStructuredContent = null;
        (window as any).currentStructuredContent = null;
        generatedImages = [];
        (window as any).imageManagementGeneratedImages = null;
      }

      appendLog(`🔍 URL 기반 자동 생성을 시작합니다 (${urls})`);

      const targetAgeSelect = document.getElementById('target-age') as HTMLSelectElement;
      const targetAge = (targetAgeSelect?.value as '20s' | '30s' | '40s' | '50s' | 'all') || 'all';

      const customPrompt = (document.getElementById('unified-custom-prompt') as HTMLTextAreaElement)?.value?.trim();


      const apiClient = EnhancedApiClient.getInstance();

      // ✅ contentMode 수집 (custom 모드 지원)
      const contentModeSelect = document.getElementById('unified-content-mode') as HTMLSelectElement;
      const contentMode = (contentModeSelect?.value || 'seo') as 'seo' | 'homefeed' | 'affiliate' | 'custom' | 'business' | 'mate';

      console.log(`[URL 생성] contentMode: ${contentMode}, customPrompt: ${customPrompt ? `${customPrompt.substring(0, 50)}...` : '없음'}`);

      const apiResponse = await apiClient.call(
        'generateStructuredContent',
        [{
          assembly: {
            rssUrl: urls,
            targetAge: targetAge as '20s' | '30s' | '40s' | '50s' | 'all',
            generator: UnifiedDOMCache.getGenerator(), // ✅ [2026-02-22 FIX] perplexity 지원
            contentMode: contentMode, // ✅ custom 모드 전달
            customPrompt: customPrompt || undefined,
          } as { rssUrl: string; targetAge: '20s' | '30s' | '40s' | '50s' | 'all'; generator: string; contentMode?: string; customPrompt?: string },
        }],
        {
          retryCount: 2,
          retryDelay: 3000,
          timeout: 900000      // ✅ 15분 (Main 모델 폴백 체인 최대 12분 + 여유)
        }
      );

      const result = apiResponse.data || { success: false, message: apiResponse.error };

      if (isPaywallPayload(result)) {
        activatePaywall(result);
        return;
      }

      if (result.success && result.content) {
        currentStructuredContent = result.content;

        const titleInput = document.getElementById('post-title') as HTMLInputElement;
        const contentTextarea = document.getElementById('post-content') as HTMLTextAreaElement;
        const hashtagsInput = document.getElementById('hashtags-input') as HTMLInputElement;

        if (titleInput) {
          titleInput.value = result.content.selectedTitle || '';
        }

        if (contentTextarea) {
          contentTextarea.value = result.content.bodyPlain || '';
        }

        if (hashtagsInput && result.content.hashtags && result.content.hashtags.length > 0) {
          hashtagsInput.value = result.content.hashtags.join(', ');
        }

        // 구조화 콘텐츠 미리보기 표시
        displayStructuredContentPreview(result.content);

        updateRiskIndicators(result.content);
        appendLog('✅ 자동 생성이 완료되었습니다!');
      } else {
        appendLog(`❌ 자동 생성 실패: ${result.message || '알 수 없는 오류'}`);
      }
    } catch (error) {
      appendLog(`❌ 자동 생성 오류: ${(error as Error).message}`);
    }
  }, 1000); // 1초 디바운스
}

// URL 입력 필드 변경 감지 및 추가 버튼
const urlFieldsContainer = document.getElementById('url-fields-container') as HTMLDivElement;
const addUrlFieldBtn = document.getElementById('add-url-field-btn') as HTMLButtonElement;
let urlFieldCount = 1;

function addUrlField(): void {
  if (!urlFieldsContainer) return;

  const urlFieldItem = document.createElement('div');
  urlFieldItem.className = 'url-field-item';
  urlFieldItem.innerHTML = `
    <input 
      type="url" 
      class="url-field-input" 
      name="rssUrl[]" 
      placeholder="https://example.com/article1 또는 https://blog.naver.com/..."
      data-url-index="${urlFieldCount}"
    />
    <button type="button" class="url-field-remove" aria-label="삭제">×</button>
  `;

  urlFieldsContainer.appendChild(urlFieldItem);
  urlFieldCount++;

  // 삭제 버튼 이벤트 추가 및 표시/숨김
  const removeBtn = urlFieldItem.querySelector('.url-field-remove') as HTMLButtonElement;
  if (removeBtn) {
    // 항목이 여러 개일 때만 삭제 버튼 표시
    const allItems = urlFieldsContainer.querySelectorAll('.url-field-item');
    if (allItems.length > 1) {
      removeBtn.style.display = 'inline-block';
    }

    removeBtn.addEventListener('click', () => {
      const allItems = urlFieldsContainer.querySelectorAll('.url-field-item');
      if (allItems.length > 1) {
        urlFieldItem.remove();
        // 남은 항목들의 삭제 버튼 표시 상태 업데이트
        const remainingItems = urlFieldsContainer.querySelectorAll('.url-field-item');
        remainingItems.forEach((item, index) => {
          const btn = item.querySelector('.url-field-remove') as HTMLButtonElement;
          if (btn) {
            btn.style.display = remainingItems.length > 1 ? 'inline-block' : 'none';
          }
        });
      }
    });
  }

  // 기존 항목들의 삭제 버튼 표시 상태 업데이트
  const allItems = urlFieldsContainer.querySelectorAll('.url-field-item');
  allItems.forEach((item) => {
    const btn = item.querySelector('.url-field-remove') as HTMLButtonElement;
    if (btn) {
      btn.style.display = allItems.length > 1 ? 'inline-block' : 'none';
    }
  });

  // URL 입력 이벤트 추가
  const urlInput = urlFieldItem.querySelector('.url-field-input') as HTMLInputElement;
  if (urlInput) {
    urlInput.addEventListener('input', () => {
      const urls = getUrlsAsString();
      if (urls) {
        autoGenerateFromUrl(urls);
      }
    });
  }
}

if (addUrlFieldBtn) {
  addUrlFieldBtn.addEventListener('click', addUrlField);
}

if (urlFieldsContainer) {
  urlFieldsContainer.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.classList.contains('url-field-input')) {
      const urls = getUrlsAsString();
      if (urls) {
        autoGenerateFromUrl(urls);
      }
    }
  });
}

// 스케줄 관리 초기화 (비동기 함수이므로 즉시 호출)
initScheduleManagement();

// 접기/펼치기 토글 기능 (동적으로 추가된 요소도 처리 가능하도록 이벤트 위임)
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains('collapse-toggle')) {
    const targetId = target.getAttribute('data-target');
    if (!targetId) return;

    const content = document.getElementById(targetId);
    if (!content) return;

    const isCollapsed = content.classList.contains('collapsed');
    if (isCollapsed) {
      content.classList.remove('collapsed');
      target.textContent = '▼';
    } else {
      content.classList.add('collapsed');
      target.textContent = '▶';
    }
  }
});

/**
 * ⚡ API 연결 사전 준비 (Warm-up)
 * - DNS 해석 캐싱
 * - TLS 세션 캐싱
 * - 첫 콘텐츠 생성 시 연결 시간 대폭 단축
 */
async function warmupApiConnections(_hasGemini: boolean): Promise<void> {
  // v2.10.90: warmup 비활성화.
  //   이유: generativelanguage.googleapis.com 루트가 HEAD 요청에 404 반환 →
  //   DevTools Network 탭에 빨간 에러 로그 발생 → 콘솔 노이즈.
  //   DNS/TLS 캐싱 효과는 첫 진짜 콘텐츠 생성 시 어차피 발생하므로 사전 warm-up
  //   이득은 미미하고 디버깅 방해 비용이 더 큼.
  return;
}

// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 페이월 시스템 → ./modules/paywallSystem.ts로 이동
// - isPaywallPayload, activatePaywall, initPaywallSystem 등
// - 상단 import 참조
// ═══════════════════════════════════════════════════════════════════

// ✅ 쇼핑커넥트 CTA 자동 설정 초기화
function initShoppingConnectCTA(): void {
  const affiliateLinkInput = document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement | null;
  const ctaTextInput = document.getElementById('unified-cta-text') as HTMLInputElement | null;
  const ctaLinkInput = document.getElementById('unified-cta-link') as HTMLInputElement | null;

  if (!affiliateLinkInput) return;

  // 후킹 문구 리스트 (구매를 유도하는 문구들)
  const hookingTexts = [
    '🔥 지금 최저가로 구매하기!',
    '💰 오늘만 이 가격! 놓치지 마세요!',
    '⭐ 한정 수량! 품절 전에 구매하세요!',
    '🛒 1분이면 끝! 바로 구매하기',
    '✨ 후회 없는 선택! 지금 확인하세요',
    '🎁 특별 할인 진행 중! 클릭하세요',
  ];

  affiliateLinkInput.addEventListener('input', () => {
    const affiliateLink = affiliateLinkInput.value.trim();

    if (affiliateLink) {
      // ✅ [2026-01-21 FIX] 새 제휴링크 입력 시 기존 캐시 데이터 초기화 (이전 제품 이미지 잔류 방지)
      // currentStructuredContent의 이미지 캐시 초기화
      const sc: any = (window as any).currentStructuredContent;
      if (sc) {
        if (sc.images && sc.images.length > 0) {
          console.log('[ShoppingConnect] 🧹 새 제휴링크 입력 → 기존 이미지 캐시 초기화');
          sc.images = [];
        }
        if (sc.collectedImages && sc.collectedImages.length > 0) {
          sc.collectedImages = [];
        }
        // 제품 정보도 초기화
        if (sc.productInfo) {
          sc.productInfo = null;
        }
      }

      // 이미지 관리 탭의 캐시도 초기화
      if ((window as any).imageManagementGeneratedImages && (window as any).imageManagementGeneratedImages.length > 0) {
        console.log('[ShoppingConnect] 🧹 이미지 관리 탭 캐시 초기화');
        (window as any).imageManagementGeneratedImages = [];
      }

      // CTA 링크 자동 설정
      if (ctaLinkInput && !ctaLinkInput.value.trim()) {
        ctaLinkInput.value = affiliateLink;
      }

      // CTA 텍스트 자동 설정 (랜덤 후킹 문구)
      if (ctaTextInput && !ctaTextInput.value.trim()) {
        const randomHook = hookingTexts[Math.floor(Math.random() * hookingTexts.length)];
        ctaTextInput.value = randomHook;
      }

      console.log('[ShoppingConnect] 🛒 제휴 링크 입력 → CTA 자동 설정됨');
    }
  });

  // 쇼핑커넥트 모드 활성화 시에도 CTA 자동 설정
  // v2.10.82 PERF: 통합 sc-visibility-change event 구독으로 변경 (개별 MutationObserver ↓)
  document.addEventListener('sc-visibility-change', ((e: Event) => {
    const detail = (e as CustomEvent<{ visible: boolean }>).detail;
    if (detail.visible && affiliateLinkInput.value.trim()) {
      if (ctaLinkInput && !ctaLinkInput.value.trim()) {
        ctaLinkInput.value = affiliateLinkInput.value.trim();
      }
      if (ctaTextInput && !ctaTextInput.value.trim()) {
        const randomHook = hookingTexts[Math.floor(Math.random() * hookingTexts.length)];
        ctaTextInput.value = randomHook;
      }
    }
  }) as EventListener);
}


// ✅ [2026-01-19] 쇼핑커넥트 배너 탭 전용 이벤트 리스너 (index.html의 subtab-shopping-banner)
let shoppingBannerTabInitialized = false;
function initShoppingBannerTab(): void {
  console.log('[ShoppingBanner] initShoppingBannerTab 호출됨, initialized:', shoppingBannerTabInitialized);

  if (shoppingBannerTabInitialized) {
    console.log('[ShoppingBanner] 이미 초기화됨, 미리보기만 업데이트');
    // 이미 초기화되었어도 미리보기는 업데이트
    const previewEl = document.getElementById('shopping-banner-preview') as HTMLElement;
    const mainTextEl = document.getElementById('shopping-banner-main-text') as HTMLElement;
    if (previewEl && mainTextEl) {
      console.log('[ShoppingBanner] 요소 확인됨, 정상 동작');
    }
    return;
  }
  shoppingBannerTabInitialized = true;

  const hookInput = document.getElementById('shopping-banner-hook') as HTMLInputElement;
  const previewEl = document.getElementById('shopping-banner-preview') as HTMLElement;
  const mainTextEl = document.getElementById('shopping-banner-main-text') as HTMLElement;
  const clickTextEl = document.getElementById('shopping-banner-click-text') as HTMLElement;
  const color1Input = document.getElementById('shopping-banner-color1') as HTMLInputElement;
  const sizeSelect = document.getElementById('shopping-banner-size') as HTMLSelectElement;
  const fontSlider = document.getElementById('shopping-banner-font-size') as HTMLInputElement;
  const fontValueEl = document.getElementById('shopping-banner-font-value') as HTMLElement;
  const showClickCheckbox = document.getElementById('shopping-banner-show-click') as HTMLInputElement;
  const resetBtn = document.getElementById('shopping-banner-reset-btn');
  const saveBtn = document.getElementById('shopping-banner-save-btn');

  // ✅ 디버그: 요소 찾기 결과 출력
  console.log('[ShoppingBanner] 요소 확인:', {
    hookInput: !!hookInput,
    previewEl: !!previewEl,
    mainTextEl: !!mainTextEl,
    color1Input: !!color1Input,
    sizeSelect: !!sizeSelect,
    fontSlider: !!fontSlider,
    resetBtn: !!resetBtn,
    saveBtn: !!saveBtn
  });

  if (!previewEl || !mainTextEl) {
    console.warn('[ShoppingBanner] ⚠️ 필수 요소를 찾을 수 없음! subtab-shopping-banner 패널이 DOM에 없을 수 있음');
    shoppingBannerTabInitialized = false; // 재시도 가능하도록 플래그 리셋
    return;
  }

  // ✅ 실시간 미리보기 업데이트 함수
  function updateShoppingBannerPreview() {
    if (!previewEl || !mainTextEl) return;

    const text = hookInput?.value || '[공식] 최저가 보러가기 →';
    const bgColor = color1Input?.value || '#03C75A';
    const width = sizeSelect?.value || '600';
    const fontSize = fontSlider?.value || '26';
    const showClick = showClickCheckbox?.checked !== false;

    previewEl.style.background = bgColor;
    previewEl.style.width = `${width}px`;
    mainTextEl.textContent = text;
    mainTextEl.style.fontSize = `${fontSize}px`;

    if (clickTextEl) {
      clickTextEl.style.display = showClick ? 'block' : 'none';
    }

    if (fontValueEl) fontValueEl.textContent = fontSize;
  }

  // ✅ 이벤트 리스너 바인딩
  hookInput?.addEventListener('input', updateShoppingBannerPreview);
  color1Input?.addEventListener('input', updateShoppingBannerPreview);
  sizeSelect?.addEventListener('change', updateShoppingBannerPreview);
  fontSlider?.addEventListener('input', updateShoppingBannerPreview);
  showClickCheckbox?.addEventListener('change', updateShoppingBannerPreview);

  // 프리셋 버튼 클릭
  document.querySelectorAll('.shopping-banner-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const hook = (btn as HTMLElement).dataset.hook || '';
      if (hookInput) hookInput.value = hook;
      updateShoppingBannerPreview();
    });
  });

  // 색상 프리셋 버튼
  document.querySelectorAll('.shopping-banner-color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = (btn as HTMLElement).dataset.color || '#03C75A';
      if (color1Input) color1Input.value = color;
      updateShoppingBannerPreview();
    });
  });

  // 초기화 버튼
  resetBtn?.addEventListener('click', () => {
    if (hookInput) hookInput.value = '[공식] 최저가 보러가기 →';
    if (color1Input) color1Input.value = '#03C75A';
    if (sizeSelect) sizeSelect.value = '600';
    if (fontSlider) fontSlider.value = '26';
    if (showClickCheckbox) showClickCheckbox.checked = true;
    updateShoppingBannerPreview();
    // ✅ [2026-01-21] 저장된 설정 및 배너 경로 초기화
    localStorage.removeItem('shoppingBannerSettings');
    (window as any).customBannerPath = undefined; // 배너 경로도 초기화
    toastManager.success('🔄 배너 설정이 초기화되었습니다.');
  });

  // ✅ [2026-01-21] localStorage에서 저장된 설정 및 배너 경로 복원
  const savedSettings = localStorage.getItem('shoppingBannerSettings');
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings);
      if (hookInput && settings.text) hookInput.value = settings.text;
      if (color1Input && settings.bgColor) color1Input.value = settings.bgColor;
      if (sizeSelect && settings.width) sizeSelect.value = settings.width;
      if (fontSlider && settings.fontSize) fontSlider.value = settings.fontSize;
      if (showClickCheckbox && settings.showClick !== undefined) showClickCheckbox.checked = settings.showClick;
      updateShoppingBannerPreview();

      // ✅ [2026-01-21] 저장된 배너 경로 복원 (앱 재시작 후에도 커스텀 배너 사용)
      if (settings.bannerPath) {
        (window as any).customBannerPath = settings.bannerPath;
        console.log('[ShoppingBanner] 커스텀 배너 경로 복원:', settings.bannerPath);
      }

      appendLog('✅ 저장된 쇼핑커넥트 배너 설정을 불러왔습니다.');
    } catch (e) {
      console.warn('배너 설정 복원 실패:', e);
    }
  }

  // 저장 버튼 - 실제 배너 이미지 생성 + ✅ [2026-01-19] 설정을 localStorage에도 저장
  saveBtn?.addEventListener('click', async () => {
    const btn = saveBtn as HTMLButtonElement;
    try {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span> 생성 중...';

      const bannerText = hookInput?.value || '[공식] 최저가 보러가기 →';
      const bannerBgColor = color1Input?.value || '#03C75A';
      const bannerWidth = sizeSelect?.value || '600';
      const bannerFontSize = fontSlider?.value || '26';
      const bannerShowClick = showClickCheckbox?.checked !== false;

      const result = await (window as any).api.generateCustomBanner({
        text: bannerText,
        colorKey: 'custom',
        sizeKey: 'standard',
        animationKey: 'shimmer',
        customBgColor: bannerBgColor,
      });

      if (result?.success) {
        (window as any).customBannerPath = result.path;

        // ✅ [2026-01-21] 설정과 배너 경로를 localStorage에 저장 (앱 재시작 후에도 유지)
        const settingsToSave = {
          text: bannerText,
          bgColor: bannerBgColor,
          width: bannerWidth,
          fontSize: bannerFontSize,
          showClick: bannerShowClick,
          bannerPath: result.path, // ✅ [2026-01-21] 커스텀 배너 경로 저장
          savedAt: new Date().toISOString()
        };
        localStorage.setItem('shoppingBannerSettings', JSON.stringify(settingsToSave));

        toastManager.success('✅ 배너가 저장되었습니다! 쇼핑커넥트 발행 시 자동 적용됩니다.');
      } else {
        throw new Error(result?.message || '저장 실패');
      }
    } catch (e) {
      toastManager.error(`배너 저장 실패: ${(e as Error).message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>💾</span> 설정 저장';
    }
  });

  // ✅ [2026-01-19] 장단점 표 미리보기 이벤트 리스너
  const prosconsPreviewBtn = document.getElementById('proscons-preview-btn');
  prosconsPreviewBtn?.addEventListener('click', async () => {
    const btn = prosconsPreviewBtn as HTMLButtonElement;
    const container = document.getElementById('proscons-preview-container');
    const area = document.getElementById('proscons-preview-area');
    const status = document.getElementById('proscons-preview-status');

    const prosInput = document.getElementById('proscons-pros-input') as HTMLTextAreaElement;
    const consInput = document.getElementById('proscons-cons-input') as HTMLTextAreaElement;
    const productNameInput = document.getElementById('proscons-product-name') as HTMLInputElement;

    if (!container || !area) return;

    try {
      container.style.display = 'block';
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span> 생성 중...';
      if (status) status.textContent = '📊 장단점 표 생성 중...';

      // 줄바꿈으로 분리하여 배열로 변환
      const pros = (prosInput?.value || '').split('\n').filter(s => s.trim());
      const cons = (consInput?.value || '').split('\n').filter(s => s.trim());
      const productName = productNameInput?.value || '상품 리뷰';

      const result = await (window as any).api.generateProsConsTable({
        productName,
        pros,
        cons,
      });

      if (result?.success && result.path) {
        const timestamp = Date.now();
        area.innerHTML = `<img src="file:///${result.path.replace(/\\\\/g, '/').replace(/^\/+/, '')}?t=${timestamp}" style="max-width:100%; border-radius:8px;" alt="장단점 표">`;
        if (status) status.textContent = '✅ 장단점 표 생성 완료!';
        toastManager.success('📊 장단점 표가 생성되었습니다!');
      } else {
        throw new Error(result?.message || '생성 실패');
      }
    } catch (e) {
      if (status) status.textContent = `❌ ${(e as Error).message}`;
      toastManager.error(`장단점 표 생성 실패: ${(e as Error).message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>👁️</span> 미리보기 생성';
    }
  });

  // 초기 미리보기 업데이트
  updateShoppingBannerPreview();
  console.log('[ShoppingBannerTab] 이벤트 리스너 초기화 완료');
}

function initPurchaseInquiryButton(): void {
  const btn = document.getElementById('purchase-inquiry-btn') as HTMLButtonElement | null;
  if (btn) {
    btn.addEventListener('click', () => {
      // ✅ [v2.11.49] 구매문의 → 1:1 카톡문의 (오픈채팅)
      window.api.openExternalUrl('https://open.kakao.com/o/sPcaslwh');
    });
  }

  // ✅ [v2.11.49] 앱 사용법 영상(유튜브) — 헤더 버튼이라 항상 실행되는 이 init에서 배선.
  //   (이전엔 연속발행 init 안에 있어 연속발행을 열기 전엔 리스너 미등록 → 클릭해도 안 열리는 버그)
  const videoBtn = document.getElementById('close-browser-session-btn');
  if (videoBtn) {
    videoBtn.addEventListener('click', async () => {
      try {
        await window.api.openExternalUrl('https://www.youtube.com/watch?v=wGxmIcvh5Bc&list=PL5ci4Gqmio0dE7HMEkA8cF-o16epvswig&index=6');
      } catch (e) {
        console.error('앱 사용법 영상 열기 오류:', e);
      }
    });
  }

  // ✅ [v2.11.55] 원클릭 오류 진단 저장 — 발행 실패 후 클릭하면 진단 파일을 바탕화면에 저장.
  //   추측이 아니라 데이터로: 앱버전·어느 브라우저·OS·최근 로그를 한 파일에 담아 개발자에게 전달.
  const diagBtn = document.getElementById('diagnostic-report-btn');
  if (diagBtn) {
    diagBtn.addEventListener('click', async () => {
      const original = diagBtn.innerHTML;
      diagBtn.innerHTML = '<span style="font-size:1.25rem;">⏳</span><span>진단 저장 중...</span>';
      (diagBtn as HTMLButtonElement).disabled = true;
      try {
        const res = await window.api.generateDiagnosticReport?.({ stage: 'manual' });
        if (res?.ok && res.savedPath) {
          alert(`🔧 진단 리포트가 저장됐어요.\n\n${res.savedPath}\n\n이 파일을 개발자(1:1 카톡)에게 보내주시면 원인을 바로 찾을 수 있어요.`);
        } else {
          alert('진단 리포트 저장에 실패했어요. 다시 시도해주세요.');
        }
      } catch (e) {
        console.error('진단 리포트 생성 오류:', e);
        alert('진단 리포트 생성 중 오류가 발생했어요.');
      } finally {
        diagBtn.innerHTML = original;
        (diagBtn as HTMLButtonElement).disabled = false;
      }
    });
  }

  // ✅ [v2.11.49] "생성된 글 목록" 섹션을 글 발행하기 탭 → 전용 탭(post-list)으로 이동.
  //   DOM 노드를 그대로 옮기므로 id·핸들러(togglePostsListSection 등)는 보존됨. 멱등.
  //   init 타이밍/재렌더에 무관하게: init 즉시 + 탭 클릭 시 재시도 양쪽에서 보장.
  const relocatePostsList = (): void => {
    try {
      const postsList = document.getElementById('unified-only-posts-list');
      const postsHost = document.getElementById('post-list-tab-host');
      if (postsList && postsHost && postsList.parentElement !== postsHost) {
        postsHost.appendChild(postsList);
        (postsList as HTMLElement).style.display = 'block';
        console.log('[v2.11.49] 생성된 글 목록 섹션을 전용 탭으로 이동 완료');
      }
    } catch (e) {
      console.error('생성된 글 목록 탭 이동 오류:', e);
    }
  };
  relocatePostsList();
  const postListTabBtn = document.querySelector('[data-tab="post-list"]');
  if (postListTabBtn) {
    postListTabBtn.addEventListener('click', () => setTimeout(relocatePostsList, 0));
  }

  // ✅ [v2.11.49] 발행 모드 서브탭(단일/연속/다중계정) — 모달을 서브탭 인라인으로 (B3-2).
  initPublishModeSubtabs();
}

/**
 * 발행 모드 서브탭 — 연속/다중계정 모달을 서브탭 안 인라인 패널로 이동(모달 팝업 제거).
 * 멱등·방어적: 요소 없으면 graceful 종료. DOM 노드 이동이라 핸들러/id 보존.
 */
function initPublishModeSubtabs(): void {
  try {
    const subtabs = document.getElementById('publish-mode-subtabs');
    if (!subtabs || document.getElementById('pub-mode-single-panel')) return;
    const formSection = (subtabs.closest('section') || subtabs.parentElement) as HTMLElement | null;
    if (!formSection) return;

    // 1. 단일 콘텐츠(서브탭 바 이후 형제 전부)를 single 패널로 래핑
    const single = document.createElement('div');
    single.id = 'pub-mode-single-panel';
    const toMove: Element[] = [];
    let n = subtabs.nextElementSibling;
    while (n) { toMove.push(n); n = n.nextElementSibling; }
    toMove.forEach((el) => single.appendChild(el));
    formSection.appendChild(single);

    // 2. continuous / ma 인라인 패널 생성
    const cont = document.createElement('div');
    cont.id = 'pub-mode-continuous-panel'; cont.style.display = 'none';
    const ma = document.createElement('div');
    ma.id = 'pub-mode-ma-panel'; ma.style.display = 'none';
    formSection.appendChild(cont);
    formSection.appendChild(ma);

    // 3. 모달 "전체"를 인라인 패널로 이동(구조 유지 → modal.querySelector 동작) + 오버레이를 일반 블록으로 변환.
    //    panel만 빼지 않는 이유: opener의 핸들러 배선이 modal.querySelector(...)를 쓰기 때문.
    const relocate = (modalId: string, host: HTMLElement): void => {
      const modal = document.getElementById(modalId) as HTMLElement | null;
      if (!modal) return;
      if (modal.parentElement !== host) host.appendChild(modal);
      modal.style.setProperty('position', 'static', 'important');
      modal.style.setProperty('display', 'block', 'important');
      modal.style.setProperty('background', 'transparent', 'important');
      modal.style.setProperty('width', '100%', 'important');
      modal.style.setProperty('height', 'auto', 'important');
      modal.style.setProperty('padding', '0', 'important');
      modal.style.setProperty('inset', 'auto', 'important');
      modal.style.pointerEvents = 'auto';
      modal.setAttribute('aria-hidden', 'false');
      modal.dataset.inlined = 'true';
      const panel = modal.querySelector('.modal-panel') as HTMLElement | null;
      if (panel) { panel.style.maxWidth = '100%'; panel.style.width = '100%'; panel.style.maxHeight = 'none'; panel.style.margin = '0'; }
    };
    relocate('continuous-mode-modal', cont);
    relocate('multi-account-modal', ma);

    // 4. 서브탭 전환 (전역 노출 → opener들이 호출)
    //    견고화: 모달이 다른 코드에 의해 body 등으로 탈출했으면 매번 호스트로 되돌리고,
    //    모달 자체 display(!important)도 직접 토글 → 서브탭별로 정확히 하나만 표시.
    const showMode = (mode: 'single' | 'continuous' | 'ma'): void => {
      const contModal = document.getElementById('continuous-mode-modal') as HTMLElement | null;
      const maModal = document.getElementById('multi-account-modal') as HTMLElement | null;
      if (contModal && contModal.parentElement !== cont) cont.appendChild(contModal);
      if (maModal && maModal.parentElement !== ma) ma.appendChild(maModal);
      single.style.display = mode === 'single' ? 'block' : 'none';
      cont.style.display = mode === 'continuous' ? 'block' : 'none';
      ma.style.display = mode === 'ma' ? 'block' : 'none';
      if (contModal) contModal.style.setProperty('display', mode === 'continuous' ? 'block' : 'none', 'important');
      if (maModal) maModal.style.setProperty('display', mode === 'ma' ? 'block' : 'none', 'important');
      document.querySelectorAll<HTMLElement>('.pub-mode-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.pubmode === mode);
      });
      // ✅ [2026-06-23 FIX] ma(풀오토 다중계정) 서브탭은 패널 표시만 하고 계정 목록 렌더를
      //   호출하지 않아, 계정이 6개 있어도 정적 "등록된 계정이 없습니다"가 그대로 보이던 버그
      //   (v2.11.49 모달→인라인 서브탭 전환 때 렌더 트리거 누락). 서브탭 표시 시 렌더 트리거.
      //   백엔드는 정상(getAllBlogAccounts→6개) — 화면만 안 그려졌던 회귀. window 노출 함수 사용.
      if (mode === 'ma') {
        try { (window as any).renderMultiAccountList?.(); } catch (e) { console.warn('[showMode] 다중계정 목록 렌더 실패:', e); }
      }
    };
    (window as any).__showPublishMode = showMode;
    document.querySelectorAll<HTMLButtonElement>('.pub-mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => showMode((tab.dataset.pubmode as 'single' | 'continuous' | 'ma') || 'single'));
    });

    // ✅ [v2.11.49] 서브탭으로 일원화 → 기존(옛) UI 제거:
    //   ① 옛 "연속 발행 모드" 카드(continuous-mode-section) ② 헤더 "풀오토 다중계정" 버튼.
    //   (multi-account-btn은 init 배선에 필요해 제거 대신 숨김 — DOM엔 유지)
    document.getElementById('continuous-mode-section')?.style.setProperty('display', 'none', 'important');
    document.getElementById('multi-account-btn')?.style.setProperty('display', 'none', 'important');

    // 5. 인라인 패널 내부 기능 배선(상세설정·큐추가 등) 1회 트리거 — opener가 "열 때" 배선하므로.
    //    __showPublishMode 설정 후 실행 → 트리거가 잠시 continuous/ma로 갔다가 single로 복귀.
    try { (window as any).toggleContinuousModeModal?.(); } catch { /* ignore */ }
    document.getElementById('multi-account-btn')?.click();
    // ✅ [2026-06-30] 초기 발행 모드를 항상 "단일 발행"으로 확정.
    //   multi-account-btn 클릭 핸들러가 async(await checkFeatureLockAndShow 뒤 __showPublishMode('ma'))라
    //   setTimeout(0)의 showMode('single')이 그 await보다 먼저 실행돼 결국 'ma'로 끝나던 레이스 버그.
    //   wiring(클릭)은 그대로 두되 single을 충분히 뒤(250ms)+rAF로 재확정해 단일 발행이 최종 화면이 되게 한다.
    const forceSingleMode = () => { try { showMode('single'); } catch { /* ignore */ } };
    setTimeout(forceSingleMode, 250);
    setTimeout(() => requestAnimationFrame(forceSingleMode), 400);
  } catch (e) {
    console.error('발행 모드 서브탭 초기화 오류:', e);
  }
}

// 메인 초기화 함수 (DOMContentLoaded와 상관없이 한 번만 실행)
async function initializeApplication(): Promise<void> {
  if ((window as any)._appInitialized) {
    console.log('[Init] 애플리케이션이 이미 초기화되어 중복 실행 방지');
    return;
  }
  (window as any)._appInitialized = true;

  // ✅ [v2.10.335] 나노바나나 3종 분리 — 레거시 provider 저장값 1회성 마이그레이션.
  //   다른 어떤 코드가 이미지 소스 localStorage를 읽기 전에 최우선 실행해야 한다.
  try {
    migrateImageProviderStorage();
  } catch (e) {
    console.warn('[Init] 이미지 provider 마이그레이션 스킵:', e);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ✅ [v2.10.90 PerfDebug] 초기화 단계별 시간 측정.
  //   각 단계의 소요 시간을 콘솔에 출력. >100ms는 🐌 SLOW로 강조.
  //   사용자가 콘솔(F12) 열고 어디서 멈추는지 즉시 식별 가능.
  // ═══════════════════════════════════════════════════════════════════════
  const _perfT0 = performance.now();
  let _perfPrev = _perfT0;
  const _perfSteps: Array<{ label: string; ms: number }> = [];
  // ✅ [v2.10.93] console.warn 사용 — v2.10.41부터 빌드 시 console.log가 no-op으로
  //   교체되어 [PerfDebug] 로그가 *전혀 안 뜨던* 버그 수정. warn은 no-op 대상 아님.
  const _perfMark = (label: string): void => {
    const now = performance.now();
    const stepMs = now - _perfPrev;
    const totalMs = (now - _perfT0).toFixed(0);
    _perfSteps.push({ label, ms: stepMs });
    const slow = stepMs > 100 ? '🐌 SLOW' : stepMs > 30 ? '⚠️' : '';
    console.warn(`[PerfDebug +${stepMs.toFixed(0)}ms / total ${totalMs}ms] ${label} ${slow}`);
    // [v2.10.127] LongTask observer가 어떤 init 중인지 식별할 수 있게 마커 업데이트
    (window as any).__lastBackgroundTask = `init:${label}`;
    _perfPrev = now;
  };

  // ✅ [v2.10.91] yield_ — main thread를 paint/event에 양보.
  const yield_ = (): Promise<void> => new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });

  // [v2.10.112 REVERT] 조건부 yield 복귀 — v2.10.92 패턴.
  //   v2.10.110 강제 yield(매 init 후 setTimeout 0)가 multiAccountManager의 main-add-account-btn /
  //   ma-add-account-btn 클릭 미반응 회귀 원인 의심. setTimeout chain 사이에 DOM/listener race 가능성.
  //   50ms 임계로 복귀: 무거운 init만 yield, 가벼운 init은 즉시 → 회귀 차단.
  // [v2.10.266] SPEC-FREEZE-GUARD-001 Phase A2 — renderer 시작 freeze 보수적 완화.
  //   사용자 보고 "초반 응답없음 여전" + explorer 진단: 50ms 임계에서 30~50ms 짜리 init도
  //   즉시 실행 → UI 응답 회복 기회 부족. 100ms 임계로 yield 후보 영역 확장.
  //   무거운 init(>=100ms)만 yield 유지하되, 30~100ms 영역도 누적되면 yield 트리거되어 main thread 분산.
  const YIELD_THRESHOLD_MS = 100;
  let _yieldLastT = performance.now();
  const _yieldIfNeeded = async (): Promise<void> => {
    const now = performance.now();
    if (now - _yieldLastT > YIELD_THRESHOLD_MS) {
      await yield_();
      _yieldLastT = performance.now();
    }
  };

  // [v2.10.127] 모든 init 단계에 백그라운드 마커 — LongTask 발생 시 *어떤 init*인지 즉시 식별.
  //   _perfMark가 자동으로 window.__lastBackgroundTask 업데이트.
  const _markBg = (label: string) => { (window as any).__lastBackgroundTask = `init:${label}`; };
  const _perfMarkWithBg = (label: string) => { _markBg(label); _perfMark(label); };

  _perfMarkWithBg('DOMContentLoaded 진입 → [Init] 시작');
  console.log('[Init] 애플리케이션 초기화 시작');

  await initPaywallSystem();
  _perfMarkWithBg('initPaywallSystem 완료');

  UnifiedDOMCache.init();
  _perfMark('UnifiedDOMCache.init 완료');

  appendLog('📝 자동화 시스템이 준비되었습니다.');

  await autoLoadApiKeys();
  _perfMark('autoLoadApiKeys 완료 (IPC: settings 로드)');

  try {
    const currentConfig = await window.api.getConfig();
    _perfMark('window.api.getConfig 완료 (IPC: config 로드)');
    if (currentConfig) {
      (window as any).appConfig = currentConfig;
      const hasGemini = !!currentConfig.geminiApiKey;
      if (hasGemini) {
        appendLog('✅ 저장된 API 키가 로드되었습니다. 바로 사용 가능합니다!');
      }
    }
  } catch (e) {
    _perfMark('getConfig 실패 (무시)');
  }

  _perfMark('cleanupStaleImages → removed (SPEC-IMAGE-MODEL-001 Phase 7a)');

  initUnifiedTab(); _perfMark('initUnifiedTab'); await _yieldIfNeeded();
  initImageLibrary(); _perfMark('initImageLibrary'); await _yieldIfNeeded();
  initThumbnailGenerator(); _perfMark('initThumbnailGenerator'); await _yieldIfNeeded();
  initLicenseModal(); _perfMark('initLicenseModal'); await _yieldIfNeeded();
  initPriceInfoModal(); _perfMark('initPriceInfoModal'); await _yieldIfNeeded();
  initNoticeAdmin(); _perfMark('initNoticeAdmin'); await _yieldIfNeeded();
  try { initGeminiModelSync(); } catch (e) { console.warn('[renderer] catch ignored:', e); }
  _perfMark('initGeminiModelSync'); await _yieldIfNeeded();
  initCredentialsSave(); _perfMark('initCredentialsSave'); await _yieldIfNeeded();
  initTitleGeneration(); _perfMark('initTitleGeneration'); await _yieldIfNeeded();
  initHeadingImageGeneration(); _perfMark('initHeadingImageGeneration'); await _yieldIfNeeded();
  initApiGuideModal(); _perfMark('initApiGuideModal'); await _yieldIfNeeded();
  initUserGuideModal(); _perfMark('initUserGuideModal'); await _yieldIfNeeded();
  initContentHeadingImageGeneration(); _perfMark('initContentHeadingImageGeneration'); await _yieldIfNeeded();
  initCharCountDisplay(); _perfMark('initCharCountDisplay'); await _yieldIfNeeded();
  initImageManagementTab(); _perfMark('initImageManagementTab'); await _yieldIfNeeded();
  // ✅ [v2.10.82 PERF] 대시보드 통계는 비핵심 — 5초 idle timeout으로 미룸.
  runWhenIdle(() => initDashboard(), { name: 'initDashboard', timeoutMs: 5000 });
  // ✅ [v2.10.94 REVERT] Gemini 안내 배너는 setTimeout 1500ms로 변경.
  //   runWhenIdle 사용 시 일부 환경에서 idle 발동 안 되고 fallback도 실패 →
  //   배너 자체가 안 뜸. setTimeout으로 무조건 1.5초 후 표시.
  setTimeout(() => {
    // Gemini 상태 공지 배너는 사용자 요청으로 비활성화.
  }, 1500);
  initTabSwitching(); _perfMark('initTabSwitching'); await _yieldIfNeeded();
  initLicenseBadge(); _perfMark('initLicenseBadge'); await _yieldIfNeeded();
  initCustomerServiceButton(); _perfMark('initCustomerServiceButton'); await _yieldIfNeeded();
  initPurchaseInquiryButton(); _perfMark('initPurchaseInquiryButton'); await _yieldIfNeeded();
  initGlobalRefreshButton(); _perfMark('initGlobalRefreshButton'); await _yieldIfNeeded();
  initUnifiedImageEventHandlers(); _perfMark('initUnifiedImageEventHandlers'); await _yieldIfNeeded();
  initShoppingConnectObserver(); _perfMark('initShoppingConnectObserver'); await _yieldIfNeeded();
  initShoppingConnectCTA(); _perfMark('initShoppingConnectCTA');
  _perfMark('═══ 모든 동기 init 완료 ═══');

  // ✅ [v2.10.94] 글 목록 강제 재로드 — initUnifiedTab의 첫 호출이 _yieldIfNeeded
  //   사이에서 race condition(account namespacing 등)에 걸려 빈 목록일 가능성 대비.
  // [v2.10.138] setTimeout(1000) → runWhenIdle (76ms LongTask 차단).
  //   원인: refreshGeneratedPostsList가 글 N개 DOM 렌더 + localStorage I/O로 76ms 점유.
  //   해결: 브라우저 유휴 시간에만 실행, timeoutMs 3000으로 강제 fallback 보장.
  runWhenIdle(() => {
    try {
      refreshGeneratedPostsList();
      console.warn(`[Init] 생성된 글 목록 강제 재로드 완료 (v${APP_VERSION})`);
    } catch (e) {
      console.warn('[Init] 글 목록 재로드 실패 (무시):', e);
    }
  }, { name: 'refresh-posts-list', timeoutMs: 3000 });

  // ✅ [v2.10.93] 최종 요약 — top 5 느린 단계 console.warn으로 강조 출력
  //   (v2.10.41 console.log no-op 회피)
  const topSlow = [..._perfSteps].sort((a, b) => b.ms - a.ms).slice(0, 5);
  console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.warn('[PerfDebug SUMMARY] Top 5 가장 느린 단계:');
  for (const step of topSlow) {
    const icon = step.ms > 500 ? '🚨' : step.ms > 100 ? '🐌' : step.ms > 30 ? '⚠️' : '✓';
    console.warn(`  ${icon} ${step.ms.toFixed(0).padStart(5)}ms  ${step.label}`);
  }
  console.warn(`[PerfDebug] 총 초기화 시간: ${(performance.now() - _perfT0).toFixed(0)}ms`);
  console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');


  // ✅ 임시 저장 데이터 복구 확인
  // [v2.10.138] setTimeout(1000) → runWhenIdle — main thread 양보.
  //   autosave 모달은 사용자 즉시 확인 필요 없음 → idle 시간에 충분.
  runWhenIdle(() => restoreAutosavedContent(), { name: 'restore-autosave', timeoutMs: 3000 });

  // v2.10.107: cleanup을 글 목록 렌더 *전*으로 이동 (위에서 await 호출). setTimeout 제거.

  console.log('[Init] 애플리케이션 초기화 완료');
}

// DOMContentLoaded 시 초기화 (한 번만 실행)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeApplication();
  });
} else {
  // 이미 로드된 경우 즉시 실행
  initializeApplication();
}

// ============================================
// 콘텐츠 작성 탭의 소제목 이미지 생성 기능 초기화
// ============================================
function initContentHeadingImageGeneration(): void {
  const contentGenerateImagesBtn = document.getElementById('generate-content-images-btn') as HTMLButtonElement;
  const contentImageProvider = document.getElementById('content-image-provider') as HTMLSelectElement;
  const contentGeneratedImagesPreview = document.getElementById('content-generated-images-preview') as HTMLDivElement;
  const contentGeneratedImagesGrid = document.getElementById('content-generated-images-grid') as HTMLDivElement;

  if (contentGenerateImagesBtn && contentImageProvider) {
    contentGenerateImagesBtn.addEventListener('click', async () => {
      const selectedCheckboxes = document.querySelectorAll('.structured-heading-checkbox:checked');
      if (selectedCheckboxes.length === 0) {
        alert('이미지를 생성할 소제목을 최소 1개 이상 선택해주세요.');
        return;
      }

      if (!currentStructuredContent || !currentStructuredContent.headings) {
        alert('생성된 구조화 콘텐츠가 없습니다.');
        return;
      }

      contentGenerateImagesBtn.disabled = true;
      contentGenerateImagesBtn.textContent = '이미지 생성 중...';
      appendLog(`🎨 ${selectedCheckboxes.length}개 소제목의 이미지 생성 시작...`);

      try {
        const selectedHeadingTitles = Array.from(selectedCheckboxes).map(checkbox =>
          (checkbox as HTMLInputElement).getAttribute('data-heading-title') || ''
        ).filter(title => title.length > 0);

        const selectedHeadings = currentStructuredContent.headings.filter(h =>
          selectedHeadingTitles.includes(h.title)
        );

        const provider = contentImageProvider.value as string;

        // ✅ [2026-03-07 FIX] generateImagesWithCostSafety 경유 → 이미지 설정 자동 주입 적용
        const result = await generateImagesWithCostSafety({
          provider,
          items: selectedHeadings.map((h: any) => {
            const title = String(h.title || h.text || (typeof h === 'string' ? h : '')).trim();
            const prompt = String(h.imagePrompt || h.prompt || title || 'Abstract Image').trim();
            return {
              heading: title || '이미지',
              prompt: prompt
            };
          }),
          postTitle: currentStructuredContent?.selectedTitle,
          forceImageGeneration: true,
          postId: currentPostId || undefined, // ✅ 글 ID 전달
          // ✅ 쇼핑커넥트 모드: 수집된 이미지 전달
          isShoppingConnect: true, // ✅ 쇼핑커넥트 강제 활성화
          collectedImages: (() => {
            const collected = currentStructuredContent?.collectedImages || [];
            console.log(`[Renderer] 🛒 쇼핑커넥트 이미지 전달: isShoppingConnect=${isShoppingConnectModeActive()}, collectedImages=${collected.length}개`);
            if (collected.length > 0) {
              console.log(`[Renderer]   첫번째 이미지: ${collected[0]?.substring?.(0, 80) || collected[0]}`);
            }
            return collected;
          })(),
        } as any);

        if (result.success && result.images && result.images.length > 0) {
          // 생성된 이미지 목록에 추가
          result.images.forEach((img: any) => {
            // 중복 제거: 같은 heading이면 기존 것 제거
            generatedImages = generatedImages.filter(g => g.heading !== img.heading);
            generatedImages.push({
              heading: img.heading,
              filePath: img.filePath,
              previewDataUrl: img.previewDataUrl,
              provider: img.provider,
            });
          });

          // 이미지 그리드 표시 (✅ HTML 이스케이프 적용)
          if (contentGeneratedImagesGrid) {
            contentGeneratedImagesGrid.innerHTML = result.images.filter((img: any) => img).map((img: any) => {
              const safeHeading = escapeHtml(img.heading || '');
              const safeFilePath = escapeHtml(img.filePath || '');
              const imageRaw = img.previewDataUrl || img.filePath || (img as any).url || '';
              const imageUrl = toFileUrlMaybe(String(imageRaw || '').trim());
              return `
                <div class="image-item" data-image-id="${safeFilePath}">
                  <img src="${imageUrl}" alt="${safeHeading}" loading="lazy" style="width: 100%; height: 200px; object-fit: cover; border-radius: var(--radius-md);">
                  <div style="padding: 0.5rem; font-size: 0.875rem; font-weight: 600;">${safeHeading}</div>
                </div>
              `;
            }).join('');
          }

          if (contentGeneratedImagesPreview) {
            contentGeneratedImagesPreview.style.display = 'block';
          }

          appendLog(`✅ ${result.images.length}개의 이미지가 생성되었습니다.`);
          alert(`✅ ${result.images.length}개의 이미지가 생성되었습니다!`);
        } else {
          appendLog(`❌ 이미지 생성 실패: ${result.message || '알 수 없는 오류'}`);
          alert(`❌ 이미지 생성 실패: ${result.message || '알 수 없는 오류'}`);
        }
      } catch (error) {
        appendLog(`❌ 이미지 생성 오류: ${(error as Error).message}`);
        alert(`❌ 오류: ${(error as Error).message}`);
      } finally {
        contentGenerateImagesBtn.disabled = false;
        contentGenerateImagesBtn.textContent = '선택한 소제목 이미지 생성하기';
      }
    });
  }
}

// 아이템 선택
function selectUnifiedItem(element: HTMLElement): void {
  // 기존 선택 해제
  document.querySelectorAll('.unified-item').forEach(item => {
    (item as HTMLElement).style.borderColor = '#e5e7eb';
    (item as HTMLElement).style.boxShadow = 'none';
  });

  // 새로 선택
  element.style.borderColor = '#3b82f6';
  element.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';

  // 적용 버튼 표시
  const applyBtn = document.getElementById('apply-btn');
  if (applyBtn) {
    applyBtn.style.display = 'block';
  }
}

// 아이템 적용
function applyUnifiedItem(type: string, index: number): void {
  console.log(`${type} 아이템 적용:`, index);
  // 빠른 실행 기능이 제거되었으므로 빈 함수로 유지
  closeUnifiedModal();
}

// 선택된 아이템 적용
function applySelectedItem(): void {
  const selectedItem = document.querySelector('.unified-item[style*="border-color: rgb(59, 130, 246)"]') as HTMLElement;
  if (selectedItem) {
    const type = selectedItem.dataset.type;
    const index = parseInt(selectedItem.dataset.index || '0');
    applyUnifiedItem(type || '', index);
  }
}

// 검색 필터링
function filterUnifiedContent(): void {
  const searchInput = document.getElementById('unified-search') as HTMLInputElement;
  const query = searchInput.value.toLowerCase();
  const items = document.querySelectorAll('.unified-item');

  items.forEach(item => {
    const text = item.textContent?.toLowerCase() || '';
    (item as HTMLElement).style.display = text.includes(query) ? 'block' : 'none';
  });
}

// 정렬
function sortUnifiedContent(): void {
  // 정렬 로직 구현 (필요시)
  console.log('정렬 기능은 추후 구현 예정');
}

// 모달 닫기
function closeUnifiedModal(): void {
  const modal = document.getElementById('unified-modal');
  if (modal) {
    document.removeEventListener('keydown', handleModalKeydown);
    modal.remove();
  }
}

// 키보드 이벤트 핸들러
function handleModalKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeUnifiedModal();
  }
}

// ✅ 전역 키보드 단축키 지원
function initKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K: 검색 포커스
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('posts-search-input') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }

    // Ctrl/Cmd + S: 저장 (자동 저장 트리거)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      const target = e.target as HTMLElement;
      // 입력 필드에 포커스가 있을 때만 저장
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        e.preventDefault();
        appendLog('💾 수동 저장이 트리거되었습니다. (자동 저장은 30초마다 실행됩니다)');
      }
    }

    // Ctrl/Cmd + N: 새 글 생성 (필드 초기화)
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (confirm('모든 필드를 초기화하고 새 글을 작성하시겠습니까?')) {
          resetAllFields();
          appendLog('🆕 새 글 작성을 위해 필드가 초기화되었습니다.');
        }
      }
    }

    // Ctrl/Cmd + F: 검색 (기본 브라우저 검색 방지)
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const searchInput = document.getElementById('posts-search-input') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    }

    // ESC: 모달 닫기
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('[style*="z-index: 10000"], [style*="z-index: 10001"]');
      modals.forEach(modal => {
        if (modal instanceof HTMLElement && modal.style.display !== 'none') {
          modal.remove();
        }
      });
    }
  });
}




// 즐겨찾기 설정 가져오기
function getFavoriteSettings(): Array<{ name: string; description: string; category: string; usageCount: number }> {
  // 실제로는 config에서 가져와야 함
  return [
    { name: '블로그 포스팅 기본', description: '일반적인 블로그 글 작성 설정', category: '블로그', usageCount: 25 },
    { name: 'SEO 최적화 모드', description: '검색엔진 최적화에 특화된 설정', category: 'SEO', usageCount: 18 },
    { name: '트렌드 분석 모드', description: '시장 트렌드 분석에 적합한 설정', category: '분석', usageCount: 12 }
  ];
}

function getAvailableTemplates(): Array<{ name: string; description: string }> {
  return [
    { name: '뉴스 스타일', description: '최신 뉴스 형식의 콘텐츠' },
    { name: '리뷰 스타일', description: '제품 리뷰 형식' },
    { name: '사용법 가이드', description: '단계별 사용법 설명' },
    { name: '스토리텔링', description: '이야기 형식의 콘텐츠' }
  ];
}

// ✅ 연속발행 모드 카테고리 분석 초기화
function initContinuousCategorySync(): void {
  console.log('[Continuous] 카테고리 동기화 초기화 완료 (모달 방식 사용)');
}

// ✅ 다중계정 발행 모드 카테고리 분석 초기화 (공통 모달 방식 사용)
function initMultiAccountCategorySync(): void {
  console.log('[Multi-Account] 카테고리 동기화 초기화 완료 (모달 방식 사용)');
}


// ============================================
// 카테고리 선택 모달 초기화
// ============================================
// ✅ 실제 네이버 블로그 카테고리 분석 및 동기화 루틴
function initRealCategorySync(): void {
  const analyzeBtn = document.getElementById('analyze-blog-categories-btn') as HTMLButtonElement;
  const dropdownContainer = document.getElementById('real-category-dropdown-container');
  const categorySelect = document.getElementById('real-blog-category-select') as HTMLSelectElement;

  if (!analyzeBtn || !dropdownContainer || !categorySelect) return;

  analyzeBtn.addEventListener('click', async () => {
    try {
      analyzeBtn.disabled = true;
      const originalHtml = analyzeBtn.innerHTML;
      analyzeBtn.innerHTML = '<span style="font-size: 1.2rem;">⏳</span><span>분석 중...</span>';

      const config = await (window as any).api.getConfig();
      const naverId = (document.getElementById('naver-id') as HTMLInputElement)?.value?.trim() || config.savedNaverId;
      const naverPassword = (document.getElementById('naver-password') as HTMLInputElement)?.value?.trim() || config.savedNaverPassword;

      if (!naverId || !naverPassword) {
        alert('⚠️ 네이버 아이디와 비밀번호를 먼저 입력하거나 저장해주세요.');
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = originalHtml;
        return;
      }

      appendLog(`🔎 네이버 카테고리 분석 시작 (${naverId})...`);

      const response = await (window as any).api.fetchBlogCategories({
        naverId,
        naverPassword
      });

      if (response && response.success && response.categories && response.categories.length > 0) {
        // 기존 옵션 제거 (첫 번째 제외)
        while (categorySelect.options.length > 1) {
          categorySelect.remove(1);
        }

        response.categories.forEach((cat: { id: string; name: string }) => {
          const option = document.createElement('option');
          option.value = cat.name;
          option.textContent = cat.name;
          categorySelect.appendChild(option);
        });

        dropdownContainer.style.display = 'block';
        appendLog(`✅ ${response.categories.length}개의 카테고리를 성공적으로 가져왔습니다.`);
        if ((window as any).toastManager) {
          (window as any).toastManager.success(`✅ ${response.categories.length}개의 카테고리를 가져왔습니다.`);
        }
      } else {
        const errorMsg = response.message || '카테고리 정보를 가져오지 못했습니다.';
        alert(`⚠️ ${errorMsg}\n계정 정보를 확인하거나 잠시 후 다시 시도해주세요.`);
        appendLog(`❌ 카테고리 분석 실패: ${errorMsg}`);
      }
    } catch (error) {
      console.error('Category Sync Error:', error);
      alert(`⚠️ 오류 발생: ${(error as any).message}`);
      appendLog(`❌ 카테고리 분석 중 오류: ${(error as any).message}`);
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = '<span style="font-size: 1.2rem;">🔍</span><span>블로그 실제 카테고리 분석하기</span>';
    }
  });

  // 카테고리 선택 시 로그 출력
  categorySelect.addEventListener('change', () => {
    if (categorySelect.value) {
      appendLog(`📂 발행 카테고리 설정됨: "${categorySelect.value}"`);
    }
  });
}

function initCategoryModal(): void {
  const openBtn = document.getElementById('open-category-modal-btn');
  // ✅ 다중계정용 버튼 추가
  const maOpenBtn = document.getElementById('ma-open-category-modal-btn');
  // ✅ 연속발행용 버튼 추가
  const continuousOpenBtn = document.getElementById('continuous-open-category-modal-btn');

  const modal = document.getElementById('category-selection-modal');
  const closeBtn = document.getElementById('close-category-modal');
  const cancelBtn = document.getElementById('cancel-category-modal');
  const confirmBtn = document.getElementById('confirm-category-modal');

  // ✅ 모달이 body 직속이 아닌 경우 body로 이동 (중첩 문제 해결)
  if (modal && modal.parentElement !== document.body) {
    console.log('[CategoryModal] 모달이 body 직속이 아님 - body로 이동');
    console.log('[CategoryModal] 현재 부모:', modal.parentElement?.id || modal.parentElement?.tagName);
    document.body.appendChild(modal);
    console.log('[CategoryModal] 모달을 body로 이동 완료');
  }

  // ✅ 추가 버튼들 (계정 설정 및 연속발행용)
  const maSettingOpenBtn = document.getElementById('ma-setting-open-category-btn');
  const continuousCategoryBtn = document.getElementById('continuous-category-btn');

  // 스마트 자동발행용 UI 요소
  const categorySelect = document.getElementById('unified-article-type') as HTMLSelectElement;
  const selectedCategoryText = document.getElementById('selected-category-text');
  const selectedCategoriesDisplay = document.getElementById('selected-categories-display');
  const selectedCategoryName = document.getElementById('selected-category-name');

  // ✅ 다중계정용 UI 요소
  const maCategoryInput = document.getElementById('ma-content-category') as HTMLInputElement;
  const maCategoryBtnText = document.getElementById('ma-selected-category-text');
  const maCategoryDisplay = document.getElementById('ma-selected-categories-display');
  const maCategoryName = document.getElementById('ma-selected-category-name');
  const maAffiliateBtn = document.getElementById('ma-affiliate-mode-btn'); // 쇼핑커넥트 모드 버튼
  const maOpenBtnEl = maOpenBtn as HTMLElement;

  // 어떤 모드에서 열었는지 추적 ('smart-publish' | 'multi-account' | 'continuous' | 'ma-setting')
  let currentMode = 'smart-publish';

  const categoryNames: Record<string, string> = {
    'general': '💭 일상·생각',
    'literature': '📚 문학·책',
    'movie': '🎬 영화',
    'art_design': '🎨 미술·디자인',
    'performance': '🎭 공연·전시',
    'music': '🎵 음악',
    'drama': '📺 드라마',
    'celebrity': '⭐ 스타·연예인',
    'cartoon': '🎌 만화·애니',
    'broadcast': '📡 방송',
    'tips': '💡 생활 꿀팁',
    'parenting': '👶 육아·결혼',
    'pet': '🐶 반려동물',
    'good_writing': '🖼️ 좋은글·이미지',
    'fashion': '👗 패션·미용',
    'interior': '🏠 인테리어·DIY',
    'food_recipe': '🍳 요리·레시피',
    'shopping_review': '📦 상품리뷰',
    'gardening': '🌱 원예·재배',
    'game': '🎮 게임',
    'sports': '⚽ 스포츠',
    'photo': '📷 사진',
    'car': '🚗 자동차',
    'hobby': '🎯 취미',
    'travel_domestic': '🗺️ 국내여행',
    'travel_world': '✈️ 세계여행',
    'tasty_restaurant': '🍽️ 맛집',
    'it_computer': '💻 IT·컴퓨터',
    'society_politics': '📰 사회·정치',
    'health': '🏥 건강·의학',
    'business_economy': '💼 비즈니스·경제',
    'language': '🌍 어학·외국어',
    'education_scholarship': '🎓 교육·학문',
    'realestate': '🏢 부동산',
    'self_dev': '📈 자기계발'
  };
  (window as any).categoryNames = categoryNames;

  // ✅ 모달 열림 직후 클릭으로 인한 즉시 닫힘 방지 플래그
  let justOpened = false;

  // 공통 열기 로직 (hoisted by using function declaration or moving up)
  function openModal(mode: 'smart-publish' | 'multi-account' | 'continuous' | 'ma-setting' | 'continuous-settings' | 'edit-queue') {
    if (!modal) {
      console.error('[CategoryModal] Modal element not found');
      return;
    }
    currentMode = mode;
    // setAttribute를 사용해서 스타일을 강제로 설정 (!important 포함)
    const modalStyle = 'display: flex !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(0, 0, 0, 0.8) !important; z-index: 999999 !important; align-items: center !important; justify-content: center !important;';
    modal.setAttribute('style', modalStyle);
    console.log('[CategoryModal] Style attribute set:', modal.getAttribute('style'));

    let targetValue = '';
    if (mode === 'smart-publish') targetValue = categorySelect?.value || '';
    else if (mode === 'multi-account') targetValue = maCategoryInput?.value || '';
    else if (mode === 'continuous') {
      const contInput = document.getElementById('continuous-category-select') as HTMLInputElement;
      targetValue = contInput?.value || '';
    } else if (mode === 'continuous-settings') {
      const modalCategoryInput = document.getElementById('continuous-modal-category-select') as HTMLInputElement;
      targetValue = modalCategoryInput?.value || '';
    } else if (mode === 'edit-queue') {
      const editCategoryInput = document.getElementById('edit-queue-category') as HTMLInputElement;
      targetValue = editCategoryInput?.value || '';
    } else if (mode === 'ma-setting') {
      const settingInput = document.getElementById('ma-setting-category') as HTMLInputElement;
      targetValue = settingInput?.value || '';
    }

    if (targetValue) {
      const radio = modal.querySelector(`input[name="category-radio"][value="${targetValue}"]`) as HTMLInputElement;
      if (radio) radio.checked = true;
    }

    // 디버그: 모달 상태 확인
    console.log(`[CategoryModal] Modal opened in ${mode} mode, target: ${targetValue}`);
    console.log('[CategoryModal] Modal element:', modal);
    console.log('[CategoryModal] Modal display:', modal.style.display);
    console.log('[CategoryModal] Modal zIndex:', modal.style.zIndex);
    console.log('[CategoryModal] Modal computed display:', window.getComputedStyle(modal).display);
    console.log('[CategoryModal] Modal offsetParent:', modal.offsetParent);
    console.log('[CategoryModal] Modal getBoundingClientRect:', modal.getBoundingClientRect());

    // ✅ 이벤트 버블링으로 인한 즉시 닫힘 방지
    justOpened = true;
    setTimeout(() => {
      justOpened = false;
    }, 100);
  }

  // ✅ 전역 함수로 노출하여 HTML의 onclick에서도 접근 가능하도록 함
  (window as any).openUnifiedCategoryModal = () => {
    console.log('[CategoryModal] Global openUnifiedCategoryModal called');
    openModal('smart-publish');
  };

  // 모달 동기화 함수 노출
  (window as any).syncModalWithSmartPublish = () => {
    const targetValue = categorySelect?.value || '';
    if (targetValue && modal) {
      const radio = modal.querySelector(`input[name="category-radio"][value="${targetValue}"]`) as HTMLInputElement;
      if (radio) radio.checked = true;
    }
  };

  // ✅ 설정창용 모달 열기 함수 노출
  (window as any).openCategoryModalInSettingMode = () => {
    openModal('ma-setting');
  };

  // ✅ 연속 발행 모드용 모달 열기 함수 노출
  (window as any).openCategoryModalInContinuousMode = (mode?: string) => {
    openModal((mode as any) || 'continuous');
  };

  if (!openBtn || !modal) {
    console.warn('[CategoryModal] 카테고리 모달 초기화 필수 요소(btn/modal)가 부족하여 일부 초기화만 진행');
    return;
  }


  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal('smart-publish');
  });
  if (maOpenBtn) maOpenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal('multi-account');
  });
  if (maSettingOpenBtn) maSettingOpenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal('ma-setting');
  });
  if (continuousOpenBtn) continuousOpenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal('continuous');
  });
  if (continuousCategoryBtn) continuousCategoryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal('continuous');
  });

  // 모달 닫기 함수
  const closeModal = () => {
    console.log('[CategoryModal] closeModal called - closing modal');
    console.trace('[CategoryModal] Close stack trace:');
    modal.style.display = 'none';

    // z-index 충돌 회피로 임시 숨겨진 부모 모달 복원 (HeadingImageSettings.ts:150 패턴)
    const modalsToRestore = ['ma-fullauto-setting-modal', 'continuous-settings-modal', 'continuous-mode-modal', 'ma-publish-modal', 'multi-account-modal'];
    modalsToRestore.forEach(modalId => {
      const m = document.getElementById(modalId);
      if (m && m.getAttribute('data-was-visible') === 'true') {
        m.style.visibility = 'visible';
        m.removeAttribute('data-was-visible');
        console.log(`[CategoryModal] ✅ ${modalId} 복원됨`);
      }
    });
  };

  // 닫기 버튼
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });
  }

  // 취소 버튼
  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });
  }

  // 배경 클릭 시 닫기 - 이벤트가 모달 배경에서 직접 발생한 경우에만
  // [v2.10.110] 디버그 console.log 제거 — console.log 인자 평가는 빌드 no-op 후에도 실행됨.
  // (target 객체 직렬화 비용 + 핸들러 자체가 클릭마다 호출).
  modal.addEventListener('click', (e) => {
    if (justOpened) return;
    if (e.target === modal) closeModal();
  });

  // 라디오 버튼 호버 효과
  const categoryItems = modal.querySelectorAll('.category-checkbox-item');
  categoryItems.forEach(item => {
    item.addEventListener('mouseenter', () => {
      (item as HTMLElement).style.background = 'rgba(59, 130, 246, 0.1)';
    });
    item.addEventListener('mouseleave', () => {
      const radio = item.querySelector('input[type="radio"]') as HTMLInputElement;
      if (!radio?.checked) {
        (item as HTMLElement).style.background = 'transparent';
      }
    });
  });

  // ✅ 리뷰형 선택 가능한 카테고리 목록 (신규 고유 ID 대응)
  const reviewableCategories = [
    'fashion', 'interior', 'shopping_review', 'car', 'game', 'hobby',
    'pet', 'food_recipe', 'it_computer', 'travel_domestic', 'travel_world',
    'literature', 'movie', 'drama', 'cartoon', 'art_design', 'performance',
    'music', 'photo', 'parenting'
  ];

  // ✅ 글 유형 선택 UI 표시/숨김
  const contentTypeSelector = document.getElementById('content-type-selector');
  const selectedCategoryForType = document.getElementById('selected-category-for-type');

  // 카테고리 라디오 버튼 클릭 시 글 유형 선택 UI 표시
  const categoryRadios = modal.querySelectorAll('input[name="category-radio"]');
  categoryRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const value = target.value;
      const label = target.parentElement?.querySelector('span')?.textContent || categoryNames[value] || value;

      if (reviewableCategories.includes(value) && contentTypeSelector) {
        contentTypeSelector.style.display = 'block';
        if (selectedCategoryForType) {
          selectedCategoryForType.textContent = label;
        }
      } else if (contentTypeSelector) {
        contentTypeSelector.style.display = 'none';

        // ✅ 리뷰형 선택이 남아있지 않도록 info로 강제
        const infoRadio = modal.querySelector('input[name="content-type-radio"][value="info"]') as HTMLInputElement;
        if (infoRadio) infoRadio.checked = true;
      }
    });
  });

  // 선택 완료 버튼
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const selectedRadio = modal.querySelector('input[name="category-radio"]:checked') as HTMLInputElement;

      if (!selectedRadio) {
        alert('⚠️ 카테고리를 선택해주세요.');
        return;
      }

      let value = selectedRadio.value;
      const label = selectedRadio.parentElement?.querySelector('span')?.textContent || categoryNames[value] || value;

      if (currentMode === 'smart-publish') {
        // ---- [스마트 자동발행 로직] ----

        // ✅ 글 유형 선택 확인 (리뷰형/정보형)
        const contentTypeRadio = modal.querySelector('input[name="content-type-radio"]:checked') as HTMLInputElement;
        const contentType = reviewableCategories.includes(value) ? (contentTypeRadio?.value || 'info') : 'info';
        const isReviewType = contentType === 'review';

        // ✅ 리뷰형 선택 시 카테고리를 리뷰 버전으로 변경
        if (isReviewType && reviewableCategories.includes(value)) {
          // 리뷰형 선택 시 특정 카테고리로 매핑 (네이버 로직 대응)
          if (value === 'it_computer' || value === 'shopping_review') {
            // 이미 리뷰 성격의 카테고리면 유지
          } else if (['game', 'photo', 'art_design', 'music', 'it_computer'].includes(value)) {
            value = 'it_computer'; // 소품/IT류 리뷰는 IT·컴퓨터로
          } else {
            value = 'shopping_review'; // 나머지는 상품리뷰로
          }
        }

        // hidden select 업데이트
        if (categorySelect) {
          console.log('[CategoryModal] Setting unified-article-type.value to:', selectedRadio.value);
          categorySelect.value = selectedRadio.value; // 원본 값 저장 (표시용)
          categorySelect.setAttribute('data-user-selected', 'true');
          categorySelect.dispatchEvent(new Event('change'));
          console.log('[CategoryModal] Final unified-article-type.value:', categorySelect.value);
        }

        // ✅ 글 유형 저장 (전역 변수)
        (window as any).selectedContentType = contentType;

        // 버튼 텍스트 업데이트
        const typeLabel = isReviewType ? ' (리뷰형)' : '';
        if (selectedCategoryText) {
          selectedCategoryText.textContent = label + typeLabel;
        }

        // 선택된 카테고리 표시
        if (selectedCategoriesDisplay && selectedCategoryName) {
          selectedCategoriesDisplay.style.display = 'block';
          selectedCategoryName.textContent = label + typeLabel;
        }

        // 버튼 스타일 변경
        if (isReviewType) {
          openBtn.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
        } else {
          openBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        }

        appendLog(`✅ 카테고리 선택됨: ${label}${typeLabel}`);

        // ✅ 글 유형 선택 UI 숨기기
        if (contentTypeSelector) {
          contentTypeSelector.style.display = 'none';
        }

      } else if (currentMode === 'multi-account') {
        // ---- [다중계정 로직] ----

        // 다중계정은 단순하게 선택된 원본 카테고리 값을 사용합니다.
        if (maCategoryInput) {
          maCategoryInput.value = value;
        }

        if (maCategoryBtnText) {
          maCategoryBtnText.textContent = label;
        }

        if (maCategoryDisplay && maCategoryName) {
          maCategoryDisplay.style.display = 'block';
          maCategoryName.textContent = label;
        }

        // ✅ 쇼핑커넥트 버튼 표시 로직
        // 원본 선택값이 리뷰 가능한 카테고리라면 쇼핑커넥트 모드 버튼을 보여줍니다.
        if (maAffiliateBtn) {
          if (reviewableCategories.includes(value)) {
            maAffiliateBtn.style.display = 'flex';
            maAffiliateBtn.animate([
              { transform: 'scale(0.8)', opacity: 0 },
              { transform: 'scale(1)', opacity: 1 }
            ], { duration: 300, easing: 'ease-out' });
          } else {
            maAffiliateBtn.style.display = 'none';

            // 만약 현재 쇼핑커넥트 모드가 선택되어 있었다면 SEO 모드로 강제 변경
            const modeInput = document.getElementById('ma-content-mode') as HTMLInputElement;
            if (modeInput?.value === 'affiliate') {
              modeInput.value = 'seo';
              document.querySelector('.ma-content-mode-btn[data-mode="seo"]')?.classList.add('selected');
              document.querySelector('.ma-content-mode-btn[data-mode="affiliate"]')?.classList.remove('selected');
            }
          }
        }

        // 버튼 색상 변경 (녹색 고정)
        if (maOpenBtnEl) {
          maOpenBtnEl.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        }

        appendLog(`📂 [다중계정] 카테고리 선택됨: ${label}`);
      } else if (currentMode === 'continuous') {
        // ---- [연속발행 로직] ----
        const continuousCategoryInput = document.getElementById('continuous-category-select') as HTMLInputElement;
        const continuousCategoryBtnText = document.getElementById('continuous-category-text');
        const continuousCategoryBtn = document.getElementById('continuous-category-btn');

        if (continuousCategoryInput) {
          continuousCategoryInput.value = value;
        }

        if (continuousCategoryBtnText) {
          continuousCategoryBtnText.textContent = `📂 ${label}`;
        }

        // 버튼 스타일 변경
        if (continuousCategoryBtn) {
          continuousCategoryBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          continuousCategoryBtn.style.borderColor = '#10b981';
          continuousCategoryBtn.style.color = 'white';
        }

        appendLog(`📂 [연속발행] 카테고리 선택됨: ${label}`);
        // ✅ 쇼핑커넥트 옵션 표시 여부 업데이트
        if (typeof (window as any).updateAffiliateOptionVisibility === 'function') {
          (window as any).updateAffiliateOptionVisibility(value, 'continuous-modal-content-mode');
        }
      } else if (currentMode === 'continuous-settings') {
        // ---- [연속발행 상세 설정 로직] ----
        const modalCategoryInput = document.getElementById('continuous-modal-category-select') as HTMLInputElement;
        const modalCategoryText = document.getElementById('continuous-modal-category-text');

        // 메인 UI 요소 (동기화 대상)
        const mainCategoryInput = document.getElementById('continuous-category-select') as HTMLInputElement;
        const mainCategoryText = document.getElementById('continuous-category-text');

        if (modalCategoryInput) modalCategoryInput.value = value;
        if (modalCategoryText) modalCategoryText.textContent = label;
        if (mainCategoryInput) mainCategoryInput.value = value;
        if (mainCategoryText) mainCategoryText.textContent = `📂 ${label}`;

        appendLog(`📂 [연속발행 설정] 카테고리 선택됨: ${label}`);
        if (typeof (window as any).updateAffiliateOptionVisibility === 'function') {
          (window as any).updateAffiliateOptionVisibility(value, 'continuous-modal-content-mode');
        }
      } else if (currentMode === 'ma-setting') {
        // ---- [다중계정 설정창 로직] ----
        const settingCategoryInput = document.getElementById('ma-setting-category') as HTMLInputElement;
        const settingCategoryText = document.getElementById('ma-setting-category-text');

        if (settingCategoryInput) {
          settingCategoryInput.value = value;
        }

        if (settingCategoryText) {
          settingCategoryText.textContent = label;
        }

        appendLog(`📂 [다중계정 설정] 카테고리 선택됨: ${label}`);
        // ✅ 쇼핑커넥트 옵션 표시 여부 업데이트
        if (typeof (window as any).updateAffiliateOptionVisibility === 'function') {
          (window as any).updateAffiliateOptionVisibility(value, 'ma-setting-content-mode');
        }
      } else if (currentMode === 'edit-queue') {
        // ---- [큐 항목 수정 로직] ----
        if (typeof (window as any).openCategoryModalForEditQueue === 'function') {
          (window as any).openCategoryModalForEditQueue(value, label);
        }
        appendLog(`📂 [큐 수정] 카테고리 선택됨: ${label}`);
      }

      closeModal();
    });
  }

  console.log('[CategoryModal] 카테고리 모달 초기화 완료');
}

// ============================================
// 통합 탭 초기화
// ============================================
async function initUnifiedTab(): Promise<void> {
  console.log('[Unified] 통합 탭 초기화 시작');

  // URL 필드 관리 초기화
  try {
    initUnifiedUrlFields();
    console.log('[Unified] URL 필드 관리 초기화 완료');

    // ✅ 실시간 미리보기 동기화 초기화
    initUnifiedRealtimeSync();
  } catch (error) {
    console.error('[Unified] URL 필드 관리 초기화 실패:', error);
  }

  // ✅ [Fix] 반자동 편집 필드 변경 시 currentStructuredContent 동기화 (입력 리스너 등록)
  // 영상 생성 후 UI 리프레시 시 사용자가 직접 입력한 내용이 사라지는 문제 해결
  const semiAutoTitle = document.getElementById('unified-generated-title') as HTMLInputElement;
  const semiAutoContent = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
  const semiAutoHashtags = document.getElementById('unified-generated-hashtags') as HTMLInputElement;

  // ✅ [v2.10.280] 외부 LLM이 [제목]/[본문]/[해시태그] 마커로 출력한 글을 paste하면
  //   각 필드(title/content/hashtags)로 자동 분배. ## 마크다운 헤더는 headings로 추출.
  //   마커 없으면 휴리스틱 (첫 줄 40자 이내 = 제목, 끝의 #태그 = 해시태그).
  function _normalizeSemiAutoManualHeadingTitle(raw: string): string {
    return String(raw || '')
      .trim()
      .replace(/^\s{0,3}#{1,4}\s+/, '')
      .replace(/^\s*(?:소제목|제목|heading|section)\s*\d*\s*[:：.\-]\s*/i, '')
      .replace(/^\s*[\[(【]\s*(?:소제목|제목|heading|section)\s*\d*\s*[\])】]\s*/i, '')
      .replace(/^\s*\d{1,2}\s*[\).:：\-]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function _isSemiAutoManualHeadingCandidate(lines: string[], index: number): boolean {
    const raw = String(lines[index] || '').trim();
    if (!raw) return false;
    if (/^(?:#\S+\s*){2,}$/u.test(raw)) return false;
    if (/^(?:A|Q)\d?\s*[:：.]/i.test(raw)) return false;
    if (/^[-*•]\s+/.test(raw)) return false;

    const title = _normalizeSemiAutoManualHeadingTitle(raw);
    if (title.length < 3 || title.length > 80) return false;
    if (/^(?:본문|해시태그|태그|요약|마무리)$/u.test(title)) return false;

    if (/^\s{0,3}#{1,4}\s+/.test(raw)) return true;
    if (/^\s*(?:소제목|제목|heading|section)\s*\d*\s*[:：.\-]/i.test(raw)) return true;
    if (/^\s*[\[(【]\s*(?:소제목|제목|heading|section)/i.test(raw)) return true;
    if (/^\s*\d{1,2}\s*[\).:：\-]\s+\S/.test(raw) && !/[.!。]\s*$/.test(title)) return true;

    const prevBlank = index === 0 || String(lines[index - 1] || '').trim().length === 0;
    const nextNonEmpty = lines.slice(index + 1).find((line) => String(line || '').trim().length > 0)?.trim() || '';
    const sentenceLike = /(?:습니다|합니다|했어요|돼요|입니다|이에요|예요|했다|였다|된다|이다|다)\.?$/u.test(title) || /[.!?。？！]\s*$/u.test(title);
    const startsLikeQuote = /^[“"'‘’]/u.test(title);
    const hasHeadingKeyword = /(?:이유|지점|부분|질문|핵심|무엇인가|방법|정리|비교|분석|후기|반응|오해|결론|포인트|순서|기준|원인|진짜|체크리스트|루틴)$/u.test(title);
    return prevBlank && nextNonEmpty.length > 0 && !sentenceLike && !startsLikeQuote && (title.length <= 34 || hasHeadingKeyword);
  }

  function _extractSemiAutoManualHeadings(body: string): Array<{ title: string; content: string; prompt: string; source: string }> {
    return extractSemiAutoHeadingsFromBody(body);
  }

  function _parsePastedContent(raw: string): {
    title: string | null;
    body: string | null;
    hashtags: string | null;
    headings: string[];
  } {
    const text = raw.trim();
    if (!text) return { title: null, body: null, hashtags: null, headings: [] };

    // 1. 마커 기반 파싱 우선
    const titleMatch = text.match(/\[제목\]\s*\n([^\n]+)/);
    const bodyMatch = text.match(/\[본문\]\s*\n([\s\S]+?)(?=\n\[해시태그\]|\n\[태그\]|$)/);
    const tagsMatch = text.match(/\[(?:해시태그|태그)\]\s*\n([\s\S]+?)$/);

    if (titleMatch || bodyMatch || tagsMatch) {
      const body = bodyMatch?.[1]?.trim() || null;
      const headings = body ? _extractSemiAutoManualHeadings(body).map(h => h.title) : [];
      return {
        title: titleMatch?.[1]?.trim() || null,
        body,
        hashtags: tagsMatch?.[1]?.trim() || null,
        headings,
      };
    }

    // 2. 휴리스틱 fallback — 마커 없이 paste한 경우
    const lines = text.split('\n');
    const firstLine = lines[0]?.trim() || '';
    const lastNonEmpty = [...lines].reverse().find(l => l.trim().length > 0) || '';

    // 첫 줄이 40자 이내 + #으로 시작 안 함 → 제목 후보
    const likelyTitle = (firstLine.length > 0 && firstLine.length <= 40 && !firstLine.startsWith('#')) ? firstLine : null;
    // 마지막 비어있지 않은 줄이 #태그로 가득 → 해시태그
    const likelyTags = /^(#\S+\s*){3,}$/.test(lastNonEmpty) ? lastNonEmpty : null;

    let body = text;
    if (likelyTitle) body = body.replace(firstLine, '').trim();
    if (likelyTags) body = body.replace(lastNonEmpty, '').trim();

    const headings = _extractSemiAutoManualHeadings(body).map(h => h.title);

    return {
      title: likelyTitle,
      body: body || null,
      hashtags: likelyTags,
      headings,
    };
  }

  // ✅ [v2.10.278] paste 또는 직접 입력으로 textarea에 글이 들어오면 자동으로
  //   currentStructuredContent 생성 + 발행 버튼 활성화 + 미리보기 표시.
  //   기존 동작: sc가 null이면 input/paste 이벤트가 silent skip → 발행 못함.
  function _ensureSemiAutoStructuredContent(): any {
    let sc = (window as any).currentStructuredContent;
    if (sc) return sc;
    const titleEl = document.getElementById('unified-generated-title') as HTMLInputElement | null;
    const contentEl = document.getElementById('unified-generated-content') as HTMLTextAreaElement | null;
    const hashtagsEl = document.getElementById('unified-generated-hashtags') as HTMLInputElement | null;
    sc = {
      selectedTitle: titleEl?.value || '',
      title: titleEl?.value || '',
      bodyPlain: contentEl?.value || '',
      content: contentEl?.value || '',
      hashtags: hashtagsEl?.value || '',
      headings: [],
      _bodyManuallyEdited: true,
      _manualPasted: true,
    };
    (window as any).currentStructuredContent = sc;
    // 발행 버튼 활성화 + 미리보기 표시
    try { (window as any).markContentGenerated?.(); } catch { /* noop */ }
    try {
      const previewSection = document.getElementById('unified-preview-section');
      if (previewSection) previewSection.style.display = 'block';
    } catch { /* noop */ }
    // ✅ [v2.10.279] 미리보기 본문/제목/해시태그 즉시 채우기 — paste 직후 사용자 체감
    try { syncIntegratedPreviewFromInputs(); } catch { /* noop */ }
    try { (window as any).updateRiskIndicators?.(sc); } catch { /* noop */ }
    console.log('[SemiAuto] 사용자 paste/직접 입력 감지 → currentStructuredContent 자동 생성');
    return sc;
  }

  // ✅ [v2.10.279] sc가 이미 있을 때도 paste 후 미리보기 동기화
  function _refreshSemiAutoPreview(): void {
    try { syncIntegratedPreviewFromInputs(); } catch { /* noop */ }
    try {
      const sc = (window as any).currentStructuredContent;
      if (sc) (window as any).updateRiskIndicators?.(sc);
    } catch { /* noop */ }
  }

  let semiAutoHeadingAnalyzeTimer: ReturnType<typeof setTimeout> | null = null;

  function _scheduleSemiAutoHeadingAnalysis(sc: any): void {
    if (!sc || !Array.isArray(sc.headings) || sc.headings.length === 0) return;
    if (semiAutoHeadingAnalyzeTimer) clearTimeout(semiAutoHeadingAnalyzeTimer);
    semiAutoHeadingAnalyzeTimer = setTimeout(() => {
      semiAutoHeadingAnalyzeTimer = null;
      try {
        void autoAnalyzeHeadings(sc);
      } catch (error) {
        console.warn('[SemiAuto] heading auto-analysis failed:', error);
      }
    }, 450);
  }

  function _syncSemiAutoManualHeadings(sc: any, body: string): void {
    if (!sc || !body || body.trim().length < 20) return;
    const extracted = _extractSemiAutoManualHeadings(body);
    if (extracted.length === 0) return;
    const currentSignature = Array.isArray(sc.headings)
      ? sc.headings.map((h: any) => String(h?.title || '').trim()).filter(Boolean).join('|')
      : '';
    const nextSignature = extracted.map((h) => h.title).join('|');
    if (currentSignature === nextSignature) return;
    sc.headings = extracted;
    _scheduleSemiAutoHeadingAnalysis(sc);
  }

  if (semiAutoTitle) {
    const _syncTitle = () => {
      const v = semiAutoTitle.value;
      const sc = v.trim().length > 0 ? _ensureSemiAutoStructuredContent() : (window as any).currentStructuredContent;
      if (sc) {
        sc.title = v;
        sc.selectedTitle = v;
      }
    };
    semiAutoTitle.addEventListener('input', _syncTitle);
    semiAutoTitle.addEventListener('paste', () => setTimeout(_syncTitle, 0));
  }

  if (semiAutoContent) {
    const _syncContent = () => {
      const v = semiAutoContent.value;
      // 의미 있는 내용 있을 때만 sc 생성 (빈 입력 시 자동 생성 안 함)
      const sc = v.trim().length >= 10 ? _ensureSemiAutoStructuredContent() : (window as any).currentStructuredContent;
      // ✅ [v2.10.279] sc가 이미 있던 경우(글 불러오기 등)에도 paste 후 미리보기 동기화
      if (sc) { _refreshSemiAutoPreview(); }
      if (sc) {
        sc.bodyPlain = v;
        sc.content = v;
        // ✅ [2026-02-28] 사용자 직접 편집 플래그 — applyStructuredContent에서 100% 원문 반영 분기 활성화
        sc._bodyManuallyEdited = true;
        _syncSemiAutoManualHeadings(sc, v);
      }
    };
    semiAutoContent.addEventListener('input', _syncContent);

    // ✅ [v2.10.280] paste 시 마커/휴리스틱 파싱 (1차)
    // ✅ [v2.10.281] 마커 없으면 LLM 분류 IPC 호출 (2차 fallback) — Gemini Flash-Lite로 95%+ 정확도
    const _applyParsed = (parsed: { title: string | null; body: string | null; hashtags: string | null; headings: string[] }) => {
      if (parsed.body !== null) semiAutoContent.value = parsed.body;
      if (parsed.title && semiAutoTitle) {
        semiAutoTitle.value = parsed.title;
        semiAutoTitle.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (parsed.hashtags && semiAutoHashtags) {
        semiAutoHashtags.value = parsed.hashtags;
        semiAutoHashtags.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const sc = _ensureSemiAutoStructuredContent();
      if (sc) {
        const parsedHeadings = parsed.headings.length > 0
          ? parsed.headings.map((title: string) => ({ title, prompt: title, source: 'semi-auto:pasted-heading' }))
          : _extractSemiAutoManualHeadings(semiAutoContent.value);
        if (parsedHeadings.length > 0) {
          sc.headings = parsedHeadings;
          _scheduleSemiAutoHeadingAnalysis(sc);
        }
      }
      _refreshSemiAutoPreview();
      try {
        (window as any).toastManager?.success?.(`📋 자동 분배 완료 (소제목 ${parsed.headings.length}개)`);
      } catch { /* noop */ }
    };

    semiAutoContent.addEventListener('paste', () => {
      setTimeout(async () => {
        const pasted = semiAutoContent.value;
        if (!pasted || pasted.trim().length < 20) {
          _syncContent();
          return;
        }

        // 1차: 마커 기반 파싱
        const parsed = _parsePastedContent(pasted);
        const markerHit = !!(parsed.title || parsed.hashtags || (parsed.body !== null && parsed.body !== pasted.trim()));

        if (markerHit) {
          _applyParsed(parsed);
          _syncContent();
          return;
        }

        // 2차: LLM 분류 fallback — 마커 없는 자유 형식
        try {
          (window as any).toastManager?.info?.('🤖 글 구조 자동 분석 중... (1~3초)', 3000);
          const api: any = (window as any).api;
          if (typeof api?.pasteClassify !== 'function') {
            console.warn('[Paste] api.pasteClassify 미노출 — 휴리스틱만 적용');
            _syncContent();
            return;
          }
          const result = await api.pasteClassify(pasted);
          if (result?.success && (result.title || result.hashtags || result.headings?.length)) {
            _applyParsed({
              title: result.title || null,
              body: result.body || null,
              hashtags: result.hashtags || null,
              headings: result.headings || [],
            });
            console.log(`[Paste] LLM 분류 성공: title=${!!result.title}, hashtags=${!!result.hashtags}, headings=${result.headings?.length}개`);
          } else {
            console.warn('[Paste] LLM 분류 실패:', result?.error);
            try { (window as any).toastManager?.warning?.('⚠️ 자동 분배 실패 — 본문만 적용됨. 제목/해시태그 수동 입력 필요'); } catch { /* noop */ }
          }
        } catch (e) {
          console.warn('[Paste] LLM 분류 호출 에러:', e);
        } finally {
          _syncContent();
        }
      }, 0);
    });
  }

  if (semiAutoHashtags) {
    const _syncHashtags = () => {
      const sc = (window as any).currentStructuredContent;
      if (sc) {
        sc.hashtags = semiAutoHashtags.value;
      }
    };
    semiAutoHashtags.addEventListener('input', _syncHashtags);
    semiAutoHashtags.addEventListener('paste', () => setTimeout(_syncHashtags, 0));
  }

  // ✅ 카테고리 선택 모달 초기화
  initCategoryModal();
  initRealCategorySync();
  initContinuousCategorySync(); // ✅ 연속발행 모드용 카테고리 분석 초기화
  initMultiAccountCategorySync(); // ✅ 다중계정 발행 모드용 카테고리 분석 초기화

  // ✅ 페러프레이징 버튼 이벤트
  const paraphraseBtn = document.getElementById('paraphrase-mode-btn');
  if (paraphraseBtn) {
    paraphraseBtn.addEventListener('click', async () => {
      try {
        console.log('[Paraphrase] 버튼 클릭됨');
        await paraphraseContent();
      } catch (err) {
        console.error('[Paraphrase] 실행 중 오류:', err);
        toastManager.error(`❌ 페러프레이징 실패: ${(err as Error).message}`);
      }
    });
  } else {
    console.warn('[Paraphrase] paraphrase-mode-btn 요소를 찾을 수 없습니다!');
  }

  // ✅ 생성된 글 목록 새로고침 버튼
  const refreshPostsBtn = document.getElementById('refresh-posts-list-btn');
  if (refreshPostsBtn) {
    refreshPostsBtn.addEventListener('click', () => {
      refreshGeneratedPostsList();
    });
  }

  // ✅ 내보내기, 가져오기, 통계 버튼 이벤트 리스너 (초기화 시 한 번만 연결)
  const exportBtn = document.getElementById('export-posts-btn');
  if (exportBtn && !exportBtn.hasAttribute('data-listener-added')) {
    exportBtn.setAttribute('data-listener-added', 'true');
    exportBtn.addEventListener('click', () => {
      exportAllPosts();
    });
  }

  const importBtn = document.getElementById('import-posts-btn');
  if (importBtn && !importBtn.hasAttribute('data-listener-added')) {
    importBtn.setAttribute('data-listener-added', 'true');
    importBtn.addEventListener('click', () => {
      importPosts();
    });
  }

  const statsBtn = document.getElementById('posts-stats-btn');
  if (statsBtn && !statsBtn.hasAttribute('data-listener-added')) {
    statsBtn.setAttribute('data-listener-added', 'true');
    statsBtn.addEventListener('click', () => {
      showPostsStatsDashboard();
    });
  }

  const selectAllBtn = document.getElementById('posts-select-all-btn');
  if (selectAllBtn && !selectAllBtn.hasAttribute('data-listener-added')) {
    selectAllBtn.setAttribute('data-listener-added', 'true');
    selectAllBtn.addEventListener('click', () => {
      toggleSelectAllPosts();
    });
  }

  const batchDeleteBtn = document.getElementById('posts-batch-delete-btn');
  if (batchDeleteBtn && !batchDeleteBtn.hasAttribute('data-listener-added')) {
    batchDeleteBtn.setAttribute('data-listener-added', 'true');
    batchDeleteBtn.addEventListener('click', () => {
      batchDeletePosts();
    });
  }

  const viewToggleBtn = document.getElementById('posts-view-toggle-btn');
  if (viewToggleBtn && !viewToggleBtn.hasAttribute('data-listener-added')) {
    viewToggleBtn.setAttribute('data-listener-added', 'true');
    viewToggleBtn.addEventListener('click', () => {
      togglePostsView();
    });
  }

  const refreshBtn = document.getElementById('refresh-posts-list-btn');
  if (refreshBtn && !refreshBtn.hasAttribute('data-listener-added')) {
    refreshBtn.setAttribute('data-listener-added', 'true');
    refreshBtn.addEventListener('click', () => {
      refreshGeneratedPostsList();
    });
  }

  // 초기 로드 시 목록 표시
  // ✅ [2026-02-22 FIX] try-catch로 감싸서 TDZ 에러가 initUnifiedTab을 종료하지 않도록 방지
  // GENERATED_POSTS_CATEGORY_COLLAPSE_PREFIX가 아직 초기화되지 않았을 수 있음
  try {
    refreshGeneratedPostsList();
  } catch (e) {
    console.warn('[Unified] refreshGeneratedPostsList 초기 로드 실패 (TDZ), 500ms 후 재시도:', e);
    setTimeout(() => {
      try { refreshGeneratedPostsList(); } catch { /* ignore */ }
    }, 500);
  }

  // ✅ 로그 및 진행상황 초기화 버튼 이벤트 리스너
  const unifiedResetLogBtn = document.getElementById('unified-reset-log-btn');
  const unifiedResetProgressBtn = document.getElementById('unified-reset-progress-btn');
  const imagesResetLogBtn = document.getElementById('images-reset-log-btn');
  const imagesResetProgressBtn = document.getElementById('images-reset-progress-btn');

  if (unifiedResetLogBtn) {
    unifiedResetLogBtn.addEventListener('click', () => {
      resetLogAndProgress('unified-log-output');
    });
  }

  if (unifiedResetProgressBtn) {
    unifiedResetProgressBtn.addEventListener('click', () => {
      resetLogAndProgress(undefined, 'unified-progress-container');
    });
  }

  if (imagesResetLogBtn) {
    imagesResetLogBtn.addEventListener('click', () => {
      resetLogAndProgress('images-log-output');
    });
  }

  if (imagesResetProgressBtn) {
    imagesResetProgressBtn.addEventListener('click', () => {
      resetLogAndProgress(undefined, 'images-progress-container');
    });
  }

  // 발행 모드 선택
  try {
    initUnifiedModeSelection();
    console.log('[Unified] 발행 모드 선택 초기화 완료');
  } catch (error) {
    console.error('[Unified] 발행 모드 선택 초기화 실패:', error);
  }

  // 이미지 소스 선택
  try {
    initUnifiedImageSourceSelection();
    console.log('[Unified] 이미지 소스 선택 초기화 완료');
  } catch (error) {
    console.error('[Unified] 이미지 소스 선택 초기화 실패:', error);
  }

  // ✅ 썸네일 텍스트 옵션 체크박스 동적 추가 (풀오토/반자동)
  try {
    addThumbnailTextOptionUI();
    console.log('[Unified] 썸네일 텍스트 옵션 UI 추가 완료');
  } catch (error) {
    console.error('[Unified] 썸네일 텍스트 옵션 UI 추가 실패:', error);
  }

  // ✅ [2026-02-12] "글 생성 시 이미지 수집도 같이하기" 체크박스 UI
  try {
    if (typeof injectAutoCollectCheckboxUI === 'function') {
      injectAutoCollectCheckboxUI();
    } else {
      console.warn('[Unified] injectAutoCollectCheckboxUI 미로드 — 건너뜀');
    }
    console.log('[Unified] 이미지 자동 수집 체크박스 UI 추가 완료');
  } catch (error) {
    console.error('[Unified] 이미지 자동 수집 체크박스 UI 추가 실패:', error);
  }

  // 발행 모드 관련 코드 제거 (발행설정의 풀오토/반자동으로 대체)

  // ✅ URL에서 키워드 추출 버튼
  const extractKeywordsBtn = document.getElementById('extract-keywords-btn') as HTMLButtonElement;
  if (extractKeywordsBtn && !extractKeywordsBtn.hasAttribute('data-listener-added')) {
    extractKeywordsBtn.setAttribute('data-listener-added', 'true');
    console.log('[Unified] extract-keywords-btn 이벤트 리스너 등록');

    extractKeywordsBtn.addEventListener('click', async () => {
      console.log('[Unified] 키워드 추출 버튼 클릭됨');

      // URL 필드에서 첫 번째 URL 가져오기 (클래스명 수정: unified-url-field -> unified-url-input)
      const urlFields = document.querySelectorAll('.unified-url-input') as NodeListOf<HTMLInputElement>;
      const firstUrl = urlFields[0]?.value.trim();

      if (!firstUrl) {
        toastManager.warning('📝 URL을 먼저 입력해주세요.');
        return;
      }

      // URL 유효성 검사
      try {
        new URL(firstUrl);
      } catch {
        alert('❌ 올바른 URL 형식이 아닙니다.\n\n예: https://example.com/article');
        return;
      }

      const originalText = extractKeywordsBtn.textContent;
      extractKeywordsBtn.disabled = true;

      // ✅ 로딩 애니메이션 시작
      const loadingSteps = [
        '🔄 URL 접속 중...',
        '📥 콘텐츠 수집 중...',
        '🤖 AI 분석 중...',
        '🎯 키워드 추출 중...'
      ];
      let stepIndex = 0;
      const loadingInterval = setInterval(() => {
        extractKeywordsBtn.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 0.25rem;">${loadingSteps[stepIndex]}</span>`;
        stepIndex = (stepIndex + 1) % loadingSteps.length;
      }, 1500);

      extractKeywordsBtn.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 0.25rem;">${loadingSteps[0]}</span>`;

      appendLog('🎯 URL에서 키워드 추출 시작...');
      appendLog(`📎 URL: ${firstUrl}`);

      try {
        // 1. generateStructuredContent API를 사용하여 URL 크롤링 및 키워드 추출
        appendLog('📥 URL 크롤링 및 AI 키워드 분석 중... (약 10~30초 소요)');

        const generator = UnifiedDOMCache.getGenerator();

        const keywordPrompt = `다음 URL의 콘텐츠를 분석하여 핵심 키워드와 제목을 추출해주세요.
- 원본 글의 주제와 핵심 내용을 가장 잘 나타내는 제목을 한 줄로 추출합니다.
- 추출된 제목에는 "블로그 상위노출", "진짜 이유", "핵심 팁" 같은 지침성 단어나 예시 문구를 포함하지 마세요.

URL: ${firstUrl}

[추출 요청]
1. 핵심 키워드 1개 (메인 키워드)
2. 서브 키워드 3~5개 (연관 키워드)
3. 롱테일 키워드 2~3개 (세부 키워드)
4. 원본 글 제목

[출력 형식 - 반드시 이 형식으로만 출력]
제목: [원본 글 제목]
핵심: [핵심키워드]
서브: [키워드1], [키워드2], [키워드3]
롱테일: [롱테일1], [롱테일2]

키워드와 제목만 간결하게 출력하세요.`;

        // generateStructuredContent API 사용
        const apiClient = EnhancedApiClient.getInstance();
        const apiResponse = await apiClient.call(
          'generateStructuredContent',
          [{
            assembly: {
              generator: generator as 'gemini' | 'openai' | 'claude' | 'perplexity',
              rssUrl: firstUrl,
              targetAge: 'all',
              minChars: 500,
              articleType: 'general',
              customPrompt: keywordPrompt
            }
          }],
          {
            retryCount: 3,
            retryDelay: 2000,
            timeout: 900000 // ✅ 15분 타임아웃 (크롤링 + 모델 폴백 체인 고려)
          }
        );

        if (!apiResponse.success) {
          throw new Error(apiResponse.error || '키워드 추출에 실패했습니다.');
        }

        appendLog('✅ URL 분석 완료!');

        // 결과에서 키워드 추출
        const result = apiResponse.data;
        let mainKeyword = '';
        let subKeywords: string[] = [];
        let longTailKeywords: string[] = [];
        let originalTitle = '';

        // structuredContent에서 정보 추출
        if (result?.content) {
          const content = result.content;

          // 제목 추출
          originalTitle = content.selectedTitle || content.title || '';

          // 해시태그에서 키워드 추출
          if (content.hashtags && content.hashtags.length > 0) {
            mainKeyword = content.hashtags[0].replace('#', '');
            subKeywords = content.hashtags.slice(1, 5).map((h: string) => h.replace('#', ''));
          }

          // 소제목에서 추가 키워드 추출
          if (content.headings && content.headings.length > 0) {
            const headingKeywords = content.headings
              .slice(0, 3)
              .map((h: any) => h.title || h)
              .filter((t: string) => t && t.length < 20);
            longTailKeywords = headingKeywords;
          }
        }

        // 4. 키워드 필드에 자동 입력
        const keywordsInput = document.getElementById('unified-keywords') as HTMLInputElement;
        if (keywordsInput) {
          const allKeywords = [mainKeyword, ...subKeywords].filter(k => k).join(', ');
          keywordsInput.value = allKeywords;
          appendLog(`📝 키워드 필드에 자동 입력됨: ${allKeywords}`);
        }

        // 5. 결과 표시
        appendLog('\n🎯 ===== 키워드 추출 결과 =====');
        appendLog(`📰 원본 제목: ${originalTitle || '(추출 실패)'}`);
        appendLog(`🔑 핵심 키워드: ${mainKeyword || '(추출 실패)'}`);
        appendLog(`📌 서브 키워드: ${subKeywords.join(', ') || '(추출 실패)'}`);
        appendLog(`🔍 롱테일 키워드: ${longTailKeywords.join(', ') || '(추출 실패)'}`);
        appendLog('================================\n');

        // 6. 토스트 메시지
        toastManager.success(`✅ 키워드 추출 완료!\n핵심: ${mainKeyword}`);

        // 7. 제목 필드가 비어있으면 제목 제안 (지침/예시 문구 유출 방지 로직 포함)
        const titleInput = document.getElementById('unified-title') as HTMLInputElement;
        if (titleInput && !titleInput.value.trim() && originalTitle) {
          // ✅ 지침성 단어나 시스템 예시가 포함된 가짜 제목 필터링
          const lowerTitle = originalTitle.toLowerCase();
          const riskPatterns = [
            '상위노출', '실패하는 진짜 이유', '핵심 팁', '꿀팁 대방출', '꼭 확인해야 할',
            '끝판왕 제목', '알고보니', '경악한 이유', '진실 공개', '몰랐던 진실',
            '홈판 노출', '제목 공식', '노출 방법', '클릭률', '블로그 노출', '필수 체크'
          ];

          const isHallucinated = riskPatterns.some(p => lowerTitle.includes(p.toLowerCase()));

          if (isHallucinated) {
            appendLog(`⚠️ 추출된 제목에서 지침성 문구 감지됨 (무시): ${originalTitle}`);
          } else {
            titleInput.value = originalTitle;
            appendLog(`📝 제목 필드에 원본 제목 입력됨: ${originalTitle}`);
          }
        }

      } catch (error) {
        console.error('[KeywordExtract] 오류:', error);
        appendLog(`❌ 키워드 추출 실패: ${(error as Error).message}`);
        toastManager.error(`키워드 추출 실패: ${(error as Error).message}`);
      } finally {
        // ✅ 로딩 애니메이션 정리
        clearInterval(loadingInterval);
        extractKeywordsBtn.disabled = false;
        extractKeywordsBtn.textContent = originalText || '🎯 키워드 추출';
      }
    });
  }

  // URL로 AI 글 생성하기 버튼
  const generateFromUrlBtn = document.getElementById('generate-from-url-btn') as HTMLButtonElement;
  if (generateFromUrlBtn && !generateFromUrlBtn.hasAttribute('data-listener-added')) {
    generateFromUrlBtn.setAttribute('data-listener-added', 'true');
    console.log('[Unified] generate-from-url-btn 이벤트 리스너 등록');

    generateFromUrlBtn.addEventListener('click', async () => {
      console.log('[Unified] generate-from-url-btn 클릭됨');
      appendLog('🔄 URL로 AI 글 생성 버튼 클릭됨');

      try {
        // ✅ 글 생성 전 필수 선택 강제
        if (!ensurePreGenerationSelectionsOrWarn()) {
          return;
        }

        // ✅ [2026-01-16] 카테고리 검증은 ensurePreGenerationSelectionsOrWarn()에서 이미 수행됨
        // 중복 검증 제거하여 버그 방지

        const urls = getUnifiedUrls();
        console.log('[Unified] 수집된 URLs:', urls);

        if (urls.length === 0) {
          alert('⚠️ 유효한 URL을 입력해주세요.');
          appendLog('⚠️ 유효한 URL이 없습니다.');
          return;
        }

        // 버튼 비활성화 및 상태 표시
        generateFromUrlBtn.disabled = true;
        generateFromUrlBtn.textContent = '🔄 글 생성 중...';

        appendLog(`🔄 ${urls.length}개 URL 중 첫 번째 URL로 콘텐츠 생성 시작...`);
        appendLog(`   URL: ${urls[0]}`);

        // 여러 URL 중 첫 번째로 콘텐츠 생성
        const toneStyle = UnifiedDOMCache.getToneStyle();
        await generateContentFromUrl(urls[0], undefined, toneStyle);

        // ✅ 반자동 미리보기 섹션 강제 표시
        if (currentStructuredContent) {
          console.log('[Unified] URL 생성 완료 -> 반자동 필드 채우기 실행', currentStructuredContent);
          fillSemiAutoFields(currentStructuredContent);
          const semiAutoElem = document.getElementById('unified-semi-auto-section');
          if (semiAutoElem) semiAutoElem.style.display = 'block';
        } else {
          console.error('[Unified] URL 생성 완료되었으나 currentStructuredContent가 없음');
        }

        appendLog(`✅ ${urls.length}개 URL 중 첫 번째 URL로 콘텐츠 생성 완료`);

        // ✅ [2026-01-16] 쿼터/라이선스 UI 갱신
        if (typeof (window as any).updateFreeQuota === 'function') {
          void (window as any).updateFreeQuota();
        }


        // 성공 알림은 generateContentFromUrl 내부에서 이미 표시됨
      } catch (error) {
        console.error('[Unified] URL 기반 글 생성 오류:', error);
        const errorMessage = (error as Error).message || '알 수 없는 오류가 발생했습니다.';
        // [v2.10.115] alert → toast — native alert이 main thread 8초+ block (PerformanceObserver SEVERE).
        //   사용자가 "확인" 누르기까지 JS 이벤트 루프 정지. toast는 main thread block 안 함.
        toastManager.error(`❌ 글 생성 실패: ${errorMessage}`);
        appendLog(`❌ URL 기반 글 생성 실패: ${errorMessage}`);
      } finally {
        // 버튼 상태 복원
        if (generateFromUrlBtn) {
          generateFromUrlBtn.disabled = false;
          generateFromUrlBtn.textContent = '🔄 URL로 AI 글 생성하기';
        }
      }
    });
  } else if (generateFromUrlBtn) {
    console.log('[Unified] generate-from-url-btn 이벤트 리스너 이미 등록됨');
  } else {
    console.warn('[Unified] generate-from-url-btn 요소를 찾을 수 없음!');
  }

  // ✅ [2026-02-13] 키워드 제목 옵션 체크박스 상호 배타 로직
  const keywordAsTitleCheckbox = document.getElementById('keyword-as-title') as HTMLInputElement;
  const keywordTitlePrefixCheckbox = document.getElementById('keyword-title-prefix') as HTMLInputElement;

  if (keywordAsTitleCheckbox && !keywordAsTitleCheckbox.hasAttribute('data-listener-added')) {
    keywordAsTitleCheckbox.setAttribute('data-listener-added', 'true');
    keywordAsTitleCheckbox.addEventListener('change', () => {
      if (keywordAsTitleCheckbox.checked && keywordTitlePrefixCheckbox) {
        keywordTitlePrefixCheckbox.checked = false;
      }
    });
  }
  if (keywordTitlePrefixCheckbox && !keywordTitlePrefixCheckbox.hasAttribute('data-listener-added')) {
    keywordTitlePrefixCheckbox.setAttribute('data-listener-added', 'true');
    keywordTitlePrefixCheckbox.addEventListener('change', () => {
      if (keywordTitlePrefixCheckbox.checked && keywordAsTitleCheckbox) {
        keywordAsTitleCheckbox.checked = false;
      }
    });
  }

  // 키워드,제목으로 AI 글 생성하기 버튼
  const generateManualBtn = document.getElementById('generate-manual-btn') as HTMLButtonElement;
  if (generateManualBtn && !generateManualBtn.hasAttribute('data-listener-added')) {
    generateManualBtn.setAttribute('data-listener-added', 'true');
    console.log('[Unified] generate-manual-btn 이벤트 리스너 등록');

    generateManualBtn.addEventListener('click', async () => {
      console.log('[Unified] generate-manual-btn 클릭됨');
      appendLog('🔄 키워드/제목으로 AI 글 생성 버튼 클릭됨');

      try {
        // ✅ 글 생성 전 필수 선택 강제
        if (!ensurePreGenerationSelectionsOrWarn()) {
          return;
        }

        // ✅ [2026-01-16] 카테고리 검증은 ensurePreGenerationSelectionsOrWarn()에서 이미 수행됨
        // 중복 검증 제거하여 버그 방지

        // 제목 필드가 제거되어 키워드만 사용 (제목은 AI가 자동 생성)
        let title = ''; // UI에서 제목 필드 제거됨
        const keywords = (document.getElementById('unified-keywords') as HTMLInputElement)?.value?.trim();

        if (!keywords) {
          alert('⚠️ 키워드를 입력해주세요. AI가 키워드를 기반으로 제목과 글을 자동 생성합니다.');
          return;
        }

        // ✅ [2026-02-13] 키워드 제목 옵션 확인
        const useKeywordAsTitle = (document.getElementById('keyword-as-title') as HTMLInputElement)?.checked || false;
        const useKeywordTitlePrefix = (document.getElementById('keyword-title-prefix') as HTMLInputElement)?.checked || false;

        if (useKeywordAsTitle) {
          title = keywords; // 키워드를 그대로 제목으로 사용
          appendLog(`📌 키워드를 제목으로 사용: "${title}"`);
        }

        // 버튼 비활성화 및 상태 표시
        generateManualBtn.disabled = true;
        generateManualBtn.textContent = '🔄 글 생성 중...';

        appendLog(`🔄 키워드 기반 콘텐츠 생성 시작...`);
        appendLog(`   키워드: ${keywords}`);
        if (useKeywordTitlePrefix) {
          appendLog(`🔝 키워드를 제목 맨 앞에 배치합니다.`);
        }

        // ✅ [2026-02-13] 키워드 제목 옵션을 window 전역으로 전달 (contentGenerator에서 참조)
        (window as any)._keywordTitleOptions = {
          useKeywordAsTitle,
          useKeywordTitlePrefix,
          keyword: keywords
        };

        await generateContentFromKeywords(title, keywords);

        // ✅ [2026-02-16] fillSemiAutoFields는 generateContentFromKeywords 내부(L20196)에서 이미 호출됨
        // 중복 호출 제거 — 제목·로그가 2번 출력되는 버그의 직접 원인

        // ✅ [2026-01-16] 쿼터/라이선스 UI 갱신 (키워드 생성 완료 시)
        if (typeof (window as any).updateFreeQuota === 'function') {
          void (window as any).updateFreeQuota();
        }

        // 성공 알림은 generateContentFromKeywords 내부에서 이미 표시됨
      } catch (error) {
        console.error('[Unified] 키워드 기반 글 생성 오류:', error);
        const errorMessage = (error as Error).message || '알 수 없는 오류가 발생했습니다.';

        // ✅ 오류 유형별 친절한 해결 가이드 제공
        let solutionGuide = '';

        if (errorMessage.includes('API 키') || errorMessage.includes('GEMINI_API_KEY') || errorMessage.includes('설정되지 않') || errorMessage.includes('Perplexity')) {
          // ✅ [2026-03-30 FIX] 선택된 AI 엔진에 따라 맞춤 API 키 안내 제공
          const currentGenerator = UnifiedDOMCache.getGenerator();
          if (currentGenerator === 'perplexity' || errorMessage.includes('Perplexity')) {
            solutionGuide = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 Perplexity API 키 문제 해결 방법
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Perplexity 웹 구독(유료 플랜)과 API 키는 별도입니다!

1️⃣ https://www.perplexity.ai/settings/api 접속
2️⃣ "Generate API Key" 클릭하여 키 발급
3️⃣ 발급된 API 키 복사
4️⃣ 앱 환경설정(⚙️) 버튼 클릭
5️⃣ "Perplexity API Key" 입력란에 붙여넣기
6️⃣ "저장" 버튼 클릭 후 다시 시도

💡 API 키는 "pplx-"로 시작합니다
💡 API 사용에는 별도 크레딧 충전이 필요할 수 있습니다
`;
          } else {
            solutionGuide = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 API 키 문제 해결 방법
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ 환경설정(⚙️) 버튼 클릭
2️⃣ Gemini API 키 입력란 확인
3️⃣ API 키가 비어있으면:
   • Google AI Studio 접속
   • https://aistudio.google.com
   • "Get API Key" 클릭하여 키 생성
4️⃣ 키 입력 후 "저장" 버튼 클릭
5️⃣ 다시 시도하기

💡 API 키는 "AIza"로 시작합니다
`;
          }
        } else if (errorMessage.includes('타임아웃') || errorMessage.includes('timeout') || errorMessage.includes('시간 초과')) {
          solutionGuide = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️ 응답 지연 해결 방법
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ 인터넷 연결 확인
2️⃣ VPN 사용 중이면 끄기
3️⃣ 다른 프로그램 종료
4️⃣ 30초 대기 후 다시 시도

💡 네트워크가 느리면 시간이 걸릴 수 있어요
💡 "네트워크 진단" 버튼으로 확인해보세요
`;
        } else if (errorMessage.includes('네트워크') || errorMessage.includes('network') || errorMessage.includes('연결')) {
          solutionGuide = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 네트워크 문제 해결 방법
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ WiFi 또는 인터넷 연결 확인
2️⃣ 방화벽에서 앱 허용 확인
3️⃣ VPN 끄기 (사용 중인 경우)
4️⃣ 회사/학교 네트워크면 모바일 핫스팟 사용
5️⃣ 앱 재시작 후 다시 시도

💡 환경설정의 "네트워크 진단" 버튼 활용!
`;
        } else {
          solutionGuide = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 일반 해결 방법
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ 앱 완전히 종료 후 재시작
2️⃣ 환경설정에서 API 키 다시 저장
3️⃣ 컴퓨터 재부팅 후 시도
4️⃣ 환경설정 → "네트워크 진단" 실행

💡 문제가 지속되면 개발자에게 문의해주세요
`;
        }

        // [v2.10.115] alert → toast (8초 main thread block 차단)
        toastManager.error(`❌ 글 생성 실패: ${errorMessage}`);
        appendLog(`❌ 키워드 기반 글 생성 실패: ${errorMessage}`);
        appendLog(solutionGuide);
      } finally {
        // 버튼 상태 복원
        if (generateManualBtn) {
          generateManualBtn.disabled = false;
          generateManualBtn.textContent = '🔄 키워드,제목으로 AI 글 생성하기';
        }
      }
    });
  } else if (generateManualBtn) {
    console.log('[Unified] generate-manual-btn 이벤트 리스너 이미 등록됨');
  } else {
    console.warn('[Unified] generate-manual-btn 요소를 찾을 수 없음!');
  }

  // 풀오토 발행 버튼
  const fullAutoPublishBtn = document.getElementById('full-auto-publish-btn') as HTMLButtonElement;
  if (fullAutoPublishBtn) {
    fullAutoPublishBtn.addEventListener('click', async () => {
      try {
        // ✅ 중지 플래그 초기화
        (window as any).stopFullAutoPublish = false;

        // 발행 시작 알림 표시
        showPublishStartNotification('풀오토 발행을 시작합니다!');

        // 진행률 표시 초기화
        initializePublishProgress();

        // ✅ 중지 버튼 표시 및 발행 버튼 비활성화
        showStopButton();
        fullAutoPublishBtn.disabled = true;
        fullAutoPublishBtn.innerHTML = '<span style="font-size: 2rem;">⏳</span><span>실행 중...</span><span style="font-size: 0.75rem; opacity: 0.9;">잠시만 기다려주세요</span>';
        automationRunning = true;

        await handleFullAutoPublish();

        // ✅ [2026-01-16] 쿼터/라이선스 UI 갱신 (풀오토 발행 완료 시)
        if (typeof (window as any).updateFreeQuota === 'function') {
          void (window as any).updateFreeQuota();
        }
      } catch (error) {
        console.error('[Unified] 풀오토 발행 오류:', error);
        alert(`풀오토 발행 중 오류가 발생했습니다: ${(error as Error).message}`);
      } finally {
        // ✅ 중지 버튼 숨기기 및 발행 버튼 복원
        hideStopButton();
        enableFullAutoPublishButton();
        fullAutoPublishBtn.innerHTML = '<span style="font-size: 2rem;">⚡</span><span>풀오토 발행</span><span style="font-size: 0.75rem; opacity: 0.9;">콘텐츠 생성 → 이미지 생성 → 발행 (한 번에)</span>';
        automationRunning = false;
      }
    });
  }

  // 반자동 발행 버튼
  const semiAutoPublishBtn = document.getElementById('semi-auto-publish-btn') as HTMLButtonElement;
  if (semiAutoPublishBtn) {
    semiAutoPublishBtn.addEventListener('click', async () => {
      try {
        // ✅ 중지 플래그 초기화
        (window as any).stopFullAutoPublish = false;

        // 발행 시작 알림 표시
        showPublishStartNotification('반자동 발행을 시작합니다!');

        // 진행률 표시 초기화
        initializePublishProgress();

        // ✅ 중지 버튼 표시 및 발행 버튼 비활성화
        showStopButton();
        semiAutoPublishBtn.disabled = true;
        semiAutoPublishBtn.innerHTML = '<span style="font-size: 2rem;">⏳</span><span>실행 중...</span><span style="font-size: 0.75rem; opacity: 0.9;">잠시만 기다려주세요</span>';
        automationRunning = true;

        await handleSemiAutoPublish();

        // ✅ [2026-02-28] 쿼터/라이선스 UI 갱신 (반자동 발행 완료 시)
        if (typeof (window as any).updateFreeQuota === 'function') {
          void (window as any).updateFreeQuota();
        }
      } catch (error) {
        console.error('[Unified] 반자동 발행 오류:', error);
        alert(`반자동 발행 중 오류가 발생했습니다: ${(error as Error).message}`);
      } finally {
        // ✅ 중지 버튼 숨기기 및 발행 버튼 복원
        hideStopButton();
        enableSemiAutoPublishButton();
        semiAutoPublishBtn.innerHTML = '<span style="font-size: 2rem;">🔧</span><span>반자동 발행</span><span style="font-size: 0.75rem; opacity: 0.9;">수동 수정 후 발행</span>';

        // ✅ 반자동 발행 완료 후에도 풀오토 발행 버튼이 계속 비활성화로 남지 않도록 복구
        const fullAutoBtn = document.getElementById('full-auto-publish-btn') as HTMLButtonElement | null;
        if (fullAutoBtn) {
          enableFullAutoPublishButton();
          fullAutoBtn.innerHTML = '<span style="font-size: 2rem;">⚡</span><span>풀오토 발행</span><span style="font-size: 0.75rem; opacity: 0.9;">콘텐츠 생성 → 이미지 생성 → 발행 (한 번에)</span>';
        }

        automationRunning = false;
      }
    });
  }

  // ✅ 계정 탭 전환 (1개 계정 / 다중계정)
  const singleAccountTab = document.getElementById('single-account-tab') as HTMLButtonElement;
  const multiAccountTab = document.getElementById('multi-account-tab') as HTMLButtonElement;
  const singleAccountContent = document.getElementById('single-account-content');
  const multiAccountContent = document.getElementById('multi-account-content');

  // 현재 선택된 탭 모드 저장
  let currentAccountMode: 'single' | 'multi' = 'single';
  // 인라인 다중계정 선택 목록
  let inlineSelectedAccountIds: string[] = [];

  function updateTabStyles() {
    if (currentAccountMode === 'single') {
      singleAccountTab.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      singleAccountTab.style.color = 'white';
      multiAccountTab.style.background = 'var(--bg-tertiary)';
      multiAccountTab.style.color = 'var(--text-muted)';
      if (singleAccountContent) singleAccountContent.style.display = 'block';
      if (multiAccountContent) multiAccountContent.style.display = 'none';
    } else {
      multiAccountTab.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
      multiAccountTab.style.color = 'white';
      singleAccountTab.style.background = 'var(--bg-tertiary)';
      singleAccountTab.style.color = 'var(--text-muted)';
      if (singleAccountContent) singleAccountContent.style.display = 'none';
      if (multiAccountContent) multiAccountContent.style.display = 'block';
      renderInlineAccountList();

      // ✅ 다중계정 탭 전환 시에도 썸네일 텍스트 옵션 UI를 다시 시도
      try {
        addThumbnailTextOptionUI();
      } catch (e) {
        console.warn('[renderer] catch ignored:', e);
      }
    }
  }

  singleAccountTab?.addEventListener('click', () => {
    currentAccountMode = 'single';
    updateTabStyles();
  });

  multiAccountTab?.addEventListener('click', () => {
    currentAccountMode = 'multi';
    updateTabStyles();
  });

  // 인라인 계정 목록 렌더링
  async function renderInlineAccountList() {
    const container = document.getElementById('ma-accounts-inline');
    const noAccountsMsg = document.getElementById('ma-no-accounts-inline');
    if (!container) return;

    try {
      const result = await window.api.getAllBlogAccounts();
      if (!result.success || !result.accounts || result.accounts.length === 0) {
        container.innerHTML = '';
        if (noAccountsMsg) {
          noAccountsMsg.style.display = 'block';
          container.appendChild(noAccountsMsg);
        }
        return;
      }

      const accounts = result.accounts;
      if (noAccountsMsg) noAccountsMsg.style.display = 'none';

      container.innerHTML = accounts.map((account: any) => {
        const isSelected = inlineSelectedAccountIds.includes(account.id);
        return `
          <div class="ma-inline-account" data-account-id="${account.id}" style="
            display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem;
            background: ${isSelected ? 'rgba(139, 92, 246, 0.15)' : 'transparent'};
            border: 1px solid ${isSelected ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255,255,255,0.1)'};
            border-radius: 8px; margin-bottom: 0.5rem; cursor: pointer; transition: all 0.2s;
          ">
            <input type="checkbox" class="ma-inline-checkbox" data-account-id="${account.id}" ${isSelected ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; color: var(--text-strong); font-size: 0.9rem;">👤 ${account.name}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">ID: ${account.blogId || account.name}</div>
            </div>
            <div style="display: flex; gap: 0.35rem; flex-shrink: 0;" onclick="event.stopPropagation();">
              <button type="button" class="ma-inline-edit-btn" data-account-id="${account.id}" style="padding: 0.3rem 0.5rem; background: rgba(59, 130, 246, 0.2); color: #3b82f6; border: 1px solid #3b82f6; border-radius: 5px; font-size: 0.7rem; cursor: pointer;" title="편집">⚙️</button>
              <button type="button" class="ma-inline-delete-btn" data-account-id="${account.id}" style="padding: 0.3rem 0.5rem; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; border-radius: 5px; font-size: 0.7rem; cursor: pointer;" title="삭제">🗑️</button>
            </div>
          </div>
        `;
      }).join('');

      // 체크박스 이벤트
      container.querySelectorAll('.ma-inline-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
          const target = e.target as HTMLInputElement;
          const accountId = target.dataset.accountId;
          if (!accountId) return;

          if (target.checked) {
            if (!inlineSelectedAccountIds.includes(accountId)) {
              inlineSelectedAccountIds.push(accountId);
            }
          } else {
            inlineSelectedAccountIds = inlineSelectedAccountIds.filter(id => id !== accountId);
          }
          updateInlineSelectedCount();
          renderInlineAccountList();
        });
      });

      // 카드 클릭으로도 선택 가능
      container.querySelectorAll('.ma-inline-account').forEach(card => {
        card.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button')) return;
          const accountId = (card as HTMLElement).dataset.accountId;
          if (!accountId) return;

          if (inlineSelectedAccountIds.includes(accountId)) {
            inlineSelectedAccountIds = inlineSelectedAccountIds.filter(id => id !== accountId);
          } else {
            inlineSelectedAccountIds.push(accountId);
          }
          updateInlineSelectedCount();
          renderInlineAccountList();
        });
      });

      // ✅ 편집 버튼 이벤트
      container.querySelectorAll('.ma-inline-edit-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const accountId = (e.target as HTMLElement).dataset.accountId;
          if (accountId && typeof (window as any).openAccountEditModal === 'function') {
            (window as any).openAccountEditModal(accountId);
          }
        });
      });

      // ✅ 삭제 버튼 이벤트
      container.querySelectorAll('.ma-inline-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const accountId = (e.target as HTMLElement).dataset.accountId;
          if (!accountId) return;

          if (!confirm('정말로 이 계정을 삭제하시겠습니까?')) return;

          try {
            const result = await window.api.removeBlogAccount(accountId);
            if (result.success) {
              toastManager.success('계정이 삭제되었습니다.');
              inlineSelectedAccountIds = inlineSelectedAccountIds.filter(id => id !== accountId);
              // 모든 계정 목록 새로고침
              if (typeof (window as any).refreshAllAccountLists === 'function') {
                await (window as any).refreshAllAccountLists();
              } else {
                await renderInlineAccountList();
              }
            } else {
              toastManager.error(result.message || '계정 삭제 실패');
            }
          } catch (error) {
            console.error('[InlineAccountList] 삭제 오류:', error);
            toastManager.error('삭제 중 오류가 발생했습니다.');
          }
        });
      });

    } catch (error) {
      console.error('[InlineAccountList] 오류:', error);
    }
  }

  function updateInlineSelectedCount() {
    const countEl = document.getElementById('ma-selected-count-inline');
    if (countEl) {
      countEl.textContent = `${inlineSelectedAccountIds.length}개`;
    }
  }

  // ✅ 발행 대기열 시스템
  interface PublishQueueItem {
    id: string;
    accountId: string;
    accountName: string;
    title: string;
    structuredContent: any;
    generatedImages: any[];
    formData: any;
    createdAt: string;
    // ✅ [2026-03-17] 예약 발행 필드 추가 (scheduleDistributor 동기화)
    publishMode?: 'publish' | 'draft' | 'schedule';
    scheduleDate?: string;
    scheduleTime?: string;
    scheduleType?: 'app-schedule' | 'naver-server';
    scheduleUserModified?: boolean; // ✅ [2026-04-01 PIPELINE-GUARD] 예약 보호 플래그
  }

  let publishQueue: PublishQueueItem[] = [];

  // 대기열 UI 업데이트
  function updateQueueUI() {
    const queueList = document.getElementById('publish-queue-list');
    const queueCount = document.getElementById('queue-count');
    const queueEmptyMsg = document.getElementById('queue-empty-msg');
    const batchPublishBtn = document.getElementById('batch-publish-btn') as HTMLButtonElement;

    if (queueCount) queueCount.textContent = String(publishQueue.length);

    if (batchPublishBtn) {
      batchPublishBtn.textContent = `🚀 일괄 발행 (${publishQueue.length}개)`;
      batchPublishBtn.disabled = publishQueue.length === 0;
      batchPublishBtn.style.opacity = publishQueue.length === 0 ? '0.5' : '1';
    }

    if (!queueList) return;

    if (publishQueue.length === 0) {
      queueList.innerHTML = `
        <div id="queue-empty-msg" style="text-align: center; padding: 2rem; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📭</div>
          <div>대기열이 비어있습니다</div>
          <div style="font-size: 0.8rem; margin-top: 0.25rem;">글과 이미지를 세팅한 후 계정을 선택하고 "대기열에 추가"를 클릭하세요</div>
        </div>
      `;
      return;
    }

    queueList.innerHTML = publishQueue.map((item, index) => {
      // 이미지 썸네일 생성 (최대 3개)
      const images = item.generatedImages || [];
      const thumbnailsHtml = images.slice(0, 3).map((img: any) => {
        const imgRaw = img.previewDataUrl || img.dataUrl || img.url || img.filePath || '';
        const imgSrc = toFileUrlMaybe(String(imgRaw || '').trim());
        if (!imgSrc) return '';
        return `<img src="${imgSrc}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(139, 92, 246, 0.3);" onerror="this.style.display='none'">`;
      }).join('');
      const moreCount = images.length > 3 ? `<div style="width: 40px; height: 40px; background: rgba(139, 92, 246, 0.3); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: #8b5cf6;">+${images.length - 3}</div>` : '';

      return `
      <div class="queue-item" data-queue-id="${item.id}" style="
        display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem;
        background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3);
        border-radius: 8px; margin: 0.5rem; transition: all 0.2s;
      ">
        <div style="font-size: 1.5rem; color: #8b5cf6; font-weight: 700;">${index + 1}</div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: var(--text-strong); font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="color: #f59e0b;">👤</span> <span>${item.accountName}</span>
            ${item.publishMode === 'schedule' && item.scheduleDate ? `<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.65rem; font-weight: 600;">📅 ${item.scheduleDate} ${item.scheduleTime || ''}</span>` : item.publishMode === 'draft' ? `<span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.65rem; font-weight: 600;">📝 임시저장</span>` : ''}
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.25rem;">
            📝 ${item.title || '제목 없음'}
          </div>
          <div style="display: flex; gap: 0.25rem; margin-top: 0.5rem; align-items: center;">
            ${thumbnailsHtml || '<span style="font-size: 0.7rem; color: var(--text-muted);">🖼️ 이미지 없음</span>'}
            ${moreCount}
            ${images.length > 0 ? `<span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 0.5rem;">(${images.length}개)</span>` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button type="button" class="queue-edit-btn" data-queue-id="${item.id}" style="
            padding: 0.4rem 0.6rem; background: rgba(59, 130, 246, 0.2); color: #3b82f6;
            border: 1px solid #3b82f6; border-radius: 6px; font-size: 0.75rem; cursor: pointer;
          ">✏️ 수정</button>
          <button type="button" class="queue-delete-btn" data-queue-id="${item.id}" style="
            padding: 0.4rem 0.6rem; background: rgba(239, 68, 68, 0.2); color: #ef4444;
            border: 1px solid #ef4444; border-radius: 6px; font-size: 0.75rem; cursor: pointer;
          ">🗑️</button>
        </div>
      </div>
    `;
    }).join('');

    // 수정 버튼 이벤트
    queueList.querySelectorAll('.queue-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const queueId = (e.target as HTMLElement).dataset.queueId;
        if (queueId) loadQueueItemForEdit(queueId);
      });
    });

    // 삭제 버튼 이벤트
    queueList.querySelectorAll('.queue-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const queueId = (e.target as HTMLElement).dataset.queueId;
        if (queueId) removeFromQueue(queueId);
      });
    });
  }

  // 현재 세팅 수집
  function collectCurrentSettings(): { structuredContent: any; generatedImages: any[]; formData: any; title: string } | null {
    const structuredContent = (window as any).currentStructuredContent;
    // ✅ generatedImages와 imageManagementGeneratedImages 둘 다 확인
    let currentImages = (window as any).generatedImages || [];
    if (currentImages.length === 0) {
      currentImages = (window as any).imageManagementGeneratedImages || [];
    }

    // ✅ 이미지 깊은 복사 (참조 공유 방지)
    const generatedImages = currentImages.map((img: any) => {
      if (!img) return null;
      return {
        ...img,
        url: img.url || '',
        filePath: img.filePath || '',
        previewDataUrl: img.previewDataUrl || img.url || img.filePath || '',
        heading: img.heading || '',
        prompt: img.prompt || '',
        provider: img.provider || '',
        isThumbnail: img.isThumbnail || false,
        headingIndex: img.headingIndex ?? -1,
      };
    }).filter((img: any) => img !== null);

    if (!structuredContent || !structuredContent.selectedTitle) {
      return null;
    }

    // ✅ [Fix] 우선순위 변경: DOM 입력값(수정된 값) > 기존 structuredContent 값
    // 사용자가 수정한 제목/본문을 반영하기 위함
    const domTitle = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value?.trim();
    const title = domTitle || structuredContent.selectedTitle || '';

    const domContent = (document.getElementById('unified-generated-content') as HTMLTextAreaElement)?.value?.trim();

    // 구조화된 콘텐츠에도 반영 (대기열/저장 시 사용됨)
    if (domTitle) {
      structuredContent.selectedTitle = domTitle;
      // titleCandidates 등에도 반영하고 싶지만 복잡하므로 일단 selectedTitle만 업데이트
    }
    if (domContent) {
      structuredContent.content = domContent;
      structuredContent.bodyPlain = domContent;
    }

    // ✅ [2026-02-08 FIX] 폴백을 localStorage 기반으로 변경 — 사용자가 선택한 엔진 보존
    const imageSource = document.querySelector('.unified-img-source-btn.selected')?.getAttribute('data-source')
      || localStorage.getItem('fullAutoImageSource')
      || localStorage.getItem('globalImageSource')
      || 'nano-banana-pro';
    // ✅ [2026-04-18 FIX] SSOT 헬퍼 사용 — 배치 큐 저장 시 localStorage 반영 (이전: DOM만 읽어서 모달 설정 무시)
    const skipImages = isImageSkipEnabled();
    const skipCta = (document.getElementById('unified-skip-cta') as HTMLInputElement)?.checked || false;
    const ctasUi = readUnifiedCtasFromUi();
    const ctaText = ctasUi[0]?.text || (document.getElementById('unified-cta-text') as HTMLInputElement)?.value || '';
    const ctaLink = ctasUi[0]?.link || (document.getElementById('unified-cta-link') as HTMLInputElement)?.value || '';
    const ctaPosition = (document.getElementById('unified-cta-position') as HTMLSelectElement)?.value || 'bottom';
    // ✅ [2026-01-28 FIX] HeadingImageSettings 모달의 localStorage 설정 최우선
    // ✅ [2026-03-10 CLEANUP] full-auto-thumbnail-text, semi-auto-thumbnail-text 유령 참조 제거 → localStorage 단일 소스
    const includeThumbnailText =
      localStorage.getItem('thumbnailTextInclude') === 'true' ||
      (document.getElementById('thumbnail-text-include') as HTMLInputElement | null)?.checked ||
      false;

    const formData = {
      mode: 'full-auto',
      generator: UnifiedDOMCache.getGenerator(), // ✅ [2026-02-22 FIX] perplexity 지원
      imageSource,
      skipImages,
      skipCta,
      ctaText,
      ctaLink,
      ctas: skipCta ? [] : ctasUi,
      ctaPosition,
      includeThumbnailText,
      // ✅ [2026-03-17 FIX] 하드코딩 제거 → UI에서 실제 발행 모드 읽기 (scheduleDistributor 동기화)
      publishMode: (document.getElementById('unified-publish-mode') as HTMLInputElement)?.value || 'publish',
      structuredContent,
    };

    return { structuredContent, generatedImages, formData, title };
  }

  // 대기열에 추가
  async function addToQueue() {
    // ✅ [v2.10.44] 함수 진입 즉시 console.warn — v2.10.41 console.log no-op이라 warn 사용
    console.warn('[addToQueue] ▶ 함수 진입', {
      selectedAccounts: inlineSelectedAccountIds.length,
      hasContent: !!(window as any).currentStructuredContent,
      title: (window as any).currentStructuredContent?.selectedTitle,
      images: ((window as any).generatedImages || []).length,
    });

    if (inlineSelectedAccountIds.length === 0) {
      toastManager.warning('발행할 계정을 먼저 선택해주세요.');
      alert('⚠️ 발행할 계정을 먼저 선택하세요.\n\n위 계정 목록에서 1개 이상 체크해야 합니다.');
      return;
    }

    // ✅ [v2.10.43] 사용자 보고 '대기열 추가 안됨' 진단 강화
    //   기존: collectCurrentSettings null → toast만 잠깐 뜨고 사라져 사용자가 못 봄
    //   수정: 어느 조건이 실패했는지 구체적으로 alert + console.warn
    const sc = (window as any).currentStructuredContent;
    const imgsA = (window as any).generatedImages || [];
    const imgsB = (window as any).imageManagementGeneratedImages || [];
    console.warn('[대기열 추가] 진단:', {
      structuredContent: !!sc,
      selectedTitle: sc?.selectedTitle,
      titleLength: sc?.selectedTitle?.length || 0,
      generatedImages: imgsA.length,
      imageManagementGeneratedImages: imgsB.length,
    });

    if (!sc) {
      toastManager.warning('글이 생성되지 않았습니다.');
      alert('⚠️ 글이 아직 생성되지 않았습니다.\n\n먼저 글 생성 버튼을 눌러 글과 제목을 만들고,\n이미지를 세팅한 후 다시 시도하세요.');
      return;
    }
    if (!sc.selectedTitle || !String(sc.selectedTitle).trim()) {
      toastManager.warning('제목이 비어있습니다.');
      alert('⚠️ 글 제목이 비어있습니다.\n\n생성된 글의 제목을 확인하고\n빈 칸이 아닌지 확인해주세요.');
      return;
    }

    const settings = collectCurrentSettings();
    if (!settings) {
      // sc + selectedTitle 모두 OK인데도 null이면 다른 이유 (드물지만 방어)
      toastManager.warning('대기열 추가 실패 — 콘솔 로그를 확인해주세요.');
      alert('⚠️ 대기열 추가 실패\n\n글과 이미지가 모두 세팅된 것으로 보이지만\n예상치 못한 문제가 발생했습니다.\n\nF12 → Console 탭의 [대기열 추가] 진단 로그를 확인해주세요.');
      return;
    }

    // 선택된 각 계정에 대해 대기열 항목 생성
    const allAccounts = await window.api.getAllBlogAccounts();
    let addedCount = 0;

    // 수정 중인 아이디가 있는 경우 해당 아이디를 가진 항목을 업데이트
    const editingId = (window as any).currentEditingQueueId;
    let isUpdate = false;

    for (const accountId of inlineSelectedAccountIds) {
      const account = allAccounts.accounts?.find((a: any) => a.id === accountId);
      if (!account) continue;

      // 만약 수정 중이고, 현재 루프의 계정이 수정 중인 항목의 계정과 같다면 업데이트
      // (단, 다중 계정 선택 시에는 1개만 업데이트되고 나머지는 추가됨 - 이는 의도된 동작일 수 있음)

      let targetId = `queue-${Date.now()}-${accountId}-${Math.random().toString(36).substr(2, 5)}`;

      if (editingId) {
        const editingItem = publishQueue.find(i => i.id === editingId);
        if (editingItem && editingItem.accountId === accountId) {
          targetId = editingId;
          isUpdate = true;
        }
      }

      // 새 항목 추가 (동일 계정이라도 다른 글이면 추가될 수 있도록 덮어쓰기 로직 제거)
      // ✅ [2026-03-17 FIX] 예약 발행 정보를 대기열 항목에 보존 (scheduleDistributor 동기화)
      const currentPublishMode = settings.formData?.publishMode || 'publish';
      let currentScheduleDate: string | undefined;
      let currentScheduleTime: string | undefined;
      if (currentPublishMode === 'schedule') {
        const rawDateVal = (document.getElementById('unified-schedule-date') as HTMLInputElement)?.value || '';
        if (rawDateVal.includes('T')) {
          const parts = rawDateVal.split('T');
          currentScheduleDate = parts[0];
          currentScheduleTime = parts[1]?.substring(0, 5);
        } else if (rawDateVal.includes(' ')) {
          const parts = rawDateVal.split(' ');
          currentScheduleDate = parts[0];
          currentScheduleTime = parts[1]?.substring(0, 5);
        } else if (rawDateVal) {
          currentScheduleDate = rawDateVal;
        }
      }
      const currentScheduleType = currentPublishMode === 'schedule'
        ? ((document.getElementById('unified-schedule-type') as HTMLSelectElement)?.value as 'app-schedule' | 'naver-server' || 'naver-server')
        : undefined;

      const queueItem: PublishQueueItem = {
        id: targetId,
        accountId,
        accountName: account.name,
        title: settings.title,
        // [v2.10.110] structuredClone fast path + JSON fallback — non-serializable에도 안전.
        structuredContent: (() => { try { return structuredClone(settings.structuredContent); } catch { return JSON.parse(JSON.stringify(settings.structuredContent)); } })(),
        generatedImages: (() => { try { return structuredClone(settings.generatedImages); } catch { return JSON.parse(JSON.stringify(settings.generatedImages)); } })(),
        formData: (() => { try { return structuredClone(settings.formData); } catch { return JSON.parse(JSON.stringify(settings.formData)); } })(),
        createdAt: new Date().toISOString(),
        publishMode: currentPublishMode as 'publish' | 'draft' | 'schedule',
        scheduleDate: currentScheduleDate,
        scheduleTime: currentScheduleTime,
        scheduleType: currentScheduleType,
      };

      if (isUpdate && editingId) {
        // 기존 항목 교체
        const idx = publishQueue.findIndex(i => i.id === editingId);
        if (idx !== -1) {
          publishQueue[idx] = queueItem;
          appendLog(`♻️ ${account.name} 계정의 대기열 항목이 업데이트되었습니다.`);
        } else {
          publishQueue.push(queueItem);
        }
      } else {
        publishQueue.push(queueItem);
      }
      addedCount++;
    }

    // 수정 모드 종료
    (window as any).currentEditingQueueId = null;

    updateQueueUI();

    if (addedCount > 0) {
      if (isUpdate) {
        toastManager.success(`대기열 항목이 수정되었습니다.`);
      } else {
        toastManager.success(`${addedCount}개 계정이 대기열에 추가되었습니다. 화면이 초기화됩니다.`);
      }
      appendLog(`✅ ${addedCount}개 계정이 발행 대기열에 ${isUpdate ? '업데이트' : '추가'}되었습니다.`);

      // ✅ 자동 초기화 - 다음 글 작성을 위해
      resetCurrentSettings();
    } else {
      toastManager.info('선택된 계정의 대기열이 업데이트되었습니다.');
    }

    // 선택 해제
    inlineSelectedAccountIds = [];
    updateInlineSelectedCount();
    renderInlineAccountList();
  }

  // ✅ [New] 통합 탭 실시간 동기화 이벤트 리스너 등록
  function initUnifiedRealtimeSync(): void {
    const titleInput = document.getElementById('unified-generated-title');
    const contentArea = document.getElementById('unified-generated-content');
    const hashtagsInput = document.getElementById('unified-generated-hashtags');

    const inputs = [titleInput, contentArea, hashtagsInput];
    inputs.forEach(input => {
      if (input) {
        input.addEventListener('input', () => {
          syncIntegratedPreviewFromInputs();
        });
      }
    });
    console.log('[Init] 통합 미리보기 실시간 동기화 리스너 등록 완료');
  }

  // ✅ 현재 세팅 초기화 함수
  function resetCurrentSettings() {
    // 글로벌 변수 초기화
    (window as any).currentStructuredContent = null;
    (window as any).generatedImages = [];
    (window as any).imageManagementGeneratedImages = [];
    (window as any).currentEditingQueueId = null; // 수정 모드 안전 초기화
    generatedImages = [];

    // ✅ ImageManager 초기화
    ImageManager.clear();

    // 메인 탭 입력 필드 초기화
    const titleInput = document.getElementById('unified-generated-title') as HTMLInputElement;
    const contentArea = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
    const hashtagsInput = document.getElementById('unified-generated-hashtags') as HTMLInputElement;
    const urlInput = document.querySelector('.unified-url-input') as HTMLInputElement;
    const keywordsInput = document.getElementById('unified-keywords') as HTMLInputElement;
    const mainTitleInput = document.getElementById('unified-title') as HTMLInputElement;

    if (titleInput) titleInput.value = '';
    if (contentArea) contentArea.value = '';
    if (hashtagsInput) hashtagsInput.value = '';
    if (urlInput) urlInput.value = '';
    if (keywordsInput) keywordsInput.value = '';
    if (mainTitleInput) mainTitleInput.value = '';

    // ✅ 생성된 콘텐츠 미리보기 초기화 (unified-preview-*)
    const previewTitle = document.getElementById('unified-preview-title');
    if (previewTitle) previewTitle.textContent = '제목이 여기에 표시됩니다';

    const previewBody = document.getElementById('unified-preview-body');
    if (previewBody) previewBody.innerHTML = '<p style="color: var(--text-muted);">본문이 여기에 표시됩니다</p>';

    const previewHashtags = document.getElementById('unified-preview-hashtags');
    if (previewHashtags) previewHashtags.textContent = '';

    // 이미지 미리보기 초기화
    const imagePreviewContainer = document.getElementById('unified-image-preview');
    if (imagePreviewContainer) {
      imagePreviewContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🖼️</div>
          <div>이미지가 생성되면 여기에 표시됩니다</div>
        </div>
      `;
    }

    // 이미지 관리 탭 미리보기 초기화
    const imageManagementPreview = document.getElementById('image-preview-container');
    if (imageManagementPreview) {
      imageManagementPreview.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🖼️</div>
          <div style="font-size: 1.1rem;">먼저 메인 탭에서 글을 생성해주세요</div>
          <div style="font-size: 0.9rem; margin-top: 0.5rem;">소제목별 이미지 프롬프트가 여기에 표시됩니다</div>
        </div>
      `;
    }

    // ✅ 영어 프롬프트 미리보기 초기화
    const promptsContainer = document.getElementById('prompts-container');
    if (promptsContainer) {
      promptsContainer.innerHTML = '';
      promptsContainer.style.display = 'none';
    }

    // ✅ 생성된 이미지 그리드 초기화
    const generatedImagesGrid = document.getElementById('generated-images-grid');
    if (generatedImagesGrid) {
      generatedImagesGrid.style.display = 'flex';
      generatedImagesGrid.style.alignItems = 'center';
      generatedImagesGrid.style.justifyContent = 'center';
      generatedImagesGrid.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🖼️</div>
          <div style="font-size: 1rem; margin-bottom: 0.5rem;">이미지가 없습니다</div>
          <div style="font-size: 0.85rem;">이미지 소스를 선택하고 "이미지 생성하기"를 클릭하거나<br>"폴더에서 불러오기"로 이미지를 추가하세요</div>
        </div>
      `;
    }

    // ✅ 소제목 분석 결과 초기화
    const headingsAnalysis = document.getElementById('headings-analysis');
    if (headingsAnalysis) {
      headingsAnalysis.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📝</div>
          <div>소제목이 분석되면 여기에 표시됩니다</div>
        </div>
      `;
    }

    appendLog('🔄 화면이 초기화되었습니다. 다음 글을 작성해주세요.');
  }

  // 대기열에서 제거
  function removeFromQueue(queueId: string) {
    const item = publishQueue.find(i => i.id === queueId);
    if (item) {
      publishQueue = publishQueue.filter(i => i.id !== queueId);
      updateQueueUI();
      toastManager.info(`${item.accountName} 계정이 대기열에서 제거되었습니다.`);
      appendLog(`🗑️ ${item.accountName} 계정이 대기열에서 제거되었습니다.`);
    }
  }

  // 대기열 전체 삭제
  function clearQueue() {
    if (publishQueue.length === 0) return;
    if (!confirm(`대기열의 ${publishQueue.length}개 항목을 모두 삭제하시겠습니까?`)) return;

    publishQueue = [];
    updateQueueUI();
    toastManager.info('대기열이 비워졌습니다.');
    appendLog('🗑️ 발행 대기열이 비워졌습니다.');
  }

  // 대기열 항목 수정을 위해 불러오기
  function loadQueueItemForEdit(queueId: string) {
    const item = publishQueue.find(i => i.id === queueId);
    if (!item) return;

    // ✅ 수정 중인 아이디 추적
    (window as any).currentEditingQueueId = queueId;

    // 현재 세팅을 대기열 항목의 세팅으로 복원
    const restoredContent = JSON.parse(JSON.stringify(item.structuredContent));
    const restoredImages = JSON.parse(JSON.stringify(item.generatedImages));

    // ✅ 글로벌 변수 복원
    (window as any).currentStructuredContent = restoredContent;
    (window as any).generatedImages = restoredImages;
    (window as any).imageManagementGeneratedImages = restoredImages;

    try {
      hydrateImageManagerFromImages(restoredContent, restoredImages);
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    // ✅ [2026-02-12 P1 FIX #18] hydrate 후 sync 추가
    try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }

    // UI 업데이트 - 입력 필드
    const titleInput = document.getElementById('unified-generated-title') as HTMLInputElement;
    const contentArea = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
    const hashtagsInput = document.getElementById('unified-generated-hashtags') as HTMLInputElement;

    if (titleInput) titleInput.value = restoredContent.selectedTitle || '';
    if (contentArea) contentArea.value = restoredContent.bodyPlain || restoredContent.content || '';
    if (hashtagsInput) hashtagsInput.value = (restoredContent.hashtags || []).join(', ');

    // ✅ 생성된 콘텐츠 미리보기 업데이트 (unified-preview-*)
    updateUnifiedPreview(restoredContent);

    // ✅ 이미지 미리보기 업데이트
    if (restoredContent.headings && restoredImages) {
      // 메인 탭 이미지 미리보기
      updateUnifiedImagePreview(restoredContent.headings, restoredImages);

      // ✅ 이미지 관리 탭 - 생성된 이미지 미리보기
      displayGeneratedImages(restoredImages);

      // ✅ 이미지 관리 탭 - 영어 프롬프트 미리보기 업데이트
      setTimeout(() => {
        updatePromptItemsWithImages(restoredImages);
      }, 200);
    }

    // 해당 계정 선택
    inlineSelectedAccountIds = [item.accountId];
    updateInlineSelectedCount();
    renderInlineAccountList();

    toastManager.info(`${item.accountName} 계정의 세팅을 불러왔습니다. 수정 후 "대기열에 추가"를 클릭하세요.`);
    appendLog(`📝 ${item.accountName} 계정의 세팅을 불러왔습니다. (이미지 ${restoredImages.length}개)`);

    // 메인 탭으로 스크롤
    document.getElementById('unified-generated-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // 일괄 발행
  async function executeBatchPublish() {
    if (publishQueue.length === 0) {
      toastManager.warning('발행할 항목이 없습니다.');
      return;
    }

    let accountSettingsMap: Record<string, any> = {};
    try {
      const all = await window.api.getAllBlogAccounts();
      if (all.success && all.accounts) {
        accountSettingsMap = Object.fromEntries(all.accounts.map((a: any) => [a.id, a.settings || {}]));
      }
    } catch {
      accountSettingsMap = {};
    }

    const formatBatchInterval = (seconds: number): string => {
      const safe = Math.max(0, Math.floor(Number(seconds) || 0));
      if (safe >= 3600) {
        const hours = Math.floor(safe / 3600);
        const minutes = Math.floor((safe % 3600) / 60);
        return `${hours}시간${minutes > 0 ? ` ${minutes}분` : ''}`;
      }
      if (safe >= 60) {
        const minutes = Math.floor(safe / 60);
        const rest = safe % 60;
        return `${minutes}분${rest > 0 ? ` ${rest}초` : ''}`;
      }
      return `${safe}초`;
    };
    const getSafeBatchInterval = (requestedSeconds: number, totalItems: number) => {
      const requested = Number.isFinite(requestedSeconds) ? Math.max(0, Math.floor(requestedSeconds)) : 0;
      const minimum = totalItems >= 50 ? 600 : totalItems >= 10 ? 420 : 300;
      const safe = Math.min(86400, Math.max(requested, minimum));
      const reason = totalItems >= 50 ? '50개 이상 대량 발행 보호' : totalItems >= 10 ? '10개 이상 장기 발행 보호' : '다중계정 기본 보호';
      return { requested, safe, adjusted: safe !== requested, reason };
    };
    const applyBatchIntervalJitter = (intervalSeconds: number, floorSeconds: number): number => {
      const jitterFactor = 1 + (Math.random() * 2 - 1) * 0.25;
      return Math.min(86400, Math.max(floorSeconds, Math.round(intervalSeconds * jitterFactor)));
    };
    const waitBatchInterval = async (seconds: number): Promise<boolean> => {
      const ms = Math.max(0, Math.floor(seconds * 1000));
      const start = Date.now();
      while (Date.now() - start < ms) {
        if ((window as any).stopBatchPublish || (window as any).stopFullAutoPublish) return false;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return true;
    };
    const requestedIntervalSeconds = parseInt((document.getElementById('ma-interval-inline') as HTMLInputElement)?.value || '30');
    const intervalPolicy = getSafeBatchInterval(requestedIntervalSeconds, publishQueue.length);
    const intervalSeconds = intervalPolicy.safe;

    if (!confirm(`${publishQueue.length}개 계정에 순차적으로 발행합니다. 계속하시겠습니까?`)) return;

    appendLog(`🚀 일괄 발행 시작: ${publishQueue.length}개 계정`);
    if (intervalPolicy.adjusted) {
      appendLog(`🛡️ 안전 발행 간격 자동 조정: ${formatBatchInterval(intervalPolicy.requested)} → ${formatBatchInterval(intervalPolicy.safe)} (${intervalPolicy.reason})`);
    }

    // ✅ [2026-03-17] 예약 모드 항목들에 scheduleDistributor 시간 분산 적용
    // ✅ [2026-04-01 BUG-7/BUG-8 FIX] 이미 설정된 항목 보호 + 기본 간격 30분
    {
      const scheduleItems = publishQueue.filter(item => item.publishMode === 'schedule');
      if (scheduleItems.length > 1 && typeof (window as any).distributeWithProtection === 'function') {
        // ✅ [2026-04-01 BUG-7 FIX] 이미 모든 항목이 예약 시간을 가지고 있으면 재분배 건너뛰기
        const allHaveSchedule = scheduleItems.every(item => item.scheduleDate && item.scheduleTime);
        const autoItems = scheduleItems.filter(item => !item.scheduleUserModified);

        if (allHaveSchedule && autoItems.length === 0) {
          appendLog(`📅 모든 ${scheduleItems.length}개 예약 항목이 이미 설정됨 → 재분배 건너뜀`);
        } else {
          const firstItem = scheduleItems.find(item => !item.scheduleUserModified) || scheduleItems[0];
          (window as any).distributeWithProtection(scheduleItems, {
            baseDate: firstItem.scheduleDate || new Date().toISOString().split('T')[0],
            baseTime: firstItem.scheduleTime || '09:00',
            // ✅ [2026-04-01 BUG-8 FIX] 기본 간격 360→30분
            intervalMinutes: 30,
          }, (msg: string, level: string) => appendLog(`[예약분산] ${msg}`));
          appendLog(`📅 ${scheduleItems.length}개 예약 항목에 시간 분산 적용 완료`);
        }
        updateQueueUI(); // UI 갱신하여 분산된 시간 표시
      }
    }

    // ✅ 중지 플래그 초기화 및 중지 버튼 표시
    (window as any).stopBatchPublish = false;
    showStopButton();

    const batchPublishBtn = document.getElementById('batch-publish-btn') as HTMLButtonElement;
    if (batchPublishBtn) {
      batchPublishBtn.disabled = true;
      batchPublishBtn.textContent = '🔄 발행 중...';
    }

    let successCount = 0;
    let failCount = 0;
    const successIds: string[] = [];

    try {
      for (let i = 0; i < publishQueue.length; i++) {
        // ✅ 중지 버튼 클릭 확인
        if ((window as any).stopBatchPublish || (window as any).stopFullAutoPublish) {
          appendLog('⏹️ 일괄 발행이 사용자에 의해 중지되었습니다.');
          toastManager.warning('일괄 발행이 중지되었습니다.');
          break;
        }

        const item = publishQueue[i];

        try {
          appendLog(`📝 [${i + 1}/${publishQueue.length}] ${item.accountName} 계정 발행 시작...`);

          (window as any).currentPublishingAccountSettings = accountSettingsMap[item.accountId] || {};

          // 계정 자격 증명 가져오기
          const credResult = await window.api.getAccountCredentials(item.accountId);
          if (!credResult.success || !credResult.credentials) {
            appendLog(`❌ [${i + 1}/${publishQueue.length}] ${item.accountName}: 자격 증명을 가져올 수 없습니다.`);
            failCount++;
            continue;
          }

          // ✅ 중지 플래그 재확인 (자격 증명 가져온 후)
          if ((window as any).stopBatchPublish || (window as any).stopFullAutoPublish) {
            appendLog('⏹️ 일괄 발행이 사용자에 의해 중지되었습니다.');
            toastManager.warning('일괄 발행이 중지되었습니다.');
            break;
          }

          // 발행 실행
          const publishFormData = {
            ...item.formData,
            structuredContent: item.structuredContent,
          };

          // 현재 세팅을 이 항목의 세팅으로 설정
          (window as any).currentStructuredContent = item.structuredContent;
          (window as any).generatedImages = item.generatedImages;
          (window as any).imageManagementGeneratedImages = item.generatedImages;

          // ✅ 전역 generatedImages 변수도 업데이트
          generatedImages = item.generatedImages || [];

          try {
            hydrateImageManagerFromImages(item.structuredContent, item.generatedImages || []);
          } catch (e) {
            console.warn('[renderer] catch ignored:', e);
          }
          // ✅ [2026-02-12 P1 FIX #19] hydrate 후 sync 추가
          try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }

          // 네이버 ID/PW 설정
          const naverIdInput = document.getElementById('naver-id') as HTMLInputElement;
          const naverPwInput = document.getElementById('naver-password') as HTMLInputElement;
          if (naverIdInput) naverIdInput.value = credResult.credentials.naverId;
          if (naverPwInput) naverPwInput.value = credResult.credentials.naverPassword;

          // ✅ [2026-03-17 FIX] 대기열 항목의 발행 모드/예약 정보를 DOM에 반영
          // handleSemiAutoPublish()는 DOM에서 publishMode를 읽으므로, 호출 전에 DOM을 세팅해야 함
          const publishModeEl = document.getElementById('unified-publish-mode') as HTMLInputElement;
          const scheduleDateEl = document.getElementById('unified-schedule-date') as HTMLInputElement;
          if (publishModeEl && item.publishMode) {
            publishModeEl.value = item.publishMode;
          }
          if (scheduleDateEl && item.publishMode === 'schedule' && item.scheduleDate) {
            // datetime-local 형식: YYYY-MM-DDTHH:mm
            scheduleDateEl.value = `${item.scheduleDate}T${item.scheduleTime || '09:00'}`;
          }

          // ✅ 반자동 발행 실행 및 결과 추적
          appendLog(`🌐 브라우저를 열고 발행을 시작합니다... (${item.publishMode === 'schedule' ? `📅 예약: ${item.scheduleDate} ${item.scheduleTime}` : item.publishMode === 'draft' ? '📝 임시저장' : '⚡ 즉시발행'})`);

          // ✅ [2026-04-18 FIX] handleSemiAutoPublish를 직접 await — 타임아웃/리스너/race 전부 제거
          //    이전 구조(publishPromise + setTimeout 5분 + on('automation:status', ...)):
          //      - 5분 타임아웃이 실제 발행보다 짧음 → 1번째 계정 타임아웃 → 2번째부터 "이미 실행 중" 폭포
          //      - 리스너 해제 함수 미사용 → 계정마다 리스너 누적 → race
          //    새 구조: handleSemiAutoPublish → executeUnifiedAutomation → executeSemiAutoFlow → automationResult
          //      - 메인 자동화 IPC의 완료를 기다렸다 automationResult를 그대로 반환
          //      - 완료 후에만 다음 계정으로 진행 → 중복 실행 구조적으로 불가능
          let publishSuccess = false;
          let publishError: string = '';
          try {
            const automationResult: any = await handleSemiAutoPublish();
            // executeSemiAutoFlow → executeBlogPublishing이 반환하는 자동화 결과
            // withErrorHandling이 에러 삼키고 null 반환 시 automationResult === null
            if (automationResult && automationResult.success === true) {
              publishSuccess = true;
            } else if (automationResult?.cancelled) {
              publishError = '발행이 사용자에 의해 취소되었습니다.';
            } else {
              publishError = automationResult?.message || automationResult?.error || '발행 실패';
            }
          } catch (publishErr) {
            publishError = (publishErr as Error).message || '발행 중 예외 발생';
          }

          if (publishSuccess) {
            appendLog(`✅ [${i + 1}/${publishQueue.length}] ${item.accountName}: 발행 성공!`);
            successCount++;
            successIds.push(item.id);
          } else {
            appendLog(`❌ [${i + 1}/${publishQueue.length}] ${item.accountName}: ${publishError || '발행 실패'}`);
            failCount++;
          }

          // 다음 계정 발행 전 대기 (마지막 계정 제외)
          if (i < publishQueue.length - 1 && publishSuccess) {
            const waitSeconds = applyBatchIntervalJitter(intervalSeconds, intervalPolicy.safe);
            appendLog(`⏳ ${formatBatchInterval(waitSeconds)} 대기 중... (다음 발행까지)`);
            const waitOk = await waitBatchInterval(waitSeconds);
            if (!waitOk) {
              appendLog('⏹️ 일괄 발행이 사용자에 의해 중지되었습니다.');
              break;
            }
          }

        } catch (error) {
          appendLog(`❌ [${i + 1}/${publishQueue.length}] ${item.accountName}: ${(error as Error).message}`);
          failCount++;
        }
      }
    } finally {
      (window as any).currentPublishingAccountSettings = null;
    }

    appendLog(`🏁 일괄 발행 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
    toastManager.success(`일괄 발행 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

    // 성공한 항목 대기열에서 제거 (전체 삭제 대신 필터링)
    if (successIds.length > 0) {
      publishQueue = publishQueue.filter(item => !successIds.includes(item.id));
      updateQueueUI();
    }

    if (batchPublishBtn) {
      batchPublishBtn.disabled = publishQueue.length === 0;
      batchPublishBtn.textContent = `🚀 일괄 발행 (${publishQueue.length}개)`;
      batchPublishBtn.style.opacity = publishQueue.length === 0 ? '0.5' : '1';
    }

    // ✅ 중지 버튼 숨기기
    hideStopButton();
  }

  // ✅ [v2.10.44] 사용자 보고 '글생성+이미지 세팅 후에도 대기열 추가 안됨'
  //   원인 추정: addEventListener 호출 시점에 DOM 미준비, 또는 다른 listener가 가로챔
  //   방어: ① 직접 등록(타임스탬프 기록) ② document.body 위임 fallback ③ window 전역 노출
  const _addBtn = document.getElementById('add-to-queue-btn');
  if (_addBtn) {
    _addBtn.addEventListener('click', () => {
      (_addBtn as any).__lastDirectClick = Date.now();
      console.warn('[add-to-queue-btn] 직접 핸들러 호출');
      addToQueue();
    });
  } else {
    console.warn('[add-to-queue-btn] DOM에 버튼 없음 — 위임 fallback에 의존');
  }
  document.getElementById('clear-queue-btn')?.addEventListener('click', clearQueue);
  document.getElementById('batch-publish-btn')?.addEventListener('click', executeBatchPublish);

  // window 전역 노출 (DevTools 디버깅용)
  (window as any).__addToQueue = addToQueue;
  (window as any).__clearQueue = clearQueue;
  (window as any).__executeBatchPublish = executeBatchPublish;

  // 이벤트 위임 fallback — 직접 핸들러 미동작 시(100ms 내 호출 없으면) 위임이 실행
  document.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const btn = target.closest('button') as HTMLButtonElement | null;
    if (!btn) return;
    if (btn.id === 'add-to-queue-btn') {
      const lastDirect = (btn as any).__lastDirectClick;
      if (lastDirect && Date.now() - lastDirect < 100) return; // 직접 핸들러 정상 동작 → skip
      console.warn('[add-to-queue-btn] ⚠️ 직접 핸들러 미호출 → 위임 fallback 실행');
      addToQueue();
    }
  }, { capture: false });

  // 초기 UI 업데이트
  updateQueueUI();

  // 전체 선택/해제
  document.getElementById('ma-select-all-inline')?.addEventListener('click', async () => {
    const result = await window.api.getAllBlogAccounts();
    if (result.success && result.accounts) {
      inlineSelectedAccountIds = result.accounts.map((a: any) => a.id);
      updateInlineSelectedCount();
      renderInlineAccountList();
    }
  });

  document.getElementById('ma-deselect-all-inline')?.addEventListener('click', () => {
    inlineSelectedAccountIds = [];
    updateInlineSelectedCount();
    renderInlineAccountList();
  });

  // 계정 추가 버튼 (풀오토 다중계정 발행과 동일하게 연동)
  document.getElementById('ma-add-account-inline')?.addEventListener('click', (e) => {
    // ✅ [v2.10.202] 직접 핸들러 동작 마킹 — body 위임 fallback 중복 실행 방지
    (e.currentTarget as any).__lastDirectClick = Date.now();
    // ✅ 풀오토 다중계정 발행의 계정 추가와 동일한 함수 호출 (window 통해 접근)
    if (typeof (window as any).openAccountEditModal === 'function') {
      (window as any).openAccountEditModal();
    } else {
      // 폴백: 기존 모달 열기
      const multiAccountModal = document.getElementById('multi-account-modal');
      if (multiAccountModal) {
        multiAccountModal.style.display = 'flex';
        multiAccountModal.setAttribute('aria-hidden', 'false');
      }
    }
  });

  // 현재 계정 모드 및 선택된 계정 정보 반환 함수 (발행 시 사용)
  (window as any).getAccountMode = () => currentAccountMode;
  (window as any).getInlineSelectedAccounts = () => inlineSelectedAccountIds;
  (window as any).getInlineInterval = () => {
    const val = parseInt((document.getElementById('ma-interval-inline') as HTMLInputElement)?.value || '30', 10);
    const unit = (document.getElementById('ma-interval-unit-inline') as HTMLSelectElement)?.value || 'sec';
    if (unit === 'min') return val * 60;
    if (unit === 'hour') return val * 3600;
    return val;
  };

  // ✅ 인라인 계정 목록 렌더링 함수 글로벌 노출 (계정 동기화용)
  (window as any).renderInlineAccountList = renderInlineAccountList;

  // ✅ CTA 버튼 이벤트 핸들러
  const generateCtaBtn = document.getElementById('generate-cta-btn') as HTMLButtonElement;
  const previewCtaBtn = document.getElementById('preview-cta-btn') as HTMLButtonElement;
  const ctaTextInput = document.getElementById('unified-cta-text') as HTMLInputElement;
  const ctaLinkInput = document.getElementById('unified-cta-link') as HTMLInputElement;
  const ctaPreview = document.getElementById('cta-preview') as HTMLDivElement;
  const ctaPreviewText = document.getElementById('cta-preview-text') as HTMLDivElement;

  // ✅ 다중 CTA UI
  const ctaItemsContainer = document.getElementById('unified-cta-items-container') as HTMLDivElement | null;
  const addCtaBtn = document.getElementById('unified-add-cta-btn') as HTMLButtonElement | null;

  const appendCtaRow = (preset?: { text?: string; link?: string }) => {
    if (!ctaItemsContainer) return;
    const row = document.createElement('div');
    row.className = 'unified-cta-item';
    row.style.cssText = 'display:flex; gap:0.5rem; align-items:center;';
    const presetText = String(preset?.text || '').trim();
    const presetLink = String(preset?.link || '').trim();
    row.innerHTML = `
      <input type="text" class="unified-cta-text" placeholder="CTA 텍스트" style="flex:1; padding: 0.75rem; border: 1px solid var(--border-light); border-radius: var(--radius-sm); font-size: 0.9rem; background: var(--bg-primary);" value="${escapeHtml(presetText)}">
      <input type="url" class="unified-cta-link" placeholder="링크 URL" style="flex:1; padding: 0.75rem; border: 1px solid var(--border-light); border-radius: var(--radius-sm); font-size: 0.9rem; background: var(--bg-primary);" value="${escapeHtml(presetLink)}">
      <button type="button" class="unified-cta-remove" style="padding:0.5rem 0.75rem; background: rgba(239,68,68,0.15); color:#ef4444; border: 1px solid rgba(239,68,68,0.35); border-radius: 8px; cursor:pointer;">✕</button>
    `;
    ctaItemsContainer.appendChild(row);
  };

  const ensureAtLeastOneCtaRow = () => {
    if (!ctaItemsContainer) return;
    const existing = ctaItemsContainer.querySelectorAll('.unified-cta-item');
    if (existing.length === 0) {
      appendCtaRow({ text: ctaTextInput?.value || '', link: ctaLinkInput?.value || '' });
    }
  };

  if (ctaItemsContainer) {
    // legacy 단일 입력은 숨김(호환용으로 값은 유지)
    try {
      const legacyTextWrap = ctaTextInput?.closest('div') as HTMLElement | null;
      const legacyLinkWrap = ctaLinkInput?.closest('div') as HTMLElement | null;
      if (legacyTextWrap) legacyTextWrap.style.display = 'none';
      if (legacyLinkWrap) legacyLinkWrap.style.display = 'none';
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }

    ensureAtLeastOneCtaRow();

    if (addCtaBtn && !addCtaBtn.hasAttribute('data-listener-added')) {
      addCtaBtn.setAttribute('data-listener-added', 'true');
      addCtaBtn.addEventListener('click', () => {
        appendCtaRow();
      });
    }

    if (!ctaItemsContainer.hasAttribute('data-cta-delegation')) {
      ctaItemsContainer.setAttribute('data-cta-delegation', 'true');
      ctaItemsContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.classList.contains('unified-cta-remove')) {
          const row = target.closest('.unified-cta-item') as HTMLElement | null;
          if (row) row.remove();
          ensureAtLeastOneCtaRow();
        }
      });
    }
  }

  // CTA 위치 선택은 유지하고, 미리보기/AI 생성 보조 UI만 숨김
  try {
    const ctaPositionSelect = document.getElementById('unified-cta-position') as HTMLSelectElement | null;
    if (ctaPositionSelect) {
      const wrapper = ctaPositionSelect.closest('.form-group') as HTMLElement | null;
      if (wrapper) wrapper.style.display = '';
      else ctaPositionSelect.style.display = '';
      ctaPositionSelect.style.display = '';
      ctaPositionSelect.disabled = false;
      ctaPositionSelect.style.opacity = '1';
    }
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }
  try {
    if (generateCtaBtn) generateCtaBtn.style.display = 'none';
    if (previewCtaBtn) previewCtaBtn.style.display = 'none';
    if (ctaPreview) ctaPreview.style.display = 'none';
    if (ctaPreviewText) ctaPreviewText.innerHTML = '';
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  // AI로 CTA 생성 버튼
  if (generateCtaBtn) {
    generateCtaBtn.addEventListener('click', async () => {
      try {
        generateCtaBtn.disabled = true;
        generateCtaBtn.textContent = '생성 중...';

        // 현재 콘텐츠에서 CTA 텍스트 생성
        const title = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value ||
          (document.getElementById('unified-title') as HTMLInputElement)?.value || '';

        const ctaSuggestions = [
          '더 알아보기', '자세히 보기', '지금 확인하기', '바로 가기',
          '구매하기', '신청하기', '무료 체험하기', '상담 받기',
          '후기 더보기', '다른 글 보기', '이전 글 보기'
        ];

        // 제목에 따라 적절한 CTA 선택
        let suggestedCta = ctaSuggestions[Math.floor(Math.random() * ctaSuggestions.length)];

        if (title.includes('리뷰') || title.includes('후기')) {
          suggestedCta = '구매하기';
        } else if (title.includes('여행') || title.includes('맛집')) {
          suggestedCta = '예약하기';
        } else if (title.includes('재테크') || title.includes('투자')) {
          suggestedCta = '더 알아보기';
        }

        if (ctaTextInput) {
          ctaTextInput.value = suggestedCta;
        }

        appendLog(`✅ CTA 버튼 텍스트가 생성되었습니다: "${suggestedCta}"`);

      } catch (error) {
        appendLog(`❌ CTA 생성 실패: ${(error as Error).message}`);
      } finally {
        generateCtaBtn.disabled = false;
        generateCtaBtn.textContent = 'AI로 생성';
      }
    });
  }

  // CTA 미리보기 버튼
  if (previewCtaBtn) {
    previewCtaBtn.addEventListener('click', () => {
      const ctaText = ctaTextInput?.value?.trim() || '더 알아보기';
      const ctaLink = ctaLinkInput?.value?.trim() || '#';

      if (ctaPreview && ctaPreviewText) {
        ctaPreview.style.display = 'block';
        ctaPreviewText.innerHTML = `
          <div style="text-align: center; margin: 1rem 0;">
            <hr style="border: none; border-top: 1px solid var(--border-light); margin: 1rem 0;">
            <a href="${ctaLink}" target="_blank" style="display: inline-block; padding: 0.75rem 2rem; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
              ${ctaText}
            </a>
            <hr style="border: none; border-top: 1px solid var(--border-light); margin: 1rem 0;">
          </div>
        `;
      }
    });
  }

  // ✅ 이전 작성글 엮기 기능
  const selectPreviousPostBtn = document.getElementById('select-previous-post-btn') as HTMLButtonElement;
  const linkPreviousPostCheckbox = document.getElementById('unified-link-previous-post') as HTMLInputElement;

  if (selectPreviousPostBtn) {
    selectPreviousPostBtn.addEventListener('click', () => {
      // 저장된 글 목록 가져오기
      const posts = loadGeneratedPosts();

      if (posts.length === 0) {
        alert('📝 저장된 글이 없습니다.\n\n먼저 글을 생성하고 발행해주세요.');
        return;
      }

      // 글 선택 모달 표시
      const currentCategory = String((document.getElementById('unified-article-type') as HTMLSelectElement | null)?.value || '').trim();
      showPostSelectionModal(posts, (selectedPost) => {
        if (selectedPost) {
          // 선택된 글 정보 저장
          (window as any).selectedPreviousPost = selectedPost;
          (window as any).previousPostTitle = selectedPost.title || '';
          (window as any).previousPostUrl = selectedPost.publishedUrl || '';
          if (linkPreviousPostCheckbox) {
            linkPreviousPostCheckbox.checked = true;
          }

          // ✅ CTA URL에 자동으로 주소 채우기
          const ctaLinkInput = document.getElementById('unified-cta-link') as HTMLInputElement;
          const ctaTextInput = document.getElementById('unified-cta-text') as HTMLInputElement;
          const ctaItemsContainer = document.getElementById('unified-cta-items-container') as HTMLDivElement | null;
          const selectedPostInfo = document.getElementById('selected-previous-post-info') as HTMLDivElement;
          const selectedPostTitle = document.getElementById('selected-post-title') as HTMLDivElement;

          // ✅ CTA 텍스트는 항상 입력 (발행 여부와 관계없이)
          if (ctaTextInput && selectedPost.title) {
            ctaTextInput.value = `📖 ${selectedPost.title}`;
          }

          // ✅ 다중 CTA 컨테이너가 있으면 첫 번째 CTA row에 반영
          if (ctaItemsContainer && selectedPost.title) {
            const firstRow = ctaItemsContainer.querySelector('.unified-cta-item') as HTMLElement | null;
            if (firstRow) {
              const textEl = firstRow.querySelector('.unified-cta-text') as HTMLInputElement | null;
              if (textEl) textEl.value = `📖 ${selectedPost.title}`;
              if (selectedPost.publishedUrl) {
                const linkEl = firstRow.querySelector('.unified-cta-link') as HTMLInputElement | null;
                if (linkEl) linkEl.value = selectedPost.publishedUrl;
              }
            }
          }

          // ✅ 선택된 글 정보 표시
          if (selectedPostInfo && selectedPostTitle) {
            selectedPostInfo.style.display = 'block';
            selectedPostTitle.textContent = selectedPost.title;
          }

          if (selectedPost.publishedUrl) {
            // 발행된 글이면 URL도 자동 입력
            if (ctaLinkInput) {
              ctaLinkInput.value = selectedPost.publishedUrl;
            }
            appendLog(`✅ 이전 글 선택됨: "${selectedPost.title}" (CTA 자동 입력됨)`);
            toastManager.success(`✅ "${selectedPost.title}" 선택됨!`);
          } else {
            // 미발행 글이면 제목만 입력됨 안내
            appendLog(`⚠️ 이전 글 선택됨: "${selectedPost.title}" (미발행 - URL 없음)`);
            toastManager.warning(`⚠️ 미발행 글 선택됨 - URL 없음`);
          }
        }
      }, { defaultCategory: currentCategory || undefined });
    });
  }

  // ✅ (숨김 상태 관리용) unified-link-previous-post 체크 시에도 이전글 선택 모달 자동 오픈
  if (linkPreviousPostCheckbox && !linkPreviousPostCheckbox.hasAttribute('data-listener-added')) {
    linkPreviousPostCheckbox.setAttribute('data-listener-added', 'true');
    linkPreviousPostCheckbox.addEventListener('change', () => {
      try {
        if (linkPreviousPostCheckbox.checked && selectPreviousPostBtn && !selectPreviousPostBtn.disabled) {
          selectPreviousPostBtn.click();
        }
      } catch (e) {
        console.warn('[renderer] catch ignored:', e);
      }
    });
  }

  // ✅ 이전글 선택 해제 버튼
  const clearPreviousPostBtn = document.getElementById('clear-previous-post-btn');
  if (clearPreviousPostBtn) {
    clearPreviousPostBtn.addEventListener('click', () => {
      // 선택 해제
      (window as any).selectedPreviousPost = null;
      (window as any).previousPostTitle = null;
      (window as any).previousPostUrl = null;
      if (linkPreviousPostCheckbox) {
        linkPreviousPostCheckbox.checked = false;
      }

      // CTA 필드 초기화
      const ctaLinkInput = document.getElementById('unified-cta-link') as HTMLInputElement;
      const ctaTextInput = document.getElementById('unified-cta-text') as HTMLInputElement;
      const selectedPostInfo = document.getElementById('selected-previous-post-info') as HTMLDivElement;

      if (ctaTextInput) ctaTextInput.value = '';
      if (ctaLinkInput) ctaLinkInput.value = '';
      if (selectedPostInfo) selectedPostInfo.style.display = 'none';

      appendLog(`🔓 이전글 연결 해제됨`);
      toastManager.info(`이전글 연결이 해제되었습니다.`);
    });
  }

  // ✅ CTA 없이 발행 체크박스 - 체크 시 CTA 필드 및 이전글 엮기 비활성화
  const skipCtaCheckbox = document.getElementById('unified-skip-cta') as HTMLInputElement;
  if (skipCtaCheckbox) {
    skipCtaCheckbox.addEventListener('change', () => {
      const ctaTextInput = document.getElementById('unified-cta-text') as HTMLInputElement;
      const ctaLinkInput = document.getElementById('unified-cta-link') as HTMLInputElement;
      const selectPreviousPostBtn = document.getElementById('select-previous-post-btn') as HTMLButtonElement;
      const selectedPostInfo = document.getElementById('selected-previous-post-info') as HTMLDivElement;
      const ctaPositionSelect = document.getElementById('unified-cta-position') as HTMLSelectElement;

      if (skipCtaCheckbox.checked) {
        // CTA 없이 발행 체크됨 - 모든 CTA 관련 필드 비활성화 및 초기화
        if (ctaTextInput) {
          ctaTextInput.value = '';
          ctaTextInput.disabled = true;
          ctaTextInput.style.opacity = '0.5';
        }
        if (ctaLinkInput) {
          ctaLinkInput.value = '';
          ctaLinkInput.disabled = true;
          ctaLinkInput.style.opacity = '0.5';
        }
        if (selectPreviousPostBtn) {
          selectPreviousPostBtn.disabled = true;
          selectPreviousPostBtn.style.opacity = '0.5';
        }
        if (selectedPostInfo) {
          selectedPostInfo.style.display = 'none';
        }
        if (ctaPositionSelect) {
          ctaPositionSelect.disabled = true;
          ctaPositionSelect.style.opacity = '0.5';
        }
        // 이전글 엮기 체크 해제
        if (linkPreviousPostCheckbox) {
          linkPreviousPostCheckbox.checked = false;
        }
        (window as any).selectedPreviousPost = null;
        (window as any).previousPostTitle = null;
        (window as any).previousPostUrl = null;

        appendLog(`🚫 CTA 없이 발행 모드 활성화`);
      } else {
        // CTA 없이 발행 해제됨 - 모든 CTA 관련 필드 활성화
        if (ctaTextInput) {
          ctaTextInput.disabled = false;
          ctaTextInput.style.opacity = '1';
        }
        if (ctaLinkInput) {
          ctaLinkInput.disabled = false;
          ctaLinkInput.style.opacity = '1';
        }
        if (selectPreviousPostBtn) {
          selectPreviousPostBtn.disabled = false;
          selectPreviousPostBtn.style.opacity = '1';
        }
        if (ctaPositionSelect) {
          ctaPositionSelect.disabled = false;
          ctaPositionSelect.style.opacity = '1';
        }

        appendLog(`✅ CTA 발행 모드 활성화`);
      }
    });
  }

  // ✅ [2026-04-06 v2] 공정위 문구 — 프리셋 + 직접 입력 + 쇼커 자동 연동
  {
    const ftcCheckbox = document.getElementById('unified-ftc-disclosure') as HTMLInputElement;
    const ftcTextarea = document.getElementById('unified-ftc-text') as HTMLTextAreaElement;
    const ftcPreset = document.getElementById('unified-ftc-preset') as HTMLSelectElement;
    const ftcPanel = document.getElementById('ftc-options-panel') as HTMLDivElement;
    const ftcSection = document.getElementById('ftc-disclosure-section') as HTMLDivElement;
    const ftcBadge = document.getElementById('ftc-status-badge') as HTMLSpanElement;
    const ftcResetBtn = document.getElementById('ftc-reset-btn') as HTMLButtonElement;

    // 프리셋 사전
    const FTC_PRESETS: Record<string, string> = {
      affiliate: '이 포스팅은 제휴마케팅이 포함된 광고로 일정 커미션을 지급 받을 수 있습니다.',
      experience: '이 포스팅은 업체로부터 제품을 무상으로 제공받아 솔직하게 작성한 후기입니다.',
      sponsored: '이 포스팅은 소정의 원고료를 지급받아 작성된 광고입니다.',
      collab: '이 포스팅은 해당 업체의 협찬을 받아 작성되었습니다.',
      custom: '',
    };

    if (ftcCheckbox && ftcTextarea && ftcPreset && ftcPanel) {
      // ✅ 기본값은 모드 기반: 쇼핑커넥트(affiliate)만 자동 ON, 그 외 모드는 기본 OFF.
      // (localStorage.ftcDisclosureEnabled가 sticky true로 남아 모든 모드에서 체크되던 버그 수정)
      const savedText = localStorage.getItem('ftcDisclosureText') || '';
      const savedPreset = localStorage.getItem('ftcDisclosurePreset') || 'affiliate';
      const _initMode = (document.getElementById('unified-content-mode') as HTMLInputElement | null)?.value || 'seo';
      const ftcDefaultOn = _initMode === 'affiliate';

      ftcCheckbox.checked = ftcDefaultOn;
      ftcPanel.style.display = ftcDefaultOn ? 'block' : 'none';
      localStorage.setItem('ftcDisclosureEnabled', String(ftcDefaultOn));
      ftcPreset.value = savedPreset;
      ftcTextarea.value = savedText || FTC_PRESETS[savedPreset] || FTC_PRESETS.affiliate;
      // custom이 아니면 textarea readonly
      ftcTextarea.readOnly = savedPreset !== 'custom';
      ftcTextarea.style.opacity = savedPreset !== 'custom' ? '0.7' : '1';

      // ON/OFF 뱃지
      const updateBadge = () => {
        if (ftcBadge) {
          ftcBadge.style.display = ftcCheckbox.checked ? 'inline-block' : 'none';
        }
        if (ftcSection) {
          ftcSection.style.borderColor = ftcCheckbox.checked
            ? 'rgba(34, 197, 94, 0.5)' : 'rgba(59, 130, 246, 0.2)';
        }
      };
      updateBadge();

      // 체크박스 토글
      ftcCheckbox.addEventListener('change', () => {
        ftcPanel.style.display = ftcCheckbox.checked ? 'block' : 'none';
        localStorage.setItem('ftcDisclosureEnabled', String(ftcCheckbox.checked));
        updateBadge();
      });

      // 프리셋 변경
      ftcPreset.addEventListener('change', () => {
        const preset = ftcPreset.value;
        localStorage.setItem('ftcDisclosurePreset', preset);
        if (preset !== 'custom') {
          ftcTextarea.value = FTC_PRESETS[preset] || '';
          ftcTextarea.readOnly = true;
          ftcTextarea.style.opacity = '0.7';
        } else {
          ftcTextarea.readOnly = false;
          ftcTextarea.style.opacity = '1';
          ftcTextarea.focus();
        }
        localStorage.setItem('ftcDisclosureText', ftcTextarea.value);
      });

      // 직접 입력 시 저장
      ftcTextarea.addEventListener('input', () => {
        localStorage.setItem('ftcDisclosureText', ftcTextarea.value);
      });

      // 기본값 복원 버튼
      ftcResetBtn?.addEventListener('click', () => {
        const currentPreset = ftcPreset.value;
        const defaultText = FTC_PRESETS[currentPreset] || FTC_PRESETS.affiliate;
        ftcTextarea.value = defaultText;
        localStorage.setItem('ftcDisclosureText', defaultText);
      });

      // ✅ 쇼핑커넥트 모드 자동 연동: affiliate 모드 선택 시 자동 ON
      const contentModeSelect = document.getElementById('unified-content-mode') as HTMLSelectElement;
      contentModeSelect?.addEventListener('change', () => {
        if (contentModeSelect.value === 'affiliate' && !ftcCheckbox.checked) {
          ftcCheckbox.checked = true;
          ftcPanel.style.display = 'block';
          ftcPreset.value = 'affiliate';
          ftcTextarea.value = FTC_PRESETS.affiliate;
          ftcTextarea.readOnly = true;
          ftcTextarea.style.opacity = '0.7';
          localStorage.setItem('ftcDisclosureEnabled', 'true');
          localStorage.setItem('ftcDisclosurePreset', 'affiliate');
          localStorage.setItem('ftcDisclosureText', FTC_PRESETS.affiliate);
          updateBadge();
        } else if (contentModeSelect.value !== 'affiliate' && ftcCheckbox.checked) {
          // ✅ 비-쇼핑커넥트 전환 → 기본 해제 (사용자가 다시 수동 체크는 가능)
          ftcCheckbox.checked = false;
          ftcPanel.style.display = 'none';
          localStorage.setItem('ftcDisclosureEnabled', 'false');
          updateBadge();
        }
      });
    }
  }

  // ✅ [v1.4.2] 3곳 공정문구 체크박스 + 패널 + 프리셋 완전 동기화
  {
    const FTC_PRESETS_SYNC: Record<string, string> = {
      affiliate: '이 포스팅은 제휴마케팅이 포함된 광고로 일정 커미션을 지급 받을 수 있습니다.',
      experience: '이 포스팅은 업체로부터 제품을 무상으로 제공받아 솔직하게 작성한 후기입니다.',
      sponsored: '이 포스팅은 소정의 원고료를 지급받아 작성된 광고입니다.',
      collab: '이 포스팅은 해당 업체의 협찬을 받아 작성되었습니다.',
      custom: '',
    };

    const ftcConfigs = [
      { cb: 'unified-ftc-disclosure', panel: 'ftc-options-panel', preset: 'unified-ftc-preset', text: 'unified-ftc-text' },
      { cb: 'continuous-ftc-disclosure', panel: 'continuous-ftc-panel', preset: 'continuous-ftc-preset', text: 'continuous-ftc-text' },
      { cb: 'ma-ftc-disclosure', panel: 'ma-ftc-panel', preset: 'ma-ftc-preset', text: 'ma-ftc-text' },
    ];

    const syncAllFtc = () => {
      const enabled = localStorage.getItem('ftcDisclosureEnabled') === 'true';
      const preset = localStorage.getItem('ftcDisclosurePreset') || 'affiliate';
      const text = localStorage.getItem('ftcDisclosureText') || FTC_PRESETS_SYNC[preset] || FTC_PRESETS_SYNC.affiliate;
      // ✅ unified 폼은 모드 기반(쇼핑커넥트만 ON), continuous/ma는 자체 localStorage 유지
      const _syncMode = (document.getElementById('unified-content-mode') as HTMLInputElement | null)?.value || 'seo';
      const unifiedEnabled = _syncMode === 'affiliate';

      for (const cfg of ftcConfigs) {
        const cb = document.getElementById(cfg.cb) as HTMLInputElement;
        const panel = document.getElementById(cfg.panel) as HTMLDivElement;
        const presetEl = document.getElementById(cfg.preset) as HTMLSelectElement;
        const textEl = document.getElementById(cfg.text) as HTMLTextAreaElement;
        const cbEnabled = cfg.cb === 'unified-ftc-disclosure' ? unifiedEnabled : enabled;
        if (cb) cb.checked = cbEnabled;
        if (panel) panel.style.display = cbEnabled ? 'block' : 'none';
        if (presetEl) presetEl.value = preset;
        if (textEl) {
          textEl.value = text;
          textEl.readOnly = preset !== 'custom';
          textEl.style.opacity = preset !== 'custom' ? '0.7' : '1';
        }
      }
      const badge = document.getElementById('ftc-status-badge') as HTMLSpanElement;
      const section = document.getElementById('ftc-disclosure-section') as HTMLDivElement;
      if (badge) badge.style.display = unifiedEnabled ? 'inline-block' : 'none';
      if (section) section.style.borderColor = unifiedEnabled ? 'rgba(245, 158, 11, 0.6)' : 'rgba(245, 158, 11, 0.4)';
    };

    setTimeout(syncAllFtc, 300);

    // 체크박스 + 프리셋 변경 이벤트
    document.addEventListener('change', (e) => {
      const t = e.target as HTMLElement;
      if (t.id === 'unified-ftc-disclosure' || t.id === 'continuous-ftc-disclosure' || t.id === 'ma-ftc-disclosure') {
        localStorage.setItem('ftcDisclosureEnabled', String((t as HTMLInputElement).checked));
        syncAllFtc();
      }
      if (t.id === 'unified-ftc-preset' || t.id === 'continuous-ftc-preset' || t.id === 'ma-ftc-preset') {
        const preset = (t as HTMLSelectElement).value;
        localStorage.setItem('ftcDisclosurePreset', preset);
        if (preset !== 'custom') localStorage.setItem('ftcDisclosureText', FTC_PRESETS_SYNC[preset] || '');
        syncAllFtc();
      }
    });

    // textarea 입력 동기화
    document.addEventListener('input', (e) => {
      const t = e.target as HTMLTextAreaElement;
      if (t.id === 'unified-ftc-text' || t.id === 'continuous-ftc-text' || t.id === 'ma-ftc-text') {
        localStorage.setItem('ftcDisclosureText', t.value);
        for (const cfg of ftcConfigs) {
          const el = document.getElementById(cfg.text) as HTMLTextAreaElement;
          if (el && el !== t) el.value = t.value;
        }
      }
    });

    document.getElementById('ftc-reset-btn')?.addEventListener('click', () => {
      const preset = localStorage.getItem('ftcDisclosurePreset') || 'affiliate';
      localStorage.setItem('ftcDisclosureText', FTC_PRESETS_SYNC[preset] || FTC_PRESETS_SYNC.affiliate);
      syncAllFtc();
    });

    document.getElementById('unified-content-mode')?.addEventListener('change', (e) => {
      if ((e.target as HTMLSelectElement).value === 'affiliate') {
        localStorage.setItem('ftcDisclosureEnabled', 'true');
        localStorage.setItem('ftcDisclosurePreset', 'affiliate');
        localStorage.setItem('ftcDisclosureText', FTC_PRESETS_SYNC.affiliate);
        syncAllFtc();
      }
    });
  }

  // ✅ 중지 버튼 초기화
  initStopButton();

  console.log('[Unified] 통합 탭 초기화 완료');
}

// ✅ 중지 버튼 초기화 및 이벤트 핸들러
function initStopButton(): void {
  const stopBtn = document.getElementById('unified-stop-btn');


  if (stopBtn && !stopBtn.hasAttribute('data-listener-added')) {
    stopBtn.setAttribute('data-listener-added', 'true');
    stopBtn.addEventListener('click', async () => {
      console.log('[Stop] 중지 버튼 클릭');

      try {
        // ✅ 풀오토 발행 중지 플래그 반영
        (window as any).stopFullAutoPublish = true;

        // 진행 중인 자동화 중지
        if (automationRunning) {
          await window.api.cancelAutomation();
          appendLog('⏹️ 발행/수집/생성이 중지되었습니다.');
        }

        // ✅ 다중계정 발행도 즉시 중지 (백그라운드 브라우저 모두 종료)
        try {
          await window.api.multiAccountCancel();
        } catch (e) {
          // 다중계정 발행이 없을 수도 있음 - 무시
        }

        // 연속 발행 모드 중지
        if (isContinuousMode) {
          stopContinuousMode();
        }

        // 상태 초기화
        automationRunning = false;
        hideStopButton();

        // 버튼 상태 복원
        const fullAutoBtn = document.getElementById('full-auto-publish-btn') as HTMLButtonElement;
        const semiAutoBtn = document.getElementById('semi-auto-publish-btn') as HTMLButtonElement;

        if (fullAutoBtn) {
          enableFullAutoPublishButton();
          fullAutoBtn.innerHTML = '<span style="font-size: 2rem;">⚡</span><span>풀오토 발행</span><span style="font-size: 0.75rem; opacity: 0.9;">콘텐츠 생성 → 이미지 생성 → 발행 (한 번에)</span>';
        }

        if (semiAutoBtn) {
          enableSemiAutoPublishButton();
          semiAutoBtn.innerHTML = '<span style="font-size: 2rem;">🔧</span><span>반자동 발행</span><span style="font-size: 0.75rem; opacity: 0.9;">수동 수정 후 발행</span>';
        }

        toastManager.info('⏹️ 작업이 중지되었습니다.');
      } catch (error) {
        console.error('[Stop] 중지 실패:', error);
        appendLog(`❌ 중지 실패: ${(error as Error).message}`);
      }
    });
  }
}

// ✅ 중지 버튼 표시 (발행 버튼 숨기고 중지 버튼 표시)
function showStopButton(): void {
  const stopBtn = document.getElementById('unified-stop-btn');
  const publishBtn = document.getElementById('unified-publish-btn');
  const publishModeDesc = document.getElementById('publish-mode-desc');

  if (stopBtn) {
    stopBtn.style.display = 'flex';
  }
  if (publishBtn) {
    publishBtn.style.display = 'none';
  }
  if (publishModeDesc) {
    publishModeDesc.textContent = '⏳ 작업 진행 중... 중지하려면 버튼을 클릭하세요';
  }
}

// ✅ 중지 버튼 숨기기 (발행 버튼 표시하고 중지 버튼 숨김)
function hideStopButton(): void {
  const stopBtn = document.getElementById('unified-stop-btn');
  const publishBtn = document.getElementById('unified-publish-btn');

  if (stopBtn) {
    stopBtn.style.display = 'none';
  }
  if (publishBtn) {
    publishBtn.style.display = 'flex';
  }

  // 버튼 스타일 리셋 — syncPublishMode로 위임
  const publishModeTopSelect = document.getElementById('publish-mode-top-select') as HTMLSelectElement;
  const currentMode = publishModeTopSelect?.value || (document.getElementById('publish-mode-select') as HTMLSelectElement)?.value || 'full-auto';
  if (typeof (window as any).syncPublishMode === 'function') {
    (window as any).syncPublishMode(currentMode);
  }
}


// 전역 함수로 등록
(window as any).showStopButton = showStopButton;
(window as any).hideStopButton = hideStopButton;


// 발행 모드 선택 초기화
function initUnifiedModeSelection(): void {
  // 기존 버튼 모드 선택
  const modeBtns = document.querySelectorAll('.unified-mode-btn');

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).getAttribute('data-mode');

      // 기존 선택 해제
      modeBtns.forEach(b => {
        b.classList.remove('selected');
        (b as HTMLElement).style.background = 'var(--bg-tertiary)';
        (b as HTMLElement).style.color = 'var(--text-strong)';
        (b as HTMLElement).style.borderColor = 'transparent';
        (b as HTMLElement).style.boxShadow = 'none';
      });

      // 새로 선택
      btn.classList.add('selected');
      (btn as HTMLElement).style.background = 'var(--primary)';
      (btn as HTMLElement).style.color = 'white';
      (btn as HTMLElement).style.borderColor = 'var(--primary)';

      // 모드 설명 업데이트
      updateModeDescription(mode);

      // 반자동 모드 섹션 토글
      toggleSemiAutoSection(mode === 'semi-auto');
    });
  });

  // ✅ 발행 방식 버튼 클릭 이벤트
  document.querySelectorAll('.publish-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode || 'publish'; // ✅ [2026-03-10 FIX] 기본값을 즉시발행으로 변경
      const hiddenInput = document.getElementById('unified-publish-mode') as HTMLInputElement;
      if (hiddenInput) hiddenInput.value = mode;
      console.log(`[PublishMode] 🔄 사용자 선택 변경: ${mode}`);

      // 버튼 스타일 업데이트
      document.querySelectorAll('.publish-mode-btn').forEach(b => {
        (b as HTMLElement).classList.remove('selected');
        (b as HTMLElement).style.background = 'var(--bg-tertiary)';
        (b as HTMLElement).style.color = 'var(--text-muted)';
        (b as HTMLElement).style.border = '1px solid var(--border-medium)';
      });
      (btn as HTMLElement).classList.add('selected');
      (btn as HTMLElement).style.background = 'linear-gradient(135deg, #10b981, #059669)';
      (btn as HTMLElement).style.color = 'white';
      (btn as HTMLElement).style.border = 'none';

      // 예약 발행 컨테이너 표시/숨김
      const scheduleContainer = document.getElementById('unified-schedule-container');
      if (scheduleContainer) {
        if (mode === 'schedule') {
          scheduleContainer.style.display = 'block';
          // ✅ [2026-03-29] date picker + time24Select (10분 단위) 초기화
          const datePicker = document.getElementById('unified-schedule-date-picker') as HTMLInputElement;
          const timeWrap = document.getElementById('unified-schedule-time-select-wrap');
          if (datePicker) {
            const now = new Date();
            const minDate = new Date(now.getTime() + 60000);
            const dateStr = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, '0')}-${String(minDate.getDate()).padStart(2, '0')}`;
            datePicker.min = dateStr;
            datePicker.value = dateStr;
            setTimeout(() => {
              datePicker.focus();
              datePicker.showPicker?.();
            }, 100);
          }
          // time24Select 렌더링 (최초 1회만)
          if (timeWrap && !timeWrap.querySelector('.time24-select-wrap')) {
            const now = new Date();
            const roundedMin = Math.ceil(now.getMinutes() / 10) * 10 % 60;
            const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(roundedMin).padStart(2, '0')}`;
            timeWrap.innerHTML = createTime24Select({
              id: 'unified-schedule-time',
              defaultValue: defaultTime,
              step: 10,
              style: 'width: 100%;',
              selectStyle: 'padding: 0.85rem; border-radius: 8px; border: 2px solid var(--border-medium); background: var(--bg-primary); color: var(--text-strong); font-size: 1rem; color-scheme: dark; cursor: pointer; flex: 1;'
            });
            bindTime24Events(timeWrap);
            // date 또는 time 변경 시 hidden input 동기화
            const syncScheduleHidden = () => {
              const dp = document.getElementById('unified-schedule-date-picker') as HTMLInputElement;
              const hiddenTime = document.getElementById('unified-schedule-time') as HTMLInputElement;
              const hiddenFinal = document.getElementById('unified-schedule-date') as HTMLInputElement;
              if (dp?.value && hiddenTime?.value && hiddenFinal) {
                hiddenFinal.value = `${dp.value}T${hiddenTime.value}`;
                hiddenFinal.dispatchEvent(new Event('change', { bubbles: true }));
              }
            };
            datePicker?.addEventListener('change', syncScheduleHidden);
            timeWrap.addEventListener('change', syncScheduleHidden);
            // 초기값 동기화
            syncScheduleHidden();
          }
        } else {
          scheduleContainer.style.display = 'none';
        }
      }
    });
  });

  // ✅ 글 톤/스타일 버튼 클릭 이벤트
  document.querySelectorAll('.tone-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tone = (btn as HTMLElement).dataset.tone || 'friendly';
      const hiddenInput = document.getElementById('unified-tone-style') as HTMLInputElement;
      if (hiddenInput) {
        hiddenInput.value = tone;
        hiddenInput.setAttribute('data-user-selected', 'true');
      }

      // 버튼 스타일 업데이트
      document.querySelectorAll('.tone-style-btn').forEach(b => {
        (b as HTMLElement).classList.remove('selected');
        (b as HTMLElement).style.background = 'var(--bg-tertiary)';
        (b as HTMLElement).style.color = 'var(--text-muted)';
        (b as HTMLElement).style.border = '1px solid var(--border-medium)';
      });
      (btn as HTMLElement).classList.add('selected');
      (btn as HTMLElement).style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
      (btn as HTMLElement).style.color = 'white';
      (btn as HTMLElement).style.border = 'none';
    });
  });

  // [2026-05-27 작업 13-B] 개인 프롬프트 UI 동기화 + 모달 핸들러 (1회 등록)
  const MODE_LABELS_FOR_PROMPT: Record<string, string> = {
    seo: '🔍 SEO', homefeed: '🏠 홈판', affiliate: '🛒 쇼핑커넥트', custom: '✏️ 사용자정의', business: '🏢 업체홍보',
  };
  function syncCustomPromptUiForMode(mode: string): void {
    const enableCb = document.getElementById('custom-prompt-enable') as HTMLInputElement | null;
    const openBtn = document.getElementById('custom-prompt-open-modal') as HTMLButtonElement | null;
    const statusEl = document.getElementById('custom-prompt-status') as HTMLElement | null;
    const hiddenInput = document.getElementById('custom-prompt-input') as HTMLTextAreaElement | null;
    if (!enableCb || !openBtn || !statusEl || !hiddenInput) return;
    let savedEnabled = false;
    let savedText = '';
    try {
      savedEnabled = localStorage.getItem(`customPromptEnabled_${mode}`) === 'true';
      savedText = localStorage.getItem(`customPrompt_${mode}`) || '';
    } catch { /* ignore */ }
    enableCb.checked = savedEnabled;
    // 백엔드 파이프라인은 hidden textarea.value를 읽음. 체크 OFF면 빈 값(미적용)
    hiddenInput.value = savedEnabled ? savedText : '';
    openBtn.style.display = savedEnabled ? 'inline-block' : 'none';
    statusEl.style.display = savedEnabled && savedText ? 'inline-block' : 'none';
    statusEl.textContent = savedText ? `✅ ${savedText.length.toLocaleString()}자 작성됨` : '';
  }
  // 체크박스 토글 핸들러
  const enableCbInit = document.getElementById('custom-prompt-enable') as HTMLInputElement | null;
  if (enableCbInit && !(enableCbInit as any).__bound) {
    (enableCbInit as any).__bound = true;
    enableCbInit.addEventListener('change', () => {
      const curMode = (document.getElementById('unified-content-mode') as HTMLInputElement)?.value || 'seo';
      try { localStorage.setItem(`customPromptEnabled_${curMode}`, String(enableCbInit.checked)); } catch { /* ignore */ }
      syncCustomPromptUiForMode(curMode);
    });
  }
  // 모달 열기
  const openBtnInit = document.getElementById('custom-prompt-open-modal') as HTMLButtonElement | null;
  if (openBtnInit && !(openBtnInit as any).__bound) {
    (openBtnInit as any).__bound = true;
    openBtnInit.addEventListener('click', () => {
      const curMode = (document.getElementById('unified-content-mode') as HTMLInputElement)?.value || 'seo';
      const modal = document.getElementById('custom-prompt-modal');
      const modalInput = document.getElementById('custom-prompt-modal-input') as HTMLTextAreaElement | null;
      const modeLabel = document.getElementById('custom-prompt-modal-mode-label');
      const countEl = document.getElementById('custom-prompt-modal-count');
      if (!modal || !modalInput) return;
      let saved = '';
      try { saved = localStorage.getItem(`customPrompt_${curMode}`) || ''; } catch { /* ignore */ }
      modalInput.value = saved;
      if (modeLabel) modeLabel.textContent = MODE_LABELS_FOR_PROMPT[curMode] || curMode;
      if (countEl) countEl.textContent = `${saved.length.toLocaleString()}자`;
      modal.style.display = 'flex';
    });
  }
  // 모달 textarea 입력 → 글자수 카운트
  const modalInputInit = document.getElementById('custom-prompt-modal-input') as HTMLTextAreaElement | null;
  if (modalInputInit && !(modalInputInit as any).__bound) {
    (modalInputInit as any).__bound = true;
    modalInputInit.addEventListener('input', () => {
      const countEl = document.getElementById('custom-prompt-modal-count');
      if (countEl) countEl.textContent = `${modalInputInit.value.length.toLocaleString()}자`;
    });
  }
  // 닫기/취소
  ['custom-prompt-modal-close', 'custom-prompt-modal-cancel'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !(el as any).__bound) {
      (el as any).__bound = true;
      el.addEventListener('click', () => {
        const modal = document.getElementById('custom-prompt-modal');
        if (modal) modal.style.display = 'none';
      });
    }
  });
  // 비우기
  const clearBtnInit = document.getElementById('custom-prompt-modal-clear');
  if (clearBtnInit && !(clearBtnInit as any).__bound) {
    (clearBtnInit as any).__bound = true;
    clearBtnInit.addEventListener('click', () => {
      const mi = document.getElementById('custom-prompt-modal-input') as HTMLTextAreaElement | null;
      if (mi) { mi.value = ''; mi.dispatchEvent(new Event('input')); }
    });
  }
  // 저장 & 적용
  const saveBtnInit = document.getElementById('custom-prompt-modal-save');
  if (saveBtnInit && !(saveBtnInit as any).__bound) {
    (saveBtnInit as any).__bound = true;
    saveBtnInit.addEventListener('click', () => {
      const curMode = (document.getElementById('unified-content-mode') as HTMLInputElement)?.value || 'seo';
      const mi = document.getElementById('custom-prompt-modal-input') as HTMLTextAreaElement | null;
      const modal = document.getElementById('custom-prompt-modal');
      if (!mi) return;
      const val = mi.value.trim();
      try {
        localStorage.setItem(`customPrompt_${curMode}`, val);
        localStorage.setItem(`customPromptEnabled_${curMode}`, val ? 'true' : 'false');
      } catch { /* ignore */ }
      syncCustomPromptUiForMode(curMode);
      if (modal) modal.style.display = 'none';
      try { (window as any).toastManager?.success?.(`✅ ${MODE_LABELS_FOR_PROMPT[curMode] || curMode} 모드 개인 프롬프트 저장됨`); } catch { /* ignore */ }
    });
  }
  // 모달 배경 클릭 시 닫기
  const modalRoot = document.getElementById('custom-prompt-modal');
  if (modalRoot && !(modalRoot as any).__bound) {
    (modalRoot as any).__bound = true;
    modalRoot.addEventListener('click', (e) => {
      if (e.target === modalRoot) modalRoot.style.display = 'none';
    });
  }

  // [2026-05-27 작업 20] 페이지 로드 시 개인 프롬프트 영역 자동 표시
  //   기존: #custom-prompt-area 초기 display:none → 모드 버튼 클릭해야만 표시 → 사용자 "어디 갔어?" 보고
  //   수정: 페이지 로드 시 즉시 표시 + 현재 모드(기본 seo)로 syncCustomPromptUiForMode 호출
  const customPromptAreaInit = document.getElementById('custom-prompt-area');
  if (customPromptAreaInit) {
    customPromptAreaInit.style.display = 'block';
    const initialMode = (document.getElementById('unified-content-mode') as HTMLInputElement)?.value || 'seo';
    syncCustomPromptUiForMode(initialMode);
  }

  // ✅ 콘텐츠 모드 선택 버튼 클릭 이벤트 (SEO / 홈판 / 제휴마케팅 / 사용자정의)
  document.querySelectorAll('.content-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode || 'seo';
      const hiddenInput = document.getElementById('unified-content-mode') as HTMLInputElement;
      if (hiddenInput) {
        hiddenInput.value = mode;
        hiddenInput.setAttribute('data-user-selected', 'true');
        // ✅ [2026-02-10] change 이벤트 dispatch — 쇼핑몰 이미지 수집 등 조건부 UI 연동
        hiddenInput.dispatchEvent(new Event('change'));
      }

      const descriptionEl = document.getElementById('content-mode-description');
      const homefeedDescEl = document.getElementById('content-mode-description-homefeed');
      const mateDescEl = document.getElementById('content-mode-description-mate');
      const affiliateDescEl = document.getElementById('content-mode-description-affiliate');
      const customDescEl = document.getElementById('content-mode-description-custom');
      const businessDescEl = document.getElementById('content-mode-description-business');
      const customPromptArea = document.getElementById('custom-prompt-area');
      const businessInfoPanel = document.getElementById('unified-business-info-panel');

      // 버튼 스타일 업데이트
      document.querySelectorAll('.content-mode-btn').forEach(b => {
        (b as HTMLElement).classList.remove('selected');
        (b as HTMLElement).style.background = 'var(--bg-tertiary)';
        (b as HTMLElement).style.color = 'var(--text-muted)';
        (b as HTMLElement).style.border = '2px solid var(--border-medium)';
      });
      (btn as HTMLElement).classList.add('selected');

      // 모드별 색상/그래디언트 정의
      if (mode === 'seo') {
        (btn as HTMLElement).style.background = 'linear-gradient(135deg, #10b981, #059669)';
      } else if (mode === 'homefeed') {
        (btn as HTMLElement).style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
      } else if (mode === 'mate') {
        (btn as HTMLElement).style.background = 'linear-gradient(135deg, #14b8a6, #0f766e)';
      } else if (mode === 'affiliate') {
        (btn as HTMLElement).style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
      } else if (mode === 'custom') {
        (btn as HTMLElement).style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)';
      } else if (mode === 'business') {
        (btn as HTMLElement).style.background = 'linear-gradient(135deg, #f59e0b, #ea580c)';
      }

      (btn as HTMLElement).style.color = 'white';
      (btn as HTMLElement).style.border = 'none';

      // 설명 토글
      if (descriptionEl) descriptionEl.style.display = mode === 'seo' ? 'block' : 'none';
      if (homefeedDescEl) homefeedDescEl.style.display = mode === 'homefeed' ? 'block' : 'none';
      if (mateDescEl) mateDescEl.style.display = mode === 'mate' ? 'block' : 'none';
      if (affiliateDescEl) affiliateDescEl.style.display = mode === 'affiliate' ? 'block' : 'none';
      if (customDescEl) customDescEl.style.display = mode === 'custom' ? 'block' : 'none';
      if (businessDescEl) businessDescEl.style.display = mode === 'business' ? 'block' : 'none';

      // [2026-05-27 작업 13-B] 개인 프롬프트 영역: 모든 모드에서 표시 (체크박스 + 모달 + 모드별 localStorage)
      if (customPromptArea) {
        customPromptArea.style.display = 'block';
        syncCustomPromptUiForMode(mode);
      }

      // ✅ [v1.4.29] 인라인 패널은 항상 숨김 (글로벌 모달로 통일)
      if (businessInfoPanel) {
        businessInfoPanel.style.display = 'none';
      }

      // ✅ [v1.4.28] business 모드 선택 시 글로벌 모달 자동 열기 (단, 이미 정보 있으면 skip)
      if (mode === 'business' && !(window as any)._businessInfo) {
        setTimeout(() => (window as any).openBusinessGlobalModal?.(), 200);
      }
    });
  });

  // ✅ [v1.4.26] 업체 홍보 모드: 의료 키워드 자동 감지 → 경고
  const checkBusinessMedicalKeyword = () => {
    const hiddenInput = document.getElementById('unified-content-mode') as HTMLInputElement;
    if (hiddenInput?.value !== 'business') return;
    const warning = document.getElementById('unified-business-medical-warning');
    if (!warning) return;
    const fields = ['unified-business-info-name', 'unified-business-info-extra'];
    let allText = '';
    fields.forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
      if (el) allText += ' ' + (el.value || '');
    });
    // 키워드 입력란들도 확인
    ['unified-keyword-input', 'unified-keywords-input', 'unified-title-input'].forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
      if (el) allText += ' ' + (el.value || '');
    });
    const medical = ['병원', '한의원', '피부과', '치과', '성형외과', '정형외과', '비뇨기과', '이비인후과', '안과', '소아과', '내과', '의원', '클리닉', '한방', '양방', '의료', '진료', '시술', '수술'];
    const has = medical.some(k => allText.includes(k));
    warning.style.display = has ? 'block' : 'none';
  };
  ['unified-business-info-name', 'unified-business-info-extra', 'unified-keyword-input', 'unified-keywords-input', 'unified-title-input'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', checkBusinessMedicalKeyword);
  });
  // ✅ [v1.4.26] 서비스 범위 라디오 변경 시 region 필드 토글
  const updateBusinessServiceArea = () => {
    const nationwide = (document.getElementById('unified-business-service-nationwide') as HTMLInputElement)?.checked;
    const regionInput = document.getElementById('unified-business-info-region') as HTMLInputElement;
    if (regionInput) {
      regionInput.disabled = nationwide;
      regionInput.placeholder = nationwide ? '🌏 전국 서비스 — 지역 입력 불필요' : '🗺️ 지역 (예: 부산, 울산)';
      if (nationwide) regionInput.value = '';
      regionInput.style.opacity = nationwide ? '0.4' : '1';
    }
  };
  document.getElementById('unified-business-service-nationwide')?.addEventListener('change', updateBusinessServiceArea);
  document.getElementById('unified-business-service-regional')?.addEventListener('change', updateBusinessServiceArea);

  // ✅ [v1.4.28] 글로벌 업체 정보 모달 — 어디서 business 모드를 선택해도 동일 모달
  const openBusinessGlobalModal = () => {
    const modal = document.getElementById('business-global-modal');
    if (!modal) return;
    // 기존 저장된 값 복원
    const saved = (window as any)._businessInfo || {};
    (document.getElementById('bgm-name') as HTMLInputElement).value = saved.name || '';
    (document.getElementById('bgm-phone') as HTMLInputElement).value = saved.phone || '';
    (document.getElementById('bgm-kakao') as HTMLInputElement).value = saved.kakao || '';
    (document.getElementById('bgm-region') as HTMLInputElement).value = saved.region || '';
    (document.getElementById('bgm-address') as HTMLInputElement).value = saved.address || '';
    (document.getElementById('bgm-hours') as HTMLInputElement).value = saved.hours || '';
    (document.getElementById('bgm-extra') as HTMLTextAreaElement).value = saved.extra || '';
    if (saved.serviceArea === 'nationwide') {
      (document.getElementById('bgm-service-nationwide') as HTMLInputElement).checked = true;
    } else {
      (document.getElementById('bgm-service-regional') as HTMLInputElement).checked = true;
    }
    // ✅ [2026-06-12] 홍보 대상 + 심층 리서치 URL 복원
    if (saved.promoTarget === 'product') {
      const productRadio = document.getElementById('bgm-promo-product') as HTMLInputElement | null;
      if (productRadio) productRadio.checked = true;
    } else {
      const businessRadio = document.getElementById('bgm-promo-business') as HTMLInputElement | null;
      if (businessRadio) businessRadio.checked = true;
    }
    const researchUrlInput = document.getElementById('bgm-research-url') as HTMLInputElement | null;
    if (researchUrlInput) researchUrlInput.value = saved.researchUrl || '';
    modal.style.display = 'flex';
  };
  (window as any).openBusinessGlobalModal = openBusinessGlobalModal;

  // ✅ [2026-06-12] 업체 정보 재오픈 버튼 — 기존엔 _businessInfo가 차면 다시 열 방법이 없었음
  document.getElementById('open-business-info-btn')?.addEventListener('click', () => openBusinessGlobalModal());

  const closeBusinessGlobalModal = () => {
    const modal = document.getElementById('business-global-modal');
    if (modal) modal.style.display = 'none';
  };

  document.getElementById('business-global-modal-close')?.addEventListener('click', closeBusinessGlobalModal);
  document.getElementById('business-global-modal-cancel')?.addEventListener('click', closeBusinessGlobalModal);

  // 의료 키워드 자동 감지 (모달 내부)
  const checkBgmMedical = () => {
    const warning = document.getElementById('bgm-medical-warning');
    if (!warning) return;
    const name = (document.getElementById('bgm-name') as HTMLInputElement)?.value || '';
    const extra = (document.getElementById('bgm-extra') as HTMLTextAreaElement)?.value || '';
    const allText = (name + ' ' + extra).toLowerCase();
    const medical = ['병원', '한의원', '피부과', '치과', '성형외과', '정형외과', '비뇨기과', '이비인후과', '안과', '소아과', '내과', '의원', '클리닉', '한방', '양방', '의료', '진료', '시술', '수술'];
    warning.style.display = medical.some(k => allText.includes(k)) ? 'block' : 'none';
  };
  ['bgm-name', 'bgm-extra'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', checkBgmMedical);
  });

  // 라디오 변경 시 region 필드 토글
  const updateBgmServiceArea = () => {
    const nationwide = (document.getElementById('bgm-service-nationwide') as HTMLInputElement)?.checked;
    const regionInput = document.getElementById('bgm-region') as HTMLInputElement;
    if (regionInput) {
      regionInput.disabled = nationwide;
      regionInput.style.opacity = nationwide ? '0.4' : '1';
      if (nationwide) regionInput.value = '';
      regionInput.placeholder = nationwide ? '🌏 전국 — 입력 불필요' : '예: 부산, 울산 / 강남, 송파';
    }
  };
  document.getElementById('bgm-service-nationwide')?.addEventListener('change', updateBgmServiceArea);
  document.getElementById('bgm-service-regional')?.addEventListener('change', updateBgmServiceArea);

  // 저장 버튼
  document.getElementById('business-global-modal-save')?.addEventListener('click', () => {
    const get = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement)?.value?.trim() || '';
    const name = get('bgm-name');
    const phone = get('bgm-phone');
    const kakao = get('bgm-kakao');
    const nationwide = (document.getElementById('bgm-service-nationwide') as HTMLInputElement)?.checked;
    const serviceArea: 'nationwide' | 'regional' = nationwide ? 'nationwide' : 'regional';
    const region = get('bgm-region');

    // 사전 검증
    const missing: string[] = [];
    if (!name) missing.push('업체명');
    if (!phone && !kakao) missing.push('전화번호 또는 카카오톡 (둘 중 하나)');
    if (serviceArea === 'regional' && !region) missing.push('서비스 지역 (지역구 모드)');
    if (missing.length > 0) {
      alert('🏢 필수 정보 누락:\n\n• ' + missing.join('\n• ') + '\n\n빈 값으로 두면 AI가 가짜 정보를 생성할 수 있습니다.');
      return;
    }

    // window._businessInfo에 저장 (전역 단일 소스)
    (window as any)._businessInfo = {
      name,
      phone,
      kakao,
      address: get('bgm-address'),
      hours: get('bgm-hours'),
      region: serviceArea === 'nationwide' ? undefined : region,
      serviceArea,
      extra: get('bgm-extra'),
      // [2026-06-12] 홍보 대상(업체 자체/취급 상품) + 심층 리서치 URL
      promoTarget: (document.getElementById('bgm-promo-product') as HTMLInputElement)?.checked ? 'product' : 'business',
      researchUrl: get('bgm-research-url'),
    };
    console.log('[BusinessGlobalModal] ✅ 업체 정보 저장:', (window as any)._businessInfo);
    if ((window as any).toastManager) {
      (window as any).toastManager.success('✅ 업체 정보 저장 완료');
    }
    closeBusinessGlobalModal();
  });

  // 오버레이 클릭 시 닫기 (배경 클릭만)
  document.getElementById('business-global-modal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'business-global-modal') {
      closeBusinessGlobalModal();
    }
  });


  // 통합 탭 발행 방식 선택 (select 요소 - 레거시 지원)
  const publishModeSelect = document.getElementById('unified-publish-mode') as HTMLSelectElement;
  if (publishModeSelect && publishModeSelect.tagName === 'SELECT') {
    publishModeSelect.addEventListener('change', () => {
      const mode = publishModeSelect.value;
      const scheduleContainer = document.getElementById('unified-schedule-container');

      if (scheduleContainer) {
        if (mode === 'schedule') {
          scheduleContainer.style.display = 'block';
          // ✅ [2026-03-29] date picker + time24Select (10분 단위) 초기화
          const datePicker = document.getElementById('unified-schedule-date-picker') as HTMLInputElement;
          const timeWrap = document.getElementById('unified-schedule-time-select-wrap');
          const scheduleConfirmBtn = document.getElementById('unified-schedule-confirm-btn') as HTMLButtonElement;

          if (datePicker) {
            const now = new Date();
            const minDate = new Date(now.getTime() + 60000);
            const dateStr = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, '0')}-${String(minDate.getDate()).padStart(2, '0')}`;
            datePicker.min = dateStr;
            datePicker.value = dateStr;
            setTimeout(() => {
              datePicker.focus();
              datePicker.showPicker?.();
            }, 100);
          }
          // time24Select 렌더링 (최초 1회만)
          if (timeWrap && !timeWrap.querySelector('.time24-select-wrap')) {
            const now = new Date();
            const roundedMin = Math.ceil(now.getMinutes() / 10) * 10 % 60;
            const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(roundedMin).padStart(2, '0')}`;
            timeWrap.innerHTML = createTime24Select({
              id: 'unified-schedule-time',
              defaultValue: defaultTime,
              step: 10,
              style: 'width: 100%;',
              selectStyle: 'padding: 0.85rem; border-radius: 8px; border: 2px solid var(--border-medium); background: var(--bg-primary); color: var(--text-strong); font-size: 1rem; color-scheme: dark; cursor: pointer; flex: 1;'
            });
            bindTime24Events(timeWrap);
            const syncScheduleHidden = () => {
              const dp = document.getElementById('unified-schedule-date-picker') as HTMLInputElement;
              const hiddenTime = document.getElementById('unified-schedule-time') as HTMLInputElement;
              const hiddenFinal = document.getElementById('unified-schedule-date') as HTMLInputElement;
              if (dp?.value && hiddenTime?.value && hiddenFinal) {
                hiddenFinal.value = `${dp.value}T${hiddenTime.value}`;
                hiddenFinal.dispatchEvent(new Event('change', { bubbles: true }));
              }
            };
            datePicker?.addEventListener('change', syncScheduleHidden);
            timeWrap.addEventListener('change', syncScheduleHidden);
            syncScheduleHidden();
          }
        } else {
          scheduleContainer.style.display = 'none';
          const scheduleConfirmBtn = document.getElementById('unified-schedule-confirm-btn') as HTMLButtonElement;
          if (scheduleConfirmBtn) {
            scheduleConfirmBtn.style.display = 'none';
          }
        }
      }
    });
  }

  // ✅ 예약 시간 입력 시 미리보기 및 확인 버튼 활성화
  const scheduleInput = document.getElementById('unified-schedule-date') as HTMLInputElement;
  const schedulePreview = document.getElementById('schedule-preview');

  if (scheduleInput) {
    // ✅ [2026-02-14] input 이벤트: 자동 blur 제거 — 사용자가 시간까지 충분히 설정할 수 있도록
    // (이전: 600ms 후 blur → 달력이 닫히면서 시간 설정 불가)
    // ✅ change 이벤트: 날짜/시간 선택 완료 시 (달력이 자동으로 닫힘)
    scheduleInput.addEventListener('change', () => {
      const scheduleConfirmBtn = document.getElementById('unified-schedule-confirm-btn') as HTMLButtonElement;

      if (scheduleInput.value) {
        const selectedDate = new Date(scheduleInput.value);
        const formattedDate = selectedDate.toLocaleString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        // 미리보기 표시
        if (schedulePreview) {
          schedulePreview.textContent = `📅 ${formattedDate}`;
          schedulePreview.style.display = 'block';
        }

        // 확인 버튼 활성화 (강조 효과 추가)
        if (scheduleConfirmBtn) {
          scheduleConfirmBtn.disabled = false;
          scheduleConfirmBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          scheduleConfirmBtn.style.cursor = 'pointer';
          scheduleConfirmBtn.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.5)';
          scheduleConfirmBtn.style.transform = 'scale(1.02)';
          scheduleConfirmBtn.innerHTML = `
            <span style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
              <span style="font-size: 1.2rem;">✅</span>
              <span>예약 설정 확인</span>
            </span>
          `;

          // 애니메이션 효과 후 원래대로
          setTimeout(() => {
            scheduleConfirmBtn.style.transform = 'scale(1)';
          }, 300);
        }

        appendLog(`📅 예약 시간 선택됨: ${formattedDate}`);
        toastManager.success('✅ 예약 시간이 선택되었습니다. 확인 버튼을 눌러주세요.');

        // ✅ [2026-02-14] 자동 확인 제거 — 사용자가 시간까지 설정한 후 직접 확인 버튼 클릭
        // (이전: 0.5초 후 scheduleConfirmBtn.click() → 시간 설정 전에 발행으로 넘어가는 버그)
      } else {
        // 값이 없으면 비활성화
        if (schedulePreview) {
          schedulePreview.style.display = 'none';
        }
        if (scheduleConfirmBtn) {
          scheduleConfirmBtn.disabled = true;
          scheduleConfirmBtn.style.background = 'linear-gradient(135deg, #9ca3af, #6b7280)';
          scheduleConfirmBtn.style.cursor = 'not-allowed';
          scheduleConfirmBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
          scheduleConfirmBtn.innerHTML = `
            <span style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
              <span style="font-size: 1.2rem;">⏰</span>
              <span>날짜와 시간을 먼저 선택하세요</span>
            </span>
          `;
        }
      }
    });

    // ✅ 예약발행 모드 선택 시 달력 자동 열기
    const publishModeSelect = document.getElementById('unified-publish-mode') as HTMLSelectElement;
    if (publishModeSelect) {
      publishModeSelect.addEventListener('change', () => {
        if (publishModeSelect.value === 'schedule') {
          // 약간의 딜레이 후 달력 열기 (UI 렌더링 대기)
          const dp = document.getElementById('unified-schedule-date-picker') as HTMLInputElement;
          setTimeout(() => {
            dp?.showPicker?.();
          }, 100);
        }
      });
    }
  }

  // 예약 시간 확인 버튼 이벤트
  const scheduleConfirmBtn = document.getElementById('unified-schedule-confirm-btn') as HTMLButtonElement;
  if (scheduleConfirmBtn) {
    scheduleConfirmBtn.addEventListener('click', () => {
      const scheduleInput = document.getElementById('unified-schedule-date') as HTMLInputElement;
      const publishModeSelect = document.getElementById('unified-publish-mode') as HTMLSelectElement;
      const successMessage = document.getElementById('schedule-success-message');

      if (scheduleInput && scheduleInput.value) {
        const selectedDate = new Date(scheduleInput.value);
        const now = new Date();

        if (selectedDate <= now) {
          toastManager.error('⚠️ 예약 시간은 현재 시간 이후로 설정해주세요.');
          return;
        }

        // ✅ datetime-local 형식(2025-01-15T14:30)을 YYYY-MM-DD HH:mm 형식으로 변환
        const datetimeValue = scheduleInput.value; // 2025-01-15T14:30
        const formattedScheduleDate = datetimeValue.replace('T', ' '); // 2025-01-15 14:30

        // ✅ 변환된 날짜를 data 속성에 저장 (발행 시 사용)
        scheduleInput.dataset.formattedDate = formattedScheduleDate;

        const formattedDate = selectedDate.toLocaleString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        // ✅ 발행 모드를 'schedule'로 확실하게 설정
        if (publishModeSelect) {
          publishModeSelect.value = 'schedule';
        }

        // ✅ 성공 메시지 표시
        if (successMessage) {
          successMessage.style.display = 'block';
          successMessage.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
              <span style="font-size: 2rem;">✅</span>
              <div>
                <div style="font-size: 1.1rem; margin-bottom: 0.25rem;">예약이 설정되었습니다!</div>
                <div style="font-size: 0.9rem; opacity: 0.9;">${formattedDate}에 자동으로 발행됩니다.</div>
              </div>
            </div>
          `;

          // 3초 후 자동 숨김
          setTimeout(() => {
            if (successMessage) {
              successMessage.style.display = 'none';
            }
          }, 5000);
        }

        toastManager.success(`✅ 예약 설정 완료: ${formattedDate}`);
        appendLog(`✅ 예약 발행 시간 설정: ${formattedDate}`);

        // ✅ [2026-02-07] 예약 설정 확인 후 발행 버튼으로 자연스럽게 스크롤 및 하이라이트
        const publishBtn = document.getElementById('unified-publish-btn');
        if (publishBtn) {
          setTimeout(() => {
            publishBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // 도착 후 발행 버튼 하이라이트 펄스 애니메이션
            setTimeout(() => {
              publishBtn.style.transition = 'all 0.3s ease';
              publishBtn.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.6), 0 8px 25px rgba(59, 130, 246, 0.5)';
              publishBtn.style.transform = 'scale(1.03)';

              // 1.5초 후 원래 스타일로 복원
              setTimeout(() => {
                publishBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                publishBtn.style.transform = 'scale(1)';
              }, 1500);
            }, 500);
          }, 300);
        }
      } else {
        toastManager.error('⚠️ 예약 시간을 선택해주세요.');
      }
    });
  }
}

// 모드 설명 업데이트
function updateModeDescription(mode: string | null): void {
  const fullAutoDesc = document.getElementById('mode-description-full-auto');
  const semiAutoDesc = document.getElementById('mode-description-semi-auto');

  if (fullAutoDesc && semiAutoDesc) {
    if (mode === 'full-auto') {
      fullAutoDesc.style.display = 'block';
      semiAutoDesc.style.display = 'none';
    } else {
      fullAutoDesc.style.display = 'none';
      semiAutoDesc.style.display = 'block';
    }
  }
}

// 반자동 모드 섹션 토글
function toggleSemiAutoSection(show: boolean): void {
  const semiAutoSection = document.getElementById('unified-semi-auto-section');
  if (semiAutoSection) {
    semiAutoSection.style.display = show ? 'block' : 'none';
  }

  // ✅ 반자동 섹션이 보여질 때, 수정 영역이 비어 있으면 currentStructuredContent로 자동 복원
  if (show) {
    try {
      const structuredContent = (window as any).currentStructuredContent;
      fillSemiAutoFields(structuredContent);
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
  }
}



// 발행 시작 알림 표시
function showPublishStartNotification(message: string): void {
  // 기존 알림 제거
  const existingNotification = document.getElementById('publish-start-notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  // 새로운 알림 생성
  const notification = document.createElement('div');
  notification.id = 'publish-start-notification';
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    padding: 2rem 3rem;
    border-radius: 16px;
    box-shadow: 0 20px 40px rgba(16, 185, 129, 0.4);
    z-index: 10000;
    text-align: center;
    font-size: 1.2rem;
    font-weight: 600;
    animation: slideIn 0.3s ease-out;
    border: 3px solid rgba(255, 255, 255, 0.3);
  `;

  notification.innerHTML = `
    <div style="font-size: 2rem; margin-bottom: 0.5rem;">🚀</div>
    <div>${message}</div>
    <div style="margin-top: 1rem; font-size: 0.9rem; opacity: 0.9;">잠시만 기다려주세요...</div>
  `;

  // 애니메이션 스타일 추가
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translate(-50%, -60%); opacity: 0; }
      to { transform: translate(-50%, -50%); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(notification);

  // 3초 후 자동 제거
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => {
        notification.remove();
        style.remove();
      }, 300);
    }
  }, 3000);

  // 추가 애니메이션
  style.textContent += `
    @keyframes slideOut {
      from { transform: translate(-50%, -50%); opacity: 1; }
      to { transform: translate(-50%, -40%); opacity: 0; }
    }
  `;
}

// 진행률 표시 초기화
function initializePublishProgress(): void {
  // 기존 진행률 컨테이너 제거
  const existingProgress = document.getElementById('publish-progress-container');
  if (existingProgress) {
    existingProgress.remove();
  }

  // 새로운 진행률 컨테이너 생성
  const progressContainer = document.createElement('div');
  progressContainer.id = 'publish-progress-container';
  progressContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 350px;
    background: var(--bg-primary);
    border: 2px solid var(--primary);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  progressContainer.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 1rem;">
      <div style="font-size: 1.5rem; margin-right: 0.5rem;">📊</div>
      <div style="font-weight: 600; color: var(--text-strong);">발행 진행률</div>
    </div>

    <div style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span id="progress-text" style="color: var(--text-muted); font-size: 0.9rem;">준비 중...</span>
        <span id="progress-percent" style="color: var(--text-gold); font-weight: 600;">0%</span>
      </div>
      <div style="width: 100%; height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
        <div id="progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--primary), var(--accent)); border-radius: 4px; transition: width 0.3s ease;"></div>
      </div>
    </div>

    <div id="progress-details" style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.4;">
      발행을 준비하고 있습니다...
    </div>

    <button id="close-progress-btn" style="
      position: absolute;
      top: 10px;
      right: 10px;
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.2rem;
      cursor: pointer;
      padding: 0.2rem;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    " onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'" onmouseout="this.style.background='none'" title="닫기">×</button>
  `;

  document.body.appendChild(progressContainer);

  // 닫기 버튼 이벤트
  const closeBtn = progressContainer.querySelector('#close-progress-btn') as HTMLButtonElement;
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      progressContainer.remove();
    });
  }
}


injectAppendLog(appendLog);
registerGlobalErrorHandlers();

// ✅ 예상 완료 시간 계산 헬퍼
let progressStartTime: number | null = null;

function calculateEstimatedTime(currentPercent: number): string {
  if (!progressStartTime || currentPercent <= 0) return '';

  const elapsed = Date.now() - progressStartTime;
  const remaining = (elapsed / currentPercent) * (100 - currentPercent);

  if (remaining < 60000) {
    return `약 ${Math.ceil(remaining / 1000)}초 남음`;
  } else {
    return `약 ${Math.ceil(remaining / 60000)}분 남음`;
  }
}

// ✅ 발행 완료 후 필드 초기화
function resetAllFields(): void {
  try {
    // 풀오토 모드 필드 초기화
    const urlInputs = document.querySelectorAll('.unified-url-input') as NodeListOf<HTMLInputElement>;
    urlInputs.forEach(input => input.value = '');

    const keywordsInput = document.getElementById('unified-keywords') as HTMLInputElement;
    if (keywordsInput) keywordsInput.value = '';

    const titleInput = document.getElementById('unified-title') as HTMLInputElement;
    if (titleInput) titleInput.value = '';

    // ✅ 연속발행(continuous) 입력값도 초기화 (최근 작성 키워드가 남는 현상 방지)
    const continuousKeywordInput = document.getElementById('continuous-keyword-input') as HTMLInputElement | null;
    if (continuousKeywordInput) continuousKeywordInput.value = '';
    const continuousKeywordTitleInput = document.getElementById('continuous-keyword-title-input') as HTMLInputElement | null;
    if (continuousKeywordTitleInput) continuousKeywordTitleInput.value = '';

    const continuousUrlInput = document.getElementById('continuous-url-input') as HTMLInputElement | null;
    if (continuousUrlInput) continuousUrlInput.value = '';
    const continuousUrlKeywordInput = document.getElementById('continuous-url-keyword-input') as HTMLInputElement | null;
    if (continuousUrlKeywordInput) continuousUrlKeywordInput.value = '';
    const continuousUrlTitleInput = document.getElementById('continuous-url-title-input') as HTMLInputElement | null;
    if (continuousUrlTitleInput) continuousUrlTitleInput.value = '';

    // 개별 키워드 필드 방식(continuous-keyword-fields-container)
    const continuousKeywordFieldInputs = document.querySelectorAll('.continuous-keyword-field-input') as NodeListOf<HTMLInputElement>;
    continuousKeywordFieldInputs.forEach((input) => (input.value = ''));

    // 반자동 모드 필드 초기화
    const manualTitleInput = document.getElementById('unified-manual-title') as HTMLInputElement;
    if (manualTitleInput) manualTitleInput.value = '';

    const manualContentTextarea = document.getElementById('unified-manual-content') as HTMLTextAreaElement;
    if (manualContentTextarea) manualContentTextarea.value = '';

    const manualHashtagsInput = document.getElementById('unified-manual-hashtags') as HTMLInputElement;
    if (manualHashtagsInput) manualHashtagsInput.value = '';

    // 생성된 제목/해시태그 필드 초기화
    const generatedTitleInput = document.getElementById('unified-generated-title') as HTMLInputElement;
    if (generatedTitleInput) {
      generatedTitleInput.value = '';
      generatedTitleInput.readOnly = false;
    }

    const generatedHashtagsInput = document.getElementById('unified-generated-hashtags') as HTMLInputElement;
    if (generatedHashtagsInput) {
      generatedHashtagsInput.value = '';
      generatedHashtagsInput.readOnly = false;
    }

    // ✅ 생성된 본문 필드 초기화 (unified-generated-content)
    const generatedContentTextarea = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
    if (generatedContentTextarea) {
      generatedContentTextarea.value = '';
      generatedContentTextarea.readOnly = false;
    }

    // ✅ 본문 필드 초기화 (unified-body)
    const unifiedBodyTextarea = document.getElementById('unified-body') as HTMLTextAreaElement;
    if (unifiedBodyTextarea) {
      unifiedBodyTextarea.value = '';
      unifiedBodyTextarea.readOnly = false;
    }

    // ✅ [2026-03-05 FIX] 발행 모드(즉시/임시/예약)는 사용자 선택이므로 초기화하지 않음!
    // 기존 버그: hidden input만 'publish'로 리셋하고 UI 버튼(.selected)은 그대로 두어
    //           사용자가 "임시발행"이 선택된 것으로 보이지만 실제로는 "즉시발행"이 되는 동기화 불일치
    // 예약 발행인 경우 날짜만 초기화 (다음 발행에서 새로운 날짜 선택 필요)
    const currentPublishMode = (document.getElementById('unified-publish-mode') as HTMLInputElement)?.value;
    if (currentPublishMode === 'schedule') {
      const scheduleDateInput = document.getElementById('unified-schedule-date') as HTMLInputElement;
      if (scheduleDateInput) {
        scheduleDateInput.value = '';
        scheduleDateInput.removeAttribute('data-formatted-date');
      }
    }
    console.log(`[resetAllFields] 발행 모드 유지: ${currentPublishMode} (리셋하지 않음)`);

    // 미리보기 초기화
    const previewSection = document.getElementById('unified-preview-section');
    if (previewSection) {
      previewSection.style.display = 'none';
    }

    const previewTitle = document.getElementById('unified-preview-title');
    if (previewTitle) previewTitle.textContent = '제목이 여기에 표시됩니다';

    const previewBody = document.getElementById('unified-preview-body');
    if (previewBody) previewBody.innerHTML = '<p style="color: var(--text-muted);">본문이 여기에 표시됩니다</p>';

    const previewHashtags = document.getElementById('unified-preview-hashtags');
    if (previewHashtags) previewHashtags.textContent = '';

    // ✅ [2026-05-18] 4지표 (AI탐지/법적/SEO/일일권장) placeholder 리셋
    resetRiskIndicators();

    // ✅ [2026-01-22] 쇼핑커넥트 관련 UI 필드 초기화 (캐시 방지)
    const affiliateLinkInput = document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement;
    if (affiliateLinkInput) affiliateLinkInput.value = '';

    const batchLinkInput = document.getElementById('batch-link-input') as HTMLInputElement;
    if (batchLinkInput) batchLinkInput.value = '';

    const autoBannerCheckbox = document.getElementById('shopping-connect-auto-banner') as HTMLInputElement;
    if (autoBannerCheckbox) autoBannerCheckbox.checked = false;

    const useVideoCheckbox = document.getElementById('shopping-connect-use-video') as HTMLInputElement;
    if (useVideoCheckbox) useVideoCheckbox.checked = false;

    // CTA 필드 초기화
    const ctaItemsContainer = document.getElementById('unified-cta-items-container');
    if (ctaItemsContainer) ctaItemsContainer.innerHTML = '';

    // 이전글 선택 필드 초기화
    const previousPostTitleInput = document.getElementById('previous-post-title') as HTMLInputElement;
    if (previousPostTitleInput) previousPostTitleInput.value = '';
    const previousPostUrlInput = document.getElementById('previous-post-url') as HTMLInputElement;
    if (previousPostUrlInput) previousPostUrlInput.value = '';

    // 이미지 관리 탭 초기화
    const imageTitleInput = document.getElementById('image-title') as HTMLInputElement;
    if (imageTitleInput) imageTitleInput.value = '';

    const promptsContainer = document.getElementById('prompts-container');
    if (promptsContainer) promptsContainer.innerHTML = '';

    const generatedImagesSection = document.getElementById('generated-images-section');
    if (generatedImagesSection) generatedImagesSection.style.display = 'none';

    // ✅ [2026-03-29 FIX] ImageManager도 초기화 (이전에 누락되어 imageMap 잔존)
    try {
      ImageManager.clear();
    } catch (e) {
      console.warn('[resetAllFields] ImageManager.clear() 실패:', e);
    }

    // 전역 변수 초기화 (발행 후 캐시 완전 제거)
    (window as any).currentStructuredContent = null;
    (window as any).imageManagementGeneratedImages = null;
    currentPostId = null; // ✅ 글 ID도 초기화
    // ✅ [2026-01-22] 추가 캐시 초기화 - 모든 발행 모드에서 완전 초기화
    (window as any).customBannerPath = null; // 커스텀 배너 경로
    (window as any).generatedImages = null; // 생성된 이미지
    (window as any).previousPostUrl = null; // 이전글 URL (수동 설정 시)
    (window as any).previousPostTitle = null; // 이전글 제목 (수동 설정 시)
    (window as any).affiliateLinkData = null; // 제휴 링크 데이터
    (window as any).crawledProductInfo = null; // 크롤링된 제품 정보
    (window as any).collectedImages = null; // 수집된 이미지

    // ✅ [2026-03-10 CLEANUP] full-auto-enable-preview 유령 참조 제거 — 이 HTML 요소는 존재하지 않음
    // 미리보기는 기본 활성화 상태이므로 별도 초기화 불필요

    // ✅ [Fix] 글 생성 후 풀오토 사용불가 상태 초기화
    (window as any).hasGeneratedContent = false;
    if (typeof (window as any).updatePublishButtonVisibility === 'function') {
      (window as any).updatePublishButtonVisibility();
    }

    appendLog('🔄 모든 필드가 초기화되었습니다. 새로운 글을 작성할 수 있습니다.');
    console.log('[Reset] 모든 필드 초기화 완료');
  } catch (error) {
    console.error('[Reset] 필드 초기화 실패:', error);
  }
}

// ✅ [New] 편집 필드와 통합 미리보기 실시간 동기화 함수
function syncIntegratedPreviewFromInputs(): void {
  const titleInput = document.getElementById('unified-generated-title') as HTMLInputElement;
  const contentArea = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
  const hashtagsInput = document.getElementById('unified-generated-hashtags') as HTMLInputElement;

  const previewTitle = document.getElementById('unified-preview-title');
  const previewBody = document.getElementById('unified-preview-body');
  const previewHashtags = document.getElementById('unified-preview-hashtags');

  // 1. 미리보기 업데이트
  if (previewTitle && titleInput) {
    previewTitle.textContent = titleInput.value || '제목이 여기에 표시됩니다';
  }

  if (previewBody && contentArea) {
    const text = contentArea.value || '';
    if (!text) {
      previewBody.innerHTML = '<p style="color: var(--text-muted);">본문이 여기에 표시됩니다</p>';
    } else {
      // 🌈 [New] 하이라이트 색상 (Yellow, Blue, Red 계열 파스텔톤)
      const highlightColors = [
        '#fff9c4', // Yellow
        '#bbdefb', // Blue
        '#ffcdd2', // Red
        '#f0f4c3', // Lime
        '#d1c4e9'  // Purple
      ];

      // 본문을 <p> 태그와 <br>로 변환하여 미리보기 구성
      const paragraphs = text.split(/\n{2,}/);
      previewBody.innerHTML = paragraphs.map(p => {
        // 1. HTML Escape (보안)
        const lines = p.split('\n').map(line => {
          let safeLine = escapeHtml(line);

          // 2. **Bold** -> Highlight 변환
          safeLine = safeLine.replace(/\*\*([^*]+)\*\*/g, (match, content) => {
            const randomColor = highlightColors[Math.floor(Math.random() * highlightColors.length)];
            return `<span style="background-color: ${randomColor}; padding: 2px 4px; border-radius: 4px; font-weight: 600; box-decoration-break: clone; -webkit-box-decoration-break: clone;">${content}</span>`;
          });

          return safeLine;
        }).join('<br>');

        return `<p style="margin-bottom: 1.25rem; line-height: 1.8;">${lines}</p>`;
      }).join('');
    }
  }

  if (previewHashtags && hashtagsInput) {
    previewHashtags.textContent = hashtagsInput.value || '';
  }

  // 2. 전역 상태값(currentStructuredContent) 동기화 - 발행 시 사용됨
  if ((window as any).currentStructuredContent) {
    const sc = (window as any).currentStructuredContent;
    sc.selectedTitle = titleInput?.value || '';
    sc.bodyPlain = contentArea?.value || '';
    sc.hashtags = hashtagsInput?.value.split(/\s+/).filter(h => h.startsWith('#')) || [];
  }
}





// 백업에서 복구
function restoreFromBackup(timestamp: number): void {
  try {
    const backupKey = `${BACKUP_KEY_PREFIX}${timestamp}`;
    const data = localStorage.getItem(backupKey);

    if (!data) {
      alert('백업을 찾을 수 없습니다.');
      return;
    }

    const backup: AutosaveData = JSON.parse(data);

    // 모드 전환
    const modeBtn = document.querySelector(`.unified-mode-btn[data-mode="${backup.mode}"]`) as HTMLButtonElement;
    if (modeBtn) {
      modeBtn.click();
    }

    // 콘텐츠 복구
    if (backup.structuredContent) {
      (window as any).currentStructuredContent = backup.structuredContent;
      fillSemiAutoFields(backup.structuredContent);
      updateUnifiedPreview(backup.structuredContent);
    }

    // 이미지 복구 (✅ prompt 필드 보장)
    if (backup.generatedImages && backup.generatedImages.length > 0) {
      const imagesWithPrompt = backup.generatedImages.map((img: any, index: number) => ({
        ...img,
        prompt: img.prompt || img.heading || `이미지 ${index + 1}`,
        url: img.url || img.filePath || img.previewDataUrl,
      }));
      (window as any).imageManagementGeneratedImages = imagesWithPrompt;
      generatedImages = imagesWithPrompt;
      // ✅ [2026-02-12 P1 FIX #20] ImageManager 연동 + sync 추가
      try {
        hydrateImageManagerFromImages(backup.structuredContent, imagesWithPrompt);
      } catch { /* ignore */ }
      try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }
    }

    const backupDate = new Date(backup.timestamp);
    alert(`✅ 백업이 복구되었습니다!\n\n백업 시간: ${backupDate.toLocaleString()}`);
    appendLog(`✅ 백업 복구 완료 (${backupDate.toLocaleString()})`);
  } catch (error) {
    console.error('[Backup] 백업 복구 실패:', error);
    alert('백업 복구에 실패했습니다.');
  }
}



// 임시 저장 데이터 복구
async function askAutosaveRecoveryChoice(timeSinceMinutes: number): Promise<boolean> {
  try {
    const choice = await recoveryBlockingModal.show('B7', {
      title: '이전 작업을 복구할까요?',
      message:
        `${timeSinceMinutes}분 전에 자동 저장된 작업이 있습니다.\n\n` +
        '복구하면 글/이미지 편집 상태를 이어서 사용할 수 있습니다.\n' +
        '아니요를 누르면 현재 세션은 완전히 초기화되고, 이전 이미지 배치도 모두 버립니다.',
      choices: [
        { id: 'restore-autosave', label: '복구하기', variant: 'primary' },
        { id: 'discard-autosave', label: '아니요, 새로 시작', variant: 'destructive' },
      ],
    });
    return choice.chosenId === 'restore-autosave';
  } catch (error) {
    console.warn('[Autosave] recovery choice modal failed:', error);
    return false;
  }
}

async function restoreAutosavedContent(): Promise<void> {
  const saved = loadAutosavedContent();
  if (!saved) return;

  const timeSince = Math.floor((Date.now() - saved.timestamp) / 1000 / 60); // 분 단위

  // ✅ [v2.10.224] 동기 confirm() 제거 — 사용자 보고: 앱 켜자마자 main thread 181460ms 블로킹
  //   원인: Electron의 confirm()은 사용자 응답 전까지 메인 스레드를 동기로 잠금.
  //   사용자가 다이얼로그를 못 봤거나 무시하면 그 시간 동안 모든 IPC/콜백 정지 →
  //   "콘솔에 아무것도 안 뜬다" 체감.
  //   수정: 토스트로만 알림 + 자동 복구 진행. 의도치 않은 복구가 부담스러우면
  //         clearAutosavedContent() 호출은 토스트 메시지에 안내.
  const shouldRestore = await askAutosaveRecoveryChoice(timeSince);
  if (!shouldRestore) {
    clearAutosavedContent();
    try {
      resetAllFields();
      (window as any).clearFullAutoGeneratedImageBatch?.(null, 'autosave-declined');
    } catch (error) {
      console.warn('[Autosave] discard reset failed:', error);
    }
    appendLog('🧹 이전 자동저장 작업을 버리고 깨끗한 새 상태로 시작합니다.');
    try {
      (window as any).toastManager?.info?.('이전 작업을 복구하지 않고 새 상태로 시작합니다.', 4000);
    } catch { /* ignore */ }
    return;
  }

  try {
    const tm = (window as any).toastManager;
    if (tm) tm.info(`💾 ${timeSince}분 전 작업 자동 복구 중...`, 5000);
  } catch { /* 토스트 실패 무시 */ }

  // confirm() 분기 제거 — 항상 복구 진행
  if (true) {
    appendLog(`🔄 임시 저장 데이터 복구 중... (${timeSince}분 전)`);

    // 모드 전환
    const modeBtn = document.querySelector(`.unified-mode-btn[data-mode="${saved.mode}"]`) as HTMLButtonElement;
    if (modeBtn) {
      modeBtn.click();
    }

    // 콘텐츠 복구
    if (saved.structuredContent) {
      (window as any).currentStructuredContent = saved.structuredContent;

      // ✅ [Fix] 반자동 편집 섹션 강제 표시 및 데이터 채우기 (백업 복원 시)
      setTimeout(() => {
        fillSemiAutoFields(saved.structuredContent);
        // 섹션 강제 표시
        const semiAutoSection = document.getElementById('unified-semi-auto-section');
        if (semiAutoSection) {
          semiAutoSection.style.display = 'block';
          semiAutoSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);

      updateUnifiedPreview(saved.structuredContent);
      appendLog('✅ 콘텐츠 및 반자동 편집창 복구 완료');
    }

    // 이미지 복구 (✅ prompt 필드 보장)
    if (saved.generatedImages && saved.generatedImages.length > 0) {
      const imagesWithPrompt = saved.generatedImages.map((img: any, index: number) => ({
        ...img,
        prompt: img.prompt || img.heading || `이미지 ${index + 1}`,
        url: img.url || img.filePath || img.previewDataUrl,
      }));
      (window as any).imageManagementGeneratedImages = imagesWithPrompt;
      generatedImages = imagesWithPrompt;
      appendLog(`✅ 이미지 ${imagesWithPrompt.length}개 복구 완료`);

      try {
        hydrateImageManagerFromImages(saved.structuredContent, imagesWithPrompt);
      } catch (e) {
        console.warn('[renderer] catch ignored:', e);
      }
      // ✅ [2026-02-12 P1 FIX #21] hydrate 후 sync 추가 (displayGeneratedImages를 포함)
      try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }
    }

    // ✅ 복구 완료 후 자동 소제목 분석
    if (saved.structuredContent?.headings?.length > 0) {
      setTimeout(async () => {
        try {
          appendLog('🔍 자동 소제목 분석 시작...');
          await autoAnalyzeHeadings(saved.structuredContent);
          appendLog('✅ 소제목 분석 완료!');
        } catch (error) {
          appendLog(`⚠️ 소제목 자동 분석 실패: ${(error as Error).message}`);
        }
      }, 500);
    }

    // ✅ CTA 자동 생성
    if (saved.structuredContent) {
      autoGenerateCTA(saved.structuredContent);
    }

    // ✅ [v2.7.92] 자동저장 복원 후 반자동/풀오토 발행 버튼 직접 활성화
    //   사용자 보고: "그냥 종료하면 자동으로 불러오시겠습니까? 해서 불러오는거"
    //   원인: v2.7.91이 글 목록 [불러오기]만 처리, autosave 경로는 누락
    try {
      const semiAutoBtn = document.getElementById('semi-auto-publish-btn') as HTMLButtonElement | null;
      if (semiAutoBtn) {
        semiAutoBtn.disabled = false;
        semiAutoBtn.style.opacity = '1';
        semiAutoBtn.style.cursor = 'pointer';
        semiAutoBtn.title = '';
      }
      const fullAutoBtn = document.getElementById('full-auto-publish-btn') as HTMLButtonElement | null;
      if (fullAutoBtn) {
        fullAutoBtn.disabled = false;
        fullAutoBtn.style.opacity = '1';
        fullAutoBtn.style.cursor = 'pointer';
      }
      const markFn = (window as any).markContentGenerated;
      if (typeof markFn === 'function') markFn();
      const previewSection = document.getElementById('unified-preview-section');
      if (previewSection) previewSection.style.display = 'block';
      appendLog(`▶️ 자동저장 복원 후 발행 버튼 활성화 완료`);
    } catch (e: any) {
      console.warn('[restoreAutosaved] 발행 버튼 활성화 실패:', e?.message);
    }

    // ✅ [v2.10.224] alert() 제거 — 동기 다이얼로그 → 메인 스레드 블로킹 원인
    try {
      const tm = (window as any).toastManager;
      if (tm) tm.success('✅ 작업이 복구되었습니다!', 4000);
    } catch { /* 토스트 실패 무시 */ }
  }
}

// 통합 진행률 표시 함수
// 이미지 관리 탭 진행률 표시 함수
function showImagesProgress(percent: number, text: string, details?: string): void {
  console.log(`[ImagesProgress] ${percent}%: ${text}`);

  // 시작 시간 기록
  if (percent === 0 || !progressStartTime) {
    progressStartTime = Date.now();
  }

  // images-progress-container 업데이트
  const imagesContainer = document.getElementById('images-progress-container');
  if (imagesContainer) {
    imagesContainer.style.display = 'block';

    const progressBar = document.getElementById('images-progress-bar');
    const progressPercent = document.getElementById('images-progress-percent');
    const progressText = document.getElementById('images-progress-text');
    const progressDetail = document.getElementById('images-progress-detail');

    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }

    if (progressPercent) {
      const estimatedTime = calculateEstimatedTime(percent);
      progressPercent.textContent = estimatedTime ? `${percent}% (${estimatedTime})` : `${percent}%`;
    }

    if (progressText) {
      progressText.textContent = text;
    }

    if (progressDetail && details) {
      progressDetail.textContent = details;
    }
  }

  // 완료 시 시작 시간 초기화
  if (percent >= 100) {
    progressStartTime = null;
  }
}

function showUnifiedProgress(percent: number, text: string, details?: string): void {
  console.log(`[Progress] ${percent}%: ${text}`);

  // 시작 시간 기록
  if (percent === 0 || !progressStartTime) {
    progressStartTime = Date.now();
  }

  // unified-progress-container 업데이트
  const unifiedContainer = document.getElementById('unified-progress-container');
  if (unifiedContainer) {
    unifiedContainer.style.display = 'block';

    const progressBar = document.getElementById('unified-progress-bar');
    const progressPercent = document.getElementById('unified-progress-percent');
    const progressText = document.getElementById('unified-progress-text');
    const progressDetail = document.getElementById('unified-progress-detail');

    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }

    // ✅ 이미지 관리 탭 진행률도 동기화
    showImagesProgress(percent, text, details);
    if (progressPercent) {
      const estimatedTime = calculateEstimatedTime(percent);
      progressPercent.textContent = estimatedTime ? `${percent}% (${estimatedTime})` : `${percent}%`;
    }
    if (progressText) {
      progressText.textContent = text;
    }
    if (progressDetail && details) {
      progressDetail.textContent = details;
    }
  }

  // publish-progress-container도 업데이트 (호환성)
  const publishContainer = document.getElementById('publish-progress-container');
  if (publishContainer) {
    const progressBar = publishContainer.querySelector('#progress-bar') as HTMLElement;
    const progressPercent = publishContainer.querySelector('#progress-percent') as HTMLElement;
    const progressText = publishContainer.querySelector('#progress-text') as HTMLElement;
    const progressDetails = publishContainer.querySelector('#progress-details') as HTMLElement;

    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressText) progressText.textContent = text;
    if (progressDetails && details) progressDetails.textContent = details;
  }

  // 완료 시 시작 시간 초기화
  if (percent >= 100) {
    progressStartTime = null;
  }
}

function hideUnifiedProgress(): void {
  const unifiedContainer = document.getElementById('unified-progress-container');
  if (unifiedContainer) {
    unifiedContainer.style.display = 'none';
  }
}

// ✅ 로그 및 진행상황 초기화 함수
function resetLogAndProgress(logOutputId?: string, progressContainerId?: string): void {
  // 로그 초기화
  const logOutputs: HTMLElement[] = [];

  if (logOutputId) {
    const specificOutput = document.getElementById(logOutputId);
    if (specificOutput) logOutputs.push(specificOutput);
  } else {
    // 모든 로그 출력 요소 초기화
    const unifiedLog = document.getElementById('unified-log-output');
    const imagesLog = document.getElementById('images-log-output');
    const defaultLog = document.getElementById('log-output');

    if (unifiedLog) logOutputs.push(unifiedLog);
    if (imagesLog) logOutputs.push(imagesLog);
    if (defaultLog) logOutputs.push(defaultLog);
  }

  logOutputs.forEach(logOutput => {
    if (logOutput) {
      logOutput.innerHTML = '';
      logOutput.textContent = '';
    }
  });

  // 진행상황 초기화
  const progressContainers: HTMLElement[] = [];

  if (progressContainerId) {
    const specificContainer = document.getElementById(progressContainerId);
    if (specificContainer) progressContainers.push(specificContainer);
  } else {
    // 모든 진행률 컨테이너 초기화
    const unifiedProgress = document.getElementById('unified-progress-container');
    const imagesProgress = document.getElementById('images-progress-container');
    const publishProgress = document.getElementById('publish-progress-container');

    if (unifiedProgress) progressContainers.push(unifiedProgress);
    if (imagesProgress) progressContainers.push(imagesProgress);
    if (publishProgress) progressContainers.push(publishProgress);
  }

  progressContainers.forEach(container => {
    if (container) {
      // 진행률 바 초기화
      const progressBar = container.querySelector('[id$="-progress-bar"], #progress-bar') as HTMLElement;
      if (progressBar) progressBar.style.width = '0%';

      // 진행률 퍼센트 초기화
      const progressPercent = container.querySelector('[id$="-progress-percent"], #progress-percent') as HTMLElement;
      if (progressPercent) progressPercent.textContent = '0%';

      // 진행률 텍스트 초기화
      const progressText = container.querySelector('[id$="-progress-text"], #progress-text') as HTMLElement;
      if (progressText) progressText.textContent = '준비 중...';

      // 진행률 상세 초기화
      const progressDetail = container.querySelector('[id$="-progress-detail"], #progress-details') as HTMLElement;
      if (progressDetail) progressDetail.textContent = '';

      // 컨테이너 숨기기
      container.style.display = 'none';
    }
  });

  // 진행 시작 시간 초기화
  progressStartTime = null;

  // 로그 관련 변수 초기화
  if (typeof (appendLog as any).lastMessage !== 'undefined') {
    (appendLog as any).lastMessage = null;
    (appendLog as any).lastTime = null;
  }

  console.log('[Reset] 로그 및 진행상황이 초기화되었습니다.');
  appendLog('🔄 로그 및 진행상황이 초기화되었습니다.', logOutputId);
}

// 통합 탭 URL 필드 관리
function initUnifiedUrlFields(): void {
  const addBtn = document.getElementById('unified-add-url-field-btn') as HTMLButtonElement;
  const container = document.getElementById('unified-url-fields-container') as HTMLDivElement;
  if (addBtn && container) {
    addBtn.addEventListener('click', () => {
      const urlItems = container.querySelectorAll('.url-field-item');
      const newIndex = urlItems.length;

      const newItem = document.createElement('div');
      newItem.className = 'url-field-item';
      newItem.style.cssText = 'display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;';
      newItem.innerHTML = `
        <input type="url" class="url-field-input unified-url-input" placeholder="https://example.com/article${newIndex + 1}" style="flex: 1;" data-url-index="${newIndex}">
        <button type="button" class="url-field-remove" style="padding: 0.25rem 0.5rem; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;" title="삭제">×</button>
      `;

      container.appendChild(newItem);
      updateUnifiedUrlFieldRemoveButtons();

      // 새로 추가된 입력 필드에 포커스
      const newInput = newItem.querySelector('.unified-url-input') as HTMLInputElement;
      if (newInput) {
        setTimeout(() => newInput.focus(), 100);
      }
    });
  } else {
    console.warn('[Unified] URL 필드 초기화 건너뜀: addBtn 또는 container가 없습니다.');
  }

  // 이벤트 위임으로 삭제 버튼 처리
  if (container) {
    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('url-field-remove')) {
        const urlItems = container.querySelectorAll('.url-field-item');
        if (urlItems.length > 1) {
          target.closest('.url-field-item')?.remove();
          updateUnifiedUrlFieldRemoveButtons();
        }
      }
    });
  }
}

function updateUnifiedUrlFieldRemoveButtons(): void {
  const container = document.getElementById('unified-url-fields-container') as HTMLDivElement;
  const urlItems = container?.querySelectorAll('.url-field-item');

  if (urlItems) {
    urlItems.forEach((item, index) => {
      const removeBtn = item.querySelector('.url-field-remove') as HTMLButtonElement;
      if (removeBtn) {
        // 첫 번째 항목은 삭제 불가, 나머지는 삭제 가능
        removeBtn.style.display = index === 0 ? 'none' : 'inline-block';
      }
    });
  }
}

function getUnifiedUrls(): string[] {
  const container = document.getElementById('unified-url-fields-container') as HTMLDivElement;
  if (!container) return [];

  const urlInputs = container.querySelectorAll('.unified-url-input') as NodeListOf<HTMLInputElement>;
  return Array.from(urlInputs)
    .map(input => input.value.trim())
    .filter(url => url.length > 0 && /^https?:\/\//i.test(url));
}

// ✅ CTA 자동 생성 함수 (내 블로그 이전 글만 연결 - 외부 사이트 연결 금지!)
function generateAutoCTA(title: string, keywords?: string): { ctaText: string; ctaLink: string } {
  // ✅ 중요: 외부 사이트(쿠팡, 네이버 건강, 정부24 등)로 연결하지 않음!
  // 오직 사용자의 이전 블로그 글만 CTA로 연결

  const isJabBlog = (() => {
    const publishingSettings = (window as any).currentPublishingAccountSettings;
    if (publishingSettings && typeof publishingSettings === 'object') {
      return publishingSettings.isJabBlog === true;
    }
    const mainSettings = (window as any).currentMainAccountSettings;
    if (mainSettings && typeof mainSettings === 'object') {
      return mainSettings.isJabBlog === true;
    }
    return false;
  })();

  const getCurrentCategoryKey = (): string | null => {
    const fromUi = String((document.getElementById('unified-article-type') as HTMLSelectElement | null)?.value || '').trim();
    if (fromUi) return fromUi;
    if (currentPostId) {
      const p = loadGeneratedPost(currentPostId);
      const fromPost = String((p as any)?.category || '').trim();
      if (fromPost) return fromPost;
    }
    return null;
  };

  const pickLatestPublished = (candidates: any[]): any | null => {
    if (!candidates || candidates.length === 0) return null;
    const sorted = [...candidates].sort((a, b) => {
      const at = new Date(a.publishedAt || a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.publishedAt || b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });
    return sorted[0] || null;
  };

  // 저장된 이전 글 목록에서 발행된 글 찾기
  try {
    const posts = loadGeneratedPosts();
    // publishedUrl이 있는 글만 필터링 (발행된 글)
    // ✅ [2026-02-26 FIX] 현재 계정의 글만 매칭 (타계정 글 CTA 엮기 방지)
    const ctaNaverId = getCurrentNaverId();
    const publishedPosts = posts
      .filter(p => p.publishedUrl && p.publishedUrl.length > 0)
      .filter(p => !currentPostId || p.id !== currentPostId)
      .filter(p => !ctaNaverId || !(p as any).naverId || (p as any).naverId === ctaNaverId);

    if (publishedPosts.length > 0) {
      let candidates = publishedPosts;
      if (!isJabBlog) {
        const categoryKey = getCurrentCategoryKey();
        if (categoryKey) {
          const byCategory = publishedPosts.filter(p => String((p as any)?.category || '').trim() === categoryKey);
          if (byCategory.length > 0) {
            candidates = byCategory;
          }
        }
      }

      const latestPost = pickLatestPublished(candidates) || pickLatestPublished(publishedPosts);
      if (!latestPost) {
        return {
          ctaText: '📖 관련 글 더 보기',
          ctaLink: ''
        };
      }
      return {
        ctaText: `📖 ${latestPost.title}`,
        ctaLink: latestPost.publishedUrl || ''
      };
    }
  } catch (e) {
    console.warn('[CTA] 이전 글 목록 로드 실패:', e);
  }

  // ✅ 이전 글이 없으면 CTA 링크를 비워둠 (외부 사이트로 연결하지 않음!)
  return {
    ctaText: '📖 관련 글 더 보기',
    ctaLink: '' // 빈 링크 - CTA 텍스트만 표시되고 링크는 없음
  };
}

// 풀오토 발행 처리

// 통합 이미지 소스 선택
function initUnifiedImageSourceSelection(): void {
  const imgSourceBtns = document.querySelectorAll('.unified-img-source-btn');
  const imgSourceSelect = document.getElementById('unified-image-source') as HTMLSelectElement;

  imgSourceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const source = (btn as HTMLElement).dataset.source;

      // 기존 선택 해제 및 스타일 초기화
      imgSourceBtns.forEach(b => {
        b.classList.remove('selected');
        (b as HTMLElement).style.boxShadow = 'none';
        (b as HTMLElement).style.borderColor = 'transparent';
        (b as HTMLElement).style.opacity = '0.7';

        // 체크 표시 제거
        const check = b.querySelector('div[style*="top: 0.4rem"]');
        if (check) (check as HTMLElement).style.display = 'none';
      });

      // 새로 선택 및 스타일 적용
      btn.classList.add('selected');
      (btn as HTMLElement).style.opacity = '1';
      (btn as HTMLElement).style.boxShadow = '0 0 0 3px var(--primary-light), 0 4px 12px rgba(0,0,0,0.2)';
      (btn as HTMLElement).style.borderColor = 'var(--primary)';

      // 체크 표시 추가
      const check = btn.querySelector('div[style*="top: 0.4rem"]');
      if (check) (check as HTMLElement).style.display = 'flex';

      // ✅ [2026-02-16 FIX] 풀오토 전용 이미지 소스 저장 — 'saved'/'collected'는 AI 엔진이 아니므로 제외
      // ✅ [v2.10.335] 나노바나나 3종 분리 — nano-banana-2 통합 정규화 제거 (각각 별개 모델)
      if (source && source !== 'saved' && source !== 'collected') {
        localStorage.setItem('fullAutoImageSource', source);
        console.log(`[FullAuto] 풀오토 전용 이미지 소스 저장: ${source}`);
      } else if (source === 'saved' || source === 'collected') {
        // 저장된 이미지/수집 이미지 선택 시 fullAutoImageSource 제거 → getImageSource()가 UI 버튼 기반으로 동작
        localStorage.removeItem('fullAutoImageSource');
        console.log(`[FullAuto] ⚠️ '${source}'는 AI 엔진이 아님 → fullAutoImageSource 제거`);
      }

      // ✅ [Sync] 드롭다운(select) element 동기화
      if (imgSourceSelect && source) {
        imgSourceSelect.value = source;
        console.log(`[Sync] 이미지 소스 버튼 -> 셀렉트 동기화: ${source}`);
      }
    });
  });


  // ✅ [Sync] 드롭다운 변경 시 버튼 UI 업데이트
  if (imgSourceSelect) {
    imgSourceSelect.addEventListener('change', () => {
      const val = imgSourceSelect.value;
      console.log(`[Sync] 이미지 소스 셀렉트 -> 버튼 동기화: ${val}`);
      imgSourceBtns.forEach(btn => {
        if ((btn as HTMLElement).dataset.source === val) {
          // 이미 selected 클래스가 있으면 무시 (무한 루프 방지)
          if (!btn.classList.contains('selected')) {
            (btn as HTMLElement).click();
          }
        }
      });
    });
  }
}

// ✅ [2026-01-26] DeepInfra FLUX-2 이미지 소스 버튼 동적 삽입
function injectDeepInfraImageSourceOption(): void {
  // 기존 이미지 소스 버튼 컨테이너 찾기
  const existingBtns = document.querySelectorAll('.unified-img-source-btn');
  if (existingBtns.length === 0) {
    console.log('[DeepInfra] 이미지 소스 버튼 영역을 찾지 못함 - 나중에 다시 시도');
    return;
  }

  // 이미 DeepInfra 버튼이 있는지 확인
  const existingDeepinfra = document.querySelector('.unified-img-source-btn[data-source="deepinfra"]');
  if (existingDeepinfra) {
    console.log('[DeepInfra] 이미 버튼이 존재함');
    return;
  }

  // 참조할 버튼 (마지막 버튼 뒤에 추가)
  const lastBtn = existingBtns[existingBtns.length - 1] as HTMLElement;
  const parentContainer = lastBtn.parentElement;

  if (!parentContainer) {
    console.log('[DeepInfra] 부모 컨테이너를 찾지 못함');
    return;
  }

  // DeepInfra 버튼 생성 (기존 스타일 복사)
  const deepinfraBtn = document.createElement('button');
  deepinfraBtn.type = 'button';
  deepinfraBtn.className = 'unified-img-source-btn';
  deepinfraBtn.dataset.source = 'deepinfra';
  deepinfraBtn.style.cssText = lastBtn.style.cssText || `
    position: relative;
    padding: 0.75rem;
    border-radius: 12px;
    border: 2px solid transparent;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    cursor: pointer;
    transition: all 0.3s;
    min-width: 100px;
    text-align: center;
    opacity: 0.7;
  `;
  deepinfraBtn.innerHTML = `
    <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">🚀</div>
    <div style="font-size: 0.7rem; font-weight: 600; color: var(--text-strong);">FLUX-2</div>
    <div style="font-size: 0.6rem; color: var(--text-muted);">DeepInfra</div>
    <div style="font-size: 0.55rem; color: #10b981; font-weight: 500;">$0.01/장</div>
    <div style="position: absolute; top: 0.4rem; right: 0.4rem; width: 18px; height: 18px; border-radius: 50%; background: var(--primary); display: none; align-items: center; justify-content: center;">
      <span style="color: white; font-size: 0.7rem;">✓</span>
    </div>
  `;

  // 버튼 클릭 이벤트 (기존 로직 재사용)
  deepinfraBtn.addEventListener('click', () => {
    // 모든 버튼 선택 해제
    document.querySelectorAll('.unified-img-source-btn').forEach(b => {
      b.classList.remove('selected');
      (b as HTMLElement).style.boxShadow = 'none';
      (b as HTMLElement).style.borderColor = 'transparent';
      (b as HTMLElement).style.opacity = '0.7';
      const check = b.querySelector('div[style*="top: 0.4rem"]');
      if (check) (check as HTMLElement).style.display = 'none';
    });

    // DeepInfra 버튼 선택
    deepinfraBtn.classList.add('selected');
    deepinfraBtn.style.opacity = '1';
    deepinfraBtn.style.boxShadow = '0 0 0 3px var(--primary-light), 0 4px 12px rgba(0,0,0,0.2)';
    deepinfraBtn.style.borderColor = 'var(--primary)';
    const check = deepinfraBtn.querySelector('div[style*="top: 0.4rem"]');
    if (check) (check as HTMLElement).style.display = 'flex';

    // ✅ [2026-02-02] 풀오토 전용 이미지 소스 저장
    localStorage.setItem('fullAutoImageSource', 'deepinfra');
    console.log('[FullAuto] 풀오토 전용 이미지 소스 저장: deepinfra');

    // 드롭다운 동기화
    const imgSourceSelect = document.getElementById('unified-image-source') as HTMLSelectElement;
    if (imgSourceSelect) {
      imgSourceSelect.value = 'deepinfra';
      console.log('[Sync] DeepInfra 버튼 -> 셀렉트 동기화: deepinfra');
    }
  });

  // 버튼 삽입
  parentContainer.appendChild(deepinfraBtn);
  console.log('[DeepInfra] ✅ 이미지 소스 버튼 추가됨');
}

// ✅ 썸네일 텍스트 옵션 UI 동적 추가 (풀오토/반자동 발행)
// ✅ [2026-02-02] 이미지 관리 탭에 이미 동일 체크박스가 있으므로 중복 UI 제거
function addThumbnailTextOptionUI(): void {
  // 풀오토 발행 영역에 체크박스 추가
  const fullAutoImageSection =
    document
      .querySelector('#full-auto-image-source-section, .full-auto-img-source-btn, .unified-img-source-btn')
      ?.closest('.form-group, .option-group, .field, div[style*="margin"]');

  // ✅ [2026-02-02] '썸네일 텍스트 포함' 체크박스는 이미지 관리 탭의 #thumbnail-text-include 사용
  // 여기서는 '썸네일만 생성' 체크박스만 추가
  if (fullAutoImageSection && !document.getElementById('full-auto-thumbnail-only')) {
    // ✅ [신규] 썸네일만 생성 체크박스 (일반 모드 전용 - 1번 소제목만 이미지 생성, 나머지는 텍스트만)
    const thumbnailOnlyContainer = document.createElement('div');
    thumbnailOnlyContainer.id = 'full-auto-thumbnail-only-container';
    thumbnailOnlyContainer.style.cssText = `
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05));
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 8px;
      padding: 0.75rem;
      margin-top: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    `;
    thumbnailOnlyContainer.innerHTML = `
      <input type="checkbox" id="full-auto-thumbnail-only" style="width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6;">
      <label for="full-auto-thumbnail-only" style="cursor: pointer; font-size: 0.85rem; color: var(--text-strong); display: flex; flex-direction: column; gap: 0.15rem;">
        <span style="font-weight: 600;">📷 썸네일만 생성 (나머지 이미지 생성 안함)</span>
        <span style="font-size: 0.75rem; color: var(--text-muted);">1번 소제목에만 텍스트 포함 이미지, 나머지는 텍스트만</span>
      </label>
    `;
    fullAutoImageSection.appendChild(thumbnailOnlyContainer);
    console.log('[Unified] 풀오토 썸네일만 생성 옵션 UI 추가됨');

    // ✅ [2026-03-10 FIX] thumbnailOnly 체크 상태 localStorage 저장/복원
    const thumbnailOnlyCheckbox = document.getElementById('full-auto-thumbnail-only') as HTMLInputElement;
    if (thumbnailOnlyCheckbox) {
      // One-time reset: stale 'true' values made the box appear "set by
      // itself" (user never enabled it). Clear once; afterwards the checkbox
      // persists normally via the change listener below.
      if (!localStorage.getItem('thumbnailOnlyResetV2')) {
        localStorage.setItem('thumbnailOnly', 'false');
        localStorage.setItem('thumbnailOnlyResetV2', '1');
        console.log('[Unified] 📷 thumbnailOnly 레거시 값 1회 초기화 (phantom 체크 방지)');
      }
      // 초기값 복원
      const savedThumbnailOnly = localStorage.getItem('thumbnailOnly') === 'true';
      thumbnailOnlyCheckbox.checked = savedThumbnailOnly;

      // 변경 시 저장
      thumbnailOnlyCheckbox.addEventListener('change', () => {
        localStorage.setItem('thumbnailOnly', thumbnailOnlyCheckbox.checked.toString());
        console.log(`[Unified] 📷 thumbnailOnly 설정 저장: ${thumbnailOnlyCheckbox.checked}`);
      });
    }

    // ✅ [핵심] 쇼핑커넥트 모드 변경 시 체크박스 표시/숨김 업데이트 함수
    const updateCheckboxVisibility = () => {
      const isShoppingConnect = isShoppingConnectModeActive();
      // 쇼핑커넥트 모드: 체크박스 숨김
      thumbnailOnlyContainer.style.display = isShoppingConnect ? 'none' : 'flex';
    };

    // 초기 상태 설정
    updateCheckboxVisibility();

    // 콘텐츠 모드 변경 감지
    const contentModeSelect = document.getElementById('unified-content-mode');
    if (contentModeSelect) {
      contentModeSelect.addEventListener('change', updateCheckboxVisibility);
    }

    // 쇼핑커넥트 설정 표시 변경 감지 — v2.10.82 통합 event 구독
    document.addEventListener('sc-visibility-change', updateCheckboxVisibility as EventListener);
  }

  // ✅ [2026-02-02] 반자동 발행 영역의 중복 체크박스 제거
  // 이미지 관리 탭의 #thumbnail-text-include 체크박스 하나로 통일

  // ✅ [2026-01-19] 쇼핑커넥트 전용 AI 이미지 생성 체크박스 추가
  addShoppingConnectAiImageOptions();

  // ✅ [2026-06-12] 소제목 이미지 방식(수집/AI) 선택을 쇼핑커넥트 설정에 노출
  addShoppingConnectSubImageModeOption();

  // ✅ [2026-02-10] 쇼핑몰 이미지 수집 섹션 조건부 표시 (쇼핑커넥트 모드일 때만)
  const shoppingUrlContainer = document.getElementById('image-shopping-url-container');
  if (shoppingUrlContainer) {
    const updateShoppingUrlVisibility = () => {
      const isShoppingConnect = isShoppingConnectModeActive();
      shoppingUrlContainer.style.display = isShoppingConnect ? 'block' : 'none';
    };

    // 초기 상태 설정
    updateShoppingUrlVisibility();

    // 콘텐츠 모드 변경 감지
    const contentModeForUrl = document.getElementById('unified-content-mode');
    if (contentModeForUrl) {
      contentModeForUrl.addEventListener('change', updateShoppingUrlVisibility);
    }

    // 쇼핑커넥트 설정 영역 표시 변경 감지 — v2.10.82 통합 event 구독
    document.addEventListener('sc-visibility-change', updateShoppingUrlVisibility as EventListener);
  }
}

// ✅ [2026-01-19] 쇼핑커넥트 AI 표/배너 이미지 생성 옵션 체크박스 추가
function addShoppingConnectAiImageOptions(): void {
  // 이미 추가되어 있으면 스킵
  if (document.getElementById('ai-table-image-checkbox')) return;

  // 쇼핑커넥트 설정 영역 또는 풀오토 이미지 섹션 찾기
  const targetSection =
    document.getElementById('shopping-connect-settings') ||
    document.querySelector('#full-auto-thumbnail-text-container')?.parentElement ||
    document.querySelector('.unified-img-source-btn')?.closest('.form-group, .option-group, .field, div[style*="margin"]');

  if (!targetSection) {
    console.log('[ShoppingConnect] 체크박스 삽입 위치를 찾을 수 없음 - body에 hidden으로 추가');
    // 위치를 찾지 못하면 body에 숨겨서 추가 (기능은 동작하도록)
    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.display = 'none';
    hiddenContainer.innerHTML = `
      <input type="checkbox" id="ai-table-image-checkbox" checked>
      <input type="checkbox" id="ai-banner-checkbox" checked>
    `;
    document.body.appendChild(hiddenContainer);
    return;
  }

  // 쇼핑커넥트 AI 이미지 옵션 컨테이너 생성
  const aiImageOptionsContainer = document.createElement('div');
  aiImageOptionsContainer.id = 'shopping-connect-ai-image-options';
  aiImageOptionsContainer.style.cssText = `
    display: none;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05));
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 8px;
  `;
  aiImageOptionsContainer.innerHTML = `
    <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem; background: rgba(59, 130, 246, 0.1); border-radius: 8px; cursor: pointer; border: 1px solid rgba(59, 130, 246, 0.2);">
      <input type="checkbox" id="ai-table-image-checkbox" checked style="width: 16px; height: 16px; accent-color: #3b82f6;">
      <span style="color: var(--text-strong); font-size: 0.75rem; font-weight: 600;">📊 장단점 표 AI 이미지</span>
    </label>
    <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem; background: rgba(16, 185, 129, 0.1); border-radius: 8px; cursor: pointer; border: 1px solid rgba(16, 185, 129, 0.2);">
      <input type="checkbox" id="ai-banner-checkbox" checked style="width: 16px; height: 16px; accent-color: #10b981;">
      <span style="color: var(--text-strong); font-size: 0.75rem; font-weight: 600;">🎯 CTA 배너 AI 생성</span>
    </label>
  `;
  targetSection.appendChild(aiImageOptionsContainer);
  console.log('[ShoppingConnect] AI 표/배너 이미지 옵션 체크박스 추가됨');

  // 쇼핑커넥트 모드일 때만 표시
  const updateVisibility = () => {
    const isShoppingConnect = isShoppingConnectModeActive();
    aiImageOptionsContainer.style.display = isShoppingConnect ? 'grid' : 'none';
  };

  // 초기 상태 설정
  updateVisibility();

  // 콘텐츠 모드 변경 감지
  const contentModeSelect = document.getElementById('unified-content-mode');
  if (contentModeSelect) {
    contentModeSelect.addEventListener('change', updateVisibility);
  }

  // 쇼핑커넥트 설정 영역 표시 변경 감지 — v2.10.82 통합 event 구독
  document.addEventListener('sc-visibility-change', updateVisibility as EventListener);
}

// ✅ [2026-06-12] 쇼핑커넥트 소제목 이미지 방식(수집/AI) 인라인 선택 UI
// 메인 풀오토 이미지 설정 깊숙이 있던 선택지를 쇼핑커넥트 설정(장단점 표/
// CTA 배너 체크박스) 바로 아래에 노출 — 초보자가 바로 보고 설정 가능.
// 저장소는 기존 scSubImageMode(window.get/setSubImageMode)를 공유하므로
// 발행 플로우(IPC scSubImageSource)와 자동 연동된다.
function addShoppingConnectSubImageModeOption(): void {
  if (document.getElementById('sc-subimage-mode-inline')) return;

  const anchor = document.getElementById('shopping-connect-ai-image-options');
  const fallbackHost = document.getElementById('shopping-connect-settings');
  if (!anchor && !fallbackHost) return;

  const container = document.createElement('div');
  container.id = 'sc-subimage-mode-inline';
  container.style.cssText = `
    display: none;
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(16, 185, 129, 0.05));
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 8px;
  `;
  container.innerHTML = `
    <div style="font-weight: 700; color: var(--text-strong); font-size: 0.8rem; margin-bottom: 0.6rem;">🖼️ 소제목 이미지 방식</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
      <label style="display: flex; flex-direction: column; gap: 0.3rem; padding: 0.6rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; cursor: pointer;">
        <span style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="radio" name="sc-subimage-mode-inline-radio" value="collected" style="width: 16px; height: 16px; accent-color: #10b981;">
          <span style="color: var(--text-strong); font-size: 0.75rem; font-weight: 600;">📷 수집된 제품 이미지 (추천)</span>
        </span>
        <span style="font-size: 0.68rem; color: var(--text-muted); padding-left: 1.6rem;">상품 페이지의 추가이미지를 그대로 사용 — 비용 0원</span>
      </label>
      <label style="display: flex; flex-direction: column; gap: 0.3rem; padding: 0.6rem; background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.25); border-radius: 8px; cursor: pointer;">
        <span style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="radio" name="sc-subimage-mode-inline-radio" value="ai" style="width: 16px; height: 16px; accent-color: #8b5cf6;">
          <span style="color: var(--text-strong); font-size: 0.75rem; font-weight: 600;">🎨 AI 이미지 생성</span>
        </span>
        <span style="font-size: 0.68rem; color: var(--text-muted); padding-left: 1.6rem;">제품 사진을 참조해 AI가 새로 생성 — 장당 비용 발생</span>
      </label>
    </div>
    <label style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.6rem; padding: 0.55rem 0.6rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; cursor: pointer;">
      <input type="checkbox" id="sc-auto-thumbnail-inline" style="width: 16px; height: 16px; accent-color: #10b981;">
      <span style="color: var(--text-strong); font-size: 0.75rem; font-weight: 600;">🖼️ 자동 이미지 수집 및 썸네일 세팅</span>
      <span style="font-size: 0.68rem; color: var(--text-muted);">수집된 첫 이미지로 썸네일 자동 생성</span>
    </label>
  `;
  if (anchor) {
    anchor.insertAdjacentElement('afterend', container);
  } else {
    fallbackHost!.appendChild(container);
  }
  console.log('[ShoppingConnect] 소제목 이미지 방식 인라인 선택 UI 추가됨');

  const radios = Array.from(container.querySelectorAll<HTMLInputElement>('input[name="sc-subimage-mode-inline-radio"]'));
  const readMode = (): 'ai' | 'collected' => {
    try {
      const w = window as any;
      const v = typeof w.getSubImageMode === 'function' ? w.getSubImageMode() : localStorage.getItem('scSubImageMode');
      return v === 'ai' ? 'ai' : 'collected';
    } catch { return 'collected'; }
  };
  const autoThumbInline = container.querySelector<HTMLInputElement>('#sc-auto-thumbnail-inline');
  const syncFromStore = () => {
    const mode = readMode();
    radios.forEach(r => { r.checked = r.value === mode; });
    if (autoThumbInline) {
      try { autoThumbInline.checked = localStorage.getItem('scAutoThumbnailSetting') === 'true'; } catch { /* ignore */ }
    }
  };
  autoThumbInline?.addEventListener('change', () => {
    try { localStorage.setItem('scAutoThumbnailSetting', String(autoThumbInline.checked)); } catch { /* ignore */ }
    console.log(`[ShoppingConnect] 자동 썸네일 세팅: ${autoThumbInline.checked}`);
  });
  radios.forEach(r => r.addEventListener('change', () => {
    if (!r.checked) return;
    const mode = r.value === 'ai' ? 'ai' : 'collected';
    try {
      const w = window as any;
      if (typeof w.setSubImageMode === 'function') {
        w.setSubImageMode(mode);
      } else {
        localStorage.setItem('scSubImageMode', mode);
        localStorage.setItem('scSubImageSource', mode);
      }
    } catch { /* storage unavailable — radios still reflect selection */ }
    console.log(`[ShoppingConnect] 소제목 이미지 방식 변경: ${mode}`);
  }));

  // 쇼핑커넥트 모드일 때만 표시 + 표시될 때 저장소 값으로 동기화
  // (메인 이미지 설정에서 바꾼 값도 다시 열면 반영)
  const updateInlineVisibility = () => {
    const isShoppingConnect = isShoppingConnectModeActive();
    container.style.display = isShoppingConnect ? 'block' : 'none';
    if (isShoppingConnect) syncFromStore();
  };
  syncFromStore();
  updateInlineVisibility();
  const contentModeSelectForInline = document.getElementById('unified-content-mode');
  if (contentModeSelectForInline) {
    contentModeSelectForInline.addEventListener('change', updateInlineVisibility);
  }
  document.addEventListener('sc-visibility-change', updateInlineVisibility as EventListener);
}

// 통합 폼 데이터 수집
function collectUnifiedFormData(): any {
  const mode = (document.querySelector('input[name="unified-mode"]:checked') as HTMLInputElement)?.value || 'full-auto';

  // 공통 데이터
  const generator = UnifiedDOMCache.getGenerator();
  const targetAge = (document.getElementById('unified-target-age') as HTMLSelectElement)?.value || 'all';
  // ✅ 글 톤 설정 - UI에서 선택한 값 사용
  const toneStyle = (document.getElementById('unified-tone-style') as HTMLInputElement)?.value || 'friendly';
  // ✅ [2026-02-08 FIX] 폴백을 localStorage 기반으로 변경 — 사용자가 선택한 엔진 보존
  const imageSource = document.querySelector('.unified-img-source-btn.selected')?.getAttribute('data-source')
    || localStorage.getItem('fullAutoImageSource')
    || localStorage.getItem('globalImageSource')
    || 'nano-banana-pro';
  // ✅ [2026-04-18 FIX] SSOT 헬퍼 사용 — headingImageMode='none'도 반영 (이전: 2개만 OR)
  const skipImages = isImageSkipEnabled();
  const publishMode = (document.getElementById('unified-publish-mode') as HTMLInputElement)?.value || 'publish'; // ✅ [2026-03-10 FIX] 기본값을 즉시발행으로 변경
  console.log(`[collectFormData] 📌 발행 모드 읽기: ${publishMode}`);
  const scheduleDate = publishMode === 'schedule' ? (document.getElementById('unified-schedule-date') as HTMLInputElement)?.value : undefined;
  const scheduleType = publishMode === 'schedule' ? ((document.getElementById('unified-schedule-type') as HTMLSelectElement)?.value as 'app-schedule' | 'naver-server' || 'naver-server') : undefined;

  // ✅ [2026-03-10 CLEANUP] full-auto/semi-auto-thumbnail-text 유령 참조 제거 → localStorage 단일 소스
  const includeThumbnailText =
    localStorage.getItem('thumbnailTextInclude') === 'true' ||
    (document.getElementById('thumbnail-text-option') as HTMLInputElement)?.checked ||
    (document.getElementById('thumbnail-text-include') as HTMLInputElement)?.checked ||
    (document.getElementById('ma-setting-include-thumbnail-text') as HTMLInputElement)?.checked ||
    false;

  // ✅ [2026-03-10 CLEANUP] full-auto/semi-auto-thumbnail-only 유령 참조 제거
  const thumbnailOnly =
    localStorage.getItem('thumbnailOnly') === 'true' ||
    false;

  const baseData = {
    mode,
    generator,
    targetAge,
    toneStyle,
    imageSource,
    skipImages,
    publishMode,
    scheduleDate,
    scheduleType,
    includeThumbnailText, // ✅ 추가
    thumbnailOnly // ✅ [신규] 썸네일만 생성 옵션
  };

  if (mode === 'full-auto') {
    // 풀오토 모드 추가 데이터
    const urls = Array.from(document.querySelectorAll('#unified-url-fields-container .url-field-input'))
      .map(input => (input as HTMLInputElement).value.trim())
      .filter(url => url.length > 0);
    const keywords = (document.getElementById('unified-keywords') as HTMLInputElement)?.value.trim() || '';
    const title = (document.getElementById('unified-title') as HTMLInputElement)?.value.trim() || '';

    return {
      ...baseData,
      urls,
      keywords,
      title,
      isFullAuto: true // ✅ 풀오토 모드 플래그 (인덱스 기반 이미지 매칭용)
    };
  } else {
    // 반자동 모드 추가 데이터
    const title = (document.getElementById('unified-manual-title') as HTMLInputElement)?.value.trim() || '';
    const content = (document.getElementById('unified-manual-content') as HTMLTextAreaElement)?.value.trim() || '';
    const hashtags = (document.getElementById('unified-manual-hashtags') as HTMLInputElement)?.value.trim() || '';

    return {
      ...baseData,
      title,
      content,
      hashtags: hashtags ? hashtags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : []
    };
  }
}

// ENGLISH_TO_KOREAN_CATEGORY → postManager.ts로 이동 완료 (전역 스코프에서 접근)
// → postManager.ts로 이동 완료


// 발행용 폼 데이터 수집
function collectUnifiedFormDataForPublish(mode: 'full-auto' | 'semi-auto'): any {
  const generator = UnifiedDOMCache.getGenerator();
  // ✅ 글 톤 설정 - UI에서 선택한 값 사용
  const toneStyle = (document.getElementById('unified-tone-style') as HTMLInputElement)?.value || 'friendly';
  const imageSource = UnifiedDOMCache.getImageSource();
  // ✅ [2026-04-18 FIX] SSOT 헬퍼 사용 — headingImageMode='none'도 반영
  const skipImages = isImageSkipEnabled();
  const publishMode = (document.getElementById('unified-publish-mode') as HTMLInputElement)?.value || 'publish'; // ✅ [2026-03-10 FIX] 기본값을 즉시발행으로 변경
  console.log(`[collectUnifiedFormDataForPublish] 📌 발행 모드 읽기: ${publishMode}`);
  const categoryName = UnifiedDOMCache.getRealCategoryName(); // ✅ [2026-02-13 FIX] 카테고리 이름(text) 전달 — value(번호)가 아닌 name으로 네이버 에디터 카테고리 매칭

  // ✅ [2026-02-07 FIX] getScheduleDateFromInput 사용 (T→space 변환)
  const scheduleDate = publishMode === 'schedule' ? getScheduleDateFromInput('unified-schedule-date') : undefined;
  const scheduleType = publishMode === 'schedule' ? ((document.getElementById('unified-schedule-type') as HTMLSelectElement)?.value as 'app-schedule' | 'naver-server' || 'naver-server') : undefined;

  // ✅ [2026-03-10 CLEANUP] full-auto/semi-auto-thumbnail-text 유령 참조 제거 → localStorage 단일 소스
  const includeThumbnailText =
    localStorage.getItem('thumbnailTextInclude') === 'true' ||
    (document.getElementById('thumbnail-text-option') as HTMLInputElement)?.checked ||
    (document.getElementById('thumbnail-text-include') as HTMLInputElement)?.checked ||
    (document.getElementById('ma-setting-include-thumbnail-text') as HTMLInputElement)?.checked ||
    false;

  const baseData = {
    mode,
    generator,
    targetAge: 'all', // 고정
    toneStyle,
    imageSource,
    skipImages,
    publishMode,
    categoryName,
    scheduleDate,
    scheduleType,
    includeThumbnailText // ✅ 추가
  };

  if (mode === 'full-auto') {
    // 풀오토 모드: 현재 생성된 콘텐츠 사용
    const structuredContent = (window as any).currentStructuredContent;
    if (!structuredContent) {
      throw new Error('먼저 콘텐츠를 생성해주세요.');
    }

    return {
      ...baseData,
      urls: [],
      keywords: [],
      title: structuredContent.selectedTitle,
      structuredContent,
      isFullAuto: true // ✅ 풀오토 모드 플래그 (인덱스 기반 이미지 매칭용)
    };
  } else {
    // 반자동 모드: 수동 입력된 콘텐츠 사용
    const title = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value?.trim();
    const content = (document.getElementById('unified-generated-content') as HTMLTextAreaElement)?.value?.trim();
    const hashtags = (document.getElementById('unified-generated-hashtags') as HTMLInputElement)?.value?.trim();

    if (!title || !content) {
      throw new Error('콘텐츠를 먼저 생성해주세요.');
    }

    const structuredContent = {
      selectedTitle: title,
      bodyPlain: content,
      content: content,
      hashtags: hashtags ? hashtags.split(/[,\s#]+/).map(tag => tag.trim().replace(/^#+/, '')).filter(tag => tag.length > 0) : [],
      headings: [] // 반자동 모드에서는 소제목 없이 진행
    };

    return {
      ...baseData,
      title,
      content,
      hashtags: structuredContent.hashtags,
      structuredContent
    };
  }
}

// 통합 폼 검증
function validateUnifiedFormData(data: any): boolean {
  // 예약 발행 시 날짜 확인
  if (data.publishMode === 'schedule' && !data.scheduleDate) {
    alert('예약 발행을 선택하셨으면 예약 날짜/시간을 설정해주세요.');
    return false;
  }

  // 콘텐츠 존재 확인
  if (!data.structuredContent) {
    alert('먼저 콘텐츠를 생성해주세요.');
    return false;
  }

  return true;
}

// 통합 자동화 실행
async function executeUnifiedAutomation(formData: any): Promise<any> {
  const startBtn = document.getElementById('unified-start-btn') as HTMLButtonElement;

  // 진행률 표시 초기화
  const progressContainer = document.createElement('div');
  progressContainer.id = 'unified-progress-container';
  progressContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 300px;
    background: var(--bg-primary);
    border: 2px solid var(--primary);
    border-radius: var(--radius-lg);
    padding: 1rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: var(--font-family);
  `;

  // ... 진행률 UI 생성 (기존 코드와 동일)

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.innerHTML = '<span style="font-size: 1.75rem;">⏳</span><span>실행 중...</span>';
  }

  // ✅ [v2.10.13] 발행 결과 마커 reset — 후처리 에러로 인한 잘못된 '실패' 토스트 차단용
  (window as any)._lastPublishOutcome = null;

  const result = await withErrorHandling(async () => {
    if (formData.mode === 'full-auto') {
      // 풀오토 모드 실행 (기존 로직 재사용)
      return await executeFullAutoFlow(formData);
    } else {
      // 반자동 모드 실행
      return await executeSemiAutoFlow(formData);
    }
  }, 'UnifiedExecution');

  // 진행률 표시 제거 및 버튼 복구
  setTimeout(() => {
    if (progressContainer.parentNode) {
      progressContainer.parentNode.removeChild(progressContainer);
    }
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.innerHTML = '<span style="font-size: 1.75rem;">🚀</span><span>발행 중...</span>';
    }
  }, 2000);

  if (!result) {
    // ✅ [v2.10.13] 잘못된 '실패' 토스트 차단
    //   사용자 보고: '잘 발행됐는데 통합자동화 실패 알림이 뜬다'
    //   원인: withErrorHandling이 발행 성공 후 후처리(저장/통계 등) 에러를 catch하면
    //         result === undefined 반환 → 일반 실패 토스트 발동.
    //   조치: 발행 자체가 성공했는지 마커(_lastPublishOutcome)로 확인. success면
    //         일반 실패 토스트 생략하고 후처리 경고만 표시. withErrorHandling이
    //         이미 구체 에러 메시지 토스트를 띄움.
    const publishOutcome = (window as any)._lastPublishOutcome;
    if (publishOutcome === 'success') {
      console.warn('[UnifiedExecution] 발행은 성공했으나 후처리 단계 에러 — 일반 실패 토스트 생략');
      toastManager.warning('⚠️ 발행은 완료되었으나 일부 후처리에 실패했습니다 (재시도 불필요).');
    } else {
      toastManager.error('❌ 통합 자동화 실행에 실패했습니다.');
    }

    // ✅ [2026-03-22 FIX] 실패 시 발행 상태 리셋 (재시도 가능하도록)
    // withErrorHandling이 에러를 삼키고 null 반환 → 여기서 상태 정리 필수
    // resetPublishing 내부의 resetProgressUI가 진행률 바 DOM도 자동 정리
    if (typeof (window as any).resetPublishing === 'function') {
      (window as any).resetPublishing();
    }

    // ✅ [2026-02-26 FIX] 실패 시에도 연속 발행 모드면 다음 글로 진행 (기존: 실패 시 멈춤)
    // ✅ [2026-04-03 FIX] stopFullAutoPublish 체크 추가 — 중지 버튼 → cancelAutomation → 에러 발생 시
    // isContinuousMode가 아직 true일 수 있는 경합 조건 방지
    if (isContinuousMode && !(window as any).stopFullAutoPublish) {
      console.log('[Continuous] ⚠️ 발행 실패했지만 연속 발행 모드이므로 다음 글로 진행');
      const hasItemsV1 = continuousQueue.length > 0;
      const hasItemsV2 = continuousQueueV2.some(i => i.status === 'pending');
      if (hasItemsV1 && !hasItemsV2) {
        console.log('[Continuous] V1 방식 다음 포스팅 예약 호출 (에러 복구)');
        scheduleNextPosting();
      } else if (!hasItemsV1 && !hasItemsV2) {
        console.log('[Continuous] 연속 발행 완료 - 큐가 비어있음 (에러 후)');
        stopContinuousMode('complete');
      }
    }
  } else {
    appendLog('✅ 포스팅 발행 완료!');
    // 연속 발행 모드인 경우 다음 포스팅 예약
    console.log('[Continuous] 통합 자동화 완료 후 연속 발행 체크');
    console.log('[Continuous] 현재 상태 - isContinuousMode:', isContinuousMode, '남은 큐:', continuousQueue.length);

    // ✅ V1 방식 (scheduleNextPosting)은 V1 큐에만 적용
    // V2 방식은 startContinuousPublishingV2가 직접 루프를 관리하므로 여기서 추가 스케줄링 불필요
    const hasItemsV1 = continuousQueue.length > 0;
    const hasItemsV2 = continuousQueueV2.some(i => i.status === 'pending');

    // ✅ [2026-04-03 FIX] stopFullAutoPublish 추가 체크 — 경합 조건 방지
    if (isContinuousMode && !(window as any).stopFullAutoPublish && hasItemsV1 && !hasItemsV2) {
      // ✅ V1 방식만 해당될 때만 scheduleNextPosting 호출
      console.log('[Continuous] V1 방식 다음 포스팅 예약 호출');
      scheduleNextPosting();
    } else if (isContinuousMode && !(window as any).stopFullAutoPublish && !hasItemsV1 && !hasItemsV2) {
      // ✅ 둘 다 남은 항목이 없으면 연속 발행 종료
      console.log('[Continuous] 연속 발행 완료 - 큐가 비어있음');
      stopContinuousMode('complete');
    } else {
      // ✅ V2 방식은 startContinuousPublishingV2에서 관리
      console.log('[Continuous] V2 방식 - 별도 스케줄링 불필요 (루프가 관리 중)');
    }
  }

  // ✅ [2026-04-18 FIX] 결과 반환 (호출자 await 가능하도록)
  //    handleSemiAutoPublish → executeUnifiedAutomation → executeSemiAutoFlow 체인의 automationResult
  //    배치 multi-account publish가 status event 리스너/타임아웃 없이 직접 결과 받도록
  return result;
}

// ✅ UI 스레드 양보 헬퍼 (Electron 응답 없음 방지)
const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));



// ============================================
// 향상된 오류 처리 시스템
// ============================================



// ============================================
// (중복 함수 제거됨 - 상단의 withErrorHandling 사용)

// 자동화 실행 시 오류 처리
async function executeAutomationWithErrorHandling(payload: RendererAutomationPayload): Promise<RendererStatus> {
  const result = await withErrorHandling(
    async () => {
      // ✅ 자동화 실행 전 ImageMap 동기화 (Renderer -> Main)
      if (typeof (window as any).ImageManager !== 'undefined' && (window as any).ImageManager.imageMap) {
        console.log('[Renderer] 자동화 시작 전 ImageManager 동기화 시도...');
        await window.api.syncImageManager((window as any).ImageManager.imageMap);
      }

      const result = await window.api.runAutomation(payload);
      if (!result.success) {
        throw new Error(result.message || '자동화 실행 실패');
      }
      return result;
    },
    'Automation',
    { showToast: true, logError: true }
  );

  return result || { success: false, message: '자동화 실행 중 오류가 발생했습니다.' };
}

// ============================================
// 향상된 API 클라이언트
// ============================================



// 편의 함수들
(window as any).enhancedApiCall = (method: string, args?: any[], options?: ApiRequestOptions) =>
  apiClient.call(method, args, options);

(window as any).clearApiCache = () => apiClient.clearCache();

(window as any).getApiStats = () => apiClient.getCacheStats();

// ============================================
// UI/UX 개선 시스템
// ============================================



// 편의 함수들
(window as any).showLoading = (text?: string, progress?: number) => loadingManager.show(text, progress);
(window as any).updateLoading = (text: string, progress: number) => loadingManager.update(text, progress);
(window as any).hideLoading = () => loadingManager.hide();

(window as any).showToast = (message: string, type?: string, duration?: number) =>
  toastManager.show(message, type as any, duration);
(window as any).showSuccessToast = (message: string, duration?: number) =>
  toastManager.success(message, duration);
(window as any).showErrorToast = (message: string, duration?: number) =>
  toastManager.error(message, duration);

// ✅ [2026-03-07 FIX] toastManager 자체도 window에 노출 — 모듈에서 (window as any).toastManager로 접근 가능
(window as any).toastManager = toastManager;



// ✅ [2026-03-22 FIX] initPriceInfoModal() 중복 호출 제거
// → initializeApplication() (L5788)에서 이미 1회 호출됨
// → 여기서 2번째 호출 시 setupApiKeyToggle 이벤트 리스너가 2중 등록되어
//   클릭 시 password→text→password 연속 전환 → 눈 아이콘 토글 불능 버그 발생

// ============================================
// AI 자동 제목 생성 기능
// ============================================
function switchToUnifiedTab() {
  const tabButton = document.querySelector('[data-tab="unified"]') as HTMLButtonElement;
  if (tabButton) {
    tabButton.click();
  }
}

function switchToImageTab() {
  const tabButton = document.querySelector('[data-tab="images"]') as HTMLButtonElement;
  if (tabButton) {
    tabButton.click();
  }
}

function switchToScheduleTab() {
  const tabButton = document.querySelector('[data-tab="schedule"]') as HTMLButtonElement;
  if (tabButton) {
    tabButton.click();
  }
}

// ✅ [2026-06-07] Gemini 상태 공지 배너 비활성화
function showGeminiStatusNotice(): void {
  return;
}

// 메인 대시보드 초기화
function initDashboard() {
  // [v2.10.131] clock setInterval 제거 — dashboardUI.ts:33이 단일 source.
  //   기존: renderer.ts:8160 + dashboardUI.ts:33 = 2개 clock interval (1초마다 2회 updateClock)
  //   사용자 보고: 'bg:interval:initDashboard 245ms HEAVY'.
  //   수정: 여기서는 1회만 호출, interval은 dashboardUI가 담당.
  updateClock();

  // 대시보드 통계 업데이트
  updateDashboardStats();

  // 최근 활동 초기화
  initRecentActivity();

  // 달력 초기화
  initDashboardCalendar();

  // ✅ 썸네일 텍스트 옵션 동기화 초기화
  initThumbnailTextSync();
}

/**
 * ✅ 썸네일 텍스트 옵션 체크박스 동기화
 */
function initThumbnailTextSync(): void {
  const syncGroup = [
    'thumbnail-text-option', // 스마트 자동발행 탭
    'continuous-include-thumbnail-text' // 연속 발행 탭
  ];

  syncGroup.forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (!el) return;

    el.addEventListener('change', () => {
      const isChecked = el.checked;
      syncGroup.forEach(targetId => {
        const targetEl = document.getElementById(targetId) as HTMLInputElement;
        if (targetEl && targetEl !== el) {
          targetEl.checked = isChecked;
        }
      });
      console.log(`[ThumbnailSync] 옵션 변경: ${isChecked ? 'ON' : 'OFF'}`);
    });
  });
}

// 시계 업데이트
function updateClock() {
  const _t0 = performance.now();
  const now = new Date();
  const timeElement = document.getElementById('current-time');
  const dateElement = document.getElementById('current-date');

  if (timeElement) {
    timeElement.textContent = now.toLocaleTimeString('ko-KR', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  if (dateElement) {
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];

    dateElement.textContent = `${year}년 ${month}월 ${day}일 ${dayOfWeek}요일`;
  }
  // [v2.10.131] updateClock 자체 시간 측정 — 사용자 보고 245ms HEAVY가 정말 updateClock인지 검증
  const _dur = performance.now() - _t0;
  if (_dur > 30) console.warn(`[updateClock] SLOW ${_dur.toFixed(0)}ms`);
}

// 대시보드 통계 업데이트
function updateDashboardStats() {
  // 오늘의 통계 (임시 데이터)
  const todayPosts = document.getElementById('today-posts');
  const todayImages = document.getElementById('today-images');
  const todayViews = document.getElementById('today-views');

  if (todayPosts) todayPosts.textContent = '0';
  if (todayImages) todayImages.textContent = '0';
  if (todayViews) todayViews.textContent = '0';

  // 실제로는 localStorage나 config에서 데이터를 가져와야 함
}

// 최근 활동 초기화
function initRecentActivity() {
  const activityList = document.getElementById('recent-activity');
  if (!activityList) return;

  // 초기 활동 추가
  addRecentActivity('🚀 앱이 시작되었습니다', '방금 전');
}

// 최근 활동 추가
function addRecentActivity(title: string, time: string) {
  const activityList = document.getElementById('recent-activity');
  if (!activityList) return;

  const activityItem = document.createElement('div');
  activityItem.className = 'activity-item';
  activityItem.innerHTML = `
    <div class="activity-icon">📝</div>
    <div class="activity-content">
      <div class="activity-title">${title}</div>
      <div class="activity-time">${time}</div>
    </div>
  `;

  // 기존 활동들을 아래로 밀고 새 활동을 위에 추가
  const firstChild = activityList.firstChild;
  activityList.insertBefore(activityItem, firstChild);

  // 최대 10개까지만 유지
  while (activityList.children.length > 10) {
    activityList.removeChild(activityList.lastChild!);
  }
}

// 대시보드 달력 초기화
function initDashboardCalendar() {
  // 달력 위젯은 기존 코드에서 이미 초기화됨
}

// 탭 전환 초기화
function initTabSwitching() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const appContainer = document.querySelector('.app-container') as HTMLElement | null;

  // ✅ 내부 탭 (app-container 안에 있음) vs 외부 탭 (app-container 밖에 있음)
  const internalTabs = ['main', 'unified'];
  const externalTabs = ['image-tools', 'images', 'schedule', 'analytics'];

  // [v2.10.111] 캐시 — 매 클릭마다 querySelectorAll('.tab-panel') + '[id^="unified-only-"]'
  //   attribute selector 풀스캔 비용을 1회로 줄임. DOM 7579개에서 65~200ms LongTask 원인.
  const tabPanelsCache = Array.from(document.querySelectorAll('.tab-panel')) as HTMLElement[];
  const unifiedOnlySectionsCache = Array.from(document.querySelectorAll('[id^="unified-only-"]')) as HTMLElement[];
  // ✅ [v2.11.49] unified-only-posts-list는 전용 탭(post-list)으로 이동했으므로 unified 토글에서 제외
  //   (제외 안 하면 [id^="unified-only-"] 패턴이 잡아 non-unified 탭에서 강제 display:none → 빈 화면)
  const excludedSections = new Set(['unified-only-progress-container', 'unified-only-preview-section', 'unified-only-semi-auto-section', 'unified-only-posts-list']);

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      if (!targetTab) return;

      // 모든 탭 버튼에서 active 클래스 제거
      tabButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });

      // 클릭된 버튼에 active 클래스 추가
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');

      // 모든 탭 패널 숨기기 (캐시 사용 — 풀스캔 제거)
      tabPanelsCache.forEach(panel => {
        panel.classList.remove('active');
        panel.style.display = 'none';
      });

      // 대상 탭 패널 표시
      const targetPanel = document.getElementById(`tab-${targetTab}`);
      if (targetPanel) {
        targetPanel.classList.add('active');
        (targetPanel as HTMLElement).style.display = 'block';
      }

      // ✅ unified 탭 전용 섹션 토글 (캐시 사용)
      const showUnified = targetTab === 'unified';
      unifiedOnlySectionsCache.forEach(section => {
        if (excludedSections.has(section.id)) return;
        section.style.display = showUnified ? 'block' : 'none';
      });

      // ✅ app-container의 min-height 조절 (외부 탭 전환 시 빈 공간 제거)
      // display:none 대신 min-height만 0으로 설정하여 헤더/탭버튼은 유지
      if (appContainer) {
        const isExternalTab = externalTabs.includes(targetTab);
        if (isExternalTab) {
          // 외부 탭: min-height를 0으로 설정 (빈 공간 제거)
          appContainer.style.minHeight = '0';
          appContainer.style.height = 'auto';
        } else {
          // 내부 탭: 원래 min-height 복원
          appContainer.style.minHeight = '';
          appContainer.style.height = '';
        }
      }

      // 페이지 스크롤을 맨 위로
      window.scrollTo(0, 0);
    });
  });

  // ✅ 페이지 로드 시 현재 active 탭에 맞게 unified-only 섹션 및 app-container 토글
  const activeTab = document.querySelector('.tab-button.active')?.getAttribute('data-tab');
  const unifiedOnlySectionsInit = document.querySelectorAll('[id^="unified-only-"]');
  const excludedSectionsInit = ['unified-only-progress-container', 'unified-only-preview-section', 'unified-only-semi-auto-section', 'unified-only-posts-list'];
  unifiedOnlySectionsInit.forEach(section => {
    const sectionId = section.id;
    // 조건부 표시 섹션은 자동으로 표시하지 않음
    if (excludedSectionsInit.includes(sectionId)) return;
    (section as HTMLElement).style.display = activeTab === 'unified' ? 'block' : 'none';
  });

  // 초기 로드 시 외부 탭이면 app-container min-height 조절
  if (appContainer && activeTab && externalTabs.includes(activeTab)) {
    appContainer.style.minHeight = '0';
    appContainer.style.height = 'auto';
  }
}

// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] API 가이드 모달 → ./modules/apiGuideModals.ts
// ✅ [2026-02-26 모듈화] 통합 API 키 모달 → ./modules/apiGuideModals.ts
// ✅ [2026-02-26 모듈화] 사용 가이드 모달 → ./modules/guideModals.ts
// ✅ [2026-02-26 모듈화] 사용법 영상 탭 → ./modules/tutorialsTab.ts
// ═══════════════════════════════════════════════════════════════════

// ✅ 소제목 선택 모달 표시 (이미지를 특정 소제목에 배치) - 개선 버전
async function showHeadingSelectionModalV2(image: any, currentIndex: number): Promise<void> {
  const promptsContainer = document.getElementById('prompts-container') as HTMLDivElement;
  if (!promptsContainer) {
    toastManager.error('소제목 분석이 먼저 필요합니다.');
    return;
  }

  const promptItems = promptsContainer.querySelectorAll('.prompt-item');
  if (promptItems.length === 0) {
    toastManager.error('소제목이 없습니다. 먼저 소제목 분석을 해주세요.');
    return;
  }

  // 모달 생성
  const modal = document.createElement('div');
  modal.id = 'heading-selection-modal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';

  let headingsHtml = '';
  promptItems.forEach((item, idx) => {
    // ✅ [2026-03-16 FIX] getSafeHeadingTitle로 배지 오염 방지
    const headingText = getSafeHeadingTitle(item) || `소제목 ${idx + 1}`;
    headingsHtml += `
      <button type="button" class="heading-select-btn" data-heading-index="${idx}" style="padding: 1rem; background: var(--bg-secondary); border: 2px solid var(--border-light); border-radius: 8px; cursor: pointer; text-align: left; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--primary)'; this.style.background='rgba(59, 130, 246, 0.1)';" onmouseout="this.style.borderColor='var(--border-light)'; this.style.background='var(--bg-secondary)';">
        <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem;">${idx + 1}. ${headingText}</div>
      </button>
    `;
  });

  modal.innerHTML = `
    <div style="background: var(--bg-primary); border-radius: 16px; padding: 2rem; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <h3 style="margin: 0; color: var(--text-strong);">📍 이미지를 배치할 소제목 선택</h3>
        <button type="button" id="close-heading-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">×</button>
          </div>
      <div style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(59, 130, 246, 0.1); border-radius: 8px;">
        <img src="${toFileUrlMaybe(image.url || image.filePath || image.previewDataUrl || '')}" style="width: 100%; max-height: 150px; object-fit: contain; border-radius: 8px;">
        </div>
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${headingsHtml}
        </div>
      </div>
    `;

  document.body.appendChild(modal);

  // 닫기 버튼
  modal.querySelector('#close-heading-modal')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // 소제목 선택 버튼
  modal.querySelectorAll('.heading-select-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetIndex = parseInt(btn.getAttribute('data-heading-index') || '0');

      const targetPromptItem = promptItems[targetIndex] as HTMLElement | undefined;
      // ✅ [2026-03-16 FIX] getSafeHeadingTitle로 배지 오염 방지
      const targetHeadingTitle = (getSafeHeadingTitle(targetPromptItem) || `소제목 ${targetIndex + 1}`).trim();
      const sourceHeadingTitle = (image?.heading || '').trim();

      const targetExisting = ImageManager.getImage(targetHeadingTitle);

      if (sourceHeadingTitle && sourceHeadingTitle !== targetHeadingTitle) {
        if (targetExisting) {
          ImageManager.setImage(sourceHeadingTitle, { ...targetExisting, heading: sourceHeadingTitle });
        } else {
          ImageManager.removeImage(sourceHeadingTitle);
        }
      }

      ImageManager.setImage(targetHeadingTitle, { ...image, heading: targetHeadingTitle });

      const allImages = ImageManager.getAllImages();
      (window as any).imageManagementGeneratedImages = allImages;
      syncGlobalImagesFromImageManager();

      toastManager.success(`✅ ${targetIndex + 1}번 소제목에 이미지를 배치했습니다.`);
      modal.remove();
    });
  });
}

// ✅ AI 이미지 새로 생성 (폴백 체인: Nano Banana Pro → Imagen 4 → Naver)
async function regenerateWithNewAI(index: number, heading: string): Promise<void> {
  try {
    toastManager.info('🤖 AI 이미지를 새로 생성 중...');
    appendLog(`🤖 [${index + 1}] ${heading} - AI 이미지 새로 생성 중...`);

    // ✅ [2026-02-27 FIX] AI 기반 영어 프롬프트 생성 (Gemini→OpenAI→Claude→Perplexity 폴백 체인)
    const englishPrompt = await generateEnglishPromptForHeading(heading);

    let newImageUrl: string | null = null;
    let successProvider = '';

    // 0. 현재 선택된 엔진 우선 시도
    const selectedBtn = document.querySelector('.image-source-btn.selected') as HTMLButtonElement;
    const selectedSource = selectedBtn?.dataset.source;
    if (selectedSource && selectedSource !== 'naver') {
      try {
        appendLog(`[${index + 1}] 선택된 엔진(${selectedSource})으로 우선 시도 중...`);
        if (selectedSource === 'stability') {
          const stabilityModel = (document.getElementById('stability-model-select') as HTMLSelectElement)?.value || 'ultra';
          const res = await generateImagesWithCostSafety({
            provider: 'stability',
            items: [{ heading, prompt: englishPrompt }],
            regenerate: true,
            model: stabilityModel
          });
          if (res.success && res.images?.[0]) {
            newImageUrl = res.images[0].previewDataUrl || res.images[0].filePath;
            successProvider = 'stability';
          }
        } else if (selectedSource === 'prodia') {
          const res = await generateImagesWithCostSafety({
            provider: 'prodia',
            items: [{ heading, prompt: englishPrompt }],
            regenerate: true
          });
          if (res.success && res.images?.[0]) {
            newImageUrl = res.images[0].previewDataUrl || res.images[0].filePath;
            successProvider = 'prodia';
          }
        } else if (selectedSource === 'nano-banana-2' || selectedSource === 'nano-banana-pro' || selectedSource === 'nano-banana' || selectedSource === 'pollinations') {
          newImageUrl = await generateNanoBananaProImage(englishPrompt, true);
          successProvider = selectedSource === 'pollinations' ? 'nano-banana-2' : selectedSource;
        } else if (selectedSource === 'falai') {
          const res = await generateImagesWithCostSafety({
            provider: 'falai',
            items: [{ heading, prompt: englishPrompt }],
            regenerate: true
          });
          if (res.success && res.images?.[0]) {
            newImageUrl = res.images[0].previewDataUrl || res.images[0].filePath;
            successProvider = 'falai';
          }
        }

        if (newImageUrl) {
          appendLog(`✅ [${index + 1}] 선택된 엔진(${successProvider})으로 성공!`);
        }
      } catch (e) {
        appendLog(`⚠️ [${index + 1}] 선택된 엔진 시도 실패, 폴백 체인으로 전환...`);
      }
    }

    // 1. Nano Banana 2 (Gemini 3.1 Flash, recommended default)
    try {
      appendLog(`[${index + 1}] Nano Banana 2 시도 중...`);
      newImageUrl = await generateNanoBananaProImage(englishPrompt, true);
      if (newImageUrl) {
        successProvider = 'nano-banana-2';
        appendLog(`✅ [${index + 1}] Nano Banana 2 성공!`);
      }
    } catch (e) {
      console.log('[Image] Nano Banana 2 실패, 다음 시도...');
    }

    // 2. Pollinations (무료 FLUX 폴백)
    if (!newImageUrl) {
      try {
        appendLog(`[${index + 1}] Pollinations 시도 중...`);
        const polRes = await generateImagesWithCostSafety({
          provider: 'pollinations',
          items: [{ heading, prompt: englishPrompt }],
          regenerate: true
        });
        if (polRes.success && polRes.images?.[0]) {
          newImageUrl = polRes.images[0].previewDataUrl || polRes.images[0].filePath;
          successProvider = 'pollinations';
          appendLog(`✅ [${index + 1}] Pollinations 성공!`);
        }
      } catch (e) {
        console.log('[Image] Pollinations 실패, 다음 시도...');
      }
    }

    // 3. Naver 이미지 검색 (폴백)
    if (!newImageUrl) {
      try {
        appendLog(`[${index + 1}] Naver 이미지 검색 시도 중...`);
        newImageUrl = await searchNaverImage(englishPrompt, true);
        if (newImageUrl) {
          successProvider = 'naver';
          appendLog(`✅ [${index + 1}] Naver 이미지 검색 성공!`);
        }
      } catch (e) {
        console.log('[Image] Naver 이미지 검색 실패');
      }
    }

    if (newImageUrl) {
      const newImage = {
        url: newImageUrl,
        previewDataUrl: newImageUrl,
        filePath: newImageUrl,
        heading,
        prompt: englishPrompt,
        provider: successProvider
      };

      ImageManager.setImage(heading, newImage);

      const allImages = ImageManager.getAllImages();
      (window as any).imageManagementGeneratedImages = allImages;
      syncGlobalImagesFromImageManager();

      toastManager.success(`✅ AI 이미지 생성 완료! (${successProvider})`);
      appendLog(`✅ [${index + 1}] AI 이미지 생성 완료 (${successProvider})`);
    } else {
      throw new Error('모든 이미지 생성 방법 실패');
    }
  } catch (error) {
    console.error('[Image] AI 이미지 생성 실패:', error);
    toastManager.error('❌ 모든 이미지 소스에서 생성에 실패했습니다.');
    appendLog(`❌ [${index + 1}] 이미지 생성 실패 - 모든 소스 실패`);
  }
}

// ✅ 저장된 이미지로 교체 모달
async function showSavedImagesForReplace(targetIndex: number): Promise<void> {
  try {
    const normalizeTargetHeadingIndex = (idx: number): number => {
      const rawIdx = Number.isFinite(idx) ? idx : 0;
      const hs = (ImageManager as any)?.headings;
      const headingsLen = Array.isArray(hs) ? hs.length : 0;
      if (headingsLen > 0 && rawIdx >= headingsLen) {
        const all = (window as any).imageManagementGeneratedImages || generatedImages || [];
        const img = Array.isArray(all) ? all[rawIdx] : null;
        const byIdx = Number(img?.headingIndex ?? -1);
        if (Number.isFinite(byIdx) && byIdx >= 0) return byIdx;

        const h = String(img?.heading || '').trim();
        if (h) {
          try {
            const norm = normalizeHeadingKeyForVideoCache(h);
            const list = Array.isArray(hs) ? hs : [];
            const found = list.findIndex((it: any) => {
              const t = typeof it === 'string' ? String(it || '').trim() : String(it?.title || it || '').trim();
              if (!t) return false;
              if (t === h) return true;
              try {
                return normalizeHeadingKeyForVideoCache(t) === norm;
              } catch {
                return false;
              }
            });
            if (found >= 0) return found;
          } catch (e) {
            console.warn('[renderer] catch ignored:', e);
          }
        }
      }
      return rawIdx;
    };

    const normalizedIndex = normalizeTargetHeadingIndex(targetIndex);
    await showFolderSelectionModal({
      onFolderSelected: async (folderName: string) => {
        await showLocalImagePickerForReplace(folderName, normalizedIndex);
      },
    });
  } catch (error) {
    console.error('[Image] 저장된 이미지 로드 실패:', error);
    toastManager.error('저장된 이미지를 불러오는데 실패했습니다.');
  }
}

async function showLocalImagePickerForReplace(folderName: string, targetIndex: number): Promise<void> {
  try {
    if (!window.api.getUserHomeDir || !window.api.readDir || !window.api.checkFileExists) {
      toastManager.error('파일 시스템 API를 사용할 수 없습니다.');
      return;
    }

    const resolveHeadingTitleByIndex = (index: number): string => {
      return String(getHeadingTitleByIndex(index) || '').trim();
    };

    const basePath = await getRequiredImageBasePath();

    const folderPath = `${basePath}/${folderName}`.replace(/\\/g, '/');
    const exists = await window.api.checkFileExists(folderPath);
    if (!exists) {
      toastManager.error('선택한 폴더가 존재하지 않습니다.');
      return;
    }

    const files = await window.api.readDir(folderPath);
    const imageFiles = (files || []).filter((f: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(String(f || '')));
    if (imageFiles.length === 0) {
      toastManager.warning('선택한 폴더에 이미지가 없습니다.');
      return;
    }

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.75); z-index: 10000; display: flex;
      align-items: center; justify-content: center; padding: 2rem;
    `;

    const gridHtml = imageFiles
      .map((file: string) => {
        const filePath = `${folderPath}/${file}`.replace(/\\/g, '/');
        const fileUrl = toFileUrlMaybe(filePath);
        return `
          <button type="button" class="replace-image-pick" data-file-path="${escapeHtml(filePath)}" data-file-url="${escapeHtml(fileUrl)}" data-file-name="${escapeHtml(file)}" style="border: 2px solid var(--border-light); border-radius: 12px; overflow: hidden; padding: 0; cursor: pointer; background: var(--bg-secondary); text-align: left;">
            <div style="aspect-ratio: 1/1; background: var(--bg-tertiary); overflow: hidden;">
              <img src="${fileUrl}" alt="${escapeHtml(file)}" style="width: 100%; height: 100%; object-fit: cover; display:block;" onerror="this.style.display='none';">
            </div>
            <div style="padding: 0.5rem; font-size: 0.75rem; color: var(--text-muted); word-break: break-all;">${escapeHtml(file)}</div>
          </button>
        `;
      })
      .join('');

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 16px; padding: 1.5rem; max-width: 1100px; width: 92%; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;">
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem;">
          <div style="min-width:0;">
            <div style="font-weight: 900; color: var(--text-strong);">📁 ${escapeHtml(folderName)} 이미지 선택</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">이미지를 클릭하면 해당 소제목 이미지가 즉시 교체됩니다.</div>
          </div>
          <div style="display:flex; gap: 0.5rem; align-items:center;">
            <button type="button" class="back-to-folder-select" style="padding: 0.6rem 0.9rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 10px; cursor: pointer; font-weight: 800;">← 폴더</button>
            <button type="button" class="close-modal-btn" style="padding: 0.6rem 0.9rem; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 10px; cursor: pointer; font-weight: 900;">닫기</button>
          </div>
        </div>
        <div style="flex: 1; overflow-y: auto; padding: 0.25rem;">
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem;">
            ${gridHtml}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    modal.querySelector('.back-to-folder-select')?.addEventListener('click', async () => {
      modal.remove();
      await showSavedImagesForReplace(targetIndex);
    });

    modal.querySelectorAll('.replace-image-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const filePath = String((btn as HTMLElement).getAttribute('data-file-path') || '').trim();
        const fileUrl = String((btn as HTMLElement).getAttribute('data-file-url') || '').trim();
        const fileName = String((btn as HTMLElement).getAttribute('data-file-name') || '').trim();
        if (!filePath && !fileUrl) return;

        const currentHeading = resolveHeadingTitleByIndex(targetIndex);
        if (!currentHeading) {
          toastManager.error('소제목 제목을 찾을 수 없습니다. 먼저 소제목 분석/생성을 다시 실행해주세요.');
          return;
        }
        const updatedImage = {
          heading: currentHeading,
          filePath: filePath || fileUrl,
          url: filePath || fileUrl,
          previewDataUrl: fileUrl || filePath,
          provider: 'local',
          savedToLocal: true,
          prompt: fileName || currentHeading,
          timestamp: Date.now(),
        };

        // ✅ [2026-03-09 FIX] 기존 이미지를 완전 교체 (기존 이미지가 중복으로 남는 버그 방지)
        const titleKey = ImageManager.resolveHeadingKey(currentHeading);
        ImageManager.imageMap.set(titleKey, [{
          ...updatedImage,
          heading: titleKey,
          timestamp: Date.now()
        }]);
        ImageManager.unsetHeadings.delete(titleKey);
        ImageManager.syncGeneratedImagesArray();
        ImageManager.syncAllPreviews();
        try {
          syncGlobalImagesFromImageManager();
        } catch (e) {
          console.warn('[renderer] catch ignored:', e);
        }

        const allImagesAfter = (() => {
          try {
            const all = ImageManager.getAllImages();
            return Array.isArray(all) ? all : [];
          } catch {
            return [];
          }
        })();

        (window as any).imageManagementGeneratedImages = allImagesAfter.length > 0 ? allImagesAfter : generatedImages;
        displayGeneratedImages(allImagesAfter.length > 0 ? allImagesAfter : generatedImages);
        updatePromptItemsWithImages(allImagesAfter.length > 0 ? allImagesAfter : generatedImages);
        ImageManager.syncAllPreviews();
        toastManager.success('✅ 이미지가 교체되었습니다.');
        modal.remove();
      });
    });
  } catch (e) {
    console.error('[ReplacePicker] 실패:', e);
    toastManager.error(`이미지 불러오기 실패: ${(e as Error).message}`);
  }
}

// ✅ 폴더 내 이미지 목록 표시 (교체용)
async function showFolderImagesForReplace(images: any[], targetIndex: number, modal: HTMLElement): Promise<void> {
  try {
    if (!images || images.length === 0) {
      toastManager.error('폴더에 이미지가 없습니다.');
      return;
    }

    const imagesGrid = images.map((img: any, idx: number) => {
      const imgRaw = img?.previewDataUrl || img?.url || img?.filePath || '';
      const imgUrl = toFileUrlMaybe(String(imgRaw || '').trim());
      if (!imgUrl) return '';
      return `
        <div class="folder-image-item" data-image-index="${idx}" style="position: relative; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='scale(1.05)';" onmouseout="this.style.borderColor='transparent'; this.style.transform='scale(1)';">
          <img src="${imgUrl}" style="width: 100%; aspect-ratio: 1/1; object-fit: cover;" onerror="this.parentElement.style.display='none'">
        </div>
      `;
    }).filter(Boolean).join('');

    const container = modal.querySelector('#saved-folders-list') as HTMLElement;
    if (container) {
      container.innerHTML = `
        <button type="button" id="back-to-folders" style="padding: 0.5rem 1rem; background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: 6px; cursor: pointer; color: var(--text-strong); margin-bottom: 1rem;">← 폴더 목록으로</button>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.75rem;">
          ${imagesGrid}
        </div>
      `;

      // 뒤로가기 버튼
      container.querySelector('#back-to-folders')?.addEventListener('click', async () => {
        modal.remove();
        await showSavedImagesForReplace(targetIndex);
      });

      // 이미지 선택
      container.querySelectorAll('.folder-image-item').forEach((item, idx) => {
        item.addEventListener('click', () => {
          const selectedImage = images[idx];
          if (selectedImage) {
            const currentHeading = String(getHeadingTitleByIndex(targetIndex) || '').trim();
            if (!currentHeading) {
              toastManager.error('소제목 제목을 찾을 수 없습니다. 먼저 소제목 분석/생성을 다시 실행해주세요.');
              return;
            }
            const updatedImage = {
              ...selectedImage,
              heading: currentHeading,
              prompt: selectedImage.prompt || currentHeading, // ✅ prompt도 유지
              timestamp: Date.now()
            };

            // ✅ ImageManager에도 업데이트 (발행 시 정확한 이미지 사용을 위해 필수!)
            ImageManager.setImage(currentHeading, updatedImage);
            console.log(`[ImageManager] 이미지 교체: "${currentHeading}" → ${updatedImage.filePath?.substring(0, 50)}...`);

            // ✅ 전역 변수도 업데이트
            try {
              syncGlobalImagesFromImageManager();
            } catch (e) {
              console.warn('[renderer] catch ignored:', e);
            }

            const allImagesAfter = (() => {
              try {
                const all = ImageManager.getAllImages();
                return Array.isArray(all) ? all : [];
              } catch {
                return [];
              }
            })();

            (window as any).imageManagementGeneratedImages = allImagesAfter.length > 0 ? allImagesAfter : generatedImages;

            displayGeneratedImages(allImagesAfter.length > 0 ? allImagesAfter : generatedImages);
            updatePromptItemsWithImages(allImagesAfter.length > 0 ? allImagesAfter : generatedImages);

            toastManager.success(`✅ 이미지가 교체되었습니다.`);
            modal.remove();
          }
        });
      });
    }
  } catch (error) {
    console.error('[Image] 폴더 이미지 로드 실패:', error);
    toastManager.error('이미지를 불러오는데 실패했습니다.');
  }
}

function ensurePromptCardRemoveButtons(): void {
  const promptsContainer = document.getElementById('prompts-container') as HTMLDivElement | null;
  if (!promptsContainer) return;

  const promptItems = Array.from(promptsContainer.querySelectorAll('.prompt-item')) as HTMLDivElement[];
  promptItems.forEach((promptItem) => {
    const indexStr = String(promptItem.getAttribute('data-index') || '').trim();
    const index0 = indexStr ? Math.max(0, Number(indexStr) - 1) : 0;

    const generatedImageDiv = promptItem.querySelector('.generated-image') as HTMLElement | null;
    if (!generatedImageDiv) return;

    const hasVideo = !!generatedImageDiv.querySelector('video');
    if (hasVideo) return;

    const imgEl = generatedImageDiv.querySelector('img') as HTMLImageElement | null;
    if (!imgEl) return;

    const existingBtn = generatedImageDiv.querySelector('.remove-image-from-preview-btn') as HTMLElement | null;
    if (existingBtn) return;

    generatedImageDiv.style.position = 'relative';

    const btn = document.createElement('button');
    btn.className = 'remove-image-from-preview-btn';
    btn.setAttribute('data-image-index', String(index0));
    btn.style.cssText = [
      'position:absolute',
      'top:10px',
      'right:10px',
      'z-index:9999',
      'width:44px',
      'height:44px',
      'border-radius:999px',
      'border:2px solid rgba(255,255,255,0.85)',
      'background:rgba(239,68,68,0.95)',
      'color:#fff',
      'font-weight:900',
      'font-size:20px',
      'cursor:pointer',
      'box-shadow:0 6px 18px rgba(0,0,0,0.35)'
    ].join(';');
    btn.textContent = '✕';
    generatedImageDiv.appendChild(btn);
  });
}

// ✅ 프롬프트 아이템에 이미지 업데이트
function updatePromptItemsWithImages(images: any[]): void {
  const promptsContainer = document.getElementById('prompts-container') as HTMLDivElement;
  if (!promptsContainer) {
    console.log('[updatePromptItemsWithImages] prompts-container를 찾을 수 없습니다');
    return;
  }

  // ✅ 컨테이너 표시
  promptsContainer.style.display = 'grid';

  const imagesFromManager = (() => {
    try {
      const from = ImageManager.getAllImages();
      return Array.isArray(from) ? from : [];
    } catch {
      return [];
    }
  })();

  const sourceImages = (imagesFromManager.length > 0) ? imagesFromManager : (images || []);

  console.log(`[updatePromptItemsWithImages] ${sourceImages.length}개 이미지 업데이트 시작`);

  const byHeading = new Map<string, any>();
  (sourceImages || []).forEach((img: any) => {
    const h = String(img?.heading || '').trim();
    if (h && !byHeading.has(h)) byHeading.set(h, img);
    try {
      const n = normalizeHeadingKeyForVideoCache(h);
      if (n && !byHeading.has(n)) byHeading.set(n, img);
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
  });

  // ✅ [2026-03-16 FIX] 썸네일 프롬프트 아이템 자동 주입
  // ImageManager에 "🖼️ 썸네일" 이미지가 있지만 프롬프트 영역에 해당 prompt-item이 없는 경우 자동 생성
  (() => {
    try {
      const thumbnailImage = (sourceImages || []).find((img: any) =>
        img?.isThumbnail === true || String(img?.heading || '').trim() === '🖼️ 썸네일'
      );
      if (!thumbnailImage) return;

      // 이미 "🖼️ 썸네일" prompt-item이 존재하면 스킵
      const existingItems = Array.from(promptsContainer.querySelectorAll('.prompt-item')) as HTMLElement[];
      const hasThumbnailItem = existingItems.some(item =>
        String(item.getAttribute('data-heading-title') || '').trim() === '🖼️ 썸네일'
      );
      if (hasThumbnailItem) return;

      console.log('[updatePromptItemsWithImages] 🖼️ 썸네일 prompt-item 자동 주입');

      const thumbnailPrompt = String(thumbnailImage.prompt || '').trim();
      const safePrompt = escapeHtml(thumbnailPrompt);

      const promptItem = document.createElement('div');
      promptItem.className = 'prompt-item';
      promptItem.setAttribute('data-index', '0');
      promptItem.setAttribute('data-heading-title', '🖼️ 썸네일');
      promptItem.style.cssText = `
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(217, 119, 6, 0.04));
        border: 1px solid rgba(245, 158, 11, 0.4);
        border-radius: 12px;
        padding: 1rem;
        transition: all 0.2s;
      `;

      promptItem.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 0.9rem;">🖼️</div>
          <div style="flex: 1;">
            <div class="heading-title-text" style="font-weight: 600; color: var(--text-strong); font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem;"><span class="heading-title-pure">🖼️ 썸네일</span> <span style="font-size: 0.7rem; padding: 2px 6px; background: rgba(245, 158, 11, 0.2); color: #d97706; border-radius: 4px; font-weight: 600;">📌 썸네일</span></div>
          </div>
        </div>
        <div style="margin-bottom: 0.75rem;">
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">📝 영어 프롬프트:</div>
          <div class="prompt-text" style="font-size: 0.9rem; color: var(--text-strong); padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px; font-family: monospace; word-break: break-word;">${safePrompt || '(자동 생성됨)'}</div>
        </div>
        <div class="generated-images-container" data-heading-index="0" style="width: 100%; min-height: 200px; border: 2px dashed var(--border-color); border-radius: 8px; background: var(--bg-tertiary); overflow: hidden; padding: 0.75rem;">
          <div class="generated-image" style="width: 100%; aspect-ratio: 16 / 9; min-height: 220px; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 0.75rem; border: 2px dashed var(--border-color); background: var(--bg-tertiary); position: relative;">
            <span style="color: var(--text-muted); font-size: 1.5rem;">🖼️</span>
          </div>
          <div class="images-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.5rem; margin-bottom: 0.75rem;"></div>
          <div class="no-image-placeholder" style="display: none; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; gap: 0.5rem;">
            <span style="color: var(--text-muted); font-size: 2rem;">🖼️</span>
            <span style="color: var(--text-muted); font-size: 0.85rem;">이미지 없음</span>
          </div>
        </div>
      `;

      // 맨 앞에 삽입
      promptsContainer.insertBefore(promptItem, promptsContainer.firstChild);
    } catch (e) {
      console.warn('[updatePromptItemsWithImages] 썸네일 자동 주입 실패:', e);
    }
  })();

  const promptItems = Array.from(promptsContainer.querySelectorAll('.prompt-item')) as HTMLDivElement[];
  for (const promptItem of promptItems) {
    // ✅ [2026-03-14 FIX] headingTitle 추출: data-heading-title 속성 우선 (배지 텍스트 오염 방지)
    const indexStr = String(promptItem.getAttribute('data-index') || '').trim();
    const index0 = indexStr ? Math.max(0, Number(indexStr) - 1) : 0;
    const headingTitle = (() => {
      // 1순위: data-heading-title 속성 (정확한 제목)
      const dataTitle = String(promptItem.getAttribute('data-heading-title') || '').trim();
      if (dataTitle) return dataTitle;
      // 2순위: _headingTitles 전역 배열
      const globalTitle = String((window as any)._headingTitles?.[index0] || '').trim();
      if (globalTitle) return globalTitle;
      // 3순위: .heading-title-pure span (배지 제외 순수 제목)
      const headingTitleEl = promptItem.querySelector('.heading-title-pure') as HTMLElement | null;
      if (headingTitleEl) return String(headingTitleEl.textContent || '').trim();
      // 4순위: 전체 .heading-title-text (폴백)
      const fullEl = promptItem.querySelector('.heading-title-text') as HTMLElement | null;
      return String(fullEl?.textContent || '').trim();
    })();
    const resolvedHeadingKey = (() => {
      try {
        return ImageManager.resolveHeadingKey(headingTitle);
      } catch {
        return headingTitle;
      }
    })();

    const safeHeadingTitle = escapeHtml(headingTitle);
    let headingImages: any[] = [];
    let primaryImage: any = null;
    try {
      headingImages = ImageManager.getImages(resolvedHeadingKey) || [];
      primaryImage = ImageManager.getImage(resolvedHeadingKey);
    } catch {
      headingImages = [];
      primaryImage = null;
    }

    if (!headingImages || headingImages.length === 0) {
      // 폴백: 전달된 images 배열에서 heading 기준으로 추출
      const n = (() => {
        try {
          return normalizeHeadingKeyForVideoCache(headingTitle);
        } catch {
          return '';
        }
      })();
      headingImages = (sourceImages || []).filter((img: any) => {
        const h = String(img?.heading || '').trim();
        if (!h) return false;
        if (h === headingTitle) return true;
        if (n) {
          try {
            return normalizeHeadingKeyForVideoCache(h) === n;
          } catch {
            return false;
          }
        }
        return false;
      });
    }

    // ✅ [2026-03-14 FIX] 인덱스 기반 폴백 매칭 — heading 키 매칭 실패 시
    if ((!headingImages || headingImages.length === 0) && !primaryImage) {
      try {
        // 1) ImageManager.headings[index0]으로 재시도
        const headingEntry = ImageManager.headings?.[index0];
        const fallbackTitle = typeof headingEntry === 'string' ? String(headingEntry).trim() : String(headingEntry?.title || '').trim();
        if (fallbackTitle) {
          const fallbackKey = ImageManager.resolveHeadingKey(fallbackTitle);
          const fallbackPrimary = ImageManager.getImage(fallbackKey);
          if (fallbackPrimary) {
            primaryImage = fallbackPrimary;
            headingImages = ImageManager.getImages(fallbackKey) || [];
            console.log(`[updatePromptItemsWithImages] ✅ 인덱스(${index0}) 기반 폴백 매칭 성공: "${fallbackTitle}"`);
          }
        }
      } catch (e) {
        console.warn('[updatePromptItemsWithImages] 인덱스 폴백 실패:', e);
      }
    }
    // ✅ [2026-03-14 FIX] headingIndex 기반 폴백 매칭 — sourceImages에서
    if ((!headingImages || headingImages.length === 0) && !primaryImage) {
      const indexFallback = (sourceImages || []).find((img: any) =>
        typeof img?.headingIndex === 'number' && img.headingIndex === index0
      );
      if (indexFallback) {
        headingImages = [indexFallback];
        console.log(`[updatePromptItemsWithImages] ✅ headingIndex(${index0}) 기반 폴백 매칭 성공`);
      }
    }

    if (!primaryImage && headingImages.length > 0) {
      primaryImage = headingImages[0];
    }

    if (!primaryImage) {
      const imagesGrid = promptItem.querySelector('.images-grid') as HTMLDivElement;
      const noImagePlaceholder = promptItem.querySelector('.no-image-placeholder') as HTMLDivElement;
      if (imagesGrid) imagesGrid.innerHTML = '';
      if (noImagePlaceholder) noImagePlaceholder.style.display = 'flex';

      const generatedImageDiv = promptItem.querySelector('.generated-image') as HTMLDivElement | null;
      if (generatedImageDiv) {
        // ✅ [2026-03-14 FIX] 이미 syncAllPreviews가 표시한 이미지/비디오가 있으면 보존
        const hasExistingMedia = !!generatedImageDiv.querySelector('img, video');
        if (!hasExistingMedia) {
          generatedImageDiv.innerHTML = '<span style="color: var(--text-muted); font-size: 1.5rem;">🖼️</span>';
          generatedImageDiv.style.border = '2px dashed var(--border-color)';
          generatedImageDiv.style.background = 'var(--bg-tertiary)';
          generatedImageDiv.style.boxShadow = 'none';
        }
      }
      continue;
    }

    // ✅ .images-grid 찾기 (displayImageHeadingsWithPrompts에서 생성한 구조)
    const imagesGrid = promptItem.querySelector('.images-grid') as HTMLDivElement;
    const noImagePlaceholder = promptItem.querySelector('.no-image-placeholder') as HTMLDivElement;
    const generatedImageDiv = promptItem.querySelector('.generated-image') as HTMLDivElement | null;

    console.log(`[updatePromptItemsWithImages] 소제목 업데이트: imagesGrid=${!!imagesGrid}, image=${!!primaryImage}`);
    console.log(`[updatePromptItemsWithImages] 이미지 URL: ${(primaryImage.url || primaryImage.filePath || primaryImage.previewDataUrl || '').substring(0, 80)}...`);

    const primaryKey = getStableImageKey(primaryImage);
    const headingIndex = Number(primaryImage?.headingIndex ?? index0);

    const orderedImages = (() => {
      const list = Array.isArray(headingImages) ? headingImages : [];
      if (!primaryKey) return list;
      const primary = list.find((img: any) => getStableImageKey(img) === primaryKey);
      if (!primary) return list;
      const rest = list.filter((img: any) => getStableImageKey(img) !== primaryKey);
      return [primary, ...rest];
    })();

    const normalizedSelectedKey = (() => {
      const stored = getHeadingSelectedImageKey(resolvedHeadingKey);
      const storedKey = String(stored || '').trim();
      if (storedKey && (orderedImages || []).some((img: any) => getStableImageKey(img) === storedKey)) {
        return storedKey;
      }
      const fallback = String(primaryKey || '').trim() || String(getStableImageKey((orderedImages || [])[0]) || '').trim();
      if (fallback) {
        try {
          setHeadingSelectedImageKey(resolvedHeadingKey, fallback);
        } catch (e) {
          console.warn('[renderer] catch ignored:', e);
        }
      }
      return fallback;
    })();

    const selectedImage = (() => {
      const list = Array.isArray(orderedImages) ? orderedImages : [];
      if (normalizedSelectedKey) {
        const found = list.find((img: any) => getStableImageKey(img) === normalizedSelectedKey);
        if (found) return found;
      }
      return primaryImage;
    })();

    const selectedRaw = selectedImage?.url || selectedImage?.filePath || selectedImage?.previewDataUrl || '';
    const selectedUrl = toFileUrlMaybe(String(selectedRaw || '').trim());
    const isVideo = (() => {
      const u = String(selectedUrl || '').toLowerCase();
      return u.endsWith('.mp4') || u.endsWith('.webm') || u.endsWith('.mov') || u.endsWith('.m4v');
    })();

    if (generatedImageDiv) {
      const count = Array.isArray(orderedImages) ? orderedImages.length : 0;
      const currentIndex = (() => {
        if (!normalizedSelectedKey) return 0;
        const idx = (orderedImages || []).findIndex((img: any) => getStableImageKey(img) === normalizedSelectedKey);
        return idx >= 0 ? idx : 0;
      })();
      const disableNav = count <= 1;
      const isPrimarySelected = !!(normalizedSelectedKey && primaryKey && normalizedSelectedKey === primaryKey);

      generatedImageDiv.style.border = '1px solid var(--border-light)';
      generatedImageDiv.style.background = 'rgba(0,0,0,0.06)';
      generatedImageDiv.style.boxShadow = 'none';
      generatedImageDiv.style.position = 'relative';
      generatedImageDiv.style.cursor = 'pointer';

      generatedImageDiv.innerHTML = `
        <button type="button" class="big-preview-prev-btn" data-heading-index="${headingIndex}" data-heading-title="${escapeHtml(headingTitle)}" style="position:absolute; left: 10px; top: 50%; transform: translateY(-50%); z-index: 30; background: rgba(255,255,255,0.18); color: white; border: 1px solid rgba(255,255,255,0.28); border-radius: 12px; padding: 0.65rem 0.8rem; cursor: pointer; font-weight: 900; ${disableNav ? 'opacity:0.35; pointer-events:none;' : ''}">◀</button>
        <button type="button" class="big-preview-next-btn" data-heading-index="${headingIndex}" data-heading-title="${escapeHtml(headingTitle)}" style="position:absolute; right: 10px; top: 50%; transform: translateY(-50%); z-index: 30; background: rgba(255,255,255,0.18); color: white; border: 1px solid rgba(255,255,255,0.28); border-radius: 12px; padding: 0.65rem 0.8rem; cursor: pointer; font-weight: 900; ${disableNav ? 'opacity:0.35; pointer-events:none;' : ''}">▶</button>
        ${isPrimarySelected ? `<div style="position:absolute; left: 10px; top: 10px; z-index: 25; background: rgba(99,102,241,0.92); color: white; font-weight: 900; font-size: 0.75rem; padding: 0.3rem 0.5rem; border-radius: 999px;">대표</div>` : ''}
        <div style="position:absolute; right: 10px; bottom: 10px; z-index: 25; background: rgba(0,0,0,0.45); color: rgba(255,255,255,0.9); font-weight: 900; font-size: 0.75rem; padding: 0.3rem 0.5rem; border-radius: 999px;">${Math.min(count, currentIndex + 1)} / ${count}</div>
        ${isVideo ? `<video class="big-preview-media" src="${escapeHtml(selectedUrl)}" autoplay loop muted playsinline controls style="width: 100%; height: 100%; object-fit: cover;" ></video>` : `<img class="big-preview-media" src="${escapeHtml(selectedUrl)}" alt="${escapeHtml(headingTitle)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%23999%22%3E이미지 로드 실패%3C/text%3E%3C/svg%3E';" />`}
      `;

      const mediaEl = generatedImageDiv.querySelector('.big-preview-media') as HTMLElement | null;
      if (mediaEl) {
        mediaEl.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          try {
            showHeadingImagesModal(encodeURIComponent(headingTitle), selectedUrl);
          } catch (e) {
            console.warn('[renderer] catch ignored:', e);
          }
        });
      }
    }

    if (imagesGrid) {
      imagesGrid.innerHTML = '';

      (orderedImages || []).forEach((img: any, idx: number) => {
        const imgRaw = img?.url || img?.filePath || img?.previewDataUrl || '';
        const imgUrl = toFileUrlMaybe(String(imgRaw || '').trim());
        const key = getStableImageKey(img);
        const isPrimary = !!(key && primaryKey && key === primaryKey);
        const isSelected = !!(key && normalizedSelectedKey && key === normalizedSelectedKey);

        const item = document.createElement('div');
        item.className = 'grid-image-item';
        item.setAttribute('data-image-key', key);
        item.setAttribute('data-heading-index', String(headingIndex));
        item.setAttribute('data-heading-title', headingTitle);
        item.style.cssText = 'position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid transparent; transition: all 0.15s;';
        if (isPrimary) {
          item.style.borderColor = 'var(--primary)';
          item.style.boxShadow = '0 0 0 2px rgba(99, 102, 241, 0.2)';
        }
        if (isSelected) {
          item.style.borderColor = '#22c55e';
          item.style.boxShadow = '0 0 0 2px rgba(34, 197, 94, 0.22)';
        }

        const imgEl = document.createElement('img');
        imgEl.src = imgUrl;
        imgEl.alt = headingTitle;
        imgEl.style.width = '100%';
        imgEl.style.height = '100%';
        imgEl.style.objectFit = 'cover';
        item.appendChild(imgEl);

        const checkWrap = document.createElement('div');
        checkWrap.style.cssText = 'position:absolute; left:6px; top:6px; z-index: 12; width: 22px; height: 22px; border-radius: 6px; background: rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center;';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = isSelected;
        check.disabled = true;
        check.style.cssText = 'width:16px; height:16px; accent-color:#22c55e; pointer-events:none;';
        checkWrap.appendChild(check);
        item.appendChild(checkWrap);

        if (isPrimary) {
          const badge = document.createElement('div');
          badge.textContent = '대표';
          badge.style.cssText = 'position:absolute; left: 6px; bottom: 6px; z-index: 11; background: rgba(99,102,241,0.92); color: white; font-weight: 900; font-size: 0.7rem; padding: 0.25rem 0.45rem; border-radius: 999px;';
          item.appendChild(badge);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-single-grid-image-btn';
        removeBtn.setAttribute('data-heading-index', String(headingIndex));
        removeBtn.setAttribute('data-image-index', String(idx));
        removeBtn.setAttribute('data-heading-title', safeHeadingTitle);
        removeBtn.setAttribute('data-image-key', key);
        removeBtn.style.cssText = 'position: absolute; top: 6px; right: 6px; z-index: 10; background: rgba(239,68,68,0.9); color: white; border: none; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; font-size: 0.8rem; line-height: 1;';
        removeBtn.textContent = '✕';
        item.appendChild(removeBtn);

        item.addEventListener('mouseenter', () => {
          if (isSelected) return;
          item.style.borderColor = 'rgba(34, 197, 94, 0.55)';
          item.style.transform = 'scale(1.02)';
        });
        item.addEventListener('mouseleave', () => {
          if (isSelected) return;
          if (isPrimary) item.style.borderColor = 'var(--primary)';
          else item.style.borderColor = 'transparent';
          item.style.transform = 'scale(1)';
        });

        imagesGrid.appendChild(item);
      });

      if (noImagePlaceholder) {
        noImagePlaceholder.style.display = 'none';
      }

      console.log(`[updatePromptItemsWithImages] 소제목에 이미지 배치 완료(썸네일): ${String(primaryImage?.heading || '').substring(0, 20)}...`);
    }
  }

  ensurePromptCardRemoveButtons();
  ensurePromptCardRemoveHandler();
}

// 발행 완료 시 썸네일 생성기 완전 초기화
function resetThumbnailGeneratorOnPublish(): void {
  try {
    if (thumbnailGenerator) {
      try {
        // 내부 상태 초기화를 위해 새 인스턴스로 교체
        thumbnailGenerator = new ThumbnailGenerator();
      } catch (e) {
        console.warn('[renderer] catch ignored:', e);
      }
    }

    const thumbPreview = document.getElementById('thumbnail-preview') as HTMLElement | null;
    if (thumbPreview) {
      thumbPreview.style.backgroundImage = 'none';
      thumbPreview.innerHTML = '<span style="color: var(--text-muted); font-size: 0.9rem;">썸네일 미리보기가 여기에 표시됩니다.</span>';
    }

    const thumbMainText = document.getElementById('thumb-main-text') as HTMLTextAreaElement | null;
    if (thumbMainText) thumbMainText.value = '';

    const thumbSubText = document.getElementById('thumb-sub-text') as HTMLTextAreaElement | null;
    if (thumbSubText) thumbSubText.value = '';

    const thumbFontSize = document.getElementById('thumb-font-size') as HTMLInputElement | null;
    if (thumbFontSize) thumbFontSize.value = '48';

    const thumbTextColor = document.getElementById('thumb-text-color') as HTMLInputElement | null;
    if (thumbTextColor) thumbTextColor.value = '#ffffff';

    const thumbBgColor = document.getElementById('thumb-bg-color') as HTMLInputElement | null;
    if (thumbBgColor) thumbBgColor.value = '#1a1a2e';

    const thumbOverlay = document.getElementById('thumb-overlay-enabled') as HTMLInputElement | null;
    if (thumbOverlay) thumbOverlay.checked = true;

    thumbnailBackgroundImage = null;
    thumbnailBackgroundDataUrl = null;

    console.log('[Thumbnail] 발행 후 썸네일 생성기 초기화 완료');
  } catch (e) {
    console.error('[Thumbnail] 발행 후 초기화 실패:', e);
  }
}

function showVideoModal(videoUrl: string, title?: string): void {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.9); z-index: 10002; display: flex;
    align-items: center; justify-content: center; padding: 2rem;
    cursor: pointer;
  `;

  const safeTitle = escapeHtml(String(title || ''));
  modal.innerHTML = `
    <div style="position: relative; max-width: 92vw; width: min(720px, 92vw);">
      <button type="button" class="close-video-modal-btn" style="position: absolute; top: -2rem; right: 0; background: rgba(255,255,255,0.2); border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.5rem; color: white; display: flex; align-items: center; justify-content: center;">×</button>
      ${safeTitle ? `<div style="color: rgba(255,255,255,0.85); font-weight: 700; margin-bottom: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safeTitle}</div>` : ''}
      <video src="${videoUrl}" controls autoplay loop muted playsinline style="width: 100%; aspect-ratio: 16 / 9; object-fit: cover; max-height: 78vh; border-radius: 10px; background: #000;"></video>
    </div>
  `;

  document.body.appendChild(modal);

  // [v2.10.110] keydown listener 누수 차단 — 닫기 경로 통합
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeModal();
  };
  const closeModal = () => {
    document.removeEventListener('keydown', handleKeydown);
    modal.remove();
  };

  const closeBtn = modal.querySelector('.close-video-modal-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal || (e.target as HTMLElement).classList.contains('close-video-modal-btn')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', handleKeydown);
}

// 세 번째 DOMContentLoaded 리스너 제거 - 모든 초기화를 두 번째 리스너에서 처리

initAIAssistant();
initToolsHubModal();
initBestProductModal();
initGeminiSelectionUI();
initContentModeHelpAndSmartPublish();
// ✅ [SPEC-IMAGE-NARRATIVE-2026 Phase 3] Image narrative mode (사진→글, 글소스 옵션으로 통합)
// Quick Mode 제거됨 — imageNarrativeMode 단일 경로로 통합.
initImageNarrativeMode();
// ✅ [SPEC-DROPSHOT-2026] 이미지 생성 스튜디오 서브탭 초기화
initImageGenStudio();
// ✅ [SPEC-DROPSHOT-2026 2단계] 이미지 관리 탭 엔진 셀렉터 — dropshot 선택 시 로그인/확인 노출
wireSelectDropshotRow({
  selectId: 'image-source-select',
  rowId: 'mgmt-dropshot-login',
  loginBtnId: 'mgmt-ds-login-btn',
  checkBtnId: 'mgmt-ds-check-btn',
  statusId: 'mgmt-ds-status',
});
wireSelectFlowRow({
  selectId: 'image-source-select',
  rowId: 'mgmt-flow-login',
  loginBtnId: 'mgmt-flow-login-btn',
  checkBtnId: 'mgmt-flow-check-btn',
  statusId: 'mgmt-flow-status',
});

// ✅ [v2.10.191 Phase 3.8.3] SERP 추이 패널 초기화 + 데이터 로드
function initSerpHistoryPanel(): void {
  const refreshBtn = document.getElementById('serp-history-refresh-btn') as HTMLButtonElement | null;
  const clearBtn = document.getElementById('serp-history-clear-btn') as HTMLButtonElement | null;
  const content = document.getElementById('serp-history-content') as HTMLElement | null;
  if (!content) return;

  // 분석 서브탭 클릭 시 SERP 추이 자동 로드
  document.querySelectorAll('.analytics-subtab[data-subtab="serp-history"]').forEach(btn => {
    btn.addEventListener('click', () => { loadSerpHistory(content); });
  });

  refreshBtn?.addEventListener('click', () => loadSerpHistory(content));

  clearBtn?.addEventListener('click', async () => {
    if (!confirm('SERP 추이 history를 모두 삭제할까요? 되돌릴 수 없습니다.')) return;
    try {
      const result = await (window as any).api.clearSerpHistory();
      if (result?.ok) {
        await loadSerpHistory(content);
      } else {
        alert('초기화 실패: ' + (result?.error || '알 수 없음'));
      }
    } catch (err) {
      alert('초기화 오류: ' + (err as Error).message);
    }
  });

  // 분석 탭 처음 진입 시 자동 로드 (서브탭 활성화 시)
  // 첫 진입 시 즉시 로드 — 사용자가 분석 탭 진입하면 자동 표시
  setTimeout(() => loadSerpHistory(content), 500);

  // ✅ [v2.10.200 Phase 3.18.5+6] 실측 calibration UI wiring
  initCalibrationPanel();
}

// 실측 calibration 패널 초기화
function initCalibrationPanel(): void {
  const check24Btn = document.getElementById('exposure-check-24h-btn') as HTMLButtonElement | null;
  const check72Btn = document.getElementById('exposure-check-72h-btn') as HTMLButtonElement | null;
  const clearBtn = document.getElementById('published-posts-clear-btn') as HTMLButtonElement | null;
  const calibContent = document.getElementById('calibration-content') as HTMLElement | null;
  if (!calibContent) return;

  const handleExposureCheck = async (hoursAfter: 24 | 48 | 72, btn: HTMLButtonElement | null) => {
    if (!btn) return;
    const originalText = btn.textContent || '';
    btn.disabled = true;
    btn.textContent = '🔄 분석 중...';
    try {
      const result = await (window as any).api.checkPublishedExposure({ hoursAfter });
      if (result?.ok) {
        if (result.checked === 0) {
          calibContent.innerHTML = `<p style="text-align: center; color: rgba(255,255,255,0.7); padding: 1rem;">${hoursAfter}시간 윈도우(±6h)에 해당하는 발행 글이 없습니다.<br><span style="font-size: 0.82em; color: rgba(255,255,255,0.5);">발행 후 ${hoursAfter}시간 정도 지난 글만 검증 대상입니다.</span></p>`;
        } else {
          // 자동 calibration 재로드
          await loadCalibration(calibContent);
        }
      } else {
        calibContent.innerHTML = `<p style="color: #ef4444;">❌ ${result?.error || '실패'}</p>`;
      }
    } catch (err) {
      calibContent.innerHTML = `<p style="color: #ef4444;">❌ ${(err as Error).message}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  check24Btn?.addEventListener('click', () => handleExposureCheck(24, check24Btn));
  check72Btn?.addEventListener('click', () => handleExposureCheck(72, check72Btn));

  clearBtn?.addEventListener('click', async () => {
    if (!confirm('발행 추적 데이터를 모두 삭제할까요? calibration 통계도 함께 초기화됩니다.')) return;
    try {
      const result = await (window as any).api.clearPublishedPosts();
      if (result?.ok) {
        await loadCalibration(calibContent);
      } else {
        alert('초기화 실패: ' + (result?.error || '알 수 없음'));
      }
    } catch (err) {
      alert('초기화 오류: ' + (err as Error).message);
    }
  });

  // 첫 진입 시 자동 로드
  setTimeout(() => loadCalibration(calibContent), 700);
}

async function loadCalibration(content: HTMLElement): Promise<void> {
  try {
    content.innerHTML = '<p style="text-align: center; color: #888; padding: 1rem;">⏳ 로딩 중...</p>';
    const result = await (window as any).api.getPublishedCalibration();
    if (!result?.ok || !result.calibration) {
      content.innerHTML = `<p style="color: #ef4444;">❌ ${result?.error || '로드 실패'}</p>`;
      return;
    }
    renderCalibration(content, result.calibration, result.totalPosts || 0);
  } catch (err) {
    content.innerHTML = `<p style="color: #ef4444;">❌ ${(err as Error).message}</p>`;
  }
}

function renderCalibration(content: HTMLElement, calib: any, totalPosts: number): void {
  if (totalPosts === 0) {
    content.innerHTML = `
      <div style="text-align: center; padding: 1.5rem 0;">
        <div style="font-size: 1.8rem; margin-bottom: 0.4rem;">📭</div>
        <p style="color: #888; margin: 0;">발행 추적 데이터가 없습니다.</p>
        <p style="color: #666; font-size: 0.82rem; margin: 0.4rem 0 0 0;">글을 발행하면 자동으로 누적됩니다.</p>
      </div>
    `;
    return;
  }

  if (!calib.canCalibrate) {
    content.innerHTML = `
      <div style="padding: 0.8rem 1rem; background: rgba(255,255,255,0.04); border-radius: 6px;">
        <div style="font-weight: 600; color: rgba(255,255,255,0.85); margin-bottom: 0.4rem;">📊 누적 ${totalPosts}건</div>
        <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 0.85rem;">⏳ ${calib.reason || 'calibration 가능 조건 미충족'}</p>
        <p style="margin: 0.4rem 0 0 0; font-size: 0.78rem; color: rgba(255,255,255,0.45);">
          확인됨 — 노출: ${calib.exposedCount}건 / 비노출: ${calib.notExposedCount}건 / 미확인: ${calib.unknownCount}건<br>
          최소 조건: 전체 10건 + 노출 ≥3 + 비노출 ≥3
        </p>
        <p style="margin: 0.4rem 0 0 0; font-size: 0.78rem; color: rgba(255,255,255,0.5);">위 "🔍 24h 노출 확인" 버튼으로 검증을 실행하세요.</p>
      </div>
    `;
    return;
  }

  // 정상 calibration 결과 표시
  const rec = calib.recommendedThreshold;
  const gapColor = (g: number) => g >= 5 ? '#4ade80' : g >= 0 ? '#22d3ee' : g >= -5 ? '#fbbf24' : '#ef4444';
  const gapIcon = (g: number) => g >= 5 ? '⭐' : g >= 0 ? '✓' : '⚠️';

  content.innerHTML = `
    <!-- 권장 임계 강조 카드 -->
    <div style="background: linear-gradient(135deg, rgba(212, 175, 55, 0.18), rgba(212, 175, 55, 0.05)); border: 2px solid #D4AF37; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: center;">
      <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); margin-bottom: 0.3rem;">📐 실측 권장 통과 임계 (노출 글 하위 25%)</div>
      <div style="font-size: 2.2rem; font-weight: 800; color: #D4AF37; line-height: 1;">${rec ?? '-'}</div>
      <div style="font-size: 0.78rem; color: rgba(255,255,255,0.6); margin-top: 0.4rem;">
        현재 시스템 추정 통과 임계: 60점 · 최소 노출 점수: ${calib.exposed.minFinalScore}점
      </div>
    </div>

    <!-- 노출/비노출 그룹 비교 -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-bottom: 1rem;">
      <div style="background: rgba(74, 222, 128, 0.08); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 6px; padding: 0.7rem;">
        <div style="font-size: 0.78rem; color: #4ade80; font-weight: 700; margin-bottom: 0.4rem;">✅ 노출 (top10) ${calib.exposedCount}건</div>
        <div style="font-size: 0.82rem; color: rgba(255,255,255,0.85); line-height: 1.6;">
          평균 최종 <strong>${calib.exposed.avgFinalScore}</strong> ·
          모드 ${calib.exposed.avgModeScore} ·
          안전 ${calib.exposed.avgSafetyScore} ·
          사람다움 ${calib.exposed.avgHumanlikeScore}
        </div>
      </div>
      <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 0.7rem;">
        <div style="font-size: 0.78rem; color: #ef4444; font-weight: 700; margin-bottom: 0.4rem;">❌ 비노출 ${calib.notExposedCount}건</div>
        <div style="font-size: 0.82rem; color: rgba(255,255,255,0.85); line-height: 1.6;">
          평균 최종 <strong>${calib.notExposed.avgFinalScore}</strong> ·
          모드 ${calib.notExposed.avgModeScore} ·
          안전 ${calib.notExposed.avgSafetyScore} ·
          사람다움 ${calib.notExposed.avgHumanlikeScore}
        </div>
      </div>
    </div>

    <!-- 신호별 gap -->
    <div style="background: rgba(0,0,0,0.2); padding: 0.7rem; border-radius: 6px;">
      <h4 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; color: rgba(255,255,255,0.8);">📊 노출 글이 비노출 글보다 *얼마나 강한가* (실측 gap)</h4>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.82rem;">
        <div>${gapIcon(calib.signalGap.finalScore)} 최종 점수 <strong style="color: ${gapColor(calib.signalGap.finalScore)};">${calib.signalGap.finalScore >= 0 ? '+' : ''}${calib.signalGap.finalScore}</strong></div>
        <div>${gapIcon(calib.signalGap.modeScore)} 모드 적합도 <strong style="color: ${gapColor(calib.signalGap.modeScore)};">${calib.signalGap.modeScore >= 0 ? '+' : ''}${calib.signalGap.modeScore}</strong></div>
        <div>${gapIcon(calib.signalGap.safetyScore)} 안전성 <strong style="color: ${gapColor(calib.signalGap.safetyScore)};">${calib.signalGap.safetyScore >= 0 ? '+' : ''}${calib.signalGap.safetyScore}</strong></div>
        <div>${gapIcon(calib.signalGap.humanlikeScore)} 사람다움 <strong style="color: ${gapColor(calib.signalGap.humanlikeScore)};">${calib.signalGap.humanlikeScore >= 0 ? '+' : ''}${calib.signalGap.humanlikeScore}</strong></div>
      </div>
      <p style="margin: 0.6rem 0 0 0; font-size: 0.72rem; color: rgba(255,255,255,0.5);">미확인: ${calib.unknownCount}건 — 24/72h 노출 확인 버튼으로 검증 가능</p>
    </div>
  `;
}

async function loadSerpHistory(content: HTMLElement): Promise<void> {
  try {
    content.innerHTML = '<p style="text-align: center; color: #888; padding: 1.5rem 0;">⏳ 로딩 중...</p>';
    const result = await (window as any).api.getSerpHistoryStats();
    if (!result?.ok || !result.stats) {
      content.innerHTML = `<p style="color: #ef4444;">❌ ${result?.error || '로드 실패'}</p>`;
      return;
    }
    renderSerpHistoryContent(content, result.stats, result.recentEntries || [], result.learningImpact);
  } catch (err) {
    content.innerHTML = `<p style="color: #ef4444;">❌ ${(err as Error).message}</p>`;
  }
}

function renderSerpHistoryContent(content: HTMLElement, stats: any, recent: any[], learningImpact?: any): void {
  if (stats.totalEntries === 0) {
    content.innerHTML = `
      <div style="text-align: center; padding: 2rem 0;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📭</div>
        <p style="color: #888;">아직 누적된 SERP 비교 결과가 없습니다.</p>
        <p style="color: #666; font-size: 0.85rem; margin-top: 0.5rem;">환경설정에서 <strong>"자동 SERP 비교"</strong>가 ON인지 확인하고<br>글을 생성하면 자동으로 누적됩니다.</p>
      </div>
    `;
    return;
  }

  // 평균 점수 비교
  const ourScore = stats.avgFinalScore;
  const serpScore = stats.avgSerpScore;
  const gap = stats.avgGap;
  const gapColor = gap >= 5 ? '#4ade80' : gap >= -3 ? '#22d3ee' : gap >= -15 ? '#fbbf24' : '#ef4444';
  const gapIcon = gap >= 5 ? '⭐' : gap >= -3 ? '✓' : gap >= -15 ? '⚠️' : '🚨';

  // ranking 분포 막대
  const rankColors: Record<string, string> = {
    above_median: '#4ade80',
    near_median: '#22d3ee',
    below_median: '#fbbf24',
    below_25th: '#ef4444',
  };
  const rankLabels: Record<string, string> = {
    above_median: '🟢 상위권',
    near_median: '🟢 중상위',
    below_median: '🟡 중하위',
    below_25th: '🔴 하위',
  };
  const totalRanked = Object.values(stats.rankingDistribution).reduce((a: number, b: any) => a + (Number(b) || 0), 0) as number;
  const rankBarHtml = ['above_median', 'near_median', 'below_median', 'below_25th'].map(rk => {
    const count = stats.rankingDistribution[rk] || 0;
    if (count === 0) return '';
    const pct = Math.round((count / Math.max(1, totalRanked)) * 100);
    return `<div style="display: flex; align-items: center; gap: 0.6rem; margin: 0.3rem 0; font-size: 0.85rem;">
      <span style="min-width: 90px; color: ${rankColors[rk]};">${rankLabels[rk]}</span>
      <div style="flex: 1; background: rgba(255,255,255,0.05); border-radius: 4px; height: 16px; overflow: hidden;">
        <div style="background: ${rankColors[rk]}; height: 100%; width: ${pct}%; transition: width 0.4s;"></div>
      </div>
      <span style="min-width: 60px; text-align: right; color: rgba(255,255,255,0.8);">${count}건 (${pct}%)</span>
    </div>`;
  }).join('');

  // 미달 신호 top
  const missingHtml = (stats.topMissingSignals || []).slice(0, 5).map((s: any) =>
    `<li style="margin: 0.3rem 0;"><strong style="color: #fbbf24;">${s.signal}</strong> <span style="color: rgba(255,255,255,0.6); font-size: 0.85em;">— ${s.count}회 미달</span></li>`
  ).join('');

  // 강점 신호 top
  const strengthHtml = (stats.topStrengths || []).slice(0, 5).map((s: any) =>
    `<li style="margin: 0.3rem 0;"><strong style="color: #4ade80;">${s.signal}</strong> <span style="color: rgba(255,255,255,0.6); font-size: 0.85em;">— ${s.count}회 우위</span></li>`
  ).join('');

  // 최근 항목
  const recentHtml = recent.slice(0, 10).map((e: any) => {
    const date = new Date(e.timestamp).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const color = rankColors[e.ranking] || '#888';
    return `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
      <td style="padding: 0.4rem; font-size: 0.78rem; color: rgba(255,255,255,0.7);">${date}</td>
      <td style="padding: 0.4rem; font-size: 0.82rem;">${e.keyword.slice(0, 20)}${e.keyword.length > 20 ? '…' : ''}</td>
      <td style="padding: 0.4rem; text-align: right; font-weight: 700; color: ${color};">${e.ourFinalScore}</td>
      <td style="padding: 0.4rem; text-align: right; color: rgba(255,255,255,0.7);">${e.serpAvgFinalScore}</td>
      <td style="padding: 0.4rem; text-align: right; font-size: 0.78rem; color: ${e.ourFinalScore - e.serpAvgFinalScore >= 0 ? '#4ade80' : '#fbbf24'};">${e.ourFinalScore - e.serpAvgFinalScore >= 0 ? '+' : ''}${e.ourFinalScore - e.serpAvgFinalScore}</td>
    </tr>`;
  }).join('');

  content.innerHTML = `
    <!-- 평균 점수 비교 -->
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.8rem; margin-bottom: 1.2rem;">
      <div style="background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 0.8rem; text-align: center;">
        <div style="font-size: 0.78rem; color: rgba(255,255,255,0.6);">내 글 평균</div>
        <div style="font-size: 1.8rem; font-weight: 800; color: #D4AF37; margin: 0.2rem 0;">${ourScore}</div>
        <div style="font-size: 0.72rem; color: rgba(255,255,255,0.5);">${stats.totalEntries}건 누적</div>
      </div>
      <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 0.8rem; text-align: center;">
        <div style="font-size: 0.78rem; color: rgba(255,255,255,0.6);">상위 노출 평균</div>
        <div style="font-size: 1.8rem; font-weight: 800; color: rgba(255,255,255,0.85); margin: 0.2rem 0;">${serpScore}</div>
        <div style="font-size: 0.72rem; color: rgba(255,255,255,0.5);">SERP baseline</div>
      </div>
      <div style="background: ${gapColor}1a; border: 1px solid ${gapColor}; border-radius: 8px; padding: 0.8rem; text-align: center;">
        <div style="font-size: 0.78rem; color: rgba(255,255,255,0.6);">평균 격차</div>
        <div style="font-size: 1.8rem; font-weight: 800; color: ${gapColor}; margin: 0.2rem 0;">${gap >= 0 ? '+' : ''}${gap}</div>
        <div style="font-size: 0.72rem; color: rgba(255,255,255,0.7);">${gapIcon} ${gap >= 5 ? '강한 우위' : gap >= -3 ? '근접' : gap >= -15 ? '개선 권장' : '시급 보완'}</div>
      </div>
    </div>

    ${(() => {
      // ✅ [v2.10.193 Phase 3.10] 자동 학습 효과 측정 카드
      if (!learningImpact || !learningImpact.canMeasure) {
        return learningImpact?.reason ? `
          <div style="background: rgba(255,255,255,0.04); border: 1px dashed rgba(255,255,255,0.15); border-radius: 8px; padding: 0.8rem; margin-bottom: 1.2rem; text-align: center; font-size: 0.82rem; color: rgba(255,255,255,0.6);">
            📚 자동 학습 효과: ${learningImpact.reason}
          </div>` : '';
      }
      const li = learningImpact;
      const scoreDeltaColor = li.scoreDelta >= 5 ? '#4ade80' : li.scoreDelta >= 0 ? '#22d3ee' : li.scoreDelta >= -3 ? '#fbbf24' : '#ef4444';
      const gapDeltaColor = li.gapImprovement >= 3 ? '#4ade80' : li.gapImprovement >= 0 ? '#22d3ee' : li.gapImprovement >= -3 ? '#fbbf24' : '#ef4444';
      const verdict = li.scoreDelta >= 5
        ? '✅ 학습 효과 명확 — 점수 큰 폭 상승'
        : li.scoreDelta >= 0
          ? '🟢 학습 효과 있음 — 점수 상승 또는 유지'
          : li.scoreDelta >= -3
            ? '⚠️ 효과 미미 — 더 많은 누적 데이터 필요'
            : '🔴 학습 후 점수 하락 — 다른 원인 확인 필요';
      return `
        <div style="background: linear-gradient(135deg, rgba(212, 175, 55, 0.12), rgba(212, 175, 55, 0.03)); border: 1px solid rgba(212, 175, 55, 0.4); border-radius: 8px; padding: 1rem; margin-bottom: 1.2rem;">
          <h4 style="margin: 0 0 0.6rem 0; color: #D4AF37; font-size: 0.95rem;">📚 자동 학습 효과 (실측)</h4>
          <p style="margin: 0 0 0.6rem 0; font-size: 0.78rem; color: rgba(255,255,255,0.6);">처음 ${li.beforeCount}건 (학습 OFF) vs 이후 ${li.afterCount}건 (학습 ON) 평균 비교 — 추정 없음</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; margin: 0.6rem 0;">
            <div style="background: rgba(0,0,0,0.2); padding: 0.6rem; border-radius: 6px;">
              <div style="font-size: 0.72rem; color: rgba(255,255,255,0.6);">평균 점수 변화</div>
              <div style="font-size: 1rem; margin-top: 0.2rem; color: rgba(255,255,255,0.85);">
                ${li.beforeAvgScore} → ${li.afterAvgScore}
                <span style="color: ${scoreDeltaColor}; font-weight: 700; margin-left: 0.4rem;">${li.scoreDelta >= 0 ? '+' : ''}${li.scoreDelta}</span>
              </div>
            </div>
            <div style="background: rgba(0,0,0,0.2); padding: 0.6rem; border-radius: 6px;">
              <div style="font-size: 0.72rem; color: rgba(255,255,255,0.6);">SERP 격차 개선</div>
              <div style="font-size: 1rem; margin-top: 0.2rem; color: rgba(255,255,255,0.85);">
                ${li.beforeAvgGap >= 0 ? '+' : ''}${li.beforeAvgGap} → ${li.afterAvgGap >= 0 ? '+' : ''}${li.afterAvgGap}
                <span style="color: ${gapDeltaColor}; font-weight: 700; margin-left: 0.4rem;">${li.gapImprovement >= 0 ? '+' : ''}${li.gapImprovement}</span>
              </div>
            </div>
          </div>
          <div style="margin-top: 0.6rem; font-size: 0.85rem; font-weight: 600; color: ${scoreDeltaColor};">${verdict}</div>
        </div>
      `;
    })()}

    ${(() => {
      // ✅ [v2.10.197 Phase 3.14] 누적 난이도 분포 카드
      const diffData = stats.difficultyDataPoints || 0;
      if (diffData === 0) return '';
      const diff = stats.difficultyDistribution || {};
      const diffColors: Record<string, string> = {
        easy: '#4ade80', medium: '#fbbf24', hard: '#f97316', expert: '#ef4444',
      };
      const diffLabels: Record<string, string> = {
        easy: '🟢 진입 쉬움', medium: '🟡 중간', hard: '🟠 어려움', expert: '🔴 인플루언서 영역',
      };
      const tiers = ['easy', 'medium', 'hard', 'expert'];
      const totalDiff = tiers.reduce((sum, t) => sum + (diff[t] || 0), 0);
      if (totalDiff === 0) return '';
      const expertPct = Math.round(((diff.expert || 0) / totalDiff) * 100);
      const hardPct = Math.round(((diff.hard || 0) / totalDiff) * 100);
      const warnMsg = expertPct >= 30
        ? '🔴 expert 키워드 비중 높음 — 일반 블로그 노출 한계'
        : (hardPct + expertPct) >= 50
          ? '🟠 어려운 키워드 다수 — 강한 신호 필요'
          : (diff.easy || 0) >= totalDiff * 0.5
            ? '🟢 진입 쉬운 키워드 위주 — 안정적'
            : '🟡 다양한 난이도 분포';
      const barsHtml = tiers.filter(t => diff[t] > 0).map(t => {
        const count = diff[t] || 0;
        const pct = Math.round((count / totalDiff) * 100);
        return `<div style="display: flex; align-items: center; gap: 0.6rem; margin: 0.25rem 0; font-size: 0.82rem;">
          <span style="min-width: 130px; color: ${diffColors[t]};">${diffLabels[t]}</span>
          <div style="flex: 1; background: rgba(255,255,255,0.05); border-radius: 4px; height: 14px; overflow: hidden;">
            <div style="background: ${diffColors[t]}; height: 100%; width: ${pct}%; transition: width 0.4s;"></div>
          </div>
          <span style="min-width: 60px; text-align: right; color: rgba(255,255,255,0.8);">${count}건 (${pct}%)</span>
        </div>`;
      }).join('');
      const smartblockNote = stats.smartblockCount > 0
        ? `<div style="margin-top: 0.5rem; font-size: 0.78rem; color: rgba(255,255,255,0.6);">⚡ AI 스마트블록 노출 키워드: ${stats.smartblockCount}건</div>`
        : '';
      return `
        <div style="background: rgba(0,0,0,0.2); padding: 0.9rem; border-radius: 6px; margin-bottom: 1.2rem; border: 1px solid rgba(212, 175, 55, 0.3);">
          <h4 style="margin: 0 0 0.6rem 0; color: #D4AF37; font-size: 0.9rem;">🎯 키워드 진입 난이도 분포 (${diffData}건)</h4>
          ${barsHtml}
          <div style="margin-top: 0.6rem; padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.04); border-radius: 4px; font-size: 0.82rem; font-weight: 600; color: rgba(255,255,255,0.85);">${warnMsg}</div>
          ${smartblockNote}
        </div>
      `;
    })()}

    <!-- ranking 분포 -->
    <h4 style="margin: 1rem 0 0.6rem 0; color: #D4AF37; font-size: 0.9rem;">📊 SERP 순위 분포 (전체 ${stats.totalEntries}건)</h4>
    <div style="background: rgba(0,0,0,0.2); padding: 0.8rem; border-radius: 6px; margin-bottom: 1.2rem;">
      ${rankBarHtml}
    </div>

    <!-- 미달 신호 + 강점 신호 (병렬) -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.2rem;">
      ${missingHtml ? `<div>
        <h4 style="margin: 0 0 0.4rem 0; color: #fbbf24; font-size: 0.9rem;">⚠️ 자주 미달하는 신호 top 5</h4>
        <ul style="margin: 0; padding-left: 1.5rem; font-size: 0.85rem;">${missingHtml}</ul>
      </div>` : ''}
      ${strengthHtml ? `<div>
        <h4 style="margin: 0 0 0.4rem 0; color: #4ade80; font-size: 0.9rem;">💪 자주 우위인 신호 top 5</h4>
        <ul style="margin: 0; padding-left: 1.5rem; font-size: 0.85rem;">${strengthHtml}</ul>
      </div>` : ''}
    </div>

    <!-- 최근 항목 테이블 -->
    ${recentHtml ? `<h4 style="margin: 1rem 0 0.4rem 0; color: rgba(255,255,255,0.8); font-size: 0.9rem;">🕓 최근 10건</h4>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
      <thead>
        <tr style="border-bottom: 2px solid rgba(212,175,55,0.3); color: rgba(255,255,255,0.6); font-size: 0.78rem;">
          <th style="padding: 0.4rem; text-align: left;">시간</th>
          <th style="padding: 0.4rem; text-align: left;">키워드</th>
          <th style="padding: 0.4rem; text-align: right;">내 점수</th>
          <th style="padding: 0.4rem; text-align: right;">상위 평균</th>
          <th style="padding: 0.4rem; text-align: right;">격차</th>
        </tr>
      </thead>
      <tbody>${recentHtml}</tbody>
    </table>` : ''}

    <p style="margin-top: 1rem; font-size: 0.72rem; color: rgba(255,255,255,0.4); text-align: center;">⚙️ 실측 데이터 — 환경설정 "자동 SERP 비교" ON 시 글 생성마다 자동 누적</p>
  `;
}

// ✅ [v2.10.188 Phase 3.7.1] 자동 SERP 결과 알림 카드 표시
//   글 생성 완료 후 자동 비교가 끝났을 때 사용자에게 *즉시* 결과 알림
//   - 미달 (below_median / below_25th): 빨강/주황 — "보완 필요" 버튼
//   - 양호 (above_median / near_median): 녹색 — "💪 상위권"
function showSerpAlertCard(autoSerp: any, type: 'warn' | 'good' = 'warn'): void {
  // 기존 알림 있으면 제거
  const existing = document.getElementById('serp-auto-alert-card');
  if (existing) existing.remove();

  const card = document.createElement('div');
  card.id = 'serp-auto-alert-card';
  const isGood = type === 'good';
  const bgColor = isGood
    ? 'linear-gradient(135deg, rgba(74, 222, 128, 0.18), rgba(34, 197, 94, 0.10))'
    : 'linear-gradient(135deg, rgba(239, 68, 68, 0.20), rgba(251, 191, 36, 0.12))';
  const borderColor = isGood ? '#4ade80' : '#fbbf24';
  const icon = isGood ? '💪' : '🔍';
  const titleText = isGood ? 'SERP 실측 비교 — 양호' : 'SERP 실측 비교 — 보완 필요';

  card.style.cssText = `
    position: fixed; top: 20px; left: 20px; z-index: 10001;
    background: ${bgColor};
    border: 2px solid ${borderColor};
    border-radius: 12px;
    padding: 1rem 1.2rem;
    max-width: 360px;
    color: #fff;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    animation: serpAlertSlideIn 0.4s ease-out;
    font-size: 0.85rem;
  `;

  const fixCount = autoSerp.topPriorityFix?.length || 0;
  const fixListHtml = !isGood && fixCount > 0
    ? `<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.15); font-size: 0.78rem; color: #fbbf24;">
        🎯 보완 우선순위 ${Math.min(2, fixCount)}건:
        <ul style="margin: 0.3rem 0 0 1.2rem; padding: 0;">
          ${(autoSerp.topPriorityFix || []).slice(0, 2).map((p: string) => `<li style="margin: 0.15rem 0;">${p.replace(/^[•·\-]\s*/, '').slice(0, 80)}</li>`).join('')}
        </ul>
      </div>`
    : '';

  // ✅ [v2.10.196] 난이도 tier 표시 (있을 때만)
  const difficultyHtml = autoSerp.difficulty ? (() => {
    const tierColors: Record<string, string> = {
      easy: '#4ade80',
      medium: '#fbbf24',
      hard: '#f97316',
      expert: '#ef4444',
    };
    const tierLabels: Record<string, string> = {
      easy: '🟢 진입 쉬움',
      medium: '🟡 진입 중간',
      hard: '🟠 진입 어려움',
      expert: '🔴 인플루언서 영역',
    };
    const tier = autoSerp.difficulty.tier;
    const tColor = tierColors[tier] || '#888';
    const tLabel = tierLabels[tier] || tier;
    return `<div style="margin-top: 0.4rem; padding: 0.4rem 0.6rem; background: ${tColor}1a; border-left: 3px solid ${tColor}; border-radius: 4px; font-size: 0.78rem;">
      <strong style="color: ${tColor};">${tLabel}</strong>
      <span style="color: rgba(255,255,255,0.7); font-size: 0.92em;"> · 인플루언서 ${Math.round(autoSerp.difficulty.influencerRatio * 100)}%${autoSerp.difficulty.hasSmartblock ? ' · AI 스마트블록 노출' : ''}</span>
    </div>`;
  })() : '';

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; gap: 0.5rem;">
      <div style="flex: 1;">
        <div style="font-weight: 700; color: ${borderColor}; margin-bottom: 0.3rem;">${icon} ${titleText}</div>
        <div style="font-size: 0.78rem; line-height: 1.4; color: rgba(255,255,255,0.92);">
          [<strong>${autoSerp.keyword}</strong>] 우리 <strong>${autoSerp.ourFinalScore}</strong>점 vs 상위 평균 <strong>${autoSerp.serpAvgFinalScore}</strong>점 (중앙값 ${autoSerp.serpMedianFinalScore})
        </div>
        ${difficultyHtml}
        ${fixListHtml}
        <button type="button" id="serp-alert-detail-btn" style="margin-top: 0.6rem; padding: 0.35rem 0.7rem; background: ${borderColor}; color: #1a1a1a; border: none; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 0.78rem;">📊 상세 보기</button>
      </div>
      <button type="button" id="serp-alert-close-btn" style="background: transparent; border: none; color: rgba(255,255,255,0.6); font-size: 1.2rem; cursor: pointer; padding: 0; line-height: 1;">×</button>
    </div>
  `;

  // 애니메이션 keyframe (1회만 inject)
  if (!document.getElementById('serp-alert-keyframes')) {
    const style = document.createElement('style');
    style.id = 'serp-alert-keyframes';
    style.textContent = `@keyframes serpAlertSlideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }`;
    document.head.appendChild(style);
  }

  document.body.appendChild(card);

  // 닫기 버튼
  card.querySelector('#serp-alert-close-btn')?.addEventListener('click', () => {
    card.remove();
  });

  // 상세 보기 버튼 — 자동 결과 데이터로 모달 표시 (IPC 호출 안 함, 캐시 활용)
  card.querySelector('#serp-alert-detail-btn')?.addEventListener('click', () => {
    showSerpDetailModalFromAutoData(autoSerp);
    card.remove();
  });

  // 양호인 경우 8초 후 자동 닫기 (미달은 유지 — 사용자 액션 필요)
  if (isGood) {
    setTimeout(() => {
      if (card.parentNode) card.remove();
    }, 8000);
  }
}

// 자동 SERP 결과 데이터로 상세 모달 표시 (IPC 호출 없이 캐시 데이터 사용)
function showSerpDetailModalFromAutoData(autoSerp: any): void {
  const modal = document.getElementById('serp-benchmark-modal') as HTMLElement | null;
  const content = document.getElementById('serp-benchmark-content') as HTMLElement | null;
  if (!modal || !content) return;

  const rankingColors: Record<string, string> = {
    above_median: '#4ade80',
    near_median: '#22d3ee',
    below_median: '#fbbf24',
    below_25th: '#ef4444',
  };
  const rankingColor = rankingColors[autoSerp.ranking] || '#888';

  const priorityHtml = (autoSerp.topPriorityFix || []).length > 0
    ? `<h3 style="margin: 1.2rem 0 0.5rem 0; color: #fbbf24;">🎯 우선순위 보완 항목</h3>
       <ol style="margin: 0; padding-left: 1.5rem;">${(autoSerp.topPriorityFix || []).map((p: string) => `<li style="margin: 0.3rem 0;">${p}</li>`).join('')}</ol>`
    : '';

  const strengthsHtml = (autoSerp.strengths || []).length > 0
    ? `<h3 style="margin: 1.2rem 0 0.5rem 0; color: #4ade80;">💪 강점 (상위 노출 평균 대비 우위)</h3>
       <ul style="margin: 0; padding-left: 1.5rem;">${(autoSerp.strengths || []).map((s: string) => `<li style="margin: 0.3rem 0;">${s}</li>`).join('')}</ul>`
    : '';

  content.innerHTML = `
    <div style="padding: 0.8rem; background: ${rankingColor}22; border: 1px solid ${rankingColor}; border-radius: 8px; margin-bottom: 1rem;">
      <strong style="color: ${rankingColor}; font-size: 1.05rem;">${autoSerp.summary}</strong>
    </div>
    <p style="margin: 0.5rem 0; color: #ccc; font-size: 0.88rem;">자동 SERP 비교 결과 (글 생성 직후 ${autoSerp.signalGapsCount || 0}개 신호 측정).</p>
    ${priorityHtml}
    ${strengthsHtml}
    <p style="margin-top: 1rem; padding-top: 0.6rem; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.75rem; color: #888;">
      ⚙️ 자동 캐시 데이터 — 신호별 상세 비교는 우측 "🔍 SERP 실측 비교" 버튼으로 새로 분석하세요 (10초)
    </p>
  `;
  modal.style.display = 'flex';
}

// ✅ [v2.10.185 Phase 3.5] SERP 실측 비교 UI 초기화
function initSerpBenchmarkUI(): void {
  const btn = document.getElementById('serp-benchmark-btn') as HTMLButtonElement | null;
  const status = document.getElementById('serp-benchmark-status') as HTMLElement | null;
  const modal = document.getElementById('serp-benchmark-modal') as HTMLElement | null;
  const closeBtn = document.getElementById('serp-benchmark-close') as HTMLButtonElement | null;
  const content = document.getElementById('serp-benchmark-content') as HTMLElement | null;
  if (!btn || !modal || !closeBtn || !content) return;

  closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  btn.addEventListener('click', async () => {
    const last = (window as any).__lastGeneratedContent;
    if (!last || !last.body) {
      if (status) status.textContent = '⚠️ 먼저 글을 생성해주세요';
      return;
    }

    // 키워드 추출: source.keyword > title 단어
    let keyword = last.keyword || '';
    if (!keyword && last.title) {
      const stripped = last.title.replace(/[\[\]【】\(\)（）]/g, ' ').trim();
      const tokens = stripped.split(/\s+/).filter((t: string) => t.length >= 2);
      keyword = tokens.slice(0, 3).join(' ');
    }
    if (!keyword) {
      const prompt_ = prompt('비교할 키워드를 입력하세요:');
      if (!prompt_) return;
      keyword = prompt_.trim();
    }

    btn.disabled = true;
    if (status) status.textContent = `🔍 "${keyword}" SERP 분석 중... (10초 내)`;

    try {
      const result = await (window as any).api.benchmarkSerp({
        keyword,
        ourBody: last.body,
        ourTitle: last.title || '',
        ourPrimaryKeyword: keyword,
        display: 10,
        mode: last.mode || 'seo',
      });

      if (!result.ok || !result.benchmark) {
        if (status) status.textContent = `❌ 실패: ${result.error || '알 수 없는 오류'}`;
        return;
      }

      // 모달 콘텐츠 렌더링
      const b = result.benchmark;
      const rankingColors: Record<string, string> = {
        above_median: '#4ade80',
        near_median: '#22d3ee',
        below_median: '#fbbf24',
        below_25th: '#ef4444',
      };
      const rankingColor = rankingColors[b.ranking] || '#888';

      const gapRowsHtml = b.signalGaps.map((g: any) => {
        const icon = g.recommendation === 'urgent' ? '🚨'
          : g.recommendation === 'improve' ? '⚠️'
          : g.recommendation === 'lead' ? '⭐'
          : '✓';
        const color = g.recommendation === 'urgent' ? '#ef4444'
          : g.recommendation === 'improve' ? '#fbbf24'
          : g.recommendation === 'lead' ? '#4ade80'
          : '#a3a3a3';
        return `<div style="padding: 0.5rem 0.75rem; margin: 0.35rem 0; background: rgba(255,255,255,0.04); border-left: 3px solid ${color}; border-radius: 4px;">
          <span style="color: ${color};">${icon}</span>
          <span style="margin-left: 0.4rem;">${g.message}</span>
        </div>`;
      }).join('');

      const priorityHtml = b.topPriorityFix.length > 0
        ? `<h3 style="margin: 1.2rem 0 0.5rem 0; color: #fbbf24;">🎯 우선순위 보완 항목</h3>
           <ol style="margin: 0; padding-left: 1.5rem;">${b.topPriorityFix.map((p: string) => `<li style="margin: 0.3rem 0;">${p}</li>`).join('')}</ol>`
        : '';

      const strengthsHtml = b.strengths.length > 0
        ? `<h3 style="margin: 1.2rem 0 0.5rem 0; color: #4ade80;">💪 강점 (상위 노출 평균 대비 우위)</h3>
           <ul style="margin: 0; padding-left: 1.5rem;">${b.strengths.map((s: string) => `<li style="margin: 0.3rem 0;">${s}</li>`).join('')}</ul>`
        : '';

      content.innerHTML = `
        <div style="padding: 0.8rem; background: ${rankingColor}22; border: 1px solid ${rankingColor}; border-radius: 8px; margin-bottom: 1rem;">
          <strong style="color: ${rankingColor}; font-size: 1.05rem;">${b.summary}</strong>
        </div>
        <h3 style="margin: 0.5rem 0; color: #D4AF37;">📊 신호별 비교 (우리 vs 상위 노출 평균)</h3>
        ${gapRowsHtml}
        ${priorityHtml}
        ${strengthsHtml}
        <p style="font-size: 0.78rem; color: #888; margin-top: 1.2rem;">⚙️ 실측 데이터 — 네이버 검색 API + qualityEvaluator 동일 신호로 측정 (추정 없음)</p>
      `;

      modal.style.display = 'flex';
      if (status) status.textContent = `✅ 분석 완료 — ${b.ranking === 'above_median' || b.ranking === 'near_median' ? '👍' : '⚠️'}`;
    } catch (err) {
      console.error('[SERP Benchmark]', err);
      if (status) status.textContent = `❌ ${(err as Error).message}`;
    } finally {
      btn.disabled = false;
    }
  });
}

