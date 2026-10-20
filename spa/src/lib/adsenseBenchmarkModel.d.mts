export interface AdsenseSource { id: string; name: string; grade: string; category: string; title: string; url: string; publishedAt: string | null; platform?: string }
/** 지금 쓰면 트래픽이 오나(2026-10-20, 앱 레포 adsense-benchmarks-trend.cjs — 데이터랩 주별 실측). */
export interface AdsenseDemand { verdict: 'new' | 'rising' | 'season-soon' | 'steady' | 'cooling' | 'past-peak' | 'unknown'; label: string; fact: string; recentChangePct: number | null; lastYearNextPct: number | null; series: number[]; asOf: string | null }
export interface AdsenseCard {
  id: string; keyword: string; title: string; category: string; grade: string; recommended: boolean; priority: number;
  publishedAt: string | null; capturedAt: string; why: string[];
  metrics: { query?: string | null; searchVolume: number | null; documentCount: number | null; bid: number | null; measuredAt?: string };
  titles: string[]; sources: AdsenseSource[];
  /** titles 와 같은 순서 — 그 제목이 고수 제목보다 나은 점(같은 채점표로 가장 높은 고수 제목을 넘은 것만 실린다). */
  titleEdges?: string[]; masterBest?: number;
  /** 작성 안내(2026-10-13, 앱 레포 adsense-guides.yml → /data/adsense-benchmark-guides.json 을 화면이 합친다). 없으면 칸을 안 그린다. */
  writingDirection?: string; searchTargets?: string[]; mustInclude?: string[]; mustAvoid?: string[]; verificationNeeded?: string[];
  demand?: AdsenseDemand;
  /** 작성 안내 새 칸(2026-10-20): 이 글이 해결할 문제 · 행동 키워드 제목 · 지식인 질문. */
  solves?: string[]; actionTitles?: string[];
  kinQuestions?: Array<{ title: string; link: string; views: number | null; answers: number | null; askedAt: string }>;
}
export interface AdsenseTitleShape { count: number; lengthMedian: number | null; yearPct: number | null; numberPct: number | null; questionPct: number | null; bracketPct: number | null }
export interface AdsenseBoard {
  schemaVersion: number; scope: string; attemptedAt: string; generatedAt: string | null; status: string; windowDays: number;
  sourceCount: number; okCount: number; collectedPostCount: number;
  sources: Array<{ id: string; name: string; category: string; grade: string; status: string; postCount: number; error?: string; platform?: string }>;
  candidates: AdsenseCard[];
  trends: { categories: Array<{ category: string; posts: number; blogs: number }>; titleShape: AdsenseTitleShape };
}
export function blogCount(card: AdsenseCard): number;
export function filterAdsenseCards(cards: AdsenseCard[], opts?: { mode?: 'all' | 'star' | 'low'; category?: string; query?: string; platform?: string; nowMs?: number }): AdsenseCard[];
export function adsenseCategories(cards: AdsenseCard[]): Array<{ category: string; count: number }>;
export function adsenseWritingAdvice(shape: AdsenseTitleShape | null | undefined, cards?: AdsenseCard[]): string[];

export interface AdsenseCompetition { tier: number; ratio: number | null; label: string }
export function adsenseCompetition(card: AdsenseCard, nowMs?: number): AdsenseCompetition;
export function rankAdsenseCards(cards: AdsenseCard[], nowMs?: number): AdsenseCard[];

export type AdsensePlatformKey = 'wordpress' | 'tistory' | 'blogspot';
export const ADSENSE_PLATFORMS: ReadonlyArray<{ key: AdsensePlatformKey; label: string; note: string }>;
export function cardPlatforms(card: AdsenseCard): Set<string>;
export function adsenseOrderTier(card: AdsenseCard, nowMs?: number): number;
export function shuffleAdsenseCards(cards: AdsenseCard[], nowMs?: number, seed?: number): AdsenseCard[];
export function adsenseNowPicks(cards: AdsenseCard[], nowMs?: number, limit?: number): AdsenseCard[];
