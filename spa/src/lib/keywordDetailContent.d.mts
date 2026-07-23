/** keywordDetailContent.mjs 타입 선언 — 빌드 스크립트(node)와 React 가 같은 구현을 공유한다. */

export interface KeywordSeedRow {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    opportunity: number;
}

export interface KeywordDetail {
    keyword: string;
    slug: string;
    subject: string;
    volume: number | null;
    documents: number | null;
    opportunity: number | null;
    meaning: string;
    competition: string;
    outline: string[];
    related: KeywordSeedRow[];
    metaDescription: string;
}

export declare function keywordSlug(keyword: string): string;
export declare function buildKeywordDetail(row: KeywordSeedRow, allRows: KeywordSeedRow[]): KeywordDetail;
export declare const numberFormat: Intl.NumberFormat;
