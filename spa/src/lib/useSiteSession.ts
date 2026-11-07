import { useEffect, useState } from 'react';
import { COMMUNITY_SESSION_EVENT, loadCommunitySession, type CommunitySession } from './communitySession';
import type { LewordSession } from './lewordAuth';
import { useLewordSession } from './useLewordSession';

export type SiteSession = {
    /** The unified site login (community token), or null. */
    community: CommunitySession | null;
    /** The stored LEWORD login the paid screens read, or null. */
    leword: LewordSession | null;
    /** Who is logged in, from either login ('' when nobody). */
    userId: string;
};

/** Profile changes (nickname, score) must re-render too, so compare the whole stored value. */
function sameCommunity(a: CommunitySession | null, b: CommunitySession | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Both logins as React state. The community login follows login/logout in this tab (our own event), other tabs
 * (`storage`) and the tab coming back to the front — an expired token is dropped by `loadCommunitySession`.
 *
 * @param refreshKey changing value (e.g. the current path) that forces a re-read
 */
export function useSiteSession(refreshKey?: string): SiteSession {
    const leword = useLewordSession(refreshKey);
    const [community, setCommunity] = useState<CommunitySession | null>(loadCommunitySession);

    useEffect(() => {
        const refresh = () => setCommunity((previous) => {
            const next = loadCommunitySession();
            return sameCommunity(previous, next) ? previous : next;
        });
        refresh();
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        window.addEventListener(COMMUNITY_SESSION_EVENT, refresh);
        window.addEventListener('storage', refresh);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener(COMMUNITY_SESSION_EVENT, refresh);
            window.removeEventListener('storage', refresh);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [refreshKey]);

    return { community, leword, userId: community?.userId || leword?.userId || '' };
}
