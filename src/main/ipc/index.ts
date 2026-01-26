// src/main/ipc/index.ts
// IPC 핸들러 라우터 - 모든 핸들러를 한 곳에서 등록
// 
// ⚠️ 참고: blogHandlers.ts는 로직 함수만 제공하며,
// 실제 핸들러 등록은 아직 main.ts에서 수행됩니다.
// 점진적 마이그레이션 완료 후 이 파일에서 등록합니다.

import { IpcContext } from '../types';
import { WindowManager } from '../core/WindowManager';
import { AutomationService } from '../services/AutomationService';

// 핸들러 모듈 import
import { registerSystemHandlers, registerFileHandlers, registerDialogHandlers } from './systemHandlers';
import { registerImageHandlers, registerMediaHandlers, registerHeadingVideoHandlers } from './imageHandlers';
// blogHandlers는 로직 함수만 export하므로 여기서 register 함수 대신 export
// import { ... } from './blogHandlers'; // 아직 main.ts에서 처리
import { registerDatalabHandlers, registerTrendHandlers, registerAnalyticsHandlers } from './analyticsHandlers';
import { registerLicenseHandlers, registerQuotaHandlers } from './authHandlers';
import { registerScheduleHandlers } from './scheduleHandlers';

/**
 * IPC 컨텍스트 생성
 */
function createIpcContext(): IpcContext {
    return {
        getMainWindow: () => WindowManager.getMainWindow(),
        getAutomationMap: () => AutomationService.getMap(),
        notify: (title, body) => WindowManager.notify(title, body),
        sendToRenderer: (channel, ...args) => WindowManager.sendToRenderer(channel, ...args)
    };
}

/**
 * 모든 IPC 핸들러 등록
 */
export function registerAllHandlers(): void {
    const ctx = createIpcContext();

    console.log('[IPC Router] Registering all handlers...');

    // 시스템/파일/다이얼로그
    registerSystemHandlers(ctx);
    registerFileHandlers(ctx);
    registerDialogHandlers(ctx);

    // 이미지/미디어
    registerImageHandlers(ctx);
    registerMediaHandlers(ctx);
    registerHeadingVideoHandlers(ctx);

    // 블로그/자동화 - 아직 main.ts에서 처리 (점진적 마이그레이션 중)
    // TODO: 마이그레이션 완료 후 아래 주석 해제
    // registerBlogHandlers(ctx);
    // registerAutomationHandlers(ctx);
    // registerGeminiHandlers(ctx);
    // registerContentHandlers(ctx);

    // 분석/트렌드
    registerDatalabHandlers(ctx);
    registerTrendHandlers(ctx);
    registerAnalyticsHandlers(ctx);

    // 인증/라이선스
    registerLicenseHandlers(ctx);
    registerQuotaHandlers(ctx);

    // 스케줄
    registerScheduleHandlers(ctx);

    console.log('[IPC Router] All handlers registered successfully');
}

// 개별 핸들러도 export (필요 시 선택적 등록 가능)
export {
    registerSystemHandlers,
    registerFileHandlers,
    registerDialogHandlers,
    registerImageHandlers,
    registerMediaHandlers,
    registerHeadingVideoHandlers,
    // blogHandlers는 로직 함수만 제공 (main.ts에서 처리)
    // registerBlogHandlers,
    // registerAutomationHandlers,
    // registerGeminiHandlers,
    // registerContentHandlers,
    registerDatalabHandlers,
    registerTrendHandlers,
    registerAnalyticsHandlers,
    registerLicenseHandlers,
    registerQuotaHandlers,
    registerScheduleHandlers
};

// blogHandlers 로직 함수 re-export
export * from './blogHandlers';
