import { useEffect, type RefObject } from 'react';
import { prefersReducedMotion } from './useMotionHooks';
import { REVEAL_ITEM_SELECTOR, REVEAL_SHOT_SELECTOR } from './revealTargets';
import './motion.css';

const STEP_MS = 50;
const MAX_STEP = 8;
const SETTLE_MS = 820;

/**
 * Page-wide scroll reveal for the public pages. Mounted once on the layout's <main>.
 *
 * Every element matching revealTargets.ts (or carrying data-rv) rises 12px and fades in once,
 * the first time it enters the viewport. Elements that enter together are sequenced 50ms apart
 * in document order. Uses the same data-reveal states as useReveal (pending -> shown -> done).
 *
 * A MutationObserver (childList only) picks up route changes, tab switches and late data.
 * Elements already scrolled past are shown at once. Reduced motion: nothing is ever hidden.
 * No scroll listeners; only transform and opacity change, so the layout never moves.
 */
export function useRevealScope(rootRef: RefObject<HTMLElement>) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root || prefersReducedMotion()) return undefined;
        if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return undefined;

        const timers = new Set<number>();
        const finish = (el: HTMLElement) => {
            el.dataset.reveal = 'done';
            el.style.removeProperty('--rv-i');
        };
        const io = new IntersectionObserver((entries) => {
            let order = 0;
            entries.forEach((entry) => {
                const el = entry.target as HTMLElement;
                const passed = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
                if (!entry.isIntersecting && !passed) return;
                io.unobserve(el);
                if (passed) {
                    finish(el);
                    return;
                }
                const step = Math.min(order, MAX_STEP);
                order += 1;
                el.style.setProperty('--rv-i', String(step));
                el.dataset.reveal = 'shown';
                const timer = window.setTimeout(() => {
                    timers.delete(timer);
                    finish(el);
                }, SETTLE_MS + step * STEP_MS);
                timers.add(timer);
            });
        }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });

        const scan = () => {
            root.querySelectorAll<HTMLElement>(REVEAL_ITEM_SELECTOR).forEach((el) => {
                if (el.dataset.reveal) return;
                // A target inside another animating target would move twice; it rides with its parent.
                if (el.parentElement?.closest('[data-reveal="pending"], [data-reveal="shown"]')) {
                    el.dataset.reveal = 'done';
                    return;
                }
                el.dataset.rvAuto = el.matches(REVEAL_SHOT_SELECTOR) ? 'shot' : 'item';
                el.dataset.reveal = 'pending';
                io.observe(el);
            });
        };
        scan();
        const mo = new MutationObserver(scan);
        mo.observe(root, { childList: true, subtree: true });

        return () => {
            mo.disconnect();
            io.disconnect();
            timers.forEach((timer) => window.clearTimeout(timer));
            root.querySelectorAll<HTMLElement>('[data-rv-auto][data-reveal="pending"], [data-rv-auto][data-reveal="shown"]').forEach(finish);
        };
    }, [rootRef]);
}
