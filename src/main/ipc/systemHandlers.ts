// src/main/ipc/systemHandlers.ts
// 시스템/파일/설정 관련 IPC 핸들러

import { ipcMain, shell, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IpcContext } from '../types';
import { WindowManager } from '../core/WindowManager';

/**
 * 시스템 관련 핸들러 등록
 */
export function registerSystemHandlers(ctx: IpcContext): void {
    // OS 홈 디렉토리
    ipcMain.handle('os:homedir', async () => {
        return os.homedir();
    });

    // 윈도우 최소화
    ipcMain.handle('window:minimize', async () => {
        WindowManager.minimize();
        return { success: true };
    });

    // 셸에서 경로 열기
    ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
        try {
            await shell.openPath(targetPath);
            return { success: true };
        } catch (error) {
            console.error('[systemHandlers] shell:openPath error:', error);
            return { success: false, error: String(error) };
        }
    });

    // 앱 강제 종료
    ipcMain.handle('app:forceQuit', async () => {
        WindowManager.setQuitting(true);
        const { app } = require('electron');
        app.quit();
        return true;
    });

    // 앱 정보 가져오기
    ipcMain.handle('app:getInfo', async () => {
        const { app } = require('electron');
        return {
            version: app.getVersion(),
            name: app.getName()
        };
    });
}

/**
 * 파일 시스템 핸들러 등록
 */
export function registerFileHandlers(ctx: IpcContext): void {
    // 파일 존재 여부 확인
    ipcMain.handle('file:checkExists', async (_event, filePath: string) => {
        try {
            return fs.existsSync(filePath);
        } catch {
            return false;
        }
    });

    // 파일 존재 여부 (별칭)
    ipcMain.handle('file:exists', async (_event, filePath: string): Promise<boolean> => {
        try {
            return fs.existsSync(filePath);
        } catch {
            return false;
        }
    });

    // 디렉토리 읽기
    ipcMain.handle('file:readDir', async (_event, dirPath: string) => {
        try {
            if (!fs.existsSync(dirPath)) return [];
            return fs.readdirSync(dirPath);
        } catch {
            return [];
        }
    });

    // 폴더 삭제
    ipcMain.handle('file:deleteFolder', async (_event, folderPath: string) => {
        try {
            if (fs.existsSync(folderPath)) {
                fs.rmSync(folderPath, { recursive: true, force: true });
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    });

    // 파일 삭제
    ipcMain.handle('file:deleteFile', async (_event, filePath: string) => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    });

    // 디렉토리 읽기 (상세 정보 포함)
    ipcMain.handle('file:readDirWithStats', async (_event, dirPath: string) => {
        try {
            if (!fs.existsSync(dirPath)) return [];
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            return entries.map(entry => {
                const fullPath = path.join(dirPath, entry.name);
                let stats = null;
                try {
                    stats = fs.statSync(fullPath);
                } catch { }
                return {
                    name: entry.name,
                    path: fullPath,
                    isDirectory: entry.isDirectory(),
                    size: stats?.size || 0,
                    mtime: stats?.mtime || null
                };
            });
        } catch {
            return [];
        }
    });

    // 파일 상태 가져오기
    ipcMain.handle('file:getStats', async (_event, filePath: string) => {
        try {
            const stats = fs.statSync(filePath);
            return {
                size: stats.size,
                mtime: stats.mtime,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory()
            };
        } catch {
            return null;
        }
    });
}

/**
 * 다이얼로그 핸들러 등록
 */
export function registerDialogHandlers(ctx: IpcContext): void {
    // 비디오 파일 선택
    ipcMain.handle('dialog:selectVideoFile', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi'] }]
        });
        return result.canceled ? null : result.filePaths[0];
    });

    // 일반 파일 선택 다이얼로그
    ipcMain.handle('dialog:showOpenDialog', async (_event, options) => {
        const mainWindow = WindowManager.getMainWindow();
        if (mainWindow) {
            return dialog.showOpenDialog(mainWindow, options);
        }
        return dialog.showOpenDialog(options);
    });

    // 이미지 폴더 열기
    ipcMain.handle('openImagesFolder', async () => {
        const imagesPath = path.join(os.homedir(), 'naver-blog-automation', 'images');
        if (!fs.existsSync(imagesPath)) {
            fs.mkdirSync(imagesPath, { recursive: true });
        }
        await shell.openPath(imagesPath);
        return { success: true };
    });
}
