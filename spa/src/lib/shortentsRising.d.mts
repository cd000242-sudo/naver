export type ShortentsStatus = 'new' | 'rising' | 'steady' | 'falling';
export interface ShortentsTopic {
  keyword: string;
  category: string;
  summary: string;
  title: string;
  channel: string;
  articleUrl: string | null;
  searchUrl: string | null;
  rank: number | null;
  prevRank: number | null;
  rankDelta: number | null;
  isNew: boolean;
  firstSeenAt: string | null;
  windowsSeen: number | null;
  streak: number | null;
  status: ShortentsStatus;
  docs: number | null;
  docsMeasuredAt: string | null;
}
export interface ShortentsRising {
  builtAt: string | null;
  latest: { publishTime: string | null; periodStart: string | null; periodEnd: string | null } | null;
  windows: number | null;
  topics: ShortentsTopic[];
}
export const STALE_MINUTES: number;
export function parseShortentsRising(raw: unknown): ShortentsRising;
export function loadShortentsRising(fetcher?: typeof fetch): Promise<ShortentsRising>;
export function freshness(builtAt: string | null | undefined, now?: Date | number): { minutes: number | null; stale: boolean };
export function groupByCategory(topics: ShortentsTopic[]): Array<{ category: string; topics: ShortentsTopic[] }>;
