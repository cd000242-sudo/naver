// src/main/ipc/scheduleApiHandlers.ts
// 예약 발행 관리 IPC 핸들러
// [v2.10.257] main.ts에서 분리 — god-file 압축 16단계.
//
// ⚠️ 파일명 주의: 기존 scheduleHandlers.ts와 충돌 회피 위해 scheduleApiHandlers.ts.
//
// 분리 4개 핸들러:
//   schedule:getAll, schedule:remove, schedule:reschedule, schedule:retry

import { ipcMain } from 'electron';
import {
    removeScheduledPost,
    getAllScheduledPosts,
    rescheduleScheduledPost,
    retryScheduledPost as retryScheduledPostFn,
    type ScheduledPost,
} from '../../scheduledPostsManager.js';
import { ensureLicenseValid } from '../utils/authUtils.js';

export interface ScheduleApiHandlerContext {
    sendLog: (message: string) => void;
}

export function registerScheduleApiHandlers(ctx: ScheduleApiHandlerContext): void {
    ipcMain.handle('schedule:getAll', async (): Promise<{ success: boolean; posts?: ScheduledPost[]; message?: string }> => {
        // 라이선스 체크
        if (!(await ensureLicenseValid())) {
            return { success: false, message: '라이선스 인증이 필요합니다. 라이선스를 인증해주세요.' };
        }
        try {
            const posts = await getAllScheduledPosts();
            return { success: true, posts };
        } catch (error) {
            console.error('[Main] 스케줄 조회 실패:', (error as Error).message);
            return { success: false, message: (error as Error).message };
        }
    });

    ipcMain.handle('schedule:remove', async (_event, postId: string): Promise<{ success: boolean; message?: string }> => {
        // 라이선스 체크
        if (!(await ensureLicenseValid())) {
            return { success: false, message: '라이선스 인증이 필요합니다. 라이선스를 인증해주세요.' };
        }
        try {
            if (!postId || !postId.trim()) {
                return { success: false, message: '포스트 ID가 비어있습니다.' };
            }

            await removeScheduledPost(postId);
            console.log(`[Main] 스케줄 포스트 삭제 완료: ${postId}`);
            return { success: true };
        } catch (error) {
            console.error('[Main] 스케줄 포스트 삭제 실패:', (error as Error).message);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [2026-03-14 FIX] 예약 시간 변경 IPC 핸들러
    ipcMain.handle('schedule:reschedule', async (_event, postId: string, newTime: string): Promise<{ success: boolean; message?: string }> => {
        if (!(await ensureLicenseValid())) {
            return { success: false, message: '라이선스 인증이 필요합니다.' };
        }
        try {
            if (!postId || !newTime) {
                return { success: false, message: '포스트 ID와 새 시간이 필요합니다.' };
            }
            await rescheduleScheduledPost(postId, newTime);
            ctx.sendLog(`📅 예약 시간 변경 완료: ${newTime}`);
            return { success: true, message: '예약 시간이 변경되었습니다.' };
        } catch (error) {
            console.error('[Main] 예약 시간 변경 실패:', (error as Error).message);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [2026-03-14 FIX] 실패한 예약 재시도 IPC 핸들러
    ipcMain.handle('schedule:retry', async (_event, postId: string): Promise<{ success: boolean; message?: string }> => {
        if (!(await ensureLicenseValid())) {
            return { success: false, message: '라이선스 인증이 필요합니다.' };
        }
        try {
            if (!postId) {
                return { success: false, message: '포스트 ID가 필요합니다.' };
            }
            await retryScheduledPostFn(postId);
            ctx.sendLog(`🔄 예약 재시도 등록 완료`);
            return { success: true, message: '1분 후 재시도됩니다.' };
        } catch (error) {
            console.error('[Main] 예약 재시도 실패:', (error as Error).message);
            return { success: false, message: (error as Error).message };
        }
    });

    console.log('[IPC] Schedule API handlers registered (4 handlers)');
}
