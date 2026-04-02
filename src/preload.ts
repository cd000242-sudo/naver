import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig } from './configManager.js';
import type { StructuredContent } from './contentGenerator.js';
import type { SourceAssemblyInput } from './sourceAssembler.js';

type AutomationPayload = {
  naverId: string;
  naverPassword: string;
  title?: string;
  content?: string;
  lines?: string[];
  selectedHeadings?: string[];
  structuredContent?: StructuredContent;
  generatedImages?: Array<{ heading: string; filePath: string; provider: string; alt?: string; caption?: string }>;
  hashtags?: string[];
  generator?: 'gemini' | 'openai' | 'claude' | 'perplexity';
  keywords?: string[];
  draft?: string;
  rssUrl?: string;
  autoGenerate?: boolean;
  publishMode?: 'draft' | 'publish' | 'schedule';
  categoryName?: string; // ✅ 추가: 카테고리(폴더)명
  scheduleDate?: string;
  scheduleType?: 'app-schedule' | 'naver-server';
  scheduleMethod?: 'datetime-local' | 'individual-inputs';
  ctaLink?: string;
  ctaText?: string;
  ctas?: Array<{ text: string; link?: string }>;
  ctaPosition?: 'top' | 'middle' | 'bottom' | 'each-heading';
  skipCta?: boolean;
  skipImages?: boolean;
  targetAge?: '20s' | '30s' | '40s' | '50s' | 'all';
  thumbnailPath?: string;
  skipDailyLimitWarning?: boolean;
  imageMode?: 'full-auto' | 'semi-auto' | 'manual' | 'skip';
  collectedImages?: Array<{ id: string; url: string; thumbnailUrl: string; title: string; source: string; tags?: string[] }>;
  postId?: string;
  toneStyle?: string;
  keepBrowserOpen?: boolean; // ✅ 추가
  includeThumbnailText?: boolean; // ✅ 추가: 썸네일 텍스트 포함 여부
  affiliateLink?: string; // ✅ 추가: 제휴 링크 (쇼핑커넥트 모드)
  contentMode?: 'affiliate' | 'seo'; // ✅ 추가: 콘텐츠 모드 (쇼핑커넥트/일반)
  isFullAuto?: boolean; // ✅ 추가: 풀오토 모드 여부 (인덱스 기반 이미지 매칭용)
};

type AutomationStatus =
  | { success: true }
  | { success: false; cancelled?: boolean; message?: string };

type GenerateContentResult =
  | { success: true; content: string }
  | { success: false; message?: string };

type GenerateImagesResult =
  | { success: true; images: Array<{ heading: string; filePath: string; previewDataUrl: string; provider: string }> }
  | { success: false; message?: string };

type ImageLibraryItem = {
  id: string;
  url: string;
  filePath: string;
  sourceUrl: string;
  sourceTitle?: string;
  collectedAt: string;
  category?: string;
  tags?: string[];
  previewDataUrl?: string;
};

contextBridge.exposeInMainWorld('api', {
  runAutomation: (payload: AutomationPayload) =>
    ipcRenderer.invoke('automation:run', payload),
  // Excel 관련 API 제거됨
  cancelAutomation: () => ipcRenderer.invoke('automation:cancel'),
  // ✅ [2026-02-23 FIX] 이미지 생성 전체 상태 초기화
  resetImageState: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('automation:resetImageState'),
  closeBrowser: () => ipcRenderer.invoke('automation:closeBrowser'), // ✅ 추가
  launchLeword: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('leword:launch'), // ✅ LEWORD 황금키워드 앱 실행
  freeActivate: (userInfo?: { email: string; nickname: string; phone: string }): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('free:activate', userInfo),
  forceQuit: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('app:forceQuit'),
  getQuotaStatus: (): Promise<{ success: boolean; isFree: boolean; quota: any }> =>
    ipcRenderer.invoke('quota:getStatus'),
  // ✅ [2026-03-02] 이미지 API 일일 사용량 조회
  getImageApiUsage: (): Promise<{ success: boolean; todayCalls?: number; todayCostKrw?: number; date?: string }> =>
    ipcRenderer.invoke('quota:getImageUsage'),
  // ✅ [2026-03-02] Leonardo AI 크레딧 조회
  getLeonardoCredits: (): Promise<{ success: boolean; credits?: number; message?: string; raw?: any }> =>
    ipcRenderer.invoke('quota:getLeonardoCredits'),
  // ✅ [2026-03-18] Gemini API 할당량 확인
  checkGeminiQuota: (apiKey: string): Promise<{ success: boolean; message?: string; data?: any }> =>
    ipcRenderer.invoke('gemini:checkQuota', apiKey),
  // ✅ [2026-03-18] Gemini 사용량 추적 초기화
  resetGeminiUsageTracker: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('gemini:resetUsageTracker'),
  // ✅ [2026-03-18] Gemini 크레딧 예산 설정
  setGeminiCreditBudget: (budget: number): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('gemini:setCreditBudget', budget),
  // ✅ [2026-03-19] 통합 API 사용량 조회 (전 제공자)
  getAllApiUsageSnapshots: (): Promise<{ success: boolean; data?: any; message?: string }> =>
    ipcRenderer.invoke('api:getAllUsageSnapshots'),
  // ✅ [2026-03-19] 통합 API 사용량 초기화 (제공자별 또는 전체)
  resetApiUsage: (provider?: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('api:resetUsage', provider),
  // ✅ [2026-03-18] 범용 API 키 유효성 검증
  validateApiKey: (provider: string, apiKey: string): Promise<{ success: boolean; message?: string; details?: string; balance?: any }> =>
    ipcRenderer.invoke('apiKey:validate', provider, apiKey),
  generateContent: (prompt: string): Promise<GenerateContentResult> =>
    ipcRenderer.invoke('automation:generateContent', prompt),
  // ✅ [2026-03-11 FIX] generateImages 바인딩 추가 (누락으로 인한 연속발행 이미지 생성 실패 수정)
  generateImages: (options: any): Promise<GenerateImagesResult> =>
    ipcRenderer.invoke('automation:generateImages', options),
  // ✅ [2026-03-11 FIX] generateStructuredContent 바인딩 추가 (누락으로 인한 'is not a function' 에러 수정)
  generateStructuredContent: (request: { assembly: SourceAssemblyInput }): Promise<{ success: boolean; content?: StructuredContent; message?: string; imageCount?: number }> =>
    ipcRenderer.invoke('automation:generateStructuredContent', request),
  // ✅ [2026-02-13 SPEED] 개별 이미지 완성 시 실시간 수신 리스너
  onImageGenerated: (callback: (data: { image: any; index: number; total: number }) => void) => {
    const handler = (_event: any, data: { image: any; index: number; total: number }) => callback(data);
    ipcRenderer.on('automation:imageGenerated', handler);
    // cleanup 함수 반환
    return () => { ipcRenderer.removeListener('automation:imageGenerated', handler); };
  },
  // ✅ [2026-02-12] 소제목별 이미지 자동 검색 (네이버 → 구글 폴백)
  searchImagesForHeadings: (payload: { headings: string[]; mainKeyword: string }): Promise<{ success: boolean; images: Record<string, string[]>; message?: string }> =>
    ipcRenderer.invoke('search-images-for-headings', payload),
  checkFileExists: (filePath: string): Promise<boolean> => ipcRenderer.invoke('file:checkExists', filePath),

  readDir: (dirPath: string): Promise<string[]> => ipcRenderer.invoke('file:readDir', dirPath),
  readDirWithStats: (dirPath: string): Promise<Array<{ name: string; isFile: boolean; isDirectory: boolean; size: number; mtime: number; birthtime: number; ctime: number }>> => ipcRenderer.invoke('file:readDirWithStats', dirPath),
  getFileStats: (filePath: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number; mtime: number; birthtime: number; ctime: number } | null> => ipcRenderer.invoke('file:getStats', filePath),
  deleteFolder: (folderPath: string): Promise<boolean> => ipcRenderer.invoke('file:deleteFolder', folderPath),
  // ✅ [2026-03-22] 로컬 폴더 이미지 리사이즈
  resizeImage: (filePath: string, maxWidth: number, maxHeight: number): Promise<{ success: boolean; filePath?: string; message?: string }> => ipcRenderer.invoke('localFolder:resizeImage', filePath, maxWidth, maxHeight),
  deleteFile: (filePath: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('file:deleteFile', filePath),
  getUserHomeDir: (): Promise<string> => ipcRenderer.invoke('os:homedir'),
  openPath: (path: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('shell:openPath', path),

  generateVeoVideo: (payload: {
    prompt: string;
    model?: string;
    durationSeconds?: number;
    aspectRatio?: '16:9' | '9:16' | '1:1' | 'original';
    negativePrompt?: string;
    imagePath?: string;
    image?: { imageBytes: string; mimeType: string };
    heading?: string;
  }): Promise<{ success: true; filePath: string; fileName: string } | { success: false; message?: string }> => ipcRenderer.invoke('gemini:generateVeoVideo', payload),

  listMp4Files: (payload: { dirPath: string }): Promise<{ success: boolean; files?: Array<{ name: string; fullPath: string; mtime: number; size: number }>; message?: string }> =>
    ipcRenderer.invoke('media:listMp4Files', payload),

  convertMp4ToGif: (payload: { sourcePath: string }): Promise<{ success: boolean; gifPath?: string; message?: string }> =>
    ipcRenderer.invoke('media:convertMp4ToGif', payload),
  createKenBurnsVideo: (payload: { imagePath: string; heading?: string; durationSeconds?: number; aspectRatio?: '16:9' | '9:16' | '1:1' | 'original' }): Promise<{ success: boolean; filePath?: string; fileName?: string; message?: string }> =>
    ipcRenderer.invoke('media:createKenBurnsVideo', payload),
  showOpenDialog: (options: any): Promise<{ canceled: boolean; filePaths: string[] }> => ipcRenderer.invoke('dialog:showOpenDialog', options),
  selectVideoFile: (): Promise<{ filePath: string } | null> => ipcRenderer.invoke('dialog:selectVideoFile'),
  getTutorialVideos: (): Promise<any[]> => ipcRenderer.invoke('tutorials:getVideos'),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (config: AppConfig): Promise<AppConfig> => ipcRenderer.invoke('config:set', config),
  getLibraryImages: (category?: string, titleKeywords?: string[]): Promise<ImageLibraryItem[]> =>
    ipcRenderer.invoke('library:getImages', category, titleKeywords),
  getLibraryCategories: (): Promise<string[]> => ipcRenderer.invoke('library:getCategories'),
  deleteLibraryImage: (id: string): Promise<boolean> => ipcRenderer.invoke('library:deleteImage', id),
  collectLibraryImages: (options: { query: string; sources: string[]; count: number }): Promise<{ success: boolean; count: number; message?: string }> =>
    ipcRenderer.invoke('library:collectImages', options),
  batchCollectLibraryImages: (categories: string[]): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('library:batchCollect', categories),
  getImageLibraryStats: (): Promise<{ totalImages: number; categories: number; totalSize: string; sources: Record<string, number> }> =>
    ipcRenderer.invoke('library:getStats'),
  autoCollectImages: (data: {
    title: string;
    keywords: string[];
    category: string;
    imageMode: 'full-auto' | 'semi-auto' | 'manual' | 'skip';
    selectedImageSource?: 'nano-banana-pro' | 'library';
  }): Promise<{
    success: boolean;
    images?: any[];
    totalCount?: number;
    headingCount?: number;
    error?: string;
  }> => ipcRenderer.invoke('auto-collect-images', data),
  applyImagePlacements: (data: {
    selections: Array<{ imageId: string; targetHeadingIndex: number; position: 'above' | 'below' }>;
    images: Array<{ id: string; thumbnailUrl: string; title: string; source: string }>;
  }): Promise<{
    success: boolean;
    inserted?: number;
    failed?: number;
    error?: string;
  }> => ipcRenderer.invoke('apply-image-placements', data),
  syncImageManager: (imageMap: Map<string, any[]>) => ipcRenderer.invoke('automation:syncImageManager', Object.fromEntries(imageMap)),
  collectImagesByTitle: (title: string, sources?: string[]): Promise<{ success: boolean; count: number; message?: string }> =>
    ipcRenderer.invoke('library:collectByKeywords', title),
  analyzeBlogCategories: async (blogId?: string): Promise<{ success: boolean; categories?: Array<{ id: string; name: string; postCount?: number }>; message?: string; error?: string }> => {
    try {
      // blogId가 없으면 현재 활성화된 계정의 정보를 가져와서 분석
      let targetBlogId = blogId;
      if (!targetBlogId) {
        const activeAccount = await ipcRenderer.invoke('account:getActive');
        if (activeAccount && activeAccount.account && activeAccount.account.blogId) {
          targetBlogId = activeAccount.account.blogId;
        }
      }

      if (!targetBlogId) {
        return { success: false, error: '분석할 블로그 ID를 찾을 수 없습니다.' };
      }

      return await ipcRenderer.invoke('blog:fetchCategories', targetBlogId);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // ✅ 폴더 선택 다이얼로그
  selectFolder: (options?: { title?: string; defaultPath?: string }): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke('dialog:showOpenDialog', {
      properties: ['openDirectory'],
      title: options?.title || '폴더 선택',
      defaultPath: options?.defaultPath,
    }),
  collectImagesByKeywords: (keywords: string[], title: string, maxImages?: number): Promise<{ success: boolean; count: number; message?: string }> =>
    ipcRenderer.invoke('library:collectByKeywordsArray', keywords, title, maxImages),
  extractKeywordsFromTitle: (title: string): Promise<{ keywords: string[]; personNames: string[] }> =>
    ipcRenderer.invoke('library:extractKeywords', title),
  onLog: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => {
      callback(message);
    };
    ipcRenderer.on('automation:log', listener);
    return () => ipcRenderer.removeListener('automation:log', listener);
  },
  onStatus: (callback: (status: AutomationStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AutomationStatus) => {
      callback(status);
    };
    ipcRenderer.on('automation:status', listener);
    return () => ipcRenderer.removeListener('automation:status', listener);
  },
  on: (channel: string, callback: (...args: any[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: any[]) => {
      callback(...args);
    };
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  sendLicenseCode: (code: string) => {
    ipcRenderer.send('license:code', code);
  },
  getLicense: async (): Promise<{ license: LicenseInfo | null }> => {
    try {
      return await ipcRenderer.invoke('license:get');
    } catch (error) {
      console.error('[Preload] License get error:', error);
      throw new Error(`라이선스 정보를 가져오는 중 오류가 발생했습니다: ${(error as Error).message}`);
    }
  },
  verifyLicense: async (code: string, deviceId: string, email?: string): Promise<{ valid: boolean; license?: LicenseInfo; message?: string }> => {
    try {
      return await ipcRenderer.invoke('license:verify', code, deviceId, email);
    } catch (error) {
      console.error('[Preload] License verify error:', error);
      throw new Error(`라이선스 인증 중 오류가 발생했습니다: ${(error as Error).message}`);
    }
  },
  verifyLicenseWithCredentials: async (userId: string, password: string, deviceId: string): Promise<{ valid: boolean; license?: LicenseInfo; message?: string }> => {
    try {
      return await ipcRenderer.invoke('license:verifyWithCredentials', userId, password, deviceId);
    } catch (error) {
      console.error('[Preload] Verify license with credentials error:', error);
      throw new Error(`라이선스 인증 중 오류가 발생했습니다: ${(error as Error).message}`);
    }
  },
  // 중복 로그인 감지 시 강제 로그아웃 이벤트 리스너
  onSessionForceLogout: (callback: (data: { message: string }) => void) => {
    const handler = (_event: any, data: { message: string }) => callback(data);
    ipcRenderer.on('session:forceLogout', handler);
    return () => { ipcRenderer.removeListener('session:forceLogout', handler); };
  },
  checkPatchFile: async (): Promise<boolean> => {
    try {
      return await ipcRenderer.invoke('license:checkPatchFile');
    } catch (error) {
      console.error('[Preload] Check patch file error:', error);
      return false;
    }
  },
  registerExternalInflowLicense: async (): Promise<{ success: boolean; message: string; expiresAt?: string }> => {
    try {
      return await ipcRenderer.invoke('license:registerExternalInflow');
    } catch (error) {
      console.error('[Preload] Register external inflow license error:', error);
      return { success: false, message: `외부 유입 라이선스 등록 중 오류: ${(error as Error).message}` };
    }
  },
  canUseExternalInflow: async (): Promise<boolean> => {
    try {
      return await ipcRenderer.invoke('license:canUseExternalInflow');
    } catch (error) {
      console.error('[Preload] Check external inflow access error:', error);
      return false;
    }
  },
  getDeviceId: async (): Promise<string> => {
    try {
      return await ipcRenderer.invoke('license:getDeviceId');
    } catch (error) {
      console.error('[Preload] Device ID get error:', error);
      throw new Error(`기기 ID를 가져오는 중 오류가 발생했습니다: ${(error as Error).message}`);
    }
  },
  // ✅ [2026-02-05] 앱 버전 반환
  getAppVersion: async (): Promise<string> => {
    try {
      return await ipcRenderer.invoke('app:getVersion');
    } catch (error) {
      console.error('[Preload] App version get error:', error);
      return '';
    }
  },
  isPackaged: async (): Promise<boolean> => {
    try {
      return await ipcRenderer.invoke('app:isPackaged');
    } catch (error) {
      console.error('[Preload] isPackaged check error:', error);
      return false;
    }
  },
  // ✅ [2026-03-24] 캐시 관리 API
  getCacheSize: async (): Promise<{ images: number; generated: number; sessions: number; browser: number; total: number }> => {
    try {
      return await ipcRenderer.invoke('app:getCacheSize');
    } catch (error) {
      console.error('[Preload] getCacheSize error:', error);
      return { images: 0, generated: 0, sessions: 0, browser: 0, total: 0 };
    }
  },
  clearAppCache: async (category: 'images' | 'sessions' | 'all'): Promise<{ success: boolean; freedBytes: number; message: string }> => {
    try {
      return await ipcRenderer.invoke('app:clearCache', category);
    } catch (error) {
      console.error('[Preload] clearAppCache error:', error);
      return { success: false, freedBytes: 0, message: `캐시 삭제 실패: ${(error as Error).message}` };
    }
  },
  testLicenseServer: async (serverUrl?: string): Promise<{ success: boolean; message: string; response?: any }> => {
    try {
      return await ipcRenderer.invoke('license:testServer', serverUrl);
    } catch (error) {
      console.error('[Preload] testLicenseServer error:', error);
      return {
        success: false,
        message: `테스트 실패: ${(error as Error).message}`,
      };
    }
  },
  // ✅ 원클릭 네트워크 최적화
  networkOptimize: async (): Promise<{ success: boolean; message: string; results: string[] }> => {
    try {
      return await ipcRenderer.invoke('network:optimize');
    } catch (error) {
      console.error('[Preload] networkOptimize error:', error);
      return {
        success: false,
        message: `최적화 실패: ${(error as Error).message}`,
        results: [`❌ 오류: ${(error as Error).message}`],
      };
    }
  },
  checkLicenseStatus: async (): Promise<{ valid: boolean; reason: string; details?: any }> => {
    try {
      return await ipcRenderer.invoke('license:checkStatus');
    } catch (error) {
      console.error('[Preload] checkLicenseStatus error:', error);
      return {
        valid: false,
        reason: `상태 확인 실패: ${(error as Error).message}`,
      };
    }
  },
  adminConnect: async (): Promise<{ success: boolean; message: string }> => {
    try {
      return await ipcRenderer.invoke('admin:connect');
    } catch (error) {
      console.error('[Preload] adminConnect error:', error);
      return { success: false, message: `연결 실패: ${(error as Error).message}` };
    }
  },
  adminSyncSettings: async (): Promise<{ success: boolean; message: string; settings?: any }> => {
    try {
      return await ipcRenderer.invoke('admin:syncSettings');
    } catch (error) {
      console.error('[Preload] adminSyncSettings error:', error);
      return { success: false, message: `동기화 실패: ${(error as Error).message}` };
    }
  },
  adminSyncAccounts: async (): Promise<{ success: boolean; message: string }> => {
    try {
      return await ipcRenderer.invoke('admin:syncAccounts');
    } catch (error) {
      console.error('[Preload] adminSyncAccounts error:', error);
      return { success: false, message: `동기화 실패: ${(error as Error).message}` };
    }
  },
  adminSendReport: async (reportData: any): Promise<{ success: boolean; message: string }> => {
    try {
      return await ipcRenderer.invoke('admin:sendReport', reportData);
    } catch (error) {
      console.error('[Preload] adminSendReport error:', error);
      return { success: false, message: `전송 실패: ${(error as Error).message}` };
    }
  },
  adminCheckPermissions: async (): Promise<{ success: boolean; permissions?: any }> => {
    try {
      return await ipcRenderer.invoke('admin:checkPermissions');
    } catch (error) {
      console.error('[Preload] adminCheckPermissions error:', error);
      return { success: false, permissions: { isValid: false, error: (error as Error).message } };
    }
  },
  clearLicense: async (): Promise<void> => {
    try {
      return await ipcRenderer.invoke('license:clear');
    } catch (error) {
      console.error('[Preload] License clear error:', error);
      throw new Error(`라이선스 제거 중 오류가 발생했습니다: ${(error as Error).message}`);
    }
  },
  revalidateLicense: async (serverUrl?: string): Promise<boolean> => {
    try {
      return await ipcRenderer.invoke('license:revalidate', serverUrl);
    } catch (error) {
      console.error('[Preload] License revalidation error:', error);
      return false;
    }
  },
  getLibraryImageData: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('library:getImageData', filePath),
  saveImageToLocal: (filePath: string, suggestedName: string): Promise<boolean> =>
    ipcRenderer.invoke('library:saveImageToLocal', filePath, suggestedName),
  selectLocalImageFile: (): Promise<{ success: boolean; filePath?: string; previewDataUrl?: string; message?: string }> =>
    ipcRenderer.invoke('library:selectLocalImageFile'),
  openImagesFolder: (): Promise<{ success: boolean; path?: string; message?: string }> =>
    ipcRenderer.invoke('openImagesFolder'),
  // 네이버 데이터랩 API
  getDatalabTrendSummary: async (keyword: string) => {
    try {
      return await ipcRenderer.invoke('datalab:getTrendSummary', keyword);
    } catch (error) {
      console.error('[Preload] Datalab trend summary error:', error);
      throw new Error(`트렌드 분석 중 오류가 발생했습니다: ${(error as Error).message}`);
    }
  },
  getDatalabSearchTrend: async (keywords: string[], startDate: string, endDate: string, timeUnit?: 'date' | 'week' | 'month') => {
    try {
      return await ipcRenderer.invoke('datalab:getSearchTrend', keywords, startDate, endDate, timeUnit);
    } catch (error) {
      console.error('[Preload] Datalab search trend error:', error);
      throw new Error(`검색 트렌드 조회 중 오류가 발생했습니다: ${(error as Error).message}`);
    }
  },
  getDatalabRelatedKeywords: async (keyword: string) => {
    try {
      return await ipcRenderer.invoke('datalab:getRelatedKeywords', keyword);
    } catch (error) {
      console.error('[Preload] Datalab related keywords error:', error);
      throw new Error(`관련 키워드 조회 중 오류가 발생했습니다: ${(error as Error).message}`);
    }
  },
  // 앱 환경
  getAppInfo: async (): Promise<{ isPackaged: boolean }> => {
    try {
      return await ipcRenderer.invoke('app:getInfo');
    } catch (error) {
      return { isPackaged: false };
    }
  },
  // Excel 관련 API 제거됨
  // 소제목 이미지 관리 API
  applyHeadingImage: (heading: string, image: { provider: string; filePath: string; previewDataUrl: string; updatedAt: number; alt?: string; caption?: string }): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('heading:applyImage', heading, image),
  getHeadingImage: (heading: string): Promise<{ success: boolean; image?: { provider: string; filePath: string; previewDataUrl: string; updatedAt: number; alt?: string; caption?: string }; message?: string }> =>
    ipcRenderer.invoke('heading:getAppliedImage', heading),
  removeHeadingImage: (heading: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('heading:removeImage', heading),
  getAllHeadingImages: (): Promise<{ success: boolean; images?: Record<string, { provider: string; filePath: string; previewDataUrl: string; updatedAt: number; alt?: string; caption?: string }>; message?: string }> =>
    ipcRenderer.invoke('heading:getAllAppliedImages'),
  applyHeadingVideo: (heading: string, video: { provider: string; filePath: string; previewDataUrl: string; updatedAt: number }): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('heading:applyVideo', heading, video),
  getHeadingVideo: (heading: string): Promise<{ success: boolean; video?: { provider: string; filePath: string; previewDataUrl: string; updatedAt: number }; message?: string }> =>
    ipcRenderer.invoke('heading:getAppliedVideo', heading),
  getHeadingVideos: (heading: string): Promise<{ success: boolean; videos?: Array<{ provider: string; filePath: string; previewDataUrl: string; updatedAt: number }>; message?: string }> =>
    ipcRenderer.invoke('heading:getAppliedVideos', heading),
  removeHeadingVideo: (heading: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('heading:removeVideo', heading),
  getAllHeadingVideos: (): Promise<{ success: boolean; videos?: Record<string, Array<{ provider: string; filePath: string; previewDataUrl: string; updatedAt: number }>>; message?: string }> =>
    ipcRenderer.invoke('heading:getAllAppliedVideos'),
  // 예약 포스팅 관리 API
  getScheduledPosts: (): Promise<{ success: boolean; posts?: Array<{ id: string; title: string; scheduleDate: string; createdAt: string; status: string; publishMode?: string }>; message?: string }> =>
    ipcRenderer.invoke('schedule:getAll'),
  removeScheduledPost: (postId: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('schedule:remove', postId),
  // 썸네일 생성기 API
  saveThumbnailToLocal: (blobData: { type: string; data: number[] }, format: 'png' | 'jpg'): Promise<{ success: boolean; filePath?: string; message?: string }> =>
    ipcRenderer.invoke('thumbnail:saveToLocal', blobData, format),
  // 외부 URL 열기
  openExternalUrl: (url: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('openExternalUrl', url),
  // 창 포커스
  focusWindow: async (): Promise<{ success: boolean; message?: string }> => {
    try {
      return await ipcRenderer.invoke('window:focus');
    } catch (error) {
      console.error('[Preload] Focus window error:', error);
      return { success: false, message: (error as Error).message };
    }
  },
  // ✅ 이미지 URL 다운로드 및 저장
  // ✅ [2026-02-02] category 파라미터 추가 - 카테고리별 폴더에 저장
  downloadAndSaveImage: (
    imageUrl: string,
    heading: string,
    postTitle?: string,
    postId?: string,
    category?: string
  ): Promise<{ success: boolean; filePath?: string; previewDataUrl?: string; savedToLocal?: string; message?: string }> =>
    ipcRenderer.invoke('image:downloadAndSave', imageUrl, heading, postTitle, postId, category),
  // ✅ URL에서 이미지 수집
  collectImagesFromUrl: (url: string): Promise<{ success: boolean; images?: string[]; message?: string }> =>
    ipcRenderer.invoke('image:collectFromUrl', url),
  // ✅ 쇼핑몰에서 이미지 수집 (전용)
  collectImagesFromShopping: (url: string): Promise<{ success: boolean; images?: string[]; title?: string; message?: string }> =>
    ipcRenderer.invoke('image:collectFromShopping', url),
  // ✅ [2026-02-01] Gemini 3 기반 소제목-이미지 의미적 매칭
  matchImagesToHeadings: (images: string[], headings: string[]): Promise<{ success: boolean; matches?: number[]; message?: string }> =>
    ipcRenderer.invoke('image:matchToHeadings', images, headings),
  // ✅ 네이버 이미지 검색 API
  searchNaverImages: (keyword: string): Promise<{ success: boolean; images?: any[]; message?: string }> =>
    ipcRenderer.invoke('image:searchNaver', keyword),
  // ✅ [100점 개선] AI 이미지 검색어 최적화 API
  optimizeImageSearchQuery: (title: string, heading: string): Promise<{
    success: boolean;
    optimizedQuery?: string;
    coreSubject?: string;
    broaderQuery?: string;
    category?: string;
    message?: string
  }> => ipcRenderer.invoke('image:optimizeSearchQuery', title, heading),
  // ✅ [100점 개선] 핵심 주제 추출 API  
  extractCoreSubject: (title: string): Promise<{ success: boolean; subject?: string; message?: string }> =>
    ipcRenderer.invoke('image:extractCoreSubject', title),
  // ✅ [100점 개선] URL에서 이미지 크롤링 API (뉴스, 블로그 등)
  crawlImagesFromUrl: (url: string): Promise<{ success: boolean; images?: string[]; title?: string; message?: string }> =>
    ipcRenderer.invoke('image:crawlFromUrl', url),
  // ✅ [100점 개선] 배치 검색어 최적화 API (Gemini 호출 1회로 모든 소제목 처리)
  batchOptimizeSearchQueries: (title: string, headings: string[]): Promise<{
    success: boolean;
    results?: Array<{ heading: string; optimizedQuery: string; broaderQuery: string }>;
    message?: string;
  }> => ipcRenderer.invoke('image:batchOptimizeSearchQueries', title, headings),
  // ✅ 여러 이미지 일괄 다운로드 및 저장
  downloadAndSaveMultipleImages: (images: Array<{ url: string; heading: string }>, title: string): Promise<{ success: boolean; savedImages: any[]; folderPath?: string; error?: string }> =>
    ipcRenderer.invoke('image:downloadAndSaveMultiple', images, title),
  // 여러 플랫폼에서 콘텐츠 수집 (할루시네이션 방지)
  collectContentFromPlatforms: (keyword: string, options?: { maxPerSource?: number }): Promise<{ success: boolean; collectedText?: string; sourceCount?: number; urls?: string[]; message?: string }> =>
    ipcRenderer.invoke('content:collectFromPlatforms', keyword, options),

  // 저장된 이미지 관리
  getSavedImagesPath: (): Promise<string> =>
    ipcRenderer.invoke('images:getSavedPath'),
  getSavedImages: (dirPath: string): Promise<{ success: boolean; images?: string[]; message?: string }> =>
    ipcRenderer.invoke('images:getSaved', dirPath),

  // ✅ 실시간 트렌드 알림 API
  startTrendMonitoring: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('trend:startMonitoring'),
  stopTrendMonitoring: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('trend:stopMonitoring'),
  getTrendStatus: (): Promise<{ isMonitoring: boolean; alertEnabled: boolean }> =>
    ipcRenderer.invoke('trend:getStatus'),
  setTrendAlertEnabled: (enabled: boolean): Promise<{ success: boolean; enabled: boolean }> =>
    ipcRenderer.invoke('trend:setAlertEnabled', enabled),
  getCurrentTrends: (): Promise<{ success: boolean; trends?: any[]; message?: string }> =>
    ipcRenderer.invoke('trend:getCurrentTrends'),
  setTrendInterval: (intervalMs: number): Promise<{ success: boolean; interval: number }> =>
    ipcRenderer.invoke('trend:setInterval', intervalMs),
  onTrendAlert: (callback: (alert: any) => void) => {
    ipcRenderer.on('trend:alert', (_event, alert) => callback(alert));
  },

  // ✅ 발행 후 성과 추적 API
  addPostToAnalytics: (url: string, title: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('analytics:addPost', url, title),
  startAnalyticsTracking: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('analytics:startTracking'),
  stopAnalyticsTracking: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('analytics:stopTracking'),
  getAnalyticsStatus: (): Promise<{ isTracking: boolean; postCount: number }> =>
    ipcRenderer.invoke('analytics:getStatus'),
  getAllTrackedPosts: (): Promise<{ success: boolean; posts?: any[]; message?: string }> =>
    ipcRenderer.invoke('analytics:getAllPosts'),
  getPostAnalytics: (): Promise<{ success: boolean; analytics?: any; message?: string }> =>
    ipcRenderer.invoke('analytics:getAnalytics'),
  updatePostMetrics: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('analytics:updateMetrics'),
  removeTrackedPost: (postId: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('analytics:removePost', postId),

  // ✅ 최적 시간 자동 예약 발행 API
  getOptimalPublishTimes: (count?: number, category?: string): Promise<{ success: boolean; times?: any[]; message?: string }> =>
    ipcRenderer.invoke('scheduler:getOptimalTimes', count, category),
  schedulePost: (title: string, keyword: string, scheduledAt: string): Promise<{ success: boolean; post?: any; message?: string }> =>
    ipcRenderer.invoke('scheduler:schedulePost', title, keyword, scheduledAt),
  scheduleAtOptimalTime: (title: string, keyword: string, category?: string): Promise<{ success: boolean; post?: any; message?: string }> =>
    ipcRenderer.invoke('scheduler:scheduleAtOptimal', title, keyword, category),
  cancelScheduledPost: (postId: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('scheduler:cancelSchedule', postId),
  getAllScheduledPosts: (): Promise<{ success: boolean; posts?: any[]; message?: string }> =>
    ipcRenderer.invoke('scheduler:getAllScheduled'),
  getPendingScheduledPosts: (): Promise<{ success: boolean; posts?: any[]; message?: string }> =>
    ipcRenderer.invoke('scheduler:getPending'),
  reschedulePost: (postId: string, newTime: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('schedule:reschedule', postId, newTime),
  retryScheduledPost: (postId: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('schedule:retry', postId),
  getSchedulerStats: (): Promise<{ success: boolean; stats?: any; message?: string }> =>
    ipcRenderer.invoke('scheduler:getStats'),
  cancelAllScheduled: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('scheduler:cancelAll'),

  // ✅ 키워드 경쟁도 분석 API
  analyzeKeyword: (keyword: string): Promise<{ success: boolean; analysis?: any; message?: string }> =>
    ipcRenderer.invoke('keyword:analyze', keyword),
  findBlueOceanKeywords: (baseKeyword: string, count?: number): Promise<{ success: boolean; keywords?: any[]; message?: string }> =>
    ipcRenderer.invoke('keyword:findBlueOcean', baseKeyword, count),
  discoverBlueOceanKeywords: (count?: number): Promise<{ success: boolean; keywords?: any[]; message?: string }> =>
    ipcRenderer.invoke('keyword:discoverBlueOcean', count),
  discoverGoldenKeywordsByCategory: (count?: number): Promise<{ success: boolean; categories?: any[]; message?: string }> =>
    ipcRenderer.invoke('keyword:discoverGoldenByCategory', count),
  discoverGoldenKeywordsBySingleCategory: (categoryId: string, count?: number): Promise<{ success: boolean; category?: any; keywords?: any[]; message?: string }> =>
    ipcRenderer.invoke('keyword:discoverGoldenBySingleCategory', categoryId, count),
  clearKeywordCache: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('keyword:clearCache'),

  // ✅ 베스트 상품 자동 수집 API
  getBestProductCategories: (platform?: string): Promise<{ success: boolean; categories?: any[] }> =>
    ipcRenderer.invoke('bestProduct:getCategories', platform),
  fetchCoupangBest: (categoryId?: string, maxCount?: number, useAdsPower?: boolean): Promise<any> =>
    ipcRenderer.invoke('bestProduct:fetchCoupang', categoryId, maxCount, useAdsPower),
  fetchNaverBest: (categoryId?: string, maxCount?: number, useAdsPower?: boolean): Promise<any> =>
    ipcRenderer.invoke('bestProduct:fetchNaver', categoryId, maxCount, useAdsPower),
  fetchAllBest: (categoryId?: string, maxCount?: number): Promise<any> =>
    ipcRenderer.invoke('bestProduct:fetchAll', categoryId, maxCount),
  clearBestProductCache: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('bestProduct:clearCache'),

  // ✅ 자동 내부링크 삽입 API (카테고리 지원)
  addPostToInternalLinks: (url: string, title: string, content?: string, category?: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('internalLink:addPost', url, title, content, category),
  findRelatedPosts: (title: string, content: string, maxResults?: number, categoryFilter?: string): Promise<{ success: boolean; links?: any[]; message?: string }> =>
    ipcRenderer.invoke('internalLink:findRelated', title, content, maxResults, categoryFilter),
  insertInternalLinks: (content: string, title: string, options?: any): Promise<{ success: boolean; result?: any; message?: string }> =>
    ipcRenderer.invoke('internalLink:insertLinks', content, title, options),
  getAllInternalLinkPosts: (): Promise<{ success: boolean; posts?: any[]; message?: string }> =>
    ipcRenderer.invoke('internalLink:getAllPosts'),
  getInternalLinkStats: (): Promise<{ success: boolean; stats?: any; message?: string }> =>
    ipcRenderer.invoke('internalLink:getStats'),
  // ✅ 카테고리별 글 조회 API (신규)
  getPostsByCategory: (category: string): Promise<{ success: boolean; posts?: any[]; message?: string }> =>
    ipcRenderer.invoke('internalLink:getPostsByCategory', category),
  getAllCategories: (): Promise<{ success: boolean; categories?: string[]; message?: string }> =>
    ipcRenderer.invoke('internalLink:getAllCategories'),
  updatePostCategory: (postId: string, category: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('internalLink:updatePostCategory', postId, category),
  // ✅ 기존 글 자동 카테고리 분류 API (신규)
  autoCategorizeAllPosts: (): Promise<{ success: boolean; updated?: number; total?: number; results?: any[]; message?: string }> =>
    ipcRenderer.invoke('internalLink:autoCategorize'),
  getUncategorizedPosts: (): Promise<{ success: boolean; posts?: any[]; message?: string }> =>
    ipcRenderer.invoke('internalLink:getUncategorized'),
  // ✅ 카테고리 정규화 API (영어/다른형식 → 표준 한글)
  normalizeAllCategories: (): Promise<{ success: boolean; updated?: number; total?: number; results?: any[]; message?: string }> =>
    ipcRenderer.invoke('internalLink:normalizeCategories'),

  // ✅ 썸네일 자동 생성 API
  generateThumbnailSvg: (title: string, options?: any, category?: string): Promise<{ success: boolean; svg?: string; message?: string }> =>
    ipcRenderer.invoke('thumbnail:generateSvg', title, options, category),
  getThumbnailStyles: (): Promise<{ success: boolean; styles?: string[]; message?: string }> =>
    ipcRenderer.invoke('thumbnail:getStyles'),
  getThumbnailCategories: (): Promise<{ success: boolean; categories?: string[]; message?: string }> =>
    ipcRenderer.invoke('thumbnail:getCategories'),
  // ✅ [2026-02-04] 수집 이미지에 텍스트 오버레이 적용 API
  createProductThumbnail: (
    imageUrl: string,
    text: string,
    options?: { position?: string; fontSize?: number; textColor?: string; opacity?: number }
  ): Promise<{ success: boolean; outputPath?: string; previewDataUrl?: string; message?: string }> =>
    ipcRenderer.invoke('thumbnail:createProductThumbnail', imageUrl, text, options),

  // ✅ 다중 블로그 관리 API
  addBlogAccount: (name: string, blogId: string, naverId?: string, naverPassword?: string, settings?: any): Promise<{ success: boolean; account?: any; message?: string }> =>
    ipcRenderer.invoke('account:add', name, blogId, naverId, naverPassword, settings),
  updateBlogAccount: (accountId: string, updates: any): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('account:update', accountId, updates),
  removeBlogAccount: (accountId: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('account:remove', accountId),
  setActiveBlogAccount: (accountId: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('account:setActive', accountId),
  getActiveBlogAccount: (): Promise<{ success: boolean; account?: any; message?: string }> =>
    ipcRenderer.invoke('account:getActive'),
  getAllBlogAccounts: (): Promise<{ success: boolean; accounts?: any[]; message?: string }> =>
    ipcRenderer.invoke('account:getAll'),
  getNextBlogAccount: (): Promise<{ success: boolean; account?: any; message?: string }> =>
    ipcRenderer.invoke('account:getNext'),
  getBlogAccountStats: (accountId: string): Promise<{ success: boolean; stats?: any; message?: string }> =>
    ipcRenderer.invoke('account:getStats', accountId),
  getTotalBlogStats: (): Promise<{ success: boolean; stats?: any; message?: string }> =>
    ipcRenderer.invoke('account:getTotalStats'),
  toggleBlogAccount: (accountId: string): Promise<{ success: boolean; isActive?: boolean; message?: string }> =>
    ipcRenderer.invoke('account:toggle', accountId),
  recordBlogPublish: (accountId: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('account:recordPublish', accountId),
  getAccountCredentials: (accountId: string): Promise<{ success: boolean; credentials?: { naverId: string; naverPassword: string } | null; message?: string }> =>
    ipcRenderer.invoke('account:getCredentials', accountId),
  updateAccountCredentials: (accountId: string, naverId: string, naverPassword: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('account:updateCredentials', accountId, naverId, naverPassword),
  updateAccountSettings: (accountId: string, settings: any): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('account:updateSettings', accountId, settings),
  getNextContentSource: (accountId: string): Promise<{ success: boolean; source?: { type: 'keyword' | 'url'; value: string } | null; message?: string }> =>
    ipcRenderer.invoke('account:getNextContentSource', accountId),
  // ✅ 이전글 목록 가져오기 API
  getRecentPosts: (blogId: string): Promise<{ success: boolean; posts?: Array<{ title: string; url: string; date?: string }>; message?: string }> =>
    ipcRenderer.invoke('blog:getRecentPosts', blogId),
  // ✅ 블로그 카테고리 분석 API
  fetchBlogCategories: (blogId: string): Promise<{ success: boolean; categories?: Array<{ id: string; name: string; postCount?: number }>; message?: string }> =>
    ipcRenderer.invoke('blog:fetchCategories', blogId),

  // ✅ 다중계정 동시발행 API
  multiAccountPublish: (accountIds: string[], options?: any): Promise<{ success: boolean; results?: any[]; summary?: { total: number; success: number; fail: number }; message?: string }> =>
    ipcRenderer.invoke('multiAccount:publish', accountIds, options),
  // ✅ 다중계정 발행 즉시 중지 API
  multiAccountCancel: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('multiAccount:cancel'),

  // ✅ AI 제목 A/B 테스트 API
  generateTitleCandidates: (keyword: string, category?: string, count?: number): Promise<{ success: boolean; result?: any; message?: string }> =>
    ipcRenderer.invoke('title:generateCandidates', keyword, category, count),
  evaluateTitle: (title: string, category?: string): Promise<{ success: boolean; evaluation?: any; message?: string }> =>
    ipcRenderer.invoke('title:evaluate', title, category),
  suggestTitleImprovements: (title: string): Promise<{ success: boolean; suggestions?: string[]; message?: string }> =>
    ipcRenderer.invoke('title:suggestImprovements', title),
  getTitleStyles: (): Promise<{ success: boolean; styles?: string[]; message?: string }> =>
    ipcRenderer.invoke('title:getStyles'),

  // ✅ 댓글 자동 답글 API
  addComment: (author: string, content: string, postUrl: string, postTitle: string): Promise<{ success: boolean; comment?: any; message?: string }> =>
    ipcRenderer.invoke('comment:add', author, content, postUrl, postTitle),
  generateCommentReply: (commentId: string, customAnswer?: string): Promise<{ success: boolean; reply?: string; message?: string }> =>
    ipcRenderer.invoke('comment:generateReply', commentId, customAnswer),
  markCommentReplied: (commentId: string, replyContent: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('comment:markReplied', commentId, replyContent),
  getPendingComments: (): Promise<{ success: boolean; comments?: any[]; message?: string }> =>
    ipcRenderer.invoke('comment:getPending'),
  getRepliedComments: (): Promise<{ success: boolean; comments?: any[]; message?: string }> =>
    ipcRenderer.invoke('comment:getReplied'),
  getCommentStats: (): Promise<{ success: boolean; stats?: any; message?: string }> =>
    ipcRenderer.invoke('comment:getStats'),
  generateBulkReplies: (): Promise<{ success: boolean; replies?: any[]; message?: string }> =>
    ipcRenderer.invoke('comment:generateBulk'),

  // ✅ 경쟁 블로그 분석 API
  analyzeCompetitors: (keyword: string): Promise<{ success: boolean; result?: any; message?: string }> =>
    ipcRenderer.invoke('competitor:analyze', keyword),
  analyzeCompetitorBlog: (blogId: string): Promise<{ success: boolean; result?: any; message?: string }> =>
    ipcRenderer.invoke('competitor:analyzeBlog', blogId),
  clearCompetitorCache: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('competitor:clearCache'),

  // ✅ AI 어시스턴트 API
  aiAssistantChat: (message: string): Promise<{ success: boolean; response?: string; actions?: any[]; suggestFollowUp?: string[]; error?: any }> =>
    ipcRenderer.invoke('aiAssistant:chat', message),
  aiAssistantGetWelcome: (): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('aiAssistant:getWelcome'),
  aiAssistantClearChat: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('aiAssistant:clearChat'),
  aiAssistantRunAutoFix: (): Promise<{ success: boolean; fixResults?: any[]; message: string }> =>
    ipcRenderer.invoke('aiAssistant:runAutoFix'),

  // ✅ Admin PIN 검증 (환경변수 ADMIN_PIN)
  verifyAdminPin: (pin: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('admin:verifyPin', pin),

  // ✅ 비교표 이미지 생성 API
  generateComparisonTableImage: (options: {
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
  }): Promise<{ success: boolean; imagePath?: string; error?: string }> =>
    ipcRenderer.invoke('image:generateComparisonTable', options),

  // ✅ [2026-01-18] 커스텀 CTA 배너 생성 API
  generateCustomBanner: (options: {
    text: string;
    colorKey: string;
    sizeKey: string;
    animationKey: string;
    customImagePath?: string;
    customBgColor?: string;
  }): Promise<{ success: boolean; path?: string; message?: string }> =>
    ipcRenderer.invoke('image:generateCustomBanner', options),

  // ✅ [2026-01-19] 장단점 표 이미지 생성 API
  generateProsConsTable: (options: {
    productName: string;
    pros: string[];
    cons: string[];
  }): Promise<{ success: boolean; path?: string; message?: string }> =>
    ipcRenderer.invoke('image:generateProsConsTable', options),

  // ✅ [2026-01-24] 쇼핑커넥트 SEO 제목 생성 API
  // 네이버 자동완성 키워드를 활용하여 제품명에 세부 키워드 추가
  generateSeoTitle: (productName: string): Promise<{ success: boolean; title?: string; message?: string }> =>
    ipcRenderer.invoke('seo:generateTitle', productName),

  // ✅ [2026-02-08] 테스트 이미지 생성 API - engine, textOverlay 파라미터 추가
  generateTestImage: (options: { style: string; ratio: string; prompt: string; engine?: string; textOverlay?: { enabled: boolean; text: string } }): Promise<{ success: boolean; path?: string; previewDataUrl?: string; error?: string }> =>
    ipcRenderer.invoke('generate-test-image', options),

  // ✅ [2026-03-11] ADB IP 변경 API
  adbCheckDevice: (): Promise<{ connected: boolean; deviceId?: string; message: string }> =>
    ipcRenderer.invoke('adb:checkDevice'),
  adbChangeIp: (waitSeconds?: number): Promise<{ success: boolean; oldIp?: string; newIp?: string; message: string }> =>
    ipcRenderer.invoke('adb:changeIp', waitSeconds),
  adbGetCurrentIp: (): Promise<{ success: boolean; ip: string }> =>
    ipcRenderer.invoke('adb:getCurrentIp'),
  // ✅ [2026-03-11] ADB 자동 다운로드
  adbDownload: (): Promise<{ success: boolean; adbPath?: string; message: string }> =>
    ipcRenderer.invoke('adb:downloadAdb'),

  // ✅ [2026-03-13] AdsPower Local API
  adsPowerCheckStatus: (): Promise<{ running: boolean; message: string }> =>
    ipcRenderer.invoke('adspower:checkStatus'),
  adsPowerSetApiKey: (apiKey: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('adspower:setApiKey', apiKey),
  adsPowerOpenBrowser: (profileId: string): Promise<{ success: boolean; ws?: string; message: string }> =>
    ipcRenderer.invoke('adspower:openBrowser', profileId),
  adsPowerCloseBrowser: (profileId: string): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('adspower:closeBrowser', profileId),
  adsPowerListProfiles: (): Promise<{ success: boolean; profiles: any[]; message: string }> =>
    ipcRenderer.invoke('adspower:listProfiles'),
  adsPowerCreateProfile: (profileName: string): Promise<{ success: boolean; profileId?: string; serialNumber?: string; message: string }> =>
    ipcRenderer.invoke('adspower:createProfile', profileName),
  adsPowerDeleteProfile: (profileIds: string[]): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('adspower:deleteProfile', profileIds),
  openExternalUrlDirect: (url: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('open-external-url', url),

  // ✅ [2026-03-13] AdsPower 토글 설정 → crawlerBrowser 전역 flag 동기화
  setAdsPowerEnabled: (enabled: boolean): Promise<{ success: boolean; enabled: boolean }> =>
    ipcRenderer.invoke('crawler:setAdsPowerEnabled', enabled),

  // ✅ [2026-03-17] 프록시(SmartProxy) 온/오프 토글
  setProxyEnabled: (enabled: boolean): Promise<{ success: boolean; enabled: boolean }> =>
    ipcRenderer.invoke('proxy:setEnabled', enabled),
  isProxyEnabled: (): Promise<{ enabled: boolean }> =>
    ipcRenderer.invoke('proxy:isEnabled'),
  getProxyStatus: (): Promise<{ enabled: boolean; configured: boolean; provider: string; endpoint: string }> =>
    ipcRenderer.invoke('proxy:getStatus'),
  // ✅ [2026-03-27] 계정별 Sticky Session 프록시 자동 생성
  generateStickyProxy: (naverId: string): Promise<{ success: boolean; proxy?: { host: string; port: string; username: string; password: string }; message?: string }> =>
    ipcRenderer.invoke('proxy:generateSticky', naverId),
  // ✅ [2026-03-27] 전체 계정 일괄 Sticky Proxy 설정
  bulkSetupStickyProxy: (): Promise<{ success: boolean; message?: string; updated?: number; skipped?: number; total?: number }> =>
    ipcRenderer.invoke('proxy:bulkSetupSticky'),

  // ✅ [2026-03-16] ImageFX Google 로그인 사전 확인 API
  checkImageFxGoogleLogin: (): Promise<{ loggedIn: boolean; userName?: string; message: string }> =>
    ipcRenderer.invoke('imagefx:checkGoogleLogin'),

  // ✅ [2026-03-16] ImageFX Google 계정 변경 API
  switchImageFxGoogleAccount: (): Promise<{ success: boolean; userName?: string; message: string }> =>
    ipcRenderer.invoke('imagefx:switchGoogleAccount'),

});

// ✅ electronAPI로도 동일한 API 노출 (renderer.ts 호환성)
contextBridge.exposeInMainWorld('electronAPI', {
  // 키워드 경쟁도 분석 API
  analyzeKeyword: (keyword: string): Promise<{ success: boolean; analysis?: any; message?: string }> =>
    ipcRenderer.invoke('keyword:analyze', keyword),
  findBlueOceanKeywords: (baseKeyword: string, count?: number): Promise<{ success: boolean; keywords?: any[]; message?: string }> =>
    ipcRenderer.invoke('keyword:findBlueOcean', baseKeyword, count),
  discoverBlueOceanKeywords: (count?: number): Promise<{ success: boolean; keywords?: any[]; message?: string }> =>
    ipcRenderer.invoke('keyword:discoverBlueOcean', count),
  discoverGoldenKeywordsByCategory: (count?: number): Promise<{ success: boolean; categories?: any[]; message?: string }> =>
    ipcRenderer.invoke('keyword:discoverGoldenByCategory', count),
  discoverGoldenKeywordsBySingleCategory: (categoryId: string, count?: number): Promise<{ success: boolean; category?: any; keywords?: any[]; message?: string }> =>
    ipcRenderer.invoke('keyword:discoverGoldenBySingleCategory', categoryId, count),
  clearKeywordCache: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('keyword:clearCache'),

  // 베스트 상품 자동 수집 API
  getBestProductCategories: (platform?: string): Promise<{ success: boolean; categories?: any[] }> =>
    ipcRenderer.invoke('bestProduct:getCategories', platform),
  fetchCoupangBest: (categoryId?: string, maxCount?: number): Promise<any> =>
    ipcRenderer.invoke('bestProduct:fetchCoupang', categoryId, maxCount),
  fetchNaverBest: (categoryId?: string, maxCount?: number): Promise<any> =>
    ipcRenderer.invoke('bestProduct:fetchNaver', categoryId, maxCount),
  fetchAllBest: (categoryId?: string, maxCount?: number): Promise<any> =>
    ipcRenderer.invoke('bestProduct:fetchAll', categoryId, maxCount),
  clearBestProductCache: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('bestProduct:clearCache'),

  // 경쟁 블로그 분석 API
  analyzeCompetitors: (keyword: string): Promise<{ success: boolean; result?: any; message?: string }> =>
    ipcRenderer.invoke('competitor:analyze', keyword),
  analyzeCompetitorBlog: (blogId: string): Promise<{ success: boolean; result?: any; message?: string }> =>
    ipcRenderer.invoke('competitor:analyzeBlog', blogId),
  clearCompetitorCache: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('competitor:clearCache'),

  // AI 제목 A/B 테스트 API
  generateTitleCandidates: (keyword: string, category?: string, count?: number): Promise<{ success: boolean; result?: any; message?: string }> =>
    ipcRenderer.invoke('title:generateCandidates', keyword, category, count),
  evaluateTitle: (title: string, category?: string): Promise<{ success: boolean; evaluation?: any; message?: string }> =>
    ipcRenderer.invoke('title:evaluate', title, category),
  suggestTitleImprovements: (title: string): Promise<{ success: boolean; suggestions?: any; message?: string }> =>
    ipcRenderer.invoke('title:suggestImprovements', title),
  getTitleStyles: (): Promise<{ success: boolean; styles?: string[]; message?: string }> =>
    ipcRenderer.invoke('title:getStyles'),

  // 성과 추적 API
  addPostToTrack: (url: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('analytics:addPost', url),
  getAllTrackedPosts: (): Promise<{ success: boolean; posts?: any[]; message?: string }> =>
    ipcRenderer.invoke('analytics:getAllPosts'),


  // ✅ [2026-02-08] 테스트 이미지 생성 API - engine, textOverlay 파라미터 추가
  generateTestImage: (options: { style: string; ratio: string; prompt: string; engine?: string; textOverlay?: { enabled: boolean; text: string } }): Promise<{ success: boolean; path?: string; previewDataUrl?: string; error?: string }> =>
    ipcRenderer.invoke('generate-test-image', options),
});

type LicenseInfo = {
  licenseCode?: string; // 코드 방식일 때만 사용
  deviceId: string;
  verifiedAt: string;
  expiresAt?: string;
  isValid: boolean;
  licenseType?: 'trial' | 'standard' | 'premium';
  maxDevices?: number;
  authMethod?: 'code' | 'credentials'; // 인증 방식
  userId?: string; // 아이디/비밀번호 방식일 때 사용
};

