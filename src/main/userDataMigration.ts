/**
 * userDataMigration — userData 폴더 분기 회복 + 미러 백업/복원
 *
 * 배경:
 *   package.json: productName "Better Life Naver"
 *   main.ts: app.setName('better-life-naver')
 *   → Electron이 app.getName()을 사용해 userData 경로 결정.
 *     setName 호출 전후 시점에 따라 두 폴더가 동시에 생성될 수 있어
 *     사용자가 업데이트 후 키가 사라진 것처럼 인식.
 *
 * 본 모듈은:
 *   1) startup 시 sibling 폴더(productName 기반)에 데이터가 있으면
 *      현재 active 폴더로 이주 (없거나 비어있는 경우만)
 *   2) saveConfig 직후 Documents/_safe/ 미러 백업
 *   3) 시작 시 settings.json이 비어있으면 미러에서 자동 복원
 */

import * as fs from 'fs';
import * as path from 'path';

// [v2.10.275] Session folder mirror blacklist — prevents 17s freeze from GB-scale session dirs.
// playwright/puppeteer sessions can be re-created by re-login, so mirroring them is not worth the I/O cost.
//
// Pattern groups:
//   - session prefixes: `xxx-session` / `xxx-session-yyy` style folders (any suffix allowed)
//   - chromium profiles: imagefx-chrome-profile, flow-chromium-profile (synced with SESSION_FOLDER_PREFIXES below)
//   - chromium internal GB-scale caches: GPUCache, Cache, Code Cache, Service Worker (explicit names — no greedy .*)
const SESSION_MIRROR_BLACKLIST_EXACT = new Set([
    'GPUCache',
    'Cache',
    'Code Cache',
    'Service Worker',
    'IndexedDB',
    'Local Storage',
    'Session Storage',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'ShaderCache',
]);
const SESSION_MIRROR_BLACKLIST_PREFIX = [
    'playwright-session',
    'puppeteer-session',
    'imagefx-chrome-profile',
    'flow-chromium-profile',
];

function isSessionFolder(name: string): boolean {
    if (SESSION_MIRROR_BLACKLIST_EXACT.has(name)) return true;
    for (const prefix of SESSION_MIRROR_BLACKLIST_PREFIX) {
        if (name === prefix || name.startsWith(prefix + '-') || name.startsWith(prefix + '_')) {
            return true;
        }
    }
    return false;
}

// Deduplication guards — prevent concurrent or rapid-repeat mirror runs.
let _mirrorInFlight = false;
let _lastMirrorAt = 0;
const MIRROR_TTL_MS = 60_000; // suppress repeat calls within 1 minute

const SIBLING_FOLDER_NAME = 'Better Life Naver';
// ✅ [v2.9.2] 전수 보호 — userData 내 모든 사용자 데이터 파일 미러 대상화
const TARGET_FILES = [
    'settings.json',           // API 키, 자격증명
    'blog-accounts.json',      // 블로그 계정
    'scheduled-posts.json',    // 스케줄
    '.last_active_user',       // 마지막 활성 사용자
    '.last-version',           // 마지막 버전 (마이그레이션 추적)
    'config.json',             // 앱 설정
    'feature_flag_log.json',   // 학습/통계 데이터
];
// ✅ [v2.9.3] 미러 대상 폴더 — 모든 사용자 데이터/세션/학습 (캐시만 제외)
const TARGET_FOLDERS = [
    'Local Storage',           // localStorage (생성된 글 목록 등)
    'WebStorage',              // Web Storage API
    'Session Storage',         // 세션 storage (일부 영구 데이터)
    'license',                 // 라이선스 파일
    // ✅ [v2.9.3] 학습/통계 데이터 (사용자가 누적한 가치)
    'title-metrics',           // 제목 통계 학습 데이터
    'style-previews',          // 스타일 미리보기 (학습 자료)
    'session-events',          // 세션 이벤트 로그
];
// ✅ [v2.9.3] 자동화 세션 폴더 — 네이버 로그인 + 캡차 통과 결과 보존
//   가장 중요: 누락 시 매 업데이트마다 사용자가 캡차 + 재로그인 강제됨
const SESSION_FOLDER_PREFIXES = [
    'playwright-session',      // playwright-session, playwright-session-*, etc.
    'puppeteer-session',       // puppeteer-session-*
    'flow-chromium-profile',   // Google Labs Flow 엔진 세션
    'imagefx-chrome-profile',  // ImageFX 엔진 세션
];
// ✅ [v2.9.2] Network 폴더 내 Cookies 파일만 미러
const NETWORK_COOKIES_FILES = ['Cookies', 'Cookies-journal'];
// ✅ [v2.9.3] 추가 단일 파일 미러 — 헤딩 메타 + Electron 환경
const TARGET_FILES_EXTRA = [
    'heading-images.json',     // 헤딩별 이미지 매핑
    'heading-videos.json',     // 헤딩별 비디오 매핑
    'Preferences',             // Electron window 위치/크기 등
];
// ✅ [v2.8.1] 보존 가치 있는 모든 필드 — API 키 + 계정 + 라이선스 자격증명 + 사용자 프로필
const PRESERVE_FIELDS = [
    'geminiApiKey', 'geminiApiKeys', 'openaiApiKey', 'claudeApiKey',
    'perplexityApiKey', 'pexelsApiKey', 'unsplashApiKey', 'pixabayApiKey',
    'deepinfraApiKey', 'openaiImageApiKey', 'leonardoaiApiKey',
    'naverDatalabClientId', 'naverDatalabClientSecret',
    'naverClientId', 'naverClientSecret',
    'naverAdApiKey', 'naverAdSecretKey', 'naverAdCustomerId',
    'rememberCredentials', 'savedNaverId', 'savedNaverPassword',
    'rememberLicenseCredentials', 'savedLicenseUserId', 'savedLicensePassword',
    'userDisplayName', 'userEmail',
    'geminiModel', 'primaryGeminiTextModel', 'defaultAiProvider',
    'perplexityModel', 'geminiPlanType',
    'customImageSavePath',
];

function hasPreservedValue(cfg: any): boolean {
    if (!cfg || typeof cfg !== 'object') return false;
    for (const k of PRESERVE_FIELDS) {
        const v = cfg[k];
        if (typeof v === 'string' && v.trim().length > 0) return true;
        if (Array.isArray(v) && v.length > 0) return true;
    }
    return false;
}

/**
 * ✅ [v2.8.1] settings.json 필드 머지 — dst 우선, dst에 비어있는 필드만 src에서 보충
 * API 키만 살아남아도 라이선스 ID/PW/네이버 계정 등 다른 필드가 사라지지 않도록.
 */
function mergeSettingsPreserveDst(srcPath: string, dstPath: string): boolean {
    try {
        const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
        let dst: any = {};
        if (fs.existsSync(dstPath)) {
            try { dst = JSON.parse(fs.readFileSync(dstPath, 'utf8')); } catch { dst = {}; }
        }
        let changed = false;
        for (const k of PRESERVE_FIELDS) {
            const srcV = src[k];
            const dstV = dst[k];
            const srcHas = (typeof srcV === 'string' && srcV.trim().length > 0)
                || (Array.isArray(srcV) && srcV.length > 0)
                || (typeof srcV === 'boolean' && srcV !== undefined);
            const dstHas = (typeof dstV === 'string' && dstV.trim().length > 0)
                || (Array.isArray(dstV) && dstV.length > 0)
                || (typeof dstV === 'boolean' && dstV !== undefined);
            if (srcHas && !dstHas) {
                dst[k] = srcV;
                changed = true;
            }
        }
        if (changed) {
            fs.writeFileSync(dstPath, JSON.stringify(dst, null, 2), 'utf8');
        }
        return changed;
    } catch (e: any) {
        console.warn(`[UserDataMigration] ⚠️ settings 머지 실패: ${e?.message}`);
        return false;
    }
}

function copyDirRecursive(src: string, dst: string): void {
    fs.mkdirSync(dst, { recursive: true });
    for (const it of fs.readdirSync(src)) {
        // Skip session folders at any recursion depth to prevent GB-scale I/O.
        if (isSessionFolder(it)) continue;
        const ss = path.join(src, it);
        const dd = path.join(dst, it);
        if (fs.statSync(ss).isDirectory()) copyDirRecursive(ss, dd);
        else fs.copyFileSync(ss, dd);
    }
}

/**
 * sibling productName 폴더에서 active(setName) 폴더로 데이터 이주
 */
export function migrateUserDataFolders(currentUserDataDir: string): { migrated: number } {
    const result = { migrated: 0 };
    try {
        const parent = path.dirname(currentUserDataDir);
        const siblingDir = path.join(parent, SIBLING_FOLDER_NAME);
        if (!fs.existsSync(siblingDir) || siblingDir === currentUserDataDir) return result;
        if (!fs.existsSync(currentUserDataDir)) fs.mkdirSync(currentUserDataDir, { recursive: true });

        for (const f of TARGET_FILES) {
            const src = path.join(siblingDir, f);
            const dst = path.join(currentUserDataDir, f);
            if (!fs.existsSync(src)) continue;

            // ✅ [v2.8.1] settings.json은 항상 머지 — dst 우선, 비어있는 필드만 src에서 보충
            //   문제: v2.8.0은 API 키만 비교해 "있으면 OK"로 판단 → savedLicenseUserId 등 다른 필드 누락
            //   조치: 머지로 라이선스 ID/PW + 네이버 계정 + 사용자 프로필 등 PRESERVE_FIELDS 일괄 보충
            if (f === 'settings.json') {
                if (!fs.existsSync(dst)) {
                    try {
                        fs.copyFileSync(src, dst);
                        result.migrated++;
                        console.log(`[UserDataMigration] ✅ settings.json 신규 이주: ${siblingDir} → ${currentUserDataDir}`);
                    } catch (e: any) {
                        console.warn(`[UserDataMigration] ⚠️ settings.json 이주 실패: ${e?.message}`);
                    }
                } else {
                    const merged = mergeSettingsPreserveDst(src, dst);
                    if (merged) {
                        result.migrated++;
                        console.log(`[UserDataMigration] ✅ settings.json 필드 머지 (라이선스/계정/프로필 보충)`);
                    }
                }
                continue;
            }

            // 그 외 파일: dst 없을 때만 복사 (dst가 우선)
            if (!fs.existsSync(dst)) {
                try {
                    fs.copyFileSync(src, dst);
                    result.migrated++;
                    console.log(`[UserDataMigration] ✅ ${f} 이주: ${siblingDir} → ${currentUserDataDir}`);
                } catch (e: any) {
                    console.warn(`[UserDataMigration] ⚠️ ${f} 이주 실패: ${e?.message}`);
                }
            }
        }

        try {
            for (const f of fs.readdirSync(siblingDir)) {
                if (!f.startsWith('settings_') || !f.endsWith('.json')) continue;
                const src = path.join(siblingDir, f);
                const dst = path.join(currentUserDataDir, f);
                if (!fs.existsSync(dst)) {
                    try { fs.copyFileSync(src, dst); result.migrated++; } catch { /* skip */ }
                }
            }
        } catch { /* ignore */ }

        // ✅ [v2.9.2] 모든 사용자 데이터 폴더 sibling → active 이주 (active에 없을 때만 복사, 비파괴)
        for (const folder of TARGET_FOLDERS) {
            try {
                const src = path.join(siblingDir, folder);
                const dst = path.join(currentUserDataDir, folder);
                if (fs.existsSync(src) && !fs.existsSync(dst)) {
                    copyDirRecursive(src, dst);
                    result.migrated++;
                    console.log(`[UserDataMigration] ✅ ${folder} 폴더 이주: ${siblingDir} → ${currentUserDataDir}`);
                }
            } catch (folderErr: any) {
                console.warn(`[UserDataMigration] ⚠️ ${folder} 이주 실패: ${folderErr?.message}`);
            }
        }

        // ✅ [v2.9.2] Network/Cookies (네이버 로그인 쿠키)
        try {
            const srcNet = path.join(siblingDir, 'Network');
            const dstNet = path.join(currentUserDataDir, 'Network');
            if (fs.existsSync(srcNet)) {
                if (!fs.existsSync(dstNet)) fs.mkdirSync(dstNet, { recursive: true });
                for (const cf of NETWORK_COOKIES_FILES) {
                    const src = path.join(srcNet, cf);
                    const dst = path.join(dstNet, cf);
                    if (fs.existsSync(src) && !fs.existsSync(dst)) {
                        try { fs.copyFileSync(src, dst); result.migrated++; } catch { /* skip */ }
                    }
                }
            }
        } catch (netErr: any) {
            console.warn(`[UserDataMigration] ⚠️ Network/Cookies 이주 실패: ${netErr?.message}`);
        }

        if (result.migrated > 0) {
            console.log(`[UserDataMigration] 🔄 ${result.migrated}개 항목 이주 완료`);
        }
    } catch (e: any) {
        console.warn(`[UserDataMigration] ⚠️ 마이그레이션 실패 (무시): ${e?.message}`);
    }
    return result;
}

/**
 * Documents 미러 폴더 경로
 */
export function getMirrorDir(documentsDir: string): string {
    return path.join(documentsDir, 'better-life-naver-backup', '_safe');
}

/**
 * 미러 → userData 자동 복원 (settings.json 비었을 때만)
 * 부팅 시 1회 호출
 */
export function restoreFromMirrorIfEmpty(userDataDir: string, mirrorDir: string): boolean {
    try {
        if (!fs.existsSync(mirrorDir)) return false;
        const dst = path.join(userDataDir, 'settings.json');
        const src = path.join(mirrorDir, 'settings.json');
        if (!fs.existsSync(src)) return false;

        // ✅ [v2.8.1] dst가 있으면 항상 머지 — API 키 외 라이선스/계정/프로필 필드도 보충
        if (fs.existsSync(dst)) {
            mergeSettingsPreserveDst(src, dst);
        } else {
            try {
                const srcCfg = JSON.parse(fs.readFileSync(src, 'utf8'));
                if (!hasPreservedValue(srcCfg)) return false;
                if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
                fs.copyFileSync(src, dst);
                console.log(`[UserDataMirror] ✅ 미러에서 settings.json 자동 복원`);
            } catch (e: any) {
                console.warn(`[UserDataMirror] ⚠️ settings 복원 실패: ${e?.message}`);
            }
        }

        // ✅ [v2.9.3] 단일 파일 미러 복원 — 추가 파일(heading-*, Preferences) 포함, active에 없을 때만
        for (const f of [...TARGET_FILES, ...TARGET_FILES_EXTRA]) {
            if (f === 'settings.json') continue;
            const ms = path.join(mirrorDir, f);
            const md = path.join(userDataDir, f);
            if (fs.existsSync(ms) && !fs.existsSync(md)) {
                try { fs.copyFileSync(ms, md); console.log(`[UserDataMirror] ✅ 복원: ${f}`); } catch { /* skip */ }
            }
        }

        // ✅ [v2.9.3] 자동화 세션 폴더 복원 (active에 없을 때만)
        try {
            for (const item of fs.readdirSync(mirrorDir)) {
                const matches = SESSION_FOLDER_PREFIXES.some(prefix => item === prefix || item.startsWith(prefix + '-'));
                if (!matches) continue;
                const ms = path.join(mirrorDir, item);
                const md = path.join(userDataDir, item);
                if (fs.existsSync(ms) && !fs.existsSync(md) && fs.statSync(ms).isDirectory()) {
                    try {
                        copyDirRecursive(ms, md);
                        console.log(`[UserDataMirror] ✅ 세션 폴더 복원: ${item}`);
                    } catch (sessionErr: any) {
                        console.warn(`[UserDataMirror] ⚠️ ${item} 세션 복원 실패: ${sessionErr?.message}`);
                    }
                }
            }
        } catch { /* ignore */ }

        // ✅ [v2.9.2] 계정별 settings_*.json 복원
        try {
            for (const f of fs.readdirSync(mirrorDir)) {
                if (!f.startsWith('settings_') || !f.endsWith('.json')) continue;
                const md = path.join(userDataDir, f);
                if (!fs.existsSync(md)) {
                    try { fs.copyFileSync(path.join(mirrorDir, f), md); console.log(`[UserDataMirror] ✅ 복원: ${f}`); } catch { /* skip */ }
                }
            }
        } catch { /* ignore */ }

        // ✅ [v2.9.2] 사용자 데이터 폴더 복원 (Local Storage, WebStorage, Session Storage, license)
        for (const folder of TARGET_FOLDERS) {
            try {
                const ms = path.join(mirrorDir, folder);
                const md = path.join(userDataDir, folder);
                if (fs.existsSync(ms) && !fs.existsSync(md)) {
                    copyDirRecursive(ms, md);
                    console.log(`[UserDataMirror] ✅ 폴더 복원: ${folder}`);
                }
            } catch (folderErr: any) {
                console.warn(`[UserDataMirror] ⚠️ ${folder} 복원 실패: ${folderErr?.message}`);
            }
        }

        // ✅ [v2.9.2] Network/Cookies 복원 (네이버 로그인 쿠키)
        try {
            const networkMs = path.join(mirrorDir, 'Network');
            const networkMd = path.join(userDataDir, 'Network');
            if (fs.existsSync(networkMs)) {
                if (!fs.existsSync(networkMd)) fs.mkdirSync(networkMd, { recursive: true });
                for (const cf of NETWORK_COOKIES_FILES) {
                    const ms = path.join(networkMs, cf);
                    const md = path.join(networkMd, cf);
                    if (fs.existsSync(ms) && !fs.existsSync(md)) {
                        try { fs.copyFileSync(ms, md); console.log(`[UserDataMirror] ✅ Cookies 복원: ${cf}`); } catch { /* skip */ }
                    }
                }
            }
        } catch (netErr: any) {
            console.warn(`[UserDataMirror] ⚠️ Network/Cookies 복원 실패: ${netErr?.message}`);
        }
        try {
            for (const f of fs.readdirSync(mirrorDir)) {
                if (!f.startsWith('settings_') || !f.endsWith('.json')) continue;
                const md = path.join(userDataDir, f);
                if (!fs.existsSync(md)) {
                    try { fs.copyFileSync(path.join(mirrorDir, f), md); } catch { /* skip */ }
                }
            }
        } catch { /* ignore */ }
        return true;
    } catch (e: any) {
        console.warn(`[UserDataMirror] ⚠️ 복원 실패: ${e?.message}`);
        return false;
    }
}

/**
 * userData → 미러 동기화. saveConfig 직후 또는 startup 후 1회 호출.
 * [v2.10.275] Session folders (playwright-session*, puppeteer-session*, etc.) are
 * intentionally excluded — they are GB-scale and can be recreated by re-login.
 * Excluding them eliminates the 17-second main-thread freeze on startup.
 *
 * Concurrency guard: if a mirror is in-flight or ran within MIRROR_TTL_MS,
 * subsequent calls are no-ops (prevents N×writes from rapid config saves).
 */
export function mirrorToSafe(userDataDir: string, mirrorDir: string): void {
    // In-flight deduplication guard (synchronous lock — prevents concurrent writes).
    const now = Date.now();
    if (now - _lastMirrorAt < MIRROR_TTL_MS) {
        console.log('[UserDataMirror] 1분 이내 재호출 → skip');
        return;
    }
    if (_mirrorInFlight) {
        return;
    }
    _mirrorInFlight = true;

    let stats = { files: 0, folders: 0, cookies: 0 };
    try {
        if (!fs.existsSync(userDataDir)) return;
        if (!fs.existsSync(mirrorDir)) fs.mkdirSync(mirrorDir, { recursive: true });

        // 1) Single-file mirror (critical + extra)
        for (const f of [...TARGET_FILES, ...TARGET_FILES_EXTRA]) {
            const src = path.join(userDataDir, f);
            const dst = path.join(mirrorDir, f);
            if (fs.existsSync(src)) {
                try { fs.copyFileSync(src, dst); stats.files++; } catch { /* skip */ }
            }
        }

        // 2) Per-account settings_*.json glob
        try {
            for (const f of fs.readdirSync(userDataDir)) {
                if (!f.startsWith('settings_') || !f.endsWith('.json')) continue;
                try { fs.copyFileSync(path.join(userDataDir, f), path.join(mirrorDir, f)); stats.files++; } catch { /* skip */ }
            }
        } catch { /* ignore */ }

        // 3) User data folder mirror (Local Storage, WebStorage, Session Storage, license)
        for (const folder of TARGET_FOLDERS) {
            try {
                const src = path.join(userDataDir, folder);
                const dst = path.join(mirrorDir, folder);
                if (fs.existsSync(src)) {
                    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
                    copyDirRecursive(src, dst);
                    stats.folders++;
                }
            } catch (folderErr: any) {
                console.warn(`[UserDataMirror] ⚠️ ${folder} 미러 실패 (무시): ${folderErr?.message}`);
            }
        }

        // 4) Network/Cookies only (Naver login cookie protection)
        try {
            const networkSrc = path.join(userDataDir, 'Network');
            const networkDst = path.join(mirrorDir, 'Network');
            if (fs.existsSync(networkSrc)) {
                if (!fs.existsSync(networkDst)) fs.mkdirSync(networkDst, { recursive: true });
                for (const cf of NETWORK_COOKIES_FILES) {
                    const src = path.join(networkSrc, cf);
                    const dst = path.join(networkDst, cf);
                    if (fs.existsSync(src)) {
                        try { fs.copyFileSync(src, dst); stats.cookies++; } catch { /* skip */ }
                    }
                }
            }
        } catch (netErr: any) {
            console.warn(`[UserDataMirror] ⚠️ Network/Cookies 미러 실패 (무시): ${netErr?.message}`);
        }

        // [v2.10.275] Section 5 (session folder mirror) intentionally removed.
        // playwright-session*, puppeteer-session*, imagefx-chrome-profile are excluded
        // to prevent the 17-second I/O freeze. Sessions can be restored by re-login.
        console.log(`[UserDataMirror] ✅ 미러 완료 — 파일 ${stats.files}, 폴더 ${stats.folders}, 쿠키 ${stats.cookies} (세션 폴더 제외)`);
        _lastMirrorAt = Date.now();
    } catch (e: any) {
        console.warn(`[UserDataMirror] ⚠️ 미러 동기화 실패 (무시): ${e?.message}`);
    } finally {
        _mirrorInFlight = false;
    }
}

/**
 * ✅ [v2.10.6] 마스터 settings.json → 계정별 settings_*.json 자동 머지
 *   배경: v2.7.x에 도입된 계정별 분리 모드(_activeUserId)가 settings_xxx.json을
 *   우선 로드하는데, 그 파일에 API 키/자격증명이 누락되면 사용자 UI에 빈 값 표시.
 *   사용자 보고: '이전에 등록한 정보 다 어디갔니, 자동로그인 정보랑 API 키랑 전부다'
 *   원인: 계정별 모드 활성화 후 사용자가 마스터에 키를 입력 / 마이그레이션 / 미러
 *         복원 등으로 마스터에는 키가 있는데 계정별 파일은 갱신 안 됨.
 *   조치: startup 시점에 모든 settings_*.json 파일을 검사 → PRESERVE_FIELDS가
 *         비어있는데 마스터에 있으면 비파괴 머지 (계정별 명시 값은 보존).
 *
 *   비파괴 원칙: 계정별 파일에 값이 있으면 절대 덮어쓰지 않음.
 *               비어있는 필드만 마스터에서 보충.
 */
export function syncMasterIntoAccountSettings(userDataDir: string): { merged: number; files: number } {
    const result = { merged: 0, files: 0 };
    try {
        const masterPath = path.join(userDataDir, 'settings.json');
        if (!fs.existsSync(masterPath)) return result;
        const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
        if (!master || typeof master !== 'object') return result;

        const items = fs.readdirSync(userDataDir);
        for (const f of items) {
            if (!f.startsWith('settings_') || !f.endsWith('.json')) continue;
            const acctPath = path.join(userDataDir, f);
            try {
                const acct = JSON.parse(fs.readFileSync(acctPath, 'utf8'));
                let mergedHere = 0;
                for (const k of PRESERVE_FIELDS) {
                    const mv = master[k];
                    const av = acct[k];
                    const mHas = (typeof mv === 'string' && mv.trim().length > 0)
                        || (Array.isArray(mv) && mv.length > 0)
                        || (typeof mv === 'boolean');
                    const aHas = (typeof av === 'string' && av.trim().length > 0)
                        || (Array.isArray(av) && av.length > 0)
                        || (typeof av === 'boolean' && av !== undefined);
                    if (mHas && !aHas) {
                        acct[k] = mv;
                        mergedHere++;
                    }
                }
                if (mergedHere > 0) {
                    // 백업 후 저장
                    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    const backupPath = `${acctPath}.before-sync-${ts}`;
                    try { fs.copyFileSync(acctPath, backupPath); } catch { /* skip */ }
                    fs.writeFileSync(acctPath, JSON.stringify(acct, null, 2), 'utf8');
                    console.log(`[AccountSync] ✅ ${f}: ${mergedHere}개 필드 마스터에서 보충 (백업: ${path.basename(backupPath)})`);
                    result.merged += mergedHere;
                    result.files++;
                }
            } catch (e: any) {
                console.warn(`[AccountSync] ⚠️ ${f} 머지 실패 (무시): ${e?.message}`);
            }
        }
        if (result.files > 0) {
            console.log(`[AccountSync] 🔄 ${result.files}개 계정별 파일에 ${result.merged}개 필드 보충`);
        }
    } catch (e: any) {
        console.warn(`[AccountSync] ⚠️ 동기화 실패 (무시): ${e?.message}`);
    }
    return result;
}
