import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * True once the element has come within `margin` of the visible screen, and stays true. Without
 * IntersectionObserver (an old browser) the element counts as near at once. Used to fetch row pictures lazily.
 */
export function useNearScreen<T extends Element>(margin = '240px'): [RefObject<T>, boolean] {
    const holder = useRef<T>(null);
    const [near, setNear] = useState(false);
    useEffect(() => {
        const element = holder.current;
        if (near || !element) return undefined;
        if (typeof IntersectionObserver === 'undefined') { setNear(true); return undefined; }
        const watch = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setNear(true); }, { rootMargin: margin });
        watch.observe(element);
        return () => watch.disconnect();
    }, [near, margin]);
    return [holder, near];
}
