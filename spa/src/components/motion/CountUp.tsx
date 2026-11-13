import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion, useInViewOnce } from './useMotionHooks';
import './motion.css';

const defaultFormatter = new Intl.NumberFormat('ko-KR');

type CountUpProps = {
    value: number;
    /** Total time for one count, in ms. */
    duration?: number;
    format?: (value: number) => string;
    className?: string;
    /** Reserve the final value's width from the start, so nothing beside the number moves while it counts. */
    reserve?: boolean;
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A real number that counts up from 0 the first time it is seen, then glides to any new value.
 * Screen readers and copy get the final value only; the moving digits are aria-hidden.
 */
function CountUp({ value, duration = 800, format = (n) => defaultFormatter.format(n), className, reserve = false }: CountUpProps) {
    const ref = useRef<HTMLSpanElement>(null);
    const seen = useInViewOnce(ref, '0px');
    const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
    const shownRef = useRef(shown);
    shownRef.current = shown;

    useEffect(() => {
        if (!seen) return undefined;
        const from = shownRef.current;
        const to = value;
        if (from === to) return undefined;
        if (prefersReducedMotion() || !Number.isFinite(to)) {
            setShown(to);
            return undefined;
        }
        let frame = 0;
        const start = performance.now();
        const tick = (now: number) => {
            const progress = Math.min(1, (now - start) / duration);
            setShown(Math.round(from + (to - from) * easeOutCubic(progress)));
            if (progress < 1) frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frame);
    }, [seen, value, duration]);

    return (
        <span ref={ref} className={`lp-count${reserve ? ' lp-count-fixed' : ''}${className ? ` ${className}` : ''}`}>
            {reserve && <span className="lp-count-ghost" aria-hidden="true">{format(value)}</span>}
            <span aria-hidden="true">{format(shown)}</span>
            <span className="lp-sr-only">{format(value)}</span>
        </span>
    );
}

export default CountUp;
