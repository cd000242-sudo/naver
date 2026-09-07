import { useEffect, useState } from 'react';

/** Source freshness cannot depend on a successful request or a user click. */
export function useEvidenceClock(): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const tick = () => setNow(Date.now());
        const timer = window.setInterval(tick, 60_000);
        document.addEventListener('visibilitychange', tick);
        window.addEventListener('focus', tick);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', tick);
            window.removeEventListener('focus', tick);
        };
    }, []);
    return now;
}
