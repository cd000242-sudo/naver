/**
 * ✅ [2026-01-25 모듈화] 향상된 오류 처리 시스템
 * 
 * 오류 타입, 인터페이스, 처리 함수들
 */

// ============================================
// 오류 타입 정의
// ============================================

export enum ErrorType {
    NETWORK = 'network',
    AUTHENTICATION = 'auth',
    VALIDATION = 'validation',
    API = 'api',
    UNKNOWN = 'unknown'
}

// ============================================
// 오류 정보 인터페이스
// ============================================

export interface ErrorInfo {
    type: ErrorType;
    code: string;
    message: string;
    userMessage: string;
    recoverable: boolean;
    retryable: boolean;
    details?: any;
}

// ============================================
// 오류 처리 함수들
// ============================================

/**
 * 일반 오류 표시
 */
export function showError(message: string, details?: any): void {
    console.error('[Error] 오류 발생:', message, details);

    // 사용자 친화적인 오류 메시지 표시
    const userMessage = `🚨 오류 발생\n\n${message}\n\n문제가 지속되면 관리자에게 문의해주세요.`;

    // 로컬에 오류 로그 저장
    try {
        const errorLog = {
            timestamp: new Date().toISOString(),
            message: message,
            details: details,
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        localStorage.setItem('lastError', JSON.stringify(errorLog));
    } catch (e) {
        console.error('[Error] 오류 로그 저장 실패:', e);
    }

    alert(userMessage);
}

/**
 * API 오류 처리
 */
export function handleApiError(error: any, context: string): void {
    console.error(`[API Error] ${context}:`, error);

    let message = 'API 호출 중 오류가 발생했습니다.';

    if (error?.response?.status === 401) {
        message = '인증 정보가 올바르지 않습니다. API 키를 확인해주세요.';
    } else if (error?.response?.status === 429) {
        message = 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
    } else if (error?.response?.status >= 500) {
        message = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    } else if (error?.code === 'NETWORK_ERROR') {
        message = '네트워크 연결을 확인해주세요.';
    }

    showError(message, error);
}

// ============================================
// 간편 접근용 객체
// ============================================

export const errorHandler = {
    showError,
    handleApiError
};
