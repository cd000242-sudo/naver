export interface AdsenseSource { id: string; name: string; grade: string; category: string; title: string; url: string; publishedAt: string | null }
export interface AdsenseCard {
  id: string; keyword: string; title: string; category: string; grade: string; recommended: boolean; priority: number;
  publishedAt: string | null; capturedAt: string; why: string[];
  metrics: { query?: string | null; searchVolume: number | null; documentCount: number | null; bid: number | null; measuredAt?: string };
  titles: string[]; sources: AdsenseSource[];
  /** titles 와 같은 순서 — 그 제목이 고수 제목보다 나은 점(같은 채점표로 가장 높은 고수 제목을 넘은 것만 실린다). */
  titleEdges?: string[]; masterBest?: number;
}
export interface AdsenseTitleShape { count: number; lengthMedian: number | null; yearPct: number | null; numberPct: number | null; questionPct: number | null; bracketPct: number | null }
export interface AdsenseBoard {
  schemaVersion: number; scope: string; attemptedAt: string; generatedAt: string | null; status: string; windowDays: number;
  sourceCount: number; okCount: number; collectedPostCount: number;
  sources: Array<{ id: string; name: string; category: string; grade: string; status: string; postCount: number; error?: string }>;
  candidates: AdsenseCard[];
  trends: { categories: Array<{ category: string; posts: number; blogs: number }>; titleShape: AdsenseTitleShape };
}
export function blogCount(card: AdsenseCard): number;
export function filterAdsenseCards(cards: AdsenseCard[], opts?: { mode?: 'all' | 'star'; category?: string; query?: string }): AdsenseCard[];
export function adsenseCategories(cards: AdsenseCard[]): Array<{ category: string; count: number }>;
export function adsenseWritingAdvice(shape: AdsenseTitleShape | null | undefined): string[];
