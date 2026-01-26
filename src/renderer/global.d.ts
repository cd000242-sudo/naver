type RiskLevel = 'low' | 'medium' | 'high';
type LegalRiskLevel = 'safe' | 'caution' | 'danger';

interface TitleCandidate {
  text: string;
  score: number;
  reasoning: string;
}

interface HeadingPlan {
  title: string;
  summary: string;
  keywords: string[];
  imagePrompt: string;
}

interface ImagePlan {
  heading: string;
  prompt: string;
  placement: string;
  alt: string;
  caption: string;
}

interface StructuredContentMetadata {
  category: string;
  targetAge: '20s' | '30s' | '40s' | '50s' | 'all';
  urgency: 'breaking' | 'depth' | 'evergreen';
  estimatedReadTime: string;
  wordCount: number;
  aiDetectionRisk: RiskLevel;
  legalRisk: LegalRiskLevel;
  seoScore: number;
  keywordStrategy: string;
  publishTimeRecommend: string;
  originalTitle?: string;
  tone?: 'friendly' | 'expert' | 'relatable';
  estimatedEngagement?: {
    views: number;
    comments: number;
    shares: number;
  };
}

interface StructuredQualitySignals {
  aiDetectionRisk: RiskLevel;
  legalRisk: LegalRiskLevel;
  seoScore: number;
  originalityScore: number;
  readabilityScore: number;
  warnings: string[];
  viralPotential?: number;
  engagementScore?: number;
}

interface StructuredContent {
  status: 'success' | 'warning' | 'error';
  generationTime: string;
  selectedTitle: string;
  titleAlternatives: string[];
  titleCandidates: TitleCandidate[];
  bodyHtml: string;
  bodyPlain: string;
  headings: HeadingPlan[];
  hashtags: string[];
  images: ImagePlan[];
  metadata: StructuredContentMetadata;
  quality: StructuredQualitySignals;
  viralHooks?: ViralHooks;
  trafficStrategy?: TrafficStrategy;
  postPublishActions?: PostPublishActions;
}

type ArticleType =
  | 'news'
  | 'sports'
  | 'health'
  | 'finance'
  | 'it_review'
  | 'shopping_review'
  | 'general';

interface ProductInfo {
  name: string;
  brand?: string;
  price: number;
  category: string;
  purchaseLink?: string;
  specs?: Record<string, unknown>;
}

interface CommentTrigger {
  position: number;
  type: 'opinion' | 'experience' | 'vote';
  text: string;
}

interface ShareTrigger {
  position: number;
  quote: string;
  prompt: string;
}

interface BookmarkValue {
  reason: string;
  seriesPromise: string;
}

interface ViralHooks {
  commentTriggers: CommentTrigger[];
  shareTrigger: ShareTrigger;
  bookmarkValue: BookmarkValue;
}

interface TrafficStrategy {
  peakTrafficTime: string;
  publishRecommendTime: string;
  shareableQuote: string;
  controversyLevel: 'none' | 'low' | 'medium';
  retentionHook: string;
}

interface PostPublishActions {
  selfComments: string[];
  shareMessage: string;
  notificationMessage: string;
}

interface GeneratedPost {
  id: string;
  title: string;
  content: string;
  hashtags: string[];
  headings?: { heading: string; prompt?: string }[];
  structuredContent?: StructuredContent; // ✅ 전체 구조화된 콘텐츠 저장
  createdAt: string;
  updatedAt?: string;
  images?: Array<{
    heading: string;
    filePath: string;
    provider: string;
    alt?: string;
    caption?: string;
    savedToLocal?: string;
  }>;
  isFavorite?: boolean;
  category?: string;
  publishedUrl?: string;
  publishedAt?: string;
  toneStyle?: string; // ✅ 글 톤 저장
  sourceUrl?: string; // ✅ URL로 생성한 경우 원본 URL 저장
}

type RendererAutomationImage = {
  heading: string;
  filePath: string;
  provider: string;
  alt?: string;
  caption?: string;
};

type StructuredGenerationRequest = {
  assembly: {
    keywords?: string[];
    draftText?: string;
    baseText?: string;
    rssUrl?: string;
    generator?: 'gemini' | 'openai' | 'claude';
    targetAge?: '20s' | '30s' | '40s' | '50s' | 'all';
    category?: string;
    minChars?: number;
  };
};

type RendererAutomationPayload = {
  naverId: string;
  naverPassword: string;
  title?: string;
  content?: string;
  lines?: string[];
  selectedHeadings?: string[];
  structuredContent?: StructuredContent;
  generatedImages?: RendererAutomationImage[];
  hashtags?: string[];
  generator?: 'gemini' | 'openai' | 'claude';
  keywords?: string[];
  draft?: string;
  rssUrl?: string;
  autoGenerate?: boolean;
  publishMode?: 'draft' | 'publish' | 'schedule';
  scheduleDate?: string;
  scheduleType?: 'app-schedule' | 'naver-server'; // 예약 발행 타입: 앱 스케줄 관리 vs 네이버 서버 예약
  scheduleMethod?: 'datetime-local' | 'individual-inputs'; // 예약발행 방식
  ctaLink?: string;
  ctaText?: string;
  ctas?: Array<{ text: string; link?: string }>;
  ctaPosition?: 'top' | 'middle' | 'bottom';
  skipCta?: boolean; // ✅ CTA 없이 발행하기
  skipImages?: boolean; // 이미지 삽입 건너뛰기 (글만 발행하기용)
  targetAge?: '20s' | '30s' | '40s' | '50s' | 'all';
  thumbnailPath?: string; // 대표 이미지 경로
  skipDailyLimitWarning?: boolean; // 풀오토 모드에서 일일 발행 제한 경고 건너뛰기
  imageMode?: 'full-auto' | 'semi-auto' | 'manual' | 'skip'; // 이미지 모드
  collectedImages?: Array<{ id: string; url: string; thumbnailUrl: string; title: string; source: string; tags?: string[] }>; // 수집된 이미지 (풀오토 모드용)
  postId?: string; // ✅ 글 ID (예약 발행용)
  toneStyle?: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe'; // ✅ 글 톤 설정
  keepBrowserOpen?: boolean; // ✅ 브라우저 유지 여부
  includeThumbnailText?: boolean; // ✅ 썸네일에 텍스트 포함 여부
  affiliateLink?: string; // ✅ 제휴마케팅 링크 추가
  useAffiliateVideo?: boolean; // ✅ 쇼핑 비디오 변환 옵션 추가
  contentMode?: string; // ✅ 콘텐츠 모드 추가
};

type RendererStatus =
  | { success: true }
  | { success: false; cancelled?: boolean; message?: string };

interface AutomationAPI {
  runAutomation: (payload: RendererAutomationPayload) => Promise<RendererStatus>;
  // Excel 관련 API 제거됨
  cancelAutomation: () => Promise<boolean>;
  freeActivate: () => Promise<{ success: boolean; message?: string }>;
  forceQuit: () => Promise<{ success: boolean }>;
  getQuotaStatus: () => Promise<{ success: boolean; isFree: boolean; quota: any }>;
  generateContent: (prompt: string) => Promise<{ success: boolean; content?: string; message?: string }>;
  generateStructuredContent: (request: StructuredGenerationRequest) => Promise<{ success: boolean; content?: StructuredContent; message?: string; imageCount?: number }>;
  generateImages: (
    options: {
      provider: string;
      items: Array<{
        heading: string;
        prompt: string;
        englishPrompt?: string;
        isThumbnail?: boolean;
        allowText?: boolean;
        category?: string;
        referenceImagePath?: string;
        referenceImageUrl?: string;
      }>;
      postTitle?: string;
      postId?: string;
      styleHint?: string;
      regenerate?: boolean;
      sourceUrl?: string;
      isFullAuto?: boolean;
    },
  ) => Promise<{
    success: boolean;
    images?: Array<{ heading: string; filePath: string; previewDataUrl: string; provider: string; savedToLocal?: string }>;
    message?: string;
  }>;
  generateImagesNaverImproved: (
    payload: {
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
    },
  ) => Promise<{
    success: boolean;
    images?: Array<{ heading: string; filePath: string; previewDataUrl: string; provider: string; savedToLocal?: string }>;
    message?: string;
  }>;
  checkFileExists?: (filePath: string) => Promise<boolean>; // ✅ 파일 존재 확인
  readDir?: (dirPath: string) => Promise<string[]>; // ✅ 디렉토리 읽기
  readDirWithStats?: (dirPath: string) => Promise<Array<{ name: string; isFile: boolean; isDirectory: boolean; size: number; mtime: number; birthtime: number; ctime: number }>>; // ✅ 디렉토리 읽기 (파일 정보 포함)
  getFileStats?: (filePath: string) => Promise<{ isFile: boolean; isDirectory: boolean; size: number; mtime: number; birthtime: number; ctime: number } | null>; // ✅ 파일/폴더 정보 가져오기
  deleteFolder?: (folderPath: string) => Promise<boolean>; // ✅ 폴더 삭제
  deleteFile?: (filePath: string) => Promise<{ success: boolean; message?: string }>;
  getUserHomeDir: () => Promise<string>; // ✅ 사용자 홈 디렉토리 가져오기
  openPath: (path: string) => Promise<{ success: boolean; message?: string }>; // ✅ 폴더/파일 열기
  showOpenDialog?: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>; // ✅ 폴더/파일 선택 다이얼로그
  selectVideoFile?: () => Promise<{ filePath: string } | null>; // ✅ 영상 파일 선택 다이얼로그
  getConfig: () => Promise<AppConfig>;
  saveConfig: (config: AppConfig) => Promise<AppConfig>;
  verifyAdminPin?: (pin: string) => Promise<{ success: boolean; message?: string }>;
  getLibraryImages: (category?: string, titleKeywords?: string[]) => Promise<Array<{
    id: string;
    url: string;
    filePath: string;
    sourceUrl: string;
    sourceTitle?: string;
    collectedAt: string;
    category?: string;
    tags?: string[];
    previewDataUrl?: string;
  }>>;
  getLibraryCategories: () => Promise<string[]>;
  deleteLibraryImage: (id: string) => Promise<boolean>;
  collectLibraryImages: (options: { query: string; sources: string[]; count: number }) => Promise<{ success: boolean; count: number; message?: string }>;
  batchCollectLibraryImages: (categories: string[]) => Promise<{ success: boolean; message?: string }>;
  getImageLibraryStats: () => Promise<{ totalImages: number; categories: number; totalSize: string; sources: Record<string, number> }>;
  autoCollectImages: (data: {
    title: string;
    keywords: string[];
    category: string;
    imageMode: 'full-auto' | 'semi-auto' | 'manual' | 'skip';
    selectedImageSource?: 'dalle' | 'pexels' | 'library';
  }) => Promise<{
    success: boolean;
    images?: ExtendedImage[];
    totalCount?: number;
    headingCount?: number;
    error?: string;
  }>;
  syncImageManager: (imageMap: Map<string, any[]>) => Promise<boolean>;
  applyImagePlacements: (data: {
    selections: Array<{ imageId: string; targetHeadingIndex: number; position: 'above' | 'below' }>;
    images: Array<{ id: string; thumbnailUrl: string; title: string; source: string }>;
  }) => Promise<{
    success: boolean;
    inserted?: number;
    failed?: number;
    error?: string;
  }>;
  getLicense: () => Promise<{ license: LicenseInfo | null }>;
  verifyLicense: (code: string, deviceId: string, email?: string) => Promise<{ valid: boolean; license?: LicenseInfo; message?: string }>;
  verifyLicenseWithCredentials: (userId: string, password: string, deviceId: string) => Promise<{ valid: boolean; license?: LicenseInfo; message?: string; debugInfo?: any }>;
  registerExternalInflowLicense: () => Promise<{ success: boolean; message: string; expiresAt?: string }>;
  canUseExternalInflow: () => Promise<boolean>;
  checkPatchFile: () => Promise<boolean>;
  getDeviceId: () => Promise<string>;
  isPackaged: () => Promise<boolean>;
  testLicenseServer: (serverUrl?: string) => Promise<{ success: boolean; message: string; response?: any }>;
  networkOptimize: () => Promise<{ success: boolean; message: string; results: string[] }>; // ✅ 원클릭 네트워크 최적화
  checkLicenseStatus: () => Promise<{ valid: boolean; reason: string; details?: any }>;
  adminConnect: () => Promise<{ success: boolean; message: string }>;
  adminSyncSettings: () => Promise<{ success: boolean; message: string; settings?: any }>;
  adminSendReport: (reportData: any) => Promise<{ success: boolean; message: string }>;
  adminCheckPermissions: () => Promise<{ success: boolean; permissions?: any }>;
  clearLicense: () => Promise<void>;
  revalidateLicense: (serverUrl?: string) => Promise<boolean>;
  getLibraryImageData: (filePath: string) => Promise<string | null>;
  saveImageToLocal: (filePath: string, suggestedName: string) => Promise<boolean>;
  selectLocalImageFile: () => Promise<{ success: boolean; filePath?: string; previewDataUrl?: string; message?: string }>;
  openImagesFolder: () => Promise<{ success: boolean; path?: string; message?: string }>;
  getDatalabTrendSummary: (keyword: string) => Promise<{ success: boolean; data?: { trend: 'up' | 'down' | 'stable'; recentRatio: number; averageRatio: number; suggestion: string }; message?: string }>;
  getDatalabSearchTrend: (keywords: string[], startDate: string, endDate: string, timeUnit?: 'date' | 'week' | 'month') => Promise<{ success: boolean; data?: unknown; message?: string }>;
  getDatalabRelatedKeywords: (keyword: string) => Promise<{ success: boolean; data?: unknown; message?: string }>;
  collectImagesByTitle: (title: string, sources?: string[]) => Promise<{ success: boolean; count: number; message?: string }>;
  analyzeBlogCategories: (blogId?: string) => Promise<{ success: boolean; categories?: Array<{ id: string; name: string; postCount?: number }>; message?: string; error?: string }>;
  selectFolder: (options?: { title?: string; defaultPath?: string }) => Promise<{ canceled: boolean; filePaths: string[] }>; // ✅ 폴더 선택
  collectImagesByKeywords: (keywords: string[], title: string, maxImages?: number) => Promise<{ success: boolean; count: number; message?: string }>;
  extractKeywordsFromTitle: (title: string) => Promise<{ keywords: string[]; personNames: string[] }>;
  generateVeoVideo: (payload: {
    prompt: string;
    model?: string;
    durationSeconds?: number;
    aspectRatio?: '16:9' | '9:16';
    negativePrompt?: string;
    imagePath?: string;
    image?: { imageBytes: string; mimeType: string };
    heading?: string;
  }) => Promise<{ success: true; filePath: string; fileName: string } | { success: false; message?: string }>;
  listMp4Files: (payload: { dirPath: string }) => Promise<{ success: boolean; files?: Array<{ name: string; fullPath: string; mtime: number; size: number }>; message?: string }>;
  importMp4: (payload: { sourcePath: string; dirPath: string }) => Promise<{ success: boolean; filePath?: string; fileName?: string; message?: string }>;
  convertMp4ToGif: (payload: { sourcePath: string }) => Promise<{ success: boolean; gifPath?: string; message?: string }>;
  createKenBurnsVideo: (payload: { imagePath: string; heading?: string; durationSeconds?: number; aspectRatio?: '16:9' | '9:16' }) => Promise<{ success: boolean; filePath?: string; fileName?: string; message?: string }>;
  onLog: (callback: (message: string) => void) => () => void;
  onStatus: (callback: (status: RendererStatus) => void) => () => void;
  onDebugLog: (callback: (message: string) => void) => () => void;
  on?: (channel: string, callback: (...args: any[]) => void) => () => void;
  // Excel 관련 API 제거됨
  // 소제목 이미지 관리 API
  applyHeadingImage: (heading: string, image: { provider: string; filePath: string; previewDataUrl: string; updatedAt: number; alt?: string; caption?: string }) => Promise<{ success: boolean; message?: string }>;
  getHeadingImage: (heading: string) => Promise<{ success: boolean; image?: { provider: string; filePath: string; previewDataUrl: string; updatedAt: number; alt?: string; caption?: string }; message?: string }>;
  removeHeadingImage: (heading: string) => Promise<{ success: boolean; message?: string }>;
  getAllHeadingImages: () => Promise<{ success: boolean; images?: Record<string, { provider: string; filePath: string; previewDataUrl: string; updatedAt: number; alt?: string; caption?: string }>; message?: string }>;
  applyHeadingVideo: (heading: string, video: { provider: string; filePath: string; previewDataUrl: string; updatedAt: number }) => Promise<{ success: boolean; message?: string }>;
  getHeadingVideo: (heading: string) => Promise<{ success: boolean; video?: { provider: string; filePath: string; previewDataUrl: string; updatedAt: number }; message?: string }>;
  getHeadingVideos: (heading: string) => Promise<{ success: boolean; videos?: Array<{ provider: string; filePath: string; previewDataUrl: string; updatedAt: number }>; message?: string }>;
  removeHeadingVideo: (heading: string) => Promise<{ success: boolean; message?: string }>;
  getAllHeadingVideos: () => Promise<{ success: boolean; videos?: Record<string, Array<{ provider: string; filePath: string; previewDataUrl: string; updatedAt: number }>>; message?: string }>;
  // 예약 포스팅 관리 API
  getScheduledPosts: () => Promise<{ success: boolean; posts?: Array<{ id: string; postId?: string; title: string; scheduleDate: string; createdAt: string; status: string; publishMode?: string; publishedAt?: string; publishedUrl?: string }>; message?: string }>;
  removeScheduledPost: (postId: string) => Promise<{ success: boolean; message?: string }>;
  // 창 포커스 API
  focusWindow: () => Promise<{ success: boolean; message?: string }>;
  // 썸네일 생성기 API
  saveThumbnailToLocal: (blobData: { type: string; data: number[] }, format: 'png' | 'jpg') => Promise<{ success: boolean; filePath?: string; message?: string }>;
  // 외부 URL 열기
  openExternalUrl: (url: string) => Promise<{ success: boolean; message?: string }>;
  // 창 포커스
  focusWindow: () => Promise<{ success: boolean; message?: string }>;
  // ✅ 이미지 URL 다운로드 및 저장
  downloadAndSaveImage: (
    imageUrl: string,
    heading: string,
    postTitle?: string,
    postId?: string
  ) => Promise<{ success: boolean; filePath?: string; previewDataUrl?: string; savedToLocal?: string; message?: string }>;
  collectImagesFromUrl: (url: string) => Promise<{ success: boolean; images?: string[]; message?: string }>;
  collectImagesFromShopping: (url: string) => Promise<{ success: boolean; images?: string[]; title?: string; message?: string }>;
  searchNaverImages: (keyword: string) => Promise<{ success: boolean; images?: any[]; message?: string }>; // ✅ 네이버 이미지 검색 API
  // ✅ [100점 개선] AI 이미지 검색어 최적화 API
  optimizeImageSearchQuery: (title: string, heading: string) => Promise<{
    success: boolean;
    optimizedQuery?: string;
    coreSubject?: string;
    broaderQuery?: string;
    category?: string;
    message?: string
  }>;
  // ✅ [100점 개선] 핵심 주제 추출 API
  extractCoreSubject: (title: string) => Promise<{ success: boolean; subject?: string; message?: string }>;
  // ✅ [100점 개선] URL에서 이미지 크롤링 API
  crawlImagesFromUrl: (url: string) => Promise<{ success: boolean; images?: string[]; title?: string; message?: string }>;
  downloadAndSaveImage: (imageUrl: string, title: string, index: number) => Promise<{ success: boolean; filePath?: string; error?: string }>; // ✅ 이미지 로컬 저장
  downloadAndSaveMultipleImages: (images: Array<{ url: string; heading: string }>, title: string) => Promise<{ success: boolean; savedImages: any[]; folderPath?: string; error?: string }>; // ✅ 여러 이미지 일괄 저장
  // 여러 플랫폼에서 콘텐츠 수집 (할루시네이션 방지)
  collectContentFromPlatforms: (keyword: string, options?: { maxPerSource?: number }) => Promise<{ success: boolean; collectedText?: string; sourceCount?: number; urls?: string[]; message?: string }>;
  // 저장된 이미지 관리
  getSavedImagesPath: () => Promise<string>;
  getSavedImages: (dirPath: string) => Promise<{ success: boolean; images?: string[]; message?: string }>;

  // ✅ 실시간 트렌드 알림 API
  startTrendMonitoring: () => Promise<{ success: boolean; message?: string }>;
  stopTrendMonitoring: () => Promise<{ success: boolean; message?: string }>;
  getTrendStatus: () => Promise<{ isMonitoring: boolean; alertEnabled: boolean }>;
  setTrendAlertEnabled: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>;
  getCurrentTrends: () => Promise<{ success: boolean; trends?: TrendKeyword[]; message?: string }>;
  setTrendInterval: (intervalMs: number) => Promise<{ success: boolean; interval: number }>;
  onTrendAlert: (callback: (alert: TrendAlertEvent) => void) => void;

  // ✅ 발행 후 성과 추적 API
  addPostToAnalytics: (url: string, title: string) => Promise<{ success: boolean; message?: string }>;
  startAnalyticsTracking: () => Promise<{ success: boolean; message?: string }>;
  stopAnalyticsTracking: () => Promise<{ success: boolean; message?: string }>;
  getAnalyticsStatus: () => Promise<{ isTracking: boolean; postCount: number }>;
  getAllTrackedPosts: () => Promise<{ success: boolean; posts?: PostPerformance[]; message?: string }>;
  getPostAnalytics: () => Promise<{ success: boolean; analytics?: AnalyticsResult; message?: string }>;
  updatePostMetrics: () => Promise<{ success: boolean; message?: string }>;
  removeTrackedPost: (postId: string) => Promise<{ success: boolean; message?: string }>;

  // ✅ 최적 시간 자동 예약 발행 API
  getOptimalPublishTimes: (count?: number, category?: string) => Promise<{ success: boolean; times?: OptimalTime[]; message?: string }>;
  schedulePost: (title: string, keyword: string, scheduledAt: string) => Promise<{ success: boolean; post?: ScheduledPost; message?: string }>;
  scheduleAtOptimalTime: (title: string, keyword: string, category?: string) => Promise<{ success: boolean; post?: ScheduledPost; message?: string }>;
  cancelScheduledPost: (postId: string) => Promise<{ success: boolean; message?: string }>;
  getAllScheduledPosts: () => Promise<{ success: boolean; posts?: ScheduledPost[]; message?: string }>;
  getPendingScheduledPosts: () => Promise<{ success: boolean; posts?: ScheduledPost[]; message?: string }>;
  reschedulePost: (postId: string, newTime: string) => Promise<{ success: boolean; message?: string }>;
  retryScheduledPost: (postId: string) => Promise<{ success: boolean; message?: string }>;
  getSchedulerStats: () => Promise<{ success: boolean; stats?: SchedulerStats; message?: string }>;
  cancelAllScheduled: () => Promise<{ success: boolean; message?: string }>;

  // ✅ 키워드 경쟁도 분석 API
  analyzeKeyword: (keyword: string) => Promise<{ success: boolean; analysis?: KeywordCompetition; message?: string }>;
  findBlueOceanKeywords: (baseKeyword: string, count?: number) => Promise<{ success: boolean; keywords?: BlueOceanKeyword[]; message?: string }>;
  clearKeywordCache: () => Promise<{ success: boolean; message?: string }>;

  // ✅ 자동 내부링크 삽입 API
  addPostToInternalLinks: (url: string, title: string, content?: string) => Promise<{ success: boolean; message?: string }>;
  findRelatedPosts: (title: string, content: string, maxResults?: number) => Promise<{ success: boolean; links?: InternalLinkResult[]; message?: string }>;
  insertInternalLinks: (content: string, title: string, options?: InternalLinkOptions) => Promise<{ success: boolean; result?: LinkInsertionResult; message?: string }>;
  getAllInternalLinkPosts: () => Promise<{ success: boolean; posts?: InternalLinkPost[]; message?: string }>;
  getInternalLinkStats: () => Promise<{ success: boolean; stats?: InternalLinkStats; message?: string }>;

  // ✅ 썸네일 자동 생성 API
  generateThumbnailSvg: (title: string, options?: ThumbnailOptions, category?: string) => Promise<{ success: boolean; svg?: string; message?: string }>;
  getThumbnailStyles: () => Promise<{ success: boolean; styles?: ThumbnailStyle[]; message?: string }>;
  getThumbnailCategories: () => Promise<{ success: boolean; categories?: string[]; message?: string }>;

  // ✅ 다중 블로그 관리 API
  addBlogAccount: (name: string, blogId: string, naverId?: string, naverPassword?: string, settings?: BlogAccountSettings) => Promise<{ success: boolean; account?: BlogAccount; message?: string }>;
  updateBlogAccount: (accountId: string, updates: Partial<BlogAccount>) => Promise<{ success: boolean; message?: string }>;
  removeBlogAccount: (accountId: string) => Promise<{ success: boolean; message?: string }>;
  setActiveBlogAccount: (accountId: string) => Promise<{ success: boolean; message?: string }>;
  getActiveBlogAccount: () => Promise<{ success: boolean; account?: BlogAccount; message?: string }>;
  getAllBlogAccounts: () => Promise<{ success: boolean; accounts?: BlogAccount[]; message?: string }>;
  getNextBlogAccount: () => Promise<{ success: boolean; account?: BlogAccount; message?: string }>;
  getBlogAccountStats: (accountId: string) => Promise<{ success: boolean; stats?: BlogAccountStats; message?: string }>;
  getTotalBlogStats: () => Promise<{ success: boolean; stats?: TotalBlogStats; message?: string }>;
  toggleBlogAccount: (accountId: string) => Promise<{ success: boolean; isActive?: boolean; message?: string }>;
  recordBlogPublish: (accountId: string) => Promise<{ success: boolean; message?: string }>;
  getAccountCredentials: (accountId: string) => Promise<{ success: boolean; credentials?: { naverId: string; naverPassword: string } | null; message?: string }>;
  updateAccountCredentials: (accountId: string, naverId: string, naverPassword: string) => Promise<{ success: boolean; message?: string }>;
  updateAccountSettings: (accountId: string, settings: any) => Promise<{ success: boolean; message?: string }>;
  getNextContentSource: (accountId: string) => Promise<{ success: boolean; source?: { type: 'keyword' | 'url'; value: string } | null; message?: string }>;

  // ✅ 다중계정 동시발행 API
  multiAccountPublish: (accountIds: string[], options?: any) => Promise<{ success: boolean; results?: Array<{ accountId: string; success: boolean; message?: string; url?: string }>; summary?: { total: number; success: number; fail: number }; message?: string }>;
  // ✅ 다중계정 발행 즉시 중지 API
  multiAccountCancel: () => Promise<{ success: boolean; message?: string }>;

  // ✅ AI 제목 A/B 테스트 API
  generateTitleCandidates: (keyword: string, category?: string, count?: number) => Promise<{ success: boolean; result?: ABTestResult; message?: string }>;
  evaluateTitle: (title: string, category?: string) => Promise<{ success: boolean; evaluation?: TitleCandidate; message?: string }>;
  suggestTitleImprovements: (title: string) => Promise<{ success: boolean; suggestions?: string[]; message?: string }>;
  getTitleStyles: () => Promise<{ success: boolean; styles?: TitleStyleType[]; message?: string }>;

  // ✅ 댓글 자동 답글 API
  addComment: (author: string, content: string, postUrl: string, postTitle: string) => Promise<{ success: boolean; comment?: CommentData; message?: string }>;
  generateCommentReply: (commentId: string, customAnswer?: string) => Promise<{ success: boolean; reply?: string; message?: string }>;
  markCommentReplied: (commentId: string, replyContent: string) => Promise<{ success: boolean; message?: string }>;
  getPendingComments: () => Promise<{ success: boolean; comments?: CommentData[]; message?: string }>;
  getRepliedComments: () => Promise<{ success: boolean; comments?: CommentData[]; message?: string }>;
  getCommentStats: () => Promise<{ success: boolean; stats?: CommentStats; message?: string }>;
  generateBulkReplies: () => Promise<{ success: boolean; replies?: BulkReplyItem[]; message?: string }>;

  // ✅ 경쟁 블로그 분석 API
  analyzeCompetitors: (keyword: string) => Promise<{ success: boolean; result?: CompetitorAnalysisResult; message?: string }>;
  analyzeCompetitorBlog: (blogId: string) => Promise<{ success: boolean; result?: BlogAnalysisResult; message?: string }>;
  clearCompetitorCache: () => Promise<{ success: boolean; message?: string }>;

  // ✅ AI 어시스턴트 API
  aiAssistantChat: (message: string) => Promise<{ success: boolean; response?: string; actions?: any[]; suggestFollowUp?: string[]; error?: any }>;
  aiAssistantGetWelcome: () => Promise<{ success: boolean; message: string }>;
  aiAssistantClearChat: () => Promise<{ success: boolean; message?: string }>;
  aiAssistantRunAutoFix: () => Promise<{ success: boolean; fixResults?: any[]; message: string }>;
}

// ✅ 트렌드 알림 타입
type TrendKeyword = {
  text: string;
  velocity: number;
  rank?: number;
  category?: string;
};

type TrendAlertEvent = {
  type: 'breaking' | 'rising' | 'new';
  keyword: string;
  velocity: number;
  rank: number;
  category?: string;
  detectedAt: string;
  suggestion: string;
};

// ✅ 발행 후 성과 추적 타입
type PostPerformance = {
  postId: string;
  url: string;
  title: string;
  publishedAt: string;
  lastCheckedAt: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
  history: Array<{
    checkedAt: string;
    views: number;
    likes: number;
    comments: number;
  }>;
  trend: 'up' | 'down' | 'stable';
  score: number;
};

type AnalyticsResult = {
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  averageViews: number;
  topPerformingPosts: PostPerformance[];
  lowPerformingPosts: PostPerformance[];
  bestKeywords: string[];
  bestPublishTimes: string[];
  recommendations: string[];
};

// ✅ 최적 시간 자동 예약 발행 타입
type OptimalTime = {
  time: Date;
  score: number;
  description: string;
};

type ScheduledPost = {
  id: string;
  title: string;
  keyword: string;
  scheduledAt: string;
  status: 'pending' | 'publishing' | 'completed' | 'failed';
  createdAt: string;
  publishedUrl?: string;
  error?: string;
};

type SchedulerStats = {
  pending: number;
  completed: number;
  failed: number;
  total: number;
};

// ✅ 키워드 경쟁도 분석 타입
type KeywordCompetition = {
  keyword: string;
  searchVolume: 'high' | 'medium' | 'low';
  competition: 'high' | 'medium' | 'low';
  difficulty: number;
  opportunity: number;
  blogCount: number;
  newsCount: number;
  topBlogAuthority: 'high' | 'medium' | 'low';
  recommendation: 'excellent' | 'good' | 'moderate' | 'difficult' | 'avoid';
  reasons: string[];
  suggestions: string[];
  relatedKeywords: string[];
  analyzedAt: string;
};

type BlueOceanKeyword = {
  keyword: string;
  score: number;
  searchVolume: string;
  competition: string;
  reason: string;
};

// ✅ 자동 내부링크 삽입 타입
type InternalLinkResult = {
  postId: string;
  title: string;
  url: string;
  relevanceScore: number;
  matchedKeywords: string[];
};

type InternalLinkOptions = {
  maxLinks?: number;
  insertAtEnd?: boolean;
  linkStyle?: 'text' | 'card';
};

type LinkInsertionResult = {
  originalContent: string;
  modifiedContent: string;
  insertedLinks: InternalLinkResult[];
  insertionPoints: Array<{ position: number; link: InternalLinkResult }>;
};

type InternalLinkPost = {
  id: string;
  title: string;
  url: string;
  keywords: string[];
  category?: string;
  publishedAt: string;
};

type InternalLinkStats = {
  totalPosts: number;
  totalKeywords: number;
  avgKeywordsPerPost: number;
};

// ✅ 썸네일 자동 생성 타입
type ThumbnailStyle = 'modern' | 'minimal' | 'bold' | 'gradient' | 'photo';

type ThumbnailOptions = {
  width?: number;
  height?: number;
  style?: ThumbnailStyle;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  gradientColors?: [string, string];
};

// ✅ 다중 블로그 관리 타입
type BlogAccountSettings = {
  dailyLimit?: number;
  autoRotate?: boolean;
  category?: string;
  isJabBlog?: boolean;
  // ✅ 계정별 개별 설정 (다중계정 동시발행용)
  imageSource?: 'gemini' | 'imagen' | 'pexels' | 'unsplash' | 'skip';
  toneStyle?: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous';
  publishMode?: 'publish' | 'draft';
  keywords?: string[];
  urls?: string[];
  keywordIndex?: number;
  urlIndex?: number;
};

type BlogAccount = {
  id: string;
  name: string;
  blogId: string;
  isActive: boolean;
  lastUsed?: string;
  totalPosts: number;
  createdAt: string;
  settings: BlogAccountSettings;
};

type BlogAccountStats = {
  accountId: string;
  todayPosts: number;
  weekPosts: number;
  monthPosts: number;
  lastPostAt?: string;
};

type TotalBlogStats = {
  totalAccounts: number;
  activeAccounts: number;
  todayTotalPosts: number;
  weekTotalPosts: number;
};

// ✅ AI 제목 A/B 테스트 타입
type TitleStyleType = 'curiosity' | 'benefit' | 'urgency' | 'question' | 'howto' | 'listicle' | 'emotional' | 'factual';

type TitleCandidate = {
  id: string;
  title: string;
  style: TitleStyleType;
  score: number;
  reasons: string[];
};

type ABTestResult = {
  keyword: string;
  candidates: TitleCandidate[];
  recommendedTitle: TitleCandidate;
  generatedAt: string;
};

// ✅ 댓글 자동 답글 타입
type CommentType = 'question' | 'compliment' | 'feedback' | 'request' | 'general';

type CommentData = {
  id: string;
  author: string;
  content: string;
  postUrl: string;
  postTitle: string;
  createdAt: string;
  type: CommentType;
  replied: boolean;
  replyContent?: string;
  repliedAt?: string;
};

type CommentStats = {
  pendingCount: number;
  repliedCount: number;
  totalCount: number;
  typeBreakdown: Record<CommentType, number>;
};

type BulkReplyItem = {
  comment: CommentData;
  suggestedReply: string;
};

// ✅ 경쟁 블로그 분석 타입
type CompetitorBlog = {
  blogId: string;
  blogName: string;
  postUrl: string;
  postTitle: string;
  rank: number;
  isInfluencer: boolean;
  estimatedViews?: number;
  publishedAt?: string;
};

type CompetitorContentAnalysis = {
  avgWordCount: number;
  avgImageCount: number;
  avgHeadingCount: number;
  videoRate: number;
  mapRate: number;
};

type CompetitorAnalysisResult = {
  keyword: string;
  analyzedAt: string;
  competitors: CompetitorBlog[];
  contentAnalysis: CompetitorContentAnalysis;
  insights: string[];
  recommendations: string[];
  difficulty: 'easy' | 'medium' | 'hard' | 'very_hard';
  winningStrategy: string;
};

type BlogAnalysisResult = {
  blogId: string;
  recentPosts: number;
  avgWordCount: number;
  avgImageCount: number;
  postingFrequency: string;
  strengths: string[];
};

type LicenseInfo = {
  licenseCode?: string; // 코드 방식일 때만 사용
  deviceId: string;
  verifiedAt: string;
  expiresAt?: string;
  isValid: boolean;
  licenseType?: 'trial' | 'standard' | 'premium' | 'external-inflow' | 'free';
  maxDevices?: number;
  authMethod?: 'code' | 'credentials'; // 인증 방식
  userId?: string; // 아이디/비밀번호 방식일 때 사용
};

declare global {
  interface Window {
    api: AutomationAPI;
    getSelectedHeadings: () => string[];
    getGeneratedImages: () => RendererAutomationImage[];
    getStructuredContent: () => StructuredContent | null;
  }
}

export { };

