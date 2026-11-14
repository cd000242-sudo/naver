import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { prefersReducedMotion } from './useMotionHooks';

const STEP_MS = 50;
const MAX_STAGGER = 10;
const DURATION_MS = 560;

/**
 * Scroll-in reveal for an existing element: rises 12px and fades in once, the first time it
 * enters the viewport. With `stagger`, its direct children enter one after another (50ms apart).
 *
 * State lives in data-reveal: pending -> shown -> done. "done" drops every reveal rule so the
 * element's own hover transitions are untouched afterwards. Reduced motion skips straight to done.
 */
export function useReveal(ref: RefObject<HTMLElement>, options: { stagger?: boolean } = {}) {
    const { stagger = false } = options;
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || el.dataset.reveal === 'done') return undefined;
        if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
            el.dataset.reveal = 'done';
            return undefined;
        }
        el.dataset.reveal = 'pending';
        if (stagger) el.dataset.revealStagger = '';
        let timer = 0;
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            const children = stagger ? Array.from(el.children) as HTMLElement[] : [];
            children.forEach((child, index) => child.style.setProperty('--rv-i', String(Math.min(index, MAX_STAGGER))));
            el.dataset.reveal = 'shown';
            const total = DURATION_MS + Math.min(children.length, MAX_STAGGER) * STEP_MS + 80;
            timer = window.setTimeout(() => {
                el.dataset.reveal = 'done';
                children.forEach((child) => child.style.removeProperty('--rv-i'));
            }, total);
        }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
        observer.observe(el);
        return () => {
            observer.disconnect();
            window.clearTimeout(timer);
        };
    }, [ref, stagger]);
}

type RevealProps = {
    children: ReactNode;
    stagger?: boolean;
    className?: string;
    style?: CSSProperties;
};

/** Wrapper form of useReveal for new markup. Renders a plain div. */
function Reveal({ children, stagger = false, className, style }: RevealProps) {
    const ref = useRef<HTMLDivElement>(null);
    useReveal(ref, { stagger });
    return <div ref={ref} className={className} style={style}>{children}</div>;
}

export default Reveal;
