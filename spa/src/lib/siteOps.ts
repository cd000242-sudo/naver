import { normalizeKeywordBriefing, type HomeKeywordBriefing } from './homeKeywordBriefing';
import { maskContactText } from './privacy';

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

export type CommunityIncomeProof = {
    id: string;
    amount: string;
    author: string;
    date: string;
    desc: string;
    tags: string[];
    media?: string;
    mediaType?: 'image' | 'video';
    mediaName?: string;
};

export type CommunityIncomeProofResult = {
    items: CommunityIncomeProof[];
    source: 'live' | 'cache' | 'unavailable';
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
const COMMUNITY_INCOME_CACHE_KEY = 'leaderspro.communityIncome.cache.v1';
const COMMUNITY_INCOME_WIDE_CACHE_KEY = 'leaderspro.communityIncome.community.cache.v1';
const COMMUNITY_INCOME_CACHE_TTL_MS = 15 * 60 * 1000;
const COMMUNITY_INCOME_TIMEOUT_MS = 4800;
const HOME_INCOME_RESPONSE_MAX_BYTES = 512 * 1024;
const COMMUNITY_INCOME_RESPONSE_MAX_BYTES = 32 * 1024 * 1024;
const COMMUNITY_INCOME_DATA_MEDIA_MAX_CHARS = 32 * 1024 * 1024;
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

type CommunityIncomeView = 'home' | 'community';

type CommunityIncomeOptions = {
    view: CommunityIncomeView;
    signal?: AbortSignal;
};

const PUBLIC_INCOME_STATUSES = new Set([
    'approved',
    'public',
    'published',
    'visible',
    '승인',
    '공개',
]);

function isPublicRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function owns(record: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value;
    }
    return '';
}

function isFalseFlag(value: unknown): boolean {
    if (value === false || value === 0) return true;
    if (typeof value !== 'string') return false;
    return ['false', '0', 'no', 'n'].includes(value.trim().toLocaleLowerCase());
}

function isTruePublicFlag(value: unknown): boolean {
    if (value === true || value === 1) return true;
    if (typeof value !== 'string') return false;
    return ['true', '1', 'yes', 'y', 'approved', 'public', 'published', 'visible', '승인', '공개'].includes(value.trim().toLocaleLowerCase());
}

function isPublicIncomeRecord(record: Record<string, unknown>): boolean {
    // The public income-list route is the server-side approved projection and
    // intentionally strips moderation columns. If a row does carry moderation
    // fields, treat every unknown or non-public value as private.
    if (owns(record, 'status')) {
        const status = typeof record.status === 'string' ? record.status.trim().toLocaleLowerCase() : '';
        if (!PUBLIC_INCOME_STATUSES.has(status)) return false;
    }

    const hiddenFlags = ['hidden', 'isHidden', 'private', 'isPrivate', 'deleted', 'isDeleted'];
    if (hiddenFlags.some((key) => owns(record, key) && !isFalseFlag(record[key]))) return false;

    const publicFlags = ['approved', 'isApproved', 'visible', 'isVisible', 'public', 'isPublic', 'published', 'isPublished'];
    if (publicFlags.some((key) => owns(record, key) && !isTruePublicFlag(record[key]))) return false;
    return true;
}

function normalizeIncomeTags(value: unknown): string[] {
    const candidates = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(',')
            : [];
    const tags: string[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        const tag = maskContactText(cleanPublicText(candidate, 40));
        const key = tag.toLocaleLowerCase('ko-KR');
        if (!tag || seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
        if (tags.length >= 10) break;
    }
    return tags;
}

function inferIncomeMediaType(record: Record<string, unknown>, media: string): 'image' | 'video' {
    const declared = firstString(record, ['mediaType', 'proofMediaType', 'type']).trim().toLocaleLowerCase();
    if (declared.startsWith('video') || media.toLocaleLowerCase().startsWith('data:video/')) return 'video';
    const pathname = media.split(/[?#]/, 1)[0]?.toLocaleLowerCase() || '';
    return /\.(?:mp4|webm|ogv|ogg|mov|m4v)$/.test(pathname) ? 'video' : 'image';
}

function normalizeIncomeMedia(
    record: Record<string, unknown>,
    view: CommunityIncomeView,
): Pick<CommunityIncomeProof, 'media' | 'mediaType' | 'mediaName'> {
    const media = firstString(record, [
        'proofMedia',
        'media',
        'mediaUrl',
        'proofImage',
        'image',
        'imageUrl',
        'video',
        'videoUrl',
        'thumbnailUrl',
        'thumbnail',
    ]).trim();
    if (!media || /[\u0000-\u001f\u007f]/.test(media)) return {};

    const lower = media.toLocaleLowerCase();
    if (lower.startsWith('data:')) {
        if (view === 'home' || media.length > COMMUNITY_INCOME_DATA_MEDIA_MAX_CHARS) return {};
        const match = /^data:(image\/(?:png|jpe?g|webp|gif|avif)|video\/(?:mp4|webm|ogg|quicktime));base64,/i.exec(media);
        if (!match) return {};
        return {
            media,
            mediaType: match[1]?.toLocaleLowerCase().startsWith('video/') ? 'video' : 'image',
            mediaName: maskContactText(cleanPublicText(firstString(record, ['mediaName', 'imageName', 'fileName']), 120)) || undefined,
        };
    }

    let safeUrl = false;
    if (media.startsWith('/') && !media.startsWith('//') && !media.includes('\\') && media.length <= 4096) {
        safeUrl = true;
    } else if (media.length <= 4096) {
        try {
            const parsed = new URL(media);
            const hostname = parsed.hostname.toLocaleLowerCase();
            const trustedHost = hostname === 'leaderspro.kr'
                || hostname === 'www.leaderspro.kr'
                || hostname === '141.164.59.17.sslip.io'
                || hostname === 'script.googleusercontent.com'
                || hostname.endsWith('.googleusercontent.com');
            safeUrl = parsed.protocol === 'https:' && !parsed.username && !parsed.password && trustedHost;
        } catch {
            safeUrl = false;
        }
    }
    if (!safeUrl) return {};
    return {
        media,
        mediaType: inferIncomeMediaType(record, media),
        mediaName: maskContactText(cleanPublicText(firstString(record, ['mediaName', 'imageName', 'fileName']), 120)) || undefined,
    };
}

function hashIncomeProofId(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

function stableIncomeProofId(record: Record<string, unknown>, fingerprint: string): string {
    const candidate = cleanPublicText(firstString(record, ['id', 'proofId', 'incomeId']), 100);
    const identity = candidate || fingerprint;
    return `income-${hashIncomeProofId(identity)}`;
}

function isSeedIncomeRecord(record: Record<string, unknown>): boolean {
    const id = cleanPublicText(firstString(record, ['id', 'proofId', 'incomeId']), 100);
    return /^I-seed-\d+$/i.test(id);
}

function normalizeCommunityIncomeProof(
    value: unknown,
    view: CommunityIncomeView,
): CommunityIncomeProof | null {
    if (!isPublicRecord(value) || !isPublicIncomeRecord(value)) return null;
    if (isSeedIncomeRecord(value)) return null;

    const rawAmount = maskContactText(cleanPublicText(firstString(value, ['amount', 'title']), 100));
    const author = maskContactText(cleanPublicText(firstString(value, ['author', 'name', 'nickname']), 80)) || '익명';
    const date = maskContactText(cleanPublicText(firstString(value, ['date', 'publishedAt', 'approvedAt', 'timestamp', 'createdAt']), 40));
    const desc = maskContactText(cleanPublicMultilineText(firstString(value, ['desc', 'detail', 'reviewText', 'text']), 1600));
    const tags = normalizeIncomeTags(value.tags);
    const media = normalizeIncomeMedia(value, view);
    if (!rawAmount && !desc && !media.media) return null;

    const amount = rawAmount || '수익 인증';
    const fingerprint = [
        amount,
        author,
        date,
        desc,
        firstString(value, ['publishedAt', 'approvedAt', 'timestamp', 'createdAt']),
        media.media ? `${media.media.length}:${media.media.slice(0, 128)}:${media.media.slice(-128)}` : '',
    ].join('\u001f');
    return {
        id: stableIncomeProofId(value, fingerprint),
        amount,
        author,
        date,
        desc: desc || '수익인증 자료를 등록했습니다.',
        tags,
        ...media,
    };
}

function normalizeCommunityIncomeProofs(
    values: unknown[],
    limit: number,
    view: CommunityIncomeView,
): CommunityIncomeProof[] {
    const items: CommunityIncomeProof[] = [];
    const ids = new Set<string>();
    for (const value of values) {
        const item = normalizeCommunityIncomeProof(value, view);
        if (!item || ids.has(item.id)) continue;
        ids.add(item.id);
        items.push(item);
        if (items.length >= limit) break;
    }
    return items;
}

function normalizeCommunityIncomeLimit(limit: number, view: CommunityIncomeView): number {
    const fallback = view === 'home' ? 3 : 80;
    const maximum = view === 'home' ? 12 : 80;
    const parsed = Number.isFinite(limit) ? Math.floor(limit) : fallback;
    return Math.max(1, Math.min(maximum, parsed || fallback));
}

function cacheableIncomeProof(item: CommunityIncomeProof): CommunityIncomeProof {
    const cached: CommunityIncomeProof = {
        id: item.id,
        amount: item.amount,
        author: item.author,
        date: item.date,
        desc: item.desc,
        tags: item.tags.slice(0, 10),
    };
    if (item.media && !item.media.toLocaleLowerCase().startsWith('data:')) {
        cached.media = item.media;
        cached.mediaType = item.mediaType;
        if (item.mediaName) cached.mediaName = item.mediaName;
    }
    return cached;
}

function communityIncomeCacheKey(view: CommunityIncomeView): string {
    return view === 'home' ? COMMUNITY_INCOME_CACHE_KEY : COMMUNITY_INCOME_WIDE_CACHE_KEY;
}

function writeCommunityIncomeCache(items: CommunityIncomeProof[], view: CommunityIncomeView): void {
    try {
        localStorage.setItem(communityIncomeCacheKey(view), JSON.stringify({
            savedAt: Date.now(),
            items: items.map(cacheableIncomeProof),
        }));
    } catch {
        // Public rendering must not depend on optional cache storage.
    }
}

function readCommunityIncomeCache(limit: number, view: CommunityIncomeView): CommunityIncomeProof[] | null {
    try {
        const parsed = JSON.parse(localStorage.getItem(communityIncomeCacheKey(view)) || 'null') as unknown;
        if (!isPublicRecord(parsed) || typeof parsed.savedAt !== 'number' || !Array.isArray(parsed.items)) return null;
        const age = Date.now() - parsed.savedAt;
        if (age < 0 || age > COMMUNITY_INCOME_CACHE_TTL_MS) return null;
        return normalizeCommunityIncomeProofs(parsed.items, limit, view);
    } catch {
        return null;
    }
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
    const contentLength = Number(response.headers?.get('content-length') || '');
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw new Error('community income response exceeds the home payload limit');
    }
    if (!response.body) {
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > maxBytes) {
            throw new Error('community income response exceeds the home payload limit');
        }
        return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > maxBytes) {
                await reader.cancel().catch(() => undefined);
                throw new Error('community income response exceeds the home payload limit');
            }
            text += decoder.decode(chunk.value, { stream: true });
        }
        return text + decoder.decode();
    } finally {
        reader.releaseLock();
    }
}

function incomeFallback(limit: number, view: CommunityIncomeView): CommunityIncomeProofResult {
    const cached = readCommunityIncomeCache(limit, view);
    return cached === null
        ? { items: [], source: 'unavailable' }
        : { items: cached, source: 'cache' };
}

export async function fetchCommunityIncomeProofs(
    limit = 3,
    options: CommunityIncomeOptions = { view: 'home' },
): Promise<CommunityIncomeProofResult> {
    const view = options.view === 'community' ? 'community' : 'home';
    const safeLimit = normalizeCommunityIncomeLimit(limit, view);
    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener('abort', relayAbort, { once: true });
    const timeout = window.setTimeout(() => controller.abort(), COMMUNITY_INCOME_TIMEOUT_MS);

    try {
        if (controller.signal.aborted) throw new Error('community income request aborted');
        const url = view === 'home'
            ? `${GAS_URL}?action=income-list&view=home&limit=${safeLimit}`
            : `${GAS_URL}?action=income-list&view=community&limit=${safeLimit}`;
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('community income request failed');
        const maxResponseBytes = view === 'home'
            ? HOME_INCOME_RESPONSE_MAX_BYTES
            : COMMUNITY_INCOME_RESPONSE_MAX_BYTES;
        const payload = JSON.parse(await readBoundedResponseText(response, maxResponseBytes)) as unknown;
        if (!isPublicRecord(payload)
            || (payload.success !== true && payload.ok !== true)
            || !Array.isArray(payload.income)) {
            throw new Error('community income response is invalid');
        }
        const items = normalizeCommunityIncomeProofs(payload.income, safeLimit, view);
        writeCommunityIncomeCache(items, view);
        return { items, source: 'live' };
    } catch {
        return incomeFallback(safeLimit, view);
    } finally {
        window.clearTimeout(timeout);
        options.signal?.removeEventListener('abort', relayAbort);
    }
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
