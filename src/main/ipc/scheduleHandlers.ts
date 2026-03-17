// src/main/ipc/scheduleHandlers.ts
// 예약 발행 관련 IPC 핸들러
// ✅ [2026-02-02] 완전 구현

import { ipcMain } from 'electron';
import { IpcContext } from '../types';
import { SmartScheduler } from '../../scheduler/smartScheduler';

// 싱글톤 스케줄러 인스턴스
let scheduler: SmartScheduler | null = null;

function getScheduler(): SmartScheduler {
    if (!scheduler) {
        scheduler = new SmartScheduler();
    }
    return scheduler;
}

/**
 * 스케줄 핸들러 등록
 */
export function registerScheduleHandlers(ctx: IpcContext): void {
    console.log('[scheduleHandlers] 📅 Registering scheduler handlers...');

    // ✅ 최적 발행 시간 조회
    ipcMain.handle('scheduler:getOptimalTimes', async (_event, count?: number, category?: string) => {
        try {
            const times = getScheduler().getNextOptimalTimes(count || 5, category);
            return {
                success: true,
                times: times.map(t => ({
                    time: t.time.toISOString(),
                    score: t.score,
                    description: t.description
                }))
            };
        } catch (error) {
            console.error('[scheduleHandlers] getOptimalTimes 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ 예약 발행 추가
    ipcMain.handle('scheduler:schedulePost', async (_event, title: string, keyword: string, scheduledAt: string) => {
        try {
            console.log(`[scheduleHandlers] 📅 예약 발행 추가: "${title}" at ${scheduledAt}`);
            const post = getScheduler().schedulePost(title, keyword, scheduledAt);
            return { success: true, post };
        } catch (error) {
            console.error('[scheduleHandlers] schedulePost 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ 최적 시간에 자동 예약
    ipcMain.handle('scheduler:scheduleAtOptimal', async (_event, title: string, keyword: string, category?: string) => {
        try {
            console.log(`[scheduleHandlers] 📅 최적 시간 자동 예약: "${title}"`);
            const post = getScheduler().scheduleAtOptimalTime(title, keyword, category);
            return { success: true, post };
        } catch (error) {
            console.error('[scheduleHandlers] scheduleAtOptimal 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ 예약 취소
    ipcMain.handle('scheduler:cancelSchedule', async (_event, postId: string) => {
        try {
            const success = getScheduler().cancelSchedule(postId);
            return { success, message: success ? '예약이 취소되었습니다.' : '예약을 찾을 수 없습니다.' };
        } catch (error) {
            console.error('[scheduleHandlers] cancelSchedule 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ 모든 예약 조회
    ipcMain.handle('scheduler:getAllScheduled', async () => {
        try {
            const posts = getScheduler().getAllScheduled();
            return { success: true, posts };
        } catch (error) {
            console.error('[scheduleHandlers] getAllScheduled 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ 대기 중인 예약만 조회
    ipcMain.handle('scheduler:getPending', async () => {
        try {
            const posts = getScheduler().getPendingScheduled();
            return { success: true, posts };
        } catch (error) {
            console.error('[scheduleHandlers] getPending 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ 예약 시간 변경
    ipcMain.handle('scheduler:reschedule', async (_event, postId: string, newTime: string) => {
        try {
            const success = getScheduler().reschedule(postId, newTime);
            return { success, message: success ? '예약 시간이 변경되었습니다.' : '예약을 찾을 수 없습니다.' };
        } catch (error) {
            console.error('[scheduleHandlers] reschedule 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ 실패한 예약 재시도
    ipcMain.handle('scheduler:retry', async (_event, postId: string) => {
        try {
            // 실패한 포스트를 찾아서 다시 예약
            const post = getScheduler().getScheduledPost(postId);
            if (!post) {
                return { success: false, message: '예약을 찾을 수 없습니다.' };
            }
            if (post.status !== 'failed') {
                return { success: false, message: '실패한 예약만 재시도할 수 있습니다.' };
            }
            // 현재 시간 + 1분 후로 재예약
            const newTime = new Date(Date.now() + 60 * 1000);
            const success = getScheduler().reschedule(postId, newTime.toISOString());
            return { success, message: success ? '재시도가 예약되었습니다.' : '재시도 실패' };
        } catch (error) {
            console.error('[scheduleHandlers] retry 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ 통계 조회
    ipcMain.handle('scheduler:getStats', async () => {
        try {
            const stats = getScheduler().getStats();
            return { success: true, stats };
        } catch (error) {
            console.error('[scheduleHandlers] getStats 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ 모든 예약 취소
    ipcMain.handle('scheduler:cancelAll', async () => {
        try {
            getScheduler().cancelAll();
            return { success: true, message: '모든 예약이 취소되었습니다.' };
        } catch (error) {
            console.error('[scheduleHandlers] cancelAll 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    console.log('[scheduleHandlers] ✅ Scheduler handlers registered');
}
