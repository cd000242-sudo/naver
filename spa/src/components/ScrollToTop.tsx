import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function scrollToPageTop(behavior: ScrollBehavior = 'auto') {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, left: 0, behavior: prefersReducedMotion ? 'auto' : behavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
}

function isModifiedClick(event: MouseEvent) {
    return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function shouldScrollForAnchor(anchor: HTMLAnchorElement) {
    const href = anchor.getAttribute('href');
    const target = anchor.getAttribute('target');
    if (!href || target || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return false;
    }

    let url: URL;
    try {
        url = new URL(href, window.location.href);
    } catch {
        return false;
    }

    if (url.origin !== window.location.origin) {
        return false;
    }

    return url.pathname !== window.location.pathname || url.search !== window.location.search || url.hash === '';
}

function ScrollToTop() {
    const location = useLocation();

    useEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }

        return () => {
            if ('scrollRestoration' in window.history) {
                window.history.scrollRestoration = 'auto';
            }
        };
    }, []);

    useEffect(() => {
        window.requestAnimationFrame(() => scrollToPageTop('auto'));
    }, [location.pathname, location.search]);

    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (event.defaultPrevented || isModifiedClick(event)) {
                return;
            }

            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            const anchor = target.closest('a[href]');
            if (anchor instanceof HTMLAnchorElement && shouldScrollForAnchor(anchor)) {
                window.requestAnimationFrame(() => scrollToPageTop('auto'));
            }
        };

        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, []);

    return null;
}

export default ScrollToTop;
