import { normalizeKeywordBriefing } from './homeKeywordBriefing';
import type { HomeKeywordBriefingResult } from './siteOps';

/**
 * Last golden-keyword briefing the visitor received, kept so the home page can draw the card
 * stack at once on the next visit. It is real published data (never invented) and is replaced
 * quietly as soon as the live answer arrives. Reads are validated: a damaged entry is ignored.
 */
const CACHE_KEY = 'leaderspro.homeKeywordBriefing.cache.v1';

export function readCachedHomeBriefing(): HomeKeywordBriefingResult | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { briefing?: unknown; source?: unknown } | null;
        const briefing = normalizeKeywordBriefing(parsed?.briefing);
        if (!briefing || briefing.rows.length === 0) return null;
        return { briefing, source: parsed?.source === 'saved' ? 'saved' : 'seed' };
    } catch {
        return null;
    }
}

export function writeCachedHomeBriefing(result: HomeKeywordBriefingResult): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), briefing: result.briefing, source: result.source }));
    } catch {
        // Rendering must never depend on a cache write (private mode, full storage).
    }
}
