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

const SIBLING_FOLDER_NAME = 'Better Life Naver';
const TARGET_FILES = ['settings.json', 'blog-accounts.json', 'scheduled-posts.json', '.last_active_user'];
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

        try {
            const srcLic = path.join(siblingDir, 'license');
            const dstLic = path.join(currentUserDataDir, 'license');
            if (fs.existsSync(srcLic)) {
                // ✅ [v2.8.1] license 폴더는 dst에 없거나 license.json이 비어있을 때 복사
                let needsCopy = !fs.existsSync(dstLic);
                if (!needsCopy) {
                    const srcLicFile = path.join(srcLic, 'license.json');
                    const dstLicFile = path.join(dstLic, 'license.json');
                    if (fs.existsSync(srcLicFile) && !fs.existsSync(dstLicFile)) needsCopy = true;
                }
                if (needsCopy) {
                    copyDirRecursive(srcLic, dstLic);
                    result.migrated++;
                    console.log(`[UserDataMigration] ✅ license 폴더 이주`);
                }
            }
        } catch { /* ignore */ }

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

        for (const f of TARGET_FILES) {
            if (f === 'settings.json') continue;
            const ms = path.join(mirrorDir, f);
            const md = path.join(userDataDir, f);
            if (fs.existsSync(ms) && !fs.existsSync(md)) {
                try { fs.copyFileSync(ms, md); } catch { /* skip */ }
            }
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
 * userData → 미러 동기화. saveConfig 직후 또는 startup 후 1회 호출
 */
export function mirrorToSafe(userDataDir: string, mirrorDir: string): void {
    try {
        if (!fs.existsSync(userDataDir)) return;
        if (!fs.existsSync(mirrorDir)) fs.mkdirSync(mirrorDir, { recursive: true });
        for (const f of TARGET_FILES) {
            const src = path.join(userDataDir, f);
            const dst = path.join(mirrorDir, f);
            if (fs.existsSync(src)) {
                try { fs.copyFileSync(src, dst); } catch { /* skip */ }
            }
        }
        try {
            for (const f of fs.readdirSync(userDataDir)) {
                if (!f.startsWith('settings_') || !f.endsWith('.json')) continue;
                try { fs.copyFileSync(path.join(userDataDir, f), path.join(mirrorDir, f)); } catch { /* skip */ }
            }
        } catch { /* ignore */ }
    } catch (e: any) {
        console.warn(`[UserDataMirror] ⚠️ 미러 동기화 실패 (무시): ${e?.message}`);
    }
}
