import { useEffect, useState } from 'react';
import { topLayoutFor, type TopLayout } from './communityTopGrid.mjs';

const PHONE_QUERY = '(max-width: 720px)';

/** Which 인기글 grid to draw: the phone one up to 720 px wide, the desktop one otherwise. Follows a resize or a turn. */
export function useTopLayout(): TopLayout {
    const [layout, setLayout] = useState<TopLayout>(() => topLayoutFor(typeof window === 'undefined' ? undefined : window.innerWidth));
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return undefined;
        const query = window.matchMedia(PHONE_QUERY);
        const apply = () => setLayout(query.matches ? 'narrow' : 'wide');
        apply();
        query.addEventListener('change', apply);
        return () => query.removeEventListener('change', apply);
    }, []);
    return layout;
}
