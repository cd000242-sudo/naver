export const FEED_PAGE_SIZE: number;
export type FeedVerdict = 'use' | 'unsupported' | 'fatal' | 'retry-legacy';
export type FeedConfig = {
    boards: Array<{ id: string; label?: string; writeRole?: 'member' | 'operator'; dailyLimit?: number; statuses?: string[]; defaultStatus?: string }>;
    reportReasons: Array<{ key: string; label: string }>;
};
export function judgeFeedReply(result: unknown): FeedVerdict;
export function pickCounts(raw: unknown): Record<string, number>;
export function pickConfig(result: unknown): FeedConfig | null;
export function userTag(userId: string): string;
export function feedViewKey(view: { board: string; sort: string; page: number }): string;
