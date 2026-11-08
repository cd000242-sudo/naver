export const TOP_MAX: number;
export type TopLayout = 'wide' | 'narrow';
export type TopRanked<T> = T & { rank: number };
export type TopCell<T> = { item: TopRanked<T>; rank: number; zone: 'hero' | 'card'; col: number; row: number; colSpan: number; rowSpan: number };
export function orderTop<T extends { id: string; rank?: number }>(items: readonly (T | null | undefined)[] | null | undefined): Array<TopRanked<T>>;
export function placeTopGrid<T extends { id: string; rank?: number }>(items: readonly (T | null | undefined)[] | null | undefined, layout: TopLayout | string): {
    cards: Array<TopCell<T>>;
    list: Array<{ item: TopRanked<T>; rank: number }>;
    columns: number;
};
export function topLayoutFor(width: number | undefined): TopLayout;
export function rankBadge(rank: unknown): 'gold' | 'silver' | 'bronze' | 'plain';
export type BoardTone = 'notice' | 'news' | 'request' | 'inquiry' | 'free' | 'promo' | 'other';
export function boardTone(boardId: unknown): BoardTone;
