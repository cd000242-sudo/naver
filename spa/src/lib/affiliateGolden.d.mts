export interface AffiliateGolden {
  query: string; volume: number | null; docs: number | null;
  /** 검색량 ÷ 문서수 */ ratio: number | null;
  /** 문서수 ÷ 검색량 — 낮을수록 좋다 */ docRatio: number | null;
  grade: 'S' | 'A' | 'B' | null; golden: boolean;
}
export interface AffiliateCategorySummary { category: string; count: number; top: AffiliateGolden | null }

export const AFFILIATE_GOLDEN_MIN_VOLUME: number;
export const AFFILIATE_CATEGORIES: string[];
export function goldenOf(item?: object, recommendation?: { query?: string; demand?: { monthlySearches?: number | null }; competition?: { documentCount?: number | null } } | null): AffiliateGolden;
export function compareGolden(a: AffiliateGolden, b: AffiliateGolden): number;
export function affiliateCategory(item?: { name?: string; shoppingCategory?: string | number; source?: string }): string;
export function summarizeCategories(entries: Array<{ category: string; golden: AffiliateGolden }>): AffiliateCategorySummary[];
