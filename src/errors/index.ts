/**
 * 에러 체계 통합 진입점
 */

export { ErrorCode, ErrorCategory, getErrorProperties, isRetryableCode, isFatalCode, getUserMessage, getCategory } from './errorCodes';
export { AutomationError, classifyErrorMessage } from './AutomationError';
