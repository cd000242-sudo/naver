/**
 * 다이얼로그 전용 preload 스크립트
 * quit-confirm, license-input 등 모달 창에서 사용
 * contextIsolation: true 환경에서 안전한 IPC 통신 제공
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dialogAPI', {
  send: (channel: string, ...args: unknown[]) => {
    // 허용된 채널만 전송 가능
    const allowedChannels = ['quit-confirm-response', 'license:code'];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
});
