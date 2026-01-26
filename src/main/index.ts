// src/main/index.ts
// 메인 프로세스 모듈 통합 진입점

// 타입
export * from './types';

// 코어
export { WindowManager } from './core';

// 서비스
export { AutomationService } from './services';

// 유틸리티
export { Logger } from './utils';

// IPC 핸들러
export { registerAllHandlers } from './ipc';
