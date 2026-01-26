// src/main/services/index.ts
// 서비스 모듈 통합 export

export { AutomationService } from './AutomationService';
export type {
    PostCyclePayload,
    PostCycleContext,
    PostCycleResult
} from './AutomationService';

// BlogExecutor (발행 비즈니스 로직)
export {
    injectDependencies,
    runFullPostCycle,
} from './BlogExecutor';
export type { ExecutionDependencies } from './BlogExecutor';
