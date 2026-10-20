import type { AdsenseDemand } from './adsenseBenchmarkModel.mjs';

export interface KeywordEnrich {
  query: string;
  demand?: AdsenseDemand;
  measure?: { searchVolume: number | null; documentCount: number | null };
  kinQuestions: Array<{ title: string; link: string; views: number | null; answers: number | null; askedAt: string }>;
  solves: string[];
  actionTitles: string[];
}
export function enrichKey(query: string): string;
export function parseKeywordEnrich(store: unknown): Map<string, KeywordEnrich>;
export function isHotEnrich(entry: KeywordEnrich | undefined | null): boolean;
export function seasonalOrderTier(entry: KeywordEnrich | undefined | null, planningPriority: boolean): number;
export function loadKeywordEnrich(fetcher?: typeof fetch): Promise<Map<string, KeywordEnrich>>;
