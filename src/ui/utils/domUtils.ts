// src/ui/utils/domUtils.ts
// DOM 조작 관련 유틸리티 함수들

/**
 * HTML 특수문자 이스케이프
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
 * 마크다운 볼드(**텍스트**) 제거
 */
export function removeMarkdownBold(content: string): string {
    if (!content) return '';
    return content.replace(/\*\*([^*]+)\*\*/g, '$1');
}

/**
 * 안전한 DOM 요소 가져오기
 */
export function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

/**
 * 필수 DOM 요소 가져오기 (없으면 에러)
 */
export function $required<T extends HTMLElement = HTMLElement>(id: string): T {
    const el = document.getElementById(id) as T | null;
    if (!el) {
        throw new Error(`Required element #${id} not found`);
    }
    return el;
}

/**
 * 쿼리 선택자로 첫 번째 요소 가져오기
 */
export function $$<T extends HTMLElement = HTMLElement>(selector: string, parent: ParentNode = document): T | null {
    return parent.querySelector(selector) as T | null;
}

/**
 * 쿼리 선택자로 모든 요소 가져오기
 */
export function $$$<T extends HTMLElement = HTMLElement>(selector: string, parent: ParentNode = document): T[] {
    return Array.from(parent.querySelectorAll(selector)) as T[];
}

/**
 * 요소의 display 토글
 */
export function toggleDisplay(element: HTMLElement | null, show: boolean, displayType: string = 'block'): void {
    if (element) {
        element.style.display = show ? displayType : 'none';
    }
}

/**
 * 요소에 클래스 토글
 */
export function toggleClass(element: HTMLElement | null, className: string, add: boolean): void {
    if (element) {
        element.classList.toggle(className, add);
    }
}
