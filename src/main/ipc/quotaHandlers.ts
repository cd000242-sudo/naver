// src/main/ipc/quotaHandlers.ts
// 쿼터/할당량 관련 IPC 핸들러

import { ipcMain } from 'electron';
import { IpcContext } from '../types';
import * as AuthUtils from '../utils/authUtils.js';
import { getStatus as getQuotaStatus } from '../../quotaManager.js';
import { loadConfig } from '../../configManager.js';

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

            return { success: true, isFree: true, quota };
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

    // ✅ [2026-03-02] Leonardo AI 크레딧 잔액 조회
    ipcMain.handle('quota:getLeonardoCredits', async () => {
        try {
            const config = await loadConfig();
            const apiKey = (config as any).leonardoaiApiKey as string;
            if (!apiKey) {
                return { success: false, message: 'API 키 미설정' };
            }
            const axios = (await import('axios')).default;
            const response = await axios.get('https://cloud.leonardo.ai/api/rest/v1/me', {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                timeout: 10000,
            });
            const userData = response.data?.user_details?.[0] || response.data;
            return {
                success: true,
                credits: userData.apiConcurrencySlots || userData.apiCredit || userData.tokenRenewalDate || 0,
                apiPlanTokenRenewalDate: userData.apiPlanTokenRenewalDate || null,
                raw: userData,
            };
        } catch (error: any) {
            return { success: false, message: error?.response?.status === 401 ? 'API 키 인증 실패' : (error as Error).message };
        }
    });
}
