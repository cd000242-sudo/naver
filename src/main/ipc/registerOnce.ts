// v2.7.28 — IPC ipcMain.handle/on 이중 등록 가드 (Phase 1 P0 #4 첫 단계)
// ✅ [v2.10.68 ROOT CAUSE FIX] 정책 반전: "마지막 등록 살림" → "첫 등록 살림"
//
// 배경: main.ts에 105개 + main/ipc/* 에 161개 핸들러가 공존. 동일 채널이 두 번 등록되면
//       Electron은 후행 등록을 silently 무시(handle) 또는 listener 누적(on)하여 회귀를 만든다.
//
// v2.10.67까지의 정책 (잘못된 의도):
//   - handle: 이전 핸들러 제거 후 마지막 등록 살림
//   - 의도: silent 무시 방지 → 마지막 등록자가 의도된 것일 거라는 가정
//   - 실제 발생한 문제: main.ts top-level 진짜 구현이 먼저 등록 → app.whenReady() 후
//     main/ipc/* 의 placeholder/미완성 핸들러가 등록 시 main.ts 진짜 구현을 자동 제거 →
//     사용자에게 silent 빈 응답 (예: image:downloadAndSaveMultiple → savedOk=0/48)
//
// v2.10.68 정책 (수정):
//   - handle: 첫 등록만 살림. 후속 등록 시도는 console.warn 후 무시
//   - 이유: main.ts top-level이 먼저 evaluate되어 진짜 구현이 먼저 등록되므로,
//     첫 등록을 살리면 main.ts의 진짜 구현이 항상 우선됨
//   - main/ipc/* 의 placeholder가 main.ts 진짜 구현을 덮어쓰는 회귀 영구 차단
//   - on: 기존과 동일 (중복 등록 무시)
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
      // ✅ [v2.10.68] 첫 등록 살림 정책 — 후속 시도 무시 (main.ts 진짜 구현 보호)
      // eslint-disable-next-line no-console
      console.warn(`[IPC Guard] 이중 handle 등록 차단 (첫 등록 살림): "${channel}" — main.ts 진짜 구현이 main/ipc/* placeholder에 덮어써지는 회귀 차단`);
      return; // 후속 등록 무시
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
