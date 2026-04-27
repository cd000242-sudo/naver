import { app, BrowserWindow, dialog, ipcMain, nativeImage, NativeImage, shell, Notification, Tray, Menu } from 'electron';
import path from 'path';
import dotenv from 'dotenv';

// ✅ [2026-04-03] 앱 시작 디버그 로그 (silent crash 진단용)
try {
  const _fs = require('fs');
  const debugPath = path.join(process.env.TEMP || '/tmp', 'bln-startup-debug.log');
  _fs.writeFileSync(debugPath, `[${new Date().toISOString()}] App starting...\napp: ${typeof app}\nipcMain: ${typeof ipcMain}\nisPackaged: ${app?.isPackaged}\nprocess.type: ${process.type}\n`);
} catch(e) { /* ignore */ }
import cron from 'node-cron';
import { NaverBlogAutomation, RunOptions, type PublishMode, type AutomationImage } from './naverBlogAutomation.js';
import { generateImages, resetAllImageState } from './imageGenerator.js';
import { generateEnglishPromptMain } from './main/utils/mainPromptInference.js';
// (stabilityGenerator removed - deprecated provider)
import { convertMp4ToGif } from './image/gifConverter.js'; // ✅ 추가
import type { GenerateImagesOptions, GeneratedImage } from './imageGenerator.js';
import { getDailyLimit, getTodayCount, incrementTodayCount, setDailyLimit } from './postLimitManager.js';
import { generateStructuredContent, removeOrdinalHeadingLabelsFromBody } from './contentGenerator.js';
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
import { KeywordAnalyzer, type KeywordCompetition, type BlueOceanKeyword } from './analytics/keywordAnalyzer.js';
import { BestProductCollector } from './services/bestProductCollector.js';
import { InternalLinkManager, type InternalLink } from './content/internalLinkManager.js';
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
  syncWithServer,
  sendFreePing,
  reportNaverAccounts,
  compareVersions,
  type SyncResult,
  type NaverAccountInfo,
} from './licenseManager.js';
import * as XLSX from 'xlsx';
import fs from 'fs/promises';
import { loadScheduledPosts, saveScheduledPost, removeScheduledPost, getAllScheduledPosts, handleRecurringPost, rescheduleScheduledPost, retryScheduledPost as retryScheduledPostFn, type ScheduledPost } from './scheduledPostsManager.js';
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

// ✅ [리팩토링] 새로운 모듈화된 유틸리티 및 서비스
// ✅ [리팩토링] 새로운 모듈화된 유틸리티 및 서비스
import { Logger, debugLog as newDebugLog, sanitizeFileName as utilSanitizeFileName, ensureMp4Dir as utilEnsureMp4Dir, ensureHeadingMp4Dir as utilEnsureHeadingMp4Dir, getUniqueMp4Path as utilGetUniqueMp4Path, validateLicenseAndQuota, validateLicenseOnly } from './main/utils/index.js';
import * as AuthUtils from './main/utils/authUtils.js'; // ✅ 충돌 방지용 Namespace Import
import { AutomationService, injectDependencies as injectBlogExecutorDeps } from './main/services/index.js';
import { registerAllHandlers, registerAccountHandlers, registerAdminHandlers } from './main/ipc/index.js';
import { registerConfigHandlers } from './main/ipc/configHandlers.js';
import { registerContentHandlers } from './main/ipc/contentHandlers.js';
import { registerHeadingHandlers } from './main/ipc/headingHandlers.js';
import { registerLicenseHandlers } from './main/ipc/authHandlers.js';
import { registerQuotaHandlers } from './main/ipc/quotaHandlers.js';
import { registerApiHandlers } from './main/ipc/apiHandlers.js';
import { registerKeywordHandlers } from './main/ipc/keywordHandlers.js';
import { registerProductHandlers } from './main/ipc/productHandlers.js';
import { registerEngagementHandlers } from './main/ipc/engagementHandlers.js';
import { registerImageTableHandlers } from './main/ipc/imageTableHandlers.js';
import { WindowManager } from './main/core/WindowManager.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-01-20] 전역 에러 핸들러 - 예상치 못한 크래시 방지
// ✅ [2026-03-23] 강화: UI 알림 + 에러 카운팅 + 반복 에러 감지
// ═══════════════════════════════════════════════════════════════════════════════
let _globalErrorCount = 0;
const _recentErrors: string[] = [];

function notifyRendererOfError(errorType: string, message: string) {
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
  (ipcMain as any).handle = (channel: string, handler: (...args: any[]) => any) => {
    _originalIpcHandle(channel, async (event: any, ...args: any[]) => {
      try {
        return await handler(event, ...args);
      } catch (error) {
        const msg = (error as Error).message || '알 수 없는 오류';
        console.error(`[SafeIPC] ❌ "${channel}" 핸들러 에러: ${msg}`);
        console.error(`[SafeIPC] Stack:`, (error as Error).stack?.split('\n').slice(0, 3).join('\n'));
        return { success: false, message: `[${channel}] ${msg}`, error: msg };
      }
    });
  };
  console.log('[Stability] IPC 핸들러 글로벌 안전 래퍼 등록 완료');
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

// 디버그 로그 함수
function debugLog(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  // 콘솔에도 출력
  console.log(message);

  // 파일에 기록
  try {
    if (!debugLogPath) {
      const tempDir = require('os').tmpdir();
      debugLogPath = path.join(tempDir, 'better-life-naver-debug.log');
    }
    fsSync.appendFileSync(debugLogPath, logMessage, 'utf-8');
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
    if (syncResult.versionCheckEnabled !== false && syncResult.minVersion) {
      const currentVersion = app.getVersion();
      const versionCompare = compareVersions(currentVersion, syncResult.minVersion);

      if (versionCompare < 0) {
        debugLog(`[Main] performServerSync: 버전 낮음 (현재: ${currentVersion}, 최소: ${syncResult.minVersion})`);

        if (!isBackground) {
          // ✅ [2026-02-04] 개선된 업데이트 다이얼로그 - 다운로드 링크 포함
          const result = await dialog.showMessageBox({
            type: 'warning',
            title: '⬆️ 업데이트 필요',
            message: '최신 버전으로 업데이트해 주세요.',
            detail: `현재 버전: v${currentVersion}\n최소 요구 버전: v${syncResult.minVersion}\n\n아래 버튼을 눌러 최신 버전을 다운로드하세요.`,
            buttons: ['다운로드 페이지 열기', '나중에'],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
          });

          // '다운로드 페이지 열기' 버튼 클릭 시 GitHub 릴리스 페이지 열기
          if (result.response === 0) {
            await shell.openExternal('https://github.com/cd000242-sudo/naver/releases/latest');
          }
        }
        return { allowed: false, error: 'VERSION_TOO_OLD' };
      }
    }

    debugLog('[Main] performServerSync: 서버 동기화 성공');
    return { allowed: true, notice: syncResult.notice };

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
  contentMode?: 'seo' | 'affiliate'; // 콘텐츠 모드
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

function _writeToFile(level: string, msg: string): void {
  try {
    if (!_logFilePath) _initLogFile();
    if (!_logFilePath) return;
    const _fs = require('fs');
    const ts = new Date().toISOString();
    _fs.appendFileSync(_logFilePath, `[${ts}] [${level.toUpperCase()}] ${msg}\n`);
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
  _writeToFile(level, msg);

  // 2) 렌더러 DevTools로 전송 (가능하면)
  try {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return;
    win.webContents.send('main:console', { level, msg });
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

let appConfig: AppConfig = {};
const trendMonitor = new TrendMonitor();
const patternAnalyzer = new PatternAnalyzer();
const postAnalytics = new PostAnalytics(); // ✅ 발행 후 성과 추적
const smartScheduler = new SmartScheduler(); // ✅ 최적 시간 자동 예약 발행

// ✅ [2026-03-14 FIX] SmartScheduler 발행 콜백 설정 — 예약 시간 도달 시 실제 발행 실행
smartScheduler.setPublishCallback(async (post) => {
  console.log(`[SmartScheduler] 발행 콜백 실행: ${post.title}`);
  try {
    const config = await loadConfig();
    const naverId = config.savedNaverId || '';
    const naverPassword = config.savedNaverPassword || '';
    
    if (!naverId || !naverPassword) {
      throw new Error('네이버 계정 정보가 설정되지 않았습니다.');
    }
    
    sendLog(`🚀 SmartScheduler 예약 발행 시작: ${post.title}`);
    
    // 새 자동화 인스턴스 생성
    const schedulerBot = new NaverBlogAutomation({
      naverId,
      naverPassword,
      headless: false,
      slowMo: 50,
    }, (msg: string) => { console.log(msg); sendLog(msg); });
    
    await schedulerBot.run({
      title: post.title,
      content: post.keyword || post.title, // SmartScheduler는 키워드 기반이므로 keyword를 content로 전달
      publishMode: 'publish',
    });
    
    await schedulerBot.closeBrowser().catch(() => undefined);
    
    const publishedUrl = `https://blog.naver.com/${naverId}`;
    sendLog(`✅ SmartScheduler 예약 발행 완료: ${post.title}`);
    return publishedUrl;
  } catch (error) {
    console.error(`[SmartScheduler] 발행 콜백 실패:`, error);
    sendLog(`❌ SmartScheduler 예약 발행 실패: ${(error as Error).message}`);
    throw error;
  }
});
const keywordAnalyzer = new KeywordAnalyzer(); // ✅ 키워드 경쟁도 분석
const bestProductCollector = new BestProductCollector(); // ✅ 베스트 상품 자동 수집
const internalLinkManager = new InternalLinkManager(); // ✅ 자동 내부링크 삽입
const thumbnailGenerator = new ThumbnailGenerator(); // ✅ 썸네일 자동 생성
const blogAccountManager = new BlogAccountManager(); // ✅ 다중 블로그 관리
const titleABTester = new TitleABTester(); // ✅ AI 제목 A/B 테스트
const commentResponder = new CommentResponder(); // ✅ 댓글 자동 답글
const competitorAnalyzer = new CompetitorAnalyzer(); // ✅ 경쟁 블로그 분석
let monitorTask: Promise<void> | null = null;
let analyticsTask: Promise<void> | null = null;
let trendAlertEnabled = true; // ✅ 트렌드 알림 활성화 상태

// ✅ 트렌드 알림 콜백 설정
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
  mainWindow?.webContents.send('automation:log', message);
}

function sendStatus(status: { success: boolean; cancelled?: boolean; message?: string; url?: string }): void {
  mainWindow?.webContents.send('automation:status', status);
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
      mainWindow.webContents.send('automation:log', msg);
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
        backgroundThrottling: false, // ✅ 최소화 시에도 백그라운드 작업 계속 수행
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // preload 스크립트를 위해 필요할 수 있음
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
      title: '네이버 블로그 자동화',
      icon: resolveIconImage(),
    });

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
    await mainWindow.loadFile(htmlPath);
    console.log('[Main] HTML loaded successfully');

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
        setTimeout(() => process.exit(0), 10000);
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
    // 다이얼로그, 트레이, 알림 등으로 포커스를 잃은 후
    // 다시 클릭할 때 입력 필드가 즉시 반응하도록 보장
    mainWindow.on('focus', () => {
      mainWindow?.webContents.focus();
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
  const LEWORD_DOWNLOAD_DIR = path.join(process.env.LOCALAPPDATA || '', 'LEWORD');
  const LEWORD_EXE_NAME = 'LEWORD-Setup.exe';  // ✅ [2026-02-21] Portable → Setup exe로 변경
  const LEWORD_EXE_PATH = path.join(LEWORD_DOWNLOAD_DIR, LEWORD_EXE_NAME);
  const LEWORD_VERSION_FILE = path.join(LEWORD_DOWNLOAD_DIR, '.leword-version');

  // ✅ [2026-02-21] 기존 Portable.exe → Setup.exe 마이그레이션
  const oldPortablePath = path.join(LEWORD_DOWNLOAD_DIR, 'LEWORD-Portable.exe');
  if (!fs.existsSync(LEWORD_EXE_PATH) && fs.existsSync(oldPortablePath)) {
    try {
      fs.renameSync(oldPortablePath, LEWORD_EXE_PATH);
      console.log('[Main] 🔄 LEWORD Portable → Setup 파일명 마이그레이션 완료');
    } catch { /* ignore */ }
  }

  // ===== 설치된 LEWORD 경로 목록 (인스톨러가 설치하는 위치) =====
  const installedPaths = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'leword', 'LEWORD.exe'),
    'C:\\Program Files\\LEWORD\\LEWORD.exe',
    'C:\\Program Files (x86)\\LEWORD\\LEWORD.exe'
  ];

  // ===== 개발 환경 경로 (win-unpacked 등) =====
  const releaseDir = path.resolve(__dirname, '../../leword-app/release');
  const devPaths: string[] = [];
  try {
    const winUnpackedExe = path.join(releaseDir, 'win-unpacked', 'LEWORD.exe');
    if (fs.existsSync(winUnpackedExe)) devPaths.push(winUnpackedExe);
  } catch (e) { Logger.logDebug('system', 'LEWORD exe 탐색 실패 (win-unpacked)', { error: String(e) }); }
  try {
    if (fs.existsSync(releaseDir)) {
      const files = fs.readdirSync(releaseDir) as string[];
      const setupExe = files.find((f: string) => (f.startsWith('LEWORD-Setup-') || f.startsWith('LEWORD-Portable-')) && f.endsWith('.exe'));
      if (setupExe) devPaths.push(path.join(releaseDir, setupExe));
    }
  } catch (e) { Logger.logDebug('system', 'LEWORD setup exe 탐색 실패', { error: String(e) }); }

  // 0) 개발 환경이면 바로 실행
  const devExe = devPaths.find((p: string) => { try { return fs.existsSync(p); } catch { return false; } });
  if (devExe) {
    console.log(`[Main] ✅ LEWORD 실행 (개발): ${devExe}`);
    const child = spawn(devExe, [], { detached: true, stdio: 'ignore' });
    child.unref();
    return { success: true, message: 'LEWORD 앱이 실행되었습니다.' };
  }

  // 1) 저장된 버전 읽기 + GitHub 최신 버전 확인
  let localVersion = '';
  try { localVersion = fs.readFileSync(LEWORD_VERSION_FILE, 'utf-8').trim(); } catch (e) { Logger.logDebug('system', 'LEWORD 버전 파일 읽기 실패', { error: String(e) }); }

  let latestTag = '';
  try {
    mainWindow?.webContents.send('log-message', '🔄 LEWORD 최신 버전 확인 중...');
    latestTag = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve(''), 5000);
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
  } catch (e) { Logger.logWarn('system', 'LEWORD GitHub 최신 버전 확인 실패', e); }

  // 2) 이미 최신 버전이 설치되어 있으면 → 설치된 경로에서 바로 실행
  const isUpToDate = localVersion && (!latestTag || latestTag === localVersion);
  if (isUpToDate) {
    const installedExe = installedPaths.find((p: string) => { try { return fs.existsSync(p); } catch { return false; } });
    if (installedExe) {
      console.log(`[Main] ✅ LEWORD 최신 (${localVersion}), 설치 경로에서 실행: ${installedExe}`);
      mainWindow?.webContents.send('log-message', `✅ LEWORD ${localVersion} 실행 중...`);
      const child = spawn(installedExe, [], { detached: true, stdio: 'ignore' });
      child.unref();
      return { success: true, message: 'LEWORD 앱이 실행되었습니다.' };
    }
    // 버전 파일은 있지만 설치된 exe가 없으면 → 다운로드로 진행
    console.log('[Main] ⚠️ 버전 파일 있으나 설치된 LEWORD 없음 → 재설치 필요');
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
      const child = spawn(existingExe, [], { detached: true, stdio: 'ignore' });
      child.unref();
      return { success: true, message: 'LEWORD 앱이 실행되었습니다.' };
    }
    console.log('[Main] 📦 LEWORD 최초 설치');
  }

  // ===== 로컬에 없으면 → GitHub Releases에서 자동 다운로드 =====
  const isAutoUpdate = fs.existsSync(LEWORD_DOWNLOAD_DIR) && !fs.existsSync(LEWORD_EXE_PATH);
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

    // Portable exe 에셋 찾기
    // ✅ [2026-02-21] Setup exe 우선, Portable exe 폴백
    const asset = releaseInfo.assets?.find((a: any) =>
      a.name.startsWith('LEWORD-Setup') && a.name.endsWith('.exe')
    ) || releaseInfo.assets?.find((a: any) =>
      a.name.startsWith('LEWORD-Portable') && a.name.endsWith('.exe')
    );

    if (!asset) {
      console.error('[Main] ❌ GitHub Release에서 LEWORD exe를 찾을 수 없음');
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
    const child = spawn(LEWORD_EXE_PATH, [], { detached: true, stdio: 'ignore' });
    child.unref();
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

ipcMain.handle('media:listMp4Files', async (_event, payload: { dirPath: string }) => {
  try {
    const dirPath = payload?.dirPath;
    if (!dirPath) return { success: false, message: 'dirPath가 필요합니다.' };

    await fs.mkdir(dirPath, { recursive: true });

    const items = await fs.readdir(dirPath, { withFileTypes: true });
    const allFiles: Array<{ name: string; fullPath: string; mtime: number; size: number }> = [];

    // 1) 루트 mp4 폴더의 mp4
    for (const item of items) {
      if (item.isFile() && item.name.toLowerCase().endsWith('.mp4')) {
        const fullPath = path.join(dirPath, item.name);
        const stat = await fs.stat(fullPath);
        allFiles.push({ name: item.name, fullPath, mtime: stat.mtime.getTime(), size: stat.size });
      }
    }

    // 2) mp4/<heading>/ 하위 1단계 폴더의 mp4
    for (const item of items) {
      if (!item.isDirectory()) continue;
      const subDir = path.join(dirPath, item.name);
      let subItems: import('fs').Dirent[] = [];
      try {
        subItems = await fs.readdir(subDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const sub of subItems) {
        if (sub.isFile() && sub.name.toLowerCase().endsWith('.mp4')) {
          const fullPath = path.join(subDir, sub.name);
          const stat = await fs.stat(fullPath);
          allFiles.push({ name: `${item.name}/${sub.name}`, fullPath, mtime: stat.mtime.getTime(), size: stat.size });
        }
      }
    }

    allFiles.sort((a, b) => b.mtime - a.mtime);
    return { success: true, files: allFiles };
  } catch (error) {
    console.error('[Media] listMp4Files 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('media:convertMp4ToGif', async (_event, payload: { sourcePath: string; aspectRatio?: string }) => {
  try {
    const sourcePath = payload?.sourcePath;
    if (!sourcePath) {
      return { success: false, message: 'sourcePath가 필요합니다.' };
    }

    const pathModule = await import('path');
    const normalizedSource = sourcePath.replace(/\\/g, '/');
    const dir = pathModule.dirname(normalizedSource);
    const baseName = pathModule.basename(normalizedSource, pathModule.extname(normalizedSource));
    const gifPath = pathModule.join(dir, `${baseName}.gif`);

    // 이미 GIF가 존재하면 그대로 사용
    try {
      const fs = await import('fs/promises');
      const stat = await fs.stat(gifPath);
      if (stat.isFile() && stat.size > 1024) {
        return { success: true, gifPath };
      }
      try { await fs.unlink(gifPath); } catch (e) { Logger.logDebug('image', 'GIF 임시파일 삭제 실패', { error: String(e) }); }
    } catch (e) { Logger.logDebug('image', 'GIF 파일 stat 확인 실패', { error: String(e) }); }

    // ✅ 헬퍼 함수 사용 (중복 로직 제거 및 1:1 크롭 적용)
    // 720px 너비 기준
    const finalGifPath = await convertMp4ToGif(normalizedSource, {
      width: 720,
      fps: 20,
      aspectRatio: payload.aspectRatio
    });

    return { success: true, gifPath: finalGifPath };
  } catch (error) {
    console.error('[Media] convertMp4ToGif 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('media:createKenBurnsVideo', async (_event, payload: { imagePath: string; heading?: string; durationSeconds?: number; aspectRatio?: '16:9' | '9:16' | '1:1' | 'original' }) => {
  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseAndQuota('media', 1);
  if (!check.valid) return check.response;

  try {
    const rawPath = String(payload?.imagePath || '').trim();
    if (!rawPath) {
      return { success: false, message: 'imagePath가 필요합니다.' };
    }

    const durationSeconds = payload?.durationSeconds && payload.durationSeconds > 0 ? payload.durationSeconds : 6;
    const aspectRatio = payload?.aspectRatio || '1:1';
    const headingForSave = sanitizeFileName(String(payload?.heading || '').trim()) || 'AI-VIDEO';

    const ffmpegModule = await import('ffmpeg-static');
    const ffmpegPath = (ffmpegModule as any).default || (ffmpegModule as any);
    if (!ffmpegPath) {
      return { success: false, message: 'ffmpeg 실행 파일을 찾을 수 없습니다.' };
    }

    const { spawn } = await import('child_process');

    const isPortrait = aspectRatio === '9:16';
    const isSquare = aspectRatio === '1:1';
    const isOriginal = aspectRatio === 'original';

    let outW = 1280;
    let outH = 720;

    if (isSquare) {
      outW = 720;
      outH = 720;
    } else if (isPortrait) {
      outW = 720;
      outH = 1280;
    }

    const fps = 30;
    const frames = Math.max(30, Math.round(durationSeconds * fps));

    let filter = '';
    if (isOriginal) {
      // 원본 비율 유지 (짝수 크기 보정만 수행)
      filter = [
        `scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        `zoompan=z='if(eq(on,0),1.0,min(zoom+0.0015,1.08))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=hd720:fps=${fps}`,
        'format=yuv420p'
      ].join(',');
    } else {
      filter = [
        `scale=${outW}:${outH}:force_original_aspect_ratio=increase`,
        `crop=${outW}:${outH}`,
        `zoompan=z='if(eq(on,0),1.0,min(zoom+0.0015,1.08))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${outW}x${outH}:fps=${fps}`,
        'format=yuv420p',
      ].join(',');
    }

    const mp4Dir = await ensureHeadingMp4Dir(headingForSave);
    const { fullPath: outPath, fileName } = await getUniqueMp4Path(mp4Dir, headingForSave);

    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y',
        '-loop',
        '1',
        '-t',
        String(durationSeconds),
        '-i',
        rawPath,
        '-vf',
        filter,
        '-an',
        '-movflags',
        '+faststart',
        '-pix_fmt',
        'yuv420p',
        outPath,
      ];

      const proc = spawn(ffmpegPath as string, args, { windowsHide: true });
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });

    if (await isFreeTierUser()) {
      await consumeQuota('media', 1);
    }

    return { success: true, filePath: outPath, fileName };
  } catch (error) {
    console.error('[Media] createKenBurnsVideo 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('file:checkExists', async (_event, filePath: string) => {
  try {
    const fs = await import('fs/promises');
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('file:readDir', async (_event, dirPath: string) => {
  try {
    const fs = await import('fs/promises');
    return await fs.readdir(dirPath);
  } catch (error) {
    console.error('[File] readDir 실패:', error);
    return [];
  }
});

ipcMain.handle('file:deleteFolder', async (_event, folderPath: string) => {
  try {
    const fs = await import('fs/promises');
    // ✅ [2026-03-14] Windows long path prefix 적용 (260자 초과 경로 삭제 지원)
    let targetPath = folderPath;
    if (process.platform === 'win32' && !folderPath.startsWith('\\\\?\\')) {
      targetPath = '\\\\?\\' + folderPath.replace(/\//g, '\\');
    }
    await fs.rm(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
    return true;
  } catch (err1) {
    // ✅ 폴백: Windows rmdir 명령어 사용
    try {
      if (process.platform === 'win32') {
        const { execSync } = await import('child_process');
        execSync(`rmdir /s /q "${folderPath}"`, { timeout: 15000, windowsHide: true });
        return true;
      }
    } catch { /* ignore */ }
    console.error('[File] deleteFolder 실패:', folderPath, err1);
    return false;
  }
});

ipcMain.handle('file:deleteFile', async (_event, filePath: string) => {
  try {
    const fs = await import('fs/promises');
    await fs.rm(filePath, { force: true });
    return { success: true };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

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

// 폴더 읽기 (상세 정보 포함)
ipcMain.handle('file:readDirWithStats', async (_event, dirPath: string) => {
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    const results = await Promise.all(items.map(async (item) => {
      const fullPath = path.join(dirPath, item.name);
      try {
        const stats = await fs.stat(fullPath);
        return {
          name: item.name,
          isFile: item.isFile(),
          isDirectory: item.isDirectory(),
          size: stats.size,
          mtime: stats.mtime.getTime(),
          birthtime: stats.birthtime.getTime(),
          ctime: stats.ctime.getTime(),
        };
      } catch {
        return {
          name: item.name,
          isFile: item.isFile(),
          isDirectory: item.isDirectory(),
          size: 0,
          mtime: 0,
          birthtime: 0,
          ctime: 0,
        };
      }
    }));
    return results;
  } catch (error) {
    console.error('[File] readDirWithStats 실패:', error);
    return [];
  }
});

// 파일/폴더 정보 가져오기
ipcMain.handle('file:getStats', async (_event, filePath: string) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime.getTime(),
      birthtime: stats.birthtime.getTime(),
      ctime: stats.ctime.getTime(),
    };
  } catch {
    return null;
  }
});

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
  try {
    const imagesPath = path.join(app.getPath('userData'), 'images');
    await fs.mkdir(imagesPath, { recursive: true });

    // ✅ [2026-02-02] 카테고리 폴더도 함께 생성
    await initializeCategoryFolders();

    await shell.openPath(imagesPath);
    return { success: true, path: imagesPath };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

// 이미지 다운로드 및 저장
// ✅ [2026-02-02] category 파라미터 추가 - 카테고리별 폴더에 저장
ipcMain.handle('image:downloadAndSave', async (_event, imageUrl: string, heading: string, postTitle?: string, postId?: string, category?: string) => {
  try {
    const https = await import('https');
    const http = await import('http');
    const { URL, fileURLToPath } = await import('url');

    let buffer: Buffer;
    let ext = '.jpg';

    const trimmedUrl = String(imageUrl || '').trim();
    if (!trimmedUrl) {
      return { success: false, message: 'imageUrl이 비어있습니다.' };
    }

    // 1) data: URL 지원 (AI 생성 이미지가 dataURL로 오는 경우)
    if (/^data:/i.test(trimmedUrl)) {
      const m = trimmedUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
      if (!m) {
        return { success: false, message: '지원하지 않는 data URL 형식입니다.' };
      }
      const mime = m[1].toLowerCase();
      const base64 = m[2];
      buffer = Buffer.from(base64, 'base64');

      if (mime.includes('png')) ext = '.png';
      else if (mime.includes('jpeg')) ext = '.jpeg';
      else if (mime.includes('jpg')) ext = '.jpg';
      else if (mime.includes('webp')) ext = '.webp';
      else if (mime.includes('gif')) ext = '.gif';
      else ext = '.png';
    } else {
      const parsedUrl = new URL(trimmedUrl);

      // 2) file: URL 지원
      if (parsedUrl.protocol === 'file:') {
        const localFilePath = fileURLToPath(parsedUrl);
        buffer = await fs.readFile(localFilePath);
        ext = path.extname(localFilePath) || '.jpg';
      } else {
        // 3) http(s) 다운로드
        const client = parsedUrl.protocol === 'https:' ? https : http;
        buffer = await new Promise<Buffer>((resolve, reject) => {
          client.get(trimmedUrl, { timeout: 30000 }, (response: any) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
          }).on('error', reject);
        });
        ext = path.extname(parsedUrl.pathname) || '.jpg';
      }
    }

    const safeTitle = (postTitle || 'image').replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_').replace(/_+/g, '_').replace(/\.+$/g, '');
    const safeHeading = (heading || 'image').replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_').replace(/_+/g, '_').replace(/\.+$/g, '');
    const fileName = `${safeTitle}_${safeHeading}_${Date.now()}${ext}`;

    // ✅ [2026-02-02] 카테고리별 폴더에 저장
    const imagesBasePath = path.join(app.getPath('userData'), 'images');
    let imagesPath = imagesBasePath;

    if (category && category.trim()) {
      const safeCategory = category.replace(/[<>:"/\\|?*]/g, '_').trim();
      imagesPath = path.join(imagesBasePath, safeCategory);
      console.log(`[Main] 📂 카테고리 폴더에 이미지 저장: ${safeCategory}`);
    }

    await fs.mkdir(imagesPath, { recursive: true });
    const filePath = path.join(imagesPath, fileName);

    await fs.writeFile(filePath, buffer);
    const previewDataUrl = `data:image/${ext.slice(1)};base64,${buffer.toString('base64')}`;

    return { success: true, filePath, previewDataUrl, savedToLocal: filePath };
  } catch (error) {
    console.error('[Main] 이미지 다운로드 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

// URL에서 이미지 수집
ipcMain.handle('image:collectFromUrl', async (_event, url: string) => {
  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseAndQuota('media', 1);
  if (!check.valid) return check.response;

  try {
    // 간단한 이미지 URL 추출 (Puppeteer 없이)
    const https = await import('https');
    const http = await import('http');
    const { URL } = await import('url');

    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const html = await new Promise<string>((resolve, reject) => {
      client.get(url, { timeout: 30000 }, (response: any) => {
        let data = '';
        response.on('data', (chunk: string) => data += chunk);
        response.on('end', () => resolve(data));
        response.on('error', reject);
      }).on('error', reject);
    });

    // 이미지 URL 추출
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    const images: string[] = [];
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      const imgUrl = match[1];
      if (imgUrl.startsWith('http') && /\.(jpg|jpeg|png|gif|webp)/i.test(imgUrl)) {
        images.push(imgUrl);
      }
    }

    const result = { success: true, images: images.slice(0, 20) };
    if (result.success && (result.images?.length ?? 0) > 0 && (await isFreeTierUser())) {
      await consumeQuota('media', 1);
    }
    return result;
  } catch (error) {
    console.error('[Main] URL 이미지 수집 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

// ✅ [신규 + 2026-02-01 강화] 중복 및 저품질/비제품 이미지 필터링 함수
function filterDuplicateAndLowQualityImages(images: string[]): string[] {
  const seenBaseUrls = new Set<string>();
  const seenFileNames = new Set<string>();
  const seenNormalizedUrls = new Set<string>(); // ✅ [2026-02-27] 정규화된 URL 중복 체크
  const filtered: string[] = [];

  for (const img of images) {
    if (!img || typeof img !== 'string') continue;

    // 1. 저품질/비제품 이미지 키워드 필터링 (강화됨)
    const lowerImg = img.toLowerCase();
    const isLowQualityOrNonProduct =
      // 크기 관련
      lowerImg.includes('_thumb') ||
      lowerImg.includes('_small') ||
      lowerImg.includes('_s.') ||
      lowerImg.includes('50x50') ||
      lowerImg.includes('60x60') ||
      lowerImg.includes('80x80') ||
      lowerImg.includes('100x100') ||
      lowerImg.includes('120x120') ||
      lowerImg.includes('150x150') ||
      lowerImg.includes('type=f40') ||
      lowerImg.includes('type=f60') ||
      lowerImg.includes('type=f80') ||
      lowerImg.includes('type=f100') ||
      // 품질 관련
      lowerImg.includes('blur') ||
      lowerImg.includes('placeholder') ||
      lowerImg.includes('loading') ||
      lowerImg.includes('lazy') ||
      // 비제품 이미지 (아이콘, 로고, 배너)
      lowerImg.includes('/icon/') ||
      lowerImg.includes('/logo/') ||
      lowerImg.includes('/banner/') ||
      lowerImg.includes('/badge/') ||
      lowerImg.includes('_icon') ||
      lowerImg.includes('_logo') ||
      lowerImg.includes('_banner') ||
      lowerImg.includes('_badge') ||
      // ✅ [2026-02-01 추가] 배찌/마크/제휴 관련
      lowerImg.includes('reviewmania') ||
      lowerImg.includes('review_mania') ||
      lowerImg.includes('powerlink') ||
      lowerImg.includes('power_link') ||
      lowerImg.includes('brandzone') ||
      lowerImg.includes('brand_zone') ||
      lowerImg.includes('navershopping') ||
      lowerImg.includes('naver_shopping') ||
      lowerImg.includes('affiliate') ||
      lowerImg.includes('ad_') ||
      lowerImg.includes('_ad.') ||
      lowerImg.includes('promo') ||
      lowerImg.includes('coupon') ||
      lowerImg.includes('delivery') ||
      lowerImg.includes('shipping') ||
      // 결제 관련
      lowerImg.includes('npay') ||
      lowerImg.includes('naverpay') ||
      lowerImg.includes('kakaopay') ||
      lowerImg.includes('toss') ||
      lowerImg.includes('payment') ||
      lowerImg.includes('pay_') ||
      // 기타 UI 요소
      lowerImg.includes('arrow') ||
      lowerImg.includes('button') ||
      lowerImg.includes('btn_') ||
      lowerImg.includes('_btn') ||
      lowerImg.includes('sprite') ||
      lowerImg.includes('.gif') ||
      lowerImg.includes('data:image') ||
      lowerImg.includes('1x1') ||
      lowerImg.includes('spacer') ||
      lowerImg.includes('.svg') ||
      lowerImg.includes('emoji') ||
      lowerImg.includes('emoticon') ||
      lowerImg.includes('storefront') ||
      lowerImg.includes('store_info') ||
      lowerImg.includes('storelogo') ||
      lowerImg.includes('brandlogo') ||
      lowerImg.includes('store_logo') ||
      lowerImg.includes('brand_logo') ||
      // ✅ [2026-02-27] 워터마크/저작권 이미지 필터링 강화
      lowerImg.includes('watermark') ||
      lowerImg.includes('copyright') ||
      lowerImg.includes('gettyimages') ||
      lowerImg.includes('shutterstock') ||
      lowerImg.includes('istockphoto') ||
      lowerImg.includes('alamy.com') ||
      lowerImg.includes('dreamstime') ||
      lowerImg.includes('press_photo') ||
      lowerImg.includes('editorial') ||
      // ✅ [2026-02-27] 뉴스/언론사 이미지 필터링
      lowerImg.includes('imgnews.pstatic') ||
      lowerImg.includes('mimgnews.pstatic') ||
      lowerImg.includes('dispatch.cdnser') ||
      // ✅ [2026-02-27] 쇼핑몰 비제품 이미지 (인증/안내/정보 텍스트)
      lowerImg.includes('cert_') ||
      lowerImg.includes('_cert') ||
      lowerImg.includes('certificate') ||
      lowerImg.includes('kc_mark') ||
      lowerImg.includes('kcmark') ||
      lowerImg.includes('kc인증') ||
      lowerImg.includes('warranty') ||
      lowerImg.includes('guarantee') ||
      lowerImg.includes('notice_') ||
      lowerImg.includes('_notice') ||
      lowerImg.includes('안내') ||
      lowerImg.includes('info_table') ||
      lowerImg.includes('info_img') ||
      lowerImg.includes('seller_info') ||
      lowerImg.includes('판매자') ||
      lowerImg.includes('교환') ||
      lowerImg.includes('환불') ||
      lowerImg.includes('refund') ||
      lowerImg.includes('exchange') ||
      lowerImg.includes('return_') ||
      lowerImg.includes('_return') ||
      lowerImg.includes('guide_') ||
      lowerImg.includes('_guide') ||
      lowerImg.includes('faq_') ||
      lowerImg.includes('qna_') ||
      lowerImg.includes('review_event') ||
      lowerImg.includes('event_banner') ||
      lowerImg.includes('popup_') ||
      lowerImg.includes('_popup') ||
      lowerImg.includes('stamp') ||
      lowerImg.includes('seal') ||
      lowerImg.includes('ribbon') ||
      lowerImg.includes('label_') ||
      lowerImg.includes('_label') ||
      lowerImg.includes('tag_') ||
      lowerImg.includes('_tag') ||
      lowerImg.includes('sticker') ||
      // ✅ [2026-02-27] 쿠팡 특화 비제품 패턴
      lowerImg.includes('rocket-') ||
      lowerImg.includes('rocketwow') ||
      lowerImg.includes('coupang-logo') ||
      lowerImg.includes('seller-logo') ||
      lowerImg.includes('/np/') ||
      lowerImg.includes('/marketing/') ||
      lowerImg.includes('/event/') ||
      lowerImg.includes('/static/') ||
      lowerImg.includes('/assets/') ||
      // ✅ [2026-02-27] 텍스트/문서 이미지 패턴
      lowerImg.includes('text_') ||
      lowerImg.includes('_text') ||
      lowerImg.includes('table_') ||
      lowerImg.includes('_table') ||
      lowerImg.includes('spec_') ||
      lowerImg.includes('_spec');

    if (isLowQualityOrNonProduct) {
      console.log(`[ImageFilter] ⏭️ 비제품/저품질 제외: ${img.substring(0, 80)}...`);
      continue;
    }

    // ✅ [2026-02-08] 네이버 쇼핑 이미지는 제품 CDN 도메인 확인
    if (lowerImg.includes('pstatic.net') || lowerImg.includes('naver.')) {
      const isProductCdn =
        lowerImg.includes('shop-phinf.pstatic.net') ||
        lowerImg.includes('shopping-phinf.pstatic.net') ||
        lowerImg.includes('checkout.phinf') ||  // ✅ [2026-02-08] 리뷰 이미지 CDN
        lowerImg.includes('image.nmv');          // ✅ [2026-02-08] 비디오 썸네일 CDN
      // ✅ [2026-02-08] 광고 이미지는 제품 CDN이어도 제외
      if (lowerImg.includes('searchad-phinf')) {
        console.log(`[ImageFilter] ⏭️ 광고 이미지 제외: ${img.substring(0, 80)}...`);
        continue;
      }
      // shopping-phinf/main_ 은 다른 상품의 카탈로그 썸네일
      if (lowerImg.includes('shopping-phinf') && lowerImg.includes('/main_')) {
        console.log(`[ImageFilter] ⏭️ 카탈로그 썸네일 제외: ${img.substring(0, 80)}...`);
        continue;
      }
      if (!isProductCdn) {
        console.log(`[ImageFilter] ⏭️ 비제품 네이버 CDN 제외: ${img.substring(0, 80)}...`);
        continue;
      }
    }

    // 2. 기본 URL 중복 체크
    const baseUrl = img.split('?')[0].split('#')[0];
    if (seenBaseUrls.has(baseUrl)) {
      console.log(`[ImageFilter] ⏭️ URL 중복 제외: ${baseUrl.substring(0, 60)}...`);
      continue;
    }

    // 3. 파일명 기반 중복 체크 (같은 파일이 다른 크기로 존재하는 경우)
    const fileName = baseUrl.split('/').pop()?.split('?')[0] || '';
    // 파일명에서 크기 정보 제거 (예: image_250x250.jpg → image.jpg)
    const normalizedFileName = fileName.replace(/_\d+x\d+/g, '').replace(/-\d+x\d+/g, '');

    if (normalizedFileName && seenFileNames.has(normalizedFileName)) {
      console.log(`[ImageFilter] ⏭️ 파일명 중복 제외: ${fileName}`);
      continue;
    }

    // ✅ [2026-02-27] 4. 정규화된 URL 중복 제거 (type=f640/f130 등 네이버 CDN 변형)
    const normalizedUrl = baseUrl
      .replace(/[?&]type=[a-z]\d+/gi, '')  // 네이버 type 파라미터 제거
      .replace(/_thumb/gi, '')              // 썸네일 접미사 제거
      .replace(/_small/gi, '')
      .replace(/\/thumbnail\//gi, '/')      // 쿠팡 썸네일 경로 정규화
      .replace(/\/\d+x\d+\//gi, '/')        // 크기 경로 정규화
      .replace(/\?$/, '');
    if (seenNormalizedUrls.has(normalizedUrl)) {
      console.log(`[ImageFilter] ⏭️ 정규화 URL 중복 제외: ${normalizedUrl.substring(0, 60)}...`);
      continue;
    }

    seenBaseUrls.add(baseUrl);
    if (normalizedFileName) seenFileNames.add(normalizedFileName);
    seenNormalizedUrls.add(normalizedUrl);
    filtered.push(img);
  }

  console.log(`[ImageFilter] ✅ 필터링 완료: ${images.length}개 → ${filtered.length}개`);
  return filtered;
}

// 쇼핑몰에서 이미지 수집 (플랫폼별 분기)
// ✅ 브랜드스토어: 기존 방식 (검증됨)
// ✅ 스마트스토어/쿠팡: 새 모듈화된 크롤러
ipcMain.handle('image:collectFromShopping', async (_event, url: string) => {
  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseAndQuota('media', 1);
  if (!check.valid) return check.response;

  try {
    console.log('[Main] ════════════════════════════════════════');
    console.log('[Main] 🛒 쇼핑몰 이미지 수집 시작:', url);

    // ✅ 플랫폼 감지
    const isBrandStore = url.includes('brand.naver.com');
    const isSmartStore = url.includes('smartstore.naver.com');
    const isCoupang = url.includes('coupang.com') || url.includes('coupa.ng');

    let images: string[] = [];
    let title = '';
    let productInfo: any = {};

    if (isBrandStore) {
      // ✅ [2026-02-08] 브랜드스토어: fetchShoppingImages + crawlBrandStoreProduct 이중 수집
      console.log('[Main] 🏪 브랜드스토어 감지 → 강화된 이미지 수집');
      const { fetchShoppingImages } = await import('./sourceAssembler.js');
      const result = await fetchShoppingImages(url, { imagesOnly: true });

      images = result.images || [];
      title = result.title || '';
      productInfo = {
        name: title,
        price: result.price,
        description: result.description,
      };

      // ✅ [2026-02-08] 이미지 7장 미만이면 crawlBrandStoreProduct 폴백으로 추가 수집
      const MIN_BRAND_IMAGES = 7;
      if (images.length < MIN_BRAND_IMAGES) {
        console.log(`[Main] ⚠️ 브랜드스토어 이미지 ${images.length}개 < 목표 ${MIN_BRAND_IMAGES}개 → 폴백 크롤러 호출`);
        try {
          // URL에서 productId와 brandName 추출
          const productIdMatch = url.match(/\/products\/(\d+)/) || url.match(/channelProductNo=(\d+)/);
          const brandMatch = url.match(/(?:m\.)?brand\.naver\.com\/([^\/\?]+)/);
          const productId = productIdMatch?.[1] || '';
          const brandName = brandMatch?.[1] || '';

          if (productId && brandName) {
            const { crawlBrandStoreProduct } = await import('./crawler/productSpecCrawler.js');
            const fallbackResult = await crawlBrandStoreProduct(productId, brandName, url);

            if (fallbackResult) {
              // ✅ AffiliateProductInfo에서 이미지 추출 (mainImage + galleryImages + detailImages)
              const fallbackAllImages: string[] = [];
              if (fallbackResult.mainImage) fallbackAllImages.push(fallbackResult.mainImage);
              if (fallbackResult.galleryImages?.length) fallbackAllImages.push(...fallbackResult.galleryImages);
              if (fallbackResult.detailImages?.length) fallbackAllImages.push(...fallbackResult.detailImages);

              // 폴백에서 얻은 이미지 병합 (중복 제거)
              const existingNorm = new Set(images.map(u => u.split('?')[0]));
              const fallbackImages = fallbackAllImages
                .filter((img: string) => {
                  const norm = img.split('?')[0];
                  return !existingNorm.has(norm) && img.startsWith('http');
                });

              if (fallbackImages.length > 0) {
                images = [...images, ...fallbackImages];
                console.log(`[Main] ✅ 폴백 크롤러에서 ${fallbackImages.length}개 추가 이미지 수집 → 총 ${images.length}개`);
              }

              // 상품명이 없으면 폴백에서 가져오기
              if (!title && fallbackResult.name && fallbackResult.name !== '상품명을 불러올 수 없습니다') {
                title = fallbackResult.name;
                productInfo.name = title;
                console.log(`[Main] ✅ 폴백 크롤러에서 상품명 추출: "${title}"`);
              }
              if (!productInfo.price && fallbackResult.price) {
                productInfo.price = fallbackResult.price;
              }
            }
          } else {
            console.log(`[Main] ⚠️ URL에서 productId/brandName 추출 실패 → 폴백 건너뜀`);
          }
        } catch (fallbackErr) {
          console.warn(`[Main] ⚠️ 브랜드스토어 폴백 크롤링 오류:`, (fallbackErr as Error).message);
        }
      }
    } else if (isSmartStore || isCoupang) {
      // ✅ 스마트스토어/쿠팡: 새 모듈화된 크롤러 사용
      console.log(`[Main] 🏪 ${isSmartStore ? '스마트스토어' : '쿠팡'} 감지 → 새 크롤러 사용`);
      const { collectShoppingImages } = await import('./crawler/shopping/index.js');

      // ✅ [2026-02-27] maxImages 30→100 확대 (대량 수집)
      const result = await collectShoppingImages(url, {
        timeout: 30000,
        maxImages: 100,
        includeDetails: true,
        useCache: true,
      });

      if (result.isErrorPage) {
        console.error('[Main] ❌ 에러 페이지 감지:', result.error);
        return { success: false, message: result.error || '에러 페이지입니다', isErrorPage: true };
      }

      if (!result.success) {
        console.warn('[Main] ⚠️ 이미지 수집 실패:', result.error);
        return { success: false, message: result.error || '이미지를 수집할 수 없습니다' };
      }

      images = result.images.map(img => img.url);
      title = result.productInfo?.name || '';
      productInfo = result.productInfo || {};

      console.log(`[Main] 📊 사용된 전략: ${result.usedStrategy}`);
      console.log(`[Main] ⏱️ 소요 시간: ${result.timing}ms`);
    } else {
      // ✅ 기타 쇼핑몰: 기존 방식 폴백
      console.log('[Main] 🏪 기타 쇼핑몰 → 기존 방식 사용');
      const { fetchShoppingImages } = await import('./sourceAssembler.js');
      const result = await fetchShoppingImages(url, { imagesOnly: true });

      images = result.images || [];
      title = result.title || '';
      productInfo = {
        name: title,
        price: result.price,
        description: result.description,
      };
    }

    console.log(`[Main] ✅ 쇼핑몰 이미지 수집 완료: ${images.length}개`);

    // ✅ [2026-02-01 FIX] 1단계: 배너/배찌/마크 등 비제품 이미지 URL 필터링
    const filteredImages = filterDuplicateAndLowQualityImages(images);
    console.log(`[Main] 🎯 1단계 URL 필터 후: ${filteredImages.length}개 (제외: ${images.length - filteredImages.length}개)`);

    // ✅ [2026-02-27] 2~4단계: 이미지 콘텐츠 분석 + 유사도 필터 + AI Vision 분류
    let analyzedImages = filteredImages;
    if (filteredImages.length > 1) {
      try {
        const config = await loadConfig();
        const { analyzeAndFilterShoppingImages } = await import('./image/shoppingImageAnalyzer.js');
        analyzedImages = await analyzeAndFilterShoppingImages(filteredImages, {
          referenceImageUrl: filteredImages[0], // 갤러리 대표 이미지
          geminiApiKey: config.geminiApiKey || '',
          openaiApiKey: (config as any).openaiApiKey || '',
        });
        console.log(`[Main] 🔬 2~4단계 분석 후: ${analyzedImages.length}개 (추가 제외: ${filteredImages.length - analyzedImages.length}개)`);
      } catch (analyzeErr) {
        console.warn(`[Main] ⚠️ 2단계 분석 실패, 1단계 결과 사용:`, (analyzeErr as Error).message);
        analyzedImages = filteredImages;
      }
    }

    console.log('[Main] ════════════════════════════════════════');

    const response = {
      success: analyzedImages.length > 0,
      images: analyzedImages,
      title,
      productInfo,
    };

    if ((response.images?.length ?? 0) > 0 && (await isFreeTierUser())) {
      await consumeQuota('media', 1);
    }
    return response;

  } catch (error) {
    console.error('[Main] ❌ 쇼핑몰 이미지 수집 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

// ✅ [2026-02-01] AI 기반 소제목-이미지 의미적 매칭 (Gemini / Perplexity 지원)
ipcMain.handle('image:matchToHeadings', async (_event, images: string[], headings: string[]) => {
  try {
    console.log(`[Main] 🎯 이미지-소제목 매칭 시작: ${images.length}개 이미지, ${headings.length}개 소제목`);

    const config = await loadConfig();

    // ✅ 사용자 설정에 따른 AI 공급자 결정
    const provider = config.defaultAiProvider || 'gemini';
    const geminiApiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
    const perplexityApiKey = config.perplexityApiKey || process.env.PERPLEXITY_API_KEY;

    // API 키 확인
    const hasGemini = !!geminiApiKey;
    const hasPerplexity = !!perplexityApiKey;

    if (!hasGemini && !hasPerplexity) {
      console.warn('[Main] ⚠️ AI API 키 없음 → 순차 배치');
      return { success: true, matches: headings.map((_: string, i: number) => i % images.length) };
    }

    const { matchImagesToHeadings } = await import('./imageHeadingMatcher.js');

    // ✅ [2026-03-20 FIX] 설정 기반 AI 매칭 실행 — openai/claude는 미지원이므로 Gemini로 안전 폴백
    const resolvedMatcherProvider = (provider === 'perplexity' && hasPerplexity) ? 'perplexity' as const : 'gemini' as const;
    if ((provider === 'openai' || provider === 'claude') && hasGemini) {
      console.log(`[Main] ⚠️ 이미지-소제목 매칭: ${provider}는 미지원 → Gemini로 폴백합니다.`);
    }
    const matcherConfig = {
      provider: resolvedMatcherProvider,
      geminiApiKey,
      perplexityApiKey,
      geminiModel: config.geminiModel || process.env.GEMINI_MODEL,
      perplexityModel: config.perplexityModel,
    };

    console.log(`[Main] 🤖 AI 공급자: ${matcherConfig.provider} (설정: ${provider})`);
    const matches = await matchImagesToHeadings(images, headings, matcherConfig);

    console.log(`[Main] ✅ 이미지-소제목 매칭 완료: ${JSON.stringify(matches)}`);
    return { success: true, matches };

  } catch (error) {
    console.error('[Main] ❌ 이미지-소제목 매칭 실패:', error);
    // 폴백: 순차 배치
    return { success: true, matches: headings.map((_: string, i: number) => i % images.length) };
  }
});

// 다중 이미지 다운로드 및 저장
ipcMain.handle('image:downloadAndSaveMultiple', async (_event, images: Array<{ url: string; heading: string }>, title: string) => {
  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseAndQuota('media', 1);
  if (!check.valid) return check.response;

  try {
    const axios = (await import('axios')).default;
    const os = await import('os');

    const savedImages: any[] = [];
    const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_');

    // ✅ 설정된 이미지 저장 경로 사용
    let basePath = path.join(os.homedir(), 'Downloads', 'naver-blog-images');
    try {
      const config = await loadConfig();
      if (config.customImageSavePath && config.customImageSavePath.trim() !== '') {
        basePath = config.customImageSavePath;
      }
    } catch { /* 기본 경로 사용 */ }

    const imagesPath = path.join(basePath, safeTitle);
    await fs.mkdir(imagesPath, { recursive: true });
    console.log(`[Main] 이미지 저장 경로: ${imagesPath}`);

    // ✅ [100점 개선] 이미지 다운로드 함수 (헤더 + 리다이렉트 + 재시도)
    // ✅ [2026-04-18 FIX] Referer를 URL의 origin으로 동적 설정 — 쿠팡/스마트스토어
    //    핫링크 방지는 자기 도메인만 허용하는 경우가 많아 naver.com 고정 Referer로는
    //    대부분 403/차단됨. URL origin 매칭이 가장 호환성 높음.
    //    예: coupangcdn 이미지 → Referer: https://www.coupang.com/
    //        pstatic 이미지    → Referer: https://smartstore.naver.com/
    const inferRefererFromUrl = (imgUrl: string): string => {
      try {
        const u = new URL(imgUrl);
        const host = u.hostname;
        // 이미지 CDN 호스트 → 대응하는 쇼핑몰 origin 매핑
        if (host.includes('coupangcdn') || host.includes('coupang')) return 'https://www.coupang.com/';
        if (host.includes('pstatic') || host.includes('phinf')) return 'https://smartstore.naver.com/';
        if (host.includes('shopping-phinf')) return 'https://brand.naver.com/';
        // 기본: URL 자체 origin
        return `${u.protocol}//${u.host}/`;
      } catch {
        return 'https://search.naver.com/';
      }
    };

    const downloadImage = async (url: string, maxRetries = 3): Promise<{ buffer: Buffer; contentType: string } | null> => {
      const referer = inferRefererFromUrl(url);
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxRedirects: 5, // ✅ 리다이렉트 자동 처리
            headers: {
              // ✅ [핵심] 핫링크 방지 우회 헤더 (URL origin 기반)
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': referer,
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            validateStatus: (status) => status >= 200 && status < 400,
          });

          const buffer = Buffer.from(response.data);
          const contentType = response.headers['content-type'] || 'image/jpeg';

          // ✅ 버퍼 크기 검증 (최소 1KB)
          if (buffer.length < 1024) {
            console.warn(`[Main] ⚠️ 이미지 크기 너무 작음 (${buffer.length}bytes), 재시도 ${attempt}/${maxRetries}`);
            if (attempt < maxRetries) {
              await new Promise(r => setTimeout(r, 500 * attempt)); // exponential backoff
              continue;
            }
            return null;
          }

          return { buffer, contentType };
        } catch (error: any) {
          const errorMsg = error.response?.status
            ? `HTTP ${error.response.status}`
            : (error.code || error.message);
          console.warn(`[Main] ⚠️ 다운로드 시도 ${attempt}/${maxRetries} 실패: ${errorMsg}`);

          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1000 * attempt)); // exponential backoff
          }
        }
      }
      return null;
    };

    // ✅ Content-Type에서 확장자 추출
    const getExtensionFromContentType = (contentType: string, url: string): string => {
      const typeMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/avif': '.avif',
        'image/svg+xml': '.svg',
      };

      for (const [type, ext] of Object.entries(typeMap)) {
        if (contentType.includes(type)) return ext;
      }

      // URL에서 확장자 추출 (query string 제거)
      const urlPath = url.split('?')[0];
      const urlExt = path.extname(urlPath).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(urlExt)) {
        return urlExt === '.jpeg' ? '.jpg' : urlExt;
      }

      return '.jpg'; // 기본값
    };

    // ✅ 병렬 다운로드 (Promise.all)
    const downloadPromises = images.map(async (img, i) => {
      const result = await downloadImage(img.url);

      if (!result) {
        console.error(`[Main] ❌ 이미지 ${i + 1} 다운로드 최종 실패: ${img.heading}`);
        return null;
      }

      try {
        const ext = getExtensionFromContentType(result.contentType, img.url);
        const safeHeading = img.heading.replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_').replace(/_+/g, '_').replace(/\.+$/g, '').substring(0, 50);
        const fileName = `${i + 1}_${safeHeading}${ext}`;
        const filePath = path.join(imagesPath, fileName);

        await fs.writeFile(filePath, result.buffer);
        console.log(`[Main] ✅ 이미지 ${i + 1} 저장 완료: ${fileName} (${Math.round(result.buffer.length / 1024)}KB)`);

        return { filePath, heading: img.heading };
      } catch (writeError) {
        console.error(`[Main] ❌ 이미지 ${i + 1} 파일 저장 실패:`, writeError);
        return null;
      }
    });

    const results = await Promise.all(downloadPromises);

    // ✅ [2026-04-18 FIX] 인덱스 정합성 보존 — 실패한 슬롯을 null로 유지
    //    이전 버그: 실패 슬롯을 filter로 제거 → savedImages[idx]가 원래 idx의
    //    다운로드 결과가 아닌 뒤 인덱스의 결과가 들어가 소제목-이미지 미스매칭 +
    //    실패한 idx는 undefined → UI에서 X 마크 표시
    //    수정: results 그대로 대입 (null 유지). 렌더러는 savedImg?.filePath로 안전 체크.
    for (const r of results) {
      savedImages.push(r);
    }

    const successCount = results.filter(r => r !== null).length;
    const failCount = images.length - successCount;

    console.log(`[Main] 📊 다운로드 결과: 성공 ${successCount}개, 실패 ${failCount}개`);

    const response = { success: true, savedImages, folderPath: imagesPath };
    if ((response.savedImages?.length ?? 0) > 0 && (await isFreeTierUser())) {
      await consumeQuota('media', 1);
    }
    return response;
  } catch (error) {
    console.error('[Main] 다중 이미지 다운로드 실패:', error);
    return { success: false, error: (error as Error).message };
  }
});

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
ipcMain.handle('automation:closeBrowser', async () => {
  try {
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
ipcMain.handle('search-images-for-headings', async (_event, payload: {
  headings: string[];
  mainKeyword: string;
}) => {
  try {
    console.log(`[Main] 🖼️ search-images-for-headings 시작: ${payload.headings.length}개 소제목`);

    const { searchImagesForHeadings } = await import('./crawler/googleImageSearch.js');
    const resultMap = await searchImagesForHeadings(
      payload.headings,
      payload.mainKeyword
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
  // ============================================
  //  [리팩토링] 새 엔진으로 완전 위임
  // ============================================

  console.log('[Main] automation:run  AutomationService.executePostCycle() 위임');

  //  라이선스/quota 검증
  const validationResult = await validateAutomationRun();
  if (!validationResult.valid) {
    return validationResult.response;
  }

  // ✅ [2026-03-01 FIX] 선차감 패턴: 발행 전에 쿼터를 먼저 차감
  let preConsumed = false;
  const isFreeUser = await AuthUtils.isFreeTierUser();
  if (isFreeUser) {
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
      const result = await AutomationService.executePostCycle(payload as any);

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
        sendStatus({ success: false, cancelled: true, message: result.message });
      } else {
        if (preConsumed) {
          try {
            const refunded = await refundQuota('publish', 1);
            console.log(`[Main] 발행 실패: 쿼터 환불 완료 (현재: ${refunded.publish})`);
          } catch (e) { console.error('[Main] 쿼터 환불 오류:', e); }
        }
        sendStatus({ success: false, message: result.message });
      }

      return result;

    } catch (error) {
      if (preConsumed) {
        try {
          const refunded = await refundQuota('publish', 1);
          console.log(`[Main] 자동화 오류: 쿼터 환불 완료 (현재: ${refunded.publish})`);
        } catch (e) { console.error('[Main] 쿼터 환불 오류:', e); }
      }
      const message = (error as Error).message || '자동화 실행 중 오류가 발생했습니다.';
      console.error('[Main] automation:run 오류:', message);
      sendStatus({ success: false, message });
      AutomationService.stopRunning();
      return { success: false, message };
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


ipcMain.handle('automation:cancel', async () => {
  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseOnly();
  if (!check.valid) return check.response;

  // ✅ [2026-04-03 FIX] 항상 취소 요청 — AI 콘텐츠 생성/이미지 생성도 즉시 abort
  // automationRunning이 false여도 generateStructuredContent가 돌고 있을 수 있음
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

      };

      // ✅ 쇼핑커넥트 모드: 수집된 이미지를 각 item의 referenceImagePath로 배분
      const isShoppingConnect = (options as any).isShoppingConnect === true;
      const collectedImages = (options as any).collectedImages || [];

      if (isShoppingConnect && Array.isArray(collectedImages) && collectedImages.length > 0 && options.items) {
        console.log(`[Main] 🛒 쇼핑커넥트: ${collectedImages.length}개 수집 이미지를 참조 이미지로 배분`);
        options.items.forEach((item, idx) => {
          // 각 소제목에 수집 이미지를 순환 할당 (이미지 개수보다 소제목이 많을 수 있음)
          const refImg = collectedImages[idx % collectedImages.length];
          if (refImg && !item.referenceImagePath && !item.referenceImageUrl) {
            const refUrl = typeof refImg === 'string' ? refImg : (refImg.url || refImg.filePath || refImg.thumbnailUrl);
            if (refUrl) {
              (item as any).referenceImagePath = refUrl;
              console.log(`[Main]   📎 소제목 ${idx + 1} (${item.heading?.substring(0, 20) || ''}) → 참조: ${String(refUrl).substring(0, 60)}...`);
            }
          }
        });
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

              // 각 item에 referenceImageUrl 배분
              if (options.items) {
                options.items.forEach((item: any, idx: number) => {
                  if (!item.referenceImageUrl && !item.referenceImagePath) {
                    item.referenceImageUrl = urlImages[idx % urlImages.length];
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
          typeof img === 'string' ? img : (img.url || img.filePath || img.thumbnailUrl)
        ).filter(Boolean);
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

      // ✅ [2026-04-03 FIX] 이미지 생성 전 취소 체크
      if (AutomationService.isCancelRequested()) {
        return { success: false, message: '사용자가 작업을 취소했습니다.' };
      }

      const images = await generateImages(options, apiKeys, onImageGenerated);

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

// ✅ 파일 존재 확인 IPC 핸들러
ipcMain.handle('file:exists', async (_event, filePath: string): Promise<boolean> => {
  try {
    const fs = await import('fs/promises');
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

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
            model: 'claude-haiku-4-5-20251001',
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
          const model = resp.data?.model || 'claude-3-haiku';

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
ipcMain.handle('gemini:test10x', async (_event, testCount?: number) => {
  const TEST_COUNT = testCount || 30; // 기본 30회

  console.log('\n' + '='.repeat(60));
  console.log(`🧪 Gemini API ${TEST_COUNT}회 연속 테스트 시작 (앱 환경)`);
  console.log('='.repeat(60) + '\n');

  const results: Array<{ success: boolean; elapsed?: number; retry?: number; error?: string }> = [];
  let successCount = 0;
  let totalRetries = 0;
  const MAX_RETRIES = 8;
  const RETRY_DELAYS = [3000, 5000, 8000, 10000, 15000, 20000, 25000, 30000];

  for (let i = 1; i <= TEST_COUNT; i++) {
    console.log(`테스트 ${i}/${TEST_COUNT}: 시작...`);

    let lastError = '';
    let retryCount = 0;

    for (let retry = 0; retry <= MAX_RETRIES; retry++) {
      try {
        const startTime = Date.now();
        const testPrompt = `다음 주제로 짧은 블로그 글 제목 1개만 생성해주세요: "겨울철 건강 관리"`;

        const content = await generateBlogContent(testPrompt);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (content && content.trim()) {
          results.push({ success: true, elapsed: parseFloat(elapsed), retry });
          successCount++;
          totalRetries += retry;
          console.log(`테스트 ${i}/${TEST_COUNT}: ✅ 성공 (${elapsed}초${retry > 0 ? `, 재시도 ${retry}회` : ''})`);
          break;
        }
        throw new Error('빈 응답');

      } catch (error) {
        const errorMsg = (error as Error).message || '';
        lastError = errorMsg.substring(0, 100);

        const isRetryable =
          errorMsg.includes('503') ||
          errorMsg.includes('overloaded') ||
          errorMsg.includes('500') ||
          errorMsg.includes('502') ||
          errorMsg.includes('504') ||
          errorMsg.includes('rate') ||
          errorMsg.includes('network') ||
          errorMsg.includes('timeout');

        if (isRetryable && retry < MAX_RETRIES) {
          const delay = RETRY_DELAYS[retry];
          console.log(`  ⏳ 재시도 ${retry + 1}/${MAX_RETRIES} (${delay / 1000}초 대기)`);
          await new Promise(r => setTimeout(r, delay));
          retryCount = retry + 1;
          continue;
        }

        results.push({ success: false, error: lastError, retry });
        console.log(`테스트 ${i}/${TEST_COUNT}: ❌ 실패: ${lastError}`);
        break;
      }
    }

    // 테스트 간 간격
    if (i < TEST_COUNT) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 결과 요약
  console.log('\n' + '='.repeat(60));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(60));
  console.log(`총 테스트: ${TEST_COUNT}회`);
  console.log(`성공: ${successCount}회`);
  console.log(`실패: ${TEST_COUNT - successCount}회`);
  console.log(`성공률: ${((successCount / TEST_COUNT) * 100).toFixed(1)}%`);
  console.log(`총 재시도 횟수: ${totalRetries}회`);
  console.log('='.repeat(60) + '\n');

  if (successCount === TEST_COUNT) {
    console.log('🎉 100% 성공! Gemini API가 안정적으로 작동합니다.');
  }

  return {
    success: successCount === TEST_COUNT,
    total: TEST_COUNT,
    successCount,
    failCount: TEST_COUNT - successCount,
    successRate: ((successCount / TEST_COUNT) * 100).toFixed(1) + '%',
    totalRetries,
    results
  };
});

ipcMain.handle('gemini:generateVeoVideo', async (_event, payload: {
  prompt: string;
  model?: string;
  durationSeconds?: number;
  aspectRatio?: '16:9' | '9:16' | '1:1' | 'original';
  negativePrompt?: string;
  imagePath?: string;
  image?: { imageBytes: string; mimeType: string };
  heading?: string;
  videoProvider?: 'veo' | 'stability' | 'prodia' | 'kenburns'; // ✅ 추가
  convertToGif?: boolean; // ✅ 추가
}) => {
  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseAndQuota('media', 1);
  if (!check.valid) return check.response;

  try {
    const config = await loadConfig();
    try {
      applyConfigToEnv(config);
    } catch (e) {
      console.warn('[main] catch ignored:', e);
    }

    const {
      prompt = '',
      model = 'veo-3.1-generate-preview',
      durationSeconds = 6,
      aspectRatio = '1:1',
      negativePrompt = '',
      videoProvider = 'veo',
      convertToGif = false,
      heading = 'AI-VIDEO',
    } = payload;

    const headingForSave = sanitizeFileName(String(heading || '').trim()) || 'AI-VIDEO';
    const mp4Dir = await ensureHeadingMp4Dir(headingForSave);

    let finalOutPath = '';
    let finalFileName = '';

    // ✅ 1. Stability AI (SVD) 비디오 생성 — 제거됨 (deprecated provider)
    if (videoProvider === 'stability') {
      throw new Error('Stability AI 비디오 생성은 더 이상 지원되지 않습니다. Veo를 사용하세요.');
    }
    // ✅ 2. Veo (Gemini) 비디오 생성 (기존 로직 보전)
    else if (videoProvider === 'veo') {
      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.');
      if (!prompt?.trim()) throw new Error('프롬프트가 비어있습니다.');

      const pickMimeType = (filePath: string): string => {
        const p = String(filePath || '').toLowerCase();
        if (p.endsWith('.png')) return 'image/png';
        if (p.endsWith('.webp')) return 'image/webp';
        if (p.endsWith('.gif')) return 'image/gif';
        if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
        return 'image/png';
      };

      const normalizeImageInput = async (input: string): Promise<{ imageBytes: string; mimeType: string } | undefined> => {
        const raw = String(input || '').trim();
        if (!raw) return undefined;
        if (/^data:/i.test(raw)) {
          const m = raw.match(/^data:([^;]+);base64,(.+)$/i);
          if (!m) return undefined;
          return { imageBytes: String(m[2] || '').trim(), mimeType: String(m[1] || '').trim() || 'image/png' };
        }
        if (/^https?:\/\//i.test(raw)) {
          const axios = (await import('axios')).default;
          const resp = await axios.get(raw, { responseType: 'arraybuffer', maxRedirects: 5 });
          const buf = Buffer.from(resp.data);
          const ct = String((resp.headers as any)?.['content-type'] || '').split(';')[0].trim();
          return { imageBytes: buf.toString('base64'), mimeType: ct || pickMimeType(raw) };
        }
        const buf = await fs.readFile(raw);
        return { imageBytes: buf.toString('base64'), mimeType: pickMimeType(raw) };
      };

      const imagePath = String(payload?.imagePath || '').trim();
      const imageBytes = String(payload?.image?.imageBytes || '').trim();
      const imageMimeType = String(payload?.image?.mimeType || '').trim();
      let instanceImage: { imageBytes: string; mimeType: string } | undefined = undefined;

      if (imageBytes) {
        instanceImage = { imageBytes, mimeType: imageMimeType || 'image/png' };
      } else if (imagePath) {
        instanceImage = await normalizeImageInput(imagePath);
      }

      sendLog(`🎬 Veo 영상 생성 시작 (모델: ${model}, ${durationSeconds}초)`);
      const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
      const axios = (await import('axios')).default;
      const headers = { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };
      const instance: any = { prompt: prompt.trim() };
      if (instanceImage?.imageBytes) {
        instance.image = { bytesBase64Encoded: instanceImage.imageBytes, mimeType: instanceImage.mimeType };
      }

      const requestBody: any = { instances: [instance], parameters: { durationSeconds } };
      if (aspectRatio && aspectRatio !== 'original') {
        requestBody.parameters.aspectRatio = aspectRatio;
      }
      if (negativePrompt) requestBody.parameters.negativePrompt = negativePrompt;

      const startResp = await axios.post(`${baseUrl}/models/${encodeURIComponent(model)}:predictLongRunning`, requestBody, { headers });
      const operationName = startResp?.data?.name;
      if (!operationName) throw new Error('Veo 작업 생성 실패');

      const startedAt = Date.now();
      const timeoutMs = 12 * 60 * 1000;
      const pollIntervalMs = 10 * 1000;

      while (true) {
        if (Date.now() - startedAt > timeoutMs) throw new Error('Veo 생성 시간 초과');
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        const statusResp = await axios.get(`${baseUrl}/${operationName}`, { headers });
        const data = statusResp?.data;
        sendLog(`⏳ Veo 생성 중... ${Math.floor((Date.now() - startedAt) / 1000)}초 경과`);

        if (data?.done === true) {
          const response = data?.response || {};
          const errMsg = data?.error?.message || response?.error?.message || response?.generateVideoResponse?.error?.message;
          if (errMsg) throw new Error(String(errMsg));

          const pickFirstTruthy = (...vals: any[]): any => {
            for (const v of vals) if (v !== undefined && v !== null && String(v).trim() !== '') return v;
            return undefined;
          };

          // ✅ 비디오 데이터 추출 (다양한 응답 포맷 대응)
          const rawVideo = pickFirstTruthy(
            response?.generateVideoResponse?.generatedSamples?.[0]?.video,
            response?.generatedVideos?.[0]?.video,
            response?.generated_videos?.[0]?.video,
            response?.video?.[0] || response?.video
          );

          let downloadUrl: string | undefined = undefined;
          const rawVideoUri = pickFirstTruthy(
            rawVideo?.uri,
            rawVideo?.downloadUri,
            rawVideo?.fileUri,
            rawVideo?.download_uri,
            rawVideo?.file_uri,
            response?.generateVideoResponse?.video?.[0]?.uri,
            response?.video?.[0]?.uri
          );

          // 1) 직접 URL인 경우 사용
          if (rawVideoUri && /^https?:\/\//i.test(String(rawVideoUri))) {
            downloadUrl = String(rawVideoUri);
          }

          // 2) 파일 ID인 경우 Files API 호출
          if (!downloadUrl) {
            let fileId = String(rawVideoUri || rawVideo?.name || '').trim();
            // files/ 가 없는 경우 보정
            if (fileId && !fileId.startsWith('files/') && !fileId.startsWith('http')) {
              fileId = `files/${fileId}`;
            }

            if (fileId.startsWith('files/')) {
              try {
                const fileResp = await axios.get(`${baseUrl}/${fileId}`, { headers });
                downloadUrl = pickFirstTruthy(
                  fileResp?.data?.file?.downloadUri,
                  fileResp?.data?.downloadUri,
                  fileResp?.data?.file?.download_uri
                );
              } catch (e) {
                console.error('[Veo] 파일 정보 조회 실패:', (e as Error).message);
              }
            }
          }


          if (!downloadUrl) throw new Error('다운로드 URL을 찾을 수 없습니다.');

          const videoResp = await axios.get(downloadUrl, { headers: { 'x-goog-api-key': apiKey }, responseType: 'arraybuffer' });
          const { fullPath: outPath, fileName } = await getUniqueMp4Path(mp4Dir, headingForSave);
          await fs.writeFile(outPath, Buffer.from(videoResp.data));

          finalOutPath = outPath;
          finalFileName = fileName;
          sendLog(`✅ Veo 영상 생성 완료: ${fileName}`);
          break;
        }
      }
    } else {
      throw new Error(`지원하지 않는 비디오 프로바이더: ${videoProvider}`);
    }

    if (await isFreeTierUser()) {
      await consumeQuota('media', 1);
    }

    // ✅ 4. GIF 변환 처리
    if (convertToGif && finalOutPath && finalOutPath.endsWith('.mp4')) {
      try {
        sendLog('🔄 GIF 변환 중...');
        const pathModule = await import('path');
        // ✅ [Fix] GIF 변환 시 aspectRatio 옵션을 전달하여 1:1 크롭 적용 (Veo가 16:9 컨테이너에 1:1 영상을 줄 경우 대비)
        const gifPath = await convertMp4ToGif(finalOutPath, { aspectRatio });
        sendLog(`✅ GIF 변환 완료: ${pathModule.basename(gifPath)}`);

        return {
          success: true,
          filePath: gifPath,
          fileName: pathModule.basename(gifPath),
          mp4Path: finalOutPath
        };
      } catch (gifError) {
        sendLog(`⚠️ GIF 변환 실패: ${(gifError as Error).message}`);
        return { success: true, filePath: finalOutPath, fileName: finalFileName };
      }
    }

    // ✅ GIF 변환 없는 일반 MP4 생성 성공 응답 (이전에 누락되어 있었음!)
    return { success: true, filePath: finalOutPath, fileName: finalFileName };
  } catch (error) {
    console.error('[Gemini] generateVeoVideo 실패:', error);
    const message = (error as Error).message || String(error);
    return { success: false, message };
  }
});

// 네이버 데이터랩 트렌드 분석 핸들러
ipcMain.handle('datalab:getTrendSummary', async (_event, keyword: string) => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] datalab:getTrendSummary - 설정 동기화 실패:', e);
  }

  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseOnly();
  if (!check.valid) return check.response;

  try {
    const datalabClient = createDatalabClient();
    if (!datalabClient) {
      return {
        success: false,
        message: '네이버 데이터랩 API가 설정되지 않았습니다. 환경 설정에서 Client ID와 Secret을 입력해주세요.',
      };
    }

    const summary = await datalabClient.getTrendSummary(keyword);
    return {
      success: true,
      data: summary,
    };
  } catch (error) {
    return {
      success: false,
      message: `트렌드 분석 실패: ${(error as Error).message}`,
    };
  }
});

ipcMain.handle('datalab:getSearchTrend', async (
  _event,
  keywords: string[],
  startDate: string,
  endDate: string,
  timeUnit: 'date' | 'week' | 'month' = 'date',
) => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] datalab:getSearchTrend - 설정 동기화 실패:', e);
  }

  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseOnly();
  if (!check.valid) return check.response;

  try {
    const datalabClient = createDatalabClient();
    if (!datalabClient) {
      return {
        success: false,
        message: '네이버 데이터랩 API가 설정되지 않았습니다.',
      };
    }

    const trend = await datalabClient.getSearchTrend(keywords, startDate, endDate, timeUnit);
    return {
      success: true,
      data: trend,
    };
  } catch (error) {
    return {
      success: false,
      message: `검색 트렌드 조회 실패: ${(error as Error).message}`,
    };
  }
});

// ✅ 실시간 트렌드 알림 관련 IPC 핸들러
ipcMain.handle('trend:startMonitoring', async () => {
  try {
    if (trendMonitor.getIsMonitoring()) {
      return { success: true, message: '이미 모니터링 중입니다.' };
    }

    monitorTask = trendMonitor.monitorRealtime().catch((error) => {
      sendLog(`⚠️ 실시간 모니터링 오류: ${(error as Error).message}`);
    });

    sendLog('👀 실시간 트렌드 모니터링 시작');
    return { success: true, message: '실시간 트렌드 모니터링을 시작했습니다.' };
  } catch (error) {
    return { success: false, message: `모니터링 시작 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('trend:stopMonitoring', async () => {
  try {
    trendMonitor.stop();
    sendLog('🛑 실시간 트렌드 모니터링 중지');
    return { success: true, message: '실시간 트렌드 모니터링을 중지했습니다.' };
  } catch (error) {
    return { success: false, message: `모니터링 중지 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('trend:getStatus', async () => {
  return {
    isMonitoring: trendMonitor.getIsMonitoring(),
    alertEnabled: trendAlertEnabled,
  };
});

ipcMain.handle('trend:setAlertEnabled', async (_event, enabled: boolean) => {
  trendAlertEnabled = enabled;
  sendLog(`🔔 트렌드 알림 ${enabled ? '활성화' : '비활성화'}`);
  return { success: true, enabled };
});

ipcMain.handle('trend:getCurrentTrends', async () => {
  try {
    const trends = await trendMonitor.getCurrentTrends();
    return { success: true, trends };
  } catch (error) {
    return { success: false, message: `트렌드 조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('trend:setInterval', async (_event, intervalMs: number) => {
  trendMonitor.setMonitorInterval(intervalMs);
  return { success: true, interval: intervalMs };
});

// ✅ AI 어시스턴트 IPC 핸들러
ipcMain.handle('aiAssistant:chat', async (_event, message: string) => {
  console.log('[AI Assistant] 메시지 수신:', message);
  try {
    try {
      const config = await loadConfig();
      applyConfigToEnv(config);
      try {
        masterAgent.reinitGemini();
      } catch (e) {
        console.warn('[main] catch ignored:', e);
      }
    } catch (e) {
      console.warn('[main] catch ignored:', e);
    }
    const result = await masterAgent.processMessage(message);
    console.log('[AI Assistant] 응답 생성 완료:', result.success);
    return result;
  } catch (error) {
    console.error('[AI Assistant] 처리 오류:', error);
    return {
      success: false,
      response: '죄송해요, 문제가 발생했어요. 다시 시도해주세요.',
      error: { code: 'PROCESSING_ERROR', message: (error as Error).message, recoverable: true }
    };
  }
});

ipcMain.handle('aiAssistant:getWelcome', async () => {
  return { success: true, message: getWelcomeMessage() };
});

ipcMain.handle('aiAssistant:clearChat', async () => {
  try {
    masterAgent.clearChat();
    return { success: true };
  } catch (error) {
    return { success: false, message: (error as Error).message || String(error) };
  }
});

// ✅ 시스템 자동 수정 IPC 핸들러
ipcMain.handle('aiAssistant:runAutoFix', async () => {
  console.log('[AI Assistant] 🔧 자동 수정 시작...');
  const fixResults: { action: string; success: boolean; message: string }[] = [];

  try {
    const config = await loadConfig() as any;
    let configChanged = false;

    // 1. Gemini 모델 수정 - ✅ [2026-04-09] Stable 모델만 사용
    const validModels = [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
    ];

    // ✅ [v1.4.49 revert] 죽은/무료차단 모델 → Flash로 마이그레이션 (Flash-Lite RPD 20/일로 부족)
    const modelMigrationMap: Record<string, string> = {
      'gemini-3-pro': 'gemini-2.5-flash',
      'gemini-3-flash': 'gemini-2.5-flash',
      'gemini-3-pro-preview': 'gemini-2.5-flash',
      'gemini-3-flash-preview': 'gemini-2.5-flash',
      'gemini-3.1-pro-preview': 'gemini-2.5-flash',
      'gemini-3.1-flash-preview': 'gemini-2.5-flash',
      'gemini-2.5-pro-preview': 'gemini-2.5-flash',
      'gemini-2.0-flash': 'gemini-2.5-flash',
      'gemini-2.0-flash-exp': 'gemini-2.5-flash',
      'gemini-1.5-flash': 'gemini-2.5-flash',
      'gemini-1.5-flash-latest': 'gemini-2.5-flash',
      'gemini-1.5-pro': 'gemini-2.5-flash',
      'gemini-1.5-pro-latest': 'gemini-2.5-flash',
      'gemini-1.5-flash-8b': 'gemini-2.5-flash',
    };

    // 저장된 모델이 마이그레이션 대상인 경우 자동 변환
    if (config.geminiModel && modelMigrationMap[config.geminiModel]) {
      const oldModel = config.geminiModel;
      config.geminiModel = modelMigrationMap[config.geminiModel];
      configChanged = true;
      fixResults.push({ action: 'Gemini 모델 마이그레이션', success: true, message: `${oldModel} → ${config.geminiModel}로 자동 변환됨` });
    }

    if (config.geminiModel && !validModels.includes(config.geminiModel)) {
      config.geminiModel = 'gemini-2.5-flash';
      configChanged = true;
      fixResults.push({ action: 'Gemini 모델', success: true, message: '권장 모델(gemini-2.5-flash)로 변경됨' });
    }

    if (!config.geminiModel) {
      config.geminiModel = 'gemini-2.5-flash';
      configChanged = true;
      fixResults.push({ action: 'Gemini 모델 설정', success: true, message: '기본 모델 설정됨 (Flash)' });
    }

    // 설정 저장
    if (configChanged) {
      await saveConfig(config);
      console.log('[AI Assistant] ✅ 설정 자동 수정 완료');
    }

    return {
      success: true,
      fixResults,
      message: fixResults.length > 0
        ? `✅ ${fixResults.length}개 항목 자동 수정 완료!`
        : '수정할 항목이 없습니다.'
    };

  } catch (error) {
    console.error('[AI Assistant] 자동 수정 오류:', error);
    return {
      success: false,
      fixResults,
      message: `자동 수정 중 오류 발생: ${(error as Error).message}`
    };
  }
});

// ✅ 발행 후 성과 추적 IPC 핸들러
ipcMain.handle('analytics:addPost', async (_event, url: string, title: string) => {
  try {
    postAnalytics.addPost(url, title);
    return { success: true, message: '글이 추적 목록에 추가되었습니다.' };
  } catch (error) {
    return { success: false, message: `추가 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('analytics:startTracking', async () => {
  try {
    if (postAnalytics.getIsTracking()) {
      return { success: true, message: '이미 추적 중입니다.' };
    }

    analyticsTask = postAnalytics.startTracking().catch((error) => {
      sendLog(`⚠️ 성과 추적 오류: ${(error as Error).message}`);
    });

    sendLog('📊 발행 후 성과 추적 시작');
    return { success: true, message: '성과 추적을 시작했습니다.' };
  } catch (error) {
    return { success: false, message: `추적 시작 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('analytics:stopTracking', async () => {
  try {
    postAnalytics.stopTracking();
    sendLog('🛑 성과 추적 중지');
    return { success: true, message: '성과 추적을 중지했습니다.' };
  } catch (error) {
    return { success: false, message: `추적 중지 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('analytics:getStatus', async () => {
  return {
    isTracking: postAnalytics.getIsTracking(),
    postCount: postAnalytics.getAllPosts().length,
  };
});

ipcMain.handle('analytics:getAllPosts', async () => {
  try {
    const posts = postAnalytics.getAllPosts();
    return { success: true, posts };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('analytics:getAnalytics', async () => {
  try {
    const analytics = postAnalytics.getAnalytics();
    return { success: true, analytics };
  } catch (error) {
    return { success: false, message: `분석 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('analytics:updateMetrics', async () => {
  try {
    await postAnalytics.updateAllMetrics();
    return { success: true, message: '성과 데이터가 업데이트되었습니다.' };
  } catch (error) {
    return { success: false, message: `업데이트 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('analytics:removePost', async (_event, postId: string) => {
  try {
    postAnalytics.removePost(postId);
    return { success: true, message: '글이 추적 목록에서 제거되었습니다.' };
  } catch (error) {
    return { success: false, message: `제거 실패: ${(error as Error).message}` };
  }
});

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
// ✅ openExternalUrl — 로그인 창 구매문의 버튼용
try { ipcMain.handle('openExternalUrl', async (_e: any, url: string) => { const { shell } = require('electron'); await shell.openExternal(url); }); } catch { /* 이미 등록됨 */ }
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
registerKeywordHandlers();
registerProductHandlers();
registerEngagementHandlers();
registerImageTableHandlers();
// ✅ miscHandlers: content:collectFromPlatforms 등 — 연속발행에서 크롤링 시 필요
import { registerMiscHandlers } from './main/ipc/miscHandlers.js';
registerMiscHandlers();
import { registerFlowMarathonHandlers } from './main/ipc/flowMarathonHandlers.js';
registerFlowMarathonHandlers();
import { registerTitleQualityHandlers } from './main/ipc/titleQualityHandlers.js';
registerTitleQualityHandlers();

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

  try {
    //  중지 플래그 초기화
    AutomationService.setMultiAccountAbort(false);
    // ✅ [2026-03-11] 즉시 취소용 AbortController 생성
    const abortController = AutomationService.createAbortController();

    sendLog(`🚀 다중계정 동시발행 시작: ${accountIds.length}개 계정`);

    const results: Array<{ accountId: string; success: boolean; message?: string; url?: string }> = [];

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
    for (let i = 0; i < limitedAccountIds.length; i++) {
      const accountId = limitedAccountIds[i];
      // 중지 체크
      if (AutomationService.isMultiAccountAborted()) {
        results.push({ accountId, success: false, message: '사용자에 의해 중지됨' });
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

        // options에 이미 콘텐츠가 있으면 그대로 사용 (renderer에서 미리 생성된 경우)
        if (preGenerated) {
          structuredContent = preGenerated.structuredContent || preGenerated;
          // ✅ [2026-02-21 FIX] options.title이 명시적으로 있으면 최우선 사용 (preGenerated.title보다 우선)
          // preGenerated.title이 stale(이전 발행) 상태일 수 있기 때문에, options.title이 있으면 그것을 신뢰
          const preGenTitle = preGenerated.title || structuredContent?.selectedTitle;
          title = options?.title || preGenTitle || title;
          content = preGenerated.content || structuredContent?.bodyPlain || content;
          generatedImages = preGenerated.generatedImages || generatedImages;
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
            const source = {
              type: contentSource.type === 'keyword' ? 'keyword' : 'url',
              value: String(sourceValue),
              targetAge: accountSettings?.targetAge || 'all',
              toneStyle: accountSettings?.toneStyle || 'friendly',
              contentMode: options?.contentMode || accountSettings?.contentMode || 'seo',  // ✅ [2026-02-16 FIX] renderer 전달값 우선
              // 쇼핑커넥트 모드 설정
              affiliateUrl: options?.affiliateLink || accountSettings?.affiliateLink,  // ✅ [2026-02-16 FIX] renderer 전달값 우선
            };

            const generated = await withAbortCheck(
              generateStructuredContent(source as any, {
                provider: multiAccountProvider,
                minChars: accountSettings?.minCharCount || 4000,
              }),
              abortController.signal
            );

            structuredContent = generated;
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

            // ✅ headingImageMode === 'none'이면 모든 이미지 생성 건너뛰기
            if (headingImageMode === 'none') {
              sendLog(`   🚫 이미지 없이 모드: 썸네일 포함 모든 이미지 생성 건너뛰기`);
            } else {
              const imgConfig = await loadConfig();
              const imgApiKeys = {
                geminiApiKey: imgConfig.geminiApiKey,
                deepinfraApiKey: (imgConfig as any).deepinfraApiKey,
                openaiImageApiKey: (imgConfig as any).openaiImageApiKey,
                leonardoaiApiKey: (imgConfig as any).leonardoaiApiKey,
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
                    } as any, imgApiKeys),
                    abortController.signal
                  );

                  if (imgResult && imgResult.length > 0) {
                    subheadingImages = imgResult.map((img: any) => ({ ...img, isThumbnail: false }));
                    sendLog(`   ✅ 소제목 이미지 ${subheadingImages.length}개 생성 완료!`);
                  } else {
                    sendLog(`   ⚠️ 소제목 이미지 생성 결과 없음`);
                  }
                } catch (subErr) {
                  if ((subErr as Error).name === 'AbortError' || (subErr as Error).message === 'PUBLISH_CANCELLED') {
                    throw subErr; // abort는 상위로 전파
                  }
                  sendLog(`   ⚠️ 소제목 이미지 생성 실패: ${(subErr as Error).message}`);
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
                sendLog(`   ⚠️ AI 이미지 생성 결과 없음 (이미지 없이 발행)`);
              }
            }
          } catch (imgError) {
            // ✅ [2026-03-11] AbortError는 중지 요청으로 처리
            if ((imgError as Error).name === 'AbortError' || (imgError as Error).message === 'PUBLISH_CANCELLED') {
              sendLog(`   ⏹️ [${account.name}] 이미지 생성 중 즉시 중지됨`);
              results.push({ accountId, success: false, message: '사용자에 의해 즉시 중지됨' });
              break; // for 루프 탈출
            }
            sendLog(`   ⚠️ AI 이미지 생성 실패 (글만 발행): ${(imgError as Error).message}`);
            console.error(`[다중계정] 이미지 생성 오류:`, imgError);
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
        const result = await AutomationService.executePostCycle(payload as any);

        results.push({
          accountId,
          success: result.success,
          message: result.message,
          url: result.url,
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
        results.push({ accountId, success: false, message: errorMsg });
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
  }
});


// ✅ 다중계정 발행 즉시 중지 핸들러
ipcMain.handle('multiAccount:cancel', async () => {
  sendLog('🛑 다중계정 발행 즉시 중지 요청');

  // ✅ [2026-03-11 FIX] 모든 취소 플래그를 동시에 설정하여 즉시 중지
  multiAccountAbortFlag = true;
  AutomationService.setMultiAccountAbort(true);
  AutomationService.requestCancel(); // BlogExecutor의 isCancelRequested() 체크도 트리거
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

ipcMain.handle('datalab:getRelatedKeywords', async (_event, keyword: string) => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] datalab:getRelatedKeywords - 설정 동기화 실패:', e);
  }

  // 라이선스 체크
  if (!(await ensureLicenseValid())) {
    return { success: false, message: '라이선스 인증이 필요합니다. 라이선스를 인증해주세요.' };
  }
  try {
    const datalabClient = createDatalabClient();
    if (!datalabClient) {
      return {
        success: false,
        message: '네이버 데이터랩 API가 설정되지 않았습니다.',
      };
    }

    const related = await datalabClient.getRelatedKeywords(keyword);
    return {
      success: true,
      data: related,
    };
  } catch (error) {
    return {
      success: false,
      message: `관련 키워드 조회 실패: ${(error as Error).message}`,
    };
  }
});

ipcMain.handle(
  'automation:generateStructuredContent',
  async (
    _event,
    payload: { assembly: SourceAssemblyInput },
  ): Promise<{ success: boolean; content?: StructuredContent; message?: string; imageCount?: number }> => {
    // ✅ 실행 직전 최신 설정 강제 동기화 (API 키 정합성 보장)
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

      // ✅ contentMode 전달 (SEO / 홈판 모드)
      const contentMode = (payload.assembly as any).contentMode as 'seo' | 'homefeed' | undefined;
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

      // ✅ [2026-02-24] 키워드를 제목으로 그대로 사용 옵션 전달
      const useKeywordAsTitle = (payload.assembly as any).useKeywordAsTitle as boolean | undefined;
      const keywordForTitle = (payload.assembly as any).keywordForTitle as string | undefined;
      if (useKeywordAsTitle) {
        source.useKeywordAsTitle = true;
        source.keywordForTitle = keywordForTitle || '';
        console.log(`[Main] 📌 키워드를 제목으로 사용: "${(keywordForTitle || '').substring(0, 30)}"`)
      }

      console.log('[Main] 구조화 콘텐츠 생성 시작');
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

      // ✅ [2026-04-03 FIX] 콘텐츠 생성 전 AbortController 생성 — 중지 시 즉시 abort
      const genAbortController = AutomationService.createGeneralAbortController();
      const genSignal = genAbortController.signal;

      // ✅ [Phase 3B] 네트워크/타임아웃 에러 시 자동 재시도 (최대 2회, exponential backoff)
      const content = await withRetry(
        () => {
          // ✅ [2026-04-03] 매 시도마다 abort 체크
          if (genSignal.aborted) throw new Error('사용자가 작업을 취소했습니다.');
          return generateStructuredContent(source, { provider, minChars, signal: genSignal } as any);
        },
        {
          maxRetries: 2,
          baseDelayMs: 3000,
          shouldRetry: (error) => {
            // ✅ [2026-04-03] abort 에러는 재시도하지 않음
            if (genSignal.aborted) return false;
            return isRetryableError(error);
          },
          onRetry: (error, attempt) => {
            console.log(`[Main] ⚠️ 콘텐츠 생성 재시도 (${attempt}/2): ${error.message}`);
          },
        }
      );

      if (warnings.length) {
        content.quality.warnings = Array.from(new Set([...(content.quality.warnings ?? []), ...warnings]));
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
ipcMain.handle('image:searchNaver', async (_event, keyword: string): Promise<{ success: boolean; images?: any[]; message?: string }> => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] image:searchNaver - 설정 동기화 실패:', e);
  }

  if (!(await ensureLicenseValid())) {
    return { success: false, message: '라이선스 인증이 필요합니다.' };
  }

  const mediaCheck = await enforceFreeTier('media', 1);
  if (!mediaCheck.allowed) {
    return mediaCheck.response;
  }
  try {
    if (!keyword || !keyword.trim()) {
      return { success: false, message: '검색 키워드가 비어있습니다.' };
    }

    console.log(`[Main] 네이버 이미지 검색: "${keyword}"`);

    const normalizeEnv = (v: string | undefined): string => String(v || '').trim().replace(/^['"]|['"]$/g, '').trim();

    const collectEnvPairs = (baseIdKey: string, baseSecretKey: string, labelPrefix: string): Array<{ id: string; secret: string; label: string }> => {
      const pairs: Array<{ id: string; secret: string; label: string }> = [];

      const baseId = normalizeEnv((process.env as any)[baseIdKey]);
      const baseSecret = normalizeEnv((process.env as any)[baseSecretKey]);
      if (baseId && baseSecret) {
        pairs.push({ id: baseId, secret: baseSecret, label: `${labelPrefix}#1` });
      }

      // NAVER_CLIENT_ID_2 / NAVER_CLIENT_SECRET_2 ...
      for (let i = 2; i <= 10; i++) {
        const id = normalizeEnv((process.env as any)[`${baseIdKey}_${i}`]);
        const secret = normalizeEnv((process.env as any)[`${baseSecretKey}_${i}`]);
        if (id && secret) {
          pairs.push({ id, secret, label: `${labelPrefix}#${i}` });
        }
      }

      return pairs;
    };

    const credentialCandidates: Array<{ id: string; secret: string; label: string }> = [
      ...collectEnvPairs('NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_CLIENT_*'),
      ...collectEnvPairs('NAVER_DATALAB_CLIENT_ID', 'NAVER_DATALAB_CLIENT_SECRET', 'NAVER_DATALAB_*'),
    ];

    if (credentialCandidates.length === 0) {
      const config = await loadConfig();
      if (config.naverDatalabClientId && config.naverDatalabClientSecret) {
        credentialCandidates.push({
          id: String(config.naverDatalabClientId).trim(),
          secret: String(config.naverDatalabClientSecret).trim(),
          label: 'config#1',
        });
      } else {
        return {
          success: false,
          message: '네이버 API 키가 설정되어 있지 않습니다. 환경설정에서 네이버 Client ID와 Secret을 입력해주세요.',
        };
      }
    }

    let credentialIndex = 0;
    console.log(`[Main] 네이버 API 키 후보 수: ${credentialCandidates.length}개 (현재: ${credentialCandidates[0]?.label || 'unknown'})`);
    const FREE_DAILY_LIMIT = 100;
    // ✅ 유료 플랜 사용자(크레딧 보유자)를 위해 한도를 대폭 상향 (사실상 무제한)
    const PAID_DAILY_LIMIT = 9999;
    // ✅ 여러 검색 쿼리로 충분한 이미지 수집 (최대 50개)
    const MAX_IMAGES = 50;
    const TARGET_IMAGES = MAX_IMAGES;
    const allImages: any[] = [];
    const usedUrls = new Set<string>();
    const usedImageHashes = new Set<string>(); // 이미지 해시로 중복 체크

    const httpErrors: Array<{ status: number; query: string; errorCode?: string; errorMessage?: string }> = [];

    const NAVER_NEW_APP_GUIDE_URL = 'https://developers.naver.com/apps/#/myapps/oBaehge5xTtI73Z0x1Dx/overview';
    const buildNaverQuotaGuide = (): string =>
      `\n\n네이버 이미지 API 일일 한도(쿼리) 초과로 보이면, 아래 링크에서 네이버 애플리케이션을 추가로 생성한 뒤 새 Client ID/Secret을 발급받아 환경설정에 등록하세요.\n` +
      `${NAVER_NEW_APP_GUIDE_URL}`;
    const maybeAppendNaverQuotaGuide = (detail: string): string => {
      const d = String(detail || '');
      const looksLikeQuota = /count\/quota\s*=\s*\d+\s*\/\s*\d+/i.test(d) || /Query limit exceeded/i.test(d);
      return looksLikeQuota ? `${d}${buildNaverQuotaGuide()}` : d;
    };

    const parseNaverErrorBody = (bodyText: string): { errorCode: string; errorMessage: string } => {
      let errorCode = '';
      let errorMessage = String(bodyText || '').trim();
      try {
        const parsed = JSON.parse(bodyText || '{}') as any;
        if (parsed && typeof parsed === 'object') {
          errorCode = String(parsed.errorCode || '').trim();
          errorMessage = String(parsed.errorMessage || parsed.message || bodyText || '').trim();
        }
      } catch {
      }
      return { errorCode, errorMessage };
    };

    const sleep = async (ms: number): Promise<void> => {
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
    };

    const fetchWithRotation = async (searchUrl: string, queryLabel: string): Promise<any | null> => {
      let attempts = 0;
      let lastStatus = 0;
      let lastErrorCode = '';
      let lastErrorMessage = '';
      let sameKey429Retries = 0;

      while (attempts < credentialCandidates.length) {
        const cred = credentialCandidates[credentialIndex];
        const keyLabel = cred?.label || `key#${credentialIndex + 1}`;

        const response = await fetch(searchUrl, {
          method: 'GET',
          headers: {
            'X-Naver-Client-Id': cred?.id || '',
            'X-Naver-Client-Secret': cred?.secret || '',
          },
        });

        if (response.ok) {
          return await response.json();
        }

        let bodyText = '';
        try {
          bodyText = await response.text();
        } catch {
        }
        const parsed = parseNaverErrorBody(bodyText);
        lastStatus = response.status;
        lastErrorCode = parsed.errorCode;
        lastErrorMessage = parsed.errorMessage;
        httpErrors.push({ status: response.status, query: queryLabel, errorCode: parsed.errorCode, errorMessage: parsed.errorMessage });
        console.warn(`[Main] 네이버 이미지 검색 "${queryLabel}" 실패(${keyLabel}): ${response.status} ${parsed.errorCode} ${String(parsed.errorMessage || '').slice(0, 140)}`);

        if (response.status === 429) {
          const retryAfterRaw = String(response.headers.get('retry-after') || '').trim();
          const retryAfterSeconds = Number.parseInt(retryAfterRaw, 10);
          const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;

          if (sameKey429Retries < 2) {
            sameKey429Retries++;
            const backoffMs = Math.min(1200, 200 * Math.pow(2, sameKey429Retries - 1));
            const waitMs = Math.max(retryAfterMs, backoffMs);
            if (waitMs > 0) {
              await sleep(waitMs);
            }
            continue;
          }

          sameKey429Retries = 0;
          credentialIndex = (credentialIndex + 1) % credentialCandidates.length;
          attempts++;
          console.log(`[Main] 네이버 API 키 전환: ${keyLabel} → ${credentialCandidates[credentialIndex]?.label || `key#${credentialIndex + 1}`}`);
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          sameKey429Retries = 0;
          credentialIndex = (credentialIndex + 1) % credentialCandidates.length;
          attempts++;
          console.log(`[Main] 네이버 API 키 전환: ${keyLabel} → ${credentialCandidates[credentialIndex]?.label || `key#${credentialIndex + 1}`}`);
          continue;
        }

        return null;
      }

      // 모든 키가 429/401/403 등으로 실패
      const detail = `${lastStatus}${lastErrorCode ? ` ${lastErrorCode}` : ''}${lastErrorMessage ? ` ${String(lastErrorMessage).slice(0, 220)}` : ''}`.trim();
      throw new Error(`NAVER_ALL_KEYS_FAILED: ${detail}`);
    };

    // ✅ 키워드에서 핵심 단어 추출 (조사/접속사 제거)
    const stopWords = ['은', '는', '이', '가', '을', '를', '의', '에', '에서', '으로', '로', '와', '과', '도', '만', '까지', '부터', '에게', '한테', '께', '보다', '처럼', '같이', '대해', '대한', '위한', '통한', '관한', '있는', '없는', '하는', '되는', '된', '할', '될', '하고', '되고', '그리고', '하지만', '그러나', '또한', '및', '등', '것', '수', '때', '중', '후', '전', '내', '외'];
    const keywordParts = keyword.split(/[\s,.\-!?:;'"()[\]{}]+/).filter(p => p.length >= 2 && !stopWords.includes(p));
    const coreKeywords = keywordParts.slice(0, 4); // 핵심 키워드 4개

    // 검색 쿼리 목록 (원본 키워드 + 변형 키워드)
    const searchQueries = [
      keyword,                                    // 원본 키워드
      coreKeywords.join(' '),                     // 핵심 키워드만
      `${keyword} 사진`,                          // + 사진
      `${keyword} 이미지`,                        // + 이미지
      `${keyword} 실시간`,                        // + 실시간 (경기 등)
    ];

    // 핵심 단어 조합 추가
    if (coreKeywords.length > 1) {
      searchQueries.push(coreKeywords[0]); // 첫 번째 단어만
      searchQueries.push(`${coreKeywords[0]} ${coreKeywords[1]}`); // 첫 두 단어
      if (coreKeywords.length > 2) {
        searchQueries.push(`${coreKeywords[0]} ${coreKeywords[2]}`); // 첫 번째 + 세 번째
      }
    }

    // 중복 제거
    const uniqueQueries = [...new Set(searchQueries)].filter(q => q.trim());

    for (const query of uniqueQueries) {
      // 이미 50개 이상 수집했으면 중단
      if (allImages.length >= MAX_IMAGES) break;
      if (allImages.length >= TARGET_IMAGES) break;

      try {
        // ✅ display=100 (네이버 API 최대값), sort=date (최신순 우선)
        const searchUrl = `https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(query)}&display=100&sort=date`;

        const data = await fetchWithRotation(searchUrl, query);
        if (!data) {
          continue;
        }

        if (data.items && data.items.length > 0) {
          for (const item of data.items) {
            // 중복 URL 제외
            if (usedUrls.has(item.link)) continue;

            // ✅ 이미지 해시로 유사 이미지 중복 체크 (URL 끝부분 기반)
            const urlHash = item.link.split('/').pop()?.split('?')[0] || '';
            if (urlHash && usedImageHashes.has(urlHash)) continue;

            // ✅ 무관한 이미지 필터링 (광고, 로고, 아이콘 등 제외)
            const title = item.title?.replace(/<[^>]*>/g, '').toLowerCase() || '';
            const isIrrelevant =
              title.includes('광고') ||
              title.includes('배너') ||
              title.includes('로고') ||
              title.includes('아이콘') ||
              title.includes('버튼') ||
              title.includes('무료이미지') ||
              title.includes('클립아트') ||
              (item.sizewidth && item.sizeheight && item.sizewidth < 200 && item.sizeheight < 200); // 너무 작은 이미지

            if (isIrrelevant) continue;

            // ✅ 키워드 관련성 체크 (핵심 키워드 중 하나라도 포함되어야 함)
            const hasRelevance = coreKeywords.length === 0 || coreKeywords.some(kw =>
              title.includes(kw.toLowerCase()) || item.link.toLowerCase().includes(kw.toLowerCase())
            );

            // 관련성이 낮아도 처음 20개는 수집 (검색 결과 상위는 대체로 관련성 높음)
            if (!hasRelevance && allImages.length >= 20) continue;

            usedUrls.add(item.link);
            if (urlHash) usedImageHashes.add(urlHash);

            allImages.push({
              id: `naver-${allImages.length}`,
              url: item.link,
              thumbnailUrl: item.thumbnail,
              title: item.title?.replace(/<[^>]*>/g, '') || '',
              source: 'naver',
              width: item.sizewidth,
              height: item.sizeheight,
            });

            // 50개 도달하면 중단
            if (allImages.length >= MAX_IMAGES) break;
            if (allImages.length >= TARGET_IMAGES) break;
          }
          console.log(`[Main] 검색 "${query}": ${data.items.length}개 발견 (누적: ${allImages.length}개)`);
        }
      } catch (queryError) {
        const msg = (queryError as Error).message;
        if (msg.startsWith('NAVER_ALL_KEYS_FAILED:')) {
          return {
            success: false,
            message: `네이버 이미지 API 모든 키가 실패했습니다. ${maybeAppendNaverQuotaGuide(msg.replace('NAVER_ALL_KEYS_FAILED:', '').trim())}`,
          };
        }
        console.warn(`[Main] 검색 "${query}" 오류:`, msg);
      }
    }

    if (allImages.length === 0) {
      const relaxedQueries = [
        coreKeywords.join(' '),
        coreKeywords[0],
        keywordParts[0],
        keyword,
      ]
        .map((q) => String(q || '').trim())
        .filter((q) => q.length >= 2);

      const uniqueRelaxedQueries = [...new Set(relaxedQueries)].slice(0, 4);

      for (const query of uniqueRelaxedQueries) {
        if (allImages.length >= MAX_IMAGES) break;
        if (allImages.length >= TARGET_IMAGES) break;

        try {
          const searchUrl = `https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(query)}&display=100&sort=date`;

          const data = await fetchWithRotation(searchUrl, query);
          if (!data) {
            continue;
          }

          if (data.items && data.items.length > 0) {
            for (const item of data.items) {
              if (usedUrls.has(item.link)) continue;

              const urlHash = item.link.split('/').pop()?.split('?')[0] || '';
              if (urlHash && usedImageHashes.has(urlHash)) continue;

              const title = item.title?.replace(/<[^>]*>/g, '').toLowerCase() || '';
              const isIrrelevant =
                title.includes('광고') ||
                title.includes('배너') ||
                title.includes('로고') ||
                title.includes('아이콘') ||
                title.includes('버튼') ||
                (item.sizewidth && item.sizeheight && item.sizewidth < 80 && item.sizeheight < 80);
              if (isIrrelevant) continue;

              usedUrls.add(item.link);
              if (urlHash) usedImageHashes.add(urlHash);

              allImages.push({
                id: `naver-${allImages.length}`,
                url: item.link,
                thumbnailUrl: item.thumbnail,
                title: item.title?.replace(/<[^>]*>/g, '') || '',
                source: 'naver',
                width: item.sizewidth,
                height: item.sizeheight,
              });

              if (allImages.length >= MAX_IMAGES) break;
              if (allImages.length >= TARGET_IMAGES) break;
            }
            console.log(`[Main] (완화) 검색 "${query}": ${data.items.length}개 발견 (누적: ${allImages.length}개)`);
          }
        } catch (queryError) {
          const msg = (queryError as Error).message;
          if (msg.startsWith('NAVER_ALL_KEYS_FAILED:')) {
            return {
              success: false,
              message: `네이버 이미지 API 모든 키가 실패했습니다. ${maybeAppendNaverQuotaGuide(msg.replace('NAVER_ALL_KEYS_FAILED:', '').trim())}`,
            };
          }
          console.warn(`[Main] (완화) 검색 "${query}" 오류:`, msg);
        }
      }
    }

    if (allImages.length > 0) {
      console.log(`[Main] 네이버 이미지 검색 완료: 총 ${allImages.length}개 발견 (중복/무관 이미지 필터링 적용)`);
      const response = { success: true, images: allImages };
      if ((response.images?.length ?? 0) > 0 && (await isFreeTierUser())) {
        await consumeQuota('media', 1);
      }
      return response;
    } else {
      if (httpErrors.length > 0) {
        const mostRecent = httpErrors[httpErrors.length - 1];
        const detail = `${mostRecent.status}${mostRecent.errorCode ? ` ${mostRecent.errorCode}` : ''}${mostRecent.errorMessage ? ` ${String(mostRecent.errorMessage).slice(0, 220)}` : ''}`.trim();
        return { success: false, message: `네이버 이미지 API 요청 실패: ${maybeAppendNaverQuotaGuide(detail)}` };
      }
      return { success: false, message: '검색 결과가 없습니다.' };
    }
  } catch (error) {
    console.error('[Main] 네이버 이미지 검색 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

// ✅ [100점 개선] AI 이미지 검색어 최적화 IPC 핸들러
ipcMain.handle('image:optimizeSearchQuery', async (_event, title: string, heading: string): Promise<{
  success: boolean;
  optimizedQuery?: string;
  coreSubject?: string;
  broaderQuery?: string;
  category?: string;
  message?: string;
}> => {
  try {
    const { optimizeImageSearchQuery } = await import('./gemini.js');
    const result = await optimizeImageSearchQuery(title, heading);
    console.log(`[Main] 검색어 최적화: "${heading}" → "${result.optimizedQuery}"`);
    return {
      success: true,
      optimizedQuery: result.optimizedQuery,
      coreSubject: result.coreSubject,
      broaderQuery: result.broaderQuery,
      category: result.category,
    };
  } catch (error) {
    console.error('[Main] 검색어 최적화 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

// ✅ [100점 개선] 핵심 주제 추출 IPC 핸들러
ipcMain.handle('image:extractCoreSubject', async (_event, title: string): Promise<{
  success: boolean;
  subject?: string;
  message?: string;
}> => {
  try {
    const { extractCoreSubject } = await import('./gemini.js');
    const subject = await extractCoreSubject(title);
    console.log(`[Main] 핵심 주제 추출: "${title}" → "${subject}"`);
    return { success: true, subject };
  } catch (error) {
    console.error('[Main] 핵심 주제 추출 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

// ✅ [100점 개선] 배치 검색어 최적화 IPC 핸들러 (API 호출 1회로 모든 소제목 처리)
ipcMain.handle('image:batchOptimizeSearchQueries', async (_event, title: string, headings: string[]): Promise<{
  success: boolean;
  results?: Array<{ heading: string; optimizedQuery: string; broaderQuery: string }>;
  message?: string;
}> => {
  try {
    const { batchOptimizeImageSearchQueries } = await import('./gemini.js');
    const results = await batchOptimizeImageSearchQueries(title, headings);
    console.log(`[Main] 배치 검색어 최적화: ${results.length}개 소제목 완료`);
    return { success: true, results };
  } catch (error) {
    console.error('[Main] 배치 검색어 최적화 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

// ✅ [100점 개선] URL에서 이미지 크롤링 IPC 핸들러 (뉴스, 블로그 등)
ipcMain.handle('image:crawlFromUrl', async (_event, url: string): Promise<{
  success: boolean;
  images?: string[];
  title?: string;
  message?: string;
}> => {
  try {
    if (!url || !url.trim()) {
      return { success: false, message: 'URL이 비어있습니다.' };
    }

    console.log(`[Main] URL에서 이미지 크롤링: ${url}`);

    // puppeteer로 페이지 접속 및 이미지 추출
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // 페이지 제목 추출
      const pageTitle = await page.title();

      // 이미지 URL 추출 (OG 이미지, 본문 이미지, 갤러리 이미지)
      const images = await page.evaluate(() => {
        const imageUrls: string[] = [];
        const seenUrls = new Set<string>();

        // 1. OG 이미지 (가장 대표성 높음)
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
        if (ogImage && !seenUrls.has(ogImage)) {
          imageUrls.push(ogImage);
          seenUrls.add(ogImage);
        }

        // 2. 본문 이미지 (article, main, content 영역)
        const contentSelectors = ['article img', 'main img', '.content img', '.article-body img', '.post-content img', '#content img'];
        for (const selector of contentSelectors) {
          const imgs = document.querySelectorAll(selector);
          imgs.forEach((img: any) => {
            const src = img.src || img.dataset?.src;
            if (src && src.startsWith('http') && !seenUrls.has(src)) {
              // 작은 이미지 필터링
              const width = parseInt(img.width || img.naturalWidth || '0', 10);
              const height = parseInt(img.height || img.naturalHeight || '0', 10);
              if (width < 100 && height < 100) return;

              imageUrls.push(src);
              seenUrls.add(src);
            }
          });
        }

        // 3. 네이버 뉴스/엔터 전용 셀렉터
        const naverSelectors = [
          '.end_photo_org img',  // 네이버 뉴스 본문 이미지
          '.newsct_body img',   // 네이버 뉴스 본문
          '.article_img img',   // 기사 이미지
          '#newsViewArea img',  // 뉴스 뷰 영역
        ];
        for (const selector of naverSelectors) {
          const imgs = document.querySelectorAll(selector);
          imgs.forEach((img: any) => {
            const src = img.src || img.dataset?.src;
            if (src && src.startsWith('http') && !seenUrls.has(src)) {
              imageUrls.push(src);
              seenUrls.add(src);
            }
          });
        }

        return imageUrls.slice(0, 10); // 최대 10개
      });

      await browser.close().catch(() => undefined);

      if (images.length > 0) {
        console.log(`[Main] URL에서 ${images.length}개 이미지 추출 완료`);
        return { success: true, images, title: pageTitle };
      } else {
        return { success: false, message: '이미지를 찾을 수 없습니다.' };
      }
    } catch (pageError) {
      await browser.close().catch(() => undefined);
      throw pageError;
    }
  } catch (error) {
    console.error('[Main] URL 이미지 크롤링 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

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
      console.log(`[Main] - Client ID: ${clientId.substring(0, 10)}... (길이: ${clientId.length})`);
      console.log(`[Main] - Client Secret: ***${clientSecret.substring(clientSecret.length - 4)} (길이: ${clientSecret.length})`);
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
      imageBuffer = Buffer.from(base64Data, 'base64');
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
ipcMain.handle('schedule:getAll', async (): Promise<{ success: boolean; posts?: ScheduledPost[]; message?: string }> => {
  // 라이선스 체크
  if (!(await ensureLicenseValid())) {
    return { success: false, message: '라이선스 인증이 필요합니다. 라이선스를 인증해주세요.' };
  }
  try {
    const posts = await getAllScheduledPosts();
    return { success: true, posts };
  } catch (error) {
    console.error('[Main] 스케줄 조회 실패:', (error as Error).message);
    return { success: false, message: (error as Error).message };
  }
});

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

ipcMain.handle('schedule:remove', async (_event, postId: string): Promise<{ success: boolean; message?: string }> => {
  // 라이선스 체크
  if (!(await ensureLicenseValid())) {
    return { success: false, message: '라이선스 인증이 필요합니다. 라이선스를 인증해주세요.' };
  }
  try {
    if (!postId || !postId.trim()) {
      return { success: false, message: '포스트 ID가 비어있습니다.' };
    }

    await removeScheduledPost(postId);
    console.log(`[Main] 스케줄 포스트 삭제 완료: ${postId}`);
    return { success: true };
  } catch (error) {
    console.error('[Main] 스케줄 포스트 삭제 실패:', (error as Error).message);
    return { success: false, message: (error as Error).message };
  }
});

// ✅ [2026-03-14 FIX] 예약 시간 변경 IPC 핸들러
ipcMain.handle('schedule:reschedule', async (_event, postId: string, newTime: string): Promise<{ success: boolean; message?: string }> => {
  if (!(await ensureLicenseValid())) {
    return { success: false, message: '라이선스 인증이 필요합니다.' };
  }
  try {
    if (!postId || !newTime) {
      return { success: false, message: '포스트 ID와 새 시간이 필요합니다.' };
    }
    await rescheduleScheduledPost(postId, newTime);
    sendLog(`📅 예약 시간 변경 완료: ${newTime}`);
    return { success: true, message: '예약 시간이 변경되었습니다.' };
  } catch (error) {
    console.error('[Main] 예약 시간 변경 실패:', (error as Error).message);
    return { success: false, message: (error as Error).message };
  }
});

// ✅ [2026-03-14 FIX] 실패한 예약 재시도 IPC 핸들러
ipcMain.handle('schedule:retry', async (_event, postId: string): Promise<{ success: boolean; message?: string }> => {
  if (!(await ensureLicenseValid())) {
    return { success: false, message: '라이선스 인증이 필요합니다.' };
  }
  try {
    if (!postId) {
      return { success: false, message: '포스트 ID가 필요합니다.' };
    }
    await retryScheduledPostFn(postId);
    sendLog(`🔄 예약 재시도 등록 완료`);
    return { success: true, message: '1분 후 재시도됩니다.' };
  } catch (error) {
    console.error('[Main] 예약 재시도 실패:', (error as Error).message);
    return { success: false, message: (error as Error).message };
  }
});

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
      preload: loginPreloadPath,
      webSecurity: true,
      devTools: !app.isPackaged, // ✅ 프로덕션에서는 비활성화
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
  } catch (error) {
    debugLog(`[createLoginWindow] !!! ERROR loading HTML: ${(error as Error).message}`);
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
            } else {
              debugLog('[checkLicense] Main window will be created by login:success handler');
            }
            resolve(true);
          } else {
            // 라이선스가 유효하지 않으면 앱 종료
            debugLog('[checkLicense] License not valid after login window closed, quitting app');
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
            } else {
              debugLog('[checkLicense] Main window will be created by login:success handler');
            }
            resolve(true);
          } else {
            // 라이선스가 유효하지 않으면 앱 종료
            debugLog('[checkLicense] License not valid after login window closed, quitting app');
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

// ✅ [2026-04-03] 디버그 로그 확장
try {
  const _fs2 = require('fs');
  const _p = require('path');
  const dbg = _p.join(process.env.TEMP || '/tmp', 'bln-startup-debug.log');
  _fs2.appendFileSync(dbg, `\n[${new Date().toISOString()}] Before requestSingleInstanceLock\n`);
} catch(e) { /* 스타트업 디버그 로그 실패 — Logger 미초기화 상태이므로 무시 */ }

const gotTheLock = app.requestSingleInstanceLock();

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

app.on('before-quit', (event) => {
  if (isQuittingForLogout) return; // 재귀 방지 (logoutFromServer 완료 후 app.quit() 재호출 시)
  event.preventDefault();
  isQuittingForLogout = true;

  console.log('[Main] before-quit: 서버 로그아웃 시도...');

  import('./licenseManager.js')
    .then((lm) => lm.logoutFromServer())
    .catch((err) => console.warn('[Main] before-quit 로그아웃 실패 (무시):', err))
    .finally(() => {
      console.log('[Main] before-quit: 로그아웃 완료, 앱 종료');
      app.quit(); // 로그아웃 완료 후 실제 종료
    });
});

// ffmpeg 경고 무시 (미디어 재생 기능 미사용)
app.commandLine.appendSwitch('disable-features', 'MediaFoundationVideoCapture');

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

app.whenReady().then(async () => {
  try {
    // ✅ [2026-02-18] setName은 lock 앞에서 이미 호출됨 (single instance lock 충돌 방지)

    // ✅ [v1.4.54] 앱 시작 시 오래된 디버그 덤프 정리 (디스크 과점유 방지)
    try {
      const { cleanupOldDumps } = await import('./debug/domDumpManager.js');
      const result = await cleanupOldDumps();
      if (result.deleted > 0) {
        debugLog(`[DumpCleaner] 오래된 덤프 ${result.deleted}개 정리 완료 (남은 ${result.remainingCount}개, ${result.remainingSizeMB}MB)`);
      }
    } catch (cleanErr) {
      debugLog(`[DumpCleaner] 정리 실패 (무시): ${(cleanErr as Error).message}`);
    }

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

    // ✅ [보안] 앱 시작 전 서버 동기화 (점검 모드, 버전 체크, 기기 차단)
    // 이 체크가 가장 먼저 실행되어 점검/차단/구버전 시 앱이 실행되지 않도록 함
    debugLog('[Main] ⚡ Performing pre-launch server sync...');
    const preLaunchSync = await performServerSync(false);

    if (!preLaunchSync.allowed) {
      debugLog(`[Main] ⛔ Pre-launch server sync denied: ${preLaunchSync.error}`);
      // 이미 performServerSync에서 다이얼로그를 표시했으므로 바로 종료
      debugLog('[Main] Exiting app due to server sync denial...');
      setTimeout(() => {
        app.quit();
        process.exit(0);
      }, 500);
      return;
    }
    debugLog('[Main] ✅ Pre-launch server sync passed');

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
          console.log(msg);  // 터미널에도 출력
          sendLog(msg);      // 렌더러 UI에도 전달
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
      try {
        const scheduledPosts = await loadScheduledPosts();
        const now = new Date();

        for (const post of scheduledPosts) {
          // ✅ 날짜 파싱 수정: "2025-12-12 02:09" 형식을 "2025-12-12T02:09:00" ISO 형식으로 변환
          const scheduleDateStr = post.scheduleDate.includes('T')
            ? post.scheduleDate
            : post.scheduleDate.replace(' ', 'T') + ':00';
          const scheduleDate = new Date(scheduleDateStr);

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
              post.status = 'cancelled';
              await saveScheduledPost(post);
              continue;
            }

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
                    
                    debugInfo.searchPostId = postId;
                    debugInfo.searchTitle = title;
                    
                    let foundPost = null;
                    
                    // 1. postId로 정확히 찾기
                    if (postId && postId.trim() && postId !== 'null' && postId !== 'undefined') {
                      foundPost = posts.find(p => p.id === postId);
                      debugInfo.step1_postId = foundPost ? 'found' : 'not_found';
                    }
                    
                    // 2. 정확한 제목으로 찾기
                    if (!foundPost && title) {
                      foundPost = posts.find(p => p.title === title);
                      debugInfo.step2_exactTitle = foundPost ? 'found' : 'not_found';
                    }
                    
                    // 3. 유사한 제목으로 찾기 (정규화)
                    if (!foundPost && title) {
                      const normalizeTitle = (t) => (t || '').trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
                      const normalizedSearchTitle = normalizeTitle(title);
                      foundPost = posts.find(p => {
                        const normalizedPostTitle = normalizeTitle(p.title);
                        return normalizedPostTitle === normalizedSearchTitle || 
                               normalizedPostTitle.includes(normalizedSearchTitle) ||
                               normalizedSearchTitle.includes(normalizedPostTitle);
                      });
                      debugInfo.step3_similarTitle = foundPost ? 'found' : 'not_found';
                    }
                    
                    // 4. 가장 최근 글 사용 (fallback)
                    if (!foundPost && posts.length > 0) {
                      foundPost = posts.sort((a, b) => {
                        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                        return timeB - timeA;
                      })[0];
                      debugInfo.step4_fallback = foundPost ? foundPost.title : 'not_found';
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
                console.log(`[Scheduler] Step 3 (유사 제목): ${generatedPosts.debug.step3_similarTitle || 'skipped'}`);
                console.log(`[Scheduler] Step 4 (fallback): ${generatedPosts.debug.step4_fallback || 'skipped'}`);
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
              const accountNaverId = accountConfig.savedNaverId || '';
              const accountNaverPassword = accountConfig.savedNaverPassword || '';

              if (!accountNaverId || !accountNaverPassword) {
                throw new Error('네이버 계정 정보가 설정되지 않았습니다. 환경설정에서 "계정 정보 기억하기"를 체크해주세요.');
              }

              console.log(`[Scheduler] 네이버 계정 확인 완료: ${accountNaverId}`);
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
              const normalizedId = accountNaverId.trim().toLowerCase();
              let schedulerAutomation = automationMap.get(normalizedId);

              if (schedulerAutomation) {
                console.log(`[Scheduler] 기존 "${accountNaverId}" 세션 재사용`);
                automation = schedulerAutomation;
              } else {
                console.log(`[Scheduler] 새 브라우저 세션 시작 (${accountNaverId})`);
                // ✅ [2026-03-02] sendLog 주입 → 예약발행 자동화 로그도 UI에 표시
                schedulerAutomation = new NaverBlogAutomation({
                  naverId: accountNaverId,
                  naverPassword: accountNaverPassword,
                  headless: false,
                  slowMo: 50,
                }, (msg: string) => { console.log(msg); sendLog(msg); });
                automationMap.set(normalizedId, schedulerAutomation);
                automation = schedulerAutomation; // 하위 호환성 유지
              }

              const runOptions: RunOptions = {
                title: postData.title,
                content: postData.content, // ✅ content 필드 사용
                structuredContent: postData.structuredContent || {
                  selectedTitle: postData.title,
                  headings: postData.headings || [],
                  bodyPlain: postData.content, // ✅ content 필드 사용
                  content: postData.content, // ✅ content 필드 사용
                  hashtags: postData.hashtags || []
                },
                hashtags: postData.hashtags || [],
                images: images,
                publishMode: 'publish', // ✅ 즉시 발행 (예약이 아님!)
                toneStyle: postData.toneStyle || 'professional'
              };

              console.log(`[Scheduler] 자동화 실행 시작: ${postData.title}`);
              sendLog(`🚀 예약 발행 실행 중: ${postData.title}`);

              await schedulerAutomation.run(runOptions);

              console.log(`[Scheduler] ✅ 예약 발행 성공: ${postData.title}`);
              sendLog(`✅ 예약 발행 완료: ${postData.title}`);

              // ✅ 백그라운드 작업이므로 브라우저 정리 (단, 직접 명시적으로 keepBrowserOpen을 할 수 없으므로 일단 닫음)
              await schedulerAutomation.closeBrowser().catch(() => undefined);
              automationMap.delete(normalizedId);
              if (automation === schedulerAutomation) automation = null;

              // ✅ 발행된 글 URL 가져오기 (네이버 블로그 URL 구성)
              const publishedUrl = `https://blog.naver.com/${accountNaverId}`;

              // ✅ 상태를 published로 변경하고 발행 정보 저장
              post.status = 'published';
              post.publishedAt = new Date().toISOString();
              post.publishedUrl = publishedUrl;
              await saveScheduledPost(post);

              // ✅ 반복 일정 처리
              await handleRecurringPost(post);

              // ✅ UI에 알림 전송
              mainWindow?.webContents.send('automation:log', `✅ 예약 발행 완료: ${post.title}`);
              mainWindow?.webContents.send('automation:status', { success: true, message: `예약 발행 완료: ${post.title}` });

              // ✅ 자동 초기화 (다음 글 작성 준비)
              mainWindow?.webContents.send('automation:reset-fields');
              sendLog(`🆕 다음 글 작성을 위해 필드를 초기화합니다...`);

            } catch (publishError) {
              const errorMsg = (publishError as Error).message;
              console.error(`[Scheduler] ❌ 예약 발행 실패: ${post.title}`, errorMsg);
              sendLog(`❌ 예약 발행 실패: ${post.title} - ${errorMsg}`);

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

              // ✅ 실패 시 상태를 cancelled로 변경
              post.status = 'cancelled';
              await saveScheduledPost(post);

              // ✅ UI에 오류 알림
              mainWindow?.webContents.send('automation:log', `❌ 예약 발행 실패: ${post.title} - ${errorMsg}`);
              mainWindow?.webContents.send('automation:status', { success: false, message: `예약 발행 실패: ${errorMsg}` });
            }
          }
        }
      } catch (error) {
        console.error('[Scheduler] 예약 발행 처리 중 오류:', (error as Error).message);
        sendLog(`⚠️ 예약 발행 처리 중 오류: ${(error as Error).message}`);
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
        // 서버에서 재검증 (선택사항)
        try {
          await revalidateLicense(process.env.LICENSE_SERVER_URL);
          console.log('[Main] 라이선스 재검증 완료');
        } catch (error) {
          console.error('[Main] 라이선스 재검증 중 오류:', (error as Error).message);
        }
      }
    });

    // ✅ 서버 동기화 (버전 체크, 차단 체크, 글로벌 스위치)
    debugLog('[Main] Performing server sync...');
    const syncResult = await performServerSync();

    if (!syncResult.allowed) {
      debugLog(`[Main] Server sync denied access: ${syncResult.error}`);
      app.quit();
      return;
    }

    // ✅ 공지사항이 있으면 렌더러로 전송 (커스텀 모달 표시)
    if (syncResult.notice && syncResult.notice.trim()) {
      // 윈도우 로딩 완료 후 전송하여 유실 방지
      const sendNotice = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          // 렌더러 스크립트 실행 대기를 위해 약간의 추가 지연
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

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    // ✅ BrowserSessionManager 세션 정리
    await browserSessionManager.closeAllSessions().catch(() => { });

    const closePromises: Promise<void>[] = [];
    if (automation) {
      closePromises.push(automation.cancel().catch(() => undefined));
    }
    for (const instance of automationMap.values()) {
      if (instance !== automation) {
        closePromises.push(instance.cancel().catch(() => undefined));
      }
    }
    await Promise.allSettled(closePromises);
    automationMap.clear();
    automation = null;

    // v2.7.1: Flow/ImageFX persistent context 명시적 close — 쿠키 flush 보장
    // launchPersistentContext는 close() 호출 시점에만 메모리 쿠키를 디스크에
    // 영구 저장한다. 호출 안 하면 다음 실행에서 Google 재로그인 강제됨.
    await resetFlowState().catch((e) => console.warn('[Main] Flow context close 실패:', e?.message));
    await cleanupImageFxBrowser().catch((e) => console.warn('[Main] ImageFX cleanup 실패:', e?.message));

    trendMonitor.stop();
    app.quit();

    // ✅ [Fix] cron job 등 백그라운드 작업이 있어도 프로세스가 완전히 종료되도록 강제 종료
    setTimeout(() => {
      console.log('[Main] Forcing process exit...');
      process.exit(0);
    }, 1000);
  }
});

app.on('before-quit', async (event) => {
  if (automationRunning || automation || automationMap.size > 0) {
    // 이미 종료 절차 중이면 무시
    if ((globalThis as any).isQuitting) return;
    (globalThis as any).isQuitting = true;

    event.preventDefault();
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['강제 종료', '취소'],
      defaultId: 1,
      cancelId: 1,
      title: '자동화 실행 중',
      message: '자동화 세션이 활성화되어 있거나 실행 중입니다. 강제로 종료하시겠습니까?',
      detail: '강제 종료를 선택하면 모든 브라우저 세션이 즉시 종료됩니다.',
    });

    if (result.response === 0) {
      const closePromises: Promise<void>[] = [];
      if (automation) {
        closePromises.push(automation.cancel().catch(() => undefined));
      }
      for (const instance of automationMap.values()) {
        if (instance !== automation) {
          closePromises.push(instance.cancel().catch(() => undefined));
        }
      }
      await Promise.allSettled(closePromises);
      automationMap.clear();
      automation = null;
      automationRunning = false;
      app.quit();

      // ✅ [Fix] 강제 종료 시에도 프로세스가 완전히 종료되도록
      setTimeout(() => {
        console.log('[Main] Forcing process exit after force quit...');
        process.exit(0);
      }, 1000);
    } else {
      (globalThis as any).isQuitting = false;
    }
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

// ✅ [2026-03-19] 앱 종료 시 Gemini 사용량 메모리 누적분 안전 저장
app.on('before-quit', async () => {
  try {
    await flushGeminiUsage();
    console.log('[App] ✅ Gemini 사용량 flush 완료');
  } catch (e) {
    console.warn('[App] Gemini flush 실패:', (e as Error).message);
  }

  // v2.7.1: 마지막 안전망 — window-all-closed가 안 탔을 경우(트레이/Cmd-Q)에도
  // Flow/ImageFX persistent context를 강제 close해 쿠키 flush 보장.
  try {
    await resetFlowState();
    console.log('[App] ✅ Flow context flush 완료');
  } catch (e) {
    console.warn('[App] Flow flush 실패:', (e as Error).message);
  }
  try {
    await cleanupImageFxBrowser();
    console.log('[App] ✅ ImageFX context flush 완료');
  } catch (e) {
    console.warn('[App] ImageFX flush 실패:', (e as Error).message);
  }
});
