import type { SourceDocument } from '../../content/sourceDocument.js';
import type { DailySource } from './dailyPublishingExecutor.js';

/** Source eligibility is separate from editorial interest; freshness never implies selection. */
export function selectDailySourceDocuments(documents: SourceDocument[], now = new Date()): DailySource[] {
  const today = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const oldest = new Date(new Date(today + 'T00:00:00Z').getTime() - 2 * 86400_000).toISOString().slice(0, 10);
  const seen = new Set<string>();
  return documents.filter(doc => {
    if (!doc || !['OFFICIAL', 'NEWS'].includes(doc.sourceTier) || doc.dateStatus !== 'KNOWN'
      || !doc.pubDate || doc.pubDate < oldest || doc.pubDate > today || !/^\d{4}-\d{2}-\d{2}$/.test(doc.pubDate)
      || doc.relevance?.accepted === false || doc.stale || String(doc.cleanedBody || doc.body || '').trim().length < 800) return false;
    try {
      const url = new URL(doc.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.port
        || !/^[a-z\d.-]+\.[a-z]{2,}$/i.test(url.hostname)
        || /(?:^|\.)(?:localhost|local|internal|lan|test)$/i.test(url.hostname)) return false;
      url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
      if (seen.has(url.href)) return false; seen.add(url.href); return true;
    } catch { return false; }
  }).sort((a, b) => b.pubDate!.localeCompare(a.pubDate!)).map(doc => ({ type: 'url', value: doc.url,
    identity: String(doc.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') }));
}
