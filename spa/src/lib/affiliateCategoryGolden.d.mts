import type { AffiliateGolden, AffiliateCategorySummary } from './affiliateGolden.mjs';

export interface CategoryGoldenKeyword extends AffiliateGolden { keyword: string; seed: string; category: string }
export interface CategoryGolden { builtAt: string; byCategory: Map<string, CategoryGoldenKeyword[]> }
export interface MergedCategorySummary extends AffiliateCategorySummary { keywords: number }

export function parseCategoryGolden(store: unknown): CategoryGolden;
export function categoryGoldenTop(byCategory: Map<string, CategoryGoldenKeyword[]>, category: string, limit: number): CategoryGoldenKeyword[];
export function mergeCategorySummary(summary: AffiliateCategorySummary[], byCategory: Map<string, CategoryGoldenKeyword[]>): MergedCategorySummary[];
/** 대표어를 뺀 나머지 말이 내 제휴 상품 이름에 있으면 그 상품 이름, 없으면 null. */
export function matchOwnProduct(keyword: string, seed: string, productNames: string[]): string | null;
export function loadCategoryGolden(fetcher?: typeof fetch): Promise<CategoryGolden>;
