// src/ui/managers/EventManager.ts
// 이벤트 리스너 관리 및 등록

import { getCachedElement, onClick, addListener, show, hide } from '../components';
import { debounce } from '../utils';
import { GlobalStore } from '../store/GlobalStore';
import { ApiBridge } from '../services/ApiBridge';

type EventHandler = (...args: any[]) => void;

/**
 * 이벤트 리스너 관리자
 * 모든 이벤트 리스너를 중앙 관리
 */
class EventManagerImpl {
    private listeners: Map<string, EventHandler[]> = new Map();
    private cleanupFunctions: (() => void)[] = [];

    /**
     * 이벤트 리스너 등록
     */
    register(
        elementId: string,
        event: keyof HTMLElementEventMap,
        handler: EventHandler,
        options?: { debounce?: number; once?: boolean }
    ): void {
        const element = getCachedElement(elementId);
        if (!element) {
            console.warn(`[EventManager] Element #${elementId} not found`);
            return;
        }

        let finalHandler = handler;

        // 디바운스 적용
        if (options?.debounce) {
            finalHandler = debounce(handler, options.debounce);
        }

        // 이벤트 리스너 추가
        element.addEventListener(event, finalHandler, { once: options?.once });

        // 정리 함수 저장
        this.cleanupFunctions.push(() => {
            element.removeEventListener(event, finalHandler);
        });

        // 리스너 맵에 저장
        const key = `${elementId}:${event}`;
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key)!.push(handler);
    }

    /**
     * 클릭 이벤트 간편 등록
     */
    onClick(elementId: string, handler: EventHandler): void {
        this.register(elementId, 'click', handler);
    }

    /**
     * 변경 이벤트 간편 등록 (디바운스 기본 적용)
     */
    onChange(elementId: string, handler: EventHandler, debounceMs: number = 300): void {
        this.register(elementId, 'change', handler, { debounce: debounceMs });
    }

    /**
     * 입력 이벤트 간편 등록 (디바운스 기본 적용)
     */
    onInput(elementId: string, handler: EventHandler, debounceMs: number = 300): void {
        this.register(elementId, 'input', handler, { debounce: debounceMs });
    }

    /**
     * 키보드 이벤트 등록
     */
    onKeydown(elementId: string, handler: (e: KeyboardEvent) => void): void {
        this.register(elementId, 'keydown', handler as EventHandler);
    }

    /**
     * 전역 키보드 이벤트 등록
     */
    onGlobalKeydown(handler: (e: KeyboardEvent) => void): void {
        document.addEventListener('keydown', handler);
        this.cleanupFunctions.push(() => {
            document.removeEventListener('keydown', handler);
        });
    }

    /**
     * 위임 패턴으로 이벤트 등록 (동적 요소용)
     */
    delegate(
        containerId: string,
        selector: string,
        event: keyof HTMLElementEventMap,
        handler: (target: HTMLElement, e: Event) => void
    ): void {
        const container = getCachedElement(containerId);
        if (!container) {
            console.warn(`[EventManager] Container #${containerId} not found`);
            return;
        }

        const delegateHandler = (e: Event) => {
            const target = (e.target as HTMLElement).closest(selector) as HTMLElement | null;
            if (target && container.contains(target)) {
                handler(target, e);
            }
        };

        container.addEventListener(event, delegateHandler);
        this.cleanupFunctions.push(() => {
            container.removeEventListener(event, delegateHandler);
        });
    }

    /**
     * 커스텀 이벤트 발행
     */
    emit(eventName: string, detail?: any): void {
        document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    /**
     * 커스텀 이벤트 구독
     */
    on(eventName: string, handler: (e: CustomEvent) => void): void {
        document.addEventListener(eventName, handler as EventListener);
        this.cleanupFunctions.push(() => {
            document.removeEventListener(eventName, handler as EventListener);
        });
    }

    /**
     * 모든 이벤트 리스너 정리
     */
    cleanup(): void {
        for (const fn of this.cleanupFunctions) {
            try {
                fn();
            } catch (e) {
                console.warn('[EventManager] Cleanup error:', e);
            }
        }
        this.cleanupFunctions = [];
        this.listeners.clear();
    }
}

// 싱글톤 인스턴스
export const EventManager = new EventManagerImpl();
export type { EventManagerImpl };
