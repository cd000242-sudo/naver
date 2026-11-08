/**
 * Recovery from stale page chunks.
 *
 * [2026-11-08] Owner report: "leave the site open for a long time and sometimes only the blue background
 * shows, with nothing rendered." Pages are lazy-loaded; a new deploy removes the old hashed chunk files, so an
 * idle tab that navigates later fails the dynamic import and React unmounts the whole tree. We reload once
 * (guarded so a real outage cannot loop) to pick up the new build.
 */

export const RELOAD_GUARD_MS = 30_000;
const RELOAD_AT_KEY = 'lp-chunk-reload-at';

const CHUNK_ERROR_PATTERNS = [
    /Failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /Importing a module script failed/i,
    /Loading chunk [\w-]+ failed/i,
    /Unable to preload CSS/i,
];

/** True for the dynamic-import / chunk failures browsers throw when a chunk file is gone. */
export function isChunkLoadError(error) {
    if (!error) return false;
    if (error.name === 'ChunkLoadError') return true;
    const message = String(error.message || error);
    return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/** Reload only if we have not just reloaded for the same reason. */
export function shouldAutoReload(now, lastReloadAt) {
    if (!lastReloadAt) return true;
    return now - lastReloadAt > RELOAD_GUARD_MS;
}

function readLastReload() {
    try {
        const raw = window.sessionStorage.getItem(RELOAD_AT_KEY);
        return raw ? Number(raw) : null;
    } catch {
        return null;
    }
}

/** Reloads the page once per guard window. Returns false when the guard blocks it (caller shows a fallback). */
export function recoverFromChunkError() {
    const now = Date.now();
    if (!shouldAutoReload(now, readLastReload())) return false;
    try { window.sessionStorage.setItem(RELOAD_AT_KEY, String(now)); } catch { /* reload anyway */ }
    window.location.reload();
    return true;
}

/** Global hooks: Vite's preload error event and unhandled dynamic-import rejections. */
export function installChunkRecovery() {
    if (typeof window === 'undefined') return;
    window.addEventListener('vite:preloadError', (event) => {
        if (recoverFromChunkError()) event.preventDefault();
    });
    window.addEventListener('unhandledrejection', (event) => {
        if (isChunkLoadError(event.reason)) recoverFromChunkError();
    });
}
