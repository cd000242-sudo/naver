export const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

export type SiteContent = {
    hero?: {
        title?: string;
        desc?: string;
        benefit?: string;
        notice?: string;
    };
    pricing?: {
        plans?: Record<string, {
            name?: string;
            desc?: string;
            amount?: number;
            amountCard?: number;
            futureAmount?: number;
            futureAmountCard?: number;
            period?: string;
            monthly?: string;
            eventLabel?: string;
            features?: string[];
        }>;
    };
    products?: Record<string, {
        eyebrow?: string;
        name?: string;
        subtitle?: string;
        headline?: string;
        desc?: string;
        href?: string;
        cta?: string;
        metrics?: Array<[string, string]>;
        bullets?: string[];
        fit?: string[];
    }>;
    downloads?: Record<string, {
        name?: string;
        version?: string;
        downloads?: Record<string, {
            label?: string;
            detail?: string;
            url?: string;
        }>;
    }>;
    updatedAt?: string;
};

export async function fetchSiteContent(): Promise<SiteContent | null> {
    try {
        const res = await fetch(`${GAS_URL}?action=site-content&ts=${Date.now()}`, { cache: 'no-store' });
        const data = await res.json();
        if (data && (data.ok || data.success) && data.content) return data.content as SiteContent;
    } catch (err) {
        console.warn('[site-content] load failed', err);
    }
    return null;
}

function getOrCreateStorageId(storage: Storage, key: string, prefix: string) {
    try {
        const existing = storage.getItem(key);
        if (existing) return existing;
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        const id = prefix + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
        storage.setItem(key, id);
        return id;
    } catch {
        return prefix + Math.random().toString(36).slice(2);
    }
}

export function recordPageView(path: string) {
    try {
        const isInternal = localStorage.getItem('lp_analytics_exclude') === '1' || sessionStorage.getItem('lp_admin_logged_in') === '1';
        const payload = {
            action: 'analytics-hit',
            type: 'pageview',
            path,
            title: document.title,
            referrer: document.referrer || '',
            visitorId: getOrCreateStorageId(localStorage, 'lp_visitor_id', 'v_'),
            sessionId: getOrCreateStorageId(sessionStorage, 'lp_session_id', 's_'),
            isInternal,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
        };
        fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            keepalive: true,
        }).catch(() => undefined);
    } catch {
        // Analytics must never block the site.
    }
}
