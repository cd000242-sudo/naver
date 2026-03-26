// src/main/ipc/authHandlers.ts
// 인증/라이선스 관련 IPC 핸들러
// ⚠️ [2026-03-26] free:activate, license:checkStatus, quota:getStatus는
//    main.ts에 실제 구현이 존재하므로 여기서 등록하지 않음 (이중 등록 크래시 방지)

import { IpcContext } from '../types';

/**
 * 라이선스 핸들러 등록
 * NOTE: 핵심 핸들러는 main.ts에서 직접 등록됨. 향후 모듈화 시 이동 예정.
 */
export function registerLicenseHandlers(_ctx: IpcContext): void {
    // 모든 핸들러는 main.ts에서 등록됨 — 이중 등록 방지
}

/**
 * 할당량 핸들러 등록
 * NOTE: 핵심 핸들러는 main.ts에서 직접 등록됨. 향후 모듈화 시 이동 예정.
 */
export function registerQuotaHandlers(_ctx: IpcContext): void {
    // 모든 핸들러는 main.ts에서 등록됨 — 이중 등록 방지
}
