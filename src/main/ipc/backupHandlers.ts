// src/main/ipc/backupHandlers.ts
// 데이터 백업/복원 IPC 핸들러
// [v2.10.259] main.ts에서 분리 — god-file 압축 18단계.
//
// 분리 3개 핸들러 + performDataBackup 헬퍼:
//   backup:create, backup:list, backup:restore

import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fsSync from 'fs';

export interface BackupHandlerContext {
    debugLog: (message: string) => void;
}

export async function performDataBackup(
    reason: string,
    debugLog: (msg: string) => void,
): Promise<{ success: boolean; backupPath?: string; message?: string }> {
    try {
        const userDataDir = app.getPath('userData');
        const backupRoot = path.join(app.getPath('documents'), 'better-life-naver-backup');
        if (!fsSync.existsSync(backupRoot)) fsSync.mkdirSync(backupRoot, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupDir = path.join(backupRoot, `backup-${ts}-${reason}`);
        fsSync.mkdirSync(backupDir, { recursive: true });

        const targetFiles = [
            'settings.json',
            'config.json',
            'blog-accounts.json',
            'scheduled-posts.json',
        ];
        let copiedCount = 0;
        for (const f of targetFiles) {
            const src = path.join(userDataDir, f);
            if (fsSync.existsSync(src)) {
                fsSync.copyFileSync(src, path.join(backupDir, f));
                copiedCount++;
            }
        }
        try {
            const allFiles = fsSync.readdirSync(userDataDir);
            for (const f of allFiles) {
                if (f.startsWith('settings_') && f.endsWith('.json')) {
                    fsSync.copyFileSync(path.join(userDataDir, f), path.join(backupDir, f));
                    copiedCount++;
                }
            }
        } catch { /* ignore */ }
        try {
            const lsDir = path.join(userDataDir, 'Local Storage');
            if (fsSync.existsSync(lsDir)) {
                const dest = path.join(backupDir, 'Local Storage');
                fsSync.mkdirSync(dest, { recursive: true });
                const copyDir = (src: string, dst: string) => {
                    const items = fsSync.readdirSync(src);
                    for (const it of items) {
                        const s = path.join(src, it);
                        const d = path.join(dst, it);
                        const stat = fsSync.statSync(s);
                        if (stat.isDirectory()) {
                            fsSync.mkdirSync(d, { recursive: true });
                            copyDir(s, d);
                        } else {
                            fsSync.copyFileSync(s, d);
                        }
                    }
                };
                copyDir(lsDir, dest);
                copiedCount++;
            }
        } catch (e: any) {
            debugLog(`[Backup] Local Storage 복사 실패 (무시): ${e?.message}`);
        }
        // 14일 이상 지난 auto 백업 정리
        try {
            const all = fsSync.readdirSync(backupRoot);
            const now = Date.now();
            for (const dir of all) {
                if (!dir.startsWith('backup-') || !dir.includes('-auto')) continue;
                const stat = fsSync.statSync(path.join(backupRoot, dir));
                if (now - stat.mtimeMs > 14 * 24 * 60 * 60 * 1000) {
                    fsSync.rmSync(path.join(backupRoot, dir), { recursive: true, force: true });
                }
            }
        } catch { /* ignore */ }
        debugLog(`[Backup] ✅ ${copiedCount}개 파일 백업: ${backupDir}`);
        return { success: true, backupPath: backupDir };
    } catch (e: any) {
        debugLog(`[Backup] ❌ 백업 실패: ${e?.message}`);
        return { success: false, message: String(e?.message || e) };
    }
}

export function registerBackupHandlers(ctx: BackupHandlerContext): void {
    ipcMain.handle('backup:create', async (_e, reason?: string) => performDataBackup(reason || 'manual', ctx.debugLog));

    ipcMain.handle('backup:list', async () => {
        try {
            const backupRoot = path.join(app.getPath('documents'), 'better-life-naver-backup');
            if (!fsSync.existsSync(backupRoot)) return { success: true, backups: [] };
            const list = fsSync.readdirSync(backupRoot)
                .filter((d: string) => d.startsWith('backup-'))
                .map((d: string) => {
                    const full = path.join(backupRoot, d);
                    const stat = fsSync.statSync(full);
                    return { name: d, path: full, mtime: stat.mtimeMs, size: 0 };
                })
                .sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime);
            return { success: true, backups: list };
        } catch (e: any) {
            return { success: false, message: String(e?.message || e), backups: [] };
        }
    });

    ipcMain.handle('backup:restore', async (_e, backupPath: string) => {
        try {
            if (!backupPath || !fsSync.existsSync(backupPath)) return { success: false, message: '백업 폴더가 존재하지 않습니다' };
            await performDataBackup('pre-restore', ctx.debugLog);
            const userDataDir = app.getPath('userData');
            const items = fsSync.readdirSync(backupPath);
            let restored = 0;
            for (const it of items) {
                const src = path.join(backupPath, it);
                const dst = path.join(userDataDir, it);
                const stat = fsSync.statSync(src);
                if (stat.isDirectory()) {
                    if (fsSync.existsSync(dst)) fsSync.rmSync(dst, { recursive: true, force: true });
                    const copyDir = (s: string, d: string) => {
                        fsSync.mkdirSync(d, { recursive: true });
                        for (const f of fsSync.readdirSync(s)) {
                            const ss = path.join(s, f);
                            const dd = path.join(d, f);
                            const st = fsSync.statSync(ss);
                            if (st.isDirectory()) copyDir(ss, dd);
                            else fsSync.copyFileSync(ss, dd);
                        }
                    };
                    copyDir(src, dst);
                } else {
                    fsSync.copyFileSync(src, dst);
                }
                restored++;
            }
            return { success: true, message: `${restored}개 항목 복원 완료. 앱 재시작 필요.` };
        } catch (e: any) {
            return { success: false, message: String(e?.message || e) };
        }
    });

    console.log('[IPC] Backup handlers registered (3 handlers)');
}
