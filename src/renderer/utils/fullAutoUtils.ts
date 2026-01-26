/**
 * ✅ [2026-01-25 모듈화] 전체 자동 발행 제어 유틸리티
 * - renderer.ts에서 분리됨
 * - 발행 중지 요청 및 상태 확인
 */

// 전역 ProgressModal 타입 참조
declare class ProgressModal {
    cancelled: boolean;
}

/**
 * 전체 자동 발행 중지 요청 확인
 */
export function isFullAutoStopRequested(modal?: ProgressModal | null): boolean {
    if (modal?.cancelled) return true;
    return (window as any).stopFullAutoPublish === true;
}

/**
 * 전체 자동 발행 중지 요청
 */
export async function requestStopFullAutoPublish(): Promise<void> {
    (window as any).stopFullAutoPublish = true;
    (window as any).stopBatchPublish = true; // ✅ 일괄 발행 중지도 지원
    try {
        await window.api.cancelAutomation();
    } catch {
        // ignore
    }
}

/**
 * 리뷰 소제목 시드 정규화
 */
export function normalizeReviewHeadingSeed(seed: string): string {
    return String(seed || '').trim().replace(/[\s\u00A0]+/g, ' ');
}

/**
 * 리뷰 소제목 접두어 적용
 */
export function applyReviewHeadingPrefix(structuredContent: any, seed: string): void {
    const ct = (window as any).selectedContentType || 'info';
    if (ct !== 'review') return;
    if (!structuredContent || !Array.isArray(structuredContent.headings)) return;
}

// 전역 노출 (하위 호환성)
(window as any).isFullAutoStopRequested = isFullAutoStopRequested;
(window as any).requestStopFullAutoPublish = requestStopFullAutoPublish;

console.log('[FullAutoUtils] 📦 모듈 로드됨!');
