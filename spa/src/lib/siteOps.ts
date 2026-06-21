export const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

export type SiteContent = {
    hero?: {
        title?: string;
        desc?: string;
        benefit?: string;
        notice?: string;
    };
    pricing?: {
        page?: {
            eyebrow?: string;
            title?: string;
            titleNormal?: string;
            desc?: string;
            tabLabel?: string;
            eventTitle?: string;
            eventTitleNormal?: string;
            eventDesc?: string;
            eventDescNormal?: string;
            eventLine?: string;
            paymentEmailLabel?: string;
            paymentEmailHelp?: string;
            paymentNote?: string;
        };
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
            badgeText?: string;
            features?: string[];
        }>;
    };
    productsPage?: {
        heroKicker?: string;
        heroTitle?: string;
        heroDesc?: string;
        primaryCta?: string;
        secondaryCta?: string;
        guideKicker?: string;
        guideTitle?: string;
        guideDesc?: string;
        lineupKicker?: string;
        lineupTitle?: string;
        lineupDesc?: string;
        fitKicker?: string;
        fitTitle?: string;
        fitDesc?: string;
        suiteKicker?: string;
        suiteTitle?: string;
        suiteDesc?: string;
        compareKicker?: string;
        compareTitle?: string;
        compareDesc?: string;
        finalKicker?: string;
        finalTitle?: string;
        finalDesc?: string;
        finalNote?: string;
        finalPrimaryCta?: string;
        finalSecondaryCta?: string;
        guideCards?: Array<[string, string, string, string]>;
        suiteFlow?: Array<[string, string, string]>;
        comparison?: Array<[string, string, string, string]>;
        images?: Record<string, {
            src?: string;
            alt?: string;
            title?: string;
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
        media?: {
            type?: 'video' | 'image';
            src?: string;
            alt?: string;
        };
        metrics?: Array<[string, string]>;
        bullets?: string[];
        fit?: string[];
    }>;
    downloads?: {
        page?: {
            eyebrow?: string;
            title?: string;
            desc?: string;
            note?: string;
        };
        naver?: DownloadProductContent;
        leword?: DownloadProductContent;
        orbit?: DownloadProductContent;
        tistory?: DownloadProductContent;
    };
    theme?: {
        pricingBgImage?: string;
        productsBgImage?: string;
        downloadBgImage?: string;
        gold?: string;
    };
    updatedAt?: string;
};

export type DownloadProductContent = {
    name?: string;
    version?: string;
    image?: string;
    accent?: string;
    downloads?: Record<string, {
        label?: string;
        detail?: string;
        url?: string;
    }>;
};

let siteContentPromise: Promise<SiteContent | null> | null = null;

export async function fetchSiteContent(): Promise<SiteContent | null> {
    if (siteContentPromise) return siteContentPromise;
    siteContentPromise = fetch(`${GAS_URL}?action=site-content&ts=${Date.now()}`, { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
            if (data && (data.ok || data.success) && data.content) return data.content as SiteContent;
            return null;
        })
        .catch((err) => {
            console.warn('[site-content] load failed', err);
            siteContentPromise = null;
            return null;
        });
    return siteContentPromise;
}

function runWhenIdle(task: () => void) {
    const idleWindow = window as any;
    if ('requestIdleCallback' in idleWindow) {
        idleWindow.requestIdleCallback(task, { timeout: 2500 });
        return;
    }
    window.setTimeout(task, 900);
}

export function recordPageView(path: string) {
    try {
        runWhenIdle(() => {
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
        });
    } catch {
        // Analytics must never block the site.
    }
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
