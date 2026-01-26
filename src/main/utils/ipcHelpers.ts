// src/main/utils/ipcHelpers.ts
// IPC 통신 헬퍼 함수

import { BrowserWindow } from 'electron';

// 메인 윈도우 참조 (WindowManager에서 가져옴)
let mainWindowRef: BrowserWindow | null = null;

/**
 * 메인 윈도우 참조 설정 (app ready 후 호출)
 */
export function setMainWindowRef(window: BrowserWindow | null): void {
    mainWindowRef = window;
}

/**
 * 메인 윈도우 참조 가져오기
 */
export function getMainWindowRef(): BrowserWindow | null {
    return mainWindowRef;
}

/**
 * 렌더러에 로그 전송
 */
export function sendLog(message: string): void {
    mainWindowRef?.webContents.send('automation:log', message);
}

/**
 * 렌더러에 상태 전송
 */
export function sendStatus(status: { success: boolean; cancelled?: boolean; message?: string; url?: string }): void {
    mainWindowRef?.webContents.send('automation:status', status);
}

/**
 * 렌더러에 메시지 전송 (일반)
 */
export function sendToRenderer(channel: string, ...args: any[]): void {
    mainWindowRef?.webContents.send(channel, ...args);
}

/**
 * 진행 상태 전송
 */
export function sendProgress(percent: number, message?: string): void {
    mainWindowRef?.webContents.send('automation:progress', { percent, message });
}
