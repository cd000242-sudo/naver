// ============================================
// 성능 최적화 유틸리티
// ============================================

/**
 * DOM 요소 캐싱을 위한 Map
 */
class DOMCache {
  private cache = new Map<string, HTMLElement | null>();

  /**
   * 요소를 가져오거나 캐시에서 반환
   */
  get(id: string): HTMLElement | null {
    if (!this.cache.has(id)) {
      this.cache.set(id, document.getElementById(id));
    }
    return this.cache.get(id) || null;
  }

  /**
   * 쿼리 셀렉터 결과 캐싱
   */
  query(selector: string, parent: Document | HTMLElement = document): HTMLElement | null {
    const key = `${selector}_${parent === document ? 'doc' : (parent as HTMLElement).id || 'unknown'}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, parent.querySelector(selector));
    }
    return this.cache.get(key) || null;
  }

  /**
   * 캐시 무효화
   */
  invalidate(id?: string): void {
    if (id) {
      this.cache.delete(id);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 모든 캐시 삭제
   */
  clear(): void {
    this.cache.clear();
  }
}

export const domCache = new DOMCache();

/**
 * Debounce 함수 - 연속 호출을 지연시킴
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate?: boolean
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    
    const callNow = immediate && !timeout;
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) func(...args);
  };
}

/**
 * Throttle 함수 - 일정 시간마다만 실행
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 이벤트 위임을 위한 헬퍼
 */
export class EventDelegator {
  private handlers = new Map<string, Map<HTMLElement | Document, (e: Event) => void>>();

  /**
   * 이벤트 위임 등록
   */
  on(
    container: HTMLElement | Document,
    selector: string,
    event: string,
    handler: (e: Event, target: HTMLElement) => void
  ): void {
    const key = `${selector}_${event}`;
    
    if (!this.handlers.has(key)) {
      const wrappedHandler = (e: Event) => {
        const target = e.target as HTMLElement;
        const matched = target.closest(selector);
        if (matched) {
          handler(e, matched as HTMLElement);
        }
      };
      
      container.addEventListener(event, wrappedHandler);
      const handlerMap = new Map<HTMLElement | Document, (e: Event) => void>();
      handlerMap.set(container, wrappedHandler);
      this.handlers.set(key, handlerMap);
    }
  }

  /**
   * 이벤트 위임 제거
   */
  off(container: HTMLElement | Document, selector: string, event: string): void {
    const key = `${selector}_${event}`;
    const handlerMap = this.handlers.get(key);
    
    if (handlerMap) {
      handlerMap.forEach((handler, element) => {
        element.removeEventListener(event, handler);
      });
      this.handlers.delete(key);
    }
  }

  /**
   * 모든 이벤트 제거
   */
  clear(): void {
    this.handlers.forEach((handlerMap) => {
      handlerMap.forEach((handler, element) => {
        element.removeEventListener('click', handler);
      });
    });
    this.handlers.clear();
  }
}

export const eventDelegator = new EventDelegator();

/**
 * 메모리 누수 방지를 위한 Cleanup 관리자
 */
export class CleanupManager {
  private cleanups: Array<() => void> = [];

  /**
   * Cleanup 함수 등록
   */
  add(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  /**
   * 모든 cleanup 실행
   */
  cleanup(): void {
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
  }
}

export const cleanupManager = new CleanupManager();

/**
 * Intersection Observer를 사용한 지연 로딩
 */
export function createLazyLoader(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options?: IntersectionObserverInit
): IntersectionObserver {
  const defaultOptions: IntersectionObserverInit = {
    root: null,
    rootMargin: '50px',
    threshold: 0.1,
    ...options
  };

  return new IntersectionObserver(callback, defaultOptions);
}

/**
 * requestAnimationFrame 래퍼
 */
export function raf(callback: () => void): number {
  return requestAnimationFrame(callback);
}

/**
 * cancelAnimationFrame 래퍼
 */
export function cancelRaf(id: number): void {
  cancelAnimationFrame(id);
}

/**
 * 배치 DOM 업데이트
 */
export class BatchDOMUpdater {
  private updates: Array<() => void> = [];
  private rafId: number | null = null;

  /**
   * 업데이트 추가
   */
  add(update: () => void): void {
    this.updates.push(update);
    this.schedule();
  }

  /**
   * 업데이트 스케줄링
   */
  private schedule(): void {
    if (this.rafId === null) {
      this.rafId = raf(() => {
        this.flush();
      });
    }
  }

  /**
   * 모든 업데이트 실행
   */
  private flush(): void {
    const updates = this.updates.slice();
    this.updates = [];
    this.rafId = null;
    
    updates.forEach(update => update());
  }

  /**
   * 강제 실행
   */
  force(): void {
    if (this.rafId !== null) {
      cancelRaf(this.rafId);
      this.rafId = null;
    }
    this.flush();
  }
}

export const batchDOMUpdater = new BatchDOMUpdater();

