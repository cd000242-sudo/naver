// src/main/ipc/authHandlers.ts
// 인증/라이선스 관련 IPC 핸들러
// ⚠️ [2026-03-26] free:activate, license:checkStatus는
//    main.ts에 실제 구현이 존재하므로 여기서 등록하지 않음 (이중 등록 크래시 방지)
// ✅ [2026-04-03] quota 핸들러는 quotaHandlers.ts로 분리 완료
// ✅ [2026-04-03] license 핸들러 9개 main.ts에서 이관 완료

import { ipcMain } from 'electron';
import { IpcContext } from '../types';
import {
    verifyLicense,
    verifyLicenseWithCredentials,
    registerExternalInflowLicense,
    canUseExternalInflow,
    checkPatchFile,
    getDeviceId,
    testLicenseServer,
    clearLicense,
    revalidateLicense,
    type LicenseInfo,
} from '../../licenseManager.js';

/**
 * 라이선스 핸들러 등록
 */
export function registerLicenseHandlers(_ctx: IpcContext): void {

    ipcMain.handle('license:verify', async (_event, code: string, deviceId: string, email?: string): Promise<{ valid: boolean; license?: LicenseInfo; message?: string }> => {
        try {
            const serverUrl = process.env.LICENSE_SERVER_URL || 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
            return await verifyLicense(code, deviceId, serverUrl, email);
        } catch (error) {
            return {
                valid: false,
                message: `라이선스 검증 중 오류: ${(error as Error).message}`,
            };
        }
    });

    ipcMain.handle('license:verifyWithCredentials', async (_event, userId: string, password: string, deviceId: string): Promise<{ valid: boolean; license?: LicenseInfo; message?: string; debugInfo?: any }> => {
        try {
            const serverUrl = process.env.LICENSE_SERVER_URL || 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
            return await verifyLicenseWithCredentials(userId, password, deviceId, serverUrl);
        } catch (error) {
            return {
                valid: false,
                message: `라이선스 검증 중 오류: ${(error as Error).message}`,
            };
        }
    });

    // 외부 유입 90일 라이선스 등록
    ipcMain.handle('license:registerExternalInflow', async (): Promise<{ success: boolean; message: string; expiresAt?: string }> => {
        try {
            console.log('[Main] 외부 유입 90일 라이선스 등록 요청');
            const result = await registerExternalInflowLicense();
            console.log('[Main] 외부 유입 라이선스 등록 결과:', result);
            return result;
        } catch (error) {
            console.error('[Main] 외부 유입 라이선스 등록 오류:', error);
            return {
                success: false,
                message: `외부 유입 라이선스 등록 실패: ${(error as Error).message}`
            };
        }
    });

    // 외부 유입 기능 사용 가능 여부 확인
    ipcMain.handle('license:canUseExternalInflow', async (): Promise<boolean> => {
        try {
            const canUse = await canUseExternalInflow();
            console.log('[Main] 외부 유입 기능 사용 가능 여부:', canUse);
            return canUse;
        } catch (error) {
            console.error('[Main] 외부 유입 기능 검증 오류:', error);
            return false;
        }
    });

    ipcMain.handle('license:checkPatchFile', async (): Promise<boolean> => {
        try {
            return await checkPatchFile();
        } catch (error) {
            console.error('[Main] 패치 파일 확인 실패:', (error as Error).message);
            return false;
        }
    });

    ipcMain.handle('license:getDeviceId', async (): Promise<string> => {
        try {
            return await getDeviceId();
        } catch (error) {
            console.error('[Main] 기기 ID 생성 실패:', (error as Error).message);
            return '';
        }
    });

    ipcMain.handle('license:testServer', async (_event, serverUrl?: string): Promise<{ success: boolean; message: string; response?: any }> => {
        try {
            return await testLicenseServer(serverUrl);
        } catch (error) {
            console.error('[Main] License server test error:', (error as Error).message);
            return {
                success: false,
                message: `테스트 실패: ${(error as Error).message}`,
            };
        }
    });

    ipcMain.handle('license:clear', async (): Promise<void> => {
        try {
            await clearLicense();
        } catch (error) {
            console.error('[Main] 라이선스 삭제 실패:', (error as Error).message);
        }
    });

    ipcMain.handle('license:revalidate', async (_event, serverUrl?: string): Promise<boolean> => {
        try {
            return await revalidateLicense(serverUrl || process.env.LICENSE_SERVER_URL);
        } catch (error) {
            console.error('[Main] License revalidation error:', (error as Error).message);
            return false;
        }
    });
}
