import { useEffect, useState, type RefObject } from 'react';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the visitor asked the OS for less motion. Reads once, then follows changes. */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(REDUCED_QUERY).matches;
}

export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(prefersReducedMotion);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const query = window.matchMedia(REDUCED_QUERY);
        const onChange = () => setReduced(query.matches);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, []);
    return reduced;
}

/**
 * Becomes true the first time the element enters the viewport and stays true.
 * Uses IntersectionObserver only (no scroll listeners). Without IO support it is true at once.
 */
export function useInViewOnce(ref: RefObject<Element>, rootMargin = '0px 0px -8% 0px'): boolean {
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el || seen) return undefined;
        if (typeof IntersectionObserver === 'undefined') {
            setSeen(true);
            return undefined;
        }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                setSeen(true);
                observer.disconnect();
            }
        }, { rootMargin, threshold: 0.01 });
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref, rootMargin, seen]);
    return seen;
}

/** Live visibility (true while on screen). Used to pause loops that run off-screen. */
export function useOnScreen(ref: RefObject<Element>): boolean {
    const [visible, setVisible] = useState(true);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') return undefined;
        const observer = new IntersectionObserver((entries) => {
            const last = entries[entries.length - 1];
            if (last) setVisible(last.isIntersecting);
        }, { threshold: 0.01 });
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref]);
    return visible;
}
