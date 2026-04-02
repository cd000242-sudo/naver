// src/main/ipc/adminHandlers.ts
// 관리자 패널 관련 IPC 핸들러
// ✅ [2026-04-03] main.ts에서 추출

import { ipcMain } from 'electron';

/**
 * 관리자 핸들러 의존성
 */
export interface AdminHandlerDeps {
    ensureLicenseValid: () => Promise<boolean>;
    reportUserActivity: () => Promise<void>;
}

/**
 * 관리자 패널 관련 핸들러 등록
 */
export function registerAdminHandlers(deps: AdminHandlerDeps): void {
    const { ensureLicenseValid, reportUserActivity } = deps;

    ipcMain.handle('admin:connect', async (): Promise<{ success: boolean; message: string }> => {
        try {
            console.log('[Admin] 관리자 패널 연결 시도...');

            // 라이선스 검증
            const isValid = await ensureLicenseValid();
            if (!isValid) {
                return { success: false, message: '라이선스가 유효하지 않습니다.' };
            }

            // 관리자 패널 연결 로직 (실제로는 서버 API 호출)
            // TODO: 관리자 패널 서버에 연결

            console.log('[Admin] 관리자 패널 연결 성공');
            return { success: true, message: '관리자 패널에 연결되었습니다.' };
        } catch (error) {
            console.error('[Admin] 연결 실패:', error);
            return { success: false, message: `연결 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('admin:syncSettings', async (): Promise<{ success: boolean; message: string; settings?: any }> => {
        try {
            console.log('[Admin] 관리자 설정 동기화 시도...');

            // 라이선스 검증
            const isValid = await ensureLicenseValid();
            if (!isValid) {
                return { success: false, message: '라이선스가 유효하지 않습니다.' };
            }

            // 관리자 설정 동기화 로직
            // TODO: 서버에서 설정을 가져와서 로컬에 적용

            console.log('[Admin] 관리자 설정 동기화 완료');
            return { success: true, message: '설정이 동기화되었습니다.', settings: {} };
        } catch (error) {
            console.error('[Admin] 설정 동기화 실패:', error);
            return { success: false, message: `동기화 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('admin:sendReport', async (_event, reportData: any): Promise<{ success: boolean; message: string }> => {
        try {
            console.log('[Admin] 관리자 보고서 전송 시도...');

            // 라이선스 검증
            const isValid = await ensureLicenseValid();
            if (!isValid) {
                return { success: false, message: '라이선스가 유효하지 않습니다.' };
            }

            // 관리자 보고서 전송 로직
            // TODO: 사용 통계, 오류 정보 등을 서버로 전송

            console.log('[Admin] 관리자 보고서 전송 완료');
            return { success: true, message: '보고서가 전송되었습니다.' };
        } catch (error) {
            console.error('[Admin] 보고서 전송 실패:', error);
            return { success: false, message: `전송 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('admin:checkPermissions', async (): Promise<{ success: boolean; permissions?: any }> => {
        try {
            console.log('[Admin] 관리자 권한 확인 시도...');

            // 라이선스 검증
            const isValid = await ensureLicenseValid();
            if (!isValid) {
                return { success: false, permissions: { isValid: false } };
            }

            // 관리자 권한 확인 로직
            // TODO: 서버에서 권한 정보를 가져옴

            console.log('[Admin] 관리자 권한 확인 완료');
            return {
                success: true,
                permissions: {
                    isValid: true,
                    canAccessAdminPanel: true,
                    canSyncSettings: true,
                    canSendReports: true
                }
            };
        } catch (error) {
            console.error('[Admin] 권한 확인 실패:', error);
            return { success: false, permissions: { isValid: false, error: (error as Error).message } };
        }
    });

    ipcMain.handle('admin:syncAccounts', async () => {
        try {
            console.log('[Admin] 수동 계정 동기화 시도...');
            await reportUserActivity();
            return { success: true, message: '패널과 계정 정보 동기화 완료' };
        } catch (error) {
            console.error('[Admin] 계정 동기화 실패:', error);
            return { success: false, message: `동기화 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('admin:verifyPin', async (_event, pin: string): Promise<{ success: boolean; message?: string }> => {
        try {
            const configured = (process.env.ADMIN_PIN || '').trim();
            if (!configured) {
                return { success: false, message: 'ADMIN_PIN이 설정되지 않았습니다.' };
            }
            const input = String(pin || '').trim();
            if (!input) {
                return { success: false, message: 'PIN이 입력되지 않았습니다.' };
            }
            if (input !== configured) {
                return { success: false, message: 'PIN이 올바르지 않습니다.' };
            }
            return { success: true };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });
}
