import { useLayoutEffect, useRef, useState } from 'react';
import { INDICATOR_BASE_WIDTH } from './useSlidingIndicator';

/**
 * Indicator bar that glides under the active tab of its parent element (transform only).
 * It measures its own parent, so the host component needs no ref or hook of its own —
 * the store component is called as a plain function by the checkout contract tests.
 */
function SlidingInk({ className, activeSelector, activeKey }: { className: string; activeSelector: string; activeKey: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const [box, setBox] = useState({ x: 0, w: 0, ready: false, animate: false });

    useLayoutEffect(() => {
        const container = ref.current?.parentElement;
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
    }, [activeSelector, activeKey]);

    return (
        <span
            ref={ref}
            className={className}
            aria-hidden="true"
            style={{
                transform: `translateX(${box.x}px) scaleX(${box.w / INDICATOR_BASE_WIDTH})`,
                opacity: box.ready ? 1 : 0,
                transition: box.animate ? undefined : 'none',
            }}
        />
    );
}

export default SlidingInk;
