// src/main/ipc/quotaHandlers.ts
// 쿼터/할당량 관련 IPC 핸들러

import { ipcMain } from 'electron';
import { IpcContext } from '../types';
import * as AuthUtils from '../utils/authUtils.js';
import { getStatus as getQuotaStatus } from '../../quotaManager.js';

/**
 * 쿼터 핸들러 등록
 */
export function registerQuotaHandlers(_ctx: IpcContext): void {

    // ✅ [2026-01-16] 쿼터 상태 조회 핸들러
    ipcMain.handle('quota:getStatus', async () => {
        try {
            const isFree = await AuthUtils.isFreeTierUser();
            if (!isFree) {
                return { success: true, isFree: false };
            }

            const limits = await AuthUtils.getFreeQuotaLimits();
            const quota = await getQuotaStatus(limits);

            // [2026-08-21] 체험 만료일 동봉 — 화면이 "매일 3회"만 말하고 "언제까지"를
            // 안 보여주던 공백(사장님 지시: 기간이 보이도록).
            let trialExpiresAt: string | null = null;
            try {
                const { loadLicense } = await import('../../licenseManager.js');
                const license = await loadLicense();
                trialExpiresAt = (license?.licenseType === 'free' && license.expiresAt) ? license.expiresAt : null;
            } catch { /* 만료일을 못 읽어도 쿼터 표시는 계속 */ }

            return { success: true, isFree: true, quota, trialExpiresAt };
        } catch (error) {
            console.error('[Main] quota:getStatus 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [2026-03-02] 이미지 API 일일 사용량 조회 (대시보드용)
    ipcMain.handle('quota:getImageUsage', async () => {
        try {
            const { getImageApiStatus } = await import('../../quotaManager.js');
            const status = await getImageApiStatus();
            return { success: true, ...status };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });
}
