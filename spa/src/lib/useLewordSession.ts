import { useEffect, useState } from 'react';
import { loadSession, SESSION_CHANGED_EVENT, type LewordSession } from './lewordAuth';

/** Same person, same server session — avoids re-rendering every listener when nothing really changed. */
function sameSession(a: LewordSession | null, b: LewordSession | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.userId === b.userId && a.webSessionToken === b.webSessionToken && a.expiresAt === b.expiresAt;
}

/**
 * The stored LEWORD login as React state, read through the same `loadSession` the LEWORD page uses (so an
 * expired login counts as logged out). Follows login/logout in this tab (our own event), other tabs
 * (`storage`), and refreshes when the tab comes back — an expired login is dropped silently by loadSession.
 *
 * @param refreshKey changing value (e.g. the current path) that forces a re-read
 */
export function useLewordSession(refreshKey?: string): LewordSession | null {
    const [session, setSession] = useState<LewordSession | null>(loadSession);

    useEffect(() => {
        const refresh = () => setSession((previous) => {
            const next = loadSession();
            return sameSession(previous, next) ? previous : next;
        });
        refresh();
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        window.addEventListener(SESSION_CHANGED_EVENT, refresh);
        window.addEventListener('storage', refresh);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener(SESSION_CHANGED_EVENT, refresh);
            window.removeEventListener('storage', refresh);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [refreshKey]);

    return session;
}
