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
  'free:requestCode',
  'free:verify',
  /*
   * [2026-09-05] 휴대폰 본인인증·비밀번호 변경.
   * 이 목록에 없으면 preload 가 "Channel not allowed" 로 거절한다 — 메인에
   * 핸들러가 있어도 소용없다. 실제로 본인인증(2026-09-04 추가)은 여기 등록이
   * 빠져 배포된 뒤 단 한 번도 동작하지 않았고, 로그인창이 예외를 console.warn
   * 으로 삼켜서 아무도 몰랐다. 채널을 늘릴 때 이 목록을 같이 늘릴 것.
   */
  'license:phoneStatus',
  'license:phoneRequestCode',
  'license:phoneConfirm',
  'license:passwordResetRequest',
  'license:passwordResetConfirm',
  'openExternalUrl',
  'admin:verifyPin',
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
