export const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

export type SiteContent = {
    hero?: {
        title?: string;
        desc?: string;
        benefit?: string;
        notice?: string;
        proofs?: Array<{
            src?: string;
            alt?: string;
            title?: string;
            desc?: string;
            metric?: string;
        }>;
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
        skin?: {
            name?: string;
            md?: string;
        };
        music?: {
            title?: string;
            videoId?: string;
            playlistId?: string;
            startSec?: number;
            audioUrl?: string;
            enabled?: boolean;
        };
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
const SITE_CONTENT_CACHE_KEY = 'leaderspro.siteContent.cache.v2';
const SITE_CONTENT_CACHE_TTL_MS = 60 * 1000;
const SITE_CONTENT_FETCH_TIMEOUT_MS = 2500;

function readCachedSiteContent(maxAgeMs = SITE_CONTENT_CACHE_TTL_MS): SiteContent | null {
    try {
        const raw = localStorage.getItem(SITE_CONTENT_CACHE_KEY);
        if (!raw) return null;
        const cached = JSON.parse(raw) as { savedAt?: number; content?: SiteContent };
        if (!cached?.content) return null;
        if (maxAgeMs > 0 && Date.now() - Number(cached.savedAt || 0) > maxAgeMs) return null;
        return cached.content;
    } catch {
        return null;
    }
}

function writeCachedSiteContent(content: SiteContent) {
    try {
        localStorage.setItem(SITE_CONTENT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), content }));
    } catch {
        // Public page rendering must never depend on cache writes.
    }
}

export async function fetchSiteContent(): Promise<SiteContent | null> {
    const freshCache = readCachedSiteContent();
    if (freshCache) return freshCache;
    if (siteContentPromise) return siteContentPromise;
    const staleCache = readCachedSiteContent(0);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SITE_CONTENT_FETCH_TIMEOUT_MS);
    siteContentPromise = fetch(`${GAS_URL}?action=site-content`, { cache: 'default', signal: controller.signal })
        .then((res) => res.json())
        .then((data) => {
            if (data && (data.ok || data.success) && data.content) {
                const content = data.content as SiteContent;
                writeCachedSiteContent(content);
                return content;
            }
            return null;
        })
        .catch((err) => {
            console.warn('[site-content] load failed', err);
            siteContentPromise = null;
            return staleCache;
        })
        .finally(() => {
            window.clearTimeout(timeout);
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
                const isAdminSession = sessionStorage.getItem('lp_admin_logged_in') === '1' || sessionStorage.getItem('admin_auth') === '1';
                const isInternal = localStorage.getItem('lp_analytics_exclude') === '1' || isAdminSession;
                const normalizedPath = path || location.pathname;
                const dedupeKey = `lp_pageview_dedupe:${normalizedPath}`;
                const now = Date.now();
                const lastHitAt = Number(sessionStorage.getItem(dedupeKey) || 0);
                if (now - lastHitAt < 30 * 60 * 1000) return;
                sessionStorage.setItem(dedupeKey, String(now));
                const payload = {
                    action: 'analytics-hit',
                    type: 'pageview',
                    path: normalizedPath,
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
