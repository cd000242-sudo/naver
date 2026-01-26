// src/main/ipc/scheduleHandlers.ts
// 예약 발행 관련 IPC 핸들러

import { ipcMain } from 'electron';
import { IpcContext } from '../types';

/**
 * 스케줄 핸들러 등록
 */
export function registerScheduleHandlers(ctx: IpcContext): void {
    // 스케줄 관련 핸들러들
    // TODO: 기존 main.ts의 scheduler:* 로직 이동
    console.log('[scheduleHandlers] Registered (placeholder)');
}
