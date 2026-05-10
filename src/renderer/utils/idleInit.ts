// Idle-time initialization helper (v2.10.82).
//
// Wraps requestIdleCallback with a mandatory deadline timeout so that
// deferred tasks always run, even when the browser never becomes idle.
//
// Use case: defer non-critical DOMContentLoaded init (dashboard widgets,
// tutorial prefetch, optional banners) to free up the main thread for the
// first user interaction. On low-end laptops this reduces first-paint to
// first-interaction lag.
//
// Safety: every call MUST run within `timeoutMs` (default 5000) regardless
// of idle state. The user sees the deferred work appear within 5s at the
// very latest — usually much sooner.

type IdleInitOptions = {
    /** Maximum wait before forcing execution regardless of idle state. Default: 5000 ms. */
    timeoutMs?: number;
    /** Human-readable label shown in console logs. Defaults to fn.name or "anonymous". */
    name?: string;
};

declare const requestIdleCallback: ((cb: () => void, opts?: { timeout: number }) => number) | undefined;

export function runWhenIdle(fn: () => void, opts?: IdleInitOptions): void {
    const timeoutMs = opts?.timeoutMs ?? 5000;
    const label = opts?.name ?? fn.name ?? 'anonymous';

    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(
            () => {
                try {
                    console.log(`[IdleInit] 실행: ${label}`);
                    fn();
                } catch (e) {
                    console.error(`[IdleInit] ${label} 실행 중 오류:`, e);
                }
            },
            { timeout: timeoutMs },
        );
    } else {
        // Fallback: setTimeout ensures execution even in environments without rIC.
        setTimeout(() => {
            try {
                console.log(`[IdleInit] 실행 (fallback): ${label}`);
                fn();
            } catch (e) {
                console.error(`[IdleInit] ${label} 실행 중 오류:`, e);
            }
        }, 200);
    }
}
