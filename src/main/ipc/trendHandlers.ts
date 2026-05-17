// src/main/ipc/trendHandlers.ts
// 실시간 트렌드 모니터링 IPC 핸들러
// [v2.10.244] main.ts에서 분리 — god-file 압축 3단계.
//
// 분리 6개 핸들러:
//   trend:startMonitoring, trend:stopMonitoring, trend:getStatus,
//   trend:setAlertEnabled, trend:getCurrentTrends, trend:setInterval
//
// main.ts의 trendMonitor / monitorTask / trendAlertEnabled / sendLog 의존성을
// TrendHandlerContext getter/setter 로 주입 받음.

import { ipcMain } from 'electron';
import type { TrendMonitor } from '../../monitor/trendMonitor.js';

/**
 * Trend 핸들러 컨텍스트 — main.ts의 모듈 변수를 안전하게 노출.
 */
export interface TrendHandlerContext {
    trendMonitor: TrendMonitor;
    /** monitorTask는 mutable이므로 getter/setter로 노출 */
    getMonitorTask: () => Promise<void> | null;
    setMonitorTask: (task: Promise<void> | null) => void;
    /** trendAlertEnabled도 mutable */
    getTrendAlertEnabled: () => boolean;
    setTrendAlertEnabled: (enabled: boolean) => void;
    /** sendLog는 함수 참조 */
    sendLog: (message: string) => void;
}

/**
 * trend:* 6개 IPC 일괄 등록.
 */
export function registerTrendHandlers(ctx: TrendHandlerContext): void {
    ipcMain.handle('trend:startMonitoring', async () => {
        try {
            if (ctx.trendMonitor.getIsMonitoring()) {
                return { success: true, message: '이미 모니터링 중입니다.' };
            }

            const task = ctx.trendMonitor.monitorRealtime().catch((error) => {
                ctx.sendLog(`⚠️ 실시간 모니터링 오류: ${(error as Error).message}`);
            });
            ctx.setMonitorTask(task);

            ctx.sendLog('👀 실시간 트렌드 모니터링 시작');
            return { success: true, message: '실시간 트렌드 모니터링을 시작했습니다.' };
        } catch (error) {
            return { success: false, message: `모니터링 시작 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('trend:stopMonitoring', async () => {
        try {
            ctx.trendMonitor.stop();
            ctx.sendLog('🛑 실시간 트렌드 모니터링 중지');
            return { success: true, message: '실시간 트렌드 모니터링을 중지했습니다.' };
        } catch (error) {
            return { success: false, message: `모니터링 중지 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('trend:getStatus', async () => {
        return {
            isMonitoring: ctx.trendMonitor.getIsMonitoring(),
            alertEnabled: ctx.getTrendAlertEnabled(),
        };
    });

    ipcMain.handle('trend:setAlertEnabled', async (_event, enabled: boolean) => {
        ctx.setTrendAlertEnabled(enabled);
        ctx.sendLog(`🔔 트렌드 알림 ${enabled ? '활성화' : '비활성화'}`);
        return { success: true, enabled };
    });

    ipcMain.handle('trend:getCurrentTrends', async () => {
        try {
            const trends = await ctx.trendMonitor.getCurrentTrends();
            return { success: true, trends };
        } catch (error) {
            return { success: false, message: `트렌드 조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('trend:setInterval', async (_event, intervalMs: number) => {
        ctx.trendMonitor.setMonitorInterval(intervalMs);
        return { success: true, interval: intervalMs };
    });

    console.log('[IPC] Trend handlers registered (6 handlers)');
}
