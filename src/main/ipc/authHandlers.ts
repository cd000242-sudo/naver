// src/main/ipc/authHandlers.ts
// 인증/라이선스 관련 IPC 핸들러

import { ipcMain } from 'electron';
import { IpcContext } from '../types';

/**
 * 라이선스 핸들러 등록
 */
export function registerLicenseHandlers(ctx: IpcContext): void {
    // 라이선스 상태 확인
    ipcMain.handle('license:checkStatus', async () => {
        // TODO: 기존 main.ts의 license:checkStatus 로직 이동
        console.log('[licenseHandlers] license:checkStatus - placeholder');
        return { isValid: true, type: 'free' };
    });

    // 무료 활성화
    ipcMain.handle('free:activate', async () => {
        // TODO: 기존 main.ts의 free:activate 로직 이동
        console.log('[licenseHandlers] free:activate - placeholder');
        return { success: true };
    });
}

/**
 * 할당량 핸들러 등록
 */
export function registerQuotaHandlers(ctx: IpcContext): void {
    // 할당량 상태
    ipcMain.handle('quota:getStatus', async () => {
        // TODO: 기존 main.ts의 quota:getStatus 로직 이동
        console.log('[quotaHandlers] quota:getStatus - placeholder');
        return { remaining: 100, total: 100 };
    });
}
