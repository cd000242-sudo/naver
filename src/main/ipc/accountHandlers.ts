// src/main/ipc/accountHandlers.ts
// 계정 관리 관련 IPC 핸들러
// ✅ [2026-04-03] main.ts에서 추출

import { ipcMain } from 'electron';
import { IpcContext } from '../types';
import { BlogAccountManager } from '../../account/blogAccountManager.js';

/**
 * 계정 핸들러 의존성
 */
export interface AccountHandlerDeps {
    blogAccountManager: BlogAccountManager;
    reportUserActivity: () => Promise<void>;
}

/**
 * 계정 관련 핸들러 등록
 */
export function registerAccountHandlers(ctx: IpcContext, deps: AccountHandlerDeps): void {
    const { blogAccountManager, reportUserActivity } = deps;

    // ✅ 다중 블로그 관리 IPC 핸들러
    ipcMain.handle('account:add', async (_event, name: string, blogId: string, naverId?: string, naverPassword?: string, settings?: any) => {
        try {
            const account = blogAccountManager.addAccount(name, blogId, naverId, naverPassword, settings);

            // ✅ 계정 추가 시 패널에 동기화
            reportUserActivity().catch(err => console.error('[Main] Sync after add failed:', err));

            return { success: true, account };
        } catch (error) {
            return { success: false, message: `추가 실패: ${(error as Error).message}` };
        }
    });

    // ✅ 계정 로그인 정보 가져오기
    ipcMain.handle('account:getCredentials', async (_event, accountId: string) => {
        try {
            const credentials = blogAccountManager.getAccountCredentials(accountId);
            return { success: true, credentials };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    // ✅ 계정 로그인 정보 업데이트
    ipcMain.handle('account:updateCredentials', async (_event, accountId: string, naverId: string, naverPassword: string) => {
        try {
            const result = blogAccountManager.updateAccountCredentials(accountId, naverId, naverPassword);
            return { success: result, message: result ? '로그인 정보 업데이트 완료' : '계정을 찾을 수 없습니다.' };
        } catch (error) {
            return { success: false, message: `업데이트 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('account:update', async (_event, accountId: string, updates: any) => {
        try {
            const success = blogAccountManager.updateAccount(accountId, updates);
            if (success) {
                // ✅ 계정 수정 시 패널에 동기화
                reportUserActivity().catch(err => console.error('[Main] Sync after update failed:', err));
            }
            return { success };
        } catch (error) {
            return { success: false, message: `업데이트 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('account:remove', async (_event, accountId: string) => {
        try {
            const success = blogAccountManager.removeAccount(accountId);
            if (success) {
                // ✅ 계정 삭제 시 패널에 동기화
                reportUserActivity().catch(err => console.error('[Main] Sync after remove failed:', err));
            }
            return { success };
        } catch (error) {
            return { success: false, message: `삭제 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('account:setActive', async (_event, accountId: string) => {
        try {
            const result = blogAccountManager.setActiveAccount(accountId);
            return { success: result };
        } catch (error) {
            return { success: false, message: `설정 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('account:getActive', async () => {
        try {
            const account = blogAccountManager.getActiveAccount();
            return { success: true, account };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('account:getAll', async () => {
        try {
            const accounts = blogAccountManager.getAllAccounts();
            return { success: true, accounts };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('account:getNext', async () => {
        try {
            const account = blogAccountManager.getNextAccountForPublish();
            return { success: true, account };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('account:getStats', async (_event, accountId: string) => {
        try {
            const stats = blogAccountManager.getAccountStats(accountId);
            return { success: true, stats };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('account:getTotalStats', async () => {
        try {
            const stats = blogAccountManager.getTotalStats();
            return { success: true, stats };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('account:toggle', async (_event, accountId: string) => {
        try {
            const isActive = blogAccountManager.toggleAccountActive(accountId);

            // ✅ 활성화 상태 변경 시 패널에 동기화
            reportUserActivity().catch(err => console.error('[Main] Sync after toggle failed:', err));

            return { success: true, isActive };
        } catch (error) {
            return { success: false, message: `토글 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('account:recordPublish', async (_event, accountId: string) => {
        try {
            blogAccountManager.recordPublish(accountId);
            return { success: true };
        } catch (error) {
            return { success: false, message: `기록 실패: ${(error as Error).message}` };
        }
    });

    // ✅ 계정 설정 업데이트 (개별 설정 포함)
    ipcMain.handle('account:updateSettings', async (_event, accountId: string, settings: any) => {
        try {
            const result = blogAccountManager.updateAccountSettings(accountId, settings);
            return { success: result, message: result ? '설정 업데이트 완료' : '계정을 찾을 수 없습니다.' };
        } catch (error) {
            return { success: false, message: `설정 업데이트 실패: ${(error as Error).message}` };
        }
    });

    // ✅ [2026-03-27] 전체 계정 일괄 Sticky Proxy 설정
    // 전역 blogAccountManager 인스턴스를 직접 사용 → 인메모리 캐시 일관성 보장
    ipcMain.handle('proxy:bulkSetupSticky', async () => {
        try {
            const { getSmartProxyConfig } = require('../../crawler/utils/proxyManager.js');
            const config = getSmartProxyConfig();
            const accounts = blogAccountManager.getAllAccounts();

            // FNV-1a hash (systemHandlers.ts와 동일 알고리즘)
            const fnv1a = (str: string): string => {
                let hash = 0x811c9dc5;
                for (let i = 0; i < str.length; i++) {
                    hash ^= str.charCodeAt(i);
                    hash = Math.imul(hash, 0x01000193);
                }
                return (hash >>> 0).toString(16).padStart(8, '0');
            };

            let updated = 0;
            let skipped = 0;

            for (const account of accounts) {
                if (account.settings?.proxyHost) { skipped++; continue; }

                const naverId = account.naverId || account.blogId || account.name;
                if (!naverId) { skipped++; continue; }

                const sessionId = fnv1a(naverId.trim());
                const stickyUsername = `${config.username}-session-${sessionId}-sessionduration-1440`;

                blogAccountManager.updateAccountSettings(account.id, {
                    proxyHost: config.host,
                    proxyPort: String(config.port),
                    proxyUsername: stickyUsername,
                    proxyPassword: config.password,
                });
                updated++;
            }

            return {
                success: true,
                message: `✅ ${updated}개 계정에 프록시 설정 완료 (${skipped}개 건너뜀 — 이미 설정됨)`,
                updated, skipped, total: accounts.length,
            };
        } catch (error) {
            return { success: false, message: `일괄 설정 실패: ${(error as Error).message}` };
        }
    });

    // ✅ 계정별 다음 콘텐츠 소스 가져오기
    ipcMain.handle('account:getNextContentSource', async (_event, accountId: string) => {
        try {
            const source = blogAccountManager.getNextContentSource(accountId);
            return { success: true, source };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    console.log('[accountHandlers] ✅ 계정 핸들러 등록 완료 (17 handlers)');
}
