/**
 * ✅ [2026-01-25] 안전한 함수 실행 유틸리티
 * - 에러 시 앱 크래시 방지
 * - renderer.ts에서 분리됨
 */

// ✅ [2026-01-20] 안전한 함수 실행 래퍼 - 에러 시 앱 크래시 방지
export function safeExecute<T>(fn: () => T, fallback: T, context?: string): T {
    try {
        return fn();
    } catch (error) {
        console.error(`[SafeExecute] ${context || '함수 실행'} 중 오류:`, error);
        return fallback;
    }
}

// ✅ [2026-01-20] 안전한 비동기 함수 실행 래퍼
export async function safeExecuteAsync<T>(fn: () => Promise<T>, fallback: T, context?: string): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        console.error(`[SafeExecuteAsync] ${context || '비동기 함수 실행'} 중 오류:`, error);
        return fallback;
    }
}

// ✅ [2026-01-20] 안전한 DOM 요소 접근
export function safeGetElement<T extends HTMLElement>(id: string, context?: string): T | null {
    try {
        const el = document.getElementById(id) as T | null;
        if (!el && context) {
            console.warn(`[SafeDOM] ${context}: 요소를 찾을 수 없음 - #${id}`);
        }
        return el;
    } catch (error) {
        console.error(`[SafeDOM] ${context || ''}: 요소 접근 오류 - #${id}`, error);
        return null;
    }
}

// ✅ [2026-01-20] 안전한 이벤트 리스너 등록
export function safeAddEventListener(
    element: Element | null | undefined,
    event: string,
    handler: EventListener,
    context?: string
): void {
    if (!element) {
        if (context) {
            console.warn(`[SafeEvent] ${context}: 요소가 null, 이벤트 리스너 스킵 - ${event}`);
        }
        return;
    }
    try {
        element.addEventListener(event, handler);
    } catch (error) {
        console.error(`[SafeEvent] ${context || ''}: 이벤트 리스너 등록 실패 - ${event}`, error);
    }
}

// 전역에 안전 함수 노출 (기존 코드 호환성 유지)
(window as any).safeExecute = safeExecute;
(window as any).safeExecuteAsync = safeExecuteAsync;
(window as any).safeGetElement = safeGetElement;
(window as any).safeAddEventListener = safeAddEventListener;
