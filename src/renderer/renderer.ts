import type { StructuredContent, ImagePlan, HeadingPlan } from '../contentGenerator.js';
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
// ✅ [2026-01-25 모듈화] 이미지 비용 유틸리티
import { isCostRiskImageProvider, getCostRiskProviderLabel, getTodayKey } from './utils/imageCostUtils.js';
// ✅ [2026-01-25 모듈화] 쇼핑커넥트 유틸리티
import { isShoppingConnectModeActive, isAffiliateUrl, resolveAffiliateLink } from './utils/shoppingConnectUtils.js';
// ✅ [2026-01-25 모듈화] 스토리지 유틸리티
import { safeLocalStorageSetItem } from './utils/storageUtils.js';
// ✅ [2026-01-25 모듈화] Gemini 모델 동기화
import { initGeminiModelSync } from './utils/geminiModelSync.js';
// ✅ [2026-01-25 모듈화] 에러 유틸리티
import { translateGeminiError } from './utils/errorUtils.js';
// ✅ [2026-02-12] 반자동 전용 이미지 자동 수집 모듈
import { shouldRunAutoImageSearch, runAutoImageSearch, injectAutoCollectCheckboxUI } from './utils/semiAutoImageSearch.js';
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

import { onAccountLogout as accountLogout } from './modules/accountSettingsManager.js';

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

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-01-27] 완전자동 이미지 설정 읽기 헬퍼
// localStorage에 저장된 사용자 이미지 설정을 반환합니다.
// ✅ [2026-01-29] getter 함수 사용으로 일관성 개선
// ═══════════════════════════════════════════════════════════════════════════════
function getGlobalImageSettings() {
  // HeadingImageSettings.ts의 getter 함수 사용 (window에 노출됨)
  const w = window as any;
  // ✅ [2026-02-04 FIX] fullAutoImageSource를 우선 사용 (풀오토 모달에서 설정한 값)
  // globalImageSource는 이미지 관리 탭용, fullAutoImageSource는 풀오토 발행용
  return {
    imageSource: w.getFullAutoImageSource?.() || localStorage.getItem('fullAutoImageSource') || w.getGlobalImageSource?.() || localStorage.getItem('globalImageSource') || 'nano-banana-pro',
    imageStyle: w.getImageStyle?.() || localStorage.getItem('imageStyle') || 'realistic',
    imageRatio: w.getImageRatio?.() || localStorage.getItem('imageRatio') || '1:1',
    thumbnailRatio: w.getThumbnailRatio?.() || localStorage.getItem('thumbnailImageRatio') || '1:1',
    subheadingRatio: w.getSubheadingRatio?.() || localStorage.getItem('subheadingImageRatio') || '1:1',
    headingImageMode: w.getHeadingImageMode?.() || localStorage.getItem('headingImageMode') || 'all',
    thumbnailTextInclude: localStorage.getItem('thumbnailTextInclude') === 'true',
    textOnlyPublish: localStorage.getItem('textOnlyPublish') === 'true',
    lifestyleImageGenerate: localStorage.getItem('lifestyleImageGenerate') === 'true'
  };
}




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



function hydrateImageManagerFromImages(structuredContent: any, images: any[]): void {
  try {
    ImageManager.imageMap.clear();
    ImageManager.unsetHeadings.clear();
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  try {
    if (structuredContent?.headings) {
      ImageManager.setHeadings(structuredContent.headings);
    }
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  // ✅ 소제목 목록 추출 (heading 없는 이미지 매핑용)
  const headingTitles: string[] = [];
  if (structuredContent?.headings && Array.isArray(structuredContent.headings)) {
    structuredContent.headings.forEach((h: any) => {
      const title = typeof h === 'string' ? h : (h?.title || '');
      if (title.trim()) headingTitles.push(title.trim());
    });
  }

  const byHeading = new Map<string, any[]>();
  (Array.isArray(images) ? images : []).forEach((img: any, idx: number) => {
    let heading = String(img?.heading || '').trim();

    // ✅ [2026-03-09 FIX] 썸네일 이미지는 첫 번째 소제목에 매핑 (불러오기 시 썸네일 누락 방지)
    const isThumbnailImage = img?.isThumbnail === true ||
      heading === '썸네일' || heading === '🖼️ 썸네일' ||
      heading.toLowerCase() === 'thumbnail' || heading.toLowerCase() === 'thumbnail-bg';
    if (isThumbnailImage && headingTitles.length > 0) {
      heading = headingTitles[0];
      console.log(`[hydrateImageManager] 썸네일 이미지를 첫 번째 소제목에 매핑: "${heading}"`);
    }

    // ✅ heading이 없으면 인덱스 기반으로 소제목 매핑 (썸네일 등)
    if (!heading && idx < headingTitles.length) {
      heading = headingTitles[idx];
      console.log(`[hydrateImageManager] 이미지 ${idx}에 소제목 자동 매핑: "${heading}"`);
    }

    if (!heading) return;
    const list = byHeading.get(heading) || [];
    list.push({
      ...img,
      heading,
      timestamp: typeof img?.timestamp === 'number' ? img.timestamp : Date.now(),
    });
    byHeading.set(heading, list);
  });

  byHeading.forEach((list, heading) => {
    try {
      // ✅ [2026-02-12 P2 FIX #14] resolveHeadingKey 적용
      const normalizedKey = ImageManager.resolveHeadingKey(heading);
      ImageManager.imageMap.set(normalizedKey, list);
      ImageManager.unsetHeadings.delete(normalizedKey);
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
  });

  try {
    syncGlobalImagesFromImageManager();
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }
}

// ✅ [2026-02-12] 글 생성 후 소제목별 이미지 자동 수집 (모듈 위임)
// → 실제 로직은 ./utils/semiAutoImageSearch.ts에 모듈화됨
// → 체크박스 "글 생성 시 이미지 수집도 같이하기" ON일 때만 실행
async function autoSearchAndPopulateImages(
  structuredContent: any,
  mainKeyword: string,
  suppressModal?: boolean
): Promise<void> {
  // 가드: 체크박스 미체크, 풀오토, 쇼핑커넥트 등이면 실행 안 함
  if (!shouldRunAutoImageSearch(suppressModal)) return;

  try {
    await runAutoImageSearch(
      structuredContent,
      mainKeyword,
      appendLog,
      ImageManager,
      syncGlobalImagesFromImageManager
    );
  } catch (error) {
    console.error('[AutoImageSearch] ❌ 오류:', error);
    appendLog(`⚠️ 이미지 자동 수집 중 오류: ${(error as Error).message}`);
  }
}



function saveGeneratedPostFromData(
  structuredContent: any,
  images: any[] = [],
  overrides?: { category?: string; toneStyle?: string; ctaText?: string; ctaLink?: string; naverId?: string }
): string | null {
  try {
    console.log('[SavePost] 생성된 글 저장 시작...');

    if (!structuredContent) {
      console.error('[SavePost] ❌ 저장 실패: structuredContent가 없습니다.');
      return null;
    }

    const posts = loadGeneratedPosts();
    const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const categoryFromContent = String((structuredContent as any)?.articleType || (structuredContent as any)?.category || '').trim();
    // ✅ [2026-03-14 FIX] UI에서 선택된 콘텐츠 카테고리를 폴백으로 사용
    const categoryFromUI = (document.getElementById('unified-article-type') as HTMLSelectElement)?.value || '';
    // ✅ [2026-03-14 FIX] 영어 코드가 저장될 때 normalizeGeneratedPostCategoryKey로 한글 변환
    const rawCategory = String(overrides?.category || categoryFromContent || categoryFromUI || '').trim();
    const resolvedCategory = normalizeGeneratedPostCategoryKey(rawCategory);

    const normalizedImages = (images || []).map((img: any) => ({
      heading: img.heading || '',
      provider: img.provider || img.source || img.engine || 'unknown',
      filePath: img.filePath || '',
      previewDataUrl: img.previewDataUrl || img.url || img.filePath || '',
      url: img.url || img.link || img.previewDataUrl || img.filePath || '',
      thumbnail: img.thumbnail || '',
      savedToLocal: img.savedToLocal || false,
      isThumbnail: img.isThumbnail || false, // ✅ [2026-03-09 FIX] 썸네일 플래그 보존
    }));

    const post: GeneratedPost = {
      id: postId,
      title: structuredContent?.selectedTitle || '',
      content: structuredContent?.bodyPlain || structuredContent?.content || '',
      hashtags: structuredContent?.hashtags || [],
      headings: structuredContent?.headings || [],
      structuredContent: structuredContent,
      createdAt: now,
      updatedAt: now,
      images: normalizedImages.length > 0 ? normalizedImages : undefined,
      imageCount: normalizedImages.length || undefined,
      isFavorite: false,
      category: resolvedCategory || undefined,
      publishedUrl: undefined,
      publishedAt: undefined,
      isPublished: false,
      toneStyle: String(overrides?.toneStyle || structuredContent?.toneStyle || 'professional'),
      ctaText: String(overrides?.ctaText || ''),
      ctaLink: String(overrides?.ctaLink || ''),
      naverId: overrides?.naverId || getCurrentNaverId() || undefined, // ✅ [2026-03-11 FIX] 다중계정: overrides 우선, 단일계정: 현재 활성 계정
    };

    posts.unshift(post);
    if (posts.length > 100) posts.pop();

    // ✅ [2026-03-11 FIX] 전역 저장소(GENERATED_POSTS_KEY)에 통합 저장
    // 2026-01-24 마이그레이션으로 계정별 분리 폐지 → 전역 저장소에 저장 + post.naverId 필드로 계정 구분
    // overrides.naverId는 post 객체에만 기록하고, 저장소 키는 항상 전역 사용
    const storageKey = GENERATED_POSTS_KEY;
    console.log(`[SavePost] 저장소: ${storageKey}, naverId: ${post.naverId || '(미지정)'}`);
    const saveSuccess = safeLocalStorageSetItem(storageKey, JSON.stringify(posts));

    if (!saveSuccess) {
      console.error('[SavePost] ❌ localStorage 저장 실패!');
      return null;
    }

    // ✅ [Bug Fix] 저장 검증
    try {
      const verifyPosts = loadGeneratedPosts();
      const saved = verifyPosts.find((p: any) => p.id === postId);
      if (!saved) {
        console.error('[SavePost] ❌ 저장 검증 실패: 저장된 글을 찾을 수 없습니다.');
        return null;
      }
      console.log(`[SavePost] ✅ 저장 검증 성공 (ID: ${postId}, 제목: ${post.title?.substring(0, 20)}...)`);
    } catch (verifyErr) {
      console.error('[SavePost] ⚠️ 저장 검증 중 오류:', verifyErr);
    }

    // ✅ UI 갱신
    try {
      refreshGeneratedPostsList();
      console.log('[SavePost] ✅ 생성된 글 목록 UI 갱신 완료');
    } catch (refreshErr) {
      console.error('[SavePost] ⚠️ UI 갱신 실패:', refreshErr);
    }

    console.log(`[SavePost] ✅ 저장 완료 (ID: ${postId})`);
    return postId;
  } catch (error) {
    console.error('[SavePost] ❌ 생성된 글 저장 실패(다계정):', error);
    return null;
  }
}


// toastManager 호환을 위한 래퍼 (기존 코드와의 호환성 유지)
async function runUiActionLockedCompat<T>(key: string, message: string, fn: () => Promise<T>): Promise<T | null> {
  return runUiActionLocked(key, message, fn, toastManager);
}




async function ensureExternalApiCostConsent(provider: string): Promise<boolean> {
  if (!window.api || typeof window.api.getConfig !== 'function' || typeof window.api.saveConfig !== 'function') {
    return true;
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

  // ✅ 나노 바나나 프로 / Fal.ai (FLUX) 전용 플랜 선택 로직
  if (provider === 'nano-banana-pro' || provider === 'falai') {
    // 플랜이 이미 설정되어 있으면 통과
    if (config.geminiPlanType) {
      return true;
    }

    // ✅ 보안 강화: 라이선스 타입 확인 (IPC로 main process에 요청)
    let isFreeLicense = false;
    try {
      const result = await window.api.getLicense();
      isFreeLicense = result?.license?.licenseType === 'free';
    } catch {
      // 라이선스 확인 실패 시 안전하게 free로 간주
      isFreeLicense = true;
    }

    // 무료 라이선스면 팝업 없이 바로 'free'로 설정
    if (isFreeLicense) {
      await window.api.saveConfig({
        ...config,
        geminiPlanType: 'free',
        geminiImageDailyCount: 0,
        geminiImageLastReset: new Date().toISOString().split('T')[0]
      });
      console.log('[Security] 무료 라이선스 감지 → geminiPlanType을 자동으로 "free"로 설정');
      return true;
    }

    // 모달 생성 및 사용자 응답 대기 (유료 라이선스 사용자만 여기 도달)
    return new Promise<boolean>((resolve) => {
      // 오버레이
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed; inset:0; z-index: 999999; background: rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; padding: 1rem; backdrop-filter: blur(4px);';

      const modal = document.createElement('div');
      modal.style.cssText = 'width: min(500px, 90vw); background: var(--bg-primary); border: 1px solid var(--border-light); border-radius: 16px; box-shadow: 0 25px 50px rgba(0,0,0,0.25); overflow:hidden; animation: modal-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);';

      modal.innerHTML = `
        <div style="background: linear-gradient(135deg, #FFC107 0%, #FF9800 100%); padding: 1.5rem; text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">🍌</div>
          <h2 style="margin: 0; color: #fff; font-size: 1.5rem; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">나노 바나나 프로<br>사용자 플랜 확인</h2>
        </div>
        <div style="padding: 1.5rem;">
          <p style="margin: 0 0 1.5rem; color: var(--text-strong); font-size: 1.05rem; line-height: 1.6; text-align: center;">
            <b style="color: #FF9800;">Gemini API</b>를 사용하여 고품질 이미지를 생성합니다.<br>
            사용 중인 API 키의 <b>요금제(플랜)</b>를 선택해주세요.
          </p>
          
          <div style="background: var(--bg-secondary); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; font-size: 0.9rem; color: var(--text-muted);">
            <ul style="margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.5rem;">
              <li><b>무료 사용자:</b> 하루 사용량이 제한됩니다. (약 45장)</li>
              <li><b>유료 사용자:</b> 제한 없이 계속 사용할 수 있습니다.</li>
            </ul>
          </div>

          <div style="display: flex; gap: 0.75rem; flex-direction: column;">
            <button id="btn-paid-plan" style="padding: 1rem; border: 2px solid #ddd; border-radius: 12px; background: white; color: #333; cursor: pointer; font-weight: 700; font-size: 1rem; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
              <span>💳</span> 저는 <b>유료 플랜</b> 사용자입니다
            </button>
            <button id="btn-free-plan" style="padding: 1rem; border: none; border-radius: 12px; background: #FF9800; color: white; cursor: pointer; font-weight: 700; font-size: 1rem; transition: all 0.2s; box-shadow: 0 4px 6px rgba(255, 152, 0, 0.25);">
              <span>🆓</span> 저는 <b>무료 사용자</b>입니다
            </button>
          </div>
          <div style="margin-top: 1rem; text-align: center;">
           <button id="btn-cancel" style="background: none; border: none; color: var(--text-muted); text-decoration: underline; cursor: pointer; font-size: 0.9rem;">취소하고 다른 생성기 사용하기</button>
          </div>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // 스타일 애니메이션 추가
      const style = document.createElement('style');
      style.innerHTML = `
        @keyframes modal-pop { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        #btn-paid-plan:hover { border-color: #4CAF50; color: #4CAF50; background: #f0fdf4; transform: translateY(-2px); }
        #btn-free-plan:hover { background: #f57c00; transform: translateY(-2px); box-shadow: 0 6px 12px rgba(255, 152, 0, 0.3); }
      `;
      document.head.appendChild(style);

      // 핸들러
      const saveAndClose = async (type: 'free' | 'paid') => {
        try {
          await window.api.saveConfig({
            ...config,
            geminiPlanType: type,
            // 날짜/카운트 초기화
            geminiImageDailyCount: 0,
            geminiImageLastReset: new Date().toISOString().split('T')[0]
          });
          toastManager.success(`플랜이 [${type === 'free' ? '무료' : '유료'}]로 설정되었습니다.`);
          resolve(true); // 성공
        } catch (e) {
          console.error(e);
          resolve(false);
        } finally {
          overlay.remove();
          style.remove();
        }
      };

      document.getElementById('btn-paid-plan')?.addEventListener('click', () => saveAndClose('paid'));
      document.getElementById('btn-free-plan')?.addEventListener('click', () => saveAndClose('free'));
      document.getElementById('btn-cancel')?.addEventListener('click', () => {
        overlay.remove();
        style.remove();
        resolve(false); // 취소
      });
    });
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
  // ✅ [2026-02-11 FIX] provider 결정 우선순위: 전달값 → fullAutoImageSource → globalImageSource → 'nano-banana-pro'
  console.log(`[generateImagesWithCostSafety] 📥 전달받은 provider: "${String(options?.provider || '').trim()}"`);
  const provider = String(options?.provider || '').trim();

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

  // ✅ [2026-03-16] thumbnailTextInclude 자동 주입 — 풀오토 등 모든 발행 모드에서 텍스트 오버레이 적용
  if (options.thumbnailTextInclude === undefined) {
    const savedThumbnailText = localStorage.getItem('thumbnailTextInclude') === 'true';
    options.thumbnailTextInclude = savedThumbnailText;
    console.log(`[Renderer] 🔤 thumbnailTextInclude 자동 주입: ${savedThumbnailText}`);
  }

  // ✅ [핵심 수정] 호출자가 isShoppingConnect를 명시적으로 전달했으면 그 값 사용
  // 전달되지 않았으면 UI 상태(체크박스) 확인
  const isShoppingConnect = options.isShoppingConnect === true || isShoppingConnectModeActive();
  options.isShoppingConnect = isShoppingConnect; // 메인 프로세스에도 전달

  console.log(`[Renderer] 🛒 isShoppingConnect 결정: ${isShoppingConnect} (전달값: ${options.isShoppingConnect}, UI: ${isShoppingConnectModeActive()})`);

  if (isShoppingConnect) {
    // ✅ [FIX] 빈 배열도 체크: collectedImages가 없거나 빈 배열이면 currentStructuredContent.images 사용
    const hasCollectedImages = options.collectedImages && Array.isArray(options.collectedImages) && options.collectedImages.length > 0;
    const hasStructuredImages = currentStructuredContent?.images && Array.isArray(currentStructuredContent.images) && currentStructuredContent.images.length > 0;

    if (!hasCollectedImages && hasStructuredImages) {
      options.collectedImages = (currentStructuredContent as any).images;
      console.log(`[Renderer] 🛒 쇼핑커넥트: ${(currentStructuredContent as any).images.length}개 수집 이미지 자동 주입`);
    } else if (hasCollectedImages) {
      console.log(`[Renderer] 🛒 쇼핑커넥트: ${options.collectedImages.length}개 수집 이미지 전달됨`);
    } else {
      // ✅ [2026-02-02 FIX] 수집된 이미지 없어도 AI 이미지 생성으로 정상 진행
      // 이 로그 이후 AI 이미지 생성이 정상적으로 호출되어야 함
      console.log(`[Renderer] ⚠️ 쇼핑커넥트: 수집된 이미지 없음 → AI 이미지 생성으로 진행`);
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
    return window.api.generateImages(options);
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

      try {
        // ✅ [2026-03-11 FIX] 이미지 생성 API 타임아웃 8분→12분 (원래 엔진 재시도 3회 + 폴백 엔진 여유)
        // 개별 API 90초 × 이미지 5개 / 병렬 2개 = ~225초 + 재시도 3회 여유 = ~12분
        const IMAGE_API_TIMEOUT = 12 * 60 * 1000; // 12분
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
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

                // ✅ [2026-02-27 NEW] 실시간 이미지 그리드 업데이트 — 플레이스홀더를 실제 이미지로 교체
                if (image && progressModal && typeof progressModal.updateSingleImage === 'function') {
                  const imgSrc = image.filePath || image.url || image.previewDataUrl || '';
                  if (imgSrc) {
                    progressModal.updateSingleImage(index, {
                      url: imgSrc,
                      filePath: image.filePath || '',
                      heading: image.heading || `이미지 ${index + 1}`,
                    }, total);
                  }
                }

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
          window.api.generateImages(options),
          timeoutPromise
        ]);

        // ✅ [2026-02-13 SPEED] 리스너 정리
        if (cleanupImageListener) { try { cleanupImageListener(); } catch { } }

        return result;
      } catch (e) {
        // ✅ [2026-02-13 SPEED] 에러/타임아웃 시에도 리스너 반드시 정리 (좀비 리스너 방지)
        if (cleanupImageListener) { try { cleanupImageListener(); } catch { } }
        await reserve.rollback();
        console.error('[Renderer] ❌ 이미지 생성 실패/타임아웃:', (e as Error).message);

        // ✅ [2026-02-13 FIX] 타임아웃 시 main process에 abort 신호 전달 (orphan 작업 방지)
        if ((e as Error).message?.includes('타임아웃')) {
          try {
            if (window.api && typeof (window.api as any).abortImageGeneration === 'function') {
              (window.api as any).abortImageGeneration();
              console.log('[Renderer] 🛑 타임아웃 → main process에 이미지 생성 중단 신호 전달');
            }
          } catch (abortErr) {
            console.warn('[Renderer] ⚠️ abort 신호 전달 실패:', abortErr);
          }
        }

        throw e;
      }
    }
  );

  if (locked === null) {
    throw new Error('이미지 생성이 이미 진행 중입니다.');
  }
  return locked;
}

function syncGlobalImagesFromImageManager(): void {
  try {
    ImageManager.syncGeneratedImagesArray();
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  const managerAllImages = ImageManager.getAllImages();
  const existingAllImages = (window as any).imageManagementGeneratedImages;

  const getKey = (img: any): string => {
    const raw = img?.url || img?.filePath || img?.previewDataUrl || '';
    return toFileUrlMaybe(String(raw || '').trim());
  };

  // ✅ [2026-02-11 FIX] ImageManager(최신) 데이터가 항상 우선 (이미지 관리 탭 변경/GIF 교체 반영)
  let allImages = managerAllImages;
  try {
    if (Array.isArray(existingAllImages) && existingAllImages.length > 0) {
      const existingList = Array.isArray(existingAllImages) ? existingAllImages : [];
      const merged: any[] = [];
      const seen = new Set<string>();

      // ImageManager(최신) 데이터를 먼저 추가
      managerAllImages.forEach((img: any) => {
        const k = getKey(img);
        if (!k) return;
        merged.push(img);
        seen.add(k);
      });

      // existingList에서 ImageManager에 없는 항목만 보충
      existingList.forEach((img: any) => {
        const k = getKey(img);
        if (!k) return;
        if (seen.has(k)) return;
        merged.push(img);
        seen.add(k);
      });

      allImages = merged;
    }
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  // ✅ ImageManager에서 가져온 최신 이미지 데이터를 사용 (GIF 포함)
  (window as any).imageManagementGeneratedImages = allImages;
  (window as any).generatedImages = allImages;

  try {
    displayGeneratedImages(allImages as any);
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  try {
    // ✅ 작은 그리드 업데이트: allImages 전달 (기존 perHeadingImages는 오래된 데이터일 수 있음)
    updatePromptItemsWithImages(allImages as any);
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  try {
    ImageManager.updateHeadingAnalysisPreview();
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }
}

function filterImagesForPublish(structuredContent: any, images: any[]): any[] {
  const headings = Array.isArray(structuredContent?.headings) ? structuredContent.headings : [];
  const byNorm = new Map<string, { title: string; index: number }>();
  const byTitle = new Map<string, { title: string; index: number }>();

  headings.forEach((h: any, idx: number) => {
    const title = typeof h === 'string' ? String(h || '').trim() : String(h?.title || h || '').trim();
    if (!title) return;
    byTitle.set(title, { title, index: idx });
    try {
      const n = normalizeHeadingKeyForVideoCache(title);
      if (n) byNorm.set(n, { title, index: idx });
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
  });

  // ✅ [2026-02-24 FIX] 썸네일 이미지를 분리하여 보존
  // structuredContent.headings에는 썸네일이 포함되어 있지 않으므로
  // 아래 heading 매칭 루프에서 누락됨 → 미리 추출하여 결과 맨 뒤에 배치
  const thumbnailImages = (images || []).filter((img: any) => {
    if (img?.isThumbnail === true) return true;
    const h = String(img?.heading || '').trim().toLowerCase();
    return h.includes('썸네일') || h.includes('thumbnail');
  });
  // ✅ [2026-02-24 FIX] 썸네일에 isThumbnail 플래그 명시적 설정
  thumbnailImages.forEach((img: any) => { img.isThumbnail = true; });
  if (thumbnailImages.length > 0) {
    console.log(`[filterImagesForPublish] ✅ 썸네일 이미지 ${thumbnailImages.length}개 보존 (뒤에 배치)`);
  }

  // ✅ [2026-02-24 FIX] 썸네일 이미지 filePath 집합 (중복 방지용)
  const thumbnailPathSet = new Set<string>();
  thumbnailImages.forEach((img: any) => {
    const p = img?.filePath || img?.url || img?.previewDataUrl;
    if (p) thumbnailPathSet.add(p);
  });

  const fallbackFromInput = new Map<string, any[]>();
  (images || []).forEach((img: any) => {
    // ✅ [2026-02-24 FIX] 썸네일 이미지는 heading 매칭에서 제외 (중복 방지)
    const imgPath = img?.filePath || img?.url || img?.previewDataUrl;
    if (imgPath && thumbnailPathSet.has(imgPath)) return;
    if (img?.isThumbnail === true) return;
    const h = String(img?.heading || '').trim().toLowerCase();
    if (h.includes('썸네일') || h.includes('thumbnail')) return;

    const rawHeading = String(img?.heading || '').trim();
    if (!rawHeading) return;

    let resolved: { title: string; index: number } | undefined = byTitle.get(rawHeading);
    if (!resolved) {
      try {
        const n = normalizeHeadingKeyForVideoCache(rawHeading);
        if (n) resolved = byNorm.get(n);
      } catch (e) {
        console.warn('[renderer] catch ignored:', e);
      }
    }
    if (!resolved) return;

    const list = fallbackFromInput.get(resolved.title) || [];
    list.push({
      ...img,
      heading: resolved.title,
      headingIndex: typeof img?.headingIndex === 'number' ? img.headingIndex : resolved.index,
    });
    fallbackFromInput.set(resolved.title, list);
  });

  const result: any[] = [];
  headings.forEach((h: any, idx: number) => {
    const title = typeof h === 'string' ? String(h || '').trim() : String(h?.title || h || '').trim();
    if (!title) return;

    let isUnset = false;
    try {
      isUnset = ImageManager.isHeadingUnset(title);
    } catch {
      isUnset = false;
    }
    if (isUnset) {
      // ✅ 영상(또는 영상→GIF) 모드: 소제목이 unset이어도 해당 소제목에 등록된 모든 이미지를 발행에 포함
      // (기존: gif-from-video만 포함 → 수정: 모든 이미지 포함)
      let headingImages: any[] = [];
      try {
        headingImages = ImageManager.getImages(title) || [];
      } catch {
        headingImages = [];
      }

      // ✅ 이미지가 하나라도 있으면 모두 포함 (GIF 우선 정렬)
      if (Array.isArray(headingImages) && headingImages.length > 0) {
        // GIF를 맨 앞으로 정렬
        const gifs = headingImages.filter((img: any) => String(img?.provider || '') === 'gif-from-video');
        const others = headingImages.filter((img: any) => String(img?.provider || '') !== 'gif-from-video');
        const sorted = [...gifs, ...others];

        sorted.forEach((img: any) => {
          result.push({
            ...img,
            heading: title,
            headingIndex: typeof img?.headingIndex === 'number' ? img.headingIndex : idx,
            originalIndex: idx + 1, // ✅ [2026-03-26 FIX] 썬네일(0) 다음부터 1-based — editorHelpers originalIndex 매칭용
          });
        });
      }

      return;
    }

    let headingImages: any[] = [];
    let primary: any = null;
    try {
      headingImages = ImageManager.getImages(title) || [];
      primary = ImageManager.getImage(title);
    } catch {
      headingImages = [];
      primary = null;
    }

    // ✅ [2026-03-03 FIX] ImageManager 반환 이미지에서 thumbnail 중복 제거
    // thumbnail이 소제목 heading에도 등록되어 있으면 result와 thumbnailImages 양쪽에 중복 포함되는 버그 방지
    const dedupedHeadingImages = (Array.isArray(headingImages) ? headingImages : []).filter((img: any) => {
      if (img?.isThumbnail === true) return false;
      const h = String(img?.heading || '').trim().toLowerCase();
      if (h.includes('썸네일') || h.includes('thumbnail')) return false;
      const imgPath = img?.filePath || img?.url || img?.previewDataUrl;
      if (imgPath && thumbnailPathSet.has(imgPath)) return false;
      return true;
    });

    const ordered = (() => {
      const list = dedupedHeadingImages;
      const primaryKey = getStableImageKey(primary);
      if (!primaryKey) return list;
      const p = list.find((img: any) => getStableImageKey(img) === primaryKey);
      if (!p) return list;
      const rest = list.filter((img: any) => getStableImageKey(img) !== primaryKey);
      return [p, ...rest];
    })();

    if (Array.isArray(ordered) && ordered.length > 0) {
      ordered.forEach((img: any) => {
        result.push({
          ...img,
          heading: title,
          headingIndex: typeof img?.headingIndex === 'number' ? img.headingIndex : idx,
          originalIndex: idx + 1, // ✅ [2026-03-26 FIX] 썬네일(0) 다음부터 1-based — editorHelpers originalIndex 매칭용
        });
      });
      return;
    }

    const fallback = fallbackFromInput.get(title);
    if (Array.isArray(fallback) && fallback.length > 0) {
      fallback.forEach((img: any) => {
        result.push({
          ...img,
          heading: title,
          headingIndex: typeof img?.headingIndex === 'number' ? img.headingIndex : idx,
          originalIndex: idx + 1, // ✅ [2026-03-26 FIX] 썬네일(0) 다음부터 1-based — editorHelpers originalIndex 매칭용
        });
      });
    }
  });

  // ✅ [2026-03-04 FIX v5] 썸네일을 맨 앞에 배치하여 네이버 에디터에 첫 번째로 삽입
  // 기존: 맨 뒤 배치 → 네이버가 마지막 이미지를 대표사진으로 선택하는 버그 발생
  // 수정: 맨 앞 배치 → 네이버가 첫 번째 이미지를 대표사진으로 정상 인식
  return [...thumbnailImages, ...result];
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


// 전역 진행상황 모달 인스턴스
let progressModal: ProgressModal | null = null;

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



// DOM 요소 캐시 (성능 최적화)
const UnifiedDOMCache = {
  // 통합 탭 요소들
  unifiedGenerator: null as HTMLSelectElement | null,
  unifiedToneStyle: null as HTMLSelectElement | null,
  unifiedImageSource: null as HTMLSelectElement | null,
  unifiedUrlInputs: null as NodeListOf<HTMLInputElement> | null,

  // 캐시 초기화
  init() {
    this.unifiedGenerator = document.getElementById('unified-generator') as HTMLSelectElement;
    this.unifiedToneStyle = document.getElementById('unified-tone-style') as HTMLSelectElement; // ✅ 드롭다운에서 글톤 값 읽기 복원
    this.unifiedImageSource = document.getElementById('unified-image-source') as HTMLSelectElement;
  },

  // 캐시 갱신
  refresh() {
    this.unifiedUrlInputs = document.querySelectorAll('.unified-url-input') as NodeListOf<HTMLInputElement>;
  },

  // 안전한 getter
  getGenerator(): string {
    // ✅ [2026-02-22 FIX] unified-generator hidden input 우선, 
    // 동기화 누락 시 primaryGeminiTextModel 라디오 버튼에서 직접 파생
    const hiddenValue = this.unifiedGenerator?.value;
    if (hiddenValue && hiddenValue !== 'gemini') {
      return hiddenValue; // 명시적으로 설정된 값 (perplexity, openai, claude 등)
    }

    // ✅ 방어 코드: hidden input이 'gemini' 또는 빈 값이면 라디오 버튼 직접 확인
    const selectedModel = (document.querySelector('input[name="primaryGeminiTextModel"]:checked') as HTMLInputElement)?.value;
    const modelToProvider: Record<string, string> = {
      'perplexity-sonar': 'perplexity',
      'openai-gpt4o': 'openai',
      'openai-gpt4o-mini': 'openai',
      'openai-gpt41': 'openai',
      'claude-haiku': 'claude',
      'claude-sonnet': 'claude',
      'claude-opus': 'claude',
    };
    const derivedProvider = modelToProvider[selectedModel];
    if (derivedProvider) {
      // hidden input도 동기화
      if (this.unifiedGenerator) {
        this.unifiedGenerator.value = derivedProvider;
      }
      return derivedProvider;
    }

    return hiddenValue || 'gemini';
  },

  getToneStyle(context?: 'ma' | 'continuous' | 'normal'): string {
    // 1. 컨텍스트별 전용 셀렉트 확인
    if (context === 'ma') {
      const maSel = document.getElementById('ma-tone-style-select') as HTMLSelectElement;
      if (maSel) return maSel.value;
    } else if (context === 'continuous') {
      const contSel = document.getElementById('continuous-tone-style-select') as HTMLSelectElement;
      if (contSel) return contSel.value;
    }

    // 2. 기본 드롭다운 확인
    if (this.unifiedToneStyle) return this.unifiedToneStyle.value;

    // 3. 최후의 수단 (DOM 직접 확인)
    const fallback = document.getElementById('unified-tone-style') as HTMLSelectElement;
    return fallback?.value || 'professional';
  },

  getImageSource(): string {
    // ✅ [2026-02-02] 풀오토/연속/다중계정 발행 전용 이미지 소스
    // 이미지 관리 탭의 globalImageSource와 완전히 분리됨
    const VALID_AI_SOURCES = ['nano-banana-pro', 'deepinfra', 'openai-image', 'leonardoai', 'imagefx', 'local-folder'];

    // 1순위: fullAutoImageSource (풀오토 전용)
    const fullAutoSource = localStorage.getItem('fullAutoImageSource');
    if (fullAutoSource && fullAutoSource !== 'undefined' && fullAutoSource !== 'null' && VALID_AI_SOURCES.includes(fullAutoSource)) {
      console.log(`[UnifiedDOMCache] 🎨 fullAutoImageSource 사용 (풀오토 전용): ${fullAutoSource}`);
      return fullAutoSource;
    }
    // ✅ [2026-02-18 FIX] 오염된 값("null", "undefined" 등)이 있으면 정리
    if (fullAutoSource && (fullAutoSource === 'null' || fullAutoSource === 'undefined' || !VALID_AI_SOURCES.includes(fullAutoSource))) {
      console.warn(`[UnifiedDOMCache] ⚠️ fullAutoImageSource 오염 값 제거: "${fullAutoSource}"`);
      localStorage.removeItem('fullAutoImageSource');
    }

    // ✅ [2026-02-18 FIX] 2순위: globalImageSource (이미지 관리 탭 설정)
    // 이전: globalImageSource를 전혀 확인하지 않아서 "deepinfra"가 설정되어 있어도 무시됨
    const globalSource = localStorage.getItem('globalImageSource');
    if (globalSource && globalSource !== 'undefined' && globalSource !== 'null' && VALID_AI_SOURCES.includes(globalSource)) {
      console.log(`[UnifiedDOMCache] 🎨 globalImageSource 폴백 사용: ${globalSource}`);
      // fullAutoImageSource도 동기화하여 다음 번에는 바로 사용
      localStorage.setItem('fullAutoImageSource', globalSource);
      return globalSource;
    }

    // 3순위: 선택된 버튼 확인
    const selectedBtn = document.querySelector('.unified-img-source-btn.selected');
    if (selectedBtn) {
      const btnSource = selectedBtn.getAttribute('data-source') || 'nano-banana-pro';
      console.log(`[UnifiedDOMCache] 🎨 DOM 버튼 선택됨, data-source = "${btnSource}"`);
      return btnSource;
    }

    // 4순위: 드롭다운(select) 확인
    if (this.unifiedImageSource) {
      const selectVal = this.unifiedImageSource.value || 'nano-banana-pro';
      console.log(`[UnifiedDOMCache] 🎨 드롭다운 값 = "${selectVal}"`);
      return selectVal;
    }

    // 5순위: 최후의 보루 (DOM 직접 확인)
    const fallbackSelect = document.getElementById('unified-image-source') as HTMLSelectElement;
    const finalVal = fallbackSelect?.value || 'nano-banana-pro';
    console.log(`[UnifiedDOMCache] ⚠️ 최후의 보루: fallback = "${finalVal}"`);
    return finalVal;
  },

  getRealCategory(): string | undefined {
    return (document.getElementById('real-blog-category-select') as HTMLSelectElement)?.value || undefined;
  },

  // ✅ [2026-02-11 FIX] 카테고리 이름 반환 (발행 모달에서 이름으로 매칭하므로 value가 아닌 text 필요)
  // ✅ [2026-02-16 FIX] 플레이스홀더 옵션(value="") 제외 — selectedIndex === 0이고 value가 비어있으면 undefined 반환
  getRealCategoryName(): string | undefined {
    const select = document.getElementById('real-blog-category-select') as HTMLSelectElement;
    if (select && select.selectedIndex >= 0) {
      const selectedOption = select.options[select.selectedIndex];
      // 플레이스홀더 옵션(value="")은 제외
      if (!selectedOption?.value) {
        return undefined;
      }
      return selectedOption?.text?.trim() || undefined;
    }
    return undefined;
  }
};

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

  // 환경설정 버튼
  if (settingsButton) {
    settingsButton.onclick = function (e) {
      console.log('[Button] ===== 환경설정 버튼 클릭 시작 =====');
      console.log('[Button] 이벤트 객체:', e);
      console.log('[Button] 이벤트 타입:', e.type);
      console.log('[Button] 이벤트 타겟:', e.target);
      console.log('[Button] 이벤트 currentTarget:', e.currentTarget);

      e.preventDefault();
      e.stopPropagation();

      console.log('[Button] preventDefault와 stopPropagation 완료');

      if (settingsModal) {
        console.log('[Button] settingsModal 찾음, 표시 시도');
        console.log('[Button] 설정 전 aria-hidden:', settingsModal.getAttribute('aria-hidden'));
        console.log('[Button] 설정 전 display:', settingsModal.style.display);

        settingsModal.setAttribute('aria-hidden', 'false');
        settingsModal.style.display = 'flex';

        console.log('[Button] 설정 후 aria-hidden:', settingsModal.getAttribute('aria-hidden'));
        console.log('[Button] 설정 후 display:', settingsModal.style.display);

        // 강제로 스타일 적용
        settingsModal.style.position = 'fixed';
        settingsModal.style.top = '0';
        settingsModal.style.left = '0';
        settingsModal.style.width = '100%';
        settingsModal.style.height = '100%';
        settingsModal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        settingsModal.style.zIndex = '9999';

        console.log('[Button] 강제 스타일 적용 완료');
        console.log('[Button] 최종 computed style:');
        const computedStyle = window.getComputedStyle(settingsModal);
        console.log('  display:', computedStyle.display);
        console.log('  visibility:', computedStyle.visibility);
        console.log('  z-index:', computedStyle.zIndex);

        // 모달 내용도 확인
        const modalContent = settingsModal.querySelector('.modal-content') as HTMLElement;
        console.log('[Button] modal-content 존재:', !!modalContent);
        if (modalContent) {
          modalContent.style.backgroundColor = 'white';
          modalContent.style.borderRadius = '8px';
          modalContent.style.padding = '20px';
          modalContent.style.maxWidth = '500px';
          modalContent.style.width = '90%';
          modalContent.style.maxHeight = '80vh';
          modalContent.style.overflow = 'auto';
        }

        console.log('[Button] 환경설정 모달 표시 작업 완료');
      } else {
        console.error('[Button] settingsModal이 존재하지 않음');
      }
    };

    settingsButton.addEventListener('click', function (e) {
      console.log('[Button] 환경설정 버튼 클릭됨 (addEventListener)');
      console.log('[Button] addEventListener 이벤트 객체:', e);
    });

    console.log('[Setup] 환경설정 버튼 이벤트 리스너 연결됨');
  } else {
    console.debug('[Setup] settingsButton이 존재하지 않음 (레거시 - 무시 가능)');
  }

  // 외부유입 버튼
  if (externalLinksButton) {
    externalLinksButton.onclick = async function (e) {
      console.log('[Button] ===== 외부유입 버튼 클릭 시작 =====');
      console.log('[Button] 이벤트 객체:', e);
      console.log('[Button] 이벤트 타입:', e.type);
      console.log('[Button] 이벤트 타겟:', e.target);
      console.log('[Button] 이벤트 currentTarget:', e.currentTarget);

      e.preventDefault();
      e.stopPropagation();

      console.log('[Button] preventDefault와 stopPropagation 완료');

      try {
        const isPackaged = await window.api.isPackaged();
        console.log('[Button] isPackaged:', isPackaged);

        if (!isPackaged) {
          console.log('[Button] 개발 모드로 처리');
          if (externalLinksModal) {
            console.log('[Button] externalLinksModal 찾음, 표시 시도');
            console.log('[Button] 설정 전 aria-hidden:', externalLinksModal.getAttribute('aria-hidden'));
            console.log('[Button] 설정 전 display:', externalLinksModal.style.display);

            externalLinksModal.setAttribute('aria-hidden', 'false');
            externalLinksModal.style.display = 'flex';

            console.log('[Button] 설정 후 aria-hidden:', externalLinksModal.getAttribute('aria-hidden'));
            console.log('[Button] 설정 후 display:', externalLinksModal.style.display);

            // 강제로 스타일 적용
            externalLinksModal.style.position = 'fixed';
            externalLinksModal.style.top = '0';
            externalLinksModal.style.left = '0';
            externalLinksModal.style.width = '100%';
            externalLinksModal.style.height = '100%';
            externalLinksModal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            externalLinksModal.style.zIndex = '9999';

            console.log('[Button] 강제 스타일 적용 완료');
            console.log('[Button] 최종 computed style:');
            const computedStyle = window.getComputedStyle(externalLinksModal);
            console.log('  display:', computedStyle.display);
            console.log('  visibility:', computedStyle.visibility);
            console.log('  z-index:', computedStyle.zIndex);

            // 모달 내용도 확인
            const modalContent = externalLinksModal.querySelector('.modal-content') as HTMLElement;
            console.log('[Button] modal-content 존재:', !!modalContent);
            if (modalContent) {
              modalContent.style.backgroundColor = 'white';
              modalContent.style.borderRadius = '8px';
              modalContent.style.padding = '20px';
              modalContent.style.maxWidth = '500px';
              modalContent.style.width = '90%';
              modalContent.style.maxHeight = '80vh';
              modalContent.style.overflow = 'auto';
            }

            console.log('[Button] 외부유입 모달 표시 작업 완료 (개발 모드)');
          } else {
            console.error('[Button] externalLinksModal이 존재하지 않음');
          }
          return;
        }

        // ✅ 배포 모드에서도 외부유입 모달 바로 표시 (라이선스 체크 완화)
        console.log('[Button] 배포 모드 - 외부유입 모달 표시');

        // 라이선스 확인은 로그만 남기고 모달은 항상 열기
        try {
          const licenseResult = await window.api.getLicense();
          console.log('[Button] 라이선스 결과:', licenseResult);

          if (licenseResult.license && licenseResult.license.expiresAt) {
            const expirationDate = new Date(licenseResult.license.expiresAt);
            console.log('[Button] 라이선스 만료일:', expirationDate.toLocaleDateString('ko-KR'));
          } else {
            console.log('[Button] 라이선스 정보 없음 - 기본 모드로 진행');
          }
        } catch (licenseError) {
          console.warn('[Button] 라이선스 확인 실패, 기본 모드로 진행:', licenseError);
        }

        // ✅ 외부유입 모달 항상 표시
        if (externalLinksModal) {
          externalLinksModal.setAttribute('aria-hidden', 'false');
          externalLinksModal.style.display = 'flex';
          console.log('[Button] 외부유입 모달 표시됨');
        } else {
          console.error('[Button] externalLinksModal이 존재하지 않음');
        }
      } catch (error) {
        console.error('[Button] 오류 발생:', error);
        alert('외부유입 모달을 여는 중 오류가 발생했습니다.');
      }
    };

    console.log('[Setup] 외부유입 버튼 이벤트 리스너 연결됨');
  } else {
    console.debug('[Setup] externalLinksButton이 존재하지 않음 (레거시 - 무시 가능)');
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





/**
 
 * ✅ [100점 수정] 기존 저장된 글의 카테고리 마이그레이션
 * 영어 카테고리를 한글로 자동 통일
 */
function migratePostCategories(): number {
  try {
    const data = localStorage.getItem(GENERATED_POSTS_KEY);
    if (!data) return 0;

    const posts: GeneratedPost[] = JSON.parse(data);
    let migrated = 0;

    posts.forEach(post => {
      const oldCategory = post.category || post.articleType || '';
      const normalized = normalizeCategory(oldCategory);

      if (normalized && normalized !== post.category) {
        post.category = normalized;
        migrated++;
        console.log(`[Migration] "${post.title}" 카테고리: "${oldCategory}" → "${normalized}"`);
      }
    });

    if (migrated > 0) {
      localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
      console.log(`[Migration] ✅ ${migrated}개 글 카테고리 정규화 완료`);
    }

    return migrated;
  } catch (error) {
    console.error('[Migration] 카테고리 마이그레이션 실패:', error);
    return 0;
  }
}

// ✅ 앱 시작 시 마이그레이션 자동 실행
let categoryMigrationDone = false;
function ensureCategoryMigration(): void {
  if (categoryMigrationDone) return;
  categoryMigrationDone = true;
  const count = migratePostCategories();
  if (count > 0) {
    console.log(`[Migration] 🔄 ${count}개 글 카테고리가 한글로 통일되었습니다.`);
  }
}

function saveGeneratedPost(structuredContent: any, isUpdate: boolean = false, overrides?: { category?: string }): string | null {
  try {
    const posts = loadGeneratedPosts();
    const title = structuredContent.selectedTitle || '';

    // ✅ 중복 저장 방지: 같은 제목의 글이 60초 이내에 저장되었으면 해당 postId 재사용
    if (!isUpdate && title) {
      const now = Date.now();
      const recentPost = posts.find(p => {
        const createdAt = new Date(p.createdAt).getTime();
        const isRecent = (now - createdAt) < 60000; // 60초 이내
        const sameTitle = p.title === title;
        return isRecent && sameTitle;
      });

      if (recentPost) {
        console.log(`[saveGeneratedPost] 중복 방지: 같은 제목의 글이 최근에 저장됨 (ID: ${recentPost.id})`);
        currentPostId = recentPost.id;
        return recentPost.id; // 기존 postId 반환 (새로 저장하지 않음)
      }
    }

    // ✅ 새 글 저장은 항상 새 postId 생성 (이전 글 덮어쓰기 방지)
    // ✅ 업데이트 저장(isUpdate=true)만 currentPostId 재사용
    const postId = (isUpdate && currentPostId)
      ? currentPostId
      : `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    currentPostId = postId; // 전역 변수에 저장

    const now = new Date().toISOString();

    // 기존 글 찾기
    const existingIndex = posts.findIndex(p => p.id === postId);
    const existingPost = existingIndex >= 0 ? posts[existingIndex] : null;

    // ✅ CTA 필드 값 가져오기
    const ctas = readUnifiedCtasFromUi();
    const ctaText = ctas[0]?.text || (document.getElementById('unified-cta-text') as HTMLInputElement)?.value?.trim() || '';
    const ctaLink = ctas[0]?.link || (document.getElementById('unified-cta-link') as HTMLInputElement)?.value?.trim() || '';

    // ✅ [100점 수정] 카테고리: 블로그 폴더 카테고리 우선 사용 (기사 유형이 아님!)
    const blogFolderCategory = UnifiedDOMCache.getRealCategory() || '';
    const categoryFromContent = String((structuredContent as any)?.category || '').trim();
    // ✅ overrides.category 우선 적용, 그 다음 블로그 폴더, 콘텐츠 순
    const rawCategory = overrides?.category || blogFolderCategory || categoryFromContent || (existingPost?.category || '');
    // ✅ 카테고리 정규화 적용 (영어 → 한글 통일)
    const resolvedCategory = normalizeCategory(rawCategory);

    const imagesForSave = (() => {
      try {
        const fromWindow = (window as any).imageManagementGeneratedImages;
        if (Array.isArray(fromWindow) && fromWindow.length > 0) return fromWindow;
      } catch (e) {
        console.warn('[renderer] catch ignored:', e);
      }
      try {
        const fromManager = ImageManager.getAllImages();
        if (Array.isArray(fromManager) && fromManager.length > 0) return fromManager;
      } catch (e) {
        console.warn('[renderer] catch ignored:', e);
      }
      return Array.isArray(generatedImages) ? generatedImages : [];
    })();

    const normalizedImagesForSave = (imagesForSave || []).map((img: any) => ({
      heading: img.heading || '',
      provider: img.provider || img.source || img.engine || 'unknown',
      filePath: img.filePath || img.url || img.previewDataUrl || '',
      previewDataUrl: img.previewDataUrl || img.url || img.filePath || '',
      url: img.url || img.link || img.previewDataUrl || img.filePath || '',
      thumbnail: img.thumbnail || '',
      savedToLocal: img.savedToLocal || false,
    }));

    // ✅ [2026-01-22] 현재 계정 ID 가져오기
    const currentNaverId = getCurrentNaverId();

    // ✅ [2026-01-22] 쇼핑커넥트 모드 정보 가져오기
    const affiliateLinkInput = document.getElementById('unified-affiliate-link') as HTMLInputElement | null;
    const affiliateLinkValue = affiliateLinkInput?.value?.trim() || structuredContent.affiliateLink || '';
    const contentModeValue = structuredContent.contentMode ||
      (document.querySelector('input[name="article-type"]:checked') as HTMLInputElement)?.value ||
      'seo';

    const post: GeneratedPost = {
      id: postId,
      title: structuredContent.selectedTitle || '',
      content: structuredContent.bodyPlain || structuredContent.content || '',
      hashtags: structuredContent.hashtags || [],
      headings: structuredContent.headings || [],
      structuredContent: structuredContent, // ✅ 전체 구조화된 콘텐츠 저장
      createdAt: existingPost?.createdAt || now, // 기존 생성일 유지
      updatedAt: isUpdate ? now : (existingPost?.updatedAt || now), // 업데이트 시에만 수정일 갱신
      // ✅ 새 글에서는 이전 글 이미지 상속 금지 (미리보기 이미지 섞임 방지)
      images: normalizedImagesForSave.length > 0
        ? normalizedImagesForSave
        : (isUpdate ? (existingPost?.images || undefined) : undefined),
      isFavorite: existingPost?.isFavorite || false, // 기존 즐겨찾기 유지
      category: resolvedCategory || undefined,
      publishedUrl: existingPost?.publishedUrl || undefined, // 기존 발행 URL 유지
      publishedAt: existingPost?.publishedAt || undefined, // 기존 발행일 유지
      toneStyle: structuredContent.toneStyle || 'professional', // ✅ 글 톤 저장
      ctaText: ctaText || existingPost?.ctaText || '', // ✅ CTA 텍스트 저장
      ctaLink: ctaLink || existingPost?.ctaLink || '', // ✅ CTA 링크 저장
      ctas: ctas.length > 0 ? ctas : (existingPost as any)?.ctas || undefined,
      naverId: currentNaverId || existingPost?.naverId || undefined, // ✅ [2026-01-22] 계정 ID 저장
      // ✅ [2026-01-22] 쇼핑커넥트 구분용 필드 추가
      affiliateLink: affiliateLinkValue || existingPost?.affiliateLink || undefined,
      contentMode: contentModeValue || existingPost?.contentMode || undefined,
    };

    // 기존 글 업데이트 또는 새로 추가
    if (existingIndex >= 0) {
      posts[existingIndex] = post; // 기존 글 업데이트
    } else {
      posts.unshift(post); // 최신 글을 맨 위에
      if (posts.length > 100) posts.pop(); // 최대 100개만 저장
    }

    // ✅ [2026-01-24 FIX] 전역 저장소에 저장 (계정별 분리 제거)
    safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
    appendLog(`💾 생성된 글이 목록에 저장되었습니다. (ID: ${postId})`);

    // ✅ [2026-01-23 FIX] 저장 후 UI 갱신 (모든 발행 모드에서 글 목록 반영)
    try {
      refreshGeneratedPostsList();
    } catch (e) {
      console.warn('[saveGeneratedPost] UI 갱신 실패:', e);
    }

    return postId;
  } catch (error) {
    console.error('생성된 글 저장 실패:', error);
    return null;
  }
}

// ✅ 발행 완료 시 글 정보 업데이트
// ✅ [2026-01-24 FIX] 전역 저장소 사용 (계정별 분리 제거)
// ✅ [2026-03-05] publishMode 파라미터 추가 (임시/즉시/예약 구분)
function updatePostAfterPublish(postId: string, publishedUrl: string, publishMode?: 'draft' | 'publish' | 'schedule'): void {
  try {
    const posts = loadGeneratedPosts();
    const post = posts.find(p => p.id === postId);
    if (post) {
      post.publishedUrl = publishedUrl;
      post.publishedAt = new Date().toISOString();
      post.updatedAt = new Date().toISOString();
      post.isPublished = true; // ✅ 발행 상태 추가
      post.naverId = post.naverId || getCurrentNaverId() || undefined; // ✅ [2026-03-11 FIX] 기존 naverId 우선 유지 (다중계정 발행 시 덮어쓰기 방지)
      // ✅ [2026-03-05] 발행 모드 저장 (임시발행/즉시발행/예약발행 구분)
      if (publishMode) {
        (post as any).publishMode = publishMode;
      }

      const index = posts.findIndex(p => p.id === postId);
      if (index >= 0) {
        posts[index] = post;
        safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
        // ✅ [2026-03-05] 발행 모드에 따른 상태 메시지
        const modeLabel = publishMode === 'draft' ? '📝 임시발행됨' : publishMode === 'schedule' ? '📅 예약발행됨' : '✅ 발행됨';
        appendLog(`${modeLabel}: "${post.title}"`);
        // ✅ [2026-03-05] localStorage 이중 백업 (데이터 보존 강화)
        try {
          safeLocalStorageSetItem(`${GENERATED_POSTS_KEY}_backup`, JSON.stringify(posts));
        } catch { /* 백업 실패 무시 */ }
        refreshGeneratedPostsList();
      }
    }
  } catch (error) {
    console.error('발행 정보 업데이트 실패:', error);
  }
}

// ✅ 발행 완료 시 이미지 정보 업데이트
// ✅ [2026-01-24 FIX] 전역 저장소 사용 (계정별 분리 제거)
function updatePostImages(postId: string, images: any[]): void {
  try {
    const posts = loadGeneratedPosts();
    const post = posts.find(p => p.id === postId);
    if (post) {
      // 이미지 정보 저장 (URL, provider, heading 등)
      post.images = images.map((img: any) => ({
        heading: img.heading || '',
        provider: img.provider || 'unknown',
        // ✅ 미리보기에서 필요한 필드 보존
        filePath: img.filePath || '',
        previewDataUrl: img.previewDataUrl || '',
        url: img.url || img.link || img.previewDataUrl || img.filePath || '',
        thumbnail: img.thumbnail || '',
        savedToLocal: img.savedToLocal || false,
      }));
      post.imageCount = images.length;
      post.updatedAt = new Date().toISOString();

      // ✅ [2026-01-24 FIX] 전역 저장소에 저장
      const index = posts.findIndex(p => p.id === postId);
      if (index >= 0) {
        posts[index] = post;
        safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
        appendLog(`✅ 이미지 정보가 업데이트되었습니다: ${images.length}개`);
        refreshGeneratedPostsList();
      }
    }
  } catch (error) {
    console.error('이미지 정보 업데이트 실패:', error);
  }
}

// ✅ [2026-01-24] 기존 계정별 저장소 데이터를 전역 저장소로 병합 마이그레이션
// 계정별 분리를 제거하고 모든 글을 전역 저장소에 통합
const GLOBAL_MIGRATION_DONE_KEY = 'naver_blog_posts_migration_global_done';

function migrateAccountPostsToGlobal(): void {
  if (localStorage.getItem(GLOBAL_MIGRATION_DONE_KEY)) return; // 이미 완료됨

  try {
    console.log('[Migration] 🔄 계정별 저장소 → 전역 저장소 병합 시작...');

    const allPosts: GeneratedPost[] = [];
    const seenIds = new Set<string>();

    // 1. 기존 전역 저장소의 글 먼저 로드
    const globalData = localStorage.getItem(GENERATED_POSTS_KEY);
    if (globalData) {
      const globalPosts: GeneratedPost[] = JSON.parse(globalData);
      globalPosts.forEach(p => {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          allPosts.push(p);
        }
      });
    }

    // 2. 계정별 저장소에서도 글 병합
    // localStorage의 모든 키를 확인하여 계정별 저장소 찾기
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('naver_blog_generated_posts_') && key !== GENERATED_POSTS_KEY) {
        try {
          const accountData = localStorage.getItem(key);
          if (accountData) {
            const accountPosts: GeneratedPost[] = JSON.parse(accountData);
            accountPosts.forEach(p => {
              if (!seenIds.has(p.id)) {
                seenIds.add(p.id);
                allPosts.push(p);
              }
            });
            console.log(`[Migration] ✅ ${key}: ${accountPosts.length}개 글 병합`);
          }
        } catch (e) {
          console.warn(`[Migration] ⚠️ ${key} 파싱 실패:`, e);
        }
      }
    }

    // 3. 전역 저장소에 통합 저장
    // ✅ [2026-02-02 FIX] 사용자가 선택한 카테고리 그대로 유지 (정규화 제거)
    localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify(allPosts));
    console.log(`[Migration] ✅ 전역 저장소에 총 ${allPosts.length}개 글 통합 완료`);

    // 마이그레이션 완료 표시
    localStorage.setItem(GLOBAL_MIGRATION_DONE_KEY, 'true');
    console.log(`[Migration] ✅ 전역 저장소 마이그레이션 완료!`);
  } catch (error) {
    console.error('[Migration] ❌ 전역 마이그레이션 실패:', error);
  }
}

// ✅ [레거시 호환] 기존 함수명 유지 (호출부 오류 방지)
function migratePostsToPerAccount(): void {
  migrateAccountPostsToGlobal();
  backfillNaverIdForLegacyPosts(); // ✅ [2026-02-26] naverId 백필도 실행
}

// ✅ [2026-02-26] 레거시 글의 naverId 백필 마이그레이션
// naverId가 없는 글에 현재 활성 계정 ID를 배정
const NAVERID_BACKFILL_DONE_KEY = 'naver_blog_posts_naverid_backfill_done';
function backfillNaverIdForLegacyPosts(): void {
  if (localStorage.getItem(NAVERID_BACKFILL_DONE_KEY)) return;
  try {
    const raw = localStorage.getItem(GENERATED_POSTS_KEY);
    if (!raw) { localStorage.setItem(NAVERID_BACKFILL_DONE_KEY, 'true'); return; }
    const posts: GeneratedPost[] = JSON.parse(raw);
    const missingNaverId = posts.filter(p => !p.naverId);
    if (missingNaverId.length === 0) { localStorage.setItem(NAVERID_BACKFILL_DONE_KEY, 'true'); return; }

    // 현재 활성 계정 확인
    const currentId = getCurrentNaverId();
    // naverId가 있는 글에서 고유 계정 목록 수집
    const existingIds = new Set(posts.filter(p => p.naverId).map(p => p.naverId));

    if (currentId && existingIds.size <= 1) {
      // 단일 계정: 자동 배정
      missingNaverId.forEach(p => { (p as any).naverId = currentId; });
      console.log(`[Migration] ✅ ${missingNaverId.length}개 레거시 글에 naverId '${currentId}' 자동 배정`);
    } else {
      console.log(`[Migration] ℹ️ 다중 계정 감지 (${existingIds.size}개) - 레거시 글 ${missingNaverId.length}개는 미지정 유지`);
    }

    safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
    localStorage.setItem(NAVERID_BACKFILL_DONE_KEY, 'true');
  } catch (err) {
    console.error('[Migration] 레거시 naverId 백필 실패:', err);
  }
}



// ✅ [2026-01-24 FIX] 계정별 분리 제거 - 전역 저장소에서 모든 글 로드
// 카테고리별로만 필터링하면 되므로 계정 구분 불필요
function loadGeneratedPosts(naverId?: string): GeneratedPost[] {
  // 기존 계정별 데이터를 전역으로 병합 (한 번만)
  migrateAccountPostsToGlobal();

  try {
    const data = localStorage.getItem(GENERATED_POSTS_KEY);
    if (data) {
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('생성된 글 목록 로드 실패:', error);
    return [];
  }
}

// ✅ [2026-01-24 FIX] 모든 글 로드 - loadGeneratedPosts와 동일 (계정별 분리 제거됨)
function loadAllGeneratedPosts(): GeneratedPost[] {
  return loadGeneratedPosts();
}

function loadGeneratedPost(postId: string): GeneratedPost | null {
  // 현재 계정에서 먼저 찾기
  const currentPosts = loadGeneratedPosts();
  const found = currentPosts.find(p => p.id === postId);
  if (found) return found;

  // 전역에서도 찾기 (레거시 호환)
  try {
    const globalData = localStorage.getItem(GENERATED_POSTS_KEY);
    if (globalData) {
      const allPosts: GeneratedPost[] = JSON.parse(globalData);
      return allPosts.find(p => p.id === postId) || null;
    }
  } catch { /* ignore */ }

  return null;
}

// ✅ [2026-01-26 FIX] 전역 저장소에서 글 삭제 (loadGeneratedPosts와 동일한 저장소 사용)
function deleteGeneratedPost(postId: string): void {
  try {
    // ✅ [2026-01-26 FIX] 전역 저장소 사용 (loadGeneratedPosts와 일치)
    const posts = loadGeneratedPosts();
    const filtered = posts.filter(p => p.id !== postId);
    safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(filtered));

    // ✅ 이미지 폴더도 삭제
    if (postId) {
      deletePostImageFolder(postId);
    }

    appendLog(`🗑️ 생성된 글이 삭제되었습니다. (ID: ${postId})`);
    console.log(`[DeletePost] ✅ 삭제 완료: ${postId}, 남은 글: ${filtered.length}개`);
  } catch (error) {
    console.error('생성된 글 삭제 실패:', error);
  }
}

// ✅ [2026-01-22] 계정별 글 복사
function copyGeneratedPost(postId: string): void {
  const post = loadGeneratedPost(postId);
  if (!post) {
    alert('글을 찾을 수 없습니다.');
    return;
  }

  try {
    const naverId = getCurrentNaverId();
    const posts = loadGeneratedPosts(); // ✅ [2026-03-11 FIX] 전역 저장소에서 로드 (계정별 분리 폐지)
    const newPostId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const copiedPost: GeneratedPost = {
      ...post,
      id: newPostId,
      createdAt: new Date().toISOString(),
      title: `${post.title} (복사본)`,
      naverId: naverId || post.naverId // 현재 계정으로 설정
    };

    posts.unshift(copiedPost);
    if (posts.length > 100) posts.pop();

    safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(posts)); // ✅ [2026-03-11 FIX] 전역 키에 저장
    appendLog(`📋 글이 복사되었습니다. (새 ID: ${newPostId})`);
    refreshGeneratedPostsList();
    alert('✅ 글이 복사되었습니다!');
  } catch (error) {
    console.error('글 복사 실패:', error);
    alert('글 복사에 실패했습니다.');
  }
}



// ✅ 글 미리보기 (모달) - 실제 블로그처럼 소제목 아래 이미지 배치
function previewGeneratedPost(postId: string): void {
  const post = loadGeneratedPost(postId);
  if (!post) {
    alert('글을 찾을 수 없습니다.');
    return;
  }

  const date = new Date(post.createdAt);
  const dateStr = date.toLocaleString('ko-KR');

  // ✅ 실제 블로그처럼 본문 구성 (소제목 + 내용 + 이미지)
  const buildBlogStyleContent = (): string => {
    const headings = post.headings || [];
    const images = post.images || [];

    // 썸네일 (첫 번째 이미지)
    const thumbnailImage = images.length > 0 ? images[0] : null;
    const thumbnailHtml = thumbnailImage ? `
      <div style="margin-bottom: 1.5rem; text-align: center;">
        <img src="${toFileUrlMaybe(thumbnailImage.previewDataUrl || thumbnailImage.filePath || thumbnailImage.url || '')}" 
             style="max-width: 100%; max-height: 400px; border-radius: 8px; object-fit: contain;" 
             onerror="this.style.display='none';">
      </div>
    ` : '';

    // 도입부 (introduction)
    const introduction = (post as any).introduction;
    const introHtml = introduction ? `
      <div style="margin-bottom: 2rem; line-height: 1.8; color: var(--text-strong);">
        ${introduction.split('\n').map((p: string) => `<p style="margin-bottom: 0.75rem;">${p}</p>`).join('')}
      </div>
    ` : '';

    // 소제목별 콘텐츠 + 이미지
    let contentHtml = '';
    if (headings.length > 0) {
      headings.forEach((heading: any, index: number) => {
        const headingTitle = heading.title || heading;
        const headingContent = heading.content || '';
        // 소제목 이미지 (썸네일 제외하고 인덱스+1)
        const headingImage = images[index + 1] || null;

        contentHtml += `
          <div style="margin-bottom: 2rem;">
            <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--primary); margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--primary);">
              ${headingTitle}
            </h3>
            ${headingImage ? `
              <div style="margin-bottom: 1rem; text-align: center;">
                <img src="${toFileUrlMaybe(headingImage.previewDataUrl || headingImage.filePath || headingImage.url || '')}" 
                     style="max-width: 100%; max-height: 350px; border-radius: 8px; object-fit: contain;" 
                     onerror="this.style.display='none';">
              </div>
            ` : ''}
            ${headingContent ? `
              <div style="line-height: 1.8; color: var(--text-strong);">
                ${headingContent.split('\n').map((p: string) => `<p style="margin-bottom: 0.75rem;">${p}</p>`).join('')}
              </div>
            ` : ''}
          </div>
        `;
      });
    } else {
      // 소제목이 없으면 기존 방식으로 본문 표시
      contentHtml = `<div style="line-height: 1.8; color: var(--text-strong);">${formatContentForPreview(post.content)}</div>`;
    }

    // 마무리 (conclusion)
    const conclusion = (post as any).conclusion;
    const conclusionHtml = conclusion ? `
      <div style="margin-top: 2rem; padding: 1rem; background: var(--bg-tertiary); border-radius: 8px; line-height: 1.8; color: var(--text-strong);">
        ${conclusion.split('\n').map((p: string) => `<p style="margin-bottom: 0.5rem;">${p}</p>`).join('')}
      </div>
    ` : '';

    return thumbnailHtml + introHtml + contentHtml + conclusionHtml;
  };

  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); z-index: 10000; display: flex;
    align-items: center; justify-content: center; padding: 2rem;
  `;

  modal.innerHTML = `
    <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3); position: relative;">
      <button type="button" class="close-preview-btn" style="position: absolute; top: 1rem; right: 1rem; background: var(--bg-tertiary); border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.25rem; display: flex; align-items: center; justify-content: center;">×</button>
      
      <!-- 제목 -->
      <h2 style="margin: 0 0 0.5rem 0; color: var(--text-strong); font-size: 1.75rem; padding-right: 2rem; line-height: 1.4;">${post.title || '(제목 없음)'}</h2>
      <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-light);">
        📅 ${dateStr} | 📄 ${post.content.length.toLocaleString()}자 | 🖼️ ${post.images?.length || 0}개 이미지
      </div>
      
      <!-- 본문 (블로그 스타일) -->
      <div style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem;">
        ${buildBlogStyleContent()}
      </div>
      
      <!-- 해시태그 -->
      ${post.hashtags.length > 0 ? `
        <div style="margin-bottom: 1.5rem;">
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            ${post.hashtags.map(tag => `<span style="background: var(--bg-tertiary); padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.875rem; color: var(--primary);">#${tag.replace(/^#/, '')}</span>`).join('')}
          </div>
        </div>
      ` : ''}
      
      <!-- 버튼 -->
      <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
        <button type="button" class="load-from-preview-btn" data-post-id="${postId}" style="flex: 1; padding: 0.75rem; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">📂 불러오기</button>
        ${post.publishedUrl ? `<button type="button" class="open-published-btn" data-url="${post.publishedUrl}" style="padding: 0.75rem 1.5rem; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">🔗 발행글 보기</button>` : ''}
        <button type="button" class="close-preview-btn" style="padding: 0.75rem 1.5rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer;">닫기</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll('.close-preview-btn').forEach(btn => {
    btn.addEventListener('click', () => modal.remove());
  });

  const loadBtn = modal.querySelector('.load-from-preview-btn');
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      modal.remove();
      loadGeneratedPostToFields(postId);
    });
  }

  // ✅ 발행글 보기 버튼 이벤트
  const openPublishedBtn = modal.querySelector('.open-published-btn');
  if (openPublishedBtn) {
    openPublishedBtn.addEventListener('click', () => {
      const url = openPublishedBtn.getAttribute('data-url');
      if (url) window.open(url, '_blank');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// ✅ 글 이미지 폴더 열기
async function openPostImageFolder(postId: string): Promise<void> {
  try {
    if (!window.api.openPath) {
      appendLog('⚠️ 파일 시스템 API를 사용할 수 없습니다.');
      return;
    }

    const basePath = await getRequiredImageBasePath();

    const folderPath = `${basePath}/${postId}`.replace(/\\/g, '/');

    // 폴더 열기 (없으면 자동 생성됨)
    const result = await window.api.openPath(folderPath);

    if (result.success) {
      appendLog(`📂 이미지 폴더 열기: ${postId}`);
    } else {
      appendLog(`❌ 이미지 폴더 열기 실패: ${result.message || '알 수 없는 오류'}`);
    }
  } catch (error) {
    console.error('[Post] 이미지 폴더 열기 실패:', error);
    appendLog(`❌ 이미지 폴더 열기 실패: ${(error as Error).message}`);
  }
}

// ✅ 글 이미지 폴더 삭제
async function deletePostImageFolder(postId: string): Promise<void> {
  try {
    if (!window.api.checkFileExists) {
      console.error('[Delete] 파일 시스템 API를 사용할 수 없습니다.');
      return;
    }

    const basePath = await getRequiredImageBasePath();

    const folderPath = `${basePath}/${postId}`.replace(/\\/g, '/');

    // 폴더 존재 확인
    const exists = await window.api.checkFileExists(folderPath);

    if (exists && window.api.deleteFolder) {
      const result = await window.api.deleteFolder(folderPath);
      if (result) {
        appendLog(`🗑️ 이미지 폴더가 삭제되었습니다: ${postId}`);
      }
    }
  } catch (error) {
    console.error('폴더 삭제 실패:', error);
  }
}

// ✅ 선택한 글만 내보내기 (JSON)
function exportAllPosts(): void {
  try {
    // 체크박스로 선택한 글 가져오기
    const checkboxes = document.querySelectorAll('.post-checkbox:checked') as NodeListOf<HTMLInputElement>;
    const selectedPostIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-post-id')).filter(id => id !== null) as string[];

    let posts: GeneratedPost[];
    if (selectedPostIds.length > 0) {
      // 선택한 글만 내보내기
      const allPosts = loadGeneratedPosts();
      posts = allPosts.filter(post => selectedPostIds.includes(post.id));
      if (posts.length === 0) {
        alert('선택한 글이 없습니다.');
        return;
      }
    } else {
      // 선택한 글이 없으면 전체 내보내기
      posts = loadGeneratedPosts();
      if (posts.length === 0) {
        alert('내보낼 글이 없습니다.');
        return;
      }
    }

    const dataStr = JSON.stringify(posts, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `naver-blog-posts-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    appendLog(`📥 ${posts.length}개의 글이 내보내졌습니다.${selectedPostIds.length > 0 ? ` (선택한 ${selectedPostIds.length}개)` : ' (전체)'}`);
    alert(`✅ ${posts.length}개의 글이 내보내졌습니다!${selectedPostIds.length > 0 ? `\n\n선택한 ${selectedPostIds.length}개의 글만 내보냈습니다.` : '\n\n전체 글을 내보냈습니다.'}`);
  } catch (error) {
    console.error('글 내보내기 실패:', error);
    alert('글 내보내기에 실패했습니다.');
  }
}

// ✅ 글 가져오기 (JSON) - 선택 가능
function importPosts(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedPosts = JSON.parse(text) as GeneratedPost[];

      if (!Array.isArray(importedPosts)) {
        throw new Error('올바른 형식의 파일이 아닙니다.');
      }

      if (importedPosts.length === 0) {
        alert('가져올 글이 없습니다.');
        return;
      }

      // 여러 글인 경우 선택 모달 표시
      if (importedPosts.length > 1) {
        showImportPostsSelectionModal(importedPosts);
      } else {
        // 글 1개면 바로 가져오기
        await importSelectedPosts([importedPosts[0]]);
      }
    } catch (error) {
      console.error('글 가져오기 실패:', error);
      alert(`글 가져오기에 실패했습니다: ${(error as Error).message}`);
    }
  };
  input.click();
}

// ✅ 가져올 글 선택 모달
function showImportPostsSelectionModal(importedPosts: GeneratedPost[]): void {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); z-index: 10000; display: flex;
    align-items: center; justify-content: center; padding: 2rem;
  `;

  modal.innerHTML = `
    <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 800px; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3); position: relative;">
      <button type="button" class="close-import-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: var(--bg-tertiary); border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.25rem; display: flex; align-items: center; justify-content: center;">×</button>
      <h2 style="margin: 0 0 1rem 0; color: var(--text-strong); font-size: 1.5rem;">📤 가져올 글 선택</h2>
      <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem;">
        총 ${importedPosts.length}개의 글 중 가져올 글을 선택하세요.
      </div>
      <div style="margin-bottom: 1rem;">
        <button type="button" class="select-all-import-btn" style="padding: 0.5rem 1rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 4px; cursor: pointer; font-size: 0.875rem; margin-right: 0.5rem;">전체 선택</button>
        <button type="button" class="deselect-all-import-btn" style="padding: 0.5rem 1rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 4px; cursor: pointer; font-size: 0.875rem;">전체 해제</button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 50vh; overflow-y: auto; margin-bottom: 1.5rem;">
        ${importedPosts.map((post, index) => `
          <div style="padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-light);">
            <label style="display: flex; align-items: start; gap: 0.75rem; cursor: pointer;">
              <input type="checkbox" class="import-post-checkbox" data-index="${index}" checked style="margin-top: 0.25rem; width: 18px; height: 18px; cursor: pointer;">
              <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem;">${post.title || '(제목 없음)'}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">
                  📄 ${post.content.length.toLocaleString()}자 | 🖼️ ${post.images?.length || 0}개 | 📑 ${post.headings?.length || 0}개
                </div>
              </div>
            </label>
          </div>
        `).join('')}
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <button type="button" class="confirm-import-btn" style="flex: 1; padding: 0.75rem; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">가져오기</button>
        <button type="button" class="close-import-modal-btn" style="flex: 1; padding: 0.75rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">취소</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 전체 선택/해제
  modal.querySelector('.select-all-import-btn')?.addEventListener('click', () => {
    modal.querySelectorAll('.import-post-checkbox').forEach((cb: any) => {
      cb.checked = true;
    });
  });

  modal.querySelector('.deselect-all-import-btn')?.addEventListener('click', () => {
    modal.querySelectorAll('.import-post-checkbox').forEach((cb: any) => {
      cb.checked = false;
    });
  });

  // 가져오기 확인
  modal.querySelector('.confirm-import-btn')?.addEventListener('click', async () => {
    const checkboxes = modal.querySelectorAll('.import-post-checkbox:checked') as NodeListOf<HTMLInputElement>;
    const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.getAttribute('data-index') || '0'));
    const selectedPosts = selectedIndices.map(idx => importedPosts[idx]);

    if (selectedPosts.length === 0) {
      alert('가져올 글을 최소 1개 이상 선택해주세요.');
      return;
    }

    modal.remove();
    await importSelectedPosts(selectedPosts);
  });

  // 닫기
  modal.querySelectorAll('.close-import-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => modal.remove());
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// ✅ 선택한 글 가져오기
async function importSelectedPosts(selectedPosts: GeneratedPost[]): Promise<void> {
  try {
    const existingPosts = loadGeneratedPosts();
    const newPosts = selectedPosts.map(post => ({
      ...post,
      id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // 새 ID 생성
      createdAt: new Date().toISOString() // 새 생성일
    }));

    const merged = [...newPosts, ...existingPosts];
    const unique = merged.filter((post, index, self) =>
      index === self.findIndex(p => p.id === post.id)
    );

    if (unique.length > 100) {
      unique.splice(100); // 최대 100개만 유지
    }

    localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify(unique));
    appendLog(`📤 ${newPosts.length}개의 글이 가져와졌습니다.`);
    refreshGeneratedPostsList();
    alert(`✅ ${newPosts.length}개의 글이 가져와졌습니다!`);
  } catch (error) {
    console.error('글 가져오기 실패:', error);
    alert(`글 가져오기에 실패했습니다: ${(error as Error).message}`);
  }
}

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



const imageHistoryStack: ImageHistorySnapshot[] = [];
let lastImageHistorySnapshotAt = 0;

function pushImageHistorySnapshot(reason: string): void {
  try {
    const now = Date.now();
    if (now - lastImageHistorySnapshotAt < 50) return; // ✅ [2026-02-12 P3 FIX #16] 150ms → 50ms
    lastImageHistorySnapshotAt = now;
    const snapshot: ImageHistorySnapshot = [];
    ImageManager.imageMap.forEach((images, heading) => {
      snapshot.push({
        heading,
        images: images.map((img) => ({ ...img })),
      });
    });
    imageHistoryStack.push(snapshot);
    if (imageHistoryStack.length > 50) {
      imageHistoryStack.shift();
    }
    console.log('[ImageHistory] snapshot pushed:', reason, 'entries:', snapshot.length);
  } catch (error) {
    console.error('[ImageHistory] snapshot push 실패:', error);
  }
}

// ============================================
// 🎯 통합 이미지 관리 시스템
// ============================================
/**
 * 3개의 미리보기(소제목 분석, 생성된 이미지, 저장된 이미지)를 완전히 연동
 * - 어디서든 이미지 추가/수정/삭제 시 모든 미리보기 자동 동기화
 * - 소제목별 이미지 매핑 관리
 * - 중복 방지 및 일관성 보장
 */
const ImageManager = {
  // 소제목별 이미지 매핑 (heading title -> image array) - ✅ 여러 이미지 지원
  imageMap: new Map<string, any[]>(),
  unsetHeadings: new Set<string>(),

  // 모든 소제목 목록
  headings: [] as any[],

  /**
   * ✅ 모든 이미지 및 상태 초기화
   */
  clearAll(): void {
    console.log('[ImageManager] 모든 데이터 초기화');
    this.imageMap.clear();
    this.unsetHeadings.clear();
    this.headings = [];
    try {
      (window as any).generatedImages = [];
      (window as any).imageManagementGeneratedImages = [];
      (window as any).currentStructuredContent = null;
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    // ✅ [2026-02-12 P0 FIX] 누락된 동기화 추가
    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  resolveHeadingKey(headingTitle: string): string {
    const rawTitle = String(headingTitle || '').trim();
    if (!rawTitle) return rawTitle;
    if (this.imageMap.has(rawTitle)) return rawTitle;

    // ✅ [2026-03-14 CRITICAL FIX] 📌 썸네일 배지 텍스트 strip
    // displayImageHeadingsWithPrompts에서 .heading-title-text 안에 📌 썸네일 배지가 포함되어
    // DOM textContent로 추출 시 "🖼️ 썸네일 📌 썸네일"이 되지만, data-heading-title은 "🖼️ 썸네일"
    // 이 불일치로 ImageManager에서 이미지를 찾지 못하는 근본 버그 수정
    const stripBadge = (s: string) => s.replace(/\s*📌\s*썸네일\s*/g, '').trim();
    const strippedRaw = stripBadge(rawTitle);
    if (strippedRaw !== rawTitle && this.imageMap.has(strippedRaw)) return strippedRaw;

    try {
      const norm = normalizeHeadingKeyForVideoCache(rawTitle);
      const normStripped = normalizeHeadingKeyForVideoCache(strippedRaw);
      if (!norm) return rawTitle;
      const keys = Array.from(this.imageMap.keys()) as string[];
      for (const key of keys) {
        const keyStr = String(key || '').trim();
        if (!keyStr) continue;
        if (keyStr === rawTitle) return keyStr;
        if (normalizeHeadingKeyForVideoCache(keyStr) === norm) return keyStr;
        // ✅ 배지 strip 후 매칭 시도
        const keyStripped = stripBadge(keyStr);
        if (keyStripped === strippedRaw) return keyStr;
        if (normStripped && normalizeHeadingKeyForVideoCache(keyStripped) === normStripped) return keyStr;
      }
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }

    return rawTitle;
  },

  /**
   * 소제목 목록 설정
   */
  setHeadings(headings: any[]): void {
    console.log('[ImageManager] 소제목 설정:', headings.length, '개');
    this.headings = headings;

    try {
      const normalizedHeadings2 = new Set<string>();
      (Array.isArray(this.headings) ? this.headings : []).forEach((h: any) => {
        const title = typeof h === 'string' ? String(h).trim() : String(h?.title || h || '').trim();
        const n = normalizeHeadingKeyForVideoCache(title);
        if (n) normalizedHeadings2.add(n);
      });
      const unsetKeys = Array.from(this.unsetHeadings.keys()) as string[];
      for (const key of unsetKeys) {
        const n = normalizeHeadingKeyForVideoCache(String(key || '').trim());
        if (n && !normalizedHeadings2.has(n)) {
          this.unsetHeadings.delete(key);
        }
      }
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }

    // ✅ [2026-02-12 P2 FIX #12] 이미지 소실 방지: 삭제 대신 가장 가까운 소제목에 리매핑
    try {
      const normalizedHeadings = new Set<string>();
      const headingTitleList: string[] = [];
      (Array.isArray(this.headings) ? this.headings : []).forEach((h: any) => {
        const title = typeof h === 'string' ? String(h).trim() : String(h?.title || h || '').trim();
        const n = normalizeHeadingKeyForVideoCache(title);
        if (n) {
          normalizedHeadings.add(n);
          headingTitleList.push(title);
        }
      });
      const keys = Array.from(this.imageMap.keys()) as string[];
      for (const key of keys) {
        // ✅ [2026-02-27 FIX] 썸네일 키는 삭제/리매핑하지 않고 보존
        if (key === '🖼️ 썸네일' || key === '썸네일') continue;
        const n = normalizeHeadingKeyForVideoCache(String(key || '').trim());
        if (n && !normalizedHeadings.has(n)) {
          // 인덱스 기반 리매핑: 같은 위치의 새 소제목이 있으면 이전
          const images = this.imageMap.get(key);
          if (images && images.length > 0 && headingTitleList.length > 0) {
            const idx = images[0]?.headingIndex;
            if (typeof idx === 'number' && idx >= 0 && idx < headingTitleList.length) {
              const newKey = this.resolveHeadingKey(headingTitleList[idx]);
              if (!this.imageMap.has(newKey)) {
                this.imageMap.set(newKey, images);
                console.log(`[ImageManager] 이미지 리매핑: "${key}" → "${newKey}"`);
              }
            }
          }
          this.imageMap.delete(key);
        }
      }
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }

    this.syncAllPreviews();
    // ✅ [2026-02-12 P2 FIX #13] setHeadings 후 syncGlobal 호출
    try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }
  },

  /**
   * ✅ 이미지 추가 (소제목당 여러 이미지 지원)
   */
  addImage(headingTitle: string, image: any): void {
    try {
      pushImageHistorySnapshot('ImageManager.addImage');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    console.log('[ImageManager] 이미지 추가:', headingTitle);
    const titleKey = this.resolveHeadingKey(headingTitle);
    this.unsetHeadings.delete(titleKey);
    const images = this.imageMap.get(titleKey) || [];
    images.push({
      ...image,
      heading: titleKey,
      timestamp: Date.now()
    });
    this.imageMap.set(titleKey, images);

    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  setPrimaryImageByKey(headingTitle: string, imageKey: string): void {
    const key = String(imageKey || '').trim();
    if (!key) return;
    try {
      pushImageHistorySnapshot('ImageManager.setPrimaryImageByKey');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    const titleKey = this.resolveHeadingKey(headingTitle);
    const images = this.imageMap.get(titleKey) || [];
    const idx = images.findIndex((img: any) => getStableImageKey(img) === key);
    if (idx < 0) return;
    if (idx > 0) {
      const picked = images.splice(idx, 1)[0];
      images.unshift(picked);
    }
    this.imageMap.set(titleKey, images);
    this.unsetHeadings.delete(titleKey);
    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
    try {
      syncGlobalImagesFromImageManager();
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }

    try {
      updatePromptItemsWithImages(this.getAllImages());
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
  },

  /**
   * ✅ 이미지 설정 (기존 이미지 교체 - 첫 번째 이미지로 설정)
   */
  setImage(headingTitle: string, image: any): void {
    try {
      pushImageHistorySnapshot('ImageManager.setImage');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    console.log('[ImageManager] 이미지 설정:', headingTitle);
    const titleKey = this.resolveHeadingKey(headingTitle);
    this.unsetHeadings.delete(titleKey);
    const existingImages = this.imageMap.get(titleKey) || [];
    const newImage = {
      ...image,
      heading: titleKey,
      timestamp: Date.now()
    };

    // 첫 번째 이미지 교체, 나머지 유지
    if (existingImages.length > 0) {
      existingImages[0] = newImage;
      this.imageMap.set(titleKey, existingImages);
    } else {
      this.imageMap.set(titleKey, [newImage]);
    }

    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  /**
   * ✅ 소제목의 모든 이미지 제거
   */
  removeImage(headingTitle: string): void {
    try {
      pushImageHistorySnapshot('ImageManager.removeImage');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    console.log('[ImageManager] 이미지 전체 제거:', headingTitle);
    const titleKey = this.resolveHeadingKey(headingTitle);
    this.imageMap.delete(titleKey);
    this.unsetHeadings.add(titleKey);

    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  /**
   * ✅ 특정 인덱스의 이미지 제거
   */
  removeImageAtIndex(headingTitle: string, index: number): void {
    try {
      pushImageHistorySnapshot('ImageManager.removeImageAtIndex');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    console.log('[ImageManager] 이미지 제거:', headingTitle, '인덱스:', index);
    const titleKey = this.resolveHeadingKey(headingTitle);
    const images = this.imageMap.get(titleKey) || [];
    if (index >= 0 && index < images.length) {
      images.splice(index, 1);

      // ✅ 대표(0번) 삭제 후에도 다른 이미지가 남아있으면 다음 이미지를 대표로 사용
      if (images.length > 0) {
        if (index === 0) {
          const gifIdx = images.findIndex((img: any) => String(img?.provider || '') === 'gif-from-video');
          if (gifIdx >= 0) {
            const gif = images.splice(gifIdx, 1)[0];
            images.unshift(gif);
          }
        }
        this.unsetHeadings.delete(titleKey);
      } else {
        this.unsetHeadings.add(titleKey);
      }

      if (images.length === 0) {
        this.imageMap.delete(titleKey);
      } else {
        this.imageMap.set(titleKey, images);
      }
    }

    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  /**
   * ✅ 특정 소제목의 이미지 가져오기 (첫 번째 이미지, 호환성 유지)
   */
  getImage(headingTitle: string): any | null {
    const titleKey = this.resolveHeadingKey(headingTitle);
    const images = this.imageMap.get(titleKey);
    if (!images || images.length === 0) return null;

    if (this.unsetHeadings.has(titleKey)) {
      const gif = images.find((img: any) => String(img?.provider || '') === 'gif-from-video');
      return gif || null;
    }

    return images[0];
  },

  isHeadingUnset(headingTitle: string): boolean {
    const titleKey = this.resolveHeadingKey(headingTitle);
    return this.unsetHeadings.has(titleKey);
  },

  /**
   * ✅ 특정 소제목의 모든 이미지 가져오기 (배열)
   */
  getImages(headingTitle: string): any[] {
    const titleKey = this.resolveHeadingKey(headingTitle);
    return this.imageMap.get(titleKey) || [];
  },

  /**
   * ✅ 특정 소제목의 이미지 개수
   */
  getImageCount(headingTitle: string): number {
    const titleKey = this.resolveHeadingKey(headingTitle);
    return (this.imageMap.get(titleKey) || []).length;
  },

  /**
   * 모든 이미지 가져오기 (배열 - 모든 소제목의 모든 이미지)
   */
  getAllImages(): any[] {
    // ✅ [2026-02-12 P2 FIX #11] headings 순서 보장
    const allImages: any[] = [];
    const visited = new Set<string>();
    if (Array.isArray(this.headings) && this.headings.length > 0) {
      this.headings.forEach((h: any) => {
        const title = typeof h === 'string' ? String(h).trim() : String(h?.title || h || '').trim();
        const key = this.resolveHeadingKey(title);
        if (!key || visited.has(key)) return;
        visited.add(key);
        const images = this.imageMap.get(key);
        if (images) allImages.push(...images);
      });
    }
    // 남은 orphan 엔트리도 추가
    this.imageMap.forEach((images, key) => {
      if (!visited.has(key)) {
        allImages.push(...images);
      }
    });
    return allImages;
  },

  /**
   * 소제목에 이미지가 있는지 확인
   */
  hasImage(headingTitle: string): boolean {
    const titleKey = this.resolveHeadingKey(headingTitle);
    const images = this.imageMap.get(titleKey);
    return images !== undefined && images.length > 0;
  },

  /**
   * 전체 초기화
   */
  clear(): void {
    console.log('[ImageManager] 전체 초기화');
    this.imageMap.clear();
    this.unsetHeadings.clear();
    this.headings = [];
    // ✅ [2026-02-12 P0 FIX] 전역변수도 함께 초기화
    try {
      (window as any).generatedImages = [];
      (window as any).imageManagementGeneratedImages = [];
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  /**
   * generatedImages 배열 동기화 (모든 소제목의 첫 번째 이미지만)
   */
  syncGeneratedImagesArray(): void {
    generatedImages = [];

    // ✅ [2026-03-22 FIX] 소제목 순서대로 모든 이미지 포함 (대표+추가 이미지 모두 발행)
    // 기존: getImage()로 1장만 → 추가 이미지 발행 누락 버그
    if (Array.isArray(this.headings) && this.headings.length > 0) {
      this.headings.forEach((h: any, idx: number) => {
        const title = typeof h === 'string' ? String(h).trim() : String(h?.title || h || '').trim();
        if (!title) return;
        const imgs = this.getImages(title) || [];
        imgs.forEach((img: any) => {
          // ✅ [2026-02-12 P3 FIX #17] 원본 mutation 방지: 복사본 사용
          const imgCopy = { ...img };
          if (imgCopy.headingIndex === undefined || imgCopy.headingIndex === null) {
            imgCopy.headingIndex = idx;
          }
          generatedImages.push(imgCopy);
        });
      });
    } else {
      // fallback: 모든 이미지 포함
      this.imageMap.forEach((images) => {
        images.forEach((img: any) => {
          generatedImages.push({ ...img });
        });
      });
    }
    // ✅ [2026-02-27 FIX] 썸네일 이미지도 generatedImages에 포함 (UI 표시용)
    const thumbImg = this.getImage('🖼️ 썸네일');
    if (thumbImg && !generatedImages.some((g: any) => g.heading === '🖼️ 썸네일')) {
      generatedImages.unshift({ ...thumbImg });
    }
    console.log('[ImageManager] generatedImages 동기화:', generatedImages.length, '개');
  },

  /**
   * 모든 미리보기 동기화
   */
  syncAllPreviews(): void {
    console.log('[ImageManager] 모든 미리보기 동기화 시작...');

    // 1. 소제목 분석 미리보기 업데이트
    this.updateHeadingAnalysisPreview();

    // 2. 생성된 이미지 미리보기 업데이트
    this.updateGeneratedImagesPreview();

    // 3. 저장된 이미지 모달 업데이트 (열려있을 경우)
    this.updateLocalImageModal();

    // 4. ✅ 예비 이미지 빠른 교체 썸네일 업데이트
    if (typeof updateReserveImagesThumbnails === 'function') {
      updateReserveImagesThumbnails();
    }

    console.log('[ImageManager] 모든 미리보기 동기화 완료');
  },

  /**
   * 1. 소제목 분석 미리보기 업데이트 (✅ 예비 이미지 빠른 교체 기능 추가)
   */
  updateHeadingAnalysisPreview(): void {
    const promptsContainer = document.getElementById('prompts-container');
    if (!promptsContainer) return;

    // ✅ window 객체를 통해 호출 (모듈 번들링 문제 방지)
    if (typeof (window as any).ensureKenBurnsStyles === 'function') {
      (window as any).ensureKenBurnsStyles();
    } else if (typeof ensureKenBurnsStyles === 'function') {
      ensureKenBurnsStyles();
    }

    const reserveImages: any[] = [];

    const promptItems = promptsContainer.querySelectorAll('.prompt-item');
    promptItems.forEach((item, index) => {
      const headingTitleEl = item.querySelector('.heading-title-text');
      if (!headingTitleEl) return;

      const headingTitle = headingTitleEl.textContent?.trim() || '';
      // ✅ [DEBUG] data-heading-title 속성에서 순수 제목 추출 (배지 텍스트 오염 방지)
      const promptItemEl = item as HTMLElement;
      const dataTitle = String(promptItemEl.getAttribute('data-heading-title') || '').trim();
      const pureEl = item.querySelector('.heading-title-pure') as HTMLElement | null;
      const pureTitleText = pureEl ? String(pureEl.textContent || '').trim() : '';
      const effectiveTitle = dataTitle || pureTitleText || headingTitle;
      console.log(`[updateHeadingAnalysisPreview] 🔍 #${index} textContent="${headingTitle.substring(0, 40)}" dataTitle="${dataTitle.substring(0, 40)}" pureTitle="${pureTitleText.substring(0, 40)}" → effectiveTitle="${effectiveTitle.substring(0, 40)}"`);
      const image = this.getImage(effectiveTitle);
      const generatedImageDiv = item.querySelector('.generated-image') as HTMLElement;

      if (!generatedImageDiv) return;

      // ✅ 안전한 HTML 이스케이프 (data- 속성에 복잡한 문자열 넣지 않음)
      const safeTitle = escapeHtml(effectiveTitle);

      const getFromCache = (window as any).getHeadingVideoPreviewFromCache || getHeadingVideoPreviewFromCache;
      const cachedVideo = getFromCache(effectiveTitle);
      if (cachedVideo && cachedVideo.url) {
        const safeUrl = escapeHtml(String(cachedVideo.url));
        // ✅ [2026-02-12 FIX] 비디오+이미지 동시 표시: 이미지가 있으면 좌하단 뱃지로 보조 표시
        let imageBadgeHtml = '';
        if (image) {
          const imgRaw = image.url || image.filePath || image.previewDataUrl || '';
          const imgUrl = toFileUrlMaybe(String(imgRaw || '').trim());
          if (imgUrl) {
            imageBadgeHtml = `<div style="position: absolute; bottom: 4px; left: 4px; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 2px solid rgba(34,197,94,0.9); box-shadow: 0 2px 8px rgba(0,0,0,0.4); z-index: 10;" title="배치된 이미지: ${safeTitle}"><img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.style.display='none'"><div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(34,197,94,0.85); color: white; text-align: center; font-size: 10px; font-weight: 800; padding: 1px 0; letter-spacing: 1px;">GIF</div></div>`;
          }
        }
        generatedImageDiv.innerHTML = `
          <div style="position: relative; width: 100%; height: 100%;">
            <video class="heading-video-preview" src="${safeUrl}" muted autoplay loop playsinline preload="metadata" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; cursor: pointer; background: #000;"></video>
            <div style="position: absolute; top: 4px; right: 4px; display: flex; gap: 4px; z-index: 10;">
              <button class="remove-heading-video-btn" data-heading-index="${index}" data-heading-title="${safeTitle}" style="background: rgba(239, 68, 68, 0.95); color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.85rem; font-weight: 900;" title="삭제">✕</button>
            </div>
            ${imageBadgeHtml}
          </div>
        `;
        generatedImageDiv.style.border = '2px solid var(--success)';
        generatedImageDiv.style.background = 'var(--bg-secondary)';
        const vEl = generatedImageDiv.querySelector('.heading-video-preview') as HTMLVideoElement | null;
        if (vEl) {
          vEl.addEventListener('click', (e) => {
            e.stopPropagation();
            showVideoModal(cachedVideo.url, headingTitle);
          });
          try {
            vEl.play().catch((e) => {
              console.warn('[renderer] promise catch ignored:', e);
            });
          } catch (e) {
            console.warn('[renderer] catch ignored:', e);
          }
        }
        return;
      }

      prefetchHeadingVideoPreview(effectiveTitle);
      const headingVideoKey = normalizeHeadingKeyForVideoCache(effectiveTitle);
      if (!headingVideoKey) return;
      if (!headingVideoPreviewCache.has(headingVideoKey) && headingVideoPreviewInFlight.has(headingVideoKey)) {
        const currentHeadingSnapshot = headingTitle;
        const currentItem = item;
        const currentDiv = generatedImageDiv;
        headingVideoPreviewInFlight.get(headingVideoKey)!.then((entry: HeadingVideoPreviewCacheEntry) => {
          if (!entry || !entry.url) return;
          // ✅ [2026-03-16 FIX] getSafeHeadingTitle로 배지 오염 방지
          const stillHeading = getSafeHeadingTitle(currentItem) || '';
          if (stillHeading !== currentHeadingSnapshot) return;
          const safeUrl2 = escapeHtml(String(entry.url));
          // ✅ [2026-02-12 FIX] in-flight 비디오에서도 이미지 뱃지 표시 (일관성)
          let imageBadgeHtml2 = '';
          if (image) {
            const imgRaw2 = image.url || image.filePath || image.previewDataUrl || '';
            const imgUrl2 = toFileUrlMaybe(String(imgRaw2 || '').trim());
            if (imgUrl2) {
              imageBadgeHtml2 = `<div style="position: absolute; bottom: 4px; left: 4px; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 2px solid rgba(34,197,94,0.9); box-shadow: 0 2px 8px rgba(0,0,0,0.4); z-index: 10;" title="배치된 이미지: ${safeTitle}"><img src="${imgUrl2}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.style.display='none'"><div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(34,197,94,0.85); color: white; text-align: center; font-size: 10px; font-weight: 800; padding: 1px 0; letter-spacing: 1px;">GIF</div></div>`;
            }
          }
          currentDiv.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%;">
              <video class="heading-video-preview" src="${safeUrl2}" muted autoplay loop playsinline preload="metadata" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; cursor: pointer; background: #000;"></video>
              <div style="position: absolute; top: 4px; right: 4px; display: flex; gap: 4px; z-index: 10;">
                <button class="remove-heading-video-btn" data-heading-index="${index}" data-heading-title="${safeTitle}" style="background: rgba(239, 68, 68, 0.95); color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.85rem; font-weight: 900;" title="삭제">✕</button>
              </div>
              ${imageBadgeHtml2}
            </div>
          `;
          currentDiv.style.border = '2px solid var(--success)';
          currentDiv.style.background = 'var(--bg-secondary)';
          const vEl2 = currentDiv.querySelector('.heading-video-preview') as HTMLVideoElement | null;
          if (vEl2) {
            vEl2.addEventListener('click', (e) => {
              e.stopPropagation();
              showVideoModal(entry.url, currentHeadingSnapshot);
            });
            try {
              vEl2.play().catch((e) => {
                console.warn('[renderer] promise catch ignored:', e);
              });
            } catch (e) {
              console.warn('[renderer] catch ignored:', e);
            }
          }
        }).catch((e) => {
          console.warn('[renderer] headingVideoPreviewInFlight promise catch ignored:', e);
        });
      }

      if (image) {
        const imageRaw = image.url || image.filePath || image.previewDataUrl || '';
        const imageUrl = toFileUrlMaybe(String(imageRaw || '').trim());
        const prompt = image.prompt || effectiveTitle || '';
        console.log(`[updateHeadingAnalysisPreview] 🖼️ #${index} 이미지 발견! URL="${String(imageUrl || '').substring(0, 100)}" heading="${effectiveTitle.substring(0, 30)}"`);

        // ✅ 예비 이미지 썸네일 HTML 생성 (최대 5개 표시)
        const reserveThumbnails = reserveImages.slice(0, 5).map((img: any, rIdx: number) => {
          const thumbRaw = img.url || img.filePath || img.previewDataUrl || '';
          const thumbUrl = toFileUrlMaybe(String(thumbRaw || '').trim());
          return `
            <img class="quick-replace-thumb" 
                 src="${thumbUrl}" 
                 data-heading-index="${index}"
                 data-reserve-index="${rIdx}"
                 data-heading-title="${safeTitle}"
                 style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; opacity: 0.7;"
                 onmouseover="this.style.borderColor='#f59e0b'; this.style.opacity='1'; this.style.transform='scale(1.1)';"
                 onmouseout="this.style.borderColor='transparent'; this.style.opacity='0.7'; this.style.transform='scale(1)';"
                 title="클릭하면 이 이미지로 교체">
          `;
        }).join('');

        const hasReserve = reserveImages.length > 0;
        const reserveCountText = hasReserve ? `예비 ${reserveImages.length}개` : '';

        // 이미지 있음 - 표시 (✅ 예비 이미지 빠른 교체 UI 추가)
        generatedImageDiv.innerHTML = `
          <div style="position: relative; width: 100%; height: 100%;">
            <img src="${imageUrl}" 
                 alt="${safeTitle}" 
                 class="ken-burns-media"
                 style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; cursor: pointer;"
                 onclick="showHeadingImagesModal('${encodeURIComponent(String(effectiveTitle || '').trim())}','${encodeURIComponent(String(imageUrl || '').trim())}')"
                 title="클릭하면 크게 보기">
            
            <!-- ✅ 상단 버튼들 -->
            <div style="position: absolute; top: 4px; right: 4px; display: flex; gap: 4px; z-index: 10;">
              <button class="remove-image-from-preview-btn" 
                      data-heading-index="${index}"
                      data-heading-title="${safeTitle}"
                      data-image-index="${index}"
                      style="background: rgba(239, 68, 68, 0.95); color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.85rem; font-weight: 900;"
                      title="삭제">✕</button>
            </div>
            
            <!-- ✅ 하단: 예비 이미지 빠른 교체 (있으면 표시) -->
            ${hasReserve ? `
            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.8)); padding: 6px 4px 4px; border-radius: 0 0 8px 8px;">
              <div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
                <span style="color: #f59e0b; font-size: 0.65rem; font-weight: 600; white-space: nowrap;">⚡${reserveCountText}</span>
                <div style="display: flex; gap: 2px; overflow: hidden;">
                  ${reserveThumbnails}
                </div>
                ${reserveImages.length > 5 ? `<span style="color: rgba(255,255,255,0.7); font-size: 0.6rem;">+${reserveImages.length - 5}</span>` : ''}
              </div>
            </div>
            ` : ''}
          </div>
        `;
        generatedImageDiv.style.border = '2px solid var(--success)';
        generatedImageDiv.style.background = 'var(--bg-secondary)';
      } else {
        // 이미지 없음 - 플레이스홀더 (✅ 예비 이미지 있으면 바로 배치 가능)
        if (reserveImages.length > 0) {
          const firstReserve = reserveImages[0];
          const thumbRaw = firstReserve.url || firstReserve.filePath || firstReserve.previewDataUrl || '';
          const thumbUrl = toFileUrlMaybe(String(thumbRaw || '').trim());
          generatedImageDiv.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 4px;">
              <span style="color: var(--text-muted); font-size: 1.2rem;">🖼️</span>
              <span style="color: var(--text-muted); font-size: 0.65rem;">이미지 없음</span>
              <button class="quick-assign-reserve-btn"
                      data-heading-index="${index}"
                      data-heading-title="${safeTitle}"
                      style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.65rem; font-weight: 600;"
                      title="예비 이미지 바로 배치">
                ⚡ 예비에서 배치
              </button>
            </div>
          `;
        } else {
          generatedImageDiv.innerHTML = '<span style="color: var(--text-muted); font-size: 1.5rem;">🖼️</span>';
        }
        generatedImageDiv.style.border = '2px dashed var(--border-color)';
        generatedImageDiv.style.background = 'var(--bg-tertiary)';
      }
    });
  },

  /**
   * 2. 생성된 이미지 미리보기 업데이트 (displayGeneratedImages와 동일한 UI 사용)
   * ✅ [100점 수정] DOM 요소가 없으면 재시도하여 100% 그리드 표시 보장
   */
  updateGeneratedImagesPreview(retryCount: number = 0): void {
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 100;

    const generatedImagesGrid = document.getElementById('generated-images-grid');

    // ✅ DOM 요소가 없으면 재시도 (비동기 렌더링 대응)
    if (!generatedImagesGrid) {
      if (retryCount < MAX_RETRIES) {
        console.log(`[ImageManager] generated-images-grid 찾기 재시도 ${retryCount + 1}/${MAX_RETRIES}`);
        setTimeout(() => this.updateGeneratedImagesPreview(retryCount + 1), RETRY_DELAY_MS);
      } else {
        console.warn('[ImageManager] generated-images-grid 요소를 찾을 수 없습니다 (재시도 횟수 초과)');
      }
      return;
    }

    // ✅ window 객체를 통해 호출 (모듈 번들링 문제 방지)
    if (typeof (window as any).ensureKenBurnsStyles === 'function') {
      (window as any).ensureKenBurnsStyles();
    } else if (typeof ensureKenBurnsStyles === 'function') {
      ensureKenBurnsStyles();
    }

    const images = this.getAllImages();

    // ✅ 이미지가 없으면 안내 메시지 표시
    if (images.length === 0) {
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
      return;
    }

    // ✅ 안전한 HTML 이스케이프 함수
    const escapeHtml = (str: string): string => {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    // ✅ 그리드 스타일 강제 적용
    generatedImagesGrid.style.display = 'grid';
    generatedImagesGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    generatedImagesGrid.style.gap = '1rem';

    generatedImagesGrid.innerHTML = images.map((image, index) => {
      const headingRaw = String(image.heading || `소제목 ${index + 1}`);
      const heading = escapeHtml(headingRaw);
      const prompt = escapeHtml(image.prompt || image.heading || `이미지 ${index + 1}`);
      const imageKey = escapeHtml(String(getStableImageKey(image) || ''));
      const imageRaw = image.url || image.filePath || image.previewDataUrl || '';
      const imageUrl = toFileUrlMaybe(String(imageRaw || '').trim());
      return `
        <div class="generated-image-item" data-image-index="${index}" data-heading-title="${heading}" data-image-key="${imageKey}" style="position: relative; background: var(--bg-secondary); border-radius: 12px; overflow: hidden; border: 2px solid var(--border-light); cursor: pointer; transition: all 0.3s ease; max-width: 220px; box-shadow: none;">
          <div style="position: relative; width: 100%; aspect-ratio: 1/1; overflow: hidden;">
            <img src="${imageUrl}" alt="${heading}" 
                 class="ken-burns-media"
                 style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%232d2d2d%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%23666%22 font-size=%228%22%3E이미지 로드 실패%3C/text%3E%3C/svg%3E';">
            <!-- 호버 오버레이 (6개 버튼) -->
            <div class="image-item-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, rgba(0,0,0,0.85), rgba(0,0,0,0.75)); display: none; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 8px; box-sizing: border-box;">
              <button type="button" class="view-image-btn" data-image-url="${imageUrl}" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">🔍 크게 보기</button>
              <button type="button" class="assign-to-heading-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">📍 소제목에 배치</button>
              <button type="button" class="create-video-from-image-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 700;">🎬 영상 만들기</button>
              <button type="button" class="regenerate-single-image-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">🔄 재생성</button>
              <button type="button" class="regenerate-ai-image-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">🤖 AI 이미지 생성</button>
              <button type="button" class="replace-from-folder-btn" data-image-index="${index}" data-heading-title="${heading}" data-image-key="${imageKey}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">📁 폴더에서 교체</button>
              <button type="button" class="remove-generated-image-btn" data-image-index="${index}" data-heading-title="${heading}" data-image-key="${imageKey}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">❌ 삭제</button>
            </div>
          </div>
          <div style="padding: 0.75rem;">
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${heading}">
            ${heading}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${prompt}">
              ${prompt}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // ✅ 호버 이벤트 및 버튼 클릭 이벤트 연결
    this.attachImageItemEvents(generatedImagesGrid);
  },

  /**
   * ✅ 이미지 아이템 호버 이벤트 및 버튼 클릭 이벤트 연결
   */
  attachImageItemEvents(container: HTMLElement): void {
    const images = this.getAllImages();
    const imageItems = container.querySelectorAll('.generated-image-item');

    imageItems.forEach(item => {
      const overlay = item.querySelector('.image-item-overlay') as HTMLElement;
      const img = item.querySelector('img') as HTMLImageElement;
      if (!overlay) return;

      const indexStr = (item as HTMLElement).getAttribute('data-image-index') || '';
      const index = Number(indexStr);

      // 호버 이벤트 (오버레이 표시 + 이미지 확대)
      item.addEventListener('mouseenter', () => {
        overlay.style.display = 'flex';
        if (img) img.style.transform = 'scale(1.05)';
        (item as HTMLElement).style.borderColor = 'var(--primary)';
        (item as HTMLElement).style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.4)';
        (item as HTMLElement).style.transform = 'translateY(-4px)';
      });

      item.addEventListener('mouseleave', () => {
        overlay.style.display = 'none';
        if (img) img.style.transform = 'scale(1)';
        (item as HTMLElement).style.borderColor = 'var(--border-light)';
        (item as HTMLElement).style.boxShadow = 'none';
        (item as HTMLElement).style.transform = 'translateY(0)';
      });
    });

    // ✅ 크게 보기 버튼
    container.querySelectorAll('.view-image-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0', 10);
        const image = images[idx];
        const imageUrl = (e.target as HTMLElement).getAttribute('data-image-url') || '';
        const headingTitle = String(image?.heading || '').trim();
        if (headingTitle && imageUrl) {
          showHeadingImagesModal(encodeURIComponent(headingTitle), encodeURIComponent(String(imageUrl || '').trim()));
          return;
        }
        if (imageUrl) showImageModal(imageUrl);
      });
    });

    // ✅ 소제목에 배치하기 버튼
    container.querySelectorAll('.assign-to-heading-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = images[index];
        if (image) {
          await showHeadingSelectionModalV2(image, index);
        }
      });
    });

    // ✅ 선택 이미지로 AI 영상 만들기 (image-to-video)
    container.querySelectorAll('.create-video-from-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = images[index];
        if (!image) return;

        if (typeof (window.api as any)?.generateVeoVideo !== 'function') {
          toastManager.error('AI 영상 기능이 아직 로드되지 않았습니다. 앱을 종료 후 다시 실행하세요.');
          return;
        }

        const headingTitleRaw = String(image.heading || '').trim() || `소제목 ${index + 1}`;
        const heading = normalizeHeadingKeyForVideoCache(headingTitleRaw);

        const toLocalPath = (p: string): string => {
          const raw = String(p || '').trim();
          if (!raw) return '';
          if (/^file:\/\//i.test(raw)) {
            return raw.replace(/^file:\/\//i, '').replace(/^\/+/, '').replace(/\\/g, '/');
          }
          // 일반 경로는 그대로
          return raw.replace(/\\/g, '/');
        };

        let filePath = toLocalPath(String(image.filePath || ''));
        let exists = false;
        try {
          if (filePath && typeof (window.api as any)?.checkFileExists === 'function') {
            exists = await (window.api as any).checkFileExists(filePath);
          }
        } catch {
          exists = false;
        }

        if (!filePath || !exists) {
          // 1) file:// URL에서 경로 추출
          const urlCandidate = String(image.url || image.previewDataUrl || '').trim();
          const maybeLocal = toLocalPath(urlCandidate);
          let localFromUrlExists = false;
          try {
            if (maybeLocal && typeof (window.api as any)?.checkFileExists === 'function') {
              localFromUrlExists = await (window.api as any).checkFileExists(maybeLocal);
            }
          } catch {
            localFromUrlExists = false;
          }
          if (maybeLocal && localFromUrlExists) {
            filePath = maybeLocal;
          } else if (/^https?:\/\//i.test(urlCandidate) && typeof (window.api as any)?.downloadAndSaveImage === 'function') {
            // 2) 원격 URL이면 자동 저장 후 사용
            try {
              const postTitle = String((window as any).currentStructuredContent?.selectedTitle || currentStructuredContent?.selectedTitle || '').trim();
              const postId = currentPostId || undefined;
              const res = await (window.api as any).downloadAndSaveImage(urlCandidate, headingTitleRaw, postTitle || undefined, postId);
              if (!res?.success) {
                throw new Error(String(res?.message || '이미지 저장 실패'));
              }
              const savedPath = String(res?.filePath || res?.savedToLocal || '').trim();
              if (!savedPath) {
                throw new Error('저장된 이미지 경로를 찾을 수 없습니다.');
              }
              filePath = toLocalPath(savedPath);

              // ✅ 저장된 로컬 경로로 ImageManager도 갱신(다음부터는 로컬로 인식)
              try {
                ImageManager.setImage(headingTitleRaw, {
                  ...image,
                  heading: headingTitleRaw,
                  filePath,
                  url: toFileUrlMaybe(filePath),
                  previewDataUrl: toFileUrlMaybe(filePath),
                  provider: String(image.provider || 'local'),
                  savedToLocal: true,
                });
                syncGlobalImagesFromImageManager();
                ImageManager.syncAllPreviews();
              } catch (e) {
                console.warn('[renderer] catch ignored:', e);
              }
            } catch (err) {
              toastManager.error(`이미지 저장 실패: ${(err as Error).message}`);
              return;
            }
          } else {
            toastManager.warning('선택한 이미지가 로컬 파일이 아닙니다. 먼저 "이미지 저장하러 가기"로 저장 후 다시 시도하세요.');
            return;
          }
        }

        const imagePrompt = String(image.prompt || '').trim();
        const fallbackText = String(image.heading || heading || `소제목 ${index + 1}`).trim();
        const basePrompt = imagePrompt || fallbackText;
        const prompt = `${basePrompt} . Create a dynamic cinematic video version of this exact scene that closely matches the still image's subject, composition, background, lighting, and mood.`;
        if (!prompt.trim()) {
          toastManager.error('프롬프트가 비어있습니다.');
          return;
        }

        showVeoProgressOverlay(heading);
        setVeoProgressOverlay('이미지 기반 영상 생성 요청 전송 중...', 2);
        try {
          const result = await generateVeoVideoWithRetry(
            {
              prompt,
              negativePrompt: 'audio, speech, voice, voiceover, narration, music, singing, lyrics, dialogue, party, nightclub, dancing crowd, festival, concert',
              model: 'veo-3.1-generate-preview',
              durationSeconds: 6,
              aspectRatio: '16:9',
              heading,
              imagePath: filePath,
            },
            heading
          );

          if (!result?.success) {
            throw new Error(String(result?.message || 'AI 영상 생성에 실패했습니다.'));
          }

          const outPath = String(result.filePath || '').trim();
          if (!outPath) {
            throw new Error('생성된 영상 경로를 찾을 수 없습니다.');
          }

          await applyHeadingVideoFromFile(heading, outPath, 'veo');
          await refreshMp4FilesList();
          toastManager.success('✅ 이미지 기반 AI 영상 생성 완료!');
        } catch (err) {
          console.error('[AI-VIDEO] 이미지 기반 생성 실패:', err);
          toastManager.error(`이미지 기반 AI 영상 생성 실패: ${(err as Error).message}`);
        } finally {
          hideVeoProgressOverlay();
        }
      });
    });

    // ✅ 재생성 버튼
    container.querySelectorAll('.regenerate-single-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = images[index];
        const heading = image?.heading || `소제목 ${index + 1}`;
        appendLog(`🔄 ${heading} 이미지 재생성 중...`, 'images-log-output');
        toastManager.info(`🔄 이미지 재생성 중...`);
      });
    });

    // ✅ AI 이미지 새로 생성 버튼
    container.querySelectorAll('.regenerate-ai-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = images[index];
        const heading = image?.heading || `소제목 ${index + 1}`;
        await regenerateWithNewAI(index, heading);
      });
    });

    // ✅ 폴더에서 교체 버튼
    container.querySelectorAll('.replace-from-folder-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const el = (e.currentTarget as HTMLElement | null) || (btn as HTMLElement);
        const index = parseInt(String(el?.getAttribute('data-image-index') || '0'), 10);
        const image = images[index];

        // Prefer explicit headingIndex if present, otherwise resolve from heading title
        const headingIndex = Number.isFinite(Number(image?.headingIndex)) ? Number(image?.headingIndex) : -1;
        if (headingIndex >= 0) {
          await showSavedImagesForReplace(headingIndex);
          return;
        }
        const headingTitle = String(image?.heading || '').trim();
        if (headingTitle) {
          const idx = ImageManager.headings.findIndex((h: any) => {
            const t = typeof h === 'string' ? h : (h?.title || '');
            return String(t || '').trim() === headingTitle;
          });
          await showSavedImagesForReplace(idx >= 0 ? idx : 0);
          return;
        }
        await showSavedImagesForReplace(index);
      });
    });

    // ✅ 삭제 버튼
    container.querySelectorAll('.remove-generated-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const el = (e.currentTarget as HTMLElement | null) || (btn as HTMLElement);
        const index = parseInt(String(el?.getAttribute('data-image-index') || '0'), 10);
        const image = images[index];
        const headingTitle = String(image?.heading || '').trim();
        const key = String(getStableImageKey(image) || '').trim();

        if (confirm('이 이미지를 제거하시겠습니까?\n\n💡 하이브리드 모드: 일부 이미지만 남기고 나머지는 AI가 자동 생성합니다!')) {
          // ImageManager에서 해당 이미지 1개만 제거 (소제목 전체 삭제 방지)
          if (headingTitle && key) {
            try {
              const list = ImageManager.getImages(headingTitle) || [];
              const idx = list.findIndex((img: any) => getStableImageKey(img) === key);
              if (idx >= 0) {
                ImageManager.removeImageAtIndex(headingTitle, idx);
              } else {
                ImageManager.removeImageAtIndex(headingTitle, 0);
              }
            } catch {
              this.removeImage(headingTitle);
            }
          } else if (headingTitle) {
            this.removeImage(headingTitle);
          }

          toastManager.success(`✅ 이미지가 제거되었습니다!`);
          appendLog(`❌ [${index + 1}] 이미지 제거 완료`, 'images-log-output');

          // ✅ [2026-03-16 FIX] 삭제 후 양쪽 UI 모두 갱신
          try {
            syncGlobalImagesFromImageManager();
            const allImagesAfterRemove = ImageManager.getAllImages();
            displayGeneratedImages(allImagesAfterRemove);
            updatePromptItemsWithImages(allImagesAfterRemove);
          } catch (e) {
            console.warn('[renderer] 삭제 후 UI 갱신 실패:', e);
          }
        }
      });
    });
  },

  /**
   * 3. 저장된 이미지 모달 업데이트 (열려있을 경우)
   */
  updateLocalImageModal(): void {
    // 모달이 열려있을 때만 업데이트
    const modal = document.querySelector('[data-modal-type="local-image-selection"]');
    if (!modal) return;

    const headingButtons = modal.querySelectorAll('.heading-select-btn');
    headingButtons.forEach((btn) => {
      const headingIndex = parseInt((btn as HTMLElement).dataset.headingIndex || '0');
      const heading = this.headings[headingIndex];
      const headingTitle = typeof heading === 'string' ? heading : (heading?.title || '');

      const hasImage = this.hasImage(headingTitle);

      if (hasImage) {
        (btn as HTMLElement).style.background = 'linear-gradient(135deg, #10b981, #059669)';
        (btn as HTMLElement).style.color = 'white';
        (btn as HTMLElement).style.borderColor = '#10b981';
        (btn as HTMLElement).style.borderWidth = '2px';
        (btn as HTMLElement).style.fontWeight = '600';

        const btnText = (btn as HTMLElement).textContent || '';
        if (!btnText.startsWith('✅')) {
          (btn as HTMLElement).textContent = '✅ ' + btnText.replace(/^✅\s*/, '');
        }
      } else {
        (btn as HTMLElement).style.background = 'var(--bg-tertiary)';
        (btn as HTMLElement).style.color = 'var(--text-strong)';
        (btn as HTMLElement).style.borderColor = 'var(--border-light)';
        (btn as HTMLElement).style.borderWidth = '1px';
        (btn as HTMLElement).style.fontWeight = '500';

        const btnText = (btn as HTMLElement).textContent || '';
        (btn as HTMLElement).textContent = btnText.replace(/^✅\s*/, '');
      }
    });
  }
};

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

// ============================================
// 이벤트 리스너 중복 방지 시스템
// ============================================
const registeredEventListeners = new Map<string, { element: HTMLElement | Document | Window; type: string; handler: EventListener; }>();

function registerEventListener(
  key: string,
  element: HTMLElement | Document | Window,
  type: string,
  handler: EventListener,
  options?: AddEventListenerOptions
): void {
  // 이미 등록된 리스너가 있으면 제거
  if (registeredEventListeners.has(key)) {
    const existing = registeredEventListeners.get(key)!;
    existing.element.removeEventListener(existing.type, existing.handler);
    console.log(`[EventListener] 기존 리스너 제거: ${key}`);
  }

  // 새 리스너 등록
  element.addEventListener(type, handler, options);
  registeredEventListeners.set(key, { element, type, handler });
  console.log(`[EventListener] 새 리스너 등록: ${key}`);
}

function unregisterEventListener(key: string): void {
  if (registeredEventListeners.has(key)) {
    const { element, type, handler } = registeredEventListeners.get(key)!;
    element.removeEventListener(type, handler);
    registeredEventListeners.delete(key);
    console.log(`[EventListener] 리스너 제거: ${key}`);
  }
}

function clearAllEventListeners(): void {
  console.log(`[EventListener] 모든 리스너 제거: ${registeredEventListeners.size}개`);
  registeredEventListeners.forEach(({ element, type, handler }, key) => {
    element.removeEventListener(type, handler);
  });
  registeredEventListeners.clear();
}

// ============================================
// DOM 쿼리 캐싱 시스템
// ============================================
// ✅ performanceUtils.ts의 domCache를 사용 (중복 방지)
// import { domCache } from './performanceUtils.js'; // 이미 전역에서 사용 가능한 경우

// 기존 performanceUtils의 domCache를 사용하거나, 별도 인스턴스 사용
const rendererDomCache = new Map<string, HTMLElement | null>();
let domCacheEnabled = true;

function getElement<T extends HTMLElement = HTMLElement>(selector: string, refresh = false): T | null {
  if (!domCacheEnabled || refresh || !rendererDomCache.has(selector)) {
    const element = document.querySelector(selector) as T | null;
    if (domCacheEnabled) {
      rendererDomCache.set(selector, element);
    }
    return element;
  }
  return rendererDomCache.get(selector) as T | null;
}

function getElementById<T extends HTMLElement = HTMLElement>(id: string, refresh = false): T | null {
  return getElement<T>(`#${id}`, refresh);
}

function clearDomCache(): void {
  console.log(`[DOMCache] 캐시 클리어: ${rendererDomCache.size}개`);
  rendererDomCache.clear();
}

function disableDomCache(): void {
  domCacheEnabled = false;
  clearDomCache();
}

// ============================================
// API 호출 중복 방지 시스템
// ============================================
const apiCallsInProgress = new Map<string, Promise<any>>();

async function preventDuplicateApiCall<T>(
  key: string,
  apiFunction: () => Promise<T>
): Promise<T> {
  // 이미 진행 중인 API 호출이 있으면 대기
  if (apiCallsInProgress.has(key)) {
    console.log(`[API] 중복 호출 방지: ${key} (이미 진행 중)`);
    return apiCallsInProgress.get(key) as Promise<T>;
  }

  // 새로운 API 호출 시작
  const promise = apiFunction()
    .finally(() => {
      apiCallsInProgress.delete(key);
      console.log(`[API] 호출 완료: ${key}`);
    });

  apiCallsInProgress.set(key, promise);
  console.log(`[API] 호출 시작: ${key}`);
  return promise;
}

// ============================================
// 디바운스/스로틀 유틸리티
// ============================================
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ============================================
// 버튼 상태 관리 시스템
// ============================================
const buttonStates = new Map<string, { disabled: boolean; originalText: string; }>();

function setButtonLoading(buttonId: string, loadingText: string = '처리 중...'): void {
  const button = document.getElementById(buttonId) as HTMLButtonElement;
  if (!button) return;

  // 현재 상태 저장
  if (!buttonStates.has(buttonId)) {
    buttonStates.set(buttonId, {
      disabled: button.disabled,
      originalText: button.innerHTML
    });
  }

  button.disabled = true;
  button.innerHTML = loadingText;
  button.style.opacity = '0.7';
  button.style.cursor = 'not-allowed';
  console.log(`[Button] 로딩 상태: ${buttonId}`);
}

function resetButtonState(buttonId: string): void {
  const button = document.getElementById(buttonId) as HTMLButtonElement;
  if (!button) return;

  const savedState = buttonStates.get(buttonId);
  if (savedState) {
    button.disabled = savedState.disabled;
    button.innerHTML = savedState.originalText;
    button.style.opacity = '';
    button.style.cursor = '';
    buttonStates.delete(buttonId);
    console.log(`[Button] 상태 복원: ${buttonId}`);
  }
}

function disableButton(buttonId: string, disabled: boolean = true): void {
  const button = document.getElementById(buttonId) as HTMLButtonElement;
  if (!button) return;

  button.disabled = disabled;
  console.log(`[Button] disabled=${disabled}: ${buttonId}`);
}

// ============================================
// 에러 핸들링 유틸리티
// ============================================
async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
  options: {
    showToast?: boolean;
    logError?: boolean;
    fallbackValue?: T;
  } = {}
): Promise<T | undefined> {
  const { showToast = true, logError = true, fallbackValue } = options;

  try {
    return await operation();
  } catch (error) {
    const message = (error as Error).message || '알 수 없는 오류';

    if (logError) {
      console.error(`[Error] ${context}:`, error);
      appendLog(`❌ ${context}: ${message}`);
    }

    if (showToast && (window as any).toastManager) {
      (window as any).toastManager.error(`❌ ${context}: ${message}`);
    }

    return fallbackValue;
  }
}

// ============================================
// 메모리 관리 유틸리티
// ============================================
const imageDataUrls = new Set<string>();

function createImageDataUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  imageDataUrls.add(url);
  return url;
}

function revokeImageDataUrl(url: string): void {
  if (imageDataUrls.has(url)) {
    URL.revokeObjectURL(url);
    imageDataUrls.delete(url);
    console.log(`[Memory] 이미지 URL 해제: ${url.substring(0, 50)}...`);
  }
}

function revokeAllImageDataUrls(): void {
  console.log(`[Memory] 모든 이미지 URL 해제: ${imageDataUrls.size}개`);
  imageDataUrls.forEach(url => URL.revokeObjectURL(url));
  imageDataUrls.clear();
}

// URL 필드 컨테이너에서 모든 URL 수집
function getAllUrls(): string[] {
  const urlFieldsContainer = document.getElementById('url-fields-container') as HTMLDivElement;
  if (!urlFieldsContainer) return [];
  const urlInputs = urlFieldsContainer.querySelectorAll<HTMLInputElement>('.url-field-input');
  return Array.from(urlInputs)
    .map(input => input.value.trim())
    .filter(url => url.length > 0 && /^https?:\/\//i.test(url));
}

function getUrlsAsString(): string {
  return getAllUrls().join('\n');
}

// 연속 발행 관련 전역 변수
let isContinuousMode = false;
let continuousCountdown = 0;
let continuousInterval: NodeJS.Timeout | null = null;
let continuousQueue: string[] = []; // 연속 발행할 URL/콘텐츠 큐
let __continuousV2Initialized = false; // V2 초기화 플래그

// ✅ [2026-02-08 FIX] 로그 DOM 배치 업데이트 — UI 깜빡거림/지직거림 방지
let _logUpdatePending = false;
let _logPendingEntries: { message: string; timestamp: string }[] = [];

function _flushLogEntries(logOutputs: HTMLElement[]): void {
  const entries = _logPendingEntries.splice(0);
  _logUpdatePending = false;

  if (entries.length === 0) return;

  // DocumentFragment로 DOM 조작 최소화
  logOutputs.forEach(currentLogOutput => {
    // 기존 로그 지우기 (너무 많이 쌓이지 않도록, 200개까지 유지)
    while (currentLogOutput.children.length > 200) {
      currentLogOutput.removeChild(currentLogOutput.firstChild!);
    }

    const fragment = document.createDocumentFragment();
    entries.forEach(({ message, timestamp }) => {
      const logEntry = document.createElement('div');
      logEntry.className = 'log-entry';
      logEntry.style.cssText = `
        padding: 4px 0;
        border-bottom: 1px solid rgba(212, 175, 55, 0.2);
        color: #F4D03F;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        line-height: 1.4;
        word-wrap: break-word;
      `;
      logEntry.textContent = `[${timestamp}] ${message}`;
      fragment.appendChild(logEntry);
    });
    currentLogOutput.appendChild(fragment);
    // ✅ [2026-02-15] scrollTop은 rAF로 배치하여 layout thrashing 방지
    requestAnimationFrame(() => { currentLogOutput.scrollTop = currentLogOutput.scrollHeight; });
  });

  // ✅ [2026-02-15] cp-detail-log 이중 기록 제거
  // updateContinuousProgressModal(log:...)에서 이미 cp-detail-log에 기록하므로
  // _flushLogEntries에서 중복 기록하면 DOM이 2배 속도로 비대해져 UI 깜빡임 유발
  // 따라서 이 경로의 cp-detail-log 기록을 제거함

  // 마지막 항목만 콘솔에 기록 (과다 로그 방지)
  if (entries.length > 0) {
    console.log(`[LOG] 로그 ${entries.length}건 표시 완료: ${entries[entries.length - 1].message}`);
  }
}

// 로그 표시 및 진행상황 표시 함수 개선 (중복 방지)
function appendLog(message: string, logOutputId?: string): void {
  // 중복 로그 방지 강화 - 같은 메시지는 2초 이내에 다시 표시하지 않음
  const now = Date.now();
  const lastMessage = (appendLog as any).lastMessage;
  const lastTime = (appendLog as any).lastTime;

  if (lastMessage === message && lastTime && now - lastTime < 2000) {
    console.log('[LOG] 중복 로그 방지됨:', message);
    return;
  }
  (appendLog as any).lastMessage = message;
  (appendLog as any).lastTime = now;

  console.log('[LOG] 진행상황:', message);

  // 진행 상황을 시각적으로 표시
  const progressIndicator = document.getElementById('progress-indicator');
  const progressText = document.getElementById('progress-text');

  if (progressIndicator && progressText) {
    progressIndicator.style.display = 'block';
    progressText.textContent = message;
    progressText.style.color = message.includes('❌') || message.includes('실패') ? '#ef4444' : '#10b981';

    // 성공 메시지는 3초, 에러 메시지는 5초 후 자동 숨김
    const hideDelay = message.includes('❌') || message.includes('실패') || message.includes('오류') ? 5000 : 3000;
    setTimeout(() => {
      if (progressIndicator && progressText.textContent === message) {
        progressIndicator.style.display = 'none';
      }
    }, hideDelay);
  }

  // 로그 출력 요소들
  let logOutputs: HTMLElement[] = [];

  if (logOutputId) {
    // 특정 로그 출력 요소만 사용
    const specificOutput = document.getElementById(logOutputId) as HTMLElement;
    if (specificOutput) {
      logOutputs = [specificOutput];
    }
  } else {
    // 기본 로그 출력 요소들
    logOutputs = [
      document.getElementById('unified-log-output') as HTMLElement, // 통합 탭 로그
      document.getElementById('log-output') as HTMLElement // 기존 로그
    ].filter(output => output !== null);
  }

  if (logOutputs.length === 0) {
    console.error('[LOG] 로그 출력 요소를 찾을 수 없음!');
    // 대안으로 alert로 표시
    alert(`진행상황: ${message}`);
    return;
  }

  const timestamp = new Date().toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const logText = `[${timestamp}] ${message}`;

  // ✅ [2026-02-08 FIX] requestAnimationFrame으로 DOM 업데이트 배치 — UI 깜빡거림 방지
  // 빠르게 연속 호출되는 로그가 매 프레임마다 한 번만 DOM에 반영됨
  if (!_logUpdatePending) {
    _logUpdatePending = true;
    _logPendingEntries.push({ message, timestamp });
    requestAnimationFrame(() => {
      _flushLogEntries(logOutputs);
    });
  } else {
    _logPendingEntries.push({ message, timestamp });
  }
}

// 위험 지표 업데이트
function updateRiskIndicators(content: StructuredContent | null): void {
  if (!content?.quality) return;

  if (riskAiValue) {
    const risk = content.quality.aiDetectionRisk || 'low';
    riskAiValue.textContent = risk === 'low' ? '낮음' : risk === 'medium' ? '보통' : '높음';
    riskAiValue.className = `value risk-${risk}`;
  }

  if (riskLegalValue) {
    const risk = content.quality.legalRisk || 'safe';
    riskLegalValue.textContent = risk === 'safe' ? '안전' : risk === 'caution' ? '주의' : '위험';
    riskLegalValue.className = `value legal-${risk}`;
  }

  if (riskSeoValue) {
    riskSeoValue.textContent = `${content.quality.seoScore || 0}/100`;
  }

  if (riskSummaryElement) {
    riskSummaryElement.style.display = 'grid';
  }
}

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
        appendLog(`🖼️ ${message}`);
        if (isContinuousMode) {
          try { updateContinuousProgressModal({ log: `🖼️ ${message}` }); } catch { /* 무시 */ }
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

  [licenseModal, settingsModal, externalLinksModal].forEach(modal => {
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
      const contentMode = (contentModeSelect?.value || 'seo') as 'seo' | 'homefeed' | 'affiliate' | 'custom';

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
          retryCount: 3,
          retryDelay: 2000,
          timeout: 600000
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
async function warmupApiConnections(hasGemini: boolean): Promise<void> {
  console.log('[Warmup] API 연결 사전 준비 시작...');

  const warmupUrls: string[] = [];

  if (hasGemini) {
    warmupUrls.push('https://generativelanguage.googleapis.com');
  }

  // 병렬로 모든 API 서버에 연결 테스트
  const warmupPromises = warmupUrls.map(async (url) => {
    try {
      const startTime = Date.now();
      // HEAD 요청으로 빠르게 연결만 테스트 (응답 본문 없음)
      await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors', // CORS 오류 방지
        cache: 'no-store'
      });
      const elapsed = Date.now() - startTime;
      console.log(`[Warmup] ✅ ${url} 연결 완료 (${elapsed}ms)`);
      return { url, success: true, elapsed };
    } catch (error) {
      // 오류가 나도 무시 (warm-up은 선택적)
      console.log(`[Warmup] ⚠️ ${url} 연결 실패 (무시됨):`, (error as Error).message);
      return { url, success: false, elapsed: 0 };
    }
  });

  try {
    const results = await Promise.allSettled(warmupPromises);
    const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
    console.log(`[Warmup] API 연결 사전 준비 완료: ${successCount}/${warmupUrls.length}개 서버 연결됨`);

    // 연결 성공한 서버가 있으면 사용자에게 알림 (로그만)
    if (successCount > 0) {
      console.log('[Warmup] 💡 첫 콘텐츠 생성이 더 빨라집니다!');
    }
  } catch (e) {
    // 전체 실패해도 무시
    console.log('[Warmup] warm-up 완료 (일부 실패)');
  }
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
  const shoppingConnectSettings = document.getElementById('shopping-connect-settings');
  if (shoppingConnectSettings) {
    const observer = new MutationObserver(() => {
      if (shoppingConnectSettings.style.display !== 'none' && affiliateLinkInput.value.trim()) {
        // 쇼핑커넥트 모드 활성화 시 CTA 자동 설정
        if (ctaLinkInput && !ctaLinkInput.value.trim()) {
          ctaLinkInput.value = affiliateLinkInput.value.trim();
        }
        if (ctaTextInput && !ctaTextInput.value.trim()) {
          const randomHook = hookingTexts[Math.floor(Math.random() * hookingTexts.length)];
          ctaTextInput.value = randomHook;
        }
      }
    });
    observer.observe(shoppingConnectSettings, { attributes: true, attributeFilter: ['style'] });
  }
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
  if (!btn) return;

  btn.addEventListener('click', () => {
    // ✅ [2026-02-17] 결제 페이지로 연결 (GitHub Pages)
    window.api.openExternalUrl('https://cd000242-sudo.github.io/naver/');
  });
}

// 메인 초기화 함수 (DOMContentLoaded와 상관없이 한 번만 실행)
async function initializeApplication(): Promise<void> {
  if ((window as any)._appInitialized) {
    console.log('[Init] 애플리케이션이 이미 초기화되어 중복 실행 방지');
    return;
  }
  (window as any)._appInitialized = true;

  console.log('[Init] 애플리케이션 초기화 시작');

  await initPaywallSystem();

  // DOM 캐시 초기화
  UnifiedDOMCache.init();

  appendLog('📝 자동화 시스템이 준비되었습니다.');

  // ✅ API 키 자동 로드 및 확인
  await autoLoadApiKeys(); // API 키 자동 로드 (한 번만 실행)

  // ✅ 저장된 설정 확인 로그
  try {
    const currentConfig = await window.api.getConfig();
    if (currentConfig) {
      // ✅ [2026-01-26 FIX] 전역 config 캐시 (getGenerator()에서 perplexity 감지용)
      (window as any).appConfig = currentConfig;
      const hasGemini = !!currentConfig.geminiApiKey;

      if (hasGemini) {
        appendLog('✅ 저장된 API 키가 로드되었습니다. 바로 사용 가능합니다!');

        // ✅ API 연결 사전 준비 (warm-up) - 백그라운드에서 DNS 및 TLS 캐싱
        // 첫 콘텐츠 생성 시 연결 시간을 줄여줌
        setTimeout(() => {
          warmupApiConnections(hasGemini);
        }, 2000); // 앱 로드 2초 후 시작
      }
    }
  } catch (e) {
    // 무시
  }

  initUnifiedTab();
  initImageLibrary();
  initThumbnailGenerator();
  initLicenseModal();
  initPriceInfoModal();  // ✅ [2026-01-27] initSettingsModal과 충돌 방지로 이름 변경
  try {
    initGeminiModelSync();
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }
  initCredentialsSave();
  initTitleGeneration();
  initHeadingImageGeneration();
  initApiGuideModal();
  initUserGuideModal();
  initContentHeadingImageGeneration();
  initCharCountDisplay();
  initImageManagementTab();
  initDashboard();
  showGeminiInstabilityNotice(); // ✅ [2026-03-21] Gemini 서버 불안정 공지
  initTabSwitching();
  initLicenseBadge(); // 라이선스 배지 초기화
  initCustomerServiceButton(); // 고객센터 버튼 초기화
  initPurchaseInquiryButton(); // 구매 문의하기 버튼 초기화
  initGlobalRefreshButton(); // 전체 초기화 버튼 초기화
  initUnifiedImageEventHandlers(); // ✅ 통합 이미지 이벤트 핸들러 초기화
  initShoppingConnectCTA(); // ✅ 쇼핑커넥트 CTA 자동 설정 초기화


  // ✅ 임시 저장 데이터 복구 확인
  setTimeout(() => {
    restoreAutosavedContent();
  }, 1000);

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

// ============================================
// 이미지 라이브러리 초기화
// ============================================
async function initImageLibrary(): Promise<void> {
  // 저작권 경고 확인
  const acceptCopyrightBtn = document.getElementById('accept-copyright-warning') as HTMLButtonElement;
  const libraryContent = document.getElementById('library-content') as HTMLDivElement;
  const copyrightWarning = document.querySelector('.copyright-warning') as HTMLDivElement;

  if (acceptCopyrightBtn && libraryContent && copyrightWarning) {
    // 이미 확인했는지 로컬 스토리지에서 확인 (기본적으로 허용)
    const copyrightAccepted = localStorage.getItem('copyright-warning-accepted');
    if (copyrightAccepted === 'true') {
      copyrightWarning.style.display = 'none';
      libraryContent.style.display = 'block';
    } else {
      // 처음 방문 시 자동으로 확인 처리 (사용자 편의를 위해)
      localStorage.setItem('copyright-warning-accepted', 'true');
      copyrightWarning.style.display = 'none';
      libraryContent.style.display = 'block';
      toastManager.info('저작권 경고를 확인했습니다. 이미지 라이브러리를 사용할 수 있습니다.');
    }

    acceptCopyrightBtn.addEventListener('click', () => {
      // 로컬 스토리지에 저장
      localStorage.setItem('copyright-warning-accepted', 'true');

      // UI 업데이트
      copyrightWarning.style.display = 'none';
      libraryContent.style.display = 'block';

      // 성공 토스트
      toastManager.success('저작권 경고를 확인했습니다. 이미지 라이브러리를 사용할 수 있습니다.');
    });
  }

  const collectImagesBtn = document.getElementById('collect-images-btn') as HTMLButtonElement;
  const imageCategoryFilter = document.getElementById('image-category-filter') as HTMLSelectElement;
  const imageSearchKeywords = document.getElementById('image-search-keywords') as HTMLInputElement;
  const libraryImagesGrid = document.getElementById('library-images-grid') as HTMLDivElement;

  // 카테고리 로드
  if (imageCategoryFilter) {
    try {
      const categories = await window.api.getLibraryCategories();
      imageCategoryFilter.innerHTML = '<option value="">전체</option>' +
        categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

      imageCategoryFilter.addEventListener('change', async () => {
        await loadLibraryImages(imageCategoryFilter.value);
      });
    } catch (error) {
      console.error('카테고리 로드 실패:', error);
    }
  }

  // 고화질 토글 설정
  const highQualityToggle = document.getElementById('library-high-quality-toggle') as HTMLInputElement;
  if (highQualityToggle) {
    // 저장된 설정 불러오기
    const savedSetting = localStorage.getItem('library-use-high-quality');
    highQualityToggle.checked = savedSetting === 'true';

    // 토글 이벤트
    highQualityToggle.addEventListener('change', () => {
      localStorage.setItem('library-use-high-quality', highQualityToggle.checked.toString());

      // 이미지 다시 로드
      const currentCategory = imageCategoryFilter?.value;
      loadLibraryImages(currentCategory);

      toastManager.info(highQualityToggle.checked ? '고화질 모드로 전환되었습니다.' : '미리보기 모드로 전환되었습니다.');
    });
  }

  // 이미지 수집 버튼
  if (collectImagesBtn && imageSearchKeywords) {
    collectImagesBtn.addEventListener('click', async () => {
      const keywords = imageSearchKeywords.value.trim();
      if (!keywords) {
        if ((window as any).toastManager) (window as any).toastManager.warning('키워드를 입력해주세요.');
        return;
      }

      collectImagesBtn.disabled = true;
      collectImagesBtn.textContent = '수집 중...';

      // 선택된 크롤링 소스 확인
      const selectedSources: string[] = [];
      document.querySelectorAll('.library-source-checkbox:checked').forEach(checkbox => {
        selectedSources.push((checkbox as HTMLInputElement).value);
      });

      // 기본적으로 크롤링 소스 사용, 없으면 경고
      if (selectedSources.length === 0) {
        if ((window as any).toastManager) (window as any).toastManager.warning('⚠️ 수집할 소스를 하나 이상 선택해주세요.');
        collectImagesBtn.disabled = false;
        collectImagesBtn.textContent = '이미지 수집';
        return;
      }

      try {
        // 선택된 소스들을 사용해서 이미지 수집
        const result = await window.api.collectImagesByTitle(keywords, selectedSources);
        if (result.success) {
          if ((window as any).toastManager) (window as any).toastManager.success(`✅ ${result.count}개의 이미지가 수집되었습니다.`);
          await loadLibraryImages();

          // 카테고리 새로고침
          const categories = await window.api.getLibraryCategories();
          if (imageCategoryFilter) {
            imageCategoryFilter.innerHTML = '<option value="">전체</option>' +
              categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
          }
        } else {
          if ((window as any).toastManager) (window as any).toastManager.error(`❌ 이미지 수집 실패: ${result.message || '알 수 없는 오류'}`);
        }
      } catch (error) {
        if ((window as any).toastManager) (window as any).toastManager.error(`❌ 오류: ${(error as Error).message}`);
      } finally {
        collectImagesBtn.disabled = false;
        collectImagesBtn.textContent = '이미지 수집';
      }
    });
  }

  // 이미지 그리드 초기 로드
  await loadLibraryImages();
}

async function loadLibraryImages(category?: string): Promise<void> {
  const libraryImagesGrid = document.getElementById('library-images-grid') as HTMLDivElement;
  if (!libraryImagesGrid) return;

  try {
    const titleInput = document.getElementById('post-title') as HTMLInputElement;
    const keywords = titleInput?.value.trim() ? [titleInput.value.trim()] : undefined;
    const images = await window.api.getLibraryImages(category, keywords);

    if (images.length === 0) {
      libraryImagesGrid.innerHTML = '<p class="text-center text-muted" style="grid-column: 1 / -1; padding: 2rem;">수집된 이미지가 없습니다.</p>';
      return;
    }

    // 고해상도 이미지 사용 옵션 확인
    const useHighQuality = localStorage.getItem('library-use-high-quality') === 'true';

    libraryImagesGrid.innerHTML = images.map(img => `
      <div class="image-item" data-image-id="${img.id}" style="position: relative;">
        <img src="${useHighQuality ? (img.url || img.previewDataUrl) : (img.previewDataUrl || img.url)}"
             alt="${img.sourceTitle || ''}"
             loading="lazy"
             style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px;">
        <div class="image-quality-indicator" style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">
          ${useHighQuality ? '고화질' : '미리보기'}
        </div>
        <div class="image-item-overlay">
          <button type="button" class="use-image-btn" data-image-id="${img.id}" title="이 이미지를 사용하여 블로그에 삽입">사용하기</button>
          <button type="button" class="save-image-btn" data-image-path="${img.filePath}" title="이 이미지를 로컬에 저장">로컬 저장</button>
          <button type="button" class="delete-image-btn" data-image-id="${img.id}" title="이 이미지를 라이브러리에서 삭제">삭제</button>
        </div>
      </div>
    `).join('');

    // 호버 이벤트는 CSS로 처리됨 (.image-item:hover .image-item-overlay)

    // 버튼 이벤트
    libraryImagesGrid.querySelectorAll('.use-image-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const imageId = (btn as HTMLButtonElement).getAttribute('data-image-id');
        if (imageId) {
          useLibraryImage(imageId);
        }
      });
    });

    libraryImagesGrid.querySelectorAll('.save-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const filePath = (btn as HTMLButtonElement).getAttribute('data-image-path');
        if (filePath) {
          try {
            const success = await window.api.saveImageToLocal(filePath, `image-${Date.now()}.jpg`);
            if (success) {
              alert('✅ 이미지가 로컬에 저장되었습니다.');
            } else {
              alert('❌ 이미지 저장에 실패했습니다.');
            }
          } catch (error) {
            alert(`❌ 오류: ${(error as Error).message}`);
          }
        }
      });
    });

    libraryImagesGrid.querySelectorAll('.delete-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const imageId = (btn as HTMLButtonElement).getAttribute('data-image-id');
        if (imageId && confirm('이미지를 삭제하시겠습니까?')) {
          try {
            const success = await window.api.deleteLibraryImage(imageId);
            if (success) {
              await loadLibraryImages(category);
            }
          } catch (error) {
            alert(`❌ 삭제 실패: ${(error as Error).message}`);
          }
        }
      });
    });
  } catch (error) {
    console.error('이미지 로드 실패:', error);
    libraryImagesGrid.innerHTML = '<p class="text-center text-muted" style="grid-column: 1 / -1; padding: 2rem;">이미지를 불러오는 중 오류가 발생했습니다.</p>';
  }
}

async function useLibraryImage(imageId: string): Promise<void> {
  try {
    const images = await window.api.getLibraryImages();
    const image = images.find(img => img.id === imageId);
    if (!image) {
      alert('이미지를 찾을 수 없습니다.');
      return;
    }

    // 이미지 선택 모달 열기
    const libraryImageModal = document.getElementById('library-image-modal') as HTMLDivElement;
    const libraryModalImagePreview = document.getElementById('library-modal-image-preview') as HTMLImageElement;
    const useLibraryImageBtn = document.getElementById('use-library-image-btn') as HTMLButtonElement;
    const saveLibraryImageLocalBtn = document.getElementById('save-library-image-local-btn') as HTMLButtonElement;
    const deleteLibraryImageBtn = document.getElementById('delete-library-image-btn') as HTMLButtonElement;

    if (libraryImageModal && libraryModalImagePreview) {
      libraryModalImagePreview.src = toFileUrlMaybe(image.previewDataUrl || image.url || '');

      // 이미지 사용 버튼
      if (useLibraryImageBtn) {
        useLibraryImageBtn.onclick = () => {
          // 이미지 사용 로직 (나중에 구현)
          alert(`이미지 "${image.sourceTitle || imageId}"를 사용합니다.`);
          libraryImageModal.setAttribute('aria-hidden', 'true');
          libraryImageModal.style.display = 'none';
        };
      }

      // 로컬 저장 버튼
      if (saveLibraryImageLocalBtn) {
        saveLibraryImageLocalBtn.onclick = async () => {
          try {
            const success = await window.api.saveImageToLocal(image.filePath, `image-${Date.now()}.jpg`);
            if (success) {
              alert('✅ 이미지가 로컬에 저장되었습니다.');
            } else {
              alert('❌ 이미지 저장에 실패했습니다.');
            }
          } catch (error) {
            alert(`❌ 오류: ${(error as Error).message}`);
          }
        };
      }

      // 삭제 버튼
      if (deleteLibraryImageBtn) {
        deleteLibraryImageBtn.onclick = async () => {
          if (confirm('이미지를 삭제하시겠습니까?')) {
            try {
              const success = await window.api.deleteLibraryImage(imageId);
              if (success) {
                alert('✅ 이미지가 삭제되었습니다.');
                libraryImageModal.setAttribute('aria-hidden', 'true');
                libraryImageModal.style.display = 'none';
                await loadLibraryImages();
              }
            } catch (error) {
              alert(`❌ 삭제 실패: ${(error as Error).message}`);
            }
          }
        };
      }

      libraryImageModal.setAttribute('aria-hidden', 'false');
      libraryImageModal.style.display = 'flex';
    }
  } catch (error) {
    alert(`❌ 오류: ${(error as Error).message}`);
  }
}

// 라이브러리 이미지 모달 닫기 (전역 초기화)
const libraryImageModalForClose = document.getElementById('library-image-modal') as HTMLDivElement;
const closeLibraryImageButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-close-library-image]'));
if (libraryImageModalForClose) {
  closeLibraryImageButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      libraryImageModalForClose.setAttribute('aria-hidden', 'true');
      libraryImageModalForClose.style.display = 'none';
    });
  });

  libraryImageModalForClose.addEventListener('click', (e) => {
    if (e.target === libraryImageModalForClose) {
      libraryImageModalForClose.setAttribute('aria-hidden', 'true');
      libraryImageModalForClose.style.display = 'none';
    }
  });
}

// ============================================
// 썸네일 생성기 초기화 - ✅ 대폭 개선
// ============================================

// 썸네일 생성기 전역 상태
let thumbnailBackgroundImage: string | null = null;
let thumbnailBackgroundDataUrl: string | null = null;

function switchToTab(tabName: string): void {
  // 모든 탭 버튼에서 active 제거
  const tabButtons = document.querySelectorAll('.tab-button');
  tabButtons.forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  // 모든 탭 패널 숨김
  const tabPanels = document.querySelectorAll('.tab-panel');
  tabPanels.forEach(panel => {
    panel.classList.remove('active');
  });

  // 지정된 탭 활성화
  const targetButton = document.querySelector(`[data-tab="${tabName}"]`) as HTMLElement;
  const targetPanel = document.getElementById(`tab-${tabName}`) as HTMLElement;

  if (targetButton && targetPanel) {
    targetButton.classList.add('active');
    targetButton.setAttribute('aria-selected', 'true');
    targetPanel.classList.add('active');
  }
}


// 즐겨찾기 컨텐츠 생성
function generateFavoritesContent(): string {
  const favorites = getFavoriteSettings();

  if (favorites.length === 0) {
    return `
      <div style="text-align: center; padding: 3rem; color: #6b7280;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⭐</div>
        <h3>즐겨찾기가 없습니다</h3>
        <p>자주 사용하는 설정을 즐겨찾기에 추가해보세요.</p>
      </div>
    `;
  }

  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; padding: 0;">
      ${favorites.map((fav, index) => `
        <div class="unified-item" data-index="${index}" data-type="favorites" onclick="selectUnifiedItem(this)" ondblclick="applyUnifiedItem('favorites', ${index})" style="
          border: 2px solid #e5e7eb; border-radius: 12px; padding: 1.5rem;
          cursor: pointer; transition: all 0.2s; background: white;
        ">
          <div style="display: flex; align-items: start; gap: 1rem;">
            <div style="width: 40px; height: 40px; border-radius: 8px; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; color: white; font-size: 1.2rem;">
              ⭐
            </div>
            <div style="flex: 1;">
              <h4 style="margin: 0 0 0.5rem 0; font-size: 1rem; font-weight: 600; color: #1f2937;">${fav.name}</h4>
              <p style="margin: 0 0 0.5rem 0; font-size: 0.8rem; color: #6b7280;">${fav.description}</p>
              <div style="display: flex; align-items: center; gap: 1rem; font-size: 0.75rem; color: #9ca3af;">
                <span>🎯 ${fav.category || '일반'}</span>
                <span>📊 ${fav.usageCount || 0}회 사용</span>
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// 템플릿 컨텐츠 생성
function generateTemplatesContent(): string {
  const templates = getEnhancedTemplates();

  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; padding: 0;">
      ${templates.map((template, index) => `
        <div class="unified-item" data-index="${index}" data-type="templates" onclick="selectUnifiedItem(this)" ondblclick="applyUnifiedItem('templates', ${index})" style="
          border: 2px solid #e5e7eb; border-radius: 12px; padding: 1.5rem;
          cursor: pointer; transition: all 0.2s; background: white; position: relative;
        ">
          <div style="position: absolute; top: 1rem; right: 1rem;">
            <span style="background: ${template.color}; color: white; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">${template.category}</span>
          </div>
          <div style="display: flex; align-items: start; gap: 1rem;">
            <div style="width: 50px; height: 50px; border-radius: 10px; background: ${template.bgColor}; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.5rem;">
              ${template.icon}
            </div>
            <div style="flex: 1;">
              <h4 style="margin: 0 0 0.5rem 0; font-size: 1.1rem; font-weight: 600; color: #1f2937;">${template.name}</h4>
              <p style="margin: 0 0 0.75rem 0; font-size: 0.85rem; color: #6b7280; line-height: 1.4;">${template.description}</p>
              <div style="display: flex; align-items: center; gap: 1rem; font-size: 0.75rem; color: #9ca3af;">
                <span>📊 ${template.wordCount}자</span>
                <span>⭐ ${template.popularity}/5.0</span>
                <span>👥 ${template.usageCount}회 사용</span>
              </div>
              <div style="margin-top: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.25rem;">
                ${template.tags.map(tag => `<span style="background: #f3f4f6; color: #374151; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem;">${tag}</span>`).join('')}
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// 향상된 템플릿 데이터
function getEnhancedTemplates(): Array<{
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  bgColor: string;
  wordCount: number;
  popularity: number;
  usageCount: number;
  tags: string[];
}> {
  return [
    {
      name: '📰 뉴스 스타일',
      description: '최신 뉴스나 트렌드 정보를 전문적으로 전달하는 형식입니다. 객관적이고 신뢰할 수 있는 콘텐츠를 생성합니다.',
      category: '정보',
      icon: '📰',
      color: '#3b82f6',
      bgColor: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
      wordCount: 1200,
      popularity: 4.8,
      usageCount: 1247,
      tags: ['뉴스', '트렌드', '정보', '전문성']
    },
    {
      name: '⭐ 제품 리뷰',
      description: '제품이나 서비스의 장단점을 분석하고 사용자 경험을 공유하는 리뷰 형식입니다.',
      category: '리뷰',
      icon: '⭐',
      color: '#f59e0b',
      bgColor: 'linear-gradient(135deg, #f59e0b, #d97706)',
      wordCount: 800,
      popularity: 4.6,
      usageCount: 892,
      tags: ['리뷰', '제품', '서비스', '분석']
    },
    {
      name: '📚 사용법 가이드',
      description: '단계별로 설명하는 사용법이나 튜토리얼 형식입니다. 초보자도 쉽게 따라할 수 있도록 구성됩니다.',
      category: '교육',
      icon: '📚',
      color: '#10b981',
      bgColor: 'linear-gradient(135deg, #10b981, #059669)',
      wordCount: 1500,
      popularity: 4.7,
      usageCount: 756,
      tags: ['가이드', '튜토리얼', '교육', '단계별']
    },
    {
      name: '📖 스토리텔링',
      description: '이야기 형식으로 콘텐츠를 전달하는 형식입니다. 독자의 공감을 불러일으키는 감성적인 접근을 합니다.',
      category: '스토리',
      icon: '📖',
      color: '#8b5cf6',
      bgColor: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
      wordCount: 1000,
      popularity: 4.5,
      usageCount: 634,
      tags: ['스토리', '이야기', '감성', '공감']
    },
    {
      name: '💡 꿀팁 공유',
      description: '실용적이고 도움이 되는 생활 꿀팁이나 노하우를 공유하는 형식입니다.',
      category: '라이프',
      icon: '💡',
      color: '#06b6d4',
      bgColor: 'linear-gradient(135deg, #06b6d4, #0891b2)',
      wordCount: 600,
      popularity: 4.4,
      usageCount: 523,
      tags: ['꿀팁', '라이프', '실용', '노하우']
    },
    {
      name: '🔬 전문 분석',
      description: '데이터와 사실에 기반한 전문적인 분석 콘텐츠입니다. 신뢰할 수 있는 정보를 제공합니다.',
      category: '분석',
      icon: '🔬',
      color: '#ef4444',
      bgColor: 'linear-gradient(135deg, #ef4444, #dc2626)',
      wordCount: 1800,
      popularity: 4.9,
      usageCount: 445,
      tags: ['분석', '데이터', '전문성', '신뢰성']
    },
    {
      name: '🎯 비교 분석',
      description: '여러 옵션을 비교하고 장단점을 분석하는 형식입니다. 선택에 도움이 되는 정보를 제공합니다.',
      category: '비교',
      icon: '🎯',
      color: '#f97316',
      bgColor: 'linear-gradient(135deg, #f97316, #ea580c)',
      wordCount: 1400,
      popularity: 4.6,
      usageCount: 398,
      tags: ['비교', '분석', '선택', '장단점']
    },
    {
      name: '🌟 성공 사례',
      description: '실제 성공 사례를 공유하고 교훈을 전달하는 형식입니다. 동기부여 콘텐츠에 적합합니다.',
      category: '동기부여',
      icon: '🌟',
      color: '#ec4899',
      bgColor: 'linear-gradient(135deg, #ec4899, #db2777)',
      wordCount: 900,
      popularity: 4.3,
      usageCount: 312,
      tags: ['성공', '사례', '동기부여', '교훈']
    },
    {
      name: '🤝 인터뷰 형식',
      description: 'Q&A 형식의 인터뷰 콘텐츠입니다. 전문가의 의견을 자연스럽게 전달합니다.',
      category: '인터뷰',
      icon: '🤝',
      color: '#84cc16',
      bgColor: 'linear-gradient(135deg, #84cc16, #65a30d)',
      wordCount: 1100,
      popularity: 4.2,
      usageCount: 267,
      tags: ['인터뷰', 'Q&A', '전문가', '의견']
    },
    {
      name: '📈 트렌드 분석',
      description: '시장 트렌드와 미래 전망을 분석하는 콘텐츠입니다. 인사이트를 제공합니다.',
      category: '트렌드',
      icon: '📈',
      color: '#6366f1',
      bgColor: 'linear-gradient(135deg, #6366f1, #4f46e5)',
      wordCount: 1300,
      popularity: 4.7,
      usageCount: 589,
      tags: ['트렌드', '분석', '미래', '인사이트']
    }
  ];
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
  modal.addEventListener('click', (e) => {
    console.log('[CategoryModal] Modal click detected, target:', e.target, 'modal:', modal);
    console.log('[CategoryModal] e.target === modal:', e.target === modal);
    console.log('[CategoryModal] justOpened:', justOpened);
    // ✅ 열린 직후에는 닫기 무시 (이벤트 버블링 방지)
    if (justOpened) {
      console.log('[CategoryModal] Ignoring click - modal just opened');
      return;
    }
    if (e.target === modal) {
      closeModal();
    }
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

  if (semiAutoTitle) {
    semiAutoTitle.addEventListener('input', () => {
      const sc = (window as any).currentStructuredContent;
      if (sc) {
        sc.title = semiAutoTitle.value;
        sc.selectedTitle = semiAutoTitle.value;
      }
    });
  }

  if (semiAutoContent) {
    semiAutoContent.addEventListener('input', () => {
      const sc = (window as any).currentStructuredContent;
      if (sc) {
        sc.bodyPlain = semiAutoContent.value;
        sc.content = semiAutoContent.value;
        // ✅ [2026-02-28 FIX] 사용자 직접 편집 플래그 — applyStructuredContent에서 100% 원문 반영 분기 활성화
        sc._bodyManuallyEdited = true;
      }
    });
  }

  if (semiAutoHashtags) {
    semiAutoHashtags.addEventListener('input', () => {
      const sc = (window as any).currentStructuredContent;
      if (sc) {
        // 입력된 해시태그 문자열을 그대로 저장 (fillSemiAutoFields에서 string도 처리함)
        sc.hashtags = semiAutoHashtags.value;
      }
    });
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
      await paraphraseContent();
    });
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
            timeout: 600000 // ✅ 10분 타임아웃 (크롤링 + Gemini 폴백 시간 고려)
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
        alert(`❌ 글 생성 중 오류가 발생했습니다.\n\n오류: ${errorMessage}\n\n콘솔을 확인해주세요.`);
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

        if (errorMessage.includes('API 키') || errorMessage.includes('GEMINI_API_KEY') || errorMessage.includes('설정되지 않')) {
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

        alert(`❌ 글 생성 중 오류가 발생했습니다.\n\n오류: ${errorMessage}\n${solutionGuide}`);
        appendLog(`❌ 키워드 기반 글 생성 실패: ${errorMessage}`);
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
    const skipImages = (document.getElementById('unified-skip-images') as HTMLInputElement)?.checked || false;
    const skipCta = (document.getElementById('unified-skip-cta') as HTMLInputElement)?.checked || false;
    const ctasUi = readUnifiedCtasFromUi();
    const ctaText = ctasUi[0]?.text || (document.getElementById('unified-cta-text') as HTMLInputElement)?.value || '';
    const ctaLink = ctasUi[0]?.link || (document.getElementById('unified-cta-link') as HTMLInputElement)?.value || '';
    const ctaPosition = ((document.getElementById('unified-cta-position') as HTMLSelectElement)?.value as 'top' | 'middle' | 'bottom') || 'bottom';
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
    if (inlineSelectedAccountIds.length === 0) {
      toastManager.warning('발행할 계정을 먼저 선택해주세요.');
      return;
    }

    const settings = collectCurrentSettings();
    if (!settings) {
      toastManager.warning('먼저 글을 생성하고 이미지를 세팅해주세요.');
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
        structuredContent: JSON.parse(JSON.stringify(settings.structuredContent)),
        generatedImages: JSON.parse(JSON.stringify(settings.generatedImages)),
        formData: JSON.parse(JSON.stringify(settings.formData)),
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

    const intervalSeconds = parseInt((document.getElementById('ma-interval-inline') as HTMLInputElement)?.value || '30');

    if (!confirm(`${publishQueue.length}개 계정에 순차적으로 발행합니다. 계속하시겠습니까?`)) return;

    appendLog(`🚀 일괄 발행 시작: ${publishQueue.length}개 계정`);

    // ✅ [2026-03-17] 예약 모드 항목들에 scheduleDistributor 시간 분산 적용
    {
      const scheduleItems = publishQueue.filter(item => item.publishMode === 'schedule');
      if (scheduleItems.length > 1 && typeof (window as any).distributeWithProtection === 'function') {
        const firstItem = scheduleItems[0];
        (window as any).distributeWithProtection(scheduleItems, {
          baseDate: firstItem.scheduleDate || new Date().toISOString().split('T')[0],
          baseTime: firstItem.scheduleTime || '09:00',
          intervalMinutes: 360,
        }, (msg: string, level: string) => appendLog(`[예약분산] ${msg}`));
        appendLog(`📅 ${scheduleItems.length}개 예약 항목에 시간 분산 적용 완료`);
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

          // ✅ 발행 결과를 추적하기 위한 Promise
          let publishSuccess = false;
          let publishError: string | null = null;
          let resultReceived = false; // 중복 방지 플래그

          const publishPromise = new Promise<boolean>((resolve) => {
            const statusHandler = (status: { success: boolean; message?: string; cancelled?: boolean }) => {
              if (resultReceived) return; // 이미 처리됨
              resultReceived = true;

              if (status.cancelled) {
                publishError = '발행이 사용자에 의해 취소되었습니다.';
                resolve(false);
              } else if (status.success) {
                resolve(true);
              } else {
                publishError = status.message || '발행 실패';
                resolve(false);
              }
            };
            (window.api as any).on('automation:status', statusHandler);

            // 타임아웃: 5분 후에도 응답이 없으면 실패로 처리
            setTimeout(() => {
              if (!resultReceived) {
                resultReceived = true;
                publishError = '발행 시간 초과';
                resolve(false);
              }
            }, 5 * 60 * 1000);
          });

          // 발행 시작
          handleSemiAutoPublish();

          // 발행 결과 대기
          publishSuccess = await publishPromise;

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
            appendLog(`⏳ ${intervalSeconds}초 대기 중... (다음 발행까지)`);
            await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
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

  // 이벤트 리스너 등록
  document.getElementById('add-to-queue-btn')?.addEventListener('click', addToQueue);
  document.getElementById('clear-queue-btn')?.addEventListener('click', clearQueue);
  document.getElementById('batch-publish-btn')?.addEventListener('click', executeBatchPublish);

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
  document.getElementById('ma-add-account-inline')?.addEventListener('click', () => {
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

  // ✅ CTA 위치/미리보기/AI 생성 UI 숨김 (요청사항)
  try {
    const ctaPositionSelect = document.getElementById('unified-cta-position') as HTMLSelectElement | null;
    if (ctaPositionSelect) {
      const wrapper = ctaPositionSelect.closest('.form-group') as HTMLElement | null;
      if (wrapper) wrapper.style.display = '';
      else ctaPositionSelect.style.display = '';
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

// ✅ 글 선택 모달 표시
function showPostSelectionModal(
  posts: any[],
  onSelect: (post: any) => void,
  options?: { defaultCategory?: string }
): void {
  // 기존 모달 제거
  const existingModal = document.getElementById('post-selection-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'post-selection-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483646;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: var(--bg-primary);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  `;

  const normalizeKey = (v: unknown): string => {
    const s = String(v || '').trim();
    return s ? s : 'uncategorized';
  };

  let activeCategory = String(options?.defaultCategory || '').trim();
  const allCategoryKey = '__all__';
  if (!activeCategory) activeCategory = allCategoryKey;

  const categories = Array.from(
    new Set(
      (posts || []).map((p) => normalizeKey((p as any)?.category))
    )
  );
  categories.sort((a, b) => {
    if (a === 'uncategorized' && b !== 'uncategorized') return 1;
    if (b === 'uncategorized' && a !== 'uncategorized') return -1;
    return getGeneratedPostCategoryLabel(a).localeCompare(getGeneratedPostCategoryLabel(b), 'ko');
  });

  const computeList = (categoryKey: string) => {
    const filtered = (posts || []).filter((p) => {
      if (categoryKey === allCategoryKey) return true;
      return normalizeKey((p as any)?.category) === normalizeKey(categoryKey);
    });
    const published = filtered.filter((p) => p.publishedUrl);
    const unpublished = filtered.filter((p) => !p.publishedUrl);
    const sorted = [...published, ...unpublished].slice(0, 40);
    return { filtered, published, unpublished, sorted };
  };

  const initial = computeList(activeCategory);

  content.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h3 style="margin: 0; font-size: 1.25rem; color: var(--text-strong);">📝 이전 작성글 선택</h3>
      <button id="close-post-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
    </div>
    <p style="color: var(--text-muted); margin-bottom: 0.5rem; font-size: 0.9rem;">엮을 글을 선택하세요. 선택한 글의 링크가 CTA에 자동으로 입력됩니다.</p>
    <div style="display:flex; gap: 0.5rem; align-items:center; margin-bottom: 0.75rem; flex-wrap: wrap;">
      <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700;">카테고리</div>
      <select id="post-category-filter" style="flex: 1; min-width: 180px; padding: 0.45rem 0.6rem; border-radius: 8px; border: 1px solid var(--border-medium); background: var(--bg-secondary); color: var(--text-strong);">
        <option value="${allCategoryKey}">전체</option>
        ${categories
      .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(getGeneratedPostCategoryLabel(k))}</option>`)
      .join('')}
      </select>
    </div>
    <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
      <span id="post-selection-published-badge" style="padding: 0.25rem 0.5rem; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">✅ 발행됨 ${initial.published.length}개</span>
      <span id="post-selection-unpublished-badge" style="padding: 0.25rem 0.5rem; background: rgba(156, 163, 175, 0.15); color: var(--text-muted); border-radius: 4px; font-size: 0.8rem;">⏳ 미발행 ${initial.unpublished.length}개</span>
    </div>
    <div id="post-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
      ${initial.sorted.map((post, idx) => `
        <div class="post-item" data-post-index="${posts.indexOf(post)}" style="padding: 1rem; background: ${post.publishedUrl ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05))' : 'var(--bg-secondary)'}; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s; border: 2px solid ${post.publishedUrl ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-light)'};">
          <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
            <span style="font-size: 1.5rem; line-height: 1;">${post.publishedUrl ? '✅' : '⏳'}</span>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${post.title || '제목 없음'}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">
                ${post.createdAt ? new Date(post.createdAt).toLocaleDateString('ko-KR') : '날짜 없음'}
                ${post.publishedAt ? ' • 발행: ' + new Date(post.publishedAt).toLocaleDateString('ko-KR') : ''}
              </div>
              <div style="display:flex; gap: 0.4rem; align-items:center; margin-bottom: 0.35rem; flex-wrap: wrap;">
                <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(59,130,246,0.15); color: var(--text-strong); font-weight: 800;">${escapeHtml(getGeneratedPostCategoryLabel(normalizeKey((post as any)?.category)))}</span>
                <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(148,163,184,0.15); color: var(--text-muted); font-weight: 800;">🖼️ ${(post.images?.length || 0)}개</span>
              </div>
              ${post.publishedUrl ? `
                <div style="font-size: 0.75rem; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block;">
                  🔗 ${post.publishedUrl.length > 50 ? post.publishedUrl.substring(0, 50) + '...' : post.publishedUrl}
                </div>
              ` : `
                <div style="font-size: 0.75rem; color: #f59e0b; background: rgba(245, 158, 11, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block;">
                  ⚠️ 미발행 - URL 없음
                </div>
              `}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  // ✅ 다른 모달보다 항상 위로 오도록(마지막에 붙이기 + 포커스)
  try {
    document.body.appendChild(modal);
    (modal as any).tabIndex = -1;
    (modal as any).focus?.();
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  // 이벤트 리스너
  const closeBtn = content.querySelector('#close-post-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => modal.remove());
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  const bindItems = () => {
    const postItems = content.querySelectorAll('.post-item');
    postItems.forEach((item) => {
      item.addEventListener('click', () => {
        const postIndex = parseInt(item.getAttribute('data-post-index') || '0');
        const selectedPost = posts[postIndex];
        modal.remove();
        onSelect(selectedPost);
      });

      item.addEventListener('mouseenter', () => {
        (item as HTMLElement).style.borderColor = 'var(--primary)';
        (item as HTMLElement).style.background = 'var(--bg-tertiary)';
      });

      item.addEventListener('mouseleave', () => {
        const postIndex = parseInt(item.getAttribute('data-post-index') || '0');
        const hasUrl = posts[postIndex]?.publishedUrl;
        (item as HTMLElement).style.borderColor = hasUrl ? 'rgba(16, 185, 129, 0.3)' : 'transparent';
        (item as HTMLElement).style.background = 'var(--bg-secondary)';
      });
    });
  };

  bindItems();

  const categorySelect = content.querySelector('#post-category-filter') as HTMLSelectElement | null;
  if (categorySelect) {
    categorySelect.value = activeCategory;
    categorySelect.addEventListener('change', () => {
      activeCategory = String(categorySelect.value || '').trim() || allCategoryKey;
      const res = computeList(activeCategory);
      const publishedBadge = content.querySelector('#post-selection-published-badge') as HTMLElement | null;
      const unpublishedBadge = content.querySelector('#post-selection-unpublished-badge') as HTMLElement | null;
      if (publishedBadge) publishedBadge.textContent = `✅ 발행됨 ${res.published.length}개`;
      if (unpublishedBadge) unpublishedBadge.textContent = `⏳ 미발행 ${res.unpublished.length}개`;

      const list = content.querySelector('#post-list') as HTMLElement | null;
      if (list) {
        list.innerHTML = res.sorted.map((post) => {
          const cat = getGeneratedPostCategoryLabel(normalizeKey((post as any)?.category));
          const imgCount = (post.images?.length || 0);
          return `
            <div class="post-item" data-post-index="${posts.indexOf(post)}" style="padding: 1rem; background: ${post.publishedUrl ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05))' : 'var(--bg-secondary)'}; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s; border: 2px solid ${post.publishedUrl ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-light)'};">
              <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
                <span style="font-size: 1.5rem; line-height: 1;">${post.publishedUrl ? '✅' : '⏳'}</span>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(post.title || '제목 없음')}</div>
                  <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">${post.createdAt ? new Date(post.createdAt).toLocaleDateString('ko-KR') : '날짜 없음'}${post.publishedAt ? ' • 발행: ' + new Date(post.publishedAt).toLocaleDateString('ko-KR') : ''}</div>
                  <div style="display:flex; gap: 0.4rem; align-items:center; margin-bottom: 0.35rem; flex-wrap: wrap;">
                    <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(59,130,246,0.15); color: var(--text-strong); font-weight: 800;">${escapeHtml(cat)}</span>
                    <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(148,163,184,0.15); color: var(--text-muted); font-weight: 800;">🖼️ ${imgCount}개</span>
                  </div>
                  ${post.publishedUrl ? `<div style="font-size: 0.75rem; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block;">🔗 ${escapeHtml(post.publishedUrl.length > 50 ? post.publishedUrl.substring(0, 50) + '...' : post.publishedUrl)}</div>` : `<div style="font-size: 0.75rem; color: #f59e0b; background: rgba(245, 158, 11, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block;">⚠️ 미발행 - URL 없음</div>`}
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
      bindItems();
    });
  }
}

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
          // 최소 예약 시간 설정
          const scheduleInput = document.getElementById('unified-schedule-date') as HTMLInputElement;
          if (scheduleInput) {
            const now = new Date();
            const minDate = new Date(now.getTime() + 60000);
            const roundedMin = String(Math.ceil(minDate.getMinutes() / 10) * 10 % 60).padStart(2, '0'); // 10분 단위 올림
            const formattedDateTime = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, '0')}-${String(minDate.getDate()).padStart(2, '0')}T${String(minDate.getHours()).padStart(2, '0')}:${roundedMin}`;
            scheduleInput.min = formattedDateTime;
            scheduleInput.value = formattedDateTime;
            setTimeout(() => {
              scheduleInput.focus();
              scheduleInput.showPicker?.();
            }, 100);
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
      const affiliateDescEl = document.getElementById('content-mode-description-affiliate');
      const customDescEl = document.getElementById('content-mode-description-custom');
      const customPromptArea = document.getElementById('custom-prompt-area');

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
      } else if (mode === 'affiliate') {
        (btn as HTMLElement).style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
      } else if (mode === 'custom') {
        (btn as HTMLElement).style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)';
      }

      (btn as HTMLElement).style.color = 'white';
      (btn as HTMLElement).style.border = 'none';

      // 설명 토글
      if (descriptionEl) descriptionEl.style.display = mode === 'seo' ? 'block' : 'none';
      if (homefeedDescEl) homefeedDescEl.style.display = mode === 'homefeed' ? 'block' : 'none';
      if (affiliateDescEl) affiliateDescEl.style.display = mode === 'affiliate' ? 'block' : 'none';
      if (customDescEl) customDescEl.style.display = mode === 'custom' ? 'block' : 'none';

      // 사용자정의 프롬프트 영역: custom 모드에서만 표시
      if (customPromptArea) {
        customPromptArea.style.display = mode === 'custom' ? 'block' : 'none';
      }
    });
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
          // 최소 예약 시간 설정 (현재 시간 + 1분)
          const scheduleInput = document.getElementById('unified-schedule-date') as HTMLInputElement;
          const scheduleConfirmBtn = document.getElementById('unified-schedule-confirm-btn') as HTMLButtonElement;

          if (scheduleInput) {
            const now = new Date();
            const minDate = new Date(now.getTime() + 60000); // 1분 후
            const year = minDate.getFullYear();
            const month = String(minDate.getMonth() + 1).padStart(2, '0');
            const day = String(minDate.getDate()).padStart(2, '0');
            const hours = String(minDate.getHours()).padStart(2, '0');
            const minutes = String(Math.ceil(minDate.getMinutes() / 10) * 10 % 60).padStart(2, '0'); // 10분 단위 올림
            const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
            scheduleInput.min = formattedDateTime;
            scheduleInput.value = formattedDateTime;

            // 입력 필드에 포커스하여 달력 바로 표시
            setTimeout(() => {
              scheduleInput.focus();
              scheduleInput.showPicker?.(); // showPicker API 지원 시 달력 바로 표시
            }, 100);
          }

          // 확인 버튼 표시
          if (scheduleConfirmBtn) {
            scheduleConfirmBtn.style.display = 'block';
          }

          // 날짜/시간 변경 시 확인 버튼 활성화
          if (scheduleInput) {
            scheduleInput.addEventListener('change', () => {
              if (scheduleConfirmBtn && scheduleInput.value) {
                scheduleConfirmBtn.disabled = false;
                scheduleConfirmBtn.style.opacity = '1';
              }
            });
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
          setTimeout(() => {
            scheduleInput.showPicker?.();
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
function restoreAutosavedContent(): void {
  const saved = loadAutosavedContent();
  if (!saved) return;

  const timeSince = Math.floor((Date.now() - saved.timestamp) / 1000 / 60); // 분 단위
  const message = `${timeSince}분 전에 저장된 작업이 있습니다.\n\n복구하시겠습니까?`;

  if (confirm(message)) {
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

    alert('✅ 작업이 복구되었습니다!');
  } else {
    clearAutosavedContent();
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

    // 쇼핑커넥트 설정 표시 변경 감지 (MutationObserver)
    const shoppingConnectSettings = document.getElementById('shopping-connect-settings');
    if (shoppingConnectSettings) {
      const observer = new MutationObserver(updateCheckboxVisibility);
      observer.observe(shoppingConnectSettings, { attributes: true, attributeFilter: ['style'] });
    }
  }

  // ✅ [2026-02-02] 반자동 발행 영역의 중복 체크박스 제거
  // 이미지 관리 탭의 #thumbnail-text-include 체크박스 하나로 통일

  // ✅ [2026-01-19] 쇼핑커넥트 전용 AI 이미지 생성 체크박스 추가
  addShoppingConnectAiImageOptions();

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

    // 쇼핑커넥트 설정 영역 표시 변경 감지 (MutationObserver)
    const shoppingSettingsForUrl = document.getElementById('shopping-connect-settings');
    if (shoppingSettingsForUrl) {
      const observer = new MutationObserver(updateShoppingUrlVisibility);
      observer.observe(shoppingSettingsForUrl, { attributes: true, attributeFilter: ['style'] });
    }
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

  // 쇼핑커넥트 설정 영역 표시 변경 감지
  const shoppingConnectSettings = document.getElementById('shopping-connect-settings');
  if (shoppingConnectSettings) {
    const observer = new MutationObserver(updateVisibility);
    observer.observe(shoppingConnectSettings, { attributes: true, attributeFilter: ['style'] });
  }
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
  // ✅ [2026-03-07 FIX] textOnlyPublish localStorage 설정도 반영 — 이미지 관리탭에서 설정한 값이 여기까지 전달되도록
  const skipImages = (document.getElementById('unified-skip-images') as HTMLInputElement)?.checked
    || localStorage.getItem('textOnlyPublish') === 'true';
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

// ✅ [2026-03-14 FIX] 영어 카테고리 코드 → 한글 변환 맵
// unified-article-type select의 value(영어 코드)가 저장될 때 한글로 변환
const ENGLISH_TO_KOREAN_CATEGORY: Record<string, string> = {
  'general': '일상·생각',
  'literature': '문학·책',
  'movie': '영화',
  'art_design': '미술·디자인',
  'performance': '공연·전시',
  'music': '음악',
  'drama': '드라마',
  'celebrity': '스타·연예인',
  'cartoon': '만화·애니',
  'broadcast': '방송',
  'tips': '생활 꿀팁',
  'parenting': '육아·결혼',
  'pet': '반려동물',
  'good_writing': '좋은글·이미지',
  'fashion': '패션·미용',
  'interior': '인테리어·DIY',
  'food_recipe': '요리·레시피',
  'shopping_review': '상품리뷰',
  'gardening': '원예·재배',
  'game': '게임',
  'sports': '스포츠',
  'photo': '사진',
  'car': '자동차',
  'hobby': '취미',
  'travel_domestic': '국내여행',
  'travel_world': '세계여행',
  'tasty_restaurant': '맛집',
  'it_computer': 'IT·컴퓨터',
  'society_politics': '사회·정치',
  'health': '건강·의학',
  'business_economy': '비즈니스·경제',
  'language': '어학·외국어',
  'education_scholarship': '교육·학문',
  'realestate': '부동산',
  'self_dev': '자기계발',
  'entertainment': '스타·연예인',
  'shopping': '상품리뷰',
  'tech': 'IT·컴퓨터',
  'affiliate': '상품리뷰',
  'seo': '일상·생각',
  'homefeed': '일상·생각',
};

// URL로 AI 글 생성하기
function normalizeGeneratedPostCategoryKey(raw: unknown): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 'uncategorized';
  // ✅ [2026-03-14 FIX] 영어 카테고리 코드 → 한글 변환
  const lower = trimmed.toLowerCase();
  if (ENGLISH_TO_KOREAN_CATEGORY[lower]) return ENGLISH_TO_KOREAN_CATEGORY[lower];
  // ✅ [2026-02-02 FIX] 사용자가 선택한 콘텐츠 카테고리 그대로 폴더명으로 사용
  // 정규화 제거 - "드라마", "스타·연예인" 등 선택한 그대로 표시
  return trimmed;
}

const CATEGORY_LABEL_MAP: Record<string, string> = {
  // ✅ [2026-01-23 FIX] CATEGORY_NORMALIZE_MAP의 출력값과 일치하도록 수정
  // key: CATEGORY_NORMALIZE_MAP의 결과값(저장되는 값), value: 화면에 표시될 라벨
  '일반': '일반/생활',
  '스타 연예인': '스타 연예인',
  '사회 정치': '사회/정치',  // ✅ [2026-01-24 FIX] 뉴스 이슈 → 사회 정치로 변경
  '스포츠': '스포츠',
  '건강': '건강/의학',
  '비즈니스 경제': '비즈니스/경제',
  'IT 테크': 'IT/테크',
  '쇼핑 리뷰': '쇼핑/리뷰',
  '육아': '육아/교육',
  '맛집 요리': '맛집/요리',
  '여행': '여행/나들이',
  '리빙 인테리어': '리빙/인테리어',
  '반려동물': '반려동물',
  '패션 뷰티': '패션/뷰티',
  '취미 라이프': '취미/라이프',
  '부동산': '부동산',
  '자동차': '자동차',
  '책 영화': '책/영화/문화',
  '자기계발': '자기계발',
  '공부': '공부/학습',
  '게임': '게임',
  '사진 영상': '사진/영상',
  '예술': '예술/디자인',
  '음악': '음악',
  '생활 꿀팁': '생활꿀팁',
  'uncategorized': '미분류',
  '': '미분류'
};

function getGeneratedPostCategoryLabel(categoryKey: string): string {
  // ✅ [2026-01-23 FIX] 콘텐츠 카테고리 드롭다운과 완전히 동일하게 표시
  // 변환 없이 저장된 값 그대로 반환 (예: "스타 연예인" → "스타 연예인")
  const key = normalizeGeneratedPostCategoryKey(categoryKey);
  if (!key || key === 'uncategorized') return '미분류';
  return key;
}

const GENERATED_POSTS_CATEGORY_COLLAPSE_PREFIX = 'generated_posts_category_collapsed:';
function isGeneratedPostCategoryCollapsed(categoryKey: string): boolean {
  const key = normalizeGeneratedPostCategoryKey(categoryKey);
  return localStorage.getItem(`${GENERATED_POSTS_CATEGORY_COLLAPSE_PREFIX}${key}`) === '1';
}

function setGeneratedPostCategoryCollapsed(categoryKey: string, collapsed: boolean): void {
  const key = normalizeGeneratedPostCategoryKey(categoryKey);
  localStorage.setItem(`${GENERATED_POSTS_CATEGORY_COLLAPSE_PREFIX}${key}`, collapsed ? '1' : '0');
}

// ✅ 생성된 글 목록 표시 (검색, 정렬, 필터링 지원)


// 발행용 폼 데이터 수집
function collectUnifiedFormDataForPublish(mode: 'full-auto' | 'semi-auto'): any {
  const generator = UnifiedDOMCache.getGenerator();
  // ✅ 글 톤 설정 - UI에서 선택한 값 사용
  const toneStyle = (document.getElementById('unified-tone-style') as HTMLInputElement)?.value || 'friendly';
  const imageSource = UnifiedDOMCache.getImageSource();
  // ✅ [2026-03-07 FIX] textOnlyPublish localStorage 설정도 반영
  const skipImages = (document.getElementById('unified-skip-images') as HTMLInputElement)?.checked
    || localStorage.getItem('textOnlyPublish') === 'true';
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
      hashtags: hashtags ? hashtags.split(' ').filter(tag => tag.length > 0) : [],
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
async function executeUnifiedAutomation(formData: any): Promise<void> {
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
    toastManager.error('❌ 통합 자동화 실행에 실패했습니다.');

    // ✅ [2026-03-22 FIX] 실패 시 발행 상태 리셋 (재시도 가능하도록)
    // withErrorHandling이 에러를 삼키고 null 반환 → 여기서 상태 정리 필수
    // resetPublishing 내부의 resetProgressUI가 진행률 바 DOM도 자동 정리
    if (typeof (window as any).resetPublishing === 'function') {
      (window as any).resetPublishing();
    }

    // ✅ [2026-02-26 FIX] 실패 시에도 연속 발행 모드면 다음 글로 진행 (기존: 실패 시 멈춤)
    if (isContinuousMode) {
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

    if (isContinuousMode && hasItemsV1 && !hasItemsV2) {
      // ✅ V1 방식만 해당될 때만 scheduleNextPosting 호출
      console.log('[Continuous] V1 방식 다음 포스팅 예약 호출');
      scheduleNextPosting();
    } else if (isContinuousMode && !hasItemsV1 && !hasItemsV2) {
      // ✅ 둘 다 남은 항목이 없으면 연속 발행 종료
      console.log('[Continuous] 연속 발행 완료 - 큐가 비어있음');
      stopContinuousMode('complete');
    } else {
      // ✅ V2 방식은 startContinuousPublishingV2에서 관리
      console.log('[Continuous] V2 방식 - 별도 스케줄링 불필요 (루프가 관리 중)');
    }
  }
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

// ✅ [2026-03-21] Gemini 서버 불안정 공지 배너
function showGeminiInstabilityNotice(): void {
  // 24시간 내 이미 닫았으면 다시 표시하지 않음
  const dismissedAt = localStorage.getItem('geminiNotice_dismissed');
  if (dismissedAt) {
    const elapsed = Date.now() - parseInt(dismissedAt, 10);
    if (elapsed < 24 * 60 * 60 * 1000) return; // 24시간
  }

  const banner = document.createElement('div');
  banner.id = 'gemini-instability-notice';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 99999;
    background: linear-gradient(135deg, #ff6b35 0%, #f7931e 50%, #e8520e 100%);
    color: #fff;
    padding: 14px 20px;
    font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    box-shadow: 0 4px 20px rgba(255, 107, 53, 0.4);
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideDown 0.4s ease-out;
  `;

  banner.innerHTML = `
    <div style="flex: 1;">
      <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px;">
        ⚠️ Gemini AI 서버 불안정 안내 (2026년 3월)
      </div>
      <div style="opacity: 0.95; font-size: 13px;">
        현재 Google Gemini API 서버가 불안정합니다 (503/429 에러 빈발).
        <b>글 생성 엔진</b>은 <b>OpenAI 또는 Perplexity</b>를 권장하며,
        <b>이미지 생성</b>은 <b>ImageFX</b>를 사용해주세요.
        Gemini 안정화 후 다시 사용하시기 바랍니다.
      </div>
    </div>
    <button id="gemini-notice-dismiss" style="
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.4);
      color: #fff;
      padding: 6px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      transition: background 0.2s;
    " onmouseover="this.style.background='rgba(255,255,255,0.35)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
      확인
    </button>
  `;

  // 슬라이드 다운 애니메이션
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from { transform: translateY(-100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(0); opacity: 1; }
      to { transform: translateY(-100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  document.body.prepend(banner);

  // 닫기 버튼
  const dismissBtn = document.getElementById('gemini-notice-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      banner.style.animation = 'slideUp 0.3s ease-in forwards';
      setTimeout(() => banner.remove(), 300);
      localStorage.setItem('geminiNotice_dismissed', String(Date.now()));
    });
  }

  // 30초 후 자동 닫기
  setTimeout(() => {
    if (banner.parentNode) {
      banner.style.animation = 'slideUp 0.3s ease-in forwards';
      setTimeout(() => banner.remove(), 300);
    }
  }, 30000);
}

// 메인 대시보드 초기화
function initDashboard() {
  // 시계 업데이트
  updateClock();
  setInterval(updateClock, 1000);

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

      // 모든 탭 패널 숨기기
      const tabPanels = document.querySelectorAll('.tab-panel');
      tabPanels.forEach(panel => {
        panel.classList.remove('active');
        (panel as HTMLElement).style.display = 'none';
      });

      // 대상 탭 패널 표시
      const targetPanel = document.getElementById(`tab-${targetTab}`);
      if (targetPanel) {
        targetPanel.classList.add('active');
        (targetPanel as HTMLElement).style.display = 'block';
      }

      // ✅ unified 탭 전용 섹션 토글 (조건부 표시 섹션은 제외)
      const unifiedOnlySections = document.querySelectorAll('[id^="unified-only-"]');
      const excludedSections = ['unified-only-progress-container', 'unified-only-preview-section', 'unified-only-semi-auto-section'];
      unifiedOnlySections.forEach(section => {
        const sectionId = section.id;
        // 조건부 표시 섹션은 자동으로 표시하지 않음
        if (excludedSections.includes(sectionId)) return;
        (section as HTMLElement).style.display = targetTab === 'unified' ? 'block' : 'none';
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
  const excludedSectionsInit = ['unified-only-progress-container', 'unified-only-preview-section', 'unified-only-semi-auto-section'];
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
        } else if (selectedSource === 'nano-banana-pro' || selectedSource === 'pollinations') {
          newImageUrl = await generateNanoBananaProImage(englishPrompt, true);
          successProvider = 'nano-banana-pro';
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

    // 1. Nano Banana Pro (Gemini 기반, 무료)
    try {
      appendLog(`[${index + 1}] Nano Banana Pro 시도 중...`);
      newImageUrl = await generateNanoBananaProImage(englishPrompt, true);
      if (newImageUrl) {
        successProvider = 'nano-banana-pro';
        appendLog(`✅ [${index + 1}] Nano Banana Pro 성공!`);
      }
    } catch (e) {
      console.log('[Image] Nano Banana Pro 실패, 다음 시도...');
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

  const closeBtn = modal.querySelector('.close-video-modal-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      modal.remove();
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal || (e.target as HTMLElement).classList.contains('close-video-modal-btn')) {
      modal.remove();
    }
  });

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleKeydown);
    }
  };
  document.addEventListener('keydown', handleKeydown);
}

// 세 번째 DOMContentLoaded 리스너 제거 - 모든 초기화를 두 번째 리스너에서 처리

initAIAssistant();
initToolsHubModal();
initBestProductModal();
initGeminiSelectionUI();
initContentModeHelpAndSmartPublish();

