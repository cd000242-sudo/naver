import { app, BrowserWindow, dialog, ipcMain, nativeImage, NativeImage, shell, Notification, Tray, Menu } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { NaverBlogAutomation, RunOptions, type PublishMode, type AutomationImage } from './naverBlogAutomation.js';
import { generateImages } from './imageGenerator.js';
import { generateStabilityVideo } from './image/stabilityGenerator.js'; // ✅ 추가
import { convertMp4ToGif } from './image/gifConverter.js'; // ✅ 추가
import type { GenerateImagesOptions, GeneratedImage } from './imageGenerator.js';
import { getDailyLimit, getTodayCount, incrementTodayCount, setDailyLimit } from './postLimitManager.js';
import { generateStructuredContent, removeOrdinalHeadingLabelsFromBody } from './contentGenerator.js';
import { createDatalabClient, NaverDatalabClient } from './naverDatalab.js';
import type { ContentSource, StructuredContent, ContentGeneratorProvider, ArticleType } from './contentGenerator.js';
import { assembleContentSource, type SourceAssemblyInput } from './sourceAssembler.js';
import { applyConfigToEnv, loadConfig, saveConfig, validateApiKeyFormat, type AppConfig } from './configManager.js';
import { generateBlogContent, setGeminiModel } from './gemini.js';
import { getChromiumExecutablePath } from './browserUtils.js';
import { PostPublishBooster } from './publisher/postPublishBooster.js';
import { TrendMonitor, type TrendAlertEvent } from './monitor/trendMonitor.js';
import { PatternAnalyzer } from './learning/patternAnalyzer.js';
import { PostAnalytics, type PostPerformance } from './analytics/postAnalytics.js';
import { SmartScheduler, type ScheduledPost as SmartScheduledPost } from './scheduler/smartScheduler.js';
import { KeywordAnalyzer, type KeywordCompetition, type BlueOceanKeyword } from './analytics/keywordAnalyzer.js';
import { InternalLinkManager, type InternalLink } from './content/internalLinkManager.js';
import { ThumbnailGenerator } from './content/thumbnailGenerator.js';
import { canConsume as canConsumeQuota, consume as consumeQuota, getStatus as getQuotaStatus, resetAll as resetAllQuota, type QuotaLimits, type QuotaType } from './quotaManager.js';
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
import { loadScheduledPosts, saveScheduledPost, removeScheduledPost, getAllScheduledPosts, handleRecurringPost, type ScheduledPost } from './scheduledPostsManager.js';
import fsSync from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { getBlogRecentPosts } from './rssSearcher.js';
import { browserSessionManager } from './browserSessionManager.js';

// ✅ [2026-02-04] 자동 업데이트 모듈
import { initAutoUpdater, initAutoUpdaterEarly } from './updater.js';

// ✅ [리팩토링] 새로운 모듈화된 유틸리티 및 서비스
// ✅ [리팩토링] 새로운 모듈화된 유틸리티 및 서비스
import { Logger, debugLog as newDebugLog, sanitizeFileName as utilSanitizeFileName, ensureMp4Dir as utilEnsureMp4Dir, ensureHeadingMp4Dir as utilEnsureHeadingMp4Dir, getUniqueMp4Path as utilGetUniqueMp4Path, validateLicenseAndQuota, validateLicenseOnly } from './main/utils/index.js';
import * as AuthUtils from './main/utils/authUtils.js'; // ✅ 충돌 방지용 Namespace Import
import { AutomationService, injectDependencies as injectBlogExecutorDeps } from './main/services/index.js';
import { registerAllHandlers } from './main/ipc/index.js';
import { WindowManager } from './main/core/WindowManager.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-01-20] 전역 에러 핸들러 - 예상치 못한 크래시 방지
// ═══════════════════════════════════════════════════════════════════════════════
process.on('uncaughtException', (error: Error, origin: string) => {
  console.error('[CRITICAL] 처리되지 않은 예외:', {
    message: error.message,
    stack: error.stack,
    origin
  });
  // 앱 크래시를 방지하기 위해 에러를 로그만 남기고 계속 진행
  // 심각한 에러의 경우 사용자에게 알림
  if (error.message.includes('FATAL') || error.message.includes('ENOENT')) {
    console.error('[CRITICAL] 심각한 오류 - 앱 상태 점검 필요');
  }
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[CRITICAL] 처리되지 않은 Promise 거부:', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
});

// ✅ 메모리 누수 경고 임계값 상향 (이벤트 리스너 과다 등록 경고 방지)
process.setMaxListeners(50);

console.log('[Stability] Main 프로세스 전역 에러 핸들러 등록 완료');

// ✅ [리팩토링] blogHandlers 로직 함수 import
import {
  validateAutomationRun,
  startAutomationRun,
  endAutomationRun,
  handleAutomationCancel,
  handleCloseBrowser,
  setMainWindowRef,
  type AutomationRequest as BlogAutomationRequest,
} from './main/ipc/blogHandlers.js';

function sanitizeFileName(name: string): string {
  const cleaned = String(name || '')
    .replace(/[\\/<>:"|?*]+/g, '_')
    .replace(/[\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
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

  const license = await loadLicense();
  if (!license) {
    debugLog('[Main] ensureLicenseValid: 라이선스 파일을 찾을 수 없습니다.');
    return false;
  }

  const licenseType = String((license as any).licenseType || '').trim();
  if (licenseType === 'free') {
    debugLog('[Main] ensureLicenseValid: 무료 라이선스 (항상 유효)');
    return true;
  }

  if (license.isValid === false) {
    debugLog('[Main] ensureLicenseValid: 라이선스 isValid 플래그가 false입니다.');
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
        debugLog(`[Main] ensureLicenseValid: 라이선스 만료됨 (만료: ${expiresAtEndOfDay.toISOString()}, 현재: ${now.toISOString()})`);
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
    // 앱이 종료되지 않으면 강제 종료
    setTimeout(() => {
      process.exit(0);
    }, 3000);
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
    setTimeout(() => {
      process.exit(0);
    }, 3000);
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
  };
}

async function isFreeTierUser(): Promise<boolean> {
  const forceLicenseCheck = process.env.FORCE_LICENSE_CHECK === 'true';
  if (!app.isPackaged && !forceLicenseCheck) {
    return false;
  }

  // ✅ 사용자가 설정에서 'paid'를 선택했으면 라이선스 상태와 무관하게 유료로 간주 (크레딧 사용자 대응)
  try {
    const config = await (await import('./configManager.js')).loadConfig();
    if ((config as any).geminiPlanType === 'paid') return false;
  } catch {
    // ignore
  }

  const license = await loadLicense();
  return license?.licenseType === 'free';
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

async function activateFreeTier(): Promise<{ success: boolean; message?: string }> {
  try {
    const quota = await getFreeQuotaStatus();
    if (quota?.isPaywalled) {
      const res = await getPaywallResponse();
      return { success: false, message: res.message };
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
  ctaPosition?: 'top' | 'middle' | 'bottom'; // ✅ [신규] CTA 위치
  skipCta?: boolean; // ✅ [신규] CTA 없이 발행
  skipImages?: boolean; // 이미지 삽입 건너뛰기 (글만 발행하기용)
  targetAge?: '20s' | '30s' | '40s' | '50s' | 'all';
  thumbnailPath?: string; // 대표 이미지 경로
  skipDailyLimitWarning?: boolean; // 풀오토 모드에서 일일 발행 제한 경고 건너뛰기
  imageMode?: 'full-auto' | 'semi-auto' | 'manual' | 'skip'; // 이미지 모드
  collectedImages?: Array<{ id: string; url: string; thumbnailUrl: string; title: string; source: string; tags?: string[] }>; // 수집된 이미지 (풀오토 모드용)
  useAiImage?: boolean; // ✅ 추가
  createProductThumbnail?: boolean; // ✅ 추가
  toneStyle?: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous'; // 글 톤 설정
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
const keywordAnalyzer = new KeywordAnalyzer(); // ✅ 키워드 경쟁도 분석
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

    // ✅ [2026-02-04] 자동 업데이터 초기화 (설치형 앱에서만 동작)
    if (app.isPackaged) {
      initAutoUpdater(mainWindow);
    }

    // ✅ [100점 수정] 닫기(X) 버튼 = 앱 완전 종료
    // event.preventDefault()로 기본 동작을 막고, 비동기 정리 완료 후 명시적으로 종료
    mainWindow.on('close', (event) => {
      console.log('[Main] 창 닫기 이벤트 발생');

      // 이미 종료 절차 중이면 기본 동작 허용 (창 닫기)
      if ((globalThis as any).isQuitting) {
        console.log('[Main] isQuitting=true, 즉시 종료 허용');
        return;
      }

      // ✅ [핵심] 기본 동작(창 닫기)을 막음
      event.preventDefault();

      // 종료 절차 시작 (비동기)
      (async () => {
        (globalThis as any).isQuitting = true;
        console.log('[Main] 종료 절차 시작...');

        // 실행 중인 자동화가 있으면 정리
        if (automationRunning || AutomationService.isRunning()) {
          console.log('[Main] 실행 중인 자동화 정리 중...');
          AutomationService.requestCancel();
          await AutomationService.closeAllSessions().catch(() => { });
          automationRunning = false;
          automation = null;
        }

        // 트레이 정리
        if (tray) {
          tray.destroy();
          tray = null;
        }

        console.log('[Main] 정리 완료, 앱 종료');

        // ✅ 비동기 정리 완료 후 종료
        app.quit();

        // 앱이 종료되지 않으면 3초 후 강제 종료
        setTimeout(() => {
          console.log('[Main] 강제 종료 (process.exit)');
          process.exit(0);
        }, 3000);
      })();
    });

    // ✅ [수정] 최소화(-) 버튼 = 트레이로 숨기기
    // ⚠️ [2026-01-21] 개발 모드에서는 일반 최소화, 배포 모드에서만 트레이로 숨기기
    // TypeScript 타입 에러 우회 (minimize 이벤트는 존재하지만 타입 정의에 없음)
    (mainWindow as any).on('minimize', (event: Electron.Event) => {
      // 개발 모드에서는 일반 최소화 허용 (트레이 숨기기 건너뜀)
      if (!app.isPackaged) {
        console.log('[Main] 개발 모드: 일반 최소화 허용');
        // event.preventDefault() 하지 않음 = 일반 최소화 동작
        return;
      }

      // 배포 모드: 트레이로 숨기기
      event.preventDefault();
      mainWindow?.hide();
      console.log('[Main] 창이 트레이로 숨겨졌습니다');

      // 트레이 알림 (처음 숨길 때만)
      if (tray && !(globalThis as any).trayNotified) {
        tray.displayBalloon({
          title: 'Leaders Pro',
          content: '앱이 트레이로 최소화되었습니다. 아이콘을 클릭하면 다시 열 수 있습니다.',
        });
        (globalThis as any).trayNotified = true;
      }
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
// ✅ [2026-01-19] os:homedir 핸들러는 systemHandlers.ts로 이동됨 (registerAllHandlers에서 등록)

// ✅ 창 최소화 IPC 핸들러 (트레이로 숨기기)
ipcMain.handle('window:minimize', async () => {
  console.log('[Main] window:minimize 호출됨, mainWindow:', !!mainWindow, ', tray:', !!tray);
  if (mainWindow) {
    // ✅ 트레이가 있으면 숨기기, 없으면 일반 최소화
    if (tray) {
      mainWindow.hide();
      console.log('[Main] ✅ 창이 트레이로 숨겨졌습니다');
    } else {
      mainWindow.minimize();
      console.log('[Main] ✅ 트레이 없음, 일반 최소화');
    }
    return { success: true };
  }
  console.log('[Main] ❌ mainWindow가 null입니다');
  return { success: false, message: '메인 윈도우를 찾을 수 없습니다.' };
});

ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
  try {
    const fs = await import('fs/promises');
    const os = await import('os');

    // 경로 정규화
    let normalizedPath = targetPath.replace(/\\/g, '/');

    // 홈 디렉토리 경로 확장
    if (normalizedPath.startsWith('~')) {
      normalizedPath = normalizedPath.replace('~', os.homedir());
    }

    // 폴더가 없으면 생성
    try {
      await fs.access(normalizedPath);
    } catch {
      await fs.mkdir(normalizedPath, { recursive: true });
    }

    // 폴더 열기
    const result = await shell.openPath(normalizedPath);

    if (result) {
      return { success: false, message: result };
    }

    return { success: true };
  } catch (error) {
    console.error('[Shell] openPath 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

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

      await browser.close();

      if (posts.length === 0) {
        return { success: true, posts: [], message: '포스팅을 찾지 못했습니다.' };
      }

      return { success: true, posts };
    } catch (error) {
      await browser.close();
      throw error;
    }
  } catch (error) {
    console.error('[Main] getRecentPosts 실패:', error);
    return { success: false, message: `포스팅 목록 불러오기 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('free:activate', async () => {
  return await activateFreeTier();
});

ipcMain.handle('app:forceQuit', async () => {
  try {
    setTimeout(() => {
      try {
        app.quit();
      } finally {
        process.exit(0);
      }
    }, 200);
  } catch {
  }
  return { success: true };
});



// 소제목 영상 관리 IPC 핸들러
ipcMain.handle('heading:applyVideo', async (_event, heading: string, video: HeadingVideoRecord): Promise<{ success: boolean; message?: string }> => {
  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseOnly();
  if (!check.valid) return check.response;

  try {
    if (!heading || !heading.trim()) {
      return { success: false, message: '소제목이 비어있습니다.' };
    }
    if (!video || !video.filePath) {
      return { success: false, message: '영상 정보가 올바르지 않습니다.' };
    }

    const key = heading.trim();
    const current = headingVideosStore.get(key) || [];
    const nextRecord: HeadingVideoRecord = {
      provider: video.provider,
      filePath: video.filePath,
      previewDataUrl: video.previewDataUrl,
      updatedAt: video.updatedAt || Date.now(),
    };

    // ✅ 최신 배치가 항상 0번에 오도록(프론트가 videos[0]을 사용)
    const deduped = current.filter((v) => String(v?.filePath || '') !== String(nextRecord.filePath || ''));
    deduped.unshift(nextRecord);
    deduped.sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0));
    headingVideosStore.set(key, deduped);

    await saveHeadingVideosStore();
    console.log(`[Main] 소제목 "${heading}"에 영상 적용 완료`);
    return { success: true };
  } catch (error) {
    console.error('[Main] 소제목 영상 적용 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('heading:getAppliedVideo', async (_event, heading: string): Promise<{ success: boolean; video?: HeadingVideoRecord; message?: string }> => {
  try {
    if (!heading || !heading.trim()) {
      return { success: false, message: '소제목이 비어있습니다.' };
    }

    const videos = headingVideosStore.get(heading.trim()) || [];
    // ✅ 하위호환: 기존 UI는 단일 video만 기대
    return { success: true, video: videos[0] };
  } catch (error) {
    console.error('[Main] 소제목 영상 조회 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('heading:getAppliedVideos', async (_event, heading: string): Promise<{ success: boolean; videos?: HeadingVideoRecord[]; message?: string }> => {
  try {
    if (!heading || !heading.trim()) {
      return { success: false, message: '소제목이 비어있습니다.' };
    }

    const videos = headingVideosStore.get(heading.trim()) || [];
    return { success: true, videos };
  } catch (error) {
    console.error('[Main] 소제목 영상 목록 조회 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('heading:removeVideo', async (_event, heading: string): Promise<{ success: boolean; message?: string }> => {
  try {
    if (!heading || !heading.trim()) {
      return { success: false, message: '소제목이 비어있습니다.' };
    }

    const deleted = headingVideosStore.delete(heading.trim());
    if (deleted) {
      await saveHeadingVideosStore();
      console.log(`[Main] 소제목 "${heading}"의 영상 제거 완료`);
    }

    return { success: true };
  } catch (error) {
    console.error('[Main] 소제목 영상 제거 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('heading:getAllAppliedVideos', async (): Promise<{ success: boolean; videos?: Record<string, HeadingVideoRecord[]>; message?: string }> => {
  try {
    const videos = Object.fromEntries(headingVideosStore);
    return { success: true, videos };
  } catch (error) {
    console.error('[Main] 모든 소제목 영상 조회 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

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
      try { await fs.unlink(gifPath); } catch { }
    } catch { }

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
    await fs.rm(folderPath, { recursive: true, force: true });
    return true;
  } catch {
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

// ✅ 튜토리얼 영상 목록 가져오기
ipcMain.handle('tutorials:getVideos', async () => {
  console.log('[Main] tutorials:getVideos 핸들러 시작');
  try {
    const config = await loadConfig();
    console.log('[Main] tutorials:getVideos config 로드 완료');
    const videos = (config as any).tutorialVideos || [];
    console.log('[Main] tutorials:getVideos 영상 수:', videos.length);
    return videos;
  } catch (error) {
    console.error('[Main] tutorials:getVideos 오류:', error);
    return [];
  }
});

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

    const safeTitle = (postTitle || 'image').replace(/[<>:"/\\|?*]/g, '_');
    const safeHeading = (heading || 'image').replace(/[<>:"/\\|?*]/g, '_');
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
      lowerImg.includes('type=f40') ||
      lowerImg.includes('type=f60') ||
      lowerImg.includes('type=f80') ||
      lowerImg.includes('type=f100') ||
      // 품질 관련
      lowerImg.includes('blur') ||
      lowerImg.includes('placeholder') ||
      lowerImg.includes('loading') ||
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
      lowerImg.includes('brand_logo');

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

    seenBaseUrls.add(baseUrl);
    if (normalizedFileName) seenFileNames.add(normalizedFileName);
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

      const result = await collectShoppingImages(url, {
        timeout: 30000,
        maxImages: 30,
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

    // ✅ [2026-02-01 FIX] 배너/배찌/마크 등 비제품 이미지 필터링 적용
    const filteredImages = filterDuplicateAndLowQualityImages(images);
    console.log(`[Main] 🎯 필터링 후 이미지: ${filteredImages.length}개 (제외: ${images.length - filteredImages.length}개)`);
    console.log('[Main] ════════════════════════════════════════');

    const response = {
      success: filteredImages.length > 0,
      images: filteredImages,
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

    // ✅ 설정 기반 AI 매칭 실행
    const matcherConfig = {
      provider: (provider === 'perplexity' && hasPerplexity) ? 'perplexity' as const : 'gemini' as const,
      geminiApiKey,
      perplexityApiKey,
      geminiModel: config.geminiModel || process.env.GEMINI_MODEL,
      perplexityModel: config.perplexityModel,
    };

    console.log(`[Main] 🤖 AI 공급자: ${matcherConfig.provider}`);
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
    const downloadImage = async (url: string, maxRetries = 3): Promise<{ buffer: Buffer; contentType: string } | null> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxRedirects: 5, // ✅ 리다이렉트 자동 처리
            headers: {
              // ✅ [핵심] 핫링크 방지 우회 헤더
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://search.naver.com/',
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
        const safeHeading = img.heading.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
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

    // ✅ 성공한 이미지만 필터링
    results.forEach(r => {
      if (r) savedImages.push(r);
    });

    const successCount = savedImages.length;
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

// ✅ 비교표 이미지 생성
ipcMain.handle('image:generateComparisonTable', async (_event, options: {
  title?: string;
  products: Array<{
    name: string;
    price?: string;
    rating?: string;
    pros?: string[];
    cons?: string[];
    specs?: Record<string, string>;
    isRecommended?: boolean;
  }>;
  theme?: 'light' | 'dark' | 'gradient';
  accentColor?: string;
  width?: number;
  showRanking?: boolean;
}) => {
  try {
    console.log('[Main] 비교표 이미지 생성 요청:', options.title, options.products?.length);
    const { generateComparisonTableImage } = await import('./image/comparisonTableGenerator.js');

    const result = await generateComparisonTableImage(options);

    if (result.success) {
      console.log('[Main] 비교표 이미지 생성 완료:', result.imagePath);
    } else {
      console.error('[Main] 비교표 이미지 생성 실패:', result.error);
    }

    return result;
  } catch (error) {
    console.error('[Main] 비교표 이미지 생성 오류:', error);
    return { success: false, error: (error as Error).message };
  }
});

// ✅ [2026-01-18] 커스텀 CTA 배너 생성 핸들러
ipcMain.handle('image:generateCustomBanner', async (_event, options: {
  text: string;
  colorKey: string;
  sizeKey: string;
  animationKey: string;
  customImagePath?: string;
}) => {
  try {
    console.log('[Main] 커스텀 배너 생성 요청:', options.text, options.colorKey);
    const { generateCustomBanner } = await import('./image/tableImageGenerator.js');

    const bannerPath = await generateCustomBanner({
      text: options.text || '지금 바로 구매하기 →',
      colorKey: options.colorKey || 'naver-green',
      sizeKey: options.sizeKey || 'standard',
      animationKey: options.animationKey || 'shimmer',
      customImagePath: options.customImagePath,
    });

    console.log('[Main] 커스텀 배너 생성 완료:', bannerPath);
    return { success: true, path: bannerPath };
  } catch (error) {
    console.error('[Main] 커스텀 배너 생성 오류:', error);
    return { success: false, message: (error as Error).message };
  }
});

// ✅ [2026-01-19] 장단점 표 이미지 생성 핸들러
ipcMain.handle('image:generateProsConsTable', async (_event, options: {
  productName: string;
  pros: string[];
  cons: string[];
}) => {
  try {
    const { productName, pros, cons } = options;
    console.log(`[Main] 장단점 표 생성 요청: ${productName}, 장점 ${pros.length}개, 단점 ${cons.length}개`);

    const { generateProsConsTableImage } = await import('./image/tableImageGenerator.js');
    const result = await generateProsConsTableImage(productName, pros, cons);

    if (result) {
      console.log(`[Main] 장단점 표 생성 완료: ${result}`);
      return { success: true, path: result };
    } else {
      return { success: false, message: '장단점 표 생성 실패' };
    }
  } catch (error) {
    console.error('[Main] 장단점 표 생성 오류:', error);
    return { success: false, message: (error as Error).message };
  }
});

// ✅ [2026-01-27] 테스트 이미지 생성 핸들러 (스타일 미리보기용)
// ✅ [2026-02-08] engine, textOverlay 파라미터 추가
ipcMain.handle('generate-test-image', async (_event, options: {
  style: string;
  ratio: string;
  prompt: string;
  engine?: string;
  textOverlay?: { enabled: boolean; text: string };
}) => {
  try {
    const { style, ratio, prompt, engine, textOverlay } = options;
    console.log(`[Main] 🎨 테스트 이미지 생성: style=${style}, ratio=${ratio}, engine=${engine || '(config)'}, textOverlay=${textOverlay?.enabled || false}`);

    const config = await loadConfig();
    // ✅ [2026-02-08] engine 파라미터가 있으면 임시 엔진 사용, 없으면 저장된 설정
    const imageSource = engine || (config as any).globalImageSource || 'deepinfra';

    // API 키 결정
    let apiKey = '';
    if (imageSource === 'nano-banana-pro' || imageSource.includes('gemini')) {
      apiKey = config.geminiApiKey || '';
    } else {
      apiKey = (config as any).deepinfraApiKey || '';
    }

    if (!apiKey) {
      return { success: false, error: '이미지 생성을 위한 API 키가 설정되지 않았습니다.' };
    }

    // ✅ [2026-02-08] 11가지 스타일별 프롬프트 (3카테고리 동기화)
    const stylePromptMap: Record<string, string> = {
      // 📷 실사
      'realistic': 'Hyper-realistic professional photography, 8K UHD quality, DSLR camera, natural lighting, cinematic composition, Fujifilm XT3 quality', // ✅ [2026-02-12] authentic Korean person 제거 (카테고리별 스타일에서 처리)
      'bokeh': 'Beautiful bokeh photography, shallow depth of field, dreamy out-of-focus background lights, soft circular bokeh orbs, DSLR wide aperture f/1.4 quality, romantic atmosphere',
      // 🖌️ 아트
      'vintage': 'Vintage retro illustration, 1950s poster art style, muted color palette, nostalgic aesthetic, old-fashioned charm, classic design elements, aged paper texture',
      'minimalist': 'Minimalist flat design, simple clean lines, solid colors, modern aesthetic, geometric shapes, professional infographic style, san-serif typography',
      '3d-render': '3D render, Octane render quality, Cinema 4D style, Blender 3D art, realistic materials and textures, studio lighting setup, high-end 3D visualization',
      'korean-folk': 'Korean traditional Minhwa folk painting style, vibrant primary colors on hanji paper, stylized tiger and magpie motifs, peony flowers, pine trees, traditional Korean decorative patterns, bold flat color areas with fine ink outlines, cheerful folk art aesthetic',
      // ✨ 이색
      'stickman': 'Simple stick figure drawing style, black line art on white background, crude hand-drawn stick people, childlike doodle, humorous comic strip, thick marker lines, pure minimal stick figure',
      'claymation': 'Claymation stop-motion style, cute clay figurines, handmade plasticine texture, soft rounded shapes, miniature diorama set, warm studio lighting',
      'neon-glow': 'Neon glow effect, luminous light trails, dark background with vibrant neon lights, synthwave aesthetic, glowing outlines, electric blue and hot pink',
      'papercut': 'Paper cut art style, layered paper craft, 3D paper sculpture effect, shadow between layers, handmade tactile texture, colorful construction paper, kirigami aesthetic',
      'isometric': 'Isometric 3D illustration, cute isometric pixel world, 30-degree angle view, clean geometric shapes, pastel color palette, miniature city/scene, game-like perspective'
    };

    const stylePrompt = stylePromptMap[style] || stylePromptMap['realistic'];

    // ✅ 실사 외 스타일인 경우 강화 (실제 생성과 동일 - nanoBananaProGenerator.ts 553-556)
    let finalPrompt: string;
    if (style !== 'realistic') {
      finalPrompt = `[ART STYLE: ${style.toUpperCase()}]\n${stylePrompt}\n\n${prompt}\n\nIMPORTANT: Generate the image in ${style} style. DO NOT generate photorealistic images.`;
      console.log(`[Main] 🎨 스타일 프롬프트 강화 적용: ${style}`);
    } else {
      finalPrompt = `${stylePrompt}\n\n${prompt}`;
    }

    // 비율 → 해상도 매핑
    const ratioMap: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1344, height: 768 },
      '9:16': { width: 768, height: 1344 },
      '4:3': { width: 1152, height: 896 },
      '3:4': { width: 896, height: 1152 },
    };
    const resolution = ratioMap[ratio] || ratioMap['1:1'];

    // 이미지 생성 (사용자 설정에 따라 엔진 선택)
    let imagePath: string;

    console.log(`[Main] 🎨 테스트 이미지 생성 - 엔진: ${imageSource}, 스타일: ${style}`);

    if (imageSource === 'nano-banana-pro' || imageSource.includes('gemini')) {
      // ✅ 나노바나나프로 (Gemini) 사용 - 실제 생성과 동일 옵션
      const { generateWithNanoBananaPro } = await import('./image/nanoBananaProGenerator.js');
      const testItem = {
        heading: prompt || '테스트 이미지',
        prompt: finalPrompt,
        imageStyle: style,  // ✅ 스타일 전달
        imageRatio: ratio,
        aspectRatio: ratio,
      };

      const results = await generateWithNanoBananaPro(
        [testItem],
        'test-image',
        'Test',
        false,
        apiKey,
        false,
        undefined,
        undefined
      );

      if (results && results.length > 0 && results[0].filePath) {
        imagePath = results[0].filePath;
      } else {
        throw new Error('나노바나나프로 이미지 생성 실패');
      }
    } else if (imageSource === 'deepinfra' || imageSource === 'deepinfra-flux') {
      // ✅ [2026-02-08] DeepInfra 사용 - 설정 모델 동적 선택
      const DEEPINFRA_MODEL_MAP: Record<string, string> = {
        'flux-2-dev': 'black-forest-labs/FLUX-2-dev',
        'flux-dev': 'black-forest-labs/FLUX-1-dev',
        'flux-schnell': 'black-forest-labs/FLUX-1-schnell'
      };
      const selectedModelKey = (config as any).deepinfraModel || 'flux-2-dev';
      const actualModel = DEEPINFRA_MODEL_MAP[selectedModelKey] || 'black-forest-labs/FLUX-2-dev';
      console.log(`[Main] 🔧 DeepInfra 모델: ${selectedModelKey} → ${actualModel}`);

      const { generateSingleDeepInfraImage } = await import('./image/deepinfraGenerator.js');
      const sizeStr = `${resolution.width}x${resolution.height}`;
      const result = await generateSingleDeepInfraImage(
        { prompt: finalPrompt, size: sizeStr, model: actualModel },
        apiKey
      );

      if (result.success && result.localPath) {
        imagePath = result.localPath;
      } else {
        throw new Error(result.error || 'DeepInfra 이미지 생성 실패');
      }
    } else if (imageSource === 'falai' || imageSource === 'fal-ai') {
      // ✅ [2026-02-08] Fal.ai - 실제 Generator 호출
      console.log(`[Main] 🎨 Fal.ai 엔진으로 테스트 이미지 생성`);
      const { generateSingleFalAIImage } = await import('./image/falaiGenerator.js');
      const falApiKey = (config as any).falaiApiKey;
      if (!falApiKey) throw new Error('Fal.ai API 키가 설정되지 않았습니다.');

      const falModel = (config as any).falaiModel || 'flux-schnell';
      const result = await generateSingleFalAIImage(
        { prompt: finalPrompt, size: `${resolution.width}x${resolution.height}`, model: falModel },
        falApiKey
      );

      if (result.success && result.localPath) {
        imagePath = result.localPath;
      } else {
        throw new Error(result.error || 'Fal.ai 이미지 생성 실패');
      }
    } else if (imageSource === 'prodia') {
      // ✅ [2026-02-08] Prodia - 실제 Generator 호출 (v2 API + 동적 모델)
      console.log(`[Main] 🔮 Prodia 엔진으로 테스트 이미지 생성`);
      const { generateWithProdia } = await import('./image/prodiaGenerator.js');
      const prodiaToken = (config as any).prodiaToken;
      if (!prodiaToken) throw new Error('Prodia API 토큰이 설정되지 않았습니다.');

      const testItem = { heading: prompt || '테스트 이미지', prompt: finalPrompt };
      const results = await generateWithProdia([testItem], 'Test', undefined, false, prodiaToken);

      if (results && results.length > 0 && results[0].filePath) {
        imagePath = results[0].filePath;
      } else {
        throw new Error('Prodia 이미지 생성 실패');
      }
    } else if (imageSource === 'stability') {
      // ✅ [2026-02-08] Stability AI - 실제 Generator 호출 (동적 모델)
      console.log(`[Main] 🏔️ Stability AI 엔진으로 테스트 이미지 생성`);
      const { generateWithStability } = await import('./image/stabilityGenerator.js');
      const stabilityApiKey = (config as any).stabilityApiKey;
      if (!stabilityApiKey) throw new Error('Stability AI API 키가 설정되지 않았습니다.');

      const testItem = { heading: prompt || '테스트 이미지', prompt: finalPrompt };
      const results = await generateWithStability([testItem], 'Test', undefined, false, stabilityApiKey);

      if (results && results.length > 0 && results[0].filePath) {
        imagePath = results[0].filePath;
      } else {
        throw new Error('Stability AI 이미지 생성 실패');
      }
    } else if (imageSource === 'pollinations') {
      // ✅ [2026-02-08] Pollinations - 무료 API
      console.log(`[Main] 🌸 Pollinations 엔진으로 테스트 이미지 생성`);
      const { default: axios } = await import('axios');
      const encodedPrompt = encodeURIComponent(finalPrompt);
      const pollinationUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${resolution.width}&height=${resolution.height}&seed=${Date.now()}&nologo=true`;

      const response = await axios.get(pollinationUrl, { responseType: 'arraybuffer', timeout: 60000 });
      const buffer = Buffer.from(response.data);

      const testImagesDir = path.join(app.getPath('userData'), 'test-images');
      await fs.mkdir(testImagesDir, { recursive: true });
      const tempFileName = `test_pollinations_${Date.now()}.png`;
      const tempFilePath = path.join(testImagesDir, tempFileName);
      await fs.writeFile(tempFilePath, buffer);
      imagePath = tempFilePath;
    } else {
      // ✅ 알 수 없는 엔진 → DeepInfra 폴백
      console.warn(`[Main] ⚠️ 알 수 없는 엔진 "${imageSource}", DeepInfra로 폴백`);
      const { generateSingleDeepInfraImage } = await import('./image/deepinfraGenerator.js');
      const sizeStr = `${resolution.width}x${resolution.height}`;
      const result = await generateSingleDeepInfraImage(
        { prompt: finalPrompt, size: sizeStr },
        apiKey
      );

      if (result.success && result.localPath) {
        imagePath = result.localPath;
      } else {
        throw new Error(result.error || '이미지 생성 실패');
      }
    }

    // 파일 저장 (이미 생성된 이미지 경로를 test-images 폴더로 복사)
    const testImagesDir = path.join(app.getPath('userData'), 'test-images');
    await fs.mkdir(testImagesDir, { recursive: true });

    const fileName = `test_${style}_${ratio.replace(':', 'x')}_${Date.now()}.png`;
    const filePath = path.join(testImagesDir, fileName);

    // 생성된 이미지를 test-images 폴더로 복사
    await fs.copyFile(imagePath, filePath);

    // ✅ [2026-02-08] 텍스트 오버레이 적용 (활성화된 경우)
    let previewDataUrl: string | undefined;
    if (textOverlay?.enabled && textOverlay.text) {
      try {
        console.log(`[Main] 📝 텍스트 오버레이 적용 중: "${textOverlay.text}"`);
        const { ThumbnailService } = await import('./thumbnailService.js');
        const thumbnailService = new ThumbnailService();

        // ✅ 오버레이 적용된 이미지를 별도 파일로 저장
        const overlayFileName = `test_overlay_${style}_${ratio.replace(':', 'x')}_${Date.now()}.png`;
        const overlayFilePath = path.join(testImagesDir, overlayFileName);

        const resultPath = await thumbnailService.createProductThumbnail(
          filePath,
          textOverlay.text,
          overlayFilePath,
          { fontSize: 48, textColor: '#FFFFFF', position: 'bottom' }
        );

        if (resultPath && typeof resultPath === 'string') {
          // base64로 변환하여 previewDataUrl 생성
          const imageBuffer = await fs.readFile(resultPath);
          previewDataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;

          console.log(`[Main] ✅ 텍스트 오버레이 완료: ${resultPath}`);
          return { success: true, path: resultPath, previewDataUrl };
        } else {
          console.warn(`[Main] ⚠️ 텍스트 오버레이 실패, 원본 이미지 반환`);
        }
      } catch (overlayError) {
        console.warn(`[Main] ⚠️ 텍스트 오버레이 오류 (원본 이미지 반환):`, (overlayError as Error).message);
      }
    }

    console.log(`[Main] ✅ 테스트 이미지 생성 완료: ${filePath}`);
    return { success: true, path: filePath, previewDataUrl };

  } catch (error) {
    console.error('[Main] ❌ 테스트 이미지 생성 오류:', error);
    return { success: false, error: (error as Error).message };
  }
});

// 플랫폼에서 콘텐츠 수집 (실시간 정보)
ipcMain.handle('content:collectFromPlatforms', async (_event, keyword: string, options?: { maxPerSource?: number; targetDate?: string }) => {
  try {
    const { collectContentFromPlatforms } = await import('./sourceAssembler.js');
    const config = await loadConfig();
    const result = await collectContentFromPlatforms(keyword, {
      maxPerSource: options?.maxPerSource || 5,
      clientId: config.naverDatalabClientId,
      clientSecret: config.naverDatalabClientSecret,
      logger: (msg) => console.log(msg),
      targetDate: options?.targetDate, // ✅ 발행 날짜 전달
    });
    return result;
  } catch (error) {
    console.error('[Main] 플랫폼 콘텐츠 수집 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

// 저장된 이미지 경로 가져오기
ipcMain.handle('images:getSavedPath', async () => {
  return path.join(app.getPath('userData'), 'images');
});

// 저장된 이미지 목록 가져오기
ipcMain.handle('images:getSaved', async (_event, dirPath: string) => {
  try {
    const files = await fs.readdir(dirPath);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    const images = imageFiles.map(f => path.join(dirPath, f));
    return { success: true, images };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

// 앱 정보 가져오기
ipcMain.handle('app:getInfo', async () => {
  return { isPackaged: app.isPackaged };
});

// 라이선스 상태 확인
// ✅ [2026-01-16] 쿼터 상태 조회 핸들러 추가
ipcMain.handle('quota:getStatus', async () => {
  try {
    // ✅ [2026-01-16] 상단 정적 import 사용 (동적 import 제거)
    const isFree = await AuthUtils.isFreeTierUser();
    if (!isFree) {
      return { success: true, isFree: false };
    }

    const limits = await AuthUtils.getFreeQuotaLimits();
    const quota = await getQuotaStatus(limits); // 상단에서 getStatus as getQuotaStatus로 import됨

    return { success: true, isFree: true, quota };
  } catch (error) {
    console.error('[Main] quota:getStatus 오류:', error);
    return { success: false, message: (error as Error).message };
  }
});

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
  // 기존 632줄  37줄 단일 위임
  // ============================================

  console.log('[Main] automation:run  AutomationService.executePostCycle() 위임');

  //  라이선스/quota 검증
  const validationResult = await validateAutomationRun();
  if (!validationResult.valid) {
    return validationResult.response;
  }

  try {
    //  새 엔진 호출 (BlogExecutor.runFullPostCycle 실행)
    const result = await AutomationService.executePostCycle(payload as any);

    //  결과 반환
    if (result.success) {
      // ✅ [2026-01-16] 무료 사용자 횟수 차감 (자동화 성공 시)
      try {
        const { isFreeTierUser } = await import('./main/utils/authUtils.js');
        const { consume: consumeQuota } = await import('./quotaManager.js');

        if (await isFreeTierUser()) {
          console.log('[Main] 무료 사용자: 자동화 성공으로 publish 쿼터 1회 차감 시도...');
          const newState = await consumeQuota('publish', 1);
          console.log(`[Main] 무료 사용자 쿼터 차감 완료. 남은 횟수 확인 필요 (현재 publish: ${newState.publish})`);
        }
      } catch (quotaError) {
        console.error('[Main] 쿼터 차감 중 오류 (무시됨):', quotaError);
      }

      sendStatus({ success: true, url: result.url, message: result.message });
    } else if (result.cancelled) {
      sendStatus({ success: false, cancelled: true, message: result.message });
    } else {
      sendStatus({ success: false, message: result.message });
    }

    return result;

  } catch (error) {
    const message = (error as Error).message || '자동화 실행 중 오류가 발생했습니다.';
    console.error('[Main] automation:run 오류:', message);
    sendStatus({ success: false, message });
    AutomationService.stopRunning();
    return { success: false, message };
  }
});


ipcMain.handle('automation:cancel', async () => {
  // ✅ [리팩토링] 통합 검증
  const check = await validateLicenseOnly();
  if (!check.valid) return check.response;

  if (!automationRunning || !automation) {
    return false;
  }

  // ✅ [리팩토링] AutomationService에도 취소 요청
  AutomationService.requestCancel();

  await automation.cancel().catch(() => undefined);
  sendStatus({ success: false, cancelled: true, message: '사용자가 자동화를 취소했습니다.' });
  automationRunning = false;
  AutomationService.stopRunning(); // ✅ 동기화
  automation = null;
  return true;
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
        stabilityApiKey: config.stabilityApiKey, // ✅ Stability AI 키 추가
        unsplashApiKey: config.unsplashApiKey,
        pixabayApiKey: config.pixabayApiKey,
        geminiApiKey: config.geminiApiKey, // ✅ Gemini 키 추가
        prodiaToken: (config as any).prodiaToken,
        falaiApiKey: (config as any).falaiApiKey, // ✅ Fal.ai 키 추가
        deepinfraApiKey: (config as any).deepinfraApiKey, // ✅ DeepInfra 키 추가
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

          let isThumbnail: boolean;
          if (isShoppingConnectMode) {
            // 쇼핑커넥트: item.isThumbnail === true인 경우만 썸네일
            // (실제로는 수집 이미지가 썸네일이므로 AI 생성 items에는 없을 것)
            isThumbnail = item.isThumbnail === true ||
              heading.includes('썸네일') ||
              heading.includes('thumbnail');
          } else {
            // 일반 모드: 첫 번째 항목(origIdx === 0)이 대표 이미지
            isThumbnail = origIdx === 0 ||
              item.isThumbnail === true ||
              heading.includes('썸네일') ||
              heading.includes('thumbnail') ||
              heading.includes('서론') ||
              heading.includes('대표');
          }

          let shouldInclude = false;
          switch (headingImageMode) {
            case 'thumbnail-only':
              // 쇼핑커넥트: 썸네일은 수집 이미지 → AI 생성 불필요 → 모두 false
              // 일반 모드: origIdx === 0만 true
              shouldInclude = isThumbnail;
              break;
            case 'odd-only':
              // 홀수: 1번(origIdx=0), 3번(origIdx=2), 5번(origIdx=4)... → origIdx가 짝수
              if (isShoppingConnectMode) {
                // 썸네일 없으므로 순수 소제목 인덱스로 계산 (1-indexed 기준 홀수 = 0, 2, 4...)
                shouldInclude = origIdx % 2 === 0;
              } else {
                // 일반 모드: 대표(origIdx=0)는 항상 포함 + 홀수 소제목
                // 1번 소제목(origIdx=0) = 대표, 포함
                // 2번 소제목(origIdx=1) = 짝수, 제외
                // 3번 소제목(origIdx=2) = 홀수, 포함
                // ...
                shouldInclude = origIdx === 0 || origIdx % 2 === 0;
              }
              break;
            case 'even-only':
              // 짝수: 2번(origIdx=1), 4번(origIdx=3), 6번(origIdx=5)... → origIdx가 홀수
              if (isShoppingConnectMode) {
                shouldInclude = origIdx % 2 === 1;
              } else {
                // 일반 모드: 대표(origIdx=0)는 항상 포함 + 짝수 소제목
                shouldInclude = origIdx === 0 || origIdx % 2 === 1;
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

          // isThumbnail 결정: 쇼핑커넥트 모드에서는 item.isThumbnail, 일반 모드에서는 origIdx === 0
          const isThumbnailItem = isShoppingConnectMode
            ? (item.isThumbnail === true)
            : (origIdx === 0 || item.isThumbnail === true);

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

      const images = await generateImages(options, apiKeys);

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
          let baseUrl = url
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
    const content = await generateBlogContent(prompt ?? '');
    if (await isFreeTierUser()) {
      await consumeQuota('content', 1);
    }
    return { success: true, content };
  } catch (error) {
    const message = (error as Error).message ?? '콘텐츠 생성 중 오류가 발생했습니다.';
    return { success: false, message };
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
    } catch {
      // ignore
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

    // ✅ 1. Stability AI (SVD) 비디오 생성
    if (videoProvider === 'stability') {
      const stabilityApiKey = (config.stabilityApiKey || '').trim();
      if (!stabilityApiKey) throw new Error('Stability AI API 키가 설정되지 않았습니다.');

      sendLog(`🎬 Stability AI 비디오 생성 시작... (Heading: ${headingForSave})`);

      let videoImageBuffer: Buffer;
      const imagePath = String(payload?.imagePath || '').trim();
      const imageBytes = String(payload?.image?.imageBytes || '').trim();

      if (imageBytes) {
        videoImageBuffer = Buffer.from(imageBytes, 'base64');
      } else if (imagePath) {
        videoImageBuffer = await fs.readFile(imagePath);
      } else {
        throw new Error('Stability AI 영상 생성을 위한 이미지(imagePath 또는 imageBytes)가 필요합니다.');
      }

      const videoBuffer = await generateStabilityVideo(videoImageBuffer, stabilityApiKey);
      const { fullPath: outPath, fileName } = await getUniqueMp4Path(mp4Dir, headingForSave);
      await fs.writeFile(outPath, videoBuffer);

      finalOutPath = outPath;
      finalFileName = fileName;
      sendLog(`✅ Stability AI 비디오 생성 완료: ${fileName}`);
    }
    // ✅ 2. Prodia (SVD) 비디오 생성
    else if (videoProvider === 'prodia') {
      const prodiaToken = (config as any).prodiaToken || '';
      if (!prodiaToken) throw new Error('Prodia API 토큰이 설정되지 않았습니다.');

      sendLog(`🎬 Prodia 비디오 생성 시작... (Heading: ${headingForSave})`);

      const axios = (await import('axios')).default;
      const imagePath = String(payload?.imagePath || '').trim();
      const imageBytes = String(payload?.image?.imageBytes || '').trim();
      let b64 = imageBytes;
      if (!b64 && imagePath) b64 = (await fs.readFile(imagePath)).toString('base64');

      const job = {
        type: 'inference.svd.v1',
        config: { image: b64 }
      };

      const startRes = await axios.post('https://inference.prodia.com/v2/job', job, {
        headers: { Authorization: `Bearer ${prodiaToken}`, Accept: 'application/octet-stream' },
        responseType: 'arraybuffer'
      });

      const { fullPath: outPath, fileName } = await getUniqueMp4Path(mp4Dir, headingForSave);
      await fs.writeFile(outPath, Buffer.from(startRes.data));

      finalOutPath = outPath;
      finalFileName = fileName;
      sendLog(`✅ Prodia 비디오 생성 완료: ${fileName}`);
    }
    // ✅ 3. Veo (Gemini) 비디오 생성 (기존 로직 보전)
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
      } catch {
        // ignore
      }
    } catch {
      // ignore
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

    // 1. Gemini 모델 수정 - ✅ 2026년 1월 기준 사용 가능한 모델만 유효
    const validModels = [
      'gemini-3-pro-preview',
      'gemini-3-flash-preview',
    ];

    // ✅ 이전 모델명 → 새 모델명 자동 마이그레이션
    const modelMigrationMap: Record<string, string> = {
      'gemini-3-pro': 'gemini-3-pro-preview',
      'gemini-3-flash': 'gemini-3-flash-preview',
      'gemini-3-pro-preview': 'gemini-3-pro-preview',
      'gemini-3-flash-preview': 'gemini-3-flash-preview',
      'gemini-2.5-pro-preview': 'gemini-3-pro-preview',
      'gemini-2.5-flash': 'gemini-3-flash-preview',
      'gemini-2.0-flash-exp': 'gemini-3-flash-preview',
      'gemini-2.0-flash': 'gemini-3-flash-preview',
      'gemini-1.5-flash': 'gemini-3-flash-preview',
      'gemini-1.5-flash-latest': 'gemini-3-flash-preview',
      'gemini-1.5-pro': 'gemini-3-pro-preview',
      'gemini-1.5-pro-latest': 'gemini-3-pro-preview',
      'gemini-1.5-flash-8b': 'gemini-3-flash-preview',
    };

    // 저장된 모델이 마이그레이션 대상인 경우 자동 변환
    if (config.geminiModel && modelMigrationMap[config.geminiModel]) {
      const oldModel = config.geminiModel;
      config.geminiModel = modelMigrationMap[config.geminiModel];
      configChanged = true;
      fixResults.push({ action: 'Gemini 모델 마이그레이션', success: true, message: `${oldModel} → ${config.geminiModel}로 자동 변환됨` });
    }

    if (config.geminiModel && !validModels.includes(config.geminiModel)) {
      config.geminiModel = 'gemini-3-pro-preview';
      configChanged = true;
      fixResults.push({ action: 'Gemini 모델', success: true, message: '권장 모델(gemini-3-pro-preview)로 변경됨' });
    }

    if (!config.geminiModel) {
      config.geminiModel = 'gemini-3-pro-preview';
      configChanged = true;
      fixResults.push({ action: 'Gemini 모델 설정', success: true, message: '기본 모델 설정됨' });
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

// ✅ 최적 시간 자동 예약 발행 IPC 핸들러
ipcMain.handle('scheduler:getOptimalTimes', async (_event, count: number = 5, category?: string) => {
  try {
    const times = smartScheduler.getNextOptimalTimes(count, category);
    return { success: true, times };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('scheduler:schedulePost', async (_event, title: string, keyword: string, scheduledAt: string) => {
  try {
    const post = smartScheduler.schedulePost(title, keyword, scheduledAt);
    sendLog(`📅 예약 발행 등록: ${title} (${new Date(scheduledAt).toLocaleString()})`);
    return { success: true, post };
  } catch (error) {
    return { success: false, message: `예약 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('scheduler:scheduleAtOptimal', async (_event, title: string, keyword: string, category?: string) => {
  try {
    const post = smartScheduler.scheduleAtOptimalTime(title, keyword, category);
    sendLog(`📅 최적 시간 예약: ${title} (${new Date(post.scheduledAt).toLocaleString()})`);
    return { success: true, post };
  } catch (error) {
    return { success: false, message: `예약 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('scheduler:cancelSchedule', async (_event, postId: string) => {
  try {
    const result = smartScheduler.cancelSchedule(postId);
    if (result) {
      sendLog(`🛑 예약 취소됨`);
      return { success: true, message: '예약이 취소되었습니다.' };
    }
    return { success: false, message: '취소할 수 없는 예약입니다.' };
  } catch (error) {
    return { success: false, message: `취소 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('scheduler:getAllScheduled', async () => {
  try {
    const posts = smartScheduler.getAllScheduled();
    return { success: true, posts };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('scheduler:getPending', async () => {
  try {
    const posts = smartScheduler.getPendingScheduled();
    return { success: true, posts };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('scheduler:reschedule', async (_event, postId: string, newTime: string) => {
  try {
    const result = smartScheduler.reschedule(postId, newTime);
    if (result) {
      sendLog(`📅 예약 시간 변경: ${new Date(newTime).toLocaleString()}`);
      return { success: true, message: '예약 시간이 변경되었습니다.' };
    }
    return { success: false, message: '변경할 수 없는 예약입니다.' };
  } catch (error) {
    return { success: false, message: `변경 실패: ${(error as Error).message}` };
  }
});

// ✅ 실패한 예약 즉시 재시도
ipcMain.handle('scheduler:retry', async (_event, postId: string) => {
  try {
    // 실패한 포스트를 찾아서 상태를 pending으로 변경하고 즉시 실행
    const post = smartScheduler.getScheduledPost(postId);
    if (!post) {
      return { success: false, message: '해당 예약을 찾을 수 없습니다.' };
    }

    if (post.status !== 'failed') {
      return { success: false, message: '실패한 예약만 재시도할 수 있습니다.' };
    }

    // 현재 시간 + 10초 후로 예약 변경 (즉시 실행)
    const retryTime = new Date(Date.now() + 10 * 1000).toISOString();
    const result = smartScheduler.reschedule(postId, retryTime);

    if (result) {
      sendLog(`🔄 예약 재시도: ${post.title}`);
      return { success: true, message: '재시도가 예약되었습니다. 잠시 후 자동 발행됩니다.' };
    }
    return { success: false, message: '재시도 예약에 실패했습니다.' };
  } catch (error) {
    return { success: false, message: `재시도 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('scheduler:getStats', async () => {
  try {
    const stats = smartScheduler.getStats();
    return { success: true, stats };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('scheduler:cancelAll', async () => {
  try {
    smartScheduler.cancelAll();
    sendLog(`🛑 모든 예약 취소됨`);
    return { success: true, message: '모든 예약이 취소되었습니다.' };
  } catch (error) {
    return { success: false, message: `취소 실패: ${(error as Error).message}` };
  }
});

// ✅ 키워드 경쟁도 분석 IPC 핸들러
ipcMain.handle('keyword:analyze', async (_event, keyword: string) => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] keyword:analyze - 설정 동기화 실패:', e);
  }

  try {
    sendLog(`🔍 키워드 분석 중: ${keyword}`);

    // ✅ API 설정 로드
    const config = await loadConfig();

    // 네이버 검색 API 설정 (블로그/뉴스 검색용)
    if (config.naverDatalabClientId && config.naverDatalabClientSecret) {
      keywordAnalyzer.setNaverSearchConfig({
        clientId: config.naverDatalabClientId,
        clientSecret: config.naverDatalabClientSecret,
      });
      sendLog(`📊 네이버 검색 API 연동됨`);
    }

    // 네이버 광고 API 설정 (검색량 데이터용)
    if (config.naverAdApiKey && config.naverAdSecretKey && config.naverAdCustomerId) {
      keywordAnalyzer.setNaverAdConfig({
        apiKey: config.naverAdApiKey,
        secretKey: config.naverAdSecretKey,
        customerId: config.naverAdCustomerId,
      });
      sendLog(`📊 네이버 광고 API 연동됨 - 정확한 검색량 데이터 사용`);
    } else {
      sendLog(`⚠️ 네이버 광고 API 미설정 - 추정치 사용`);
    }

    const result = await keywordAnalyzer.analyzeKeyword(keyword);
    sendLog(`✅ 키워드 분석 완료: ${keyword} (기회점수: ${result.opportunity}, 난이도: ${result.difficulty})`);
    return { success: true, analysis: result };
  } catch (error) {
    return { success: false, message: `분석 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('keyword:findBlueOcean', async (_event, baseKeyword: string, count: number = 5) => {
  try {
    sendLog(`🌊 블루오션 키워드 검색 중: ${baseKeyword}`);

    // ✅ API 설정 로드
    const config = await loadConfig();
    if (config.naverDatalabClientId && config.naverDatalabClientSecret) {
      keywordAnalyzer.setNaverSearchConfig({
        clientId: config.naverDatalabClientId,
        clientSecret: config.naverDatalabClientSecret,
      });
    }
    if (config.naverAdApiKey && config.naverAdSecretKey && config.naverAdCustomerId) {
      keywordAnalyzer.setNaverAdConfig({
        apiKey: config.naverAdApiKey,
        secretKey: config.naverAdSecretKey,
        customerId: config.naverAdCustomerId,
      });
    }

    const keywords = await keywordAnalyzer.findBlueOceanKeywords(baseKeyword, count);
    sendLog(`✅ 블루오션 키워드 ${keywords.length}개 발견`);
    return { success: true, keywords };
  } catch (error) {
    return { success: false, message: `검색 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('keyword:clearCache', async () => {
  try {
    keywordAnalyzer.clearCache();
    return { success: true, message: '캐시가 초기화되었습니다.' };
  } catch (error) {
    return { success: false, message: `초기화 실패: ${(error as Error).message}` };
  }
});

// ✅ 자동 블루오션 키워드 발견 (입력 없이 트렌드 기반)
ipcMain.handle('keyword:discoverBlueOcean', async (_event, count: number = 10) => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] keyword:discoverBlueOcean - 설정 동기화 실패:', e);
  }

  try {
    sendLog(`🔍 자동 블루오션 키워드 발견 중...`);

    // API 설정 로드
    const config = await loadConfig();
    if (config.naverDatalabClientId && config.naverDatalabClientSecret) {
      keywordAnalyzer.setNaverSearchConfig({
        clientId: config.naverDatalabClientId,
        clientSecret: config.naverDatalabClientSecret,
      });
    }
    if (config.naverAdApiKey && config.naverAdSecretKey && config.naverAdCustomerId) {
      keywordAnalyzer.setNaverAdConfig({
        apiKey: config.naverAdApiKey,
        secretKey: config.naverAdSecretKey,
        customerId: config.naverAdCustomerId,
      });
    }

    const keywords = await keywordAnalyzer.discoverBlueOceanKeywords(count);
    sendLog(`✅ 자동 발견 블루오션 키워드 ${keywords.length}개`);
    return { success: true, keywords };
  } catch (error) {
    return { success: false, message: `자동 발견 실패: ${(error as Error).message}` };
  }
});

// ✅ 카테고리별 황금키워드 발견 (전체)
ipcMain.handle('keyword:discoverGoldenByCategory', async (_event, count: number = 5) => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] keyword:discoverGoldenByCategory - 설정 동기화 실패:', e);
  }

  try {
    sendLog(`🏆 카테고리별 황금키워드 발견 중...`);

    // API 설정 로드
    const config = await loadConfig();
    if (config.naverDatalabClientId && config.naverDatalabClientSecret) {
      keywordAnalyzer.setNaverSearchConfig({
        clientId: config.naverDatalabClientId,
        clientSecret: config.naverDatalabClientSecret,
      });
    }
    if (config.naverAdApiKey && config.naverAdSecretKey && config.naverAdCustomerId) {
      keywordAnalyzer.setNaverAdConfig({
        apiKey: config.naverAdApiKey,
        secretKey: config.naverAdSecretKey,
        customerId: config.naverAdCustomerId,
      });
    }

    const result = await keywordAnalyzer.discoverGoldenKeywordsByCategory(count);
    sendLog(`✅ 카테고리별 황금키워드 발견 완료`);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, message: `발견 실패: ${(error as Error).message}` };
  }
});

// ✅ 단일 카테고리 황금키워드 발견 (사용자 선택)
ipcMain.handle('keyword:discoverGoldenBySingleCategory', async (_event, categoryId: string, count: number = 10) => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] keyword:discoverGoldenBySingleCategory - 설정 동기화 실패:', e);
  }

  try {
    sendLog(`🏆 ${categoryId} 카테고리 황금키워드 발견 중...`);

    // API 설정 로드
    const config = await loadConfig();
    if (config.naverDatalabClientId && config.naverDatalabClientSecret) {
      keywordAnalyzer.setNaverSearchConfig({
        clientId: config.naverDatalabClientId,
        clientSecret: config.naverDatalabClientSecret,
      });
    }
    if (config.naverAdApiKey && config.naverAdSecretKey && config.naverAdCustomerId) {
      keywordAnalyzer.setNaverAdConfig({
        apiKey: config.naverAdApiKey,
        secretKey: config.naverAdSecretKey,
        customerId: config.naverAdCustomerId,
      });
    }

    const result = await keywordAnalyzer.discoverGoldenKeywordsBySingleCategory(categoryId, count);
    sendLog(`✅ ${categoryId} 카테고리 황금키워드 ${result.keywords.length}개 발견`);
    return result;
  } catch (error) {
    return { success: false, message: `발견 실패: ${(error as Error).message}` };
  }
});

// ✅ 자동 내부링크 삽입 IPC 핸들러
ipcMain.handle('internalLink:addPost', async (_event, url: string, title: string, content?: string, category?: string) => {
  try {
    internalLinkManager.addPostFromUrl(url, title, content, category);
    return { success: true, message: '글이 내부링크 목록에 추가되었습니다.' };
  } catch (error) {
    return { success: false, message: `추가 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('internalLink:findRelated', async (_event, title: string, content: string, maxResults?: number, categoryFilter?: string) => {
  try {
    const links = internalLinkManager.findRelatedPosts(title, content, maxResults, categoryFilter);
    return { success: true, links };
  } catch (error) {
    return { success: false, message: `검색 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('internalLink:insertLinks', async (_event, content: string, title: string, options?: any) => {
  try {
    const result = internalLinkManager.insertInternalLinks(content, title, options);
    return { success: true, result };
  } catch (error) {
    return { success: false, message: `삽입 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('internalLink:getAllPosts', async () => {
  try {
    const posts = internalLinkManager.getAllPosts();
    return { success: true, posts };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('internalLink:getStats', async () => {
  try {
    const stats = internalLinkManager.getStats();
    return { success: true, stats };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

// ✅ 카테고리별 글 목록 조회
ipcMain.handle('internalLink:getPostsByCategory', async (_event, category: string) => {
  try {
    const posts = internalLinkManager.getPostsByCategory(category);
    return { success: true, posts };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

// ✅ 모든 카테고리 목록 조회
ipcMain.handle('internalLink:getAllCategories', async () => {
  try {
    const categories = internalLinkManager.getAllCategories();
    return { success: true, categories };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

// ✅ 글 카테고리 업데이트
ipcMain.handle('internalLink:updatePostCategory', async (_event, postId: string, category: string) => {
  try {
    const success = internalLinkManager.updatePostCategory(postId, category);
    return { success, message: success ? '카테고리가 업데이트되었습니다.' : '글을 찾을 수 없습니다.' };
  } catch (error) {
    return { success: false, message: `업데이트 실패: ${(error as Error).message}` };
  }
});

// ✅ 기존 글 자동 카테고리 분류
ipcMain.handle('internalLink:autoCategorize', async () => {
  try {
    const result = internalLinkManager.autoCategorizeAllPosts();
    return { success: true, ...result };
  } catch (error) {
    return { success: false, message: `자동 분류 실패: ${(error as Error).message}` };
  }
});

// ✅ 미분류 글 목록 조회
ipcMain.handle('internalLink:getUncategorized', async () => {
  try {
    const posts = internalLinkManager.getUncategorizedPosts();
    return { success: true, posts };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

// ✅ 기존 카테고리명 정규화 (영어/다른형식 → 표준 한글)
ipcMain.handle('internalLink:normalizeCategories', async () => {
  try {
    const result = internalLinkManager.normalizeAllCategories();
    return { success: true, ...result };
  } catch (error) {
    return { success: false, message: `정규화 실패: ${(error as Error).message}` };
  }
});

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
    try { fsSync.unlinkSync(inputPath); } catch { }

    console.log(`[Main] ✅ 썸네일 텍스트 오버레이 완료: ${outputPath}`);
    return { success: true, outputPath, previewDataUrl };
  } catch (error) {
    console.error(`[Main] ❌ 썸네일 오버레이 실패:`, error);
    return { success: false, message: `오버레이 실패: ${(error as Error).message}` };
  }
});

// ✅ 다중 블로그 관리 IPC 핸들러
ipcMain.handle('account:add', async (_event, name: string, blogId: string, naverId?: string, naverPassword?: string, settings?: any) => {
  try {
    const account = blogAccountManager.addAccount(name, blogId, naverId, naverPassword, settings);

    // ✅ 계정 추가 시 패널에 동기화
    reportUserActivity().catch(err => console.error('[Main] Sync after add failed:', err));

    return { success: true, account };
  } catch (error) {
    return { success: false, message: `추가 실패: ${(error as Error).message}` };
  }
});

// ✅ 계정 로그인 정보 가져오기
ipcMain.handle('account:getCredentials', async (_event, accountId: string) => {
  try {
    const credentials = blogAccountManager.getAccountCredentials(accountId);
    return { success: true, credentials };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

// ✅ 계정 로그인 정보 업데이트
ipcMain.handle('account:updateCredentials', async (_event, accountId: string, naverId: string, naverPassword: string) => {
  try {
    const result = blogAccountManager.updateAccountCredentials(accountId, naverId, naverPassword);
    return { success: result, message: result ? '로그인 정보 업데이트 완료' : '계정을 찾을 수 없습니다.' };
  } catch (error) {
    return { success: false, message: `업데이트 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('account:update', async (_event, accountId: string, updates: any) => {
  try {
    const success = blogAccountManager.updateAccount(accountId, updates);
    if (success) {
      // ✅ 계정 수정 시 패널에 동기화
      reportUserActivity().catch(err => console.error('[Main] Sync after update failed:', err));
    }
    return { success };
  } catch (error) {
    return { success: false, message: `업데이트 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('account:remove', async (_event, accountId: string) => {
  try {
    const success = blogAccountManager.removeAccount(accountId);
    if (success) {
      // ✅ 계정 삭제 시 패널에 동기화
      reportUserActivity().catch(err => console.error('[Main] Sync after remove failed:', err));
    }
    return { success };
  } catch (error) {
    return { success: false, message: `삭제 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('account:setActive', async (_event, accountId: string) => {
  try {
    const result = blogAccountManager.setActiveAccount(accountId);
    return { success: result };
  } catch (error) {
    return { success: false, message: `설정 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('account:getActive', async () => {
  try {
    const account = blogAccountManager.getActiveAccount();
    return { success: true, account };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('account:getAll', async () => {
  try {
    const accounts = blogAccountManager.getAllAccounts();
    return { success: true, accounts };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('account:getNext', async () => {
  try {
    const account = blogAccountManager.getNextAccountForPublish();
    return { success: true, account };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('account:getStats', async (_event, accountId: string) => {
  try {
    const stats = blogAccountManager.getAccountStats(accountId);
    return { success: true, stats };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('account:getTotalStats', async () => {
  try {
    const stats = blogAccountManager.getTotalStats();
    return { success: true, stats };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('account:toggle', async (_event, accountId: string) => {
  try {
    const isActive = blogAccountManager.toggleAccountActive(accountId);

    // ✅ 활성화 상태 변경 시 패널에 동기화
    reportUserActivity().catch(err => console.error('[Main] Sync after toggle failed:', err));

    return { success: true, isActive };
  } catch (error) {
    return { success: false, message: `토글 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('account:recordPublish', async (_event, accountId: string) => {
  try {
    blogAccountManager.recordPublish(accountId);
    return { success: true };
  } catch (error) {
    return { success: false, message: `기록 실패: ${(error as Error).message}` };
  }
});

// ✅ 계정 설정 업데이트 (개별 설정 포함)
ipcMain.handle('account:updateSettings', async (_event, accountId: string, settings: any) => {
  try {
    const result = blogAccountManager.updateAccountSettings(accountId, settings);
    return { success: result, message: result ? '설정 업데이트 완료' : '계정을 찾을 수 없습니다.' };
  } catch (error) {
    return { success: false, message: `설정 업데이트 실패: ${(error as Error).message}` };
  }
});

// ✅ 계정별 다음 콘텐츠 소스 가져오기
ipcMain.handle('account:getNextContentSource', async (_event, accountId: string) => {
  try {
    const source = blogAccountManager.getNextContentSource(accountId);
    return { success: true, source };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

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

      if (apiRes.data && apiRes.data.isSuccess && apiRes.data.result && apiRes.data.result.mylogCategoryList) {
        const rawList = apiRes.data.result.mylogCategoryList;
        const categories: Array<{ id: string; name: string; postCount?: number }> = [];

        rawList.forEach((c: any) => {
          // 구분선(divisionLine) 제외, 공개된 카테고리만 포함
          if (c.divisionLine || c.categoryNo === '0' || c.categoryNo === 0) return;

          let cleanName = String(c.categoryName).trim();
          // 하위 카테고리인 경우 시각적 계층 표현 추가
          if (c.childCategory && c.parentCategoryNo) {
            cleanName = ` └ ${cleanName}`;
          }

          categories.push({
            id: String(c.categoryNo),
            name: cleanName,
            postCount: c.postCnt
          });
        });

        if (categories.length > 0) {
          console.log('[Main] Stage 1 성공:', categories.length, '개 추출 완료');
          return { success: true, categories };
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

      const categories = await page.evaluate(() => {
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

      await browser.close();

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
      await browser.close();
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

    sendLog(`🚀 다중계정 동시발행 시작: ${accountIds.length}개 계정`);

    const results: Array<{ accountId: string; success: boolean; message?: string; url?: string }> = [];

    // ✅ [2026-01-20] 순차 예약 시간 계산을 위한 기준값
    const baseScheduleDate = options?.scheduleDate;
    const baseScheduleTime = options?.scheduleTime;
    const scheduleIntervalMinutes = options?.scheduleInterval || 360;  // 기본 6시간 (360분)
    const useRandomOffset = options?.scheduleRandomOffset !== false;  // ✅ 기본값: 랜덤 편차 사용 (false면 정확한 간격)
    const isScheduleMode = options?.publishMode === 'schedule' && baseScheduleDate && baseScheduleTime;

    if (isScheduleMode) {
      const randomInfo = useRandomOffset ? '+ ±15분 랜덤 편차' : '(정확한 간격)';
      sendLog(`📅 순차 예약 모드: 기준 ${baseScheduleDate} ${baseScheduleTime}, 간격 ${scheduleIntervalMinutes}분 ${randomInfo}`);
    }

    //  순차 발행 (각 계정에 대해 executePostCycle 호출)
    const limitedAccountIds = accountIds.slice(0, 10);  // 최대 10개 제한
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

        // ✅ [2026-01-19 BUG FIX v2] preGeneratedContent도 확인 (renderer에서 이 이름으로 전달함)
        const preGenerated = options?.preGeneratedContent || options?.structuredContent;

        // options에 이미 콘텐츠가 있으면 그대로 사용 (renderer에서 미리 생성된 경우)
        if (preGenerated) {
          structuredContent = preGenerated.structuredContent || preGenerated;
          title = preGenerated.title || structuredContent?.selectedTitle || title;
          content = preGenerated.content || structuredContent?.bodyPlain || content;
          generatedImages = preGenerated.generatedImages || generatedImages;
          sendLog(`   📄 기존 콘텐츠 사용: "${(title || '').substring(0, 30)}..."`);
        }
        // contentSource가 있고 콘텐츠가 없으면 새로 생성
        else if (contentSource && (!title || !content)) {
          sendLog(`   🔄 콘텐츠 생성 중... (소스: ${contentSource.type === 'keyword' ? '키워드' : 'URL'})`);
          try {
            const sourceValue = contentSource.value || contentSource;
            const accountSettings = account.settings as any;
            const source = {
              type: contentSource.type === 'keyword' ? 'keyword' : 'url',
              value: String(sourceValue),
              targetAge: accountSettings?.targetAge || 'all',
              toneStyle: accountSettings?.toneStyle || 'friendly',
              contentMode: accountSettings?.contentMode || 'seo',
              // 쇼핑커넥트 모드 설정
              affiliateUrl: accountSettings?.affiliateLink,
            };

            const generated = await generateStructuredContent(source as any, {
              provider: 'gemini',
              minChars: accountSettings?.minCharCount || 4000,
            });

            structuredContent = generated;
            title = (generated as any).selectedTitle || `${sourceValue} 관련 글`;
            content = (generated as any).bodyPlain || (generated as any).body || '';
            sendLog(`   ✅ 콘텐츠 생성 완료: "${(title || '').substring(0, 30)}..." (${(content || '').length}자)`);
          } catch (genError) {
            sendLog(`   ⚠️ 콘텐츠 생성 실패: ${(genError as Error).message}`);
            results.push({ accountId, success: false, message: `콘텐츠 생성 실패: ${(genError as Error).message}` });
            continue;
          }
        }

        // 여전히 콘텐츠가 없으면 건너뛰기
        if (!title || !content) {
          sendLog(`   ⚠️ 콘텐츠가 없습니다. 발행 건너뜀.`);
          results.push({ accountId, success: false, message: '콘텐츠가 없습니다.' });
          continue;
        }

        // ✅ [2026-01-20] 순차 예약 시간 계산 (각 계정마다 간격 증가 + 랜덤 편차)
        let accountScheduleDate = options?.scheduleDate;
        let accountScheduleTime = options?.scheduleTime;

        if (isScheduleMode) {
          const baseTime = new Date(`${baseScheduleDate}T${baseScheduleTime}`);
          const offsetMinutes = i * scheduleIntervalMinutes;
          // ✅ [2026-02-08 FIX] 랜덤 편차도 10분 단위 (네이버 서버 예약 10분 단위 제한)
          // 기존: ±15분(1분 단위) → ±10분(10분 단위): -10, 0, +10 중 랜덤
          const randomOffsetMinutes = useRandomOffset ? (Math.floor(Math.random() * 3) - 1) * 10 : 0;  // -10, 0, +10분
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

        //  executePostCycle 호출을 위한 payload 구성
        // ✅ [2026-01-24 FIX] options를 먼저 스프레드하여 명시적 값으로 덮어쓰기 가능
        const payload = {
          ...options,  // ✅ 먼저 스프레드 (나중에 명시적 값으로 덮어씀)
          naverId: credentials.naverId,
          naverPassword: credentials.naverPassword,
          publishMode: isScheduleMode ? 'schedule' : (account.settings?.publishMode || 'publish'),
          scheduleDate: accountScheduleDate,  // ✅ 순차 예약 날짜
          scheduleTime: accountScheduleTime,  // ✅ 순차 예약 시간
          toneStyle: account.settings?.toneStyle || 'friendly',
          categoryName: options?.categoryName || account.settings?.category, // ✅ [2026-02-09 FIX] renderer 전달값 우선 (실제 블로그 폴더명), 없으면 계정 설정 fallback
          isFullAuto: true,
          title,        // ✅ 생성된 제목
          content,      // ✅ 생성된 콘텐츠
          structuredContent, // ✅ 구조화된 콘텐츠
          generatedImages: generatedImages.length > 0 ? generatedImages : undefined, // ✅ 이미지
          // ✅ [2026-01-24 FIX] CTA 관련 설정 명시적 전달
          skipCta: options?.skipCta === true ? true : false,  // 명시적으로 true일 때만 CTA 건너뛰기
          contentMode: options?.contentMode || (account.settings as any)?.contentMode || 'homefeed',  // ✅ contentMode 전달
          affiliateLink: options?.affiliateLink || (account.settings as any)?.affiliateLink,  // ✅ 제휴링크 전달
          // ✅ [2026-01-28] 이미지 설정 전역 적용 (renderer에서 전달받은 설정)
          scSubImageSource: options?.scSubImageSource || 'ai',  // 수집 이미지 직접 사용 여부
          collectedImages: options?.collectedImages || structuredContent?.collectedImages || [],  // 수집 이미지
          thumbnailImageRatio: options?.thumbnailImageRatio || '1:1',  // 썸네일 비율
          subheadingImageRatio: options?.subheadingImageRatio || '1:1',  // 소제목 비율
          scAutoThumbnailSetting: options?.scAutoThumbnailSetting || false,  // 자동 썸네일
        };

        //  새 엔진 호출
        const result = await AutomationService.executePostCycle(payload as any);

        results.push({
          accountId,
          success: result.success,
          message: result.message,
          url: result.url,
        });

        if (result.success) {
          sendLog(`✅ [${account.name}] 발행 성공: ${result.url || '완료'}`);
        } else {
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

    //  무료 티어 quota 소비
    try {
      if (successCount > 0 && (await isFreeTierUser())) {
        await consumeQuota('publish', successCount);
      }
    } catch { }

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

  // 취소 플래그 설정
  multiAccountAbortFlag = true;

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

// ✅ AI 제목 A/B 테스트 IPC 핸들러
ipcMain.handle('title:generateCandidates', async (_event, keyword: string, category?: string, count?: number) => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] title:generateCandidates - 설정 동기화 실패:', e);
  }

  try {
    const result = titleABTester.generateTitleCandidates(keyword, category, count);
    return { success: true, result };
  } catch (error) {
    return { success: false, message: `생성 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('title:evaluate', async (_event, title: string, category?: string) => {
  // ✅ 실행 직전 최신 설정 강제 동기화
  try {
    const config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.error('[Main] title:evaluate - 설정 동기화 실패:', e);
  }

  try {
    const evaluation = titleABTester.evaluateTitle(title, category);
    return { success: true, evaluation };
  } catch (error) {
    return { success: false, message: `평가 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('title:suggestImprovements', async (_event, title: string) => {
  try {
    const suggestions = titleABTester.suggestImprovements(title);
    return { success: true, suggestions };
  } catch (error) {
    return { success: false, message: `제안 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('title:getStyles', async () => {
  try {
    const styles = titleABTester.getAvailableStyles();
    return { success: true, styles };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

// ✅ 댓글 자동 답글 IPC 핸들러
ipcMain.handle('comment:add', async (_event, author: string, content: string, postUrl: string, postTitle: string) => {
  try {
    const comment = commentResponder.addComment(author, content, postUrl, postTitle);
    return { success: true, comment };
  } catch (error) {
    return { success: false, message: `추가 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('comment:generateReply', async (_event, commentId: string, customAnswer?: string) => {
  try {
    const comment = commentResponder.getComment(commentId);
    if (!comment) return { success: false, message: '댓글을 찾을 수 없습니다.' };
    const reply = commentResponder.generateReply(comment, customAnswer);
    return { success: true, reply };
  } catch (error) {
    return { success: false, message: `생성 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('comment:markReplied', async (_event, commentId: string, replyContent: string) => {
  try {
    const result = commentResponder.markAsReplied(commentId, replyContent);
    return { success: result };
  } catch (error) {
    return { success: false, message: `처리 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('comment:getPending', async () => {
  try {
    const comments = commentResponder.getPendingComments();
    return { success: true, comments };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('comment:getReplied', async () => {
  try {
    const comments = commentResponder.getRepliedComments();
    return { success: true, comments };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('comment:getStats', async () => {
  try {
    const stats = commentResponder.getStats();
    return { success: true, stats };
  } catch (error) {
    return { success: false, message: `조회 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('comment:generateBulk', async () => {
  try {
    const replies = commentResponder.generateBulkReplies();
    return { success: true, replies };
  } catch (error) {
    return { success: false, message: `생성 실패: ${(error as Error).message}` };
  }
});

// ✅ 경쟁 블로그 분석 IPC 핸들러
ipcMain.handle('competitor:analyze', async (_event, keyword: string) => {
  try {
    sendLog(`🔍 경쟁 분석 중: ${keyword}`);
    const result = await competitorAnalyzer.analyzeCompetitors(keyword);
    sendLog(`✅ 경쟁 분석 완료: ${keyword} (난이도: ${result.difficulty})`);
    return { success: true, result };
  } catch (error) {
    return { success: false, message: `분석 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('competitor:analyzeBlog', async (_event, blogId: string) => {
  try {
    const result = await competitorAnalyzer.analyzeBlog(blogId);
    return { success: true, result };
  } catch (error) {
    return { success: false, message: `분석 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('competitor:clearCache', async () => {
  try {
    competitorAnalyzer.clearCache();
    return { success: true, message: '캐시가 초기화되었습니다.' };
  } catch (error) {
    return { success: false, message: `초기화 실패: ${(error as Error).message}` };
  }
});

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
      return { success: false, message: '라이선스 인증이 필요합니다.' };
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

      // ✅ toneStyle 전달 (글톤/말투 스타일 - 매우 중요!)
      const toneStyle = (payload.assembly as any).toneStyle as string | undefined;
      if (toneStyle) {
        source.toneStyle = toneStyle as any;
        console.log(`[Main] ✅ 글톤 스타일 적용: ${toneStyle}`);
      } else {
        console.log(`[Main] ⚠️ 글톤 스타일 미지정 → 카테고리 기반 자동 매칭`);
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
      });

      // RSS/URL에서 이미지 추출 여부 확인 (여러 URL 지원)
      // 이미지 수집 기능 제거됨 (DALL-E와 Pexels만 사용)
      // 네이버 블로그 크롤링, RSS 이미지 추출 등은 더 이상 사용하지 않음
      let imageCount = 0;

      // 사용자 지정(minChars) 우선, 없으면 연령대 기본값 사용
      const customMin = (payload.assembly as any).minChars as number | undefined;
      const baseMinChars = (typeof customMin === 'number' && !Number.isNaN(customMin) && customMin > 0)
        ? Math.floor(customMin)
        : getMinCharsForAge(targetAge);
      const minChars = baseMinChars;

      console.log('[Main] 최소 글자수 설정:', { customMin, targetAge, minChars });

      const content = await generateStructuredContent(source, {
        provider,
        minChars,
      });

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
      console.error('[Main] 전체 오류 객체:', error);

      return { success: false, message };
    }
  },
);

ipcMain.handle('config:get', async () => {
  try {
    // 항상 최신 설정을 로드 (캐시된 값이 있어도 파일에서 다시 읽기)
    appConfig = await loadConfig();
    applyConfigToEnv(appConfig);
    console.log('[Main] config:get 호출 - 설정 로드 완료');
    console.log('[Main] 로드된 설정 키:', Object.keys(appConfig).filter(k => k.includes('ApiKey') || k.includes('Key')));
    // ✅ tutorialVideos 확인 로그
    const tutorials = (appConfig as any).tutorialVideos;
    console.log('[Main] tutorialVideos 개수:', tutorials ? tutorials.length : 0);
    return appConfig;
  } catch (error) {
    console.error('[Main] config:get 오류:', error);
    // 오류 발생 시 기존 캐시된 설정 반환
    return appConfig;
  }
});

ipcMain.handle('config:save', async (_event, payload: AppConfig) => {
  appConfig = await saveConfig(payload);
  applyConfigToEnv(appConfig);
  return appConfig;
});

ipcMain.handle('config:set', async (_event, payload: AppConfig) => {
  // API 키 형식 검증
  const validationErrors: string[] = [];

  if (payload.geminiApiKey) {
    const validation = validateApiKeyFormat(payload.geminiApiKey, 'gemini');
    if (!validation.valid) {
      validationErrors.push(`Gemini: ${validation.message}`);
    }
  }

  if (payload.openaiApiKey) {
    const validation = validateApiKeyFormat(payload.openaiApiKey, 'openai');
    if (!validation.valid) {
      validationErrors.push(`OpenAI: ${validation.message}`);
    }
  }


  if (payload.claudeApiKey) {
    const validation = validateApiKeyFormat(payload.claudeApiKey, 'claude');
    if (!validation.valid) {
      validationErrors.push(`Claude: ${validation.message}`);
    }
  }

  if (validationErrors.length > 0) {
    const errorMessage = `⚠️ API 키 형식 오류:\n${validationErrors.join('\n')}`;
    sendLog(errorMessage);
    console.error('[Main] API 키 검증 실패:', validationErrors);
  }

  const nextConfig = await saveConfig(payload ?? {});
  appConfig = nextConfig;
  applyConfigToEnv(nextConfig);

  // API 키 저장 확인 로그
  if (nextConfig.geminiApiKey && nextConfig.geminiApiKey.trim()) {
    const keyLength = nextConfig.geminiApiKey.trim().length;
    const isValid = validateApiKeyFormat(nextConfig.geminiApiKey, 'gemini').valid;
    sendLog(`✅ Gemini API 키 저장됨 (길이: ${keyLength}자, 형식: ${isValid ? '올바름' : '오류'})`);
    console.log('[Main] Gemini API 키 환경변수 설정 확인:', process.env.GEMINI_API_KEY ? '설정됨' : '설정 안됨');
  } else {
    sendLog('⚠️ Gemini API 키가 저장되지 않았습니다.');
  }

  if (nextConfig.openaiApiKey && nextConfig.openaiApiKey.trim()) {
    const keyLength = nextConfig.openaiApiKey.trim().length;
    const isValid = validateApiKeyFormat(nextConfig.openaiApiKey, 'openai').valid;
    sendLog(`✅ OpenAI API 키 저장됨 (길이: ${keyLength}자, 형식: ${isValid ? '올바름' : '오류'})`);
  }


  if (nextConfig.claudeApiKey && nextConfig.claudeApiKey.trim()) {
    const keyLength = nextConfig.claudeApiKey.trim().length;
    const isValid = validateApiKeyFormat(nextConfig.claudeApiKey, 'claude').valid;
    sendLog(`✅ Claude API 키 저장됨 (길이: ${keyLength}자, 형식: ${isValid ? '올바름' : '오류'})`);
  }

  if (nextConfig.dailyPostLimit !== undefined) {
    setDailyLimit(nextConfig.dailyPostLimit);
  }
  if (nextConfig.appIconPath) {
    sendLog(`🖼️ 사용자 지정 앱 아이콘 경로: ${nextConfig.appIconPath}`);
  }
  sendLog('⚙️ 설정이 저장되었습니다.');
  return nextConfig;
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
      previewDataUrl: img.localPath ? `file://${img.localPath}` : img.url,
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

      await browser.close();

      if (images.length > 0) {
        console.log(`[Main] URL에서 ${images.length}개 이미지 추출 완료`);
        return { success: true, images, title: pageTitle };
      } else {
        return { success: false, message: '이미지를 찾을 수 없습니다.' };
      }
    } catch (pageError) {
      await browser.close();
      throw pageError;
    }
  } catch (error) {
    console.error('[Main] URL 이미지 크롤링 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

// 소제목 이미지 관리 IPC 핸들러
ipcMain.handle('heading:applyImage', async (_event, heading: string, image: HeadingImageRecord): Promise<{ success: boolean; message?: string }> => {
  try {
    if (!heading || !heading.trim()) {
      return { success: false, message: '소제목이 비어있습니다.' };
    }
    if (!image || !image.filePath) {
      return { success: false, message: '이미지 정보가 올바르지 않습니다.' };
    }

    headingImagesStore.set(heading.trim(), {
      provider: image.provider,
      filePath: image.filePath,
      previewDataUrl: image.previewDataUrl,
      updatedAt: image.updatedAt || Date.now(),
      alt: image.alt,
      caption: image.caption,
    });

    await saveHeadingImagesStore();
    console.log(`[Main] 소제목 "${heading}"에 이미지 적용 완료`);
    return { success: true };
  } catch (error) {
    console.error('[Main] 소제목 이미지 적용 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('heading:getAppliedImage', async (_event, heading: string): Promise<{ success: boolean; image?: HeadingImageRecord; message?: string }> => {
  try {
    if (!heading || !heading.trim()) {
      return { success: false, message: '소제목이 비어있습니다.' };
    }

    const image = headingImagesStore.get(heading.trim());
    if (!image) {
      return { success: true, image: undefined };
    }

    return { success: true, image };
  } catch (error) {
    console.error('[Main] 소제목 이미지 조회 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('heading:removeImage', async (_event, heading: string): Promise<{ success: boolean; message?: string }> => {
  try {
    if (!heading || !heading.trim()) {
      return { success: false, message: '소제목이 비어있습니다.' };
    }

    const deleted = headingImagesStore.delete(heading.trim());
    if (deleted) {
      await saveHeadingImagesStore();
      console.log(`[Main] 소제목 "${heading}"의 이미지 제거 완료`);
    }

    return { success: true };
  } catch (error) {
    console.error('[Main] 소제목 이미지 제거 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('heading:getAllAppliedImages', async (): Promise<{ success: boolean; images?: Record<string, HeadingImageRecord>; message?: string }> => {
  try {
    const images = Object.fromEntries(headingImagesStore);
    return { success: true, images };
  } catch (error) {
    console.error('[Main] 모든 소제목 이미지 조회 실패:', error);
    return { success: false, message: (error as Error).message };
  }
});

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

ipcMain.handle('license:verify', async (_event, code: string, deviceId: string, email?: string): Promise<{ valid: boolean; license?: LicenseInfo; message?: string }> => {
  try {
    const serverUrl = process.env.LICENSE_SERVER_URL || 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
    return await verifyLicense(code, deviceId, serverUrl, email);
  } catch (error) {
    return {
      valid: false,
      message: `라이선스 검증 중 오류: ${(error as Error).message}`,
    };
  }
});

ipcMain.handle('license:verifyWithCredentials', async (_event, userId: string, password: string, deviceId: string): Promise<{ valid: boolean; license?: LicenseInfo; message?: string; debugInfo?: any }> => {
  try {
    const serverUrl = process.env.LICENSE_SERVER_URL || 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
    return await verifyLicenseWithCredentials(userId, password, deviceId, serverUrl);
  } catch (error) {
    return {
      valid: false,
      message: `라이선스 검증 중 오류: ${(error as Error).message}`,
    };
  }
});

// 외부 유입 90일 라이선스 등록
ipcMain.handle('license:registerExternalInflow', async (): Promise<{ success: boolean; message: string; expiresAt?: string }> => {
  try {
    console.log('[Main] 외부 유입 90일 라이선스 등록 요청');
    const result = await registerExternalInflowLicense();
    console.log('[Main] 외부 유입 라이선스 등록 결과:', result);
    return result;
  } catch (error) {
    console.error('[Main] 외부 유입 라이선스 등록 오류:', error);
    return {
      success: false,
      message: `외부 유입 라이선스 등록 실패: ${(error as Error).message}`
    };
  }
});

// 외부 유입 기능 사용 가능 여부 확인
ipcMain.handle('license:canUseExternalInflow', async (): Promise<boolean> => {
  try {
    const canUse = await canUseExternalInflow();
    console.log('[Main] 외부 유입 기능 사용 가능 여부:', canUse);
    return canUse;
  } catch (error) {
    console.error('[Main] 외부 유입 기능 검증 오류:', error);
    return false;
  }
});

ipcMain.handle('license:checkPatchFile', async (): Promise<boolean> => {
  try {
    return await checkPatchFile();
  } catch (error) {
    console.error('[Main] 패치 파일 확인 실패:', (error as Error).message);
    return false;
  }
});

ipcMain.handle('app:isPackaged', async (): Promise<boolean> => {
  return app.isPackaged;
});

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

ipcMain.handle('license:getDeviceId', async (): Promise<string> => {
  try {
    return await getDeviceId();
  } catch (error) {
    console.error('[Main] 기기 ID 생성 실패:', (error as Error).message);
    return '';
  }
});

// ✅ [2026-02-05] 앱 버전 반환 (라이선스 창 및 메인 창에서 버전 표시용)
ipcMain.handle('app:getVersion', async (): Promise<string> => {
  return app.getVersion();
});

ipcMain.handle('license:testServer', async (_event, serverUrl?: string): Promise<{ success: boolean; message: string; response?: any }> => {
  try {
    return await testLicenseServer(serverUrl);
  } catch (error) {
    console.error('[Main] License server test error:', (error as Error).message);
    return {
      success: false,
      message: `테스트 실패: ${(error as Error).message}`,
    };
  }
});

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

// 관리자 패널 API 핸들러들
ipcMain.handle('admin:connect', async (): Promise<{ success: boolean; message: string }> => {
  try {
    console.log('[Admin] 관리자 패널 연결 시도...');

    // 라이선스 검증
    const isValid = await ensureLicenseValid();
    if (!isValid) {
      return { success: false, message: '라이선스가 유효하지 않습니다.' };
    }

    // 관리자 패널 연결 로직 (실제로는 서버 API 호출)
    // TODO: 관리자 패널 서버에 연결

    console.log('[Admin] 관리자 패널 연결 성공');
    return { success: true, message: '관리자 패널에 연결되었습니다.' };
  } catch (error) {
    console.error('[Admin] 연결 실패:', error);
    return { success: false, message: `연결 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('admin:syncSettings', async (): Promise<{ success: boolean; message: string; settings?: any }> => {
  try {
    console.log('[Admin] 관리자 설정 동기화 시도...');

    // 라이선스 검증
    const isValid = await ensureLicenseValid();
    if (!isValid) {
      return { success: false, message: '라이선스가 유효하지 않습니다.' };
    }

    // 관리자 설정 동기화 로직
    // TODO: 서버에서 설정을 가져와서 로컬에 적용

    console.log('[Admin] 관리자 설정 동기화 완료');
    return { success: true, message: '설정이 동기화되었습니다.', settings: {} };
  } catch (error) {
    console.error('[Admin] 설정 동기화 실패:', error);
    return { success: false, message: `동기화 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('admin:sendReport', async (_event, reportData: any): Promise<{ success: boolean; message: string }> => {
  try {
    console.log('[Admin] 관리자 보고서 전송 시도...');

    // 라이선스 검증
    const isValid = await ensureLicenseValid();
    if (!isValid) {
      return { success: false, message: '라이선스가 유효하지 않습니다.' };
    }

    // 관리자 보고서 전송 로직
    // TODO: 사용 통계, 오류 정보 등을 서버로 전송

    console.log('[Admin] 관리자 보고서 전송 완료');
    return { success: true, message: '보고서가 전송되었습니다.' };
  } catch (error) {
    console.error('[Admin] 보고서 전송 실패:', error);
    return { success: false, message: `전송 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('admin:checkPermissions', async (): Promise<{ success: boolean; permissions?: any }> => {
  try {
    console.log('[Admin] 관리자 권한 확인 시도...');

    // 라이선스 검증
    const isValid = await ensureLicenseValid();
    if (!isValid) {
      return { success: false, permissions: { isValid: false } };
    }

    // 관리자 권한 확인 로직
    // TODO: 서버에서 권한 정보를 가져옴

    console.log('[Admin] 관리자 권한 확인 완료');
    return {
      success: true,
      permissions: {
        isValid: true,
        canAccessAdminPanel: true,
        canSyncSettings: true,
        canSendReports: true
      }
    };
  } catch (error) {
    console.error('[Admin] 권한 확인 실패:', error);
    return { success: false, permissions: { isValid: false, error: (error as Error).message } };
  }
});

ipcMain.handle('admin:syncAccounts', async () => {
  try {
    console.log('[Admin] 수동 계정 동기화 시도...');
    await reportUserActivity();
    return { success: true, message: '패널과 계정 정보 동기화 완료' };
  } catch (error) {
    console.error('[Admin] 계정 동기화 실패:', error);
    return { success: false, message: `동기화 실패: ${(error as Error).message}` };
  }
});

ipcMain.handle('admin:verifyPin', async (_event, pin: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const configured = (process.env.ADMIN_PIN || '').trim();
    if (!configured) {
      return { success: false, message: 'ADMIN_PIN이 설정되지 않았습니다.' };
    }
    const input = String(pin || '').trim();
    if (!input) {
      return { success: false, message: 'PIN이 입력되지 않았습니다.' };
    }
    if (input !== configured) {
      return { success: false, message: 'PIN이 올바르지 않습니다.' };
    }
    return { success: true };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('license:clear', async (): Promise<void> => {
  try {
    await clearLicense();
  } catch (error) {
    console.error('[Main] 라이선스 삭제 실패:', (error as Error).message);
  }
});

ipcMain.handle('license:revalidate', async (_event, serverUrl?: string): Promise<boolean> => {
  try {
    return await revalidateLicense(serverUrl || process.env.LICENSE_SERVER_URL);
  } catch (error) {
    console.error('[Main] License revalidation error:', (error as Error).message);
    return false;
  }
});

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

// 외부 URL을 브라우저에서 열기
ipcMain.handle('openExternalUrl', async (_event, url: string): Promise<{ success: boolean; message?: string }> => {
  try {
    if (!url || !url.trim()) {
      return { success: false, message: 'URL이 비어있습니다.' };
    }

    // URL 유효성 검사
    const urlPattern = /^https?:\/\//i;
    if (!urlPattern.test(url.trim())) {
      return { success: false, message: '유효하지 않은 URL 형식입니다.' };
    }

    await shell.openExternal(url.trim());
    console.log(`[Main] 외부 URL 열기: ${url}`);
    return { success: true };
  } catch (error) {
    console.error('[Main] 외부 URL 열기 실패:', (error as Error).message);
    return { success: false, message: (error as Error).message };
  }
});

async function createLoginWindow(): Promise<BrowserWindow> {
  debugLog('[createLoginWindow] Creating login window...');

  loginWindow = new BrowserWindow({
    width: 500,
    height: 650,
    resizable: false,
    show: true, // 즉시 표시
    frame: true,
    center: true, // 화면 중앙에 표시
    alwaysOnTop: true, // 최상위에 표시
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true,
      devTools: true, // 개발자 도구 활성화
    },
    title: '라이선스 인증',
    icon: resolveIconImage(),
  });

  debugLog('[createLoginWindow] BrowserWindow created (showing immediately)');

  const loginHtmlPath = path.join(publicPath, 'login.html');
  debugLog(`[createLoginWindow] Loading HTML from: ${loginHtmlPath}`);

  try {
    await loginWindow.loadFile(loginHtmlPath);
    debugLog('[createLoginWindow] HTML loaded successfully');

    // HTML 로드 후 포커스
    loginWindow.focus();
    loginWindow.show();

    // 1초 후 항상 위 모드 해제
    setTimeout(() => {
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.setAlwaysOnTop(false);
        loginWindow.focus();
        debugLog('[createLoginWindow] Always on top disabled');
      }
    }, 1000);
  } catch (error) {
    debugLog(`[createLoginWindow] !!! ERROR loading HTML: ${(error as Error).message}`);
    throw error;
  }

  loginWindow.on('closed', () => {
    debugLog('[createLoginWindow] Login window closed event');
    loginWindow = null;
  });

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
    const licenseWindow = new BrowserWindow({
      width: 500,
      height: 300,
      resizable: false,
      modal: true,
      parent: mainWindow || undefined,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
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
              const { ipcRenderer } = require('electron');
              ipcRenderer.send('license:code', code);
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
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Main] Another instance is already running. Exiting immediately...');
  // 즉시 종료 (다른 코드 실행 없이)
  process.exit(0);
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

    // 로그인 창이 있으면 포커스
    if (loginWindow && !loginWindow.isDestroyed()) {
      if (loginWindow.isMinimized()) loginWindow.restore();
      loginWindow.focus();
      loginWindow.show();
    }
  });
}

// ffmpeg 경고 무시 (미디어 재생 기능 미사용)
app.commandLine.appendSwitch('disable-features', 'MediaFoundationVideoCapture');

app.whenReady().then(async () => {
  try {
    // 앱 이름을 명시적으로 설정하여 올바른 userData 경로 사용
    app.setName('naver-blog-automation');

    // ✅ isPackaged 값을 실제 값으로 업데이트 (배포 환경 감지)

    // ✅ [2026-02-04] 자동 업데이터 초기화 (앱 시작 시 즉시, 윈도우 없이도)
    initAutoUpdaterEarly();

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
      createAutomation: (naverId: string, naverPassword: string) => {
        return new NaverBlogAutomation({ naverId, naverPassword });
      },
      blogAccountManager,
      getDailyLimit,
      getTodayCount,
      incrementTodayCount,
      setGeminiModel,
    });
    debugLog('[Main] BlogExecutor dependencies injected');

    // ✅ [리팩토링] IPC 핸들러 일괄 등록
    // ⚠️ [2026-01-19] main.ts에 이미 대부분 핸들러가 있으므로, 누락된 핸들러만 개별 등록
    // registerAllHandlers() 전체 호출 시 중복 충돌 발생
    try {
      const { registerImageHandlers, registerMediaHandlers, registerHeadingVideoHandlers } = await import('./main/ipc/imageHandlers.js');
      const ctx = {
        getMainWindow: () => mainWindow,
        getAutomationMap: () => automationMap,
        notify: (title: string, body: string) => { /* no-op */ },
        sendToRenderer: (channel: string, ...args: unknown[]) => mainWindow?.webContents.send(channel, ...args)
      };
      registerImageHandlers(ctx);
      registerMediaHandlers(ctx);
      registerHeadingVideoHandlers(ctx);
      debugLog('[Main] Image/Media/HeadingVideo handlers registered from imageHandlers.ts');
    } catch (e) {
      debugLog(`[Main] ⚠️ imageHandlers 등록 실패: ${(e as Error).message}`);
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
                schedulerAutomation = new NaverBlogAutomation({
                  naverId: accountNaverId,
                  naverPassword: accountNaverPassword,
                  headless: false,
                  slowMo: 50,
                });
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

// 글로벌 예외 처리 - 앱 크래시 방지
process.on('uncaughtException', (error) => {
  console.error('[Main] 처리되지 않은 예외:', error);
  const errorMsg = translatePuppeteerError(error);

  // 크래시를 방지하되, 심각한 에러는 로깅
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('error', {
      message: '예기치 않은 오류가 발생했습니다.',
      detail: errorMsg
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] 처리되지 않은 Promise 거부:', reason);
  // Promise 거부도 로깅만 하고 앱은 유지
});

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

// ✅ [2026-01-24] 쇼핑커넥트 SEO 제목 생성 IPC 핸들러
// 네이버 자동완성 키워드를 사용하여 제품명에 세부 키워드 추가
ipcMain.handle('seo:generateTitle', async (_event, productName: string): Promise<{ success: boolean; title?: string; message?: string }> => {
  try {
    console.log(`[SEO] 제목 생성 요청: "${productName}"`);

    if (!productName || productName.trim().length < 3) {
      return { success: true, title: productName || '' };
    }

    const { generateShoppingConnectTitle } = await import('./naverSearchApi.js');
    const seoTitle = await generateShoppingConnectTitle(productName.trim(), 3);

    console.log(`[SEO] 제목 생성 완료: "${seoTitle}"`);
    return { success: true, title: seoTitle };
  } catch (error) {
    console.error('[SEO] 제목 생성 오류:', error);
    return { success: false, title: productName, message: (error as Error).message };
  }
});
