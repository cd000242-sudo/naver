export const FEED_PAGE_SIZE: number;
export type FeedVerdict = 'use' | 'unsupported' | 'fatal' | 'retry-legacy';
export type FeedConfig = {
    boards: Array<{ id: string; label?: string; writeRole?: 'member' | 'operator' | 'admin'; dailyLimit?: number; statuses?: string[]; defaultStatus?: string }>;
    reportReasons: Array<{ key: string; label: string }>;
    grades: Array<{ key: string; label: string; min: number; reward: { days: number; mode: 'auto' | 'approval' } | null; extra?: { likesMin: number; topsMin: number; topLikesMin: number } }>;
    scoreRules: { post: number; comment: number; visit: number; likeReceived: number; dailyCap: number } | null;
};
export function judgeFeedReply(result: unknown): FeedVerdict;
export function pickCounts(raw: unknown): Record<string, number>;
export function pickConfig(result: unknown): FeedConfig | null;
export function isInvalidBoardReply(result: unknown): boolean;
export function answerKnowsNotice(result: unknown): boolean;
export function countsForOldServer(counts: Record<string, number> | null | undefined): Record<string, number>;
export type NewsSide<T> = { posts: T[]; pinned: T[]; total: number };
export function splitNewsReplies<T>(pages: ReadonlyArray<{ posts?: T[]; pinned?: T[] } | null | undefined>): { notice: NewsSide<T>; news: NewsSide<T> };
export function userTag(userId: string): string;
export function feedViewKey(view: { board: string; sort: string; page: number; platform?: string }): string;
