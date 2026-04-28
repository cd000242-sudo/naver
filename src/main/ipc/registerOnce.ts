// v2.7.28 — IPC ipcMain.handle/on 이중 등록 가드 (Phase 1 P0 #4 첫 단계)
//
// 배경: main.ts에 105개 + main/ipc/* 에 161개 핸들러가 공존. 동일 채널이 두 번 등록되면
//       Electron은 후행 등록을 silently 무시(handle) 또는 listener 누적(on)하여 회귀를 만든다.
//
// 동작: ipcMain.handle/on을 monkey-patch해서 동일 채널 두 번째 호출 시
//       1) handle: 이전 핸들러를 자동 제거 후 신규 등록 (마지막 등록을 살림)
//       2) on:     중복 등록을 무시 (listener 누적 차단)
//   두 경우 모두 console.warn으로 알림.
//
// 사용: main.ts 최상단에서 단 한 번 import하면 적용. 다른 코드는 수정 불필요.
//   import './main/ipc/registerOnce.js';

import { ipcMain } from 'electron';

const registered = new Set<string>();
const originalHandle = ipcMain.handle.bind(ipcMain);
const originalOn = ipcMain.on.bind(ipcMain);

let installed = false;

if (!installed) {
  installed = true;

  (ipcMain as unknown as { handle: typeof ipcMain.handle }).handle = ((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) => {
    const key = `handle:${channel}`;
    if (registered.has(key)) {
      // eslint-disable-next-line no-console
      console.warn(`[IPC Guard] 이중 handle 등록 감지 → 이전 핸들러 제거 후 신규 등록: "${channel}"`);
      try { ipcMain.removeHandler(channel); } catch { /* ignore */ }
    }
    registered.add(key);
    return originalHandle(channel, listener);
  }) as typeof ipcMain.handle;

  (ipcMain as unknown as { on: typeof ipcMain.on }).on = ((channel: string, listener: Parameters<typeof ipcMain.on>[1]) => {
    const key = `on:${channel}`;
    if (registered.has(key)) {
      // eslint-disable-next-line no-console
      console.warn(`[IPC Guard] 이중 on 등록 차단 (listener 누적 방지): "${channel}"`);
      return ipcMain;
    }
    registered.add(key);
    return originalOn(channel, listener);
  }) as typeof ipcMain.on;

  // eslint-disable-next-line no-console
  console.log('[IPC Guard] ipcMain.handle/on 이중 등록 가드 설치 완료');
}

export function getRegisteredIpcChannels(): { handle: string[]; on: string[] } {
  const handle: string[] = [];
  const on: string[] = [];
  for (const k of registered) {
    if (k.startsWith('handle:')) handle.push(k.slice(7));
    else if (k.startsWith('on:')) on.push(k.slice(3));
  }
  return { handle, on };
}

export function getIpcRegistrationCount(): number {
  return registered.size;
}
