"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.getConfigSync = getConfigSync;
exports.saveConfig = saveConfig;
exports.applyConfigToEnv = applyConfigToEnv;
exports.validateApiKeyFormat = validateApiKeyFormat;
exports.resetConfigForDistribution = resetConfigForDistribution;
var electron_1 = require("electron");
var promises_1 = __importDefault(require("fs/promises"));
var path_1 = __importDefault(require("path"));
var CONFIG_FILE = 'settings.json';
var cachedConfig = null;
var configPath = null;
/** ✅ [2026-02-26] 계정별 설정 파일 지원 */
var _activeUserId = '';
var _userConfigPaths = new Map();
function ensureConfigPath(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var targetUserId, cached, userConfigFile, userPath, _a, defaultPath, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!!electron_1.app.isReady()) return [3 /*break*/, 2];
                    return [4 /*yield*/, electron_1.app.whenReady()];
                case 1:
                    _c.sent();
                    _c.label = 2;
                case 2:
                    targetUserId = userId || _activeUserId;
                    if (!targetUserId) return [3 /*break*/, 12];
                    cached = _userConfigPaths.get(targetUserId);
                    if (cached)
                        return [2 /*return*/, cached];
                    userConfigFile = "settings_".concat(targetUserId.replace(/[^a-zA-Z0-9_-]/g, '_'), ".json");
                    userPath = path_1.default.join(electron_1.app.getPath('userData'), userConfigFile);
                    _userConfigPaths.set(targetUserId, userPath);
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 5, , 11]);
                    return [4 /*yield*/, promises_1.default.access(userPath)];
                case 4:
                    _c.sent();
                    return [3 /*break*/, 11];
                case 5:
                    _a = _c.sent();
                    defaultPath = path_1.default.join(electron_1.app.getPath('userData'), CONFIG_FILE);
                    _c.label = 6;
                case 6:
                    _c.trys.push([6, 9, , 10]);
                    return [4 /*yield*/, promises_1.default.access(defaultPath)];
                case 7:
                    _c.sent();
                    return [4 /*yield*/, promises_1.default.copyFile(defaultPath, userPath)];
                case 8:
                    _c.sent();
                    console.log("[Config] \uD83D\uDD04 \uAE30\uBCF8 \uC124\uC815 \u2192 \uACC4\uC815\uBCC4 \uC124\uC815 \uB9C8\uC774\uADF8\uB808\uC774\uC158 \uC644\uB8CC: ".concat(userConfigFile));
                    return [3 /*break*/, 10];
                case 9:
                    _b = _c.sent();
                    console.log("[Config] \uD83D\uDCC4 \uC0C8 \uACC4\uC815 \uC124\uC815 \uD30C\uC77C \uC0DD\uC131 \uC608\uC815: ".concat(userConfigFile));
                    return [3 /*break*/, 10];
                case 10: return [3 /*break*/, 11];
                case 11:
                    console.log("[Config] \uC124\uC815 \uD30C\uC77C \uACBD\uB85C (\uACC4\uC815: ".concat(targetUserId, "):"), userPath);
                    return [2 /*return*/, userPath];
                case 12:
                    // 기본 경로
                    if (configPath)
                        return [2 /*return*/, configPath];
                    configPath = path_1.default.join(electron_1.app.getPath('userData'), CONFIG_FILE);
                    console.log('[Config] 설정 파일 경로:', configPath);
                    return [2 /*return*/, configPath];
            }
        });
    });
}
function loadConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var filePath, isPackaged, raw, parsed, geminiModel_1, DEPRECATED_MODELS, oldModel, normalizedConfig_1, hasHyphenKeys, migratedConfig, migrateError_1, compatibleConfig, error_1, err, defaultConfig, writeError_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureConfigPath()];
                case 1:
                    filePath = _a.sent();
                    isPackaged = electron_1.app.isPackaged;
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 8, , 16]);
                    return [4 /*yield*/, promises_1.default.readFile(filePath, 'utf-8')];
                case 3:
                    raw = _a.sent();
                    parsed = JSON.parse(raw);
                    // ✅ 사용자가 입력한 API 키는 항상 유지됨
                    // 초기화는 배포팩 생성 시 scripts/reset-config-for-pack.js에서만 수행
                    // 앱 실행 시에는 사용자 설정을 절대 초기화하지 않음
                    if (isPackaged) {
                        console.log('[Config] 📦 패키지 모드: 사용자 설정 유지');
                    }
                    geminiModel_1 = parsed.geminiModel;
                    DEPRECATED_MODELS = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro', 'gemini-pro-vision'];
                    if (geminiModel_1 && DEPRECATED_MODELS.some(function (m) { return geminiModel_1.includes(m); })) {
                        oldModel = geminiModel_1;
                        geminiModel_1 = 'gemini-3-flash-preview'; // 새 기본 모델로 자동 전환
                        console.log("[Config] \u26A0\uFE0F \uAD6C \uBAA8\uB378(".concat(oldModel, ") \u2192 \uC0C8 \uBAA8\uB378(").concat(geminiModel_1, ")\uB85C \uC790\uB3D9 \uB9C8\uC774\uADF8\uB808\uC774\uC158"));
                    }
                    normalizedConfig_1 = __assign(__assign({}, parsed), { geminiModel: geminiModel_1, 
                        // 하이픈 형식 키가 있으면 카멜케이스로 변환 (값이 있으면 우선 사용)
                        geminiApiKey: parsed.geminiApiKey || parsed['gemini-api-key'] || undefined, openaiApiKey: parsed.openaiApiKey || parsed['openai-api-key'] || undefined, claudeApiKey: parsed.claudeApiKey || parsed['claude-api-key'] || undefined, pexelsApiKey: parsed.pexelsApiKey || parsed['pexels-api-key'] || undefined, prodiaToken: undefined, unsplashApiKey: parsed.unsplashApiKey || parsed['unsplash-api-key'] || undefined, pixabayApiKey: parsed.pixabayApiKey || parsed['pixabay-api-key'] || undefined, stabilityApiKey: undefined, naverDatalabClientId: parsed.naverDatalabClientId || parsed['naver-datalab-client-id'] || undefined, naverDatalabClientSecret: parsed.naverDatalabClientSecret || parsed['naver-datalab-client-secret'] || undefined, 
                        // ✅ [2026-01-25] 네이버 검색 API 키 추가
                        naverClientId: parsed.naverClientId || parsed['naver-client-id'] || undefined, naverClientSecret: parsed.naverClientSecret || parsed['naver-client-secret'] || undefined, 
                        // ✅ 네이버 광고 API (키워드 도구)
                        naverAdApiKey: parsed.naverAdApiKey || undefined, naverAdSecretKey: parsed.naverAdSecretKey || undefined, naverAdCustomerId: parsed.naverAdCustomerId || undefined, 
                        // ✅ [2026-02-22] 새 이미지 프로바이더 API 키
                        openaiImageApiKey: parsed.openaiImageApiKey || undefined, leonardoaiApiKey: parsed.leonardoaiApiKey || undefined, leonardoaiModel: parsed.leonardoaiModel || undefined, 
                        // ✅ [2026-01-25] Perplexity API 키 추가
                        perplexityApiKey: parsed.perplexityApiKey || parsed['perplexity-api-key'] || undefined, 
                        // ✅ [2026-01-26] DeepInfra API 키 추가
                        deepinfraApiKey: parsed.deepinfraApiKey || parsed['deepinfra-api-key'] || undefined, 
                        // ✅ [2026-02-08] 이미지 엔진 모델 설정 명시적 파싱
                        deepinfraModel: parsed.deepinfraModel || undefined });
                    // 빈 문자열 제거 및 undefined 제거
                    Object.keys(normalizedConfig_1).forEach(function (key) {
                        var typedKey = key;
                        var value = normalizedConfig_1[typedKey];
                        if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
                            delete normalizedConfig_1[typedKey];
                        }
                    });
                    hasHyphenKeys = parsed['gemini-api-key'] || parsed['openai-api-key'] || parsed['claude-api-key'] || parsed['pexels-api-key'];
                    if (!(hasHyphenKeys && !isPackaged)) return [3 /*break*/, 7];
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 6, , 7]);
                    migratedConfig = __assign({}, normalizedConfig_1);
                    delete migratedConfig['gemini-api-key'];
                    delete migratedConfig['openai-api-key'];
                    delete migratedConfig['claude-api-key'];
                    delete migratedConfig['pexels-api-key'];
                    delete migratedConfig['unsplash-api-key'];
                    delete migratedConfig['pixabay-api-key'];
                    delete migratedConfig['naver-datalab-client-id'];
                    delete migratedConfig['naver-datalab-client-secret'];
                    return [4 /*yield*/, promises_1.default.writeFile(filePath, JSON.stringify(migratedConfig, null, 2), 'utf-8')];
                case 5:
                    _a.sent();
                    console.log('[Config] 하이픈 형식 키를 카멜케이스로 마이그레이션 완료');
                    return [3 /*break*/, 7];
                case 6:
                    migrateError_1 = _a.sent();
                    console.error('[Config] 마이그레이션 실패 (계속 진행):', migrateError_1);
                    return [3 /*break*/, 7];
                case 7:
                    compatibleConfig = __assign(__assign({}, normalizedConfig_1), { 
                        // usage videos list maintenance
                        tutorialVideos: parsed.tutorialVideos || [], 
                        // 카멜케이스와 하이픈 형식 모두 제공
                        'gemini-api-key': normalizedConfig_1.geminiApiKey, 'openai-api-key': normalizedConfig_1.openaiApiKey, 'claude-api-key': normalizedConfig_1.claudeApiKey, 'pexels-api-key': normalizedConfig_1.pexelsApiKey, 
                        // (deprecated keys removed: stability, prodia, falai)
                        'unsplash-api-key': normalizedConfig_1.unsplashApiKey, 
                        // ✅ [2026-01-25] 네이버 검색 API 키 호환성
                        'naver-client-id': normalizedConfig_1.naverClientId || normalizedConfig_1.naverDatalabClientId, 'naver-client-secret': normalizedConfig_1.naverClientSecret || normalizedConfig_1.naverDatalabClientSecret, 
                        // ✅ [2026-01-25] Perplexity API 키 호환성
                        'perplexity-api-key': normalizedConfig_1.perplexityApiKey, 
                        // ✅ [2026-01-25] 네이버 광고 API 키 호환성 (검색광고 키워드 도구)
                        'naver-ad-api-key': normalizedConfig_1.naverAdApiKey, 'naver-ad-secret-key': normalizedConfig_1.naverAdSecretKey, 'naver-ad-customer-id': normalizedConfig_1.naverAdCustomerId, 
                        // ✅ [2026-01-26] DeepInfra API 키 호환성
                        'deepinfra-api-key': normalizedConfig_1.deepinfraApiKey });
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
                    // 네이버 아이디/비밀번호 저장 상태 확인
                    if (compatibleConfig.savedNaverId) {
                        console.log('[Config] 저장된 네이버 아이디 존재:', compatibleConfig.savedNaverId.substring(0, 3) + '***');
                    }
                    if (compatibleConfig.savedNaverPassword) {
                        console.log('[Config] 저장된 네이버 비밀번호 존재:', '***');
                    }
                    console.log('[Config] rememberCredentials:', compatibleConfig.rememberCredentials);
                    return [2 /*return*/, compatibleConfig];
                case 8:
                    error_1 = _a.sent();
                    err = error_1;
                    if (!(err.code === 'ENOENT')) return [3 /*break*/, 14];
                    console.log('[Config] 설정 파일이 없습니다. 새로 생성합니다:', filePath);
                    if (!isPackaged) return [3 /*break*/, 13];
                    defaultConfig = {
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
                    _a.label = 9;
                case 9:
                    _a.trys.push([9, 11, , 12]);
                    return [4 /*yield*/, promises_1.default.writeFile(filePath, JSON.stringify(defaultConfig, null, 2), 'utf-8')];
                case 10:
                    _a.sent();
                    console.log('[Config] 배포 모드: 기본 설정 파일 생성 완료 (모든 민감 정보 없음)');
                    return [3 /*break*/, 12];
                case 11:
                    writeError_1 = _a.sent();
                    console.error('[Config] 기본 설정 파일 생성 실패:', writeError_1);
                    return [3 /*break*/, 12];
                case 12:
                    cachedConfig = defaultConfig;
                    return [2 /*return*/, defaultConfig];
                case 13: return [3 /*break*/, 15];
                case 14:
                    console.error('[Config] 설정 파일 읽기 실패:', err.message);
                    console.error('[Config] 파일 경로:', filePath);
                    _a.label = 15;
                case 15:
                    cachedConfig = {};
                    return [2 /*return*/, cachedConfig];
                case 16: return [2 /*return*/];
            }
        });
    });
}
function getConfigSync() {
    return cachedConfig !== null && cachedConfig !== void 0 ? cachedConfig : {};
}
function saveConfig(update) {
    return __awaiter(this, void 0, void 0, function () {
        var updateAny, loaded, filePath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    updateAny = update;
                    if (!(updateAny.__userId && typeof updateAny.__userId === 'string')) return [3 /*break*/, 2];
                    _activeUserId = updateAny.__userId;
                    delete updateAny.__userId;
                    // 캐시 초기화하여 계정별 파일에서 새로 로드하도록
                    cachedConfig = null;
                    console.log("[Config] \u2705 \uACC4\uC815\uBCC4 \uC124\uC815 \uBAA8\uB4DC \uD65C\uC131\uD654: ".concat(_activeUserId));
                    return [4 /*yield*/, loadConfig()];
                case 1:
                    loaded = _a.sent();
                    cachedConfig = __assign(__assign({}, loaded), updateAny);
                    return [3 /*break*/, 3];
                case 2:
                    cachedConfig = __assign(__assign({}, cachedConfig), update);
                    _a.label = 3;
                case 3: return [4 /*yield*/, ensureConfigPath()];
                case 4:
                    filePath = _a.sent();
                    // Remove empty strings to avoid clutter
                    if (!cachedConfig)
                        cachedConfig = {};
                    Object.keys(cachedConfig).forEach(function (key) {
                        var typedKey = key;
                        var value = cachedConfig === null || cachedConfig === void 0 ? void 0 : cachedConfig[typedKey];
                        if (typeof value === 'string' && value.trim() === '') {
                            cachedConfig === null || cachedConfig === void 0 ? true : delete cachedConfig[typedKey];
                        }
                    });
                    // rememberCredentials가 false이고 저장된 값도 없을 때만 삭제
                    // 저장된 값이 있으면 rememberCredentials를 true로 설정
                    if ((cachedConfig === null || cachedConfig === void 0 ? void 0 : cachedConfig.savedNaverId) || (cachedConfig === null || cachedConfig === void 0 ? void 0 : cachedConfig.savedNaverPassword)) {
                        cachedConfig = __assign(__assign({}, cachedConfig), { rememberCredentials: true });
                    }
                    else if (!(cachedConfig === null || cachedConfig === void 0 ? void 0 : cachedConfig.rememberCredentials)) {
                        // 저장된 값도 없고 rememberCredentials도 false면 정리
                        cachedConfig === null || cachedConfig === void 0 ? true : delete cachedConfig.savedNaverId;
                        cachedConfig === null || cachedConfig === void 0 ? true : delete cachedConfig.savedNaverPassword;
                        cachedConfig = __assign(__assign({}, cachedConfig), { rememberCredentials: false });
                    }
                    if (!(cachedConfig === null || cachedConfig === void 0 ? void 0 : cachedConfig.rememberLicenseCredentials)) {
                        cachedConfig === null || cachedConfig === void 0 ? true : delete cachedConfig.savedLicenseUserId;
                        cachedConfig === null || cachedConfig === void 0 ? true : delete cachedConfig.savedLicensePassword;
                        cachedConfig = __assign(__assign({}, cachedConfig), { rememberLicenseCredentials: false });
                    }
                    return [4 /*yield*/, promises_1.default.writeFile(filePath, JSON.stringify(cachedConfig, null, 2), 'utf-8')];
                case 5:
                    _a.sent();
                    return [2 /*return*/, cachedConfig];
            }
        });
    });
}
function applyConfigToEnv(config) {
    // API 키 설정 (빈 문자열이 아닌 경우만 주입, 기존 .env 값 보존을 위해 삭제는 하지 않음)
    if (config.geminiApiKey && config.geminiApiKey.trim()) {
        process.env.GEMINI_API_KEY = config.geminiApiKey.trim();
        console.log('[Config] GEMINI_API_KEY 설정됨 (길이:', config.geminiApiKey.trim().length, ')');
    }
    // (removed prodiaToken env injection - deprecated)
    // ✅ Gemini 모델 설정 (2026-01-04: 강제 변환 제거, 화읷성 최우선)
    // 사용자가 직접 선택한 모델을 존중하고, 실패 시 폴백 로직이 처리
    var geminiModel = config.primaryGeminiTextModel || config.geminiModel;
    if (geminiModel) {
        process.env.GEMINI_MODEL = geminiModel;
        console.log('[Config] GEMINI_MODEL 설정됨:', geminiModel);
    }
    if (config.openaiApiKey && config.openaiApiKey.trim()) {
        process.env.OPENAI_API_KEY = config.openaiApiKey.trim();
    }
    else {
        delete process.env.OPENAI_API_KEY;
    }
    if (config.pexelsApiKey && config.pexelsApiKey.trim()) {
        process.env.PEXELS_API_KEY = config.pexelsApiKey.trim();
    }
    else {
        delete process.env.PEXELS_API_KEY;
    }
    if (config.claudeApiKey && config.claudeApiKey.trim()) {
        process.env.CLAUDE_API_KEY = config.claudeApiKey.trim();
    }
    else {
        delete process.env.CLAUDE_API_KEY;
    }
    // (removed stabilityApiKey env injection - deprecated)
    // ✅ [2026-01-25] Perplexity API 키 설정
    if (config.perplexityApiKey && config.perplexityApiKey.trim()) {
        process.env.PERPLEXITY_API_KEY = config.perplexityApiKey.trim();
        console.log('[Config] PERPLEXITY_API_KEY 설정됨 (길이:', config.perplexityApiKey.trim().length, ')');
    }
    else {
        delete process.env.PERPLEXITY_API_KEY;
    }
    // ✅ 네이버 검색 API (sourceAssembler, blogAccountManager 등에서 사용)
    var ncid = config.naverClientId || config.naverDatalabClientId;
    var ncsec = config.naverClientSecret || config.naverDatalabClientSecret;
    if (ncid && ncid.trim()) {
        var cid = ncid.trim();
        process.env.NAVER_CLIENT_ID = cid;
        process.env.NAVER_CLIENT_ID_SEARCH = cid; // 앨리어싱
        console.log('[Config] NAVER_CLIENT_ID 설정됨');
    }
    if (ncsec && ncsec.trim()) {
        var csec = ncsec.trim();
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
    }
    else {
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
    }
    else {
        delete process.env.NAVER_ID;
        delete process.env.NAVER_PASSWORD;
        console.log('[Config] rememberCredentials가 false이므로 환경변수 제거됨');
    }
    // ✅ [2026-02-22] OpenAI Image API 키 설정
    if (config.openaiImageApiKey && config.openaiImageApiKey.trim()) {
        process.env.OPENAI_IMAGE_API_KEY = config.openaiImageApiKey.trim();
        console.log('[Config] OPENAI_IMAGE_API_KEY 설정됨 (길이:', config.openaiImageApiKey.trim().length, ')');
    }
    // ✅ [2026-02-22] Leonardo AI API 키 설정
    if (config.leonardoaiApiKey && config.leonardoaiApiKey.trim()) {
        process.env.LEONARDOAI_API_KEY = config.leonardoaiApiKey.trim();
        console.log('[Config] LEONARDOAI_API_KEY 설정됨 (길이:', config.leonardoaiApiKey.trim().length, ')');
    }
    // ✅ [2026-01-30] DeepInfra API 키 설정
    if (config.deepinfraApiKey && config.deepinfraApiKey.trim()) {
        process.env.DEEPINFRA_API_KEY = config.deepinfraApiKey.trim();
        console.log('[Config] DEEPINFRA_API_KEY 설정됨 (길이:', config.deepinfraApiKey.trim().length, ')');
    }
    else {
        delete process.env.DEEPINFRA_API_KEY;
    }
}
function validateApiKeyFormat(apiKey, type) {
    if (!apiKey || !apiKey.trim()) {
        return { valid: false, message: "".concat(type === 'gemini' ? 'Gemini' : type === 'openai' ? 'OpenAI' : type === 'pexels' ? 'Pexels' : 'Claude', " API \uD0A4\uAC00 \uC785\uB825\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.") };
    }
    var trimmed = apiKey.trim();
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
function resetConfigForDistribution() {
    return __awaiter(this, void 0, void 0, function () {
        var defaultConfig, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    console.log('[Config] 배포용 초기화 시작...');
                    defaultConfig = {
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
                    return [4 /*yield*/, saveConfig(defaultConfig)];
                case 1:
                    _a.sent();
                    console.log('[Config] 배포용 초기화 완료 - 모든 민감 정보가 클리어되었습니다.');
                    return [3 /*break*/, 3];
                case 2:
                    error_2 = _a.sent();
                    console.error('[Config] 배포용 초기화 실패:', error_2);
                    throw error_2;
                case 3: return [2 /*return*/];
            }
        });
    });
}
