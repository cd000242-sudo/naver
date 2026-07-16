import { normalizeKeywordBriefing, type HomeKeywordBriefing } from './homeKeywordBriefing';

export const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
export const LEWORD_API_BASE = 'https://141.164.59.17.sslip.io';

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

export type HomeNotice = {
    id: string;
    badge: string;
    date: string;
    title: string;
    summary: string;
    body: string;
};

export type HomeKeywordBriefingResult = {
    briefing: HomeKeywordBriefing;
    source: 'saved' | 'seed';
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

const HOME_NOTICE_TIMEOUT_MS = 3200;
const HOME_NOTICE_CACHE_KEY = 'leaderspro.homeNotices.cache.v2';
const HOME_KEYWORD_SEED_URL = '/data/home-keyword-briefing-seed.json';

function cleanPublicText(value: unknown, maxLength: number): string {
    return String(value ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function cleanPublicMultilineText(value: unknown, maxLength: number): string {
    return String(value ?? '')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/(p|li|div|h[1-6])\s*>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, maxLength);
}

function normalizeHomeNotice(value: unknown, index: number): HomeNotice | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const title = cleanPublicText(raw.title, 200);
    if (!title) return null;
    const date = cleanPublicText(raw.date ?? raw.createdAt ?? raw.timestamp, 40);
    const body = cleanPublicMultilineText(raw.body ?? raw.detail ?? raw.preview ?? raw.summary, 8000);
    return {
        id: cleanPublicText(raw.id, 100) || `notice-${index + 1}-${date || 'undated'}`,
        badge: cleanPublicText(raw.badge ?? raw.type, 30) || 'notice',
        date,
        title,
        summary: cleanPublicText(raw.preview ?? raw.summary ?? raw.body ?? raw.detail, 300),
        body,
    };
}

function noticeDateValue(value: string): number {
    const normalized = value.replace(/[.\/]/g, '-');
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHomeNoticeList(values: unknown[], limit: number): HomeNotice[] {
    return values
        .map(normalizeHomeNotice)
        .filter((notice): notice is HomeNotice => Boolean(notice))
        .map((notice, index) => ({ notice, index }))
        .sort((left, right) => noticeDateValue(right.notice.date) - noticeDateValue(left.notice.date) || left.index - right.index)
        .slice(0, Math.max(1, Math.min(100, Math.floor(limit) || 3)))
        .map(({ notice }) => notice);
}

type HomeNoticeCacheSource = 'secure' | 'legacy';

function readHomeNoticeCache(limit: number, requiredSource: HomeNoticeCacheSource): HomeNotice[] {
    try {
        const cached = JSON.parse(localStorage.getItem(HOME_NOTICE_CACHE_KEY) || 'null') as {
            source?: HomeNoticeCacheSource;
            notices?: unknown[];
        } | null;
        if (cached?.source !== requiredSource || !Array.isArray(cached.notices)) return [];
        return normalizeHomeNoticeList(cached.notices, limit);
    } catch {
        return [];
    }
}

function writeHomeNoticeCache(notices: HomeNotice[], source: HomeNoticeCacheSource) {
    try {
        localStorage.setItem(HOME_NOTICE_CACHE_KEY, JSON.stringify({ source, notices }));
    } catch {
        // Public rendering must not depend on cache writes.
    }
}

type SavedHomeNoticesResult =
    | { state: 'saved'; notices: HomeNotice[] }
    | { state: 'uninitialized' }
    | { state: 'unavailable' };

async function fetchSavedHomeNotices(limit: number): Promise<SavedHomeNoticesResult> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HOME_NOTICE_TIMEOUT_MS);
    try {
        const response = await fetch(`${LEWORD_API_BASE}/v1/public/home-notices`, {
            cache: 'no-store',
            signal: controller.signal,
        });
        if (!response.ok) return { state: 'unavailable' };
        const payload = await response.json() as { ok?: boolean; notices?: { notices?: unknown[] } | null };
        if (payload?.ok !== true) return { state: 'unavailable' };
        if (payload.notices === null) return { state: 'uninitialized' };
        if (!Array.isArray(payload.notices?.notices)) return { state: 'unavailable' };
        return { state: 'saved', notices: normalizeHomeNoticeList(payload.notices.notices, limit) };
    } catch {
        return { state: 'unavailable' };
    } finally {
        window.clearTimeout(timeout);
    }
}

async function fetchLegacyHomeNotices(limit: number): Promise<HomeNotice[] | null> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HOME_NOTICE_TIMEOUT_MS);
    try {
        const response = await fetch(`${GAS_URL}?action=get-notices`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return null;
        const payload = await response.json() as { success?: boolean; ok?: boolean; notices?: unknown[] };
        if (!payload || (!payload.success && !payload.ok) || !Array.isArray(payload.notices)) return null;
        return normalizeHomeNoticeList(payload.notices, limit);
    } catch {
        return null;
    } finally {
        window.clearTimeout(timeout);
    }
}

export async function fetchHomeNotices(limit = 3): Promise<HomeNotice[]> {
    const saved = await fetchSavedHomeNotices(limit);
    if (saved.state === 'saved') {
        writeHomeNoticeCache(saved.notices, 'secure');
        return saved.notices;
    }
    if (saved.state === 'unavailable') return readHomeNoticeCache(limit, 'secure');
    const legacy = await fetchLegacyHomeNotices(limit);
    if (legacy !== null) {
        writeHomeNoticeCache(legacy, 'legacy');
        return legacy;
    }
    return readHomeNoticeCache(limit, 'legacy');
}

async function fetchKeywordBriefingSeed(): Promise<HomeKeywordBriefing | null> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SITE_CONTENT_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(HOME_KEYWORD_SEED_URL, {
            cache: 'default',
            signal: controller.signal,
        });
        if (!response.ok) return null;
        return normalizeKeywordBriefing(await response.json());
    } catch {
        return null;
    } finally {
        window.clearTimeout(timeout);
    }
}

async function fetchSavedKeywordBriefing(): Promise<HomeKeywordBriefing | null> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SITE_CONTENT_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(`${LEWORD_API_BASE}/v1/public/home-keyword-briefing`, {
            cache: 'no-store',
            signal: controller.signal,
        });
        if (!response.ok) return null;
        const payload = await response.json() as { ok?: boolean; briefing?: unknown };
        return payload?.ok ? normalizeKeywordBriefing(payload.briefing) : null;
    } catch {
        return null;
    } finally {
        window.clearTimeout(timeout);
    }
}

export async function fetchHomeKeywordBriefing(): Promise<HomeKeywordBriefingResult | null> {
    const [saved, seed] = await Promise.all([
        fetchSavedKeywordBriefing(),
        fetchKeywordBriefingSeed(),
    ]);
    if (saved) return { briefing: saved, source: 'saved' };
    return seed ? { briefing: seed, source: 'seed' } : null;
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
