// src/ui/managers/ErrorHandler.ts
// 전역 에러 핸들링

import { showToast } from '../components';
import { ERROR_MESSAGES } from '../config';

export interface ErrorContext {
    component?: string;
    action?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 에러 핸들러 클래스
 */
class ErrorHandlerImpl {
    private errorLog: Array<{ error: Error; context: ErrorContext; timestamp: Date }> = [];
    private maxLogSize = 100;

    /**
     * 에러 처리
     */
    handle(error: Error | unknown, context: ErrorContext = {}): void {
        const err = error instanceof Error ? error : new Error(String(error));

        // 로그 저장
        this.log(err, context);

        // 콘솔 출력
        console.error(`[${context.component || 'App'}] ${context.action || 'Error'}:`, err);

        // 사용자에게 표시 (심각도에 따라)
        if (context.severity !== 'low') {
            this.notify(err, context);
        }
    }

    /**
     * 에러 로그 저장
     */
    private log(error: Error, context: ErrorContext): void {
        this.errorLog.push({
            error,
            context,
            timestamp: new Date()
        });

        // 최대 크기 유지
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.shift();
        }
    }

    /**
     * 사용자에게 에러 알림
     */
    private notify(error: Error, context: ErrorContext): void {
        const message = this.getUserFriendlyMessage(error);
        showToast(message, 'error', 5000);
    }

    /**
     * 사용자 친화적 에러 메시지 변환
     */
    private getUserFriendlyMessage(error: Error): string {
        const msg = error.message.toLowerCase();

        if (msg.includes('network') || msg.includes('fetch')) {
            return ERROR_MESSAGES.NETWORK_ERROR;
        }
        if (msg.includes('api key') || msg.includes('apikey')) {
            return ERROR_MESSAGES.API_KEY_MISSING;
        }
        if (msg.includes('login') || msg.includes('auth')) {
            return ERROR_MESSAGES.LOGIN_REQUIRED;
        }

        return error.message || ERROR_MESSAGES.UNKNOWN_ERROR;
    }

    /**
     * 에러 로그 가져오기
     */
    getLog(): Array<{ error: Error; context: ErrorContext; timestamp: Date }> {
        return [...this.errorLog];
    }

    /**
     * 에러 로그 초기화
     */
    clearLog(): void {
        this.errorLog = [];
    }

    /**
     * 함수 래핑 - 에러 자동 핸들링
     */
    wrap<T extends (...args: any[]) => any>(
        fn: T,
        context: ErrorContext = {}
    ): (...args: Parameters<T>) => ReturnType<T> | undefined {
        return (...args: Parameters<T>) => {
            try {
                const result = fn(...args);

                // Promise인 경우 catch 추가
                if (result instanceof Promise) {
                    return result.catch((error) => {
                        this.handle(error, context);
                        return undefined;
                    }) as ReturnType<T>;
                }

                return result;
            } catch (error) {
                this.handle(error, context);
                return undefined;
            }
        };
    }

    /**
     * async 함수 래핑
     */
    wrapAsync<T extends (...args: any[]) => Promise<any>>(
        fn: T,
        context: ErrorContext = {}
    ): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | undefined> {
        return async (...args: Parameters<T>) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.handle(error, context);
                return undefined;
            }
        };
    }
}

// 싱글톤 인스턴스
export const ErrorHandler = new ErrorHandlerImpl();

/**
 * 에러 핸들링 데코레이터 (함수 래핑 헬퍼)
 */
export function withErrorHandling<T extends (...args: any[]) => any>(
    fn: T,
    context: ErrorContext = {}
): (...args: Parameters<T>) => ReturnType<T> | undefined {
    return ErrorHandler.wrap(fn, context);
}

/**
 * async 에러 핸들링 래퍼
 */
export function withAsyncErrorHandling<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context: ErrorContext = {}
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | undefined> {
    return ErrorHandler.wrapAsync(fn, context);
}
