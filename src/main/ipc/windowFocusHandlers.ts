// src/main/ipc/windowFocusHandlers.ts
// [2026-08-17] 포커스 스턱 복구 — 렌더러 dialogFocusGuard와 한 쌍.
//
// 1) window:refocus IPC — 네이티브 팝업(alert/confirm/prompt)이 닫힌 직후
//    렌더러가 호출. blur→focus로 OS 입력 라우팅을 리셋한다 ("바탕화면 한 번
//    클릭"의 자동화). 창이 안 보이거나 최소화면 아무것도 하지 않아 사용자
//    포커스를 훔치지 않는다.
// 2) patchNativeDialogsForFocus() — 메인 프로세스 파일/메시지 다이얼로그
//    (showOpenDialog/showSaveDialog/showMessageBox)도 같은 버그를 유발하므로
//    dialog 모듈을 한 곳에서 패치해 닫힌 뒤 부모 창을 리셋한다.

import { ipcMain, dialog, BrowserWindow } from 'electron';

const LOG = '[WindowFocus]';

/** blur→focus 리셋. 보이는 비최소화 창에만 적용 (포커스 강탈 방지). */
export function refocusWindow(win: BrowserWindow | null | undefined): void {
  try {
    if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
    win.blur();
    win.focus();
  } catch { /* 창이 닫히는 중이면 무시 */ }
}

export function registerWindowFocusHandlers(): void {
  ipcMain.handle('window:refocus', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    refocusWindow(win);
    return { success: true };
  });
}

/**
 * dialog.showOpenDialog / showSaveDialog / showMessageBox를 원본 그대로
 * 감싸서, 닫힌 뒤 대상 창(BrowserWindow 인자 또는 포커스 창)을 리셋한다.
 * 호출부 수정 없이 전 지점 커버 — 반환값·시그니처 불변.
 */
export function patchNativeDialogsForFocus(): void {
  const wrapAsync = <K extends 'showOpenDialog' | 'showSaveDialog' | 'showMessageBox'>(method: K): void => {
    const original = (dialog[method] as (...args: any[]) => Promise<any>).bind(dialog);
    (dialog as any)[method] = async (...args: any[]): Promise<any> => {
      const targetWin = args[0] instanceof BrowserWindow
        ? (args[0] as BrowserWindow)
        : BrowserWindow.getFocusedWindow();
      try {
        return await original(...args);
      } finally {
        refocusWindow(targetWin);
      }
    };
  };
  wrapAsync('showOpenDialog');
  wrapAsync('showSaveDialog');
  wrapAsync('showMessageBox');
  console.log(`${LOG} ✅ 네이티브 다이얼로그 포커스 패치 설치 (open/save/messageBox)`);
}
