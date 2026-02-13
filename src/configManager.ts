import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

export interface AppConfig {
  geminiApiKey?: string;
  geminiModel?: 'gemini-2.0-flash-exp' | 'gemini-2.0-flash' | 'gemini-1.5-flash' | 'gemini-1.5-pro' | string; // ✅ 최신 모델 및 문자열 허용
  openaiApiKey?: string;
  pexelsApiKey?: string;
  unsplashApiKey?: string;
  pixabayApiKey?: string;
  claudeApiKey?: string;
  perplexityApiKey?: string; // ✅ [2026-01-25] Perplexity API 키 추가
  stabilityApiKey?: string; // ✅ Stability AI API Key
  prodiaToken?: string; // ✅ Prodia API Token
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

  // ✅ Fal.ai API (FLUX 이미지 생성)
  falaiApiKey?: string;

  // ✅ DeepInfra API (FLUX-2-dev 고품질 저가)
  deepinfraApiKey?: string;

  // ✅ Gemini 텍스트 생성 주 모델 선택
  primaryGeminiTextModel?: 'gemini-3-pro-preview' | 'gemini-3-flash-preview' | 'gemini-2.5-flash' | string;

  // ✅ 이미지 품질 티어 시스템 (비용 최적화)
  imageQualityMode?: 'balanced' | 'all-budget' | 'all-premium' | 'all-4k';
  thumbnailImageModel?: 'gemini-3-pro-4k' | 'gemini-3-pro' | 'gemini-2.5-flash';
  otherImagesModel?: 'gemini-2.5-flash' | 'gemini-3-pro' | 'gemini-3-pro-4k';
  lockThumbnailTo4K?: boolean; // 기본값 true: 썸네일은 항상 4K 품질

  // ✅ [2026-01-16] 이미지 생성 모델 상세 설정 (환경설정에서 선택)
  // Fal.ai (FLUX 계열)
  falaiModel?: 'flux-schnell' | 'flux-dev' | 'flux-pro' | 'flux-1.1-pro' | 'flux-realism';
  // Stability.AI
  stabilityModel?: 'sdxl-1.0' | 'sd35-flash' | 'sd35-medium' | 'sd35-large-turbo' | 'sd35-large' | 'stable-image-ultra';
  // Nano Banana Pro (Gemini 기반) - 대표/서브/썸네일 별도 설정
  nanoBananaMainModel?: 'gemini-2.5-flash' | 'gemini-3-pro' | 'gemini-3-pro-4k';
  nanoBananaSubModel?: 'gemini-2.5-flash' | 'gemini-3-pro' | 'gemini-3-pro-4k';
  nanoBananaThumbnailModel?: 'gemini-2.5-flash' | 'gemini-3-pro' | 'gemini-3-pro-4k';
  // ✅ [2026-02-08] Prodia v2 API (다양한 모델 지원)
  prodiaModel?: 'sd35' | 'sdxl' | 'flux-schnell' | 'flux-2-dev';
  // Pollinations (무료)
  pollinationsModel?: 'default';
  // 이미지 설정 프리셋
  imagePreset?: 'budget' | 'premium' | 'custom';

  // ✅ [2026-01-25] 전역 AI 제공자 설정
  defaultAiProvider?: 'gemini' | 'perplexity';
  perplexityModel?: 'sonar' | 'sonar-pro';
}

const CONFIG_FILE = 'settings.json';

let cachedConfig: AppConfig | null = null;
let configPath: string | null = null;

async function ensureConfigPath(): Promise<string> {
  if (configPath) {
    return configPath;
  }

  if (!app.isReady()) {
    await app.whenReady();
  }

  configPath = path.join(app.getPath('userData'), CONFIG_FILE);

  // ✅ 사용자가 입력한 설정은 항상 유지됨
  // 초기화는 배포팩 생성 시 scripts/reset-config-for-pack.js에서만 수행
  console.log('[Config] 설정 파일 경로:', configPath);

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

    // ✅ [2026-01-28 FIX] 구 모델명을 새 Gemini 3 모델로 마이그레이션
    // gemini-1.5-pro, gemini-1.5-flash는 Google API v1beta에서 더 이상 지원되지 않음
    let geminiModel = parsed.geminiModel;
    const DEPRECATED_MODELS = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro', 'gemini-pro-vision'];
    if (geminiModel && DEPRECATED_MODELS.some(m => geminiModel.includes(m))) {
      const oldModel = geminiModel;
      geminiModel = 'gemini-3-flash-preview';  // 새 기본 모델로 자동 전환
      console.log(`[Config] ⚠️ 구 모델(${oldModel}) → 새 모델(${geminiModel})로 자동 마이그레이션`);
    }

    // 하이픈 형식 키를 카멜케이스로 변환 (하위 호환성)
    const normalizedConfig: AppConfig = {
      ...parsed,
      geminiModel: geminiModel as any, // ✅ 변환된 모델 적용
      // 하이픈 형식 키가 있으면 카멜케이스로 변환 (값이 있으면 우선 사용)
      geminiApiKey: parsed.geminiApiKey || parsed['gemini-api-key'] || undefined,
      openaiApiKey: parsed.openaiApiKey || parsed['openai-api-key'] || undefined,
      claudeApiKey: parsed.claudeApiKey || parsed['claude-api-key'] || undefined,
      pexelsApiKey: parsed.pexelsApiKey || parsed['pexels-api-key'] || undefined,
      prodiaToken: parsed.prodiaToken || parsed['prodia-token'] || undefined,
      unsplashApiKey: parsed.unsplashApiKey || parsed['unsplash-api-key'] || undefined,
      pixabayApiKey: parsed.pixabayApiKey || parsed['pixabay-api-key'] || undefined,
      stabilityApiKey: parsed.stabilityApiKey || parsed['stability-api-key'] || undefined, // ✅ Stability AI 추가
      naverDatalabClientId: parsed.naverDatalabClientId || parsed['naver-datalab-client-id'] || undefined,
      naverDatalabClientSecret: parsed.naverDatalabClientSecret || parsed['naver-datalab-client-secret'] || undefined,
      // ✅ [2026-01-25] 네이버 검색 API 키 추가
      naverClientId: parsed.naverClientId || parsed['naver-client-id'] || undefined,
      naverClientSecret: parsed.naverClientSecret || parsed['naver-client-secret'] || undefined,
      // ✅ 네이버 광고 API (키워드 도구)
      naverAdApiKey: parsed.naverAdApiKey || undefined,
      naverAdSecretKey: parsed.naverAdSecretKey || undefined,
      naverAdCustomerId: parsed.naverAdCustomerId || undefined,
      // ✅ Fal.ai API 키 추가
      falaiApiKey: parsed.falaiApiKey || parsed['falai-api-key'] || undefined,
      // ✅ [2026-01-25] Perplexity API 키 추가
      perplexityApiKey: parsed.perplexityApiKey || parsed['perplexity-api-key'] || undefined,
      // ✅ [2026-01-26] DeepInfra API 키 추가
      deepinfraApiKey: parsed.deepinfraApiKey || parsed['deepinfra-api-key'] || undefined,
      // ✅ [2026-02-08] 이미지 엔진 모델 설정 명시적 파싱
      deepinfraModel: parsed.deepinfraModel || undefined,
      falaiModel: parsed.falaiModel || undefined,
      stabilityModel: parsed.stabilityModel || undefined,
      prodiaModel: parsed.prodiaModel || undefined,
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
      'stability-api-key': normalizedConfig.stabilityApiKey,
      'prodia-token': normalizedConfig.prodiaToken,
      'unsplash-api-key': normalizedConfig.unsplashApiKey,
      'pixabay-api-key': normalizedConfig.pixabayApiKey,
      'naver-datalab-client-id': normalizedConfig.naverDatalabClientId,
      'naver-datalab-client-secret': normalizedConfig.naverDatalabClientSecret,
      // ✅ Fal.ai 키 호환성
      'falai-api-key': (normalizedConfig as any).falaiApiKey,
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
      console.log('[Config] Gemini API 키 존재:', compatibleConfig.geminiApiKey.substring(0, 10) + '...');
    }
    if (compatibleConfig.openaiApiKey) {
      console.log('[Config] OpenAI API 키 존재:', compatibleConfig.openaiApiKey.substring(0, 10) + '...');
    }
    if (compatibleConfig.claudeApiKey) {
      console.log('[Config] Claude API 키 존재:', compatibleConfig.claudeApiKey.substring(0, 10) + '...');
    }
    if (compatibleConfig.pexelsApiKey) {
      console.log('[Config] Pexels API 키 존재:', compatibleConfig.pexelsApiKey.substring(0, 10) + '...');
    }
    if (compatibleConfig.stabilityApiKey) {
      console.log('[Config] Stability AI API 키 존재:', compatibleConfig.stabilityApiKey.substring(0, 10) + '...');
    }
    // 네이버 아이디/비밀번호 저장 상태 확인
    if (compatibleConfig.savedNaverId) {
      console.log('[Config] 저장된 네이버 아이디 존재:', compatibleConfig.savedNaverId.substring(0, 3) + '***');
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
          stabilityApiKey: '', // ✅ Stability AI 추가
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
  const filePath = await ensureConfigPath();
  cachedConfig = {
    ...cachedConfig,
    ...update,
  };

  // Remove empty strings to avoid clutter
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
  return cachedConfig;
}

export function applyConfigToEnv(config: AppConfig): void {
  // API 키 설정 (빈 문자열이 아닌 경우만 주입, 기존 .env 값 보존을 위해 삭제는 하지 않음)
  if (config.geminiApiKey && config.geminiApiKey.trim()) {
    process.env.GEMINI_API_KEY = config.geminiApiKey.trim();
    console.log('[Config] GEMINI_API_KEY 설정됨 (길이:', config.geminiApiKey.trim().length, ')');
  }

  if (config.prodiaToken && config.prodiaToken.trim()) {
    process.env.PRODIA_TOKEN = config.prodiaToken.trim();
  } else {
    delete process.env.PRODIA_TOKEN;
  }

  // ✅ Gemini 모델 설정 (2026-01-04: 강제 변환 제거, 화읷성 최우선)
  // 사용자가 직접 선택한 모델을 존중하고, 실패 시 폴백 로직이 처리
  const geminiModel = config.primaryGeminiTextModel || config.geminiModel;
  if (geminiModel) {
    process.env.GEMINI_MODEL = geminiModel;
    console.log('[Config] GEMINI_MODEL 설정됨:', geminiModel);
  }

  if (config.openaiApiKey && config.openaiApiKey.trim()) {
    process.env.OPENAI_API_KEY = config.openaiApiKey.trim();
  } else {
    delete process.env.OPENAI_API_KEY;
  }

  if (config.pexelsApiKey && config.pexelsApiKey.trim()) {
    process.env.PEXELS_API_KEY = config.pexelsApiKey.trim();
  } else {
    delete process.env.PEXELS_API_KEY;
  }

  if (config.claudeApiKey && config.claudeApiKey.trim()) {
    process.env.CLAUDE_API_KEY = config.claudeApiKey.trim();
  } else {
    delete process.env.CLAUDE_API_KEY;
  }

  if (config.stabilityApiKey && config.stabilityApiKey.trim()) {
    process.env.STABILITY_API_KEY = config.stabilityApiKey.trim();
    console.log('[Config] STABILITY_API_KEY 설정됨 (길이:', config.stabilityApiKey.trim().length, ')');
  }

  // ✅ [2026-01-25] Perplexity API 키 설정
  if (config.perplexityApiKey && config.perplexityApiKey.trim()) {
    process.env.PERPLEXITY_API_KEY = config.perplexityApiKey.trim();
    console.log('[Config] PERPLEXITY_API_KEY 설정됨 (길이:', config.perplexityApiKey.trim().length, ')');
  } else {
    delete process.env.PERPLEXITY_API_KEY;
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
      console.log('[Config] NAVER_ID 환경변수 설정됨:', config.savedNaverId.substring(0, 3) + '***');
    }
    if (config.savedNaverPassword) {
      process.env.NAVER_PASSWORD = config.savedNaverPassword;
      console.log('[Config] NAVER_PASSWORD 환경변수 설정됨 (길이:', config.savedNaverPassword.length, ')');
    }
  } else {
    delete process.env.NAVER_ID;
    delete process.env.NAVER_PASSWORD;
    console.log('[Config] rememberCredentials가 false이므로 환경변수 제거됨');
  }

  // ✅ Fal.ai API 키 설정
  if ((config as any).falaiApiKey && (config as any).falaiApiKey.trim()) {
    process.env.FALAI_API_KEY = (config as any).falaiApiKey.trim();
    console.log('[Config] FALAI_API_KEY 설정됨 (길이:', (config as any).falaiApiKey.trim().length, ')');
  }

  // ✅ [2026-01-30] DeepInfra API 키 설정
  if (config.deepinfraApiKey && config.deepinfraApiKey.trim()) {
    process.env.DEEPINFRA_API_KEY = config.deepinfraApiKey.trim();
    console.log('[Config] DEEPINFRA_API_KEY 설정됨 (길이:', config.deepinfraApiKey.trim().length, ')');
  } else {
    delete process.env.DEEPINFRA_API_KEY;
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

