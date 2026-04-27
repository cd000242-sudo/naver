import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

export interface AppConfig {
  geminiApiKey?: string;
  geminiApiKeys?: string[]; // ✅ [2026-02-13] 다중 Gemini API 키 (429 할당량 자동 로테이션)
  geminiModel?: 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | 'gemini-2.5-pro' | string; // ✅ Stable 모델만 hint, string으로 확장 허용
  openaiApiKey?: string;
  pexelsApiKey?: string;
  unsplashApiKey?: string;
  pixabayApiKey?: string;
  claudeApiKey?: string;
  perplexityApiKey?: string; // ✅ [2026-01-25] Perplexity API 키 추가
  // ✅ [2026-02-22] OpenAI Image (DALL-E gpt-image-1) API Key
  openaiImageApiKey?: string;
  // ✅ [2026-02-22] Leonardo AI API Key
  leonardoaiApiKey?: string;

  // v2.7.18 (Phase 2): "100점 모드" 토글 — 5 Opus 합의
  // ON 시 제목 검증 루프(최대 3회 재생성) + LLM Judge(별도 모델) 활성화
  // OFF 기본값 — 회귀 0 보장
  premiumTitleMode?: boolean;

  naverDatalabApiKey?: string;
  naverDatalabClientId?: string;
  naverDatalabClientSecret?: string;
  // ✅ 네이버 검색 API (블로그/카페/뉴스 검색)
  naverClientId?: string;
  naverClientSecret?: string;

  // ✅ 네이버 광고 API (키워드 도구)
  naverAdApiKey?: string;
  naverAdSecretKey?: string;
  naverAdCustomerId?: string;
  dailyPostLimit?: number;
  freeQuotaPublish?: number;
  freeQuotaContent?: number;
  freeQuotaMedia?: number;
  appIconPath?: string;
  rememberCredentials?: boolean;
  savedNaverId?: string;
  savedNaverPassword?: string;
  rememberLicenseCredentials?: boolean;
  savedLicenseUserId?: string;
  savedLicensePassword?: string;
  authorName?: string;
  hideDailyLimitWarning?: boolean;
  // 이미지 소스 체크박스 상태
  imageSourceUnsplash?: boolean;
  imageSourcePexels?: boolean;
  imageSourcePixabay?: boolean;
  imageSourceWikimedia?: boolean;
  // 사용자 프로필 설정
  userDisplayName?: string;
  userEmail?: string;
  userTimezone?: string;
  // 고급 설정
  enableDebugMode?: boolean;
  // ✅ [v1.4.54] 자동 DOM 덤프 설정 — 실패 시 진단 파일 자동 저장
  debugDump?: {
    enabled: boolean;             // 기본 true (사용자 진단 편의)
    maxDumps: number;             // 기본 20
    maxAgeDays: number;           // 기본 7
    includeScreenshot: boolean;   // 기본 true
    includeHtml: boolean;         // 기본 true
    includeNetworkLog: boolean;   // 기본 true (스크럽 적용됨)
  };
  autoSaveDrafts?: boolean;
  backupFrequency?: 'never' | 'daily' | 'weekly' | 'monthly';
  imageSourceNasa?: boolean;
  imageSourceOpenverse?: boolean;
  imageSourceKoreaGov?: boolean;
  imageSourceNewsAgency?: boolean;
  // 이미지 저장 경로
  customImageSavePath?: string; // 사용자 지정 이미지 저장 경로

  externalApiCostConsent?: boolean;
  externalApiCostConsentAt?: string;
  externalApiDailyImageLimit?: number;
  externalApiPerRunImageLimit?: number;
  externalApiDailyImageCount?: number;
  externalApiDailyImageDate?: string;
  enableFreeTrialButton?: boolean;

  // ✅ Gemini 이미지 생성 쿼터 관리
  geminiPlanType?: 'free' | 'paid';
  geminiImageDailyCount?: number;
  geminiImageLastReset?: string;

  // ✅ [2026-02-23] Leonardo AI 모델 선택
  leonardoaiModel?: 'seedream-4.5' | 'phoenix-1.0' | 'ideogram-3.0' | 'nano-banana-pro';

  // ✅ DeepInfra API (FLUX-2-dev 고품질 저가)
  deepinfraApiKey?: string;

  // ✅ Gemini 텍스트 생성 주 모델 선택
  primaryGeminiTextModel?: 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | string;

  // ✅ [v1.4.3] Google Search Grounding 옵션 (기본 OFF — 호출당 $0.035 추가 비용 방지)
  enableSearchGrounding?: boolean;

  // ✅ [v1.4.5] Lite Mode 비활성화 옵션 (기본 false=활성화, true 시 Full 프롬프트 강제 사용)
  disableLiteMode?: boolean;

  // ✅ 이미지 품질 티어 시스템 (비용 최적화)
  imageQualityMode?: 'balanced' | 'all-budget' | 'all-premium' | 'all-4k';
  thumbnailImageModel?: 'gemini-3-pro-4k' | 'gemini-3-pro' | 'gemini-2.5-flash' | 'gemini-2.0-flash-exp';
  otherImagesModel?: 'gemini-2.5-flash' | 'gemini-2.0-flash-exp' | 'gemini-3-pro' | 'gemini-3-pro-4k';
  lockThumbnailTo4K?: boolean; // 기본값 true: 썸네일은 항상 4K 품질

  // ✅ [2026-02-08] 이미지 엔진 모델 설정 (DeepInfra만 유지)
  deepinfraModel?: string;
  // 이미지 설정 프리셋
  imagePreset?: 'budget' | 'premium' | 'custom';

  // ✅ [2026-01-25] 전역 AI 제공자 설정
  defaultAiProvider?: 'gemini' | 'perplexity' | 'openai' | 'claude';
  perplexityModel?: 'sonar' | 'sonar-pro';

  // ✅ [2026-03-18] Gemini API 사용량 추적 (로컬 누적)
  geminiUsageTracker?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCalls: number;
    estimatedCostUSD: number;
    lastUpdated: string; // ISO date
    firstTracked: string; // ISO date - 추적 시작일
  };
  geminiCreditBudget?: number; // 사용자 설정 예산 (USD, 기본 $300). 직접 결제한 금액 추적용

  // ✅ [2026-03-19] 통합 API 사용량 추적 (모든 제공자)
  apiUsageTrackers?: {
    [provider: string]: {
      totalCalls: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalImages: number;
      estimatedCostUSD: number;
      lastUpdated: string;
      firstTracked: string;
    };
  };
}

const CONFIG_FILE = 'settings.json';
const LAST_USER_FILE = '.last_active_user';

let cachedConfig: AppConfig | null = null;
let configPath: string | null = null;

/** ✅ [2026-02-26] 계정별 설정 파일 지원 */
let _activeUserId: string = '';
const _userConfigPaths: Map<string, string> = new Map();

/** ✅ [2026-03-27] 마지막 활성 사용자 ID 저장/로드 */
async function saveLastActiveUserId(userId: string): Promise<void> {
  try {
    const filePath = path.join(app.getPath('userData'), LAST_USER_FILE);
    await fs.writeFile(filePath, userId, 'utf-8');
  } catch { /* 비필수 */ }
}

async function loadLastActiveUserId(): Promise<string> {
  try {
    const filePath = path.join(app.getPath('userData'), LAST_USER_FILE);
    const userId = (await fs.readFile(filePath, 'utf-8')).trim();
    return userId;
  } catch {
    return '';
  }
}

async function ensureConfigPath(userId?: string): Promise<string> {
  if (!app.isReady()) {
    await app.whenReady();
  }

  const targetUserId = userId || _activeUserId;

  // ✅ [2026-02-26] 계정별 설정 파일 경로
  if (targetUserId) {
    const cached = _userConfigPaths.get(targetUserId);
    if (cached) return cached;

    const userConfigFile = `settings_${targetUserId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    const userPath = path.join(app.getPath('userData'), userConfigFile);
    _userConfigPaths.set(targetUserId, userPath);

    // 계정별 파일이 없으면 기본 설정 파일에서 복사 (마이그레이션)
    try {
      await fs.access(userPath);
    } catch {
      const defaultPath = path.join(app.getPath('userData'), CONFIG_FILE);
      try {
        await fs.access(defaultPath);
        await fs.copyFile(defaultPath, userPath);
        console.log(`[Config] 🔄 기본 설정 → 계정별 설정 마이그레이션 완료: ${userConfigFile}`);
      } catch {
        console.log(`[Config] 📄 새 계정 설정 파일 생성 예정: ${userConfigFile}`);
      }
    }

    console.log(`[Config] 설정 파일 경로 (계정: ${targetUserId}):`, userPath);
    return userPath;
  }

  // ✅ [2026-03-27 FIX] 기본 경로 — 마지막 활성 사용자의 계정별 파일이 있으면 우선 사용
  // 앱 재시작 시 로그인 전에도 이전 세션의 API 키가 보이도록 함
  if (!configPath) {
    const lastUserId = await loadLastActiveUserId();
    if (lastUserId) {
      const userConfigFile = `settings_${lastUserId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      const userPath = path.join(app.getPath('userData'), userConfigFile);
      try {
        await fs.access(userPath);
        configPath = userPath;
        _activeUserId = lastUserId;
        _userConfigPaths.set(lastUserId, userPath);
        console.log(`[Config] ✅ 마지막 활성 사용자(${lastUserId}) 설정 파일 자동 로드:`, userPath);
        return configPath;
      } catch {
        console.log(`[Config] 마지막 사용자 설정 파일 없음, 기본 파일 사용`);
      }
    }
    configPath = path.join(app.getPath('userData'), CONFIG_FILE);
    console.log('[Config] 설정 파일 경로:', configPath);
  }
  return configPath;
}

export async function loadConfig(): Promise<AppConfig> {
  const filePath = await ensureConfigPath();
  const isPackaged = app.isPackaged;

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as any;

    // ✅ 사용자가 입력한 API 키는 항상 유지됨
    // 초기화는 배포팩 생성 시 scripts/reset-config-for-pack.js에서만 수행
    // 앱 실행 시에는 사용자 설정을 절대 초기화하지 않음
    if (isPackaged) {
      console.log('[Config] 📦 패키지 모드: 사용자 설정 유지');
    }

    // 주의: 패키지 생성 시에만 초기화되어야 하며, 사용자가 저장한 값은 그대로 유지되어야 함
    // 초기화는 scripts/reset-config-for-pack.js에서만 수행됨

    // ✅ [2026-04-09 FIX] 텍스트 생성용 죽은 Gemini 모델을 stable로 마이그레이션
    // exact match 사용 — 이미지 모델(gemini-2.0-flash-exp 등)은 다른 필드라 건드리지 않음
    const DEAD_TEXT_MODELS = new Set([
      'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b',
      'gemini-pro', 'gemini-pro-vision',
      'gemini-3.1-flash-preview', 'gemini-3-flash-preview',
      'gemini-3.1-pro-preview', 'gemini-3-pro-preview',
      'gemini-2.0-flash', 'gemini-2.0-flash-001',
    ]);
    // ✅ [v1.4.49 revert] 마이그레이션 기본값을 Flash로 (Flash-Lite 실제 RPD 20/일로 부족)
    let geminiModel = parsed.geminiModel;
    if (geminiModel && DEAD_TEXT_MODELS.has(geminiModel)) {
      const oldModel = geminiModel;
      geminiModel = 'gemini-2.5-flash';
      console.log(`[Config] ⚠️ geminiModel(${oldModel}) → ${geminiModel}로 자동 마이그레이션`);
    }

    // ✅ primaryGeminiTextModel도 동일 마이그레이션 (Gemini ID인 경우만)
    let primaryGeminiTextModel = parsed.primaryGeminiTextModel;
    if (primaryGeminiTextModel && typeof primaryGeminiTextModel === 'string' &&
        primaryGeminiTextModel.startsWith('gemini-') &&
        DEAD_TEXT_MODELS.has(primaryGeminiTextModel)) {
      const oldModel = primaryGeminiTextModel;
      primaryGeminiTextModel = 'gemini-2.5-flash';
      console.log(`[Config] ⚠️ primaryGeminiTextModel(${oldModel}) → ${primaryGeminiTextModel}로 자동 마이그레이션`);
    }

    // 하이픈 형식 키를 카멜케이스로 변환 (하위 호환성)
    const normalizedConfig: AppConfig = {
      ...parsed,
      geminiModel: geminiModel as any, // ✅ 변환된 모델 적용
      primaryGeminiTextModel: primaryGeminiTextModel as any, // ✅ 변환된 모델 적용
      // 하이픈 형식 키가 있으면 카멜케이스로 변환 (값이 있으면 우선 사용)
      geminiApiKey: parsed.geminiApiKey || parsed['gemini-api-key'] || undefined,
      openaiApiKey: parsed.openaiApiKey || parsed['openai-api-key'] || undefined,
      claudeApiKey: parsed.claudeApiKey || parsed['claude-api-key'] || undefined,
      pexelsApiKey: parsed.pexelsApiKey || parsed['pexels-api-key'] || undefined,
      prodiaToken: undefined, // deprecated - removed
      unsplashApiKey: parsed.unsplashApiKey || parsed['unsplash-api-key'] || undefined,
      pixabayApiKey: parsed.pixabayApiKey || parsed['pixabay-api-key'] || undefined,
      stabilityApiKey: undefined, // deprecated - removed
      naverDatalabClientId: parsed.naverDatalabClientId || parsed['naver-datalab-client-id'] || undefined,
      naverDatalabClientSecret: parsed.naverDatalabClientSecret || parsed['naver-datalab-client-secret'] || undefined,
      // ✅ [2026-01-25] 네이버 검색 API 키 추가
      naverClientId: parsed.naverClientId || parsed['naver-client-id'] || undefined,
      naverClientSecret: parsed.naverClientSecret || parsed['naver-client-secret'] || undefined,
      // ✅ 네이버 광고 API (키워드 도구)
      naverAdApiKey: parsed.naverAdApiKey || undefined,
      naverAdSecretKey: parsed.naverAdSecretKey || undefined,
      naverAdCustomerId: parsed.naverAdCustomerId || undefined,
      // ✅ [2026-02-22] 새 이미지 프로바이더 API 키
      openaiImageApiKey: parsed.openaiImageApiKey || undefined,
      leonardoaiApiKey: parsed.leonardoaiApiKey || undefined,

      leonardoaiModel: parsed.leonardoaiModel || undefined,
      // ✅ [2026-01-25] Perplexity API 키 추가
      perplexityApiKey: parsed.perplexityApiKey || parsed['perplexity-api-key'] || undefined,
      // ✅ [2026-01-26] DeepInfra API 키 추가
      deepinfraApiKey: parsed.deepinfraApiKey || parsed['deepinfra-api-key'] || undefined,
      // ✅ [2026-02-08] 이미지 엔진 모델 설정 명시적 파싱
      deepinfraModel: parsed.deepinfraModel || undefined,
    };

    // 빈 문자열 제거 및 undefined 제거
    Object.keys(normalizedConfig).forEach((key) => {
      const typedKey = key as keyof AppConfig;
      const value = normalizedConfig[typedKey];
      if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
        delete normalizedConfig[typedKey];
      }
    });

    // 하이픈 형식 키가 있었고 카멜케이스로 변환했다면, 설정 파일을 업데이트 (한 번만)
    const hasHyphenKeys = parsed['gemini-api-key'] || parsed['openai-api-key'] || parsed['claude-api-key'] || parsed['pexels-api-key'];
    if (hasHyphenKeys && !isPackaged) {
      // 개발 모드에서만 자동 마이그레이션 (한 번만)
      try {
        // 하이픈 형식 키 제거하고 카멜케이스만 저장
        const migratedConfig: any = { ...normalizedConfig };
        delete migratedConfig['gemini-api-key'];
        delete migratedConfig['openai-api-key'];
        delete migratedConfig['claude-api-key'];
        delete migratedConfig['pexels-api-key'];
        delete migratedConfig['unsplash-api-key'];
        delete migratedConfig['pixabay-api-key'];
        delete migratedConfig['naver-datalab-client-id'];
        delete migratedConfig['naver-datalab-client-secret'];

        await fs.writeFile(filePath, JSON.stringify(migratedConfig, null, 2), 'utf-8');
        console.log('[Config] 하이픈 형식 키를 카멜케이스로 마이그레이션 완료');
      } catch (migrateError) {
        console.error('[Config] 마이그레이션 실패 (계속 진행):', migrateError);
      }
    }

    // ✅ 하이픈 형식 키도 함께 반환 (renderer.ts 호환성)
    const compatibleConfig: any = {
      ...normalizedConfig,
      // usage videos list maintenance
      tutorialVideos: parsed.tutorialVideos || [],
      // 카멜케이스와 하이픈 형식 모두 제공
      'gemini-api-key': normalizedConfig.geminiApiKey,
      'openai-api-key': normalizedConfig.openaiApiKey,
      'claude-api-key': normalizedConfig.claudeApiKey,
      'pexels-api-key': normalizedConfig.pexelsApiKey,
      // (deprecated keys removed: stability, prodia, falai)
      'unsplash-api-key': normalizedConfig.unsplashApiKey,
      // ✅ [2026-01-25] 네이버 검색 API 키 호환성
      'naver-client-id': normalizedConfig.naverClientId || normalizedConfig.naverDatalabClientId,
      'naver-client-secret': normalizedConfig.naverClientSecret || normalizedConfig.naverDatalabClientSecret,
      // ✅ [2026-01-25] Perplexity API 키 호환성
      'perplexity-api-key': normalizedConfig.perplexityApiKey,
      // ✅ [2026-01-25] 네이버 광고 API 키 호환성 (검색광고 키워드 도구)
      'naver-ad-api-key': normalizedConfig.naverAdApiKey,
      'naver-ad-secret-key': normalizedConfig.naverAdSecretKey,
      'naver-ad-customer-id': normalizedConfig.naverAdCustomerId,
      // ✅ [2026-01-26] DeepInfra API 키 호환성
      'deepinfra-api-key': (normalizedConfig as any).deepinfraApiKey,
    };

    cachedConfig = compatibleConfig;
    console.log('[Config] 설정 파일 로드 성공:', filePath);
    console.log('[Config] 로드된 키 개수:', Object.keys(compatibleConfig).length);
    if (compatibleConfig.geminiApiKey) {
      console.log('[Config] Gemini API 키 존재: ✅');
    }
    if (compatibleConfig.openaiApiKey) {
      console.log('[Config] OpenAI API 키 존재: ✅');
    }
    if (compatibleConfig.claudeApiKey) {
      console.log('[Config] Claude API 키 존재: ✅');
    }
    if (compatibleConfig.pexelsApiKey) {
      console.log('[Config] Pexels API 키 존재: ✅');
    }

    // 네이버 아이디/비밀번호 저장 상태 확인
    if (compatibleConfig.savedNaverId) {
      console.log('[Config] 저장된 네이버 아이디 존재: ✅');
    }
    if (compatibleConfig.savedNaverPassword) {
      console.log('[Config] 저장된 네이버 비밀번호 존재:', '***');
    }
    console.log('[Config] rememberCredentials:', compatibleConfig.rememberCredentials);
    return compatibleConfig as AppConfig;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      console.log('[Config] 설정 파일이 없습니다. 새로 생성합니다:', filePath);
      // 배포 모드에서 기본 설정 생성 (모든 민감 정보 없음)
      if (isPackaged) {
        const defaultConfig: AppConfig = {
          // API 키들 빈 값
          geminiApiKey: '',
          openaiApiKey: '',
          claudeApiKey: '',
          pexelsApiKey: '',
          unsplashApiKey: '',
          pixabayApiKey: '',

          naverDatalabClientId: '',
          naverDatalabClientSecret: '',
          // 네이버 계정 정보 없음
          rememberCredentials: false,
          savedNaverId: '',
          savedNaverPassword: '',
          // 라이선스 자격증명 없음
          rememberLicenseCredentials: false,
          savedLicenseUserId: '',
          savedLicensePassword: '',
          // 사용자 프로필 없음
          userDisplayName: '',
          userEmail: '',
          // 기본 설정
          dailyPostLimit: 3,
          hideDailyLimitWarning: false,
          enableFreeTrialButton: true,
        };
        try {
          await fs.writeFile(filePath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
          console.log('[Config] 배포 모드: 기본 설정 파일 생성 완료 (모든 민감 정보 없음)');
        } catch (writeError) {
          console.error('[Config] 기본 설정 파일 생성 실패:', writeError);
        }
        cachedConfig = defaultConfig;
        return defaultConfig;
      }
    } else {
      console.error('[Config] 설정 파일 읽기 실패:', err.message);
      console.error('[Config] 파일 경로:', filePath);
    }
    cachedConfig = {};
    return cachedConfig;
  }
}

export function getConfigSync(): AppConfig {
  return cachedConfig ?? {};
}

export async function saveConfig(update: AppConfig): Promise<AppConfig> {
  // ✅ [2026-02-26] __userId가 전달되면 계정별 설정 모드 활성화
  const updateAny = update as any;
  if (updateAny.__userId && typeof updateAny.__userId === 'string') {
    _activeUserId = updateAny.__userId;
    delete updateAny.__userId;
    // ✅ [2026-03-27] configPath 초기화 — 이전 세션의 기본/다른 계정 경로를 리셋
    configPath = null;
    // 캐시 초기화하여 계정별 파일에서 새로 로드하도록
    cachedConfig = null;
    console.log(`[Config] ✅ 계정별 설정 모드 활성화: ${_activeUserId}`);
    // ✅ [2026-03-27] 마지막 활성 사용자 ID 저장 (앱 재시작 시 자동 로드용)
    await saveLastActiveUserId(_activeUserId);
    // 계정별 설정 로드
    const loaded = await loadConfig();
    cachedConfig = { ...loaded, ...updateAny };
  } else {
    cachedConfig = {
      ...cachedConfig,
      ...update,
    };
  }

  const filePath = await ensureConfigPath();

  // Remove empty strings to avoid clutter
  if (!cachedConfig) cachedConfig = {};
  Object.keys(cachedConfig).forEach((key) => {
    const typedKey = key as keyof AppConfig;
    const value = cachedConfig?.[typedKey];
    if (typeof value === 'string' && value.trim() === '') {
      delete cachedConfig?.[typedKey];
    }
  });

  // rememberCredentials가 false이고 저장된 값도 없을 때만 삭제
  // 저장된 값이 있으면 rememberCredentials를 true로 설정
  if (cachedConfig?.savedNaverId || cachedConfig?.savedNaverPassword) {
    cachedConfig = {
      ...cachedConfig,
      rememberCredentials: true,
    };
  } else if (!cachedConfig?.rememberCredentials) {
    // 저장된 값도 없고 rememberCredentials도 false면 정리
    delete cachedConfig?.savedNaverId;
    delete cachedConfig?.savedNaverPassword;
    cachedConfig = {
      ...cachedConfig,
      rememberCredentials: false,
    };
  }

  if (!cachedConfig?.rememberLicenseCredentials) {
    delete cachedConfig?.savedLicenseUserId;
    delete cachedConfig?.savedLicensePassword;
    cachedConfig = {
      ...cachedConfig,
      rememberLicenseCredentials: false,
    };
  }

  await fs.writeFile(filePath, JSON.stringify(cachedConfig, null, 2), 'utf-8');

  // ✅ [2026-03-27 FIX] 계정별 파일에 저장할 때, 기본 settings.json에도 API 키 백싱크
  // 앱 재시작 시 로그인 전에도 API 키가 유지되도록 함
  if (_activeUserId && cachedConfig) {
    try {
      const defaultPath = path.join(app.getPath('userData'), CONFIG_FILE);
      // 기본 파일이 다른 경로일 때만 백싱크 (같은 파일이면 불필요)
      if (filePath !== defaultPath) {
        let defaultConfig: any = {};
        try {
          const raw = await fs.readFile(defaultPath, 'utf-8');
          defaultConfig = JSON.parse(raw);
        } catch { /* 파일 없으면 빈 객체 */ }

        // API 키와 모델 설정만 백싱크 (민감한 계정 정보는 제외)
        const API_KEY_FIELDS = [
          'geminiApiKey', 'geminiApiKeys', 'openaiApiKey', 'claudeApiKey',
          'pexelsApiKey', 'unsplashApiKey', 'pixabayApiKey', 'perplexityApiKey',
          'deepinfraApiKey', 'openaiImageApiKey', 'leonardoaiApiKey',
          'naverDatalabClientId', 'naverDatalabClientSecret',
          'naverClientId', 'naverClientSecret',
          'naverAdApiKey', 'naverAdSecretKey', 'naverAdCustomerId',
          'geminiModel', 'primaryGeminiTextModel', 'defaultAiProvider',
          'perplexityModel', 'geminiPlanType',
        ];
        let changed = false;
        for (const field of API_KEY_FIELDS) {
          if ((cachedConfig as any)[field] !== undefined && (cachedConfig as any)[field] !== '') {
            if (defaultConfig[field] !== (cachedConfig as any)[field]) {
              defaultConfig[field] = (cachedConfig as any)[field];
              changed = true;
            }
          }
        }
        if (changed) {
          await fs.writeFile(defaultPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
          console.log('[Config] ✅ 기본 설정 파일에 API 키 백싱크 완료');
        }
      }
    } catch (syncError) {
      console.warn('[Config] ⚠️ API 키 백싱크 실패 (비필수):', syncError);
    }
  }

  return cachedConfig;
}

export function applyConfigToEnv(config: AppConfig): void {
  // API 키 설정 (빈 문자열이 아닌 경우만 주입, 기존 .env 값 보존을 위해 삭제는 하지 않음)
  if (config.geminiApiKey && config.geminiApiKey.trim()) {
    process.env.GEMINI_API_KEY = config.geminiApiKey.trim();
    console.log('[Config] GEMINI_API_KEY 설정됨: ✅');
  }

  // (removed prodiaToken env injection - deprecated)

  // ✅ [2026-03-18 FIX] Gemini 모델 설정 — 비-Gemini 모델명 오염 방지
  // primaryGeminiTextModel은 'claude-haiku', 'openai-gpt4o', 'perplexity-sonar' 등
  // 비-Gemini 값을 가질 수 있으므로, gemini- 접두사가 있는 값만 GEMINI_MODEL에 설정
  const rawModel = config.primaryGeminiTextModel || config.geminiModel;
  const geminiModel = (rawModel && rawModel.startsWith('gemini-')) ? rawModel : undefined;
  if (geminiModel) {
    process.env.GEMINI_MODEL = geminiModel;
    console.log('[Config] GEMINI_MODEL 설정됨:', geminiModel);
  } else if (rawModel) {
    // 비-Gemini 모델은 GEMINI_MODEL에 넣지 않음 (defaultAiProvider로 관리)
    console.log(`[Config] ⚠️ primaryGeminiTextModel(${rawModel})은 비-Gemini 모델 → GEMINI_MODEL 미설정 (provider 경로로 처리)`);
  }

  // ✅ [2026-03-23 FIX] delete 패턴 제거 — GEMINI_API_KEY와 동일한 안전 패턴
  // 빈 값이어도 기존 process.env 값을 보존 (다른 경로에서 설정된 값 유지)
  if (config.openaiApiKey && config.openaiApiKey.trim()) {
    process.env.OPENAI_API_KEY = config.openaiApiKey.trim();
  }

  if (config.pexelsApiKey && config.pexelsApiKey.trim()) {
    process.env.PEXELS_API_KEY = config.pexelsApiKey.trim();
  }

  if (config.claudeApiKey && config.claudeApiKey.trim()) {
    process.env.CLAUDE_API_KEY = config.claudeApiKey.trim();
  }

  // (removed stabilityApiKey env injection - deprecated)

  // ✅ [2026-01-25] Perplexity API 키 설정
  if (config.perplexityApiKey && config.perplexityApiKey.trim()) {
    process.env.PERPLEXITY_API_KEY = config.perplexityApiKey.trim();
    console.log('[Config] PERPLEXITY_API_KEY 설정됨: ✅');
  }

  // ✅ [2026-03-20 FIX] Perplexity 모델 설정 (sonar / sonar-pro)
  if (config.perplexityModel) {
    process.env.PERPLEXITY_MODEL = config.perplexityModel;
    console.log('[Config] PERPLEXITY_MODEL 설정됨:', config.perplexityModel);
  }

  // ✅ 네이버 검색 API (sourceAssembler, blogAccountManager 등에서 사용)
  const ncid = config.naverClientId || config.naverDatalabClientId;
  const ncsec = config.naverClientSecret || config.naverDatalabClientSecret;

  if (ncid && ncid.trim()) {
    const cid = ncid.trim();
    process.env.NAVER_CLIENT_ID = cid;
    process.env.NAVER_CLIENT_ID_SEARCH = cid; // 앨리어싱
    console.log('[Config] NAVER_CLIENT_ID 설정됨');
  }

  if (ncsec && ncsec.trim()) {
    const csec = ncsec.trim();
    process.env.NAVER_CLIENT_SECRET = csec;
    process.env.NAVER_CLIENT_SECRET_SEARCH = csec; // 앨리어싱
    console.log('[Config] NAVER_CLIENT_SECRET 설정됨');
  }

  // ✅ 네이버 데이터랩 API
  if (config.naverDatalabClientId && config.naverDatalabClientId.trim()) {
    process.env.NAVER_DATALAB_CLIENT_ID = config.naverDatalabClientId.trim();
    console.log('[Config] NAVER_DATALAB_CLIENT_ID 설정됨');
  }
  if (config.naverDatalabClientSecret && config.naverDatalabClientSecret.trim()) {
    process.env.NAVER_DATALAB_CLIENT_SECRET = config.naverDatalabClientSecret.trim();
    console.log('[Config] NAVER_DATALAB_CLIENT_SECRET 설정됨');
  }

  // ✅ 네이버 광고 API (KeywordAnalyzer 등에서 사용)
  if (config.naverAdApiKey && config.naverAdApiKey.trim()) {
    process.env.NAVER_AD_API_KEY = config.naverAdApiKey.trim();
    process.env.NAVER_SEARCHAD_API_KEY = config.naverAdApiKey.trim(); // 앨리어싱
  }
  if (config.naverAdSecretKey && config.naverAdSecretKey.trim()) {
    process.env.NAVER_AD_SECRET_KEY = config.naverAdSecretKey.trim();
    process.env.NAVER_SEARCHAD_SECRET_KEY = config.naverAdSecretKey.trim(); // 앨리어싱
  }
  if (config.naverAdCustomerId && config.naverAdCustomerId.trim()) {
    process.env.NAVER_AD_CUSTOMER_ID = config.naverAdCustomerId.trim();
    process.env.NAVER_SEARCHAD_CUSTOMER_ID = config.naverAdCustomerId.trim(); // 앨리어싱
  }

  if (config.dailyPostLimit !== undefined) {
    process.env.DAILY_POST_LIMIT = String(config.dailyPostLimit);
  }
  if (config.appIconPath) {
    process.env.APP_ICON_PATH = config.appIconPath;
  }
  if (config.authorName && config.authorName.trim()) {
    process.env.AUTHOR_NAME = config.authorName.trim();
  } else {
    delete process.env.AUTHOR_NAME;
  }
  if (config.rememberCredentials) {
    if (config.savedNaverId) {
      process.env.NAVER_ID = config.savedNaverId;
      console.log('[Config] NAVER_ID 환경변수 설정됨: ✅');
    }
    if (config.savedNaverPassword) {
      process.env.NAVER_PASSWORD = config.savedNaverPassword;
      console.log('[Config] NAVER_PASSWORD 환경변수 설정됨: ✅');
    }
  } else {
    delete process.env.NAVER_ID;
    delete process.env.NAVER_PASSWORD;
    console.log('[Config] rememberCredentials가 false이므로 환경변수 제거됨');
  }

  // ✅ [2026-02-22] OpenAI Image API 키 설정
  if ((config as any).openaiImageApiKey && (config as any).openaiImageApiKey.trim()) {
    process.env.OPENAI_IMAGE_API_KEY = (config as any).openaiImageApiKey.trim();
    console.log('[Config] OPENAI_IMAGE_API_KEY 설정됨: ✅');
  }

  // ✅ [2026-02-22] Leonardo AI API 키 설정
  if ((config as any).leonardoaiApiKey && (config as any).leonardoaiApiKey.trim()) {
    process.env.LEONARDOAI_API_KEY = (config as any).leonardoaiApiKey.trim();
    console.log('[Config] LEONARDOAI_API_KEY 설정됨: ✅');
  }



  // ✅ [2026-01-30] DeepInfra API 키 설정
  if (config.deepinfraApiKey && config.deepinfraApiKey.trim()) {
    process.env.DEEPINFRA_API_KEY = config.deepinfraApiKey.trim();
    console.log('[Config] DEEPINFRA_API_KEY 설정됨: ✅');
  }
}

export function validateApiKeyFormat(apiKey: string | undefined, type: 'gemini' | 'openai' | 'pexels' | 'claude'): { valid: boolean; message?: string } {
  if (!apiKey || !apiKey.trim()) {
    return { valid: false, message: `${type === 'gemini' ? 'Gemini' : type === 'openai' ? 'OpenAI' : type === 'pexels' ? 'Pexels' : 'Claude'} API 키가 입력되지 않았습니다.` };
  }

  const trimmed = apiKey.trim();

  switch (type) {
    case 'gemini':
      if (!trimmed.startsWith('AIza')) {
        return { valid: false, message: 'Gemini API 키는 "AIza"로 시작해야 합니다.' };
      }
      if (trimmed.length < 30) {
        return { valid: false, message: 'Gemini API 키가 너무 짧습니다. 올바른 키를 입력해주세요.' };
      }
      break;
  }

  return { valid: true };
}

/**
 * 배포용 초기화 - 민감한 정보를 클리어
 * 배포 시점에 호출하여 개발자의 개인정보가 포함되지 않도록 함
 */
export async function resetConfigForDistribution(): Promise<void> {
  try {
    console.log('[Config] 배포용 초기화 시작...');

    const defaultConfig: AppConfig = {
      // API 키들은 빈 값으로 초기화 (민감 정보)
      geminiApiKey: '',
      unsplashApiKey: '',
      pixabayApiKey: '',
      naverDatalabClientId: '',
      naverDatalabClientSecret: '',

      // 네이버 계정 정보도 초기화 (개발자의 정보가 포함되지 않도록)
      rememberCredentials: false,
      savedNaverId: '',
      savedNaverPassword: '',

      // 라이선스 정보도 초기화
      rememberLicenseCredentials: false,
      savedLicenseUserId: '',
      savedLicensePassword: '',

      // 기본 설정 유지
      dailyPostLimit: 3,
      hideDailyLimitWarning: false,
      enableFreeTrialButton: true,

      // 사용자 프로필 초기화
      userDisplayName: '',
      userEmail: '',
      userTimezone: 'Asia/Seoul',

      // 고급 설정 기본값
      enableDebugMode: false,
      autoSaveDrafts: true,
      backupFrequency: 'weekly',

      // 이미지 소스 기본값 (모두 false로)
      imageSourceUnsplash: false,
      imageSourcePexels: false,
      imageSourcePixabay: false,
      imageSourceWikimedia: false,
      imageSourceNasa: false,
      imageSourceOpenverse: false,
      imageSourceKoreaGov: false,
      imageSourceNewsAgency: false
    };

    await saveConfig(defaultConfig);
    console.log('[Config] 배포용 초기화 완료 - 모든 민감 정보가 클리어되었습니다.');

  } catch (error) {
    console.error('[Config] 배포용 초기화 실패:', error);
    throw error;
  }
}

