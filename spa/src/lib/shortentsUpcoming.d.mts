export interface UpcomingSample {
  title: string;
  press: string | null;
  publishedAt: string | null;
  link: string | null;
}
export interface UpcomingCandidate {
  keyword: string;
  sources: string[];
  articles90: number | null;
  recent20: number | null;
  press: number | null;
  firstArticleAt: string | null;
  exclusive: boolean;
  capped: boolean;
  samples: UpcomingSample[];
}
export interface UpcomingHitRate {
  days: number;
  flagged: number;
  matched: number;
  avgLeadMin: number | null;
  recent: Array<{ keyword: string; hitKeyword: string; hitAt: string | null; leadMin: number | null }>;
}
export interface ShortentsUpcoming {
  builtAt: string | null;
  measured: number | null;
  rule: { windowMin: number | null; recentMin: number | null; minArticles: number | null; minPress: number | null } | null;
  candidates: UpcomingCandidate[];
  hitRate: UpcomingHitRate | null;
}
export const UPCOMING_STALE_MINUTES: number;
export function parseShortentsUpcoming(raw: unknown): ShortentsUpcoming;
export function loadShortentsUpcoming(fetcher?: typeof fetch): Promise<ShortentsUpcoming>;
export function upcomingFreshness(builtAt: string | null | undefined, now?: Date | number): { minutes: number | null; stale: boolean };
