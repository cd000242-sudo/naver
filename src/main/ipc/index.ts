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
import { registerImageHandlers, registerMediaHandlers } from './imageHandlers';
import { registerHeadingHandlers, HeadingHandlerDeps } from './headingHandlers';
// blogHandlers는 로직 함수만 export하므로 여기서 register 함수 대신 export
// import { ... } from './blogHandlers'; // 아직 main.ts에서 처리
import { registerDatalabHandlers, registerTrendHandlers, registerAnalyticsHandlers } from './analyticsHandlers';
import { registerLicenseHandlers } from './authHandlers';
import { registerQuotaHandlers } from './quotaHandlers';
import { registerScheduleHandlers, SchedulerHandlerDeps } from './scheduleHandlers';
import { registerAccountHandlers, AccountHandlerDeps } from './accountHandlers';
import { registerConfigHandlers, ConfigHandlerContext } from './configHandlers';
import { registerKeywordHandlers } from './keywordHandlers';
import { registerProductHandlers } from './productHandlers';
import { registerEngagementHandlers } from './engagementHandlers';
import { registerContentHandlers, ContentHandlerDeps } from './contentHandlers';
import { registerAdminHandlers, AdminHandlerDeps } from './adminHandlers';
import { registerApiHandlers } from './apiHandlers';
import { registerImageTableHandlers } from './imageTableHandlers';
import { registerMiscHandlers } from './miscHandlers';

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

    // 이미지 테이블/배너 (비교표, 장단점, 배너, 테스트 이미지)
    registerImageTableHandlers();

    // 이미지/미디어
    registerImageHandlers(ctx);
    registerMediaHandlers(ctx);
    // registerHeadingHandlers(deps); — deps가 필요하므로 main.ts에서 별도 호출

    // 블로그/자동화 - 아직 main.ts에서 처리 (점진적 마이그레이션 중)
    // TODO: 마이그레이션 완료 후 아래 주석 해제
    // registerBlogHandlers(ctx);
    // registerAutomationHandlers(ctx);
    // registerGeminiHandlers(ctx);
    // registerContentHandlers(deps); — deps가 필요하므로 main.ts에서 별도 호출

    // 분석/트렌드
    registerDatalabHandlers(ctx);
    registerTrendHandlers(ctx);
    registerAnalyticsHandlers(ctx);

    // API/Gemini
    registerApiHandlers(ctx);

    // 인증/라이선스
    registerLicenseHandlers(ctx);
    registerQuotaHandlers(ctx);

    // 스케줄 — smartScheduler deps가 필요하므로 main.ts에서 별도 호출
    // registerScheduleHandlers({ smartScheduler });

    // 키워드 분석
    registerKeywordHandlers();

    // 베스트 상품
    registerProductHandlers();

    // 댓글/경쟁분석
    registerEngagementHandlers();

    // 기타 (튜토리얼, 이미지 저장, 콘텐츠 수집, SEO)
    registerMiscHandlers();

    // 관리자 패널 — deps가 필요하므로 main.ts에서 별도 호출
    // registerAdminHandlers(deps);

    // 계정 관리 — deps가 필요하므로 registerAccountHandlersWithDeps()로 별도 호출
    // registerAccountHandlers(ctx, deps);

    // 설정(config) — appConfig 접근이 필요하므로 main.ts에서 별도 호출
    // registerConfigHandlers(configCtx);

    console.log('[IPC Router] All handlers registered successfully');
}

// 개별 핸들러도 export (필요 시 선택적 등록 가능)
export {
    registerSystemHandlers,
    registerFileHandlers,
    registerDialogHandlers,
    registerImageHandlers,
    registerMediaHandlers,
    registerHeadingHandlers,
    // blogHandlers는 로직 함수만 제공 (main.ts에서 처리)
    // registerBlogHandlers,
    // registerAutomationHandlers,
    // registerGeminiHandlers,
    registerContentHandlers,
    registerApiHandlers,
    registerDatalabHandlers,
    registerTrendHandlers,
    registerAnalyticsHandlers,
    registerLicenseHandlers,
    registerQuotaHandlers,
    registerScheduleHandlers,
    registerAccountHandlers,
    registerConfigHandlers,
    registerKeywordHandlers,
    registerProductHandlers,
    registerEngagementHandlers,
    registerAdminHandlers,
    registerImageTableHandlers,
    registerMiscHandlers
};

export type { AccountHandlerDeps, AdminHandlerDeps, ConfigHandlerContext, ContentHandlerDeps, HeadingHandlerDeps, SchedulerHandlerDeps };

// blogHandlers 로직 함수 re-export
export * from './blogHandlers';
