/**
 * 로그인 창 전용 preload 스크립트
 * contextIsolation: true 환경에서 안전한 IPC 통신 제공
 * 허용된 채널만 노출하여 보안 강화
 */
import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_INVOKE_CHANNELS = [
  'license:getDeviceId',
  'license:verifyWithCredentials',
  'license:register',
  'app:getVersion',
  'config:get',
  'config:save',
  'login:success',
  'quota:getStatus',
  'free:activate',
  'openExternalUrl',
];

const ALLOWED_SEND_CHANNELS = [
  'license:code',
];

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel not allowed: ${channel}`));
  },
  send: (channel: string, ...args: unknown[]) => {
    if (ALLOWED_SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
});
