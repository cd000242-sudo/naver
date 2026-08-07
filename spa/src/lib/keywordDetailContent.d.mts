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
    /** '2026년 7월 16일 기준' — 이 수치를 언제 실측했는지. 없으면 빈 문자열. */
    measuredAt: string;
}

export declare function keywordSlug(keyword: string): string;
/** 상세 페이지가 빌드되는 키워드인지. 링크 생성도 이 게이트를 따라야 404 가 안 생긴다. */
export declare function isEvergreenKeyword(keyword: string): boolean;
export declare function measuredAtLabel(publishedAt?: string | null): string;
export declare function buildKeywordDetail(row: KeywordSeedRow, allRows: KeywordSeedRow[], publishedAt?: string | null): KeywordDetail;
export declare const numberFormat: Intl.NumberFormat;
