// src/main/ipc/fileHandlers.ts
// 파일 시스템 관련 IPC 핸들러 (file:checkExists, readDir, getStats, deleteFile 등)
// [v2.10.242] main.ts에서 분리 — main.ts 100개 IPC god-file 정리 단계.
//
// 분리 8개 핸들러:
//   file:checkExists, file:checkExistsBatch, file:readDir, file:deleteFolder,
//   file:deleteFile, file:readDirWithStats, file:getStats, file:exists
//
// 모든 핸들러는 이미 fs.promises 사용 — 분리는 main.ts god-file 압축이 목적.

import { ipcMain } from 'electron';
import * as path from 'path';
import * as fsp from 'fs/promises';

/**
 * 파일 시스템 IPC 핸들러 일괄 등록.
 * main.ts 또는 main/ipc/index.ts에서 호출.
 */
export function registerFileHandlers(): void {
    // 파일 존재 확인 (단일)
    ipcMain.handle('file:checkExists', async (_event, filePath: string) => {
        try {
            await fsp.access(filePath);
            return true;
        } catch {
            return false;
        }
    });

    // ✅ [v2.10.110] async I/O 배치 — 1000개 파일 동시 access 시 sync block 회피.
    ipcMain.handle('file:checkExistsBatch', async (_event, filePaths: string[]) => {
        if (!Array.isArray(filePaths)) return [];
        return Promise.all(filePaths.map(async (p) => {
            if (typeof p !== 'string' || !p) return false;
            try {
                await fsp.access(p);
                return true;
            } catch {
                return false;
            }
        }));
    });

    // 디렉터리 목록
    ipcMain.handle('file:readDir', async (_event, dirPath: string) => {
        try {
            return await fsp.readdir(dirPath);
        } catch (error) {
            console.error('[File] readDir 실패:', error);
            return [];
        }
    });

    // ✅ [v2.7.43 SEC-V2-C1] 폴더 삭제 — 화이트리스트 + spawn 폴백으로 Command Injection 차단.
    ipcMain.handle('file:deleteFolder', async (_event, folderPath: string) => {
        try {
            if (typeof folderPath !== 'string' || !folderPath || folderPath.length > 500) {
                console.error('[File] deleteFolder 거부: 경로 형식 오류');
                return false;
            }
            // 위험 문자 차단 (셸 메타·NULL byte)
            if (/[\x00<>|&;`$"]/.test(folderPath)) {
                console.error('[File] deleteFolder 거부: 위험 문자 포함');
                return false;
            }
            // 화이트리스트: 앱 데이터·사용자 임시·사용자 홈 하위만 허용
            const os = await import('os');
            const norm = path.resolve(folderPath);
            const allowedRoots = [
                path.resolve(os.tmpdir()),
                path.resolve(process.env.LOCALAPPDATA || os.homedir()),
                path.resolve(process.env.APPDATA || os.homedir()),
                path.resolve(os.homedir(), 'Desktop'),
                path.resolve(os.homedir(), 'Documents'),
                path.resolve(os.homedir(), 'Downloads'),
            ].filter(Boolean);
            const isAllowed = allowedRoots.some((root) => norm.startsWith(root + path.sep) || norm === root);
            if (!isAllowed) {
                console.error('[File] deleteFolder 거부: 허용 경로 외부:', norm);
                return false;
            }

            let targetPath = folderPath;
            if (process.platform === 'win32' && !folderPath.startsWith('\\\\?\\')) {
                targetPath = '\\\\?\\' + folderPath.replace(/\//g, '\\');
            }
            await fsp.rm(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
            return true;
        } catch (err1) {
            // 폴백: spawn (셸 보간 없음, 인자 배열로 인젝션 차단)
            try {
                if (process.platform === 'win32') {
                    const { spawn } = await import('child_process');
                    await new Promise<void>((resolve, reject) => {
                        const child = spawn('cmd.exe', ['/c', 'rmdir', '/s', '/q', folderPath], {
                            timeout: 15000,
                            windowsHide: true,
                            shell: false,
                        });
                        child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
                        child.on('error', reject);
                    });
                    return true;
                }
            } catch { /* ignore */ }
            console.error('[File] deleteFolder 실패:', folderPath, err1);
            return false;
        }
    });

    // 단일 파일 삭제
    ipcMain.handle('file:deleteFile', async (_event, filePath: string) => {
        try {
            await fsp.rm(filePath, { force: true });
            return { success: true };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // 디렉터리 상세(파일 stat 포함) 목록
    ipcMain.handle('file:readDirWithStats', async (_event, dirPath: string) => {
        try {
            const items = await fsp.readdir(dirPath, { withFileTypes: true });
            return await Promise.all(items.map(async (item) => {
                const fullPath = path.join(dirPath, item.name);
                try {
                    const stats = await fsp.stat(fullPath);
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
        } catch (error) {
            console.error('[File] readDirWithStats 실패:', error);
            return [];
        }
    });

    // 파일/폴더 stat
    ipcMain.handle('file:getStats', async (_event, filePath: string) => {
        try {
            const stats = await fsp.stat(filePath);
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

    // 파일 존재 확인 (별칭 — 'file:checkExists'와 거의 동일하지만 별도 채널)
    ipcMain.handle('file:exists', async (_event, filePath: string): Promise<boolean> => {
        try {
            await fsp.access(filePath);
            return true;
        } catch {
            return false;
        }
    });

    console.log('[IPC] File handlers registered (8 handlers)');
}
