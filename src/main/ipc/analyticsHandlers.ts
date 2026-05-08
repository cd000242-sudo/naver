// src/main/ipc/analyticsHandlers.ts
// 분석/트렌드/키워드 관련 IPC 핸들러
//
// ✅ [v2.10.68 FIX] placeholder 핸들러 일괄 제거 (예방)
//   기존: datalab:getTrendSummary / datalab:getSearchTrend / trend:startMonitoring 모두 placeholder
//   문제 가능성: 향후 registerAllHandlers()가 호출되면 main.ts:4849/4884/4926의 진짜 구현이
//                placeholder로 덮어써질 수 있었음 (registerOnce v2.10.67까지 정책 기준)
//   조치 1: registerOnce 정책 반전 (v2.10.68) — 첫 등록 살림으로 main.ts 진짜 구현 보호
//   조치 2: 본 파일의 placeholder도 함께 제거 (이중 방어)

import type { IpcContext } from '../types';

/**
 * 데이터랩 핸들러 등록 — main.ts:4849/4884에 진짜 구현 있음. 본 파일은 no-op.
 */
export function registerDatalabHandlers(_ctx: IpcContext): void {
    // main.ts에 진짜 구현 존재. 여기서는 등록 시도 안 함.
}

/**
 * 트렌드 모니터링 핸들러 등록 — main.ts:4926에 진짜 구현 있음. 본 파일은 no-op.
 */
export function registerTrendHandlers(_ctx: IpcContext): void {
    // main.ts에 진짜 구현 존재. 여기서는 등록 시도 안 함.
}

/**
 * 분석 핸들러 등록
 */
export function registerAnalyticsHandlers(_ctx: IpcContext): void {
    // 분석 관련 핸들러들 추가 예정
}
