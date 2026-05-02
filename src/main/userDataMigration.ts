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
const KEY_FIELDS = ['geminiApiKey', 'openaiApiKey', 'claudeApiKey', 'perplexityApiKey', 'pexelsApiKey'];

function configHasAnyKey(cfg: any): boolean {
    if (!cfg || typeof cfg !== 'object') return false;
    for (const k of KEY_FIELDS) {
        const v = cfg[k];
        if (typeof v === 'string' && v.trim().length > 0) return true;
    }
    return false;
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

            let shouldCopy = !fs.existsSync(dst);
            if (!shouldCopy && f === 'settings.json') {
                try {
                    const dstCfg = JSON.parse(fs.readFileSync(dst, 'utf8'));
                    const srcCfg = JSON.parse(fs.readFileSync(src, 'utf8'));
                    if (!configHasAnyKey(dstCfg) && configHasAnyKey(srcCfg)) shouldCopy = true;
                } catch {
                    shouldCopy = true;
                }
            }
            if (shouldCopy) {
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
            if (fs.existsSync(srcLic) && !fs.existsSync(dstLic)) {
                copyDirRecursive(srcLic, dstLic);
                result.migrated++;
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

        let dstHasKey = false;
        if (fs.existsSync(dst)) {
            try {
                const cfg = JSON.parse(fs.readFileSync(dst, 'utf8'));
                dstHasKey = configHasAnyKey(cfg);
            } catch { /* 파일 손상 → 복원 가능 */ }
        }
        if (dstHasKey) return false;

        const srcCfg = JSON.parse(fs.readFileSync(src, 'utf8'));
        if (!configHasAnyKey(srcCfg)) return false;

        if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
        fs.copyFileSync(src, dst);
        console.log(`[UserDataMirror] ✅ 미러에서 settings.json 자동 복원`);

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
