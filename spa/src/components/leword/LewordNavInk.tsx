import { useLayoutEffect, useRef, useState } from 'react';
import { INDICATOR_BASE_WIDTH } from '../motion/useSlidingIndicator';

/**
 * Gold bar that glides beside the active side tab. The vertical twin of motion/SlidingInk:
 * it measures its own parent (the nav) and moves with transform only. The first placement and
 * resizes jump without animation; reduced motion is handled by the stylesheet.
 * Positions come from bounding boxes, so tabs wrapped in their own positioned box still line up.
 */
function LewordNavInk({ activeSelector, activeKey }: { activeSelector: string; activeKey: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const [box, setBox] = useState({ y: 0, h: 0, ready: false, animate: false });

    useLayoutEffect(() => {
        const container = ref.current?.parentElement;
        if (!container) return undefined;
        const measure = (animate: boolean) => {
            const active = container.querySelector<HTMLElement>(activeSelector);
            if (!active) {
                setBox((prev) => ({ ...prev, ready: false }));
                return;
            }
            const outer = container.getBoundingClientRect();
            const inner = active.getBoundingClientRect();
            setBox((prev) => ({ y: inner.top - outer.top, h: inner.height, ready: true, animate: animate && prev.ready }));
        };
        measure(true);
        if (typeof ResizeObserver === 'undefined') return undefined;
        // The observer reports once on start; skipping that keeps the glide that measure(true) began.
        let started = false;
        const observer = new ResizeObserver(() => {
            if (started) measure(false);
            started = true;
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [activeSelector, activeKey]);

    return (
        <span
            ref={ref}
            className="lw-nav-ink"
            aria-hidden="true"
            style={{
                transform: `translateY(${box.y}px) scaleY(${box.h / INDICATOR_BASE_WIDTH})`,
                opacity: box.ready ? 1 : 0,
                transition: box.animate ? undefined : 'none',
            }}
        />
    );
}

export default LewordNavInk;
