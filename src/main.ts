import { app, BrowserWindow, dialog, ipcMain, nativeImage, NativeImage, shell, Notification, Tray, Menu } from 'electron';
import './runtime/e2eUserDataBootstrap.js';
// ✅ [v2.7.28] IPC 이중 등록 가드 — 다른 IPC 등록 이전에 반드시 첫 import
import './main/ipc/registerOnce.js';
import path from 'path';
import dotenv from 'dotenv';
import { startEventLoopWatchdog } from './diagnostics/eventLoopWatchdog.js';
import { detectLowSpec, logLowSpecStatus } from './diagnostics/lowSpecMode.js';
import { globalLimiter } from './runtime/adaptiveLimiter.js';
import { initSessionTracking, shouldDisableGpuFromHistory, getRecentFreezeAvg } from './runtime/runtimeStats.js';
import { withCleanupTimeout } from './runtime/cleanupTimeout.js';
import {
  sanitizeRendererIpcResult,
  sanitizeUserVisibleError,
} from './runtime/userVisibleError.js';
import { redactKnownAccountId, scrubText } from './debug/privacyScrubber.js';
import { ExclusiveLeaseCoordinator } from './runtime/exclusiveLease.js';
import { withAbortableDeadline } from './runtime/abortableDeadline.js';
import { ScopedAbortRegistry } from './runtime/scopedAbortRegistry.js';
import {
  parseScheduledDate,
} from './scheduler/scheduledPostLookupPolicy.js';
// ✅ [v2.7.53] modelRegistry SSOT
import { CLAUDE_MODELS, GEMINI_TEXT_MODELS } from './runtime/modelRegistry.js';
import { isDirectLaunchLewordAsset, selectLewordReleaseAsset } from './utils/lewordReleaseAssets.js';

// ✅ [2026-04-03] 앱 시작 디버그 로그 (silent crash 진단용)
try {
  const _fs = require('fs');
  const debugPath = path.join(process.env.TEMP || '/tmp', 'bln-startup-debug.log');
  _fs.writeFileSync(debugPath, `[${new Date().toISOString()}] App starting...\napp: ${typeof app}\nipcMain: ${typeof ipcMain}\nisPackaged: ${app?.isPackaged}\nprocess.type: ${process.type}\n`);
} catch(e) { /* ignore */ }

// ✅ [v2.7.27] 적응형 응답성 시스템 — 사양 토글 없이 모든 환경에서 자동 적응
//   - 초기 max: 사양 자동 감지 추정값 (CPU 4코어/8GB 이하 → 1, 그 외 → 4)
//   - Watchdog ↔ AdaptiveLimiter 자동 연동:
//       lag 5s+ → max 절반, lag 1s+ → max -1, healthy 5s 지속 → max +1
//   - GPU 가속 결정: 직전 5세션 freeze 평균 ≥ 3회면 자동 해제 (학습형)
try {
  initSessionTracking();
  const lowSpec = detectLowSpec();
  globalLimiter.setInitialMax(lowSpec.recommendations.publishConcurrency);

  // GPU 결정: 학습 데이터 우선, 데이터 없으면 사양 추정값
  const learnedDisable = shouldDisableGpuFromHistory();
  const { avg, samples } = getRecentFreezeAvg();
  const shouldDisableGpu = learnedDisable || (samples === 0 && lowSpec.recommendations.disableHardwareAcceleration);

  if (shouldDisableGpu) {
    app.disableHardwareAcceleration();
    // eslint-disable-next-line no-console
    console.log(`[Adaptive] 🎬 GPU 가속 해제 (사유: ${learnedDisable ? `직전 ${samples}세션 freeze 평균 ${avg.toFixed(1)}회` : '저사양 자동 추정'})`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[Adaptive] 🎬 GPU 가속 유지 (학습: ${samples}세션 freeze 평균 ${avg.toFixed(1)}회)`);
  }

  logLowSpecStatus();
  startEventLoopWatchdog();
  // eslint-disable-next-line no-console
  console.log(`[Adaptive] 🚀 Limiter 시작 max=${globalLimiter.getStats().max} (이후 lag 신호로 자동 조절)`);
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[Startup] Adaptive 초기화 실패 (무시):', (e as Error).message);
}
import cron from 'node-cron';
import { NaverBlogAutomation, RunOptions, type PublishMode, type AutomationImage } from './naverBlogAutomation.js';
import { generateImages, resetAllImageState, abortImageGeneration } from './imageGenerator.js';
import { deduplicateSourceImagesByContent } from './image/sourceImageDeduplicator.js';
import {
  applyShoppingRepresentativeReference,
  resolveShoppingRepresentativeReference,
} from './image/shoppingReferenceGeneration.js';
import { generateEnglishPromptMain } from './main/utils/mainPromptInference.js';
// (stabilityGenerator removed - deprecated provider)
import { convertMp4ToGif } from './image/gifConverter.js'; // ✅ 추가
import type { GenerateImagesOptions, GeneratedImage } from './imageGenerator.js';
import { getDailyLimit, getTodayCount, incrementTodayCount, setDailyLimit } from './postLimitManager.js';
// ✅ [v2.10.301] 다중계정 봇감지 백오프 + 계정별 로그인 시차 — 10팀 검증에서 botBackoff dead code 발견
import { isAccountBackedOff, getBotBackoff, computeLoginStaggerDelayMs } from './utils/botBackoff.js';
import { generateStructuredContent, removeOrdinalHeadingLabelsFromBody } from './contentGenerator.js';
import {
  sanitizeContentFakeSourcesCopy,
  sanitizePublishableSourceText,
} from './contentSanitizers.js';
import {
  applyManualTitleOverrideInPlace,
  normalizeManualTitleOverride,
} from './contentManualTitlePolicy.js';
import { withRetry, isRetryableError } from './errorRecovery.js';
import { createDatalabClient, NaverDatalabClient } from './naverDatalab.js';
import type { ContentSource, StructuredContent, ContentGeneratorProvider, ArticleType } from './contentGenerator.js';
import { assembleContentSource, type SourceAssemblyInput } from './sourceAssembler.js';
import { applyConfigToEnv, loadConfig, saveConfig, validateApiKeyFormat, type AppConfig } from './configManager.js';
import { generateBlogContent, setGeminiModel, flushGeminiUsage, getGeminiUsageSnapshot } from './gemini.js';
import { flushAllApiUsage, getApiUsageSnapshot, resetApiUsage, type ApiProvider } from './apiUsageTracker.js';
import { getChromiumExecutablePath } from './browserUtils.js';
import { PostPublishBooster } from './publisher/postPublishBooster.js';
// ✅ [2026-04-20 SPEC-HOMEFEED-100/SEO-100] 발행 메타 기록 훅
import { recordPublishMeta } from './services/publishMetadataRecorder.js';
import { getEnabledFeatures } from './services/featureFlagConfig.js';
import type { FeatureFlag } from './analytics/featureFlagTracker.js';

const ALL_TRACKED_FEATURES: FeatureFlag[] = [
  'validator',
  'thumbnail_auto',
  'smart_scheduler',
  'topic_guard',
  'feedback_loop',
  'first_party_data',
  'price_normalizer_v2',
  'seo_definition_scanner',
  'seo_keyword_position',
  'seo_faq_heading',
  'seo_longtail_depth',
];
import { TrendMonitor, type TrendAlertEvent } from './monitor/trendMonitor.js';
import { PatternAnalyzer } from './learning/patternAnalyzer.js';
import { PostAnalytics, type PostPerformance } from './analytics/postAnalytics.js';
import { SmartScheduler, type ScheduledPost as SmartScheduledPost } from './scheduler/smartScheduler.js';
import { resolvePublishedUrl } from './scheduler/publishedUrlResolver.js';
import { resolveScheduledAccountCredentials } from './scheduler/scheduledAccountResolver.js';
import {
  acquireScheduledPublishQuota,
  type ScheduledPublishQuotaLease,
} from './scheduler/scheduledPublishQuota.js';
import { classifyPublishFailure } from './automation/publishFailureClassifier.js';
import { isConcreteNaverBlogPostUrl } from './automation/publishOutcomeResolver.js';
import { KeywordAnalyzer, type KeywordCompetition, type BlueOceanKeyword } from './analytics/keywordAnalyzer.js';
// ✅ [v2.10.36] BestProductCollector main.ts 미사용 — 다른 파일이 자체 인스턴스 생성
//   기존: 부팅 시 클래스 평가 + new BestProductCollector() 인스턴스 생성 (사용처 0)
//   수정: import 제거 → cold path 모듈 평가 회피
//   import { BestProductCollector } from './services/bestProductCollector.js';
import { InternalLinkManager, type InternalLink } from './content/internalLinkManager.js';
// [SPEC-PROMPT-2026-REFRESH Phase 2 / v2.10.233] 발행 시간 골든존 가드
import { checkGoldenZone } from './publishingStrategy.js';
// [v2.10.252] 이미지 URL 필터링 헬퍼 — main.ts에서 분리
import { filterDuplicateAndLowQualityImages } from './main/utils/imageFilters.js';
// [SPEC-FREEZE-GUARD-001-P2 R5 / v2.10.264] Base64 디코딩 워커 분리 — 사용자 저장 다이얼로그 data URL
import { decodeBase64Async } from './main/utils/base64Async.js';
import { attachSelfTest } from './main/selfTest.js';
import { ThumbnailGenerator } from './content/thumbnailGenerator.js';
import { canConsume as canConsumeQuota, consume as consumeQuota, refund as refundQuota, getStatus as getQuotaStatus, resetAll as resetAllQuota, type QuotaLimits, type QuotaType } from './quotaManager.js';
import { BlogAccountManager } from './account/blogAccountManager.js';
import { TitleABTester } from './content/titleABTester.js';
import { CommentResponder } from './engagement/commentResponder.js';
import { CompetitorAnalyzer } from './analytics/competitorAnalyzer.js';
import { masterAgent } from './agents/masterAgent.js';
import { getWelcomeMessage } from './agents/persona.js';
import { ImageLibrary } from './imageLibrary.js';
import type { ImageSource } from './imageLibrary.js';
import { ExtendedImageLibrary, collectImagesOnAutomationStart } from './extendedImageLibrary.js';
import { IntelligentImagePlacer } from './intelligentImagePlacer.js';
import { thumbnailService } from './thumbnailService.js';
import {
  loadLicense,
  verifyLicense,
  verifyLicenseWithCredentials,
  checkPatchFile,
  registerLicense,
  registerExternalInflowLicense,
  testLicenseServer,
  canUseExternalInflow,
  getDeviceId,
  type LicenseInfo,
  clearLicense,
  revalidateLicense,
  revalidateLicenseBackground,
  syncWithServer,
  sendFreePing,
  reportNaverAccounts,
  compareVersions,
  type SyncResult,
  type NaverAccountInfo,
} from './licenseManager.js';
// ✅ [v2.10.34] xlsx top-level import 제거 (main.ts 내부 사용 0건, 다른 파일에서 직접 import)
//   기존: app 부팅 시 xlsx 모듈 (~1.5MB) 평가됨 → cold start 비용
//   수정: main.ts에서 미사용이라 제거. 실제 사용처는 자체 require/import 보유.
import fs from 'fs/promises';
import {
  loadScheduledPosts,
  saveScheduledPost,
  removeScheduledPost,
  getAllScheduledPosts,
  handleRecurringPost,
  rescheduleScheduledPost,
  retryScheduledPost as retryScheduledPostFn,
  requireConcreteNaverPostUrl,
  createPublishedScheduledPostState,
  createFailedScheduledPostState,
  createPublishingScheduledPostState,
  resolveScheduledPostStateAfterError,
  type ScheduledPost,
} from './scheduledPostsManager.js';
import fsSync from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { getBlogRecentPosts } from './rssSearcher.js';
import { browserSessionManager } from './browserSessionManager.js';

// ✅ [2026-02-04] 자동 업데이트 모듈
import { initAutoUpdater, initAutoUpdaterEarly, setUpdaterLoginWindow, isUpdating, waitForUpdateCheck } from './updater.js';
// v2.7.1: 앱 종료 시 Flow/ImageFX persistent context 쿠키 flush — 매번 로그인 강제 방지
import { resetFlowState } from './image/flowGenerator.js';
import { cleanupImageFxBrowser } from './image/imageFxGenerator.js';
import { closeAllDropshotContexts as closeDropshotBrowserContexts } from './image/dropshotSession.js';

// ✅ [리팩토링] 새로운 모듈화된 유틸리티 및 서비스
// ✅ [리팩토링] 새로운 모듈화된 유틸리티 및 서비스
import { Logger, debugLog as newDebugLog, sanitizeFileName as utilSanitizeFileName, ensureMp4Dir as utilEnsureMp4Dir, ensureHeadingMp4Dir as utilEnsureHeadingMp4Dir, getUniqueMp4Path as utilGetUniqueMp4Path, validateLicenseAndQuota, validateLicenseOnly } from './main/utils/index.js';
import * as AuthUtils from './main/utils/authUtils.js'; // ✅ 충돌 방지용 Namespace Import
import { AutomationService, injectDependencies as injectBlogExecutorDeps } from './main/services/index.js';
import { registerAllHandlers, registerAccountHandlers, registerAdminHandlers } from './main/ipc/index.js';
import { registerConfigHandlers } from './main/ipc/configHandlers.js';
import { registerContentHandlers } from './main/ipc/contentHandlers.js';
import { registerHeadingHandlers } from './main/ipc/headingHandlers.js';
import { registerDiagnosticsHandlers, generateDiagnosticReport } from './main/ipc/diagnosticsHandlers.js';
import { registerDefamationHandlers } from './main/ipc/defamationHandlers.js';
import { registerLicenseHandlers } from './main/ipc/authHandlers.js';
import { registerQuotaHandlers } from './main/ipc/quotaHandlers.js';
import { registerApiHandlers } from './main/ipc/apiHandlers.js';
import { registerKeywordHandlers } from './main/ipc/keywordHandlers.js';
import { registerProductHandlers } from './main/ipc/productHandlers.js';
import { registerEngagementHandlers } from './main/ipc/engagementHandlers.js';
import { registerImageTableHandlers } from './main/ipc/imageTableHandlers.js';
// ✅ [v2.10.203] SERP 프로브 + publishedPostTracker handlers — 끝판왕 시스템 IPC 등록 누락 fix
import { registerSerpProbeHandlers } from './main/ipc/serpProbeHandlers.js';
import { registerContentPolicyHandlers } from './main/ipc/contentPolicyHandlers.js';
import { registerRevenueOperationsHandlers } from './main/ipc/revenueOperationsHandlers.js';
import { loadContentPolicy } from './contentPolicy/policyLoader.js';
import { PublicationStateStore } from './contentPolicy/publicationStateStore.js';
import { evaluatePublicationAvailability } from './contentPolicy/publishGuard.js';
import { registerAgentHandlers } from './main/ipc/agentHandlers.js';
import { WindowManager } from './main/core/WindowManager.js';
import { captureE2EPublishPayload } from './main/e2ePublishCapture.js';
import {
  executeWithContentPolicyManualReview,
  type ContentPolicyManualReviewRequest,
} from './main/contentPolicyManualReview.js';

function requiresImmediatePublishedPostUrl(payload: any): boolean {
  return String(payload?.publishMode || 'publish') === 'publish';
}

function assertImmediatePublishResultUrl(result: any, payload: any): void {
  if (!result?.success || !requiresImmediatePublishedPostUrl(payload)) {
    return;
  }

  const publishedUrl = String(result.url || result.postUrl || result.blogUrl || '').trim();
  if (!isConcreteNaverBlogPostUrl(publishedUrl)) {
    throw new Error('PUBLISH_UNCONFIRMED:자동화가 성공을 반환했지만 실제 네이버 게시글 URL을 확인하지 못했습니다. 작성중/임시저장/블로그홈 상태를 발행 완료로 처리하지 않습니다.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-01-20] 전역 에러 핸들러 - 예상치 못한 크래시 방지
// ✅ [2026-03-23] 강화: UI 알림 + 에러 카운팅 + 반복 에러 감지
// ═══════════════════════════════════════════════════════════════════════════════
let _globalErrorCount = 0;
const _recentErrors: string[] = [];

function notifyRendererOfError(errorType: string, message: string) {
  message = sanitizeUserVisibleError(message);
  try {
    const { BrowserWindow: BW } = require('electron');
    const win = BW.getAllWindows().find((w: any) => !w.isDestroyed());
    if (win?.webContents) {
      win.webContents.send('log-message', `⚠️ [시스템 오류] ${errorType}: ${message.substring(0, 200)}`);
    }
  } catch {
    // UI 알림 실패는 무시 — 순환 에러 방지
  }
}

process.on('uncaughtException', (error: Error, origin: string) => {
  _globalErrorCount++;
  const errorKey = error.message?.substring(0, 100) || 'unknown';
  _recentErrors.push(errorKey);
  if (_recentErrors.length > 20) _recentErrors.shift();

  console.error(`[CRITICAL #${_globalErrorCount}] 처리되지 않은 예외:`, {
    message: error.message,
    stack: error.stack?.substring(0, 500),
    origin
  });

  // UI에 에러 알림
  notifyRendererOfError('UncaughtException', error.message || 'Unknown error');

  // 동일 에러 5회 반복 시 경고
  const sameErrorCount = _recentErrors.filter(e => e === errorKey).length;
  if (sameErrorCount >= 5) {
    console.error(`[CRITICAL] 동일 에러 ${sameErrorCount}회 반복 감지! 앱 재시작 권장.`);
    notifyRendererOfError('반복 에러', `동일 오류가 ${sameErrorCount}회 반복되었습니다. 앱 재시작을 권장합니다.`);
  }
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  _globalErrorCount++;
  const message = reason?.message || String(reason).substring(0, 200);
  console.error(`[CRITICAL #${_globalErrorCount}] 처리되지 않은 Promise 거부:`, {
    reason: message,
    stack: reason?.stack?.substring(0, 500)
  });

  // UI에 에러 알림 (단, 너무 빈번하면 억제)
  if (_globalErrorCount <= 50) {
    notifyRendererOfError('UnhandledRejection', message);
  }
});

// ✅ 메모리 누수 경고 임계값 상향 (이벤트 리스너 과다 등록 경고 방지)
process.setMaxListeners(50);

console.log('[Stability] Main 프로세스 전역 에러 핸들러 등록 완료 (UI 알림 포함)');

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-03-23] IPC 핸들러 글로벌 안전 래퍼
// - 모든 ipcMain.handle 호출에 자동 try-catch 적용
// - 206개+ 핸들러를 개별 수정하지 않고 한 번에 보호
// ═══════════════════════════════════════════════════════════════════════════════
if (ipcMain && typeof ipcMain.handle === 'function') {
  const _originalIpcHandle = ipcMain.handle.bind(ipcMain);
  // [v2.10.226] IPC handler timing 진단 — 사용자 "버튼 누르면 응답없음" 진단용 (perf-summary #2).
  // 50ms 이상 응답이 main thread 또는 await chain 누적. 콘솔에 채널/시간 노출.
  (ipcMain as any).handle = (channel: string, handler: (...args: any[]) => any) => {
    _originalIpcHandle(channel, async (event: any, ...args: any[]) => {
      const _start = performance.now();
      try {
        const result = await handler(event, ...args);
        const _dur = performance.now() - _start;
        if (_dur >= 50) {
          const _level = _dur >= 1000 ? '🚨 SEVERE' : _dur >= 200 ? '🐌 HEAVY' : '⚠️';
          console.warn(`[IPCTiming] ${_level} "${channel}" ${_dur.toFixed(0)}ms`);
        }
        return sanitizeRendererIpcResult(result);
      } catch (error) {
        const _dur = performance.now() - _start;
        const msg = (error as Error).message || '알 수 없는 오류';
        console.error(`[SafeIPC] ❌ "${channel}" 핸들러 에러 (${_dur.toFixed(0)}ms): ${msg}`);
        console.error(`[SafeIPC] Stack:`, (error as Error).stack?.split('\n').slice(0, 3).join('\n'));
        const safeMsg = sanitizeUserVisibleError(msg);
        return { success: false, message: `[${channel}] ${safeMsg}`, error: safeMsg };
      }
    });
  };
  console.log('[Stability] IPC 핸들러 글로벌 안전 래퍼 등록 완료 (timing 진단 포함)');
} else {
  console.warn('[Stability] ipcMain 사용 불가 — 안전 래퍼 건너뜀');
}

// ✅ [리팩토링] blogHandlers 로직 함수 import
import {
  validateAutomationRun,
  startAutomationRun,
  endAutomationRun,
  handleAutomationCancel,
  handleCloseBrowser,
  setMainWindowRef,
  getExecutionLock,
  setExecutionLock,  // ✅ [FIX-6] 실행 잠금 설정
  type AutomationRequest as BlogAutomationRequest,
} from './main/ipc/blogHandlers.js';

function sanitizeFileName(name: string): string {
  let cleaned = String(name || '')
    .replace(/[\\\/<>:"|?*,;#&=+%!'(){}\[\]~]+/g, '_')
    .replace(/[\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .trim();
  // ✅ [2026-03-14] trailing dot/space 제거 (Windows 탐색기 폴더 접근 불가 방지)
  cleaned = cleaned.replace(/[.\s]+$/g, '');
  // ✅ Windows 예약어 처리 (CON, PRN, AUX, NUL, COM1~9, LPT1~9)
  if (/^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i.test(cleaned)) {
    cleaned = `_${cleaned}`;
  }
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).replace(/[.\s]+$/g, '');
  return cleaned;
}

async function ensureMp4Dir(): Promise<string> {
  const config = await loadConfig();
  const os = await import('os');
  let basePath = config.customImageSavePath && config.customImageSavePath.trim() !== ''
    ? config.customImageSavePath
    : path.join(os.homedir(), 'Downloads', 'naver-blog-images');
  basePath = basePath.replace(/\\/g, '/');
  const mp4Dir = path.join(basePath, 'mp4');
  await fs.mkdir(mp4Dir, { recursive: true });

  return mp4Dir;
}

async function ensureHeadingMp4Dir(heading: string): Promise<string> {
  const mp4Root = await ensureMp4Dir();
  const raw = String(heading || '').trim();
  const shortBase = (sanitizeFileName(raw) || 'heading').slice(0, 18).trim();
  const hash = createHash('sha1').update(raw || String(Date.now())).digest('hex').slice(0, 10);
  const headingFolder = `${shortBase}-${hash}`;
  const headingDir = path.join(mp4Root, headingFolder);
  await fs.mkdir(headingDir, { recursive: true });
  return headingDir;
}

async function getUniqueMp4Path(dir: string, heading: string): Promise<{ fullPath: string; fileName: string }> {
  const raw = String(heading || '').trim();
  const shortBase = (sanitizeFileName(raw) || 'video').slice(0, 18).trim();
  const hash = createHash('sha1').update(raw || String(Date.now())).digest('hex').slice(0, 10);
  const baseName = `${shortBase}-${hash}`;
  let fileName = `${baseName}.mp4`;
  let fullPath = path.join(dir, fileName);

  let counter = 2;
  while (true) {
    try {
      await fs.access(fullPath);
      fileName = `${baseName} (${counter}).mp4`;
      fullPath = path.join(dir, fileName);
      counter++;
    } catch {
      break;
    }
  }

  return { fullPath, fileName };
}

const BUILD_RELEASE_DATE = new Date('2025-02-16T00:00:00Z');

let loginWindow: BrowserWindow | null = null;
let isLicenseValid = false;
let latestActiveNotice = process.env.E2E_TEST === '1'
  ? String(process.env.E2E_ACTIVE_NOTICE || '').trim()
  : '';

function isE2ETestMode(): boolean {
  return process.env.E2E_TEST === '1';
}

// ✅ 다중계정 발행 즉시 중지 관련 변수 (AutomationService와 동기화)
// 레거시 호환을 위해 변수는 유지하되, AutomationService도 함께 업데이트
let multiAccountAbortFlag = false;
const activeMultiAccountAutomations: NaverBlogAutomation[] = [];

// ✅ [리팩토링] multiAccountAbortFlag 동기화 헬퍼
function setMultiAccountAbort(abort: boolean): void {
  multiAccountAbortFlag = abort;
  AutomationService.setMultiAccountAbort(abort);
}

function isMultiAccountAborted(): boolean {
  return multiAccountAbortFlag || AutomationService.isMultiAccountAborted();
}

// ✅ [2026-03-11] 즉시 취소 헬퍼: Promise.race로 API 호출 vs AbortSignal 경쟁
// abort() 호출 시 진행 중인 API 대기를 즉시 reject 처리
function withAbortCheck<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(Object.assign(new Error('PUBLISH_CANCELLED'), { name: 'AbortError' }));
  }
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('PUBLISH_CANCELLED'), { name: 'AbortError' }));
      }, { once: true });
    }),
  ]);
}

// 디버그 로그 파일 경로
let debugLogPath: string | null = null;

// [v2.10.226] 비동기 fs.appendFile — 매 debugLog 호출마다 동기 IO가 main thread 블로킹 (perf-summary #2).
// 134+ 호출 × ~1-3ms 누적이 "초반 응답없음" 직접 원인. 콜백 fire-and-forget.
function debugLog(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  // 콘솔에도 출력
  console.log(message);

  // 파일에 기록 (비동기)
  try {
    if (!debugLogPath) {
      const tempDir = require('os').tmpdir();
      debugLogPath = path.join(tempDir, 'better-life-naver-debug.log');
    }
    fsSync.appendFile(debugLogPath, logMessage, 'utf-8', () => { /* fire and forget */ });
  } catch (error) {
    console.error('[DebugLog] 로그 파일 쓰기 실패:', error);
  }
}

// 앱 시작 시 로그 파일 초기화
try {
  const tempDir = require('os').tmpdir();
  debugLogPath = path.join(tempDir, 'better-life-naver-debug.log');
  fsSync.writeFileSync(debugLogPath, `=== Better Life Naver Debug Log ===\n시작 시간: ${new Date().toISOString()}\n\n`, 'utf-8');
  console.log(`[DebugLog] 로그 파일 생성: ${debugLogPath}`);
} catch (error) {
  console.error('[DebugLog] 로그 파일 초기화 실패:', error);
}

// ✅ [2026-02-02] 카테고리별 폴더 구조 - 모든 카테고리 목록
const ALL_CONTENT_CATEGORIES = [
  // 엔터테인먼트·예술
  '문학·책', '영화', '미술·디자인', '공연·전시', '음악', '드라마', '스타·연예인', '만화·애니', '방송',
  // 생활·노하우·쇼핑
  '일상·생각', '생활 꿀팁', '육아·결혼', '반려동물', '좋은글·이미지', '패션·미용', '인테리어·DIY', '요리·레시피', '상품리뷰', '원예·재배',
  // 취미·여가·여행
  '게임', '스포츠', '사진', '자동차', '취미', '국내여행', '세계여행', '맛집',
  // 지식·동향
  'IT·컴퓨터', '사회·정치', '건강·의학', '비즈니스·경제', '어학·외국어', '교육·학문', '부동산', '자기계발',
];

/**
 * ✅ [2026-02-02] 앱 시작 시 모든 카테고리 폴더를 미리 생성
 * images/{카테고리}/ 구조로 폴더 생성
 */
async function initializeCategoryFolders(): Promise<void> {
  try {
    const imagesBasePath = path.join(app.getPath('userData'), 'images');
    await fs.mkdir(imagesBasePath, { recursive: true });

    console.log('[Main] 📂 카테고리 폴더 초기화 시작...');

    for (const category of ALL_CONTENT_CATEGORIES) {
      // 폴더명에 사용할 수 없는 문자 치환
      const safeCategory = category.replace(/[<>:"/\\|?*]/g, '_').trim();
      const categoryPath = path.join(imagesBasePath, safeCategory);

      try {
        await fs.mkdir(categoryPath, { recursive: true });
      } catch (e) {
        // 이미 존재하면 무시
      }
    }

    console.log(`[Main] ✅ 카테고리 폴더 초기화 완료: ${ALL_CONTENT_CATEGORIES.length}개 폴더`);
  } catch (error) {
    console.error('[Main] ❌ 카테고리 폴더 초기화 실패:', error);
  }
}

// 앱 시작 시 카테고리 폴더 생성 (앱 로딩 완료 후 비동기로 실행)
setTimeout(() => {
  initializeCategoryFolders().catch(err => console.error('[Main] 카테고리 폴더 초기화 오류:', err));
}, 3000);


// 라이선스 체크 헬퍼 함수
async function ensureLicenseValid(): Promise<boolean> {
  if (isE2ETestMode()) {
    debugLog('[Main] ensureLicenseValid: E2E_TEST mode, skipping license gate');
    return true;
  }

  // 개발 모드에서도 테스트하려면 FORCE_LICENSE_CHECK=true 환경 변수 설정
  const forceLicenseCheck = process.env.FORCE_LICENSE_CHECK === 'true';
  const currentIsPackaged = app.isPackaged; // isPackaged 전역 변수 대신 실제 값 사용 고려

  if (!currentIsPackaged && !forceLicenseCheck) {
    debugLog('[Main] ensureLicenseValid: 개발 환경 (인증 건너뜀)');
    return true;
  }

  // ✅ [2026-03-01] 1차 시도
  let license = await loadLicense();

  // ✅ 1차 실패 → 500ms 대기 후 재시도 (일시적 I/O 오류 방어)
  if (!license) {
    debugLog('[Main] ensureLicenseValid: 1차 loadLicense() 실패 — 500ms 후 재시도');
    await new Promise(r => setTimeout(r, 500));
    license = await loadLicense();
  }

  if (!license) {
    const userDataPath = app.getPath('userData');
    debugLog(`[Main] ensureLicenseValid: ❌ 라이선스 파일을 찾을 수 없습니다. (loadLicense() returned null)`);
    debugLog(`[Main] ensureLicenseValid: isPackaged=${currentIsPackaged}, forceLicenseCheck=${forceLicenseCheck}, userData=${userDataPath}`);
    console.error(`[Main] ensureLicenseValid: 라이선스 로드 실패 — userData=${userDataPath}`);
    // ✅ 렌더러에도 진단 정보 전달
    try {
      sendLog(`⚠️ 라이선스 파일 로드 실패 (경로: ${userDataPath}/license/license.json)`);
    } catch { /* ignore */ }
    return false;
  }

  debugLog(`[Main] ensureLicenseValid: 라이선스 로드 성공 — isValid: ${license.isValid}, licenseType: ${license.licenseType}, expiresAt: ${license.expiresAt}, authMethod: ${license.authMethod}`);

  // ✅ [2026-03-01] 대소문자 무시 비교 (서버가 'free', 'FREE', 'Free' 등 반환 가능)
  const licenseType = String((license as any).licenseType || '').trim().toLowerCase();
  if (licenseType === 'free') {
    debugLog('[Main] ensureLicenseValid: 무료 라이선스 (항상 유효)');
    return true;
  }

  // ✅ [2026-03-01] LIFE(영구) 라이선스는 만료 체크 없이 바로 유효 처리
  if (licenseType === 'life' || licenseType === 'premium' || licenseType === 'standard') {
    if (license.isValid === false) {
      debugLog(`[Main] ensureLicenseValid: ❌ ${licenseType} 라이선스이지만 isValid=false`);
      return false;
    }

    // LIFE 라이선스는 만료일이 없어도 유효
    if (licenseType === 'life' && !license.expiresAt) {
      debugLog('[Main] ensureLicenseValid: ✅ LIFE 영구 라이선스 (만료일 없음, 항상 유효)');
      return true;
    }
  }

  if (license.isValid === false) {
    debugLog('[Main] ensureLicenseValid: ❌ 라이선스 isValid 플래그가 false입니다.');
    return false;
  }

  // 만료 확인 (날짜만 비교, 만료일은 해당 날짜의 끝까지 유효)
  if (license.expiresAt) {
    try {
      const expiresAt = new Date(license.expiresAt);

      // 날짜 파싱 실패 시 로그 출력
      if (isNaN(expiresAt.getTime())) {
        debugLog(`[Main] ensureLicenseValid: 만료일 '${license.expiresAt}' 형식이 유효하지 않습니다.`);
        // 형식이 잘못된 경우 일단 통과시키거나 에러 처리 (상황에 따라 다름)
        // 여기서는 안전하게 통과시키되 로그를 남김
        return true;
      }

      const now = new Date();

      // 만료일의 끝 시간 (23:59:59.999)
      const expiresAtEndOfDay = new Date(
        expiresAt.getFullYear(),
        expiresAt.getMonth(),
        expiresAt.getDate(),
        23, 59, 59, 999
      );

      // 현재 시간이 만료 시간을 지났는지 확인
      if (now.getTime() > expiresAtEndOfDay.getTime()) {
        debugLog(`[Main] ensureLicenseValid: ❌ 라이선스 만료됨 (만료: ${expiresAtEndOfDay.toISOString()}, 현재: ${now.toISOString()})`);
        return false;
      }

      debugLog(`[Main] ensureLicenseValid: 라이선스 유효함 (만료: ${expiresAtEndOfDay.toISOString()}, 남은 기간: 약 ${Math.floor((expiresAtEndOfDay.getTime() - now.getTime()) / (24 * 3600000))}일)`);
    } catch (error) {
      debugLog(`[Main] ensureLicenseValid: 만료일 체크 중 오류 발생: ${(error as Error).message}`);
    }
  } else {
    debugLog('[Main] ensureLicenseValid: expiresAt 없음 (영구 라이선스)');
  }

  return true;
}

/**
 * 서버 동기화 수행 (버전 체크, 차단 체크, 글로벌 스위치, 공지사항)
 * @returns 앱 실행을 허용할지 여부
 */
/**
 * 서버 동기화 수행 (버전 체크, 차단 체크, 글로벌 스위치, 공지사항)
 * @param isBackground 백그라운드 실행 여부 (true면 다이얼로그 표시 안 함)
 * @returns 앱 실행을 허용할지 여부
 */
async function performServerSync(isBackground: boolean = false): Promise<{ allowed: boolean; notice?: string; error?: string }> {
  try {
    debugLog(`[Main] performServerSync: 서버 동기화 시작... (background: ${isBackground})`);

    const syncResult = await syncWithServer();

    // 서버 연결 실패 시 (오프라인 모드) - 일단 허용
    if (!syncResult.ok && syncResult.error) {
      debugLog(`[Main] performServerSync: 서버 연결 실패 (${syncResult.error}) - 오프라인 모드로 진행`);
      return { allowed: true, error: syncResult.error };
    }

    // 전체 서비스 OFF (점검 모드)
    if (syncResult.serviceEnabled === false) {
      // ✅ 개발 모드에서는 점검 모드 우회 허용
      if (!app.isPackaged) {
        debugLog('[Main] performServerSync: 점검 모드지만 개발 모드이므로 우회 허용');
        return { allowed: true, notice: '[DEV] 점검 모드 우회됨' };
      }

      debugLog('[Main] performServerSync: 서비스 비활성화 상태 (점검 모드)');

      if (!isBackground) {
        await dialog.showMessageBox({
          type: 'info',
          title: '서비스 점검 중',
          message: '현재 서비스 점검 중입니다.',
          detail: syncResult.notice || '잠시 후 다시 시도해 주세요.',
          buttons: ['확인'],
        });
      }
      return { allowed: false, error: 'SERVICE_DISABLED' };
    }

    // 개별 기기 차단
    if (syncResult.isBlocked === true) {
      debugLog('[Main] performServerSync: 기기 차단됨');

      if (!isBackground) {
        await dialog.showMessageBox({
          type: 'error',
          title: '접근 차단',
          message: '해당 기기는 접근이 차단되었습니다.',
          detail: '관리자에게 문의해 주세요.',
          buttons: ['앱 종료'],
        });
      }
      return { allowed: false, error: 'DEVICE_BLOCKED' };
    }

    // 버전 체크 (글로벌 스위치가 켜져 있을 때만)
    // ✅ [2026-06-23] !isBackground — 앱 시작(껐다 켰을 때) 동기화에서만 버전 감지/업데이트를 트리거.
    //   기존: 5분 주기 백그라운드 동기화도 버전 게이트를 돌려, 발행 도중 서버 minVersion을 감지해
    //   갑자기 자동 업데이트/차단되던 문제(사용자 보고: "발행 도중 갑자기 감지"). 사용자 요청:
    //   "껐다 실행했을 때만 감지하고, 그 외에는 현재 버전으로 계속 사용". → 주기 동기화는 라이선스/
    //   공지/차단만 확인하고 버전 게이트는 건너뛴다. 다음 실행 시 시작 동기화가 감지·적용한다.
    if (!isBackground && syncResult.versionCheckEnabled !== false && syncResult.minVersion) {
      const currentVersion = app.getVersion();
      const versionCompare = compareVersions(currentVersion, syncResult.minVersion);

      if (versionCompare < 0) {
        debugLog(`[Main] performServerSync: 버전 낮음 (현재: ${currentVersion}, 최소: ${syncResult.minVersion})`);

        if (app.isPackaged) {
          const updateStarted = isUpdating() || await waitForUpdateCheck(120000).catch(() => false);
          if (updateStarted || isUpdating()) {
            debugLog('[Main] performServerSync: required update is being handled by auto-updater');
            if (!isBackground) {
              await dialog.showMessageBox({
                type: 'info',
                title: '자동 업데이트 진행 중',
                message: '새 버전을 자동으로 다운로드하고 있습니다.',
                detail: `현재 버전: v${currentVersion}\n필요 버전: v${syncResult.minVersion}\n\n다운로드가 끝나면 재시작 안내가 뜹니다.`,
                buttons: ['확인'],
                noLink: true,
              });
            }
            return { allowed: false, error: 'VERSION_TOO_OLD_UPDATING' };
          }

          if (!isBackground) {
            await dialog.showMessageBox({
              type: 'info',
              title: '자동 업데이트 준비 중',
              message: '최신 버전을 자동으로 확인하고 있습니다.',
              detail: `현재 버전: v${currentVersion}\n필요 버전: v${syncResult.minVersion}\n\n잠시 후 업데이트가 감지되면 다운로드 진행률 창이 뜨고, 다운로드 완료 후 설치 안내가 표시됩니다.`,
              buttons: ['확인'],
              noLink: true,
            });
          }
          return { allowed: false, error: 'VERSION_TOO_OLD_UPDATING' };
        }

        if (!isBackground) {
          await dialog.showMessageBox({
            type: 'warning',
            title: '업데이트 필요',
            message: '최신 버전으로 업데이트해 주세요.',
            detail: `현재 버전: v${currentVersion}\n최소 요구 버전: v${syncResult.minVersion}`,
            buttons: ['확인'],
            noLink: true,
          });
        }
        return { allowed: false, error: 'VERSION_TOO_OLD' };
      }
    }

    debugLog('[Main] performServerSync: 서버 동기화 성공');
    latestActiveNotice = syncResult.noticeEnabled === false
      ? ''
      : String(syncResult.notice || '').trim();
    return { allowed: true, notice: latestActiveNotice };

  } catch (error) {
    debugLog(`[Main] performServerSync: 오류 발생 - ${(error as Error).message}`);
    // 오류 발생 시에도 앱 실행 허용 (오프라인 모드)
    return { allowed: true, error: (error as Error).message };
  }
}

/**
 * [보안] 60초 유예 후 강제 종료 처리
 * 점검 모드, 기기 차단, 구버전 감지 시 호출됨
 * 사용자에게 60초 경고 후 앱을 강제 종료함
 */
let isGracefulShutdownInProgress = false;
let gracefulShutdownTimer: NodeJS.Timeout | null = null;

async function handleGracefulShutdown(reason: string) {
  if (isGracefulShutdownInProgress) return;
  isGracefulShutdownInProgress = true;

  console.log(`[Main] 🔴 강제 종료 절차 시작: ${reason}`);

  const message =
    reason === 'SERVICE_DISABLED' ? '🛠️ 현재 서비스 점검 중입니다.' :
      reason === 'VERSION_TOO_OLD' ? '⬆️ 필수 업데이트가 필요합니다.' :
        reason === 'DEVICE_BLOCKED' ? '🚫 기기 접근이 차단되었습니다.' :
          '⛔ 서비스 이용이 제한되었습니다.';

  const GRACE_PERIOD_SECONDS = 60;

  const mainWindow = WindowManager.getMainWindow();

  // ✅ 60초 후 강제 종료 타이머 시작
  gracefulShutdownTimer = setTimeout(() => {
    console.log('[Main] ⏱️ 60초 유예 시간 종료 - 앱 강제 종료');
    app.quit();
    // before-quit 로그아웃 완료 대기 후 강제 종료 (10초로 늘려 logout 처리 보장)
    setTimeout(() => {
      process.exit(0);
    }, 10000);
  }, GRACE_PERIOD_SECONDS * 1000);

  // ✅ 렌더러에 종료 카운트다운 시작 알림 (UI에 카운트다운 표시용)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:shutdown-countdown', {
      reason,
      message,
      seconds: GRACE_PERIOD_SECONDS,
    });
  }

  // ✅ 모달 다이얼로그 표시 (즉시 종료 또는 대기 선택)
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: '⚠️ 서비스 이용 제한',
    message: message,
    detail: `보안상의 이유로 ${GRACE_PERIOD_SECONDS}초 후 앱이 자동 종료됩니다.\n\n작업 중인 내용을 저장하고 종료해 주세요.\n\n'즉시 종료'를 누르면 바로 앱이 종료됩니다.`,
    buttons: ['즉시 종료', `${GRACE_PERIOD_SECONDS}초 후 자동 종료`],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };

  let result;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    result = await dialog.showMessageBox(mainWindow, options);
  } else {
    result = await dialog.showMessageBox(options);
  }

  // 사용자가 '즉시 종료' 선택
  if (result.response === 0) {
    console.log('[Main] 사용자가 즉시 종료 선택');
    if (gracefulShutdownTimer) {
      clearTimeout(gracefulShutdownTimer);
      gracefulShutdownTimer = null;
    }
    app.quit();
    // before-quit 로그아웃 완료 대기 후 강제 종료 (10초로 늘려 logout 처리 보장)
    setTimeout(() => {
      process.exit(0);
    }, 10000);
  }
  // '자동 종료' 선택 시 타이머가 이미 실행 중이므로 대기
  console.log(`[Main] 앱이 ${GRACE_PERIOD_SECONDS}초 후 자동 종료됩니다...`);
}

/**
 * 무료 사용자 및 계정 정보 서버 전송
 */
async function reportUserActivity(accounts?: NaverAccountInfo[]): Promise<void> {
  try {
    const license = await loadLicense();
    const licenseType = String((license as any)?.licenseType || 'free').trim();

    // 무료 사용자인 경우 핑 전송
    if (licenseType === 'free' || !license) {
      debugLog('[Main] reportUserActivity: 무료 사용자 핑 전송');
      await sendFreePing();
    }

    // 네이버 계정 정보 전송 (있는 경우)
    if (accounts && accounts.length > 0) {
      debugLog(`[Main] reportUserActivity: 네이버 계정 ${accounts.length}개 전송 (복호화됨)`);
      await reportNaverAccounts(accounts);
    } else if (!accounts) {
      // 인자가 없으면 현재 모든 계정을 수집하여 전송
      const savedAccounts = blogAccountManager.getAllAccounts();
      const accountsForReport: NaverAccountInfo[] = savedAccounts.map((acc: any) => ({
        naverId: acc.naverId || acc.blogId || acc.id || '',
        naverPassword: acc.naverPassword ? blogAccountManager.decryptPassword(acc.naverPassword) : '',
      })).filter((acc: NaverAccountInfo) => acc.naverId);

      if (accountsForReport.length > 0) {
        debugLog(`[Main] reportUserActivity: 수집된 네이버 계정 ${accountsForReport.length}개 전송`);
        await reportNaverAccounts(accountsForReport);
      }
    }
  } catch (error) {
    debugLog(`[Main] reportUserActivity: 오류 - ${(error as Error).message}`);
  }
}

type PaywallCode = 'PAYWALL';

async function getFreeQuotaLimits(): Promise<QuotaLimits> {
  const limit = 2;
  return {
    publish: limit,
    content: limit,
    media: Number.MAX_SAFE_INTEGER,
    imageApi: 500,  // ✅ [2026-03-02] 일일 이미지 API 기본 한도
  };
}

async function isFreeTierUser(): Promise<boolean> {
  const forceLicenseCheck = process.env.FORCE_LICENSE_CHECK === 'true';
  if (!app.isPackaged && !forceLicenseCheck) {
    return false;
  }

  // ✅ [2026-03-05] 라이선스 우선 체크 → free이면 무조건 무료 (config 우회 차단)
  const license = await loadLicense();
  if (license?.licenseType === 'free') {
    return true; // 라이선스가 free이면 geminiPlanType 설정과 무관하게 무료
  }

  // ✅ 라이선스가 free가 아닌 경우에만 config 체크 (유료 크레딧 사용자 대응)
  try {
    const config = await (await import('./configManager.js')).loadConfig();
    if ((config as any).geminiPlanType === 'paid') return false;
  } catch (e) {
    console.warn('[main] catch ignored:', e);
  }

  return false;
}

async function getFreeQuotaStatus(): Promise<ReturnType<typeof getQuotaStatus>> {
  const limits = await getFreeQuotaLimits();
  return getQuotaStatus(limits);
}

async function getPaywallResponse(message?: string): Promise<{ success: false; code: PaywallCode; message: string; quota: any }> {
  const quota = await getFreeQuotaStatus();
  return {
    success: false,
    code: 'PAYWALL',
    message: message || "⛔ 일일 한도 초과! 아쉽네요. Pro 버전을 사용하는 다른 분들은 지금도 제한 없이 글을 쓰고 있습니다. 기다리지 않고 바로 쓰시겠습니까?",
    quota,
  };
}

async function enforceFreeTier(action: QuotaType, amount: number = 1): Promise<{ allowed: true; quota: any } | { allowed: false; response: any }> {
  const isFree = await isFreeTierUser();
  if (!isFree) {
    return { allowed: true, quota: null };
  }

  const quota = await getFreeQuotaStatus();
  if (quota.isPaywalled) {
    return { allowed: false, response: await getPaywallResponse() };
  }

  const limits = await getFreeQuotaLimits();
  const ok = await canConsumeQuota(action, limits, amount);
  if (!ok) {
    return { allowed: false, response: await getPaywallResponse() };
  }

  return { allowed: true, quota };
}

async function activateFreeTier(userInfo?: { email: string; nickname: string; phone: string }): Promise<{ success: boolean; message?: string }> {
  try {
    const quota = await getFreeQuotaStatus();
    if (quota?.isPaywalled) {
      const res = await getPaywallResponse();
      return { success: false, message: res.message };
    }

    // ✅ [2026-03-26 v2] 필수 정보 검증 강화: 하나라도 안 적으면 체험 거부
    if (!userInfo?.email || !userInfo?.nickname || !userInfo?.phone) {
      return { success: false, message: '이메일, 닉네임, 전화번호를 모두 입력해야 합니다.' };
    }

    // 이메일 서버사이드 정규화
    const normalizedEmail = userInfo.email.trim().toLowerCase();
    const normalizedPhone = userInfo.phone.trim().replace(/[-\s]/g, '');

    // 입력 포맷 검증
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { success: false, message: '올바른 이메일 주소를 입력하세요.' };
    }
    if (userInfo.nickname.trim().length < 2) {
      return { success: false, message: '닉네임을 2자 이상 입력하세요.' };
    }
    if (!/^01[0-9]{8,9}$/.test(normalizedPhone)) {
      return { success: false, message: '올바른 전화번호를 입력하세요. (예: 01012345678)' };
    }

    try {
      const gasUrl = process.env.LICENSE_SERVER_URL || DEFAULT_LICENSE_SERVER_URL;
      const deviceId = await getDeviceId();
      const payload = {
        action: 'trial-activate',
        email: normalizedEmail,
        nickname: userInfo.nickname.trim(),
        phone: normalizedPhone,
        deviceId,
        appVersion: app.getVersion(),
      };
      debugLog(`[Main] activateFreeTier: GAS 체험 사용자 등록 요청 — ${normalizedEmail}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const result = await response.json();
      debugLog(`[Main] activateFreeTier: GAS 응답 — ${JSON.stringify(result)}`);

      if (result.ok === false && result.blocked) {
        return { success: false, message: result.error || '차단된 사용자입니다. 관리자에게 문의하세요.' };
      }
      if (result.ok === false) {
        return { success: false, message: result.error || '체험 등록에 실패했습니다.' };
      }
    } catch (gasError) {
      // 네트워크 오류 시에도 체험은 허용 (오프라인 환경 대비)
      debugLog(`[Main] activateFreeTier: GAS 전송 실패 (오프라인 허용) — ${(gasError as Error).message}`);
    }

    const now = new Date().toISOString();
    const license: LicenseInfo = {
      licenseCode: 'FREE-TIER',
      deviceId: await getDeviceId(),
      verifiedAt: now,
      expiresAt: undefined,
      isValid: true,
      licenseType: 'free',
      authMethod: 'code',
    };
    await (await import('./licenseManager.js')).saveLicense(license);
    return { success: true };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}

// 소제목별 적용된 이미지 저장소 (메모리 + 파일 동기화)
type HeadingImageRecord = {
  provider: string;
  filePath: string;
  previewDataUrl: string;
  updatedAt: number;
  alt?: string;
  caption?: string;
};

const headingImagesStore = new Map<string, HeadingImageRecord>();

type HeadingVideoRecord = {
  provider: string;
  filePath: string;
  previewDataUrl: string;
  updatedAt: number;
};

const headingVideosStore = new Map<string, HeadingVideoRecord[]>();

// 소제목 이미지 저장소 경로 (app이 준비된 후에만 사용 가능)
function getHeadingImagesStorePath(): string {
  return path.join(app.getPath('userData'), 'heading-images.json');
}

function getHeadingVideosStorePath(): string {
  return path.join(app.getPath('userData'), 'heading-videos.json');
}

async function loadHeadingImagesStore(): Promise<void> {
  try {
    const filePath = getHeadingImagesStorePath();
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data) as Record<string, HeadingImageRecord>;
    headingImagesStore.clear();
    Object.entries(parsed).forEach(([heading, record]) => {
      headingImagesStore.set(heading, record);
    });
    console.log(`[Main] 소제목 이미지 저장소 로드 완료: ${headingImagesStore.size}개`);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      console.log('[Main] 소제목 이미지 저장소 파일이 없습니다. 새로 생성합니다.');
    } else if (error instanceof SyntaxError) {
      console.error('[Main] 소제목 이미지 저장소 JSON 파일이 손상되었습니다. 백업 후 초기화합니다.');
      try {
        const filePath = getHeadingImagesStorePath();
        const backupPath = filePath.replace('.json', `.backup-${Date.now()}.json`);
        await fs.copyFile(filePath, backupPath);
        console.log(`[Main] 손상된 파일 백업 완료: ${backupPath}`);
        await fs.unlink(filePath);
        console.log('[Main] 손상된 파일 삭제 완료. 새로 시작합니다.');
      } catch (backupError) {
        console.error('[Main] 백업/삭제 실패:', backupError);
      }
    } else {
      console.error('[Main] 소제목 이미지 저장소 로드 실패:', error);
    }
  }
}

async function loadHeadingVideosStore(): Promise<void> {
  try {
    const filePath = getHeadingVideosStorePath();
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data) as Record<string, HeadingVideoRecord[] | HeadingVideoRecord>;
    headingVideosStore.clear();
    Object.entries(parsed).forEach(([heading, record]) => {
      if (Array.isArray(record)) {
        headingVideosStore.set(heading, record);
      } else if (record && typeof record === 'object') {
        // ✅ 구버전(단일 영상) 데이터 호환
        headingVideosStore.set(heading, [record as HeadingVideoRecord]);
      }
    });
    console.log(`[Main] 소제목 영상 저장소 로드 완료: ${headingVideosStore.size}개`);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      console.log('[Main] 소제목 영상 저장소 파일이 없습니다. 새로 생성합니다.');
    } else if (error instanceof SyntaxError) {
      console.error('[Main] 소제목 영상 저장소 JSON 파일이 손상되었습니다. 백업 후 초기화합니다.');
      try {
        const filePath = getHeadingVideosStorePath();
        const backupPath = filePath.replace('.json', `.backup-${Date.now()}.json`);
        await fs.copyFile(filePath, backupPath);
        console.log(`[Main] 손상된 파일 백업 완료: ${backupPath}`);
        await fs.unlink(filePath);
        console.log('[Main] 손상된 파일 삭제 완료. 새로 시작합니다.');
      } catch (backupError) {
        console.error('[Main] 백업/삭제 실패:', backupError);
      }
    } else {
      console.error('[Main] 소제목 영상 저장소 로드 실패:', error);
    }
  }
}

// 소제목 이미지 저장소 저장
async function saveHeadingImagesStore(): Promise<void> {
  try {
    const data = Object.fromEntries(headingImagesStore);
    await fs.writeFile(getHeadingImagesStorePath(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Main] 소제목 이미지 저장소 저장 실패:', error);
  }
}

async function saveHeadingVideosStore(): Promise<void> {
  try {
    const data = Object.fromEntries(headingVideosStore);
    await fs.writeFile(getHeadingVideosStorePath(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Main] 소제목 영상 저장소 저장 실패:', error);
  }
}

// 앱 이름 설정은 app.whenReady() 이후에 수행 (아래 참조)

// ✅ 환경 변수 로드 (패키지 환경 대응)
if (app.isPackaged) {
  const envPath = path.join(process.resourcesPath, '.env');
  dotenv.config({ path: envPath });
  debugLog(`[Main] 패키지 환경 .env 로드 시도: ${envPath}`);
} else {
  dotenv.config();
  debugLog('[Main] 개발 환경 .env 로드 완료');
}

// ✅ Puppeteer/크롤링용 전역 브라우저 경로 설정 (배포 환경 지원)
(async () => {
  try {
    const browserPath = await getChromiumExecutablePath();
    if (browserPath) {
      process.env.PUPPETEER_EXECUTABLE_PATH = browserPath;
      debugLog(`[Main] ✅ 브라우저 경로가 강제로 설정되었습니다: ${browserPath}`);
    } else {
      debugLog('[Main] ⚠️ 시스템에서 적절한 크롬/엣지 브라우저를 찾지 못했습니다.');
    }
  } catch (err) {
    debugLog(`[Main] ❌ 브라우저 경로 탐색 중 오류: ${(err as Error).message}`);
  }
})();

// Gemini API 키 로드 여부 확인 (디버그 로그)
const checkGeminiKey = process.env.GEMINI_API_KEY;
if (checkGeminiKey) {
  debugLog(`[Main] Gemini API Key 로드됨 (길이: ${checkGeminiKey.length})`);
} else {
  debugLog('[Main] 경고: Gemini API Key가 로드되지 않았습니다.');
}

// 라이선스 서버 URL 설정 (기본값)
const DEFAULT_LICENSE_SERVER_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
if (!process.env.LICENSE_SERVER_URL) {
  process.env.LICENSE_SERVER_URL = DEFAULT_LICENSE_SERVER_URL;
}

type AutomationImagePayload = {
  heading: string;
  filePath: string;
  provider: string;
  alt?: string;
  caption?: string;
};

type AutomationRequest = {
  naverId: string;
  naverPassword: string;
  title?: string;
  content?: string;
  lines?: number;
  selectedHeadings?: string[];
  structuredContent?: StructuredContent;
  generatedImages?: AutomationImagePayload[];
  hashtags?: string[];
  generator?: ContentGeneratorProvider;
  keywords?: string[];
  draft?: string;
  rssUrl?: string;
  autoGenerate?: boolean;
  publishMode?: PublishMode;
  categoryName?: string; // ✅ 추가: 네이버 블로그 카테고리명
  scheduleDate?: string;
  scheduleType?: 'app-schedule' | 'naver-server'; // 예약 발행 타입: 앱 스케줄 관리 vs 네이버 서버 예약
  ctaLink?: string;
  ctaText?: string;
  ctas?: Array<{ text: string; link?: string }>;
  ctaPosition?: 'bottom' | string; // 'bottom' | 'heading-1' ~ 'heading-10'
  skipCta?: boolean; // ✅ [신규] CTA 없이 발행
  skipImages?: boolean; // 이미지 삽입 건너뛰기 (글만 발행하기용)
  targetAge?: '20s' | '30s' | '40s' | '50s' | 'all';
  thumbnailPath?: string; // 대표 이미지 경로
  skipDailyLimitWarning?: boolean; // 풀오토 모드에서 일일 발행 제한 경고 건너뛰기
  imageMode?: 'full-auto' | 'semi-auto' | 'manual' | 'skip'; // 이미지 모드
  collectedImages?: Array<{ id: string; url: string; thumbnailUrl: string; title: string; source: string; tags?: string[] }>; // 수집된 이미지 (풀오토 모드용)
  useAiImage?: boolean; // ✅ 추가
  createProductThumbnail?: boolean; // ✅ 추가
  toneStyle?: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe' | 'storyteller' | 'expert_review' | 'calm_info'; // 글 톤 설정 (10개 전체)
  postId?: string; // ✅ 글 ID (예약 발행용)
  geminiModel?: string; // ✅ Gemini 모델 선택
  customPrompt?: string; // ✅ 사용자 정의 프롬프트 (추가 지시사항)
  keepBrowserOpen?: boolean; // ✅ 브라우저 유지 여부
  useIntelligentImagePlacement?: boolean; // ✅ 지능형 이미지 배치 사용 여부
  onlyImagePlacement?: boolean; // ✅ 이미지 배치만 수행하고 종료하는 모드
  includeThumbnailText?: boolean; // ✅ 1번 이미지 텍스트 포함 여부
  // ✅✅ [신규] 쇼핑커넥트 관련 필드
  affiliateLink?: string; // 제휴 링크
  contentMode?: 'seo' | 'homefeed' | 'affiliate' | 'custom' | 'business' | 'mate'; // 콘텐츠 모드
  isFullAuto?: boolean; // ✅ 풀오토 모드 여부 (인덱스 기반 이미지 매칭용)
  previousPostTitle?: string; // ✅ [신규] 같은 카테고리 이전글 제목
  previousPostUrl?: string; // ✅ [신규] 같은 카테고리 이전글 URL
};

// isPackaged는 지연 초기화 (app이 ready된 후에만 사용 가능)
function getIsPackaged(): boolean {
  try {
    return app.isPackaged;
  } catch {
    return false;
  }
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null; // ✅ 시스템 트레이

async function confirmContentPolicyManualReview(
  request: ContentPolicyManualReviewRequest,
): Promise<boolean> {
  const articleTitle = request.title ? `\n\n대상 글: ${request.title.slice(0, 100)}` : '';
  const options = {
    type: 'warning' as const,
    title: '최근 글 비교 확인',
    message: '최근 발행 글 기록이 충분하지 않습니다.',
    detail: `중복 여부를 자동으로 충분히 비교할 수 없습니다.${articleTitle}\n\n현재 원고의 제목, 본문, 소제목을 직접 확인했다면 이번 글만 계속 발행할 수 있습니다. 다른 품질·안전 검사는 그대로 적용됩니다.`,
    buttons: ['검토 후 이번 글 발행', '취소'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
  const response = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  return response.response === 0;
}

// ✅ [v2.10.34] Splash 화면 — 부팅 체감 시간 단축 (검은 화면 0.1초 이내 splash 표시)
//   기존: app.whenReady → 백업/서버싱크/라이선스 등 직렬 게이트 → 사용자 화면은 검은색 ~20초
//   수정: app.whenReady 첫줄에서 splash window 즉시 표시 → 백그라운드에서 게이트 진행 → 로그인/메인 ready 시 splash close
let splashWindow: BrowserWindow | null = null;
function showSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) return;
  try {
    splashWindow = new BrowserWindow({
      width: 380,
      height: 220,
      frame: false,
      resizable: false,
      transparent: true,
      alwaysOnTop: true,
      center: true,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
      title: '시작 중...',
    });
    const splashHtml = `
      <html><head><meta charset="utf-8"><style>
        body { margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: linear-gradient(145deg, #1e1e24, #2a2a35); color: #fff; border-radius: 12px; overflow: hidden; }
        .logo { font-size: 2.5rem; margin-bottom: 0.5rem; animation: pulse 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.08); opacity: 0.85; } }
        .title { font-size: 1.05rem; font-weight: 600; margin-bottom: 0.4rem; letter-spacing: 0.02em; }
        .sub { font-size: 0.78rem; color: #a1a1aa; margin-bottom: 1.2rem; }
        .bar { width: 64%; height: 3px; background: rgba(255,255,255,0.12); border-radius: 2px; overflow: hidden; }
        .bar > div { width: 35%; height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 2px; animation: slide 1.4s ease-in-out infinite; }
        @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(280%); } }
      </style></head><body>
        <div class="logo">🚀</div>
        <div class="title">Better Life Naver</div>
        <div class="sub">시작하는 중...</div>
        <div class="bar"><div></div></div>
      </body></html>`;
    splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
    splashWindow.on('closed', () => { splashWindow = null; });
  } catch (e: any) {
    debugLog(`[Splash] 표시 실패 (무시): ${e?.message}`);
    splashWindow = null;
  }
}
function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    try { splashWindow.close(); } catch { /* ignore */ }
    splashWindow = null;
  }
}

// ✅ [v1.4.37/v1.4.38] 메인 프로세스 콘솔 → 렌더러 DevTools + 파일 로깅 (디버깅용)
// 1) 모든 console.log/warn/error → 렌더러 DevTools에 [MAIN] 프리픽스로 표시
// 2) 모든 console.log/warn/error → userData/logs/main-YYYY-MM-DD.log 파일에도 기록
//    → 응답없음/크래시 시에도 파일에서 로그 회수 가능
const _origConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

// 파일 로거 (지연 초기화 — app.getPath 사용 가능 시점부터)
let _logFilePath: string | null = null;
function _initLogFile(): void {
  if (_logFilePath) return;
  try {
    const _fs = require('fs');
    const _path = require('path');
    const userData = app.getPath('userData');
    const logsDir = _path.join(userData, 'logs');
    if (!_fs.existsSync(logsDir)) _fs.mkdirSync(logsDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    _logFilePath = _path.join(logsDir, `main-${today}.log`);
    _fs.appendFileSync(_logFilePath, `\n\n========== ${new Date().toISOString()} 앱 시작 ==========\n`);
  } catch (e) {
    _origConsole.error('[Main] 로그 파일 초기화 실패:', e);
  }
}

// [v2.10.110] 50MB cap + 5회 회전 — 이전: 무한 append로 24시간 운영 시 수백 MB 디스크 누적 (Agent O LEAK-2)
// [v2.10.226] 회전 IO도 비동기화 — main thread 블로킹 제거 (perf-summary #2).
const _LOG_FILE_MAX_BYTES = 50 * 1024 * 1024; // 50MB
let _logSizeCheckCounter = 0;
let _logRotating = false; // re-entry 가드
function _rotateLogIfTooLarge(): void {
  // 매 100회 write마다 크기 검사
  if (++_logSizeCheckCounter % 100 !== 0) return;
  if (_logRotating) return;
  if (!_logFilePath) return;
  const _fs = require('fs');
  const fsp = _fs.promises;
  const logFilePath = _logFilePath;
  _logRotating = true;
  (async (): Promise<void> => {
    try {
      const stat = await fsp.stat(logFilePath);
      if (stat.size < _LOG_FILE_MAX_BYTES) return;
      for (let i = 4; i >= 1; i--) {
        const from = `${logFilePath}.${i}`;
        const to = `${logFilePath}.${i + 1}`;
        try { await fsp.rename(from, to); } catch { /* ignore — file may not exist */ }
      }
      try { await fsp.rename(logFilePath, `${logFilePath}.1`); } catch { /* ignore */ }
    } catch { /* ignore */ } finally { _logRotating = false; }
  })();
}

// [v2.10.226] async append — 동기 IO가 main thread freeze 유발 (Agent perf-summary #2).
// fs.appendFile callback 형태: 즉시 반환, libuv threadpool에서 IO 처리.
function _writeToFile(level: string, msg: string): void {
  try {
    if (!_logFilePath) _initLogFile();
    if (!_logFilePath) return;
    _rotateLogIfTooLarge();
    const _fs = require('fs');
    const ts = new Date().toISOString();
    _fs.appendFile(_logFilePath, `[${ts}] [${level.toUpperCase()}] ${msg}\n`, () => { /* fire and forget */ });
  } catch { /* 파일 IO 실패는 무시 */ }
}

function _forwardConsoleToRenderer(level: 'log' | 'warn' | 'error', args: any[]): void {
  // 메시지 직렬화 (한 번만)
  const msg = args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object' && a !== null) {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');

  // 1) 파일에 항상 기록 (응답없음 상태에서도 안전)
  const scrubbedMsg = scrubText(msg).text;
  _writeToFile(level, scrubbedMsg);

  // 2) 렌더러 DevTools로 전송 (가능하면)
  try {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return;
    win.webContents.send('main:console', {
      level,
      msg: sanitizeUserVisibleError(scrubbedMsg),
    });
  } catch { /* 렌더러 미준비 또는 파괴됨 — 무시 */ }
}

console.log = (...args: any[]): void => { _origConsole.log(...args); _forwardConsoleToRenderer('log', args); };
console.warn = (...args: any[]): void => { _origConsole.warn(...args); _forwardConsoleToRenderer('warn', args); };
console.error = (...args: any[]): void => { _origConsole.error(...args); _forwardConsoleToRenderer('error', args); };

// app.whenReady() 이전이라 _initLogFile은 첫 console 호출 시 lazy 초기화됨
_origConsole.log('[Main] ✅ 콘솔 미러링 + 파일 로깅 활성화');

// ✅ [레거시 호환] 전역 변수 유지 (AutomationService와 동기화됨)
let automation: NaverBlogAutomation | null = null;
const automationMap = new Map<string, NaverBlogAutomation>();
let automationRunning = false;

// ✅ [리팩토링] 자동화 상태 동기화 헬퍼
function syncAutomationState(): void {
  // 현재 인스턴스 동기화
  if (automation) {
    AutomationService.setCurrentInstance(automation);
  }
  // 실행 상태 동기화
  if (automationRunning) {
    AutomationService.startRunning();
  } else {
    AutomationService.stopRunning();
  }
}

// ✅ [리팩토링] automationRunning 세터 래퍼
function setAutomationRunning(running: boolean): void {
  automationRunning = running;
  if (running) {
    AutomationService.startRunning();
  } else {
    AutomationService.stopRunning();
  }
}

interface DirectAutomationLeaseHandle {
  readonly owner: string;
  release(): boolean;
}

const directAutomationLeaseCoordinator = new ExclusiveLeaseCoordinator();
let scheduledPostsCronRunning = false;
const SCHEDULED_AUTOMATION_TIMEOUT_MS = 15 * 60 * 1000;
const SCHEDULED_AUTOMATION_CLEANUP_TIMEOUT_MS = 10_000;

async function stopScheduledAutomation(bot: NaverBlogAutomation): Promise<void> {
  await Promise.allSettled([
    bot.cancel(),
    bot.closeBrowser(),
  ]);
}

async function acquireDirectAutomationLease(
  owner: string,
  maxWaitMs = 0,
): Promise<DirectAutomationLeaseHandle | null> {
  const deadline = Date.now() + Math.max(0, maxWaitMs);

  while (true) {
    const ipcLock = getExecutionLock();
    if (!ipcLock && !AutomationService.isRunning()) {
      const lease = directAutomationLeaseCoordinator.tryAcquire(owner);
      if (lease) {
        // Recheck after obtaining the local token. All operations below are
        // synchronous, so no second main-process task can enter this boundary.
        if (getExecutionLock() || AutomationService.isRunning()) {
          directAutomationLeaseCoordinator.release(lease);
        } else {
          let resolveDirectLock!: () => void;
          const directLock = new Promise<void>((resolve) => {
            resolveDirectLock = resolve;
          });
          setExecutionLock(directLock);
          setAutomationRunning(true);
          AutomationService.updateLastRunTime();

          const heartbeat = setInterval(() => {
            AutomationService.updateLastRunTime();
          }, 30_000);
          let released = false;

          return Object.freeze({
            owner: lease.owner,
            release: (): boolean => {
              if (released) return false;
              released = true;
              clearInterval(heartbeat);
              const didRelease = directAutomationLeaseCoordinator.release(lease);
              resolveDirectLock();
              if (getExecutionLock() === directLock) {
                setExecutionLock(null);
                setAutomationRunning(false);
              }
              return didRelease;
            },
          });
        }
      }
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await new Promise((resolve) => setTimeout(resolve, Math.min(500, remaining)));
  }
}

let appConfig: AppConfig = {};
const trendMonitor = new TrendMonitor();
const patternAnalyzer = new PatternAnalyzer();
const postAnalytics = new PostAnalytics(); // ✅ 발행 후 성과 추적
const smartScheduler = new SmartScheduler(); // ✅ 최적 시간 자동 예약 발행

async function prepareSmartScheduledContent(
  post: SmartScheduledPost,
  config: AppConfig,
  naverId: string,
): Promise<{
  title: string;
  content: string;
  structuredContent: any;
  contentPolicyContext: import('./contentPolicy/policyService.js').ContentPolicyPayloadContext;
}> {
  const keyword = String(post.keyword || post.title || '').trim();
  if (!keyword) throw new Error('SMART_SCHEDULER_KEYWORD_REQUIRED');

  const { loadContentPolicy } = await import('./contentPolicy/policyLoader.js');
  const { prepareGenerationPolicyContext } = await import('./contentPolicy/generationContext.js');
  const generationPolicy = await prepareGenerationPolicyContext({
    userDataPath: app.getPath('userData'),
    config: await loadContentPolicy(),
    fallbackInput: {
      input_origin: 'final_draft_payload',
      business_facts_applicable: false,
      primary_keyword: keyword,
      target_reader: '예약한 주제를 검색하는 네이버 블로그 독자',
      business_facts: ['사용자가 SmartScheduler에 발행할 주제를 직접 등록했다.'],
      source_materials: [],
      account_id: naverId,
      blog_id: naverId,
    },
  });
  if (!generationPolicy.allowed) {
    throw new Error(`CONTENT_POLICY_BLOCKED:${generationPolicy.reasons.join(',') || 'BLOCK_SMART_SCHEDULER_GENERATION'}`);
  }

  const source: any = {
    type: 'keyword',
    value: keyword,
    targetAge: 'all',
    toneStyle: 'friendly',
    contentMode: 'seo',
    manualTitleOverride: String(post.title || '').trim() || undefined,
    contentPolicyPrompt: generationPolicy.prompt,
  };
  const generated = await generateStructuredContent(source, {
    provider: (config.defaultAiProvider || 'gemini') as any,
    minChars: Number((config as any).minCharCount) || 2500,
  } as any);
  const title = String((generated as any).selectedTitle || post.title || '').trim();
  const content = String((generated as any).bodyPlain || (generated as any).body || (generated as any).content || '').trim();
  if (!title || content.length < 100) {
    throw new Error('SMART_SCHEDULER_GENERATED_DRAFT_INCOMPLETE');
  }

  const contentPolicyContext = {
    input: {
      ...generationPolicy.input,
      recent_posts: undefined,
    },
    recentPostsSnapshot: generationPolicy.input.recent_posts,
    recentPostsResult: generationPolicy.recentPostsResult,
  };
  return {
    title,
    content,
    structuredContent: { ...generated, selectedTitle: title, bodyPlain: content, content, contentPolicyContext },
    contentPolicyContext,
  };
}

// ✅ [2026-03-14 FIX] SmartScheduler 발행 콜백 설정 — 예약 시간 도달 시 실제 발행 실행
smartScheduler.setPublishCallback(async (post) => {
  let directLease: DirectAutomationLeaseHandle | null = null;
  let smartSchedulerQuotaLease: ScheduledPublishQuotaLease | null = null;
  let schedulerAccountKey = '';
  console.log(`[SmartScheduler] 발행 콜백 실행: ${post.title}`);
  try {
    const config = await loadConfig();
    const naverId = config.savedNaverId || '';
    const naverPassword = config.savedNaverPassword || '';
    
    if (!naverId || !naverPassword) {
      throw new Error('네이버 계정 정보가 설정되지 않았습니다.');
    }

    directLease = await acquireDirectAutomationLease(`smart-scheduler:${post.id}`, 15 * 60 * 1000);
    if (!directLease) {
      throw new Error('PIPELINE_BUSY: 다른 발행 작업이 장시간 실행 중이어서 스마트 예약 발행을 시작하지 못했습니다.');
    }
    
    sendLog(`🚀 SmartScheduler 예약 발행 시작: ${post.title}`);
    sendLog(`✍️ SmartScheduler 완성 원고 생성 중: ${post.keyword || post.title}`);
    const preparedContent = await withAbortableDeadline(
      () => prepareSmartScheduledContent(post, config, naverId),
      {
        timeoutMs: SCHEDULED_AUTOMATION_TIMEOUT_MS,
        cleanupTimeoutMs: SCHEDULED_AUTOMATION_CLEANUP_TIMEOUT_MS,
        operationLabel: `SmartScheduler content generation ${post.id}`,
        onTimeout: () => AutomationService.requestCancel(),
      },
    );
    
    schedulerAccountKey = naverId.trim().toLowerCase();

    const smartSchedulerPayload = {
        naverId,
        naverPassword,
        title: preparedContent.title,
        content: preparedContent.content,
        structuredContent: preparedContent.structuredContent,
        contentPolicyContext: preparedContent.contentPolicyContext,
        _publishFlow: 'smart_scheduler',
        _contentPolicyManualReviewPromptAllowed: true,
        publishMode: 'publish',
       postId: post.id,
      } as const;
    smartSchedulerQuotaLease = await acquireScheduledPublishQuota({
      validate: async () => {
        if (!(await ensureLicenseValid())) {
          return { allowed: false, message: '라이선스 인증이 필요합니다.' };
        }
        const quotaCheck = await enforceFreeTier('publish', 1);
        return quotaCheck.allowed
          ? { allowed: true }
          : {
              allowed: false,
              message: String(quotaCheck.response?.message || '무료 발행 한도를 확인해주세요.'),
            };
      },
      isFreeTierUser,
      consume: () => consumeQuota('publish', 1),
      refund: () => refundQuota('publish', 1),
    });
    const runResult = await withAbortableDeadline(
      () => executeWithContentPolicyManualReview(smartSchedulerPayload, {
        execute: (approvedPayload) => AutomationService.executePostCycle(approvedPayload as any),
        confirm: confirmContentPolicyManualReview,
      }),
      {
        timeoutMs: SCHEDULED_AUTOMATION_TIMEOUT_MS,
        cleanupTimeoutMs: SCHEDULED_AUTOMATION_CLEANUP_TIMEOUT_MS,
        operationLabel: `SmartScheduler publish ${post.id}`,
        onTimeout: async () => {
          AutomationService.requestCancel();
          await AutomationService.closeSession(schedulerAccountKey).catch(() => undefined);
        },
      },
    );
    
    if (!runResult.success) {
      throw new Error('SCHEDULED_PUBLISH_FAILED: SmartScheduler publish did not succeed');
    }

    const publishedUrl = requireConcreteNaverPostUrl(resolvePublishedUrl(
      runResult,
      () => runResult.url || '',
      `https://blog.naver.com/${naverId}`,
    ));
    smartSchedulerQuotaLease.commit();
    sendLog(`✅ SmartScheduler 예약 발행 완료: ${post.title}`);
    return publishedUrl;
  } catch (error) {
    console.error(`[SmartScheduler] 발행 콜백 실패:`, error);
    sendLog(`❌ SmartScheduler 예약 발행 실패: ${sanitizeUserVisibleError(error)}`);
    throw error;
  } finally {
    await smartSchedulerQuotaLease?.rollback().catch((quotaError) => {
      console.error('[SmartScheduler] 예약 발행 쿼터 정리 실패:', quotaError);
    });
    if (schedulerAccountKey) AutomationService.delete(schedulerAccountKey);
    directLease?.release();
  }
});
// ✅ [v2.10.42] 부팅 freeze 차단 — 7개 module-level 인스턴스 lazy 생성
//   기존: module load 시 7개 클래스 생성자 즉시 실행 → 부팅 5~10초 freeze
//   수정: getter 패턴으로 첫 사용 시 생성 (사용 안 하면 영구 미생성)
//   사용자 보고: "앱 실행하면 20초 정도 응답없음하다가 정상작동"
//   원인: app.whenReady 첫 줄의 splash 표시 전에 module-level 인스턴스 7개 생성됨
let _keywordAnalyzer: KeywordAnalyzer | null = null;
let _internalLinkManager: InternalLinkManager | null = null;
let _thumbnailGenerator: ThumbnailGenerator | null = null;
let _blogAccountManager: BlogAccountManager | null = null;
let _titleABTester: TitleABTester | null = null;
let _commentResponder: CommentResponder | null = null;
let _competitorAnalyzer: CompetitorAnalyzer | null = null;
function getKeywordAnalyzer(): KeywordAnalyzer { return _keywordAnalyzer ??= new KeywordAnalyzer(); }
function getInternalLinkManager(): InternalLinkManager { return _internalLinkManager ??= new InternalLinkManager(); }
function getThumbnailGenerator(): ThumbnailGenerator { return _thumbnailGenerator ??= new ThumbnailGenerator(); }
function getBlogAccountManager(): BlogAccountManager { return _blogAccountManager ??= new BlogAccountManager(); }
function getTitleABTester(): TitleABTester { return _titleABTester ??= new TitleABTester(); }
function getCommentResponder(): CommentResponder { return _commentResponder ??= new CommentResponder(); }
function getCompetitorAnalyzer(): CompetitorAnalyzer { return _competitorAnalyzer ??= new CompetitorAnalyzer(); }
// 기존 변수명 호환 — Proxy로 첫 접근 시 lazy 생성 위임
const keywordAnalyzer = new Proxy({} as KeywordAnalyzer, { get: (_, p) => (getKeywordAnalyzer() as any)[p] });
const internalLinkManager = new Proxy({} as InternalLinkManager, { get: (_, p) => (getInternalLinkManager() as any)[p] });
const thumbnailGenerator = new Proxy({} as ThumbnailGenerator, { get: (_, p) => (getThumbnailGenerator() as any)[p] });
const blogAccountManager = new Proxy({} as BlogAccountManager, { get: (_, p) => (getBlogAccountManager() as any)[p] });
const titleABTester = new Proxy({} as TitleABTester, { get: (_, p) => (getTitleABTester() as any)[p] });
const commentResponder = new Proxy({} as CommentResponder, { get: (_, p) => (getCommentResponder() as any)[p] });
const competitorAnalyzer = new Proxy({} as CompetitorAnalyzer, { get: (_, p) => (getCompetitorAnalyzer() as any)[p] });
let monitorTask: Promise<void> | null = null;
let analyticsTask: Promise<void> | null = null;
let trendAlertEnabled = true; // ✅ 트렌드 알림 활성화 상태

// ✅ [v2.10.42] 트렌드 알림 콜백 설정 — module load 직후 호출 → app.whenReady 안으로 이동
//   기존: module load 시 trendMonitor.setAlertCallback 호출 (trendMonitor 인스턴스 평가 + 클로저 생성)
//   수정: app.whenReady 후 setImmediate에서 호출 (부팅 cold path 회피)
function _registerTrendAlertCallback(): void {
  trendMonitor.setAlertCallback((alert: TrendAlertEvent) => {
    if (!trendAlertEnabled || !mainWindow) return;

    // Electron 알림 표시
    const notification = new Notification({
      title: `🔥 ${alert.type === 'breaking' ? '급상승' : alert.type === 'rising' ? '상승중' : '신규'} 키워드 감지!`,
      body: `${alert.keyword}\n${alert.suggestion}`,
      silent: false,
    });

    notification.on('click', () => {
      // 알림 클릭 시 앱 포커스 및 키워드 전달
      mainWindow?.focus();
      mainWindow?.webContents.send('trend:alert', alert);
    });

    notification.show();

    // 렌더러에도 알림 전송
    mainWindow?.webContents.send('trend:alert', alert);
    sendLog(`🔥 트렌드 알림: ${alert.keyword} (${alert.type})`);
  });
}

const publicPath = path.join(__dirname, 'public');
const preloadPath = path.join(__dirname, 'preload.js');

const DEFAULT_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="none"/>
  <g stroke-linejoin="round">
    <path d="M128 24 220 100 172 232H84L36 100 128 24z" fill="#6de6f8" stroke="#1f4d7a" stroke-width="12"/>
    <path d="M128 24 220 100h-92L128 24Z" fill="#88f0ff" stroke="#1f4d7a" stroke-width="12"/>
    <path d="M128 104 172 232H84l44-128z" fill="#4fcce6" stroke="#1f4d7a" stroke-width="12"/>
    <path d="M128 24 84 100 36 100 128 24z" fill="#b2f5ff" stroke="#1f4d7a" stroke-width="12"/>
  </g>
  <g fill="#3ddc84" stroke="#0b6e3c" stroke-linejoin="round" stroke-width="8">
    <path d="M56 28 64 44 82 46 69 58 72 76 56 68 40 76 43 58 30 46 48 44 56 28Z"/>
    <path d="M128 8 136 24 154 26 141 38 144 56 128 48 112 56 115 38 102 26 120 24 128 8Z"/>
    <path d="M200 28 208 44 226 46 213 58 216 76 200 68 184 76 187 58 174 46 192 44 200 28Z"/>
    <path d="M160 80 168 96 186 98 173 110 176 128 160 120 144 128 147 110 134 98 152 96 160 80Z"/>
  </g>
</svg>
`;

function sendLog(message: string): void {
  mainWindow?.webContents.send('automation:log', sanitizeUserVisibleError(message));
}

function sendStatus(status: {
  success: boolean;
  cancelled?: boolean;
  message?: string;
  url?: string;
  failureCode?: string;
}): void {
  const rendererStatus = status.success || !status.message
    ? status
    : { ...status, message: sanitizeUserVisibleError(status.message) };
  mainWindow?.webContents.send('automation:status', rendererStatus);
}

// ✅ [2026-03-02] 메인 프로세스 console 인터셉트 → 렌더러 로그 전달
// ✅ [2026-03-02 UPGRADE] 터미널급 실시간 로그: 모든 자동화 관련 접두어 전달
const LOG_FORWARD_PREFIXES = [
  // 콘텐츠 생성
  '[ContentGenerator]', '[Perplexity]', '[Gemini',
  '[detectDuplicateContent]', '[Content',
  '[SEO', '[Prompt', '[Title',
  // 이미지 생성 엔진
  '[이미지', '[Image', '[NanoBananaPro', '[Nano',
  '[ImageGen', '[Imagen', '[RPM', '[DeepInfra',
  '[Leonardo', '[OpenAI', '[DALL',
  // 발행 & 자동화
  '[Main]', '[Blog', '[Automation', '[AutomationService',
  '[BlogExecutor', '[Publish', '[Execute',
  // 브라우저 자동화
  '[NaverBlog', '[Naver', '[Nav', '[Page', '[Writer',
  '[Type', '[Login', '[Browser', '[CAPTCHA',
  // 다중계정 & 연속발행 & 풀오토
  '[다중계정]', '[MultiAccount]', '[Multi',
  '[Continuous]', '[FullAuto]', '[Scheduler]',
  '[연속', '[풀오토', '[예약',
  // 쇼핑 & 수집
  '[Shopping', '[Crawl', '[Collect', '[Brand',
  // 비디오 & 썸네일
  '[Veo', '[Video', '[Thumbnail',
  // 설정 & 유틸
  '[Config', '[License', '[Quota',
];

let _isForwarding = false; // 재진입 방지 가드

function installConsoleForwarder(): void {
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  const forward = (args: any[]) => {
    if (_isForwarding) return;            // 재진입 차단
    if (!mainWindow?.webContents) return;

    const first = args[0];
    if (typeof first !== 'string') return;       // 첫 인자가 문자열이 아니면 스킵

    // '[' 접두어 매칭 또는 이모지/특수문자 시작 (NaverBlogAutomation 로그 포함)
    const firstChar = first.charAt(0);
    if (firstChar === '[') {
      // 브라켓 접두어 매칭
      const matched = LOG_FORWARD_PREFIXES.some(p => first.startsWith(p));
      if (!matched) return;
    } else if (firstChar.codePointAt(0)! > 0xFF) {
      // 이모지/한글로 시작하는 로그 (NaverBlogAutomation this.log() 등)
      // 🚀, ✅, ❌, ⚠️, 📷, 🖼️, 👥, 🌐, 📝, 🎉, ⏱️, 📂, 🔐, 👀, ⏳ 등
      // pass through
    } else {
      // 일반 ASCII 텍스트는 스킵 (노이즈 방지)
      return;
    }

    _isForwarding = true;
    try {
      const msg = args.map(a => typeof a === 'string' ? a : String(a)).join(' ');
      mainWindow.webContents.send('automation:log', sanitizeUserVisibleError(msg));
    } finally {
      _isForwarding = false;
    }
  };

  console.log = (...args: any[]) => { origLog(...args); forward(args); };
  console.warn = (...args: any[]) => { origWarn(...args); forward(args); };
  console.error = (...args: any[]) => { origError(...args); forward(args); };

  origLog('[Main] ✅ Console 로그 포워더 설치 완료');
}

function resolveIconImage(): NativeImage {
  const defaultIcon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(DEFAULT_ICON_SVG).toString('base64')}`,
  );

  const customPath = appConfig.appIconPath || process.env.APP_ICON_PATH;
  if (customPath) {
    try {
      const resolved = path.isAbsolute(customPath) ? customPath : path.resolve(customPath);
      const image = nativeImage.createFromPath(resolved);
      if (!image.isEmpty()) {
        return image;
      }
      sendLog(`⚠️ 사용자 지정 아이콘을 불러오지 못했습니다: ${resolved}`);
    } catch (error) {
      sendLog(`⚠️ 사용자 지정 아이콘 처리 중 오류: ${(error as Error).message}`);
    }
  }

  return defaultIcon;
}

function getMonthEndDate(referenceDate: Date): Date {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, lastDay, 23, 59, 59, 999);
}

function isBuildExpired(referenceDate: Date): boolean {
  const expiry = getMonthEndDate(referenceDate);
  return new Date() > expiry;
}

async function enforceBuildExpiry(): Promise<boolean> {
  // 만료일 체크 비활성화 (배포 시 필요하면 다시 활성화)
  return false;

  // 개발 모드에서는 만료 체크를 건너뜀
  if (!app.isPackaged) {
    return false;
  }

  if (!isBuildExpired(BUILD_RELEASE_DATE)) {
    return false;
  }

  const expiryDate = getMonthEndDate(BUILD_RELEASE_DATE);
  const expiryStr = expiryDate.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const result = await dialog.showMessageBox({
    type: 'error',
    title: '배포팩 사용 기간 만료',
    message: '해당 배포팩은 사용 기간이 만료되었습니다.',
    detail: `만료일: ${expiryStr}\n\n최신 버전을 다시 배포받아 설치한 뒤 이용해 주세요.`,
    buttons: ['앱 종료'],
    defaultId: 0,
  });

  if (result.response === 0) {
    app.quit();
  }
  return true;
}

async function createWindow(): Promise<void> {
  try {
    console.log('[Main] Creating BrowserWindow...');
    mainWindow = new BrowserWindow({
      width: 960,
      height: 740,
      resizable: true,
      show: true,
      webPreferences: {
        // ✅ [v2.7.47 게임 친화] 백그라운드 시 Chromium 자체 throttling 활성화
        //   사용자 보고: "서든어택 게임 중 시작줄이 깜빡임" 재발
        //   원인: backgroundThrottling=false → 백그라운드에서도 정상 렌더 → fullscreen 게임과 GPU 컨텍스트 경합
        //   수정: true로 변경 — 백그라운드에서 Chromium이 자체적으로 timer/animation throttle
        backgroundThrottling: true,
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
      title: '네이버 블로그 자동화',
      icon: resolveIconImage(),
    });

    // ✅ [v2.10.34] 메인 윈도우 생성 시 splash close (로그인 우회 경로 보호)
    closeSplash();

    // SPEC-STABILITY-2026 6.3: SELF_TEST=1 only — attach before loadFile so
    // renderer init errors are counted from the first console message.
    attachSelfTest(mainWindow);

    // Content Security Policy 설정 (개발 모드에서는 완화된 정책 사용)
    // 참고: 앱이 패키징되면 이 경고는 나타나지 않습니다
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      // 로컬 파일에 대해서만 CSP 적용
      if (details.url.startsWith('file://') || details.url.startsWith('http://localhost') || details.url.startsWith('http://127.0.0.1')) {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            // ✅ CSP 완전히 개방 - 모든 API 호출 허용 (배포 환경에서도 작동하도록)
            'Content-Security-Policy': [
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
              "img-src 'self' data: blob: https: http: file:; " +
              "media-src 'self' data: blob: https: http:; " +
              "font-src 'self' data: https://fonts.gstatic.com; " +
              "connect-src 'self' " +
              // Google (Gemini)
              "https://generativelanguage.googleapis.com https://*.googleapis.com " +
              // LoremFlickr (폴백 이미지)
              "https://loremflickr.com https://*.loremflickr.com " +
              // Picsum (폴백 이미지)
              "https://picsum.photos https://*.picsum.photos " +
              // 네이버 (검색, API, 데이터랩)
              "https://openapi.naver.com https://datalab.naver.com https://search.naver.com https://*.naver.com " +
              // Google Apps Script (라이선스 서버)
              "https://script.google.com https://script.googleusercontent.com " +
              "https://*.google.com https://www.google.com https://dns.google " +
              // 모든 HTTPS/HTTP (폴백)
              "https: http: ws: wss:; " +
              "object-src 'none'; " +
              "base-uri 'self'; " +
              "form-action 'self'; " +
              "frame-src 'self' https://blog.naver.com https://*.naver.com;"
            ],
          },
        });
      } else {
        callback({ responseHeaders: details.responseHeaders });
      }
    });

    const htmlPath = path.join(publicPath, 'index.html');
    console.log('[Main] Loading HTML from:', htmlPath);
    debugLog(`[Main] Loading HTML from: ${htmlPath}`);
    // [v2.10.240 BUG FIX] ERR_FAILED (-2) 회피 — 한글 경로 file:// 인코딩 강제
    //   원인 후보: 한글 경로(C:\Users\박성현\...)가 file:// URL 변환 시 인코딩 누락 → Chromium loadFile 거부.
    //   조치: loadFile 실패 시 url.pathToFileURL로 percent-encoded URL 만들어 loadURL fallback.
    //   진단 로그도 강화 — 실패 시 정확한 에러 정보 debug.log에 기록.
    try {
      await mainWindow.loadFile(htmlPath);
      console.log('[Main] HTML loaded successfully');
      debugLog('[Main] HTML loaded successfully (loadFile)');
    } catch (loadErr: any) {
      const errMsg = (loadErr as Error)?.message || String(loadErr);
      debugLog(`[Main] loadFile 실패 — fallback 시도. 원인: ${errMsg}`);
      console.error('[Main] loadFile 실패:', errMsg);
      // [v2.11.3 FIX] 라이선스 인증창 X 닫기 race 가드 — mainWindow destroy 후 fallback이
      //   destroyed object에 호출되어 "Object has been destroyed" 다이얼로그가 뜨는 케이스 차단.
      //   원인: 한글 경로 ERR_FAILED 발생 후 catch 진입 사이 사용자가 인증창을 닫아 app 종료 절차가
      //         시작되면 mainWindow가 destroy. fallback loadURL이 destroyed window에 호출되어 throw.
      //   조치: fallback 직전 + 직후 isDestroyed() 가드. destroy됐으면 사용자 종료 의도로 보고 silent return.
      if (!mainWindow || mainWindow.isDestroyed()) {
        debugLog('[Main] mainWindow가 fallback 시점에 destroy됨 — 사용자 종료로 간주, silent return');
        return;
      }
      try {
        const { pathToFileURL } = await import('url');
        const fileUrl = pathToFileURL(htmlPath).toString();
        debugLog(`[Main] loadURL fallback: ${fileUrl}`);
        await mainWindow.loadURL(fileUrl);
        debugLog('[Main] HTML loaded successfully (loadURL fallback)');
      } catch (fallbackErr: any) {
        const fbMsg = (fallbackErr as Error)?.message || String(fallbackErr);
        debugLog(`[Main] loadURL fallback도 실패: ${fbMsg}`);
        if (!mainWindow || mainWindow.isDestroyed()) {
          debugLog('[Main] fallback 중 mainWindow destroy — silent return');
          return;
        }
        throw new Error(`HTML 로드 실패 (loadFile: ${errMsg} / fallback loadURL: ${fbMsg})`);
      }
    }

    // ✅ [리팩토링] ipcHelpers에 mainWindow 참조 설정
    setMainWindowRef(mainWindow);

    // ✅ [2026-02-22] console 로그 포워더 설치 (콘텐츠 생성 로그 → 렌더러 전달)
    installConsoleForwarder();

    // ✅ [2026-02-04] 자동 업데이터 초기화 (설치형 앱에서만 동작)
    if (app.isPackaged) {
      initAutoUpdater(mainWindow);
    }

    // ✅ [100점 수정] 닫기(X) 버튼 = 앱 완전 종료
    // event.preventDefault()로 기본 동작을 막고, 비동기 정리 완료 후 명시적으로 종료
    // ✅ [2026-03-13] 종료 확인 다이얼로그 중복 생성 방지 플래그
    let isConfirmDialogOpen = false;

    // ✅ [2026-04-03] X 버튼 = 확인 다이얼로그 표시 (실수로 종료 방지)
    mainWindow.on('close', (event) => {
      if (isE2ETestMode()) {
        (globalThis as any).isQuitting = true;
        return;
      }

      console.log('[Main] 창 닫기 이벤트 발생');

      if ((globalThis as any).isQuitting) {
        console.log('[Main] isQuitting=true, 즉시 종료 허용');
        return;
      }

      event.preventDefault();

      if (isConfirmDialogOpen) {
        console.log('[Main] 종료 확인 다이얼로그가 이미 열려있습니다');
        return;
      }
      isConfirmDialogOpen = true;

      const dialogPreloadPath = path.join(__dirname, 'preloadDialog.js');
      const confirmWindow = new BrowserWindow({
        width: 440,
        height: 330,
        parent: mainWindow!,
        modal: true,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          // ✅ [v2.7.56 SEC-V2-H1] sandbox 명시 (preload 단순한 IPC라 sandbox:true 안전)
          sandbox: true,
          webSecurity: true,
          preload: dialogPreloadPath,
        },
      });

      const confirmHtmlPath = path.join(publicPath, 'quit-confirm.html');
      confirmWindow.loadFile(confirmHtmlPath);
      confirmWindow.once('ready-to-show', () => confirmWindow.show());

      const handleResponse = async (_event: any, shouldQuit: boolean) => {
        ipcMain.removeListener('quit-confirm-response', handleResponse);

        if (!shouldQuit) {
          console.log('[Main] 사용자가 종료를 취소했습니다');
          isConfirmDialogOpen = false;
          if (!confirmWindow.isDestroyed()) confirmWindow.destroy();
          return;
        }

        (globalThis as any).isQuitting = true;
        console.log('[Main] 종료 절차 시작...');
        // Destroy confirm window after setting isQuitting to avoid re-triggering close handler
        if (!confirmWindow.isDestroyed()) confirmWindow.destroy();
        if (automationRunning || AutomationService.isRunning()) {
          AutomationService.requestCancel();
          await AutomationService.closeAllSessions().catch(() => { });
          automationRunning = false;
          automation = null;
        }
        if (tray) { tray.destroy(); tray = null; }
        app.quit();
        setTimeout(() => process.exit(0), 25000);
      };

      ipcMain.on('quit-confirm-response', handleResponse);
      confirmWindow.on('closed', () => {
        ipcMain.removeListener('quit-confirm-response', handleResponse);
        isConfirmDialogOpen = false;
      });
    });

    // ✅ [2026-04-03] 최소화(-) 버튼 = 일반 최소화 (작업표시줄에 남음)
    // 트레이 숨기기는 별도 IPC 'app:minimize-to-tray'로 처리
    (mainWindow as any).on('minimize', () => {
      console.log('[Main] 일반 최소화 (작업표시줄에 남음)');
    });

    // ✅ [2026-02-27] 윈도우 포커스 시 webContents에도 포커스 전달
    mainWindow.on('focus', () => {
      mainWindow?.webContents.focus();
      // ✅ [v2.7.46] 게임 모드 친화: 포커스 복귀 시 watchdog 재개
      try {
        const { setWatchdogActive } = require('./diagnostics/eventLoopWatchdog.js');
        setWatchdogActive(true);
      } catch { /* ignore */ }
    });

    // ✅ [v2.7.46] blur/minimize 시 watchdog 일시 중단
    //   사용자 보고: "서든어택 게임 중 작업표시줄 깜빡임"
    //   원인 추정: 백그라운드 setInterval + fs sync 쓰기가 fullscreen 게임 충돌
    //   해결: 사용자가 다른 앱/게임 사용 중이면 watchdog 자동 일시 중단
    mainWindow.on('blur', () => {
      try {
        const { setWatchdogActive } = require('./diagnostics/eventLoopWatchdog.js');
        setWatchdogActive(false);
      } catch { /* ignore */ }
      try {
        const { setSessionValidationActive } = require('./licenseManager.js');
        setSessionValidationActive(false);
      } catch { /* ignore */ }
    });
    mainWindow.on('minimize', () => {
      try {
        const { setWatchdogActive } = require('./diagnostics/eventLoopWatchdog.js');
        setWatchdogActive(false);
      } catch { /* ignore */ }
      try {
        const { setSessionValidationActive } = require('./licenseManager.js');
        setSessionValidationActive(false);
      } catch { /* ignore */ }
      // ✅ [v2.7.47] 게임 친화: minimize 시 작업표시줄에서 완전 격리
      //   효과: fullscreen 게임이 작업표시줄을 그릴 때 본 앱 항목이 깜빡임 유발 안 함
      //   복귀: Tray 아이콘 클릭으로 다시 띄우기 가능
      try { mainWindow?.setSkipTaskbar(true); } catch { /* ignore */ }
    });
    mainWindow.on('restore', () => {
      try {
        const { setWatchdogActive } = require('./diagnostics/eventLoopWatchdog.js');
        setWatchdogActive(true);
      } catch { /* ignore */ }
      try {
        const { setSessionValidationActive } = require('./licenseManager.js');
        setSessionValidationActive(true);
      } catch { /* ignore */ }
      // ✅ [v2.7.47] 복귀 시 작업표시줄 다시 표시
      try { mainWindow?.setSkipTaskbar(false); } catch { /* ignore */ }
    });
    mainWindow.on('focus', () => {
      try {
        const { setSessionValidationActive } = require('./licenseManager.js');
        setSessionValidationActive(true);
      } catch { /* ignore */ }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    mainWindow.on('ready-to-show', () => {
      console.log('[Main] Window ready to show');
      if (mainWindow) {
        mainWindow.show();
      }
    });

    // ✅ 우클릭 컨텍스트 메뉴 지원 (복사/붙여넣기/잘라내기/전체선택)
    // 시니어 사용자를 위해 마우스 우클릭으로 복사/붙여넣기 가능하도록 설정
    mainWindow.webContents.on('context-menu', (_event, params) => {
      const { Menu, MenuItem } = require('electron');
      const menu = new Menu();

      // 텍스트 선택 시 복사
      if (params.selectionText) {
        menu.append(new MenuItem({
          label: '복사',
          role: 'copy',
          accelerator: 'CmdOrCtrl+C'
        }));
      }

      // 입력 필드에서 붙여넣기/잘라내기/전체선택
      if (params.isEditable) {
        menu.append(new MenuItem({
          label: '잘라내기',
          role: 'cut',
          accelerator: 'CmdOrCtrl+X'
        }));
        menu.append(new MenuItem({
          label: '붙여넣기',
          role: 'paste',
          accelerator: 'CmdOrCtrl+V'
        }));
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({
          label: '전체 선택',
          role: 'selectAll',
          accelerator: 'CmdOrCtrl+A'
        }));
      }

      // 메뉴 항목이 있을 때만 표시
      if (menu.items.length > 0) {
        menu.popup({ window: mainWindow! });
      }
    });
    console.log('[Main] 우클릭 컨텍스트 메뉴 활성화됨 (복사/붙여넣기/잘라내기/전체선택)');
  } catch (error) {
    console.error('[Main] Error creating window:', error);
    throw error;
  }
}

/**
 * 시스템 트레이 생성
 * - 트레이 아이콘 클릭: 창 표시/숨김 토글
 * - 우클릭 메뉴: 창 열기, 앱 종료
 */
function createTray(): void {
  if (tray) return; // 이미 생성됨

  // ✅ 개발 모드와 패키지 모드에서 아이콘 경로 분기
  let iconPath: string;
  if (app.isPackaged) {
    // 패키지된 앱: resources/assets 폴더
    iconPath = path.join(process.resourcesPath, 'assets', 'LEADERNA_.ico');
  } else {
    // 개발 모드: 프로젝트 루트의 assets 폴더
    iconPath = path.join(__dirname, '..', 'assets', 'LEADERNA_.ico');
  }

  // ✅ 아이콘 파일 존재 확인 (디버깅용)
  const fsSync = require('fs');
  const iconExists = fsSync.existsSync(iconPath);
  console.log(`[Main] 트레이 아이콘 경로: ${iconPath} (존재: ${iconExists})`);

  if (!iconExists) {
    console.warn('[Main] ⚠️ 트레이 아이콘 파일이 없습니다. 트레이 생성을 건너뜁니다.');
    return;
  }

  try {
    tray = new Tray(iconPath);
    tray.setToolTip('Leaders Pro - 네이버 블로그 자동화');

    // 트레이 아이콘 클릭 시 창 표시
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    // 우클릭 컨텍스트 메뉴
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '📺 창 열기',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        }
      },
      { type: 'separator' },
      {
        label: '❌ 앱 종료',
        click: () => {
          (app as any).isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    console.log('[Main] ✅ 시스템 트레이 생성 완료');
  } catch (error) {
    console.warn('[Main] ⚠️ 트레이 생성 실패 (아이콘 없음?):', error);
  }
}

// ============================================
// 파일 시스템 IPC 핸들러
// ============================================
// ✅ LEWORD 황금키워드 앱 실행 IPC 핸들러 (자동 다운로드 지원)
ipcMain.handle('leword:launch', async () => {
  console.log('[Main] leword:launch 호출됨');
  const { spawn } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const { dialog, shell } = require('electron');
  const https = require('https');
  const http = require('http');

  const LEWORD_GITHUB_REPO = 'cd000242-sudo/leword-app';
  const isWindows = process.platform === 'win32';
  const isMacOS = process.platform === 'darwin';
  const LEWORD_DOWNLOAD_DIR = isWindows
    ? path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'LEWORD')
    : path.join(app.getPath('userData'), 'LEWORD');
  const LEWORD_EXE_NAME = 'LEWORD-Setup.exe';  // ✅ [2026-02-21] Portable → Setup exe로 변경
  const LEWORD_EXE_PATH = path.join(LEWORD_DOWNLOAD_DIR, LEWORD_EXE_NAME);
  const LEWORD_VERSION_FILE = path.join(LEWORD_DOWNLOAD_DIR, '.leword-version');

  const reportLewordVersion = async (version: string, source: string) => {
    const cleanVersion = String(version || '').trim().replace(/^v/i, '');
    if (!cleanVersion) return;

    try {
      await fetch(process.env.LICENSE_SERVER_URL || DEFAULT_LICENSE_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'free-ping',
          appId: 'com.leword.keyword.master',
          platform: 'LEWORD',
          appVersion: cleanVersion,
          deviceId: `leword-launcher-${app.getVersion()}`,
          source,
          timestamp: new Date().toISOString()
        })
      });
      console.log(`[Main] LEWORD version reported: ${cleanVersion} (${source})`);
    } catch (error) {
      console.warn('[Main] LEWORD version report failed:', error);
    }
  };

  const launchLocalLeword = async (targetPath: string, label: string) => {
    if (isMacOS && targetPath.endsWith('.app')) {
      const openError = await shell.openPath(targetPath);
      if (openError) throw new Error(openError);
      return;
    }

    const child = spawn(targetPath, [], { detached: true, stdio: 'ignore' });
    child.unref();
    try {
      const { trackChild } = require('./runtime/childProcessRegistry.js');
      trackChild(child.pid, `LEWORD(${label})`);
    } catch { /* ignore */ }
  };

  // ✅ [2026-02-21] 기존 Portable.exe → Setup.exe 마이그레이션
  const oldPortablePath = path.join(LEWORD_DOWNLOAD_DIR, 'LEWORD-Portable.exe');
  if (isWindows && !fs.existsSync(LEWORD_EXE_PATH) && fs.existsSync(oldPortablePath)) {
    try {
      fs.renameSync(oldPortablePath, LEWORD_EXE_PATH);
      console.log('[Main] 🔄 LEWORD Portable → Setup 파일명 마이그레이션 완료');
    } catch { /* ignore */ }
  }

  // ===== 설치된 LEWORD 경로 목록 (인스톨러가 설치하는 위치) =====
  const installedPaths = isMacOS
    ? [
      '/Applications/LEWORD.app',
      '/Applications/Leword.app',
      path.join(app.getPath('home'), 'Applications', 'LEWORD.app'),
      path.join(app.getPath('home'), 'Applications', 'Leword.app')
    ]
    : [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'leword', 'LEWORD.exe'),
      'C:\\Program Files\\LEWORD\\LEWORD.exe',
      'C:\\Program Files (x86)\\LEWORD\\LEWORD.exe'
    ];

  // ===== 개발 환경 경로 (win-unpacked 등) =====
  const releaseDir = path.resolve(__dirname, '../../leword-app/release');
  const devPaths: string[] = [];
  try {
    if (isMacOS) {
      const macDevCandidates = [
        path.join(releaseDir, 'mac-universal', 'LEWORD.app'),
        path.join(releaseDir, 'mac-arm64', 'LEWORD.app'),
        path.join(releaseDir, 'mac', 'LEWORD.app'),
        path.join(releaseDir, 'LEWORD.app')
      ];
      devPaths.push(...macDevCandidates.filter((candidate: string) => fs.existsSync(candidate)));
    } else {
      const winUnpackedExe = path.join(releaseDir, 'win-unpacked', 'LEWORD.exe');
      if (fs.existsSync(winUnpackedExe)) devPaths.push(winUnpackedExe);
    }
  } catch (e) { Logger.logDebug('system', 'LEWORD exe 탐색 실패 (win-unpacked)', { error: String(e) }); }
  try {
    if (isWindows && fs.existsSync(releaseDir)) {
      const files = fs.readdirSync(releaseDir) as string[];
      const setupExe = files.find((f: string) => /^LEWORD[- .](Setup|Portable)/i.test(f) && f.endsWith('.exe'));
      if (setupExe) devPaths.push(path.join(releaseDir, setupExe));
    }
  } catch (e) { Logger.logDebug('system', 'LEWORD setup exe 탐색 실패', { error: String(e) }); }

  // 0) 개발 환경이면 바로 실행
  const devExe = devPaths.find((p: string) => { try { return fs.existsSync(p); } catch { return false; } });
  if (devExe) {
    console.log(`[Main] ✅ LEWORD 실행 (개발): ${devExe}`);
    await launchLocalLeword(devExe, 'dev');
    return { success: true, message: 'LEWORD 앱이 실행되었습니다.' };
  }

  // 1) 저장된 버전 읽기 + GitHub 최신 버전 확인
  let localVersion = '';
  try { localVersion = fs.readFileSync(LEWORD_VERSION_FILE, 'utf-8').trim(); } catch (e) { Logger.logDebug('system', 'LEWORD 버전 파일 읽기 실패', { error: String(e) }); }

  let latestTag = '';
  try {
    mainWindow?.webContents.send('log-message', '🔄 LEWORD 최신 버전 확인 중...');
    // ✅ [v2.7.39] 타임아웃 5s → 15s 확장 (네트워크 느린 환경 + GitHub API 응답 지연 대응)
    latestTag = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve(''), 15000);
      https.get(`https://api.github.com/repos/${LEWORD_GITHUB_REPO}/releases/latest`, {
        headers: { 'User-Agent': 'LEWORD-Launcher', 'Accept': 'application/vnd.github.v3+json' }
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          try { resolve(JSON.parse(data).tag_name || ''); } catch { resolve(''); }
        });
      }).on('error', () => { clearTimeout(timer); resolve(''); });
    });
    if (latestTag) {
      console.log(`[Main] LEWORD GitHub 최신 태그: ${latestTag} (로컬: ${localVersion || '없음'})`);
    } else {
      console.warn('[Main] ⚠️ LEWORD GitHub 최신 버전 확인 실패 (네트워크/API 응답 없음)');
    }
  } catch (e) { Logger.logWarn('system', 'LEWORD GitHub 최신 버전 확인 실패', e); }

  // ✅ [v2.7.39] isUpToDate 로직 강화 — latestTag가 비어있을 땐 비교 불가이므로 false
  //   기존 회귀: `!latestTag` truthy 체크 때문에 네트워크 실패 시 자동으로 isUpToDate=true → 업데이트 누락
  //   수정: latestTag와 localVersion 둘 다 명시적으로 존재해야 비교 가능
  const isUpToDate = !!localVersion && !!latestTag && latestTag === localVersion;
  if (isUpToDate) {
    const installedExe = installedPaths.find((p: string) => { try { return fs.existsSync(p); } catch { return false; } });
    if (installedExe) {
      console.log(`[Main] ✅ LEWORD 최신 (${localVersion}), 설치 경로에서 실행: ${installedExe}`);
      mainWindow?.webContents.send('log-message', `✅ LEWORD ${localVersion} 실행 중...`);
      await reportLewordVersion(localVersion, 'installed');
      await launchLocalLeword(installedExe, 'installed');
      return { success: true, message: 'LEWORD 앱이 실행되었습니다.' };
    }
    // 버전 파일은 있지만 설치된 exe가 없으면 → 다운로드로 진행
    console.log('[Main] ⚠️ 버전 파일 있으나 설치된 LEWORD 없음 → 재설치 필요');
  }

  // ✅ [v2.7.39] 네트워크 실패(latestTag='') + 설치된 exe 있음 → 일단 실행, 업데이트 보류
  //   "업데이트 확인 실패"로 사용자가 LEWORD 못 쓰는 회귀 차단
  if (!latestTag && localVersion) {
    const installedExe = installedPaths.find((p: string) => { try { return fs.existsSync(p); } catch { return false; } });
    if (installedExe) {
      console.warn(`[Main] ⚠️ GitHub 응답 실패 → 설치된 LEWORD ${localVersion} 그대로 실행 (다음에 자동 업데이트 재시도)`);
      mainWindow?.webContents.send('log-message', `⚠️ 업데이트 확인 실패 — LEWORD ${localVersion} 실행 (다음에 재시도)`);
      await reportLewordVersion(localVersion, 'no-network');
      await launchLocalLeword(installedExe, 'no-network');
      return { success: true, message: 'LEWORD 앱이 실행되었습니다 (업데이트 확인 실패).' };
    }
  }

  // 3) 업데이트 필요하거나 최초 설치 → 아래 다운로드 로직으로 진행
  if (latestTag && localVersion && latestTag !== localVersion) {
    console.log(`[Main] 🔄 LEWORD 업데이트 필요: ${localVersion} → ${latestTag}`);
    mainWindow?.webContents.send('log-message', `🔄 LEWORD 업데이트 발견: ${localVersion} → ${latestTag}`);
  } else if (!localVersion) {
    // ✅ [2026-02-21] 버전 파일 없는데 시스템에 LEWORD가 설치되어 있으면 → 기존 설치 인식
    const existingExe = installedPaths.find((p: string) => { try { return fs.existsSync(p); } catch { return false; } });
    if (existingExe && latestTag) {
      // 기존 설치가 있으면 → 최신 버전 태그로 버전 파일 생성 후 바로 실행
      // (이미 최신 인스톨러로 설치했을 확률이 높음)
      console.log(`[Main] ✅ 기존 LEWORD 발견 (${existingExe}), 버전 파일 생성 후 실행`);
      try {
        if (!fs.existsSync(LEWORD_DOWNLOAD_DIR)) fs.mkdirSync(LEWORD_DOWNLOAD_DIR, { recursive: true });
        fs.writeFileSync(LEWORD_VERSION_FILE, latestTag, 'utf-8');
        console.log(`[Main] ✅ 버전 저장: ${latestTag}`);
      } catch (e) { Logger.logWarn('system', 'LEWORD 버전 파일 저장 실패', e); }
      mainWindow?.webContents.send('log-message', `✅ LEWORD 실행 중...`);
      await reportLewordVersion(latestTag, 'existing');
      await launchLocalLeword(existingExe, 'existing');
      return { success: true, message: 'LEWORD 앱이 실행되었습니다.' };
    }
    console.log('[Main] 📦 LEWORD 최초 설치');
  }

  // ===== 로컬에 없으면 → GitHub Releases에서 자동 다운로드 =====
  const isAutoUpdate = isWindows && fs.existsSync(LEWORD_DOWNLOAD_DIR) && !fs.existsSync(LEWORD_EXE_PATH);
  console.log(`[Main] LEWORD ${isAutoUpdate ? '업데이트' : '미설치'} → GitHub Releases에서 자동 다운로드 시도`);

  // 신규 설치만 확인 다이얼로그 표시 (업데이트는 자동 진행)
  if (!isAutoUpdate) {
    const confirmResult = await dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'LEWORD 황금키워드',
      message: 'LEWORD 앱을 다운로드합니다.',
      detail: 'LEWORD 황금키워드 앱이 설치되어 있지 않습니다.\nGitHub에서 자동으로 다운로드 후 실행합니다. (약 80MB)',
      buttons: ['다운로드 및 실행', '취소'],
      defaultId: 0,
      cancelId: 1
    });

    if (confirmResult.response !== 0) {
      return { success: false, message: '다운로드가 취소되었습니다.' };
    }
  }

  // GitHub Releases API에서 최신 릴리즈 다운로드 URL 가져오기
  try {
    const releaseInfo = await new Promise<any>((resolve, reject) => {
      https.get(`https://api.github.com/repos/${LEWORD_GITHUB_REPO}/releases/latest`, {
        headers: { 'User-Agent': 'LEWORD-Launcher', 'Accept': 'application/vnd.github.v3+json' }
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });

    // 현재 OS에 맞는 LEWORD 릴리스 에셋 찾기
    const asset = selectLewordReleaseAsset(releaseInfo.assets || [], process.platform);

    if (!asset) {
      console.error('[Main] ❌ GitHub Release에서 현재 OS용 LEWORD 다운로드 파일을 찾을 수 없음');
      dialog.showMessageBox(mainWindow!, {
        type: 'error',
        title: 'LEWORD 다운로드 실패',
        message: '다운로드 파일을 찾을 수 없습니다.',
        detail: '오픈채팅으로 문의해주세요.',
        buttons: ['오픈채팅 문의하기', '확인']
      }).then((r: any) => {
        if (r.response === 0) shell.openExternal('https://open.kakao.com/o/sPcaslwh');
      }).catch((err: any) => console.error('[Dialog] showMessageBox error:', err));
      return { success: false, message: 'GitHub Release에서 다운로드 파일을 찾을 수 없습니다.' };
    }

    // 다운로드 디렉토리 생성
    if (!isDirectLaunchLewordAsset(asset, process.platform)) {
      console.log(`[Main] LEWORD ${process.platform} download opened: ${asset.name}`);
      await shell.openExternal(asset.browser_download_url);
      return { success: true, message: `LEWORD ${asset.name} 다운로드를 열었습니다.` };
    }

    if (!fs.existsSync(LEWORD_DOWNLOAD_DIR)) {
      fs.mkdirSync(LEWORD_DOWNLOAD_DIR, { recursive: true });
    }

    // 진행률 표시하며 다운로드
    const totalSize = asset.size || 0;
    console.log(`[Main] 📥 LEWORD 다운로드 시작: ${asset.name} (${(totalSize / 1024 / 1024).toFixed(1)}MB)`);

    // 렌더러에 진행률 전송
    mainWindow?.webContents.send('log-message', `📥 LEWORD 다운로드 중... (${(totalSize / 1024 / 1024).toFixed(0)}MB)`);

    await new Promise<void>((resolve, reject) => {
      const downloadUrl = asset.browser_download_url;

      const downloadWithRedirect = (url: string) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, { headers: { 'User-Agent': 'LEWORD-Launcher' } }, (res: any) => {
          // GitHub은 302 리다이렉트를 사용
          if (res.statusCode === 301 || res.statusCode === 302) {
            downloadWithRedirect(res.headers.location);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`다운로드 실패: HTTP ${res.statusCode}`));
            return;
          }

          const tempPath = LEWORD_EXE_PATH + '.tmp';
          const fileStream = fs.createWriteStream(tempPath);
          let downloaded = 0;
          let lastProgress = 0;

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            fileStream.write(chunk);

            // 10% 단위로 진행률 로그
            const progress = totalSize > 0 ? Math.floor((downloaded / totalSize) * 100) : 0;
            if (progress >= lastProgress + 10) {
              lastProgress = progress;
              mainWindow?.webContents.send('log-message', `📥 LEWORD 다운로드: ${progress}% (${(downloaded / 1024 / 1024).toFixed(0)}MB / ${(totalSize / 1024 / 1024).toFixed(0)}MB)`);
            }
          });

          res.on('end', () => {
            fileStream.end(() => {
              // 다운로드 완료 → 임시 파일을 실제 파일로 이동
              try {
                if (fs.existsSync(LEWORD_EXE_PATH)) fs.unlinkSync(LEWORD_EXE_PATH);
                fs.renameSync(tempPath, LEWORD_EXE_PATH);
                console.log(`[Main] ✅ LEWORD 다운로드 완료: ${LEWORD_EXE_PATH}`);
                resolve();
              } catch (e) {
                reject(e);
              }
            });
          });

          res.on('error', reject);
        }).on('error', reject);
      };

      downloadWithRedirect(downloadUrl);
    });

    // 다운로드한 버전 태그 저장 (다음 실행 시 버전 체크용)
    try {
      const downloadedTag = releaseInfo.tag_name || '';
      if (downloadedTag) {
        fs.writeFileSync(LEWORD_VERSION_FILE, downloadedTag, 'utf-8');
        console.log(`[Main] ✅ LEWORD 버전 저장: ${downloadedTag}`);
      }
    } catch { /* 버전 저장 실패는 무시 */ }

    mainWindow?.webContents.send('log-message', '✅ LEWORD 다운로드 완료! 실행 중...');

    // 다운로드 완료 → 자동 실행
    await reportLewordVersion(releaseInfo.tag_name || '', 'downloaded');
    await launchLocalLeword(LEWORD_EXE_PATH, 'downloaded');
    return { success: true, message: 'LEWORD 다운로드 및 실행 완료!' };

  } catch (error: any) {
    console.error('[Main] ❌ LEWORD 다운로드 오류:', error);
    dialog.showMessageBox(mainWindow!, {
      type: 'error',
      title: 'LEWORD 다운로드 실패',
      message: '다운로드 중 오류가 발생했습니다.',
      detail: `${error.message}\n\n오픈채팅으로 문의해주세요.`,
      buttons: ['오픈채팅 문의하기', '확인']
    }).then((r: any) => {
      if (r.response === 0) shell.openExternal('https://open.kakao.com/o/sPcaslwh');
    }).catch((err: any) => console.error('[Dialog] showMessageBox error:', err));
    return { success: false, message: `LEWORD 다운로드 실패: ${error.message}` };
  }
});

// ✅ [2026-04-03] shell:openPath → src/main/ipc/systemHandlers.ts로 이관

// ✅ 이전글 목록 가져오기 (블로그 포스트 목록 크롤링)
ipcMain.handle('blog:getRecentPosts', async (_event, blogId: string) => {
  try {
    if (!blogId || !blogId.trim()) {
      return { success: false, message: '블로그 ID가 필요합니다.' };
    }

    const puppeteer = await import('puppeteer-extra');
    const StealthPlugin = await import('puppeteer-extra-plugin-stealth');
    const puppeteerWithStealth = puppeteer.default as any;
    puppeteerWithStealth.use((StealthPlugin as any).default());

    const browser = await puppeteerWithStealth.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // 블로그 포스트 목록 페이지 접근
      const postListUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId.trim()}&categoryNo=0&from=postList`;
      await page.goto(postListUrl, { waitUntil: 'networkidle2', timeout: 15000 });

      // iframe 내부에서 포스트 목록 추출
      const posts = await page.evaluate((bid: string) => {
        const results: Array<{ title: string; url: string; date?: string }> = [];

        // 방법 1: 직접 DOM에서 찾기
        const postItems = document.querySelectorAll('.blog2_post, .post-item, .sect_item, [class*="post"]');
        postItems.forEach((item) => {
          const titleEl = item.querySelector('.title, .se-title, .se-text-paragraph, a[title]');
          const linkEl = item.querySelector('a[href*="PostView"], a[href*="logNo"]') as HTMLAnchorElement;
          const dateEl = item.querySelector('.date, .se-date, [class*="date"]');

          if (titleEl && linkEl) {
            const title = titleEl.textContent?.trim() || '';
            const url = linkEl.href || '';
            const date = dateEl?.textContent?.trim() || '';
            if (title && url) {
              results.push({ title, url, date });
            }
          }
        });

        // 방법 2: 일반적인 링크에서 찾기
        if (results.length === 0) {
          const links = document.querySelectorAll(`a[href*="blog.naver.com/${bid}"]`) as NodeListOf<HTMLAnchorElement>;
          links.forEach((link) => {
            const href = link.href || '';
            if (href.includes('logNo=') || href.includes('PostView')) {
              const title = link.textContent?.trim() || link.title || '';
              if (title && title.length > 3 && !results.some(r => r.url === href)) {
                results.push({ title, url: href });
              }
            }
          });
        }

        return results.slice(0, 20); // 최대 20개
      }, blogId.trim());

      await browser.close().catch(() => undefined);

      if (posts.length === 0) {
        return { success: true, posts: [], message: '포스팅을 찾지 못했습니다.' };
      }

      return { success: true, posts };
    } catch (error) {
      await browser.close().catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error('[Main] getRecentPosts 실패:', error);
    return { success: false, message: `포스팅 목록 불러오기 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('free:activate', async (_event, userInfo?: { email: string; nickname: string; phone: string }) => {
  return await activateFreeTier(userInfo);
});

// ✅ [2026-04-03] app:forceQuit → src/main/ipc/systemHandlers.ts로 이관



// ✅ [2026-04-03] 소제목 영상 핸들러 → headingHandlers.ts로 추출

// [v2.10.247] media:listMp4Files — main/ipc/imageHandlers.ts (registerMediaHandlers) 에 동일 채널 이미 등록됨.
//   safeHandle의 registerOnce 가드로 두 번째 등록 silent 무시. main.ts 본문은 dead code → 제거.

// [v2.10.247] media:convertMp4ToGif — imageHandlers.ts (registerMediaHandlers) 에 이미 등록됨 (중복 제거)

// [v2.10.247] media:createKenBurnsVideo — imageHandlers.ts (registerMediaHandlers) 에 이미 등록됨 (중복 제거)

// [v2.10.242] file:* 8개 IPC 핸들러 → main/ipc/fileHandlers.ts 로 이주
//   분리 대상: file:checkExists, file:checkExistsBatch, file:readDir, file:deleteFolder, file:deleteFile,
//             file:readDirWithStats, file:getStats, file:exists
//   효과: main.ts 약 200줄 감소, god-file 압축 첫 단계
//   호출: registerFileHandlers() in app.whenReady (아래)

// ✅ 누락된 핸들러들 추가

// ✅ [2026-03-22] 로컬 폴더 이미지 리사이즈 (sharp 사용)
ipcMain.handle('localFolder:resizeImage', async (_event, filePath: string, maxWidth: number, maxHeight: number) => {
  try {
    const sharp = (await import('sharp')).default;
    const outputPath = filePath.replace(/(\.[^.]+)$/, `_resized_${Date.now()}$1`);
    await sharp(filePath)
      .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
      .toFile(outputPath);
    return { success: true, filePath: outputPath };
  } catch (error) {
    console.error('[LocalFolder] 이미지 리사이즈 실패:', error);
    return { success: true, filePath }; // 실패 시 원본 경로 반환
  }
});

// [v2.10.242] file:readDirWithStats, file:getStats → main/ipc/fileHandlers.ts 로 이주 (위 블록 참조)

// ✅ [2026-04-03] tutorials:getVideos → src/main/ipc/miscHandlers.ts로 이관

// 영상 파일 선택 다이얼로그
ipcMain.handle('dialog:selectVideoFile', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '영상 파일 선택',
    filters: [
      { name: '동영상', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] },
      { name: '모든 파일', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return { filePath: result.filePaths[0] };
});

// ✅ 폴더 선택 다이얼로그 (이미지 저장 경로 설정용) - 초기화 시 바로 등록
ipcMain.handle('dialog:showOpenDialog', async (_event, options) => {
  try {
    if (!mainWindow) {
      console.error('[Dialog] mainWindow가 없습니다');
      return { canceled: true, filePaths: [] };
    }

    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  } catch (error) {
    console.error('폴더 선택 다이얼로그 오류:', error);
    return { canceled: true, filePaths: [] };
  }
});

// 이미지 폴더 열기
ipcMain.handle('openImagesFolder', async () => {
  // ✅ [v2.10.22] customImageSavePath(=Downloads/naver-blog-images)로 통일
  //   사용자 보고 '풀오토만 폴더 보이고 반자동 자동수집/URL수집 안 보임'
  //   원인: 이 핸들러는 userData/images 열었음 → 다른 IPC는 Downloads에 저장 → 빈 폴더 보였음
  //   조치: customImageSavePath(또는 Downloads 폴백)로 통일
  try {
    const osMod = await import('os');
    const fallback = path.join(osMod.homedir(), 'Downloads', 'naver-blog-images');
    let imagesPath = fallback;
    try {
      const cfg = await loadConfig();
      const cfgPath = String((cfg as any).customImageSavePath || '').trim();
      if (cfgPath) imagesPath = cfgPath;
    } catch { /* fallback */ }

    await fs.mkdir(imagesPath, { recursive: true });
    await shell.openPath(imagesPath);
    console.log(`[Main] 📁 이미지 폴더 열기: ${imagesPath}`);
    return { success: true, path: imagesPath };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

// 이미지 다운로드 및 저장
// ✅ [2026-02-02] category 파라미터 추가 - 카테고리별 폴더에 저장
// [v2.10.250] image:downloadAndSave → main/ipc/imageDownloadHandlers.ts 로 이주

// URL에서 이미지 수집
// [v2.10.255] image:collectFromUrl → main/ipc/imageCollectUrlHandlers.ts

// 쇼핑몰에서 이미지 수집 (플랫폼별 분기)
// ✅ 브랜드스토어: 기존 방식 (검증됨)
// ✅ 스마트스토어/쿠팡: 새 모듈화된 크롤러
// [v2.10.253] image:collectFromShopping → main/ipc/imageCollectShoppingHandlers.ts 로 이주

// ✅ [2026-02-01] AI 기반 소제목-이미지 의미적 매칭 (Gemini / Perplexity 지원)
// [v2.10.249] image:matchToHeadings → main/ipc/imageMatchHandlers.ts 로 이주

// 다중 이미지 다운로드 및 저장
// [v2.10.254] image:downloadAndSaveMultiple → main/ipc/imageDownloadHandlers.ts (2 handlers)

// ✅ [2026-04-03] image:generateComparisonTable → src/main/ipc/imageTableHandlers.ts로 이관

// ✅ [2026-04-03] image:generateCustomBanner → src/main/ipc/imageTableHandlers.ts로 이관

// ✅ [2026-04-03] image:generateProsConsTable → src/main/ipc/imageTableHandlers.ts로 이관

// ✅ [2026-04-03] generate-test-image → src/main/ipc/imageTableHandlers.ts로 이관

// ✅ [2026-04-03] content:collectFromPlatforms → src/main/ipc/miscHandlers.ts로 이관

// ✅ [2026-04-03] images:getSavedPath, images:getSaved → src/main/ipc/miscHandlers.ts로 이관
// ✅ [2026-04-03] app:getInfo → src/main/ipc/systemHandlers.ts로 이관

// 라이선스 상태 확인
// ✅ [2026-04-03] quota:getStatus, quota:getImageUsage, quota:getLeonardoCredits →
//    src/main/ipc/quotaHandlers.ts로 이동 완료

ipcMain.handle('license:checkStatus', async () => {
  try {
    const license = await loadLicense();
    if (!license) {
      return { valid: false, reason: '라이선스가 없습니다.' };
    }
    if (license.expiresAt) {
      const expiryDate = new Date(license.expiresAt);
      const now = new Date();
      if (now > expiryDate) {
        return { valid: false, reason: '라이선스가 만료되었습니다.', details: { expiresAt: license.expiresAt } };
      }
    }
    return { valid: true, reason: '라이선스가 유효합니다.', details: license };
  } catch (error) {
    return { valid: false, reason: (error as Error).message };
  }
});

// ✅ ImageManager 동기화 핸들러 (렌더러에서 생성된 이미지를 메인 프로세스 global로 전달)
ipcMain.handle('automation:syncImageManager', async (_event, imageMapData: Record<string, any[]>) => {
  try {
    const map = new Map<string, any[]>();
    for (const [key, list] of Object.entries(imageMapData)) {
      map.set(key, list);
    }

    // NaverBlogAutomation에서 접근 가능하도록 global에 설정
    (global as any).ImageManager = {
      imageMap: map
    };

    console.log(`[Main] ImageManager 동기화 완료: ${map.size}개 소제목 데이터`);
    return true;
  } catch (error) {
    return false;
  }
});

// ✅ 브라우저 세션 종료 핸들러
ipcMain.handle('automation:closeBrowser', async (_event, naverId?: string) => {
  try {
    const normalizedId = String(naverId || '').trim().toLowerCase();
    if (normalizedId) {
      sendLog('🛑 발행 복구를 위해 해당 계정의 브라우저 세션만 정리합니다.');
      await AutomationService.closeSession(normalizedId).catch(() => undefined);

      const legacyAutomation = automationMap.get(normalizedId);
      if (legacyAutomation) {
        await legacyAutomation.closeBrowser().catch(() => undefined);
        automationMap.delete(normalizedId);
        if (automation === legacyAutomation) {
          automation = null;
        }
      }
      return { success: true };
    }

    await AutomationService.closeAllSessions().catch(() => undefined);

    if (automation || automationMap.size > 0) {
      sendLog('🛑 모든 브라우저 세션을 명시적으로 종료합니다.');

      const closePromises: Promise<void>[] = [];

      if (automation) {
        closePromises.push(automation.closeBrowser().catch(() => undefined));
      }

      for (const [id, instance] of automationMap.entries()) {
        if (instance !== automation) {
          closePromises.push(instance.closeBrowser().catch(() => undefined));
        }
      }

      await Promise.allSettled(closePromises);
      automation = null;
      automationMap.clear();
    }
    return { success: true };
  } catch (error) {
    console.error('[Main] 브라우저 종료 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});


// ✅ [2026-02-12] 소제목별 이미지 자동 검색 - 네이버 → 구글 폴백
// ✅ [v2.7.61] AI 관련성 검증 옵션 추가 (config.imageRelevanceCheck)
// ✅ [v2.7.63 SEC-V2-H5] IPC payload 화이트리스트 검증
ipcMain.handle('search-images-for-headings', async (_event, payload: unknown) => {
  try {
    const { validateSearchImagesPayload } = await import('./main/ipc/validators.js');
    const v = validateSearchImagesPayload(payload);
    if (!v.ok) {
      console.error(`[Main] 🛡️ search-images-for-headings payload 검증 실패: ${v.error}`);
      return { success: false, message: v.error, images: {} };
    }
    const validPayload = v.value;
    console.log(`[Main] 🖼️ search-images-for-headings 시작: ${validPayload.headings.length}개 소제목`);

    // ✅ [v2.7.62] config에서 AI 검증 + 글 생성 AI 라우팅 설정 로드
    const { loadConfig } = await import('./configManager.js');
    const cfg = await loadConfig();
    // [v2.11.x] AI 이미지 관련성 검증 제거 — 항상 비활성 (UI 삭제, stale config 무시)
    const relevanceCheckEnabled = false;
    const relevanceThreshold = Number((cfg as any).imageRelevanceThreshold ?? 60);

    // ✅ [v2.7.63] 글 1편 단위로 비용 누적 리셋
    if (relevanceCheckEnabled) {
      const { resetVisionBudget } = await import('./crawler/visionBudgetGuard.js');
      resetVisionBudget();
    }
    // 글 생성 AI 키 (사용자 요청: vision도 동일 모델 사용)
    const textGenerator = (cfg as any).primaryGeminiTextModel || GEMINI_TEXT_MODELS.FLASH;
    const apiKeys = {
      gemini: (cfg as any).geminiApiKey || '',
      claude: (cfg as any).claudeApiKey || '',
      openai: (cfg as any).openaiApiKey || '',
    };

    const { searchImagesForHeadings } = await import('./crawler/googleImageSearch.js');
    const resultMap = await searchImagesForHeadings(
      validPayload.headings,
      validPayload.mainKeyword,
      {
        relevanceCheckEnabled,
        relevanceThreshold,
        textGenerator,
        apiKeys,
        sourceUrl: validPayload.sourceUrl, // ✅ [v2.7.66] URL 모드 원본 크롤링
      }
    );

    // Map → 일반 객체로 변환 (IPC 전송용)
    const result: Record<string, string[]> = {};
    for (const [heading, urls] of resultMap.entries()) {
      result[heading] = urls;
    }

    console.log(`[Main] ✅ search-images-for-headings 완료: ${Object.keys(result).length}개 매칭`);
    return { success: true, images: result };
  } catch (error: any) {
    console.error(`[Main] ❌ search-images-for-headings 실패:`, error);
    return { success: false, message: error.message, images: {} };
  }
});


ipcMain.handle('automation:run', async (_event, payload: AutomationRequest) => {
  const isLocalAppSchedule = payload.publishMode === 'schedule' && payload.scheduleType === 'app-schedule';
  const e2eCapture = await captureE2EPublishPayload(payload as any, process.env, !app.isPackaged);
  if (e2eCapture) return e2eCapture;
  // ============================================
  //  [리팩토링] 새 엔진으로 완전 위임
  // ============================================

  console.log('[Main] automation:run  AutomationService.executePostCycle() 위임');

  // [2026-06-23] 발행용 브라우저 보장 — 시스템 Chrome이 없는 PC는 고정버전 Chrome을 최초 1회
  // 자동 다운로드한다. dev(Chrome 있음)↔배포(Chrome 없는 고객) 브라우저 변인을 제거해 모든
  // 사용자가 동일한 브라우저로 발행하게 만든다. 진행률은 기존 진행 모달(sendLog)에 표시.
  try {
    if (!isLocalAppSchedule) {
      const { ensureChromiumAvailable } = await import('./browserInstaller.js');
      await ensureChromiumAvailable((_pct, message) => sendLog(`🌐 ${message}`));
    }
  } catch (browserErr: any) {
    const msg = `발행용 브라우저 준비 실패: ${browserErr?.message || browserErr}. 인터넷 연결을 확인한 뒤 다시 시도해주세요.`;
    console.error(`[Main] ${msg}`);
    sendLog(`❌ ${msg}`);
    return { success: false, message: msg };
  }

  // SPEC-IMAGE-MODEL-001 Phase 5 — materialize blob-id images to temp files for automation god file compat.
  if (payload.generatedImages && payload.generatedImages.length > 0) {
    const { materializePublishingImages } = await import('./main/utils/materializePublishingImages.js');
    const { getBlobStoreInstance } = await import('./main/blobStore/singleton.js');
    const materialized = await materializePublishingImages(payload.generatedImages, getBlobStoreInstance());
    payload = { ...payload, generatedImages: materialized as typeof payload.generatedImages };
  }

  // [SPEC-PROMPT-2026-REFRESH Phase 2 / v2.10.233] 발행 시간 골든존 가드
  //   배경: 00~08시 발행은 초기 3시간 평가창에서 유입 0 → 노출 페널티 -40% (weolbu·adsensefarm 실측).
  //   동작: 골든존(09~22시) 외 시각이면 console.warn + sendLog로 progress modal에 경고 표시.
  //   강제 차단은 하지 않음 — 사용자가 일부러 새벽에 발행할 수도 있어 결정 존중.
  try {
    const goldenZoneCheck = checkGoldenZone();
    if (!goldenZoneCheck.isGolden) {
      const suggested = goldenZoneCheck.suggestedNextGolden
        ? `${goldenZoneCheck.suggestedNextGolden.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 권장`
        : '';
      const warnMsg = `⏰ 발행 시간 가드: ${goldenZoneCheck.reason}${suggested ? ` 다음 골든존 ${suggested}` : ''}`;
      console.warn(`[Main] ${warnMsg}`);
      sendLog(warnMsg);
    } else {
      console.log(`[Main] ✅ 발행 시간 골든존 (${goldenZoneCheck.hour}시)`);
    }
  } catch (gzErr: any) {
    console.warn('[Main] 발행 시간 가드 예외 — graceful skip:', gzErr?.message || gzErr);
  }

  //  라이선스/quota 검증
  const validationResult = await validateAutomationRun();
  if (!validationResult.valid) {
    return validationResult.response;
  }

  // ✅ [2026-03-01 FIX] 선차감 패턴: 발행 전에 쿼터를 먼저 차감
  let preConsumed = false;
  const isFreeUser = await AuthUtils.isFreeTierUser();
  if (isFreeUser && !isLocalAppSchedule) {
    try {
      const newState = await consumeQuota('publish', 1);
      preConsumed = true;
      console.log(`[Main] 무료 사용자: publish 쿼터 선차감 완료 (현재: ${newState.publish})`);
    } catch (quotaError) {
      console.error('[Main] 쿼터 선차감 중 오류 (무시됨):', quotaError);
    }
  }

  // ✅ [FIX-6] 실행 잠금 래핑 — 동시 인스턴스 방지
  const runPromise = (async () => {
    try {
      //  새 엔진 호출 (BlogExecutor.runFullPostCycle 실행)
      const result = await executeWithContentPolicyManualReview(payload as any, {
        execute: (approvedPayload) => AutomationService.executePostCycle(approvedPayload as any),
        confirm: confirmContentPolicyManualReview,
      });
      assertImmediatePublishResultUrl(result, payload);

      //  결과 반환
      if (result.success) {
        console.log('[Main] 발행 성공: 선차감된 쿼터 확정');
        // ✅ [2026-04-20] A/B 메타로그 기록 (실패해도 발행 계속)
        try {
          const validationResult = (result as any).__validationResult
            || ((result as any).content as any)?.__validationResult
            || null;
          const postId = recordPublishMeta({
            postId: (result as any).postId || (result.url ? String(result.url) : undefined),
            featuresEnabled: getEnabledFeatures(ALL_TRACKED_FEATURES),
            validation: validationResult,
            notes: result.url ? `url:${result.url}` : undefined,
          });
          console.log(`[Main] 📊 A/B 메타 기록: postId=${postId}, features=${getEnabledFeatures(ALL_TRACKED_FEATURES).length}개`);
        } catch (metaErr) {
          console.error('[Main] A/B 메타 기록 실패(발행 계속):', metaErr);
        }
        sendStatus({ success: true, url: result.url, message: result.message });
      } else if (result.cancelled) {
        if (preConsumed) {
          try {
            const refunded = await refundQuota('publish', 1);
            console.log(`[Main] 발행 취소: 쿼터 환불 완료 (현재: ${refunded.publish})`);
          } catch (e) { console.error('[Main] 쿼터 환불 오류:', e); }
        }
        sendStatus({ success: false, cancelled: true, message: result.message, failureCode: 'USER_CANCELLED' });
      } else {
        if (preConsumed) {
          try {
            const refunded = await refundQuota('publish', 1);
            console.log(`[Main] 발행 실패: 쿼터 환불 완료 (현재: ${refunded.publish})`);
          } catch (e) { console.error('[Main] 쿼터 환불 오류:', e); }
        }
        const failureCode = (result as any).failureCode || classifyPublishFailure(result.message).code;
        // [2026-06-23] 발행 실패 시 진단 리포트 자동 생성 — 추측 대신 데이터로 즉시 원인 파악.
        const diag = await generateDiagnosticReport({ lastError: result.message, stage: 'result-failure' }).catch(() => null);
        if (diag?.savedPath) {
          (result as any).message = `${result.message}\n\n🔧 진단 리포트가 저장됐어요:\n${diag.savedPath}\n이 파일을 개발자에게 보내주시면 원인을 바로 찾을 수 있어요.`;
        }
        sendStatus({ success: false, message: (result as any).message, failureCode });
      }

      return result;

    } catch (error) {
      if (preConsumed) {
        try {
          const refunded = await refundQuota('publish', 1);
          console.log(`[Main] 자동화 오류: 쿼터 환불 완료 (현재: ${refunded.publish})`);
        } catch (e) { console.error('[Main] 쿼터 환불 오류:', e); }
      }
      const baseMessage = (error as Error).message || '자동화 실행 중 오류가 발생했습니다.';
      console.error('[Main] automation:run 오류:', baseMessage);
      const failureCode = classifyPublishFailure(error).code;
      // [2026-06-23] 예외 발생 시에도 진단 리포트 자동 생성.
      const diag = await generateDiagnosticReport({ lastError: baseMessage, stage: 'automation:run/exception' }).catch(() => null);
      const message = diag?.savedPath
        ? `${baseMessage}\n\n🔧 진단 리포트가 저장됐어요:\n${diag.savedPath}\n이 파일을 개발자에게 보내주시면 원인을 바로 찾을 수 있어요.`
        : baseMessage;
      sendStatus({ success: false, message, failureCode });
      AutomationService.stopRunning();
      return { success: false, message, failureCode };
    }
  })();

  // ✅ [FIX-6] 잠금 설정 → 완료 후 해제
  setExecutionLock(runPromise);
  try {
    return await runPromise;
  } finally {
    setExecutionLock(null);
  }
});


ipcMain.handle('automation:cancel', async (_event, metadata?: unknown) => {
  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseOnly();
  if (!check.valid) return check.response;

  // ✅ [2026-04-03 FIX] 항상 취소 요청 — AI 콘텐츠 생성/이미지 생성도 즉시 abort
  // automationRunning이 false여도 generateStructuredContent가 돌고 있을 수 있음
  const cancelMeta = metadata && typeof metadata === 'object'
    ? metadata as Record<string, unknown>
    : {};
  const cancelSource = typeof cancelMeta.source === 'string' ? cancelMeta.source.slice(0, 100) : 'legacy-renderer';
  const cancelReason = typeof cancelMeta.reason === 'string' ? cancelMeta.reason.slice(0, 300) : 'operator cancel';
  const contentRequestId = typeof cancelMeta.contentRequestId === 'string'
    ? cancelMeta.contentRequestId.trim()
    : '';
  const abortedGenerations = contentRequestId
    ? Number(contentGenerationAbortRegistry.abort(contentRequestId, `${cancelSource}: ${cancelReason}`))
    : 0;
  await abortImageGeneration().catch(() => undefined);
  console.warn(`[CancelTrace] scope=automation source=${cancelSource} generationAborts=${abortedGenerations} reason=${cancelReason}`);
  AutomationService.requestCancel();
  // ✅ [2026-04-06 FIX] 항상 stopRunning 호출 — 새 엔진 사용 시 automation=null이라
  // 아래 early return에서 stopRunning이 호출되지 않아 재실행 시 "이미 실행 중" 에러 발생
  AutomationService.stopRunning();

  if (!automationRunning || !automation) {
    return true; // ✅ abort signal은 발동했으므로 true 반환
  }

  await automation.cancel().catch(() => undefined);
  sendStatus({ success: false, cancelled: true, message: '사용자가 자동화를 취소했습니다.' });
  automationRunning = false;
  automation = null;
  return true;
});


// ✅ [2026-02-23 FIX] 이미지 생성 전체 상태 초기화 IPC 핸들러
ipcMain.handle('automation:resetImageState', async () => {
  try {
    resetAllImageState();
    return { success: true };
  } catch (error) {
    console.error('[Main] 이미지 상태 초기화 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('automation:abortImageGeneration', async () => {
  try {
    await abortImageGeneration();
    return { success: true };
  } catch (error) {
    console.error('[Main] 이미지 생성 중단 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle(
  'automation:generateImages',
  async (_event, options: GenerateImagesOptions): Promise<{ success: boolean; images?: GeneratedImage[]; message?: string }> => {
    // ✅ [리팩토링] 통합 검증 함수 사용
    const check = await validateLicenseAndQuota('media', 1);
    if (!check.valid) {
      return check.response;
    }
    try {
      // AppConfig에서 API 키 로드
      const config = await loadConfig();

      const apiKeys = {
        openaiApiKey: config.openaiApiKey,
        pexelsApiKey: config.pexelsApiKey,
        unsplashApiKey: config.unsplashApiKey,
        pixabayApiKey: config.pixabayApiKey,
        geminiApiKey: config.geminiApiKey,
        deepinfraApiKey: (config as any).deepinfraApiKey,
        // ✅ [2026-02-22] 새 이미지 프로바이더 API 키
        openaiImageApiKey: (config as any).openaiImageApiKey,
        leonardoaiApiKey: (config as any).leonardoaiApiKey,
        prodiaApiKey: (config as any).prodiaApiKey || (config as any).prodiaToken,

      };

      // 쇼핑 AI: 수집 이미지는 결과물이 아니라 대표 상품 레퍼런스로만 사용한다.
      const isShoppingConnect = (options as any).isShoppingConnect === true;
      const rawCollectedImages = Array.isArray((options as any).collectedImages)
        ? (options as any).collectedImages
        : [];
      let collectedImages = rawCollectedImages;

      if (isShoppingConnect && Array.isArray(collectedImages) && collectedImages.length > 0 && options.items) {
        const dedupResult = await deduplicateSourceImagesByContent(collectedImages, { maxCandidates: 12 });
        collectedImages = dedupResult.images;
        const shoppingReference = resolveShoppingRepresentativeReference(collectedImages);
        const representativeUrl = shoppingReference.referenceUrl;
        console.log(`[Main] 🛒 쇼핑커넥트 수집 이미지 중복 제거: ${rawCollectedImages.length}개 → ${collectedImages.length}개 (제거 ${dedupResult.removedCount}개)`);
        if (!representativeUrl) {
          throw new Error('쇼핑 AI 생성에 사용할 대표 상품 이미지를 확인하지 못했습니다. 상품 이미지 수집 결과를 확인해주세요.');
        }
        collectedImages = shoppingReference.images;
        const referencedItems = applyShoppingRepresentativeReference(options.items, representativeUrl);
        referencedItems.forEach((item, idx) => {
          console.log(`[Main]   📎 소제목 ${idx + 1} (${item.heading?.substring(0, 20) || ''}) → 공통 대표 이미지 참조`);
        });
        options = {
          ...options,
          collectedImages: collectedImages as string[],
          items: referencedItems,
        };
      }

      // ✅ [FIX] isShoppingConnect 및 collectedImages를 options에 명시적으로 설정
      if (isShoppingConnect) {
        (options as any).isShoppingConnect = true;
        (options as any).collectedImages = collectedImages;
        console.log(`[Main] 🛒 쇼핑커넥트 옵션 설정 완료: isShoppingConnect=true, collectedImages=${collectedImages.length}개`);
      }

      // ✅ [2026-01-29 FIX] sourceUrl이 있으면 자동으로 이미지 크롤링 → crawledImages로 전달 (img2img 활성화)
      const sourceUrl = (options as any).sourceUrl || '';
      if (sourceUrl && sourceUrl.startsWith('http') && collectedImages.length === 0) {
        try {
          console.log(`[Main] 🔗 sourceUrl에서 이미지 크롤링 시작: ${sourceUrl.substring(0, 60)}...`);
          const SmartCrawler = (await import('./crawler/smartCrawler.js')).SmartCrawler;
          const crawler = new SmartCrawler();
          const crawlResult = await crawler.crawl(sourceUrl, {
            maxLength: 5000,
            timeout: 15000,
            extractImages: true,
          });

          if (crawlResult && crawlResult.images && crawlResult.images.length > 0) {
            const urlImages = crawlResult.images
              .filter((img: any) => typeof img === 'string' && img.startsWith('http'))
              .slice(0, 10); // 최대 10개만 사용

            if (urlImages.length > 0) {
              (options as any).crawledImages = urlImages;
              console.log(`[Main] ✅ URL에서 ${urlImages.length}개 이미지 크롤링 완료 → img2img 활성화`);

              // 쇼핑 AI는 모든 항목에 같은 대표 이미지를 적용한다.
              if (options.items) {
                options.items.forEach((item: any, idx: number) => {
                  if (!item.referenceImageUrl && !item.referenceImagePath) {
                    item.referenceImageUrl = isShoppingConnect ? urlImages[0] : urlImages[idx % urlImages.length];
                    console.log(`[Main]   📎 [${idx + 1}] "${(item.heading || '').substring(0, 20)}" → img2img 참조`);
                  }
                });
              }
            }
          }
        } catch (crawlErr) {
          console.warn(`[Main] ⚠️ URL 이미지 크롤링 실패: ${(crawlErr as Error).message}`);
        }
      }

      // ✅ [2026-01-24] headingImageMode에 따른 items 필터링
      const headingImageMode = (options as any).headingImageMode || 'all';
      const isShoppingConnectMode = (options as any).isShoppingConnect === true;
      const originalRequestedImageCount = Array.isArray(options.items) ? options.items.length : 0;

      console.log(`[Main] 🖼️ headingImageMode="${headingImageMode}", isShoppingConnect=${isShoppingConnectMode}`);

      // ✅ 각 item에 originalIndex 추가 (필터링 후에도 원래 위치 추적 가능)
      options.items = options.items.map((item, idx) => ({
        ...item,
        originalIndex: idx,
      }));

      if (headingImageMode !== 'all' && options.items && options.items.length > 0) {
        const originalCount = options.items.length;

        options.items = options.items.filter((item, idx) => {
          // 쇼핑커넥트 모드: item.isThumbnail 속성으로만 썸네일 판단
          // 일반 모드: 첫 번째 항목(idx === 0)이 대표 이미지(썸네일 역할)
          const heading = (item.heading || '').toLowerCase();
          const origIdx = (item as any).originalIndex ?? idx;

          // ✅ [2026-02-23 FIX] 모든 모드 통합 - 썸네일은 isThumbnail 플래그 또는 heading 기반
          const isThumbnail = item.isThumbnail === true ||
            heading.includes('썸네일') ||
            heading.includes('thumbnail') ||
            heading.includes('서론') ||
            heading.includes('대표');

          let shouldInclude = false;
          switch (headingImageMode) {
            case 'thumbnail-only':
              // 썸네일만 포함
              shouldInclude = isThumbnail;
              break;
            case 'odd-only':
              // ✅ [2026-02-23 FIX] 썸네일 항상 포함 + 홀수 인덱스 (썸네일 포함 카운트)
              // 썸네일(origIdx=0) = 항상 포함
              // 소제목1(origIdx=1) = 홀수 → 포함
              // 소제목2(origIdx=2) = 짝수 → 제외
              // 소제목3(origIdx=3) = 홀수 → 포함
              if (isThumbnail) {
                shouldInclude = true;
              } else {
                shouldInclude = origIdx % 2 === 1; // 홀수 인덱스
              }
              break;
            case 'even-only':
              // ✅ [2026-02-23 FIX] 썸네일 항상 포함 + 짝수 인덱스 (origIdx 기준, 썸네일=0 포함 카운트)
              // [사용자 관점: 2번째, 4번째 소제목에만 이미지]
              // 썸네일(origIdx=0) = 항상 포함 (짝수이므로 자연스럽게 포함)
              // 소제목1(origIdx=1) = 홀수 → ❌ 제외 (사용자 관점 1번째)
              // 소제목2(origIdx=2) = 짝수 → ✅ 포함 (사용자 관점 2번째)
              // 소제목3(origIdx=3) = 홀수 → ❌ 제외 (사용자 관점 3번째)
              if (isThumbnail) {
                shouldInclude = true;
              } else {
                shouldInclude = origIdx % 2 === 0;
              }
              break;
            case 'none':
              shouldInclude = false;
              break;
            default:
              shouldInclude = true;
          }

          console.log(`[Main] 🖼️ 필터링 - [origIdx=${origIdx}] "${item.heading}" isThumbnail=${isThumbnail} shouldInclude=${shouldInclude}`);
          return shouldInclude;
        });

        console.log(`[Main] 🖼️ headingImageMode="${headingImageMode}": ${originalCount}개 → ${options.items.length}개 이미지 생성`);

        // ✅ 필터링 후 남은 items의 originalIndex 로그
        const remainingIndices = options.items.map((item: any) => item.originalIndex);
        console.log(`[Main] 🖼️ 생성할 이미지 원래 인덱스: [${remainingIndices.join(', ')}]`);
      }

      // ✅ [2026-01-27] 각 아이템에 isThumbnail 기반 개별 비율 적용
      // thumbnailImageRatio: 썸네일(1번 소제목) 전용 비율
      // subheadingImageRatio: 나머지 소제목 전용 비율
      const thumbnailRatio = (options as any).thumbnailImageRatio || (options as any).imageRatio || '1:1';
      const subheadingRatio = (options as any).subheadingImageRatio || (options as any).imageRatio || '1:1';

      if (options.items && options.items.length > 0) {
        options.items = options.items.map((item: any, idx: number) => {
          const origIdx = item.originalIndex ?? idx;

          // ✅ [2026-02-23 FIX] 모든 모드 통합 - isThumbnail 플래그 기반 비율 결정
          const isThumbnailItem = item.isThumbnail === true ||
            (item.heading || '').toLowerCase().includes('썸네일') ||
            (item.heading || '').toLowerCase().includes('thumbnail');

          // 비율 적용
          const itemRatio = isThumbnailItem ? thumbnailRatio : subheadingRatio;

          console.log(`[Main] 📐 비율 적용 - [origIdx=${origIdx}] "${(item.heading || '').substring(0, 20)}" isThumbnail=${isThumbnailItem} → ratio=${itemRatio}`);

          return {
            ...item,
            imageRatio: itemRatio,
            aspectRatio: itemRatio, // API에서 aspectRatio로 사용하는 경우 대비
          };
        });

        console.log(`[Main] 📐 썸네일 비율: ${thumbnailRatio}, 소제목 비율: ${subheadingRatio}`);
      }

      // ✅ [2026-01-29 FIX] collectedImages를 crawledImages로 전달 (img2img 활성화)
      if (collectedImages && collectedImages.length > 0) {
        (options as any).crawledImages = collectedImages.map((img: any) =>
          typeof img === 'string' ? img : (img.referenceImageUrl || img.url || img.filePath || img.thumbnailUrl || img.referenceImagePath)
        ).filter((url: string) => /^https?:\/\//i.test(String(url || '')));
        console.log(`[Main] 🖼️ img2img 활성화: ${(options as any).crawledImages.length}개 크롤링 이미지 전달`);
      }

      // ✅ [2026-02-13 SPEED] 개별 이미지 완성 시 renderer에 실시간 전달 콜백
      const onImageGenerated = (image: GeneratedImage, index: number, total: number) => {
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('automation:imageGenerated', { image, index, total });
            console.log(`[Main] 🖼️ 이미지 실시간 전달 → renderer (${index + 1}/${total})`);
          }
        } catch (sendErr) {
          console.warn(`[Main] ⚠️ 이미지 실시간 전달 실패:`, (sendErr as Error).message);
        }
      };

      // ✅ [2026-02-18 DEBUG] IPC 수신 시점 provider 진단 로그
      console.log(`[Main] 🔍🔍🔍 IPC 수신 options.provider = "${options.provider}" (type: ${typeof options.provider})`);
      if (!options.provider || options.provider === 'nano-banana-pro') {
        console.warn(`[Main] ⚠️⚠️⚠️ options.provider가 기본값! 스택: IPC automation:generateImages`);
      }

      // ✅ [2026-02-23 FIX] 이미지 생성 전 이전 캐시 완전 초기화
      resetAllImageState();

      // ✅ [v2.6.4 HOTFIX] Stale cancelRequested 자동 리셋
      //   원인: 이전 발행 중지 → AutomationService.cancelRequested = true
      //         새 연속발행 시작 → renderer는 stopFullAutoPublish=false로 리셋했지만
      //         main의 cancelRequested는 startRunning() 거쳐야만 리셋됨
      //         → 이미지 생성 IPC가 즉시 "취소" 응답 → 사용자 중지 안 했는데 3번 재시도 모두 실패
      //   수정: 자동화가 실행 중이 아니면 cancel 플래그는 stale이므로 자동 리셋
      if (AutomationService.isCancelRequested() && !AutomationService.isRunning()) {
        console.log('[Main] 🔄 stale cancelRequested 감지 (실행 중 아님) → 자동 리셋');
        AutomationService.resetCancelFlag();
      }

      // ✅ [2026-04-03 FIX] 이미지 생성 전 취소 체크
      if (AutomationService.isCancelRequested()) {
        return { success: false, message: '사용자가 작업을 취소했습니다.' };
      }

      const imageOptions = {
        ...options,
        imageFallbackPolicy: options.imageFallbackPolicy || 'engine-only',
      };
      const images = await generateImages(imageOptions, apiKeys, onImageGenerated);
      const generatedImageCount = Array.isArray(images) ? images.length : 0;
      const providerForEmptyCheck = String(options.provider || imageOptions.provider || '');
      const requiredGeneratedImageCount = Array.isArray(options.items) ? options.items.length : 0;
      const shouldRequireImages =
        originalRequestedImageCount > 0 &&
        headingImageMode !== 'none' &&
        providerForEmptyCheck !== 'skip' &&
        providerForEmptyCheck !== 'local-folder';
      if (shouldRequireImages && generatedImageCount === 0) {
        const providerLabel = String(options.provider || imageOptions.provider || 'unknown');
        const message = `[${providerLabel}] 이미지 생성 결과가 비어있습니다. 화면 결과 감지, 로그인 세션, 구독/쿼터, 또는 엔진 UI 변경을 확인해야 합니다.`;
        console.warn(`[Main] ${message}`);
        return { success: false, images: [], message };
      }
      if (shouldRequireImages && requiredGeneratedImageCount > 0 && generatedImageCount < requiredGeneratedImageCount) {
        const providerLabel = String(options.provider || imageOptions.provider || 'unknown');
        const message = `[${providerLabel}] 이미지가 일부만 생성되었습니다 (${generatedImageCount}/${requiredGeneratedImageCount}). 누락 이미지가 있어 발행을 중단하고 이미지 단계부터 다시 시도합니다.`;
        console.warn(`[Main] ${message}`);
        return { success: false, images, message };
      }

      if (await isFreeTierUser()) {
        await consumeQuota('media', 1);
      }
      return { success: true, images };
    } catch (error) {
      const message = (error as Error).message ?? '이미지 생성 중 오류가 발생했습니다.';
      return { success: false, message };
    }
  },
);

// ✅ AI 이미지 자동 매칭 핸들러 (이미지 생성 전 참조 이미지 결정을 위해 사용)
ipcMain.handle(
  'automation:matchImages',
  async (_event, payload: {
    headings: any[];
    collectedImages: any[];
    scSubImageSource?: 'ai' | 'collected'; // ✅ [2026-01-28] 수집 이미지 직접 사용 옵션
  }): Promise<{ success: boolean; assignments?: any[]; message?: string }> => {
    try {
      // ✅ [2026-01-28] 수집 이미지 직접 사용 모드: AI 없이 순서대로 할당
      const useCollectedDirectly = payload.scSubImageSource === 'collected';

      if (useCollectedDirectly) {
        console.log('[Main] 🖼️ 수집 이미지 직접 사용 모드: AI 없이 순서대로 할당');
        console.log(`[Main]   📦 소제목 ${payload.headings.length}개, 수집 이미지 ${payload.collectedImages.length}개`);

        // ✅ [2026-01-28] 중복/유사 이미지 필터링
        // 1. URL 완전 일치 중복 제거
        // 2. 같은 기본 이미지에서 파생된 유사 이미지 제거 (스티커, 라벨, 크기 차이 등)
        const seenBaseUrls = new Set<string>();
        const uniqueImages: typeof payload.collectedImages = [];

        for (const img of payload.collectedImages) {
          const url = img.url || img.thumbnailUrl || '';
          if (!url) continue;

          // URL에서 기본 이미지 식별자 추출 (쿼리 파라미터, 사이즈 변형 제거)
          // 예: image_123.jpg?size=small → image_123
          // 예: product_456_v1.jpg → product_456
          const baseUrl = url
            .replace(/\?.*$/, '')  // 쿼리 파라미터 제거
            .replace(/(_v\d+|_\d{2,}x\d{2,}|_s\d+|_m\d+|_l\d+)(\.[a-z]+)?$/i, '$2')  // 사이즈 변형 제거
            .replace(/[-_](small|medium|large|thumb|full|origin|detail|main|sub)(\.[a-z]+)?$/i, '$2');  // 타입 변형 제거

          // 파일명만 추출해서 비교 (더 정확한 중복 감지)
          const fileName = baseUrl.split('/').pop()?.replace(/\.[a-z]+$/i, '') || baseUrl;

          // 숫자 부분 제거하여 기본 패턴 추출 (image_001, image_002 같은 연속 이미지 탐지)
          const basePattern = fileName.replace(/[_-]?\d+$/, '');

          // 이미 같은 기본 패턴의 이미지가 있으면 스킵
          if (seenBaseUrls.has(basePattern) && basePattern.length > 5) {
            console.log(`[Main]   🔄 유사 이미지 스킵: ${fileName.substring(0, 30)}...`);
            continue;
          }

          // 완전 동일 URL 체크
          if (seenBaseUrls.has(url)) {
            console.log(`[Main]   🔄 중복 URL 스킵: ${url.substring(0, 50)}...`);
            continue;
          }

          seenBaseUrls.add(url);
          seenBaseUrls.add(basePattern);
          uniqueImages.push(img);
        }

        console.log(`[Main]   🧹 중복/유사 제거: ${payload.collectedImages.length}개 → ${uniqueImages.length}개`);

        const assignments = payload.headings.map((h, idx) => {
          // ✅ 필터링된 고유 이미지만 사용
          const img = idx < uniqueImages.length ? uniqueImages[idx] : null;

          if (!img) {
            console.log(`[Main]   ⚠️ 소제목 ${idx + 1} "${(h.title || h).substring(0, 15)}..." → 이미지 부족 (건너뜀)`);
            return null;
          }

          console.log(`[Main]   ✅ 소제목 ${idx + 1} → 이미지 ${idx + 1}번 할당`);
          return {
            headingIndex: idx,
            headingTitle: h.title || h,
            imageUrl: img.url || img.thumbnailUrl,
            imagePath: img.filePath,
            source: img.source || 'collected',
            confidence: 100,
            reason: '수집 이미지 직접 사용 (중복 필터링 완료)',
          };
        }).filter(a => a !== null);

        console.log(`[Main]   🎉 ${assignments.length}개 소제목에 고유 이미지 할당 완료`);
        return { success: true, assignments };
      }

      // ✅ 기존 AI 매칭 로직
      const config = await loadConfig();
      if (!config.geminiApiKey) {
        return { success: false, message: 'Gemini API 키가 필요합니다.' };
      }

      const imagePlacer = new IntelligentImagePlacer(config.geminiApiKey);

      // 데이터 형식 변환 (IntelligentImagePlacer 내부 형식에 맞춤)
      const headingsWithContent = payload.headings.map((h, idx) => ({
        index: idx,
        title: h.title || h,
        content: h.summary || h.content || '',
        keywords: h.keywords || [h.title || h],
      }));

      const collectedImagesForPlacer = payload.collectedImages.map(img => ({
        id: img.id,
        url: img.url || img.thumbnailUrl,
        thumbnailUrl: img.thumbnailUrl,
        source: img.source,
        title: img.title || 'Product Image',
        tags: img.tags || [],
        photographer: '',
        license: 'unknown',
      }));

      const assignments = await imagePlacer.autoMatchImagesForFullAuto(
        headingsWithContent,
        collectedImagesForPlacer
      );

      return { success: true, assignments };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }
);

// ✅ 네이버 이미지 개선 버전 핸들러
ipcMain.handle(
  'automation:generateImagesNaverImproved',
  async (_event, payload: {
    items: Array<{ heading: string; prompt: string }>;
    postTitle?: string;
    postId?: string;
    isRegenerate?: boolean;
    sourceUrl?: string;
    articleUrl?: string;
    options?: {
      apiKey?: string;
      aiProvider?: 'gemini' | 'openai';
      minRelevanceScore?: number;
      minPopularityScore?: number;
      checkPopularity?: boolean;
      expandKeywords?: boolean;
    };
  }): Promise<{ success: boolean; images?: GeneratedImage[]; message?: string }> => {
    // ✅ [리팩토링] 통합 검증
    const check = await validateLicenseAndQuota('media', 1);
    if (!check.valid) return check.response;

    try {
      console.log('[Main] generateImagesNaverImproved 호출:', payload.items.length, '개 항목');

      // 네이버 이미지 개선 버전 사용
      const { generateWithNaverImproved } = await import('./image/naverImageGenerator.js');

      const images = await generateWithNaverImproved(
        payload.items,
        payload.postTitle || '',
        payload.postId || '',
        payload.isRegenerate || false,
        payload.sourceUrl || '',
        payload.articleUrl || '',
        payload.options || {}
      );

      console.log('[Main] generateImagesNaverImproved 완료:', images.length, '개 이미지');
      return { success: true, images };
    } catch (error) {
      console.error('[Main] generateImagesNaverImproved 실패:', error);
      const message = (error as Error).message ?? '네이버 이미지 생성 중 오류가 발생했습니다.';
      return { success: false, message };
    }
  },
);

// [v2.10.242] file:exists → main/ipc/fileHandlers.ts 로 이주 (위 블록 참조)

ipcMain.handle('automation:generateContent', async (_event, prompt: string) => {
  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseAndQuota('content', 1);
  if (!check.valid) return check.response;

  try {
    // ✅ [2026-03-20 FIX] defaultAiProvider에 따라 올바른 엔진 선택
    // 기존: generateBlogContent() (Gemini 전용)만 호출 → 다른 provider 무시
    // 수정: config.defaultAiProvider를 확인하여 generateStructuredContent 사용
    const config = await loadConfig();
    const provider = config.defaultAiProvider || 'gemini';
    let content: string;

    if (provider === 'gemini') {
      // Gemini: 기존 레거시 경로 유지 (폴백 모델 체인 포함)
      content = await generateBlogContent(prompt ?? '');
    } else {
      // OpenAI/Claude/Perplexity: generateStructuredContent의 provider-aware 경로 사용
      const source = { rawText: prompt ?? '', title: '', contentMode: 'seo' as const, sourceType: 'custom_text' as const };
      const result = await generateStructuredContent(source, { provider } as any);
      content = result?.bodyPlain || result?.bodyHtml || '';
      if (!content?.trim()) {
        throw new Error(`${provider} 엔진으로 콘텐츠를 생성하지 못했습니다.`);
      }
    }

    if (await isFreeTierUser()) {
      await consumeQuota('content', 1);
    }
    return { success: true, content };
  } catch (error) {
    const message = (error as Error).message ?? '콘텐츠 생성 중 오류가 발생했습니다.';
    return { success: false, message };
  }
});

// ✅ gemini:checkQuota, gemini:resetUsageTracker, gemini:setCreditBudget,
// api:getAllUsageSnapshots, api:resetUsage → src/main/ipc/apiHandlers.ts로 이동


// ✅ [2026-03-19] 범용 API 키 유효성 검증 + 잔액/사용량 조회 핸들러
ipcMain.handle('apiKey:validate', async (_event, provider: string, apiKey: string) => {
  try {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, message: 'API 키를 입력해주세요.' };
    }

    const key = apiKey.trim();
    const axios = (await import('axios')).default;
    const { getApiUsageSnapshot, flushAllApiUsage } = await import('./apiUsageTracker.js');

    // ✅ [2026-03-19 FIX] 앱 내 누적 사용량 조회 (geminiUsageTracker 합산 포함)
    await flushAllApiUsage();
    const allSnapshots = await getApiUsageSnapshot() as Record<string, any>;
    const providerKey = provider === 'openai' ? 'openai' : provider;
    const usage = { ...(allSnapshots[providerKey] || { totalCalls: 0, estimatedCostUSD: 0, totalInputTokens: 0, totalOutputTokens: 0, totalImages: 0, firstTracked: '', lastUpdated: '' }) };

    // ✅ Gemini: 기존 geminiUsageTracker (2026-03-18~) 데이터 합산
    // apiUsageTrackers.gemini는 3/19 이후 데이터만 있을 수 있으므로 이전 추적 데이터 병합
    if (provider === 'gemini') {
      // gemini 전용: 레거시 트래커 합산
      {
        const config = await loadConfig() as any;
        const legacyTracker = config.geminiUsageTracker;
        if (legacyTracker) {
          // 레거시에만 있고 새 트래커에 없는 데이터 합산
          usage.totalCalls += legacyTracker.totalCalls || 0;
          usage.totalInputTokens += legacyTracker.totalInputTokens || 0;
          usage.totalOutputTokens += legacyTracker.totalOutputTokens || 0;
          usage.estimatedCostUSD += legacyTracker.estimatedCostUSD || 0;
          // firstTracked: 더 오래된 날짜 사용
          if (legacyTracker.firstTracked && (!usage.firstTracked || legacyTracker.firstTracked < usage.firstTracked)) {
            usage.firstTracked = legacyTracker.firstTracked;
          }
          if (legacyTracker.lastUpdated && (!usage.lastUpdated || legacyTracker.lastUpdated > usage.lastUpdated)) {
            usage.lastUpdated = legacyTracker.lastUpdated;
          }
        }
      }
    }

    // OpenAI 이미지 사용량도 합산
    if (provider === 'openai') {
      const imgUsage = allSnapshots['openai-image'] || { totalCalls: 0, estimatedCostUSD: 0, totalImages: 0 };
      usage.totalCalls += imgUsage.totalCalls;
      usage.estimatedCostUSD += imgUsage.estimatedCostUSD;
      usage.totalImages = (usage.totalImages || 0) + (imgUsage.totalImages || 0);
      // 이미지 트래커의 firstTracked도 병합
      if (imgUsage.firstTracked && (!usage.firstTracked || imgUsage.firstTracked < usage.firstTracked)) {
        usage.firstTracked = imgUsage.firstTracked;
      }
    }

    // 대시보드 URL 매핑
    const dashboardUrls: Record<string, string> = {
      openai: 'https://platform.openai.com/settings/organization/billing/overview',
      leonardoai: 'https://app.leonardo.ai/api-access',
      deepinfra: 'https://deepinfra.com/dash/billing',
      claude: 'https://console.anthropic.com/settings/billing',
      perplexity: 'https://www.perplexity.ai/settings/api',
    };

    const makeBalanceObj = (extra?: { remaining?: string; total?: string }) => ({
      usedCost: `$${usage.estimatedCostUSD.toFixed(4)}`,
      totalCalls: usage.totalCalls,
      totalInputTokens: usage.totalInputTokens || 0,
      totalOutputTokens: usage.totalOutputTokens || 0,
      totalImages: usage.totalImages || 0,
      firstTracked: usage.firstTracked || '',
      lastUpdated: usage.lastUpdated || '',
      dashboardUrl: dashboardUrls[provider] || '',
      remaining: extra?.remaining || '',
      total: extra?.total || '',
    });

    switch (provider) {
      case 'leonardoai': {
        try {
          const resp = await axios.get('https://cloud.leonardo.ai/api/rest/v1/me', {
            headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' },
            timeout: 10000,
          });
          const user = resp.data?.user_details?.[0] || resp.data;
          const paidTokens = user?.apiPaidTokens ?? user?.apiCredit ?? null;
          const subTokens = user?.apiSubscriptionTokens ?? null;
          const totalCredits = (paidTokens !== null && subTokens !== null) ? (paidTokens + subTokens) : (paidTokens ?? subTokens ?? null);

          return {
            success: true,
            details: `사용자: ${user?.username || '확인됨'}`,
            balance: makeBalanceObj({
              remaining: totalCredits !== null ? `${totalCredits.toLocaleString()} 크레딧` : '대시보드 확인',
              total: paidTokens !== null ? `유료: ${paidTokens.toLocaleString()}` : '',
            }),
          };
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            return { success: false, message: 'API 키가 유효하지 않습니다. 키를 확인해주세요.' };
          }
          return { success: false, message: `Leonardo AI 연결 실패: ${err?.message || '알 수 없는 오류'}` };
        }
      }

      case 'perplexity': {
        try {
          const resp = await axios.post('https://api.perplexity.ai/chat/completions', {
            model: 'sonar',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
          }, {
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            timeout: 15000,
          });
          const model = resp.data?.model || 'sonar';
          return {
            success: true,
            details: `Perplexity API 연결 성공 | 모델: ${model}`,
            balance: makeBalanceObj(),
          };
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            return { success: false, message: 'API 키가 유효하지 않습니다. 키를 확인해주세요.' };
          }
          if (status === 429) {
            return { success: true, details: 'API 키 유효 (현재 요청 한도 초과)', balance: makeBalanceObj() };
          }
          return { success: false, message: `Perplexity 연결 실패: ${err?.message || '알 수 없는 오류'}` };
        }
      }

      case 'openai': {
        try {
          const resp = await axios.get('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` },
            timeout: 10000,
          });
          const models = resp.data?.data || [];
          const gptModels = models.filter((m: any) => m.id?.includes('gpt')).length;

          // ✅ [2026-03-20] OpenAI는 공식 잔액 API가 없음 (billing/credit_grants 폐기됨)
          // 앱 내 누적 사용량만 표시, 정확한 잔액은 대시보드에서 확인
          const creditInfo = { remaining: '', total: '' };

          return {
            success: true,
            details: `OpenAI 연결 성공 | 모델 ${models.length}개 (GPT ${gptModels}개)`,
            balance: makeBalanceObj(creditInfo),
          };
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401) {
            return { success: false, message: 'API 키가 유효하지 않습니다. 키를 확인해주세요.' };
          }
          if (status === 429) {
            return { success: true, details: 'API 키 유효 (현재 요청 한도 초과)', balance: makeBalanceObj() };
          }
          return { success: false, message: `OpenAI 연결 실패: ${err?.message || '알 수 없는 오류'}` };
        }
      }

      case 'claude': {
        try {
          const resp = await axios.post('https://api.anthropic.com/v1/messages', {
            model: CLAUDE_MODELS.HAIKU,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
          }, {
            headers: {
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          });
          const model = resp.data?.model || CLAUDE_MODELS.HAIKU;

          // ✅ [2026-03-20] Anthropic은 API 키로 잔액 조회 불가 (세션 쿠키 필요)
          // 앱 내 누적 사용량만 표시, 정확한 잔액은 대시보드에서 확인
          const creditInfo = { remaining: '', total: '' };

          return {
            success: true,
            details: `Claude API 연결 성공 | 모델: ${model}`,
            balance: makeBalanceObj(creditInfo),
          };
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401) {
            return { success: false, message: 'API 키가 유효하지 않습니다. 키를 확인해주세요.' };
          }
          if (status === 429) {
            return { success: true, details: 'API 키 유효 (현재 요청 한도 초과)', balance: makeBalanceObj({ remaining: '대시보드 확인' }) };
          }
          return { success: false, message: `Claude 연결 실패: ${err?.message || '알 수 없는 오류'}` };
        }
      }

      case 'deepinfra': {
        try {
          const resp = await axios.get('https://api.deepinfra.com/v1/openai/models', {
            headers: { 'Authorization': `Bearer ${key}` },
            timeout: 10000,
          });
          const models = resp.data?.data || [];

          // ✅ [2026-03-20] DeepInfra 잔액 조회 — 다양한 응답 필드 탐색
          const creditInfo = { remaining: '', total: '' };
          try {
            const billingResp = await axios.get('https://api.deepinfra.com/v1/api_token/me', {
              headers: { 'Authorization': `Bearer ${key}` },
              timeout: 8000,
            });
            const d = billingResp.data || {};
            console.log('[DeepInfra] /v1/api_token/me 응답 필드:', Object.keys(d));
            // 다양한 필드명 탐색 (공식 미문서화)
            const remaining = d.credits ?? d.balance ?? d.remaining_credits ?? d.credit_balance;
            const total = d.max_credits ?? d.total_credits ?? d.topped_up_credits;
            if (remaining !== undefined && remaining !== null) {
              creditInfo.remaining = `$${Number(remaining).toFixed(2)}`;
            }
            if (total !== undefined && total !== null) {
              creditInfo.total = `$${Number(total).toFixed(2)}`;
            }
          } catch (billingErr: any) {
            console.log('[DeepInfra] 잔액 API 조회 실패:', billingErr?.response?.status || billingErr?.message);
            // 폴백 없음 — 앱 내 누적 사용량만 표시
          }

          return {
            success: true,
            details: `DeepInfra 연결 성공 | 모델 ${models.length}개`,
            balance: makeBalanceObj(creditInfo),
          };
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            return { success: false, message: 'API 키가 유효하지 않습니다. 키를 확인해주세요.' };
          }
          return { success: false, message: `DeepInfra 연결 실패: ${err?.message || '알 수 없는 오류'}` };
        }
      }

      default:
        return { success: false, message: `지원하지 않는 프로바이더: ${provider}` };
    }
  } catch (error) {
    console.error('[ApiKey] 유효성 검증 실패:', error);
    return { success: false, message: `검증 실패: ${(error as Error).message}` };
  }
});

// ✅ Gemini API 연속 테스트 핸들러 (앱 환경)
// [v2.10.248] gemini:test10x → main/ipc/geminiHandlers.ts 로 이주

// [v2.10.248] gemini:generateVeoVideo → main/ipc/geminiHandlers.ts 로 이주
// 아래 dead block (한 번도 호출되지 않는 익명 함수) — 다음 정리 phase에서 완전 제거 예정.
// [v2.10.251] gemini:generateVeoVideo dead block 제거됨 (main/ipc/geminiHandlers.ts 에서 동작)

// 네이버 데이터랩 트렌드 분석 핸들러
// [v2.10.258] datalab:getTrendSummary + getSearchTrend → main/ipc/datalabApiHandlers.ts

// ✅ 실시간 트렌드 알림 관련 IPC 핸들러
// [v2.10.244] trend:* 6개 IPC 핸들러 → main/ipc/trendHandlers.ts 로 이주
//   등록: registerTrendHandlers({ trendMonitor, getMonitorTask, setMonitorTask, getTrendAlertEnabled, setTrendAlertEnabled, sendLog })
//   monitorTask / trendAlertEnabled mutable 변수는 getter/setter로 노출

// ✅ AI 어시스턴트 IPC 핸들러
// [v2.10.246] aiAssistant:* 4개 → main/ipc/aiAssistantHandlers.ts 로 이주
// 등록: registerAiAssistantHandlers() (아래 등록부)

// ✅ 발행 후 성과 추적 IPC 핸들러
// [v2.10.245] analytics:* 8개 IPC 핸들러 → main/ipc/postAnalyticsHandlers.ts 로 이주
//   등록: registerPostAnalyticsHandlers({ postAnalytics, getAnalyticsTask, setAnalyticsTask, sendLog })

// ✅ scheduler:* 핸들러 → scheduleHandlers.ts로 이관 완료 (10개 채널)

// ✅ [Phase 5A.2] keyword:* 핸들러 → keywordHandlers.ts로 이관 완료
// ✅ [Phase 5A.2] bestProduct:* 핸들러 → productHandlers.ts로 이관 완료
// ✅ [Phase 5A.2] internalLink:* + title:* 핸들러 → contentHandlers.ts로 이관 완료

// ✅ 썸네일 자동 생성 IPC 핸들러
ipcMain.handle('thumbnail:generateSvg', async (_event, title: string, options?: any, category?: string) => {
  try {
    const svg = thumbnailGenerator.generateSvgThumbnail(title, options, category);
    return { success: true, svg };
  } catch (error) {
    return { success: false, message: `생성 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('thumbnail:getStyles', async () => {
  try {
    const styles = thumbnailGenerator.getAvailableStyles();
    return { success: true, styles };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('thumbnail:getCategories', async () => {
  try {
    const categories = thumbnailGenerator.getAvailableCategories();
    return { success: true, categories };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

// ✅ [2026-02-04] 수집 이미지에 텍스트 오버레이 적용 IPC 핸들러
ipcMain.handle('thumbnail:createProductThumbnail', async (
  _event,
  imageUrl: string,
  text: string,
  options?: { position?: string; fontSize?: number; textColor?: string; opacity?: number }
) => {
  try {
    console.log(`[Main] 🎨 썸네일 텍스트 오버레이 시작: ${text.substring(0, 30)}...`);
    console.log(`[Main]   이미지 URL: ${imageUrl.substring(0, 60)}...`);

    // 1. URL에서 이미지 다운로드
    const tempDir = path.join(app.getPath('temp'), 'better-life-thumbnails');
    if (!fsSync.existsSync(tempDir)) {
      fsSync.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const inputPath = path.join(tempDir, `input_${timestamp}.jpg`);
    const outputPath = path.join(tempDir, `overlaid_${timestamp}.png`);

    // 이미지 다운로드
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    fsSync.writeFileSync(inputPath, Buffer.from(response.data));

    // 2. thumbnailService를 사용하여 텍스트 오버레이
    await thumbnailService.createProductThumbnail(inputPath, text, outputPath, {
      position: (options?.position as 'top' | 'center' | 'bottom') || 'bottom',
      fontSize: options?.fontSize || 28,
      textColor: options?.textColor || '#ffffff',
      opacity: options?.opacity || 0.8
    });

    // 3. 결과 이미지를 base64로 변환
    const outputBuffer = fsSync.readFileSync(outputPath);
    const previewDataUrl = `data:image/png;base64,${outputBuffer.toString('base64')}`;

    // 임시 파일 정리
    try { fsSync.unlinkSync(inputPath); } catch (e) { Logger.logDebug('image', '썸네일 임시파일 삭제 실패', { error: String(e) }); }

    console.log(`[Main] ✅ 썸네일 텍스트 오버레이 완료: ${outputPath}`);
    return { success: true, outputPath, previewDataUrl };
  } catch (error) {
    console.error(`[Main] ❌ 썸네일 오버레이 실패:`, error);
    return { success: false, message: `오버레이 실패: ${(error as Error).message}` };
  }
});

// ✅ [2026-04-03] 콘텐츠(내부링크 + 제목) 핸들러 → contentHandlers.ts로 추출
registerContentHandlers({
  internalLinkManager,
  titleABTester,
  loadConfig,
  applyConfigToEnv
});

// ✅ [2026-04-03] 소제목 이미지/영상 핸들러 → headingHandlers.ts로 추출
registerHeadingHandlers({
  headingImagesStore,
  headingVideosStore,
  saveHeadingImagesStore,
  saveHeadingVideosStore,
  validateLicenseOnly,
});

// ✅ [2026-04-03] 계정 관련 핸들러 → accountHandlers.ts로 추출
registerAccountHandlers(
  {
    getMainWindow: () => mainWindow!,
    getAutomationMap: () => automationMap,
    notify: (title: string, body: string) => { /* no-op */ },
    sendToRenderer: (channel: string, ...args: unknown[]) => mainWindow?.webContents.send(channel, ...args)
  },
  {
    blogAccountManager,
    reportUserActivity
  }
);

// ✅ [FIX] Phase 5A에서 추출된 핸들러 등록 — 앱 시작 전(최상위)에서 등록해야 로그인 창에서 사용 가능
const _earlyCtx = {
  getMainWindow: () => mainWindow!,
  getAutomationMap: () => automationMap,
  notify: (title: string, body: string) => { /* no-op */ },
  sendToRenderer: (channel: string, ...args: unknown[]) => mainWindow?.webContents.send(channel, ...args)
};
// ✅ 로그인 창에서 필요한 핸들러만 최상위에서 등록 (의존성 없는 것만)
registerLicenseHandlers(_earlyCtx);
// ✅ app:getVersion — 로그인 창에서 버전 표시용 (systemHandlers는 app.whenReady() 이후에 등록)
try { ipcMain.handle('app:getVersion', async () => app.getVersion()); } catch { /* 이미 등록됨 */ }
ipcMain.handle('app:getActiveNotice', async (): Promise<string> => latestActiveNotice);
// ✅ openExternalUrl — 로그인 창 구매문의 버튼용
try { ipcMain.handle('openExternalUrl', async (_e: any, url: string) => {
  // ✅ [v2.7.56 SEC-V2-H3] file:/javascript: 차단
  if (typeof url !== 'string' || !url) return;
  const ALLOWED = ['http:', 'https:', 'mailto:'];
  try {
    const u = new URL(url);
    if (!ALLOWED.includes(u.protocol)) { console.warn(`[SEC] 차단된 프로토콜: ${u.protocol}`); return; }
  } catch { return; }
  const { shell } = require('electron');
  await shell.openExternal(url);
}); } catch { /* 이미 등록됨 */ }
// ✅ [2026-04-03] 트레이 아이콘화 — 렌더러에서 버튼 클릭 시 호출
try { ipcMain.handle('app:minimize-to-tray', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
    console.log('[Main] 트레이로 숨김');
    if (tray && !(globalThis as any).trayNotified) {
      tray.displayBalloon({ title: 'Leaders Pro', content: '트레이로 최소화되었습니다. 아이콘 클릭으로 복원합니다.' });
      (globalThis as any).trayNotified = true;
    }
  }
}); } catch { /* 이미 등록됨 */ }
registerQuotaHandlers(_earlyCtx);
registerApiHandlers(_earlyCtx);
// ✅ 에이전트 모드(codex/claude 구독 연동 글생성) IPC — 의존성 없음, 최상위 등록
registerAgentHandlers();
// ✅ [2026-06-23] 원클릭 진단 리포트 (오류 자동 보고) — 환경별 버그 즉시 진단
registerDiagnosticsHandlers();
// ✅ [SPEC-DEFAMATION-2026 P1] 발행 경계 위험 게이트 — 저장본/붙여넣기 재발행 사각지대 커버
registerDefamationHandlers();
registerKeywordHandlers();
registerProductHandlers();
registerEngagementHandlers();
registerImageTableHandlers();
// ✅ [v2.10.203] SERP/publishedPost IPC 등록 — v2.10.184~v2.10.199 누락 fix
//   사용자 콘솔 에러: "No handler registered for 'serp:historyStats'" / 'publishedPost:calibration'
//   원인: registerAllHandlers 내부에 있는데 main.ts가 개별 호출 패턴이라 미호출
registerSerpProbeHandlers();
registerContentPolicyHandlers();
registerRevenueOperationsHandlers();
// ✅ miscHandlers: content:collectFromPlatforms 등 — 연속발행에서 크롤링 시 필요
import { registerMiscHandlers } from './main/ipc/miscHandlers.js';
registerMiscHandlers();
// ✅ [v2.11.34] blob/migration/recovery IPC wiring — same dead-router pattern as
// the v2.10.203 SERP fix above: these were registered only inside
// registerAllHandlers(), which main.ts never calls. With blob IPC dead
// ("No handler registered for 'blob:hasMany'") images fall back to base64 in
// localStorage → quota blowup → post-list save failures.
import { registerBlobHandlers } from './main/ipc/blobHandlers.js';
registerBlobHandlers();
import { registerMigrationHandlers } from './main/ipc/migrationHandlers.js';
registerMigrationHandlers();
import { registerRecoveryHandlers } from './main/ipc/recoveryHandlers.js';
registerRecoveryHandlers();
import { registerFlowMarathonHandlers } from './main/ipc/flowMarathonHandlers.js';
registerFlowMarathonHandlers();
import { registerTitleQualityHandlers } from './main/ipc/titleQualityHandlers.js';
registerTitleQualityHandlers();
// [v2.10.242] file:* 8개 IPC 핸들러 — main.ts에서 main/ipc/fileHandlers.ts 로 분리
import { registerFileHandlers } from './main/ipc/fileHandlers.js';
registerFileHandlers();
// [v2.10.243] image:optimizeSearchQuery / extractCoreSubject / batchOptimizeSearchQueries / crawlFromUrl 4개 분리
import { registerImageOptimizeHandlers } from './main/ipc/imageOptimizeHandlers.js';
registerImageOptimizeHandlers();
// [v2.10.244] trend:* 6개 IPC 핸들러 분리
import { registerTrendHandlers } from './main/ipc/trendHandlers.js';
registerTrendHandlers({
  trendMonitor,
  getMonitorTask: () => monitorTask,
  setMonitorTask: (task) => { monitorTask = task; },
  getTrendAlertEnabled: () => trendAlertEnabled,
  setTrendAlertEnabled: (enabled) => { trendAlertEnabled = enabled; },
  sendLog,
});
// [v2.10.245] analytics:* 8개 IPC 핸들러 분리
import { registerPostAnalyticsHandlers } from './main/ipc/postAnalyticsHandlers.js';
registerPostAnalyticsHandlers({
  postAnalytics,
  getAnalyticsTask: () => analyticsTask,
  setAnalyticsTask: (task) => { analyticsTask = task; },
  sendLog,
});
// [v2.10.246] aiAssistant:* 4개 IPC 핸들러 분리
import { registerAiAssistantHandlers } from './main/ipc/aiAssistantHandlers.js';
registerAiAssistantHandlers();
// ✅ [v2.10.281] paste:classify — 외부 LLM 결과 paste 시 Gemini Flash-Lite로 자동 분배
import { registerPasteClassifyHandlers } from './main/ipc/pasteClassifyHandlers.js';
registerPasteClassifyHandlers();
// [v2.10.248] gemini:test10x + gemini:generateVeoVideo 분리
import { registerGeminiHandlers } from './main/ipc/geminiHandlers.js';
registerGeminiHandlers({ sendLog });
// [v2.10.249] image:matchToHeadings 분리
import { registerImageMatchHandlers } from './main/ipc/imageMatchHandlers.js';
registerImageMatchHandlers();
// [v2.10.250] image:downloadAndSave 분리
import { registerImageDownloadHandlers } from './main/ipc/imageDownloadHandlers.js';
registerImageDownloadHandlers();
// [v2.10.253] image:collectFromShopping 분리
import { registerImageCollectShoppingHandlers } from './main/ipc/imageCollectShoppingHandlers.js';
registerImageCollectShoppingHandlers();
// [v2.10.255] image:collectFromUrl 분리
import { registerImageCollectUrlHandlers } from './main/ipc/imageCollectUrlHandlers.js';
registerImageCollectUrlHandlers();
// [v2.10.256] image:searchNaver 분리 (376줄 대형 IPC)
import { registerImageSearchNaverHandlers } from './main/ipc/imageSearchNaverHandlers.js';
registerImageSearchNaverHandlers();
// [v2.10.257] schedule:* 4개 분리
import { registerScheduleApiHandlers } from './main/ipc/scheduleApiHandlers.js';
registerScheduleApiHandlers({ sendLog });
// [v2.10.258] datalab:* 3개 분리
import { registerDatalabApiHandlers } from './main/ipc/datalabApiHandlers.js';
registerDatalabApiHandlers();
// [v2.10.259] backup:* 3개 분리 + performDataBackup export
import { registerBackupHandlers, performDataBackup } from './main/ipc/backupHandlers.js';
registerBackupHandlers({ debugLog });

// ✅ 네이버 블로그 카테고리 분석 (크롤링)
ipcMain.handle('blog:fetchCategories', async (_event, arg: string | { naverId?: string; blogId?: string }) => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] blog:fetchCategories - 설정 동기화 실패:', e);
  }

  try {
    const blogId = typeof arg === 'string' ? arg : (arg.naverId || arg.blogId || '');
    console.log('[Main] 블로그 카테고리 분석 시작:', blogId);

    if (!blogId || !blogId.trim()) {
      return { success: false, message: '블로그 ID가 필요합니다.' };
    }

    // ✅ 1단계: 딥 모바일 API 호출 (Axios 기반, 가장 강력하고 정확함)
    try {
      console.log('[Main] Stage 1: 딥 모바일 API 시도...', blogId);
      const apiUrl = `https://m.blog.naver.com/api/blogs/${blogId.trim()}/category-list`;
      const apiRes = await axios.get(apiUrl, {
        timeout: 7000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Referer': `https://m.blog.naver.com/${blogId.trim()}`,
          'Accept': 'application/json, text/plain, */*'
        }
      });

      if (apiRes.data && apiRes.data.isSuccess && apiRes.data.result) {
        const result = apiRes.data.result;
        const categories: Array<{ id: string; name: string; postCount?: number }> = [];

        // ✅ 디버깅: API 응답 구조 로깅
        console.log('[Main] API result 전체 키:', Object.keys(result));
        if (result.mylogCategoryList) {
          console.log('[Main] mylogCategoryList 첫 항목 구조:', JSON.stringify(result.mylogCategoryList[0], null, 2).substring(0, 500));
        }
        if (result.boardCategoryList) {
          console.log('[Main] boardCategoryList 첫 항목 구조:', JSON.stringify(result.boardCategoryList[0], null, 2).substring(0, 500));
        }

        // ✅ 재귀적 카테고리 추출 함수 (게시판형 하위 카테고리 지원)
        const extractCategories = (list: any[], depth: number = 0) => {
          if (!Array.isArray(list)) return;
          list.forEach((c: any) => {
            // 구분선(divisionLine) 제외, 전체보기(0) 제외
            if (c.divisionLine || c.categoryNo === '0' || c.categoryNo === 0) return;

            let cleanName = String(c.categoryName || '').trim();
            if (!cleanName) return;

            // 하위 카테고리인 경우 시각적 계층 표현 추가
            if (depth > 0) {
              cleanName = ` └ ${cleanName}`;
            }

            categories.push({
              id: String(c.categoryNo),
              name: cleanName,
              postCount: c.postCnt ?? c.postCount
            });

            // ✅ 하위 카테고리가 있으면 재귀 탐색 (게시판형 블로그 지원)
            if (c.childCategoryList && Array.isArray(c.childCategoryList) && c.childCategoryList.length > 0) {
              extractCategories(c.childCategoryList, depth + 1);
            }
          });
        };

        // ✅ 1차: mylogCategoryList (일반 카테고리형)
        if (result.mylogCategoryList) {
          console.log('[Main] mylogCategoryList 발견, 항목 수:', result.mylogCategoryList.length);
          extractCategories(result.mylogCategoryList);
        }

        // ✅ 2차: boardCategoryList (게시판형) — mylogCategoryList에서 못 찾은 경우
        if (categories.length === 0 && result.boardCategoryList) {
          console.log('[Main] boardCategoryList 발견, 항목 수:', result.boardCategoryList.length);
          extractCategories(result.boardCategoryList);
        }

        // ✅ 3차: API 응답의 다른 가능한 카테고리 필드도 확인
        if (categories.length === 0) {
          // API 응답 전체 키를 로깅하여 디버깅 지원
          console.log('[Main] API result 키 목록:', Object.keys(result));
          // categoryCategoryList, categoryList 등 다른 가능한 키 시도
          for (const key of Object.keys(result)) {
            if (key.toLowerCase().includes('category') && Array.isArray(result[key]) && result[key].length > 0) {
              console.log(`[Main] 대체 카테고리 필드 발견: ${key}, 항목 수: ${result[key].length}`);
              extractCategories(result[key]);
              if (categories.length > 0) break;
            }
          }
        }

        if (categories.length > 0) {
          // ✅ "게시판" 외에 다른 카테고리가 있으면 "게시판" 제거
          const nonBoardCategories = categories.filter(c => c.name !== '게시판');
          const finalCategories = nonBoardCategories.length > 0 ? nonBoardCategories : categories;
          console.log('[Main] Stage 1 성공:', finalCategories.length, '개 추출 완료');
          return { success: true, categories: finalCategories };
        } else {
          console.log('[Main] Stage 1: API 응답은 성공했으나 카테고리 0개 → Stage 2로 전환');
        }
      }
    } catch (e) {
      console.warn('[Main] Stage 1 실패 (API 차단 또는 비공개), Stage 2로 전환:', (e as Error).message);
    }

    // ✅ 2단계: 모바일 페이지 분석 (Puppeteer 기반, 최후의 보루)
    const puppeteer = await import('puppeteer-extra');
    const StealthPlugin = await import('puppeteer-extra-plugin-stealth');
    const puppeteerWithStealth = puppeteer.default as any;
    puppeteerWithStealth.use((StealthPlugin as any).default());

    const browser = await puppeteerWithStealth.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 375, height: 812, isMobile: true });
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');

      // 리소스 원천 차단으로 속도 극대화
      await page.setRequestInterception(true);
      page.on('request', (req: any) => {
        if (['image', 'font', 'media', 'stylesheet'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      console.log('[Main] Stage 2: 모바일 페이지 분석 중...');
      const mobileUrl = `https://m.blog.naver.com/PostList.naver?blogId=${blogId.trim()}`;

      try {
        await page.goto(mobileUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        // React hydration 및 동적 리스트 렌더링 대기
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        console.warn('[Main] 페이지 로딩 타임아웃, 현재 DOM에서 추출 시도');
      }

      let categories = await page.evaluate(() => {
        const results: Array<{ id: string; name: string; postCount?: number }> = [];
        // 모든 링크 중 categoryNo를 포함하는 항목 스캔 (범용적 대응)
        const links = Array.from(document.querySelectorAll('a[href*="categoryNo="]'));

        links.forEach(link => {
          const href = (link as HTMLAnchorElement).href || '';
          const text = (link.textContent || '').trim();
          const match = href.match(/categoryNo=(\d+)/);

          if (match && text && match[1] !== '0' && text !== '전체보기' && text.length < 100) {
            const id = match[1];
            if (!results.some(r => r.id === id)) {
              // 게시글 수 추출 (괄호 안의 숫자)
              const countMatch = text.match(/\((\d+)\)/);
              const cleanName = text.replace(/\(\d+\)/, '').trim();

              if (cleanName) {
                results.push({
                  id,
                  name: cleanName,
                  postCount: countMatch ? parseInt(countMatch[1], 10) : undefined
                });
              }
            }
          }
        });
        return results;
      });

      // ✅ "게시판" 외에 다른 카테고리가 있으면 "게시판" 제거 (모바일)
      if (categories.length > 0) {
        const nonBoard = categories.filter((c: any) => c.name !== '게시판');
        categories = nonBoard.length > 0 ? nonBoard : categories;
      }

      // ✅ 2-2: 모바일에서 못 찾으면 PC 블로그 페이지에서 카테고리 사이드바 크롤링
      if (categories.length === 0) {
        console.log('[Main] Stage 2-2: PC 블로그 페이지 분석 시도...');
        try {
          // PC용 User Agent로 변경
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          await page.setViewport({ width: 1280, height: 900, isMobile: false });

          const pcUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId.trim()}&categoryNo=0&from=postList`;
          await page.goto(pcUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await new Promise(resolve => setTimeout(resolve, 3000));

          // PC 블로그 사이드바에서 카테고리 추출
          categories = await page.evaluate(() => {
            const results: Array<{ id: string; name: string; postCount?: number }> = [];

            // ✅ PC 블로그의 카테고리 위젯 내부 링크 검색
            const allLinks = Array.from(document.querySelectorAll('a'));

            allLinks.forEach(link => {
              const href = link.href || link.getAttribute('href') || '';
              const text = (link.textContent || '').trim();

              // categoryNo 패턴 매칭 (PC 버전)
              const catMatch = href.match(/categoryNo=(\d+)/);
              if (catMatch && text && catMatch[1] !== '0') {
                const id = catMatch[1];
                // 중복, 전체보기, 너무 긴 이름, "게시판" 제외
                if (!results.some(r => r.id === id) && text !== '전체보기' && text.length < 100) {
                  const countMatch = text.match(/\((\d+)\)/);
                  const cleanName = text.replace(/\(\d+\)/, '').trim();
                  if (cleanName) {
                    results.push({
                      id,
                      name: cleanName,
                      postCount: countMatch ? parseInt(countMatch[1], 10) : undefined
                    });
                  }
                }
              }
            });
            return results;
          });

          // ✅ "게시판" 외에 다른 카테고리가 있으면 "게시판" 제거 (PC)
          if (categories.length > 0) {
            const nonBoard = categories.filter((c: any) => c.name !== '게시판');
            categories = nonBoard.length > 0 ? nonBoard : categories;
            console.log('[Main] Stage 2-2 PC 성공:', categories.length, '개 추출 완료');
          }
        } catch (e) {
          console.warn('[Main] Stage 2-2 PC 실패:', (e as Error).message);
        }
      }

      await browser.close().catch(() => undefined);

      if (categories.length > 0) {
        console.log('[Main] Stage 2 성공:', categories.length, '개 추출 완료');
        return { success: true, categories };
      }

      return {
        success: true,
        categories: [{ id: '0', name: '전체 (기본)' }],
        message: '카테고리를 분석하지 못해 기본 목록을 제공합니다.'
      };

    } catch (error) {
      await browser.close().catch(() => undefined);
      throw error;
    }

  } catch (error) {
    console.error('[Main] 블로그 카테고리 분석 오류:', error);
    return { success: false, message: `카테고리 분석 실패: ${(error as Error).message}` };
  }
});

// ✅ 다중계정 동시발행 (병렬 처리)

//  다중계정 동시발행 (executePostCycle 기반)
ipcMain.handle('multiAccount:publish', async (_event, accountIds: string[], options: any) => {
  // ============================================
  //  [리팩토링] executePostCycle 기반 다중계정 발행
  // 기존 350줄  50줄 루프 위임
  // ============================================

  console.log('[Main] multiAccount:publish  executePostCycle 루프 위임');

  // [2026-06-23] 발행용 브라우저 보장 (automation:run과 동일) — Chrome 없는 PC는 최초 1회 자동 다운로드.
  try {
    const { ensureChromiumAvailable } = await import('./browserInstaller.js');
    await ensureChromiumAvailable((_pct, message) => sendLog(`🌐 ${message}`));
  } catch (browserErr: any) {
    const msg = `발행용 브라우저 준비 실패: ${browserErr?.message || browserErr}. 인터넷 연결을 확인한 뒤 다시 시도해주세요.`;
    console.error(`[Main] ${msg}`);
    sendLog(`❌ ${msg}`);
    return { success: false, message: msg };
  }

  //  설정 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] multiAccount:publish - 설정 동기화 실패:', e);
  }

  //  라이선스 체크
  if (!(await ensureLicenseValid())) {
    return { success: false, message: '라이선스 인증이 필요합니다.' };
  }

  //  무료 티어 quota 체크
  const publishAmount = Array.isArray(accountIds) ? accountIds.length : 0;
  const publishCheck = await enforceFreeTier('publish', publishAmount);
  if (!publishCheck.allowed) {
    return publishCheck.response;
  }

  const multiAccountLease = await acquireDirectAutomationLease(
    `multi-account:${Date.now()}`,
  );
  if (!multiAccountLease) {
    return {
      success: false,
      message: '다른 발행 작업이 실행 중입니다. 완료 후 다중계정 발행을 다시 시작해주세요.',
    };
  }

  try {
    // ✅ [2026-05-25 FIX] Stale cancelRequested 자동 리셋 (v2.6.4 HOTFIX 동일 패턴, multiAccount:publish 누락분)
    //   원인: 이전 발행 중지 → AutomationService.cancelRequested = true 잔류
    //         multiAccount:publish 시작 시 setMultiAccountAbort(false)만 리셋, cancelRequested는 안 건드림
    //         → 2번째 계정의 BlogExecutor.executePostCycle 진입 즉시 isCancelRequested() true → {success:false, cancelled:true} 반환
    //         → renderer for-loop이 "8계정 중 1계정만 발행" 현상으로 인지
    //   5팀 병렬 심층 분석(2026-05-25) Team 2(main IPC) High 가설 직접 fix
    if (AutomationService.isCancelRequested() && !AutomationService.isRunning()) {
      console.log('[Main] 🔄 stale cancelRequested 감지 (multiAccount:publish) → 자동 리셋');
      AutomationService.resetCancelFlag();
    }
    //  중지 플래그 초기화
    AutomationService.setMultiAccountAbort(false);
    // ✅ [2026-03-11] 즉시 취소용 AbortController 생성
    const abortController = AutomationService.createAbortController();

    sendLog(`🚀 다중계정 동시발행 시작: ${accountIds.length}개 계정`);

    const results: Array<{ accountId: string; success: boolean; message?: string; url?: string; failureCode?: string }> = [];

    // ✅ [2026-01-20] 순차 예약 시간 계산을 위한 기준값
    let baseScheduleDate = options?.scheduleDate;
    let baseScheduleTime = options?.scheduleTime;
    const scheduleIntervalMinutes = options?.scheduleInterval || 30;  // ✅ [2026-04-01 BUG-8 FIX] 기본 30분 (기존 360분=6시간은 날짜 밀림 유발)
    const useRandomOffset = options?.scheduleRandomOffset !== false;  // ✅ 기본값: 랜덤 편차 사용 (false면 정확한 간격)

    // ✅ [2026-03-11 FIX] renderer가 scheduleDate를 combined 형식으로 보낼 때 자동 분리
    // renderer는 "YYYY-MM-DDTHH:mm" 또는 "YYYY-MM-DD HH:mm" 형식으로 보냄 (scheduleTime 별도 전송 안함)
    // 이를 자동 감지하여 날짜/시간으로 분리 → isScheduleMode가 정상 작동하도록 보장
    if (baseScheduleDate && !baseScheduleTime) {
      const normalized = baseScheduleDate.replace('T', ' ');
      const parts = normalized.split(' ');
      if (parts.length === 2 && /^\d{2}:\d{2}$/.test(parts[1])) {
        baseScheduleDate = parts[0]; // YYYY-MM-DD
        baseScheduleTime = parts[1]; // HH:mm
        console.log(`[Main] 📅 scheduleDate combined 형식 자동 분리: ${baseScheduleDate} + ${baseScheduleTime}`);
      }
    }

    // ✅ [2026-02-20 FIX] publishMode가 'schedule'인데 날짜/시간이 없으면 자동 생성 (1시간 후 시작, 10분 단위 반올림)
    if (options?.publishMode === 'schedule' && (!baseScheduleDate || !baseScheduleTime)) {
      const autoStart = new Date(Date.now() + 60 * 60 * 1000); // 1시간 후
      const autoMinutes = Math.ceil(autoStart.getMinutes() / 10) * 10;
      autoStart.setMinutes(autoMinutes, 0, 0);
      if (autoMinutes >= 60) {
        autoStart.setMinutes(0);
        autoStart.setHours(autoStart.getHours() + 1);
      }
      const ay = autoStart.getFullYear();
      const am = String(autoStart.getMonth() + 1).padStart(2, '0');
      const ad = String(autoStart.getDate()).padStart(2, '0');
      const ah = String(autoStart.getHours()).padStart(2, '0');
      const ami = String(autoStart.getMinutes()).padStart(2, '0');
      baseScheduleDate = `${ay}-${am}-${ad}`;
      baseScheduleTime = `${ah}:${ami}`;
      sendLog(`📅 예약 날짜/시간 자동 생성: ${baseScheduleDate} ${baseScheduleTime} (1시간 후 시작)`);
    }

    const isScheduleMode = options?.publishMode === 'schedule' && baseScheduleDate && baseScheduleTime;
    console.log(`[🔍 DIAG-3 Main수신] publishMode=${options?.publishMode}, baseScheduleDate=${baseScheduleDate}, baseScheduleTime=${baseScheduleTime}, isScheduleMode=${isScheduleMode}`);

    if (isScheduleMode) {
      const randomInfo = useRandomOffset ? '+ ±10분 랜덤 편차' : '(정확한 간격)';
      sendLog(`📅 순차 예약 모드: 기준 ${baseScheduleDate} ${baseScheduleTime}, 간격 ${scheduleIntervalMinutes}분 ${randomInfo}`);
    }

    //  순차 발행 (각 계정에 대해 executePostCycle 호출)
    const limitedAccountIds = accountIds.slice(0, 100);  // 최대 100개 제한 (대행사/마케팅 회사 대응)

    // ✅ [v2.10.301] 모든 계정 backoff 사전 검사 — 전부 차단 상태면 조기 종료
    //   10팀 검증 발견: 전계정 backoff 시 끝까지 루프 돌고 결과만 실패로 집계되는 비효율 차단.
    const _backedOffAccounts = limitedAccountIds.filter(id => isAccountBackedOff(id));
    if (_backedOffAccounts.length === limitedAccountIds.length && limitedAccountIds.length > 0) {
      const earliestExpiry = limitedAccountIds
        .map(id => getBotBackoff(id))
        .filter((rec): rec is NonNullable<typeof rec> => rec !== null)
        .sort((a, b) => a.expiresAt - b.expiresAt)[0];
      const waitHours = earliestExpiry ? Math.ceil((earliestExpiry.expiresAt - Date.now()) / 3_600_000) : 12;
      sendLog(`⛔ 전체 ${limitedAccountIds.length}개 계정 모두 봇감지 backoff 상태 — 최단 ${waitHours}시간 후 자동 해제. 다중 발행 조기 종료.`);
      for (const id of limitedAccountIds) {
        const rec = getBotBackoff(id);
        results.push({ accountId: id, success: false, message: `봇감지 backoff (${rec?.reason}) — ${waitHours}시간 후 재시도` });
      }
      return { success: false, results, message: `전계정 backoff 상태 — ${waitHours}시간 후 재시도` } as any;
    }

    for (let i = 0; i < limitedAccountIds.length; i++) {
      const accountId = limitedAccountIds[i];
      // 중지 체크
      if (AutomationService.isMultiAccountAborted()) {
        results.push({ accountId, success: false, message: '사용자에 의해 중지됨' });
        continue;
      }

      // ✅ [v2.10.301] 봇감지 backoff 사전 체크 — 브라우저 launch 전에 skip
      //   10팀 검증 발견: 기존 흐름은 브라우저 launch 후 naverBlogAutomation 내부에서 throw로 차단 →
      //   launch 오버헤드 낭비 + 사용자가 "왜 자꾸 실패하지?" 혼동. 사전 체크로 즉시 skip + 명확한 사유 보고.
      const backoffRec = getBotBackoff(accountId);
      if (backoffRec) {
        const waitHours = Math.ceil((backoffRec.expiresAt - Date.now()) / 3_600_000);
        sendLog(`⏸️ 계정 봇감지 backoff 중 (${backoffRec.reason}) — ${waitHours}시간 후 자동 해제. 건너뜀.`);
        results.push({
          accountId,
          success: false,
          message: `봇감지 backoff (${backoffRec.reason}) — ${waitHours}시간 후 재시도`,
        });
        continue;
      }

      const account = blogAccountManager.getAccount(accountId);
      if (!account) {
        results.push({ accountId, success: false, message: '계정을 찾을 수 없습니다.' });
        continue;
      }

      const credentials = blogAccountManager.getAccountCredentials(accountId);
      if (!credentials) {
        results.push({ accountId, success: false, message: '로그인 정보가 없습니다.' });
        continue;
      }

      try {
        sendLog(`👤 [${account.name}] 발행 시작...`);

        const publicationAvailability = evaluatePublicationAvailability({
          state: await new PublicationStateStore(app.getPath('userData')).load(),
          accountId,
          now: new Date(),
          config: await loadContentPolicy(),
          env: process.env,
        });
        if (!publicationAvailability.allowed) {
          const reason = publicationAvailability.reasons.join(', ');
          sendLog(`⛔ [${account.name}] 콘텐츠·이미지 생성 전 발행 정책 차단: ${reason}`);
          results.push({ accountId, success: false, message: `CONTENT_POLICY_BLOCKED:${reason}` });
          continue;
        }

        //  콘텐츠 소스 가져오기
        const contentSource = blogAccountManager.getNextContentSource(accountId);

        // ✅ [2026-01-19 BUG FIX] 콘텐츠 생성 로직 추가 (이전: 폴백 값 "제목 테스트" 사용 버그)
        let structuredContent: any = null;
        let title = options?.title || undefined;
        let content = options?.content || undefined;
        let generatedImages = options?.generatedImages || options?.images || [];
        console.log(`[다중계정] 📌 options.title: "${(title || '').substring(0, 40)}"`);

        // ✅ [2026-01-19 BUG FIX v2] preGeneratedContent도 확인 (renderer에서 이 이름으로 전달함)
        const preGenerated = options?.preGeneratedContent || options?.structuredContent;
        let resolvedContentPolicyContext = options?.contentPolicyContext
          || preGenerated?.contentPolicyContext
          || preGenerated?.structuredContent?.contentPolicyContext;
        const normalizePublishHashtags = (...sources: any[]): string[] => {
          const seen = new Set<string>();
          const tags: string[] = [];
          const visit = (value: any) => {
            if (Array.isArray(value)) {
              value.forEach(visit);
              return;
            }
            String(value ?? '')
              .split(/[,\s#]+/)
              .map((tag) => tag.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_-]/gu, ''))
              .filter(Boolean)
              .forEach((tag) => {
                const key = tag.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                tags.push(tag);
              });
          };
          sources.forEach(visit);
          return tags;
        };

        // options에 이미 콘텐츠가 있으면 그대로 사용 (renderer에서 미리 생성된 경우)
        if (preGenerated) {
          const rawStructuredContent = preGenerated.structuredContent || preGenerated;
          structuredContent = rawStructuredContent && typeof rawStructuredContent === 'object'
            ? sanitizeContentFakeSourcesCopy(rawStructuredContent)
            : rawStructuredContent;
          resolvedContentPolicyContext = resolvedContentPolicyContext
            || structuredContent?.contentPolicyContext;
          // ✅ [2026-02-21 FIX] options.title이 명시적으로 있으면 최우선 사용 (preGenerated.title보다 우선)
          // preGenerated.title이 stale(이전 발행) 상태일 수 있기 때문에, options.title이 있으면 그것을 신뢰
          const preGenTitle = preGenerated.title || structuredContent?.selectedTitle;
          const resolvedTitle = options?.title || preGenTitle || title;
          const resolvedBody = preGenerated.content || structuredContent?.bodyPlain || structuredContent?.content || content;
          title = resolvedTitle ? sanitizePublishableSourceText(String(resolvedTitle)) : resolvedTitle;
          content = resolvedBody ? sanitizePublishableSourceText(String(resolvedBody)) : resolvedBody;
          generatedImages = preGenerated.generatedImages || generatedImages;
          const mergedHashtags = normalizePublishHashtags(options?.hashtags, preGenerated.hashtags, structuredContent?.hashtags);
          if (structuredContent && mergedHashtags.length > 0) {
            structuredContent = { ...structuredContent, hashtags: mergedHashtags };
          }
          // ✅ [2026-03-10 FIX] title이 URL 패턴이면 selectedTitle로 대체 (쇼핑커넥트 URL 혼입 방지)
          if (title && /^https?:\/\//i.test(title.trim())) {
            const safeFallback = structuredContent?.selectedTitle || '';
            if (safeFallback && !/^https?:\/\//i.test(safeFallback.trim())) {
              console.warn(`[다중계정] ⚠️ title이 URL임 → selectedTitle로 교체: "${safeFallback.substring(0, 40)}"`);
              title = safeFallback;
            }
          }
          console.log(`[다중계정] 📌 preGenerated.title: "${(preGenTitle || '').substring(0, 40)}", final title: "${(title || '').substring(0, 40)}"`);
          sendLog(`   📄 기존 콘텐츠 사용: "${(title || '').substring(0, 30)}..."`);
        }
        // contentSource가 있고 콘텐츠가 없으면 새로 생성
        else if (contentSource && (!title || !content)) {
          sendLog(`   🔄 콘텐츠 생성 중... (소스: ${contentSource.type === 'keyword' ? '키워드' : 'URL'})`);
          try {
            const sourceValue = contentSource.value || contentSource;
            const accountSettings = account.settings as any;
            // ✅ [2026-02-22 FIX] generator를 options → config → 기본값 순서로 결정
            // 기존: provider: 'gemini' 하드코딩으로 perplexity 무시됨
            const currentConfig = await loadConfig();
            const multiAccountProvider = options?.generator || currentConfig?.defaultAiProvider || 'gemini';
            console.log(`[다중계정] 🔄 AI Provider: ${multiAccountProvider} (options.generator: ${options?.generator}, config.defaultAiProvider: ${currentConfig?.defaultAiProvider})`);
            const source: any = {
              type: contentSource.type === 'keyword' ? 'keyword' : 'url',
              value: String(sourceValue),
              targetAge: accountSettings?.targetAge || 'all',
              toneStyle: accountSettings?.toneStyle || 'friendly',
              contentMode: options?.contentMode || accountSettings?.contentMode || 'seo',  // ✅ [2026-02-16 FIX] renderer 전달값 우선
              // 쇼핑커넥트 모드 설정
              affiliateUrl: options?.affiliateLink || accountSettings?.affiliateLink,  // ✅ [2026-02-16 FIX] renderer 전달값 우선
            };

            const { loadContentPolicy: loadMultiPolicy } = await import('./contentPolicy/policyLoader.js');
            const { prepareGenerationPolicyContext: prepareMultiPolicy } = await import('./contentPolicy/generationContext.js');
            const optionFacts = Object.entries(options?.businessInfo || {})
              .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value) && String(value).trim())
              .map(([key, value]) => `${key}: ${String(value).trim()}`);
            const sourceText = String(sourceValue || '').trim();
            const multiPolicy = await prepareMultiPolicy({
              userDataPath: app.getPath('userData'),
              config: await loadMultiPolicy(),
              context: options?.contentPolicyContext,
              fallbackInput: {
                input_origin: 'generated',
                business_facts_applicable: source.contentMode === 'business' || source.contentMode === 'affiliate',
                primary_keyword: contentSource.type === 'keyword' ? sourceText : String(options?.title || '').trim(),
                target_reader: accountSettings?.targetAge === 'all'
                  ? 'Naver blog readers'
                  : `${accountSettings?.targetAge || 'all'} readers`,
                business_facts: optionFacts.length > 0
                  ? optionFacts
                  : (!/^https?:\/\//i.test(sourceText) && sourceText.length >= 20 ? [sourceText] : []),
                source_materials: !/^https?:\/\//i.test(sourceText) && sourceText.length >= 20
                  ? [{ type: 'user_provided', title: 'multi-account-source', content: sourceText }]
                  : [],
                account_id: accountId,
                blog_id: account.naverId,
              },
            });
            if (!multiPolicy.allowed) {
              throw new Error(`[CONTENT_POLICY_BLOCKED] Generation stopped: ${multiPolicy.reasons.join(', ')}`);
            }
            if (multiPolicy.manualReviewRequired) {
              sendLog('   🛡️ 최근 글 비교는 발행 직전 사용자 검수로 확인합니다.');
            }
            source.contentPolicyPrompt = multiPolicy.prompt;

            const generated = await withAbortCheck(
              generateStructuredContent(source as any, {
                provider: multiAccountProvider,
                minChars: accountSettings?.minCharCount || 4000,
              }),
              abortController.signal
            );

            resolvedContentPolicyContext = {
              input: {
                ...multiPolicy.input,
                recent_posts: undefined,
              },
              recentPostsSnapshot: multiPolicy.input.recent_posts,
            };
            structuredContent = {
              ...generated,
              contentPolicyContext: resolvedContentPolicyContext,
            };
            title = (generated as any).selectedTitle || `${sourceValue} 관련 글`;
            content = (generated as any).bodyPlain || (generated as any).body || '';
            sendLog(`   ✅ 콘텐츠 생성 완료: "${(title || '').substring(0, 30)}..." (${(content || '').length}자)`);
          } catch (genError) {
            // ✅ [2026-03-11] AbortError는 중지 요청으로 처리
            if ((genError as Error).name === 'AbortError' || (genError as Error).message === 'PUBLISH_CANCELLED') {
              sendLog(`   ⏹️ [${account.name}] 콘텐츠 생성 중 즉시 중지됨`);
              results.push({ accountId, success: false, message: '사용자에 의해 즉시 중지됨' });
              break; // for 루프 탈출
            }
            sendLog(`   ⚠️ 콘텐츠 생성 실패: ${(genError as Error).message}`);
            results.push({ accountId, success: false, message: `콘텐츠 생성 실패: ${(genError as Error).message}` });
            continue;
          }
        }

        // ✅ [2026-03-11 FIX] 콘텐츠 생성 후 중지 체크 (abort 체크포인트 #2)
        if (AutomationService.isMultiAccountAborted()) {
          sendLog(`   ⏹️ [${account.name}] 콘텐츠 생성 후 중지됨`);
          results.push({ accountId, success: false, message: '사용자에 의해 중지됨' });
          continue;
        }

        // ✅ [2026-03-18 FIX] 다중계정 발행: 전용 썸네일 + 소제목 이미지 생성 (fullAutoFlow.ts L600-703 패턴 이식)
        // 기존 문제: headings 없으면 이미지 전체 스킵, 전용 썸네일 미생성, AI 프롬프트 추론 없음
        // ✅ [v1.4.63] skipImages 체크 추가 — "이미지 없이 글만 발행" 선택 시 ImageFX 창 뜨는 버그 수정
        let generatedThumbnailPath: string | undefined;
        if (!options?.skipImages && options?.useAiImage !== false && generatedImages.length === 0) {
          try {
            const imageProvider = options?.imageSource || 'nano-banana-pro';
            const headingImageMode = options?.headingImageMode || 'all';
            const isThumbnailOnly = options?.thumbnailOnly === true;
            const normalizedImageProvider = String(imageProvider || '').trim();
            const isUiAutomationImageProvider = ['dropshot', 'flow', 'imagefx'].includes(normalizedImageProvider);
            const isSlowImageProvider = ['nano-banana-pro', 'nano-banana-2', 'openai-image', 'leonardoai'].includes(normalizedImageProvider);
            const imageEngineStabilizeDelayMs = isUiAutomationImageProvider ? 15_000 : isSlowImageProvider ? 8_000 : 3_000;
            const waitForImageEngineStabilization = async (phase: string) => {
              if (imageEngineStabilizeDelayMs <= 0) return;
              sendLog(`   ⏳ 이미지 엔진 안정화 대기 중... (${phase}, ${Math.ceil(imageEngineStabilizeDelayMs / 1000)}초)`);
              await withAbortCheck(
                new Promise<void>((resolve) => setTimeout(resolve, imageEngineStabilizeDelayMs)),
                abortController.signal
              );
            };

            // ✅ headingImageMode === 'none'이면 모든 이미지 생성 건너뛰기
            if (headingImageMode === 'none') {
              sendLog(`   🚫 이미지 없이 모드: 썸네일 포함 모든 이미지 생성 건너뛰기`);
            } else {
              const imgConfig = await loadConfig();
              const imgApiKeys = {
                geminiApiKey: imgConfig.geminiApiKey,
                deepinfraApiKey: (imgConfig as any).deepinfraApiKey,
                openaiApiKey: (imgConfig as any).openaiApiKey,
                openaiImageApiKey: (imgConfig as any).openaiImageApiKey,
                leonardoaiApiKey: (imgConfig as any).leonardoaiApiKey,
                prodiaApiKey: (imgConfig as any).prodiaApiKey || (imgConfig as any).prodiaToken,
              };

              // ═══ Phase 1: 전용 썸네일 별도 생성 (headings 유무 무관) ═══
              let dedicatedThumbnail: any = null;
              try {
                // ✅ AI 추론 프롬프트: 블로그 제목 기반 영어 프롬프트 생성
                let thumbnailPrompt: string;
                try {
                  thumbnailPrompt = await generateEnglishPromptMain(
                    title || '블로그 썸네일',
                    options?.imageStyle
                  );
                  sendLog(`   🎨 AI 썸네일 프롬프트: "${thumbnailPrompt.substring(0, 60)}..."`);
                } catch {
                  thumbnailPrompt = `eye-catching blog thumbnail, visual metaphor for: ${title}, cinematic lighting, compelling composition, hero image style, NO TEXT NO WRITING`;
                  sendLog(`   ⚠️ AI 썸네일 프롬프트 생성 실패 → 기본 프롬프트 사용`);
                }

                sendLog(`   🖼️ 전용 썸네일 별도 생성 중... (엔진: ${imageProvider})`);

                await waitForImageEngineStabilization('thumbnail');
                const thumbResult = await withAbortCheck(
                  generateImages({
                    provider: imageProvider,
                    items: [{
                      heading: title || '🖼️ 썸네일',
                      prompt: thumbnailPrompt,
                      englishPrompt: thumbnailPrompt,
                      isThumbnail: true,
                      imageStyle: options?.imageStyle,
                      imageRatio: options?.thumbnailImageRatio || '1:1',
                    }],
                    postTitle: title,
                    isFullAuto: true,
                    isShoppingConnect: options?.contentMode === 'affiliate',
                    imageStyle: options?.imageStyle,
                    imageRatio: options?.thumbnailImageRatio || '1:1',
                    collectedImages: options?.collectedImages || structuredContent?.collectedImages || [],
                    imageFallbackPolicy: options?.imageFallbackPolicy || 'engine-only',
                  } as any, imgApiKeys),
                  abortController.signal
                );

                if (thumbResult && thumbResult.length > 0) {
                  dedicatedThumbnail = {
                    ...thumbResult[0],
                    heading: title || '🖼️ 썸네일',
                    isThumbnail: true,
                  };
                  generatedThumbnailPath = dedicatedThumbnail.filePath || dedicatedThumbnail.url;
                  sendLog(`   ✅ 전용 썸네일 생성 완료!`);
                } else {
                  sendLog(`   ⚠️ 전용 썸네일 생성 실패 → 썸네일 없이 진행`);
                }
              } catch (thumbErr) {
                if ((thumbErr as Error).name === 'AbortError' || (thumbErr as Error).message === 'PUBLISH_CANCELLED') {
                  throw thumbErr; // abort는 상위로 전파
                }
                sendLog(`   ⚠️ 전용 썸네일 생성 오류: ${(thumbErr as Error).message}`);
              }

              // ═══ Phase 2: 소제목 이미지 생성 (thumbnailOnly면 건너뛰기) ═══
              let subheadingImages: any[] = [];
              const headings = structuredContent?.headings || [];

              if (isThumbnailOnly) {
                sendLog(`   📷 썸네일만 생성 모드: 소제목 이미지 없이 전용 썸네일만 사용`);
              } else if (headings.length > 0) {
                try {
                  sendLog(`   🎨 소제목 이미지 생성 시작... (엔진: ${imageProvider}, ${headings.length}개 소제목)`);

                  // ✅ 각 소제목에 AI 프롬프트 추론 적용
                  const imageItems = [];
                  for (const h of headings) {
                    const headingTitle = h.title || h;
                    let englishPrompt: string;
                    try {
                      englishPrompt = await generateEnglishPromptMain(
                        String(headingTitle),
                        options?.imageStyle
                      );
                    } catch {
                      englishPrompt = h.imagePrompt || String(headingTitle);
                    }
                    imageItems.push({
                      heading: headingTitle,
                      prompt: englishPrompt,
                      englishPrompt: englishPrompt,
                      isThumbnail: false,
                      imageStyle: options?.imageStyle,
                      imageRatio: options?.subheadingImageRatio || options?.imageRatio || '1:1', // ✅ [2026-03-23 FIX] 소제목 비율 폴백: thumbnailImageRatio → imageRatio (기존 thumbnailImageRatio 폴백은 잘못됨)
                    });
                  }

                  await waitForImageEngineStabilization('body-images');
                  const imgResult = await withAbortCheck(
                    generateImages({
                      provider: imageProvider,
                      items: imageItems,
                      postTitle: title,
                      isFullAuto: true,
                      isShoppingConnect: options?.contentMode === 'affiliate',
                      imageStyle: options?.imageStyle,
                      imageRatio: options?.subheadingImageRatio || options?.thumbnailImageRatio || '1:1',
                      collectedImages: options?.collectedImages || structuredContent?.collectedImages || [],
                      imageFallbackPolicy: options?.imageFallbackPolicy || 'engine-only',
                    } as any, imgApiKeys),
                    abortController.signal
                  );

                  if (imgResult && imgResult.length > 0) {
                    subheadingImages = imgResult.map((img: any) => ({ ...img, isThumbnail: false }));
                    sendLog(`   ✅ 소제목 이미지 ${subheadingImages.length}개 생성 완료!`);
                  } else {
                    sendLog(`   ⚠️ 소제목 이미지 생성 결과 없음`);
                    throw new Error('소제목 이미지 생성 결과가 비어있습니다.');
                  }
                } catch (subErr) {
                  if ((subErr as Error).name === 'AbortError' || (subErr as Error).message === 'PUBLISH_CANCELLED') {
                    throw subErr; // abort는 상위로 전파
                  }
                  sendLog(`   ⚠️ 소제목 이미지 생성 실패: ${(subErr as Error).message}`);
                  throw subErr;
                }
              }

              // ═══ Phase 3: 최종 이미지 배열 조립 (전용 썸네일을 맨 앞에) ═══
              generatedImages = [
                ...(dedicatedThumbnail ? [dedicatedThumbnail] : []),
                ...subheadingImages,
              ];

              if (generatedImages.length > 0) {
                sendLog(`   ✅ AI 이미지 총 ${generatedImages.length}개 준비 완료! (썸네일 ${dedicatedThumbnail ? '포함' : '미포함'})`);
              } else {
                sendLog(`   ⚠️ AI 이미지 생성 결과 없음 (발행 중단)`);
                throw new Error('AI 이미지 생성 결과가 비어있습니다.');
              }
            }
          } catch (imgError) {
            // ✅ [2026-03-11] AbortError는 중지 요청으로 처리
            if ((imgError as Error).name === 'AbortError' || (imgError as Error).message === 'PUBLISH_CANCELLED') {
              sendLog(`   ⏹️ [${account.name}] 이미지 생성 중 즉시 중지됨`);
              results.push({ accountId, success: false, message: '사용자에 의해 즉시 중지됨' });
              break; // for 루프 탈출
            }
            sendLog(`   ⚠️ AI 이미지 생성 실패 (발행 중단): ${(imgError as Error).message}`);
            console.error(`[다중계정] 이미지 생성 오류:`, imgError);
            results.push({ accountId, success: false, message: `이미지 생성 실패: ${(imgError as Error).message}` });
            continue;
          }
        }

        // ✅ [2026-03-11 FIX] 이미지 생성 후 중지 체크 (abort 체크포인트 #3)
        if (AutomationService.isMultiAccountAborted()) {
          sendLog(`   ⏹️ [${account.name}] 이미지 생성 후 중지됨`);
          results.push({ accountId, success: false, message: '사용자에 의해 중지됨' });
          continue;
        }

        // 여전히 콘텐츠가 없으면 건너뛰기
        if (!title || !content) {
          sendLog(`   ⚠️ 콘텐츠가 없습니다. 발행 건너뜀.`);
          results.push({ accountId, success: false, message: '콘텐츠가 없습니다.' });
          continue;
        }

        // ✅ [2026-01-20] 순차 예약 시간 계산 (각 계정마다 간격 증가 + 랜덤 편차)
        // ✅ [2026-03-11 FIX] 초기값을 분리된 baseScheduleDate/Time 사용 (combined 형식 잔존 방지)
        let accountScheduleDate = baseScheduleDate;
        let accountScheduleTime = baseScheduleTime;

        if (isScheduleMode) {
          // ✅ [2026-03-15 FIX] renderer가 이미 분산 계산된 시간을 보낸 경우 (계정 1개씩 IPC 호출 시)
          // limitedAccountIds.length === 1이면 renderer에서 미리 계산된 시간이 scheduleDate/Time에 들어있으므로
          // main.ts에서 순차 계산(i * interval)을 하면 안 됨 (항상 i=0이라 분산 안 됨)
          if (limitedAccountIds.length === 1) {
            // renderer에서 이미 계산된 시간을 그대로 사용
            sendLog(`   📅 [${account.name}] 예약 시간: ${accountScheduleDate} ${accountScheduleTime} (사전 계산됨)`);
          } else {
            // 다수 계정 일괄 전송 시 (기존 로직 유지)
            const baseTime = new Date(`${baseScheduleDate}T${baseScheduleTime}`);
            const offsetMinutes = i * scheduleIntervalMinutes;
            // ✅ [2026-03-15 FIX] 랜덤 편차 범위 확대: ±20분(10분 단위) — 기존 ±10분(3값)에서 5값으로 확대
            const randomOffsetMinutes = useRandomOffset ? (Math.floor(Math.random() * 5) - 2) * 10 : 0;  // -20, -10, 0, +10, +20분
            const newTime = new Date(baseTime.getTime() + (offsetMinutes + randomOffsetMinutes) * 60000);

            // ✅ [2026-02-08 FIX] 최종 시간도 10분 단위로 반올림
            const rawMinutes = newTime.getMinutes();
            const roundedMinutes = Math.round(rawMinutes / 10) * 10;
            newTime.setMinutes(roundedMinutes, 0, 0);
            if (roundedMinutes >= 60) {
              newTime.setMinutes(0);
              newTime.setHours(newTime.getHours() + 1);
            }

            const yyyy = newTime.getFullYear();
            const mm = String(newTime.getMonth() + 1).padStart(2, '0');
            const dd = String(newTime.getDate()).padStart(2, '0');
            const hh = String(newTime.getHours()).padStart(2, '0');
            const mi = String(newTime.getMinutes()).padStart(2, '0');

            accountScheduleDate = `${yyyy}-${mm}-${dd}`;
            accountScheduleTime = `${hh}:${mi}`;

            sendLog(`   📅 [${account.name}] 예약 시간: ${accountScheduleDate} ${accountScheduleTime} (${i + 1}/${limitedAccountIds.length})`);
          }

          // ✅ [2026-04-01 PIPELINE-GUARD] 날짜 밀림 이상 감지 (main.ts 레벨)
          if (accountScheduleDate) {
            const scheduledDay = new Date(`${accountScheduleDate}T00:00:00`);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((scheduledDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 7) {
              sendLog(`⚠️ [PIPELINE-GUARD] [${account.name}] 예약 날짜가 ${diffDays}일 후입니다! (${accountScheduleDate} ${accountScheduleTime}) — 날짜 밀림 의심`);
            }
          }
        }

        //  executePostCycle 호출을 위한 payload 구성
        // ✅ [2026-01-24 FIX] options를 먼저 스프레드하여 명시적 값으로 덮어쓰기 가능
        const payload = {
          ...options,  // ✅ 먼저 스프레드 (나중에 명시적 값으로 덮어씀)
          naverId: credentials.naverId,
          naverPassword: credentials.naverPassword,
          publishMode: isScheduleMode ? 'schedule' : (options?.publishMode || account.settings?.publishMode || 'publish'),  // ✅ [2026-02-20 FIX] 사용자 선택 우선
          // ✅ [2026-03-11 FIX] isScheduleMode=false일 때 명시적 undefined (스프레드된 잔존값 제거)
          scheduleDate: isScheduleMode ? accountScheduleDate : undefined,
          scheduleTime: isScheduleMode ? accountScheduleTime : undefined,
          toneStyle: account.settings?.toneStyle || 'friendly',
          categoryName: options?.categoryName || account.settings?.category, // ✅ [2026-02-09 FIX] renderer 전달값 우선 (실제 블로그 폴더명), 없으면 계정 설정 fallback
          isFullAuto: true,
          title,        // ✅ 생성된 제목
          content,      // ✅ 생성된 콘텐츠
          // ✅ [2026-02-21 FIX] structuredContent.selectedTitle도 최종 제목으로 동기화
          structuredContent: structuredContent ? { ...structuredContent, selectedTitle: title } : undefined,
          contentPolicyContext: resolvedContentPolicyContext || structuredContent?.contentPolicyContext,
          _publishFlow: 'multi_account',
          hashtags: normalizePublishHashtags(options?.hashtags, structuredContent?.hashtags, preGenerated?.hashtags),
          generatedImages: generatedImages.length > 0 ? generatedImages : undefined, // ✅ 이미지
          // ✅ [2026-01-24 FIX] CTA 관련 설정 명시적 전달
          skipCta: options?.skipCta === true ? true : false,  // 명시적으로 true일 때만 CTA 건너뛰기
          contentMode: options?.contentMode || (account.settings as any)?.contentMode || 'homefeed',  // ✅ contentMode 전달
          affiliateLink: options?.affiliateLink || (account.settings as any)?.affiliateLink,  // ✅ 제휴링크 전달
          // ✅ [2026-01-28] 이미지 설정 전역 적용 (renderer에서 전달받은 설정)
          scSubImageSource: options?.scSubImageSource || 'collected',  // 수집 이미지 직접 사용 여부
          collectedImages: options?.collectedImages || structuredContent?.collectedImages || [],  // 수집 이미지
          thumbnailImageRatio: options?.thumbnailImageRatio || '1:1',  // 썸네일 비율
          subheadingImageRatio: options?.subheadingImageRatio || '1:1',  // 소제목 비율
          scAutoThumbnailSetting: options?.scAutoThumbnailSetting || false,  // 자동 썸네일
          // ✅ [2026-03-18 FIX] 전용 썸네일 생성 경로 → thumbnailPath 자동 매핑
          thumbnailPath: options?.thumbnailPath || options?.presetThumbnailPath || generatedThumbnailPath || undefined,
          previousPostTitle: options?.previousPostTitle || (options?.ctaType === 'previous-post' && options?.ctaText ? String(options.ctaText).replace(/^[\s📖👉:\-]+/, '').trim() : undefined),
          previousPostUrl: options?.previousPostUrl || (options?.ctaType === 'previous-post' ? (options?.ctaUrl || options?.ctaLink) : undefined),
          // ✅ [v2.10.301] 다중계정 봇감지 회피 — 첫 계정은 즉시(0ms), 2~N 계정은 3~10분 시차 누적
          //   10팀 검증 발견: computeLoginStaggerDelayMs가 botBackoff.ts에 정의됐는데 dead code였음.
          //   여러 계정이 같은 PC에서 같은 시각에 연속 로그인 시 네이버가 "자동화 의심"으로 추가 인증 요구.
          loginStaggerMs: computeLoginStaggerDelayMs(i),
        };

        // ✅ [2026-03-01 FIX] 선차감 패턴: 계정별 발행 전 쿼터 차감
        let accountPreConsumed = false;
        const isFreeUser = await isFreeTierUser();
        if (isFreeUser) {
          try {
            await consumeQuota('publish', 1);
            accountPreConsumed = true;
            console.log(`[다중계정] 무료 사용자: publish 쿼터 선차감 (${account.name})`);
          } catch (qe) {
            console.error(`[다중계정] 쿼터 선차감 오류 (${account.name}):`, qe);
          }
        }

        // ✅ [2026-03-11 FIX] 발행 직전 중지 체크 (abort 체크포인트 #4)
        if (AutomationService.isMultiAccountAborted()) {
          sendLog(`   ⏹️ [${account.name}] 발행 직전 중지됨`);
          results.push({ accountId, success: false, message: '사용자에 의해 중지됨' });
          continue;
        }

        //  새 엔진 호출
        let result = await executeWithContentPolicyManualReview(payload as any, {
          execute: (approvedPayload) => AutomationService.executePostCycle(approvedPayload as any),
          confirm: confirmContentPolicyManualReview,
        });
        try {
          assertImmediatePublishResultUrl(result, payload);
        } catch (guardError) {
          const guardMessage = (guardError as Error).message || '발행 결과 URL 검증에 실패했습니다.';
          result = {
            ...result,
            success: false,
            message: guardMessage,
            failureCode: classifyPublishFailure(guardError).code,
          };
        }

        const failureCode = result.success ? undefined : ((result as any).failureCode || classifyPublishFailure(result.message).code);
        results.push({
          accountId,
          success: result.success,
          message: result.message,
          url: result.url,
          failureCode,
        });

        if (result.success) {
          // ✅ 선차감 유지 (환불 없음)
          sendLog(`✅ [${account.name}] 발행 성공: ${result.url || '완료'}`);
        } else {
          // ✅ 발행 실패 → 선차감 환불
          if (accountPreConsumed) {
            try {
              await refundQuota('publish', 1);
              console.log(`[다중계정] 발행 실패: 쿼터 환불 (${account.name})`);
            } catch (re) { console.error(`[다중계정] 쿼터 환불 오류:`, re); }
          }
          sendLog(`❌ [${account.name}] 발행 실패: ${result.message}`);
        }

      } catch (error) {
        const errorMsg = (error as Error).message;
        results.push({ accountId, success: false, message: errorMsg, failureCode: classifyPublishFailure(error).code });
        sendLog(`❌ [${account.name}] 발행 오류: ${errorMsg}`);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    // ✅ [2026-03-01] 선차감 패턴으로 변경 → 후차감 제거
    // (각 계정별로 이미 선차감/환불 처리됨)


    sendLog(`📊 다중계정 발행 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

    return { success: true, results, summary: { total: results.length, success: successCount, fail: failCount } };

  } catch (error) {
    const errorMsg = (error as Error).message;
    sendLog(`❌ 다중계정 발행 오류: ${errorMsg}`);
    return { success: false, message: `다중계정 발행 실패: ${errorMsg}` };
  } finally {
    multiAccountLease.release();
  }
});


// ✅ 다중계정 발행 즉시 중지 핸들러
ipcMain.handle('multiAccount:cancel', async () => {
  sendLog('🛑 다중계정 발행 즉시 중지 요청');

  // ✅ [2026-03-11 FIX] 모든 취소 플래그를 동시에 설정하여 즉시 중지
  multiAccountAbortFlag = true;
  AutomationService.setMultiAccountAbort(true);
  AutomationService.requestCancel(); // BlogExecutor의 isCancelRequested() 체크도 트리거
  await abortImageGeneration().catch(() => undefined);
  AutomationService.abortCurrentOperation(); // ✅ 진행 중인 API 호출 즉시 abort!

  // ✅ 현재 실행 중인 자동화 인스턴스의 브라우저도 닫기
  const currentInstance = AutomationService.getCurrentInstance();
  if (currentInstance) {
    try {
      await currentInstance.closeBrowser();
    } catch (e) {
      // 이미 닫힌 브라우저일 수 있음 - 무시
    }
  }

  // 활성화된 모든 자동화 인스턴스의 브라우저 강제 종료
  const closePromises = activeMultiAccountAutomations.map(async (automation) => {
    try {
      await automation.closeBrowser();
    } catch (e) {
      // 이미 닫힌 브라우저일 수 있음 - 무시
    }
  });

  await Promise.allSettled(closePromises);
  activeMultiAccountAutomations.length = 0;

  sendLog('✅ 다중계정 발행이 완전히 중지되었습니다.');
  return { success: true, message: '다중계정 발행이 중지되었습니다.' };
});

// ✅ [Phase 5A.2] title:* 핸들러 → contentHandlers.ts로 이관 완료

// ✅ [Phase 5A.2] comment:* + competitor:* 핸들러 → engagementHandlers.ts로 이관 완료

// [v2.10.258] datalab:getRelatedKeywords → main/ipc/datalabApiHandlers.ts

// Gemini/OpenAI/Claude 호출부가 자체 재시도와 타임아웃을 갖고 있으므로
// IPC 레벨에서 전체 글생성 파이프라인을 다시 돌리지 않는다.
const GENERATE_STRUCTURED_CONTENT_RETRIES = 0;
const contentGenerationAbortRegistry = new ScopedAbortRegistry('content-generation');

ipcMain.handle(
  'automation:cancelContentGeneration',
  async (_event, request: unknown): Promise<{ success: boolean; aborted: boolean; requestId?: string }> => {
    const value = request && typeof request === 'object' ? request as Record<string, unknown> : {};
    const requestId = typeof value.requestId === 'string' ? value.requestId.trim() : '';
    const reason = typeof value.reason === 'string' ? value.reason.trim().slice(0, 300) : 'renderer request';
    if (!requestId) {
      console.warn(`[CancelTrace] scope=content-generation rejected=no-request-id reason=${reason}`);
      return { success: false, aborted: false };
    }
    const aborted = contentGenerationAbortRegistry.abort(requestId, reason);
    console.warn(`[CancelTrace] scope=content-generation requestId=${requestId} aborted=${aborted} reason=${reason}`);
    return { success: true, aborted, requestId };
  },
);

ipcMain.handle(
  'automation:generateStructuredContent',
  async (
    _event,
    payload: { assembly: SourceAssemblyInput; requestId?: string },
  ): Promise<{ success: boolean; content?: StructuredContent; message?: string; imageCount?: number }> => {
    if (!payload || typeof payload !== 'object' || !payload.assembly || typeof payload.assembly !== 'object') {
      console.warn('[Generation] 잘못된 IPC 입력 거부: assembly가 없습니다.');
      return { success: false, message: '글 생성 입력값이 올바르지 않습니다.' };
    }
    const activeGenerationIds = contentGenerationAbortRegistry.activeIds();
    if (activeGenerationIds.length > 0) {
      console.warn(`[Generation] 동시 실행 거부: active=${activeGenerationIds.join(',')}`);
      return { success: false, message: '다른 글 생성이 이미 진행 중입니다. 완료 또는 취소 후 다시 시도해주세요.' };
    }
    // ✅ 실행 직전 최신 설정 강제 동기화 (API 키 정합성 보장)
    const generationOperation = contentGenerationAbortRegistry.begin(payload.requestId);
    const generationRequestId = generationOperation.id;
    console.log(`[Generation:${generationRequestId}] 시작`);

    try {
      const currentConfig = await loadConfig();
      applyConfigToEnv(currentConfig);
      console.log('[Main] automation:generateStructuredContent - 최신 설정 동기화 완료');
    } catch (e) {
      console.error('[Main] automation:generateStructuredContent - 설정 로드 실패:', e);
    }

    // 라이선스 체크
    if (!(await ensureLicenseValid())) {
      console.error('[Main] generateStructuredContent: 라이선스 체크 실패 — ensureLicenseValid() returned false');
      return { success: false, message: '라이선스 인증이 필요합니다.', licenseError: true } as any;
    }

    // ✅ 페이월 상태 체크 (소진되면 글생성도 막음 - 쿼터 소비는 발행 시에만)
    const isFreeUser = await isFreeTierUser();
    if (isFreeUser) {
      const limits = await getFreeQuotaLimits();
      const status = await getQuotaStatus(limits);
      if (status.isPaywalled) {
        return {
          success: false,
          code: 'PAYWALL',
          message: '오늘 무료 사용량을 모두 쓰셨습니다.',
          quota: status,
        } as any;
      }
    }


    try {
      // 연령대별 최소 글자수 기본값 계산 (assembleContentSource 호출 전에 targetAge 확인)
      const getMinCharsForAge = (targetAge?: '20s' | '30s' | '40s' | '50s' | 'all'): number => {
        switch (targetAge) {
          case '20s':
            return 2500; // 2,500~3,500자
          case '30s':
            return 3000; // 3,000~4,000자
          case '40s':
          case '50s':
            return 3500; // 3,500~4,500자 (현실적으로 조정)
          case 'all':
          default:
            return 2000; // 기본 2,000자
        }
      };

      // targetAge는 payload.assembly에서 먼저 확인 (assembleContentSource 호출 전)
      const targetAge = (payload.assembly.targetAge as '20s' | '30s' | '40s' | '50s' | 'all' | undefined) ?? 'all';

      // ✅ [2026-04-08] 디버그 로그: assembly 입력 확인 (키워드 누락 추적)
      const _asm = payload.assembly as any;
      console.log(`[Main] assembly 입력: keywords=${JSON.stringify(payload.assembly.keywords)}, draftText=${(payload.assembly.draftText || '').substring(0, 50)}, title=${(_asm.title || '').substring(0, 30)}, rssUrl=${payload.assembly.rssUrl || '없음'}`);

      const { source, warnings } = await assembleContentSource(payload.assembly);
      const provider = payload.assembly.generator ?? source.generator ?? 'gemini';

      // ✅ [v2.10.73~74] 네이버 검색 API 기반 fact-check RAG — LLM 환각 강제 차단
      //   v2.10.74 Phase 1: 자료 부족 / 키워드 무관 시 발행 거부 (사용자에게 alert)
      //   조건: useNaverFactCheck !== false (기본 ON) + rawText 짧음 + 키워드 있음 + 네이버 API 키 있음
      try {
        const _config = await loadConfig();
        const factCheckEnabled = (_config as any).useNaverFactCheck !== false; // 기본 ON
        const hasNaverKeys = !!((_config as any).naverClientId && (_config as any).naverClientSecret);
        const hasKeywords = Array.isArray(payload.assembly.keywords) && payload.assembly.keywords.length > 0;
        const rawTextShort = !source.rawText || source.rawText.trim().length < 200; // 200자 이하면 자료 부족

        if (factCheckEnabled && hasNaverKeys && hasKeywords && rawTextShort) {
          const keywordQuery = payload.assembly.keywords!.join(' ').trim();
          console.log(`[Main] 🔍 네이버 fact-check RAG 발동: keyword="${keywordQuery}", 기존 rawText=${source.rawText?.length || 0}자`);
          const { validateFactCheckSource } = await import('./naverFactCheckRAG.js');
          const validation = await validateFactCheckSource(keywordQuery);

          if (!validation.passed) {
            // ✅ [v2.10.74 Phase 1] 자료 부족 / 키워드 무관 → 발행 거부
            // throw하면 IPC 응답으로 에러 전달 → renderer에서 alert 표시
            const errMsg = `[FACT_CHECK_BLOCKED] ${validation.reason}\n\n수집한 자료: ${validation.totalChars}자, 키워드 매칭률 ${Math.round(validation.keywordCoverage * 100)}%\n\n해결 방법:\n1. 더 구체적이고 명확한 키워드 사용 (5~10자 권장)\n2. 또는 URL을 직접 입력해서 발행\n3. 또는 환경설정에서 '네이버 fact-check RAG' 토글 OFF (환각 위험 ↑)`;
            console.error(`[Main] ⛔ ${errMsg}`);
            throw new Error(errMsg);
          }

          // 자료 검증 통과 → rawText 보강
          // [SPEC-PROMPT-2026-REFRESH Phase 1b / v2.10.234] RAG 자료를 XML wrap
          //   배경: Anthropic Cite-then-write 패턴 — 자료를 <source id="N">...</source> 로 wrap 시
          //         LLM이 attention을 source token에 묶어두고 인용 토큰 [자료N] 출력 확률 ↑.
          //   효과: RAGAS 데이터 기준 faithfulness ~+25%, confabulation 10% → 0% (Anthropic Citations API).
          const wrappedRagSource = `<source id="naver-rag">\n${validation.rawText}\n</source>`;
          source.rawText = source.rawText && source.rawText.trim().length >= 50
            ? `${source.rawText}\n\n=== 네이버 검색 자료 (출처 인용 토큰 [자료] 권장) ===\n${wrappedRagSource}`
            : wrappedRagSource;
          // ✅ [v2.10.74] hasFactCheckSource 플래그를 source에 표시 — Phase 2 (LLM 충실도 강제 prompt) 활성화 조건
          (source as any).hasFactCheckSource = true;
          (source as any).factCheckRawSource = validation.rawText; // Phase 3 검증용
          console.log(`[Main] ✅ 네이버 fact-check RAG 주입 + 검증 통과: 최종 rawText=${source.rawText.length}자, 매칭률=${Math.round(validation.keywordCoverage * 100)}%`);
        } else if (!factCheckEnabled) {
          console.log(`[Main] 네이버 fact-check RAG 비활성 (사용자 OFF)`);
        } else if (!hasNaverKeys) {
          console.log(`[Main] 네이버 fact-check RAG 미작동: API 키 없음`);
        }
      } catch (ragErr: any) {
        // FACT_CHECK_BLOCKED 에러는 그대로 propagate (사용자에게 alert)
        if (ragErr?.message?.includes('[FACT_CHECK_BLOCKED]')) {
          throw ragErr;
        }
        console.warn(`[Main] ⚠️ 네이버 fact-check RAG 실패 (LLM 자체 지식 fallback):`, ragErr?.message || ragErr);
      }

      // ✅ contentMode 전달 (SEO / 홈판 모드)
      const contentMode = (payload.assembly as any).contentMode as 'seo' | 'homefeed' | 'affiliate' | 'custom' | 'business' | 'mate' | undefined;
      if (contentMode) {
        source.contentMode = contentMode;
      }

      // ✅ isFullAuto 전달 (완전자동 발행 모드)
      const isFullAuto = (payload.assembly as any).isFullAuto as boolean | undefined;
      if (isFullAuto) {
        source.isFullAuto = isFullAuto;
      }

      // ✅ categoryHint 전달 (2축 분리 프롬프트)
      const categoryHint = (payload.assembly as any).categoryHint as string | undefined;
      if (categoryHint) {
        source.categoryHint = categoryHint;
      }

      // ✅ isReviewType 전달 (리뷰형 글 - 구매전환 유도)
      const isReviewType = (payload.assembly as any).isReviewType as boolean | undefined;
      if (isReviewType) {
        source.isReviewType = isReviewType;
      }

      const personalExperience = String((payload.assembly as any).personalExperience || '').trim().slice(0, 4000);
      if (personalExperience) {
        source.personalExperience = personalExperience;
        source.rawText = `${source.rawText}\n\n=== 작성자 직접 사용 메모 ===\n${personalExperience}`.trim();
        console.log(`[Main] 쇼핑 실사용 메모 전달: ${personalExperience.length}자`);
      }

      // ✅ 사용자 정의 프롬프트 전달
      const customPrompt = (payload.assembly as any).customPrompt as string | undefined;
      if (customPrompt) {
        source.customPrompt = customPrompt;
      }

      // ✅ [v1.4.20] 업체 정보 전달 (business 모드 — 가짜 번호 생성 방지)
      const businessInfo = (payload.assembly as any).businessInfo;
      if (businessInfo && typeof businessInfo === 'object') {
        source.businessInfo = businessInfo;
        console.log(`[Main] 🏢 업체 정보 전달: ${businessInfo.name || '(미입력)'} / ${businessInfo.phone || '(전화 미입력)'}`);
      }

      // ✅ toneStyle 전달 (글톤/말투 스타일 - 매우 중요!)
      const toneStyle = (payload.assembly as any).toneStyle as string | undefined;
      if (toneStyle) {
        source.toneStyle = toneStyle as any;
        console.log(`[Main] ✅ 글톤 스타일 적용: ${toneStyle}`);
      } else {
        console.log(`[Main] ⚠️ 글톤 스타일 미지정 → 카테고리 기반 자동 매칭`);
      }

      // ✅ [2026-04-20 SPEC-HOMEFEED-100 W2] 사용자 후킹 1문장 전달 (선택)
      const hookHint = (payload.assembly as any).hookHint as string | undefined;
      if (hookHint && hookHint.trim()) {
        (source as any).hookHint = hookHint.trim();
        console.log(`[Main] ✨ 후킹 1문장 전달: "${hookHint.trim().substring(0, 40)}"`);
      }

      const manualTitleOverride = String((payload.assembly as any).manualTitleOverride || '').trim();
      if (manualTitleOverride) {
        source.manualTitleOverride = manualTitleOverride.slice(0, 120);
        console.log(`[Main] 📌 사용자 지정 제목 고정: "${source.manualTitleOverride.substring(0, 40)}"`);
      }

      // ✅ [2026-02-24] 키워드를 제목으로 그대로 사용 옵션 전달
      const useKeywordAsTitle = (payload.assembly as any).useKeywordAsTitle as boolean | undefined;
      const keywordForTitle = (payload.assembly as any).keywordForTitle as string | undefined;
      if (useKeywordAsTitle) {
        source.useKeywordAsTitle = true;
        source.keywordForTitle = String(
          keywordForTitle
          || (payload.assembly as any).title
          || ((payload.assembly as any).keywords || [])[0]
          || ''
        ).trim();
        console.log(`[Main] 📌 키워드를 제목으로 사용: "${source.keywordForTitle.substring(0, 30)}"`)
      }

      console.log('[Main] 구조화 콘텐츠 생성 시작');
      // Run the fail-closed policy preflight after source collection and before the model call.
      const { loadContentPolicy } = await import('./contentPolicy/policyLoader.js');
      const { prepareGenerationPolicyContext } = await import('./contentPolicy/generationContext.js');
      const generationPolicyConfig = await loadContentPolicy();
      const rawKeywordInput = (payload.assembly as any).keywords;
      const policyKeywords = Array.isArray(rawKeywordInput)
        ? rawKeywordInput.map((value: unknown) => String(value || '').trim()).filter(Boolean)
        : String(rawKeywordInput || '').split(/[,;\n]/).map((value) => value.trim()).filter(Boolean);
      const businessFacts = Object.entries(source.businessInfo || {})
        .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value) && String(value).trim())
        .map(([key, value]) => `${key}: ${String(value).trim()}`);
      const { extractPolicyFactLines, resolvePolicySourceMaterialType } = await import('./contentPolicy/sourceEvidence.js');
      const sourceFacts = Array.from(new Set([
        ...businessFacts,
        ...extractPolicyFactLines(String(source.rawText || ''), 50),
      ])).slice(0, 50);
      const sourceMaterials = source.rawText?.trim()
        ? [{
          type: resolvePolicySourceMaterialType({
            url: source.url,
            contentMode,
            articleType: source.articleType,
          }),
          title: source.title || policyKeywords[0] || 'generation-source',
          content: source.rawText,
          url: source.url,
          source_id: 'assembled-source',
        }]
        : [];
      const generationPolicy = await prepareGenerationPolicyContext({
        userDataPath: app.getPath('userData'),
        config: generationPolicyConfig,
        context: (payload.assembly as any).contentPolicyContext,
        fallbackInput: {
          input_origin: 'generated',
          business_facts_applicable: contentMode === 'business' || contentMode === 'affiliate',
          primary_keyword: policyKeywords[0] || source.title || '',
          secondary_keywords: policyKeywords.slice(1),
          target_reader: targetAge === 'all' ? 'Naver blog readers' : `${targetAge} readers`,
          business_facts: sourceFacts,
          source_materials: sourceMaterials,
          related_questions: policyKeywords.slice(0, 10),
          account_id: String((payload.assembly as any).accountId || '').trim() || undefined,
          blog_id: String((payload.assembly as any).blogId || '').trim() || undefined,
        },
      });
      if (!generationPolicy.allowed) {
        const reasonText = generationPolicy.reasons.join(', ');
        console.error(`[ContentPolicy] Generation blocked: ${reasonText}`);
        throw new Error(`[CONTENT_POLICY_BLOCKED] Generation stopped: ${reasonText}`);
      }
      source.contentPolicyPrompt = generationPolicy.prompt;
      if (generationPolicy.manualReviewRequired) {
        console.warn(`[ContentPolicy] Generation continues with ${generationPolicy.input.recent_posts?.length || 0} recent posts; publish review is pending.`);
      } else {
        console.log(`[ContentPolicy] Generation preflight passed with ${generationPolicy.input.recent_posts?.length || 0} recent posts.`);
      }

      console.log('[Main] Provider:', provider);
      console.log('[Main] TargetAge:', targetAge);
      console.log('[Main] ContentMode:', contentMode || 'seo (기본값)');
      console.log('[Main] CategoryHint:', categoryHint || 'general');
      console.log('[Main] IsFullAuto:', isFullAuto || false);
      console.log('[Main] IsReviewType:', isReviewType || false);
      console.log('[Main] API 키 확인:', {
        gemini: process.env.GEMINI_API_KEY ? `설정됨 (${process.env.GEMINI_API_KEY.length}자)` : '없음',
        openai: process.env.OPENAI_API_KEY ? `설정됨 (${process.env.OPENAI_API_KEY.length}자)` : '없음',
        claude: process.env.CLAUDE_API_KEY ? `설정됨 (${process.env.CLAUDE_API_KEY.length}자)` : '없음',
        perplexity: process.env.PERPLEXITY_API_KEY ? `설정됨 (${process.env.PERPLEXITY_API_KEY.length}자)` : '없음',
      });

      // RSS/URL에서 이미지 추출 여부 확인 (여러 URL 지원)
      // 이미지 수집 기능 제거됨 (DALL-E와 Pexels만 사용)
      // 네이버 블로그 크롤링, RSS 이미지 추출 등은 더 이상 사용하지 않음
      const imageCount = 0;

      // 사용자 지정(minChars) 우선, 없으면 연령대 기본값 사용
      const customMin = (payload.assembly as any).minChars as number | undefined;
      const baseMinChars = (typeof customMin === 'number' && !Number.isNaN(customMin) && customMin > 0)
        ? Math.floor(customMin)
        : getMinCharsForAge(targetAge);
      const minChars = baseMinChars;

      console.log('[Main] 최소 글자수 설정:', { customMin, targetAge, minChars });

      // ✅ [v2.6.4 HOTFIX] Stale cancelRequested 자동 리셋
      //   이미지 생성 IPC와 동일 — 새 발행 시작 시 이전 cancel 잔존 방지
      if (AutomationService.isCancelRequested() && !AutomationService.isRunning()) {
        console.log('[Main] 🔄 콘텐츠 생성 IPC: stale cancelRequested 감지 → 자동 리셋');
        AutomationService.resetCancelFlag();
        // 이전 abort된 controller 폐기 (다음 줄에서 새로 생성)
      }

      const genSignal = generationOperation.controller.signal;

      // ✅ [Phase 3B] 네트워크/타임아웃 에러 시 자동 재시도 (최대 2회, exponential backoff)
      let content = await withRetry(
        () => {
          // ✅ [2026-04-03] 매 시도마다 abort 체크
          if (genSignal.aborted) throw new Error('사용자가 작업을 취소했습니다.');
          return generateStructuredContent(source, { provider, minChars, signal: genSignal } as any);
        },
        {
          maxRetries: GENERATE_STRUCTURED_CONTENT_RETRIES,
          baseDelayMs: 3000,
          shouldRetry: (error) => {
            // ✅ [2026-04-03] abort 에러는 재시도하지 않음
            if (genSignal.aborted) return false;
            return isRetryableError(error);
          },
          onRetry: (error, attempt) => {
            console.log(`[Main] ⚠️ 콘텐츠 생성 재시도 (${attempt}/${GENERATE_STRUCTURED_CONTENT_RETRIES}): ${error.message}`);
          },
        }
      );

      (content as any).contentPolicyContext = {
        input: {
          ...generationPolicy.input,
          recent_posts: undefined,
        },
      };

      if (warnings.length) {
        content.quality.warnings = Array.from(new Set([...(content.quality.warnings ?? []), ...warnings]));
      }

      // ✅ [v2.10.74 Phase 3] 생성 후 fact 대조 검증 — 자료에 없는 숫자/날짜/금액이 본문에 들어갔는지 검사
      //   조건: source.factCheckRawSource가 있을 때만 (RAG 자료 + Phase 2 적용된 경우)
      //   매칭률 < 70% → content.quality.warnings에 경고 추가 + 사용자 알림
      try {
        const factCheckRawSource = (source as any).factCheckRawSource as string | undefined;
        if (factCheckRawSource && factCheckRawSource.length >= 200) {
          const { validateFactsAgainstSource } = await import('./naverFactCheckRAG.js');
          // 본문 전체 합치기 (도입부 + 헤딩 본문 + 결론)
          const fullText = [
            content.introduction || '',
            ...(content.headings || []).map((h: any) => h.content || ''),
            content.conclusion || '',
          ].join('\n');
          const validation = validateFactsAgainstSource(fullText, factCheckRawSource, 0.7);
          (content as any).factCheckReport = {
            matchRate: validation.matchRate,
            totalFacts: validation.totalFacts,
            unmatched: validation.unmatched,
            passed: validation.passed,
          };
          if (!validation.passed && validation.totalFacts > 0) {
            const reportMsg = `⚠️ 자료 대조 검증: ${validation.totalFacts}개 사실 중 ${validation.matched.length}개만 자료와 일치 (매칭률 ${Math.round(validation.matchRate * 100)}%). 미매칭 사실: ${validation.unmatched.slice(0, 5).join(', ')}${validation.unmatched.length > 5 ? ' ...' : ''}`;
            console.warn(`[Main] ${reportMsg}`);
            content.quality.warnings = Array.from(new Set([...(content.quality.warnings ?? []), reportMsg]));
          } else if (validation.totalFacts > 0) {
            console.log(`[Main] ✅ Phase 3 fact 검증 통과: ${validation.totalFacts}개 중 ${validation.matched.length}개 매칭 (${Math.round(validation.matchRate * 100)}%)`);
          }
        }
      } catch (validationErr: any) {
        console.warn('[Main] ⚠️ Phase 3 fact 검증 중 예외 — graceful skip:', validationErr?.message || validationErr);
      }

      // DraftGenerator 직후 정책 검증을 완료해야 이미지 생성 비용을 쓰기 전에
      // 근거 없는 가격·효과 문장을 재작성하거나 안전하게 차단할 수 있다.
      const { guardGeneratedContent } = await import('./contentPolicy/generatedContentGuard.js');
      const generatedContentGuard = await guardGeneratedContent({
        structuredContent: content as any,
        input: generationPolicy.input,
        config: generationPolicyConfig,
        recentPostsResult: generationPolicy.recentPostsResult,
        modelVersion: String(provider || 'generated-content-post-guard'),
      });
      content = generatedContentGuard.content as StructuredContent;
      if (!generatedContentGuard.allowed) {
        const unsupported = generatedContentGuard.policyResult.quality_report.unsupported_claims.slice(0, 3);
        const unsupportedText = unsupported.length > 0
          ? `\n문제 문장: ${unsupported.join(' | ')}`
          : '';
        const reasonText = generatedContentGuard.reasons.join(', ') || 'BLOCK_MANUAL_REVIEW_REQUIRED';
        console.error(`[ContentPolicy] Generated draft blocked before image generation: ${reasonText}`);
        throw new Error(`[CONTENT_POLICY_BLOCKED] ${reasonText}${unsupportedText}`);
      }
      if (generatedContentGuard.manualReviewRequired) {
        console.warn('[ContentPolicy] Draft quality passed; recent-post comparison requires publish-time review.');
      }
      if (generatedContentGuard.policyResult.rewrite_count > 0) {
        console.log(`[ContentPolicy] Generated draft repaired before image generation (${generatedContentGuard.policyResult.rewrite_count}회).`);
      }

      // ✅ [v2.10.228 → v2.10.229] 자동 관련글 링크 삽입 — 발행 직전 본문 끝에 관련글 추가 (체류시간 ↑)
      //   조건: autoInsertInternalLinks === true (기본 OFF, opt-in — 이전글 엮기와 중복 방지)
      //   동작: published-posts-links.json에 등록된 글 중 키워드 유사도 상위 3개를 conclusion에 plain-text 형식으로 추가
      //   Naver 에디터는 임의 HTML을 받지 않으므로 plain text + naked URL 형식 사용
      //   ⚠️ 관련글 매니저에 등록 글이 0개면 아무 동작 안 함 (silent skip)
      try {
        const _linkConfig = await loadConfig();
        // opt-in (default OFF): the previous-post link block already adds one
        // related-post link as a clean oglink card. Auto-related plain-text
        // links produced a SECOND link to the same/duplicate post ("추천글"과
        // "다음글" 같은 링크 — user report 2026-06-11). Users who explicitly
        // enabled the toggle keep it (=== true passes; undefined is now OFF).
        const autoInsertOn = (_linkConfig as any).autoInsertInternalLinks === true;
        if (autoInsertOn) {
          const linkTitle = String(content.selectedTitle || (content as any).title || '').trim();
          const linkBody = [content.introduction || '', ...(content.headings || []).map((h: any) => h.content || h.body || ''), content.conclusion || ''].join('\n');
          if (linkTitle && linkBody) {
            const related = internalLinkManager.findRelatedPosts(linkTitle, linkBody, 3);
            if (related && related.length > 0) {
              const linkLines = related.map((r: InternalLink) => `📖 ${r.title}\n   ${r.url}`).join('\n\n');
              const linkSection = `\n\n━━━━━━━━━━━━━━━━━━━━━━━\n📚 함께 보면 좋은 글\n━━━━━━━━━━━━━━━━━━━━━━━\n\n${linkLines}\n`;
              content.conclusion = (content.conclusion || '') + linkSection;
              console.log(`[Main] 🔗 자동 관련글 ${related.length}개 삽입: ${related.map((r: InternalLink) => r.title).join(', ')}`);
            } else {
              console.log(`[Main] 🔗 자동 관련글 토글 ON이지만 매니저에 등록된 관련 글이 없습니다 (skip)`);
            }
          }
        }
      } catch (linkErr: any) {
        console.warn('[Main] ⚠️ 자동 관련글 삽입 중 예외 — graceful skip:', linkErr?.message || linkErr);
      }

      // ✅ [2026-02-01 FIX] 크롤링 시 수집한 이미지를 content.collectedImages에 저장
      // 이렇게 하면 renderer에서 다시 크롤링하지 않고 바로 이미지를 사용할 수 있음
      if (source.images && source.images.length > 0) {
        (content as any).collectedImages = source.images.map((img: string, idx: number) => ({
          url: img,
          filePath: img,
          thumbnailUrl: img,
          heading: `소제목 ${idx + 1}`,
          headingIndex: idx,
          source: 'crawled'
        }));
        console.log(`[Main] ✅ 크롤링 이미지 ${source.images.length}개를 collectedImages에 저장`);
      }

      console.log('[Main] 구조화 콘텐츠 생성 완료');
      console.log(`[Generation:${generationRequestId}] 완료`);

      // ✅ 글생성은 쿼터 소비 안함 (발행 시에만 1세트로 카운트)
      return { success: true, content, imageCount };
    } catch (error) {
      const err = error as Error;
      const message = err.message ?? '구조화된 콘텐츠 생성 중 오류가 발생했습니다.';

      console.error('[Main] 구조화 콘텐츠 생성 실패');
      console.error('[Main] 오류 타입:', err.constructor.name);
      console.error('[Main] 오류 메시지:', message);
      console.error('[Main] 오류 스택:', err.stack);
      // ✅ [v1.4.33] 풀 직렬화 — debugLog로 %TEMP% 로그 파일에도 박힘
      try {
        const fullSerialized = JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2);
        console.error('[Main] 풀 에러 직렬화:', fullSerialized);
        debugLog(`[Main] 구조화 콘텐츠 생성 실패 풀 직렬화: ${fullSerialized}`);
      } catch { /* 직렬화 실패는 무시 */ }

      return { success: false, message };
    } finally {
      contentGenerationAbortRegistry.release(generationRequestId, generationOperation.controller);
      console.log(`[Generation:${generationRequestId}] 정리`);
    }
  },
);

// ✅ config:get / config:save / config:set → configHandlers.ts로 추출
registerConfigHandlers({
  getAppConfig: () => appConfig,
  setAppConfig: (config) => { appConfig = config; },
  sendLog,
});

// 이미지 라이브러리 카테고리 조회 IPC 핸들러
ipcMain.handle('library:getCategories', async (): Promise<string[]> => {
  try {
    if (!imageLibrary) {
      await initializeImageLibrary();
    }
    if (!imageLibrary) {
      return [];
    }
    return imageLibrary.getCategories();
  } catch (error) {
    console.error('[Main] 카테고리 조회 실패:', (error as Error).message);
    return [];
  }
});

// 이미지 라이브러리 이미지 삭제 IPC 핸들러
ipcMain.handle('library:deleteImage', async (_event, id: string): Promise<boolean> => {
  try {
    if (!imageLibrary) {
      await initializeImageLibrary();
    }
    if (!imageLibrary) {
      return false;
    }
    // TODO: ImageLibrary에 deleteImage 메서드 추가 필요
    return false;
  } catch (error) {
    console.error('[Main] 이미지 삭제 실패:', (error as Error).message);
    return false;
  }
});

// 이미지 라이브러리 인스턴스
let imageLibrary: ImageLibrary | null = null;
let extendedImageLibrary: ExtendedImageLibrary | null = null;

// 이미지 라이브러리 초기화
async function initializeImageLibrary(): Promise<void> {
  try {
    const os = await import('os');
    const storageDir = path.join(os.homedir(), '.naver-blog-automation', 'image-library');
    const config = await loadConfig();

    imageLibrary = new ImageLibrary({
      storageDir,
      autoDownload: true,
    }, (message) => {
      console.log(`[ImageLibrary] ${message}`);
    });

    await imageLibrary.initialize();
    console.log('[Main] 이미지 라이브러리 초기화 완료');

    // 확장 이미지 라이브러리 초기화
    extendedImageLibrary = new ExtendedImageLibrary({
      storageDir,
      unsplashApiKey: config.unsplashApiKey,
      pexelsApiKey: config.pexelsApiKey,
      pixabayApiKey: config.pixabayApiKey,
      autoDownload: true,
    });

    await extendedImageLibrary.initialize();
    console.log('[Main] 확장 이미지 라이브러리 초기화 완료');
  } catch (error) {
    console.error('[Main] 이미지 라이브러리 초기화 실패:', (error as Error).message);
  }
}

// 이미지 라이브러리 IPC 핸들러
ipcMain.handle('library:collectImages', async (_event, options: { query: string; sources: string[]; count: number }): Promise<{ success: boolean; count: number; message?: string }> => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] library:collectImages - 설정 동기화 실패:', e);
  }

  if (!(await ensureLicenseValid())) {
    return { success: false, count: 0, message: '라이선스 인증이 필요합니다.' };
  }

  const mediaCheck = await enforceFreeTier('media', 1);
  if (!mediaCheck.allowed) {
    return mediaCheck.response;
  }
  try {
    if (!imageLibrary) {
      await initializeImageLibrary();
    }
    if (!imageLibrary) {
      return { success: false, count: 0, message: '이미지 라이브러리 초기화 실패' };
    }

    const images = await imageLibrary.collectImages(options.query, {
      sources: options.sources as ImageSource[],
      count: options.count,
    });

    const result = { success: true, count: images.length };
    if (result.success && result.count > 0 && (await isFreeTierUser())) {
      await consumeQuota('media', 1);
    }
    return result;
  } catch (error) {
    return { success: false, count: 0, message: (error as Error).message };
  }
});

ipcMain.handle('library:batchCollect', async (_event, categories: string[]): Promise<{ success: boolean; message?: string }> => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] library:batchCollect - 설정 동기화 실패:', e);
  }

  if (!(await ensureLicenseValid())) {
    return { success: false, message: '라이선스 인증이 필요합니다.' };
  }

  const mediaCheck = await enforceFreeTier('media', 1);
  if (!mediaCheck.allowed) {
    return mediaCheck.response;
  }
  try {
    if (!imageLibrary) {
      await initializeImageLibrary();
    }
    if (!imageLibrary) {
      return { success: false, message: '이미지 라이브러리 초기화 실패' };
    }

    await imageLibrary.batchCollect(categories);
    const result = { success: true };
    if (await isFreeTierUser()) {
      await consumeQuota('media', 1);
    }
    return result;
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('library:getStats', async (): Promise<{ totalImages: number; categories: number; totalSize: string; sources: Record<string, number> }> => {
  try {
    if (!imageLibrary) {
      await initializeImageLibrary();
    }
    if (!imageLibrary) {
      return { totalImages: 0, categories: 0, totalSize: '0 KB', sources: {} };
    }

    return await imageLibrary.getStats();
  } catch (error) {
    console.error('[Main] 라이브러리 통계 조회 실패:', (error as Error).message);
    return { totalImages: 0, categories: 0, totalSize: '0 KB', sources: {} };
  }
});

ipcMain.handle('library:getImages', async (_event, category?: string, titleKeywords?: string[]): Promise<Array<{
  id: string;
  filePath: string;
  previewDataUrl: string;
  sourceTitle?: string;
}>> => {
  try {
    if (!imageLibrary) {
      await initializeImageLibrary();
    }
    if (!imageLibrary) {
      return [];
    }

    let images: any[] = [];

    // 키워드가 제공된 경우 키워드 기반 검색
    if (titleKeywords && titleKeywords.length > 0) {
      console.log('[Main] 키워드 기반 이미지 검색:', titleKeywords);
      images = await imageLibrary.getImages(titleKeywords, 100);
    }
    // 카테고리가 제공된 경우 카테고리 기반 검색
    else if (category && category.trim().length > 0) {
      console.log('[Main] 카테고리 기반 이미지 검색:', category);
      images = await imageLibrary.getImages(category, 100);
    }
    // 둘 다 없는 경우 전체 이미지 반환 (제한적으로)
    else {
      console.log('[Main] 전체 이미지 조회 (제한적)');
      images = await imageLibrary.getImages(undefined, 50); // 제한적으로 반환
    }

    return images.map(img => ({
      id: img.id,
      filePath: img.localPath || img.url,
      previewDataUrl: img.localPath ? `file:///${String(img.localPath).replace(/\\/g, '/').replace(/^\/+/, '')}` : img.url,
      sourceTitle: img.query,
    }));
  } catch (error) {
    console.error('[Main] 이미지 조회 실패:', (error as Error).message);
    return [];
  }
});

// ✅ 자동 이미지 수집 IPC 핸들러
ipcMain.handle('auto-collect-images', async (_event, data: {
  title: string;
  keywords: string[];
  category: string;
  imageMode: 'full-auto' | 'semi-auto' | 'manual' | 'skip';
  selectedImageSource?: 'nano-banana-pro' | 'library'; // 이미지 소스 선택
}): Promise<{
  success: boolean;
  images?: any[];
  totalCount?: number;
  headingCount?: number;
  error?: string;
}> => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] auto-collect-images - 설정 동기화 실패:', e);
  }

  if (!(await ensureLicenseValid())) {
    return { success: false, error: '라이선스 인증이 필요합니다.' };
  }

  try {
    if (!extendedImageLibrary) {
      await initializeImageLibrary();
    }
    if (!extendedImageLibrary) {
      return {
        success: false,
        error: '확장 이미지 라이브러리 초기화 실패',
      };
    }

    const { title, keywords, category, imageMode, selectedImageSource } = data;

    // AI 이미지 생성이 선택된 경우 이미지 수집을 건너뜁니다.
    if (selectedImageSource === 'nano-banana-pro') {
      console.log(`[Main] ${selectedImageSource} 선택됨. 이미지 라이브러리 수집을 건너뜁니다.`);
      return {
        success: true,
        images: [],
        totalCount: 0,
        headingCount: 0,
      };
    }

    const mediaCheck = await enforceFreeTier('media', 1);
    if (!mediaCheck.allowed) {
      return mediaCheck.response;
    }

    // 소제목 추출 (구조화 콘텐츠가 있으면 사용, 없으면 제목에서 추출)
    let headings: string[] = [];

    // TODO: 구조화 콘텐츠에서 소제목 가져오기 (현재는 제목을 키워드로 사용)
    if (keywords.length > 0) {
      headings = keywords.slice(0, 5); // 최대 5개 소제목
    } else {
      // 제목을 기반으로 간단한 소제목 생성
      headings = [title];
    }

    // 이미지 라이브러리 선택 시에만 공식 보도자료 수집
    if (extendedImageLibrary) {
      if (selectedImageSource === 'library') {
        // 공식 보도자료만 활성화 (API 키 불필요 - 크롤링 기반)
        extendedImageLibrary.setSourceEnabled('korea_gov', true);
        extendedImageLibrary.setSourceEnabled('news_agency', true);
        console.log('[이미지 수집] 공식 보도자료 활성화 (korea_gov, news_agency)');
        console.log('[이미지 수집] API 키 불필요 - 크롤링 기반 수집');
      } else {
        console.log(`[이미지 수집] ${selectedImageSource} 선택됨. 이미지 라이브러리 소스 필터링을 건너뜁니다.`);
      }
    } else {
      console.log('[이미지 수집] 이미지 라이브러리가 초기화되지 않았습니다.');
    }

    // 이미지 수집 (라이브러리 소스만 사용)
    const imageMap = await collectImagesOnAutomationStart(
      extendedImageLibrary,
      title,
      keywords,
      category,
      headings,
      imageMode
    );

    // 선택된 이미지 라이브러리 카테고리가 있으면 해당 카테고리의 이미지만 필터링
    // (이미 collectImagesOnAutomationStart에서 처리되지만, 추가 필터링이 필요할 수 있음)

    // Map을 배열로 변환
    const allImages: any[] = [];
    imageMap.forEach((images, heading) => {
      images.forEach(img => {
        allImages.push({
          ...img,
          heading, // 어떤 소제목용인지 표시
          // filePath가 없으면 url 사용
          filePath: img.filePath || img.url,
        });
      });
    });

    const response = {
      success: true,
      images: allImages,
      totalCount: allImages.length,
      headingCount: imageMap.size,
    };
    if ((response.images?.length ?? 0) > 0 && (await isFreeTierUser())) {
      await consumeQuota('media', 1);
    }
    return response;
  } catch (error) {
    console.error('[Main] 자동 이미지 수집 오류:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
});

// ✅ 반자동: 사용자 선택 이미지 배치 적용 IPC 핸들러
ipcMain.handle('apply-image-placements', async (_event, data: {
  selections: Array<{ imageId: string; targetHeadingIndex: number; position: 'above' | 'below' }>;
  images: Array<{ id: string; thumbnailUrl: string; title: string; source: string; url?: string; filePath?: string }>;
}): Promise<{
  success: boolean;
  inserted?: number;
  failed?: number;
  error?: string;
}> => {
  try {
    if (!automation || !automationRunning) {
      return {
        success: false,
        error: '자동화가 실행 중이지 않습니다. 먼저 자동화를 시작해주세요.',
      };
    }

    const { selections, images } = data;

    // 이미지 다운로드 및 Base64 변환
    const imagesWithBase64: Array<{ id: string; base64: string; headingIndex: number }> = [];

    for (const selection of selections) {
      const image = images.find(img => img.id === selection.imageId);
      if (!image) {
        console.warn(`[Main] 이미지를 찾을 수 없습니다: ${selection.imageId}`);
        continue;
      }

      try {
        let base64: string;

        // filePath가 있으면 로컬 파일 읽기
        if (image.filePath && !image.filePath.startsWith('http')) {
          const imageBuffer = await fs.readFile(image.filePath);
          const ext = image.filePath.split('.').pop()?.toLowerCase() || 'png';
          const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
            ext === 'png' ? 'image/png' :
              ext === 'gif' ? 'image/gif' :
                ext === 'webp' ? 'image/webp' : 'image/png';
          base64 = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
        } else {
          // URL인 경우 다운로드
          const imageUrl = image.url || image.thumbnailUrl;
          if (!imageUrl) {
            console.warn(`[Main] 이미지 URL이 없습니다: ${image.id}`);
            continue;
          }

          const fetchModule = await import('node-fetch');
          const fetch = fetchModule.default as any;
          const response = await fetch(imageUrl);
          const buffer = await response.buffer() as Buffer;
          const ext = new URL(imageUrl).pathname.split('.').pop()?.toLowerCase() || 'png';
          const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
          base64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
        }

        imagesWithBase64.push({
          id: image.id,
          base64,
          headingIndex: selection.targetHeadingIndex,
        });
      } catch (error) {
        console.error(`[Main] 이미지 다운로드 실패 (${image.id}):`, error);
      }
    }

    if (imagesWithBase64.length === 0) {
      return {
        success: false,
        error: '이미지를 다운로드할 수 없습니다.',
      };
    }

    // naverBlogAutomation의 메서드를 사용하여 이미지 삽입
    const result = await automation.insertImagesAtHeadings(
      imagesWithBase64.map(img => ({
        headingIndex: img.headingIndex,
        imageBase64: img.base64,
        position: selections.find(s => s.imageId === img.id)?.position || 'below',
      }))
    );

    return {
      success: true,
      inserted: result.success,
      failed: result.failed,
    };
  } catch (error) {
    console.error('[Main] 이미지 배치 적용 오류:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
});

// ✅ 네이버 이미지 검색 IPC 핸들러 (최대 50개 수집 + 중복/무관 이미지 필터링)
// [v2.10.256] image:searchNaver → main/ipc/imageSearchNaverHandlers.ts

// ✅ [100점 개선] AI 이미지 검색어 최적화 IPC 핸들러
// [v2.10.243] image:optimizeSearchQuery / extractCoreSubject / batchOptimizeSearchQueries / crawlFromUrl
//   → main/ipc/imageOptimizeHandlers.ts 로 이주 (god-file 압축 2단계)
//   등록: registerImageOptimizeHandlers() (아래 라인에서 호출)

// ✅ [2026-04-03] 소제목 이미지 핸들러 → headingHandlers.ts로 추출

// 이미지 라이브러리 기능 제거됨
/*
ipcMain.handle('library:extractKeywords', async (_event, title: string): Promise<{ keywords: string[]; personNames: string[] }> => {
  try {
    const { extractKeywordsFromTitle } = await import('./imageLibrary.js');
    return extractKeywordsFromTitle(title);
  } catch (error) {
    console.error('[Main] 키워드 추출 실패:', (error as Error).message);
    return { keywords: [], personNames: [] };
  }
});
*/

// 이미지 라이브러리 기능 제거됨
/*
// 키워드 기반 추가 이미지 수집 (10개 더 수집 버튼용)
ipcMain.handle('library:collectByKeywordsArray', async (_event, keywords: string[], title: string, maxImages: number = 10): Promise<{ success: boolean; count: number; message?: string }> => {
  // 라이선스 체크
  if (!(await ensureLicenseValid())) {
    return { success: false, count: 0, message: '라이선스 인증이 필요합니다. 라이선스를 인증해주세요.' };
  }
  try {
    const { collectImages } = await import('./imageLibrary.js');
    const { searchAllRssSources } = await import('./rssSearcher.js');
    const { crawlNaverBlogWithPuppeteer } = await import('./naverBlogCrawler.js');
    const { fetchArticleContent } = await import('./sourceAssembler.js');
    
    if (!keywords || keywords.length === 0) {
      return {
        success: false,
        count: 0,
        message: '키워드가 비어있습니다.',
      };
    }
    
    const searchKeywords = keywords.slice(0, 3).join(' ');
    console.log(`[Main] 추가 이미지 수집: "${searchKeywords}"`);
    
    // 네이버 검색 API 키 로드
    const config = await loadConfig();
    const clientId = config.naverDatalabClientId?.trim();
    const clientSecret = config.naverDatalabClientSecret?.trim();
    
    // 네이버 블로그, 뉴스, 카페에서 검색
    const rssUrls = await searchAllRssSources(searchKeywords, {
      maxPerSource: 5, // 더 적게 수집
      sources: ['naver_blog', 'naver_news', 'naver_cafe'],
      clientId,
      clientSecret,
    });
    
    if (rssUrls.length === 0) {
      return {
        success: false,
        count: 0,
        message: `"${searchKeywords}"에 대한 이미지를 찾을 수 없습니다.`,
      };
    }
    
    // 이미지 크롤링
    const allImageUrls: string[] = [];
    const maxUrls = Math.min(5, rssUrls.length);
    
    for (let i = 0; i < maxUrls; i++) {
      const url = rssUrls[i];
      try {
        let images: string[] = [];
        
        if (/blog\.naver\.com/i.test(url)) {
          try {
            const result = await crawlNaverBlogWithPuppeteer(url);
            images = result.images || [];
          } catch {
            const article = await fetchArticleContent(url);
            images = article.images || [];
          }
        } else {
          const article = await fetchArticleContent(url);
          images = article.images || [];
        }
        
        images.forEach(imgUrl => {
          if (imgUrl && imgUrl.startsWith('http') && !allImageUrls.includes(imgUrl)) {
            allImageUrls.push(imgUrl);
          }
        });
        
        if (allImageUrls.length >= maxImages) {
          break;
        }
      } catch (error) {
        console.warn(`[Main] URL 크롤링 실패: ${(error as Error).message}`);
      }
    }
    
    if (allImageUrls.length === 0) {
      return {
        success: false,
        count: 0,
        message: '이미지를 찾을 수 없습니다.',
      };
    }
    
    // 이미지 다운로드
    const category = keywords[0] || 'uncategorized';
    const collectedItems = await collectImages(
      allImageUrls.slice(0, maxImages),
      'naver-crawl',
      title,
      category
    );
    
    return {
      success: true,
      count: collectedItems.length,
      message: `${collectedItems.length}개의 이미지를 추가로 수집했습니다.`,
    };
  } catch (error) {
    return {
      success: false,
      count: 0,
      message: (error as Error).message,
    };
  }
});
*/

/*
ipcMain.handle('library:collectByKeywords', async (_event, title: string): Promise<{ success: boolean; count: number; message?: string }> => {
  // 라이선스 체크
  if (!(await ensureLicenseValid())) {
    return { success: false, count: 0, message: '라이선스 인증이 필요합니다. 라이선스를 인증해주세요.' };
  }
  try {
    const { extractKeywordsFromTitle, collectImages } = await import('./imageLibrary.js');
    const { searchAllRssSources } = await import('./rssSearcher.js');
    const { crawlNaverBlogWithPuppeteer } = await import('./naverBlogCrawler.js');
    const { fetchArticleContent } = await import('./sourceAssembler.js');
    
    if (!title || !title.trim()) {
      return {
        success: false,
        count: 0,
        message: '제목이 비어있어 이미지 수집을 할 수 없습니다.',
      };
    }
    
    // 제목에서 키워드 추출 (인물 이름 포함)
    const { keywords, personNames } = extractKeywordsFromTitle(title);
    console.log(`[Main] 제목 "${title}"에서 추출된 키워드:`, keywords, '인물 이름:', personNames);
    
    if (keywords.length === 0) {
      return {
        success: false,
        count: 0,
        message: `제목 "${title}"에서 키워드를 추출할 수 없습니다. 구체적인 키워드가 포함된 제목을 입력해주세요.`,
      };
    }
    
    // 핵심 키워드 선택 및 검색어 생성
    // 인물 이름과 일반 키워드를 합치되, 중복 제거
    const allKeywords = [...personNames, ...keywords];
    const uniqueKeywords = Array.from(new Set(allKeywords)); // 중복 제거
    
    // 검색어 생성: 최대 3개 키워드 사용 (인물 이름 우선)
    const primaryKeywords = uniqueKeywords.slice(0, 3);
    const searchKeywords = primaryKeywords.join(' ');
    
    console.log(`[Main] 네이버 블로그/뉴스/카페에서 "${searchKeywords}" 검색 중...`);
    console.log(`[Main] 사용 키워드: ${primaryKeywords.join(', ')} (인물: ${personNames.join(', ') || '없음'})`);
    
    // 네이버 검색 API 키 로드
    const config = await loadConfig();
    const clientId = config.naverDatalabClientId?.trim();
    const clientSecret = config.naverDatalabClientSecret?.trim();
    
    if (!clientId || !clientSecret) {
      console.warn(`[Main] 네이버 검색 API 키가 설정되지 않았습니다. RSS 검색으로 폴백합니다.`);
      console.warn(`[Main] 환경 설정에서 네이버 데이터랩 Client ID와 Secret을 입력해주세요.`);
    } else {
      console.log(`[Main] 네이버 검색 API 키 확인됨`);
      console.log(`[Main] - Client ID: 설정됨 (길이: ${clientId.length})`);
      console.log(`[Main] - Client Secret: 설정됨 (길이: ${clientSecret.length})`);
      console.log(`[Main] 참고: 네이버 검색 API를 사용하려면 개발자 센터에서 "검색" 서비스를 활성화해야 합니다.`);
      console.log(`[Main] 데이터랩 API만 활성화되어 있으면 401 오류가 발생할 수 있습니다.`);
      
      // API 키 형식 검증
      if (clientId.length < 10 || clientSecret.length < 10) {
        console.warn(`[Main] ⚠️ API 키 길이가 짧습니다. 올바른 키인지 확인해주세요.`);
      }
    }
    
    // 네이버 블로그, 뉴스, 카페에서 검색 (네이버 검색 API 우선 사용)
    const rssUrls = await searchAllRssSources(searchKeywords, {
      maxPerSource: 10,
      sources: ['naver_blog', 'naver_news', 'naver_cafe'],
      clientId,
      clientSecret,
    });
    
    console.log(`[Main] ${rssUrls.length}개의 URL 발견`);
    
    if (rssUrls.length === 0) {
      // 키워드가 너무 구체적일 수 있으므로, 더 일반적인 키워드로 재시도
      if (primaryKeywords.length > 1) {
        console.log(`[Main] 검색 결과가 없어 더 일반적인 키워드로 재시도...`);
        const fallbackKeywords = primaryKeywords.slice(0, 1);
        const fallbackUrls = await searchAllRssSources(fallbackKeywords.join(' '), {
          maxPerSource: 10,
          sources: ['naver_blog', 'naver_news', 'naver_cafe'],
          clientId,
          clientSecret,
        });
        
        if (fallbackUrls.length > 0) {
          console.log(`[Main] 폴백 검색으로 ${fallbackUrls.length}개의 URL 발견`);
          // 폴백 URL 사용
          const allImageUrls: string[] = [];
          const maxUrls = Math.min(20, fallbackUrls.length);
          
          for (let i = 0; i < maxUrls; i++) {
            const url = fallbackUrls[i];
            try {
              console.log(`[Main] 이미지 크롤링 중 (${i + 1}/${maxUrls}): ${url}`);
              
              let images: string[] = [];
              
              if (/blog\.naver\.com/i.test(url)) {
                try {
                  const result = await crawlNaverBlogWithPuppeteer(url, (msg) => {
                    console.log(`[Puppeteer] ${msg}`);
                  });
                  images = result.images || [];
                } catch (puppeteerError) {
                  console.warn(`[Main] Puppeteer 크롤링 실패, 일반 크롤링으로 폴백: ${(puppeteerError as Error).message}`);
                  const article = await fetchArticleContent(url);
                  images = article.images || [];
                }
              } else {
                const article = await fetchArticleContent(url);
                images = article.images || [];
              }
              
              images.forEach(imgUrl => {
                if (imgUrl && imgUrl.startsWith('http') && !allImageUrls.includes(imgUrl)) {
                  allImageUrls.push(imgUrl);
                }
              });
              
              if (allImageUrls.length >= 30) {
                break;
              }
            } catch (error) {
              console.warn(`[Main] URL 크롤링 실패 (${url}): ${(error as Error).message}`);
            }
          }
          
          if (allImageUrls.length > 0) {
            const category = keywords.join('_').substring(0, 30);
            const collectedItems = await collectImages(
              allImageUrls,
              'naver-crawl',
              title,
              category
            );
            
            return {
              success: true,
              count: collectedItems.length,
              message: `네이버 블로그/뉴스/카페에서 ${collectedItems.length}개의 이미지를 수집했습니다.`,
            };
          }
        }
      }
      
      return {
        success: false,
        count: 0,
        message: `키워드 "${searchKeywords}"로 네이버 블로그/뉴스/카페에서 관련 글을 찾을 수 없습니다.\n\n다른 키워드로 시도해보시거나, 네이버 검색 API 키가 올바르게 설정되어 있는지 확인해주세요.`,
      };
    }
    
    // 각 URL에서 이미지 크롤링
    const allImageUrls: string[] = [];
    const maxUrls = Math.min(20, rssUrls.length); // 최대 20개 URL만 크롤링
    
    for (let i = 0; i < maxUrls; i++) {
      const url = rssUrls[i];
      try {
        console.log(`[Main] 이미지 크롤링 중 (${i + 1}/${maxUrls}): ${url}`);
        
        let images: string[] = [];
        
        // 네이버 블로그인 경우 Puppeteer 사용
        if (/blog\.naver\.com/i.test(url)) {
          try {
            const result = await crawlNaverBlogWithPuppeteer(url, (msg) => {
              console.log(`[Puppeteer] ${msg}`);
            });
            images = result.images || [];
          } catch (puppeteerError) {
            console.warn(`[Main] Puppeteer 크롤링 실패, 일반 크롤링으로 폴백: ${(puppeteerError as Error).message}`);
            const article = await fetchArticleContent(url);
            images = article.images || [];
          }
        } else {
          // 일반 크롤링
          const article = await fetchArticleContent(url);
          images = article.images || [];
        }
        
        // 중복 제거하며 이미지 URL 추가
        images.forEach(imgUrl => {
          if (imgUrl && imgUrl.startsWith('http') && !allImageUrls.includes(imgUrl)) {
            allImageUrls.push(imgUrl);
          }
        });
    
        // 충분한 이미지를 수집했으면 중단
        if (allImageUrls.length >= 30) {
          console.log(`[Main] 충분한 이미지 수집 완료 (${allImageUrls.length}개)`);
          break;
        }
      } catch (error) {
        console.warn(`[Main] URL 크롤링 실패 (${url}): ${(error as Error).message}`);
        // 계속 진행
      }
    }
    
    console.log(`[Main] 총 ${allImageUrls.length}개의 이미지 URL 수집됨 (네이버 크롤링)`);
    
    // 네이버에서 이미지를 찾지 못했거나 부족하면 Pexels API 사용
    let collectedItems: any[] = [];
    
    if (allImageUrls.length < 10) {
      console.log(`[Main] 네이버 이미지가 부족합니다 (${allImageUrls.length}개). Pexels API로 추가 수집...`);
      
      const pexelsApiKey = config.pexelsApiKey?.trim();
      if (pexelsApiKey && pexelsApiKey.length > 0) {
        try {
          const { collectImagesByKeywords } = await import('./imageLibrary.js');
          console.log(`[Main] Pexels API로 키워드 기반 이미지 수집: ${keywords.join(', ')}`);
          
          const pexelsImages = await collectImagesByKeywords(
            keywords,
            pexelsApiKey,
            20, // 키워드당 최대 20개
            personNames
          );
          
          console.log(`[Main] Pexels에서 ${pexelsImages.length}개 이미지 수집 완료`);
          collectedItems = [...collectedItems, ...pexelsImages];
        } catch (pexelsError) {
          console.warn(`[Main] Pexels API 사용 실패:`, (pexelsError as Error).message);
        }
      } else {
        console.warn(`[Main] Pexels API 키가 설정되지 않았습니다. 환경 설정에서 Pexels API 키를 입력하세요.`);
      }
    }
    
    // 네이버 크롤링 이미지가 있으면 다운로드
    if (allImageUrls.length > 0) {
      // 카테고리는 첫 번째 핵심 키워드 사용 (주요 주제를 대표)
      const category = (personNames.length > 0 ? personNames[0] : keywords[0]) || 'uncategorized';
      console.log(`[Main] 네이버 이미지 다운로드 시작: ${allImageUrls.length}개, 제목: "${title}", 카테고리: "${category}"`);
      const naverCollected = await collectImages(
        allImageUrls,
        'naver-crawl',
        title,
        category
      );
      console.log(`[Main] 네이버 이미지 다운로드 완료: ${naverCollected.length}개 저장됨`);
      collectedItems = [...collectedItems, ...naverCollected];
    }
    
    console.log(`[Main] 이미지 수집 완료: ${collectedItems.length}개 저장됨`);
    
    if (collectedItems.length === 0) {
      // 상세한 오류 메시지 생성
      let errorMessage = `이미지 수집에 실패했습니다.\n\n`;
      errorMessage += `네이버 크롤링: ${allImageUrls.length}개 URL 발견\n`;
      errorMessage += `저장된 이미지: 0개\n\n`;
      errorMessage += `가능한 원인:\n`;
      errorMessage += `1. 네이버/Pexels 서버에서 접근이 차단되었을 수 있습니다.\n`;
      errorMessage += `2. Pexels API 키가 설정되지 않았거나 유효하지 않습니다.\n`;
      errorMessage += `3. 네트워크 연결 문제가 있을 수 있습니다.\n\n`;
      errorMessage += `해결 방법:\n`;
      errorMessage += `- 환경 설정에서 Pexels API 키를 입력하세요 (https://www.pexels.com/api/)\n`;
      errorMessage += `- 터미널 콘솔에서 "[이미지 수집]" 또는 "[Pexels]" 로그를 확인하세요.`;
      
      return {
        success: false,
        count: 0,
        message: errorMessage,
      };
    }
    
    const naverCount = allImageUrls.length > 0 ? collectedItems.filter((item: any) => item.sourceUrl === 'naver-crawl').length : 0;
    const pexelsCount = collectedItems.length - naverCount;
    
    let successMessage = `총 ${collectedItems.length}개의 이미지를 수집했습니다.`;
    if (naverCount > 0 && pexelsCount > 0) {
      successMessage += `\n- 네이버: ${naverCount}개\n- Pexels: ${pexelsCount}개`;
    } else if (naverCount > 0) {
      successMessage += `\n- 네이버에서 ${naverCount}개`;
    } else if (pexelsCount > 0) {
      successMessage += `\n- Pexels에서 ${pexelsCount}개`;
    }
    
    return {
      success: true,
      count: collectedItems.length,
      message: successMessage,
    };
  } catch (error) {
    const errorMessage = (error as Error).message || '알 수 없는 오류';
    console.error('[Main] 네이버 이미지 수집 실패:', errorMessage);
    console.error('[Main] 스택 트레이스:', (error as Error).stack);
    return {
      success: false,
      count: 0,
      message: `이미지 수집 실패: ${errorMessage}`,
    };
  }
});
*/

ipcMain.handle('license:get', async (): Promise<{ license: LicenseInfo | null }> => {
  try {
    // 개발 모드에서는 항상 유효한 라이선스 반환
    if (!app.isPackaged) {
      return {
        license: {
          licenseCode: 'DEV-MODE',
          deviceId: await getDeviceId(),
          verifiedAt: new Date().toISOString(),
          isValid: true,
          licenseType: 'premium',
        },
      };
    }

    const license = await loadLicense();
    return { license };
  } catch (error) {
    console.error('[Main] 라이선스 로드 실패:', (error as Error).message);
    return { license: null };
  }
});

ipcMain.handle('license:register', async (_event, code: string, userId: string, password: string, email: string, deviceId: string): Promise<{ valid: boolean; license?: LicenseInfo; message?: string; debugInfo?: any }> => {
  try {
    const serverUrl = process.env.LICENSE_SERVER_URL || 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
    const result = await registerLicense(code, userId, password, email, deviceId, serverUrl);

    // 메인 프로세스 콘솔에도 디버그 정보 출력
    if (result && result.debugInfo) {
      console.log('🔍 [licenseManager] ========================================');
      console.log('🔍 [licenseManager] 메인 프로세스 콘솔 - 디버그 정보');
      if (result.debugInfo.register) {
        console.log('🔍 [licenseManager] - register usedValue:', result.debugInfo.register.usedValue);
        console.log('🔍 [licenseManager] - register usedCheck:', result.debugInfo.register.usedCheck);
        console.log('🔍 [licenseManager] - register used:', result.debugInfo.register.used);
        console.log('🔍 [licenseManager] - register isUsed:', result.debugInfo.register.isUsed);
      }
      if (result.debugInfo.verify) {
        console.log('🔍 [licenseManager] - verify usedValue:', result.debugInfo.verify.usedValue);
        console.log('🔍 [licenseManager] - verify usedCheck:', result.debugInfo.verify.usedCheck);
        console.log('🔍 [licenseManager] - verify used:', result.debugInfo.verify.used);
        console.log('🔍 [licenseManager] - verify isUsed:', result.debugInfo.verify.isUsed);
      }
      console.log('🔍 [licenseManager] ========================================');
    }

    return result;
  } catch (error) {
    return {
      valid: false,
      message: `라이선스 등록 중 오류: ${(error as Error).message}`,
    };
  }
});

// ✅ [2026-04-03] license:verify, license:verifyWithCredentials, license:registerExternalInflow,
// license:canUseExternalInflow, license:checkPatchFile → src/main/ipc/authHandlers.ts로 이관

// ✅ [2026-04-03] app:isPackaged → src/main/ipc/systemHandlers.ts로 이관

ipcMain.handle('login:success', async (): Promise<void> => {
  isLicenseValid = true;
  if (loginWindow) {
    loginWindow.close();
  }

  debugLog('[login:success] License authentication successful');

  // 메인 창이 없으면 생성 (초기 인증 시)
  if (!mainWindow || mainWindow.isDestroyed()) {
    debugLog('[login:success] Main window not found, creating...');
    await createWindow();
    createTray(); // ✅ 트레이 생성
  } else {
    debugLog('[login:success] Main window already exists, focusing...');
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    mainWindow.show();
  }
});

// ✅ [2026-04-03] license:getDeviceId → src/main/ipc/authHandlers.ts로 이관

// ✅ [2026-04-03] app:getVersion → src/main/ipc/systemHandlers.ts로 이관

// ✅ [2026-03-24] 캐시 용량 조회 (v2: 병렬 스캔 + symlink 안전 처리)
ipcMain.handle('app:getCacheSize', async (): Promise<{ images: number; generated: number; sessions: number; browser: number; total: number }> => {
  try {
    const userDataPath = app.getPath('userData');
    const pathModule = await import('path');
    const fsPromises = await import('fs/promises');

    async function getDirSize(dirPath: string): Promise<number> {
      try {
        const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
        let size = 0;
        for (const entry of entries) {
          const fullPath = pathModule.join(dirPath, entry.name);
          try {
            if (entry.isSymbolicLink()) continue; // symlink 무시 (무한 재귀 방지)
            if (entry.isFile()) {
              const stat = await fsPromises.stat(fullPath);
              size += stat.size;
            } else if (entry.isDirectory()) {
              size += await getDirSize(fullPath);
            }
          } catch { /* 개별 파일 stat 실패 무시 */ }
        }
        return size;
      } catch {
        return 0; // 디렉토리 자체가 없거나 접근 불가
      }
    }

    // 카테고리별 디렉토리 목록 수집
    const imagesDirs = ['images', 'test-images'];
    const generatedDirs = ['generated-images', 'style-previews'];
    const sessionDirs = [
      'playwright-session', 'playwright-session-brandstore', 'playwright-session-imagefx',
      'puppeteer-session-brandstore', 'imagefx-chrome-profile',
    ];
    try {
      const entries = await fsPromises.readdir(userDataPath, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && e.name.startsWith('puppeteer-session-diag-')) {
          sessionDirs.push(e.name);
        }
      }
    } catch { /* skip */ }
    const browserDirs = ['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache'];

    // ✅ 병렬 스캔 (4개 카테고리 동시 실행 → 2~4배 속도 향상)
    // ✅ [Phase 3A] Promise.allSettled — 일부 디렉토리 접근 실패해도 나머지 결과 사용
    const sumDirs = async (dirs: string[]) => {
      const results = await Promise.allSettled(dirs.map(d => getDirSize(pathModule.join(userDataPath, d))));
      return results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
    };
    const categoryResults = await Promise.allSettled([
      sumDirs(imagesDirs),
      sumDirs(generatedDirs),
      sumDirs(sessionDirs),
      sumDirs(browserDirs),
    ]);
    const [images, generated, sessions, browser] = categoryResults.map(r => r.status === 'fulfilled' ? r.value : 0);

    const total = images + generated + sessions + browser;
    console.log(`[Cache] 용량 조회: images=${(images/1048576).toFixed(1)}MB, generated=${(generated/1048576).toFixed(1)}MB, sessions=${(sessions/1048576).toFixed(1)}MB, browser=${(browser/1048576).toFixed(1)}MB, total=${(total/1048576).toFixed(1)}MB`);

    return { images, generated, sessions, browser, total };
  } catch (error) {
    console.error('[Cache] 용량 조회 실패:', (error as Error).message);
    return { images: 0, generated: 0, sessions: 0, browser: 0, total: 0 };
  }
});

// ✅ [2026-03-24] 캐시 삭제 (v2: readdir 보호 + 파일단위 에러처리 + 발행중 가드)
ipcMain.handle('app:clearCache', async (_event, category: 'images' | 'sessions' | 'all'): Promise<{ success: boolean; freedBytes: number; message: string }> => {
  try {
    // ✅ category 유효성 검사
    if (!['images', 'sessions', 'all'].includes(category)) {
      return { success: false, freedBytes: 0, message: `유효하지 않은 카테고리: ${category}` };
    }

    const userDataPath = app.getPath('userData');
    const pathModule = await import('path');
    const fsPromises = await import('fs/promises');

    async function removeDirContents(dirPath: string): Promise<number> {
      let freed = 0;
      try {
        const stat = await fsPromises.stat(dirPath);
        if (!stat.isDirectory()) return 0;
        const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = pathModule.join(dirPath, entry.name);
          try {
            if (entry.isFile()) {
              const s = await fsPromises.stat(fullPath);
              freed += s.size;
              await fsPromises.unlink(fullPath);
            } else if (entry.isDirectory()) {
              freed += await removeDirRecursive(fullPath);
            }
          } catch (e) {
            console.warn(`[Cache] 삭제 실패 (건너뜀): ${fullPath} — ${(e as Error).message}`);
          }
        }
      } catch { /* 디렉토리 없음 또는 접근 불가 — 무시 */ }
      return freed;
    }

    async function removeDirRecursive(dirPath: string): Promise<number> {
      let freed = 0;
      try {
        const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = pathModule.join(dirPath, entry.name);
          try {
            if (entry.isFile()) {
              const s = await fsPromises.stat(fullPath);
              freed += s.size;
              await fsPromises.unlink(fullPath);
            } else if (entry.isDirectory()) {
              freed += await removeDirRecursive(fullPath);
            }
          } catch (e) {
            console.warn(`[Cache] 파일 삭제 실패 (건너뜀): ${fullPath} — ${(e as Error).message}`);
          }
        }
        // 빈 디렉토리 정리 (비어 있으면 삭제, ENOTEMPTY면 무시)
        try { await fsPromises.rmdir(dirPath); } catch { /* 비어있지 않으면 무시 */ }
      } catch { /* readdir 실패 — 무시 */ }
      return freed;
    }

    let totalFreed = 0;

    if (category === 'images' || category === 'all') {
      for (const d of ['images', 'test-images', 'generated-images', 'style-previews']) {
        totalFreed += await removeDirContents(pathModule.join(userDataPath, d));
      }
    }

    if (category === 'sessions' || category === 'all') {
      const sessionDirs = [
        'playwright-session', 'playwright-session-brandstore', 'playwright-session-imagefx',
        'puppeteer-session-brandstore', 'imagefx-chrome-profile',
      ];
      try {
        const entries = await fsPromises.readdir(userDataPath, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && e.name.startsWith('puppeteer-session-diag-')) {
            sessionDirs.push(e.name);
          }
        }
      } catch { /* skip */ }

      for (const d of sessionDirs) {
        const dirPath = pathModule.join(userDataPath, d);
        totalFreed += await removeDirRecursive(dirPath);
      }
    }

    if (category === 'all') {
      for (const d of ['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache']) {
        totalFreed += await removeDirContents(pathModule.join(userDataPath, d));
      }
    }

    const freedMB = (totalFreed / 1048576).toFixed(1);
    console.log(`[Cache] ✅ 캐시 삭제 완료: ${freedMB}MB 확보 (카테고리: ${category})`);

    return {
      success: true,
      freedBytes: totalFreed,
      message: `${freedMB}MB의 캐시가 삭제되었습니다.`,
    };
  } catch (error) {
    console.error('[Cache] 캐시 삭제 실패:', (error as Error).message);
    return {
      success: false,
      freedBytes: 0,
      message: `캐시 삭제 실패: ${(error as Error).message}`,
    };
  }
});

// ✅ [2026-04-03] license:testServer → src/main/ipc/authHandlers.ts로 이관

// ✅ 원클릭 네트워크 최적화 핸들러
ipcMain.handle('network:optimize', async (): Promise<{ success: boolean; message: string; results: string[] }> => {
  const results: string[] = [];
  let overallSuccess = true;

  try {
    results.push('===== ⚡ 네트워크 최적화 시작 =====\n');

    // 1. DNS 캐시 갱신 (Windows)
    results.push('🔄 DNS 캐시 갱신 중...');
    try {
      const { execSync } = await import('child_process');
      if (process.platform === 'win32') {
        execSync('ipconfig /flushdns', { encoding: 'utf-8', timeout: 10000 });
        results.push('✅ DNS 캐시 갱신 완료');
      } else if (process.platform === 'darwin') {
        execSync('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder', { encoding: 'utf-8', timeout: 10000 });
        results.push('✅ DNS 캐시 갱신 완료 (macOS)');
      } else {
        results.push('⚠️ DNS 캐시 갱신: Linux에서는 수동으로 실행해주세요');
      }
    } catch (dnsError) {
      results.push(`⚠️ DNS 캐시 갱신 실패 (관리자 권한 필요할 수 있음)`);
    }

    // 2. 연결 테스트 및 최적 서버 확인
    results.push('\n🔍 API 서버 연결 테스트...');
    const testUrls = [
      { name: 'Google (Gemini)', url: 'https://generativelanguage.googleapis.com/' },
      { name: 'OpenAI', url: 'https://api.openai.com/' },
      { name: 'Anthropic', url: 'https://api.anthropic.com/' },
    ];

    for (const { name, url } of testUrls) {
      try {
        const startTime = Date.now();
        const response = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        const latency = Date.now() - startTime;

        if (latency < 500) {
          results.push(`✅ ${name}: ${latency}ms (매우 빠름)`);
        } else if (latency < 1500) {
          results.push(`✅ ${name}: ${latency}ms (양호)`);
        } else {
          results.push(`⚠️ ${name}: ${latency}ms (느림 - 네트워크 확인 필요)`);
        }
      } catch (e) {
        results.push(`❌ ${name}: 연결 실패`);
        overallSuccess = false;
      }
    }

    // 3. 최적화 권장사항
    results.push('\n===== 📋 최적화 완료 =====\n');

    if (overallSuccess) {
      results.push('✅ 네트워크 상태가 양호합니다!');
      results.push('');
      results.push('💡 추가 속도 향상 팁:');
      results.push('• 불필요한 브라우저 탭 닫기');
      results.push('• 다운로드/업로드 중인 파일 일시 중지');
      results.push('• 유선 연결 사용 (WiFi보다 안정적)');
    } else {
      results.push('⚠️ 일부 연결에 문제가 있습니다.');
      results.push('');
      results.push('🔧 해결 방법:');
      results.push('1. VPN 사용 중이면 끄기');
      results.push('2. 방화벽에서 앱 허용');
      results.push('3. 다른 네트워크로 시도 (모바일 핫스팟)');
      results.push('4. 회사/학교 네트워크면 IT팀에 문의');
    }

    return {
      success: overallSuccess,
      message: overallSuccess ? '네트워크 최적화 완료!' : '일부 연결 문제 발견',
      results
    };

  } catch (error) {
    return {
      success: false,
      message: `최적화 중 오류: ${(error as Error).message}`,
      results: [...results, `❌ 오류: ${(error as Error).message}`]
    };
  }
});

// ✅ [2026-04-03] 관리자 패널 핸들러 → adminHandlers.ts로 추출
registerAdminHandlers({
  ensureLicenseValid,
  reportUserActivity
});

// ✅ [2026-04-03] license:clear, license:revalidate → src/main/ipc/authHandlers.ts로 이관

// Excel 자동 포스팅 기능 제거됨

// 썸네일을 로컬에 저장
ipcMain.handle('thumbnail:saveToLocal', async (_event, blobData: { type: string; data: number[] }, format: 'png' | 'jpg'): Promise<{ success: boolean; filePath?: string; message?: string }> => {
  try {
    if (!mainWindow) {
      return { success: false, message: '메인 윈도우가 없습니다.' };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: '썸네일 저장',
      defaultPath: `thumbnail-${Date.now()}.${format}`,
      filters: [
        { name: format === 'png' ? 'PNG 이미지' : 'JPEG 이미지', extensions: [format] },
        { name: '모든 이미지', extensions: ['png', 'jpg', 'jpeg'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, message: '저장이 취소되었습니다.' };
    }

    const buffer = Buffer.from(blobData.data);
    await fs.writeFile(result.filePath, buffer);

    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

// ✅ 로컬 이미지 선택 기능 (활성화됨)
// 이미지를 로컬에 저장
ipcMain.handle('library:saveImageToLocal', async (_event, sourceFilePath: string, suggestedName: string): Promise<boolean> => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { dialog } = await import('electron');
    const axios = (await import('axios')).default;

    if (!sourceFilePath) {
      console.error('[Main] 이미지 저장 실패: 소스 경로가 없습니다.');
      return false;
    }

    // 파일 확장자 추출
    let ext = path.extname(sourceFilePath).split('?')[0]; // URL 쿼리 파라미터 제거
    if (!ext || ext.length > 5) ext = '.jpg';

    const baseName = suggestedName.replace(/[^a-zA-Z0-9가-힣]/g, '_') || 'image';
    const defaultFileName = `${baseName}${ext}`;

    // 저장 다이얼로그 열기
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (!mainWindow) {
      throw new Error('메인 윈도우를 찾을 수 없습니다.');
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: '이미지 저장',
      defaultPath: defaultFileName,
      filters: [
        { name: '이미지 파일', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: '모든 파일', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return false;
    }

    let imageBuffer: Buffer;

    if (sourceFilePath.startsWith('http')) {
      // URL인 경우 다운로드
      console.log(`[Main] 이미지 다운로드 중: ${sourceFilePath}`);
      const response = await axios.get(sourceFilePath, { responseType: 'arraybuffer' });
      imageBuffer = Buffer.from(response.data);
    } else if (sourceFilePath.startsWith('data:')) {
      // Base64인 경우
      const base64Data = sourceFilePath.split(',')[1];
      // [SPEC-FREEZE-GUARD-001-P2 R5] 워커 디코딩 (사용자 저장 다이얼로그 data URL — 사용자 액션 트리거)
      imageBuffer = await decodeBase64Async(base64Data);
    } else {
      // 로컬 파일인 경우
      imageBuffer = await fs.readFile(sourceFilePath);
    }

    // 선택한 경로에 저장
    await fs.writeFile(result.filePath, imageBuffer);
    console.log(`[Main] 이미지 저장 완료: ${result.filePath}`);

    return true;
  } catch (error) {
    console.error('[Main] 이미지 로컬 저장 실패:', (error as Error).message);
    return false;
  }
});

// 로컬 이미지 파일 선택
ipcMain.handle('library:selectLocalImageFile', async (): Promise<{ success: boolean; filePath?: string; previewDataUrl?: string; message?: string }> => {
  try {
    const { dialog } = await import('electron');

    const mainWindow = BrowserWindow.getFocusedWindow();
    if (!mainWindow) {
      throw new Error('메인 윈도우를 찾을 수 없습니다.');
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '이미지 파일 선택',
      filters: [
        { name: '이미지 파일', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
        { name: '모든 파일', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return {
        success: false,
        message: '파일 선택이 취소되었습니다.',
      };
    }

    const filePath = result.filePaths[0];
    // ✅ file:// URL로 변환하여 previewDataUrl 제공
    const previewDataUrl = `file:///${filePath.replace(/\\/g, '/')}`;

    return {
      success: true,
      filePath: filePath,
      previewDataUrl: previewDataUrl,
    };
  } catch (error) {
    return {
      success: false,
      message: `파일 선택 중 오류: ${(error as Error).message}`,
    };
  }
});

// ✅ 폴더 선택 다이얼로그는 파일 상단에서 이미 등록됨 (dialog:showOpenDialog)

ipcMain.handle('library:getImageData', async (_event, filePath: string): Promise<string | null> => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    // 파일이 존재하는지 확인
    try {
      await fs.access(filePath);
    } catch {
      return null;
    }

    // 파일 읽기
    const buffer = await fs.readFile(filePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('[Main] 이미지 데이터 읽기 실패:', (error as Error).message);
    return null;
  }
});

// 스케줄 관리 IPC 핸들러
// [v2.10.257] schedule:getAll → main/ipc/scheduleApiHandlers.ts

// 창 포커스 유지
ipcMain.handle('window:focus', async () => {
  try {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.show();
      return { success: true };
    }
    return { success: false, message: '창이 없습니다.' };
  } catch (error) {
    console.error('[Main] Window focus error:', error);
    return { success: false, message: (error as Error).message };
  }
});

// [v2.10.257] schedule:remove + reschedule + retry → main/ipc/scheduleApiHandlers.ts

// ✅ [2026-04-03] openExternalUrl → src/main/ipc/systemHandlers.ts로 이관

async function createLoginWindow(): Promise<BrowserWindow> {
  debugLog('[createLoginWindow] Creating login window...');

  const loginPreloadPath = path.join(__dirname, 'preloadLogin.js');
  loginWindow = new BrowserWindow({
    width: 500,
    height: 650,
    resizable: false,
    show: true, // ✅ [2026-03-11] 업데이트 체크 완료 후에만 생성되므로 즉시 표시
    frame: true,
    center: true, // 화면 중앙에 표시
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // ✅ [v2.7.56 SEC-V2-H1] sandbox 명시
      sandbox: true,
      preload: loginPreloadPath,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
    title: '라이선스 인증',
    icon: resolveIconImage(),
  });

  debugLog('[createLoginWindow] BrowserWindow created (visible)');

  const loginHtmlPath = path.join(publicPath, 'login.html');
  debugLog(`[createLoginWindow] Loading HTML from: ${loginHtmlPath}`);

  try {
    await loginWindow.loadFile(loginHtmlPath);
    debugLog('[createLoginWindow] HTML loaded successfully');
    // ✅ [v2.10.34] 로그인 창 준비 완료 → splash close
    closeSplash();
  } catch (error) {
    debugLog(`[createLoginWindow] !!! ERROR loading HTML: ${(error as Error).message}`);
    closeSplash();
    throw error;
  }

  loginWindow.on('closed', () => {
    debugLog('[createLoginWindow] Login window closed event');
    loginWindow = null;
    setUpdaterLoginWindow(null); // ✅ [2026-03-07] 업데이터 인증창 참조 해제
  });

  // ✅ [2026-03-07] 업데이터에 인증창 참조 전달 (업데이트 재시작 시 닫기 위해)
  setUpdaterLoginWindow(loginWindow);

  debugLog('[createLoginWindow] Login window setup complete');
  return loginWindow;
}

async function checkLicense(): Promise<boolean> {
  debugLog('[checkLicense] ========== START ==========');

  if (isE2ETestMode()) {
    debugLog('[checkLicense] E2E_TEST mode: skipping login/license windows');
    isLicenseValid = true;
    return true;
  }

  // 개발 모드에서 FORCE_LICENSE_CHECK=true가 아니면 라이선스 체크 스킵
  const forceLicenseCheck = process.env.FORCE_LICENSE_CHECK === 'true';
  debugLog(`[checkLicense] isPackaged: ${app.isPackaged}, forceLicenseCheck: ${forceLicenseCheck}`);

  if (!app.isPackaged && !forceLicenseCheck) {
    debugLog('[checkLicense] Development mode: skipping license check');
    isLicenseValid = true;
    return true;
  }

  // 저장된 라이선스 확인
  debugLog('[checkLicense] Loading saved license...');
  const license = await loadLicense();
  debugLog(`[checkLicense] License loaded: ${license ? 'YES' : 'NO'}, isValid: ${license?.isValid}`);

  if (!license || !license.isValid) {
    // 개발 모드에서는 로그인 창을 표시하지만 닫으면 통과 가능
    if (!app.isPackaged) {
      console.log('[Main] Development mode: showing login window but allowing skip');
      await createLoginWindow();

      // 개발 모드에서는 로그인 창이 닫히면 인증 없이도 통과
      return new Promise((resolve) => {
        let checkCount = 0;
        const maxChecks = 600; // 최대 60초 (100ms * 600)
        const checkInterval = setInterval(() => {
          checkCount++;
          if (checkCount > maxChecks) {
            clearInterval(checkInterval);
            console.log('[Main] License check timeout, allowing access in dev mode');
            isLicenseValid = true;
            resolve(true);
            return;
          }
          if (!loginWindow || loginWindow.isDestroyed()) {
            clearInterval(checkInterval);
            // 개발 모드에서는 인증 없이도 통과
            console.log('[Main] Development mode: login window closed, allowing access without authentication');
            isLicenseValid = true;
            resolve(true);
          }
        }, 100);
      });
    }

    // 프로덕션 모드: 로그인 창 표시
    debugLog('[checkLicense] Production mode: showing login window...');
    await createLoginWindow();
    debugLog('[checkLicense] Login window created');

    // 로그인 창이 닫힐 때까지 대기 (인증 성공 시 창이 닫힘)
    // 최대 10분 타임아웃
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 6000; // 10분 (100ms * 6000)

      debugLog('[checkLicense] Waiting for login window to close...');

      const checkInterval = setInterval(async () => {
        checkCount++;

        // 30초마다 로그 출력
        if (checkCount % 300 === 0) {
          debugLog(`[checkLicense] Still waiting... (${checkCount / 10}s elapsed)`);
        }

        // 타임아웃 체크
        if (checkCount > maxChecks) {
          clearInterval(checkInterval);
          debugLog('[checkLicense] License check timeout (10 minutes), quitting app');
          if (loginWindow && !loginWindow.isDestroyed()) {
            loginWindow.close();
          }
          app.quit();
          resolve(false);
          return;
        }

        if (!loginWindow || loginWindow.isDestroyed()) {
          clearInterval(checkInterval);
          debugLog('[checkLicense] Login window closed, checking license validity...');
          // [v2.10.116] 라이선스 확인 중 splash 재표시 — 검은 화면 / "응답 없음" 차단.
          //   로그인 창 닫힘 → ensureLicenseValid (X초) → 메인 윈도우 생성. 그 사이 빈 화면.
          //   splash가 메인 윈도우 ready까지 표시 (line 1610 createMainWindow 시 closeSplash 호출됨).
          showSplash();
          const isValid = await ensureLicenseValid();
          debugLog(`[checkLicense] ensureLicenseValid result: ${isValid}`);
          if (isValid) {
            isLicenseValid = true;
            debugLog('[checkLicense] License valid, returning true');
            // login:success 핸들러에서 메인 창을 생성하므로 여기서는 생성하지 않음
            // 메인 창이 이미 있으면 포커스만
            if (mainWindow && !mainWindow.isDestroyed()) {
              debugLog('[checkLicense] Main window already exists, focusing...');
              if (mainWindow.isMinimized()) {
                mainWindow.restore();
              }
              mainWindow.focus();
              mainWindow.show();
              closeSplash(); // 메인 이미 표시 → splash 즉시 닫기
            } else {
              debugLog('[checkLicense] Main window will be created by login:success handler');
            }
            resolve(true);
          } else {
            // 라이선스가 유효하지 않으면 앱 종료
            debugLog('[checkLicense] License not valid after login window closed, quitting app');
            closeSplash();
            app.quit();
            resolve(false);
          }
        }
      }, 100);
    });
  } else {
    // 라이선스가 있어도 항상 로그인 창을 먼저 표시 (초기 인증창 표시)
    debugLog('[checkLicense] License exists, but showing login window first (initial auth screen)');

    // 개발 모드에서는 로그인 창을 표시하지만 닫으면 통과 가능
    if (!app.isPackaged) {
      console.log('[Main] Development mode: showing login window but allowing skip');
      await createLoginWindow();

      // 개발 모드에서는 로그인 창이 닫히면 인증 없이도 통과
      return new Promise((resolve) => {
        let checkCount = 0;
        const maxChecks = 600; // 최대 60초 (100ms * 600)
        const checkInterval = setInterval(() => {
          checkCount++;
          if (checkCount > maxChecks) {
            clearInterval(checkInterval);
            console.log('[Main] License check timeout, allowing access in dev mode');
            isLicenseValid = true;
            resolve(true);
            return;
          }
          if (!loginWindow || loginWindow.isDestroyed()) {
            clearInterval(checkInterval);
            // 개발 모드에서는 인증 없이도 통과
            console.log('[Main] Development mode: login window closed, allowing access without authentication');
            isLicenseValid = true;
            resolve(true);
          }
        }, 100);
      });
    }

    // 프로덕션 모드: 로그인 창 표시 (초기 인증창)
    debugLog('[checkLicense] Production mode: showing login window (initial auth screen)...');
    await createLoginWindow();
    debugLog('[checkLicense] Login window created');

    // 로그인 창이 닫힐 때까지 대기 (인증 성공 시 창이 닫힘)
    // 최대 10분 타임아웃
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 6000; // 10분 (100ms * 6000)

      debugLog('[checkLicense] Waiting for login window to close...');

      const checkInterval = setInterval(async () => {
        checkCount++;

        // 30초마다 로그 출력
        if (checkCount % 300 === 0) {
          debugLog(`[checkLicense] Still waiting... (${checkCount / 10}s elapsed)`);
        }

        // 타임아웃 체크
        if (checkCount > maxChecks) {
          clearInterval(checkInterval);
          debugLog('[checkLicense] License check timeout (10 minutes), quitting app');
          if (loginWindow && !loginWindow.isDestroyed()) {
            loginWindow.close();
          }
          app.quit();
          resolve(false);
          return;
        }

        if (!loginWindow || loginWindow.isDestroyed()) {
          clearInterval(checkInterval);
          debugLog('[checkLicense] Login window closed, checking license validity...');
          // [v2.10.116] 라이선스 확인 중 splash 재표시 — 검은 화면 / "응답 없음" 차단.
          //   로그인 창 닫힘 → ensureLicenseValid (X초) → 메인 윈도우 생성. 그 사이 빈 화면.
          //   splash가 메인 윈도우 ready까지 표시 (line 1610 createMainWindow 시 closeSplash 호출됨).
          showSplash();
          const isValid = await ensureLicenseValid();
          debugLog(`[checkLicense] ensureLicenseValid result: ${isValid}`);
          if (isValid) {
            isLicenseValid = true;
            debugLog('[checkLicense] License valid, returning true');
            // login:success 핸들러에서 메인 창을 생성하므로 여기서는 생성하지 않음
            // 메인 창이 이미 있으면 포커스만
            if (mainWindow && !mainWindow.isDestroyed()) {
              debugLog('[checkLicense] Main window already exists, focusing...');
              if (mainWindow.isMinimized()) {
                mainWindow.restore();
              }
              mainWindow.focus();
              mainWindow.show();
              closeSplash(); // 메인 이미 표시 → splash 즉시 닫기
            } else {
              debugLog('[checkLicense] Main window will be created by login:success handler');
            }
            resolve(true);
          } else {
            // 라이선스가 유효하지 않으면 앱 종료
            debugLog('[checkLicense] License not valid after login window closed, quitting app');
            closeSplash();
            app.quit();
            resolve(false);
          }
        }
      }, 100);
    });
  }
}

async function showLicenseInputDialog(): Promise<string | null> {
  // 간단한 입력 다이얼로그 (실제로는 별도 창을 만드는 것이 좋습니다)
  return new Promise((resolve) => {
    // Electron의 dialog.showInputBox는 없으므로, 별도 창을 만들어야 합니다
    // 여기서는 간단한 예시로 null을 반환하고, 실제 구현은 별도 창으로 처리
    const licenseDialogPreloadPath = path.join(__dirname, 'preloadDialog.js');
    const licenseWindow = new BrowserWindow({
      width: 500,
      height: 300,
      resizable: false,
      modal: true,
      parent: mainWindow || undefined,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // ✅ [v2.7.56 SEC-V2-H1] sandbox 명시
        sandbox: true,
        webSecurity: true,
        preload: licenseDialogPreloadPath,
      },
    });

    // 라이선스 입력 HTML 생성
    const licenseHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>라이선스 입력</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 30px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h2 { margin-top: 0; }
          input {
            width: 100%;
            padding: 12px;
            font-size: 16px;
            border: 2px solid #ddd;
            border-radius: 4px;
            margin: 10px 0;
            box-sizing: border-box;
          }
          input:focus {
            outline: none;
            border-color: #3b82f6;
          }
          button {
            width: 100%;
            padding: 12px;
            font-size: 16px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 10px;
          }
          button:hover { background: #2563eb; }
          .error { color: red; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>라이선스 코드 입력</h2>
          <p>라이선스 코드를 입력해주세요 (형식: XXXX-XXXX-XXXX-XXXX)</p>
          <input type="text" id="license-input" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="19" />
          <div id="error" class="error" style="display: none;"></div>
          <button id="submit-btn">확인</button>
        </div>
        <script>
          const input = document.getElementById('license-input');
          const submitBtn = document.getElementById('submit-btn');
          const error = document.getElementById('error');
          
          // 자동 하이픈 추가
          input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^A-Z0-9]/g, '').toUpperCase();
            if (value.length > 4) value = value.slice(0,4) + '-' + value.slice(4);
            if (value.length > 9) value = value.slice(0,9) + '-' + value.slice(9);
            if (value.length > 14) value = value.slice(0,14) + '-' + value.slice(14);
            if (value.length > 19) value = value.slice(0,19);
            e.target.value = value;
          });
          
          submitBtn.addEventListener('click', () => {
            const code = input.value.trim();
            if (code.length === 19 && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
              window.dialogAPI.send('license:code', code);
            } else {
              error.textContent = '올바른 형식으로 입력해주세요.';
              error.style.display = 'block';
            }
          });
          
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitBtn.click();
          });
        </script>
      </body>
      </html>
    `;

    licenseWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(licenseHtml)}`);

    // IPC로 라이선스 코드 받기
    const handler = (_event: Electron.IpcMainEvent, code: string) => {
      ipcMain.removeListener('license:code', handler);
      licenseWindow.close();
      resolve(code);
    };
    ipcMain.once('license:code', handler);

    licenseWindow.on('closed', () => {
      if (!licenseWindow.isDestroyed()) {
        resolve(null);
      }
    });
  });
}

// Single Instance Lock - 중복 실행 방지
// ✅ [2026-02-18] setName을 lock 앞에 호출하여 admin-panel과 lock 충돌 방지
app.setName('better-life-naver');

// ✅ [v2.10.9] startup 마이그레이션 분리 — 동기 (필수) vs 비동기 (큰 폴더)
//   사용자 보고: 앱 시작 시 20초간 응답 없음 → 정상 작동
//   원인: restoreFromMirrorIfEmpty가 자동화 세션/Local Storage 등 큰 폴더를 동기 복사하면서
//         메인 스레드 블로킹. 부팅 단계에서 사용자 UI 응답 불가.
//   조치:
//     1. 동기: 작은 settings 파일 머지만 — 사용자 데이터 안전 보장에 필수 (즉시 완료)
//     2. 비동기: 큰 폴더 복사(미러 복원, 마이그레이션)를 setImmediate으로 백그라운드 실행
//     → 메인 윈도우 즉시 표시, 폴더 복사는 뒤에서 진행
try {
    const { migrateUserDataFolders, restoreFromMirrorIfEmpty, getMirrorDir, syncMasterIntoAccountSettings } = require('./main/userDataMigration.js');
    const fsForMig = require('fs');
    const pathForMig = require('path');
    const userDataDir = pathForMig.join(
        process.env.APPDATA || (process.platform === 'darwin'
            ? pathForMig.join(process.env.HOME || '', 'Library', 'Application Support')
            : pathForMig.join(process.env.HOME || '', '.config')),
        'better-life-naver'
    );
    if (!fsForMig.existsSync(userDataDir)) fsForMig.mkdirSync(userDataDir, { recursive: true });

    // === 동기 (필수, 빠름): settings 머지만 ===
    try {
        syncMasterIntoAccountSettings(userDataDir);
    } catch (syncErr: any) {
        console.warn('[Startup] 계정별 설정 동기화 실패 (무시):', syncErr?.message);
    }
    const documentsDir = process.env.USERPROFILE
        ? pathForMig.join(process.env.USERPROFILE, 'Documents')
        : pathForMig.join(process.env.HOME || '', 'Documents');

    // === 비동기 (큰 폴더 복사): 메인 스레드 블로킹 방지 ===
    setImmediate(() => {
        try {
            console.log('[Startup-Async] 마이그레이션/미러 복원 백그라운드 시작');
            migrateUserDataFolders(userDataDir);
            restoreFromMirrorIfEmpty(userDataDir, getMirrorDir(documentsDir));
            // 마이그레이션 후 settings 머지 한 번 더 (sibling에서 새로 들어온 데이터 반영)
            try { syncMasterIntoAccountSettings(userDataDir); } catch { /* skip */ }
            console.log('[Startup-Async] 마이그레이션/미러 복원 완료');
        } catch (asyncErr: any) {
            console.warn('[Startup-Async] 비동기 마이그레이션 실패 (무시):', asyncErr?.message);
        }
    });

    // ✅ [v2.9.0] 마이그레이션 직후 customImageSavePath 동기적 보장 — '추가' 버튼이 즉시 정상 폴더를 보도록
    //   기존 v2.7.89는 app.whenReady() 이후 비동기 영속화. 그동안 UI가 빈 경로를 받아 회귀 발생 가능.
    //   여기서 settings.json을 직접 읽어 비어있으면 동기적으로 Downloads/naver-blog-images 영속화.
    try {
        const settingsPath = pathForMig.join(userDataDir, 'settings.json');
        let cfg: any = {};
        if (fsForMig.existsSync(settingsPath)) {
            try { cfg = JSON.parse(fsForMig.readFileSync(settingsPath, 'utf8')); } catch { cfg = {}; }
        }
        const homeDir = process.env.USERPROFILE || process.env.HOME || '';
        const defaultImagePath = pathForMig.join(homeDir, 'Downloads', 'naver-blog-images');
        if (!cfg.customImageSavePath || !String(cfg.customImageSavePath).trim()) {
            cfg.customImageSavePath = defaultImagePath;
            fsForMig.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2), 'utf8');
            console.log(`[Startup] ✅ customImageSavePath 동기 영속화: ${defaultImagePath}`);
        }
        // 폴더도 미리 생성 — '추가' 버튼이 빈 폴더 리스트를 만나지 않도록
        fsForMig.mkdirSync(defaultImagePath, { recursive: true });
    } catch (cfgErr: any) {
        console.warn('[Startup] customImageSavePath 동기 영속화 실패 (무시):', cfgErr?.message);
    }
} catch (e: any) {
    console.warn('[Startup] userData 마이그레이션 실패 (무시):', e?.message);
}

// ✅ [2026-04-03] 디버그 로그 확장
try {
  const _fs2 = require('fs');
  const _p = require('path');
  const dbg = _p.join(process.env.TEMP || '/tmp', 'bln-startup-debug.log');
  _fs2.appendFileSync(dbg, `\n[${new Date().toISOString()}] Before requestSingleInstanceLock\n`);
} catch(e) { /* 스타트업 디버그 로그 실패 — Logger 미초기화 상태이므로 무시 */ }

const gotTheLock = isE2ETestMode() || app.requestSingleInstanceLock();

try {
  const _fs2 = require('fs');
  const _p = require('path');
  const dbg = _p.join(process.env.TEMP || '/tmp', 'bln-startup-debug.log');
  _fs2.appendFileSync(dbg, `[${new Date().toISOString()}] gotTheLock: ${gotTheLock}\n`);
} catch(e) { /* 스타트업 디버그 로그 실패 — Logger 미초기화 상태이므로 무시 */ }

if (!gotTheLock) {
  console.error('[Main] Another instance is already running. Exiting immediately...');
  // ✅ 에러박스 대신 조용히 종료 — second-instance 이벤트가 기존 창을 자동 포커스함
  app.quit();
  // 2초 후 강제 종료 (quit이 안 먹힐 경우 대비)
  setTimeout(() => process.exit(0), 2000);
} else {
  console.log('[Main] Single instance lock acquired');

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[Main] Second instance attempt detected. Focusing existing window...');

    // 메인 창이 있으면 포커스
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }

    // 로그인 창이 있으면 포커스 (✅ [2026-03-11 FIX] 업데이트 중에는 표시 차단)
    if (loginWindow && !loginWindow.isDestroyed() && !isUpdating()) {
      if (loginWindow.isMinimized()) loginWindow.restore();
      loginWindow.focus();
      loginWindow.show();
    }
  });
}

// ★ 앱 종료 시 서버 로그아웃 호출 (중복 로그인 차단 해제)
let isQuittingForLogout = false;
let quitCoordinationInProgress = false;

app.on('before-quit', (event) => {
  if (isE2ETestMode()) return;

  if (isQuittingForLogout) return;
  event.preventDefault();
  if (quitCoordinationInProgress) return;
  quitCoordinationInProgress = true;

  void (async () => {
    const hasActiveAutomation = automationRunning || Boolean(automation) || automationMap.size > 0;
    const userAlreadyConfirmed = (globalThis as any).isQuitting === true;
    if (hasActiveAutomation && !userAlreadyConfirmed) {
      const result = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['강제 종료', '취소'],
        defaultId: 1,
        cancelId: 1,
        title: '자동화 실행 중',
        message: '자동화 세션이 활성화되어 있습니다. 모든 작업을 중단하고 종료할까요?',
        detail: '강제 종료를 선택하면 진행 중인 브라우저와 자식 프로세스를 정리합니다.',
      });
      if (result.response !== 0) {
        quitCoordinationInProgress = false;
        (globalThis as any).isQuitting = false;
        return;
      }
    }

    (globalThis as any).isQuitting = true;
    console.log('[Main] before-quit: 로그아웃과 자원 정리 시작');
    const logoutPromise = import('./licenseManager.js')
      .then((lm) => lm.logoutFromServer());

    const results = await Promise.allSettled([
      withCleanupTimeout(() => logoutPromise, 2_000, 'server logout'),
      withCleanupTimeout(() => _runFullCleanup('before-quit'), 20_000, 'full app cleanup'),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        console.warn('[Main] before-quit 정리 경고:', (result.reason as Error)?.message || result.reason);
      }
    }

    isQuittingForLogout = true;
    console.log('[Main] before-quit: 정리 완료, 종료 진행');
    app.quit();
    setTimeout(() => process.exit(0), 2_000);
  })().catch((error) => {
    console.error('[Main] before-quit 조정 실패:', error);
    isQuittingForLogout = true;
    app.quit();
  });
});

// ffmpeg 경고 무시 (미디어 재생 기능 미사용)
// ✅ [v2.7.47 게임 친화] 작업표시줄 깜빡임 차단 — 5중 가드
//   1. CalculateNativeWinOcclusion: Windows occlusion 계산 비활성 (fullscreen 게임 깜빡임 주범)
//   2. BackgroundTimerThrottling 강제 (Chromium 백그라운드 timer 자동 감속)
//   3. RendererBackgrounding: Chromium이 백그라운드 렌더 우선순위 자동 다운
//   4. MediaFoundationVideoCapture (기존)
app.commandLine.appendSwitch('disable-features', 'MediaFoundationVideoCapture,CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('enable-features', 'BackgroundTimerThrottling,RendererBackgrounding');
// 5. GPU vsync — 게임 렌더 충돌 차단 (백그라운드에서 vsync 안 맞춤)
app.commandLine.appendSwitch('disable-gpu-vsync');

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [v1.4.32] 버전 업그레이드 시 자격증명 백업 → wipe → 복원
// 이유: 손님 PC에서 stale settings/캐시로 인한 Gemini 호출 실패가 자동 업데이트로
//       해결되지 않아 매번 수동 재설치 안내가 필요했음. wipe로 재설치 효과를 자동화하되
//       API 키/라이선스/네이버 로그인은 보존해서 재설정 부담을 0으로 만든다.
// ═══════════════════════════════════════════════════════════════════════════════

// 자격증명 백업 시 보존할 필드 화이트리스트
// ⚠️ 의도적으로 제외: primaryGeminiTextModel, geminiModel — stale dead model ID가
//    원인일 수 있어서 wipe와 함께 기본값(gemini-2.5-flash)으로 자동 리셋되게 둠
const PRESERVE_FIELDS = [
  // ===== API 키 (가장 중요) =====
  'geminiApiKey', 'gemini-api-key', 'geminiApiKeys',
  'openaiApiKey', 'openai-api-key',
  'claudeApiKey', 'claude-api-key',
  'perplexityApiKey', 'perplexity-api-key',
  'openaiImageApiKey', 'leonardoaiApiKey', 'leonardoaiModel',
  'prodiaApiKey', 'prodia-api-key', 'prodiaToken', 'prodia-token', 'prodiaModel', 'prodia-model',
  'deepinfraApiKey', 'deepinfra-api-key',
  'falaiApiKey', 'falai-api-key', 'falaiModel',
  'pexelsApiKey', 'unsplashApiKey', 'pixabayApiKey',
  'stabilityApiKey', 'stability-api-key', 'stabilityModel',
  // ===== 네이버 API =====
  'naverClientId', 'naver-client-id',
  'naverClientSecret', 'naver-client-secret',
  'naverAdApiKey', 'naver-ad-api-key',
  'naverAdSecretKey', 'naverAdCustomerId',
  'naverDatalabClientId', 'naverDatalabClientSecret',
  // ===== 사용자 자격증명 (재입력 면제) =====
  'rememberCredentials', 'savedNaverId', 'savedNaverPassword',
  'rememberLicenseCredentials', 'savedLicenseUserId', 'savedLicensePassword',
  // ===== 사용자가 동의했던 항목 (재동의 요구 X) =====
  'externalApiCostConsent', 'externalApiCostConsentAt',
  // ===== 플랜/예산 정보 =====
  'geminiPlanType', 'geminiCreditBudget',
  // ===== 사용자 표시 정보 =====
  'userDisplayName', 'userEmail', 'userTimezone', 'authorName',
] as const;

// userData 안의 settings_*.json 모두 스캔해서 자격증명만 병합 추출
async function backupCredentialsFromAllSettings(userDataPath: string): Promise<Record<string, any>> {
  const merged: Record<string, any> = {};
  try {
    const allFiles = await fs.readdir(userDataPath);
    const settingsFiles = allFiles.filter(f =>
      f === 'settings.json' || (f.startsWith('settings_') && f.endsWith('.json'))
    );
    // mtime 오름차순 → 최신 파일 값이 마지막에 덮어쓰게
    const withMtime = await Promise.all(settingsFiles.map(async f => ({
      name: f,
      mtime: (await fs.stat(path.join(userDataPath, f))).mtimeMs,
    })));
    withMtime.sort((a, b) => a.mtime - b.mtime);

    for (const { name } of withMtime) {
      try {
        const raw = await fs.readFile(path.join(userDataPath, name), 'utf-8');
        const parsed = JSON.parse(raw);
        for (const field of PRESERVE_FIELDS) {
          const v = parsed[field];
          if (v !== undefined && v !== null && v !== '') {
            merged[field] = v;
          }
        }
      } catch (e) {
        console.warn(`[Wipe] ⚠️ ${name} 파싱 실패 (스킵):`, (e as Error).message);
      }
    }
    console.log(`[Wipe] ✅ 자격증명 백업: ${Object.keys(merged).length}개 필드 / ${withMtime.length}개 파일 스캔`);
  } catch (e) {
    console.warn('[Wipe] ⚠️ settings 파일 스캔 실패:', (e as Error).message);
  }
  return merged;
}

// 버전 업그레이드 시 stale 데이터를 wipe하고 깨끗한 settings.json 재생성
// 보존: API 키, 라이선스, 네이버 로그인 세션, 블로그 계정 목록, 이미지 결과물
// 삭제: settings_*.json (모두), quota/통계 JSON, Local Storage/IndexedDB 등
async function wipeUserDataPreservingCredentials(lastVersion: string, currentVersion: string): Promise<void> {
  // 첫 실행(이전 버전 정보 없음)이면 wipe할 게 없음 → 스킵
  if (!lastVersion) {
    console.log('[Wipe] 첫 실행 — wipe 스킵');
    return;
  }

  const userDataPath = app.getPath('userData');
  console.log(`[Wipe] 🔄 ${lastVersion} → ${currentVersion} 업그레이드 — wipe 시작`);

  // 1) 자격증명 백업
  const credentials = await backupCredentialsFromAllSettings(userDataPath);

  // 2) 삭제 대상 — settings_*.json은 동적으로 찾음
  // ⚠️ scheduled-posts.json은 의도적으로 제외 — 손님이 예약해둔 발행 일정 보호
  const filesToDelete = new Set<string>([
    'settings.json',
    '.last_active_user',
    'config.json',
    'quota-state.json',
    'quota-state.backup.json',
    'ai-learning.json',
    'content-generation-stats.json',
    'publish-records.json',
    'post-limit.json',
    'heading-videos.json',
  ]);
  try {
    const allFiles = await fs.readdir(userDataPath);
    for (const f of allFiles) {
      if (f.startsWith('settings_') && f.endsWith('.json')) filesToDelete.add(f);
    }
  } catch { /* readdir 실패해도 진행 */ }

  // 3) 삭제 대상 폴더 — Electron 내부 저장소 + 통계
  // ⚠️ 보존: license/, playwright-session*/, puppeteer-session*/,
  //         imagefx-chrome-profile/, blog-accounts.json,
  //         images/, generated-images/, style-previews/, platform-tools/
  // ⚠️ [v1.4.66] Local Storage 삭제 제거 — 이전 글 목록(naver_blog_generated_posts)이
  //    localStorage에 저장되므로, 삭제 시 사용자의 발행 이력이 전부 소실됨.
  const dirsToDelete = [
    'Session Storage',
    'IndexedDB',
    'Network',
    'WebStorage',
    'SharedStorage',
    'shared_proto_db',
    'Service Worker',
    'ScriptCache',
    'Shared Dictionary',
    'VideoDecodeStats',
    'test-images',
  ];

  // 4) 파일 삭제 실행
  let deletedFiles = 0;
  for (const file of filesToDelete) {
    try {
      await fs.unlink(path.join(userDataPath, file));
      deletedFiles++;
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn(`[Wipe] ⚠️ ${file} 삭제 실패:`, err.message);
      }
    }
  }

  // 5) 폴더 삭제 실행
  let deletedDirs = 0;
  for (const dir of dirsToDelete) {
    try {
      await fs.rm(path.join(userDataPath, dir), { recursive: true, force: true });
      deletedDirs++;
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn(`[Wipe] ⚠️ ${dir} 삭제 실패:`, err.message);
      }
    }
  }
  console.log(`[Wipe] ✅ 삭제 완료: 파일 ${deletedFiles}개, 폴더 ${deletedDirs}개`);

  // 6) 자격증명 복원 — 새 settings.json을 atomic write로 생성
  if (Object.keys(credentials).length > 0) {
    const freshPath = path.join(userDataPath, 'settings.json');
    const tmpPath = freshPath + '.tmp';
    try {
      await fs.writeFile(tmpPath, JSON.stringify(credentials, null, 2), 'utf-8');
      await fs.rename(tmpPath, freshPath);
      console.log(`[Wipe] ✅ 새 settings.json 생성 (자격증명 ${Object.keys(credentials).length}개 복원)`);
    } catch (e) {
      console.error('[Wipe] ❌ 새 settings.json 생성 실패:', e);
    }
  } else {
    console.log('[Wipe] ℹ️ 백업된 자격증명 없음 — 새 settings.json 생성 안 함');
  }

  console.log('[Wipe] 🛡️ 보존됨: license/, playwright-session*/, puppeteer-session*/, imagefx-chrome-profile/, blog-accounts.json, scheduled-posts.json, images/, generated-images/, platform-tools/');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-02-21] 업데이트 후 캐시 자동 정리 (이전 버전 캐시로 인한 오류 방지)
// ═══════════════════════════════════════════════════════════════════════════════
async function clearCacheOnVersionChange(): Promise<void> {
  try {
    const currentVersion = app.getVersion();
    const userDataPath = app.getPath('userData');
    const versionFilePath = path.join(userDataPath, '.last-version');

    // 이전 버전 확인
    let lastVersion = '';
    try {
      lastVersion = (await fs.readFile(versionFilePath, 'utf-8')).trim();
    } catch {
      // 파일 없음 = 첫 실행 또는 업그레이드
    }

    if (lastVersion === currentVersion) {
      console.log(`[CacheClear] 버전 동일 (${currentVersion}), 캐시 정리 스킵`);
      return;
    }

    console.log(`[CacheClear] 🔄 버전 변경 감지: ${lastVersion || '(최초)'} → ${currentVersion}`);

    // ✅ [v1.4.32] 캐시 정리 전에 stale settings/통계 wipe + 자격증명 복원
    // (자동 업데이트만으로 손님 PC stale 문제 해결을 자동화)
    await wipeUserDataPreservingCredentials(lastVersion, currentVersion);

    console.log(`[CacheClear] 🧹 이전 캐시 정리 시작...`);

    // 1) Electron 내부 캐시 디렉토리 삭제 (오래된 V8 코드 캐시, GPU 캐시 등)
    const cacheDirsToDelete = [
      'GPUCache',        // GPU 렌더링 캐시
      'Code Cache',      // V8 컴파일된 코드 캐시 (이전 버전 JS가 남아서 오류 유발)
      'Cache',           // HTTP/네트워크 캐시
      'Service Worker',  // 서비스 워커 캐시
      'DawnCache',       // Dawn WebGPU 캐시
      'blob_storage',    // Blob 스토리지
      'ScriptCache',     // 렌더러 스크립트 캐시 (이전 버전 JS 잔존 방지)
    ];

    let clearedCount = 0;
    for (const dirName of cacheDirsToDelete) {
      const dirPath = path.join(userDataPath, dirName);
      try {
        await fs.rm(dirPath, { recursive: true, force: true });
        clearedCount++;
        console.log(`[CacheClear] ✅ ${dirName} 삭제 완료`);
      } catch (err: any) {
        // ENOENT (파일 없음)은 정상 — 해당 캐시가 존재하지 않음
        if (err.code !== 'ENOENT') {
          console.warn(`[CacheClear] ⚠️ ${dirName} 삭제 실패 (무시):`, err.message);
        }
      }
    }

    // 2) Electron 세션 캐시 프로그래밍 방식으로 삭제
    try {
      const { session } = await import('electron');
      const defaultSession = session.defaultSession;
      await defaultSession.clearCache();
      await defaultSession.clearStorageData({
        storages: ['cachestorage', 'serviceworkers', 'shadercache'],
      });
      console.log(`[CacheClear] ✅ Electron 세션 캐시 정리 완료`);
    } catch (err) {
      console.warn('[CacheClear] ⚠️ 세션 캐시 정리 실패 (무시):', err);
    }

    // 3) 버전 파일 업데이트
    await fs.writeFile(versionFilePath, currentVersion, 'utf-8');
    console.log(`[CacheClear] ✅ 버전 파일 업데이트: ${currentVersion}`);
    console.log(`[CacheClear] 🎉 캐시 정리 완료 (${clearedCount}개 디렉토리 삭제)`);

  } catch (error) {
    // 캐시 정리 실패가 앱 시작을 막으면 안 됨
    console.error('[CacheClear] ❌ 캐시 정리 중 오류 (앱 시작은 계속):', error);
  }
}

// ✅ [v2.7.95] 데이터 백업 시스템 — 자동 일일 백업 + 수동 export/import IPC
//   사용자 보고: "업데이트하면 api키랑 기존에 저장된게 초기화된다는데"
//   목표: 업데이트/재설치 시에도 API 키 + 글 목록 + 다계정 데이터 100% 보존
// [v2.10.259] performDataBackup + backup:* 3개 IPC → main/ipc/backupHandlers.ts

app.whenReady().then(async () => {
  try {
    // ✅ [v2.10.34] 체감 부팅 시간 단축 — splash 화면 즉시 표시
    //   사용자 보고: '앱 부팅 시 20초 응답없음'. 백그라운드 게이트는 그대로 진행하되
    //   사용자에게는 즉시 splash가 보임. 로그인/메인 윈도우 준비되면 splash close.
    showSplash();

    // ✅ [2026-05-26 v2.10.375 SPEC-NAVER-PROTECTION-2026 P1 Fix 1.1]
    //   셀렉터 원격 업데이트 활성화 — 네이버 UI 변경 시 앱 업데이트 없이 자동 패치.
    //   env var SELECTOR_PATCH_URL 설정 시에만 시작 (URL 미설정 = dead code = 안전).
    //   기본 간격 6시간. stopPeriodicCheck는 will-quit에서 cleanup (line 8253 기존 wiring).
    try {
      const selectorPatchUrl = (process.env.SELECTOR_PATCH_URL || '').trim();
      if (selectorPatchUrl) {
        const { schedulePeriodicCheck } = require('./automation/selectors/remoteUpdate.js');
        schedulePeriodicCheck(selectorPatchUrl);
        console.log(`[Main] 셀렉터 원격 업데이트 시작: ${selectorPatchUrl}`);
      }
    } catch (selectorErr) {
      console.warn('[Main] 셀렉터 원격 업데이트 시작 실패 (무시):', (selectorErr as Error).message);
    }

    // ✅ [2026-05-26 v2.10.383 SPEC-CONVERSION-001 Tier 1 #1+#4]
    //   exposurePoller — published-posts.json 자동 폴링 + attribution 페어링
    //   Content policy requires monitoring by default. Set EXPOSURE_POLLER_ENABLED=false only for maintenance.
    //   기본 6시간 주기 (EXPOSURE_POLLER_INTERVAL_HOURS override).
    try {
      const exposureEnabled = (process.env.EXPOSURE_POLLER_ENABLED || '').trim().toLowerCase() !== 'false';
      if (exposureEnabled) {
        const { startExposurePolling } = require('./analytics/exposurePoller.js');
        startExposurePolling(app.getPath('userData'));
        console.log('[Main] exposurePoller 시작 (기본 활성)');
      }
    } catch (exposureErr) {
      console.warn('[Main] exposurePoller 시작 실패 (무시):', (exposureErr as Error).message);
    }

    // [v2.10.155] Layer 2 — 좀비 회복 시스템 초기화 + 이전 세션 좀비 자동 정리
    //   부팅 차단 없이 setImmediate(non-blocking)으로 백그라운드 실행.
    //   사용자 통찰 "사용자들도 다들 그럼 느려지는이유가 이게원인이네" 해결책.
    try {
      const zombieRecovery = require('./runtime/zombieRecovery');
      zombieRecovery.initZombieRecovery({ userDataDir: app.getPath('userData') });
      setImmediate(async () => {
        try {
          const report = await zombieRecovery.recoverZombiesOnStartup({ currentMainPid: process.pid });
          if (report.killed.length > 0) {
            console.log(`[ZombieRecovery] ✅ ${report.killed.length}개 좀비 정리 완료 (${report.durationMs}ms)`);
            // 메인 윈도우 준비되면 toast 알림
            const sendToastWhenReady = () => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('log-message',
                  `🧹 이전 세션 좀비 프로세스 ${report.killed.length}개 자동 정리 완료 (시스템 정상화)`);
              } else {
                setTimeout(sendToastWhenReady, 1000);
              }
            };
            sendToastWhenReady();
          } else if (report.scanned > 0) {
            console.log(`[ZombieRecovery] 스캔 ${report.scanned}개, 정리 대상 없음 (${report.skippedReason || 'no-candidates'})`);
          }
          // 새 세션 시작 — lock 초기화
          zombieRecovery.startSession({ mainPid: process.pid, appVersion: app.getVersion() });
        } catch (e: any) {
          console.warn('[ZombieRecovery] 시작 시 회복 실패 (무시):', e?.message);
        }
      });
    } catch (e: any) {
      console.warn('[ZombieRecovery] 모듈 로드 실패 (무시):', e?.message);
    }

    // ✅ [v2.10.42] 트렌드 알림 콜백 등록을 app.whenReady 후 setImmediate로 이동
    //   기존: module load 시 즉시 등록 → 부팅 cold path 부하
    //   수정: 부팅 게이트 통과 후 idle 시점에 등록 → splash가 먼저 보임
    setImmediate(() => {
      try { _registerTrendAlertCallback(); }
      catch (e: any) { debugLog(`[Startup] trendAlert 콜백 등록 실패 (무시): ${e?.message}`); }
    });

    // ✅ [2026-02-18] setName은 lock 앞에서 이미 호출됨 (single instance lock 충돌 방지)

    // ✅ [v2.10.37] 부팅 직렬 게이트 → 병렬 (서로 독립인 3개 작업 Promise.allSettled)
    //   기존: 자동 백업 → customImageSavePath → cleanupOldDumps 순차 → 부팅 시간 누적
    //   수정: 병렬 실행 → 가장 느린 작업 시간만 소요 (보통 자동 백업이 가장 무거움)
    //   안전: 모두 try/catch + 실패 무시 패턴이라 의존성 없음. allSettled로 어떤 결과든 진행.
    await Promise.allSettled([
      // 자동 백업 (1일 1회)
      (async () => {
        try {
          const backupRoot = path.join(app.getPath('documents'), 'better-life-naver-backup');
          let needsBackup = true;
          if (fsSync.existsSync(backupRoot)) {
            const list = fsSync.readdirSync(backupRoot)
              .filter((d: string) => d.startsWith('backup-') && d.includes('-auto'));
            if (list.length > 0) {
              const newest = list
                .map((d: string) => fsSync.statSync(path.join(backupRoot, d)).mtimeMs)
                .sort((a: number, b: number) => b - a)[0];
              if (Date.now() - newest < 24 * 60 * 60 * 1000) needsBackup = false;
            }
          }
          if (needsBackup) {
            await performDataBackup('auto', debugLog);
          }
        } catch (e: any) {
          debugLog(`[Startup] 자동 백업 실패 (무시): ${e?.message}`);
        }
      })(),

      // customImageSavePath 자동 세팅 (첫 실행)
      (async () => {
        try {
          const { loadConfig, saveConfig } = await import('./configManager.js');
          const cfg = await loadConfig();
          const currentPath = String((cfg as any).customImageSavePath || '').trim();
          if (!currentPath) {
            const defaultPath = path.join(app.getPath('downloads'), 'naver-blog-images');
            await saveConfig({ ...cfg, customImageSavePath: defaultPath } as any);
            debugLog(`[Startup] 📁 이미지 저장 경로 기본값 자동 세팅: ${defaultPath}`);
          }
        } catch (e: any) {
          debugLog(`[Startup] 이미지 경로 기본값 세팅 실패 (무시): ${e?.message}`);
        }
      })(),

      // 오래된 디버그 덤프 정리
      (async () => {
        try {
          const { cleanupOldDumps } = await import('./debug/domDumpManager.js');
          const result = await cleanupOldDumps();
          if (result.deleted > 0) {
            debugLog(`[DumpCleaner] 오래된 덤프 ${result.deleted}개 정리 완료 (남은 ${result.remainingCount}개, ${result.remainingSizeMB}MB)`);
          }
        } catch (cleanErr) {
          debugLog(`[DumpCleaner] 정리 실패 (무시): ${(cleanErr as Error).message}`);
        }
      })(),
    ]);

    // ✅ isPackaged 값을 실제 값으로 업데이트 (배포 환경 감지)

    // ✅ [2026-03-11] 업데이트를 먼저 확인하고, 결과에 따라 인증창 표시 여부 결정
    // 사용자 요청: "앱을 키면 업데이트 확인 먼저 → 업데이트 없으면 인증창, 있으면 업데이트"
    if (app.isPackaged) {
      try {
        initAutoUpdaterEarly();
        debugLog('[Main] 업데이트 확인 중...');
      } catch (updErr) {
        debugLog(`[Main] ⚠️ 업데이터 초기화 실패 (무시): ${(updErr as Error).message}`);
      }
      const hasUpdate = await waitForUpdateCheck().catch(() => false);
      if (hasUpdate) {
        debugLog('[Main] 업데이트 발견 → 다운로드 진행 중, 인증창 생성 안 함');
        // 업데이트 다운로드 → 자동 재시작 (updater.ts에서 처리)
        // 앱이 재시작되면 새 버전으로 인증창이 표시됨
        return;
      }
      debugLog('[Main] 업데이트 없음 → 인증창 표시 진행');
    }

    // ✅ [2026-02-21] 업데이트 후 캐시 자동 정리 (이전 버전 캐시로 인한 오류 방지)
    await clearCacheOnVersionChange();

    debugLog('[Main] ========== APP READY ==========');
    debugLog(`[Main] isPackaged: ${app.isPackaged}`);
    debugLog(`[Main] Process arguments: ${process.argv.join(' ')}`);

    // [v2.10.226] 보안 게이트 sync 백그라운드 전환 — 부팅 4.2초 freeze 제거 (perf-summary #2).
    //   기존: await performServerSync로 mainWindow 표시 차단 → 사용자 "초반 응답없음 1분" 체감
    //   수정: 비차단 promise로 시작, deny 발생 시 background에서 app.quit + 다이얼로그 (이미 표시됨)
    //   trade-off: deny(점검 모드/차단/구버전)는 드물지만 발생 시 splash/메인 잠깐 보였다가 종료됨
    //               점검 다이얼로그가 사용자에게 정상 표시되므로 UX 손실 < freeze 제거 가치
    debugLog('[Main] ⚡ Performing pre-launch server sync (background, non-blocking)...');
    if (!isE2ETestMode()) {
      performServerSync(false).then((res) => {
      if (!res.allowed) {
        if (res.error === 'VERSION_TOO_OLD_UPDATING') {
          debugLog('[Main] Pre-launch sync paused while auto-update is in progress');
          return;
        }
        debugLog(`[Main] ⛔ Pre-launch sync denied (background): ${res.error}`);
        setTimeout(() => {
          app.quit();
          process.exit(0);
        }, 500);
      } else {
        debugLog('[Main] ✅ Pre-launch sync passed (background)');
      }
    }).catch((e) => {
      debugLog(`[Main] Pre-launch sync error (background, 무시): ${(e as Error).message}`);
      });
    } else {
      debugLog('[Main] E2E_TEST mode: skipping pre-launch server sync');
    }

    debugLog('[Main] App ready, checking license...');


    // 라이선스 검증 (로그인 창 표시)
    debugLog('[Main] Calling checkLicense()...');
    const licenseCheckResult = await checkLicense();
    debugLog(`[Main] checkLicense() result: ${licenseCheckResult}`);

    if (!licenseCheckResult) {
      debugLog('[Main] License check failed, quitting app...');
      // 명시적으로 앱 종료
      setTimeout(() => {
        debugLog('[Main] Executing app.quit()...');
        app.quit();
        process.exit(0);
      }, 500);
      return;
    }

    // 라이선스가 유효한지 다시 확인
    debugLog('[Main] Checking ensureLicenseValid()...');
    if (!(await ensureLicenseValid())) {
      debugLog('[Main] License not valid after check, quitting app...');
      // 명시적으로 앱 종료
      setTimeout(() => {
        debugLog('[Main] Executing app.quit()...');
        app.quit();
        process.exit(0);
      }, 500);
      return;
    }

    debugLog('[Main] License check passed, starting app...');

    // ✅ [2026-02-23] 자동 업데이터는 이미 인증창 전에 초기화됨 (위 참조)
    // 여기서는 별도 호출 불필요

    debugLog('[Main] Checking build expiry...');
    if (await enforceBuildExpiry()) {
      debugLog('[Main] Build expired, exiting...');
      return;
    }

    debugLog('[Main] Loading config...');
    appConfig = await loadConfig();
    applyConfigToEnv(appConfig);
    if (appConfig.dailyPostLimit !== undefined) {
      setDailyLimit(appConfig.dailyPostLimit);
    }

    // ✅ [리팩토링] BlogExecutor 의존성 주입 (핸들러 로직 이동 지원)
    (injectBlogExecutorDeps as (deps: any) => void)({
      loadConfig,
      applyConfigToEnv,
      createAutomation: (naverId: string, naverPassword: string, accountProxyUrl?: string) => {
        // ✅ [2026-03-02] sendLog 주입 → 브라우저 자동화 로그가 UI에 실시간 표시
        // ✅ [2026-03-23] accountProxyUrl → 계정별 프록시 우선, 미설정 시 글로벌 SmartProxy 폴백
        return new NaverBlogAutomation({ naverId, naverPassword, accountProxyUrl }, (msg: string) => {
          const safeMsg = redactKnownAccountId(msg, naverId);
          console.log(safeMsg);  // 터미널에도 출력
          sendLog(safeMsg);      // 렌더러 UI에도 전달
        });
      },
      blogAccountManager,
      getDailyLimit,
      getTodayCount,
      incrementTodayCount,
      setGeminiModel,
    });
    debugLog('[Main] BlogExecutor dependencies injected');

    // ✅ app.whenReady() 이후에 등록해야 하는 핸들러 (import 체인에 app.getPath 등 사용)
    try {
      const { registerImageHandlers, registerMediaHandlers } = await import('./main/ipc/imageHandlers.js');
      const { registerSystemHandlers, registerFileHandlers, registerDialogHandlers } = await import('./main/ipc/systemHandlers.js');
      const { registerMiscHandlers } = await import('./main/ipc/miscHandlers.js');
      const { registerScheduleHandlers } = await import('./main/ipc/scheduleHandlers.js');
      const ctx = {
        getMainWindow: () => mainWindow,
        getAutomationMap: () => automationMap,
        notify: (title: string, body: string) => { /* no-op */ },
        sendToRenderer: (channel: string, ...args: unknown[]) => mainWindow?.webContents.send(channel, ...args)
      };
      registerImageHandlers(ctx);
      registerMediaHandlers(ctx);
      registerSystemHandlers(ctx);
      registerFileHandlers(ctx);
      registerDialogHandlers(ctx);
      // miscHandlers는 최상위에서 이미 등록됨
      registerScheduleHandlers({ smartScheduler });
      debugLog('[Main] Image/Media/System/File/Dialog/Scheduler handlers registered');
    } catch (e) {
      debugLog(`[Main] ⚠️ 핸들러 등록 실패: ${(e as Error).message}`);
    }

    // AI 어시스턴트 Gemini 재초기화
    const geminiConnected = masterAgent.reinitGemini();
    debugLog(`[Main] AI 어시스턴트 Gemini 연동: ${geminiConnected ? '성공' : '실패'}`);

    debugLog('[Main] Loading heading images store...');
    await loadHeadingImagesStore();

    debugLog('[Main] Loading heading videos store...');
    await loadHeadingVideosStore();

    debugLog('[Main] Initializing image library...');
    await initializeImageLibrary();

    if (process.env.START_REALTIME_MONITOR === 'true' && !monitorTask) {
      monitorTask = trendMonitor
        .monitorRealtime()
        .catch((error) => sendLog(`⚠️ 실시간 모니터링 오류: ${(error as Error).message}`));
    }

    if (process.env.START_DAILY_AUTOMATION === 'true') {
      cron.schedule('0 6 * * *', async () => {
        sendLog('📅 일간 자동화 예약 실행 (플레이스홀더)');
      });
    }

    if (process.env.START_PATTERN_LEARNING === 'true') {
      cron.schedule('0 23 * * *', async () => {
        sendLog('🎓 일일 패턴 학습 예약 실행');
        await patternAnalyzer.analyzeAndLearn().catch((error) => {
          sendLog(`❌ 일일 패턴 학습 실패: ${(error as Error).message}`);
        });
      });
    }

    cron.schedule('0 0 * * *', async () => {
      try {
        await resetAllQuota();
      } catch (e) {
        console.error('[Quota] daily reset failed:', e);
      }
    });

    // ✅ 예약 발행 실행 (1분마다 체크)
    cron.schedule('* * * * *', async () => {
      if (scheduledPostsCronRunning) {
        console.log('[Scheduler] 이전 1분 예약 점검이 아직 실행 중이므로 이번 틱을 건너뜁니다.');
        return;
      }
      scheduledPostsCronRunning = true;
      try {
        const scheduledPosts = await loadScheduledPosts();
        const now = new Date();

        for (const post of scheduledPosts) {
          const scheduleDate = parseScheduledDate(post.scheduleDate);
          if (!scheduleDate) {
            const invalidDateError = Object.assign(
              new Error('예약 시간이 올바른 YYYY-MM-DD HH:mm 형식이 아닙니다.'),
              { code: 'INVALID_SCHEDULE_DATE' },
            );
            await saveScheduledPost(createFailedScheduledPostState(post, invalidDateError));
            sendLog(`❌ 예약 발행 실패: "${post.title}"의 예약 시간을 확인해주세요.`);
            continue;
          }

          // ✅ 디버깅: 날짜 파싱 결과 확인
          console.log(`[Scheduler] 📅 예약 체크: "${post.title}"`);
          console.log(`[Scheduler]   - 원본: ${post.scheduleDate}`);
          console.log(`[Scheduler]   - 파싱된 scheduleDate: ${scheduleDate.toISOString()} (${scheduleDate.toLocaleString('ko-KR')})`);
          console.log(`[Scheduler]   - 현재 시간 now: ${now.toISOString()} (${now.toLocaleString('ko-KR')})`);
          console.log(`[Scheduler]   - 비교: scheduleDate <= now ? ${scheduleDate <= now}`);

          // 예약 시간이 되었고, 아직 발행되지 않은 경우
          if (scheduleDate <= now && post.status === 'scheduled') {
            console.log(`[Scheduler] ⏰ 예약 발행 시간 도래! 발행 시작: ${post.title}`);
            sendLog(`⏰ 예약 발행 시간이 되었습니다: ${post.title}`);

            // ✅ mainWindow 확인
            if (!mainWindow || mainWindow.isDestroyed()) {
              console.error(`[Scheduler] ❌ 메인 윈도우가 없습니다. 앱이 실행 중이어야 합니다.`);
              sendLog(`❌ 예약 발행 실패: 앱이 실행 중이어야 합니다.`);
              const failedPost = createFailedScheduledPostState(
                post,
                new Error('Main window is unavailable for scheduled publishing'),
              );
              await saveScheduledPost(failedPost);
              continue;
            }

            const directLease = await acquireDirectAutomationLease(`scheduled-post:${post.id}`);
            if (!directLease) {
              sendLog(`예약 발행 대기: 다른 발행 작업이 실행 중이므로 "${post.title}"은 다음 점검에서 다시 시도합니다.`);
              continue;
            }

            let schedulerAutomation: NaverBlogAutomation | null = null;
            let normalizedId = '';
            let confirmedPublishedPost: ScheduledPost | null = null;
            let scheduledQuotaLease: ScheduledPublishQuotaLease | null = null;

            try {
              // ✅ localStorage에서 생성된 글 데이터 가져오기 (postId 또는 title로 검색)
              if (!mainWindow) {
                throw new Error('메인 윈도우가 없습니다. 앱이 실행 중이어야 합니다.');
              }

              console.log(`[Scheduler] 글 데이터 검색 시작: postId=${post.postId}, title=${post.title}`);

              const generatedPosts = await mainWindow.webContents.executeJavaScript(`
                (function() {
                  try {
                    const key = 'naver_blog_generated_posts';
                    const rawData = localStorage.getItem(key);
                    
                    // ✅ 결과를 반환하여 main process에서 로그 출력
                    const debugInfo = {
                      key: key,
                      hasData: !!rawData,
                      dataLength: rawData ? rawData.length : 0
                    };
                    
                    if (!rawData) {
                      return { posts: [], error: 'localStorage가 비어있습니다', debug: debugInfo };
                    }
                    
                    const posts = JSON.parse(rawData);
                    debugInfo.postsCount = posts.length;
                    debugInfo.postIds = posts.map(p => p.id);
                    debugInfo.titles = posts.map(p => p.title);
                    
                    const postId = ${JSON.stringify(post.postId)};
                    const title = ${JSON.stringify(post.title)};
                    const hasAuthoritativePostId = typeof postId === 'string'
                      && postId.trim()
                      && postId !== 'null'
                      && postId !== 'undefined';
                    
                    debugInfo.searchPostId = postId;
                    debugInfo.searchTitle = title;
                    
                    let foundPost = null;
                    
                    // 1. postId로 정확히 찾기
                    if (hasAuthoritativePostId) {
                      foundPost = posts.find(p => p.id === postId);
                      debugInfo.step1_postId = foundPost ? 'found' : 'not_found';
                    }
                    
                    // 2. postId가 없는 이전 예약만 정확한 제목으로 찾기
                    if (!hasAuthoritativePostId && !foundPost && title) {
                      foundPost = posts.find(p => p.title === title);
                      debugInfo.step2_exactTitle = foundPost ? 'found' : 'not_found';
                    }
                    
                    // 3. 구두점/공백만 다른 동일 제목 허용 (부분 일치 금지)
                    if (!hasAuthoritativePostId && !foundPost && title) {
                      const normalizeTitle = (t) => (t || '').trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
                      const normalizedSearchTitle = normalizeTitle(title);
                      foundPost = posts.find(p => {
                        const normalizedPostTitle = normalizeTitle(p.title);
                        return normalizedSearchTitle.length > 0
                          && normalizedPostTitle === normalizedSearchTitle;
                      });
                      debugInfo.step3_normalizedTitle = foundPost ? 'found' : 'not_found';
                    }
                    
                    if (foundPost) {
                      debugInfo.finalResult = 'found';
                      debugInfo.foundTitle = foundPost.title;
                      debugInfo.foundId = foundPost.id;
                      return { posts: [foundPost], found: true, debug: debugInfo };
                    } else {
                      debugInfo.finalResult = 'not_found';
                      return { posts: [], found: false, error: '글을 찾을 수 없습니다', debug: debugInfo };
                    }
                  } catch (e) {
                    console.error('[Scheduler] localStorage 조회 실패:', e);
                    return { posts: [], error: e.message };
                  }
                })()
              `);

              // ✅ main process에서 디버그 정보 출력
              console.log(`[Scheduler] ========== localStorage 검색 결과 ==========`);
              if (generatedPosts?.debug) {
                console.log(`[Scheduler] localStorage 키: ${generatedPosts.debug.key}`);
                console.log(`[Scheduler] 데이터 존재: ${generatedPosts.debug.hasData}`);
                console.log(`[Scheduler] 데이터 길이: ${generatedPosts.debug.dataLength} bytes`);
                console.log(`[Scheduler] 전체 글 수: ${generatedPosts.debug.postsCount || 0}`);
                console.log(`[Scheduler] 저장된 postId 목록:`, generatedPosts.debug.postIds || []);
                console.log(`[Scheduler] 저장된 제목 목록:`, generatedPosts.debug.titles || []);
                console.log(`[Scheduler] 검색할 postId: ${generatedPosts.debug.searchPostId}`);
                console.log(`[Scheduler] 검색할 title: ${generatedPosts.debug.searchTitle}`);
                console.log(`[Scheduler] Step 1 (postId 검색): ${generatedPosts.debug.step1_postId || 'skipped'}`);
                console.log(`[Scheduler] Step 2 (정확한 제목): ${generatedPosts.debug.step2_exactTitle || 'skipped'}`);
                console.log(`[Scheduler] Step 3 (정규화 동일 제목): ${generatedPosts.debug.step3_normalizedTitle || 'skipped'}`);
                console.log(`[Scheduler] 최종 결과: ${generatedPosts.debug.finalResult}`);
                if (generatedPosts.debug.foundTitle) {
                  console.log(`[Scheduler] ✅ 찾은 글: ${generatedPosts.debug.foundTitle} (ID: ${generatedPosts.debug.foundId})`);
                }
              }
              console.log(`[Scheduler] =============================================`);

              if (!generatedPosts || !generatedPosts.posts || generatedPosts.posts.length === 0) {
                const errorMsg = generatedPosts?.error || '알 수 없는 오류';
                console.error(`[Scheduler] ❌ 글 데이터를 찾을 수 없습니다`);
                throw new Error(`글 데이터를 찾을 수 없습니다: ${post.title} (postId: ${post.postId || '없음'}) - ${errorMsg}`);
              }

              const postData = generatedPosts.posts[0];
              console.log(`[Scheduler] ✅ 글 데이터 로드 성공: ${postData.title}`);

              console.log(`[Scheduler] 글 데이터 로드 완료: ${postData.title}`);
              sendLog(`📝 글 데이터 로드 완료: ${postData.title}`);

              // ✅ 네이버 계정 정보 가져오기
              const accountConfig = await loadConfig();
              const scheduledAccount = resolveScheduledAccountCredentials({
                scheduledAccountId: post.scheduledAccountId,
                scheduledNaverId: post.scheduledNaverId,
                configuredNaverId: accountConfig.savedNaverId,
                configuredNaverPassword: accountConfig.savedNaverPassword,
                accounts: blogAccountManager.getAllAccounts(),
                getCredentials: (accountId) => blogAccountManager.getAccountCredentials(accountId),
              });
              const accountNaverId = scheduledAccount.naverId;
              const accountNaverPassword = scheduledAccount.naverPassword;

              scheduledQuotaLease = await acquireScheduledPublishQuota({
                validate: async () => {
                  if (!(await ensureLicenseValid())) {
                    return { allowed: false, message: '라이선스 인증이 필요합니다.' };
                  }
                  const quotaCheck = await enforceFreeTier('publish', 1);
                  return quotaCheck.allowed
                    ? { allowed: true }
                    : {
                        allowed: false,
                        message: String(quotaCheck.response?.message || '무료 발행 한도를 확인해주세요.'),
                      };
                },
                isFreeTierUser,
                consume: () => consumeQuota('publish', 1),
                refund: () => refundQuota('publish', 1),
              });

              console.log('[Scheduler] 네이버 계정 확인 완료');
              sendLog(`🔐 네이버 계정 확인 완료`);

              // ✅ 이미지 경로 복원
              const images: AutomationImage[] = (postData.images || []).map((img: any) => {
                // savedToLocal이 문자열(경로)이면 filePath로 사용, 불린이면 기존 filePath 유지
                let finalFilePath = img.filePath || '';
                if (img.savedToLocal) {
                  if (typeof img.savedToLocal === 'string' && img.savedToLocal.trim() !== '') {
                    finalFilePath = img.savedToLocal;
                  }
                }

                return {
                  heading: img.heading || '',
                  filePath: finalFilePath,
                  provider: img.provider || 'nano-banana-pro',
                  alt: img.alt || '',
                  caption: img.caption || '',
                  savedToLocal: img.savedToLocal
                };
              });

              console.log(`[Scheduler] 이미지 ${images.length}개 준비 완료`);
              sendLog(`🖼️ 이미지 ${images.length}개 준비 완료`);

              // ✅ 다중계정 세션 맵 활용 (기존 세션 있으면 재사용)
              normalizedId = accountNaverId.trim().toLowerCase();
              schedulerAutomation = automationMap.get(normalizedId) || null;

              if (schedulerAutomation) {
                console.log('[Scheduler] 기존 계정 세션 재사용');
                automation = schedulerAutomation;
              } else {
                console.log('[Scheduler] 새 브라우저 세션 시작');
                // ✅ [2026-03-02] sendLog 주입 → 예약발행 자동화 로그도 UI에 표시
                schedulerAutomation = new NaverBlogAutomation({
                  naverId: accountNaverId,
                  naverPassword: accountNaverPassword,
                  headless: false,
                  slowMo: 50,
                }, (msg: string) => {
                  const safeMsg = redactKnownAccountId(msg, accountNaverId);
                  console.log(safeMsg);
                  sendLog(safeMsg);
                });
                automationMap.set(normalizedId, schedulerAutomation);
                automation = schedulerAutomation; // 하위 호환성 유지
              }

              AutomationService.set(normalizedId, schedulerAutomation);
              AutomationService.setCurrentInstance(schedulerAutomation);

              const sanitizedScheduledTitle = sanitizePublishableSourceText(String(postData.title || ''));
              const sanitizedScheduledContent = sanitizePublishableSourceText(String(postData.content || ''));
              const rawScheduledStructuredContent = postData.structuredContent || {
                selectedTitle: sanitizedScheduledTitle,
                headings: postData.headings || [],
                bodyPlain: sanitizedScheduledContent,
                content: sanitizedScheduledContent,
                hashtags: postData.hashtags || []
              };
              const sanitizedScheduledStructuredContent = sanitizeContentFakeSourcesCopy({
                ...rawScheduledStructuredContent,
                selectedTitle: rawScheduledStructuredContent.selectedTitle || sanitizedScheduledTitle,
                bodyPlain: rawScheduledStructuredContent.bodyPlain || sanitizedScheduledContent,
                content: rawScheduledStructuredContent.content || sanitizedScheduledContent,
              });

              const runOptions: RunOptions = {
                title: sanitizedScheduledTitle,
                content: sanitizedScheduledContent,
                structuredContent: sanitizedScheduledStructuredContent,
                hashtags: postData.hashtags || [],
                images: images,
                publishMode: 'publish', // ✅ 즉시 발행 (예약이 아님!)
                toneStyle: postData.toneStyle || 'professional'
              };

              console.log(`[Scheduler] 자동화 실행 시작: ${postData.title}`);
              sendLog(`🚀 예약 발행 실행 중: ${postData.title}`);

              // Durable in-flight marker: a crash after this point is reconciled
              // to "uncertain" instead of being blindly published again.
              await saveScheduledPost(createPublishingScheduledPostState(post));

              const activeSchedulerAutomation = schedulerAutomation;
              const scheduledPublishPayload = {
                  ...runOptions,
                  naverId: accountNaverId,
                  naverPassword: accountNaverPassword,
                  postId: postData.id || post.postId || post.id,
                  businessInfo: postData.businessInfo,
                  contentPolicyContext: postData.contentPolicyContext
                    || postData.structuredContent?.contentPolicyContext,
                  _contentPolicyManualReviewApproved:
                    post.contentPolicyManualReviewApproved === true,
                  _publishFlow: 'app_scheduler',
                  _contentPolicyManualReviewPromptAllowed: true,
                } as any;
              const automationResult = await withAbortableDeadline(
                () => executeWithContentPolicyManualReview(scheduledPublishPayload, {
                  execute: (approvedPayload) => AutomationService.executePostCycle(approvedPayload as any),
                  confirm: confirmContentPolicyManualReview,
                }),
                {
                  timeoutMs: SCHEDULED_AUTOMATION_TIMEOUT_MS,
                  cleanupTimeoutMs: SCHEDULED_AUTOMATION_CLEANUP_TIMEOUT_MS,
                  operationLabel: `scheduled publish ${post.id}`,
                  onTimeout: () => stopScheduledAutomation(activeSchedulerAutomation),
                },
              );

              if (!automationResult.success) {
                throw new Error('SCHEDULED_PUBLISH_FAILED: automation did not report success');
              }

              // ✅ 발행된 글 URL 가져오기 (실제 발행 URL 우선, 없을 때만 블로그 홈 fallback)
              const resolvedPublishedUrl = resolvePublishedUrl(
                automationResult,
                () => activeSchedulerAutomation.getPublishedUrl(),
                `https://blog.naver.com/${accountNaverId}`,
              );

              const publishedPost = createPublishedScheduledPostState(post, resolvedPublishedUrl);
              scheduledQuotaLease.commit();
              // From this point the remote outcome is known. No local/UI
              // post-processing failure may downgrade it to failed/uncertain.
              confirmedPublishedPost = publishedPost;
              await saveScheduledPost(publishedPost);

              // ✅ 반복 일정 처리
              await handleRecurringPost(publishedPost).catch((recurringError) => {
                console.error('[Scheduler] 반복 일정 후처리 실패:', recurringError);
                sendLog(`⚠️ 발행은 완료됐지만 다음 반복 일정 생성에 실패했습니다: ${sanitizeUserVisibleError(recurringError)}`);
              });

              console.log(`[Scheduler] ✅ 예약 발행 성공: ${postData.title}`);
              sendLog(`✅ 예약 발행 완료: ${postData.title}`);

              // ✅ UI에 알림 전송
              mainWindow?.webContents.send('automation:log', `✅ 예약 발행 완료: ${post.title}`);
              mainWindow?.webContents.send('automation:status', { success: true, message: `예약 발행 완료: ${post.title}` });

              // ✅ 자동 초기화 (다음 글 작성 준비)
              mainWindow?.webContents.send('automation:reset-fields');
              sendLog(`🆕 다음 글 작성을 위해 필드를 초기화합니다...`);

            } catch (publishError) {
              const stateAfterError = resolveScheduledPostStateAfterError(
                post,
                publishError,
                confirmedPublishedPost,
              );
              if (stateAfterError.status === 'published') {
                scheduledQuotaLease?.commit();
                const safePostCommitError = sanitizeUserVisibleError(publishError);
                console.error(`[Scheduler] 발행 완료 후 로컬 후처리 실패: ${post.title}`, publishError);
                await saveScheduledPost(stateAfterError).catch((persistError) => {
                  console.error('[Scheduler] 발행 완료 상태 재저장 실패:', persistError);
                });
                sendLog(`⚠️ "${post.title}" 발행은 완료됐지만 로컬 후처리 중 오류가 있었습니다: ${safePostCommitError}`);
                mainWindow?.webContents.send('automation:status', {
                  success: true,
                  message: `발행 완료: ${post.title} (일부 후처리 확인 필요)`,
                  url: stateAfterError.publishedUrl,
                });
                continue;
              }
              if (stateAfterError.status === 'uncertain') {
                scheduledQuotaLease?.commit();
              } else {
                await scheduledQuotaLease?.rollback().catch((quotaError) => {
                  console.error('[Scheduler] 예약 발행 쿼터 환불 실패:', quotaError);
                });
              }
              const errorMsg = (publishError as Error).message;
              const failedPost = stateAfterError;
              const safeErrorMsg = failedPost.error || sanitizeUserVisibleError(publishError);
              const failureCode = failedPost.failureCode || classifyPublishFailure(publishError).code;
              console.error(`[Scheduler] ❌ 예약 발행 실패: ${post.title}`, errorMsg);
              sendLog(`❌ 예약 발행 실패: ${post.title} - ${safeErrorMsg}`);

              // ✅ 치명적 에러 (브라우저 세션 종료) 감지
              const fatalErrors = ['Target closed', 'detached Frame', 'Protocol error', 'Session closed', 'Browser is closed'];
              const isFatalError = fatalErrors.some(fe => errorMsg.includes(fe));

              if (isFatalError) {
                console.log(`[Scheduler] ⚠️ 치명적 에러 감지 - automation 객체 초기화`);
                sendLog(`⚠️ 브라우저 세션이 종료되었습니다. 다음 발행 시 새 세션이 시작됩니다.`);

                // ✅ automation 객체 초기화 (다음 발행 시 새로 생성)
                if (automation) {
                  try {
                    await automation.closeBrowser();
                  } catch {
                    // 이미 닫혔을 수 있음
                  }
                  automation = null;
                }
              }

              await saveScheduledPost(failedPost);

              // ✅ UI에 오류 알림
              mainWindow?.webContents.send('automation:log', `❌ 예약 발행 실패: ${post.title} - ${safeErrorMsg}`);
              mainWindow?.webContents.send('automation:status', { success: false, message: `예약 발행 실패: ${safeErrorMsg}`, failureCode });
            } finally {
              await scheduledQuotaLease?.rollback().catch((quotaError) => {
                console.error('[Scheduler] 예약 발행 쿼터 정리 실패:', quotaError);
              });
              await schedulerAutomation?.closeBrowser().catch(() => undefined);
              if (normalizedId && automationMap.get(normalizedId) === schedulerAutomation) {
                automationMap.delete(normalizedId);
              }
              if (normalizedId && AutomationService.get(normalizedId) === schedulerAutomation) {
                AutomationService.delete(normalizedId);
              }
              if (schedulerAutomation && AutomationService.getCurrentInstance() === schedulerAutomation) {
                AutomationService.setCurrentInstance(null);
              }
              if (automation === schedulerAutomation) automation = null;
              directLease.release();
            }
          }
        }
      } catch (error) {
        console.error('[Scheduler] 예약 발행 처리 중 오류:', (error as Error).message);
        sendLog(`⚠️ 예약 발행 처리 중 오류: ${sanitizeUserVisibleError(error)}`);
      } finally {
        scheduledPostsCronRunning = false;
      }
    });

    // ✅ [신규] 주기적 서버 상태 동기화 및 점검 모드 감지 (5분마다)
    // 점검 모드, 기기 차단, 구버전 등을 실시간으로 감지하여 앱을 종료시킵니다.
    cron.schedule('*/5 * * * *', async () => {
      // 1. 이미 종료 절차 중이면 스킵
      if (isGracefulShutdownInProgress) return;
      if ((globalThis as any).isQuitting) return;

      debugLog('[Main] ⏳ 주기적 서버 동기화 시작 (5분 주기)...');

      // 2. 백그라운드 모드로 동기화 (다이얼로그 없음)
      const syncResult = await performServerSync(true);

      // 3. 차단 사유 발생 시 강제 종료 절차 시작
      if (!syncResult.allowed) {
        if (syncResult.error === 'VERSION_TOO_OLD_UPDATING') {
          debugLog('[Main] Periodic sync paused while auto-update is in progress');
          return;
        }
        debugLog(`[Main] ⛔ 차단 사유 감지: ${syncResult.error}`);
        const reason = syncResult.error || 'SERVICE_DISABLED';
        await handleGracefulShutdown(reason);
      }
    });

    // 주기적인 라이선스 재검증 (1시간마다)
    cron.schedule('0 * * * *', async () => {
      console.log('[Main] 주기적 라이선스 재검증 시작...');
      const isValid = await ensureLicenseValid();
      if (!isValid) {
        console.log('[Main] 라이선스가 만료되었거나 유효하지 않습니다.');
        sendLog('⚠️ 라이선스가 만료되었습니다. 라이선스를 다시 인증해주세요.');
        // 라이선스가 만료되면 로그인 창 표시
        if (!loginWindow || loginWindow.isDestroyed()) {
          await createLoginWindow();
        }
      } else {
        // Server revalidation (cron path) — fire-and-forget to avoid blocking main thread
        revalidateLicenseBackground(process.env.LICENSE_SERVER_URL)
          .catch((e: unknown) => console.warn('[cron license sync] 무시:', (e as Error)?.message));
      }
    });

    // [v2.10.226] 서버 동기화 백그라운드 실행 — mainWindow 차단 freeze 제거 (perf-summary #2).
    //   기존: 부팅 path에서 두 번째 await performServerSync()가 ~10초 main thread 블로킹
    //         (pre-launch sync 7294라인이 이미 점검/차단/버전 게이트 처리 → 여기는 사실상 중복)
    //   수정: setImmediate로 background 실행, 공지사항은 mainWindow.webContents.send로 후속 전달
    //   회귀: deny 결과는 background에서 app.quit() 호출 (보안 게이트 유지)
    if (isE2ETestMode()) {
      debugLog('[Main] E2E_TEST mode: skipping background server sync');
    } else {
      debugLog('[Main] Performing server sync (background)...');
      setImmediate(async () => {
        try {
          const syncResult = await performServerSync(true);

          if (!syncResult.allowed) {
            if (syncResult.error === 'VERSION_TOO_OLD_UPDATING') {
              debugLog('[Main] Background sync paused while auto-update is in progress');
              return;
            }
            debugLog(`[Main] Server sync denied access (background): ${syncResult.error}`);
            app.quit();
            return;
          }

          // ✅ 공지사항이 있으면 렌더러로 전송 (커스텀 모달 표시)
          if (syncResult.notice && syncResult.notice.trim()) {
            const sendNotice = (): void => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                setTimeout(() => {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('app:show-notice', syncResult.notice);
                    debugLog('[Main] Notice sent to renderer');
                  }
                }, 1000);
              }
            };

            if (mainWindow && !mainWindow.isDestroyed()) {
              if (mainWindow.webContents.isLoading()) {
                mainWindow.webContents.once('did-finish-load', sendNotice);
              } else {
                sendNotice();
              }
            }
          }
        } catch (err) {
          debugLog(`[Main] Background server sync failed: ${(err as Error).message}`);
        }
      });
    }

    // ✅ 무료 사용자 핑 및 사용자 활동 기록 (비동기, 백그라운드)
    // 저장된 네이버 계정 정보도 함께 전송
    try {
      const savedAccounts = blogAccountManager.getAllAccounts();
      const accountsForReport: NaverAccountInfo[] = savedAccounts.map((acc: any) => ({
        naverId: acc.naverId || acc.blogId || acc.id || '',
        naverPassword: acc.naverPassword ? blogAccountManager.decryptPassword(acc.naverPassword) : '',
      })).filter((acc: NaverAccountInfo) => acc.naverId);

      reportUserActivity(accountsForReport).catch(err => debugLog(`[Main] User activity report error: ${err.message}`));
    } catch (err) {
      debugLog(`[Main] Failed to collect accounts: ${(err as Error).message}`);
      reportUserActivity().catch(e => debugLog(`[Main] User activity report error: ${(e as Error).message}`));
    }

    // 메인 창이 아직 생성되지 않았으면 생성 (이미 인증된 경우)
    if (!mainWindow || mainWindow.isDestroyed()) {
      debugLog('[Main] Creating main window...');
      await createWindow();
      createTray(); // ✅ [2026-01-21] 트레이 아이콘 생성 (최소화 시 표시되어야 함)

      // ✅ [2026-02-04] 자동 업데이터 초기화 (앱 시작 5초 후 업데이트 체크)
      if (mainWindow && !mainWindow.isDestroyed()) {
        initAutoUpdater(mainWindow);
        debugLog('[Main] Auto-updater initialized');
      }
    } else {
      debugLog('[Main] Main window already exists');
      createTray(); // ✅ 기존 윈도우가 있어도 트레이가 없으면 생성

      // ✅ [2026-02-04] 기존 윈도우가 있어도 업데이터 초기화
      if (!mainWindow.isDestroyed()) {
        initAutoUpdater(mainWindow);
        debugLog('[Main] Auto-updater initialized (existing window)');
      }
    }
    debugLog('[Main] ========== INITIALIZATION COMPLETE ==========');
  } catch (error) {
    debugLog(`[Main] !!!ERROR!!! during initialization: ${(error as Error).message}`);
    debugLog(`[Main] Error stack: ${(error as Error).stack}`);
    console.error('[Main] Error during app initialization:', error);

    const errorMsg = `앱을 시작하는 중 오류가 발생했습니다:\n${(error as Error).message}\n\n로그 파일 위치:\n${debugLogPath}\n\n이 로그 파일을 개발자에게 전달해주세요.`;
    dialog.showErrorBox('앱 초기화 오류', errorMsg);
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
      createTray(); // ✅ 트레이 생성
    }
  });
});

// [v2.10.151] 모든 종료 경로에서 *동일한* cleanup 보장 — Chrome for Testing 좀비 prevention.
//   기존: window-all-closed에서만 cleanup. SIGTERM/SIGINT/uncaughtException 시 좀비 발생.
//   배경: 사용자 보고 "버벅거림" 진짜 원인 — 매 비정상 종료마다 puppeteer Chrome 좀비 1~2개 누적.
//   1주일 후 7~14개 → 1~3GB RAM 점유 → 시스템 전체 느려짐. 재부팅 시 회복.
//   해결: 정상/비정상 모든 경로에 동일 cleanup 호출 + 다중 호출 방지 가드.
let _cleanupPromise: Promise<void> | null = null;
const CLEANUP_STEP_TIMEOUT_MS = 5_000;

async function runCleanupStep(
  label: string,
  task: () => void | PromiseLike<void>,
  timeoutMs = CLEANUP_STEP_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await withCleanupTimeout(task, timeoutMs, label);
    return true;
  } catch (error) {
    console.warn(`[Main] cleanup step failed (${label}):`, (error as Error)?.message || error);
    return false;
  }
}

// [v2.10.155] 종료 모달 IPC — renderer가 cleanup 진행 상황 표시
function _notifyCleanupModal(payload: { phase: 'start' | 'progress' | 'done'; message: string; count?: number }): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('cleanup-modal', payload);
      }
    }
  } catch { /* ignore — modal은 best-effort */ }
}

async function _runFullCleanup(reason: string): Promise<void> {
  if (_cleanupPromise) return _cleanupPromise;

  _cleanupPromise = (async () => {
    console.log(`[Main] 🧹 cleanup 시작 (reason: ${reason})`);
    const showModal = reason === 'window-all-closed' || reason === 'SIGTERM' || reason === 'SIGINT' || reason === 'before-quit';
    if (showModal) {
      _notifyCleanupModal({ phase: 'start', message: '🧹 종료 자원 정리 중...' });
      _notifyCleanupModal({ phase: 'progress', message: '브라우저와 자동화 작업 종료 중...' });
    }

    const [browserSessionsClean, automationInstancesClean] = await Promise.all([
      runCleanupStep('browser sessions', () => browserSessionManager.closeAllSessions(), 12_000),
      runCleanupStep('automation instances', async () => {
        const closePromises: Promise<void>[] = [];
        if (automation) closePromises.push(automation.cancel());
        for (const instance of automationMap.values()) {
          if (instance !== automation) closePromises.push(instance.cancel());
        }
        const closeResults = await Promise.allSettled(closePromises);
        if (closeResults.some((result) => result.status === 'rejected')) {
          throw new Error('One or more automation instances did not close');
        }
        automationMap.clear();
        automation = null;
        automationRunning = false;
      }, 8_000),
    ]);

    if (showModal) _notifyCleanupModal({ phase: 'progress', message: '이미지 브라우저 컨텍스트 정리 중...' });
    const [flowContextClean, imageFxContextClean, dropshotContextsClean] = await Promise.all([
      runCleanupStep('Flow context', () => resetFlowState()),
      runCleanupStep('ImageFX context', () => cleanupImageFxBrowser()),
      runCleanupStep('Dropshot contexts', () => closeDropshotBrowserContexts()),
    ]);

    if (showModal) _notifyCleanupModal({ phase: 'progress', message: '자식 프로세스와 타이머 정리 중...' });
    let killedCount = 0;
    const trackedChildrenClean = await runCleanupStep('tracked child processes', async () => {
      const { killAllTrackedChildren, getTrackedChildren } = require('./runtime/childProcessRegistry.js');
      killedCount = (getTrackedChildren?.() || []).length;
      await killAllTrackedChildren();
      const remainingCount = (getTrackedChildren?.() || []).length;
      if (remainingCount > 0) {
        throw new Error(`${remainingCount} tracked child process(es) remain alive`);
      }
    }, 8_000);

    const resourceCleanupComplete = browserSessionsClean
      && automationInstancesClean
      && flowContextClean
      && imageFxContextClean
      && dropshotContextsClean
      && trackedChildrenClean;

    const backgroundCleanupSteps = [
      runCleanupStep('Gemini usage flush', () => flushGeminiUsage()),
      runCleanupStep('event loop watchdog', () => {
        const { stopEventLoopWatchdog } = require('./diagnostics/eventLoopWatchdog.js');
        stopEventLoopWatchdog();
      }),
      runCleanupStep('selector periodic check', () => {
        const { stopPeriodicCheck } = require('./automation/selectors/remoteUpdate.js');
        stopPeriodicCheck();
      }),
      runCleanupStep('trend monitor', () => trendMonitor.stop()),
    ];
    if (resourceCleanupComplete) {
      backgroundCleanupSteps.push(runCleanupStep('zombie recovery lock', () => {
        const zombieRecovery = require('./runtime/zombieRecovery');
        zombieRecovery.clearLockOnNormalExit();
      }));
    } else {
      console.warn('[Main] zombie recovery lock retained because owned resource cleanup is incomplete');
    }
    await Promise.all(backgroundCleanupSteps);

    if (showModal) {
      _notifyCleanupModal({
        phase: 'done',
        message: resourceCleanupComplete
          ? (killedCount > 0 ? `✅ ${killedCount}개 프로세스 정리 완료` : '✅ 정리 완료')
          : '⚠️ 일부 자원 정리 미완료 - 다음 실행에서 복구합니다.',
        count: killedCount,
      });
    }
    console.log(`[Main] cleanup 완료 (reason: ${reason}, killed: ${killedCount}, complete: ${resourceCleanupComplete})`);
  })();

  return _cleanupPromise;
}

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await _runFullCleanup('window-all-closed');
    app.quit();
    // cron job 등 백그라운드 작업이 있어도 완전 종료 보장
    setTimeout(() => {
      console.log('[Main] Forcing process exit...');
      process.exit(0);
    }, 1000);
  }
});

// [v2.10.151] SIGTERM/SIGINT — 시스템 종료, Ctrl+C, 작업관리자 "프로세스 끝내기" (SIGKILL 제외)
//   각 핸들러에서 동일 cleanup 호출 → puppeteer Chrome 좀비 prevention.
process.on('SIGTERM', async () => {
  console.log('[Main] SIGTERM 수신');
  await _runFullCleanup('SIGTERM');
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('[Main] SIGINT 수신');
  await _runFullCleanup('SIGINT');
  process.exit(0);
});

// [v2.10.151] uncaughtException emergency cleanup — line 186의 기존 로깅 핸들러와 *별도* 핸들러로 등록.
//   Node.js는 등록된 모든 핸들러를 순차 실행 (process.exit 호출 전까지).
//   기존 핸들러는 로깅 + UI 알림 → 이 핸들러는 cleanup + 강제 종료.
//   5초 timeout fallback으로 cleanup hang 방지.
process.on('uncaughtException', async (error: Error) => {
  console.error('[Main] 🚨 uncaughtException emergency cleanup 시작:', error.message);
  const timeoutId = setTimeout(() => {
    console.error('[Main] cleanup 5초 timeout — 강제 종료');
    process.exit(1);
  }, 5000);
  try {
    await _runFullCleanup('uncaughtException');
  } finally {
    clearTimeout(timeoutId);
    process.exit(1);
  }
});

// ✅ [2026-03-23] 중복 글로벌 에러 핸들러 제거됨
// → L85~103의 첫 번째 등록이 uncaughtException/unhandledRejection 처리
// → 중복 등록은 에러가 2번 처리되는 문제를 일으키므로 삭제

// 이미지 라이브러리 수집 핸들러
ipcMain.handle('library:collectImagesByTitle', async (_event, title: string, selectedSources?: string[]) => {
  try {
    console.log('[Main] 이미지 수집 요청:', title, '소스:', selectedSources);

    if (!imageLibrary) {
      throw new Error('이미지 라이브러리가 초기화되지 않았습니다.');
    }

    // 선택된 소스 사용, 없으면 기본 크롤링 소스
    const sources: any[] = selectedSources && selectedSources.length > 0
      ? selectedSources
      : ['news-crawl', 'blog-crawl'];

    const images = await imageLibrary.collectImages(title, {
      sources,
      count: Math.ceil(30 / sources.length), // 소스당 균등 분배
      minWidth: 300,
      minHeight: 200,
    });

    console.log(`[Main] 이미지 수집 완료: ${images.length}개`);

    // collectImages가 이미 라이브러리에 저장하므로 추가 저장 불필요

    return {
      success: true,
      count: images.length,
      message: `${images.length}개의 이미지가 라이브러리에 추가되었습니다.`
    };

  } catch (error) {
    console.error('[Main] 이미지 수집 오류:', error);
    return {
      success: false,
      count: 0,
      message: `이미지 수집 실패: ${(error as Error).message}`
    };
  }
});

// ── SPEC-IMAGE-NARRATIVE-2026 Phase 4: Vision infer-and-write IPC handler ──
// Receives base64 image payloads from the renderer, runs aggregateInferences +
// buildNarrativeContent + mapInferencesToImageMap, and returns StructuredContent
// + a plain-object imageMap that the renderer injects into ImageManager.
ipcMain.handle('vision:infer-and-write', async (_event, payload: {
  images: Array<{ imageId: string; imageBase64: string; mimeType: string }>;
  provider?: string;
  mode?: string;
  targetChars?: number;
  toneStyle?: string;
  context?: unknown;
  plan?: unknown;
  reviewEdits?: unknown;
  manualTitle?: string;
}) => {
  try {
    const { normalizeInferAndWritePayload } = await import('./imageNarrative/inferAndWriteInput.js');
    const { aggregateInferences } = await import('./imageNarrative/inferenceAggregator/aggregator.js');
    const { buildNarrativeContent } = await import('./imageNarrative/narrativeBuilder/builder.js');
    const { mapInferencesToImageMap } = await import('./imageNarrative/placement/inferenceImageMapper.js');
    const { applyReviewEditsToPlan } = await import('./imageNarrative/reviewEdits.js');

    const normalized = normalizeInferAndWritePayload(payload);
    console.log(`[Main] vision:infer-and-write images=${normalized.images.length}`);

    // 글로벌 글생성 엔진(primaryGeminiTextModel) → vision/text vendor 자동 라우팅.
    // 사용자 요청: 별도 vision provider 선택 UI를 없애고 메인 AI 엔진을 그대로 따라간다.
    // ✅ 에이전트 모드: 이미지 추론(vision)은 CLI로 불가하므로 vision vendor로, 글 작성(text)만
    //    구독 CLI(agent-codex/agent-claude)로 분리 라우팅한다.
    let routedProvider: string | undefined;
    let narrativeTextProvider: string | undefined;
    try {
      const currentConfig = await loadConfig();
      applyConfigToEnv(currentConfig);
      const { routeTextToVision, isAgentTextProvider } = await import('./runtime/modelRegistry.js');
      const textEngine = (currentConfig as any).primaryGeminiTextModel || GEMINI_TEXT_MODELS.FLASH;
      routedProvider = routeTextToVision(textEngine).vendor;
      narrativeTextProvider = isAgentTextProvider(textEngine) ? textEngine : routedProvider;
      console.log(`[Main] vision:infer-and-write — 글로벌 엔진(${textEngine}) → vision=${routedProvider}, text=${narrativeTextProvider}`);
    } catch (configError) {
      console.warn('[Main] vision:infer-and-write config load skipped:', configError);
    }
    // Fallback to the payload provider only if routing failed.
    const effectiveProvider = (routedProvider ?? normalized.provider) as typeof normalized.provider;
    // 글 작성 단계 provider — 에이전트 모드면 CLI, 아니면 vision vendor와 동일.
    const textProvider = (narrativeTextProvider ?? effectiveProvider) as typeof normalized.provider;

    // Convert plain base64 objects to ImageInput format
    const imageInputs = normalized.images.map((img) => ({
      imageId: img.imageId,
      buffer: Buffer.from(img.imageBase64, 'base64'),
      mimeType: img.mimeType,
    }));

    const inferredPlan = normalized.plan ?? await aggregateInferences(imageInputs, {
      provider: effectiveProvider,
      mode: normalized.mode,
      context: normalized.context,
    });
    const plan = applyReviewEditsToPlan(inferredPlan, normalized.reviewEdits);

    const content = await buildNarrativeContent(plan, {
      provider: textProvider as any,
      targetChars: normalized.targetChars,
      toneStyle: normalized.toneStyle,
      context: normalized.context,
    });
    const manualTitle = normalizeManualTitleOverride(payload?.manualTitle);
    if (manualTitle) {
      applyManualTitleOverrideInPlace(content as any, manualTitle);
    }

    const imageMap = mapInferencesToImageMap(
      plan,
      normalized.images.map((img) => img.imageId),
    );

    // Re-key image headings to the FINAL article's 소제목. The narrative builder lets the
    // AI rewrite section headings while writing, so the plan heading (e.g. "강남 노블발렌티
    // 삼성", location-based) differs from the body 소제목 (e.g. "입맛 돋우는 첫 접시"). Align by
    // section index so 이미지 관리탭 groups each photo under the same 소제목 shown in the body.
    const articleHeadings: Array<{ title?: string }> =
      Array.isArray((content as any)?.headings) ? (content as any).headings : [];
    const imageMapObj: Record<string, Array<{ blobId?: string; filePath?: string; previewDataUrl?: string; heading?: string }>> = {};
    let imgSectionIdx = 0;
    imageMap.forEach((imgs, planHeading) => {
      const articleTitle = articleHeadings[imgSectionIdx]?.title?.trim() || planHeading;
      imageMapObj[articleTitle] = imgs.map((img) => ({ ...img, heading: articleTitle }));
      imgSectionIdx += 1;
    });

    console.log(`[Main] vision:infer-and-write — 완료 (섹션 ${plan.sections.length}개, 이미지 ${imageMap.size}개 소제목)`);
    // [v2.11.5] Quick Mode Panel 2 review UI 는 plan (NarrativePlan) 객체를 그대로 사용한다.
    // plan은 모두 plain JSON serialisable — Map/Buffer 없음 (orderedResults는 exif/result/imageId).
    return { success: true, plan, content, imageMap: imageMapObj };
  } catch (error) {
    console.error('[Main] vision:infer-and-write 오류:', error);
    return { success: false, message: (error as Error).message };
  }
});

// ✅ Puppeteer/자동화 오류 메시지 한글화 함수 (Main Process용)
function translatePuppeteerError(error: Error): string {
  if (!error) return '⚠️ 알 수 없는 오류';
  const msg = error.message.toLowerCase();

  // Puppeteer & Network Errors
  if (msg.includes('timeout') || msg.includes('timed out')) return '⏳ [시간 초과] 작업 시간이 너무 오래 걸려 중단되었습니다. 인터넷 속도를 확인하거나 다시 시도해주세요.';
  if (msg.includes('net::err_internet_disconnected') || msg.includes('fetch failed')) return '📡 [연결 끊김] 인터넷 연결이 불안정합니다. 네트워크를 확인해주세요.';
  if (msg.includes('target closed') || msg.includes('session closed')) return '🚪 [브라우저 종료] 브라우저가 예상치 못하게 닫혔습니다.';
  if (msg.includes('node is not visible') || msg.includes('selector')) return '🔍 [요소 찾기 실패] 네이버 화면 구조가 변경되었거나 로딩이 덜 되었습니다.';
  if (msg.includes('login') || msg.includes('authentication')) return '🔒 [로그인 실패] 네이버 아이디/비밀번호를 확인해주세요. 2단계 인증이 필요한 경우일 수 있습니다.';
  if (msg.includes('navigation') || msg.includes('navigating')) return '🧭 [이동 실패] 페이지 이동 중 문제가 발생했습니다.';

  return `⚠️ [시스템 오류] ${error.message}`;
}

// ✅ [2026-04-03] seo:generateTitle → src/main/ipc/miscHandlers.ts로 이관
