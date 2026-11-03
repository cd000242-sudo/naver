import { describe, expect, it } from 'vitest';
import { selectDailySourceDocuments } from '../main/services/dailyPublishingDiscovery.js';
import type { SourceDocument } from '../content/sourceDocument.js';
const sample = (change = {}): SourceDocument => ({ id: 'one', title: '구단의 공식 새 발표', url: 'https://news.example.com/article/123', sourceType: 'news', sourceTier: 'NEWS', dateStatus: 'KNOWN', pubDate: '2026-10-20', body: '내용'.repeat(500), ...change });
const now = new Date('2026-10-20T09:00:00Z');
describe('daily publishing discovery', () => {
  it('selects recent dated official or news material and removes repeated URL aliases', () => {
    const docs = [sample({ pubDate: '2026-10-18', url: 'https://official.example.com/report' }), sample(), sample({ url: sample().url + '?utm_source=tracker' })];
    expect(selectDailySourceDocuments(docs, now).map(s => s.value)).toEqual([sample().url, 'https://official.example.com/report']);
  });
  it.each([{ pubDate: '2026-10-21' }, { pubDate: '2026-10-10' }, { dateStatus: 'UNKNOWN_DATE' }, { sourceTier: 'BLOG' },
    { body: '' }, { stale: true }, { relevance: { accepted: false } }, { url: 'https://127.0.0.1/private' }, { url: 'https://app.local/private' }, { url: 'http://news.example.com/article' }])('rejects unsafe or unverified material %j', change => {
    expect(selectDailySourceDocuments([sample(change)], now)).toEqual([]);
  });
});
