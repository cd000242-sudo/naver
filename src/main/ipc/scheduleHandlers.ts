// src/main/ipc/scheduleHandlers.ts
// 예약 발행 관련 IPC 핸들러 (scheduler:* 채널)
// Dependency Injection 패턴 적용

import { ipcMain } from 'electron';
import { sendLog } from '../utils/ipcHelpers.js';

export interface SchedulerHandlerDeps {
    smartScheduler: any; // SmartScheduler instance
}

/**
 * 스케줄러 핸들러 등록 (scheduler:* 채널 10개)
 */
export function registerScheduleHandlers(deps: SchedulerHandlerDeps): void {
    const { smartScheduler } = deps;

    console.log('[scheduleHandlers] Registering scheduler handlers...');

    // 최적 발행 시간 조회
    ipcMain.handle('scheduler:getOptimalTimes', async (_event, count: number = 5, category?: string) => {
        try {
            const times = smartScheduler.getNextOptimalTimes(count, category);
            return { success: true, times };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    // 예약 발행 추가
    ipcMain.handle('scheduler:schedulePost', async (_event, title: string, keyword: string, scheduledAt: string) => {
        try {
            const post = smartScheduler.schedulePost(title, keyword, scheduledAt);
            sendLog(`예약 발행 등록: ${title} (${new Date(scheduledAt).toLocaleString()})`);
            return { success: true, post };
        } catch (error) {
            return { success: false, message: `예약 실패: ${(error as Error).message}` };
        }
    });

    // 최적 시간에 자동 예약
    ipcMain.handle('scheduler:scheduleAtOptimal', async (_event, title: string, keyword: string, category?: string) => {
        try {
            const post = smartScheduler.scheduleAtOptimalTime(title, keyword, category);
            sendLog(`최적 시간 예약: ${title} (${new Date(post.scheduledAt).toLocaleString()})`);
            return { success: true, post };
        } catch (error) {
            return { success: false, message: `예약 실패: ${(error as Error).message}` };
        }
    });

    // 예약 취소
    ipcMain.handle('scheduler:cancelSchedule', async (_event, postId: string) => {
        try {
            const result = smartScheduler.cancelSchedule(postId);
            if (result) {
                sendLog('예약 취소됨');
                return { success: true, message: '예약이 취소되었습니다.' };
            }
            return { success: false, message: '취소할 수 없는 예약입니다.' };
        } catch (error) {
            return { success: false, message: `취소 실패: ${(error as Error).message}` };
        }
    });

    // 모든 예약 조회
    ipcMain.handle('scheduler:getAllScheduled', async () => {
        try {
            const posts = smartScheduler.getAllScheduled();
            return { success: true, posts };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    // 대기 중인 예약만 조회
    ipcMain.handle('scheduler:getPending', async () => {
        try {
            const posts = smartScheduler.getPendingScheduled();
            return { success: true, posts };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    // 예약 시간 변경
    ipcMain.handle('scheduler:reschedule', async (_event, postId: string, newTime: string) => {
        try {
            const result = smartScheduler.reschedule(postId, newTime);
            if (result) {
                sendLog(`예약 시간 변경: ${new Date(newTime).toLocaleString()}`);
                return { success: true, message: '예약 시간이 변경되었습니다.' };
            }
            return { success: false, message: '변경할 수 없는 예약입니다.' };
        } catch (error) {
            return { success: false, message: `변경 실패: ${(error as Error).message}` };
        }
    });

    // 실패한 예약 즉시 재시도
    ipcMain.handle('scheduler:retry', async (_event, postId: string) => {
        try {
            const post = smartScheduler.getScheduledPost(postId);
            if (!post) {
                return { success: false, message: '해당 예약을 찾을 수 없습니다.' };
            }

            if (post.status !== 'failed') {
                return { success: false, message: '실패한 예약만 재시도할 수 있습니다.' };
            }

            // 현재 시간 + 10초 후로 예약 변경 (즉시 실행)
            const retryTime = new Date(Date.now() + 10 * 1000).toISOString();
            const result = smartScheduler.reschedule(postId, retryTime);

            if (result) {
                sendLog(`예약 재시도: ${post.title}`);
                return { success: true, message: '재시도가 예약되었습니다. 잠시 후 자동 발행됩니다.' };
            }
            return { success: false, message: '재시도 예약에 실패했습니다.' };
        } catch (error) {
            return { success: false, message: `재시도 실패: ${(error as Error).message}` };
        }
    });

    // 통계 조회
    ipcMain.handle('scheduler:getStats', async () => {
        try {
            const stats = smartScheduler.getStats();
            return { success: true, stats };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    // 모든 예약 취소
    ipcMain.handle('scheduler:cancelAll', async () => {
        try {
            smartScheduler.cancelAll();
            sendLog('모든 예약 취소됨');
            return { success: true, message: '모든 예약이 취소되었습니다.' };
        } catch (error) {
            return { success: false, message: `취소 실패: ${(error as Error).message}` };
        }
    });

    console.log('[scheduleHandlers] Scheduler handlers registered (10 channels)');
}
