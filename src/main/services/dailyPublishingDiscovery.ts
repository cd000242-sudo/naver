import type { AppConfig } from '../../configManager.js';
import type { DailySource } from './dailyPublishingExecutor.js';
import { selectDailyHomefeedTopics, type DailyEditorialOptions } from './dailyHomefeedEditorial.js';
export { selectDailySourceDocuments } from './dailyPublishingSourceFilter.js';

/**
 * Related searches for a used-up keyword: its autocomplete, then the autocomplete of its top three suggestions
 * (real queries people type, free, no key). The keyword itself and repeats are left out; claims stop reuse.
 */
export async function expandDailyKeywords(keyword: string, suggest: (keyword: string) => Promise<string[]>, limit = 30): Promise<string[]> {
  const key = (value: string) => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ko-KR');
  const seen = new Set([key(keyword)]);
  const found: string[] = [];
  const add = (list: readonly string[]) => {
    for (const raw of list) {
      const value = String(raw || '').replace(/\s+/gu, ' ').trim();
      if (value && !seen.has(key(value))) { seen.add(key(value)); found.push(value); }
    }
  };
  const first = await suggest(keyword).catch(() => [] as string[]);
  add(first);
  for (const next of first.slice(0, 3)) {
    if (found.length >= limit) break;
    add(await suggest(next).catch(() => [] as string[]));
  }
  return found.slice(0, limit);
}

/** Reuse the configured search path; do not invent a trend or silently enable paid grounding. */
export async function discoverDailySources(topic: string, config: AppConfig, options: Omit<DailyEditorialOptions, 'topic'> & { contentMode?: string } = {}): Promise<DailySource[]> {
  if (options.signal?.aborted) throw new Error('DAILY_CANCELLED');
  const homefeed = !options.contentMode || options.contentMode === 'homefeed';
  // [2026-10-29] Search (seo) and mate posts answer what people type: the keyword itself is the source, and the
  //   keyword generation path gathers its own material. Turning it into a 2-day news URL dropped the keyword
  //   from the post and failed every day the keyword had no fresh news.
  if (!homefeed) return topic.trim() ? [{ type: 'keyword', value: topic.trim() }] : [];
  if (!options.complete) throw new Error('DAILY_EDITORIAL_ENGINE_REQUIRED: 선택한 작성 엔진이 없어 소재 심층 검토를 보류합니다.');
  const { collectKeywordMaterials } = await import('../../content/generationSourceBuilder.js');
  const now = options.now || new Date();
  const targetDate = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const collected = await collectKeywordMaterials(topic, config, { maxPerSource: 10, targetDate });
  if (options.signal?.aborted) throw new Error('DAILY_CANCELLED');
  if (!collected.success || !Array.isArray(collected.sourceDocuments)) return [];
  return selectDailyHomefeedTopics(collected.sourceDocuments, { ...options, topic, now });
}
