// src/main/ipc/postAnalyticsHandlers.ts
// 발행 후 성과 추적 IPC 핸들러 (PostAnalytics 기반)
// [v2.10.245] main.ts에서 분리 — god-file 압축 4단계.
//
// ⚠️ 파일명 주의: main/ipc/analyticsHandlers.ts (기존)는 다른 책임을 담당하므로
//    충돌 회피 위해 postAnalyticsHandlers.ts로 명명.
//
// 분리 8개 핸들러:
//   analytics:addPost, startTracking, stopTracking, getStatus,
//   getAllPosts, getAnalytics, updateMetrics, removePost
//
// main.ts의 postAnalytics / analyticsTask / sendLog 의존성을 context로 주입.

import { ipcMain } from 'electron';
import type { PostAnalytics } from '../../analytics/postAnalytics.js';

export interface PostAnalyticsHandlerContext {
    postAnalytics: PostAnalytics;
    /** analyticsTask는 mutable이므로 getter/setter */
    getAnalyticsTask: () => Promise<void> | null;
    setAnalyticsTask: (task: Promise<void> | null) => void;
    sendLog: (message: string) => void;
}

/**
 * analytics:* 8개 IPC 일괄 등록.
 */
export function registerPostAnalyticsHandlers(ctx: PostAnalyticsHandlerContext): void {
    ipcMain.handle('analytics:addPost', async (_event, url: string, title: string) => {
        try {
            ctx.postAnalytics.addPost(url, title);
            return { success: true, message: '글이 추적 목록에 추가되었습니다.' };
        } catch (error) {
            return { success: false, message: `추가 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('analytics:startTracking', async () => {
        try {
            if (ctx.postAnalytics.getIsTracking()) {
                return { success: true, message: '이미 추적 중입니다.' };
            }

            const task = ctx.postAnalytics.startTracking().catch((error) => {
                ctx.sendLog(`⚠️ 성과 추적 오류: ${(error as Error).message}`);
            });
            ctx.setAnalyticsTask(task);

            ctx.sendLog('📊 발행 후 성과 추적 시작');
            return { success: true, message: '성과 추적을 시작했습니다.' };
        } catch (error) {
            return { success: false, message: `추적 시작 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('analytics:stopTracking', async () => {
        try {
            ctx.postAnalytics.stopTracking();
            ctx.sendLog('🛑 성과 추적 중지');
            return { success: true, message: '성과 추적을 중지했습니다.' };
        } catch (error) {
            return { success: false, message: `추적 중지 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('analytics:getStatus', async () => {
        return {
            isTracking: ctx.postAnalytics.getIsTracking(),
            postCount: ctx.postAnalytics.getAllPosts().length,
        };
    });

    ipcMain.handle('analytics:getAllPosts', async () => {
        try {
            const posts = ctx.postAnalytics.getAllPosts();
            return { success: true, posts };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('analytics:getAnalytics', async () => {
        try {
            const analytics = ctx.postAnalytics.getAnalytics();
            return { success: true, analytics };
        } catch (error) {
            return { success: false, message: `분석 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('analytics:updateMetrics', async () => {
        try {
            await ctx.postAnalytics.updateAllMetrics();
            return { success: true, message: '성과 데이터가 업데이트되었습니다.' };
        } catch (error) {
            return { success: false, message: `업데이트 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('analytics:removePost', async (_event, postId: string) => {
        try {
            ctx.postAnalytics.removePost(postId);
            return { success: true, message: '글이 추적 목록에서 제거되었습니다.' };
        } catch (error) {
            return { success: false, message: `제거 실패: ${(error as Error).message}` };
        }
    });

    console.log('[IPC] PostAnalytics handlers registered (8 handlers)');
}
