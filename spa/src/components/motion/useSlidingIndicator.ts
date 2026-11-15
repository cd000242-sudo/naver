import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/** Base width of the indicator element; the measured width is applied as scaleX of this. */
export const INDICATOR_BASE_WIDTH = 100;

/**
 * Positions one indicator bar under the active tab inside `containerRef` and lets it glide
 * between tabs (transform only). The container must be the offsetParent (position: relative).
 */
export function useSlidingIndicator(
    containerRef: RefObject<HTMLElement>,
    activeSelector: string,
    activeKey: string,
): CSSProperties {
    const [box, setBox] = useState<{ x: number; w: number; ready: boolean; animate: boolean }>({ x: 0, w: 0, ready: false, animate: false });

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;
        const measure = (animate: boolean) => {
            const active = container.querySelector<HTMLElement>(activeSelector);
            if (!active) return;
            setBox((prev) => ({ x: active.offsetLeft, w: active.offsetWidth, ready: true, animate: animate && prev.ready }));
        };
        measure(true);
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => measure(false));
        observer.observe(container);
        return () => observer.disconnect();
    }, [containerRef, activeSelector, activeKey]);

    return {
        transform: `translateX(${box.x}px) scaleX(${box.w / INDICATOR_BASE_WIDTH})`,
        opacity: box.ready ? 1 : 0,
        transition: box.animate ? undefined : 'none',
    };
}
