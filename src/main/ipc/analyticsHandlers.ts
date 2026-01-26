// src/main/ipc/analyticsHandlers.ts
// 분석/트렌드/키워드 관련 IPC 핸들러

import { ipcMain } from 'electron';
import { IpcContext } from '../types';

/**
 * 데이터랩 핸들러 등록
 */
export function registerDatalabHandlers(ctx: IpcContext): void {
    // 트렌드 요약
    ipcMain.handle('datalab:getTrendSummary', async (_event, keyword: string) => {
        // TODO: 기존 main.ts의 datalab:getTrendSummary 로직 이동
        console.log('[datalabHandlers] datalab:getTrendSummary - placeholder');
        return { success: false };
    });

    // 검색 트렌드
    ipcMain.handle('datalab:getSearchTrend', async (_event, ...args: any[]) => {
        // TODO: 기존 main.ts의 datalab:getSearchTrend 로직 이동
        console.log('[datalabHandlers] datalab:getSearchTrend - placeholder');
        return { success: false };
    });
}

/**
 * 트렌드 모니터링 핸들러 등록
 */
export function registerTrendHandlers(ctx: IpcContext): void {
    // 모니터링 시작
    ipcMain.handle('trend:startMonitoring', async () => {
        // TODO: 기존 main.ts의 trend:startMonitoring 로직 이동
        console.log('[trendHandlers] trend:startMonitoring - placeholder');
        return { success: false };
    });
}

/**
 * 분석 핸들러 등록
 */
export function registerAnalyticsHandlers(ctx: IpcContext): void {
    // 분석 관련 핸들러들 추가 예정
    console.log('[analyticsHandlers] Registered');
}
