/**
 * ✅ [2026-01-25 모듈화] HTML 유틸리티 함수
 * - renderer.ts에서 분리됨
 * - HTML 이스케이프 및 마크다운 정리
 */

/**
 * 안전한 HTML 이스케이프 함수 (전역) - 줄바꿈, 탭 문자도 제거
 */
export function escapeHtml(str: string | undefined | null): string {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, ' ')
        .replace(/\r/g, '')
        .replace(/\t/g, ' ');
}

/**
 * 마크다운 볼드(**) 문구 제거 함수 - 발행 전 본문 정리
 */
export function removeMarkdownBold(content: string): string {
    if (!content) return '';
    // **텍스트** 형태를 텍스트로 변환 (볼드 마크다운 제거)
    return content.replace(/\*\*([^*]+)\*\*/g, '$1');
}

// 전역 노출 (기존 코드와의 호환성)
(window as any).escapeHtml = escapeHtml;
(window as any).removeMarkdownBold = removeMarkdownBold;

console.log('[HtmlUtils] 📦 모듈 로드됨!');
