export interface AffiliateGolden { query: string; volume: number | null; docs: number | null; ratio: number | null }
export interface AffiliateCategorySummary { category: string; count: number; top: AffiliateGolden | null }

export const AFFILIATE_GOLDEN_MIN_VOLUME: number;
export const AFFILIATE_CATEGORIES: string[];
export function goldenOf(item?: object, recommendation?: { query?: string; demand?: { monthlySearches?: number | null }; competition?: { documentCount?: number | null } } | null): AffiliateGolden;
export function compareGolden(a: AffiliateGolden, b: AffiliateGolden): number;
export function affiliateCategory(item?: { name?: string; shoppingCategory?: string | number; source?: string }): string;
export function summarizeCategories(entries: Array<{ category: string; golden: AffiliateGolden }>): AffiliateCategorySummary[];
