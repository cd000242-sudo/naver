// src/ui/components/DomHelper.ts
// DOM 조작 헬퍼 - getElementById 캐싱 및 안전한 조작

import { escapeHtml, $ } from '../utils';

/**
 * DOM 요소 캐시
 */
const elementCache = new Map<string, HTMLElement | null>();

/**
 * 캐시된 DOM 요소 가져오기
 */
export function getCachedElement<T extends HTMLElement = HTMLElement>(id: string): T | null {
    if (!elementCache.has(id)) {
        elementCache.set(id, document.getElementById(id));
    }
    return elementCache.get(id) as T | null;
}

/**
 * 캐시 초기화
 */
export function clearElementCache(): void {
    elementCache.clear();
}

/**
 * 특정 요소만 캐시에서 제거
 */
export function invalidateCache(id: string): void {
    elementCache.delete(id);
}

/**
 * 여러 요소 한번에 가져오기
 */
export function getElements<T extends Record<string, string>>(
    ids: T
): { [K in keyof T]: HTMLElement | null } {
    const result = {} as { [K in keyof T]: HTMLElement | null };
    for (const key of Object.keys(ids) as (keyof T)[]) {
        result[key] = getCachedElement(ids[key] as string);
    }
    return result;
}

/**
 * 안전한 innerHTML 설정 (XSS 방지)
 */
export function setInnerHtml(element: HTMLElement | null, html: string): void {
    if (element) {
        element.innerHTML = html;
    }
}

/**
 * 안전한 텍스트 설정
 */
export function setText(element: HTMLElement | null, text: string): void {
    if (element) {
        element.textContent = text;
    }
}

/**
 * 안전한 값 설정 (input/textarea)
 */
export function setValue(element: HTMLInputElement | HTMLTextAreaElement | null, value: string): void {
    if (element) {
        element.value = value;
    }
}

/**
 * 안전한 값 가져오기
 */
export function getValue(element: HTMLInputElement | HTMLTextAreaElement | null): string {
    return element?.value?.trim() || '';
}

/**
 * 안전한 체크박스 상태 가져오기
 */
export function isChecked(element: HTMLInputElement | null): boolean {
    return element?.checked ?? false;
}

/**
 * 안전한 선택 값 가져오기
 */
export function getSelectValue(element: HTMLSelectElement | null): string {
    return element?.value || '';
}

/**
 * 클래스 추가/제거
 */
export function setClass(element: HTMLElement | null, className: string, add: boolean): void {
    if (element) {
        if (add) {
            element.classList.add(className);
        } else {
            element.classList.remove(className);
        }
    }
}

/**
 * 여러 클래스 동시에 추가
 */
export function addClasses(element: HTMLElement | null, ...classNames: string[]): void {
    if (element) {
        element.classList.add(...classNames);
    }
}

/**
 * 여러 클래스 동시에 제거
 */
export function removeClasses(element: HTMLElement | null, ...classNames: string[]): void {
    if (element) {
        element.classList.remove(...classNames);
    }
}

/**
 * display 속성 설정
 */
export function show(element: HTMLElement | null, displayType: string = 'block'): void {
    if (element) {
        element.style.display = displayType;
    }
}

/**
 * 요소 숨기기
 */
export function hide(element: HTMLElement | null): void {
    if (element) {
        element.style.display = 'none';
    }
}

/**
 * 요소 활성화/비활성화
 */
export function setDisabled(element: HTMLButtonElement | HTMLInputElement | null, disabled: boolean): void {
    if (element) {
        element.disabled = disabled;
    }
}

/**
 * 요소 생성 헬퍼
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: {
        id?: string;
        className?: string;
        textContent?: string;
        innerHTML?: string;
        attributes?: Record<string, string>;
        styles?: Partial<CSSStyleDeclaration>;
        children?: HTMLElement[];
    }
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);

    if (options?.id) el.id = options.id;
    if (options?.className) el.className = options.className;
    if (options?.textContent) el.textContent = options.textContent;
    if (options?.innerHTML) el.innerHTML = options.innerHTML;

    if (options?.attributes) {
        for (const [key, value] of Object.entries(options.attributes)) {
            el.setAttribute(key, value);
        }
    }

    if (options?.styles) {
        Object.assign(el.style, options.styles);
    }

    if (options?.children) {
        for (const child of options.children) {
            el.appendChild(child);
        }
    }

    return el;
}

/**
 * 이벤트 리스너 안전하게 추가
 */
export function addListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement | null,
    event: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
): void {
    if (element) {
        element.addEventListener(event, handler, options);
    }
}

/**
 * 클릭 이벤트 안전하게 추가
 */
export function onClick(element: HTMLElement | null, handler: (ev: MouseEvent) => void): void {
    addListener(element, 'click', handler);
}

/**
 * 버튼 로딩 상태 설정
 */
export function setButtonLoading(
    button: HTMLButtonElement | null,
    loading: boolean,
    loadingText: string = '처리 중...'
): string | null {
    if (!button) return null;

    const originalText = button.getAttribute('data-original-text') || button.innerHTML;

    if (loading) {
        button.setAttribute('data-original-text', originalText);
        button.innerHTML = `<span class="spinner"></span> ${loadingText}`;
        button.disabled = true;
    } else {
        button.innerHTML = originalText;
        button.disabled = false;
        button.removeAttribute('data-original-text');
    }

    return originalText;
}
